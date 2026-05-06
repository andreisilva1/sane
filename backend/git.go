package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
)

// gitRun executes a git command in the given directory and returns stdout.
func gitRun(dir string, args ...string) (string, error) {
	cmd := noConsole(exec.Command("git", args...))
	cmd.Dir = dir
	out, err := cmd.Output()
	return strings.TrimSpace(string(out)), err
}

// GET /git/is-repo?path=
func serveGitIsRepo(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	_, err := gitRun(path, "rev-parse", "--git-dir")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"is_repo": err == nil})
}

// GET /git/status?path=
func serveGitStatus(w http.ResponseWriter, r *http.Request) {
	type entry struct {
		File   string `json:"file"`
		Status string `json:"status"` // "M" | "A" | "U"
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	out, err := gitRun(path, "status", "--porcelain")
	w.Header().Set("Content-Type", "application/json")
	if err != nil || out == "" {
		json.NewEncoder(w).Encode([]entry{})
		return
	}

	var entries []entry
	for _, line := range strings.Split(out, "\n") {
		if len(line) < 4 {
			continue
		}
		xy := line[:2]
		file := strings.TrimSpace(line[3:])
		// Renamed files: "old -> new"
		if idx := strings.Index(file, " -> "); idx != -1 {
			file = file[idx+4:]
		}
		var status string
		switch {
		case strings.Contains(xy, "?"):
			status = "U"
		case strings.Contains(xy, "A"):
			status = "A"
		default:
			status = "M"
		}
		entries = append(entries, entry{File: file, Status: status})
	}

	json.NewEncoder(w).Encode(entries)
}

// GET /git/diff?path=&file=
func serveGitDiff(w http.ResponseWriter, r *http.Request) {
	root := r.URL.Query().Get("path")
	file := r.URL.Query().Get("file")
	if root == "" || file == "" {
		http.Error(w, "path and file required", http.StatusBadRequest)
		return
	}

	// Try working-tree diff first; fall back to staged diff for new files
	out, err := gitRun(root, "diff", "HEAD", "--", file)
	if err != nil || out == "" {
		out, _ = gitRun(root, "diff", "--cached", "--", file)
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprint(w, out)
}

// POST /git/commit   body: {"path":"...","message":"..."}
func serveGitCommit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path    string `json:"path"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" || req.Message == "" {
		http.Error(w, "path and message required", http.StatusBadRequest)
		return
	}

	if _, err := gitRun(req.Path, "add", "-A"); err != nil {
		http.Error(w, "git add: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := gitRun(req.Path, "commit", "-m", req.Message); err != nil {
		http.Error(w, "git commit: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
