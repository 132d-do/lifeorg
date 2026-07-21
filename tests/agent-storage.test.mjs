import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("guided governance storage is additive and preserves all original domain tables", () => {
  const schema = source("db/schema.ts");
  for (const table of ["profiles", "goals", "meetings", "decisions", "reminders"]) assert.match(schema, new RegExp(`sqliteTable\\(["']${table}["']`));
  for (const field of ["clientRequestId", "lifecycleStatus", "topic", "phase", "finalRecommendation", "approvalStatus", "updatedAt"]) assert.match(schema, new RegExp(`${field}:`), `meetings missing ${field}`);
  assert.match(schema, /export const meetingMessages = sqliteTable\(["']meeting_messages["']/);
  for (const field of ["userId", "meetingId", "turnNumber", "role", "structuredContent", "modelMetadata", "createdAt"]) assert.match(schema, new RegExp(`${field}:`), `meeting_messages missing ${field}`);
  assert.doesNotMatch(schema, /apiKey|OPENAI_API_KEY/i);
});

test("the governance SQL is forward-only and contains no destructive statements", () => {
  const path = new URL("../drizzle/0001_guided_agent_governance.sql", import.meta.url);
  assert.equal(existsSync(path), true);
  const sql = readFileSync(path, "utf8");
  assert.match(sql, /ALTER TABLE [`"]meetings[`"] ADD [`"]client_request_id[`"]/i);
  assert.match(sql, /CREATE TABLE [`"]meeting_messages[`"]/i);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
  for (const table of ["profiles", "goals", "decisions", "reminders"]) assert.doesNotMatch(sql, new RegExp(`ALTER TABLE [\\x60"]${table}[\\x60"]`, "i"));
});
