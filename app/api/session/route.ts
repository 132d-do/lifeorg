import { env } from "cloudflare:workers";
import { createAuditSessionCookie, createLocalSessionCookie, identityRuntime, readAuditSessionId, resolveIdentity } from "../../../lib/server/identity";

export const dynamic = "force-dynamic";

function ready(identity: string, cookies: string[] = []) {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify({ status: "ready", identity }), { headers });
}

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  const identityOptions = identityRuntime(runtime);
  if (identityOptions.deployment === "production") {
    try {
      const identity = await resolveIdentity(request, identityOptions);
      if (request.headers.get("oai-authenticated-user-session-id")) return ready(identity.source);
      if (!identityOptions.sessionSecret) return Response.json({ error: "Audit session is not configured" }, { status: 503 });
      const currentAudit = await readAuditSessionId(request, identityOptions.sessionSecret);
      if (currentAudit) return ready(identity.source);
      const auditCookie = await createAuditSessionCookie(`browser:${crypto.randomUUID()}`, identityOptions.sessionSecret, { secure: true });
      return ready(identity.source, [auditCookie]);
    } catch { return Response.json({ error: "Authentication required" }, { status: 401 }); }
  }
  if (!identityOptions.sessionSecret) return Response.json({ error: "Local session is not configured" }, { status: 503 });
  try {
    const current = await resolveIdentity(request, identityOptions);
    const currentAudit = await readAuditSessionId(request, identityOptions.sessionSecret);
    if (currentAudit) return ready(current.source);
    const auditCookie = await createAuditSessionCookie(`browser:${crypto.randomUUID()}`, identityOptions.sessionSecret, { secure: identityOptions.deployment === "preview" });
    return ready(current.source, [auditCookie]);
  } catch {
    const localIdentity = { userId: `local:${crypto.randomUUID()}`, displayName: "本地经营者" };
    const cookie = await createLocalSessionCookie(localIdentity, identityOptions.sessionSecret, { secure: identityOptions.deployment === "preview" });
    const auditCookie = await createAuditSessionCookie(`browser:${crypto.randomUUID()}`, identityOptions.sessionSecret, { secure: identityOptions.deployment === "preview" });
    return ready("session", [cookie, auditCookie]);
  }
}
