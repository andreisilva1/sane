package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
)

func buildJSCmd(_ context.Context, body runBody, emit func(kind, text string)) (*exec.Cmd, string, error) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		emit("error", "Node.js not found — install from https://nodejs.org")
		return nil, "node", err
	}
	cmd := noConsole(exec.Command(nodePath, body.Path))
	cmd.Dir = filepath.Dir(body.Path)
	cmd.Env = os.Environ()
	return cmd, "node", nil
}
