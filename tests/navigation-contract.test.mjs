import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path) => readFileSync(join(root, path), "utf8");

const canonicalPages = [
  ["/", "app/page.tsx"],
  ["/meetings", "app/meetings/page.tsx"],
  ["/meetings/new/[kind]", "app/meetings/new/[kind]/page.tsx"],
  ["/meetings/[id]", "app/meetings/[id]/page.tsx"],
  ["/goals", "app/goals/page.tsx"],
  ["/goals/new", "app/goals/new/page.tsx"],
  ["/goals/[id]", "app/goals/[id]/page.tsx"],
  ["/decisions", "app/decisions/page.tsx"],
  ["/decisions/new", "app/decisions/new/page.tsx"],
  ["/decisions/[id]", "app/decisions/[id]/page.tsx"],
  ["/insights", "app/insights/page.tsx"],
  ["/settings/profile", "app/settings/profile/page.tsx"],
  ["/settings/agents", "app/settings/agents/page.tsx"],
  ["/settings/integrations/openai", "app/settings/integrations/openai/page.tsx"],
];

const concreteUrls = [
  "/",
  "/meetings",
  "/meetings/new/daily",
  "/meetings/new/weekly",
  "/meetings/new/monthly",
  "/meetings/new/decision",
  "/meetings/fixture-meeting",
  "/goals",
  "/goals/new",
  "/goals/fixture-goal",
  "/decisions",
  "/decisions/new",
  "/decisions/fixture-decision",
  "/decisions/fixture-decision/review",
  "/insights",
  "/settings/profile",
  "/settings/agents",
  "/settings/integrations/openai",
];

test("every canonical URL has an App Router page for direct access and refresh", () => {
  for (const [route, page] of canonicalPages) {
    assert.equal(existsSync(join(root, page)), true, `${route} is missing ${page}`);
  }
  assert.match(source("app/page.tsx"), /<LifeOrgClient view=["']overview["']/);
  assert.match(source("app/overview/page.tsx"), /redirect\(["']\/["']\)/);
});

test("the production build declares a route match for every concrete deep link", () => {
  const worker = source("dist/server/index.js");
  const patterns = ["/", "/meetings", "/meetings/new/:kind", "/meetings/:id", "/goals", "/goals/new", "/goals/:id", "/decisions", "/decisions/new", "/decisions/:id", "/decisions/:id/review", "/insights", "/settings/profile", "/settings/agents", "/settings/integrations/openai"];
  for (const pattern of patterns) assert.match(worker, new RegExp(`pattern:\\s*[\"']${pattern.replaceAll("/", "\\/")}[\"']`), `build is missing ${pattern}`);
  assert.deepEqual(concreteUrls.filter((url) => !url.startsWith("/overview")), concreteUrls);
});

test("the fresh production worker serves every concrete deep link", () => {
  const bin = process.platform === "win32"
    ? join(root, "node_modules", ".bin", "vinext.cmd")
    : join(root, "node_modules", ".bin", "vinext");
  const build = spawnSync(bin, ["build"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const smoke = spawnSync(process.execPath, [join(root, "tests", "worker-route-smoke.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
});

test("the app shell exposes semantic links and route-derived active state", () => {
  const shell = source("app/components/app-shell.tsx");
  assert.match(shell, /import\s+Link\s+from\s+["']next\/link["']/);
  assert.match(shell, /usePathname\(\)/);
  for (const href of ["/", "/meetings", "/goals", "/decisions", "/insights", "/settings/profile"]) {
    assert.match(shell, new RegExp(`(?:href=|href:)\\s*[\\{]?['\"]${href.replaceAll("/", "\\/")}`), `missing link ${href}`);
  }
  assert.doesNotMatch(shell, /<div[^>]+onClick=/);
  assert.doesNotMatch(shell, /<span[^>]+onClick=/);
});

test("meeting, create, detail, settings and review destinations are declared as links", () => {
  const files = [
    "app/components/workspace-views.tsx",
    "app/components/app-shell.tsx",
  ];
  const content = files.map(source).join("\n");
  for (const href of [
    "/meetings/new/daily",
    "/meetings/new/weekly",
    "/goals/new",
    "/decisions/new",
    "/settings/profile",
    "/settings/agents",
    "/settings/integrations/openai",
  ]) {
    assert.match(content, new RegExp(href.replaceAll("/", "\\/")), `missing destination ${href}`);
  }
  assert.match(content, /`\/meetings\/new\/\$\{kind\}`/);
  assert.match(content, /["']monthly["']/);
  assert.match(content, /["']decision["']/);
  assert.match(content, /`\/goals\/\$\{[^}]+\}`/);
  assert.match(content, /`\/decisions\/\$\{[^}]+\}`/);
  assert.match(content, /`\/meetings\/\$\{[^}]+\}`/);
});

test("operational affordances use named semantic controls with visible feedback", () => {
  const controls = source("app/components/action-controls.tsx");
  for (const contract of [
    "close",
    "cancel",
    "mood",
    "submit",
    "toggle",
    "progress",
    "timer",
    "retry",
    "analyze",
    "reject",
    "approve",
  ]) {
    assert.match(controls, new RegExp(`data-action=["']${contract}["']`), `missing ${contract} control contract`);
  }
  assert.match(controls, /role=["']status["']/);
  assert.match(controls, /type=["']range["']/);
  assert.match(controls, /type=["']submit["']/);
  assert.doesNotMatch(controls, /<div[^>]+onClick=/);
  assert.doesNotMatch(controls, /<span[^>]+onClick=/);
});

test("baseline editor operations persist and every temporary integration action reports an outcome", () => {
  const views = source("app/components/workspace-views.tsx");
  for (const action of ["goal.create", "decision.create", "meeting.create", "profile.update"]) {
    assert.match(views, new RegExp(`await state\\.mutate\\([\"']${action.replace(".", "\\.")}[\"']`), `${action} is not persisted`);
  }
  assert.match(views, /useRouter\(\)/);
  assert.match(views, /router\.push\(`\/meetings\/\$\{[^}]+\}`\)/);
  assert.match(views, /OpenAI[^\n]+(?:尚未配置|将在 Agent 内核层启用)/);
  assert.match(views, /setStatus\(["'][^"']*(?:尚未配置|将在 Agent 内核层启用)[^"']*["']\)/);
});
