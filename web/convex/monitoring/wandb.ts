import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { httpAction, internalMutation, type ActionCtx } from "@convex/_generated/server";
import { corsHeaders, readJsonBody } from "@convex/cli/shared";
import { sha256Hex } from "@convex/syncManifest";
import { v } from "convex/values";

const HISTORY_FILE = "wandb-history.jsonl";
const SUMMARY_FILE = "wandb-summary.json";
const METADATA_FILE = "wandb-metadata.json";
const CONFIG_YAML_FILE = "config.yaml";
const REQUIREMENTS_FILE = "requirements.txt";
const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_TEXT_FILE_BYTES = 256 * 1024;
const MAX_METRIC_POINTS_PER_REQUEST = 5000;

const wandbMetricPointValidator = v.object({
  timestamp: v.number(),
  step: v.optional(v.number()),
  key: v.string(),
  value: v.number(),
  source: v.optional(v.string()),
});

type AuthenticatedRuntimeRun = {
  runId: Id<"runs">;
};

type UploadTokenPayload = {
  runId: string;
  wandbRunId: string;
  fileName: string;
  expiresAt: number;
};

type ParsedUploadRoute = {
  wandbRunId: string;
  fileName: string;
};

type ParsedFileStreamRoute = {
  entity?: string;
  project?: string;
  wandbRunId: string;
};

type ParsedMetrics = {
  timestamp: number;
  step?: number;
  key: string;
  value: number;
  source?: string;
};

function jsonResponse(payload: unknown, status: number = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: new Headers({
      "Content-Type": "application/json",
      ...corsHeaders(),
    }),
  });
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return "";
  }
}

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBasicApiToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() || "";
  if (!header.toLowerCase().startsWith("basic ")) {
    return "";
  }
  const decoded = decodeBase64Url(header.slice("basic ".length).trim());
  if (!decoded) {
    return "";
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return "";
  }
  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  if (username !== "api") {
    return "";
  }
  return password.trim();
}

function trimOrUndefined(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseJsonOrUndefined(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (value && typeof value === "object") {
    return value;
  }
  return undefined;
}

function normalizeWandbRunId(value: string) {
  const trimmed = value.trim();
  return trimmed || "default";
}

function normalizeTimestamp(raw: unknown) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return Date.now();
  }
  const candidate = raw > 1e11 ? raw : raw * 1000;
  return Math.max(0, Math.floor(candidate));
}

function parseOperationName(query: string, operationName: unknown) {
  if (typeof operationName === "string" && operationName.trim()) {
    return operationName.trim();
  }
  const match = query.match(/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/);
  return match ? match[1] : "";
}

function parseFileStreamRoute(pathname: string): ParsedFileStreamRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (
    parts.length !== 8 ||
    parts[0] !== "api" ||
    parts[1] !== "monitoring" ||
    parts[2] !== "wandb" ||
    parts[3] !== "files" ||
    parts[7] !== "file_stream"
  ) {
    return null;
  }
  const entity = trimOrUndefined(decodeURIComponent(parts[4] || ""));
  const project = trimOrUndefined(decodeURIComponent(parts[5] || ""));
  const wandbRunId = decodeURIComponent(parts[6] || "").trim();
  if (!wandbRunId) {
    return null;
  }
  return {
    entity,
    project,
    wandbRunId,
  };
}

function parseUploadRoute(pathname: string): ParsedUploadRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (
    parts.length < 6 ||
    parts[0] !== "api" ||
    parts[1] !== "monitoring" ||
    parts[2] !== "wandb" ||
    parts[3] !== "upload"
  ) {
    return null;
  }
  const wandbRunId = decodeURIComponent(parts[4] || "").trim();
  const fileName = decodeURIComponent(parts.slice(5).join("/") || "").trim();
  if (!wandbRunId || !fileName) {
    return null;
  }
  return { wandbRunId, fileName };
}

function truncateUploadedText(value: string) {
  if (value.length <= MAX_TEXT_FILE_BYTES) {
    return value;
  }
  return value.slice(0, MAX_TEXT_FILE_BYTES);
}

function fileContentLines(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const row = payload as { content?: unknown };
  if (typeof row.content === "string") {
    return [row.content];
  }
  if (!Array.isArray(row.content)) {
    return [];
  }
  return row.content.filter((entry): entry is string => typeof entry === "string");
}

function parseJsonObjectLine(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseHistoryMetrics(lines: string[]) {
  const out: ParsedMetrics[] = [];
  for (const line of lines) {
    const row = parseJsonObjectLine(line);
    if (!row) {
      continue;
    }
    const timestamp = normalizeTimestamp(row._timestamp);
    const step =
      typeof row._step === "number" && Number.isFinite(row._step)
        ? Math.floor(row._step)
        : undefined;
    for (const [key, value] of Object.entries(row)) {
      if (!key || key.startsWith("_")) {
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        continue;
      }
      out.push({
        timestamp,
        step,
        key,
        value,
        source: "wandb",
      });
    }
  }
  return out;
}

function parseCreateRunFiles(filePayload: unknown): string[] {
  if (!Array.isArray(filePayload)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of filePayload) {
    if (typeof entry === "string") {
      const normalized = entry.trim();
      if (normalized) {
        out.push(normalized);
      }
      continue;
    }
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const fileName = trimOrUndefined((entry as { name?: unknown }).name);
    if (fileName) {
      out.push(fileName);
    }
  }
  return out;
}

function decodeUploadToken(token: string): UploadTokenPayload | null {
  if (!token.trim()) {
    return null;
  }
  const decoded = decodeBase64Url(token.trim());
  if (!decoded) {
    return null;
  }
  try {
    const parsed = JSON.parse(decoded) as UploadTokenPayload;
    if (
      !parsed ||
      typeof parsed.runId !== "string" ||
      typeof parsed.wandbRunId !== "string" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function encodeUploadToken(payload: UploadTokenPayload) {
  return encodeBase64Url(JSON.stringify(payload));
}

function resolveVariable(
  variables: Record<string, unknown>,
  key: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(variables, key)) {
    return variables[key];
  }
  const input = variables.input;
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const inputObject = input as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(inputObject, key)) {
    return inputObject[key];
  }
  return undefined;
}

function extractStringVariable(
  variables: Record<string, unknown>,
  key: string,
): string {
  const value = resolveVariable(variables, key);
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.name === "string") {
      return row.name;
    }
    if (typeof row.id === "string") {
      return row.id;
    }
  }
  return "";
}

function extractVariables(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") {
    return {};
  }
  const value = (body as { variables?: unknown }).variables;
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

async function authenticateRuntimeRun(
  ctx: ActionCtx,
  request: Request,
): Promise<AuthenticatedRuntimeRun | null> {
  const runtimeToken = decodeBasicApiToken(request);
  if (!runtimeToken) {
    return null;
  }
  const tokenHash = await sha256Hex(runtimeToken);
  const row = await ctx.runQuery(internal.runs.internalGetByRuntimeTokenHash, {
    tokenHash,
  });
  if (!row) {
    return null;
  }
  return {
    runId: row.runId,
  };
}

export const upsertRun = internalMutation({
  args: {
    runId: v.id("runs"),
    wandbRunId: v.string(),
    entity: v.optional(v.string()),
    project: v.optional(v.string()),
    displayName: v.optional(v.string()),
    state: v.optional(v.string()),
    config: v.optional(v.any()),
    configYaml: v.optional(v.string()),
    metadata: v.optional(v.any()),
    requirementsTxt: v.optional(v.string()),
    summary: v.optional(v.any()),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("runs", args.runId);
    if (!run) {
      return { created: false };
    }
    const now = Date.now();
    const wandbRunId = normalizeWandbRunId(args.wandbRunId);
    const existing = await ctx.db
      .query("wandbRuns")
      .withIndex("by_run_and_wandb_run", (q) => q.eq("runId", args.runId).eq("wandbRunId", wandbRunId))
      .first();

    if (!existing) {
      await ctx.db.insert("wandbRuns", {
        runId: args.runId,
        wandbRunId,
        entity: trimOrUndefined(args.entity),
        project: trimOrUndefined(args.project),
        displayName: trimOrUndefined(args.displayName),
        state: trimOrUndefined(args.state),
        config: args.config,
        configYaml: args.configYaml,
        metadata: args.metadata,
        requirementsTxt: args.requirementsTxt,
        summary: args.summary,
        createdAt: now,
        updatedAt: now,
      });
      return { created: true };
    }

    const patch: {
      entity?: string;
      project?: string;
      displayName?: string;
      state?: string;
      config?: unknown;
      configYaml?: string;
      metadata?: unknown;
      requirementsTxt?: string;
      summary?: unknown;
      updatedAt: number;
    } = {
      updatedAt: now,
    };
    if (typeof args.entity === "string") patch.entity = trimOrUndefined(args.entity);
    if (typeof args.project === "string") patch.project = trimOrUndefined(args.project);
    if (typeof args.displayName === "string") patch.displayName = trimOrUndefined(args.displayName);
    if (typeof args.state === "string") patch.state = trimOrUndefined(args.state);
    if (typeof args.config !== "undefined") patch.config = args.config;
    if (typeof args.configYaml === "string") patch.configYaml = args.configYaml;
    if (typeof args.metadata !== "undefined") patch.metadata = args.metadata;
    if (typeof args.requirementsTxt === "string") patch.requirementsTxt = args.requirementsTxt;
    if (typeof args.summary !== "undefined") patch.summary = args.summary;
    await ctx.db.patch("wandbRuns", existing._id, patch);
    return { created: false };
  },
});

export const ingestMetrics = internalMutation({
  args: {
    runId: v.id("runs"),
    wandbRunId: v.string(),
    points: v.array(wandbMetricPointValidator),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("runs", args.runId);
    if (!run) {
      return { accepted: 0 };
    }
    const wandbRunId = normalizeWandbRunId(args.wandbRunId);
    const now = Date.now();
    let accepted = 0;
    for (const point of args.points.slice(0, MAX_METRIC_POINTS_PER_REQUEST)) {
      const key = point.key.trim().slice(0, 120);
      if (!key || !Number.isFinite(point.value)) {
        continue;
      }
      const timestamp = normalizeTimestamp(point.timestamp);
      const step =
        typeof point.step === "number" && Number.isFinite(point.step)
          ? Math.floor(point.step)
          : undefined;
      const source = trimOrUndefined(point.source);
      await ctx.db.insert("wandbMetrics", {
        runId: args.runId,
        wandbRunId,
        timestamp,
        step,
        key,
        value: point.value,
        source,
        createdAt: now,
      });
      await ctx.db.insert("runRuntimeMetrics", {
        runId: args.runId,
        timestamp,
        name: key,
        value: point.value,
        step,
        source: "wandb",
      });
      accepted += 1;
    }
    return { accepted };
  },
});

export const graphql = httpAction(async (ctx, request) => {
  const authenticated = await authenticateRuntimeRun(ctx, request);
  if (!authenticated) {
    return jsonResponse({ detail: "runtime authentication required" }, 401);
  }

  const body = await readJsonBody(request);
  const query = typeof body?.query === "string" ? body.query : "";
  if (!query.trim()) {
    return jsonResponse({ errors: [{ message: "query is required" }] });
  }

  const operationName = parseOperationName(query, body?.operationName);
  const variables = extractVariables(body);

  if (operationName === "ServerFeaturesQuery") {
    return jsonResponse({
      data: {
        serverInfo: {
          features: [],
        },
      },
    });
  }

  if (operationName === "UpsertBucket") {
    const wandbRunId = normalizeWandbRunId(
      extractStringVariable(variables, "name") ||
        extractStringVariable(variables, "run") ||
        extractStringVariable(variables, "id"),
    );
    const entity = trimOrUndefined(extractStringVariable(variables, "entity"));
    const project = trimOrUndefined(extractStringVariable(variables, "project"));
    const displayName = trimOrUndefined(extractStringVariable(variables, "displayName"));
    const state = trimOrUndefined(extractStringVariable(variables, "state"));
    const config = parseJsonOrUndefined(resolveVariable(variables, "config"));
    const summary = parseJsonOrUndefined(resolveVariable(variables, "summaryMetrics"));

    const upsert = await ctx.runMutation(internal.monitoring.wandb.upsertRun, {
      runId: authenticated.runId,
      wandbRunId,
      entity,
      project,
      displayName,
      state,
      config,
      summary,
    });

    return jsonResponse({
      data: {
        upsertBucket: {
          bucket: {
            id: `wandb-${String(authenticated.runId)}-${wandbRunId}`,
            name: wandbRunId,
            displayName: displayName || wandbRunId,
            description: "",
            config: config ? JSON.stringify(config) : "{}",
            sweepName: null,
            project: {
              id: `project-${project || "default"}`,
              name: project || "default",
              entity: {
                id: `entity-${entity || "default"}`,
                name: entity || "default",
              },
            },
            historyLineCount: 0,
          },
          inserted: upsert.created,
        },
      },
    });
  }

  if (operationName === "OrganizationCoreWeaveOrganizationID") {
    return jsonResponse({
      data: {
        entity: null,
      },
    });
  }

  if (operationName === "CreateRunFiles") {
    const wandbRunId = normalizeWandbRunId(
      extractStringVariable(variables, "run") ||
        extractStringVariable(variables, "name") ||
        extractStringVariable(variables, "id"),
    );
    const project = trimOrUndefined(extractStringVariable(variables, "project"));
    const entity = trimOrUndefined(extractStringVariable(variables, "entity"));
    const fileNames = parseCreateRunFiles(resolveVariable(variables, "files"));

    await ctx.runMutation(internal.monitoring.wandb.upsertRun, {
      runId: authenticated.runId,
      wandbRunId,
      project,
      entity,
    });

    const origin = new URL(request.url).origin;
    const expiresAt = Date.now() + UPLOAD_TOKEN_TTL_MS;
    const files = fileNames.map((fileName) => {
      const token = encodeUploadToken({
        runId: String(authenticated.runId),
        wandbRunId,
        fileName,
        expiresAt,
      });
      const uploadUrl = `${origin}/api/monitoring/wandb/upload/${encodeURIComponent(wandbRunId)}/${encodeURIComponent(fileName)}?token=${encodeURIComponent(token)}`;
      return {
        name: fileName,
        uploadUrl,
      };
    });

    return jsonResponse({
      data: {
        createRunFiles: {
          runID: String(authenticated.runId),
          uploadHeaders: [],
          files,
        },
      },
    });
  }

  return jsonResponse({
    errors: [{ message: `unsupported operation: ${operationName || "unknown"}` }],
  });
});

export const fileStream = httpAction(async (ctx, request) => {
  const route = parseFileStreamRoute(new URL(request.url).pathname);
  if (!route) {
    return jsonResponse({ detail: "path must be /api/monitoring/wandb/files/{entity}/{project}/{run}/file_stream" }, 400);
  }

  const authenticated = await authenticateRuntimeRun(ctx, request);
  if (!authenticated) {
    return jsonResponse({ detail: "runtime authentication required" }, 401);
  }

  const body = await readJsonBody(request);
  const files =
    body && typeof body === "object" && body.files && typeof body.files === "object"
      ? (body.files as Record<string, unknown>)
      : {};

  const summaryLines = fileContentLines(files[SUMMARY_FILE]);
  const historyLines = fileContentLines(files[HISTORY_FILE]);
  const summaryPayload =
    summaryLines.length > 0
      ? parseJsonObjectLine(summaryLines[summaryLines.length - 1] || "")
      : null;
  const points = parseHistoryMetrics(historyLines);

  await ctx.runMutation(internal.monitoring.wandb.upsertRun, {
    runId: authenticated.runId,
    wandbRunId: route.wandbRunId,
    entity: route.entity,
    project: route.project,
    summary: summaryPayload ?? undefined,
  });

  if (points.length > 0) {
    await ctx.runMutation(internal.monitoring.wandb.ingestMetrics, {
      runId: authenticated.runId,
      wandbRunId: route.wandbRunId,
      points,
    });
  }

  return jsonResponse({
    limits: {
      heartbeat_seconds: 30,
    },
    accepted: points.length,
  });
});

export const upload = httpAction(async (ctx, request) => {
  const route = parseUploadRoute(new URL(request.url).pathname);
  if (!route) {
    return jsonResponse({ detail: "path must be /api/monitoring/wandb/upload/{wandb_run_id}/{name}" }, 400);
  }

  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  const payload = decodeUploadToken(token);
  if (
    !payload ||
    payload.wandbRunId !== route.wandbRunId ||
    payload.fileName !== route.fileName ||
    payload.expiresAt < Date.now()
  ) {
    return jsonResponse({ detail: "invalid or expired upload token" }, 403);
  }

  const runId = payload.runId as Id<"runs">;
  const text = truncateUploadedText(await request.text());

  if (route.fileName === METADATA_FILE) {
    const metadata = parseJsonObjectLine(text);
    if (metadata) {
      await ctx.runMutation(internal.monitoring.wandb.upsertRun, {
        runId,
        wandbRunId: payload.wandbRunId,
        metadata,
      });
    }
    return jsonResponse({ ok: true });
  }

  if (route.fileName === CONFIG_YAML_FILE) {
    await ctx.runMutation(internal.monitoring.wandb.upsertRun, {
      runId,
      wandbRunId: payload.wandbRunId,
      configYaml: text,
    });
    return jsonResponse({ ok: true });
  }

  if (route.fileName === REQUIREMENTS_FILE) {
    await ctx.runMutation(internal.monitoring.wandb.upsertRun, {
      runId,
      wandbRunId: payload.wandbRunId,
      requirementsTxt: text,
    });
    return jsonResponse({ ok: true });
  }

  if (route.fileName === SUMMARY_FILE) {
    const summary = parseJsonObjectLine(text);
    if (summary) {
      await ctx.runMutation(internal.monitoring.wandb.upsertRun, {
        runId,
        wandbRunId: payload.wandbRunId,
        summary,
      });
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true, skipped: true });
});
