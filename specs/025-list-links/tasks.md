---
description: "Task list for 025-list-links — Outgoing Link Inventory for a Single Note"
---

# Tasks: Links — Outgoing Link Inventory for a Single Note

**Input**: Design documents from [`/specs/025-list-links/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT a separate red/green TDD loop; every implementation task lands with its co-located test cases in the same task. Total target: 51 tests across the new module (18 schema / 28 handler / 5 registration). The verify-fails-first sanity check is captured exactly once, manually, by S-deliberate-revert in T016 (parity with BI-023 / BI-024 precedent).

**Organization**: Tasks are grouped by user story per the project convention. The `links` module is fundamentally a single atomic ship — Stories 1, 2, 3, 4 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 5 is the documentation layer. The `[USx]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md § Test inventory](data-model.md#test-inventory-planned) maps each test case to its source User Story.

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code):

- **R2 — `eval` subcommand load-bearing (NOT native `links`)**: probed live 2026-05-13 (F1). The native `links` subcommand is plain-text-only — `format=json` / `tsv` / `csv` all silently ignored, output is one alphabetically-sorted `<target> (<status>)` line per link with no line / kind / displayText. The wrapper routes through `obsidian eval code=<rendered-js>` to access `app.metadataCache.getFileCache(file).{links,embeds,frontmatterLinks}` directly. Parity with BI-014 / BI-015 eval cohort.
- **R3 — Single-call architecture branched at envelope-emission**: ONE `invokeCli` invocation per request. Same eval JS in both modes; the `a.total` branch lives INSIDE the eval at envelope-emission, returning `{ok:true, count, links:[]}` for count-only or `{ok:true, count, links:[...]}` for default mode. Cross-mode invariant (FR-005a) holds by construction — same eval, same source data, same `count`.
- **R5 — Unknown-vault response inspection ACTIVE for `eval`**: probed live 2026-05-13 (F7). `obsidian vault=NonExistent eval code=…` emits `Vault not found.` (plain text, exit 0). The cli-adapter's 011-R5 inspection clause FIRES and reclassifies to `CLI_REPORTED_ERROR(code: VAULT_NOT_FOUND)`. FR-012's spec-stage structured-error commitment HOLDS without amendment — different from BI-019 / BI-023 / BI-024 inheritance pattern (where upstream silently honoured-as-noop `vault=`). Matches BI-014 / BI-015 inheritance.
- **R6 — Base64 anti-injection**: frozen JS template with single `__PAYLOAD_B64__` substitution. User-supplied `path` / `file` / `target_mode` / `total` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime`. No user input ever reaches the JS source as text. Parity with BI-014 / BI-015.
- **R7 — Three upstream-to-wrapper transforms per entry**: (a) kind synthesis from `original` prefix or origin-array — `[[…]]` → wikilink, `[…]…` (no `![`) → markdown, embeds array → embed, frontmatterLinks → wikilink; (b) `position.start.line + 1` for body links/embeds, synthetic `line: 1` for frontmatterLinks (F5 — cache lacks per-entry position); (c) displayText omit-when-equal-to-target (Q1 / F6 — Obsidian's natural cache shape has displayText always-present-sometimes-equal-to-link; wrapper omits when equal). Implemented in-eval; no wrapper-side post-processing.
- **R8 — Source-order sort intra-eval, NO wrapper-side re-sort**: eval JS sorts by `(line ascending, _col ascending)` after merging the three cache arrays. The `_col` internal field is stripped before envelope emission per Q5. Different from BI-024 (which sorted wrapper-side post-fetch) — here the eval JS is wrapper-locked too, so version-drift risk is absent.
- **R9 — Empty-list contract natural via `|| []` coalescing**: probed live (F10). `app.metadataCache.getFileCache(emptyMdFile)` returns `{}` empty object; the eval JS reads `c.links || []`, `c.embeds || []`, `c.frontmatterLinks || []` defensively → three empty arrays → merged → `{ok:true, count:0, links:[]}`. NO sentinel-detection branch required (unlike BI-023's `No headings found.` sentinel).
- **F9 — Non-`.md` rejection in-eval**: probed live (F9). `app.metadataCache.getFileCache(canvasFile)` returns `{}` empty; absent the guard, canvas/png/pdf locators would silently succeed with `{count:0, links:[]}` — contradicting FR-014. The eval JS checks `f.extension === 'md'` AFTER resolving the file, surfacing `{ok:false, code:'NOT_MARKDOWN', detail: …}` envelope code for any other extension. Wrapper maps to `CLI_REPORTED_ERROR(stage: 'envelope-error', code: 'NOT_MARKDOWN')`.
- **R13 — Structured eval-response error envelope**: three eval-emitted codes (`NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`) plus two wrapper parse-failure codes (`json-parse`, `envelope-parse`). `NO_ACTIVE_FILE` surfaces as `ERR_NO_ACTIVE_FILE` (BI-015 precedent) or `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NO_ACTIVE_FILE')` — the final choice is locked at T0 per BI-015 alignment; both satisfy FR-013 and FR-017.
- **Q1–Q5 clarifications session 2026-05-13** (codified in spec.md): Q1 displayText absent-when-no-alias; Q2 fragment embedded in `target` byte-faithful; Q3 closed three-value `kind` enum `{wikilink, embed, markdown}` (no bare URLs); Q4 frontmatter-link inclusion intermingled in source order; Q5 column NOT surfaced (internal-only sort key). ALL FIVE survived live-CLI verification at plan stage without amendment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers. Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read` / `delete` / `files` / `read_heading` / `read_property` / `set_property` / `rename` / `write_note` / `find_by_property` / `outline` / `properties`). All paths are relative to the repo root. Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at `src/tools/links/` (does NOT exist yet — created by T002–T007).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–024). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler against verified upstream behaviour for the cases deferred from plan stage (per [research.md § Cases deferred to T0](research.md#cases-deferred-to-t0-of-speckit-implement)).

**Note on plan-stage coverage**: 14 architecture-locking findings (F1–F14) were verified live during plan stage on 2026-05-13 — see [research.md § Live-CLI findings](research.md#live-cli-findings-probed-2026-05-13-against-testvault-obsidian-cli-mcp). T001 below covers the 6 cases deferred to T0 because they require fresh fixtures or focused-vault state changes not feasible at plan time.

- [X] T001 Live-CLI characterisation of the 6 deferred T0 cases. Run probes against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  - **(T0.1) [pre-impl upstream probe + post-impl wrapper E2E] Same-line same-target intra-line tiebreak end-to-end (F11a / FR-008 / SC-007 / Q-7 verification)**: seed `Sandbox/links-T0-sameline.md` with body `Compare [[Apple]] vs [[Apple]] end.` (literally `[[Apple]]` twice on the same line at columns ~9 and ~22). Open TestVault as focused. Probe via the wrapper end-to-end (direct `executeLinks({target_mode:'specific', vault:'TestVault-Obsidian-CLI-MCP', path:'Sandbox/links-T0-sameline.md'}, realDeps)`): assert the response has TWO entries, both `target: 'Apple'`, same `line` value, with the column=~9 entry preceding the column=~22 entry. **TRIGGER**: if the wrapper produces only one entry, the dedup contract is broken (FR-007 violated) — debug the eval JS's merge step. If both entries appear but the order is reversed, the `_col` ascending tiebreak comparator is wrong — debug the sort. Document live cache `links[]` array order from a side eval probe (`(()=>{const f=app.vault.getFiles().find(x=>x.path==='Sandbox/links-T0-sameline.md');return JSON.stringify(app.metadataCache.getFileCache(f).links);})()`) to confirm Obsidian's cache returns them in source order natively. Clean up fixture.

  - **(T0.2) [pre-impl upstream probe + post-impl wrapper E2E — pre-impl gate for T004] Active-mode no-focused-file end-to-end (F13a / FR-013 / SC-004 / Q-21 verification)**: close all open panes in Obsidian (use the workspace's "Close all" command, or close panes until `app.workspace.getActiveFile()` returns null). Probe via the wrapper end-to-end (`executeLinks({target_mode:'active'}, realDeps)`). Confirm the response is a structured no-active-file error. **DECISION POINT per R13 / BI-015 alignment**: the wrapper's mapEnvelopeError maps `NO_ACTIVE_FILE` envelope code to either `ERR_NO_ACTIVE_FILE` UpstreamError code (the BI-015 / BI-014 precedent) OR `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NO_ACTIVE_FILE')`. Probe BI-015's `read_heading` against no-focused-file (`obsidian eval code="(()=>{return JSON.stringify({ok:false,code:'NO_ACTIVE_FILE',detail:'…'});})()"`) and observe which `UpstreamError.code` the cli-adapter dispatch layer surfaces. Lock the wrapper's mapEnvelopeError to that same code for parity. Document the final choice in research.md AND in T004's handler.ts comment. Restore Obsidian's normal pane state after.

  - **(T0.3) [post-impl wrapper E2E] Cross-mode invariant end-to-end (F14a / FR-005a / SC-015 / Q-16 verification)**: seed `Sandbox/links-T0-crossmode.md` with frontmatter `---\nrelated: "[[Other]]"\n---` and body `Body has [[A]] and [[B]] and ![[C.png]] on lines 5 6 7 respectively.\n[[A]]\n[[B]]\n![[C.png]]\n`. Open TestVault. Run twice via the wrapper: once with `total: false`, once with `total: true` (same fixture, same instant). Assert `count_false === count_true` AND `total:true.links === []` AND `total:false.links.length === count_false`. **TRIGGER**: if `count_false !== count_true`, the cross-mode invariant is broken — debug the eval JS's `out.length` vs the conditional `a.total?[]:out` branch (it should compute `out` regardless of `a.total` per R3 / R11). Clean up fixture.

  - **(T0.4) [pre-impl upstream probe + post-impl wrapper E2E] Frontmatter-link line=1 invariant against multi-link frontmatter (F5 / FR-006b / SC-009a / Q-10 verification)**: seed `Sandbox/links-T0-fmlinks.md` with frontmatter declaring multiple wikilinks across multiple keys and across a list-of-wikilinks property, e.g. `---\nrelated: "[[First]]"\nproject: "[[Second]]"\nsiblings:\n  - "[[Third]]"\n  - "[[Fourth]]"\n---\nBody [[Fifth]] on line 8.`. Open TestVault. Probe via wrapper. **Expected per F5**: the response has 5 entries; the first 4 carry `line: 1` (frontmatter cohort), the 5th carries `line: 8` (body). All 4 frontmatter entries are `kind: 'wikilink'`. Frontmatter entry order is upstream-cache array order (Obsidian's `frontmatterLinks` enumeration order — typically declaration order). **TRIGGER**: (a) if `siblings`-list wikilinks are NOT in the response, Obsidian's frontmatterLinks doesn't enumerate list-of-wikilinks values — escalate; FR-006b's commitment may need refinement. (b) if any frontmatter entry has `line !== 1`, the eval JS's synthetic-line=1 transform is wrong — debug. Document the upstream `frontmatterLinks[]` array order from a side eval probe. Clean up fixture.

  - **(T0.5) [post-impl wrapper E2E] Path-traversal `path` value end-to-end (FR-016 / SC-014 / Q-15 verification)**: probe via the wrapper `executeLinks({target_mode:'specific', vault:'TestVault-Obsidian-CLI-MCP', path:'../escape.md'}, realDeps)`. **Expected**: the eval JS's `app.vault.getFiles().find(x => x.path === '../escape.md')` returns null (because Obsidian's file index uses vault-relative paths without `..` resolution); envelope returns `{ok:false, code:'FILE_NOT_FOUND', detail:'path: ../escape.md'}` → wrapper raises `CLI_REPORTED_ERROR(stage:'envelope-error', code:'FILE_NOT_FOUND')`. **TRIGGER**: if any filesystem mutation occurs outside the vault OR upstream's `app.vault.getFiles()` somehow returns a file matching `../escape.md`, the FR-016 contract is broken — escalate; the wrapper may need a schema-layer regex guard. Document the actual behaviour. Also probe with `Sandbox/../../etc/passwd` shape to confirm equivalent rejection. No fixture seeding needed.

  - **(T0.6) [post-impl] End-to-end specific-mode happy path with mixed-kind fixture (FR-006 / SC-001 / Q-19 verification)**: seed `Sandbox/links-T0-mixed.md` with the exact mixed-link fixture from quickstart Q-19 (one bare wikilink `[[Roadmap]]`, one aliased `[[Glossary|Terms]]`, one wiki embed `![[diagrams/system.png]]`, one markdown embed `![alt](image.png)`, one internal markdown link `[Note](Other-Note.md)`, plus a body-only bare URL `https://example.org` that should NOT appear). Open TestVault. Probe via wrapper end-to-end. Assert response carries 5 entries (not 6 — bare URL omitted per Q3), per-entry shape matches the fixture's expected `target` / `line` / `kind` / `displayText` values. Document the per-entry response in research.md. **TRIGGER**: if bare URL appears in the listing, Q3's commitment (bare URLs OOS) is contradicted by upstream — escalate. If the markdown link `[Note](Other-Note.md)` does NOT appear, upstream's `links[]` filters external/internal markdown links differently than F2 indicated — escalate. Clean up fixture.

  - **(T0.7) [post-impl, OPTIONAL] Very-large-link-list cap-boundary (Q-24 / SC-024 verification — OPTIONAL per BI-024 precedent)**: seed a synthetic vault note `Sandbox/links-T0-huge.md` containing enough outgoing wikilinks (each ~30 bytes of source: `[[T_NNNNN]]\n`) that the rendered eval response JSON exceeds the cli-adapter's 10 MiB output cap. Estimate: each emitted entry is ~80 bytes (`{"target":"T_NNNNN","line":N,"kind":"wikilink"}`); 10 MiB ÷ 80 ≈ 130,000 entries. Generate via PowerShell loop emitting wikilink lines into the fixture. Open TestVault. Probe via wrapper end-to-end. **TRIGGER per FR-017 / R10**: either (a) full output under cap, OR (b) `CLI_NON_ZERO_EXIT` with `details.killReason = {kind: "cap", stream: "stdout"}`. Document which outcome fires and at approximately what link count. The `total: true` flag bypasses this risk entirely — confirm by re-probing with `total: true` against the same huge fixture; expected: small integer-bearing envelope in stdout regardless of link count. **OPTIONAL — defer this T0.7 case if seeding 130k links is impractical**: the FR-017 / SC-024 contract (cap fires as structured error, not silent truncation) is structurally ensured by the cli-adapter's existing 10 MiB cap machinery from BI-003 — empirical confirmation here is observability evidence, not a contract gate. Parity with BI-024 T0.5 OPTIONAL pattern. Clean up fixture.

**Checkpoint**: Foundational characterisation complete. Same-line tiebreak verified; active-mode no-focused-file UpstreamError code locked; cross-mode invariant verified end-to-end; frontmatter-link line=1 invariant verified across multi-link / list-of-wikilinks fixtures; path-traversal contract confirmed; mixed-kind happy-path end-to-end verified; cap-boundary outcome documented (OPTIONAL — structural inheritance from BI-003). User-story implementation can now begin. (Note: sub-cases tagged `[pre-impl]` fire BEFORE T002+T004; sub-cases tagged `[post-impl]` fire AFTER T009 lands. T0.7 is OPTIONAL.)

---

## Phase 3: User Story 1 — Outgoing-link listing for a named note (Priority: P1) 🎯 MVP

**Goal**: Add the typed `links` MCP tool surface that returns `{ count, links: [{ target, line, kind, displayText? }] }` for a single named note. Covers FR-001..FR-014 (default mode happy path + per-occurrence semantic + source-order sort + body-content opacity + frontmatter inclusion + heading/block fragment embedding + non-`.md` rejection + unresolved-locator + cross-mode invariant).

**Independent Test**: invoke `links({ target_mode: 'specific', vault: '<vault>', path: '<.md path>' })` against a note carrying multiple outgoing links of mixed kinds; assert response shape `{ count, links: [...] }` with correct per-entry `target` / `line` / `kind` / optional `displayText`. Per [quickstart.md](quickstart.md) Q-1..Q-12.

> **Note on bundled stories**: T002–T009 below are the single source implementation that delivers Stories 1, 2, 3, 4 in one atomic ship. The `[US1]` tag marks primary-story attribution; US2/US3/US4 are sub-stories of the same module and ride along (no separate code paths). Story-tag breakdown by file:
>
> - schema.ts → US1 (default-mode shape) + US2 (active-mode discriminator branch) + US3 (validation refinement: XOR locator, vault-required-in-specific, active-mode-forbid) + US4 (count-only `total` field)
> - handler.ts → US1 (default-mode happy path + transforms + sort) + US2 (active-mode resolves via `app.workspace.getActiveFile()` in eval) + US4 (count-only branch at envelope emission)
> - index.ts → US1 (registration)
> - docs/tools/links.md → US5 (documentation)

### Implementation for User Story 1 (MVP — bundled with US2/US3/US4)

- [X] T002 [P] [US1] Create [src/tools/links/schema.ts](../../src/tools/links/schema.ts) per [data-model.md § Input schema](data-model.md#input-schema). Export `linksInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ total: z.boolean().optional() }))` — consumes `targetModeBaseSchema` + `applyTargetModeRefinement` from `../../target-mode/target-mode.js` per ADR-003 / R4. Export `linkKindEnum = z.enum(['wikilink','embed','markdown'] as const)` — closed three-value enum per Q3 / R7. Export `linkEntrySchema = z.object({ target: z.string(), line: z.number().int().positive(), kind: linkKindEnum, displayText: z.string().optional() }).strict()` — `.strict()` mode locks the exhaustive-fields list per FR-006 post-clarify. Export `linksOutputSchema = z.object({ count: z.number().int().nonnegative(), links: z.array(linkEntrySchema) }).strict()`. Export `LINKS_EVAL_ERROR_CODES = ['NO_ACTIVE_FILE','FILE_NOT_FOUND','NOT_MARKDOWN'] as const` and `linksEvalResponseSchema = z.discriminatedUnion('ok', [z.object({ok:z.literal(true), count: z.number().int().nonnegative(), links: z.array(linkEntrySchema)}).strict(), z.object({ok:z.literal(false), code: z.enum(LINKS_EVAL_ERROR_CODES), detail: z.string()}).strict()])`. Inferred types: `LinksInput` / `LinksOutput` / `LinkEntry` / `LinkKind` / `LinksEvalResponse` / `LinksEvalErrorCode` via `z.infer`. Carry the `// Original — no upstream. <one-line description>.` header per Constitution V (FR-022).

- [X] T003 [P] [US1] Create [src/tools/links/schema.test.ts](../../src/tools/links/schema.test.ts) with 18 cases per [data-model.md § Test inventory schema.test.ts](data-model.md#schematestts--18-cases). Cases: (1) specific+vault+path happy ✓; (2) specific+vault+file happy ✓; (3) specific+vault+path+`total:true` ✓; (4) specific+vault+path+`total:false` ✓; (5) active happy ✓; (6) active+`total:true` ✓; (7) specific without vault ✗ (ZodError); (8) specific without file+path ✗ (XOR); (9) specific with both file+path ✗ (XOR); (10) active with vault ✗; (11) active with file ✗; (12) active with path ✗; (13) unknown top-level key (e.g. `filter`) ✗ (strict mode); (14) `total: "true"` (string) ✗; (15) `target_mode` missing ✗; (16) `target_mode: "focused"` (unknown enum) ✗; (17) `vault: ""` empty string ✗; (18) emitted JSON Schema (via `toMcpInputSchema`) round-trips through `zodToJsonSchema` without losing the `target_mode` enum constraint OR the XOR / active-forbid refinements. Each failing case is asserted with a dispatcher spy (`vi.fn()`) that MUST NEVER be called — locks FR-015 structurally. Carry `// Original — no upstream.` header.

- [X] T004 [US1] Create [src/tools/links/handler.ts](../../src/tools/links/handler.ts) per [contracts/links-handler.contract.md](contracts/links-handler.contract.md). Export `executeLinks(input: LinksInput, deps: LinksHandlerDeps): Promise<LinksOutput>`. Logic:

  1. **JS_TEMPLATE constant** (FROZEN — only `__PAYLOAD_B64__` substitution point per data-model.md § JS template body): the literal string from [data-model.md § JS template body](data-model.md#js-template-body) — a synchronous IIFE that decodes the base64 payload, resolves the file via `a.active ? app.workspace.getActiveFile() : a.path ? app.vault.getFiles().find(x=>x.path===a.path) : app.metadataCache.getFirstLinkpathDest(a.file,'')`, surfaces structured `NO_ACTIVE_FILE` / `FILE_NOT_FOUND` envelope errors when resolution fails, applies the `f.extension==='md'` guard (surfacing `NOT_MARKDOWN` envelope error if not), reads `c = app.metadataCache.getFileCache(f) || {}`, merges `(c.frontmatterLinks||[]).map(...)` + `(c.links||[]).map(...)` + `(c.embeds||[]).map(...)` with the three transforms (kind synthesis / line+1 or synthetic line=1 / displayText omit-when-equal), sorts by `(line ascending, _col ascending)`, strips `_col` via `{_col, ...rest}` destructure, and emits `{ok:true, count: out.length, links: a.total?[]:out}`.
  2. **Payload assembly** per [data-model.md § Base64 payload assembly](data-model.md#base64-payload-assembly): `payload = { active: input.target_mode==='active', path: input.target_mode==='specific' ? input.path ?? null : null, file: input.target_mode==='specific' ? input.file ?? null : null, total: input.total === true }`. `payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')`. `code = JS_TEMPLATE.replace('__PAYLOAD_B64__', payloadB64)` — exactly one `replace` call, exactly one substitution point.
  3. **ONE `invokeCli` invocation** (R3 / single-spawn invariant): `await deps.invokeCli({ target_mode: input.target_mode, vault: input.target_mode==='specific' ? input.vault : undefined, subcommand: 'eval', parameters: { code } })`. NO `parameters.file` / `parameters.path` — those flow through the b64 payload only per R6 anti-injection.
  4. **Stage 0 — strip eval prefix**: `const trimmed = result.stdout.replace(/^=> /, '').trimEnd()`.
  5. **Stage 1 — JSON.parse**: try/catch; on failure throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', message: 'links eval returned non-JSON stdout', cause, details: { stage: 'json-parse', stdout: trimmed.slice(0, 200) } })`.
  6. **Stage 2 — envelope safeParse**: `const r = linksEvalResponseSchema.safeParse(parsed)`; on failure throw `new UpstreamError({ code: 'CLI_REPORTED_ERROR', message: 'links eval envelope did not match schema', cause: r.error, details: { stage: 'envelope-parse', issues: r.error.issues } })`.
  7. **Stage 3 — discriminate on `ok`**: if `envelope.ok === false`, call `mapEnvelopeError(envelope.code, envelope.detail)` and throw. The map: `NO_ACTIVE_FILE` → `ERR_NO_ACTIVE_FILE` (or `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NO_ACTIVE_FILE')` per T0.2 decision — comment the chosen code with the T0 reference); `FILE_NOT_FOUND` → `CLI_REPORTED_ERROR(stage:'envelope-error', code:'FILE_NOT_FOUND')`; `NOT_MARKDOWN` → `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NOT_MARKDOWN')`. The switch is exhaustive over `LINKS_EVAL_ERROR_CODES` via TypeScript's discriminated union exhaustiveness check.
  8. **Stage 4 — return**: `return { count: envelope.count, links: envelope.links }`.

  Type definitions: `LinksHandlerDeps = { invokeCli: CliAdapter['invokeCli']; logger?: Logger }`. Carry `// Original — no upstream.` header. NO `logger.callStart` / `callEnd` events per R1 thin-handler convention.

- [X] T005 [US1] Create [src/tools/links/handler.test.ts](../../src/tools/links/handler.test.ts) with 28 cases per [data-model.md § handler.test.ts](data-model.md#handlertestts--28-cases). Inject stub `invokeCli` via `deps.invokeCli = vi.fn().mockResolvedValue({stdout: '=> ' + JSON.stringify(envelopeFixture), stderr: '', exitCode: 0})`. Per-test assertions: (a) `deps.invokeCli.mock.calls.length === 1` (single-spawn invariant per R3); (b) for any test exercising the payload, decode `code=` argv via the test-seam pattern from [contracts/links-handler.contract.md § Test seam pattern](contracts/links-handler.contract.md#test-seam-pattern) — assert the decoded payload matches the user input bit-for-bit (R6 anti-injection structural lock); (c) for envelope-error tests, assert the thrown UpstreamError carries the correct `code` AND `details.stage` AND `details.code` AND `details.detail` per R13 table.

  **Happy paths**: (1) specific+path+mixed-link envelope → 4-entry response with correct kinds + lines + displayText absence/presence; (2) specific+file (basename) → resolves via `getFirstLinkpathDest` per the eval JS, same response shape; (3) specific+path+`total:true` → `{count:N, links:[]}`; (4) specific+path+empty cache envelope (`{ok:true, count:0, links:[]}`) → `{count:0, links:[]}` per FR-009; (5) active+focused → response shape; (6) active+`total:true` → count-only response shape.

  **Per-entry shape transforms** (use stub envelope responses with seeded entries to assert wrapper passes through correctly): (7) bare wikilink → no `displayText` field on the response entry (Q1); (8) aliased wikilink → `displayText` present and equal to alias; (9) wiki embed → kind `embed`, no `displayText`; (10) markdown embed → kind `embed`, `displayText` present; (11) markdown link → kind `markdown`, `displayText` present; (12) heading-fragment wikilink → `target: 'Target#Heading'` byte-faithful (Q2); (13) block-fragment wikilink → `target: 'Target#^block-id'` byte-faithful (Q2); (14) frontmatter entry → `line: 1`, kind `wikilink`, no `displayText` if equal-to-link (Q4).

  **Per-occurrence + sort** (these tests exercise the eval JS's sort indirectly — they assert what the wrapper returns when handed a stub envelope whose entries match the source order the eval JS would produce): (15) same target on different lines → 2 entries in line-ascending order (FR-007); (16) same target on same line → 2 entries (column-ascending order verified by stub); (17) mixed body+frontmatter → frontmatter entries appear first by `line: 1` ahead of body entries (Q4 / FR-008); (18) emitted entries have NO `column` / `_col` field (Q5 — assert via `Object.keys(entry)` set equality).

  **Cross-mode invariant**: (19) invoke same fixture-stub with `total: false` then `total: true`; assert `count_false === count_true` (FR-005a / R11).

  **Error paths**: (20) unknown vault — stub `invokeCli` rejects with `UpstreamError(CLI_REPORTED_ERROR, details.code='VAULT_NOT_FOUND')` simulating the 011-R5 clause output, assert error propagates; (21) unresolved `path` — envelope `FILE_NOT_FOUND`, assert wrapper throws `CLI_REPORTED_ERROR(stage:'envelope-error', code:'FILE_NOT_FOUND')`; (22) unresolved `file` (basename) — envelope `FILE_NOT_FOUND` with `wikilink:` detail; (23) `.canvas` file — envelope `NOT_MARKDOWN`; (24) active+no-focused-file — envelope `NO_ACTIVE_FILE`, assert wrapper throws the T0.2-locked code (`ERR_NO_ACTIVE_FILE` or `CLI_REPORTED_ERROR(stage:'envelope-error', code:'NO_ACTIVE_FILE')`); (25) stdout non-JSON — stub stdout `=> not valid json`, assert wrapper throws `CLI_REPORTED_ERROR(stage:'json-parse')`; (26) envelope shape unknown — stub stdout `=> {"ok":true,"count":5,"links":[],"surprise":"extra"}`, assert `CLI_REPORTED_ERROR(stage:'envelope-parse')`; (27) output-cap kill — stub `invokeCli` rejects with `UpstreamError(CLI_NON_ZERO_EXIT)`, assert propagation.

  **Argv / payload invariants**: (28) base64 payload round-trip + frozen template prefix/suffix check + single `invokeCli` call assertion combined into one umbrella test against the Q-1 fixture (R3 / R6 / R12). Carry `// Original — no upstream.` header.

- [X] T006 [US1] Create [src/tools/links/index.ts](../../src/tools/links/index.ts). Export `createLinksTool(deps: RegisterDeps): RegisteredTool` via the `registerTool` factory (parity with `outline` / `properties` / `read` / `read_heading`). Export `LINKS_TOOL_NAME = "links"` constant and `LINKS_DESCRIPTION` string. The description SHOULD mention: the typed `{ count, links: [{ target, line, kind, displayText? }] }` envelope; the `target_mode` discriminator and the optional `total` count-only switch; the closed `{wikilink, embed, markdown}` kind enum (bare URLs OOS); frontmatter-link inclusion intermingled in source order; the multi-vault structured-error contract (different from BI-019/023/024 inheritance); a pointer to `help({ tool_name: "links" })` for full docs. Model length and shape after `OUTLINE_DESCRIPTION` and `PROPERTIES_DESCRIPTION`. Carry `// Original — no upstream.` header.

- [X] T007 [US1] Create [src/tools/links/index.test.ts](../../src/tools/links/index.test.ts) with 5 registration cases: (a) `createLinksTool({...}).descriptor.name === "links"`; (b) descriptor `inputSchema` has descriptions stripped (ADR-005 — assert no `description` field appears in the JSON Schema's properties); (c) `LINKS_DESCRIPTION` mentions `help({ tool_name: "links" })`; (d) `docs/tools/links.md` exists with non-stub content (assert file size > 1 KB AND contains the strings "Worked example" + "Error roster" — placeholder check; full content asserted via the registry-consistency test from BI-005); (e) the `_register-baseline.test.ts` drift detector fingerprint matches the rolled-forward baseline (this depends on T009 — comment as "AFTER T009"). Carry `// Original — no upstream.` header.

- [X] T008 [US1] Edit [src/server.ts](../../src/server.ts): add the import line `import { createLinksTool } from "./tools/links/index.js";` in ASCII-alphabetical position (between `createFilesTool` and `createObsidianExecTool` — verify alphabetical order matches the existing import block; ASCII `files/` < `links/` < `obsidian_exec/`). Add the `createLinksTool({ logger, queue })` entry in the tools array, alphabetical position (between `createFilesTool` and `createObsidianExecTool`). DO NOT pass `vaultRegistry` (parity with `outline` / `properties` — links does not need a wrapper-side vault-registry pre-check; the cli-adapter's 011-R5 clause handles "Vault not found." reclassification). Verify by `npm run typecheck` AND by `npm run test -- src/server.test.ts` — the existing registry-consistency test auto-covers `links`'s docs/ presence once the registration lands.

- [X] T009 [US1] Roll forward [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write`. This adds the new `links` tool's fingerprint (`{ name: "links", descriptionFingerprint: "<sha256>", schemaFingerprint: "<sha256>" }`) to the baseline array per BI-022's FR-018 contract. Verify: (a) `git diff src/tools/_register-baseline.json` shows ONLY the new `links` entry added (no other tool's fingerprint changed — confirms SC-018); (b) `npm run test -- src/tools/_register-baseline.test.ts` passes after the roll-forward. **TRIGGER**: if any other tool's fingerprint changed, halt — accidental description-text drift or schema-shape drift in another tool. Investigate before continuing.

**Checkpoint for User Stories 1–4**: Schema + handler + index + server registration + baseline roll-forward all landed; 46 of 51 tests pass (T007's 5 registration cases require T010's docs.md to exist). MVP code path is functional pending docs.

---

## Phase 4: User Story 5 — Documentation surface (Priority: P2)

**Goal**: Author the progressive-disclosure help-facility documentation for `links`. Covers FR-018 / SC-019 / Q-20 from quickstart.

**Independent Test**: invoke the help facility with `tool_name: 'links'`; assert the doc carries the per-field input contract, output shape (both modes), failure-mode roster, and ≥4 worked examples covering ≥4 distinct usage modes.

- [X] T010 [US5] Create [docs/tools/links.md](../../docs/tools/links.md) (~190 lines). Structure mirrors `docs/tools/outline.md` and `docs/tools/properties.md`. Required sections:

  - **Summary** (1 paragraph): what the tool does — outgoing-link listing for a single named note OR the focused note; closed three-kind enum; frontmatter included; eval-driven under the hood (but caller doesn't need to know).
  - **Input** (per-field contract): `target_mode` (specific/active), `vault` (mandatory in specific), `file` XOR `path` in specific, `total` optional boolean; the active-mode-forbid rule for vault/file/path.
  - **Output** (both modes): default `{ count, links: [{ target, line, kind, displayText? }] }` with the per-entry shape spelled out — `target` byte-faithful with embedded heading/block fragment (Q2); `line` 1-based source position (frontmatter entries get synthetic line=1 per Q4); `kind` from closed `{wikilink, embed, markdown}` enum (Q3); `displayText` present only when source has separate alias (Q1). Count-only mode: `{ count: N, links: [] }`.
  - **Worked examples** (≥4): (1) specific-mode by `path` against a multi-link note showing the response with all four kinds intermingled; (2) specific-mode by `file` (basename) showing equivalence to (1); (3) active-mode without `total`; (4) count-only mode (`total: true`) against the same fixture as (1) showing equivalent `count`; (5) failure-path example — unresolved-locator OR unknown-vault OR validation-rejection.
  - **Error roster** (table): VALIDATION_ERROR / VAULT_NOT_FOUND / FILE_NOT_FOUND (path + wikilink variants) / NOT_MARKDOWN / ERR_NO_ACTIVE_FILE-or-CLI_REPORTED_ERROR(NO_ACTIVE_FILE) (per T0.2 decision) / json-parse / envelope-parse / CLI_NON_ZERO_EXIT (output cap) / CLI_BINARY_NOT_FOUND.
  - **Multi-vault note**: unlike `outline` / `properties` / `files` which silently honour `vault=` as noop, this tool's `eval` subcommand DOES emit `Vault not found.` for unknown vault → the wrapper raises a structured error. Multi-vault callers MUST supply a registered display name; the wrapper will NOT silently route to the focused vault for an unrecognised name.
  - **Frontmatter inclusion note**: frontmatter-declared wikilinks (e.g. `related: "[[Project]]"`, properties typed as list-of-wikilinks) appear in the listing alongside body links, intermingled in source order via `line` (frontmatter entries get `line: 1`); they're classified `kind: "wikilink"` identical to body wikilinks; no `source: "frontmatter" | "body"` discriminator is surfaced.
  - **Out-of-scope note**: bare URLs in body prose (per Q3 — not surfaced as link entries; body content, not links); heading/block fragment as separate field (per Q2 — embedded in `target`); per-entry column position (per Q5 — internal-only); inbound links / backlinks (separate primitive); broken-link reporting; multi-hop traversal; vault-wide outgoing inventory; canonical-path resolution.
  - **Practical ceiling**: the 10 MiB output cap inherits from the cli-adapter; very-long-link-list notes (tens of thousands of links) may surface as `CLI_NON_ZERO_EXIT`.

  Carry the `// Original — no upstream.` header is NOT required for `.md` files (Constitution V exempts docs per BI-005 FR-019); follow the existing `docs/tools/*.md` convention.

- [X] T011 [US5] Edit [docs/tools/index.md](../../docs/tools/index.md): add a one-line entry for `links` in ASCII-alphabetical position (between `help` and `obsidian_exec` — verify by reading the file's current entries; ASCII order is `files` < `find_by_property` < `help` < `links` < `obsidian_exec`). Format must match the existing convention (verify by reading). Implements the implicit "tool-list discoverability" surface that the help-tool consumes.

**Checkpoint for User Story 5**: docs/tools/links.md present + indexed; T007's registration tests now pass; full 51-test suite green.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Release mechanics + sanity check + manual smoke.

- [X] T012 [P] Edit [package.json](../../package.json): bump `version` from `0.5.2` to `0.5.3` (additive surface — PATCH under semver since no existing-tool surface changes). Update the `description` field to mention `links` alongside the existing typed-tool list (verify by reading the current description; the convention is to list the tool names — extend with `links` in alphabetical position). Run `npm install` to update `package-lock.json` (if present). Verify by `npm run build` succeeds.

- [X] T013 [P] Edit [CHANGELOG.md](../../CHANGELOG.md): add a new `## [0.5.3]` section (or append under `## [Unreleased]` per the existing convention — verify by reading the current CHANGELOG structure). Section content per CONTRIBUTING.md's CHANGELOG conventions: headline ("Added: typed `links` tool — outgoing-link inventory for a single named note with frontmatter inclusion"), one paragraph describing the new surface (input shape + output envelope + count-only mode + closed three-kind enum + frontmatter intermingled), one paragraph naming the design decisions (eval-driven implementation per F1 — native `links` plain-text-only; FR-012 structured-error contract holds per F7 — different from BI-019/023/024 inheritance; non-`.md` rejection via in-eval `f.extension==='md'` guard per F9; displayText omit-when-equal per Q1; fragment embedded in target per Q2; column NOT surfaced per Q5), references section linking to the spec / plan / tasks. No migration block (additive surface; zero existing-tool changes per FR-021 / SC-018).

- [X] T014 [P] Edit [README.md](../../README.md): if the README contains a tools-list section, add a line for `links` in alphabetical position. If the README does NOT enumerate tools (verify by reading), this task is a no-op — close it out without an edit.

- [X] T015 Run the full test + quality gates locally:
  1. `npm run lint` → zero warnings (Constitution: lint gate).
  2. `npm run typecheck` → clean (Constitution: TS strict gate).
  3. `npm run build` → succeeds.
  4. `npm run test` → all tests pass including the new 51-case suite for `links` + the FR-018 baseline fingerprint check + the BI-005 registry-consistency check.
  5. `npm run test:coverage` → aggregate statements floor (91.3% per vitest.config.ts:20) holds or ratchets up. The new module is ~195 LOC source; the 51 co-located tests provide near-100% local coverage so the aggregate either stays flat or ratchets up.

  **TRIGGER**: any gate failure → fix the underlying issue. NEVER bypass with `--no-verify` or threshold adjustment without explicit user approval.

- [X] T016 Deliberate-fails-first sanity check (S-deliberate-revert per project convention — parity with BI-023 / BI-024). On a fresh local commit (do NOT push):
  1. Temporarily revert ONE of the three load-bearing transforms in T004's handler.ts JS_TEMPLATE — pick the displayText omit-when-equal transform (change `if(e.displayText!==e.link)o.displayText=e.displayText;` to `o.displayText=e.displayText;` — always-include). Save.
  2. Run `npm run test -- src/tools/links/handler.test.ts`. EXPECTATION: cases 7, 9, 14 (bare-wikilink, wiki-embed, frontmatter — the displayText-omit assertions) fail with vitest's structural diff.
  3. Revert the change. Run tests again — all pass.
  4. Document the verification by appending a single-line annotation to [research.md](research.md) under a new `## T016 Deliberate-Fails-First Sanity Check (yyyy-mm-dd)` section: "verified the displayText omit-when-equal transform is load-bearing — reverting it causes 3 handler-test failures with expected diffs."
  5. Do NOT commit the deliberate revert.

  **Purpose**: confirms the test suite actually exercises the transforms — guards against "tests pass because nothing checks the transform" silent regressions.

- [ ] T017 Run the manual end-to-end smoke — DEFERRED (manual gate). Requires MCP Inspector OR Claude Desktop with `TestVault-Obsidian-CLI-MCP` focused; not run during `/speckit-implement`. Operator runs as the pre-merge final check:
  1. Connect to the local `obsidian-cli-mcp` server (built fresh from T015).
  2. Invoke `links` against the test vault's Welcome.md or a seeded mixed-link fixture; visually confirm the response envelope matches the docs.
  3. Invoke `links` in active mode against a focused note; confirm equivalence.
  4. Invoke with `total: true`; confirm count-only response.
  5. Invoke with `vault: "NonExistent"`; confirm VAULT_NOT_FOUND structured error.
  6. Invoke with `path: "Sandbox/probe.canvas"` (seed a canvas file first); confirm NOT_MARKDOWN structured error.
  7. Clean up any seeded fixtures.

---

## Dependencies

Story-level ordering (most stories independent, except for the bundled US1/US2/US3/US4 within Phase 3):

- Phase 1 (Setup): empty — skip.
- Phase 2 (T001 Live-CLI characterisation): the `[pre-impl …]` portions of T0.1 / T0.2 / T0.4 plus T0.2's BI-015 alignment probe MUST complete before T004. The `[post-impl …]` portions of T0.1 / T0.2 / T0.3 / T0.4 / T0.5 plus the OPTIONAL T0.7 fire AFTER T009 lands (they require the wrapper to exist). The single mandatory pre-impl gate is T0.2's BI-015 probe — it locks the `NO_ACTIVE_FILE` UpstreamError code that T004's `mapEnvelopeError` references. All other pre-impl probes characterise upstream behaviour and inform implementation but do not strictly block T002+T004.
- Phase 3 (T002–T009 — User Stories 1/2/3/4 bundled): atomic. Within this phase the dependency graph is:
  - T002 (schema.ts) and T003 (schema.test.ts) [P] — different files, can run in parallel
  - T004 (handler.ts) depends on T002 (imports types) and T001 (T0.2 active-mode code decision)
  - T005 (handler.test.ts) depends on T004
  - T006 (index.ts) depends on T002 + T004
  - T008 (server.ts edit) depends on T006
  - T009 (baseline roll-forward) depends on T008
  - T007 (index.test.ts) depends on T009 + T010
- Phase 4 (T010–T011 — User Story 5): can start in parallel with Phase 3 (docs files are independent). T011 depends on T010.
- Phase 5 (T012–T017): T012 + T013 + T014 [P] independent. T015 depends on Phases 3 + 4 complete. T016 depends on T015. T017 deferred to manual operator.

## Parallel Example: User Story 1 + User Story 5 simultaneously

```bash
# Group A — kick off T001 (live probes), T002 (schema source), T003 (schema tests), T010 (docs) in parallel:
Task: "T001 — Live-CLI characterisation against TestVault-Obsidian-CLI-MCP (6 deferred cases)"
Task: "T002 — Create src/tools/links/schema.ts with input/output/eval-envelope zod schemas + linkKindEnum"
Task: "T003 — Create src/tools/links/schema.test.ts with 18 cases (target_mode discriminator, XOR, active-forbid, total, strict)"
Task: "T010 — Create docs/tools/links.md with ≥4 worked examples + multi-vault note + frontmatter-inclusion note"

# After T001 (T0.2 decision) + T002 (types) land, kick off T004:
Task: "T004 — Create src/tools/links/handler.ts with frozen JS_TEMPLATE + base64 payload + multi-stage parse"

# After T004 lands, kick off T005 + T006 in parallel:
Task: "T005 — Create src/tools/links/handler.test.ts with 28 cases (mixed-link / per-occurrence / cross-mode / 8 error paths)"
Task: "T006 — Create src/tools/links/index.ts with createLinksTool factory + LINKS_DESCRIPTION"

# After T006 lands, kick off T008:
Task: "T008 — Edit src/server.ts to import + register createLinksTool (alphabetical: between files and obsidian_exec)"

# After T008 lands, kick off T009 (single command):
Task: "T009 — Run npm run baseline:write to roll forward _register-baseline.json"

# After T009 lands AND T010 lands, kick off T007:
Task: "T007 — Create src/tools/links/index.test.ts with 5 registration cases (descriptor / stripped schema / doc presence / baseline)"
```

---

## Implementation Strategy

### MVP First (User Story 1 — bundles US2/US3/US4)

1. Skip Phase 1 (no setup needed).
2. Complete Phase 2 (T001 — live-CLI characterisation of 6 deferred T0 cases, especially the T0.2 active-mode UpstreamError code decision).
3. Complete Phase 3 (T002–T009 — schema + handler + registration + server edit + baseline roll-forward).
4. **STOP and VALIDATE**: run `npm run test` — 46 of 51 tests pass (T007's 5 registration cases require T010 docs to exist). Run T015's full quality-gate sweep early as a smoke check.
5. Defer US5 docs (T010–T011) and Polish (T012–T017) for the next iteration if you want to ship MVP-only. Note: the registry-consistency test from BI-005 will fail without `docs/tools/links.md`; a minimum docs-stub is required even for MVP. So T010 is effectively part of MVP.

### Incremental Delivery (recommended path)

1. T001 (live probes — T0.2 most important) → T002+T003 (schema) → confirm schema tests pass.
2. T004+T005 (handler) → confirm handler tests pass with the locked T0.2 code.
3. T006+T008+T009 (registration + server + baseline) → confirm registry baseline test passes.
4. T010+T011 (docs) → confirm registry-consistency test passes.
5. T007 (registration tests) → 51-test ship complete.
6. T012–T014 (release mechanics) → T015 (quality gates) → T016 (sanity check) → T017 (smoke).
7. Open PR.

### Parallel Team Strategy

With multiple developers / agents:

- Dev A: T001 (live probes against TestVault — needs Obsidian focused + access).
- Dev B: T002+T003 (schema + tests — pure TS, no live CLI).
- Dev C: T010+T011 (docs — independent files).
- Once A+B+C complete, Dev B picks up T004+T005, Dev A picks up T006+T008+T009.
- Dev C polishes T007 once T009 lands; everyone converges on T015–T017.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [USx] label maps task to specific user story for traceability per the bundled-stories model.
- The single `links` module ships US1/US2/US3/US4 simultaneously; US5 is its independent docs ship.
- Verify tests fail before implementing — once per BI via T016's deliberate-fails-first sanity check.
- Commit after each task or each logical group per the project's commit-on-invocation convention.
- Stop at any checkpoint to validate independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
