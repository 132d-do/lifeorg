import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { goals, meetingApprovals } from "../../../db/schema.ts";
import { getDb } from "../../../db/index.ts";
import { IdentityError, identityRuntime, resolveIdentity } from "../identity.ts";
import { D1CycleRepository } from "./d1-repository.ts";
import { CycleServiceError, createCycleService } from "./service.ts";

export async function cycleRequestContext(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  const identity = await resolveIdentity(request, identityRuntime(runtime));
  const service = createCycleService({
    repository: new D1CycleRepository(),
    ownsGoal: async (userId, goalId) => {
      const [owned] = await getDb().select({ id: goals.id }).from(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, userId))).limit(1);
      return Boolean(owned);
    },
    ownsApprovedMeeting: async (userId, meetingId, mutationHash) => {
      const [owned] = await getDb().select({ id: meetingApprovals.id }).from(meetingApprovals)
        .where(and(eq(meetingApprovals.meetingId, meetingId), eq(meetingApprovals.userId, userId), eq(meetingApprovals.mutationHash, mutationHash))).limit(1);
      return Boolean(owned);
    },
  });
  return { identity, service };
}

export function cycleApiError(error: unknown) {
  if (error instanceof IdentityError) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) {
    return Response.json({ error: "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path, code: issue.code })) }, { status: 400 });
  }
  if (error instanceof CycleServiceError) {
    const status = error.code === "not_found" ? 404
      : ["idempotency_conflict", "active_cycle_exists", "proposal_mismatch"].includes(error.code) ? 409
        : 422;
    return Response.json({ error: error.code }, { status });
  }
  return Response.json({ error: "cycle_service_failure" }, { status: 500 });
}

