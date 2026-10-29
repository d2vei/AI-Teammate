# Platform-independent local conversation

```sh
npm ci --ignore-scripts
npm run conversation:offline
```

On this Windows host use `npm.cmd` if PowerShell blocks npm.ps1. No vault account, API key, Discord application or network call is required. The provider is **scripted MOCK**, not AI output. The adapter and both participant identities are synthetic. SQLite state persists in ignored `.local/conversation-offline`; the app never executes a brief.

The harness starts with selected, newly authored synthetic code/log evidence and **zero approved decisions**. The log timestamp is rebased only when creating that explicitly seeded local fixture; old logs later expire from the one-hour retrieval window. A restart retains approved decisions/briefs, rather than reporting that work was performed.

Try the mechanics in order:

1. `/decision Party members must stay together.` prints an unapproved card with its exact JSON content/version and an `/accept` command containing a one-use version-bound token.
2. `/as peer`, then paste that exact `/accept ...` command. The configured approval gate rejects the simulated peer. A plain `yes` or emoji also cannot approve anything.
3. `/as owner`, then use the same exact `/accept ...` command. One approved decision is saved; repeating the valid command returns the existing record.
4. `/brief Investigate the selected party split.` prepares a bounded brief with approved decision IDs, source/log IDs, a hypothesis, next check and exclusions. Confirm its exact token to save it. Saving does not reproduce, edit, test, push or deploy anything.
5. `/ask What is recorded?` reports approved/saved state, with current source references. The offline response is a deterministic fixture explanation and is not model-quality evidence.

Additional commands: `/status`, `/ambient ordinary human exchange`, `/pause`, `/resume`, `/withdraw SAVED-DECISION-ID`, and `/quit`. Ambient input now routes to the composed participation policy, default off. Ordinary talk does not invoke the direct-request provider. Pause suppresses requests; only the configured simulated approver can resume. Withdrawing a decision removes its authoritative statement and duplicate proposal text. Permission/configuration/source changes invalidate old confirmations as in the core tests.

The terminal also supports `/watch start`, `/watch tick`, `/watch stop`. Each manual tick advances the synthetic clock by one minute and reads the next bounded error fixture: new count 2, unchanged count 2 (silent), then increased count 5. Reports cite the actual selected fixture's party-route.ts line 3 and mark the cause unverified. Manual ticks do not start the scheduler. No Roblox service, Meta diagnosis or external post is used. Start/stop require the simulated owner; pause/configuration changes block old tasks. Stop the old task before starting a fresh replay. Task/baseline state persists separately in watch-replay.sqlite.

Automatic replay is now available separately: `/watch start`, `/watch auto on`, then keep the terminal open. It polls on real one-minute intervals and displays only new/increased observations. `/watch auto off` disables scheduling but keeps the manual task; `/watch auto status` reports its state. `/watch stop`, `/pause`, explicit local deletion and `/quit` cancel the scheduler. Manual `/watch tick` is rejected while automatic mode is on, so it cannot accelerate that clock. No Roblox/Meta request or external post occurs. After restarting the terminal, an owner must explicitly enable automatic mode again; persisted sequence/counts prevent replaying the first frame as new.

For the integrated shadow/media mechanics, start a fresh local session if the current one already contains demo claims:

```sh
npm run conversation:offline -- --state-dir .local/my-new-conversation
```

The selected state directory must be a subdirectory of .local. Then use:

1. `/shadow on` as owner, then `/media voice`. This attaches a silent synthetic WAV with a separately supplied MOCK transcript, not real transcription. `/media image` similarly attaches one pixel with a supplied description. `/sources` shows the source labels, contents and original message IDs.
2. `/say Let us book Saturday.` three times. This is an exact advertised fixture pattern, not general language understanding. The third observation displays a shadow hand raise and `/invite EXACT-TOKEN`.
3. `/as peer`, then that exact `/invite ...` command. A member can invite this one intervention; this does not approve a decision or brief. Repeating it does not display a second response. `/why` shows scoped reason metadata.
4. In a fresh scene, replace the third booking message with `/say We will book Sunday instead.` to exercise participant repair. `/shadow off` or the owner command `/steer only speak when tagged` restores configuration silence. `/steer do not break discussion loops` blocks that move. Quoted commands inside `/say` cannot change settings.
5. `/media remove ORIGINAL-MESSAGE-ID` removes an own/permitted derivation, even while paused; saved briefs/decisions stop exposing unsupported contents. Ordinary `/decision`, `/brief`, `/accept` continue to use the existing confirmation gate. Invitation and approval tokens are separate.

The local operator can explicitly delete this project's content with `/forget-local-data CONFIRM` as owner. It pauses first, clears in-memory conversation/offers, purges participation and watch ledgers, and purges project sources/decisions/briefs. Charges remain and deleted sources are not automatically restored. This command is not a general filesystem delete. The built terminal verifier performs its deletion only in a newly created temporary synthetic session; it does not delete your existing local session.

`npm run test:conversation` drives the actual built terminal, extracts its displayed tokens, checks the wrong approver, one saved decision/brief, shadow/media/watch flow and durable state, and verifies deletion of its own temporary session. The sanitized report is evidence/local-conversation-v1.json. This is software integration evidence, not a human study or model-quality result.

`npm run watch:timed-demo` separately checks actual Node timers for about two minutes using synthetic feeds, including the 30-second stalled-read timeout. It writes evidence/watch-timers-v1.json. It makes no API calls and is not part of ordinary CI.

The local operator can select both simulated roles, so this is a software harness, not real-platform authentication, independent human evaluation or a consented group pilot. No Discord connection is made. The previously authored Discord adapter is deferred under current project sequencing.

`npm run smoke:live` is separate: it requires a populated `META_API_KEY` injected from the existing Infisical project. It performs one real Muse Spark request through the same core with synthetic evidence/fake local delivery, and preserves usage/reservations. All Meta testing is capped at the owner's EUR 5 total allowance using a conservative USD 5 dispatch ceiling. See `SECRETS.md` for the zero-value-output presence check. A missing/empty key blocks the live gate; mock checks never replace it.
