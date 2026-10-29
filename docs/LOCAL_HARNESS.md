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

Additional commands: `/status`, `/ambient ordinary human exchange`, `/pause`, `/resume`, `/withdraw SAVED-DECISION-ID`, and `/quit`. Ambient input routes through the actual core without a provider request/reply. Pause suppresses requests; only the configured simulated approver can resume. Withdrawing a decision removes its authoritative statement and duplicate proposal text. Permission/configuration/source changes invalidate old confirmations as in the core tests.

The terminal also supports `/watch start`, `/watch tick`, `/watch stop`. Each tick advances the synthetic clock by one minute and reads the next bounded error fixture: new count 2, unchanged count 2 (silent), then increased count 5. Reports cite the actual selected fixture's party-route.ts line 3 and mark the cause unverified. No Roblox service, autonomous scheduler, Meta diagnosis or external post is used. Start/stop require the simulated owner; pause/configuration changes block old tasks. Stop the old task before starting a fresh replay. Task/baseline state persists separately in watch-replay.sqlite; project content deletion must purge both stores. See ADDONS.md for the staged participation/media features and limitations.

The local operator can select both simulated roles, so this is a software harness, not real-platform authentication, independent human evaluation or a consented group pilot. No Discord connection is made. The previously authored Discord adapter is deferred under current project sequencing.

`npm run smoke:live` is separate: it requires a populated `META_API_KEY` injected from the existing Infisical project. It performs one real Muse Spark request through the same core with synthetic evidence/fake local delivery, and preserves usage/reservations. All Meta testing is capped at the owner's EUR 5 total allowance using a conservative USD 5 dispatch ceiling. See `SECRETS.md` for the zero-value-output presence check. A missing/empty key blocks the live gate; mock checks never replace it.
