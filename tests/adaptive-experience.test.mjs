import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("overview cockpit prioritizes one active commitment and suppresses unrelated daily CTA", () => {
  const cockpit = source("app/features/cycles/overview-cockpit.tsx");
  assert.match(cockpit, /\/api\/cycles\/current/);
  assert.match(cockpit, /CURRENT COMMITMENT/);
  assert.match(cockpit, /smallestAction|最小行动/);
  assert.match(cockpit, /reviewLocalDate/);
  const activeBranch = cockpit.slice(cockpit.indexOf("CURRENT COMMITMENT"));
  assert.doesNotMatch(activeBranch, /meetings\/new\/daily/);
});

test("evidence board renders human titles and verification while IDs stay internal", () => {
  const board = source("app/features/evidence/evidence-board.tsx");
  assert.match(board, /item\.title/);
  assert.match(board, /item\.verification/);
  assert.match(board, /value=\{item\.id\}/);
  assert.doesNotMatch(board, />\{item\.id\}</);
});

test("recommendation effects explain changed and unchanged records without production mutation JSON", () => {
  const effects = source("app/features/meetings/recommendation-effects.tsx");
  assert.match(effects, /创建 7 日周期/);
  assert.match(effects, /不会改变/);
  assert.match(effects, /process\.env\.NODE_ENV !== "production"/);
  assert.match(effects, /<details/);
  const room = source("app/components/workspace-views.tsx");
  assert.match(room, /RecommendationEffects/);
  assert.doesNotMatch(room, /<pre>\{JSON\.stringify\(recommendation\.mutationPreview/);
});

test("every AppShell page exposes safe global OpenAI status navigation", () => {
  const status = source("app/features/settings/openai-status-link.tsx");
  assert.match(status, /真实 Agent 已连接/);
  assert.match(status, /结构化离线模式/);
  assert.match(status, /连接异常/);
  assert.match(status, /href="\/settings\/integrations\/openai"/);
  assert.match(source("app/components/app-shell.tsx"), /<OpenAIStatusLink/);
});

test("new meeting intake uses the evidence board and explicit decision depth", () => {
  const intake = source("app/features/meetings/meeting-intake.tsx");
  assert.match(intake, /<EvidenceBoard/);
  assert.match(intake, /explicitDepth/);
  assert.match(source("app/meetings/new/[kind]/page.tsx"), /features\/meetings\/meeting-intake/);
});
