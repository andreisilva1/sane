package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// runBody is the JSON body for POST /run.
type runBody struct {
	Path string
	Root string
	ID   string
}

// LangRunner builds the command for running a source file.
// emit(kind, text) sends a pre-run SSE event (e.g. "error" for missing tool,
// "meta" for a compile step). Return (nil, label, err) to abort; the caller
// sends the done event with exitCode 1.
type LangRunner func(ctx context.Context, body runBody, emit func(kind, text string)) (*exec.Cmd, string, error)

// langRunners maps lowercase file extensions to their runner.
// Add a new entry here and a corresponding lang_xxx.go file to support a new language.
var langRunners = map[string]LangRunner{
	".py":   buildPythonCmd,
	".js":   buildJSCmd,
	".go":   buildGoCmd,
	".java": buildJavaCmd,
}

var runProcs sync.Map // id → *shellProc

func serveRunStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ ID string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	if val, ok := runProcs.Load(body.ID); ok {
		val.(*shellProc).cmd.Process.Kill()
	}
	w.WriteHeader(http.StatusNoContent)
}

func serveRunStdin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ID    string
		Input string
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	val, ok := runProcs.Load(body.ID)
	if !ok {
		http.Error(w, "process not found", http.StatusNotFound)
		return
	}
	val.(*shellProc).stdin.Write([]byte(body.Input + "\n"))
	w.WriteHeader(http.StatusNoContent)
}

// streamRunCmd wires a ready-to-start cmd to SSE events and blocks until done.
// stdout is raw chunks (preserves input() prompts); stderr is line-based.
// Returns the process exit code.
func streamRunCmd(cmd *exec.Cmd, sessID string, mu *sync.Mutex, writeEvent func(any)) int {
	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		mu.Lock(); writeEvent(map[string]any{"type": "error", "text": err.Error()}); mu.Unlock()
		return 1
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		mu.Lock(); writeEvent(map[string]any{"type": "error", "text": err.Error()}); mu.Unlock()
		return 1
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		mu.Lock(); writeEvent(map[string]any{"type": "error", "text": err.Error()}); mu.Unlock()
		return 1
	}

	if err := cmd.Start(); err != nil {
		mu.Lock(); writeEvent(map[string]any{"type": "error", "text": err.Error()}); mu.Unlock()
		return 1
	}

	if sessID != "" {
		runProcs.Store(sessID, &shellProc{cmd: cmd, stdin: stdinPipe})
		defer runProcs.Delete(sessID)
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		buf := make([]byte, 4096)
		for {
			n, err := stdoutPipe.Read(buf)
			if n > 0 {
				mu.Lock()
				writeEvent(map[string]any{"type": "stdout", "text": string(buf[:n])})
				mu.Unlock()
			}
			if err != nil {
				break
			}
		}
	}()
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(stderrPipe)
		for sc.Scan() {
			mu.Lock()
			writeEvent(map[string]any{"type": "stderr", "text": sc.Text()})
			mu.Unlock()
		}
	}()
	wg.Wait()

	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return exitErr.ExitCode()
		}
		return -1
	}
	return 0
}

func serveRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body runBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	var mu sync.Mutex
	writeEvent := func(v any) {
		data, _ := json.Marshal(v)
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	ext := strings.ToLower(filepath.Ext(body.Path))
	runner, ok := langRunners[ext]
	if !ok {
		writeEvent(map[string]any{"type": "error", "text": "Unsupported file type: " + ext})
		writeEvent(map[string]any{"type": "done", "exitCode": 1, "duration": 0})
		return
	}

	emit := func(kind, text string) {
		mu.Lock()
		writeEvent(map[string]any{"type": kind, "text": text})
		mu.Unlock()
	}

	start := time.Now()
	cmd, label, err := runner(r.Context(), body, emit)
	// Inject active .env variables into the process environment.
	if cmd != nil {
		if envVars := GetActiveEnv(); len(envVars) > 0 {
			cmd.Env = append(cmd.Env, envVars...)
		}

	}
	writeEvent(map[string]any{"type": "info", "venv": label})
	if err != nil || cmd == nil {
		writeEvent(map[string]any{"type": "done", "exitCode": 1, "duration": time.Since(start).Milliseconds()})
		return
	}

	exitCode := streamRunCmd(cmd, body.ID, &mu, writeEvent)
	writeEvent(map[string]any{
		"type":     "done",
		"exitCode": exitCode,
		"duration": time.Since(start).Milliseconds(),
	})
}
