import type { Identity } from "../identity.ts";
import { cycleRequestFingerprint } from "../cycles/repository.ts";
import { EvidenceItemInputSchema, EvidenceKindSchema, type EvidenceSource, type EvidenceSourceSnapshot } from "./contracts.ts";
import { EvidenceRepositoryError, type EvidenceRepository } from "./repository.ts";

export class DecisionEvidenceServiceError extends Error {
  readonly code: "not_found" | "idempotency_conflict";

  constructor(code: "not_found" | "idempotency_conflict") {
    super(code);
    this.code = code;
  }
}

export function createDecisionEvidenceService(dependencies: {
  repository: EvidenceRepository;
  ownsDecision: (userId: string, decisionId: number) => Promise<boolean>;
  resolveSource: (userId: string, source: EvidenceSource) => Promise<EvidenceSourceSnapshot | null>;
  recommendRecords: (userId: string, decisionId: number) => Promise<EvidenceSourceSnapshot[]>;
}) {
  const { repository, ownsDecision, resolveSource, recommendRecords } = dependencies;

  async function requireDecision(identity: Identity, decisionId: number) {
    if (!Number.isInteger(decisionId) || decisionId < 1 || !await ownsDecision(identity.userId, decisionId)) {
      throw new DecisionEvidenceServiceError("not_found");
    }
  }

  return {
    async create(identity: Identity, decisionId: number, candidate: unknown) {
      await requireDecision(identity, decisionId);
      const input = EvidenceItemInputSchema.parse(candidate);
      const requestFingerprint = await cycleRequestFingerprint({ decisionId, ...input });
      const prior = await repository.findByClientRequest(identity.userId, input.clientRequestId);
      if (prior) {
        if (prior.requestFingerprint !== requestFingerprint) throw new DecisionEvidenceServiceError("idempotency_conflict");
        return { item: prior, created: false };
      }
      const sourceSnapshot = input.source ? await resolveSource(identity.userId, input.source) : null;
      if (input.source && !sourceSnapshot) throw new DecisionEvidenceServiceError("not_found");
      try {
        const item = await repository.create(identity.userId, decisionId, input, requestFingerprint, sourceSnapshot);
        return { item, created: true };
      } catch (error) {
        if (error instanceof EvidenceRepositoryError) throw new DecisionEvidenceServiceError(error.code);
        const raced = await repository.findByClientRequest(identity.userId, input.clientRequestId);
        if (raced?.requestFingerprint === requestFingerprint) return { item: raced, created: false };
        throw error;
      }
    },

    async list(identity: Identity, decisionId: number) {
      await requireDecision(identity, decisionId);
      const items = await repository.list(identity.userId, decisionId);
      const groups: Record<(typeof EvidenceKindSchema.options)[number], typeof items> = { fact: [], preference: [], assumption: [], unknown: [], alternative: [], historical_analogue: [] };
      for (const item of items) groups[item.kind].push(item);
      return { groups, recommendedRecords: await recommendRecords(identity.userId, decisionId) };
    },
  };
}
