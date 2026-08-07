import type { EvidenceItemInput, EvidenceSourceSnapshot } from "./contracts.ts";
import { EvidenceRepositoryError, type EvidenceItem, type EvidenceRepository } from "./repository.ts";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryEvidenceRepository implements EvidenceRepository {
  private readonly items = new Map<string, EvidenceItem>();

  async findByClientRequest(userId: string, clientRequestId: string) {
    const item = this.items.get(`${userId}:${clientRequestId}`);
    return item ? copy(item) : null;
  }

  async create(userId: string, decisionId: number, input: EvidenceItemInput, requestFingerprint: string, sourceSnapshot: EvidenceSourceSnapshot | null) {
    const key = `${userId}:${input.clientRequestId}`;
    const prior = this.items.get(key);
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) throw new EvidenceRepositoryError("idempotency_conflict");
      return copy(prior);
    }
    const item: EvidenceItem = {
      ...copy(input), id: crypto.randomUUID(), userId, decisionId, requestFingerprint,
      sourceSnapshot: copy(sourceSnapshot), createdAt: new Date().toISOString(),
    };
    this.items.set(key, item);
    return copy(item);
  }

  async list(userId: string, decisionId: number) {
    return [...this.items.values()]
      .filter((item) => item.userId === userId && item.decisionId === decisionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(copy);
  }
}

