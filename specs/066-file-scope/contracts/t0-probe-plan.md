# T0 Probe Plan: File Scope

**Feature**: `066-file-scope` · Implement-time live-CLI verification gates. Per [.memory/test-execution-instructions.md](../../../.memory/test-execution-instructions.md): drive the production-resolved `Obsidian.com` shim (NOT the GUI `Obsidian.exe`), against the authorised TestVault scratch subdir. Both probes **verify** resolution channels the design already assumes (research D4 / D6); neither forks the design.

---

## P1 — Focused bare-name `file` resolution

**Question**: does `obsidian file file=<bare-name>` resolve a plain note name to a vault-relative path (shortest-unique-name) against the focused vault, with no `vault=` arg?

**Setup**: TestVault focused, containing a uniquely-named note (e.g. `T0 Probe Note.md`) in a known subfolder, plus a same-basename collision elsewhere if available (to probe shortest-unique-name).

**Probe**: run the `file` subcommand the way `resolveFileByTsv` does — `file file=<name>` — capture stdout (TSV), exit code, stderr.

**Expected**: exit 0; stdout contains a `path\t<relPath>` line resolving to the correct note (shortest-unique-name when ambiguous). This confirms D6's plan-of-record (reverse-resolve the focused display name, then `resolveFileByTsv`) reaches the right note.

**Decision tree**:
- Confirmed → D6 plan-of-record ships as written.
- If the subcommand resolves the focused vault directly without a `vault=` arg (or via the focused display name) → both reach the same TSV `path` line; record which form is used, no design change.
- If it cannot resolve a bare name against the focused vault at all → fall back to requiring `file` callers to be in the focused vault context the cohort already uses; record and revisit (low likelihood — the cohort's `append_note`/`prepend` already resolve bare names this way).

## P2 — Focused-file eval shape (`active_note` fork)

**Question**: what does `obsidian eval` of `FOCUSED_FILE_TEMPLATE` return for (a) a `.md` note open, (b) a non-`.md` file active, (c) nothing open?

**Setup**: TestVault focused. Three sub-probes — open a `.md` note; open/activate a non-`.md` file (PDF or `.canvas`) if the environment allows; close all notes.

**Probe**: eval `FOCUSED_FILE_TEMPLATE` (`{path: getActiveFile()?.path ?? null, base: adapter.basePath}`), capture the parsed `{path, base}`.

**Expected**:
- (a) `.md` open → `{ path: "<relPath>.md", base: "<absVaultRoot>" }`. Feeds the `active_note` fork → eligibility passes → `eligible=[relPath]`.
- (b) non-`.md` active → `{ path: "<relPath>.<ext>", base: … }` with a non-`.md` ext → the handler's eligibility check rejects with `INVALID_NOTE`/`not-eligible` (FR-012). (If Obsidian reports `path: null` for a non-markdown active view, the no-active-file path fires instead — record which.)
- (c) nothing open → `{ path: null, base: … }` → `resolveActiveFocusedFile` throws `ERR_NO_ACTIVE_FILE` (FR-005).

**Decision tree**:
- Matches expected → the `active_note` fork (D4) + eligibility check (D5) ship as written.
- If (b) returns `path: null` for non-`.md` views → the non-`.md` case collapses into the no-active-file path; note it in the handler test (the user sees `ERR_NO_ACTIVE_FILE` rather than `INVALID_NOTE`/`not-eligible` for that sub-case). Either way nothing is read or written. Record the observed behaviour and assert it in `handler.test.ts`.

---

## Notes

- Both probes are **read-only** against the vault (the `file` subcommand and the eval do not mutate). No cleanup beyond the standard scratch-subdir discipline is needed.
- The probes pin the two resolution channels; the scan/commit machinery is inherited unchanged from BI-038 and already has live T0 coverage from that BI — no re-probe of the write path is required for this feature.
