import { Workpool } from "@convex-dev/workpool"
import { ConvexError } from "convex/values"
import { components, internal } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type { MutationCtx } from "@convex/_generated/server"
import { RUN_CONFIG } from "@convex/appConfig"
import { getLatestActiveRunpodCredentialForUserId } from "@convex/runpodCredentialsStore"
import { getAccessibleServe } from "@convex/servesAccess"
import { SERVE_STATUS } from "@convex/servesConstants"
import { toServeResponse } from "@convex/servesRead"

const provisionPool = new Workpool(components.workpool, {
  maxParallelism: RUN_CONFIG.workpoolMaxParallelism,
  retryActionsByDefault: true,
})

export async function createServeForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    serveConfig: {
      command: string[];
      outputDir: string;
      codeManifestHash: string;
      dataManifestHash: string | null;
      dependencyGroup: string;
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
    };
    modelSnapshot: {
      sourceType: "run" | "storage";
      sourceRunId?: Id<"runs">;
      sourceObjectPrefix?: string;
      sourceModelPath?: string;
      objectPrefix: string;
      manifestKey: string;
      manifestHash: string;
      objectCount: number;
      totalBytes: number;
    };
    enqueueProvisioning?: boolean;
  },
) {
  const runpodCredential = await getLatestActiveRunpodCredentialForUserId(ctx, args.userId)
  if (!runpodCredential) {
    throw new ConvexError("No compute provider configured. Add one in Settings → Providers.")
  }

  const now = Date.now()
  const serveId = await ctx.db.insert("serves", {
    userId: args.userId,
    environmentId: args.environmentId,
    ...args.serveConfig,
    dataManifestHash: args.serveConfig.dataManifestHash || undefined,
    logs: `serves/${args.environmentId}/${now}/logs`,
    status: SERVE_STATUS.QUEUED,
    runpodCredentialId: runpodCredential.credentialId,
    modelSnapshot: args.modelSnapshot,
  })

  await ctx.db.insert("serveEvents", {
    serveId,
    status: SERVE_STATUS.QUEUED,
    message: "serve queued",
    metadata: {
      command: args.serveConfig.command,
      model_snapshot: {
        source_type: args.modelSnapshot.sourceType,
        source_run_id: args.modelSnapshot.sourceRunId ? String(args.modelSnapshot.sourceRunId) : null,
        source_object_prefix: args.modelSnapshot.sourceObjectPrefix || null,
        source_model_path: args.modelSnapshot.sourceModelPath || null,
        object_prefix: args.modelSnapshot.objectPrefix,
        manifest_key: args.modelSnapshot.manifestKey,
        manifest_hash: args.modelSnapshot.manifestHash,
        object_count: args.modelSnapshot.objectCount,
        total_bytes: args.modelSnapshot.totalBytes,
      },
      code_manifest_hash: args.serveConfig.codeManifestHash,
      data_manifest_hash: args.serveConfig.dataManifestHash || null,
      dependency_group: args.serveConfig.dependencyGroup,
      gpu_type: args.serveConfig.gpuType,
      gpu_count: args.serveConfig.gpuCount,
      volume_gb: args.serveConfig.volumeGb,
      port: args.serveConfig.port,
      health_path: args.serveConfig.healthPath,
    },
  })

  if (args.enqueueProvisioning ?? true) {
    await provisionPool.enqueueAction(ctx, internal.serves.provisionServe, { serveId })
  }

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
  if (nextStatus === SERVE_STATUS.STOPPING) {
    await ctx.scheduler.runAfter(0, internal.serves.internalTerminatePod, {
      serveId,
      podId: row.podId!,
      runpodCredentialId: row.runpodCredentialId,
      force: true,
    })
  }

  return { serve_id: String(serveId), stop_requested: true, forced: force, status: nextStatus }
}

export async function scheduleForcedServePodTermination(
  ctx: MutationCtx,
  serveId: Id<"serves">,
  podId: string | undefined,
  runpodCredentialId: Id<"runpodCredentials"> | undefined,
) {
  const podIdValue = podId?.trim() || ""
  if (!podIdValue) {
    return
  }
  await ctx.scheduler.runAfter(0, internal.serves.internalTerminatePod, {
    serveId,
    podId: podIdValue,
    runpodCredentialId,
    force: true,
  })
}
