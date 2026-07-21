# LifeOrg Guided Agent Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Implement each behavior test-first, then run specification and code-quality review before stacking the next layer.

**Goal:** Deliver a real-URL LifeOrg operating loop and four code-defined, evidence-grounded Agents whose multi-turn recommendation cannot change user data without an explicit CEO decision.

**Architecture:** Four stacked layers: specification baseline, route-owned workspaces, server-only Agent/identity/storage kernel, then guided meeting and approval workflows. Public APIs are create/read/turn/decision plus OpenAI integration status/test; compatibility aliases remain private or migration-only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vinext, Cloudflare Workers/D1, Drizzle, `@openai/agents`, Zod, Node test runner, GitHub stacked PRs, OpenAI Sites.

---

## Canonical file map

- `app/page.tsx`: overview.
- `app/meetings/page.tsx`, `app/meetings/new/[kind]/page.tsx`, `app/meetings/[id]/page.tsx`: meeting archive, preparation, and multi-turn room.
- `app/goals/{page,new/page,[id]/page}.tsx`: goal list, create, and detail.
- `app/decisions/{page,new/page,[id]/page}.tsx`: decision list, create, detail, and review launch.
- `app/insights/page.tsx`: record-backed trends and resource allocation.
- `app/settings/profile/page.tsx`, `app/settings/agents/page.tsx`, `app/settings/integrations/openai/page.tsx`: charter, Agent boundaries, and OpenAI connection.
- `app/components/{app-shell,overview-workspace,action-controls}.tsx`: shared layout and semantic controls.
- `lib/server/agents/{registry,schemas,quality-gate,orchestrate,offline}.ts`: four Agents, turn union, final gate, and honest offline mode.
- `lib/server/openai/{key,status}.ts`, `app/api/integrations/openai/{status,test}/route.ts`: server-only credentials and redacted diagnostics.
- `lib/server/identity.ts`, `app/api/session/route.ts`, `lib/client/session-bootstrap.ts`: trusted identity and bounded bootstrap/replay.
- `lib/meetings/{types,reducer,context,mutation-hash,commit-mutations}.ts`: lifecycle, record packet, and exact approval mutations.
- `app/api/meetings/route.ts`, `app/api/meetings/[id]/route.ts`, `app/api/meetings/[id]/turns/route.ts`, `app/api/meetings/[id]/decision/route.ts`: public meeting API.
- `db/schema.ts`, `drizzle/0001_guided_agent_governance.sql`: additive `meetings` extension, `meeting_messages`, and optional append-only reviews.
- `tests/{navigation-contract,identity,client-bootstrap,agent-kernel,meeting-state,meeting-api,meeting-quality,openai-security}.test.mjs`: behavioral contracts.
- `scripts/verify-sites-deployment.mjs`: exact-SHA route/API smoke checks.

## Layer 0: `lifeorg/spec-foundation` → `main`

- [ ] Create `lifeorg/spec-foundation` from `main` and commit only OpenSpec/Superpowers artifacts.
- [ ] Confirm the proposal, design, tasks, and four delta specs declare every canonical UI route, public API, `MeetingTurnResponse`, final recommendation field, identity boundary, additive D1 constraint, offline behavior, and four-Agent model/role contract.
- [ ] Run `npm exec --yes @fission-ai/openspec@latest -- validate lifeorg-guided-agent-governance --strict` and `git diff --check`; both must exit 0.
- [ ] Commit `docs: align public governance contracts` and open the base PR without product behavior changes.

## Layer 1: `lifeorg/navigation-contract` → `lifeorg/spec-foundation`

- [ ] **Red:** Create `tests/navigation-contract.test.mjs` asserting HTTP success and direct navigation for `/`, `/meetings`, all four `/meetings/new/{kind}` fixtures, `/meetings/fixture-meeting`, `/goals`, `/goals/new`, `/goals/fixture-goal`, `/decisions`, `/decisions/new`, `/decisions/fixture-decision`, `/insights`, `/settings/profile`, `/settings/agents`, and `/settings/integrations/openai`.
- [ ] **Red:** Inventory semantic controls for brand/primary/settings navigation; meeting preparation and detail; goal/decision create and detail; close/cancel; mood; submits; toggles; sliders; timer; send-turn; edit/reject/approve; retry; and OpenAI test. Assert every affordance is a named link/button/form control with keyboard, focus, pending, disabled, and visible-result behavior.
- [ ] Run the test and record its expected failure against missing route owners and inert controls.
- [ ] **Green:** Split the current single-page switchboard into the canonical route files and shared shell. Use `Link` for destinations and buttons/forms for operations. Recompose the overview around CEO approvals, one core result, blocked goals, due decision reviews, and the next meeting.
- [ ] Run lint, production build, rendered HTML tests, and `tests/navigation-contract.test.mjs`; all must pass. Commit `feat: establish LifeOrg navigation contract`.

## Layer 2: `lifeorg/agent-kernel` → `lifeorg/navigation-contract`

- [ ] **Red (agents):** Add tests proving exactly four exported `Agent` instances named `chiefOfStaffAgent`, `strategyArchitectAgent`, `operationsOfficerAgent`, and `riskAuditorAgent`; distinct instructions/goals/prohibitions; specialists=`gpt-5.6-terra`; chief=`gpt-5.6-sol`; Zod outputs; parallel specialists only after chief completeness; and no hidden reasoning in public output.
- [ ] **Red (quality):** Test the exact `MeetingTurnResponse` union. Prove insufficient evidence asks one question; `deliberating` contains bounded contributions; `ready` requires one-sentence advice, at least two valid record citations, deferred alternative, 24–48-hour next action, deadline/review time, success criterion, stop/adjust condition, confidence, unknowns, and disagreements. Prove vague advice, invented IDs, or any missing field returns `needs_input`.
- [ ] **Red (identity/bootstrap):** Test that production accepts only Sites-authenticated email, local/preview accepts only a valid signed `HttpOnly; SameSite=Lax` cookie from `POST /api/session`, forged ownership/device fields are ignored, missing/invalid identity is 401, cross-user IDs reveal nothing, first protected call bootstraps, and a later 401 permits only one bootstrap plus one replay.
- [ ] **Red (OpenAI security):** Test `GET /api/integrations/openai/status` and `POST /api/integrations/openai/test`, unsupported methods, timeout/redacted errors, `store:false`, tracing/raw-input logging disabled by default, no accepted key body field, and absence of a secret sentinel from bodies, headers, logs, D1 fixtures, errors, source, and build output.
- [ ] Run the four new test groups and record expected missing-module/route failures.
- [ ] **Green (identity):** Implement the single resolver and bounded client bootstrap; replace forgeable device/shared-preview identity in `/api/state`, legacy `/api/agents`, OpenAI integration, and all meeting APIs.
- [ ] **Green (agents):** Add `@openai/agents`; define the four Agents and Zod schemas; implement completeness, parallel specialists, Chief synthesis, quality gate, and structured offline mode. Adapt old `/api/agents` internally to the governed kernel while preserving its migration response shape and marking it deprecated.
- [ ] **Green (storage):** Extend `meetings` additively with lifecycle/topic/phase/final recommendation/approval/update fields; add `meeting_messages` with user ID, meeting ID, turn, role, structured content, redacted model metadata, and timestamps; preserve existing tables and rows. Add append-only `decision_reviews` only if required for outcome history.
- [ ] **Green (integration):** Implement the two `/api/integrations/openai/*` routes. Only server code reads `OPENAI_API_KEY`; default Agents tracing and raw life-content logs off. Without a usable provider, report structured offline mode and never fabricate Agent speech.
- [ ] Run lint, build, all kernel/identity/security tests, additive SQL checks, and the secret sentinel scan. Commit `feat: add governed LifeOrg agent kernel`.

## Layer 3: `lifeorg/guided-meetings` → `lifeorg/agent-kernel`

- [ ] **Red (state):** Test internal lifecycle transitions for draft/intake, `needs_input`, `deliberating`, `ready`, approve/edit/reject, commit, failure/retry, and resume; reject invalid transitions; make create/turn/decision idempotent.
- [ ] **Red (public API):** Test `POST /api/meetings` returns `201 { meetingId, status }`, identical retry returns 200/same ID, conflicting reuse returns 409, and server ignores ownership fields. Test `GET /api/meetings/[id]` restores ordered messages/context. Test turns return only the three declared variants. Test decision accepts only approve/edit/reject for the owner and only a ready exact preview can mutate data.
- [ ] **Red (closed loop):** Cover daily prioritization, weekly overcommitment, option choice, monthly goal conflict, decision outcome review, and provider failure. Prove at least two real record citations, zero domain writes before approval, one exact atomic mutation set after approval, immutable originals, refresh/resume, and cross-user denial.
- [ ] Run the state/API/scenario tests and record expected missing implementation failures.
- [ ] **Green (API):** Implement the four public meeting endpoints with `resolveIdentity`, server IDs, canonical record references, one-question turns, ordered `meeting_messages`, exact mutation hashes, and atomic decision commits. Do not expose `/analyze` or `/approve`; those names may exist only inside modules.
- [ ] **Green (UI):** Implement four preparation guides and the multi-turn room. Show selected records, the single question, bounded Agent contributions, consensus/conflict/missing evidence, ready recommendation fields, mutation preview, and explicit edit/reject/approve. Connect approval to goals or decisions and later review from `/decisions/[id]`.
- [ ] **Green (offline/responsive):** Make structured offline mode visibly distinct and usable for personal notes without fake Agent statements. Verify desktop/mobile layouts, keyboard flow, deep links, refresh, back/forward, and all click outcomes.
- [ ] Run lint, full tests, production build, browser acceptance, and migration preservation checks. Commit `feat: guide governed LifeOrg meetings`.

## GitHub and Sites rollout

- [ ] Push all four branches and open stacked PRs with bases exactly: `lifeorg/spec-foundation -> main`, `lifeorg/navigation-contract -> lifeorg/spec-foundation`, `lifeorg/agent-kernel -> lifeorg/navigation-contract`, `lifeorg/guided-meetings -> lifeorg/agent-kernel`. Each PR description names its parent and child.
- [ ] Run OpenSpec strict validate/verify, lint, full tests, build, artifact validation, additive migration scan, Agent real-call check (only when `OPENAI_API_KEY` is configured), and desktop/mobile browser acceptance on the exact top SHA.
- [ ] Save and deploy the exact pushed top revision to the existing Sites project with its declared `DB` binding. Verify every canonical route; public meeting and integration APIs; unauthenticated/forged/cross-user denial; honest offline state; secret absence; idempotency; zero pre-approval mutations; and one exact post-approval commit.
- [ ] Merge bottom-up with merge commits preserving ancestry, retargeting each child to `main` after its parent merges. Promote only after the top PR and production smoke checks pass. On rollback, revert application commits and retain additive tables.
- [ ] Run OpenSpec verify, then archive `lifeorg-guided-agent-governance` only after implementation and deployment evidence is complete.
