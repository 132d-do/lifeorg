import type { Identity } from "../identity.ts";
import {
  CycleAdjustmentRequestSchema,
  CycleCheckInRequestSchema,
  CycleCreateRequestSchema,
  CycleReviewRequestSchema,
} from "./contracts.ts";
import {
  CycleRepositoryError,
  cycleRequestFingerprint,
  type CycleRepository,
} from "./repository.ts";

export class CycleServiceError extends Error {
  readonly code: "not_found" | "invalid_state" | "idempotency_conflict" | "active_cycle_exists" | "proposal_mismatch" | "review_not_due";

  constructor(code: "not_found" | "invalid_state" | "idempotency_conflict" | "active_cycle_exists" | "proposal_mismatch" | "review_not_due") {
    super(code);
    this.code = code;
  }
}

type AdjustmentChanges = {
  commitment?: string;
  reviewLocalDate?: string;
  successCriterion?: string;
  stopOrAdjustCondition?: string;
};

export function canonicalAdjustmentHash(cycleId: string, changes: AdjustmentChanges) {
  return cycleRequestFingerprint({ cycleId, ...changes });
}

function mapRepositoryError(error: unknown): never {
  if (error instanceof CycleRepositoryError) throw new CycleServiceError(error.code);
  throw error;
}

function localDayDistance(start: string, end: string) {
  const asDay = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  return asDay(end) - asDay(start);
}

export function createCycleService(dependencies: {
  repository: CycleRepository;
  ownsGoal: (userId: string, goalId: number) => Promise<boolean>;
  ownsApprovedMeeting: (userId: string, meetingId: number, mutationHash: string) => Promise<boolean>;
  todayLocalDate?: (timeZone: string) => string;
}) {
  const { repository, ownsGoal, ownsApprovedMeeting } = dependencies;
  const todayLocalDate = dependencies.todayLocalDate ?? ((timeZone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  });

  async function owned(identity: Identity, cycleId: string) {
    const cycle = await repository.get(identity.userId, cycleId);
    if (!cycle) throw new CycleServiceError("not_found");
    return cycle;
  }

  return {
    async create(identity: Identity, candidate: unknown) {
      const request = CycleCreateRequestSchema.parse(candidate);
      const sourceOwned = request.source.type === "manual_goal"
        ? await ownsGoal(identity.userId, request.source.goalId)
        : await ownsApprovedMeeting(identity.userId, request.source.meetingId, request.source.mutationHash);
      if (!sourceOwned) throw new CycleServiceError("not_found");
      try { return await repository.createCycle(identity.userId, request); }
      catch (error) { return mapRepositoryError(error); }
    },

    async list(identity: Identity) {
      return repository.list(identity.userId);
    },

    async current(identity: Identity) {
      return repository.getCurrent(identity.userId);
    },

    async get(identity: Identity, cycleId: string) {
      const cycle = await owned(identity, cycleId);
      return { cycle, events: await repository.listEvents(identity.userId, cycleId) };
    },

    async checkIn(identity: Identity, cycleId: string, candidate: unknown) {
      await owned(identity, cycleId);
      const request = CycleCheckInRequestSchema.parse(candidate);
      try { return await repository.appendCheckIn(identity.userId, cycleId, request); }
      catch (error) { return mapRepositoryError(error); }
    },

    async adjust(identity: Identity, cycleId: string, candidate: unknown) {
      const cycle = await owned(identity, cycleId);
      const request = CycleAdjustmentRequestSchema.parse(candidate);
      if (request.reviewLocalDate) {
        const days = localDayDistance(cycle.startLocalDate, request.reviewLocalDate);
        if (!Number.isFinite(days) || days < 1 || days > 7) throw new CycleServiceError("invalid_state");
      }
      const changes: AdjustmentChanges = {
        ...(request.commitment === undefined ? {} : { commitment: request.commitment }),
        ...(request.reviewLocalDate === undefined ? {} : { reviewLocalDate: request.reviewLocalDate }),
        ...(request.successCriterion === undefined ? {} : { successCriterion: request.successCriterion }),
        ...(request.stopOrAdjustCondition === undefined ? {} : { stopOrAdjustCondition: request.stopOrAdjustCondition }),
      };
      if (request.action === "approve" && request.proposalHash !== await canonicalAdjustmentHash(cycleId, changes)) {
        throw new CycleServiceError("proposal_mismatch");
      }
      try { return await repository.applyAdjustment(identity.userId, cycleId, request); }
      catch (error) { return mapRepositoryError(error); }
    },

    async review(identity: Identity, cycleId: string, candidate: unknown) {
      const cycle = await owned(identity, cycleId);
      if (todayLocalDate(cycle.timeZone) < cycle.reviewLocalDate) throw new CycleServiceError("review_not_due");
      const request = CycleReviewRequestSchema.parse(candidate);
      try { return await repository.review(identity.userId, cycleId, request); }
      catch (error) { return mapRepositoryError(error); }
    },
  };
}
