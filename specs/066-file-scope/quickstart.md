# Quickstart: File Scope

**Feature**: `066-file-scope` · Manual validation scenarios against the authorised TestVault (per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md)). Each scenario maps to a user story and its acceptance criteria. Run after the unit suite is green and the T0 probes ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)) are confirmed.

## Setup

A vault where a shared pattern (e.g. `STATUS`) appears in several notes across multiple folders — say `Inbox/A.md`, `Projects/B.md`, `Archive/C.md` — plus one note `Projects/Target.md` that also contains it. Snapshot every note's content + mtime before each scenario.

---

## US1 — Single named note (P1)

1. **Preview by path**: `{ pattern: "STATUS", replacement: "STATE", path: "Projects/Target.md" }`.
   - Expect `mode: "preview"`, `affected_notes` references **only** `Projects/Target.md`, `≤ 1` entry. No other note in the response.
   - Verify every other note's content + mtime unchanged. *(SC-001, SC-002, US1-AC1)*
2. **Commit by path**: same input + `commit: true`.
   - Expect `mode: "commit"`, `changed_notes: ["Projects/Target.md"]`. Only that note changed on disk; all others byte-for-byte + mtime unchanged. *(US1-AC2)*
3. **Preview by bare name**: `{ pattern: "STATUS", replacement: "STATE", file: "Target" }`.
   - Expect the same single-note result as step 1 — name resolves identically to `write_note`/`append_note`. *(US1-AC4, US1-AC5, SC-006)*
4. **Bracketed link rejected**: `{ pattern: "x", replacement: "y", file: "[[Target]]" }`.
   - Expect `VALIDATION_ERROR` with the wikilink-bracket message; nothing read or changed. *(US1-AC6, SC-006)*
5. **Zero-match success**: `{ pattern: "ZZZ-absent", replacement: "y", path: "Projects/Target.md" }`.
   - Expect `mode: "preview"`, `affected_notes: []`, `total_occurrences: 0` — a success, not an error. *(spec Edge Cases)*

## US2 — Currently-open note (P2)

6. **Open `Projects/Target.md` in the editor**, then preview: `{ pattern: "STATUS", replacement: "STATE", active_note: true }`.
   - Expect `mode: "preview"`, the single entry's `path` = `Projects/Target.md` (the response reports the open note's location), `≤ 1` entry. *(US2-AC1, SC-003)*
7. **Commit the open note**: same + `commit: true`. Only the open note changes on disk. *(US2-AC1)*
8. **Close all notes**, then `{ pattern: "STATUS", replacement: "STATE", active_note: true }`.
   - Expect `ERR_NO_ACTIVE_FILE` telling the caller to open a note or name one; nothing read or changed. *(US2-AC2, SC-003)*

## US3 — Conflicting / unresolvable scopes (P3)

9. **Single-note + folder**: `{ pattern: "x", replacement: "y", path: "Projects/Target.md", subfolder: "Projects" }`.
   - Expect `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `note+folder`; nothing read or changed. *(US3-AC1, SC-004)*
10. **Open-note + named**: `{ pattern: "x", replacement: "y", active_note: true, file: "Target" }`.
    - Expect `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `active+note`; nothing read. *(US3-AC2, SC-004)*
11. **Open-note + folder**: `{ …, active_note: true, subfolder: "Projects" }` → `SCOPE_CONFLICT` / `active+folder`. *(US3-AC3)*
12. **Open-note + vault**: `{ …, active_note: true, vault: "Work" }` → `SCOPE_CONFLICT` / `active+vault`. *(spec Edge Cases)*
13. **Missing named note**: `{ pattern: "x", replacement: "y", path: "Projects/Ghost.md" }`.
    - Expect `VALIDATION_ERROR` / `INVALID_NOTE` / `not-found` naming `Projects/Ghost.md`; nothing changed. *(US3-AC4, SC-004)*
14. **Ineligible target**: name a `.canvas`/`.base` or a note under `.obsidian/` → `VALIDATION_ERROR` / `INVALID_NOTE` / `not-eligible`. *(FR-012, spec Edge Cases)*

## Backward compatibility

15. **Unscoped vault-wide**: `{ pattern: "STATUS", replacement: "STATE" }` (no scope fields).
    - Expect the existing vault-wide behaviour — every eligible note with a match is in the preview, exactly as before this feature. *(FR-014, SC-005)*
16. **Folder scope**: `{ …, subfolder: "Projects" }` — unchanged folder behaviour. *(FR-014, SC-005)*

## Guards still fire under single-note

17. **Bound**: with `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` set below the target note's match count, a single-note preview/commit refuses with `OCCURRENCE_COUNT_EXCEEDED`; no note modified. *(FR-011)*
18. **Drift**: edit the target note between a single-note preview and commit so the count changes → commit refuses with `OCCURRENCE_COUNT_DRIFT`; no note modified. *(FR-011)*
