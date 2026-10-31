# Longer group conversation check v1

Requested 31 October 2026. New purpose: sequential use across four simulated member roles, topic changes, corrections, a real SQLite reopen, earlier saved-state recall and source removal. This does not repeat or relabel the original frozen direct-response/participation pilots.

`conversation.json` has 90 authored conversational turns: 72 ambient messages and 18 explicit questions/replies, plus seven state controls. The core accepts normalized synthetic actor identities. The actors are not real people, generated agents, authenticated platform users or an independent user study. No Discord transport is used.

`rubric.json` defines eighteen answer-review criteria before the live run. It is grader data; the driver hashes it for identity but never parses or supplies it to the provider. Real input contains only the explicit request, actor metadata, authorized project context and one bound reply where applicable. Ambient chatter does not automatically enter retained memory; the colour-recall case deliberately exposes that limit.

The application checks scope, casual agreement, wrong-actor confirmation, duplicate saves, withdrawal, restart, removal and pause. Three offline harness tests exercise those paths, exclude grader/chatter leakage and preserve a failed model draft without seeding a substitute approval. They use controlled model replies and do not grade real answer quality.

After building, the fixed `npm run test:long-conversation-live` route uses the native Infisical launcher, shared persistent ledger, at most 18 actual response requests, no automatic retry and a maximum USD 0.50 additional local reservation ceiling within the existing cumulative USD 5 cap. It preserves a one-attempt private capture and publishes metadata only. Its candidate must be committed and clean before dispatch. It purges only its owned synthetic project, retaining charges.

The coding agent will review actual delivered answers against the fixed rubric and record USEFUL, PARTIAL, FAIL or NOT_RUN with reasons. These are agent judgments on a small self-authored scenario, not human ratings or a measured advantage over a baseline. Provider failures, unusable cards and skipped dependent steps remain visible. The original manual-review page and captures remain unchanged.

At preparation time the real run and answer review are NOT_RUN. Official [model documentation](https://dev.meta.ai/docs/models) and [pricing](https://dev.meta.ai/docs/pricing-rate-limits) were checked on 31 October 2026: existing Standard Muse Spark 1.3, USD 1.25/M input and USD 4.25/M output remain the configured basis. Accounting conservatively uses uncached input prices; the local ledger is not a provider billing statement.
