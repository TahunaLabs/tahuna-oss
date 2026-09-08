import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/_generated/server";

export function toComputeSessionResponse(row: Doc<"computeSessions">) {
  return {
    compute_session_id: String(row._id),
    created_at: row.createdAt,
    environment_id: String(row.environmentId),
    serve_id: row.serveId ? String(row.serveId) : "",
    status: row.status,
    error: row.error || "",
    provider_machine_id: row.providerMachineId || "",
    active_run_id: row.activeRunId ? String(row.activeRunId) : "",
    effective_gpu_type: row.effectiveGpuType,
    effective_gpu_count: row.effectiveGpuCount,
    effective_volume_gb: row.effectiveVolumeGb,
    framework: row.framework,
    framework_version: row.frameworkVersion,
    python_version: row.pythonVersion,
    image_name: row.imageName,
    idle_timeout_seconds: row.idleTimeoutSeconds,
    last_heartbeat_at: row.lastHeartbeatAt || null,
    last_idle_at: row.lastIdleAt || null,
    terminated_at: row.terminatedAt || null,
  };
}

export async function listComputeSessionsByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("computeSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
  return {
    compute_sessions: rows.map((row) => toComputeSessionResponse(row)),
  };
}

export async function listComputeSessionEvents(ctx: QueryCtx, computeSessionId: Id<"computeSessions">) {
  const rows = await ctx.db
    .query("computeSessionEvents")
    .withIndex("by_compute_session", (q) => q.eq("computeSessionId", computeSessionId))
    .order("asc")
    .collect();
  return {
    events: rows.map((row) => ({
      status: row.status,
      message: row.message,
      metadata: row.metadata ?? null,
      created_at: row._creationTime,
    })),
  };
}
