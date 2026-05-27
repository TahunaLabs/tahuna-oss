package main

type serveSnapshotResponse struct {
	Command                 []string `json:"command"`
	DependencyGroup         *string  `json:"dependency_group,omitempty"`
	PythonVersion           string   `json:"python_version"`
	GPUType                 string   `json:"gpu_type"`
	GPUCount                int64    `json:"gpu_count"`
	VolumeGB                int64    `json:"volume_gb"`
	Port                    int64    `json:"port"`
	HealthPath              string   `json:"health_path"`
	DefaultModelPath        string   `json:"default_model_path"`
	StartupTimeoutSeconds   int64    `json:"startup_timeout_seconds"`
	HealthIntervalSeconds   int64    `json:"health_interval_seconds"`
	HealthTimeoutSeconds    int64    `json:"health_timeout_seconds"`
	HealthFailureThreshold  int64    `json:"health_failure_threshold"`
	GracefulShutdownSeconds int64    `json:"graceful_shutdown_seconds"`
}

type serveModelSnapshotResponse struct {
	SourceType         string `json:"source_type"`
	SourceRunID        string `json:"source_run_id"`
	SourceObjectPrefix string `json:"source_object_prefix"`
	SourceModelPath    string `json:"source_model_path"`
	ObjectPrefix       string `json:"object_prefix"`
	ManifestKey        string `json:"manifest_key"`
	ManifestHash       string `json:"manifest_hash"`
	ObjectCount        int64  `json:"object_count"`
	TotalBytes         int64  `json:"total_bytes"`
}

type serveResponse struct {
	ServeID                 string                     `json:"serve_id"`
	CreatedAt               float64                    `json:"created_at"`
	EnvironmentID           string                     `json:"environment_id"`
	InferencePath           string                     `json:"inference_path"`
	Command                 []string                   `json:"command"`
	OutputDir               string                     `json:"output_dir"`
	Logs                    string                     `json:"logs"`
	Status                  string                     `json:"status"`
	Error                   string                     `json:"error"`
	ProviderMachineID       string                     `json:"provider_machine_id"`
	CodeManifestHash        string                     `json:"code_manifest_hash"`
	DataManifestHash        string                     `json:"data_manifest_hash"`
	PythonVersion           string                     `json:"python_version"`
	GPUType                 string                     `json:"gpu_type"`
	GPUCount                int64                      `json:"gpu_count"`
	VolumeGB                int64                      `json:"volume_gb"`
	Port                    int64                      `json:"port"`
	HealthPath              string                     `json:"health_path"`
	DefaultModelPath        string                     `json:"default_model_path"`
	StartupTimeoutSeconds   int64                      `json:"startup_timeout_seconds"`
	HealthIntervalSeconds   int64                      `json:"health_interval_seconds"`
	HealthTimeoutSeconds    int64                      `json:"health_timeout_seconds"`
	HealthFailureThreshold  int64                      `json:"health_failure_threshold"`
	GracefulShutdownSeconds int64                      `json:"graceful_shutdown_seconds"`
	ModelSnapshot           serveModelSnapshotResponse `json:"model_snapshot"`
}

type servesResponse struct {
	Serves []serveResponse `json:"serves"`
}

type serveLogsWindowResponse struct {
	TailLimit               int64 `json:"tail_limit"`
	StartupScanLimit        int64 `json:"startup_scan_limit"`
	PinnedBootstrapLimit    int64 `json:"pinned_bootstrap_limit"`
	ScannedTail             int64 `json:"scanned_tail"`
	ScannedStartup          int64 `json:"scanned_startup"`
	PinnedBootstrapCount    int64 `json:"pinned_bootstrap_count"`
	ReturnedLogs            int64 `json:"returned_logs"`
	IncludesPinnedBootstrap bool  `json:"includes_pinned_bootstrap"`
}

type serveLogsResponse struct {
	ServeID    string                  `json:"serve_id"`
	Status     string                  `json:"status"`
	LogsPath   string                  `json:"logs_path"`
	LogFile    string                  `json:"log_file"`
	Note       string                  `json:"note"`
	LogsWindow serveLogsWindowResponse `json:"logs_window"`
	RecentLogs []logLineResponse       `json:"recent_logs"`
}

type stopServeResponse struct {
	ServeID       string `json:"serve_id"`
	StopRequested bool   `json:"stop_requested"`
	Forced        bool   `json:"forced"`
	Status        string `json:"status"`
}

// environmentResponse represents a single environment from the API.
type environmentResponse struct {
	EnvironmentID        string                 `json:"environment_id"`
	Name                 string                 `json:"name"`
	GPUType              string                 `json:"gpu_type"`
	GPUCount             int64                  `json:"gpu_count"`
	VolumeGB             int64                  `json:"volume_gb"`
	Framework            string                 `json:"framework"`
	Version              string                 `json:"version"`
	PythonVersion        string                 `json:"python_version"`
	TrainDependencyGroup string                 `json:"train_dependency_group"`
	Artifacts            string                 `json:"artifacts"`
	BoundDataIDs         []string               `json:"bound_data_ids"`
	Command              []string               `json:"command"`
	OutputDir            string                 `json:"output_dir"`
	ServeSnapshot        *serveSnapshotResponse `json:"serve_snapshot"`
}

// environmentsResponse is the response from GET /environments.
type environmentsResponse struct {
	Environments []environmentResponse `json:"environments"`
}

type envVarNameResponse struct {
	Name string `json:"name"`
}

type envVarNamesResponse struct {
	EnvVars []envVarNameResponse `json:"env_vars"`
}

type envVarValueResponse struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type envVarDeleteResponse struct {
	Name    string `json:"name"`
	Deleted bool   `json:"deleted"`
}

// runResponse represents a single run from the API.
type runResponse struct {
	RunID             string `json:"run_id"`
	Name              string `json:"name"`
	EnvironmentID     string `json:"environment_id"`
	Status            string `json:"status"`
	CreatedAt         int64  `json:"created_at"`
	UptimeMS          int64  `json:"uptime_ms"`
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

type finalMetricResponse struct {
	RunID     string  `json:"run_id"`
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	Step      *int64  `json:"step"`
	Timestamp int64   `json:"timestamp"`
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
