# AI Teammate

A shared project assistant for direct questions, approved decisions, source-grounded answers and confirmed investigation briefs. The application checks who can see evidence and approve a proposal. A saved brief records a next step; it does not execute work.

The runnable interfaces are a platform-independent terminal with **scripted MOCK responses** and a separate **real Meta terminal** using the same approval core. Both use simulated local participants; Discord connection and installation are deferred.

## Try the local workflow

Use Node **24.21.0** and npm **11.19.0**. On Windows PowerShell, use `npm.cmd` if the npm script shim is blocked.

```sh
npm ci --ignore-scripts
npm run conversation:offline
```

Dependency installation needs the public npm registry; the offline workflow itself needs no vault, API key or network access. It stores local state under ignored `.local/`.

1. Enter `/decision Party members must stay together.` to draft an unapproved decision.
2. Copy the displayed `/accept EXACT-TOKEN` command to approve that exact proposal as the simulated owner. `/as peer` demonstrates rejection of an unauthorized confirmation. Ordinary “yes” does not approve anything.
3. Enter `/brief Investigate the selected party split.` to draft a source-grounded investigation brief. Its separate confirmation saves it.
4. Enter `/ask What is recorded?` to retrieve approved decisions and saved briefs. Use `/quit` to exit.

The supplied party-routing code and structured event are synthetic. Terminal role switching demonstrates software checks, not authenticated group identities. See [the local harness guide](docs/LOCAL_HARNESS.md) for pause/resume, source withdrawal, data deletion, shadow invitations and error-watch replay.

For real model responses, build offline, configure the native Infisical session, then run `npm run conversation:live`. It supports explicit questions, bound follow-ups, decision approval, saved briefs, synthetic attachments and an owner-enabled saved-JSON error watch. These share a persistent spending cap; the watch is explicitly replay rather than live Roblox telemetry. See [the live terminal guide](docs/LIVE_TERMINAL.md) for setup, commands and limitations.

Each project has a [searchable memory vault](docs/MEMORY.md). Use `/memory search QUERY` to inspect retained decisions, briefs and evidence, and organize them into topics with `/memory tag REF TOPIC`. Older relevant knowledge is ranked before the model's context limit. Proposal, approval and evidence status remain visible.

## Verify the software

```sh
npm run typecheck
npm test
npm run test:cli
npm run test:conversation
npm run demo:offline
```

These checks use fake providers and temporary SQLite state. The complete offline workflow is defined in [the CI file](.github/workflows/offline.yml); [development commands](docs/DEVELOPMENT.md) include the separate mutation and replay checks. Native media-codec checks are optional and require the tools documented in [CODECS.md](docs/CODECS.md).

The [documented usefulness cases](docs/USEFULNESS_TESTS.md) check focused source questions, correction recall, confirmed saved next steps and unavailable evidence. The current unit suite passes 222 cases; three targeted negative controls verify those tests reject removed fixes. Controlled replies check application behavior, not actual model quality or human usefulness.

A fresh Windows dependency installation and all thirteen offline-workflow commands passed on candidate `c6089ec` (222 tests), without vault access or credentials; see [the clean-install record](evidence/clean-install-c6089ec.json). The [hosted Ubuntu workflow](https://github.com/d2vei/AI-Teammate/actions/runs/41001759669) passed the same thirteen commands on `4126e9a`, with unchanged source/tests/workflow/dependencies. Live interfaces and human evaluation remain separate checks.

## Architecture

The [local terminal](src/live-conversation.ts) normalizes requests for the [shared core](src/core.ts). The core retrieves permitted [source excerpts](src/sources.ts) and approved/saved records from [SQLite](src/store.ts), calls [Meta](src/meta.ts) through a [serialized transport](src/meta-runtime.ts), validates response schemas/source IDs and rechecks access, pause and evidence before display. Proposal confirmation is a separate application transaction bound to the actor, scope, version, expiry and source identities. Schema validation does not prove an explanation is correct.

## Current evidence

- The offline suite includes scope, confirmation binding, source access, persistence, budget reservation, live-terminal pause/follow-up and failure-handling checks. Exact current counts are in [STATUS.md](docs/STATUS.md).
- Actual Meta tests generated a decision and brief saved through simulated bound confirmations. Eight same-context answer pairs remain inconclusive pending manual ratings.
- The real terminal's combined media/replay check passed six Meta requests: a new decision, actual image interpretation, grounded brief/follow-up and two changed-count diagnoses. Unchanged replay was silent; saved state survived restart and owned test data was removed. Synthetic actors and replay remain distinct from real platform interaction. The earlier direct-only exit failure remains preserved.
- The real participation shadow pilot **failed**: 0/15 intended interventions, 0/25 negative-case interruptions, all 180 turns silent. Mention-only remains the supported fallback; unsolicited participation is not enabled.
- The five-case media regression met four strict synthetic cases. The audio-important clip still had inconsistent provenance wording and received no strict credit. The earlier failed media pilot is retained.
- Real group interactions, human judgments, deployment and the final demonstration are incomplete.

Exact candidates, usage, failures and limitations are in [LIVE_TESTS.md](docs/LIVE_TESTS.md), [STATUS.md](docs/STATUS.md) and the sanitized [evidence](evidence/) files. Software tests, provider calls and human evaluation are separate evidence.

## Credentials and live tests

Follow [SECRETS.md](docs/SECRETS.md) for the official Windows Infisical CLI, interactive browser login and native credential store. Keep `.env.example` blank; never export vault values into `.env`, print them, commit them or launch a coding agent with them. Offline tests do not require vault access.

Live commands are fixed bot/test routes with bounded requests, a persistent shared spending ledger and no automatic retry. Preserve completed attempts and uncertain charges. Review [LIVE_TESTS.md](docs/LIVE_TESTS.md) and configure an authorized allowance before any additional trial. The app has no shell, code-editing, Git-writing, deployment or worker-execution capability. Jev and OpenAI integrations are disabled.
