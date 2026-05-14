---
description: "Task list for 027-smart-connections-query — Semantic Search Over Vault Blocks by Text Query"
---

# Tasks: Smart Connections Query — Semantic Search Over Vault Blocks by Text Query

**Input**: Design documents from [`/specs/027-smart-connections-query/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in the same change-set). Tests are NOT a separate red/green TDD loop; every implementation task lands with its co-located test cases in the same task. Total target: **70 tests** across the new module + new shared module + BI-026 ripple (16 schema / 26 handler / 5 registration / 12 detector / 8 parser / +3 BI-026 ripple regression = 70). The verify-fails-first sanity check is captured exactly once, manually, by T015 (parity with BI-023 / BI-024 / BI-025 / BI-026 precedent).

**Organization**: Tasks are grouped by user story per the project convention. The `smart_connections_query` module is fundamentally a single atomic ship — User Stories 1, 2, 3, 4 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`) + the frozen JS template at `_template.ts`; Story 5 is the documentation layer. The `[USx]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md § Test inventory](data-model.md#test-inventory) maps each test case to its source User Story.

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code):

- **R2 — `eval` subcommand load-bearing**: probed live 2026-05-15 (F1). No native semantic-query subcommand exists; the Smart Connections plugin's lookup API is reached via `obsidian vault=<name> eval code=<rendered-js>` at the call path `app.plugins.plugins["smart-connections"].env.smart_sources.lookup({hypotheticals, filter, collection})`. Parity with BI-014 / BI-015 / BI-025 / BI-026 (eval cohort); second member of the eval-driven plugin-backed sub-cohort (after BI-026).
- **R3 — Single-call architecture branched at envelope-emission on `a.total`**: ONE `invokeCli` invocation per request. Same eval JS in both modes; the `a.total` branch lives INSIDE the eval at envelope-emission. Cross-mode invariant (FR-006a) holds by construction. PLUS one optional SECOND `invokeCli` to the `vaults` subcommand from inside the shared `_eval-vault-closed-detection` detector, fired only on the empty-stdout signature.
- **R4 — NO `target_mode` discriminator**: flat input schema with optional `vault?`. Parity with BI-014 / BI-019 / BI-024 fileless precedent. ADR-003 explicitly governs per-file typed tools and does NOT apply here.
- **R5 — Unknown-vault response inspection ACTIVE for `eval`**: the cli-adapter's existing 011-R5 inspection clause FIRES for unregistered vault — inherited unchanged from BI-026.
- **R5a — Closed-but-registered vault detection** via the NEW shared module: empty-stdout + vault= + registered signature → `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")`. Module at `src/tools/_eval-vault-closed-detection/` extracted in this BI from BI-026's inline implementation per Q8(c) hybrid extraction. Consumed by both BI-026 (refactored) and BI-027 (new).
- **R6 — Base64 anti-injection**: frozen JS template with single `__PAYLOAD_B64__` substitution slot. Parity with BI-014 / BI-015 / BI-025 / BI-026.
- **R7 — Per-match transform from `{key, score}` → `{path, headingPath, score}`**: per F5 / F6, `lookup` returns top-level `key` (NOT nested `item.key` as in BI-026's `find_connections` shape) AND top-level `score`. CRITICAL F7 finding: the `item` field is CIRCULAR (carries plugin's SmartHttpRequest back-references) and CANNOT be serialised — wrapper extracts top-level `{key, score}` only.
- **R8 — Three-level sort intra-eval**: primary `score` descending; secondary `path` byte-compare ascending; tertiary `headingPath.join("#")` byte-compare ascending. Parity with BI-026.
- **R9 — NO self-exclusion**: no source path to exclude (the query is text, not a source note). BI-026 R9's self-exclusion does NOT apply here.
- **R10 — Non-finite-score filter**: `.filter(m => Number.isFinite(m.score))` in-eval post-fetch. Parity with BI-026.
- **R11 — Lookup return-value error-sentinel detection** (NEW for BI-027): in-eval `if (r && r.error)` check after `await lookup(...)`. The plugin returns `{ error: <string> }` sentinels for empty hypotheticals AND for missing embed model (verified live: `{error: "hypotheticals is required"}` and `{error: "Embedding search is not enabled."}`). NO try/catch — the plugin does NOT throw. Drives the `embed-failed` sub-reason on `SMART_CONNECTIONS_NOT_READY`.
- **R12 — API-shape check**: in-eval `typeof env.smart_sources?.lookup !== 'function'` check → `SMART_CONNECTIONS_NOT_READY_API_MISSING`. Drives the `api-missing` sub-reason.
- **R13 — Error-precedence chain per FR-017**: outer-to-inner / cheapest-first. `VAULT_NOT_FOUND(unknown)` (cli-adapter 011-R5) → `VAULT_NOT_FOUND(not-open)` (shared detector stage-0) → `SMART_CONNECTIONS_NOT_INSTALLED` (in-eval Stage 1) → `SMART_CONNECTIONS_NOT_READY(api-missing)` (in-eval Stage 2) → `SMART_CONNECTIONS_NOT_READY(embed-failed)` (in-eval Stage 4) → success.
- **R14 — Stdout extraction strategy: LAST `=> ` occurrence** (NEW for BI-027): plugin-side `console.log("Found and returned N smart_blocks.")` AND `[warn]` lines capture to stdout BEFORE the `=> ` eval-return marker. Handler stage-1 uses `stdout.lastIndexOf('\n=> ')` (with fallback to `startsWith('=> ')` and passthrough). BI-026's handler is UNCHANGED (its `find_connections` API is quieter and never triggers this case).
- **R15 — Plugin-namespace tool name**: `smart_connections_query` per ADR-013 — second consumer.
- **Plan-stage live-probe-driven amendments** (codified in spec.md `## Clarifications`): amendment 1 (`hypotheticals` at TOP LEVEL of params, not inside `filter`); amendment 2 (lookup errors return `{error}` sentinels + plugin-side console output captures to stdout before `=> ` marker). Both amendments verified live 2026-05-15 against "The Setup" vault.
- **Two /speckit-clarify Q&As 2026-05-15** (codified in spec.md `## Clarifications`): Q1 embed-call timeout boundary → defer to cli-adapter 10s cap, new inherited limitation #7; Q2 stale-index reverse direction → pass through unchanged, new inherited limitation #8.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers. Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative.

## Path Conventions

Single-project TypeScript layout per Constitution Principle I. All paths relative to repo root. Source under [src/](../../src/); co-located tests alongside their source modules per Principle II. The new feature module is at `src/tools/smart_connections_query/` (does NOT exist yet — created by T004–T008). The new cross-cutting shared module is at `src/tools/_eval-vault-closed-detection/` (does NOT exist yet — created by T002–T003).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–026). This feature introduces NO new runtime npm dependencies. The Smart Connections plugin is a USER-side runtime dependency carried from BI-026. The plan-phase deliverables (canonical architecture doc rollforward) all already shipped during `/speckit-plan` — no T-tasks needed for them. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: (a) extract the new cross-cutting shared module that BOTH the BI-026 refactor AND the BI-027 new handler depend on; (b) live-CLI / live-plugin characterisation of the 3 F-findings deferred from plan stage (F13–F15) per [research.md § Cases deferred to T0](research.md#cases-deferred-to-t0-of-speckit-implement).

**Note on plan-stage coverage**: 12 architecture-locking findings (F1–F12) were verified live during plan stage on 2026-05-15 against the user's open "The Setup" vault — see [research.md § Live-CLI findings](research.md). T001 below covers the 3 cases deferred to T0 because they require fresh fixtures or vault-state changes not feasible at plan time. T002–T003 ship the new shared module (a prerequisite for the BI-027 handler AND for the BI-026 ripple refactor).

- [ ] T001 Live-CLI / live-plugin characterisation of the 3 deferred T0 cases plus 3 BI-026-ripple cases. Run probes against either the authorised test vault `TestVault-Obsidian-CLI-MCP` (per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md)) OR a Smart-Connections-enabled vault (e.g. "The Setup") as the case requires; cleanup all fixtures from `Sandbox/` after capture; restore any modified plugin or vault state. Append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cases:

  - **(T0.1) Closed-but-registered vault end-to-end with `lookup` (R5a / SC-007 / Q-10 verification)**: pick one currently-open registered vault (e.g. The Setup or Ways of Working — NOT TestVault since it has no Smart Connections plugin). Close that vault window in Obsidian. Probe via the wrapper end-to-end (`executeSmartConnectionsQuery({ query: 'test query', vault: '<closed-vault>' }, realDeps)`). **Expected per F13 / R5a**: the wrapper's stage-0 detection branch fires AND raises `CLI_REPORTED_ERROR(details.code='VAULT_NOT_FOUND', details.reason='not-open')`. Side effect: the vault transparently opens — re-probe immediately AND confirm the second call succeeds. **TRIGGER**: if the wrapper raises `CLI_REPORTED_ERROR(stage:'json-parse')` (dispatch layer's generic empty-stdout-parse-failure path), the handler's stage-0 detection branch (or the shared `_eval-vault-closed-detection` module) is NOT firing — debug the empty-stdout signature check OR the `obsidian vaults` known-vault lookup. Re-open the closed vault before continuing.

  - **(T0.2) First-install / embed-model-not-configured state (F14 verification)** + **U1 — cloud-embed throw observability**: identify a Smart Connections-installed vault where the embed model is NOT configured (or temporarily change the model selection to an invalid one via the plugin settings panel). Probe via wrapper (`executeSmartConnectionsQuery({ query: 'test', vault: '<vault>' }, realDeps)`). **Expected**: the lookup returns the `{error: "Embedding search is not enabled."}` sentinel → wrapper raises `CLI_REPORTED_ERROR(details.code='SMART_CONNECTIONS_NOT_READY', details.reason='embed-failed', detail: 'Embedding search is not enabled.')`. **TRIGGER**: if the eval JS throws an uncaught exception (e.g. trying to access `embed_model.embed_batch` when `embed_model` is undefined), the plugin's internal guard is wrong OR the wrapper's stage-2 API-shape check is too narrow. Restore the embed model configuration after the probe. **U1 sub-case (per /speckit-analyze finding)**: ALSO probe cloud-embed throw scenarios — (a) configure an invalid OpenAI API key in plugin settings; (b) optionally disconnect network mid-call. **Expected**: ideally the wrapper still emits `embed-failed` (the plugin's lookup helper wraps the throw into the sentinel return). **POSSIBLE alternative**: the throw escapes the lookup helper and the wrapper surfaces `CLI_REPORTED_ERROR(stage:'javascript-error')` from the dispatch layer's `Error:` prefix classifier instead. Document the actual behaviour. If the alternative fires, add a new inherited limitation #9 documenting "cloud-embed throws may surface as `CLI_REPORTED_ERROR(stage:javascript-error)` rather than `embed-failed` — agent's remediation path is the same (check embed config / network / API key)".

  - **(T0.3) Very-long-query truncation observability (F15 verification)**: in a vault with a small-context local embed model (e.g. transformers.js with a 512-token default), probe with a 4000-char query string (e.g. `"This is a test sentence. ".repeat(160)`). **Expected**: the embed pipeline silently truncates at the model's context window AND returns matches based on the truncated prefix. The wrapper observes whatever the plugin returns. **TRIGGER**: if the plugin returns an `{error: ...}` sentinel for over-context queries (rather than silent truncation), document — inherited limitation #5's wording may need refinement. Document the observed behaviour in research.md.

  - **(T0.4) [pre-impl gate for T015] Behaviour-preservation regression baseline for BI-026 refactor**: BEFORE refactoring `src/tools/smart_connections_similar/handler.ts` to consume the new shared `_eval-vault-closed-detection/` module (T015), capture the pre-refactor handler's observable behaviour against the closed-vault fixture. Use the existing handler tests at `src/tools/smart_connections_similar/handler.test.ts` (specifically the stage-0 closed-vault detection test) as the baseline. Run `npx vitest run src/tools/smart_connections_similar` BEFORE T015 lands; capture pass/fail counts + verbatim assertion strings. Save to a temp file (NOT checked in — local-only baseline). After T015 + T016 + T017 land, re-run; assert identical pass/fail behaviour (3 new tests for `details.reason: "api-missing"` from T017 are EXPECTED to be new; everything else must match byte-for-byte). The `_register-baseline.json` fingerprint for `smart_connections_similar` MUST remain unchanged across the refactor (verified by running `npm run baseline:write` AND `git diff src/tools/_register-baseline.json` — only the new `smart_connections_query` row should appear; the `smart_connections_similar` row stays byte-stable).

  - **(T0.5) End-to-end specific-mode happy path with block-level fixture (FR-007 / SC-001 / Q-26 verification)**: against the user's "The Setup" vault (or any Smart Connections-installed vault with substantive content), probe `executeSmartConnectionsQuery({ query: 'decision log architectural choices', vault: '<vault>', limit: 5 }, realDeps)`. Assert response carries 5 block-level entries each with `path` byte-faithful to the source file (everything before first `#`), `headingPath` an array of strings (possibly multi-segment, possibly including `#{N}` sub-block segments per F6), `score` a finite number ≥ 0. Assert sort order: `matches[0].score >= matches[1].score >= ... >= matches[4].score` (descending). Document the per-entry response in research.md. **TRIGGER**: if no matches return or if scores are not monotonically non-increasing, the wrapper's in-eval transform OR three-level sort is wrong — debug.

  - **(T0.6) [post-impl, OPTIONAL] Very-large-match-list cap-boundary**: structurally inherited from BI-003's 10 MiB cap — at `limit: 100`, response is ~12 KiB max, 4 orders below cap. OPTIONAL — parity with BI-024 / BI-025 / BI-026 precedent. If exercised: stub envelope payload that pads `matches` to trigger 10 MiB cap → observe `CLI_NON_ZERO_EXIT` with `details.killReason = {kind: 'cap', stream: 'stdout'}`. Document.

**Checkpoint after T001**: T0 live-CLI probes complete; closed-vault detection signature confirmed for `lookup`-based eval; first-install state verified; long-query truncation observability characterised; pre-refactor BI-026 behaviour baseline captured; end-to-end specific-mode happy path validated; cap-boundary outcome documented (OPTIONAL). (T0.1 + T0.4 are pre-impl gates — they inform T002/T003 (closed-vault module shape) and T012 (BI-026 refactor) respectively. T0.2 / T0.3 / T0.5 / T0.6 are post-impl wrapper E2E.)

- [ ] T002 [P] Create the cross-cutting shared module at `src/tools/_eval-vault-closed-detection/registry-parser.ts` (FR-020). Export `parseVaultRegistry(stdout: string, vaultName: string): boolean` — BOM-aware, tab-separated-line parser replicating the structural inline implementation from BI-026's `isVaultRegistered` helper (which itself references `src/vault-registry/registry.ts`). Algorithm: strip leading UTF-8 BOM if present (`﻿`); split on `\n`; for each line, strip trailing `\r`, skip empties, find first tab; if substring before first tab equals `vaultName`, return `true`. Returns `false` if `vaultName` not found. Carry header `// Original — no upstream. Structurally replicated from src/vault-registry/registry.ts and BI-026's inline isVaultRegistered helper.`

- [ ] T003 [P] Create co-located test at `src/tools/_eval-vault-closed-detection/registry-parser.test.ts` with **8 cases**: (1) BOM-prefixed stdout with a single vault match → true; (2) CRLF line endings → match unaffected; (3) LF line endings → match unaffected; (4) empty lines skipped between valid lines; (5) vault not in registry → false; (6) tab-separated tokens — first column = vault name; (7) multiple tabs per line — picks first; (8) empty stdout → false. Carry header per Constitution V.

- [ ] T004 [P] Create the detector at `src/tools/_eval-vault-closed-detection/detector.ts`. Export `interface DetectIfClosedInput { vaultName: string; deps: { invokeCli: SpawnLike?; env?: NodeJS.ProcessEnv; logger: Logger; queue: Queue } }` and `async function detectIfClosed(input: DetectIfClosedInput): Promise<boolean>`. Logic: issue ONE `invokeCli` call to `command: 'vaults'` with `flags: ['verbose']`, target_mode: 'specific' (defence-in-depth; the cli-adapter's locator-strip is a no-op on this subcommand). Parse the result via `parseVaultRegistry(result.stdout, input.vaultName)`. Return the boolean. Carry header per Constitution V.

- [ ] T005 [P] Create co-located test at `src/tools/_eval-vault-closed-detection/detector.test.ts` with **12 cases**: (1) `vaults verbose` returns vault in registry → true; (2) returns without vault → false; (3) issues exactly one spawn invocation; (4) `vaults verbose` argv shape correct; (5) BOM handling delegated to parser (mock + verify call); (6) handles `Other\tC:\\path\\Other\nDemo\tC:\\path\\Demo\n` shape; (7) handles single-vault output; (8) handles empty registry (`""`) → false; (9) deps wiring (logger / queue / spawnFn pass-through); (10) error propagation from cli-adapter; (11) timeout from cli-adapter surfaces as CLI_TIMEOUT; (12) `vaultName` is byte-exact compared (case-sensitive). Carry header per Constitution V.

- [ ] T006 [P] Create the re-export module at `src/tools/_eval-vault-closed-detection/index.ts`. Export `detectIfClosed` from `./detector.js` and `parseVaultRegistry` from `./registry-parser.js`. Carry header per Constitution V.

**Checkpoint after T001–T006**: Foundational live-CLI characterisation complete + new cross-cutting shared module ships with 20 co-located tests (exceeds SC-023 floor of 15). User-story implementation can now begin. The BI-026 ripple refactor (T012) can also proceed once T004/T006 land.

---

## Phase 3: User Story 1 — Semantic search over the vault from a natural-language query (Priority: P1) 🎯 MVP

**Goal**: Add the typed `smart_connections_query` MCP tool surface that returns `{ count, matches: [{ path, headingPath, score }] }` for a free-text query string against a vault. Covers FR-001..FR-019 (default mode happy path + block-level granularity + three-level sort + non-finite-score filter + plugin-lifecycle discriminators with sub-reasons + closed-vault detection branch via shared module + error-precedence chain + anti-injection).

**Independent Test**: invoke `smart_connections_query({ query: '<text>', vault: '<vault>' })` against a Smart-Connections-enabled vault; assert response shape `{ count, matches: [...] }` with correct per-entry `path` / `headingPath` / `score` values in descending score order. Per [quickstart.md](quickstart.md) Q-1..Q-9, Q-19..Q-23, Q-26.

> **Note on bundled stories**: T007–T011 below are the single source implementation that delivers User Stories 1, 2, 3, 4 in one atomic ship. The `[US1]` tag marks primary-story attribution; US2/US3/US4 are sub-stories of the same module and ride along (no separate code paths). Story-tag breakdown by file:
>
> - schema.ts → US1 (default-mode shape) + US2 (validation refinement: query trim+min+max, vault optional+min1, limit range, total boolean, unknown-key rejection) + US3 (count-only `total` field)
> - _template.ts → US1 (frozen JS template — happy path) + US4 (in-eval lifecycle checks for plugin-not-installed / api-missing / embed-failed)
> - handler.ts → US1 (default-mode happy path + transforms + sort + filters + closed-vault stage-0 branch via shared module + LAST-`=> ` extraction) + US3 (count-only branch at envelope emission) + US4 (envelope-error → UpstreamError mapping)
> - index.ts → US1 (registration)
> - docs/tools/smart_connections_query.md → US5 (documentation)

### Implementation for User Story 1 (MVP — bundled with US2/US3/US4)

- [ ] T007 [P] [US1] Create [src/tools/smart_connections_query/schema.ts](../../src/tools/smart_connections_query/schema.ts) per [data-model.md § Input Schema](data-model.md). Export `smartConnectionsQueryInputSchema = z.object({ query: z.string().trim().min(1).max(4000), vault: z.string().min(1).optional(), limit: z.number().int().min(1).max(100).default(20), total: z.boolean().optional() }).strict()`. Export `matchEntrySchema = z.object({ path: z.string().endsWith('.md'), headingPath: z.array(z.string()), score: z.number().finite() }).strict()`. Export `smartConnectionsQueryOutputSchema = z.object({ count: z.number().int().nonnegative(), matches: z.array(matchEntrySchema) }).strict()`. Export `SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES = ['SMART_CONNECTIONS_NOT_INSTALLED','SMART_CONNECTIONS_NOT_READY_API_MISSING','SMART_CONNECTIONS_NOT_READY_EMBED_FAILED'] as const` and `smartConnectionsQueryEvalResponseSchema = z.discriminatedUnion('ok', [...])` per the data-model.md schema. Inferred types via `z.infer`: `SmartConnectionsQueryInput` / `SmartConnectionsQueryOutput` / `MatchEntry` / `SmartConnectionsQueryEvalResponse` / `SmartConnectionsQueryEvalErrorCode`. Carry `// Original — no upstream. <one-line description>.` header per Constitution V.

- [ ] T008 [P] [US1] Create [src/tools/smart_connections_query/schema.test.ts](../../src/tools/smart_connections_query/schema.test.ts) with **16 cases** per [data-model.md § Test inventory](data-model.md#test-inventory). Cases: (1) minimum valid input (`{ query: 'x' }`) ✓; (2) full input (`{ query: 'x', vault: 'D', limit: 5, total: true }`) ✓; (3) `query` trim+min — empty `""` ✗; (4) `query` trim+min — whitespace-only `"   \t\n  "` ✗; (5) `query` max — 4000 chars ✓; (6) `query` max — 4001 chars ✗; (7) `query` non-string (number/array/object) ✗; (8) `query` missing ✗; (9) `vault` empty string `""` ✗ (min1 violation); (10) `limit: 0` ✗ (below min); (11) `limit: 101` ✗ (above max); (12) `limit: 5.5` ✗ (non-integer); (13) `limit: "20"` ✗ (string, not number); (14) `total: "true"` ✗ (string, not boolean); (15) unknown top-level key (e.g. `{ query: 'x', threshold: 0.7 }`) ✗ (strict mode); (16) emitted JSON Schema round-trips with `required: ['query']` AND `additionalProperties: false`. Plus inline validation that `matchEntrySchema` rejects non-finite score AND non-string `path`/`headingPath` entries. Each failing case is asserted with a dispatcher spy (`vi.fn()`) that MUST NEVER be called — locks FR-019 structurally. Carry header per Constitution V.

- [ ] T009 [P] [US1] Create [src/tools/smart_connections_query/_template.ts](../../src/tools/smart_connections_query/_template.ts) per [data-model.md § Frozen JS Template](data-model.md). Export `JS_TEMPLATE` constant — the literal string from data-model.md (~35 LOC body). Seven load-bearing stages per Stage 1..7. Single `__PAYLOAD_B64__` slot. Carry header per Constitution V naming the seven stages.

- [ ] T010 [US1] Create [src/tools/smart_connections_query/handler.ts](../../src/tools/smart_connections_query/handler.ts) per [contracts/smart-connections-query-handler.contract.md](contracts/smart-connections-query-handler.contract.md). Export `executeSmartConnectionsQuery(input: SmartConnectionsQueryInput, deps: ExecuteDeps): Promise<SmartConnectionsQueryOutput>`. Logic per invariants I-1..I-9:

  1. **Payload assembly** (I-1): `payload = { query: input.query, limit: input.limit, total: input.total === true }`. `payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')`. `code = JS_TEMPLATE.replace('__PAYLOAD_B64__', payloadB64)` — exactly one `.replace()` call. The `vault?` input does NOT go into the payload; it flows through `invokeCli`'s top-level `vault` field per the cli-adapter contract.
  2. **ONE `invokeCli` invocation** (I-2): `await invokeCli({ command: 'eval', vault: input.vault, parameters: { code }, flags: [], target_mode: input.vault ? 'specific' : 'active' }, { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })`. The synthesised `target_mode` is a defence-in-depth signal to cli-adapter's locator-strip (no-op for this BI since the payload has no locator fields).
  3. **Stage 0 — closed-vault detection** (I-2b): if `input.vault && result.stdout.trim().length === 0`, call `await detectIfClosed({ vaultName: input.vault, deps })` from the shared `_eval-vault-closed-detection` module. If `true`, throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', cause: null, details: { code: 'VAULT_NOT_FOUND', reason: 'not-open', stage: 'handler-stage-0', vault: input.vault }, message: 'requested vault is registered but not currently open in Obsidian; the CLI has begun opening it — retry after a brief delay' })`. Else fall through to stage 1 — empty stdout will surface as json-parse failure (defensive — should be rare for this BI per F8 which showed plugin-side console output always present).
  4. **Stage 1 — LAST-`=> ` extraction** (I-3): `const marker = '\n=> '; const idx = result.stdout.lastIndexOf(marker); let payload = idx >= 0 ? result.stdout.slice(idx + marker.length) : result.stdout.startsWith('=> ') ? result.stdout.slice(3) : result.stdout;`. NOTE: differs from BI-026's stage-1 which uses `trimStart + startsWith('=> ') ? slice(3) : passthrough` — BI-027 needs LAST-marker because `lookup` triggers plugin-side `console.log` output before the eval-return marker.
  5. **Stage 2 — JSON.parse** (I-4): try/catch around `JSON.parse(payload)`; on failure throw `UpstreamError` with `details: { stage: 'json-parse', stdout: result.stdout.slice(0, 500) }`.
  6. **Stage 3 — envelope safeParse** (I-4): `smartConnectionsQueryEvalResponseSchema.safeParse(parsedJson)`; on failure throw `UpstreamError` with `details: { stage: 'envelope-parse', stdout: result.stdout.slice(0, 500) }`.
  7. **Stage 4 — discriminate on `ok`** (I-5): if `validated.data.ok === true`, return `{ count, matches }`. Else call `mapEnvelopeError(validated.data.code, validated.data.detail)` and throw.
  8. **`mapEnvelopeError`** (I-6): TypeScript exhaustiveness-checked over `SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES`. `SMART_CONNECTIONS_NOT_INSTALLED` → `CLI_REPORTED_ERROR` with `details: { code: 'SMART_CONNECTIONS_NOT_INSTALLED', stage: 'envelope-error', detail }`. `SMART_CONNECTIONS_NOT_READY_API_MISSING` → `CLI_REPORTED_ERROR` with `details: { code: 'SMART_CONNECTIONS_NOT_READY', reason: 'api-missing', stage: 'envelope-error', detail }`. `SMART_CONNECTIONS_NOT_READY_EMBED_FAILED` → `CLI_REPORTED_ERROR` with `details: { code: 'SMART_CONNECTIONS_NOT_READY', reason: 'embed-failed', stage: 'envelope-error', detail }`.

  Type definitions: `ExecuteDeps = { logger: Logger; queue: Queue; spawnFn?: SpawnLike; env?: NodeJS.ProcessEnv }`. Carry header per Constitution V. NO `logger.callStart` / `callEnd` events per R1.

- [ ] T011 [US1] Create [src/tools/smart_connections_query/handler.test.ts](../../src/tools/smart_connections_query/handler.test.ts) with **26 cases** per [data-model.md § Test inventory](data-model.md#test-inventory). Inject stub `spawnFn` via queued responses pattern. Per-test assertions: (a) spawn count = 1 for non-stage-0 tests, = 2 for stage-0 closed-vault tests; (b) base64 round-trip — decode `code=` argv via the test-seam pattern from [contracts/smart-connections-query-handler.contract.md § Test Seam Pattern](contracts/smart-connections-query-handler.contract.md), assert payload byte-equals input (R6 anti-injection); (c) for envelope-error tests, assert `UpstreamError.code` / `details.code` / `details.reason` / `details.stage` per R13 mapping. Case enumeration:

  - Happy paths (4): default mode multi-block; default mode source-level match (empty headingPath); count-only mode (`matches:[]`); frontmatter-block sentinel preserved (`headingPath: ['---frontmatter---']`).
  - Cross-mode invariance (1): paired fixture asserting `count` identical across `total:false` and `total:true` with same `query`/`limit`.
  - Sort (3): score-desc; score-tie path-tiebreak; score-tie path-tie headingPath-tiebreak.
  - Filter (1): non-finite-score drops (mixed NaN/Infinity/null/undefined/missing fixture).
  - Limit (1): limit cap honoured at boundary (limit:100 returns ≤100).
  - Anti-injection (2): query with shell metacharacters round-trips byte-exactly; query with Unicode + emojis round-trips byte-exactly.
  - Plugin lifecycle (3): `SMART_CONNECTIONS_NOT_INSTALLED`; `NOT_READY(api-missing)`; `NOT_READY(embed-failed)`.
  - Vault errors (2): unknown vault via 011-R5 (`Vault not found.` stdout → CLI_REPORTED_ERROR); closed-but-registered (empty-stdout + 2-spawn flow via shared detector → CLI_REPORTED_ERROR with `details.reason: 'not-open'`).
  - Parse failures (2): json-parse (malformed JSON after `=> `); envelope-parse (`{ok:"maybe"}` invalid shape).
  - Adapter inheritance (1): CLI_TIMEOUT propagates verbatim from dispatch layer.
  - Precedence chain (4): one fixture each for the four adjacent pairs (`vault-unknown < vault-not-open`; `vault-not-open < not-installed`; `not-installed < api-missing`; `api-missing < embed-failed`).
  - Single-spawn invariant (1): spawn count assertion across the happy + closed-vault paths.
  - Empty-result success (1): zero matches after non-finite filter → `{count:0, matches:[]}`.

  Carry header per Constitution V.

- [ ] T012 [US1] Create [src/tools/smart_connections_query/index.ts](../../src/tools/smart_connections_query/index.ts) — the `createSmartConnectionsQueryTool` factory via `registerTool`. Wire: `name: 'smart_connections_query'`; description "Returns the semantically nearest blocks in a vault to a natural-language query, using the Smart Connections plugin. Call help({ tool_name: 'smart_connections_query' }) for details." (stripped of nested descriptions by `registerTool` at boot per ADR-005); `inputSchema: smartConnectionsQueryInputSchema`; `handler: executeSmartConnectionsQuery`. Carry header per Constitution V.

- [ ] T013 [US1] Create [src/tools/smart_connections_query/index.test.ts](../../src/tools/smart_connections_query/index.test.ts) with **5 registration cases**: (1) descriptor `name === 'smart_connections_query'`; (2) emitted `inputSchema` has nested descriptions stripped (deep-walk asserts zero `description` keys below top-level); (3) the `help` tool surfaces `smart_connections_query` in its listing (integrate against the existing help-tool registry); (4) `docs/tools/smart_connections_query.md` exists with required content sections (one-line summary; input table; output table; failure-mode table; ≥4 worked examples); (5) FR-018 baseline lock — the new tool's fingerprint matches `_register-baseline.json` after `npm run baseline:write` runs (asserted by the drift detector + baseline test at `_register-baseline.test.ts`). Carry header per Constitution V.

**Checkpoint after T007–T013**: User Story 1 — and bundled US2/US3/US4 — fully functional. Schema rejects malformed inputs (US2); count-only mode works (US3); plugin-lifecycle errors with sub-reasons surface correctly (US4); default-mode happy path returns block-level matches (US1). 47 new tool tests pass.

---

## Phase 4: User Story 5 — Documentation surface (Priority: P2)

**Goal**: Ship a `docs/tools/smart_connections_query.md` doc covering input contract, output shape × 2 modes, full failure-mode roster including the 2 sub-reasons, error-precedence chain, ≥4 worked examples, inherited limitations (8 entries).

**Independent Test**: Read `docs/tools/smart_connections_query.md`. Assert the FR-021 / FR-022 / FR-023 required sections per spec. Run the registry-consistency test from BI-005; assert PASS for `smart_connections_query`.

### Implementation for User Story 5

- [ ] T014 [US5] Create [docs/tools/smart_connections_query.md](../../docs/tools/smart_connections_query.md) per FR-021 / FR-022. Required sections: (a) one-line summary at the top; (b) Input table covering `query` / `vault?` / `limit?` / `total?` with full per-field constraints; (c) Output table covering `count` / `matches[*].path` / `matches[*].headingPath` / `matches[*].score`, with separate columns for default-mode and count-only-mode behaviour; (d) Failure-mode table including all 5 entries (VALIDATION_ERROR + VAULT_NOT_FOUND × 2 reasons + SMART_CONNECTIONS_NOT_INSTALLED + SMART_CONNECTIONS_NOT_READY × 2 reasons) PLUS the inherited adapter errors (CLI_BINARY_NOT_FOUND / CLI_TIMEOUT / CLI_NON_ZERO_EXIT / CLI_OUTPUT_TOO_LARGE); (e) error-precedence chain documented verbatim per FR-017; (f) ≥4 worked examples (default happy / explicit vault / count-only / one failure); (g) Inherited limitations list (8 entries — embedding-model score bands; indexing freshness; folder exclusions; plugin-version drift; local-model silent truncation; embed-call latency cap (10s); stale-index reverse direction; low-information queries); (h) Cross-reference to BI-026 `smart_connections_similar` for the source-keyed flavour. Update [docs/tools/index.md](../../docs/tools/index.md) — add one line for `smart_connections_query`. NO header required per BI-005 FR-019.

**Checkpoint after T014**: User Story 5 complete; registry-consistency test passes; help tool surfaces the new tool's docs.

---

## Phase 5: BI-026 Cohort-Consistency Ripples (per FR-013a + FR-020a)

**Purpose**: Apply two retroactive patches to `smart_connections_similar` for cohort consistency. Both ripples additive at the wire — existing callers unaffected.

**Independent Test**: BI-026's existing 63 handler/schema/registration tests STILL PASS. Three NEW regression tests pass. `_register-baseline.json` fingerprint for `smart_connections_similar` is UNCHANGED. The drift detector + baseline test at `_register-baseline.test.ts` PASS.

### Implementation for BI-026 ripples

- [ ] T015 Refactor [src/tools/smart_connections_similar/handler.ts](../../src/tools/smart_connections_similar/handler.ts) per FR-020a: (a) swap the inline `isVaultRegistered` helper (lines 129–141 in the pre-refactor file) for an import from the new shared module — `import { detectIfClosed } from '../_eval-vault-closed-detection/index.js'`; (b) replace the stage-0 inline detection block (lines 47–88) with a call to `detectIfClosed({ vaultName, deps })` — if it returns `true`, throw the same UpstreamError as before; (c) preserve BYTE-IDENTICAL error messages, `details` field shapes, and `target_mode` handling. Run `npx vitest run src/tools/smart_connections_similar` AFTER the change; assert all existing tests PASS without modification. Compare against the T0.4 baseline.

- [ ] T016 Add `details.reason: 'api-missing'` to the existing `SMART_CONNECTIONS_NOT_READY` emission path in [src/tools/smart_connections_similar/handler.ts](../../src/tools/smart_connections_similar/handler.ts) `mapEnvelopeError` switch case (per FR-013a). Change `case "SMART_CONNECTIONS_NOT_READY": return new UpstreamError({ ..., details: { stage: "envelope-error", code, detail }, ... })` to `case "SMART_CONNECTIONS_NOT_READY": return new UpstreamError({ ..., details: { stage: "envelope-error", code, reason: "api-missing", detail }, ... })`. This single line addition makes BI-026's NOT_READY emission carry the same `details.reason` field that BI-027's NOT_READY emissions carry — preserves cohort exhaustiveness per ADR-015 worked-example pattern.

- [ ] T017 Add 3 new regression cases to [src/tools/smart_connections_similar/handler.test.ts](../../src/tools/smart_connections_similar/handler.test.ts) per FR-013a / FR-020a: (1) `details.reason: "api-missing"` emission verified on the existing `env.smart_sources` undefined path; (2) `details.reason: "api-missing"` emission verified on the existing `find_connections` method-missing path; (3) behaviour-preservation regression — the refactored stage-0 closed-vault detection produces byte-equal error responses to the pre-refactor inline implementation (use captured fixture strings from T0.4 baseline). Carry header per Constitution V (header unchanged from the existing file — these are new test cases in the existing describe block).

**Checkpoint after T015–T017**: BI-026 ripples landed; behaviour-preserving refactor verified; cohort exhaustiveness for `details.reason` achieved. The `_register-baseline.json` fingerprint for `smart_connections_similar` is UNCHANGED (verified by running `npm run baseline:write` AND `git diff src/tools/_register-baseline.json` — only the new `smart_connections_query` row appears in the diff).

---

## Phase 6: Registration, Baseline, and Release Mechanics

**Purpose**: Wire the new tool into the server, roll the FR-018 baseline forward, bump the version, update the CHANGELOG and README.

### Implementation

- [ ] T018 Edit [src/server.ts](../../src/server.ts): (a) add import `import { createSmartConnectionsQueryTool } from './tools/smart_connections_query/index.js'`; (b) add `createSmartConnectionsQueryTool({ logger, queue })` to the tools array at the alphabetical position BETWEEN `createSetPropertyTool(...)` and `createSmartConnectionsSimilarTool(...)` (ASCII: `smart_connections_query/` < `smart_connections_similar/` because `q` < `s`). Two-line diff total.

- [ ] T019 Run `npm run baseline:write` to roll [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) forward per FR-018. Verify via `git diff src/tools/_register-baseline.json` that ONLY the new `smart_connections_query` entry is added; BI-026's `smart_connections_similar` entry is UNCHANGED (cohort-consistency gate per FR-020a / SC-015).

- [ ] T020 Bump version in [package.json](../../package.json) from `"version": "0.5.3"` to `"version": "0.5.4"` (PATCH bump per FR-028 — additive surface). Update `description` string to mention `smart_connections_query` alongside the existing typed tools (insert in alphabetical position before `smart_connections_similar`).

- [ ] T021 Add release notes entry to [CHANGELOG.md](../../CHANGELOG.md) under a new `## [0.5.4]` heading. Required sections: a brief summary line ("Adds `smart_connections_query` typed tool — semantic search over vault blocks from a free-text query."); a Migration section (none needed — additive); an Internal section listing the new cross-cutting `_eval-vault-closed-detection/` shared module AND the BI-026 ripples (refactor to consume shared module; `details.reason: "api-missing"` addition on existing NOT_READY emission); a References section linking spec.md / plan.md / data-model.md / quickstart.md / ADR-013 / ADR-014 / ADR-015.

- [ ] T022 [P] Update [README.md](../../README.md) — add `smart_connections_query` to the tools-list section (if present) in alphabetical position. Attributions section unchanged (no new lifted code; the wrapper is original logic over the plugin's lookup API).

- [ ] T023 [P] Update [docs/tools/index.md](../../docs/tools/index.md) — add one-line entry for `smart_connections_query` in alphabetical position (parity with how BI-026 added `smart_connections_similar`).

**Checkpoint after T018–T023**: Tool registered; baseline rolled forward; version bumped; release notes complete. Public surface unchanged for existing tools (regression gate via baseline + full test suite).

---

## Phase 7: Polish & Verify-Fails-First Sanity Check

**Purpose**: Run the full quality gate suite; perform the once-per-feature verify-fails-first sanity check; confirm zero regressions across the existing test surface.

### Implementation

- [ ] T024 Run the full quality gate locally before commit: `npm run lint && npm run typecheck && npm run build && npx vitest run` — assert zero warnings from lint, clean tsc, successful build, all tests pass. Capture the test-count delta: pre-BI-027 baseline + 70 new tests = new total. Confirm coverage stays at or above the 91.3% aggregate-statements floor.

- [ ] T025 Verify-fails-first sanity check (per BI-023 / BI-024 / BI-025 / BI-026 precedent; once per feature, manually). Temporarily comment out ONE non-trivial line in `src/tools/smart_connections_query/handler.ts` (e.g. the `Number.isFinite` filter in the in-eval template substitution — change `.filter(m=>Number.isFinite(m.score))` to `.filter(m=>true)`). Re-run `npx vitest run src/tools/smart_connections_query`. Confirm: (a) at least one test FAILS; (b) the failing test is the non-finite-score-filter case from T011. Restore the line. Re-run; confirm all PASS. This is the once-per-feature sanity check that the test suite actually exercises the code it claims to test.

- [ ] T026 Run [quickstart.md](quickstart.md) manual scenarios Q-26 + Q-27 against a real Smart Connections-installed vault (e.g. "The Setup"). Confirm Q-26 end-to-end default-mode happy path returns sensible block-level matches with finite scores. Confirm Q-27 empty-vault probe (if you have an empty Smart Connections vault to test with — OPTIONAL) returns `{count: 0, matches: []}`. Document the live-CLI response shapes in research.md under `## T0 Live-CLI Capture (yyyy-mm-dd)` (or append to T001's section if already present).

**Checkpoint after T024–T026**: All quality gates pass; verify-fails-first confirms the test suite is structurally sound; live-CLI end-to-end happy path validated against a real Smart Connections vault. Ready to commit + open PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks.
- **Foundational (Phase 2)**: T001 live-CLI probes can run in parallel with T002–T006 (shared module) — T001 is informational; T002–T006 are buildable. T001's case T0.4 (BI-026 baseline) MUST complete BEFORE T015 (BI-026 refactor). T001's case T0.1 informs the closed-vault module shape but doesn't block T002–T006.
- **User Story 1 (P1 — bundled with US2/US3/US4)**: depends on T004 / T006 from the shared module (closed-vault detector). T007–T013 can begin in parallel with T001 / T002 / T003 / T005.
- **User Story 5 (P2)**: depends on T012 (the tool must be registered before docs are useful). T014 can run in parallel with the BI-026 ripples (Phase 5).
- **BI-026 Ripples (Phase 5)**: depends on T004 / T006 (shared module) + T001's T0.4 (baseline). T015–T017 can run in parallel within the phase IF careful (T016 / T017 touch the same file as T015; sequence them).
- **Release Mechanics (Phase 6)**: T018 depends on T012; T019 depends on T018 + T015 + T016 (baseline must reflect the registered tool AND the BI-026 ripple); T020–T023 run in parallel after T018.
- **Polish (Phase 7)**: depends on every prior phase completing.

### Within Each User Story (US1 — bundled)

- T007 (schema) → T008 (schema tests) in parallel (different file pairs).
- T009 (template) → independent of T007/T008.
- T010 (handler) depends on T007 + T009.
- T011 (handler tests) depends on T010.
- T012 (index) depends on T007 + T010.
- T013 (index tests) depends on T012.

### Parallel Opportunities

- T002 / T003 / T004 / T005 / T006 all marked [P] — different files, in the new shared module — can run together.
- T007 / T008 / T009 marked [P] — different files in the new tool module — can run together.
- T022 / T023 marked [P] — different docs files.
- T011's 26 test cases can be developed in parallel within the same file (TypeScript-level; vitest runs them serially per default).

---

## Parallel Example: User Story 1 (the MVP)

```bash
# Launch in parallel:
Task T007: Create src/tools/smart_connections_query/schema.ts
Task T009: Create src/tools/smart_connections_query/_template.ts
Task T002: Create src/tools/_eval-vault-closed-detection/registry-parser.ts
Task T004: Create src/tools/_eval-vault-closed-detection/detector.ts

# After T007 + T009 + T004 complete:
Task T010: Create src/tools/smart_connections_query/handler.ts

# After T010 completes:
Task T011: Create src/tools/smart_connections_query/handler.test.ts
Task T012: Create src/tools/smart_connections_query/index.ts (depends on T007 + T010)
```

---

## Implementation Strategy

### MVP First (User Story 1 + bundled US2/US3/US4)

1. Run T001 (T0 live-CLI probes) AND T002–T006 (shared module) in parallel.
2. Land T007–T013 (the new tool module).
3. Land T014 (docs).
4. Land T015–T017 (BI-026 ripples).
5. Land T018–T023 (registration + baseline + release mechanics).
6. Land T024–T026 (polish + verify-fails-first + live-CLI E2E).

### Incremental Delivery

This BI is **atomically shipped** as one PR — the new tool + the shared module + the BI-026 ripples form a single coherent ship per CONTRIBUTING.md scope-honesty (the shared module and the BI-026 ripples both exist for BI-027's sake). Sub-stories US1/US2/US3/US4 share source files and cannot be separated; US5 (docs) is the only file that could in principle ship later, but the BI-005 registry-consistency test would fail without the docs file, so ship all together.

### Parallel Team Strategy

With multiple developers (unlikely for this size of BI):

- Developer A: T001 (T0 probes) + T002–T006 (shared module)
- Developer B: T007–T013 (new tool)
- Developer C: T014 (docs) + T015–T017 (BI-026 ripples)
- Developer D: T018–T023 (release mechanics)

All converge for T024–T026 (polish).

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in this list.
- [Story] label maps task to specific user story for traceability. Setup / Foundational / Polish phases have no story label.
- Each task ships its tests in the same commit per Constitution Principle II.
- The verify-fails-first sanity check (T025) is once per feature, manually.
- The BI-026 ripple regression tests (T017) lock cohort consistency; the FR-018 baseline (T019) locks the registry shape.
- Commit cuts: per CONTRIBUTING.md scope-honesty, propose at least three logical commits — (1) shared module + tests; (2) new tool + tests + docs + registration; (3) BI-026 ripples + tests. Plus the release-mechanics commit. /speckit-git-commit will decide.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence, skipping the verify-fails-first sanity check.
