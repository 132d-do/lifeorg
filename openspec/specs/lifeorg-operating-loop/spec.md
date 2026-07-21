# LifeOrg Operating Loop

## Purpose

Define durable, isolated records and the approval-controlled operating loop from evidence to review.

## Requirements

### Requirement: Additive D1 governance records
The migration MUST additively extend the existing `meetings` table with lifecycle status, topic, phase, final-recommendation data, approval status, and update time, and MUST add a user-owned `meeting_messages` table with meeting ID, turn number, speaker role, structured content, redacted model metadata, and timestamps. It MAY add append-only `decision_reviews` with immutable snapshots. It SHALL NOT drop, rename, destructively rewrite, or loosen constraints on existing `profiles`, `goals`, `meetings`, `decisions`, or `reminders` records.

#### Scenario: Apply migration to existing data
- **GIVEN** a database containing profiles, goals, meetings, decisions, and reminders
- **WHEN** the governance migration is applied
- **THEN** every existing row SHALL remain readable, extended columns SHALL have compatible defaults/nullability, and `meeting_messages` MUST be available without destructive backfill

### Requirement: Per-user data isolation
Every state, session, evidence, run, approval, integration, and mutation API MUST use the shared `lib/server/identity.ts` resolver and include its `user_id` in every query predicate. In production the resolver SHALL accept only the Sites-injected authenticated-user email header; in local/preview it SHALL accept only a signed `HttpOnly`, `SameSite=Lax` cookie minted by `POST /api/session` using server-only `SESSION_SECRET`. It MUST ignore `x-lifeorg-user` and client ownership fields, MUST NOT use a shared `preview-user` fallback, and SHALL return 401 for missing/invalid identity; cross-user identifiers MUST behave as not found.

#### Scenario: Attempt cross-user access
- **GIVEN** user A supplies an identifier owned by user B
- **WHEN** user A reads it, posts a turn, decides, retries, or commits it
- **THEN** the operation MUST return not found or forbidden and SHALL NOT reveal existence, content, status, or timing-sensitive details

#### Scenario: Reject a forged device identity
- **GIVEN** a request supplies `x-lifeorg-user` but no valid Sites identity or signed session cookie
- **WHEN** it calls state, meeting, or OpenAI integration APIs
- **THEN** every API MUST return 401 and SHALL NOT read or write user data

### Requirement: Bounded client identity bootstrap
On first local/preview load, the client MUST call same-origin `POST /api/session` with credentials before fetching `/api/state`; in production the endpoint SHALL resolve the canonical Sites identity without minting a local cookie. A protected API 401 MUST trigger no more than one session bootstrap and one replay, after which the client SHALL surface the authentication error without another retry.

#### Scenario: Recover once from an expired session
- **GIVEN** an initialized client receives 401 from a protected API
- **WHEN** session bootstrap succeeds and the replay also returns 401
- **THEN** the client MUST stop after the single replay and SHALL present an authentication error without an infinite request loop

### Requirement: Closed operating loop
LifeOrg SHALL connect record state, guided meetings, user decisions, execution, and later review: daily prioritization, weekly resource/risk review, monthly goal-portfolio review, decision recording, and decision-outcome review. Each approved artifact MUST retain cited records, recommendation source, uncertainty, Agent disagreement, user decision, and audit linkage.

#### Scenario: Review a prior decision
- **GIVEN** an approved decision reaches its review date
- **WHEN** the user records the observed outcome
- **THEN** LifeOrg MUST preserve the original evidence and rationale, append the outcome review, and SHALL NOT rewrite the historical recommendation

### Requirement: Approved decision outcome review
The `/decisions/[id]` detail SHALL guide the owning user through outcome evidence and may launch a decision meeting that previews an append-only `decision.reviewOutcome` mutation; only `POST /api/meetings/[id]/decision` with an approved exact preview MAY commit that action to `decision_reviews`, and it MUST preserve the original decision row and evidence.

#### Scenario: Append an approved outcome
- **GIVEN** an owned decision and a meeting whose exact `decision.reviewOutcome` preview is `ready`
- **WHEN** the user explicitly approves through the meeting decision endpoint
- **THEN** one `decision_reviews` row SHALL be appended with immutable snapshots and the original decision rationale, evidence, and recommendation MUST remain byte-for-byte unchanged

### Requirement: Approval-scoped transaction
An approval MUST identify the user, session, exact canonical mutation hash, timestamp, and idempotency key, and the server SHALL execute only that approved mutation set in one D1 transaction.

#### Scenario: Payload changes after preview
- **GIVEN** the approved mutation hash differs from the submitted commit payload
- **WHEN** commit is attempted
- **THEN** the server MUST refuse the transaction and no partial domain or audit writes SHALL occur
