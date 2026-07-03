import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeProvisioningMocks = vi.hoisted(() => ({
  provisionRuntimeMachine: vi.fn(),
  resolveImageName: vi.fn(),
  resolveWandbBaseURL: vi.fn(() => "https://wandb.example.com"),
  terminateRuntimeMachine: vi.fn(),
  terminateRuntimeMachineWithRetry: vi.fn(),
}));

vi.mock("@convex/auth", () => ({
  authComponent: {},
  requireUser: vi.fn(),
}));

vi.mock("@convex/cloud/billing", () => ({
  initialHostedComputeSessionBillingFieldsForSpec: vi.fn(),
  settleHostedComputeSessionUsage: vi.fn(),
  validateHostedComputeSessionCreate: vi.fn(),
}));

vi.mock("@convex/envVars", () => ({
  buildProvisionedRuntimeEnv: vi.fn(() => ({})),
  resolveEnvironmentEnvVarsForEnvironmentId: vi.fn(async () => ({})),
}));

vi.mock("@convex/runtimeBootstrap", () => ({
  fetchSyncManifest: vi.fn(),
}));

vi.mock("@convex/runtimeProvisioning", () => runtimeProvisioningMocks);

import { provisionComputeSession } from "@convex/computeSessions";

type InternalAction<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};

function internalActionHandler<TArgs>(action: unknown) {
  return (action as InternalAction<TArgs>)._handler;
}

const provisioningPayload = {
  user_id: "user_1",
  environment_id: "env_1",
  code_manifest_hash: "code_hash",
  code_manifest_key: "code_key",
  data_manifest_hash: null,
  data_manifest_key: null,
};

const session = {
  compute_session_id: "session_1",
  environment_id: "env_1",
  image_name: "runtime_image",
  effective_gpu_type: "A100 PCIe",
  effective_gpu_count: 1,
  effective_volume_gb: 80,
};

describe("compute session provisioning action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("terminates a run machine when provisioning is not recorded on the session", async () => {
    runtimeProvisioningMocks.provisionRuntimeMachine.mockImplementationOnce(async (args: {
      setRuntimeTokenHash: (runtimeTokenHash: string) => Promise<void>;
    }) => {
      await args.setRuntimeTokenHash("token_hash");
      return {
        providerMachineId: "machine_1",
        providerCreationTime: 10_000,
      };
    });
    const ctx = {
      runQuery: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        if (args.computeSessionId === "session_1") {
          return session;
        }
        if (args.runId === "run_1") {
          return provisioningPayload;
        }
        return false;
      }),
      runMutation: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        if (args.providerMachineId === "machine_1" && args.computeSessionId === "session_1") {
          return { recorded: false };
        }
        return null;
      }),
    };

    await internalActionHandler<{
      userId: string;
      computeSessionId: string;
      initialRunId: string;
    }>(provisionComputeSession)(ctx, {
      userId: "user_1",
      computeSessionId: "session_1",
      initialRunId: "run_1",
    });

    expect(runtimeProvisioningMocks.terminateRuntimeMachine).toHaveBeenCalledWith(ctx, {
      providerMachineId: "machine_1",
    });
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
      runId: "run_1",
      error: "compute session terminated during provisioning",
      provisioningPayload,
    });
    expect(ctx.runMutation).not.toHaveBeenCalledWith(expect.anything(), {
      computeSessionId: "session_1",
    });
  });
});
