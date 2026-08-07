## Why

LifeOrg can produce governed, evidence-cited recommendations, but it does not yet help a user carry one recommendation through the following week or use the observed result to calibrate later advice. For research students, applicants, and multi-project university students, this leaves two related gaps: recommendations can remain detached from execution, and the four-Agent system has no outcome-based evidence that it is more useful than a simpler baseline.

## What Changes

- Add one user-owned seven-day operating cycle that turns an approved recommendation or manual goal choice into a single primary commitment, daily lightweight check-ins, adaptive adjustments, and an outcome review.
- Replace record-ID-first meeting preparation with a human-readable evidence board separating facts, preferences, assumptions, unknowns, alternatives, and historical analogues.
- Add deep-decision deliberation in which the three specialist Agents form independent first-pass assessments before the Chief of Staff sees and synthesizes them; keep fast meetings selective and lower cost.
- Extend final recommendations with a falsifiable prediction, confidence, assumption to test, evidence that would change the advice, and a seven-day validation action.
- Add an anonymized evaluation harness comparing the current four-Agent workflow, the independent-deliberation workflow, and a single-Agent baseline on representative student decisions.
- Reorganize the overview around the current commitment and next action, expose OpenAI status globally, and add low-energy protections without streak shame or moralized language.

## Capabilities

### New Capabilities

- `operating-cycles`: Single-primary-cycle lifecycle, check-ins, adjustments, review, and idempotent persistence.
- `decision-evidence`: Human-readable evidence classification, source snapshots, predictions, and decision calibration.
- `adaptive-experience`: Seven-day cockpit, fast/deep meeting modes, low-energy behavior, and globally discoverable AI status.
- `evaluation-observability`: Representative eval cases, comparative grading, privacy-preserving operational metrics, and release thresholds.

### Modified Capabilities

- `guided-agent-meetings`: Add fast/deep meeting policy, independent specialist first passes, falsifiable recommendations, and cycle-creation previews.
- `lifeorg-operating-loop`: Connect approved recommendations to one active operating cycle and append-only outcome calibration.
- `navigation-contract`: Add cycle list/detail/check-in/review URLs and a semantic global OpenAI status link.

## Impact

Implementation will affect App Router pages, shared navigation, meeting and Agent contracts, new focused cycle/evidence/evaluation modules, additive Drizzle/D1 migrations, API and browser tests, OpenAI invocation policy, and Sites deployment. It will preserve all existing profile, goal, meeting, decision, reminder, message, and decision-review records. It will not add third-party calendar/email/task integrations, public registration, billing, team accounts, or client-side API-key entry.
