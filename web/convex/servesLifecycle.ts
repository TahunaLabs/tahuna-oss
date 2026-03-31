import { ConvexError } from "convex/values"
import type { Id } from "@convex/_generated/dataModel"
import type { MutationCtx } from "@convex/_generated/server"
import { getAccessibleServe } from "@convex/servesAccess"
import { SERVE_STATUS } from "@convex/servesConstants"
import { toServeResponse } from "@convex/servesRead"

export async function createServeForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    command: string[];
    outputDir: string;
    codeManifestHash: string;
    dataManifestHash?: string;
    pythonVersion: string;
    gpuType: string;
    gpuCount: number;
    volumeGb: number;
    port: number;
    healthPath: string;
    defaultModelPath: string;
    startupTimeoutSeconds: number;
    healthIntervalSeconds: number;
    healthTimeoutSeconds: number;
    healthFailureThreshold: number;
    gracefulShutdownSeconds: number;
    modelSnapshot: {
      sourceType: "run" | "storage";
      sourceRunId?: Id<"runs">;
      sourceObjectPrefix?: string;
      sourceModelPath?: string;
      objectPrefix: string;
      objectCount: number;
      totalBytes: number;
    };
  },
) {
  const now = Date.now()
  const serveId = await ctx.db.insert("serves", {
    userId: args.userId,
    environmentId: args.environmentId,
    command: args.command,
    outputDir: args.outputDir,
    logs: `serves/${args.environmentId}/${now}/logs`,
    status: SERVE_STATUS.QUEUED,
    codeManifestHash: args.codeManifestHash,
    dataManifestHash: args.dataManifestHash,
    pythonVersion: args.pythonVersion,
    gpuType: args.gpuType,
    gpuCount: args.gpuCount,
    volumeGb: args.volumeGb,
    port: args.port,
    healthPath: args.healthPath,
    defaultModelPath: args.defaultModelPath,
    startupTimeoutSeconds: args.startupTimeoutSeconds,
    healthIntervalSeconds: args.healthIntervalSeconds,
    healthTimeoutSeconds: args.healthTimeoutSeconds,
    healthFailureThreshold: args.healthFailureThreshold,
    gracefulShutdownSeconds: args.gracefulShutdownSeconds,
    modelSnapshot: args.modelSnapshot,
  })

  await ctx.db.insert("serveEvents", {
    serveId,
    status: SERVE_STATUS.QUEUED,
    message: "serve queued",
    metadata: {
      command: args.command,
      model_snapshot: {
        source_type: args.modelSnapshot.sourceType,
        source_run_id: args.modelSnapshot.sourceRunId ? String(args.modelSnapshot.sourceRunId) : null,
        source_object_prefix: args.modelSnapshot.sourceObjectPrefix || null,
        source_model_path: args.modelSnapshot.sourceModelPath || null,
        object_prefix: args.modelSnapshot.objectPrefix,
        object_count: args.modelSnapshot.objectCount,
        total_bytes: args.modelSnapshot.totalBytes,
      },
      code_manifest_hash: args.codeManifestHash,
      data_manifest_hash: args.dataManifestHash || null,
      gpu_type: args.gpuType,
      gpu_count: args.gpuCount,
      volume_gb: args.volumeGb,
      port: args.port,
      health_path: args.healthPath,
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
