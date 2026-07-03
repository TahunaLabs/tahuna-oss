import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex/auth", () => ({
  authComponent: {},
  requireUser: vi.fn(),
}));

vi.mock("@convex/cloud/billing", () => ({
  initialHostedComputeSessionBillingFieldsForSpec: vi.fn(),
  settleHostedComputeSessionUsage: vi.fn(),
  validateHostedComputeSessionCreate: vi.fn(),
}));

vi.mock("@convex/runtimeProvisioning", () => ({
  provisionRuntimeMachine: vi.fn(),
  resolveImageName: vi.fn(),
  resolveWandbBaseURL: vi.fn(),
  terminateRuntimeMachine: vi.fn(),
  terminateRuntimeMachineWithRetry: vi.fn(),
}));

import {
  internalMarkIdleAfterRun,
  internalMarkIdleIfActiveRunTerminal,
  internalMarkMachineProvisioned,
} from "@convex/computeSessions";

const NOW_MS = 123_456;

type InternalMutation<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};

function internalMutationHandler<TArgs>(mutation: unknown) {
  return (mutation as InternalMutation<TArgs>)._handler;
}

function createIdleCtx(run: Record<string, unknown> | null) {
  const session = {
    _id: "session_1",
    _creationTime: 1_000,
    userId: "user_1",
    environmentId: "env_1",
    status: "running",
    activeRunId: "run_1",
    idleTimeoutSeconds: 600,
    runtimeTokenHash: "token_hash",
  };
  return {
    db: {
      get: vi.fn(async (tableOrId: string, maybeId?: string) => {
        const id = maybeId ?? tableOrId;
        if (tableOrId === "computeSessions" && id === "session_1") {
          return session;
        }
        if (id === "run_1") {
          return run;
        }
        return null;
      }),
      patch: vi.fn(),
      insert: vi.fn(),
    },
    scheduler: {
      runAfter: vi.fn(),
    },
  };
}

function createMachineProvisionedCtx(status: string) {
  const session = {
    _id: "session_1",
    _creationTime: 1_000,
    userId: "user_1",
    environmentId: "env_1",
    status,
    idleTimeoutSeconds: 600,
    runtimeTokenHash: "token_hash",
  };
  return {
    db: {
      get: vi.fn(async (tableOrId: string, maybeId?: string) => {
        const id = maybeId ?? tableOrId;
        if (tableOrId === "computeSessions" && id === "session_1") {
          return session;
        }
        return null;
      }),
      patch: vi.fn(),
      insert: vi.fn(),
    },
  };
}

describe("compute session idle mutations", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("idles a running session when its active run has been deleted", async () => {
    const ctx = createIdleCtx(null);

    await internalMutationHandler<{ computeSessionId: string }>(internalMarkIdleIfActiveRunTerminal)(
      ctx,
      { computeSessionId: "session_1" },
    );

    expect(ctx.db.patch).toHaveBeenCalledWith("computeSessions", "session_1", {
      status: "idle",
      activeRunId: undefined,
      lastIdleAt: NOW_MS,
    });
    expect(ctx.db.insert).toHaveBeenCalledWith("computeSessionEvents", {
      computeSessionId: "session_1",
      status: "idle",
      message: "compute session idle",
    });
  });

  it("idles after a run when the posted run id was deleted", async () => {
    const ctx = createIdleCtx(null);

    await internalMutationHandler<{ computeSessionId: string; runId: string }>(internalMarkIdleAfterRun)(
      ctx,
      { computeSessionId: "session_1", runId: "run_1" },
    );

    expect(ctx.db.patch).toHaveBeenCalledWith("computeSessions", "session_1", {
      status: "idle",
      activeRunId: undefined,
      lastIdleAt: NOW_MS,
    });
    expect(ctx.db.insert).toHaveBeenCalledWith("computeSessionEvents", {
      computeSessionId: "session_1",
      status: "idle",
      message: "compute session idle",
    });
  });

  it("does not idle a session while the active run is still running", async () => {
    const activeRun = { _id: "run_1", status: "running" };
    const firstCtx = createIdleCtx(activeRun);
    const secondCtx = createIdleCtx(activeRun);

    await internalMutationHandler<{ computeSessionId: string }>(internalMarkIdleIfActiveRunTerminal)(
      firstCtx,
      { computeSessionId: "session_1" },
    );
    await internalMutationHandler<{ computeSessionId: string; runId: string }>(internalMarkIdleAfterRun)(
      secondCtx,
      { computeSessionId: "session_1", runId: "run_1" },
    );

    expect(firstCtx.db.patch).not.toHaveBeenCalled();
    expect(firstCtx.db.insert).not.toHaveBeenCalled();
    expect(secondCtx.db.patch).not.toHaveBeenCalled();
    expect(secondCtx.db.insert).not.toHaveBeenCalled();
  });

  it("reports when machine provisioning is recorded", async () => {
    const ctx = createMachineProvisionedCtx("provisioning");

    await expect(
      internalMutationHandler<{
        computeSessionId: string;
        providerMachineId: string;
        providerCreationTime: number;
        runtimeTokenHash: string;
      }>(internalMarkMachineProvisioned)(ctx, {
        computeSessionId: "session_1",
        providerMachineId: "machine_1",
        providerCreationTime: 10_000,
        runtimeTokenHash: "token_hash",
      }),
    ).resolves.toEqual({ recorded: true });

    expect(ctx.db.patch).toHaveBeenCalledWith("computeSessions", "session_1", expect.objectContaining({
      providerMachineId: "machine_1",
      runtimeTokenHash: "token_hash",
      providerCreationTime: 10_000,
      computeStartedAt: 10_000,
    }));
  });

  it("reports when machine provisioning is not recorded for terminal sessions", async () => {
    const ctx = createMachineProvisionedCtx("terminated");

    await expect(
      internalMutationHandler<{
        computeSessionId: string;
        providerMachineId: string;
        runtimeTokenHash: string;
      }>(internalMarkMachineProvisioned)(ctx, {
        computeSessionId: "session_1",
        providerMachineId: "machine_1",
        runtimeTokenHash: "token_hash",
      }),
    ).resolves.toEqual({ recorded: false });

    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
