package main

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// servePreviewDir serves the local filesystem for HTML preview.
// The URL path suffix after "/preview-dir/" IS the absolute file path.
// Relative asset URLs resolve correctly because the URL hierarchy mirrors
// the filesystem. Absolute file:/// references in HTML are rewritten.
func servePreviewDir(w http.ResponseWriter, r *http.Request) {
	suffix := strings.TrimPrefix(r.URL.Path, "/preview-dir/")
	if suffix == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	var filePath string
	if runtime.GOOS == "windows" {
		filePath = suffix
	} else {
		filePath = "/" + suffix
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == ".html" || ext == ".htm" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
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
