# Integration checks and reference map

This file carries source-backed planning requirements and unresolved checks. It is NOT a fresh verification of current APIs, model availability, pricing or third-party packages. Consult current official documentation while implementing the relevant adapter; do not restart general research.

## Meta provider: required early smoke check

Planning model family: Muse Spark; earlier plans name Muse Spark 1.3. `META_MODEL_ID` in the template is intentionally blank. Verify the exact entitled model identifier, authentication, official base URL, request/response format, error/usage fields, input limits, data-retention/training choice and pricing in the actual account.

The floor uses application-managed retrieval plus a model response over bounded source-labelled context. Tool calling or structured-output protocol may be added only after its real support is checked; do not require it to finish the first contextual response.

Test: one synthetic request, one response grounded in supplied decision/code/log data, one missing-source case and one provider-error path. Record actual request metadata/usage without keys or sensitive content. No paid call from public/untrusted CI. Missing account access stays BLOCKED while mock-based local tasks continue.

References from the supplied guide/plans:
- https://dev.meta.ai/docs/overview
- https://dev.meta.ai/docs/quickstart
- https://dev.meta.ai/docs/models
- https://dev.meta.ai/models/muse-spark
- https://dev.meta.ai/docs/pricing-rate-limits

## Discord: first real adapter

Use a bot/application identity, not a self-bot. Verify commands, message actions, replies, interactive components and required Gateway/message-content permissions for the installed application. Start in one opted-in test room. If broader content cannot be read, explicit interactions remain the supported reduced mode; do not imply full group awareness.

Extract stable platform actor and room IDs; display names are presentation only. Interactions may require timely acknowledgement; implement the installed official protocol rather than guessing timeouts. Button acceptance is server-side and bound to current proposal/actor/project/version/expiry.

References:
- https://docs.discord.com/developers/interactions/overview
- https://docs.discord.com/developers/events/gateway
- https://discord.js.org/docs

## Later platforms and sources

Slack is a later adapter, not a release requirement. GitHub live writes, local-live-source pairing and external agent MCP integration are deferred. The current snapshot/log workflow does not depend on those services being connected.

References preserved for later: https://docs.slack.dev/apis/events-api/ ; https://docs.github.com/en/apps

## Toolchain

Choose a supported Node/TypeScript toolchain and one package manager; pin the actual compatible versions and commit its lockfile. The reference plan chose npm, discord.js, SQLite, schema validation and Vitest. An equivalent sound existing implementation need not be replaced just to match a preference.

- https://vitest.dev/guide/mocking
- https://playwright.dev/docs/intro — only if a web interface is actually added.
- https://git-scm.com/docs/gitignore
- https://github.com/gitleaks/gitleaks
- https://github.com/Graphify-Labs/graphify — optional; not part of the floor, no whole-home or private-document indexing.

## Hosting

Use a local long-running process first. For a public demonstration, one approved persistent host with persistent SQLite storage is enough. Do not commit to a specific paid host without confirmed access/authority. No provisioned host, installed app or live product URL is supplied by this handoff.

## Rules sources and unknowns

`references/participant/Participant_Guide.txt` is an exact copy of the supplied guide, not freshly fetched official rules. It lists build Oct 27–Nov 4, deadline Nov 4 at 21:00 Eastern, public code, new work and a three-minute demo used with code/live product. Original tables are `[table]` placeholders. Do not invent their contents or mandatory hosting/presentation details.

Original entry points: https://dev.meta.ai/events/global-hackathon ; https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details ; https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit . Check newer official instructions if available. Preserve unresolved prior-work and live-product questions rather than blocking all independent implementation or inventing permission.
