# Contract — `read_note` MCP Tool

**Branch**: `006-read-note` | **Date**: 2026-05-06 | **Plan**: [../plan.md](../plan.md) | **Spec**: [../spec.md](../spec.md)

This contract is the binding interface description for the `read_note` MCP tool. It supersedes any wording in [../spec.md](../spec.md) where a literal conflict arises (per [Constitution v1.1.0 — "Spec-driven changes MUST pass the Constitution Check gate"](../../../.specify/memory/constitution.md)). The spec describes user value and acceptance criteria; this contract describes the binding shapes and behaviours that satisfy them.

This BI introduces **zero new error codes**. The canonical errors contract at [specs/001-add-cli-bridge/contracts/errors.contract.md](../../001-add-cli-bridge/contracts/errors.contract.md) is unchanged — no patch file ships alongside this contract. Every failure surface flows through codes already defined by 001 / 002 / 003.

---

## 1. Tool descriptor

### Name

The tool's MCP-published name is the literal string `"read_note"` (snake_case, matches the directory and file naming convention `src/tools/read_note/`).

```typescript
export const READ_NOTE_TOOL_NAME = "read_note";
```

### Top-level description

Pinned per P2:

```typescript
export const READ_NOTE_DESCRIPTION =
  'Read a note from an Obsidian vault. Returns the note\'s raw UTF-8 text as { content: <stdout> }. Specific mode: vault + exactly one of file (wikilink) or path (vault-relative). Active mode: no locator — reads the focused note. Call help({ tool_name: "read_note" }) for full parameter docs and the error-code roster.';
```

The description MUST contain the literal substring `"help"` (case-insensitive) and the literal substring `"read_note"` (case-sensitive — matches the tool's published name) per Story 6 AC#2 and BI-030 FR-015.

### Input schema (post-strip)

The descriptor's `inputSchema` is the result of:

```typescript
stripSchemaDescriptions(readNoteInputJsonSchema as JsonSchemaObject) as Record<string, unknown>
```

with `stripSchemaDescriptions` imported from [src/help/strip-schema.ts](../../../src/help/strip-schema.ts) (BI-030) and `readNoteInputJsonSchema` produced by `zodToJsonSchema(readNoteInputSchema, { $refStrategy: "none" })`.

**Structural assertions** the published `inputSchema` MUST satisfy:

1. The root JSON Schema is an `oneOf`/`anyOf` (the form `zod-to-json-schema` produces from a discriminated union).
2. One branch's `properties.target_mode.const === "specific"`; that branch declares `vault` (string, minLength 1) as required, `file` and `path` as optional strings, and additionalProperties true (passthrough). The branch carries the discriminator constraint via the `properties.target_mode.const` field.
3. One branch's `properties.target_mode.const === "active"`; that branch declares no other required fields and the same passthrough.
4. **Zero `description` keys appear at any depth** inside `properties`, `oneOf`, `anyOf`, `items`, or `additionalProperties` constructs (Story 6 AC#1, satisfied by `stripSchemaDescriptions`). The root-level `description` is preserved if present (per BI-030 FR-003); read_note ships no root-level description on the JSON Schema, so this is moot.

---

## 2. Input contract — `ReadNoteInput`

### TypeScript shape

```typescript
type ReadNoteInput =
  | { target_mode: "specific"; vault: string; file?: string; path?: string }
  | { target_mode: "active" };
```

(Inferred from `readNoteInputSchema = targetModeSchema` per P1; equivalent to `TargetMode` from BI-029.)

### Parse rules (zod)

The schema validates the following invariants and rejects with `VALIDATION_ERROR` on violation:

| Invariant | Path | Message contains |
|-----------|------|------------------|
| `target_mode` MUST be `"specific"` or `"active"` | `target_mode` | (zod's invalid-discriminator-value message) |
| In specific: `vault` MUST be a non-empty string | `vault` | (zod's `min(1)` message) |
| In specific: at least one of `file` or `path` MUST be provided | `[]` (root) | `"exactly one of \`file\` or \`path\` must be provided in specific mode (got neither)"` |
| In specific: NOT both `file` and `path` | `["file"]` AND `["path"]` (two issues) | `"exactly one of \`file\` or \`path\` must be provided in specific mode (got both)"` |
| In active: `vault` MUST NOT be present | `["vault"]` | `"vault is not allowed in active mode"` |
| In active: `file` MUST NOT be present | `["file"]` | `"file is not allowed in active mode"` |
| In active: `path` MUST NOT be present | `["path"]` | `"path is not allowed in active mode"` |

(Messages inherited from the primitive's per-branch refinement — see [src/target-mode/target-mode.ts](../../../src/target-mode/target-mode.ts).)

Empty-string `file` and `path` (`""`) are NOT rejected at the schema layer per Clarifications Q3 — they pass `z.string().optional()` and the primitive's "exactly one of" refinement counts them as "provided." The CLI receives `file=` or `path=` and surfaces the failure as `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR`.

Unknown extra keys are accepted (`.passthrough()`) and discarded by the handler — they are not forwarded to the CLI.

### Tool-call envelope

The tool is invoked through the MCP SDK's `CallToolRequest`:

```json
{
  "method": "tools/call",
  "params": {
    "name": "read_note",
    "arguments": { "target_mode": "specific", "vault": "MyVault", "file": "Recipe" }
  }
}
```

The `arguments` object passes through `readNoteInputSchema.parse()` at the top of the registered handler. On `ZodError`, the handler returns `asToolError({ code: "VALIDATION_ERROR", message: "read_note input failed schema validation", details: { issues } })` per the obsidian_exec precedent at [src/tools/obsidian_exec/tool.ts:36-43](../../../src/tools/obsidian_exec/tool.ts#L36-L43). The stub adapter MUST NOT be called when validation fails (Story 4 IT).

---

## 3. Output contract — `ReadNoteOutput` and tool-call envelope

### TypeScript shape

```typescript
interface ReadNoteOutput {
  content: string;
}
```

### MCP tool-call response (success path)

```typescript
{
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({ content: <stdout> })
    }
  ]
}
```

`<stdout>` is the verbatim UTF-8 text emitted by the Obsidian CLI's `read` subcommand, captured by the cli-adapter and returned via `invokeCli({...}).stdout`. The handler MUST NOT trim, transform, normalize line endings, strip BOMs, or post-process the stdout in any way (FR-007). Empty stdout produces `{ content: "" }` — empty notes are a successful read (Story 1 AC#2).

### MCP tool-call response (failure path)

For every failure surface (zod parse, adapter classification), the handler returns the `asToolError(...)` envelope:

```typescript
{
  isError: true as const,
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({ code, message, details })
    }
  ]
}
```

Codes propagated from the cli-adapter (`CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`) carry their original `message` and `details` from the adapter — **read_note does NOT rewrite them.** See `errors.contract.md` for the canonical `details` shapes per code.

For non-`UpstreamError` exceptions (e.g., a programmer error in the handler), the handler re-throws WITHOUT wrapping AND WITHOUT emitting `callEndFailure` (mirrors [obsidian_exec tool.ts:59](../../../src/tools/obsidian_exec/tool.ts#L59)). The MCP SDK's outer error envelope handles the unhandled throw. This contract is verified by handler test #9 (Story 5 AC#4) — reference-equality on the rethrown exception plus negative assertions that no log event was emitted.

---

## 4. CLI invocation contract

### Adapter call shape

```typescript
import { invokeCli } from "../../cli-adapter/cli-adapter.js";

const { stdout } = await deps.queue.run(() =>
  invokeCli(
    {
      command: "read",
      parameters,        // see below
      flags: [],         // read_note ships no flags in this BI
      target_mode: parsed,
    },
    { spawnFn: deps.spawnFn, env: deps.env },
  ),
);
```

### `parameters` derivation

| Mode | `parameters` |
|------|--------------|
| Specific | `{ vault: parsed.vault, ...(parsed.file !== undefined ? { file: parsed.file } : {}), ...(parsed.path !== undefined ? { path: parsed.path } : {}) }` |
| Active | `{}` (empty record) |

The cli-adapter's argv-assembly contract (BI-028 FR-005) handles vault hoisting in specific mode (`vault=…` first key=value position) and target-locator stripping in active mode (per the adapter's defensive strip — read_note's schema layer rejects forbidden keys, but the adapter's strip is the second line of defense).

### `flags`

Always `[]`. Read_note ships zero CLI flags in this BI (per Out of Scope: "Adding flags to the `read` subcommand"). A future amendment that adds e.g., a `--no-frontmatter` toggle is out of scope here.

### `target_mode`

The validated input is passed through directly. The adapter inspects `target_mode.target_mode` to decide active-mode argv stripping vs. specific-mode pass-through.

---

## 5. Queue contract — FR-016

The handler MUST execute the `invokeCli` call inside `deps.queue.run(() => …)`. The queue is the single-in-flight CLI serializer that gates `obsidian_exec` today.

```typescript
return deps.queue.run(() => invokeCli({ … }, deps));
```

`src/server.ts` MUST construct ONE `Queue` instance and pass it to BOTH `registerObsidianExecTool` AND `registerReadNoteTool`:

```typescript
const queue = createQueue();
const tools: RegisteredTool[] = [
  registerHelpTool(),
  registerObsidianExecTool({ logger, queue }),
  registerReadNoteTool({ logger, queue }),
];
```

(Plus any future typed-tool registrations, all sharing the same queue.)

The queue's `depth()` method is consumed in the FR-017 `callStart` payload to compute `queueDepth`.

---

## 6. Logger contract — FR-017

The handler MUST emit exactly three structured log events per call:

| Position | Event | Payload |
|----------|-------|---------|
| Before `queue.run` | `logger.callStart` | `{ callId, command: "read", vault, queueDepth, locator }` |
| On success path (after `invokeCli` returns) | `logger.callEndSuccess` | `{ callId, durationMs, stdoutBytes }` |
| On `UpstreamError` thrown by adapter | `logger.callEndFailure` | `{ callId, errorCode, durationMs }` |

`callId` is a fresh `randomUUID()` per call. `vault` is `parsed.vault` in specific mode, `null` in active. `queueDepth` is `Math.max(0, deps.queue.depth() - 1)` (the `-1` accounts for the current call already being in the queue). `locator` is `"file"` / `"path"` / `"active"` per P4. `durationMs` is `Date.now() - startedAt`. `stdoutBytes` is `Buffer.byteLength(stdout, "utf8")` (NOT `stdout.length`). `errorCode` is the propagated `UpstreamError.code`.

Non-`UpstreamError` exceptions DO NOT emit a log event — they re-throw and the SDK's error envelope handles them. (This matches obsidian_exec's behaviour; emitting a `callEndFailure` for an unclassified throw would imply a structured-error code that doesn't exist.)

---

## 7. Test requirements

The contract is verified by 23 new test bodies + 2 picked up by existing tests, distributed per the [data-model.md test coverage map](../data-model.md#5-test-coverage-map). Summary:

| File | New cases |
|------|-----------|
| `src/tools/read_note/schema.test.ts` | 9 |
| `src/tools/read_note/handler.test.ts` | 9 (includes the Story 5 AC#4 non-`UpstreamError` re-throw test added by /speckit-analyze C2 remediation) |
| `src/tools/read_note/tool.test.ts` | 5 (case #5 strengthened per /speckit-analyze L5 to assert the full Story 6 AC#3 doc-content list) |
| `src/server.test.ts` | 0 (existing registry-consistency block picks up `read_note` automatically) |

The existing registry-consistency block at [src/server.test.ts](../../../src/server.test.ts) (per BI-030 FR-017 / SC-011) asserts:

1. `docs/tools/read_note.md` exists at the expected path (registry → docs mapping).
2. The `read_note` descriptor's `inputSchema.properties` tree contains zero `description` keys at any depth (bypass-detection of the strip utility).

Both assertions pick up `read_note` once it's added to `src/server.ts`'s `tools` array; **no edits to `src/server.test.ts` are required by this BI**.

---

## 8. Documentation requirement — `docs/tools/read_note.md`

The existing stub at `docs/tools/read_note.md` (carrying the `<!-- TODO(BI-003): … -->` marker per BI-030 FR-012) is REPLACED with a populated body matching the section ordering of [P5 in research.md](../research.md#p5--docstoolsread_notemd-body-structure):

1. Overview
2. Input Schema
3. Output
4. Errors (table)
5. Examples (3 — one per branch)
6. References

The file MUST NOT carry a `// Original — no upstream.` header (per BI-030 FR-019, Markdown is exempt). The file MUST NOT contain the substring `<!-- TODO(BI-003)`.

`help({ tool_name: "read_note" })` after this BI lands returns this file's full body — a verifier can call the help tool end-to-end and inspect the response.

---

## 9. Constitution compliance

| Principle | Satisfied by | Verification |
|-----------|--------------|--------------|
| I (Modular Code Organization) | Per-surface module at `src/tools/read_note/` with `schema/handler/tool` files; downward-only imports | Inspection + grep |
| II (Public Surface Test Coverage) | 22 new co-located test bodies covering happy + failure + boundary paths; ≥1 happy AND ≥1 failure per surface | Test count + per-test mapping |
| III (Boundary Input Validation with Zod) | `readNoteInputSchema` (re-export of `targetModeSchema`) is the single source of truth; types via `z.infer`; no `.describe()`; no hand-written interfaces | grep for `interface ReadNote`, `type ReadNote… =`, `.describe(`; SC-004 + SC-005 |
| IV (Explicit Upstream Error Propagation) | Every failure flows through `asToolError`; `UpstreamError` codes propagated verbatim; zero new codes; non-`UpstreamError` re-thrown | grep for `throw new Error`; canonical errors contract unchanged |
| V (Attribution & Layered Composition Transparency) | Every new `.ts` file carries `// Original — no upstream.` header; Markdown exempt | Inspection — every header present |

All five principles bind `Y`. No Complexity Tracking entries needed in the plan.
