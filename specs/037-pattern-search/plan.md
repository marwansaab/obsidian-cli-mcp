# Implementation Plan: Pattern Search

**Branch**: `037-pattern-search` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/037-pattern-search/spec.md`

## Summary

Ship a typed `pattern_search` MCP tool that scans every markdown note in a vault (or under a named sub-folder) for ECMAScript-regex matches and returns each match as a row carrying `{path, line, match, text, ...}`. The tool reuses the established eval-driven execution path (frozen JS template + base64 payload, single `invokeCli` call to the `eval` subcommand), the established result-cap convention (`limit?: 1..10000`, implicit 1000, `truncated: true` when capped), the established sort order (path asc UTF-16, then line asc, then per-line offset asc), and the established CLI_REPORTED_ERROR sub-discriminator pattern. Invalid pattern is rejected at the zod-validation boundary so it surfaces as a `VALIDATION_ERROR` field-path envelope rather than a new top-level error code. Constitution Principle IV's zero-new-top-level-code streak (fifteen typed tools as of BI-036) carries into the sixteenth tool.

The feature unblocks retirement of an external regex-search tool agents currently fall back to; once `pattern_search` ships, every cross-reference question the project tracks today is answerable inside the typed-tool surface.

## Technical Context

**Language/Version**: TypeScript 5.6.x, strict mode, `tsc --noEmit` clean (constitution §Technical Standards)
**Primary Dependencies**: `zod` 3.23.x (boundary validation, Principle III), `@modelcontextprotocol/sdk` 1.0.x (tool registration), `zod-to-json-schema` 3.23.x (inputSchema publication). No new runtime deps.
**Storage**: N/A — read-only against the Obsidian vault via the CLI's `eval` subcommand; no wrapper-side persistence.
**Testing**: `vitest` 4.x + `@vitest/coverage-v8`. Co-located `*.test.ts` per Principle II. In-process unit tests mock `invokeCli`; live-CLI characterisation happens at T0 against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).
**Target Platform**: Node.js ≥ 22.11 (latest 22.x LTS minor; constitution §Technical Standards). MCP server spawns child process `obsidian` CLI; ECMAScript regex runs inside the Obsidian-side Node runtime (electron) via the `eval` subcommand — semantics identical to wrapper-side Node `RegExp` modulo Node version drift across hosts (negligible for the ECMAScript regex feature set this tool exposes).
**Project Type**: library + CLI bridge (single-project layout under `src/`).
**Performance Goals**: Single `invokeCli` round-trip per call (no N+1 read fan-out). Sibling `paths` (BI-019, eval-driven over `app.vault.adapter.list`) executes in tens of ms against vaults under ~10k files; `pattern_search` is bound by the same vault-traversal floor plus per-file `cachedRead` and per-line regex evaluation. The 10-second / 10 MiB cli-adapter bounds (ADR-007, [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts)) are inherited verbatim — no per-tool override.
**Constraints**: ECMAScript regex semantics locked at /speckit-clarify Q1 (Node `RegExp`). 500-UTF-16-code-unit line cap with `…` (U+2026) parity with BI-033 FR-024 / BI-035, locked at Q2. Zero-length matches skipped at the eval-template layer (FR-016), locked at Q3. Zero new top-level error codes (Principle IV streak). Zero new `details.code` values under `CLI_REPORTED_ERROR` (invalid pattern routes through `VALIDATION_ERROR` instead).
**Scale/Scope**: Vaults under ~10k markdown notes are the dominant cohort. Vaults beyond that fire `truncated: true` at the result cap (default 1000, max 10000), forcing the caller to narrow the pattern or scope. The eval-template's per-line `matchAll` runs in-process inside the Obsidian Node runtime — no spawn per file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The plan is evaluated against each principle and ADR in the Constitution Compliance checklist (constitution v1.5.0, ratified 2026-05-03, last amended 2026-05-15):

| Gate | Status | Evidence |
|---|---|---|
| Principle I (Modular Code Organization) | Y | New surface lives at `src/tools/pattern_search/{schema, handler, index, _template}.ts` + co-located tests. Imports flow one-directional: `index.ts → _register.ts`, `index.ts → handler.ts`, `handler.ts → cli-adapter`, `handler.ts → errors`, `handler.ts → schema.ts`, `handler.ts → _template.ts`. No upward or cyclic dependencies. The folder-normalisation helper `stripBoundarySlashes` is imported from `../search/handler.ts` per the established sibling-consumption pattern (BI-035 already does this without violating one-directional flow — both `search` and `context_search` / `pattern_search` consume `search`'s utility, never the other way). |
| Principle II (Public Surface Test Coverage) | Y | `src/tools/pattern_search/schema.test.ts` (happy path + zod-validation boundaries: empty pattern, oversized pattern, invalid-pattern refinement, unknown field, limit bounds), `src/tools/pattern_search/handler.test.ts` (happy path with mocked `invokeCli`; folder-not-found via envelope `details.code`; vault-not-found via cli-adapter stdout classifier; zero-match empty success; CLI stdout malformed → CLI_REPORTED_ERROR with `details.stage`; truncation flag fires on cap; zero-length match skip; long-line cap with `…`). `src/tools/pattern_search/index.test.ts` (tool descriptor shape, name, description, registration via `registerTool`). All co-located in the same change. |
| Principle III (Boundary Input Validation with Zod) | Y | `patternSearchInputSchema` is the single source of truth; `z.infer` types flow downstream. Strict object, `pattern`/`folder`/`vault` are non-empty strings, `limit` is bounded int 1..10000, `case_sensitive` is optional boolean, `vault` is optional. Invalid regex is detected at validation via a `superRefine` that runs `new RegExp(input.pattern, input.case_sensitive === false ? 'i' : '')` inside a `try/catch(SyntaxError)` and emits a Zod issue with path `["pattern"]` and the JS engine's `SyntaxError` message. No hand-rolled `typeof` chains at the boundary. Output schema `patternSearchOutputSchema` validates the response envelope at the response boundary (sibling parity with `context_search`'s `.refine((o) => o.count === o.matches.length)`). |
| Principle IV (Explicit Upstream Error Propagation) | Y | Every failure surfaces through `UpstreamError`. Reused top-level codes — zero new top-level codes added. `CLI_REPORTED_ERROR` carries: `details.stage = "json-parse" \| "envelope-parse" \| "wire-parse"` for malformed CLI output, `details.code = "FOLDER_NOT_FOUND"` for unknown-folder (reused from `paths` handler, BI-019), `details.code = "VAULT_NOT_FOUND"` for unknown-vault (reused from cli-adapter's success-path stdout classifier and BI-019's closed-but-registered eval detection). Invalid-pattern routes through `VALIDATION_ERROR` at zod-time, not a new `details.code` — preserves the streak per Principle IV's "no new top-level codes" intent and ADR-015's "no new sub-state unless multi-state". |
| Principle V (Attribution & Layered Composition) | Y | All five new source files (`schema.ts`, `handler.ts`, `index.ts`, `_template.ts`, and tests) carry an `// Original — no upstream. <one-line intent>.` header. Tests in this project conventionally inherit the header style of the source they exercise (see `src/tools/context_search/handler.test.ts` for the precedent). No upstream code is lifted. |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | N/A | The Obsidian CLI exposes no native `pattern` / `search:regex` / `regex-search` subcommand to mirror. The tool is implemented via the `eval` subcommand (sibling pattern with `paths`, `find_by_property`, `smart_connections_similar`) and synthesises a concept name. Concept names follow snake_case convention; sibling concept-named tools include `context_search` (synthesised from `search:context`), `find_by_property` (concept), `smart_connections_similar` (plugin-namespaced). T0 live-CLI probe verifies the absence of a regex subcommand; if one exists, ADR-010 governance reactivates and the name must be revisited. |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | Not plugin-backed. The tool reads vault content directly via `app.vault.getMarkdownFiles()` and `app.vault.cachedRead()` — core Obsidian APIs, not plugin-exposed APIs. ADR-013's prefixed-naming convention applies only to plugin-API wrappers (e.g., `smart_connections_similar`). |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | Not plugin-backed (per ADR-013 N/A). No plugin-lifecycle states (`<PLUGIN>_NOT_INSTALLED` / `<PLUGIN>_NOT_READY` / `SOURCE_NOT_INDEXED`) apply. |
| ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes) | N/A | No new `(top-level-code, details.code)` pair with multiple sub-states is introduced. `FOLDER_NOT_FOUND` and `VAULT_NOT_FOUND` are single-state pairs reused from existing tools without adding any new sub-state under either pair. `details.stage` on `CLI_REPORTED_ERROR` is a parse-progress diagnostic, not a sub-state under a `details.code` — sibling parity with `context_search` and `search`. |

**Gate result**: PASS pre-Phase-0. No N entries; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/037-pattern-search/
├── plan.md              # This file
├── research.md          # Phase 0 output — execution-path decision, defaults, sort order, T0 probe plan
├── data-model.md        # Phase 1 output — input/output entity shapes
├── quickstart.md        # Phase 1 output — manual quickstart scenarios against the test vault
├── contracts/           # Phase 1 output — input/output/errors contract docs
│   ├── input.md
│   ├── output.md
│   └── errors.md
├── checklists/
│   └── requirements.md  # /speckit-specify quality gate (already complete, 16/16)
└── tasks.md             # /speckit-tasks output — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── tools/
│   └── pattern_search/                # NEW — sixteenth typed-tool wrap
│       ├── index.ts                   # createPatternSearchTool factory + descriptor + description
│       ├── index.test.ts              # descriptor shape, registration, name
│       ├── schema.ts                  # zod input/output/wire schemas (single source of truth)
│       ├── schema.test.ts             # validation cohort + invalid-regex refinement
│       ├── handler.ts                 # executePatternSearch — assemble eval template, single invokeCli, parse envelope, sort, cap, validate output
│       ├── handler.test.ts            # mocked-invokeCli unit cohort
│       └── _template.ts               # frozen JS eval template + base64 payload (anti-injection)
├── tools/_register.ts                 # UNCHANGED — registration factory (kernel)
├── cli-adapter/cli-adapter.ts         # UNCHANGED — invokeCli facade (kernel)
├── errors.ts                          # UNCHANGED — UpstreamError class (kernel)
├── server.ts                          # MODIFIED — wires createPatternSearchTool into the boot spine
└── tools/_register-baseline.json      # MODIFIED — registry-stability baseline gains pattern_search entry

docs/
└── tools/
    └── pattern_search.md              # NEW — progressive-disclosure docs surfaced by help() per ADR-005

tests/                                 # NOT USED — tests are co-located per Principle II
```

**Structure Decision**: Single-project layout per the existing repo convention (constitution §Modular Code Organization). The feature ships as a new per-surface module at `src/tools/pattern_search/` matching the `{schema, tool, handler}.ts` layout Principle I prescribes. The only kernel touch is the one-line registration in `src/server.ts` (boot spine) and the one-entry append to `src/tools/_register-baseline.json` (registry-stability fixture).

## Phase 0: Outline & Research

Phase 0 output: [research.md](research.md). Resolves the technical-context items the spec deferred (execution path, default ordering, defaults), defines the T0 live-CLI probe plan, and locks the design choices that shape the contracts in Phase 1.

Topics researched:

- **R1 — Execution path**: native CLI regex subcommand probe (does `obsidian search` accept `--regex` / `-r`?) vs `eval`-driven sibling pattern. Decision: `eval`-driven. Reason: matches sibling `paths` / `find_by_property` / `smart_connections_similar` precedent, gives ECMAScript regex semantics by construction (the eval body runs in the Obsidian-side Node runtime where `new RegExp(pattern)` is locked to the Q1 dialect), single `invokeCli` round-trip, no N+1 read fan-out.
- **R2 — Default match ordering**: path asc UTF-16 code-unit (string compare with `<` / `>`), then line asc (numeric), then per-line match start-offset asc (numeric). Sibling parity with BI-033 FR-018 / BI-035 (which order `[path, line]`); the third tie-break `(start)` is new and necessary because the spec FR-003 emits one entry per occurrence on a line.
- **R3 — Result cap defaults**: implicit 1000, max 10000 (sibling parity with BI-033 / BI-035). `limit` parameter exposed at zod schema; explicit caller value takes precedence over the implicit cap.
- **R4 — Case-sensitivity default**: case-sensitive (spec FR-007 LOCKS this). Diverges from sibling `context_search` (case-insensitive default — there because the upstream CLI's `obsidian search` default is case-insensitive). Pattern-search default flips because the user spec explicitly chose case-sensitive.
- **R5 — Folder normalisation**: reuse `stripBoundarySlashes` from `../search/handler.ts` (BI-035 already does this — pattern-search imports the same helper, no duplication).
- **R6 — File-set scoping**: `.md` only (case-insensitive on extension — `.MD` / `.Md` accepted). Enforced inside the eval template via `app.vault.getMarkdownFiles()` (which is `.md` by definition); defensive wire-side filter at `path.toLowerCase().endsWith(".md")` per sibling parity.
- **R7 — Invalid pattern surface**: detected at the zod `superRefine` layer via `new RegExp(pattern, flags)` in try/catch. Surfaces as `VALIDATION_ERROR` with `details.issues = [{ path: ["pattern"], message: <SyntaxError.message>, code: "custom" }]`. No new top-level code, no new `details.code` under `CLI_REPORTED_ERROR`.
- **R8 — Zero-length match skip**: enforced inside the eval template by tracking each match's `start` / `end` indices and skipping rows where `end === start` (idiom matches the well-known JS regex zero-width handling). Also defends against the infinite loop a global regex with zero-width hits causes — the template advances `lastIndex` by 1 when a zero-width match fires to prevent the engine from getting stuck.
- **R9 — Truncation detection**: in-template cap check — the template stops collecting once `out.length >= cap`. The envelope flags `truncated: true` when the template hit the cap (i.e., when the underlying match-set could have produced more rows). Simpler than BI-035's "cli-file-cap-fired OR flat-exceeds-cap" because the eval template owns the count.
- **R10 — `text` field cap**: 500 UTF-16 code units + `…` (U+2026) marker per the Q2 clarification and BI-033 FR-024 sibling parity. Implemented inside the eval template so the wire payload is already capped before it leaves the CLI process. Match substring is never capped — the eval template emits `match` verbatim.
- **R11 — T0 live-CLI probe plan**: documented in research.md. Three probes: (a) confirm `eval` round-trips a payload-driven regex correctly against the authorised test vault, (b) confirm `app.vault.getMarkdownFiles()` matches the wrapper-side `.md`-only intent, (c) confirm folder-not-found surfaces in the envelope (`{ ok: false, code: "FOLDER_NOT_FOUND", folder: ... }`) consistent with `paths`. T0 happens at `/speckit-implement` time per CLAUDE.md `## Test Execution`.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete (Phase 0).

Phase 1 outputs:

1. **[data-model.md](data-model.md)** — entity shapes derived from FR-001..FR-016. Four entities — `PatternSearchInput`, `PatternSearchMatch`, `PatternSearchOutput`, and the in-process `WireEnvelope` (template-emitted JSON before wrapper-side post-processing). Each carries field names, types, validation rules, and the FR it traces to.

2. **[contracts/input.md](contracts/input.md)** — input schema documented as an MCP-tool-input contract: field-by-field shape, validation rules, defaults, examples. Mirrors the zod definition in `schema.ts` (which is the source of truth per Principle III).

3. **[contracts/output.md](contracts/output.md)** — output schema documented as the wire-shape contract callers receive. Includes the response invariant `count === matches.length`, the `truncated` discriminant, the sort order, and the `text` / `match` field semantics.

4. **[contracts/errors.md](contracts/errors.md)** — error envelope cohort. Reused codes only: `VALIDATION_ERROR` (zod) for invalid pattern, missing/extra fields, out-of-range limit; `CLI_REPORTED_ERROR.details.code = "FOLDER_NOT_FOUND"` for unknown folder; `CLI_REPORTED_ERROR.details.code = "VAULT_NOT_FOUND"` for unknown vault; `CLI_REPORTED_ERROR.details.stage` for malformed CLI output. Lists every failure path the handler can produce and which gate (zod, eval-envelope, cli-adapter classifier) detects it.

5. **[quickstart.md](quickstart.md)** — manual quickstart scenarios against the authorised test vault per CLAUDE.md `## Test Execution`. Covers the four canonical journeys: (1) `BI-\d{4}` against the test vault, (2) `^#` (zero-length skip), (3) folder-scoped `TODO\b` with case-insensitive flag, (4) invalid pattern triggers `VALIDATION_ERROR`.

6. **Agent context update** — rotate the active-plan reference between the `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` markers in [CLAUDE.md](../../CLAUDE.md) from `specs/036-get-backlinks/plan.md` to `specs/037-pattern-search/plan.md`. Single-line edit; committed separately per the project convention for narrative rotations (see commit 32666a3 precedent).

After Phase 1, re-evaluate Constitution Check.

### Re-evaluation post-Phase-1

The Phase-1 artifacts surface the same gate alignments documented above. No principle escalates from Y to N during Phase 1; ADR-010 / ADR-013 / ADR-014 / ADR-015 remain N/A under the eval-driven design. The single design choice that could have escalated a gate — invalid-pattern surfacing — was deliberately routed through `VALIDATION_ERROR` (Principle IV preserved, ADR-015 stays N/A).

**Post-Phase-1 gate result**: PASS. Ready for `/speckit-tasks`.

## Complexity Tracking

No constitution-violation entries. The plan passes every gate with Y or N/A.
