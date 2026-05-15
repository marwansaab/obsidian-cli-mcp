---

description: "Task list for 030-move-note — typed single-file move (optionally with rename) of vault files"
---

# Tasks: Move Note — Typed Single-File Move (Optionally with Rename)

**Input**: Design documents from [/specs/030-move-note/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED per Constitution Principle II — every public surface ships with happy-path AND failure-or-boundary tests in the same change. Test files are co-located with sources (`*.test.ts` next to `*.ts`) and locked at ~57 cases total per [data-model.md test inventory](./data-model.md) (~24 schema / ~28 handler / ~5 registration). Precedent floor: 30 cases (set by 019-list-files); 030's count exceeds 021-rename's 52 because the `resolveTo` two-branch transform (folder-target + full-path-target with source-`.md` guard) requires ~6 additional handler cases beyond rename's `appendMdIfMissing` single-branch transform.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. MVP scope is US1 (specific-mode folder-target move) — the headline value of the feature. US4 (schema validation) lands FIRST among P1 stories because it's schema-only and covers the broadest swathe of acceptance scenarios (7 of 28). T0 live-CLI characterisation (Phase 4) is BLOCKING for every handler phase because the `parseMoveResponse` regex pattern depends on the captured CLI wording (matches 012-delete-note / 021-rename T0 precedents).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files OR independent logical-test additions in different `describe` blocks of the same file with no implementation dependencies).
- **[Story]**: `[US1]`..`[US8]` — maps 1:1 to User Story 1..8 in [spec.md](./spec.md). Setup, Foundational, T0, Polish phases carry NO story label.
- Each task description includes the exact file path.

## Path Conventions

Single-project layout. All paths in this file are written as **markdown link targets relative to this file's location** (`specs/030-move-note/tasks.md`), e.g. `../../src/tools/move/handler.ts` resolves to `c:\Github\obsidian-cli-mcp\src\tools\move\handler.ts`. This is intentionally different from `plan.md`'s convention (which uses repo-root-relative paths like `src/tools/move/handler.ts`); both documents correctly point at the same files from their own viewport. Established precedent per 019/020/021/029 tasks.md files. When reading paths in this file, mentally resolve them from the `specs/030-move-note/` directory.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffold with the project's mandatory header conventions per Constitution V.

- [ ] T001 Create the per-surface module directory `src/tools/move/` and scaffold the six new files (`schema.ts`, `schema.test.ts`, `handler.ts`, `handler.test.ts`, `index.ts`, `index.test.ts`), each carrying a `// Original — no upstream.` one-line header per Constitution V / FR-001. One-line summaries: schema → "move input/output schemas — flat target-mode primitive extension; to: z.string().min(1); moved z.literal(true) success-only output shape"; handler → "move handler: thin transformer routing parsed input through invokeCli — resolveTo helper per /speckit-clarify Q1+Q2 (trailing-`/` discriminator + source-`.md`-guarded `.md` append), parseMoveResponse three-shape contract locked against T0 capture"; index → "move tool registration via registerTool — responseFormat: json wraps the { moved, fromPath, toPath } envelope for the MCP wire".

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The zod schema is the single source of truth for both the input AND output AND types per Constitution III. Every test and handler import flows from these schemas, so they MUST land before any per-story work begins. No new target-mode primitive helpers are needed (file-scoped tool — reuses `applyTargetModeRefinement` verbatim, unlike 019/029's folder-scoped variant).

**⚠️ CRITICAL**: No user story work can begin until Phase 2 is complete.

- [ ] T002 Implement `moveInputSchema` in [src/tools/move/schema.ts](../../src/tools/move/schema.ts) per [contracts/move-input.contract.md](./contracts/move-input.contract.md): `applyTargetModeRefinement(targetModeBaseSchema.extend({ to: z.string().min(1) }))`. The `.min(1)` enforces empty-`to` rejection (FR-003 / Story 4 AC#6). NO `.regex(...)` shape constraint on `to` at the schema layer — the strict trailing-`/` discriminator (Q2 lock) and the source-`.md`-guarded `.md` append rule (Q1 lock) live at the handler layer in `resolveTo`, NOT at zod. Both shapes (`Archive/` and `Archive/Note.md`) pass schema validation; the helper branches at handler time. Import `applyTargetModeRefinement` and `targetModeBaseSchema` from `../../target-mode/target-mode.js` per the post-010 Pattern (a) flat-extension idiom.
- [ ] T003 Implement `moveOutputSchema` in [src/tools/move/schema.ts](../../src/tools/move/schema.ts) per FR-005 / FR-006: `z.object({ moved: z.literal(true), fromPath: z.string(), toPath: z.string() }).strict()`. Add `MoveInput` and `MoveOutput` type exports via `z.infer<typeof moveInputSchema>` and `z.infer<typeof moveOutputSchema>` (no hand-rolled `interface` / `type =` declarations per Constitution III / SC-004).

**Checkpoint**: Schema source-of-truth in place. User stories can begin.

---

## Phase 3: User Story 4 — Schema layer rejects malformed inputs before any CLI call (Priority: P1)

**Goal**: Schema validation is the safety contract for every typed tool. Per FR-016 / SC-001, every invalid input shape MUST reject at the zod boundary AND zero underlying CLI invocations MUST occur. Lands FIRST among the P1 stories because it covers the broadest swathe of acceptance scenarios (7 scenarios) AND it's enforceable purely from the schema file — no handler logic needed. Independent of T0 (Phase 4).

**Independent Test**: run `schema.test.ts` in isolation; assert all ~24 cases pass; assert no `cli-adapter` import is required in the schema-test file (validation is pure-zod).

- [ ] T004 [P] [US4] Write all ~24 schema tests in [src/tools/move/schema.test.ts](../../src/tools/move/schema.test.ts) per the [data-model.md test inventory](./data-model.md) section "Schema tests (~24 cases)" AND [contracts/move-input.contract.md](./contracts/move-input.contract.md) validation failure roster: **happy-path** — specific+path+folder-target `to: "Archive/"` (Story 1), specific+path+full-path-target with `.md` (Story 2), specific+path+full-path-target without `.md` (Story 2 AC#2), specific+file+folder-target (Story 2 AC#4), active+to (Story 5), UTF-8 multi-byte path + `to`; **failure-path** — specific without locator → VALIDATION_ERROR with "exactly one of" (Story 4 AC#1), specific with both locators → VALIDATION_ERROR both `["file"]` AND `["path"]` paths (Story 4 AC#2), specific without vault → VALIDATION_ERROR with `["vault"]` (Story 4 AC#3), empty vault → VALIDATION_ERROR (Edge Case), active with vault → VALIDATION_ERROR (Story 4 AC#4a), active with file → VALIDATION_ERROR (AC#4b), active with path → VALIDATION_ERROR (AC#4c), unknown top-level key (e.g. `pancakes: "yes"`) → VALIDATION_ERROR with `code: "unrecognized_keys"` (Story 4 AC#5 — gates `additionalProperties: false` via the `.strict()` base), invalid `target_mode` discriminator value → VALIDATION_ERROR (Edge Case), `target_mode` absent → VALIDATION_ERROR (Edge Case), `to` absent → VALIDATION_ERROR with `["to"]` (Story 4 AC#7a), empty `to: ""` → VALIDATION_ERROR `code: "too_small"` with `["to"]` (Story 4 AC#6), non-string `to: 42` → VALIDATION_ERROR `code: "invalid_type"` (Story 4 AC#7b), `to: null` → VALIDATION_ERROR, `to: []` → VALIDATION_ERROR, `target_mode: 42` non-string discriminator → VALIDATION_ERROR, UTF-8 in `to: "アーカイブ/"` accepts, inferred TS type compiles via `expectTypeOf` (compile-time check), output schema validates `{ moved: true, fromPath: "X", toPath: "Y" }`, output schema rejects `{ moved: false, ... }` (literal-true gate). Each parse-failure test asserts the resulting error shape (`details.issues[].path`, `code`, message keyword) per the input-contract validation-failure roster.

**Checkpoint**: US4 (input validation) is fully testable independently. The schema is the only deliverable; no handler logic is needed for this story.

---

## Phase 4: T0 Live-CLI Characterisation Pass (BLOCKING for handler phases)

**Purpose**: The plan-stage live-CLI capture (F1–F5b) verified the `move` subcommand's argv shape from `obsidian help` output + four non-destructive error responses (unknown-vault, source-not-found, missing-`to`, source-traversal). NINE FR-019 gating cases (i)–(iv), (vi), (viii)–(xii) — listed in [research.md](./research.md)'s ## FR-019 deferred-T0 case roster — are deferred from plan stage because they require real source files in the vault (destructive probes). They are captured here as the FIRST implementation task because the `parseMoveResponse` regex pattern in `handler.ts` depends on T0-captured CLI wording — same precedent as 012-delete-note / 021-rename T0 captures. **Apply test-execution gates** per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — Sandbox/ subdirectory, timestamped fixtures per run, post-state diff, cleanup after.

**⚠️ CRITICAL**: T005 BLOCKS Phase 5–11 (every handler-touching phase). May run parallel with Phase 3 (US4 schema tests are independent of T0).

- [ ] T005 T0 Live-CLI probe set against `TestVault-Obsidian-CLI-MCP` Sandbox/ covering the thirteen M-* scenarios (M-1..M-13) in [quickstart.md](./quickstart.md). **(M-1) Specific-mode folder-target move happy path** — seed `Sandbox/T0-move-001-source.md`; probe `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/T0-move-001-source.md to=Sandbox/MovedTo/`; capture verbatim stdout/stderr/exit; **locks `MOVE_RESPONSE_RE` regex pattern in handler.ts** (parity with rename's `RESPONSE_RE` / delete's `parsePath`); verify post-state (file relocated; .trash/ empty). **(M-2) Full-path-target move-and-rename** — seed `Sandbox/T0-move-002-source.md`; probe with `to=Sandbox/T0-move-002-renamed.md`; verify renaming in one operation; capture wording. **(M-3) Wikilink locator (`file=`)** — seed `Sandbox/T0-move-003-source.md`; probe with `file=T0-move-003-source to=Sandbox/MovedTo/`; verify CLI's source-resolution produces canonical `fromPath`. **(M-4) Same-folder move (rename equivalence per Story 8)** — seed `Sandbox/T0-move-004-source.md`; probe with `to=Sandbox/T0-move-004-renamed.md` (same parent); verify `dirname(fromPath) === dirname(toPath)` holds in response. **(M-5) Source-not-found** — already partially verified at F3; re-confirm wording survives CLI version drift with `path=Sandbox/T0-DOES-NOT-EXIST.md to=Sandbox/X.md`. **(M-6) Destination-exists collision** — seed BOTH `Sandbox/T0-move-006-src.md` AND `Sandbox/T0-move-006-coll.md`; probe with `path=Sandbox/T0-move-006-src.md to=Sandbox/T0-move-006-coll.md`; capture verbatim collision wording for `parseMoveResponse` reject branch; **assert source is unmodified** (no partial-state). **(M-7) Unknown vault** — already verified at F2 (`Vault not found.\n` + exit 0 byte-identical to 011-R5); no re-run unless CLI version changed. **(M-8) Active-mode move of focused note** — open `Sandbox/T0-move-008-source.md` as the focused note in Obsidian; probe with `move to=Sandbox/T0-move-008-moved/`; capture focused-file echo; verify wrapper's argv shape (no `vault=`/`file=`/`path=` tokens). **(M-9) Active-mode no-focused-note (SC-014 LOAD-BEARING)** — ensure NO note is focused; probe with `move to=Sandbox/X.md`; **CAPTURE VERBATIM WORDING** (anticipated: `Error: No active file.\n` capital-N per user-input + TC-049 + TC-171 precedents); confirm the dispatch-layer classifier does NOT re-classify to `ERR_NO_ACTIVE_FILE` (lowercase-only matcher); the call must surface as `CLI_REPORTED_ERROR`. **If lowercase observed (divergent from anticipated)**: the spec is amended pre-ship to switch error roster from `CLI_REPORTED_ERROR` to `ERR_NO_ACTIVE_FILE` AND `docs/tools/move.md` is updated to reflect the actual wording. **(M-10) Path-traversal `to=` (SC-012 gate; destructive)** — per `.memory/test-execution-instructions.md` path-traversal protocol: stage a bait file at `…\Obsidian\bait\bait-<run-id>.txt` with trivial content; capture pre-state; seed `Sandbox/T0-move-010-src.md` inside the vault; probe with `path=Sandbox/T0-move-010-src.md to=../../bait/escaped-<run-id>.md`; **assert CLI rejects with structured error AND source is unmodified AND bait dir is unchanged**. If CLI rejects → SC-012 PASS; ship without tool-layer reject. If CLI silently escapes → **SC-012 FAIL → spec amendment pre-ship per the locked amendment-shape sketch** (adds a `.refine()` clause to the `to` field rejecting any `..` segment, plus 2 new schema test cases in T004; amendment lands BEFORE T029 (lint) clears). Cleanup: source file removal; bait dir cleanup. **(M-11) Missing destination folder** — seed `Sandbox/T0-move-011-src.md`; probe with `to=NonExistentFolder-<run-id>/`; document observed behaviour (auto-create vs fail); document in `docs/tools/move.md` per FR-014; cleanup both source AND auto-created folder. **(M-12) Backslash-in-`to` on Windows host** — seed `Sandbox/T0-move-012-src.md`; probe with `to=Sandbox\Backslash-Renamed-<run-id>.md` (Windows-style backslash); capture verbatim output AND resulting file location; document observed behaviour (path-separator vs literal char vs structured error); **if silent vault-escape observed → spec amendment pre-ship (same SC-012 pattern as M-10)**; document in `docs/tools/move.md`. **(M-13) Subcommand argv shape** — already verified at F1; re-confirm if CLI version changed. **(Consolidation step)** After M-1..M-12 complete, lock the `MOVE_RESPONSE_RE` regex pattern in `handler.ts` and update [research.md](./research.md)'s "## Plan-stage live-CLI findings" with a "## T0 Live-CLI Capture (<DATE>)" amendment block carrying findings **F6 (folder-target move success wording), F7 (full-path-target move-and-rename wording), F8 (wikilink-locator canonical from/to echo), F9 (same-folder move CLI behaviour), F10 (destination-collision wording), F11 (active-mode focused-file echo), F12 (active-mode capital-N no-focused-note classifier verification — SC-014 PASS/FAIL), F13 (path-traversal `to=` CLI behaviour — SC-012 PASS/FAIL), F14 (missing-destination-folder auto-create vs fail), F15 (backslash-in-`to` per-platform observed behaviour), F16 (parseMoveResponse regex pattern lock)**. **(Cleanup)** Clean up the entire `Sandbox/` after the probe set; **stop and report to the user** before any further destructive cases if the vault state diverges unexpectedly OR if SC-012 / SC-014 surface amendments.

**Checkpoint**: T0 capture complete. `MOVE_RESPONSE_RE` regex pattern locked. SC-012 path-traversal gate verified (or, if CLI doesn't reject, the BI is amended pre-ship). SC-014 capital-N classifier mismatch verified (or, if lowercase observed, error roster amended pre-ship). Handler phases (5–11) unblocked.

---

## Phase 5: User Story 1 — Specific-mode folder-target move (Priority: P1) 🎯 MVP

**Goal**: Deliver the dominant write path — `move({ target_mode: "specific", vault, path, to })` with `to` ending `/` invokes the CLI's `move` subcommand with `to=` defaulted to `to + basename(path)` (per /speckit-clarify Q2 strict trailing-`/` discriminator + folder-target branch of `resolveTo`) and returns the structured `{ moved: true, fromPath, toPath }` shape. This is the MVP — agents can replace `obsidian_exec move` for the dominant case the moment this story lands. Depends on T005 (Phase 4) for the `MOVE_RESPONSE_RE` regex pattern.

**Independent Test**: With a stub `spawnFn` injected via `deps`, calling `executeMove({ target_mode: "specific", vault: "MyVault", path: "Inbox/Tax-2026.md", to: "Archive/2026/" }, deps)` against a stub child that exits 0 emitting the T005-captured success response (F6) results in (a) `spawnFn.callCount === 1`; (b) the spawn's argv contains `vault=MyVault`, `move`, `path=Inbox/Tax-2026.md`, `to=Archive/2026/Tax-2026.md` (source basename preserved per folder-target branch); (c) the argv does NOT contain `file=...`; (d) the handler returns `{ moved: true, fromPath: "Inbox/Tax-2026.md", toPath: "Archive/2026/Tax-2026.md" }`.

### Implementation for User Story 1

- [ ] T006 [US1] Implement the `basename(path: string): string` file-local helper in [src/tools/move/handler.ts](../../src/tools/move/handler.ts) per R6 / [contracts/move-handler.contract.md](./contracts/move-handler.contract.md): ~3 LOC `const i = path.lastIndexOf("/"); return i === -1 ? path : path.slice(i + 1);`. Pure string slicing; no `path.basename` (Node) — keep platform-independent for byte-identical Windows / POSIX behaviour. Helper is NOT exported (file-local).
- [ ] T007 [US1] Implement the `resolveTo(to: string, fromPath: string): string` file-local helper in [src/tools/move/handler.ts](../../src/tools/move/handler.ts) per /speckit-clarify Q1+Q2 / R6+R7 / [contracts/move-handler.contract.md](./contracts/move-handler.contract.md): ~12 LOC two-branch logic. Branch 1: `if (to.endsWith("/")) return to + basename(fromPath);` — folder-target preserves source basename. Branch 2: `const filenamePortion = to.includes("/") ? to.slice(to.lastIndexOf("/") + 1) : to; if (fromPath.endsWith(".md") && !filenamePortion.endsWith(".md")) return to + ".md"; return to;` — full-path-target with source-`.md`-guarded `.md` append. Both `endsWith` predicates are literal byte equality, case-sensitive. Mirrors 020-fix-write-gaps R2 and 021-rename Q1 byte-equality precedents (cite both in a comment). The source-`.md` guard is the /speckit-clarify Q1 departure from rename's unconditional append — cite the spec's Clarifications section. Helper is NOT exported (file-local).
- [ ] T008 [US1] Implement the `parseMoveResponse(stdout: string, input: MoveInput, resolvedTo: string): { fromPath: string; toPath: string }` file-local helper in [src/tools/move/handler.ts](../../src/tools/move/handler.ts) per R14 / [contracts/move-handler.contract.md](./contracts/move-handler.contract.md): three-shape contract. **Shape A (anticipated single-line)**: define `const MOVE_RESPONSE_RE = /<T0-locked-pattern-from-F6>/m;` (pattern locked at T005 consolidation step; document with a comment `// Locked at T0 (F6/F16) — see research.md ## T0 Live-CLI Capture.`); match `stdout.trimStart()` against `MOVE_RESPONSE_RE`; on success return `{ fromPath: match[1]!, toPath: match[2]! }`. **Shape B (two-line fallback)**: if `MOVE_RESPONSE_RE` doesn't match AND stdout splits on `\n` into ≥ 2 non-empty lines, use first line as `fromPath`, second as `toPath` (lock the exact regex/split rule against F6 at T005). **Shape C (empty stdout + exit 0)**: if `stdout.trim() === ""`, derive `fromPath` from `input.path ?? <CLI-resolved-from-stdout-if-`file=`-mode>` AND `toPath` from `resolvedTo` (the `resolveTo` output passed to argv); return deterministically. **Unrecognised shape**: throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { stage: "parse", stdout }, message: `move could not parse CLI response: ${stdout.trimStart().slice(0, 200)}` })` — guards against silent passthrough of CLI changes. Pattern strictly mirrors 012-delete-note's `parsePath` helper and 021-rename's `parseRenameResponse`.
- [ ] T009 [US1] Implement `executeMove(input, deps): Promise<MoveOutput>` main body in [src/tools/move/handler.ts](../../src/tools/move/handler.ts) per R3 / R11 / [contracts/move-handler.contract.md](./contracts/move-handler.contract.md) handler-body sketch. Compute `resolvedTo`: in specific+`path=` mode, `resolveTo(input.to, input.path)`; in specific+`file=` mode and active mode, `input.to` verbatim (the wrapper cannot apply the source-`.md` guard because `fromPath` is CLI-resolved — per R6 wrapper-side applicability rule). Build `parameters` record — specific+`path=` includes `{ path: input.path, to: resolvedTo }`; specific+`file=` includes `{ file: input.file, to: resolvedTo }` (where `resolvedTo === input.to`); active mode includes only `{ to: resolvedTo }`. Single `invokeCli({ command: "move", vault: input.target_mode === "specific" ? input.vault : undefined, parameters, flags: [], target_mode: input.target_mode }, { spawnFn, env, logger, queue })` call. Apply `parseMoveResponse(stdout, input, resolvedTo)` to the result. Return `{ moved: true, fromPath, toPath }`. Add `ExecuteDeps` interface and required imports. Trust validated input per Constitution III — no defensive checks. Pattern strictly mirrors `src/tools/rename/handler.ts`.

### Tests for User Story 1

- [ ] T010 [P] [US1] Write 5 handler tests in [src/tools/move/handler.test.ts](../../src/tools/move/handler.test.ts) covering Story 1 ACs + folder-target invariants per [data-model.md test inventory](./data-model.md) handler.test.ts cases #1–#3 + the resolveTo + parseMoveResponse core invariants: **Case 1 (Story 1 AC#1)** specific+path+folder-target `to: "Archive/"` against stub stdout matching F6's pattern → argv contains `vault=V`, `move`, `path=Inbox/Tax-2026.md`, `to=Archive/Tax-2026.md` (source basename preserved); response `{ moved: true, fromPath: "Inbox/Tax-2026.md", toPath: "Archive/Tax-2026.md" }`. **Case 2 (Story 1 AC#2)** folder-target with nested subfolder `to: "Archive/2026/"` → argv `to=Archive/2026/Tax-2026.md`. **Case 3 (Story 1 AC#3)** folder-target preserves internal-periods source basename `path: "Drafts/Doc.v1.draft.md", to: "Archive/"` → argv `to=Archive/Doc.v1.draft.md`. **Case 4 (single-spawn R11)** `spawnFn.callCount === 1` after a successful call. **Case 5 (vault hoist)** argv has `vault=V` as a discrete top-level token, NOT nested in `parameters` (per 011-write-note PSR-3). Each test injects `deps.spawnFn` via the standard test-seam pattern from [contracts/move-handler.contract.md](./contracts/move-handler.contract.md) "Test seam pattern" section.

**Checkpoint**: US1 is fully functional and testable independently. The MVP slice ships once T020 (registration) + T022 (server wiring) land in Phase 10.

---

## Phase 6: User Story 2 — Specific-mode full-path move-and-rename (Priority: P1)

**Goal**: same move surface against `target_mode: "specific"` with `to` as a full path (no trailing `/`) — CLI moves AND renames in one operation. The source-`.md`-guarded `.md` append rule applies on the filename portion. Case-sensitive byte equality on both predicates. Source-`.md`-guard suppression on non-`.md` source is the SC-013 load-bearing assertion.

**Independent Test**: with a stub adapter that exits 0 reporting `Inbox/Tax-2026.md → Archive/2026-Tax-Return.md`, calling `executeMove({ target_mode: "specific", vault: "V", path: "Inbox/Tax-2026.md", to: "Archive/2026-Tax-Return.md" })` results in the spawn being invoked with argv containing `vault=V`, `move`, `path=Inbox/Tax-2026.md`, `to=Archive/2026-Tax-Return.md` (verbatim — already `.md`); handler returns the canonical from/to.

- [ ] T011 [P] [US2] Write 6 full-path-target handler tests in [src/tools/move/handler.test.ts](../../src/tools/move/handler.test.ts) per data-model.md handler.test.ts cases #4–#9: **Case 6 (Story 2 AC#1)** full-path with explicit `.md`: `to: "Archive/Renamed.md"` against `.md` source → argv `to=Archive/Renamed.md` (verbatim — filename already `.md`); response reflects canonical from/to. **Case 7 (Story 2 AC#2)** full-path with `.md` append on `.md` source: `to: "Archive/Renamed"` → argv `to=Archive/Renamed.md` (append fires; source-`.md` AND filename non-`.md`). **Case 8 (b4 internal periods)** `to: "Archive/Doc.v1.draft"` → argv `to=Archive/Doc.v1.draft.md` (`.draft` ≠ `.md` → append; internal periods preserved). **Case 9 (b5 case-sensitive)** `to: "Archive/Renamed.MD"` → argv `to=Archive/Renamed.MD.md` (`.MD` ≠ `.md` case-sensitively → append; per /speckit-clarify Q1 byte-equality rule). **Case 10 (Story 2 AC#3 — SC-013 LOAD-BEARING) source-`.md`-guard SUPPRESSION on non-`.md` source**: `path: "Boards/Plan.canvas", to: "Archive/Renamed"` → argv `to=Archive/Renamed` (verbatim — NO `.md` appended; the source-`.md` guard fires and suppresses the append rule per /speckit-clarify Q1); **this prevents silent `.canvas → .md` cross-type conversion**. **Case 11** caller-explicit `.md` preserved on non-`.md` source: `path: "Boards/Plan.canvas", to: "Archive/Renamed.md"` → argv `to=Archive/Renamed.md` (verbatim; the guard only suppresses APPEND, not verbatim forwarding). Each test injects `deps.spawnFn`; asserts `spawnFn.callCount === 1`.
- [ ] T012 [P] [US2] Write 2 wikilink-locator handler tests in [src/tools/move/handler.test.ts](../../src/tools/move/handler.test.ts) per data-model.md handler.test.ts case #10: **Case 12 (Story 2 AC#4)** specific+`file=` + folder-target `to`: `{file: "Tax-2026", to: "Archive/"}` → argv contains `vault=V`, `move`, `file=Tax-2026`, `to=Archive/` (verbatim — wrapper cannot apply source-`.md` guard in `file=` mode per R6); response reflects CLI-resolved canonical from/to. **Case 13 (UTF-8 byte-perfect)** `file: "笔记", to: "Archive/"` → argv tokens contain exact UTF-8 byte sequences; no transcoding, no normalisation. Both tests inject `deps.spawnFn`; assert `spawnFn.callCount === 1`.

**Checkpoint**: US2 lands. Both locator forms (`file=` and `path=`) and both `to` shapes (folder-target and full-path-target) work end-to-end. SC-013 load-bearing assertion (source-`.md` guard suppression) is exercised in Case 10.

---

## Phase 7: User Story 5 — Active mode + capital-N classifier mismatch (Priority: P1)

**Goal**: same move surface against `target_mode: "active"` — the CLI defaults to the focused file. The handler routes through the cli-adapter with no `vault=` / `file=` / `path=` tokens; only `to=<to-verbatim>` is sent. **Active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`)** per the inherited bridge-classifier mismatch (R9; capital-N `Error: No active file.` not recognised by lowercase-only matcher). SC-014 load-bearing.

**Independent Test**: with a stub adapter that exits 0 reporting a focused-note move, calling `executeMove({ target_mode: "active", to: "Archive/" })` results in argv containing `move`, `to=Archive/`, and NO `vault=` / `file=` / `path=` tokens; handler returns `{ moved: true, fromPath: "<focused>", toPath: "Archive/<focused-basename>" }`. A second test asserts that when the stub adapter throws `CLI_REPORTED_ERROR` with `details.message: "Error: No active file.\n"` (capital-N), the handler propagates `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`).

- [ ] T013 [P] [US5] Write 2 active-mode handler tests in [src/tools/move/handler.test.ts](../../src/tools/move/handler.test.ts) per data-model.md cases #11 + #17: **Case 14 (Story 5 AC#1)** active+to → argv contains `move`, `to=Archive/`, NO locator tokens; response reflects CLI-resolved focused-file from/to paths. **Case 15 (Story 5 AC#3 / SC-014 LOAD-BEARING) capital-N CLI_REPORTED_ERROR classifier behaviour**: stub adapter throws `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { message: "Error: No active file.\n" } })` (capital-N — the actual wording the native `move` subcommand emits per the inherited classifier mismatch documented in R9 / spec Background / SC-014); handler propagates `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`). The Story 5 AC#2 forbidden-key-in-active-mode case is already covered by T004 (schema layer rejects before the handler runs). Each test injects `deps.spawnFn`; asserts `spawnFn.callCount === 1`.

**Checkpoint**: US5 lands. Target-mode parity with every other typed tool achieved. The inherited capital-N classifier mismatch is now LOCKED at the test layer — future regressions (e.g., a bridge-classifier fix that flips the code back to `ERR_NO_ACTIVE_FILE`) will be caught.

---

## Phase 8: User Story 3 — Source-not-found and destination-collision structured errors (Priority: P1)

**Goal**: Two of the three most common move failure modes (the third is no-focused-note in active mode, covered by US5) surface as structured `UpstreamError` with `code: "CLI_REPORTED_ERROR"` (or `CLI_NON_ZERO_EXIT` per the cli-adapter's classification of the T0-captured wording). `details.message` carries the verbatim CLI line so callers can distinguish "source wrong, retry locator" from "destination taken, pick different name".

**Independent Test**: With a stub adapter raising the T005-captured source-not-found error (F3 baseline / re-confirmed at M-5) for `path=Sandbox/Missing.md`, calling `executeMove` returns an MCP error response with the captured code AND `details.message` matching the verbatim CLI line. Same for destination collision (F10 from T005 M-6).

- [ ] T014 [P] [US3] Write 2 structured-error handler tests in [src/tools/move/handler.test.ts](../../src/tools/move/handler.test.ts) per data-model.md handler.test.ts cases #12 + #13: **Case 16 (Story 3 AC#1)** stub adapter throws `UpstreamError({ code: <F3/M-5-classified>, details: { message: <F3/M-5-verbatim> } })` for source-not-found → handler propagates verbatim; `spawnFn.callCount === 1`. **Case 17 (Story 3 AC#2)** stub adapter throws `UpstreamError({ code: <F10/M-6-classified>, details: { message: <F10/M-6-verbatim> } })` for destination-collision → handler propagates verbatim. The exact codes and message text reference F3 (plan-stage) + F10 (T005) — see [research.md](./research.md) "## T0 Live-CLI Capture (<DATE>)" amendment block (added by T005 consolidation step). Tests reference F3 / F10 by name and use the captured values literally.

**Checkpoint**: US3 lands. Agents see actionable structured errors for the two most common write-failure modes.

---

## Phase 9: User Story 6 — CLI failures flow through UpstreamError (Priority: P1)

**Goal**: Every cli-adapter-raised `UpstreamError` propagates verbatim through `executeMove`. Non-`UpstreamError` exceptions escape verbatim (no `asToolError` wrapping). The handler does NOT classify, mask, or rewrite errors — it only catches inside `registerTool` (which is at a layer above the handler).

**Independent Test**: For each of the three cli-adapter error codes (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`) plus the parseMoveResponse-failure case plus the non-`UpstreamError` re-throw case: drive the handler through an injected stub; assert the appropriate error shape is produced; assert `spawnFn.callCount === 1` for the adapter-error cases (the spawn DID happen, the adapter raised the error inside it).

- [ ] T015 [P] [US6] Write 6 error-propagation handler tests in [src/tools/move/handler.test.ts](../../src/tools/move/handler.test.ts) per data-model.md handler.test.ts cases #14–#18 + #25: **Case 18 (Story 6 AC#1)** stub `spawnFn` raises `ENOENT` → adapter raises `CLI_BINARY_NOT_FOUND` with 017-cross-platform-support structured details (`platform`, `attempts[]`, `PATH`) → handler propagates. **Case 19 (Story 6 AC#2)** stub exits 1 with stderr `"permission denied"` → `CLI_NON_ZERO_EXIT` with `details.exitCode: 1`, `details.stderr` verbatim. **Case 20 (Story 6 AC#3)** stub exits 0 with stdout `"Error: <some-msg>\n"` → adapter classifies as `CLI_REPORTED_ERROR`; handler propagates verbatim with `details.message` carrying the captured line. **Case 21 (unknown-vault inherited from 011-R5 / verified at F2)** stub returns `"Vault not found.\n"` exit 0 → adapter's response-inspection clause re-classifies to `CLI_REPORTED_ERROR`; handler propagates. **Case 22 (Story 6 AC#4)** stub raises a non-`UpstreamError` exception (e.g. `new TypeError("boom")`) → handler re-throws verbatim, NO `asToolError` wrapping. **Case 23 (parseMoveResponse failure)** stub exits 0 with unparsable stdout (`"OK\n"` — doesn't match `MOVE_RESPONSE_RE` AND doesn't fit shape B or C) → handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stage: "parse", stdout: "OK\n" } })` via the parseMoveResponse fallback per T008.

**Checkpoint**: US6 lands. Every CLI failure mode produces a structured response observable from a single boundary (the `registerTool` wrapper, exercised at the index.test.ts layer in Phase 10).

---

## Phase 10: User Story 7 — Tool registration, descriptor, docs (Priority: P2)

**Goal**: Per ADR-005 + ADR-006, every tool registered with the MCP server passes its `zod-to-json-schema` output through the schema-stripping utility AND its top-level `description` is a concise verb-led summary that mentions `help("move")` AND surfaces the vault-config-dependent link-rewriting caveat. The non-stub `docs/tools/move.md` body documents the input schema, output shape, error roster (including the explicit `CLI_REPORTED_ERROR` active-mode note), link-rewriting caveat, `to`-shape rules (trailing-`/` discriminator + source-`.md`-guarded append), rename-equivalence note, and ≥4 worked examples per FR-014. Post-022 registry-stability baseline rolls forward via `npm run baseline:write` in the same commit per R13 / FR-013a.

**Independent Test**: `createMoveTool({ logger, queue })` returns a `RegisteredTool` whose descriptor passes all five contract checks (name, stripped schema, description content, doc presence, drift detector implicit coverage) AND `_register-baseline.test.ts` passes after the roll-forward.

### Implementation for User Story 7

- [ ] T016 [US7] Implement `createMoveTool` factory in [src/tools/move/index.ts](../../src/tools/move/index.ts) per FR-011 / FR-012: import `registerTool` from `../_register.js`, `executeMove` and `ExecuteDeps` from `./handler.js`, `moveInputSchema` from `./schema.js`, and `RegisteredTool` type from `../_shared.js`. Export `MOVE_TOOL_NAME = "move"` and `MOVE_DESCRIPTION = 'Move a note within an Obsidian vault (optionally renaming it). Honours the vault\'s "Automatically update internal links" setting; link-rewriting is vault-config-dependent. Call help({ tool_name: "move" }) for full parameter docs and the error-code roster including the active-mode no-focused-note caveat.'` (per FR-012's structural contract: verb-led summary + `help` mention with tool's own name + link-rewriting caveat). Export `RegisterDeps = ExecuteDeps`. Implement factory `createMoveTool(deps: RegisterDeps): RegisteredTool` returning `registerTool({ name: MOVE_TOOL_NAME, description: MOVE_DESCRIPTION, schema: moveInputSchema, deps, handler: async (input, d) => executeMove(input, d) })`. Pattern strictly mirrors `src/tools/rename/index.ts`.
- [ ] T017 [US7] Register `createMoveTool` in [src/server.ts](../../src/server.ts): add the import alphabetically between `createLinksTool` and `createObsidianExecTool`: `import { createMoveTool } from "./tools/move/index.js";`. Add the tools-array entry alphabetically between `createLinksTool({ logger, queue })` and `createObsidianExecTool({ logger, queue })`: `createMoveTool({ logger, queue }),`. +2 lines total. NO other edits to `src/server.ts` per SC-009.
- [ ] T018 [US7] **Roll forward the post-022 registry-stability baseline** per R13 / FR-013a: run `npm run baseline:write` from the repo root. Verify [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) gains one new entry for `move` (`{ name: "move", descriptionFingerprint: "<sha256>", schemaFingerprint: "<sha256>" }`) AND all existing entries remain byte-identical (per SC-009 — `move` adds rather than perturbs). The roll-forward and the registration (T016 + T017) MUST land in the same commit per the 022-FR-018 protocol — without it, the durable registry-stability test at [src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts) fails.

### Tests for User Story 7

- [ ] T019 [P] [US7] Write 5 registration tests in [src/tools/move/index.test.ts](../../src/tools/move/index.test.ts) per data-model.md test inventory and Story 7 ACs: **Case 1** `createMoveTool({ logger: stubLogger, queue: stubQueue })` returns a `RegisteredTool`; `descriptor.name === "move"`. **Case 2 (Story 7 AC#1, AC#2)** descriptor's `inputSchema` has zero `description` keys at any depth (walk the JSON Schema tree); top-level `additionalProperties: false`; all five top-level properties (`target_mode`, `vault`, `file`, `path`, `to`) typed inline; no `oneOf` envelope. **Case 3 (Story 7 AC#3)** descriptor's `description` field is non-empty, contains `"help"` case-insensitive, references `"move"` by name, contains link-rewriting caveat keywords (e.g. `"link"`, `"vault"`, or `"Automatically update"`). **Case 4 (Story 7 AC#4 / FR-014 / SC-006 LOAD-BEARING)** read `docs/tools/move.md` from `import.meta.url` resolved path; assert file exists; does NOT contain `<!-- TODO -->` or `<!-- stub -->`; positively contains: (a) all four propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`); (b) the explicit note that active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR` (not `ERR_NO_ACTIVE_FILE`) AND the verbatim `Error: No active file.` (capital-N) wording AND the `[[BI-0027 - Audit Tool Descriptions]] dimension C.2` attribution; (c) all four required example shapes (FR-014 examples (i)–(iv)); (d) the link-rewriting caveat (e.g. `"Automatically update internal links"`); (e) the `to`-shape rules section with the trailing-`/` discriminator surprise-case worked examples per FR-014 enhanced post-Q2 (e.g. `"to: \"Archive\""` examples); (f) the `.md` append rule with source-`.md`-guard explanation per /speckit-clarify Q1; (g) the rename-equivalence note per Story 8; (h) the "ALWAYS include trailing `/` for folder-target" guidance prominently. **Case 5 (FR-009 structural lock — thin handler invariant)** read [src/tools/move/handler.ts](../../src/tools/move/handler.ts) via `fs.readFileSync` resolved from `import.meta.url`; assert the file contents contain ZERO matches for the regex `/logger\.(callStart|callEnd|callEndSuccess|callEndFailure)/`; assert the file contents contain ZERO direct invocations of `deps.logger` other than passing it through to `invokeCli`'s `deps` argument (positive assertion: exactly one `deps.logger` token appears, and it sits inside the `invokeCli({ ... }, { ... logger: deps.logger ... })` call site). This lock prevents future drift toward per-call logger events at the tool layer (FR-009 / R1 / mirrors the 011/012/013/015/021 precedent).
- [ ] T020 [US7] Write [docs/tools/move.md](../../docs/tools/move.md) (~250 lines) per FR-014 + [contracts/move-input.contract.md](./contracts/move-input.contract.md) + [contracts/move-handler.contract.md](./contracts/move-handler.contract.md): **(1) Input schema section** — per-field rules for `target_mode`, `vault`, `file`, `path`, `to`; cross-field XOR rule; the `to` field's `.min(1)` rule; the strict trailing-`/` discriminator AND source-`.md`-guarded `.md` append rule per /speckit-clarify Q1+Q2 with the exact byte-equality wording. **(2) Destination (`to`) shape section** [LOAD-BEARING per FR-014 enhanced post-Q2] — explicit section explaining the trailing-`/` discriminator AS A PROMINENT CALLOUT (e.g. bold first-paragraph note or callout block) with the "ALWAYS include trailing `/` for folder-target" guidance; the source-`.md`-guarded append rule; worked examples from FR-003 truth table; the `to: "Archive"` surprise-case worked examples showing both source-extension cases (`.md` source → `Archive.md` at vault root; `.canvas` source → `Archive` extensionless at vault root); explicit note that the source-`.md` guard prevents silent cross-type conversion (e.g. `.canvas + to: "Archive/X"` forwards `Archive/X` verbatim, not `Archive/X.md`). **(3) Output shape section** — `{ moved: true, fromPath, toPath }`; `dirname(fromPath) === dirname(toPath)` as the same-folder-move structural marker (per Story 8). **(4) Error roster section** — the four propagated codes with one-or-two sentences each. **EXPLICITLY** call out: "**active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR` with `details.message: "Error: No active file."`, NOT as `ERR_NO_ACTIVE_FILE`**. This is the inherited bridge-classifier behaviour documented across `delete` (TC-049), `rename` (TC-171), and `move` (BI-030 T0 case ix). The bridge's lowercase-only matcher does not recognise the native CLI's capital-N reply; a cross-cutting classifier fix is tracked under [[BI-0027 - Audit Tool Descriptions]] dimension C.2." **(5) Link rewriting section** — explicit caveat that link-rewriting is vault-config-dependent per the user input's [P1] AC #12; the wrapper does NOT enforce; aliased wikilinks (`[[Real Path|Display]]`) have the path side rewritten; the display text persists; outgoing-link references inside the moved file may need attention. **(6) Rename equivalence section** — note that `move` with `to` whose folder portion matches the source's folder is equivalent to `rename` (per Story 8); callers can choose between `rename` (filename-only field, dedicated tool) and `move` (path-shaped `to` with same parent) based on ergonomic preference. **(7) Worked examples section** — at least 4 per FR-014: (i) folder-target move (`path=Inbox/Note.md`, `to=Archive/` → `Archive/Note.md`); (ii) full-path-target move with rename (`path=Inbox/Note.md`, `to=Archive/Renamed.md` → `Archive/Renamed.md`); (iii) destination-collision failure with F10/M-6 verbatim wording; (iv) auto-link-update caveat (showing both setting-enabled and setting-disabled observable behaviour). Plus 2 recommended: (v) source-`.md`-guard suppression on non-`.md` source; (vi) the `to: "Archive"` surprise case. **(8) Adversarial edge cases section** — F12 active-mode capital-N classifier (verified at T005 M-9), F13 path-traversal CLI behaviour (verified at T005 M-10 — SC-012 PASS/FAIL), F14 missing-destination-folder behaviour (verified at T005 M-11), F15 backslash-in-`to` per-platform observed behaviour (verified at T005 M-12), Unicode normalisation on macOS HFS+. **(9) Cross-references** — links to target-mode primitive, post-010 flat encoding, cli-adapter, help tool, and rename / delete / write_note as sibling write-side tools. NO `// Original — no upstream.` header (Markdown exempt). NO TODO/stub marker.
- [ ] T021 [P] [US7] Add the `move` entry to [docs/tools/index.md](../../docs/tools/index.md) — one-line entry alphabetically inserted between `links` and `obsidian_exec` consistent with the existing entries; the line should summarise: "Move a note in a vault (optionally renaming); honours the vault's auto-update-links setting."

**Checkpoint**: US7 lands. Tool registered; baseline rolled forward; server boots with the new entry; `help({ tool_name: "move" })` reads from the new doc; the drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers the new tool via its `it.each` registry walk (NO edit to `_register.test.ts` needed); the registry-consistency test at [src/server.test.ts](../../src/server.test.ts) auto-asserts the doc's existence (NO edit needed); the baseline-stability test at [src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts) auto-asserts the regenerated fingerprints (passes once T018 has run `npm run baseline:write`).

---

## Phase 11: User Story 8 — Same-folder move = rename equivalence (Priority: P3)

**Goal**: When `to` resolves to a destination whose folder matches the source's folder, the operation is effectively a rename. The wrapper does NOT special-case this; it forwards to the CLI uniformly. The CLI handles the same-folder move identically to a cross-folder move. The structural marker `dirname(fromPath) === dirname(toPath)` is observable from the caller; `docs/tools/move.md` documents the equivalence (per T020 section 6).

**Independent Test**: stub adapter returns success stdout with same-folder from/to paths (e.g., `Inbox/Old.md → Inbox/New.md`); calling `executeMove({ target_mode: "specific", vault: "V", path: "Inbox/Old.md", to: "Inbox/New.md" })` returns `{ moved: true, fromPath: "Inbox/Old.md", toPath: "Inbox/New.md" }`; assertion: `dirname(fromPath) === dirname(toPath)`.

- [ ] T022 [P] [US8] Write 1 same-folder-move handler test in [src/tools/move/handler.test.ts](../../src/tools/move/handler.test.ts) per data-model.md handler.test.ts case #19: **Case 24 (Story 8 AC#1)** stub adapter exits 0 with stdout matching the F6-locked success shape for `Inbox/Old.md → Inbox/New.md` → handler returns `{ moved: true, fromPath: "Inbox/Old.md", toPath: "Inbox/New.md" }`; **assert `dirname(fromPath) === dirname(toPath)` by string equality** (use the same `basename`/`dirname` semantics as the helper in T006 — `path.slice(0, path.lastIndexOf("/"))` for `dirname`). `spawnFn.callCount === 1`.

**Checkpoint**: US8 lands. The rename-equivalence invariant is observable from the test layer; the doc cross-references `rename` for callers choosing between the two surfaces.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: external surfaces, release artefacts, final validation.

- [ ] T023 [P] Bump version in [package.json](../../package.json) from `0.5.7` to `0.5.8` per SC-016 (patch level — purely additive surface; no existing tool changes, no error codes, no ADRs amended).
- [ ] T024 [P] Add an entry to [CHANGELOG.md](../../CHANGELOG.md) for `0.5.8` summarising: **typed move tool** — single-file move (optionally with rename) of vault files via the CLI's `move` subcommand; structured `{ moved: true, fromPath, toPath }` output; strict trailing-`/` discriminator on `to` for folder-target vs full-path-target (per /speckit-clarify Q2); source-`.md`-guarded `.md` append on full-path-target filename portion (per /speckit-clarify Q1; mirrors 020-fix-write-gaps R2 / 021-rename Q1 byte-equality precedents); prevents silent cross-type conversion on non-`.md` sources (`.canvas`, `.pdf`, attachments — `to=Archive/X` forwarded verbatim, NOT `Archive/X.md`); link-rewriting is vault-config-dependent (Settings → Files & Links → "Automatically update internal links"); **active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR`, NOT `ERR_NO_ACTIVE_FILE`** — inherited bridge-classifier mismatch documented across `delete` / `rename` / `move` and tracked under [[BI-0027 - Audit Tool Descriptions]] dimension C.2. The entry MUST also include a **discrete SC-015 routing bullet** (separate from the move feature summary) that names the published escape-hatch policy: *"For relocation operations, prefer `move`. For in-place renames (no folder change), `rename` remains preferred. `obsidian_exec move file=… to=…` remains the fallback for non-`.md` cross-type conversion (`.md → .canvas` etc.) — those bypass the wrapper's source-`.md` guard."* Cite spec/plan paths.
- [ ] T025 [P] Update [README.md](../../README.md) tools-list section if present — one row added consistent with existing entries.
- [ ] T026 Run `npm run lint` and confirm zero warnings (Constitution Development Workflow gate 1).
- [ ] T027 Run `npm run typecheck` and confirm zero errors (Constitution gate 2).
- [ ] T028 Run `npm run build` and confirm successful build (Constitution gate 3).
- [ ] T029 Run `npm test` (vitest run) and confirm: (a) all ~57 new tests pass; (b) existing test suite still passes byte-stable per SC-009; (c) the durable registry-stability baseline test at [src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts) passes (the roll-forward at T018 has the baseline matching the live registry); (d) aggregate `statements` coverage threshold at [vitest.config.ts:20](../../vitest.config.ts#L20) remains at or above the existing 91.3% floor (Constitution gate 5). If coverage ratchets up, ratchet the threshold line by one-line edit; if it doesn't change, leave the line alone.
- [ ] T030 Walk through the 22 + 13 quickstart scenarios at [quickstart.md](./quickstart.md) — Q-1..Q-22 are unit-test verifications already covered by T004 / T010 / T011 / T012 / T013 / T014 / T015 / T019 / T022; tick each off. M-1..M-13 were covered by T005 (the consolidation step locks F6–F16 in research.md). **Execute the three grep-gate SC verifications inline** (per the 021-rename precedent of verify-by-inspection at the polish phase): **SC-003** run `grep -E 'child_process|spawn\(|/Error:/' src/tools/move/handler.ts` from repo root; expected output: empty (handler routes through `invokeCli` only). **SC-004** run `grep -E '^(interface|type) Move' src/tools/move/schema.ts`; expected output: empty (only `z.infer<...>` typed surfaces exist). **SC-005** run `grep -E '\.describe\(' src/tools/move/schema.ts`; expected output: empty (parameter documentation lives in `docs/tools/move.md` per FR-004). If any grep returns non-empty, the BI is amended pre-merge to restore the gate. Then verify the seven key SC gates: **SC-001** (acceptance scenario count of 28 from spec — verified by combined test pass); **SC-006** (help body presence + content + the explicit `CLI_REPORTED_ERROR` active-mode note + `to`-shape rules with surprise-case worked examples + source-`.md`-guard explanation + obsidian_exec routing note from T024's discrete SC-015 bullet); **SC-007** (handler ≤70 LOC — run `wc -l src/tools/move/handler.ts`; expected ≤ 70); **SC-012** (path-traversal `to=` precondition — verified at T005 M-10; if CLI did NOT reject, this BI's pre-ship amendment landed before T026); **SC-013** (source-`.md`-guard suppression on non-`.md` source — verified at T011 Case 10); **SC-014** (capital-N classifier mismatch surfaces as `CLI_REPORTED_ERROR` — verified at T013 Case 15 + T019 Case 4 + T005 M-9); **SC-015** (obsidian_exec routing) verified via T024's CHANGELOG entry containing the discrete routing bullet. Confirm each Q-N lands as documented; report any drift from F1–F16 findings as a research.md amendment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately.
- **Phase 2 (Foundational — schemas)**: depends on Phase 1. BLOCKS every user story.
- **Phase 3 (US4 schema validation)**: depends on Phase 2. PARALLEL with Phase 4 (T0) — schema tests don't need T0 captures.
- **Phase 4 (T0 Live-CLI Pass)**: depends on Phase 1 (module scaffold for storage but probes don't touch code yet). **BLOCKS Phases 5–11** (every handler phase) because the `parseMoveResponse` regex pattern depends on F6/F16 captures.
- **Phase 5 (US1 MVP)**: depends on Phase 2 + Phase 4 (handler imports schema types; regex pattern from T0).
- **Phase 6 (US2 full-path + wikilink)**: depends on Phase 5 (handler must exist; argv shape established).
- **Phase 7 (US5 active mode + capital-N)**: depends on Phase 5 (handler must exist).
- **Phase 8 (US3 source/dest errors)**: depends on Phase 4 + Phase 5 (T014 references F3 / F10 captured at T005 verbatim).
- **Phase 9 (US6 CLI failures)**: depends on Phase 5 (handler must exist for stub-error tests to reach it).
- **Phase 10 (US7 Registration + docs + baseline roll-forward)**: depends on Phase 5 (handler must be feature-complete; T019's Case 4 reads docs; T018's baseline roll-forward needs the tool registered).
- **Phase 11 (US8 same-folder move)**: depends on Phase 5 (handler must exist).
- **Phase 12 (Polish)**: depends on Phase 10 + Phase 11 (tool must be live + baseline rolled before lint/typecheck/build/test pass).

### Within Each User Story

- Schema (T002, T003) before handler (T006–T009).
- Helpers (T006, T007, T008) before main function body (T009).
- Handler body (T009) before handler tests (T010–T015, T022).
- Handler tests + registration (T016–T021) before registration tests (T019) — actually T016 lands first; T019 imports the factory; T020 docs can land in parallel; T018 baseline roll-forward MUST land in the same commit as T016+T017.
- Server wiring (T017) after T016 (the factory must exist before it can be imported).
- T018 baseline roll-forward depends on T016 + T017 (the live registry must include `move` before `baseline:write` regenerates the JSON).
- Docs (T020) can land in parallel with T016/T017/T018/T019 but T019's Case 4 reads the file, so T020 must complete before T019's Case 4 runs (T019 written before T020 lands is OK; T019 Case 4 will fail until T020 lands — that's the right RED-GREEN cycle).

### Parallel Opportunities

- Within Phase 2: T002 and T003 both edit `schema.ts` — sequential.
- Within Phase 3: T004 alone (one test file).
- Within Phase 4: T005 is a single orchestrated probe sweep — sequential within itself.
- Within Phase 5: T006 → T007 → T008 → T009 strictly sequential (T009 imports T006/T007/T008 helpers). T010 [P] runs after T009.
- Within Phase 6, 7, 8, 9, 11: each phase is one or two test-tasks — [P] tasks across these phases CAN run in parallel by different contributors as long as the `handler.test.ts` file edits don't conflict (each test phase adds new `describe` / `it` blocks).
- Within Phase 10: T016 → T017 → T018 sequential (T017 imports T016; T018 requires both registered); T019 and T020 [P] (different files); T021 [P] (different file). T020's completion gates T019's Case 4 assertions but the test file can be written before the doc lands.
- Within Phase 12: T023 / T024 / T025 are [P] — `package.json`, `CHANGELOG.md`, `README.md` (different files).
- Constitutional gates (T026 / T027 / T028 / T029) run sequentially because they share the build output.

---

## Parallel Example: User Story 1 (Phase 5)

Once T002 / T003 / T005 / T006 / T007 / T008 / T009 land, the handler tests (T010) and the cross-story handler tests (T011 / T012 / T013 / T014 / T015 / T022) can be drafted in parallel by different contributors — they all add new `describe` / `it` blocks to `handler.test.ts`. The handler implementation itself (T006 → T007 → T008 → T009) is strictly sequential within `handler.ts`.

```text
# Sequential within handler.ts:
T006 Implement basename helper
T007 Implement resolveTo helper (per /speckit-clarify Q1+Q2)
T008 Implement parseMoveResponse helper + MOVE_RESPONSE_RE (regex from T005)
T009 Implement executeMove main body (single invokeCli + response parse)

# Parallel within handler.test.ts (test groups can be drafted by different contributors):
T010 [P] US1 folder-target tests (5 cases)
T011 [P] US2 full-path-target tests (6 cases — including SC-013 load-bearing case 10)
T012 [P] US2 wikilink-locator tests (2 cases)
T013 [P] US5 active mode + capital-N tests (2 cases — including SC-014 load-bearing case 15)
T014 [P] US3 source/dest structured-error tests (2 cases)
T015 [P] US6 CLI-failure propagation tests (5 cases)
T022 [P] US8 same-folder move test (1 case)
```

Total handler tests across all stories: 28 cases (matches the data-model.md handler.test.ts inventory).

---

## Implementation Strategy

### MVP First (US1 only — specific-mode folder-target move)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (schemas).
3. Complete Phase 3: US4 validation tests (schema-only; gates the input contract).
4. Complete Phase 4: T0 Live-CLI pass (locks `MOVE_RESPONSE_RE` pattern + verifies SC-012 + SC-014).
5. Complete Phase 5: US1 implementation + handler tests.
6. Complete Phase 10: US7 registration + docs + baseline roll-forward (the MVP must be reachable from the MCP wire).
7. **STOP and VALIDATE**: run `npm test` for the move module. The MVP slice ships once T010 / T016–T021 land.
8. **Deploy/demo**: agents can now do `move({ target_mode: "specific", vault, path, to: "Archive/" })` end-to-end.

### Incremental Delivery

1. Setup + Foundational → schemas in place.
2. US4 schema validation tests → boundary safety verified.
3. T0 Live-CLI pass → `MOVE_RESPONSE_RE` locked; SC-012 + SC-014 verified (or amendments landed pre-ship).
4. US1 specific-mode folder-target → MVP handler works.
5. US2 full-path-target + wikilink locator → all locator/destination combos covered.
6. US5 active mode + capital-N → target-mode parity + inherited classifier mismatch locked.
7. US3 structured errors → source-not-found and destination-collision actionable.
8. US6 CLI-failure propagation → full error matrix observable.
9. US7 registration + docs + baseline → tool live on the MCP wire.
10. US8 same-folder move → rename-equivalence invariant observable.
11. Polish → release-ready.

### Single-developer strategy

This feature is small enough (~120 LOC source, ~880 LOC test, ~250 LOC docs) that one developer carries the full task list in sequence. The dependency graph is essentially linear within `handler.ts` (T006 → T007 → T008 → T009); test files allow parallel drafting between contributors but in a one-developer scenario they're written in the same flow as the handler edits they cover. The post-022 baseline roll-forward (T018) is a single `npm run baseline:write` command — no manual JSON editing.

---

## Notes

- **[P] marker discipline**: only tasks that edit DIFFERENT files OR write fresh code without depending on incomplete tasks earn `[P]`. Test files (`schema.test.ts`, `handler.test.ts`, `index.test.ts`) are SHARED resources — within a single test file, test groups are logically independent but co-edit the same file; `[P]` is granted only when contributors will not conflict.
- **Story label discipline**: every Phase 3 + Phase 5–11 task carries the relevant `[US#]` label. Phase 1 / 2 / 4 / 12 tasks do NOT carry story labels (Phase 4 is T0 cross-cutting; the others are pre/post infrastructure).
- **Each user story should be independently completable and testable**: US4 (validation) is fully covered by T004 + schemas (T002 / T003). US1 (folder-target) ships once T006 / T007 / T008 / T009 / T010 + T016–T021 land. US2 / US5 / US3 / US6 / US8 are each just a single or paired test-task on top of the US1 handler. US7 is T016–T021.
- **Constitutional gates**: T026 (lint) / T027 (typecheck) / T028 (build) / T029 (vitest with coverage floor + baseline-stability test) run after every story checkpoint AND once more at the very end. Coverage threshold ratchet via one-line visible edit at [vitest.config.ts:20](../../vitest.config.ts#L20) only if the aggregate moved.
- **Test scope reminder** (from auto-memory `feedback_test_scope.md`): this repo covers vitest unit tests only; manual integration probes are reported in `research.md` / `quickstart.md` rather than scaffolded as `TC-*` test cases. The T005 T0 probe pass is reported in research.md as F6–F16 amendments, NOT as new test cases.
- **Verify tests fail before implementing**: vitest-style; write the test first (RED), watch it fail (the spawn-stub assertions, the response-shape assertions, the doc-presence assertions), then write the source change to flip it green.
- **Commit after each logical group** (recommended cuts): T001 alone (scaffold); T002+T003 (schemas); T004 alone (US4 validation tests); T005 alone (T0 probe + F6–F16 research amendments); T006+T007+T008+T009 (handler implementation — helpers + main body); T010 alone (US1 tests); T011 alone (US2 full-path tests); T012 alone (US2 wikilink tests); T013 alone (US5); T014 alone (US3); T015 alone (US6); T022 alone (US8); T016+T017+T018 (registration + server wiring + baseline roll-forward — MUST be one commit per FR-013a / R13); T019+T020+T021 (registration tests + docs + index entry); T023+T024+T025 (release surfaces); T026–T029 (constitution gates batch); T030 alone (quickstart walk-through).
- **Stop at any checkpoint**: every user story phase ends at a checkpoint where the story is independently testable. Stop there to validate before moving to the next.
- **Plan-stage spec amendments** (per R12): NONE for 030. Both /speckit-clarify decisions were locked at spec stage; the five live-CLI findings (F1–F5b) ratified the spec without surfacing contradictions; no Phase-0 amendments needed.
- **SC-012 path-traversal gate at T005 M-10**: if the CLI does NOT reject path-traversal-shaped `to=` values, this BI is amended **pre-ship** to add a tool-layer reject (and 2 new schema test cases in T004). The amendment lands before T026 (lint) runs.
- **SC-014 capital-N classifier gate at T005 M-9**: if the CLI emits lowercase wording (divergent from anticipated capital-N), the spec is amended pre-ship to flip the error roster from `CLI_REPORTED_ERROR` to `ERR_NO_ACTIVE_FILE` AND update `docs/tools/move.md` accordingly AND switch T013 Case 15 to assert `ERR_NO_ACTIVE_FILE`. The amendment lands before T026 (lint) runs.
- **Post-022 registry-stability baseline (T018)**: `npm run baseline:write` MUST run in the same commit as T016 + T017 per FR-013a / R13. Without it, `npm test` fails at the `_register-baseline.test.ts` step.
- **Avoid**: vague tasks (no file path), same-file conflicts in `[P]` tasks, cross-story dependencies that break the MVP slice's independence.

---

## Task count summary

- **Phase 1 (Setup)**: 1 task (T001)
- **Phase 2 (Foundational — schemas)**: 2 tasks (T002, T003)
- **Phase 3 (US4 validation)**: 1 task (T004)
- **Phase 4 (T0 Live-CLI Pass)**: 1 task (T005)
- **Phase 5 (US1 MVP — folder-target)**: 5 tasks (T006, T007, T008, T009, T010)
- **Phase 6 (US2 full-path + wikilink)**: 2 tasks (T011, T012)
- **Phase 7 (US5 active mode + capital-N)**: 1 task (T013)
- **Phase 8 (US3 source/dest errors)**: 1 task (T014)
- **Phase 9 (US6 CLI failures)**: 1 task (T015)
- **Phase 10 (US7 Registration + docs + baseline)**: 6 tasks (T016, T017, T018, T019, T020, T021)
- **Phase 11 (US8 same-folder move)**: 1 task (T022)
- **Phase 12 (Polish)**: 8 tasks (T023–T030)

**Total: 30 tasks.** Tests are co-merged with implementation per Constitution II. Format conforms to the strict checklist convention: `- [ ] TXXX [P?] [US#?] description with file path`.

> **Note on counts** — three independent counts appear in 030's planning artefacts and should NOT be conflated: **(a) 30 tasks** = work items in this tasks.md (this number); **(b) 28 acceptance scenarios** per [spec.md](./spec.md) SC-001 = AC sub-items across User Stories 1–8; **(c) ~57 vitest cases** per [data-model.md](./data-model.md) test inventory = co-located test cases in `schema.test.ts` / `handler.test.ts` / `index.test.ts` (~24 + ~28 + ~5). Each is a different unit (a = procedural steps; b = behavioural requirements; c = vitest `it` blocks). T004 alone packs ~24 vitest cases; T010 packs 5; T011 packs 6; etc.

Coverage map:

- **MVP gate**: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T016 → T017 → T018 → T019 → T020 → T021 (16 tasks for the MVP slice).
- **Full feature**: all 30 tasks.
- **Test count**: ~57 cases total at the upper bound, ~53 standalone at the lower bound. **Standalone breakdown**: ~24 schema in T004; **24 standalone handler** across T010 (5) + T011 (6) + T012 (2) + T013 (2) + T014 (2) + T015 (6) + T022 (1); ~5 registration in T019. The "~28 handler" framing in data-model.md's inventory counts an additional ~4 composite/cross-cutting assertions absorbed into the standalone tests' `beforeEach` blocks or inline: the single-spawn-invariant assertion (`spawnFn.callCount === 1` in every handler test), the argv-key-ordering invariant (data-model.md case #28), and the parseMoveResponse three-shape fallback chain (cases #23–#25) that the standalone error-propagation tests exercise across multiple branches. Both framings are valid — the upper bound counts every distinct logical assertion; the lower bound counts only standalone `it()` blocks. The "~" prefix on every count concedes this approximation. Matches the FR-016 inventory locked in data-model.md.

- **Load-bearing test gates**:
  - **SC-006**: T019 Case 4 asserts `docs/tools/move.md` body completeness — covers all four propagated error codes, the explicit active-mode CLI_REPORTED_ERROR note, the four required example shapes, the link-rewriting caveat, the `to`-shape rules section with surprise-case worked examples, the source-`.md`-guard explanation, the rename-equivalence note, and the "ALWAYS include trailing `/`" guidance.
  - **SC-013**: T011 Case 10 asserts source-`.md`-guard suppression on non-`.md` source — `path: "Boards/Plan.canvas", to: "Archive/Renamed"` produces forwarded `Archive/Renamed` verbatim. **Prevents silent `.canvas → .md` cross-type conversion regression**.
  - **SC-014**: T013 Case 15 asserts capital-N CLI_REPORTED_ERROR classifier behaviour — stub adapter throws `CLI_REPORTED_ERROR` with `details.message: "Error: No active file.\n"`; handler propagates the code unchanged. **Documents observable behaviour; future bridge-classifier fix that would flip this to ERR_NO_ACTIVE_FILE is caught here**.
  - **SC-012**: T005 M-10 verifies CLI's behaviour on `to=` traversal. Gates pre-ship spec amendment if CLI does not reject.
