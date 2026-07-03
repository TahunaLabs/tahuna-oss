import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeProvisioningMocks = vi.hoisted(() => ({
  terminateRuntimeMachine: vi.fn(),
}));

const jobQueueMocks = vi.hoisted(() => ({
  enqueueTerminateServeMachineJob: vi.fn(),
}));

vi.mock("@convex/runtimeProvisioning", () => runtimeProvisioningMocks);
vi.mock("@convex/convexJobQueue", () => jobQueueMocks);

import { terminateServeMachineProvisionedAfterSessionTermination } from "@convex/serveOrphanMachines";

describe("serve orphan machine termination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("terminates a provider machine that was provisioned after session termination", async () => {
    const ctx = {
      runMutation: vi.fn(),
    };

    await terminateServeMachineProvisionedAfterSessionTermination(ctx as never, {
      serveId: "serve_1" as never,
      computeSessionId: "session_1" as never,
      providerMachineId: "machine_1",
    });

    expect(runtimeProvisioningMocks.terminateRuntimeMachine).toHaveBeenCalledWith(ctx, {
      providerMachineId: "machine_1",
    });
    expect(jobQueueMocks.enqueueTerminateServeMachineJob).not.toHaveBeenCalled();
    expect(ctx.runMutation.mock.calls[0]?.[1]).toEqual({
      computeSessionId: "session_1",
      providerMachineId: "machine_1",
    });
  });

  it("falls back to a force terminate serve-machine job when direct termination fails", async () => {
    runtimeProvisioningMocks.terminateRuntimeMachine.mockRejectedValueOnce(new Error("provider unavailable"));
    const ctx = {
      runMutation: vi.fn(),
    };

    await terminateServeMachineProvisionedAfterSessionTermination(ctx as never, {
      serveId: "serve_1" as never,
      computeSessionId: "session_1" as never,
      providerMachineId: "machine_1",
    });

    expect(jobQueueMocks.enqueueTerminateServeMachineJob).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: "terminate_serve_machine",
      serveId: "serve_1",
      providerMachineId: "machine_1",
      force: true,
    }));
    expect(ctx.runMutation.mock.calls[0]?.[1]).toEqual({
      computeSessionId: "session_1",
      providerMachineId: "machine_1",
    });
  });
});
