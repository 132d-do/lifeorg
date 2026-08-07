## ADDED Requirements

### Requirement: Current-cycle operating cockpit
The overview MUST prioritize the current primary commitment, today's smallest action, review horizon, blocking condition, required CEO approval, and source decision before aggregate record counts.

#### Scenario: User returns during an active cycle
- **GIVEN** the user owns an active primary cycle
- **WHEN** the overview loads
- **THEN** the primary call to action MUST continue or update that cycle and MUST NOT invite an unrelated second commitment

### Requirement: Stable cycle routes
LifeOrg MUST expose `/cycles`, `/cycles/[id]`, `/cycles/[id]/check-in`, and `/cycles/[id]/review` as stable owned routes with refresh, back/forward, direct-link, mobile, keyboard, loading, empty, and error behavior.

#### Scenario: Resume a cycle from a copied URL
- **GIVEN** the owning user opens a valid cycle detail URL
- **WHEN** the page reloads
- **THEN** the same commitment, ordered events, evidence links, and current lifecycle MUST be restored

### Requirement: Non-shaming daily states
The daily interface MUST use `completed`, `progressed`, `blocked`, `reduced`, `rescheduled`, and `stopped` outcomes without streak loss, moral scoring, or language equating productivity with personal worth.

#### Scenario: Rationally stop a cycle
- **GIVEN** new evidence makes the commitment no longer worthwhile
- **WHEN** the user chooses stop and completes the outcome review
- **THEN** LifeOrg MUST record an intentional governance outcome and SHALL NOT label the user as failed or reset a streak

### Requirement: Low-energy protection
When low-energy mode is active, LifeOrg MUST limit a proposed next action to 5–15 minutes, prevent adding another primary commitment, permit rest/recovery/information gathering, and avoid moralized productivity language.

#### Scenario: Check in with low energy
- **GIVEN** the user reports energy below the configured threshold
- **WHEN** the system proposes a next action
- **THEN** it MUST offer a reduced action or recovery option and MUST NOT increase scope

### Requirement: Human-readable approval effects
The recommendation UI MUST explain cycle, goal, decision, reminder, and review effects in human language and identify records that will remain unchanged. Raw canonical mutations MAY appear only in a developer/audit view.

#### Scenario: Review before approval
- **GIVEN** a recommendation is ready
- **WHEN** the user reviews proposed effects
- **THEN** the interface MUST state exactly what approval will create or update and no effect may occur until approval

### Requirement: Globally discoverable OpenAI status
Every authenticated workspace MUST expose a semantic status link showing real-Agent connected, structured offline, or connection-error state and linking directly to `/settings/integrations/openai`.

#### Scenario: OpenAI is not configured
- **GIVEN** the server has no valid OpenAI credential
- **WHEN** any workspace loads
- **THEN** the user MUST be able to see and activate the offline status link without first discovering a secondary settings page
