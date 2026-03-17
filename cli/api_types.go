package main

// environmentResponse represents a single environment from the API.
type environmentResponse struct {
	EnvironmentID string   `json:"environment_id"`
	Name          string   `json:"name"`
	GPUType       string   `json:"gpu_type"`
	GPUCount      int64    `json:"gpu_count"`
	VolumeGB      int64    `json:"volume_gb"`
	Framework     string   `json:"framework"`
	Version       string   `json:"version"`
	PythonVersion string   `json:"python_version"`
	Artifacts     string   `json:"artifacts"`
	BoundDataIDs  []string `json:"bound_data_ids"`
}

// environmentsResponse is the response from GET /environments.
type environmentsResponse struct {
	Environments []environmentResponse `json:"environments"`
}

// runResponse represents a single run from the API.
type runResponse struct {
	RunID             string `json:"run_id"`
	Name              string `json:"name"`
	EnvironmentID     string `json:"environment_id"`
	Status            string `json:"status"`
	CreatedAt         int64  `json:"created_at"`
	Error             string `json:"error"`
	EffectiveGPUType  string `json:"effective_gpu_type"`
	EffectiveGPUCount int64  `json:"effective_gpu_count"`
	EffectiveVolumeGB int64  `json:"effective_volume_gb"`
	CodeManifestHash  string `json:"code_manifest_hash"`
	DataManifestHash  string `json:"data_manifest_hash"`
	CancelRequested   bool   `json:"cancel_requested"`
}

// runsResponse is the response from GET /runs.
type runsResponse struct {
	Runs []runResponse `json:"runs"`
}

// gpuAPIEntry represents a single GPU from the API.
type gpuAPIEntry struct {
	ID           string  `json:"id"`
	DisplayName  string  `json:"display_name"`
	MaxGPUCount  int     `json:"max_gpu_count"`
	MemoryGB     int     `json:"memory_gb"`
	PricePerHour float64 `json:"price_per_hour"`
}

// gpusResponse is the response from GET /gpus.
type gpusResponse struct {
	GPUs   []gpuAPIEntry                           `json:"gpus"`
	Images map[string]map[string]map[string]string `json:"images"`
}

// dataItemResponse represents a single data blob from the API.
type dataItemResponse struct {
	BlobID      string `json:"blob_id"`
	Filename    string `json:"filename"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
	DownloadURL string `json:"download_url"`
	CreatedAt   int64  `json:"created_at"`
}

// dataListResponse is the response from GET /data.
type dataListResponse struct {
	Blobs []dataItemResponse `json:"blobs"`
}

// logLineResponse represents a single log line from the API.
type logLineResponse struct {
	Timestamp int64  `json:"timestamp"`
	Level     string `json:"level"`
	Source    string `json:"source"`
	Message   string `json:"message"`
}

// metricResponse represents a single metric entry from the API.
type metricResponse struct {
	Timestamp int64   `json:"timestamp"`
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	Step      *int64  `json:"step"`
	Unit      string  `json:"unit"`
	Source    string  `json:"source"`
}

// runLogsResponse is the response from GET /runs/{id}/logs.
type runLogsResponse struct {
	RunID         string            `json:"run_id"`
	LogsPath      string            `json:"logs_path"`
	LogFile       string            `json:"log_file"`
	Note          string            `json:"note"`
	RecentLogs    []logLineResponse `json:"recent_logs"`
	RecentMetrics []metricResponse  `json:"recent_metrics"`
}

// cancelRunResponse is the response from POST /runs/{id}/cancel.
type cancelRunResponse struct {
	CancelRequested bool   `json:"cancel_requested"`
	Deleted         bool   `json:"deleted"`
	Forced          bool   `json:"forced"`
	RunID           string `json:"run_id"`
}

// createRunResponse is the response from POST /environments/{id}/runs.
type createRunResponse struct {
	RunID string `json:"run_id"`
	Name  string `json:"name"`
}

// createEnvironmentResponse is the response from POST /environments.
type createEnvironmentResponse struct {
	EnvironmentID string `json:"environment_id"`
}
