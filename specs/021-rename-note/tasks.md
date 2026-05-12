---

description: "Task list for 021-rename-note — typed in-place rename of .md notes"
---

# Tasks: Rename Note — Typed In-Place Rename of `.md` Notes

**Input**: Design documents from [/specs/021-rename-note/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED per Constitution Principle II — every public surface ships with happy-path AND failure-or-boundary tests in the same change. Test files are co-located with sources (`*.test.ts` next to `*.ts`) and locked at ~52 cases total per [data-model.md test inventory](./data-model.md) (~25 schema / ~22 handler / ~5 registration). Precedent floor: 30 cases (set by 019-list-files); 021's count exceeds because the extension-handling rule's truth table requires per-row test coverage.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. MVP scope is US1 (specific-mode `.md` rename with extension preservation) — the headline value of the feature. US6 (schema validation) lands FIRST among P1 stories because it's schema-only and covers the broadest swathe of acceptance scenarios. T0 live-CLI characterisation (Phase 4) is BLOCKING for every handler phase because the `parseRenameResponse` regex pattern depends on the captured CLI wording (matches 012-delete-note's T0 precedent).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files OR independent logical-test additions in different `describe` blocks of the same file with no implementation dependencies).
- **[Story]**: `[US1]`..`[US9]` — maps 1:1 to User Story 1..9 in [spec.md](./spec.md). Setup, Foundational, T0, Polish phases carry NO story label.
- Each task description includes the exact file path.

## Path Conventions

Single-project layout. All paths in this file are written as **markdown link targets relative to this file's location** (`specs/021-rename-note/tasks.md`), e.g. `../../src/tools/rename_note/handler.ts` resolves to `c:\Github\obsidian-cli-mcp\src\tools\rename_note\handler.ts`. This is intentionally different from `plan.md`'s convention (which uses repo-root-relative paths like `src/tools/rename_note/handler.ts`); both documents correctly point at the same files from their own viewport. Established precedent per 019/020 tasks.md files. When reading paths in this file, mentally resolve them from the `specs/021-rename-note/` directory.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffold with the project's mandatory header conventions per Constitution V.

- [X] T001 Create the per-surface module directory `src/tools/rename_note/` and scaffold the six new files (`schema.ts`, `schema.test.ts`, `handler.ts`, `handler.test.ts`, `index.ts`, `index.test.ts`), each carrying a `// Original — no upstream.` one-line header per Constitution V / FR-001 (one-line summary describing what each file owns: schema → "rename_note input/output schemas — flat target-mode primitive extension; name with min(1) + folder-separator-rejection regex per /speckit-clarify Q2; renamed z.literal(true) success-only output shape"; handler → "rename_note handler: thin transformer routing parsed input through invokeCli — appendMdIfMissing helper per /speckit-clarify Q1, parseRenameResponse regex locked against T0 capture"; index → "rename_note tool registration via registerTool — responseFormat: json wraps the { renamed, fromPath, toPath } envelope for the MCP wire")

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The zod schema is the single source of truth for both the input AND output AND types per Constitution III. Every test and handler import flows from these schemas, so they MUST land before any per-story work begins. No new target-mode primitive helpers are needed (file-scoped tool — reuses `applyTargetModeRefinement` verbatim, unlike 019's folder-scoped variant).

**⚠️ CRITICAL**: No user story work can begin until Phase 2 is complete.

- [X] T002 Implement `renameNoteInputSchema` in [src/tools/rename_note/schema.ts](../../src/tools/rename_note/schema.ts) per [contracts/rename-note-input.contract.md](./contracts/rename-note-input.contract.md): `applyTargetModeRefinement(targetModeBaseSchema.extend({ name: z.string().min(1).regex(/^[^/\\]+$/, "name must not contain folder separators; use move_note to relocate the file to a different folder") }))`. The `.min(1)` enforces empty-name rejection (FR-003 / Story 6 AC#6); the `.regex(...)` enforces the /speckit-clarify Q2 folder-separator-rejection rule with the `move_note` recovery hint in the message. Import `applyTargetModeRefinement` and `targetModeBaseSchema` from `../../target-mode/target-mode.js` per the post-010 Pattern (a) flat-extension idiom.
- [X] T003 Implement `renameNoteOutputSchema` in [src/tools/rename_note/schema.ts](../../src/tools/rename_note/schema.ts) per FR-005 / FR-006: `z.object({ renamed: z.literal(true), fromPath: z.string(), toPath: z.string() }).strict()`. Add `RenameNoteInput` and `RenameNoteOutput` type exports via `z.infer<typeof renameNoteInputSchema>` and `z.infer<typeof renameNoteOutputSchema>` (no hand-rolled `interface` / `type =` declarations per Constitution III / SC-004).

**Checkpoint**: Schema source-of-truth in place. User stories can begin.

---

## Phase 3: User Story 6 — Schema layer rejects malformed inputs before any CLI call (Priority: P1)

**Goal**: Schema validation is the safety contract for every typed tool. Per FR-016 / SC-001, every invalid input shape MUST reject at the zod boundary AND zero underlying CLI invocations MUST occur. Lands FIRST among the P1 stories because it covers the broadest swathe of acceptance scenarios (8 scenarios) AND it's enforceable purely from the schema file — no handler logic needed. Independent of T0 (Phase 4).

**Independent Test**: run `schema.test.ts` in isolation; assert all ~25 cases pass; assert no `cli-adapter` import is required in the schema-test file (validation is pure-zod).

- [X] T004 [P] [US6] Write all ~25 schema tests in [src/tools/rename_note/schema.test.ts](../../src/tools/rename_note/schema.test.ts) per the [data-model.md test inventory](./data-model.md) section "Schema tests (~25 cases)" AND [contracts/rename-note-input.contract.md](./contracts/rename-note-input.contract.md) validation failure roster: **happy-path** — specific+path+name (Story 1), specific+file+name (Story 2), specific+path+`name.endsWith(".md")` (Story 3 verbatim-forwarding), specific+path+UTF-8 `name` (e.g. `日記`), active+name (Story 5); **failure-path** — specific without locator → VALIDATION_ERROR with "exactly one of" (Story 6 AC#1), specific with both locators → VALIDATION_ERROR both `["file"]` AND `["path"]` paths (Story 6 AC#2), specific without vault → VALIDATION_ERROR with `["vault"]` (Story 6 AC#3), active with vault → VALIDATION_ERROR (Story 6 AC#4a), active with file → VALIDATION_ERROR (AC#4b), active with path → VALIDATION_ERROR (AC#4c), unknown top-level key (e.g. `pancakes: "yes"`) → VALIDATION_ERROR with `code: "unrecognized_keys"` (Story 6 AC#5 — gates `additionalProperties: false` via the `.strict()` base), empty `name: ""` → VALIDATION_ERROR `code: "too_small"` with `["name"]` (Story 6 AC#6), name absent → VALIDATION_ERROR `code: "invalid_type"` with `["name"]` (Story 6 AC#7a), `name: 42` non-string → VALIDATION_ERROR `code: "invalid_type"` (Story 6 AC#7b), `name: "Sub/X"` (forward slash) → VALIDATION_ERROR with `["name"]` and the `move_note` recovery hint in the message (Story 6 AC#8 / /speckit-clarify Q2), `name: "Sub\\X"` (backslash) → same (Story 6 AC#8), `name: "a/b/c"` multiple slashes → VALIDATION_ERROR, `name: "/Fixed"` leading slash → VALIDATION_ERROR, `name: "Fixed/"` trailing slash → VALIDATION_ERROR, `target_mode: "unknown"` invalid discriminator → VALIDATION_ERROR `code: "invalid_enum_value"`, `vault: ""` empty-string → VALIDATION_ERROR `code: "too_small"` (Edge Case), inferred TS type compiles via `expectTypeOf` (compile-time check), output schema validates `{ renamed: true, fromPath: "P", toPath: "P" }` (same-name no-op case from Story 9), output schema rejects `{ renamed: false, ... }` (literal-true gate). Each parse-failure test asserts the resulting error shape (`details.issues[].path`, `code`, message keyword) per the input-contract validation-failure roster.

**Checkpoint**: US6 (input validation) is fully testable independently. The schema is the only deliverable; no handler logic is needed for this story.

---

## Phase 4: T0 Live-CLI Characterisation Pass (BLOCKING for handler phases)

**Purpose**: The plan-stage live-CLI capture (F1) only verified the `rename` subcommand's argv shape from `obsidian help` output. ELEVEN FR-019 gating cases (i)–(xi) plus ONE adversarial-documentation case (xii) — listed in [research.md](./research.md)'s ## FR-019 deferred T0 case roster — are deferred from plan stage. They are captured here as the FIRST implementation task because the `parseRenameResponse` regex pattern in `handler.ts` depends on T0-captured CLI wording — same precedent as 012-delete-note's `RESPONSE_RE = /^(Moved to trash|Deleted permanently): (.+?)\s*$/m` (locked at 012's T0 captures). **Apply test-execution gates** per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — Sandbox/ subdirectory, timestamped fixtures per run, post-state diff, cleanup after.

**⚠️ CRITICAL**: T005 BLOCKS Phase 5–11 (every handler-touching phase). May run parallel with Phase 3 (US6 schema tests are independent of T0).

- [X] T005 T0 Live-CLI probe set against `TestVault-Obsidian-CLI-MCP` Sandbox/ covering the twelve cases (M-1..M-12) in [quickstart.md](./quickstart.md): **(M-1) Specific-mode rename happy path** — seed `Sandbox/T0-rename-001-source.md`; probe `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-rename-001-source.md name=T0-rename-001-renamed.md`; capture verbatim stdout/stderr/exit; **locks `RESPONSE_RE` regex pattern in handler.ts**. **(M-2) Wikilink locator** — seed `Sandbox/T0-rename-002-source.md`; probe with `file=T0-rename-002-source name=T0-rename-002-renamed.md`; verify canonical paths echo. **(M-3) `.md` already in name** — seed `Sandbox/T0-rename-003-source.md`; probe with `name=T0-rename-003-renamed.md`; verify no double-`.md`. **(M-4) Same-name no-op (Story 9)** — seed `Sandbox/T0-rename-004.md`; probe with `name=T0-rename-004.md`; determine accept-with-success vs reject-with-error vs silent-noop; document in `docs/tools/rename_note.md`. **(M-5) Source not found** — probe with `path=Sandbox/T0-DOES-NOT-EXIST.md name=Anything.md`; verbatim error wording + exit code + cli-adapter classification (`CLI_NON_ZERO_EXIT` vs `CLI_REPORTED_ERROR`). **(M-6) Destination collision** — seed BOTH `Sandbox/T0-rename-006a.md` AND `Sandbox/T0-rename-006b.md`; probe with `path=Sandbox/T0-rename-006a.md name=T0-rename-006b.md`; capture verbatim error wording. **(M-7) Unknown vault** — probe with `vault=DoesNotExist rename path=anything.md name=anything-renamed.md`; verify match with 011-R5's `Vault not found.` signature; **if differs, log as a follow-up issue against the cli-adapter** (out of scope for 021 itself per SC-009). **(M-8) Active-mode rename** — open `Sandbox/T0-rename-008.md` as the focused note in Obsidian; probe with `rename name=T0-rename-008-renamed.md`; capture focused-file path echo. **(M-9) Path-traversal (SC-012 gate)** — stage a bait file at `…\Obsidian\bait\sensitive.md` (sibling to vault root per `.memory/test-execution-instructions.md`); probe with `path=../../bait/sensitive.md name=stolen.md`; **verify CLI rejects; if NOT, this BI is amended pre-ship per the locked amendment-shape sketch in [research.md](./research.md) "## SC-012 amendment-shape sketch"** (adds a `.refine()` clause to the `path` field rejecting any `..` segment, plus 2 new schema test cases in T004) — the amendment lands BEFORE T024 (lint) clears. **(M-10) Case-only rename on Windows NTFS-default** — seed `Sandbox/T0-Rename-010.md` (capital R); probe with `name=t0-rename-010.md`; capture observed behaviour (no-op vs rename); document in `docs/tools/rename_note.md`. **(M-11) Consolidation step** — after M-1, M-2, M-3, M-8 complete, lock the `RESPONSE_RE` regex pattern in `handler.ts` and update [research.md](./research.md)'s "## Plan-stage live-CLI findings" with a "## T0 Live-CLI Capture (2026-05-12)" amendment block carrying findings **F2 (rename success response wording), F3 (wikilink-resolved canonical path echo), F4 (`.md`-verbatim no-double-append), F5 (same-name CLI behaviour), F6 (source-not-found wording + classification), F7 (destination-collision wording), F8 (unknown-vault signature match status), F9 (active-mode focused-file echo), F10 (path-traversal CLI behaviour + SC-012 status), F11 (case-only-rename observed behaviour), F12 (response-parser regex pattern lock), F13 (external-editor-locks-the-file behaviour from M-12)**. **(M-12) External-editor-locks-the-file** — open `Sandbox/T0-rename-012-source.md` in Obsidian (focused tab keeps the file open in the editor); from a SEPARATE terminal, probe `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-rename-012-source.md name=T0-rename-012-renamed.md`; capture observed behaviour: does the rename succeed (CLI / OS shrugs at the open file)? does it fail with EBUSY-style stderr (Windows tends to lock open handles)? does Obsidian reopen the buffer at the new path? Document as F13 in research.md and add a one-paragraph "External editor open during rename" subsection to `docs/tools/rename_note.md`'s adversarial-edge-cases section. **NO new test case** at the unit-test layer — the unit suite cannot simulate Obsidian's file-handle behaviour; this is documentation-only. **(Cleanup)** Clean up the entire `Sandbox/` after the probe set, including the M-12 fixture (close the Obsidian tab before deleting); **stop and report to the user** before any further destructive cases if the vault state diverges unexpectedly.

**Checkpoint**: T0 capture complete. `RESPONSE_RE` regex pattern locked. SC-012 path-traversal gate verified (or, if CLI doesn't reject, the BI is amended pre-ship). Handler phases (5–11) unblocked.

---

## Phase 5: User Story 1 — Specific-mode rename via path locator with extension preservation (Priority: P1) 🎯 MVP

**Goal**: Deliver the dominant write path — `rename_note({ target_mode: "specific", vault, path, name })` invokes the CLI's `rename` subcommand with `name` defaulted to `<name>.md` (per /speckit-clarify Q1's `appendMdIfMissing` rule) and returns the structured `{ renamed: true, fromPath, toPath }` shape. This is the MVP — agents can replace `obsidian_exec rename` for the dominant case the moment this story lands. Depends on T005 (Phase 4) for the `RESPONSE_RE` regex pattern.

**Independent Test**: With a stub `spawnFn` injected via `deps`, calling `executeRenameNote({ target_mode: "specific", vault: "MyVault", path: "Inbox/Typo.md", name: "Fixed" }, deps)` against a stub child that exits 0 emitting the T005-captured success response (`Renamed: Inbox/Typo.md → Inbox/Fixed.md\n` or whatever F2 locks) results in (a) `spawnFn.callCount === 1`; (b) the spawn's argv contains `vault=MyVault`, `rename`, `path=Inbox/Typo.md`, `name=Fixed.md` (`.md` appended by `appendMdIfMissing`); (c) the argv does NOT contain `file=...`; (d) the handler returns `{ renamed: true, fromPath: "Inbox/Typo.md", toPath: "Inbox/Fixed.md" }`.

### Implementation for User Story 1

- [X] T006 [US1] Implement the `appendMdIfMissing(name: string): string` file-local helper in [src/tools/rename_note/handler.ts](../../src/tools/rename_note/handler.ts) per /speckit-clarify Q1 / R6 / [contracts/rename-note-handler.contract.md](./contracts/rename-note-handler.contract.md): ~3 LOC `return name.endsWith(".md") ? name : name + ".md"`. Literal byte equality, case-sensitive. Mirrors 020-fix-write-gaps R2's `endsWith(".md")` predicate exactly. **NO** regex, **NO** `path.extname`, **NO** normalisation. Add a short comment citing /speckit-clarify Q1 and the 020-R2 precedent. The helper is NOT exported (file-local).
- [X] T007 [US1] Implement the `parseRenameResponse(stdout: string): { fromPath: string; toPath: string }` file-local helper in [src/tools/rename_note/handler.ts](../../src/tools/rename_note/handler.ts) per R8: define `const RESPONSE_RE = /<T0-locked-pattern>/m;` (pattern locked at T005-M11; document with a comment `// Locked at T0 (F2/F12) — see research.md ## T0 Live-CLI Capture (2026-05-12).`); match `stdout.trimStart()` against `RESPONSE_RE`; on success return `{ fromPath: match[1]!, toPath: match[2]! }`; on no-match throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { stdout }, message: `rename_note could not parse CLI response: ${stdout.trimStart().slice(0, 200)}` })`. Pattern strictly mirrors 012-delete-note's `parsePath` helper at `src/tools/delete_note/handler.ts:19-28`.
- [X] T008 [US1] Implement `executeRenameNote(input, deps): Promise<RenameNoteOutput>` main body in [src/tools/rename_note/handler.ts](../../src/tools/rename_note/handler.ts) per R3 / R9 / [contracts/rename-note-handler.contract.md](./contracts/rename-note-handler.contract.md) handler-body sketch: compute `forwardedName = appendMdIfMissing(input.name)`; build `parameters` record — specific mode includes optional `file: input.file` OR `path: input.path` (locator XOR enforced by schema) + always `name: forwardedName`; active mode includes only `{ name: forwardedName }`. Single `invokeCli({ command: "rename", vault: input.target_mode === "specific" ? input.vault! : undefined, parameters, flags: [], target_mode: input.target_mode }, { spawnFn, env, logger, queue })` call. Apply `parseRenameResponse(stdout)` to the result. Return `{ renamed: true, fromPath, toPath }`. Add `ExecuteDeps` interface and required imports. Trust validated input per Constitution III — no defensive checks for `vault === undefined` in specific mode (schema guarantees it's present). Pattern strictly mirrors `src/tools/delete_note/handler.ts:30-50`.

### Tests for User Story 1

- [X] T009 [P] [US1] Write 5 happy-path handler tests in [src/tools/rename_note/handler.test.ts](../../src/tools/rename_note/handler.test.ts) per [data-model.md test inventory](./data-model.md) handler.test.ts cases #1, #9, #19 + the appendMdIfMissing core invariant: **Case 1 (Story 1 IT)** specific+path+`name: "Fixed"` against stub stdout matching F2's pattern → argv contains `vault=V`, `rename`, `path=Inbox/Typo.md`, `name=Fixed.md`; response `{ renamed: true, fromPath: "Inbox/Typo.md", toPath: "Inbox/Fixed.md" }`. **Case 2 (appendMdIfMissing baseline)** `name: "Fixed"` produces argv name token `"Fixed.md"`. **Case 3 (parseRenameResponse)** stub stdout matching the F2/F12-locked pattern → fromPath/toPath extracted byte-perfectly (no trim, no normalisation). **Case 4 (single-spawn R9)** `spawnFn.callCount === 1` after a successful call. **Case 5 (vault hoist)** argv has `vault=V` as a discrete token, NOT nested in `parameters` (per 011-write-note PSR-3). Each test injects `deps.spawnFn` via the standard test-seam pattern from [contracts/rename-note-handler.contract.md](./contracts/rename-note-handler.contract.md) "Test seam pattern" section.

**Checkpoint**: US1 is fully functional and testable independently. The MVP slice ships once T016 (registration) + T018 (server wiring) land in Phase 12.

---

## Phase 6: User Story 2 — Specific-mode rename via wikilink locator (`file=`) (Priority: P1)

**Goal**: same rename surface against `target_mode: "specific"` with `file` instead of `path` — the CLI resolves the wikilink to a concrete on-disk location. Same single-spawn architecture as US1; the only argv difference is `file=` vs `path=`. UTF-8 multi-byte locator forwarding is verified byte-perfect.

**Independent Test**: with a stub adapter that exits 0 reporting `Inbox/QuickNote.md` as the canonical source and `Inbox/Quick Note.md` as the canonical destination, calling `executeRenameNote({ target_mode: "specific", vault: "V", file: "QuickNote", name: "Quick Note" })` results in the spawn being invoked with argv containing `vault=V`, `rename`, `file=QuickNote`, `name=Quick Note.md` (and NOT `path=...`); handler returns `{ renamed: true, fromPath: "Inbox/QuickNote.md", toPath: "Inbox/Quick Note.md" }`.

- [X] T010 [P] [US2] Write 2 wikilink-locator handler tests in [src/tools/rename_note/handler.test.ts](../../src/tools/rename_note/handler.test.ts) per data-model.md cases #6 + #8: **Case 6 (Story 2 IT)** specific+file+name produces argv with `file=QuickNote`, `name=Quick Note.md`, NO `path=` token; response reflects CLI-resolved canonical from/to paths. **Case 7 (UTF-8 byte-perfect)** `file: "笔记"`, `name: "日記"` → argv tokens contain exact byte sequences `笔记` and `日記.md`; no transcoding, no normalisation. Both tests inject `deps.spawnFn`; assert `spawnFn.callCount === 1`.

**Checkpoint**: US2 lands. Both locator forms (`file=` and `path=`) work end-to-end via stub spawn injection.

---

## Phase 7: User Story 5 — Active-mode renames the focused note (Priority: P1)

**Goal**: same rename surface against `target_mode: "active"` — the CLI defaults to the focused file (per `obsidian help`'s "most commands default to the active file when file/path is omitted" rule). The handler routes through the cli-adapter with no `vault=` / `file=` / `path=` tokens; only `name=<appended>` is sent.

**Independent Test**: with a stub adapter that exits 0 reporting a focused-note rename, calling `executeRenameNote({ target_mode: "active", name: "Today" })` results in argv containing `rename`, `name=Today.md`, and NO `vault=` / `file=` / `path=` tokens; handler returns `{ renamed: true, fromPath: "<focused>", toPath: "<focused folder>/Today.md" }`.

- [X] T011 [P] [US5] Write 2 active-mode handler tests in [src/tools/rename_note/handler.test.ts](../../src/tools/rename_note/handler.test.ts) per data-model.md cases #7 + the ERR_NO_ACTIVE_FILE propagation: **Case 8 (Story 5 AC#1)** active+name → argv contains `rename`, `name=Today.md`, NO locator tokens; response reflects the CLI-resolved focused-file from/to paths. **Case 9 (Story 5 AC#3)** stub adapter throws `UpstreamError({ code: "ERR_NO_ACTIVE_FILE", ... })` → handler propagates the error verbatim; assert `spawnFn.callCount === 1` (the adapter call happens, the stub error is raised inside it). The Story 5 AC#2 forbidden-key-in-active-mode case is already covered by T004 (schema layer rejects before the handler runs).

**Checkpoint**: US5 lands. Target-mode parity with every other typed tool achieved.

---

## Phase 8: User Story 4 — Source-not-found and destination-collision structured errors (Priority: P1)

**Goal**: Two of the three most common rename failure modes (the third is no-active-file in active mode, covered by US5) surface as structured `UpstreamError` with `code: "CLI_REPORTED_ERROR"` (or `CLI_NON_ZERO_EXIT` per the cli-adapter's classification of the T0-captured wording). `details.message` carries the verbatim CLI line so callers can distinguish "source wrong, retry locator" from "destination taken, pick different name".

**Independent Test**: With a stub adapter raising the T005-captured source-not-found error (F6) for `path=Inbox/Missing.md`, calling `executeRenameNote` returns an MCP error response with the captured code AND `details.message` matching the verbatim CLI line. Same for destination collision (F7).

- [X] T012 [P] [US4] Write 2 structured-error handler tests in [src/tools/rename_note/handler.test.ts](../../src/tools/rename_note/handler.test.ts) per data-model.md cases #13 + #14: **Case 10 (Story 4 AC#1)** stub adapter throws `UpstreamError({ code: <F6-classified>, details: { message: <F6-verbatim> } })` for source-not-found → handler propagates verbatim; `spawnFn.callCount === 1`. **Case 11 (Story 4 AC#2)** stub adapter throws `UpstreamError({ code: <F7-classified>, details: { message: <F7-verbatim> } })` for destination-collision → handler propagates verbatim. The exact codes and message text depend on F6 / F7 captured at T005 — **see [research.md](./research.md) "## T0 Live-CLI Capture (2026-05-12)" amendment block** (added by T005-M11 consolidation step). F6 = source-not-found verbatim wording from M-5; F7 = destination-collision verbatim wording from M-6. Tests reference F6 / F7 by name and use the captured values literally.

**Checkpoint**: US4 lands. Agents see actionable structured errors for the two most common write-failure modes.

---

## Phase 9: User Story 7 — CLI failures (binary, non-zero exit, in-band Error, no-active-file) flow through UpstreamError (Priority: P1)

**Goal**: Every cli-adapter-raised `UpstreamError` propagates verbatim through `executeRenameNote`. Non-`UpstreamError` exceptions escape verbatim (no `asToolError` wrapping). The handler does NOT classify, mask, or rewrite errors — it only catches inside `registerTool` (which is at a layer above the handler).

**Independent Test**: For each of the four cli-adapter error codes (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) plus the parseRenameResponse-failure case plus the non-`UpstreamError` re-throw case: drive the handler through an injected stub; assert the appropriate error shape is produced; assert `spawnFn.callCount === 1` for the adapter-error cases (the spawn DID happen, the adapter raised the error inside it).

- [X] T013 [P] [US7] Write 6 error-propagation handler tests in [src/tools/rename_note/handler.test.ts](../../src/tools/rename_note/handler.test.ts) per data-model.md cases #11–#18: **Case 12 (Story 7 AC#1)** stub `spawnFn` raises `ENOENT` → adapter raises `CLI_BINARY_NOT_FOUND` with 017-cross-platform-support structured details (`platform`, `attempts[]`, `PATH`) → handler propagates. **Case 13 (Story 7 AC#2)** stub exits 1 with stderr `"permission denied"` → `CLI_NON_ZERO_EXIT` with `details.exitCode: 1`, `details.stderr` verbatim. **Case 14 (Story 7 AC#3)** stub exits 0 with stdout `"Error: <some-msg>\n"` → adapter classifies as `CLI_REPORTED_ERROR`; handler propagates verbatim with `details.message` carrying the captured line. **Case 15 (Edge Cases inherited from 011-R5)** stub returns the unknown-vault response (e.g. `"Vault not found.\n"` per F8 — **see [research.md](./research.md) "## T0 Live-CLI Capture (2026-05-12)" amendment** for the verified signature from T005-M7; if F8 captured a signature that DOES NOT match the 011-R5 baseline, the adapter's response-inspection logic needs extension as a follow-up against the cli-adapter, NOT against `rename_note` — per SC-009 freeze) → adapter's response-inspection clause re-classifies to `CLI_REPORTED_ERROR`; handler propagates. **Case 16 (Story 7 AC#4)** stub raises a non-`UpstreamError` exception (e.g. `new TypeError("boom")`) → handler re-throws verbatim, NO `asToolError` wrapping. **Case 17 (parseRenameResponse failure)** stub exits 0 with unparsable stdout (`"OK\n"` — doesn't match `RESPONSE_RE`) → handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stdout: "OK\n" } })` via the parseRenameResponse fallback per T007.

**Checkpoint**: US7 lands. Every CLI failure mode produces a structured response observable from a single boundary (the `registerTool` wrapper, exercised at the index.test.ts layer in Phase 12).

---

## Phase 10: User Story 3 — Internal periods preserved; non-`.md` trailing segments are NOT extensions (Priority: P2)

**Goal**: The /speckit-clarify Q1 scope narrowing — only literal `.md` (case-sensitive byte equality) triggers verbatim forwarding. Internal periods are preserved (`Doc.v1.draft` → `Doc.v1.draft.md`); case-sensitive `.MD` does NOT match `.md` and gets `.md` appended; cross-extension renames like `name: "Sketch.canvas"` produce `Sketch.canvas.md` (not `Sketch.canvas` verbatim — that would be a cross-extension type conversion, out of scope; callers route through `obsidian_exec`).

**Independent Test**: For each Story 3 input pattern, call the handler with a stub adapter; assert the argv `name` token matches the expected `appendMdIfMissing` output verbatim.

- [X] T014 [P] [US3] Write 4 extension-rule handler tests in [src/tools/rename_note/handler.test.ts](../../src/tools/rename_note/handler.test.ts) per data-model.md cases #2 (b2), #3 (b3), #4 (b4), #5 (b5): **Case 18 (b2 verbatim-`.md`-forwarding)** `name: "Fixed.md"` → argv `name` token = `"Fixed.md"` (no double-append). **Case 19 (b3 case-sensitive)** `name: "Renamed.MD"` → argv `name` token = `"Renamed.MD.md"` (`.MD` ≠ `.md` case-sensitively → append; per Story 3 AC#2). **Case 20 (b4 internal periods)** `name: "Doc.v1.draft"` → argv `name` token = `"Doc.v1.draft.md"` (`.draft` ≠ `.md` → append; per Story 3 AC#1). **Case 21 (b5 cross-extension narrowing)** `name: "Sketch.canvas"` → argv `name` token = `"Sketch.canvas.md"` (`.canvas` ≠ `.md` → append; cross-extension renames out of scope per Story 3 AC#3; the test asserts the wrapper's behaviour, NOT the user-facing scope-decision — that's documented in `docs/tools/rename_note.md` Scope section).

**Checkpoint**: US3 lands. The Story 3 AC#2 case-sensitive rule and the Story 3 AC#3 cross-extension scope narrowing are both observable from tests.

---

## Phase 11: User Story 9 — Same-name rename is a successful no-op (Priority: P3)

**Goal**: When `appendMdIfMissing(name)` resolves to the same canonical destination path as the source, the handler returns success with `fromPath === toPath` by string equality. The underlying CLI's behaviour (accept-with-success vs reject-with-error vs silent-noop) is captured at T005 M-4 (F5); the wrapper's contract is to propagate whatever the CLI does without special-casing.

**Independent Test**: stub adapter returns success stdout with identical fromPath and toPath (matching F5's accept-with-success branch if that's what the CLI does); calling `executeRenameNote({ target_mode: "specific", vault: "V", path: "Inbox/Note.md", name: "Note" })` returns `{ renamed: true, fromPath: "Inbox/Note.md", toPath: "Inbox/Note.md" }`.

- [X] T015 [P] [US9] Write 1 same-name-no-op handler test in [src/tools/rename_note/handler.test.ts](../../src/tools/rename_note/handler.test.ts) per data-model.md case #22: **Case 22 (Story 9 AC#1)** stub adapter exits 0 with stdout matching F5's success-shape for an unchanged path pair → handler returns `{ renamed: true, fromPath: "Inbox/Note.md", toPath: "Inbox/Note.md" }`; assert `fromPath === toPath` by string equality. **If F5 found the CLI rejects same-name renames** (reject-with-error branch), this test is rewritten to assert the structured error propagation per the captured wording; document the F5 finding in `docs/tools/rename_note.md` accordingly. **If F5 found silent-noop**, the test asserts the response carries identical paths AND the call did not error.

**Checkpoint**: US9 lands. The audit-trail invariant `fromPath === toPath` is observable for the no-op case (or the structured-error invariant if the CLI rejects).

---

## Phase 12: User Story 8 — Tool registration, descriptor, docs (Priority: P2)

**Goal**: Per ADR-005 + ADR-006, every tool registered with the MCP server passes its `zod-to-json-schema` output through the schema-stripping utility AND its top-level `description` is a concise verb-led summary that mentions `help("rename_note")` AND surfaces the vault-config-dependent link-rewriting caveat. The non-stub `docs/tools/rename_note.md` body documents the input schema, output shape, error roster, link-rewriting caveat, Scope section (per /speckit-clarify Q1 scope narrowing), and ≥4 worked examples per FR-014.

**Independent Test**: `createRenameNoteTool({ logger, queue })` returns a `RegisteredTool` whose descriptor passes all five contract checks (name, stripped schema, description content, doc presence, drift detector implicit coverage).

- [X] T016 [US8] Implement `createRenameNoteTool` factory in [src/tools/rename_note/index.ts](../../src/tools/rename_note/index.ts) per FR-011 / FR-012: import `registerTool` from `../_register.js`, `executeRenameNote` and `ExecuteDeps` from `./handler.js`, `renameNoteInputSchema` from `./schema.js`, and `RegisteredTool` type from `../_shared.js`. Export `RENAME_NOTE_TOOL_NAME = "rename_note"` and `RENAME_NOTE_DESCRIPTION = 'Rename a note in an Obsidian vault in place. Honours the vault\'s "Automatically update internal links" setting; link-rewriting is vault-config-dependent. Scoped to .md notes — non-.md targets use obsidian_exec rename directly. Call help({ tool_name: "rename_note" }) for full parameter docs and the error-code roster.'` (per FR-012's structural contract: verb-led summary + `help` mention with tool's own name + link-rewriting caveat + Scope mention). Export `RegisterDeps = ExecuteDeps`. Implement factory `createRenameNoteTool(deps: RegisterDeps): RegisteredTool` returning `registerTool({ name: RENAME_NOTE_TOOL_NAME, description: RENAME_NOTE_DESCRIPTION, schema: renameNoteInputSchema, deps, handler: async (input, d) => executeRenameNote(input, d) })`. Pattern strictly mirrors `src/tools/delete_note/index.ts`.
- [X] T017 [P] [US8] Write 6 registration tests in [src/tools/rename_note/index.test.ts](../../src/tools/rename_note/index.test.ts) per data-model.md test inventory and Story 8 ACs: **Case 1** `createRenameNoteTool({ logger: stubLogger, queue: stubQueue })` returns a `RegisteredTool`; `descriptor.name === "rename_note"`. **Case 2 (Story 8 AC#1, AC#2)** descriptor's `inputSchema` has zero `description` keys at any depth (walk the JSON Schema tree); top-level `additionalProperties: false`; all five top-level properties (`target_mode`, `vault`, `file`, `path`, `name`) typed inline; no `oneOf` envelope. **Case 3 (Story 8 AC#3)** descriptor's `description` field is non-empty, contains `"help"` case-insensitive, references `"rename_note"` by name, contains link-rewriting caveat keywords (e.g. `"link"`, `"vault"`, or `"Automatically update"`). **Case 4 (Story 8 AC#4 / FR-014)** read `docs/tools/rename_note.md` from `import.meta.url` resolved path; assert file exists; does NOT contain `<!-- TODO -->` or `<!-- stub -->`; positively contains all five propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`); contains the Scope section heading (e.g. `## Scope` or similar); contains the link-rewriting caveat (e.g. `"Automatically update internal links"`); contains ≥4 example blocks (e.g. ` ```json` fence count ≥ 4). **Case 5** registered handler validates input via the schema and propagates `VALIDATION_ERROR` for malformed input — exercise with `{ target_mode: "specific", vault: "V", name: "" }` (empty name) → expect `isError: true` response with `code: "VALIDATION_ERROR"` in the structured payload. **Case 6 (FR-009 structural lock — thin handler invariant)** read [src/tools/rename_note/handler.ts](../../src/tools/rename_note/handler.ts) via `fs.readFileSync` resolved from `import.meta.url`; assert the file contents contain ZERO matches for the regex `/logger\.(callStart|callEnd|callEndSuccess|callEndFailure)/`; assert the file contents contain ZERO direct invocations of `deps.logger` other than passing it through to `invokeCli`'s `deps` argument (positive assertion: exactly one `deps.logger` token appears, and it sits inside the `invokeCli({ ... }, { ... logger: deps.logger ... })` call site). This lock prevents future drift toward per-call logger events at the tool layer (FR-009 / R1 / mirrors the 011/012/013/015 precedent); the assertion is grep-based and runs in O(file-size) without parsing TypeScript. If a future contributor adds a typed logger event at the handler layer, this test fires.
- [X] T018 [US8] Register `createRenameNoteTool` in [src/server.ts](../../src/server.ts): add the import alphabetically between `createReadPropertyTool` (line ~21) and `createWriteNoteTool` (line ~22): `import { createRenameNoteTool } from "./tools/rename_note/index.js";`. Add the tools-array entry alphabetically between `createReadPropertyTool({ logger, queue })` and `createWriteNoteTool({ logger, queue, vaultRegistry })` at line ~89: `createRenameNoteTool({ logger, queue }),`. +2 lines total. NO other edits to `src/server.ts` per SC-009.
- [X] T019 [US8] Write [docs/tools/rename_note.md](../../docs/tools/rename_note.md) (~220 lines) per FR-014 + [contracts/rename-note-input.contract.md](./contracts/rename-note-input.contract.md) + [contracts/rename-note-handler.contract.md](./contracts/rename-note-handler.contract.md): **(1) Input schema section** — per-field rules for `target_mode`, `vault`, `file`, `path`, `name`; cross-field XOR rule; the name's `.min(1)` + folder-separator-rejection regex + the `.md` allowlist rule per /speckit-clarify Q1 / Q2 with the exact byte-equality wording. **(2) Output shape section** — `{ renamed: true, fromPath, toPath }`; `fromPath === toPath` as the same-name-no-op marker (per F5). **(3) Error roster section** — the five propagated codes with one-or-two sentences each. **(4) Link rewriting section** — explicit caveat that link-rewriting is vault-config-dependent per the user input's [P1] AC #13; the wrapper does NOT enforce. **(5) Scope section** — `.md`-only allowlist per /speckit-clarify Q1 scope narrowing; non-`.md` filename targets route through `obsidian_exec rename`; one worked example of the `obsidian_exec` fallback. **(6) Worked examples section** — at least 4 + 2 recommended: (i) basic `.md` rename (`name: "Fixed"` → `Fixed.md`); (ii) verbatim-`.md`-forwarding (`name: "Fixed.md"` → `Fixed.md`); (iii) internal periods (`name: "Doc.v1.draft"` → `Doc.v1.draft.md`); (iv) destination-collision failure with F7 verbatim wording; (v) [recommended] folder-separator-rejection (`name: "Sub/X"` → `VALIDATION_ERROR` with `move_note` recovery hint); (vi) [recommended] cross-extension via `obsidian_exec` fallback. **(7) Adversarial edge cases section** — F4 same-name CLI behaviour (per F5), F11 case-only-rename observed behaviour (per F11), Unicode normalisation on macOS HFS+. **(8) Aliased wikilinks section** — note that `[[Real Path|Display]]` link rewriting affects the path side; display text persists. **(9) Cross-references** — links to target-mode primitive, post-010 flat encoding, cli-adapter, help tool, and write_note / delete_note as sibling write-side tools. NO `// Original — no upstream.` header (Markdown exempt). NO TODO/stub marker.
- [X] T020 [P] [US8] Add the `rename_note` entry to [docs/tools/index.md](../../docs/tools/index.md) — one-line entry alphabetically inserted between `read_property` and `write_note` (or wherever rename_note lands alphabetically) consistent with the existing entries; the line should summarise: "Rename a `.md` note in place; honours the vault's auto-update-links setting."

**Checkpoint**: US8 lands. Tool registered; server boots with the new entry; `help({ tool_name: "rename_note" })` reads from the new doc; the drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers the new tool via its `it.each` registry walk (NO edit to `_register.test.ts` needed); the registry-consistency test at [src/server.test.ts](../../src/server.test.ts) auto-asserts the doc's existence (NO edit needed).

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: external surfaces, release artefacts, final validation.

- [X] T021 [P] Bump version in [package.json](../../package.json) from `0.4.3` to `0.4.4` per SC-016 (patch level — purely additive surface; no existing tool changes, no error codes, no ADRs amended).
- [X] T022 [P] Add an entry to [CHANGELOG.md](../../CHANGELOG.md) for `0.4.4` summarising: **typed rename_note tool** — in-place rename of `.md` notes via the CLI's `rename` subcommand; structured `{ renamed: true, fromPath, toPath }` output; `.md` extension preservation via case-sensitive `endsWith(".md")` (mirrors 020-fix-write-gaps R2); folder-separator rejection at the schema layer (with `move_note` recovery hint); link-rewriting is vault-config-dependent (Settings → Files & Links → "Automatically update internal links"). The entry MUST also include a **discrete SC-015 routing bullet** (separate from the rename_note feature summary) that names the published escape-hatch policy: *"For rename operations, prefer `rename_note`. `obsidian_exec rename file=… name=…` remains the fallback for non-`.md` targets (`.canvas`, `.pdf`, attachments) and any cross-extension type conversion (`.md → .canvas` etc.) — those are explicitly out of scope for `rename_note` per the /speckit-clarify Q1 scope narrowing."* Cite spec/plan paths.
- [X] T023 [P] Update [README.md](../../README.md) tools-list section if present — one row added consistent with existing entries.
- [X] T024 Run `npm run lint` and confirm zero warnings (Constitution Development Workflow gate 1).
- [X] T025 Run `npm run typecheck` and confirm zero errors (Constitution gate 2).
- [X] T026 Run `npm run build` and confirm successful build (Constitution gate 3).
- [X] T027 Run `npm test` (vitest run) and confirm: (a) all ~52 new tests pass; (b) existing test suite still passes byte-stable per SC-009; (c) aggregate `statements` coverage threshold at [vitest.config.ts:20](../../vitest.config.ts#L20) remains at or above the existing 91.3% floor (Constitution gate 5). If coverage ratchets up, ratchet the threshold line by one-line edit; if it doesn't change, leave the line alone.
- [X] T028 Walk through the 33 + 12 quickstart scenarios at [quickstart.md](./quickstart.md) — S-1..S-33 are unit-test verifications already covered by T004 / T009 / T010 / T011 / T012 / T013 / T014 / T015 / T017; tick each off. M-1..M-12 were covered by T005 (M-12 is the external-editor documentation-only probe added by /speckit-analyze U2 remediation; capture F13 as the observed behaviour). Verify the four key SC gates: **SC-001** (acceptance scenario count of 29 from spec — verified by combined test pass); **SC-006** (help body presence + content + Scope section + obsidian_exec routing note from T022's discrete SC-015 bullet); **SC-012** (path-traversal precondition — verified at T005 M-9; if CLI did NOT reject, this BI's pre-ship amendment landed per [research.md](./research.md) "## SC-012 amendment-shape sketch" before T027); **SC-014** (folder-separator regex enforces validation-layer reject — verified at T004 cases for `name: "Sub/X"` and `name: "Sub\\X"`); **SC-015** (obsidian_exec routing) verified via T022's CHANGELOG entry containing the discrete routing bullet. Confirm each S-N lands as documented; report any drift from F1–F13 findings as a research.md amendment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately.
- **Phase 2 (Foundational — schemas)**: depends on Phase 1. BLOCKS every user story.
- **Phase 3 (US6 schema validation)**: depends on Phase 2. PARALLEL with Phase 4 (T0) — schema tests don't need T0 captures.
- **Phase 4 (T0 Live-CLI Pass)**: depends on Phase 1 (module scaffold for storage but probes don't touch code yet). **BLOCKS Phases 5–11** (every handler phase) because the `parseRenameResponse` regex pattern depends on F2/F12 captures.
- **Phase 5 (US1 MVP)**: depends on Phase 2 + Phase 4 (handler imports schema types; regex pattern from T0).
- **Phase 6 (US2 file locator)**: depends on Phase 5 (handler must exist; argv shape established).
- **Phase 7 (US5 active mode)**: depends on Phase 5 (handler must exist).
- **Phase 8 (US4 source/dest errors)**: depends on Phase 4 + Phase 5 (T012 references F6 / F7 captured at T005 verbatim).
- **Phase 9 (US7 CLI failures)**: depends on Phase 5 (handler must exist for stub-error tests to reach it).
- **Phase 10 (US3 extension-rule edge cases)**: depends on Phase 5 (`appendMdIfMissing` helper must exist).
- **Phase 11 (US9 same-name no-op)**: depends on Phase 4 + Phase 5 (T015 references F5 captured at T005).
- **Phase 12 (US8 Registration + docs)**: depends on Phase 5 (handler must be feature-complete; T017's Case 5 exercises the registerTool round-trip for VALIDATION_ERROR).
- **Phase 13 (Polish)**: depends on Phase 12 (tool must be live before lint/typecheck/build/test pass).

### Within Each User Story

- Schema (T002, T003) before handler (T006–T008).
- Helpers (T006, T007) before main function body (T008).
- Handler body (T008) before handler tests (T009–T015).
- Handler tests + registration (T016–T018) before registration tests (T017) — actually T016 and T017 land together; T017 imports the factory from T016.
- Docs (T019) can land in parallel with T016/T017 but the doc-presence test in T017 Case 4 reads the file, so T019 must complete before T017's Case 4 runs (T017 written before T019 lands is OK; T017 Case 4 will fail until T019 lands — that's the right RED-GREEN cycle).
- Server wiring (T018) after T016 (the factory must exist before it can be imported).

### Parallel Opportunities

- Within Phase 2: T002 and T003 both edit `schema.ts` — sequential.
- Within Phase 3: T004 alone (one test file).
- Within Phase 4: T005 is a single orchestrated probe sweep — sequential within itself.
- Within Phase 5: T006 → T007 → T008 strictly sequential (T008 imports T006 and T007 helpers). T009 [P] runs after T008.
- Within Phase 6, 7, 8, 9, 10, 11: each phase is a single test-task — [P] tasks across these phases CAN run in parallel by different contributors as long as the `handler.test.ts` file edits don't conflict (each test phase adds new `describe` / `it` blocks).
- Within Phase 12: T016 → T017 sequential (T017 imports T016); T017 and T019 [P] (different files); T018 [P] (different file); T020 [P] (different file). T019's completion gates T017's Case 4 assertions but the test file can be written before the doc lands.
- Within Phase 13: T021 / T022 / T023 are [P] — `package.json`, `CHANGELOG.md`, `README.md` (different files).
- Constitutional gates (T024 / T025 / T026 / T027) run sequentially because they share the build output.

---

## Parallel Example: User Story 1 (Phase 5)

Once T002 / T003 / T005 / T006 / T007 / T008 land, the handler tests (T009) and the cross-story handler tests (T010 / T011 / T012 / T013 / T014 / T015) can be drafted in parallel by different contributors — they all add new `describe` / `it` blocks to `handler.test.ts`. The handler implementation itself (T006 → T007 → T008) is strictly sequential within `handler.ts` (T008 imports helpers from T006 and T007).

```text
# Sequential within handler.ts:
T006 Implement appendMdIfMissing helper (per /speckit-clarify Q1)
T007 Implement parseRenameResponse helper + RESPONSE_RE (regex from T005)
T008 Implement executeRenameNote main body (single invokeCli + response parse)

# Parallel within handler.test.ts (test groups can be drafted by different contributors):
T009 [P] US1 happy-path tests (5 cases)
T010 [P] US2 wikilink-locator tests (2 cases)
T011 [P] US5 active-mode tests (2 cases)
T012 [P] US4 source/dest structured-error tests (2 cases)
T013 [P] US7 CLI-failure propagation tests (6 cases)
T014 [P] US3 extension-rule edge-case tests (4 cases)
T015 [P] US9 same-name no-op test (1 case)
```

Total handler tests across all stories: 22 cases (matches the data-model.md handler.test.ts inventory).

---

## Implementation Strategy

### MVP First (US1 only — specific-mode `.md` rename)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (schemas).
3. Complete Phase 3: US6 validation tests (schema-only; gates the input contract).
4. Complete Phase 4: T0 Live-CLI pass (locks `RESPONSE_RE` pattern + verifies SC-012).
5. Complete Phase 5: US1 implementation + handler tests.
6. Complete Phase 12: US8 registration + docs (the MVP must be reachable from the MCP wire).
7. **STOP and VALIDATE**: run `npm test` for the rename_note module. The MVP slice ships once T009 / T016–T020 land.
8. **Deploy/demo**: agents can now do `rename_note({ target_mode: "specific", vault, path, name })` end-to-end.

### Incremental Delivery

1. Setup + Foundational → schemas in place.
2. US6 schema validation tests → boundary safety verified.
3. T0 Live-CLI pass → `RESPONSE_RE` locked; SC-012 path-traversal precondition verified.
4. US1 specific-mode happy path → MVP handler works.
5. US2 wikilink locator → both locator forms covered.
6. US5 active mode → target-mode parity with every other typed tool.
7. US4 structured errors → source-not-found and destination-collision actionable.
8. US7 CLI-failure propagation → full error matrix observable.
9. US3 internal-periods + case-sensitivity + cross-extension narrowing → extension rule edge cases locked.
10. US9 same-name no-op → audit-trail invariant established.
11. US8 registration + docs → tool live on the MCP wire.
12. Polish → release-ready.

### Single-developer strategy

This feature is small enough (~110 LOC source, ~750 LOC test, ~220 LOC docs) that one developer carries the full task list in sequence. The dependency graph is essentially linear within `handler.ts` (T006 → T007 → T008); test files allow parallel drafting between contributors but in a one-developer scenario they're written in the same flow as the handler edits they cover.

---

## Notes

- **[P] marker discipline**: only tasks that edit DIFFERENT files OR write fresh code without depending on incomplete tasks earn `[P]`. Test files (`schema.test.ts`, `handler.test.ts`, `index.test.ts`) are SHARED resources — within a single test file, test groups are logically independent but co-edit the same file; `[P]` is granted only when contributors will not conflict.
- **Story label discipline**: every Phase 3 + Phase 5–12 task carries the relevant `[US#]` label. Phase 1 / 2 / 4 / 13 tasks do NOT carry story labels (Phase 4 is T0 cross-cutting; the others are pre/post infrastructure).
- **Each user story should be independently completable and testable**: US6 (validation) is fully covered by T004 + schemas (T002 / T003). US1 (specific-mode) ships once T006 / T007 / T008 / T009 + T016 / T017 / T018 / T019 / T020 land. US2 / US5 / US3 / US4 / US7 / US9 are each just a single test-task on top of the US1 handler. US8 is T016–T020.
- **Constitutional gates**: T024 (lint) / T025 (typecheck) / T026 (build) / T027 (vitest with coverage floor) run after every story checkpoint AND once more at the very end. Coverage threshold ratchet via one-line visible edit at [vitest.config.ts:20](../../vitest.config.ts#L20) only if the aggregate moved.
- **Test scope reminder** (from auto-memory): this repo covers vitest unit tests only; manual integration probes are reported in `research.md` / `quickstart.md` rather than scaffolded as `TC-*` test cases. The T005 T0 probe pass is reported in research.md as F2–F12 amendments, NOT as new test cases.
- **Verify tests fail before implementing**: vitest-style; write the test first (RED), watch it fail (the spawn-stub assertions, the response-shape assertions, the doc-presence assertions), then write the source change to flip it green.
- **Commit after each logical group** (recommended cuts): T001 alone (scaffold); T002+T003 (schemas); T004 alone (US6 validation tests); T005 alone (T0 probe + F2–F12 research amendments); T006+T007+T008 (handler implementation); T009 alone (US1 tests); T010 alone (US2); T011 alone (US5); T012 alone (US4); T013 alone (US7); T014 alone (US3); T015 alone (US9); T016+T017+T018 (registration + tests + server wiring); T019+T020 (docs); T021+T022+T023 (release surfaces); T024–T027 (constitution gates batch); T028 alone (quickstart walk-through).
- **Stop at any checkpoint**: every user story phase ends at a checkpoint where the story is independently testable. Stop there to validate before moving to the next.
- **Plan-stage spec amendments** (per R12): NONE for 021. Both /speckit-clarify decisions were locked at spec stage; no Phase-0 amendments needed.
- **SC-012 path-traversal gate at T005 M-9**: if the CLI does NOT reject path-traversal-shaped `path` values, this BI is amended **pre-ship** to add a tool-layer reject (and a new schema test case in T004). The amendment lands before T024 (lint) runs.
- **Avoid**: vague tasks (no file path), same-file conflicts in `[P]` tasks, cross-story dependencies that break the MVP slice's independence.

---

## Task count summary

- **Phase 1 (Setup)**: 1 task (T001)
- **Phase 2 (Foundational — schemas)**: 2 tasks (T002, T003)
- **Phase 3 (US6 validation)**: 1 task (T004)
- **Phase 4 (T0 Live-CLI Pass)**: 1 task (T005)
- **Phase 5 (US1 MVP)**: 4 tasks (T006, T007, T008, T009)
- **Phase 6 (US2 wikilink)**: 1 task (T010)
- **Phase 7 (US5 active mode)**: 1 task (T011)
- **Phase 8 (US4 source/dest errors)**: 1 task (T012)
- **Phase 9 (US7 CLI failures)**: 1 task (T013)
- **Phase 10 (US3 extension rule)**: 1 task (T014)
- **Phase 11 (US9 same-name no-op)**: 1 task (T015)
- **Phase 12 (US8 Registration + docs)**: 5 tasks (T016, T017, T018, T019, T020)
- **Phase 13 (Polish)**: 8 tasks (T021–T028)

**Total: 28 tasks.** Tests are co-merged with implementation per Constitution II. Format conforms to the strict checklist convention: `- [ ] TXXX [P?] [US#?] description with file path`.

> **Note on counts** — three independent counts appear in 021's planning artefacts and should NOT be conflated: **(a) 28 tasks** = work items in this tasks.md (this number); **(b) 29 acceptance scenarios** per [spec.md](./spec.md) SC-001 = AC sub-items across User Stories 1–9; **(c) ~52 vitest cases** per [data-model.md](./data-model.md) test inventory = co-located test cases in `schema.test.ts` / `handler.test.ts` / `index.test.ts` (~25 + ~22 + ~5). Each is a different unit (a = procedural steps; b = behavioural requirements; c = vitest `it` blocks). T004 alone packs ~25 vitest cases; T009 packs 5; etc.

Coverage map:

- **MVP gate**: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T016 → T017 → T018 → T019 → T020 (14 tasks for the MVP slice).
- **Full feature**: all 28 tasks.
- **Test count**: ~52 cases total (~25 schema in T004, ~22 handler split across T009 (5) + T010 (2) + T011 (2) + T012 (2) + T013 (6) + T014 (4) + T015 (1), ~5 registration in T017). Matches the FR-016 inventory locked in data-model.md.
