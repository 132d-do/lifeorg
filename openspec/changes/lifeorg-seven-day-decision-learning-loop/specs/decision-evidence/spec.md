## ADDED Requirements

### Requirement: Typed evidence board
LifeOrg MUST represent decision evidence as `fact`, `preference`, `assumption`, `unknown`, `alternative`, or `historical_analogue`. Each item MUST have an owning user, human-readable title, source type, verification state, and optional owned record reference.

#### Scenario: Display recommended evidence
- **GIVEN** LifeOrg finds related goals, decisions, meetings, cycles, or profile boundaries
- **WHEN** the user prepares a decision meeting
- **THEN** the UI MUST show human-readable evidence with source and verification labels and MUST NOT require the user to understand internal record IDs

### Requirement: Immutable decision-time snapshot
Selected evidence MUST be canonicalized, ownership-checked, and snapshotted when a meeting or cycle is activated. Later edits to the source record MUST NOT silently alter the historical packet.

#### Scenario: Source goal changes later
- **GIVEN** a decision cited a goal snapshot
- **WHEN** the user later edits the goal
- **THEN** the original decision MUST retain its prior snapshot while future meetings MAY cite the updated goal as new evidence

### Requirement: Assertions remain distinguishable
Unlinked user prose MUST be marked as an unverified assertion or an explicitly confirmed current preference. Agents MUST NOT present it as an externally verified fact.

#### Scenario: User supplies an unsupported claim
- **GIVEN** a user says an application is certain to succeed without a supporting record
- **WHEN** Agents assess the packet
- **THEN** the claim MUST remain an assumption or assertion and the recommendation MUST disclose its uncertainty

### Requirement: Falsifiable decision forecast
A deep recommendation MUST include a central assumption, observable forecast, confidence on the declared scale, evidence that would change the recommendation, and one action capable of producing relevant evidence within seven days.

#### Scenario: Recommendation cannot be tested
- **GIVEN** a proposed recommendation has no observable forecast or change evidence
- **WHEN** the quality gate evaluates it
- **THEN** the meeting MUST return `needs_input` and SHALL NOT create an operating-cycle mutation preview

### Requirement: Append-only calibration record
Decision forecasts and later recommendation evaluations MUST preserve the original value, confidence, evidence version, model version, and prompt version. Outcome reviews MUST append rather than update the original forecast.

#### Scenario: Reality differs from the forecast
- **GIVEN** the observed result contradicts the predicted result
- **WHEN** the user completes review
- **THEN** LifeOrg MUST retain both values and make the discrepancy available as cited historical evidence without rewriting either value
