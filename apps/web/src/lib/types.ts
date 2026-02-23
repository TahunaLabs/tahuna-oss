export type MeResponse = {
  user_id: string;
  email: string;
  role: string;
  org_id: string;
};

export type Environment = {
  environment_id: string;
  name: string;
  artifacts: string;
  gpu_type: string;
  gpu_count: number;
  volume_gb: number;
  framework: string;
  version: string;
};

export type Experiment = {
  experiment_id: string;
  name: string;
  env_id: string;
  input: string;
};

export type Run = {
  run_id: string;
  env_id: string;
  experiment_id: string;
  input: string;
  output: string;
  logs: string;
  status: string;
  error?: string;
  effective_gpu_type?: string;
  effective_gpu_count?: number;
  effective_volume_gb?: number;
  cancellation_requested?: boolean;
};

export type Catalog = {
  gpus: string[];
  images: Record<string, Record<string, string>>;
};
