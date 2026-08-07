import { z } from "zod";

export const EvidenceKindSchema = z.enum([
  "fact",
  "preference",
  "assumption",
  "unknown",
  "alternative",
  "historical_analogue",
]);

export const EvidenceVerificationSchema = z.enum([
  "record_backed",
  "user_confirmed",
  "unverified",
]);

export const EvidenceSourceSchema = z.object({
  type: z.enum(["profile", "goal", "meeting", "decision", "cycle", "review"]),
  id: z.string().min(1).max(200),
}).strict();

export const EvidenceItemInputSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  kind: EvidenceKindSchema,
  title: z.string().min(3).max(300),
  content: z.string().min(3).max(3000),
  verification: EvidenceVerificationSchema,
  source: EvidenceSourceSchema.nullable().default(null),
}).strict().superRefine((value, context) => {
  if (value.verification === "record_backed" && !value.source) {
    context.addIssue({ code: "custom", path: ["source"], message: "record-backed evidence requires a source" });
  }
  if (value.verification === "user_confirmed" && (value.kind !== "preference" || value.source !== null)) {
    context.addIssue({ code: "custom", path: ["verification"], message: "only a source-free preference may be user confirmed" });
  }
});

export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type EvidenceItemInput = z.infer<typeof EvidenceItemInputSchema>;

export type EvidenceSourceSnapshot = {
  type: EvidenceSource["type"];
  id: string;
  title: string;
  summary: string;
  updatedAt: string;
};

