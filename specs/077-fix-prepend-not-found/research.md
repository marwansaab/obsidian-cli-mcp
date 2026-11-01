# Research: Report Missing Notes on Add-to-Top

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-01

All Technical Context unknowns are resolved below. Findings (F) record what is true at HEAD `f60d1f0` and what the live probe showed; decisions (D) record what this BI does and why.

## Findings

### F1 — prepend's current missing-note path

`executePrepend` (`src/tools/prepend/handler.ts`) resolves the target with `resolveFsTarget`, runs the file-type check and `assertCanonicalPath`, then:

1. `fs.stat(absPath)`. On `ENOENT` it **swallows** the error and sets `preCallSize = 0`. The comment says "upstream's NOTE_NOT_FOUND classification is the contract surface for that case (FR-016)".
2. In default mode, `fs.readFile(absPath)`. `ENOENT` leaves `before = null` for the same reason; any other errno fails with `FS_WRITE_FAILED` `{ errno, syscall: "open", path }` before Obsidian is called (spec 076).
3. `invokeCli({ command: "prepend", … })`. Any `UpstreamError` goes to `classifyUpstreamFailure`, which builds a haystack of `details.stdout`, `details.stderr` and `details.message` and tests it against `NOTE_NOT_FOUND_PATTERNS`, then `EDITOR_CONFLICT_PATTERNS`; anything else is rethrown with its own code plus `details.stage: "prepend-cli"`.

`NOTE_NOT_FOUND_PATTERNS` are `/note not found/i`, `/file not found/i`, `/no such file/i`, `/does not exist/i`. The comment marks them as **placeholders** to be replaced with a T0-confirmed value; that replacement never happened. None of them matches Obsidian's real output (F2), because Obsidian puts the quoted path between "File" and "not found".

### F2 — T0 live probe of Obsidian's `prepend` against a missing note

Run 2026-11-01 against the production-resolved `Obsidian.com` shim, stdout and stderr captured separately, per `.memory/test-execution-instructions.md`.

| Case | argv (after `prepend vault=TestVault-Obsidian-CLI-MCP`) | exit | stdout | stderr |
|------|------|------|--------|--------|
| P1 missing note | `path=Sandbox/T0-077-missing.md content=x` | 0 | `Error: File "Sandbox/T0-077-missing.md" not found.` + LF | empty |
| P2 missing folder | `path=Sandbox/T0-077-nofolder/missing.md content=x` | 0 | `Error: File "Sandbox/T0-077-nofolder/missing.md" not found.` + LF | empty |
| P3 inline | `path=Sandbox/T0-077-missing.md content=x inline` | 0 | `Error: File "Sandbox/T0-077-missing.md" not found.` + LF | empty |
| P4e case mismatch | `path=Sandbox/t0-077-case2.md content=y` (note exists as `Sandbox/T0-077-Case2.md`) | 0 | `Error: File "Sandbox/t0-077-case2.md" not found.` + LF | empty |
| P4d exact case (control) | `path=Sandbox/T0-077-Case2.md content=x` | 0 | `Prepended to: Sandbox/T0-077-Case2.md` + LF | empty |

Observations:

- The wording is `Error: File "<path as supplied>" not found.` on **stdout**, exit 0, LF-terminated, in both default and inline mode. The dispatch layer's priority (c) turns any stdout starting with `Error:` into `CLI_REPORTED_ERROR` with `details.stdout` and `details.message`, so the line reaches `classifyUpstreamFailure` intact.
- No file or folder was created for P1–P3 (checked on disk across every registered vault).
- Obsidian's vault paths are case-sensitive: P4e reports the note missing although a file differing only in case exists. On Windows and default macOS, `fs.stat` of the wrong-case path succeeds, so only Obsidian's report can reveal this case (spec FR-001b).

**Probe-environment note.** `TestVault-Obsidian-CLI-MCP` was not the vault open in Obsidian during the probe, and the CLI ran the commands against the open vault (`My-Setup-Vault`) despite `vault=`: the P4d fixture created through `obsidian create` landed in `My-Setup-Vault/Sandbox/`. The fixture (`T0-077-Case2.md`, content `x\nabc`) and the `Sandbox/` folder it created there were this probe's own artefacts, identified by name, content and creation time, and were removed; the TestVault fixture `Sandbox/T0-077-Case.md` was removed too. Nothing else was touched. The wording finding is unaffected, since it comes from the same CLI. The wrapper itself is not exposed to this for the pre-call check (D1), because it stats the file under the vault root the registry resolves, not under whichever vault is open. The live check in [quickstart.md](quickstart.md) therefore opens the test vault in Obsidian first.

### F3 — add-to-end's missing-note shape (the parity target)

`executeAppendNote` (`src/tools/append_note/handler.ts`) reads the note before writing. On `ENOENT` it throws:

```text
UpstreamError {
  code: "CLI_REPORTED_ERROR",
  cause: <the fs ENOENT error>,
  details: { code: "NOTE_NOT_FOUND", path: relPath, vault: input.vault ?? null },
  message: `Note "${relPath}" not found in vault.`,
}
```

prepend's existing classifier already builds the same `details` keys and the same message, with `vault: vaultDisplayName`. In specific mode `resolveFsTarget` returns `vaultDisplayName: input.vault!`, so the two values are identical. In active mode they differ: append_note echoes `null`, prepend echoes the resolved display name. Active mode reaches the missing-note case only through a race (the focused note removed before the write).

### F4 — precedent for a pre-flight not-found check

`executeQueryBase` (`src/tools/query_base/handler.ts`) stats the `.base` file before calling Obsidian and maps `ENOENT` to `CLI_REPORTED_ERROR` `details.code: "BASE_NOT_FOUND"`, then also classifies Obsidian's own report after the call. That is the two-layer shape this BI adopts (clarification Q1).

### F5 — tests and fixtures

- `_handler-fixtures.ts` `fakeFs`: `stat` succeeds by default (replaying `sizes`), so every existing test that feeds a not-found upstream reply still reaches Obsidian and exercises the upstream layer. They keep passing unchanged.
- Existing NOT_FOUND tests (`handler.test.ts` "US1 + US2 NOTE_NOT_FOUND (FR-016)", the active-mode case, and `handler.empty-body.test.ts` "pre-read ENOENT → upstream NOTE_NOT_FOUND") use fictional wordings (`Error: Note not found.`, `No such file: missing.md`) that match the placeholder patterns. None uses Obsidian's real wording, which is why the defect went unnoticed.
- `_typed-result-fixtures.ts` uses prepend's `fakeFs` with a succeeding `stat`; unaffected.
- **One existing test encodes the behaviour this BI replaces.** `handler.test.ts` "US1 pre-stat errno handling (FR-016 absent-target)" → "pre-stat ENOENT → preCallSize defaults to 0, call proceeds and succeeds (FR-016)" makes the first `stat` throw `ENOENT`, has Obsidian reply `PREPEND_OK`, and expects a success envelope with `bytes_written: 42`. Obsidian never creates a missing note (F2, P1–P3), so that success is unreachable in practice; the test is the missing-note case itself, and FR-001a reverses it. It is rewritten in place to expect the missing-note failure with no spawn. Its sibling, "pre-stat non-ENOENT errno (EACCES) → re-thrown verbatim", stays unchanged (FR-007).

### F6 — published surface

`PREPEND_DESCRIPTION` already lists `NOTE_NOT_FOUND`. `docs/tools/prepend.md` already documents the `CLI_REPORTED_ERROR` / `NOTE_NOT_FOUND` row, but does not say which fields `details` carries, what the message is, or that a plainly missing note is reported before Obsidian is called. No schema, description or annotation needs to change, so the registration fingerprint baseline does not move.

## Decisions

### D1 — Pre-call check fails with NOTE_NOT_FOUND before Obsidian is called (FR-001a)

**Decision**: the existing pre-call `fs.stat` `ENOENT` branch throws the missing-note failure instead of defaulting `preCallSize` to 0. `cause` is the fs error.

**Rationale**: it mirrors append_note's pre-write check (F3) and query_base's pre-flight (F4); the stat already exists and already runs in both default and inline mode; Obsidian is never asked to act on a note the wrapper knows is absent, so "no note created" no longer depends on Obsidian's behaviour; and the check is immune to the open-vault routing seen in F2.

**Alternatives considered**: fail on the pre-call `readFile` `ENOENT` instead (rejected: inline calls skip the read, so it would not cover inline mode); a new separate existence check (rejected: the stat already is one).

A `readFile` `ENOENT` after a successful stat (note removed between the two) keeps today's behaviour: Obsidian is called and its report is recognised by D2.

### D2 — Recognise Obsidian's confirmed wording (FR-001b, FR-009)

**Decision**: add one pattern for the T0-confirmed line, anchored like `COLD_START_PATTERN` in the dispatch layer: `/^\s*Error: File ".*" not found\.\s*$/m`. The greedy `.*` keeps a path that itself contains `"` (legal on Linux and macOS) inside the match; the end anchor keeps the line whole. The comment above `NOTE_NOT_FOUND_PATTERNS` records the T0 confirmation (F2) and that the other entries are kept unconfirmed for FR-007.

**Rationale**: the pattern names the subject (`File`) and requires the quoted path, so `Error: Folder "x" not found.`, `Vault not found.` and the cold-start `Error: Command "prepend" not found.` cannot match (FR-007).

**Alternatives considered**: require the quoted path to equal `relPath` (rejected: adds a coupling to Obsidian's echo format with no failure it would prevent); remove the four placeholder patterns (rejected: an output they match today would then be reported differently, which FR-007 and the spec's Out of Scope rule out; removal belongs to a separate item if wanted).

### D3 — One builder for the missing-note failure

**Decision**: a small module-private function in `prepend/handler.ts`, `noteNotFound(relPath, vaultDisplayName, cause)`, returns the `UpstreamError`; D1 and the existing classifier branch both use it, so the two layers cannot drift apart.

**Rationale**: two call sites with one exact shape (FR-004). Kept inside prepend: changing append_note is out of scope, and a shared helper across tool modules would touch `append_note`.

### D4 — `details.vault` stays the resolved display name

**Decision**: both layers echo `vaultDisplayName`, as prepend's classifier does today.

**Rationale**: in specific mode it equals `input.vault` (F3), so FR-004 parity with append_note is exact. In active mode it gives the agent the vault name it needs for recovery (User Story 3), where append_note's `null` does not; changing either tool's active-mode echo is outside this BI. The spec's Assumptions record the active-mode difference; Follow-ups list it.

### D5 — Documentation

`docs/tools/prepend.md`: the `NOTE_NOT_FOUND` row gains the `details` fields (`path`, `vault`), the message, and the two detection points (before Obsidian is called; or Obsidian's report, for a case mismatch or a note removed in between). `CHANGELOG.md` `[Unreleased]` gets a `Fixed` entry. The handler's intent header and the stat comment are updated (Principle V). `.docs-as-code/` is updated by `/speckit-docs-as-code <n>` after review.

### D6 — Live verification

Re-run P1, P3 and P4e through the MCP server (`prepend`) and P1 through `append_note`, with the test vault open in Obsidian, and compare the two failures field by field ([quickstart.md](quickstart.md)).
