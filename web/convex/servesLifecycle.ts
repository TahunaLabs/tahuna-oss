import { ConvexError } from "convex/values"
import type { Id } from "@convex/_generated/dataModel"
import type { MutationCtx } from "@convex/_generated/server"
import { RUN_STATUS } from "@convex/runsConstants"
import { getAccessibleEnvironment, getAccessibleRun } from "@convex/runsAccess"
import { getAccessibleServe } from "@convex/servesAccess"
import { SERVE_STATUS } from "@convex/servesConstants"
import { toServeResponse } from "@convex/servesRead"

function normalizeStoragePrefix(value: string) {
  const normalized = value.trim().replace(/^\/+/, "").replace(/\/+$/, "")
  if (!normalized) {
    throw new ConvexError("from_storage_prefix is required")
  }
  return normalized
}

function normalizeModelPath(value: string | undefined, fallback: string) {
  const normalized = (value || "").trim().replace(/\\/g, "/") || fallback
  if (!normalized) {
    throw new ConvexError("model_path is required")
  }
  if (normalized.startsWith("/")) {
    throw new ConvexError("model_path must be a relative workspace path")
  }
  if (normalized.split("/").includes("..")) {
    throw new ConvexError("model_path must not escape the workspace")
  }
  return normalized
}

export async function createServeForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    fromRunId?: Id<"runs">;
    fromStoragePrefix?: string;
    modelPath?: string;
  },
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId)
  const serveSnapshot = env.serveSnapshot
  if (!serveSnapshot || !Array.isArray(serveSnapshot.command) || serveSnapshot.command.length === 0) {
    throw new ConvexError("environment has no serve config configured; run `tahuna sync` before creating a serve")
  }
  if (!env.latestCodeManifestHash) {
    throw new ConvexError("environment code is not synced; run `tahuna sync` before creating a serve")
  }

  const hasRunSource = !!args.fromRunId
  const hasStorageSource = !!args.fromStoragePrefix?.trim()
  if ((hasRunSource ? 1 : 0) + (hasStorageSource ? 1 : 0) !== 1) {
    throw new ConvexError("exactly one model source is required")
  }

  const modelSource = hasRunSource
    ? (() => {
        const runId = args.fromRunId as Id<"runs">
        return getAccessibleRun(ctx, args.userId, runId).then((run) => {
          if (run.status !== RUN_STATUS.COMPLETED) {
            throw new ConvexError("source run must be completed")
          }
          return {
            type: "run" as const,
            runId,
            modelPath: normalizeModelPath(args.modelPath, serveSnapshot.defaultModelPath),
          }
        })
      })()
    : Promise.resolve({
        type: "storage" as const,
        objectPrefix: normalizeStoragePrefix(args.fromStoragePrefix || ""),
      })

  const resolvedModelSource = await modelSource
  const now = Date.now()
  const serveId = await ctx.db.insert("serves", {
    userId: args.userId,
    environmentId: args.environmentId,
    command: serveSnapshot.command,
    outputDir: env.outputDir,
    logs: `serves/${args.environmentId}/${now}/logs`,
    status: SERVE_STATUS.QUEUED,
    codeManifestHash: env.latestCodeManifestHash,
    dataManifestHash: env.latestDataManifestHash || undefined,
    pythonVersion: serveSnapshot.pythonVersion,
    gpuType: serveSnapshot.gpuType,
    gpuCount: serveSnapshot.gpuCount,
    volumeGb: serveSnapshot.volumeGb,
    port: serveSnapshot.port,
    healthPath: serveSnapshot.healthPath,
    defaultModelPath: serveSnapshot.defaultModelPath,
    startupTimeoutSeconds: serveSnapshot.startupTimeoutSeconds,
    healthIntervalSeconds: serveSnapshot.healthIntervalSeconds,
    healthTimeoutSeconds: serveSnapshot.healthTimeoutSeconds,
    healthFailureThreshold: serveSnapshot.healthFailureThreshold,
    gracefulShutdownSeconds: serveSnapshot.gracefulShutdownSeconds,
    modelSource: resolvedModelSource,
  })

  await ctx.db.insert("serveEvents", {
    serveId,
    status: SERVE_STATUS.QUEUED,
    message: "serve queued",
    metadata: {
      command: serveSnapshot.command,
      model_source:
        resolvedModelSource.type === "run"
          ? {
              type: "run",
              run_id: String(resolvedModelSource.runId),
              model_path: resolvedModelSource.modelPath,
            }
          : {
              type: "storage",
              object_prefix: resolvedModelSource.objectPrefix,
            },
      code_manifest_hash: env.latestCodeManifestHash,
      data_manifest_hash: env.latestDataManifestHash || null,
      gpu_type: serveSnapshot.gpuType,
      gpu_count: serveSnapshot.gpuCount,
      volume_gb: serveSnapshot.volumeGb,
      port: serveSnapshot.port,
      health_path: serveSnapshot.healthPath,
    },
  })

  const row = await ctx.db.get("serves", serveId)
  if (!row) {
    throw new ConvexError("failed to create serve")
  }
  return toServeResponse(row)
}

export async function stopServeForUserId(
  ctx: MutationCtx,
  userId: string,
  serveId: Id<"serves">,
  force: boolean,
) {
  const row = await getAccessibleServe(ctx, userId, serveId)

  if (row.status === SERVE_STATUS.STOPPING) {
    return { serve_id: String(serveId), stop_requested: true, forced: force, status: SERVE_STATUS.STOPPING }
  }
  if (row.status === SERVE_STATUS.STOPPED || row.status === SERVE_STATUS.FAILED) {
    return { serve_id: String(serveId), stop_requested: true, forced: force, status: row.status }
  }

  const nextStatus = row.podId ? SERVE_STATUS.STOPPING : SERVE_STATUS.STOPPED
  await ctx.db.patch("serves", serveId, {
    status: nextStatus,
    runtimeTokenHash: nextStatus === SERVE_STATUS.STOPPED ? "revoked" : row.runtimeTokenHash,
  })
  await ctx.db.insert("serveEvents", {
    serveId,
    status: nextStatus,
    message:
      nextStatus === SERVE_STATUS.STOPPING
        ? force
          ? "force stop requested"
          : "stop requested"
        : "serve stopped before runtime start",
    metadata: {
      source: "control-plane",
      forced: force,
    },
  })

  return { serve_id: String(serveId), stop_requested: true, forced: force, status: nextStatus }
}
