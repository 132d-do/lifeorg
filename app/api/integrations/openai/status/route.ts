import { env } from "cloudflare:workers";
import { identityRuntime, resolveIdentity } from "../../../../../lib/server/identity";
import { getOpenAIStatus } from "../../../../../lib/server/openai/status";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  try {
    await resolveIdentity(request, identityRuntime(runtime));
    return Response.json(getOpenAIStatus(runtime));
  } catch { return Response.json({ error: "Authentication required" }, { status: 401 }); }
}
