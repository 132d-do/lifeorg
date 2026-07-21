import { env } from "cloudflare:workers";
import { and, asc, eq, lt } from "drizzle-orm";
import { getDb } from "../../../db/index.ts";
import { decisions, goals, meetingApprovals, meetingDecisionLeases, meetingMessages, meetingTurnClaims, meetingTurnLeases, meetings, profiles } from "../../../db/schema.ts";
import type { EvidenceRecord, MutationPreview } from "../agents/schemas.ts";
import type { EvidenceReference, MeetingCreateRequest } from "./contracts.ts";
import { completedDecisionResponse, completedTurnResponse } from "./completion-fence.ts";
import { MeetingServiceError, meetingTitleForKind, type DecisionFence, type MeetingRepository, type MeetingRoom } from "./service.ts";

function parse<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function governance(room: MeetingRoom) {
  return {
    createFingerprint: room.createFingerprint,
    intake: room.intake,
    evidenceReferences: room.evidenceReferences,
    records: room.records,
    turnResponses: room.turnResponses,
    turnFingerprints: room.turnFingerprints,
    decisions: room.decisions,
    decisionFingerprints: room.decisionFingerprints,
    decisionHistory: room.decisionHistory,
    lockedMutationIntent: room.lockedMutationIntent,
    mutationHash: room.mutationHash,
  };
}

async function hydrate(row: typeof meetings.$inferSelect): Promise<MeetingRoom> {
  const db = getDb();
  const input = parse<{ governance?: Partial<ReturnType<typeof governance>> }>(row.inputs, {});
  const data = input.governance ?? {};
  const isLegacy = !row.clientRequestId;
  const messages = await db.select().from(meetingMessages).where(and(eq(meetingMessages.userId, row.userId), eq(meetingMessages.meetingId, row.id))).orderBy(asc(meetingMessages.sequence), asc(meetingMessages.id));
  return {
    id: String(row.id), userId: row.userId, clientRequestId: row.clientRequestId ?? "legacy",
    createFingerprint: data.createFingerprint ?? "legacy", kind: row.type as MeetingCreateRequest["kind"], topic: row.topic || row.summary,
    intake: data.intake ?? { message: row.summary, ...(row.energy ? { energy: row.energy } : {}), ...(row.mood ? { mood: row.mood } : {}) },
    evidenceReferences: data.evidenceReferences ?? [], records: data.records ?? [],
    lifecycle: { status: row.lifecycleStatus as MeetingRoom["lifecycle"]["status"], phase: row.phase as MeetingRoom["lifecycle"]["phase"], approvalStatus: row.approvalStatus as MeetingRoom["lifecycle"]["approvalStatus"] },
    messages: messages.map((message) => ({ id: message.id, sequence: message.sequence, turnNumber: message.turnNumber, role: message.role as MeetingRoom["messages"][number]["role"], content: parse(message.structuredContent, {}), modelMetadata: parse(message.modelMetadata, { source: "lifeorg" }), ...(message.clientTurnId ? { clientTurnId: message.clientTurnId } : {}), createdAt: message.createdAt })),
    turnResponses: data.turnResponses ?? {}, turnFingerprints: data.turnFingerprints ?? {}, decisions: data.decisions ?? {}, decisionFingerprints: data.decisionFingerprints ?? {},
    decisionHistory: data.decisionHistory ?? [], ...(data.lockedMutationIntent ? { lockedMutationIntent: data.lockedMutationIntent } : {}),
    ...(isLegacy ? { legacyInputs: parse(row.inputs, {}), legacyAgentOutput: parse(row.agentOutput, {}) } : {}),
    ...(row.finalRecommendation !== "{}" ? { recommendation: parse(row.finalRecommendation, undefined) } : {}),
    ...(data.mutationHash ? { mutationHash: data.mutationHash } : {}), updatedAt: row.updatedAt || row.createdAt,
  };
}

export class D1MeetingRepository implements MeetingRepository {
  async findByClientRequest(userId: string, clientRequestId: string) {
    const [row] = await getDb().select().from(meetings).where(and(eq(meetings.userId, userId), eq(meetings.clientRequestId, clientRequestId))).limit(1);
    return row ? hydrate(row) : null;
  }

  async createMeeting(userId: string, request: MeetingCreateRequest, fingerprint: string, records: EvidenceRecord[]) {
    const input = { governance: { createFingerprint: fingerprint, intake: request.intake, evidenceReferences: request.evidence, records, turnResponses: {}, turnFingerprints: {}, decisions: {}, decisionFingerprints: {}, decisionHistory: [], lockedMutationIntent: request.lockedMutationIntent } };
    const [created] = await getDb().insert(meetings).values({
      userId, type: request.kind, title: meetingTitleForKind(request.kind), energy: request.intake.energy ?? null, mood: request.intake.mood ?? null,
      inputs: JSON.stringify(input), summary: request.topic, clientRequestId: request.clientRequestId, topic: request.topic,
      lifecycleStatus: "draft", phase: "intake", approvalStatus: "pending", updatedAt: new Date().toISOString(),
    }).returning();
    return hydrate(created);
  }

  async getMeeting(userId: string, meetingId: string) {
    const id = Number(meetingId);
    if (!Number.isInteger(id)) return null;
    const [row] = await getDb().select().from(meetings).where(and(eq(meetings.id, id), eq(meetings.userId, userId))).limit(1);
    return row ? hydrate(row) : null;
  }

  async resolveEvidence(userId: string, references: EvidenceReference[]) {
    const db = getDb();
    const result: EvidenceRecord[] = [];
    for (const reference of references) {
      if (reference.type === "profile") {
        const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
        if (row) result.push({ id: "profile:self", type: "profile", title: row.displayName, summary: `${row.vision}\n${row.values}\n${row.constraints}`, updatedAt: row.updatedAt });
      } else if (reference.type === "goal") {
        const [row] = await db.select().from(goals).where(and(eq(goals.id, Number(reference.id)), eq(goals.userId, userId))).limit(1);
        if (row) result.push({ id: `goal:${row.id}`, type: "goal", title: row.title, summary: `${row.why}；进展 ${row.progress}%；状态 ${row.status}`, updatedAt: row.updatedAt });
      } else if (reference.type === "decision") {
        const [row] = await db.select().from(decisions).where(and(eq(decisions.id, Number(reference.id)), eq(decisions.userId, userId))).limit(1);
        if (row) result.push({ id: `decision:${row.id}`, type: "decision", title: row.title, summary: `${row.choice}；${row.reason}`, updatedAt: row.updatedAt });
      } else {
        const [row] = await db.select().from(meetings).where(and(eq(meetings.id, Number(reference.id)), eq(meetings.userId, userId))).limit(1);
        if (row) result.push({ id: `meeting:${row.id}`, type: "meeting", title: row.title, summary: row.summary, updatedAt: row.updatedAt || row.createdAt });
      }
    }
    return result;
  }

  async claimTurn(userId: string, meetingId: string, clientTurnId: string, fingerprint: string) {
    const id = Number(meetingId); const db = getDb();
    const [owned] = await db.select({ id: meetings.id }).from(meetings).where(and(eq(meetings.id, id), eq(meetings.userId, userId))).limit(1);
    if (!owned) throw new MeetingServiceError("not_found", "Meeting not found");
    await db.insert(meetingTurnClaims).values({ id: crypto.randomUUID(), userId, meetingId: id, clientTurnId, requestFingerprint: fingerprint }).onConflictDoNothing();
    const [claim] = await db.select().from(meetingTurnClaims).where(and(eq(meetingTurnClaims.userId, userId), eq(meetingTurnClaims.meetingId, id), eq(meetingTurnClaims.clientTurnId, clientTurnId))).limit(1);
    if (!claim || claim.requestFingerprint !== fingerprint) throw new MeetingServiceError("idempotency_conflict", "clientTurnId was reused with different content");
    if (claim.status === "completed") return { status: "completed" as const, response: parse(claim.response, undefined) };
    const now = new Date();
    await db.delete(meetingTurnLeases).where(and(eq(meetingTurnLeases.meetingId, id), lt(meetingTurnLeases.expiresAt, now.toISOString())));
    const leaseToken = crypto.randomUUID();
    const acquired = await db.insert(meetingTurnLeases).values({ meetingId: id, userId, clientTurnId, leaseToken, expiresAt: new Date(now.getTime() + 300_000).toISOString() }).onConflictDoNothing().returning({ meetingId: meetingTurnLeases.meetingId });
    return acquired.length ? { status: "claimed" as const, leaseToken } : { status: "pending" as const };
  }

  async completeTurn(userId: string, room: MeetingRoom, clientTurnId: string, response: import("./service.ts").MeetingTurnResult, leaseToken: string) {
    const meetingId = Number(room.id);
    const db = getDb();
    const [lease] = await db.select({ leaseToken: meetingTurnLeases.leaseToken }).from(meetingTurnLeases).where(and(eq(meetingTurnLeases.meetingId, meetingId), eq(meetingTurnLeases.userId, userId), eq(meetingTurnLeases.clientTurnId, clientTurnId), eq(meetingTurnLeases.leaseToken, leaseToken))).limit(1);
    if (!lease) throw new MeetingServiceError("invalid_state", "Turn lease is no longer owned by this request");
    const leaseGuard = "EXISTS (SELECT 1 FROM meeting_turn_leases WHERE meeting_id=? AND user_id=? AND client_turn_id=? AND lease_token=?)";
    const statements: Array<ReturnType<typeof env.DB.prepare>> = [];
    for (const message of room.messages) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO meeting_messages (id,user_id,meeting_id,sequence,turn_number,role,client_turn_id,structured_content,model_metadata,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${leaseGuard}`).bind(message.id, userId, meetingId, message.sequence, message.turnNumber, message.role, message.clientTurnId ?? null, JSON.stringify(message.content), JSON.stringify(message.modelMetadata), message.createdAt, meetingId, userId, clientTurnId, leaseToken));
    statements.push(env.DB.prepare(`UPDATE meetings SET lifecycle_status=?,phase=?,approval_status=?,final_recommendation=?,inputs=?,updated_at=? WHERE id=? AND user_id=? AND ${leaseGuard}`).bind(room.lifecycle.status, room.lifecycle.phase, room.lifecycle.approvalStatus, JSON.stringify(room.recommendation ?? {}), JSON.stringify({ governance: governance(room) }), room.updatedAt, meetingId, userId, meetingId, userId, clientTurnId, leaseToken));
    statements.push(env.DB.prepare(`UPDATE meeting_turn_claims SET status='completed',response=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND meeting_id=? AND client_turn_id=? AND ${leaseGuard}`).bind(JSON.stringify(response), userId, meetingId, clientTurnId, meetingId, userId, clientTurnId, leaseToken));
    statements.push(env.DB.prepare("DELETE FROM meeting_turn_leases WHERE meeting_id=? AND user_id=? AND client_turn_id=? AND lease_token=?").bind(meetingId, userId, clientTurnId, leaseToken));
    await env.DB.batch(statements);
    const [persisted] = await db.select().from(meetingTurnClaims).where(and(eq(meetingTurnClaims.userId, userId), eq(meetingTurnClaims.meetingId, meetingId), eq(meetingTurnClaims.clientTurnId, clientTurnId))).limit(1);
    return completedTurnResponse(persisted, response);
  }

  async claimDecision(userId: string, meetingId: string, idempotencyKey: string, fingerprint: string) {
    const id = Number(meetingId); const db = getDb(); const now = new Date();
    const [owned] = await db.select({ id: meetings.id }).from(meetings).where(and(eq(meetings.id, id), eq(meetings.userId, userId))).limit(1);
    if (!owned) throw new MeetingServiceError("not_found", "Meeting not found");
    await db.delete(meetingDecisionLeases).where(and(eq(meetingDecisionLeases.meetingId, id), lt(meetingDecisionLeases.expiresAt, now.toISOString())));
    const leaseToken = crypto.randomUUID();
    const acquired = await db.insert(meetingDecisionLeases).values({ meetingId: id, userId, idempotencyKey, requestFingerprint: fingerprint, leaseToken, expiresAt: new Date(now.getTime() + 300_000).toISOString() }).onConflictDoNothing().returning({ meetingId: meetingDecisionLeases.meetingId });
    if (acquired.length) return { status: "claimed" as const, leaseToken };
    const [prior] = await db.select().from(meetingDecisionLeases).where(and(eq(meetingDecisionLeases.meetingId, id), eq(meetingDecisionLeases.userId, userId))).limit(1);
    if (prior?.idempotencyKey === idempotencyKey && prior.requestFingerprint !== fingerprint) throw new MeetingServiceError("idempotency_conflict", "idempotencyKey was reused with a different decision");
    return { status: "pending" as const };
  }

  async releaseDecision(userId: string, meetingId: string, idempotencyKey: string, leaseToken: string) {
    await getDb().delete(meetingDecisionLeases).where(and(eq(meetingDecisionLeases.meetingId, Number(meetingId)), eq(meetingDecisionLeases.userId, userId), eq(meetingDecisionLeases.idempotencyKey, idempotencyKey), eq(meetingDecisionLeases.leaseToken, leaseToken)));
  }

  async completeDecision(userId: string, room: MeetingRoom, idempotencyKey: string, response: import("./service.ts").MeetingDecisionResult, leaseToken: string, fence: DecisionFence) {
    const meetingId = Number(room.id);
    const leaseGuard = "EXISTS (SELECT 1 FROM meeting_decision_leases WHERE meeting_id=? AND user_id=? AND idempotency_key=? AND lease_token=?)";
    const meetingGuard = "EXISTS (SELECT 1 FROM meetings WHERE id=? AND user_id=? AND lifecycle_status='ready' AND updated_at=? AND final_recommendation=?)";
    const transitionGuard = `${leaseGuard} AND ${meetingGuard}`;
    const guardBindings = [meetingId, userId, idempotencyKey, leaseToken, meetingId, userId, fence.updatedAt, fence.finalRecommendation];
    const statements: Array<ReturnType<typeof env.DB.prepare>> = [];
    for (const event of room.decisionHistory) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO meeting_decision_events (id,user_id,meeting_id,action,session_id,recommendation_snapshot,created_at) SELECT ?,?,?,?,?,?,? WHERE ${transitionGuard}`).bind(event.id, userId, meetingId, event.action, event.sessionId, JSON.stringify(event.recommendationSnapshot), event.createdAt, ...guardBindings));
    statements.push(env.DB.prepare(`UPDATE meetings SET lifecycle_status=?,phase=?,approval_status=?,final_recommendation=?,inputs=?,updated_at=? WHERE id=? AND user_id=? AND ${transitionGuard}`).bind(room.lifecycle.status, room.lifecycle.phase, room.lifecycle.approvalStatus, JSON.stringify(room.recommendation ?? {}), JSON.stringify({ governance: governance(room) }), room.updatedAt, meetingId, userId, ...guardBindings));
    statements.push(env.DB.prepare("DELETE FROM meeting_decision_leases WHERE meeting_id=? AND user_id=? AND idempotency_key=? AND lease_token=?").bind(meetingId, userId, idempotencyKey, leaseToken));
    await env.DB.batch(statements);
    const persisted = await this.getMeeting(userId, room.id);
    return completedDecisionResponse(persisted, idempotencyKey);
  }

  async persistTurn(userId: string, room: MeetingRoom) {
    const db = getDb();
    const current = await this.getMeeting(userId, room.id);
    if (!current) throw new MeetingServiceError("not_found", "Meeting not found");
    const known = new Set(current.messages.map((message) => message.id));
    for (const message of room.messages.filter((item) => !known.has(item.id))) {
      await db.insert(meetingMessages).values({ id: message.id, userId, meetingId: Number(room.id), sequence: message.sequence, turnNumber: message.turnNumber, role: message.role, clientTurnId: message.clientTurnId, structuredContent: JSON.stringify(message.content), modelMetadata: JSON.stringify(message.modelMetadata), createdAt: message.createdAt }).onConflictDoNothing();
    }
    await db.update(meetings).set({
      lifecycleStatus: room.lifecycle.status, phase: room.lifecycle.phase, approvalStatus: room.lifecycle.approvalStatus,
      finalRecommendation: JSON.stringify(room.recommendation ?? {}), inputs: JSON.stringify({ governance: governance(room) }), updatedAt: room.updatedAt,
    }).where(and(eq(meetings.id, Number(room.id)), eq(meetings.userId, userId)));
  }

  async commitApproval(userId: string, room: MeetingRoom, input: { idempotencyKey: string; mutationHash: string; mutations: MutationPreview[]; sessionId: string; decisionLeaseToken: string; fence: DecisionFence }) {
    const db = getDb();
    const meetingId = Number(room.id);
    const [prior] = await db.select().from(meetingApprovals).where(and(eq(meetingApprovals.userId, userId), eq(meetingApprovals.meetingId, meetingId))).limit(1);
    if (prior) return;
    const [lease] = await db.select().from(meetingDecisionLeases).where(and(eq(meetingDecisionLeases.meetingId, meetingId), eq(meetingDecisionLeases.userId, userId), eq(meetingDecisionLeases.idempotencyKey, input.idempotencyKey), eq(meetingDecisionLeases.leaseToken, input.decisionLeaseToken))).limit(1);
    if (!lease) throw new MeetingServiceError("invalid_state", "Decision lease is no longer owned by this approval");
    const decisionGuard = "EXISTS (SELECT 1 FROM meeting_decision_leases WHERE meeting_id=? AND user_id=? AND idempotency_key=? AND lease_token=?)";
    const meetingGuard = "EXISTS (SELECT 1 FROM meetings WHERE id=? AND user_id=? AND lifecycle_status='ready' AND updated_at=? AND final_recommendation=?)";
    const approvalGuard = `${decisionGuard} AND ${meetingGuard}`;
    const guardBindings = [meetingId, userId, input.idempotencyKey, input.decisionLeaseToken, meetingId, userId, input.fence.updatedAt, input.fence.finalRecommendation];
    const statements: Array<ReturnType<typeof env.DB.prepare>> = [];
    for (const mutation of input.mutations) {
      if (mutation.type === "goal.update") {
        const [owned] = await db.select().from(goals).where(and(eq(goals.id, mutation.goalId), eq(goals.userId, userId))).limit(1);
        if (!owned) throw new MeetingServiceError("invalid_evidence", "Goal not found");
        const assignments: string[] = ["updated_at = ?"]; const values: unknown[] = [new Date().toISOString()];
        if (mutation.progress !== undefined) { assignments.push("progress = ?"); values.push(mutation.progress); }
        if (mutation.status !== undefined) { assignments.push("status = ?"); values.push(mutation.status); }
        statements.push(env.DB.prepare(`UPDATE goals SET ${assignments.join(", ")} WHERE id = ? AND user_id = ? AND ${approvalGuard}`).bind(...values, mutation.goalId, userId, ...guardBindings));
      } else if (mutation.type === "goal.create") {
        statements.push(env.DB.prepare(`INSERT INTO goals (user_id,title,domain,horizon,why,status,progress,target_date) SELECT ?,?,?,?,?,'active',0,? WHERE ${approvalGuard}`).bind(userId, mutation.title, mutation.domain, mutation.horizon, mutation.why, mutation.targetDate ?? null, ...guardBindings));
      } else if (mutation.type === "decision.create") {
        statements.push(env.DB.prepare(`INSERT INTO decisions (user_id,title,options,choice,reason,status,review_at) SELECT ?,?,?,?,?,'decided',? WHERE ${approvalGuard}`).bind(userId, mutation.title, JSON.stringify(mutation.options), mutation.choice, mutation.reason, mutation.reviewAt ?? null, ...guardBindings));
      } else {
        const [decision] = await db.select().from(decisions).where(and(eq(decisions.id, mutation.decisionId), eq(decisions.userId, userId))).limit(1);
        if (!decision) throw new MeetingServiceError("invalid_evidence", "Decision not found");
        statements.push(env.DB.prepare(`INSERT INTO decision_reviews (id,user_id,decision_id,meeting_id,outcome,observed_at,decision_snapshot,recommendation_snapshot,mutation_hash) SELECT ?,?,?,?,?,?,?,?,? WHERE ${approvalGuard}`).bind(crypto.randomUUID(), userId, decision.id, meetingId, mutation.outcome, mutation.observedAt, JSON.stringify(decision), JSON.stringify(room.recommendation), input.mutationHash, ...guardBindings));
      }
    }
    const event = room.decisionHistory.at(-1);
    if (event) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO meeting_decision_events (id,user_id,meeting_id,action,session_id,recommendation_snapshot,created_at) SELECT ?,?,?,?,?,?,? WHERE ${approvalGuard}`).bind(event.id, userId, meetingId, event.action, event.sessionId, JSON.stringify(event.recommendationSnapshot), event.createdAt, ...guardBindings));
    statements.push(env.DB.prepare(`INSERT INTO meeting_approvals (id,user_id,meeting_id,idempotency_key,mutation_hash,session_id,approved_mutations) SELECT ?,?,?,?,?,?,? WHERE ${approvalGuard}`).bind(crypto.randomUUID(), userId, meetingId, input.idempotencyKey, input.mutationHash, input.sessionId, JSON.stringify(input.mutations), ...guardBindings));
    statements.push(env.DB.prepare(`UPDATE meetings SET lifecycle_status='approved',phase='archived',approval_status='approved',inputs=?,updated_at=? WHERE id=? AND user_id=? AND ${approvalGuard}`).bind(JSON.stringify({ governance: governance(room) }), new Date().toISOString(), meetingId, userId, ...guardBindings));
    statements.push(env.DB.prepare("DELETE FROM meeting_decision_leases WHERE meeting_id=? AND user_id=? AND idempotency_key=? AND lease_token=?").bind(meetingId, userId, input.idempotencyKey, input.decisionLeaseToken));
    await env.DB.batch(statements);
    const [committed] = await db.select().from(meetingApprovals).where(and(eq(meetingApprovals.userId, userId), eq(meetingApprovals.meetingId, meetingId))).limit(1);
    if (!committed) throw new MeetingServiceError("decision_in_progress", "Approval completion lost its durable lease; reload before retrying");
  }
}
