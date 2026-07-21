import { FinalRecommendationSchema, type EvidenceRecord, type MeetingTurnResponse } from "./schemas.ts";

const genericAdvice = /(继续努力|相信自己|保持积极|尽力而为|加油)/;

export function gateRecommendation(candidate: unknown, records: EvidenceRecord[]): MeetingTurnResponse {
  const parsed = FinalRecommendationSchema.safeParse(candidate);
  const missing = new Set<string>();
  if (!parsed.success) {
    for (const issue of parsed.error.issues) missing.add(issue.path.join(".") || "recommendation");
  } else {
    const validIds = new Set(records.map((record) => record.id));
    const citedIds = new Set(parsed.data.evidence.map((item) => item.recordId));
    if (citedIds.size < 2) missing.add("at_least_two_records");
    if ([...citedIds].some((id) => !validIds.has(id))) missing.add("valid_record_ids");
    if (genericAdvice.test(parsed.data.recommendation)) missing.add("specific_recommendation");
    const sentences = parsed.data.recommendation.split(/[。！？.!?]+/).filter((part) => part.trim().length > 0);
    if (sentences.length !== 1) missing.add("one_sentence_recommendation");
    if (missing.size === 0) return { status: "ready", recommendation: parsed.data };
  }
  return {
    status: "needs_input",
    question: "还缺少哪一条可核验的 LifeOrg 记录或现实约束，才能形成具体建议？",
    missingEvidence: [...missing],
  };
}
