import { internal } from "@convex/_generated/api";
import { httpAction } from "@convex/_generated/server";
import { authenticateApiRequest, corsHeaders } from "@convex/cli/shared";

export const listDataItems = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runQuery(internal.data.internalList, { userId });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to list data items";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const getDataItem = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const dataIdx = parts.findIndex((part) => part === "data");
  const dataId = dataIdx >= 0 ? parts[dataIdx + 1] : "";
  if (!dataId || dataId === "data" || parts[dataIdx + 2]) {
    return new Response(JSON.stringify({ detail: "path must be /api/data/{data_id}" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runQuery(internal.data.internalList, { userId });
    const row = data.blobs.find((blob: { blob_id: string }) => blob.blob_id === dataId);
    if (!row) {
      return new Response(JSON.stringify({ detail: "data item not found" }), {
        status: 404,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    return new Response(JSON.stringify(row), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load data item";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});
