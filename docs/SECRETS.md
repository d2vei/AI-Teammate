# Local Infisical setup

Current phase, 2026-10-29: the owner has placed `META_API_KEY` in the existing **Ai-Teammate** project, **Development** (`dev`) environment. Use that project; the current key-presence check and smoke need **only META_API_KEY**, not Discord credentials/IDs or a new account/project. The fixed launcher currently selects the project root folder `/` without imports or recursive fetching. Discord actions are deferred and rejected by the launcher. The earlier complete-bot setup below is a future reference, not a current requirement.

Current sequence: `npm run vault:login`, `npm run vault:link -- EXISTING-PROJECT-UUID`, `npm run build`, `npm run vault:check`, then `npm run smoke:live`. The key-presence check prints a boolean/name result only and makes no provider call. The smoke uses one real Muse Spark request through the core and a fake local adapter, with synthetic evidence and a preserved one-attempt record. It does not require or contact Discord.

The owner authorized **EUR 5 total** for Meta testing on 2026-10-29, requiring permission above that. Meta prices in USD. The local cumulative ceiling is USD 5, below EUR 5 using the [ECB 2026-10-28 EUR/USD reference rate of 1.1133](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html), with approximately 10 percent FX headroom. Reported/uncertain charges share the durable `.local/state/teammate.sqlite` ledger. Evaluation supplies fixed Standard model/non-secret budget defaults from this authorization, clamps larger dashboard values to USD 5, preserves stricter/zero limits and rejects a different state directory. Only META_API_KEY must be supplied through the vault for this phase. This does not assert a remaining provider credit balance or a provider-enforced billing cap.

Secrets are injected by the official Windows CLI into fixed bot/setup/live-check processes. The coding agent is never a child of `infisical run`. Offline installation, typecheck, tests, mutation check, CLI checks and the scripted demo require no account, vault or real key.

## Verified installation and storage boundary

On 2026-10-28, `winget install --id infisical.infisical --exact --source winget --version 0.44.10 --accept-package-agreements --accept-source-agreements --silent` installed official CLI 0.44.10 and winget verified the installer hash. The launcher resolves the per-user WinGet binary without requiring a PATH change.

`npm run vault:native-check` verifies that version, uses the metadata-only `infisical vault` command to require `auto`, and writes/deletes a unique **synthetic** Windows Credential Manager probe. No existing credential is enumerated, read or deleted. This check passed. `auto` selects the system keyring. The pinned upstream CLI can switch to an encrypted file vault on a keyring write failure; the launcher checks again after commands and reports BLOCKED if that happens. It never selects `file`, resets a vault, exports a key, or silently accepts fallback. The probe establishes current native-store availability, not a guarantee that later Windows writes cannot fail.

The official CLI also maintains encrypted offline secret backups under its user configuration directory. This is upstream behavior, not a plaintext `.env` export. Its encryption key uses the selected vault. The launcher does not read those files or keys. Because upstream login can clear old Infisical cache keys, the login wrapper refuses a pre-existing nonempty `secrets-backup` folder and asks for deliberate preservation/review. It does not delete unrelated encryption keys or user data. No prior Infisical home existed at the initial names-only inspection.

## Manual account and browser login

1. Create a free account on **Infisical Cloud EU**, `https://eu.infisical.com`. Enable two-factor authentication in your account's security settings and keep recovery material privately. Account creation and 2FA are manual; this repository cannot certify them automatically.
2. Use the existing **Secrets Management** project Ai-Teammate, environment slug `dev`, root folder `/`. It is already linked; do not create another project or move the working key to the older proposed folder. Do not add Jev or OpenAI credentials.
3. From this workspace, run `npm run vault:login`. It opens the official browser flow on EU Cloud and saves the session as profile `ai-teammate`. Sign in and approve in the browser. No terminal password/token entry, `--plain`, service token or machine identity is used. Raw login output is suppressed. If the browser flow fails, stdin is closed so no terminal-password fallback is supplied.
4. Run `npm run vault:status` to verify the login metadata, then copy the **non-secret project UUID** from Project Settings. Link it with `npm run vault:link -- YOUR-PROJECT-UUID`. The official CLI writes `.infisical.yaml`; this local link is ignored. Existing link files are preserved, never overwritten by the wrapper.
5. Enter the rotated META_API_KEY manually in the dashboard's `dev` root folder `/`. Do not paste values into chat, command arguments, a file, a screenshot or Git. `.env.example` is a blank inventory of variable **names**, not a file to fill. Account creation/2FA and dashboard entry are manual owner actions; the application does not certify them.

## Dashboard entries

| Variable name | Value to supply privately |
|---|---|
| `META_API_KEY` | Newly rotated Meta Model API key. |
| `DISCORD_BOT_TOKEN` | Newly rotated Discord bot token. |
| `DISCORD_APPLICATION_ID` | The bot application's actual ID. |
| `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_ID` | The dedicated opted-in test guild and text-room IDs. |
| `DISCORD_MEMBER_IDS` | Comma-separated IDs of all opted-in viewers, including visible administrators/owner. |
| `DISCORD_APPROVER_IDS` | Comma-separated permitted approver IDs, all included in members. |
| `DISCORD_APPROVER_ROLE_IDS` | Optional role IDs restricting those approvers further; omit if unused. |
| `META_MODEL_ID` | `muse-spark-1.3` (verified Standard identifier; actual entitlement still checked at launch). |
| `META_DATA_MODE` | `standard`. Contributor mode is excluded. |
| `META_PRIVATE_DATA_VERIFIED` | `false` until you have verified account terms for private material; initial synthetic fixtures need no private-data claim. |
| `APP_PROVIDER` | `meta`. The live launcher rejects other providers. |
| `APP_PROJECT_ID` | `demo` for the documented initial project. |
| `APP_STATE_DIR` | `.local/state` for the documented local persistent database. |
| `APP_MAX_SPEND_USD` | Your chosen local spending ceiling, at most the authorized available allowance. |
| `APP_AUTHORIZED_ALLOWANCE_USD` | Amount you actually authorize from currently available credit, never an assumed $150. |

The table includes deferred full-bot configuration names for reference. The current fixed smoke/evaluation requires only META_API_KEY and uses the owner's conservative USD 5 ceiling; a stricter configured evaluation budget is preserved and zero blocks inference. No usage/pricing or account-entitlement PASS follows merely from saving a key.

## Fixed live commands

Build offline first, then verify configuration without making a paid/model/Discord request:

```sh
npm run build
npm run vault:check
```

`vault:check` prints only required-name/configuration status, never values. It is not a provider or Discord connectivity test. The launcher fetches only `dev` root `/`, disables imports, recursion, expansion and personal secret overrides, and forwards only the app's allowlisted variables into Node. The injected child checks the native backend again before forwarding credentials to the app. OpenAI/Jev keys, Infisical tokens and Node preload variables are not forwarded.

```sh
npm run smoke:live
npm run eval:live
npm run test:core-live
node scripts/export-meta-evidence.mjs
```

The frozen synthetic paired-response evaluation is a separate live command, `npm run eval:live`; it uses the same locked spending ledger and can make up to sixteen sequential Meta calls. Run only after the smoke gate and within the authorized allowance. See `evals/frozen/README.md`. Its local `npm run eval:offline` counterpart makes zero model calls. The exporter publishes selected metadata/counts only, without raw responses or credentials.

`smoke:live` performs one budgeted synthetic Meta request without Discord delivery; an existing attempt is never overwritten or automatically retried. Each fixed live wrapper invokes `infisical run -- ... node scripts/vault-child.mjs FIXED-ACTION`; no arbitrary command, shell or coding agent is accepted. Discord command registration/startup actions remain rejected and are not exposed as npm commands. Keep the OS login and durable state on this host.

`test:core-live` permits at most two real generations using simulated owner/peer identities: draft a new decision, exercise the existing confirmation gate, draft a source-grounded brief, save it only through authorized bound confirmation, check restart and purge only the newly created synthetic project. Charges remain in the shared ledger. Its own first-attempt artifact is preserved; no automatic repeat. These three initial live runs have now completed; see LIVE_TESTS.md before attempting any command again.

Media checks are separate fixed test routes: `test:media-live` (five-case v1), `test:voice-diagnostic` (one distinct integration diagnostic), and `test:media-v2-live` (five-case same-recipe regression). Offline preparation uses local speech/FFmpeg and no key. All paid routes use the same locked charge ledger and at-most-USD-5 cap; native codec/generation children receive OS settings only. Each completed attempt is preserved and its own fixture/project content removed; no arbitrary files or older account uploads are deleted. These checks have completed and must not be silently repeated. See LIVE_TESTS.md for the original failure, bounded fix, remaining partial audio behavior and current spending.

Do not use `infisical export`, `secrets`, `printenv`, `process.env` dumps, `login --plain` or a coding-agent launch under the vault. Do not expose live keys to CI. All public/offline CI uses mock data only.

## Migration and removal status

The root and known legacy credential filenames were inspected by name only. No actual `.env`, `.env.local`, `bot.env` or `data/bot.env` was found in this workspace. No plaintext credential file has been created/exported or deleted. Session/native-store setup, dashboard entries, successful injection and live calls are separate checks in `STATUS.md`.

After a successful vault configuration check, remove only an explicitly identified legacy API-key file that is confirmed unnecessary. Preserve unrelated encryption keys, backups and user data; deletion never revokes an exposed credential. No blanket recursive cleanup or home-directory scan is part of this integration. Staged content, tracked ignored files and full Git history are checked with redacted Gitleaks output before publication. A scanner finding is a stop condition for public pushes, not a credential rotation mechanism.

Sources checked: [official quickstart](https://infisical.com/docs/cli/usage), [installation](https://infisical.com/docs/cli/install), [project configuration](https://infisical.com/docs/cli/project-config), [FAQ](https://infisical.com/docs/cli/faq), and version-pinned CLI help/source for [backend fallback](https://github.com/Infisical/cli/blob/v0.44.10/packages/util/keyringwrapper.go), [backend metadata](https://github.com/Infisical/cli/blob/v0.44.10/packages/cmd/vault.go), [encrypted backups](https://github.com/Infisical/cli/blob/v0.44.10/packages/util/secrets.go) and [browser login](https://github.com/Infisical/cli/blob/v0.44.10/packages/cmd/login.go). These sources establish behavior; actual account/2FA/live evidence must still be recorded.
