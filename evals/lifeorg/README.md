# LifeOrg Agent evaluation

This suite uses synthetic graduate-student, applicant, and multi-project student cases. It contains no production records.

Run all deterministic fixtures:

```sh
node scripts/run-agent-evals.mjs --variant all --offline-fixture
```

Run the real provider workflow (the environment variable is read only by the server-side runner):

```sh
OPENAI_API_KEY=... node scripts/run-agent-evals.mjs --variant all
```

Quality is scored from recommendation content on six 0–4 dimensions. Latency, tokens, and model calls are reported separately. Fixture scores verify the harness, not real model superiority. `human-review.json` is deliberately initialized as pending; `--release` stays blocked until 14 blinded ratings and the declared gain threshold are present.
