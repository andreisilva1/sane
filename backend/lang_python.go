package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// findVenv searches projectDir for a virtual-environment Python interpreter.
// Returns the interpreter path and a short label for the UI.
func findVenv(projectDir string) (python, label string) {
	names := []string{"venv", ".venv", "env"}
	for _, name := range names {
		var interp string
		if runtime.GOOS == "windows" {
			interp = filepath.Join(projectDir, name, "Scripts", "python.exe")
		} else {
			interp = filepath.Join(projectDir, name, "bin", "python")
		}
		if _, err := os.Stat(interp); err == nil {
			return interp, name
		}
	}
	return "python", "global"
}

func servePyEnv(w http.ResponseWriter, r *http.Request) {
	root := r.URL.Query().Get("root")
	if root == "" {
		http.Error(w, "root required", http.StatusBadRequest)
		return
	}
	python, label := findVenv(root)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"python": python, "venv": label})
}

func buildPythonCmd(_ context.Context, body runBody, _ func(kind, text string)) (*exec.Cmd, string, error) {
	projectDir := body.Root
	if projectDir == "" {
		projectDir = filepath.Dir(body.Path)
	}
	python, label := findVenv(projectDir)
	// -u: unbuffered stdout/stderr so input() prompts arrive immediately.
	// Plain exec.Command (not CommandContext) so the process is NOT killed by an
	// HTTP context cancellation mid-run. streamRunCmd handles termination instead.
	cmd := noConsole(exec.Command(python, "-u", body.Path))
	cmd.Dir = filepath.Dir(body.Path)
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
	return cmd, label, nil
}

// ── Execution Tracer ──────────────────────────────────────

const tracerScript = `
import sys, json, io, os, traceback as _tb

MAX_STEPS = 1500
TARGET = os.path.abspath(sys.argv[1])

_steps = []
_outbuf = io.StringIO()
_real_stdout = sys.stdout
sys.stdout = _outbuf

def _safe_repr(v):
    try:
        if isinstance(v, (bool, type(None))): return repr(v)
        if isinstance(v, (int, float)):       return repr(v)
        s = repr(v)
        return s if len(s) <= 120 else s[:117] + '…'
    except: return '<?>'

def _trace(frame, event, arg):
    if len(_steps) >= MAX_STEPS:
        sys.settrace(None)
        return None
    if event != 'line': return _trace
    if os.path.abspath(frame.f_code.co_filename) != TARGET: return _trace
    snap = {}
    for k, v in frame.f_locals.items():
        if k.startswith('_') or callable(v) or isinstance(v, type): continue
        if isinstance(v, (int, float, str, bool, list, dict, tuple, type(None))):
            snap[k] = _safe_repr(v)
    _steps.append({'n': frame.f_lineno, 'v': snap, 'o': _outbuf.getvalue()})
    return _trace

_err = None
try:
    with open(TARGET, encoding='utf-8') as f: _src = f.read()
    sys.settrace(_trace)
    exec(compile(_src, TARGET, 'exec'), {'__name__': '__main__', '__file__': TARGET})
except SystemExit: pass
except Exception: _err = _tb.format_exc()
finally:
    sys.settrace(None)
    sys.stdout = _real_stdout

print(json.dumps({
    'steps': _steps,
    'out': _outbuf.getvalue(),
    'truncated': len(_steps) >= MAX_STEPS,
    'error': _err
}))
`

func serveTrace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	tmp, err := os.CreateTemp("", "sane-trace-*.py")
	if err != nil {
		http.Error(w, "failed to create tracer: "+err.Error(), http.StatusInternalServerError)
		return
	}
	tmp.WriteString(tracerScript)
	tmp.Close()
	defer os.Remove(tmp.Name())

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	python, _ := findVenv(filepath.Dir(filePath))
	cmd := noConsole(exec.CommandContext(ctx, python, "-u", tmp.Name(), filePath))
	cmd.Dir = filepath.Dir(filePath)
	cmd.Env = append(os.Environ(), "PYTHONUTF8=1", "PYTHONIOENCODING=utf-8")

	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		http.Error(w, "trace failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(out)
}
