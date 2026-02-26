type BetterAuthSessionResponse = {
  user?: {
    email?: string;
  };
};

export async function getSessionEmail(req: Request): Promise<string | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  if (!cookieHeader) {
    return null;
  }

  const origin = new URL(req.url).origin;
  const resp = await fetch(`${origin}/api/auth/get-session`, {
    method: "GET",
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  if (!resp.ok) {
    return null;
  }

  const data = (await resp.json().catch(() => null)) as BetterAuthSessionResponse | null;
  const email = data?.user?.email?.trim().toLowerCase() || "";
  return email || null;
}
