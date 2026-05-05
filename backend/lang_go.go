package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
)

func buildGoCmd(_ context.Context, body runBody, emit func(kind, text string)) (*exec.Cmd, string, error) {
	goPath, err := exec.LookPath("go")
	if err != nil {
		emit("error", "Go not found — install from https://go.dev")
		return nil, "go", err
	}
	// `go run <file>` works for single-file package main programs.
	// For module-based projects with multiple files, users can use the terminal.
	cmd := noConsole(exec.Command(goPath, "run", body.Path))
	cmd.Dir = filepath.Dir(body.Path)
	cmd.Env = os.Environ()
	return cmd, "go", nil
}
