import { Workpool } from "@convex-dev/workpool";
import { ConvexError } from "convex/values";
import { components, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { resolveRunComputePricing } from "@/lib/run-compute-pricing";
import { buildRuntimeCompatibilityKey, resolveRunpodCloudType } from "@/lib/runtime-incompatibility";
import { PYTHON_CONFIG, RUN_CONFIG } from "@convex/appConfig";
import { getLatestActiveRunpodCredentialForUserId } from "@convex/runpodCredentialsStore";
import { resolveTerminalRunTiming, settleRunComputeCharge } from "@convex/runBilling";
import { ACTIVE_STATUSES, RUN_DELETE_BATCH_SIZE, RUN_STATUS, TERMINAL_STATUSES } from "@convex/runsConstants";
import { getAccessibleEnvironment, getAccessibleRun, listRunsForUser } from "@convex/runsAccess";
import { hasRunNameConflict, pickUniqueGeneratedRunName, validateRunName, getRunName, normalizeRunName } from "@convex/runsNaming";
import { toRunResponse } from "@convex/runsRead";
import { resolveImageName } from "@convex/runtimeProvisioning";

const provisionPool = new Workpool(components.workpool, {
  maxParallelism: RUN_CONFIG.workpoolMaxParallelism,
  retryActionsByDefault: true,
});

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
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const command = env.command;
  if (!Array.isArray(command) || command.length === 0) {
    throw new ConvexError("environment has no command configured; run `tahuna sync` before creating a run");
  }
  const effectiveGpuType = args.gpu_type ?? env.gpuType;
  const effectiveGpuCount = args.gpu_count ?? env.gpuCount;
  const effectiveVolumeGb = args.volume_gb ?? env.volumeGb;
  const computePricing = resolveRunComputePricing({
    gpuType: effectiveGpuType,
    gpuCount: effectiveGpuCount,
    volumeGb: effectiveVolumeGb,
  });
  const codeManifestHash = env.latestCodeManifestHash;
  const dataManifestHash = env.latestDataManifestHash;
  const dataId = env.dataId || String(env._id);
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
    cloudType: resolveRunpodCloudType(),
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
  const runpodCredential = await getLatestActiveRunpodCredentialForUserId(ctx, args.userId);
  if (!runpodCredential) {
    throw new ConvexError("No compute provider configured. Add one in Settings → Providers.");
  }

  const now = Date.now();
  const runId = await ctx.db.insert("runs", {
    userId: args.userId,
    environmentId: args.environmentId,
    name: runName,
    command,
    dataId,
    outputDir,
    input: `runs/${args.environmentId}/${now}/input`,
    output: `runs/${args.environmentId}/${now}/output`,
    logs: `runs/${args.environmentId}/${now}/logs`,
    status: RUN_STATUS.QUEUED,
    cancellationRequested: false,
    runpodCredentialId: runpodCredential.credentialId,
    effectiveGpuType,
    effectiveGpuCount,
    effectiveVolumeGb,
    codeManifestHash: codeManifestHash,
    dataManifestHash: dataManifestHash || undefined,
    computeHourlyRateCents: computePricing.hourlyRateCents,
    creditsReservedCents: 0,
    computeChargeCents: 0,
    computeCollectedCents: 0,
    computeOutstandingCents: 0,
    computeChargeStatus: "pending",
  });

  await ctx.db.insert("runEvents", {
    runId,
    status: RUN_STATUS.QUEUED,
    message: "run queued for provisioning",
    metadata: {
      name: runName,
      command,
      gpu_type: effectiveGpuType,
      gpu_count: effectiveGpuCount,
      volume_gb: effectiveVolumeGb,
      code_manifest_hash: codeManifestHash || null,
      data_manifest_hash: dataManifestHash || null,
      hourly_rate_cents: computePricing.hourlyRateCents,
    },
  });

  if (args.enqueue_provisioning ?? true) {
    await provisionPool.enqueueAction(ctx, internal.runs.provisionRun, { runId });
  }
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
) {
  const row = await getAccessibleRun(ctx, userId, runId);

  if (TERMINAL_STATUSES.has(row.status)) {
    throw new ConvexError(`run is already ${row.status}`);
  }

  if (!row.podId) {
    const terminalTiming = resolveTerminalRunTiming(row);
    const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
    await ctx.db.patch("runs", runId, {
      status: RUN_STATUS.CANCELLED,
      cancellationRequested: true,
      computeEndedAt: terminalTiming.computeEndedAt,
      computeChargeCents: settlement.chargeCents,
      computeCollectedCents: settlement.collectedCents,
      computeOutstandingCents: settlement.outstandingCents,
      computeChargeStatus: settlement.chargeStatus,
      computeChargeError: settlement.chargeError,
    });
    await ctx.db.insert("runEvents", {
      runId,
      status: RUN_STATUS.CANCELLED,
      message: force ? "force cancellation requested before provisioning" : "run cancelled before provisioning",
      metadata: {
        duration_ms: terminalTiming.durationMs,
        compute_charge_cents: settlement.chargeCents,
        compute_charge_delta_cents: settlement.chargeDeltaCents,
        compute_charge_status: settlement.chargeStatus,
        compute_charge_error: settlement.chargeError,
        balance_after_cents: settlement.balanceAfterCents,
      },
    });
    return { cancel_requested: true, forced: force, run_id: String(runId) };
  }

  const terminationDelayMs = force ? 0 : RUN_CONFIG.cancellationGraceSeconds * 1000;
  await ctx.scheduler.runAfter(terminationDelayMs, internal.runs.internalTerminatePod, {
    runId,
    podId: row.podId,
    runpodCredentialId: row.runpodCredentialId,
    force,
  });

  await ctx.db.patch("runs", runId, {
    status: RUN_STATUS.CANCELLING,
    cancellationRequested: true,
  });
  await ctx.db.insert("runEvents", {
    runId,
    status: RUN_STATUS.CANCELLING,
    message: force
      ? "force cancellation requested"
      : `cancellation requested (grace period ${RUN_CONFIG.cancellationGraceSeconds}s before termination)`,
  });
  return { cancel_requested: true, forced: force, run_id: String(runId) };
}

export async function scheduleForcedPodTermination(
  ctx: MutationCtx,
  runId: Id<"runs">,
  podId: string | undefined,
  runpodCredentialId: Id<"runpodCredentials"> | undefined,
) {
  const podIdValue = podId?.trim() || "";
  if (!podIdValue) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.runs.internalTerminatePod, {
    runId,
    podId: podIdValue,
    runpodCredentialId,
    force: true,
  });
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
) {
  let row = await getAccessibleRun(ctx, userId, runId);
  const shouldCancelActive = options?.cancelActive === true || options?.force === true;
  const shouldForceDelete = options?.force === true;
  let forcedTerminationQueued = false;

  if (ACTIVE_STATUSES.has(row.status)) {
    if (!shouldCancelActive) {
      throw new ConvexError("run is active; cancel it before deleting");
    }

    if (shouldForceDelete) {
      if (row.podId) {
        await scheduleForcedPodTermination(ctx, runId, row.podId, row.runpodCredentialId);
        forcedTerminationQueued = true;
      }
    } else {
      await cancelRunForUserId(ctx, userId, runId, false);
      row = await getAccessibleRun(ctx, userId, runId);
      if (ACTIVE_STATUSES.has(row.status)) {
        throw new ConvexError("cancellation requested; run is still shutting down");
      }
    }
  }

  if (row.podId && !forcedTerminationQueued) {
    await scheduleForcedPodTermination(ctx, runId, row.podId, row.runpodCredentialId);
  }
  await deleteIndexedStorageKeys(ctx, userId, row.artifactKeys || []);

  const hasMore = await deleteRunDataBatch(ctx, runId);
  if (hasMore) {
    await ctx.scheduler.runAfter(0, internal.runs.internalDeleteRunData, { runId });
    return { deleted: true, run_id: String(runId) };
  }
  await ctx.db.delete("runs", runId);
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
  await ctx.db.insert("runEvents", {
    runId,
    status: row.status,
    message: "run renamed",
    metadata: {
      old_name: currentName,
      new_name: nextName,
    },
  });
  const updated = await ctx.db.get("runs", runId);
  if (!updated) {
    throw new ConvexError("run not found");
  }
  return toRunResponse(updated);
}
