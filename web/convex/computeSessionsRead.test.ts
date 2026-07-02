import { describe, expect, it } from "vitest";

import { toComputeSessionResponse } from "@convex/computeSessionsRead";

describe("compute session read responses", () => {
  it("exposes the owning serve when a compute session backs serving", () => {
    const response = toComputeSessionResponse({
      _id: "session_1",
      createdAt: 1_000,
      environmentId: "env_1",
      serveId: "serve_1",
      status: "provisioning",
      effectiveGpuType: "A100 PCIe",
      effectiveGpuCount: 1,
      effectiveVolumeGb: 80,
      framework: "serve",
      frameworkVersion: "vllm",
      pythonVersion: "3.11",
      imageName: "tahuna/serve-vllm:latest",
      idleTimeoutSeconds: 0,
    } as never);

    expect(response).toMatchObject({
      compute_session_id: "session_1",
      serve_id: "serve_1",
      active_run_id: "",
    });
  });
});
