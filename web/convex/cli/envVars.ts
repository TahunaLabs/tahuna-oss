import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { httpAction, type ActionCtx } from "@convex/_generated/server";
import { normalizeEnvVarNameOrThrow } from "@convex/envVars";
import { authenticateApiRequest, corsHeaders, readJsonBody, toClientErrorDetail } from "@convex/cli/shared";

type EnvVarRequestContext = {
  userId: string;
  environmentId: Id<"environments">;
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
}

function getEnvVarNameFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const envVarsIndex = parts.findIndex((part) => part === "env_vars");
  const rawName = envVarsIndex >= 0 ? parts[envVarsIndex + 1] || "" : "";
  return rawName && !parts[envVarsIndex + 2] ? decodeURIComponent(rawName) : "";
}

async function resolveEnvVarRequestContext(
  ctx: ActionCtx,
  request: Request,
) {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return jsonResponse({ detail: "authentication required" }, 401);
  }

  const environmentId = new URL(request.url).searchParams.get("environment_id")?.trim() || "";
  if (!environmentId) {
    return jsonResponse({ detail: "environment_id is required" }, 400);
  }

  return {
    userId,
    environmentId: environmentId as Id<"environments">,
  } satisfies EnvVarRequestContext;
}

function errorResponse(err: unknown, fallback: string, fallbackStatus = 400) {
  const detail = toClientErrorDetail(err, fallback);
  const status = detail.toLowerCase().includes("not found") ? 404 : fallbackStatus;
  return jsonResponse({ detail }, status);
}

async function withEnvVarRequest(
  ctx: ActionCtx,
  request: Request,
  fallback: string,
  handler: (requestContext: EnvVarRequestContext) => Promise<Response>,
) {
  const requestContext = await resolveEnvVarRequestContext(ctx, request);
  if (requestContext instanceof Response) {
    return requestContext;
  }
  try {
    return await handler(requestContext);
  } catch (err) {
    return errorResponse(err, fallback);
  }
}

export const listEnvVars = httpAction(async (ctx, request) => {
  return withEnvVarRequest(ctx, request, "failed to load env vars", async ({ userId, environmentId }) => {
    const envVars = await ctx.runQuery(internal.envVars.internalListEnvironmentEnvVarNames, {
      userId,
      environmentId,
    });
    return jsonResponse({ env_vars: envVars }, 200);
  });
});

export const setEnvVars = httpAction(async (ctx, request) => {
  return withEnvVarRequest(ctx, request, "failed to set env vars", async ({ userId, environmentId }) => {
    const body = await readJsonBody(request);
    const rawEnvVars = Array.isArray(body?.env_vars) ? body.env_vars : null;
    if (!rawEnvVars || rawEnvVars.length === 0) {
      return jsonResponse({ detail: "env_vars is required" }, 400);
    }

    const envVars: Array<{ name: string; value: string }> = [];
    for (let index = 0; index < rawEnvVars.length; index += 1) {
      const row = rawEnvVars[index];
      if (typeof row?.value !== "string") {
        throw new Error(`env_vars[${index}].value must be a string`);
      }
      envVars.push({
        name: normalizeEnvVarNameOrThrow(typeof row?.name === "string" ? row.name : ""),
        value: row.value,
      });
    }

    const updatedNames = await ctx.runAction(internal.envVars.internalSetEnvironmentEnvVars, {
      userId,
      environmentId,
      envVars,
    });
    return jsonResponse({ env_vars: updatedNames }, 200);
  });
});

export const getEnvVar = httpAction(async (ctx, request) => {
  return withEnvVarRequest(ctx, request, "failed to load env var", async ({ userId, environmentId }) => {
    const name = getEnvVarNameFromPath(new URL(request.url).pathname);
    if (!name) {
      return jsonResponse({ detail: "path must be /api/env_vars/{name}" }, 400);
    }
    const data = await ctx.runQuery(internal.envVars.internalGetEnvironmentEnvVar, {
      userId,
      environmentId,
      name,
    });
    return jsonResponse(data, 200);
  });
});

export const removeEnvVar = httpAction(async (ctx, request) => {
  return withEnvVarRequest(ctx, request, "failed to delete env var", async ({ userId, environmentId }) => {
    const name = getEnvVarNameFromPath(new URL(request.url).pathname);
    if (!name) {
      return jsonResponse({ detail: "path must be /api/env_vars/{name}" }, 400);
    }
    const data = await ctx.runMutation(internal.envVars.internalDeleteEnvironmentEnvVar, {
      userId,
      environmentId,
      name,
    });
    return jsonResponse(data, 200);
  });
});
