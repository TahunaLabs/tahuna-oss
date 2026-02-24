package main

type healthResponse struct {
	Status string `json:"status"`
}

type apiKeyResponse struct {
	UserID   string `json:"user_id"`
	APIKey   string `json:"api_key"`
	APIKeyID string `json:"api_key_id"`
}

type requestEmailOTPResponse struct {
	EmailSent bool   `json:"email_sent"`
	Warning   string `json:"warning,omitempty"`
}

type meResponse struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	OrgID  string `json:"org_id"`
}

type gpuTypeInfo struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	MemoryInGB  int    `json:"memoryInGb"`
	MaxGPUCount int    `json:"maxGpuCount"`
}

type catalogResponse struct {
	GPUs   []gpuTypeInfo                `json:"gpus"`
	Images map[string]map[string]string `json:"images"`
}

type environmentResponse struct {
	EnvironmentID string `json:"environment_id"`
	Name          string `json:"name"`
	Artifacts     string `json:"artifacts"`
	GPUType       string `json:"gpu_type"`
	GPUCount      int    `json:"gpu_count"`
	VolumeGB      int    `json:"volume_gb"`
	Framework     string `json:"framework"`
	Version       string `json:"version"`
}

type listEnvironmentsResponse struct {
	Environments []environmentResponse `json:"environments"`
}

type runResponse struct {
	RunID                 string `json:"run_id"`
	EnvID                 string `json:"env_id"`
	Input                 string `json:"input"`
	Output                string `json:"output"`
	Logs                  string `json:"logs"`
	Status                string `json:"status"`
	Error                 string `json:"error,omitempty"`
	PodID                 string `json:"pod_id,omitempty"`
	EffectiveGPUType      string `json:"effective_gpu_type,omitempty"`
	EffectiveGPUCount     int    `json:"effective_gpu_count,omitempty"`
	EffectiveVolumeGB     int    `json:"effective_volume_gb,omitempty"`
	CancellationRequested bool   `json:"cancellation_requested,omitempty"`
}

type listRunsResponse struct {
	Runs []runResponse `json:"runs"`
}

type runLogsResponse struct {
	RunID    string `json:"run_id"`
	LogsPath string `json:"logs_path"`
	LogFile  string `json:"log_file"`
	Note     string `json:"note"`
}

type cancelRunResponse struct {
	CancelRequested bool   `json:"cancel_requested"`
	RunID           string `json:"run_id"`
}

type deleteEnvironmentResponse struct {
	Deleted       bool   `json:"deleted"`
	EnvironmentID string `json:"environment_id"`
}

type deleteRunResponse struct {
	Deleted bool   `json:"deleted"`
	RunID   string `json:"run_id"`
}
