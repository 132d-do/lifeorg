## ADDED Requirements

### Requirement: Fast and deep meeting modes
LifeOrg MUST classify meetings through deterministic policy as `fast` or `deep`. Fast meetings MAY invoke only relevant Agents; deep meetings MUST run Chief completeness, three independent specialist first passes, Chief synthesis, and the final quality gate.

#### Scenario: Escalate a consequential choice
- **GIVEN** a meeting concerns an advisor, admissions path, research direction, or hard-to-reverse resource commitment
- **WHEN** classification runs
- **THEN** the meeting MUST use deep mode even if the user began from a routine meeting entry point

### Requirement: Independent specialist first passes
In a deep meeting, Strategy, Operations, and Risk/Audit MUST receive the same normalized evidence snapshot and MUST NOT receive peer conclusions before completing their own validated contribution.

#### Scenario: Specialists disagree
- **GIVEN** independent first passes reach conflicting recommendations
- **WHEN** the Chief synthesizes them
- **THEN** the final output MUST preserve the material disagreement, identify the evidence behind it, and MUST NOT convert majority agreement into factual support

### Requirement: Bounded selective execution
Fast-mode Agent selection MUST be code-controlled, use an allow-listed role set, record the effective selection policy version, and escalate to deep mode when material risk, conflicting charter constraints, or insufficient evidence is detected.

#### Scenario: Routine daily planning
- **GIVEN** a reversible daily prioritization question with sufficient evidence and no material conflict
- **WHEN** fast mode runs
- **THEN** LifeOrg MAY use Chief and Operations without invoking every specialist and MUST disclose the meeting mode rather than implying a four-Agent deliberation

### Requirement: Adoption mode at approval
Approval of a deep recommendation MUST capture whether the user adopted it `full`, `partial`, or `self_directed`, plus any user-authored modification that affects the seven-day action.

#### Scenario: User chooses a different action
- **GIVEN** Agents recommend option A but the user chooses option B
- **WHEN** the user approves a self-directed cycle
- **THEN** LifeOrg MUST preserve the Agent recommendation, record `self_directed`, and evaluate the later result without pretending the Agent advice was followed

### Requirement: No reliability claim without comparative evidence
Product copy and release notes MUST NOT claim that multi-Agent deliberation improves accuracy or reliability unless representative comparative evals show a stable improvement over the declared single-Agent baseline and current workflow.

#### Scenario: Multi-Agent score does not improve
- **GIVEN** independent deliberation does not beat the baseline on the release rubric
- **WHEN** the release is prepared
- **THEN** LifeOrg MAY describe distinct role perspectives but MUST remove or avoid claims of improved decision reliability
