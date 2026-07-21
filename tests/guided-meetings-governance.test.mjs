import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalMutationHash } from "../lib/server/meetings/contracts.ts";
import { completedDecisionResponse, completedTurnResponse } from "../lib/server/meetings/completion-fence.ts";
import { InMemoryMeetingRepository, createMeetingService } from "../lib/server/meetings/service.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const user = { userId: "chatgpt:ceo@example.com", displayName: "CEO", source: "sites", sessionId: "session:test" };
const records = [
  { id: "profile:self", type: "profile", title: "章程", summary: "可持续", updatedAt: "2026-07-20" },
  { id: "goal:1", type: "goal", title: "论文", summary: "进展 50%", updatedAt: "2026-07-20" },
];
const request = { clientRequestId: "create-claim", kind: "weekly", topic: "决定本周唯一结果", intake: { message: "精力有限" }, evidence: [{ type: "profile", id: "self" }, { type: "goal", id: "1" }] };

test("duplicate canonical evidence is deduplicated and profile evidence is locked to self", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records } });
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "needs_input", question: "还缺什么？", missingEvidence: ["capacity"] }) });
  const created = await service.create(user, { ...request, evidence: [...request.evidence, { type: "goal", id: "1" }] });
  const room = await service.get(user, created.meetingId);
  assert.deepEqual(room.records.map((record) => record.id), ["profile:self", "goal:1"]);
  await assert.rejects(service.create(user, { ...request, clientRequestId: "bad-profile", evidence: [{ type: "profile", id: "other" }, { type: "goal", id: "1" }] }), (error) => error.code === "invalid_evidence");
  await assert.rejects(service.create(user, { ...request, clientRequestId: "duplicate-only", evidence: [{ type: "profile", id: "self" }, { type: "profile", id: "self" }] }), (error) => error.code === "invalid_evidence");
});

test("concurrent duplicate turn owns one durable claim and later retry returns persisted output", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records } });
  const service = createMeetingService({ repository, deliberate: async () => { calls += 1; await gate; return { status: "needs_input", question: "可投入几小时？", missingEvidence: ["capacity"] }; } });
  const { meetingId } = await service.create(user, request);
  const first = service.turn(user, meetingId, { message: "开始", clientTurnId: "same-turn" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const duplicate = service.turn(user, meetingId, { message: "开始", clientTurnId: "same-turn" });
  await assert.rejects(Promise.race([duplicate, new Promise((_resolve, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "timeout" })), 30))]), (error) => error.code === "turn_in_progress");
  release();
  const result = await first;
  assert.deepEqual(await service.turn(user, meetingId, { message: "开始", clientTurnId: "same-turn" }), result);
  assert.equal(calls, 1);
});

test("a turn can only be completed by the durable lease owner", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records } });
  const room = await repository.createMeeting(user.userId, request, "create-fingerprint", records);
  const claim = await repository.claimTurn(user.userId, room.id, "owned-turn", "turn-fingerprint");
  assert.equal(claim.status, "claimed");
  assert.equal(typeof claim.leaseToken, "string");
  const response = { status: "needs_input", question: "还缺少多少可用时间？", missingEvidence: ["capacity"] };
  await assert.rejects(repository.completeTurn(user.userId, room, "owned-turn", response, "wrong-token"), (error) => error.code === "invalid_state");
  assert.deepEqual(await repository.completeTurn(user.userId, room, "owned-turn", response, claim.leaseToken), response);
});

test("ready persistence includes specialist contributions and full prior context", async () => {
  let received;
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records } });
  const recommendation = { recommendation: "本周只完成论文讨论章节并推迟新增项目。", evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "goal:1", claim: "论文是当前目标" }], deferredAlternative: "推迟新增项目", nextAction: "明天写出三段提纲", nextActionWindowHours: 24, deadlineOrReviewAt: "2026-07-22", successCriterion: "完成三段提纲", stopOrAdjustCondition: "两次专注后仍无提纲则缩小范围", confidence: "medium", unknowns: [], disagreements: [], mutationPreview: [{ type: "goal.update", goalId: 1, progress: 60 }] };
  const contributions = ["strategyArchitectAgent", "operationsOfficerAgent", "riskAuditorAgent"].map((role) => ({ role, conclusion: `${role} 结论`, evidenceIds: ["goal:1"], uncertainty: "未知", disagreements: [] }));
  const service = createMeetingService({ repository, deliberate: async (packet) => { received = packet; return { turn: { status: "ready", recommendation }, contributions }; } });
  const { meetingId } = await service.create(user, request);
  await service.turn(user, meetingId, { message: "补充第一轮", clientTurnId: "turn-one" });
  const room = await service.get(user, meetingId);
  assert.equal(room.messages.filter((message) => message.role.endsWith("Agent")).length, 4);
  assert.equal(received.intake.message, "精力有限");
  assert.ok(received.messages.some((message) => JSON.stringify(message.content).includes("补充第一轮")));
});

test("reject appends an immutable decision event and keeps the recommendation snapshot", () => {
  const schema = source("db/schema.ts");
  const sql = source("drizzle/0003_complete_guided_governance.sql");
  assert.match(schema, /meetingDecisionEvents/);
  assert.match(sql, /CREATE TABLE [`"]meeting_decision_events[`"]/i);
  assert.match(sql, /recommendation_snapshot/);
  assert.match(source("app/components/workspace-views.tsx"), /decisionHistory/);
});

test("approval audit stores a session identifier and meeting turn claims serialize D1 work", () => {
  const schema = source("db/schema.ts");
  const sql = source("drizzle/0003_complete_guided_governance.sql");
  assert.match(schema, /sessionId/);
  assert.match(schema, /meetingTurnClaims/);
  assert.match(schema, /meetingTurnLeases/);
  assert.match(sql, /session_id/);
  assert.match(sql, /client_turn_id/);
  assert.match(sql, /UNIQUE INDEX.*client_turn/i);
});

test("UI selects evidence, restores history, and sends a typed locked outcome intent", () => {
  const views = source("app/components/workspace-views.tsx");
  assert.match(views, /selectedEvidence/);
  assert.match(views, /room\.messages\.map/);
  assert.match(views, /lockedMutationIntent/);
  assert.match(views, /type:\s*["']decision\.reviewOutcome["']/);
  assert.match(views, /sessionStorage/);
});

test("D1 evidence summaries preserve readable facts for Agent grounding", () => {
  const repository = source("lib/server/meetings/d1-repository.ts");
  assert.match(repository, /进展 \$\{row\.progress\}%；状态 \$\{row\.status\}/);
  assert.match(repository, /\$\{row\.choice\}；\$\{row\.reason\}/);
  assert.doesNotMatch(repository, /锛|繘灞/);
});

test("meeting approval is exactly once across different client keys", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records }, goalsByUser: { [user.userId]: [{ id: 1, progress: 10 }] } });
  const recommendation = { recommendation: "本周只推进论文并推迟新增项目。", evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "goal:1", claim: "论文是当前目标" }], deferredAlternative: "推迟新增项目", nextAction: "明天写三段提纲", nextActionWindowHours: 24, deadlineOrReviewAt: "2026-07-22", successCriterion: "完成三段提纲", stopOrAdjustCondition: "两次专注后仍无提纲则缩小范围", confidence: "medium", unknowns: [], disagreements: [], mutationPreview: [{ type: "goal.update", goalId: 1, progress: 60 }] };
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const { meetingId } = await service.create(user, { ...request, clientRequestId: "exactly-once" });
  await service.turn(user, meetingId, { message: "材料完整", clientTurnId: "exactly-once-turn" });
  const mutationHash = await canonicalMutationHash(recommendation.mutationPreview);
  const first = await service.decide(user, meetingId, { action: "approve", idempotencyKey: "approval-first", mutationHash });
  const recovered = await service.decide(user, meetingId, { action: "approve", idempotencyKey: "approval-after-lost-response", mutationHash });
  assert.deepEqual(recovered, first);
  assert.equal(repository.approvalCount(user.userId, meetingId), 1);
  assert.match(source("db/schema.ts"), /meeting_approvals_user_meeting_unique/);
});

test("locked decision outcome cannot be changed by editing a recommendation", async () => {
  const lockedMutationIntent = { type: "decision.reviewOutcome", decisionId: 7, outcome: "保持论文优先有效", observedAt: "2026-07-20" };
  const lockedRecords = [...records, { id: "decision:7", type: "decision", title: "优先论文", summary: "减少并行项目", updatedAt: "2026-07-20" }];
  const recommendation = { recommendation: "保留论文优先策略。", evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "decision:7", claim: "已减少并行项目" }], deferredAlternative: "恢复并行项目", nextAction: "明天安排一个论文专注块", nextActionWindowHours: 24, deadlineOrReviewAt: "2026-07-22", successCriterion: "完成一个专注块", stopOrAdjustCondition: "精力连续下降则调整", confidence: "medium", unknowns: [], disagreements: [], mutationPreview: [lockedMutationIntent] };
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: lockedRecords } });
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const { meetingId } = await service.create(user, { ...request, clientRequestId: "locked-edit", kind: "decision", evidence: [{ type: "profile", id: "self" }, { type: "decision", id: "7" }], lockedMutationIntent });
  await service.turn(user, meetingId, { message: "材料完整", clientTurnId: "locked-edit-turn" });
  await assert.rejects(service.decide(user, meetingId, { action: "edit", idempotencyKey: "locked-edit-key", recommendation: { ...recommendation, mutationPreview: [{ ...lockedMutationIntent, outcome: "被编辑成另一个结果" }] } }), (error) => error.code === "mutation_mismatch");
});

test("approval audit requires an independent browser or Sites session", () => {
  const route = source("lib/server/meetings/route-service.ts");
  assert.match(route, /readAuditSessionId|oai-authenticated-user-session-id/);
  assert.doesNotMatch(route, /\?\?\s*resolved\.userId/);
  assert.match(source("app/api/session/route.ts"), /createAuditSessionCookie/);
});

test("all meeting decisions share one lease and completed transitions cannot be overwritten", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records } });
  const room = await repository.createMeeting(user.userId, request, "decision-lease-create", records);
  const first = await repository.claimDecision(user.userId, room.id, "edit-one", "edit-fingerprint");
  assert.equal(first.status, "claimed");
  assert.equal((await repository.claimDecision(user.userId, room.id, "approve-two", "approve-fingerprint")).status, "pending");
  await assert.rejects(repository.completeDecision(user.userId, room, "edit-one", { status: "ready", meetingId: room.id, approvalStatus: "pending" }, "wrong-token"), (error) => error.code === "invalid_state");
});

test("an edit that read stale state cannot overwrite a completed approval", async () => {
  let releaseEdit; let editReachedClaim;
  const editGate = new Promise((resolve) => { releaseEdit = resolve; });
  const reachedClaim = new Promise((resolve) => { editReachedClaim = resolve; });
  class DelayedEditRepository extends InMemoryMeetingRepository {
    async claimDecision(userId, meetingId, idempotencyKey, fingerprint) {
      if (idempotencyKey === "stale-edit") { editReachedClaim(); await editGate; }
      return super.claimDecision(userId, meetingId, idempotencyKey, fingerprint);
    }
  }
  const repository = new DelayedEditRepository({ recordsByUser: { [user.userId]: records }, goalsByUser: { [user.userId]: [{ id: 1, progress: 10 }] } });
  const recommendation = { recommendation: "本周只推进论文。", evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "goal:1", claim: "论文是当前目标" }], deferredAlternative: "推迟新项目", nextAction: "明天写提纲", nextActionWindowHours: 24, deadlineOrReviewAt: "2026-07-22", successCriterion: "完成提纲", stopOrAdjustCondition: "两次专注无进展则缩小范围", confidence: "medium", unknowns: [], disagreements: [], mutationPreview: [{ type: "goal.update", goalId: 1, progress: 60 }] };
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const { meetingId } = await service.create(user, { ...request, clientRequestId: "stale-decision" });
  await service.turn(user, meetingId, { message: "材料完整", clientTurnId: "stale-decision-turn" });
  const staleEdit = service.decide(user, meetingId, { action: "edit", idempotencyKey: "stale-edit", recommendation: { ...recommendation, recommendation: "先完成论文提纲。" } });
  await reachedClaim;
  const mutationHash = await canonicalMutationHash(recommendation.mutationPreview);
  await service.decide(user, meetingId, { action: "approve", idempotencyKey: "approval-wins", mutationHash });
  releaseEdit();
  await assert.rejects(staleEdit, (error) => error.code === "invalid_state");
  assert.equal((await service.get(user, meetingId)).lifecycle.status, "approved");
});

test("approval cannot apply domain mutations after a concurrent rejection wins", async () => {
  let releaseReject; let rejectReachedCommit;
  const rejectGate = new Promise((resolve) => { releaseReject = resolve; });
  const reachedCommit = new Promise((resolve) => { rejectReachedCommit = resolve; });
  class DelayedRejectRepository extends InMemoryMeetingRepository {
    async completeDecision(userId, room, idempotencyKey, response, leaseToken, fence) {
      if (idempotencyKey === "reject-wins") { rejectReachedCommit(); await rejectGate; }
      return super.completeDecision(userId, room, idempotencyKey, response, leaseToken, fence);
    }
  }
  const repository = new DelayedRejectRepository({ recordsByUser: { [user.userId]: records }, goalsByUser: { [user.userId]: [{ id: 1, progress: 10 }] } });
  const recommendation = { recommendation: "本周只推进论文。", evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "goal:1", claim: "论文是当前目标" }], deferredAlternative: "推迟新项目", nextAction: "明天写提纲", nextActionWindowHours: 24, deadlineOrReviewAt: "2026-07-22", successCriterion: "完成提纲", stopOrAdjustCondition: "两次专注无进展则缩小范围", confidence: "medium", unknowns: [], disagreements: [], mutationPreview: [{ type: "goal.update", goalId: 1, progress: 60 }] };
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const { meetingId } = await service.create(user, { ...request, clientRequestId: "reject-approve-race" });
  await service.turn(user, meetingId, { message: "材料完整", clientTurnId: "reject-approve-turn" });
  const rejecting = service.decide(user, meetingId, { action: "reject", idempotencyKey: "reject-wins" });
  await reachedCommit;
  const mutationHash = await canonicalMutationHash(recommendation.mutationPreview);
  await assert.rejects(service.decide(user, meetingId, { action: "approve", idempotencyKey: "late-approval", mutationHash }), (error) => error.code === "decision_in_progress");
  releaseReject(); await rejecting;
  await assert.rejects(service.decide(user, meetingId, { action: "approve", idempotencyKey: "late-approval-retry", mutationHash }), (error) => error.code === "invalid_state");
  assert.equal(repository.goal(user.userId, 1).progress, 10);
  assert.equal((await service.get(user, meetingId)).lifecycle.status, "draft");
});

test("decision service claims the lease before reloading authoritative room state", async () => {
  const events = [];
  class TraceRepository extends InMemoryMeetingRepository {
    async claimDecision(...args) { events.push("claim"); return super.claimDecision(...args); }
    async getMeeting(...args) { events.push("reload"); return super.getMeeting(...args); }
  }
  const repository = new TraceRepository({ recordsByUser: { [user.userId]: records } });
  const recommendation = { recommendation: "本周只推进论文。", evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "goal:1", claim: "论文是当前目标" }], deferredAlternative: "推迟新项目", nextAction: "明天写提纲", nextActionWindowHours: 24, deadlineOrReviewAt: "2026-07-22", successCriterion: "完成提纲", stopOrAdjustCondition: "两次专注无进展则缩小范围", confidence: "medium", unknowns: [], disagreements: [], mutationPreview: [] };
  const service = createMeetingService({ repository, deliberate: async () => ({ status: "ready", recommendation }) });
  const { meetingId } = await service.create(user, { ...request, clientRequestId: "claim-before-reload" });
  await service.turn(user, meetingId, { message: "材料完整", clientTurnId: "claim-before-reload-turn" });
  events.length = 0;
  await service.decide(user, meetingId, { action: "reject", idempotencyKey: "claim-before-reload-decision" });
  assert.deepEqual(events.slice(0, 2), ["claim", "reload"]);
});

test("persisted message order and model provenance survive a ready turn", async () => {
  const repository = new InMemoryMeetingRepository({ recordsByUser: { [user.userId]: records } });
  const recommendation = { recommendation: "本周只推进论文。", evidence: [{ recordId: "profile:self", claim: "章程要求可持续" }, { recordId: "goal:1", claim: "论文是当前目标" }], deferredAlternative: "推迟新项目", nextAction: "明天写提纲", nextActionWindowHours: 24, deadlineOrReviewAt: "2026-07-22", successCriterion: "完成提纲", stopOrAdjustCondition: "两次专注无进展则缩小范围", confidence: "medium", unknowns: [], disagreements: [], mutationPreview: [{ type: "goal.update", goalId: 1, progress: 60 }] };
  const contributions = ["strategyArchitectAgent", "operationsOfficerAgent", "riskAuditorAgent"].map((role) => ({ role, conclusion: `${role} 结论`, evidenceIds: ["goal:1"], uncertainty: "未知", disagreements: [] }));
  const service = createMeetingService({ repository, deliberate: async () => ({ turn: { status: "ready", recommendation }, contributions }) });
  const { meetingId } = await service.create(user, { ...request, clientRequestId: "message-provenance" });
  await service.turn(user, meetingId, { message: "材料完整", clientTurnId: "message-provenance-turn" });
  const room = await service.get(user, meetingId);
  assert.deepEqual(room.messages.map((message) => message.sequence), [1, 2, 3, 4, 5]);
  assert.deepEqual(room.messages.filter((message) => message.role.endsWith("Agent")).map((message) => message.modelMetadata.model), ["gpt-5.6-terra", "gpt-5.6-terra", "gpt-5.6-terra", "gpt-5.6-sol"]);
});

test("turn UI rejects non-2xx responses before publishing an Agent result", () => {
  const views = source("app/components/workspace-views.tsx");
  assert.match(views, /if \(!response\.ok\)[\s\S]{0,240}throw new Error/);
  assert.match(views, /pendingOperation\(window\.sessionStorage/);
  assert.match(views, /pending-turn/);
});

test("D1 read-after adapters reject an unfenced completion and return only persisted output", () => {
  const turn = { status: "needs_input", question: "还缺什么？", missingEvidence: ["capacity"] };
  assert.throws(() => completedTurnResponse({ status: "pending", response: "{}" }, turn), (error) => error.code === "turn_in_progress");
  assert.deepEqual(completedTurnResponse({ status: "completed", response: JSON.stringify(turn) }, { ...turn, question: "local stale output" }), turn);
  assert.throws(() => completedDecisionResponse(null, "decision-key"), (error) => error.code === "decision_in_progress");
});

test("legacy meetings remain readable and route users to a governed meeting with fresh evidence", () => {
  const repository = source("lib/server/meetings/d1-repository.ts");
  const views = source("app/components/workspace-views.tsx");
  assert.match(repository, /legacyAgentOutput:\s*parse\(row\.agentOutput/);
  assert.match(repository, /legacyInputs:\s*parse\(row\.inputs/);
  assert.match(views, /room\?\.clientRequestId\s*===\s*["']legacy["']/);
  assert.match(views, /href=\{`\/meetings\/new\/\$\{room\.kind\}`\}/);
  assert.match(views, /legacyAgentOutput/);
});

test("decision controls exist only while a recommendation is ready and pending", () => {
  const views = source("app/components/workspace-views.tsx");
  assert.match(views, /const canDecide\s*=\s*room\?\.lifecycle\.status\s*===\s*["']ready["']\s*&&\s*room\.lifecycle\.approvalStatus\s*===\s*["']pending["']/);
  assert.match(views, /\{canDecide\s*&&\s*<div className=["']meeting-actions["']/);
  assert.match(views, /room\?\.lifecycle\.status\s*===\s*["']approved["']/);
  assert.match(views, /room\?\.lifecycle\.status\s*===\s*["']draft["']/);
});
