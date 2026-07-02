import { beforeEach, describe, expect, it, vi } from "vitest";

const computeProviderMocks = vi.hoisted(() => ({
  requireManagedComputeProvider: vi.fn(),
}));

const jobQueueMocks = vi.hoisted(() => ({
  enqueueServeLifecycleJobs: vi.fn(),
}));

vi.mock("@convex/computeProvider", () => computeProviderMocks);
vi.mock("@convex/convexJobQueue", () => jobQueueMocks);

import { createServeForUserId } from "@convex/servesLifecycle";

function createServeCtx() {
  const inserts: Array<{ table: string; document: Record<string, unknown> }> = [];
  return {
    inserts,
    db: {
      insert: vi.fn(async (table: string, document: Record<string, unknown>) => {
        inserts.push({ table, document });
        if (table === "serves") return "serve_1";
        if (table === "serveEvents") return "serve_event_1";
        return `${table}_1`;
      }),
      get: vi.fn(async (tableOrId: string, maybeId?: string) => {
        const id = maybeId ?? tableOrId;
        if (id !== "serve_1") return null;
        const serve = inserts.find((insert) => insert.table === "serves")?.document;
        return serve ? { _id: "serve_1", _creationTime: 1_000, ...serve } : null;
      }),
    },
  };
}

const serveConfig = {
  command: ["python", "-m", "serve"],
  outputDir: "outputs",
  codeManifestHash: "code_hash",
  dataManifestHash: null,
  dependencyGroup: "serve",
  pythonVersion: "3.11",
  gpuType: "",
  gpuCount: 0,
  volumeGb: 0,
  port: 8000,
  healthPath: "/health",
  defaultModelPath: "outputs/model",
  startupTimeoutSeconds: 600,
  healthIntervalSeconds: 10,
  healthTimeoutSeconds: 2,
  healthFailureThreshold: 3,
  gracefulShutdownSeconds: 30,
};

const modelSnapshot = {
  sourceType: "storage" as const,
  objectPrefix: "models/foo",
  manifestKey: "models/foo/manifest.json",
  manifestHash: "manifest_hash",
  objectCount: 1,
  totalBytes: 123,
};

describe("serve lifecycle helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates serves with a backing compute session link", async () => {
    const ctx = createServeCtx();
    const linkComputeSessionToServe = vi.fn();

    const response = await createServeForUserId(
      ctx as never,
      {
        userId: "user_1",
        environmentId: "env_1" as never,
        serveConfig,
        modelSnapshot,
        enqueueProvisioning: false,
      },
      {
        async createComputeSession() {
          return {
            computeSessionId: "session_1" as never,
            eventMetadata: { compute_session_id: "session_1" },
          };
        },
        linkComputeSessionToServe,
      },
    );

    expect(response).toMatchObject({
      serve_id: "serve_1",
      compute_session_id: "session_1",
      inference_path: "/api/serves/serve_1/inference",
    });
    expect(ctx.inserts.find((insert) => insert.table === "serves")?.document).toMatchObject({
      computeSessionId: "session_1",
      status: "queued",
    });
    expect(linkComputeSessionToServe).toHaveBeenCalledWith(ctx, {
      computeSessionId: "session_1",
      serveId: "serve_1",
    });
  });
});
