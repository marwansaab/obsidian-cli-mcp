---
description: "Task list for 016-reliable-writer — direct-fs-write replacement of write_note per ADR-009"
---

# Tasks: Reliable Writer (016)

**Input**: Design documents from `/specs/016-reliable-writer/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED — Constitution Principle II is non-negotiable. Every public surface ships with at least one happy-path + one failure-or-boundary co-located vitest test in the same change. Test counts here match the data-model.md inventory (~87 cases total).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Within each story, tests are authored before implementation per Constitution / TDD discipline. The `src/tools/write_note/handler.ts` file is touched by multiple stories sequentially (single shared file); each story's tasks add only its slice of behaviour.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no incomplete dependencies — can run in parallel
- **[Story]**: Maps task to a spec.md user story (US1..US6); REQUIRED for Phases 3-8; absent for Phases 1, 2, 9
- File paths in every task per CONTRIBUTING.md

## Path Conventions

- **Single-project layout** per Constitution Principle I + the project's existing tree
- Source: `src/<module>/<file>.ts`
- Co-located tests: `src/<module>/<file>.test.ts`
- Docs: `docs/tools/<tool-name>.md`
- All paths shown are relative to repo root `c:/Github/obsidian-cli-mcp/`

---

## Phase 1: Setup

**Purpose**: Sanity-check that all design inputs are in place. No project initialization needed — the repo, tooling, and dependency tree all already exist.

- [ ] T001 Verify [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md), and the four files under [contracts/](contracts/) (`write-note-input.contract.md`, `write-note-handler.contract.md`, `vault-registry.contract.md`, `path-safety.contract.md`) all exist and are readable. Confirm no `[NEEDS CLARIFICATION]` markers remain in spec.md (per checklists/requirements.md PASS).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: T0 live-CLI characterization + the two new internal modules + the write_note schema. Every user story (Phases 3-8) depends on these.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [ ] T002 T0 live-CLI characterization against `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). (a) Confirm F1: argv-IPC threshold still ~4 KB on Windows (single content-size probe at 5 KB via `obsidian create` — should crash; do not rerun the full 4-question bisect). (b) Confirm F2: `obsidian vaults verbose` still returns tab-separated `<name>\t<path>`. (c) Confirm F3: `obsidian eval code=<small-payload>` still returns `=> <result>` prefix on stdout. (d) Decide path-safety extended-character regex policy: extend `[\x00-\x1f]` to include DEL `\x7f` (Recommended; one regex char), OR leave as-is. (e) Decide orphan `.tmp` cleanup pattern: best-effort `fs.unlink(tmpPath).catch(() => {})` after `fs.rename` failure (Recommended), OR leave-orphan with manual cleanup. (f) Decide whether to add a deterministic concurrency test for FILE_EXISTS race-freeness (skip recommended; document in test file as "covered by `wx` flag semantics; deterministic test omitted"). (g) Decide whether to add a mid-write SIGTERM test in vitest (skip recommended; defer to manual M-4 in quickstart.md). Record (d), (e), (f), (g) decisions as a header comment in the relevant test file.

- [ ] T002a Extend [src/logger.ts](../../src/logger.ts) per Analyze C1 + M4 (2026-05-10). (a) Define a new typed event interface `PathEscapeAttemptEvent` with shape `{ vault: string | null, attemptedPath: string }`. (b) Add a new method to the `Logger` interface: `pathEscapeAttempt(event: PathEscapeAttemptEvent): void` — follows the existing per-event-type method convention (cf. `dispatchTimeout` / `dispatchCap` / `dispatchKill`). (c) Implement the method in `createLogger`'s returned object — emit `{ event: "pathEscapeAttempt", vault, attemptedPath }` via the same `emit(payload)` helper the existing methods use. (d) Amend the exported `ErrorCode` union type (currently 6 codes) to add the three new codes from FR-020: `"PATH_ESCAPES_VAULT" | "FILE_EXISTS" | "FS_WRITE_FAILED"` (alphabetically interleaved). (e) Update [src/logger.test.ts](../../src/logger.test.ts) co-located test file to add at minimum one happy-path case (call `logger.pathEscapeAttempt({vault: "TestVault", attemptedPath: "subdir/escape.md"})` and assert the JSON-line written to the captured stream contains the expected event/vault/attemptedPath fields) AND one boundary case (vault: null for active-mode rejection); ensure the existing tests for `dispatchTimeout` / `dispatchCap` / `dispatchKill` / `shutdown` continue to pass per Constitution II. **Foundational dependency**: blocks T015 / T016 (US4 handler tests + impl that consume the new method). Pre-emptively unblocks the original FR-029 design that referenced a non-existent `logger.warn` method.

- [ ] T003 [P] Author [src/vault-registry/registry.test.ts](../../src/vault-registry/registry.test.ts) with 10 test cases per data-model.md test inventory: (1) first-call probe + cache hit on second call; (2) tab-separated multi-vault parse; (3) `resolveVaultPath("known")` returns expected path; (4) `resolveVaultPath("unknown")` → `VALIDATION_ERROR`; (5) probe failure (`CLI_BINARY_NOT_FOUND`) propagates + cache stays empty; (6) probe failure → second call retries probe; (7) successful probe after prior failure populates cache; (8) empty stdout → empty registry; (9) malformed row (no `\t`) skipped silently; (10) concurrent first-calls share one probe (deduplicated via `inFlightProbe`).

- [ ] T004 Implement [src/vault-registry/registry.ts](../../src/vault-registry/registry.ts) per [contracts/vault-registry.contract.md](contracts/vault-registry.contract.md). Public surface: `createVaultRegistry(deps).resolveVaultPath(name)`. Internal: lazy probe via `deps.invokeProbe`, cached `ReadonlyMap<string, string>` once successful, retry-on-failure (cache only set on success), `inFlightProbe` deduplication for concurrent first-calls. Parser per F2 spec — split on `\n`, then on first `\t`; tolerate `\r`, BOM, malformed rows. Header per Constitution V (`// Original — no upstream.` + ADR-009 citation).

- [ ] T005 [P] Author [src/path-safety/schema.test.ts](../../src/path-safety/schema.test.ts) with 12 test cases per data-model.md inventory: (1) plain vault-relative path accepted; (2) spaces + Unicode accepted; (3) brackets/parens accepted; (4)-(6) `../`-segment variants rejected; (7) leading `/` rejected; (8) leading `\` rejected; (9)-(10) drive-letter prefix rejected; (11) control characters rejected; (12) empty string rejected. If T002 (d) extended the regex to DEL, add a 13th case for DEL.

- [ ] T006 [P] Implement [src/path-safety/schema.ts](../../src/path-safety/schema.ts) per [contracts/path-safety.contract.md](contracts/path-safety.contract.md). Exports `isStructurallySafePath(input: string): boolean` and `STRUCTURALLY_UNSAFE_PATH_MESSAGE`. Predicate per the canonical implementation in the contract. Header per Constitution V.

- [ ] T007 [P] Author [src/path-safety/canonical.test.ts](../../src/path-safety/canonical.test.ts) with 8 test cases per data-model.md inventory: (1) input resolves under vault root → `ok: true`; (2) symlink-to-outside via parent → `ok: false`; (3) ENOENT lexical fallback → `ok: true`; (4) nested-existing-symlink dir canonicalised correctly; (5) vault root itself a symlink — both root and target canonicalised; (6) `resolvedPath` is suitable absolute path; (7) `attemptedPath` echoes input verbatim (for FR-029 logger); (8) non-ENOENT realpath error (e.g. EACCES) propagates as-is.

- [ ] T008 Implement [src/path-safety/canonical.ts](../../src/path-safety/canonical.ts) per [contracts/path-safety.contract.md](contracts/path-safety.contract.md). Exports `checkCanonicalPath(vaultRoot, inputPath, deps)`. Algorithm per the contract: lexical join → `realpath(parentDir)` (or ENOENT-fallback to lexical `parentDir`) → canonicalise vault root → join `canonicalParent + basename` → `startsWith(canonicalRoot + sep)` check. Returns `CanonicalCheckOk` or `CanonicalCheckEscape`. Pre-mkdir order per FR-014. Header per Constitution V.

- [ ] T009 [P] Author [src/tools/write_note/schema.test.ts](../../src/tools/write_note/schema.test.ts) with 22 test cases per data-model.md inventory: target-mode discriminator cases (1-11), `template` rejection via strict (12), `open` accepted (13), `overwrite` default (14), path-safety integration (15-17), edge cases (18-19), output schema cases (20-22). NOTE: this test file overwrites the legacy `src/tools/write_note/schema.test.ts` per FR-028.

- [ ] T010 Implement [src/tools/write_note/schema.ts](../../src/tools/write_note/schema.ts) per [contracts/write-note-input.contract.md](contracts/write-note-input.contract.md). Builds `writeNoteInputSchema` from `targetModeBaseSchema.extend(...)` + `applyTargetModeRefinement` + `superRefine` for active-mode rules. `file` and `path` fields use `z.string().min(1).refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE)`. Output schema `{ created, path }` strict. `template` parameter NOT in schema — strict mode rejects with `unrecognized_keys`. Depends on T006 (path-safety/schema). Header per Constitution V. NOTE: overwrites the legacy `src/tools/write_note/schema.ts` per FR-028.

**Checkpoint**: Foundation ready — vault-registry + path-safety modules + write_note schema all exist and pass their tests. User story implementation can now begin.

---

## Phase 3: User Story 1 — Reliable specific-mode writes at any practical size (Priority: P1) 🎯 MVP

**Goal**: An agent calls `write_note` with content of any practical size against a named path inside a named vault; the call either succeeds (file created/replaced byte-for-byte) or fails with a structured error, without ever crashing Obsidian's main process. User content never crosses argv.

**Independent Test**: Invoke the new `write_note` against `TestVault-Obsidian-CLI-MCP` with content samples spanning 60 B, 5 KB, 12 KB, 100 KB. Verify (a) file exists at requested path with byte-for-byte matching content, (b) no Obsidian crash dialog appeared, (c) no spawn argv element carries the content, (d) all spawn argv elements stay ≤ 250 bytes.

### Tests for User Story 1 ⚠️

- [ ] T011 [US1] Add US1-mapped cases to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per data-model.md inventory cases #1, #2, #5-#7, #9-#12, #21-#30 (range expanded per Analyze H1 / M1 / M3): specific-mode happy path (#1 — fresh file → `{ created: true, path }`); specific-mode overwrite=true happy path (#2 — replace → `{ created: false, path }`); auto-mkdir nested parents (#5); `vault=Foo` resolves to Foo's path even when focused vault is Bar (#6 — R11 resolved); vault=Unknown → `VALIDATION_ERROR` propagated from registry (#7 — Analyze M1); atomic write tmp file orphaned cleanly when rename fails (#9 — Analyze H1, FR-008 best-effort cleanup); atomic write temp file UUID uniqueness for concurrent writes (#10 — Analyze H1, FR-008); metadataCache invalidation eval succeeds (#11 — FR-011 happy half); metadataCache invalidation eval fails → response is STILL success (#12 — Analyze H1, FR-011 failure-or-boundary half satisfying Constitution II); content with quotes/brackets/JSON-fragments byte-faithful (#21, #22); content with CRLF/LF mix preserved (#23); content with emoji + multi-byte UTF-8 preserved (#24); spawn-arg-length assertion (#25 — no argv element contains content; #26 — all ≤ 250 bytes); 100KB content sanity (#27); vault-registry probe-on-first-call + cache-hit-on-second-call (#28); probe failure on first write → handler retries on second write (#29 — covers FR-012 retry semantics at handler integration layer; verifies T003 case #6 propagates correctly through the handler); output envelope shape exactly `{ created, path }` (#30 — Analyze M3). NOTE: this test file overwrites the legacy `src/tools/write_note/handler.test.ts` per FR-028.

### Implementation for User Story 1

- [ ] T012 [US1] Create [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) with the specific-mode happy path per [contracts/write-note-handler.contract.md](contracts/write-note-handler.contract.md). Implement: (1) `vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault)`; (2) `relPath = input.path ?? input.file` then `checkCanonicalPath(vaultRoot, relPath, { realpath: deps.fs.realpath })`; (3) `fs.mkdir(dirname(absPath), { recursive: true })`; (4a) overwrite=true: pre-write `fs.realpath(absPath)` to determine `existedBefore`, write to `<absPath>.<randomUUID()>.tmp`, `fs.rename(tmp → absPath)`, on rename failure best-effort `fs.unlink(tmp)` per T002 (e); (5) post-write invalidate eval (best-effort failure per FR-011 — logger.debug, return success anyway); (7) return `{ created: !existedBefore, path: relPath }`. Wire `ExecuteDeps` interface from data-model.md. Default `deps.fs` to `node:fs/promises` adapter. Default `deps.spawnFn` to undefined (cli-adapter uses its own). Header per Constitution V (`// Original — no upstream.` + ADR-009 citation). NOTE: overwrites the legacy `src/tools/write_note/handler.ts` per FR-028.

**Checkpoint**: US1 functional — fresh creates and overwrite=true replacements succeed at every tested size; content byte-faithful; no host crash; no content over argv.

---

## Phase 4: User Story 2 — Structured collision behaviour (Priority: P1)

**Goal**: An agent attempting `overwrite: false` against an existing path receives a structured `FILE_EXISTS` error and the existing note's content is unchanged. No silent rename.

**Independent Test**: Write a note at path P; second call to P with `overwrite: false` → `FILE_EXISTS`; on-disk content unchanged. Third call with `overwrite: true` → success and content replaced.

### Tests for User Story 2 ⚠️

- [ ] T013 [US2] Add US2-mapped cases to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per data-model.md inventory cases #3, #4: overwrite=false against existing → `FILE_EXISTS`, original content unchanged; overwrite=false against fresh path → `FILE_EXISTS` NOT raised, file created. Document the FILE_EXISTS race-freeness via the `wx` flag in a header comment per T002 (f) decision (deterministic concurrency test omitted).

### Implementation for User Story 2

- [ ] T014 [US2] Add overwrite=false branch to [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) per [contracts/write-note-handler.contract.md](contracts/write-note-handler.contract.md) Step 4 false-branch. Implement: `await deps.fs.writeFile(absPath, input.content, { flag: "wx" })`; catch EEXIST and throw `UpstreamError({ code: "FILE_EXISTS", details: { path: relPath, vault: input.vault ?? null } })`. The wx flag eliminates the TOCTOU race window between exists-check and write. Updates the dispatch in T012's handler to branch on `input.overwrite`.

**Checkpoint**: US2 functional — collision returns structured FILE_EXISTS atomically; original content preserved; no silent rename anywhere in the code path.

---

## Phase 5: User Story 4 — Path-safety against vault-escape attempts (Priority: P1)

**Goal**: Path-traversal-shaped inputs are rejected at the schema layer with `VALIDATION_ERROR`; symlink-escape attempts are rejected at the runtime canonical-check layer with `PATH_ESCAPES_VAULT` plus a `pathEscapeAttempt` security event in the logger. No file outside the vault root is ever touched.

**Independent Test**: Attempt writes to `../escape.md`, `subdir/../../escape.md`, `/abs/escape.md`, `C:\\Windows\\escape.md`; each returns `VALIDATION_ERROR`. Symlink inside vault pointing outside → `PATH_ESCAPES_VAULT`. Verify no file outside vault root touched; verify logger event fired for symlink case.

### Tests for User Story 4 ⚠️

- [ ] T015 [US4] Add US4-mapped cases to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per data-model.md inventory cases #8, #19, #20: path-escape attempt (mocked `fs.realpath` returns outside-vault path) → `PATH_ESCAPES_VAULT` + `pathEscapeAttempt` logger.warn event fired with `{ vault, attemptedPath }`; FS_WRITE_FAILED with `details.errno: "ENOSPC"`; FS_WRITE_FAILED with `details.errno: "EACCES"`. Schema-layer rejection cases (#15-#17 in the schema test file from T009) are already covered.

### Implementation for User Story 4

- [ ] T016 [US4] Wire path-safety + fs-error mapping into [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) per [contracts/write-note-handler.contract.md](contracts/write-note-handler.contract.md) Step 2 + the `mapFsError` helper. Add: (a) on `checkCanonicalPath` returning `ok: false`: emit `deps.logger.warn({ event: "pathEscapeAttempt", vault: input.vault ?? "<active>", attemptedPath })` per FR-029, then throw `UpstreamError({ code: "PATH_ESCAPES_VAULT", details: { vault, attemptedPath, resolvedPath } })`. (b) `mapFsError(e)` helper: errno→code mapping (EEXIST → defensive FILE_EXISTS, anything else → FS_WRITE_FAILED with `details.errno`, `details.syscall`, `details.path`). Wrap fs.mkdir / fs.writeFile / fs.rename failures with `mapFsError`.

**Checkpoint**: US4 functional — both layers of path safety active; security event logged on canonical-check rejection; no fs touch on any rejected path; FS_WRITE_FAILED carries errno detail.

---

## Phase 6: User Story 3 — Active-mode writes to focused note (Priority: P2)

**Goal**: An agent invokes `write_note` in active mode (no `vault`/`file`/`path`); the handler resolves the focused note's path via a small bug-safe pre-write `eval`, then writes through the same fs path. No focused note → `ERR_NO_ACTIVE_FILE`.

**Independent Test**: With a focused note, active-mode write replaces its content; immediately following `read_property` returns the new value. Without a focused note, returns `ERR_NO_ACTIVE_FILE`.

### Tests for User Story 3 ⚠️

- [ ] T017 [US3] Add US3-mapped cases to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per data-model.md inventory cases #13, #14, #15: active mode with focused file → write at resolved path, returns `{ created: false, path: <focused-path> }`; active mode with no focused file (eval returns `path: null`) → `ERR_NO_ACTIVE_FILE`; active-mode focused-file eval is ~120 bytes argv (assert spawn args length).

### Implementation for User Story 3

- [ ] T018 [US3] Add active-mode branch to [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) per [contracts/write-note-handler.contract.md](contracts/write-note-handler.contract.md) Step 1 active-mode branch. Implement: (1) emit `FOCUSED_FILE_TEMPLATE` eval via `invokeCli({ command: "eval", parameters: { code: <template> }, target_mode: "active" }, ...)`; (2) strip `=> ` prefix from response stdout, JSON.parse, validate shape `{ path: string | null, base: string }`; (3) if `path === null` → throw `UpstreamError({ code: "ERR_NO_ACTIVE_FILE", message: <existing project recovery message> })`; (4) set `vaultRoot = resp.base; relPath = resp.path`; (5) fall through to common Steps 2-7 (path safety → mkdir → write → invalidate). The `FOCUSED_FILE_TEMPLATE` constant is the bug-safe template per data-model.md eval-templates section.

**Checkpoint**: US3 functional — active-mode writes work; no-focused-file returns the structured error; eval argv is bug-safe.

---

## Phase 7: User Story 6 — Migration parity from predecessor (Priority: P2)

**Goal**: Callers using the predecessor's input shape continue to function with no changes EXCEPT (a) `template` parameter is rejected with a clear migration-pointer message, (b) collision returns `FILE_EXISTS` instead of silent rename. The `open` parameter is preserved with identical observable semantics.

**Independent Test**: Replay every predecessor's published-help worked example. Each succeeds (for unchanged shapes) or returns `VALIDATION_ERROR` naming `template` and pointing at `obsidian_exec` (for shapes using `template`). `open: true` opens the new file in the editor.

### Tests for User Story 6 ⚠️

- [ ] T019 [US6] Add US6-mapped cases to [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts) per data-model.md inventory cases #16, #17, #18: `open: true` → post-write `openLinkText` eval fired (verify via spawn-args inspection); `open: true` + post-write open eval fails → response is STILL success (best-effort per FR-017 nicety); `open: false` (default) → no openLinkText eval emitted. Schema-layer template-rejection (case #12) and open-acceptance (case #13) are already in T009's batch; output-shape parity (cases #20-#22) too.

### Implementation for User Story 6

- [ ] T020 [US6] Add `open: true` post-write eval branch to [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) per [contracts/write-note-handler.contract.md](contracts/write-note-handler.contract.md) Step 6. Implement: if `input.target_mode === "specific" && input.open === true` (active mode forbids open per schema), build `OPEN_TEMPLATE` from `data-model.md` eval-templates section, fire via `invokeCli`. Wrap in try/catch — failure logs `logger.debug({ event: "openInEditorFailed" })` and returns success per FR-017 best-effort precedent. The `template` rejection is already enforced at the schema layer (FR-016 / T010 strict mode); no handler-side work needed.

**Checkpoint**: US6 functional — predecessor migration is invisible for compatible shapes; `template` users get a clean error pointing at `obsidian_exec`; `open: true` continues to work.

---

## Phase 8: User Story 5 — Discoverable, self-describing tool (Priority: P3)

**Goal**: Agent can request progressive-disclosure help for `write_note` and the returned doc is sufficient on its own to construct a valid invocation, predict response shape on success and on each documented failure, understand the migration story (template dropped, FILE_EXISTS instead of silent rename), and understand the upstream defect that motivated the architecture pivot.

**Independent Test**: Through MCP Inspector / Claude Desktop, invoke `help` with `tool_name: "write_note"`; assert the returned text covers all six FR-022 dimensions (purpose, when-to-use vs when-not-to, full input contract w/ template + open callouts, full output and error contract w/ each stable error code, upstream rationale citing forum URL + ADR-009, ≥1 worked example each for specific + active mode).

### Tests for User Story 5 ⚠️

- [ ] T021 [US5] Author [src/tools/write_note/index.test.ts](../../src/tools/write_note/index.test.ts) with 5 test cases per data-model.md inventory: (1) tool name is exactly `"write_note"`; (2) tool description ends with `Call help({ tool_name: "write_note" })` per ADR-005; (3) `docs/tools/write_note.md` exists at the expected `import.meta.url`-anchored path (per ADR-005 path-resolution pattern); (4) `inputSchema.required` includes `target_mode` (under-promise pattern); (5) `inputSchema.additionalProperties` is `false` (catches `template` etc. at the strict-naive client layer). NOTE: overwrites the legacy `src/tools/write_note/index.test.ts` per FR-028.

### Implementation for User Story 5

- [ ] T022 [US5] Implement [src/tools/write_note/index.ts](../../src/tools/write_note/index.ts) per [data-model.md](data-model.md) tool-registration section. Exports `WRITE_NOTE_TOOL_NAME = "write_note"`, `WRITE_NOTE_DESCRIPTION` (one-paragraph; ends with the standard help-pointer), `RegisterDeps = ExecuteDeps`, `createWriteNoteTool(deps)` factory using `registerTool` per ADR-006. Header per Constitution V (`// Original — no upstream.` + ADR-009 citation). NOTE: overwrites the legacy `src/tools/write_note/index.ts` per FR-028.

- [ ] T023 [US5] Rewrite [docs/tools/write_note.md](../../docs/tools/write_note.md) to cover all six FR-022 dimensions. Structure: (a) **Purpose** — what the tool does, identifies as a write-targeted tool that creates/overwrites a single note via direct filesystem write per ADR-009; (b) **When to use / when not to** — single-note write vs vault-wide search vs other write surfaces; explicit "for template-based creation, use `obsidian_exec`" callout; (c) **Input contract** — every parameter (target_mode, vault, file, path, content, overwrite, open) with type, requiredness, default; explicit "`template` is no longer accepted; migration: use `obsidian_exec`" callout; explicit "`open` is now implemented via post-write editor focus rather than the CLI's `--open` flag" callout; (d) **Output and error contract** — `{ created, path }` success envelope; full error roster (`VALIDATION_ERROR`, `ERR_NO_ACTIVE_FILE`, `FILE_EXISTS`, `PATH_ESCAPES_VAULT`, `FS_WRITE_FAILED`); when each fires; recovery hints; (e) **Upstream rationale** — BI-038, the forum URL `https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119`, citation to ADR-009; (f) **Worked examples** — at minimum one specific-mode example (fresh create) and one active-mode example, plus the `template` migration example. NOTE: overwrites the legacy `docs/tools/write_note.md` per FR-028.

**Checkpoint**: US5 functional — `help` returns the full doc; all six dimensions covered; doc reachable from the tool's description per ADR-005.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final wiring + Constitution gates + verification scenarios + version bump. None of these add new behaviour; all verify the implementation meets the spec / Constitution / quickstart.

- [ ] T024 Update [src/server.ts](../../src/server.ts) to construct the lazy `vaultRegistry` instance + thread it into the `createWriteNoteTool` factory call. Per data-model.md *Server-level wiring* section: import `createVaultRegistry` from `./vault-registry/registry.js`; build `vaultRegistry` with `invokeProbe: () => invokeCli({ command: "vaults", parameters: {}, flags: ["verbose"], target_mode: "specific" }, ...).then(r => r.stdout)`; pass `{ logger, queue, vaultRegistry }` to `createWriteNoteTool` (was `{ logger, queue }`). The `tools` array entry's alphabetical position is unchanged (`createWriteNoteTool` still last).

- [ ] T025 Verify [src/tools/_register.test.ts](../../src/tools/_register.test.ts) drift detector auto-covers `write_note` via the `it.each` registry walk. Expectation: zero edits needed. Run `vitest run src/tools/_register.test.ts` to confirm green.

- [ ] T026 [P] Verify Constitution V attribution headers on every NEW file: [src/vault-registry/registry.ts](../../src/vault-registry/registry.ts), [src/path-safety/schema.ts](../../src/path-safety/schema.ts), [src/path-safety/canonical.ts](../../src/path-safety/canonical.ts), [src/tools/write_note/schema.ts](../../src/tools/write_note/schema.ts), [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts), [src/tools/write_note/index.ts](../../src/tools/write_note/index.ts). Each header MUST be exactly `// Original — no upstream. <one-line description>.` plus an ADR-009 citation comment per FR-027.

- [ ] T027 [P] Run `npm run lint` (Constitution Development Workflow gate 1). Must pass with zero warnings.

- [ ] T028 [P] Run `npm run typecheck` (Constitution Development Workflow gate 2). Must pass.

- [ ] T029 [P] Run `npm run build` (Constitution Development Workflow gate 3). Must succeed.

- [ ] T030 [P] Run `vitest run` with coverage (Constitution Development Workflow gate 4 + 5). Must pass; aggregate statements coverage must meet the threshold in `vitest.config.ts`.

- [ ] T031 Run all CI-gated S-scenarios from [quickstart.md](quickstart.md) (S-1 through S-19). Verify every scenario passes; specifically verify SC-007's spawn-arg-length invariant across content sizes 100B / 5KB / 100KB. **Known SC coverage gap (Analyze M2)**: SC-008 (mid-write SIGTERM atomicity) has NO CI-gated test — the S-suite does not exercise process-kill scenarios. T002 (g) decided to skip a deterministic vitest test as unreliable in vitest. The SC-008 gate is the manual M-4 scenario in T032, not the CI-gated S-suite here. Document this explicitly in the S-suite run report so reviewers don't expect SC-008 coverage from the CI gate.

- [ ] T032 Run manual M-scenarios from [quickstart.md](quickstart.md) (M-1 through M-5) against `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Validates SC-001 (no host crash dialog at any size up to 100 KB through MCP Inspector or Claude Desktop), SC-006 freshness (write→read), SC-008 atomicity (mid-write SIGTERM), and SC-007 self-discovery (agent constructs valid invocation from help alone). Clean up all M-scenario fixtures from the vault Sandbox after completion per the test-execution-instructions cleanup rule.

- [ ] T033 Bump `package.json` version `0.2.7 → 0.2.8`. Update `CHANGELOG.md` to disclose the `write_note` v0.2.8 design pivot per the project's release-notes convention. Disclose: (a) the legacy `write_note` was wholesale-replaced via direct-fs-write per ADR-009; (b) the `template` parameter is no longer accepted (migration: `obsidian_exec`); (c) collision behaviour is now structured `FILE_EXISTS`, no longer silent rename; (d) the `vault=` parameter now resolves correctly for the new `write_note` (R11 limitation lifted for this tool); (e) three new error codes added to the project roster; (f) cite the upstream forum bug `forum.obsidian.md/.../114119` and ADR-009.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: T001 has no dependencies; runs immediately.
- **Phase 2 (Foundational)**: T002 starts after T001. **T002a (Logger extension per Analyze C1) starts after T002 — independent of T003-T010 since `src/logger.ts` is file-disjoint from the new modules.** T003-T010 form four module-pairs (vault-registry, path-safety/schema, path-safety/canonical, write_note/schema). Within each pair: test first then impl. Across pairs: parallelizable on different files. **T010 depends on T006** (write_note schema imports `isStructurallySafePath`). **T015/T016 depend on T002a** (US4 handler tests + impl call the new `logger.pathEscapeAttempt` typed method).
- **Phases 3-8 (User stories)**: ALL depend on Phase 2 completion. **Within Phases 3-7, every implementation task touches `src/tools/write_note/handler.ts`**, so they run sequentially through that file. Tests for each story extend the same `handler.test.ts` file (also sequential). Phase 8 (US5) touches `index.ts` + `docs/tools/write_note.md` — independent of the handler-modifying phases.
- **Phase 9 (Polish)**: depends on all user-story phases being complete. T024 (server.ts wiring) is the integration glue; T025-T032 are verification.

### User Story Dependencies

- **US1 (P1, MVP)**: depends on Phase 2. No other story dependencies. Delivers the core reliable-write capability.
- **US2 (P1)**: depends on Phase 2 + US1 (T012 establishes the handler skeleton; T014 adds the overwrite=false branch to it).
- **US4 (P1)**: depends on Phase 2 + US1 (T012 establishes the handler skeleton; T016 wires path-safety + fs-error mapping into it). May start in parallel with US2 by a different developer, but both touch handler.ts so coordinate sequentially.
- **US3 (P2)**: depends on Phase 2 + US1+US2+US4 (the active-mode branch in T018 sits alongside the specific-mode branch from T012, and reuses the common write path established by T014/T016).
- **US6 (P2)**: depends on Phase 2 + US1+US2+US4 (T020 adds the open-branch to handler.ts after the main write path is established).
- **US5 (P3)**: independent of all handler work — touches only `index.ts`, `index.test.ts`, `docs/tools/write_note.md`. Can start after Phase 2 in parallel with US1-US4-US6 if desired (T021-T023 are file-disjoint from T011-T020).

### Within Each User Story

- Tests authored before implementation per Constitution Principle II + TDD discipline. Run tests, expect failures, then implement to flip them green.
- Models / schemas before services / handlers (covered by Phase 2 — schema is foundational).
- Story complete before moving to next priority (unless parallelizing with disjoint files per US5).

### Parallel Opportunities

- Phase 2 module pairs (T003+T004, T005+T006, T007+T008, T009+T010) — different files; can run in parallel by different developers; T010 must wait for T006.
- All [P]-marked tests within a phase are author-parallelizable.
- US5 (Phase 8) is file-disjoint from US1-US4-US6 (Phases 3-7) — can run fully in parallel.
- Polish gates T026-T030 are CI-side, independent of each other; all run in parallel as separate npm scripts.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Module pairs can run in parallel by different developers:
Developer A: T003 (registry.test.ts) → T004 (registry.ts)
Developer B: T005 (path-safety/schema.test.ts) → T006 (path-safety/schema.ts)
Developer C: T007 (canonical.test.ts) → T008 (canonical.ts)
Developer D: T002a (extend src/logger.ts + src/logger.test.ts per Analyze C1)

# Once T006 is complete, the write_note schema pair can start:
Developer E (or whoever is free): T009 (write_note/schema.test.ts) → T010 (write_note/schema.ts)

# Sync points:
#   - T004, T008, T010 must complete before any user story starts.
#   - T002a must complete before T015 / T016 (US4 handler tests + impl) start.
#   - All other user-story tasks are independent of T002a.
```

## Parallel Example: Phase 8 (US5) alongside Phase 3-7

```bash
# US5 is file-disjoint from US1-US4-US6:
Developer E: T021 (index.test.ts) → T022 (index.ts) → T023 (write_note.md doc)

# Runs in parallel with the handler-touching work:
Developer F: T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 (sequential through handler.ts)
```

## Parallel Example: Phase 9 (Polish) gate suite

```bash
# Once T024 (server.ts wiring) is complete, all gates run in parallel:
Terminal 1: npm run lint                       # T027
Terminal 2: npm run typecheck                  # T028
Terminal 3: npm run build                      # T029
Terminal 4: vitest run --coverage              # T030
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (T001).
2. Complete Phase 2 (T002, T002a, T003-T010) — T0 + Logger extension per Analyze C1 + foundational modules + write_note schema.
3. Complete Phase 3 (T011-T012) — US1 specific-mode happy path.
4. **STOP and VALIDATE**: Run S-1 (size happy path), S-2 (trigger chars), S-6 (argv-length invariant), S-11 (vault-registry lazy probe), S-14 (auto-mkdir parents) from quickstart.md. Verify the four BI-038 sizes (60B/5KB/12KB/100KB) succeed without crash.
5. Optional: deploy a pre-release build for early demo. The MVP is "you can write notes without crashing Obsidian" — the dominant user value.

### Incremental Delivery

1. Setup + Foundational + US1 → MVP (above).
2. Add US2 (T013-T014) → run S-3 → safer collision behaviour shipped.
3. Add US4 (T015-T016) → run S-4 → security gate shipped.
4. Add US3 (T017-T018) → run S-7, S-8 → active mode shipped.
5. Add US6 (T019-T020) → run S-9, S-15 → migration parity + open flag shipped.
6. Add US5 (T021-T023) → run S-10, S-19 → discoverability shipped.
7. Polish (T024-T033) → all gates green; manual M-scenarios pass; version bumped; CHANGELOG updated → ready to ship.

Each step adds value without breaking previous steps. Commit after each task or each logical group per CONTRIBUTING.md scope-honesty.

### Parallel Team Strategy

With 2-3 developers:

1. Pair up on Phase 2 module pairs (Developer A: vault-registry; Developer B: path-safety modules; Developer C: write_note schema once T006 lands).
2. Once Phase 2 is done, divide:
   - Developer A: handler-modifying work — Phases 3 → 4 → 5 → 6 → 7 sequentially (US1 → US2 → US4 → US3 → US6).
   - Developer B: US5 (Phase 8) in parallel — purely doc + index work.
3. Reconverge for Phase 9 polish + gate suite.

---

## Notes

- `[P]` tasks operate on different files with no incomplete dependencies — parallelizable.
- `[Story]` label maps to `spec.md` user stories US1..US6 for traceability.
- The legacy `src/tools/write_note/{schema,handler,index,schema.test,handler.test,index.test}.ts` files are wholesale-replaced (FR-028) by the corresponding tasks (T009-T012, T014, T016, T018, T020, T021-T022). Same paths; new content. No separate "delete legacy" task — the implementations are the replacements.
- `data-model.md` test-inventory case numbers (#1..#30 for handler.test.ts) are referenced from each story's test task; the case numbers are the canonical source.
- Constitution Principle II is enforced via the per-task TEST-then-IMPL ordering. Tests authored, then run (red), then implementation flips them green. The `_register.test.ts` drift detector (T025) is an existing safety net.
- T002 records its small-decision outcomes (extended-char regex, orphan tmp cleanup, concurrency-test skip, mid-write SIGTERM scope) as comments in the relevant test files so future readers see the decision in context.
- Manual M-scenarios (T032) are explicitly post-merge / pre-release validation, not CI-gated. The CI-gated S-scenarios (T031) are the merge-gate.
- Avoid: introducing new dependencies (none planned per Technical Context); touching the cli-adapter / target-mode primitives (both should be byte-stable per FR-023 / FR-025); adding new error codes beyond the three documented in FR-020.
