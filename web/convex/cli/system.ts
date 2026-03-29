import { api } from "@convex/_generated/api";
import { httpAction } from "@convex/_generated/server";
import { AUTH_CONFIG, NETWORK_CONFIG, RUN_CONFIG, SYNC_CONFIG } from "@convex/appConfig";
import { authenticateApiRequest, corsHeaders, loadDynamicGpuRows, toClientErrorDetail } from "@convex/cli/shared";

export const optionsHandler = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: new Headers(corsHeaders()),
  });
});

export const health = httpAction(async () => {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
});

export const getConfig = httpAction(async () => {
  return new Response(
    JSON.stringify({
      auth: AUTH_CONFIG,
      run: RUN_CONFIG,
      sync: SYNC_CONFIG,
      network: NETWORK_CONFIG,
    }),
    {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    },
  );
});

export const getGpus = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runQuery(api.catalog.getCatalog);
    const resolved = await loadDynamicGpuRows(ctx, userId);

    return new Response(
      JSON.stringify({
        ...data,
        gpus: resolved,
        gpu_ids: resolved.map((gpu) => gpu.id),
      }),
      {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      },
    );
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to load gpus");
    const status = detail.toLowerCase().includes("no compute provider configured") ? 400 : 500;
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});
