import assert from "node:assert/strict";
import test from "node:test";

import {
  MeetingDecisionRequestSchema,
  MeetingCreateRequestSchema,
  canonicalMutationHash,
} from "../lib/server/meetings/contracts.ts";
import {
  applyMeetingEvent,
  initialMeetingLifecycle,
} from "../lib/server/meetings/state-machine.ts";
import {
  InMemoryMeetingRepository,
  createMeetingService,
} from "../lib/server/meetings/service.ts";

const userA = { userId: "chatgpt:a@example.com", displayName: "A", source: "sites", sessionId: "session:test-a" };
const userB = { userId: "chatgpt:b@example.com", displayName: "B", source: "sites", sessionId: "session:test-b" };
const evidence = [
  { id: "goal:12", type: "goal", title: "论文修改", summary: "本周完成讨论部分", updatedAt: "2026-07-18T00:00:00Z" },
  { id: "decision:7", type: "decision", title: "减少并行项目", summary: "本周只保留论文和运动", updatedAt: "2026-07-17T00:00:00Z" },
];
const recommendation = {
  recommendation: "本周只推进论文讨论部分，并把新项目推迟到下周复查。",
  evidence: [
    { recordId: "goal:12", claim: "论文修改是当前周期目标" },
    { recordId: "decision:7", claim: "已决定减少并行项目" },
  ],
  deferredAlternative: "推迟启动新的数据分析项目。",
  nextAction: "在明天 18:00 前打开论文并完成讨论部分的三段提纲。",
  nextActionWindowHours: 24,
  deadlineOrReviewAt: "2026-07-22T18:00:00+08:00",
  successCriterion: "讨论部分形成不少于三段且每段包含一个文献依据。",
  stopOrAdjustCondition: "若两次专注时段后仍无法形成提纲，则缩小到只重写第一段并重新评估。",
  confidence: "medium",
  unknowns: ["导师下一轮反馈时间"],
  disagreements: ["运营建议先排期，审计建议先确认导师预期"],
  mutationPreview: [{ type: "goal.update", goalId: 12, progress: 70 }],
};

function createRequest(clientRequestId = "req-1") {
  return {
    clientRequestId,
    kind: "weekly",
    topic: "如何安排本周？",
    intake: { message: "可投入 12 小时", energy: 7, mood: "平稳" },
    evidence: [{ type: "goal", id: "12" }, { type: "decision", id: "7" }],
  };
}

test("meeting lifecycle forbids readiness and approval shortcuts", () => {
  const initial = initialMeetingLifecycle();
  assert.deepEqual(initial, { status: "draft", phase: "intake", approvalStatus: "pending" });
  assert.throws(() => applyMeetingEvent(initial, { type: "approve" }), /ready/i);
  const asking = applyMeetingEvent(initial, { type: "needs_input" });
  assert.deepEqual(asking, { status: "active", phase: "intake", approvalStatus: "pending" });
  const deliberating = applyMeetingEvent(asking, { type: "deliberating" });
  assert.equal(deliberating.phase, "deliberating");
  const ready = applyMeetingEvent(deliberating, { type: "ready" });
  assert.equal(ready.status, "ready");
  assert.equal(applyMeetingEvent(ready, { type: "reject" }).status, "draft");
  assert.equal(applyMeetingEvent(ready, { type: "approve" }).approvalStatus, "approved");
});

test("create contract is strict and approval accepts only governed actions", () => {
  assert.equal(MeetingCreateRequestSchema.safeParse(createRequest()).success, true);
  assert.equal(MeetingCreateRequestSchema.safeParse({ ...createRequest(), userId: userB.userId }).success, false);
  assert.equal(MeetingDecisionRequestSchema.safeParse({ action: "approve", idempotencyKey: "approval-1", mutationHash: "a".repeat(64) }).success, true);
  assert.equal(MeetingDecisionRequestSchema.safeParse({ action: "force", idempotencyKey: "approval-1" }).success, false);
});

test("canonical mutation hash is stable across key ordering and changes with payload", async () => {
  const left = await canonicalMutationHash([{ type: "goal.update", goalId: 12, progress: 70 }]);
  const reordered = await canonicalMutationHash([{ progress: 70, goalId: 12, type: "goal.update" }]);
  const changed = await canonicalMutationHash([{ type: "goal.update", goalId: 12, progress: 71 }]);
  assert.equal(left, reordered);
  assert.notEqual(left, changed);
  assert.match(left, /^[a-f0-9]{64}$/);
});

test("meeting creation is owned and idempotent, conflicting reuse is rejected", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [userA.userId]: evidence } });
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "needs_input", question: "还缺什么？", missingEvidence: ["capacity"] }) });
  const first = await service.create(userA, createRequest());
  const retry = await service.create(userA, createRequest());
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.meetingId, first.meetingId);
  await assert.rejects(service.create(userA, { ...createRequest(), topic: "另一个问题" }), (error) => error.code === "idempotency_conflict");
  await assert.rejects(service.get(userB, first.meetingId), (error) => error.code === "not_found");
});

test("one-question intake persists turns and only deliberates after evidence is sufficient", async () => {
  let calls = 0;
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [userA.userId]: evidence } });
  const service = createMeetingService({ repository, deliberate: async (_packet, message) => {
    calls += 1;
    if (!message.includes("12 小时")) return { status: "needs_input", question: "本周真实可投入多少小时？", missingEvidence: ["capacity"] };
    return { status: "deliberating", contributions: [
      { role: "strategyArchitectAgent", conclusion: "聚焦论文", evidenceIds: ["goal:12"], uncertainty: "反馈未知", disagreements: [] },
      { role: "operationsOfficerAgent", conclusion: "先排两个专注块", evidenceIds: ["goal:12"], uncertainty: "排期未知", disagreements: [] },
      { role: "riskAuditorAgent", conclusion: "保留停止条件", evidenceIds: ["decision:7"], uncertainty: "阈值未知", disagreements: [] },
    ] };
  }});
  const { meetingId } = await service.create(userA, { ...createRequest(), intake: { message: "帮我决定", energy: 7, mood: "平稳" } });
  const first = await service.turn(userA, meetingId, { message: "帮我决定", clientTurnId: "turn-1" });
  assert.equal(first.status, "needs_input");
  assert.equal(first.question, "本周真实可投入多少小时？");
  await assert.rejects(service.turn(userA, meetingId, { message: "篡改后的重复轮次", clientTurnId: "turn-1" }), (error) => error.code === "idempotency_conflict");
  const second = await service.turn(userA, meetingId, { message: "本周可投入 12 小时", clientTurnId: "turn-2" });
  assert.equal(second.status, "deliberating");
  assert.equal(second.contributions.length, 3);
  const room = await service.get(userA, meetingId);
  assert.equal(room.messages.filter((item) => item.role === "user").length, 2);
  assert.equal(room.messages.filter((item) => item.role.endsWith("Agent")).length, 3);
  assert.equal(calls, 2);
});

test("ready recommendation cannot mutate domain records until exact approval", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [userA.userId]: evidence }, goalsByUser: { [userA.userId]: [{ id: 12, progress: 46 }] } });
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const { meetingId } = await service.create(userA, createRequest());
  const ready = await service.turn(userA, meetingId, { message: "可投入 12 小时", clientTurnId: "turn-ready" });
  assert.equal(ready.status, "ready");
  assert.equal(repository.goal(userA.userId, 12).progress, 46);
  const hash = await canonicalMutationHash(recommendation.mutationPreview);
  await assert.rejects(service.decide(userA, meetingId, { action: "approve", idempotencyKey: "approval-1", mutationHash: "0".repeat(64) }), (error) => error.code === "mutation_mismatch");
  assert.equal(repository.goal(userA.userId, 12).progress, 46);
  const approved = await service.decide(userA, meetingId, { action: "approve", idempotencyKey: "approval-1", mutationHash: hash });
  const retry = await service.decide(userA, meetingId, { action: "approve", idempotencyKey: "approval-1", mutationHash: hash });
  assert.equal(approved.status, "approved");
  assert.deepEqual(retry, approved);
  assert.equal(repository.goal(userA.userId, 12).progress, 70);
  assert.equal(repository.approvalCount(userA.userId, meetingId), 1);
  await assert.rejects(service.decide(userA, meetingId, { action: "reject", idempotencyKey: "approval-1" }), (error) => error.code === "idempotency_conflict");
});

test("edit and reject never commit, and reject returns the meeting to draft", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [userA.userId]: evidence }, goalsByUser: { [userA.userId]: [{ id: 12, progress: 46 }] } });
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const { meetingId } = await service.create(userA, createRequest());
  await service.turn(userA, meetingId, { message: "可投入 12 小时", clientTurnId: "turn-ready" });
  const edited = await service.decide(userA, meetingId, { action: "edit", idempotencyKey: "edit-1", recommendation: { ...recommendation, nextAction: "明天先写第一段提纲。" } });
  assert.equal(edited.status, "ready");
  assert.equal(repository.goal(userA.userId, 12).progress, 46);
  const rejected = await service.decide(userA, meetingId, { action: "reject", idempotencyKey: "reject-1" });
  assert.equal(rejected.status, "draft");
  assert.equal(repository.goal(userA.userId, 12).progress, 46);
});

test("decision outcome review appends immutable snapshot without rewriting the decision", async () => {
  const original = { id: 7, title: "减少并行项目", choice: "只保留论文和运动", reason: "保护可持续节奏", options: "[]", status: "review", reviewAt: "2026-07-20" };
  const reviewRecommendation = { ...recommendation, mutationPreview: [{ type: "decision.reviewOutcome", decisionId: 7, outcome: "论文推进且运动完成三次", observedAt: "2026-07-20" }] };
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [userA.userId]: evidence }, decisionsByUser: { [userA.userId]: [original] } });
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation: reviewRecommendation }) });
  const { meetingId } = await service.create(userA, createRequest("review-create"));
  await service.turn(userA, meetingId, { message: "记录实际结果", clientTurnId: "review-turn" });
  const hash = await canonicalMutationHash(reviewRecommendation.mutationPreview);
  await service.decide(userA, meetingId, { action: "approve", idempotencyKey: "review-approval", mutationHash: hash });
  assert.deepEqual(repository.decision(userA.userId, 7), original);
  const reviews = repository.decisionReviews(userA.userId, 7);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].decisionSnapshot.reason, original.reason);
  assert.equal(reviews[0].outcome, "论文推进且运动完成三次");
});

test("provider outage is explicit structured offline and retry can resume", async () => {
  let fail = true;
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [userA.userId]: evidence } });
  const service = createMeetingService({ repository, deliberate: async () => {
    if (fail) throw Object.assign(new Error("provider timeout"), { code: "provider_timeout" });
    return { status: "needs_input", question: "请确认截止时间？", missingEvidence: ["deadline"] };
  }});
  const { meetingId } = await service.create(userA, createRequest());
  const offline = await service.turn(userA, meetingId, { message: "继续", clientTurnId: "outage-turn" });
  assert.deepEqual(offline, { status: "offline", mode: "structured_offline", reason: "provider_timeout", canRetry: true });
  fail = false;
  const resumed = await service.turn(userA, meetingId, { message: "继续", clientTurnId: "outage-retry", retryOf: "outage-turn" });
  assert.equal(resumed.status, "needs_input");
});
