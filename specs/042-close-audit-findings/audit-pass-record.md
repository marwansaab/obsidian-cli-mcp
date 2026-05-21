# Audit pass record — BI-042 cohort verification (Story 8)

**Date**: 2026-05-21
**Binary version**: Obsidian CLI 1.12.7 (matches T001 anchor)
**Cohort**: 13 tools — `read_property`, `properties`, `outline`, `find_by_property`, `read_heading`, `files`, `search`, `context_search`, `pattern_search`, `find_and_replace`, `backlinks`, `query_base`, `tag`
**Pass criteria (per [research.md](research.md) Task 8)**:

1. No rogue codes (no `UpstreamError({ code: ... })` outside the cohort's documented error roster)
2. No documented-but-never-produced codes (every roster row is reachable)
3. No produced-but-never-documented codes (every `code` instantiation is named in the roster)
4. No doc-vs-empirical-behaviour drift (spot-check the empirical claims this BI touches)
5. No asymmetric sub-discriminator labelling (per ADR-015: multi-state `(top-level, details.code)` pairs carry `details.reason`)

## Method

For each cohort tool, enumerate the `code` instantiations in `src/tools/<name>/handler.ts` + `src/tools/<name>/index.ts`, cross-check against the `docs/tools/<name>.md` error roster, and spot-probe the empirical claims this BI touches. Sub-discriminator symmetry is checked against ADR-015's closed-union requirement.

## Per-tool table

| Tool | (1) No rogue | (2) No doc'd-but-never-produced | (3) No produced-but-never-doc'd | (4) No empirical drift | (5) Sub-disc symmetry | Notes |
|---|---|---|---|---|---|---|
| `read_property` | ✓ | ✓ | ✓ | ✓ (BI-041 + BI-042 anchored) | ✓ (single-state pairs) | AC9 retired per US1; help-doc + schema `.describe()` carry the empty-value+unknown shape. |
| `properties` | ✓ | ✓ | ✓ | ✓ (case-insensitive collapse + vault= reconciled per US2 + US3) | ✓ | Case-sensitive dedup + byte-tiebreak retired; vault= reconciled to parameter-honoured. |
| `outline` | ✓ | ✓ | ✓ | ✓ (vault= reconciled per US3) | ✓ | "silently honoured-as-noop" retired; empirical anchor added. |
| `find_by_property` | ✓ | ✓ | ✓ | ✓ | ✓ | Empirical anchor added per US3; dual-envelope subsection added per US5. |
| `read_heading` | ✓ | ✓ | ✓ | ✓ (vault= reconciled per US3) | ✓ | "functionally ignored by eval" retired; empirical anchor added. |
| `files` | ✓ | ✓ | ✓ | ✓ (cross-tool reference reconciled per US3 backlinks edit) | ✓ | BI-042 specific-mode anchor section added; legacy cross-tool framing in backlinks.md retired. |
| `search` | ✓ | ✓ | ✓ | ✓ | ✓ (BI-0086 carve-outs already documented) | Dual-envelope subsection extended per US5; truncation slice direction documented per US6. |
| `context_search` | ✓ | ✓ | ✓ | ✓ | ✓ | Dual-envelope subsection added per US5; truncation slice direction documented per US6. |
| `pattern_search` | ✓ | ✓ | ✓ | ✓ | ✓ | Dual-envelope subsection added per US5. |
| `find_and_replace` | ✓ | ✓ | ✓ | ✓ | ✓ **(closed union restored)** | US4 runtime change: `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair now carries `details.reason: "path-traversal" \| "not-found"`. Tests + roster + header comment updated. |
| `backlinks` | ✓ | ✓ | ✓ | ✓ (cross-folder reach probed per US7) | ✓ | Empirical anchor added per US3; cross-tool framing retired; dual-envelope added per US5; truncation slice direction documented per US6; cross-folder reach caveat added per US7. |
| `query_base` | ✓ | ✓ | ✓ | ✓ | ✓ | Dual-envelope subsection added per US5. |
| `tag` | ✓ | ✓ | ✓ | ✓ (vault= reconciled per US3) | ✓ | Empirical anchor added; dual-envelope subsection added per US5. |

## SC-001 — SC-006 satisfaction summary

- **SC-001** (every cohort tool's per-tool surfaces — help-doc, feature spec where present, schema `.describe()` — agree on the live wire shape): ✓ Satisfied. Predecessor specs for `read_property` (013) and `properties` (024) carry BI-042 retraction notes; cohort `docs/tools/*.md` surfaces carry empirical anchors or retracted phrasing.
- **SC-002** (`find_and_replace` ENOENT branch carries `details.reason: "not-found"`): ✓ Satisfied. Runtime change landed at [handler.ts:512-524](../../src/tools/find_and_replace/handler.ts#L512-L524); tests pass (37/37 in the suite).
- **SC-003** (dual envelope acknowledged side by side in every cohort tool's roster): ✓ Satisfied. All 8 US5 cohort tools carry the "Dual validation envelope" subsection.
- **SC-004** (truncation slice direction documented per tool, cohort-uniform LEADING with no divergence call-out needed): ✓ Satisfied. All 3 US6 cohort tools document the LEADING slice direction.
- **SC-005** (no new top-level error codes; schema input-shape unchanged; single runtime-code edit): ✓ Satisfied — see §SC-005 invariant check below.
- **SC-006** (audit umbrella's open-findings ledger reaches zero entries within the scope of stories 1–7): ✓ Satisfied. All cohort tools clear the 5 pass criteria within scope. Out-of-scope items (displayText surfacing, runtime slice-direction standardisation) are forward-pointed per spec Out-of-Scope.

## SC-005 invariant check (per task T039)

Per the spec's SC-005 scope invariant, this BI commits:

- (a) **Zero new tool registrations** — `git diff main src/tools/_register.ts` shows no net additions. ✓
- (b) **Zero schema input-shape changes** — `git diff main 'src/tools/*/schema.ts'` shows only `.describe()` string edits (no field additions/removals, no `.min()`/`.max()`/`.optional()` declarations changed on existing fields). ✓
- (c) **Single runtime-code edit** — the only behaviour-changing edit is at [`src/tools/find_and_replace/handler.ts:512-524`](../../src/tools/find_and_replace/handler.ts#L512-L524) adding `reason: "not-found"` to the ENOENT `details` payload, plus the matching header-comment update at [`src/tools/find_and_replace/index.ts:1`](../../src/tools/find_and_replace/index.ts#L1) and the FIND_AND_REPLACE_DESCRIPTION extension. ✓
- (d) **No new top-level error codes** — the Principle IV zero-new-codes streak is preserved at 15 tools. The Story 4 change adds a new sub-state to an existing `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair via `details.reason`, per the canonical ADR-015 pattern. ✓

`git diff main` verification: run `git diff main --stat` after this BI lands to confirm:
- `src/tools/find_and_replace/handler.ts` — 1 added line (`reason: "not-found",`)
- `src/tools/find_and_replace/index.ts` — 2 modified lines (header comment + description string)
- `src/tools/find_and_replace/handler.test.ts` — 1 modified test assertion + 1 new symmetry test block
- `src/tools/properties/index.ts` — 1 modified description string (BI-042 anchor)
- `src/tools/properties/handler.ts` — 1 modified header comment (BI-042 anchor)
- `src/tools/properties/handler.test.ts` — 1 modified test description (historical note)
- `src/tools/outline/handler.test.ts` — 1 modified test description (historical note)
- `docs/tools/*.md` — multiple files updated per US1–US7 doc edits
- `specs/013-read-property/spec.md` — AC9 retirement (US1)
- `specs/024-list-properties/spec.md` — dedup-FR retirements (US2)
- `specs/042-close-audit-findings/contracts/*.md` — new evidence files

## Audit umbrella open-findings ledger

The audit umbrella's open-findings ledger reaches **zero entries within the scope of stories 1–7**. Out-of-scope items (referenced inline in `specs/042-close-audit-findings/spec.md` Out of Scope) ship on their own predecessors and are not blocking this BI.

## Cleanup

Sandbox fixtures (`Sandbox/042/`, `Sandbox/042-cf/`) were removed after Story 3 + Story 7 probes per the test-execution memory at [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).
