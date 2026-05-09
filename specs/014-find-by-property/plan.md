# Implementation Plan: Find By Property — Typed Frontmatter-Index Lookup

**Branch**: `014-find-by-property` | **Date**: 2026-05-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/014-find-by-property/spec.md](./spec.md)

## Summary

Add `find_by_property`, the **fifth** typed-tool wrap and the first **retrieval primitive** that goes value→file rather than file→value. Where `read_note` / `read_property` go file→value (given a path, return content) and `write_note` / `delete_note` mutate a named file, `find_by_property` inverts the relation: given a frontmatter property name and a value, return the vault-relative paths of every note whose frontmatter matches. Replaces the agent's "guess the path from convention" sequence (1–5 calls per identifier resolution) with a single typed call. The user-facing tool surface: `find_by_property({ vault?, property, value, folder?, arrayMatch?, caseSensitive? })` returning `{ count: number, paths: string[] }`. `obsidian_exec` remains as the freeform escape hatch.

**Technical approach** (load-bearing departures from prior typed-tool patterns):

- **No native CLI subcommand exists** for find-by-property. `obsidian help` enumerates 80+ commands; none performs a value→file lookup over frontmatter. The closest surfaces — `properties name=X` (returns counts), `property:read` (file→value, the inverse direction), `search query=<text>` (full-text content, not frontmatter), `files` + per-file `property:read` (N+1 calls) — all fail the spec's "single typed call replaces 1–5 calls" promise (SC-016) for different reasons.
- **CLI subcommand: `eval`** (developer section) — load-bearing departure (R2). Each MCP request invokes one `obsidian eval code=<rendered-js>` with a frozen JS template that walks `app.metadataCache.fileCache` + `app.metadataCache.metadataCache`, applies all matching logic in-process, and returns one JSON `{count, paths}` envelope. The user input itself anticipated this with the "eval composition uses data-passing" clause.
- **Single-call architecture** (R3 — vs 013's two-call): all matching logic runs inside the JS template; no second piece of information to fetch. ~200 ms per request (probed live).
- **Anti-injection via base64-encoded JSON payload** (R6): the JS template is a frozen string constant; the only insertion is a base64 payload. User-supplied `property` / `value` / `folder` flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` + `JSON.parse` at JS runtime. No user input ever reaches the JS source as text. Verifies FR-020 / SC-017 structurally.
- **Schema** — first typed tool that does NOT use the `target_mode` discriminator (FR-002). A flat `z.object({...}).strict().superRefine(...)`. Five fields: `vault?: string`, `property: string.min(1)`, `value: union<string|number|boolean|null|array<scalar>>`, `folder?: string` (validated against the path-traversal regex per FR-021 / Q2), `arrayMatch?: boolean.default(true)`, `caseSensitive?: boolean.default(true)`. The cross-field `superRefine` rejects `value: array` paired with `arrayMatch: true`.
- **Output schema**: `z.object({ count: z.number().int().nonneg(), paths: z.array(z.string()) }).strict()`. Paths-only contract — no matched frontmatter alongside (out of scope per the user input).
- **Adapter `target_mode` mapping** (R4): the user-facing schema has no `target_mode` field. At the cli-adapter call boundary the handler maps `vault === undefined ⇒ target_mode: "active"` (no `vault=` in argv) and `vault !== undefined ⇒ target_mode: "specific"` (`vault=<v>` prefixed). The adapter is unchanged.
- **Folder path-traversal closure** (Q2 / FR-021 / R8): schema-level rejection via the regex `/(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/`. A `folder` value containing any `..` path segment OR starting with `/` `\` produces `VALIDATION_ERROR` before any CLI dispatch. Matches both Unix and Windows separators.
- **Element-order sensitivity** (Q1 / FR-016): `arrayMatch: false` is positional — `[α,β]` does NOT equal `[β,α]`. The JS template's `arrEq` uses index-by-index `every((e, i) => eq(e, y[i]))`.
- **Case sensitivity** (FR-015): `caseSensitive: false` folds case via `toLowerCase()` for string comparisons only; numeric / boolean / null comparisons are always exact.
- **Multi-vault default ambiguity** (Q3 / FR-003 / R11): documented limitation. When `vault` is omitted in a multi-vault setup the underlying CLI's focused-vault default may resolve ambiguously; multi-vault users supply `vault` explicitly. Parity with [013-read-property R4](../013-read-property/research.md).
- **Unknown-vault response inspection** (R5): inherited from the cli-adapter's existing 011-R5 clause without modification. `Vault not found.` exit 0 is byte-identical across `eval` (probed live) and the prior typed tools' subcommands.
- **Output cap** (R10): the cli-adapter's existing 10 MiB cap fires for pathologically large match sets — produces `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation (FR-019 / SC-014).
- **Output ordering** (R9 / FR-022 / SC-018): `for (const p in app.metadataCache.fileCache)` iterates V8 keys in insertion order; same query within one MCP server session returns byte-identical `paths` ordering.
- **Registration**: via the existing `registerTool` factory — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, JSON-serialises typed output objects into the MCP `content[0].text` envelope. Alphabetical insertion at [src/server.ts](../../src/server.ts) tools array — between `createDeleteNoteTool` and `createHelpTool`.
- **Plan-stage characterisation status**: live-CLI characterisation pass executed against `TestVault-Obsidian-CLI-MCP` on 2026-05-09. All critical FR-027 cases verified — see [research.md F1–F8](./research.md#live-cli-findings). Cases deferred to T0 of `/speckit-implement`: date / datetime comparison semantics, Unicode NFC vs NFD, large match-set cap boundary (require fixture authoring beyond plan-stage scope).

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)).
**Storage**: N/A — the tool is stateless. The CLI's `eval` runs against Obsidian's in-memory metadata cache; `find_by_property` is the wrapper. NO caching of vault-walk results across requests (each call re-walks the cache). Project-wide statelessness preserved.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **89.6%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3).
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. CLI subcommand `eval` is OS-independent (Obsidian's CLI surface is the same across platforms); the in-eval JS code uses Obsidian's runtime API which is JavaScript-engine-uniform.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.2.0, the project exposes "an MCP server surface" only; `find_by_property` adds one entry to the registered-tool list at [src/server.ts:66](../../src/server.ts#L66) (alphabetical: between `createDeleteNoteTool` and `createHelpTool`).
**Performance Goals**: per-call latency ~200 ms (single-call eval against the in-memory metadata cache, probed live). Vault-walk cost is O(file_count); a vault with 100k notes still completes well under the 10 s timeout. The matching logic running entirely inside Obsidian's process (in-memory cache walk) is fast and avoids wire-roundtripping per file. **Token saving on the response side** is the primary win — a single `{count, paths}` envelope (~50 bytes per path) replaces the 1–5-call guess-from-convention sequence the spec replaces (per SC-016).
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli` per [src/cli-adapter/cli-adapter.ts:10-11](../../src/cli-adapter/cli-adapter.ts#L10-L11)).
- Single-in-flight CLI queue gates all CLI invocations.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `find_by_property` inherits without modification.
- The `eval` subcommand reaches into Obsidian's internal API (`app.metadataCache.fileCache`, `app.metadataCache.metadataCache`). Future Obsidian updates may surface as test failures rather than silent drift; the JS template's response shape is the locked surface, asserted by handler tests via `JSON.parse` + `findByPropertyOutputSchema.safeParse`.
**Scale/Scope**: ~190 LOC of new code split across `schema.ts` / `handler.ts` / `index.ts` (higher than 013's ~155 because the JS template body adds bulk and the matching logic has more axes). ~500 LOC of co-located tests across three `*.test.ts` files. One new doc at `docs/tools/find_by_property.md` (~200 lines including 4+ worked examples + per-error-code roster + the multi-vault default-ambiguity limitation + the eval-API stability concern). One line of update each in `src/server.ts` (registration), `docs/tools/index.md` (summary), `package.json` (description + version bump 0.2.6 → 0.2.7), `CHANGELOG.md` (release entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/find_by_property/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `obsidian_exec`, `help`, `read_note`, `write_note`, `delete_note`, `read_property`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `zod` (peer); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling helper). |
| **II. Public Surface Test Coverage** | ✅ PASS | `find_by_property` is a public MCP tool surface. Co-located tests at `src/tools/find_by_property/{schema,handler,index}.test.ts` (18 schema cases / 24 handler cases / 5 registration cases per FR-026 = **47 tests total**, exceeding SC-013's floor of 30; bumped 45 → 47 by /speckit-analyze C2 remediation closing FR-023 / FR-024 coverage gaps). Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `find_by_property` via its `it.each` registry walk; no test-file modifications required. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is a flat `z.object({...}).strict().superRefine(...)` (NEW idiom — first typed tool that does NOT use the `target_mode` discriminator per FR-002). Inferred TypeScript type via `z.infer<typeof findByPropertyInputSchema>`. **Output type ALSO via zod schema** `findByPropertyOutputSchema = z.object({ count, paths }).strict()` (FR-010) — no hand-rolled types. The polymorphic `value` is `z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))])` covering the five accepted runtime shapes (FR-005). The cross-field `superRefine` enforces "no array `value` when `arrayMatch: true`". The `folder` field's path-traversal regex is the Q2 / FR-021 security control. `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-019, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`). The 011-R5 unknown-vault response-inspection clause in the cli-adapter is inherited verbatim — no `find_by_property`-specific handling needed (R5). Handler's two-stage parse step (`JSON.parse` + `findByPropertyOutputSchema.safeParse`) wraps both failures in `CLI_REPORTED_ERROR` with a `details.stage` discriminator, never silent. `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/find_by_property/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-029). The Markdown doc at `docs/tools/find_by_property.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code; the JS template is original wrapper logic). |

**Coverage gate**: aggregate statements floor is 89.6% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is small (~190 LOC); the 47 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): all five principles expected to evaluate as Y. No deviations needed; no Complexity Tracking entries required.

**ADR scope check**: [ADR-003 — Enforce Target Mode in Typed Tools](../../.decisions/) governs typed tools that operate on a single named file or active file. `find_by_property` is a value→file lookup with **neither** concept (FR-002 — inherently vault-wide). The ADR's scope does not reach this surface; the ADR is **NOT amended** by this feature. The deviation is intentional and follows from the user input's explicit "this tool is inherently vault-wide and does NOT inherit target_mode" instruction. Reviewers should treat the ADR as "scope-N/A" rather than "violated".

## Project Structure

### Documentation (this feature)

```text
specs/014-find-by-property/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions R1–R14 + plan-stage live-CLI findings
├── data-model.md        # Phase 1 output — input/output schema shapes, JS template body, base64 payload, type-faithful matching matrix
├── quickstart.md        # Phase 1 output — verification scenarios (S-1..S-18 mapped to SC-001..SC-018)
├── contracts/
│   ├── find-by-property-input.contract.md     # Public input contract (zod schema + emitted JSON Schema shape + worked examples)
│   └── find-by-property-handler.contract.md   # Handler invariants (single invokeCli call shape, JS template assembly, response parse)
├── checklists/
│   └── requirements.md  # Quality checklist from /speckit-specify (all 16 items pass)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── find_by_property/                  # NEW per-surface module (FR-001)
│   │   ├── schema.ts                      # findByPropertyInputSchema, findByPropertyOutputSchema, FOLDER_TRAVERSAL_REGEX, types via z.infer (FR-003..FR-009, FR-021)
│   │   ├── schema.test.ts                 # 18 cases per FR-026 (each field rule + cross-field superRefine + folder-traversal regex + defaults applied)
│   │   ├── handler.ts                     # executeFindByProperty(input, deps) — JS template assembly + base64 payload + single invokeCli + two-stage response parse (FR-010..FR-022); ~110 LOC
│   │   ├── handler.test.ts                # 24 cases per FR-026 (happy-path × all matching modes + each UpstreamError code + R5 inheritance + R6 anti-injection round-trip + parse failures + count/paths invariant + FR-023 / FR-024 wrapper-non-transformation locks added by /speckit-analyze C2 remediation)
│   │   ├── index.ts                       # createFindByPropertyTool factory via registerTool (FR-025)
│   │   └── index.test.ts                  # 5 registration cases per FR-026 (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector parameterised lock)
│   ├── _register.ts                       # FROZEN (verified — registerTool covers find_by_property out-of-the-box)
│   ├── _register.test.ts                  # FROZEN — drift detector's it.each registry walk auto-covers find_by_property
│   ├── _shared.ts                         # FROZEN
│   ├── help/                              # FROZEN
│   ├── obsidian_exec/                     # FROZEN (SC-011 — zero substantive diff)
│   ├── read_note/                         # FROZEN (SC-011 — zero substantive diff)
│   ├── write_note/                        # FROZEN (SC-011 — zero substantive diff)
│   ├── delete_note/                       # FROZEN (SC-011 — zero substantive diff)
│   └── read_property/                     # FROZEN (SC-011 — zero substantive diff)
├── server.ts                              # +2 lines: import + createFindByPropertyTool({ logger, queue }) added to the tools array (alphabetical, between createDeleteNoteTool and createHelpTool)
├── server.test.ts                         # registry-consistency test auto-covers find_by_property's docs/ presence (no edits)
├── cli-adapter/                           # FROZEN (008-refactor surface + 011-R5 unknown-vault inspection clause)
├── target-mode/                           # FROZEN — NOT consumed by find_by_property (no target_mode per FR-002)
├── help/                                  # FROZEN
├── errors.ts                              # FROZEN (no new codes per FR-019)
├── logger.ts                              # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                               # FROZEN

docs/tools/
├── find_by_property.md                    # NEW non-stub doc per FR-025 (input schema, output, error roster, ≥4 worked examples covering scalar happy-path / folder-scoped / array-contains / case-insensitive, multi-vault default-ambiguity limitation, eval-API stability concern)
├── index.md                               # +1 line entry per the existing convention
├── obsidian_exec.md                       # FROZEN
├── read_note.md                           # FROZEN
├── write_note.md                          # FROZEN
├── delete_note.md                         # FROZEN
├── read_property.md                       # FROZEN
└── help.md                                # FROZEN

CHANGELOG.md                               # +1 entry under "Unreleased" or 0.2.7 (release versioning is a /speckit-tasks decision)
package.json                               # version 0.2.6 → 0.2.7 + description string updated to mention find_by_property alongside the existing typed tools
README.md                                  # tools-list section updated (if present)
CLAUDE.md                                  # plan-pointer updated by Phase 1 step 3 (already done)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/find_by_property/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, docs index, package description) or out-of-tree documentation (CHANGELOG, README). No new directories at any other layer. Per Constitution Principle I, the new module is single-purpose (typed value→file lookup); per Principle II, tests are co-located with sources.

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler, no per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer. Mirrors actual `read_note` / `write_note` / `delete_note` / `read_property` implementations.
- **R2 — CLI subcommand: `eval`** (load-bearing departure). No native find-by-property subcommand exists; `eval` is the only path that satisfies the spec's single-call promise. The user input itself anticipated this with the "eval composition uses data-passing" clause.
- **R3 — Single-call architecture**: one `invokeCli` invocation per request. ~200 ms per call. All matching logic runs inside the JS template; no second piece of information to fetch.
- **R4 — Adapter `target_mode` mapping**: `vault === undefined ⇒ target_mode: "active"`; `vault !== undefined ⇒ target_mode: "specific"`. The user-facing schema has no `target_mode` field. Adapter is unchanged.
- **R5 — Unknown-vault response inspection**: inherited from the cli-adapter's existing 011-R5 clause; no further changes. `Vault not found.` byte-identical across `eval` (probed live) and the prior typed tools' subcommands.
- **R6 — Anti-injection via base64-encoded JSON payload**: frozen JS template + base64 payload. User inputs flow through `JSON.stringify` → base64 → `atob` + `JSON.parse`. No user input ever reaches the JS source as text. Verifies FR-020 / SC-017 structurally.
- **R7 — In-eval matching logic**: scalar via `===`, case folding via `toLowerCase()` for strings only, array contains via `Array.prototype.some(eq)`, array exact equality via length + positional `every(eq)`, folder filter via `path.startsWith(prefix)`. Live verification matrix: 11 probes, all matching the spec contract.
- **R8 — Folder path-traversal closure (Q2)**: schema regex `/(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/`. Rejects `..` segments and leading `/` `\`. Both Unix and Windows separators.
- **R9 — Output ordering**: `for (const p in fileCache)` — V8 insertion-order stability per ECMA-262 §6.1.7.1. Same query within one server session returns byte-identical `paths` ordering.
- **R10 — Output cap**: existing 10 MiB cli-adapter cap fires for pathologically large match sets. `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation.
- **R11 — Multi-vault default ambiguity (Q3)**: documented limitation. Multi-vault users supply `vault` explicitly. Parity with 013's R4.
- **R12 — Test seams**: `deps.spawnFn` injection per the existing pattern. ONE spawn invocation per request (R3 single-call). Argv-payload assertion includes base64 decode + JSON.parse to lock R6's anti-injection contract.
- **R13 — `import.meta.url` path resolution + coverage threshold preservation**: parity with prior tools.
- **R14 — Don't amend predecessor specs**: research.md is the source of record; spec.md NOT edited retroactively (no plan-stage spec amendments needed — all spec contracts hold against the live CLI).

**Plan-stage status**: all 14 design decisions ratified. Critical FR-027 cases verified live during plan; the matching logic's correctness is locked by the live verification matrix (R7). Cases deferred to T0 of `/speckit-implement`: date / datetime comparison semantics, Unicode NFC vs NFD, large match-set cap boundary.

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R14 + plan-stage live-CLI findings F1–F8.
- **[data-model.md](./data-model.md)** — input/output schema shapes, JS template body, base64 payload assembly, per-tool invariants table, module LOC budget, test inventory (18 / 24 / 5 = 47 cases; bumped 45 → 47 by /speckit-analyze C2 remediation).
- **[contracts/find-by-property-input.contract.md](./contracts/find-by-property-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, the six top-level fields, the strict-mode constraint, seven worked examples (A-G), order-sensitivity contract, multi-vault ambiguity note, error response roster.
- **[contracts/find-by-property-handler.contract.md](./contracts/find-by-property-handler.contract.md)** — handler invariants: deps shape, the single `invokeCli` call shape, the JS template assembly + base64 payload renderer, the two-stage eval response parse (`JSON.parse` + `findByPropertyOutputSchema.safeParse`), failure propagation chain, test seam pattern with argv-payload decode assertion.
- **[quickstart.md](./quickstart.md)** — 18 verification scenarios (S-1..S-18) mapped 1:1 to SC-001..SC-018, with explicit run instructions for each. S-1..S-15 in CI; S-16..S-18 are manual end-to-end steps against MCP Inspector / Claude Desktop.
- **CLAUDE.md plan-pointer update** — the plan reference is updated to point at this plan file (done in this command run).

## Constitution Re-Check (Post-Design)

| Principle | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout; no cross-module imports added beyond the verified set. The single-call architecture (R3) keeps the import topology simple — handler imports cli-adapter only. |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at 47 cases (18 schema / 24 handler / 5 registration; bumped 45 → 47 by /speckit-analyze C2 remediation closing FR-023 / FR-024 coverage gaps). Drift detector auto-covers. Each handler test responds to the right number of spawn invocations (ONE per call per R3). |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived per FR-010 with the count + paths shape. Cross-field `superRefine` enforces "no array `value` when `arrayMatch: true`". The `folder` field's path-traversal regex is the Q2 / FR-021 security control. The polymorphic `value` union is the public contract. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. R5 inherits the 011-R5 cli-adapter response-inspection clause without modification. Handler's two-stage parse step wraps both `JSON.parse` failure and schema-validation failure as `CLI_REPORTED_ERROR` with a `details.stage` discriminator — never silent. |
| V. Attribution & Layered Composition | ✅ PASS | All new files marked Original. No upstream code lifted. The JS template is original wrapper logic; not derived from any external project. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |

**Note on ADR-003 scope**: this feature does NOT enforce `target_mode` (per FR-002). ADR-003's scope governs typed tools that operate on a single named file or active file; `find_by_property` is a value→file lookup with neither concept. Reviewers: this is **scope-N/A**, not a violation. The ADR is not amended.

## Reporting

- **Branch**: `014-find-by-property`
- **Plan path**: `specs/014-find-by-property/plan.md`
- **Generated artifacts**:
  - `specs/014-find-by-property/research.md` — design decisions R1–R14 + plan-stage live-CLI findings F1–F8
  - `specs/014-find-by-property/data-model.md` — schema shapes, JS template body, base64 payload, test inventory
  - `specs/014-find-by-property/contracts/find-by-property-input.contract.md` — public input contract + worked examples
  - `specs/014-find-by-property/contracts/find-by-property-handler.contract.md` — handler invariants (single-call shape)
  - `specs/014-find-by-property/quickstart.md` — 18 verification scenarios
  - `CLAUDE.md` — plan reference updated
- **Plan-stage spec amendments**: NONE. All spec contracts hold against the live CLI. The three [Clarifications session 2026-05-09](./spec.md#clarifications) Q&As (Q1 element-order, Q2 folder traversal closure, Q3 multi-vault) were codified directly in spec.md before plan; plan-stage findings refine implementation strategy (single-call eval-based, base64 anti-injection, schema-regex traversal closure) but do NOT contradict the spec.
- **Next command**: `/speckit-tasks` — produces `tasks.md` with dependency-ordered, atomic tasks (T001..TNNN) per the established convention.
