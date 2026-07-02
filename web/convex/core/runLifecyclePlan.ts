import {
  createCheckStartupTimeoutJob,
  createProvisionRunJob,
  createTerminateMachineJob,
  type RunLifecycleJob,
  type StartupTimeoutFingerprint,
} from "@convex/core/jobQueue";
import { storageKeys } from "@convex/core/storage";

export type { RunLifecycleJob } from "@convex/core/jobQueue";

export const RUN_LIFECYCLE_STATUS = {
  QUEUED: "queued", PROVISIONING: "provisioning", RUNNING: "running", CANCELLING: "cancelling",
  COMPLETED: "completed", FAILED: "failed", CANCELLED: "cancelled",
} as const;

export type RunLifecycleStatus = (typeof RUN_LIFECYCLE_STATUS)[keyof typeof RUN_LIFECYCLE_STATUS];

export const ACTIVE_RUN_STATUSES: ReadonlySet<string> = new Set([
  RUN_LIFECYCLE_STATUS.QUEUED, RUN_LIFECYCLE_STATUS.PROVISIONING,
  RUN_LIFECYCLE_STATUS.RUNNING, RUN_LIFECYCLE_STATUS.CANCELLING,
]);

export const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  RUN_LIFECYCLE_STATUS.COMPLETED, RUN_LIFECYCLE_STATUS.FAILED, RUN_LIFECYCLE_STATUS.CANCELLED,
]);

export type RunLifecycleRunState = {
  runId: string;
  status: string;
  computeSessionId?: string;
  cancellationRequested?: boolean;
  providerMachineId?: string;
  computeStartedAt?: number;
  computeEndedAt?: number;
  runtimeTokenHash?: string;
  artifactKeys?: string[];
  output?: string;
};

export type RunLifecyclePatch = {
  status?: string;
  cancellationRequested?: boolean;
  providerMachineId?: string;
  providerCreationTime?: number;
  computeStartedAt?: number;
  computeEndedAt?: number;
  runtimeTokenHash?: string;
  error?: string;
  artifactKeys?: string[];
};

export type RunLifecycleEvent = {
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
  includeTerminalTiming?: boolean;
};

export type RunLifecycleStorageOperation = {
  type: "delete_indexed_storage_keys";
  keys: string[];
};

export type RunLifecyclePlan = {
  patch?: RunLifecyclePatch;
  events?: RunLifecycleEvent[];
  jobs?: RunLifecycleJob[];
  storageOperations?: RunLifecycleStorageOperation[];
};

export function isActiveRunStatus(status: string) {
  return ACTIVE_RUN_STATUSES.has(status);
}

export function isTerminalRunStatus(status: string) {
  return TERMINAL_RUN_STATUSES.has(status);
}

function runEvent(
  status: string,
  message: string,
  metadata?: Record<string, unknown>,
): RunLifecycleEvent {
  return { status, message, ...(metadata ? { metadata } : {}) };
}

function terminalRunEvent(
  status: string,
  message: string,
  metadata?: Record<string, unknown>,
): RunLifecycleEvent {
  return {
    ...runEvent(status, message, metadata),
    includeTerminalTiming: true,
  };
}

function provisioningPayloadMetadata(
  provisioningPayload: unknown,
  fetchStrategy: string,
) {
  return provisioningPayload === undefined
    ? undefined
    : {
        provisioning_payload: provisioningPayload,
        fetch_strategy: fetchStrategy,
      };
}

function compactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

function normalizeMachineId(providerMachineId: string | undefined) {
  return providerMachineId?.trim() || "";
}

export function sanitizeRuntimeMessage(message: string | undefined) {
  const trimmed = (message || "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, 4000);
}

export function planRunCreation(args: {
  userId: string;
  environmentId: string;
  name: string;
  command: string[];
  dataId: string;
  outputDir?: string;
  effectiveGpuType: string;
  effectiveGpuCount: number;
  effectiveVolumeGb: number;
  codeManifestHash: string;
  dataManifestHash?: string;
  dependencyGroup: string;
  nowMs: number;
  enqueueProvisioning: boolean;
}) {
  const outputDir = args.outputDir ?? "outputs";
  const runPrefix = storageKeys.runExecutionPrefix(args.environmentId, args.nowMs);
  return {
    run: {
      userId: args.userId,
      environmentId: args.environmentId,
      name: args.name,
      command: args.command,
      dataId: args.dataId,
      outputDir,
      input: `${runPrefix}/input`,
      output: `${runPrefix}/output`,
      logs: `${runPrefix}/logs`,
      status: RUN_LIFECYCLE_STATUS.QUEUED,
      cancellationRequested: false,
      effectiveGpuType: args.effectiveGpuType,
      effectiveGpuCount: args.effectiveGpuCount,
      effectiveVolumeGb: args.effectiveVolumeGb,
      codeManifestHash: args.codeManifestHash,
      dataManifestHash: args.dataManifestHash || undefined,
      dependencyGroup: args.dependencyGroup,
    },
    event: {
      status: RUN_LIFECYCLE_STATUS.QUEUED,
      message: "run queued for provisioning",
      metadata: {
        name: args.name,
        command: args.command,
        gpu_type: args.effectiveGpuType,
        gpu_count: args.effectiveGpuCount,
        volume_gb: args.effectiveVolumeGb,
        code_manifest_hash: args.codeManifestHash || null,
        data_manifest_hash: args.dataManifestHash || null,
        dependency_group: args.dependencyGroup,
      },
    },
    enqueueProvisioning: args.enqueueProvisioning,
  };
}

export function planRunProvisioningJobs(args: {
  runId: string;
  enqueueProvisioning: boolean;
}) {
  return args.enqueueProvisioning ? [createProvisionRunJob({ runId: args.runId })] : [];
}

export function planRunCancellation(args: {
  run: RunLifecycleRunState;
  force: boolean;
  terminationGraceMs: number;
}): RunLifecyclePlan & { error?: string } {
  if (isTerminalRunStatus(args.run.status)) {
    return {
      error: `run is already ${args.run.status}`,
    };
  }

  const providerMachineId = normalizeMachineId(args.run.providerMachineId);
  if (!providerMachineId) {
    return {
      patch: {
        status: RUN_LIFECYCLE_STATUS.CANCELLED,
        cancellationRequested: true,
      },
      events: [
        terminalRunEvent(
          RUN_LIFECYCLE_STATUS.CANCELLED,
          args.force
            ? "force cancellation requested before provisioning"
            : "run cancelled before provisioning",
        ),
      ],
    };
  }

  return {
    patch: {
      status: RUN_LIFECYCLE_STATUS.CANCELLING,
      cancellationRequested: true,
    },
    events: [
      runEvent(
        RUN_LIFECYCLE_STATUS.CANCELLING,
        args.force
          ? "force cancellation requested"
          : `cancellation requested (grace period ${Math.floor(args.terminationGraceMs / 1000)}s before termination)`,
      ),
    ],
    jobs: args.run.computeSessionId
      ? []
      : [
          createTerminateMachineJob({
            runId: args.run.runId,
            delayMs: args.force ? 0 : args.terminationGraceMs,
            providerMachineId,
            force: args.force,
          }),
        ],
  };
}

export function planForcedMachineTermination(args: {
  runId: string;
  providerMachineId?: string;
}): RunLifecycleJob[] {
  const providerMachineId = normalizeMachineId(args.providerMachineId);
  if (!providerMachineId) {
    return [];
  }
  return [
    createTerminateMachineJob({
      runId: args.runId,
      providerMachineId,
      force: true,
    }),
  ];
}

export function planRunDeletion(args: {
  run: RunLifecycleRunState;
  cancelActive: boolean;
  force: boolean;
}): RunLifecyclePlan & { error?: string; cancelBeforeDelete?: boolean; deleteRunData: boolean } {
  if (isActiveRunStatus(args.run.status)) {
    if (!args.cancelActive) {
      return {
        error: "run is active; cancel it before deleting",
        deleteRunData: false,
      };
    }
    if (!args.force) {
      return {
        cancelBeforeDelete: true,
        deleteRunData: false,
      };
    }
  }

  return {
    jobs: args.run.computeSessionId
      ? []
      : planForcedMachineTermination({
          runId: args.run.runId,
          providerMachineId: args.run.providerMachineId,
        }),
    storageOperations: [
      {
        type: "delete_indexed_storage_keys",
        keys: args.run.artifactKeys || [],
      },
    ],
    deleteRunData: true,
  };
}

export function planRunRenameEvent(args: {
  status: string;
  oldName: string;
  newName: string;
}): RunLifecycleEvent {
  return runEvent(args.status, "run renamed", {
    old_name: args.oldName,
    new_name: args.newName,
  });
}

export function shouldAbortProvisioning(run: RunLifecycleRunState | null | undefined) {
  if (!run) {
    return true;
  }
  return Boolean(run.cancellationRequested) || isTerminalRunStatus(run.status);
}

export function shouldTerminateMachine(args: {
  run: RunLifecycleRunState | null | undefined;
  force: boolean;
}) {
  if (args.force) {
    return true;
  }
  if (!args.run || !args.run.cancellationRequested) {
    return false;
  }
  return isActiveRunStatus(args.run.status);
}

export function planMachineProvisioned(args: {
  run: RunLifecycleRunState;
  providerMachineId: string;
  providerCreationTime?: number;
  providerMetadata?: unknown;
  startupTimeout?: {
    delayMs: number;
    fingerprint: StartupTimeoutFingerprint;
  };
}): RunLifecyclePlan {
  if (shouldAbortProvisioning(args.run)) {
    return {};
  }
  return {
    patch: {
      providerMachineId: args.providerMachineId,
      ...(args.providerCreationTime ? { providerCreationTime: args.providerCreationTime } : {}),
    },
    events: [
      runEvent(RUN_LIFECYCLE_STATUS.PROVISIONING, "gpu machine provisioned", {
        provider_machine_id: args.providerMachineId,
        provider_metadata: args.providerMetadata,
      }),
    ],
    jobs: args.startupTimeout
      ? [
          createCheckStartupTimeoutJob({
            runId: args.run.runId,
            delayMs: args.startupTimeout.delayMs,
            providerMachineId: args.providerMachineId,
            fingerprint: args.startupTimeout.fingerprint,
          }),
        ]
      : [],
  };
}

export function planProvisioningStarted(args: {
  run: RunLifecycleRunState;
  provisioningPayload?: unknown;
}): RunLifecyclePlan {
  if (args.run.cancellationRequested) {
    return {
      patch: {
        status: RUN_LIFECYCLE_STATUS.CANCELLED,
      },
    };
  }
  if (isTerminalRunStatus(args.run.status)) {
    return {};
  }
  return {
    patch: {
      status: RUN_LIFECYCLE_STATUS.PROVISIONING,
    },
    events: [
      runEvent(
        RUN_LIFECYCLE_STATUS.PROVISIONING,
        "runtime bootstrap started",
        provisioningPayloadMetadata(
          args.provisioningPayload,
          "runtime bootstrap downloads pinned code/data manifests and blobs into /workspace",
        ),
      ),
    ],
  };
}

export function planMachineRunning(args: {
  run: RunLifecycleRunState;
  provisioningPayload?: unknown;
  nowMs: number;
}): RunLifecyclePlan {
  if (args.run.cancellationRequested) {
    return {
      patch: {
        status: RUN_LIFECYCLE_STATUS.CANCELLED,
      },
    };
  }
  if (isTerminalRunStatus(args.run.status)) {
    return {};
  }
  return {
    patch: {
      status: RUN_LIFECYCLE_STATUS.RUNNING,
      computeStartedAt: args.run.computeStartedAt ?? args.nowMs,
    },
    events: [
      runEvent(
        RUN_LIFECYCLE_STATUS.RUNNING,
        "machine running",
        provisioningPayloadMetadata(
          args.provisioningPayload,
          "machine runtime is active and reporting logs/metrics via runtime endpoints",
        ),
      ),
    ],
  };
}

export function planRunFailure(args: {
  run: RunLifecycleRunState;
  error: string;
  provisioningPayload?: unknown;
}): RunLifecyclePlan {
  if (isTerminalRunStatus(args.run.status)) {
    return {};
  }
  const errorText = args.error.trim() || "runtime bootstrap failed";
  return {
    patch: {
      status: RUN_LIFECYCLE_STATUS.FAILED,
      error: errorText,
      runtimeTokenHash: "revoked",
    },
    events: [
      terminalRunEvent(
        RUN_LIFECYCLE_STATUS.FAILED,
        errorText,
        args.provisioningPayload === undefined
          ? undefined
          : {
              provisioning_payload: args.provisioningPayload,
            },
      ),
    ],
    jobs: args.run.computeSessionId
      ? []
      : planForcedMachineTermination({
          runId: args.run.runId,
          providerMachineId: args.run.providerMachineId,
        }),
  };
}

export function planCancellationTerminationCompleted(args: {
  run: RunLifecycleRunState;
  force: boolean;
}): RunLifecyclePlan {
  if (!args.run.cancellationRequested || isTerminalRunStatus(args.run.status)) {
    return {};
  }
  return {
    patch: {
      status: RUN_LIFECYCLE_STATUS.CANCELLED,
    },
    events: [
      terminalRunEvent(
        RUN_LIFECYCLE_STATUS.CANCELLED,
        args.force ? "force cancellation completed" : "cancellation completed",
      ),
    ],
  };
}

export function planCancellationTerminationFailed(args: {
  run: RunLifecycleRunState;
  error: string;
}): RunLifecyclePlan {
  if (!args.run.cancellationRequested || isTerminalRunStatus(args.run.status)) {
    return {};
  }
  const errorText =
    sanitizeRuntimeMessage(args.error) ||
    "failed to terminate machine during cancellation";
  return {
    patch: {
      status: RUN_LIFECYCLE_STATUS.FAILED,
      error: `cancellation failed: ${errorText}`,
      runtimeTokenHash: "revoked",
    },
    events: [
      terminalRunEvent(
        RUN_LIFECYCLE_STATUS.FAILED,
        "cancellation termination failed",
        {
          error: errorText,
        },
      ),
    ],
  };
}

export function planTerminationRetry(args: {
  run: RunLifecycleRunState;
  providerMachineId: string;
  force: boolean;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: string;
}): RunLifecyclePlan {
  if (!args.run.cancellationRequested || isTerminalRunStatus(args.run.status)) {
    return {};
  }
  return {
    events: [
      runEvent(
        RUN_LIFECYCLE_STATUS.CANCELLING,
        `retrying machine termination (attempt ${args.attempt}/${args.maxAttempts})`,
        {
          error: args.error,
        },
      ),
    ],
    jobs: [
      createTerminateMachineJob({
        runId: args.run.runId,
        delayMs: args.delayMs,
        providerMachineId: args.providerMachineId,
        force: args.force,
        attempt: args.attempt,
      }),
    ],
  };
}

export function shouldEnforceStartupTimeout(args: {
  state:
    | {
        status: string;
        cancellationRequested: boolean;
        providerMachineId?: string;
      }
    | null;
  providerMachineId: string;
}) {
  const state = args.state;
  if (!state || state.cancellationRequested || isTerminalRunStatus(state.status)) {
    return false;
  }
  if (state.status !== RUN_LIFECYCLE_STATUS.PROVISIONING) {
    return false;
  }
  return (state.providerMachineId || "") === args.providerMachineId;
}

export function planRuntimeStatusIngestion(args: {
  run: RunLifecycleRunState;
  status: RunLifecycleStatus;
  message?: string;
  error?: string;
  nowMs: number;
  terminateMachine?: boolean;
}): RunLifecyclePlan & { resultStatus: string } {
  if (isTerminalRunStatus(args.run.status)) {
    return {
      resultStatus: args.run.status,
    };
  }

  let status: string = args.status;
  if (
    args.run.cancellationRequested &&
    (status === RUN_LIFECYCLE_STATUS.PROVISIONING ||
      status === RUN_LIFECYCLE_STATUS.RUNNING)
  ) {
    status = RUN_LIFECYCLE_STATUS.CANCELLED;
  }
  if (
    args.run.status === RUN_LIFECYCLE_STATUS.RUNNING &&
    status === RUN_LIFECYCLE_STATUS.PROVISIONING
  ) {
    status = RUN_LIFECYCLE_STATUS.RUNNING;
  }

  if (status === RUN_LIFECYCLE_STATUS.FAILED) {
    const errorText =
      sanitizeRuntimeMessage(args.error || args.message || "runtime failed") ||
      "runtime failed";
    return {
      patch: {
        status: RUN_LIFECYCLE_STATUS.FAILED,
        error: errorText,
        runtimeTokenHash: "revoked",
      },
      events: [
        terminalRunEvent(RUN_LIFECYCLE_STATUS.FAILED, errorText, {
          source: "machine-runtime",
        }),
      ],
      jobs: args.terminateMachine === false || args.run.computeSessionId
        ? []
        : planForcedMachineTermination({
            runId: args.run.runId,
            providerMachineId: args.run.providerMachineId,
          }),
      resultStatus: RUN_LIFECYCLE_STATUS.FAILED,
    };
  }

  const patch: RunLifecyclePatch = { status };
  if (status === RUN_LIFECYCLE_STATUS.RUNNING) {
    patch.computeStartedAt = args.run.computeStartedAt ?? args.nowMs;
  }
  const isTerminalStatus =
    status === RUN_LIFECYCLE_STATUS.COMPLETED ||
    status === RUN_LIFECYCLE_STATUS.CANCELLED;
  if (isTerminalStatus) {
    patch.runtimeTokenHash = "revoked";
  }

  const message =
    sanitizeRuntimeMessage(args.message || `runtime status: ${status}`) ||
    `runtime status: ${status}`;
  const transition = {
    patch,
    events: [
      (isTerminalStatus ? terminalRunEvent : runEvent)(status, message, {
        source: "machine-runtime",
      }),
    ],
    jobs: isTerminalStatus && args.terminateMachine !== false && !args.run.computeSessionId
      ? planForcedMachineTermination({
          runId: args.run.runId,
          providerMachineId: args.run.providerMachineId,
        })
      : [],
  };
  return {
    ...transition,
    resultStatus: status,
  };
}

export function isRunArtifactKey(outputPath: string, key: string) {
  const base = outputPath.trim();
  const candidate = key.trim();
  if (!base || !candidate) {
    return false;
  }
  return candidate.startsWith(`${base}/`);
}

export type RuntimeArtifact = {
  key: string;
  size: number;
  providerCreationTime: number;
};

export function planRuntimeArtifactCommit(args: {
  outputPath: string;
  existingArtifactKeys: string[];
  artifacts: RuntimeArtifact[];
}) {
  const seen = new Set(args.existingArtifactKeys);
  const acceptedArtifacts: RuntimeArtifact[] = [];
  const newKeys: string[] = [];
  for (const artifact of args.artifacts) {
    if (!isRunArtifactKey(args.outputPath, artifact.key)) {
      continue;
    }
    if (!seen.has(artifact.key)) {
      seen.add(artifact.key);
      newKeys.push(artifact.key);
    }
    acceptedArtifacts.push(artifact);
  }
  return {
    acceptedArtifacts,
    patch:
      newKeys.length > 0
        ? {
            artifactKeys: [...args.existingArtifactKeys, ...newKeys],
          }
        : undefined,
    acceptedCount: newKeys.length,
  };
}

export function mergeRunEventMetadata(
  event: RunLifecycleEvent,
  metadata: Record<string, unknown> | undefined,
) {
  if (!metadata) {
    return event.metadata ? compactMetadata(event.metadata) : undefined;
  }
  return compactMetadata({
    ...(event.metadata || {}),
    ...metadata,
  });
}
