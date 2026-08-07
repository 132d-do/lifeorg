import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all cycle URLs have focused App Router pages", () => {
  const pages = {
    "app/cycles/page.tsx": /CycleList/,
    "app/cycles/[id]/page.tsx": /CycleDetail/,
    "app/cycles/[id]/check-in/page.tsx": /CycleCheckIn/,
    "app/cycles/[id]/review/page.tsx": /CycleReview/,
  };
  for (const [path, component] of Object.entries(pages)) assert.match(source(path), component);
});

test("cycle detail uses an owned deep-link API and discriminated loading states", () => {
  const detail = source("app/features/cycles/cycle-detail.tsx");
  assert.match(detail, /\/api\/cycles\/\$\{encodeURIComponent\(id\)\}/);
  for (const state of ["loading", "ready", "empty", "error"]) assert.match(detail, new RegExp(`kind:\\s*["']${state}["']`));
  assert.match(detail, /href=\{`\/cycles\/\$\{cycle\.id\}\/check-in`\}/);
  assert.match(detail, /href=\{`\/cycles\/\$\{cycle\.id\}\/review`\}/);
});

test("daily check-in exposes six named outcomes and retains one idempotency key until success", () => {
  const checkIn = source("app/features/cycles/cycle-check-in.tsx");
  const contracts = source("app/features/cycles/contracts.ts");
  for (const label of ["完成", "推进", "受阻", "缩小", "改期", "停止"]) assert.match(contracts, new RegExp(`["']${label}["']`));
  assert.match(checkIn, />\{label\}<\/button>/);
  assert.match(checkIn, /sessionStorage/);
  assert.match(checkIn, /clientRequestId/);
  assert.match(checkIn, /if\s*\(!response\.ok\)/);
  assert.match(checkIn, /removeItem/);
  assert.match(checkIn, /energy-protection/);
  assert.match(checkIn, /5–15 分钟/);
  assert.match(checkIn, /恢复\/休息/);
  assert.match(checkIn, /收集信息/);
  assert.doesNotMatch(checkIn, /创建第二个周期|新建周期/);
});

test("cycle review separates completion, accuracy, and decision value", () => {
  const review = source("app/features/reviews/cycle-review.tsx");
  assert.match(review, /name="actionCompletion"/);
  assert.match(review, /name="recommendationAccuracy"/);
  assert.match(review, /name="decisionValue"/);
  assert.match(review, /source\.type === "manual_goal"/);
  assert.match(review, /\/api\/cycles\/\$\{encodeURIComponent\(id\)\}\/review/);
});

test("shared state hook is extracted and cycle navigation is semantic", () => {
  const shared = source("app/features/shared/use-life-state.ts");
  for (const exported of ["Profile", "Goal", "Meeting", "Decision", "Reminder", "LifeState", "emptyState", "protectedFetch", "useLifeState"]) {
    assert.match(shared, new RegExp(`export (?:type |const |function )${exported}`));
  }
  assert.match(source("app/components/app-shell.tsx"), /href:\s*["']\/cycles["']/);
});
