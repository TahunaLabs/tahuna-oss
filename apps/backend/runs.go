package main

import (
	"context"
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

type runDeleteResult struct {
	StatusCode int
	Body       any
}

type runService struct {
	db             *sql.DB
	asynqClient    *asynq.Client
	asynqInspector *asynq.Inspector
	queueName      string
}

func newRunService(db *sql.DB, asynqClient *asynq.Client, asynqInspector *asynq.Inspector, queueName string) *runService {
	return &runService{db: db, asynqClient: asynqClient, asynqInspector: asynqInspector, queueName: queueName}
}

func (s *runService) createRun(ctx context.Context, userID, experimentID string, req runCreateRequest) (runResponse, error) {
	if req.GPUCount != nil && *req.GPUCount < 1 {
		return runResponse{}, newServiceError(400, "gpu_count must be >= 1")
	}
	if req.VolumeGB != nil && *req.VolumeGB < 1 {
		return runResponse{}, newServiceError(400, "volume_gb must be >= 1")
	}

	var envID, input string
	err := s.db.QueryRowContext(ctx, `
		SELECT environment_id, input FROM experiments WHERE id = $1 AND user_id = $2
	`, experimentID, userID).Scan(&envID, &input)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return runResponse{}, newServiceError(404, "Experiment "+experimentID+" not found")
		}
		return runResponse{}, wrapServiceError(500, "failed to load experiment", err)
	}

	runID := shortID()
	output := "runs/" + runID + "/output"
	logsPath := "runs/" + runID + "/logs"
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO runs (id, user_id, environment_id, experiment_id, input, output, logs, status, cancellation_requested)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',FALSE)
	`, runID, userID, envID, experimentID, input, output, logsPath)
	if err != nil {
		return runResponse{}, wrapServiceError(500, "failed to create run", err)
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

	payload, _ := json.Marshal(runTaskPayload{RunID: runID, UserID: userID, Overrides: overrides})
	task := asynq.NewTask(runTaskType, payload, asynq.Queue(s.queueName), asynq.Timeout(2*time.Hour))
	taskInfo, err := s.asynqClient.Enqueue(task, asynq.MaxRetry(10), asynq.ProcessIn(0))
	if err != nil {
		_, _ = s.db.ExecContext(ctx, `UPDATE runs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`, runID, "failed to enqueue run: "+err.Error())
		return runResponse{}, wrapServiceError(500, "failed to enqueue run", err)
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE runs SET task_id = $2, updated_at = NOW() WHERE id = $1`, runID, taskInfo.ID)

	return runResponse{
		RunID:        runID,
		EnvID:        envID,
		ExperimentID: experimentID,
		Input:        input,
		Output:       output,
		Logs:         logsPath,
		Status:       "queued",
	}, nil
}

func (s *runService) listRuns(ctx context.Context, userID string) ([]runResponse, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, environment_id, experiment_id, input, output, logs, status,
		       COALESCE(error,''), COALESCE(pod_id,''), COALESCE(effective_gpu_type,''),
		       COALESCE(effective_gpu_count,0), COALESCE(effective_volume_gb,0),
		       cancellation_requested
		FROM runs WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, wrapServiceError(500, "failed to list runs", err)
	}
	defer rows.Close()

	out := make([]runResponse, 0)
	for rows.Next() {
		var item runResponse
		if err := rows.Scan(&item.RunID, &item.EnvID, &item.ExperimentID, &item.Input, &item.Output, &item.Logs, &item.Status, &item.Error, &item.PodID, &item.EffectiveGPUType, &item.EffectiveGPUCount, &item.EffectiveVolumeGB, &item.CancellationRequested); err != nil {
			return nil, wrapServiceError(500, "failed to scan run row", err)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, wrapServiceError(500, "failed while iterating runs", err)
	}
	return out, nil
}

func (s *runService) getRun(ctx context.Context, userID, runID string) (runResponse, error) {
	var item runResponse
	err := s.db.QueryRowContext(ctx, `
		SELECT id, environment_id, experiment_id, input, output, logs, status,
		       COALESCE(error,''), COALESCE(pod_id,''), COALESCE(effective_gpu_type,''),
		       COALESCE(effective_gpu_count,0), COALESCE(effective_volume_gb,0),
		       cancellation_requested
		FROM runs WHERE id = $1 AND user_id = $2
	`, runID, userID).Scan(&item.RunID, &item.EnvID, &item.ExperimentID, &item.Input, &item.Output, &item.Logs, &item.Status, &item.Error, &item.PodID, &item.EffectiveGPUType, &item.EffectiveGPUCount, &item.EffectiveVolumeGB, &item.CancellationRequested)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return runResponse{}, newServiceError(404, "Run "+runID+" not found")
		}
		return runResponse{}, wrapServiceError(500, "failed to load run", err)
	}
	return item, nil
}

func (s *runService) getRunLogs(ctx context.Context, userID, runID string) (runLogsResponse, error) {
	var logsPath string
	err := s.db.QueryRowContext(ctx, `SELECT logs FROM runs WHERE id = $1 AND user_id = $2`, runID, userID).Scan(&logsPath)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return runLogsResponse{}, newServiceError(404, "Run "+runID+" not found")
		}
		return runLogsResponse{}, wrapServiceError(500, "failed to load run logs", err)
	}
	return runLogsResponse{
		RunID:    runID,
		LogsPath: logsPath,
		LogFile:  logsPath + "/run.log",
		Note:     "Logs are uploaded by the training pod into R2.",
	}, nil
}

func (s *runService) deleteRun(ctx context.Context, userID, runID string) (runDeleteResult, error) {
	var status, podID, taskID string
	err := s.db.QueryRowContext(ctx, `
		SELECT status, COALESCE(pod_id,''), COALESCE(task_id,'')
		FROM runs WHERE id = $1 AND user_id = $2
	`, runID, userID).Scan(&status, &podID, &taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return runDeleteResult{}, newServiceError(404, "Run "+runID+" not found")
		}
		return runDeleteResult{}, wrapServiceError(500, "failed to load run for delete", err)
	}
	if status == "queued" || status == "provisioning" || status == "running" || status == "cancelling" {
		_, _ = s.db.ExecContext(ctx, `
			UPDATE runs
			SET cancellation_requested = TRUE, status = 'cancelling', updated_at = NOW()
			WHERE id = $1 AND user_id = $2
		`, runID, userID)
		if taskID != "" {
			_ = s.asynqInspector.DeleteTask(s.queueName, taskID)
		}
		if taskID != "" && podID == "" {
			_, _ = s.db.ExecContext(ctx, `
				UPDATE runs
				SET status = 'cancelled', cancellation_requested = TRUE, updated_at = NOW()
				WHERE id = $1 AND user_id = $2
			`, runID, userID)
		}
		return runDeleteResult{StatusCode: 202, Body: cancelRunResponse{CancelRequested: true, RunID: runID}}, nil
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM runs WHERE id = $1 AND user_id = $2`, runID, userID)
	if err != nil {
		return runDeleteResult{}, wrapServiceError(500, "failed to delete run", err)
	}
	return runDeleteResult{StatusCode: 200, Body: deleteRunResponse{Deleted: true, RunID: runID}}, nil
}

func (a *app) createRun(w http.ResponseWriter, r *http.Request) {
	var req runCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	resp, err := a.runSvc.createRun(r.Context(), authUserID(r), r.PathValue("experiment_id"), req)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) listRuns(w http.ResponseWriter, r *http.Request) {
	items, err := a.runSvc.listRuns(r.Context(), authUserID(r))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, listRunsResponse{Runs: items})
}

func (a *app) getRun(w http.ResponseWriter, r *http.Request) {
	resp, err := a.runSvc.getRun(r.Context(), authUserID(r), r.PathValue("run_id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) getRunLogs(w http.ResponseWriter, r *http.Request) {
	resp, err := a.runSvc.getRunLogs(r.Context(), authUserID(r), r.PathValue("run_id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) deleteRun(w http.ResponseWriter, r *http.Request) {
	result, err := a.runSvc.deleteRun(r.Context(), authUserID(r), r.PathValue("run_id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, result.StatusCode, result.Body)
}
