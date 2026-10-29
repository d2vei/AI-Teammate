# Run and verify the implementation

Current phase: platform-independent core and local conversation harness. Discord connection/installation is deferred. Earlier authored adapter code is preserved as reference, not advertised as live support.

Use Node 24.21 or a later Node 24 release and npm 11.19. On Windows with a blocked PowerShell npm shim, use `npm.cmd` for each command below. No live credentials are needed for offline checks.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run test:mutation
npm run test:cli
npm run demo:offline
npm run replay:offline
npm run test:participation-mutation
npm run test:conversation
```

The demo uses a scripted **MOCK** provider, fake participant IDs/adapters and temporary SQLite. It proposes and approves a new decision, cites the newly authored synthetic source/log fixture, rejects a peer's confirmation, saves one brief, checks duplicate confirmation and reopens the database. It sends no Discord messages and makes no Meta request. It is a software check, not model-quality or live-product evidence. Temporary fixture data is deleted after the check.

## Meta-only smoke

Follow `SECRETS.md` for the official Infisical Windows CLI, browser login and OS credential store. Link the existing Ai-Teammate project and Development (`dev`) environment. Only a populated `META_API_KEY` is needed for this phase; no Discord IDs/token are required. Do not populate/export `.env`; `.env.example` stays blank. The fixed launcher selects the project root folder without imports or recursion.

```sh
npm run build
npm run vault:check
npm run smoke:live
```

`vault:check` prints only variable-name/presence status, never a value, and makes no model request. `smoke:live` checks entitled model access, then permits one real inference with synthetic evidence and fake local delivery. It records exact candidate/usage/source identity in ignored `.local/evidence/meta-smoke-v1.json` and refuses to overwrite/retry a started attempt. No expensive fallback occurs. The current testing allowance is EUR 5 total with a conservative cumulative USD 5 dispatch ceiling; actual/uncertain charges persist in SQLite. Ask before exceeding the owner's allowance.

The adapter uses documented `muse-spark-1.3` Standard mode, official host, Responses protocol, `store:false` and bounded output. `store:false` is not a claim of zero operational retention. Missing/empty credentials return BLOCKED. Jev/OpenAI are disabled. No deployment is provisioned. See STATUS for actual provider evidence rather than treating a stored key or startup as success.

## Conversation and approvals

Use `npm run conversation:offline` for the terminal workflow described in `LOCAL_HARNESS.md`. `/decision` drafts an unapproved card; `/accept EXACT-TOKEN` confirms it through the core's approval gate. `/as owner|peer` selects explicitly simulated identities. `/brief` prepares objective, approved decisions, evidence, hypothesis, next check and exclusions. Confirming saves it; the app has no execution capability. Casual agreement cannot approve anything.

Confirmations expire after 15 minutes and bind exact content/version, scope, configuration, actor restriction and selected snapshot/source identities. Repeated valid acceptance returns the same saved record. Changed or inaccessible evidence requires a new proposal. `/withdraw` removes an approved decision's authoritative statement and duplicate proposal copy; prepare a correction separately. `/pause` suppresses replies; only the configured simulated approver can `/resume`. Local role-play is software testing, not real-platform identity or independent human evaluation.

The app distinguishes saved/proposed/approved state in code and validates source IDs and schemas. Natural-language grounding and truthfulness still require model evaluation; a schema cannot prove an arbitrary explanation correct. It always labels analysis as unexecuted. No source is described as the latest GitHub version automatically.

## Source and data boundaries

Stop the service before using operator commands. One exclusive state-directory lock prevents multiple service/CLI processes sharing its budget. After a crash, inspect the PID in `service.lock` and verify no process uses that directory before manually removing the stale lock. Do not delete the database or charge ledger to reset uncertain costs.

The ingress/core methods use the shape in `examples/party-queue.json`. Each file has a relative non-secret path and at most 150 selected lines/6000 characters; at most eight files. Logs are structured objects limited to ID, timestamp, event kind, party ID and destinations; unknown fields are stripped before storage/model input. Only the last 12 eligible events within one hour are retained from an import. Use a new snapshot ID for changed contents. Source deletion/freshness tests verify withholding and confirmation invalidation. Heuristics reject obvious credential-bearing paths/assignments; they are not a universal secret detector. Current demonstrations supply synthetic data only.

The tested `Store.purgeProject` method deletes source, proposal, decision and brief content, pauses the project and vacuums/checkpoints SQLite. It retains the content-free cost ledger/trace hashes so deletion cannot reset spending. Backups and exported captures are separate copies. Automatic retention scheduling is deferred. SQLite is local plaintext; no storage-encryption key is created or deleted by this app. The older Discord-specific operator entry point is not the current setup route.

Trace metadata records hashed event/config/prompt identity, source IDs, provider/model, usage when reported, outcome and delivery status. Raw chats, prompts, code and provider error bodies are not logged. Timeouts/unknown charges retain their reservation across restarts. Local reservations bound dispatch but do not constitute a provider-enforced billing cap. Uncertain sends are not blindly retried; request status or ask again with a new event.

See `STATUS.md` and `WORKLOG.md` for checks actually run and remaining live gates.

The local terminal composes read-only watch replay, supplied media fixtures, shadow participation, separate invitations and normal saved decisions/briefs. See LOCAL_HARNESS.md for the exact fixture commands and scoped deletion. Prepared participation/media Meta adapters are exercised by HTTP mocks only and have no live launcher action; createMetaRuntime provides their shared serialized transport. ADDONS.md records what remains disconnected, primary sources and separate model-quality gates. The owner has saved the working Meta key; the separate smoke, frozen evaluation and core-flow checks have run, as recorded in LIVE_TESTS.md. Offline development does not depend on access.

Read-only local watch scheduling is opt-in with `/watch auto on`; one-minute minimum intervals use real timers. Stop/pause/exit cancel it, and stalled reads stop scheduling after 30 seconds. `npm run watch:timed-demo` is the optional two-minute native-timer check over synthetic data, separate from fast CI and from any live service test.

Optional supplied-attachment preparation uses a pinned local FFmpeg/ffprobe installation. `npm run test:codec` checks real OGG/Opus conversion, PNG/JPEG decoding, MP4 duration and invalid-input rejection, with MOCK descriptions and zero model requests. See [CODECS.md](CODECS.md) for verified tool setup, bounds, temporary-file handling and evidence. Ordinary offline tests need no codec installation; no native binary is committed.
