# Phase 1 Data Model: File Scope

**Feature**: `066-file-scope` · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

This feature adds input fields and an internal scope-resolution entity to `find_and_replace`; the output entities and the downstream scan/commit entities are inherited unchanged from BI-038. Only the deltas are described in full.

---

## Input entity — `FindAndReplaceInput` (delta)

The existing flat input gains three optional fields. Existing fields (`pattern`, `replacement`, `mode`, `case_insensitive`, `subfolder`, `include_code_blocks`, `include_html_comments`, `commit`, `vault`) are unchanged.

| New field | Type | Default | Validation rules | Traces to |
|---|---|---|---|---|
| `file` | `string` (optional) | — | `min(1)`; `isStructurallySafePath` (no leading `/`/`\`, no drive letter, no `..`, no control chars); rejects any value containing `[[` or `]]` (the cohort's `WIKILINK_BRACKET_REJECTION_MESSAGE`) | FR-002, FR-003 |
| `path` | `string` (optional) | — | `min(1)`; `isStructurallySafePath` | FR-002, FR-013 |
| `active_note` | `boolean` (optional) | `false` | boolean | FR-004 |

**Cross-field rule (`superRefine`)** — the scope mutual-exclusivity matrix (D7). Let `single-note = file | path | active_note`:

- `file` and `path` are mutually exclusive (`file+path`).
- `single-note` excludes `subfolder` (`note+folder`).
- `active_note` additionally excludes `file`/`path` (`active+note`), `subfolder` (`active+folder`), and `vault` (`active+vault`).
- `vault` is permitted with a named target (`file`/`path`) — it selects which vault the note lives in.
- Supplying none of the scope fields is the unchanged vault-wide default (FR-014).

**Validation outcome → error** (see [contracts/errors.md](contracts/errors.md)): conflicts → `VALIDATION_ERROR` + `SCOPE_CONFLICT` + reason; `[[…]]` on `file` → `VALIDATION_ERROR` (standard channel); structural-unsafe `file`/`path` → `VALIDATION_ERROR` + `INVALID_NOTE` + `path-traversal`. All emitted at the boundary before any read.

**Inferred type**: `z.infer<typeof findAndReplaceInputSchema>` — remains the single canonical downstream type (Principle III). No hand-written interface.

## Internal entity — `ResolvedScope` (new)

The scope-resolution front end (`resolveSingleNoteScope` + the existing folder/vault-wide branches) emits one internal value that the downstream stages consume:

| Field | Type | Meaning |
|---|---|---|
| `vaultRoot` | `string` | The canonical absolute vault root (post `assertCanonicalPath`). For `active_note`, from the focused-file eval; for named/folder/vault-wide, from the registry or focused-vault eval as today. |
| `eligible` | `string[]` | The vault-relative note paths to scan. Under a single-note scope this is exactly `[relPath]`; under folder/vault-wide it is the directory-walk result (`listEligibleNotes`). |
| `singleNote` | `boolean` | `true` when a single-note scope resolved this value — gates the D8 commit re-scan reuse (no re-walk) vs. the folder/vault-wide re-walk. |

`ResolvedScope` is internal (not part of any published schema); it is the seam between the new front end and the unchanged Stages 4–7.

## Scope-resolution flow (new front end)

```
executeFindAndReplace(input, deps):
  Stage 1' — scope dispatch:
    if input.active_note:
        { vaultRoot, relPath } = resolveActiveFocusedFile(deps, "find_and_replace")   # throws ERR_NO_ACTIVE_FILE
        assertCanonicalPath(vaultRoot, relPath)
        assertEligible(relPath)         # else INVALID_NOTE/not-eligible
        assertExists(vaultRoot, relPath)# else INVALID_NOTE/not-found  (active file should exist; defensive)
        → ResolvedScope{ vaultRoot, eligible:[relPath], singleNote:true }
    elif input.file or input.path:
        vaultRoot = resolveVaultRoot(input, deps)            # existing: registry OR focused-vault eval
        vaultRoot = assertCanonicalPath(vaultRoot, ".")
        relPath = input.path
               ?? resolveFileByTsv(deps, vaultNameFor(input, vaultRoot), input.file)  # bare-name → relPath (D6)
        assertCanonicalPath(vaultRoot, relPath)              # PATH_ESCAPES_VAULT on escape
        assertEligible(relPath)                              # INVALID_NOTE/not-eligible
        assertExists(vaultRoot, relPath)                     # INVALID_NOTE/not-found
        → ResolvedScope{ vaultRoot, eligible:[relPath], singleNote:true }
    else:
        # UNCHANGED — existing subfolder / vault-wide path
        vaultRoot = assertCanonicalPath(resolveVaultRoot(input, deps), ".")
        scanRoot  = subfolder ? assertCanonicalPath+exists(...) : vaultRoot
        → ResolvedScope{ vaultRoot, eligible: listEligibleNotes(scanRoot, vaultRoot), singleNote:false }

  Stage 4 — first scan:   scanNotes(vaultRoot, eligible, input)          # UNCHANGED
  Stage 5 — bound check:  getMaxOccurrences / OCCURRENCE_COUNT_EXCEEDED  # UNCHANGED
  if !commit → preview                                                    # UNCHANGED (affected_notes ≤ 1 here)
  Stage 6 — second scan:  singleNote ? rescan(eligible) : scanNotes(re-walk)   # D8
            drift compare / bound recheck                                 # UNCHANGED
  Stage 7 — per-note atomic write through queue                          # UNCHANGED (≤ 1 note)
```

`vaultNameFor(input, vaultRoot)` = `input.vault` when named, else `resolveVaultDisplayName(deps.vaultRegistry, vaultRoot)` for the focused case (D6).

## Output entities (unchanged)

The discriminated-union output (`mode: "preview" | "commit"`) and its branch shapes are inherited from BI-038 verbatim — no schema change. The single-note scope only constrains the data:

| Entity | Single-note invariant |
|---|---|
| `mode: "preview"` branch — `affected_notes`, `total_occurrences` | `affected_notes` has **≤ 1** entry (FR-009): zero when the pattern matched nothing in the target, one (the target) when ≥ 1 match. |
| `mode: "commit"` branch — `changed_notes`, `total_occurrences_replaced`, `partial` | `changed_notes` has **≤ 1** entry; the open-note path's reported locator is the resolved note's vault-relative path (FR-004 of this spec). |
| `Occurrence`, `AffectedNote` | unchanged shapes. |

## Downstream entities (unchanged)

`scanNotes` / `ScanCounts` / `LineSpan` / `Region` (fence + html-comment scan) / `applyReplacement` / `writeAtomic` are all inherited unchanged. The single-note scope changes only the membership of `eligible` handed to `scanNotes`.

## Error roster (summary — full detail in [contracts/errors.md](contracts/errors.md))

| State | Top-level code | `details.code` | `details.reason` | Gate | New? |
|---|---|---|---|---|---|
| Scope conflict | `VALIDATION_ERROR` | `SCOPE_CONFLICT` | `file+path` / `note+folder` / `active+note` / `active+folder` / `active+vault` | schema `superRefine` | new |
| Missing named note | `VALIDATION_ERROR` | `INVALID_NOTE` | `not-found` | handler existence check | new |
| Ineligible target | `VALIDATION_ERROR` | `INVALID_NOTE` | `not-eligible` | handler eligibility check | new |
| Structural-unsafe `file`/`path` | `VALIDATION_ERROR` | `INVALID_NOTE` | `path-traversal` | schema field refine | new |
| `[[…]]` on `file` | `VALIDATION_ERROR` | — | — | schema field refine (standard channel) | reused |
| No note open (`active_note`) | `ERR_NO_ACTIVE_FILE` | — | — | `resolveActiveFocusedFile` | reused |
| Canonical escape (`path`) | `PATH_ESCAPES_VAULT` | — | — | `assertCanonicalPath` | reused |
| Unknown / closed `vault` | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `unknown` / `not-open` | registry resolve | inherited |
| Bound / drift / pattern / replacement / subfolder | `VALIDATION_ERROR` | (existing `OCCURRENCE_*` / `INVALID_*`) | (existing) | as BI-038 | inherited |
| FS read/write failure | `FS_WRITE_FAILED` | — | `read` / `write` | as BI-038 | inherited |

Every top-level code is pre-existing — zero new top-level codes (Principle IV; FR-016; SC-007). `INVALID_NOTE` and `SCOPE_CONFLICT` are new `details.code` values under the existing `VALIDATION_ERROR` code (ADR-015 sub-discriminators).
