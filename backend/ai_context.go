package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const (
	ctxMaxPerFile = 8 * 1024  // 8 KB per file
	ctxMaxTotal   = 60 * 1024 // 60 KB total key-file content
	ctxMaxFiles   = 3000      // max entries in file list
)

var ctxSkipDirs = map[string]bool{
	".git": true, "node_modules": true, "vendor": true,
	".venv": true, "venv": true, "env": true, ".env": true,
	"__pycache__": true, "dist": true, "build": true,
	".next": true, "target": true, ".cache": true,
	"coverage": true, ".idea": true, ".vscode": true,
	"bin": true, "obj": true, "out": true,
}

var ctxKeyNames = map[string]bool{
	// Go
	"go.mod": true, "go.sum": true,
	// Node
	"package.json": true, "tsconfig.json": true, "jsconfig.json": true,
	"vite.config.js": true, "vite.config.ts": true,
	"webpack.config.js": true, "webpack.config.ts": true,
	"next.config.js": true, "next.config.ts": true,
	// Python
	"requirements.txt": true, "pyproject.toml": true,
	"setup.py": true, "Pipfile": true,
	// Rust
	"Cargo.toml": true,
	// General
	"Makefile": true, "makefile": true,
	"Dockerfile": true, "docker-compose.yml": true, "docker-compose.yaml": true,
	".env.example": true, ".env.sample": true,
	// Docs
	"README.md": true, "README": true, "README.txt": true, "README.rst": true,
	// Entry points
	"main.go": true,
	"main.py": true, "app.py": true, "server.py": true,
	"main.js": true, "index.js": true, "app.js": true, "server.js": true,
	"main.ts": true, "index.ts": true, "app.ts": true, "server.ts": true,
	"main.rs": true, "lib.rs": true,
	"Main.java": true,
}

type aiProjectContextResp struct {
	Files    []string       `json:"files"`
	KeyFiles []aiKeyFile    `json:"key_files"`
}

type aiKeyFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func serveAIProjectContext(w http.ResponseWriter, r *http.Request) {
	root := r.URL.Query().Get("path")
	if root == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	var files []string
	var keyFiles []aiKeyFile
	totalSize := 0

	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()

		if d.IsDir() {
			if ctxSkipDirs[name] || (strings.HasPrefix(name, ".") && path != root) {
				return filepath.SkipDir
			}
			return nil
		}

		rel, _ := filepath.Rel(root, path)
		rel = filepath.ToSlash(rel)

		if len(files) < ctxMaxFiles {
			files = append(files, rel)
		}

		if ctxKeyNames[name] && totalSize < ctxMaxTotal {
			data, err := os.ReadFile(path)
			if err == nil {
				content := string(data)
				if len(content) > ctxMaxPerFile {
					content = content[:ctxMaxPerFile] + "\n… (truncated)"
				}
				keyFiles = append(keyFiles, aiKeyFile{Path: rel, Content: content})
				totalSize += len(content)
			}
		}

		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(aiProjectContextResp{
		Files:    files,
		KeyFiles: keyFiles,
	})
}
