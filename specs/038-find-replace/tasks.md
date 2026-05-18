---

description: "Task list for find_and_replace (BI-038) — dependency-ordered, organised by user story."
---

# Tasks: Find and Replace

**Input**: Design documents from `/specs/038-find-replace/` — [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓.

**Tests**: Co-located `*.test.ts` unit tests are MANDATORY per Constitution Principle II (every MCP tool ships with happy-path + failure-or-boundary tests in the same change that adds it). Tests are NOT optional. T0 live-CLI scenarios from quickstart.md run at `/speckit-implement` time per CLAUDE.md `## Test Execution`.

**Organisation**: Tasks are grouped by user story. Setup + Foundational (Phase 1 + 2) build the shared schema, pure utility modules, and Zod contract. User stories then layer the handler logic incrementally — US1 ships the MVP (whole-vault preview→commit), US2 adds the include_* opt-ins, US3 adds the subfolder scope + canonical path check, US4 adds the bound guard.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel — different files, no dependencies on incomplete tasks.
- **[Story]**: User story this task belongs to (US1, US2, US3, US4).
- File paths absolute or repo-rooted.

## Path Conventions

Single-project layout under `src/`. Test files co-located alongside source per Principle II — `src/tools/find_and_replace/handler.ts` ↔ `src/tools/find_and_replace/handler.test.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new per-surface module directory and prepare the docs placeholder.

- [ ] T001 Create the new tool module directory at [src/tools/find_and_replace/](src/tools/find_and_replace/) and seed each file with an `// Original — no upstream.` one-line header per Constitution Principle V. Files to create as empty modules: `schema.ts`, `handler.ts`, `index.ts`, `fence-scan.ts`, `region-scan.ts`, `replace.ts`. Co-located test files `schema.test.ts`, `handler.test.ts`, `index.test.ts`, `fence-scan.test.ts`, `region-scan.test.ts`, `replace.test.ts` get header-only stubs too — tests are filled in by later tasks.
- [ ] T002 [P] Create the docs placeholder at [docs/tools/find_and_replace.md](docs/tools/find_and_replace.md) — a header-only stub that is filled in during the Polish phase per ADR-005 progressive-disclosure convention.

**Checkpoint**: Module directory exists; every file carries its attribution header. No production logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the Zod schemas + three pure utility modules that ALL user stories consume. No handler logic yet — the handler is filled in by US1.

**⚠️ CRITICAL**: No user story task can begin until this phase is complete. Foundational covers FR-001 / FR-002 / FR-006 / FR-007 / FR-008 / FR-009-Layer-1 / FR-010 / FR-017 / FR-019 / FR-022 / FR-025 at the schema + utility layer.

- [ ] T003 [P] Implement the input + output Zod schemas in [src/tools/find_and_replace/schema.ts](src/tools/find_and_replace/schema.ts). Input schema: strict `z.object` carrying `pattern: z.string().min(1).max(1000)` with `superRefine` regex-syntax check (FR-010, regex-mode only — `new RegExp(p, flags)` in try/catch surfaces `INVALID_PATTERN/regex-syntax`), `replacement: z.string().max(1000)`, `mode: z.enum(["literal","regex"]).default("literal")`, `case_insensitive: z.boolean().optional().default(false)`, `subfolder: z.string().optional()` with `superRefine` running `isStructurallySafePath` from [src/path-safety/schema.ts](src/path-safety/schema.ts) (FR-009 Layer 1 — surfaces `INVALID_SUBFOLDER/path-traversal`), `include_code_blocks: z.boolean().optional().default(false)`, `include_html_comments: z.boolean().optional().default(false)`, `commit: z.boolean().optional().default(false)`, `vault: z.string().optional()`. Output schema: `z.discriminatedUnion("mode", [previewBranch, commitBranch])` per FR-025 with the commit branch carrying a `.refine` predicate enforcing `failing_note_locator` IFF `partial === true`. Export `z.infer<…>` types as `FindAndReplaceInput` and `FindAndReplaceOutput`. Per Principle III the schemas are the single source of truth — no parallel TypeScript interfaces.
- [ ] T004 [P] Implement the pure fence-scan utility in [src/tools/find_and_replace/fence-scan.ts](src/tools/find_and_replace/fence-scan.ts) per research.md R2. Function signature `scanFencedCodeBlocks(text: string): Region[]` where `Region = { startOffset: number, endOffset: number, kind: "fenced-code-block" }`. Algorithm: forward scan; open fence is `^```` or `^~~~` at start-of-line; closing fence must use the same character; unclosed-fence-at-EOF emits a region from open-line-start through `text.length` (FR-006 edge case). The function takes a string and returns regions only — no I/O, no deps.
- [ ] T005 [P] Implement the pure region-scan utility for HTML comments in [src/tools/find_and_replace/region-scan.ts](src/tools/find_and_replace/region-scan.ts) per research.md R2. Function signature `scanHtmlComments(text: string): Region[]`. Algorithm: forward scan for `<!--` (anywhere on a line), close at first `-->` (anywhere afterwards); unclosed comment runs to EOF; nested comments are flat per CommonMark. Pure — string in, regions out.
- [ ] T006 [P] Implement the pure replace utility in [src/tools/find_and_replace/replace.ts](src/tools/find_and_replace/replace.ts) per research.md R3 + R6. Exports `applyReplacement(matched: string, regex: RegExp | null, replacement: string, mode: "literal" | "regex"): string` — in `regex` mode returns `matched.replace(regex, replacement)` (native ECMAScript `$1`/`$&`/`$$` semantics); in `literal` mode returns `replacement` verbatim. Also exports `iterateLineMatches(line: string, pattern: string, mode, caseInsensitive, byteOffsetBase): Generator<{ index, matchedSubstring, endIndex }>` with zero-width-skip per BI-037 R8 idiom (advance `lastIndex` by 1 when zero-width fires; do NOT emit the entry). Pure — string in, structured matches out.
- [ ] T007 Implement the schema cohort tests in [src/tools/find_and_replace/schema.test.ts](src/tools/find_and_replace/schema.test.ts). Cases: happy-path validation in literal + regex mode; empty pattern → `INVALID_PATTERN/empty`; over-cap pattern → `INVALID_PATTERN/too-long`; regex-syntax failure → `INVALID_PATTERN/regex-syntax`; over-cap replacement → `INVALID_REPLACEMENT`; path-traversal `subfolder` (`../escape`, leading `/`, leading `\`, drive-letter `C:\`, control char) → `INVALID_SUBFOLDER/path-traversal`; unknown-field rejection; default values resolve to `mode: "literal"`, `case_insensitive: false`, `commit: false`, etc.; output schema accepts a well-formed preview branch; output schema rejects a commit branch with `partial: true` but missing `failing_note_locator`; output schema rejects a commit branch with `partial: false` carrying `failing_note_locator`. Depends on T003.
- [ ] T008 [P] Implement the fence-scan tests in [src/tools/find_and_replace/fence-scan.test.ts](src/tools/find_and_replace/fence-scan.test.ts). Cases: no fences → empty regions; single `\`\`\``/`\`\`\`` pair; single `~~~`/`~~~` pair; mismatched fence character (`\`\`\`` open + `~~~` purported close) treats the tilde as content, fence stays open; unclosed `\`\`\`` runs to EOF; nested fences (a `\`\`\`` inside the body of an outer `\`\`\`` is content, not a new fence). Depends on T004.
- [ ] T009 [P] Implement the region-scan tests in [src/tools/find_and_replace/region-scan.test.ts](src/tools/find_and_replace/region-scan.test.ts). Cases: no comments → empty; single paired comment; multi-line paired comment; multiple comments in one note; nested comment is flat (first `-->` closes); unclosed `<!--` runs to EOF. Depends on T005.
- [ ] T010 [P] Implement the replace utility tests in [src/tools/find_and_replace/replace.test.ts](src/tools/find_and_replace/replace.test.ts). Cases: literal mode verbatim splice; regex mode `$1`/`$2`/`$&`/`$$` semantics; case-insensitive flag in regex mode is equivalent to `i` flag; zero-width regex match is skipped and `lastIndex` advances; multi-match on one line returns each occurrence with the right byte-offset-base. Depends on T006.

**Checkpoint**: Schema + three pure utilities ship with their tests. The handler.ts is still a header-only stub. Tests pass `vitest run`. No story logic yet — every user story consumes these primitives without touching them.

---

## Phase 3: User Story 1 - Preview the replacement before any note changes (Priority: P1) 🎯 MVP

**Goal**: Ship the preview-then-commit MVP for whole-vault scope. Caller issues a request without `commit: true` and receives a deterministic per-occurrence preview; re-issues with `commit: true` and the same notes are rewritten on disk atomically per note with byte-for-byte preservation of unmatched content.

**Independent Test**: Run quickstart.md Scenario 1 — preview five-occurrence pattern across three scratch notes, verify mtimes unchanged + per-occurrence shape; re-issue with `commit: true` and verify on-disk contents updated + byte-for-byte preservation outside the matched spans. Run quickstart.md Scenario 6 — drift detection refuses a stale commit.

This MVP includes whole-vault scope, code-block + HTML-comment SKIP by default, line-ending preservation, ordering invariant, drift detection, FS_WRITE_FAILED partial commit, and the eligible-file `.md` + `.`-prefix-skip filter. It does NOT include the include_* opt-ins (US2), the subfolder argument (US3), or the bound guard (US4).

### Implementation for User Story 1

- [ ] T011 [US1] Implement the `ExecuteDeps` shape and the handler skeleton in [src/tools/find_and_replace/handler.ts](src/tools/find_and_replace/handler.ts). Deps interface: `{ fs: { readdir, readFile, writeFile, rename, unlink }, realpath, randomUUID, env, queue, vaultRegistry, invokeEval, logger }`. The `invokeEval` dep wraps a bug-safe `obsidian eval` call against the constant `FOCUSED_VAULT_TEMPLATE` (parity with write_note's `FOCUSED_FILE_TEMPLATE` at [src/tools/write_note/handler.ts:48](src/tools/write_note/handler.ts#L48)) and is used ONLY on the focused-vault discovery path when `input.vault` is absent (FR-013). Export `executeFindAndReplace(input: FindAndReplaceInput, deps: ExecuteDeps): Promise<FindAndReplaceOutput>`. Body is a stub that throws "not implemented" — populated by T012–T020. Mirror the `ExecuteDeps` shape established by write_note's handler at [src/tools/write_note/handler.ts](src/tools/write_note/handler.ts).
- [ ] T012 [US1] Implement vault resolution + Layer 2 canonical-path check on the vault root in handler.ts. Two branches: (a) `input.vault` **present** → call `deps.vaultRegistry.resolveVaultPath(input.vault)`; unknown name → `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"` (parity with [src/tools/pattern_search/handler.ts:74](src/tools/pattern_search/handler.ts#L74)); registered-but-closed → same `details.code` + `details.reason: "not-open"` (use the same closed-but-registered detection branch the registry / pattern_search already implement). (b) `input.vault` **absent** → call `deps.invokeEval(FOCUSED_VAULT_TEMPLATE)` where the constant template body is `(async()=>JSON.stringify({base:app.vault.adapter.basePath}))()` (parity with write_note's `FOCUSED_FILE_TEMPLATE`); parse the response via the existing `parseEvalResponse` helper pattern at [src/tools/write_note/handler.ts:56](src/tools/write_note/handler.ts#L56); extract `.base` as the absolute vault path. After resolution (either branch), call `deps.realpath(vaultPath)` and `checkCanonicalPath(vaultRoot, ".", deps)` from [src/path-safety/canonical.ts](src/path-safety/canonical.ts) — on `{ ok: false }` throw `PATH_ESCAPES_VAULT` + emit `pathEscapeAttempt` logger event per ADR-009 §2 / FR-009. Depends on T011.
- [ ] T013 [US1] Implement the eligible-file directory walk in handler.ts per research.md R9 (FR-020). `await deps.fs.readdir(scanRoot, { recursive: true, withFileTypes: true })`. Filter: skip Dirent whose name starts with `.`; skip non-files; skip non-`.md` (case-insensitive extension); skip files whose `parentPath` traverses any `.`-prefixed segment (Node's recursive-readdir-flattens-tree behaviour). Returns an array of vault-relative paths in ascending lexicographic order. For the US1 MVP `scanRoot === vaultRoot` (whole vault) — US3 will plumb subfolder. Depends on T012.
- [ ] T014 [US1] Implement the per-note read + LineSpan split in handler.ts per data-model.md §LineSpan. For each eligible note: `await deps.fs.readFile(absPath, "utf8")` returns the source string. Split into `LineSpan[]` retaining the original `endingBytes` (`""` / `"\n"` / `"\r\n"`) on a separate track per FR-015. Strip the trailing `\r` from each `content` field before regex evaluation per BI-035 FR-012 parity. Implementation note: scan the source for `\n` / `\r\n` boundaries; emit a final LineSpan with `endingBytes: ""` for trailing content lacking a closing newline. Depends on T013.
- [ ] T015 [US1] Implement per-note region-aware scanning in handler.ts. For each note: build `skipRegions: Region[]` by calling `scanFencedCodeBlocks(source)` and `scanHtmlComments(source)` (T004 + T005). The US1 MVP ALWAYS skips both region types — the include_* opt-ins are wired in US2 (T026). Pattern compilation MUST honour `input.case_insensitive` per FR-019: in **regex** mode set `flags = input.case_insensitive ? "gi" : "g"` and compile via `new RegExp(input.pattern, flags)`; in **literal** mode compile via `new RegExp(escapeRegex(input.pattern), input.case_insensitive ? "gi" : "g")` — the `i` flag in regex semantics performs ECMAScript-defined case-insensitive matching, which on the ASCII range is equivalent to BI-033 R-Q5's `String.prototype.toLowerCase` rule that the spec FR-019 prescribes for literal mode. (Using `RegExp`'s `i` flag for literal mode is the implementation shortcut; per-byte ASCII-lower-fold yields the same result on the ASCII range, and the spec FR-019 explicitly says non-ASCII characters in literal mode are compared verbatim — equivalent to leaving them as-is in the regex, which the `i` flag honours since it does not Unicode-fold without the `u` flag.) For each line, iterate matches via T006's `iterateLineMatches` helper; for each non-zero-width match, test whether the match's byte offset is inside any region and skip when so. Build `ScanCounts` per data-model.md §ScanCounts. Depends on T011, T014.
- [ ] T016 [US1] Implement the preview-branch envelope construction in handler.ts. From `ScanCounts.perNote`: sort keys ascending lexicographic; for each path, build the `AffectedNote` with `occurrence_count` and `occurrences` sorted by `line_number` then byte offset (FR-004). Per-occurrence: `line_number` (1-based), `full_line` (clipped at 500 UTF-16 code units with trailing `…` U+2026 per BI-033 FR-024), `matched_substring` (uncapped), `replacement_substring` (computed via T006's `applyReplacement` — same function used at commit time). Return `{ mode: "preview", affected_notes, total_occurrences }` when `input.commit !== true`. Depends on T015.
- [ ] T017 [US1] Implement the commit-branch flow in handler.ts per research.md R4. When `input.commit === true`: run the scan a second time (full repeat — same eligible-file walk + region scan + line iteration). Compare `totalOccurrences` of the two scans; if different, throw `VALIDATION_ERROR` + `details.code: "OCCURRENCE_COUNT_DRIFT"` + `details.preview_count` + `details.commit_count`. When the counts agree, the second scan's `perNote` map drives the writes. Depends on T015.
- [ ] T018 [US1] Implement the per-note atomic write in handler.ts per FR-015 + research.md R8. For each note in the second-scan `perNote` map in ascending-path order: (a) call `checkCanonicalPath(vaultRoot, notePath, deps)` from [src/path-safety/canonical.ts](src/path-safety/canonical.ts) — on `{ ok: false }` throw `PATH_ESCAPES_VAULT` AND `deps.logger.warn("pathEscapeAttempt", ...)`; (b) compute the rewritten note content by replacing matched substrings with replacement substrings IN BYTE-FOR-BYTE-PRESERVING fashion (use the LineSpan's `endingBytes` to re-join; never touch unmatched bytes); (c) wrap the actual write in `deps.queue.run(async () => { const tmp = absPath + "." + deps.randomUUID() + ".tmp"; await deps.fs.writeFile(tmp, newContent); try { await deps.fs.rename(tmp, absPath); } catch (e) { await deps.fs.unlink(tmp).catch(() => {}); throw e; } })` — parity with [src/tools/write_note/handler.ts:203](src/tools/write_note/handler.ts#L203). Per-note queue acquisition per FR-024. Depends on T012, T017.
- [ ] T019 [US1] Implement FS write error mapping in handler.ts per FR-021. Catch the per-note write error and surface as `FS_WRITE_FAILED` with `details.errno` carrying the Node errno string (e.g., `ENOSPC`, `EACCES`, `EROFS`). Build a commit response with `partial: true`, `changed_notes` carrying the locators that completed successfully before the failure, `total_occurrences_replaced` carrying the corresponding count, and `failing_note_locator` carrying the locator of the failing note. Halt the batch — no subsequent notes are attempted. Depends on T018.
- [ ] T020 [US1] Implement the commit-branch envelope construction for the full-success case in handler.ts. When all per-note writes complete: return `{ mode: "commit", changed_notes, total_occurrences_replaced, partial: false }` in ascending path order. Depends on T018.
- [ ] T021 [US1] Implement the unit test cohort in [src/tools/find_and_replace/handler.test.ts](src/tools/find_and_replace/handler.test.ts) covering US1's surface. Mocked fs/realpath/randomUUID/queue/vaultRegistry/invokeEval via the in-memory shape established by write_note's test suite. Cases: preview happy-path (three notes, five occurrences, ordering verified); commit happy-path (notes rewritten on disk, byte-for-byte preservation outside spans); preview no-match returns empty success; commit no-match returns empty success; **explicit preview-no-mutate assertion** — invoke preview against a multi-note fixture and assert mocked `fs.writeFile` and `fs.rename` are NEVER called regardless of the result shape (FR-014 / SC-002); code-block-skip default (occurrence inside fence is NOT counted); HTML-comment-skip default (occurrence inside `<!-- -->` is NOT counted); **frontmatter-as-prose**: a leading `---` YAML frontmatter block containing the pattern IS counted and IS replaced — frontmatter is NOT a separately-skipped region per FR-018; drift detected via two-scan mismatch → `OCCURRENCE_COUNT_DRIFT` carrying `details.preview_count` (first scan) and `details.commit_count` (second scan); **per-note read failure during scan** — mocked `fs.readFile` throws `EACCES` for one note → response is `FS_WRITE_FAILED` + `details.reason: "read"` + `details.errno: "EACCES"` + the failing-note locator; NO `partial` flag is carried because no write was attempted; verify mocked `fs.writeFile` was never called; FS_WRITE_FAILED on second-of-three notes during commit → `FS_WRITE_FAILED` + `details.reason: "write"` + commit response carries `partial: true` + first note kept + failing_note_locator surfaced; canonical-level vault escape on scanRoot → `PATH_ESCAPES_VAULT` + `pathEscapeAttempt` log; canonical-level vault escape on per-note path → same; line-ending preservation across CRLF / LF / mixed (synthetic fixtures in memory); trailing-newline preservation; BOM preservation; unknown vault → `CLI_REPORTED_ERROR/VAULT_NOT_FOUND/unknown`; closed vault → `…/not-open`; **focused-vault discovery via `invokeEval`** — `input.vault` absent invokes `invokeEval` exactly once with the `FOCUSED_VAULT_TEMPLATE` body and uses the returned `base` as the vault root; `input.vault` present does NOT invoke `invokeEval` (assert mock call-count is zero); concurrent-commit interleave through the injected Queue (assert call order). Depends on T011..T020.
- [ ] T022 [US1] Implement the factory + descriptor + registration in [src/tools/find_and_replace/index.ts](src/tools/find_and_replace/index.ts). Export `createFindAndReplaceTool(deps): { tool, name, handler }` factory matching the pattern of [src/tools/pattern_search/index.ts](src/tools/pattern_search/index.ts). Tool descriptor uses input schema converted via `zod-to-json-schema`; name is `"find_and_replace"` (FR-023); description is a one-paragraph summary lifted from the spec's user-facing intent. Depends on T003, T011.
- [ ] T023 [US1] Implement the descriptor + registration tests in [src/tools/find_and_replace/index.test.ts](src/tools/find_and_replace/index.test.ts). Cases: descriptor shape matches the project convention (parity with index.test.ts patterns elsewhere); tool name is exactly `"find_and_replace"`; registration via the factory wires the handler. Depends on T022.
- [ ] T024 [US1] Wire `createFindAndReplaceTool` into the boot spine at [src/server.ts](src/server.ts). One-line import + one-line registration in the same place where the existing typed tools are wired (per [src/tools/_register-baseline.json](src/tools/_register-baseline.json)). Boot-spine ownership of `createQueue()`, `createLogger()`, `process.env`, real `fs`, real `randomUUID`, real `realpath`, real `resolveVaultPath` per Constitution Principle I — handler must not reach back into the composition root at runtime. Depends on T022.
- [ ] T025 [US1] Append the `find_and_replace` entry to [src/tools/_register-baseline.json](src/tools/_register-baseline.json) — the registry-stability baseline fixture. The entry includes the tool name + the published `inputSchema` (the zod-to-json-schema-converted shape). Update the entry count and verify the baseline test in `src/tools/_register.test.ts` passes. Depends on T024.

**Checkpoint**: US1 ships the whole-vault preview-then-commit MVP. `npm run lint && npm run typecheck && npm run build && vitest run` all pass. Quickstart Scenarios 1 + 6 can run live against the authorised test vault.

---

## Phase 4: User Story 2 - Skip code blocks and HTML comments by default; opt back in when needed (Priority: P2)

**Goal**: Wire the `include_code_blocks` + `include_html_comments` opt-ins through the handler so callers can deliberately rewrite occurrences inside fenced code blocks OR inside HTML comments (independently).

**Independent Test**: Run quickstart.md Scenarios 2 + 3 — default skip-by-default leaves code/comment occurrences untouched; opt-in surfaces them in the preview AND rewrites them on commit. Independent opt-ins verified by setting one true and the other false.

The schema fields already accept `include_code_blocks` + `include_html_comments` from T003. US2's task is the handler-side flow: when the flag is true, the corresponding region set is NOT applied to the skip list.

- [ ] T026 [US2] Extend the region-aware scan in handler.ts to honour the include_* opt-ins. In the T015 region-build step, conditionally include the fence regions when `input.include_code_blocks !== true` and the comment regions when `input.include_html_comments !== true`. The two opt-ins are independent — opting into one MUST NOT change the other. No new file; this is a focused edit to T015's logic. Depends on T015.
- [ ] T027 [US2] Extend handler.test.ts with the US2 test cohort. Cases: with `include_code_blocks: true` the fence occurrence appears in the preview AND is rewritten on commit; with `include_html_comments: true` the comment occurrence appears in the preview AND is rewritten on commit; with both opt-ins set, both region-occurrences appear; opt-in to one does not change the default of the other (mixed-flag test). Depends on T026.

**Checkpoint**: US2 ships the opt-in path. Quickstart Scenarios 2 + 3 pass live.

---

## Phase 5: User Story 3 - Scope the operation to a chosen subfolder (Priority: P3)

**Goal**: Wire the optional `subfolder` argument through the handler so callers can narrow the blast radius. Path-traversal Layer 1 is already enforced by T003's schema; this story adds the Layer 2 canonical-path check + the unknown-subfolder existence error.

**Independent Test**: Run quickstart.md Scenario 4 — narrowed scope returns only matches under the subfolder. Separately, attempt an unknown-subfolder argument and verify `INVALID_SUBFOLDER` envelope; attempt a symlink that escapes the vault root and verify `PATH_ESCAPES_VAULT` + `pathEscapeAttempt` log.

- [ ] T028 [US3] Extend the scope-resolution step in handler.ts to honour `input.subfolder`. When the argument is present: compute `scanRoot = resolve(vaultRoot, input.subfolder)`; call `checkCanonicalPath(vaultRoot, input.subfolder, deps)` from [src/path-safety/canonical.ts](src/path-safety/canonical.ts) — on `{ ok: false }` throw `PATH_ESCAPES_VAULT` + emit `pathEscapeAttempt` log per FR-009 Layer 2; verify the resolved path exists via `fs.realpath` — on ENOENT throw `VALIDATION_ERROR` + `details.code: "INVALID_SUBFOLDER"` + the subfolder name in `details.subfolder`. When absent, `scanRoot === vaultRoot` (US1's existing default). Depends on T012.
- [ ] T029 [US3] Extend handler.test.ts with the US3 test cohort. Cases: subfolder scope narrows the response (occurrences under sibling subtrees are excluded); unknown-subfolder name → `INVALID_SUBFOLDER` envelope, no notes modified; subfolder pointing at a symlink that resolves outside the vault → `PATH_ESCAPES_VAULT` + `pathEscapeAttempt` log emitted; subfolder pointing at a `.`-prefixed directory (e.g., `subfolder: ".obsidian"`) → either INVALID_SUBFOLDER (if dir doesn't exist) or empty result (if dir exists but FR-020's `.`-prefix-skip applies traversal-time). Depends on T028.

**Checkpoint**: US3 ships subfolder scope + two-layer path safety. Quickstart Scenario 4 passes live.

---

## Phase 6: User Story 4 - Refuse when the safe upper bound on occurrences is exceeded (Priority: P3)

**Goal**: Wire the `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` env-var bound check before any rewrite. Bound applies to preview AND commit; commit also re-checks the bound on the second scan per FR-012(a).

**Independent Test**: Run quickstart.md Scenario 5 — bound configured below scratch occurrence count refuses preview AND commit with the bound-exceeded envelope.

- [ ] T030 [US4] Implement the env-var read in handler.ts per research.md R5. Lazy module-scope cache: on first invocation, read `deps.env["OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES"]`, parse via `Number.parseInt(value, 10)`, fall back to 500 when missing or non-finite-positive-integer, log a WARN via `deps.logger.warn` naming the invalid value. Cache the resolved value for the process lifetime — re-reads of the env var after the first invocation do not propagate. Expose the resolved value as `getMaxOccurrences(deps)` for test injection. Depends on T011.
- [ ] T031 [US4] Wire the bound check at the end of the first scan in handler.ts per FR-011. After `ScanCounts` is computed (T015), compare `totalOccurrences` to `getMaxOccurrences(deps)`. On exceed throw `VALIDATION_ERROR` + `details.code: "OCCURRENCE_COUNT_EXCEEDED"` + `details.bound` (the active bound) + `details.count` (the offending total) + `details.env_var: "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES"`. Applies to BOTH preview and commit paths. Depends on T015, T030.
- [ ] T032 [US4] Wire the bound recheck on the second scan in handler.ts per FR-012(a). On the commit code path, after the second scan completes (T017), repeat the bound check against the second scan's `totalOccurrences` before the drift compare. Vault drift that pushes the count above the bound surfaces as bound-exceeded, not drift. Depends on T017, T031.
- [ ] T033 [US4] Extend handler.test.ts with the US4 test cohort. Cases: bound below scratch count → preview refuses with `OCCURRENCE_COUNT_EXCEEDED` envelope, no notes touched; same → commit refuses identically; bound exactly equal to scratch count → success; env-var unset → default 500 used; env-var set to invalid value (`"abc"`, `"-5"`, `"0"`) → fallback 500 + WARN logged; second-scan count exceeds bound (preview-time was under, commit-time is over) → commit refuses with bound-exceeded, not drift. Depends on T031, T032.

**Checkpoint**: US4 ships the bound guard. Quickstart Scenario 5 passes live.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: T0 live-CLI captures, docs, README update, baseline cleanup.

- [ ] T034 Author the progressive-disclosure docs at [docs/tools/find_and_replace.md](docs/tools/find_and_replace.md) — fills in the T002 placeholder. Sections: when to reach for this tool, input shape (link to contracts/input.md), output shape (preview branch + commit branch — link to contracts/output.md), error cohort (link to contracts/errors.md), worked examples (lift from input.md), env-var operator note (`OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES`). Surfaced by `help()` per ADR-005. Depends on T025 (registration done, tool available for the doc to describe).
- [ ] T035 Run T0 live-CLI capture against the authorised test vault per quickstart.md (Scenarios 1–6) and [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md). Each scenario captures request payload + response payload + invariant verifications to `specs/038-find-replace/t0-capture/scenario-N.md`. Pass / Fail recorded per scenario. Failures surface as remediation entries — added back into Phase 3–6 as fix-up tasks before merge.
- [ ] T036 [P] Update [README.md](README.md) tool list (if the README enumerates typed tools) to add `find_and_replace` with a one-line description. Sibling-parity check: BI-037 added `pattern_search` to the same list — match the entry shape exactly.
- [ ] T037 Verify the full quality-gate cohort passes per Constitution §Development Workflow & Quality Gates: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, `vitest run` (full suite + the new find_and_replace cohort), `vitest --coverage` (aggregate statements coverage at or above the configured threshold). Depends on every preceding task.

**Checkpoint**: BI-038 is ready for `/speckit-analyze` and PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. T001 + T002 can run in parallel (T002 marked [P]).
- **Phase 2 (Foundational)**: Depends on Phase 1 completion. T003 / T004 / T005 / T006 are parallel (different files). T007 depends on T003, T008 on T004, T009 on T005, T010 on T006 — all four tests can run in parallel once their utility module exists.
- **Phase 3 (US1)**: Depends on Phase 2. Within US1: T011 is the gatekeeper; T012 → T013 → T014 → T015 form the scan chain; T016 + T017 + T018 + T019 + T020 layer on top; T021 (handler tests) is the integration gate; T022 + T023 + T024 + T025 are the registration tail.
- **Phase 4 (US2)**: Depends on Phase 3 (specifically T015). T026 + T027 are sequential within US2.
- **Phase 5 (US3)**: Depends on Phase 3 (T012). T028 + T029 are sequential.
- **Phase 6 (US4)**: Depends on Phase 3 (T015, T017). T030 → T031 → T032 → T033 sequential.
- **Phase 7 (Polish)**: T034 depends on T025; T035 depends on T024 (tool callable); T036 [P]; T037 final gate.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational. Ships the MVP — caller has a usable preview→commit flow against the whole vault.
- **US2 (P2)**: Depends on US1's handler skeleton (T015). Strictly additive — does not modify US1 behaviour, only adds an alternate code path triggered by the opt-in flag.
- **US3 (P3)**: Depends on US1's vault resolution (T012). Strictly additive — replaces `scanRoot = vaultRoot` with a conditional scope resolution.
- **US4 (P3)**: Depends on US1's scan output (T015, T017). Strictly additive — adds a precondition check before envelope construction.

### Parallel Opportunities

- Phase 1: T001 + T002 parallel.
- Phase 2: T003 + T004 + T005 + T006 all parallel (different files). Their tests T007 + T008 + T009 + T010 parallel once each utility exists.
- Phase 3: T011 + T021 + T022 + T023 + T024 + T025 are sequential by file-edit dependency (T011 creates handler.ts; T012..T020 extend it; T021 is its co-located test; T022 + T023 are index.ts/index.test.ts; T024 + T025 touch server.ts + the baseline JSON). Inside the handler T012..T020 must serialize because they extend the same file.
- Phase 7: T034 + T036 parallel (different files).

---

## Parallel Example: Phase 2 Foundational

```bash
# Launch all four foundational modules in parallel (different files, no shared state):
Task: "Implement input + output Zod schemas in src/tools/find_and_replace/schema.ts (T003)"
Task: "Implement fence-scan utility in src/tools/find_and_replace/fence-scan.ts (T004)"
Task: "Implement region-scan utility in src/tools/find_and_replace/region-scan.ts (T005)"
Task: "Implement replace utility in src/tools/find_and_replace/replace.ts (T006)"

# Once T003 done, T007 can begin (schema tests). Once T004 done, T008 can begin. etc.
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Setup (T001 + T002).
2. Complete Phase 2: Foundational (T003–T010) — schemas + three pure utilities + their tests.
3. Complete Phase 3: US1 (T011–T025) — preview-then-commit, drift, atomic write, FS error handling, code-block + HTML-comment SKIP defaults.
4. **STOP and VALIDATE**: run quickstart.md Scenarios 1 + 6 against the authorised test vault.
5. The MVP is shippable here — whole-vault preview+commit + skip defaults + drift + bound-via-fixed-500 (US4 makes the bound env-var-overridable; the default fallback is already in T030's spec).

### Incremental Delivery

1. MVP (US1) → demo / merge increment.
2. Add US2 (T026 + T027) → callers can include code blocks / HTML comments when refactoring touches them.
3. Add US3 (T028 + T029) → callers can narrow the blast radius via subfolder.
4. Add US4 (T030–T033) → operator can tune the bound via env-var; bound recheck at commit time.
5. Polish (T034–T037) → docs + T0 captures + quality-gate final pass.

### Critical-Path Sequential Dependencies

- T003 → T007 → handler tests can refer to schema types
- T011 → T012 → T013 → T014 → T015: the scan-chain MUST be built bottom-up
- T015 → T017 (second scan reuses scan logic): the drift check is a structural-reuse, not a re-implementation
- T018 / T020 → T024 → T025: handler complete before registration; registration complete before baseline update
- T024 → T035: tool must be reachable before T0 captures can run

---

## Notes

- [P] = different files, no shared dependencies on incomplete tasks. Most handler tasks are NOT [P] because they all extend the same `handler.ts` file.
- [Story] label appears ONLY on user-story-phase tasks (US1 / US2 / US3 / US4).
- Setup, Foundational, and Polish tasks do NOT carry a Story label.
- Co-located test files are MANDATORY per Constitution Principle II — every task that adds production code in this BI carries the corresponding test extension in the same task OR in the immediately-following test task in the same phase.
- T0 live-CLI capture (T035) is gated by the unit-test cohort being green AND by the test-execution-instructions in `.memory/test-execution-instructions.md` — the assistant MUST read that file before any FS-touching probe.
- Commit boundaries: per Phase 2 (foundational batch), per User Story (story complete + test green + checkpoint validated), per Polish-task (each polish item is its own commit).
- Avoid: rewriting schema.ts in US1+ phases (schema is locked in T003 and only extended by Polish-stage doc tasks); cross-story dependencies that break independence (US2/US3/US4 are strictly additive to US1).
