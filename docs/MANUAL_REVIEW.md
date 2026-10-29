# Manual evaluation

The accepted plan requires 20 participation spot judgments and eight same-context direct-answer comparisons. The agent must not enter human ratings. Self-evaluation is permitted and must be labelled; a consenting friend's review is optional. These synthetic replays do not establish a live group study.

The prepared private page is `.local/review/review.html`. It contains 20 moments selected by SHA-256 order independently of outcomes and eight original Meta answer pairs. All ratings and the manual-entry declaration start blank. A/B assignments are deterministic and hidden from the rendered labels, not a formal blinded study. The evidence panel reconstructs the public synthetic source fixture and seeded rule, omitting transient IDs/timestamps; no real approval/execution is implied.

1. Open the page locally in a browser. Read the exchanges, observed actions and answer/evidence panels.
2. Enter correctness, helpfulness and evidence support for each moment, and all five preferences for each pair. Unsure, ties and both poor are valid.
3. Check the manual-entry declaration only after entering your own judgments. Download completed ratings and privately save them as `.local/evidence/manual-ratings-v1.json`.
4. Run `npm.cmd run review:check`. It verifies completion, allowed choices, exact sample IDs and preserved capture/review hashes before exporting aggregate counts only to `evidence/manual-ratings-v1.json`. Notes remain private. A declaration does not independently verify the reviewer identity.

`npm.cmd run review:prepare` creates the page from the preserved local captures without a key or network access. It refuses to overwrite an existing page. It is not reproducible from the public repository alone because raw model answers intentionally remain private. The source script was executed successfully; HTML/inline-script syntax and text escaping were checked offline. Browser bridge retry/reset failed with `The browser access host is unavailable`; visual layout and browser download/validation behavior are **NOT_RUN**. Report any page issue before treating the review as complete.

The draft button downloads unfinished JSON; it does not count as completed ratings or restore progress automatically. No browser persistence/server upload is implemented. Keep the page open while reviewing. The page has a no-network content policy and renders source/model text as text, not executable markup. Completion checks in the page and importer do not turn missing judgments into a pass. Current actual human ratings are **NOT_RUN**; the importer observed no submitted file.
