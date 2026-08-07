## 1. Specification foundation

- [x] 1.1 Add and strictly validate the proposal, design, task plan, and five capability delta specs.
- [x] 1.2 Add representative acceptance fixtures for a seven-day cycle and complex student decisions without changing runtime behavior.
- [ ] 1.3 Commit and publish the specification-only base branch.

## 2. Operating cycle domain

- [x] 2.1 Add failing state-machine tests for draft, active, adjusted, review-due, stopped, and reviewed transitions, including local-day and late-check-in behavior.
- [x] 2.2 Add additive Drizzle/D1 tables for operating cycles and append-only events with per-user single-active-slot enforcement.
- [x] 2.3 Add owned, idempotent cycle create/read/check-in/adjust/review APIs and concurrency/error-recovery tests.
- [x] 2.4 Connect approved meeting previews and manual goal selection to cycle creation without bypassing user confirmation.

## 3. Decision evidence and Agent reliability

- [x] 3.1 Add evidence-item and forecast schemas, migrations, owned APIs, immutable snapshots, and human-readable source mapping.
- [x] 3.2 Add fast/deep meeting classification tests and independent first-pass specialist execution for deep decisions.
- [x] 3.3 Extend structured recommendation and quality-gate contracts with assumptions, predictions, confidence, change evidence, validation action, and adoption mode.
- [x] 3.4 Replace raw mutation JSON in the user flow with a human-readable approval-effects preview while preserving an audit representation.

## 4. Adaptive seven-day experience

- [x] 4.1 Split touched workspace code into focused evidence, meeting, cycle, review, eval, and settings feature modules.
- [x] 4.2 Add `/cycles`, cycle detail, check-in, and review routes with complete keyboard and deep-link behavior.
- [x] 4.3 Rebuild the overview around the active commitment, today's action, review horizon, blockage, and source decision.
- [x] 4.4 Add low-energy behavior, non-shaming recovery states, and a globally visible semantic OpenAI status link.
- [ ] 4.5 Add mobile/desktop browser acceptance coverage for the full decision-to-review journey.

## 5. Evaluation, observability, and release

- [x] 5.1 Add anonymized fixed cases, single-Agent/current/new-workflow runners, deterministic graders, and a human-review rubric.
- [x] 5.2 Record only redacted run metadata and verify that private evidence, prompts, check-ins, responses, and credentials never enter logs or eval fixtures.
- [ ] 5.3 Run OpenSpec validation, lint, build, unit/integration/API/migration/security/browser tests, real OpenAI smoke, and production Sites smoke checks.
- [ ] 5.4 Publish the native five-layer stacked PR chain, merge bottom-up after checks, deploy the exact merged top commit, verify telemetry, and archive the OpenSpec change only after production acceptance.
