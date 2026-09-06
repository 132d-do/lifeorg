## ADDED Requirements
### Requirement: Every functional surface has a meaningful next step
The system SHALL expose durable route links from goals, decisions, insights and Agent cards, and SHALL persist form changes before announcing success.
#### Scenario: Open a goal
- **WHEN** a user opens a goal URL
- **THEN** its actual fields, editing, contextual meeting and operating-cycle links are available
#### Scenario: New account
- **WHEN** a user has no goals or decisions
- **THEN** no fictional records are seeded and the UI links to creating real records
### Requirement: Specialists follow explicit contracts
The system SHALL create four SDK Agents with separate responsibilities and structured role-specific outputs, validate cited record ownership, and preserve a valid synthesis needs_input response.
#### Scenario: Invalid specialist evidence
- **WHEN** a specialist cites a record outside the authorized evidence packet or impersonates another role
- **THEN** its output cannot reach a ready recommendation
#### Scenario: Synthesis needs clarification
- **WHEN** the chief discovers a material unresolved conflict
- **THEN** one focused question is returned rather than a fake recommendation or provider failure
### Requirement: Meeting intake captures real constraints
The system SHALL carry user-entered capacity, alternatives, desired result and deadline into the meeting evidence packet.
#### Scenario: Consult on a decision
- **WHEN** the user follows the decision detail meeting link
- **THEN** the source decision is preselected and its evidence can be selected without fetching unrelated decision boards
