# LifeOrg Seven-Day Decision Learning Loop Design

## Outcome

LifeOrg will evolve from an evidence-grounded meeting system into a learning operating system for research students, applicants, and multi-project university students. Every important recommendation can become one explicit seven-day commitment; daily evidence and the final outcome then calibrate both the user's judgment and future Agent recommendations.

The product will optimize two outcomes together: users return during the next seven days and perform or deliberately revise the approved action; complex-decision advice becomes more evidence-faithful, falsifiable, and measurably useful. The system does not promise objectively correct life decisions.

## Chosen Approach

The selected approach is a decision-action dual core rather than an execution-only habit tracker or an analysis-only decision laboratory.

```text
evidence -> guided decision -> independent specialist review -> approved recommendation
         -> one seven-day commitment -> daily evidence -> outcome review -> calibration
```

Many goals may remain active in the portfolio, but only one primary operating cycle may be active at a time. Completion, evidence-based scope reduction, rescheduling, recovery, and rational stopping are legitimate outcomes.

## Audience and Product Principles

The default user is a student balancing research, applications, coursework, health, and relationships. The interface therefore uses clear Chinese, short daily interactions, human-readable evidence, and explicit user approval. Company-governance language structures responsibility but does not turn life into KPI performance.

Principles:

1. One primary weekly promise is more useful than a larger generated task list.
2. Agent agreement is not evidence; every material claim must trace to a real record or be labeled inference.
3. Advice should generate a testable next step and state what would change it.
4. Failure to execute and failure of advice are different measurements.
5. Rest, stopping, and reduction can be good decisions.
6. Offline operation remains honest and useful.

## User Experience

### Overview cockpit

The overview places the current commitment, today's smallest action, days until review, blockage, requested approval, and source decision first. Aggregate counts move below the operating loop. A global OpenAI status link shows connected, structured offline, or error and links to `/settings/integrations/openai`.

### Cycle routes

- `/cycles`: current and historical cycles.
- `/cycles/[id]`: commitment, source, prediction, timeline, evidence, and state.
- `/cycles/[id]/check-in`: a ten-second daily update.
- `/cycles/[id]/review`: seventh-day evidence and calibration.

The daily state is one of completed, progressed, blocked, reduced, rescheduled, or stopped. No streak counter is shown. A late update records both the represented local day and actual submission time.

### Evidence board

Meeting preparation groups evidence into fact, preference/boundary, assumption, unknown, alternative, and historical analogue. The system recommends owned records but the user controls the packet. Titles and verification labels replace visible internal IDs. Selected items are snapshotted so later source edits do not rewrite history.

### Fast and deep meetings

Fast meetings handle reversible daily or routine weekly questions. Deterministic policy selects only necessary specialists and discloses the mode. Deep meetings are mandatory for consequential advisor, admissions, research-direction, or hard-to-reverse resource choices.

For deep mode, Strategy, Operations, and Risk/Audit independently assess the same packet without seeing peer first passes. The Chief of Staff then exposes consensus, conflict, unsupported claims, missing evidence, and a gated recommendation. The user never sees hidden chain-of-thought.

### Recommendation and approval

A deep recommendation adds a central assumption, observable prediction, confidence, change evidence, and seven-day validation action to the existing evidence, alternative, next step, deadline, success, stop, unknown, and disagreement fields. Approval records full, partial, or self-directed adoption.

The UI describes proposed effects in human language. It does not show mutation JSON by default. Approval is still the only path to goal, decision, reminder, or cycle mutation.

### Low-energy mode

Low-energy mode limits the next action to 5–15 minutes, prevents adding another primary commitment, and permits recovery, rest, or information gathering. Agent language may discuss constraints but cannot moralize productivity.

## Architecture

Touched client code will move from the broad workspace component into feature boundaries: evidence, meetings, cycles, reviews, evals, and settings. Shared identity, D1 access, idempotency, state-machine primitives, contracts, and UI controls remain independent services.

New D1 tables are `evidence_items`, `operating_cycles`, `cycle_events`, `decision_forecasts`, and `recommendation_evaluations`. Migrations are additive. Every query uses the trusted identity resolver. A nullable unique active slot enforces one active primary cycle per user; projection and append-only event changes occur atomically.

The cycle API family supports current/list/create/detail/check-in/adjust/review. Evidence APIs attach to owned decisions. All mutations require client request IDs and canonical payload conflict detection.

## Agent Reliability and Evaluation

The quality gate validates record citations, fact/preference/inference separation, competitive alternatives, falsifiability, uncertainty, and disagreement. Insufficient evidence returns one critical question. Fast mode is bounded; deep mode preserves specialist independence.

Synthetic or explicitly anonymized cases cover advisor choice, admissions paths, paper direction/deadlines, overcommitment, low energy, contradictory/missing evidence, and risky preferences. The harness compares single-Agent, current four-Agent, and independent-deliberation variants under the same evidence and resource envelope.

Scoring remains multidimensional: citation validity, evidence fidelity, alternative quality, risk detection, actionability, calibration, latency, token cost, and completion. Human blinded sampling gates any reliability claim. If the new workflow does not beat the baseline reliably, release copy describes role diversity only.

## Errors, Privacy, and Safety

OpenAI failure never blocks manual cycle, check-in, adjustment, or review and never fabricates Agent speech. D1 failures keep user input visible and support same-key idempotent retry. Concurrent cycle creation cannot overwrite the active cycle. Time boundaries use the user's IANA timezone.

Production telemetry records only pseudonymous/opaque identifiers, mode, model/prompt/schema/eval versions, duration, tokens, status, and redacted error class. Raw personal records, prompts, Agent outputs, and credentials are not logged or silently placed in eval or training datasets.

## Acceptance

Correctness requires zero invented record IDs; complete citation validation for `ready`; all falsifiability fields; ownership, idempotency, concurrency, migration, and browser tests; honest offline labeling; and reproducible configuration metadata.

Pilot learning targets are 80% first-cycle activation, at least four meaningful updates per cycle on average, 50% seventh-day review, and at least 50% ending in completion or evidence-based adjustment/stopping. Metrics guide product decisions but do not shame individual users.

## Delivery

The stack is:

1. `lifeorg/learning-loop-spec`
2. `lifeorg/operating-cycles`
3. `lifeorg/decision-evidence`
4. `lifeorg/adaptive-experience`
5. `lifeorg/evaluation-release`

Each branch targets the prior branch and must independently validate. Native GitHub stacked PRs replace unavailable gstack tooling while preserving dependency declarations, bottom-up merge, and per-layer review. Deployment occurs only after the entire stack passes, against the exact merged commit, with additive D1 rollback compatibility.

## Approved Scope

The user approved the target audience, decision-action dual core, one-primary-cycle rule, fast/deep meeting split, independent deep review, low-energy behavior, modular data boundaries, comparative evals, privacy limits, and stacked delivery on 2026-08-08. Third-party calendar/email/task integrations, public accounts, billing, and team features remain outside this change.
