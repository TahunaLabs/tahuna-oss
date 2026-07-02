import { describe, expect, it } from "vitest";

import { toServeResponse } from "@convex/servesRead";

describe("serve read responses", () => {
  it("exposes the backing compute session without changing serve identity", () => {
    const response = toServeResponse({
      _id: "serve_1",
      _creationTime: 1_000,
      environmentId: "env_1",
      computeSessionId: "session_1",
      command: ["python", "-m", "serve"],
      outputDir: "outputs",
      logs: "serves/env_1/logs",
      status: "queued",
      providerMachineId: "machine_1",
      codeManifestHash: "code_hash",
      dataManifestHash: "data_hash",
      pythonVersion: "3.11",
      gpuType: "A100 PCIe",
      gpuCount: 1,
      volumeGb: 80,
      port: 8000,
      healthPath: "/health",
      defaultModelPath: "outputs/model",
      startupTimeoutSeconds: 600,
      healthIntervalSeconds: 10,
      healthTimeoutSeconds: 2,
      healthFailureThreshold: 3,
      gracefulShutdownSeconds: 30,
      modelSnapshot: {
        sourceType: "storage",
        objectPrefix: "models/foo",
        manifestKey: "models/foo/manifest.json",
        manifestHash: "manifest_hash",
        objectCount: 1,
        totalBytes: 123,
      },
    } as never);

    expect(response).toMatchObject({
      serve_id: "serve_1",
      compute_session_id: "session_1",
      inference_path: "/api/serves/serve_1/inference",
    });
  });
});
