import test from "node:test";
import assert from "node:assert/strict";

import {
  CycleAdjustmentRequestSchema,
  CycleCheckInRequestSchema,
  CycleCreateRequestSchema,
  CycleReviewRequestSchema,
} from "../lib/server/cycles/contracts.ts";
import {
  applyCycleEvent,
  initialCycleLifecycle,
} from "../lib/server/cycles/state-machine.ts";

test("cycle lifecycle accepts activation, adjustment, due review, and review", () => {
  let state = initialCycleLifecycle();
  state = applyCycleEvent(state, { type: "activate" });
  assert.deepEqual(state, { status: "active", activeSlot: "primary" });
  state = applyCycleEvent(state, { type: "adjust" });
  assert.deepEqual(state, { status: "adjusted", activeSlot: "primary" });
  state = applyCycleEvent(state, { type: "resume" });
  state = applyCycleEvent(state, { type: "review_due" });
  state = applyCycleEvent(state, { type: "review" });
  assert.deepEqual(state, { status: "reviewed", activeSlot: null });
});

test("cycle lifecycle rejects readiness and review shortcuts", () => {
  assert.throws(
    () => applyCycleEvent(initialCycleLifecycle(), { type: "review" }),
    /Invalid cycle transition/,
  );
  const active = applyCycleEvent(initialCycleLifecycle(), { type: "activate" });
  const stopped = applyCycleEvent(active, { type: "stop" });
  assert.deepEqual(stopped, { status: "stopped", activeSlot: null });
  assert.deepEqual(
    applyCycleEvent(stopped, { type: "review" }),
    { status: "reviewed", activeSlot: null },
  );
});

test("cycle creation accepts one-to-seven-day local reviews and strict owned sources", () => {
  const request = {
    clientRequestId: "cycle-paper-outline",
    commitment: "完成论文三段提纲",
    startLocalDate: "2026-08-08",
    reviewLocalDate: "2026-08-15",
    timeZone: "Asia/Shanghai",
    successCriterion: "文档中存在三段可评审提纲",
    stopOrAdjustCondition: "两次专注后仍无提纲则缩小到一段",
    source: { type: "manual_goal", goalId: 1 },
  };
  assert.equal(CycleCreateRequestSchema.parse(request).timeZone, "Asia/Shanghai");
  assert.equal(CycleCreateRequestSchema.safeParse({ ...request, reviewLocalDate: "2026-08-16" }).success, false);
  assert.equal(CycleCreateRequestSchema.safeParse({ ...request, reviewLocalDate: "2026-08-08" }).success, false);
  assert.equal(CycleCreateRequestSchema.safeParse({ ...request, unexpected: true }).success, false);
  assert.equal(CycleCreateRequestSchema.safeParse({ ...request, source: { type: "manual_goal", goalId: 0 } }).success, false);
});

test("daily check-in preserves represented day and accepts only six governance outcomes", () => {
  const checkIn = CycleCheckInRequestSchema.parse({
    clientRequestId: "check-in-2026-08-09",
    representedLocalDate: "2026-08-09",
    outcome: "blocked",
    energy: 3,
    note: "等待导师确认",
  });
  assert.equal(checkIn.representedLocalDate, "2026-08-09");
  assert.equal(checkIn.evidence, "");
  assert.equal(CycleCheckInRequestSchema.safeParse({ ...checkIn, outcome: "failed" }).success, false);
});

test("adjustment and review contracts reject ambiguous or incomplete writes", () => {
  const hash = "a".repeat(64);
  assert.equal(CycleAdjustmentRequestSchema.safeParse({
    clientRequestId: "adjust-paper-outline",
    action: "approve",
    proposalHash: hash,
    commitment: "先完成一段提纲",
  }).success, true);
  assert.equal(CycleAdjustmentRequestSchema.safeParse({
    clientRequestId: "adjust-without-change",
    action: "approve",
    proposalHash: hash,
  }).success, false);
  assert.equal(CycleAdjustmentRequestSchema.safeParse({
    clientRequestId: "reject-proposal",
    action: "reject",
    proposalHash: hash,
  }).success, true);
  assert.equal(CycleReviewRequestSchema.safeParse({
    clientRequestId: "review-paper-outline",
    observedEvidence: "已形成三段提纲并获得同伴反馈",
    actionCompletion: 5,
    recommendationAccuracy: null,
    decisionValue: 4,
  }).success, true);
});
