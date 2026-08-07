## ADDED Requirements

### Requirement: One active primary cycle
LifeOrg MUST permit many goals but SHALL allow at most one active primary operating cycle per user. A cycle MUST contain one commitment, an owned source or explicit manual origin, a start date, a review date no later than seven local calendar days later, a success criterion, and a stop or adjustment condition.

#### Scenario: Attempt a second active cycle
- **GIVEN** an owning user already has an active primary cycle
- **WHEN** the same user submits another primary-cycle creation request
- **THEN** the server MUST return the existing active cycle or a typed conflict and SHALL NOT create, replace, or partially write a second active primary cycle

### Requirement: Governed cycle lifecycle
The server MUST validate cycle transitions through one deterministic state machine supporting `draft`, `active`, `adjusted`, `review_due`, `stopped`, and `reviewed`. Invalid or stale transitions MUST fail without appending an event or changing the current projection.

#### Scenario: Adjust an active commitment
- **GIVEN** an active cycle and an owning user-approved adjustment proposal
- **WHEN** scope, deadline, or success criteria are changed
- **THEN** one adjustment event MUST be appended and the cycle projection MUST atomically return to `active` with the approved values

### Requirement: Append-only daily check-ins
Each daily check-in MUST record exactly one of `completed`, `progressed`, `blocked`, `reduced`, `rescheduled`, or `stopped`, the represented local date, actual server timestamp, and optional energy, note, and evidence. Existing cycle events MUST NOT be rewritten to simulate continuity.

#### Scenario: Record a late check-in
- **GIVEN** an owning user missed yesterday's update
- **WHEN** the user records it today
- **THEN** LifeOrg MUST preserve yesterday as the represented local date, today as the actual creation time, and SHALL NOT award or break a streak

### Requirement: Explicit approval for material adjustment
Agent-proposed changes to a commitment, review date, success criterion, stop condition, linked goal, or linked decision MUST remain previews until the owning user approves the exact canonical mutation. A status-only check-in MAY append without a separate meeting approval.

#### Scenario: Reject a scope reduction
- **GIVEN** Operations proposes a smaller commitment after repeated blockage
- **WHEN** the user rejects the proposal
- **THEN** the original cycle projection MUST remain unchanged and the rejection MAY be appended as an audit event

### Requirement: Outcome review and historical integrity
On or after the review date, LifeOrg MUST collect observed evidence and separate ratings for action completion, recommendation accuracy, and decision value. Review MUST append results without rewriting the source recommendation, forecast, evidence snapshot, or confidence.

#### Scenario: Complete the seventh-day review
- **GIVEN** a cycle is due for review
- **WHEN** the owning user submits observed evidence and the three outcome ratings
- **THEN** the cycle MUST transition atomically to `reviewed`, clear its active slot, and retain immutable links to the original decision and recommendation

### Requirement: Owned and idempotent cycle APIs
LifeOrg MUST expose owned `GET /api/cycles/current`, `GET|POST /api/cycles`, `GET /api/cycles/[id]`, `POST /api/cycles/[id]/check-ins`, `POST /api/cycles/[id]/adjustments`, and `POST /api/cycles/[id]/review`. Every mutation MUST require a client request ID and implement identical-retry and conflicting-reuse semantics.

#### Scenario: Retry a check-in after an uncertain response
- **GIVEN** the client did not receive confirmation for a submitted check-in
- **WHEN** it repeats the same payload and client request ID
- **THEN** the API MUST return the original event and SHALL NOT append a duplicate
