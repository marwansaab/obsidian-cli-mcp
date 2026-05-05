# CLI Adapter Contract

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-05

This document is the canonical contract for the internal CLI adapter module at [src/cli-adapter/cli-adapter.ts](../../../src/cli-adapter/cli-adapter.ts). The module is **internal** — it has no MCP tool registration, no zod schema, no `inputSchema` for clients to inspect (FR-015). This contract documents the in-process TypeScript boundary that typed-tool handlers consume.

## Module path

- Source: [src/cli-adapter/cli-adapter.ts](../../../src/cli-adapter/cli-adapter.ts)
- Co-located test: [src/cli-adapter/cli-adapter.test.ts](../../../src/cli-adapter/cli-adapter.test.ts)
- Both files MUST carry an original-contribution header: `// Original — no upstream. <one-line description>.` (FR-014, Constitution Principle V)

## Exports

```ts
// Runtime
export function invokeCli(
  input: InvokeCliInput,
  deps?: InvokeCliDeps,
): Promise<InvokeCliSuccess>;

// Re-export from src/errors.ts (FR-011)
export { UpstreamError } from "../errors.js";

// Types
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

export interface InvokeCliSuccess {
  stdout: string;
  stderr: string;
}
```

A consuming module imports both the runtime and the error class from one path:

```ts
import { invokeCli, UpstreamError } from "../cli-adapter/cli-adapter.js";
```

This satisfies FR-011 / Story 4 AC #1.

## Input contract

| Field | Type | Constraint |
|-------|------|------------|
| `input.command` | `string` | Non-empty string. The adapter does NOT validate emptiness — callers (typed tool handlers) zod-validate at their boundary per Principle III. |
| `input.parameters` | `Record<string, string \| number \| boolean \| undefined>` | Top-level record only — values MUST be primitives or `undefined`. Object/array values are caller errors; the adapter's TypeScript type forbids them, runtime stringification via `String(value)` is best-effort and the resulting argv is likely CLI-rejected (Edge Cases). |
| `input.flags` | `string[]` | Bare-word flags. The adapter passes these through verbatim — no `=`-pair wrapping, no quoting (FR-005). |
| `input.target_mode` | `"specific" \| "active"` | String literal union (FR-002). Generic `string` is forbidden by the type. |
| `deps.spawnFn` | `SpawnLike \| undefined` | Test-seam injection (Q1). When omitted, the adapter uses `node:child_process`'s `spawn`. |
| `deps.env` | `NodeJS.ProcessEnv \| undefined` | Test-seam injection (Q1). When omitted, the adapter uses `process.env`. The binary path resolution chain is `(deps.env ?? process.env).OBSIDIAN_BIN ?? "obsidian"` per the [handler.ts:60-61](../../../src/tools/obsidian_exec/handler.ts#L60-L61) precedent. |

## Output contract

### On resolution

```ts
{ stdout: string, stderr: string }
```

Both fields are full-buffer captures decoded as UTF-8 from accumulated chunks (FR-007). They are byte-identical to what `Buffer.concat([...stdoutChunks]).toString("utf8")` would produce. Empty strings are valid (`stdout: "", stderr: ""` — exit-0 with no output).

### On rejection

A single `UpstreamError` instance ([src/errors.ts:10](../../../src/errors.ts#L10)) with one of four `code` values:

| `code` | When | `cause` | `details` |
|--------|------|---------|-----------|
| `CLI_NON_ZERO_EXIT` | Child closed with non-zero exit code, OR `code === null` and `signal !== null` (signal-only termination). | `{ exitCode, signal }` where `exitCode = code ?? -1` (Q3 sentinel). | `{ command, stdout, stderr, exitCode, signal }` with `exitCode` mirroring `cause.exitCode`. |
| `ERR_NO_ACTIVE_FILE` | Child closed with code `0` and `stdout.trimStart().startsWith("Error: no active file")`. Priority (b) — fires before `CLI_REPORTED_ERROR` even when stdout starts with the longer literal `Error: no active file. Open one.` | `null` | `{ command, stdout, stderr, exitCode: 0, message }` where `message = stdout.split("\n", 1)[0].trim()`. The `Error.message` property is the recovery instruction `"No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` |
| `CLI_REPORTED_ERROR` | Child closed with code `0` and `stdout.trimStart().startsWith("Error:")` AND priority (b) did NOT fire. | `null` | `{ command, stdout, stderr, exitCode: 0, message }` (same `message` algorithm as `ERR_NO_ACTIVE_FILE`). |
| `CLI_BINARY_NOT_FOUND` | `spawn` threw synchronously with `errnoCode === "ENOENT"`. Mirrors [handler.ts:82-91](../../../src/tools/obsidian_exec/handler.ts#L82-L91). | The native spawn error object. | `{ binaryAttempted, PATH }` — same shape as the existing handler emits. |

Non-`ENOENT` native spawn errors are propagated as-is (NOT wrapped in `UpstreamError`) per FR-010. The caller receives the native error and decides whether to map it.

## Behavioural contract

The adapter MUST:

1. Spawn via `child_process.spawn` with `shell: false` and the assembled argv as a literal array (FR-006). Spawn options match [handler.ts:75-79](../../../src/tools/obsidian_exec/handler.ts#L75-L79) verbatim except for the lack of `windowsHide` opinion: `stdio: ["ignore", "pipe", "pipe"]`, `windowsHide: true`.
2. Resolve the binary path via `(deps.env ?? process.env).OBSIDIAN_BIN ?? "obsidian"` (FR-006 + Q1 precedent). NOTE: the spec's FR-006 lists only `process.env.OBSIDIAN_BIN ?? "obsidian"` as shorthand; the deps-aware form is the implementation contract per Q1.
3. Assemble argv as `[command, ...vaultPrefix, ...remainingKvParams, ...flags]` per FR-005. `vaultPrefix` is `["vault=<String(value)>"]` if and only if (post-strip) `parameters.vault !== undefined`. `remainingKvParams` is the entries of (post-strip parameters minus the vault key) in insertion order, each emitted as `"<key>=<String(value)>"`, skipping entries whose value is `undefined`.
4. Strip the keys `vault`, `file`, and `path` from a copy of `parameters` when `target_mode === "active"` (FR-003). The strip is keyed on exact case-sensitive match at the top level — substring matches like `"vault_id"` are NOT stripped (Edge Cases).
5. Collect full stdout/stderr via `Buffer.concat(...).toString("utf8")` on the `close` event (FR-007). The adapter MUST NOT classify the outcome until `close` has fired — `exit` is fired earlier and does not guarantee the streams have flushed.
6. Classify the close outcome in the strict priority order (a)→(b)→(c)→(d) per FR-008. Priority (b) is checked before priority (c) so `Error: no active file` always wins over `Error:` (FR-016(h)).
7. Preserve the input `command` string verbatim in `details.command` for all three structured rejection paths (FR-008).
8. Re-export `UpstreamError` from `src/errors.ts` (FR-011).
9. NOT register itself as an MCP tool (FR-015). The MCP server's `Server` registration list at [src/server.ts](../../../src/server.ts) MUST NOT change.
10. NOT perform input validation beyond what the TypeScript type system provides at compile time. No zod schema; no runtime checks (Principle III, spec Assumptions).
11. NOT log. The adapter has no `Logger` dependency in `InvokeCliDeps` (spec Assumptions).
12. NOT serialize or queue concurrent calls. Each call is independent; the adapter is reentrant.
13. NOT implement timeout, output cap, or `AbortController` integration (Out-of-Scope). The caller wraps these in if needed.

## Test coverage requirements (Principle II)

[src/cli-adapter/cli-adapter.test.ts](../../../src/cli-adapter/cli-adapter.test.ts) MUST cover, at minimum, the ten cases enumerated in FR-016(a)–(j):

| Case | Path | Asserts |
|------|------|---------|
| (a) | Happy / specific mode | argv `["read", "vault=MyVault", "file=Note"]`, resolves `{ stdout, stderr }`. |
| (b) | Happy / active mode (vault + file strip) | argv `["<command>", "lines=5"]`, resolves. |
| (c) | Happy / active mode (path strip) | argv `["<command>", "query=q"]`, resolves. |
| (d) | Failure / non-zero exit | rejects `UpstreamError` `code: "CLI_NON_ZERO_EXIT"`, `details.exitCode: 1`, `details.stderr: "boom"`, `details.command` matches input. |
| (e) | Failure / `ERR_NO_ACTIVE_FILE` | rejects `UpstreamError` `code: "ERR_NO_ACTIVE_FILE"`, `details.exitCode: 0`, `details.message: "Error: no active file"`, `.message` property is the recovery-instruction string verbatim. |
| (f) | Failure / `CLI_REPORTED_ERROR` | rejects `UpstreamError` `code: "CLI_REPORTED_ERROR"`, `details.message: "Error: File not found"`. |
| (g) | Boundary / undefined parameter values | argv `["<command>", "vault=V", "query=q"]` (no `file=` token). |
| (h) | Boundary / priority (b) beats (c) | `stdout: "Error: no active file. Open one or use specific mode.\n"` → `code: "ERR_NO_ACTIVE_FILE"` (NOT `CLI_REPORTED_ERROR`). |
| (i) | Boundary / priority (a) beats (b) | exit `1` with `stdout: "Error: no active file\n"` → `code: "CLI_NON_ZERO_EXIT"` (NOT `ERR_NO_ACTIVE_FILE`). |
| (j) | Boundary / signal-only termination | close `(code: null, signal: "SIGTERM")` → `code: "CLI_NON_ZERO_EXIT"`, `details.exitCode: -1`, `details.signal: "SIGTERM"`, `cause.exitCode: -1`, `cause.signal: "SIGTERM"`. |

All ten use a stub `spawnFn` injected via `deps.spawnFn` per Q1 — no real CLI binary involved. Implementers SHOULD add supplementary cases for the Story 1 AC #2 (flags after kv pairs) and AC #4 (vault-hoist regardless of input order), and the Story 2 AC #4 (active-mode with non-target key + flag), to maintain the project's 100% AC-to-test ratio.

The Story 4 AC #1 (re-export verification) is a typecheck-only assertion satisfied by the import line at the top of the test file:

```ts
import { invokeCli, UpstreamError } from "./cli-adapter.js";
```

If both names resolve at compile time, the AC is satisfied. No runtime test needed.

## Validation (acceptance criteria for the contract)

After this contract is implemented and the ten enumerated tests pass, the contract MUST satisfy:

- The exported `invokeCli` function has the signature `(input: InvokeCliInput, deps?: InvokeCliDeps) => Promise<InvokeCliSuccess>` with no other overloads.
- The `TargetMode` type is exactly the union `"specific" | "active"` (no widening to `string`, no additional members).
- The four reachable rejection codes are exactly `CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND` — no other `UpstreamError.code` value is reachable from inside the adapter.
- The MCP server's tool registration list at [src/server.ts](../../../src/server.ts) is unchanged from its pre-feature state — adapter is internal (FR-015).
- `UpstreamError` is importable from the adapter module (re-export, FR-011).
