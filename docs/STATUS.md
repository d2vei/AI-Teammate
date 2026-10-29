# Implementation status

Updated 2026-10-29. Evidence is software/mock unless explicitly marked live. The owner saved the key; names-only Infisical injection and the first real Meta smoke now PASS. Continue local model validation within the existing allowance. Discord remains deferred.

| Area | Observed status |
|---|---|
| Baseline/provenance | PASS: workspace held handoff only, no old Git/source imported; references/private context ignored. |
| Local core and SQLite | Implemented: explicit invocation, scope/dedup/pause/budget, traces, immutable sources, approved decisions and transactionally saved briefs. No execution capability. |
| Typecheck/build | PASS on Node 24.21.0/npm 11.19.0. |
| Deterministic tests | PASS: 151 offline tests, including fixed evaluation budget/shared-ledger checks, codec bounds/cleanup/provenance/revocation, scheduler cancellation/source recheck/restart/timeout/permissions, shared transport, composed conversation and prior core/adapter checks. |
| Composed local conversation | PASS: actual built terminal completed media → shadow hand raise → invited local display → newly approved decision → saved brief → watch replay, rejected the wrong approver, checked durable state and deleted only its new temporary session. Scripted/synthetic only; no model-quality or human-study claim. |
| Shared Meta runtime | Implemented: direct/participation/media share one transport held through the response body, common budget and no automatic retry. HTTP mocks cover all paths. Initial one-real-call direct smoke PASS; participation/media remain untested live. |
| Participation add-on | Experimental shadow policy implemented; 40 self-made scripted moments across 180 turns PASS for code mechanics (15/15 fixture catches, 0/25 fixture interruptions, 15/15 fixture repairs silent). Actual model pilot NOT_RUN; no transport or live posts. See ADDONS.md. |
| Local watch add-on | Automatic read-only local scheduler implemented. Actual Node timers PASS: count 2 at start → unchanged silence at 60.0 s → count 5 at 120.0 s; native stalled-read timeout at 30.0 s, one attempt, all tasks stopped. Synthetic feed only; real Roblox/Meta NOT_RUN. |
| Media add-on | Derivation/source lifecycle and prepared Meta voice/image/MP4 adapters implemented and HTTP-mocked. Optional native attachment preparation verified: OGG/Opus conversion, PNG/JPEG decoding, measured MP4 duration, two invalid inputs rejected and owned temporary fixtures deleted. Source removal invalidates saved evidence; failed upload cleanup retained. No attachment acquisition or real Meta media request; quality NOT_RUN. See CODECS.md. |
| Approval negative control | PASS: removing the role gate in an expendable copy caused exactly the intended test failure. |
| Offline complete flow/CLI | PASS: newly approved synthetic decision, source/log analysis with MOCK provider, confirmed saved brief, wrong actor, duplicate, restart, lock and temporary-data deletion checks. |
| Discord adapter | Prior local code preserved, currently DEFERRED; fixed vault launch actions reject Discord. No live interactions. |
| Meta adapter | First real Standard Muse Spark 1.3 Responses smoke PASS through the core with synthetic evidence/fake local delivery: 974 input + 1066 output tokens, USD 0.005748 accounted. Source/log/hypothesis distinctions observed in this one response; not broad model-quality evidence. |
| Infisical Windows CLI | PASS: official 0.44.10 winget install/hash check, auto vault metadata and synthetic native credential-store probe. |
| Infisical account/project/injection | PASS: existing EU Cloud/keyring session, Ai-Teammate / Development root folder; META_API_KEY presence and real provider access verified. No value displayed/exported, no plaintext fallback or Discord prerequisite. |
| Jev/OpenAI | Disabled: no integrations; live child forwards only the Meta/Discord app allowlist. |
| Plaintext migration | No known plaintext credential files found in workspace; no files/keys deleted. Actual vault migration NOT completed yet. |
| GitHub publication | Codec commit 0219317 pushed normally to existing d2vei/AI-Teammate main; exact remote SHA verified, clean tree after push. No force push, rewrite or other repository creation. Reviewed 14 staged files; redacted staged (48,390 bytes) and full 17-commit history (727,731 bytes) scans PASS. Actions lookup for this candidate still returned 404; hosted CI/public metadata remain unverified. Earlier 38c8c8b CI PASS is historical evidence only. |
| Frozen model evaluation/baseline | NOT_RUN. No quality, naturalness, proactive timing or advantage claim. |
| Live decision + brief demonstration | BLOCKED on real Discord/Meta setup; mock checks do not pass this gate. |
| Deployment/video/final submission | NOT_RUN; not release complete. |

Commits so far: `ba85d6c` preparation; `fe6f30d` scoped core/Meta; `dd69f38` decisions; `e3c5ee5` evidence/briefs. Later commits and exact push results are in WORKLOG.

Meta testing allowance: EUR 5 total authorized by owner; USD 5 cumulative local ceiling with FX headroom. One actual inference has run; USD 0.005748 used/accounted. Ask before exceeding the authorized amount; unknown charges remain reserved. Sanitized metadata only: evidence/meta-live-v1.json; raw responses remain ignored.

Next: the prepared frozen same-model evaluation, `npm.cmd run eval:live`, within the same charge ledger and ceiling. It can make at most 16 calls and cannot pass human usefulness/adoption gates. Preserve the successful initial smoke rather than rerunning it. Project is already linked; no .env file is needed or auto-loaded. See [SECRETS.md](SECRETS.md).

Interactive local workflow: `npm.cmd run conversation:offline`; see [LOCAL_HARNESS.md](LOCAL_HARNESS.md). It remains deliberately MOCK/scripted, tested with exact-token approval, wrong actor, casual agreement, saved briefs and pause/resume. The separate real smoke does not make this terminal model-powered or establish Discord support.
