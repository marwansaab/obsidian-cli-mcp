# Phase 1 Data Model — Find and Replace

**Branch**: `038-find-replace`
**Inputs**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md).

Eight entities define the find_and_replace surface. Three are externally visible Zod-typed schemas (FindAndReplaceInput, FindAndReplaceOutput, plus the per-occurrence shape Occurrence carried inside the preview branch). Five are internal — they describe handler-side intermediate values and do not appear in the wire shape.

Every external field cites the FR it traces to. Validation rules are stated in the Zod-equivalent form so the schema-file implementation is a mechanical translation.

---

## External entities (Zod-schematised, wire-visible)

### 1. `FindAndReplaceInput`

The validated request shape. Single source of truth per Principle III; downstream code uses `z.infer<typeof findAndReplaceInputSchema>`.

| Field | Type | Required | Default | FR | Notes |
|---|---|---|---|---|---|
| `pattern` | `string` (1..1000 UTF-16 code units) | Y | — | FR-001, FR-022 | Empty → `VALIDATION_ERROR`/`INVALID_PATTERN`/`empty`. Over-cap → `…/too-long`. In `regex` mode, also validated via `superRefine` for ECMAScript syntax → `…/regex-syntax` per FR-010. |
| `replacement` | `string` (0..1000 UTF-16 code units) | Y | — | FR-002, FR-022 | Empty replacement is valid (deletion semantics). Over-cap → `VALIDATION_ERROR`/`INVALID_REPLACEMENT`. |
| `mode` | `"literal" \| "regex"` | N | `"literal"` | FR-001 | Literal-as-default per spec Assumption. |
| `case_insensitive` | `boolean` | N | `false` | FR-019 | In `regex` mode equivalent to `RegExp` `i` flag. |
| `subfolder` | `string` (optional) | N | — | FR-008, FR-009 | `superRefine` runs `isStructurallySafePath` — fail → `VALIDATION_ERROR`/`INVALID_SUBFOLDER`/`path-traversal`. Empty string distinguishable from absent — both treated as "whole vault". |
| `include_code_blocks` | `boolean` | N | `false` | FR-006 | Opt-in to including fenced-code-block occurrences. |
| `include_html_comments` | `boolean` | N | `false` | FR-007 | Opt-in to including HTML-comment occurrences. Independent of `include_code_blocks`. |
| `commit` | `boolean` | N | `false` | FR-003 | When `false` (or absent) → preview branch; when `true` → commit branch. |
| `vault` | `string` (optional) | N | — | FR-013 | Absent ⇒ focused-vault default. Present ⇒ resolved via ADR-009 lazy vault registry. Unknown → `CLI_REPORTED_ERROR`/`VAULT_NOT_FOUND`/`unknown`. Closed → `…/not-open`. |

**Object strictness**: `z.object({…}).strict()` — unknown fields are rejected with `VALIDATION_ERROR` (parity with project convention).

---

### 2. `FindAndReplaceOutput`

The discriminated-union response shape per FR-025. `z.discriminatedUnion("mode", [PreviewBranch, CommitBranch])`.

**Preview branch** (`mode: "preview"`):

| Field | Type | FR | Notes |
|---|---|---|---|
| `mode` | `"preview"` (literal) | FR-025 | Discriminator. |
| `affected_notes` | `AffectedNote[]` | FR-004 | Ascending lexicographic order of vault-relative path. |
| `total_occurrences` | `number` (int ≥ 0) | FR-004, FR-011 | Sum of per-note occurrence counts across all affected_notes. Must be ≤ the safe upper bound (FR-011 check fires before envelope construction). |

**Commit branch** (`mode: "commit"`):

| Field | Type | FR | Notes |
|---|---|---|---|
| `mode` | `"commit"` (literal) | FR-025 | Discriminator. |
| `changed_notes` | `string[]` (vault-relative locators) | FR-005 | Ascending lexicographic order, matching FR-004's preview ordering. |
| `total_occurrences_replaced` | `number` (int ≥ 0) | FR-005 | Sum across all changed_notes. |
| `partial` | `boolean` | FR-025, FR-021 | `false` for full-batch success; `true` when an `FS_WRITE_FAILED` halted mid-batch. |
| `failing_note_locator` | `string` (optional) | FR-021 | Present when `partial: true`. Carries the locator of the note whose write failed. Absent when `partial: false`. |

**Schema-level invariant**: the commit branch carries `failing_note_locator` IFF `partial === true` — enforced via a `.refine` predicate on the branch.

---

### 3. `AffectedNote`

The per-note container nested in the preview branch's `affected_notes` array.

| Field | Type | FR | Notes |
|---|---|---|---|
| `path` | `string` (vault-relative locator) | FR-004 | Forward-slash path under the vault root. |
| `occurrence_count` | `number` (int ≥ 1) | FR-004 | Per-note occurrence count; non-zero by construction (a note with zero non-skipped occurrences is not an `AffectedNote`). |
| `occurrences` | `Occurrence[]` | FR-004 | Ascending `line_number`; within a line, ascending byte offset. |

---

### 4. `Occurrence`

The per-occurrence shape carried inside `AffectedNote.occurrences`.

| Field | Type | FR | Notes |
|---|---|---|---|
| `line_number` | `number` (int ≥ 1) | FR-004 | 1-based line number within the note. |
| `full_line` | `string` (0..501 UTF-16 code units) | FR-004 | Trailing `\r` stripped. Clipped at 500 with trailing `…` U+2026 when source > 500. |
| `matched_substring` | `string` (uncapped) | FR-004 | The exact bytes the predicate matched; never truncated, even when surrounding `full_line` is clipped. |
| `replacement_substring` | `string` (uncapped) | FR-002, FR-004 | What `matched_substring` will be replaced with. Computed via `replace.ts` — same function used at preview time and commit time per R6. |

---

## Internal entities (handler-side only, not wire-visible)

### 5. `ResolvedScope`

The post-resolution scope of the operation after vault registry + path-safety checks. Built once at handler entry.

| Field | Type | Source | Notes |
|---|---|---|---|
| `vaultRoot` | `string` (absolute filesystem path) | `resolveVaultPath(input.vault ?? focusedVaultName)` | Real, canonical filesystem path from the lazy vault registry. |
| `scanRoot` | `string` (absolute filesystem path) | `resolve(vaultRoot, input.subfolder ?? "")` after `checkCanonicalPath` | The directory `fs.readdir` is invoked under. Equal to `vaultRoot` when `subfolder` is absent. |

`ResolvedScope` is the post-FR-009 contract: if `checkCanonicalPath` returned `{ ok: false }`, the handler throws `PATH_ESCAPES_VAULT` before `ResolvedScope` is materialised.

---

### 6. `Region`

A half-open `[start, end)` range emitted by `fence-scan.ts` or `region-scan.ts` describing a skip-region in a single note's text.

| Field | Type | Notes |
|---|---|---|
| `startOffset` | `number` (int ≥ 0) | Byte offset (UTF-16 code-unit offset) into the note text where the region begins (inclusive). |
| `endOffset` | `number` (int ≥ startOffset) | Byte offset where the region ends (exclusive). Equal to `note.length` for unclosed-fence-at-EOF. |
| `kind` | `"fenced-code-block" \| "html-comment"` | For diagnostics; the per-occurrence skip check is kind-agnostic (only "any skip region" matters). |

The handler composes `fence-scan` + `region-scan` outputs into a combined `skipRegions: Region[]` array conditional on the opt-ins:
- `include_code_blocks: false` → include fenced-code-block regions.
- `include_html_comments: false` → include html-comment regions.
- Both `true` → empty skipRegions; every match is eligible.

Region overlap is permitted (a fenced code block containing an HTML comment is two overlapping regions; the per-occurrence test is `inside-any` so overlap is harmless).

---

### 7. `LineSpan`

The result of splitting a note's text into lines while retaining the original line-ending bytes for byte-for-byte preservation per FR-015.

| Field | Type | Notes |
|---|---|---|
| `lineNumber` | `number` (int ≥ 1) | 1-based. |
| `startOffset` | `number` (int ≥ 0) | Byte offset of the first character of the line in the source. |
| `content` | `string` | The line content with the trailing `\r`/`\n` stripped — what the regex engine sees. |
| `endingBytes` | `string` (`""` / `"\n"` / `"\r\n"`) | The original line ending; preserved verbatim during rewrite. Empty string for the final line if the file has no trailing newline. |

Implementation note: the splitting algorithm scans the source for `\n` / `\r\n` boundaries, emits a `LineSpan` per line preserving `endingBytes`, and emits a final `LineSpan` with `endingBytes: ""` for trailing content with no closing newline. Rewriting a note re-joins via `lines.map(l => newContent(l) + l.endingBytes).join("")`.

---

### 8. `ScanCounts`

The output of a single scan pass — used for both preview output construction AND drift comparison per R4.

| Field | Type | Notes |
|---|---|---|
| `totalOccurrences` | `number` (int ≥ 0) | Sum of all per-note non-skipped occurrence counts. |
| `perNote` | `Map<string, Occurrence[]>` | Keyed by vault-relative path; values are the per-occurrence lists (already region-filtered, zero-width-skipped, replacement-substring-computed). Empty notes (zero occurrences) are absent from the map. |

For preview, `ScanCounts` is converted to the preview branch by sorting `perNote` keys ascending and mapping each `(path, occurrences[])` pair to an `AffectedNote`.

For commit, `ScanCounts` is computed twice: once for "preview-time" (the first scan), once for "commit-time" (the second scan immediately before writing). When `firstScan.totalOccurrences !== secondScan.totalOccurrences` → `OCCURRENCE_COUNT_DRIFT`. When the counts agree, the second scan's `perNote` map drives the actual writes — so the commit always writes what the second scan saw, not the first.

---

## Validation rule summary (cross-entity)

| Rule | Source | Enforcement point |
|---|---|---|
| Pattern length 1..1000 UTF-16 code units | FR-022 | Zod `findAndReplaceInputSchema` |
| Pattern is valid ECMAScript regex (in `regex` mode) | FR-010 | Zod `superRefine` on input |
| Replacement length 0..1000 UTF-16 code units | FR-022 | Zod `findAndReplaceInputSchema` |
| Subfolder is structurally safe | FR-009 Layer 1 | Zod `superRefine` on input |
| Subfolder canonical path is under vault root | FR-009 Layer 2 | Handler entry — `checkCanonicalPath` |
| Per-note canonical path is under vault root | FR-009 Layer 2 (per-note) | Handler commit step — `checkCanonicalPath` per affected note |
| Vault name resolves | FR-013 | Handler entry — `resolveVaultPath` |
| Eligible-file filter (`.md` + `.`-prefix skip) | FR-020 | Handler scan step — directory walk |
| Total occurrences ≤ safe upper bound | FR-011, FR-012(a) | Handler scan step — after counting |
| Preview-time count === commit-time count | FR-012(b) | Handler commit step — after second scan |
| `failing_note_locator` present IFF `partial === true` | FR-021, FR-025 | Zod `findAndReplaceOutputSchema` `.refine` on commit branch |
| `affected_notes` / `changed_notes` ordered path-ascending | FR-004, FR-005 | Handler envelope-construction step |

---

## State transitions

The operation has no persistent state. Per-invocation state-transition shape:

```
[input received]
     │
     ▼
[Zod validation] ──fail──▶ VALIDATION_ERROR (FR-022 caps, FR-010 regex, FR-009 Layer-1, unknown field)
     │ ok
     ▼
[resolveVaultPath] ──fail──▶ CLI_REPORTED_ERROR / VAULT_NOT_FOUND (unknown | not-open)
     │ ok
     ▼
[checkCanonicalPath on scanRoot] ──fail──▶ PATH_ESCAPES_VAULT + pathEscapeAttempt log
     │ ok (or ENOENT lexical fallback)
     ▼
[directory walk + .md/.-prefix filter + region-scan + per-line regex evaluation]
     │
     ▼
[first ScanCounts]
     │
     ▼
[bound check] ──fail──▶ VALIDATION_ERROR / bound-exceeded discriminator
     │ ok
     ▼
[branch on input.commit]
     │                                   ┌──────────────────────────────────┐
     │ commit:false                      │ commit:true                       │
     ▼                                   ▼                                   │
[construct preview output]      [second ScanCounts]                          │
     │                                   │                                   │
     ▼                                   ▼                                   │
[respond mode:"preview"]        [bound recheck on second]──fail──▶ bound-exceeded
                                         │ ok                                │
                                         ▼                                   │
                                [count drift compare] ──diff──▶ OCCURRENCE_COUNT_DRIFT
                                         │ same                              │
                                         ▼                                   │
                                [for each affected note in path-asc order]   │
                                         │                                   │
                                         ▼                                   │
                                [checkCanonicalPath on note] ──fail──▶ PATH_ESCAPES_VAULT
                                         │ ok                                │
                                         ▼                                   │
                                [queue.run: writeFile(tmp) + rename]         │
                                         │ FS error ──▶ FS_WRITE_FAILED      │
                                         │           + partial=true          │
                                         │           + failing_note_locator  │
                                         ▼                                   │
                                [respond mode:"commit", partial:false ]      │
                                                                             ▼
```

The state-transition diagram is informational — there is no state machine artefact; the handler is a straight-line async function.
