import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { orchestrateMeetingTurnDetailed } from '../lib/server/agents/orchestrate.ts';
import { StrategyOutputSchema, OperationsOutputSchema, RiskOutputSchema } from '../lib/server/agents/schemas.ts';

const records = [{ id: 'goal:1', type: 'goal', title: '论文', summary: '修改讨论', updatedAt: '2026-09-05' }];
const packet = { records, topic: '本周如何安排', latestUserMessage: '可投入六小时', kind: 'daily' };

test('specialist structured schemas require their own concrete deliverables', () => {
  for (const [schema, role, assessment] of [
    [StrategyOutputSchema, 'strategyArchitectAgent', { charterFit: '目标匹配证据', alternatives: '选项与机会成本', pivotEvidence: '需改变判断的证据' }],
    [OperationsOutputSchema, 'operationsOfficerAgent', { capacity: '每天三十分钟', dependency: '等待导师反馈', firstAction: '先写三段提纲', defer: '推迟新的实验' }],
    [RiskOutputSchema, 'riskAuditorAgent', { counterEvidence: '截止时间有矛盾', failureMode: '反馈迟于截止', stopRule: '两次无反馈则调整', verification: '邮件确认截止日' }],
  ]) {
    const base = { role, conclusion: '有明确依据的结论', evidenceIds: ['goal:1'], uncertainty: '仍需核验', disagreements: [] };
    assert.equal(schema.safeParse(base).success, false);
    assert.equal(schema.safeParse({ ...base, assessment }).success, true);
    assert.equal(schema.safeParse({ ...base, assessment: { generic: '继续努力' } }).success, false);
  }
});

test('approval preview and stopped-cycle review expose actual downstream outcomes', () => {
  const effects = readFileSync(new URL('../app/features/meetings/recommendation-effects.tsx', import.meta.url), 'utf8');
  assert.match(effects, /Object.entries\(mutation\)/);
  assert.match(effects, /existingCycle/);
  const detail = readFileSync(new URL('../app/features/cycles/cycle-detail.tsx', import.meta.url), 'utf8');
  assert.match(detail, /cycle.status !== "reviewed"/);
  assert.match(detail, /event.payload/);
});

test('specialist cannot impersonate another role or cite unseen evidence', async () => {
  for (const invalid of [{ role: 'chiefOfStaffAgent', evidenceIds: ['goal:1'] }, { role: 'operationsOfficerAgent', evidenceIds: ['goal:999'] }]) {
    let synthesized = false;
    await assert.rejects(orchestrateMeetingTurnDetailed(packet, async ({phase}) => {
      if (phase === 'completeness') return { sufficient: true, question: null, missingEvidence: [] };
      if (phase === 'specialist') return { ...invalid, conclusion: '先修改讨论部分', uncertainty: '反馈未知', disagreements: [] };
      synthesized = true; return {};
    }));
    assert.equal(synthesized, false);
  }
});

test('synthesis preserves a focused needs_input response', async () => {
  const question = { status: 'needs_input', question: '导师的硬性截止日是哪一天？', missingEvidence: ['deadline'] };
  const result = await orchestrateMeetingTurnDetailed(packet, async ({phase, agent}) => {
    if (phase === 'completeness') return { sufficient: true, question: null, missingEvidence: [] };
    if (phase === 'specialist') return { role: agent.name, evidenceIds: ['goal:1'], conclusion: '先确认交付窗口', uncertainty: '截止日未知', disagreements: [] };
    return question;
  });
  assert.deepEqual(result.turn, question);
});

test('every Agent phase receives a meeting-specific agenda and server date', async () => {
  await orchestrateMeetingTurnDetailed(packet, async ({input}) => {
    assert.equal(input.agenda.kind, 'daily');
    assert.ok(input.agenda.deliverables.length >= 3);
    assert.match(input.serverNow, /^\d{4}-\d{2}-\d{2}T/);
    return { sufficient: false, question: '今天可用多少分钟？', missingEvidence: ['capacity'] };
  });
});

test('new accounts are not populated with fictional personal facts', () => {
  const source = readFileSync(new URL('../app/api/state/route.ts', import.meta.url), 'utf8');
  const seed = source.slice(source.indexOf('async function seedUser'), source.indexOf('async function stateFor'));
  assert.doesNotMatch(seed, /insert\(goals\)|insert\(decisions\)/);
});

test('entity detail has real contextual navigation rather than pretend approval handlers', () => {
  const source = readFileSync(new URL('../app/components/workspace-views.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /当前记录没有待批准|复盘 API 将在引导会议层启用/);
});
