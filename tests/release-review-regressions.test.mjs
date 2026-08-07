import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createCycleService } from "../lib/server/cycles/service.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("cycle review is blocked before the cycle local review date", async () => {
  const cycle = {
    id: "cycle-1", userId: "student", status: "active", activeSlot: "primary",
    reviewLocalDate: "2026-08-15", timeZone: "Asia/Shanghai",
  };
  let reviewCalled = false;
  const service = createCycleService({
    repository: {
      get: async () => cycle,
      review: async () => { reviewCalled = true; return cycle; },
    },
    ownsGoal: async () => true,
    ownsApprovedMeeting: async () => true,
    todayLocalDate: () => "2026-08-09",
  });
  await assert.rejects(
    service.review({ userId: "student" }, cycle.id, {
      clientRequestId: "review-too-early",
      observedEvidence: "尚未到第七天",
      actionCompletion: 2,
      recommendationAccuracy: null,
      decisionValue: 2,
    }),
    (error) => error.code === "review_not_due",
  );
  assert.equal(reviewCalled, false);
});

test("D1 meeting persistence keeps depth policy and learning-loop records", () => {
  const meetings = source("lib/server/meetings/d1-repository.ts");
  const cycles = source("lib/server/cycles/d1-repository.ts");
  assert.match(meetings, /policyInput:\s*\{\s*explicitDepth:\s*request\.explicitDepth/);
  assert.match(meetings, /INSERT INTO decision_forecasts/);
  assert.match(cycles, /INSERT INTO recommendation_evaluations/);
  assert.match(cycles, /forecastId/);
  assert.match(meetings, /rubricVersion/);
  assert.match(meetings, /effectiveModels/);
});

test("evaluation scoring is recommendation-content based and not variant baselined", () => {
  const runner = source("scripts/run-agent-evals.mjs");
  assert.doesNotMatch(runner, /const baseline = variant ===/);
  assert.match(runner, /scoreRecommendation/);
  assert.match(runner, /OPENAI_API_KEY/);
});

test("evaluation cases cover contradictory, missing, and risky preference evidence", () => {
  const cases = JSON.parse(source("evals/lifeorg/cases.json"));
  const ids = new Set(cases.map((item) => item.id));
  assert.ok(ids.has("contradictory-evidence"));
  assert.ok(ids.has("missing-evidence"));
  assert.ok(ids.has("risky-preference"));
});
