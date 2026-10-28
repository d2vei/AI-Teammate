# Development provenance

Baseline inspected on 2026-10-28: this workspace held the supplied implementation handoff only. There was no `.git` directory, application source, package manifest, credential file or runtime database in the root inventory. No legacy Git history was imported.

The reviewed plan, accepted addendum, prompt scaffolds and development cases predate this implementation. The reference library and personal project context remain local and ignored. Active technical documents and working agreement are adapted from that handoff. The earlier private bot was described in the handoff; its runtime source has not been copied or inspected here. Its credentials must not be reused without private rotation/review.

New application code will be authored during this implementation. Dependencies and their licences will be recorded after installation. Commits made by the coding agent use the local author `Codex <codex@users.noreply.github.com>`; commit timestamps are ordinary Git timestamps, not evidence of the original authorship of referenced material.

The proposed publication target is `d2vei/ai-teammate-hackathon`. The GitHub connection identifies `d2vei`, but searching the exact target returned HTTP 422 (missing or inaccessible). No remote has been configured or written. Indie prior-work eligibility remains an organizer question; no eligibility claim is made.

## Implemented contributions

The TypeScript core, SQLite state/approval logic, selected-source ingress, Meta HTTP adapter, Discord adapter, operator commands, synthetic party fixture and executable checks were authored in this implementation session on 2026-10-28. Runtime prompt wording adapts the supplied response scaffold; active development cases are copied from the handoff and remain development material, never held-out results. No old bot runtime code/assets or Git metadata were imported.

Installed runtime dependencies: discord.js 14.27.0 (Apache-2.0) for Discord and zod 4.6.7 (MIT) for schemas. Development dependencies: TypeScript 7.0.2 (Apache-2.0), Vitest 5.0.5 (MIT) and Node types 24.19.2 (MIT). Node's SQLite module supplies persistence. Transitive dependency versions are in package-lock.json; no claim is made that dependencies were newly authored. tsx was briefly installed and then removed when no longer needed. No licence for private reference documents is inferred from dependency licences.

On 2026-10-29 the owner explicitly selected the existing public d2vei/AI-Teammate repository and prohibited creating any other repository. Connector metadata verified public/main and push permission; git ls-remote and fetch advertised no existing refs/commits. No different repository was created. The previously authored Discord adapter is deferred under the owner's current sequencing instruction; no live Discord work is authorized for this phase. Its prior code/history is preserved rather than represented as current live support.
