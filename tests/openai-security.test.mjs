import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getOpenAIStatus, probeOpenAI } from "../lib/server/openai/status.ts";
import { structuredOffline } from "../lib/server/agents/offline.ts";

test("status reports only configuration and allow-listed effective models", () => {
  const status = getOpenAIStatus({ OPENAI_API_KEY: "do-not-return", OPENAI_SPECIALIST_MODEL: "not-allowed", OPENAI_CHIEF_MODEL: "gpt-5.6-sol" });
  assert.deepEqual(status, { configured: true, mode: "openai", specialistModel: "gpt-5.6-terra", chiefModel: "gpt-5.6-sol" });
  assert.equal(JSON.stringify(status).includes("do-not-return"), false);
});

test("probe is bounded, non-stored, redacts provider errors, and never accepts a browser key", async () => {
  const sentinel = ["sk", "lifeorg", "sentinel"].join("-");
  let observed;
  const result = await probeOpenAI({ OPENAI_API_KEY: sentinel }, async (_url, init) => {
    observed = JSON.parse(String(init?.body));
    assert.equal(String(init?.headers?.Authorization).includes(sentinel), true);
    return new Response(JSON.stringify({ error: { message: `invalid ${sentinel}` } }), { status: 401 });
  }, { timeoutMs: 50, requestBody: { apiKey: "browser-injection" } });
  assert.equal(observed.store, false);
  assert.equal(JSON.stringify(observed).includes("browser-injection"), false);
  assert.deepEqual(result, { ok: false, code: "provider_rejected" });
  assert.equal(JSON.stringify(result).includes(sentinel), false);
});

test("offline mode is explicit and contains no fabricated Agent contributions", () => {
  assert.deepEqual(structuredOffline("missing_credentials"), {
    mode: "structured_offline",
    reason: "missing_credentials",
    canRecordPersonalJudgment: true,
    contributions: [],
  });
});

test("integration routes are identity protected, key-free, and use the safe probe", () => {
  const statusRoute = readFileSync(new URL("../app/api/integrations/openai/status/route.ts", import.meta.url), "utf8");
  const testRoute = readFileSync(new URL("../app/api/integrations/openai/test/route.ts", import.meta.url), "utf8");
  for (const route of [statusRoute, testRoute]) {
    assert.match(route, /resolveIdentity/);
    assert.doesNotMatch(route, /request\.json\(|body\.apiKey|apiKey\s*:/);
    assert.doesNotMatch(route, /console\.(?:log|error|warn)/);
  }
  assert.match(statusRoute, /getOpenAIStatus/);
  assert.match(testRoute, /probeOpenAI/);
});

test("OpenAI settings loads safe status and performs the real protected connection test", () => {
  const views = readFileSync(new URL("../app/components/workspace-views.tsx", import.meta.url), "utf8");
  assert.match(views, /protectedFetch\(["']\/api\/integrations\/openai\/status["']/);
  assert.match(views, /protectedFetch\(["']\/api\/integrations\/openai\/test["']\s*,\s*\{[^}]*method:\s*["']POST["']/s);
  assert.match(views, /specialistModel/);
  assert.match(views, /chiefModel/);
  assert.match(views, /structured_offline/);
});

test("source and build artifacts contain no configured secret sentinel", () => {
  const sentinel = ["sk", "lifeorg", "sentinel"].join("-");
  const roots = ["app", "lib", "db", "drizzle", "dist/client"];
  const files = [];
  const visit = (path) => {
    if (statSync(path).isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
    else files.push(path);
  };
  for (const root of roots) visit(fileURLToPath(new URL(`../${root}`, import.meta.url)));
  for (const file of files) assert.equal(readFileSync(file).includes(sentinel), false, `secret leaked in ${file}`);
});
