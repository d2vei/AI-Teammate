# Run and verify the implementation

Use Node 24.21 or a later Node 24 release and npm 11.19. On Windows with a blocked PowerShell npm shim, use `npm.cmd` for each command below. No live credentials are needed for offline checks.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run test:mutation
npm run test:cli
npm run demo:offline
```

The demo uses a scripted **MOCK** provider, fake participant IDs/adapters and temporary SQLite. It proposes and approves a new decision, cites the newly authored synthetic source/log fixture, rejects a peer's confirmation, saves one brief, checks duplicate confirmation and reopens the database. It sends no Discord messages and makes no Meta request. It is a software check, not model-quality or live-product evidence. Temporary fixture data is deleted after the check.

## Private setup for the live adapter

Follow `SECRETS.md` for the official Infisical Windows CLI, browser login, OS credential store and dashboard variable names. Do not populate/export a local `.env`; `.env.example` stays blank. Use newly rotated credentials if an earlier bot upload exposed them. Set the actual guild, room, member and approver **IDs**, never display names. Optional role IDs restrict approvers in addition to the ID list. The guild owner and administrators can see private channels in Discord, so include them in the opted-in audience or use a dedicated test guild. All visible identities except this bot must be in `DISCORD_MEMBER_IDS`. The MVP supports one guild text room in a guild with at most 100 members; DMs and threads are excluded.

Install a Discord bot application with `bot` and `applications.commands` scopes. Enable Server Members and Message Content privileged intents for that bot in the Developer Portal. Give it View Channel, Send Messages, Read Message History and Embed Links in the selected room. The adapter fetches current roles, full small-guild membership and channel permissions before retrieval/delivery. An unverifiable audience fails closed. Mention/reply mode needs the relevant content permissions; slash/message commands are explicit invocations. There is no ambient participation or Slack connector.

Set `META_MODEL_ID=muse-spark-1.3`, `META_DATA_MODE=standard`, and the private API key. Both budget fields default to zero. Set them to an **actually authorized available** allowance; the effective app ceiling is the smaller value and at most $120. No provider/model fallback occurs. Account model access is checked using the official models endpoint before startup. Standard mode and `store:false` are implemented from the official documentation; `store:false` is not a claim that all operational retention is zero. Verify the applicable account agreement before enabling private source bundles with `META_PRIVATE_DATA_VERIFIED=true`. Start with synthetic data.

```sh
npm run build
npm run vault:check
npm run bot:init
npm run bot:seed
npm start -- status
npm run bot:register
npm run smoke:live
npm run bot:live
```

The fixed vault launchers inject configuration only into these bot operations. `bot:init` creates one persistent project from environment IDs and seeds no decision. It refuses to overwrite an existing project. `bot:seed` imports a fresh, explicitly labelled synthetic snapshot and rebases its seeded log time to now; no claim is made that the log came from a real application. `bot:register` upserts only the project's named guild commands, preserving unrelated commands. It requires the real application ID. `smoke:live` makes one budgeted real inference over synthetic sources, without Discord delivery; inspect the reported outcome/usage and version before treating it as live provider evidence. A successful startup alone is not product acceptance.

These live commands are implemented but have not been verified against real account credentials in the initial implementation. Missing credentials return BLOCKED, not a mock substitute. Keep the long-running service on a persistent host with a durable state directory. No deployment or paid host is provisioned.

## Conversation and approvals

Use `/teammate request:...`, mention the bot, reply to one of its messages, or choose **Apps > Ask AI Teammate** on a message in the configured room. Ask to propose a decision, then use **Approve decision** as a current configured approver. Casual agreement creates no approval. A requested brief appears with objective, decisions/evidence, hypothesis, next check and exclusions. **Confirm and save brief** persists it; the app has no execution capability.

Buttons expire after 15 minutes and bind exact content/version, scope, configuration, actor restriction and selected snapshot/source identities. Repeated valid acceptance returns the same saved record. Changed or inaccessible evidence requires a new proposal. `/teammate-withdraw` removes an approved decision's authoritative statement and its duplicate proposal copy; ask for a new correction separately. A changed/deleted source message invalidates dependent saved/proposed content. `/teammate-pause` or a directly invoked `stop`/`pause` halts substantive replies; only approvers can use `/teammate-resume`.

The app distinguishes saved/proposed/approved state in code and validates source IDs and schemas. Natural-language grounding and truthfulness still require model evaluation; a schema cannot prove an arbitrary explanation correct. It always labels analysis as unexecuted. No source is described as the latest GitHub version automatically.

## Operator source and data commands

Stop the service before using operator commands. One exclusive state-directory lock prevents multiple service/CLI processes sharing its budget. After a crash, inspect the PID in `service.lock` and verify no process uses that directory before manually removing the stale lock. Do not delete the database or charge ledger to reset uncertain costs.

```sh
npm start -- import path/to/approved-bundle.json
npm start -- select supplied-snapshot-id
npm start -- source-remove source-id-from-status
npm start -- pause
npm start -- resume
npm start -- purge-project demo
```

Source bundles use the shape in `examples/party-queue.json`. Each file has a relative non-secret path and at most 150 selected lines/6000 characters; at most eight files. Logs are **structured objects**, limited to ID, timestamp, event kind, party ID and destinations; unknown fields are stripped before storage/model input. Only the last 12 eligible events within one hour are retained from an import. Use a new snapshot ID for changed contents. Snapshot import does not select it automatically. Heuristics reject obvious credential-bearing source paths/assignments; operators must still sanitize their selected files.

`purge-project <exact-project-id>` performs deletion of source, proposal, decision and brief content, pauses the project, vacuums/checkpoints SQLite, and reports a timestamp. It retains the content-free cost ledger and trace hashes to preserve spending/dedup evidence. Backups, exported captures and Discord messages are separate copies that the pilot owner must remove when consent requires it. Automatic retention scheduling is deferred. SQLite is local plaintext; no storage-encryption key is created or deleted by this app.

Trace metadata records hashed event/config/prompt identity, source IDs, provider/model, usage when reported, outcome and delivery status. Raw chats, prompts, code and provider error bodies are not logged. Timeouts/unknown charges retain their reservation across restarts. Local reservations bound dispatch but do not constitute a provider-enforced billing cap. Uncertain sends are not blindly retried; request status or ask again with a new event.

See `STATUS.md` and `WORKLOG.md` for checks actually run and remaining live gates.
