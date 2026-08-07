import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOpenAIAgentExecutor } from "../lib/server/agents/openai-executor.ts";
import { orchestrateMeetingTurnDetailed } from "../lib/server/agents/orchestrate.ts";
import { gateRecommendation } from "../lib/server/agents/quality-gate.ts";
import { chiefOfStaffAgent, operationsOfficerAgent, riskAuditorAgent, strategyArchitectAgent } from "../lib/server/agents/registry.ts";
import { AgentContributionSchema, CompletenessSchema, MeetingTurnResponseSchema } from "../lib/server/agents/schemas.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variants = ["single", "current", "independent"];

export function normalizeEvalPacket(fixture, variant) {
  if (!variants.includes(variant)) throw new Error(`Unknown variant: ${variant}`);
  return {
    variant,
    packet: {
      topic: fixture.topic,
      profile: fixture.profile,
      records: fixture.records.map(({ id, title, summary }) => ({ id, title, summary })),
      riskSignals: fixture.riskSignals,
    },
  };
}

function expectedStatus(fixture) {
  return fixture.expectedStatus ?? "ready";
}

function fixtureRecommendation(fixture, variant) {
  const evidence = fixture.expectedEvidenceIds.map((recordId) => ({ recordId, claim: `This record directly constrains the trade-off in ${fixture.topic}.` }));
  return {
    recommendation: variant === "single" ? "Choose one primary direction for the next seven days and review the result." : "Keep one testable commitment for seven days, while explicitly deferring the alternative and honoring the stop condition.",
    evidence,
    deferredAlternative: "Defer the competing path until the scheduled review.",
    nextAction: "Complete one observable 15-minute action within 24 hours.",
    nextActionWindowHours: 24,
    deadlineOrReviewAt: "2026-08-15",
    successCriterion: "Produce one verifiable artifact or a documented counterexample.",
    stopOrAdjustCondition: "Stop or narrow the commitment if a hard deadline or health boundary changes.",
    confidence: variant === "independent" ? "high" : "medium",
    unknowns: [],
    disagreements: variant === "single" ? [] : ["The specialists may weight opportunity cost differently."],
    centralAssumption: "The recorded time and resource constraints remain stable for seven days.",
    forecast: {
      observableOutcome: "A verifiable artifact or explicit counterexample exists within seven days.",
      confidencePercent: variant === "independent" ? 72 : 60,
      evidenceThatChangesAdvice: ["A new non-deferrable deadline appears."],
    },
    sevenDayValidationAction: "Record the outcome daily and compare the forecast with reality on day seven.",
    orchestrationVersion: "eval-fixture.v1",
    promptVersion: "2026-08-08.v1",
    schemaVersion: "2026-08-08.v1",
    mutationPreview: [{
      type: "cycle.create",
      commitment: "Complete one testable commitment",
      startLocalDate: "2026-08-08",
      reviewLocalDate: "2026-08-15",
      timeZone: "Asia/Shanghai",
      successCriterion: "Produce one verifiable artifact",
      stopOrAdjustCondition: "Stop if a hard deadline or health boundary changes",
    }],
  };
}

function fixtureTurn(fixture, variant) {
  if (expectedStatus(fixture) === "needs_input") {
    return {
      status: "needs_input",
      question: "How many focused hours can you actually allocate during the next seven days?",
      missingEvidence: ["weekly_capacity"],
    };
  }
  return { status: "ready", recommendation: fixtureRecommendation(fixture, variant) };
}

function boundedScore(predicates) {
  return Math.max(0, Math.min(4, predicates.filter(Boolean).length));
}

export function scoreRecommendation(fixture, candidate, rubric, metadata = {}) {
  const turn = candidate?.status ? candidate : { status: "ready", recommendation: candidate };
  const recommendation = turn.status === "ready" ? turn.recommendation : null;
  const validIds = new Set(fixture.records.map((record) => record.id));
  const evidence = Array.isArray(recommendation?.evidence) ? recommendation.evidence : [];
  const inventedCitations = evidence.map((item) => item.recordId).filter((id) => !validIds.has(id));
  const cited = new Set(evidence.map((item) => item.recordId));
  const text = JSON.stringify(recommendation ?? {});
  const risks = Array.isArray(recommendation?.risks) ? recommendation.risks : [];
  const scores = {
    citationValidity: inventedCitations.length ? 0 : boundedScore([evidence.length >= 1, evidence.length >= 2, evidence.every((item) => item.claim), fixture.expectedEvidenceIds.every((id) => cited.has(id))]),
    evidenceFidelity: boundedScore([evidence.length >= 2, evidence.every((item) => validIds.has(item.recordId)), evidence.every((item) => String(item.claim ?? "").length >= 8), fixture.expectedEvidenceIds.some((id) => cited.has(id))]),
    alternativeQuality: boundedScore([recommendation?.deferredAlternative, String(recommendation?.deferredAlternative ?? "").length >= 8, /defer|delay|postpone|推迟|放弃/i.test(recommendation?.deferredAlternative ?? ""), recommendation?.stopOrAdjustCondition]),
    riskDetection: boundedScore([risks.length > 0, fixture.riskSignals.some((risk) => text.includes(risk)), recommendation?.stopOrAdjustCondition, Array.isArray(recommendation?.unknowns)]),
    actionability: boundedScore([recommendation?.nextAction, recommendation?.nextActionWindowHours >= 24 && recommendation?.nextActionWindowHours <= 48, recommendation?.successCriterion, recommendation?.deadlineOrReviewAt ?? recommendation?.sevenDayValidationAction]),
    calibration: boundedScore([recommendation?.centralAssumption, recommendation?.forecast?.observableOutcome, Number.isInteger(recommendation?.forecast?.confidencePercent), recommendation?.forecast?.evidenceThatChangesAdvice?.length > 0]),
  };
  const completionStatus = turn.status;
  return {
    evalVersion: rubric.version,
    caseId: fixture.id,
    category: fixture.category,
    variant: metadata.variant,
    config: { packetVersion: "2026-08-08.v1", maxModelCalls: metadata.maxModelCalls ?? 0, fixture: metadata.fixture ?? false },
    scores,
    completionStatus,
    expectedStatus: expectedStatus(fixture),
    completionValid: completionStatus === expectedStatus(fixture),
    schemaValid: MeetingTurnResponseSchema.safeParse(turn).success,
    inventedCitations,
    durationMs: metadata.durationMs ?? 0,
    inputTokens: metadata.inputTokens ?? 0,
    outputTokens: metadata.outputTokens ?? 0,
    modelCalls: metadata.modelCalls ?? 0,
  };
}

export function scoreOfflineFixture(fixture, variant, rubric) {
  const started = performance.now();
  return scoreRecommendation(fixture, fixtureTurn(fixture, variant), rubric, {
    variant,
    fixture: true,
    maxModelCalls: variant === "single" ? 2 : 5,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    modelCalls: 0,
  });
}

async function runSingleAgent(packet, records, execute) {
  const signal = new AbortController().signal;
  const completeness = CompletenessSchema.parse(await execute({ phase: "completeness", agent: chiefOfStaffAgent, input: packet, signal }));
  if (!completeness.sufficient) return { status: "needs_input", question: completeness.question, missingEvidence: completeness.missingEvidence };
  const output = await execute({ phase: "synthesis", agent: chiefOfStaffAgent, input: { ...packet, meetingPolicy: { mode: "single_agent_baseline" }, contributions: [] }, signal });
  return gateRecommendation(output, records);
}

async function runSequentialFourAgent(packet, records, execute) {
  const signal = new AbortController().signal;
  const completeness = CompletenessSchema.parse(await execute({ phase: "completeness", agent: chiefOfStaffAgent, input: packet, signal }));
  if (!completeness.sufficient) return { status: "needs_input", question: completeness.question, missingEvidence: completeness.missingEvidence };
  const contributions = [];
  for (const agent of [strategyArchitectAgent, operationsOfficerAgent, riskAuditorAgent]) {
    contributions.push(AgentContributionSchema.parse(await execute({
      phase: "specialist",
      agent,
      input: { ...packet, priorContributions: contributions },
      signal,
    })));
  }
  const output = await execute({ phase: "synthesis", agent: chiefOfStaffAgent, input: { ...packet, meetingPolicy: { mode: "sequential_shared_context" }, contributions }, signal });
  return gateRecommendation(output, records);
}

async function scoreProviderCase(fixture, variant, rubric, apiKey) {
  const started = performance.now();
  let modelCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const baseExecutor = createOpenAIAgentExecutor(apiKey, 25_000, { onRun(observation) {
    inputTokens += observation.inputTokens;
    outputTokens += observation.outputTokens;
  } });
  const execute = async (request) => { modelCalls += 1; return baseExecutor(request); };
  const records = fixture.records.map((record) => ({ ...record, type: record.id.split(":")[0], updatedAt: "2026-08-08T00:00:00.000Z" }));
  const packet = {
    records,
    topic: fixture.topic,
    latestUserMessage: `Profile: ${JSON.stringify(fixture.profile)}. Risk signals: ${fixture.riskSignals.join(", ")}`,
    kind: "decision",
    reversibility: "low",
    unknownCount: fixture.id === "missing-evidence" ? 3 : 0,
    explicitDepth: "deep",
  };
  let turn;
  if (variant === "single") turn = await runSingleAgent(packet, records, execute);
  else if (variant === "current") turn = await runSequentialFourAgent(packet, records, execute);
  else turn = (await orchestrateMeetingTurnDetailed(packet, execute)).turn;
  return scoreRecommendation(fixture, turn, rubric, {
    variant,
    fixture: false,
    maxModelCalls: variant === "single" ? 2 : 5,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    modelCalls,
    inputTokens,
    outputTokens,
  });
}

export function releaseDecision({ completedSamples, requiredSamples, meanIndependentGain, minimumGain }) {
  const enoughSamples = completedSamples >= requiredSamples;
  const thresholdMet = meanIndependentGain >= minimumGain;
  return { allowed: enoughSamples && thresholdMet, enoughSamples, thresholdMet };
}

function parseArgs(argv) {
  const option = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  return { variant: option("--variant") || "all", caseId: option("--case"), offlineFixture: argv.includes("--offline-fixture"), release: argv.includes("--release") };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!options.offlineFixture && !apiKey) throw new Error("Real-provider evals require OPENAI_API_KEY; use --offline-fixture only for deterministic harness verification.");
  const cases = JSON.parse(readFileSync(resolve(root, "evals/lifeorg/cases.json"), "utf8"));
  const rubric = JSON.parse(readFileSync(resolve(root, "evals/lifeorg/rubric.json"), "utf8"));
  const selectedCases = options.caseId ? cases.filter((item) => item.id === options.caseId) : cases;
  if (!selectedCases.length) throw new Error(`Unknown case: ${options.caseId}`);
  const selectedVariants = options.variant === "all" ? variants : [options.variant];
  for (const variant of selectedVariants) if (!variants.includes(variant)) throw new Error(`Unknown variant: ${variant}`);
  const rows = options.offlineFixture
    ? selectedCases.flatMap((fixture) => selectedVariants.map((variant) => scoreOfflineFixture(fixture, variant, rubric)))
    : await Promise.all(selectedCases.flatMap((fixture) => selectedVariants.map((variant) => scoreProviderCase(fixture, variant, rubric, apiKey))));
  for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
  if (rows.some((row) => !row.schemaValid || !row.completionValid || row.inventedCitations.length)) process.exitCode = 1;
  if (options.release) {
    const reviewPath = resolve(root, "evals/lifeorg/human-review.json");
    if (!existsSync(reviewPath)) { process.stderr.write("Release blocked: human-review.json is missing.\n"); process.exitCode = 1; return rows; }
    const review = JSON.parse(readFileSync(reviewPath, "utf8"));
    const decision = releaseDecision({ completedSamples: review.completedSamples, requiredSamples: rubric.release.requiredHumanSamples, meanIndependentGain: review.meanIndependentGain, minimumGain: rubric.release.minimumIndependentGain });
    if (!decision.allowed) { process.stderr.write(`Release blocked: ${JSON.stringify(decision)}\n`); process.exitCode = 1; }
  }
  return rows;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try { await runCli(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
