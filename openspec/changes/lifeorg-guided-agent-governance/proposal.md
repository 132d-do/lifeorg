## Why

LifeOrg has a useful dashboard but no durable route contract, explicit meeting approval boundary, or governed multi-agent recommendation pipeline. The next release needs navigable workflows, evidence-grounded advice, safe OpenAI diagnostics, and user-isolated persistence before richer automation is added.

## What Changes

- Give the overview, meeting preparation/room, goal, decision, insight, and settings workspaces stable URLs and a complete clickable contract.
- Add a resumable, multi-turn intake-to-decision meeting state machine with one-question evidence collection.
- Use four real OpenAI Agent instances with distinct goals and model policies.
- Gate recommendations on at least two cited LifeOrg records and a concrete, testable action contract; otherwise return `needs_input`.
- Keep the OpenAI key server-only and expose redacted status and bounded test APIs.
- Extend the existing `meetings` lifecycle additively, add `meeting_messages`, and preserve all existing domain records; append-only decision outcome reviews remain permitted.

## Capabilities

### New Capabilities
- `navigation-contract`: Stable routes and the behavior of navigation and action controls.
- `guided-agent-meetings`: Guided meetings, agent deliberation, evidence gates, and approval.
- `openai-integration`: Credentials, diagnostics, model defaults, fallback, and secret safety.
- `lifeorg-operating-loop`: User-isolated daily, weekly, monthly, decision, and review persistence.

### Modified Capabilities

None. No baseline OpenSpec capabilities exist.

## Impact

Later implementation affects App Router pages and APIs, focused agent/meeting modules, Drizzle schema and one additive migration, contract tests, the OpenAI Agents SDK, GitHub CI, and OpenAI Sites rollout. This change itself modifies documentation and OpenSpec configuration only.
