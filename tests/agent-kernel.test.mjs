import assert from "node:assert/strict";
import test from "node:test";

import { Agent } from "@openai/agents";
import {
  chiefOfStaffAgent,
  operationsOfficerAgent,
  riskAuditorAgent,
  strategyArchitectAgent,
} from "../lib/server/agents/registry.ts";
import {
  ChiefOutputSchema,
  FinalRecommendationSchema,
  MeetingTurnResponseSchema,
} from "../lib/server/agents/schemas.ts";
import { gateRecommendation } from "../lib/server/agents/quality-gate.ts";
import { orchestrateMeetingTurn, orchestrateMeetingTurnDetailed } from "../lib/server/agents/orchestrate.ts";
import { legacyAgentResult } from "../lib/server/agents/legacy-adapter.ts";
import { AgentExecutionError, offlineReasonFromError, runWithTimeout } from "../lib/server/agents/openai-executor.ts";

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
};

test("registry exports exactly four real Agents with distinct governed contracts", () => {
  const agents = [chiefOfStaffAgent, strategyArchitectAgent, operationsOfficerAgent, riskAuditorAgent];
  assert.equal(agents.length, 4);
  for (const agent of agents) assert.equal(agent instanceof Agent, true);
  assert.deepEqual(agents.map((agent) => agent.name), ["chiefOfStaffAgent", "strategyArchitectAgent", "operationsOfficerAgent", "riskAuditorAgent"]);
  assert.equal(chiefOfStaffAgent.model, "gpt-5.6-sol");
  for (const specialist of agents.slice(1)) assert.equal(specialist.model, "gpt-5.6-terra");
  assert.equal(new Set(agents.map((agent) => agent.instructions)).size, 4);
  for (const agent of agents) {
    assert.match(String(agent.instructions), /目标：/);
    assert.match(String(agent.instructions), /禁止：/);
    assert.ok(agent.outputType, `${agent.name} must declare a Zod output`);
  }
});

test("chief uses one strict object envelope for completeness and synthesis phases", () => {
  assert.equal(ChiefOutputSchema.safeParse({ mode: "needs_input", sufficient: false, question: "可投入多少小时？", missingEvidence: ["capacity"], recommendation: null }).success, true);
  assert.equal(ChiefOutputSchema.safeParse({ mode: "recommendation", sufficient: true, question: null, missingEvidence: [], recommendation }).success, true);
  assert.equal(ChiefOutputSchema.safeParse({ sufficient: true, question: null, missingEvidence: [] }).success, false);
  assert.equal(ChiefOutputSchema.safeParse({ mode: "needs_input", sufficient: true, question: null, missingEvidence: [], recommendation }).success, false);
  assert.equal(ChiefOutputSchema.safeParse({ mode: "recommendation", sufficient: false, question: "why?", missingEvidence: ["capacity"], recommendation: null }).success, false);
});

test("legacy adapter preserves every historical result key while carrying the governed turn", () => {
  const contributions = [
    { role: "strategyArchitectAgent", conclusion: "战略结论", evidenceIds: ["goal:12"], uncertainty: "反馈未知", disagreements: [] },
    { role: "operationsOfficerAgent", conclusion: "运营结论", evidenceIds: ["goal:12"], uncertainty: "容量未知", disagreements: [] },
    { role: "riskAuditorAgent", conclusion: "审计结论", evidenceIds: ["decision:7"], uncertainty: "停止阈值待确认", disagreements: [] },
  ];
  const turn = { status: "ready", recommendation };
  const result = legacyAgentResult({ turn, contributions }, "gpt-5.6-sol");
  assert.deepEqual(Object.keys(result).sort(), ["audit", "chief", "model", "operations", "recommendation", "source", "strategy", "turn"].sort());
  assert.equal(result.strategy, "战略结论");
  assert.equal(result.operations, "运营结论");
  assert.equal(result.audit, "审计结论");
  assert.equal(result.recommendation, recommendation.recommendation);
  assert.equal(result.chief, recommendation.recommendation);
  assert.equal(result.source, "openai");
});

test("Agent execution timeout and invalid output map to faithful offline reason classes", async () => {
  let observedSignal;
  await assert.rejects(runWithTimeout((signal) => {
    observedSignal = signal;
    return new Promise(() => {});
  }, 20), (error) => error instanceof AgentExecutionError && error.code === "provider_timeout");
  assert.equal(observedSignal?.aborted, true);
  assert.equal(offlineReasonFromError(new AgentExecutionError("provider_timeout")), "provider_timeout");
  assert.equal(offlineReasonFromError(new AgentExecutionError("invalid_output")), "invalid_output");
  assert.equal(offlineReasonFromError(new Error("upstream failed")), "provider_failure");
});

test("detailed orchestration preserves actual specialist contributions without changing the public turn", async () => {
  const result = await orchestrateMeetingTurnDetailed({ records: evidence, topic: "如何安排本周？", latestUserMessage: "可投入 12 小时" }, async ({ phase, agent }) => {
    if (phase === "completeness") return { sufficient: true, question: null, missingEvidence: [] };
    if (phase === "specialist") return { role: agent.name, conclusion: `${agent.name} 的真实结论`, evidenceIds: ["goal:12", "decision:7"], uncertainty: "未知", disagreements: [] };
    return recommendation;
  });
  assert.equal(result.turn.status, "ready");
  assert.deepEqual(result.contributions.map((item) => item.conclusion), [
    "strategyArchitectAgent 的真实结论",
    "operationsOfficerAgent 的真实结论",
    "riskAuditorAgent 的真实结论",
  ]);
  assert.deepEqual(await orchestrateMeetingTurn({ records: evidence, topic: "缺信息", latestUserMessage: "" }, async () => ({ sufficient: false, question: "还需要什么？", missingEvidence: ["capacity"] })), {
    status: "needs_input", question: "还需要什么？", missingEvidence: ["capacity"],
  });
});

test("one specialist failure aborts sibling specialist runs", async () => {
  let started = 0;
  let aborted = 0;
  await assert.rejects(orchestrateMeetingTurnDetailed({ records: evidence, topic: "测试取消", latestUserMessage: "足够" }, async ({ phase, signal }) => {
    if (phase === "completeness") return { sufficient: true, question: null, missingEvidence: [] };
    started += 1;
    if (started === 3) throw new Error("specialist failed");
    return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => { aborted += 1; reject(new Error("aborted")); }, { once: true }));
  }));
  assert.equal(started, 3);
  assert.equal(aborted, 2);
});

test("MeetingTurnResponse is an exact discriminated union and rejects hidden reasoning", () => {
  assert.equal(MeetingTurnResponseSchema.safeParse({ status: "needs_input", question: "本周可投入多少小时？", missingEvidence: ["capacity"] }).success, true);
  assert.equal(MeetingTurnResponseSchema.safeParse({ status: "deliberating", contributions: [{ role: "strategy", conclusion: "聚焦论文", evidenceIds: ["goal:12"], uncertainty: "反馈时间未知", disagreements: [] }] }).success, true);
  assert.equal(MeetingTurnResponseSchema.safeParse({ status: "ready", recommendation }).success, true);
  assert.equal(MeetingTurnResponseSchema.safeParse({ status: "ready", recommendation, reasoning: "private chain" }).success, false);
  assert.equal(MeetingTurnResponseSchema.safeParse({ status: "needs_input", question: "A?", missingEvidence: [], extra: true }).success, false);
});

test("quality gate accepts only concrete recommendations backed by real record IDs", () => {
  assert.deepEqual(gateRecommendation(recommendation, evidence), { status: "ready", recommendation: FinalRecommendationSchema.parse(recommendation) });
  for (const invalid of [
    { ...recommendation, evidence: recommendation.evidence.slice(0, 1) },
    { ...recommendation, evidence: [{ recordId: "goal:invented", claim: "不存在" }, recommendation.evidence[1]] },
    { ...recommendation, recommendation: "继续努力，相信自己。" },
    { ...recommendation, recommendation: "先修改论文。然后再启动新项目。" },
    { ...recommendation, stopOrAdjustCondition: "" },
    { ...recommendation, nextActionWindowHours: 72 },
  ]) {
    const result = gateRecommendation(invalid, evidence);
    assert.equal(result.status, "needs_input");
    assert.equal(typeof result.question, "string");
    assert.ok(result.question.length > 0);
    assert.ok(result.missingEvidence.length > 0);
  }
});

test("orchestrator asks one question before specialists when evidence is incomplete", async () => {
  const calls = [];
  const result = await orchestrateMeetingTurn({ records: evidence.slice(0, 1), topic: "如何安排本周？", latestUserMessage: "帮我决定" }, async (request) => {
    calls.push(request);
    return { sufficient: false, question: "你本周真实可投入多少小时？", missingEvidence: ["capacity"] };
  });
  assert.equal(result.status, "needs_input");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].phase, "completeness");
});

test("orchestrator starts three specialists in parallel only after completeness and then synthesizes", async () => {
  const order = [];
  let started = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const run = async ({ phase, agent }) => {
    order.push(`${phase}:${agent.name}`);
    if (phase === "completeness") return { sufficient: true, question: null, missingEvidence: [] };
    if (phase === "specialist") {
      started += 1;
      if (started === 3) release();
      await barrier;
      return { role: agent.name, conclusion: "聚焦论文", evidenceIds: ["goal:12", "decision:7"], uncertainty: "反馈未知", disagreements: [] };
    }
    return recommendation;
  };
  const result = await orchestrateMeetingTurn({ records: evidence, topic: "如何安排本周？", latestUserMessage: "可投入 12 小时" }, run);
  assert.equal(result.status, "ready");
  assert.equal(started, 3);
  assert.equal(order[0], "completeness:chiefOfStaffAgent");
  assert.equal(order.at(-1), "synthesis:chiefOfStaffAgent");
  assert.equal("reasoning" in result, false);
});
