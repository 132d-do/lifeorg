## Context

LifeOrg is a Next.js/Vinext application on Cloudflare Workers and D1. Its current single client page switches views in memory, `/api/agents` performs role-shaped Responses API calls, and `/api/state` writes immediately. The governed design must preserve existing records, work without an OpenAI key, and keep the user as final decision-maker.

## Goals / Non-Goals

**Goals:** stable URLs; accessible click behavior; resumable guided meetings; four independently configured Agent objects; a public `needs_input | deliberating | ready` turn contract; recommendations citing at least two real LifeOrg records; explicit approval before domain writes; server-only secrets; additive D1 migration; strict ownership checks.

**Non-goals:** autonomous mutations, background scheduling, team accounts, destructive migration, provider selection, or storing an API key in D1/browser state.

## Decisions

### Route-owned workspaces

App Router pages own `/` (overview), `/meetings`, `/meetings/new/[kind]` for `daily | weekly | monthly | decision`, `/meetings/[id]`, `/goals`, `/goals/new`, `/goals/[id]`, `/decisions`, `/decisions/new`, `/decisions/[id]`, `/insights`, `/settings/profile`, `/settings/agents`, and `/settings/integrations/openai`. Shared navigation uses links, actions use buttons, and browser history/deep links restore the same workspace.

### Governed meeting state machine

`POST /api/meetings` creates an owned meeting. Each `POST /api/meetings/[id]/turns` appends the user turn, runs the deterministic orchestration step, and returns exactly one `MeetingTurnResponse`: `needs_input` with the single most important question, `deliberating` with bounded specialist contributions, or `ready` with a gated final recommendation. Internal lifecycle values may include `draft`, `needs_input`, `deliberating`, `ready`, `approved`, `rejected`, `archived`, and `failed`; they do not replace the public turn union. Only `POST /api/meetings/[id]/decision` may approve, edit, or reject the ready recommendation. Repeated creation, turn, and decision requests are idempotent.

### Agent kernel and evidence envelope

`@openai/agents` supplies four real `Agent` instances. `strategyArchitectAgent`, `operationsOfficerAgent`, and `riskAuditorAgent` each use `gpt-5.6-terra` and pursue respectively charter/long-term alignment and opportunity cost, executable sequencing and capacity, and counter-evidence/failure modes/stop conditions. `chiefOfStaffAgent` uses `gpt-5.6-sol` to check evidence completeness, ask only one critical question at a time, reconcile disagreements, and apply the final quality gate. Each Agent has independent instructions, goals, prohibitions, and Zod output. Hidden reasoning is never exposed.

The chief first reads the profile charter, related goals, recent meetings, and historical decisions. Only when evidence is sufficient do the three specialists deliberate in parallel. A `FinalRecommendation` must contain a one-sentence recommendation; citations to at least two existing LifeOrg records; the deferred or rejected alternative; a next action startable in 24–48 hours; a deadline or review time; a verifiable success criterion; a stop or adjustment condition; confidence; unknowns; and Agent disagreements. Missing or invented evidence, unsupported claims, generic motivation, or any absent required field forces `needs_input` rather than a vague recommendation.

### Secret and fallback boundary

Only a server module reads `env.OPENAI_API_KEY`. `GET /api/integrations/openai/status` returns configured/model booleans and names; `POST /api/integrations/openai/test` performs one bounded non-stored probe and returns redacted success/error codes. Neither endpoint accepts, returns, logs, or persists key material. Agents SDK tracing and raw personal-input logging default off. Missing/unavailable OpenAI enters a visible structured offline mode for recording the user's own judgment; it never fabricates or styles output as a real four-Agent discussion.

### Additive, isolated persistence

One forward migration additively extends the existing `meetings` table with lifecycle status, topic, phase, final recommendation, approval status, and update time, and adds `meeting_messages` for user and four-Agent messages, turn number, role, structured content, and redacted model metadata. Existing `profiles`, `goals`, `decisions`, `reminders`, and historical records remain readable and are never destructively rewritten. Append-only `decision_reviews` may record later outcomes without changing the original decision. Every added record carries `user_id`; every read, update, and transaction scopes by the server-derived identity. An approved decision commits its allow-listed domain mutations and audit linkage atomically.

### Trusted identity and session creation

`lib/server/identity.ts` is the only identity resolver used by state, meeting, and OpenAI integration APIs. In production it accepts only the Sites-injected authenticated-user email header. In local/preview it accepts only a signed `HttpOnly`, `SameSite=Lax` session cookie minted by `POST /api/session` with server-only `SESSION_SECRET`. It ignores `x-lifeorg-user`, never falls back to a shared preview identity, and returns 401 when neither trusted source is valid.

`lib/client/session-bootstrap.ts` owns client bootstrapping and `app/components/lifeorg-client.tsx` uses it before the first local/preview `/api/state` fetch. It calls same-origin `POST /api/session` with credentials, then fetches state; production may use the same endpoint to return its canonical Sites identity without minting a cookie. Any later 401 triggers at most one bootstrap and one replay, after which the error is surfaced.

`POST /api/meetings` accepts `clientRequestId`, meeting kind, topic, intake, and selected record references. It generates the meeting/message IDs, binds canonicalized inputs to the resolved user, enforces uniqueness on `(user_id, client_request_id)`, and returns `{ meetingId, status }`; an identical retry returns the original meeting. `GET /api/meetings/[id]` restores its context and messages, `POST /api/meetings/[id]/turns` advances one guided turn, and `POST /api/meetings/[id]/decision` approves, edits, or rejects a ready recommendation. The legacy `/api/agents` remains only as a documented migration adapter until the UI no longer calls it; internal `analyze` or `approve` helpers are not public routes.

## Risks / Trade-offs

- More routes and state transitions add code, offset by contract tests and one transition function.
- The stronger chief model increases latency/cost, bounded by three parallel specialists and one synthesis call.
- Deterministic fallback is less tailored, but explicit labeling preserves trust and availability.
- Creating an analysis session before approval is operational metadata, not a domain mutation; no goal, decision, profile, reminder, or completed meeting changes until approval.

## Migration Plan

Ship navigation first, then the agent kernel and additive migration behind existing behavior, then guided meetings. Generate and inspect additive SQL locally, build and archive the exact pushed commit, and let the Sites save/deploy workflow apply the declared D1 binding migration. Verify deployment status, Worker logs, and API smoke tests before promotion. Rollback application code without reversing the additive tables.

## Open Questions

None. Route, state, model, persistence, security, and rollout decisions are fixed by this design.
