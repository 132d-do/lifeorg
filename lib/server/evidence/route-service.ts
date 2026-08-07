import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  decisionReviews, decisions, goals, meetings, operatingCycles, profiles,
} from "../../../db/schema.ts";
import { getDb } from "../../../db/index.ts";
import { IdentityError, identityRuntime, resolveIdentity } from "../identity.ts";
import type { EvidenceSource, EvidenceSourceSnapshot } from "./contracts.ts";
import { D1EvidenceRepository } from "./d1-repository.ts";
import { createDecisionEvidenceService, DecisionEvidenceServiceError } from "./service.ts";

function snapshot(type: EvidenceSource["type"], id: string, title: string, summary: string, updatedAt: string): EvidenceSourceSnapshot {
  return { type, id, title, summary, updatedAt };
}

async function resolveOwnedSource(userId: string, source: EvidenceSource): Promise<EvidenceSourceSnapshot | null> {
  const db = getDb();
  if (source.type === "profile") {
    if (source.id !== "self") return null;
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    return row ? snapshot("profile", "self", row.displayName, `${row.vision}\n${row.values}\n${row.constraints}`, row.updatedAt) : null;
  }
  if (source.type === "goal") {
    const [row] = await db.select().from(goals).where(and(eq(goals.id, Number(source.id)), eq(goals.userId, userId))).limit(1);
    return row ? snapshot("goal", String(row.id), row.title, `${row.why}；进展 ${row.progress}%`, row.updatedAt) : null;
  }
  if (source.type === "meeting") {
    const [row] = await db.select().from(meetings).where(and(eq(meetings.id, Number(source.id)), eq(meetings.userId, userId))).limit(1);
    return row ? snapshot("meeting", String(row.id), row.title, row.summary, row.updatedAt || row.createdAt) : null;
  }
  if (source.type === "decision") {
    const [row] = await db.select().from(decisions).where(and(eq(decisions.id, Number(source.id)), eq(decisions.userId, userId))).limit(1);
    return row ? snapshot("decision", String(row.id), row.title, `${row.choice}；${row.reason}`, row.updatedAt) : null;
  }
  if (source.type === "cycle") {
    const [row] = await db.select().from(operatingCycles).where(and(eq(operatingCycles.id, source.id), eq(operatingCycles.userId, userId))).limit(1);
    return row ? snapshot("cycle", row.id, row.commitment, `${row.successCriterion}；状态 ${row.status}`, row.updatedAt) : null;
  }
  const [row] = await db.select().from(decisionReviews).where(and(eq(decisionReviews.id, source.id), eq(decisionReviews.userId, userId))).limit(1);
  return row ? snapshot("review", row.id, "决策复盘", row.outcome, row.createdAt) : null;
}

async function recommendedOwnedRecords(userId: string, decisionId: number) {
  const db = getDb();
  const result: EvidenceSourceSnapshot[] = [];
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (profile) result.push(snapshot("profile", "self", profile.displayName, `${profile.vision}\n${profile.values}\n${profile.constraints}`, profile.updatedAt));
  const goalRows = await db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.status, "active"))).orderBy(desc(goals.updatedAt)).limit(3);
  result.push(...goalRows.map((row) => snapshot("goal", String(row.id), row.title, `${row.why}；进展 ${row.progress}%`, row.updatedAt)));
  const [decision] = await db.select().from(decisions).where(and(eq(decisions.id, decisionId), eq(decisions.userId, userId))).limit(1);
  if (decision) result.push(snapshot("decision", String(decision.id), decision.title, `${decision.choice}；${decision.reason}`, decision.updatedAt));
  return result;
}

export async function decisionEvidenceRequestContext(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  const identity = await resolveIdentity(request, identityRuntime(runtime));
  const service = createDecisionEvidenceService({
    repository: new D1EvidenceRepository(),
    ownsDecision: async (userId, decisionId) => {
      const [owned] = await getDb().select({ id: decisions.id }).from(decisions)
        .where(and(eq(decisions.id, decisionId), eq(decisions.userId, userId))).limit(1);
      return Boolean(owned);
    },
    resolveSource: resolveOwnedSource,
    recommendRecords: recommendedOwnedRecords,
  });
  return { identity, service };
}

export function decisionEvidenceApiError(error: unknown) {
  if (error instanceof IdentityError) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) {
    return Response.json({ error: "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path, code: issue.code })) }, { status: 400 });
  }
  if (error instanceof DecisionEvidenceServiceError) {
    return Response.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
  }
  return Response.json({ error: "decision_evidence_service_failure" }, { status: 500 });
}

