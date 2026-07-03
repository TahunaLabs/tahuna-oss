import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => ({
  settleHostedComputeSessionUsage: vi.fn(async () => ({ patch: {} })),
}));
const runtimeProvisioningMocks = vi.hoisted(() => ({
  provisionRuntimeMachine: vi.fn(),
  resolveImageName: vi.fn(),
  resolveWandbBaseURL: vi.fn(),
  terminateRuntimeMachine: vi.fn(),
  terminateRuntimeMachineWithRetry: vi.fn(),
}));

vi.mock("@convex/auth", () => ({
  authComponent: {},
  requireUser: vi.fn(),
}));

vi.mock("@convex/cloud/billing", () => ({
  initialHostedComputeSessionBillingFieldsForSpec: vi.fn(),
  settleHostedComputeSessionUsage: billingMocks.settleHostedComputeSessionUsage,
  validateHostedComputeSessionCreate: vi.fn(),
}));

vi.mock("@convex/convexJobQueue", () => ({
  enqueueRunDataDeletionBatch: vi.fn(),
  enqueueRunLifecycleJobs: vi.fn(),
}));

vi.mock("@convex/runtimeProvisioning", () => runtimeProvisioningMocks);

import {
  internalListHeartbeatTimedOut,
  internalListIdleTimedOut,
  internalMarkFailed,
  internalMarkTerminated,
  internalTerminateInsufficientCreditsSession,
  internalTerminateStaleEnvironmentSession,
  internalListTerminationTimedOut,
} from "@convex/computeSessions";

const NOW_MS = 200_000;

type InternalMutation<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};
type InternalAction<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};
type InternalQuery<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};

function internalMutationHandler<TArgs>(mutation: unknown) {
  return (mutation as InternalMutation<TArgs>)._handler;
}

function internalActionHandler<TArgs>(action: unknown) {
  return (action as InternalAction<TArgs>)._handler;
}

function internalQueryHandler<TArgs>(query: unknown) {
  return (query as InternalQuery<TArgs>)._handler;
}

function computeSession(overrides: Record<string, unknown> = {}) {
  return {
    _id: "session_1",
    _creationTime: 1_000,
    userId: "user_1",
    environmentId: "env_1",
    status: "running",
    idleTimeoutSeconds: 600,
    runtimeTokenHash: "session_token",
    ...overrides,
  };
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    _id: "run_1",
    _creationTime: 1_000,
    userId: "user_1",
    environmentId: "env_1",
    status: "running",
    computeSessionId: "session_1",
    runtimeTokenHash: "run_token",
    artifactKeys: [],
    ...overrides,
  };
}

function createTerminationCtx(args: {
  session: Record<string, unknown>;
  runsById?: Record<string, Record<string, unknown>>;
  sweepRuns?: Array<Record<string, unknown>>;
}) {
  const env = { _id: "env_1", activeComputeSessionId: "session_1" };
  return {
    db: {
      get: vi.fn(async (tableOrId: string, maybeId?: string) => {
        const id = maybeId ?? tableOrId;
        if (tableOrId === "computeSessions" && id === "session_1") {
          return args.session;
        }
        if (tableOrId === "runs") {
          return args.runsById?.[id] ?? null;
        }
        if (id === "env_1") {
          return env;
        }
        return args.runsById?.[id] ?? null;
      }),
      query: vi.fn(() => ({
        withIndex: vi.fn(() => ({
          take: vi.fn(async () => args.sweepRuns ?? []),
          collect: vi.fn(async () => []),
        })),
      })),
      patch: vi.fn(),
      insert: vi.fn(),
    },
  };
}

describe("compute session termination run failure sink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails an active run when its compute session terminates", async () => {
    const activeRun = run();
    const ctx = createTerminationCtx({
      session: computeSession({ activeRunId: "run_1" }),
      runsById: { run_1: activeRun },
      sweepRuns: [activeRun],
    });

    await internalMutationHandler<{ computeSessionId: string }>(internalMarkTerminated)(
      ctx,
      { computeSessionId: "session_1" },
    );

    expect(ctx.db.patch).toHaveBeenCalledWith("runs", "run_1", expect.objectContaining({
      status: "failed",
      error: "compute session terminated",
      runtimeTokenHash: "revoked",
    }));
    expect(ctx.db.insert).toHaveBeenCalledWith("runEvents", expect.objectContaining({
      runId: "run_1",
      status: "failed",
      message: "compute session terminated",
    }));
    expect(ctx.db.patch).toHaveBeenCalledWith("computeSessions", "session_1", expect.objectContaining({
      status: "terminated",
      activeRunId: undefined,
      terminatedAt: NOW_MS,
    }));
  });

  it("does not rewrite terminal runs attached to a terminating session", async () => {
    const terminalRun = run({ status: "completed" });
    const ctx = createTerminationCtx({
      session: computeSession({ activeRunId: "run_1" }),
      runsById: { run_1: terminalRun },
      sweepRuns: [terminalRun],
    });

    await internalMutationHandler<{ computeSessionId: string }>(internalMarkTerminated)(
      ctx,
      { computeSessionId: "session_1" },
    );

    expect(ctx.db.patch).not.toHaveBeenCalledWith("runs", "run_1", expect.anything());
  });

  it("fails queued runs attached by computeSessionId during the sweep", async () => {
    const queuedRun = run({ _id: "run_2", status: "queued" });
    const ctx = createTerminationCtx({
      session: computeSession(),
      runsById: {},
      sweepRuns: [queuedRun],
    });

    await internalMutationHandler<{ computeSessionId: string }>(internalMarkTerminated)(
      ctx,
      { computeSessionId: "session_1" },
    );

    expect(ctx.db.patch).toHaveBeenCalledWith("runs", "run_2", expect.objectContaining({
      status: "failed",
      error: "compute session terminated",
      runtimeTokenHash: "revoked",
    }));
  });

  it("handles serve-backed sessions with no attached runs", async () => {
    const ctx = createTerminationCtx({
      session: computeSession({ serveId: "serve_1" }),
      sweepRuns: [],
    });

    await internalMutationHandler<{ computeSessionId: string; error: string }>(internalMarkFailed)(
      ctx,
      { computeSessionId: "session_1", error: "provider unavailable" },
    );

    expect(ctx.db.patch).not.toHaveBeenCalledWith("runs", expect.anything(), expect.anything());
    expect(ctx.db.patch).toHaveBeenCalledWith("computeSessions", "session_1", expect.objectContaining({
      status: "failed",
      error: "provider unavailable",
      activeRunId: undefined,
      terminatedAt: NOW_MS,
    }));
  });

  it("drives insufficient-credit termination through run, serve, and session actions", async () => {
    const ctx = {
      runMutation: vi.fn(),
      runAction: vi.fn(),
    };

    await internalActionHandler<{
      userId: string;
      environmentId: string;
      computeSessionId: string;
      activeRunId?: string;
      serveId?: string;
    }>(internalTerminateInsufficientCreditsSession)(ctx, {
      userId: "user_1",
      environmentId: "env_1",
      computeSessionId: "session_1",
      activeRunId: "run_1",
      serveId: "serve_1",
    });

    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
      runId: "run_1",
      error: "compute session terminated because credits are exhausted",
    });
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
      serveId: "serve_1",
      computeSessionId: "session_1",
    });
    expect(ctx.runAction).toHaveBeenCalledWith(expect.anything(), {
      userId: "user_1",
      environmentId: "env_1",
      computeSessionId: "session_1",
      serveId: "serve_1",
      reason: "insufficient_credits",
    });
  });

  it("re-driven stale termination still wants to terminate the provider machine", async () => {
    const session = {
      compute_session_id: "session_1",
      user_id: "user_1",
      environment_id: "env_1",
      status: "terminating",
      provider_machine_id: "machine_1",
    };
    runtimeProvisioningMocks.terminateRuntimeMachineWithRetry.mockImplementationOnce(
      async (args: { shouldTerminate: () => Promise<boolean> }) => {
        await expect(args.shouldTerminate()).resolves.toBe(true);
      },
    );
    const ctx = {
      runQuery: vi.fn(async () => session),
      runMutation: vi.fn(),
      scheduler: {
        runAfter: vi.fn(),
      },
    };

    await internalActionHandler<{
      userId: string;
      environmentId: string;
      computeSessionId: string;
    }>(internalTerminateStaleEnvironmentSession)(ctx, {
      userId: "user_1",
      environmentId: "env_1",
      computeSessionId: "session_1",
    });

    expect(runtimeProvisioningMocks.terminateRuntimeMachineWithRetry).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      providerMachineId: "machine_1",
      attempt: 0,
    }));
  });

  it("finds terminating timed-out sessions behind the first status page", async () => {
    const freshRows = Array.from({ length: 3 }, (_, index) =>
      computeSession({
        _id: `fresh_session_${index}`,
        status: "terminating",
        terminatingSince: NOW_MS - 899_000,
      }),
    );
    const staleRow = computeSession({
      _id: "stale_session",
      status: "terminating",
      terminatingSince: NOW_MS - 900_000,
    });
    let pageIndex = 0;
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn(() => {
            return {
              paginate: vi.fn(async () => {
                pageIndex += 1;
                return pageIndex === 1
                  ? { page: freshRows, isDone: false, continueCursor: "next" }
                  : { page: [staleRow], isDone: true, continueCursor: "" };
              }),
            };
          }),
        })),
      },
    };

    await expect(
      internalQueryHandler<{ nowMs: number; timeoutSeconds: number; limit?: number }>(
        internalListTerminationTimedOut,
      )(ctx, {
        nowMs: NOW_MS,
        timeoutSeconds: 15 * 60,
        limit: 10,
      }),
    ).resolves.toEqual([
      {
        user_id: "user_1",
        environment_id: "env_1",
        compute_session_id: "stale_session",
      },
    ]);
  });

  it("finds idle timed-out sessions behind the first status page", async () => {
    const freshRows = Array.from({ length: 3 }, (_, index) =>
      computeSession({
        _id: `fresh_session_${index}`,
        status: "idle",
        lastIdleAt: NOW_MS - 9_000,
        idleTimeoutSeconds: 10,
      }),
    );
    const staleRow = computeSession({
      _id: "stale_session",
      status: "idle",
      lastIdleAt: NOW_MS - 10_000,
      idleTimeoutSeconds: 10,
    });
    let pageIndex = 0;
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn(() => {
            return {
              paginate: vi.fn(async () => {
                pageIndex += 1;
                return pageIndex === 1
                  ? { page: freshRows, isDone: false, continueCursor: "next" }
                  : { page: [staleRow], isDone: true, continueCursor: "" };
              }),
            };
          }),
        })),
      },
    };

    await expect(
      internalQueryHandler<{ nowMs: number; limit?: number }>(internalListIdleTimedOut)(
        ctx,
        { nowMs: NOW_MS, limit: 1 },
      ),
    ).resolves.toEqual([
      {
        user_id: "user_1",
        environment_id: "env_1",
        compute_session_id: "stale_session",
        active_run_id: "",
        reason: "idle",
      },
    ]);
  });

  it("finds heartbeat timed-out running sessions behind the first status page", async () => {
    const freshRows = Array.from({ length: 3 }, (_, index) =>
      computeSession({
        _id: `fresh_running_session_${index}`,
        status: "running",
        lastHeartbeatAt: NOW_MS - 119_000,
      }),
    );
    const staleRow = computeSession({
      _id: "stale_running_session",
      status: "running",
      lastHeartbeatAt: NOW_MS - 120_000,
      activeRunId: "run_1",
    });
    const pageIndexByStatus: Record<string, number> = {};
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn((_index: string, callback: (q: { eq: (field: string, value: string) => unknown }) => unknown) => {
            let status = "";
            callback({
              eq: (_field: string, value: string) => {
                status = value;
                return {};
              },
            });
            return {
              paginate: vi.fn(async () => {
                if (status === "idle") {
                  return { page: [], isDone: true, continueCursor: "" };
                }
                const pageIndex = (pageIndexByStatus[status] ?? 0) + 1;
                pageIndexByStatus[status] = pageIndex;
                return pageIndex === 1
                  ? { page: freshRows, isDone: false, continueCursor: "next" }
                  : { page: [staleRow], isDone: true, continueCursor: "" };
              }),
            };
          }),
        })),
      },
    };

    await expect(
      internalQueryHandler<{ nowMs: number; timeoutSeconds: number; limit?: number }>(
        internalListHeartbeatTimedOut,
      )(ctx, {
        nowMs: NOW_MS,
        timeoutSeconds: 120,
        limit: 1,
      }),
    ).resolves.toEqual([
      {
        user_id: "user_1",
        environment_id: "env_1",
        compute_session_id: "stale_running_session",
        active_run_id: "run_1",
        reason: "heartbeat",
      },
    ]);
  });
});
