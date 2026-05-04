package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

type Node struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsDir    bool   `json:"isDir"`
	Children []Node `json:"children,omitempty"`
}

func readDir(root string) ([]Node, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}

	var dirs, files []Node
	for _, e := range entries {
		if len(e.Name()) > 0 && e.Name()[0] == '.' {
			continue
		}
		full := filepath.Join(root, e.Name())
		node := Node{Name: e.Name(), Path: full, IsDir: e.IsDir()}
		if e.IsDir() {
			children, _ := readDir(full)
			node.Children = children
			dirs = append(dirs, node)
		} else {
			files = append(files, node)
		}
	}

	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name < dirs[j].Name })
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })

	return append(dirs, files...), nil
}

func withCORS(fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			return
		}
		fn(w, r)
	}
}

func serveFiles(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	nodes, err := readDir(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

func serveFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write(data)
	case http.MethodPost:
		var body struct{ Content string }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := os.WriteFile(path, []byte(body.Content), 0644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case http.MethodDelete:
		if err := os.RemoveAll(path); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func serveMkdir(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ Path string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(body.Path, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func serveRename(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ From, To string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.From == "" || body.To == "" {
		http.Error(w, "from and to required", http.StatusBadRequest)
		return
	}
	if err := os.Rename(body.From, body.To); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// ── Global search ─────────────────────────────────────────

type SearchResult struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Content string `json:"content"`
}

const (
	maxFileSize = 1 << 20 // 1 MB
	maxResults  = 500
)

func isBinary(data []byte) bool {
	limit := len(data)
	if limit > 512 {
		limit = 512
	}
	for _, b := range data[:limit] {
		if b == 0 {
			return true
		}
	}
	return false
}

func searchInFiles(root, query string) []SearchResult {
	q := strings.ToLower(query)
	var results []SearchResult

	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		name := info.Name()
		if len(name) > 0 && name[0] == '.' {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() || info.Size() > maxFileSize {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil || isBinary(data) {
			return nil
		}
		for i, line := range strings.Split(string(data), "\n") {
			if !strings.Contains(strings.ToLower(line), q) {
				continue
			}
			content := strings.TrimSpace(line)
			if len(content) > 300 {
				content = content[:300]
			}
			results = append(results, SearchResult{Path: path, Line: i + 1, Content: content})
			if len(results) >= maxResults {
				return filepath.SkipAll
			}
		}
		return nil
	})

	return results
}

func serveSearch(w http.ResponseWriter, r *http.Request) {
	root  := r.URL.Query().Get("root")
	query := r.URL.Query().Get("q")
	if root == "" || query == "" {
		http.Error(w, "root and q required", http.StatusBadRequest)
		return
	}
	results := searchInFiles(root, query)
	if results == nil {
		results = []SearchResult{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// ── AI / Ollama ───────────────────────────────────────────

type catalogEntry struct {
	name string
	size string // approximate download size
}

var catalog = []catalogEntry{
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

var ollamaClient   = &http.Client{Timeout: 2 * time.Second}
var aiQueryClient  = &http.Client{Timeout: 3 * time.Minute}

func isOllamaRunning() bool {
	resp, err := ollamaClient.Get("http://localhost:11434")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return true
}

func startOllamaIfNeeded() error {
	if isOllamaRunning() {
		return nil
	}
	cmd := exec.Command("ollama", "serve")
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
		size := entry.size
		isInstalled := false
		if actual, ok := installed[entry.name]; ok {
			size = actual
			isInstalled = true
		}
		models = append(models, ModelInfo{Name: entry.name, Installed: isInstalled, Size: size})
	}

	// also surface installed models not in the catalog
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

var pullClient = &http.Client{} // no timeout — pulls can take minutes

func init() { pulls.m = map[string]*pullState{} }

func doPull(name string) {
	pulls.Lock()
	st := pulls.m[name]
	pulls.Unlock()

	type pullReq struct {
		Name   string `json:"name"`
		Stream bool   `json:"stream"`
	}
	reqBody, _ := json.Marshal(pullReq{Name: name, Stream: true})

	resp, err := pullClient.Post("http://localhost:11434/api/pull",
		"application/json", bytes.NewReader(reqBody))
	if err != nil {
		pulls.Lock()
		st.Running = false
		st.Done = true
		st.Error = err.Error()
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
			st.Total = line.Total
			st.Completed = line.Completed
		}
		pulls.Unlock()
	}

	pulls.Lock()
	st.Running = false
	st.Done = true
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

// ── Ollama CLI check ──────────────────────────────────────

func checkOllamaCLI() bool {
	if _, err := exec.LookPath("ollama"); err == nil {
		return true
	}
	// Fallback: check default Windows install path (PATH may not be updated yet)
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		candidate := filepath.Join(local, "Programs", "Ollama", "ollama.exe")
		if _, err := os.Stat(candidate); err == nil {
			return true
		}
	}
	return false
}

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

	resp, err := aiQueryClient.Post("http://localhost:11434/api/generate",
		"application/json", bytes.NewReader(reqBody))
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
		var chunk struct {
			Done bool `json:"done"`
		}
		if json.Unmarshal(line, &chunk) == nil && chunk.Done {
			break
		}
	}
}

func serveAICheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"installed": checkOllamaCLI()})
}

// ── Shell execution (streaming SSE + interactive stdin) ────

type shellProc struct {
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
		ID  string // client-generated session id
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
		cmd = exec.CommandContext(ctx, "cmd", "/C", body.Cmd)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", body.Cmd)
	}

	if body.Cwd != "" {
		if info, err := os.Stat(body.Cwd); err == nil && info.IsDir() {
			cmd.Dir = body.Cwd
		}
	}

	// Force UTF-8 so tools like rich/fastapi-cli don't crash when the pipe
	// is not a real Windows console and the code page falls back to cp1252.
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

	// Register stdin pipe so /shell/stdin can write to it
	sessID := body.ID
	if sessID != "" {
		shellProcs.Store(sessID, &shellProc{stdin: stdinPipe})
		defer shellProcs.Delete(sessID)
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

// serveShellStdin sends a line of text to a running shell process's stdin.
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
	proc := val.(*shellProc)
	proc.stdin.Write([]byte(body.Input + "\n"))
	w.WriteHeader(http.StatusNoContent)
}

// ── Python execution ──────────────────────────────────────

// findVenv searches projectDir for a virtual environment and returns the
// path to its Python interpreter and a short label ("venv", ".venv", "env",
// or "global").
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

var runProcs sync.Map // id → *shellProc

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

func serveRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Path string
		Root string
		ID   string
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	// SSE streaming so the client sees output as it arrives.
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

	// Build the command based on file type.
	var cmd *exec.Cmd
	ext := strings.ToLower(filepath.Ext(body.Path))

	if ext == ".js" {
		nodePath, err := exec.LookPath("node")
		if err != nil {
			writeEvent(map[string]any{"type": "error", "text": "Node.js not found — install from https://nodejs.org"})
			writeEvent(map[string]any{"type": "done", "exitCode": 1, "duration": 0})
			return
		}
		writeEvent(map[string]any{"type": "info", "venv": "node"})
		cmd = exec.CommandContext(r.Context(), nodePath, body.Path)
		cmd.Dir = filepath.Dir(body.Path)
		cmd.Env = os.Environ()
	} else {
		// Python (default)
		projectDir := body.Root
		if projectDir == "" {
			projectDir = filepath.Dir(body.Path)
		}
		python, venvLabel := findVenv(projectDir)
		writeEvent(map[string]any{"type": "info", "venv": venvLabel})
		// -u: unbuffered stdout/stderr so each print() reaches the pipe immediately.
		cmd = exec.CommandContext(r.Context(), python, "-u", body.Path)
		cmd.Dir = filepath.Dir(body.Path)
		cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
	}

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

	start := time.Now()
	if err := cmd.Start(); err != nil {
		writeEvent(map[string]any{"type": "error", "text": err.Error()})
		return
	}

	if body.ID != "" {
		runProcs.Store(body.ID, &shellProc{stdin: stdinPipe})
		defer runProcs.Delete(body.ID)
	}

	// Stream stdout and stderr concurrently.
	// stdout is read in raw chunks so input() prompts (no trailing \n) appear immediately.
	// stderr stays line-based since tracebacks always end with \n.
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

	exitCode := 0
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if r.Context().Err() != nil {
			exitCode = -1 // killed by client abort
		}
	}

	writeEvent(map[string]any{
		"type":     "done",
		"exitCode": exitCode,
		"duration": time.Since(start).Milliseconds(),
	})
}

// ── HTML Preview ──────────────────────────────────────────
// Registered at /preview-dir/ — the URL path suffix IS the absolute file path.
// Example: GET /preview-dir/C:/site/index.html → serves C:/site/index.html
// All relative asset paths resolve correctly because the base URL path mirrors
// the filesystem hierarchy. file:/// URLs in HTML source are rewritten to use
// this same handler so static absolute references also work.
func servePreviewDir(w http.ResponseWriter, r *http.Request) {
	suffix := strings.TrimPrefix(r.URL.Path, "/preview-dir/")
	if suffix == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	var filePath string
	if runtime.GOOS == "windows" {
		filePath = suffix // "C:/projects/site/style.css"
	} else {
		filePath = "/" + suffix // "/home/user/site/style.css"
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == ".html" || ext == ".htm" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		// Rewrite file:/// absolute URLs to route through this same handler.
		html := strings.ReplaceAll(string(data), "file:///", "http://localhost:7654/preview-dir/")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
		return
	}

	f, err := os.Open(filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.ServeContent(w, r, filePath, fi.ModTime(), f)
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
	cmd := exec.CommandContext(ctx, python, "-u", tmp.Name(), filePath)
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

// ── Entry point ───────────────────────────────────────────

func main() {
	http.HandleFunc("/preview-dir/", withCORS(servePreviewDir))
	http.HandleFunc("/shell", withCORS(serveShell))
	http.HandleFunc("/shell/stdin", withCORS(serveShellStdin))
	http.HandleFunc("/run", withCORS(serveRun))
	http.HandleFunc("/run/stdin", withCORS(serveRunStdin))
	http.HandleFunc("/trace", withCORS(serveTrace))
	http.HandleFunc("/pyenv", withCORS(servePyEnv))
	http.HandleFunc("/files", withCORS(serveFiles))
	http.HandleFunc("/file", withCORS(serveFile))
	http.HandleFunc("/mkdir", withCORS(serveMkdir))
	http.HandleFunc("/rename", withCORS(serveRename))
	http.HandleFunc("/search", withCORS(serveSearch))
	http.HandleFunc("/ai/ask", withCORS(serveAIAsk))
	http.HandleFunc("/ai/check", withCORS(serveAICheck))
	http.HandleFunc("/ai/models", withCORS(serveAIModels))
	http.HandleFunc("/ai/pull", withCORS(serveAIPull))
	http.HandleFunc("/ai/pull/status", withCORS(serveAIPullStatus))
	http.HandleFunc("/ping", withCORS(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, "ok")
	}))
	fmt.Fprintln(os.Stderr, "sane backend on :7654")
	if err := http.ListenAndServe(":7654", nil); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
