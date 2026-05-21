# Quickstart: Reconcile Cohort-Wide Tool Doc and Classifier Drift

**Branch**: `041-reconcile-cohort-doc-drift` | **Date**: 2026-05-21 | **Plan**: [plan.md](plan.md)

## Purpose

Agent-walkthrough verifying the seven cohort tools post-reconciliation. Each section maps to a spec Story / FR / SC triplet so an auditor (human or agent running the BI-0027 audit) can step through the verifications and tick them off without consulting other artefacts.

All vault-touching steps run against the authorised test vault per `.memory/test-execution-instructions.md`. None of the steps are destructive; all are read-side captures.

---

## §1 — Classifier widening: `ERR_NO_ACTIVE_FILE` on `delete` / `rename` / `outline`

**Maps to**: Story 1 / FR-001 / FR-002 / SC-003.
**Pre-requisite**: an Obsidian vault is open with NO focused file (close any open notes in the workspace).

For each of `delete`, `rename`, `outline`:

1. Invoke via MCP in active mode with no `path=` / `file=` parameter.
2. Assert the response surface:
   - `code: "CLI_REPORTED_ERROR"`
   - `details.code: "ERR_NO_ACTIVE_FILE"`
   - `message: "No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` (verbatim)
3. Confirm upstream emission shape (T0 probe — per `research.md` Task 1):
   - Capture the verbatim stdout bytes.
   - Expected: `"Error: No active file.\n"` (capital N, period terminator). If the upstream emit deviates from spec A1, surface it as a new BI rather than expanding scope.

**Eval-composed regression-guard**: invoke `read_heading` and `find_by_property` in active mode with no focused file. Assert each still surfaces `details.code: "ERR_NO_ACTIVE_FILE"` with the same recovery message. Confirms FR-002 (no regression on eval-composed callers).

---

## §2 — Classifier widening: `VIEW_NOT_FOUND` on `query_base`

**Maps to**: Story 2 / FR-003 / FR-004 / FR-005 / SC-003.
**Pre-requisite**: a fixture `.base` file in the test vault declaring exactly one view named `Open`. (Suggested fixture path: `fixtures/view-not-found-fixture.base`.)

### §2.1 — Missing-view branch

1. Invoke `query_base { base_path: "fixtures/view-not-found-fixture.base", view_name: "NonExistentView" }`.
2. Assert the response surface:
   - `code: "CLI_REPORTED_ERROR"`
   - `details.code: "VIEW_NOT_FOUND"`
   - `details.view_name: "NonExistentView"`
   - `details.base_path: "fixtures/view-not-found-fixture.base"`
3. Confirm upstream emission shape (T0 probe — per `research.md` Task 2):
   - Capture stdout = `"Error: View not found: NonExistentView\n"`, stderr = empty, exit code = 0.

### §2.2 — Missing-base-file regression-guard

1. Invoke `query_base { base_path: "fixtures/does-not-exist.base", view_name: "Open" }`.
2. Assert the response surface:
   - `details.code: "BASE_NOT_FOUND"` (NOT `VIEW_NOT_FOUND`)
   - The branch fires in stage 2 (fs.stat ENOENT) before the CLI is invoked. Confirms FR-005.

### §2.3 — JSON-array short-circuit preservation

1. Construct a fixture stub that emits `stdout: "[]\n"` + `stderr: "warn: trivial\n"` + exit 0 (mock-only; not a live probe). The wrapper handler test for this case lives at `src/tools/query_base/handler.test.ts` per `contracts/query_base-classification.md`.
2. Assert the wrapper returns the empty-result envelope (no error). Confirms the `[`-prefix short-circuit guard still wins under the both-channel scan.

---

## §3 — Doc reconciliation: `query_base` response-shape (three claims)

**Maps to**: Story 3 / FR-006 / FR-007 / FR-008 / SC-007.
**Pre-requisites**: fixtures per `research.md` Task 5 + `contracts/query_base-doc-shape.md`.

### §3.1 — Empty-view columns (FR-006)

1. Fixture: `.base` declaring view `EmptyView` whose filter excludes all notes.
2. Invoke `query_base { base_path: "fixtures/empty-view.base", view_name: "EmptyView" }`.
3. Assert response: `{ columns: ["path"], rows: [], truncated: false }`.
4. Open `docs/tools/query_base.md` and `src/tools/query_base/schema.ts`; assert both contain the "When a view matches zero rows, `columns` carries only `[\"path\"]`" claim.

### §3.2 — Type-preservation passthrough (FR-007)

1. Fixture: note `intval.md` with frontmatter `count: 42`; `.base` view including `count`.
2. Invoke `query_base { base_path: "fixtures/intval.base", view_name: "AllRows" }`.
3. Assert response row: `{ path: "intval.md", count: "42" }` — `count` is the string `"42"`, NOT integer `42`.
4. Open `docs/tools/query_base.md` and `src/tools/query_base/schema.ts`; assert both contain the "Frontmatter values are stringified by upstream" claim.

### §3.3 — `file.*` column-name emission (FR-008)

1. Fixture: `.base` view declaring columns `file.path` and `file.name`.
2. Invoke `query_base { base_path: "fixtures/file-cols.base", view_name: "FileView" }`.
3. Assert response: `{ columns: ["path", "file name"], rows: [{ path: "note.md", "file name": "note" }] }` — note the embedded space in `"file name"`.
4. Open `docs/tools/query_base.md` and `src/tools/query_base/schema.ts`; assert both contain the "`file.path` becomes the reserved `path` injection" AND "`file.name` becomes the upstream display label `\"file name\"`" claims.

---

## §4 — Doc reconciliation: `search` error roster (Cowork pathway)

**Maps to**: Story 4 / FR-009 / SC-004.
**Pre-requisite**: enumeration of `search` invocations on the Cowork pathway and the strict-rich pathway per `contracts/search-roster.md`.

### §4.1 — Roster contents

1. Open `docs/tools/search.md` and `src/tools/search/schema.ts`.
2. For every documented code in the roster:
   - If unflagged → confirm reachable on Cowork pathway (T0 probe enumeration).
   - If flagged `*(strict-rich pathway only, per BI-0086 — <reason>)*` → confirm UN-reachable on Cowork pathway AND reachable on strict-rich pathway.
3. Count flagged entries — assert exactly two: `VALIDATION_ERROR(unrecognized_keys)` and out-of-range `limit`.

### §4.2 — Cowork pathway unreachability of carve-outs

1. Via the Cowork MCP client, invoke `tools/call search { vault: "v", query: "q", unknown_key: 1 }`.
2. Assert the call succeeds (no `VALIDATION_ERROR(unrecognized_keys)`); the wrapper receives `{ vault, query }` after Cowork's client-side strip.
3. Via the Cowork MCP client, invoke `tools/call search { vault: "v", query: "q", limit: -1 }`.
4. Assert the surface is MCP transport `-32602` (Invalid Params), NOT a wrapped `VALIDATION_ERROR`.

### §4.3 — Strict-rich pathway reachability of carve-outs

1. Via MCP Inspector (or Claude Desktop), repeat §4.2 step 1 → assert `VALIDATION_ERROR(unrecognized_keys)` fires.
2. Repeat §4.2 step 3 → assert wrapped `VALIDATION_ERROR` (not `-32602`) fires.

---

## §5 — Doc reconciliation: `read_property` malformed-frontmatter

**Maps to**: Story 5 / FR-010 / SC-005.
**Pre-requisite**: fixture note `malformed-frontmatter.md` per `contracts/read_property-malformed-frontmatter.md`.

1. Fixture body:
   ```
   ---
   key: value: with: stray: colons
   ---
   # Heading
   ```
2. Invoke `read_property { path: "malformed-frontmatter.md", property: "key" }`.
3. Capture the verbatim wire response (T0 probe — per `research.md` Task 3).
4. Open `docs/tools/read_property.md` and `src/tools/read_property/schema.ts`; assert both describe the captured shape verbatim (no disagreement).
5. If the captured shape is empty-value-`type:"unknown"`:
   - /speckit-analyze rules whether it satisfies Principle IV's intentional-best-effort-continue clause.
   - If not satisfied → the plan's Complexity Tracking entry is populated, citing spec Clarifications Q2 as the authorising decision.

---

## §6 — Doc reconciliation: `properties` dedup (case-insensitive collapse)

**Maps to**: Story 6 / FR-011 / SC-006.
**Pre-requisite**: fixture vault with two notes per `contracts/properties-dedup.md`.

1. Fixtures:
   - `notes/AaTest.md` — frontmatter `AaTest: value-1`
   - `notes/aatest.md` — frontmatter `aatest: value-2`
2. Invoke `properties { vault: "fixture" }`.
3. Assert: exactly one entry for the (case-insensitively merged) name with `noteCount: 2`. Reported casing is whatever upstream emits — assert with `expect.stringMatching(/aatest/i)`, not a specific casing.
4. Open `docs/tools/properties.md` and `src/tools/properties/schema.ts`; assert both contain `"case-insensitive"` + `"collapse"` (or `"merge"`); assert NEITHER contains `"byte-tiebreak"` (retraction confirmed).
5. Open the older `properties` spec (likely `specs/024-list-properties/spec.md`) and confirm the retraction note has been added per `contracts/properties-dedup.md`.

---

## §7 — Cohort-wide BI-0027 audit pass

**Maps to**: SC-001 / SC-008 / Story 7 from original spec input (reclassified as Success Criteria).

1. Run the BI-0027 audit pass (external to this repo; per the project tracker).
2. Assert: zero Dimension B failures for `search`, `read_property`, `properties`, `query_base`.
3. Assert: zero Dimension C failures for `delete`, `rename`, `outline`, `query_base`.
4. Assert: total audit re-run count post-ship = 1 (cohort-wide), not 6 (per-tool sequential). Confirms SC-008.

---

## Verification checklist (compressed)

| § | What | Maps to | Pass condition |
|---|------|---------|----------------|
| 1 | ERR_NO_ACTIVE_FILE typed on delete/rename/outline | FR-001/002, SC-003 | All three tools surface `details.code: ERR_NO_ACTIVE_FILE` |
| 2.1 | VIEW_NOT_FOUND typed on query_base | FR-003/004, SC-003 | Surface carries `details.code: VIEW_NOT_FOUND` + view_name + base_path |
| 2.2 | BASE_NOT_FOUND regression-guard | FR-005 | Non-existent .base path still surfaces BASE_NOT_FOUND |
| 2.3 | JSON-array short-circuit preserved | (regression) | Empty-result envelope returned, no error |
| 3.1 | query_base empty-view columns doc match | FR-006, SC-007 | Doc + schema describe `["path"]`-only on zero rows |
| 3.2 | query_base type-preservation doc match | FR-007, SC-007 | Doc + schema describe upstream stringification |
| 3.3 | query_base file.* column-name doc match | FR-008, SC-007 | Doc + schema describe non-uniform stripping |
| 4 | search roster reconciled + carve-outs flagged | FR-009, SC-004 | Roster matches reachability; exactly two carve-out flags |
| 5 | read_property spec/doc unified | FR-010, SC-005 | Spec + doc describe captured live shape verbatim |
| 6 | properties case-insensitive collapse documented | FR-011, SC-006 | Doc/schema describe collapse; fixture returns one entry, noteCount 2 |
| 7 | BI-0027 audit clears cohort-wide | SC-001, SC-008 | Zero Dim-B + Dim-C failures; one audit re-run |
