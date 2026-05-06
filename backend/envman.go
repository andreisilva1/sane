package main

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// activeEnvPath is the .env file currently selected for injection into runs.
// Protected by activeEnvMu; empty string means no env file active.
var (
	activeEnvPath string
	activeEnvMu   sync.RWMutex
)

// GetActiveEnv returns the key=value pairs from the active .env file.
// Called by run.go before launching a process.
func GetActiveEnv() []string {
	activeEnvMu.RLock()
	path := activeEnvPath
	activeEnvMu.RUnlock()
	if path == "" {
		return nil
	}
	entries, err := parseEnvFile(path)
	if err != nil {
		return nil
	}
	var pairs []string
	for _, e := range entries {
		if e.Key != "" {
			pairs = append(pairs, e.Key+"="+e.Value)
		}
	}
	return pairs
}

// ── .env file types ───────────────────────────────────────

type envEntry struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Comment string `json:"comment,omitempty"`
}

// ── Parse / write ─────────────────────────────────────────

func parseEnvFile(path string) ([]envEntry, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var entries []envEntry
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			entries = append(entries, envEntry{Comment: strings.TrimSpace(trimmed[1:])})
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') ||
				(val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		entries = append(entries, envEntry{Key: key, Value: val})
	}
	return entries, sc.Err()
}

func writeEnvFile(path string, entries []envEntry) error {
	var sb strings.Builder
	for _, e := range entries {
		if e.Key == "" {
			if e.Comment != "" {
				sb.WriteString("# " + e.Comment + "\n")
			}
			continue
		}
		val := e.Value
		if strings.ContainsAny(val, " \t#") {
			val = `"` + strings.ReplaceAll(val, `"`, `\"`) + `"`
		}
		sb.WriteString(e.Key + "=" + val + "\n")
	}
	return os.WriteFile(path, []byte(sb.String()), 0644)
}

// knownEnvNames lists the file names we look for in a project directory.
var knownEnvNames = []string{
	".env",
	".env.local",
	".env.development",
	".env.staging",
	".env.production",
	".env.test",
}

func findEnvFiles(dir string) []string {
	var found []string
	for _, name := range knownEnvNames {
		if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
			found = append(found, name)
		}
	}
	return found
}

// detectMissingVars scans source code for common env-access patterns
// and returns variable names not present in the given env entries.
func detectMissingVars(code string, entries []envEntry) []string {
	present := map[string]bool{}
	for _, e := range entries {
		if e.Key != "" {
			present[e.Key] = true
		}
	}

	// Patterns: os.environ['KEY'], os.getenv('KEY'), process.env.KEY
	var missing []string
	seen := map[string]bool{}
	for _, pattern := range []string{
		`os\.environ\[['"](\w+)['"]\]`,
		`os\.getenv\(['"](\w+)['"]\)`,
		`process\.env\.(\w+)`,
		`os\.Getenv\(['"](\w+)['"]\)`,
	} {
		import_re_manual(pattern, code, func(key string) {
			if !present[key] && !seen[key] {
				seen[key] = true
				missing = append(missing, key)
			}
		})
	}
	return missing
}

// import_re_manual is a minimal regex scanner without importing regexp at package level.
func import_re_manual(pattern, text string, fn func(string)) {
	// We use strings scanning for the common known patterns.
	// This avoids a global regexp import just for this helper.
	var markers []string
	switch {
	case strings.Contains(pattern, `os\.environ`):
		markers = []string{`os.environ['`, `os.environ["`}
	case strings.Contains(pattern, `os\.getenv`):
		markers = []string{`os.getenv('`, `os.getenv("`}
	case strings.Contains(pattern, `process\.env\.`):
		markers = []string{`process.env.`}
	case strings.Contains(pattern, `os\.Getenv`):
		markers = []string{`os.Getenv('`, `os.Getenv("`}
	}
	for _, marker := range markers {
		s := text
		for {
			idx := strings.Index(s, marker)
			if idx < 0 {
				break
			}
			rest := s[idx+len(marker):]
			end := strings.IndexAny(rest, `'"]. `)
			if end > 0 {
				key := rest[:end]
				if key != "" && isEnvKeyLike(key) {
					fn(key)
				}
			}
			s = s[idx+len(marker)+1:]
		}
	}
}

func isEnvKeyLike(s string) bool {
	for _, c := range s {
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return len(s) > 0
}

// ── HTTP Handlers ─────────────────────────────────────────

func serveEnvList(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		http.Error(w, "dir required", http.StatusBadRequest)
		return
	}
	activeEnvMu.RLock()
	active := activeEnvPath
	activeEnvMu.RUnlock()

	files := findEnvFiles(dir)
	type fileInfo struct {
		Name   string `json:"name"`
		Path   string `json:"path"`
		Active bool   `json:"active"`
	}
	result := make([]fileInfo, 0, len(files))
	for _, name := range files {
		p := filepath.Join(dir, name)
		result = append(result, fileInfo{Name: name, Path: p, Active: p == active})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func serveEnvRead(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	entries, err := parseEnvFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

func serveEnvWrite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Path    string     `json:"path"`
		Entries []envEntry `json:"entries"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		http.Error(w, "path and entries required", http.StatusBadRequest)
		return
	}
	if err := writeEnvFile(body.Path, body.Entries); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func serveEnvActivate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ Path string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	activeEnvMu.Lock()
	activeEnvPath = body.Path
	activeEnvMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func serveEnvDetect(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	activeEnvMu.RLock()
	ep := activeEnvPath
	activeEnvMu.RUnlock()
	var entries []envEntry
	if ep != "" {
		entries, _ = parseEnvFile(ep)
	}
	missing := detectMissingVars(string(data), entries)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(missing)
}
