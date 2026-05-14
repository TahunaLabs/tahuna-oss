import { ConvexError } from "convex/values"
import type { Doc, Id } from "@convex/_generated/dataModel"
import type { MutationCtx } from "@convex/_generated/server"
import { resolveManagedComputeCredential } from "@convex/computeProvider"
import {
  enqueueServeLifecycleJobs,
} from "@convex/convexJobQueue"
import {
  mergeServeEventMetadata,
  planForcedServeMachineTermination,
  planServeProvisioningJobs,
  planServeStop,
  type ServeLifecycleEvent,
  type ServeLifecyclePlan,
  type ServeLifecycleServeState,
} from "@convex/core/serveLifecyclePlan"
import { storageKeys } from "@convex/core/storage"
import { getAccessibleServe } from "@convex/servesAccess"
import { SERVE_STATUS } from "@convex/servesConstants"
import { toServeResponse } from "@convex/servesRead"

export function toServeLifecycleState(row: Doc<"serves">): ServeLifecycleServeState {
  return {
    serveId: String(row._id),
    status: row.status,
    providerMachineId: row.providerMachineId,
    providerCredentialId: row.providerCredentialId,
    runtimeTokenHash: row.runtimeTokenHash,
    error: row.error,
  }
}

async function insertServeLifecycleEvents(
  ctx: MutationCtx,
  serveId: Id<"serves">,
  events: ServeLifecycleEvent[],
) {
  for (const event of events) {
    await ctx.db.insert("serveEvents", {
      serveId,
      status: event.status,
      message: event.message,
      metadata: mergeServeEventMetadata(event),
    })
  }
}

export async function applyServeLifecyclePlan(
  ctx: MutationCtx,
  serveId: Id<"serves">,
  plan: ServeLifecyclePlan,
) {
  if (plan.patch && Object.keys(plan.patch).length > 0) {
    await ctx.db.patch("serves", serveId, plan.patch)
  }
  await insertServeLifecycleEvents(ctx, serveId, plan.events ?? [])
  await enqueueServeLifecycleJobs(ctx, plan.jobs ?? [])
}

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
  const computeCredential = resolveManagedComputeCredential()

  const now = Date.now()
  const servePrefix = storageKeys.serveExecutionPrefix(String(args.environmentId), now)
  const serveId = await ctx.db.insert("serves", {
    userId: args.userId,
    environmentId: args.environmentId,
    ...args.serveConfig,
    dataManifestHash: args.serveConfig.dataManifestHash || undefined,
    logs: `${servePrefix}/logs`,
    status: SERVE_STATUS.QUEUED,
    providerCredentialId: String(computeCredential.providerCredentialId),
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

  await enqueueServeLifecycleJobs(ctx, planServeProvisioningJobs({
    serveId: String(serveId),
    enqueueProvisioning: args.enqueueProvisioning ?? true,
  }))

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
  const plan = planServeStop({
    serve: toServeLifecycleState(row),
    force,
  })
  await applyServeLifecyclePlan(ctx, serveId, plan)

  return { serve_id: String(serveId), stop_requested: true, forced: force, status: plan.resultStatus }
}

export async function scheduleForcedServeMachineTermination(
  ctx: MutationCtx,
  serveId: Id<"serves">,
  providerMachineId: string | undefined,
  providerCredentialId: string | undefined,
) {
  await enqueueServeLifecycleJobs(ctx, planForcedServeMachineTermination({
    serveId: String(serveId),
    providerMachineId,
    providerCredentialId,
  }))
}
