package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

var gpus = []string{
	"NVIDIA GeForce RTX 4090",
	"NVIDIA GeForce RTX 4080",
	"NVIDIA GeForce RTX 4080 SUPER",
	"NVIDIA GeForce RTX 4070 Ti",
	"NVIDIA GeForce RTX 3090",
	"NVIDIA GeForce RTX 3090 Ti",
	"NVIDIA GeForce RTX 3080",
	"NVIDIA GeForce RTX 3080 Ti",
	"NVIDIA GeForce RTX 3070",
	"NVIDIA A100 80GB PCIe",
	"NVIDIA A100-SXM4-80GB",
	"NVIDIA A40",
	"NVIDIA A30",
	"NVIDIA L40",
	"NVIDIA L40S",
	"NVIDIA L4",
	"NVIDIA H100 80GB HBM3",
	"NVIDIA H100 PCIe",
	"NVIDIA H100 NVL",
	"NVIDIA H200",
	"NVIDIA H200 NVL",
	"NVIDIA RTX A6000",
	"NVIDIA RTX A5000",
	"NVIDIA RTX A4500",
	"NVIDIA RTX A4000",
	"NVIDIA RTX A2000",
	"NVIDIA RTX 6000 Ada Generation",
	"NVIDIA RTX 5000 Ada Generation",
	"NVIDIA RTX 4000 Ada Generation",
	"Tesla V100-SXM2-32GB",
	"Tesla V100-SXM2-16GB",
	"Tesla V100-PCIE-16GB",
}

type dbState struct {
	Environments map[string]map[string]any `json:"environments"`
	Experiments  map[string]map[string]any `json:"experiments"`
	Runs         map[string]map[string]any `json:"runs"`
}

type app struct {
	mu     sync.Mutex
	dbPath string
}

type environmentCreateRequest struct {
	Name      string `json:"name"`
	GPUType   string `json:"gpu_type"`
	GPUCount  int    `json:"gpu_count"`
	VolumeGB  int    `json:"volume_gb"`
	Framework string `json:"framework"`
	Version   string `json:"version"`
}

type experimentCreateRequest struct {
	Name string `json:"name"`
}

type runCreateRequest struct {
	GPUType  *string `json:"gpu_type"`
	GPUCount *int    `json:"gpu_count"`
	VolumeGB *int    `json:"volume_gb"`
}

func main() {
	a := &app{dbPath: envOr("TAHUNA_DB", "db.json")}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", a.health)
	mux.HandleFunc("GET /v1/catalog", a.catalog)
	mux.HandleFunc("POST /v1/environments", a.createEnvironment)
	mux.HandleFunc("GET /v1/environments", a.listEnvironments)
	mux.HandleFunc("GET /v1/environments/{environment_id}", a.getEnvironment)
	mux.HandleFunc("DELETE /v1/environments/{environment_id}", a.deleteEnvironment)
	mux.HandleFunc("POST /v1/environments/{environment_id}/experiments", a.createExperiment)
	mux.HandleFunc("GET /v1/experiments", a.listExperiments)
	mux.HandleFunc("GET /v1/experiments/{experiment_id}", a.getExperiment)
	mux.HandleFunc("DELETE /v1/experiments/{experiment_id}", a.deleteExperiment)
	mux.HandleFunc("POST /v1/experiments/{experiment_id}/runs", a.createRun)
	mux.HandleFunc("GET /v1/runs", a.listRuns)
	mux.HandleFunc("GET /v1/runs/{run_id}", a.getRun)
	mux.HandleFunc("GET /v1/runs/{run_id}/logs", a.getRunLogs)
	mux.HandleFunc("DELETE /v1/runs/{run_id}", a.deleteRun)

	port := envOr("PORT", "8000")
	log.Printf("backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (a *app) catalog(w http.ResponseWriter, _ *http.Request) {
	images, err := getImages()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"gpus": gpus, "images": images})
}

func (a *app) createEnvironment(w http.ResponseWriter, r *http.Request) {
	var req environmentCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Name == "" || req.GPUType == "" || req.Framework == "" || req.Version == "" || req.GPUCount < 1 || req.VolumeGB < 1 {
		writeErr(w, 400, "invalid environment payload")
		return
	}
	if !contains(gpus, req.GPUType) {
		writeErr(w, 400, "Unsupported GPU type: "+req.GPUType)
		return
	}
	images, err := getImages()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	versions, ok := images[req.Framework]
	if !ok {
		writeErr(w, 400, "Unsupported framework: "+req.Framework)
		return
	}
	if _, ok := versions[req.Version]; !ok {
		writeErr(w, 400, "Unsupported version for framework "+req.Framework+": "+req.Version)
		return
	}

	envID := shortID()
	record := map[string]any{
		"name":      req.Name,
		"artifacts": "environments/" + envID + "/artifacts",
		"gpu_type":  req.GPUType,
		"gpu_count": req.GPUCount,
		"volume_gb": req.VolumeGB,
		"framework": req.Framework,
		"version":   req.Version,
	}
	a.mu.Lock()
	db := a.load()
	db.Environments[envID] = record
	a.save(db)
	a.mu.Unlock()

	resp := cloneMap(record)
	resp["environment_id"] = envID
	writeJSON(w, 200, resp)
}

func (a *app) listEnvironments(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	db := a.load()
	a.mu.Unlock()
	out := make([]map[string]any, 0, len(db.Environments))
	for id, env := range db.Environments {
		item := cloneMap(env)
		item["environment_id"] = id
		out = append(out, item)
	}
	writeJSON(w, 200, map[string]any{"environments": out})
}

func (a *app) getEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("environment_id")
	a.mu.Lock()
	db := a.load()
	env, ok := db.Environments[id]
	a.mu.Unlock()
	if !ok {
		writeErr(w, 404, "Environment "+id+" not found")
		return
	}
	resp := cloneMap(env)
	resp["environment_id"] = id
	writeJSON(w, 200, resp)
}

func (a *app) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("environment_id")
	a.mu.Lock()
	db := a.load()
	if _, ok := db.Environments[id]; !ok {
		a.mu.Unlock()
		writeErr(w, 404, "Environment "+id+" not found")
		return
	}
	for _, exp := range db.Experiments {
		if asString(exp["env_id"]) == id {
			a.mu.Unlock()
			writeErr(w, 409, "Environment "+id+" still has experiments; delete them first")
			return
		}
	}
	delete(db.Environments, id)
	a.save(db)
	a.mu.Unlock()
	writeJSON(w, 200, map[string]any{"deleted": true, "environment_id": id})
}

func (a *app) createExperiment(w http.ResponseWriter, r *http.Request) {
	envID := r.PathValue("environment_id")
	var req experimentCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.Name == "" {
		writeErr(w, 400, "name is required")
		return
	}

	a.mu.Lock()
	db := a.load()
	if _, ok := db.Environments[envID]; !ok {
		a.mu.Unlock()
		writeErr(w, 404, "Environment "+envID+" not found")
		return
	}
	expID := shortID()
	record := map[string]any{
		"name":   req.Name,
		"env_id": envID,
		"input":  "experiments/" + expID + "/input",
	}
	db.Experiments[expID] = record
	a.save(db)
	a.mu.Unlock()

	resp := cloneMap(record)
	resp["experiment_id"] = expID
	writeJSON(w, 200, resp)
}

func (a *app) listExperiments(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	db := a.load()
	a.mu.Unlock()
	out := make([]map[string]any, 0, len(db.Experiments))
	for id, exp := range db.Experiments {
		item := cloneMap(exp)
		item["experiment_id"] = id
		out = append(out, item)
	}
	writeJSON(w, 200, map[string]any{"experiments": out})
}

func (a *app) getExperiment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("experiment_id")
	a.mu.Lock()
	db := a.load()
	exp, ok := db.Experiments[id]
	a.mu.Unlock()
	if !ok {
		writeErr(w, 404, "Experiment "+id+" not found")
		return
	}
	resp := cloneMap(exp)
	resp["experiment_id"] = id
	writeJSON(w, 200, resp)
}

func (a *app) deleteExperiment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("experiment_id")
	a.mu.Lock()
	db := a.load()
	if _, ok := db.Experiments[id]; !ok {
		a.mu.Unlock()
		writeErr(w, 404, "Experiment "+id+" not found")
		return
	}
	for _, run := range db.Runs {
		if asString(run["experiment_id"]) == id {
			a.mu.Unlock()
			writeErr(w, 409, "Experiment "+id+" still has runs; delete them first")
			return
		}
	}
	delete(db.Experiments, id)
	a.save(db)
	a.mu.Unlock()
	writeJSON(w, 200, map[string]any{"deleted": true, "experiment_id": id})
}

func (a *app) createRun(w http.ResponseWriter, r *http.Request) {
	experimentID := r.PathValue("experiment_id")
	var req runCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	if req.GPUCount != nil && *req.GPUCount < 1 {
		writeErr(w, 400, "gpu_count must be >= 1")
		return
	}
	if req.VolumeGB != nil && *req.VolumeGB < 1 {
		writeErr(w, 400, "volume_gb must be >= 1")
		return
	}

	a.mu.Lock()
	db := a.load()
	exp, ok := db.Experiments[experimentID]
	if !ok {
		a.mu.Unlock()
		writeErr(w, 404, "Experiment "+experimentID+" not found")
		return
	}
	runID := shortID()
	run := map[string]any{
		"env_id":        asString(exp["env_id"]),
		"experiment_id": experimentID,
		"input":         asString(exp["input"]),
		"output":        "runs/" + runID + "/output",
		"logs":          "runs/" + runID + "/logs",
		"status":        "created",
	}
	db.Runs[runID] = run
	a.save(db)
	a.mu.Unlock()

	overrides := map[string]any{}
	if req.GPUType != nil {
		overrides["gpu_type"] = *req.GPUType
	}
	if req.GPUCount != nil {
		overrides["gpu_count"] = *req.GPUCount
	}
	if req.VolumeGB != nil {
		overrides["volume_gb"] = *req.VolumeGB
	}
	go a.executeRun(runID, overrides)

	resp := cloneMap(run)
	resp["run_id"] = runID
	writeJSON(w, 200, resp)
}

func (a *app) listRuns(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	db := a.load()
	a.mu.Unlock()
	out := make([]map[string]any, 0, len(db.Runs))
	for id, run := range db.Runs {
		item := cloneMap(run)
		item["run_id"] = id
		out = append(out, item)
	}
	writeJSON(w, 200, map[string]any{"runs": out})
}

func (a *app) getRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	a.mu.Lock()
	db := a.load()
	run, ok := db.Runs[id]
	a.mu.Unlock()
	if !ok {
		writeErr(w, 404, "Run "+id+" not found")
		return
	}
	resp := cloneMap(run)
	resp["run_id"] = id
	writeJSON(w, 200, resp)
}

func (a *app) getRunLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	a.mu.Lock()
	db := a.load()
	run, ok := db.Runs[id]
	a.mu.Unlock()
	if !ok {
		writeErr(w, 404, "Run "+id+" not found")
		return
	}
	logs := asString(run["logs"])
	writeJSON(w, 200, map[string]any{
		"run_id":    id,
		"logs_path": logs,
		"log_file":  logs + "/run.log",
		"note":      "Logs are uploaded by the training pod into R2.",
	})
}

func (a *app) deleteRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	a.mu.Lock()
	db := a.load()
	run, ok := db.Runs[id]
	if !ok {
		a.mu.Unlock()
		writeErr(w, 404, "Run "+id+" not found")
		return
	}
	status := asString(run["status"])
	if status == "running" || status == "provisioning" {
		a.mu.Unlock()
		writeErr(w, 409, "Run is active; cancellation is not implemented yet")
		return
	}
	delete(db.Runs, id)
	a.save(db)
	a.mu.Unlock()
	writeJSON(w, 200, map[string]any{"deleted": true, "run_id": id})
}

func (a *app) executeRun(runID string, overrides map[string]any) {
	get := func() (map[string]any, map[string]any, map[string]any, error) {
		a.mu.Lock()
		defer a.mu.Unlock()
		db := a.load()
		run, ok := db.Runs[runID]
		if !ok {
			return nil, nil, nil, fmt.Errorf("run not found")
		}
		exp, ok := db.Experiments[asString(run["experiment_id"])]
		if !ok {
			return nil, nil, nil, fmt.Errorf("experiment %s not found", asString(run["experiment_id"]))
		}
		env, ok := db.Environments[asString(exp["env_id"])]
		if !ok {
			return nil, nil, nil, fmt.Errorf("environment %s not found", asString(exp["env_id"]))
		}
		return cloneMap(run), cloneMap(exp), cloneMap(env), nil
	}
	update := func(fields map[string]any) {
		a.mu.Lock()
		db := a.load()
		run := db.Runs[runID]
		if run != nil {
			for k, v := range fields {
				run[k] = v
			}
			db.Runs[runID] = run
			a.save(db)
		}
		a.mu.Unlock()
	}

	run, exp, env, err := get()
	if err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	gpuType := firstString(overrides["gpu_type"], env["gpu_type"])
	gpuCount := firstInt(overrides["gpu_count"], env["gpu_count"])
	volumeGB := firstInt(overrides["volume_gb"], env["volume_gb"])
	update(map[string]any{
		"status":              "queued",
		"effective_gpu_type":  gpuType,
		"effective_gpu_count": gpuCount,
		"effective_volume_gb": volumeGB,
	})

	podID := ""
	defer func() {
		if podID != "" {
			_, _ = runProvisioner("terminate", "--pod-id", podID)
		}
	}()

	resp, err := runProvisioner(
		"launch",
		"--env-artifacts", asString(env["artifacts"]),
		"--input-path", asString(exp["input"]),
		"--output-path", asString(run["output"]),
		"--logs-path", asString(run["logs"]),
		"--gpu-type", gpuType,
		"--gpu-count", strconv.Itoa(gpuCount),
		"--volume-gb", strconv.Itoa(volumeGB),
		"--framework", asString(env["framework"]),
		"--version", asString(env["version"]),
		"--run-id", runID,
	)
	if err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	podID = asString(resp["pod_id"])
	if podID == "" {
		update(map[string]any{"status": "failed", "error": "pod_id missing from provisioner"})
		return
	}
	update(map[string]any{"status": "provisioning", "pod_id": podID})

	if _, err := runProvisioner("wait-running", "--pod-id", podID); err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	update(map[string]any{"status": "running"})

	if _, err := runProvisioner("wait-completion", "--pod-id", podID, "--timeout", "3600"); err != nil {
		update(map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	update(map[string]any{"status": "completed"})
}

func runProvisioner(args ...string) (map[string]any, error) {
	if v := strings.TrimSpace(os.Getenv("GO_PROVISIONER_BIN")); v != "" {
		cmd := exec.Command(v, args...)
		cmd.Dir = "."
		return runCmd(cmd)
	}
	cmd := exec.Command("go", append([]string{"run", "../provisioner"}, args...)...)
	cmd.Dir = "."
	return runCmd(cmd)
}

func runCmd(cmd *exec.Cmd) (map[string]any, error) {
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.Env = os.Environ()
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf(msg)
	}
	out := strings.TrimSpace(stdout.String())
	if out == "" {
		return map[string]any{}, nil
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(out), &m); err != nil {
		return nil, fmt.Errorf("invalid provisioner output: %s", out)
	}
	return m, nil
}

func getImages() (map[string]map[string]string, error) {
	user := strings.TrimSpace(os.Getenv("DOCKER_USER"))
	if user == "" {
		user = "local"
	}
	path := filepath.Join("templates", "images.json")
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var base map[string]map[string]string
	if err := json.Unmarshal(b, &base); err != nil {
		return nil, err
	}
	out := make(map[string]map[string]string, len(base))
	for fw, versions := range base {
		out[fw] = map[string]string{}
		for version := range versions {
			out[fw][version] = fmt.Sprintf("%s/tahuna:%s-%s", user, fw, version)
		}
	}
	return out, nil
}

func (a *app) load() dbState {
	b, err := os.ReadFile(a.dbPath)
	if err != nil {
		return dbState{Environments: map[string]map[string]any{}, Experiments: map[string]map[string]any{}, Runs: map[string]map[string]any{}}
	}
	var db dbState
	if err := json.Unmarshal(b, &db); err != nil {
		return dbState{Environments: map[string]map[string]any{}, Experiments: map[string]map[string]any{}, Runs: map[string]map[string]any{}}
	}
	if db.Environments == nil {
		db.Environments = map[string]map[string]any{}
	}
	if db.Experiments == nil {
		db.Experiments = map[string]map[string]any{}
	}
	if db.Runs == nil {
		db.Runs = map[string]map[string]any{}
	}
	return db
}

func (a *app) save(db dbState) {
	b, _ := json.MarshalIndent(db, "", "  ")
	_ = os.WriteFile(a.dbPath, b, 0o644)
}

func shortID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return strconv.FormatInt(int64(os.Getpid()), 16)
	}
	return hex.EncodeToString(b)
}

func decodeJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dest); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"detail": msg})
}

func cloneMap(src map[string]any) map[string]any {
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func contains(values []string, target string) bool {
	for _, v := range values {
		if v == target {
			return true
		}
	}
	return false
}

func asString(v any) string {
	s, ok := v.(string)
	if ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func asInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	case string:
		n, _ := strconv.Atoi(t)
		return n
	default:
		return 0
	}
}

func firstString(values ...any) string {
	for _, v := range values {
		s := strings.TrimSpace(asString(v))
		if s != "" && s != "<nil>" {
			return s
		}
	}
	return ""
}

func firstInt(values ...any) int {
	for _, v := range values {
		n := asInt(v)
		if n > 0 {
			return n
		}
	}
	return 0
}

func envOr(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}
