## ADDED Requirements

### Requirement: Representative comparative evaluation
The repository MUST include synthetic or explicitly anonymized cases covering advisor choice, admissions paths, research direction/deadlines, overcommitment, low energy, contradictory evidence, missing evidence, and risky user preference. The harness MUST compare a declared single-Agent baseline, the current workflow, and independent deliberation on the same case and resource limits.

#### Scenario: Evaluate a workflow change
- **GIVEN** an Agent prompt, model, routing, or quality-gate change
- **WHEN** release evaluation runs
- **THEN** every workflow variant MUST receive the same visible evidence packet and be scored on the versioned rubric

### Requirement: Multidimensional grading
Evaluation MUST separately grade citation validity, evidence fidelity, alternative quality, risk detection, actionability, calibration, latency, token cost, and completion status. A composite score MUST retain its component scores.

#### Scenario: Verbose answer appears persuasive
- **GIVEN** an output is fluent but cites unsupported evidence or lacks a falsifiable action
- **WHEN** it is graded
- **THEN** evidence or actionability components MUST fail regardless of style quality

### Requirement: Human review remains a release gate
Automated graders MAY rank and diagnose outputs, but a version claiming decision-quality improvement MUST include blinded human sampling against the rubric.

#### Scenario: Automated and human graders disagree
- **GIVEN** the automated grader favors the new workflow but human review does not
- **WHEN** release claims are selected
- **THEN** LifeOrg MUST not claim improved reliability and MUST retain the disagreement in the evaluation report

### Requirement: Privacy-preserving production telemetry
Production telemetry MAY contain opaque run ID, user-scoped pseudonymous ID, meeting mode, effective model, prompt/eval version, duration, token totals, status, and redacted error class. It MUST NOT contain raw profile, evidence, decision, meeting, check-in, review, Agent response, or credential content.

#### Scenario: Inspect an operational error
- **GIVEN** an Agent run fails on private life content
- **WHEN** logs and persisted metadata are inspected
- **THEN** operators MUST be able to identify stage and error class without seeing the private input or output

### Requirement: Versioned reproducibility metadata
Every deep recommendation and evaluation result MUST retain orchestration-policy, prompt, schema, model, and rubric versions sufficient to reproduce the declared configuration without storing hidden reasoning.

#### Scenario: Compare two recommendation versions
- **GIVEN** two releases use different prompts or models
- **WHEN** their outcomes are compared
- **THEN** the system MUST identify the exact visible configuration versions responsible for each result
