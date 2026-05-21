# Data Model: Reconcile Cohort-Wide Tool Doc and Classifier Drift

**Branch**: `041-reconcile-cohort-doc-drift` | **Date**: 2026-05-21 | **Plan**: [plan.md](plan.md)

## Scope note

This BI introduces no new data entities, no new persisted state, and no new wire fields. The "data model" deliverable is a map of the **existing** entities the BI touches, the **edges** between them (which entity's shape change forces which downstream artefact update), and the **invariants** the BI must preserve. The map exists to keep the cohort-wide pass coherent — without it, doc edits land out of sync with classifier widenings or vice versa.

## Touched entities

### E1 — Classifier ladder (dispatch-layer)

- **Anchor**: `src/cli-adapter/_dispatch.ts`, function `onTerminal()`, priorities (a)/(b)/(c)/(d), lines 216-322.
- **Shape (before)**: priority (b) at line 294: `if (trimmedHead.startsWith("Error: no active file")) { ... }` — case-sensitive prefix match against lowercase canonical form.
- **Shape (after)**: priority (b) widened to case-insensitive prefix match against `"error: no active file"` (compared after `toLowerCase()` on the leading slice). Monotonic widening — lowercase form continues to match; capital-N upstream emit now classifies.
- **Wire payload (unchanged)**: `code: "ERR_NO_ACTIVE_FILE"`, `details: { argv, command, stdout, stderr, exitCode: 0, message }`, verbatim recovery `message` string at `_dispatch.ts:302`.
- **Invariant**: every input that matched the case-sensitive lowercase form continues to match the case-insensitive form. Eval-composed callers (`read_heading`, `find_by_property`) that surface ERR_NO_ACTIVE_FILE through this priority continue to fire.

### E2 — Classifier ladder (query_base handler-layer)

- **Anchor**: `src/tools/query_base/handler.ts`, function `executeQueryBase()` stage 4, lines 384-417, plus `CLASSIFIER_PATTERNS` table at lines 159-183 and `classifyUpstreamError()` at lines 185-190.
- **Shape (before)**: message source resolution at lines 387-389 uses prefer-stderr-fallback-to-stdout ternary. Upstream stdout emits with non-empty incidental stderr never reach the classifier.
- **Shape (after)**: message source resolution replaced with both-channel concatenation (non-empty stderr + `"\n"` + non-empty stdout when both have content; otherwise the non-empty single channel). The `[`-prefix short-circuit guard at line 390 is preserved.
- **Wire payload (unchanged)**: `code: "CLI_REPORTED_ERROR"`, `details: { code: "VIEW_NOT_FOUND", view_name, base_path }`, `message: "query_base: view not found in base file"` — all already constructed correctly at lines 393-403.
- **Invariant**: BASE_NOT_FOUND branch (stage 2, lines 340-346) executes before any stage-4 classification and is therefore not regressed by the stage-4 widening. The `[`-prefix guard preserves the JSON-array short-circuit so successful row responses are not misclassified.

### E3 — Sub-discriminator code (typed `details.code` values)

- **Anchor**: in-tree usage points across `src/cli-adapter/_dispatch.ts` (priority b emits `ERR_NO_ACTIVE_FILE`), `src/tools/query_base/handler.ts` (stage 2 emits `BASE_NOT_FOUND`, stage 4 emits `VIEW_NOT_FOUND`).
- **Set (before this BI)**: `ERR_NO_ACTIVE_FILE`, `VIEW_NOT_FOUND`, `BASE_NOT_FOUND`, `BASE_MALFORMED`, `PATH_ESCAPES_VAULT`, `VAULT_NOT_FOUND`, `unrecognized_keys` — all existing per the fifteen-tool cohort.
- **Set (after this BI)**: **unchanged**. No new sub-discriminator codes introduced. The two named widenings restore classification of `ERR_NO_ACTIVE_FILE` and `VIEW_NOT_FOUND` on cases where the classifier silently dropped them; they do not introduce new codes.
- **Invariant** (Principle IV streak): zero new top-level error codes introduced; zero new sub-discriminator codes introduced; ADR-015's "no new (top-level-code, details.code) pair with multiple sub-states" condition stays N/A.

### E4 — Wrapper help-doc artefact

- **Anchor**: `docs/tools/<name>.md` per tool. Shipped with the npm package per `package.json` `files: ["dist","docs/tools/**/*.md",...]`.
- **Touched files**: `docs/tools/query_base.md`, `docs/tools/search.md`, `docs/tools/read_property.md`, `docs/tools/properties.md` — four edits.
- **Edits per file**: see `contracts/query_base-doc-shape.md`, `contracts/search-roster.md`, `contracts/read_property-malformed-frontmatter.md`, `contracts/properties-dedup.md` respectively.
- **Invariant**: the rendered help-doc and the zod-schema `.describe()` strings (entity E5) MUST agree byte-for-byte on every empirical claim covered by this BI. The two artefacts together constitute the "doc IS the contract" invariant.

### E5 — Zod-schema `.describe()` strings (published-shape source of truth)

- **Anchor**: `src/tools/<name>/schema.ts` per tool. The `.describe()` strings flow through `zod-to-json-schema` into the published MCP `inputSchema` and the `description` field of each tool — read by every MCP client at registration time.
- **Touched files**: `src/tools/query_base/schema.ts`, `src/tools/search/schema.ts`, `src/tools/read_property/schema.ts`, `src/tools/properties/schema.ts` — four edits.
- **Edits per file**: mirrored to the matching `docs/tools/<name>.md` per E4. The schema `.describe()` text is the canonical text; the help-doc is a longer-form rendering of the same claims.
- **Invariant**: schema and help-doc agree on every empirical claim. Schema description tests (`schema.test.ts`) assert the contract text strings; help-doc text is reviewed by inspection during PR review.

### E6 — Cowork pathway carve-out roster (search-only)

- **Anchor**: section within `docs/tools/search.md` and the matching `src/tools/search/schema.ts` `.describe()` block.
- **Set**: exactly two entries, both flagged strict-rich-pathway-only:
  1. `VALIDATION_ERROR(unrecognized_keys)` — Cowork strips unknown top-level keys client-side per `additionalProperties: false`.
  2. Out-of-range `limit` — Cowork surfaces this as MCP transport error `-32602` (Invalid Params), not as the wrapper's wrapped `VALIDATION_ERROR`.
- **Format**: per `research.md` Task 4: inline italic suffix `*(strict-rich pathway only, per BI-0086 — <reason>)*` on each carve-out entry.
- **Invariant**: every other roster code is reachable on both pathways (no flag). The carve-out set is closed at exactly two entries per spec FR-009 / SC-004; any future addition is a new BI per Assumption A10.

### E7 — Fixture vaults / fixture files (test anchors)

- **Anchor**: authorised test vault per `.memory/test-execution-instructions.md`, scratch subdirectory.
- **New fixtures required by T0 probes** (see `research.md` empirical-anchor payloads):
  - `empty-view.base` — declares view `EmptyView` whose filter excludes all notes (for FR-006).
  - `intval.md` + `intval.base` — note with integer YAML frontmatter `count: 42`; view declaring `count` as a column (for FR-007).
  - `file-cols.base` — view declaring columns `file.path` and `file.name` (for FR-008).
  - `malformed-frontmatter.md` — note with intentionally broken YAML frontmatter (for Task 3).
  - `AaTest.md` + `aatest.md` — two notes with frontmatter property names differing only in case (for Story 6).
  - `view-not-found-fixture.base` — `.base` declaring view `Open`; queried with `view_name=NonExistentView` (for Task 2).
- **Invariant**: fixtures live under the scratch subdirectory, cleaned up after T0 probes per the destructive-probe protocol. None are persisted in-repo.

## Edges (entity dependencies the BI must keep in lockstep)

- **E1 ↔ E3**: dispatch-layer widening affects which `details.code` values fire on which upstream emits, but does not change the code set (E3 unchanged).
- **E2 ↔ E3**: query_base handler widening same — channel scope widens, code set unchanged.
- **E1 / E2 ↔ E4 / E5**: classifier widenings drive matching help-doc + schema updates only where the doc currently mis-describes the classifier scope. The widened ERR_NO_ACTIVE_FILE on `delete` / `rename` / `outline` is already documented in their help-docs as a typed sub-discriminator; the widening makes the doc true. Same for VIEW_NOT_FOUND on `query_base`. No new doc claims; existing claims restored to truth.
- **E4 ↔ E5**: every edit to one MUST mirror to the other. PR review verifies pair-wise.
- **E6 ↔ E4 / E5**: the carve-out roster lives in both `docs/tools/search.md` and `src/tools/search/schema.ts`. Both updated in the same change.
- **E7 ↔ E1 / E2 / E4 / E5**: fixtures anchor the empirical-claim doc edits and the T0 probe captures. Without the fixtures, the doc edits cannot be verified.

## State transitions (operational)

None. The wrapper is stateless; the classifier ladder is a pure function of upstream output. The doc artefacts are static text. No persistent state to track.

## Invariants summary (preserved across the BI)

1. **Zero new top-level error codes** (Principle IV streak, fifteen-tool cohort baseline).
2. **Zero new sub-discriminator codes** (per Assumption A7).
3. **No regression on eval-composed tools** (`read_heading`, `find_by_property` continue to surface ERR_NO_ACTIVE_FILE).
4. **No regression on BASE_NOT_FOUND** branch of `query_base`.
5. **Help-doc ↔ schema `.describe()` agreement** (the "doc IS the contract" invariant).
6. **Cowork pathway carve-out closed at exactly two entries** (per spec FR-009 / SC-004 / Assumption A10).
7. **Single-pass delivery discipline** (FR-013): one cohort-wide audit re-run post-ship, not six sequential per-tool re-runs.
