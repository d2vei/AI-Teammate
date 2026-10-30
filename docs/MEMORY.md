# Project memory vaults

Each configured project has a knowledge vault in its existing local SQLite state. It organizes approved decisions, saved briefs, pending proposals and selected evidence. API credentials continue to use Infisical. The knowledge vault follows project/member/destination permissions; the name does not imply encryption or a separate credential store.

Questions now rank authorized retained decisions and briefs before selecting bounded model context. An older matching rule can therefore be recalled after more than twenty newer decisions. Ranking uses Unicode-normalized words, phrases and topic labels, with recency as a tie-breaker. This is deterministic retrieval, not embedding search or a measured semantic-memory system. Context remains bounded to eight decisions, three briefs, four proposals and six evidence items, with the existing overall byte gate.

## Browse and organize

Both local terminals support these commands without model calls:

```text
/memory
/memory search hosting budget
/memory topics
/memory tag decision:EXACT-ID hosting costs
/memory topic hosting costs
/memory untag decision:EXACT-ID hosting costs
```

`/memory` shows category counts and current topics. Search results include exact references, status, provenance, availability and topic labels. Use a reference from search when tagging. Sources use their actual code/log/media IDs; saved decisions, briefs and pending proposals use `decision:`, `brief:` and `proposal:` prefixes.

Project members can read; a current configured approver can add/remove topics. A topic changes organization only. Pending proposals remain unapproved, and only their existing exact confirmation can save them. Tags on a valid proposal follow it into the saved record after approval. Revising or cancelling a proposal drops its old tags. Decisions retain their actual proposer, approver, version, origin and evidence bindings.

The vault rechecks source availability and approval bindings on each read. Removed or stale evidence cannot regain support through a topic label. Dependent contents and topics are withheld, and a context change during inference suppresses the delayed answer. Source removal clears its direct topic metadata; withdrawal and project purge clear their applicable metadata. Purge retains the shared spending ledger.

Search accepts up to 240 characters and returns up to twenty results. Topics accept up to 48 characters, six per entry and 64 currently visible topics per project. Retrieval scans the project's retained records in the current implementation; very large archives have not been performance-certified. New facts still enter through existing approval/source flows. This feature does not store every conversation as permanent factual memory.

## Persistence and evidence

Schema version 4 adds topic metadata without copying source text or replacing existing saved knowledge. Migration tests preserve v3-shaped records and charges, then verify topics after restart. Older app builds refuse this newer schema; use the current build with upgraded state.

`npm run test:memory-terminal` is a zero-model native stdin/stdout check with synthetic state. It is included in offline CI. `npm run test:memory-live` is a separate one-request native Meta check with 26 seeded synthetic decisions and the shared cumulative allowance. It preserves its first attempt and purges only its own new scope. An actual result is reported separately; synthetic approvals are not human or platform authentication.

The original frozen paired-response/participation captures and manual review page retain their earlier candidate identities. They are not re-scored as evidence for this memory change. `eval:offline` now runs the separate current-software invocation regression and writes `evidence/invocation-current-v2.json`; the original frozen evaluator and its runtime-drift guard remain unchanged.

Observed on candidate `997e7e9`: fifteen focused tests and the nine-command native check pass; a fresh Windows installation passes all twelve offline commands and 209 tests. The first one-request Meta check recalled the older forty-euro monthly ceiling with its approved-decision citation after 25 newer records, then verified topic persistence on restart and scoped cleanup. Shared ledger migration from 3 to 4 preserved charges. See [actual memory evidence](../evidence/memory-live-v1.json) and [fresh-install evidence](../evidence/clean-install-997e7e9.json). This is one synthetic integration case, not broad retrieval-quality or human acceptance evidence.
