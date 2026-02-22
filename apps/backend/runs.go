package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/hibiken/asynq"
)

const runTaskType = "runs:execute"

type runCreateRequest struct {
	GPUType  *string `json:"gpu_type"`
	GPUCount *int    `json:"gpu_count"`
	VolumeGB *int    `json:"volume_gb"`
}

type runTaskPayload struct {
	RunID     string         `json:"run_id"`
	UserID    string         `json:"user_id"`
	Overrides map[string]any `json:"overrides,omitempty"`
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
	uid := authUserID(r)

	var envID, input string
	err := a.db.QueryRowContext(r.Context(), `
		SELECT environment_id, input FROM experiments WHERE id = $1 AND user_id = $2
	`, experimentID, uid).Scan(&envID, &input)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Experiment "+experimentID+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}

	runID := shortID()
	output := "runs/" + runID + "/output"
	logsPath := "runs/" + runID + "/logs"
	_, err = a.db.ExecContext(r.Context(), `
		INSERT INTO runs (id, user_id, environment_id, experiment_id, input, output, logs, status, cancellation_requested)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',FALSE)
	`, runID, uid, envID, experimentID, input, output, logsPath)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

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

	payload, _ := json.Marshal(runTaskPayload{RunID: runID, UserID: uid, Overrides: overrides})
	task := asynq.NewTask(runTaskType, payload, asynq.Queue(a.queueName), asynq.Timeout(2*time.Hour))
	taskInfo, err := a.asynqClient.Enqueue(task, asynq.MaxRetry(10), asynq.ProcessIn(0))
	if err != nil {
		_, _ = a.db.ExecContext(r.Context(), `UPDATE runs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`, runID, "failed to enqueue run: "+err.Error())
		writeErr(w, 500, "failed to enqueue run")
		return
	}
	_, _ = a.db.ExecContext(r.Context(), `UPDATE runs SET task_id = $2, updated_at = NOW() WHERE id = $1`, runID, taskInfo.ID)

	writeJSON(w, 200, map[string]any{
		"run_id":        runID,
		"env_id":        envID,
		"experiment_id": experimentID,
		"input":         input,
		"output":        output,
		"logs":          logsPath,
		"status":        "queued",
	})
}

func (a *app) listRuns(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, environment_id, experiment_id, input, output, logs, status,
		       COALESCE(error,''), COALESCE(pod_id,''), COALESCE(effective_gpu_type,''),
		       COALESCE(effective_gpu_count,0), COALESCE(effective_volume_gb,0),
		       cancellation_requested
		FROM runs WHERE user_id = $1 ORDER BY created_at DESC
	`, authUserID(r))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var id, envID, expID, input, output, logsPath, status, errMsg, podID, gpuType string
		var gpuCount, volumeGB int
		var cancellationRequested bool
		if err := rows.Scan(&id, &envID, &expID, &input, &output, &logsPath, &status, &errMsg, &podID, &gpuType, &gpuCount, &volumeGB, &cancellationRequested); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{
			"run_id":                 id,
			"env_id":                 envID,
			"experiment_id":          expID,
			"input":                  input,
			"output":                 output,
			"logs":                   logsPath,
			"status":                 status,
			"error":                  errMsg,
			"pod_id":                 podID,
			"effective_gpu_type":     gpuType,
			"effective_gpu_count":    gpuCount,
			"effective_volume_gb":    volumeGB,
			"cancellation_requested": cancellationRequested,
		})
	}
	writeJSON(w, 200, map[string]any{"runs": out})
}

func (a *app) getRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	row := a.db.QueryRowContext(r.Context(), `
		SELECT environment_id, experiment_id, input, output, logs, status,
		       COALESCE(error,''), COALESCE(pod_id,''), COALESCE(effective_gpu_type,''),
		       COALESCE(effective_gpu_count,0), COALESCE(effective_volume_gb,0),
		       cancellation_requested
		FROM runs WHERE id = $1 AND user_id = $2
	`, id, authUserID(r))
	var envID, expID, input, output, logsPath, status, errMsg, podID, gpuType string
	var gpuCount, volumeGB int
	var cancellationRequested bool
	if err := row.Scan(&envID, &expID, &input, &output, &logsPath, &status, &errMsg, &podID, &gpuType, &gpuCount, &volumeGB, &cancellationRequested); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Run "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"run_id":                 id,
		"env_id":                 envID,
		"experiment_id":          expID,
		"input":                  input,
		"output":                 output,
		"logs":                   logsPath,
		"status":                 status,
		"error":                  errMsg,
		"pod_id":                 podID,
		"effective_gpu_type":     gpuType,
		"effective_gpu_count":    gpuCount,
		"effective_volume_gb":    volumeGB,
		"cancellation_requested": cancellationRequested,
	})
}

func (a *app) getRunLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	var logsPath string
	err := a.db.QueryRowContext(r.Context(), `SELECT logs FROM runs WHERE id = $1 AND user_id = $2`, id, authUserID(r)).Scan(&logsPath)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Run "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"run_id":    id,
		"logs_path": logsPath,
		"log_file":  logsPath + "/run.log",
		"note":      "Logs are uploaded by the training pod into R2.",
	})
}

func (a *app) deleteRun(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("run_id")
	uid := authUserID(r)
	var status, podID, taskID string
	err := a.db.QueryRowContext(r.Context(), `
		SELECT status, COALESCE(pod_id,''), COALESCE(task_id,'')
		FROM runs WHERE id = $1 AND user_id = $2
	`, id, uid).Scan(&status, &podID, &taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Run "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	if status == "queued" || status == "provisioning" || status == "running" || status == "cancelling" {
		_, _ = a.db.ExecContext(r.Context(), `
			UPDATE runs
			SET cancellation_requested = TRUE, status = 'cancelling', updated_at = NOW()
			WHERE id = $1 AND user_id = $2
		`, id, uid)
		if taskID != "" {
			_ = a.asynqInspector.DeleteTask(a.queueName, taskID)
		}
		if taskID != "" && podID == "" {
			_, _ = a.db.ExecContext(r.Context(), `
				UPDATE runs
				SET status = 'cancelled', cancellation_requested = TRUE, updated_at = NOW()
				WHERE id = $1 AND user_id = $2
			`, id, uid)
		}
		writeJSON(w, 202, map[string]any{"cancel_requested": true, "run_id": id})
		return
	}
	_, err = a.db.ExecContext(r.Context(), `DELETE FROM runs WHERE id = $1 AND user_id = $2`, id, uid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true, "run_id": id})
}
