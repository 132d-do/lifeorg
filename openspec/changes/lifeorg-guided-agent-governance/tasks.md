## 1. Navigation contract

- [ ] 1.1 Add route-contract tests for `/`, meeting list/preparation/room URLs, goal list/create/detail URLs, decision list/create/detail URLs, insights, and the three settings URLs; then implement route-owned pages and shared navigation.
- [ ] 1.2 Inventory and test navigation links, modal/drawer close and cancel, mood choices, submit controls, toggles, sliders, timer feedback, and all other visible actions; make each a semantic link, button, or labeled form control with keyboard, focus, loading, and disabled behavior.

## 2. Agent kernel

- [ ] 2.1 Add failing tests for four Agent instances, distinct instructions, structured evidence output, model defaults, and chief synthesis.
- [ ] 2.2 Implement the server-only four-Agent registry, one-question completeness check, parallel specialist deliberation, `MeetingTurnResponse` schemas, final recommendation quality gate, honest offline mode, and redacted OpenAI integration status/test APIs.
- [ ] 2.3 Add schema tests and generate one additive D1 migration extending `meetings`, adding user-owned `meeting_messages`, and optionally adding append-only `decision_reviews`, without dropping or rewriting existing records.
- [ ] 2.4 Add the shared trusted identity resolver, signed local/preview session endpoint, bounded client bootstrap/retry module, and forged-header/unauthenticated/cross-user/bootstrap tests for every API family.

## 3. Guided meetings

- [ ] 3.1 Add state-transition, public response-union, and idempotency tests, then implement meeting lifecycle logic and the create/read/turn/decision APIs.
- [ ] 3.1a Specify and test idempotent `POST /api/meetings` creation with server-generated IDs and canonical user-bound intake/record references.
- [ ] 3.2 Add end-to-end tests for one-question intake, `needs_input`, specialist `deliberating`, gated `ready`, edit/reject/approve, atomic commit, retry, offline labeling, and cross-user denial.
- [ ] 3.3 Implement `/meetings/new/[kind]` preparation and `/meetings/[id]` multi-turn rooms for daily, weekly, monthly, and decision meetings.
- [ ] 3.4 Connect approved recommendations to goal creation/update or decision creation/review through `POST /api/meetings/[id]/decision`, preserving historical evidence and rationale.

## 4. Verification and rollout

- [ ] 4.1 Run lint, build, unit/integration tests, migration checks, secret scans, and OpenSpec validation.
- [ ] 4.2 Push the four-layer `lifeorg/spec-foundation -> lifeorg/navigation-contract -> lifeorg/agent-kernel -> lifeorg/guided-meetings` GitHub stack, merge bottom-up with merge commits, and use the Sites save/deploy workflow to apply the D1 migration; verify deployment status, Worker logs, and API smoke checks before promotion.
