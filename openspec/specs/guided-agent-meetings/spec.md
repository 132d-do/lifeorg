# Guided Agent Meetings

## Purpose

Define the governed, evidence-based multi-Agent meeting workflow and public API.

## Requirements

### Requirement: Public guided-meeting API
LifeOrg MUST expose `POST /api/meetings`, `GET /api/meetings/[id]`, `POST /api/meetings/[id]/turns`, and `POST /api/meetings/[id]/decision`. The legacy `/api/agents` MAY remain temporarily only as a migration-compatible adapter; internal analyze or approve functions MUST NOT be documented as additional public routes.

#### Scenario: Resume a meeting room
- **GIVEN** an owning user created a meeting
- **WHEN** the user directly opens `/meetings/[id]` or calls `GET /api/meetings/[id]`
- **THEN** the same context, ordered messages, current phase, and pending recommendation SHALL be restored after refresh, back/forward navigation, or a copied link

### Requirement: Meeting turn response union
Every successful `POST /api/meetings/[id]/turns` response MUST match exactly one `MeetingTurnResponse` variant: `{ status: "needs_input", question, missingEvidence }`, `{ status: "deliberating", contributions }`, or `{ status: "ready", recommendation }`. The API SHALL NOT use a generic prose result in place of this discriminated union.

#### Scenario: Ask before concluding
- **GIVEN** the Chief of Staff cannot satisfy the evidence and recommendation gate
- **WHEN** it evaluates the latest user turn and LifeOrg context
- **THEN** the API MUST return `needs_input` with one most-important question and the missing evidence list, and MUST NOT return a conclusion

#### Scenario: Expose bounded deliberation
- **GIVEN** the evidence is sufficient for the specialists
- **WHEN** Strategy, Operations, and Risk/Audit complete their parallel assessments
- **THEN** the API MAY return `deliberating` with their structured conclusions, evidence references, uncertainty, and disagreements, without hidden chain-of-thought

### Requirement: Four real agents with distinct goals
The system MUST instantiate four OpenAI `Agent` objects in code: `chiefOfStaffAgent`, `strategyArchitectAgent`, `operationsOfficerAgent`, and `riskAuditorAgent`. Each MUST have independent instructions, goals, prohibitions, and Zod-validated output. Specialists SHALL default to `gpt-5.6-terra`; the chief SHALL default to `gpt-5.6-sol`.

#### Scenario: Deliberate on one evidence packet
- **GIVEN** the Chief of Staff has read the profile charter, related goals, recent meetings, and historical decisions and found sufficient evidence
- **WHEN** deliberation begins
- **THEN** the three specialist Agents SHALL assess the same normalized packet in parallel and the Chief of Staff MUST synthesize their agreements, conflicts, unknowns, and recommendation

### Requirement: Deterministic orchestration
The server MUST run Chief-of-Staff completeness check, then either one-question intake or three parallel specialist assessments, then Chief-of-Staff synthesis and the quality gate. Model-directed autonomous routing MUST NOT bypass these stages or the user's decision endpoint.

#### Scenario: Evidence becomes sufficient
- **GIVEN** a prior response was `needs_input`
- **WHEN** the user supplies the requested evidence
- **THEN** the next turn SHALL re-run completeness checking before specialists and SHALL reach `deliberating` or `ready` only if the gate conditions are now met

### Requirement: Concrete final recommendation gate
A `ready` response MUST include a `FinalRecommendation` containing: a one-sentence explicit recommendation; citations to at least two real LifeOrg records; a deferred or rejected alternative; one next action startable within 24–48 hours; a deadline or review time; a verifiable success criterion; a stop or adjustment condition; confidence; still-unknown information; and Agent disagreements. Every material claim MUST cite existing record IDs, and invented IDs, unsupported claims, hidden conflicts, absent fields, or generic motivational language MUST fail the gate.

#### Scenario: Block a vague recommendation
- **GIVEN** synthesis cites fewer than two real records, omits a required action-quality field, or offers only generic advice
- **WHEN** the quality gate evaluates it
- **THEN** the turn MUST return `needs_input` with one critical question and missing evidence rather than `ready`

### Requirement: Idempotent owned meeting creation
`POST /api/meetings` MUST require `clientRequestId`, meeting kind, topic/intake, and selected record references; the server SHALL resolve the trusted user, generate meeting/message IDs, canonicalize and bind the submitted material to that user, and enforce uniqueness on `(user_id, client_request_id)`. It MUST return `201 { meetingId, status }` for a new meeting and `200` with the same meeting ID/status for an identical retry; a conflicting reuse SHALL return 409.

#### Scenario: Retry meeting creation
- **GIVEN** an authenticated user has created a meeting with a client request ID
- **WHEN** the same user repeats the identical request
- **THEN** the API MUST return the original server-generated meeting ID and SHALL NOT duplicate meetings or messages

### Requirement: Explicit user decision before domain mutation
`POST /api/meetings/[id]/decision` MUST accept only an owning user's `approve`, `edit`, or `reject` action against a `ready` recommendation. Viewing, sending a turn, deliberating, editing, rejecting, closing, or leaving MUST NOT change goals, decisions, profiles, reminders, or completed meeting artifacts. Approval SHALL atomically commit only the previewed allow-listed mutations and audit linkage.

#### Scenario: Review without approval
- **GIVEN** a meeting has a ready recommendation
- **WHEN** the user edits, rejects, closes, or leaves the page
- **THEN** no domain record SHALL change and a later resume MUST show the same messages and decision status

#### Scenario: Approve the exact recommendation
- **GIVEN** the owning user approves an unchanged mutation preview
- **WHEN** the decision endpoint verifies its canonical hash and idempotency key
- **THEN** the approved goal or decision changes and audit linkage SHALL commit exactly once in one transaction
