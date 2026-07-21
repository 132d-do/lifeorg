import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { createLocalSessionCookie, resolveIdentity } from "../lib/server/identity.ts";
import { createSessionFetch } from "../lib/client/session-bootstrap.ts";

const secret = "a-development-secret-that-is-long-enough-for-tests";

test("production trusts only the Sites authenticated email and ignores forged ownership", async () => {
  const trusted = await resolveIdentity(new Request("https://lifeorg.test/api/state", { headers: {
    "oai-authenticated-user-email": "CEO@Example.com",
    "oai-authenticated-user-full-name": encodeURIComponent("测试 CEO"),
    "x-lifeorg-user": "forged-owner",
  } }), { deployment: "production", sessionSecret: secret });
  assert.deepEqual(trusted, { userId: "chatgpt:ceo@example.com", displayName: "测试 CEO", source: "sites" });

  await assert.rejects(
    resolveIdentity(new Request("https://lifeorg.test/api/state", { headers: { "x-lifeorg-user": "forged-owner" } }), { deployment: "production", sessionSecret: secret }),
    (error) => error?.status === 401,
  );
});

test("local and preview accept only a valid signed HttpOnly SameSite=Lax cookie", async () => {
  const cookie = await createLocalSessionCookie({ userId: "local:abc123", displayName: "本地 CEO" }, secret);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//i);
  assert.doesNotMatch(cookie, /; Secure/i);
  const previewCookie = await createLocalSessionCookie({ userId: "local:preview123", displayName: "预览 CEO" }, secret, { secure: true });
  assert.match(previewCookie, /; Secure/i);
  const identity = await resolveIdentity(new Request("http://localhost/api/state", { headers: { cookie } }), { deployment: "preview", sessionSecret: secret });
  assert.deepEqual(identity, { userId: "local:abc123", displayName: "本地 CEO", source: "session" });
  const tampered = cookie.replace(/lifeorg_session=([^.;]+)(.)/, (_match, prefix, last) => `lifeorg_session=${prefix}${last === "x" ? "y" : "x"}`);
  await assert.rejects(resolveIdentity(new Request("http://localhost/api/state", { headers: { cookie: tampered } }), { deployment: "preview", sessionSecret: secret }), (error) => error?.status === 401);
});

test("session fetch bootstraps first protected call and permits one bootstrap plus one replay after a 401", async () => {
  const calls = [];
  let stateCalls = 0;
  const fakeFetch = async (input, init = {}) => {
    const url = String(input);
    calls.push([url, init.method ?? "GET", init.credentials]);
    if (url === "/api/session") return new Response(JSON.stringify({ status: "ready" }), { status: 200 });
    stateCalls += 1;
    if (stateCalls === 2) return new Response("unauthorized", { status: 401 });
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  };
  const sessionFetch = createSessionFetch(fakeFetch);
  assert.equal((await sessionFetch("/api/state")).status, 200);
  assert.deepEqual(calls.slice(0, 2).map((call) => call[0]), ["/api/session", "/api/state"]);
  assert.equal((await sessionFetch("/api/state")).status, 200);
  assert.deepEqual(calls.slice(2).map((call) => call[0]), ["/api/state", "/api/session", "/api/state"]);
});

test("protected API families use the shared resolver and no source trusts x-lifeorg-user", () => {
  const state = readFileSync(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
  const legacy = readFileSync(new URL("../app/api/agents/route.ts", import.meta.url), "utf8");
  const session = readFileSync(new URL("../app/api/session/route.ts", import.meta.url), "utf8");
  assert.match(state, /resolveIdentity/);
  assert.match(legacy, /resolveIdentity/);
  assert.match(session, /createLocalSessionCookie/);
  assert.doesNotMatch(`${state}\n${legacy}`, /x-lifeorg-user/);
});
