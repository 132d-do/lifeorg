## Context

LifeOrg currently implements stable routes, trusted per-user identity, additive D1 persistence, four explicit OpenAI Agents, deterministic meeting orchestration, evidence gates, approval-scoped mutations, and honest offline behavior. The next product risk is not missing Agent roles; it is whether a recommendation changes action over the next seven days and whether later outcomes reveal that the recommendation was well calibrated.

The initial audience is research students, applicants, and university students managing several simultaneous projects. They need help selecting one weekly outcome while retaining many longer-term goals. The product must treat rest, scope reduction, rescheduling, and rational stopping as legitimate governance outcomes.

## Goals / Non-Goals

**Goals:** one active primary seven-day cycle; a ten-second daily update; adaptive but non-shaming recovery; human-readable evidence boards; independent first-pass specialist judgment for deep decisions; falsifiable predictions and confidence; append-only outcome calibration; comparative Agent evals; globally visible OpenAI status; focused feature modules; additive migrations; deterministic and privacy-preserving operation.

**Non-goals:** monetary or social penalties, streak gamification, autonomous calendar writes, background email/SMS delivery, third-party task integration, multiple simultaneous primary cycles, medical/financial/legal decision automation, hidden chain-of-thought, model training on private records, or claims that Agent advice is guaranteed correct.

## Decisions

### One primary operating cycle

LifeOrg will allow many goals but at most one active primary cycle per user. A cycle contains one commitment, its source meeting/decision/goal, a start date, a review date no later than seven local calendar days later, a success criterion, a stop/adjust condition, and an optional recommendation prediction. A cycle may be created from an approved meeting mutation preview or manually from an owned goal. Manual creation remains available in structured offline mode.

Cycle lifecycle is `draft -> active -> review_due -> reviewed`, with `active -> adjusted -> active` and `active -> stopped -> reviewed` branches. Every transition is validated by one server state machine. `operating_cycles` stores the current projection; `cycle_events` records append-only facts including activation, check-in, adjustment proposal/approval, stop, review due, and review.

### Lightweight daily check-in and recovery

The daily interaction records exactly one of `completed`, `progressed`, `blocked`, `reduced`, `rescheduled`, or `stopped`, plus optional evidence, energy, and a short note. Missing a day never breaks a streak because no streak is displayed. A first blockage asks for the next removable constraint; repeated blockage invites an Operations adjustment and Risk/Audit check. Scope, deadline, or success-criterion changes remain proposals until the user approves them.

Low-energy mode activates when the submitted energy is below the user threshold or the user selects it. It limits the proposed next action to 5–15 minutes, prevents a second commitment, permits rest/recovery/information gathering, and prohibits moralized productivity language.

### Human-readable evidence board

The preparation flow presents evidence as facts, user preferences/boundaries, assumptions, unknowns, alternatives, and comparable historical decisions. Each item keeps an owned source reference and immutable meeting-time snapshot. Record IDs remain internal audit identifiers; the interface shows titles, source types, verification status, and why the evidence may matter.

LifeOrg may recommend evidence from the user's profile, goals, decisions, meetings, cycles, and reviews, but the user chooses the meeting packet. Unsupported prose supplied during a meeting is stored as an unverified assertion until linked to a record or explicitly classified as the user's current preference.

### Fast and deep meeting policy

Fast meetings cover daily and routine weekly planning. The Chief of Staff runs completeness and uses deterministic rules to invoke only the relevant specialist Agents. A fast meeting may still escalate to deep mode when consequences are hard to reverse, options conflict with the personal charter, material unknowns remain, or the user requests deep review.

Deep meetings cover advisor, admissions path, research direction, major deadline/resource conflicts, and similar consequential choices. Strategy, Operations, and Risk/Audit receive the same normalized evidence snapshot and cannot see peer conclusions during their first pass. The Chief of Staff receives all three validated contributions only after they finish, then reports consensus, disagreement, unsupported claims, and missing evidence. Agent agreement is not treated as evidence.

### Falsifiable recommendation contract

In addition to the existing concrete recommendation fields, a deep `ready` recommendation must contain: the central assumption; a forecasted observable outcome; confidence on a defined scale; evidence that would change the advice; one seven-day validation action; and the user's adoption mode (`full`, `partial`, or `self_directed`) captured at approval. Recommendations without valid record citations or a falsifiable outcome return `needs_input`.

The approval preview describes human-readable effects: cycle creation, goal/decision changes, reminder/review time, and explicitly unchanged records. Raw mutation JSON remains available only in a developer/audit view.

### Outcome calibration without self-reinforcing memory

On or after the review date, the user records observed evidence and separately rates action completion, recommendation accuracy, and decision value. The review never rewrites the original recommendation, evidence snapshot, forecast, or confidence. Outcomes inform aggregate evaluation and later meetings only as cited historical records; they are not silently inserted into prompts or training data.

### Modular boundaries

The current large workspace component will be decomposed only where touched by this change into `features/evidence`, `features/meetings`, `features/cycles`, `features/reviews`, `features/evals`, and `features/settings`. Each feature exposes typed components/contracts and depends on shared identity, storage, idempotency, and UI primitives rather than importing another feature's internals.

### Privacy-preserving evaluation and observability

The repository will contain synthetic or explicitly anonymized cases for advisor choice, admissions paths, paper direction/deadlines, overcommitment, low energy, contradictory evidence, and risky user preference. The harness compares a single-Agent baseline, the current orchestration, and independent deliberation using the same case and resource envelope.

Grading covers citation validity, evidence fidelity, alternative quality, risk detection, actionability, calibration, latency, and token cost. Automated graders assist but do not replace human sampling for release decisions. Production telemetry contains only user-scoped opaque run IDs, model/prompt/eval versions, duration, token totals, status, and redacted error class. Raw personal inputs, evidence, check-ins, and responses are not logged or added to eval datasets by default.

## Public Routes and APIs

Routes added: `/cycles`, `/cycles/[id]`, `/cycles/[id]/check-in`, and `/cycles/[id]/review`. The overview links to the current cycle and shows a semantic OpenAI status link to `/settings/integrations/openai`.

APIs added: `GET /api/cycles/current`, `GET|POST /api/cycles`, `GET /api/cycles/[id]`, `POST /api/cycles/[id]/check-ins`, `POST /api/cycles/[id]/adjustments`, `POST /api/cycles/[id]/review`, and `GET|POST /api/decisions/[id]/evidence`. All use trusted identity, ownership predicates, Zod contracts, client request IDs for mutations, and idempotent conflict behavior.

## Data Model

Add `evidence_items`, `operating_cycles`, `cycle_events`, `decision_forecasts`, and `recommendation_evaluations`. Every row carries `user_id`; source snapshots are immutable after meeting/cycle activation. A nullable `active_slot` with a unique `(user_id, active_slot)` constraint represents the single active primary slot; closed cycles clear the slot in the same transaction that appends the closing event. Migrations add tables, columns, constraints, and indexes only.

## Error Handling

- OpenAI failure leaves cycle/check-in/manual-review operations available and never fabricates Agent contributions.
- Recommendation or evidence-gate failure returns one critical question and makes no domain mutation.
- D1 failure keeps the form state visible, returns a retryable typed error, and relies on the same idempotency key for retry.
- Concurrent primary-cycle creation returns the existing owned active cycle or a typed conflict; it never overwrites it.
- Late check-ins preserve both the represented local day and actual server timestamp.
- Time boundaries use the user's IANA timezone with an explicit default of `Asia/Shanghai` until changed.

## Success and Release Gates

Pilot targets are: 80% first-cycle activation, at least four meaningful updates per seven-day cycle on average, 50% review completion, and at least 50% ending in completion, evidence-based reduction, rescheduling, or rational stopping. These are product-learning targets, not hard-coded behavior.

Release correctness requires zero invented record IDs, 100% citation validation for `ready`, required falsifiability fields, successful identity/idempotency/concurrency/migration/browser tests, and human-reviewed eval evidence that independent deliberation improves the chosen composite rubric over the current workflow. If it does not beat the single-Agent baseline reliably, product copy must not claim a reliability gain.

## Rollout and Stacked Delivery

Use `lifeorg/learning-loop-spec -> lifeorg/operating-cycles -> lifeorg/decision-evidence -> lifeorg/adaptive-experience -> lifeorg/evaluation-release`. Each branch targets the branch immediately below it, builds independently, and states its dependency in the PR description. Because gstack is not available in the current Codex environment, use native stacked Git branches/PRs with equivalent review gates. Merge bottom-up, then deploy the exact top commit to the existing Sites project. Rollback application code without reversing additive D1 tables.

## Open Questions

None. The user approved the audience, dual-core strategy, one-primary-cycle limit, fast/deep meeting split, modular architecture, data boundaries, eval approach, and stacked delivery.
