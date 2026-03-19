import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/_generated/server";
import { corsHeaders, extractBearerToken, r2, readJsonBody } from "@convex/cli/shared";
import { sha256Hex } from "@convex/syncManifest";

const RUNTIME_STATUS_VALUES = ["provisioning", "running", "completed", "failed", "cancelled"] as const;
const RUNTIME_STATUS_SET = new Set<string>(RUNTIME_STATUS_VALUES);
type RuntimeStatus = (typeof RUNTIME_STATUS_VALUES)[number];

export type RuntimeRoute = {
  runId: string;
  action: string;
};

export function parseRuntimeRoute(pathname: string): RuntimeRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[0] !== "api" || parts[1] !== "runs" || parts[3] !== "runtime") {
    return null;
  }
  const runId = parts[2];
  const action = parts.slice(4).join("/");
  if (!runId || !action) {
    return null;
  }
  return { runId, action };
}

async function authenticateRuntimeRequest(
  ctx: ActionCtx,
  request: Request,
  runId: Id<"runs">,
): Promise<boolean> {
  const token = extractBearerToken(request);
  if (!token) {
    return false;
  }
  const tokenHash = await sha256Hex(token);
  return await ctx.runQuery(internal.runs.internalValidateRuntimeToken, {
    runId,
    tokenHash,
  });
}

export async function handleRuntimeGet(ctx: ActionCtx, request: Request, route: RuntimeRoute) {
  const runId = route.runId as Id<"runs">;
  const authenticated = await authenticateRuntimeRequest(ctx, request, runId);
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "bootstrap") {
    try {
      const plan = await ctx.runAction(internal.runs.internalGetRuntimeBootstrapPlan, { runId });
      return new Response(JSON.stringify(plan), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "failed to build bootstrap plan";
      return new Response(JSON.stringify({ detail }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
}

export async function handleRuntimePost(ctx: ActionCtx, request: Request, route: RuntimeRoute) {
  const runId = route.runId as Id<"runs">;
  const authenticated = await authenticateRuntimeRequest(ctx, request, runId);
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);

  if (route.action === "logs") {
    const candidateLines: unknown[] = Array.isArray(body?.lines) ? (body.lines as unknown[]) : [];
    const lines = candidateLines
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        message: typeof item.message === "string" ? item.message : "",
        level: typeof item.level === "string" ? item.level : undefined,
        source: typeof item.source === "string" ? item.source : undefined,
        timestamp: typeof item.timestamp === "number" ? item.timestamp : undefined,
      }));
    const result = await ctx.runMutation(internal.runs.ingestRuntimeLogs, {
      runId,
      lines,
    });
    return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "metrics") {
    const candidateMetrics: unknown[] = Array.isArray(body?.metrics) ? (body.metrics as unknown[]) : [];
    const metrics: Array<{
      name: string;
      value: number;
      step?: number;
      unit?: string;
      source?: string;
      timestamp?: number;
    }> = [];
    for (const raw of candidateMetrics) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const item = raw as Record<string, unknown>;
      const value = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
      if (value === null) {
        continue;
      }
      metrics.push({
        name: typeof item.name === "string" ? item.name : "",
        value,
        step: typeof item.step === "number" ? item.step : undefined,
        unit: typeof item.unit === "string" ? item.unit : undefined,
        source: typeof item.source === "string" ? item.source : undefined,
        timestamp: typeof item.timestamp === "number" ? item.timestamp : undefined,
      });
    }
    const result = await ctx.runMutation(internal.runs.ingestRuntimeMetrics, {
      runId,
      metrics,
    });
    return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "status") {
    const status = typeof body?.status === "string" ? body.status : "";
    const message = typeof body?.message === "string" ? body.message : undefined;
    const error = typeof body?.error === "string" ? body.error : undefined;
    if (!status) {
      return new Response(JSON.stringify({ detail: "status is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    if (!RUNTIME_STATUS_SET.has(status)) {
      return new Response(JSON.stringify({ detail: "invalid status" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    const result = await ctx.runMutation(internal.runs.ingestRuntimeStatus, {
      runId,
      status: status as RuntimeStatus,
      message,
      error,
    });
    return new Response(JSON.stringify({ ok: true, status: result.status }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "artifacts/upload-url") {
    const artifacts: Array<{ name: string; size_bytes: number }> = [];
    const candidateArtifacts: unknown[] = Array.isArray(body?.artifacts) ? (body.artifacts as unknown[]) : [];
    for (const raw of candidateArtifacts) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const sizeBytes = typeof item.size_bytes === "number" && Number.isFinite(item.size_bytes) ? item.size_bytes : 0;
      if (name && sizeBytes > 0) {
        artifacts.push({ name, size_bytes: sizeBytes });
      }
    }
    if (artifacts.length === 0) {
      return new Response(JSON.stringify({ detail: "artifacts array with name and size_bytes is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }

    const outputPath = await ctx.runQuery(internal.runs.internalGetRunOutputPath, { runId });
    if (!outputPath) {
      return new Response(JSON.stringify({ detail: "run not found or has no output path" }), {
        status: 404,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }

    const uploads: Array<{ name: string; key: string; url: string }> = [];
    for (const artifact of artifacts) {
      const safeName = artifact.name.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "_");
      const key = `${outputPath}/${safeName}`;
      try {
        const upload = await r2.generateUploadUrl(key);
        uploads.push({ name: artifact.name, key: upload.key, url: upload.url });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "failed to generate upload URL";
        return new Response(JSON.stringify({ detail: `artifact upload URL failed for ${artifact.name}: ${detail}` }), {
          status: 500,
          headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
        });
      }
    }

    return new Response(JSON.stringify({ uploads }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "artifacts/commit") {
    const candidateKeys: unknown[] = Array.isArray(body?.keys) ? (body.keys as unknown[]) : [];
    const keys: string[] = candidateKeys
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim());
    if (keys.length === 0) {
      return new Response(JSON.stringify({ detail: "keys array is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    const result = await ctx.runMutation(internal.runs.ingestRuntimeArtifacts, { runId, keys });
    return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
}

export async function handleCancelRun(ctx: ActionCtx, request: Request, authenticateApiRequest: (ctx: ActionCtx, request: Request) => Promise<string | null>) {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const runIdx = parts.findIndex((part) => part === "runs");
  const runId = runIdx >= 0 ? parts[runIdx + 1] : "";
  const tail = parts[parts.length - 1];
  if (!runId || tail !== "cancel") {
    return new Response(JSON.stringify({ detail: "path must be /api/runs/{run_id}/cancel" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const force = body?.force === true || body?.force === "true" || body?.force === 1;
  try {
    const data = await ctx.runMutation(internal.runs.internalCancel, {
      userId,
      runId: runId as Id<"runs">,
      force,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to cancel run";
    const lower = detail.toLowerCase();
    const status = lower.includes("already") ? 409 : 400;
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
}
