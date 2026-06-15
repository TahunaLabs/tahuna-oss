import { internal } from "@convex/_generated/api";
import { httpAction } from "@convex/_generated/server";
import {
  authenticateApiRequest,
  corsHeaders,
  readJsonBody,
  toClientErrorDetail,
} from "@convex/cli/shared";

export const syncResearchSession = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  try {
    const data = await ctx.runMutation(internal.runs.internalSyncResearchSession, {
      userId,
      session: body,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    return new Response(JSON.stringify({ detail: toClientErrorDetail(err, "failed to sync research session") }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});
