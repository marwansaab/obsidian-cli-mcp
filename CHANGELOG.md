# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
