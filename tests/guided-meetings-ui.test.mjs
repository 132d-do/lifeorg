import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("guided meeting pages use dedicated resumable client experiences", () => {
  assert.match(source("app/meetings/new/[kind]/page.tsx"), /MeetingIntake/);
  assert.match(source("app/meetings/[id]/page.tsx"), /GuidedMeetingRoom/);
  const views = source("app/components/workspace-views.tsx");
  assert.match(views, /clientRequestId/);
  assert.match(views, /\/api\/meetings/);
  assert.match(views, /needs_input/);
  assert.match(views, /deliberating/);
  assert.match(views, /mutationHash/);
  assert.match(views, /结构化离线模式/);
  for (const action of ["retry", "edit", "reject", "approve"]) assert.match(views, new RegExp(`data-action=["']${action}["']`));
});

test("decision review launches governed outcome review instead of mutating history directly", () => {
  const views = source("app/components/workspace-views.tsx");
  assert.match(views, /decision\.reviewOutcome/);
  assert.match(views, /observedAt/);
  assert.doesNotMatch(views, /mutate\(["']decision\.review["']/);
});

test("public meeting routes resolve identity and never trust client ownership", () => {
  for (const path of [
    "app/api/meetings/route.ts",
    "app/api/meetings/[id]/route.ts",
    "app/api/meetings/[id]/turns/route.ts",
    "app/api/meetings/[id]/decision/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /resolveIdentity/);
    assert.doesNotMatch(route, /x-lifeorg-user/i);
    assert.doesNotMatch(route, /body\.userId|payload\.userId/);
  }
});

test("governance schema includes immutable reviews and approval audit without destructive SQL", () => {
  const schema = source("db/schema.ts");
  assert.match(schema, /decisionReviews/);
  assert.match(schema, /meetingApprovals/);
  const sql = source("drizzle/0002_guided_meeting_loop.sql");
  assert.match(sql, /CREATE TABLE [`"]decision_reviews[`"]/i);
  assert.match(sql, /CREATE TABLE [`"]meeting_approvals[`"]/i);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
});
