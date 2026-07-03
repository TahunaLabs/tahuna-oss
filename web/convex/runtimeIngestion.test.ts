import { describe, expect, it, vi } from "vitest";

vi.mock("@convex/auth", () => ({
  authComponent: {},
  requireUser: vi.fn(),
}));

vi.mock("@convex/cloud/runLifecycleComposition", () => ({
  applyHostedRunLifecyclePlan: vi.fn(),
  cancelHostedRunForUserId: vi.fn(),
  createHostedRunForUserId: vi.fn(),
  deleteHostedRunForUserId: vi.fn(),
}));

vi.mock("@convex/cloud/serveLifecycleComposition", () => ({
  applyHostedServeLifecyclePlan: vi.fn(),
  createHostedServeForUserId: vi.fn(),
  stopHostedServeForUserId: vi.fn(),
}));

vi.mock("@convex/computeProvider", () => ({
  computeProvider: {},
  resolveComputeCompatibilityCloudType: vi.fn(),
}));

vi.mock("@convex/computeSessionAssignment", () => ({
  assignQueuedRunToComputeSession: vi.fn(),
}));

vi.mock("@convex/computeSessionsLifecycle", () => ({
  createComputeSessionForUserId: vi.fn(),
  removeUnprovisionedComputeSessionForUserId: vi.fn(),
}));

vi.mock("@convex/convexJobQueue", () => ({
  completeActionJob: vi.fn(),
  enqueueCleanupFailedUploadJob: vi.fn(),
  enqueueRunDataDeletionBatch: vi.fn(),
  enqueueTerminateMachineJob: vi.fn(),
  failActionJob: vi.fn(),
  markCoreJobCompleted: vi.fn(),
  markCoreJobFailed: vi.fn(),
  startActionJob: vi.fn(),
  upsertCoreJobRecord: vi.fn(),
}));

vi.mock("@convex/envVars", () => ({
  buildProvisionedRuntimeEnv: vi.fn(),
  resolveEnvironmentEnvVarsForEnvironmentId: vi.fn(),
}));

vi.mock("@convex/objectStore", () => ({
  objectStore: {},
}));

vi.mock("@convex/runtimeBootstrap", () => ({
  fetchServeSnapshotManifest: vi.fn(),
  fetchSyncManifest: vi.fn(),
  resolveServeSnapshotDownloadEntries: vi.fn(),
  resolveSyncManifestDownloadEntries: vi.fn(),
}));

vi.mock("@convex/runtimeProvisioning", () => ({
  provisionRuntimeMachine: vi.fn(),
  resolveImageName: vi.fn(),
  resolveWandbBaseURL: vi.fn(),
  terminateRuntimeMachineWithRetry: vi.fn(),
}));

vi.mock("@convex/serveOrphanMachines", () => ({
  terminateServeMachineProvisionedAfterSessionTermination: vi.fn(),
}));

import {
  ingestRuntimeLogs as ingestRunRuntimeLogs,
  ingestRuntimeMetrics as ingestRunRuntimeMetrics,
} from "@convex/runs";
import { ingestRuntimeLogs as ingestServeRuntimeLogs } from "@convex/serves";

type InternalMutation<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};

function internalMutationHandler<TArgs>(mutation: unknown) {
  return (mutation as InternalMutation<TArgs>)._handler;
}

function ingestionCtx(row: Record<string, unknown>) {
  return {
    db: {
      get: vi.fn(async () => row),
      insert: vi.fn(),
    },
  };
}

describe("runtime ingestion terminal guards", () => {
  it("rejects runtime logs for terminal runs", async () => {
    const ctx = ingestionCtx({ _id: "run_1", status: "completed" });

    await expect(
      internalMutationHandler<{ runId: string; lines: Array<{ message: string }> }>(
        ingestRunRuntimeLogs,
      )(ctx, {
        runId: "run_1",
        lines: [{ message: "late log" }],
      }),
    ).resolves.toEqual({ accepted: 0 });

    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("rejects runtime metrics for terminal runs", async () => {
    const ctx = ingestionCtx({ _id: "run_1", status: "failed" });

    await expect(
      internalMutationHandler<{
        runId: string;
        metrics: Array<{ name: string; value: number }>;
      }>(ingestRunRuntimeMetrics)(ctx, {
        runId: "run_1",
        metrics: [{ name: "loss", value: 0.5 }],
      }),
    ).resolves.toEqual({ accepted: 0 });

    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("rejects runtime logs for terminal serves", async () => {
    const ctx = ingestionCtx({ _id: "serve_1", status: "stopped" });

    await expect(
      internalMutationHandler<{ serveId: string; lines: Array<{ message: string }> }>(
        ingestServeRuntimeLogs,
      )(ctx, {
        serveId: "serve_1",
        lines: [{ message: "late log" }],
      }),
    ).resolves.toEqual({ accepted: 0 });

    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
