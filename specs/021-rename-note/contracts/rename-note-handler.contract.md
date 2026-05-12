# Contract: `rename_note` Handler

**Branch**: `021-rename-note` | **Date**: 2026-05-12 | **Spec**: [spec.md](../spec.md)

This is the internal handler contract for the `rename_note` MCP tool. The handler is the thin transformation layer between the validated zod input and the cli-adapter. Every behaviour locked here is verified by a co-located test (`handler.test.ts`).

## Handler signature

```typescript
// src/tools/rename_note/handler.ts
// Original — no upstream. rename_note handler: thin transformer routing parsed input through invokeCli — argv assembly (file/path/name parameters; no PSR-5 rename per F1), appendMdIfMissing helper per /speckit-clarify Q1, parseRenameResponse locked against T0-captured wording per R8.
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import type { RenameNoteInput, RenameNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeRenameNote(
  input: RenameNoteInput,
  deps: ExecuteDeps,
): Promise<RenameNoteOutput>;
```

## Deps shape

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `logger` | `Logger` | `src/server.ts` shared instance | Forwarded to the cli-adapter for `dispatchTimeout` / `dispatchCap` / `dispatchKill` events |
| `queue` | `Queue` | `src/server.ts` shared instance | Single-in-flight CLI queue; serializes calls across all CLI-invoking tools per FR-008 |
| `spawnFn` | `SpawnLike` (optional) | Tests inject; production uses `child_process.spawn` default | Test seam — handler tests assert on the spawn's argv |
| `env` | `NodeJS.ProcessEnv` (optional) | Tests inject; production uses `process.env` default | Test seam for OBSIDIAN_BIN override etc. |

## `appendMdIfMissing` helper contract

File-local helper in `handler.ts`. ~3 LOC.

```typescript
function appendMdIfMissing(name: string): string {
  return name.endsWith(".md") ? name : name + ".md";
}
```

**Invariants** (locked at /speckit-clarify Q1, session 2026-05-12; mirrors 020-fix-write-gaps R2):

- Literal byte equality. Case-sensitive. `"Renamed.MD"` does NOT satisfy `endsWith(".md")`.
- No regex; no `path.extname`; no normalisation.
- Internal periods preserved: `"Doc.v1.draft"` does NOT have `.draft` detected as an extension.
- Only `.md` triggers verbatim forwarding. Any other trailing segment (`.canvas`, `.pdf`, `.png`, `.txt`, etc.) gets `.md` appended.
- Idempotent under repeated application: `appendMdIfMissing(appendMdIfMissing(x)) === appendMdIfMissing(x)` for all `x`.

**Worked examples table** (matches the data-model truth table):

| Input | Output | Reason |
|-------|--------|--------|
| `"Fixed"` | `"Fixed.md"` | No `.md` suffix |
| `"Fixed.md"` | `"Fixed.md"` | Verbatim |
| `"Doc.v1.draft"` | `"Doc.v1.draft.md"` | `.draft` ≠ `.md` (case-sensitive) |
| `"Renamed.MD"` | `"Renamed.MD.md"` | `.MD` ≠ `.md` (case-sensitive) |
| `"Sketch.canvas"` | `"Sketch.canvas.md"` | `.canvas` ≠ `.md`; cross-extension renames out of scope |
| `"image.png"` | `"image.png.md"` | `.png` ≠ `.md`; non-`.md` filename targets out of scope |
| `"日記"` | `"日記.md"` | UTF-8 bytes forwarded verbatim plus `.md` |

The helper never sees the empty string or `name` values containing `/` or `\` — those are rejected at the schema layer per /speckit-clarify Q2.

## `parseRenameResponse` helper contract

File-local helper in `handler.ts`. Locked against the T0-captured CLI response wording per R8.

```typescript
const RESPONSE_RE = /^<T0-LOCKED-PATTERN>$/m; // e.g. /^Renamed: (.+?) → (.+?)\s*$/m
function parseRenameResponse(stdout: string): { fromPath: string; toPath: string } {
  const match = stdout.trimStart().match(RESPONSE_RE);
  if (match) return { fromPath: match[1]!, toPath: match[2]! };
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stdout },
    message: `rename_note could not parse CLI response: ${stdout.trimStart().slice(0, 200)}`,
  });
}
```

**Invariants**:
- Single regex match against the trimmed stdout.
- Two capture groups: `fromPath` (index 1) and `toPath` (index 2).
- Failure to match → throws `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `details.stdout` containing the unparsable raw stdout.
- No trimming, normalisation, or post-processing of the captured paths — propagated verbatim.

The regex pattern itself is finalised at T0 of /speckit-implement when the CLI's verbatim success wording is captured. Anticipated shapes (in order of likelihood per existing 012-delete-note precedent):

1. `Renamed: <from> → <to>` (Unicode arrow `→`)
2. `Renamed: <from> to <to>` (ASCII "to")
3. Two-line shape (one path per line, prefixed with `Old: ` / `New: ` or similar)

The handler's test seam (`handler.test.ts` cases #9 + #18) feeds stub stdout matching the locked shape and a stub stdout that doesn't match (asserting the `CLI_REPORTED_ERROR` fallback).

## Argv shape table (exhaustive)

Every valid `RenameNoteInput` produces exactly ONE `invokeCli` call with the following shape:

| Input | `invokeCli` call shape |
|-------|------------------------|
| `{ target_mode: "specific", vault: "V", path: "P.md", name: "X" }` | `{ command: "rename", vault: "V", parameters: { path: "P.md", name: "X.md" }, flags: [], target_mode: "specific" }` |
| `{ target_mode: "specific", vault: "V", path: "P.md", name: "X.md" }` | `{ command: "rename", vault: "V", parameters: { path: "P.md", name: "X.md" }, flags: [], target_mode: "specific" }` |
| `{ target_mode: "specific", vault: "V", file: "F", name: "X" }` | `{ command: "rename", vault: "V", parameters: { file: "F", name: "X.md" }, flags: [], target_mode: "specific" }` |
| `{ target_mode: "specific", vault: "V", file: "F", name: "X.canvas" }` | `{ command: "rename", vault: "V", parameters: { file: "F", name: "X.canvas.md" }, flags: [], target_mode: "specific" }` (cross-extension narrowing per /speckit-clarify Q1) |
| `{ target_mode: "active", name: "X" }` | `{ command: "rename", vault: undefined, parameters: { name: "X.md" }, flags: [], target_mode: "active" }` |
| `{ target_mode: "active", name: "X.md" }` | `{ command: "rename", vault: undefined, parameters: { name: "X.md" }, flags: [], target_mode: "active" }` |

**Notes**:
- `vault` is hoisted to the top-level `invokeCli` argument (per 011-write-note PSR-3), NOT inside `parameters`. The cli-adapter assembles argv from the top-level `vault` field.
- `flags` is always `[]` — `rename` has no documented flags per F1.
- `parameters` contains exactly the locator (`file` OR `path`, never both) and `name`. Active mode has only `name`.
- The cli-adapter's `stripTargetLocators` defence-in-depth strip removes `vault`/`file`/`path` from `parameters` in active mode — a redundant safety net since the schema layer already rejected them.

## Single-spawn invariant (R9)

Every `rename_note` request fires exactly ONE `invokeCli` call. Handler tests assert `spawnFn.callCount === 1` per request.

This invariant composes with the existing single-in-flight CLI queue. The queue ensures cross-tool serialization (e.g., a concurrent `delete_note` against the same vault waits for the rename to complete); the single-spawn invariant ensures `rename_note` itself doesn't internally fan out.

## Failure propagation chain

```text
spawnFn → cli-adapter → invokeCli → handler → registerTool → MCP wire
                  ↓
   classified as one of:
   - CLI_BINARY_NOT_FOUND (ENOENT)
   - CLI_NON_ZERO_EXIT (exit ≠ 0)
   - CLI_REPORTED_ERROR (stdout matches "Error: " classifier OR matches 011-R5 unknown-vault inspection)
   - ERR_NO_ACTIVE_FILE (stdout/stderr matches "Error: no active file")
                  ↓
   thrown as UpstreamError
                  ↓
   handler does NOT catch; rethrows
                  ↓
   registerTool catches UpstreamError → asToolError({ code, message, details })
                  ↓
   MCP response with isError: true and the structured error payload
```

Non-`UpstreamError` exceptions escape the chain verbatim — the handler does NOT wrap them with `asToolError` (Story 7 AC#4 / parity with 011/012/015 precedent).

## Handler body sketch

```typescript
export async function executeRenameNote(
  input: RenameNoteInput,
  deps: ExecuteDeps,
): Promise<RenameNoteOutput> {
  const forwardedName = appendMdIfMissing(input.name);
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          ...(input.file !== undefined ? { file: input.file } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
          name: forwardedName,
        }
      : { name: forwardedName };
  const { stdout } = await invokeCli(
    {
      command: "rename",
      vault: input.target_mode === "specific" ? input.vault! : undefined,
      parameters,
      flags: [],
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
  const { fromPath, toPath } = parseRenameResponse(stdout);
  return { renamed: true, fromPath, toPath };
}
```

Estimated body LOC: ~30 (function body excluding helper and types). Combined with imports, types, header comment, helpers, and `RESPONSE_RE`: ~60 LOC total in `handler.ts`. SC-007 ceiling is ≤60 LOC; this fits.

## Test seam pattern

Tests inject `deps.spawnFn` via the existing convention. Each handler test follows this shape:

```typescript
import { describe, it, expect, vi } from "vitest";
import { executeRenameNote } from "./handler.js";
// ... fixture setup ...

it("forwards name with .md appended", async () => {
  const spawnFn = vi.fn(() => mockSuccessfulSpawn("Renamed: Inbox/Typo.md → Inbox/Fixed.md\n"));
  const result = await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Inbox/Typo.md", name: "Fixed" },
    { logger: stubLogger, queue: stubQueue, spawnFn },
  );
  expect(spawnFn).toHaveBeenCalledTimes(1);
  expect(spawnFn.mock.calls[0][1]).toContain("name=Fixed.md");
  expect(result).toEqual({ renamed: true, fromPath: "Inbox/Typo.md", toPath: "Inbox/Fixed.md" });
});
```

Three things every handler test asserts:
1. `spawnFn` was called exactly ONE time (single-spawn invariant per R9).
2. The argv contains the expected tokens (per the argv shape table above).
3. The handler's return value matches the expected `RenameNoteOutput` shape.

For failure-path tests: assert `spawnFn` was still called once, but the mock raises an `UpstreamError`; assert the handler propagates verbatim (no wrapping).

## Response-parsing test fixtures

The T0-captured response wording locks the regex pattern. Until T0 completes, the handler tests use a placeholder pattern; T0 task in /speckit-tasks updates the regex and the test fixtures together. Anticipated fixture shapes:

```typescript
const SUCCESS_STDOUT_FIXTURE = "Renamed: Inbox/Typo.md → Inbox/Fixed.md\n"; // T0-LOCKED
const SAME_NAME_STDOUT_FIXTURE = "Renamed: Inbox/Note.md → Inbox/Note.md\n"; // T0 verifies whether CLI reports same-name as success
const UNPARSABLE_STDOUT_FIXTURE = "OK\n"; // pathological case — CLI didn't echo paths
```

## Cross-failure-type field-name parity

The error response's `details` shape varies per failure code (the cli-adapter governs this). The cross-failure-type contract is on field-name parity for the load-bearing fields:

- `CLI_BINARY_NOT_FOUND`: `{ platform, attempts, PATH }` (per 017-cross-platform-support)
- `CLI_NON_ZERO_EXIT`: `{ exitCode, stderr, stdout }` (per cli-adapter)
- `CLI_REPORTED_ERROR`: `{ message }` (verbatim CLI line) — plus optional `{ stdout }` for the parse-failure case at the `parseRenameResponse` layer
- `ERR_NO_ACTIVE_FILE`: per cli-adapter contract

No `rename_note`-specific `details` extensions. The handler propagates whatever the adapter raises.

## Compatibility invariants

- No `parameters` keys other than `file`, `path`, `name`. The CLI's documented argv shape per F1 forbids anything else.
- `vault` always top-level (never duplicated into `parameters`).
- `flags` always `[]`.
- `command` always `"rename"`.
- Active mode always omits `vault` AND locator parameters; only `name` is in `parameters`.

Any deviation from this shape is a constitution-layer drift and a SC-009 violation (existing tools' behaviour change).

## Plan-stage research dependencies

This contract assumes:
- F1 captured at plan stage: `rename` subcommand exists with parameters `file=`, `path=`, `name=`. **VERIFIED 2026-05-12** via `obsidian help`.
- R8 deferred to T0: `parseRenameResponse` regex pattern. **PENDING T0 of /speckit-implement**.
- R5 inherited from cli-adapter (011-R5 unknown-vault response inspection). **VERIFIED at T0 cases (vii)** — confirm signature match with create / delete subcommands.

If any of these assumptions break at T0, the handler contract is amended pre-merge per the FR-019 amendment-before-ship clause.
