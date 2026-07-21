## ADDED Requirements

### Requirement: Server-only credential boundary
Only server code MUST read `OPENAI_API_KEY`; the key SHALL NOT appear in client bundles, JSON responses, D1, source control, telemetry, logs, thrown messages, fallback objects, or agent evidence.

#### Scenario: Inspect all observable surfaces
- **GIVEN** OpenAI is configured and a request succeeds or fails
- **WHEN** tests inspect built client assets, responses, logs, persisted rows, and errors
- **THEN** no full or partial credential value SHALL be observable

### Requirement: Safe status and test APIs
`GET /api/integrations/openai/status` MUST return only configuration state and effective model names, and `POST /api/integrations/openai/test` MUST perform one bounded, non-stored server-side probe and return a redacted result code; both endpoints SHALL reject unsupported methods and MUST NOT accept or return a key.

#### Scenario: Check configuration safely
- **GIVEN** the server key is present, absent, or rejected upstream
- **WHEN** an owning user calls status and test
- **THEN** the response SHALL distinguish those states without exposing provider payloads, credential text, or another user's data

### Requirement: Model policy
Strategy, Operations, and Risk/Audit Agents SHALL default to `gpt-5.6-terra`; Chief of Staff SHALL default to `gpt-5.6-sol`; server-side overrides MUST be allow-listed and the response SHALL record only the effective model name.

#### Scenario: Use defaults
- **GIVEN** no model override is configured
- **WHEN** a governed analysis runs
- **THEN** all specialists MUST use `gpt-5.6-terra` and the chief MUST use `gpt-5.6-sol`

### Requirement: Honest fallback
Missing credentials, provider failure, timeout, invalid structured output, or failed quality gates MUST produce either a retryable error or a visible `structured_offline` mode that lets the user continue recording personal judgment. Offline content SHALL NOT contain fabricated Agent contributions and SHALL NOT be labeled or styled as a real four-Agent discussion.

#### Scenario: Provider unavailable
- **GIVEN** OpenAI cannot complete an analysis
- **WHEN** the meeting remains usable through the framework
- **THEN** the UI MUST display the offline label and reason class, omit fabricated Agent speech, and preserve the approval gate

### Requirement: Privacy-preserving Agents execution
Agents SDK tracing and raw personal-input logging MUST be disabled by default. Redacted operational metadata MAY record effective model, duration, token totals, result status, and error class, but SHALL NOT contain personal meeting content unless a later explicit privacy setting is introduced.

#### Scenario: Run a personal meeting
- **GIVEN** a meeting packet contains private life records
- **WHEN** the four-Agent orchestration runs
- **THEN** no raw packet, Agent prompt, or Agent response SHALL be emitted to tracing or application logs by default
