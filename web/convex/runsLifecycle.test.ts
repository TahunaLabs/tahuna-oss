import { describe, expect, it, vi } from "vitest";

vi.mock("@convex/convexJobQueue", () => ({
  enqueueRunDataDeletionBatch: vi.fn(),
  enqueueRunLifecycleJobs: vi.fn(),
}));

vi.mock("@convex/runtimeProvisioning", () => ({
  resolveImageName: vi.fn(),
}));

import { deleteRunForUserId } from "@convex/runsLifecycle";

function createDeleteRunCtx(run: Record<string, unknown>) {
  return {
    db: {
      get: vi.fn(async (table: string, id: string) => {
        if (table === "runs" && id === "run_1") {
          return run;
        }
        return null;
      }),
      query: vi.fn(() => ({
        withIndex: vi.fn(() => ({
          take: vi.fn(async () => []),
        })),
      })),
      delete: vi.fn(),
    },
  };
}

describe("run lifecycle deletion", () => {
  it("releases the backing compute session when force-deleting an active session run", async () => {
    const run = {
      _id: "run_1",
      _creationTime: 1_000,
      userId: "user_1",
      environmentId: "env_1",
      status: "running",
      computeSessionId: "session_1",
      artifactKeys: [],
    };
    const ctx = createDeleteRunCtx(run);
    const releaseComputeSessionForDeletedRun = vi.fn(async () => {});

    await expect(
      deleteRunForUserId(
        ctx as never,
        "user_1",
        "run_1" as never,
        { force: true },
        { releaseComputeSessionForDeletedRun },
      ),
    ).resolves.toEqual({ deleted: true, run_id: "run_1" });

    expect(releaseComputeSessionForDeletedRun).toHaveBeenCalledWith(ctx, run);
  });

  it("does not release a compute session when deleting a terminal session run", async () => {
    const run = {
      _id: "run_1",
      _creationTime: 1_000,
      userId: "user_1",
      environmentId: "env_1",
      status: "completed",
      computeSessionId: "session_1",
      artifactKeys: [],
    };
    const ctx = createDeleteRunCtx(run);
    const releaseComputeSessionForDeletedRun = vi.fn(async () => {});

    await expect(
      deleteRunForUserId(
        ctx as never,
        "user_1",
        "run_1" as never,
        { force: true },
        { releaseComputeSessionForDeletedRun },
      ),
    ).resolves.toEqual({ deleted: true, run_id: "run_1" });

    expect(releaseComputeSessionForDeletedRun).not.toHaveBeenCalled();
  });
});
