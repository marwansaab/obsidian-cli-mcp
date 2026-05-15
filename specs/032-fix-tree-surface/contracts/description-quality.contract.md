# Contract: `PATHS_DESCRIPTION` Quality Invariants

**Feature**: 032-fix-tree-surface | **Anchors**: FR-005..FR-012, SC-001..SC-004 | **Date**: 2026-05-15

This contract pins the invariants the post-edit `PATHS_DESCRIPTION` string literal MUST satisfy. It is consumed by reviewers verifying the FR-005..FR-012 set and by deferred test authors writing the next BI's invariant tests.

## Length

| Invariant | Value | Anchor |
|---|---|---|
| Max length | 512 chars (UTF-16 code units) | FR-011 / SC-001 |
| Min length | None specified; the four-section structure (R8) sets a soft floor of ~ 350 chars | — |
| Target draft | 470-490 chars per R8 sample | research.md R8 |

Measurement: `PATHS_DESCRIPTION.length` in JavaScript at runtime. Per the constitution's "zod is single source of truth" framing, the string literal sits inside `src/tools/paths/index.ts` and is read by `registerTool({ description: PATHS_DESCRIPTION, ... })`.

## Structural shape (four-section template)

The description is a single-paragraph string composed of four sections concatenated by single-space joins. Each section's responsibility is fixed; the implementation may refine wording within the section without changing the section's role.

### Section 1 — Opening sentence

| Invariant | Anchor |
|---|---|
| Names the output shape `{ count, paths: string[] }` literally | FR-008 |
| Characterises `paths` as flat using "flat" or a synonym: `non-nested`, `single-level list`, `array of path strings, not a tree`, `linear`, etc. | FR-008 / SC-004 |
| Fits within the first 80 characters of the full description | SC-004 |
| Reads coherently when truncated at common MCP-client cutoffs (e.g., 256 chars) | implicit |

R8 sample sentence (~ 90 chars; meets the < 80 chars requirement for the FLAT claim alone):

> `Flat path list under a vault folder (recursive). Returns { count, paths: string[] };`

The output-shape mention `{ count, paths: string[] }` does not need to be inside the first 80 chars — only the flat-output statement does. SC-004's verification reads: confirms BOTH `paths` AND a flat-output synonym appear in the leading 80 chars.

### Section 2 — Trailing-slash note (FR-009)

| Invariant | Anchor |
|---|---|
| Mentions that folder entries end with `/` and file entries do not | FR-009 |
| Does NOT cite the historical spec-branch identifier of the trailing-slash decision (the v0.5.7 description named the prior spec's `FR-028`; that identifier is one instance of the forbidden `\bFR-\d+\b` regex set under FR-005) | FR-005 |

R8 sample (~ 45 chars):

> `folder entries end with "/", file entries do not.`

### Section 3 — Parameter summary (FR-012)

| Invariant | Anchor |
|---|---|
| Names all six parameters: `target_mode`, `vault`, `folder`, `depth`, `ext`, `total` | FR-012 |
| Each parameter gets a one-clause description sufficient for typical-call construction | FR-012 |
| Does NOT include the per-parameter implementation details (boundary edge cases, normalisation rules, deprecation history) that bloat the v0.5.7 description | FR-012 |
| Indicates required-vs-optional and target_mode-specific rules | implicit (sufficient-for-typical-call invariant) |

R8 sample (~ 240 chars):

> `Required target_mode ("specific" | "active"). In specific mode supply vault; in active mode the focused vault is used. Optional folder (defaults to vault root), depth (positive integer; unbounded by default), ext (filter to one extension, e.g. "md"), and total (true returns only the count).`

### Section 4 — Help pointer (FR-010 / R1)

| Invariant | Anchor |
|---|---|
| Ends with a literal pointer of the form `Call help({ tool_name: "paths" }) for <summary items>, and the error roster.` | FR-010 / R1 |
| Matches the sibling-tool convention (six precedent matches surveyed at plan stage) | R1 |
| Names the `paths` tool by literal string (not by variable interpolation) | implicit |

R8 sample (~ 95 chars):

> `Call help({ tool_name: "paths" }) for full parameter docs, inherited limitations, and the error roster.`

## Forbidden content (negative invariants)

### Regex set (FR-005, FR-006 — zero matches REQUIRED)

The string MUST NOT match any of the following regexes when grepped:

| Regex | What it catches |
|---|---|
| `\bFR-\d+\b` | functional-requirement codes (FR-001, FR-028, etc.) |
| `\bBI-\d+\b` | BI tracker references (BI-019, BI-029, etc.) |
| `\bADR-\d+\b` | ADR references (ADR-003, ADR-005, etc.) |
| `\bSC-\d+\b` | success-criteria codes (SC-001, etc.) |
| `\bTC-\d+\b` | test-case codes (TC-049, etc.) |
| `\b[FQR]-\d+[a-z]?\b` | F-NNN (live findings), Q-NNN (clarifications), R-NNN (research decisions) |
| `\bUS-\d+\b` | user-story codes |
| `\b(first\|second\|third\|fourth\|fifth\|sixth\|seventh\|eighth\|ninth\|tenth\|eleventh\|twelfth\|thirteenth\|fourteenth\|fifteenth\|sixteenth\|seventeenth) typed-tool wrap\b` | ordinal-typed-tool-wrap phrases |

### Literal substrings (FR-007 — zero matches REQUIRED)

The string MUST NOT contain any of the following literal substrings:

| Substring | What it identifies |
|---|---|
| `_eval-vault-closed-detection` | internal shared module name |
| `targetModeBaseSchema` | internal zod schema name |
| `applyTargetModeRefinementForFolderScoped` | internal refinement helper name |
| `treeInputSchema` / `pathsInputSchema` | internal zod schema name |
| `cli-adapter` / `dispatch-layer` / `dispatch-layer classifier` | internal layer names |
| `011-R5` / `BI-022 baseline` | spec-branch identifiers |

(The list is illustrative-not-exhaustive of FR-007's intent — "any other identifier that names an internal source-tree module, function, type, or test seam". The implementation may surface other internal identifiers; reviewers reject any.)

## Permitted content (positive invariants)

The description MAY use:
- The literal output-shape syntax `{ count, paths: string[] }`.
- The literal parameter names `target_mode`, `vault`, `folder`, `depth`, `ext`, `total`.
- The literal mode names `"specific"` and `"active"`.
- The literal trailing-slash discriminator `"/"`.
- The literal help-pointer wording `Call help({ tool_name: "paths" })`.
- General-English technical vocabulary: `vault`, `folder`, `path`, `depth`, `recursive`, `flat`, `list`, `array`, `extension`, `count`, etc.
- The word `recursive` (the tool IS recursive over the folder subtree); this does NOT violate FR-013's negative-name constraint because the name `paths` does not evoke hierarchy — the recursive enumeration produces a flat array.

## Verification anchors

- Source-level: `PATHS_DESCRIPTION` literal in `src/tools/paths/index.ts`.
- Test-level (this BI): the existing test case (3) at `src/tools/paths/index.test.ts:74-84` updates its assertions to check the new help-pointer literal. No new tests added.
- Test-level (deferred): a future BI may add invariant tests that:
  - `expect(PATHS_DESCRIPTION.length).toBeLessThanOrEqual(512)` (FR-011)
  - `expect(PATHS_DESCRIPTION).not.toMatch(/\b(FR|BI|ADR|SC|TC|US)-\d+\b/)` (FR-005)
  - `expect(PATHS_DESCRIPTION).not.toMatch(/\b(first|second|...|seventeenth) typed-tool wrap\b/)` (FR-006)
  - `expect(PATHS_DESCRIPTION).not.toContain("_eval-vault-closed-detection")` (FR-007)
  - `expect(PATHS_DESCRIPTION.slice(0, 80)).toMatch(/paths/)` and to match a flat-output synonym (SC-004)
  - `expect(PATHS_DESCRIPTION).toMatch(/Call help\(\{ tool_name: "paths" \}\)/)` (FR-010)
- Baseline: `src/tools/_register-baseline.json` post-roll-forward carries `{name: "paths", descriptionFingerprint: <new-hash>}`; the hash is the SHA-256 of the canonicalised description, indirectly locking the content. Any future drift in the description requires a baseline roll-forward.
