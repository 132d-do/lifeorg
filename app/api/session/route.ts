import { env } from "cloudflare:workers";
import { createLocalSessionCookie, identityRuntime, resolveIdentity } from "../../../lib/server/identity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  const identityOptions = identityRuntime(runtime);
  if (identityOptions.deployment === "production") {
    try {
      const identity = await resolveIdentity(request, identityOptions);
      return Response.json({ status: "ready", identity: identity.source });
    } catch { return Response.json({ error: "Authentication required" }, { status: 401 }); }
  }
  if (!identityOptions.sessionSecret) return Response.json({ error: "Local session is not configured" }, { status: 503 });
  try {
    const current = await resolveIdentity(request, identityOptions);
    return Response.json({ status: "ready", identity: current.source });
  } catch {
    const localIdentity = { userId: `local:${crypto.randomUUID()}`, displayName: "本地经营者" };
    const cookie = await createLocalSessionCookie(localIdentity, identityOptions.sessionSecret, { secure: identityOptions.deployment === "preview" });
    return Response.json({ status: "ready", identity: "session" }, { headers: { "Set-Cookie": cookie } });
  }
}
