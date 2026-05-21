# Research: Reconcile Cohort-Wide Tool Doc and Classifier Drift

**Branch**: `041-reconcile-cohort-doc-drift` | **Date**: 2026-05-21 | **Plan**: [plan.md](plan.md)

## Method note

Each task below produces a Decision / Rationale / Alternatives entry. T0 probe tasks run against the authorised test vault per `.memory/test-execution-instructions.md` — destructive-probe protocol applied to anything that mutates vault state (none of the five tasks below mutate; all are read-side captures). Unit-test regression coverage remains mock-only per the project test-scope memory.

The classifier widening tasks (T1, T2) and the read_property contingency task (T3) drive runtime + Constitution Check decisions. The carve-out evidence task (T4) and the doc-edit-vs-emission diff task (T5) drive doc-only edits and are not gated by the Constitution.

---

## Task 1 — Live `ERR_NO_ACTIVE_FILE` emit shape on `delete` / `rename` / `outline`

**Decision**: Widen `src/cli-adapter/_dispatch.ts:294` from the current case-sensitive `trimmedHead.startsWith("Error: no active file")` to a case-insensitive prefix match against the canonical phrase `"error: no active file"` (compared after `toLowerCase()` on the leading slice). The match anchor is the message head only — no substring-anywhere match, no whole-message equality. Punctuation suffix variants (".", ".:", ". <hint>") are permitted because the existing `_dispatch.test.ts:311-320` "priority (b) beats (c)" test already pins suffix tolerance under the lowercase form and the widening is monotonic.

**Rationale**:
- The fifteen-tool cohort already routes ERR_NO_ACTIVE_FILE classification through this single dispatch-layer priority-(b) branch (confirmed by grep: every `*.test.ts` reference to `ERR_NO_ACTIVE_FILE` uses the lowercase fixture, and every per-tool handler test that asserts the typed code does so against the shared dispatch entry — `delete/handler.test.ts:225-234`, `read_property/handler.test.ts:259-267`, `files/handler.test.ts:405-414`, etc).
- Spec A1 pins the upstream canonical phrase as `"Error: No active file."` (capital N, period terminator).
- Case-insensitive comparison via `toLowerCase` on the leading slice is the minimum-blast-radius change. A regex `/^error: no active file/i` is equivalent but adds a regex-compile cost the project avoids per existing dispatch code style (the dispatch ladder uses `startsWith`, not regex).
- Monotonic-widening invariant: any input that matched the case-sensitive lowercase form continues to match the case-insensitive form. Therefore the eval-composed tools (`read_heading`, `find_by_property`) that surface ERR_NO_ACTIVE_FILE through the dispatch layer when their eval stub emits the lowercase phrase will continue to fire — FR-002 satisfied by construction.

**Alternatives considered**:
- *Regex anchor (`/^Error: no active file/i`)* — equivalent semantics, adds regex compilation; rejected for marginal cost + style inconsistency.
- *Exact-phrase whole-message equality* — too restrictive; rejected because the priority-(b)-beats-(c) test (`_dispatch.test.ts:311-320`) explicitly proves the suffix-tolerant form (`"Error: no active file. Open one or use specific mode."`) must classify; whole-message equality would regress that case.
- *Pattern table parameterised by per-subcommand emit variants* — over-engineered; rejected because the spec confirms a single canonical phrase across `delete`, `rename`, `outline` (A1) and the existing classification flow is shared across all native-CLI subcommands.

**Empirical anchor (T0 probe payload to capture during /speckit-implement)**:

For each of `delete`, `rename`, `outline` invoked in active mode against a vault with no focused file:
- Verbatim byte string of the leading line on stdout
- Exit code
- Whether stderr carries any incidental content

Expected per spec: all three emit `"Error: No active file.\n"` on stdout with exit code 0 and empty stderr. Deviation in any one would trigger a follow-up BI rather than expanding scope here (per Out-of-Scope).

---

## Task 2 — Live `VIEW_NOT_FOUND` emit shape on `query_base`

**Decision**: Replace the prefer-stderr-fallback-to-stdout ternary at `src/tools/query_base/handler.ts:387-389` with a both-channel scan that concatenates non-empty stderr + non-empty stdout (separated by a newline) and feeds the combined message to the existing `classifyUpstreamError()` function. The `[`-prefix short-circuit guard at line 390 is preserved (a JSON array on stdout indicates a successful row response, not an error). The `details.view_name` + `details.base_path` carry-through at lines 393-403 is unchanged — the wrapper already constructs them correctly; the bug is solely that the classification stage never sees the upstream error string when it lands on stdout while stderr carries any incidental output.

**Rationale**:
- The existing classifier regex at `query_base/handler.ts:165` (`/\bview\b[^.]*\b(not\s+found|unknown|does\s+not\s+exist|no\s+such)\b/i`) already matches `"Error: View not found: openTable"` case-insensitively. No regex edit is needed.
- The bug is in the message-source selection (line 387-389). The current ternary picks stderr ONLY when stderr is non-empty, dropping stdout's error message entirely. The both-channel scan inspects stdout in addition to stderr regardless of which is empty.
- The `[`-prefix guard preserves the JSON-array short-circuit, so the both-channel scan does not falsely classify successful row responses as errors.
- BASE_NOT_FOUND distinction (FR-005) is preserved at lines 340-346 — that branch runs in stage 2 (fs.stat ENOENT) BEFORE stage 3 (CLI invocation) BEFORE stage 4 (classification). The classifier widening is in stage 4; the regression-guard test asserts a non-existent `.base` path never reaches stage 4 at all.

**Alternatives considered**:
- *Scan stderr OR stdout (whichever has the upstream phrase), with stderr taking priority* — equivalent to the current logic; rejected because it still requires the classifier to be invoked twice (once per stream) which doubles the regex pass count and complicates the chain-of-custody fallback at lines 460-471.
- *Concatenate stderr + stdout unconditionally* — equivalent to the chosen approach when stderr is non-empty; cleaner because it eliminates the ternary entirely. **Chosen variant**: only the non-empty streams are concatenated with a `\n` separator, so the regex sees no double-newlines and the `[`-prefix guard still works when stdout is the source.
- *Defer to a new top-level error code for "ambiguous channel"* — rejected: violates the zero-new-top-level-codes streak (Principle IV) and Out-of-Scope's "no new sub-discriminator codes beyond the two named" (A7).

**Empirical anchor (T0 probe payload to capture during /speckit-implement)**:

Against a fixture `.base` file declaring a single view named `Open`, invoked with `view_name=NonExistentView`:
- Verbatim byte string on stdout
- Verbatim byte string on stderr
- Exit code

Expected per spec A2: stdout = `"Error: View not found: NonExistentView\n"`, stderr = empty, exit code = 0. The regression-guard probe against a non-existent `.base` path captures the unchanged BASE_NOT_FOUND surface (no CLI invocation reached).

---

## Task 3 — Live `read_property` malformed-YAML-frontmatter emit shape

**Decision**: T0 probe captures the live wire shape for `read_property` invoked against a fixture note whose YAML frontmatter is intentionally broken (e.g. a stray `:` inside a flow-mapping value, or an unmatched `[`). Both `read_property`'s spec text (`src/tools/read_property/schema.ts`) and help-doc (`docs/tools/read_property.md`) reconcile to the captured shape verbatim. No runtime change to `read_property` is in scope.

**Rationale**:
- Spec Clarifications Q2 (Option A) pins the resolution: codify the live emission, no runtime change.
- Spec Assumption A11 pins the contingency: if the captured shape is the Principle-IV-deviating empty-value-`type:"unknown"` form, a Complexity Tracking entry in the plan justifies the deviation (already drafted as a conditional row in `plan.md`).
- /speckit-analyze applies the test: does the captured shape carry enough information to satisfy Principle IV's "report what succeeded AND what failed" intentional-best-effort-continue clause? The `type:"unknown"` discriminator MAY discharge it (the wrapper reports the property name as the "succeeded" side and the `type:"unknown"` flag as the "failed" side); the empty value alone does NOT. The judgement is /speckit-analyze's, citing this Q2 entry as the authorising decision per the Constitution.
- Two shape branches; in either case the doc-edit deliverable is the same — unify spec + help-doc to the captured live emission.

**Alternatives considered**:
- *Runtime fix to emit a typed UpstreamError instead* — REJECTED at spec time (Out-of-Scope explicit; FR-013 single-pass discipline; Clarifications Q2 Option B explicitly rejected).
- *Defer `read_property` to a per-tool BI* — REJECTED at spec time (breaks the cohort-wide single-audit-re-run cycle commitment; Clarifications Q2 Option C explicitly rejected).
- *Pick one shape arbitrarily (e.g. assume empty-value-`type:"unknown"`)* — rejected: the spec deliberately ties the doc to live emission to avoid the very drift this BI fixes. Guessing reintroduces the drift class.

**Empirical anchor**:

Against a fixture note `malformed-frontmatter.md` with body:
```
---
key: value: with: stray: colons
---
# Heading
```
invoked via `read_property` with `property=key`:
- Verbatim wire payload (full response JSON)
- Specifically: is `value` empty? Is `type` present? What value does it carry?

Expected per A4: whichever shape the wrapper currently emits. Two branches expected (see Decision).

---

## Task 4 — Cowork pathway carve-out evidence for `search`

**Decision**: The `search` help-doc roster (`docs/tools/search.md`) and the matching `src/tools/search/schema.ts` `.describe()` text adopt the following format for the two BI-0086 carve-out codes:

> `VALIDATION_ERROR(unrecognized_keys)` — *(strict-rich pathway only, per BI-0086 — Cowork strips unknown top-level keys client-side per `additionalProperties: false`, so this code never fires on Cowork)*
>
> Out-of-range `limit` — *(strict-rich pathway only, per BI-0086 — Cowork surfaces this as MCP transport error `-32602` (Invalid Params), not as the wrapper's wrapped `VALIDATION_ERROR`)*

All other roster codes are Cowork-reachable AND strict-rich-reachable (the common case); they carry no pathway flag.

**Rationale**:
- Spec Clarifications Q1 + FR-009 + SC-004 pin the carve-out scope to exactly these two codes. Other reachable codes do not require flagging.
- The flag format `*(strict-rich pathway only, per BI-0086 — <reason>)*` is auditable: an automated `grep -c "strict-rich pathway only"` in the roster yields the carve-out count, which the audit script can compare against the spec's enumeration.
- The reason text is short enough to read inline but long enough to disambiguate WHY each carve-out exists, so a future auditor reading only the roster understands the asymmetry without consulting BI-0086.

**Alternatives considered**:
- *Tabular roster with a "Cowork-reachable" boolean column* — clearer at scale but heavier for a two-row carve-out; rejected as over-structured for current scope. Revisitable if the carve-out set grows past five entries.
- *Separate "Cowork-unreachable codes" subsection at the end of the roster* — fragments the reading order; rejected because agents reading code-by-code lookups would miss the carve-out flag.
- *Drop the two codes from the roster entirely* — REJECTED: violates FR-009 (b) — the strict-rich pathway still produces them, and the roster must document them so strict-rich clients can recover.

**Empirical anchor**:

Two minimal MCP requests, one per pathway, demonstrating the asymmetry:
- Cowork: `tools/call search { vault: "v", query: "q", unknown_key: 1 }` → request reaches wrapper as `{ vault, query }` (key stripped); call succeeds, no VALIDATION_ERROR.
- Strict-rich: same input via MCP Inspector → wrapper sees `unknown_key`, zod rejects, surface `VALIDATION_ERROR(unrecognized_keys)`.

Equivalent pair for out-of-range `limit` (e.g. `limit: -1`):
- Cowork: client-side validation rejects, surface `-32602`.
- Strict-rich: wrapper's zod rejects, surface `VALIDATION_ERROR`.

---

## Task 5 — Doc-edit-vs-emission diff method for `query_base` Story 3

**Decision**: For each of the three documented claims under FR-006 / FR-007 / FR-008, the help-doc edit cites an empirical anchor — a one-line fixture description + the captured wire shape — captured during /speckit-implement T0 probes. The doc text is written so a reader can reproduce each anchor against the authorised test vault.

**Three anchors**:

1. **Empty-view columns** (FR-006). Fixture: a `.base` file declaring view `EmptyView` whose filter excludes all notes. Invocation: `query_base { base_path: "fixtures/empty-view.base", view_name: "EmptyView" }`. Expected captured wire shape: `{ columns: ["path"], rows: [], truncated: false }`. Doc text: "When a view matches zero rows, the response carries only the reserved `path` in `columns`; view-declared columns are visible only when at least one row matches. This is upstream behaviour, not a wrapper limitation — the wrapper has no signal for view-declared column names absent row data, and does not parse the `.base` YAML client-side to enumerate them (out-of-scope per BI-041)."

2. **Type-preservation passthrough** (FR-007). Fixture: a note `intval.md` with frontmatter `count: 42` (integer per YAML); a `.base` view that includes `count` as a column. Invocation: `query_base { base_path: "fixtures/intval.base", view_name: "AllRows" }`. Expected captured wire shape: `{ rows: [{ path: "intval.md", count: "42" }], ... }` (string `"42"`, not integer `42`). Doc text: "Frontmatter values are stringified by upstream regardless of their declared YAML type. The wrapper is passthrough — it does not coerce back to native JSON types. Agents must parse the string value if numeric or boolean semantics are required."

3. **`file.*` column-name emission** (FR-008). Fixture: a `.base` view declaring columns `file.path` and `file.name`. Invocation: `query_base { base_path: "fixtures/file-cols.base", view_name: "FileView" }`. Expected captured wire shape: `{ columns: ["path", "file name"], rows: [{ path: "note.md", "file name": "note" }], ... }`. Doc text: "Source-property column names are stripped non-uniformly. `file.path` becomes the reserved `path` injection (collision-managed per the existing `path_view` rename if a view also declares `path` directly). `file.name` becomes the upstream display label `\"file name\"` (with embedded space — NOT the segment `name`). Agents indexing rows by column name must use the exact emitted string, including the embedded space for display labels."

**Rationale**: Each anchor is reproducible by an auditor with access to the test vault. The doc text edits go beyond "the response shape is X" to explain WHY (so a reader understands the design constraint — out-of-scope per BI-041 — and does not mis-attribute it to a wrapper bug).

**Alternatives considered**:
- *Generic doc edit ("upstream stringifies frontmatter values")* — rejected: too thin for an agent who needs to write parsing code. The anchor + captured response makes the contract operationally verifiable.
- *In-doc code samples that re-render the response* — rejected as redundant with the contracts/ wire shapes; the doc cites the contract file, the contract carries the captured response.

**Empirical anchor**: see "Three anchors" above.

---

## Phase 0 exit

All five tasks have Decision / Rationale / Alternatives complete. No new NEEDS CLARIFICATION items emerged (the two in Clarifications were resolved at /speckit-clarify time). Phase 1 proceeds with the design artefacts: data-model.md, contracts/*, quickstart.md, and the CLAUDE.md plan-reference update.
