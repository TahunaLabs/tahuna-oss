import { describe, expect, it } from "vitest";

import {
  CORE_JOB_TYPES,
  createCheckServeStartupTimeoutJob,
  createCheckStartupTimeoutJob,
  createCleanupFailedUploadJob,
  createDeleteServeDataJob,
  createFinalizeArtifactJob,
  createProvisionRunJob,
  createProvisionServeJob,
  createTerminateMachineJob,
  createTerminateServeMachineJob,
  toCoreJobRecord,
} from "@convex/core/jobQueue";

const FINGERPRINT = {
  cloudType: "secure",
  framework: "pt",
  version: "2.8.0-cu128",
  pythonVersion: "3.11",
  gpuType: "NVIDIA A100",
  imageName: "ghcr.io/tahuna/test:pt",
};

describe("core job queue contracts", () => {
  it("normalizes delay and idempotency for run provisioning jobs", () => {
    expect(createProvisionRunJob({ runId: "run_1", delayMs: -10 })).toEqual({
      type: CORE_JOB_TYPES.PROVISION_RUN,
      runId: "run_1",
      delayMs: 0,
      idempotencyKey: "run:run_1:provision_run",
    });

    expect(createProvisionRunJob({ runId: "run_1", delayMs: 10.9 }).delayMs).toBe(10);
  });

  it("normalizes run termination attempts and converts them to durable records", () => {
    const job = createTerminateMachineJob({
      runId: "run_1",
      providerMachineId: "machine_1",
      force: true,
      attempt: 2.9,
      delayMs: Number.NaN,
    });

    expect(job).toEqual({
      type: CORE_JOB_TYPES.TERMINATE_MACHINE,
      runId: "run_1",
      delayMs: 0,
      providerMachineId: "machine_1",
      force: true,
      attempt: 2,
      idempotencyKey: "run:run_1:terminate_machine:machine_1:true:2",
    });
    expect(toCoreJobRecord(job)).toEqual({
      type: CORE_JOB_TYPES.TERMINATE_MACHINE,
      idempotencyKey: "run:run_1:terminate_machine:machine_1:true:2",
      delayMs: 0,
      payload: {
        runId: "run_1",
        providerMachineId: "machine_1",
        force: true,
        attempt: 2,
      },
    });
  });

  it("deduplicates and sorts artifact finalize keys before deriving idempotency", () => {
    const job = createFinalizeArtifactJob({
      runId: "run_1",
      keys: [" runs/out/b ", "runs/out/a", "runs/out/a", ""],
      delayMs: 5,
    });

    expect(job).toEqual({
      type: CORE_JOB_TYPES.FINALIZE_ARTIFACT,
      runId: "run_1",
      delayMs: 5,
      artifactKeys: ["runs/out/a", "runs/out/b"],
      idempotencyKey: "run:run_1:finalize_artifact:runs/out/a,runs/out/b",
    });
    expect(toCoreJobRecord(job).payload).toEqual({
      runId: "run_1",
      artifactKeys: ["runs/out/a", "runs/out/b"],
    });
  });

  it("keeps cleanup failed upload records keyed by the trimmed artifact key", () => {
    const job = createCleanupFailedUploadJob({
      runId: "run_1",
      key: " runs/out/tmp ",
      reason: "commit failed",
      delayMs: 1,
    });

    expect(job.idempotencyKey).toBe("run:run_1:cleanup_failed_upload:runs/out/tmp");
    expect(toCoreJobRecord(job)).toEqual({
      type: CORE_JOB_TYPES.CLEANUP_FAILED_UPLOAD,
      idempotencyKey: "run:run_1:cleanup_failed_upload:runs/out/tmp",
      delayMs: 1,
      payload: {
        runId: "run_1",
        artifactKey: "runs/out/tmp",
        reason: "commit failed",
      },
    });
  });

  it("preserves startup timeout payloads for run and serve workers", () => {
    const runJob = createCheckStartupTimeoutJob({
      runId: "run_1",
      delayMs: 60_000.9,
      providerMachineId: "machine_1",
      fingerprint: FINGERPRINT,
    });
    const serveJob = createCheckServeStartupTimeoutJob({
      serveId: "serve_1",
      delayMs: 30_000,
      providerMachineId: "machine_2",
      startupTimeoutSeconds: 120.9,
    });

    expect(toCoreJobRecord(runJob)).toEqual({
      type: CORE_JOB_TYPES.CHECK_STARTUP_TIMEOUT,
      idempotencyKey: "run:run_1:check_startup_timeout:machine_1",
      delayMs: 60_000,
      payload: {
        runId: "run_1",
        providerMachineId: "machine_1",
        fingerprint: FINGERPRINT,
      },
    });
    expect(toCoreJobRecord(serveJob)).toEqual({
      type: CORE_JOB_TYPES.CHECK_SERVE_STARTUP_TIMEOUT,
      idempotencyKey: "serve:serve_1:check_serve_startup_timeout:machine_2",
      delayMs: 30_000,
      payload: {
        serveId: "serve_1",
        providerMachineId: "machine_2",
        startupTimeoutSeconds: 120,
      },
    });
  });

  it("normalizes serve job contracts for provisioning, termination, and data deletion", () => {
    expect(toCoreJobRecord(createProvisionServeJob({ serveId: "serve_1", delayMs: -1 }))).toEqual({
      type: CORE_JOB_TYPES.PROVISION_SERVE,
      idempotencyKey: "serve:serve_1:provision_serve",
      delayMs: 0,
      payload: { serveId: "serve_1" },
    });

    expect(
      toCoreJobRecord(
        createTerminateServeMachineJob({
          serveId: "serve_1",
          providerMachineId: "machine_1",
          force: false,
          attempt: -5,
          delayMs: 2.5,
        }),
      ),
    ).toEqual({
      type: CORE_JOB_TYPES.TERMINATE_SERVE_MACHINE,
      idempotencyKey: "serve:serve_1:terminate_serve_machine:machine_1:false:0",
      delayMs: 2,
      payload: {
        serveId: "serve_1",
        providerMachineId: "machine_1",
        force: false,
        attempt: 0,
      },
    });

    expect(toCoreJobRecord(createDeleteServeDataJob({ serveId: "serve_1" }))).toEqual({
      type: CORE_JOB_TYPES.DELETE_SERVE_DATA,
      idempotencyKey: "serve:serve_1:delete_serve_data",
      delayMs: 0,
      payload: { serveId: "serve_1" },
    });
  });
});
