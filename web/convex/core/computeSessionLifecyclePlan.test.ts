import { describe, expect, it } from "vitest";

import {
  COMPUTE_SESSION_STATUS,
  isComputeSessionHeartbeatTimedOut,
  isComputeSessionIdleTimedOut,
  planComputeSessionCreation,
  planComputeSessionFailure,
  planComputeSessionTerminated,
  planComputeSessionMachineProvisioned,
  planComputeSessionRunAssigned,
  planComputeSessionStop,
} from "@convex/core/computeSessionLifecyclePlan";

describe("compute session lifecycle planning", () => {
  it("calculates heartbeat timeout from heartbeat first and startup timestamp second", () => {
    expect(
      isComputeSessionHeartbeatTimedOut({
        lastHeartbeatAt: 1_000,
        providerCreationTime: 20_000,
        createdAt: 30_000,
        heartbeatTimeoutSeconds: 5,
        startupTimeoutSeconds: 100,
        nowMs: 5_999,
      }),
    ).toBe(false);
    expect(
      isComputeSessionHeartbeatTimedOut({
        lastHeartbeatAt: 1_000,
        providerCreationTime: 20_000,
        createdAt: 30_000,
        heartbeatTimeoutSeconds: 5,
        startupTimeoutSeconds: 100,
        nowMs: 6_000,
      }),
    ).toBe(true);
    expect(
      isComputeSessionHeartbeatTimedOut({
        providerCreationTime: 20_000,
        createdAt: 30_000,
        heartbeatTimeoutSeconds: 5,
        startupTimeoutSeconds: 10,
        nowMs: 29_999,
      }),
    ).toBe(false);
    expect(
      isComputeSessionHeartbeatTimedOut({
        providerCreationTime: 20_000,
        createdAt: 30_000,
        heartbeatTimeoutSeconds: 5,
        startupTimeoutSeconds: 10,
        nowMs: 30_000,
      }),
    ).toBe(true);
  });

  it("calculates idle timeout only from finite idle timestamps", () => {
    expect(isComputeSessionIdleTimedOut({ lastIdleAt: null, idleTimeoutSeconds: 10, nowMs: 100_000 })).toBe(false);
    expect(isComputeSessionIdleTimedOut({ lastIdleAt: 1_000, idleTimeoutSeconds: 10, nowMs: 10_999 })).toBe(false);
    expect(isComputeSessionIdleTimedOut({ lastIdleAt: 1_000, idleTimeoutSeconds: 10, nowMs: 11_000 })).toBe(true);
    expect(isComputeSessionIdleTimedOut({ lastIdleAt: 1_000, idleTimeoutSeconds: 0, nowMs: 1_000 })).toBe(true);
  });

  it("plans compute session creation with provisioning event metadata", () => {
    const plan = planComputeSessionCreation({
      nowMs: 1234,
      userId: "user_1",
      environmentId: "env_1",
      effectiveGpuType: "NVIDIA A100",
      effectiveGpuCount: 1,
      effectiveVolumeGb: 80,
      framework: "pt",
      frameworkVersion: "2.8.0-cu128",
      pythonVersion: "3.11",
      imageName: "ghcr.io/tahuna/test:pt",
      idleTimeoutSeconds: 600,
    });

    expect(plan.session).toMatchObject({
      userId: "user_1",
      environmentId: "env_1",
      status: COMPUTE_SESSION_STATUS.PROVISIONING,
      imageName: "ghcr.io/tahuna/test:pt",
      createdAt: 1234,
    });
    expect(plan.event).toEqual({
      status: COMPUTE_SESSION_STATUS.PROVISIONING,
      message: "compute session provisioning requested",
      metadata: {
        environment_id: "env_1",
        gpu_type: "NVIDIA A100",
        gpu_count: 1,
        volume_gb: 80,
        framework: "pt",
        framework_version: "2.8.0-cu128",
        python_version: "3.11",
        image_name: "ghcr.io/tahuna/test:pt",
        idle_timeout_seconds: 600,
      },
    });
  });

  it("validates machine provisioning and trims provider machine ids", () => {
    expect(
      planComputeSessionMachineProvisioned({
        session: { computeSessionId: "session_1", status: COMPUTE_SESSION_STATUS.PROVISIONING },
        providerMachineId: " machine_1 ",
        providerCreationTime: 123,
        runtimeTokenHash: "token_hash",
        nowMs: 456,
      }),
    ).toEqual({
      patch: {
        providerMachineId: "machine_1",
        runtimeTokenHash: "token_hash",
        providerCreationTime: 123,
        computeStartedAt: 123,
      },
      events: [
        {
          status: COMPUTE_SESSION_STATUS.PROVISIONING,
          message: "compute session machine provisioned",
          metadata: { provider_machine_id: "machine_1" },
        },
      ],
    });

    expect(
      planComputeSessionMachineProvisioned({
        session: { computeSessionId: "session_1", status: COMPUTE_SESSION_STATUS.PROVISIONING },
        providerMachineId: "   ",
        runtimeTokenHash: "token_hash",
        nowMs: 456,
      }),
    ).toMatchObject({
      patch: {
        status: COMPUTE_SESSION_STATUS.FAILED,
        error: "provider machine id is required",
        runtimeTokenHash: "revoked",
      },
    });
  });

  it("assigns runs only to idle sessions with non-empty run ids", () => {
    expect(
      planComputeSessionRunAssigned({
        session: { computeSessionId: "session_1", status: COMPUTE_SESSION_STATUS.PROVISIONING },
        runId: "run_1",
        nowMs: 1,
      }),
    ).toEqual({ error: "compute session must be idle, got provisioning" });
    expect(
      planComputeSessionRunAssigned({
        session: { computeSessionId: "session_1", status: COMPUTE_SESSION_STATUS.IDLE },
        runId: "   ",
        nowMs: 1,
      }),
    ).toEqual({ error: "run id is required" });
    expect(
      planComputeSessionRunAssigned({
        session: { computeSessionId: "session_1", status: COMPUTE_SESSION_STATUS.IDLE },
        runId: " run_1 ",
        nowMs: 1,
      }),
    ).toEqual({
      patch: {
        status: COMPUTE_SESSION_STATUS.RUNNING,
        activeRunId: "run_1",
      },
      events: [
        {
          status: COMPUTE_SESSION_STATUS.RUNNING,
          message: "compute session run assigned",
          metadata: { run_id: "run_1" },
        },
      ],
    });
  });

  it("stops unprovisioned sessions locally and fails active sessions with sanitized detail", () => {
    expect(
      planComputeSessionStop({
        session: { computeSessionId: "session_1", status: COMPUTE_SESSION_STATUS.PROVISIONING },
        force: false,
        nowMs: 5_000,
      }),
    ).toEqual({
      patch: {
        status: COMPUTE_SESSION_STATUS.TERMINATED,
        runtimeTokenHash: "revoked",
        activeRunId: undefined,
        terminatedAt: 5_000,
      },
      events: [
        {
          status: COMPUTE_SESSION_STATUS.TERMINATED,
          message: "compute session stopped before machine provisioning",
        },
      ],
    });

    expect(
      planComputeSessionFailure({
        session: {
          computeSessionId: "session_1",
          status: COMPUTE_SESSION_STATUS.RUNNING,
          activeRunId: "run_1",
          providerMachineId: "machine_1",
          computeStartedAt: 1_000,
        },
        error: "  provider unavailable  ",
        nowMs: 6_000,
      }),
    ).toEqual({
      patch: {
        status: COMPUTE_SESSION_STATUS.FAILED,
        error: "provider unavailable",
        runtimeTokenHash: "revoked",
        activeRunId: undefined,
        terminatedAt: 6_000,
        computeEndedAt: 6_000,
      },
      events: [
        {
          status: COMPUTE_SESSION_STATUS.FAILED,
          message: "provider unavailable",
        },
      ],
    });
  });

  it("records insufficient-credit termination reason when stopping provisioned sessions", () => {
    expect(
      planComputeSessionStop({
        session: {
          computeSessionId: "session_1",
          status: COMPUTE_SESSION_STATUS.RUNNING,
          providerMachineId: "machine_1",
          computeStartedAt: 1_000,
        },
        force: true,
        reason: "insufficient_credits",
        nowMs: 6_000,
      }),
    ).toEqual({
      patch: {
        status: COMPUTE_SESSION_STATUS.TERMINATING,
        terminationReason: "insufficient_credits",
        terminatingSince: 6_000,
      },
      events: [
        {
          status: COMPUTE_SESSION_STATUS.TERMINATING,
          message: "force stop requested",
          metadata: {
            provider_machine_id: "machine_1",
            reason: "insufficient_credits",
          },
        },
      ],
    });
  });

  it("sets compute billing end when provisioned sessions terminate", () => {
    expect(
      planComputeSessionTerminated({
        session: {
          computeSessionId: "session_1",
          status: COMPUTE_SESSION_STATUS.TERMINATING,
          providerMachineId: "machine_1",
          computeStartedAt: 2_000,
        },
        nowMs: 8_000,
      }),
    ).toMatchObject({
      patch: {
        status: COMPUTE_SESSION_STATUS.TERMINATED,
        computeEndedAt: 8_000,
      },
    });
  });

  it("keeps failed sessions failed on late termination callbacks", () => {
    expect(
      planComputeSessionTerminated({
        session: {
          computeSessionId: "session_1",
          status: COMPUTE_SESSION_STATUS.FAILED,
          providerMachineId: "machine_1",
          computeStartedAt: 2_000,
          computeEndedAt: 7_000,
        },
        nowMs: 8_000,
      }),
    ).toEqual({});

    expect(
      planComputeSessionTerminated({
        session: {
          computeSessionId: "session_1",
          status: COMPUTE_SESSION_STATUS.TERMINATING,
          providerMachineId: "machine_1",
          computeStartedAt: 2_000,
        },
        nowMs: 8_000,
      }),
    ).toMatchObject({
      patch: {
        status: COMPUTE_SESSION_STATUS.TERMINATED,
        computeEndedAt: 8_000,
      },
    });
  });
});
