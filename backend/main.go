package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"syscall"
)

// noConsole prevents Windows from opening a visible CMD window when spawning
// console-subsystem processes (python, node, go, java…) from a windowsgui parent.
func noConsole(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
	return cmd
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

func main() {
	// ── File system ───────────────────────────────────────────
	http.HandleFunc("/files",  withCORS(serveFiles))
	http.HandleFunc("/file",   withCORS(serveFile))
	http.HandleFunc("/mkdir",  withCORS(serveMkdir))
	http.HandleFunc("/rename", withCORS(serveRename))
	http.HandleFunc("/search", withCORS(serveSearch))

	// ── Code execution ────────────────────────────────────────
	http.HandleFunc("/run",         withCORS(serveRun))
	http.HandleFunc("/run/stdin",   withCORS(serveRunStdin))
	http.HandleFunc("/run/stop",    withCORS(serveRunStop))
	http.HandleFunc("/trace",       withCORS(serveTrace))
	http.HandleFunc("/pyenv",       withCORS(servePyEnv))
	http.HandleFunc("/shell",       withCORS(serveShell))
	http.HandleFunc("/shell/stdin", withCORS(serveShellStdin))

	// ── Dev toolkit ───────────────────────────────────────────
	http.HandleFunc("/http-client",      withCORS(serveHTTPClient))
	http.HandleFunc("/env/list",         withCORS(serveEnvList))
	http.HandleFunc("/env/read",         withCORS(serveEnvRead))
	http.HandleFunc("/env/write",        withCORS(serveEnvWrite))
	http.HandleFunc("/env/activate",     withCORS(serveEnvActivate))
	http.HandleFunc("/env/detect",       withCORS(serveEnvDetect))
	http.HandleFunc("/port/owner",       withCORS(servePortOwner))
	http.HandleFunc("/port/kill",        withCORS(servePortKill))
	http.HandleFunc("/schedule/list",    withCORS(serveScheduleList))
	http.HandleFunc("/schedule/add",     withCORS(serveScheduleAdd))
	http.HandleFunc("/schedule/toggle",  withCORS(serveScheduleToggle))
	http.HandleFunc("/schedule/delete",  withCORS(serveScheduleDelete))
	http.HandleFunc("/schedule/load",    withCORS(serveScheduleLoad))
	http.HandleFunc("/schedule/save",    withCORS(serveScheduleSave))
	http.HandleFunc("/db/tables",        withCORS(serveDBTables))
	http.HandleFunc("/db/rows",          withCORS(serveDBRows))
	http.HandleFunc("/db/query",         withCORS(serveDBQuery))

	// ── HTML preview ──────────────────────────────────────────
	http.HandleFunc("/preview-dir/", withCORS(servePreviewDir))

	// ── AI / Ollama ───────────────────────────────────────────
	http.HandleFunc("/ai/project-context",        withCORS(serveAIProjectContext))
	http.HandleFunc("/ai/ask",                   withCORS(serveAIAsk))
	http.HandleFunc("/ai/check",                 withCORS(serveAICheck))
	http.HandleFunc("/ai/models",                withCORS(serveAIModels))
	http.HandleFunc("/ai/pull",                  withCORS(serveAIPull))
	http.HandleFunc("/ai/pull/status",           withCORS(serveAIPullStatus))
	http.HandleFunc("/ai/model",                 withCORS(serveAIDeleteModel))
	http.HandleFunc("/ai/ollama/status",         withCORS(serveOllamaStatus))
	http.HandleFunc("/ai/ollama/install",        withCORS(serveOllamaInstall))
	http.HandleFunc("/ai/ollama/install/status", withCORS(serveOllamaInstallStatus))
	http.HandleFunc("/ai/ollama/install/cancel", withCORS(serveOllamaInstallCancel))

	// ── Health ────────────────────────────────────────────────
	http.HandleFunc("/ping", withCORS(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, "ok")
	}))

	fmt.Fprintln(os.Stderr, "sane backend on :7654")
	if err := http.ListenAndServe("127.0.0.1:7654", nil); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
