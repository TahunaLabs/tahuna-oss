package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
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

type environmentService struct {
	db    *sql.DB
	redis *redis.Client
}

func newEnvironmentService(db *sql.DB, redis *redis.Client) *environmentService {
	return &environmentService{db: db, redis: redis}
}

func (s *environmentService) catalog(ctx context.Context) (catalogResponse, error) {
	cacheKey := "catalog:mvp"
	if raw, err := s.redis.Get(ctx, cacheKey).Bytes(); err == nil && len(raw) > 0 {
		var cached catalogResponse
		if json.Unmarshal(raw, &cached) == nil {
			return cached, nil
		}
	}

	images, err := getImages()
	if err != nil {
		return catalogResponse{}, wrapServiceError(500, "failed to load image catalog", err)
	}
	resp := catalogResponse{GPUs: gpus, Images: images}
	if payload, err := json.Marshal(resp); err == nil {
		_ = s.redis.Set(ctx, cacheKey, payload, 2*time.Minute).Err()
	}
	return resp, nil
}

func (s *environmentService) createEnvironment(ctx context.Context, userID string, req environmentCreateRequest) (environmentResponse, error) {
	if req.Name == "" || req.GPUType == "" || req.Framework == "" || req.Version == "" || req.GPUCount < 1 || req.VolumeGB < 1 {
		return environmentResponse{}, newServiceError(400, "invalid environment payload")
	}
	if !contains(gpus, req.GPUType) {
		return environmentResponse{}, newServiceError(400, "Unsupported GPU type: "+req.GPUType)
	}
	images, err := getImages()
	if err != nil {
		return environmentResponse{}, wrapServiceError(500, "failed to load image catalog", err)
	}
	versions, ok := images[req.Framework]
	if !ok {
		return environmentResponse{}, newServiceError(400, "Unsupported framework: "+req.Framework)
	}
	if _, ok := versions[req.Version]; !ok {
		return environmentResponse{}, newServiceError(400, "Unsupported version for framework "+req.Framework+": "+req.Version)
	}

	envID := shortID()
	artifacts := "environments/" + envID + "/artifacts"
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO environments (id, user_id, name, artifacts, gpu_type, gpu_count, volume_gb, framework, version)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, envID, userID, req.Name, artifacts, req.GPUType, req.GPUCount, req.VolumeGB, req.Framework, req.Version)
	if err != nil {
		return environmentResponse{}, wrapServiceError(500, "failed to create environment", err)
	}

	return environmentResponse{
		EnvironmentID: envID,
		Name:          req.Name,
		Artifacts:     artifacts,
		GPUType:       req.GPUType,
		GPUCount:      req.GPUCount,
		VolumeGB:      req.VolumeGB,
		Framework:     req.Framework,
		Version:       req.Version,
	}, nil
}

func (s *environmentService) listEnvironments(ctx context.Context, userID string) ([]environmentResponse, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, artifacts, gpu_type, gpu_count, volume_gb, framework, version
		FROM environments WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, wrapServiceError(500, "failed to list environments", err)
	}
	defer rows.Close()

	out := make([]environmentResponse, 0)
	for rows.Next() {
		var item environmentResponse
		if err := rows.Scan(&item.EnvironmentID, &item.Name, &item.Artifacts, &item.GPUType, &item.GPUCount, &item.VolumeGB, &item.Framework, &item.Version); err != nil {
			return nil, wrapServiceError(500, "failed to scan environment row", err)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, wrapServiceError(500, "failed while iterating environments", err)
	}
	return out, nil
}

func (s *environmentService) getEnvironment(ctx context.Context, userID, id string) (environmentResponse, error) {
	var item environmentResponse
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, artifacts, gpu_type, gpu_count, volume_gb, framework, version
		FROM environments WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(&item.EnvironmentID, &item.Name, &item.Artifacts, &item.GPUType, &item.GPUCount, &item.VolumeGB, &item.Framework, &item.Version)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return environmentResponse{}, newServiceError(404, "Environment "+id+" not found")
		}
		return environmentResponse{}, wrapServiceError(500, "failed to load environment", err)
	}
	return item, nil
}

func (s *environmentService) deleteEnvironment(ctx context.Context, userID, id string) (deleteEnvironmentResponse, error) {
	var hasExp bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM experiments WHERE environment_id = $1 AND user_id = $2)`, id, userID).Scan(&hasExp); err != nil {
		return deleteEnvironmentResponse{}, wrapServiceError(500, "failed to check dependent experiments", err)
	}
	if hasExp {
		return deleteEnvironmentResponse{}, newServiceError(409, "Environment "+id+" still has experiments; delete them first")
	}

	res, err := s.db.ExecContext(ctx, `DELETE FROM environments WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return deleteEnvironmentResponse{}, wrapServiceError(500, "failed to delete environment", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return deleteEnvironmentResponse{}, newServiceError(404, "Environment "+id+" not found")
	}
	return deleteEnvironmentResponse{Deleted: true, EnvironmentID: id}, nil
}

func (s *environmentService) createExperiment(ctx context.Context, userID, envID string, req experimentCreateRequest) (experimentResponse, error) {
	if req.Name == "" {
		return experimentResponse{}, newServiceError(400, "name is required")
	}
	var exists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM environments WHERE id = $1 AND user_id = $2)`, envID, userID).Scan(&exists); err != nil {
		return experimentResponse{}, wrapServiceError(500, "failed to validate environment", err)
	}
	if !exists {
		return experimentResponse{}, newServiceError(404, "Environment "+envID+" not found")
	}

	expID := shortID()
	input := "experiments/" + expID + "/input"
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO experiments (id, user_id, environment_id, name, input)
		VALUES ($1,$2,$3,$4,$5)
	`, expID, userID, envID, req.Name, input)
	if err != nil {
		return experimentResponse{}, wrapServiceError(500, "failed to create experiment", err)
	}
	return experimentResponse{ExperimentID: expID, Name: req.Name, EnvID: envID, Input: input}, nil
}

func (s *environmentService) listExperiments(ctx context.Context, userID string) ([]experimentResponse, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, environment_id, input FROM experiments
		WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, wrapServiceError(500, "failed to list experiments", err)
	}
	defer rows.Close()

	out := make([]experimentResponse, 0)
	for rows.Next() {
		var item experimentResponse
		if err := rows.Scan(&item.ExperimentID, &item.Name, &item.EnvID, &item.Input); err != nil {
			return nil, wrapServiceError(500, "failed to scan experiment row", err)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, wrapServiceError(500, "failed while iterating experiments", err)
	}
	return out, nil
}

func (s *environmentService) getExperiment(ctx context.Context, userID, id string) (experimentResponse, error) {
	var item experimentResponse
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, environment_id, input FROM experiments WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(&item.ExperimentID, &item.Name, &item.EnvID, &item.Input)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return experimentResponse{}, newServiceError(404, "Experiment "+id+" not found")
		}
		return experimentResponse{}, wrapServiceError(500, "failed to load experiment", err)
	}
	return item, nil
}

func (s *environmentService) deleteExperiment(ctx context.Context, userID, id string) (deleteExperimentResponse, error) {
	var hasRuns bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM runs WHERE experiment_id = $1 AND user_id = $2)`, id, userID).Scan(&hasRuns); err != nil {
		return deleteExperimentResponse{}, wrapServiceError(500, "failed to check dependent runs", err)
	}
	if hasRuns {
		return deleteExperimentResponse{}, newServiceError(409, "Experiment "+id+" still has runs; delete them first")
	}

	res, err := s.db.ExecContext(ctx, `DELETE FROM experiments WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return deleteExperimentResponse{}, wrapServiceError(500, "failed to delete experiment", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return deleteExperimentResponse{}, newServiceError(404, "Experiment "+id+" not found")
	}
	return deleteExperimentResponse{Deleted: true, ExperimentID: id}, nil
}

func (a *app) catalog(w http.ResponseWriter, r *http.Request) {
	resp, err := a.environmentSvc.catalog(r.Context())
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) createEnvironment(w http.ResponseWriter, r *http.Request) {
	var req environmentCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	resp, err := a.environmentSvc.createEnvironment(r.Context(), authUserID(r), req)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) listEnvironments(w http.ResponseWriter, r *http.Request) {
	items, err := a.environmentSvc.listEnvironments(r.Context(), authUserID(r))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, listEnvironmentsResponse{Environments: items})
}

func (a *app) getEnvironment(w http.ResponseWriter, r *http.Request) {
	resp, err := a.environmentSvc.getEnvironment(r.Context(), authUserID(r), r.PathValue("environment_id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	resp, err := a.environmentSvc.deleteEnvironment(r.Context(), authUserID(r), r.PathValue("environment_id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) createExperiment(w http.ResponseWriter, r *http.Request) {
	var req experimentCreateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	resp, err := a.environmentSvc.createExperiment(r.Context(), authUserID(r), r.PathValue("environment_id"), req)
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) listExperiments(w http.ResponseWriter, r *http.Request) {
	items, err := a.environmentSvc.listExperiments(r.Context(), authUserID(r))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, listExperimentsResponse{Experiments: items})
}

func (a *app) getExperiment(w http.ResponseWriter, r *http.Request) {
	resp, err := a.environmentSvc.getExperiment(r.Context(), authUserID(r), r.PathValue("experiment_id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}

func (a *app) deleteExperiment(w http.ResponseWriter, r *http.Request) {
	resp, err := a.environmentSvc.deleteExperiment(r.Context(), authUserID(r), r.PathValue("experiment_id"))
	if err != nil {
		writeServiceErr(w, err)
		return
	}
	writeJSON(w, 200, resp)
}
