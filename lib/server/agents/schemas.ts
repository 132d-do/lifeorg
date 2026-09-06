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
  assessment: z.record(z.string(), z.string().min(3).max(1200)).optional(),
}).strict();

const finding = z.string().min(3).max(1200);
export const StrategyOutputSchema = AgentContributionSchema.extend({ role: z.literal("strategyArchitectAgent"), assessment: z.object({ charterFit: finding, alternatives: finding, pivotEvidence: finding }).strict() });
export const OperationsOutputSchema = AgentContributionSchema.extend({ role: z.literal("operationsOfficerAgent"), assessment: z.object({ capacity: finding, dependency: finding, firstAction: finding, defer: finding }).strict() });
export const RiskOutputSchema = AgentContributionSchema.extend({ role: z.literal("riskAuditorAgent"), assessment: z.object({ counterEvidence: finding, failureMode: finding, stopRule: finding, verification: finding }).strict() });

export const CompletenessSchema = z.object({
  sufficient: z.boolean(),
  question: z.string().min(1).nullable(),
  missingEvidence: z.array(z.string().min(1)).max(8),
}).strict();

export const MutationPreviewSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("goal.create"),
    title: z.string().min(1).max(300),
    domain: z.string().min(1).max(100),
    horizon: z.string().min(1).max(100),
    why: z.string().max(1200),
    targetDate: z.string().min(1).nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal("goal.update"),
    goalId: z.number().int().positive(),
    progress: z.number().int().min(0).max(100).optional(),
    status: z.enum(["active", "paused", "completed"]).optional(),
  }).strict().refine((value) => value.progress !== undefined || value.status !== undefined, "goal.update requires a change"),
  z.object({
    type: z.literal("decision.create"),
    title: z.string().min(1).max(300),
    options: z.array(z.string().min(1).max(300)).min(2).max(10),
    choice: z.string().min(1).max(500),
    reason: z.string().min(1).max(2000),
    reviewAt: z.string().min(1).nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal("decision.reviewOutcome"),
    decisionId: z.number().int().positive(),
    outcome: z.string().min(1).max(3000),
    observedAt: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal("cycle.create"),
    commitment: z.string().min(3).max(500),
    startLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reviewLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: z.string().min(1).max(100).default("Asia/Shanghai"),
    successCriterion: z.string().min(3).max(500),
    stopOrAdjustCondition: z.string().min(3).max(500),
    predictionId: z.string().min(1).max(200).optional(),
  }).strict().superRefine((value, context) => {
    const start = Date.parse(`${value.startLocalDate}T00:00:00Z`);
    const review = Date.parse(`${value.reviewLocalDate}T00:00:00Z`);
    const days = (review - start) / 86_400_000;
    if (!Number.isFinite(days) || days < 1 || days > 7) {
      context.addIssue({ code: "custom", path: ["reviewLocalDate"], message: "review must be 1-7 local days after start" });
    }
  }),
]);

export const FinalRecommendationSchema = z.object({
  existingCycle: z.object({ recordId: z.string().startsWith("cycle:"), updatedAt: z.string().min(1) }).strict().optional(),
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
  centralAssumption: z.string().min(3).max(500),
  forecast: z.object({
    observableOutcome: z.string().min(3).max(500),
    confidencePercent: z.number().int().min(0).max(100),
    evidenceThatChangesAdvice: z.array(z.string().min(3).max(300)).min(1).max(5),
  }).strict(),
  sevenDayValidationAction: z.string().min(3).max(500),
  adoptionMode: z.enum(["full", "partial", "self_directed"]).optional(),
  orchestrationVersion: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.literal("2026-08-08.v1"),
  mutationPreview: z.array(MutationPreviewSchema).max(3).optional(),
}).strict();

// Responses structured outputs require an object at the schema root.
// Enforce discriminant consistency locally as well as in the role instructions.
export const ChiefOutputSchema = z.object({
  mode: z.enum(["needs_input", "complete", "recommendation"]),
  sufficient: z.boolean(), question: z.string().min(1).nullable(),
  missingEvidence: z.array(z.string().min(1)).max(8),
  recommendation: FinalRecommendationSchema.nullable(),
}).strict().superRefine((value, context) => {
  const valid = value.mode === "needs_input"
    ? !value.sufficient && value.question !== null && value.missingEvidence.length > 0 && value.recommendation === null
    : value.sufficient && value.question === null && value.missingEvidence.length === 0 && (value.mode === "complete" ? value.recommendation === null : value.recommendation !== null);
  if (!valid) context.addIssue({ code: "custom", message: "Chief output fields must match mode" });
});

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
export type MutationPreview = z.infer<typeof MutationPreviewSchema>;
export type MeetingTurnResponse = z.infer<typeof MeetingTurnResponseSchema>;
