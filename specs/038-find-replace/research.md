# Phase 0 Research — Find and Replace

**Branch**: `038-find-replace`
**Inputs**: [spec.md](spec.md), [plan.md](plan.md), [.specify/memory/constitution.md](../../.specify/memory/constitution.md), ADR-009 (Direct Filesystem Write Path), ADR-015 (Sub-Discriminators), BI-016 (Reliable Writer), BI-037 (Pattern Search).

This file resolves the technical-context items the spec deferred and locks the design choices that shape the Phase 1 contracts. Each topic carries a Decision / Rationale / Alternatives triple.

## R1 — Execution path: direct-FS for read AND write

**Decision**: Both the preview-time read pass AND the commit-time write pass go through Node's `fs` API directly. Read: `fs.readdir({ recursive: true, withFileTypes: true })` for the directory walk, `fs.readFile` for per-note bytes. Write: `fs.writeFile(<target>.<uuid>.tmp, newContent)` followed by `fs.rename(<temp>, <target>)`. No `obsidian eval` round-trip on either path.

**Rationale**: ADR-009 already established direct-FS as the project's write path because the upstream CLI's per-argv-element ceiling (~4 KB on Windows) makes any path that ships user content through argv unreliable. Find-and-replace's commit step has the same constraint — the rewritten note content can be arbitrarily large. Using direct-FS for the read pass too unifies the path-safety check (the resolved vault root is realpath'd once and every subsequent FS operation under it is gated by the same Layer-2 startsWith check), keeps the handler small (no eval-template lifecycle), removes the latency of an IPC round-trip per note, and gives end-to-end testability without needing an Obsidian instance running. The read-via-`fs.readFile` approach trades the Obsidian-side `cachedRead` cache for the OS page cache — a wash for the typical sub-10k-files vault, and a deliberate trade for cross-platform-correctness invariants (BI-017) being testable.

**Alternatives considered**:
- *Eval for read + direct-FS for write (mixed)*: rejected. Two execution paths for one tool fragments the per-note path-safety check and forces the test surface to mock BOTH the eval round-trip and the FS write. The read-side latency win is marginal for sub-10k-file vaults.
- *Eval for both (parity with pattern_search)*: rejected. The commit step's rewrite content cannot reliably cross argv on Windows per ADR-009's motivation. Even if writes routed through a small eval that calls Obsidian's `app.vault.modify` API, the upstream IPC bug still bites on large content.
- *CLI subcommand wrap*: rejected. The Obsidian CLI exposes no find-replace subcommand to mirror; ADR-010 N/A is locked at spec Clarifications session-4.

## R2 — Region-scan algorithm: forward-pass paired markers

**Decision**: Two pure utility modules (`fence-scan.ts`, `region-scan.ts`) each take a `string` (note content) and emit `Region[]`. Each `Region` is a half-open `[startLine, startCol, endLine, endCol]` range over the source. A line is "inside a fence" when an opening fence has been seen earlier in a forward scan and the matching closing fence has not yet appeared. The fence marker is `^```` followed by any info-string OR `^~~~` followed by any info-string. Matching pair must use the same fence character (backtick fences are not closed by tilde fences). Unclosed-fence-at-EOF: the open-fence-line through EOF is treated as inside-fence (spec edge case "fenced code block left open"). HTML comments use the same algorithm with `<!--` / `-->` markers; the markers may appear anywhere on a line (not just line-start); first `-->` after an `<!--` closes — nested comments are flat per CommonMark.

The handler composes `fence-scan` + `region-scan` outputs into a single `skipRegions: Region[]` set conditional on the `include_code_blocks` / `include_html_comments` opt-ins, then tests each candidate match's byte-offset against that set via a single `byteOffsetInsideAnyRegion(offset, regions)` fold.

**Rationale**: A forward-pass linear scan over each note is O(N) in the note's length, identical to the underlying read cost. Keeping fence-scan and region-scan pure (no I/O, no deps) makes both file-less unit-testable, satisfying Principle II's happy-path + failure-or-boundary requirement without a fixture vault. The half-open `[start, end)` representation matches the byte-offset arithmetic the per-occurrence pass already does. The "first `-->` closes" rule matches CommonMark's HTML-comment semantics; the "same fence character must close" rule matches CommonMark's fence rule.

**Alternatives considered**:
- *Full CommonMark parse via `markdown-it` or similar*: rejected. Adds a runtime dep (~150 KB), parses far more than we need, and the spec's FR-006 explicitly forbids requiring a full CommonMark parser ("MUST NOT require a full CommonMark parse to disambiguate indented-code-block-vs-list-continuation"). Indented code blocks are deliberately treated as prose per the spec.
- *Line-level region masking*: rejected. A fenced code block can start mid-paragraph in pathological cases; tracking the precise byte offset is needed for accurate region-aware skipping when the pattern straddles a fence boundary.

## R3 — Line-scoped regex evaluation with zero-width skip

**Decision**: For each note, split into lines preserving the original line-ending byte sequences on a separate track (the byte-level original is retained for byte-for-byte preservation per FR-015). For each line, strip the trailing `\r` / `\n` before passing the line content to the regex engine (parity with BI-035 FR-012 + BI-037 FR-005). Iterate matches via `RegExp.prototype.exec` with the `g` flag (or `String.prototype.matchAll`). Skip zero-width matches via the standard idiom `if (match.index === match.index + match[0].length) { if (regex.lastIndex === match.index) regex.lastIndex++; continue }` — both skips the result entry AND advances the engine past the empty match to prevent infinite-loop behaviour (parity with BI-037 R8).

For each non-skipped match, compute `replacement_substring` via `String.prototype.replace(regex, replacement)` in regex mode (which honours `$1`/`$&`/`$$` ECMAScript semantics for free per FR-002) OR via verbatim splicing in literal mode.

**Rationale**: Line-scoped matching is locked by spec FR-016 (no cross-line patterns, parity with BI-037 FR-012). The zero-width skip idiom is the well-known JS regex zero-width-match handling pattern; BI-037 R8 already documents the same approach. Using native `String.prototype.replace` for the replacement-string semantics avoids reimplementing `$N` parsing (which has subtle edge cases — `$0` is implementation-defined, `$<name>` for named captures was added in ES2018). The native method is the canonical implementation.

**Alternatives considered**:
- *Multi-line patterns via reading the whole note as one buffer*: rejected. Spec FR-016 explicitly forbids cross-line matching. Locking it line-scoped also keeps the per-occurrence shape simple (no `end_line` field).
- *Hand-rolled `$N` parser for regex-mode replacement*: rejected. Native `String.prototype.replace` is well-tested, ECMAScript-conformant, and avoids a maintenance hazard.

## R4 — Drift-check semantics: two scans per commit invocation

**Decision**: The commit request schema does NOT require the caller to echo a preview-time occurrence count. Instead, on the commit code path the handler runs the scan TWICE: first to compute the "preview-time" count (the same scan as a non-commit invocation would produce), then a second scan immediately before applying any writes to compute the "commit-time" count. The two counts are compared in-handler; when they differ, the operation refuses with `code: "VALIDATION_ERROR"`, `details.code: "OCCURRENCE_COUNT_DRIFT"`, no note modified. When the two counts agree, the second-scan results drive the actual writes — so the writes always reflect current vault state, not stale state from the first scan.

The safe upper bound (FR-011) is checked against the SECOND scan's count for the bound-exceeded refusal — drift that pushes the count above the bound surfaces as the bound-exceeded error rather than the drift error.

**Rationale**: Spec FR-012 specifies "preview-time vs commit-time" drift detection, but the spec body is silent on whether the preview-time count is carried by the client across two tool calls or recomputed in-handler. Recomputing in-handler trades two scans per commit (linear cost — for sub-10k-file vaults, tens of ms doubled) for caller-shape simplicity: the commit request schema is identical to the preview request schema apart from `commit: true`, no statefulness, no client-side bookkeeping. The drift contract is preserved: a write between the two reads surfaces as a count mismatch in the same invocation. Equal-count add+remove drift remains the known false negative per spec FR-012; recovering it would require per-note hash fingerprinting which the spec explicitly rejected (session 1 Q1).

**Alternatives considered**:
- *Caller echoes the preview-time count*: rejected. Couples the client to the tool's internal counting (the client would need to extract `total_occurrences` from the preview response and pass it back in the commit request — a brittle round-trip prone to caller-side drift bugs).
- *Hash-based drift detection (per-note content hash)*: rejected by spec session 1 Q1 — marginal coverage gain over count-based check for a forced caller round-trip of per-file fingerprints.
- *Single scan with optimistic concurrency control*: rejected. The two-scan approach is dead simple and matches the spec's "preview-time vs commit-time" framing more cleanly than introducing a separate OCC field.

## R5 — Upper-bound env-var parsing: lazy + cached

**Decision**: Read `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` from `process.env` (via the injected `env: NodeJS.ProcessEnv` dep, not `process.env` directly — parity with the DI discipline of write_note's `Queue` injection) lazily on the first handler invocation. Parse via `Number.parseInt(value, 10)`; if the result is not a finite positive integer, fall back to the default 500 AND log a WARN via the project logger naming the invalid value. Cache the resolved value in handler module-scope state — env-var changes after the first invocation do NOT propagate (parity with the `OBSIDIAN_BIN` env-var convention; operator restarts the server to change the bound).

**Rationale**: Lazy resolution avoids early-startup ordering coupling and matches the `resolveVaultPath` lazy-cache pattern. Module-scope caching matches the project's "read env once" convention. The WARN-on-invalid + fallback behaviour is the safe default for an operational-deployment knob — a typoed env-var value silently using a 500 default beats refusing to serve.

**Alternatives considered**:
- *Read at server boot (eager)*: rejected. Matches no other project pattern; would require threading env-var into the boot spine for a per-tool concern.
- *Per-invocation re-read*: rejected. Operationally surprising (a sysadmin tweaking the env-var mid-process expects either "next restart" semantics or no effect; surprise mid-process change is the worst outcome).
- *Per-call argument*: rejected by spec Clarifications Q2 — operator-configured, not caller-configured.

## R6 — Replacement application: same path for preview and commit

**Decision**: `replace.ts` exports a single `applyReplacement(line, match, mode, replacement) → string` that returns the replacement substring (NOT the rewritten full line — the per-occurrence shape only carries the replacement substring per FR-004). In `regex` mode the function invokes `match[0].replace(regex, replacement)` — note `match[0]` is the literal matched substring, so applying `String.prototype.replace(regex, replacement)` against the matched substring (with the same regex used to find it) gives ECMAScript `$N` semantics applied to just that match. In `literal` mode the function returns `replacement` verbatim. Both preview and commit invoke the same function — the preview's `replacement_substring` field and the commit's actual rewrite are computed identically, so the commit always writes what the preview promised.

**Rationale**: Single source of truth per Principle I. The preview and the commit must agree on what would be written; reusing the same function eliminates the divergence risk. Using `match[0].replace(regex, replacement)` over the matched substring (instead of `line.replace(regex, replacement)` over the whole line) gives the right answer for the regex mode without re-running the global match — we already have the match handle from the per-line iteration.

**Alternatives considered**:
- *Separate preview-time and commit-time replacement logic*: rejected. Divergence risk, double the test surface, no benefit.
- *Compute the rewritten full line in preview, store it*: rejected. Doubles the preview payload size; spec FR-004 requires the per-occurrence shape, not full-line rewrite output.

## R7 — Path-safety integration: reuse existing modules wholesale

**Decision**: Reuse `isStructurallySafePath` from `src/path-safety/schema.ts` at the zod `superRefine` boundary for the `subfolder` argument (Layer 1 per ADR-009 / FR-009). Reuse `checkCanonicalPath` from `src/path-safety/canonical.ts` at the handler entry for the resolved subfolder (Layer 2 — the canonical realpath check). Apply the same `checkCanonicalPath` to each affected note's resolved location at commit time before any write — if any single note's canonical path escapes the vault root, the commit refuses with `PATH_ESCAPES_VAULT` and emits the `pathEscapeAttempt` logger event. Zero new path-safety code; the existing helpers are imported as-is.

**Rationale**: ADR-009 §2 already established the two-layer pattern for write_note; both helpers are exercised by the existing write_note test suite. Reusing them keeps the path-safety logic in one place per Principle I and ensures the find_and_replace security posture stays in lock-step with the rest of the write surface.

**Alternatives considered**:
- *Per-tool path-safety reimplementation*: rejected. Duplicates code that's already tested and would drift over time.
- *Layer-1-only (skip canonical check)*: rejected by spec Clarifications session-2 Q4 — leaves symlink-escape attacks blind.

## R8 — Queue dep wiring: per-note acquisition

**Decision**: Handler signature is `executeFindAndReplace(input, deps)` where `deps: ExecuteDeps = { fs, realpath, randomUUID, env, queue, resolveVaultPath, logger }`. The commit code path wraps each per-note write step (the `writeFile(<temp>)` + `rename(<temp>, <target>)` pair) in `queue.run(() => writeOne(note))`. The preview code path does NOT acquire the queue — preview is read-only.

Production wiring at `src/server.ts` injects the real `Queue` from `createQueue()`, real `process.env`, real `fs` from `node:fs/promises`, real `fs.realpath`, real `randomUUID` from `node:crypto`, real `resolveVaultPath` from `src/vault-registry/registry.ts`, and the bound logger. Tests wire in-memory equivalents — mirroring write_note's existing handler.test.ts pattern at [src/tools/write_note/handler.test.ts:13](../../src/tools/write_note/handler.test.ts#L13) (`createQueue` reused), [src/tools/write_note/handler.test.ts:144](../../src/tools/write_note/handler.test.ts#L144) (`queue: createQueue()` in deps).

**Rationale**: Per-note queue acquisition was locked by spec Clarifications session-4 Q2. The DI shape mirrors write_note exactly so the test wiring is copy-pasted from the established pattern. The preview-bypass-queue rule is the safe-and-cheap default — read-only operations don't need serialization.

**Alternatives considered**:
- *Per-invocation queue acquisition (whole commit batch acquires once)*: rejected by spec — concurrent commits should interleave at note-granularity, not batch-granularity, for fairness.
- *No queue dep (rely on FS atomicity alone)*: rejected by spec — diverges from the write-surface convention; two concurrent commits writing the same note would race even with per-note atomic rename if the temp paths collided (UUID prevents that, but the rename order matters — queue enforces it).

## R9 — Eligible-file filter: post-walk + `.`-prefix skip

**Decision**: Directory walk via `fs.readdir(scanRoot, { recursive: true, withFileTypes: true })`. For each returned `Dirent`, skip when:
1. `dirent.name.startsWith(".")` — the `.`-prefixed-directory skip per FR-020 (also catches `.`-prefixed files in non-`.`-prefixed dirs; same defensive intent).
2. `!dirent.isFile()` — directories themselves are not eligible.
3. `!dirent.name.toLowerCase().endsWith(".md")` — extension filter (case-insensitive on the extension per FR-020).
4. For the recursive case, additionally verify NO ancestor directory's name starts with `.` — Node's recursive readdir flattens the tree, so a file at `Inbox/.draft/note.md` returns with `dirent.parentPath` showing the `.draft` ancestor. Verify `dirent.parentPath` does not contain a `.`-prefixed segment.

The subfolder argument (FR-008) is applied at the `scanRoot` level — `fs.readdir` starts from the resolved subfolder, not the vault root, so the per-file filter is uniform.

**Rationale**: Spec FR-020 locks the rules; this is the mechanical implementation. The Node-recursive-readdir-flattens-tree behaviour means the ancestor check is needed even though the per-`Dirent` check catches the immediate-parent case. Cross-platform: `.`-prefix detection is path-separator-agnostic (a `.`-prefixed directory name is a property of the name itself, not the separator).

**Alternatives considered**:
- *Pre-walk filter (replace `fs.readdir(recursive: true)` with manual recursive walk that prunes `.`-prefixed dirs early)*: equivalent cost for sub-10k-file vaults; the post-walk filter has the simpler implementation and matches the project's existing list-files convention.
- *No `.`-prefix skip, rely on caller's subfolder argument to narrow scope*: rejected by spec FR-020 — operator-surprise risk if `.obsidian/workspace.json` got rewritten under a whole-vault scope is too severe.

## R10 — T0 live-FS probe plan

**Decision**: T0 happens at `/speckit-implement` time per CLAUDE.md `## Test Execution`. Five probes against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md):

- **T0-A — Preview round-trip**: stand up a vault scratch subdirectory with three notes containing a known multi-occurrence pattern (`BI-0042` appearing 7 times across 3 notes). Issue preview, verify response carries 3 affected_notes with per-occurrence counts summing to 7. Verify mtimes of all three notes unchanged.
- **T0-B — Commit round-trip**: re-issue the same call with `commit: true`. Verify on-disk contents now contain the replacement at every preview-promised position. Verify mtimes updated. Re-read each note and verify byte-for-byte preservation of unmatched content.
- **T0-C — Line-ending preservation (cross-platform invariant)**: seed scratch notes with CRLF (Windows-authored), LF (macOS-authored), and mixed (one of each) line endings. Run preview + commit. Verify each note's per-line endings unchanged byte-for-byte.
- **T0-D — Schema-level path-traversal rejection**: invoke with `subfolder: "../escape"`. Verify response is the `VALIDATION_ERROR` + `INVALID_SUBFOLDER` + `path-traversal` envelope, no scratch-side write attempted, `pathEscapeAttempt` logger event NOT emitted (Layer 1 rejection fires before Layer 2's logging).
- **T0-E — Bound-exceeded refusal**: seed scratch with `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES=10` and 15 occurrences of the pattern. Invoke preview and commit; verify both return the bound-exceeded `VALIDATION_ERROR` envelope and no scratch-side modification.

Each probe captures a copy-paste record under `specs/038-find-replace/t0-capture/` per the project T0 convention. Probes are run by `/speckit-implement` after the schema and handler unit tests pass; failures during T0 surface as task remediation entries in `tasks.md`.

**Rationale**: Five probes are the minimum to characterise the five highest-impact correctness invariants (preview no-mutate, commit on-disk effect, line-ending preservation, path-traversal rejection, bound-exceeded refusal). Each maps to a top-line SC (SC-001 / SC-002 / FR-015 / SC-006 / SC-008) and exercises a distinct code path (read-only preview / write-temp-then-rename / byte-for-byte preservation / Layer 1 path-safety / handler precondition).

**Alternatives considered**:
- *Skip T0, rely on unit tests only*: rejected. Unit tests mock `fs`; line-ending preservation and same-volume rename atomicity are filesystem behaviours that need a real FS to characterise.
- *Add a T0 probe for drift detection*: deferred. Drift detection is hard to characterise live without orchestrating a concurrent writer; the unit test cohort covers the drift-comparison logic, and the live-write-during-commit case is an operational rather than a correctness invariant.
