import type {
  CycleAdjustmentRequest,
  CycleCheckInRequest,
  CycleCreateRequest,
  CycleReviewRequest,
} from "./contracts.ts";
import { applyCycleEvent } from "./state-machine.ts";
import {
  CycleRepositoryError,
  cycleRequestFingerprint,
  type CycleEventRecord,
  type CycleRepository,
  type OperatingCycle,
} from "./repository.ts";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCycleRepository implements CycleRepository {
  private cycles = new Map<string, OperatingCycle>();
  private eventRows = new Map<string, CycleEventRecord[]>();
  private createClaims = new Map<string, { fingerprint: string; cycleId: string }>();
  private eventClaims = new Map<string, { fingerprint: string; eventId: string }>();
  private userLocks = new Map<string, Promise<void>>();

  private async locked<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.userLocks.get(userId) ?? Promise.resolve();
    let release = () => {};
    const next = new Promise<void>((resolve) => { release = resolve; });
    const queued = prior.then(() => next);
    this.userLocks.set(userId, queued);
    await prior;
    try { return await operation(); }
    finally {
      release();
      if (this.userLocks.get(userId) === queued) this.userLocks.delete(userId);
    }
  }

  async createCycle(userId: string, request: CycleCreateRequest) {
    return this.locked(userId, async () => {
      const claimKey = `${userId}:${request.clientRequestId}`;
      const fingerprint = await cycleRequestFingerprint(request);
      const claim = this.createClaims.get(claimKey);
      if (claim) {
        if (claim.fingerprint !== fingerprint) throw new CycleRepositoryError("idempotency_conflict");
        return { cycle: copy(this.cycles.get(claim.cycleId)!), created: false };
      }
      if ([...this.cycles.values()].some((cycle) => cycle.userId === userId && cycle.activeSlot === "primary")) {
        throw new CycleRepositoryError("active_cycle_exists");
      }
      const now = new Date().toISOString();
      const cycle: OperatingCycle = {
        id: crypto.randomUUID(), userId, clientRequestId: request.clientRequestId,
        activeSlot: "primary", source: copy(request.source), commitment: request.commitment,
        startLocalDate: request.startLocalDate, reviewLocalDate: request.reviewLocalDate,
        timeZone: request.timeZone, successCriterion: request.successCriterion,
        stopOrAdjustCondition: request.stopOrAdjustCondition, status: "active",
        projection: {}, createdAt: now, updatedAt: now,
      };
      const activation = this.makeEvent(cycle, `${request.clientRequestId}:activated`, "activated", null, { source: request.source });
      this.cycles.set(cycle.id, cycle);
      this.eventRows.set(cycle.id, [activation]);
      this.createClaims.set(claimKey, { fingerprint, cycleId: cycle.id });
      return { cycle: copy(cycle), created: true };
    });
  }

  async getCurrent(userId: string) {
    const row = [...this.cycles.values()].find((cycle) => cycle.userId === userId && cycle.activeSlot === "primary");
    return row ? copy(row) : null;
  }

  async list(userId: string) {
    return [...this.cycles.values()].filter((cycle) => cycle.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(copy);
  }

  async get(userId: string, cycleId: string) {
    const cycle = this.cycles.get(cycleId);
    return cycle?.userId === userId ? copy(cycle) : null;
  }

  async countActive(userId: string) {
    return [...this.cycles.values()].filter((cycle) => cycle.userId === userId && cycle.activeSlot === "primary").length;
  }

  async listEvents(userId: string, cycleId: string) {
    if (!(await this.get(userId, cycleId))) return [];
    return copy(this.eventRows.get(cycleId) ?? []);
  }

  async appendCheckIn(userId: string, cycleId: string, request: CycleCheckInRequest) {
    return this.locked(userId, async () => {
      const cycle = this.ownedCycle(userId, cycleId);
      if (!cycle.activeSlot || !["active", "adjusted", "review_due"].includes(cycle.status)) {
        throw new CycleRepositoryError("invalid_state");
      }
      const existing = await this.idempotentEvent(userId, cycleId, request.clientRequestId, request);
      if (existing) return existing;
      const type = request.outcome === "stopped" ? "stopped" : "checked_in";
      const event = this.makeEvent(cycle, request.clientRequestId, type, request.representedLocalDate, request);
      this.eventRows.get(cycleId)!.push(event);
      this.eventClaims.set(`${userId}:${cycleId}:${request.clientRequestId}`, {
        fingerprint: await cycleRequestFingerprint(request), eventId: event.id,
      });
      if (request.outcome === "stopped") {
        const lifecycle = applyCycleEvent({ status: cycle.status, activeSlot: cycle.activeSlot }, { type: "stop" });
        Object.assign(cycle, lifecycle, { updatedAt: event.createdAt });
      }
      return copy(event);
    });
  }

  async applyAdjustment(userId: string, cycleId: string, request: CycleAdjustmentRequest) {
    return this.locked(userId, async () => {
      const cycle = this.ownedCycle(userId, cycleId);
      if (cycle.status !== "active") throw new CycleRepositoryError("invalid_state");
      const existing = await this.idempotentEvent(userId, cycleId, request.clientRequestId, request);
      if (existing) return copy(cycle);
      const eventType = request.action === "approve" ? "adjusted" : "adjustment_rejected";
      const event = this.makeEvent(cycle, request.clientRequestId, eventType, null, request);
      this.eventRows.get(cycleId)!.push(event);
      this.eventClaims.set(`${userId}:${cycleId}:${request.clientRequestId}`, {
        fingerprint: await cycleRequestFingerprint(request), eventId: event.id,
      });
      if (request.action === "approve") {
        applyCycleEvent({ status: cycle.status, activeSlot: cycle.activeSlot }, { type: "adjust" });
        Object.assign(cycle, {
          commitment: request.commitment ?? cycle.commitment,
          reviewLocalDate: request.reviewLocalDate ?? cycle.reviewLocalDate,
          successCriterion: request.successCriterion ?? cycle.successCriterion,
          stopOrAdjustCondition: request.stopOrAdjustCondition ?? cycle.stopOrAdjustCondition,
          status: "active",
          updatedAt: event.createdAt,
        });
      }
      return copy(cycle);
    });
  }

  async review(userId: string, cycleId: string, request: CycleReviewRequest) {
    return this.locked(userId, async () => {
      const cycle = this.ownedCycle(userId, cycleId);
      if (!["active", "review_due", "stopped"].includes(cycle.status)) throw new CycleRepositoryError("invalid_state");
      const existing = await this.idempotentEvent(userId, cycleId, request.clientRequestId, request);
      if (existing) return copy(cycle);
      const event = this.makeEvent(cycle, request.clientRequestId, "reviewed", null, request);
      this.eventRows.get(cycleId)!.push(event);
      this.eventClaims.set(`${userId}:${cycleId}:${request.clientRequestId}`, {
        fingerprint: await cycleRequestFingerprint(request), eventId: event.id,
      });
      const lifecycle = applyCycleEvent({ status: cycle.status, activeSlot: cycle.activeSlot }, { type: "review" });
      Object.assign(cycle, lifecycle, { updatedAt: event.createdAt });
      return copy(cycle);
    });
  }

  private ownedCycle(userId: string, cycleId: string) {
    const cycle = this.cycles.get(cycleId);
    if (!cycle || cycle.userId !== userId) throw new CycleRepositoryError("not_found");
    return cycle;
  }

  private makeEvent(cycle: OperatingCycle, clientRequestId: string, type: CycleEventRecord["type"], representedLocalDate: string | null, payload: Record<string, unknown>) {
    return {
      id: crypto.randomUUID(), userId: cycle.userId, cycleId: cycle.id, clientRequestId,
      sequence: (this.eventRows.get(cycle.id)?.length ?? 0) + 1,
      type, representedLocalDate, payload: copy(payload), createdAt: new Date().toISOString(),
    } satisfies CycleEventRecord;
  }

  private async idempotentEvent(userId: string, cycleId: string, clientRequestId: string, request: unknown) {
    const key = `${userId}:${cycleId}:${clientRequestId}`;
    const claim = this.eventClaims.get(key);
    if (!claim) return null;
    if (claim.fingerprint !== await cycleRequestFingerprint(request)) throw new CycleRepositoryError("idempotency_conflict");
    return copy((this.eventRows.get(cycleId) ?? []).find((event) => event.id === claim.eventId)!);
  }
}
