package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
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
	skipNames := map[string]bool{
		".git": true, ".DS_Store": true, ".Spotlight-V100": true,
		".Trashes": true, ".fseventsd": true, "Thumbs.db": true, ".svn": true,
	}
	for _, e := range entries {
		if skipNames[e.Name()] {
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
	sort.Slice(dirs,  func(i, j int) bool { return dirs[i].Name  < dirs[j].Name })
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	return append(dirs, files...), nil
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
		// On Windows, files inside node_modules (e.g. esbuild.exe) can be
		// marked read-only, causing RemoveAll to fail with "access denied".
		// Stripping the read-only bit on every entry first fixes this.
		_ = filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			return os.Chmod(p, 0777)
		})
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
