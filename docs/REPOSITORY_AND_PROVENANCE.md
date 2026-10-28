# Repository, first push and source provenance

## Existing workspace first

The actual local/remote repository state was not inspected while preparing this package. Before changes, inspect `git status`, branch, remotes, existing source/scripts and any previous commits. Preserve useful work and history. An old downloaded ZIP containing `.git` is not the origin history to import into a newly created event repository.

The proposed destination in the conversation was `d2vei/ai-teammate-hackathon`. Treat it as an intended target to verify, not proof it exists. Push only to the owner's approved remote/branch. No force push, date rewriting, destructive clean or silent history replacement. If an appropriate remote is absent, repository creation still needs actual authenticated tooling and the user's specified target.

## Keep the handoff reference library private by default

Extract under an already ignored `.local/` location or outside Git. The package has its own ignore file as an additional guard, not as a guarantee. Merge the small active technical docs, runtime prompt scaffolds and development scenarios deliberately. Do not `git add .` before inspecting the publication surface.

Original workflow PDFs, full private planning context, old source map, audit transcripts and old archives are development references. Do not publish them automatically; rights/privacy must be considered separately. The product can be open source while these sources remain private.

## First push sequence

1. Inspect baseline and intended remote. Merge `.gitignore` and blank `.env.example`; do not overwrite an actual credential file or encryption key.
2. Add the active plan/AGENTS and minimal new scaffold/test config using a reviewed explicit file list. Keep implementation status truthful.
3. Check staged diff and names, unexpectedly tracked ignored files, relevant working files AND existing history for secrets. Configure the chosen scanner from official documentation; no claim that a regex or ignore list proves absence of all secrets.
4. Make the real preparation commit before the first new feature. Commit only tests/results actually produced.
5. Push to the approved remote/branch when authentication and checks are available. Record the actual commit and push result; if blocked, say so and continue independent local tasks.
6. Build/test/commit meaningful slices and push progressively. Never fabricate earlier work dates or a series of empty “progress” commits to look compliant.

Suggested inspection commands (non-destructive; adapt to the actual repository):
```sh
git status --short
git branch --show-current
git remote -v
git diff --cached --name-status
git diff --cached --stat
git ls-files -ci --exclude-standard
```
Inspect the content locally without pasting secrets into chat. Secret/history scanner invocation and install/test commands must be verified for the installed tools. Do not claim `npm test` is configured until the corresponding script exists.

## Credentials

`.gitignore` does not untrack previously committed material. File deletion does not revoke a token. Prior conversation says the original bot upload contained credentials; those must be privately reviewed/rotated before reuse. This handoff neither rotates them nor touches the PC.

Provider keys, Discord token and sensitive billing/config values stay in local ignored files or the authorized host's secret configuration. Never put them in the README, test fixtures, CI logs, traces or public Actions environment. A blank example is trackable. Do not delete a storage-encryption key without resolving recoverability.

## What provenance can and cannot show

Real incremental commits, remote publication history, CI runs, test artifacts and a demo matched to a final commit make work inspectable. They do not prove the original writing time of every line or guarantee the judges' eligibility decision. Do not present a new repository or current commit timestamp as making copied old work new.

Keep `docs/PRIOR_WORK.md` factual: conceptual references consulted, libraries used, actual copied code/assets if any, permissions/licences and the new contributions. Start with unknowns where the repository has not been inspected. Do not write a blanket “no previous work involved” claim or hide actual reuse.

The supplied participant guide requires new work and public repos and explicitly describes a startup reuse exception. It does not resolve the Indie exception. Preserve an organizer's written answer if obtained. In its absence, build the new runtime separately and do not import legacy source as though it is permitted new work.

## CI and final packaging

Implement type/schema checks, deterministic tests and publication checks using actual project commands. Use the committed lockfile. Do not run paid model calls or expose runtime tokens to untrusted PR workflows. Pin/review third-party actions according to the repository's policy.

At release, write a normal public README: purpose, actual setup, configured provider/adapter, usage, evidence and limitations. No marketing/About text before the requested packaging stage. Provenance belongs in its dedicated record, not repeated across every user-facing page. Verify repository access and demo links; tag the actual submitted version, never backdate it.
