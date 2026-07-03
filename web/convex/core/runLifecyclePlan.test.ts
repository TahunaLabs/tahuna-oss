import { describe, expect, it } from "vitest";

import {
  RUN_LIFECYCLE_STATUS,
  isActiveRunStatus,
  isTerminalRunStatus,
  planCancellationTerminationCompleted,
  planRunCancellation,
  planRunCreation,
  planRunDeletion,
  planRuntimeArtifactCommit,
  planRuntimeStatusIngestion,
  shouldAbortProvisioning,
  shouldEnforceStartupTimeout,
} from "@convex/core/runLifecyclePlan";

describe("run lifecycle planning", () => {
  it("plans queued run creation with canonical execution paths and event metadata", () => {
    const plan = planRunCreation({
      userId: "user_1",
      environmentId: "env_1",
      name: "training run",
      command: ["python", "train.py"],
      dataId: "data_1",
      effectiveGpuType: "NVIDIA A100",
      effectiveGpuCount: 2,
      effectiveVolumeGb: 160,
      codeManifestHash: "code_hash",
      dataManifestHash: "",
      dependencyGroup: "train",
      nowMs: 1234,
      enqueueProvisioning: true,
    });

    expect(plan.run).toMatchObject({
      userId: "user_1",
      environmentId: "env_1",
      outputDir: "outputs",
      input: "runs/env_1/1234/input",
      output: "runs/env_1/1234/output",
      logs: "runs/env_1/1234/logs",
      status: RUN_LIFECYCLE_STATUS.QUEUED,
      cancellationRequested: false,
      dependencyGroup: "train",
    });
    expect(plan.run.dataManifestHash).toBeUndefined();
    expect(plan.event).toEqual({
      status: RUN_LIFECYCLE_STATUS.QUEUED,
      message: "run queued for provisioning",
      metadata: {
        name: "training run",
        command: ["python", "train.py"],
        gpu_type: "NVIDIA A100",
        gpu_count: 2,
        volume_gb: 160,
        code_manifest_hash: "code_hash",
        data_manifest_hash: null,
        dependency_group: "train",
      },
    });
  });

  it("marks runs cancelled immediately when cancellation happens before provisioning", () => {
    const plan = planRunCancellation({
      run: { runId: "run_1", status: RUN_LIFECYCLE_STATUS.QUEUED },
      force: false,
      terminationGraceMs: 30_000,
    });

    expect(plan).toEqual({
      patch: {
        status: RUN_LIFECYCLE_STATUS.CANCELLED,
        cancellationRequested: true,
      },
      events: [
        {
          status: RUN_LIFECYCLE_STATUS.CANCELLED,
          message: "run cancelled before provisioning",
          includeTerminalTiming: true,
        },
      ],
    });
  });

  it("schedules delayed machine termination when cancelling an active provisioned run", () => {
    const plan = planRunCancellation({
      run: {
        runId: "run_1",
        status: RUN_LIFECYCLE_STATUS.RUNNING,
        providerMachineId: " machine_1 ",
      },
      force: false,
      terminationGraceMs: 31_900,
    });

    expect(plan.patch).toEqual({
      status: RUN_LIFECYCLE_STATUS.CANCELLING,
      cancellationRequested: true,
    });
    expect(plan.events?.[0]).toEqual({
      status: RUN_LIFECYCLE_STATUS.CANCELLING,
      message: "cancellation requested (grace period 31s before termination)",
    });
    expect(plan.jobs).toEqual([
      {
        type: "terminate_machine",
        runId: "run_1",
        delayMs: 31_900,
        providerMachineId: "machine_1",
        force: false,
        attempt: undefined,
        idempotencyKey: "run:run_1:terminate_machine:machine_1:false:none",
      },
    ]);
  });

  it("keeps active and terminal status sets disjoint", () => {
    expect(isActiveRunStatus(RUN_LIFECYCLE_STATUS.RUNNING)).toBe(true);
    expect(isActiveRunStatus(RUN_LIFECYCLE_STATUS.COMPLETED)).toBe(false);
    expect(isTerminalRunStatus(RUN_LIFECYCLE_STATUS.FAILED)).toBe(true);
    expect(isTerminalRunStatus(RUN_LIFECYCLE_STATUS.CANCELLING)).toBe(false);
  });

  it("guards provisioning and deletion around active run state", () => {
    expect(shouldAbortProvisioning(null)).toBe(true);
    expect(shouldAbortProvisioning({ runId: "run_1", status: RUN_LIFECYCLE_STATUS.FAILED })).toBe(true);
    expect(shouldAbortProvisioning({ runId: "run_1", status: RUN_LIFECYCLE_STATUS.QUEUED })).toBe(false);

    expect(
      shouldEnforceStartupTimeout({
        state: {
          status: RUN_LIFECYCLE_STATUS.PROVISIONING,
          cancellationRequested: false,
          providerMachineId: "machine_1",
        },
        providerMachineId: "machine_1",
      }),
    ).toBe(true);
    expect(
      shouldEnforceStartupTimeout({
        state: {
          status: RUN_LIFECYCLE_STATUS.RUNNING,
          cancellationRequested: false,
          providerMachineId: "machine_1",
        },
        providerMachineId: "machine_1",
      }),
    ).toBe(false);

    expect(
      planRunDeletion({
        run: { runId: "run_1", status: RUN_LIFECYCLE_STATUS.RUNNING },
        cancelActive: false,
        force: false,
      }),
    ).toEqual({ error: "run is active; cancel it before deleting", deleteRunData: false });
  });

  it("normalizes runtime status ingestion for terminal outcomes", () => {
    const plan = planRuntimeStatusIngestion({
      run: {
        runId: "run_1",
        status: RUN_LIFECYCLE_STATUS.RUNNING,
        providerMachineId: "machine_1",
      },
      status: RUN_LIFECYCLE_STATUS.FAILED,
      error: "  runtime exploded  ",
      nowMs: 10_000,
    });

    expect(plan.patch).toEqual({
      status: RUN_LIFECYCLE_STATUS.FAILED,
      error: "runtime exploded",
      runtimeTokenHash: "revoked",
    });
    expect(plan.events?.[0]).toEqual({
      status: RUN_LIFECYCLE_STATUS.FAILED,
      message: "runtime exploded",
      metadata: { source: "machine-runtime" },
      includeTerminalTiming: true,
    });
    expect(plan.jobs?.[0]).toMatchObject({
      type: "terminate_machine",
      runId: "run_1",
      providerMachineId: "machine_1",
      force: true,
    });
    expect(plan.resultStatus).toBe(RUN_LIFECYCLE_STATUS.FAILED);
  });

  it("does not schedule run-owned machine termination for compute-session runs", () => {
    const plan = planRuntimeStatusIngestion({
      run: {
        runId: "run_1",
        computeSessionId: "session_1",
        status: RUN_LIFECYCLE_STATUS.RUNNING,
        providerMachineId: "machine_1",
      },
      status: RUN_LIFECYCLE_STATUS.COMPLETED,
      nowMs: 10_000,
    });

    expect(plan.patch).toMatchObject({
      status: RUN_LIFECYCLE_STATUS.COMPLETED,
      runtimeTokenHash: "revoked",
    });
    expect(plan.jobs).toEqual([]);
  });

  it("revokes runtime tokens when cancellation termination completes", () => {
    const plan = planCancellationTerminationCompleted({
      run: {
        runId: "run_1",
        status: RUN_LIFECYCLE_STATUS.CANCELLING,
        cancellationRequested: true,
        runtimeTokenHash: "token_hash",
      },
      force: true,
    });

    expect(plan.patch).toEqual({
      status: RUN_LIFECYCLE_STATUS.CANCELLED,
      runtimeTokenHash: "revoked",
    });
  });

  it("commits only artifact keys under the run output path and deduplicates existing keys", () => {
    const plan = planRuntimeArtifactCommit({
      outputPath: "runs/env_1/1234/output",
      existingArtifactKeys: ["runs/env_1/1234/output/model.bin"],
      artifacts: [
        { key: "runs/env_1/1234/output/model.bin", size: 1, providerCreationTime: 10 },
        { key: "runs/env_1/1234/output/metrics.json", size: 2, providerCreationTime: 11 },
        { key: "runs/env_1/9999/output/other.bin", size: 3, providerCreationTime: 12 },
      ],
    });

    expect(plan.acceptedArtifacts.map((artifact) => artifact.key)).toEqual([
      "runs/env_1/1234/output/model.bin",
      "runs/env_1/1234/output/metrics.json",
    ]);
    expect(plan.patch).toEqual({
      artifactKeys: [
        "runs/env_1/1234/output/model.bin",
        "runs/env_1/1234/output/metrics.json",
      ],
    });
    expect(plan.acceptedCount).toBe(1);
  });
});
