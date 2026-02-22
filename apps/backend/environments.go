package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"
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

func (a *app) catalog(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cacheKey := "catalog:mvp"
	if raw, err := a.redis.Get(ctx, cacheKey).Bytes(); err == nil && len(raw) > 0 {
		var cached map[string]any
		if json.Unmarshal(raw, &cached) == nil {
			writeJSON(w, 200, cached)
			return
		}
	}

	images, err := getImages()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	resp := map[string]any{"gpus": gpus, "images": images}
	if payload, err := json.Marshal(resp); err == nil {
		_ = a.redis.Set(ctx, cacheKey, payload, 2*time.Minute).Err()
	}
	writeJSON(w, 200, resp)
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
	userID := authUserID(r)
	artifacts := "environments/" + envID + "/artifacts"
	_, err = a.db.ExecContext(r.Context(), `
		INSERT INTO environments (id, user_id, name, artifacts, gpu_type, gpu_count, volume_gb, framework, version)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, envID, userID, req.Name, artifacts, req.GPUType, req.GPUCount, req.VolumeGB, req.Framework, req.Version)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]any{
		"environment_id": envID,
		"name":           req.Name,
		"artifacts":      artifacts,
		"gpu_type":       req.GPUType,
		"gpu_count":      req.GPUCount,
		"volume_gb":      req.VolumeGB,
		"framework":      req.Framework,
		"version":        req.Version,
	})
}

func (a *app) listEnvironments(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, name, artifacts, gpu_type, gpu_count, volume_gb, framework, version
		FROM environments WHERE user_id = $1 ORDER BY created_at DESC
	`, authUserID(r))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	out := make([]map[string]any, 0)
	for rows.Next() {
		var id, name, artifacts, gpuType, framework, version string
		var gpuCount, volumeGB int
		if err := rows.Scan(&id, &name, &artifacts, &gpuType, &gpuCount, &volumeGB, &framework, &version); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{
			"environment_id": id,
			"name":           name,
			"artifacts":      artifacts,
			"gpu_type":       gpuType,
			"gpu_count":      gpuCount,
			"volume_gb":      volumeGB,
			"framework":      framework,
			"version":        version,
		})
	}
	writeJSON(w, 200, map[string]any{"environments": out})
}

func (a *app) getEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("environment_id")
	var name, artifacts, gpuType, framework, version string
	var gpuCount, volumeGB int
	err := a.db.QueryRowContext(r.Context(), `
		SELECT name, artifacts, gpu_type, gpu_count, volume_gb, framework, version
		FROM environments WHERE id = $1 AND user_id = $2
	`, id, authUserID(r)).Scan(&name, &artifacts, &gpuType, &gpuCount, &volumeGB, &framework, &version)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Environment "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{
		"environment_id": id,
		"name":           name,
		"artifacts":      artifacts,
		"gpu_type":       gpuType,
		"gpu_count":      gpuCount,
		"volume_gb":      volumeGB,
		"framework":      framework,
		"version":        version,
	})
}

func (a *app) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("environment_id")
	ctx := r.Context()
	uid := authUserID(r)

	var hasExp bool
	if err := a.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM experiments WHERE environment_id = $1 AND user_id = $2)`, id, uid).Scan(&hasExp); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if hasExp {
		writeErr(w, 409, "Environment "+id+" still has experiments; delete them first")
		return
	}

	res, err := a.db.ExecContext(ctx, `DELETE FROM environments WHERE id = $1 AND user_id = $2`, id, uid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeErr(w, 404, "Environment "+id+" not found")
		return
	}
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
	uid := authUserID(r)
	var exists bool
	if err := a.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM environments WHERE id = $1 AND user_id = $2)`, envID, uid).Scan(&exists); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if !exists {
		writeErr(w, 404, "Environment "+envID+" not found")
		return
	}

	expID := shortID()
	input := "experiments/" + expID + "/input"
	_, err := a.db.ExecContext(r.Context(), `
		INSERT INTO experiments (id, user_id, environment_id, name, input)
		VALUES ($1,$2,$3,$4,$5)
	`, expID, uid, envID, req.Name, input)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"experiment_id": expID, "name": req.Name, "env_id": envID, "input": input})
}

func (a *app) listExperiments(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, name, environment_id, input FROM experiments
		WHERE user_id = $1 ORDER BY created_at DESC
	`, authUserID(r))
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var id, name, envID, input string
		if err := rows.Scan(&id, &name, &envID, &input); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, map[string]any{"experiment_id": id, "name": name, "env_id": envID, "input": input})
	}
	writeJSON(w, 200, map[string]any{"experiments": out})
}

func (a *app) getExperiment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("experiment_id")
	var name, envID, input string
	err := a.db.QueryRowContext(r.Context(), `
		SELECT name, environment_id, input FROM experiments WHERE id = $1 AND user_id = $2
	`, id, authUserID(r)).Scan(&name, &envID, &input)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 404, "Experiment "+id+" not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"experiment_id": id, "name": name, "env_id": envID, "input": input})
}

func (a *app) deleteExperiment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("experiment_id")
	uid := authUserID(r)
	ctx := r.Context()

	var hasRuns bool
	if err := a.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM runs WHERE experiment_id = $1 AND user_id = $2)`, id, uid).Scan(&hasRuns); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if hasRuns {
		writeErr(w, 409, "Experiment "+id+" still has runs; delete them first")
		return
	}

	res, err := a.db.ExecContext(ctx, `DELETE FROM experiments WHERE id = $1 AND user_id = $2`, id, uid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeErr(w, 404, "Experiment "+id+" not found")
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true, "experiment_id": id})
}
