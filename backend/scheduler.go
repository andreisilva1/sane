package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

type scheduledJob struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Cmd        string `json:"cmd"`
	Dir        string `json:"dir"`
	IntervalMs int64  `json:"intervalMs"`
	Running    bool   `json:"running"`
	LastRun    string `json:"lastRun,omitempty"`
}

var (
	schedMu   sync.Mutex
	schedJobs = map[string]*scheduledJob{}
	schedStop = map[string]chan struct{}{}
)

// ── Handlers ──────────────────────────────────────────────

func serveScheduleList(w http.ResponseWriter, _ *http.Request) {
	schedMu.Lock()
	list := make([]*scheduledJob, 0, len(schedJobs))
	for _, j := range schedJobs {
		list = append(list, j)
	}
	schedMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func serveScheduleAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Label      string `json:"label"`
		Cmd        string `json:"cmd"`
		Dir        string `json:"dir"`
		IntervalMs int64  `json:"intervalMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Cmd == "" || body.IntervalMs < 1000 {
		http.Error(w, "cmd and intervalMs (min 1000) required", http.StatusBadRequest)
		return
	}
	id := fmt.Sprintf("job-%d", time.Now().UnixMilli())
	label := body.Label
	if label == "" {
		label = body.Cmd
	}
	job := &scheduledJob{
		ID:         id,
		Label:      label,
		Cmd:        body.Cmd,
		Dir:        body.Dir,
		IntervalMs: body.IntervalMs,
	}
	schedMu.Lock()
	schedJobs[id] = job
	schedMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func serveScheduleToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ ID string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	schedMu.Lock()
	job, ok := schedJobs[body.ID]
	if !ok {
		schedMu.Unlock()
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}
	if job.Running {
		if ch, ok := schedStop[body.ID]; ok {
			close(ch)
			delete(schedStop, body.ID)
		}
		job.Running = false
	} else {
		ch := make(chan struct{})
		schedStop[body.ID] = ch
		job.Running = true
		go runScheduledJob(job, ch)
	}
	schedMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func serveScheduleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ ID string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	schedMu.Lock()
	if ch, ok := schedStop[body.ID]; ok {
		close(ch)
		delete(schedStop, body.ID)
	}
	delete(schedJobs, body.ID)
	schedMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

// ── Job runner ────────────────────────────────────────────

func runScheduledJob(job *scheduledJob, stop <-chan struct{}) {
	ticker := time.NewTicker(time.Duration(job.IntervalMs) * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case t := <-ticker.C:
			schedMu.Lock()
			job.LastRun = t.Format("15:04:05")
			schedMu.Unlock()
			execScheduledJob(job)
		}
	}
}

func execScheduledJob(job *scheduledJob) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = noConsole(exec.Command("cmd", "/C", job.Cmd))
	} else {
		cmd = exec.Command("sh", "-c", job.Cmd)
	}
	if job.Dir != "" {
		if info, err := os.Stat(job.Dir); err == nil && info.IsDir() {
			cmd.Dir = job.Dir
		}
	}
	cmd.Run()
}

// ── Persistence: save/load .sane-jobs.json ────────────────

func saveJobs(projectDir string) {
	if projectDir == "" {
		return
	}
	schedMu.Lock()
	list := make([]*scheduledJob, 0, len(schedJobs))
	for _, j := range schedJobs {
		list = append(list, j)
	}
	schedMu.Unlock()

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(filepath.Join(projectDir, ".sane-jobs.json"), data, 0644)
}

func loadJobs(projectDir string) {
	if projectDir == "" {
		return
	}
	data, err := os.ReadFile(filepath.Join(projectDir, ".sane-jobs.json"))
	if err != nil {
		return
	}
	var list []*scheduledJob
	if err := json.Unmarshal(data, &list); err != nil {
		return
	}
	schedMu.Lock()
	for _, j := range list {
		j.Running = false // never auto-start on load
		schedJobs[j.ID] = j
	}
	schedMu.Unlock()
}

func serveScheduleLoad(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		http.Error(w, "dir required", http.StatusBadRequest)
		return
	}
	loadJobs(dir)
	serveScheduleList(w, r)
}

func serveScheduleSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct{ Dir string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Dir == "" {
		http.Error(w, "dir required", http.StatusBadRequest)
		return
	}
	saveJobs(body.Dir)
	w.WriteHeader(http.StatusNoContent)
}
