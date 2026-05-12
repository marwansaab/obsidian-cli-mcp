# obsidian-cli-mcp

A minimal MCP server that bridges any MCP client (running locally or in a sandboxed container like Claude Cowork's Linux environment) to the Obsidian Integrated CLI binary on the operator's macOS, Linux, or Windows desktop. Exposes ten tools:

- **`obsidian_exec`** — generic CLI bridge that lets the caller invoke any Obsidian CLI subcommand with structured parameters, bare-word flags, optional vault scoping, and a per-call timeout.
- **`help`** — progressive-disclosure tool that serves full Markdown documentation for any registered tool on demand, per [ADR-005](.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md). Parameter-level descriptions are stripped from the JSON Schema at registration time to save context-window tokens, and recovered via `help({ tool_name: "<name>" })` when the agent needs them.
- **`read_note`** — typed read primitive: reads a note's raw UTF-8 text by file/path locator or from the focused editor (active mode), routing through the centralised cli-adapter per [ADR-004](.decisions/ADR-004%20-%20Centralised%20Internal%20CLI%20Adapter.md).
- **`read_heading`** — typed heading-body retrieval: returns just the body bytes between a named heading and its first-subsequent heading marker (typically 100–500 tokens vs. the 5–50k a full `read_note` returns).
- **`read_property`** — typed surgical frontmatter-property read: returns `{ value, type }` with the property's native YAML type preserved (text / list / number / checkbox / date / datetime / unknown).
- **`write_property`** — typed surgical frontmatter-property write: writes one named property to a vault note and returns `{ written: true, path, name }`. Symmetric write companion to `read_property`; six YAML types supported; cross-type overwrite native.
- **`find_by_property`** — typed value-to-file lookup over frontmatter: enumerates the vault for files whose named property equals a given value.
- **`list_files`** — typed folder-scoped file enumeration: lists files directly inside a vault folder (non-recursive, sub-folder + dotfile entries dropped, paths sorted by UTF-8 byte order). Supports `total: true` for token-economical count-only queries.
- **`write_note`** — typed direct-filesystem-write create/overwrite: writes content directly to the vault filesystem (bypassing the upstream argv-IPC defect that crashed Obsidian for large content); see *[Architecture note: `write_note`'s direct-filesystem-write path](#architecture-note-write_notes-direct-filesystem-write-path)* below for the full rationale.
- **`delete_note`** — typed delete tool with safety defaults (trash-by-default; explicit-opt-in for permanent delete).
- **`rename_note`** — typed in-place rename of `.md` notes: returns `{ renamed: true, fromPath, toPath }`. Honours the vault's "Automatically update internal links" setting; folder relocation is a separate concern reserved for a future `move_note` tool.

All failure modes — non-zero exit, CLI exits 0 with `Error:` stdout prefix, no active file in active mode, missing binary, timeout, output too large, missing-doc lookup, missing-docs-directory, file-exists-on-write, path-escapes-vault, fs-write-failed — surface as structured `UpstreamError` responses with full diagnostic detail.

## Installation

> **Important**: The bridge installs on the **desktop host** (Windows, macOS, or Linux), NOT inside a sandboxed Linux container (e.g., Claude Cowork). The bridge needs direct access to the `obsidian` binary, which only exists on the host where the Obsidian desktop app is installed. ADR-002 captures the architectural rationale.

### Prerequisites

- One of: **Windows 10 / 11**, **macOS Sonoma** or later, **Linux Ubuntu 22.04+** (or equivalent — Debian, Fedora, Arch).
- **Node.js >= 22.11** (LTS). Verify: `node --version`.
- **Obsidian 1.12+** desktop app installed and running. The bridge can boot without Obsidian running, but every `obsidian_exec` call will fail with `CLI_NON_ZERO_EXIT` until Obsidian is up.
- **Obsidian Integrated CLI** binary discoverable. Verify from a fresh shell prompt: `obsidian version`. If `obsidian` isn't on `PATH`, set `OBSIDIAN_BIN` in your MCP-client configuration to the absolute path. The bridge auto-detects the platform-default install location: macOS `/usr/local/bin/obsidian`, Linux `~/.local/bin/obsidian`, Windows defers to `PATH`.

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

Restart Claude Desktop. The `obsidian_exec`, `help`, and `read_note` tools will appear in the tools list.

### Claude Desktop (macOS)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "npx",
      "args": ["-y", "@marwansaab/obsidian-cli-mcp"],
      "env": {
        // Optional override for non-default installs (e.g., a Homebrew variant or
        // an app-bundle-internal binary). The auto-detected platform-default is
        // /usr/local/bin/obsidian (the official installer's symlink).
        // "OBSIDIAN_BIN": "/Applications/Obsidian.app/Contents/Resources/.../obsidian"
      }
    }
  }
}
```

Restart Claude Desktop. First `obsidian` invocation may surface a Gatekeeper prompt; subsequent calls succeed transparently.

### Claude Desktop (Linux)

Edit `~/.config/Claude/claude_desktop_config.json` (path may differ per distribution and client version — defer to your client's docs):

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "npx",
      "args": ["-y", "@marwansaab/obsidian-cli-mcp"],
      "env": {
        // Optional override for non-default install locations such as
        // /opt/obsidian, ~/bin, or /snap/bin/obsidian.
        // "OBSIDIAN_BIN": "/opt/obsidian/obsidian"
      }
    }
  }
}
```

Some distributions don't include `~/.local/bin` on the default `PATH`. Either add `export PATH="$HOME/.local/bin:$PATH"` to your `~/.bashrc` / `~/.zshrc`, or set `OBSIDIAN_BIN` to the absolute install path. WSL guests with Obsidian installed inside the WSL guest behave as native Linux; WSL guests with Obsidian on the Windows host are out of scope (per FR-016).

### Claude Cowork (sandboxed container) → desktop host

Cowork's container can't exec the host `obsidian` binary directly — that's exactly the problem this bridge solves. Run the bridge on the **operator's desktop host** (Windows, macOS, or Linux) and configure Cowork to tunnel its MCP stdio to that host process. The exact `command` depends on your host-to-container tunneling tool; the point is that the configured command's stdio MUST end up wired to a `npx -y @marwansaab/obsidian-cli-mcp` process running on the desktop host.

```jsonc
{
  "mcpServers": {
    "obsidian-cli-mcp": {
      "command": "<your host-stdio bridge command>",
      "args": ["<args that exec 'npx -y @marwansaab/obsidian-cli-mcp' on the desktop host>"]
    }
  }
}
```

## Tool reference

The bridge registers three tools: `obsidian_exec` (the generic CLI bridge), `help` (the progressive-disclosure docs tool), and `read_note` (the typed read primitive). At session start the agent sees all three via `tools/list` with parameter-level descriptions stripped from each tool's JSON Schema; full per-parameter documentation is reachable via `help({ tool_name: "<name>" })`.

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

### `read_note`

The first typed-tool surface — reads a note's raw UTF-8 text from an Obsidian vault. Composes the target-mode primitive ([004](specs/004-target-mode-schema/spec.md)), the cli-adapter ([003](specs/003-cli-adapter/spec.md)), and the help tool's schema-strip ([005](specs/005-help-tool/spec.md)). Implements [ADR-003](.decisions/) (target-mode discriminated union) and [ADR-004](.decisions/) (centralised cli-adapter routing).

#### Input

The schema is a `target_mode`-discriminated union with two branches:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `target_mode` | `"specific" \| "active"` | yes | Discriminator. Selects the branch. |
| `vault` | `string` (non-empty) | specific only | Required in specific mode; FORBIDDEN in active mode. |
| `file` | `string` | specific only | Wikilink form (e.g., `"Recipe"`). Exactly ONE of `file`/`path` MUST be provided in specific mode. FORBIDDEN in active mode. |
| `path` | `string` | specific only | Vault-relative path (e.g., `"Templates/Recipe.md"`). Exactly ONE of `file`/`path` MUST be provided in specific mode. FORBIDDEN in active mode. |

In active mode the tool reads whatever note is currently focused in Obsidian's editor; no vault/file/path is forwarded to the CLI. Empty-string locators (`file: ""` or `path: ""`) are accepted at the schema layer and forward to the CLI verbatim — failures surface as `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR`.

Full Markdown documentation reachable via `help({ tool_name: "read_note" })`.

#### Output (success)

```jsonc
{ "content": "<raw UTF-8 text from CLI stdout>" }
```

The bridge does not trim, transform, normalize line endings, strip BOMs, or post-process the body. Whatever the Obsidian CLI emits to stdout is what the agent receives. Empty stdout returns `{ "content": "" }` (empty notes are valid successful reads).

#### Errors

Read_note introduces zero new error codes — its full failure surface is covered by `VALIDATION_ERROR`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE` (active mode + no focused note), and `CLI_BINARY_NOT_FOUND`. See the global error table below.

### Output (failure — `isError: true`)

Errors are returned via the MCP SDK's `isError: true` shape with a JSON-encoded payload of `{ code, message, details }`. Stable error codes:

| `code` | When | Key `details` fields |
|--------|------|----------------------|
| `CLI_NON_ZERO_EXIT` | Spawned `obsidian` exited non-zero | `argv`, `stdout`, `stderr`, `exitCode`, `signal` |
| `CLI_BINARY_NOT_FOUND` | `obsidian` not on PATH and `OBSIDIAN_BIN` unset/wrong | `platform`, `attempts` (ordered `ResolutionAttempt[]` per source/path/outcome), `PATH` |
| `CLI_TIMEOUT` | Call exceeded `timeoutMs` (default 30 s) | `argv`, `timeoutMs`, `partialStdout`, `partialStderr` |
| `CLI_OUTPUT_TOO_LARGE` | Either stream crossed the 10 MiB cap | `argv`, `stream`, `limitBytes`, `capturedBytes`, `partial` |
| `CLI_REPORTED_ERROR` | CLI exits 0 with stdout that, after leading-whitespace trim, starts with `Error:` | `argv`, `stdout`, `stderr`, `exitCode`, `message` |
| `ERR_NO_ACTIVE_FILE` | CLI exits 0 with stdout that, after leading-whitespace trim, starts with `Error: no active file` (focused-note-missing failure mode; raised by the typed-tool adapter, not the legacy `obsidian_exec` handler) | `command`, `stdout`, `stderr`, `exitCode`, `message` |
| `VALIDATION_ERROR` | Input failed zod validation | `issues[]` (path, message, code) |
| `TOOL_NOT_FOUND` | Caller named a tool not in the registered set | `requestedName`, `knownTools` |
| `HELP_TOOL_NOT_FOUND` | `help` was called with a `tool_name` that has no `<name>.md` in `docs/tools/` (or hits the path-traversal defense, or the reserved `"index"` name) | `requestedName`, `availableTools` |
| `HELP_DOCS_MISSING` | The bundled `docs/tools/` directory is missing or unreadable (packaging/install integrity failure — operator-side fix, not agent-recoverable) | `resolvedDocsDir`, `ioCode` |

Full error contract: [specs/001-add-cli-bridge/contracts/errors.contract.md](specs/001-add-cli-bridge/contracts/errors.contract.md).

## Architecture note: `write_note`'s direct-filesystem-write path

`write_note` is the only tool in the bridge that does **not** route content through the `obsidian` CLI. Its handler writes user content directly to the vault filesystem via Node `fs`. The CLI is still consulted for small control-plane operations (vault registry probe, focused-file resolution in active mode, post-write `metadataCache` invalidation, optional editor-open) — all eval argv elements stay under 250 bytes — but the **note body itself never crosses the CLI argv pipe at any size**.

This is the load-bearing departure from every other tool in the bridge, ratified by [ADR-009 — Direct Filesystem Write Path Alongside CLI Bridge](.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md). It exists to work around an upstream defect in the Obsidian CLI:

> **The CLI's argv→IPC chunk-boundary parsing crashes Obsidian's main process for any single argv element that exceeds ~4 KB on Windows.** When the parent renderer's JSON parse over the IPC stream fails on a chunked argv element, the entire Obsidian instance dies — taking the user's open vault, unsaved buffers, and any concurrent CLI calls down with it. Filed at <https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119>.

The legacy v0.2.x `write_note` routed content through the CLI's `create` subcommand. Any payload above the threshold crashed Obsidian. An eval-bypass workaround was prototyped during the spec phase and **empirically refuted on 2026-05-10** — `obsidian eval` crashes equally above the same per-argv-element threshold, because the defect lives in the parent renderer's argv→IPC chunking, not in any specific subcommand's parsing.

The direct-fs-write design is the durable fix: it remains correct regardless of whether the upstream defect is ever resolved. The bridge owns vault-name → absolute-path resolution end-to-end via the new lazy vault registry (`obsidian vaults verbose` consulted once on first write per MCP-server-process lifetime; cached thereafter; retried-on-failure). Two new internal modules cover the new responsibilities the bridge picks up by owning the IO end-to-end:

- **`src/vault-registry/`** — `vaultName → absolutePath` map. Lazy probe; cached for the MCP-process lifetime; concurrent first-call dedupe.
- **`src/path-safety/`** — two-layer vault-root sandboxing. Layer 1 is a structural validator on `file` / `path` schema fields (rejects empty strings, leading `/` or `\`, drive-letter prefix `[A-Za-z]:`, any `..` segment, control characters `[\x00-\x1f\x7f]`). Layer 2 is a runtime `fs.realpath`-based symlink-escape check that runs **pre-mkdir** so the check sees existing symlinks before the caller creates new directories underneath. Layer-2 rejection emits a typed `pathEscapeAttempt` logger event for operator audit.

### Visible v0.3.0 contract changes vs. v0.2.x

`write_note` keeps the same tool name, the same `target_mode` discriminator, and the same output envelope shape `{ created: boolean, path: string }`. Two deliberate breaking changes vs. the predecessor are surfaced as structured errors rather than as a tool-name change:

- **`template` parameter is no longer accepted.** Strict-mode rejects with `VALIDATION_ERROR` (`unrecognized_keys`). For template-based creation, use `obsidian_exec` with `argv: ["create", "vault=…", "path=…", "template=<name>"]` — template names are short enough to dodge the upstream defect.
- **Collision behaviour is now structured `FILE_EXISTS`.** The legacy tool silently auto-renamed colliding files (`Existing.md` → `Existing 1.md`) and returned `created: true` with the renamed path. The new tool returns a structured `FILE_EXISTS` error instead. Callers who want create-or-replace semantics MUST pass `overwrite: true`.
- **Multi-vault routing now works.** `vault=Foo` writes to Foo's absolute filesystem path regardless of which vault Obsidian currently has focused — the R11 limitation inherited by every prior typed tool (the CLI's `vault=` parameter being functionally ignored by `eval`) is **resolved** for `write_note` because the bridge owns path resolution end-to-end via the vault registry.

Three new error codes added to the project roster — `FILE_EXISTS`, `PATH_ESCAPES_VAULT`, `FS_WRITE_FAILED` — covering collision, runtime path-safety rejection, and generic fs-write failures (ENOSPC / EACCES / EROFS / EIO / …).

The MINOR bump (0.2.x → 0.3.0) is the honest semver signal: existing callers using the legacy input shape will see `VALIDATION_ERROR` (for `template`) or `FILE_EXISTS` (for collision) instead of silent success on the changed paths. Migration is mechanical and documented in `help({ tool_name: "write_note" })`.

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
    ├── help/                                 # Progressive-disclosure help tool (ADR-005 / BI-030)
    │   ├── schema.ts + schema.test.ts        # zod schema for { tool_name?: string }
    │   ├── handler.ts + handler.test.ts      # path resolution, traversal defense, file read
    │   └── tool.ts + tool.test.ts            # MCP tool registration (returns RegisteredTool)
    └── read_note/                            # First typed-tool surface (ADR-003 + ADR-004 / BI-003)
        ├── schema.ts + schema.test.ts        # re-export of targetModeSchema as readNoteInputSchema
        ├── handler.ts + handler.test.ts      # routes through invokeCli inside deps.queue.run; emits FR-017 log events
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

- Current floor: **84.3** (measured 86.82% post-006 — up ~1pp from 85.86% post-005 because read_note's schema/handler tests added denser per-line coverage than they removed via the registry surface; ~2.5pp above the floor with comfortable headroom — see ratcheting note below)
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

**v0.1.x through v0.3.0 — no upstream lifts.** All code under `src/` is original. Every new source file added by the typed-tool BIs (006 read_note, 011 write_note, 012 delete_note, 013 read_property, 014 find_by_property, 015 read_heading, 016 reliable-writer's `vault-registry`/`path-safety` modules + write_note rewrite) carries the standard `// Original — no upstream.` header per constitution Principle V (Attribution & Layered Composition Transparency).

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

### v0.1.5 — [specs/006-read-note/](specs/006-read-note/) — first typed-tool MCP surface (BI-003)

- [spec.md](specs/006-read-note/spec.md) — implements [BI-003](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) by shipping the first typed-tool MCP surface composed on top of the three foundation features that landed before it (BI-029 target-mode primitive, BI-028 cli-adapter, BI-030 help tool + schema-strip). The new tool at `src/tools/read_note/` reads a note's raw UTF-8 text from an Obsidian vault by file/path locator (specific mode) or from the focused editor (active mode). 6 user stories, 21 functional requirements, 11 success criteria. 3 clarifications in 1 session (Q1 queue sharing → FR-016, Q2 logger dep → FR-017, Q3 empty-string deferral → updated Edge Case). Zero new error codes — entire failure surface (`VALIDATION_ERROR`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, `CLI_BINARY_NOT_FOUND`) is covered by codes already defined by 001/002/003. 1 `/speckit-analyze` remediation pass (C1+C2+I1+I2+L1-L6) which added handler test #9 (Story 5 AC#4 non-`UpstreamError` re-throw with reference-equality + negative log assertion), strengthened tool test #5 (full Story 6 AC#3 doc-content roster), corrected FR-017's `stdoutBytes` formula to `Buffer.byteLength(stdout, "utf8")`, and added the `docs/tools/index.md` entry update task (T011a).
- [plan.md](specs/006-read-note/plan.md) — implementation plan with constitution-check (all five principles `Y`, no Complexity Tracking entries)
- [research.md](specs/006-read-note/research.md) — Q1/Q2/Q3 clarification provenance + eight plan-stage decisions (P1 schema composition tactic / FR-002 deviation, P2 top-level description wording, P3 server registration order, P4 log-event payload extras, P5 doc body structure, P6 test-injection pattern, P7 TODO-marker test placement, P8 BI-029 amendment deferral)
- [data-model.md](specs/006-read-note/data-model.md) — input schema (re-exported from the target-mode primitive per P1) + handler I/O + RegisterDeps + log-event payload shapes + 23-case test coverage map (9 schema + 9 handler + 5 tool — revised from 22 by `/speckit-analyze` C2 remediation that added handler test #9)
- [contracts/read-note.contract.md](specs/006-read-note/contracts/read-note.contract.md) — read_note tool's interface contract (no errors-contract patch — zero new codes; the canonical errors contract at specs/001 is unchanged)
- [tasks.md](specs/006-read-note/tasks.md) — 21-task dependency-ordered list (all complete) — Phase 1 setup, Phase 2 foundational (schema/handler/tool skeletons), Phases 3–7 per-user-story tests (US4 schema, US1/US2/US3/US5 handler), Phase 8 US6 wiring + docs + tool registration tests, Phase 9 polish (5 grep/wc verifications + full quality gate + manual server check + PR checklist)
- [quickstart.md](specs/006-read-note/quickstart.md) — 12 verification scenarios (schema, handler, registration, server, end-to-end via help tool)
- **FR-002 deviation** (recorded in the v0.1.5 commit): re-export of `targetModeSchema` as `readNoteInputSchema` instead of the literal Pattern (b) the spec mandates — `z.discriminatedUnion` requires `ZodObject` branches and the primitive's refinements return `ZodEffects`, making literal Pattern (b) infeasible. Re-export is structurally equivalent for the zero-extra-fields case. Future typed-tool BIs that DO add tool-specific fields (BI-004 `read_heading`, etc.) will need a BI-029 amendment exposing the refinement bodies — deferred per P8 to the first consumer.
- **Logger amendment**: small additive surgery to `src/logger.ts` made `argv?`/`locator?` optional on `CallStartEvent`, `stderrBytes?` optional on `CallEndSuccessEvent`, and added `ERR_NO_ACTIVE_FILE` to the `ErrorCode` union — sanctioned by plan §P4 fallback ("if typecheck rejects locator extra…"). Existing `obsidian_exec` callsites unchanged; existing `logger.test.ts` unchanged.

### Project-wide

- [.specify/memory/constitution.md](.specify/memory/constitution.md) — project constitution (Principles I–V)
