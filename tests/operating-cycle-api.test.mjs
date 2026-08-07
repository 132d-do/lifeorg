import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MutationPreviewSchema } from "../lib/server/agents/schemas.ts";
import { InMemoryCycleRepository } from "../lib/server/cycles/in-memory-repository.ts";
import {
  canonicalAdjustmentHash,
  createCycleService,
} from "../lib/server/cycles/service.ts";
import { canonicalMutationHash } from "../lib/server/meetings/contracts.ts";
import { createMeetingService, InMemoryMeetingRepository } from "../lib/server/meetings/service.ts";

const userA = { userId: "chatgpt:student-a@example.com", displayName: "Student A", source: "sites", sessionId: "session:a" };
const userB = { userId: "chatgpt:student-b@example.com", displayName: "Student B", source: "sites", sessionId: "session:b" };

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function request(clientRequestId = "cycle-paper-week") {
  return {
    clientRequestId,
    commitment: "完成论文讨论章节的三段提纲",
    startLocalDate: "2026-08-08",
    reviewLocalDate: "2026-08-15",
    timeZone: "Asia/Shanghai",
    successCriterion: "文档中存在三段可评审提纲",
    stopOrAdjustCondition: "两次专注后仍无提纲则缩小到一段",
    source: { type: "manual_goal", goalId: 1 },
  };
}

function cycleService(repository = new InMemoryCycleRepository()) {
  return {
    repository,
    service: createCycleService({
      repository,
      ownsGoal: async (userId, goalId) => userId === userA.userId && goalId === 1,
      ownsApprovedMeeting: async () => false,
      todayLocalDate: () => "2026-08-15",
    }),
  };
}

test("cycle service validates owned sources, idempotency, and one active commitment", async () => {
  const { service } = cycleService();
  const first = await service.create(userA, request());
  assert.equal(first.cycle.status, "active");
  assert.equal(first.created, true);
  const retry = await service.create(userA, request());
  assert.equal(retry.created, false);
  assert.equal(retry.cycle.id, first.cycle.id);
  await assert.rejects(service.get(userB, first.cycle.id), (error) => error.code === "not_found");
  await assert.rejects(service.create(userB, { ...request("unowned-goal"), source: { type: "manual_goal", goalId: 1 } }), (error) => error.code === "not_found");
  await assert.rejects(service.create(userA, request("second-active-cycle")), (error) => error.code === "active_cycle_exists");
});

test("check-ins are retry safe and adjustments require the exact canonical proposal hash", async () => {
  const { service } = cycleService();
  const { cycle } = await service.create(userA, request("cycle-check-in"));
  const checkIn = {
    clientRequestId: "check-in-2026-08-09",
    representedLocalDate: "2026-08-09",
    outcome: "blocked",
    energy: 3,
    note: "等待导师确认数据口径",
    evidence: "邮件已发送",
  };
  const first = await service.checkIn(userA, cycle.id, checkIn);
  assert.deepEqual(await service.checkIn(userA, cycle.id, checkIn), first);

  const changes = { commitment: "完成论文讨论章节的一段提纲" };
  await assert.rejects(service.adjust(userA, cycle.id, {
    clientRequestId: "adjust-cycle-wrong-hash",
    action: "approve",
    proposalHash: "0".repeat(64),
    ...changes,
  }), (error) => error.code === "proposal_mismatch");
  const proposalHash = await canonicalAdjustmentHash(cycle.id, changes);
  const adjusted = await service.adjust(userA, cycle.id, {
    clientRequestId: "adjust-cycle-exact-hash",
    action: "approve",
    proposalHash,
    ...changes,
  });
  assert.equal(adjusted.commitment, changes.commitment);
});

test("an adjustment cannot move review outside the original seven-day boundary", async () => {
  const { service } = cycleService();
  const { cycle } = await service.create(userA, request("bounded-adjustment-cycle"));
  const changes = { reviewLocalDate: "2026-08-16" };
  await assert.rejects(service.adjust(userA, cycle.id, {
    clientRequestId: "bounded-adjustment-request",
    action: "approve",
    proposalHash: await canonicalAdjustmentHash(cycle.id, changes),
    ...changes,
  }), (error) => error.code === "invalid_state");
});

test("review closes the active slot and permits the next governed cycle", async () => {
  const { service } = cycleService();
  const { cycle } = await service.create(userA, request("cycle-review"));
  const reviewed = await service.review(userA, cycle.id, {
    clientRequestId: "review-cycle-day-seven",
    observedEvidence: "已经形成三段提纲并完成一次导师沟通",
    actionCompletion: 5,
    recommendationAccuracy: null,
    decisionValue: 4,
  });
  assert.equal(reviewed.status, "reviewed");
  assert.equal(await service.current(userA), null);
  assert.equal((await service.create(userA, request("cycle-after-review"))).created, true);
});

test("approved meeting mutation creates the governed cycle exactly once", async () => {
  const records = [
    { id: "profile:self", type: "profile", title: "个人章程", summary: "保持可持续投入", updatedAt: "2026-08-08" },
    { id: "goal:1", type: "goal", title: "论文", summary: "当前最高优先级", updatedAt: "2026-08-08" },
  ];
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [userA.userId]: records } });
  const mutation = MutationPreviewSchema.parse({
    type: "cycle.create",
    commitment: "完成论文讨论章节的三段提纲",
    startLocalDate: "2026-08-08",
    reviewLocalDate: "2026-08-15",
    timeZone: "Asia/Shanghai",
    successCriterion: "文档中存在三段可评审提纲",
    stopOrAdjustCondition: "两次专注后仍无提纲则缩小到一段",
  });
  const recommendation = {
    recommendation: "未来七天只推进论文讨论章节，并暂停新增申请任务。",
    evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "goal:1", claim: "论文是当前最高优先级" }],
    deferredAlternative: "推迟新增申请任务",
    nextAction: "明天写出第一段提纲",
    nextActionWindowHours: 24,
    deadlineOrReviewAt: "2026-08-15",
    successCriterion: mutation.successCriterion,
    stopOrAdjustCondition: mutation.stopOrAdjustCondition,
    confidence: "medium",
    unknowns: [],
    disagreements: [],
    centralAssumption: "七天聚焦论文比新增申请任务更能解除当前阻塞",
    forecast: { observableOutcome: "到 2026-08-15 形成三段可评审提纲", confidencePercent: 72, evidenceThatChangesAdvice: ["导师要求在 48 小时内提交申请材料"] },
    sevenDayValidationAction: "每天记录新增的可评审段落",
    orchestrationVersion: "2026-08-08.v1",
    promptVersion: "lifeorg-agents-2026-08-08.v1",
    schemaVersion: "2026-08-08.v1",
    mutationPreview: [mutation],
  };
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const created = await service.create(userA, {
    clientRequestId: "meeting-for-cycle",
    kind: "weekly",
    topic: "确定未来七天唯一承诺",
    intake: { message: "精力有限，需要聚焦" },
    evidence: [{ type: "profile", id: "self" }, { type: "goal", id: "1" }],
  });
  await service.turn(userA, created.meetingId, { clientTurnId: "meeting-cycle-turn", message: "材料已经齐全" });
  const room = await service.get(userA, created.meetingId);
  const mutationHash = await canonicalMutationHash(room.recommendation.mutationPreview);
  await service.decide(userA, created.meetingId, { action: "approve", idempotencyKey: "approve-cycle", mutationHash, adoptionMode: "full" });
  const active = repository.currentCycle(userA.userId);
  assert.equal(active.commitment, mutation.commitment);
  assert.equal(active.source.type, "approved_meeting");
  assert.equal(Number.isInteger(active.source.meetingId) && active.source.meetingId > 0, true);
  assert.equal(active.source.mutationHash, mutationHash);
  assert.equal(repository.cycleCount(userA.userId), 1);
});

test("cycle public routes stay thin and use the trusted request context", () => {
  for (const route of [
    "app/api/cycles/route.ts",
    "app/api/cycles/current/route.ts",
    "app/api/cycles/[id]/route.ts",
    "app/api/cycles/[id]/check-ins/route.ts",
    "app/api/cycles/[id]/adjustments/route.ts",
    "app/api/cycles/[id]/review/route.ts",
  ]) {
    const body = source(route);
    assert.match(body, /cycleRequestContext\(request\)/);
    assert.match(body, /cycleApiError\(error\)/);
  }
  const boundary = source("lib/server/cycles/route-service.ts");
  assert.match(boundary, /resolveIdentity\(request/);
  assert.match(boundary, /D1CycleRepository/);
  assert.doesNotMatch(boundary, /OPENAI_API_KEY/);
});

test("D1 approval guard permits its own inserted cycle but rejects any other active cycle", () => {
  const repository = source("lib/server/meetings/d1-repository.ts");
  assert.match(repository, /active_slot='primary' AND id <> \?/);
  assert.match(repository, /cycleIdForApproval/);
});
