import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { AgentRunMetadataSchema, createAgentRunMetadata } from "../lib/server/observability/agent-run-metadata.ts";

const safeCandidate = {
  runId: "123e4567-e89b-42d3-a456-426614174000",
  pseudonymousUserId: "a".repeat(32), meetingMode: "deep", stage: "synthesis", model: "gpt-5.6-sol",
  promptVersion: "2026-08-08.v1", schemaVersion: "2026-08-08.v1", evalVersion: "2026-08-08.v1",
  durationMs: 1200, inputTokens: 400, outputTokens: 200, status: "ready", errorClass: null,
};

test("telemetry schema is strict and contains no personal-content fields", () => {
  assert.deepEqual(Object.keys(AgentRunMetadataSchema.parse(safeCandidate)), Object.keys(safeCandidate));
  for (const forbidden of ["topic", "prompt", "response", "note", "evidence", "credential", "email", "userId"]) {
    assert.equal(AgentRunMetadataSchema.safeParse({ ...safeCandidate, [forbidden]: "private" }).success, false);
  }
});

test("metadata factory pseudonymizes trusted identity without retaining source content", async () => {
  const metadata = await createAgentRunMetadata("student@example.invalid", { ...safeCandidate, pseudonymousUserId: undefined });
  assert.match(metadata.pseudonymousUserId, /^[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(metadata).includes("student@example.invalid"), false);
});

test("Agent execution disables sensitive tracing and observer receives allow-listed metadata only", () => {
  const executor = readFileSync(new URL("../lib/server/agents/openai-executor.ts", import.meta.url), "utf8");
  const orchestration = readFileSync(new URL("../lib/server/agents/orchestrate.ts", import.meta.url), "utf8");
  assert.match(executor, /tracingDisabled:\s*true/);
  assert.match(executor, /traceIncludeSensitiveData:\s*false/);
  assert.match(executor, /rawResponses/);
  assert.match(executor, /onRun/);
  assert.match(executor, /Telemetry must never change the Agent result/);
  assert.match(orchestration, /AgentRunMetadataSchema/);
  assert.doesNotMatch(orchestration, /console\.(?:log|error|warn)/);
});
