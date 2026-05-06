import { ConvexError } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { resolveConfiguredDependencyGroup } from "@/lib/dependency-selection";
import { buildRuntimeCompatibilityKey } from "@/lib/runtime-incompatibility";
import { PYTHON_CONFIG, RUN_CONFIG } from "@convex/appConfig";
import {
  resolveActiveComputeCredentialForUserId,
  resolveComputeCompatibilityCloudType,
} from "@convex/computeProvider";
import { ACTIVE_STATUSES, RUN_DELETE_BATCH_SIZE, TERMINAL_STATUSES } from "@convex/runsConstants";
import { getAccessibleEnvironment, getAccessibleRun, listRunsForUser } from "@convex/runsAccess";
import { hasRunNameConflict, pickUniqueGeneratedRunName, validateRunName, getRunName, normalizeRunName } from "@convex/runsNaming";
import { toRunResponse } from "@convex/runsRead";
import { resolveImageName } from "@convex/runtimeProvisioning";
import {
  mergeRunEventMetadata,
  planForcedMachineTermination,
  planRunCancellation,
  planRunCreation,
  planRunDeletion,
  planRunProvisioningJobs,
  planRunRenameEvent,
  type RunLifecycleEvent,
  type RunLifecyclePlan,
  type RunLifecycleRunState,
  type RunLifecycleStorageOperation,
} from "@convex/core/runLifecyclePlan";
import {
  enqueueRunDataDeletionBatch,
  enqueueRunLifecycleJobs,
} from "@convex/convexJobQueue";

type RunDbPatch = Partial<Omit<Doc<"runs">, "_id" | "_creationTime">>;

export type RunLifecycleSettlement = {
  patch?: RunDbPatch;
  eventMetadata?: Record<string, unknown>;
};

export type RunCreationComposition = {
  runFields?: RunDbPatch;
  eventMetadata?: Record<string, unknown>;
};

export type RunLifecycleComposition = {
  createRun?: (args: {
    userId: string;
    gpuType: string;
    gpuCount: number;
    volumeGb: number;
  }) => RunCreationComposition;
  settleTerminalRunUsage?: (
    ctx: MutationCtx,
    row: Doc<"runs">,
  ) => Promise<RunLifecycleSettlement | undefined>;
};

async function deleteIndexedStorageKeys(ctx: MutationCtx, userId: string, keys: string[]) {
  const seen = new Set<string>();
  for (const raw of keys) {
    const key = raw.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const row = await ctx.db
      .query("storageObjects")
      .withIndex("by_user_and_key", (q) => q.eq("userId", userId).eq("key", key))
      .first();
    if (row) {
      await ctx.db.delete("storageObjects", row._id);
    }
  }
}

export function toRunLifecycleState(row: Doc<"runs">): RunLifecycleRunState {
  return {
    runId: String(row._id),
    status: row.status,
    cancellationRequested: row.cancellationRequested,
    providerMachineId: row.providerMachineId,
    providerCredentialId: row.providerCredentialId ? String(row.providerCredentialId) : undefined,
    computeStartedAt: row.computeStartedAt,
    computeEndedAt: row.computeEndedAt,
    runtimeTokenHash: row.runtimeTokenHash,
    artifactKeys: row.artifactKeys,
    output: row.output,
  };
}

async function applyRunLifecycleStorageOperations(
  ctx: MutationCtx,
  userId: string,
  operations: RunLifecycleStorageOperation[],
) {
  for (const operation of operations) {
    if (operation.type === "delete_indexed_storage_keys") {
      await deleteIndexedStorageKeys(ctx, userId, operation.keys);
    }
  }
}

async function insertRunLifecycleEvents(
  ctx: MutationCtx,
  runId: Id<"runs">,
  events: RunLifecycleEvent[],
  settlement: RunLifecycleSettlement | undefined,
) {
  for (const event of events) {
    await ctx.db.insert("runEvents", {
      runId,
      status: event.status,
      message: event.message,
      metadata: mergeRunEventMetadata(
        event,
        event.includeTerminalTiming ? settlement?.eventMetadata : undefined,
      ),
    });
  }
}

export async function applyRunLifecyclePlan(
  ctx: MutationCtx,
  runId: Id<"runs">,
  row: Doc<"runs">,
  plan: RunLifecyclePlan,
  composition?: RunLifecycleComposition,
) {
  const shouldSettleTerminalUsage = (plan.events ?? []).some((event) => event.includeTerminalTiming);
  const settlement = shouldSettleTerminalUsage
    ? await composition?.settleTerminalRunUsage?.(ctx, row)
    : undefined;
  const patch = {
    ...(plan.patch || {}),
    ...(settlement?.patch || {}),
  } satisfies RunDbPatch;
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch("runs", runId, patch);
  }
  await insertRunLifecycleEvents(ctx, runId, plan.events ?? [], settlement);
  await enqueueRunLifecycleJobs(ctx, plan.jobs ?? []);
  await applyRunLifecycleStorageOperations(ctx, row.userId, plan.storageOperations ?? []);
}

export async function createRunForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    name?: string;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
    enqueue_provisioning?: boolean;
  },
  composition?: RunLifecycleComposition,
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const command = env.command;
  if (!Array.isArray(command) || command.length === 0) {
    throw new ConvexError("environment has no command configured; run `tahuna sync` before creating a run");
  }
  const dependencyGroup = resolveConfiguredDependencyGroup({
    dependencyGroup: env.trainDependencyGroup,
  });
  if (dependencyGroup === null) {
    throw new ConvexError("environment has no training dependency selection configured; run `tahuna sync` before creating a run");
  }
  const effectiveGpuType = args.gpu_type ?? env.gpuType;
  const effectiveGpuCount = args.gpu_count ?? env.gpuCount;
  const effectiveVolumeGb = args.volume_gb ?? env.volumeGb;
  const codeManifestHash = env.latestCodeManifestHash;
  const dataManifestHash = env.latestDataManifestHash;
  const dataId = env.dataId;
  if (!codeManifestHash) {
    throw new ConvexError("environment code is not synced; run `tahuna sync` before creating a run");
  }
  const userRuns = await listRunsForUser(ctx, args.userId);
  const outputDir = env.outputDir;
  let runName = "";
  if (typeof args.name === "string" && args.name.trim() !== "") {
    runName = validateRunName(args.name);
    if (hasRunNameConflict(userRuns, runName)) {
      throw new ConvexError("run name is already used");
    }
  } else {
    runName = pickUniqueGeneratedRunName(userRuns);
  }

  const pythonVersion = env.pythonVersion || PYTHON_CONFIG.defaultVersion;
  const imageName = resolveImageName(env.framework, env.version, pythonVersion);
  const compatibilityKey = buildRuntimeCompatibilityKey({
    cloudType: resolveComputeCompatibilityCloudType(),
    framework: env.framework,
    version: env.version,
    pythonVersion,
    gpuType: effectiveGpuType,
    imageName,
  });
  const incompatibility = await ctx.db
    .query("runtimeIncompatibilities")
    .withIndex("by_key", (q) => q.eq("compatibilityKey", compatibilityKey))
    .first();
  if (
    incompatibility &&
    incompatibility.errorCode !== "startup_timeout" &&
    incompatibility.cooldownUntil > Date.now()
  ) {
    throw new ConvexError(
      `runtime launch blocked for this gpu/image combination (${incompatibility.errorCode}); try another gpu or image`,
    );
  }
  const computeCredential = await resolveActiveComputeCredentialForUserId(ctx, args.userId);
  const creationComposition = composition?.createRun?.({
    userId: args.userId,
    gpuType: effectiveGpuType,
    gpuCount: effectiveGpuCount,
    volumeGb: effectiveVolumeGb,
  });

  const creation = planRunCreation({
    userId: args.userId,
    environmentId: String(args.environmentId),
    name: runName,
    command,
    dataId,
    outputDir,
    providerCredentialId: String(computeCredential.providerCredentialId),
    effectiveGpuType,
    effectiveGpuCount,
    effectiveVolumeGb,
    codeManifestHash,
    dataManifestHash: dataManifestHash || undefined,
    dependencyGroup,
    nowMs: Date.now(),
    enqueueProvisioning: args.enqueue_provisioning ?? true,
  });

  const runId = await ctx.db.insert("runs", {
    userId: creation.run.userId,
    environmentId: args.environmentId,
    name: creation.run.name,
    command: creation.run.command,
    dataId: creation.run.dataId,
    outputDir: creation.run.outputDir,
    input: creation.run.input,
    output: creation.run.output,
    logs: creation.run.logs,
    status: creation.run.status,
    cancellationRequested: creation.run.cancellationRequested,
    providerCredentialId: creation.run.providerCredentialId,
    effectiveGpuType: creation.run.effectiveGpuType,
    effectiveGpuCount: creation.run.effectiveGpuCount,
    effectiveVolumeGb: creation.run.effectiveVolumeGb,
    codeManifestHash: creation.run.codeManifestHash,
    dataManifestHash: creation.run.dataManifestHash,
    dependencyGroup: creation.run.dependencyGroup,
    ...(creationComposition?.runFields || {}),
  });

  await ctx.db.insert("runEvents", {
    runId,
    status: creation.event.status,
    message: creation.event.message,
    metadata: {
      ...creation.event.metadata,
      ...(creationComposition?.eventMetadata || {}),
    },
  });
  await enqueueRunLifecycleJobs(ctx, planRunProvisioningJobs({
    runId: String(runId),
    enqueueProvisioning: creation.enqueueProvisioning,
  }));
  const row = await ctx.db.get("runs", runId);
  if (!row) {
    throw new ConvexError("failed to create run");
  }
  return toRunResponse(row);
}


export async function cancelRunForUserId(
  ctx: MutationCtx,
  userId: string,
  runId: Id<"runs">,
  force: boolean,
  composition?: RunLifecycleComposition,
) {
  const row = await getAccessibleRun(ctx, userId, runId);

  if (TERMINAL_STATUSES.has(row.status)) {
    throw new ConvexError(`run is already ${row.status}`);
  }

  const plan = planRunCancellation({
    run: toRunLifecycleState(row),
    force,
    terminationGraceMs: RUN_CONFIG.cancellationGraceSeconds * 1000,
  });
  if (plan.error) {
    throw new ConvexError(plan.error);
  }
  await applyRunLifecyclePlan(ctx, runId, row, plan, composition);
  return { cancel_requested: true, forced: force, run_id: String(runId) };
}

export async function scheduleForcedMachineTermination(
  ctx: MutationCtx,
  runId: Id<"runs">,
  providerMachineId: string | undefined,
  providerCredentialId: string | undefined,
) {
  await enqueueRunLifecycleJobs(ctx, planForcedMachineTermination({
    runId: String(runId),
    providerMachineId,
    providerCredentialId,
  }));
}

async function applyRunDeletionPlan(
  ctx: MutationCtx,
  runId: Id<"runs">,
  row: Doc<"runs">,
  plan: RunLifecyclePlan & { deleteRunData: boolean },
) {
  await enqueueRunLifecycleJobs(ctx, plan.jobs ?? []);
  await applyRunLifecycleStorageOperations(ctx, row.userId, plan.storageOperations ?? []);
  if (!plan.deleteRunData) {
    return;
  }
  const hasMore = await deleteRunDataBatch(ctx, runId);
  if (hasMore) {
    await enqueueRunDataDeletionBatch(ctx, runId);
    return;
  }
  await ctx.db.delete("runs", runId);
}

export async function deleteRunDataBatch(ctx: MutationCtx, runId: Id<"runs">): Promise<boolean> {
  const tables = [
    { table: "runEvents" as const, index: "by_run" as const },
    { table: "runRuntimeLogs" as const, index: "by_run" as const },
    { table: "runRuntimeMetrics" as const, index: "by_run" as const },
    { table: "wandbRuns" as const, index: "by_run" as const },
    { table: "wandbMetrics" as const, index: "by_run" as const },
  ];
  let hasMore = false;
  for (const { table, index } of tables) {
    const rows = await ctx.db
      .query(table)
      .withIndex(index, (q) => q.eq("runId", runId))
      .take(RUN_DELETE_BATCH_SIZE + 1);
    if (rows.length > RUN_DELETE_BATCH_SIZE) {
      hasMore = true;
    }
    const toDelete = rows.slice(0, RUN_DELETE_BATCH_SIZE);
    await Promise.all(toDelete.map((row) => ctx.db.delete(row._id)));
  }
  return hasMore;
}

export async function deleteRunForUserId(
  ctx: MutationCtx,
  userId: string,
  runId: Id<"runs">,
  options?: { cancelActive?: boolean; force?: boolean },
  composition?: RunLifecycleComposition,
) {
  let row = await getAccessibleRun(ctx, userId, runId);
  const shouldCancelActive = options?.cancelActive === true || options?.force === true;
  const shouldForceDelete = options?.force === true;

  let plan = planRunDeletion({
    run: toRunLifecycleState(row),
    cancelActive: shouldCancelActive,
    force: shouldForceDelete,
  });
  if (plan.error) {
    throw new ConvexError(plan.error);
  }
  if (plan.cancelBeforeDelete) {
    await cancelRunForUserId(ctx, userId, runId, false, composition);
    row = await getAccessibleRun(ctx, userId, runId);
    if (ACTIVE_STATUSES.has(row.status)) {
      throw new ConvexError("cancellation requested; run is still shutting down");
    }
    plan = planRunDeletion({
      run: toRunLifecycleState(row),
      cancelActive: false,
      force: false,
    });
  }

  await applyRunDeletionPlan(ctx, runId, row, plan);
  return { deleted: true, run_id: String(runId) };
}

export async function renameRunForUserId(
  ctx: MutationCtx,
  userId: string,
  runId: Id<"runs">,
  name: string,
) {
  const row = await getAccessibleRun(ctx, userId, runId);
  const nextName = validateRunName(name);
  const currentName = getRunName(row);
  if (normalizeRunName(currentName) === nextName && row.name) {
    return toRunResponse(row);
  }

  const userRuns = await listRunsForUser(ctx, userId);
  if (hasRunNameConflict(userRuns, nextName, runId)) {
    throw new ConvexError("run name is already used");
  }

  await ctx.db.patch("runs", runId, { name: nextName });
  const event = planRunRenameEvent({
    status: row.status,
    oldName: currentName,
    newName: nextName,
  });
  await ctx.db.insert("runEvents", {
    runId,
    status: event.status,
    message: event.message,
    metadata: event.metadata,
  });
  const updated = await ctx.db.get("runs", runId);
  if (!updated) {
    throw new ConvexError("run not found");
  }
  return toRunResponse(updated);
}
