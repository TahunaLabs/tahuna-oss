import { beforeEach, describe, expect, it, vi } from "vitest";

const computeSessionMocks = vi.hoisted(() => ({
  createComputeSessionForUserId: vi.fn(),
}));

vi.mock("@convex/computeSessionsLifecycle", () => computeSessionMocks);

import { hostedServeLifecycleComposition } from "@convex/cloud/serveLifecycleComposition";

const serveConfig = {
  command: ["python", "-m", "serve"],
  outputDir: "outputs",
  codeManifestHash: "code_hash",
  dataManifestHash: null,
  dependencyGroup: "serve",
  pythonVersion: "3.11",
  gpuType: "A100 PCIe",
  gpuCount: 1,
  volumeGb: 80,
  port: 8000,
  healthPath: "/health",
  defaultModelPath: "outputs/model",
  startupTimeoutSeconds: 600,
  healthIntervalSeconds: 10,
  healthTimeoutSeconds: 2,
  healthFailureThreshold: 3,
  gracefulShutdownSeconds: 30,
};

describe("hosted serve lifecycle composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a non-warm backing compute session for serving", async () => {
    computeSessionMocks.createComputeSessionForUserId.mockResolvedValue({
      compute_session_id: "session_1",
    });

    await expect(
      hostedServeLifecycleComposition.createComputeSession?.({} as never, {
        userId: "user_1",
        environmentId: "env_1" as never,
        serveConfig,
      }),
    ).resolves.toEqual({
      computeSessionId: "session_1",
      eventMetadata: {
        compute_session_id: "session_1",
      },
    });

    expect(computeSessionMocks.createComputeSessionForUserId).toHaveBeenCalledWith({}, {
      userId: "user_1",
      environmentId: "env_1",
      idleTimeoutSeconds: 0,
      gpuType: "A100 PCIe",
      gpuCount: 1,
      volumeGb: 80,
      pythonVersion: "3.11",
      activateEnvironment: false,
    });
  });

  it("links the backing compute session to the created serve", async () => {
    const ctx = {
      db: {
        patch: vi.fn(),
      },
    };

    await hostedServeLifecycleComposition.linkComputeSessionToServe?.(ctx as never, {
      computeSessionId: "session_1" as never,
      serveId: "serve_1" as never,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith("computeSessions", "session_1", {
      serveId: "serve_1",
    });
  });

  it("schedules backing compute session termination for stopped serves", async () => {
    const ctx = {
      scheduler: {
        runAfter: vi.fn(),
      },
    };

    await hostedServeLifecycleComposition.stopComputeSession?.(ctx as never, {
      userId: "user_1",
      environmentId: "env_1" as never,
      serveId: "serve_1" as never,
      computeSessionId: "session_1" as never,
      force: false,
    });

    expect(ctx.scheduler.runAfter.mock.calls[0]?.[0]).toBe(0);
    expect(ctx.scheduler.runAfter.mock.calls[0]?.[2]).toEqual({
      userId: "user_1",
      environmentId: "env_1",
      computeSessionId: "session_1",
      serveId: "serve_1",
      reason: "user_stop",
    });
  });
});
