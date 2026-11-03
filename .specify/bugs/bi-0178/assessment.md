# Bug Assessment: find_and_replace returns a pass-through CLI error for a missing note named by name

- **Slug**: bi-0178
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0178, "Classify missing note")
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Condensed from the BI-0178 report:

> Spec 066 FR-008, the tool description and the help all state that a single-note scope naming a missing note, "by path or by name", fails with `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"` and `details.note`. The name form instead returns a generic `CLI_REPORTED_ERROR` whose only signal is free text in `details.stdout`. A caller branching on `details.code` as documented never matches for the name form, and sees two different shapes for the same condition depending on how it named the note. The safety property holds (nothing is written), so the harm is the error contract. Two resolutions are possible: map the pre-flight not-found to the documented envelope, or change the spec, description and help to the pass-through shape that BI-0171 chose for `patch_heading` / `patch_block`. The owner picks one during clarification; the two must not be left disagreeing.

Evidence given in the report: TC-00784 (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `find_and_replace` with `file: "bi0114-ghost-name"` (no such note) and `commit: true` returned `{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"command":"file","stdout":"Error: File \"bi0114-ghost-name\" not found.\n",…}}`. Nothing was written. The path form (TC-00783) passes with the documented envelope.

The report's expected behaviour ("Classify missing note") asks for the same documented error for both forms:

- A missing note named by name fails with the same error category and the same specific reason as the path form, as the documentation states.
- A missing note named by path keeps today's error.
- The error names the note that was not found ("ghost").
- Nothing is created or changed, and no confirmation prompt appears.

Out of scope per the report: folder or vault-wide scope, names matching several notes, and the error shape of other note-scoped tools.

No URL was supplied, so the URL Trust Policy did not apply.

## Symptom

`find_and_replace` with a single-note `file` scope naming a note that does not exist fails with a pass-through `CLI_REPORTED_ERROR` carrying Obsidian's `Error: File "<name>" not found.` line, from the name-resolution pre-flight. The documented and specified result is `VALIDATION_ERROR` with `details.code: "INVALID_NOTE"`, `details.reason: "not-found"` and `details.note`, which the `path` form already returns.

## Reproduction

1. In the authorised test vault, make sure no note named `ghost` exists.
2. Call `find_and_replace` with `vault: "<test vault>"`, `file: "ghost"`, `pattern: "x"`, `replacement: "y"` (preview or `commit: true`).
3. Observe `code: "CLI_REPORTED_ERROR"`, `details.command: "file"`, Obsidian's not-found line in `details.stdout` / `details.message`, and no `details.code`.
4. Repeat with `path: "Folder/ghost.md"`: observe `VALIDATION_ERROR` + `INVALID_NOTE` / `not-found` + `details.note: "Folder/ghost.md"`.

## Suspected Code Paths

- `src/tools/find_and_replace/handler.ts:474-486` (`resolveSingleNoteScope`, `file` branch) — the defect. It calls `resolveFileByTsv(deps, vaultName, input.file, "find_and_replace")`. When Obsidian answers `Error: File "<name>" not found.` (exit 0), dispatch raises `CLI_REPORTED_ERROR` with that line as `details.message`, and the handler lets it propagate. The documented `INVALID_NOTE` / `not-found` check (`assertExists`, line 496) is never reached on the name form.
- `src/tools/find_and_replace/handler.ts:430-443` (`assertExists`) — builds the documented envelope for the `path` form (FR-008). The name form should produce the same envelope.
- `src/tools/_active-file.ts:271` (`FILE_NOT_FOUND_LINE`) and `:278-296` (`findFileByTsv`) — the lookup module already owns Obsidian's miss signature: `findFileByTsv` returns `null` only for that not-found line and propagates every other failure (BI-0176; `.memory/refactor-decisions.md` item 51: the lookup owns its miss signature, do not re-match the line in a handler).
- `src/tools/find_and_replace/index.ts:30` (`FIND_AND_REPLACE_DESCRIPTION`) — already says "A named target that does not exist → `INVALID_NOTE`/`not-found`". No change needed under the preferred fix.
- `docs/tools/find_and_replace.md:131` — the help's error table already documents `INVALID_NOTE` / `not-found` for "named `file`/`path`". No change needed under the preferred fix.
- `specs/066-file-scope/spec.md` FR-008 — the requirement the code misses ("by path or by name").
- `src/tools/find_and_replace/scope.test.ts:143-165` — pins the path form only; there is no test for the name form's not-found.

## Root Cause Hypothesis

Spec 066 added the `file` locator by reusing the cohort's `resolveFileByTsv` lookup, which turns a name into a path through `obsidian file`. When the name matches no note, the lookup fails before the handler has a path, so the handler's own existence check (`assertExists`), which produces the FR-008 envelope, never runs. The `path` form skips the lookup and reaches `assertExists`, which is why it passes. No test covered the name form's miss, so the gap shipped. Confidence: high — the code path, the field evidence and the passing path-form test agree.

## Proposed Remediation

**Preferred** (owner ruling Q1 = A; map the pre-flight not-found to the documented envelope; matches the report's acceptance criteria and the published spec, description and help): in `resolveSingleNoteScope`'s `file` branch, call `findFileByTsv` instead of `resolveFileByTsv`. A `null` result (Obsidian reported the name as not found) throws the same envelope `assertExists` builds: `VALIDATION_ERROR`, `details: { code: "INVALID_NOTE", reason: "not-found", note: <input.file as given> }`, message `find_and_replace: note "<name>" does not exist in vault`. `details.note` carries the offending input, as FR-008 states ("the offending input"), so the AC "names `ghost`" holds. Every other lookup failure (unknown vault, TSV parse, binary not found) keeps propagating unchanged. To keep one envelope for both forms, factor the error construction out of `assertExists` into a small builder (for example `noteNotFound(note, cause)`) that both the path probe and the name miss use; the name miss passes `cause: null` (the lookup's error is consumed by `findFileByTsv`, as for `write_note`). The failure is raised inside `resolveScope`, which runs before the commit-confirmation step (`handler.ts:593` vs `:664`; the early `requireConfirmable` at `:590` does not fire for a single-note scope), so no note is read or written and no confirmation prompt appears. The description, help and spec already describe this behaviour, so the published surface and the registry fingerprint baseline do not change.

**Alternatives**:
- *Adopt BI-0171's pass-through shape* (leave the code, change FR-008, `FIND_AND_REPLACE_DESCRIPTION` and `docs/tools/find_and_replace.md` to say a name that matches no note returns Obsidian's own `CLI_REPORTED_ERROR`, like `read`, `patch_heading` and `patch_block`). Consistent with the editors and the readers for the same name, but it keeps two shapes for one condition inside `find_and_replace` (path → `INVALID_NOTE`, name → pass-through), which is the report's stated harm, contradicts its acceptance criteria, and moves the description fingerprint. Not preferred.
- *Catch the lookup's error in the handler and regex-test `details.message` against `FILE_NOT_FOUND_LINE`*. Same behaviour as the preferred fix, but re-matches the miss signature in a handler, which `.memory/refactor-decisions.md` item 51 rules out in favour of `findFileByTsv`. Rejected.

**Files likely to change**:
- `src/tools/find_and_replace/handler.ts`
- `src/tools/find_and_replace/scope.test.ts` (or `handler.test.ts`, beside the existing single-note scope cases)
- Attribution / header comment of `handler.ts` if it lists the single-note failure shapes

**Tests to add or update**:
- Name miss, preview: `file: "ghost"`, the lookup answers `fileNotFoundResponse` (`Error: File "ghost" not found.`, exit 0, from `_handler-test-fixtures.ts`) → `VALIDATION_ERROR`, `details` deep-equal `{ code: "INVALID_NOTE", reason: "not-found", note: "ghost" }`, no fs read, no write, one spawn.
- Name miss, `commit: true` with a confirming client: same envelope, no write and no confirmation requested (the elicitation stub is never called).
- Parity: the name-miss and path-miss `details` have the same keys and `code` / `reason` values.
- Other lookup failures still propagate: a lookup answer with no path line still fails with `CLI_REPORTED_ERROR` `stage: "file-tsv-parse"`.
- Path miss unchanged: the existing `scope.test.ts:143` case keeps passing as is.
- Live check per `.memory/test-execution-instructions.md` (in `/speckit-bug-test`): repeat TC-00784 (`file: "<ghost name>"`, `commit: true`) and TC-00783 (`path` form) in the authorised test vault; confirm both return the documented envelope and nothing is written.

## Risks & Considerations

- **Behaviour change for callers who adapted to the bug**: a caller matching Obsidian's not-found text in `details.stdout` for `find_and_replace` no longer sees it. The documented contract never promised that shape, so this is a fix; note it in the CHANGELOG.
- **Cross-tool divergence**: after the fix, a missing name gives `INVALID_NOTE` / `not-found` in `find_and_replace` but Obsidian's pass-through `CLI_REPORTED_ERROR` in `read`, `append_note`, `prepend`, `patch_heading` and `patch_block` (BI-0171's choice). That divergence already exists for the path form and is what spec 066 specified; aligning other tools is out of this report's scope.
- **Ambiguous names**: Obsidian's `file` command resolves a name matching several notes by its own rule; that case is out of scope and unchanged.
- **Zero new error codes**: the fix reuses `VALIDATION_ERROR` and the existing `INVALID_NOTE` sub-code (Constitution Principle IV, ADR-015).
- **Docs**: the published description, help and spec already state the fixed behaviour; `/speckit-docs-as-code` should check whether `.docs-as-code/capabilities/mutate.md` describes the single-note failure shapes.

## CodeGraph structural check

- **Affected module**: `src/tools/find_and_replace/` only — `resolveSingleNoteScope` and `assertExists` in `handler.ts`, reached through `resolveScope` from `executeFindAndReplace`, whose caller is the tool registration in `find_and_replace/index.ts`. `findFileByTsv` and `FILE_NOT_FOUND_LINE` in `src/tools/_active-file.ts` are reused, not changed; `resolveFileByTsv` keeps its other callers (`_file-target.ts`, `_active-file.ts`) unchanged.
- **Blast radius**: the `find_and_replace` single-note `file` scope's miss path only. Its tests (`scope.test.ts`, `handler.test.ts`, `confirm.test.ts`, `__t0-driver.test.ts`) cover `resolveScope` through `executeFindAndReplace`. The `path`, `active_note`, folder and vault-wide scopes do not change. The input and output schemas, `FIND_AND_REPLACE_DESCRIPTION` and the registry fingerprint baseline do not change.
- **Kernel nodes**: the fix touches none of them. `createLogger()` and `createQueue()` stay confined to `server.ts` and reach the handler through `ExecuteDeps`; `UpstreamError` is constructed with an existing code (`VALIDATION_ERROR`) and sub-code (`INVALID_NOTE` / `not-found`), not changed; `createServer()` is not touched.

## Open Questions

- **Q1 — Which resolution?** The report leaves the choice to the owner; it must not be left with code and docs disagreeing.

  Context: the name form fails inside `resolveFileByTsv` (`src/tools/_active-file.ts:242`), called from `resolveSingleNoteScope` (`src/tools/find_and_replace/handler.ts:484`), before `assertExists` (`:430`), which builds the documented envelope for the path form. `findFileByTsv` (`_active-file.ts:278`) already recognises Obsidian's miss and is used by `write_note` (BI-0176). BI-0171 chose pass-through for `patch_heading` / `patch_block` (spec 089 Clarifications).

  | Option | Description |
  |--------|-------------|
  | A (recommended) | Map the name-form miss to the documented `VALIDATION_ERROR` + `INVALID_NOTE` / `not-found` + `details.note`, via `findFileByTsv`. Code and tests only; spec, description and help unchanged. |
  | B | Keep the pass-through `CLI_REPORTED_ERROR` and change spec 066 FR-008, the tool description (fingerprint moves) and the help to document it, matching BI-0171. |

  Recommended: **A**. It is what the report's expected behaviour and acceptance criteria ask for (same category and reason as the path form, naming the note), what FR-008 and the published docs already promise, and it gives one shape for one condition inside the tool without touching the published surface.

  Resolved (Relay): **A**, owner ruling 2026-11-03, also recorded in the BI-0178 Impact section. The name form returns the documented envelope, the same as the path form: `VALIDATION_ERROR`, `details.code: "INVALID_NOTE"`, `details.reason: "not-found"`, `details.note` = the name as given. Spec 066 FR-008, `FIND_AND_REPLACE_DESCRIPTION` and `docs/tools/find_and_replace.md` stay unchanged; only code and tests change. BI-0171's pass-through shape is not adopted here. This is the Preferred remediation above, so the root cause, remediation, files and tests stand as written.
