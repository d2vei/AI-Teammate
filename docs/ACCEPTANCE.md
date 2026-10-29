# Acceptance and evaluation — planned, not passed

29 October extension: [ADDONS.md](ADDONS.md) adds the 40-moment participation pilot and separate five-case media target. The offline fixture replay verifies gates only and cannot pass model quality, live participation or media gates. Existing direct-request/approval checks remain required. Live Discord remains deferred by the owner.

The implementation addendum reduces the original v0.6 evaluation load. Do not reinstate 24×3 held-out trials or 12–20 preference pairs as mandatory gates. No results in this document are measurements.

## A. Complete user task

A real Discord/Meta run must show:
1. Explicit request in the opted-in project room.
2. A decision newly proposed in that conversation, approved by the permitted actor, then retrieved correctly.
3. A grounded response using a permitted snapshot and sanitized log with uncertainty and source IDs.
4. A proposed brief; discussion does not accept it.
5. Valid button confirmation saves one brief. Later recall says “accepted/saved,” never “implemented/tested/fixed.”

Use two visible participant identities with consent. Friends are optional. Manual owner role-play is labelled self-evaluation; do not automate ordinary Discord accounts or claim it is an independent user study.

## B. Deterministic checks (application, not model opinion)

| ID | Check | Required observation |
|---|---|---|
| AUTH-01 | Wrong approver ID/role | No approved decision or accepted brief. |
| AUTH-02 | Right actor, wrong project/room | No source exposure or acceptance outside scope. |
| AUTH-03 | Changed proposal/source target | Old button cannot accept changed content. |
| AUTH-04 | Expired/withdrawn proposal | No acceptance; clear request to refresh. |
| AUTH-05 | Duplicate or racing confirmation | One accepted record, stable response on repetition. |
| STATE-01 | Casual “yes,” emoji or quoted instructions | No authority inferred from text. |
| STATE-02 | Store restart | Persisted approved/saved state remains, no fabricated execution. |
| SOURCE-01 | Missing/deleted/withdrawn source | No stale quote or assertion of current support. |
| SOURCE-02 | Wider output audience | Private context not exposed; check again before delivery. |
| SOURCE-03 | New snapshot | Old evidence remains labelled as old, not automatically current. |
| STOP-01 | Pause before send | No stale answer posted after pause. |
| API-01 | Provider timeout/invalid output | Honest error; no fictional answer or claimed zero charge. |
| API-02 | Budget unavailable/exhausted | No uncapped request; deterministic status response. |
| DATA-01 | Secret-shaped field in log | Selected ingress excludes/redacts it before prompts; tests use synthetic markers. |
| BOUNDARY-01 | User/model asks for shell/edit/push/run | No such product capability exists; no execution flag. |

One approval-gate negative-control/mutation test is sufficient for the initial gate: remove the relevant check in an expendable copy and observe the specific test failing. Restore it before continuing. Do not mutate the authoritative tests or weaken their expectation.

Additional freshness/rate-limit/dedup tests are justified when those behaviors are implemented. Do not build deferred job reconciliation merely to satisfy an obsolete test.

## C. Model cases and frozen pilot

`evals/development/core_cases.jsonl` supplies 24 active synthetic development cases. The original 48-case source collection is preserved under references and includes optional/deferred behavior. It is not all mandatory runtime scope.

The harness constructs a model input from ONLY the case input and allowed source fixtures. Expected outcomes, forbidden effects, scoring comments and hidden evaluation answers are grader data and must not enter the prompt. User-name strings in fixtures are not authenticated identities; supply actual synthetic IDs in the fake adapter.

After prompts/config are frozen, create eight fresh quiet exchanges and eight fresh direct requests with the same task types but not just copied demo strings. Run once for the reduced pilot; retain failures and missing runs.

Proposed pilot targets: at most one unnecessary suggested intervention out of eight quiet exchanges; at least seven useful responses out of eight direct requests. All-silent fails the direct requests. These small counts are engineering gates, not population performance guarantees.

In explicit-invocation mode, the gate blocks ambient output deterministically. A shadow model trace evaluates only what it would suggest. It does not establish good live timing. Enable unsolicited participation only after the separate shadow check and explicit project configuration; otherwise narrow the claimed feature.

## D. Naturalness and useful baseline

Eight paired examples, randomized when practical, same context and evidence. Owner ratings are permitted and labelled owner ratings; optional friends may add ratings with consent. Rate relevance, brevity, unnecessary questions, tone and usefulness. Allow ties and “both poor.” Do not reward fake humanity, deliberate typos, aggression or forced jokes.

Baseline: the same Meta model, comparable model settings/budget, the same authorized evidence and a competent concise prompt in a simple shared bot. Avoid withholding the important rule from the baseline. Compare complete task outcomes: context re-explanations, human corrections, accepted-brief quality, unwanted replies, elapsed time and actual usage/cost. Report setup effort too. Small samples can remain inconclusive; no invented win rate.

If the simple approach is equally useful, simplify. If live decision approval is too much friction, record it as a product finding rather than claiming the ledger solved adoption. Do not add workers to compensate for bad conversation behavior.

## E. Evidence format

Use NOT_RUN, BLOCKED, INCONCLUSIVE, FAIL or PASS. Separate schema/file checks, mocked software tests, actual provider calls, actual Discord interactions and human ratings.

Each run records candidate commit plus dirty-state identity if any; command/scenario; model/provider/prompt/config versions when relevant; source fixture identity; observed result; timestamps; usage when available; limitations; links to sanitized artifacts. A hash identifies content, not whether a fabricated run occurred.

Do not expose keys or raw private chat in evidence. Publish a deliberately sanitized report. The agent must never change a planned result into PASS merely because scaffolding exists.

## F. Release check

Clean installation, actual run command, private environment setup, one supplied synthetic fixture, missing-service behavior, public repository accessibility, final submission requirements and three-minute version-matched video. A blocked live service must remain a visible blocker in the final report; mock tests are not a substitute.
