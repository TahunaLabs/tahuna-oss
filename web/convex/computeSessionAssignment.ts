import { ConvexError } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { PYTHON_CONFIG } from "@convex/appConfig";
import {
  COMPUTE_SESSION_STATUS,
  planComputeSessionRunAssigned,
  type ComputeSessionEvent,
} from "@convex/core/computeSessionLifecyclePlan";
import { RUN_STATUS, ACTIVE_STATUSES } from "@convex/runsConstants";
import { resolveImageName } from "@convex/runtimeProvisioning";

type RuntimeSpec = {
  effectiveGpuType: string;
  effectiveGpuCount: number;
  effectiveVolumeGb: number;
  framework: string;
  frameworkVersion: string;
  pythonVersion: string;
  imageName: string;
};

function toComputeSessionState(row: Doc<"computeSessions">) {
  return {
    computeSessionId: String(row._id),
    status: row.status,
    providerMachineId: row.providerMachineId,
    runtimeTokenHash: row.runtimeTokenHash,
    activeRunId: row.activeRunId ? String(row.activeRunId) : undefined,
  };
}

function assignmentError(detail: string): never {
  throw new ConvexError(detail);
}

function assertMatch(label: string, runValue: string | number, sessionValue: string | number) {
  if (runValue !== sessionValue) {
    assignmentError(`compute session ${label} mismatch`);
  }
}

function sessionSpec(session: Doc<"computeSessions">): RuntimeSpec {
  return {
    effectiveGpuType: session.effectiveGpuType,
    effectiveGpuCount: session.effectiveGpuCount,
    effectiveVolumeGb: session.effectiveVolumeGb,
    framework: session.framework,
    frameworkVersion: session.frameworkVersion,
    pythonVersion: session.pythonVersion,
    imageName: session.imageName,
  };
}

function runSpec(run: Doc<"runs">, environment: Doc<"environments">): RuntimeSpec {
  const pythonVersion = environment.pythonVersion || PYTHON_CONFIG.defaultVersion;
  return {
    effectiveGpuType: run.effectiveGpuType || environment.gpuType,
    effectiveGpuCount: run.effectiveGpuCount || environment.gpuCount,
    effectiveVolumeGb: run.effectiveVolumeGb || environment.volumeGb,
    framework: environment.framework,
    frameworkVersion: environment.version,
    pythonVersion,
    imageName: resolveImageName(environment.framework, environment.version, pythonVersion),
  };
}

async function insertComputeSessionEvents(
  ctx: MutationCtx,
  computeSessionId: Id<"computeSessions">,
  events: ComputeSessionEvent[] | undefined,
) {
  for (const event of events ?? []) {
    await ctx.db.insert("computeSessionEvents", {
      computeSessionId,
      status: event.status,
      message: event.message,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    });
  }
}

async function assertNoActiveRunOnSession(
  ctx: MutationCtx,
  computeSessionId: Id<"computeSessions">,
  runId: Id<"runs">,
) {
  const rows = await ctx.db
    .query("runs")
    .withIndex("by_compute_session", (q) => q.eq("computeSessionId", computeSessionId))
    .collect();
  const activeRun = rows.find((row) => row._id !== runId && ACTIVE_STATUSES.has(row.status));
  if (activeRun) {
    assignmentError("compute session already has an active run");
  }
}

export async function assignQueuedRunToComputeSession(
  ctx: MutationCtx,
  args: {
    computeSessionId: Id<"computeSessions">;
    runId: Id<"runs">;
  },
) {
  const session = await ctx.db.get("computeSessions", args.computeSessionId);
  if (!session) {
    assignmentError("compute session not found");
  }

  const run = await ctx.db.get("runs", args.runId);
  if (!run) {
    assignmentError("run not found");
  }

  if (run.userId !== session.userId) {
    assignmentError("compute session user mismatch");
  }
  if (run.environmentId !== session.environmentId) {
    assignmentError("compute session environment mismatch");
  }
  if (session.status !== COMPUTE_SESSION_STATUS.IDLE) {
    assignmentError(`compute session must be idle, got ${session.status}`);
  }
  if (run.status !== RUN_STATUS.QUEUED) {
    assignmentError(`run must be queued, got ${run.status}`);
  }
  if (session.activeRunId) {
    assignmentError("compute session already has an active run");
  }
  if (run.executionMode !== "session" || run.computeSessionId !== args.computeSessionId) {
    assignmentError("run is not queued for this compute session");
  }
  if (!session.providerMachineId) {
    assignmentError("compute session provider machine id is required");
  }
  if (!session.runtimeTokenHash || session.runtimeTokenHash === "revoked") {
    assignmentError("compute session runtime token is required");
  }
  await assertNoActiveRunOnSession(ctx, args.computeSessionId, args.runId);

  const environment = await ctx.db.get("environments", run.environmentId);
  if (!environment) {
    assignmentError("environment not found");
  }
  const expected = runSpec(run, environment);
  const actual = sessionSpec(session);
  assertMatch("gpu type", expected.effectiveGpuType, actual.effectiveGpuType);
  assertMatch("gpu count", expected.effectiveGpuCount, actual.effectiveGpuCount);
  assertMatch("volume", expected.effectiveVolumeGb, actual.effectiveVolumeGb);
  assertMatch("framework", expected.framework, actual.framework);
  assertMatch("framework version", expected.frameworkVersion, actual.frameworkVersion);
  assertMatch("python version", expected.pythonVersion, actual.pythonVersion);
  assertMatch("image name", expected.imageName, actual.imageName);

  const plan = planComputeSessionRunAssigned({
    session: toComputeSessionState(session),
    runId: String(args.runId),
    nowMs: Date.now(),
  });
  if (plan.error) {
    assignmentError(plan.error);
  }

  await ctx.db.patch("runs", args.runId, {
    status: RUN_STATUS.PROVISIONING,
    providerMachineId: session.providerMachineId,
    runtimeTokenHash: session.runtimeTokenHash,
  });
  await ctx.db.insert("runEvents", {
    runId: args.runId,
    status: RUN_STATUS.PROVISIONING,
    message: "run assigned to compute session",
    metadata: {
      compute_session_id: String(args.computeSessionId),
      provider_machine_id: session.providerMachineId,
    },
  });
  await ctx.db.patch("computeSessions", args.computeSessionId, {
    status: COMPUTE_SESSION_STATUS.RUNNING,
    activeRunId: args.runId,
    lastHeartbeatAt: Date.now(),
  });
  await insertComputeSessionEvents(ctx, args.computeSessionId, plan.events);
}
