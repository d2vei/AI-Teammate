# Work log

Record actual work in the target repository. Preparation of this packet is not a run of the application. Preserve prior truthful entries; do not fabricate commit dates.

## Entry template

- Date/time and candidate commit / dirty-state identity:
- Milestone and change:
- Commands actually executed:
- Results (mock, live provider, live Discord, human rating separated):
- Failures, limitations and blocked checks:
- Artifacts safe to publish:
- Commit and actual push target/result:
- Next bounded step:

## 2026-10-28 - M0 baseline

- Read all three pasted attachments, START_HERE, active plan, acceptance, repository/provenance, project context, integration map and accepted addendum. Consulted bounded participation/confirmation/grounding skill instructions.
- `Get-ChildItem -Force`, file inventories and git status/branch/remotes/log: workspace was the extracted packet, not a repository. There was no source/runtime to preserve beyond the packet. No existing history or staged files existed.
- `node --version`: v24.21.0; `git --version`: 2.55.0.windows.3; `npm.cmd --version`: 11.19.0. npm.ps1 is blocked by host policy; npm.cmd works. gh and gitleaks unavailable on PATH.
- Initialized local main branch without importing Git metadata. Git then reported sandbox ownership mismatch; use `git -c safe.directory=C:/Users/david/Documents/ai-teammate` per command. No global safe.directory change.
- GitHub connector login succeeded as d2vei. Exact repository search failed 422: missing or inaccessible target. No remote created or push claimed.
- Root credential-name/environment inventory found no .env or META_/DISCORD_/APP_ values. Values were not printed. Asked for private setup and authorized allowance; independent local work continues.
- Official Meta docs retrieved: current docs name muse-spark-1.3, Responses API and Standard pricing. Account entitlement, balance and actual calls remain unverified. Discord interaction docs checked. No product tests or live calls yet.
- M0 preparation commit will contain only reviewed active technical documents, working agreement and hygiene. No new feature yet.

## 2026-10-28 - M1 offline exchange

- Preparation commit: `ba85d6c`. Actual Git writes required sandbox escalation for protected .git; approved. No remote/push.
- Pinned installed registry versions: discord.js 14.27.0, zod 4.6.7, TypeScript 7.0.2, Vitest 5.0.5, tsx 4.23.15, Node types 24.19.2. `npm.cmd install --ignore-scripts`: 66 packages, audit reported zero vulnerabilities at install time.
- First `npm.cmd test -- --reporter=dot` failed because src/store.js did not exist. Implemented the tested platform-neutral core, fake adapter/provider, persistent SQLite config/dedup/budget/trace, send-time pause/scope checks, bounded inference and explicit uncertain-charge/send handling.
- Added Meta Responses adapter from current official docs, fixed Standard model/official host, store:false, bounded output, no tools/fallback/retries; mocked HTTP protocol tests only. Account access and privacy terms still require actual account verification before private data. No real request sent.
- `npm.cmd run typecheck`, `npm.cmd test -- --reporter=dot`, `npm.cmd run build`: PASS, 20 deterministic tests (including 4 mocked-HTTP provider cases). Config and uncertain charges survive a real SQLite file restart. Mock usage is zero because mocks are free; no assertion of zero live cost.
- Downloaded official Gitleaks 8.30.1 into ignored .local/tools and verified archive SHA-256 against release checksums. No global install. History/publication scan to be recorded before commit/push.
- Discord adapter not connected yet; live M1 remains BLOCKED. CLI start/demo scripts are not yet implemented or verified. Next: conversation proposals and version-bound acceptance, then complete Discord rendering.

## 2026-10-28 - M2 local decisions

- M1 commit: `fe6f30d`. Gitleaks 8.30.1 history and staged scans found no leaks; this is scanner evidence, not proof all secrets are absent. No push.
- New approval tests first failed (12 cases: proposal methods absent / no card). Implemented persistent conversation drafts, cryptographically bound versioned buttons, current member+approver-ID+configured-role checks, project/platform/workspace/room/config/snapshot/expiry binding, atomic/idempotent acceptance, revision, cancellation and text-erasing withdrawal.
- Tests caught two real implementation defects: acceptance state incorrectly changed the immutable token; creating a pending card invalidated its own send-time context check. Corrected both without relaxing expectations.
- `npm.cmd run typecheck`, `npm.cmd test -- --reporter=dot`: PASS, 32 tests. `npm.cmd run build`: PASS before final harness-only changes.
- `npm.cmd run test:mutation`: PASS negative control. In an ignored expendable copy only, removed the role authority check; exactly the wrong-role case failed. Authoritative application/tests unchanged. Initial runner attempts failed due sandbox tsx userInfo and Vitest 5 JSON output location; switched this development script to native Node and an explicit report file, then verified the actual failed assertion. These initial harness errors were not counted as a successful mutation.
- Proposal/decision persistence is local SQLite; no real Discord interaction or Meta reasoning result. Live M2 remains BLOCKED. Next: selected source/log retrieval and saved briefs.

## 2026-10-28 - M3 local source and brief loop

- M2 commit: `dd69f38`. Added evidence/brief tests first; initial run failed because the source ingress module was absent.
- Implemented immutable per-project snapshot IDs, bounded line-numbered source excerpts, one-hour log window and schema-allowlisted logs. Unknown log fields (synthetic key/token markers in tests) are discarded before storage/prompts. Private bundles require an explicit operator data-handling gate. Missing/stale/deleted content is withheld; old saved state carries its snapshot label. Re-ingress cannot overwrite a source ID or restore a deletion silently.
- Brief schemas contain objective, approved decision references, evidence, hypothesis, next check and exclusions. They share the atomic approval gate and persist saved status without execution fields. Acceptance revalidates evidence; late source/config/pause/audience changes suppress delivery.
- Added brief wrong-actor/room/version/expiry/cancellation cases, duplicate acceptance, log-window expiry, cross-adapter scope, deleted-source send suppression and a real SQLite restart/two-connection duplicate test (JavaScript callbacks serialize; not an independent-process load test).
- `npm.cmd run typecheck`, `npm.cmd test -- --reporter=dot`, `npm.cmd run test:mutation`, `npm.cmd run build`: PASS; 48 deterministic tests. This includes mocked reasoning and HTTP, never a live model. Private data redaction is a bounded allowlist/heuristic, not a universal secret detector.
- Current limitations: no Discord runtime connection, CLI/demo not yet wired, model prose truthfulness still needs live evaluation; deterministic schema/status/source checks do not prove semantic accuracy of arbitrary model language. Next: actual Discord adapter and operator commands.
