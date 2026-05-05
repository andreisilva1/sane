package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
)

// buildJavaCmd uses Java 11+ single-file source-code execution.
// `java FileName.java` compiles and runs in one step — no explicit javac needed.
// Compilation errors appear as normal stderr output in the run panel.
func buildJavaCmd(_ context.Context, body runBody, emit func(kind, text string)) (*exec.Cmd, string, error) {
	javaPath, err := exec.LookPath("java")
	if err != nil {
		emit("error", "Java not found — install from https://adoptium.net")
		return nil, "java", err
	}
	cmd := noConsole(exec.Command(javaPath, body.Path))
	cmd.Dir = filepath.Dir(body.Path)
	cmd.Env = os.Environ()
	return cmd, "java", nil
}
