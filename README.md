# obsidian-cli-mcp

A minimal Windows-host MCP server that bridges any MCP client (running locally or in a sandboxed container like Claude Cowork's Linux environment) to the Obsidian Integrated CLI binary on the operator's Windows desktop. Exposes two tools: `obsidian_exec` (a generic CLI bridge that lets the caller invoke any Obsidian CLI subcommand with structured parameters, bare-word flags, optional vault scoping, and a per-call timeout) and `help` (a progressive-disclosure tool that serves full Markdown documentation for any registered tool on demand, per [ADR-005](.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md) — parameter-level descriptions are stripped from the JSON Schema at registration time to save context-window tokens, and recovered via `help({ tool_name: "<name>" })` when the agent needs them). All failure modes (non-zero exit, CLI exits 0 with `Error:` stdout prefix, missing binary, timeout, output too large, missing-doc lookup, missing-docs-directory) surface as structured `UpstreamError` responses with full diagnostic detail.

## Installation

> **Important**: The bridge installs on the **Windows host**, NOT inside a sandboxed Linux container (e.g., Claude Cowork). The bridge needs direct access to the `obsidian` binary, which only exists on the host where the Obsidian desktop app is installed. ADR-002 captures the architectural rationale.

### Prerequisites

- **Windows 10 / 11** host. macOS and Linux are out of scope for the 0.x release line.
- **Node.js >= 22.11** (LTS). Verify: `node --version`.
- **Obsidian 1.12+** desktop app installed and running. The bridge can boot without Obsidian running, but every `obsidian_exec` call will fail with `CLI_NON_ZERO_EXIT` until Obsidian is up.
- **Obsidian Integrated CLI** binary discoverable on `PATH`. Verify from a fresh PowerShell prompt: `obsidian version`. If `obsidian` isn't on `PATH`, set `OBSIDIAN_BIN` in your MCP-client configuration to the absolute path.

### Install

```pwsh
npm install -g @marwansaab/obsidian-cli-mcp
# or, for one-shot use without global install:
npx -y @marwansaab/obsidian-cli-mcp
```

> The package is published under the `@marwansaab` npm scope. The binary it installs is `obsidian-cli-mcp` (unscoped — what you'd type at a shell prompt or what your MCP client invokes after a global install).

Verify the bridge boots:

```pwsh
npx -y @marwansaab/obsidian-cli-mcp
# Expected: no stdout (stdout is reserved for MCP wire traffic).
# Press Ctrl+C — a single bridge.shutdown JSON line appears on stderr,
# then the process exits with code 0.
```

## MCP-client configuration

### Claude Desktop (Windows)

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "npx",
      "args": ["-y", "@marwansaab/obsidian-cli-mcp"],
      "env": {
        // Optional override if 'obsidian' isn't on PATH:
        // "OBSIDIAN_BIN": "C:\\Users\\you\\AppData\\Local\\Obsidian\\obsidian.exe"
      }
    }
  }
}
```

Restart Claude Desktop. The `obsidian_exec` and `help` tools will appear in the tools list.

### Claude Cowork (sandboxed Linux container) → Windows host

Cowork's container can't exec the Windows `obsidian` binary directly — that's exactly the problem this bridge solves. Run the bridge on the **Windows host** and configure Cowork to tunnel its MCP stdio to that host process. The exact `command` depends on your host-to-container tunneling tool; the point is that the configured command's stdio MUST end up wired to a `npx -y @marwansaab/obsidian-cli-mcp` process running on the Windows host.

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "<your host-stdio bridge command>",
      "args": ["<args that exec 'npx -y @marwansaab/obsidian-cli-mcp' on the Windows host>"]
    }
  }
}
```

## Tool reference

The bridge registers two tools: `obsidian_exec` (the generic CLI bridge) and `help` (the progressive-disclosure docs tool). At session start the agent sees both via `tools/list` with parameter-level descriptions stripped from each tool's JSON Schema; full per-parameter documentation is reachable via `help({ tool_name: "<name>" })`.

### `obsidian_exec`

#### Input

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `command` | `string` (non-empty) | yes | The CLI subcommand (e.g., `"version"`, `"search"`, `"eval"`). |
| `parameters` | `Record<string, string \| number \| boolean>` | no | Assembled into argv as `key=value` tokens; numbers and booleans stringified. |
| `flags` | `string[]` | no | Bare-word flags (no `--` prefix). |
| `vault` | `string` (non-empty) | no | When set, prepends `vault=<value>` as the first positional after the binary. |
| `copy` | `boolean` | no | When `true`, appends `--copy` as the final argv token. |
| `timeoutMs` | `integer` (1..120000) | no | Per-call timeout (default `30000`). Counts from spawn, not from enqueue. |

Full JSON Schema: [specs/001-add-cli-bridge/contracts/obsidian_exec.tool.json](specs/001-add-cli-bridge/contracts/obsidian_exec.tool.json). Full Markdown documentation reachable via `help({ tool_name: "obsidian_exec" })`.

#### Output (success)

```jsonc
{
  "stdout": "<captured stdout, UTF-8>",
  "stderr": "<captured stderr, UTF-8>",
  "exitCode": 0,
  "argv": ["obsidian", "<command>", "<...kvParams>", "<...flags>"]
}
```

`argv` is the fully reproducible argv vector as the spawned process sees it, including the binary as `argv[0]`.

### `help`

Progressive-disclosure docs tool. Returns the full Markdown documentation for any registered tool on demand. Implements [ADR-005](.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md).

#### Input

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tool_name` | `string` (non-empty) | no | When omitted, returns the index of all available tool docs. When provided, returns the contents of `docs/tools/<tool_name>.md`. |

#### Output (success)

A single text block whose `text` field is the full UTF-8 contents of the bundled Markdown file. No transformation, no transcoding. An empty doc file returns `text: ""`.

#### Errors

`HELP_TOOL_NOT_FOUND` (named tool's `.md` file missing, OR the path-traversal defense fired, OR the reserved `"index"` name was requested) — `details.availableTools` lists the names the agent can self-correct with. `HELP_DOCS_MISSING` (the bundled `docs/tools/` directory itself is missing — operator-side packaging/install fix, not agent-recoverable). `VALIDATION_ERROR` (empty-string `tool_name`, non-string value, or unknown keys per the input schema's `.strict()` modifier).

Full Markdown documentation reachable via `help({ tool_name: "help" })`.

### Output (failure — `isError: true`)

Errors are returned via the MCP SDK's `isError: true` shape with a JSON-encoded payload of `{ code, message, details }`. Stable error codes:

| `code` | When | Key `details` fields |
|--------|------|----------------------|
| `CLI_NON_ZERO_EXIT` | Spawned `obsidian` exited non-zero | `argv`, `stdout`, `stderr`, `exitCode`, `signal` |
| `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH and `OBSIDIAN_BIN` unset/wrong | `binaryAttempted`, `PATH` |
| `CLI_TIMEOUT` | Call exceeded `timeoutMs` (default 30 s) | `argv`, `timeoutMs`, `partialStdout`, `partialStderr` |
| `CLI_OUTPUT_TOO_LARGE` | Either stream crossed the 10 MiB cap | `argv`, `stream`, `limitBytes`, `capturedBytes`, `partial` |
| `CLI_REPORTED_ERROR` | CLI exits 0 with stdout that, after leading-whitespace trim, starts with `Error:` | `argv`, `stdout`, `stderr`, `exitCode`, `message` |
| `ERR_NO_ACTIVE_FILE` | CLI exits 0 with stdout that, after leading-whitespace trim, starts with `Error: no active file` (focused-note-missing failure mode; raised by the typed-tool adapter, not the legacy `obsidian_exec` handler) | `command`, `stdout`, `stderr`, `exitCode`, `message` |
| `VALIDATION_ERROR` | Input failed zod validation | `issues[]` (path, message, code) |
| `TOOL_NOT_FOUND` | Caller named a tool not in the registered set | `requestedName`, `knownTools` |
| `HELP_TOOL_NOT_FOUND` | `help` was called with a `tool_name` that has no `<name>.md` in `docs/tools/` (or hits the path-traversal defense, or the reserved `"index"` name) | `requestedName`, `availableTools` |
| `HELP_DOCS_MISSING` | The bundled `docs/tools/` directory is missing or unreadable (packaging/install integrity failure — operator-side fix, not agent-recoverable) | `resolvedDocsDir`, `ioCode` |

Full error contract: [specs/001-add-cli-bridge/contracts/errors.contract.md](specs/001-add-cli-bridge/contracts/errors.contract.md).

## Operating notes

- **Calls serialize.** A FIFO queue runs at most one `obsidian` child at a time. If you fire several `obsidian_exec` calls in parallel, they complete in arrival order. The `queueDepth` field in each `call.start` log line tells you how many calls were waiting when each one started.
- **Stdout is sacred.** Logs and diagnostics go to stderr only; stdout is reserved for the MCP wire protocol. Pipe stderr if you want to keep logs: `npx -y @marwansaab/obsidian-cli-mcp 2> bridge.log`.
- **Output cap is 10 MiB per stream** (stdout and stderr counted independently). Calls returning megabytes of payload (e.g., `eval` over a huge vault) get a `CLI_OUTPUT_TOO_LARGE` with the captured 10 MiB prefix in `details.partial`.
- **Clean shutdown.** Ctrl+C, `Stop-Process`, `taskkill` (without `/F`), or MCP-client disconnect all run the same cleanup: kill any in-flight `obsidian` child (SIGTERM, then SIGKILL after a 2-second grace), drop queued calls, emit a final `bridge.shutdown` log line, exit with code 0. **Hard kills (`taskkill /F`) bypass cleanup** — that's a host-OS limitation, not a bridge defect.

## Development

### Prerequisites for hacking on the bridge

- Node.js >= 22.11 (matches `package.json#engines.node` and what CI runs)
- A Bash- or PowerShell-friendly shell. Tests pass on both.
- Cloning + `npm install` is enough — no native bindings, no codegen step.

### Local commands

| Command | What it does |
|---------|--------------|
| `npm test` | Run the full test suite once via Vitest **with V8 coverage and the threshold gate enforced** — the same command CI runs. Writes `coverage/lcov.info`, `coverage/coverage-summary.json`, and the HTML report under `coverage/lcov-report/`. Exits non-zero if aggregate statements fall below the floor. |
| `npm run test:watch` | Vitest in watch mode for TDD. **No coverage / no gate** — use `npm test` to confirm before pushing. |
| `npm run lint` | ESLint flat config; merge requires zero warnings. |
| `npm run typecheck` | `tsc --noEmit` against the full `src/` tree (including tests, so the lint's typed rules see them too). |
| `npm run build` | `tsc -p tsconfig.build.json` — compiles `src/` to `dist/`, excluding `*.test.ts`. |
| `npm run format:check` / `npm run format:write` | Prettier check / fix. |

### Repo layout

```text
src/
├── index.ts                                  # Entrypoint (#!/usr/bin/env node)
├── server.ts + server.test.ts                # MCP Server bootstrap, P8 aggregator dispatch, lifecycle handlers; registry-consistency block
├── errors.ts + errors.test.ts                # UpstreamError class (Principle IV)
├── logger.ts + logger.test.ts                # JSON-lines stderr logger
├── queue.ts + queue.test.ts                  # FIFO single-flight queue
├── target-mode/
│   └── target-mode.ts + target-mode.test.ts  # Shared zod discriminated-union primitive (ADR-003 / BI-029) — internal, no MCP registration
├── cli-adapter/
│   └── cli-adapter.ts + cli-adapter.test.ts  # Centralised CLI invocation primitive (ADR-004) — internal, no MCP registration
├── help/
│   └── strip-schema.ts + strip-schema.test.ts # Pure schema-stripping utility (ADR-005 / BI-030) — consumed by every tool registration site
└── tools/
    ├── _shared.ts                            # RegisteredTool type + asToolError helper (P8 aggregator pattern)
    ├── obsidian_exec/
    │   ├── schema.ts + schema.test.ts        # zod schema (single source of truth)
    │   ├── tool.ts + tool.test.ts            # MCP tool registration + dispatch (returns RegisteredTool)
    │   └── handler.ts + handler.test.ts      # spawn + collect + timeout + cap + error mapping
    └── help/                                 # Progressive-disclosure help tool (ADR-005 / BI-030)
        ├── schema.ts + schema.test.ts        # zod schema for { tool_name?: string }
        ├── handler.ts + handler.test.ts      # path resolution, traversal defense, file read
        └── tool.ts + tool.test.ts            # MCP tool registration (returns RegisteredTool)

docs/tools/                                   # Bundled Markdown docs (ADR-005 / BI-030); package.json files array includes "docs/tools/**/*.md"
├── index.md                                  # Listing of available tools — response to help({})
├── help.md                                   # The help tool's own docs — response to help({ tool_name: "help" })
├── obsidian_exec.md                          # Full doc for the obsidian_exec tool
└── <future-tool>.md                          # One file per registered tool; future BIs (BI-003+) populate the 6 stubs that ship today
```

Tests are co-located as `*.test.ts` next to the module they exercise (constitution Principle II).

### CI and quality gates

GitHub Actions runs a single job, `Lint / Typecheck / Test / Build`, on every `push` to `main` and `pull_request` targeting `main`. See [.github/workflows/ci.yml](.github/workflows/ci.yml). Pipeline:

1. `npm ci` (Node 22 with npm cache)
2. `npm run lint`
3. `npm run typecheck`
4. `npm test` — runs tests AND enforces the coverage gate (single source of truth — same command developers run locally)
5. `npm run build`

Fail-fast — a failure in any step surfaces the precise stage and stops the pipeline. Concurrency is set so a new push to a branch cancels the in-flight run for that ref.

### Coverage gate

Coverage is gated on **aggregate statements only**. The threshold lives in [vitest.config.ts](vitest.config.ts) under `test.coverage.thresholds.statements` and is the **single source of truth** for the merge floor:

- Current floor: **84.3** (measured 85.86% post-005 — slightly below the 86.37% post-004 baseline because some of the help tool's registration-handler error-path lines are not exercised; still ~1.5pp above the floor with comfortable headroom — see ratcheting note below)
- Ratcheting up (or down, intentionally) is a **one-line visible edit** to that number — no env vars, no CI flags, no separate gate config. The visible diff IS the override.
- Branch / function / line / per-file thresholds are reported in the text reporter as **advisory** but do **NOT** block merge.

**Forbidden without a constitution amendment** (gate #5): adding `branches`, `functions`, `lines`, or `perFile` keys to `test.coverage.thresholds`. Reviewers MUST flag any PR that does so. This is intentional discipline — the single-statements-floor convention keeps coverage debates from spiraling into per-file negotiation.

To raise the floor after adding tests: run `npm run test:coverage`, look at the new aggregate, edit the number in [vitest.config.ts](vitest.config.ts) (rounded down to 1 dp), commit. The diff history shows the gate ratcheting visibly.

### Constitution and Spec Kit

Day-to-day development is bound by [.specify/memory/constitution.md](.specify/memory/constitution.md) — five non-negotiable principles (modular layout, co-located public-surface tests, zod boundary validation, structured upstream errors, attribution headers) plus the Technical Standards section (TypeScript strict + NodeNext + ES2024, Node 22.11+, `@modelcontextprotocol/sdk`, `zod`, Vitest, ESLint flat config, Prettier) and the Quality Gates the CI pipeline enforces. Changes that touch a public surface MUST ship co-located tests in the same change.

Features larger than a single-file change enter via the Spec Kit workflow: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Outputs land under [specs/](specs/). See "Spec Kit artifacts" at the bottom.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tool doesn't appear in MCP client | Bridge process not booting | Run `npx -y @marwansaab/obsidian-cli-mcp` directly in a terminal; check stderr for the error |
| `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH | Set `OBSIDIAN_BIN` in MCP-client `env` to the absolute binary path; restart the client |
| `CLI_NON_ZERO_EXIT` on every call | Obsidian desktop not running | Open Obsidian; retry |
| `CLI_TIMEOUT` on slow commands | Default 30 s too short for the workload | Pass `timeoutMs: 90000` (max 120000) on the call |
| `CLI_OUTPUT_TOO_LARGE` | Payload exceeded 10 MiB cap | Narrow the query (smaller `limit:`, narrower `eval` scope) |
| MCP wire seems corrupted / client disconnects | Something wrote to stdout that wasn't the SDK | A constitution violation slipped through; check recent changes for stray `console.log` or `process.stdout.write` |

## Attributions

**v0.1, v0.1.1, v0.1.2, v0.1.3, v0.1.4 — no upstream lifts.** All code under `src/` is original. Future composed code will be enumerated here per constitution Principle V (Attribution & Layered Composition Transparency).

The implementation depends on these third-party packages (declared in `package.json`):

- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — MIT — MCP server transport and tool registration (constitution-mandated).
- [`zod`](https://github.com/colinhacks/zod) — MIT — boundary input validation (constitution-mandated).
- [`zod-to-json-schema`](https://github.com/StefanTerdell/zod-to-json-schema) — ISC — converts the canonical zod schema to a JSON Schema for the MCP tool's published `inputSchema` (single source of truth, Principle III).

## License

See [LICENSE](LICENSE).

## Spec Kit artifacts

This project is developed via the Spec Kit workflow.

### v0.1 — [specs/001-add-cli-bridge/](specs/001-add-cli-bridge/) — initial bridge

- [spec.md](specs/001-add-cli-bridge/spec.md) — feature specification with 5 clarifications
- [plan.md](specs/001-add-cli-bridge/plan.md) — implementation plan with constitution-check
- [research.md](specs/001-add-cli-bridge/research.md) — phase 0 implementation-pattern decisions
- [data-model.md](specs/001-add-cli-bridge/data-model.md) — entity shapes and lifecycles
- [contracts/](specs/001-add-cli-bridge/contracts/) — MCP tool, errors, logging, server contracts (the canonical errors contract is edited in place by 002)
- [tasks.md](specs/001-add-cli-bridge/tasks.md) — dependency-ordered task list

### v0.1.1 — [specs/002-detect-cli-errors/](specs/002-detect-cli-errors/) — `CLI_REPORTED_ERROR` detection

- [spec.md](specs/002-detect-cli-errors/spec.md) — closes the spec-vs-reality gap on 001 AC#6 (CLI exits 0 with `Error:` stdout prefix now surfaces as a structured error). 6 clarifications across 2 sessions.
- [plan.md](specs/002-detect-cli-errors/plan.md) — implementation plan with constitution-check (all five principles still Y)
- [research.md](specs/002-detect-cli-errors/research.md) — empirical observations + decision provenance
- [data-model.md](specs/002-detect-cli-errors/data-model.md) — `CLI_REPORTED_ERROR` shape; reconciled `CLI_NON_ZERO_EXIT`; newly-registered `VALIDATION_ERROR` + `TOOL_NOT_FOUND`
- [contracts/](specs/002-detect-cli-errors/contracts/) — patches applied to 001's canonical contracts
- [tasks.md](specs/002-detect-cli-errors/tasks.md) — 17-task dependency-ordered list (all complete)
- [quickstart.md](specs/002-detect-cli-errors/quickstart.md) — six end-to-end verification scenarios

### v0.1.2 — [specs/003-cli-adapter/](specs/003-cli-adapter/) — internal CLI adapter scaffolding

- [spec.md](specs/003-cli-adapter/spec.md) — introduces a centralised internal CLI adapter at `src/cli-adapter/cli-adapter.ts` that future typed-tool MCP handlers will route through. Adds the new stable error code `ERR_NO_ACTIVE_FILE` for the focused-note-missing failure mode. The adapter is **internal** — not registered as an MCP tool, no zod schema, no public surface. v0.1.2 ships the adapter but no typed-tool consumer; the first typed tool lands in a future BI. 3 clarifications in 1 session (Q2 reversed during /speckit-plan to align with ADR-004).
- [plan.md](specs/003-cli-adapter/plan.md) — implementation plan with constitution-check (all five principles still Y, no Complexity Tracking entries)
- [research.md](specs/003-cli-adapter/research.md) — Q1/Q2/Q3 clarification provenance, plan-stage decisions (`invokeCli` export name, recovery-message wording verbatim, coverage floor unchanged), v0.1.x baselines reaffirmed, ADR-004 alignment
- [data-model.md](specs/003-cli-adapter/data-model.md) — `ERR_NO_ACTIVE_FILE` shape; adapter input/deps/success types; eight-code surface enumeration; FR-016 → spec-AC test coverage map; explicit note that `Logger.ErrorCode` is **not** extended this feature
- [contracts/cli-adapter.contract.md](specs/003-cli-adapter/contracts/cli-adapter.contract.md) — adapter's interface contract (signature, behavioural rules, ten test cases)
- [contracts/errors.contract-patch.md](specs/003-cli-adapter/contracts/errors.contract-patch.md) — diff applied in-place to specs/001's canonical errors contract
- [tasks.md](specs/003-cli-adapter/tasks.md) — 23-task dependency-ordered list (all complete)
- [quickstart.md](specs/003-cli-adapter/quickstart.md) — six unit-test verification scenarios + deferred consumer-side smoke

### v0.1.3 — [specs/004-target-mode-schema/](specs/004-target-mode-schema/) — target-mode schema primitive (BI-029)

- [spec.md](specs/004-target-mode-schema/spec.md) — introduces the shared zod discriminated-union primitive at `src/target-mode/target-mode.ts` that future typed-tool MCP handlers will compose against to enforce ADR-003's intent-declaration contract. Two-branch discriminator: `"specific"` (vault required + exactly one of file/path) and `"active"` (vault/file/path forbidden). The primitive is **internal** — no MCP tool registration, no CLI calls, no filesystem access. Active-mode forbidden-key error messages name the offending key + `"active mode"` with NO recovery directives; recovery guidance lives in per-tool docs (BI-030). 2 clarifications in 1 session + 1 plan-stage amendment expanding the export surface to ten items for Pattern (b) compatibility.
- [plan.md](specs/004-target-mode-schema/plan.md) — implementation plan with constitution-check (Principles I/II/III/V `Y`; Principle IV `N/A` since the primitive makes no upstream calls)
- [research.md](specs/004-target-mode-schema/research.md) — Q1/Q2 clarification provenance + five plan-stage decisions (P1 module path, P2/P3 `.superRefine()` for both refinements, P4 ten-export surface for Pattern (b) compatibility, P5 vitest's `expectTypeOf` for type-system tests), v0.1.x baselines reaffirmed, ADR-003 alignment
- [data-model.md](specs/004-target-mode-schema/data-model.md) — ten module exports (5 schemas, 2 helpers, 3 inferred types); refinement signatures; inferred type shapes; FR-012 → spec-AC test coverage map (32-case target — implementation lands 31 cases via `it.each` consolidation); explicit note that `Logger.ErrorCode` is **not** extended this feature
- [contracts/target-mode.contract.md](specs/004-target-mode-schema/contracts/target-mode.contract.md) — primitive's canonical interface contract (export inventory, behavioural rules, composition patterns)
- [tasks.md](specs/004-target-mode-schema/tasks.md) — 24-task dependency-ordered list (all complete)
- [quickstart.md](specs/004-target-mode-schema/quickstart.md) — eight unit-test verification scenarios + deferred consumer-side smoke
- **Implementation deviations** (recorded in the v0.1.3 commit): `targetModeSchema` is `ZodEffects<ZodDiscriminatedUnion<…>>`, not bare `ZodDiscriminatedUnion<…>` as data-model.md claimed — zod 3.25.x's `discriminatedUnion` rejects `ZodEffects` branches at both type and runtime levels; refactored to union over BASE schemas + a union-level `superRefine` dispatcher (inferred `TargetMode` type and consumer semantics unchanged). Edge case #8 (`{active, vault: undefined}`) succeeds rather than fails: zod's `mergeObjectSync` strips passthrough keys whose value is `undefined` before refinements run; `.strict()` would catch this but would reject Pattern (a) intersections (FR-005), so passthrough is binding.

### v0.1.4 — [specs/005-help-tool/](specs/005-help-tool/) — progressive-disclosure help tool (BI-030)

- [spec.md](specs/005-help-tool/spec.md) — implements [ADR-005](.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md) by shipping two co-located components plus a bundled `docs/tools/` directory: (1) a pure schema-stripping utility `stripSchemaDescriptions` at `src/help/strip-schema.ts` consumed by every tool registration site (parameter-level descriptions removed from the `tools/list` response — ~70% per-tool token reduction at the description level), (2) a new public `help` MCP tool at `src/tools/help/` that serves Markdown documentation for any registered tool on demand. Two new `UpstreamError` codes: `HELP_TOOL_NOT_FOUND` (named tool's `.md` file missing OR path-traversal probe OR reserved `"index"` name) and `HELP_DOCS_MISSING` (bundled docs directory missing — operator-side fix). 5 clarifications in 1 session; 1 `/speckit-analyze` remediation pass that surfaced (and fixed) a latent correctness bug in the original handler sketch (the reserved-name guard for `"index"` was missing — would have erroneously returned `index.md` content; remediation L1a added the guard).
- [plan.md](specs/005-help-tool/plan.md) — implementation plan with constitution-check (all five principles `Y`, no Complexity Tracking entries)
- [research.md](specs/005-help-tool/research.md) — Q1–Q5 clarification provenance + eight plan-stage decisions (P1 strip utility module path + verb-led name, P2 hand-rolled recursive walker over JSON Schema constructs, P3 no `.describe()` on `tool_name`, P4 three-layer path-traversal defense, P5 pinned top-level descriptions for both tools, P6 single registry-consistency block in `server.test.ts`, P7 SC-006 one-off PR-description measurement, P8 SDK-dispatch aggregator pattern — added by `/speckit-analyze` remediation finding I2)
- [data-model.md](specs/005-help-tool/data-model.md) — strip utility I/O shape; help tool input schema + 8 reachable response branches (B1 named-tool, B2 omitted, B3 not-found, B4 traversal, B4a reserved-`index`, B5 docs-missing, B6 empty-string, B7 non-string); `docs/tools/` directory inventory (9 files: 3 real + 6 stubs per Q3 hybrid roster); two new error code rows; 27-case test coverage map
- [contracts/strip-schema.contract.md](specs/005-help-tool/contracts/strip-schema.contract.md) — strip utility's interface contract (signature, R1–R7 behavioural rules, 6+1 test requirements)
- [contracts/help.contract.md](specs/005-help-tool/contracts/help.contract.md) — help tool's interface contract (SDK registration, B1–B8 + B4a behavioural branches, path resolution from `import.meta.url`, 4 schema + 11 handler + 3 tool test requirements)
- [contracts/errors.contract-patch.md](specs/005-help-tool/contracts/errors.contract-patch.md) — diff applied in-place to specs/001's canonical errors contract
- [tasks.md](specs/005-help-tool/tasks.md) — 31-task dependency-ordered list (all complete) — Phase 1 setup, Phase 2 foundational (docs/tools + package.json), Phase 3 US1 MVP (strip utility + obsidian_exec wiring + registry-consistency), Phase 4 US2 (help tool + P8 aggregator refactor), Phase 5 US3 (description condensing), Phase 6 US4 (npm pack + cwd-independence), Phase 7 polish (errors patch + README + SC-006 measurement + final gates + review)
- [quickstart.md](specs/005-help-tool/quickstart.md) — 8 verification scenarios (component + server + integration) plus the SC-006 token-economy measurement procedure
- **SC-006 measurement** (recorded in [requirements.md](specs/005-help-tool/checklists/requirements.md) and the v0.1.4 commit): `obsidian_exec` description condensed from ~1100 chars (P5 baseline) to 339 chars — ~70% reduction at the description alone, validating ADR-005's directional claim. `tools/list` response 1365 bytes for 2 tools post-this-BI; the full surface-level reduction will materialize as typed-tool BIs (BI-003+) ship with `.describe()` annotations the strip utility can remove.
- **Implementation deviations** (recorded in the v0.1.4 commit): T020 ended up not adding a new `it` block in `src/server.test.ts` (per remediation L3 — augmented the existing tools/list test inline AND added a `TOOL_NOT_FOUND` aggregator-fallback test instead of a redundant length-check). The `obsidian_exec/tool.test.ts` lost the previous "calling unknown tool returns isError" test (moved to `server.test.ts` where the aggregator dispatch lives post-P8) — net test-count change for that file is +1 (description-shape assertion added per T022).

### Project-wide

- [.specify/memory/constitution.md](.specify/memory/constitution.md) — project constitution (Principles I–V)
