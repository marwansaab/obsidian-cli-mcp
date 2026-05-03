# Implementation Plan: Add CLI Bridge

**Branch**: `001-add-cli-bridge` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [specs/001-add-cli-bridge/spec.md](./spec.md)

## Summary

Build a Windows-host Node.js MCP server that exposes a single tool, `obsidian_exec`, bridging any MCP client (including sandboxed Linux containers like Claude Cowork) to the Obsidian Integrated CLI binary. The server speaks MCP over stdio; per-call invocations are validated by a zod schema (the single source of truth for the published `inputSchema`), serialized through a process-wide FIFO queue, and executed via `child_process.spawn` with array argv (no shell). The server collects up to 10 MiB per stream, returns `{stdout, stderr, exitCode: 0, argv}` on success, and surfaces every failure path as a structured `UpstreamError` (`CLI_NON_ZERO_EXIT` / `CLI_BINARY_NOT_FOUND` / `CLI_TIMEOUT` / `CLI_OUTPUT_TOO_LARGE`). It logs JSON-lines call lifecycle events to stderr (stdout is reserved for MCP wire traffic) and runs identical kill-in-flight + drop-queue cleanup on either MCP-transport close or SIGINT/SIGTERM. Constitution principles I–V (modular `{schema,tool,handler}.ts` layout, co-located `node:test` tests, zod boundary validation, structured upstream errors, attribution headers) bind every implementation decision.

## Technical Context

**Language/Version**: TypeScript 5.6+ in strict mode; runtime Node.js >= 22.11 (LTS floor per constitution).
**Primary Dependencies**:
- `@modelcontextprotocol/sdk` — MCP server transport (stdio) and tool registration (constitution: sole MCP transport).
- `zod` — boundary input validation (constitution: sole permitted runtime validator).
- `zod-to-json-schema` — converts the canonical zod schema to a JSON Schema for the MCP tool's published `inputSchema` (single source of truth, Principle III).
- Dev: `typescript`, `@types/node`, `eslint` (flat config), `prettier`. No `citty` (out of scope; CLI surface deferred to a follow-up spec).

**Storage**: N/A. The bridge holds no persistent state. The FIFO queue, in-flight child reference, and shutdown flags are in-memory only and live for the bridge process's lifetime.
**Testing**: `node:test` (built-in), `*.test.ts` co-located with source per Principle II. Three required tests (FR-020) plus tests for: schema validation rejection, output cap overflow, timeout path, transport-close cleanup, SIGINT/SIGTERM cleanup, and the queue's serialization invariant.
**Target Platform**: Windows host running Node.js >= 22.11 with the `obsidian` binary discoverable on PATH (or an explicit `OBSIDIAN_BIN` override). Obsidian 1.12+ desktop instance running. macOS/Linux paths are out of scope.
**Project Type**: Single library (a Node.js package that exports an MCP server entry point). No frontend, no separate API tier.
**Performance Goals**: Default 30 s per-call timeout, hard cap 120 s. Queue serializes calls, so total latency under load is `sum(per-call latencies)` — predictable rather than fast. No throughput target beyond "MCP client doesn't perceive added overhead vs. invoking the CLI directly" (~tens of ms spawn overhead per call).
**Constraints**:
- **Stdout is sacred**: the MCP SDK owns it; no `console.log`, no diagnostics. Logger writes to stderr only.
- **10 MiB hard cap per captured stream** (stdout/stderr counted independently).
- **2-second SIGTERM → SIGKILL grace window** on every kill path (timeout, output cap, shutdown).
- **No orphan children** on cleanly-signaled shutdown (transport close, SIGINT, SIGTERM).
- **Zero `throw new Error` at boundary surfaces** — every failure path uses `UpstreamError`.
**Scale/Scope**: One MCP client per bridge process (stdio convention). One CLI invocation per tool call. Queue depth unbounded in v0.1. v0.1 adds zero typed wrappers — all subcommand richness is exposed through the single generic `obsidian_exec` primitive.

No `NEEDS CLARIFICATION` items remain — the spec was fully clarified across two `/speckit-clarify` sessions (5 of 5 question slots used).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | How this plan satisfies it |
|-----------|-------|----------------------------|
| **I. Modular Code Organization** | Y | `{schema, tool, handler}.ts` triplet under [src/tools/obsidian_exec/](../../src/tools/obsidian_exec/). Shared `UpstreamError` in [src/errors.ts](../../src/errors.ts). Logger and FIFO queue extracted to single-purpose modules ([src/logger.ts](../../src/logger.ts), [src/queue.ts](../../src/queue.ts)) so they can be reused by future tools (typed Track-A wrappers) without rewriting. Server bootstrap and lifecycle wiring isolated in [src/server.ts](../../src/server.ts); the entrypoint [src/index.ts](../../src/index.ts) just constructs and starts. Imports flow strictly downward (index → server → {tools, logger, queue, errors}); no cycles. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | Y | The only public surface in v0.1 is the `obsidian_exec` MCP tool. Tests co-locate as `*.test.ts` next to source: `schema.test.ts` covers the boundary validator (happy + reject), `handler.test.ts` covers spawn paths (happy `version`, failure `nonexistent_command_xyz`, vault-omitted boundary, all four error codes, output cap, timeout). `tool.test.ts` covers MCP-tool wiring. `queue.test.ts`, `logger.test.ts`, `errors.test.ts`, `server.test.ts` cover their respective modules. All using `node:test`. |
| **III. Boundary Input Validation with Zod** | Y | [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) defines the canonical zod schema. [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts) publishes the MCP `inputSchema` via `zodToJsonSchema(schema)` (no hand-written JSON Schema). The handler receives an already-typed `z.infer<typeof schema>` value; no re-validation downstream. The same `z.infer` type is the canonical TS type for the input — no parallel interface or type alias. |
| **IV. Explicit Upstream Error Propagation** | Y | [src/errors.ts](../../src/errors.ts) defines `class UpstreamError extends Error` with `code`, `cause`, `details` per FR-018. Each of the four error codes (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`) is thrown as an `UpstreamError`. Plain `throw new Error(...)` is forbidden anywhere in `src/tools/obsidian_exec/handler.ts` and `src/server.ts`. The MCP SDK serializes thrown errors via its `CallToolResult` `isError: true` shape. No `catch` block returns a default value or empty result. |
| **V. Attribution & Layered Composition Transparency** | Y | Every new module under `src/` carries the `// Original — no upstream. <one-line description>.` header per FR-021. README will gain (or already has, post-implementation) an "Attributions" section with a "v0.1: no upstream lifts" note so future composed code has a place to land. No code is borrowed in this feature. |

**Technical Standards check** (from constitution's "Technical Standards & Stack Constraints" section):

| Standard | Compliance |
|----------|-----------|
| TypeScript strict, NodeNext, ES2024+, `tsc --noEmit` clean | `tsconfig.json` will set `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2024`, `strict: true`. `npm run typecheck` runs `tsc --noEmit`. |
| Node.js >= 22.11 in `engines.node` | `package.json` will set `"engines": { "node": ">=22.11" }`. Built-in test runner, `fetch`, `AbortController` available; no polyfills introduced. |
| `zod` is the only runtime input validator | Confirmed. No `typeof` / `instanceof` chains at boundary surfaces. |
| `@modelcontextprotocol/sdk` sole MCP transport via `Server` API | Confirmed. No ad-hoc JSON-RPC. |
| `citty` is the sole CLI parsing library | N/A — this feature ships no CLI surface; deferred per spec. |
| `node:test` for tests, `*.test.ts` co-located | Confirmed. |
| `eslint` flat config, zero warnings; Prettier the formatter | `eslint.config.js` and `.prettierrc.json` ship in this feature. `npm run lint` and `npm run format:check` are merge gates. |
| Dependencies justified | Three runtime deps (`@modelcontextprotocol/sdk`, `zod`, `zod-to-json-schema`) — first two are explicitly mandated by the constitution; the third is the smallest available adapter for "single zod source → MCP JSON Schema" and bias-toward-in-tree would require reimplementing JSON-Schema generation for ~150+ LOC of zod surface. Justified in PR description. |

**Result**: All principles and technical standards satisfied. **No Complexity Tracking entries required.** No `N` markers in the per-PR Constitution Compliance checklist will be needed.

**Post-Phase 1 re-check**: Phase 1 added the `data-model.md`, four contract files under `contracts/`, and `quickstart.md`. None of those introduce new modules, dependencies, or surfaces beyond what this Constitution Check already covers — they document the same shapes from different angles. Re-check result: **all five principles still Y; no Complexity Tracking entries needed.**

## Project Structure

### Documentation (this feature)

```text
specs/001-add-cli-bridge/
├── plan.md                                  # This file (/speckit-plan command output)
├── spec.md                                  # /speckit-specify + /speckit-clarify output (already written)
├── research.md                              # Phase 0 output (this command)
├── data-model.md                            # Phase 1 output (this command)
├── quickstart.md                            # Phase 1 output (this command)
├── contracts/                               # Phase 1 output (this command)
│   ├── obsidian_exec.tool.json              # Published MCP tool contract (name, description, inputSchema)
│   ├── errors.contract.md                   # UpstreamError code/cause/details shapes (4 codes)
│   ├── logging.contract.md                  # JSON-lines log event shapes (call.start, call.end, bridge.shutdown)
│   └── mcp-server.contract.md               # Server identity, capabilities, transport requirements
├── checklists/
│   └── requirements.md                      # /speckit-specify quality checklist (already written)
└── tasks.md                                 # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root)

```text
obsidian-cli-mcp/
├── package.json                             # name, version, engines.node>=22.11, scripts (build/test/lint/typecheck), deps
├── tsconfig.json                            # NodeNext, ES2024, strict, outDir=dist, rootDir=src
├── eslint.config.js                         # flat config, zero warnings on merge
├── .prettierrc.json
├── .gitignore                               # node_modules, dist, *.log
├── README.md                                # installation, MCP-client config examples, attributions (FR-022)
├── src/
│   ├── index.ts                             # Entrypoint: build server, connect StdioServerTransport, register lifecycle handlers
│   ├── server.ts                            # MCP Server construction, tool registration, transport-close + signal cleanup
│   ├── server.test.ts                       # lifecycle: transport close, SIGINT/SIGTERM, queue draining
│   ├── errors.ts                            # UpstreamError class (Principle IV foundation, FR-018)
│   ├── errors.test.ts                       # construction, code/cause/details preservation, instanceof checks
│   ├── logger.ts                            # JSON-lines stderr logger (call.start, call.end, bridge.shutdown)
│   ├── logger.test.ts                       # event shape, stderr-only invariant, callId correlation
│   ├── queue.ts                             # FIFO single-flight queue + shutdown hook (FR-023)
│   ├── queue.test.ts                        # serialization invariant, queue depth reporting, shutdown drains queue
│   └── tools/
│       └── obsidian_exec/
│           ├── schema.ts                    # canonical zod schema (Principle III source of truth)
│           ├── schema.test.ts               # validation: required/optional fields, timeoutMs cap, flag bare-word rule
│           ├── tool.ts                      # MCP tool registration (name, description, inputSchema via zod-to-json-schema)
│           ├── tool.test.ts                 # tool metadata, inputSchema shape, handler dispatch
│           ├── handler.ts                   # argv assembly + spawn + collect + cap + timeout + error mapping
│           └── handler.test.ts              # happy path (version), failure path (nonexistent_command_xyz), vault-omitted, all 4 error codes
└── dist/                                    # tsc output (gitignored)
```

**Structure Decision**: Single library (Option 1 from the template), customized for an MCP server. The `{schema, tool, handler}.ts` triplet under [src/tools/obsidian_exec/](../../src/tools/obsidian_exec/) is the per-surface module layout mandated by Principle I; tests co-located per Principle II. Shared concerns ([src/errors.ts](../../src/errors.ts), [src/logger.ts](../../src/logger.ts), [src/queue.ts](../../src/queue.ts)) live at the `src/` root because they will be reused by future Track-A wrapper tools without modification. Server bootstrap and process lifecycle are isolated in [src/server.ts](../../src/server.ts) so [src/index.ts](../../src/index.ts) stays trivially small (a `main()` that constructs the server and connects the transport).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.
