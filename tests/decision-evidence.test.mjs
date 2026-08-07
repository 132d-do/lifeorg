import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EvidenceItemInputSchema,
  EvidenceKindSchema,
} from "../lib/server/evidence/contracts.ts";
import { InMemoryEvidenceRepository } from "../lib/server/evidence/in-memory-repository.ts";
import { createDecisionEvidenceService } from "../lib/server/evidence/service.ts";

const userA = { userId: "chatgpt:applicant@example.com", displayName: "Applicant", source: "sites" };
const userB = { userId: "chatgpt:other@example.com", displayName: "Other", source: "sites" };

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("evidence contracts distinguish six kinds and verification authority", () => {
  assert.deepEqual(EvidenceKindSchema.options, [
    "fact", "preference", "assumption", "unknown", "alternative", "historical_analogue",
  ]);
  const fact = EvidenceItemInputSchema.parse({
    clientRequestId: "evidence-advisor-capacity",
    kind: "fact",
    title: "导师本学期只接收一名学生",
    content: "邮件记录显示名额为一人",
    verification: "record_backed",
    source: { type: "decision", id: "7" },
  });
  assert.equal(fact.kind, "fact");
  assert.equal(EvidenceItemInputSchema.safeParse({
    clientRequestId: "unsupported-confirmation",
    kind: "fact",
    title: "这是事实",
    content: "仅由用户口头确认",
    verification: "user_confirmed",
    source: null,
  }).success, false);
  assert.equal(EvidenceItemInputSchema.safeParse({
    clientRequestId: "confirmed-preference",
    kind: "preference",
    title: "更看重导师匹配",
    content: "愿意放弃学校排名换取更合适的研究方向",
    verification: "user_confirmed",
    source: null,
  }).success, true);
});

test("owned evidence is idempotent and preserves an immutable source snapshot", async () => {
  const repository = new InMemoryEvidenceRepository();
  const ownedSource = {
    type: "goal", id: "1", title: "完成博士申请", summary: "当前进度 40%", updatedAt: "2026-08-08",
  };
  const service = createDecisionEvidenceService({
    repository,
    ownsDecision: async (userId, decisionId) => userId === userA.userId && decisionId === 7,
    resolveSource: async (userId, reference) => userId === userA.userId && reference.type === "goal" && reference.id === "1" ? ownedSource : null,
    recommendRecords: async () => [ownedSource],
  });
  const candidate = {
    clientRequestId: "evidence-application-progress",
    kind: "fact",
    title: "申请材料尚未完成",
    content: "目标记录显示当前进度为 40%",
    verification: "record_backed",
    source: { type: "goal", id: "1" },
  };
  const first = await service.create(userA, 7, candidate);
  ownedSource.summary = "当前进度 90%";
  const retry = await service.create(userA, 7, candidate);
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.item.id, first.item.id);
  assert.equal(retry.item.sourceSnapshot.summary, "当前进度 40%");
  await assert.rejects(service.create(userA, 7, { ...candidate, content: "不同内容" }), (error) => error.code === "idempotency_conflict");
});

test("decision and source ownership are hidden as not found", async () => {
  const repository = new InMemoryEvidenceRepository();
  const service = createDecisionEvidenceService({
    repository,
    ownsDecision: async (userId, decisionId) => userId === userA.userId && decisionId === 7,
    resolveSource: async () => null,
    recommendRecords: async () => [],
  });
  await assert.rejects(service.list(userB, 7), (error) => error.code === "not_found");
  await assert.rejects(service.create(userA, 7, {
    clientRequestId: "foreign-source-evidence",
    kind: "fact",
    title: "另一个用户的目标",
    content: "不可读取",
    verification: "record_backed",
    source: { type: "goal", id: "999" },
  }), (error) => error.code === "not_found");
});

test("evidence list is grouped by human meaning and recommends owned records", async () => {
  const repository = new InMemoryEvidenceRepository();
  const recommended = { type: "profile", id: "self", title: "个人章程", summary: "优先长期匹配", updatedAt: "2026-08-08" };
  const service = createDecisionEvidenceService({
    repository,
    ownsDecision: async (userId, decisionId) => userId === userA.userId && decisionId === 7,
    resolveSource: async () => recommended,
    recommendRecords: async () => [recommended],
  });
  await service.create(userA, 7, {
    clientRequestId: "evidence-personal-preference",
    kind: "preference",
    title: "更重视研究匹配",
    content: "学校名气不是唯一标准",
    verification: "user_confirmed",
    source: null,
  });
  const result = await service.list(userA, 7);
  assert.equal(result.groups.preference[0].title, "更重视研究匹配");
  assert.equal(result.groups.fact.length, 0);
  assert.deepEqual(result.recommendedRecords, [recommended]);
});

test("evidence, forecast, and recommendation evaluation persistence is additive", () => {
  const schema = source("db/schema.ts");
  const migration = source("drizzle/0006_decision_evidence.sql");
  for (const name of ["evidence_items", "decision_forecasts", "recommendation_evaluations"]) {
    assert.match(`${schema}\n${migration}`, new RegExp(name));
  }
  assert.doesNotMatch(migration, /DROP\s|DELETE\s+FROM|ALTER\s+TABLE\s+\S+\s+RENAME/i);
});

test("decision evidence API uses trusted identity and owned D1 source resolution", () => {
  const route = source("app/api/decisions/[id]/evidence/route.ts");
  assert.match(route, /decisionEvidenceRequestContext\(request\)/);
  assert.match(route, /decisionEvidenceApiError\(error\)/);
  const boundary = source("lib/server/evidence/route-service.ts");
  assert.match(boundary, /resolveIdentity\(request/);
  assert.match(boundary, /D1EvidenceRepository/);
  for (const ownedTable of ["profiles", "goals", "meetings", "decisions", "operatingCycles", "decisionReviews"]) {
    assert.match(boundary, new RegExp(ownedTable));
  }
});
