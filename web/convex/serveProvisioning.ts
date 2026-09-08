export function serveProviderMachineName(args: {
  computeSessionId: string;
}) {
  const computeSessionId = args.computeSessionId.trim();
  if (!computeSessionId) {
    throw new Error("serve compute session id is required");
  }
  return `tahuna-session-${computeSessionId}`;
}

export function buildServeProvisioningSystemEnv(args: {
  serveId: string;
  computeSessionId: string;
  environmentId: string;
  contractVersion: string;
  outputDir: string;
  runtimeApiBase: string;
  runtimeToken: string;
  runtimeRequestTimeoutSeconds: string;
  gracefulShutdownSeconds: number;
}) {
  return {
    TAHUNA_SERVE_ID: args.serveId,
    TAHUNA_COMPUTE_SESSION_ID: args.computeSessionId,
    TAHUNA_ENVIRONMENT_ID: args.environmentId,
    TAHUNA_CONTRACT_VERSION: args.contractVersion,
    TAHUNA_OUTPUT_DIR: args.outputDir,
    TAHUNA_API_BASE: args.runtimeApiBase,
    TAHUNA_RUNTIME_TOKEN: args.runtimeToken,
    TAHUNA_WORKSPACE_ROOT: "/workspace",
    TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS: args.runtimeRequestTimeoutSeconds,
    TAHUNA_CANCELLATION_GRACE_SECONDS: String(args.gracefulShutdownSeconds),
  };
}
