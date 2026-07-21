import assert from "node:assert/strict";
import { register } from "node:module";

register("./cloudflare-loader.mjs", import.meta.url);

const { default: worker } = await import("../dist/server/index.js");
const executionContext = {
  passThroughOnException() {},
  waitUntil() {},
};

const routes = [
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

for (const route of routes) {
  const response = await worker.fetch(
    new Request(`http://lifeorg.local${route}`),
    {},
    executionContext,
  );
  assert.equal(response.status, 200, `${route} returned ${response.status}`);
  const body = await response.text();
  assert.ok(body.length > 0, `${route} returned an empty body`);
}
