import { getSessionEmail } from "@/lib/better-auth-session";
import { convexServerClient } from "@/lib/convex-server";

export type AuthContext = {
  userID: string;
  kind: "session" | "api_key";
};

export async function authenticateRequest(req: Request): Promise<AuthContext | null> {
  const bearer = req.headers.get("authorization")?.trim() || "";
  if (bearer.toLowerCase().startsWith("bearer ")) {
    const apiKey = bearer.slice("bearer ".length).trim();
    if (!apiKey) {
      return null;
    }

    const convex = convexServerClient();
    const auth = await convex.mutation("auth:authByApiKey" as any, { apiKey });
    if (!auth) {
      return null;
    }

    return {
      userID: String(auth.userId),
      kind: "api_key",
    };
  }

  const email = await getSessionEmail(req);
  if (!email) {
    return null;
  }

  const convex = convexServerClient();
  const me = await convex.mutation("auth:upsertUserByEmail" as any, { email });
  return {
    userID: String((me as { user_id: string }).user_id),
    kind: "session",
  };
}
