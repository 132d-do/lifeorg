import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("entity lookup returns the selected durable record for a deep link", async () => {
  const { findEntityById } = await import(new URL("../lib/ui-contract.ts", import.meta.url));
  const rows = [{ id: 1, title: "first" }, { id: 42, title: "selected", summary: "saved meeting topic" }];
  assert.deepEqual(findEntityById(rows, "42"), rows[1]);
  assert.equal(findEntityById(rows, "missing"), null);
  const views = source("app/components/workspace-views.tsx");
  assert.match(views, /findEntityById\(state\.data\.(?:goals|decisions|meetings)/);
  assert.match(views, /record\?\.(?:title|summary)/);
});

test("optimistic changes keep success and revert failures without rejecting", async () => {
  const { settleOptimistic } = await import(new URL("../lib/ui-contract.ts", import.meta.url));
  assert.deepEqual(await settleOptimistic(10, 40, async () => undefined), { value: 40, status: "saved" });
  assert.deepEqual(await settleOptimistic(10, 40, async () => { throw new Error("offline"); }), { value: 10, status: "failed" });
});

test("commit gate deduplicates concurrent writes and releases after settlement", async () => {
  const { createCommitGate } = await import(new URL("../lib/ui-contract.ts", import.meta.url));
  const gate = createCommitGate();
  let writes = 0;
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const first = gate.run(async () => { writes += 1; await blocked; return "saved"; });
  const duplicate = gate.run(async () => { writes += 1; return "duplicate"; });
  assert.equal(first, duplicate);
  assert.equal(writes, 0, "work starts in a microtask so all same-tick calls dedupe");
  await Promise.resolve();
  assert.equal(writes, 1);
  release();
  assert.equal(await duplicate, "saved");
  assert.equal(await gate.run(async () => { writes += 1; return "next"; }), "next");
  assert.equal(writes, 2);
});

test("detail view state turns fetch failures into a retryable error", async () => {
  const { entityDetailState } = await import(new URL("../lib/ui-contract.ts", import.meta.url));
  assert.deepEqual(entityDetailState("同步中断", "网络错误", null), { kind: "error", message: "网络错误", canRetry: true });
  assert.deepEqual(entityDetailState("正在同步…", "", null), { kind: "loading", message: "正在读取详情…", canRetry: false });
  assert.deepEqual(entityDetailState("个人记录已同步", "", { id: 1 }), { kind: "ready", record: { id: 1 }, canRetry: false });
  assert.deepEqual(entityDetailState("个人记录已同步", "", null), { kind: "missing", message: "未找到这条记录", canRetry: false });
});

test("progress and reminder controls expose keyboard-safe commits and failure feedback", () => {
  const controls = source("app/components/action-controls.tsx");
  assert.match(controls, /data-action=["']progress-save["']/);
  assert.match(controls, /createCommitGate/);
  assert.match(controls, /disabled=\{busy\}/);
  assert.match(controls, /settleOptimistic/);
  assert.match(controls, /result\.status\s*===\s*["']saved["']/);
  assert.match(controls, /保存失败，已恢复/);
  assert.match(controls, /role=["']status["']/);
  assert.doesNotMatch(controls, /onPointerUp=|onBlur=/);
  const views = source("app/components/workspace-views.tsx");
  assert.match(views, /entityDetailState/);
  assert.match(views, /state\.retry/);
  assert.ok(root.endsWith("lifeorg\\") || root.endsWith("lifeorg/"));
});
