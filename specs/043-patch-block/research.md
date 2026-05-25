# Research: Patch Block (Phase 0)

**Branch**: `043-patch-block` | **Date**: 2026-05-25
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the Technical Context unknowns flagged in plan.md and pins the design decisions that the wrapper's structure depends on. Each finding records the **Decision** taken, the **Rationale**, and the **Alternatives Considered**.

## R1 — No upstream `note:patch-block` subcommand; fs-direct implementation via ADR-009 substrate

**Decision**: Implement `patch_block` as an fs-direct read-modify-write operation through the existing ADR-009 substrate (vault-registry resolution → two-layer path safety → fs.readFile → in-memory block-id scan + per-shape surgery → fs.writeFile to `.tmp` → fs.rename → metadataCache invalidation eval). No upstream `obsidian` CLI subcommand wraps. Tool name `patch_block` follows the cohort's `verb_noun` convention used by other fs-direct or non-mechanically-mapped tools (`patch_heading`, `write_note`, `find_and_replace`, `find_by_property`).

**Rationale**: The `obsidian` CLI's published subcommand surface does not include a `note:patch-block`, `block:patch`, `note:set-block`, or analogue subcommand. The cohort precedent for write-side tools without an upstream subcommand is `write_note` (ADR-009) and `patch_heading` (BI-040), both of which execute their write entirely through Node's `fs` module after using a small bug-safe `eval` to resolve the focused-file path in active mode. `patch_block` follows the same pattern: read the note via `fs.readFile`, perform the block-id scan and per-shape surgery in TypeScript, write back atomically via `fs.writeFile` + `fs.rename`. The substrate's hardening (two-layer path safety per ADR-009, atomic temp-then-rename, post-write `metadataCache` invalidation eval) applies unchanged.

**Alternatives Considered**:
- **Wrap a hypothetical `obsidian note:patch-block` subcommand if one exists in a future Obsidian release**: rejected — speculative; the current binary has no such surface and there is no public roadmap promising one. ADR-010 mechanical mapping requires the subcommand to exist; absent that, in-tree authoring is the only path.
- **Wrap via `obsidian eval` with a JS template that does the block-id scan inside Obsidian's runtime** (parity with `pattern_search` / `context_search` / `smart_connections_similar`): rejected — the eval template would have to ship the full scan + surgery logic as a JS string carrying the caller's replacement content. The ADR-009 Windows IPC ~4 KB-per-argv-element defect (BI-0038) deterministically crashes Obsidian's main process whenever any single argv element exceeds the threshold, and the eval `code=` argument carrying both the scanner logic AND the caller's content is the exact shape that triggers the defect. The fs-direct path is the cohort-blessed escape for any operation that has to cross more than a few hundred bytes of user content into the CLI.
- **Hybrid (eval for scan-only, fs for write)**: rejected — round-tripping the parsed block-shape classification across the eval boundary and then resolving offsets back in TypeScript for the write adds no robustness and breaks single-source-of-truth.

## R2 — Block-id scanner: ATX + setext heading detection (for `BLOCK_ON_HEADING` routing); paragraph / list-item / separately-placed-marker classification for everything else

**Decision**: The block-id scanner walks the note line-by-line, tracking four pieces of state — `inFrontmatter: boolean` (entered when line 0 is `---`, exited at the next `---`; inside frontmatter no token is bound, explicit FR-014 enforcement — divergence from sibling BI-040 where frontmatter is enforced incidentally), `inFence: boolean` (R3 fenced-code-opacity rule), a one-line buffer for setext-heading lookahead (described below), and a parent-block-shape tracker (for separately-placed classification). When a non-frontmatter non-fence `^block-id` token is detected, the scanner classifies its enclosing block shape using these rules:

1. **On heading line (ATX)**: the current line's lstripped form starts with one-to-six `#` characters followed by a space. The trailing `^block-id` is attached to the heading marker line itself. Classification: `on-heading-atx`. Routes to `BLOCK_ON_HEADING` per FR-019a.
2. **On heading line (setext)**: the **next** line's lstripped form is composed entirely of `=` characters (rank 1) or `-` characters (rank 2) with at least one such character. The `^block-id` on the current line is attached to a setext-heading marker. Classification: `on-heading-setext`. Routes to `BLOCK_ON_HEADING` per FR-019a. (Detection requires single-line lookahead; the scanner buffers each line's classification until the next line is read.)
3. **List item**: the current line's lstripped form starts with `-`, `*`, `+`, or `\d+\.` followed by at least one space, AND the `^block-id` is the trailing token on that line. Classification: `list-item`.
4. **Paragraph**: the `^block-id` is the trailing token on a non-list, non-heading line that is itself part of a paragraph (preceded and/or followed by other non-blank lines without a fence boundary or heading boundary). Classification: `paragraph`.
5. **Separately-placed marker (table / callout / blockquote / indented-code)**: the line containing only `^block-id` (possibly with leading whitespace and nothing else) sits immediately after a block whose shape is recognised by lookbehind: table rows (pipe characters), callout (`> [!type]`), blockquote (`>`), indented code (4-space-leading). Classification: `separately-placed`. The marker line is preserved verbatim; the body to be replaced is the block that immediately precedes the marker line.

**Rationale**: FR-008 / FR-009 / FR-010 distinguish three surgery mechanics by block shape; the scanner must produce that classification. FR-019a routes ATX + setext heading attachments to a typed reject — the scanner must recognise both shapes to enforce the scope split with `patch_heading`. Setext detection requires single-line lookahead (the `^block-id` is on the heading-text line, but the disambiguation comes from the following underline line); the scanner achieves this by buffering the per-line classification until the following line is read. FR-014's "no frontmatter modification" rule is enforced explicitly at the scan layer via the `inFrontmatter` flag — divergence from sibling BI-040 R2 (where the heading walker enforces it incidentally because YAML field values almost never contain `# `-prefixed lines that would be classified as headings). The explicit frontmatter scan-skip costs ~15 LOC and closes a theoretical-but-low-probability hole where a `^block-id` token inside a YAML field value would otherwise be bound.

The scanner is small (~120-150 LOC in-tree per the Dependencies rule's in-tree bias; structurally parallel to `patch_heading`'s `heading-walk.ts` at ~80 LOC, the extra ~50 LOC comes from the four-vs-one shape classification surface plus setext lookahead).

**Alternatives Considered**:
- **ATX-only heading detection (skip setext)** — cohort parity with `patch_heading`'s R2 ATX-only decision: rejected. `patch_heading` could skip setext because its routing surface (the heading-path locator) is decoupled from setext-vs-ATX; setext headings are simply unreachable through that locator. `patch_block`'s routing surface needs to distinguish heading-attached markers from non-heading-attached markers to enforce the `BLOCK_ON_HEADING` scope split — silently failing to classify a setext-attached marker would let a `patch_block` call rewrite a setext heading line's text, exactly the failure mode FR-019a exists to prevent. Setext support is small (~15 LOC of underline-line lookahead) and load-bearing for the contract.
- **Delegate to `marked` / `remark` / `markdown-it`**: rejected per Dependencies rule's in-tree bias for anything under ~150 LOC.
- **Single-pass classification without lookahead** (classify each `^block-id` immediately on first read): rejected — would miss setext attachments because the disambiguating underline arrives on the next line. The buffered-classification approach is O(lines) with O(1) buffer state, no performance cost.

## R3 — Fenced-code-block opacity rule

**Decision**: The block-id scanner tracks a single piece of state — `inFence: boolean` — toggled whenever a line whose lstripped form starts with three or more consecutive `` ` `` or `~` characters (a CommonMark fence) is encountered. Inside a fence, no `^block-id` token is recognised as a block marker; tokens inside fences are content. FR-011's "block-reference marker inside a fenced code block is content, NOT eligible target" surfaces as `BLOCK_NOT_FOUND` when the caller names such an id, because the scanner never bound the id in the first place.

**Rationale**: Direct lift of `patch_heading`'s R3 — same minimum-viable detector (toggle on `≥3` `` ` ``/`~`), same exclusion of indented-code-blocks from fence-like opacity (indented `^block-id` on an indented-code-block line is still recognised as a `^block-id` token because indented code blocks do not occlude `^` tokens the way fenced code does — Obsidian's parser treats indented-code-block content as opaque to wikilinks but `^block-id` markers inside them have undefined binding under upstream's contract; the cohort default is to treat the marker as content too). Nested fences are NOT supported — first matching closing fence ends the current fence, matching CommonMark.

**Alternatives Considered**:
- **Exact fence-character-and-length open/close** (CommonMark's rule that the closing fence must be at least as long as the opening fence): partial implementation deferred, identical to `patch_heading`'s R3 deferral. If a future BI surfaces a vault where a 4-backtick fence with a stray 3-backtick line inside it mis-toggles, the test fixture is added and the rule refined.
- **Treat indented-code-block content as fence-like-opaque to `^` tokens**: deferred. Upstream's binding behaviour for `^block-id` inside indented-code-block lines is not stably documented; the conservative default (treat the marker as content, surface `BLOCK_NOT_FOUND` when caller names it) is identical to the fenced-code case and avoids divergence between the two. Edge case noted in spec.

## R4 — No race detection; FR-026 last-write-wins is the published contract

**Decision**: `patch_block` does NOT implement a pre-write re-walk or any other race-detection mechanism. The cross-invocation contract is last-write-wins per FR-026, encoded in the spec via the user's explicit out-of-scope statement. Single-invocation atomicity (FR-020) is inherited from the ADR-009 substrate's atomic temp-then-rename byte-stably.

**Rationale**: This is the load-bearing divergence from `patch_heading` (which DOES implement pre-write re-walk for FR-019 `HEADING_RACE`). The rationale comes from the spec author's explicit scope decision: `patch_heading`'s race surface exists because heading paths are stable identifiers across writes (a heading rename is a known race-introducing operation that callers can reason about), and the cost-benefit of pre-write re-walk + `HEADING_RACE` typed error is favourable for that locator shape. Block-references have different semantics: the `^block-id` marker is itself the identifier and is byte-stable across writes (FR-008 / FR-009 / FR-010 guarantee the marker is preserved); the most-likely "race-style" failure (the marker being moved to a different block via external edit) is not detectable from inside the wrapper without parsing the full file pre and post; and the user's out-of-scope statement on transactional guarantees codifies the team's intent to keep the contract simple. Adding a `BLOCK_RACE` sub-discriminator would surface a failure mode the substrate cannot reliably detect and would break cohort parity with `write_note` (which also publishes no race surface).

**Alternatives Considered**:
- **Pre-write re-scan with `(block-id, block-shape, line-text)` identity tuple**: rejected — cost (a second full-file scan per write) without benefit (the marker preservation invariant in FR-008/009/010 already provides identity stability across the wrapper's own write; for races against an external editor, FR-021's `EXTERNAL_EDITOR_CONFLICT` already covers the substrate-detectable case).
- **Content-hash of the block's body between read and pre-rename re-read**: rejected — same false-positive surface as `patch_heading`'s rejected hash-comparison alternative (any unrelated edit elsewhere in the note would block the patch).
- **File-mtime comparison**: rejected — networked-vault clock skew + the well-known mtime-resolution-coarseness problem (1-second mtime resolution on some filesystems makes back-to-back writes indistinguishable).

## R5 — Concurrent writes: substrate's atomic temp-then-rename absorbs the race; last-write-wins by design

**Decision**: The wrapper relies on the ADR-009 substrate's atomic write-temp-then-rename to satisfy FR-020 (single-invocation atomicity) and lets the cross-invocation behaviour fall through to the substrate's natural last-write-wins semantics per FR-026. When two `patch_block` calls target the same note simultaneously:

1. Both calls read the file's current contents via `fs.readFile`.
2. Both calls compute their respective block-id scans and per-shape surgery outputs in memory.
3. Both calls write their candidate content to a per-call `.tmp` file (filenames uniquified by PID + tool-call sequence number to avoid `.tmp` filename collision between concurrent calls).
4. Both calls invoke `fs.rename(<tmp>, <target>)`. The rename is atomic on the same volume (POSIX `rename(2)` atomic; Windows `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING` atomic). One rename wins; the other rename overwrites — both "land" in serial order, last writer wins.

The losing call's write is NOT silently dropped: the loser's content is preserved on disk after its rename completes (overwriting the winner's contents); the winner's content was the file's state for some interval but is now overwritten by the loser. This is the FR-026 published contract.

**Rationale**: FR-020's "no half-written observable instant" is satisfied by atomic rename — the file is always either the pre-rename content or the post-rename content, never an interleaved mix. FR-026's "last-write-wins cross-invocation" is the user-stated scope decision. The combined contract is byte-stable with `write_note`'s and `patch_heading`'s substrate behaviour; the only meaningful divergence from `patch_heading` is that `patch_heading`'s spec wanted both "land cleanly OR one fails loud" (its FR-020) which admits the same last-write-wins outcome as long as no edit is silently torn — `patch_block`'s spec is more explicit and codifies last-write-wins as the contract.

**Alternatives Considered**:
- **File-level optimistic locking** (read the file's mtime + hash before writing, fail loud if anything changed between read and rename): rejected — would force every concurrent patch to retry under contention, operationally painful for high-frequency automation. Cohort default (`write_note`, `patch_heading`) is identical to this BI's behaviour.
- **OS-level advisory locks (`fcntl` / `LockFileEx`)**: rejected — the substrate's atomic-rename already provides file-level atomicity FR-020 requires; advisory locks would add platform-divergent complexity for no contract benefit.

## R6 — External-editor unsaved-changes detection: substrate-signalled only, inheriting BI-040 byte-stably

**Decision**: The wrapper does NOT implement its own cross-platform editor-state detection. It relies on the platform's natural `fs.rename` and `fs.open` error surfaces to signal external-editor conflicts:

- **Windows**: `fs.rename` throws `EBUSY` (or `EPERM` for some shares-modes) when the target is held open by a process that did not specify `FILE_SHARE_DELETE` in its `CreateFile` call; most editors hold files with shared-read but not shared-delete. The wrapper catches this `errno` and classifies it as `EXTERNAL_EDITOR_CONFLICT` with `details.reason: "file-locked"`.
- **Linux / macOS**: `fs.rename` succeeds in the typical case (POSIX rename does not honour open file handles). The wrapper has no signal to fail on; the edit lands and the editor sees a refreshed file on next focus. Documented detection-capability caveat per FR-021.
- **Cross-platform `fs.open` advisory check**: NOT used. Rationale identical to BI-040 R6.

`EXTERNAL_EDITOR_CONFLICT` `details.reason` enumeration (`"file-locked"`, `"unsaved-changes"`) is inherited byte-stably from BI-040 with no schema change. `patch_block` emits the same enum values via the same classification logic the substrate uses for `patch_heading` / `write_note`.

**Rationale**: Direct lift of `patch_heading`'s R6. Cohort default. Reusing the existing enum keeps the `EXTERNAL_EDITOR_CONFLICT` cross-tool surface uniform — callers handling the error from `write_note` or `patch_heading` need no new switch arms for `patch_block`.

**Alternatives Considered**: Identical to `patch_heading`'s R6 — per-editor lock-file detection rejected as editor-specific drift-prone; pre-rename advisory open with `O_EXLOCK` rejected as racy on Windows.

## R7 — Block-id encoding: alphanumeric + hyphen-minus only; no escaping; non-alphabet inputs rejected at validation boundary

**Decision**: The block-id input is the bare identifier (no leading `^`) matching the regex `^[A-Za-z0-9-]+$` with length ≤ 1000 UTF-16 code units. The schema-layer Zod refinement rejects inputs that:

- Are empty → `INVALID_BLOCK_ID details.reason: "empty"`.
- Contain any character outside `[A-Za-z0-9-]` → `INVALID_BLOCK_ID details.reason: "contains-invalid-chars"`.
- Begin with `^` → `INVALID_BLOCK_ID details.reason: "leading-caret"` (the caret is the wikilink delimiter, not part of the identifier; accepting both forms invites round-trip ambiguity).
- Exceed 1000 UTF-16 code units → `INVALID_BLOCK_ID details.reason: "too-long"`.

No escaping mechanism is provided; the alphabet is fixed and matches Obsidian's documented block-id alphabet.

**Rationale**: Settled by the 2026-05-25 `/speckit-clarify` session (Q2). Matching Obsidian's documented alphabet at the wrapper boundary surfaces alphabet violations as `INVALID_BLOCK_ID` before filesystem access; the rejected broader alphabet (alphanumeric + hyphen + underscore) would have let underscore-bearing inputs pass validation, then surfaced as `BLOCK_NOT_FOUND` post-file-read when the upstream parser failed to bind the id, a worse caller experience.

The four-state `details.reason` enumeration per ADR-015 lets callers programmatically distinguish the validation-failure shapes without prose parsing.

**Alternatives Considered**:
- **Broader alphabet (add underscore, period, colon)**: rejected at clarify Q2 — see settled rationale above.
- **Accept leading `^` and silently strip it**: rejected — round-trip ambiguity in error messages and identifier echoing (would the response payload's `block_id` echo include the caret or not?). Failing loud at the validation boundary is cleaner.
- **No length cap**: rejected — cohort parity with BI-033 / BI-038 / BI-039 / BI-040 (1000 UTF-16 code units is the cohort's standard locator-input cap).

## R8 — Output envelope echoes locator for write-verification

**Decision**: The success response echoes the resolved write target. Envelope shape:

```typescript
interface PatchBlockOutput {
  path: string;            // Vault-relative path of the note that was patched
  vault: string;           // Vault display name (resolved from input.vault or focused-vault default)
  block_id: string;        // The matched block-id (bare identifier, no leading caret)
  block_shape: "paragraph" | "list-item" | "separately-placed";  // Which surgery mechanic was applied
  bytes_written: number;   // Total bytes written to disk (post-edit file size)
}
```

**Rationale**: Per the project's memory feedback (`feedback_no_locator_echo_in_read_responses.md`): "typed READ tools return data only, never `vault`/`path`/`file` echo; only WRITE tools echo for write-verification". `patch_block` is a write tool, so locator-echo applies. The `bytes_written` field gives the caller a coarse confirmation that something landed (zero or very small `bytes_written` is suspicious); `block_shape` echoes which surgery mechanic the scanner classified (paragraph / list-item / separately-placed), letting the caller audit the wrapper's classification decision; `block_id` echoes the locator for cross-reference against the request. The output schema is strict (`.strict()` per cohort convention).

The wrapper does NOT echo the inserted content (would double the payload size), nor the full final-file content (defeats the surgical-edit value proposition). The wrapper does NOT echo `on-heading-atx` / `on-heading-setext` shape values because requests resolving to those shapes fail with `BLOCK_ON_HEADING` and produce no success envelope.

**SC-005 (payload bounded by content + locator, NOT surrounding note size) is design-inherent under this envelope shape.** The input JSON carries only `target_mode` / `vault` / `file`-or-`path` / `block_id` / `content`; none of those fields reference or include the surrounding note bytes. The output JSON carries `path` / `vault` / `block_id` / `block_shape` / `bytes_written`; again none reference note content. The wrapper reads the full file via `fs.readFile` and writes the full file via `fs.writeFile`, but those are local IO primitives, not caller-side payload — they do not flow back to the caller through MCP. A 5-byte content replacement on a 50,000-byte note moves ~200 bytes of MCP input (the JSON envelope around the 5-byte content + the locator) and ~150 bytes of MCP output, independent of the file's total size. No dedicated test asserts SC-005 because it is structurally inherent in the envelope schema (the input/output schemas literally do not have a field for the surrounding note content); the property is verified by inspection of the schemas themselves, not by runtime measurement. Cohort-uniform posture: the read-side tools that DO echo file content (e.g. `read`) explicitly mark themselves as content-returning, while write-side tools that DON'T (this BI, `patch_heading`, `write_note`) inherit the bounded-payload property by schema design.

**Alternatives Considered**:
- **Echo nothing** (parity with read tools per the same memory): rejected — write tools have a stronger write-verification need.
- **Echo full final-file content**: rejected — defeats the surgical-edit value proposition.
- **Echo the inserted/replaced byte range** (`{ start_offset, end_offset }`): deferred. Same rationale as `patch_heading`'s R8 deferral — costs nothing computationally but adds a contract surface; defer until a caller asks.
- **Echo a richer `block_shape` enum including `on-heading-atx` / `on-heading-setext`**: rejected — those shapes never reach the success envelope (they short-circuit to `BLOCK_ON_HEADING`); including them in the success schema enum would mislead schema readers about which shapes can appear in a success response.

## R9 — Source-tree layout and registration wiring

**Decision**: New module at `src/tools/patch_block/{index, schema, handler, block-scan, block-edit}.ts` plus five co-located `*.test.ts` files. Wiring into the server boot path is a one-line import + one-line factory call at `src/server.ts` (alongside the 27 existing `createXTool` imports + factory calls). A one-entry append to `src/tools/_register-baseline.json` updates the registry-stability baseline fixture per BI-031 / FR-018. No edits to `src/tools/_register.ts`, `src/tools/_registration-stub.ts`, `src/path-safety/`, `src/vault-registry/`, `src/target-mode/`, `src/cli-adapter/`, or `src/errors.ts`.

**Rationale**: Cohort-canonical pattern for adding a new typed tool. Eighteen prior tools follow the centralised-registration pattern (count post-this-BI). The five-file split (not three) is justified by the two pure helpers — `block-scan.ts` (line-by-line scan, fenced-code opacity, per-shape classification including ATX + setext heading-line detection, first-match-wins) and `block-edit.ts` (per-shape surgery: paragraph / list-item detach-token-swap-body-reattach-token; separately-placed preserve-marker-line-swap-body) — each carrying complex, independently-testable algorithmic logic. Cohort precedents for the five-file split: `patch_heading/` (5 files: `index` / `schema` / `handler` / `heading-walk` / `body-edit`), `find_and_replace/` (6 files: + `fence-scan` / `region-scan` / `replace`).

**Alternatives Considered**:
- **Single `handler.ts` with all logic inlined**: rejected — handler would exceed ~350 LOC (scan + surgery + integration) and conflate concerns. The split mirrors `patch_heading/`.
- **Three-file triplet (`{index, schema, handler}.ts`) with helpers inlined into `handler.ts`**: rejected for the same reason.
- **Pull `block-scan.ts` up to a shared `src/markdown/` module**: rejected — no other tool currently needs block-id parsing (`links/` scans wikilinks including `#^block-id` targets but does not scan source markdown for marker placement). Pre-emptive sharing would couple this BI to a hypothetical future migration; lift when a second caller arrives, per the cohort's lazy-extraction discipline.

## R10 — Test fixture strategy

**Decision**: Use vitest's `vi.fn()` fs mocks for unit tests — return canned `fs.readFile` payloads for the input notes and capture `fs.writeFile` + `fs.rename` calls to assert byte-stable output. Cohort precedent: `write_note`'s `handler.test.ts` and `patch_heading`'s `handler.test.ts` both mock `fs.readFile` / `fs.writeFile` / `fs.rename` / the small active-mode eval. Live-CLI fixtures are NOT used in vitest tests per the project's test-execution-instructions.md.

**Rationale**: Per the project's test-scope memory: "this repo covers vitest unit tests only; manual/integration TC-XXX cases live elsewhere in the user's tracker". Mock-based pattern is the cohort default for fs-direct tools. External-editor-conflict simulation mocks `fs.rename` to throw `EBUSY` and asserts the handler surfaces `EXTERNAL_EDITOR_CONFLICT` with the correct `details.reason` (reusing BI-040's classification path). First-match-wins simulation feeds the scanner a canned fixture with two `^foo` markers and asserts the surgery applies to the first.

**Alternatives Considered**:
- **Live-CLI tests inside vitest against an authorised test vault**: rejected — violates the test-scope memory.
- **Real filesystem tests in a per-test temp directory**: rejected — adds test-suite I/O latency and cross-platform variance (Windows file-locking semantics, line-ending normalisation). Mocked `fs` calls are sufficient because the handler's interaction with `fs` is narrow.

## R11 — Open probes deferred to /speckit-implement T0

The following items require live invocation against the authorised test vault and are deferred to /speckit-implement Phase T0:

1. **Setext-heading detection lookahead correctness for real-vault content.** Probe: against a vault note with a setext heading carrying `^foo` on the text line and `===`/`---` on the next line, invoke `patch_block` with block-id `foo`; verify the wrapper surfaces `BLOCK_ON_HEADING` rather than rewriting the heading text. Live probe needed because the buffered-lookahead classification has not been exercised against real-vault content yet; the unit test fixture covers the algorithm but cannot rule out a setext shape that the in-tree scanner misclassifies.
2. **Marker-position byte-position invariant under wrapper-side surgery for paragraph blocks.** Probe: patch a paragraph carrying ` ^foo` at end; verify the post-write file has `<new content> ^foo` with exactly one ASCII-space separator and no inserted/dropped whitespace. Live probe needed because the FR-008 invariant is byte-exact and the unit test fixture's canned bytes may diverge from what Obsidian's editor actually writes (e.g., non-breaking-space variants in some templates).
3. **Marker-position byte-position invariant for list-item blocks at nested indentation.** Probe: patch a list-item nested two levels deep (8-space indent + `- ` marker); verify the surgery preserves the leading indentation bytes and the trailing `^foo` token exactly. Live probe needed because list-item leading-whitespace conventions vary (tabs vs spaces vs mixed).
4. **Marker-line verbatim preservation for separately-placed shapes (table, callout, blockquote, indented-code).** Probe: patch a table immediately preceded by a `^foo` line; verify the `^foo` line's bytes are unchanged and its position relative to the table is unchanged. Live probe needed because the separately-placed shapes are the most diverse on disk and the wrapper's "verbatim preservation" guarantee is the load-bearing invariant for those shapes.
5. **Metadata-cache invalidation effectiveness post-patch.** Probe: patch a block; immediately invoke `get_backlinks` for a note that contains `[[note#^foo]]`; verify the backlinks query sees the post-patch state. The substrate's metadataCache eval already does this for `write_note` / `patch_heading`; confirm it does for `patch_block` too.
6. **Trailing-newline + line-ending convention preservation.** Probe set inherited from BI-040 R11 #2 + #3; re-run against `patch_block` to confirm the surgery paths preserve both conventions byte-stably across all three shape classifications.

Each of these is a fixture-population or behaviour-confirmation probe, not a contract decision. The spec contract is locked; T0 probes confirm the implementation's behaviour against the contract.

## Summary table

| ID  | Decision | Anchor |
|-----|----------|--------|
| R1  | fs-direct via ADR-009 substrate; no upstream subcommand | ADR-009, cohort precedent `write_note` / `patch_heading` |
| R2  | Scanner classifies five shapes (paragraph / list-item / separately-placed / on-heading-atx / on-heading-setext) with single-line setext lookahead AND explicit frontmatter scan-skip via `inFrontmatter` flag | FR-008 / FR-009 / FR-010 / FR-014 / FR-019a, cohort divergence from BI-040 R2 |
| R3  | Fenced-code opacity via in-fence boolean toggle (≥ 3 `` ` `` or `~`) | FR-011, CommonMark, lift from BI-040 R3 |
| R4  | No race detection; FR-026 last-write-wins is the contract | FR-026, deliberate divergence from BI-040 R4 |
| R5  | Concurrent writes via atomic temp-then-rename; last-write-wins by design | FR-020, FR-026, ADR-009 |
| R6  | External-editor detection = substrate-signalled `fs.rename` errors only; inherit BI-040's enum byte-stably | FR-021, cohort parity |
| R7  | Block-id alphabet = alphanumeric + hyphen; no escaping; 1000-UTF-16-code-unit cap | FR-004, FR-019, clarify session 2026-05-25 Q2 |
| R8  | Output echoes `{ path, vault, block_id, block_shape, bytes_written }` | Memory feedback (write tools echo) |
| R9  | Per-surface module with 5 production files; cohort precedent `patch_heading/` | Principle I, ADR-006 |
| R10 | Mock-based vitest unit tests; no live-CLI in vitest | Project test-scope memory |
| R11 | Six live-probe items deferred to /speckit-implement T0 | Implementation phase |
