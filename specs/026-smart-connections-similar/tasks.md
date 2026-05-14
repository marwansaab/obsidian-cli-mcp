---
description: "Task list for 026-smart-connections-similar — Semantic Similarity for a Single Note"
---

# Tasks: Smart Connections Similar — Semantic Similarity for a Single Note

**Input**: Design documents from [`/specs/026-smart-connections-similar/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT a separate red/green TDD loop; every implementation task lands with its co-located test cases in the same task. Total target: **57 tests** across the new module (20 schema / 32 handler / 5 registration). The verify-fails-first sanity check is captured exactly once, manually, by T016 (parity with BI-023 / BI-024 / BI-025 precedent).

**Organization**: Tasks are grouped by user story per the project convention. The `smart_connections_similar` module is fundamentally a single atomic ship — Stories 1, 2, 3, 4 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 5 is the documentation layer. The `[USx]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md § Test inventory](data-model.md#test-inventory-planned) maps each test case to its source User Story.

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code):

- **R2 — `eval` subcommand load-bearing**: probed live 2026-05-15 (F2). No native similarity subcommand exists; `obsidian help` confirms zero similarity-related subcommands. The wrapper routes through `obsidian vault=<name> eval code=<rendered-js>` to reach the Smart Connections plugin's similarity API at `app.plugins.plugins["smart-connections"].env.smart_sources.items[<key>].find_connections({limit})`. Parity with BI-014 / BI-015 / BI-025 eval cohort; distinct as the first member of a new **eval-driven plugin-backed cohort** routing into a plugin's runtime object rather than Obsidian's core APIs.
- **R3 — Single-call architecture branched at envelope-emission**: ONE `invokeCli` invocation per request. Same eval JS in both modes; the `a.total` branch lives INSIDE the eval at envelope-emission, returning `{ok:true, count, matches:[]}` for count-only or `{ok:true, count, matches:[...]}` for default mode. Cross-mode invariant (FR-006a) holds by construction.
- **R5 — Unknown-vault response inspection ACTIVE for `eval`**: the cli-adapter's existing 011-R5 inspection clause FIRES for unregistered vault — `obsidian vault=NonExistent eval code=…` emits `Vault not found.` and reclassifies to `CLI_REPORTED_ERROR(code: VAULT_NOT_FOUND)`. Re-verified during BI-026 plan-stage probes 2026-05-15.
- **R5a — Closed-but-registered vault detection** (NEW for BI-026): probed live 2026-05-15 after the user closed two vaults (F7 / F8 / F9). The CLI emits **empty stdout + exit 0** for the FIRST eval call against a closed registered vault AND **transparently OPENS the vault** as a side effect; the SECOND call against the now-open vault works normally. The 011-R5 clause does NOT fire (no `Vault not found.` string in empty output). The wrapper's handler implements a **stage-0 detection branch** keyed on the signature `{empty stdout, exit 0, vault= supplied, vault present in 'obsidian vaults' output}` and surfaces `CLI_REPORTED_ERROR(details.code = "VAULT_NOT_FOUND", details.reason = "not-open")`. Detection lives in the typed-tool handler, NOT in the cli-adapter — the 008-refactor surface and the 011-R5 clause stay FROZEN.
- **R6 — Base64 anti-injection**: frozen JS template with single `__PAYLOAD_B64__` substitution. User-supplied `path` / `file` / `target_mode` / `limit` / `total` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime`. No user input ever reaches the JS source as text. Parity with BI-014 / BI-015 / BI-025.
- **R7 — Per-match transform from `{item.key, score}` → `{path, headingPath, score}`**: per F4 / F5 / F6, `find_connections()` returns block-level matches by default with keys like `"Folder/Note.md#H1#H2"`. The eval JS extracts `path = key.split('#')[0]` and `headingPath = key.split('#').slice(1)` (empty array `[]` for source-level matches if any appear; literal-preserved `["---frontmatter---"]` for frontmatter-block matches per F6 — plugin sentinel kept verbatim, NOT normalised by the wrapper).
- **R8 — Three-level sort intra-eval**: primary `score` descending; secondary `path` byte-compare ascending; tertiary `headingPath.join("#")` byte-compare ascending. Deterministic across repeat calls; no `localeCompare`.
- **R9 — Source-path-keyed self-exclusion**: `.filter(m => m.path !== sourcePath)` in-eval post-fetch. Excludes the source note AND any block inside the source note (block-inside-source matches would otherwise dominate short notes per the post-grilling-Q3 live-probe amendment).
- **R10 — Non-finite-score filter**: `.filter(m => Number.isFinite(m.score))` in-eval post-fetch. Silently drops any match where `score` is `NaN` / `Infinity` / `-Infinity` / `null` / `undefined` / missing field. No envelope code emitted for the filter event — bad entries simply don't appear. Per the 2026-05-15 clarifications session Q2.
- **R11 — SOURCE_NOT_INDEXED detection**: in-eval check `env.smart_sources.items[<sourcePath>]` returning `undefined` (or missing `find_connections` method) → envelope `{ok:false, code:'SOURCE_NOT_INDEXED', detail:sourcePath}`. Distinct from FILE_NOT_FOUND (which fires when the file doesn't exist in the vault at all).
- **R12 — NOT_MARKDOWN guard in-eval**: `f.extension === 'md'` check AFTER file resolution; non-`.md` source surfaces `{ok:false, code:'NOT_MARKDOWN', detail:f.extension}`. Parity with BI-025.
- **R13 — Error-precedence chain per FR-017b**: outer-to-inner / cheapest-first. Specific mode: `VAULT_NOT_FOUND(unknown)` (cli-adapter 011-R5) → `VAULT_NOT_FOUND(not-open)` (handler stage-0) → `SMART_CONNECTIONS_NOT_INSTALLED` → `FILE_NOT_FOUND` → `NOT_MARKDOWN` → `SMART_CONNECTIONS_NOT_READY` → `SOURCE_NOT_INDEXED` → success. Active mode skips the vault steps (active mode forbids `vault` arg per ADR-003). Per 2026-05-15 clarifications session Q4.
- **R14 — Plugin-namespace tool name**: `smart_connections_similar` follows ADR-013's `<plugin_name>_<operation>` convention (codified in this plan phase per FR-029). Sibling rule to ADR-010 for native-CLI wrappers; mutually exclusive in scope.
- **Q1–Q5 clarifications session 2026-05-15** (codified in spec.md): Q1 docs-only soft-pin for minimum plugin version; Q2 silently drop non-finite scores; Q3 in-eval vault-mismatch detection — REVISED by live-probe amendment to `not-open` closed-vault detection; Q4 outer-to-inner / cheapest-first error precedence chain; Q5 architecture-doc snapshot semantics. Two live-probe-driven amendments (post-test 2026-05-15): vault= routing premise (FR-017a repurposed) + block-level granularity (grilling-Q3 amendment — v1 shape becomes `{path, headingPath, score}`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers. Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read` / `delete` / `files` / `read_heading` / `read_property` / `set_property` / `rename` / `write_note` / `find_by_property` / `outline` / `properties` / `links`). All paths are relative to the repo root. Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at `src/tools/smart_connections_similar/` (does NOT exist yet — created by T002–T007).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–025). This feature introduces NO new runtime dependencies. The Smart Connections plugin is a USER-side runtime dependency (the user's Obsidian instance has it installed); the wrapper code itself has no new npm package dependencies. The plan-phase deliverables (ADR-013, architecture snapshot file, architecture base file roll-forward, constitution v1.4.0) all already shipped during `/speckit-plan` — no T-tasks needed for them. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI / live-plugin characterisation that locks the handler against verified upstream behaviour for the cases deferred from plan stage (per [research.md § Cases deferred to T0](research.md#cases-deferred-to-t0-of-speckit-implement)).

**Note on plan-stage coverage**: 14 architecture-locking findings (F1–F14) were verified live during plan stage on 2026-05-15 against three open vaults (TestVault-Obsidian-CLI-MCP, The Setup, Ways of Working) plus a follow-up probe after the user closed two of them — see [research.md § Live-CLI findings](research.md). T001 below covers the 7 cases deferred to T0 because they require fresh fixtures, focused-vault state changes, OR plugin lifecycle manipulation not feasible at plan time.

- [ ] T001 Live-CLI / live-plugin characterisation of the 7 deferred T0 cases. Run probes against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  - **(T0.1) [pre-impl gate for T004] Active-mode no-focused-file UpstreamError code alignment (FR-018 / SC-004 / Q-4 verification)**: close all open panes in Obsidian (use the workspace's "Close all" command, or close panes until `app.workspace.getActiveFile()` returns null). Probe via the wrapper end-to-end (`executeSmartConnectionsSimilar({target_mode:'active'}, realDeps)`). Confirm the response is a structured no-active-file error. **DECISION POINT per R13 / BI-015 / BI-025 alignment**: the wrapper's `mapEnvelopeError` maps `NO_ACTIVE_FILE` envelope code to either `ERR_NO_ACTIVE_FILE` UpstreamError code (the BI-015 / BI-014 precedent) OR `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NO_ACTIVE_FILE')`. Probe BI-025's `links` against no-focused-file and observe which `UpstreamError.code` the cli-adapter surfaces. Lock the wrapper's `mapEnvelopeError` to that same code for parity. Document the final choice in research.md AND in T004's handler.ts comment. Restore Obsidian's normal pane state after.

  - **(T0.2) [pre-impl gate + post-impl wrapper E2E] Closed-but-registered vault end-to-end (R5a / FR-017a / SC-011a / Q-11a verification)**: pick one currently-open registered vault (e.g. The Setup or Ways of Working — NOT TestVault since TestVault is the test rig). Close that vault window in Obsidian. Probe via wrapper end-to-end (`executeSmartConnectionsSimilar({target_mode:'specific', vault:'<closed-vault>', path:'<any.md>'}, realDeps)`). **Expected per F7 / F8 / R5a**: the wrapper detects the empty-stdout signature AND raises `CLI_REPORTED_ERROR(details.code='VAULT_NOT_FOUND', details.reason='not-open')`. Side effect: the vault transparently opens — re-probe immediately AND confirm the second call succeeds (vault is now open). **TRIGGER**: if the wrapper raises `CLI_REPORTED_ERROR(stage:'json-parse')` (the dispatch layer's generic empty-stdout-parse-failure path), the handler's stage-0 detection branch is NOT firing — debug the empty-stdout signature check OR the `obsidian vaults` known-vault lookup. Document the verbatim CLI response (`stdout`, `stderr`, exit code) AND the elapsed time between empty-stdout response and the transparent-open completing. Re-open the closed vault before continuing if needed.

  - **(T0.3) [post-impl wrapper E2E] Plugin-uninstalled path end-to-end (FR-015 / SC-012 / Q-12 verification)**: in TestVault-Obsidian-CLI-MCP, temporarily DISABLE the Smart Connections plugin via Obsidian's Community Plugins settings (or rename the plugin folder if disable-via-UI is unreliable). Probe via wrapper (`executeSmartConnectionsSimilar({target_mode:'specific', vault:'TestVault-Obsidian-CLI-MCP', path:'Welcome.md'}, realDeps)`). **Expected**: envelope `{ok:false, code:'SMART_CONNECTIONS_NOT_INSTALLED', detail:'…'}` → wrapper raises `CLI_REPORTED_ERROR(stage:'envelope-error', code:'SMART_CONNECTIONS_NOT_INSTALLED')`. **TRIGGER**: if the eval JS throws an uncaught exception when `app.plugins.plugins["smart-connections"]` is undefined (e.g. trying to access `.env` on undefined), the in-eval lifecycle check is missing OR wrong — debug the eval JS Stage-1 check. Re-enable the plugin after the probe. Confirm subsequent probes work normally.

  - **(T0.4) [post-impl wrapper E2E] Source-not-indexed path (R11 / FR-014 / SC-009 / Q-9 verification)**: seed `Sandbox/sc-T0-new-note.md` with a small body. Open TestVault. **Critical timing**: probe via wrapper IMMEDIATELY after creating the file, before Smart Connections has had time to index it (typically within a few seconds; the plugin's indexing-trigger debounce is configurable but defaults to ~5s). **Expected**: envelope `{ok:false, code:'SOURCE_NOT_INDEXED', detail:'Sandbox/sc-T0-new-note.md'}` → wrapper raises `CLI_REPORTED_ERROR(stage:'envelope-error', code:'SOURCE_NOT_INDEXED')`. **TRIGGER**: if the eval JS instead raises `FILE_NOT_FOUND` (file resolution failed) OR `SMART_CONNECTIONS_NOT_READY` (plugin's env.smart_sources is loaded but the just-created file is not in `.items`), confirm the in-eval check order — stage-2 file resolution should succeed for the just-created file (Obsidian's file index updates synchronously on file creation), and the source-key lookup at stage-5 should be what fails. If the response succeeds with the file now in the index, retry with an even shorter delay between file creation and probe. Clean up the fixture after.

  - **(T0.5) [post-impl wrapper E2E] Path-traversal `path` value end-to-end (FR-020 / SC-015 / Q-15 verification)**: probe via the wrapper `executeSmartConnectionsSimilar({target_mode:'specific', vault:'TestVault-Obsidian-CLI-MCP', path:'../escape.md'}, realDeps)`. **Expected**: the eval JS's `app.vault.getAbstractFileByPath('../escape.md')` returns null (Obsidian's file index uses vault-relative paths without `..` resolution); envelope returns `{ok:false, code:'FILE_NOT_FOUND', detail:'path: ../escape.md'}` → wrapper raises `CLI_REPORTED_ERROR(stage:'envelope-error', code:'FILE_NOT_FOUND')`. **TRIGGER**: if any filesystem mutation occurs outside the vault OR upstream's `app.vault.getAbstractFileByPath` somehow returns a file matching `../escape.md`, the FR-020 contract is broken — escalate; the wrapper may need a schema-layer regex guard. Document the actual behaviour. Also probe with `Sandbox/../../etc/passwd` shape to confirm equivalent rejection. No fixture seeding needed.

  - **(T0.6) [post-impl] End-to-end specific-mode happy path with block-level fixture (FR-007 / SC-001 / Q-1 verification)**: pick an indexed note in TestVault with known semantic neighbours (or seed `Sandbox/sc-T0-similar.md` with substantive content and wait for indexing to complete — visible in the plugin's UI as "X embeddings to make: 0"). Probe via wrapper end-to-end with `limit: 10`. Assert response carries multiple block-level entries each with `path` byte-faithful to the source file (everything before first `#`), `headingPath` an array of strings (empty `[]` for source-level matches, multi-segment for nested-heading blocks, single-element `["---frontmatter---"]` for frontmatter blocks), `score` a finite number. Assert sort order: `matches[0].score >= matches[1].score >= ... >= matches[N].score` (descending). Document the per-entry response in research.md, INCLUDING at least one frontmatter-block match if any appear (validates F6 sentinel preservation). **TRIGGER**: if no `headingPath: ["---frontmatter---"]` appears in any result across multiple probes, document — the sentinel may be version-specific to the plugin minor release. Clean up fixture if seeded.

  - **(T0.7) [post-impl, OPTIONAL] Very-large-match-list cap-boundary (Q-26 / SC-026 verification — OPTIONAL per BI-024 / BI-025 precedent)**: at `limit: 100`, each emitted entry is ~120 bytes (`{"path":"Folder/Note.md","headingPath":["H1","H2"],"score":0.85}`); 100 matches × 120 bytes ≈ 12 KiB, **four orders of magnitude** below the cli-adapter's 10 MiB cap. Essentially unreachable in practice. **OPTIONAL — defer this T0.7 case**: the FR-017 / SC-026 contract (cap fires as structured error, not silent truncation) is structurally ensured by the cli-adapter's existing 10 MiB cap machinery from BI-003 — empirical confirmation here is observability evidence, not a contract gate. Parity with BI-024 T0.5 / BI-025 T0.7 OPTIONAL pattern. If exercised: seed a synthetic edge case via a stub envelope payload that pads the `matches` array with very-long `path` strings to trigger the 10 MiB cap, observe `CLI_NON_ZERO_EXIT` with `details.killReason = {kind: "cap", stream: "stdout"}`. Document outcome.

**Checkpoint**: Foundational characterisation complete. Active-mode UpstreamError code locked; closed-vault end-to-end detection branch verified; plugin-uninstalled path verified; source-not-indexed path verified; path-traversal contract confirmed; mixed-kind happy-path with block-level matches end-to-end verified (incl. frontmatter-sentinel preservation if observed); cap-boundary outcome documented (OPTIONAL — structural inheritance from BI-003). User-story implementation can now begin. (Note: T0.1 is the single MANDATORY pre-impl gate — it locks the `NO_ACTIVE_FILE` UpstreamError code that T004's `mapEnvelopeError` references. T0.2 has a pre-impl portion that informs handler stage-0 logic, AND a post-impl portion that verifies the end-to-end behaviour after T009 lands. All other probes are post-impl wrapper E2E. T0.7 is OPTIONAL.)

---

## Phase 3: User Story 1 — Semantic similarity listing for a named note (Priority: P1) 🎯 MVP

**Goal**: Add the typed `smart_connections_similar` MCP tool surface that returns `{ count, matches: [{ path, headingPath, score }] }` for a single named source note. Covers FR-001..FR-018 (default mode happy path + block-level granularity + three-level sort + source-path-keyed self-exclusion + non-finite-score filter + plugin-lifecycle discriminators + closed-vault detection branch + error-precedence chain).

**Independent Test**: invoke `smart_connections_similar({ target_mode: 'specific', vault: '<vault>', path: '<indexed .md path>' })` against a note with known semantic neighbours; assert response shape `{ count, matches: [...] }` with correct per-entry `path` / `headingPath` / `score` values in descending score order. Per [quickstart.md](quickstart.md) Q-1..Q-17.

> **Note on bundled stories**: T002–T009 below are the single source implementation that delivers Stories 1, 2, 3, 4 in one atomic ship. The `[US1]` tag marks primary-story attribution; US2/US3/US4 are sub-stories of the same module and ride along (no separate code paths). Story-tag breakdown by file:
>
> - schema.ts → US1 (default-mode shape) + US2 (active-mode discriminator branch) + US3 (validation refinement: XOR locator, vault-required-in-specific, active-mode-forbid, limit-range, total-boolean) + US4 (count-only `total` field)
> - handler.ts → US1 (default-mode happy path + transforms + sort + filters + closed-vault stage-0 branch) + US2 (active-mode resolves via `app.workspace.getActiveFile()` in eval) + US4 (count-only branch at envelope emission)
> - index.ts → US1 (registration)
> - docs/tools/smart_connections_similar.md → US5 (documentation)

### Implementation for User Story 1 (MVP — bundled with US2/US3/US4)

- [ ] T002 [P] [US1] Create [src/tools/smart_connections_similar/schema.ts](../../src/tools/smart_connections_similar/schema.ts) per [data-model.md § Input schema](data-model.md). Export `smartConnectionsSimilarInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ limit: z.number().int().min(1).max(100).default(20), total: z.boolean().optional() }))` — consumes `targetModeBaseSchema` + `applyTargetModeRefinement` from `../../target-mode/target-mode.js` per ADR-003 / R4. Export `matchEntrySchema = z.object({ path: z.string().endsWith('.md'), headingPath: z.array(z.string()), score: z.number().finite() }).strict()` — `.strict()` mode locks the exhaustive-fields list per FR-007 post-Q3-amendment. Export `smartConnectionsSimilarOutputSchema = z.object({ count: z.number().int().nonnegative(), matches: z.array(matchEntrySchema) }).strict()`. Export `SC_SIMILAR_EVAL_ERROR_CODES = ['NO_ACTIVE_FILE','FILE_NOT_FOUND','NOT_MARKDOWN','SMART_CONNECTIONS_NOT_INSTALLED','SMART_CONNECTIONS_NOT_READY','SOURCE_NOT_INDEXED'] as const` and `smartConnectionsSimilarEvalResponseSchema = z.discriminatedUnion('ok', [z.object({ok:z.literal(true), count: z.number().int().nonnegative(), matches: z.array(matchEntrySchema)}).strict(), z.object({ok:z.literal(false), code: z.enum(SC_SIMILAR_EVAL_ERROR_CODES), detail: z.string()}).strict()])`. Inferred types: `SmartConnectionsSimilarInput` / `SmartConnectionsSimilarOutput` / `MatchEntry` / `SmartConnectionsSimilarEvalResponse` / `SmartConnectionsSimilarEvalErrorCode` via `z.infer`. Carry the `// Original — no upstream. <one-line description>.` header per Constitution V (FR-027).

- [ ] T003 [P] [US1] Create [src/tools/smart_connections_similar/schema.test.ts](../../src/tools/smart_connections_similar/schema.test.ts) with 20 cases per [data-model.md § Test inventory schema.test.ts](data-model.md). Cases: (1) specific+vault+path happy ✓; (2) specific+vault+file happy ✓; (3) specific+vault+path+`limit:1` (min boundary) ✓; (4) specific+vault+path+`limit:100` (max boundary) ✓; (5) specific+vault+path+`limit:20` (default — omitted) ✓; (6) specific+vault+path+`total:true` ✓; (7) specific+vault+path+`total:false` ✓; (8) active happy ✓; (9) active+`limit:50` ✓; (10) active+`total:true` ✓; (11) specific without vault ✗ (ZodError); (12) specific without file+path ✗ (XOR); (13) specific with both file+path ✗ (XOR); (14) active with vault ✗; (15) active with file ✗; (16) active with path ✗; (17) unknown top-level key (e.g. `threshold`) ✗ (strict mode); (18) `total: "true"` (string) ✗; (19) `limit: 0` ✗ (below min); (20) `limit: 101` ✗ (above max). Plus (bonus, may be folded into the 20): `target_mode` missing ✗; `target_mode: "focused"` ✗; `limit: 5.5` (non-integer) ✗; emitted JSON Schema round-trips with `target_mode` enum + locator XOR + active-forbid refinements intact. Each failing case is asserted with a dispatcher spy (`vi.fn()`) that MUST NEVER be called — locks FR-019 structurally. Carry `// Original — no upstream.` header.

- [ ] T004 [US1] Create [src/tools/smart_connections_similar/handler.ts](../../src/tools/smart_connections_similar/handler.ts) per [contracts/smart-connections-similar-handler.contract.md](contracts/smart-connections-similar-handler.contract.md). Export `executeSmartConnectionsSimilar(input: SmartConnectionsSimilarInput, deps: SmartConnectionsSimilarHandlerDeps): Promise<SmartConnectionsSimilarOutput>`. Logic:

  1. **JS_TEMPLATE constant** (FROZEN — only `__PAYLOAD_B64__` substitution point per data-model.md § JS template body): the literal string from [data-model.md § JS template body](data-model.md). 8-stage async IIFE: (Stage 1 plugin-lifecycle check via `app.plugins.plugins["smart-connections"]` presence — emit `SMART_CONNECTIONS_NOT_INSTALLED` if absent; Stage 2 file resolution per `a.active` / `a.path` / `a.file` — emit `NO_ACTIVE_FILE` or `FILE_NOT_FOUND`; Stage 3 `f.extension === 'md'` guard — emit `NOT_MARKDOWN`; Stage 4 `env.smart_sources` readiness check — emit `SMART_CONNECTIONS_NOT_READY`; Stage 5 source-key lookup via `env.smart_sources.items[sourceKey]` — emit `SOURCE_NOT_INDEXED`; Stage 6 `await src.find_connections({limit: a.limit})`; Stage 7 transform + finite-score filter + source-path-keyed self-exclusion + three-level sort; Stage 8 envelope emission branched on `a.total`).
  2. **Payload assembly** per [data-model.md § Base64 payload assembly](data-model.md): `payload = { active: input.target_mode==='active', path: input.target_mode==='specific' ? input.path ?? null : null, file: input.target_mode==='specific' ? input.file ?? null : null, limit: input.limit, total: input.total === true }`. `payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')`. `code = JS_TEMPLATE.replace('__PAYLOAD_B64__', payloadB64)` — exactly one `replace` call, exactly one substitution point.
  3. **ONE `invokeCli` invocation** (R3 / single-spawn invariant): `await deps.invokeCli({ target_mode: input.target_mode, vault: input.target_mode==='specific' ? input.vault : undefined, subcommand: 'eval', parameters: { code } })`. NO `parameters.file` / `parameters.path` — those flow through the b64 payload only per R6 anti-injection.
  4. **Stage 0 — closed-vault empty-stdout detection (R5a / FR-017a)**: if `input.target_mode === 'specific'` AND `result.stdout.trim() === ''` AND `result.exitCode === 0`, lookup `input.vault` in the known-vault list (lazy-cache from `obsidian vaults` output via a separate small `invokeCli` call to `vaults` subcommand — OR via the existing vault-registry module if BI-038-era infrastructure exposes it for read-only consumption). If the vault IS present in the known list, throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', message: 'requested vault is registered but not currently open in Obsidian', details: { code: 'VAULT_NOT_FOUND', reason: 'not-open', stage: 'handler-stage-0', vault: input.vault } })`. Per T0.2 verification, the CLI transparently opens the vault as a side effect — document this in a `// NOTE:` comment.
  5. **Stage 1 — strip eval prefix**: `const trimmed = result.stdout.replace(/^=> /, '').trimEnd()`.
  6. **Stage 2 — JSON.parse**: try/catch; on failure throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', message: 'smart_connections_similar eval returned non-JSON stdout', cause, details: { stage: 'json-parse', stdout: trimmed.slice(0, 200) } })`.
  7. **Stage 3 — envelope safeParse**: `const r = smartConnectionsSimilarEvalResponseSchema.safeParse(parsed)`; on failure throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', message: 'eval envelope did not match schema', cause: r.error, details: { stage: 'envelope-parse', issues: r.error.issues } })`.
  8. **Stage 4 — discriminate on `ok`**: if `envelope.ok === false`, call `mapEnvelopeError(envelope.code, envelope.detail)` and throw. The map (TypeScript exhaustiveness-checked over `SC_SIMILAR_EVAL_ERROR_CODES`): `NO_ACTIVE_FILE` → per T0.1 lock (`ERR_NO_ACTIVE_FILE` or `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NO_ACTIVE_FILE')`); ALL other 5 codes → `CLI_REPORTED_ERROR(stage:'envelope-error', code:<envelope.code>)`.
  9. **Stage 5 — return**: `return { count: envelope.count, matches: envelope.matches }`.

  Type definitions: `SmartConnectionsSimilarHandlerDeps = { invokeCli: CliAdapter['invokeCli']; logger?: Logger }`. Carry `// Original — no upstream.` header. NO `logger.callStart` / `callEnd` events per R1 thin-handler convention.

- [ ] T005 [US1] Create [src/tools/smart_connections_similar/handler.test.ts](../../src/tools/smart_connections_similar/handler.test.ts) with 32 cases per [data-model.md § handler.test.ts](data-model.md). Inject stub `invokeCli` via `deps.invokeCli = vi.fn().mockResolvedValue({stdout: '=> ' + JSON.stringify(envelopeFixture), stderr: '', exitCode: 0})`. Per-test assertions: (a) `deps.invokeCli.mock.calls.length === 1` for non-stage-0 tests, `=== 2` for stage-0 closed-vault tests (one for the main eval, one for the vaults lookup); (b) for any test exercising the payload, decode `code=` argv via the test-seam pattern from [contracts/smart-connections-similar-handler.contract.md § Test seam pattern](contracts/smart-connections-similar-handler.contract.md) — assert the decoded payload matches the user input bit-for-bit (R6 anti-injection structural lock); (c) for envelope-error tests, assert the thrown UpstreamError carries the correct `code` AND `details.stage` AND `details.code` AND `details.detail` per R13 table.

  **Happy paths (6)**: (1) specific+path+block-level envelope → multi-entry response with multi-segment `headingPath`; (2) specific+file (basename) → resolves via `getFirstLinkpathDest` per the eval JS, same response shape; (3) specific+path+`total:true` → `{count:N, matches:[]}`; (4) specific+path+empty matches envelope (`{ok:true, count:0, matches:[]}`) → `{count:0, matches:[]}` per FR-011; (5) active+focused → response shape; (6) active+`total:true` → count-only response shape.

  **Per-match shape + transforms (6)**: (7) source-level match (key has no `#`) → `headingPath: []`; (8) single-segment heading match (key `Folder/Note.md#Heading`) → `headingPath: ["Heading"]`; (9) multi-segment heading match (key `Folder/Note.md#H1#H2#H3`) → `headingPath: ["H1","H2","H3"]`; (10) frontmatter-block match (key `Folder/Note.md#---frontmatter---`) → `headingPath: ["---frontmatter---"]` byte-faithful sentinel; (11) non-finite-score filter (envelope includes one match with `score: NaN`, one with `score: null`, one with `score: Infinity`, one with `score: 0.5`) → response includes only the `0.5` entry; (12) per-match three-field exhaustive shape (response entries have ONLY `path` / `headingPath` / `score` keys per `Object.keys(entry)` set equality — locks FR-007 SC-007a).

  **Sort + self-exclusion (4)**: (13) score-tie + path-tiebreak: two matches with same score but different `path` strings — response orders by `path` byte-asc; (14) score-tie + path-tie + headingPath-tiebreak: two matches with same score AND same `path` but different `headingPath.join("#")` — response orders by `headingPath.join("#")` byte-asc; (15) self-exclusion source-level (envelope includes a match where `key === sourceKey` with `headingPath: []`) → response excludes that entry; (16) self-exclusion block-inside-source (envelope includes a match where `key` starts with `sourceKey + "#"`) → response excludes ALL such block-inside-source entries.

  **Cross-mode invariant + limit (3)**: (17) cross-mode invariant: invoke same fixture-stub with `total: false` then `total: true`; assert `count_false === count_true` (FR-006a / R3); (18) `limit:5` cap honored: stub envelope returns 8 matches, response carries 5 (top-5); (19) `limit:100` upper boundary: stub envelope returns 50 matches, response carries 50 (plugin's internal cap below request limit — F12 documented).

  **Error paths (8)**: (20) unknown vault — stub `invokeCli` rejects with `UpstreamError(CLI_REPORTED_ERROR, details.code='VAULT_NOT_FOUND')` simulating the 011-R5 clause output, assert error propagates with `details.reason` absent or `'unknown'`; (21) closed-but-registered vault — stub `invokeCli` resolves with `{stdout: '', exitCode: 0}` on the main eval call AND `{stdout: 'TestVault-Obsidian-CLI-MCP\t…\nThe Setup\t…\n', exitCode: 0}` on the vaults lookup; assert wrapper throws `CLI_REPORTED_ERROR(details.code='VAULT_NOT_FOUND', details.reason='not-open', stage:'handler-stage-0')` AND `deps.invokeCli.mock.calls.length === 2` (the second call is the vaults lookup); (22) unresolved `path` — envelope `FILE_NOT_FOUND`; (23) unresolved `file` basename — envelope `FILE_NOT_FOUND`; (24) `.canvas` file — envelope `NOT_MARKDOWN`; (25) plugin-not-installed — envelope `SMART_CONNECTIONS_NOT_INSTALLED`; (26) plugin-not-ready — envelope `SMART_CONNECTIONS_NOT_READY`; (27) source-not-indexed — envelope `SOURCE_NOT_INDEXED`; (28) active+no-focused-file — envelope `NO_ACTIVE_FILE` → wrapper throws T0.1-locked code.

  **Parse failures (2)**: (29) stdout non-JSON — stub stdout `=> not valid json`, assert wrapper throws `CLI_REPORTED_ERROR(stage:'json-parse')`; (30) envelope shape unknown — stub stdout `=> {"ok":true,"count":5,"matches":[],"surprise":"extra"}`, assert `CLI_REPORTED_ERROR(stage:'envelope-parse')`.

  **Precedence chain compound fixtures (per FR-017b / SC-011b — 6 adjacent-pair fixtures, may be folded into existing error-path tests or added as separate cases — count toward the 32 total; if added separately, the earlier error-path tests fold into one combined case)**: each compound fixture exercises TWO simultaneous failure conditions and asserts the earlier-priority discriminator surfaces. Pairs: (a) `VAULT_NOT_FOUND(unknown)` wins over `VAULT_NOT_FOUND(not-open)` — stub rejects with `Vault not found.` (cli-adapter classifies as unknown) and the vault name is also NOT in the known-vault list; (b) `VAULT_NOT_FOUND(not-open)` wins over `SMART_CONNECTIONS_NOT_INSTALLED` — stub returns empty stdout (closed-vault signature) AND the would-be envelope would have been `SMART_CONNECTIONS_NOT_INSTALLED` if the eval had reached the plugin lifecycle check; (c) `SMART_CONNECTIONS_NOT_INSTALLED` wins over `FILE_NOT_FOUND` — envelope `SMART_CONNECTIONS_NOT_INSTALLED` even though `path:'nonexistent.md'`; (d) `FILE_NOT_FOUND` wins over `NOT_MARKDOWN` — envelope `FILE_NOT_FOUND` even though `path:'nonexistent.canvas'` would otherwise be `NOT_MARKDOWN`; (e) `NOT_MARKDOWN` wins over `SMART_CONNECTIONS_NOT_READY` — envelope `NOT_MARKDOWN` even though `env.smart_sources` is also missing; (f) `SMART_CONNECTIONS_NOT_READY` wins over `SOURCE_NOT_INDEXED` — envelope `SMART_CONNECTIONS_NOT_READY` since the readiness check fires before the per-source lookup.

  **Argv / payload invariants (3)**: (31) base64 payload round-trip per the test-seam pattern; (32) single `invokeCli` call assertion combined with frozen-template prefix/suffix check + payload b64-encoded (R3 / R6 / R12 — umbrella test against the Q-1 fixture). Carry `// Original — no upstream.` header.

- [ ] T006 [US1] Create [src/tools/smart_connections_similar/index.ts](../../src/tools/smart_connections_similar/index.ts). Export `createSmartConnectionsSimilarTool(deps: RegisterDeps): RegisteredTool` via the `registerTool` factory (parity with `outline` / `properties` / `read` / `read_heading` / `links`). Export `SMART_CONNECTIONS_SIMILAR_TOOL_NAME = "smart_connections_similar"` constant and `SMART_CONNECTIONS_SIMILAR_DESCRIPTION` string. The description SHOULD mention: the typed `{ count, matches: [{ path, headingPath, score }] }` envelope; the `target_mode` discriminator and the optional `limit` / `total` parameters; the block-level granularity (matches `find_connections()`'s natural shape); the plugin-as-runtime-dependency note (Smart Connections plugin required); the 8-entry error roster including the three plugin-lifecycle codes AND the `details.reason: "not-open"` sub-discriminator; a pointer to `help({ tool_name: "smart_connections_similar" })` for full docs. Model length and shape after `LINKS_DESCRIPTION` and `OUTLINE_DESCRIPTION`. Carry `// Original — no upstream.` header.

- [ ] T007 [US1] Create [src/tools/smart_connections_similar/index.test.ts](../../src/tools/smart_connections_similar/index.test.ts) with 5 registration cases: (a) `createSmartConnectionsSimilarTool({...}).descriptor.name === "smart_connections_similar"`; (b) descriptor `inputSchema` has descriptions stripped (ADR-005 — assert no `description` field appears in the JSON Schema's properties); (c) `SMART_CONNECTIONS_SIMILAR_DESCRIPTION` mentions `help({ tool_name: "smart_connections_similar" })`; (d) `docs/tools/smart_connections_similar.md` exists with non-stub content (assert file size > 1 KB AND contains the strings "Worked example" + "Error roster" + "minimum plugin version" + "plugin-lifecycle" + "headingPath" — placeholder check; full content asserted via the registry-consistency test from BI-005); (e) the `_register-baseline.test.ts` drift detector fingerprint matches the rolled-forward baseline (this depends on T009 — comment as "AFTER T009"). Carry `// Original — no upstream.` header.

- [ ] T008 [US1] Edit [src/server.ts](../../src/server.ts): add the import line `import { createSmartConnectionsSimilarTool } from "./tools/smart_connections_similar/index.js";` in ASCII-alphabetical position (between `createSetPropertyTool` and `createWriteNoteTool` — verify alphabetical order matches the existing import block; ASCII `set_property/` < `smart_connections_similar/` < `write_note/`). Add the `createSmartConnectionsSimilarTool({ logger, queue })` entry in the tools array, alphabetical position. DO NOT pass `vaultRegistry` (parity with `outline` / `properties` / `links` — smart_connections_similar's vault-registry consultation for the stage-0 closed-vault detection is a per-call dynamic lookup, not a startup-time injection). Verify by `npm run typecheck` AND by `npm run test -- src/server.test.ts` — the existing registry-consistency test auto-covers `smart_connections_similar`'s docs/ presence once the registration lands.

- [ ] T009 [US1] Roll forward [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write`. This adds the new `smart_connections_similar` tool's fingerprint (`{ name: "smart_connections_similar", descriptionFingerprint: "<sha256>", schemaFingerprint: "<sha256>" }`) to the baseline array per BI-022's FR-018 contract. Verify: (a) `git diff src/tools/_register-baseline.json` shows ONLY the new `smart_connections_similar` entry added (no other tool's fingerprint changed — confirms SC-019); (b) `npm run test -- src/tools/_register-baseline.test.ts` passes after the roll-forward. **TRIGGER**: if any other tool's fingerprint changed, halt — accidental description-text drift or schema-shape drift in another tool. Investigate before continuing.

**Checkpoint for User Stories 1–4**: Schema + handler + index + server registration + baseline roll-forward all landed; 52 of 57 tests pass (T007's 5 registration cases require T010's docs.md to exist). MVP code path is functional pending docs.

---

## Phase 4: User Story 5 — Documentation surface (Priority: P2)

**Goal**: Author the progressive-disclosure help-facility documentation for `smart_connections_similar`. Covers FR-022 / SC-020 / Q-20 from quickstart.

**Independent Test**: invoke the help facility with `tool_name: 'smart_connections_similar'`; assert the doc carries the per-field input contract, output shape (both modes), full 8-entry failure-mode roster with the three plugin-lifecycle codes AND the `details.reason: "not-open"` sub-discriminator, error-precedence chain per FR-017b, the four documented inherited limitations, the minimum probed Smart Connections plugin version (soft-pin per Q1), and ≥4 worked examples covering ≥4 distinct usage modes.

- [ ] T010 [US5] Create [docs/tools/smart_connections_similar.md](../../docs/tools/smart_connections_similar.md) (~220 lines). Structure mirrors `docs/tools/links.md` and `docs/tools/outline.md`. Required sections:

  - **Summary** (1 paragraph): what the tool does — semantic-similarity nearest-neighbour listing for a single source note via the Smart Connections plugin; block-level granularity (matches the plugin's natural output); requires Smart Connections plugin to be installed AND its indexing to have completed.
  - **Input** (per-field contract): `target_mode` (specific/active), `vault` (mandatory in specific), `file` XOR `path` in specific, `limit` optional integer (1..100, default 20), `total` optional boolean; the active-mode-forbid rule for vault/file/path.
  - **Output** (both modes): default `{ count, matches: [{ path, headingPath, score }] }` with the per-entry shape spelled out — `path` is the source file's vault-relative path with `.md` extension (everything before first `#` in the plugin's match key); `headingPath` is an array of heading segments after the first `#` (empty array for source-level matches, `["---frontmatter---"]` literal for frontmatter blocks, multi-segment for nested-heading blocks); `score` is the raw plugin-returned number, embedding-model-dependent range. Count-only mode: `{ count: N, matches: [] }`.
  - **Sort order**: primary `score` desc / secondary `path` byte-asc / tertiary `headingPath.join("#")` byte-asc.
  - **Worked examples** (≥4): (1) specific-mode by `path` against an indexed note showing the response with multi-segment headingPath entries; (2) specific-mode by `file` (basename) showing equivalence to (1); (3) active-mode without `total`; (4) count-only mode (`total: true`) against the same fixture as (1) showing equivalent `count`; (5) failure-path example — plugin-not-installed OR plugin-not-ready OR source-not-indexed OR vault-not-open.
  - **Error roster** (table, 8+ rows): VALIDATION_ERROR (various sub-cases) / VAULT_NOT_FOUND with `details.reason: "unknown"` / VAULT_NOT_FOUND with `details.reason: "not-open"` / FILE_NOT_FOUND / NOT_MARKDOWN / SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY / SOURCE_NOT_INDEXED / ERR_NO_ACTIVE_FILE-or-CLI_REPORTED_ERROR(NO_ACTIVE_FILE) (per T0.1 decision) / json-parse / envelope-parse / CLI_NON_ZERO_EXIT (output cap) / CLI_BINARY_NOT_FOUND.
  - **Error-precedence chain** (per FR-017b): specific mode order; active mode order; explanation of what each discriminator means; how to remediate each (e.g. `SMART_CONNECTIONS_NOT_INSTALLED` → enable the plugin in Obsidian community-plugins settings; `SMART_CONNECTIONS_NOT_READY` → wait for indexing or check plugin status UI; `SOURCE_NOT_INDEXED` → trigger re-index or wait for next indexing pass; `VAULT_NOT_FOUND(not-open)` → open the vault in Obsidian; agents MAY retry after brief delay since the CLI transparently opens the vault as a side effect).
  - **Documented inherited limitations** (4 entries per Q1 + the post-Q3 amendment, plus a note about the now-elevated multi-vault basename ambiguity = 5 total): (1) embedding-model-dependent score bands; (2) indexing freshness (results reflect last embedding pass, not vault HEAD); (3) folder exclusions in plugin config silently filter results; (4) plugin-version drift surfaces as `SMART_CONNECTIONS_NOT_READY` (docs-only soft-pin, no runtime version check); (5) multi-vault basename ambiguity (`vault=` routes correctly but basename lookup is per-vault).
  - **Minimum probed Smart Connections plugin version**: name the exact version the wrapper was probed against per the plan-stage live probe (captured in research.md). Mark as a soft-pin per Q1 — wrapper does NOT enforce; users on older or newer plugin versions can correlate `SMART_CONNECTIONS_NOT_READY` errors to plugin-version drift.
  - **Block-vs-source granularity note**: the tool returns block-level matches by default (per the plugin's natural shape). Agents wanting source-level granularity collapse to `path` client-side: `Object.values(Object.fromEntries(matches.map(m => [m.path, m])))` keeps the highest-scoring entry per source.
  - **Out-of-scope note**: free-text semantic query (defer to future `smart_connections_query`); chat / RAG (out of wrapper scope); embedding retrieval (out of scope); embedding generation trigger (read-only); folder filters at request layer (callers filter client-side); threshold parameter (model-dependent, deferred); exclude_self request-flag (wrapper enforces defence-in-depth); cross-vault similarity (single-vault per call); ranking metadata discriminator (collapsed into single `score`).
  - **Practical ceiling**: at `limit: 100`, response size is ~12 KiB — four orders of magnitude below the cli-adapter's 10 MiB cap. Cap-kill effectively unreachable in practice but contractually preserved.

  Carry the `// Original — no upstream.` header is NOT required for `.md` files (Constitution V exempts docs per BI-005 FR-019); follow the existing `docs/tools/*.md` convention.

- [ ] T011 [US5] Edit [docs/tools/index.md](../../docs/tools/index.md): add a one-line entry for `smart_connections_similar` in ASCII-alphabetical position (between `set_property` and `write_note` — verify by reading the file's current entries; ASCII order is `set_property` < `smart_connections_similar` < `write_note`). Format must match the existing convention. Implements the implicit "tool-list discoverability" surface that the help-tool consumes.

**Checkpoint for User Story 5**: docs/tools/smart_connections_similar.md present + indexed; T007's registration tests now pass; full 57-test suite green.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Release mechanics + sanity check + manual smoke.

- [ ] T012 [P] Edit [package.json](../../package.json): bump `version` from `0.5.3` to `0.5.4` (additive surface — PATCH under semver since no existing-tool surface changes). Update the `description` field to mention `smart_connections_similar` alongside the existing typed-tool list (verify by reading the current description; the convention is to list the tool names — extend with `smart_connections_similar` in alphabetical position). Run `npm install` to update `package-lock.json` (if present). Verify by `npm run build` succeeds.

- [ ] T013 [P] Edit [CHANGELOG.md](../../CHANGELOG.md): add a new `## [0.5.4]` section (or append under `## [Unreleased]` per the existing convention — verify by reading the current CHANGELOG structure). Section content per CONTRIBUTING.md's CHANGELOG conventions: headline ("Added: typed `smart_connections_similar` tool — semantic-similarity nearest-neighbour listing for a single named note via the Smart Connections plugin"), one paragraph describing the new surface (input shape with `limit` / `total` + output envelope with block-level matches + plugin-as-runtime-dependency + 8-entry error roster + closed-vault detection), one paragraph naming the design decisions (eval-driven implementation per F2 — no native similarity subcommand; block-level granularity per F5 live-probe amendment to grilling Q3; vault-routing premise correction per F1; closed-vault detection branch per R5a / F7-F9; ADR-013 plugin-namespace tool-naming convention introduced; constitution v1.4.0 amendment adds the seventh Compliance checklist row), references section linking to the spec / plan / tasks / ADR-013. **NOTE**: this is an additive-surface release (no existing-tool changes per FR-026 / SC-019) AND a new-ADR release (ADR-013 introduced) AND a constitution-amendment release (v1.4.0). The ADR-013 and constitution amendments are noted in their own respective sections of the CHANGELOG entry. No migration block (additive surface).

- [ ] T014 [P] Edit [README.md](../../README.md): if the README contains a tools-list section, add a line for `smart_connections_similar` in alphabetical position. If the README mentions the typed-tool count or naming conventions, update to mention the new plugin-namespace prefix convention (ADR-013) alongside ADR-010's single-word convention. If the README does NOT enumerate tools (verify by reading), this task is a no-op for the tools list but may still need updating for the conventions section.

- [ ] T015 Run the full test + quality gates locally:
  1. `npm run lint` → zero warnings (Constitution: lint gate).
  2. `npm run typecheck` → clean (Constitution: TS strict gate).
  3. `npm run build` → succeeds.
  4. `npm run test` → all tests pass including the new 57-case suite for `smart_connections_similar` + the FR-018 baseline fingerprint check + the BI-005 registry-consistency check.
  5. `npm run test:coverage` → aggregate statements floor (91.3% per vitest.config.ts:20) holds or ratchets up. The new module is ~230 LOC source; the 57 co-located tests provide near-100% local coverage so the aggregate either stays flat or ratchets up.

  **TRIGGER**: any gate failure → fix the underlying issue. NEVER bypass with `--no-verify` or threshold adjustment without explicit user approval.

- [ ] T016 Deliberate-fails-first sanity check (S-deliberate-revert per project convention — parity with BI-023 / BI-024 / BI-025). On a fresh local commit (do NOT push):
  1. Temporarily revert ONE of the load-bearing transforms in T004's handler.ts JS_TEMPLATE — pick the source-path-keyed self-exclusion (change `.filter(m => m.path !== sourceKey)` to `.filter(m => m.key !== sourceKey)` — full-key match would miss block-inside-source matches AND the source-level self entry; semantically wrong). Save.
  2. Run `npm run test -- src/tools/smart_connections_similar/handler.test.ts`. EXPECTATION: cases 15 + 16 (self-exclusion source-level / block-inside-source) fail with vitest's structural diff showing the source's blocks leaking into the result.
  3. Revert the change. Run tests again — all pass.
  4. Document the verification by appending a single-line annotation to [research.md](research.md) under a new `## T016 Deliberate-Fails-First Sanity Check (yyyy-mm-dd)` section: "verified the source-path-keyed self-exclusion transform is load-bearing — reverting the `m.path` keying to `m.key` keying causes 2 handler-test failures because block-inside-source matches leak into results."
  5. Do NOT commit the deliberate revert.

  **Purpose**: confirms the test suite actually exercises the transforms — guards against "tests pass because nothing checks the transform" silent regressions.

- [ ] T017 Run the manual end-to-end smoke — DEFERRED (manual gate). Requires MCP Inspector OR Claude Desktop with `TestVault-Obsidian-CLI-MCP` focused AND Smart Connections plugin installed + indexing complete; not run during `/speckit-implement`. Operator runs as the pre-merge final check:
  1. Connect to the local `obsidian-cli-mcp` server (built fresh from T015).
  2. Invoke `smart_connections_similar` against the test vault's `Welcome.md` or a seeded indexed-fixture note; visually confirm the response envelope matches the docs (block-level matches with `headingPath`).
  3. Invoke in active mode against a focused note; confirm equivalence.
  4. Invoke with `total: true`; confirm count-only response.
  5. Invoke with `vault: "NonExistent"`; confirm VAULT_NOT_FOUND structured error (details.reason absent or "unknown").
  6. Close The Setup vault, invoke with `vault: "The Setup"`; confirm VAULT_NOT_FOUND(not-open) structured error AND that the vault transparently opens. Re-open if not already.
  7. Disable Smart Connections plugin in TestVault community-plugins UI, invoke against TestVault; confirm SMART_CONNECTIONS_NOT_INSTALLED. Re-enable.
  8. Invoke with `path: "Sandbox/probe.canvas"` (seed a canvas file first); confirm NOT_MARKDOWN structured error.
  9. Clean up any seeded fixtures.

---

## Dependencies

Story-level ordering (most stories independent, except for the bundled US1/US2/US3/US4 within Phase 3):

- Phase 1 (Setup): empty — skip. Plan-phase deliverables (ADR-013, architecture files, constitution v1.4.0) already shipped during `/speckit-plan`.
- Phase 2 (T001 Live-CLI characterisation): the single MANDATORY pre-impl gate is T0.1 — locks the `NO_ACTIVE_FILE` UpstreamError code that T004's `mapEnvelopeError` references. T0.2 has a pre-impl portion (informs handler stage-0 logic) AND a post-impl portion (verifies end-to-end after T009). T0.3 / T0.4 / T0.5 / T0.6 are post-impl wrapper E2E. T0.7 is OPTIONAL.
- Phase 3 (T002–T009 — User Stories 1/2/3/4 bundled): atomic. Within this phase the dependency graph is:
  - T002 (schema.ts) and T003 (schema.test.ts) [P] — different files, can run in parallel
  - T004 (handler.ts) depends on T002 (imports types) and T001 (T0.1 active-mode code decision)
  - T005 (handler.test.ts) depends on T004
  - T006 (index.ts) depends on T002 + T004
  - T008 (server.ts edit) depends on T006
  - T009 (baseline roll-forward) depends on T008
  - T007 (index.test.ts) depends on T009 + T010
- Phase 4 (T010–T011 — User Story 5): can start in parallel with Phase 3 (docs files are independent). T011 depends on T010.
- Phase 5 (T012–T017): T012 + T013 + T014 [P] independent. T015 depends on Phases 3 + 4 complete. T016 depends on T015. T017 deferred to manual operator.

## Parallel Example: User Story 1 + User Story 5 simultaneously

```bash
# Group A — kick off T001 (live probes — T0.1 most important), T002 (schema source), T003 (schema tests), T010 (docs) in parallel:
Task: "T001 — Live-CLI/plugin characterisation against TestVault-Obsidian-CLI-MCP (7 deferred cases)"
Task: "T002 — Create src/tools/smart_connections_similar/schema.ts with input/output/eval-envelope zod schemas + matchEntrySchema"
Task: "T003 — Create src/tools/smart_connections_similar/schema.test.ts with 20 cases"
Task: "T010 — Create docs/tools/smart_connections_similar.md with ≥4 worked examples + 8-entry error roster + precedence chain + 5 inherited limitations"

# After T001 (T0.1 decision) + T002 (types) land, kick off T004:
Task: "T004 — Create src/tools/smart_connections_similar/handler.ts with frozen JS_TEMPLATE + closed-vault stage-0 detection + base64 payload + multi-stage parse"

# After T004 lands, kick off T005 + T006 in parallel:
Task: "T005 — Create src/tools/smart_connections_similar/handler.test.ts with 32 cases (block-level happy / per-shape transforms / sort / self-exclusion / cross-mode / 8 error paths / 6 precedence-chain fixtures)"
Task: "T006 — Create src/tools/smart_connections_similar/index.ts with createSmartConnectionsSimilarTool factory + SMART_CONNECTIONS_SIMILAR_DESCRIPTION"

# After T006 lands, kick off T008:
Task: "T008 — Edit src/server.ts to import + register createSmartConnectionsSimilarTool (alphabetical: between set_property and write_note)"

# After T008 lands, kick off T009:
Task: "T009 — Run npm run baseline:write to roll forward _register-baseline.json"

# After T009 lands AND T010 lands, kick off T007:
Task: "T007 — Create src/tools/smart_connections_similar/index.test.ts with 5 registration cases"
```

---

## Implementation Strategy

### MVP First (User Story 1 — bundles US2/US3/US4)

1. Skip Phase 1 (no setup needed).
2. Complete Phase 2 (T001 — live-CLI/plugin characterisation of 7 deferred T0 cases, especially the T0.1 active-mode UpstreamError code decision).
3. Complete Phase 3 (T002–T009 — schema + handler + registration + server edit + baseline roll-forward).
4. **STOP and VALIDATE**: run `npm run test` — 52 of 57 tests pass (T007's 5 registration cases require T010 docs to exist). Run T015's full quality-gate sweep early as a smoke check.
5. Defer US5 docs (T010–T011) and Polish (T012–T017) for the next iteration if you want to ship MVP-only. Note: the registry-consistency test from BI-005 will fail without `docs/tools/smart_connections_similar.md`; a minimum docs-stub is required even for MVP. So T010 is effectively part of MVP.

### Incremental Delivery (recommended path)

1. T001 (live probes — T0.1 most important) → T002+T003 (schema) → confirm schema tests pass.
2. T004+T005 (handler) → confirm handler tests pass with the locked T0.1 code AND the new closed-vault stage-0 branch.
3. T006+T008+T009 (registration + server + baseline) → confirm registry baseline test passes.
4. T010+T011 (docs) → confirm registry-consistency test passes.
5. T007 (registration tests) → 57-test ship complete.
6. T012–T014 (release mechanics) → T015 (quality gates) → T016 (sanity check) → T017 (smoke).
7. Open PR.

### Parallel Team Strategy

With multiple developers / agents:

- Dev A: T001 (live probes against TestVault — needs Obsidian focused + access + Smart Connections plugin installed and indexed).
- Dev B: T002+T003 (schema + tests — pure TS, no live CLI).
- Dev C: T010+T011 (docs — independent files).
- Once A+B+C complete, Dev B picks up T004+T005 (handler with the closed-vault stage-0 branch + 6 precedence-chain fixtures), Dev A picks up T006+T008+T009.
- Dev C polishes T007 once T009 lands; everyone converges on T015–T017.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [USx] label maps task to specific user story for traceability per the bundled-stories model.
- The single `smart_connections_similar` module ships US1/US2/US3/US4 simultaneously; US5 is its independent docs ship.
- Verify tests fail before implementing — once per BI via T016's deliberate-fails-first sanity check.
- Commit after each task or each logical group per the project's commit-on-invocation convention.
- Stop at any checkpoint to validate independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
- **Plan-phase deliverables shipped during `/speckit-plan`** (not in this tasks.md): ADR-013 created at `.decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md` (gitignored repo mirror); Decision Log row added; architecture snapshot file populated at `.architecture/Obsidian CLI MCP - Architecture with Smart Connections.md`; canonical base architecture file rolled forward at `.architecture/Obsidian CLI MCP - Architecture.md`; constitution amended v1.3.0 → v1.4.0 with the seventh Compliance checklist row for ADR-013; CLAUDE.md active-narrative rotated 025→026. No T-tasks are needed for these deliverables since they're already in the repo at commit `7fc863e` (constitution) / `acd0438` (CLAUDE.md) / earlier scaffold commits.
