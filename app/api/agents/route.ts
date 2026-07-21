import { env } from "cloudflare:workers";
import { legacyAgentResult, legacyOfflineResult } from "../../../lib/server/agents/legacy-adapter";
import { createOpenAIAgentExecutor, offlineReasonFromError } from "../../../lib/server/agents/openai-executor";
import { orchestrateMeetingTurnDetailed } from "../../../lib/server/agents/orchestrate";
import { EvidenceRecordSchema } from "../../../lib/server/agents/schemas";
import { identityRuntime, resolveIdentity } from "../../../lib/server/identity";
import { readOpenAIConfiguration } from "../../../lib/server/openai/key";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  try { await resolveIdentity(request, identityRuntime(runtime)); }
  catch { return Response.json({ error: "Authentication required" }, { status: 401 }); }

  let body: { mode?: string; context?: Record<string, unknown> };
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const records = Array.isArray(body.context?.records) ? body.context.records.flatMap((record) => {
    const parsed = EvidenceRecordSchema.safeParse(record);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  const configuration = readOpenAIConfiguration(runtime);
  if (!configuration.apiKey) return Response.json({ deprecated: true, result: legacyOfflineResult("missing_credentials") });
  try {
    const result = await orchestrateMeetingTurnDetailed({
      records,
      topic: typeof body.context?.topic === "string" ? body.context.topic : body.mode ?? "meeting",
      latestUserMessage: typeof body.context?.message === "string" ? body.context.message : "",
    }, createOpenAIAgentExecutor(configuration.apiKey));
    return Response.json({ deprecated: true, result: legacyAgentResult(result, configuration.chiefModel) });
  } catch (error) {
    return Response.json({ deprecated: true, result: legacyOfflineResult(offlineReasonFromError(error)) }, { status: 502 });
  }
}
