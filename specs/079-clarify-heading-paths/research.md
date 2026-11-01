# Research: Clarify heading-path rules

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-01

This BI makes no runtime behaviour change (spec Clarifications, Session 2026-11-01): only published description text and help pages change. The findings below establish what the two capabilities actually do, where the misleading wording lives, and what must stay byte-identical.

## Findings

### F1 — Both capabilities resolve a path from level 1, one level per segment

**`patch_heading`** — `walkHeadings` (`src/tools/patch_heading/heading-walk.ts:92`) keeps `lockedAncestors` and accepts a heading as the next segment only when `h.rank === lockedAncestors.length + 1` (line 127) and the parent chain matches the locked ancestors (lines 131–138). The first segment therefore matches only a rank-1 heading, the second only a rank-2 heading inside it, and so on. A path of N segments resolves only a level-N heading.

**`read_heading`** — the eval template (`src/tools/read_heading/_template.ts:24–37`) builds a level-indexed `stack` (`stack.length = h.level - 1; stack[h.level - 1] = h.heading`) and matches only when `stack.length === a.segments.length` and every `stack[j] === a.segments[j]`. A missing level leaves a hole (`undefined`) in `stack` that can never equal a segment string. The rule is the same: segment 1 is level 1, and segment k is the level-k heading under segment k-1.

**Consequences** (both capabilities):

- `Section::Subsection` / `Section#Subsection`, written for `# Top / ## Section / ### Subsection`, fails with heading-not-found: two segments only match a level-2 target, and `Section` is not level 1.
- A note with no level-1 heading has no reachable section.
- A heading below a skipped level (for example a `###` directly under a `#`) is unreachable, and so is everything beneath it on that branch. A skip *below* the target, or on another branch, does not affect the target.
- A note with several level-1 headings: a path may start at any of them (`read_heading` resets `stack`; `walkHeadings` resets `parentChain`). Only first-match-wins applies to duplicate *paths*.
- A level-1 section by itself: rejected at validation (one-segment path).

Existing coverage: `heading-walk.test.ts` has "returns null when the ancestor is not present" and the right-text-wrong-parent case, but no test pins the missing-level-1 or skipped-level behaviour the new documentation states. `read_heading`'s matching runs inside Obsidian, so it can only be pinned by a live check.

### F2 — Where the misleading wording lives

| Location | Text | Kind |
|---|---|---|
| `src/tools/read_heading/index.ts:10` (`READ_HEADING_DESCRIPTION`) | "a `::`-separated path with at least two non-empty segments … single-segment H1-only reads … are out-of-reach (documented fallback: full-file read_note …)" | Published description. It also names `read_note`, a retired tool (now `read`). |
| `src/tools/read_heading/schema.ts:27` (`heading` `.describe`) | "Heading path from the top-level heading down, `::`-separated, at least two segments (e.g. \"H1::H2\")." | Published parameter description. |
| `src/tools/read_heading/schema.ts:11` (`validateHeadingPath`) | "heading must contain at least two `::`-separated segments (e.g. \"H1::H2\")" | Runtime validation message. Unchanged (FR-006). |
| `src/tools/patch_heading/index.ts:21` (`PATCH_HEADING_DESCRIPTION`) | "**Minimum two segments** — top-level headings are out of scope (the wrapper exposes no top-level patch surface; use `write_note` for that)." | Published description: the sentence agents misread. |
| `src/tools/patch_heading/index.ts:27` | "`HEADING_NOT_FOUND` (use [`outline`] … then retry with a valid path)" | Published recovery guidance, with no cause named. |
| `src/tools/patch_heading/schema.ts:97` (`heading_path` `.describe`) | "Full heading path from a top-level heading down … at least two segments …" | Published parameter description. |
| `src/tools/patch_heading/schema.ts:52` (`headingPathField`) | "heading_path must contain at least two segments separated by '#'; top-level headings are out of scope" | Runtime validation message. Unchanged (FR-006): it fires only for a one-segment path, where it is accurate. |
| `docs/tools/read_heading.md:37, 43, 45–49, 121, 186, 202` | the "≥2 segments" field row, the validator paragraph, the out-of-reach list, the HEADING_NOT_FOUND row, Examples 4–5 | Help page. |
| `docs/tools/patch_heading.md:18` | "Patch a top-level heading (1-segment path) … or wrap the top-level heading in a parent." | Help page. The "wrap in a parent" advice is impossible: a level-1 heading has no parent heading. |
| `docs/tools/patch_heading.md:43, 138, 195` | the "≥2 segments" field row, the "Minimum two segments — top-level headings … are out of scope" constraint, the HEADING_NOT_FOUND row | Help page. |
| `.docs-as-code/capabilities/read.md:168` | "needs at least two path …" | Living system docs. Handled by `/speckit-docs-as-code` (PR lifecycle). |

A search across all published tool descriptions, `src/server.ts` instructions, `docs/tools/**`, `README.md` and `CONTRIBUTING.md` found no other occurrence (FR-011). The `outline` description and `docs/tools/index.md` summaries mention no segment count and are left alone (outline is out of scope).

### F3 — Tests that pin the current wording

- `read_heading/index.test.ts:31` and `patch_heading/index.test.ts:138` compare the descriptor to the exported constant (`toBe(…_DESCRIPTION)`), so they follow any rewording.
- `read_heading/index.test.ts:43` matches `/heading.*path|::|two.*segment/i`, and `:118` matches the docs against `/single-?segment|setext|::.*literally/i`. The new wording still satisfies both (it keeps "Setext" and the `::`-literal case).
- `read_heading/schema.test.ts:89` asserts the validation message contains "at least two". The message is unchanged.
- `patch_heading/schema.test.ts` asserts the `INVALID_HEADING_PATH` sub-reasons, not the description text. Unchanged.
- The registry baseline (`src/tools/_register-baseline.json`) fingerprints each tool's description and input schema. `read_heading` and `patch_heading` both move on `descriptionFingerprint` and `schemaFingerprint`; nothing else moves.

### F4 — Fingerprint gate

Under the constitution's MCP Tool Surface Standards (*Schema dialect*), the baseline is a deliberate-change gate: a published-surface change fails it, and the fix is to review the change and regenerate the baseline in the same PR (`npm run baseline:write`).

## Decisions

### D1 — One canonical rule, written once per capability

Each capability states the same five load-bearing phrases, each with its own separator:

1. the path **starts at the note's level-1 heading**;
2. each later segment is the heading **exactly one level below the previous one**;
3. a worked shape: a level-3 target needs three segments;
4. leaving out the level-1 heading **fails with `HEADING_NOT_FOUND`** even though both headings exist;
5. unreachable: a level-1 section by itself, any section in a note with **no level-1 heading**, any section **below a skipped level**.

The exact text is fixed in [contracts/heading-path-wording-contract.md](contracts/heading-path-wording-contract.md).

**Rationale**: the acceptance criteria require "the same rule in the same terms". Fixed phrases let tests assert their presence in both capabilities.

**Alternatives considered**: a shared `_shared.ts` helper that builds the sentence from a separator. Rejected: it adds a cross-tool abstraction for two strings, makes the descriptions harder to read in source, and the tests already enforce equivalence.

### D2 — Recovery guidance names the cause before `outline`

Both capabilities' heading-not-found guidance reads, in order: "most often the path leaves out the level-1 heading or skips a level; check that first, then list the note's headings with `outline` and retry." It goes in the description's error list (patch_heading) or its trailing sentence (read_heading), and in the help pages' error tables.

### D3 — Runtime text untouched

`validateHeadingPath`'s message, `headingPathField`'s `single-segment` message, both handlers' `HEADING_NOT_FOUND` messages, every error code and every `details` field stay byte-identical (spec FR-006, FR-012; Clarifications). The help pages explain that the one-segment message means "a level-1 section cannot be addressed by itself".

### D4 — Correct the stale `read_note` and "wrap in a parent" text only where touched

The `read_heading` description sentence being rewritten names `read_note`, which was renamed to `read`; the rewrite uses `read`. `patch_heading.md:18`'s "wrap the top-level heading in a parent" is replaced, because it contradicts the rule being documented. No other adjacent text is edited.

### D5 — Tests

- `read_heading/index.test.ts` and `patch_heading/index.test.ts`: assert that the description and the heading parameter description contain the D1 phrases, that the description names the D2 cause before `outline`, that the help page contains the rule, the unreachable cases, the whole-note alternative (`read` / `write_note`), a three-segment example and the failing shorter example, and that the description no longer contains "top-level headings are out of scope" (FR-013).
- `heading-walk.test.ts`: five characterisation cases that pin the documented behaviour of `walkHeadings`. Three return `null`: a path without the level-1 segment, a skipped level, and a note with no level-1 heading. Two resolve: a target with a skip below it, and a target under a second level-1 heading. They add no new behaviour; they keep the documentation from drifting from the code.
- `read_heading`'s matching runs in Obsidian, so it is pinned by the live check in [quickstart.md](quickstart.md) §3.

### D6 — Changelog

Add `Spec 079-clarify-heading-paths.` to `[Unreleased]` with a **Changed** bullet: both capabilities now document the heading-path rule, the unreachable sections and the most common cause of heading-not-found. Behaviour is unchanged.
