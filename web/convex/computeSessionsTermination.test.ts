import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const billingMocks = vi.hoisted(() => ({
  settleHostedComputeSessionUsage: vi.fn(async () => ({ patch: {} })),
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

vi.mock("@convex/runtimeProvisioning", () => ({
  provisionRuntimeMachine: vi.fn(),
  resolveImageName: vi.fn(),
  resolveWandbBaseURL: vi.fn(),
  terminateRuntimeMachine: vi.fn(),
  terminateRuntimeMachineWithRetry: vi.fn(),
}));

import {
  internalMarkFailed,
  internalMarkTerminated,
  internalListTerminationTimedOut,
} from "@convex/computeSessions";

const NOW_MS = 200_000;

type InternalMutation<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};
type InternalQuery<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};

function internalMutationHandler<TArgs>(mutation: unknown) {
  return (mutation as InternalMutation<TArgs>)._handler;
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

  it("lists only terminating sessions older than the terminating timeout", async () => {
    const rows = [
      computeSession({
        _id: "fresh_session",
        status: "terminating",
        terminatingSince: NOW_MS - 899_000,
      }),
      computeSession({
        _id: "stale_session",
        status: "terminating",
        terminatingSince: NOW_MS - 900_000,
      }),
    ];
    const ctx = {
      db: {
        query: vi.fn(() => ({
          withIndex: vi.fn(() => ({
            take: vi.fn(async () => rows),
          })),
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
});
