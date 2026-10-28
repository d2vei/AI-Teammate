# Evaluation inputs

`development/core_cases.jsonl`: 24 newly packaged synthetic development specifications (8 direct, 8 quiet/shadow, 8 evidence). These are not implemented executable tests, not held-out data and not passed cases. The `grader` object is excluded from model input. Supply appropriate fake authenticated IDs/source objects when implementing the harness; the conversational names are not authorization.

The original 48-case v0.6 collection is preserved under `references/history/` unchanged. It includes optional registered-test/job behavior excluded by the accepted addendum. Consult it as a source of negative cases, not a hidden requirement to implement those jobs.

Follow `docs/ACCEPTANCE.md` for deterministic confirmation tests, the fresh frozen 8+8 pilot, eight naturalness pairs and the same-model baseline. Preserve every observed failure. If runtime scenarios or dependencies are missing, record NOT_RUN/BLOCKED rather than treating text specification as a successful test.
