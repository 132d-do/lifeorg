import { z } from "zod";
import { FinalRecommendationSchema, MutationPreviewSchema } from "../agents/schemas.ts";

const EvidenceReferenceSchema = z.object({
  type: z.enum(["profile", "goal", "meeting", "decision"]),
  id: z.string().min(1).max(100),
}).strict();

export const MeetingCreateRequestSchema = z.object({
  clientRequestId: z.string().min(4).max(200),
  kind: z.enum(["daily", "weekly", "monthly", "decision"]),
  topic: z.string().min(3).max(1200),
  intake: z.object({
    message: z.string().min(1).max(3000),
    energy: z.number().int().min(1).max(10).optional(),
    mood: z.string().min(1).max(40).optional(),
  }).strict(),
  evidence: z.array(EvidenceReferenceSchema).min(2).max(20),
  lockedMutationIntent: z.object({
    type: z.literal("decision.reviewOutcome"),
    decisionId: z.number().int().positive(),
    outcome: z.string().min(1).max(3000),
    observedAt: z.string().min(1),
  }).strict().optional(),
}).strict();

export const MeetingTurnRequestSchema = z.object({
  message: z.string().min(1).max(5000),
  clientTurnId: z.string().min(6).max(200),
  retryOf: z.string().min(6).max(200).optional(),
}).strict();

export const MeetingDecisionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), idempotencyKey: z.string().min(6).max(200), mutationHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("edit"), idempotencyKey: z.string().min(6).max(200), recommendation: FinalRecommendationSchema }).strict(),
  z.object({ action: z.literal("reject"), idempotencyKey: z.string().min(6).max(200) }).strict(),
]);

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function canonicalHash(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function canonicalMutationHash(value: unknown) {
  const mutations = z.array(MutationPreviewSchema).max(3).parse(value);
  return canonicalHash(mutations);
}

export type MeetingCreateRequest = z.infer<typeof MeetingCreateRequestSchema>;
export type MeetingTurnRequest = z.infer<typeof MeetingTurnRequestSchema>;
export type MeetingDecisionRequest = z.infer<typeof MeetingDecisionRequestSchema>;
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
