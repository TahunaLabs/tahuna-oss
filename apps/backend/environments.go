package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"tahuna-provisioner/pkg/provisioner"
)

type environmentCreateRequest struct {
	Name      string `json:"name"`
	GPUType   string `json:"gpu_type"`
	GPUCount  int    `json:"gpu_count"`
	VolumeGB  int    `json:"volume_gb"`
	Framework string `json:"framework"`
	Version   string `json:"version"`
}

type environmentService struct {
	db           *sql.DB
	redis        *redis.Client
	httpClient   *http.Client
	runpodAPIKey string
}

func newEnvironmentService(db *sql.DB, redis *redis.Client, httpClient *http.Client, runpodAPIKey string) *environmentService {
	return &environmentService{db: db, redis: redis, httpClient: httpClient, runpodAPIKey: runpodAPIKey}
}

// queryGPUTypes fetches GPU types from RunPod via provisioner, with Redis caching.
func (s *environmentService) queryGPUTypes(ctx context.Context) ([]gpuTypeInfo, error) {
	cacheKey := "runpod:gpu_types"
	if raw, err := s.redis.Get(ctx, cacheKey).Bytes(); err == nil && len(raw) > 0 {
		var cached []gpuTypeInfo
		if json.Unmarshal(raw, &cached) == nil {
			return cached, nil
		}
	}

	rpGPUs, err := provisioner.QueryGPUTypes(ctx, s.httpClient, s.runpodAPIKey)
	if err != nil {
		return nil, wrapServiceError(500, "failed to query gpu types from runpod", err)
	}
	gpus := make([]gpuTypeInfo, 0, len(rpGPUs))
	for _, g := range rpGPUs {
		gpus = append(gpus, gpuTypeInfo{
			ID:          g.ID,
			DisplayName: g.DisplayName,
			MemoryInGB:  g.MemoryInGB,
			MaxGPUCount: g.MaxGPUCount,
		})
	}
	if payload, err := json.Marshal(gpus); err == nil {
		_ = s.redis.Set(ctx, cacheKey, payload, 2*time.Minute).Err()
	}
	return gpus, nil
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
	gpus, err := s.queryGPUTypes(ctx)
	if err != nil {
		return catalogResponse{}, err
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
	// Validate GPU type and count against live RunPod inventory
	gpus, err := s.queryGPUTypes(ctx)
	if err != nil {
		return environmentResponse{}, err
	}
	var matched *gpuTypeInfo
	for i, g := range gpus {
		if g.ID == req.GPUType {
			matched = &gpus[i]
			break
		}
	}
	if matched == nil {
		return environmentResponse{}, newServiceError(400, "Unsupported GPU type: "+req.GPUType+" — not available on RunPod")
	}
	if matched.MaxGPUCount > 0 && req.GPUCount > matched.MaxGPUCount {
		return environmentResponse{}, newServiceError(400, "GPU count exceeds maximum ("+req.GPUType+" supports up to "+itoa(matched.MaxGPUCount)+")")
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
	var hasRuns bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM runs WHERE environment_id = $1 AND user_id = $2)`, id, userID).Scan(&hasRuns); err != nil {
		return deleteEnvironmentResponse{}, wrapServiceError(500, "failed to check dependent runs", err)
	}
	if hasRuns {
		return deleteEnvironmentResponse{}, newServiceError(409, "Environment "+id+" still has runs; delete them first")
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

// ── HTTP handlers ──

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
