---
description: "Task list for 037-pattern-search — ECMAScript-regex search across vault markdown notes"
---

# Tasks: Pattern Search — ECMAScript-Regex Search Across Vault Markdown Notes

**Input**: Design documents from [`/specs/037-pattern-search/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in the same change-set). Tests are NOT a separate red/green TDD loop; every implementation task lands with its co-located test cases in the same task. Test scope is unit-only (project memory `feedback_test_scope`); manual / TC-XXX cases live in the user's external tracker. Total target: ~50 tests across the new module (~16 schema / ~28 handler / ~6 registration).

**Organization**: Tasks are grouped by user story per the project convention. The `pattern_search` module is fundamentally a **single atomic ship** — Stories 1, 2, 3 share the same four source files (`schema.ts`, `_template.ts`, `handler.ts`, `index.ts`) and the same monolithic eval template (parity with BI-036 / BI-025). The `[USx]` tags mark primary-story attribution for each implementation task; US2 (folder scope) and US3 (case-sensitivity toggle) are sub-stories of the same module and ride along the US1 ship (no separate code paths).

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code; full detail in [research.md](research.md)):

- **R1 — `eval` subcommand load-bearing**: handler routes through `obsidian eval code=<rendered-js>` to instantiate the user's regex inside the Obsidian Node runtime. Q1 dialect lock (ECMAScript) is satisfied by construction — the template's `new RegExp(pattern, flags)` runs in V8 with full JavaScript regex semantics. T0.1 confirms the round-trip at the live-CLI probe step.
- **R2 — Three-key sort order**: `(path asc UTF-16, line asc, offset asc)`. Third key is new vs BI-033 / BI-035 — required because FR-003 emits one entry per occurrence on a line.
- **R3 — `limit` parameter + implicit 1000 cap + max 10000**: sibling parity with BI-033 FR-010 / FR-011 and BI-035.
- **R4 — Case-sensitivity default flips to `true`** (spec FR-007). Diverges from BI-035 (which defaults to case-insensitive because the upstream `obsidian search` does). Agents porting predicates between tools must opt into case-insensitive matching explicitly via `case_sensitive: false`.
- **R5 — Reuse `stripBoundarySlashes` from `../search/handler.ts`** for folder normalisation. No duplication; sibling-consumption pattern matches BI-035.
- **R6 — `.md`-only file set** via `app.vault.getMarkdownFiles()` in-template plus a wrapper-side defensive `.md` filter (BI-033 FR-017 parity).
- **R7 — Invalid pattern routed through `VALIDATION_ERROR`** via a zod `superRefine` that runs `new RegExp(pattern, flags)` in try/catch. Zero new top-level codes, zero new `details.code` values — Principle IV streak preserved at sixteen typed tools.
- **R8 — Zero-length match skip** enforced inside the eval template (FR-016 per Q3 clarification 2026-05-17). Advances `re.lastIndex` past zero-width hits to guarantee termination.
- **R9 — Truncation detected in-template** — the template owns the count and stops collecting at the cap, emitting `truncated: true` when the cap fires. Simpler than BI-035's two-condition conservative trick.
- **R10 — `text` field capped at 500 UTF-16 code units + `…` (U+2026)** (per Q2 clarification 2026-05-17). Sibling parity with BI-033 FR-024. Matched-substring (`match` field) is NEVER capped.
- **R12 — Base64 anti-injection**: frozen JS template with single `__PAYLOAD_B64__` substitution. User-supplied `pattern` / `folder` / `case_sensitive` / `limit` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime` via `composeEvalCode` from `../_shared.js`. No user input ever reaches the JS source as text. Parity with BI-014 / BI-019 / BI-025 / BI-036.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list).
- **[Story]**: Which user story this task primarily delivers. Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative.

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `context_search` / `backlinks` / `paths` / `find_by_property` / `smart_connections_similar`). All paths are relative to the repo root. Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at `src/tools/pattern_search/` (does NOT exist yet — created by T002–T008).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–036). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler against verified upstream behaviour for the six probes defined in [research.md § R11](research.md#r11--t0-live-cli-probe-plan).

**⚠️ CRITICAL**: T001 below MUST complete before user story work begins. If T0.1 fails (eval cannot construct `RegExp`), the plan pivots per OBC-2 to a `paths` + `read` chained execution path; if T0.3 surfaces a different folder-not-found envelope shape, the wrapper-side mapping is adjusted before T005 lands.

- [ ] T001 Live-CLI characterisation of T0.1..T0.6 against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from the scratch subdirectory after capture. Cases:

  - **(T0.1) Eval round-trips a regex inside the Obsidian Node runtime**: invoke `obsidian -v <test-vault> eval code="(()=>{return new RegExp('BI-\\\\d{4}').test('BI-0042');})()"`. **Expected**: stdout reads `true`. **TRIGGER**: if stdout differs or stderr surfaces, pivot to OBC-2 fallback (`paths` + `read` chained path) and revise R1 in research.md.

  - **(T0.2) `app.vault.getMarkdownFiles()` matches `.md` set**: invoke `obsidian -v <test-vault> eval code="(()=>{return JSON.stringify(app.vault.getMarkdownFiles().map(f=>f.path).sort());})()"` and compare against `obsidian -v <test-vault> paths --ext md` output. **Expected**: identical sorted set. **TRIGGER**: if drift, revise R6 — the wrapper-side `.md` filter must reconcile the divergence.

  - **(T0.3) Folder-not-found envelope shape**: invoke `obsidian -v <test-vault> eval code="(()=>{const s=await app.vault.adapter.stat('NoSuchFolder');return JSON.stringify({stat:s});})()"`. **Expected**: stat returns `null` (the wrapper template will translate `null` to a `{ ok: false, code: "FOLDER_NOT_FOUND", folder }` envelope). **TRIGGER**: if stat throws or returns a non-null value for the missing folder, revise the template's folder-existence check.

  - **(T0.4) Zero-match envelope shape**: invoke the full pattern_search eval template against the test vault with `pattern: "Z{50}"` (no hits). **Expected**: envelope `{ ok: true, count: 0, matches: [] }` (NOT the CLI's `"No matches found."` stdout — eval-driven tools own their stdout shape). **TRIGGER**: if envelope differs, revise the template's empty-collection emission.

  - **(T0.5) Zero-length match skip**: invoke the full pattern_search eval template against the test vault with `pattern: "^"`. **Expected**: envelope `{ ok: true, count: 0, matches: [] }` — the lastIndex-advance idiom drops every zero-width hit at line start. The call returns within the 10-second cli-adapter bound. **TRIGGER**: if entries appear or the call times out, revise R8.

  - **(T0.6) 500-cap clip**: seed `_scratch/037/long-line.md` under the test vault scratch directory with a single 1000-char line containing `needle` at offset 540. Invoke pattern_search with `pattern: "needle", folder: "_scratch/037"`. **Expected**: response `text.length === 501` (500 chars + `…`); `match === "needle"`; `offset === 540`. **TRIGGER**: if the cap fires before/after 500 chars or the marker is wrong, revise R10. Clean up `_scratch/037/long-line.md` after capture.

**Checkpoint**: Foundational characterisation complete. Eval round-trip, `.md` enumeration, folder-existence stat semantic, zero-match envelope shape, zero-length-skip behaviour, and 500-cap clip all confirmed against the live vault. User-story implementation can now begin. If any probe surfaces a TRIGGER, pause and update the spec / plan before proceeding to T002.

---

## Phase 3: User Story 1 — Search vault for a regex pattern (Priority: P1) 🎯 MVP

**Goal**: Add the typed `pattern_search` MCP tool surface that returns `{ count, matches: [{ path, line, offset, match, text }], truncated? }` for an ECMAScript-regex predicate scanned across every markdown note in a vault. Covers FR-001..FR-005, FR-008, FR-009, FR-010, FR-012, FR-013, FR-014, FR-015, FR-016 (whole-vault regex search + per-occurrence emission + locator + line cap + match-intact + truncation signal + zero-match-as-success + invalid-pattern rejection + line-scoped matching + plain-text scanning + single-vault + read-only + zero-length skip).

**Independent Test**: Invoke `pattern_search({ pattern: "BI-\\d{4}", vault: "<vault>" })` against the test vault with seed notes carrying known BI-NNNN occurrences; assert response shape `{ count, matches: [{path, line, offset, match, text}] }` with correct entries in `(path, line, offset)` ascending order. Per [quickstart.md](quickstart.md) Scenario 1.

> **Note on bundled stories**: T002–T010 below are the single source implementation that delivers Stories 1, 2, 3 in one atomic ship (parity with BI-036 / BI-025 — the eval template is monolithic and cannot be incrementally extended). The `[US1]` tag marks primary-story attribution; US2 (folder scope) and US3 (case-sensitivity toggle) ride along (no separate code paths). Story-tag breakdown by file:
>
> - schema.ts → US1 (default-mode shape: `pattern`, `limit`, `vault`) + US2 (`folder` field + non-empty refinement) + US3 (`case_sensitive` boolean field) + cross-cutting (invalid-pattern `superRefine`, strict additionalProperties)
> - _template.ts → US1 (RegExp instantiation + line-by-line `matchAll` + zero-length skip + 500-cap + cap-and-truncated emission) + US2 (folder-prefix filter + folder-existence stat + `FOLDER_NOT_FOUND` envelope) + US3 (`i`-flag application based on `case_sensitive`)
> - handler.ts → US1 (single `invokeCli` + JSON parse + envelope-error mapping + `(path, line, offset)` sort + output validation)
> - index.ts → US1 (registration)
> - docs/tools/pattern_search.md → cross-cutting (deferred to Phase 6)

### Implementation for User Story 1 (MVP — bundled with US2/US3)

- [ ] T002 [P] [US1] Create [src/tools/pattern_search/schema.ts](../../src/tools/pattern_search/schema.ts) per [data-model.md § PatternSearchInput](data-model.md#patternsearchinput) and [data-model.md § PatternSearchOutput](data-model.md#patternsearchoutput). Export `patternSearchInputSchema = z.object({ pattern: z.string().min(1, "pattern is required").max(1000, "pattern exceeds 1000 chars"), folder: z.string().min(1).optional(), limit: z.number().int().min(1, "limit must be >= 1").max(10000, "limit must be <= 10000").optional(), case_sensitive: z.boolean().optional(), vault: z.string().min(1).optional() }).strict().superRefine((v, ctx) => { ... })`. The `superRefine` block: (a) emit a Zod issue on `v.pattern.trim().length === 0` with `path: ["pattern"], message: "pattern is empty or whitespace-only"`; (b) wrap `new RegExp(v.pattern, v.case_sensitive === false ? "i" : "")` in try/catch — on `SyntaxError`, emit a Zod issue with `path: ["pattern"], message: cause.message, code: z.ZodIssueCode.custom`. Export `patternSearchMatchSchema = z.object({ path: z.string().min(1), line: z.number().int().min(1, "line is 1-based"), offset: z.number().int().min(0, "offset is 0-based"), match: z.string().min(1, "match must be non-empty (FR-016 zero-length skip)"), text: z.string() }).strict()`. Export `patternSearchOutputSchema = z.object({ count: z.number().int().nonnegative(), matches: z.array(patternSearchMatchSchema), truncated: z.literal(true).optional() }).strict().refine((o) => o.count === o.matches.length, "count must equal matches.length")`. Export the in-process wire envelope: `patternSearchEvalEnvelopeSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), count: z.number().int().nonnegative(), matches: z.array(patternSearchMatchSchema), truncated: z.literal(true).optional() }).strict(), z.object({ ok: z.literal(false), code: z.literal("FOLDER_NOT_FOUND"), folder: z.string().min(1) }).strict()])`. Inferred types: `PatternSearchInput`, `PatternSearchMatch`, `PatternSearchOutput`, `PatternSearchEvalEnvelope` via `z.infer`. Carry the `// Original — no upstream. pattern_search input/output/eval-envelope schemas — ECMAScript-regex search predicate with optional folder scope, optional case_sensitive toggle (default true per FR-007), optional limit (1..10000, implicit 1000); strict per-entry match shape carries path/line/offset/match/text; discriminated-union eval-envelope wire format mirrors the in-eval IIFE return shape including FOLDER_NOT_FOUND failure branch.` header per Constitution V.

- [ ] T003 [P] [US1] Create [src/tools/pattern_search/schema.test.ts](../../src/tools/pattern_search/schema.test.ts) with ~16 cases covering the validation roster. Cases: (1) minimal happy `{ pattern: "BI-\\d{4}" }`; (2) full happy `{ pattern: "TODO", folder: "Projects", case_sensitive: false, limit: 50, vault: "Personal" }`; (3) empty pattern → fail with `path: ["pattern"]`; (4) whitespace-only pattern (`"   "`) → fail with `path: ["pattern"]`; (5) pattern exceeds 1000 chars → fail with `path: ["pattern"]`; (6) invalid regex `"BI-(\\d{4}"` (unbalanced paren) → fail with `path: ["pattern"]`, `code: "custom"`, message contains `Invalid regular expression`; (7) invalid regex under `case_sensitive: false` (verifies the `superRefine` instantiates with the correct flag) — pattern `"(?<="` (unsupported lookbehind syntax variant or another shape that fails only when flags applied) → fail with `path: ["pattern"]`; (8) `folder: ""` → fail with `path: ["folder"]`; (9) `limit: 0` → fail with `path: ["limit"]`; (10) `limit: 10001` → fail with `path: ["limit"]`; (11) `limit: 1.5` (non-integer) → fail with `path: ["limit"]`; (12) `case_sensitive: "true"` (string, not boolean) → fail with `path: ["case_sensitive"]`; (13) `vault: ""` → fail with `path: ["vault"]`; (14) unknown top-level key `{ pattern: "x", surprise: 1 }` → fail with `path: ["surprise"]` (strict mode); (15) missing pattern → fail with `path: ["pattern"]`; (16) JSON Schema round-trip via `toMcpInputSchema` emits expected shape with `additionalProperties: false`. Carry `// Original — no upstream. pattern_search schema tests.` header.

- [ ] T004 [P] [US1] Create [src/tools/pattern_search/_template.ts](../../src/tools/pattern_search/_template.ts). Export `JS_TEMPLATE` as a literal string — a synchronous (or `await`-using) IIFE that: (a) decodes the base64 payload via `B64_PAYLOAD_DECODE_EXPR` (imported from `../_shared.js`); (b) parses payload `{ pattern: string, folder: string | null, case_sensitive: boolean, limit: number }`; (c) constructs `const flags = a.case_sensitive ? "g" : "gi"` and `const re = new RegExp(a.pattern, flags)` (`g` is mandatory for `String.prototype.matchAll`); (d) if `a.folder !== null`, calls `const s = await app.vault.adapter.stat(a.folder); if (s === null) return JSON.stringify({ ok: false, code: "FOLDER_NOT_FOUND", folder: a.folder });` (R5 + T0.3 envelope shape); (e) enumerates files via `app.vault.getMarkdownFiles()` and filters to those whose `f.path` starts with `a.folder + "/"` when folder is supplied; (f) for each file, awaits `app.vault.cachedRead(f)`, splits on `/\r?\n/` (CRLF defence — splits on either LF or CRLF), iterates lines with 1-based index; (g) for each line, sets `re.lastIndex = 0`, loops `while ((m = re.exec(line)) !== null)`: if `m.index === re.lastIndex` (zero-width) → `re.lastIndex++` and continue (R8 + Q3 zero-length skip); else push `{ path: f.path, line: lineIdx, offset: m.index, match: m[0], text: line.length > 500 ? line.slice(0, 500) + "…" : line }` (R10 + Q2 500-cap) and break out of the per-line loop when `out.length >= cap` (early termination); (h) tracks `truncated` flag — if cap is hit OR more lines remain unscanned at cap firing, set `truncated = true`; (i) emits `JSON.stringify({ ok: true, count: out.length, matches: out, ...(truncated ? { truncated: true } : {}) })`. Carry `// Original — no upstream. Frozen JS template for the pattern_search eval subcommand — base64 payload anti-injection (R12); ECMAScript-regex evaluation via Node RegExp in the Obsidian runtime (Q1 dialect lock); .md-only file enumeration via app.vault.getMarkdownFiles() with folder-prefix filter; per-line String.prototype.matchAll iteration with zero-length match skip (R8 / Q3); 500-UTF-16-code-unit line cap with `…` (U+2026) marker (R10 / Q2); in-template truncation detection (R9); discriminated envelope { ok: true | false } with FOLDER_NOT_FOUND failure branch (R5 / T0.3).` header.

- [ ] T005 [US1] Create [src/tools/pattern_search/handler.ts](../../src/tools/pattern_search/handler.ts). Export `executePatternSearch(input: PatternSearchInput, deps: ExecuteDeps): Promise<PatternSearchOutput>`. Logic:

  1. **Folder normalisation** via `stripBoundarySlashes` imported from `../search/handler.js` (R5). Empty post-strip → treat as omitted.
  2. **Effective cap** = `input.limit ?? 1000` (R3).
  3. **Payload assembly** per [data-model.md § WireEnvelope](data-model.md#wireenvelope-in-process): `payload = { pattern: input.pattern, folder: normalisedFolder ?? null, case_sensitive: input.case_sensitive !== false, limit: appliedCap }`. Render via `composeEvalCode(JS_TEMPLATE, payload)` (imported from `../_shared.js`).
  4. **ONE `invokeCli` invocation** (R2 / single-spawn invariant): `await invokeCli({ command: "eval", vault: input.vault, parameters: { code }, flags: [], target_mode: "specific" }, { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })`.
  5. **Stage 0 — strip eval prefix**: `let stdout = result.stdout.trimStart(); if (stdout.startsWith("=> ")) stdout = stdout.slice(3);`.
  6. **Stage 1 — closed-but-registered vault detection**: when `typeof input.vault === "string"` AND `result.stdout.trim().length === 0`, delegate to `detectIfClosed({ vaultName: input.vault, deps })` from `../_eval-vault-closed-detection/index.js`. On `true`, throw `UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { code: "VAULT_NOT_FOUND", reason: "not-open", stage: "handler-stage-0", vault: input.vault }, message: "pattern_search: vault \"" + input.vault + "\" is registered but not open" })`. Sibling parity with `paths` handler.
  7. **Stage 2 — JSON.parse**: try/catch; on failure throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: err, details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) }, message: "pattern_search: CLI stdout was not valid JSON: " + (err as Error).message })`.
  8. **Stage 3 — envelope safeParse**: `const validated = patternSearchEvalEnvelopeSchema.safeParse(parsedJson)`; on failure throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: validated.error, details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) }, message: "pattern_search: CLI JSON failed envelope wire-schema parse" })`.
  9. **Stage 4 — discriminate on `ok`**: if `validated.data.ok === false`, throw `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { code: "FOLDER_NOT_FOUND", folder: validated.data.folder, stage: "handler-stage-3" }, message: "pattern_search: folder not found in vault" })`. Otherwise:
  10. **Post-process** the `ok: true` branch: defensively filter matches to `m.path.toLowerCase().endsWith(".md")` (R6 defence-in-depth); sort by `(path, line, offset)` ascending per R2: `matches.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : (a.line - b.line) || (a.offset - b.offset))`; validate via `patternSearchOutputSchema.parse({ count: sorted.length, matches: sorted, ...(validated.data.truncated ? { truncated: true as const } : {}) })`; return.

  Type definitions: `export interface ExecuteDeps { logger: Logger; queue: Queue; spawnFn?: SpawnLike; env?: NodeJS.ProcessEnv; }`. Carry `// Original — no upstream. pattern_search handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R12 anti-injection); single-call architecture (R2); folder normalisation via stripBoundarySlashes (R5 sibling-consumption from ../search/handler.ts); closed-but-registered-vault detection via the shared _eval-vault-closed-detection module (sibling parity with paths); multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse / FOLDER_NOT_FOUND; (path, line, offset) ascending sort (R2); zero new top-level error codes; zero new details.code values — Principle IV streak preserved.` header.

- [ ] T006 [US1] Create [src/tools/pattern_search/handler.test.ts](../../src/tools/pattern_search/handler.test.ts) with ~28 cases. Inject stub `invokeCli` via `deps.spawnFn` stub returning `{stdout: '=> ' + JSON.stringify(envelopeFixture), stderr: '', exitCode: 0}` per the cli-adapter test-seam convention (mirror BI-036 / BI-035 pattern). Per-test assertions: (a) `spawnFn.mock.calls.length === 1` (single-spawn invariant per R2); (b) for any test exercising the payload, decode the `code=` argv via base64 → assert the decoded payload matches the user input bit-for-bit (R12 anti-injection structural lock); (c) for envelope-error tests, assert the thrown UpstreamError carries the correct `code` AND `details.stage` AND `details.code` AND (where applicable) `details.folder`.

  **US1 happy paths**: (1) `pattern: "BI-\\d{4}"` against a 3-match envelope → response `{count: 3, matches: [3 entries with path/line/offset/match/text]}`, sorted; (2) zero-match envelope → `{count: 0, matches: []}` (FR-009, no error); (3) multi-match per line (3 occurrences of `foo` on one line) → 3 entries differing only in `offset`, sorted ascending; (4) cross-file matches → entries from different paths sorted by `path` UTF-16 first.

  **US1 line-cap (R10 / Q2)**: (5) line ≤ 500 chars → `text` returned verbatim; (6) line > 500 chars → `text.length === 501` (500 + `…`); (7) match begins at offset 540 (past the 500-cap) → `text` is clipped prefix + `…` AND `match` field carries the full matched substring intact.

  **US1 zero-length skip (R8 / Q3)**: (8) envelope where the template emits zero entries for `pattern: "^"` → response `{count: 0, matches: []}`; (9) envelope where the template emits one non-empty match on a line that also has zero-width matches → response carries the single non-empty entry.

  **US1 truncation (R9 / R3)**: (10) envelope with 1000 entries + `truncated: true` (implicit cap fire) → response carries 1000 entries AND `truncated: true`; (11) envelope with 50 entries + `truncated: true` (explicit `limit: 50` fire) → response carries 50 entries AND `truncated: true`, AND the decoded payload carries `limit: 50`; (12) envelope with 5000 entries + NO truncated (explicit `limit: 5000`, underlying set fits) → response carries 5000 entries AND `truncated` is ABSENT.

  **US1 error paths** (cross-validate the closed-but-registered + JSON-parse + envelope-parse cohort): (13) closed-but-registered vault — stub `invokeCli` returns `{stdout: "", stderr: "", exitCode: 0}` AND stub `detectIfClosed` returns `true` → assert wrapper throws `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND", details.reason: "not-open")`; (14) unknown vault — stub `invokeCli` rejects with `UpstreamError(CLI_REPORTED_ERROR, details.message: "Vault not found.")` simulating the 011-R5 clause → assert error propagates verbatim; (15) stdout malformed — stub stdout `=> not valid json` → assert wrapper throws `CLI_REPORTED_ERROR(stage: "json-parse")`; (16) envelope schema mismatch — stub stdout `=> {"ok":true,"count":5,"matches":[],"surprise":"extra"}` → assert wrapper throws `CLI_REPORTED_ERROR(stage: "envelope-parse")`; (17) output-cap kill — stub `invokeCli` rejects with `UpstreamError(CLI_NON_ZERO_EXIT)` simulating the 10 MiB output-cap-kill → assert wrapper propagates verbatim.

  **US2 folder scope** (4 cases): (18) folder happy — `folder: "Projects"` against an envelope where matches come from `Projects/*.md` files only → assert decoded payload carries `folder: "Projects"`; (19) folder normalisation — input `folder: "/Projects/"` → assert decoded payload carries `folder: "Projects"` (`stripBoundarySlashes` applied); (20) folder normalisation empty post-strip — input `folder: "/"` → assert decoded payload carries `folder: null` (whole-vault scan); (21) folder-not-found — envelope `{ ok: false, code: "FOLDER_NOT_FOUND", folder: "NoSuchFolder" }` → assert wrapper throws `CLI_REPORTED_ERROR(details.code: "FOLDER_NOT_FOUND", details.folder: "NoSuchFolder", details.stage: "handler-stage-3")` (FR-011).

  **US3 case-sensitivity** (3 cases): (22) default omitted → decoded payload `case_sensitive: true` (FR-007 default flip from BI-035); (23) explicit `case_sensitive: true` → decoded payload `case_sensitive: true`; (24) explicit `case_sensitive: false` → decoded payload `case_sensitive: false`.

  **Structural data-passing (R12 anti-injection)** (added per BI-036 precedent): (25) decode the base64-encoded payload from the spawnFn spy's recorded argv (locate the `code=…` argv position; extract the base64 string after the `code=` prefix; decode via `Buffer.from(b64, 'base64').toString('utf-8')`); parse as JSON; assert the caller-supplied `pattern` / `folder` / `case_sensitive` / `limit` values appear ONLY inside this decoded JSON payload, NEVER as text-concatenated argv positions and NEVER as text-interpolated into the surrounding JS template body; verify the JS template string in the `code=` argv preserves the frozen prefix/suffix around the base64 substitution.

  **Deterministic + invariants**: (26) byte-identical repeated call — same input + same stub envelope → `JSON.stringify(r1) === JSON.stringify(r2)` (SC-003 stability); (27) sort invariant — envelope with intentionally unsorted matches → response is sorted by `(path, line, offset)` ascending; (28) response-key-set invariant — non-truncated response has `Object.keys(response).sort() === ["count", "matches"]`; truncated response has `Object.keys(response).sort() === ["count", "matches", "truncated"]`; locator inputs (`pattern`, `folder`, `vault`) NEVER appear in the response (read-tool no-echo per project memory `feedback_no_locator_echo_in_read_responses`).

  Carry `// Original — no upstream. pattern_search handler tests.` header. Total: ~28 cases.

- [ ] T007 [US1] Create [src/tools/pattern_search/index.ts](../../src/tools/pattern_search/index.ts). Export `createPatternSearchTool(deps: RegisterDeps): RegisteredTool` via the `registerTool` factory (parity with `context_search` / `backlinks`). Export `PATTERN_SEARCH_TOOL_NAME = "pattern_search"` constant. Export `PATTERN_SEARCH_DESCRIPTION` string — a one-paragraph description covering: typed envelope shape `{ count, matches: [{path, line, offset, match, text}], truncated? }`; required `pattern` (ECMAScript dialect — `\d`, `\b`, lookahead, lookbehind, named captures, `i` flag per Q1 clarification; 1..1000 chars; invalid regex → VALIDATION_ERROR path:["pattern"]); optional `folder` (recursive subtree-prefix match, leading/trailing `/` stripped); optional `limit` (1..10000, implicit 1000); **CRITICAL — optional `case_sensitive` (default `true`, FLIPS from sibling `context_search` default `false` per spec FR-007)**; optional `vault` (routes to focused vault when omitted); response invariant `count === matches.length`; sort order `(path, line, offset)` ascending; `text` capped at 500 UTF-16 + `…` per Q2; `match` substring NEVER capped; zero-length matches skipped per Q3 (`^`, `$`, `a*`, `\b`, lookarounds emit no entries for their zero-width hits); `truncated: true` only when cap fired (absent ≡ false); zero-match valid-pattern returns empty success (NOT error per FR-009); folder-not-found surfaces as `CLI_REPORTED_ERROR(details.code: "FOLDER_NOT_FOUND")`; unknown vault surfaces via cli-adapter `Vault not found.` classifier; closed-but-registered vault surfaces as `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND", details.reason: "not-open")`. Cross-pointer to `help({ tool_name: "pattern_search" })`. Cross-pointer to sibling `context_search` (BI-035) — "for literal keyword matching with simpler payloads, use `context_search`; pattern_search adds regex semantics at the cost of the per-line `offset` field and the case-sensitivity default flip". Carry `// Original — no upstream. pattern_search tool registration via registerTool — ECMAScript-regex search primitive returning a typed { count, matches: [{path, line, offset, match, text}], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. Sixteenth typed-tool wrap.` header.

- [ ] T008 [P] [US1] Create [src/tools/pattern_search/index.test.ts](../../src/tools/pattern_search/index.test.ts) with ~6 cases: (1) factory returns a `RegisteredTool` with `name === "pattern_search"` and `description.length > 0`; (2) `descriptor.inputSchema` round-trips through `toMcpInputSchema` with `additionalProperties: false`; (3) `descriptor.description.length > 300` (worked-example + dialect + default-flip-note budget); (4) deps wired through to handler invocations (smoke test against a stubbed `invokeCli`); (5) description contains the cross-pointer phrase referencing `context_search` (BI-035); (6) description contains the explicit case-sensitivity default flip note (callout phrase: "case-sensitive" AND "default"). Carry `// Original — no upstream. pattern_search registration tests.` header.

- [ ] T009 [US1] Modify [src/server.ts](../../src/server.ts) — add `createPatternSearchTool` import (alphabetical insertion — `pattern_search/` comes after `paths/` and before `properties/`) and a registration entry in the `tools: RegisteredTool[]` array: `createPatternSearchTool({ logger, queue })`. Position the entry alphabetically between `createPathsTool(...)` and `createPropertiesTool(...)`. Two-line touch only (one import + one array entry).

- [ ] T010 [US1] Regenerate [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) via `npm run baseline:write` AFTER T009's `server.ts` change is in place. The script produces the canonical JSON including fingerprint hashes for the new `pattern_search` entry. Do NOT hand-edit the JSON file. The helper module `src/tools/_register-baseline.ts` (fingerprint utilities) is NOT touched.

**Checkpoint**: US1 fully functional. Tool registered; schema parses; handler executes regex search via the eval template; tests pass against stubbed CLI responses. MVP shippable when T002–T010 pass (covers all three user stories' code paths bundled into one ship). The handler returns `{count, matches}` for valid inputs; throws structured `UpstreamError` for every failure mode; never silent-fails. Folder scope (US2) and case-sensitivity toggle (US3) are both live via the bundled implementation.

---

## Phase 4: User Story 2 — Scope the search to a folder (Priority: P2)

**Goal**: Optional `folder` parameter restricts the scan to notes under the named subtree; unknown folder surfaces a structured `FOLDER_NOT_FOUND` error rather than silent empty success.

**Independent Test**: Per [quickstart.md](quickstart.md) Scenarios 3 and 4.

**Implementation**: bundled with US1. The folder branch lives inside `_template.ts` per T004 (`app.vault.adapter.stat(a.folder)` existence check + `f.path.startsWith(a.folder + "/")` prefix filter). The folder-normalisation step lives inside `handler.ts` per T005 (`stripBoundarySlashes` from `../search/handler.js`). The envelope-error mapping lives inside `handler.ts` per T005's stage-4 (`FOLDER_NOT_FOUND` envelope → `CLI_REPORTED_ERROR(details.code: "FOLDER_NOT_FOUND")`). Tests covering US2 paths (handler.test.ts cases 18, 19, 20, 21) are part of T006's bundled test inventory.

No additional implementation tasks. US2 ships with the US1 bundled ship.

**Checkpoint**: US2 fully functional. Folder scope normalised; unknown folder surfaces typed error; whole-vault scan resumes when folder is omitted or normalises to empty. T006 cases 18–21 pass.

---

## Phase 5: User Story 3 — Control case sensitivity (Priority: P3)

**Goal**: Optional `case_sensitive` boolean toggle; default `true` (case-sensitive) per spec FR-007 — diverges from sibling `context_search` default.

**Independent Test**: Per [quickstart.md](quickstart.md) Scenario 3.

**Implementation**: bundled with US1. The `case_sensitive` field is declared on `patternSearchInputSchema` per T002. The flag is applied inside `_template.ts` per T004 (`const flags = a.case_sensitive ? "g" : "gi"`). Tests covering US3 paths (handler.test.ts cases 22, 23, 24) are part of T006's bundled test inventory. The default flip from sibling tools is called out in the `PATTERN_SEARCH_DESCRIPTION` per T007 and asserted via T008 case 6.

No additional implementation tasks. US3 ships with the US1 bundled ship.

**Checkpoint**: US3 fully functional. `case_sensitive: false` enables the `i` flag; omitted or `true` keeps case-sensitive matching. The default flip is documented in the tool description and verified at the registration test layer. T006 cases 22–24 pass.

---

## Phase 6: Documentation surface (cross-cutting)

**Goal**: Progressive-disclosure help facility surfaces full input contract, output shape, failure-mode roster, and worked examples per ADR-005 and the BI-005 registry-consistency boot-time assertion.

**Independent Test**: `help({ tool_name: "pattern_search" })` returns the full documentation block; boot-time `assertToolDocsExist` passes.

- [ ] T011 Create [docs/tools/pattern_search.md](../../docs/tools/pattern_search.md) (~180 lines) per ADR-005 surface requirements. Sections: (1) one-paragraph intro: regex search across markdown notes returning per-occurrence matches with `(path, line, offset, match, text)`; cross-pointer to sibling `context_search` (BI-035) for literal keyword matching; explicit call-out of the case-sensitivity default flip; (2) full per-field input contract (`pattern`, `folder`, `limit`, `case_sensitive`, `vault` — types, defaults, semantics, range constraints, the ECMAScript dialect lock per Q1 clarification 2026-05-17); (3) output shape (default + truncated variants) mirroring [contracts/output.md](contracts/output.md); (4) failure-mode roster mirroring [contracts/errors.md](contracts/errors.md) (`VALIDATION_ERROR` for invalid pattern / empty pattern / out-of-range limit / unknown key; `CLI_REPORTED_ERROR(details.code: "FOLDER_NOT_FOUND")` for unknown folder; `CLI_REPORTED_ERROR(details.message: "Vault not found.")` for unknown vault; `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND", details.reason: "not-open")` for closed-but-registered vault; `CLI_REPORTED_ERROR(details.stage: "json-parse" | "envelope-parse")` for malformed CLI output); (5) at least five worked examples covering distinct usage modes — recommended: pull from [quickstart.md](quickstart.md) Scenarios 1, 3, 4, 5, 8 (happy BI-token, folder-scope + case-insensitive, folder-not-found, invalid-pattern, truncation); (6) practical ceiling notes — implicit 1000-match cap (R3 / FR-008), max 10000 explicit, 10 MiB output-cap kill (ADR-007), 500-UTF-16 line cap with `…` marker (R10 / Q2), zero-length match skip (R8 / Q3); (7) ECMAScript-dialect note — `\d` is ASCII-only (no `u` flag exposed at v1 per research.md OBC-4), `\b` is ASCII word-boundary, lookbehind supported; (8) read-only note (FR-015 — find-and-replace explicitly out of scope, separate future tool); (9) plain-text scanning note (FR-013 — matches inside fenced code blocks / frontmatter / HTML comments are returned same as any other position; markdown-aware exclusion is out of scope). NO `// Original — no upstream.` header (docs files are exempt per BI-005 convention).

- [ ] T012 Modify [docs/tools/index.md](../../docs/tools/index.md) — add a one-line summary entry for `pattern_search` (alphabetical insertion between `paths` and `properties`). Mirror the existing entries' format. Example seed: `- [pattern_search](pattern_search.md) — regex search across vault markdown notes returning per-occurrence matches with line + offset locators (companion to [context_search](context_search.md) which is keyword-only)`.

**Checkpoint**: Documentation surface complete. The boot-time `assertToolDocsExist` aggregator at `src/tools/_register.ts` passes for the `pattern_search` entry. `help({ tool_name: "pattern_search" })` returns the full documentation block.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final release plumbing, quality gates, and pre-merge verification.

- [ ] T013 [P] Modify [CHANGELOG.md](../../CHANGELOG.md) — add a release entry under the next unreleased version section. Format mirror BI-036 / BI-035 entries:
  ```
  ## [0.6.5] - 2026-MM-DD

  ### Added
  - `pattern_search` typed tool — ECMAScript-regex search across vault markdown notes returning per-occurrence matches with `(path, line, offset, match, text)`. Companion to `context_search` (BI-035) which is keyword-only. Optional `folder` restricts the scan to a subtree; optional `case_sensitive` toggles case sensitivity (**default `true`** — diverges from `context_search`'s case-insensitive default per spec FR-007); optional `limit` overrides the implicit 1000-match cap in range 1..10000. Pattern dialect is ECMAScript (Node `RegExp`) per spec Clarification 2026-05-17 Q1; the matched substring is never capped, the surrounding line is capped at 500 UTF-16 code units with `…` (U+2026) per Q2; zero-length matches (`^`, `$`, `a*`, `\b`, lookarounds) are skipped per Q3. See `docs/tools/pattern_search.md` for the full input contract, ECMAScript-dialect notes, and worked examples. Sixteenth typed-tool wrap; fourteenth eval-cohort tool. Zero new top-level error codes — Constitution Principle IV streak preserved at sixteen typed tools (invalid pattern routes through `VALIDATION_ERROR`). (BI-037)
  ```

- [ ] T014 [P] Modify [package.json](../../package.json) — bump `version` from `0.6.4` to `0.6.5` (PATCH per BI-023 / BI-024 / BI-025 / BI-035 / BI-036 additive-surface precedent). Also update `description` — add `pattern_search` to the alphabetically-sorted tool list (between `paths` and `properties`). No other field touched.

- [ ] T015 Run quality gates in this order. Each MUST pass before merge:
  1. `npm run lint` → zero warnings (Constitution gate 1).
  2. `npm run typecheck` → zero errors (Constitution gate 2).
  3. `npm run build` → succeeds (Constitution gate 3).
  4. Verify [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) contains the `pattern_search` entry with the correct fingerprints (T010 should have already done this).
  5. `npm test` (which runs `vitest run --coverage`) → all tests pass including new `pattern_search` tests AND the registry-stability baseline test AND the BI-005 registry-consistency test (Constitution gate 4).
  6. Aggregate `statements` coverage threshold passes — `npm test` reports ≥ the current `vitest.config.ts` `test.coverage.thresholds.statements` floor (Constitution gate 5). The new module adds ~200 production LOC + ~900 test LOC; coverage should remain flat or ratchet up.

- [ ] T016 Verify the live-CLI characterisation pass from T001 produced no TRIGGER findings that require spec / plan amendments. If TRIGGERs were surfaced AND deferred, document them as known-gaps in [research.md § T0 Live-CLI Capture](research.md) and either (a) fix the wrapper before merge if the user-facing contract is broken, or (b) open a follow-up BI if the deviation is outside the user-facing contract.

- [ ] T017 (OPTIONAL) Run `/graphify --update` to refresh the structural knowledge graph at `graphify-out/`. Verify per CLAUDE.md `/speckit-analyze` rule 3: the new `pattern_search/` sub-cluster lands inside the `src/tools/` community (not orphan, not surprise-clustered) and the sibling-consumption edge to `../search/handler.ts` (for `stripBoundarySlashes`) appears. Rule 4: production files (`schema.ts`, `handler.ts`, `index.ts`, `_template.ts`) are structurally connected via the registration path; test files are expected to be weakly connected. Defer to `/speckit-analyze` if running it as a separate step.

**Checkpoint**: All quality gates pass; release plumbing updated; structural verification complete. BI-037 ready for PR with Constitution Compliance checklist 9/9 Y / N/A (5 Y, 4 N/A — zero N entries).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: empty.
- **Foundational (Phase 2)**: T001 MUST complete before user story work. If T0.1 surfaces an eval-RegExp failure, plan pivots to OBC-2 (`paths` + `read` fallback); if T0.3 surfaces a different folder-not-found shape, the template's stat check is revised.
- **User Stories (Phase 3-5)**: bundled into a single atomic ship (T002–T010) because the eval template is monolithic. US2 (folder scope) and US3 (case-sensitivity toggle) ride along US1; no separate code paths.
- **Documentation (Phase 6)**: T011 + T012 depend on T009 (registration in `server.ts`) so the `assertToolDocsExist` boot-time assertion fires correctly. Can begin as soon as T009 lands.
- **Polish (Phase 7)**: T013–T017 depend on T002–T012 being complete.

### Per-task dependencies

- T002 (schema.ts) ← prerequisite for T003 (schema.test.ts), T005 (handler.ts), T007 (index.ts).
- T004 (_template.ts) ← prerequisite for T005 (handler.ts).
- T005 (handler.ts) ← prerequisite for T006 (handler.test.ts), T007 (index.ts).
- T007 (index.ts) ← prerequisite for T008 (index.test.ts), T009 (server.ts), T011 (docs/tools/pattern_search.md).
- T009 (server.ts) ← prerequisite for T010 (baseline regen).
- T010 (baseline regen) ← prerequisite for T015 (quality gates — vitest baseline test).

### Within Each User Story

- US1: schema before template; template before handler; handler before tests; tests before registration; registration before baseline.
- US2 / US3: no separate tasks — covered by US1's bundled ship.
- Documentation: docs after registration so boot-time `assertToolDocsExist` passes.
- Polish: release plumbing after all functional tasks; quality gates last.

### Parallel Opportunities

- **T002 + T003 + T004 [P]**: schema.ts + schema.test.ts + _template.ts can be developed in parallel (different files, no inter-dependency at file level). T003 imports from T002 — if running parallel, write T003 against the planned T002 surface from data-model.md.
- **T006 + T008 [P]**: handler.test.ts + index.test.ts can be written in parallel (different files) after T005 + T007 land.
- **T013 + T014 [P]**: CHANGELOG.md + package.json can be modified in parallel (different files, both trivial).
- **All T0 sub-probes (T0.1, T0.2, T0.3, T0.4, T0.5, T0.6)**: independent; can be executed in any order or in parallel against the same TestVault session.

### Story Independence (bundled-ship pattern, BI-036 / BI-025 precedent)

The three user stories ship as one atomic implementation because the eval template handles all flag combinations in one frozen string. Story independence is preserved at the TEST level — each user story's tests (in T003 and T006) can be reasoned about and modified independently, even though they exercise the same handler code paths.

---

## Parallel Example: Foundational + User Story 1

```bash
# T001 sub-probes can fire in parallel during the same TestVault session:
Task: "T0.1 — eval RegExp round-trip probe"
Task: "T0.2 — getMarkdownFiles vs paths --ext md set-equality probe"
Task: "T0.3 — folder-not-found stat-null probe"
Task: "T0.4 — zero-match envelope shape probe"
Task: "T0.5 — zero-length match skip probe"
Task: "T0.6 — 500-cap clip probe"

# T002, T003, T004 can be developed in parallel (different files):
Task: "Create src/tools/pattern_search/schema.ts per data-model.md"
Task: "Create src/tools/pattern_search/schema.test.ts with ~16 cases"
Task: "Create src/tools/pattern_search/_template.ts (frozen JS template)"

# T006 + T008 in parallel after T005 + T007 land:
Task: "Create src/tools/pattern_search/handler.test.ts with ~28 cases"
Task: "Create src/tools/pattern_search/index.test.ts with ~6 cases"
```

---

## Implementation Strategy

### MVP First (User Story 1 — bundled ship of US1 / US2 / US3)

1. Complete Phase 1: Setup (empty).
2. Complete Phase 2: Foundational (T001 — T0 live-CLI characterisation).
3. Complete Phase 3: User Story 1 bundled ship (T002–T010).
4. **STOP and VALIDATE**: Test bundled ship covers US1 / US2 / US3 via T003 + T006's full case inventory.
5. Skip ahead to Phase 6 for docs (T011–T012).
6. Run Phase 7 quality gates (T013–T017).
7. Open PR for merge — MVP shippable.

### Incremental Delivery (NOT applicable — single atomic ship)

The eval template is monolithic; incremental sub-story delivery is not natural for this BI. The bundled ship pattern matches BI-036 / BI-025 precedent. If a future BI wants a different match-shape (e.g., per-line keyed entries with offsets collapsed), it can iterate incrementally on a fresh sibling module.

### Parallel Team Strategy

With two developers:
- Developer A: T002 (schema.ts) + T003 (schema.test.ts) + T007 (index.ts) + T008 (index.test.ts).
- Developer B: T004 (_template.ts) + T005 (handler.ts) + T006 (handler.test.ts) + T009 (server.ts).
- One developer: T001 (live-CLI probes), T010 (baseline regen — runs npm script), T011–T012 (docs), T013–T017 (polish).

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US1 ships US2 / US3 along with it (bundled-ship pattern — see BI-036 / BI-025 precedent).
- Verify tests fail before implementing (Principle II) — N/A for bundled-ship: tests are written in the same task as implementation.
- Commit after each task or logical group.
- Stop at any checkpoint to validate story independently.
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence at the test level.
- Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) BEFORE T001's live-CLI probes per CLAUDE.md `## Test Execution` gate.
