# Data Model: CLI Adapter

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-05

This feature introduces no persistent entities (the adapter is stateless per [plan.md](./plan.md) §Storage). It introduces:

- One new in-memory entity in the project-wide `UpstreamError.code` enumeration: `ERR_NO_ACTIVE_FILE`.
- One new TypeScript literal-union type: `target_mode: "specific" | "active"` (owned by the adapter module).
- One new internal interface for the adapter's input shape and one for its deps.
- One new exported runtime function: `invokeCli`.
- Re-export of the existing `UpstreamError` class (FR-011).

## New: `ERR_NO_ACTIVE_FILE`

A new member of the project-wide `UpstreamError.code` string enumeration. Triggered by [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) when, after the spawned child has closed with code `0`, the captured `stdout` — when its leading whitespace is trimmed via `String.prototype.trimStart` — begins with the literal twenty-one-character ASCII string `Error: no active file` (case-sensitive).

### Field shape

| Field | Type | Value |
|-------|------|-------|
| `code` | `string` (literal) | `"ERR_NO_ACTIVE_FILE"` |
| `cause` | `null` | Always `null` — no thrown value exists; the adapter is re-routing an exit-zero response, not catching a throw (FR-008(b)). |
| `message` (`Error.message`) | `string` | The recovery instruction `"No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` (P2 plan-stage decision, FR-008(b)). NOT the synthesized default — explicit override via the `UpstreamError` constructor's `message` argument ([src/errors.ts:15](../../src/errors.ts#L15)). |
| `details.command` | `string` | The input `command` string verbatim. |
| `details.stdout` | `string` | Full captured stdout (UTF-8). Byte-identical to what the resolve path would have returned. Always starts (after `.trimStart()`) with `Error: no active file`. |
| `details.stderr` | `string` | Full captured stderr (UTF-8). Typically empty for the focused-note-missing case. |
| `details.exitCode` | `0` (literal) | The truthful exit code the child exited with. Discoverable from the error alone for callers distinguishing this code from `CLI_NON_ZERO_EXIT`. |
| `details.message` | `string` | One-line summary computed as `stdout.split('\n', 1)[0].trim()` — same algorithm as `CLI_REPORTED_ERROR.details.message` per FR-009. Trailing `\r` from Windows CRLF is absorbed by `.trim()`. Always starts with `Error: no active file`. |

### Lifecycle

`ERR_NO_ACTIVE_FILE` is constructed once per affected adapter call (i.e., once per exit-zero spawn whose stdout begins with `Error: no active file` after leading-whitespace trim), inside the adapter's `child.on("close", ...)` handler, immediately before `reject(...)`. There is no retry, no backoff, and no caller-visible state besides the single thrown error. The adapter does not log the failure (Assumptions: "The adapter has no internal logger") — the calling typed tool owns that.

### Invariants

- `details.exitCode === 0` always — non-zero exits short-circuit to `CLI_NON_ZERO_EXIT` (priority a, FR-008).
- `details.stdout.trimStart().startsWith("Error: no active file") === true` always — the leading-whitespace trim and exact-prefix match against the full literal twenty-one-character string are the trigger.
- `details.message.startsWith("Error: no active file") === true` always (the trim preserves the prefix; the longer suffix `Error: no active file. Open one.` also satisfies this — see Edge Cases).
- `cause === null` always (FR-008(b)).
- `Error.message === "No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` always (P2 plan-stage decision; tests in FR-016(e) MUST assert this verbatim).

## New: adapter input/deps types

The adapter module exports two TypeScript types (FR-002):

```ts
export type TargetMode = "specific" | "active";

export interface InvokeCliInput {
  command: string;
  parameters: Record<string, string | number | boolean | undefined>;
  flags: string[];
  target_mode: TargetMode;
}

export interface InvokeCliDeps {
  spawnFn?: (binary: string, args: string[], options: SpawnOptions) => ChildProcess;
  env?: NodeJS.ProcessEnv;
}
```

Both interfaces are direct mirrors of [handler.ts:24-29](../../src/tools/obsidian_exec/handler.ts#L24-L29)'s `ExecuteDeps` shape (Q1: "mirror executeObsidianExec"). The `SpawnOptions`/`ChildProcess` types are imported from `node:child_process`.

### Resolved-success shape

```ts
export interface InvokeCliSuccess {
  stdout: string;
  stderr: string;
}
```

A successful `invokeCli` call resolves with this two-field record (FR-008(d)). No `argv`, no `exitCode` — those are details a successful caller does not need; failures get them in `UpstreamError.details`.

## Surface enumeration (post-feature)

After this feature lands, the `UpstreamError.code` enumeration project-wide reaches the following codes:

| Code | Layer | Triggered by |
|------|-------|--------------|
| `TOOL_NOT_FOUND` | Dispatch ([tool.ts:50](../../src/tools/obsidian_exec/tool.ts#L50)) | MCP client called a tool other than `obsidian_exec`. (002) |
| `VALIDATION_ERROR` | Dispatch ([tool.ts:61](../../src/tools/obsidian_exec/tool.ts#L61)) | `params.arguments` failed `obsidianExecSchema.parse()`. (002) |
| `CLI_BINARY_NOT_FOUND` | Handler / Adapter | `spawn` ENOENT — `obsidian` not on PATH and `OBSIDIAN_BIN` unset/wrong. Both `obsidian_exec` and the new adapter emit this with the same shape per FR-010. (001 + 003) |
| `CLI_TIMEOUT` | Handler ([handler.ts:178-191](../../src/tools/obsidian_exec/handler.ts#L178-L191)) | Child exceeded `timeoutMs` in the `obsidian_exec` handler (default 30 s). The adapter does not emit this — no timeout per spec Out-of-Scope. (001) |
| `CLI_OUTPUT_TOO_LARGE` | Handler ([handler.ts:195-213](../../src/tools/obsidian_exec/handler.ts#L195-L213)) | Either captured stream crossed the 10 MiB cap in the `obsidian_exec` handler. The adapter does not emit this — no cap per spec Out-of-Scope. (001) |
| `CLI_NON_ZERO_EXIT` | Handler / Adapter | Child exited with non-zero code, OR (per Q3) terminated by signal with `code === null`. Both `obsidian_exec` and the new adapter emit this; the adapter's `details.signal` carries the signal name and `details.exitCode = code ?? -1` per the precedent at [handler.ts:238](../../src/tools/obsidian_exec/handler.ts#L238). (001 + 003) |
| `CLI_REPORTED_ERROR` | Handler / Adapter | Child exited `0` and stdout's trimmed leading prefix is `Error:` (but NOT `Error: no active file`). Both `obsidian_exec` and the new adapter emit this. (002 + 003) |
| `ERR_NO_ACTIVE_FILE` | Adapter (NEW; FR-008(b)) | Child exited `0` and stdout's trimmed leading prefix is `Error: no active file`. Adapter-only — `obsidian_exec` continues to surface this as `CLI_REPORTED_ERROR` because it does not implement the priority-(b)/priority-(c) split (Out-of-Scope: "Refactoring the existing handler to use the adapter"). |

Eight total. The adapter contributes one new code (`ERR_NO_ACTIVE_FILE`) and reuses three existing codes (`CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`).

## State transitions

The adapter has no persistent state machine. Per call, the lifecycle is:

```text
invokeCli(input, deps?)
  │
  ├─ assemble argv
  │   └─ if target_mode === "active": strip {vault, file, path} from parameters
  │   └─ if parameters.vault !== undefined: hoist vault=<value> as first kv token
  │   └─ append flags as bare-word tokens
  │
  ├─ spawn (binary = (deps.env ?? process.env).OBSIDIAN_BIN ?? "obsidian", argv, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  │   ├─ on ENOENT (sync throw)  → reject(CLI_BINARY_NOT_FOUND)
  │   └─ on other native error    → propagate as-is (NOT wrapped — FR-010)
  │
  └─ on close(code, signal) — collect full stdout/stderr first, then classify:
       │
       ├─ priority (a): code !== 0
       │   → reject(CLI_NON_ZERO_EXIT,
       │            cause: { exitCode: code ?? -1, signal },
       │            details: { command, stdout, stderr, exitCode: code ?? -1, signal })
       │
       ├─ priority (b): code === 0 AND stdout.trimStart().startsWith("Error: no active file")
       │   → reject(ERR_NO_ACTIVE_FILE,
       │            cause: null,
       │            details: { command, stdout, stderr, exitCode: 0, message: parsedFirstLine },
       │            message: <P2 recovery-instruction string>)
       │
       ├─ priority (c): code === 0 AND stdout.trimStart().startsWith("Error:") AND priority (b) did NOT fire
       │   → reject(CLI_REPORTED_ERROR,
       │            cause: null,
       │            details: { command, stdout, stderr, exitCode: 0, message: parsedFirstLine })
       │
       └─ priority (d): otherwise
           → resolve({ stdout, stderr })
```

The four priorities are mutually exclusive and exhaustive over the close-event state space. The strict order matters at exactly two points:

1. (a) before (b): non-zero exits with `Error: no active file`-prefixed stdout classify as `CLI_NON_ZERO_EXIT`, not `ERR_NO_ACTIVE_FILE`. Tested by FR-016(i).
2. (b) before (c): exit-0 with `Error: no active file. <suffix>` classifies as `ERR_NO_ACTIVE_FILE`, not `CLI_REPORTED_ERROR`. Tested by FR-016(h).

## Test coverage map (FR-016 → spec ACs)

| Test case | Maps to spec AC(s) | Path classification |
|-----------|--------------------|--------------------:|
| (a) happy-path specific mode | Story 1 AC #1 | Happy |
| (b) happy-path active-mode (vault + file strip) | Story 2 AC #1 | Happy |
| (c) happy-path active-mode (path strip + non-target preserve) | Story 2 AC #2 | Happy |
| (d) failure-path `CLI_NON_ZERO_EXIT` | Story 3 AC #1 | Failure |
| (e) failure-path `ERR_NO_ACTIVE_FILE` | Story 3 AC #2 | Failure |
| (f) failure-path `CLI_REPORTED_ERROR` | Story 3 AC #3 | Failure |
| (g) boundary-path `parameters` undefined values | Story 1 AC #3, Edge Cases | Boundary |
| (h) boundary-path priority (b) beats (c) | Story 3 AC #6, Edge Cases | Boundary |
| (i) boundary-path priority (a) beats (b) | Story 3 AC #5, Edge Cases | Boundary |
| (j) boundary-path signal-only termination | Q3 clarification, Edge Cases | Boundary |

Ten total. Story 1 AC #2 (flags appended after key=value pairs) and AC #4 (vault-hoisting regardless of insertion order) and Story 2 AC #4 (active mode + non-target-locator key + flag) are not strict FR-016 requirements but SHOULD be added as supplementary cases by the implementer to keep the AC-to-test ratio at 100%. Story 4 AC #1 (re-export validation) is a typecheck-only assertion and lives in the import line of the test file itself — no runtime test case is needed.

## Logger.ErrorCode union — NOT extended this feature

Feature 002 extended [src/logger.ts](../../src/logger.ts)'s `ErrorCode` union to include `"CLI_REPORTED_ERROR"` because the bridge handler's `Logger.callEndFailure` path emitted that code. **Feature 003 does NOT extend the union for `ERR_NO_ACTIVE_FILE`**. Reason: per spec Assumptions, the adapter has no internal logger; `ERR_NO_ACTIVE_FILE` is constructed by the adapter and propagated to the calling typed-tool handler, which decides whether and how to log it. Until a typed-tool BI lands that wires `ERR_NO_ACTIVE_FILE` through `Logger.callEndFailure`, the union stays at five members (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`). When such a BI lands, extending the union is a one-line change in that BI.
