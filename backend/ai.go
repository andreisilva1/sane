package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// ── Model catalog ─────────────────────────────────────────

var catalog = []struct{ name, size string }{
	{"llama3",        "4.7 GB"},
	{"llama3.2",      "2.0 GB"},
	{"mistral",       "4.1 GB"},
	{"phi3",          "2.3 GB"},
	{"phi4",          "9.1 GB"},
	{"gemma2",        "5.4 GB"},
	{"qwen2.5-coder", "1.5 GB"},
	{"deepseek-r1",   "4.7 GB"},
}

type ModelInfo struct {
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
	Size      string `json:"size"`
}

// ── HTTP clients ──────────────────────────────────────────

var ollamaClient  = &http.Client{Timeout: 2 * time.Second}
var aiQueryClient = &http.Client{Timeout: 3 * time.Minute}
var pullClient    = &http.Client{} // no timeout — pulls take minutes

// ── Ollama runtime helpers ────────────────────────────────

func isOllamaRunning() bool {
	resp, err := ollamaClient.Get("http://localhost:11434")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return true
}

func ollamaExePath() string {
	if path, err := exec.LookPath("ollama"); err == nil {
		return path
	}
	// PATH is inherited at process launch and won't include Ollama if it was
	// installed after sane-backend started — fall back to the known install path.
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		candidate := filepath.Join(local, "Programs", "Ollama", "ollama.exe")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return ""
}

func checkOllamaCLI() bool { return ollamaExePath() != "" }

func startOllamaIfNeeded() error {
	if isOllamaRunning() {
		return nil
	}
	exe := ollamaExePath()
	if exe == "" {
		return fmt.Errorf("ollama not found")
	}
	cmd := noConsole(exec.Command(exe, "serve"))
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("cannot start ollama: %w", err)
	}
	for i := 0; i < 10; i++ {
		time.Sleep(500 * time.Millisecond)
		if isOllamaRunning() {
			return nil
		}
	}
	return fmt.Errorf("ollama started but not responding")
}

func formatSize(b int64) string {
	if b >= 1<<30 {
		return fmt.Sprintf("%.1f GB", float64(b)/float64(1<<30))
	}
	return fmt.Sprintf("%d MB", b>>20)
}

func listInstalledModels() map[string]string {
	resp, err := ollamaClient.Get("http://localhost:11434/api/tags")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	var result struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}
	m := map[string]string{}
	for _, model := range result.Models {
		base := strings.SplitN(model.Name, ":", 2)[0]
		if _, exists := m[base]; !exists {
			m[base] = formatSize(model.Size)
		}
	}
	return m
}

// ── Model list ────────────────────────────────────────────

func serveAIModels(w http.ResponseWriter, r *http.Request) {
	if err := startOllamaIfNeeded(); err != nil {
		http.Error(w, "ollama unavailable — install from https://ollama.com\n"+err.Error(), http.StatusServiceUnavailable)
		return
	}
	installed := listInstalledModels()
	inCatalog := map[string]bool{}
	var models []ModelInfo
	for _, entry := range catalog {
		inCatalog[entry.name] = true
		size, isInstalled := entry.size, false
		if actual, ok := installed[entry.name]; ok {
			size, isInstalled = actual, true
		}
		models = append(models, ModelInfo{Name: entry.name, Installed: isInstalled, Size: size})
	}
	for name, size := range installed {
		if !inCatalog[name] {
			models = append(models, ModelInfo{Name: name, Installed: true, Size: size})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models)
}

// ── Model pull with progress ──────────────────────────────

type pullState struct {
	Running   bool   `json:"running"`
	Done      bool   `json:"done"`
	Error     string `json:"error,omitempty"`
	Total     int64  `json:"total"`
	Completed int64  `json:"completed"`
	Status    string `json:"status"`
}

var pulls struct {
	sync.Mutex
	m map[string]*pullState
}

func init() { pulls.m = map[string]*pullState{} }

func doPull(name string) {
	pulls.Lock()
	st := pulls.m[name]
	pulls.Unlock()

	reqBody, _ := json.Marshal(map[string]any{"name": name, "stream": true})
	resp, err := pullClient.Post("http://localhost:11434/api/pull", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		pulls.Lock()
		st.Running, st.Done, st.Error = false, true, err.Error()
		pulls.Unlock()
		return
	}
	defer resp.Body.Close()

	type progressLine struct {
		Status    string `json:"status"`
		Total     int64  `json:"total"`
		Completed int64  `json:"completed"`
		Error     string `json:"error"`
	}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1<<20), 1<<20)
	for scanner.Scan() {
		var line progressLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			continue
		}
		pulls.Lock()
		if line.Error != "" {
			st.Error = line.Error
		}
		st.Status = line.Status
		if line.Total > 0 {
			st.Total, st.Completed = line.Total, line.Completed
		}
		pulls.Unlock()
	}
	pulls.Lock()
	st.Running, st.Done = false, true
	if st.Error == "" && scanner.Err() != nil {
		st.Error = scanner.Err().Error()
	}
	pulls.Unlock()
}

func serveAIPull(w http.ResponseWriter, r *http.Request) {
	var body struct{ Name string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	pulls.Lock()
	if st, ok := pulls.m[body.Name]; ok && st.Running {
		pulls.Unlock()
		w.WriteHeader(http.StatusAccepted)
		return
	}
	pulls.m[body.Name] = &pullState{Running: true, Status: "starting"}
	pulls.Unlock()
	go doPull(body.Name)
	w.WriteHeader(http.StatusAccepted)
}

func serveAIPullStatus(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	pulls.Lock()
	st, ok := pulls.m[name]
	var payload any
	if ok {
		cp := *st
		payload = cp
	} else {
		payload = pullState{}
	}
	pulls.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

// ── AI ask (streaming) ────────────────────────────────────

func serveAIAsk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Model  string `json:"model"`
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Model == "" || body.Prompt == "" {
		http.Error(w, "model and prompt required", http.StatusBadRequest)
		return
	}
	if err := startOllamaIfNeeded(); err != nil {
		http.Error(w, "ollama unavailable: "+err.Error(), http.StatusServiceUnavailable)
		return
	}

	numThread := int(float64(runtime.NumCPU()) * 0.65)
	if numThread < 2 {
		numThread = 2
	}
	reqBody, _ := json.Marshal(map[string]any{
		"model":  body.Model,
		"prompt": body.Prompt,
		"stream": true,
		"options": map[string]any{
			"num_ctx":     16384,
			"num_predict": -1,
			"temperature": 0.2,
			"num_thread":  numThread,
		},
	})
	resp, err := aiQueryClient.Post("http://localhost:11434/api/generate", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		http.Error(w, "ollama unavailable: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, canFlush := w.(http.Flusher)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1<<16), 1<<16)
	for scanner.Scan() {
		line := scanner.Bytes()
		fmt.Fprintf(w, "data: %s\n\n", line)
		if canFlush {
			flusher.Flush()
		}
		var chunk struct{ Done bool `json:"done"` }
		if json.Unmarshal(line, &chunk) == nil && chunk.Done {
			break
		}
	}
}

func serveAICheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"installed": checkOllamaCLI()})
}

// ── Ollama auto-install ───────────────────────────────────

var ollamaInstall struct {
	sync.Mutex
	state  string // "" | "downloading" | "installing" | "done" | "error" | "cancelled"
	pct    int
	msg    string
	cancel context.CancelFunc
}

func serveOllamaStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// HTTP ping is authoritative: sane-backend inherits PATH at launch, so
	// exec.LookPath may be stale if Ollama was installed in the same session.
	state := "not_installed"
	if isOllamaRunning() {
		state = "running"
	} else if checkOllamaCLI() {
		state = "not_running"
	}
	ollamaInstall.Lock()
	ist := ollamaInstall.state
	ollamaInstall.Unlock()
	json.NewEncoder(w).Encode(map[string]string{"state": state, "installState": ist})
}

func serveOllamaInstallStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	ollamaInstall.Lock()
	defer ollamaInstall.Unlock()
	json.NewEncoder(w).Encode(map[string]any{
		"state": ollamaInstall.state,
		"pct":   ollamaInstall.pct,
		"msg":   ollamaInstall.msg,
	})
}

func serveOllamaInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ Force bool }
	json.NewDecoder(r.Body).Decode(&body)
	if !body.Force && checkOllamaCLI() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"state": "done"})
		return
	}
	ollamaInstall.Lock()
	if ollamaInstall.state == "downloading" || ollamaInstall.state == "installing" {
		ollamaInstall.Unlock()
		w.WriteHeader(http.StatusAccepted)
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	ollamaInstall.state = "downloading"
	ollamaInstall.pct = 0
	ollamaInstall.msg = "Downloading Ollama…"
	ollamaInstall.cancel = cancel
	ollamaInstall.Unlock()
	go doInstallOllama(ctx)
	w.WriteHeader(http.StatusAccepted)
}

func serveOllamaInstallCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ollamaInstall.Lock()
	if ollamaInstall.cancel != nil {
		ollamaInstall.cancel()
		ollamaInstall.cancel = nil
	}
	ollamaInstall.state, ollamaInstall.pct, ollamaInstall.msg = "", 0, ""
	ollamaInstall.Unlock()
	w.WriteHeader(http.StatusOK)
}

func doInstallOllama(ctx context.Context) {
	tmpPath := filepath.Join(os.TempDir(), "OllamaSetup.exe")

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://ollama.ai/download/OllamaSetup.exe", nil)
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		ollamaInstall.Lock()
		ollamaInstall.state = "error"
		ollamaInstall.msg = "Download failed: " + err.Error()
		ollamaInstall.Unlock()
		return
	}
	defer resp.Body.Close()

	total := resp.ContentLength
	f, err := os.Create(tmpPath)
	if err != nil {
		ollamaInstall.Lock()
		ollamaInstall.state, ollamaInstall.msg = "error", "Cannot write temp file: "+err.Error()
		ollamaInstall.Unlock()
		return
	}

	buf := make([]byte, 32*1024)
	var downloaded int64
	for {
		if ctx.Err() != nil {
			f.Close()
			os.Remove(tmpPath)
			return
		}
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, wErr := f.Write(buf[:n]); wErr != nil {
				f.Close()
				ollamaInstall.Lock()
				ollamaInstall.state, ollamaInstall.msg = "error", "Write error: "+wErr.Error()
				ollamaInstall.Unlock()
				return
			}
			downloaded += int64(n)
			ollamaInstall.Lock()
			if total > 0 {
				ollamaInstall.pct = int(float64(downloaded) / float64(total) * 100)
				ollamaInstall.msg = fmt.Sprintf("%d%%", ollamaInstall.pct)
			} else {
				ollamaInstall.msg = fmt.Sprintf("%.0f MB", float64(downloaded)/(1<<20))
			}
			ollamaInstall.Unlock()
		}
		if readErr != nil {
			break
		}
	}
	f.Close()

	if ctx.Err() != nil {
		os.Remove(tmpPath)
		return
	}

	ollamaInstall.Lock()
	ollamaInstall.state, ollamaInstall.pct, ollamaInstall.msg = "installing", 100, "Installing Ollama…"
	ollamaInstall.Unlock()

	cmd := noConsole(exec.Command(tmpPath, "/S"))
	if err := cmd.Run(); err != nil {
		ollamaInstall.Lock()
		ollamaInstall.state, ollamaInstall.msg = "error", "Install failed: "+err.Error()
		ollamaInstall.Unlock()
		return
	}

	for i := 0; i < 30; i++ {
		time.Sleep(time.Second)
		if checkOllamaCLI() {
			break
		}
	}

	ollamaInstall.Lock()
	ollamaInstall.state, ollamaInstall.pct, ollamaInstall.msg = "done", 100, "Restart Sane to activate AI features."
	ollamaInstall.Unlock()
}

func serveAIDeleteModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ Name string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	reqBody, _ := json.Marshal(map[string]string{"name": body.Name})
	req, _ := http.NewRequest(http.MethodDelete, "http://localhost:11434/api/delete", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		http.Error(w, "ollama error: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	resp.Body.Close()
	w.WriteHeader(http.StatusOK)
}
