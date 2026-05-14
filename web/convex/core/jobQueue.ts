export const CORE_JOB_TYPES = {
  PROVISION_RUN: "provision_run",
  CHECK_STARTUP_TIMEOUT: "check_startup_timeout",
  TERMINATE_MACHINE: "terminate_machine",
  FINALIZE_ARTIFACT: "finalize_artifact",
  CLEANUP_FAILED_UPLOAD: "cleanup_failed_upload",
  PROVISION_SERVE: "provision_serve",
  CHECK_SERVE_STARTUP_TIMEOUT: "check_serve_startup_timeout",
  TERMINATE_SERVE_MACHINE: "terminate_serve_machine",
  DELETE_SERVE_DATA: "delete_serve_data",
} as const;

export type CoreJobType = (typeof CORE_JOB_TYPES)[keyof typeof CORE_JOB_TYPES];

export type CoreJobStatus = "scheduled" | "running" | "completed" | "failed";

export type StartupTimeoutFingerprint = {
  cloudType: string;
  framework: string;
  version: string;
  pythonVersion: string;
  gpuType: string;
  imageName: string;
};

type BaseRunJob<TType extends CoreJobType> = {
  type: TType;
  runId: string;
  delayMs: number;
  idempotencyKey: string;
};

type BaseServeJob<TType extends CoreJobType> = {
  type: TType;
  serveId: string;
  delayMs: number;
  idempotencyKey: string;
};

export type ProvisionRunJob = BaseRunJob<typeof CORE_JOB_TYPES.PROVISION_RUN>;

export type CheckStartupTimeoutJob = BaseRunJob<typeof CORE_JOB_TYPES.CHECK_STARTUP_TIMEOUT> & {
  providerMachineId: string;
  fingerprint: StartupTimeoutFingerprint;
};

export type TerminateMachineJob = BaseRunJob<typeof CORE_JOB_TYPES.TERMINATE_MACHINE> & {
  providerMachineId: string;
  force: boolean;
  attempt?: number;
};

export type FinalizeArtifactJob = BaseRunJob<typeof CORE_JOB_TYPES.FINALIZE_ARTIFACT> & {
  artifactKeys: string[];
};

export type CleanupFailedUploadJob = BaseRunJob<typeof CORE_JOB_TYPES.CLEANUP_FAILED_UPLOAD> & {
  artifactKey: string;
  reason?: string;
};

export type ProvisionServeJob = BaseServeJob<typeof CORE_JOB_TYPES.PROVISION_SERVE>;

export type CheckServeStartupTimeoutJob = BaseServeJob<typeof CORE_JOB_TYPES.CHECK_SERVE_STARTUP_TIMEOUT> & {
  providerMachineId: string;
  startupTimeoutSeconds: number;
};

export type TerminateServeMachineJob = BaseServeJob<typeof CORE_JOB_TYPES.TERMINATE_SERVE_MACHINE> & {
  providerMachineId: string;
  force: boolean;
  attempt?: number;
};

export type DeleteServeDataJob = BaseServeJob<typeof CORE_JOB_TYPES.DELETE_SERVE_DATA>;

export type CoreJob =
  | ProvisionRunJob
  | CheckStartupTimeoutJob
  | TerminateMachineJob
  | FinalizeArtifactJob
  | CleanupFailedUploadJob
  | ProvisionServeJob
  | CheckServeStartupTimeoutJob
  | TerminateServeMachineJob
  | DeleteServeDataJob;

export type RunLifecycleJob = ProvisionRunJob | CheckStartupTimeoutJob | TerminateMachineJob;
export type ServeLifecycleJob = ProvisionServeJob | CheckServeStartupTimeoutJob | TerminateServeMachineJob;

export type CoreJobRecordInput = {
  type: CoreJobType;
  idempotencyKey: string;
  delayMs: number;
  payload: Record<string, unknown>;
};

function normalizeDelayMs(delayMs: number | undefined) {
  if (!Number.isFinite(delayMs)) {
    return 0;
  }
  return Math.max(0, Math.floor(delayMs ?? 0));
}

function jobKeyPart(value: string | number | boolean | undefined) {
  const text = String(value ?? "none").trim();
  return text || "none";
}

function runJobIdempotencyKey(runId: string, type: CoreJobType, ...parts: Array<string | number | boolean | undefined>) {
  return ["run", runId, type, ...parts.map(jobKeyPart)].join(":");
}

function serveJobIdempotencyKey(serveId: string, type: CoreJobType, ...parts: Array<string | number | boolean | undefined>) {
  return ["serve", serveId, type, ...parts.map(jobKeyPart)].join(":");
}

function normalizeArtifactKeys(keys: string[]) {
  return Array.from(new Set(keys.map((key) => key.trim()).filter(Boolean))).sort();
}

export function createProvisionRunJob(args: {
  runId: string;
  delayMs?: number;
}): ProvisionRunJob {
  return {
    type: CORE_JOB_TYPES.PROVISION_RUN,
    runId: args.runId,
    delayMs: normalizeDelayMs(args.delayMs),
    idempotencyKey: runJobIdempotencyKey(args.runId, CORE_JOB_TYPES.PROVISION_RUN),
  };
}

export function createCheckStartupTimeoutJob(args: {
  runId: string;
  delayMs: number;
  providerMachineId: string;
  fingerprint: StartupTimeoutFingerprint;
}): CheckStartupTimeoutJob {
  return {
    type: CORE_JOB_TYPES.CHECK_STARTUP_TIMEOUT,
    runId: args.runId,
    delayMs: normalizeDelayMs(args.delayMs),
    providerMachineId: args.providerMachineId,
    fingerprint: args.fingerprint,
    idempotencyKey: runJobIdempotencyKey(
      args.runId,
      CORE_JOB_TYPES.CHECK_STARTUP_TIMEOUT,
      args.providerMachineId,
    ),
  };
}

export function createTerminateMachineJob(args: {
  runId: string;
  delayMs?: number;
  providerMachineId: string;
  force: boolean;
  attempt?: number;
}): TerminateMachineJob {
  const attempt = args.attempt === undefined ? undefined : Math.max(0, Math.floor(args.attempt));
  return {
    type: CORE_JOB_TYPES.TERMINATE_MACHINE,
    runId: args.runId,
    delayMs: normalizeDelayMs(args.delayMs),
    providerMachineId: args.providerMachineId,
    force: args.force,
    attempt,
    idempotencyKey: runJobIdempotencyKey(
      args.runId,
      CORE_JOB_TYPES.TERMINATE_MACHINE,
      args.providerMachineId,
      args.force,
      attempt,
    ),
  };
}

export function createFinalizeArtifactJob(args: {
  runId: string;
  keys: string[];
  delayMs?: number;
}): FinalizeArtifactJob {
  const artifactKeys = normalizeArtifactKeys(args.keys);
  return {
    type: CORE_JOB_TYPES.FINALIZE_ARTIFACT,
    runId: args.runId,
    delayMs: normalizeDelayMs(args.delayMs),
    artifactKeys,
    idempotencyKey: runJobIdempotencyKey(
      args.runId,
      CORE_JOB_TYPES.FINALIZE_ARTIFACT,
      artifactKeys.join(","),
    ),
  };
}

export function createCleanupFailedUploadJob(args: {
  runId: string;
  key: string;
  reason?: string;
  delayMs?: number;
}): CleanupFailedUploadJob {
  return {
    type: CORE_JOB_TYPES.CLEANUP_FAILED_UPLOAD,
    runId: args.runId,
    delayMs: normalizeDelayMs(args.delayMs),
    artifactKey: args.key.trim(),
    reason: args.reason,
    idempotencyKey: runJobIdempotencyKey(
      args.runId,
      CORE_JOB_TYPES.CLEANUP_FAILED_UPLOAD,
      args.key.trim(),
    ),
  };
}

export function createProvisionServeJob(args: {
  serveId: string;
  delayMs?: number;
}): ProvisionServeJob {
  return {
    type: CORE_JOB_TYPES.PROVISION_SERVE,
    serveId: args.serveId,
    delayMs: normalizeDelayMs(args.delayMs),
    idempotencyKey: serveJobIdempotencyKey(args.serveId, CORE_JOB_TYPES.PROVISION_SERVE),
  };
}

export function createCheckServeStartupTimeoutJob(args: {
  serveId: string;
  delayMs: number;
  providerMachineId: string;
  startupTimeoutSeconds: number;
}): CheckServeStartupTimeoutJob {
  return {
    type: CORE_JOB_TYPES.CHECK_SERVE_STARTUP_TIMEOUT,
    serveId: args.serveId,
    delayMs: normalizeDelayMs(args.delayMs),
    providerMachineId: args.providerMachineId,
    startupTimeoutSeconds: Math.max(0, Math.floor(args.startupTimeoutSeconds)),
    idempotencyKey: serveJobIdempotencyKey(
      args.serveId,
      CORE_JOB_TYPES.CHECK_SERVE_STARTUP_TIMEOUT,
      args.providerMachineId,
    ),
  };
}

export function createTerminateServeMachineJob(args: {
  serveId: string;
  delayMs?: number;
  providerMachineId: string;
  force: boolean;
  attempt?: number;
}): TerminateServeMachineJob {
  const attempt = args.attempt === undefined ? undefined : Math.max(0, Math.floor(args.attempt));
  return {
    type: CORE_JOB_TYPES.TERMINATE_SERVE_MACHINE,
    serveId: args.serveId,
    delayMs: normalizeDelayMs(args.delayMs),
    providerMachineId: args.providerMachineId,
    force: args.force,
    attempt,
    idempotencyKey: serveJobIdempotencyKey(
      args.serveId,
      CORE_JOB_TYPES.TERMINATE_SERVE_MACHINE,
      args.providerMachineId,
      args.force,
      attempt,
    ),
  };
}

export function createDeleteServeDataJob(args: {
  serveId: string;
  delayMs?: number;
}): DeleteServeDataJob {
  return {
    type: CORE_JOB_TYPES.DELETE_SERVE_DATA,
    serveId: args.serveId,
    delayMs: normalizeDelayMs(args.delayMs),
    idempotencyKey: serveJobIdempotencyKey(args.serveId, CORE_JOB_TYPES.DELETE_SERVE_DATA),
  };
}

export function toCoreJobRecord(job: CoreJob): CoreJobRecordInput {
  if (job.type === CORE_JOB_TYPES.PROVISION_RUN) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        runId: job.runId,
      },
    };
  }
  if (job.type === CORE_JOB_TYPES.CHECK_STARTUP_TIMEOUT) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        runId: job.runId,
        providerMachineId: job.providerMachineId,
        fingerprint: job.fingerprint,
      },
    };
  }
  if (job.type === CORE_JOB_TYPES.TERMINATE_MACHINE) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        runId: job.runId,
        providerMachineId: job.providerMachineId,
        force: job.force,
        attempt: job.attempt,
      },
    };
  }
  if (job.type === CORE_JOB_TYPES.FINALIZE_ARTIFACT) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        runId: job.runId,
        artifactKeys: job.artifactKeys,
      },
    };
  }
  if (job.type === CORE_JOB_TYPES.PROVISION_SERVE) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        serveId: job.serveId,
      },
    };
  }
  if (job.type === CORE_JOB_TYPES.CHECK_SERVE_STARTUP_TIMEOUT) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        serveId: job.serveId,
        providerMachineId: job.providerMachineId,
        startupTimeoutSeconds: job.startupTimeoutSeconds,
      },
    };
  }
  if (job.type === CORE_JOB_TYPES.TERMINATE_SERVE_MACHINE) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        serveId: job.serveId,
        providerMachineId: job.providerMachineId,
        force: job.force,
        attempt: job.attempt,
      },
    };
  }
  if (job.type === CORE_JOB_TYPES.DELETE_SERVE_DATA) {
    return {
      type: job.type,
      idempotencyKey: job.idempotencyKey,
      delayMs: job.delayMs,
      payload: {
        serveId: job.serveId,
      },
    };
  }
  return {
    type: job.type,
    idempotencyKey: job.idempotencyKey,
    delayMs: job.delayMs,
    payload: {
      runId: job.runId,
      artifactKey: job.artifactKey,
      reason: job.reason,
    },
  };
}
