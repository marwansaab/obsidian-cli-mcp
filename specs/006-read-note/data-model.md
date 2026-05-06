# Phase 1 Data Model — Read Note Typed MCP Tool

**Branch**: `006-read-note` | **Date**: 2026-05-06 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Purpose

Document the typed shapes that flow through the read_note module's public and internal interfaces — the input schema (a re-export of the target-mode primitive per P1), the handler's I/O shape, the registration deps, the FR-017 log-event payloads, and the test coverage map. This is the structural inventory; per-symbol behaviour and contracts live in [contracts/read-note.contract.md](./contracts/read-note.contract.md).

No new error codes are introduced — see the bottom of this document for the error-code roster (carried verbatim from the foundation features). The errors-contract patch file that 002/003/005 introduced is deliberately absent here because zero new codes ship.

---

## 1. Input schema — `readNoteInputSchema`

**Location**: [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts) (NEW)

**Tactic** (per P1 in [research.md](./research.md)): re-export of `targetModeSchema` from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts).

```typescript
// Original — no upstream. read_note input schema: re-export of the target-mode primitive (BI-029) — read_note adds zero tool-specific fields, so the primitive IS the schema.
import { targetModeSchema, type TargetMode } from "../../target-mode/target-mode.js";
import { zodToJsonSchema } from "zod-to-json-schema";

export const readNoteInputSchema = targetModeSchema;
export type ReadNoteInput = TargetMode;
export const readNoteInputJsonSchema = zodToJsonSchema(readNoteInputSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;
```

### Discriminated-union shape

The schema is a `z.discriminatedUnion("target_mode", […])` with a union-level `superRefine` dispatcher (per the primitive's own structure at [target-mode.ts:84-95](../../src/target-mode/target-mode.ts#L84-L95)). The two branches:

| Branch | `target_mode` literal | Required fields | Optional fields | Forbidden fields | Refinement |
|--------|-----------------------|-----------------|-----------------|------------------|------------|
| Specific | `"specific"` | `vault: z.string().min(1)` | `file?: z.string()`, `path?: z.string()` | (none — `.passthrough()`) | exactly one of `file` or `path` MUST be provided |
| Active | `"active"` | (none beyond discriminator) | (none — `.passthrough()`) | `vault`, `file`, `path` (presence rejected) | none beyond the forbidden-key check |

(Same as the primitive — read_note inherits the entire contract.)

### Inferred type

```typescript
export type ReadNoteInput = TargetMode;
// = z.infer<typeof targetModeSchema>
// = { target_mode: "specific"; vault: string; file?: string; path?: string } | { target_mode: "active" }
// (with passthrough — additional unknown keys are structurally accepted but not reflected in the type)
```

### JSON Schema export

`readNoteInputJsonSchema` is the result of `zodToJsonSchema(readNoteInputSchema, { $refStrategy: "none" })`. It is the **pre-strip** form — the registration site at [src/tools/read_note/tool.ts](../../src/tools/read_note/tool.ts) passes it through `stripSchemaDescriptions` from [src/help/strip-schema.ts](../../src/help/strip-schema.ts) before publishing as `descriptor.inputSchema`. Per FR-003, the schema carries zero `.describe()` annotations — so the strip is a structural no-op for read_note today, but applying it preserves the registration-site contract from BI-030 and guards against a future amendment that adds annotations.

### Validation rules — summary

(Inherited from the primitive; restated here for review-readability.)

1. `target_mode` MUST be the literal string `"specific"` or `"active"`.
2. In specific mode: `vault` MUST be a non-empty string; exactly one of `file`/`path` MUST be present (provided ≠ undefined).
3. In active mode: none of `vault`/`file`/`path` MAY be present (`Object.hasOwn` check, including explicit-`undefined` values).
4. Empty-string `file` and `path` are structurally valid in specific mode (per Clarifications Q3) — the CLI receives `file=` / `path=` and surfaces the failure as `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR`.
5. Unknown extra keys are accepted (`.passthrough()`) but are NOT forwarded to the CLI — the handler reads only the schema-typed fields.

---

## 2. Handler I/O — `executeReadNote`

**Location**: [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) (NEW)

**Signature**:

```typescript
export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export interface ReadNoteOutput {
  content: string;
}

export function executeReadNote(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput>;
```

`SpawnLike` is imported from `../../cli-adapter/cli-adapter.js`; `Logger` from `../../logger.js`; `Queue` from `../../queue.js`. The optional `spawnFn` and `env` fields are pass-throughs to the cli-adapter's deps surface — same shape as obsidian_exec's `ExecuteDeps` at [src/tools/obsidian_exec/handler.ts:24-29](../../src/tools/obsidian_exec/handler.ts#L24-L29).

### Behavior

The handler:

1. Generates a `callId` via `randomUUID()` from `node:crypto`.
2. Records `startedAt = Date.now()`.
3. Computes `queueDepth = Math.max(0, deps.queue.depth() - 1)` (mirrors [obsidian_exec handler.ts:69](../../src/tools/obsidian_exec/handler.ts#L69)).
4. Derives `locator` ∈ `{"file", "path", "active"}` from the input.
5. Derives `vault` for the log payload: `parsed.target_mode === "specific" ? parsed.vault : null`.
6. Calls `deps.logger.callStart({ callId, command: "read", vault, queueDepth, locator })`.
7. Inside `deps.queue.run(...)`:
   a. Builds the `parameters` record per FR-006:
      - Specific mode: `{ vault: parsed.vault, ...(parsed.file !== undefined ? { file: parsed.file } : {}), ...(parsed.path !== undefined ? { path: parsed.path } : {}) }`.
      - Active mode: `{}` (empty).
   b. Calls `await invokeCli({ command: "read", parameters, flags: [], target_mode: parsed }, { spawnFn: deps.spawnFn, env: deps.env })`.
8. On success: emits `deps.logger.callEndSuccess({ callId, durationMs: Date.now() - startedAt, stdoutBytes: Buffer.byteLength(stdout, "utf8") })` and returns `{ content: stdout }`.
9. On `UpstreamError`: emits `deps.logger.callEndFailure({ callId, errorCode: err.code, durationMs: Date.now() - startedAt })` and re-throws.
10. On other errors: re-throws WITHOUT emitting a log event (mirrors obsidian_exec's behaviour for unclassified throws — surfaces as a runtime SDK error envelope).

### Output shape

```typescript
interface ReadNoteOutput {
  content: string;
}
```

Mapped to the MCP tool-call envelope by `tool.ts`'s registration handler:

```typescript
{ content: [{ type: "text" as const, text: JSON.stringify({ content: output.content }) }] }
```

(Per FR-007 — text-envelope JSON-stringified, mirroring the obsidian_exec precedent.)

### Body line count

Target: ≲ 50 lines per SC-007. Estimate breakdown:
- Imports + interface declarations: ~12 lines.
- Function body: `randomUUID` + `startedAt` + `queueDepth` + `locator` derivation + `vault` derivation + `callStart` emit + `try` block with `invokeCli` + success path emit + return + `catch (UpstreamError)` failure-path emit + re-throw + `catch (other)` re-throw: ~30 lines.
- Total: ~42 lines (under the SC-007 ceiling).

---

## 3. RegisterDeps — `registerReadNoteTool`

**Location**: [src/tools/read_note/tool.ts](../../src/tools/read_note/tool.ts) (NEW)

**Signature**:

```typescript
export interface RegisterDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export function registerReadNoteTool(deps: RegisterDeps): RegisteredTool;
```

`RegisteredTool` is imported from `../_shared.js`. The shape mirrors `registerObsidianExecTool`'s `RegisterDeps` at [src/tools/obsidian_exec/tool.ts:18-21](../../src/tools/obsidian_exec/tool.ts#L18-L21) exactly.

### Constants

```typescript
export const READ_NOTE_TOOL_NAME = "read_note";

export const READ_NOTE_DESCRIPTION =
  'Read a note from an Obsidian vault. Returns the note\'s raw UTF-8 text as { content: <stdout> }. Specific mode: vault + exactly one of file (wikilink) or path (vault-relative). Active mode: no locator — reads the focused note. Call help({ tool_name: "read_note" }) for full parameter docs and the error-code roster.';
```

(Per P2 in [research.md](./research.md) — pinned 270-char description.)

### Returned `RegisteredTool` shape

```typescript
{
  descriptor: {
    name: "read_note",
    description: READ_NOTE_DESCRIPTION,
    inputSchema: stripSchemaDescriptions(readNoteInputJsonSchema as JsonSchemaObject) as Record<string, unknown>,
  },
  handler: async (args: unknown) => {
    // 1. Try schema parse → on ZodError, return asToolError({ code: "VALIDATION_ERROR", … })
    // 2. Call executeReadNote(parsed, deps)
    // 3. On success, return { content: [{ type: "text", text: JSON.stringify({ content: result.content }) }] }
    // 4. On UpstreamError, return asToolError({ code, message, details })
    // 5. On non-UpstreamError, re-throw (matches obsidian_exec precedent at src/tools/obsidian_exec/tool.ts:59)
  },
}
```

The handler closure captures `deps` from `registerReadNoteTool`'s parameter — `executeReadNote(parsed, deps)` is called with the same deps object passed into registration, so the queue and logger flow through.

---

## 4. FR-017 log-event payload shapes

Per P4 in [research.md](./research.md):

| Event | Payload TypeScript shape |
|-------|--------------------------|
| `callStart` | `{ callId: string, command: "read", vault: string \| null, queueDepth: number, locator: "file" \| "path" \| "active" }` |
| `callEndSuccess` | `{ callId: string, durationMs: number, stdoutBytes: number }` |
| `callEndFailure` | `{ callId: string, errorCode: string, durationMs: number }` |

The `Logger` type from [src/logger.ts](../../src/logger.ts) defines the methods these events flow through. **No amendment to Logger is required by this BI** — the existing surface accepts arbitrary structured payloads. (If the typecheck rejects the `locator` extra at the existing `callStart` signature, P4 falls back to omitting `locator` and the discrepancy is resolved in the implementation step. Plan-stage assumption is that the existing signature accepts an open record.)

---

## 5. Test coverage map

22 new test bodies distributed across three co-located files. Maps each test to the spec's User Story / Acceptance Scenario / Edge Case it validates.

### `src/tools/read_note/schema.test.ts` (9 cases)

| # | Test name | Story / AC | Input | Expected |
|---|-----------|-----------|-------|----------|
| 1 | parses specific+file happy path | Story 1 AC#1 | `{ target_mode: "specific", vault: "MyVault", file: "Recipe" }` | `success: true`, parsed shape matches input |
| 2 | parses specific+path happy path | Story 2 AC#1 | `{ target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" }` | `success: true` |
| 3 | parses active happy path | Story 3 AC#1 | `{ target_mode: "active" }` | `success: true` |
| 4 | rejects neither file nor path | Story 4 AC#1 | `{ target_mode: "specific", vault: "MyVault" }` | `success: false`, issue message contains `"exactly one of"` |
| 5 | rejects both file and path | Story 4 AC#2 | `{ target_mode: "specific", vault: "MyVault", file: "F", path: "P" }` | `success: false`, two issues with paths `["file"]` and `["path"]`, both mentioning `"exactly one of"` |
| 6 | rejects target_mode missing | Story 4 AC#3 | `{}` | `success: false`, issue path includes `"target_mode"` |
| 7 | rejects vault missing in specific | Story 4 AC#4 | `{ target_mode: "specific", file: "F" }` | `success: false`, issue path includes `"vault"` |
| 8 | rejects forbidden key in active | Story 3 AC#2 | `{ target_mode: "active", vault: "V" }` | `success: false`, issue path includes `"vault"`, message contains `"vault"` and `"active mode"` |
| 9 | rejects invalid discriminator | Story 4 AC#5 | `{ target_mode: "unknown", vault: "V", file: "F" }` | `success: false`, issue path includes `"target_mode"` with invalid-discriminator-value error |

### `src/tools/read_note/handler.test.ts` (8 cases)

All inject `deps = { logger: stubLogger, queue: createQueue(), spawnFn: stubSpawn }` per P6.

| # | Test name | Story / AC | Stub spawn returns | Expected handler result |
|---|-----------|-----------|---------------------|--------------------------|
| 1 | specific+file invokes adapter with correct argv & returns content | Story 1 IT | exit 0, stdout `"# Recipe\n\nIngredients...\n"` | `{ content: "# Recipe\n\nIngredients...\n" }`; spawn called with binary `"obsidian"` and argv `["read", "vault=MyVault", "file=Recipe"]` (vault hoisted by adapter); `callStart` + `callEndSuccess` fired |
| 2 | specific+path invokes adapter with correct argv & returns content | Story 2 IT | exit 0, stdout `"<template body>"` | `{ content: "<template body>" }`; spawn called with argv `["read", "vault=MyVault", "path=Templates/Recipe.md"]` |
| 3 | active invokes adapter with bare argv & returns content | Story 3 AC#1 | exit 0, stdout `"<active body>"` | `{ content: "<active body>" }`; spawn called with argv `["read"]` (no key=value tokens) |
| 4 | propagates CLI_NON_ZERO_EXIT | Story 5 AC#1 | exit 1, stderr `"file not found"` | throws `UpstreamError` with `code: "CLI_NON_ZERO_EXIT"`, `details.exitCode: 1`; `callEndFailure({ errorCode: "CLI_NON_ZERO_EXIT" })` fired |
| 5 | propagates CLI_REPORTED_ERROR | Story 5 AC#2 | exit 0, stdout `"Error: File not found\n"` | throws `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `details.message: "Error: File not found"`; `callEndFailure({ errorCode: "CLI_REPORTED_ERROR" })` fired |
| 6 | propagates ERR_NO_ACTIVE_FILE | Story 3 AC#3 | exit 0, stdout `"Error: no active file\n"` | throws `UpstreamError` with `code: "ERR_NO_ACTIVE_FILE"` (per cli-adapter's classification — see [003-cli-adapter spec FR-008(b)](../003-cli-adapter/spec.md)); `callEndFailure` fired |
| 7 | propagates CLI_BINARY_NOT_FOUND | Story 5 AC#3 | spawn raises `ENOENT` | throws `UpstreamError` with `code: "CLI_BINARY_NOT_FOUND"`; `callEndFailure` fired |
| 8 | empty stdout → `{ content: "" }` | Story 1 AC#2 | exit 0, stdout `""` | `{ content: "" }`; `callEndSuccess({ stdoutBytes: 0 })` fired |

### `src/tools/read_note/tool.test.ts` (5 cases)

| # | Test name | Story / AC | Assertion |
|---|-----------|-----------|-----------|
| 1 | descriptor.name === "read_note" | structural | `registerReadNoteTool({...}).descriptor.name === "read_note"` |
| 2 | descriptor.inputSchema has zero description keys at any depth | Story 6 AC#1 | recursive walk over `inputSchema.properties` / `oneOf` / `anyOf` / `items` / `additionalProperties` finds zero `description` keys |
| 3 | descriptor.description contains "help" and "read_note" | Story 6 AC#2 | `description.toLowerCase().includes("help")` AND `description.includes("read_note")` |
| 4 | registered handler returns VALIDATION_ERROR for malformed input | end-to-end Story 4 | `await registeredTool.handler({})` returns `{ isError: true, content: [...] }` whose JSON-parsed body has `code: "VALIDATION_ERROR"` |
| 5 | docs/tools/read_note.md has no stub TODO marker | FR-011 / FR-013 (e) / P7 | `readFileSync(...).toContain("<!-- TODO(BI-003)")` is false |

### Pickup by existing tests (no edits required)

| Test | What it asserts (with read_note added) |
|------|----------------------------------------|
| `src/server.test.ts` registry-consistency block | `docs/tools/read_note.md` exists; `read_note`'s `inputSchema.properties` tree is description-free at every depth |

---

## 6. Error code roster (zero new codes)

| Code | Source | When it surfaces from read_note |
|------|--------|----------------------------------|
| `VALIDATION_ERROR` | (existing — used at every tool boundary) | Zod schema rejects the input. |
| `CLI_NON_ZERO_EXIT` | [001 / errors contract](../001-add-cli-bridge/contracts/errors.contract.md) | Adapter classified non-zero exit (locator does not resolve, etc.). |
| `CLI_REPORTED_ERROR` | [002 / errors contract](../002-detect-cli-errors/contracts/errors.contract-patch.md) | Exit 0 with `Error:` prefix on stdout. |
| `ERR_NO_ACTIVE_FILE` | [003 / errors contract](../003-cli-adapter/contracts/errors.contract-patch.md) | Active mode + no focused note. |
| `CLI_BINARY_NOT_FOUND` | [001 / errors contract](../001-add-cli-bridge/contracts/errors.contract.md) | Obsidian CLI binary not on PATH. |
| `CLI_TIMEOUT` | [001 / errors contract](../001-add-cli-bridge/contracts/errors.contract.md) | (Possible) — adapter timeout if surfaced. Not exercised in read_note's test set since reads are bounded by the CLI's behavior; if observed, propagation is automatic via the adapter. |
| `CLI_OUTPUT_TOO_LARGE` | [001 / errors contract](../001-add-cli-bridge/contracts/errors.contract.md) | (Possible — same as above; adapter caps at 10 MiB; if a vault note exceeds that, surfaces here.) |

**Zero new codes** are added by this BI per spec Assumptions. The errors contract at [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) is unchanged.

---

## 7. State transitions

The handler is stateless. No state machine. Per call:

```
input (typed via readNoteInputSchema)
  ↓
parse (zod) — boundary 1
  ↓
locator + vault + queueDepth derivation
  ↓
logger.callStart  (side effect)
  ↓
queue.run(...) — wraps next stage
  ↓
invokeCli — boundary 2 (CLI subprocess)
  ↓
[success] → logger.callEndSuccess (side effect) → return { content: stdout }
[failure-UpstreamError] → logger.callEndFailure (side effect) → re-throw
[failure-other] → re-throw (no log event)
```

The queue (per FR-016 / P1) ensures only one `invokeCli` call is in flight at any time across the entire server (shared with `obsidian_exec`).

---

## 8. Summary of new artifacts

| Artifact | LOC est. | Header required | Test count |
|----------|----------|------------------|------------|
| `src/tools/read_note/schema.ts` | ~30 | yes (Original) | — |
| `src/tools/read_note/schema.test.ts` | ~140 | yes (Original) | 9 |
| `src/tools/read_note/handler.ts` | ~50 | yes (Original) | — |
| `src/tools/read_note/handler.test.ts` | ~150 | yes (Original) | 8 |
| `src/tools/read_note/tool.ts` | ~70 | yes (Original) | — |
| `src/tools/read_note/tool.test.ts` | ~70 | yes (Original) | 5 |
| `docs/tools/read_note.md` | ~120 | NO (Markdown exempt) | — |
| `src/server.ts` (modified) | +1 line | (existing header) | (existing test pickup) |

Total new TS source: ~270 LOC. Total new tests: ~360 LOC. Total new Markdown: ~120 LOC.
