# AI Teammate — master implementation plan

Status: implementation handoff; product tests NOT RUN by this package. Consolidated 28 October 2026 from the original v0.6 plan, the independent document review and the accepted implementation addendum. This is not a new round of feature planning.

## 1. Product and boundaries

Build a useful AI participant for a small private project group. People keep their normal conversation; the teammate shares relevant project context, distinguishes suggestions from approved decisions, explains a potential mismatch with selected code/logs and prepares an actionable handoff. It is explicitly an AI, not a person impersonator or a team manager.

The intended benefit is less context copying and fewer misunderstandings with tolerable interruption. This is a hypothesis to evaluate, not established demand, novelty or superiority over Grok or a competent shared chatbot.

**MVP (mandatory):**
1. Respond to explicit mentions, replies and message actions in a configured opt-in room.
2. Propose, approve and retrieve a project decision live, preserving source and approver identity.
3. Answer using a selected immutable code snapshot and sanitized log window, with grounded citations and honest uncertainty.
4. Prepare a concise investigation/work brief containing objective, decisions, relevant evidence, next check and exclusions.
5. Save that brief only after an authorized version-bound confirmation. Saving is not performing the work.

**Deferred:** autonomous coding/testing, workers, shell, GitHub writes, agent scheduling, production changes, voice, another live chat platform, general desktop automation, Graphify, rich web interface, rich supersession UI, automatic retention scheduling and elaborate durable-outbox reconciliation. They are not hidden prerequisites.

Goal Mode Lite has draft/awaiting-approval/accepted/cancelled states. Accepted means saved. A second, separately approved scope would be needed to execute code. The developer's coding agent may of course edit THIS implementation and run its tests under owner authorization.

## 2. Demonstration worked backward

A new conversation creates the requirement: “Party members must stay together.” A permitted decision owner approves it. A second participant brings a party-split event. On request, the teammate compares that event and a selected fixture's source with the approved decision.

Expected response type: “That differs from the approved rule. This path appears able to split a party, and the log is consistent with it. I haven't reproduced it.” The exact words are not a golden string. It cites actual supplied sources and offers a brief. An authorized button saves the brief. A later question retrieves the rule and the accepted investigation, not “the bug was fixed.”

Use a small newly implemented synthetic example, not private matchmaking code. A seeded fixture is labelled seeded. At least one decision must be created and approved during the real demonstration; a preloaded ledger alone is insufficient.

In mention-only mode, staying silent between human messages is a configuration boundary, not a measured intelligent-participation feature. Show a separately labelled shadow evaluation only if actually run.

## 3. Architecture: one service, clear seams

```text
Discord adapter (commands, events, buttons)
        -> normalized event + authenticated actor/scope
        -> eligibility, current permission, pause, budget, dedup checks
        -> application-managed authorized context retrieval
        -> Meta provider (reasoning and proposed response)
        -> schema/citation/status validation + send-time recheck
        -> reply or proposal card
                            -> authorized confirmation -> SQLite brief/decision
```

Use one TypeScript process, SQLite, discord.js and a small validation/test harness. Do not leak Discord SDK objects into the project core. Keep the Meta API behind its own adapter. Names below are organizational examples, not an instruction to create many tiny modules:

- `core`: normalized events, participation policy, context assembly, response handling.
- `project`: selected sources and decisions.
- `proposals`: decision/work-brief proposals and acceptance rules.
- `adapters/discord`: identity extraction, interactions, rendering and delivery.
- `providers/meta`: verified live protocol; mock equivalent for local tests.
- `store`: SQLite persistence, migrations and one-use acceptance transaction.
- `observability`: minimal redacted trace metadata and usage.

Discord now; Slack may later implement the same small interface. A fake second adapter proves only boundary testability, not Slack support. No generic connector framework or public multi-tenant SaaS is necessary.

## 4. Runtime and user setup

Development: an always-running local Node process, Discord Gateway access and the Meta API. Closing the chat/browser does not stop a running host; shutting down the host does. The public demo may run on one approved persistent host with durable storage. Credentials stay on that host. Deployment access/cost is a separate check; don't assume serverless request functions hold a persistent Gateway connection.

A project owner adds the app, selects one room and approvers, attaches permitted read-only context and chooses invocation mode. Users should not need to learn “agents” or install development tooling to converse.

Use snapshots supplied to the service. A local-live-source connector is deferred. Report which snapshot was inspected; do not imply it is the latest GitHub state without checking. Every permitted room must have access to each source used in its replies. No private-DM or cross-project memory crossover.

## 5. Conversation contract

- Direct requests: brief useful answer, one necessary clarification or an honest blocker.
- Human-to-human exchange: no unsolicited output in the first mode.
- Follow-up: use reply metadata and authorized recent context, not guess solely from a pronoun.
- Tone: relaxed, normal punctuation, English/German matching the exchange. No forced slang, roast persona, fake experiences, automatic praise or deliberate typo imitation.
- End signal/pause: stop substantive output and recheck before delayed delivery.
- Decisions: proposed is not approved; one authorized approval is not unanimous team consent.
- Evidence: source inspection is not execution; a log event is not automatically its root cause; a stored brief is not a completed task.
- Conversation never changes the permission policy. Neither quoted text nor a model's confidence authorizes an action.

Runtime prompts in `prompts/` are proposed scaffolds, not already validated behavior. Application checks enforce the boundary independently.

## 6. Source and state requirements

Retain the concepts, without a graph database or elaborate history UI:

| Record | Required meaning |
|---|---|
| Event/message reference | Stable source ID, actor, project/room/thread, reply target and version/access information. |
| Decision | Statement, source references, proposer/approver identity, version and proposed/approved/withdrawn state. |
| Snapshot/source | Content identity, selected file/line or log-event references, scope and current availability. |
| Proposal | Exact content, project, target, version, expiry, allowed approver and one-use identity. |
| Accepted brief | Approved objective, decision/source references, next check, exclusions and saved status. |
| Trace | Input IDs, provider/prompt/config versions, permitted action, actual result, delivery state and available usage. |

Rich supersession is deferred, but there must be a minimal correction/withdrawal path. Never keep a corrected or inaccessible statement silently authoritative. Preserve enough provenance to explain a correction without re-exposing removed private content.

The app retrieves approved/proposed decisions, a bounded snapshot search and a sanitized log window. Start with exact lookup and simple search. Do not ship every repository file or all PDFs into each model request. Relevant snippets carry source IDs; only current authorized IDs may be cited.

No sensitive runtime state belongs in public Git. Minimize raw logs/transcripts. The pilot deletion commitment must be performed and recorded; automatic scheduling may wait.

## 7. Confirmations and failures

Use the server-side authenticated platform ID and configured role, never the display name. Bind acceptance to actor scope, project, room, proposal version, target snapshot, expiry and one-use ID. Persist state transactionally and make duplicate clicks idempotent. A changed or expired proposal needs a new confirmation. A message saying “yes,” quoted instructions or an emoji must not bypass the app's confirmation flow.

Replies can fail without an execution outbox: state the failure and permit the user to ask again. Do not blindly retry an uncertain send. Preserve enough event/acceptance information to avoid duplicate saved decisions/briefs. Do not claim exactly-once external delivery.

Check pause, access and source validity again before sending. Use one active inference request for the first version and conservative budget accounting. A missing source, provider outage or uncertain usage is reported truthfully. No expensive automatic fallback. The app does not solve a compromised host or malicious authorized approver; it limits the authority exposed.

## 8. Meta role and access gate

Muse Spark / Muse Spark 1.3 is the planning choice for understanding the group question, comparing approved decisions with supplied evidence and preparing grounded responses/briefs. It is NOT a promise of a current model identifier, exact API fields, account access or observed quality.

Verify the exact current official request/response format, model access, privacy/data mode and pricing during integration. Prefer the non-contributor data mode intended for private group/source material, where available and verified. If terms/access cannot be confirmed, use synthetic fixtures until resolved. Do not implement fictional endpoints or assume another provider's SDK is compatible.

A separate model tool loop, SAM, speech and model training are not required for the floor. Application-managed context still leaves the semantic task to Meta; permissions and acceptance remain code-owned.

Stated grant: $150, not verified remaining balance. Proposed app cap: at most $120 and no more than the actually authorized available allowance. One live request at a time, bounded output and conservative reservation before dispatch. Keep unknown charged usage visible; don't release uncertain reservations as though nothing happened.

## 9. Milestones and definition of done

| Milestone | Deliverable | Exit check |
|---|---|---|
| M0 — honest baseline | Inspect repo; merge hygiene; copy active docs; initial preparation commit/push if authorized/authenticated. | Correct remote, no unintended staged files, origin record, actual checks logged. |
| M1 — observable exchange | Core/adapters, fake clock/provider tests, scoped context and actual direct-request Meta reply in Discord. | Source/status accurate; missing access reported; real versus mock evidence separate. |
| M2 — live decision | Propose, authorized button, persistent decision and later lookup. | Wrong identity/version/expiry rejected; duplicate acceptance not duplicated. |
| M3 — complete group task | Snapshot/log investigation and confirmed saved brief. | Exact sources linked; no false execution; pending suggestion not approved. |
| M4 — evidence | Small frozen replay, live pilot and same-model baseline; optional shadow participation. | Counts, failures, cost and limitations reported, not invented advantage. |
| M5 — release | Clean install, public access, final technical README and version-matched three-minute video. | Reviewer can reproduce fixtures; live product condition checked; actual build work identified. |

Suggested calendar from the supplied guide: Oct 28 baseline/smoke; Oct 29–30 M1; Oct 31–Nov 1 M2/M3; Nov 2 M4; Nov 3 freeze/clean-install; Nov 4 packaging/submission. These are targets, not historical completion dates. Deadline from supplied guide: Nov 4, 21:00 Eastern / Nov 5, 03:00 Berlin. Starting later means reduce scope, not move the deadline.

If the floor is late, remove Graphify/custom views, rich decision history, automated retention scheduling and extra evaluation repetitions. These were optional from the start. Never remove live decision approval, source honesty, basic authorization or the actual Meta integration merely to report “done.”

## 10. Repo and review policy

First commit/push documents actual setup; later commits represent meaningful tested increments. Do not manufacture dates, import old history as new, force-push or pretend a repository was published. Missing GitHub access does not block independent local tasks.

The old bot is a disclosed design reference, not new event-created code. Keep it outside this build unless actual reuse and publication are explicitly resolved. The source guide explicitly mentions a startup reuse exception; Indie reuse remains an open organizer question. A fresh repository or first push is evidence of publication timing, not proof every line was newly written.

Public product documentation is written for users and contributors, not the owner's personal circumstances. Keep origin/submission evidence in a separate record. Do not add About text/marketing until final packaging.

The independent document review already happened and its five findings were accepted with safeguards. The reviewer did not run software. A further review may return KEEP. Reopen only a specific new blocker or observed failing check; no “make it better” loop and no claim that the plan is flawless.

## Sources / interpretation boundary

This document consolidates `references/approved-source/AI_Teammate_Implementation_Addendum.md` (controlling scope), the original master plan and the conversation's subsequent implementation instruction. It proposes no new product feature. File organization, template names and milestone packaging are handoff defaults, not independently verified product requirements. The participant guide and workflow references are preserved separately. Current provider capabilities, live credentials, actual repository and runtime behavior have NOT been checked by assembling this handoff.
