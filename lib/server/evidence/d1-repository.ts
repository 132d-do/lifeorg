import { and, asc, eq } from "drizzle-orm";
import { evidenceItems } from "../../../db/schema.ts";
import { getDb } from "../../../db/index.ts";
import type { EvidenceItemInput, EvidenceSourceSnapshot } from "./contracts.ts";
import { EvidenceRepositoryError, type EvidenceItem, type EvidenceRepository } from "./repository.ts";

type EvidenceRow = typeof evidenceItems.$inferSelect;

function parseSnapshot(value: string): EvidenceSourceSnapshot | null {
  try {
    const parsed = JSON.parse(value) as EvidenceSourceSnapshot | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

function toItem(row: EvidenceRow): EvidenceItem {
  return {
    id: row.id,
    userId: row.userId,
    decisionId: row.decisionId,
    clientRequestId: row.clientRequestId,
    requestFingerprint: row.requestFingerprint,
    kind: row.kind as EvidenceItem["kind"],
    title: row.title,
    content: row.content,
    verification: row.verification as EvidenceItem["verification"],
    source: row.sourceType && row.sourceId ? { type: row.sourceType as NonNullable<EvidenceItem["source"]>["type"], id: row.sourceId } : null,
    sourceSnapshot: parseSnapshot(row.sourceSnapshot),
    createdAt: row.createdAt,
  };
}

export class D1EvidenceRepository implements EvidenceRepository {
  async findByClientRequest(userId: string, clientRequestId: string) {
    const [row] = await getDb().select().from(evidenceItems).where(and(
      eq(evidenceItems.userId, userId), eq(evidenceItems.clientRequestId, clientRequestId),
    )).limit(1);
    return row ? toItem(row) : null;
  }

  async create(userId: string, decisionId: number, input: EvidenceItemInput, requestFingerprint: string, sourceSnapshot: EvidenceSourceSnapshot | null) {
    await getDb().insert(evidenceItems).values({
      id: crypto.randomUUID(), userId, decisionId,
      clientRequestId: input.clientRequestId, requestFingerprint,
      kind: input.kind, title: input.title, content: input.content, verification: input.verification,
      sourceType: input.source?.type ?? null, sourceId: input.source?.id ?? null,
      sourceSnapshot: JSON.stringify(sourceSnapshot),
    }).onConflictDoNothing();
    const persisted = await this.findByClientRequest(userId, input.clientRequestId);
    if (!persisted || persisted.requestFingerprint !== requestFingerprint) throw new EvidenceRepositoryError("idempotency_conflict");
    return persisted;
  }

  async list(userId: string, decisionId: number) {
    const rows = await getDb().select().from(evidenceItems).where(and(
      eq(evidenceItems.userId, userId), eq(evidenceItems.decisionId, decisionId),
    )).orderBy(asc(evidenceItems.createdAt), asc(evidenceItems.id));
    return rows.map(toItem);
  }
}

