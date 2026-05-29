---

description: "Task list for open_file (BI-057) — dependency-ordered, organised by user story."
---

# Tasks: Open Vault File

**Input**: Design documents from `/specs/057-open-vault-file/` — [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓.

**Tests**: Co-located `*.test.ts` unit tests are MANDATORY per Constitution Principle II (every MCP tool ships with happy-path + failure-or-boundary tests in the same change that adds it) — NOT optional. The repo's test scope is vitest unit tests only; manual/integration scenarios live in the user's external tracker, not scaffolded here. The five T0 live-CLI probes ([research.md §R7](research.md)) run at `/speckit-implement` time per CLAUDE.md `## Test Execution` against the authorised test vault per `.memory/test-execution-instructions.md` (T020).

**Organisation**: Setup + Foundational (Phase 1 + 2) build the shared Zod schema and the frozen open-eval template that every story consumes. User stories then layer the handler incrementally — US1 ships the happy-path MVP (open a markdown file by `path`/`file`, the focused-vault guard, registration); US2 layers the any-type coverage + the `UNSUPPORTED_FILE_TYPE` diagnostic; US3 adds the new-tab / focus-existing coverage; US4 adds the full typed-failure taxonomy coverage. US1 + US2 share the P1 tier; US3 + US4 share P2.

**Pipeline (from [plan.md](plan.md) / [research.md](research.md))**: `open_file` is **eval-composed** — one `invokeCli` `eval` round-trip per call; NO filesystem syscalls; NO native `obsidian open` subcommand (ADR-010 N/A → descriptive tool name `open_file`). The single composed eval folds the focused-vault guard + locator resolution + type-check + `openLinkText` and returns a discriminated `{ stage }` result (R2). Zero new top-level error codes; reuse `VAULT_NOT_FOUND{unknown,not-open}` + `FILE_NOT_FOUND`; one new single-state `details.code` `UNSUPPORTED_FILE_TYPE` (R3). No `target_mode` discriminator — specific-only, `vault` always required (R4 / ADR-003 intent satisfied by the guard).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel — different files, no dependencies on incomplete tasks.
- **[Story]**: User story this task belongs to (US1, US2, US3, US4).
- File paths repo-rooted.

## Path Conventions

Single-project layout under `src/`. Test files co-located alongside source per Principle II — `src/tools/open_file/handler.ts` ↔ `src/tools/open_file/handler.test.ts`. The module ships FOUR production files (`index.ts`, `schema.ts`, `handler.ts`, `eval-template.ts`) + four co-located test files per [plan.md §Project Structure](plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new per-surface module directory and the docs placeholder.

- [ ] T001 Create the new tool module directory at [src/tools/open_file/](src/tools/open_file/) and seed each file with an `// Original — no upstream.` one-line header per Constitution Principle V. Files as header-only stubs: `schema.ts`, `handler.ts`, `eval-template.ts`, `index.ts`; co-located test stubs `schema.test.ts`, `handler.test.ts`, `eval-template.test.ts`, `index.test.ts`. The `handler.ts` / `eval-template.ts` headers note the eval-composition layer + the `write_note` open-eval lineage (ADR-009).
- [ ] T002 [P] Create the docs placeholder at [docs/tools/open_file.md](docs/tools/open_file.md) — header-only stub filled in during Polish per ADR-005 progressive disclosure.

**Checkpoint**: Module directory exists; every file carries its attribution header. No production logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the Zod schema and the frozen open-eval template that every story consumes. Schema is the single source of truth for the published MCP `inputSchema` AND the runtime parse per Principle III.

**⚠️ CRITICAL**: No user story task can begin until this phase is complete. Foundational covers FR-001 / FR-004 / FR-005 / FR-013 / FR-015 at the schema layer and the R2 eval mechanism.

- [ ] T003 [P] Implement the input + output Zod schemas in [src/tools/open_file/schema.ts](src/tools/open_file/schema.ts) per [data-model.md §Input](data-model.md) and [contracts/input.schema.json](contracts/input.schema.json). **Input schema**: a flat `.strict() z.object` — `vault: z.string().min(1).max(1000)` (REQUIRED — no `target_mode` discriminator per R4 / plan ADR-003 row; this tool is unconditionally specific); `path` and `file` optional refined string fields each `≤ 1000`. `file` composes `isStructurallySafePath` from [src/path-safety/schema.ts](src/path-safety/schema.ts) AND a per-tool bracket-rejection refinement (reject when `value.includes("[[")` or `value.includes("]]")`, message "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare name (e.g. `My Note` not `[[My Note]]`)") — byte-stable with [src/tools/append_note/schema.ts](src/tools/append_note/schema.ts)'s `safeFileField` pattern. `path` composes only `isStructurallySafePath`. `new_tab: z.boolean().optional().default(false)` per FR-008. A `.superRefine` enforces exactly-one-of `path`/`file` (both → issues at `["path"]` and `["file"]`; neither → issue at `[]`) per FR-005. Export `z.infer<typeof openFileInputSchema>` as `OpenFileInput`. **Output schema**: `.strict() z.object` with `opened: z.string()`, `vault: z.string()`, `new_tab: z.boolean()` per [contracts/output.schema.json](contracts/output.schema.json). Export `OpenFileOutput`. NO parallel TypeScript interfaces (Principle III).
- [ ] T004 Implement the schema-cohort tests in [src/tools/open_file/schema.test.ts](src/tools/open_file/schema.test.ts). Cases: **happy paths** — `{ vault, path }`; `{ vault, file }`; `{ vault, path, new_tab: true }`; `new_tab` omitted → default `false` applied; `new_tab: false` explicit. **Exactly-one-of (FR-005)** — both `path` AND `file` → issues at `["path"]` + `["file"]`; neither → issue at `[]`. **vault required** — missing `vault` → issue at `["vault"]`. **Bracket rejection (FR-004)** — `file: "[[My Note]]"` → custom issue at `["file"]` with the bracket message; `file: "[Note"` (single bracket) → ACCEPTED; `file: "Folder/[[x]]"` → REJECTED. **Structural-path-safety (FR-013)** — `path: "../outside.md"` / `path: "/abs.md"` / `path: "C:\\x.md"` / control-char path → issue at `["path"]`; same refinements on `file`. **Unknown-extra-field (FR-015)** — `{ vault, path, force: true }` → `unrecognized_keys`. **new_tab type** — `new_tab: "true"` → `invalid_type` at `["new_tab"]`. **No `target_mode` field** — assert the schema does NOT accept/produce a `target_mode` key (a supplied `target_mode` is an unknown field → `unrecognized_keys`), documenting the deliberate R4 deviation. **Output schema** — accepts `{ opened: "a.md", vault: "Work", new_tab: false }`; rejects unknown keys; rejects missing `opened`. Depends on T003.
- [ ] T005 [P] Implement `composeOpenEval(expectedBase: string, locator: { kind: "path" | "name"; value: string }, newTab: boolean): string` in [src/tools/open_file/eval-template.ts](src/tools/open_file/eval-template.ts) per [research.md §R2](research.md) + [data-model.md §OpenEvalResult](data-model.md). Returns a frozen, byte-stable IIFE eval string (JSON-encoding `expectedBase` / `locator.value` / `newTab` as literals — argv-assertion target, parity with `backlinks`' `composeEvalCode`). Eval body in order: (1) normalise + compare `app.vault.adapter.basePath` to `expectedBase` (separator + Windows-case normalisation per R5) → on mismatch `return JSON.stringify({stage:"vault-not-focused"})`; (2) resolve the target file — for `kind:"path"` use `app.vault.getAbstractFileByPath(value)`, for `kind:"name"` use `app.metadataCache.getFirstLinkpathDest(value, "")` — when null or not a `TFile` (folder) `return {stage:"file-not-found"}`; (3) extension-registered check via `app.viewRegistry` (method confirmed at T0 — candidate `isExtensionRegistered(ext)`) → unregistered `return {stage:"unsupported-type", extension: f.extension}`; (4) `await app.workspace.openLinkText(f.path, "", newTab)` → `return {stage:"ok", opened: f.path, newTab}`. Also export the `OpenEvalResult` discriminated type. Document the T0-pending bits (viewRegistry method name, openLinkText-vs-getLeaf().openFile dedup, getFirstLinkpathDest name resolution) with inline `// T0:` markers per R7.
- [ ] T006 Implement the eval-template tests in [src/tools/open_file/eval-template.test.ts](src/tools/open_file/eval-template.test.ts) — byte-stability frozen-string assertions of `composeOpenEval` output for representative args ({kind:"path"} × newTab true/false; {kind:"name"}); assert `expectedBase`, `locator.value`, and `newTab` are JSON-encoded into the string (injection-safe) and that the four `stage` literals appear. Depends on T005.

**Checkpoint**: Schema ships full input-validation cohort coverage; the frozen open-eval template is byte-asserted. `handler.ts` + `index.ts` are still header-only stubs. `vitest run` passes for the two new test files.

---

## Phase 3: User Story 1 - Surface an existing vault file as the focused, active file (Priority: P1) 🎯 MVP

**Goal**: Ship the happy-path MVP. Caller invokes `open_file` with `vault` + exactly one of `path`/`file`; the handler resolves the requested vault's base path (`resolveVaultPath`), composes + invokes the single guard+resolve+open eval, classifies the discriminated result, and returns `{ opened, vault, new_tab }`. The opened file becomes the focused, active file (FR-006/FR-007). Includes the focused-vault guard (FR-011/FR-012 — `VAULT_NOT_FOUND` `unknown`/`not-open`) and the boot-spine registration so the tool is callable from MCP clients.

**Independent Test**: Run [quickstart.md](quickstart.md) "open a markdown note by path" + "open by bare name" against the authorised test vault (target vault focused). Verify the named file becomes the focused, visible file; the response is `{ opened: <resolved vault-relative path>, vault, new_tab: false }`; and a subsequent active-mode tool call operates on the just-opened file (FR-007). Verify a request for a vault that is not the focused vault returns `VAULT_NOT_FOUND` / `not-open` and opens nothing.

### Implementation for User Story 1

- [ ] T007 [US1] Implement the `ExecuteDeps` shape + handler skeleton in [src/tools/open_file/handler.ts](src/tools/open_file/handler.ts). Deps: `{ logger: Logger, queue: Queue, vaultRegistry: VaultRegistry, spawnFn?: SpawnLike, env?: NodeJS.ProcessEnv }` (cohort-uniform with the eval-composed handlers — NO `fs` deps; the wrapper performs no filesystem syscalls per plan Technical Context). Export `executeOpenFile(input: OpenFileInput, deps: ExecuteDeps): Promise<OpenFileOutput>`; body is a stub throwing "not implemented" (populated by T008–T009). Imports: types + schemas from `./schema.js`; `composeOpenEval` + `OpenEvalResult` from `./eval-template.js`; `UpstreamError` from `../../errors.js`; `invokeCli` + `SpawnLike` from `../../cli-adapter/cli-adapter.js`; `parseEvalStdout` + `remapVaultNotFound` + `resolveVaultDisplayName` from `../_active-file.js`; types from `../../logger.js` + `../../queue.js` + `../../vault-registry/registry.js`.
- [ ] T008 [US1] Implement vault resolution + the unknown guard (stage 1 of the FR-012a order) in handler.ts. `let expectedBase; try { expectedBase = await deps.vaultRegistry.resolveVaultPath(input.vault); } catch (e) { remapVaultNotFound(e, input.vault, "open_file"); }` — the existing `remapVaultNotFound` maps the registry's `VALIDATION_ERROR` to `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"` (cohort parity, [src/tools/_active-file.ts](src/tools/_active-file.ts)). Build the locator: `const locator = input.path !== undefined ? { kind: "path", value: input.path } : { kind: "name", value: input.file };`. Depends on T007.
- [ ] T009 [US1] Implement the single open-eval invocation + discriminated-result classification (stages 2–4 of the FR-012a order) in handler.ts per [data-model.md](data-model.md) + [contracts/errors.md](contracts/errors.md). Build `code = composeOpenEval(expectedBase, locator, input.new_tab ?? false)`; `const res = await invokeCli({ command: "eval", parameters: { code }, flags: [], target_mode: "active" }, { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })` (an `invokeCli` throw — Obsidian not running / binary missing — propagates unchanged as the cohort's `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR`, never a silent success). Parse via `parseEvalStdout(res.stdout)` (strips `=> `); on parse/shape failure throw `UpstreamError` `code: "INTERNAL_ERROR"` + `details.stage: "eval-parse"` + `details.cause`. Classify the `OpenEvalResult.stage`: `vault-not-focused` → `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "not-open"` + `details.vault`; `file-not-found` → `CLI_REPORTED_ERROR` + `details.code: "FILE_NOT_FOUND"` + `details.path: locator.value` + `details.vault`; `unsupported-type` → `CLI_REPORTED_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"` + `details.extension` + `details.path` + `details.vault`; `ok` → return `{ opened: res.opened, vault: input.vault, new_tab: input.new_tab ?? false }` validated via `openFileOutputSchema.parse(...)`. Depends on T007, T008, T005.
- [ ] T010 [US1] Implement the US1 handler unit cohort in [src/tools/open_file/handler.test.ts](src/tools/open_file/handler.test.ts) with mocked `invokeCli` + `vaultRegistry.resolveVaultPath` (cohort parity with [src/tools/backlinks/handler.test.ts](src/tools/backlinks/handler.test.ts)). Cases: **happy path by `path`** — mock `resolveVaultPath` → a base; mock `invokeCli` → `{ stdout: '=> {"stage":"ok","opened":"Projects/Roadmap.md","newTab":false}' }` → envelope `{ opened: "Projects/Roadmap.md", vault, new_tab: false }`; assert the composed eval `code` argv embeds the expected base + `{kind:"path"}` + `false`. **happy path by `file`** — input `{ vault, file: "Roadmap" }`; eval returns `stage:"ok"` with `opened:"Projects/Roadmap.md"` (canonical, FR-003); assert the eval argv embeds `{kind:"name"}`. **new_tab passthrough** — `new_tab: true` → eval argv embeds `true`; envelope `new_tab: true`. **VAULT_NOT_FOUND / not-open** — eval returns `{stage:"vault-not-focused"}` → `CLI_REPORTED_ERROR` + `details.code:"VAULT_NOT_FOUND"` + `details.reason:"not-open"` + `details.vault`; assert no success envelope. **VAULT_NOT_FOUND / unknown** — `resolveVaultPath` throws `VALIDATION_ERROR` → `CLI_REPORTED_ERROR` + `details.code:"VAULT_NOT_FOUND"` + `details.reason:"unknown"`; assert NO `invokeCli` eval call follows (guard fires before the eval). **Obsidian-not-running** — `invokeCli` throws an `UpstreamError` (`CLI_BINARY_NOT_FOUND`) → propagates unchanged; assert no fabricated success. **Determinism (SC-006)** — two identical calls produce byte-equal eval argv + structurally-identical envelopes. Depends on T007–T009.
- [ ] T011 [US1] Implement the factory + descriptor in [src/tools/open_file/index.ts](src/tools/open_file/index.ts). Export `createOpenFileTool(deps: RegisterDeps): RegisteredTool` (parity with [src/tools/backlinks/index.ts](src/tools/backlinks/index.ts)); `RegisterDeps = ExecuteDeps`; use `registerTool` from `../_register.js`. Export `OPEN_FILE_TOOL_NAME = "open_file"` (descriptive — ADR-010 N/A, no upstream subcommand; assert in T012 so the naming choice reads as designed). Export `OPEN_FILE_DESCRIPTION`: when to reach for it (surface any recognised vault file as the focused, active file — markdown, canvas, PDF, image, attachment), the **focused-vault precondition** (the open lands in Obsidian's focused vault — upstream B1 — so the requested vault MUST be the focused one; otherwise `VAULT_NOT_FOUND`/`not-open`), both locator shapes (`path` + bare `file`, brackets rejected per FR-004), the `new_tab` opt-in semantics (FR-008 — literal new tab vs focus-existing-no-duplicate), the any-type contract (FR-009), the success echo (`{ opened, vault, new_tab }`, FR-016), the typed error roster (`VAULT_NOT_FOUND{unknown,not-open}`, `FILE_NOT_FOUND`, `UNSUPPORTED_FILE_TYPE`, `VALIDATION_ERROR`), the out-of-scope boundaries (no external paths, no tab management beyond opening, no vault switch, no content edit, no heading/block scroll — FR-018–FR-021), and a pointer to `help({ tool_name: "open_file" })`. Depends on T003, T007.
- [ ] T012 [US1] Implement the registration tests in [src/tools/open_file/index.test.ts](src/tools/open_file/index.test.ts). Cases: descriptor shape matches convention (parity with [src/tools/backlinks/index.test.ts](src/tools/backlinks/index.test.ts)); tool name is exactly `"open_file"`; the published `inputSchema` (via `registerTool`'s `zodToJsonSchema`) matches [contracts/input.schema.json](contracts/input.schema.json) structurally (required `vault`, `oneOf` path/file, `additionalProperties:false`, `new_tab` default, NO `target_mode`); factory wires the handler with supplied deps. Depends on T011.
- [ ] T013 [US1] Wire `createOpenFileTool` into the boot spine at [src/server.ts](src/server.ts) — add the import in alphabetical order (`open_file` sorts among the existing tool imports) and the factory call in the registration list (cohort convention). Boot-spine owns `createLogger()` / `createQueue()` per Principle I; the handler receives them injected and MUST NOT construct them. Depends on T011.
- [ ] T014 [US1] Append the `open_file` entry to [src/tools/_register-baseline.json](src/tools/_register-baseline.json) (tool name + published `inputSchema`); update the entry count; verify [src/tools/_register-baseline.test.ts](src/tools/_register-baseline.test.ts) passes. Depends on T013.

**Checkpoint**: US1 ships the MVP — open a markdown file by `path`/`file`, becomes the focused active file, focused-vault guard live, tool reachable via MCP. `npm run lint && npm run typecheck && npm run build && vitest run` all pass. Any-type coverage (US2), new-tab coverage (US3), and the full failure taxonomy (US4) are pending — those error stages are already classified by T009, but their dedicated cohort tests land in their phases.

---

## Phase 4: User Story 2 - Open any vault-supported file type, not markdown only (Priority: P1)

**Goal**: Prove type-generality + the `UNSUPPORTED_FILE_TYPE` diagnostic. The eval mechanism (T005/T009) already opens any type via `openLinkText` and checks `viewRegistry`; this story adds the dedicated test coverage across types and the unsupported-type branch.

**Independent Test**: Run [quickstart.md](quickstart.md) "open a non-markdown file by path" (canvas, PDF, image) + the unsupported-type example against the authorised test vault. Verify each recognised type opens via its native viewer with the identical success shape; verify an unrenderable extension returns `UNSUPPORTED_FILE_TYPE` (distinct from `FILE_NOT_FOUND`) and opens nothing.

### Implementation for User Story 2

- [ ] T015 [US2] Extend [src/tools/open_file/handler.test.ts](src/tools/open_file/handler.test.ts) with the US2 type cohort. Cases: **any-type happy paths** — eval returns `stage:"ok"` with `opened` of `.canvas`, `.pdf`, `.png` files (by `path` and by `file`) → identical `{ opened, vault, new_tab }` envelope shape across all types (FR-009; assert no type-specific branching in the output). **UNSUPPORTED_FILE_TYPE** — eval returns `{stage:"unsupported-type", extension:"sqlite"}` → `CLI_REPORTED_ERROR` + `details.code:"UNSUPPORTED_FILE_TYPE"` + `details.extension:"sqlite"` + `details.path` + `details.vault`. **Distinguishable from FILE_NOT_FOUND** — assert the unsupported-type envelope's `details.code` differs from the file-not-found envelope's `details.code` (the file exists; only its type is unrenderable) — exercises the FR-009 "distinguish type-not-supported from file-not-found" contract. Depends on T009, T010.

**Checkpoint**: US2 ships the any-type + unsupported-type test surface. Quickstart non-markdown examples pass. The headline "not markdown notes only" contract is covered.

---

## Phase 5: User Story 3 - Open in a new tab, or focus the existing tab without duplicating (Priority: P2)

**Goal**: Dedicated coverage for the `new_tab` opt-in and the reuse-existing-tab default. The handler already passes `new_tab` into the composed eval (T005/T009); this story asserts the placement semantics.

**Independent Test**: Run [quickstart.md](quickstart.md) "open in a new tab" against the authorised test vault — verify `new_tab: true` opens a fresh tab and leaves the prior focused file open; `new_tab: false` (default) focuses an existing tab for an already-open file with no duplicate. (Workspace-state effects are verified live at T0; the unit cohort asserts the eval argv carries the correct `newLeaf` value.)

### Implementation for User Story 3

- [ ] T016 [US3] Extend [src/tools/open_file/handler.test.ts](src/tools/open_file/handler.test.ts) with the US3 new-tab cohort. Cases: **new_tab passthrough** — `new_tab: true` → assert the composed eval `code` argv embeds `newTab=true` (the third `openLinkText` arg / `newLeaf`); `new_tab: false` and `new_tab` omitted → embeds `false`. **envelope echo** — every case echoes the effective `new_tab` in the output. **dedup vs literal-new-tab semantics (FR-008)** — document via the eval argv that `false` relies on `openLinkText`'s native existing-leaf dedup (no duplicate) and `true` forces a fresh leaf even when already open; the byte-level workspace effect is verified at T0 (R7.2). Depends on T009, T010.

**Checkpoint**: US3 ships the new-tab / focus-existing test surface. Quickstart new-tab example passes once T0 confirms `openLinkText` dedup behaviour.

---

## Phase 6: User Story 4 - Distinguish every failure mode through typed errors, never a silent no-op (Priority: P2)

**Goal**: Full typed-failure taxonomy with dedicated coverage so the caller can switch on the envelope, and the stage order (FR-012a / ADR-014) is asserted. Most throw sites already exist (schema layer T003; guard + classification T008/T009); this story exercises each with edge cases and asserts no failure fabricates success or mutates workspace focus (FR-017).

**Independent Test**: Run [quickstart.md](quickstart.md) failure-mode examples (vault not focused, vault unregistered, file not found, unsupported type, mutually-exclusive locators, bracketed name, out-of-vault path, unknown field) against the authorised test vault. Verify each error envelope's top-level `code` (+ `details.code` / `details.reason`) matches [contracts/errors.md](contracts/errors.md) exactly and nothing is opened.

### Implementation for User Story 4

- [ ] T017 [US4] Extend [src/tools/open_file/handler.test.ts](src/tools/open_file/handler.test.ts) with the US4 failure-taxonomy cohort. Cases: **stage order (FR-012a)** — when `resolveVaultPath` throws → `VAULT_NOT_FOUND/unknown` and NO eval call (assert order: unknown precedes any eval-stage error); eval `vault-not-focused` → `not-open`; eval `file-not-found` → `FILE_NOT_FOUND`; assert a registry-miss never reaches the file-not-found path. **folder target** → eval `file-not-found` (a folder is not a `TFile`). **Obsidian-not-running** — `invokeCli` throws → propagates as the cohort `CLI_*`, asserted distinct from the typed vault/file errors, never a success. **malformed eval result** — `invokeCli` returns un-parseable / wrong-shape stdout → `INTERNAL_ERROR` + `details.stage:"eval-parse"`. **schema-layer rejections via the registerTool boundary** (parity with the cohort's boundary-test pattern) — both `path`+`file` → `VALIDATION_ERROR` (mutual-exclusion); neither → `VALIDATION_ERROR` (missing-locator); `file:"[[x]]"` → `VALIDATION_ERROR` at `["file"]`; `path:"../x.md"` → `VALIDATION_ERROR` (structural-path-safety); unknown field → `unrecognized_keys`; assert NO `invokeCli` call occurs for any schema-layer rejection (fails before the eval). **focus-unchanged invariant** — for every failure case, assert the handler issues no success envelope (the "nothing opened, focus unchanged" contract — FR-017 — is represented by the absence of an `ok` return). Depends on T003, T009, T010.

**Checkpoint**: US4 ships the full typed-failure taxonomy coverage. Every error envelope in [contracts/errors.md](contracts/errors.md) is asserted; the stage order holds; no failure fabricates success.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Progressive-disclosure docs, README inventory, the deferred T0 live-CLI probes, and the quality-gate final pass.

- [ ] T018 [P] Write the progressive-disclosure help in [docs/tools/open_file.md](docs/tools/open_file.md) per ADR-005 — worked examples (open by path/file × type; new_tab; each failure mode, mirroring [quickstart.md](quickstart.md)), the focused-vault precondition (B1) + remediation, the full error roster with recovery hints, and the out-of-scope boundaries (FR-018–FR-021).
- [ ] T019 [P] Update the README tool inventory / count and (if any new upstream code were lifted — none here) the Attributions section. `open_file` is eval-composed over Obsidian core API via the existing `invokeCli` substrate; no new attribution entry required — confirm and note.
- [ ] T020 **DEFERRED to a manual operator run during PR review** — requires an interactive session with Obsidian running and the authorised test vault focused (and, for one probe, a file of an unregistered extension). Not executable from an autonomous `/speckit-implement` run. Run the five T0 probes from [research.md §R7](research.md) per `.memory/test-execution-instructions.md`, then reconcile the `// T0:` placeholders in `eval-template.ts`/`handler.ts`:
  1. **viewRegistry unsupported-type signal** — confirm the method (candidate `isExtensionRegistered`/`getTypeByExtension`) + returns for {`md`,`canvas`,`pdf`,`png`} vs an unknown extension.
  2. **openLinkText vs getLeaf().openFile dedup** — confirm `openLinkText(path,"",false)` focuses an existing leaf (no duplicate) and `(…,true)` always opens a fresh leaf; confirm the pre-existence check suppresses create-on-missing. Fall back to `getLeaf(newTab).openFile(tfile)` + manual existing-leaf reveal for `false` if needed.
  3. **basePath normalisation** — confirm `app.vault.adapter.basePath` vs `resolveVaultPath` shape on Windows; settle string-normalise vs realpath.
  4. **Obsidian-not-running classification** — confirm which `invokeCli` failure surfaces and that the handler maps it loud (`CLI_*`), never silent.
  5. **eval-result envelope + name resolution** — confirm `parseEvalStdout` round-trips the discriminated `{ stage }` object and that `getFirstLinkpathDest(name,"")` resolves bare names (incl. attachments).
- [ ] T021 Quality-gate final pass — reconcile any T020 placeholders, then run `npm run lint && npm run typecheck && npm run build && vitest run`; all green. Run `/graphify --update` and verify the post-implement structural checks (no new top-level error code; `executeOpenFile` lands in community 2; handler does not import `createLogger`/`createQueue`; no orphaned production file) per [plan.md §Graphify structural check](plan.md). Depends on all prior phases (T020 may surface adjustments to T005/T009 before the gate passes).

**Checkpoint**: BI-057 ships. Every FR from spec.md is covered by at least one task; every error envelope in [contracts/errors.md](contracts/errors.md) is tested; every SC is exercised by a test or quickstart example. The PR Constitution Compliance checklist lists Y on Principles I–V + ADR-003 + ADR-015; N/A on ADR-010 + ADR-013 + ADR-014 + ADR-009.

---

## Dependencies

- **US1 (P1)** depends on Setup (T001–T002) + Foundational (T003–T006). MVP shipped at T014.
- **US2 (P1)** depends on US1 (T009 classifies the `unsupported-type`/`ok` stages; US2 adds the type-coverage tests). Independent of US3/US4.
- **US3 (P2)** depends on US1 (T009 passes `new_tab` through; US3 adds the new-tab tests). Independent of US2/US4.
- **US4 (P2)** depends on US1 (T003/T008/T009 throw the failures; US4 adds the taxonomy tests). Independent of US2/US3.
- **Polish (Phase 7)** depends on all prior phases. T020 (T0 probes) blocks T021 (quality gate) because probe outcomes may adjust T005/T009.

Within a story, task IDs are dependency-ordered. [P]-marked tasks in the same phase run in parallel.

## Parallel execution opportunities

- **Phase 1** — T001, T002 independent files → parallel.
- **Phase 2** — T003 (schema) ‖ T005 (eval-template) are different files → parallel; T004 depends on T003; T006 depends on T005.
- **Phase 3 (US1)** — T007→T008→T009 sequential (same file, building the handler); T011 (index.ts descriptor) can be authored in parallel with T010 (handler tests); T012 depends on T011; T013 depends on T011; T014 depends on T013.
- **Phases 4–6 (US2/US3/US4)** — T015, T016, T017 each extend handler.test.ts; mergeable in any order once US1 lands, subject to merge-friendly diff chunking on the shared test file.
- **Phase 7** — T018, T019 independent files → parallel; T020 operator-run; T021 last.

## Implementation strategy

**MVP first**: ship US1 (T001–T014) — the tool opens a vault file by `path`/`file`, makes it the focused active file, guards the focused-vault precondition, and is reachable via MCP. The any-type behaviour already works (the eval opens any type), but US2 adds the dedicated type + unsupported-type coverage; US3 adds new-tab coverage; US4 adds the full failure taxonomy coverage.

**Incremental layering**: US2, US3, US4 each add a distinct test-coverage layer on top of US1; any can land first, in any order, independently mergeable.

**Polish last**: T018–T021 after all stories ship; T020's operator-run probes may surface adjustments to the eval template / classification before the quality gate passes.

## Notes

- **Graphify multi-module rule (CLAUDE.md `/speckit-tasks`)**: this BI introduces a single new source module (`src/tools/open_file/`) plus two one-line touches that follow the established cohort pattern (`src/server.ts` registration, `src/tools/_register-baseline.json` append). All cross-module edges the tasks touch — `executeOpenFile → invokeCli` (cli-adapter), `→ resolveVaultPath` (vault-registry), `→ remapVaultNotFound`/`parseEvalStdout`/`resolveVaultDisplayName` (`_active-file`), `→ UpstreamError` (errors) — are the standard eval-composed-handler edges already verified in the [plan.md §Graphify structural check](plan.md) (community 2, the `executeBacklinks` shape). No novel transitive path between two task-touched symbols exists that the plan did not already capture, so the per-pair `/graphify path` sweep is **N/A** for this single-new-module BI; the post-implement structural verification (T021) is the confirming check.
- [P] tasks = different files, no incomplete-dependency. [Story] label maps task → user story for traceability.
- Tests are MANDATORY (Principle II), unit-only; no integration TC scaffolding.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.

## Constitution Compliance checklist (PR-time)

- [ ] Principle I (Modular Code Organization): Y — per-surface module at `src/tools/open_file/`, one-directional imports (tool → handler → cli-adapter / vault-registry / `_active-file`); one pure helper (`eval-template.ts`).
- [ ] Principle II (Public Surface Test Coverage): Y — four co-located `*.test.ts` files; happy-path + failure-or-boundary coverage across all four user stories.
- [ ] Principle III (Boundary Input Validation with Zod): Y — `openFileInputSchema` is the sole source of truth for `inputSchema` publication + runtime parse; bracket-rejection (FR-004), structural-path-safety (FR-013), exactly-one-of (FR-005) all at the schema layer.
- [ ] Principle IV (Explicit Upstream Error Propagation): Y — all failures route through `UpstreamError`; one new single-state `details.code` (`UNSUPPORTED_FILE_TYPE`); zero new top-level codes (streak preserved); the open eval result is classified, not silently swallowed.
- [ ] Principle V (Attribution & Layered Composition): Y — every file carries `// Original — no upstream.`; the eval-composition layer + `write_note` open-eval lineage (ADR-009) named in headers; no new upstream code lifted.
- [ ] ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand): N/A — no native `obsidian open` subcommand; eval-composed; descriptive name `open_file`.
- [ ] ADR-013 (Plugin-Namespace Tool Naming Convention): N/A — Obsidian core API (`app.workspace`/`app.vault`/`app.viewRegistry`), no plugin.
- [ ] ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern): N/A — no plugin runtime dependency (the FR-012a stage-order discipline is cited as ADR-014 precedent but no plugin states participate).
- [ ] ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes): Y — one new single-state `details.code` (`UNSUPPORTED_FILE_TYPE`); reuses `VAULT_NOT_FOUND`'s existing two-state `unknown`/`not-open` enum (broadened `not-open` semantic, no new member); `FILE_NOT_FOUND` reused single-state.
- [ ] ADR-003 (Enforce Target Mode in Typed Tools): Y (intent satisfied; no `target_mode` discriminator) — single-mode tool; the focused-vault guard forces explicit-vault intent more strictly than the discriminator. Justified deviation per research R4 / plan ADR-003 row; not an N.
- [ ] ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge): N/A — no fs syscalls; reuses ADR-009's vault-registry + bug-safe-small-eval characterisation only.
