package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"
)

// shellProc holds a running process and its stdin pipe so callers can feed input or kill it.
type shellProc struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser
}

var shellProcs sync.Map // id → *shellProc

func serveShell(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Cmd string
		Cwd string
		ID  string
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Cmd == "" {
		http.Error(w, "cmd required", http.StatusBadRequest)
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

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = noConsole(exec.CommandContext(ctx, "cmd", "/C", body.Cmd))
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", body.Cmd)
	}

	if body.Cwd != "" {
		if info, err := os.Stat(body.Cwd); err == nil && info.IsDir() {
			cmd.Dir = body.Cwd
		}
	}
	// Force UTF-8 so tools like rich/fastapi-cli don't crash on piped output.
	cmd.Env = append(os.Environ(), "PYTHONUTF8=1", "PYTHONIOENCODING=utf-8")

	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		writeEvent(map[string]any{"type": "error", "text": err.Error()})
		return
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		writeEvent(map[string]any{"type": "error", "text": err.Error()})
		return
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		writeEvent(map[string]any{"type": "error", "text": err.Error()})
		return
	}

	if err := cmd.Start(); err != nil {
		writeEvent(map[string]any{"type": "error", "text": err.Error()})
		return
	}

	if body.ID != "" {
		shellProcs.Store(body.ID, &shellProc{cmd: cmd, stdin: stdinPipe})
		defer shellProcs.Delete(body.ID)
	}

	start := time.Now()

	var wg sync.WaitGroup
	streamPipe := func(pipe io.Reader, kind string) {
		defer wg.Done()
		scanner := bufio.NewScanner(pipe)
		for scanner.Scan() {
			mu.Lock()
			writeEvent(map[string]any{"type": kind, "text": scanner.Text()})
			mu.Unlock()
		}
	}
	wg.Add(2)
	go streamPipe(stdoutPipe, "stdout")
	go streamPipe(stderrPipe, "stderr")
	wg.Wait()

	exitCode := 0
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if ctx.Err() != nil {
			exitCode = -1
		}
	}
	writeEvent(map[string]any{
		"type":     "done",
		"exitCode": exitCode,
		"duration": time.Since(start).Milliseconds(),
	})
}

func serveShellStdin(w http.ResponseWriter, r *http.Request) {
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
	val, ok := shellProcs.Load(body.ID)
	if !ok {
		http.Error(w, "process not found", http.StatusNotFound)
		return
	}
	val.(*shellProc).stdin.Write([]byte(body.Input + "\n"))
	w.WriteHeader(http.StatusNoContent)
}
