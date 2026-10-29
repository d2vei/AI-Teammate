# Media regression v2

This is a same-recipe regression after two concrete v1 failures, not a new held-out benchmark or a replacement for the failed 3/5 result. The original frozen trial, review and raw capture remain unchanged.

The distinct one-call voice diagnostic returned an ASR processing duration of 4560 ms for a decoded 4543.875-ms waveform. The old ceiling of 4544 ms rejected it. The adapter now bounds acceptance to the next 20-ms processing frame, at most ten minutes, and reserves conservative whole seconds for that ceiling. A report beyond that frame still fails; earlier unknown reservations stay reserved. Separately, clips marked audio-important now explicitly request transcription of audible speech and preservation of negations rather than principally describing visible text.

Five attachments use the same authored speech/card recipe and unchanged fact rubrics as v1, with distinct run IDs and regenerated raw inputs. Both the five-case input identities and current source/built-runtime hashes were frozen before any v2 model call. Rubrics remain grader-only. The target remains at least four correct cases of five, with separate agent semantic review and source/cleanup checks. No threshold or expected content was loosened.

`npm.cmd run prepare:media-v2` prepares the ignored fixtures using local speech/FFmpeg only. `npm.cmd run test:media-v2-live` permits at most five sequential media requests through the fixed Infisical route and shared budget, preserves its own first-attempt capture, and deletes only its newly created project/fixture content while retaining charges. It is separate from offline CI and live Discord. Do not regenerate or rerun a completed trial to change its score. See media-v1/README.md for protocol, retention and interpretation limits.
