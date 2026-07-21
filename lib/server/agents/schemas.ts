import { z } from "zod";

export const EvidenceRecordSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  updatedAt: z.string(),
}).strict();

export const AgentContributionSchema = z.object({
  role: z.string().min(1),
  conclusion: z.string().min(1).max(1200),
  evidenceIds: z.array(z.string().min(1)).min(1).max(8),
  uncertainty: z.string().max(500),
  disagreements: z.array(z.string().max(500)).max(5),
}).strict();

export const CompletenessSchema = z.object({
  sufficient: z.boolean(),
  question: z.string().min(1).nullable(),
  missingEvidence: z.array(z.string().min(1)).max(8),
}).strict();

export const FinalRecommendationSchema = z.object({
  recommendation: z.string().min(8).max(240),
  evidence: z.array(z.object({
    recordId: z.string().min(1),
    claim: z.string().min(1).max(300),
  }).strict()).min(2).max(8),
  deferredAlternative: z.string().min(1).max(500),
  nextAction: z.string().min(1).max(500),
  nextActionWindowHours: z.number().int().min(24).max(48),
  deadlineOrReviewAt: z.string().min(1),
  successCriterion: z.string().min(1).max(500),
  stopOrAdjustCondition: z.string().min(1).max(500),
  confidence: z.enum(["low", "medium", "high"]),
  unknowns: z.array(z.string().min(1).max(300)).max(8),
  disagreements: z.array(z.string().min(1).max(500)).max(8),
}).strict();

export const ChiefOutputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("needs_input"),
    sufficient: z.literal(false),
    question: z.string().min(1),
    missingEvidence: z.array(z.string().min(1)).min(1).max(8),
    recommendation: z.null(),
  }).strict(),
  z.object({
    mode: z.literal("complete"),
    sufficient: z.literal(true),
    question: z.null(),
    missingEvidence: z.array(z.never()).max(0),
    recommendation: z.null(),
  }).strict(),
  z.object({
    mode: z.literal("recommendation"),
    sufficient: z.literal(true),
    question: z.null(),
    missingEvidence: z.array(z.never()).max(0),
    recommendation: FinalRecommendationSchema,
  }).strict(),
]);

export const MeetingTurnResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("needs_input"),
    question: z.string().min(1),
    missingEvidence: z.array(z.string().min(1)),
  }).strict(),
  z.object({
    status: z.literal("deliberating"),
    contributions: z.array(AgentContributionSchema).min(1).max(3),
  }).strict(),
  z.object({
    status: z.literal("ready"),
    recommendation: FinalRecommendationSchema,
  }).strict(),
]);

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export type AgentContribution = z.infer<typeof AgentContributionSchema>;
export type FinalRecommendation = z.infer<typeof FinalRecommendationSchema>;
export type MeetingTurnResponse = z.infer<typeof MeetingTurnResponseSchema>;
