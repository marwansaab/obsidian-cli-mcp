# Research: Patch Heading (Phase 0)

**Branch**: `040-patch-heading` | **Date**: 2026-05-21
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the Technical Context unknowns flagged in plan.md and pins the design decisions that the wrapper's structure depends on. Each finding records the **Decision** taken, the **Rationale**, and the **Alternatives Considered**.

## R1 — No upstream `note:patch` subcommand; fs-direct implementation via ADR-009 substrate

**Decision**: Implement `patch_heading` as an fs-direct read-modify-write operation through the existing ADR-009 substrate (vault-registry resolution → two-layer path safety → fs.readFile → in-memory heading walk + body splice → fs.writeFile to `.tmp` → fs.rename → metadataCache invalidation eval). No upstream `obsidian` CLI subcommand wraps. Tool name `patch_heading` follows the cohort's `verb_noun` convention used by the other fs-direct or non-mechanically-mapped tools (`write_note`, `find_and_replace`, `find_by_property`).

**Rationale**: The `obsidian` CLI's published subcommand surface (verified by `obsidian --help` against the binary at planning time) does not include a `note:patch`, `heading:patch`, `note:set-heading-body`, or analogue subcommand. The closest read-side tool is `read_heading` (which reads a heading's body via `eval`), but no write-side counterpart exists. The cohort precedent for write-side tools without an upstream subcommand is `write_note` (ADR-009), which executes its write entirely through Node's `fs` module after using a small bug-safe `eval` to resolve the focused-file path in active mode. `patch_heading` follows the same pattern: read the note via `fs.readFile`, perform the heading walk and body splice in TypeScript, write back atomically via `fs.writeFile` + `fs.rename`. The substrate's hardening (two-layer path safety per ADR-009, atomic temp-then-rename, post-write `metadataCache` invalidation eval) applies unchanged.

**Alternatives Considered**:
- **Wrap a hypothetical `obsidian note:patch` subcommand if one exists in a future Obsidian release**: rejected. Speculative; the current binary has no such surface and there is no public roadmap promising one. Tool-existing-at-this-time is a hard prerequisite for ADR-010 mechanical mapping; absent that, the wrapper authoring the operation in-tree is the only path.
- **Wrap via `obsidian eval` with a JS template that does the heading walk inside Obsidian's runtime** (parity with `pattern_search` / `context_search` / `smart_connections_similar`): rejected. The eval template would have to ship the full heading walk + body splice logic as a JS string; the ADR-009 Windows IPC ~4 KB-per-argv-element defect (BI-0038) deterministically crashes Obsidian's main process whenever any single argv element exceeds the threshold, and the eval `code=` argument carrying both the patcher logic AND the caller's content is the exact shape that triggers the defect. The fs-direct path is the cohort-blessed escape from this defect for any operation that has to cross more than a few hundred bytes of user content into the CLI.
- **Hybrid (eval for parse-only, fs for write)**: rejected. The wrapper would have to round-trip the parsed heading structure across the eval boundary, then resolve the heading offsets back in TypeScript before writing. The in-tree heading scanner is small (~80 LOC of ATX-only walk + fenced-code opacity); replicating it inside the eval just to share parse semantics adds no robustness and breaks the single-source-of-truth principle.

## R2 — ATX-only heading scanner; setext deferred

**Decision**: The heading walker recognises ATX-style headings only (`#` through `######` at the start of a line, optionally followed by a single space + heading text; trailing `#` characters and trailing `#`-with-space sequences treated as part of the heading text per CommonMark's "closing sequence" being optional in lax markdown). Setext headings (text underlined by `===` or `---` on the next line) are NOT recognised and any line that resembles a setext underline is treated as ordinary body content.

**Rationale**: Three considerations converge on ATX-only:

1. **Obsidian's editor produces ATX headings by default** — every heading inserted by the Obsidian UI, by the "Cycle bullet/checkbox" command, by templates, and by every plugin in the project's observed vaults is ATX. Setext headings appear only when authored by external Markdown editors and copy-pasted in. The realistic in-vault rate of setext headings is near zero.
2. **The wrapper-side heading walker is a project-private implementation** — neither the spec nor any cohort tool needs setext support today (`read_heading` and `outline`, the two read-side cohort members that traverse headings, both operate via `eval` on Obsidian's own metadata cache, which already settled on ATX-only via Obsidian's parser). Adding setext to the walker would require a two-line lookahead and a separate tokenisation pass; the test surface doubles for a behaviour exercising less than 1% of vault content.
3. **Setext-positive operations remain possible via a future BI** if a vault is found that depends on setext. Spec's Assumptions block flags this deferral explicitly so a future "setext heading patching" feature has an authorising decision to point at.

**Alternatives Considered**:
- **Full CommonMark scanner** (ATX + setext + indented-code + reference-link-definition boundaries): rejected. The walker only needs to identify heading marker lines and fenced-code regions (FR-013); full CommonMark parsing is over-engineered. The in-tree implementation stays at ~80 LOC of ATX + fenced-code opacity.
- **Delegate parsing to the `marked` / `remark` / `markdown-it` ecosystem**: rejected per Dependencies rule's in-tree bias for anything under ~150 LOC. The walker's surface is small and stable; adding a markdown parser would pull a transitive dependency tree (≥ 30 KB of code) for a single tool.

## R3 — Fenced-code-block opacity rule

**Decision**: The heading walker tracks a single piece of state per scan — `inFence: boolean` — toggled whenever a line whose lstripped form starts with three or more consecutive `` ` `` or `~` characters (an opening or closing CommonMark fence) is encountered. Inside a fence, no line is interpreted as a heading regardless of its leading-`#` prefix. The fence's info string (the language hint after the fence chars) is irrelevant to the walker. Nested fences are NOT supported — the first matching closing fence ends the current fence; this matches CommonMark's behaviour.

**Rationale**: FR-013 mandates that heading-marker characters inside a fence are not interpreted as section boundaries. The minimum-viable detector is the toggle scheme: enter a fence at any line whose first non-whitespace tokens are ≥ 3 consecutive `` ` `` or `~`; exit at the first subsequent line matching the same shape. This matches the user-visible behaviour of CommonMark and of Obsidian's editor. Indented code blocks (four-space-leading) are NOT given fence-like opacity because their line-by-line behaviour is identical to ordinary paragraphs — a leading `#` on an indented line is not a heading regardless of fence state (the leading whitespace already disqualifies it from being an ATX heading).

**Alternatives Considered**:
- **Match fence-character + length exactly at open/close** (CommonMark's rule that the closing fence must be at least as long as the opening fence): partial implementation deferred. The simpler "any 3+ backticks/tildes toggles" approach is adequate for FR-013's intent and matches what almost all vault content actually contains. If a future BI surfaces a vault where a 4-backtick fence with a stray 3-backtick line inside it would mis-toggle, the test fixture is added and the toggle rule is refined.
- **Lex the file into a full token stream and then walk tokens**: rejected — over-engineered for the contract. The line-by-line state-machine approach has O(lines) cost and trivial test surface.

## R4 — Race detection identity primitive

**Decision**: The "same heading" identity carried from the first resolve through the pre-write re-walk is a 3-tuple: `(marker-line literal text, rank, parent-chain literal text concatenated with the separator)`. After the initial walk produces a resolved heading at byte-offset `O` with `(text, rank, parent_chain)`, the pre-write re-walk re-scans the file from offset 0 and reports the heading at the supplied heading path; if the new walk's 3-tuple does not equal the cached 3-tuple by exact string comparison, surface `HEADING_RACE`. Byte-offset alone is NOT used (offsets shift when text is inserted earlier in the file by an interleaving edit, even though the heading itself is unchanged — that should NOT fire HEADING_RACE).

**Rationale**: FR-019 specifies a path-re-walk identity check. The 3-tuple is the minimal information that identifies "the heading I originally meant" without false positives on unrelated body edits. Each component is necessary:

- **Marker-line literal text** catches direct rename of the leaf heading.
- **Rank** catches the case where a heading's marker characters were changed (e.g., `## Old` → `### Old`); the path still resolves to a heading with the same text, but the rank changed, so the resolved "reach" boundary changes — `HEADING_RACE` should fire.
- **Parent-chain literal text** catches the case where an ancestor heading was renamed and the leaf is still findable by text (e.g., `# Top` → `# Renamed`, with `## Sub` still present beneath); the path `Top#Sub` now resolves to a different heading hierarchy and the race should fire.

The tuple comparison is exact-string per FR-003's exact-match contract. The re-walk uses the same `heading-walk.ts` helper that did the initial resolve, so any wrapper-side parsing decisions stay consistent between the two passes.

**Alternatives Considered**:
- **Byte-offset comparison** (cache the initial heading's byte-offset, re-stat the file, fail if the bytes-at-that-offset don't start with the expected marker line): rejected. False-positive on every concurrent body edit that shifted earlier bytes; false-negative when a heading was renamed in-place with the same byte length.
- **Content-hash of the heading marker line + body**: rejected at clarify (Q3 alternative C). False-positive when any unrelated body byte changed.
- **Full-file mtime / sha256 comparison**: rejected at clarify (Q3 alternative D). Same false-positive problem; additionally susceptible to filesystem clock skew on networked vaults.

## R5 — Concurrent writes: substrate's atomic temp-then-rename absorbs the race

**Decision**: The wrapper relies on the ADR-009 substrate's atomic write-temp-then-rename to satisfy FR-020 (concurrent edits). When two `patch_heading` calls target the same note simultaneously:

1. Both calls read the file's current contents via `fs.readFile`.
2. Both calls compute their respective walks and body-edited outputs in memory.
3. Both calls write their candidate content to a per-call `.tmp` file (filenames are uniquified by PID + tool-call sequence number to avoid `.tmp` filename collision between concurrent calls).
4. Both calls invoke `fs.rename(<tmp>, <target>)`. The rename is atomic on the same volume (POSIX `rename(2)` is atomic; Windows `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING` is atomic). One rename wins; the other rename overwrites the first winner — both "land" but in serial order, one after the other.

The losing call's write is NOT silently dropped: the loser's content is preserved on disk after its rename completes (overwriting the winner's contents); the winner's content was the file's state for some interval but is now overwritten by the loser. This is the "last write wins" outcome — both edits "land cleanly" in the FR-020 sense that neither is silently lost or torn at any observable instant. Each call sees its own write succeed.

**Note**: FR-020's secondary clause "or one MUST fail loud" is also satisfied — in the rare case where the loser's `fs.rename` fails because the target is held open by an external editor with unsaved changes (Windows `EBUSY`), the loser surfaces `EXTERNAL_EDITOR_CONFLICT` per FR-021. The wrapper does not implement file-level optimistic locking.

**Rationale**: FR-020's "both land cleanly OR one fails loud" admits the last-write-wins outcome as long as the file is never observed half-written and no edit is silently torn. The substrate's atomic rename satisfies both: the file is always either the pre-rename content (the winner's bytes) or the post-rename content (the loser's bytes), never an interleaved mix. The "silently lost" worry from FR-020 is about race conditions WITHIN a single edit (e.g., a write that partially completed and was then overwritten by a second write before the first finished); atomic rename eliminates that window. What FR-020 does NOT promise is operational-level merge semantics — two concurrent agents both intending to patch the same heading body produce a last-write-wins outcome, which is the expected and documented behaviour.

**Alternatives Considered**:
- **File-level optimistic locking** (read the file's mtime + hash before writing, fail loud if anything changed between read and rename): rejected. This would force every concurrent patch to be retried under contention, which is an operational nightmare for high-frequency automation. The atomic-rename + last-write-wins outcome is the cohort default (`write_note` behaves identically) and matches FR-020's contract intent.
- **OS-level advisory locks (`fcntl` / `LockFileEx`)**: rejected. The substrate's atomic-rename already provides the file-level atomicity FR-020 requires; advisory locks would add platform-divergent complexity for no contract-level benefit. The cross-platform variance in lock semantics (POSIX advisory vs. Windows mandatory; per-FD vs. per-process) is not worth the maintenance cost.

## R6 — External-editor unsaved-changes detection: substrate-signalled only

**Decision**: The wrapper does NOT implement its own cross-platform editor-state detection. It relies on the platform's natural `fs.rename` and `fs.open` error surfaces to signal external-editor conflicts:

- **Windows**: `fs.rename` throws `EBUSY` (or `EPERM` for some shares-modes) when the target is held open by a process that did not specify `FILE_SHARE_DELETE` in its `CreateFile` call; most editors hold files with shared-read but not shared-delete. The wrapper catches this `errno` and classifies it as `EXTERNAL_EDITOR_CONFLICT` with `details.reason: "file-locked"`.
- **Linux / macOS**: `fs.rename` succeeds in the typical case (POSIX rename does not honour open file handles). The wrapper has no signal to fail on; the edit lands and the editor sees a refreshed file on next focus. This is the documented detection-capability caveat per FR-021.
- **Cross-platform `fs.open` advisory check**: NOT used. Attempting to open the file with `O_EXLOCK` before the rename would add a platform-divergent code path that buys nothing on Linux / macOS and would race the actual rename on Windows; the rename's own error surface is the only signal worth honouring.

`EXTERNAL_EDITOR_CONFLICT` `details.reason` distinguishes `"file-locked"` (the OS surfaced an `EBUSY` / `EPERM` during write or rename — typical Windows + editor-holds-file scenario) from `"unsaved-changes"` (reserved for a future detection mechanism, currently unused but encoded in the schema for forward compatibility per ADR-015's multi-state-from-day-one preference).

**Rationale**: The substrate's natural error surface is the only reliable cross-platform signal. Building wrapper-side editor-state detection would require either (a) reading editor-specific lock files (Obsidian's `.obsidian.lock`, Vim's `.swp`, VS Code's no-lock-file architecture) with editor-by-editor logic that drifts as editors change; or (b) probing the file with platform-specific lock APIs (`LockFileEx` on Windows, `flock`/`fcntl` on POSIX) that have different semantics and can't be unified. Honouring whatever the substrate surfaces is the cohort default and matches what `write_note` already does.

**Alternatives Considered**:
- **Per-editor lock-file detection** (read `.obsidian.lock`, `.swp` files, etc.): rejected — editor-specific, drift-prone, and the wrapper has no business knowing about specific editor implementations.
- **Pre-rename advisory open with `O_EXLOCK`**: rejected — POSIX advisory locks are not honoured by most editors; Windows mandatory locks would race the rename itself.

## R7 — Heading-path encoding: `#` separator with no escaping; in-text `#` permanently unreachable

**Decision**: The heading-path locator is one composed string with segments joined by the literal `#` character per FR-004. The schema-layer parser splits the input on `#` and validates that no resulting segment is empty (FR-018 sub-reason `empty-segment`) and that the path has at least two segments (FR-018 sub-reason `single-segment`). No escaping mechanism is provided for in-text `#` characters — such headings remain permanently unreachable through this tool per FR-005.

**Rationale**: The 2026-05-21 clarification settled `#` as the separator on cohort-parity grounds with Obsidian's wikilink anchor convention `[[note#Top#Sub]]`. The empirical rate of in-text `#` characters in real heading text is near zero (literal `#` inside heading text breaks wikilink resolvers, so authors avoid it). Introducing an escaping mechanism (e.g., `\#` or `##` as escape for literal `#`) would add a parsing surface for ~0% of real use cases and create a confusing dual semantics (`Top#Sub` would mean "heading Sub under Top" but `Top##Sub` would mean either "heading #Sub under Top" or "empty segment then heading Sub under Top"). Keeping the rule "no escaping; in-text `#` is permanently out of reach" is consistent with how Obsidian wikilinks treat the same character.

**Alternatives Considered**:
- **Backslash escape** (`\#` means literal `#` in heading text): rejected — adds a parsing surface for ~0% of real use cases, creates dual semantics, and breaks cohort parity with the unescaped wikilink form.
- **Double-hash escape** (`##` means literal `#`): rejected — collides with the empty-segment shape; "empty segment then `Sub`" and "literal `#` then `Sub`" would be indistinguishable to the parser.

## R8 — Output envelope echoes locator for write-verification

**Decision**: The success response echoes the resolved write target for the caller's write-verification needs. Envelope shape:

```typescript
interface PatchHeadingOutput {
  path: string;            // Vault-relative path of the note that was patched
  vault: string;           // Vault display name (resolved from input.vault or focused-vault default)
  heading_path: string;    // The supplied heading_path, echoed back for verification
  mode: "append" | "prepend" | "replace";  // The mode that was applied
  bytes_written: number;   // Total bytes written to disk (post-edit file size)
}
```

**Rationale**: Per the project's memory feedback (`feedback_no_locator_echo_in_read_responses.md`): "typed READ tools return data only, never `vault`/`path`/`file` echo; only WRITE tools echo for write-verification". `patch_heading` is a write tool, so the locator-echo applies. The `bytes_written` field gives the caller a coarse confirmation that something landed (zero or very small `bytes_written` is suspicious); `mode` echoes the placement-mode discriminator so the caller can audit which intent was applied; `heading_path` echoes the locator for cross-reference against the request. The output schema is strict (`.strict()` per cohort convention) — unknown fields would be a wrapper-internal invariant violation surfaced as `INTERNAL_ERROR`.

The wrapper does NOT echo the inserted content (would double the payload size on every call), nor the full final-file content (defeats the surgical-edit value proposition). Callers wanting to verify the exact post-edit content read the note back via `read` or `read_heading`.

**Alternatives Considered**:
- **Echo nothing** (parity with read tools per the same memory): rejected — write tools have a stronger write-verification need than read tools have a "minimum response" need; the cohort already echoes for writes.
- **Echo full final-file content**: rejected — defeats the surgical-edit value proposition (callers patching a 50 KB note get back 50 KB on every call).
- **Echo the inserted/replaced byte range** (`{ start_offset, end_offset }`): deferred. Would require the wrapper to track byte offsets through the edit, which it does internally for the splice; surfacing them costs nothing computationally but adds a contract surface. Defer until a caller actually asks for it.

## R9 — Source-tree layout and registration wiring

**Decision**: New module at `src/tools/patch_heading/{index, schema, handler, heading-walk, body-edit}.ts` plus five co-located `*.test.ts` files. Wiring into the server boot path is a one-line import + one-line factory call at `src/server.ts` (alongside the 26 existing `createXTool` imports + factory calls). A one-entry append to `src/tools/_register-baseline.json` updates the registry-stability baseline fixture per BI-031 / FR-018. No edits to `src/tools/_register.ts` (centralised factory), `src/tools/_registration-stub.ts` (test-fixture SpawnLike helper), `src/path-safety/`, `src/vault-registry/`, `src/target-mode/`, `src/cli-adapter/`, or `src/errors.ts`.

**Rationale**: This is the cohort-canonical pattern for adding a new typed tool. Seventeen prior tools followed the centralised-registration pattern (the streak count post-this-BI). The centralised `registerTool` factory consumes the zod input schema directly, publishes it via `zodToJsonSchema`, and wires the `handler` into the MCP `Server.tool` slot.

The five-file split (not three) is justified by the two pure helpers — `heading-walk.ts` and `body-edit.ts` — each carrying complex, independently-testable algorithmic logic. Cohort precedent for splitting beyond the triplet: `find_and_replace/` splits into six files for the same reason (`fence-scan`, `region-scan`, `replace` are pure helpers separated from `handler`). The split makes each helper's test surface tractable and keeps `handler.test.ts` focused on integration (validation → walk → edit → write).

**Alternatives Considered**:
- **Single `handler.ts` with all logic inlined**: rejected. The handler would exceed ~300 LOC and conflate validation flow with the walk algorithm and the splice logic; testing each algorithmic concern in isolation would be cumbersome. The split mirrors `find_and_replace/`'s pattern, which is the only cohort precedent of comparable algorithmic complexity.
- **Pull `heading-walk.ts` up to a shared `src/markdown/` module** (in case `read_heading` / `outline` later want to share parsing): rejected. The two existing heading-traversal tools (`read_heading`, `outline`) operate via `obsidian eval` against Obsidian's metadata cache, not via wrapper-side parsing; they have no use for a shared parser. Sharing the parser pre-emptively would couple this BI to a hypothetical future migration. If/when `read_heading` migrates to fs-direct, that BI can lift the helper.

## R10 — Test fixture strategy

**Decision**: Use vitest's `vi.fn()` fs mocks for unit tests — return canned `fs.readFile` payloads for the input notes and capture `fs.writeFile` + `fs.rename` calls to assert the byte-stable output. Use the existing project test-fixture pattern (cohort precedent: `write_note`'s `handler.test.ts` mocks `fs.readFile` / `fs.writeFile` / `fs.rename` / the small active-mode eval). Live-CLI fixtures are NOT used in vitest tests per the project's test-execution-instructions.md (vitest is unit-only; manual live-vault validation happens outside the vitest test suite).

**Rationale**: Per the project's test-scope memory: "this repo covers vitest unit tests only; manual/integration TC-XXX cases live elsewhere in the user's tracker". The mock-based pattern is established in `write_note`'s `handler.test.ts` and is the cohort default for fs-direct tools. Race-condition simulation uses test-fixture injection: the test mocks `heading-walk`'s pre-write re-walk to return a tuple that does NOT match the cached tuple, asserting that the handler surfaces `HEADING_RACE`. External-editor-conflict simulation mocks `fs.rename` to throw `EBUSY`, asserting that the handler surfaces `EXTERNAL_EDITOR_CONFLICT` with the correct `details.reason`. No live-CLI invocation needed for any test in this BI.

**Alternatives Considered**:
- **Live-CLI tests inside vitest against an authorised test vault**: rejected — violates the test-scope memory and would pollute the test vault on every test run.
- **Real filesystem tests in a per-test temp directory**: rejected — adds test-suite I/O latency and cross-platform variance (Windows file-locking semantics, line-ending normalisation, etc.). Mocked `fs` calls are sufficient because the handler's interaction with `fs` is narrow (read → write → rename → optionally invalidate cache) and each call can be asserted exactly.

## R11 — Open probes deferred to /speckit-implement T0

The following items require live invocation against the authorised test vault and are deferred to /speckit-implement Phase T0:

1. **Exact `errno` shape for Windows external-editor conflict.** Probe: open the test vault's known note in an external editor with unsaved changes; invoke `patch_heading`; capture the `errno` (`EBUSY` vs. `EPERM` vs. `EACCES`) for the `fs.rename` failure. Drives the wrapper's classification table for `EXTERNAL_EDITOR_CONFLICT details.reason: "file-locked"`. Live probe needed because Windows file-sharing semantics depend on the specific editor's `CreateFile` flags.
2. **Trailing-newline convention preservation across the substrate.** Probe: patch a note that ends with `\n`; verify the output ends with `\n`. Patch a note that does NOT end with `\n`; verify the output also does not. Live probe needed because Node's `fs.readFile` returns the raw bytes (no normalisation) but the in-memory edit must not accidentally add or strip a trailing newline.
3. **Line-ending convention preservation.** Probe: patch a note with CRLF line endings; verify the output retains CRLF on both the modified region's boundaries and elsewhere. Live probe needed because the wrapper splits on `\n` for parsing but must reassemble using whichever ending the file already uses.
4. **Active-mode focused-file resolution for an unsaved note.** Probe: open a brand-new note in Obsidian without saving; invoke `patch_heading` in active mode; verify the focused-file eval resolves the new note's path (Obsidian assigns one even for unsaved notes) OR surfaces a sensible error if it doesn't. Drives whether the wrapper needs additional handling for unsaved-note focused paths.
5. **Metadata-cache invalidation effectiveness post-patch.** Probe: patch a heading; immediately invoke `read_heading` on the same heading; verify `read_heading` sees the post-patch body, not stale cache. The substrate's metadataCache eval already does this for `write_note`; confirm it does for `patch_heading` too.

Each of these is a fixture-population or behaviour-confirmation probe, not a contract decision. The spec contract is locked; T0 probes confirm the implementation's behaviour against the contract.

## Summary table

| ID  | Decision | Anchor |
|-----|----------|--------|
| R1  | fs-direct via ADR-009 substrate; no upstream subcommand | ADR-009, cohort precedent `write_note` |
| R2  | ATX-only heading scanner; setext deferred | Cohort precedent, spec Assumptions |
| R3  | Fenced-code opacity via in-fence boolean toggle (≥ 3 `` ` `` or `~`) | FR-013, CommonMark |
| R4  | Race identity = (marker-text, rank, parent-chain text); not byte-offset, not hash | FR-019 |
| R5  | Concurrent writes via atomic temp-then-rename; last-write-wins acceptable | FR-020, ADR-009 |
| R6  | External-editor detection = substrate-signalled `fs.rename` errors only | FR-021 |
| R7  | `#` separator; no escaping; in-text `#` permanently unreachable | FR-004, FR-005 |
| R8  | Output echoes `{ path, vault, heading_path, mode, bytes_written }` | Memory feedback (write tools echo) |
| R9  | Per-surface module with 5 production files; cohort precedent `find_and_replace/` | Principle I, ADR-006 |
| R10 | Mock-based vitest unit tests; no live-CLI in vitest | Project test-scope memory |
| R11 | Five live-probe items deferred to /speckit-implement T0 | Implementation phase |
