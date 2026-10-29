# Implementation status

Updated 2026-10-29. Evidence is software/mock unless explicitly marked live. Current sequencing: Meta credential check and one real small smoke, then platform-independent core/local harness; Discord deferred.

| Area | Observed status |
|---|---|
| Baseline/provenance | PASS: workspace held handoff only, no old Git/source imported; references/private context ignored. |
| Local core and SQLite | Implemented: explicit invocation, scope/dedup/pause/budget, traces, immutable sources, approved decisions and transactionally saved briefs. No execution capability. |
| Typecheck/build | PASS on Node 24.21.0/npm 11.19.0. |
| Deterministic tests | PASS: 97 offline tests; includes HTTP mocks, fake adapters, real temporary SQLite, launcher, local conversation and shadow participation checks. |
| Participation add-on | Experimental shadow policy implemented; 40 self-made scripted moments across 180 turns PASS for code mechanics (15/15 fixture catches, 0/25 fixture interruptions, 15/15 fixture repairs silent). Actual model pilot NOT_RUN; no transport or live posts. See ADDONS.md. |
| Approval negative control | PASS: removing the role gate in an expendable copy caused exactly the intended test failure. |
| Offline complete flow/CLI | PASS: newly approved synthetic decision, source/log analysis with MOCK provider, confirmed saved brief, wrong actor, duplicate, restart, lock and temporary-data deletion checks. |
| Discord adapter | Prior local code preserved, currently DEFERRED; fixed vault launch actions reject Discord. No live interactions. |
| Meta adapter | Official Standard model/Responses protocol implemented; mocked HTTP tested; actual entitlement/requests/usage BLOCKED. |
| Infisical Windows CLI | PASS: official 0.44.10 winget install/hash check, auto vault metadata and synthetic native credential-store probe. |
| Infisical account/project/injection | PASS: browser login completed on EU Cloud with keyring session; linked existing Ai-Teammate / Development. META_API_KEY name is injected but its shared value is empty: credential availability BLOCKED pending owner correction. No value displayed/exported. No Discord prerequisite. |
| Jev/OpenAI | Disabled: no integrations; live child forwards only the Meta/Discord app allowlist. |
| Plaintext migration | No known plaintext credential files found in workspace; no files/keys deleted. Actual vault migration NOT completed yet. |
| GitHub publication | PASS: local harness commit 38c8c8b pushed normally to existing public d2vei/AI-Teammate main after secret/history checks; remote SHA verified. No force push, rewrite or other repository creation. Hosted Linux CI for 38c8c8b PASS (71 tests + checks); first 1718e0f failure is retained alongside its ordinary fix. |
| Frozen model evaluation/baseline | NOT_RUN. No quality, naturalness, proactive timing or advantage claim. |
| Live decision + brief demonstration | BLOCKED on real Discord/Meta setup; mock checks do not pass this gate. |
| Deployment/video/final submission | NOT_RUN; not release complete. |

Commits so far: `ba85d6c` preparation; `fe6f30d` scoped core/Meta; `dd69f38` decisions; `e3c5ee5` evidence/briefs. Later commits and exact push results are in WORKLOG.

Meta testing allowance: EUR 5 total authorized by owner; USD 5 cumulative local ceiling with ECB FX headroom. No actual inference has run at this update. Ask before exceeding the authorized amount; unknown charges remain reserved.

Next offline checks: `npm.cmd run demo:offline` and `npm.cmd run replay:offline`. Owner reports the Meta API key page is down and directs local development before live tests; do not keep retrying credentials. When key creation becomes available, resume `npm.cmd run vault:check`, then the single `npm.cmd run smoke:live`. Project is already linked. No .env file is needed or auto-loaded. See [SECRETS.md](SECRETS.md).

Interactive local workflow: `npm.cmd run conversation:offline`; see [LOCAL_HARNESS.md](LOCAL_HARNESS.md). The scripted harness is implemented and tested with exact-token approval, wrong actor, casual agreement, saved briefs and pause/resume. Real Meta remains BLOCKED because the declared vault key is empty; both shared-value and personal-override presence diagnostics returned empty. No Meta inference/charge occurred.
