## ADDED Requirements

### Requirement: Stable URL routing
LifeOrg SHALL expose `/` as the operating overview; `/meetings`; `/meetings/new/[kind]` where kind is `daily`, `weekly`, `monthly`, or `decision`; `/meetings/[id]`; `/goals`, `/goals/new`, and `/goals/[id]`; `/decisions`, `/decisions/new`, and `/decisions/[id]`; `/insights`; `/settings/profile`; `/settings/agents`; and `/settings/integrations/openai`.

#### Scenario: Deep-link a workspace
- **GIVEN** a production Sites-authenticated user or a local/preview user with a valid signed session cookie opens any listed URL
- **WHEN** the page finishes loading
- **THEN** the matching workspace or meeting SHALL be visible and browser refresh/back/forward MUST preserve route state

### Requirement: Complete clickable contract
Every visible navigation target MUST be a semantic link, and every operation MUST be a semantic button or form control with an accessible name, focus indication, keyboard activation, and truthful disabled/loading state; decorative elements SHALL NOT be the sole click target.

#### Scenario: Activate a control without a pointer
- **GIVEN** a user tabs through a LifeOrg page
- **WHEN** the user activates each available control with Enter or Space as appropriate
- **THEN** the same navigation, dialog, submission, retry, review, or approval outcome SHALL occur as with a pointer click

### Requirement: Route and action completeness
The navigation contract MUST include the brand-to-`/` link; primary links for overview, meetings, goals, decisions, insights, and profile settings; daily/weekly/monthly/decision preparation links; meeting, goal, and decision detail links; settings links for profile, Agents, and OpenAI integration; modal and drawer close/cancel buttons; mood-choice buttons; submit controls; toggles; sliders; timer start/pause feedback; and explicit create, send-turn, edit, reject, approve, test-connection, retry, and review actions.

#### Scenario: Audit interactive affordances
- **GIVEN** the route matrix is rendered with representative data and error states
- **WHEN** the contract test enumerates elements presented as interactive
- **THEN** every affordance SHALL resolve to a declared URL or named action and MUST NOT be an inert text/icon container
