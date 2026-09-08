import { beforeEach, describe, expect, it, vi } from "vitest";

const jobQueueMocks = vi.hoisted(() => ({
  enqueueTerminateServeMachineJob: vi.fn(),
}));

vi.mock("@convex/auth", () => ({
  authComponent: {},
  requireUser: vi.fn(),
}));

vi.mock("@convex/cloud/serveLifecycleComposition", () => ({
  applyHostedServeLifecyclePlan: vi.fn(),
  createHostedServeForUserId: vi.fn(),
  stopHostedServeForUserId: vi.fn(),
}));

vi.mock("@convex/computeProvider", () => ({
  computeProvider: {},
}));

vi.mock("@convex/convexJobQueue", () => jobQueueMocks);

vi.mock("@convex/envVars", () => ({
  buildProvisionedRuntimeEnv: vi.fn(),
  resolveEnvironmentEnvVarsForEnvironmentId: vi.fn(),
}));

vi.mock("@convex/objectStore", () => ({
  objectStore: {
    deleteObject: vi.fn(),
  },
}));

vi.mock("@convex/runtimeBootstrap", () => ({
  fetchServeSnapshotManifest: vi.fn(async () => ({ entries: [] })),
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

import { internalRemove } from "@convex/serves";

type InternalAction<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};

function internalActionHandler<TArgs>(action: unknown) {
  return (action as InternalAction<TArgs>)._handler;
}

describe("serve removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues force termination for legacy active serve machines on delete", async () => {
    const payload = {
      serve_id: "serve_1",
      user_id: "user_1",
      environment_id: "env_1",
      compute_session_id: null,
      status: "serving",
      provider_machine_id: "machine_1",
      object_prefix: "models/serve_1",
      manifest_key: "models/serve_1/manifest.json",
      manifest_hash: "manifest_hash",
    };
    const ctx = {
      runQuery: vi.fn(async () => payload),
      runMutation: vi.fn(),
    };

    await expect(
      internalActionHandler<{ userId: string; serveId: string }>(internalRemove)(
        ctx,
        { userId: "user_1", serveId: "serve_1" },
      ),
    ).resolves.toEqual({ deleted: true, serve_id: "serve_1" });

    expect(jobQueueMocks.enqueueTerminateServeMachineJob).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "terminate_serve_machine",
      serveId: "serve_1",
      providerMachineId: "machine_1",
      force: true,
    }));
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
      serveId: "serve_1",
    });
  });
});
