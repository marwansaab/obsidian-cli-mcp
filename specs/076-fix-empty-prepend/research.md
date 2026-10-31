# Research: Fix Empty-Note Insertion

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-31

## Findings

### F1 — `prepend` hands the whole write to Obsidian

`executePrepend` (`src/tools/prepend/handler.ts:127`) resolves the target, checks the file type and the canonical path, stats the note, calls `invokeCli({ command: "prepend", parameters: { path, content }, flags: inline ? ["inline"] : [] })` (`handler.ts:158`), stats the note again, and reports `postCallSize − preCallSize` as `bytes_written`. It never reads or writes the note's bytes itself. The only post-write failure is `FS_WRITE_FAILED` with `details.reason: "post-stat-byte-delta-zero"` when the size did not grow (`handler.ts:183`).

This pipeline was chosen in spec 045 (research R1) because spec 045's FR-005b forbids a wrapper-side YAML frontmatter parser: where the text lands relative to the properties block is decided by Obsidian, not by the wrapper. ADR-009's 2026-05-26 amendment records the same reasoning ("the choice was forced by FR-005b's frontmatter-detection ban").

### F2 — T0 live probe: what Obsidian's `prepend` actually writes

Run on 2026-10-31 against the authorised test vault `TestVault-Obsidian-CLI-MCP`, under `Sandbox/probe-076-<timestamp>/`, driving bare `obsidian` (which resolves to `Obsidian.com`) through Node `spawnSync` with `shell: false`, the same argv shape as `assembleArgv`. Fixtures were seeded and read back through `obsidian eval` (`app.vault.create`, `app.vault.adapter.read`), so the bytes shown are the bytes on disk. The probe folder was removed afterwards with `app.vault.adapter.rmdir(…, true)`, and a listing confirmed no `probe-076` folder remained.

Every call exited 0 with stdout `Prepended to: <path>`.

| Case | Note before | `content` | `inline` | Note after |
|---|---|---|---|---|
| empty-default | `""` | `"first"` | no | `"first\n"` |
| empty-inline | `""` | `"first"` | yes | `"first"` |
| empty-lfcontent | `""` | `"first\n"` | no | `"first\n\n"` |
| empty-crlfcontent | `""` | `"first\r\n"` | no | `"first\r\n\n"` |
| fm-default | `"---\nkey: v\n---\n"` | `"Lead"` | no | `"---\nkey: v\n---\nLead\n"` |
| fm-inline | `"---\nkey: v\n---\n"` | `"Lead"` | yes | `"---\nkey: v\n---\nLead"` |
| fm-lfcontent | `"---\nkey: v\n---\n"` | `"Lead\n"` | no | `"---\nkey: v\n---\nLead\n\n"` |
| fm-noeol | `"---\nkey: v\n---"` | `"Lead"` | no | `"---\nkey: v\n---Lead\n"` |
| fm-crlf | `"---\r\nkey: v\r\n---\r\n"` | `"Lead"` | no | `"---\r\nkey: v\r\n---\r\nLead\n"` |
| fm-blankbody | `"---\nkey: v\n---\n\n"` | `"Lead"` | no | `"---\nkey: v\n---\nLead\n\n"` |
| body-abc | `"abc"` | `"def"` | no | `"def\nabc"` |
| body-abc-lfcontent | `"abc"` | `"def\n"` | no | `"def\n\nabc"` |
| body-x-lf | `"x\n"` | `"x"` | no | `"x\nx\n"` |
| fm-body | `"---\nkey: v\n---\nbody"` | `"Lead"` | no | `"---\nkey: v\n---\nLead\nbody"` |
| fm-body-lfcontent | `"---\nkey: v\n---\nbody"` | `"Lead\n"` | no | `"---\nkey: v\n---\nLead\n\nbody"` |
| nl-only | `"\n"` | `"first"` | no | `"first\n\n"` |
| crlf-body | `"abc\r\n"` | `"def"` | no | `"def\nabc\r\n"` |

**Model of Obsidian's behaviour**, consistent with every row: Obsidian picks an insertion point `k` (0 without a properties block, the end of the closing `---` with one) and writes `before[0:k] + content + "\n" + before[k:]` by default, or `before[0:k] + content + before[k:]` with `inline`. The added line break is always a single LF, whatever the note's line endings and whether or not `content` already ends with a line break.

Consequences for this feature:

- **The defect is confirmed** for empty notes (`"first"` → `"first\n"`) and **also present** for properties-only notes (`…---\nLead\n`). `bytes_written` counts the extra byte in both cases.
- **`inline: true` is already correct** for both empty and properties-only notes: Obsidian adds nothing.
- A note with no body is exactly the case `k = before.length`; the extra byte is then always the final byte of the note.

### F3 — Documentation drift outside this feature's scope

The probe also shows that two statements in `docs/tools/prepend.md` *Separator behaviour* are wrong for notes that already have content:

- "`\n` (LF-trailing): The content's trailing `\n` IS the separator — no additional separator inserted", with the worked example `"abc"` + `"def\n"` → `"def\nabc"`. Obsidian writes `"def\n\nabc"` (row body-abc-lfcontent).
- "A separator matching the note's existing line-ending convention (LF or CRLF)". Obsidian always inserts LF (row crlf-body: `"def\nabc\r\n"`).

The spec puts separator behaviour for notes with content out of scope, so this feature does not change it. Recorded as a follow-up in [plan.md](plan.md).

### F4 — The building blocks already exist

- `writeAtomic` and `sizeChange` (`src/tools/_note-io.ts:31`, `:51`) and `invalidateMetadataCache` (`_note-io.ts:100`) are the direct-write cohort's shared substrate, used by `append_note`, `patch_heading`, `patch_block`, `write_note` and `find_and_replace`.
- `getErrno` (`src/tools/_fs-errors.ts`) is already imported by `prepend/handler.ts`.
- `executeAppendNote` (`src/tools/append_note/handler.ts:55`) shows the cohort pattern: `readFile` → edit → `writeAtomic` → `invalidateMetadataCache`.
- prepend's `ExecuteDeps` already carries `logger`, `queue`, `spawnFn` and `env`, so it satisfies `EvalDeps` (`src/tools/_active-file.ts:39`) without change.

### F5 — Tests and fixtures

`src/tools/prepend/_handler-fixtures.ts` `fakeFs` implements `ExecuteFs` with `realpath` and a `stat` that replays a `sizes` sequence, and is shared by `handler.test.ts` (893 lines), `handler.bi047.test.ts`, `handler.file-type.test.ts` and the prepend entry of `src/tools/_typed-result-fixtures.ts`. Several tests count stat calls (`handler.test.ts:86` asserts exactly two). Any new `ExecuteFs` member must get a default in `fakeFs` that leaves those tests' behaviour unchanged.

### F6 — Published surface

The fix changes no input schema, output schema, tool description or annotation, so no `_register-baseline.json` fingerprint moves. The only published change is one new `details.reason` value under the existing `FS_WRITE_FAILED` code (clarification Q1), documented in `docs/tools/prepend.md`.

## Decisions

### D1 — Keep Obsidian's write and remove the one byte it adds, only when the note had no body

After the `prepend` call, when the note grew by exactly `byteLength(content) + 1` bytes, the handler reads the note and checks whether Obsidian appended `content + "\n"` at the very end of the note it read before the call. If so, it writes `before + content` atomically (`writeAtomic`), refreshes the metadata cache, and reports one byte less.

**Rationale**: it fixes exactly the defective case, keeps Obsidian as the sole judge of where the text lands (spec 045 FR-005b holds: the wrapper never detects a properties block, it only checks whether Obsidian's insertion was at the end of the note), and leaves every note that has a body on the unchanged path. Because Obsidian adds exactly one LF on every default-mode call (F2), the size pre-filter excludes only inline calls and failed or no-op writes: inline calls skip the read-back; every default-mode call reads the note once more.

**Alternatives considered**:

- *Write empty notes directly, bypassing Obsidian.* Fixes `""` with a single atomic write, but not properties-only notes, which still need the post-write correction; two mechanisms instead of one.
- *Move `prepend` to the direct-write path with a wrapper-side frontmatter parser.* Violates spec 045 FR-005b and reverses spec 045 research R1; a much larger change for a one-byte defect.
- *Ask Obsidian's metadata cache where the properties block ends before the call.* Spec 045 research R1 rejected this: the cache may not be warm, so the answer can be stale.
- *Pass `inline` to Obsidian whenever the note has no body.* Needs to know beforehand that the body is empty, which is the frontmatter detection FR-005b forbids.

### D2 — The "landed at an empty body" predicate, and its one ambiguity

`landedAtEmptyBody(before, content, after)` is true when `after === before + content + "\n"` and the result cannot also be explained by an insertion further up the note.

From F2, an insertion at `k` gives `after = before[0:k] + w + before[k:]` with `w = content + "\n"`. That equals `before + w` exactly when the tail `s = before[k:]` satisfies `s + w === w + s`. Two strings commute only when both are repetitions of the same primitive root, so a second explanation exists exactly when `before` ends with the primitive root of `w`. In that case the wrapper cannot tell, from bytes alone, whether the note had a body, so it leaves Obsidian's result unchanged.

- `before === ""` is never ambiguous, so empty notes are always fixed.
- For a properties-only note, ambiguity needs `content + "\n"` to be a repetition of a tail of the properties block, for example `content` of `"-"`, `"--"`, `"---"` or only line breaks. Such a call keeps Obsidian's result, with the extra trailing line break.
- Without the guard, `"x\n"` + `"x"` (row body-x-lf, a note **with** a body) would be "corrected" to `"x\nx"`, changing behaviour for a note with content and breaking spec FR-006. The guard prevents that.

**Rationale**: FR-006 (no change for notes with content) is a data-safety rule; FR-002 on a pathological input is cosmetic. When the two cannot be told apart, the safe choice is to leave Obsidian's result.

The primitive root of `w` is `w.slice(0, (w + w).indexOf(w, 1))`, linear in the content length (at most 3072 code units).

### D3 — Failure and race semantics (clarification Q1)

- **`writeAtomic` fails** (the predicate already proved the note bodiless), **or reading the note after the call fails and `before === ""`** (certainly bodiless): throw `UpstreamError` `FS_WRITE_FAILED` with `cause: e`, `details: { reason: "extra-trailing-newline", path, vault, errno? }` and a message saying the content landed in the note but the extra trailing line break Obsidian added could not be removed. No new top-level code (Principle IV); one new ADR-015 sub-reason.
- **Reading the note after the call fails and `before` is non-empty**: the wrapper cannot tell a properties-only note from a note with a body without a frontmatter parser (spec 045 FR-005b). Throw `UpstreamError` `FS_WRITE_FAILED` with `cause: e`, `details: { errno, syscall: "open", path }` and no `reason`, with a message saying the content landed, must not be sent again, and could not be checked for an extra trailing line break (analyze I1, option B; spec FR-009 (c)). This is honest in both directions; staying silent or claiming `extra-trailing-newline` would breach Principle IV.
- **Someone else changed the note between the tool's steps**: the predicate is false (`after` is no longer `before + w`), so nothing is written and the call succeeds with the measured `postCallSize − preCallSize` (last-write-wins, as for the rest of the write cohort). A residual window remains between reading `after` and the rename, the same accepted window `patch_heading` documents for its race check.
- **Reading the note before the call**: ENOENT gives `before = null` (the correction is skipped and Obsidian's not-found error is classified as today). Any other errno throws `UpstreamError` `FS_WRITE_FAILED` with `cause: e` and `details: { errno, syscall: "open", path }` and no `reason` (the cohort shape, as `patch_heading`'s read failure), before the Obsidian call, so nothing is written (spec FR-009 exception (b); Constitution Principle IV). The pre-call `stat`'s existing raw rethrow (`handler.ts:152`) predates this BI and is left unchanged.
- **Someone else's change and the residual window**: the wrapper never overwrites a change it has observed; the window between the read-back check and the atomic rename is accepted (spec FR-007).

### D4 — Reporting the size

When the correction runs, `bytes_written = postCallSize − preCallSize − 1`: the rewrite removes exactly the one LF byte. On empty and properties-only notes this equals `byteLength(content)` (spec FR-004). The existing `bytes_written <= 0` guard is unchanged and runs before the correction.

### D5 — Metadata cache

After the corrective write, call `invalidateMetadataCache(deps, { vault: input.vault, relPath })`, as every direct-write cohort member does (spec 068 A1). It never fails the call; a failure is logged as `bridge.metadata_refresh_failed`.

### D6 — Code placement

- New pure helper `src/tools/prepend/empty-body.ts` exporting `landedAtEmptyBody`, with co-located `empty-body.test.ts`. Pure, so it is tested without fakes, like `append_note/append-edit.ts`.
- `prepend/handler.ts`: `ExecuteFs` gains `readFile`, `writeFile`, `rename` and `unlink` (it then satisfies `AtomicWriteFs`), `DEFAULT_FS` implements them, and the handler gains the pre-read and the correction step.
- `prepend/_handler-fixtures.ts`: `fakeFs` gains a `contents` sequence for `readFile` (default: always `""`, which never matches the predicate after a non-zero delta) and records writes; existing tests keep their behaviour.
- New `prepend/handler.empty-body.test.ts` for the handler cohort, keeping `handler.test.ts` under 1000 lines (BI-058 convention).

### D7 — Documentation

- `docs/tools/prepend.md`: the *Separator behaviour* empty-file row and worked example already state the fixed behaviour; add the properties-only worked example, a `bytes_written` sentence for empty and properties-only notes, the new error-table row, and the D2 limitation.
- `CHANGELOG.md` `[Unreleased]`: a Fixed entry.
- `.docs-as-code/`: updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle.

### D8 — Live verification

Re-run the F2 empty and properties-only rows through the built server (`dist/`) in the quickstart; seed fixtures through `obsidian eval` (F9).

### F9 — Probe harness note

The first two probe runs seeded fixtures by writing the vault folder from Node. A path-escaping slip in the probe script dropped the backslashes from the vault path, so the files landed in a stray folder under the working directory instead of the vault. Obsidian answered `Error: File "…" not found.` (exit 0, on stdout), and the stray folder was deleted. The third run seeded and read fixtures through `obsidian eval` (`app.vault.create`, `app.vault.adapter.read`). That method avoids host path handling altogether, and Obsidian knows each file as soon as the call returns, so the quickstart uses it.
