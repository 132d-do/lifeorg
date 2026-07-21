import { env } from "cloudflare:workers";
import { identityRuntime, resolveIdentity } from "../../../../../lib/server/identity";
import { probeOpenAI } from "../../../../../lib/server/openai/status";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  try {
    await resolveIdentity(request, identityRuntime(runtime));
    const result = await probeOpenAI(runtime);
    return Response.json(result, { status: result.ok ? 200 : result.code === "not_configured" ? 503 : 502 });
  } catch { return Response.json({ error: "Authentication required" }, { status: 401 }); }
}
