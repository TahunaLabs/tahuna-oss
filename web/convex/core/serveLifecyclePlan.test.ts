import { describe, expect, it } from "vitest";

import {
  SERVE_LIFECYCLE_STATUS,
  canTransitionServeStatus,
  defaultServeStatusMessage,
  planServeComputeSessionBillingFailure,
  planServeComputeSessionStop,
  planServeComputeSessionTerminationFailed,
  planServeFailure,
  planServeRuntimeStatusIngestion,
  planServeStop,
  shouldEnforceServeStartupTimeout,
} from "@convex/core/serveLifecyclePlan";

describe("serve lifecycle planning", () => {
  it("captures allowed status transitions", () => {
    expect(canTransitionServeStatus(SERVE_LIFECYCLE_STATUS.QUEUED, SERVE_LIFECYCLE_STATUS.PROVISIONING)).toBe(true);
    expect(canTransitionServeStatus(SERVE_LIFECYCLE_STATUS.PROVISIONING, SERVE_LIFECYCLE_STATUS.STARTING)).toBe(true);
    expect(canTransitionServeStatus(SERVE_LIFECYCLE_STATUS.STARTING, SERVE_LIFECYCLE_STATUS.SERVING)).toBe(true);
    expect(canTransitionServeStatus(SERVE_LIFECYCLE_STATUS.SERVING, SERVE_LIFECYCLE_STATUS.STOPPING)).toBe(true);
    expect(canTransitionServeStatus(SERVE_LIFECYCLE_STATUS.STOPPING, SERVE_LIFECYCLE_STATUS.STOPPED)).toBe(true);
    expect(canTransitionServeStatus(SERVE_LIFECYCLE_STATUS.SERVING, SERVE_LIFECYCLE_STATUS.PROVISIONING)).toBe(false);
    expect(canTransitionServeStatus(SERVE_LIFECYCLE_STATUS.STOPPED, SERVE_LIFECYCLE_STATUS.SERVING)).toBe(false);
  });

  it("uses canonical default runtime messages", () => {
    expect(defaultServeStatusMessage(SERVE_LIFECYCLE_STATUS.PROVISIONING)).toBe("serve provisioning");
    expect(defaultServeStatusMessage(SERVE_LIFECYCLE_STATUS.STARTING)).toBe("serve starting");
    expect(defaultServeStatusMessage(SERVE_LIFECYCLE_STATUS.SERVING)).toBe("serve healthy and serving");
    expect(defaultServeStatusMessage("unknown")).toBe("serve failed");
  });

  it("stops a serve before runtime start without scheduling machine termination", () => {
    const plan = planServeStop({
      serve: { serveId: "serve_1", status: SERVE_LIFECYCLE_STATUS.QUEUED, runtimeTokenHash: "token" },
      force: false,
    });

    expect(plan).toEqual({
      resultStatus: SERVE_LIFECYCLE_STATUS.STOPPED,
      patch: {
        status: SERVE_LIFECYCLE_STATUS.STOPPED,
        runtimeTokenHash: "revoked",
      },
      events: [
        {
          status: SERVE_LIFECYCLE_STATUS.STOPPED,
          message: "serve stopped before runtime start",
          metadata: { source: "control-plane", forced: false },
          includeTerminalTiming: true,
        },
      ],
      jobs: [],
    });
  });

  it("schedules machine termination when stopping a provisioned serve", () => {
    const plan = planServeStop({
      serve: {
        serveId: "serve_1",
        status: SERVE_LIFECYCLE_STATUS.SERVING,
        providerMachineId: " machine_1 ",
        runtimeTokenHash: "token",
      },
      force: true,
    });

    expect(plan.patch).toEqual({
      status: SERVE_LIFECYCLE_STATUS.STOPPING,
      runtimeTokenHash: "token",
    });
    expect(plan.jobs).toEqual([
      {
        type: "terminate_serve_machine",
        serveId: "serve_1",
        delayMs: 0,
        providerMachineId: "machine_1",
        force: true,
        attempt: undefined,
        idempotencyKey: "serve:serve_1:terminate_serve_machine:machine_1:true:none",
      },
    ]);
  });

  it("stops compute-session-backed serves without serve machine termination jobs", () => {
    const plan = planServeComputeSessionStop({
      serve: {
        serveId: "serve_1",
        status: SERVE_LIFECYCLE_STATUS.SERVING,
        providerMachineId: "machine_1",
        runtimeTokenHash: "token",
      },
      computeSessionId: "session_1",
      force: false,
    });

    expect(plan).toEqual({
      resultStatus: SERVE_LIFECYCLE_STATUS.STOPPING,
      patch: {
        status: SERVE_LIFECYCLE_STATUS.STOPPING,
        runtimeTokenHash: "token",
      },
      events: [
        {
          status: SERVE_LIFECYCLE_STATUS.STOPPING,
          message: "stop requested",
          metadata: {
            source: "control-plane",
            forced: false,
            compute_session_id: "session_1",
          },
        },
      ],
      jobs: [],
    });
  });

  it("enforces startup timeout only for matching provisioning machines", () => {
    expect(
      shouldEnforceServeStartupTimeout({
        state: { status: SERVE_LIFECYCLE_STATUS.PROVISIONING, providerMachineId: "machine_1" },
        providerMachineId: "machine_1",
      }),
    ).toBe(true);
    expect(
      shouldEnforceServeStartupTimeout({
        state: { status: SERVE_LIFECYCLE_STATUS.SERVING, providerMachineId: "machine_1" },
        providerMachineId: "machine_1",
      }),
    ).toBe(false);
    expect(
      shouldEnforceServeStartupTimeout({
        state: { status: SERVE_LIFECYCLE_STATUS.PROVISIONING, providerMachineId: "machine_2" },
        providerMachineId: "machine_1",
      }),
    ).toBe(false);
  });

  it("rejects invalid runtime transitions without patching serve state", () => {
    const plan = planServeRuntimeStatusIngestion({
      serve: { serveId: "serve_1", status: SERVE_LIFECYCLE_STATUS.SERVING },
      status: SERVE_LIFECYCLE_STATUS.PROVISIONING,
      nowMs: 42,
    });

    expect(plan).toEqual({
      resultStatus: SERVE_LIFECYCLE_STATUS.SERVING,
      error: "invalid serve status transition: serving -> provisioning",
    });
  });

  it("records failed runtime status as terminal and revokes runtime token", () => {
    const plan = planServeRuntimeStatusIngestion({
      serve: {
        serveId: "serve_1",
        status: SERVE_LIFECYCLE_STATUS.STARTING,
        providerMachineId: "machine_1",
      },
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: "  app crashed  ",
      nowMs: 42,
    });

    expect(plan.patch).toEqual({
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: "app crashed",
      runtimeTokenHash: "revoked",
    });
    expect(plan.events?.[0]).toEqual({
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      message: "app crashed",
      metadata: { source: "serve-runtime" },
      includeTerminalTiming: true,
    });
    expect(plan.jobs?.[0]).toMatchObject({
      type: "terminate_serve_machine",
      serveId: "serve_1",
      providerMachineId: "machine_1",
      force: true,
    });
  });

  it("does not schedule direct serve machine termination for compute-session-backed runtime failures", () => {
    const plan = planServeRuntimeStatusIngestion({
      serve: {
        serveId: "serve_1",
        status: SERVE_LIFECYCLE_STATUS.STARTING,
        providerMachineId: "machine_1",
        computeSessionId: "session_1",
      },
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: "app crashed",
      nowMs: 42,
    });

    expect(plan.patch).toMatchObject({
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: "app crashed",
    });
    expect(plan.jobs).toEqual([]);
  });

  it("does not schedule direct serve machine termination for compute-session-backed provisioning failures", () => {
    const plan = planServeFailure({
      serve: {
        serveId: "serve_1",
        status: SERVE_LIFECYCLE_STATUS.PROVISIONING,
        providerMachineId: "machine_1",
        computeSessionId: "session_1",
      },
      error: "startup timeout",
    });

    expect(plan.patch).toMatchObject({
      status: SERVE_LIFECYCLE_STATUS.FAILED,
      error: "startup timeout",
    });
    expect(plan.jobs).toEqual([]);
  });

  it("marks a serve unavailable when its compute session is terminated for billing", () => {
    const plan = planServeComputeSessionBillingFailure({
      serve: {
        serveId: "serve_1",
        status: SERVE_LIFECYCLE_STATUS.SERVING,
        providerMachineId: "machine_1",
      },
      computeSessionId: "session_1",
    });

    expect(plan).toEqual({
      patch: {
        status: SERVE_LIFECYCLE_STATUS.FAILED,
        error: "serve compute terminated because credits are exhausted",
        runtimeTokenHash: "revoked",
        providerMachineId: undefined,
      },
      events: [
        {
          status: SERVE_LIFECYCLE_STATUS.FAILED,
          message: "serve compute terminated because credits are exhausted",
          metadata: {
            source: "compute-session-billing",
            compute_session_id: "session_1",
          },
          includeTerminalTiming: true,
        },
      ],
      jobs: [],
    });
  });

  it("marks a stopping serve failed when compute session termination retries exhaust", () => {
    const plan = planServeComputeSessionTerminationFailed({
      serve: {
        serveId: "serve_1",
        status: SERVE_LIFECYCLE_STATUS.STOPPING,
        providerMachineId: "machine_1",
      },
      computeSessionId: "session_1",
      error: "provider unavailable (retries exhausted)",
    });

    expect(plan).toEqual({
      patch: {
        status: SERVE_LIFECYCLE_STATUS.FAILED,
        error: "serve compute termination failed: provider unavailable (retries exhausted)",
        runtimeTokenHash: "revoked",
      },
      events: [
        {
          status: SERVE_LIFECYCLE_STATUS.FAILED,
          message: "serve compute termination failed",
          metadata: {
            source: "compute-session",
            compute_session_id: "session_1",
            error: "provider unavailable (retries exhausted)",
          },
          includeTerminalTiming: true,
        },
      ],
      jobs: [],
    });
  });
});
