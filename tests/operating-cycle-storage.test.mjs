import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { InMemoryCycleRepository } from "../lib/server/cycles/in-memory-repository.ts";

const userA = "student-a@example.com";
const userB = "student-b@example.com";

function createRequest(clientRequestId, commitment = "完成论文三段提纲") {
  return {
    clientRequestId,
    commitment,
    startLocalDate: "2026-08-08",
    reviewLocalDate: "2026-08-15",
    timeZone: "Asia/Shanghai",
    successCriterion: "文档中存在三段可评审提纲",
    stopOrAdjustCondition: "两次专注后仍无提纲则缩小到一段",
    source: { type: "manual_goal", goalId: 1 },
  };
}

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("cycle creation is idempotent and conflicting key reuse is rejected", async () => {
  const repository = new InMemoryCycleRepository();
  const first = await repository.createCycle(userA, createRequest("create-paper-cycle"));
  const retry = await repository.createCycle(userA, createRequest("create-paper-cycle"));
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.deepEqual(retry.cycle, first.cycle);
  await assert.rejects(
    repository.createCycle(userA, createRequest("create-paper-cycle", "准备夏令营材料")),
    (error) => error.code === "idempotency_conflict",
  );
});

test("concurrent creation leaves one active primary cycle", async () => {
  const repository = new InMemoryCycleRepository();
  const results = await Promise.allSettled([
    repository.createCycle(userA, createRequest("first-cycle")),
    repository.createCycle(userA, createRequest("second-cycle", "准备导师联系材料")),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected" && item.reason.code === "active_cycle_exists").length, 1);
  assert.equal(await repository.countActive(userA), 1);
});

test("cycle reads are user isolated", async () => {
  const repository = new InMemoryCycleRepository();
  const { cycle } = await repository.createCycle(userA, createRequest("owned-cycle"));
  assert.equal((await repository.get(userA, cycle.id))?.id, cycle.id);
  assert.equal(await repository.get(userB, cycle.id), null);
  assert.equal(await repository.getCurrent(userB), null);
  assert.deepEqual(await repository.list(userB), []);
});

test("check-in retry returns the persisted event without duplication", async () => {
  const repository = new InMemoryCycleRepository();
  const { cycle } = await repository.createCycle(userA, createRequest("check-in-cycle"));
  const request = {
    clientRequestId: "check-in-day-one",
    representedLocalDate: "2026-08-09",
    outcome: "blocked",
    energy: 3,
    note: "等待导师确认",
    evidence: "",
  };
  const first = await repository.appendCheckIn(userA, cycle.id, request);
  const retry = await repository.appendCheckIn(userA, cycle.id, request);
  assert.deepEqual(retry, first);
  assert.equal((await repository.listEvents(userA, cycle.id)).length, 2);
  await assert.rejects(
    repository.appendCheckIn(userA, cycle.id, { ...request, outcome: "progressed" }),
    (error) => error.code === "idempotency_conflict",
  );
});

test("review atomically clears the active slot and preserves append-only history", async () => {
  const repository = new InMemoryCycleRepository();
  const { cycle } = await repository.createCycle(userA, createRequest("review-cycle"));
  const before = structuredClone(cycle);
  const reviewed = await repository.review(userA, cycle.id, {
    clientRequestId: "review-day-seven",
    observedEvidence: "已经形成三段提纲",
    actionCompletion: 5,
    recommendationAccuracy: null,
    decisionValue: 4,
  });
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.activeSlot, null);
  assert.equal(await repository.getCurrent(userA), null);
  assert.equal(before.commitment, reviewed.commitment);
  assert.deepEqual((await repository.listEvents(userA, cycle.id)).map((event) => event.type), ["activated", "reviewed"]);
  const next = await repository.createCycle(userA, createRequest("next-cycle", "准备导师联系材料"));
  assert.equal(next.cycle.activeSlot, "primary");
});

test("schema and migration enforce additive owned cycle storage", () => {
  const schema = source("db/schema.ts");
  const migration = source("drizzle/0005_seven_day_decision_learning_loop.sql");
  for (const name of ["operating_cycles", "cycle_events", "operating_cycles_user_active_slot_unique", "cycle_events_user_cycle_client_request_unique"]) {
    assert.match(`${schema}\n${migration}`, new RegExp(name));
  }
  assert.doesNotMatch(migration, /DROP\s|DELETE\s+FROM|ALTER\s+TABLE\s+\S+\s+RENAME/i);
});
