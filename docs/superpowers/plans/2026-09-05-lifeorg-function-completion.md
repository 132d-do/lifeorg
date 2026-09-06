# LifeOrg Function Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans with test-driven-development. User has authorized autonomous execution and GitHub synchronization.

**Goal:** Close existing functional dead ends and make specialized Agent decisions grounded and executable.
**Architecture:** Public domain contracts → contextual UI → authenticated application service → read-only Agent orchestration → explicit approval → D1. Preserve existing migrations.
**Tech Stack:** Next/Vinext, React, Zod, OpenAI Agents SDK, D1, Node test runner.

1. Agent contracts: add `lib/agent-contracts.ts`, role schemas in `lib/server/agents/schemas.ts`, enforce role/citation checks in orchestrator; add failing tests then implement. Normalize chief clarification in executor. Include agenda and date.
2. Workflow integrity: stop fictional seeding in `app/api/state/route.ts`; add validated goal editing and durable created-ID response. Ensure active cycle context avoids duplicate cycle approval. Test authorization and regression cases.
3. UI closure: extract entity details and Agent directory/detail; enrich `app/features/meetings/meeting-intake.tsx`; fix evidence form await handling; improve overview/insights/settings and deep links. Include empty/error/pending states.
4. Verify: `node --experimental-loader ./tests/cloudflare-loader.mjs --test tests/*.test.mjs`, ESLint, `vinext build`, generated route smoke tests, OpenSpec validation. Review diff for security/data preservation. Publish related GitHub layers and verify deployed artifact separately from unavailable live OpenAI calls.

Baseline: 127 tests pass. Sandbox Git-ref write restriction requires scoped escalation; use existing dedicated Sites checkout to preserve runtime, no extra worktree or concurrent site editor.
