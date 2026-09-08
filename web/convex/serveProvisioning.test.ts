import { describe, expect, it } from "vitest";

import {
  buildServeProvisioningSystemEnv,
  serveProviderMachineName,
} from "@convex/serveProvisioning";

describe("serve provisioning contract", () => {
  it("uses compute-session identity for provider machines while preserving serve callbacks", () => {
    expect(serveProviderMachineName({
      computeSessionId: "session_1",
    })).toBe("tahuna-session-session_1");

    expect(
      buildServeProvisioningSystemEnv({
        serveId: "serve_1",
        computeSessionId: "session_1",
        environmentId: "env_1",
        contractVersion: "serve.v1",
        outputDir: "outputs",
        runtimeApiBase: "https://api.example.com",
        runtimeToken: "runtime_token",
        runtimeRequestTimeoutSeconds: "120",
        gracefulShutdownSeconds: 30,
      }),
    ).toMatchObject({
      TAHUNA_SERVE_ID: "serve_1",
      TAHUNA_COMPUTE_SESSION_ID: "session_1",
      TAHUNA_ENVIRONMENT_ID: "env_1",
      TAHUNA_API_BASE: "https://api.example.com",
      TAHUNA_RUNTIME_TOKEN: "runtime_token",
      TAHUNA_CANCELLATION_GRACE_SECONDS: "30",
    });
  });
});
