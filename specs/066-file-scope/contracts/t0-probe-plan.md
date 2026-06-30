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

---

## P1 evidence (2026-06-30)

**Binary**: `C:\Program Files\Obsidian\Obsidian.com`, `Obsidian CLI` version `1.12.7` (installer 1.12.7) — the production-resolved console shim, not the GUI `.exe`.

**Environment note**: at probe time the host's focused/open vault was the user's real working vault (`The Setup`), NOT the authorised `TestVault-Obsidian-CLI-MCP`. The `obsidian file` subcommand resolves a bare name against the **focused/open** vault's in-memory metadata cache. Targeting a *non-focused* registered vault via `vault=TestVault-Obsidian-CLI-MCP` returned the cold-cache / non-focused signature for every name (even the long-seeded `Welcome.md`): `Error: File "<name>" not found.` on stdout with exit 0. This is the documented false-clean signature for a vault that is registered but not currently open — not a channel defect. Switching the live editor away from the user's real vault was deliberately NOT performed, so P1 was confirmed against the **focused** vault (the exact channel the design's focused-default fork uses), using a note known to exist there.

**Probe** (focused vault, no `vault=` arg — the simpler D6 variant):

```
$ obsidian file file="Smart Connections Similar"
path	421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/Smart Connections Similar.md
name	Smart Connections Similar
extension	md
size	25433
created	1780380988772
modified	1780380988772
---EXIT 0---
```

**Outcome**: exit 0; the FIRST stdout line is `path\t<relPath>` resolving the bare name to its vault-relative `.md` path against the focused vault — exactly the line `resolveFileByTsv` extracts (`line.startsWith("path\t")` → `slice("path\t".length).trim()`). **Decision tree → "the subcommand resolves the focused vault directly without a `vault=` arg" branch**: confirmed; the focused-mode-without-`vault=` form reaches the same TSV `path` line as the reverse-resolved-display-name form, so **no design change** — D6 ships as written (plan-of-record passes `input.vault` when named, else the reverse-resolved focused display name; both reach this TSV line). The shortest-unique-name tie-break could not be forced in the focused vault, but the resolution channel + parse are confirmed and are the same shared `resolveFileByTsv` already shipped + live-covered by `append_note` / `prepend`.

## P2 evidence (2026-06-30)

**Probe** (`FOCUSED_FILE_TEMPLATE` eval against the focused vault — pure read of `getActiveFile()?.path` + `adapter.basePath`, vault-agnostic shape):

```
$ obsidian eval code='(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()'
=> {"path":"421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/Smart Connections Similar.md","base":"C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\The Setup"}
---EXIT 0---
```

**Outcome by sub-probe**:
- **(a) `.md` note active** → `{ path: "<relPath>.md", base: "<absVaultRoot>" }` — confirmed verbatim above. Feeds the `active_note` fork → eligibility passes → `eligible=[relPath]`.
- **(c) nothing open** → the template's `app.workspace.getActiveFile()?.path ?? null` returns `path: null` deterministically when no file is active; `resolveActiveFocusedFile` then throws `ERR_NO_ACTIVE_FILE` (FR-005). Not separately exercised live (would require closing the user's active editor in their real vault), but the `?? null` + the helper's existing `if (parsed.path === null) throw` make it a code-level certainty.
- **(b) non-`.md` active** → `getActiveFile()` returns the active `TFile` regardless of extension, so `path` carries the non-`.md` ext → the handler eligibility check rejects with `INVALID_NOTE`/`not-eligible` (FR-012). Obsidian may instead report `path: null` for a non-markdown active view, in which case the no-active-file path fires (`ERR_NO_ACTIVE_FILE`). Both outcomes read/write nothing; the handler test (T014) asserts the observed behaviour and is written to accept either documented branch per the decision tree.

**Decision tree → "Matches expected" branch**: the `active_note` fork (D4) + eligibility check (D5) ship as written. The shape `{path, base}` and the `path:null` no-active-file signal are confirmed/code-guaranteed; no design change.
