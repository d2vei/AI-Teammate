# Documented usefulness checks

These tests check whether the application supplies the context and confirmation path a useful teammate needs. They use synthetic evidence and controlled provider replies. They cannot establish that Meta understands an arbitrary conversation, produces a useful explanation, or saves a real group time. Human relevance, tone and baseline ratings remain separate under [ACCEPTANCE.md](ACCEPTANCE.md#d-naturalness-and-useful-baseline).

Run the current tests without vault access or real keys:

```sh
npm test -- tests/usefulness.test.ts
npm run test:usefulness-mutation
```

The [test bodies](../tests/usefulness.test.ts) exercise the shared core and actual temporary SQLite state, with a fake adapter and controlled model. U05 has three variants; the later U12 regression brings this file to fourteen cases. Existing tests still cover access, pause, budget, restart and other boundaries.

| Case | Documented contract | Useful observable outcome / rejected failure |
|---|---|---|
| U01 | Plan sections 5–6: direct answer, bounded relevant snippets | A focused function question reaches the provider with the actual selected function within 24 KB despite unrelated large files. Unrelated filler must not block it. |
| U02 | Plan section 2; acceptance A.2–5, AUTH-01/05, STATE-01, BOUNDARY-01 | A member receives approved rule + selected code + log, requests a brief, and later recalls its saved next check without pasting it again. Casual agreement and the wrong approver cannot save it; repeated exact confirmation saves once. Recall says saved, not executed. |
| U03 | Plan section 6 correction path; SOURCE-01 | An explicitly withdrawn rule disappears from supplied model context and the separately approved correction is available. No automatic authority inferred from chat. |
| U04 | Plan section 5: necessary clarification / honest blocker | Without a selected snapshot, an empty-citation clarification can reach the member, with no fabricated source or saved proposal. The controlled reply does not prove the real model will choose it. |
| U05 × 3 | SOURCE-01/03: unavailable evidence | A retained ID for deleted code, stale code or an expired log cannot pass the response citation check. The unsupported assertion is not delivered. |
| U06 | SOURCE-01; accepted-brief provenance | A saved brief cannot provide current factual support after its underlying evidence is removed. Its retained reference does not restore removed text. |
| U07 | AUTH-03/04; source-bound confirmation | A draft bound to known unavailable evidence cannot produce a confirmation card that the member could never validly accept. |
| U08 | AUTH-03; SOURCE-01 | An invalidated pending proposal cannot indirectly authorize a new brief based on its stale evidence. Validation follows underlying bindings. |
| U09 | Memory guide: exact references and unavailable status | Looking up an exact removed ID returns that reference before unrelated available hits, with unavailable status and without its removed text. |
| U10 | Plan section 6: current selected source IDs | A legitimate newest log remains citable after 120 retained source rows. Validation does not incorrectly inspect only the first 100 rows. |
| U11 | Plan section 6: bounded context; API-02 | A genuinely oversized relevant selection still asks the member to narrow it, with no provider dispatch or charge. U01 does not relax the 24 KB limit. |
| U12 | SOURCE-01; uncertainty after source removal | Withheld brief/proposal context is typed missing evidence, while an honest uncited limitation answer remains deliverable. No citation gate is relaxed. |

Source selection remains lexical, with the existing category caps and a fallback when nothing matches. It is not embedding search, summarization, or an assurance that every important source is found. An exact unavailable lookup reports status, not current factual support. Citation availability checks do not establish entailment or catch every unsupported claim in citation-free prose.

The [negative controls](../scripts/usefulness-mutation.ts) remove focused source selection, citation availability validation, and recursive proposal provenance in three expendable copies. Each must fail its specific U01, U06 or U08 assertion. Parse errors or missing test reports do not count. Authoritative source and tests remain intact.

The existing composed conversation test also verifies `/sources` includes the supplied media transcript. Both local wrappers deliberately browse with an empty retrieval query so their command wording does not hide evidence. These command checks remain simulated; Discord is deferred.

Observed candidate `c6089ec`: 222 unit tests/28 files and all thirteen committed offline workflow commands pass from a fresh Windows dependency installation with no vault or credential environment. The three new negative controls each fail their intended assertion in an expendable copy. See [the exact command record](../evidence/clean-install-c6089ec.json). No additional Meta call or human rating was made.

Hosted Ubuntu [run 41001759669](https://github.com/d2vei/AI-Teammate/actions/runs/41001759669) on `4126e9a` also completed successfully, with all thirteen npm steps passed. Source, tests, scripts, workflow and dependency files match the Windows-tested candidate; that intervening commit records results only. GitHub confirms both commits as Davi/d2vei. See [publication metadata](../evidence/usefulness-publication-v1.json).
