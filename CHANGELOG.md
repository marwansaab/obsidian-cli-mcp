# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-05-07

Patch release — fixes a release-blocking bug in `read_note`'s published `inputSchema` that made the tool uncallable from spec-conformant MCP clients (e.g. Cowork) whose hand-rolled `Tool` schema validator strips unknown top-level keys (`oneOf`, `additionalProperties`). MCP wire surface unchanged for SDK-shape consumers (Claude Desktop, Claude Code via SDK) — they already worked under `0.2.0`'s pure-`oneOf` envelope and continue to work under the widened envelope.

### Fixed

- `read_note` is now callable from strict-naive MCP clients (Cowork) whose `Tool` validator strips unknown top-level keys. The published `inputSchema` envelope now exposes the four target-mode property names (`target_mode`, `vault`, `file`, `path`) at top level via a widened `properties` map (union of branch property names with leaf-`{}` widening, except cross-branch string discriminators which surface as `{ type: "string" }`) and a top-level `required` array (intersection across branches). The proximate cause traces back to feature 007's deferred `targetModeJsonSchema` companion (T004) and the missing wire-level assertion in feature 008's drift-detector contract — see `specs/009-fix-inputschema-publication/research.md` R1 for the empirical correction to the original working hypothesis (the bug was a coverage gap in the strict-naive client validator, not a predicate gap in `_shared.ts`). Strict-rich clients see the same `oneOf` envelope they had under `0.2.0`; only new top-level keys (`properties`, `required`) are added.

### Changed

- `toMcpInputSchema` (`src/tools/_shared.ts`) wrap branch widened — emits top-level `properties` and `required` alongside `oneOf`. Pattern (a) inputs (`targetModeSchema.and(z.object({...}))`) walk both `allOf` arms: the inner-anyOf arm folds into `oneOf`, the extras arm contributes its `properties` (leaf widening) and `required` keys (UNION) to the top-level aggregates AND survives verbatim under top-level `allOf` so strict-rich clients still apply per-tool extension constraints. Future `write_note` / `append_note` (and any other Pattern (a) / Pattern (b) consumer of the target-mode primitive) inherit the protection by the same mechanism — no per-tool plumbing, no companion JSON Schema export, no opt-in flag.
- `obsidian_exec`'s flat `z.object` schema continues to hit the no-op branch and is byte-stable from `0.2.0` (six properties, `required: ["command"]`, `additionalProperties: false`). Strictly pinned by the new drift detector at `src/tools/_register.test.ts`.

### Added

- Parameterised drift detector at `src/tools/_register.test.ts` with three test groups: Group 1 walks the live registry from `createServer({ registerSignalHandlers: false })` and asserts per-tool invariants for every registered tool (a tool with no invariant entry fails the test, forcing every future typed-tool author to declare its published-shape contract); Group 2 runs the same assertions through a full `InMemoryTransport` SDK round-trip via `client.listTools()` (catches future MCP SDK transformations of the published shape on the wire); Group 3 covers synthetic Pattern (a) and Pattern (b) fixtures via `registerTool` direct invocation (verifies the roadmap unblock for `write_note` / `append_note`).

## [0.2.0] - 2026-05-07

Two architectural deepenings shipped together (feature 008-refactor, ADR-006 + ADR-007). Touches the register / publish / dispatch chain that every typed tool flows through.

### Added

- `registerTool(spec)` factory at `src/tools/_register.ts` — the only path from a zod schema to a published MCP tool descriptor. Owns the full publication pipeline (`toMcpInputSchema` envelope → `stripSchemaDescriptions` → `ZodError` → `VALIDATION_ERROR` marshalling → `UpstreamError` → structured-error envelope → `responseFormat: "json" | "raw"` dispatch).
- `assertToolDocsExist(tools, docsDir)` aggregator at `src/tools/_register.ts` — boot-time check that aggregates ALL missing `docs/tools/{name}.md` files into one error (fail-fast on the first miss is forbidden per FR-005).
- `dispatchCli(input, deps)` private primitive at `src/cli-adapter/_dispatch.ts` — single spawn-and-collect path with always-on bounds, four-priority error classification, and atomic in-flight registry insertion (FR-015a — synchronous with `spawn()`, before any `await` or microtask boundary).
- `invokeBoundedCli(input, overrides, deps)` escape-hatch facade at `src/cli-adapter/invoke-bounded-cli.ts` — default 30 s / 10 MiB; `overrides.timeoutMs` overridable up to a 120 s ceiling, **silently clamped** above (no `VALIDATION_ERROR`, no warning, no log line on the clamp itself).
- `ERR_NO_ACTIVE_FILE` is now reachable through `obsidian_exec` (FR-021) — previously this case surfaced as `CLI_REPORTED_ERROR`. The error roster in `docs/tools/obsidian_exec.md` is updated.
- Failure-only stderr logging discipline: dispatch primitive emits exactly ONE stderr JSON line per occurrence for `dispatch.timeout`, `dispatch.cap`, and `dispatch.kill`. ZERO emissions on the success path or on the four non-bounds verdicts (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`).

### Changed

- Typed tools (`read_note` and any future typed tool) now route through `invokeCli` and are bounded at **10 s / 10 MiB** (previously unbounded). Operator-observable behavior change.
- Typed tools now serialize through the FIFO single-flight queue alongside `obsidian_exec` (research R6 — necessary for the single-cell registry's at-most-one invariant).
- argv assembly is unified to the documented order `[binary, vault=..., command, kvs..., flags..., --copy]` (FR-012). Today's `cli-adapter.ts` previously produced `[command, vault=..., kvs..., flags...]`; the deepening adopts the documented contract.
- Each tool collapses to `schema.ts` (zod only — no `*InputJsonSchema` companion) + `handler.ts` + `index.ts` (a thin `registerTool({...})` call replacing today's `tool.ts`).
- The exported function `killActiveChild` is renamed to `killInFlightChildren` and lives in `src/cli-adapter/cli-adapter.ts` (FR-016 / FR-017). `src/server.ts:9` re-points its import accordingly, fixing the Principle-I downward-flow violation as a side effect.

### Removed

- Per-call `call.start` / `call.end*` stderr lifecycle events (formerly emitted from `obsidian_exec/handler.ts`). Operator-observable signal change — replaced by failure-only `dispatch.*` events from the dispatch primitive.
- Per-tool `*InputJsonSchema` exports (`helpInputJsonSchema`, `obsidianExecInputJsonSchema`, `readNoteInputJsonSchema`) and the `targetModeJsonSchema` companion. The publication path is owned solely by `registerTool` (SC-002).
- Per-tool `tool.ts` boilerplate (`registerHelpTool`, `registerObsidianExecTool`, `registerReadNoteTool`) and their co-located test files. Replaced by ~10-line `index.ts` files calling `registerTool`.
- `Logger.callStart`, `Logger.callEndSuccess`, `Logger.callEndFailure` methods.
