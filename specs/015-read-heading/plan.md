# Implementation Plan: Read Heading — Typed Heading-Body Read

**Branch**: `015-read-heading` | **Date**: 2026-05-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/015-read-heading/spec.md](./spec.md)

## Summary

Add `read_heading`, the **sixth** typed-tool wrap and the first **heading-targeted retrieval primitive**. Where `read_note` returns whole files (5–50k tokens for long documents), `read_heading` returns just the body of a single named section (typically 100–500 tokens). The user-facing tool surface: `read_heading({ target_mode, vault?, file?, path?, heading })` returning `{ content: string }`. The `heading` field is a `::`-separated path with at least two non-empty segments (`H1::H2` or `H1::H2::H3`); single-segment H1-only reads, headings whose text contains `::` literally, and Setext underline-style headings are explicitly out of reach (documented fallback: full-file `read_note` plus client-side parse). `obsidian_exec` remains as the freeform escape hatch.

**Technical approach** (load-bearing departures from prior typed-tool patterns):

- **No native CLI subcommand exists** for heading-body reads. Probed live 2026-05-09 against `obsidian help`: `read` returns whole files (no `subpath` parameter); `outline` lists headings only (no body content); `bookmark` accepts `subpath` but writes a bookmark, not reads body. None returns a section's body. Iterating `read` + client-side parse defeats the spec's "single typed call replaces the brittle parse" promise (SC-015).
- **CLI subcommand: `eval`** (developer section) — load-bearing departure (R2). Each MCP request invokes one `obsidian eval code=<rendered-js>` with a frozen JS template. Parity with 014's eval composition.
- **Single-call architecture** (R3): one `invokeCli` invocation per request. The JS template resolves the file path (active-mode focused-file lookup OR specific-mode wikilink/path resolution), walks `app.metadataCache.metadataCache[hash].headings`, finds the first matching segment path, slices the file content between `headings[matchIdx].position.end.offset` and `headings[matchIdx+1]?.position.start.offset ?? text.length`, and returns one JSON envelope. ~200 ms per call.
- **Critical R7 finding**: Obsidian's pre-parsed headings array (probed live 2026-05-09 against The Setup's `000-Meta/About This Vault.md`) carries `{heading, level, position: {start: {offset}, end: {offset}}}` per heading. Obsidian has ALREADY done ATX-marker recognition AND fence-opacity for us — heading-like text inside fenced code blocks does NOT appear in the headings array. The boundary detector and segment matcher both operate on this pre-parsed array; no in-eval Markdown parser is needed. This collapses the implementation surface dramatically vs the spec-stage assumption of an in-eval line-by-line ATX scanner with explicit fence tracking.
- **Anti-injection via base64-encoded JSON payload** (R6): the JS template is a frozen string constant; the only insertion is a base64 payload. User-supplied `path` / `file` / `heading` / `target_mode` flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` + `JSON.parse` at JS runtime. No user input ever reaches the JS source as text. Verifies FR-021 / SC-021 structurally. Parity with 014's R6.
- **Schema** — STANDARD target_mode discriminator idiom (NOT 014's flat departure). Reuses [`targetModeBaseSchema`](../../src/target-mode/target-mode.ts) extended with the new `heading: z.string().min(1).refine(...)` field. The `heading` validator is **structural-only** (FR-006 / FR-007): split on the literal `::`, require ≥2 non-empty segments. The `applyTargetModeRefinement` helper provides the existing specific/active enforcement for `vault` / `file` / `path` per the post-010 idiom.
- **Output schema**: `z.object({ content: z.string() }).strict()`. Single-string contract — no metadata sidecar (FR-009).
- **Segment matching semantics (FR-028)**: minimal-normalisation, case-sensitive byte compare. Obsidian's `headings[i].heading` field is ALREADY post-marker-strip + post-closing-ATX-strip + post-trim (probed live: `# About This Vault` heading line → `heading: "About This Vault"`). The segment matcher does case-sensitive byte equality on Obsidian's `heading` field — no further normalisation needed in the JS template. Inline markdown (`**bold**`, `[link](url)`) and Obsidian anchor markers (`^anchor-id`) survive because Obsidian preserves them in the `heading` field; callers must supply them verbatim.
- **First-match convention (FR-017)**: walking the headings array in document order; the first segment-path match terminates the search. Naturally satisfied by `for (let i = 0; i < headings.length; i++)` with `break` on match.
- **Body terminator (FR-010)**: `headings[matchIdx+1]?.position.start.offset ?? text.length`. Whichever heading appears first AFTER the matched one — child, sibling, or shallower — terminates the body. EOF terminates if no subsequent heading exists. Naturally satisfies the first-subsequent-heading-marker-of-any-depth rule from the 2026-05-09 clarifications session.
- **Setext exclusion (FR-012 / Q2)**: Obsidian's metadataCache.headings array MAY include Setext-style headings on some Obsidian versions. To enforce the ATX-only rule per the 2026-05-09 clarifications session, the JS template MUST filter the headings array to ATX-only entries: `headings.filter(h => fileText[h.position.start.offset] === '#')`. Probed at T0 against a Setext fixture; if Obsidian already excludes Setext from the headings array on the host's version, the filter becomes a defence-in-depth no-op rather than functional logic.
- **Adapter `target_mode` mapping (R4)**: STANDARD — the user-facing schema HAS the `target_mode` field. The handler passes `input.target_mode` through to `invokeCli` unchanged (parity with 013-read-property). `vault` flows through to `invokeCli`'s top-level `vault` field. The CLI's vault-routing limitation (the `vault=` parameter is functionally ignored by `eval`, which always runs against the focused vault) is the SAME pre-existing inherited limitation that 014/013 carry. Documented in `docs/tools/read_heading.md`.
- **Unknown-vault response inspection (R5)**: inherited from the cli-adapter's existing 011-R5 clause without modification. `Vault not found.` exit 0 byte-identical across `eval` (probed live 2026-05-09) and the prior typed tools' subcommands. The cli-adapter's existing inspection clause re-classifies to `CLI_REPORTED_ERROR` before the wrapper's parse step runs.
- **Structured eval-response error envelope (R13)**: the JS template returns `{ok: true, content: <string>}` on success or `{ok: false, code: 'FILE_NOT_FOUND' | 'HEADING_NOT_FOUND' | 'NO_ACTIVE_FILE', detail: <string>}` on failure. The handler's two-stage parse (`JSON.parse` + envelope validation via `readHeadingEvalResponseSchema.safeParse`) wraps both failures and any envelope `ok: false` as `UpstreamError` per FR-022 with a `details.stage` discriminator. Zero new error codes (FR-022); failures map onto existing `VALIDATION_ERROR` / `CLI_REPORTED_ERROR` / `CLI_NON_ZERO_EXIT` / `CLI_BINARY_NOT_FOUND` / `ERR_NO_ACTIVE_FILE`.
- **CRLF / LF round-trip (FR-019 / SC-008)**: the JS template uses `await app.vault.adapter.read(path)` which returns the file as a JS string with on-disk line endings preserved. JSON.stringify encodes `\r` as `\\r` and `\n` as `\\n`, both of which round-trip byte-faithfully through the OS pipe + adapter parse layers. Verified at T0 against CRLF/LF fixture pair.
- **Output cap (R10)**: the cli-adapter's existing 10 MiB cap fires for pathologically large body slices — produces a structured `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation (FR-020 wrapper-level by inheritance).
- **Registration**: via the existing `registerTool` factory — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, JSON-serialises typed output objects into the MCP `content[0].text` envelope. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between `createObsidianExecTool` and `createReadNoteTool`.
- **Plan-stage characterisation status**: live-CLI characterisation pass executed against the focused vault (`The Setup`) on 2026-05-09. Probes verified: eval execution + `=> ` prefix; `app.vault.adapter.read(path)` returns file as JS string; `app.metadataCache.metadataCache[hash].headings` exists with the documented shape `{heading, level, position: {start: {offset}, end: {offset}}}`; eval errors surface as `Error: <message>` exit 0 (caught by dispatch-layer four-priority classifier); the `vault=` parameter routes to existing-vault success or unknown-vault `Vault not found.` per 011-R5. Cases deferred to T0 of `/speckit-implement` (require fixtures in TestVault and the test vault opening): segment-matching for closing-ATX form / surrounding whitespace / inline-markdown survival / anchor survival; Setext-as-content (and the question of whether Obsidian's headings array includes Setext entries on the host's version); fenced-code-block-with-inside-heading; CRLF round-trip; LF round-trip; duplicate heading path first-match; very-large-body cap-boundary; active-mode focused-note happy path; active-mode no-focus error.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI's `eval` runs against Obsidian's in-memory metadata cache + on-disk file via `app.vault.adapter.read`; `read_heading` is the wrapper. No caching of cache walks across requests.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **89.6%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3).
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `eval` is OS-independent; the in-eval JS code uses Obsidian's runtime API which is JavaScript-engine-uniform.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `read_heading` adds one entry to the registered-tool list at [src/server.ts:67](../../src/server.ts#L67) (alphabetical: between `createObsidianExecTool` and `createReadNoteTool`).
**Performance Goals**: per-call latency ~200 ms (single-call eval; metadata cache walk is O(heading_count) which is small for typical notes; file content read via `app.vault.adapter.read` is async-IO-bound on the file size; body slice is O(body_size)). Vault size has zero impact (the implementation reads only the named file + walks only its headings array). **Token saving on the response side** is the primary win — typical heading body is 100–500 chars vs 5–50k for a full-file `read_note` (per SC-015).
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli` per [src/cli-adapter/cli-adapter.ts:10-11](../../src/cli-adapter/cli-adapter.ts#L10-L11)).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `read_heading` inherits without modification.
- The `eval` subcommand reaches into Obsidian's internal API (`app.metadataCache.metadataCache[hash].headings`, `app.vault.adapter.read`, `app.workspace.getActiveFile`, `app.metadataCache.getFirstLinkpathDest`). Future Obsidian updates may surface as test failures rather than silent drift; the JS template's response shape is the locked surface, asserted by handler tests via `JSON.parse` + `readHeadingEvalResponseSchema.safeParse`.
**Scale/Scope**: ~210 LOC of new code split across `schema.ts` / `handler.ts` / `index.ts` (higher than 014's ~190 because the JS template resolves three file-locator modes — active / specific+path / specific+file wikilink — and runs an async file-read in addition to the metadataCache walk). ~600 LOC of co-located tests across three `*.test.ts` files. One new doc at `docs/tools/read_heading.md` (~220 lines including 4+ worked examples + per-error-code roster + the multi-vault default-ambiguity limitation + the eval-API stability concern + the Setext / single-segment / `::`-in-text out-of-reach fallback). One line of update each in `src/server.ts` (registration), `docs/tools/index.md` (summary), `package.json` (description + version bump 0.2.7 → 0.2.8), `CHANGELOG.md` (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/read_heading/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `obsidian_exec`, `help`, `read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `zod` and `target-mode/target-mode.ts` (peer); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `read_heading` is a public MCP tool surface. Co-located tests at `src/tools/read_heading/{schema,handler,index}.test.ts` — **20 schema cases / 30 handler cases / 5 registration cases = 55 tests total**, exceeding SC-018's floor of 25. Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `read_heading` via its `it.each` registry walk; no test-file modifications required. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema reuses `targetModeBaseSchema` extended with `heading: z.string().min(1).refine(<structural-2-segment-validator>)`. The structural validator is the FR-006 / FR-007 contract: split on `::`, require ≥2 non-empty segments. `applyTargetModeRefinement` supplies the standard specific/active enforcement (parity with 013-read-property). Inferred TypeScript type via `z.infer<typeof readHeadingInputSchema>`. **Output type ALSO via zod schema** `readHeadingOutputSchema = z.object({ content: z.string() }).strict()` (FR-009) — no hand-rolled types. The eval-envelope schema `readHeadingEvalResponseSchema = z.discriminatedUnion("ok", [z.object({ok: z.literal(true), content: z.string()}).strict(), z.object({ok: z.literal(false), code: z.enum([...]), detail: z.string()}).strict()])` is the wire-format contract. `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-022, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`). The 011-R5 unknown-vault response-inspection clause in the cli-adapter is inherited verbatim — no `read_heading`-specific handling needed (R5). The structured eval-envelope's `ok: false` cases map onto: `NO_ACTIVE_FILE` → `ERR_NO_ACTIVE_FILE`; `FILE_NOT_FOUND` and `HEADING_NOT_FOUND` → `CLI_REPORTED_ERROR` with `details.stage = "envelope-error"` and `details.code = <eval-code>`. Two-stage parse failures (`JSON.parse` failure / envelope-schema-parse failure) map onto `CLI_REPORTED_ERROR` with `details.stage = "json-parse"` / `"envelope-parse"`. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/read_heading/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-027). The Markdown doc at `docs/tools/read_heading.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code; the JS template is original wrapper logic). |

**Coverage gate**: aggregate statements floor is 89.6% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is small (~210 LOC); the 55 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**ADR scope check**: [ADR-003 — Enforce Target Mode in Typed Tools](../../.decisions/) is **enforced by this feature** — `read_heading` operates on a single named file (specific mode) or active file (active mode), exactly the surface ADR-003 governs. The schema reuses `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/target-mode.ts` per ADR-003. No deviation; no ADR amendment needed.

## Project Structure

### Documentation (this feature)

```text
specs/015-read-heading/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions R1–R14 + plan-stage live-CLI findings F1–F8
├── data-model.md        # Phase 1 output — input/output/eval-envelope schema shapes, JS template body, base64 payload, per-tool invariants table, module LOC budget, test inventory
├── quickstart.md        # Phase 1 output — verification scenarios (S-1..S-22 mapped to SC-001..SC-022)
├── contracts/
│   ├── read-heading-input.contract.md     # Public input contract (zod schema + emitted JSON Schema shape + worked examples)
│   └── read-heading-handler.contract.md   # Handler invariants (single invokeCli call shape, JS template assembly, two-stage envelope parse)
├── checklists/
│   └── requirements.md  # Quality checklist from /speckit-specify (all 16 items pass)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── read_heading/                       # NEW per-surface module (FR-001)
│   │   ├── schema.ts                       # readHeadingInputSchema (target_mode + heading), readHeadingOutputSchema, readHeadingEvalResponseSchema, HEADING_PATH_SEPARATOR, validateHeadingPath, types via z.infer (FR-002..FR-009)
│   │   ├── schema.test.ts                  # 20 cases (target_mode discriminator: specific/no-vault, specific/no-locator, specific/both-locators, active/forbidden-keys × 3, valid specific path, valid specific file, valid active; heading: empty/missing, 1-segment, leading-empty, trailing-empty, interior-empty, valid 2-seg, valid 3-seg, valid 6-seg; additionalProperties; inferred types)
│   │   ├── handler.ts                      # executeReadHeading(input, deps) — JS template assembly + base64 payload + single invokeCli + two-stage envelope parse + envelope-error mapping (FR-010..FR-022); ~125 LOC
│   │   ├── handler.test.ts                 # 30 cases (happy path × {2-seg specific path, 3-seg nested specific path, file-locator specific, active-mode specific}; sibling/higher/child/EOF terminators; empty-body; fence opacity (assumed via Obsidian); Setext exclusion (assumed via Obsidian); duplicate first-match; segment matching (closing-ATX, surrounding-whitespace, inline-markdown-survives, anchor-survives, mis-cased-fail); CRLF round-trip; LF round-trip; envelope ok:false × 3 codes; JSON parse failure; envelope schema-parse failure; UpstreamError pass-through; argv shape with base64 decode assertion (R6 anti-injection); single spawn invocation per request (R3 / R12))
│   │   ├── index.ts                        # createReadHeadingTool factory via registerTool (FR-023)
│   │   └── index.test.ts                   # 5 registration cases (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector parameterised lock)
│   ├── _register.ts                        # FROZEN (verified — registerTool covers read_heading out-of-the-box)
│   ├── _register.test.ts                   # FROZEN — drift detector's it.each registry walk auto-covers read_heading
│   ├── _shared.ts                          # FROZEN
│   ├── help/                               # FROZEN
│   ├── obsidian_exec/                      # FROZEN (SC-016 — zero substantive diff)
│   ├── read_note/                          # FROZEN (SC-016 — zero substantive diff)
│   ├── write_note/                         # FROZEN (SC-016 — zero substantive diff)
│   ├── delete_note/                        # FROZEN (SC-016 — zero substantive diff)
│   ├── read_property/                      # FROZEN (SC-016 — zero substantive diff)
│   └── find_by_property/                   # FROZEN (SC-016 — zero substantive diff)
├── server.ts                               # +2 lines: import + createReadHeadingTool({ logger, queue }) added to the tools array (alphabetical, between createObsidianExecTool and createReadNoteTool)
├── server.test.ts                          # registry-consistency test auto-covers read_heading's docs/ presence (no edits)
├── cli-adapter/                            # FROZEN (008-refactor surface + 011-R5 unknown-vault inspection clause)
├── target-mode/                            # CONSUMED (read_heading uses applyTargetModeRefinement + targetModeBaseSchema unchanged)
├── help/                                   # FROZEN
├── errors.ts                               # FROZEN (no new codes per FR-022)
├── logger.ts                               # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                                # FROZEN

docs/tools/
├── read_heading.md                         # NEW non-stub doc per FR-023 (input schema, output, error roster, ≥4 worked examples covering 2-seg specific-mode, 3-seg nested specific-mode, active-mode, heading-not-found error; multi-vault default-ambiguity limitation; eval-API stability concern; out-of-reach fallback for single-segment / `::`-in-text / Setext)
├── index.md                                # +1 line entry per the existing convention
├── obsidian_exec.md                        # FROZEN
├── read_note.md                            # FROZEN
├── write_note.md                           # FROZEN
├── delete_note.md                          # FROZEN
├── read_property.md                        # FROZEN
├── find_by_property.md                     # FROZEN
└── help.md                                 # FROZEN

CHANGELOG.md                                # +1 entry under "Unreleased" or 0.2.8 (release versioning is a /speckit-tasks decision)
package.json                                # version 0.2.7 → 0.2.8 + description string updated to mention read_heading alongside the existing typed tools
README.md                                   # tools-list section updated (if present)
CLAUDE.md                                   # plan-pointer updated by Phase 1 step 3 (already done)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/read_heading/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed heading-body read); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler, no per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer. Mirrors actual prior typed tools.
- **R2 — CLI subcommand: `eval`** (load-bearing departure). No native heading-body subcommand exists; `eval` is the only path. Parity with 014's R2.
- **R3 — Single-call architecture**: one `invokeCli` invocation per request. ~200 ms per call. The JS template resolves the file path, walks Obsidian's pre-parsed headings array, slices body content, and returns one envelope.
- **R4 — Adapter `target_mode` mapping**: STANDARD — `read_heading` has the `target_mode` discriminator. `input.target_mode` flows through to `invokeCli` unchanged. The CLI's vault-routing limitation (eval ignores vault= and runs against focused vault) is the inherited 011/013/014 limitation; documented.
- **R5 — Unknown-vault response inspection**: inherited from the cli-adapter's existing 011-R5 clause; no further changes. `Vault not found.` byte-identical across `eval` (probed live) and the prior typed tools' subcommands.
- **R6 — Anti-injection via base64-encoded JSON payload**: frozen JS template + base64 payload. User inputs flow through `JSON.stringify` → base64 → `atob` + `JSON.parse`. No user input ever reaches the JS source as text. Verifies FR-021 / SC-021 structurally. Parity with 014's R6.
- **R7 — In-eval boundary detection via `app.metadataCache.metadataCache[hash].headings`**: Obsidian's pre-parsed headings array gives `{heading, level, position: {start: {offset}, end: {offset}}}` per ATX heading. Body terminator is `headings[matchIdx+1]?.position.start.offset ?? text.length`. Naturally satisfies the first-subsequent-heading-marker-of-any-depth rule from the 2026-05-09 clarifications session AND the fence-opacity contract (Obsidian excludes fenced-code-block heading-like text from the headings array).
- **R8 — In-eval segment matcher**: walk headings array maintaining `stack[h.level - 1] = h.heading`; truncate stack at each new heading; on `stack.length === segments.length`, compare element-wise with case-sensitive byte equality (FR-028 minimal-normalisation contract — Obsidian's `heading` field is already post-marker-strip + post-closing-ATX-strip + post-trim). First match terminates the search (FR-017).
- **R9 — File path resolution**: three modes inside the JS template — active (`app.workspace.getActiveFile()?.path`), specific+path (use directly), specific+file (resolve via `app.metadataCache.getFirstLinkpathDest(file, '')?.path`). Active-mode no-focus and specific-mode unresolved-locator both surface via the structured envelope (`ok: false, code: 'NO_ACTIVE_FILE' | 'FILE_NOT_FOUND'`).
- **R10 — Output cap**: existing 10 MiB cli-adapter cap fires for pathologically large body slices. `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation.
- **R11 — Multi-vault default ambiguity**: documented limitation. Multi-vault users open the target vault before invoking. Parity with 014's R11 / 013's R4.
- **R12 — Test seams**: `deps.spawnFn` injection per the existing pattern. ONE spawn invocation per request (R3 single-call). Argv-payload assertion includes base64 decode + JSON.parse to lock R6's anti-injection contract.
- **R13 — Structured eval-response error envelope**: discriminated union `{ok: true, content}` | `{ok: false, code, detail}`. Handler's two-stage parse: `JSON.parse` + envelope-schema validation. Failure → `UpstreamError` with `details.stage` + `details.code` discriminators. Maps onto existing error codes per FR-022.
- **R14 — Setext exclusion (defence-in-depth)**: Obsidian's metadataCache.headings array MAY include Setext headings on some versions. The JS template filters to ATX-only via `headings.filter(h => fileText[h.position.start.offset] === '#')`. T0 verifies whether Obsidian's behaviour on the host's version makes this filter functional or a defence-in-depth no-op.

**Plan-stage status**: 14 design decisions ratified. Critical FR-025 cases verified live during plan against The Setup vault (the test vault was not focused at probe time; happy-path verification deferred to T0 with TestVault opened). The architecture is locked by:
- The `=> ` prefix and OS-pipe transport behaviour of `obsidian eval` (probed).
- The `app.metadataCache.metadataCache[hash].headings` shape (probed against `000-Meta/About This Vault.md`).
- The `app.vault.adapter.read(path)` async shape and string return (probed).
- The "Vault not found." vs known-vault eval routing (cited from 014's R5 verification).
- The dispatch layer's four-priority error classifier — `Error: ` prefix surfaces as `CLI_REPORTED_ERROR` and `Error: no active file` surfaces as `ERR_NO_ACTIVE_FILE` (verified by inspection of [src/cli-adapter/_dispatch.ts:254-274](../../src/cli-adapter/_dispatch.ts#L254-L274)).

Cases deferred to T0 of `/speckit-implement` (require fixtures in TestVault and the test vault opening): segment-matching characterisation; Setext-as-content (and the Obsidian-version-dependent question of whether `headings` includes Setext); fenced-code-block-with-inside-heading; CRLF round-trip; LF round-trip; duplicate heading path first-match; very-large-body cap-boundary; active-mode focused-note happy path; active-mode no-focus error.

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R14 + plan-stage live-CLI findings F1–F8.
- **[data-model.md](./data-model.md)** — input/output/eval-envelope schema shapes, JS template body, base64 payload assembly, per-tool invariants table, module LOC budget, test inventory (20 / 30 / 5 = 55 cases).
- **[contracts/read-heading-input.contract.md](./contracts/read-heading-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, the field policy, the structural-only heading-path validator, six worked examples (A–F), error response roster.
- **[contracts/read-heading-handler.contract.md](./contracts/read-heading-handler.contract.md)** — handler invariants: deps shape, the single `invokeCli` call shape, the JS template assembly + base64 payload renderer, the two-stage eval response parse (`JSON.parse` + `readHeadingEvalResponseSchema.safeParse`), envelope-error → UpstreamError mapping table, test seam pattern with argv-payload decode assertion.
- **[quickstart.md](./quickstart.md)** — 22 verification scenarios (S-1..S-22) mapped 1:1 to SC-001..SC-022, with explicit run instructions for each. S-1..S-19 in CI; S-20..S-22 are manual end-to-end steps against MCP Inspector / Claude Desktop.
- **CLAUDE.md plan-pointer update** — the plan reference is updated to point at this plan file (done in this command run).

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. The single-call architecture (R3) keeps the import topology simple — handler imports cli-adapter only. Schema reuses `target-mode/` per ADR-003 (no duplication). |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 55 cases (20 schema / 30 handler / 5 registration). Drift detector auto-covers. Each handler test responds to the right number of spawn invocations (ONE per call per R3). |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-009 with the single `content` field. The eval-envelope discriminated union is the wire contract. The structural heading-path validator (FR-006) is a single `.refine()` on the heading field; no in-handler re-validation. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. R5 inherits the 011-R5 cli-adapter response-inspection clause without modification. Handler's two-stage parse step wraps both `JSON.parse` failure and envelope-schema-validation failure as `CLI_REPORTED_ERROR` with a `details.stage` discriminator — never silent. The envelope's `ok: false, code: 'NO_ACTIVE_FILE'` maps to `ERR_NO_ACTIVE_FILE` for parity with the dispatch layer's existing classification. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. The JS template is original wrapper logic; not derived from any external project. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

**Note on ADR-003 scope**: this feature **enforces** `target_mode` (per FR-002). The schema reuses `targetModeBaseSchema` + `applyTargetModeRefinement` from `src/target-mode/target-mode.ts` per the ADR. No deviation; no ADR amendment.

## Reporting

- **Branch**: `015-read-heading`
- **Plan path**: `specs/015-read-heading/plan.md`
- **Generated artifacts**:
  - `specs/015-read-heading/research.md` — design decisions R1–R14 + plan-stage live-CLI findings F1–F8
  - `specs/015-read-heading/data-model.md` — schema shapes, JS template body, base64 payload, test inventory
  - `specs/015-read-heading/contracts/read-heading-input.contract.md` — public input contract + worked examples
  - `specs/015-read-heading/contracts/read-heading-handler.contract.md` — handler invariants (single-call shape, envelope mapping)
  - `specs/015-read-heading/quickstart.md` — 22 verification scenarios
  - `CLAUDE.md` — plan reference updated
- **Plan-stage spec amendments**: NONE. All spec contracts hold against the live CLI and against Obsidian's metadataCache shape probed at plan time. The three [Clarifications session 2026-05-09](./spec.md#clarifications) Q&As (Q1 boundary rule, Q2 ATX-only, Q3 segment-matching minimal-normalisation) were codified directly in spec.md before plan; plan-stage findings refine implementation strategy (eval composition, pre-parsed-headings-array reuse, Setext defence-in-depth filter, structured envelope) but do NOT contradict the spec.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
