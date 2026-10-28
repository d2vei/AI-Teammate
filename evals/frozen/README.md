# Frozen evaluation v1

The runtime/prompt hashes in manifest.json were captured before authoring fresh-cases.jsonl. The base commit plus dirtyRuntimeIdentity identifies that candidate; later evaluation artifacts also record the execution commit, source fixture and case-set hash. The handoff development cases are separate and are not held-out evidence.

`npm run eval:offline` checks only that eight quiet exchanges are blocked by explicit-invocation configuration. Its eight direct model cases remain NOT_RUN. There is no proactive model classification or social-timing claim.

After private Infisical setup and an explicitly configured available allowance, stop the bot and run `npm run eval:live`. It uses the same global state-directory lock and SQLite charge ledger as the bot, so evaluation cannot reset spending. It makes at most sixteen sequential Meta requests: eight direct inputs, each paired with a competent concise baseline using the same Standard model, exact authorized evidence, max output, no tools and default sampling settings. The candidate/baseline order alternates deterministically. Both receive the approved rule; case IDs and grader fields are excluded from model input. Only synthetic data is used. The seeded evaluation approval is not a live human approval.

Each call conservatively reserves budget first. Unknown charges remain reserved. Responses, usage and failures are retained in ignored `.local/evidence/frozen-paired-responses.json`; an existing run is never silently replaced or repeated. PASS_SCHEMA_ONLY means only that a returned response parsed and cited supplied IDs; semantic quality remains unrated. Provider/budget failures stay BLOCKED. The overall result stays INCONCLUSIVE until ratings and complete task evidence exist.

For each of eight pairs, owner ratings must label that role and permit ties/both poor. Record relevance, brevity, unnecessary questions, tone and usefulness. Separately record complete task outcomes (context re-explanations, human corrections, accepted-brief quality, unwanted replies, elapsed time, actual usage/cost and setup effort). This paired-response script does not itself measure Discord workflow/adoption outcomes or establish an advantage over a shared bot. Use the live pilot in docs/ACCEPTANCE.md for that gate. No human-rating result has been produced yet.

If a frozen runtime/prompt hash changes, this driver stops. Preserve its artifacts and prepare a separately versioned freeze and fresh evaluation; do not edit expected answers to turn failures into PASS.
