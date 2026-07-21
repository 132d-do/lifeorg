import { env } from "cloudflare:workers";
import { z } from "zod";
import { createOpenAIAgentExecutor, offlineReasonFromError } from "../agents/openai-executor.ts";
import { orchestrateMeetingTurnDetailed } from "../agents/orchestrate.ts";
import { IdentityError, identityRuntime, readAuditSessionId, resolveIdentity } from "../identity.ts";
import { readOpenAIConfiguration } from "../openai/key.ts";
import { D1MeetingRepository } from "./d1-repository.ts";
import { MeetingServiceError, createMeetingService } from "./service.ts";

export async function meetingRequestContext(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  const runtimeIdentity = identityRuntime(runtime);
  const resolved = await resolveIdentity(request, runtimeIdentity);
  const sessionAnchor = request.headers.get("oai-authenticated-user-session-id") ?? await readAuditSessionId(request, runtimeIdentity.sessionSecret);
  if (!sessionAnchor) throw new IdentityError();
  const sessionBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionAnchor));
  const sessionId = `session:${[...new Uint8Array(sessionBytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32)}`;
  const identity = { ...resolved, sessionId };
  const configuration = readOpenAIConfiguration(runtime);
  const service = createMeetingService({
    repository: new D1MeetingRepository(),
    deliberate: async (packet) => {
      if (!configuration.apiKey) throw Object.assign(new Error("OpenAI is not configured"), { code: "missing_credentials" });
      try { return await orchestrateMeetingTurnDetailed(packet, createOpenAIAgentExecutor(configuration.apiKey)); }
      catch (error) { throw Object.assign(new Error("Agent provider unavailable"), { code: offlineReasonFromError(error) }); }
    },
  });
  return { identity, service };
}

export function meetingApiError(error: unknown) {
  if (error instanceof IdentityError) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path, code: issue.code })) }, { status: 400 });
  if (error instanceof MeetingServiceError) {
    const status = error.code === "not_found" ? 404 : error.code === "idempotency_conflict" || error.code === "turn_in_progress" || error.code === "decision_in_progress" ? 409 : error.code === "session_required" ? 428 : 422;
    return Response.json({ error: error.code }, { status });
  }
  return Response.json({ error: "meeting_service_failure" }, { status: 500 });
}
