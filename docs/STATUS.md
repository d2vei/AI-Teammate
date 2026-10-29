# Implementation status

Updated 2026-10-29. Evidence is software/mock unless explicitly marked live. The owner saved the key; names-only Infisical injection and the first real Meta smoke now PASS. Continue local model validation within the existing allowance. Discord remains deferred.

| Area | Observed status |
|---|---|
| Baseline/provenance | PASS: workspace held handoff only, no old Git/source imported; references/private context ignored. |
| Local core and SQLite | Implemented: explicit invocation, scope/dedup/pause/budget, traces, immutable sources, approved decisions and transactionally saved briefs. No execution capability. |
| Typecheck/build | PASS on Node 24.21.0/npm 11.19.0. |
| Deterministic tests | PASS: 159 offline tests, including ASR processing-frame bounds/safe failure metadata, file-ID/cleanup handling, fixed evaluation budget/shared-ledger checks, codec bounds/cleanup/provenance/revocation, scheduler cancellation/source recheck/restart/timeout/permissions, shared transport, composed conversation and prior core/adapter checks. |
| Composed local conversation | PASS: actual built terminal completed media → shadow hand raise → invited local display → newly approved decision → saved brief → watch replay, rejected the wrong approver, checked durable state and deleted only its new temporary session. Scripted/synthetic only; no model-quality or human-study claim. |
| Shared Meta runtime | Implemented: direct/participation/media share one transport held through the response body, common budget and no automatic retry. HTTP mocks cover all paths. Real direct and synthetic media requests verified; participation remains untested live. |
| Participation add-on | Experimental shadow policy implemented; 40 self-made scripted moments across 180 turns PASS for code mechanics (15/15 fixture catches, 0/25 fixture interruptions, 15/15 fixture repairs silent). Actual model pilot NOT_RUN; no transport or live posts. See ADDONS.md. |
| Local watch add-on | Automatic read-only local scheduler implemented. Actual Node timers PASS: count 2 at start → unchanged silence at 60.0 s → count 5 at 120.0 s; native stalled-read timeout at 30.0 s, one attempt, all tasks stopped. Synthetic feed only; real Roblox/Meta NOT_RUN. |
| Media add-on | Actual five-case v1 FAIL (3/5), preserved. After a distinct ASR diagnostic and bounded duration/speech-request fixes, v2 same-recipe regression meets the 4/5 strict synthetic target (5/5 literal facts; agent-reviewed). Clip audio words recovered but provenance wording remains partial, not credited. All sources revoked, own project/raw fixtures deleted and exact uploaded videos acknowledged deleted. No Discord attachment acquisition, human media rating or broad quality claim. See LIVE_TESTS.md. |
| Approval negative control | PASS: removing the role gate in an expendable copy caused exactly the intended test failure. |
| Offline complete flow/CLI | PASS: newly approved synthetic decision, source/log analysis with MOCK provider, confirmed saved brief, wrong actor, duplicate, restart, lock and temporary-data deletion checks. |
| Discord adapter | Prior local code preserved, currently DEFERRED; fixed vault launch actions reject Discord. No live interactions. |
| Meta adapter | First real Standard Muse Spark 1.3 Responses smoke PASS through the core with synthetic evidence/fake local delivery: 974 input + 1066 output tokens, USD 0.005748 accounted. Source/log/hypothesis distinctions observed in this one response; not broad model-quality evidence. |
| Infisical Windows CLI | PASS: official 0.44.10 winget install/hash check, auto vault metadata and synthetic native credential-store probe. |
| Infisical account/project/injection | PASS: existing EU Cloud/keyring session, Ai-Teammate / Development root folder; META_API_KEY presence and real provider access verified. No value displayed/exported, no plaintext fallback or Discord prerequisite. |
| Jev/OpenAI | Disabled: no integrations; live child forwards only the Meta/Discord app allowlist. |
| Plaintext migration | Rotated Meta key now works through Infisical. Known plaintext credential filenames remain absent; no such file existed to remove. No unrelated files/keys deleted. Discord remains deferred. |
| GitHub publication | Live-test commits through ff298be pushed normally to existing d2vei/AI-Teammate main; exact remote SHA verified, clean tree after push. No force push, rewrite or other repository creation. Reviewed staged files; redacted scans PASS, including 12,227-byte evidence patch and full 21-commit/774,348-byte history. Actions lookup for this candidate still returned 404; hosted CI/public metadata remain unverified. Earlier 38c8c8b CI PASS is historical evidence only. |
| Frozen model evaluation/baseline | INCONCLUSIVE: 16 real calls/eight pairs completed. Candidate 8/8 and baseline 7/8 schema/citation-ID checks passed; baseline F-D4 failed at 2048 output tokens, preserved without rerun. Eight quiet configuration checks PASS. Human usefulness/naturalness ratings and complete outcome study NOT_RUN; no advantage claim. |
| Local real-generation decision/brief flow | PASS_APPLICATION_FLOW_ONLY: two actual Meta generations, one newly proposed/approved decision, source-grounded saved brief, wrong actor/room rejected, casual agreement did not approve, duplicate acceptance idempotent, restart/recall context checked. Only its new test project content was purged; charges retained. Participants/approvals/delivery are simulated. |
| Live group demonstration | NOT_RUN while Discord is deferred. Local real generation does not pass authenticated platform/human interaction gates. |
| Deployment/video/final submission | NOT_RUN; not release complete. |

Commits so far: `ba85d6c` preparation; `fe6f30d` scoped core/Meta; `dd69f38` decisions; `e3c5ee5` evidence/briefs. Later commits and exact push results are in WORKLOG.

Meta testing allowance: EUR 5 total authorized by owner; USD 5 cumulative local ceiling with FX headroom. Thirty model request attempts: 19 text, five media v1, one distinct ASR diagnostic and five media v2. USD 0.181175 used or reserved, including USD 0.000550 held uncertain from the earlier ASR failures. Token accounting uses uncached published rates, not a billing statement. Ask before exceeding the authorized amount; unknown charges remain reserved. Sanitized metadata only: evidence/meta-live-v1.json; raw responses remain ignored.

Next: actual participation validation under separately frozen cases and the same shared allowance. Keep mention-only behavior until that separate gate passes; no unsolicited transport exists. Preserve all completed/failed attempts. Human ratings and actual Discord remain separate. Project is already linked; no .env file is needed or auto-loaded. See [LIVE_TESTS.md](LIVE_TESTS.md) and [SECRETS.md](SECRETS.md).

Interactive local workflow: `npm.cmd run conversation:offline`; see [LOCAL_HARNESS.md](LOCAL_HARNESS.md). It remains deliberately MOCK/scripted, tested with exact-token approval, wrong actor, casual agreement, saved briefs and pause/resume. The separate real smoke does not make this terminal model-powered or establish Discord support.
