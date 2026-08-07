import type { EvidenceItemInput, EvidenceSourceSnapshot } from "./contracts.ts";

export type EvidenceItem = EvidenceItemInput & {
  id: string;
  userId: string;
  decisionId: number;
  requestFingerprint: string;
  sourceSnapshot: EvidenceSourceSnapshot | null;
  createdAt: string;
};

export class EvidenceRepositoryError extends Error {
  readonly code: "idempotency_conflict";

  constructor(code: "idempotency_conflict") {
    super(code);
    this.code = code;
  }
}

export interface EvidenceRepository {
  findByClientRequest(userId: string, clientRequestId: string): Promise<EvidenceItem | null>;
  create(userId: string, decisionId: number, input: EvidenceItemInput, requestFingerprint: string, sourceSnapshot: EvidenceSourceSnapshot | null): Promise<EvidenceItem>;
  list(userId: string, decisionId: number): Promise<EvidenceItem[]>;
}

