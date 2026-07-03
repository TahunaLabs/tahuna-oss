import {
  createCheckServeStartupTimeoutJob,
  createProvisionServeJob,
  createTerminateServeMachineJob,
  type ServeLifecycleJob,
} from "@convex/core/jobQueue";

export type { ServeLifecycleJob } from "@convex/core/jobQueue";

export const SERVE_LIFECYCLE_STATUS = {
  QUEUED: "queued",
  PROVISIONING: "provisioning",
  STARTING: "starting",
  SERVING: "serving",
  STOPPING: "stopping",
  STOPPED: "stopped",
  FAILED: "failed",
} as const;

export type ServeLifecycleStatus = (typeof SERVE_LIFECYCLE_STATUS)[keyof typeof SERVE_LIFECYCLE_STATUS];

export const ACTIVE_SERVE_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  SERVE_LIFECYCLE_STATUS.QUEUED,
  SERVE_LIFECYCLE_STATUS.PROVISIONING,
  SERVE_LIFECYCLE_STATUS.STARTING,
  SERVE_LIFECYCLE_STATUS.SERVING,
  SERVE_LIFECYCLE_STATUS.STOPPING,
]);

export const TERMINAL_SERVE_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  SERVE_LIFECYCLE_STATUS.STOPPED,
  SERVE_LIFECYCLE_STATUS.FAILED,
]);

export type ServeLifecycleServeState = {
  serveId: string;
  status: string;
  providerMachineId?: string;
  computeSessionId?: string;
  runtimeTokenHash?: string;
  computeStartedAt?: number;
  computeEndedAt?: number;
  error?: string;
};

export type ServeLifecyclePatch = {
  status?: string;
  error?: string;
  providerMachineId?: string;
  runtimeTokenHash?: string;
  computeStartedAt?: number;
  computeEndedAt?: number;
};

export type ServeLifecycleEvent = {
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
  includeTerminalTiming?: boolean;
};

export type ServeLifecyclePlan = {
  patch?: ServeLifecyclePatch;
  events?: ServeLifecycleEvent[];
  jobs?: ServeLifecycleJob[];
};

function serveEvent(
  status: string,
  message: string,
  metadata?: Record<string, unknown>,
): ServeLifecycleEvent {
  return { status, message, ...(metadata ? { metadata } : {}) };
}

function terminalServeEvent(
  status: string,
  message: string,
  metadata?: Record<string, unknown>,
): ServeLifecycleEvent {
  return {
    ...serveEvent(status, message, metadata),
    includeTerminalTiming: true,
  };
}

function compactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

function optionalCompactMetadata(metadata: Record<string, unknown>) {
  const compacted = compactMetadata(metadata);
  return Object.keys(compacted).length === 0 ? undefined : compacted;
}

function normalizeMachineId(providerMachineId: string | undefined) {
  return providerMachineId?.trim() || "";
}

export function sanitizeServeRuntimeMessage(message: string | undefined) {
  const trimmed = (message || "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, 4000);
}

export function defaultServeStatusMessage(status: string) {
  if (status === SERVE_LIFECYCLE_STATUS.PROVISIONING) return "serve provisioning";
  if (status === SERVE_LIFECYCLE_STATUS.STARTING) return "serve starting";
  if (status === SERVE_LIFECYCLE_STATUS.SERVING) return "serve healthy and serving";
  if (status === SERVE_LIFECYCLE_STATUS.STOPPING) return "serve stopping";
  if (status === SERVE_LIFECYCLE_STATUS.STOPPED) return "serve stopped";
  return "serve failed";
}

export function canTransitionServeStatus(current: string, next: string) {
  if (current === next) {
    return true;
  }
  if (current === SERVE_LIFECYCLE_STATUS.QUEUED) {
    return next === SERVE_LIFECYCLE_STATUS.PROVISIONING || next === SERVE_LIFECYCLE_STATUS.FAILED;
  }
  if (current === SERVE_LIFECYCLE_STATUS.PROVISIONING) {
    return (
      next === SERVE_LIFECYCLE_STATUS.STARTING ||
      next === SERVE_LIFECYCLE_STATUS.STOPPING ||
      next === SERVE_LIFECYCLE_STATUS.FAILED
    );
  }
  if (current === SERVE_LIFECYCLE_STATUS.STARTING) {
    return (
      next === SERVE_LIFECYCLE_STATUS.SERVING ||
      next === SERVE_LIFECYCLE_STATUS.STOPPING ||
      next === SERVE_LIFECYCLE_STATUS.FAILED
    );
  }
  if (current === SERVE_LIFECYCLE_STATUS.SERVING) {
    return next === SERVE_LIFECYCLE_STATUS.STOPPING || next === SERVE_LIFECYCLE_STATUS.FAILED;
  }
  if (current === SERVE_LIFECYCLE_STATUS.STOPPING) {
    return next === SERVE_LIFECYCLE_STATUS.STOPPED;
  }
  return false;
}

export function planServeProvisioningJobs(args: {
  serveId: string;
  enqueueProvisioning: boolean;
}) {
  return args.enqueueProvisioning ? [createProvisionServeJob({ serveId: args.serveId })] : [];
}

export function planForcedServeMachineTermination(args: {
  serveId: string;
  providerMachineId?: string;
}): ServeLifecycleJob[] {
  const providerMachineId = normalizeMachineId(args.providerMachineId);
  if (!providerMachineId) {
    return [];
  }
  return [
    createTerminateServeMachineJob({
      serveId: args.serveId,
      providerMachineId,
      force: true,
    }),
  ];
}

export function planServeStop(args: {
  serve: ServeLifecycleServeState;
  force: boolean;
}): ServeLifecyclePlan & { resultStatus: string } {
  if (args.serve.status === SERVE_LIFECYCLE_STATUS.STOPPING) {
    return { resultStatus: SERVE_LIFECYCLE_STATUS.STOPPING };
  }
  if (TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)) {
    return { resultStatus: args.serve.status };
  }

  const providerMachineId = normalizeMachineId(args.serve.providerMachineId);
  const nextStatus = providerMachineId
    ? SERVE_LIFECYCLE_STATUS.STOPPING
    : SERVE_LIFECYCLE_STATUS.STOPPED;

  return {
    resultStatus: nextStatus,
    patch: {
      status: nextStatus,
      runtimeTokenHash: nextStatus === SERVE_LIFECYCLE_STATUS.STOPPED ? "revoked" : args.serve.runtimeTokenHash,
    },
    events: [
      (nextStatus === SERVE_LIFECYCLE_STATUS.STOPPED ? terminalServeEvent : serveEvent)(
        nextStatus,
        nextStatus === SERVE_LIFECYCLE_STATUS.STOPPING
          ? args.force
            ? "force stop requested"
            : "stop requested"
          : "serve stopped before runtime start",
        {
          source: "control-plane",
          forced: args.force,
        },
      ),
    ],
    jobs: providerMachineId
      ? [
          createTerminateServeMachineJob({
            serveId: args.serve.serveId,
            providerMachineId,
            force: true,
          }),
        ]
      : [],
  };
}

export function planServeComputeSessionStop(args: {
  serve: ServeLifecycleServeState;
  computeSessionId: string;
  force: boolean;
}): ServeLifecyclePlan & { resultStatus: string } {
  if (args.serve.status === SERVE_LIFECYCLE_STATUS.STOPPING) {
    return { resultStatus: SERVE_LIFECYCLE_STATUS.STOPPING };
  }
  if (TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)) {
    return { resultStatus: args.serve.status };
  }
  return {
    resultStatus: SERVE_LIFECYCLE_STATUS.STOPPING,
    patch: {
      status: SERVE_LIFECYCLE_STATUS.STOPPING,
      runtimeTokenHash: args.serve.runtimeTokenHash,
    },
    events: [
      serveEvent(SERVE_LIFECYCLE_STATUS.STOPPING, args.force ? "force stop requested" : "stop requested", {
        source: "control-plane",
        forced: args.force,
        compute_session_id: args.computeSessionId,
      }),
    ],
    jobs: [],
  };
}

export function planServeMachineProvisioned(args: {
  serve: ServeLifecycleServeState;
  providerMachineId: string;
  providerMetadata?: unknown;
  startupTimeout?: {
    delayMs: number;
    startupTimeoutSeconds: number;
  };
}): ServeLifecyclePlan {
  if (
    args.serve.status === SERVE_LIFECYCLE_STATUS.STOPPING ||
    TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)
  ) {
    return {};
  }
  return {
    patch: {
      providerMachineId: args.providerMachineId,
    },
    events: [
      serveEvent(SERVE_LIFECYCLE_STATUS.PROVISIONING, "gpu machine provisioned", {
        provider_machine_id: args.providerMachineId,
        provider_metadata: args.providerMetadata,
      }),
    ],
    jobs: args.startupTimeout
      ? [
          createCheckServeStartupTimeoutJob({
            serveId: args.serve.serveId,
            delayMs: args.startupTimeout.delayMs,
            providerMachineId: args.providerMachineId,
            startupTimeoutSeconds: args.startupTimeout.startupTimeoutSeconds,
          }),
        ]
      : [],
  };
}

export function shouldEnforceServeStartupTimeout(args: {
  state:
    | {
        status: string;
        providerMachineId?: string | null;
      }
    | null;
  providerMachineId: string;
}) {
  const state = args.state;
  if (!state || TERMINAL_SERVE_LIFECYCLE_STATUSES.has(state.status)) {
    return false;
  }
  if (state.status !== SERVE_LIFECYCLE_STATUS.PROVISIONING) {
    return false;
  }
  return (state.providerMachineId || "") === args.providerMachineId;
}

export function planServeFailure(args: {
  serve: ServeLifecycleServeState;
  error: string;
  provisioningPayload?: unknown;
}): ServeLifecyclePlan {
  if (
    args.serve.status === SERVE_LIFECYCLE_STATUS.STOPPING ||
    TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)
  ) {
    return {};
  }
  const errorText = sanitizeServeRuntimeMessage(args.error) || "serve failed";
  return {
    patch: {
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: errorText,
      runtimeTokenHash: "revoked",
    },
    events: [
      terminalServeEvent(
        SERVE_LIFECYCLE_STATUS.FAILED,
        errorText,
        optionalCompactMetadata({
          provisioning_payload: args.provisioningPayload,
          compute_session_id: args.serve.computeSessionId,
        }),
      ),
    ],
    jobs: args.serve.computeSessionId
      ? []
      : planForcedServeMachineTermination({
          serveId: args.serve.serveId,
          providerMachineId: args.serve.providerMachineId,
        }),
  };
}

export function planServeStoppedAfterTermination(args: {
  serve: ServeLifecycleServeState;
  force: boolean;
}): ServeLifecyclePlan {
  if (args.serve.status !== SERVE_LIFECYCLE_STATUS.STOPPING) {
    return {};
  }
  return {
    patch: {
      status: SERVE_LIFECYCLE_STATUS.STOPPED,
      runtimeTokenHash: "revoked",
    },
    events: [
      terminalServeEvent(
        SERVE_LIFECYCLE_STATUS.STOPPED,
        args.force ? "force stop completed" : "stop completed",
        {
          source: "control-plane",
          forced: args.force,
        },
      ),
    ],
  };
}

export function planServeStopTerminationFailed(args: {
  serve: ServeLifecycleServeState;
  error: string;
}): ServeLifecyclePlan {
  if (TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)) {
    return {};
  }
  const errorText =
    sanitizeServeRuntimeMessage(args.error) ||
    "failed to terminate serve machine";
  return {
    patch: {
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: `serve stop failed: ${errorText}`,
      runtimeTokenHash: "revoked",
    },
    events: [
      terminalServeEvent(SERVE_LIFECYCLE_STATUS.FAILED, "serve machine termination failed", {
        error: errorText,
        source: "control-plane",
      }),
    ],
  };
}

export function planServeComputeSessionBillingFailure(args: {
  serve: ServeLifecycleServeState;
  computeSessionId: string;
}): ServeLifecyclePlan {
  if (TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)) {
    return {};
  }
  const message = "serve compute terminated because credits are exhausted";
  return {
    patch: {
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: message,
      runtimeTokenHash: "revoked",
      providerMachineId: undefined,
    },
    events: [
      terminalServeEvent(SERVE_LIFECYCLE_STATUS.FAILED, message, {
        source: "compute-session-billing",
        compute_session_id: args.computeSessionId,
      }),
    ],
    jobs: [],
  };
}

export function planServeComputeSessionTerminationFailed(args: {
  serve: ServeLifecycleServeState;
  computeSessionId: string;
  error: string;
}): ServeLifecyclePlan {
  if (TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)) {
    return {};
  }
  const errorText =
    sanitizeServeRuntimeMessage(args.error) ||
    "failed to terminate compute session";
  return {
    patch: {
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: `serve compute termination failed: ${errorText}`,
      runtimeTokenHash: "revoked",
    },
    events: [
      terminalServeEvent(SERVE_LIFECYCLE_STATUS.FAILED, "serve compute termination failed", {
        source: "compute-session",
        compute_session_id: args.computeSessionId,
        error: errorText,
      }),
    ],
    jobs: [],
  };
}

export function planServeTerminationRetry(args: {
  serve: ServeLifecycleServeState;
  providerMachineId: string;
  force: boolean;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: string;
}): ServeLifecyclePlan {
  return {
    events: [
      serveEvent(
        args.serve.status,
        `retrying serve machine termination (attempt ${args.attempt}/${args.maxAttempts})`,
        {
          error: args.error,
          source: "control-plane",
        },
      ),
    ],
    jobs: [
      createTerminateServeMachineJob({
        serveId: args.serve.serveId,
        delayMs: args.delayMs,
        providerMachineId: args.providerMachineId,
        force: args.force,
        attempt: args.attempt,
      }),
    ],
  };
}

export function planServeRuntimeStatusIngestion(args: {
  serve: ServeLifecycleServeState;
  status: ServeLifecycleStatus;
  message?: string;
  error?: string;
  nowMs: number;
}): ServeLifecyclePlan & { resultStatus: string; error?: string } {
  if (TERMINAL_SERVE_LIFECYCLE_STATUSES.has(args.serve.status)) {
    return { resultStatus: args.serve.status };
  }

  let nextStatus: string = args.status;
  if (
    args.serve.status === SERVE_LIFECYCLE_STATUS.STOPPING &&
    (args.status === SERVE_LIFECYCLE_STATUS.PROVISIONING ||
      args.status === SERVE_LIFECYCLE_STATUS.STARTING ||
      args.status === SERVE_LIFECYCLE_STATUS.SERVING)
  ) {
    return { resultStatus: SERVE_LIFECYCLE_STATUS.STOPPING };
  }
  if (
    args.serve.status === SERVE_LIFECYCLE_STATUS.STOPPING &&
    (args.status === SERVE_LIFECYCLE_STATUS.FAILED || args.status === SERVE_LIFECYCLE_STATUS.STOPPED)
  ) {
    nextStatus = SERVE_LIFECYCLE_STATUS.STOPPED;
  }
  if (!canTransitionServeStatus(args.serve.status, nextStatus)) {
    return {
      resultStatus: args.serve.status,
      error: `invalid serve status transition: ${args.serve.status} -> ${nextStatus}`,
    };
  }

  const patch: ServeLifecyclePatch = { status: nextStatus };
  if (nextStatus === SERVE_LIFECYCLE_STATUS.FAILED) {
    patch.error = sanitizeServeRuntimeMessage(args.error || args.message || "serve failed") || "serve failed";
    patch.runtimeTokenHash = "revoked";
  }
  if (nextStatus === SERVE_LIFECYCLE_STATUS.SERVING) {
    patch.computeStartedAt = args.serve.computeStartedAt ?? args.nowMs;
  }
  if (nextStatus === SERVE_LIFECYCLE_STATUS.STOPPED) {
    patch.runtimeTokenHash = "revoked";
  }
  if (nextStatus !== SERVE_LIFECYCLE_STATUS.FAILED && args.serve.error) {
    patch.error = undefined;
  }

  return {
    resultStatus: nextStatus,
    patch,
    events: [
      (nextStatus === SERVE_LIFECYCLE_STATUS.FAILED || nextStatus === SERVE_LIFECYCLE_STATUS.STOPPED
          ? terminalServeEvent
          : serveEvent)(
        nextStatus,
        sanitizeServeRuntimeMessage(
          nextStatus === SERVE_LIFECYCLE_STATUS.FAILED
            ? args.error || args.message || defaultServeStatusMessage(nextStatus)
            : args.message || defaultServeStatusMessage(nextStatus),
        ) || defaultServeStatusMessage(nextStatus),
        compactMetadata({
          source: "serve-runtime",
          compute_session_id: args.serve.computeSessionId,
        }),
      ),
    ],
    jobs:
      !args.serve.computeSessionId &&
      (nextStatus === SERVE_LIFECYCLE_STATUS.FAILED || nextStatus === SERVE_LIFECYCLE_STATUS.STOPPED)
        ? planForcedServeMachineTermination({
            serveId: args.serve.serveId,
            providerMachineId: args.serve.providerMachineId,
          })
        : [],
  };
}

export function mergeServeEventMetadata(event: ServeLifecycleEvent) {
  return event.metadata ? compactMetadata(event.metadata) : undefined;
}
