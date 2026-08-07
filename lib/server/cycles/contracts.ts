import { z } from "zod";

export const CycleOutcomeSchema = z.enum([
  "completed",
  "progressed",
  "blocked",
  "reduced",
  "rescheduled",
  "stopped",
]);

export const CycleSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("approved_meeting"),
    meetingId: z.number().int().positive(),
    mutationHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  z.object({
    type: z.literal("manual_goal"),
    goalId: z.number().int().positive(),
  }).strict(),
]);

const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function localDayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export const CycleCreateRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  commitment: z.string().min(3).max(500),
  startLocalDate: LocalDateSchema,
  reviewLocalDate: LocalDateSchema,
  timeZone: z.string().min(1).max(100).default("Asia/Shanghai"),
  successCriterion: z.string().min(3).max(500),
  stopOrAdjustCondition: z.string().min(3).max(500),
  source: CycleSourceSchema,
}).strict().superRefine((value, context) => {
  const days = localDayNumber(value.reviewLocalDate) - localDayNumber(value.startLocalDate);
  if (!Number.isFinite(days) || days < 1 || days > 7) {
    context.addIssue({
      code: "custom",
      path: ["reviewLocalDate"],
      message: "review must be 1-7 local days after start",
    });
  }
});

export const CycleCheckInRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  representedLocalDate: LocalDateSchema,
  outcome: CycleOutcomeSchema,
  energy: z.number().int().min(1).max(10).optional(),
  note: z.string().max(1200).default(""),
  evidence: z.string().max(2000).default(""),
}).strict();

export const CycleAdjustmentRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  action: z.enum(["approve", "reject"]),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
  commitment: z.string().min(3).max(500).optional(),
  reviewLocalDate: LocalDateSchema.optional(),
  successCriterion: z.string().min(3).max(500).optional(),
  stopOrAdjustCondition: z.string().min(3).max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "approve" && value.commitment === undefined && value.reviewLocalDate === undefined
    && value.successCriterion === undefined && value.stopOrAdjustCondition === undefined) {
    context.addIssue({
      code: "custom",
      path: ["action"],
      message: "approved adjustment requires at least one change",
    });
  }
  if (value.action === "reject" && (value.commitment !== undefined || value.reviewLocalDate !== undefined
    || value.successCriterion !== undefined || value.stopOrAdjustCondition !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["action"],
      message: "rejected adjustment cannot contain changes",
    });
  }
});

export const CycleReviewRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  observedEvidence: z.string().min(1).max(3000),
  actionCompletion: z.number().int().min(1).max(5),
  recommendationAccuracy: z.number().int().min(1).max(5).nullable(),
  decisionValue: z.number().int().min(1).max(5),
}).strict();

export type CycleCreateRequest = z.infer<typeof CycleCreateRequestSchema>;
export type CycleCheckInRequest = z.infer<typeof CycleCheckInRequestSchema>;
export type CycleAdjustmentRequest = z.infer<typeof CycleAdjustmentRequestSchema>;
export type CycleReviewRequest = z.infer<typeof CycleReviewRequestSchema>;
export type CycleOutcome = z.infer<typeof CycleOutcomeSchema>;

