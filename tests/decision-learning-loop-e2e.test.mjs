import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { orchestrateMeetingTurnDetailed } from "../lib/server/agents/orchestrate.ts";
import { InMemoryCycleRepository } from "../lib/server/cycles/in-memory-repository.ts";
import { createCycleService } from "../lib/server/cycles/service.ts";
import { canonicalMutationHash } from "../lib/server/meetings/contracts.ts";
import { createMeetingService, InMemoryMeetingRepository } from "../lib/server/meetings/service.ts";

const user = { userId: "chatgpt:journey-student.invalid", displayName: "研究生", source: "sites", sessionId: "session:journey" };
const records = [
  { id: "profile:self", type: "profile", title: "个人经营章程", summary: "优先可持续研究与健康", updatedAt: "2026-08-08" },
  { id: "goal:1", type: "goal", title: "完成论文提纲", summary: "七天内形成三段可评审提纲", updatedAt: "2026-08-08" },
];
const cycleMutation = {
  type: "cycle.create", commitment: "完成论文讨论部分三段提纲", startLocalDate: "2026-08-08", reviewLocalDate: "2026-08-15", timeZone: "Asia/Shanghai",
  successCriterion: "文档中存在三段可评审提纲", stopOrAdjustCondition: "两次专注无进展则缩小为一段", predictionId: "prediction:paper-outline",
};
const recommendation = {
  recommendation: "未来七天只推进论文讨论提纲，并推迟新增申请支线。",
  evidence: [{ recordId: "profile:self", claim: "章程要求保持可持续投入" }, { recordId: "goal:1", claim: "论文提纲是当前有期限的核心结果" }],
  deferredAlternative: "新增申请支线推迟到周期复查后", nextAction: "24 小时内写出第一段三条要点", nextActionWindowHours: 24,
  deadlineOrReviewAt: "2026-08-15", successCriterion: cycleMutation.successCriterion, stopOrAdjustCondition: cycleMutation.stopOrAdjustCondition,
  confidence: "medium", unknowns: ["导师反馈时间"], disagreements: ["风险角色建议先确认反馈窗口"],
  centralAssumption: "七日单点投入足以形成可评审提纲", forecast: { observableOutcome: "第七天至少有三段提纲", confidencePercent: 72, evidenceThatChangesAdvice: ["导师在 48 小时内要求提交另一项材料"] },
  sevenDayValidationAction: "每天记录新增段落和阻塞", orchestrationVersion: "2026-08-08.v1", promptVersion: "lifeorg-agents-2026-08-08.v1", schemaVersion: "2026-08-08.v1",
  mutationPreview: [cycleMutation],
};

function contribution(agentName) {
  const roleEvidence = agentName === "riskAuditorAgent" ? "profile:self" : "goal:1";
  return { role: agentName, conclusion: `${agentName} 的独立结论`, evidenceIds: [roleEvidence], uncertainty: "导师反馈时间未知", disagreements: [] };
}

test("deep decision flows from independent specialists through approval, check-ins, and immutable day-seven review", async () => {
  const specialistInputs = [];
  const meetingRepository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records } });
  const meetingService = createMeetingService({ repository: meetingRepository, deliberate: async (packet) => orchestrateMeetingTurnDetailed(packet, async ({ phase, agent, input }) => {
    if (phase === "completeness") return { sufficient: true, question: null, missingEvidence: [] };
    if (phase === "specialist") { specialistInputs.push(structuredClone(input)); return contribution(agent.name); }
    return recommendation;
  }) });
  const created = await meetingService.create(user, { clientRequestId: "journey-deep-meeting", kind: "decision", topic: "未来七天如何处理论文与申请冲突？", intake: { message: "只能保留一个核心结果", energy: 6, mood: "焦虑" }, evidence: [{ type: "profile", id: "self" }, { type: "goal", id: "1" }], explicitDepth: "deep", reversibility: "low", charterConflict: false, unknownCount: 2 });
  const ready = await meetingService.turn(user, created.meetingId, { clientTurnId: "journey-ready-turn", message: "材料齐全，请给出可验证建议" });
  assert.equal(ready.status, "ready");
  assert.equal(specialistInputs.length, 3);
  assert.ok(specialistInputs.every((input) => !("contributions" in input)));
  const immutableRecommendation = structuredClone(ready.recommendation);
  const mutationHash = await canonicalMutationHash(ready.recommendation.mutationPreview);
  await meetingService.decide(user, created.meetingId, { action: "approve", idempotencyKey: "journey-approval", mutationHash, adoptionMode: "full" });
  assert.equal(meetingRepository.currentCycle(user.userId).source.type, "approved_meeting");

  const cycleRepository = new InMemoryCycleRepository();
  const cycleService = createCycleService({ repository: cycleRepository, ownsGoal: async () => false, ownsApprovedMeeting: async (_userId, meetingId, hash) => meetingId === meetingRepository.currentCycle(user.userId).source.meetingId && hash === mutationHash, todayLocalDate: () => cycleMutation.reviewLocalDate });
  const { cycle } = await cycleService.create(user, {
    clientRequestId: "journey-approved-cycle", commitment: cycleMutation.commitment,
    startLocalDate: cycleMutation.startLocalDate, reviewLocalDate: cycleMutation.reviewLocalDate,
    timeZone: cycleMutation.timeZone, successCriterion: cycleMutation.successCriterion,
    stopOrAdjustCondition: cycleMutation.stopOrAdjustCondition, source: meetingRepository.currentCycle(user.userId).source,
  });
  for (const [index, outcome] of ["blocked", "reduced", "progressed", "completed"].entries()) {
    await cycleService.checkIn(user, cycle.id, { clientRequestId: `journey-check-${index}`, representedLocalDate: `2026-08-${String(9 + index).padStart(2, "0")}`, outcome, energy: 4 + index, note: `第 ${index + 1} 次事实记录`, evidence: `evidence-${index}` });
  }
  await cycleService.review(user, cycle.id, { clientRequestId: "journey-day-seven-review", observedEvidence: "形成三段提纲，其中两段已获同伴反馈", actionCompletion: 4, recommendationAccuracy: 4, decisionValue: 5 });
  const detail = await cycleService.get(user, cycle.id);
  assert.deepEqual(detail.events.map((event) => event.type), ["activated", "checked_in", "checked_in", "checked_in", "checked_in", "reviewed"]);
  assert.equal((await cycleService.current(user)), null);
  assert.deepEqual((await meetingService.get(user, created.meetingId)).recommendation, immutableRecommendation);
});

test("structured offline mode can complete a manual cycle without fabricated Agent speech", async () => {
  const repository = new InMemoryCycleRepository();
  const service = createCycleService({ repository, ownsGoal: async (_userId, id) => id === 1, ownsApprovedMeeting: async () => false, todayLocalDate: () => "2026-08-12" });
  const { cycle } = await service.create(user, { clientRequestId: "offline-manual-cycle", commitment: "收集三条导师选择事实", startLocalDate: "2026-08-08", reviewLocalDate: "2026-08-12", timeZone: "Asia/Shanghai", successCriterion: "三条事实均有来源", stopOrAdjustCondition: "联系两人仍无回复则更换信息源", source: { type: "manual_goal", goalId: 1 } });
  await service.checkIn(user, cycle.id, { clientRequestId: "offline-check", representedLocalDate: "2026-08-09", outcome: "progressed", energy: 5, note: "已联系学长", evidence: "发送记录" });
  await service.review(user, cycle.id, { clientRequestId: "offline-review", observedEvidence: "获得三条带来源事实", actionCompletion: 5, recommendationAccuracy: null, decisionValue: 4 });
  assert.equal((await service.get(user, cycle.id)).cycle.status, "reviewed");
});

test("release documentation and route smoke include the complete governed journey", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const smoke = readFileSync(new URL("./worker-route-smoke.mjs", import.meta.url), "utf8");
  assert.match(readme, /七日经营周期/);
  assert.match(readme, /fast|快速/);
  assert.match(readme, /deep|深度/);
  assert.match(readme, /run-agent-evals/);
  for (const route of ["/cycles", "/cycles/fixture-cycle", "/cycles/fixture-cycle/check-in", "/cycles/fixture-cycle/review"]) assert.ok(smoke.includes(route));
});
