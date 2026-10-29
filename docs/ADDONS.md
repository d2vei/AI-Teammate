# Add-ons accepted on 29 October 2026

The owner supplied a new v0.1 proposal for participation, media and read-only watch tasks. This is a scope extension to the existing teammate, not a replacement implementation. Direct requests, approved decisions and confirmation-to-saved-brief remain required. The current instruction to defer Discord still applies. No coding, shell, Git writes, external task execution or automatic spending is added to the product.

## Delivery order and evidence

| Slice | Current state | Exit check |
|---|---|---|
| Speaking policy and replay | Experimental shadow module and self-made mock corpus implemented. It has no delivery transport and is not loaded by the bot. | Forty labelled moments: 15 should speak, 25 silent, five positive cases per implemented move, matched participant repairs and quiet stretches. Separate code mechanics from real model judgments. |
| Actual monitor / repair / generation | NOT_RUN, blocked on the empty vault key. | First complete the existing single Muse Spark smoke. Then freeze prompts/config before fresh model trials within the cumulative authorized allowance. Record failures, latency, usage and cost. |
| Voice, images and short clips | Planned; no downloader, conversion worker, media API call or transcription is implemented. | Five actual synthetic media cases, at least four correctly used; revoke/delete sources and derived text together. Do not score supplied transcripts as model media understanding. |
| Error watch | Planned; no live poller, Roblox key or scheduled channel post is configured. | Authorized read-only source, fixed destination, new/increased group detection, restart/dedup and source-grounded report. Replay fallback must say replay. |
| Discord hand raising and why button | Deferred. | Real opted-in room, authenticated invitation bound to the triggering message and unexpired offer; access/pause/source checks again before delivery. A reaction permits an intervention only, never a decision or brief acceptance. |

If the actual participation pilot misses the requested 9/15 catches or exceeds 3/25 false interruptions, ship mention-only and publish the failure. The requested five media cases are separate. Mock results cannot satisfy either model gate. No claim of novelty, competitor superiority or a user study follows from this work.

## Policy implemented for shadow replay

`src/participation.ts` is independent of the existing explicit-request core. An owner with the configured approver ID/role can select shadow mode. Default remains off. Three moves are supported: constraint reminder (`forgotten_constraint`), clarification (`uncertainty`, `underspecified_plan`) and loop breaking (`discussion_loop`). Other proposed breakdown names are recognized but withheld as unimplemented. Catch-up stays a direct request.

Monitor and repair are independent typed observations. Code requires three distinct observations of the same normalized claim with unchanged evidence, confidence at least 0.85, valid source identities, allowed scope/settings and no participant repair, outstanding invitation, prior intervention or cooldown. These are our conservative development defaults, not reported optimal parameters or copied speech thresholds. Claim matching is normalized exact text; no embedding model is used. A gap longer than ten minutes resets persistence. A resolved or already-said claim stays suppressed in this experimental ledger until it is purged; handling a later recurrence needs a new evaluated design.

The repair observation must point to an exact quotation in the last three authorized messages. This rejects invented references; it does not prove the quotation semantically resolves the claim. Likewise, resolving a citation proves source identity/availability, not entailment. Both require actual model evaluation and human checking.

Default hand raising records an offer for ten minutes without generation. Only a configured member's explicit reply/action with the exact offer token and triggering-message binding permits generation. Ordinary agreement, unrelated replies and cross-room actions do not. The shadow direct mode can instead generate an intent immediately after the gate; neither mode can send a real message. Generated text is limited to two sentences and 240 characters; citations are appended by code. Recheck scope, pause, settings, source/trigger identity and changed conversation before returning the intent. Invitation retries and uncertain generation do not produce automatic retries.

The experimental SQLite ledger is separate from the existing service database. It persists short claim names, counts, bindings, offers, deduplication and reasons, without full chat windows, generated responses or media bytes. `why()` returns scoped metadata. `purge()` removes its scoped content and settings and compacts the database; a future integrated operator deletion must invoke both stores. This module is not wired into the live lifecycle. It is designed for one policy process; multiprocess load/delivery is unverified.

## Reproduce the code experiment

Run `npm.cmd run replay:offline`. It builds and feeds every turn through the actual policy, monitor fixture, repair fixture and gate. The committed corpus has 40 final decision moments across 180 turns, 15 matched pairs and ten quiet stretches. Every turn's action/reason is recorded in `evidence/participation-mock-v1.json`, with source/evaluator/corpus hashes, candidate commit and runtime identity. A hash identifies the implementation; it is not independent proof of a run.

`cases.jsonl` contains only self-made conversations and IDs. Labels and scripted reasoner outputs live in separate files. Runtime projections exclude case labels and grading fields. The fixture reasoner deliberately supplies predetermined findings: the resulting catch/silence counts test application mechanics only. They are not model accuracy. This is development data, not a held-out benchmark or user study. The authoring recipe refuses to overwrite v1. Preserve any eventual live run and use a new corpus/config version for later trials.

Actual Meta calls, semantic source support, randomized same-model comparisons and 20 human judgment checks remain NOT_RUN. A future paid reasoner must reserve every call in the existing shared budget and serialize live requests. The current experiment has no key access, API dependency or paid launcher action. The EUR 5 authorization and conservative USD 5 cumulative cap remain unchanged.

## Sources checked and future integration details

[Jarvis](https://arxiv.org/html/2610.07506) motivates separate monitoring, repair, a ledger/gate and grounded generation. Its published results concern its own speech system, corpus and study; they do not measure this application. [ProACT](https://arxiv.org/pdf/2607.03730) informs breakdown categories and concise group-facing contributions. We reuse these design ideas with attribution; no paper code, dataset or prompts have been imported.

Official [Meta speech documentation](https://dev.meta.ai/docs/speech-to-text), checked 29 October, describes recording transcription at `/v1/asr/transcribe`, model `muse-voice-transcribe-1.0`, multipart `request` and `audio`, mono 16-bit PCM WAV at 16/24 kHz, maximum ten minutes/32 MB. It lists $0.18 per processed audio hour. Account entitlement and privacy requirements must be checked before enabling it; current text-only budgeting does not authorize a new audio cost path.

Official [video/audio documentation](https://dev.meta.ai/docs/video-understanding) supports uploaded video references and warns that Muse Spark 1.3 audio quality is degraded, using 1.2 in audio examples. Future media handling must use verified current schemas, bounded input and temporary storage with deletion, authorized attachment sources and Standard mode. Derived text retains the original message reference and remains untrusted evidence. No automatic fallback to another model is enabled.

Official [Roblox error reporting](https://create.roblox.com/docs/cloud/guides/error-reporting) requires read analytics scope plus the key owner's analytics access. Discovery uses the ErrorCount metric by MessageHash; error details use the documented GET path. That is more than a single guessed polling URL. No rule writes, arbitrary URLs, production-key access or live collector has been added. A sanitized saved-JSON replay is the first useful local watch slice.
