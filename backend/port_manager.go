package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

type portOwner struct {
	Port int    `json:"port"`
	PID  int    `json:"pid"`
	Name string `json:"name"`
}

func findPortOwner(port int) (*portOwner, error) {
	if runtime.GOOS == "windows" {
		out, err := exec.Command("netstat", "-ano").Output()
		if err != nil {
			return nil, fmt.Errorf("netstat failed: %w", err)
		}
		portStr := fmt.Sprintf(":%d ", port)
		for _, line := range strings.Split(string(out), "\n") {
			if !strings.Contains(line, portStr) {
				continue
			}
			upper := strings.ToUpper(line)
			if !strings.Contains(upper, "LISTENING") {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 5 {
				continue
			}
			pid, _ := strconv.Atoi(fields[len(fields)-1])
			if pid <= 0 {
				continue
			}
			return &portOwner{Port: port, PID: pid, Name: windowsProcessName(pid)}, nil
		}
		return nil, fmt.Errorf("no listening process on port %d", port)
	}

	// macOS / Linux
	out, err := exec.Command("lsof", "-i",
		fmt.Sprintf(":%d", port), "-sTCP:LISTEN", "-n", "-P").Output()
	if err != nil {
		return nil, fmt.Errorf("lsof failed: %w", err)
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 2 {
		return nil, fmt.Errorf("no listening process on port %d", port)
	}
	fields := strings.Fields(lines[1])
	if len(fields) < 2 {
		return nil, fmt.Errorf("unexpected lsof output")
	}
	pid, _ := strconv.Atoi(fields[1])
	return &portOwner{Port: port, PID: pid, Name: fields[0]}, nil
}

func windowsProcessName(pid int) string {
	out, err := exec.Command(
		"tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH",
	).Output()
	if err != nil {
		return "unknown"
	}
	line := strings.TrimSpace(string(out))
	if line == "" || strings.HasPrefix(strings.ToUpper(line), "INFO:") {
		return "unknown"
	}
	parts := strings.SplitN(line, ",", 2)
	return strings.Trim(parts[0], `"`)
}

func servePortOwner(w http.ResponseWriter, r *http.Request) {
	portStr := r.URL.Query().Get("port")
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		http.Error(w, "valid port required", http.StatusBadRequest)
		return
	}
	owner, err := findPortOwner(port)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(owner)
}

func servePortKill(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ PID int }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PID <= 0 {
		http.Error(w, "pid required", http.StatusBadRequest)
		return
	}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("taskkill", "/PID", strconv.Itoa(body.PID), "/F")
	} else {
		cmd = exec.Command("kill", "-9", strconv.Itoa(body.PID))
	}
	if err := cmd.Run(); err != nil {
		http.Error(w, "kill failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
