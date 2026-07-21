# LifeOrg Guided Agent Governance Design

## Product contract

LifeOrg turns a personal operating cadence into an accountable loop: record current facts, convene a guided meeting, answer the single most important missing question, inspect three specialist assessments and the Chief of Staff synthesis, decide as CEO, write the approved goal/decision changes, then revisit outcomes. Agents may recommend and draft mutations but cannot define the user's values or change life data without explicit approval.

The canonical UI routes are `/` (overview), `/meetings`, `/meetings/new/[daily|weekly|monthly|decision]`, `/meetings/[id]`, `/goals`, `/goals/new`, `/goals/[id]`, `/decisions`, `/decisions/new`, `/decisions/[id]`, `/insights`, `/settings/profile`, `/settings/agents`, and `/settings/integrations/openai`. Links own navigation and buttons/form controls own actions. Every visible affordance has a real destination or immediate, accessible feedback; refresh, back/forward, and copied detail links restore the same workspace.

The overview emphasizes CEO approvals, the cycle's one core result, blocked goals, decisions awaiting review, and the next suggested meeting. It does not center arbitrary health scores or generic admin metrics.

## Four-Agent architecture

The server explicitly creates four `@openai/agents` Agent instances with separate instructions, goals, prohibitions, and Zod outputs:

- `chiefOfStaffAgent` (`gpt-5.6-sol`) reads the personal charter and relevant records, checks completeness, asks one critical question at a time, exposes conflicts, and synthesizes only when the gate can pass.
- `strategyArchitectAgent` (`gpt-5.6-terra`) tests charter and long-term alignment, opportunity cost, and alternatives.
- `operationsOfficerAgent` (`gpt-5.6-terra`) tests time, energy, dependencies, sequencing, startability, and acceptance criteria.
- `riskAuditorAgent` (`gpt-5.6-terra`) seeks counter-evidence, bias, failure modes, irreversible risk, and stop conditions.

The orchestration is deterministic: Chief-of-Staff completeness check; either one-question intake or three parallel specialist assessments; Chief-of-Staff synthesis and quality gate; then `needs_input` or a ready recommendation. Hidden reasoning is never displayed. Users see bounded conclusions, record citations, uncertainty, and disagreements.

`POST /api/meetings/[id]/turns` returns exactly one public union variant:

```ts
type MeetingTurnResponse =
  | { status: "needs_input"; question: string; missingEvidence: string[] }
  | { status: "deliberating"; contributions: AgentContribution[] }
  | { status: "ready"; recommendation: FinalRecommendation };
```

A `FinalRecommendation` must have a one-sentence explicit recommendation, citations to at least two real LifeOrg records, a deferred/rejected alternative, a next step startable within 24–48 hours, a deadline/review time, a verifiable success criterion, a stop/adjust condition, confidence, unknowns, and Agent disagreements. Missing/invented evidence, unsupported claims, generic motivation, or an absent field forces `needs_input`.

## Public interfaces

- `POST /api/meetings`: idempotently creates an owned meeting with a server-generated ID.
- `GET /api/meetings/[id]`: restores context, ordered messages, lifecycle, and pending recommendation.
- `POST /api/meetings/[id]/turns`: appends a user turn and advances one orchestration step.
- `POST /api/meetings/[id]/decision`: approves, edits, or rejects the ready recommendation; only approval may atomically commit the exact allow-listed mutation preview.
- `GET /api/integrations/openai/status`: reports configured state and effective models, never the key.
- `POST /api/integrations/openai/test`: performs one bounded, non-stored, redacted connection probe.

The legacy `/api/agents` remains temporarily as a compatibility adapter until all clients use meeting turns. `analyze` and `approve` may be internal function names but are not public endpoints.

## Data, identity, and security

One additive migration extends `meetings` with lifecycle status, topic, phase, final recommendation, approval status, and update time, and adds `meeting_messages` for user/four-Agent messages, turn, role, structured content, and redacted model metadata. Existing profiles, goals, meetings, decisions, reminders, and history remain readable. Append-only `decision_reviews` may preserve later observed outcomes without changing the original decision. Every added row is user-owned and approval commits its exact allow-listed domain mutations plus audit linkage atomically.

`lib/server/identity.ts` is the single resolver for state, meeting, and OpenAI integration APIs. Production trusts only the Sites-injected authenticated-user email header. Local/preview trusts only a signed `HttpOnly`, `SameSite=Lax` cookie minted by `POST /api/session` with server-only `SESSION_SECRET`. Forgeable device/ownership headers are ignored, no shared preview identity exists, and unresolved identity returns 401. Client bootstrap occurs before the first protected state call; a later 401 permits one bootstrap and one replay only.

`OPENAI_API_KEY` is read only in a server module and is never accepted from the browser, stored in D1, returned, logged, or committed. Agents SDK tracing and raw personal-input logs default off. When the key/provider is unavailable, the interface clearly enters structured offline mode so the user can record personal judgment; it never fabricates a real four-Agent discussion.

## Failure and rollout

Invalid structured output or an evidence-quality failure returns `needs_input`; transport/provider failures are retryable or enter honest offline mode. Idempotency prevents duplicate meetings, messages, and commits; cross-user identifiers reveal nothing. Deliver four stacked layers: `lifeorg/spec-foundation -> lifeorg/navigation-contract -> lifeorg/agent-kernel -> lifeorg/guided-meetings`. Each is tested and reviewed independently, merged bottom-up with preserved ancestry, and only the verified top commit is deployed through Sites. Rollback application code without reversing additive tables.
