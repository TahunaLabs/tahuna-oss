import { describe, expect, it, vi } from "vitest";

vi.mock("@convex/auth", () => ({
  authComponent: {},
  requireUser: vi.fn(),
}));

import {
  handleComputeSessionRuntimeGet,
} from "@convex/computeSessionsHttp";
import {
  handleServeRuntimeGet,
} from "@convex/servesHttp";

function runtimeRequest() {
  return new Request("https://api.example.com/runtime", {
    headers: {
      Authorization: "Bearer runtime-token",
    },
  });
}

describe("runtime HTTP authentication", () => {
  it("returns 401 when compute-session runtime id validation throws", async () => {
    const ctx = {
      runQuery: vi.fn(async () => {
        throw new Error("invalid id");
      }),
    };

    const response = await handleComputeSessionRuntimeGet(ctx as never, runtimeRequest(), {
      computeSessionId: "not-an-id",
      action: "assignment",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      detail: "runtime authentication required",
    });
  });

  it("returns 401 when serve runtime id validation throws", async () => {
    const ctx = {
      runQuery: vi.fn(async () => {
        throw new Error("invalid id");
      }),
    };

    const response = await handleServeRuntimeGet(ctx as never, runtimeRequest(), {
      serveId: "not-an-id",
      action: "bootstrap",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      detail: "runtime authentication required",
    });
  });
});
