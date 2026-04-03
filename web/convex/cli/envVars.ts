import { internal } from "@convex/_generated/api";
import { httpAction } from "@convex/_generated/server";
import { decryptSecretValue, encryptSecretValue } from "@convex/credentialsCrypto";
import { normalizeEnvVarNameOrThrow } from "@convex/envVars";
import {
  authenticateApiRequest,
  corsHeaders,
  readJsonBody,
  toClientErrorDetail,
} from "@convex/cli/shared";

function jsonHeaders() {
  return new Headers({ "Content-Type": "application/json", ...corsHeaders() });
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({ detail: "authentication required" }), {
    status: 401,
    headers: jsonHeaders(),
  });
}

function getEnvVarNameFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const envVarsIndex = parts.findIndex((part) => part === "env_vars");
  if (envVarsIndex < 0) {
    return "";
  }
  const rawName = envVarsIndex >= 0 ? parts[envVarsIndex + 1] : "";
  if (!rawName || parts[envVarsIndex + 2]) {
    return "";
  }
  return decodeURIComponent(rawName);
}

export const listEnvVars = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return unauthorizedResponse();
  }

  const envVars = await ctx.runQuery(internal.envVarsStore.internalListEnvVarNamesForUser, {
    userId,
  });
  return new Response(JSON.stringify({ env_vars: envVars }), {
    status: 200,
    headers: jsonHeaders(),
  });
});

export const setEnvVars = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return unauthorizedResponse();
  }

  const body = await readJsonBody(request);
  const rawEnvVars = Array.isArray(body?.env_vars) ? body.env_vars : null;
  if (!rawEnvVars || rawEnvVars.length === 0) {
    return new Response(JSON.stringify({ detail: "env_vars is required" }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }

  try {
    const deduped = new Map<string, string>();
    for (let index = 0; index < rawEnvVars.length; index += 1) {
      const row = rawEnvVars[index];
      const rawName = typeof row?.name === "string" ? row.name : "";
      const name = normalizeEnvVarNameOrThrow(rawName);
      if (typeof row?.value !== "string") {
        throw new Error(`env_vars[${index}].value must be a string`);
      }
      deduped.set(name, row.value);
    }

    const updatedNames: Array<{ name: string }> = [];
    for (const [name, value] of deduped.entries()) {
      const encrypted = await encryptSecretValue(value);
      const updated = await ctx.runMutation(internal.envVarsStore.internalUpsertEnvVarForUser, {
        userId,
        name,
        valueCiphertext: encrypted.ciphertext,
        valueIv: encrypted.iv,
        valueVersion: encrypted.version,
      });
      updatedNames.push(updated);
    }

    updatedNames.sort((left, right) => left.name.localeCompare(right.name));
    return new Response(JSON.stringify({ env_vars: updatedNames }), {
      status: 200,
      headers: jsonHeaders(),
    });
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to set env vars");
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }
});

export const getEnvVar = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return unauthorizedResponse();
  }

  const rawName = getEnvVarNameFromPath(new URL(request.url).pathname);
  if (!rawName) {
    return new Response(JSON.stringify({ detail: "path must be /api/env_vars/{name}" }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }

  try {
    const name = normalizeEnvVarNameOrThrow(rawName);
    const row = await ctx.runQuery(internal.envVarsStore.internalGetEnvVarForUser, {
      userId,
      name,
    });
    if (!row) {
      return new Response(JSON.stringify({ detail: "env var not found" }), {
        status: 404,
        headers: jsonHeaders(),
      });
    }

    return new Response(JSON.stringify({
      name,
      value: await decryptSecretValue({
        ciphertext: row.valueCiphertext,
        iv: row.valueIv,
        version: row.valueVersion,
      }),
    }), {
      status: 200,
      headers: jsonHeaders(),
    });
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to load env var");
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }
});

export const removeEnvVar = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return unauthorizedResponse();
  }

  const rawName = getEnvVarNameFromPath(new URL(request.url).pathname);
  if (!rawName) {
    return new Response(JSON.stringify({ detail: "path must be /api/env_vars/{name}" }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }

  try {
    const name = normalizeEnvVarNameOrThrow(rawName);
    const deleted = await ctx.runMutation(internal.envVarsStore.internalDeleteEnvVarForUser, {
      userId,
      name,
    });
    if (!deleted) {
      return new Response(JSON.stringify({ detail: "env var not found" }), {
        status: 404,
        headers: jsonHeaders(),
      });
    }

    return new Response(JSON.stringify({ deleted, name }), {
      status: 200,
      headers: jsonHeaders(),
    });
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to delete env var");
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: jsonHeaders(),
    });
  }
});
