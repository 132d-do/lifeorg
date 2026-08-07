import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeEvalPacket, releaseDecision, scoreOfflineFixture } from "../scripts/run-agent-evals.mjs";

const cases = JSON.parse(readFileSync(new URL("../evals/lifeorg/cases.json", import.meta.url), "utf8"));
const rubric = JSON.parse(readFileSync(new URL("../evals/lifeorg/rubric.json", import.meta.url), "utf8"));

test("evaluation suite covers at least seven student decision categories without production data", () => {
  assert.ok(cases.length >= 7);
  assert.ok(new Set(cases.map((item) => item.category)).size >= 7);
  for (const item of cases) {
    assert.ok(item.id && item.topic && item.profile && item.records.length >= 2);
    assert.ok(item.expectedEvidenceIds.every((id) => item.records.some((record) => record.id === id)));
    assert.equal(JSON.stringify(item).includes("@"), false);
  }
});

test("all variants receive the exact same normalized evidence packet", () => {
  const fixture = cases[0];
  const packets = ["single", "current", "independent"].map((variant) => normalizeEvalPacket(fixture, variant));
  assert.deepEqual(packets[0].packet, packets[1].packet);
  assert.deepEqual(packets[1].packet, packets[2].packet);
  assert.notEqual(packets[0].variant, packets[1].variant);
});

test("versioned rubric separates six quality dimensions from cost and latency", () => {
  assert.match(rubric.version, /^\d{4}-\d{2}-\d{2}\.v\d+$/);
  assert.deepEqual(Object.keys(rubric.components), ["citationValidity", "evidenceFidelity", "alternativeQuality", "riskDetection", "actionability", "calibration"]);
  for (const component of Object.values(rubric.components)) assert.deepEqual(component.scale, [0, 1, 2, 3, 4]);
  assert.deepEqual(rubric.reportSeparately, ["durationMs", "inputTokens", "outputTokens", "modelCalls"]);
});

test("offline fixture scoring detects invented citations and produces comparable rows", () => {
  const rows = ["single", "current", "independent"].map((variant) => scoreOfflineFixture(cases[1], variant, rubric));
  assert.ok(rows.every((row) => row.schemaValid && row.inventedCitations.length === 0));
  assert.deepEqual(rows.map((row) => row.caseId), [cases[1].id, cases[1].id, cases[1].id]);
  assert.deepEqual(rows.map((row) => row.variant), ["single", "current", "independent"]);
});

test("missing evidence is graded as a valid needs-input completion state", () => {
  const fixture = cases.find((item) => item.id === "missing-evidence");
  const row = scoreOfflineFixture(fixture, "independent", rubric);
  assert.equal(row.completionStatus, "needs_input");
  assert.equal(row.completionValid, true);
  assert.equal(row.schemaValid, true);
});

test("release claims require enough completed human samples and threshold evidence", () => {
  assert.equal(releaseDecision({ completedSamples: 2, requiredSamples: 14, meanIndependentGain: 1.1, minimumGain: 0.25 }).allowed, false);
  assert.equal(releaseDecision({ completedSamples: 14, requiredSamples: 14, meanIndependentGain: 0.1, minimumGain: 0.25 }).allowed, false);
  assert.equal(releaseDecision({ completedSamples: 14, requiredSamples: 14, meanIndependentGain: 0.4, minimumGain: 0.25 }).allowed, true);
});
