import { describe, expect, it } from "vitest";

import {
  buildRuntimeCompatibilityKey,
  classifyRuntimeIncompatibility,
  normalizeProvisioningError,
} from "@/lib/runtime-incompatibility";

describe("runtime incompatibility helpers", () => {
  it("builds stable lowercase compatibility keys from runtime fingerprints", () => {
    expect(
      buildRuntimeCompatibilityKey({
        cloudType: "SECURE",
        framework: " PT ",
        version: "2.8.0 CU128",
        pythonVersion: "3.11",
        gpuType: "NVIDIA A100 80GB",
        imageName: "Ghcr.IO/Tahuna/Image:Tag",
      }),
    ).toBe("secure|pt|2.8.0-cu128|3.11|nvidia-a100-80gb|ghcr.io/tahuna/image:tag");
  });

  it("normalizes provider-specific provisioning details to provider-neutral messages", () => {
    expect(normalizeProvisioningError("Runpod request failed: insufficient capacity in region")).toBe(
      "no GPU capacity currently available",
    );
    expect(normalizeProvisioningError("RunPod machine lookup failed: pod missing")).toBe(
      "compute machine lookup failed: pod missing",
    );
    expect(normalizeProvisioningError("Runpod balance is too low")).toBe(
      "managed compute provider funding is unavailable; contact support",
    );
  });

  it("classifies known runtime incompatibility patterns with expected cooldowns", () => {
    expect(classifyRuntimeIncompatibility("failed to initialize NVML")).toEqual({
      code: "cuda_driver_mismatch",
      cooldownSeconds: 86_400,
    });
    expect(classifyRuntimeIncompatibility("startup timeout waiting for heartbeat")).toEqual({
      code: "startup_timeout",
      cooldownSeconds: 3_600,
    });
    expect(classifyRuntimeIncompatibility("   ")).toBeNull();
    expect(classifyRuntimeIncompatibility("user training failed")).toBeNull();
  });
});
