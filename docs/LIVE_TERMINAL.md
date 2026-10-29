# Local conversation with Meta

This terminal uses real Muse Spark responses for explicit questions, decision drafts, investigation briefs and bound follow-ups. Its actors and supplied party-routing fixture are synthetic. The local operator can switch both roles; this does not establish platform authentication or a human group study.

## Start

Use the existing native Infisical setup in [SECRETS.md](SECRETS.md). Only `META_API_KEY` is needed in the linked `dev` root. Build before vault injection:

```sh
npm run build
npm run vault:check
npm run conversation:live
```

On Windows use `npm.cmd` if PowerShell blocks the npm shim. The fixed launcher supplies the verified Standard model settings and shares the existing `.local/state/teammate.sqlite` charge ledger, cumulative authorized ceiling and exclusive service lock. It strips Discord and private-source controls from this child. No `.env` export, coding-agent injection or other-provider fallback is used.

The banner shows the authorized cap and existing use/reserves. Each direct request can spend part of that allowance. Ordinary text is an explicit local request; `/ambient TEXT` remains silent and cannot approve a proposal. Enter synthetic test material only, without secrets or private project content.

## Use

1. `/status` shows the simulated actor, pause state, saved counts and cumulative spending.
2. `/decision Party members must stay together.` asks Meta to draft an unapproved card. Copy its exact `/accept ...` command as owner to approve it. `/as peer` demonstrates rejection of that confirmation; `/as owner` switches back. Textual agreement is never acceptance.
3. `/brief Compare the approved rule with the selected party code and event.` asks for a grounded draft. Its separate exact confirmation saves the brief. Saving does not execute its next check.
4. `/reply Which parts are observations versus hypotheses?` follows up on the last accepted answer with explicit reply metadata. Its binding expires when relevant evidence/configuration changes or a decision is approved/withdrawn. Ask a fresh `/ask TEXT` after such changes. Reply memory is not restored across process restarts; saved decisions/briefs remain in SQLite.
5. `/sources` displays the authorized current context. `/withdraw ID` withdraws an approved decision. `/pause` suppresses output; only the simulated owner can `/resume`.
6. `/quit` pauses the project, suppresses pending delivery, drains an in-flight provider request and exits. A dispatched request can still be charged. While a request is active, only `/pause`, `/status` and `/quit` are accepted; other input is rejected rather than queued for later spending.

After the integration check this local project is deliberately empty and paused. If you want to replace its demo content, use **`/reset-demo CONFIRM` as owner**. It deletes this local project's decisions/briefs/sources, seeds a new explicitly synthetic fixture and resumes it, retaining shared charges and other projects. `/forget-local-data CONFIRM` deletes this project's content and pauses it without reseeding. Neither command deletes arbitrary files. Synthetic logs expire from retrieval after one hour; the explicit demo reset rebases their fixture times rather than claiming old observations are new real events.

This live terminal has no participation, media, watch, shell, code-editing, Git or worker route. Unknown slash commands do not dispatch. The separate [offline terminal](LOCAL_HARNESS.md) retains its MOCK add-on demonstrations.

## What was verified

- Typecheck/build and the offline HTTP-mocked suite cover native core approvals, actual reply fields, stale-source/config rejection, scope, budget retention, pause during generation and pending EOF/signal drain.
- First actual `test:conversation-live` attempt on `4203077` made three real requests, observed one approved decision/one saved brief, rejected the simulated peer, exercised duplicate acceptance and accepted a bound follow-up. **Overall FAIL:** application cleanup completed but the native stdin pipe kept the process alive until the driver's timeout. Restart of that generated state was NOT_RUN. Only the new synthetic project content was subsequently purged; charges remained. No paid rerun.
- A zero-model native subprocess check reproduced the exit hang. Closing the owned input pipe after pending work drains fixed it; `/quit` and observed EOF then exited normally in the subprocess check.
- Two real Infisical launch/status/quit cycles passed after the fix, with no generation command and unchanged charge rows/use. This checks restart of the already-purged scope only, and does not replace the failed full first attempt.

See [failed actual terminal evidence](../evidence/live-conversation-v1.json), [separate corrected lifecycle evidence](../evidence/live-terminal-lifecycle-v1.json) and [LIVE_TESTS.md](LIVE_TESTS.md). `npm run test:live-terminal` is offline and included in CI. `npm run test:live-terminal-service` is a separate native/vault check that preserves its attempt. The three-request `test:conversation-live` trial is already preserved and refuses rerun or an existing local scope. Human ratings, actual platform interactions and final product acceptance remain separate.
