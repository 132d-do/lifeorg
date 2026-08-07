# LifeOrg Seven-Day Decision Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an approved LifeOrg recommendation into one governed seven-day commitment, collect lightweight daily evidence, calibrate the recommendation from outcomes, and measurably improve complex-decision Agent quality.

**Architecture:** Add a cycle bounded context with projection-plus-append-only events, a typed evidence/forecast context, and versioned comparative Agent evaluation. Preserve existing identity, idempotency, approval, D1, and offline boundaries; deep meetings use independent specialist first passes while fast meetings select specialists deterministically. Split only touched UI from `workspace-views.tsx` into focused feature modules and deliver through four implementation branches stacked on the committed specification branch.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16/Vinext, Cloudflare Workers and D1, Drizzle ORM, Zod 4, OpenAI Agents SDK, Node test runner, OpenSpec, OpenAI Sites.

---

## File and branch map

| Stack layer | Primary files | Responsibility |
|---|---|---|
| `lifeorg/operating-cycles` | `lib/server/cycles/*`, `app/api/cycles/**`, `db/schema.ts`, `drizzle/0005_*`, `tests/operating-cycles*.test.mjs` | Cycle contracts, lifecycle, storage, APIs, approval integration |
| `lifeorg/decision-evidence` | `lib/server/evidence/*`, `app/api/decisions/[id]/evidence/route.ts`, `lib/server/agents/{schemas,orchestrate,quality-gate}.ts`, `tests/decision-evidence*.test.mjs`, `tests/agent-reliability.test.mjs` | Evidence snapshots, forecasts, fast/deep modes, independent deliberation |
| `lifeorg/adaptive-experience` | `app/features/{cycles,evidence,meetings,reviews,settings}/**`, `app/components/{app-shell,workspace-views}.tsx`, `app/cycles/**`, `app/globals.css`, UI tests | Cycle cockpit, check-in/review, evidence board, low-energy mode, AI status |
| `lifeorg/evaluation-release` | `evals/lifeorg/**`, `scripts/run-agent-evals.mjs`, `lib/server/observability/*`, eval/E2E/security tests, OpenSpec tasks | Comparative quality evidence, privacy-safe telemetry, release and deployment |

The current `lifeorg/learning-loop-spec` commit `69b2d76` is the immutable base. Each new branch is created from and targets the immediately preceding layer.

### Task 1: Cycle contracts and deterministic lifecycle

**Files:**
- Create: `lib/server/cycles/contracts.ts`
- Create: `lib/server/cycles/state-machine.ts`
- Create: `tests/operating-cycles.test.mjs`

- [ ] **Step 1: Create the operating-cycle stack branch**

Run:

```bash
git switch -c lifeorg/operating-cycles
```

Expected: current branch is `lifeorg/operating-cycles`, based on `69b2d76`.

- [ ] **Step 2: Write failing lifecycle and contract tests**

Create `tests/operating-cycles.test.mjs` with imports through `tests/cloudflare-loader.mjs` and assertions equivalent to:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { applyCycleEvent, initialCycleLifecycle } from "../lib/server/cycles/state-machine.ts";
import { CycleCreateRequestSchema, CycleCheckInRequestSchema } from "../lib/server/cycles/contracts.ts";

test("cycle lifecycle accepts activation, adjustment, due review, and review", () => {
  let state = initialCycleLifecycle();
  state = applyCycleEvent(state, { type: "activate" });
  assert.equal(state.status, "active");
  state = applyCycleEvent(state, { type: "adjust" });
  assert.equal(state.status, "adjusted");
  state = applyCycleEvent(state, { type: "resume" });
  state = applyCycleEvent(state, { type: "review_due" });
  state = applyCycleEvent(state, { type: "review" });
  assert.deepEqual(state, { status: "reviewed", activeSlot: null });
});

test("review and stale transitions are rejected", () => {
  assert.throws(() => applyCycleEvent(initialCycleLifecycle(), { type: "review" }), /Invalid cycle transition/);
});

test("check-in distinguishes represented day from submission time", () => {
  const parsed = CycleCheckInRequestSchema.parse({
    clientRequestId: "check-in-2026-08-09",
    representedLocalDate: "2026-08-09",
    outcome: "blocked",
    energy: 3,
    note: "等待导师确认",
  });
  assert.equal(parsed.outcome, "blocked");
});

test("cycle review must be within seven local days", () => {
  assert.equal(CycleCreateRequestSchema.safeParse({
    clientRequestId: "cycle-too-long",
    commitment: "完成论文提纲",
    startLocalDate: "2026-08-08",
    reviewLocalDate: "2026-08-16",
    timeZone: "Asia/Shanghai",
    successCriterion: "完成三段提纲",
    stopOrAdjustCondition: "两次专注无进展则缩小范围",
    source: { type: "manual_goal", goalId: 1 },
  }).success, false);
});
```

- [ ] **Step 3: Run the focused test and verify missing-module failure**

Run:

```bash
node --test --import ./tests/cloudflare-loader.mjs tests/operating-cycles.test.mjs
```

Expected: FAIL with module-not-found for `lib/server/cycles/state-machine.ts` or `contracts.ts`.

- [ ] **Step 4: Implement strict contracts and one transition function**

Create `lib/server/cycles/contracts.ts` with strict Zod schemas for `CycleCreateRequest`, `CycleCheckInRequest`, `CycleAdjustmentRequest`, and `CycleReviewRequest`. Use this exact shared outcome contract:

```ts
import { z } from "zod";

export const CycleOutcomeSchema = z.enum([
  "completed", "progressed", "blocked", "reduced", "rescheduled", "stopped",
]);
export const CycleSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approved_meeting"), meetingId: z.number().int().positive(), mutationHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal("manual_goal"), goalId: z.number().int().positive() }).strict(),
]);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CycleCreateRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  commitment: z.string().min(3).max(500),
  startLocalDate: localDate,
  reviewLocalDate: localDate,
  timeZone: z.string().min(1).max(100).default("Asia/Shanghai"),
  successCriterion: z.string().min(3).max(500),
  stopOrAdjustCondition: z.string().min(3).max(500),
  source: CycleSourceSchema,
}).strict().superRefine((value, context) => {
  const start = Date.parse(`${value.startLocalDate}T00:00:00Z`);
  const review = Date.parse(`${value.reviewLocalDate}T00:00:00Z`);
  const days = (review - start) / 86_400_000;
  if (days < 1 || days > 7) context.addIssue({ code: "custom", path: ["reviewLocalDate"], message: "review must be 1-7 local days after start" });
});

export const CycleCheckInRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  representedLocalDate: localDate,
  outcome: CycleOutcomeSchema,
  energy: z.number().int().min(1).max(10).optional(),
  note: z.string().max(1200).default(""),
  evidence: z.string().max(2000).default(""),
}).strict();

export const CycleAdjustmentRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  action: z.enum(["approve", "reject"]),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
  commitment: z.string().min(3).max(500).optional(),
  reviewLocalDate: localDate.optional(),
  successCriterion: z.string().min(3).max(500).optional(),
  stopOrAdjustCondition: z.string().min(3).max(500).optional(),
}).strict();

export const CycleReviewRequestSchema = z.object({
  clientRequestId: z.string().min(6).max(200),
  observedEvidence: z.string().min(1).max(3000),
  actionCompletion: z.number().int().min(1).max(5),
  recommendationAccuracy: z.number().int().min(1).max(5).nullable(),
  decisionValue: z.number().int().min(1).max(5),
}).strict();

export type CycleCreateRequest = z.infer<typeof CycleCreateRequestSchema>;
export type CycleCheckInRequest = z.infer<typeof CycleCheckInRequestSchema>;
export type CycleAdjustmentRequest = z.infer<typeof CycleAdjustmentRequestSchema>;
export type CycleReviewRequest = z.infer<typeof CycleReviewRequestSchema>;
```

Create `lib/server/cycles/state-machine.ts` with a closed event union and guards:

```ts
export type CycleStatus = "draft" | "active" | "adjusted" | "review_due" | "stopped" | "reviewed";
export type CycleLifecycle = { status: CycleStatus; activeSlot: "primary" | null };
export type CycleEvent =
  | { type: "activate" } | { type: "adjust" } | { type: "resume" }
  | { type: "review_due" } | { type: "stop" } | { type: "review" };

export const initialCycleLifecycle = (): CycleLifecycle => ({ status: "draft", activeSlot: null });

export function applyCycleEvent(current: CycleLifecycle, event: CycleEvent): CycleLifecycle {
  if (event.type === "activate" && current.status === "draft") return { status: "active", activeSlot: "primary" };
  if (event.type === "adjust" && current.status === "active") return { status: "adjusted", activeSlot: "primary" };
  if (event.type === "resume" && current.status === "adjusted") return { status: "active", activeSlot: "primary" };
  if (event.type === "review_due" && current.status === "active") return { status: "review_due", activeSlot: "primary" };
  if (event.type === "stop" && ["active", "adjusted", "review_due"].includes(current.status)) return { status: "stopped", activeSlot: null };
  if (event.type === "review" && ["active", "review_due", "stopped"].includes(current.status)) return { status: "reviewed", activeSlot: null };
  throw new Error(`Invalid cycle transition: ${current.status} -> ${event.type}`);
}
```

- [ ] **Step 5: Run tests and commit**

Run the focused command again. Expected: PASS. Then:

```bash
git add lib/server/cycles/contracts.ts lib/server/cycles/state-machine.ts tests/operating-cycles.test.mjs
git commit -m "feat: define seven-day operating cycle"
```

### Task 2: Additive cycle persistence and concurrency enforcement

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0005_seven_day_decision_learning_loop.sql`
- Create: `lib/server/cycles/repository.ts`
- Create: `lib/server/cycles/d1-repository.ts`
- Create: `lib/server/cycles/in-memory-repository.ts`
- Create: `tests/operating-cycle-storage.test.mjs`

- [ ] **Step 1: Write failing storage tests**

Test identical create retry, conflicting client-key reuse, two concurrent primary creates, append-only ordering, cross-user not-found, and atomic review/slot clearing. The concurrency assertion must be:

```js
const [left, right] = await Promise.allSettled([
  repository.createCycle(userA, createRequest("first-cycle")),
  repository.createCycle(userA, createRequest("second-cycle")),
]);
assert.equal([left, right].filter((item) => item.status === "fulfilled").length, 1);
assert.equal(await repository.countActive(userA), 1);
```

- [ ] **Step 2: Verify the storage test fails**

Run:

```bash
node --test --import ./tests/cloudflare-loader.mjs tests/operating-cycle-storage.test.mjs
```

Expected: FAIL because repository and schema exports do not exist.

- [ ] **Step 3: Add Drizzle schema and inspected SQL**

Add `operatingCycles` with integer ID, user ID, client request ID, nullable unique active slot, source type/ID/hash, commitment, dates/timezone, criteria, lifecycle, current projection JSON, and timestamps. Add `cycleEvents` with text ID, user/cycle/client request IDs, sequence, event type, represented local date, structured payload, and timestamp. Required indexes:

```ts
uniqueIndex("operating_cycles_user_client_request_unique").on(table.userId, table.clientRequestId),
uniqueIndex("operating_cycles_user_active_slot_unique").on(table.userId, table.activeSlot),
uniqueIndex("cycle_events_user_cycle_client_request_unique").on(table.userId, table.cycleId, table.clientRequestId),
uniqueIndex("cycle_events_cycle_sequence_unique").on(table.cycleId, table.sequence),
```

Create additive SQL with `CREATE TABLE`, `CREATE UNIQUE INDEX`, and no `DROP`, `DELETE`, table rename, or destructive backfill. Use nullable `active_slot`; closed cycles set it to `NULL`.

- [ ] **Step 4: Implement repository interface and two adapters**

`lib/server/cycles/repository.ts` must define:

```ts
export interface CycleRepository {
  createCycle(userId: string, request: CycleCreateRequest): Promise<{ cycle: OperatingCycle; created: boolean }>;
  getCurrent(userId: string): Promise<OperatingCycle | null>;
  list(userId: string): Promise<OperatingCycle[]>;
  get(userId: string, cycleId: number): Promise<OperatingCycle | null>;
  appendCheckIn(userId: string, cycleId: number, request: CycleCheckInRequest): Promise<CycleEventRecord>;
  applyAdjustment(userId: string, cycleId: number, request: CycleAdjustmentRequest): Promise<OperatingCycle>;
  review(userId: string, cycleId: number, request: CycleReviewRequest): Promise<OperatingCycle>;
}
```

The D1 adapter must bind `user_id` in every query, execute projection/event changes through `env.DB.batch`, and read back persisted results rather than returning optimistic objects. The in-memory adapter must mirror uniqueness and append-only behavior for service tests.

- [ ] **Step 5: Generate/check migration, run tests, and commit**

Run:

```bash
npm run db:generate
rg -n "DROP|DELETE FROM|ALTER TABLE .* RENAME" drizzle/0005_seven_day_decision_learning_loop.sql
node --test --import ./tests/cloudflare-loader.mjs tests/operating-cycle-storage.test.mjs
```

Expected: migration generation/check succeeds, destructive scan has no matches, storage tests PASS. Commit:

```bash
git add db/schema.ts drizzle lib/server/cycles tests/operating-cycle-storage.test.mjs
git commit -m "feat: persist one active operating cycle"
```

### Task 3: Cycle service, public APIs, and approval integration

**Files:**
- Create: `lib/server/cycles/service.ts`
- Create: `lib/server/cycles/route-service.ts`
- Create: `app/api/cycles/route.ts`
- Create: `app/api/cycles/current/route.ts`
- Create: `app/api/cycles/[id]/route.ts`
- Create: `app/api/cycles/[id]/check-ins/route.ts`
- Create: `app/api/cycles/[id]/adjustments/route.ts`
- Create: `app/api/cycles/[id]/review/route.ts`
- Modify: `lib/server/agents/schemas.ts`
- Modify: `lib/server/meetings/d1-repository.ts`
- Modify: `lib/server/meetings/service.ts`
- Create: `tests/operating-cycle-api.test.mjs`

- [ ] **Step 1: Write failing service/API tests**

Cover trusted identity, cross-user 404, manual owned-goal validation, identical retry, second-active conflict, check-in retry, exact adjustment hash, review slot clearing, and approved `cycle.create` meeting mutation. Include:

```js
const response = await service.create(userA, request);
assert.equal(response.cycle.status, "active");
await assert.rejects(service.get(userB, response.cycle.id), (error) => error.code === "not_found");
const retried = await service.checkIn(userA, response.cycle.id, checkIn);
assert.deepEqual(await service.checkIn(userA, response.cycle.id, checkIn), retried);
```

- [ ] **Step 2: Run and verify the focused failure**

Run:

```bash
node --test --import ./tests/cloudflare-loader.mjs tests/operating-cycle-api.test.mjs
```

Expected: FAIL because `createCycleService` and routes are absent.

- [ ] **Step 3: Implement service and route context**

`createCycleService` must parse every request, validate source ownership, map missing records to `not_found`, use canonical hashes for adjustment proposals, and delegate atomic writes to the repository. `cycleRequestContext` must call the existing `resolveIdentity`/session boundary before constructing `D1CycleRepository`. Map errors as: 401 identity, 400 Zod, 404 not found, 409 active/idempotency conflict, 422 invalid state, 500 redacted service failure.

Each route stays thin, for example:

```ts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { identity, service } = await cycleRequestContext(request);
    return Response.json(await service.checkIn(identity, Number((await params).id), await request.json()));
  } catch (error) {
    return cycleApiError(error);
  }
}
```

- [ ] **Step 4: Add approval-scoped cycle creation**

Extend `MutationPreviewSchema` with a strict `cycle.create` variant containing commitment, dates, timezone, success/stop criteria, and optional prediction ID. In the meeting repository allow-list, validate the active slot inside the same approval transaction/batch, insert the cycle and activation event, and fail the complete approval if the slot is occupied. Do not add cycle creation to edit, reject, turn, or view paths.

- [ ] **Step 5: Run cycle, governance, identity, and full tests; commit**

Run:

```bash
node --test --import ./tests/cloudflare-loader.mjs tests/operating-cycles.test.mjs tests/operating-cycle-storage.test.mjs tests/operating-cycle-api.test.mjs tests/guided-meetings-governance.test.mjs tests/identity-bootstrap.test.mjs
npm run lint
npm run build
```

Expected: all selected tests, lint, and build PASS. Commit:

```bash
git add app/api/cycles lib/server/cycles lib/server/agents/schemas.ts lib/server/meetings db drizzle tests
git commit -m "feat: expose governed operating cycles"
```

### Task 4: Decision evidence and immutable forecasts

**Files:**
- Create: `lib/server/evidence/contracts.ts`
- Create: `lib/server/evidence/repository.ts`
- Create: `lib/server/evidence/d1-repository.ts`
- Create: `lib/server/evidence/service.ts`
- Create: `lib/server/evidence/route-service.ts`
- Create: `app/api/decisions/[id]/evidence/route.ts`
- Modify: `db/schema.ts`
- Create: next additive Drizzle migration generated after `0005`
- Create: `tests/decision-evidence.test.mjs`

- [ ] **Step 1: Create the evidence stack branch and failing tests**

Run `git switch -c lifeorg/decision-evidence`. Test the six evidence kinds, owned-source validation, assertion/preference distinction, snapshot immutability, cross-user 404, and idempotent create. Use:

```js
const fact = EvidenceItemInputSchema.parse({
  clientRequestId: "evidence-advisor-capacity",
  kind: "fact",
  title: "导师本学期只接收一名学生",
  content: "邮件记录显示名额为一人",
  verification: "record_backed",
  source: { type: "decision", id: "7" },
});
assert.equal(fact.kind, "fact");
```

- [ ] **Step 2: Verify missing-module failure**

Run the focused evidence test. Expected: FAIL because evidence contracts/storage do not exist.

- [ ] **Step 3: Implement schemas and additive persistence**

Define `EvidenceKindSchema` as `fact | preference | assumption | unknown | alternative | historical_analogue`, `verification` as `record_backed | user_confirmed | unverified`, and a source union supporting profile/goal/meeting/decision/cycle/review. Add `evidence_items`, `decision_forecasts`, and `recommendation_evaluations`, each with `user_id`, source IDs, immutable snapshot JSON, and version/timestamps. Forecast confidence is an integer 0–100; UI labels may map it to low/medium/high.

- [ ] **Step 4: Implement owned evidence API**

`GET` returns grouped human-readable items and recommended owned records. `POST` accepts one strict item, verifies the owning decision/source, and returns 201 or the prior idempotent row. Store an immutable source snapshot at creation. User prose with no source must use `unverified`, except a preference explicitly confirmed by the user may use `user_confirmed`.

- [ ] **Step 5: Run migration/evidence tests and commit**

Run focused tests, destructive SQL scan, lint, and build. Commit:

```bash
git add app/api/decisions lib/server/evidence db/schema.ts drizzle tests/decision-evidence.test.mjs
git commit -m "feat: add decision evidence snapshots"
```

### Task 5: Fast/deep policy, independent deliberation, and falsifiability gate

**Files:**
- Create: `lib/server/agents/meeting-policy.ts`
- Modify: `lib/server/agents/schemas.ts`
- Modify: `lib/server/agents/registry.ts`
- Modify: `lib/server/agents/orchestrate.ts`
- Modify: `lib/server/agents/quality-gate.ts`
- Modify: `lib/server/agents/openai-executor.ts`
- Modify: `lib/server/agents/legacy-adapter.ts`
- Modify: `lib/server/agents/offline.ts`
- Modify: `lib/server/meetings/contracts.ts`
- Modify: `lib/server/meetings/service.ts`
- Modify: `tests/agent-kernel.test.mjs`
- Modify: `tests/guided-meetings.test.mjs`
- Modify: `tests/guided-meetings-governance.test.mjs`
- Create: `tests/agent-reliability.test.mjs`

- [ ] **Step 1: Write failing policy and independence tests**

Tests must prove consequential kinds escalate, routine daily meetings select Chief+Operations, deep specialists receive no peer contributions, synthesis receives all validated contributions, and `ready` fails without assumption/forecast/change evidence. Record inputs in a fake executor:

```js
const seen = [];
const execute = async ({ phase, agent, input }) => {
  seen.push({ phase, agent: agent.name, input });
  return fixtureFor(phase, agent.name);
};
await orchestrateMeetingTurnDetailed(deepPacket, execute);
for (const run of seen.filter((item) => item.phase === "specialist")) {
  assert.equal("contributions" in run.input, false);
}
assert.equal(seen.filter((item) => item.phase === "specialist").length, 3);
```

- [ ] **Step 2: Verify focused test failure**

Run the Agent reliability test. Expected: FAIL on missing policy and new recommendation fields.

- [ ] **Step 3: Implement deterministic mode/role selection**

`classifyMeetingMode` accepts meeting kind, reversibility, charter conflict, unknown count, and explicit depth. It returns:

```ts
type MeetingPolicy = {
  mode: "fast" | "deep";
  specialistRoles: Array<"strategy" | "operations" | "risk">;
  policyVersion: "2026-08-08.v1";
  reason: string;
};
```

Decision meetings and consequential flags return all three specialists. Routine daily returns Operations; weekly returns Operations and Risk; monthly returns Strategy and Risk unless escalated. The Chief always runs completeness and synthesis. The UI/API response records mode without claiming absent Agents participated.

- [ ] **Step 4: Extend recommendation schemas and gate**

Add strict fields:

```ts
centralAssumption: z.string().min(3).max(500),
forecast: z.object({ observableOutcome: z.string().min(3).max(500), confidencePercent: z.number().int().min(0).max(100), evidenceThatChangesAdvice: z.array(z.string().min(3).max(300)).min(1).max(5) }).strict(),
sevenDayValidationAction: z.string().min(3).max(500),
adoptionMode: z.enum(["full", "partial", "self_directed"]).optional(),
orchestrationVersion: z.string().min(1),
promptVersion: z.string().min(1),
schemaVersion: z.literal("2026-08-08.v1"),
```

`gateRecommendation` checks cited IDs, at least one change-evidence item, non-generic observable outcome, and presence of a cycle preview for approved action. Missing fields return one `needs_input` question. Approval requires adoption mode and preserves Agent recommendation when the user chooses `self_directed`.

Update the four Agent instructions, legacy adapter, offline result, and every existing recommendation fixture to the same versioned schema. Legacy/offline code must return `needs_input` or explicitly labeled offline state when it cannot supply a genuine forecast; it must not manufacture the new deep-decision fields to satisfy the gate.

- [ ] **Step 5: Run all Agent/meeting tests and commit**

Run Agent kernel, guided meetings, governance, OpenAI security, evidence, lint, and build. Expected: PASS. Commit:

```bash
git add lib/server/agents lib/server/meetings tests/agent-reliability.test.mjs
git commit -m "feat: deepen evidence-based agent decisions"
```

### Task 6: Cycle routes and focused client modules

**Files:**
- Create: `app/features/shared/use-life-state.ts`
- Create: `app/features/cycles/contracts.ts`
- Create: `app/features/cycles/cycle-list.tsx`
- Create: `app/features/cycles/cycle-detail.tsx`
- Create: `app/features/cycles/cycle-check-in.tsx`
- Create: `app/features/reviews/cycle-review.tsx`
- Create: `app/cycles/page.tsx`
- Create: `app/cycles/[id]/page.tsx`
- Create: `app/cycles/[id]/check-in/page.tsx`
- Create: `app/cycles/[id]/review/page.tsx`
- Modify: `app/components/workspace-views.tsx`
- Modify: `app/globals.css`
- Create: `tests/operating-cycle-ui.test.mjs`

- [ ] **Step 1: Create adaptive-experience branch and failing route/UI tests**

Run `git switch -c lifeorg/adaptive-experience`. Assert all four URLs render, detail deep-links fetch owned data, daily buttons have accessible names, submission uses a persistent session idempotency key, and review separates the three scores.

- [ ] **Step 2: Verify route/UI failure**

Run:

```bash
node --test --import ./tests/cloudflare-loader.mjs tests/operating-cycle-ui.test.mjs tests/navigation-contract.test.mjs
```

Expected: FAIL because cycle pages and navigation contracts are absent.

- [ ] **Step 3: Extract shared state hook without behavior changes**

Move `Profile`, `Goal`, `Meeting`, `Decision`, `Reminder`, `LifeState`, `emptyState`, `protectedFetch`, and `useLifeState` into `app/features/shared/use-life-state.ts`. Keep the existing API and error strings so old pages/tests remain stable. Update imports before adding cycle UI and run navigation/rendered tests to prove behavior preservation.

- [ ] **Step 4: Implement cycle pages and accessible controls**

Use a discriminated client view state: `loading | ready | empty | error`. The check-in page renders six semantic buttons and conditionally shows energy/note/evidence. Persist one `clientRequestId` in `sessionStorage` until a 2xx response, then clear it. The review form contains explicit 1–5 controls for completion, accuracy, and value and disables accuracy only for manual cycles with no Agent recommendation.

Low-energy mode is derived from energy below the profile threshold (default 4) or explicit selection. It labels suggested actions `5–15 分钟`, offers `恢复/休息` and `收集信息`, and never renders a second-cycle CTA.

- [ ] **Step 5: Add responsive styles, run UI/full tests, and commit**

Add `.cycle-cockpit`, `.cycle-timeline`, `.cycle-outcome-grid`, `.evidence-group`, `.energy-protection`, and mobile rules at the existing 690px breakpoint. Run focused UI, navigation, rendered HTML, lint, and build. Commit:

```bash
git add app/features app/cycles app/components/workspace-views.tsx app/globals.css tests/operating-cycle-ui.test.mjs
git commit -m "feat: add seven-day cycle experience"
```

### Task 7: Overview cockpit, evidence board, approval effects, and global AI status

**Files:**
- Create: `app/features/evidence/evidence-board.tsx`
- Create: `app/features/meetings/meeting-intake.tsx`
- Create: `app/features/meetings/recommendation-effects.tsx`
- Create: `app/features/settings/openai-status-link.tsx`
- Create: `app/features/cycles/overview-cockpit.tsx`
- Modify: `app/components/app-shell.tsx`
- Modify: `app/components/workspace-views.tsx`
- Modify: `app/globals.css`
- Create: `tests/adaptive-experience.test.mjs`

- [ ] **Step 1: Write failing adaptive-experience tests**

Assert the overview prioritizes an active commitment, no unrelated daily-meeting CTA appears during it, evidence uses titles/verification instead of bare IDs, user view omits mutation JSON, approval effects list changed/unchanged records, and every page links OpenAI status to `/settings/integrations/openai`.

- [ ] **Step 2: Verify tests fail on current UI**

Run adaptive, guided-meetings UI, and navigation tests. Expected: FAIL on missing global status and raw `<pre>{JSON.stringify(...)}`.

- [ ] **Step 3: Implement global AI status and cockpit**

`OpenAIStatusLink` fetches the existing safe status endpoint through `protectedFetch`, maps configured/absent/error to `真实 Agent 已连接`, `结构化离线模式`, or `连接异常`, and always renders a semantic link. `AppShell` includes it in the page header and retains the existing sync state separately.

`OverviewCockpit` receives current cycle plus existing state. With a cycle it renders commitment, smallest action, days to review, blockage/approval, and source link first. Without a cycle it offers manual goal selection or a meeting. Aggregate counts remain below.

- [ ] **Step 4: Replace intake and raw mutation rendering**

`EvidenceBoard` groups typed items and keeps internal IDs in checkbox values/requests only. `RecommendationEffects` maps allow-listed mutations to sentences such as `创建 7 日周期：完成论文三段提纲` and lists unchanged records. Move raw JSON behind a `<details>` element shown only when `process.env.NODE_ENV !== "production"` or an explicit audit flag is true.

- [ ] **Step 5: Run browser-contract tests, lint/build, and commit**

Run adaptive UI, meeting UI, navigation, rendered HTML, worker smoke, lint, and build. Commit:

```bash
git add app/features app/components app/globals.css tests/adaptive-experience.test.mjs
git commit -m "feat: focus LifeOrg on the active commitment"
```

### Task 8: Comparative Agent evaluation and private telemetry boundary

**Files:**
- Create: `evals/lifeorg/cases.json`
- Create: `evals/lifeorg/rubric.json`
- Create: `evals/lifeorg/README.md`
- Create: `scripts/run-agent-evals.mjs`
- Create: `lib/server/observability/agent-run-metadata.ts`
- Modify: `lib/server/agents/orchestrate.ts`
- Modify: `lib/server/agents/openai-executor.ts`
- Create: `tests/agent-evals.test.mjs`
- Create: `tests/observability-privacy.test.mjs`

- [ ] **Step 1: Create evaluation-release branch and failing tests**

Run `git switch -c lifeorg/evaluation-release`. Tests must validate at least seven case categories, identical evidence packets across variants, versioned rubric components, no personal content fields in metadata schema, and a release-claim decision based on human sampling.

- [ ] **Step 2: Add synthetic cases and explicit rubric**

Each JSON case contains `id`, `category`, `topic`, `profile`, `records`, `expectedEvidenceIds`, `riskSignals`, and `humanRubricNotes`; it contains no copied production data. Rubric components are `citationValidity`, `evidenceFidelity`, `alternativeQuality`, `riskDetection`, `actionability`, and `calibration`, each 0–4, with latency/token cost reported separately.

- [ ] **Step 3: Implement deterministic eval runner**

The script accepts `--variant single|current|independent|all`, `--case`, and `--offline-fixture`. It emits JSON Lines with case/variant/config versions, component scores, duration, and tokens. It must use the same normalized packet and declared maximum calls for comparable variants. Exit nonzero on invented citations, schema failures, or missing human-review artifact when `--release` is supplied.

- [ ] **Step 4: Implement telemetry allow-list**

Define and parse only:

```ts
export const AgentRunMetadataSchema = z.object({
  runId: z.string().uuid(),
  pseudonymousUserId: z.string().regex(/^[a-f0-9]{32}$/),
  meetingMode: z.enum(["fast", "deep"]),
  model: z.string().min(1).max(100),
  promptVersion: z.string().min(1).max(100),
  schemaVersion: z.string().min(1).max(100),
  evalVersion: z.string().min(1).max(100),
  durationMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  status: z.enum(["ready", "needs_input", "offline", "error"]),
  errorClass: z.string().max(100).nullable(),
}).strict();
```

Do not pass packet, prompt, response, note, evidence, or credential objects to this constructor. Hash the trusted user ID server-side and truncate to 32 hex characters.

- [ ] **Step 5: Run eval/privacy tests and commit**

Run the offline fixture eval, tests, secret scan, lint, and build. Commit:

```bash
git add evals scripts/run-agent-evals.mjs lib/server/observability lib/server/agents tests/agent-evals.test.mjs tests/observability-privacy.test.mjs
git commit -m "test: evaluate decision quality and privacy"
```

### Task 9: Full journey, migration, and release verification

**Files:**
- Create: `tests/decision-learning-loop-e2e.test.mjs`
- Modify: `tests/worker-route-smoke.mjs`
- Modify: `tests/navigation-contract.test.mjs`
- Modify: `tests/openai-security.test.mjs`
- Modify: `openspec/changes/lifeorg-seven-day-decision-learning-loop/tasks.md`
- Modify: `README.md`

- [ ] **Step 1: Add the complete decision-to-review acceptance test**

The test must create a deep meeting, select real evidence, assert independent specialist inputs, approve a `cycle.create` preview, perform blocked/reduced/progressed/completed check-ins, review on day seven, and assert original recommendation/forecast snapshots are unchanged. Add a parallel offline scenario that manually creates and reviews a cycle without Agent speech.

- [ ] **Step 2: Expand route, security, and migration assertions**

Enumerate every cycle route/API method, assert unsupported methods fail, assert cross-user identifiers do not reveal existence, inspect client bundles/log objects for key or personal fixtures, and apply all migrations from an existing pre-cycle fixture before reading prior goals/meetings/decisions.

- [ ] **Step 3: Run the full local verification matrix**

Run:

```bash
openspec.cmd validate lifeorg-seven-day-decision-learning-loop --strict
npm run db:generate
npm run lint
npm run build
node --test --import ./tests/cloudflare-loader.mjs tests/*.test.mjs
node scripts/run-agent-evals.mjs --variant all --offline-fixture
git diff --check
```

Expected: OpenSpec valid, no unexpected migration, lint/build pass, all tests pass, eval exits 0, diff check clean.

- [ ] **Step 4: Update documentation and OpenSpec task evidence**

README must describe the current cycle, fast/deep modes, server-only key, offline behavior, eval command, migration, and no reliability claim without evidence. Check each completed OpenSpec task only after its command/test evidence exists; leave production-only tasks unchecked until deployment.

- [ ] **Step 5: Commit the release candidate**

```bash
git add tests openspec/changes/lifeorg-seven-day-decision-learning-loop/tasks.md README.md
git commit -m "test: verify the decision learning loop"
```

### Task 10: Review, native stacked PR publication, and Sites deployment

**Files:**
- No feature-code files unless review identifies a defect.
- Modify after production verification: `openspec/changes/lifeorg-seven-day-decision-learning-loop/tasks.md`

- [ ] **Step 1: Review every stack layer**

For each branch, inspect `git diff <base>...HEAD`, run its focused tests plus lint/build, verify no unrelated files, and record the exact commit. Use the requesting-code-review workflow before publication; address findings on the owning layer rather than only on the top branch, then restack descendants.

- [ ] **Step 2: Publish native stacked PRs**

Publish dependencies as:

```text
lifeorg/learning-loop-spec -> repository default branch
lifeorg/operating-cycles -> lifeorg/learning-loop-spec
lifeorg/decision-evidence -> lifeorg/operating-cycles
lifeorg/adaptive-experience -> lifeorg/decision-evidence
lifeorg/evaluation-release -> lifeorg/adaptive-experience
```

Each PR description states parent, child, scope, tests, migration impact, privacy impact, and rollback. Do not target every PR directly at `main` while reviews are in progress.

- [ ] **Step 3: Verify GitHub checks and merge bottom-up**

Wait for checks on all layers. Merge the spec layer first, retarget/rebase the next PR onto the merged commit without rewriting user work, and continue bottom-up. After each merge, verify the next PR contains only its own delta.

- [ ] **Step 4: Deploy the exact merged top commit to Sites**

Use the Sites building/hosting workflow because `.openai/hosting.json` is present. Apply additive D1 migrations, configure only server-side secrets, deploy, then smoke-test overview, OpenAI status, deep meeting, cycle creation, check-in, review, offline labeling, and cross-user denial on production. Preserve the prior deployment for rollback.

- [ ] **Step 5: Verify and archive OpenSpec**

After production acceptance:

```bash
openspec.cmd validate --all --strict
openspec.cmd archive lifeorg-seven-day-decision-learning-loop --yes
openspec.cmd validate --all --strict
```

Commit the archive and final task evidence, publish/merge the documentation-only archive PR, and confirm production still points at the verified feature commit.
