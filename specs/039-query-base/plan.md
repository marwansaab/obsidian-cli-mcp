# Implementation Plan: Query Base

**Branch**: `039-query-base` | **Date**: 2026-05-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/039-query-base/spec.md`

## Summary

Add a typed MCP tool `query_base` that wraps the upstream `obsidian base:query` subcommand and surfaces matched rows from a named view inside an Obsidian Bases (`.base`) file as a structured JSON envelope. The envelope shape is `{ columns: string[], rows: RowObject[], truncated: boolean, total_rows?: number }`. The wrapper reserves one row field — `path` (vault-relative source-note path) — and passes through every other view-emitted key verbatim. Errors surface through `UpstreamError` with the existing `CLI_REPORTED_ERROR` and `VALIDATION_ERROR` top-level codes; the new states (`BASE_NOT_FOUND`, `BASE_MALFORMED`, `VIEW_NOT_FOUND`, `INVALID_BASE_PATH`, `INVALID_VIEW_NAME`) are surfaced via `details.code` sub-discrimination per ADR-015. Constitution Principle IV streak preserved — count becomes sixteen tools after BI-039 ships. Tool name derives mechanically from `base:query` via ADR-010's composite-namespace-reversal rule, slotting alongside `bases` / `views_base` / `create_base` in the Bases-family cohort.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, `tsc --noEmit` clean)
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation), `zod-to-json-schema` (MCP `inputSchema` publication via the centralised `registerTool` factory)
**Storage**: N/A — read-only; reads the upstream `obsidian` CLI's stdout for the `base:query` subcommand
**Testing**: `vitest` with `@vitest/coverage-v8`; tests co-located as `*.test.ts` alongside source modules per Principle II
**Target Platform**: Node.js >= 22.11 LTS; MCP server transport over stdio; cross-platform (Linux / macOS / Windows)
**Project Type**: MCP server typed-tool wrapper around the upstream `obsidian` CLI (native-CLI cohort per ADR-010)
**Performance Goals**: Subprocess execution within the centralised `TYPED_TOOL_TIMEOUT_MS` (10 s) and `TYPED_TOOL_OUTPUT_CAP_BYTES` (10 MiB) bounds (ADR-007); response cap at 1000 rows per FR-013
**Constraints**: 1000-character input cap on `base_path` and `view_name` (FR-011a); 1000-row response cap with `truncated` signal (FR-013); no new top-level error codes (Constitution Principle IV); deterministic row ordering independent of upstream emission stability (FR-003)
**Scale/Scope**: One new typed tool (`query_base`), one new source-tree module (`src/tools/query_base/`) with three production files (`index.ts` / `schema.ts` / `handler.ts`) and three co-located test files; one new sub-discriminator namespace (`BASE_MALFORMED` with five `details.reason` sub-states) plus new `details.code` values (`BASE_NOT_FOUND`, `VIEW_NOT_FOUND`, `INVALID_BASE_PATH`, `INVALID_VIEW_NAME`) all under existing top-level codes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| Principle I (Modular Code Organization) | Y | New surface lives in its own `src/tools/query_base/` module with `{schema, tool, handler}.ts` layout (Principle I per-surface convention); imports flow tool → handler → cli-adapter → spawn; no upward or cyclic dependencies introduced |
| Principle II (Public Surface Test Coverage) | Y | `query_base` is a publicly-registered MCP tool; ships with happy-path `handler.test.ts` (1+ row, multi-row sorted, empty-view) AND failure-or-boundary tests (BASE_NOT_FOUND, BASE_MALFORMED for each sub-state, VIEW_NOT_FOUND, INVALID_BASE_PATH variants, INVALID_VIEW_NAME variants, VAULT_NOT_FOUND unknown / not-open, PATH_ESCAPES_VAULT, truncation cap, collision rule for `path_view`); plus schema-shape tests in `schema.test.ts` and registration smoke test in `index.test.ts` |
| Principle III (Boundary Input Validation with Zod) | Y | Single zod input schema is the source of truth for both the published MCP `inputSchema` (via `registerTool`'s `zodToJsonSchema` step) and the runtime parse; downstream `executeQueryBase` consumes `z.infer<typeof queryBaseInputSchema>` directly; no hand-rolled `typeof` chains at the boundary |
| Principle IV (Explicit Upstream Error Propagation) | Y | All failure paths route through `UpstreamError`; new states surface via `details.code` sub-discrimination per ADR-015 (no new top-level error codes — sixteen-tool zero-new-codes streak preserved after this BI); no silent catches, no empty-result-on-error fallbacks |
| Principle V (Attribution & Layered Composition) | Y | All three source files (`index.ts`, `schema.ts`, `handler.ts`) carry the `// Original — no upstream.` header with one-line intent descriptions; README's Attributions section unchanged (no new upstream code lifted) |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | Y | Tool name `query_base` derives mechanically from upstream `base:query` via ADR-010's composite-namespace-reversal rule (action_namespace, lowercase, underscore-joined). Same rule that produced `set_property` (from `property:set`) and `context_search` (from `search:context`) |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | This BI wraps a native CLI subcommand (`base:query` ships in the core Obsidian CLI binary), not a plugin-exposed API; ADR-013 governs plugin-API wrappers only |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | Same as ADR-013 — native CLI wrap, no plugin dependency, no `<PLUGIN>_NOT_INSTALLED` / `_NOT_READY` / `SOURCE_NOT_INDEXED` lifecycle states needed |
| ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes) | Y | `BASE_MALFORMED` (FR-005b) introduces a new multi-state `details.code` with five `details.reason` sub-states (`empty`, `invalid-yaml`, `missing-required-key`, `unsupported-schema-version`, `unknown`) per ADR-015; `INVALID_BASE_PATH` extends an existing multi-state `details.code` with `too-long` (FR-011a) alongside `path-traversal` / `wrong-extension` / `empty`; `INVALID_VIEW_NAME` is new but with two sub-states (`empty`, `too-long`) per the same pattern |
| ADR-003 (Enforce Target Mode in Typed Tools) | N (justified — see Complexity Tracking) | `query_base` is file-targeted (names a `.base` file) but v1 explicitly excludes active-file targeting per the spec's out-of-scope clause; flat schema with required `path` field is simpler than wrapping in `target_mode` and rejecting `"active"` |

All Y / N/A. One justified N for ADR-003 → see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/039-query-base/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — resolved unknowns, upstream-probe results
├── data-model.md        # Phase 1 — entities, envelope shape, error states
├── quickstart.md        # Phase 1 — usage examples (happy path, errors, truncation)
├── contracts/
│   ├── input.schema.json    # Phase 1 — published MCP inputSchema (JSON Schema form)
│   ├── output.schema.json   # Phase 1 — success-envelope JSON Schema
│   └── errors.md            # Phase 1 — error code + sub-discriminator map
└── checklists/
    └── requirements.md  # /speckit-specify quality checklist (Session 2026-05-20)
```

### Source Code (repository root)

```text
src/
├── tools/
│   └── query_base/
│       ├── index.ts            # Tool registration + description string + createQueryBaseTool factory
│       ├── schema.ts           # zod input + output + wire envelope schemas
│       ├── handler.ts          # executeQueryBase: validate → invoke CLI → parse → sort → return envelope
│       ├── index.test.ts       # Registration smoke test (name, schema published, deps wiring)
│       ├── schema.test.ts      # Input-validation tests (length caps, empty, path-traversal, wrong-extension, view-name validation)
│       └── handler.test.ts     # Behaviour tests against mocked spawn (happy path, all error sub-states, truncation, ordering, collision rule)
│
├── tools/_register.ts           # No edits — query_base registers through the existing centralised factory
├── tools/_registration-stub.ts  # 1-line addition: import + factory call to wire query_base into the server boot path
├── cli-adapter/cli-adapter.ts   # No edits — invokeCli is the existing interface, `base:query` is just another `command` string
├── errors.ts                    # No edits — UpstreamError already supports the existing top-level codes
└── server.ts                    # No edits — boot path consumes the registration stub
```

**Structure Decision**: Single project, per-surface module triplet at `src/tools/query_base/` per Principle I. The new tool registers through the existing centralised `_registration-stub.ts` factory wiring; no changes to the server boot path beyond a one-line addition for `createQueryBaseTool({ logger, queue })`. All existing infrastructure (`invokeCli`, `UpstreamError`, the vault-closed-detection helper, the centralised cli-adapter bounds) is consumed unchanged.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| ADR-003 `target_mode` not applied (flat `path`-required schema instead) | v1 explicitly excludes active-file targeting per the spec's out-of-scope clause ("Querying a base file that is currently the agent's active / focused file without naming its path — behaviour unconfirmed against the live surface; not included in v1"). A flat schema requiring `base_path` is the minimum-viable surface for v1's contract. | Wrapping in `target_mode` with only `"specific"` permitted (and `"active"` rejected via VALIDATION_ERROR) adds schema surface that v1 callers cannot legitimately exercise, complicates the input-schema's published JSON Schema for no v1 benefit, and forces test cases for an unsupported mode. A future BI (v2) that turns on active-file targeting can introduce target_mode at that point; the spec's out-of-scope clause documents the deliberate deferral so the v2 transition has a clear authorising decision. Documented in the spec's Assumptions block. |
