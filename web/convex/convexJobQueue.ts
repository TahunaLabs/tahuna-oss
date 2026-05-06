import { Workpool } from "@convex-dev/workpool";
import { components, internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { ActionCtx, MutationCtx } from "@convex/_generated/server";
import { RUN_CONFIG } from "@convex/appConfig";
import {
  CORE_JOB_TYPES,
  toCoreJobRecord,
  type CleanupFailedUploadJob,
  type CoreJob,
  type CoreJobRecordInput,
  type CoreJobStatus,
  type RunLifecycleJob,
  type CheckServeStartupTimeoutJob,
  type ServeLifecycleJob,
  type TerminateMachineJob,
  type TerminateServeMachineJob,
} from "@convex/core/jobQueue";

const provisionPool = new Workpool(components.workpool, {
  maxParallelism: RUN_CONFIG.workpoolMaxParallelism,
  retryActionsByDefault: true,
});

function toRunId(value: string) {
  return value as Id<"runs">;
}

function toServeId(value: string) {
  return value as Id<"serves">;
}

function jobAvailableAt(now: number, delayMs: number) {
  return now + Math.max(0, Math.floor(delayMs));
}

export async function upsertCoreJobRecord(
  ctx: MutationCtx,
  job: CoreJobRecordInput,
  status: CoreJobStatus = "scheduled",
): Promise<{ jobId: Id<"jobs">; created: boolean; record: Doc<"jobs"> | null }> {
  const now = Date.now();
  const existing = await ctx.db
    .query("jobs")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", job.idempotencyKey))
    .first();
  if (existing) {
    if (existing.status !== "completed") {
      await ctx.db.patch("jobs", existing._id, {
        type: job.type,
        payload: job.payload,
        delayMs: job.delayMs,
        availableAt: jobAvailableAt(now, job.delayMs),
        status,
        attempts:
          status === "running" && existing.status !== "running"
            ? Math.max(0, existing.attempts || 0) + 1
            : existing.attempts,
        updatedAt: now,
        completedAt: undefined,
      });
    }
    return { jobId: existing._id, created: false, record: existing };
  }

  const jobId = await ctx.db.insert("jobs", {
    type: job.type,
    idempotencyKey: job.idempotencyKey,
    status,
    payload: job.payload,
    delayMs: job.delayMs,
    availableAt: jobAvailableAt(now, job.delayMs),
    attempts: status === "running" ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
  return { jobId, created: true, record: null };
}

export async function markCoreJobCompleted(ctx: MutationCtx, jobId: Id<"jobs">) {
  const now = Date.now();
  await ctx.db.patch("jobs", jobId, {
    status: "completed",
    updatedAt: now,
    completedAt: now,
    lastError: undefined,
  });
}

export async function markCoreJobFailed(ctx: MutationCtx, jobId: Id<"jobs">, error: string) {
  await ctx.db.patch("jobs", jobId, {
    status: "failed",
    updatedAt: Date.now(),
    lastError: error.trim() || "job failed",
  });
}

async function recordActionJob(ctx: ActionCtx, job: CoreJob, status: CoreJobStatus) {
  return await ctx.runMutation(internal.runs.recordRunJob, {
    job: toCoreJobRecord(job),
    status,
  });
}

export async function startActionJob(ctx: ActionCtx, job: CoreJob) {
  return await recordActionJob(ctx, job, "running");
}

export async function completeActionJob(ctx: ActionCtx, jobId: Id<"jobs">) {
  await ctx.runMutation(internal.runs.completeRunJob, { jobId });
}

export async function failActionJob(ctx: ActionCtx, jobId: Id<"jobs">, error: string) {
  await ctx.runMutation(internal.runs.failRunJob, { jobId, error });
}

export async function enqueueCleanupFailedUploadJob(ctx: ActionCtx, job: CleanupFailedUploadJob) {
  await recordActionJob(ctx, job, "scheduled");
  await ctx.scheduler.runAfter(job.delayMs, internal.runs.cleanupFailedArtifactUpload, {
    runId: toRunId(job.runId),
    key: job.artifactKey,
    reason: job.reason,
  });
}

export async function enqueueTerminateMachineJob(ctx: ActionCtx, job: TerminateMachineJob) {
  await recordActionJob(ctx, job, "scheduled");
  await ctx.scheduler.runAfter(job.delayMs, internal.runs.internalTerminateMachine, {
    runId: toRunId(job.runId),
    providerMachineId: job.providerMachineId,
    providerCredentialId: job.providerCredentialId,
    force: job.force,
    attempt: job.attempt,
  });
}

export async function enqueueServeStartupTimeoutJob(ctx: ActionCtx, job: CheckServeStartupTimeoutJob) {
  await recordActionJob(ctx, job, "scheduled");
  await ctx.scheduler.runAfter(job.delayMs, internal.serves.enforceProvisioningStartupTimeout, {
    serveId: toServeId(job.serveId),
    providerMachineId: job.providerMachineId,
    providerCredentialId: job.providerCredentialId,
    startupTimeoutSeconds: job.startupTimeoutSeconds,
  });
}

export async function enqueueTerminateServeMachineJob(ctx: ActionCtx, job: TerminateServeMachineJob) {
  await recordActionJob(ctx, job, "scheduled");
  await ctx.scheduler.runAfter(job.delayMs, internal.serves.internalTerminateMachine, {
    serveId: toServeId(job.serveId),
    providerMachineId: job.providerMachineId,
    providerCredentialId: job.providerCredentialId,
    force: job.force,
    attempt: job.attempt,
  });
}

export async function enqueueRunDataDeletionBatch(ctx: MutationCtx, runId: Id<"runs">) {
  await ctx.scheduler.runAfter(0, internal.runs.internalDeleteRunData, { runId });
}

export async function enqueueRunLifecycleJobs(ctx: MutationCtx, jobs: RunLifecycleJob[]) {
  for (const job of jobs) {
    await enqueueRunLifecycleJob(ctx, job);
  }
}

async function enqueueRunLifecycleJob(ctx: MutationCtx, job: RunLifecycleJob) {
  const { created } = await upsertCoreJobRecord(ctx, toCoreJobRecord(job));
  if (!created) {
    return;
  }

  if (job.type === CORE_JOB_TYPES.PROVISION_RUN) {
    await provisionPool.enqueueAction(ctx, internal.runs.provisionRun, {
      runId: toRunId(job.runId),
    });
    return;
  }

  if (job.type === CORE_JOB_TYPES.CHECK_STARTUP_TIMEOUT) {
    await ctx.scheduler.runAfter(job.delayMs, internal.runs.enforceProvisioningStartupTimeout, {
      runId: toRunId(job.runId),
      providerMachineId: job.providerMachineId,
      providerCredentialId: job.providerCredentialId,
      fingerprint: job.fingerprint,
    });
    return;
  }

  await ctx.scheduler.runAfter(job.delayMs, internal.runs.internalTerminateMachine, {
    runId: toRunId(job.runId),
    providerMachineId: job.providerMachineId,
    providerCredentialId: job.providerCredentialId,
    force: job.force,
    attempt: job.attempt,
  });
}

export async function enqueueServeLifecycleJobs(ctx: MutationCtx, jobs: ServeLifecycleJob[]) {
  for (const job of jobs) {
    await enqueueServeLifecycleJob(ctx, job);
  }
}

async function enqueueServeLifecycleJob(ctx: MutationCtx, job: ServeLifecycleJob) {
  const { created } = await upsertCoreJobRecord(ctx, toCoreJobRecord(job));
  if (!created) {
    return;
  }

  if (job.type === CORE_JOB_TYPES.PROVISION_SERVE) {
    await provisionPool.enqueueAction(ctx, internal.serves.provisionServe, {
      serveId: toServeId(job.serveId),
    });
    return;
  }

  if (job.type === CORE_JOB_TYPES.CHECK_SERVE_STARTUP_TIMEOUT) {
    await ctx.scheduler.runAfter(job.delayMs, internal.serves.enforceProvisioningStartupTimeout, {
      serveId: toServeId(job.serveId),
      providerMachineId: job.providerMachineId,
      providerCredentialId: job.providerCredentialId,
      startupTimeoutSeconds: job.startupTimeoutSeconds,
    });
    return;
  }

  await ctx.scheduler.runAfter(job.delayMs, internal.serves.internalTerminateMachine, {
    serveId: toServeId(job.serveId),
    providerMachineId: job.providerMachineId,
    providerCredentialId: job.providerCredentialId,
    force: job.force,
    attempt: job.attempt,
  });
}
