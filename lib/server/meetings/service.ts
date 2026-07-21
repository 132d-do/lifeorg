import type { Identity } from "../identity.ts";
import type { AgentContribution, EvidenceRecord, FinalRecommendation, MeetingTurnResponse, MutationPreview } from "../agents/schemas.ts";
import { gateRecommendation } from "../agents/quality-gate.ts";
import {
  MeetingCreateRequestSchema,
  MeetingDecisionRequestSchema,
  MeetingTurnRequestSchema,
  canonicalHash,
  canonicalMutationHash,
  type EvidenceReference,
  type MeetingCreateRequest,
  type MeetingDecisionRequest,
} from "./contracts.ts";
import { applyMeetingEvent, initialMeetingLifecycle, type MeetingLifecycle } from "./state-machine.ts";

export type MeetingMessage = {
  id: string;
  sequence: number;
  turnNumber: number;
  role: "user" | "chiefOfStaffAgent" | "strategyArchitectAgent" | "operationsOfficerAgent" | "riskAuditorAgent" | "system";
  content: unknown;
  modelMetadata: { source: "user" | "lifeorg" | "openai"; agent?: string; model?: string; phase?: string };
  clientTurnId?: string;
  createdAt: string;
};

export type MeetingRoom = {
  id: string;
  userId: string;
  clientRequestId: string;
  createFingerprint: string;
  kind: MeetingCreateRequest["kind"];
  topic: string;
  intake: MeetingCreateRequest["intake"];
  evidenceReferences: EvidenceReference[];
  records: EvidenceRecord[];
  lifecycle: MeetingLifecycle;
  messages: MeetingMessage[];
  turnResponses: Record<string, MeetingTurnResult>;
  turnFingerprints: Record<string, string>;
  decisions: Record<string, MeetingDecisionResult>;
  decisionFingerprints: Record<string, string>;
  decisionHistory: Array<{ id: string; action: "approve" | "edit" | "reject"; sessionId: string; recommendationSnapshot: FinalRecommendation; createdAt: string }>;
  lockedMutationIntent?: Extract<MutationPreview, { type: "decision.reviewOutcome" }>;
  recommendation?: FinalRecommendation;
  legacyInputs?: Record<string, unknown>;
  legacyAgentOutput?: Record<string, unknown>;
  mutationHash?: string;
  updatedAt: string;
};

export type MeetingTurnResult = MeetingTurnResponse | {
  status: "offline";
  mode: "structured_offline";
  reason: string;
  canRetry: true;
};

export type MeetingDecisionResult = {
  status: "approved" | "ready" | "draft";
  meetingId: string;
  approvalStatus: "approved" | "pending";
  mutationHash?: string;
};
export type DecisionFence = { updatedAt: string; finalRecommendation: string };

export class MeetingServiceError extends Error {
  readonly code: "not_found" | "idempotency_conflict" | "turn_in_progress" | "decision_in_progress" | "session_required" | "invalid_state" | "mutation_mismatch" | "invalid_evidence";
  constructor(code: "not_found" | "idempotency_conflict" | "turn_in_progress" | "decision_in_progress" | "session_required" | "invalid_state" | "mutation_mismatch" | "invalid_evidence", message: string) {
    super(message);
    this.code = code;
  }
}

export interface MeetingRepository {
  findByClientRequest(userId: string, clientRequestId: string): Promise<MeetingRoom | null>;
  createMeeting(userId: string, request: MeetingCreateRequest, fingerprint: string, records: EvidenceRecord[]): Promise<MeetingRoom>;
  getMeeting(userId: string, meetingId: string): Promise<MeetingRoom | null>;
  resolveEvidence(userId: string, references: EvidenceReference[]): Promise<EvidenceRecord[]>;
  claimTurn(userId: string, meetingId: string, clientTurnId: string, fingerprint: string): Promise<{ status: "claimed" | "pending" | "completed"; response?: MeetingTurnResult; leaseToken?: string }>;
  completeTurn(userId: string, room: MeetingRoom, clientTurnId: string, response: MeetingTurnResult, leaseToken: string): Promise<MeetingTurnResult>;
  claimDecision(userId: string, meetingId: string, idempotencyKey: string, fingerprint: string): Promise<{ status: "claimed" | "pending"; leaseToken?: string }>;
  releaseDecision(userId: string, meetingId: string, idempotencyKey: string, leaseToken: string): Promise<void>;
  completeDecision(userId: string, room: MeetingRoom, idempotencyKey: string, response: MeetingDecisionResult, leaseToken: string, fence: DecisionFence): Promise<MeetingDecisionResult>;
  persistTurn(userId: string, room: MeetingRoom): Promise<void>;
  commitApproval(userId: string, room: MeetingRoom, input: { idempotencyKey: string; mutationHash: string; mutations: MutationPreview[]; sessionId: string; decisionLeaseToken: string; fence: DecisionFence }): Promise<void>;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function serverId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function titleFor(kind: MeetingCreateRequest["kind"]) {
  return kind === "daily" ? "每日站会" : kind === "weekly" ? "周经营会" : kind === "monthly" ? "月度战略会" : "专项决策会";
}

export class InMemoryMeetingRepository implements MeetingRepository {
  private readonly rooms = new Map<string, MeetingRoom>();
  private readonly recordsByUser: Record<string, EvidenceRecord[]>;
  private readonly goalsByUser: Record<string, Array<Record<string, unknown>>>;
  private readonly decisionsByUser: Record<string, Array<Record<string, unknown>>>;
  private readonly reviewsByUser: Record<string, Array<Record<string, unknown>>> = {};
  private readonly approvalsByMeeting = new Map<string, MeetingDecisionResult>();
  private readonly turnClaims = new Map<string, { fingerprint: string; status: "pending" | "completed"; leaseToken: string; response?: MeetingTurnResult }>();
  private readonly decisionLeases = new Map<string, { idempotencyKey: string; fingerprint: string; leaseToken: string }>();

  constructor(seed: {
    recordsByUser?: Record<string, EvidenceRecord[]>;
    goalsByUser?: Record<string, Array<Record<string, unknown>>>;
    decisionsByUser?: Record<string, Array<Record<string, unknown>>>;
  } = {}) {
    this.recordsByUser = copy(seed.recordsByUser ?? {});
    this.goalsByUser = copy(seed.goalsByUser ?? {});
    this.decisionsByUser = copy(seed.decisionsByUser ?? {});
  }

  async findByClientRequest(userId: string, clientRequestId: string) {
    return copy([...this.rooms.values()].find((room) => room.userId === userId && room.clientRequestId === clientRequestId) ?? null);
  }

  async createMeeting(userId: string, request: MeetingCreateRequest, fingerprint: string, records: EvidenceRecord[]) {
    const now = new Date().toISOString();
    const room: MeetingRoom = {
      id: serverId("meeting"), userId, clientRequestId: request.clientRequestId, createFingerprint: fingerprint,
      kind: request.kind, topic: request.topic, intake: request.intake, evidenceReferences: request.evidence,
      records: copy(records), lifecycle: initialMeetingLifecycle(), messages: [], turnResponses: {}, turnFingerprints: {}, decisions: {}, decisionFingerprints: {}, decisionHistory: [],
      ...(request.lockedMutationIntent ? { lockedMutationIntent: copy(request.lockedMutationIntent) } : {}), updatedAt: now,
    };
    this.rooms.set(room.id, copy(room));
    return room;
  }

  async getMeeting(userId: string, meetingId: string) {
    const room = this.rooms.get(meetingId);
    return room?.userId === userId ? copy(room) : null;
  }

  async resolveEvidence(userId: string, references: EvidenceReference[]) {
    const available = this.recordsByUser[userId] ?? [];
    return references.flatMap((reference) => {
      const canonical = `${reference.type}:${reference.id}`;
      const found = available.find((record) => record.id === canonical);
      return found ? [copy(found)] : [];
    });
  }

  async claimTurn(userId: string, meetingId: string, clientTurnId: string, fingerprint: string) {
    const room = this.rooms.get(meetingId);
    if (!room || room.userId !== userId) throw new MeetingServiceError("not_found", "Meeting not found");
    const key = `${userId}:${meetingId}:${clientTurnId}`;
    const prior = this.turnClaims.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new MeetingServiceError("idempotency_conflict", "clientTurnId was reused with different content");
      return { status: prior.status, ...(prior.response ? { response: copy(prior.response) } : {}) } as const;
    }
    const leaseToken = serverId("lease");
    this.turnClaims.set(key, { fingerprint, status: "pending", leaseToken });
    return { status: "claimed" as const, leaseToken };
  }

  async completeTurn(userId: string, room: MeetingRoom, clientTurnId: string, response: MeetingTurnResult, leaseToken: string) {
    const key = `${userId}:${room.id}:${clientTurnId}`;
    const claim = this.turnClaims.get(key);
    if (!claim || claim.status !== "pending" || claim.leaseToken !== leaseToken) throw new MeetingServiceError("invalid_state", "Turn lease is no longer owned by this request");
    await this.persistTurn(userId, room);
    this.turnClaims.set(key, { ...claim, status: "completed", response: copy(response) });
    return copy(response);
  }

  async claimDecision(userId: string, meetingId: string, idempotencyKey: string, fingerprint: string) {
    const room = this.rooms.get(meetingId);
    if (!room || room.userId !== userId) throw new MeetingServiceError("not_found", "Meeting not found");
    const key = `${userId}:${meetingId}`;
    const prior = this.decisionLeases.get(key);
    if (prior) {
      if (prior.idempotencyKey === idempotencyKey && prior.fingerprint !== fingerprint) throw new MeetingServiceError("idempotency_conflict", "idempotencyKey was reused with a different decision");
      return { status: "pending" as const };
    }
    const leaseToken = serverId("decision-lease");
    this.decisionLeases.set(key, { idempotencyKey, fingerprint, leaseToken });
    return { status: "claimed" as const, leaseToken };
  }

  async releaseDecision(userId: string, meetingId: string, idempotencyKey: string, leaseToken: string) {
    const key = `${userId}:${meetingId}`; const lease = this.decisionLeases.get(key);
    if (lease?.idempotencyKey === idempotencyKey && lease.leaseToken === leaseToken) this.decisionLeases.delete(key);
  }

  async completeDecision(userId: string, room: MeetingRoom, idempotencyKey: string, response: MeetingDecisionResult, leaseToken: string, fence: DecisionFence) {
    const key = `${userId}:${room.id}`;
    const lease = this.decisionLeases.get(key);
    if (!lease || lease.idempotencyKey !== idempotencyKey || lease.leaseToken !== leaseToken) throw new MeetingServiceError("invalid_state", "Decision lease is no longer owned by this request");
    const authoritative = this.rooms.get(room.id);
    if (!authoritative || authoritative.lifecycle.status !== "ready" || authoritative.updatedAt !== fence.updatedAt || JSON.stringify(authoritative.recommendation) !== fence.finalRecommendation) throw new MeetingServiceError("invalid_state", "Meeting changed after the decision lease was acquired");
    await this.persistTurn(userId, room);
    this.decisionLeases.delete(key);
    return copy(response);
  }

  async persistTurn(userId: string, room: MeetingRoom) {
    if (room.userId !== userId || !this.rooms.has(room.id)) throw new MeetingServiceError("not_found", "Meeting not found");
    this.rooms.set(room.id, copy(room));
  }

  async commitApproval(userId: string, room: MeetingRoom, input: { idempotencyKey: string; mutationHash: string; mutations: MutationPreview[]; sessionId: string; decisionLeaseToken: string; fence: DecisionFence }) {
    if (room.userId !== userId) throw new MeetingServiceError("not_found", "Meeting not found");
    const approvalKey = `${userId}:${room.id}`;
    if (this.approvalsByMeeting.has(approvalKey)) return;
    const lease = this.decisionLeases.get(approvalKey);
    if (!lease || lease.idempotencyKey !== input.idempotencyKey || lease.leaseToken !== input.decisionLeaseToken) throw new MeetingServiceError("invalid_state", "Decision lease is no longer owned by this request");
    const authoritative = this.rooms.get(room.id);
    if (!authoritative || authoritative.lifecycle.status !== "ready" || authoritative.updatedAt !== input.fence.updatedAt || JSON.stringify(authoritative.recommendation) !== input.fence.finalRecommendation) throw new MeetingServiceError("invalid_state", "Meeting changed after the approval lease was acquired");

    const nextGoals = copy(this.goalsByUser[userId] ?? []);
    const nextDecisions = copy(this.decisionsByUser[userId] ?? []);
    const nextReviews = copy(this.reviewsByUser[userId] ?? []);
    for (const mutation of input.mutations) {
      if (mutation.type === "goal.update") {
        const goal = nextGoals.find((item) => item.id === mutation.goalId);
        if (!goal) throw new MeetingServiceError("invalid_evidence", "Goal not found");
        if (mutation.progress !== undefined) goal.progress = mutation.progress;
        if (mutation.status !== undefined) goal.status = mutation.status;
      } else if (mutation.type === "goal.create") {
        nextGoals.push({ ...copy(mutation), id: Math.max(0, ...nextGoals.map((item) => Number(item.id) || 0)) + 1, status: "active", progress: 0 });
      } else if (mutation.type === "decision.create") {
        nextDecisions.push({ ...copy(mutation), id: Math.max(0, ...nextDecisions.map((item) => Number(item.id) || 0)) + 1, status: "decided" });
      } else {
        const decision = nextDecisions.find((item) => item.id === mutation.decisionId);
        if (!decision) throw new MeetingServiceError("invalid_evidence", "Decision not found");
        nextReviews.push({
          id: serverId("review"), decisionId: mutation.decisionId, outcome: mutation.outcome, observedAt: mutation.observedAt,
          decisionSnapshot: copy(decision), meetingId: room.id, mutationHash: input.mutationHash,
        });
      }
    }
    this.goalsByUser[userId] = nextGoals;
    this.decisionsByUser[userId] = nextDecisions;
    this.reviewsByUser[userId] = nextReviews;
    const approved = Object.values(room.decisions).find((decision) => decision.status === "approved") ?? { status: "approved", meetingId: room.id, approvalStatus: "approved", mutationHash: input.mutationHash };
    this.approvalsByMeeting.set(approvalKey, copy(approved));
    this.rooms.set(room.id, copy(room));
    this.decisionLeases.delete(approvalKey);
  }

  goal(userId: string, id: number) { return this.goalsByUser[userId]?.find((item) => item.id === id); }
  decision(userId: string, id: number) { return copy(this.decisionsByUser[userId]?.find((item) => item.id === id)); }
  decisionReviews(userId: string, id: number) { return copy((this.reviewsByUser[userId] ?? []).filter((item) => item.decisionId === id)); }
  approvalCount(userId: string, meetingId: string) { return this.approvalsByMeeting.has(`${userId}:${meetingId}`) ? 1 : 0; }
}

export function createMeetingService(dependencies: {
  repository: MeetingRepository;
  deliberate: (packet: { records: EvidenceRecord[]; topic: string; latestUserMessage: string; intake: MeetingCreateRequest["intake"]; messages: MeetingMessage[]; lockedMutationIntent?: MutationPreview }, message: string) => Promise<MeetingTurnResponse | { turn: MeetingTurnResponse; contributions: AgentContribution[] }>;
}) {
  const { repository, deliberate } = dependencies;

  async function owned(identity: Identity, meetingId: string) {
    const room = await repository.getMeeting(identity.userId, meetingId);
    if (!room) throw new MeetingServiceError("not_found", "Meeting not found");
    return room;
  }

  return {
    async create(identity: Identity, candidate: unknown) {
      const parsed = MeetingCreateRequestSchema.parse(candidate);
      if (parsed.evidence.some((reference) => reference.type === "profile" && reference.id !== "self")) throw new MeetingServiceError("invalid_evidence", "Profile evidence must use profile:self");
      const seen = new Set<string>();
      const evidence = parsed.evidence.filter((reference) => {
        const canonical = reference.type === "profile" ? "profile:self" : `${reference.type}:${reference.id}`;
        if (seen.has(canonical)) return false;
        seen.add(canonical); return true;
      });
      if (evidence.length < 2) throw new MeetingServiceError("invalid_evidence", "A governed recommendation meeting requires at least two distinct evidence records");
      const request = { ...parsed, evidence };
      const fingerprint = await canonicalHash(request);
      const prior = await repository.findByClientRequest(identity.userId, request.clientRequestId);
      if (prior) {
        if (prior.createFingerprint !== fingerprint) throw new MeetingServiceError("idempotency_conflict", "clientRequestId was reused with different content");
        return { meetingId: prior.id, status: prior.lifecycle.status, created: false };
      }
      const records = await repository.resolveEvidence(identity.userId, request.evidence);
      if (records.length !== request.evidence.length) throw new MeetingServiceError("invalid_evidence", "One or more evidence records do not belong to the user");
      let room: MeetingRoom;
      try { room = await repository.createMeeting(identity.userId, request, fingerprint, records); }
      catch (error) {
        const raced = await repository.findByClientRequest(identity.userId, request.clientRequestId);
        if (!raced) throw error;
        if (raced.createFingerprint !== fingerprint) throw new MeetingServiceError("idempotency_conflict", "clientRequestId was reused with different content");
        return { meetingId: raced.id, status: raced.lifecycle.status, created: false };
      }
      return { meetingId: room.id, status: room.lifecycle.status, created: true };
    },

    async get(identity: Identity, meetingId: string) {
      const room = await owned(identity, meetingId);
      return { ...room, messages: [...room.messages].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id)) };
    },

    async turn(identity: Identity, meetingId: string, candidate: unknown): Promise<MeetingTurnResult> {
      const request = MeetingTurnRequestSchema.parse(candidate);
      const room = await owned(identity, meetingId);
      const requestFingerprint = await canonicalHash(request);
      const claim = await repository.claimTurn(identity.userId, meetingId, request.clientTurnId, requestFingerprint);
      if (claim.status === "completed" && claim.response) return copy(claim.response);
      if (claim.status === "pending") throw new MeetingServiceError("turn_in_progress", "This meeting turn is already running");
      if (!claim.leaseToken) throw new MeetingServiceError("invalid_state", "Turn claim did not provide a lease token");
      const leaseToken = claim.leaseToken;
      if (room.lifecycle.status === "approved") throw new MeetingServiceError("invalid_state", "Approved meetings are archived");
      const turnNumber = Math.max(0, ...room.messages.map((message) => message.turnNumber)) + 1;
      const createdAt = new Date().toISOString();
      let sequence = Math.max(0, ...room.messages.map((message) => message.sequence)) + 1;
      const appendMessage = (role: MeetingMessage["role"], content: unknown, modelMetadata: MeetingMessage["modelMetadata"], clientTurnId?: string) => {
        room.messages.push({ id: serverId("message"), sequence, turnNumber, role, content, modelMetadata, ...(clientTurnId ? { clientTurnId } : {}), createdAt });
        sequence += 1;
      };
      appendMessage("user", { message: request.message }, { source: "user" }, request.clientTurnId);
      try {
        const deliberation = await deliberate({ records: room.records, topic: room.topic, latestUserMessage: request.message, intake: room.intake, messages: copy(room.messages), ...(room.lockedMutationIntent ? { lockedMutationIntent: room.lockedMutationIntent } : {}) }, request.message);
        const result = "turn" in deliberation ? deliberation.turn : deliberation;
        const contributions = "turn" in deliberation ? deliberation.contributions : result.status === "deliberating" ? result.contributions : [];
        if (result.status === "ready" && room.lockedMutationIntent) {
          const actual = await canonicalMutationHash(result.recommendation.mutationPreview ?? []);
          const locked = await canonicalMutationHash([room.lockedMutationIntent]);
          if (actual !== locked) {
            const needsInput: MeetingTurnResult = { status: "needs_input", question: "请确认这次决策复盘的实际结果与观察日期。", missingEvidence: ["locked_mutation_intent"] };
            room.lifecycle = applyMeetingEvent(room.lifecycle, { type: "needs_input" });
            appendMessage("system", needsInput, { source: "openai", agent: "chiefOfStaffAgent", model: "gpt-5.6-sol", phase: "synthesis" });
            room.turnResponses[request.clientTurnId] = needsInput; room.turnFingerprints[request.clientTurnId] = requestFingerprint;
            return await repository.completeTurn(identity.userId, room, request.clientTurnId, needsInput, leaseToken);
          }
        }
        if (result.status === "needs_input") {
          room.lifecycle = applyMeetingEvent(room.lifecycle, { type: "needs_input" });
          appendMessage("system", result, { source: "openai", agent: "chiefOfStaffAgent", model: "gpt-5.6-sol", phase: "completeness" });
        } else if (result.status === "deliberating") {
          room.lifecycle = applyMeetingEvent(room.lifecycle, { type: "deliberating" });
          for (const contribution of result.contributions) appendMessage(contribution.role as MeetingMessage["role"], contribution, { source: "openai", agent: contribution.role, model: "gpt-5.6-terra", phase: "specialist" });
        } else {
          room.lifecycle = applyMeetingEvent(room.lifecycle, { type: "ready" });
          room.recommendation = copy(result.recommendation);
          room.mutationHash = await canonicalMutationHash(result.recommendation.mutationPreview ?? []);
          for (const contribution of contributions) appendMessage(contribution.role as MeetingMessage["role"], contribution, { source: "openai", agent: contribution.role, model: "gpt-5.6-terra", phase: "specialist" });
          appendMessage("chiefOfStaffAgent", result, { source: "openai", agent: "chiefOfStaffAgent", model: "gpt-5.6-sol", phase: "synthesis" });
        }
        room.turnResponses[request.clientTurnId] = copy(result);
        room.turnFingerprints[request.clientTurnId] = requestFingerprint;
        room.updatedAt = new Date().toISOString();
        return await repository.completeTurn(identity.userId, room, request.clientTurnId, result, leaseToken);
      } catch (error) {
        if (error instanceof MeetingServiceError) throw error;
        const reason = typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "provider_failure";
        const offline = { status: "offline", mode: "structured_offline", reason, canRetry: true } as const;
        room.turnResponses[request.clientTurnId] = offline;
        room.turnFingerprints[request.clientTurnId] = requestFingerprint;
        appendMessage("system", offline, { source: "lifeorg", phase: "offline" });
        return await repository.completeTurn(identity.userId, room, request.clientTurnId, offline, leaseToken);
      }
    },

    async decide(identity: Identity, meetingId: string, candidate: unknown): Promise<MeetingDecisionResult> {
      const request = MeetingDecisionRequestSchema.parse(candidate) as MeetingDecisionRequest;
      if (!identity.sessionId) throw new MeetingServiceError("session_required", "A browser or Sites session is required for meeting decisions");
      const decisionFingerprint = await canonicalHash(request);
      const claim = await repository.claimDecision(identity.userId, meetingId, request.idempotencyKey, decisionFingerprint);
      if (claim.status === "pending") throw new MeetingServiceError("decision_in_progress", "Another meeting decision is already running");
      if (!claim.leaseToken) throw new MeetingServiceError("invalid_state", "Decision claim did not provide a lease token");
      const decisionLeaseToken = claim.leaseToken;
      try {
      const room = await owned(identity, meetingId);
      const prior = room.decisions[request.idempotencyKey];
      if (prior) {
        if (room.decisionFingerprints[request.idempotencyKey] !== decisionFingerprint) throw new MeetingServiceError("idempotency_conflict", "idempotencyKey was reused with a different decision");
        return copy(prior);
      }
      const approvedPrior = Object.values(room.decisions).find((decision) => decision.status === "approved");
      if (approvedPrior) {
        if (request.action === "approve" && request.mutationHash === approvedPrior.mutationHash) return copy(approvedPrior);
        throw new MeetingServiceError("invalid_state", "Meeting approval has already been committed");
      }
      if (room.lifecycle.status !== "ready" || !room.recommendation) throw new MeetingServiceError("invalid_state", "Meeting must be ready before a decision");
      const fence: DecisionFence = { updatedAt: room.updatedAt, finalRecommendation: JSON.stringify(room.recommendation) };

      if (request.action === "edit") {
        if (room.lockedMutationIntent) {
          const editedHash = await canonicalMutationHash(request.recommendation.mutationPreview ?? []);
          const lockedHash = await canonicalMutationHash([room.lockedMutationIntent]);
          if (editedHash !== lockedHash) throw new MeetingServiceError("mutation_mismatch", "A locked decision outcome cannot be changed by editing the recommendation");
        }
        const gated = gateRecommendation(request.recommendation, room.records);
        if (gated.status !== "ready") throw new MeetingServiceError("invalid_evidence", "Edited recommendation does not pass the evidence gate");
        room.decisionHistory.push({ id: serverId("decision-event"), action: "edit", sessionId: identity.sessionId, recommendationSnapshot: copy(room.recommendation), createdAt: new Date().toISOString() });
        room.recommendation = copy(request.recommendation);
        room.mutationHash = await canonicalMutationHash(request.recommendation.mutationPreview ?? []);
        room.lifecycle = applyMeetingEvent(room.lifecycle, { type: "edit" });
        const result: MeetingDecisionResult = { status: "ready", meetingId, approvalStatus: "pending", mutationHash: room.mutationHash };
        room.decisions[request.idempotencyKey] = result; room.decisionFingerprints[request.idempotencyKey] = decisionFingerprint; room.updatedAt = new Date().toISOString();
        return await repository.completeDecision(identity.userId, room, request.idempotencyKey, result, decisionLeaseToken, fence);
      } else if (request.action === "reject") {
        room.decisionHistory.push({ id: serverId("decision-event"), action: "reject", sessionId: identity.sessionId, recommendationSnapshot: copy(room.recommendation), createdAt: new Date().toISOString() });
        room.lifecycle = applyMeetingEvent(room.lifecycle, { type: "reject" });
        room.mutationHash = undefined;
        const result: MeetingDecisionResult = { status: "draft", meetingId, approvalStatus: "pending" };
        room.decisions[request.idempotencyKey] = result; room.decisionFingerprints[request.idempotencyKey] = decisionFingerprint; room.updatedAt = new Date().toISOString();
        return await repository.completeDecision(identity.userId, room, request.idempotencyKey, result, decisionLeaseToken, fence);
      } else {
        const mutations = room.recommendation.mutationPreview ?? [];
        const expected = await canonicalMutationHash(mutations);
        if (request.mutationHash !== expected || request.mutationHash !== room.mutationHash) throw new MeetingServiceError("mutation_mismatch", "Mutation preview changed after review");
        room.lifecycle = applyMeetingEvent(room.lifecycle, { type: "approve" });
        const sessionId = identity.sessionId;
        room.decisionHistory.push({ id: serverId("decision-event"), action: "approve", sessionId, recommendationSnapshot: copy(room.recommendation), createdAt: new Date().toISOString() });
        const approved: MeetingDecisionResult = { status: "approved", meetingId, approvalStatus: "approved", mutationHash: expected };
        room.decisions[request.idempotencyKey] = approved;
        room.decisionFingerprints[request.idempotencyKey] = decisionFingerprint;
        try { await repository.commitApproval(identity.userId, room, { idempotencyKey: request.idempotencyKey, mutationHash: expected, mutations, sessionId, decisionLeaseToken, fence }); }
        catch (error) {
          const recovered = await repository.getMeeting(identity.userId, meetingId);
          const recoveredApproval = recovered && Object.values(recovered.decisions).find((decision) => decision.status === "approved");
          if (recoveredApproval) return copy(recoveredApproval);
          throw error;
        }
        return approved;
      }
      } finally {
        await repository.releaseDecision(identity.userId, meetingId, request.idempotencyKey, decisionLeaseToken);
      }
    },
  };
}

export const meetingTitleForKind = titleFor;
