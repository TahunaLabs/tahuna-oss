export const COMPUTE_SESSION_STATUS = {
  PROVISIONING: "provisioning",
  IDLE: "idle",
  RUNNING: "running",
  TERMINATING: "terminating",
  TERMINATED: "terminated",
  FAILED: "failed",
} as const;

export type ComputeSessionStatus = (typeof COMPUTE_SESSION_STATUS)[keyof typeof COMPUTE_SESSION_STATUS];

export const ACTIVE_COMPUTE_SESSION_STATUSES: ReadonlySet<string> = new Set([
  COMPUTE_SESSION_STATUS.PROVISIONING,
  COMPUTE_SESSION_STATUS.IDLE,
  COMPUTE_SESSION_STATUS.RUNNING,
  COMPUTE_SESSION_STATUS.TERMINATING,
]);

export const TERMINAL_COMPUTE_SESSION_STATUSES: ReadonlySet<string> = new Set([
  COMPUTE_SESSION_STATUS.TERMINATED,
  COMPUTE_SESSION_STATUS.FAILED,
]);

export type ComputeSessionState = {
  computeSessionId: string;
  status: string;
  providerMachineId?: string;
  runtimeTokenHash?: string;
  activeRunId?: string;
};

export type ComputeSessionPatch = {
  status?: string;
  error?: string;
  providerMachineId?: string;
  providerCreationTime?: number;
  runtimeTokenHash?: string;
  activeRunId?: string;
  lastHeartbeatAt?: number;
  lastIdleAt?: number;
  terminatedAt?: number;
};

export type ComputeSessionEvent = {
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type ComputeSessionPlan = {
  patch?: ComputeSessionPatch;
  events?: ComputeSessionEvent[];
};

function sessionEvent(status: string, message: string, metadata?: Record<string, unknown>) {
  return { status, message, ...(metadata ? { metadata } : {}) };
}

function isTerminalComputeSessionStatus(status: string) {
  return TERMINAL_COMPUTE_SESSION_STATUSES.has(status);
}

function normalizeMachineId(providerMachineId: string | undefined) {
  return providerMachineId?.trim() || "";
}

function sanitizeDetail(value: string | undefined) {
  return (value || "").trim().slice(0, 4000);
}

export function isComputeSessionHeartbeatTimedOut(args: {
  lastHeartbeatAt?: number | null;
  providerCreationTime?: number | null;
  createdAt?: number | null;
  heartbeatTimeoutSeconds: number;
  startupTimeoutSeconds: number;
  nowMs: number;
}) {
  if (args.lastHeartbeatAt && Number.isFinite(args.lastHeartbeatAt)) {
    return args.nowMs >= args.lastHeartbeatAt + args.heartbeatTimeoutSeconds * 1000;
  }
  const startupStartedAt =
    args.providerCreationTime && Number.isFinite(args.providerCreationTime)
      ? args.providerCreationTime
      : args.createdAt;
  if (!startupStartedAt || !Number.isFinite(startupStartedAt)) {
    return false;
  }
  return args.nowMs >= startupStartedAt + args.startupTimeoutSeconds * 1000;
}

export function isComputeSessionIdleTimedOut(args: {
  lastIdleAt?: number | null;
  idleTimeoutSeconds: number;
  nowMs: number;
}) {
  if (!args.lastIdleAt || !Number.isFinite(args.lastIdleAt)) {
    return false;
  }
  return args.nowMs >= args.lastIdleAt + args.idleTimeoutSeconds * 1000;
}

export function planComputeSessionCreation(args: {
  nowMs: number;
  userId: string;
  environmentId: string;
  effectiveGpuType: string;
  effectiveGpuCount: number;
  effectiveVolumeGb: number;
  framework: string;
  frameworkVersion: string;
  pythonVersion: string;
  imageName: string;
  idleTimeoutSeconds: number;
}) {
  return {
    session: {
      userId: args.userId,
      environmentId: args.environmentId,
      status: COMPUTE_SESSION_STATUS.PROVISIONING,
      effectiveGpuType: args.effectiveGpuType,
      effectiveGpuCount: args.effectiveGpuCount,
      effectiveVolumeGb: args.effectiveVolumeGb,
      framework: args.framework,
      frameworkVersion: args.frameworkVersion,
      pythonVersion: args.pythonVersion,
      imageName: args.imageName,
      idleTimeoutSeconds: args.idleTimeoutSeconds,
      createdAt: args.nowMs,
    },
    event: sessionEvent(COMPUTE_SESSION_STATUS.PROVISIONING, "compute session provisioning requested", {
      environment_id: args.environmentId,
      gpu_type: args.effectiveGpuType,
      gpu_count: args.effectiveGpuCount,
      volume_gb: args.effectiveVolumeGb,
      framework: args.framework,
      framework_version: args.frameworkVersion,
      python_version: args.pythonVersion,
      image_name: args.imageName,
      idle_timeout_seconds: args.idleTimeoutSeconds,
    }),
  };
}

export function planComputeSessionMachineProvisioned(args: {
  session: ComputeSessionState;
  providerMachineId: string;
  providerCreationTime?: number;
  runtimeTokenHash: string;
  nowMs: number;
}): ComputeSessionPlan {
  if (isTerminalComputeSessionStatus(args.session.status)) {
    return {};
  }
  const providerMachineId = normalizeMachineId(args.providerMachineId);
  if (!providerMachineId) {
    return planComputeSessionFailure({
      session: args.session,
      error: "provider machine id is required",
      nowMs: args.nowMs,
    });
  }
  return {
    patch: {
      providerMachineId,
      runtimeTokenHash: args.runtimeTokenHash,
      ...(args.providerCreationTime ? { providerCreationTime: args.providerCreationTime } : {}),
    },
    events: [
      sessionEvent(COMPUTE_SESSION_STATUS.PROVISIONING, "compute session machine provisioned", {
        provider_machine_id: providerMachineId,
      }),
    ],
  };
}

export function planComputeSessionHeartbeat(args: {
  session: ComputeSessionState;
  nowMs: number;
}): ComputeSessionPlan {
  if (isTerminalComputeSessionStatus(args.session.status)) {
    return {};
  }
  return {
    patch: {
      lastHeartbeatAt: args.nowMs,
    },
  };
}

export function planComputeSessionIdle(args: {
  session: ComputeSessionState;
  nowMs: number;
}): ComputeSessionPlan {
  if (isTerminalComputeSessionStatus(args.session.status)) {
    return {};
  }
  return {
    patch: {
      status: COMPUTE_SESSION_STATUS.IDLE,
      activeRunId: undefined,
      lastIdleAt: args.nowMs,
    },
    events: [
      sessionEvent(COMPUTE_SESSION_STATUS.IDLE, "compute session idle"),
    ],
  };
}

export function planComputeSessionRunAssigned(args: {
  session: ComputeSessionState;
  runId: string;
  nowMs: number;
}): ComputeSessionPlan & { error?: string } {
  if (args.session.status !== COMPUTE_SESSION_STATUS.IDLE) {
    return { error: `compute session must be idle, got ${args.session.status}` };
  }
  if (args.session.activeRunId) {
    return { error: "compute session already has an active run" };
  }
  const runId = args.runId.trim();
  if (!runId) {
    return { error: "run id is required" };
  }
  return {
    patch: {
      status: COMPUTE_SESSION_STATUS.RUNNING,
      activeRunId: runId,
    },
    events: [
      sessionEvent(COMPUTE_SESSION_STATUS.RUNNING, "compute session run assigned", {
        run_id: runId,
      }),
    ],
  };
}

export function planComputeSessionStop(args: {
  session: ComputeSessionState;
  force: boolean;
  nowMs: number;
}): ComputeSessionPlan & { error?: string } {
  if (isTerminalComputeSessionStatus(args.session.status)) {
    return { error: `compute session is already ${args.session.status}` };
  }
  const providerMachineId = normalizeMachineId(args.session.providerMachineId);
  if (!providerMachineId) {
    return {
      patch: {
        status: COMPUTE_SESSION_STATUS.TERMINATED,
        runtimeTokenHash: "revoked",
        activeRunId: undefined,
        terminatedAt: args.nowMs,
      },
      events: [
        sessionEvent(COMPUTE_SESSION_STATUS.TERMINATED, "compute session stopped before machine provisioning"),
      ],
    };
  }
  return {
    patch: {
      status: COMPUTE_SESSION_STATUS.TERMINATING,
    },
    events: [
      sessionEvent(
        COMPUTE_SESSION_STATUS.TERMINATING,
        args.force ? "force stop requested" : "stop requested",
        { provider_machine_id: providerMachineId },
      ),
    ],
  };
}

export function planComputeSessionTerminated(args: {
  session: ComputeSessionState;
  nowMs: number;
}): ComputeSessionPlan {
  if (args.session.status === COMPUTE_SESSION_STATUS.TERMINATED) {
    return {};
  }
  return {
    patch: {
      status: COMPUTE_SESSION_STATUS.TERMINATED,
      runtimeTokenHash: "revoked",
      activeRunId: undefined,
      terminatedAt: args.nowMs,
    },
    events: [
      sessionEvent(COMPUTE_SESSION_STATUS.TERMINATED, "compute session terminated"),
    ],
  };
}

export function planComputeSessionFailure(args: {
  session: ComputeSessionState;
  error: string;
  nowMs: number;
}): ComputeSessionPlan {
  if (isTerminalComputeSessionStatus(args.session.status)) {
    return {};
  }
  const errorText = sanitizeDetail(args.error) || "compute session failed";
  return {
    patch: {
      status: COMPUTE_SESSION_STATUS.FAILED,
      error: errorText,
      runtimeTokenHash: "revoked",
      activeRunId: undefined,
      terminatedAt: args.nowMs,
    },
    events: [
      sessionEvent(COMPUTE_SESSION_STATUS.FAILED, errorText),
    ],
  };
}
