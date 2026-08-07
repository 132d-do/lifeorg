import { env } from "cloudflare:workers";
import { and, asc, desc, eq } from "drizzle-orm";
import { cycleEvents, operatingCycles } from "../../../db/schema.ts";
import { getDb } from "../../../db/index.ts";
import type {
  CycleAdjustmentRequest,
  CycleCheckInRequest,
  CycleCreateRequest,
  CycleReviewRequest,
} from "./contracts.ts";
import {
  CycleRepositoryError,
  cycleRequestFingerprint,
  type CycleEventRecord,
  type CycleRepository,
  type OperatingCycle,
} from "./repository.ts";

type CycleRow = typeof operatingCycles.$inferSelect;
type EventRow = typeof cycleEvents.$inferSelect;

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function toCycle(row: CycleRow): OperatingCycle {
  const source = row.sourceType === "approved_meeting"
    ? { type: "approved_meeting" as const, meetingId: Number(row.sourceRecordId), mutationHash: row.sourceMutationHash ?? "" }
    : { type: "manual_goal" as const, goalId: Number(row.sourceRecordId) };
  return {
    id: row.id,
    userId: row.userId,
    clientRequestId: row.clientRequestId,
    activeSlot: row.activeSlot === "primary" ? "primary" : null,
    source,
    commitment: row.commitment,
    startLocalDate: row.startLocalDate,
    reviewLocalDate: row.reviewLocalDate,
    timeZone: row.timeZone,
    successCriterion: row.successCriterion,
    stopOrAdjustCondition: row.stopOrAdjustCondition,
    status: row.status as OperatingCycle["status"],
    projection: parseObject(row.projection),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEvent(row: EventRow): CycleEventRecord {
  return {
    id: row.id,
    userId: row.userId,
    cycleId: row.cycleId,
    clientRequestId: row.clientRequestId,
    sequence: row.sequence,
    type: row.type as CycleEventRecord["type"],
    representedLocalDate: row.representedLocalDate,
    payload: parseObject(row.payload),
    createdAt: row.createdAt,
  };
}

function sourceColumns(source: CycleCreateRequest["source"]) {
  return source.type === "approved_meeting"
    ? { type: source.type, recordId: String(source.meetingId), mutationHash: source.mutationHash }
    : { type: source.type, recordId: String(source.goalId), mutationHash: null };
}

async function existingEvent(userId: string, cycleId: string, clientRequestId: string, fingerprint: string) {
  const [row] = await getDb().select().from(cycleEvents).where(and(
    eq(cycleEvents.userId, userId),
    eq(cycleEvents.cycleId, cycleId),
    eq(cycleEvents.clientRequestId, clientRequestId),
  )).limit(1);
  if (!row) return null;
  if (row.requestFingerprint !== fingerprint) throw new CycleRepositoryError("idempotency_conflict");
  return toEvent(row);
}

export class D1CycleRepository implements CycleRepository {
  async createCycle(userId: string, request: CycleCreateRequest) {
    const fingerprint = await cycleRequestFingerprint(request);
    const [prior] = await getDb().select().from(operatingCycles).where(and(
      eq(operatingCycles.userId, userId),
      eq(operatingCycles.clientRequestId, request.clientRequestId),
    )).limit(1);
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) throw new CycleRepositoryError("idempotency_conflict");
      return { cycle: toCycle(prior), created: false };
    }
    if (await this.getCurrent(userId)) throw new CycleRepositoryError("active_cycle_exists");

    const id = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const source = sourceColumns(request.source);
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO operating_cycles
          (id,user_id,client_request_id,request_fingerprint,active_slot,source_type,source_record_id,source_mutation_hash,commitment,start_local_date,review_local_date,time_zone,success_criterion,stop_or_adjust_condition,status,projection,created_at,updated_at)
          VALUES (?,?,?,?,'primary',?,?,?,?,?,?,?,?,?,'active','{}',?,?)`)
          .bind(id, userId, request.clientRequestId, fingerprint, source.type, source.recordId, source.mutationHash,
            request.commitment, request.startLocalDate, request.reviewLocalDate, request.timeZone,
            request.successCriterion, request.stopOrAdjustCondition, now, now),
        env.DB.prepare(`INSERT INTO cycle_events
          (id,user_id,cycle_id,client_request_id,request_fingerprint,sequence,type,represented_local_date,payload,created_at)
          VALUES (?,?,?,?,?,1,'activated',NULL,?,?)`)
          .bind(eventId, userId, id, `${request.clientRequestId}:activated`, fingerprint, JSON.stringify({ source: request.source }), now),
      ]);
    } catch {
      const [recovered] = await getDb().select().from(operatingCycles).where(and(
        eq(operatingCycles.userId, userId),
        eq(operatingCycles.clientRequestId, request.clientRequestId),
      )).limit(1);
      if (recovered) {
        if (recovered.requestFingerprint !== fingerprint) throw new CycleRepositoryError("idempotency_conflict");
        return { cycle: toCycle(recovered), created: false };
      }
      if (await this.getCurrent(userId)) throw new CycleRepositoryError("active_cycle_exists");
      throw new CycleRepositoryError("invalid_state");
    }
    const created = await this.get(userId, id);
    if (!created) throw new CycleRepositoryError("invalid_state");
    return { cycle: created, created: true };
  }

  async getCurrent(userId: string) {
    const [row] = await getDb().select().from(operatingCycles).where(and(
      eq(operatingCycles.userId, userId), eq(operatingCycles.activeSlot, "primary"),
    )).limit(1);
    return row ? toCycle(row) : null;
  }

  async list(userId: string) {
    const rows = await getDb().select().from(operatingCycles)
      .where(eq(operatingCycles.userId, userId)).orderBy(desc(operatingCycles.createdAt));
    return rows.map(toCycle);
  }

  async get(userId: string, cycleId: string) {
    const [row] = await getDb().select().from(operatingCycles).where(and(
      eq(operatingCycles.userId, userId), eq(operatingCycles.id, cycleId),
    )).limit(1);
    return row ? toCycle(row) : null;
  }

  async listEvents(userId: string, cycleId: string) {
    const rows = await getDb().select().from(cycleEvents).where(and(
      eq(cycleEvents.userId, userId), eq(cycleEvents.cycleId, cycleId),
    )).orderBy(asc(cycleEvents.sequence));
    return rows.map(toEvent);
  }

  async appendCheckIn(userId: string, cycleId: string, request: CycleCheckInRequest) {
    const fingerprint = await cycleRequestFingerprint(request);
    const prior = await existingEvent(userId, cycleId, request.clientRequestId, fingerprint);
    if (prior) return prior;
    const cycle = await this.get(userId, cycleId);
    if (!cycle) throw new CycleRepositoryError("not_found");
    if (!cycle.activeSlot || !["active", "adjusted", "review_due"].includes(cycle.status)) throw new CycleRepositoryError("invalid_state");

    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const type = request.outcome === "stopped" ? "stopped" : "checked_in";
    const statements = [env.DB.prepare(`INSERT INTO cycle_events
      (id,user_id,cycle_id,client_request_id,request_fingerprint,sequence,type,represented_local_date,payload,created_at)
      SELECT ?,?,?,?,?,COALESCE((SELECT MAX(sequence)+1 FROM cycle_events WHERE cycle_id=?),1),?,?,?,?
      WHERE EXISTS (SELECT 1 FROM operating_cycles WHERE id=? AND user_id=? AND active_slot='primary')`)
      .bind(eventId, userId, cycleId, request.clientRequestId, fingerprint, cycleId, type,
        request.representedLocalDate, JSON.stringify(request), now, cycleId, userId)];
    if (request.outcome === "stopped") {
      statements.push(env.DB.prepare("UPDATE operating_cycles SET status='stopped',active_slot=NULL,updated_at=? WHERE id=? AND user_id=? AND active_slot='primary'").bind(now, cycleId, userId));
    }
    try { await env.DB.batch(statements); }
    catch {
      const recovered = await existingEvent(userId, cycleId, request.clientRequestId, fingerprint);
      if (recovered) return recovered;
      throw new CycleRepositoryError("invalid_state");
    }
    const persisted = await existingEvent(userId, cycleId, request.clientRequestId, fingerprint);
    if (!persisted) throw new CycleRepositoryError("invalid_state");
    return persisted;
  }

  async applyAdjustment(userId: string, cycleId: string, request: CycleAdjustmentRequest) {
    const fingerprint = await cycleRequestFingerprint(request);
    const prior = await existingEvent(userId, cycleId, request.clientRequestId, fingerprint);
    if (prior) {
      const cycle = await this.get(userId, cycleId);
      if (!cycle) throw new CycleRepositoryError("not_found");
      return cycle;
    }
    const cycle = await this.get(userId, cycleId);
    if (!cycle) throw new CycleRepositoryError("not_found");
    if (cycle.status !== "active") throw new CycleRepositoryError("invalid_state");
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    const type = request.action === "approve" ? "adjusted" : "adjustment_rejected";
    const statements = [env.DB.prepare(`INSERT INTO cycle_events
      (id,user_id,cycle_id,client_request_id,request_fingerprint,sequence,type,represented_local_date,payload,created_at)
      SELECT ?,?,?,?,?,COALESCE((SELECT MAX(sequence)+1 FROM cycle_events WHERE cycle_id=?),1),?,NULL,?,?
      WHERE EXISTS (SELECT 1 FROM operating_cycles WHERE id=? AND user_id=? AND status='active' AND active_slot='primary')`)
      .bind(eventId, userId, cycleId, request.clientRequestId, fingerprint, cycleId, type, JSON.stringify(request), now, cycleId, userId)];
    if (request.action === "approve") {
      statements.push(env.DB.prepare(`UPDATE operating_cycles SET
        commitment=COALESCE(?,commitment),review_local_date=COALESCE(?,review_local_date),
        success_criterion=COALESCE(?,success_criterion),stop_or_adjust_condition=COALESCE(?,stop_or_adjust_condition),
        status='active',updated_at=? WHERE id=? AND user_id=? AND status='active' AND active_slot='primary'`)
        .bind(request.commitment ?? null, request.reviewLocalDate ?? null, request.successCriterion ?? null,
          request.stopOrAdjustCondition ?? null, now, cycleId, userId));
    }
    try { await env.DB.batch(statements); }
    catch {
      if (await existingEvent(userId, cycleId, request.clientRequestId, fingerprint)) return (await this.get(userId, cycleId))!;
      throw new CycleRepositoryError("invalid_state");
    }
    const updated = await this.get(userId, cycleId);
    if (!updated) throw new CycleRepositoryError("invalid_state");
    return updated;
  }

  async review(userId: string, cycleId: string, request: CycleReviewRequest) {
    const fingerprint = await cycleRequestFingerprint(request);
    const prior = await existingEvent(userId, cycleId, request.clientRequestId, fingerprint);
    if (prior) {
      const cycle = await this.get(userId, cycleId);
      if (!cycle) throw new CycleRepositoryError("not_found");
      return cycle;
    }
    const cycle = await this.get(userId, cycleId);
    if (!cycle) throw new CycleRepositoryError("not_found");
    if (!["active", "review_due", "stopped"].includes(cycle.status)) throw new CycleRepositoryError("invalid_state");
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO cycle_events
          (id,user_id,cycle_id,client_request_id,request_fingerprint,sequence,type,represented_local_date,payload,created_at)
          SELECT ?,?,?,?,?,COALESCE((SELECT MAX(sequence)+1 FROM cycle_events WHERE cycle_id=?),1),'reviewed',NULL,?,?
          WHERE EXISTS (SELECT 1 FROM operating_cycles WHERE id=? AND user_id=? AND status IN ('active','review_due','stopped'))`)
          .bind(eventId, userId, cycleId, request.clientRequestId, fingerprint, cycleId, JSON.stringify(request), now, cycleId, userId),
        env.DB.prepare("UPDATE operating_cycles SET status='reviewed',active_slot=NULL,updated_at=? WHERE id=? AND user_id=? AND status IN ('active','review_due','stopped')")
          .bind(now, cycleId, userId),
      ]);
    } catch {
      if (await existingEvent(userId, cycleId, request.clientRequestId, fingerprint)) return (await this.get(userId, cycleId))!;
      throw new CycleRepositoryError("invalid_state");
    }
    const reviewed = await this.get(userId, cycleId);
    if (!reviewed || reviewed.status !== "reviewed") throw new CycleRepositoryError("invalid_state");
    return reviewed;
  }
}
