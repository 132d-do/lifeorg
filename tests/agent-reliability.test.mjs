import assert from "node:assert/strict";
import test from "node:test";

import { classifyMeetingMode } from "../lib/server/agents/meeting-policy.ts";
import { orchestrateMeetingTurnDetailed } from "../lib/server/agents/orchestrate.ts";
import { gateRecommendation } from "../lib/server/agents/quality-gate.ts";
import { MeetingDecisionRequestSchema } from "../lib/server/meetings/contracts.ts";

const records = [
  { id: "profile:self", type: "profile", title: "个人章程", summary: "不以持续透支换取短期成果", updatedAt: "2026-08-08" },
  { id: "goal:1", type: "goal", title: "论文投稿", summary: "讨论章节尚缺三段提纲", updatedAt: "2026-08-08" },
];

const recommendation = {
  recommendation: "未来七天只完成论文讨论章节三段提纲，并推迟新增申请任务。",
  evidence: [{ recordId: "profile:self", claim: "个人章程限制持续透支" }, { recordId: "goal:1", claim: "论文提纲是当前阻塞" }],
  deferredAlternative: "把新增申请任务推迟到下个周期复查",
  nextAction: "明天上午先写出第一段提纲的主题句和两条证据",
  nextActionWindowHours: 24,
  deadlineOrReviewAt: "2026-08-15",
  successCriterion: "文档中存在三段可由导师评审的提纲",
  stopOrAdjustCondition: "两次专注后仍无一段提纲则缩小为只完成第一段",
  confidence: "medium",
  unknowns: ["导师下一轮反馈时间"],
  disagreements: ["风险审计建议先确认导师时间，运营建议立即起草"],
  centralAssumption: "连续七天聚焦论文比并行准备新申请更能解除当前阻塞",
  forecast: {
    observableOutcome: "到 2026-08-15 文档中将出现三段含证据的讨论提纲",
    confidencePercent: 72,
    evidenceThatChangesAdvice: ["导师在 48 小时内要求优先提交申请材料"],
  },
  sevenDayValidationAction: "每天记录是否新增至少一个可评审段落，并在第七天比较结果",
  orchestrationVersion: "2026-08-08.v1",
  promptVersion: "lifeorg-agents-2026-08-08.v1",
  schemaVersion: "2026-08-08.v1",
  mutationPreview: [{
    type: "cycle.create",
    commitment: "完成论文讨论章节的三段提纲",
    startLocalDate: "2026-08-08",
    reviewLocalDate: "2026-08-15",
    timeZone: "Asia/Shanghai",
    successCriterion: "文档中存在三段可由导师评审的提纲",
    stopOrAdjustCondition: "两次专注后仍无一段提纲则缩小为只完成第一段",
  }],
};

test("meeting policy deterministically escalates consequential work and limits routine specialists", () => {
  assert.deepEqual(classifyMeetingMode({ kind: "daily", reversibility: "high", charterConflict: false, unknownCount: 0 }), {
    mode: "fast", specialistRoles: ["operations"], policyVersion: "2026-08-08.v1", reason: "routine_daily",
  });
  assert.deepEqual(classifyMeetingMode({ kind: "weekly", reversibility: "high", charterConflict: false, unknownCount: 1 }).specialistRoles, ["operations", "risk"]);
  assert.deepEqual(classifyMeetingMode({ kind: "monthly", reversibility: "high", charterConflict: false, unknownCount: 1 }).specialistRoles, ["strategy", "risk"]);
  for (const input of [
    { kind: "decision", reversibility: "high", charterConflict: false, unknownCount: 0 },
    { kind: "daily", reversibility: "low", charterConflict: false, unknownCount: 0 },
    { kind: "weekly", reversibility: "high", charterConflict: true, unknownCount: 0 },
    { kind: "monthly", reversibility: "high", charterConflict: false, unknownCount: 3 },
    { kind: "daily", reversibility: "high", charterConflict: false, unknownCount: 0, explicitDepth: "deep" },
  ]) {
    const policy = classifyMeetingMode(input);
    assert.equal(policy.mode, "deep");
    assert.deepEqual(policy.specialistRoles, ["strategy", "operations", "risk"]);
  }
});

test("deep specialists deliberate independently and synthesis receives every validated contribution", async () => {
  const seen = [];
  const result = await orchestrateMeetingTurnDetailed({
    kind: "decision", reversibility: "low", charterConflict: false, unknownCount: 1,
    records, topic: "是否暂停申请并优先推进论文", latestUserMessage: "这会影响本学期安排",
  }, async ({ phase, agent, input }) => {
    seen.push({ phase, agent: agent.name, input });
    if (phase === "completeness") return { sufficient: true, question: null, missingEvidence: [] };
    if (phase === "specialist") return {
      role: agent.name,
      conclusion: `${agent.name} 基于当前证据给出判断`,
      evidenceIds: ["profile:self", "goal:1"],
      uncertainty: "导师反馈时间未知",
      disagreements: [],
    };
    return recommendation;
  });
  const specialistRuns = seen.filter((item) => item.phase === "specialist");
  assert.equal(specialistRuns.length, 3);
  for (const run of specialistRuns) assert.equal("contributions" in run.input, false);
  const synthesis = seen.find((item) => item.phase === "synthesis");
  assert.equal(synthesis.input.contributions.length, 3);
  assert.equal(result.policy.mode, "deep");
  assert.equal(result.turn.status, "ready");
});

test("fast daily meeting runs only Operations plus the Chief", async () => {
  const seen = [];
  await orchestrateMeetingTurnDetailed({
    kind: "daily", reversibility: "high", charterConflict: false, unknownCount: 0,
    records, topic: "今天先做什么", latestUserMessage: "精力正常",
  }, async ({ phase, agent }) => {
    seen.push(`${phase}:${agent.name}`);
    if (phase === "completeness") return { sufficient: true, question: null, missingEvidence: [] };
    if (phase === "specialist") return { role: agent.name, conclusion: "先完成论文第一段", evidenceIds: ["goal:1"], uncertainty: "无", disagreements: [] };
    return recommendation;
  });
  assert.deepEqual(seen, [
    "completeness:chiefOfStaffAgent",
    "specialist:operationsOfficerAgent",
    "synthesis:chiefOfStaffAgent",
  ]);
});

test("quality gate requires a falsifiable forecast, change evidence, and an executable cycle", () => {
  assert.equal(gateRecommendation(recommendation, records).status, "ready");
  for (const candidate of [
    { ...recommendation, centralAssumption: undefined },
    { ...recommendation, forecast: { ...recommendation.forecast, observableOutcome: "事情会变好" } },
    { ...recommendation, forecast: { ...recommendation.forecast, evidenceThatChangesAdvice: [] } },
    { ...recommendation, sevenDayValidationAction: undefined },
    { ...recommendation, mutationPreview: [] },
  ]) {
    const result = gateRecommendation(candidate, records);
    assert.equal(result.status, "needs_input");
    assert.ok(result.missingEvidence.length > 0);
  }
});

test("approval explicitly records how the user adopts the Agent recommendation", () => {
  const approval = { action: "approve", idempotencyKey: "approve-with-mode", mutationHash: "a".repeat(64), adoptionMode: "self_directed" };
  assert.equal(MeetingDecisionRequestSchema.safeParse(approval).success, true);
  assert.equal(MeetingDecisionRequestSchema.safeParse({ ...approval, adoptionMode: undefined }).success, false);
});
