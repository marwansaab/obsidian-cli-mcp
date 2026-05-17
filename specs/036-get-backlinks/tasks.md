---
description: "Task list for 036-get-backlinks — Inbound-Reference Inventory for a Single Note"
---

# Tasks: Backlinks — Inbound-Reference Inventory for a Single Note

**Input**: Design documents from [`/specs/036-get-backlinks/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT a separate red/green TDD loop; every implementation task lands with its co-located test cases in the same task. Total target: ~57 tests across the new module (~22 schema / ~30 handler / ~5 registration) per [data-model.md § Test inventory](data-model.md#test-inventory). Test scope is unit-only (per project memory `feedback_test_scope`); manual / TC-XXX cases live in the user's external tracker.

**Organization**: Tasks are grouped by user story per the project convention. The `backlinks` module is fundamentally a **single atomic ship** — Stories 1, 2, 3, 4, 5 share the same four source files (`schema.ts`, `_template.ts`, `handler.ts`, `index.ts`) and the same monolithic eval template (parity with BI-025); Story 6 is the documentation layer. The `[USx]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md § Test inventory](data-model.md#test-inventory) maps each test case to its source User Story.

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code):

- **R1 — `eval` subcommand load-bearing (NOT native `backlinks`)**: presumed plain-text-only by analogy with BI-025's `links` gap. F1 below confirms at T0. The wrapper routes through `obsidian eval code=<rendered-js>` to access `app.metadataCache.getBacklinksForFile(file)` directly. Parity with BI-014 / BI-015 / BI-025 eval cohort.
- **R2 — Single-call architecture branched at envelope-emission**: ONE `invokeCli` invocation per request. Same eval JS in all mode combinations; the `a.with_counts` / `a.total` / `a.limit` branches live INSIDE the eval at envelope-emission. Cross-mode invariant (FR-005a per the 2026-05-17 Q1 clarification) holds by construction — count-only mode bypasses the cap and reports the full pre-cap source-note count.
- **R3 — `.md`-only source-corpus post-filter inside eval** (FR-020a per the 2026-05-17 Q2 clarification): regex `/\.md$/i` on `getBacklinksForFile().data` keys; `.canvas` / `.base` / plugin-config / attachment sources are excluded BEFORE the per-source aggregation, sort, cap, or envelope-emission steps.
- **R5 — Unknown-vault response inspection ACTIVE for `eval`**: cohort-determined by execution path. The 011-R5 clause FIRES for `backlinks` per the eval-cohort precedent (BI-014 / BI-015 / BI-025). F2 below confirms at T0.
- **R6 — Per-source aggregation via `data[p].length`**: `getBacklinksForFile(f).data` keys are source-note paths; values are `LinkCache[]` arrays. Under `with_counts: true`, the per-source `count` is the array length. Obsidian's combined cache already includes body + frontmatter + embeds uniformly (F3 confirms at T0), so the count uniformly aggregates across all reference kinds. Aliased wikilinks attribute to the resolved target via Obsidian's link resolver (FR-015). `count: 0` is impossible — sources only appear in the dict if they have at least one reference.
- **R7 — Self-reference inclusion** (FR-013): the eval does NOT filter the source-keys list against the target's own path. A target that links to itself appears in its own backlinks list, matching Obsidian's "Backlinks" pane semantic.
- **R8 — Code-block-only references excluded by inheritance** (FR-014): Obsidian's link parser already excludes fenced/indented code-block tokens from the cache. F4 confirms at T0.
- **R9 — Implicit-cap + `truncated` flag inside eval** (FR-010 + FR-011 per Q1): the cap applies ONLY when `!a.total`. Under `a.total`, cap is set to `preCapCount` (no-op slice). `truncated` is NEVER present in `total: true` mode.
- **R12 — Base64 anti-injection**: frozen JS template with single `__PAYLOAD_B64__` substitution. User-supplied `path` / `file` / `target_mode` / `with_counts` / `total` / `limit` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime`. No user input ever reaches the JS source as text. Parity with BI-014 / BI-015 / BI-025.
- **Q1–Q2 clarifications session 2026-05-17** (codified in spec.md): Q1 `total: true` bypasses the FR-010 cap and reports the full pre-cap source count; Q2 source corpus restricted to `.md` files only (case-insensitive on extension). BOTH locked at clarification stage; T0 probes will sanity-check the load-bearing behaviour against the live vault.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list).
- **[Story]**: Which user story this task primarily delivers. Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative.

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `links` / `outline` / `properties` / `read` / `read_heading` / `read_property` / `set_property` / `rename` / `write_note` / `find_by_property` / `delete` / `files` / `context_search`). All paths are relative to the repo root. Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at `src/tools/backlinks/` (does NOT exist yet — created by T002–T008).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–035). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler against verified upstream behaviour for the four plan-stage findings (F1..F4) deferred from plan stage (per [research.md § Plan-stage live-CLI probes](research.md#plan-stage-live-cli-probes-to-be-executed-before-speckit-tasks)).

**⚠️ CRITICAL**: T001 below MUST complete before user story work begins; the eval-vs-native execution-path choice (R1) depends on F1, and the unknown-vault cohort placement (R5) depends on F2. If F1 surfaces native JSON support with per-source counts, the plan is revised; if F2 surfaces a different unknown-vault outcome, FR-018 is amended.

- [ ] T001 Live-CLI characterisation of F1..F4 against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  - **(F1) Upstream `obsidian backlinks` subcommand shape**: run `obsidian help backlinks` on the host machine. Document whether the subcommand exists, whether it documents a `format=json` flag, whether per-source counts are emitted natively, and whether vault-relative source-paths are returned with `.md`-only filtering or include all extensions. **TRIGGER**: if F1 reveals native JSON with per-source counts, the plan's R1 (eval-vs-native) is revised — switch the handler's `composeEvalCode` call to a parameter-passing call to `invokeCli({command: "backlinks", parameters: {...}})`. The wrapper-side aggregation, sort, cap, and envelope-emission logic stays IDENTICAL. The R5 cohort placement also flips to inherited-limitation surface (would require spec amendment to FR-018). If F1 confirms plain-text only (expected), plan proceeds as written.

  - **(F2) Unknown-vault behaviour via eval (R5 confirmation)**: run `obsidian vault=NonExistent eval code="(()=>{return 'probe';})()"` on the host. Document stdout, stderr, exit code, and how the cli-adapter classifies the result. **Expected**: stdout `Vault not found.` (exit 0); cli-adapter's 011-R5 clause fires; classified as `CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')`. **TRIGGER**: if F2 deviates, revisit R5 and potentially flip the cohort placement (would require spec amendment to FR-018).

  - **(F3) Frontmatter-link inclusion in `getBacklinksForFile()` (R6 verification)**: seed `Sandbox/backlinks-F3-target.md` (empty body, no frontmatter); seed `Sandbox/backlinks-F3-source.md` with body `Reference to [[backlinks-F3-target]] in body.` AND frontmatter `---\nrelated: "[[backlinks-F3-target]]"\n---`. Open TestVault. Probe via eval: `obsidian vault=TestVault-Obsidian-CLI-MCP eval code="(()=>{const f=app.vault.getFiles().find(x=>x.path==='Sandbox/backlinks-F3-target.md');const d=app.metadataCache.getBacklinksForFile(f);return JSON.stringify({data_keys:Object.keys(d.data||{}),source_count:(d.data['Sandbox/backlinks-F3-source.md']||[]).length});})()"`. **Expected**: `data_keys` includes `Sandbox/backlinks-F3-source.md`; `source_count === 2` (one LinkCache entry for the body wikilink, one for the frontmatter wikilink). **TRIGGER**: if frontmatter is NOT counted, revisit R6 — the eval would need a frontmatter-merge step. FR-016 still holds at the source-presence level. Document the actual count. Clean up fixtures.

  - **(F4) Code-block exclusion (R8 verification)**: seed `Sandbox/backlinks-F4-target.md` (empty body); seed `Sandbox/backlinks-F4-codeonly.md` with body:
    ````
    Documentation example:
    ```
    [[backlinks-F4-target]]
    ```
    No real reference here.
    ````
    Open TestVault. Probe via eval: `obsidian vault=TestVault-Obsidian-CLI-MCP eval code="(()=>{const f=app.vault.getFiles().find(x=>x.path==='Sandbox/backlinks-F4-target.md');const d=app.metadataCache.getBacklinksForFile(f);return JSON.stringify({data_keys:Object.keys(d.data||{})});})()"`. **Expected**: `data_keys` does NOT include `Sandbox/backlinks-F4-codeonly.md` — Obsidian's link parser excludes code-block-only tokens from the backlinks cache. **TRIGGER**: if CodeOnly IS a key, revisit R8 — the wrapper would need an additional source-side scan, OR FR-014 would need amendment to defer to Obsidian's observed behaviour. Document the actual keys. Clean up fixtures.

**Checkpoint**: Foundational characterisation complete. Eval-vs-native execution path locked; unknown-vault cohort confirmed; frontmatter-inclusion semantic verified; code-block exclusion semantic verified. User-story implementation can now begin. If any probe surfaces a TRIGGER, pause and update the spec / plan before proceeding to T002.

---

## Phase 3: User Story 1 — Backlinks listing for a named target note (Priority: P1) 🎯 MVP

**Goal**: Add the typed `backlinks` MCP tool surface that returns `{ count, backlinks: [{ source, count? }], truncated? }` for a single named target note. Covers FR-001..FR-008, FR-013..FR-018, FR-020..FR-025, FR-027..FR-030 (named-target happy path + per-source aggregation + source-corpus restriction + self-reference inclusion + code-block exclusion + alias attribution + frontmatter inclusion + deterministic order + non-`.md` rejection + unresolved-locator + unknown-vault + read-tool no-echo + attribution).

**Independent Test**: invoke `backlinks({ target_mode: 'specific', vault: '<vault>', path: '<.md path>' })` against a target carrying a known set of inbound references; assert response shape `{ count, backlinks: [...] }` with correct per-entry `source` values in deterministic order. Per [quickstart.md](quickstart.md) Q-1.

> **Note on bundled stories**: T002–T008 below are the single source implementation that delivers Stories 1, 2, 3, 4, 5 in one atomic ship (parity with BI-025 — the eval template is monolithic and cannot be incrementally extended). The `[US1]` tag marks primary-story attribution; US2/US3/US4/US5 are sub-stories of the same module and ride along (no separate code paths). Story-tag breakdown by file:
>
> - schema.ts → US1 (default-mode shape) + US2 (active-mode discriminator branch) + US3 (validation refinement: XOR locator, vault-required-in-specific, active-mode-forbid, limit range, strict additionalProperties) + US4 (with_counts boolean field) + US5 (total boolean field, limit integer field)
> - _template.ts → US1 (target resolver + .md-source filter + sort + envelope emission) + US2 (active-mode resolver branch) + US4 (per-source count under with_counts) + US5 (cap + truncated + total-mode cap-bypass per Q1)
> - handler.ts → US1 (single invokeCli + JSON parse + envelope-error mapping)
> - index.ts → US1 (registration)
> - docs/tools/backlinks.md → US6 (documentation, deferred to Phase 8)

### Implementation for User Story 1 (MVP — bundled with US2/US3/US4/US5)

- [ ] T002 [P] [US1] Create [src/tools/backlinks/schema.ts](../../src/tools/backlinks/schema.ts) per [data-model.md § Input shape](data-model.md#input-shape-backlinksinputschema). Export `backlinksInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ with_counts: z.boolean().optional(), total: z.boolean().optional(), limit: z.number().int().min(1).max(10000).optional() }))` — consumes `targetModeBaseSchema` + `applyTargetModeRefinement` from `../../target-mode/target-mode.js` per ADR-003. Export `backlinkEntrySchema = z.object({ source: z.string(), count: z.number().int().positive().optional() }).strict()`. Export `backlinksOutputSchema = z.object({ count: z.number().int().nonnegative(), backlinks: z.array(backlinkEntrySchema), truncated: z.boolean().optional() }).strict()`. Export `BACKLINKS_EVAL_ERROR_CODES = ['NO_ACTIVE_FILE','FILE_NOT_FOUND','NOT_MARKDOWN'] as const` and `backlinksEvalResponseSchema = z.discriminatedUnion('ok', [z.object({ok:z.literal(true), count: z.number().int().nonnegative(), backlinks: z.array(backlinkEntrySchema), truncated: z.boolean().optional()}).strict(), z.object({ok:z.literal(false), code: z.enum(BACKLINKS_EVAL_ERROR_CODES), detail: z.string()}).strict()])`. Inferred types: `BacklinksInput` / `BacklinksOutput` / `BacklinkEntry` / `BacklinksEvalResponse` / `BacklinksEvalErrorCode` via `z.infer`. Carry the `// Original — no upstream. backlinks input/output/eval-envelope schemas — standard target-mode refinement extended with optional with_counts/total/limit; strict per-entry shape carries source + optional count; discriminated-union eval-envelope wire format mirrors the in-eval IIFE return shape including optional truncated field.` header per Constitution V (FR-030).

- [ ] T003 [P] [US1] Create [src/tools/backlinks/schema.test.ts](../../src/tools/backlinks/schema.test.ts) with ~22 cases per [data-model.md § schema.test.ts](data-model.md#schematestts-22-cases). Cases: (1) specific+vault+path happy; (2) specific+vault+file happy; (3) specific+vault+path+`with_counts:true` happy; (4) specific+vault+path+`total:true` happy; (5) specific+vault+path+`limit:50` happy; (6) active (no other fields) happy; (7) specific without vault → validation fail; (8) specific without file AND path → validation fail (US3-1 — user spec's "neither name nor focus"); (9) specific with BOTH file AND path → validation fail (US3-4); (10) active with file → validation fail (US3-2 — user spec's "both name and focus"); (11) active with path → validation fail; (12) active with vault → validation fail; (13) unknown top-level key → validation fail (US3-5); (14) `with_counts: "true"` (string) → validation fail (US3-6); (15) `total: "true"` (string) → validation fail; (16) `limit: 0` → validation fail (US3-7); (17) `limit: -1` → validation fail; (18) `limit: 10001` → validation fail; (19) `limit: 1.5` (non-integer) → validation fail; (20) `target_mode: "focused"` (unknown enum) → validation fail (US3-9); (21) `target_mode` missing → validation fail (US3-9); (22) JSON Schema round-trip via `toMcpInputSchema` emits expected shape with `additionalProperties: false`. Each failing case is asserted with a dispatcher spy (`vi.fn()`) that MUST NEVER be called — locks FR-021 structurally. Carry `// Original — no upstream. backlinks schema tests.` header.

- [ ] T004 [P] [US1] Create [src/tools/backlinks/_template.ts](../../src/tools/backlinks/_template.ts) per [data-model.md § Frozen JS template](data-model.md#frozen-js-template-_templatets). Export `JS_TEMPLATE` as the literal string defined in data-model.md — a synchronous IIFE that: (a) decodes the base64 payload via `B64_PAYLOAD_DECODE_EXPR` (imported from `../_shared.js`); (b) resolves the target file via the three-branch resolver (`a.active ? app.workspace.getActiveFile() : a.path ? app.vault.getFiles().find(x=>x.path===a.path) : app.metadataCache.getFirstLinkpathDest(a.file,'')`), surfacing `NO_ACTIVE_FILE` / `FILE_NOT_FOUND` envelope errors when resolution fails (R4 / FR-019); (c) applies the `f.extension==='md'` guard surfacing `NOT_MARKDOWN` envelope error (R4 / FR-020); (d) calls `app.metadataCache.getBacklinksForFile(f)` and reads `.data`; (e) filters source keys via `/\.md$/i` (R3 / FR-020a per Q2); (f) sorts via JavaScript default `.sort()` (R10 / FR-008 — UTF-16 code-unit ascending); (g) computes the effective cap (`a.total ? preCapCount : (a.limit || 1000)` — R9 / Q1 cap-bypass under total); (h) slices to cap; (i) builds entries with optional `count: (data[p] || []).length` under `a.with_counts` (R6); (j) emits `{ok:true, count: a.total ? preCapCount : entries.length, backlinks: a.total ? [] : entries, truncated: (!a.total && preCapCount > cap) ? true : undefined}` (R9 / FR-005a). Carry `// Original — no upstream. Frozen JS template for the eval subcommand — base64 payload anti-injection (R12); reads app.metadataCache.getBacklinksForFile(file).data (R6); .md-only source-corpus post-filter (R3 per the 2026-05-17 Q2 clarification); per-source aggregation length under with_counts; cap-and-truncated handling with total-mode cap-bypass per the 2026-05-17 Q1 clarification (R9); UTF-16 source-path sort (R10).` header.

- [ ] T005 [US1] Create [src/tools/backlinks/handler.ts](../../src/tools/backlinks/handler.ts) per [data-model.md § Handler shape](data-model.md#handler-shape-handlerts). Export `executeBacklinks(input: BacklinksInput, deps: ExecuteDeps): Promise<BacklinksOutput>`. Logic:

  1. **Payload assembly** per [data-model.md § Payload shape](data-model.md#payload-shape-the-base64-encoded-json-passed-to-the-eval): `payload = { active: input.target_mode === 'active', path: input.target_mode === 'specific' ? input.path ?? null : null, file: input.target_mode === 'specific' ? input.file ?? null : null, with_counts: input.with_counts === true, total: input.total === true, limit: input.limit ?? null }`. Render via `composeEvalCode(JS_TEMPLATE, payload)` (imported from `../_shared.js`).

  2. **ONE `invokeCli` invocation** (R2 / single-spawn invariant): `await invokeCli({ command: 'eval', vault: input.target_mode === 'specific' ? input.vault : undefined, parameters: { code }, flags: [], target_mode: input.target_mode }, { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })`.

  3. **Stage 0 — strip eval prefix**: `let stdout = result.stdout.trimStart(); if (stdout.startsWith('=> ')) stdout = stdout.slice(3);`.

  4. **Stage 1 — JSON.parse**: try/catch; on failure throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', cause: err, details: { stage: 'json-parse', stdout: result.stdout.slice(0, 500) }, message: 'backlinks: eval response is not JSON: ' + result.stdout.slice(0, 200) })`.

  5. **Stage 2 — envelope safeParse**: `const validated = backlinksEvalResponseSchema.safeParse(parsedJson);` on failure throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', cause: validated.error, details: { stage: 'envelope-parse', stdout: result.stdout.slice(0, 500) }, message: 'backlinks: eval response shape unexpected' })`.

  6. **Stage 3 — discriminate on `ok`**: if `validated.data.ok === true`, build output as `{ count, backlinks }` and conditionally attach `truncated: true` if `validated.data.truncated === true`; return. If `validated.data.ok === false`, call `mapEnvelopeError(validated.data.code, validated.data.detail)` and throw. The map: `NO_ACTIVE_FILE` → `ERR_NO_ACTIVE_FILE` (BI-025 precedent — T0.2-equivalent decision already locked at plan stage per R4); `FILE_NOT_FOUND` → `CLI_REPORTED_ERROR(details: { stage: 'envelope-error', code: 'FILE_NOT_FOUND', detail })`; `NOT_MARKDOWN` → `CLI_REPORTED_ERROR(details: { stage: 'envelope-error', code: 'NOT_MARKDOWN', detail })`. The switch is exhaustive over `BACKLINKS_EVAL_ERROR_CODES` via TypeScript's discriminated union exhaustiveness check.

  Type definitions: `ExecuteDeps = { logger: Logger; queue: Queue; spawnFn?: SpawnLike; env?: NodeJS.ProcessEnv }`. Carry `// Original — no upstream. backlinks handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R12 anti-injection); R2/R9 single-call architecture; two-stage parse step (JSON.parse → backlinksEvalResponseSchema.safeParse) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse failure; envelope ok:false → UpstreamError mapping per R13 (NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE for BI-015 / BI-014 / BI-025 parity; FILE_NOT_FOUND / NOT_MARKDOWN → CLI_REPORTED_ERROR with details.stage='envelope-error').` header.

- [ ] T006 [US1] Create [src/tools/backlinks/handler.test.ts](../../src/tools/backlinks/handler.test.ts) with ~30 cases per [data-model.md § handler.test.ts](data-model.md#handlertestts-30-cases). Inject stub `invokeCli` via `deps.spawnFn` stub returning `{stdout: '=> ' + JSON.stringify(envelopeFixture), stderr: '', exitCode: 0}` per the cli-adapter test-seam convention (mirror BI-025's pattern). Per-test assertions: (a) `spawnFn.mock.calls.length === 1` (single-spawn invariant per R2); (b) for any test exercising the payload, decode `code=` argv via base64 → assert the decoded payload matches the user input bit-for-bit (R12 anti-injection structural lock); (c) for envelope-error tests, assert the thrown UpstreamError carries the correct `code` AND `details.stage` AND `details.code` AND `details.detail`.

  **US1 happy paths** (1) default mode 3 sources → response `{count:3, backlinks:[3 entries with source only]}`; (5) by-basename equivalent to by-path; (6) zero backlinks → `{count:0, backlinks:[]}`.

  **US1 corpus + structural** (FR-013, FR-014, FR-020, FR-020a): (14) code-block-only reference excluded (eval envelope synthesised to OMIT the code-block-only source from `.data` — Obsidian's parser already excludes — assert that source is absent from response; per F4); (15) self-reference inclusion (eval envelope synthesised WITH target's own path as a `.data` key — assert source includes target's path); (16) `.canvas` source excluded under default mode (eval envelope synthesised with both `.md` and `.canvas` keys — assert only `.md` source in response — per R3 / Q2); (17) mixed `.md` + `.canvas` sources (5 `.md` + 5 `.canvas` — assert response carries 5 `.md` entries only); (18) target locator pointing at `.pdf` → eval envelope `{ok:false, code:'NOT_MARKDOWN', detail:'path: ... extension: pdf'}` → wrapper throws `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')`; (19) target locator pointing at `.canvas` → same path with `extension: canvas`.

  **US1 error paths**: (20) unresolved `path` → eval envelope `{ok:false, code:'FILE_NOT_FOUND', detail:'path: <X>'}` → wrapper throws `CLI_REPORTED_ERROR(stage:'envelope-error', code:'FILE_NOT_FOUND')`; (21) unresolved `file` basename → eval envelope `FILE_NOT_FOUND` with `wikilink:` detail; (23) unknown vault — stub `invokeCli` (via spawnFn) rejects with `UpstreamError(CLI_REPORTED_ERROR, details.code='VAULT_NOT_FOUND')` simulating the 011-R5 clause output → assert error propagates verbatim; (24) stdout non-JSON — stub stdout `=> not valid json` → assert wrapper throws `CLI_REPORTED_ERROR(stage:'json-parse')`; (25) envelope shape unknown — stub stdout `=> {"ok":true,"count":5,"backlinks":[],"surprise":"extra"}` → assert `CLI_REPORTED_ERROR(stage:'envelope-parse')`.

  **US2 active-mode**: (4) active happy → eval envelope shaped like specific mode but resolved via `app.workspace.getActiveFile()` — assert response matches the focused note's backlinks; (22) active + no focused → eval envelope `{ok:false, code:'NO_ACTIVE_FILE'}` → assert wrapper throws `ERR_NO_ACTIVE_FILE`.

  **US3 validation safety-net** (handler-level): (consolidated test) — parametrise over the 9 invalid input shapes from US3 scenarios 1-9 (mirrors schema.test.ts coverage); for each, assert the spawnFn spy is NEVER called (FR-021). This is a defence-in-depth assertion; the primary schema-rejection assertions live in T003.

  **US4 per-source counts**: (2) happy `with_counts:true` 3 sources each with count → response entries each carry positive `count`; (9) same source N references across N lines → ONE entry with `count: N` (per FR-007); (10) same source 2 references on SAME line → ONE entry with `count: 2`; (11) aliased wikilink only → entry carries `count: 1` (FR-015 — alias text NEVER in response); (12) frontmatter-only reference → source appears with `count: 1` (FR-016); (13) mixed body + frontmatter from one source → ONE entry with `count` summing both contexts.

  **US5 cap + truncated + total-bypass**: (3) `total:true` happy with 3 sources → `{count:3, backlinks:[], NO truncated}`; (7) zero backlinks with `with_counts:true` → `{count:0, backlinks:[]}` (no error); (8) zero backlinks with `total:true` → `{count:0, backlinks:[]}` (no error); (26) cap-and-truncate default cap: eval envelope with 1000 entries + `truncated:true` (simulating 1500-source post-cap state); assert response carries 1000 entries AND `truncated: true`; (27) cap-and-truncate explicit `limit:50`: eval envelope with 50 entries + `truncated:true` (and payload's `limit:50` field decoded correctly); assert response carries 50 entries AND `truncated: true`; (28) cap-bypass under `total:true` (per Q1 / FR-005a): eval envelope with `{count:1500, backlinks:[], NO truncated}` (1500 pre-cap sources, count-only mode); assert response carries `count:1500, backlinks:[]` AND `truncated` is ABSENT; (29) output-cap kill — stub `invokeCli` rejects with `UpstreamError(CLI_NON_ZERO_EXIT)` simulating the cli-adapter's 10 MiB output-cap-kill; assert handler propagates verbatim (FR-024).

  **Deterministic + invariants**: (30) byte-identical repeated call: same input + same stub envelope → `JSON.stringify(r1) === JSON.stringify(r2)` (FR-008 / SC-018); response-key-set invariant: assert `Object.keys(response).sort()` is exactly `["backlinks", "count"]` for non-truncated, `["backlinks", "count", "truncated"]` for truncated, never includes locator inputs (FR-025 / SC-029).

  Carry `// Original — no upstream. backlinks handler tests.` header.

- [ ] T007 [US1] Create [src/tools/backlinks/index.ts](../../src/tools/backlinks/index.ts) per [data-model.md § Registration shape](data-model.md#registration-shape-indexts). Export `createBacklinksTool(deps: RegisterDeps): RegisteredTool` via the `registerTool` factory (parity with `outline` / `properties` / `read` / `read_heading` / `links`). Export `BACKLINKS_TOOL_NAME = "backlinks"` constant. Export `BACKLINKS_DESCRIPTION` string — the full one-paragraph description from [data-model.md § Registration shape](data-model.md#registration-shape-indexts) (covers: typed envelope shape; `target_mode` discriminator + optional `with_counts` / `total` / `limit` switches; the Q1 total-mode cap-bypass note; the Q2 `.md`-only source-corpus restriction note; self-reference inclusion; alias attribution; frontmatter inclusion; code-block exclusion; non-`.md` target rejection; unknown-vault structured error; cross-pointer to `help({ tool_name: "backlinks" })`; cross-pointer to the outgoing-links sibling `links`). Carry `// Original — no upstream. backlinks tool registration via registerTool — link-graph primitive returning a typed { count, backlinks: [{ source, count? }], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.` header.

- [ ] T008 [P] [US1] Create [src/tools/backlinks/index.test.ts](../../src/tools/backlinks/index.test.ts) with ~5 cases: (1) factory returns a `RegisteredTool` with `name === "backlinks"` and `description.length > 0`; (2) `descriptor.inputSchema` round-trips through `toMcpInputSchema` with `additionalProperties: false`; (3) `descriptor.description.length > 200` (worked-example budget); (4) deps wired through to handler invocations (smoke test against a stubbed `invokeCli`); (5) description contains the cross-pointer phrase referencing `links` (BI-025). Carry `// Original — no upstream. backlinks registration tests.` header.

- [ ] T009 [US1] Modify [src/server.ts](../../src/server.ts) — add `createBacklinksTool` import (between the existing alphabetical imports — `backlinks/` comes BEFORE `context_search/` because `b` < `c`) and a registration entry in the `tools: RegisteredTool[]` array: `createBacklinksTool({ logger, queue })`. Position the entry alphabetically before `createContextSearchTool({ logger, queue })`. Two-line touch only (one import + one array entry).

- [ ] T010 [US1] Regenerate [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) via the project's canonical regenerator: run `npm run baseline:write` (which executes `scripts/write-register-baseline.ts`) AFTER T009's `server.ts` change is in place. The script produces the canonical JSON including fingerprint hashes for the new `backlinks` entry. Do NOT hand-edit the JSON file. The helper module `src/tools/_register-baseline.ts` (fingerprint utilities) is NOT touched.

**Checkpoint**: US1 fully functional. Tool registered; schema parses; handler computes per-source backlinks via the eval template; tests pass against stubbed CLI responses. MVP shippable when T002–T010 pass (covers all five P1 stories' code paths bundled into one ship). The handler returns `{count, backlinks}` for valid inputs; throws structured `UpstreamError` for every failure mode; never silent-fails. Per-source counts (`with_counts`), count-only mode (`total`), explicit cap (`limit`), and truncation signal are all live via the bundled implementation.

---

## Phase 4: User Story 2 — Backlinks listing for the focused note (Priority: P1)

**Goal**: Active-mode invocation returns the focused note's backlinks; no-focused-file surfaces a structured `ERR_NO_ACTIVE_FILE`.

**Independent Test**: Per [quickstart.md](quickstart.md) Q-2 / Q-3.

**Implementation**: bundled with US1 (the `a.active` branch lives inside `_template.ts` per T004; the `ERR_NO_ACTIVE_FILE` mapping lives inside `handler.ts` per T005's stage-3 envelope mapping). Tests covering US2 paths (handler.test.ts cases 4 and 22) are part of T006's bundled test inventory.

No additional implementation tasks. US2 ships with the US1 bundled ship.

**Checkpoint**: US2 fully functional. Active mode resolved via `app.workspace.getActiveFile()` in the eval template; no-active-file surfaces `ERR_NO_ACTIVE_FILE` UpstreamError. T006 cases 4 + 22 pass.

---

## Phase 5: User Story 3 — Validation rejects malformed inputs at the boundary (Priority: P1)

**Goal**: Schema validation fires for every invalid input shape BEFORE any CLI invocation; the user spec's "neither name nor focus" and "both name and focus" rejection contracts are satisfied by the standard target_mode discriminator XOR rules (ADR-003).

**Independent Test**: Per [quickstart.md](quickstart.md) Q-15.

**Implementation**: bundled with US1 (the `applyTargetModeRefinement` superRefine fires for all US3 scenarios 1-2, 3-7, 8-9; the schema's `.strict()` clause catches unknown top-level keys; the zod range constraints catch invalid `limit` values). Tests covering US3 paths live in T003 (schema.test.ts — full validation roster as 22 cases) and T006 (handler.test.ts — the consolidated dispatcher-spy-never-called assertion under "US3 validation safety-net"). The path-traversal contract (US3 scenario 8) is implicitly verified by the eval JS's `app.vault.getFiles().find` step (returns null for any `../..` path, surfacing `FILE_NOT_FOUND` envelope error) — no schema-layer regex guard needed (matches BI-025 precedent).

No additional implementation tasks. US3 ships with the US1 bundled ship.

**Checkpoint**: US3 fully functional. All 9 invalid input shapes fail validation BEFORE any CLI invocation. T003 cases 7-21 pass; T006's US3 consolidated assertion passes.

---

## Phase 6: User Story 4 — Per-source multiplicity opt-in (Priority: P2)

**Goal**: `with_counts: true` decorates each per-source entry with an integer `count` reflecting the number of references from that source to the target.

**Independent Test**: Per [quickstart.md](quickstart.md) Q-4 / Q-5 / Q-6.

**Implementation**: bundled with US1 (the `a.with_counts` branch lives inside `_template.ts` per T004's per-source aggregation step `if (a.with_counts) e.count = (data[p] || []).length`). Tests covering US4 paths (handler.test.ts cases 2, 9, 10, 11, 12, 13) are part of T006's bundled test inventory.

No additional implementation tasks. US4 ships with the US1 bundled ship.

**Checkpoint**: US4 fully functional. Per-source counts present under `with_counts: true`; absent otherwise; aliased and frontmatter references attributed uniformly to the resolved target. T006 cases 2, 9, 10, 11, 12, 13 pass.

---

## Phase 7: User Story 5 — Truncation signal for outsized result sets (Priority: P2)

**Goal**: Implicit 1000-source cap (FR-010); explicit `limit` override (`1..10000`); `truncated: true` signal when the underlying source set exceeds the applied cap; `total: true` bypasses the cap and reports the full pre-cap count (per Q1 / FR-005a).

**Independent Test**: Per [quickstart.md](quickstart.md) Q-10a / Q-10b / Q-11.

**Implementation**: bundled with US1 (the cap-and-truncated logic lives inside `_template.ts` per T004's `cap = a.total ? preCapCount : (a.limit || 1000)` + `if (!a.total && preCapCount > cap) env.truncated = true` steps). Tests covering US5 paths (handler.test.ts cases 3, 7, 8, 26, 27, 28, 29) are part of T006's bundled test inventory. **Case 28 is the load-bearing test for Q1**: verifies `total: true` against a 1500-source vault returns `count: 1500, backlinks: [], NO truncated`.

No additional implementation tasks. US5 ships with the US1 bundled ship.

**Checkpoint**: US5 fully functional. Implicit cap + explicit limit + truncated flag all live; count-only mode bypasses cap per Q1; output-cap kill propagates verbatim per FR-024. T006 cases 3, 7, 8, 26, 27, 28, 29 pass.

---

## Phase 8: User Story 6 — Documentation surface (Priority: P3)

**Goal**: Progressive-disclosure help facility surfaces full input contract, output shape (default / with_counts / total / truncated), failure-mode roster, practical ceiling, at least four worked examples, AND cross-pointer to outgoing-links sibling `links` (BI-025).

**Independent Test**: Per [quickstart.md](quickstart.md) — `help({ tool_name: "backlinks" })` returns the full documentation block.

### Implementation for User Story 6

- [ ] T011 [US6] Create [docs/tools/backlinks.md](../../docs/tools/backlinks.md) (~200 lines) per FR-026 surface requirements. Sections: (1) one-paragraph "what it does" intro + cross-pointer to `links` (BI-025); (2) full per-field input contract (target_mode, vault, file, path, with_counts, total, limit — types, defaults, semantics, range constraints); (3) output shape for default / `with_counts: true` / `total: true` / truncated / self-reference variants (mirror [contracts/output.md](contracts/output.md)'s 9 variants verbatim); (4) failure-mode roster (mirror [contracts/errors.md](contracts/errors.md)); (5) at least four worked examples covering at least four distinct usage modes from {specific-mode-by-path, specific-mode-by-file, active-mode, with-counts, count-only, unresolved-locator error, no-active-file error, validation rejection} (recommended: pull verbatim from [quickstart.md](quickstart.md) Q-1 / Q-2 / Q-4 / Q-10b / Q-12); (6) practical ceiling notes — explicit 1000-source implicit cap (FR-010), 10 MiB output-cap kill (FR-024), `total: true` cap-bypass (Q1); (7) self-reference note (FR-013 — included by design); (8) frontmatter-inclusion note (FR-016 — uniform with body); (9) `.md`-only source-corpus note (FR-020a / Q2 — `.canvas` excluded); (10) multi-vault structured-error note (FR-018 — eval-cohort); (11) cross-pointer to outgoing-links sibling `links` (BI-025 — "for the dual direction, use `links`"). NO `// Original — no upstream.` header (docs files are exempt per BI-005 FR-019 / convention).

- [ ] T012 [US6] Modify [docs/tools/index.md](../../docs/tools/index.md) — add a one-line summary entry for `backlinks` (alphabetical insertion). Mirror the existing entries' format. Example seed: `- [backlinks](backlinks.md) — return source notes referencing a target Markdown note (inverse of [links](links.md))`.

**Checkpoint**: US6 fully functional. The BI-005 registry-consistency test (`src/tools/help/help.test.ts` or equivalent — verify the existing test surface) auto-asserts that every registered tool has a `docs/tools/<name>.md` file; the `assertToolDocsExist` aggregator at `src/tools/_register.ts` fires at boot. With T011 in place, the boot-time assertion passes.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final release plumbing, quality gates, and pre-merge verification.

- [ ] T013 [P] Modify [CHANGELOG.md](../../CHANGELOG.md) — add a release entry under the next unreleased version section. Format mirror BI-035 / BI-025 entries:
  ```
  ## [0.6.4] - 2026-MM-DD
  
  ### Added
  - `backlinks` typed tool — returns source notes referencing a target Markdown note. Inverse of `links` (BI-025); together they give complete 1-hop link-graph reads from any note. Optional `with_counts` decorates entries with per-source multiplicity; optional `total` returns count only (bypasses the implicit 1000-source cap per spec Clarification 2026-05-17 Q1); optional `limit` overrides the implicit cap in range 1..10000. Source corpus restricted to `.md` files only (per spec Clarification 2026-05-17 Q2). Self-references are included (matching Obsidian's Backlinks pane). See `docs/tools/backlinks.md` for the full input contract and worked examples. Thirteenth eval-cohort tool; nineteenth typed-tool wrap overall. Zero new top-level error codes (Constitution Principle IV streak preserved). (BI-036)
  ```

- [ ] T014 [P] Modify [package.json](../../package.json) — bump `version` from `0.6.3` to `0.6.4` (PATCH per BI-023 / BI-024 / BI-025 / BI-035 additive-surface precedent). Also update `description` if it carries a tool-count or summary list — add `backlinks` in the appropriate position. No other field touched.

- [ ] T015 Run quality gates in this order. Each MUST pass before merge:
  1. `npm run lint` → zero warnings (Constitution gate 1).
  2. `npm run typecheck` → zero errors (Constitution gate 2).
  3. `npm run build` → succeeds (Constitution gate 3).
  4. `npm run baseline:write` was run in T010; verify [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) contains the `backlinks` entry with the correct fingerprints.
  5. `vitest run` → all tests pass including new backlinks tests AND the registry-stability baseline test AND the BI-005 registry-consistency test (Constitution gate 4).
  6. Aggregate `statements` coverage threshold passes — verify `vitest run --coverage` reports ≥ 91.3% (Constitution gate 5). The new module adds ~220 production LOC + ~1200 test LOC; coverage should remain flat or ratchet up.

- [ ] T016 Verify the live-CLI characterisation pass from T001 produced no TRIGGER findings that require spec / plan amendments. If TRIGGERs were surfaced AND deferred, document them as known-gaps in [research.md § T0 Live-CLI Capture](research.md) and either (a) fix the wrapper before merge if the contract is broken, or (b) open a follow-up BI if the deviation is outside the user-facing contract.

- [ ] T017 (OPTIONAL) Run `/graphify --update` to refresh the structural knowledge graph at `graphify-out/`. Verify per CLAUDE.md `/speckit-analyze` rule 3: the new `backlinks/` sub-cluster lands inside the `src/tools/` community (not orphan, not surprise-clustered). Rule 4: production files (`schema.ts`, `handler.ts`, `index.ts`, `_template.ts`) are structurally connected via the registration path; test files are expected to be weakly connected. Defer to `/speckit-analyze` if running it as a separate step.

**Checkpoint**: All quality gates pass; release plumbing updated; structural verification complete. BI-036 ready for PR with Constitution Compliance checklist 9/9 Y/N/A.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: empty.
- **Foundational (Phase 2)**: T001 MUST complete before user story work. If F1/F2 surface TRIGGERs, plan / spec amendments may be required before proceeding.
- **User Stories (Phase 3-7)**: bundled into a single atomic ship (T002–T010) because the eval template is monolithic. US2/US3/US4/US5 ride along US1; no separate code paths.
- **User Story 6 (Phase 8)**: T011 + T012 depend on T009 (registration in `server.ts`) so the `assertToolDocsExist` boot-time assertion fires correctly. Can begin as soon as T009 lands.
- **Polish (Phase 9)**: T013–T017 depend on T002–T012 being complete.

### Per-task dependencies

- T002 (schema.ts) ← prerequisite for T003 (schema.test.ts), T005 (handler.ts), T007 (index.ts).
- T004 (_template.ts) ← prerequisite for T005 (handler.ts).
- T005 (handler.ts) ← prerequisite for T006 (handler.test.ts), T007 (index.ts).
- T007 (index.ts) ← prerequisite for T008 (index.test.ts), T009 (server.ts), T011 (docs/tools/backlinks.md).
- T009 (server.ts) ← prerequisite for T010 (baseline regen).
- T010 (baseline regen) ← prerequisite for T015 (quality gates — vitest baseline test).

### Within Each User Story

- US1: schemas before template; template before handler; handler before tests; tests before registration; registration before baseline.
- US2/US3/US4/US5: no separate tasks — covered by US1's bundled ship.
- US6: docs after registration so boot-time `assertToolDocsExist` passes.
- Polish: release plumbing after all functional tasks; quality gates last.

### Parallel Opportunities

- **T002 + T003 + T004 [P]**: schema.ts + schema.test.ts + _template.ts can be developed in parallel (different files, no inter-dependency at file level). T003 imports from T002 — if running parallel, write T003 against the planned T002 surface from data-model.md.
- **T006 + T008 [P]**: handler.test.ts + index.test.ts can be written in parallel (different files).
- **T013 + T014 [P]**: CHANGELOG.md + package.json can be modified in parallel (different files, both trivial).
- **All T0 sub-probes (F1, F2, F3, F4)**: independent; can be executed in any order or in parallel against the same TestVault session.

### Story Independence (BI-025 bundled-ship pattern)

The five P1/P2 stories ship as one atomic implementation because the eval template handles all flag combinations in one frozen string. Story independence is preserved at the TEST level — each user story's tests (in T003 and T006) can be reasoned about and modified independently, even though they exercise the same handler code paths.

---

## Parallel Example: Foundational + User Story 1

```bash
# T001 sub-probes can fire in parallel during the same TestVault session:
Task: "F1 — `obsidian help backlinks` shape probe"
Task: "F2 — Unknown-vault behaviour via eval"
Task: "F3 — Frontmatter-link inclusion in getBacklinksForFile"
Task: "F4 — Code-block exclusion"

# T002, T003, T004 can be developed in parallel (different files):
Task: "Create src/tools/backlinks/schema.ts per data-model.md"
Task: "Create src/tools/backlinks/schema.test.ts with ~22 cases"
Task: "Create src/tools/backlinks/_template.ts per data-model.md"

# T006 + T008 in parallel after T005 + T007 land:
Task: "Create src/tools/backlinks/handler.test.ts with ~30 cases"
Task: "Create src/tools/backlinks/index.test.ts with ~5 cases"
```

---

## Implementation Strategy

### MVP First (User Story 1 — bundled ship of US1/US2/US3/US4/US5)

1. Complete Phase 1: Setup (empty).
2. Complete Phase 2: Foundational (T001 — T0 live-CLI characterisation).
3. Complete Phase 3: User Story 1 bundled ship (T002–T010).
4. **STOP and VALIDATE**: Test bundled ship covers US1/US2/US3/US4/US5 via T003 + T006's full case inventory.
5. Skip ahead to Phase 8 for docs (T011–T012).
6. Run Phase 9 quality gates (T013–T017).
7. Open PR for merge — MVP shippable.

### Incremental Delivery (NOT applicable — single atomic ship)

The eval template is monolithic; incremental sub-story delivery is not natural for this BI. The bundled ship pattern matches BI-025 precedent. If a future BI wants per-occurrence backlinks (a sibling tool), it can iterate incrementally on a fresh module.

### Parallel Team Strategy

With two developers:
- Developer A: T002 (schema.ts) + T003 (schema.test.ts) + T007 (index.ts) + T008 (index.test.ts).
- Developer B: T004 (_template.ts) + T005 (handler.ts) + T006 (handler.test.ts) + T009 (server.ts).
- One developer: T010 (baseline regen — runs npm script), T011–T012 (docs), T013–T017 (polish).

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US1 ships US2/US3/US4/US5 along with it (bundled-ship pattern — see BI-025 precedent).
- Verify tests fail before implementing (Principle II) — N/A for bundled-ship: tests are written in the same task as implementation.
- Commit after each task or logical group.
- Stop at any checkpoint to validate story independently.
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence at the test level.
- Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) BEFORE T001's live-CLI probes per CLAUDE.md `## Test Execution` gate.
