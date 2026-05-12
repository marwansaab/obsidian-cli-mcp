# Contract — `write_property` handler

Handler invariants for `executeWriteProperty(input, deps): Promise<WritePropertyOutput>` in [src/tools/write_property/handler.ts](../../../src/tools/write_property/handler.ts). Locked at plan stage per the R3 / R6 / R10 / R11 / R13 / R15 / R16 design decisions in [research.md](../research.md).

## Signature

```typescript
export async function executeWriteProperty(
  input: WritePropertyInput,
  deps: ExecuteDeps,
): Promise<WritePropertyOutput>;

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}
```

`input` is the already-zod-validated input from `registerTool`'s `schema.parse` step. The handler trusts validated input per Constitution Principle III.

## Invocation flow

```text
                      executeWriteProperty(input, deps)
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
         target_mode === "active"          target_mode === "specific"
                │                                 │
                │                ┌────────────────┴────────────────┐
                │                │                                 │
                │           input.path !== undefined?          input.file !== undefined?
                │                │                                 │
                ▼                ▼                                 ▼
        ┌─────────────┐    ┌──────────────┐                ┌──────────────────┐
        │ Call 1: eval│    │  one-call    │                │ Call 1: file     │
        │ FIXED_TPL   │    │  (path mode) │                │ subcommand       │
        │ → {path,vlt}│    │              │                │ → TSV → path     │
        │ or null     │    │              │                │                  │
        └──────┬──────┘    └──────┬───────┘                └────────┬─────────┘
               │                  │                                 │
        path === null?            │                                 │
               │                  │                                 │
       yes ────┤                  │                                 │
       throw   │                  │                                 │
       ERR_NO_ │                  │                                 │
       ACTIVE  │                  │                                 │
       FILE    │                  │                                 │
               │                  │                                 │
               ▼                  ▼                                 ▼
        ┌─────────────────────────────────────────────────────────────┐
        │ Call B: property:set                                         │
        │   vault=<resolved>                                           │
        │   path=<resolved>                                            │
        │   name=<input.name>                                          │
        │   value=<serialised>                                         │
        │   [type=<inferred or explicit>]                              │
        └──────────────────────────────┬──────────────────────────────┘
                                       │
                                       ▼
                          return { written: true, path, name }
```

## Per-mode call shape

### Specific + path (ONE call)

```typescript
await invokeCli({
  command: "property:set",
  vault: input.vault!,
  parameters: {
    name: input.name,
    value: serialiseValue(input.value),
    ...(resolvedType ? { type: resolvedType } : {}),
    path: input.path!,
  },
  flags: [],
  target_mode: "specific",
}, adapterDeps);
```

### Specific + file (TWO calls)

**Call 1** — wikilink → canonical path:
```typescript
const fileInfo = await invokeCli({
  command: "file",
  vault: input.vault!,
  parameters: { file: input.file! },
  flags: [],
  target_mode: "specific",
}, adapterDeps);
const canonicalPath = parseFileTSV(fileInfo.stdout).path;
```

**Call 2** — write at canonical path:
```typescript
await invokeCli({
  command: "property:set",
  vault: input.vault!,
  parameters: {
    name: input.name,
    value: serialiseValue(input.value),
    ...(resolvedType ? { type: resolvedType } : {}),
    path: canonicalPath,
  },
  flags: [],
  target_mode: "specific",
}, adapterDeps);
```

### Active (TWO calls)

**Call 1** — eval with FIXED template:
```typescript
const focused = await invokeCli({
  command: "eval",
  parameters: { code: FOCUSED_FILE_TEMPLATE },
  flags: [],
  target_mode: "active",
}, adapterDeps);
const parsed = parseEvalResponse(focused.stdout) as { path: string | null; vault: string };
if (parsed.path === null) {
  throw new UpstreamError({
    code: "ERR_NO_ACTIVE_FILE",
    cause: null,
    details: {},
    message: "No active file in Obsidian. Open a note in the editor, or call write_property with target_mode=specific.",
  });
}
```

**Call 2** — write at resolved path+vault:
```typescript
await invokeCli({
  command: "property:set",
  vault: parsed.vault,
  parameters: {
    name: input.name,
    value: serialiseValue(input.value),
    ...(resolvedType ? { type: resolvedType } : {}),
    path: parsed.path,
  },
  flags: [],
  target_mode: "specific",
}, adapterDeps);
```

## FIXED_FILE_TEMPLATE (R15)

```typescript
const FOCUSED_FILE_TEMPLATE =
  "(()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,vault:app.vault.getName()});})()";
```

- Fixed string at handler compile time.
- NO user input interpolation.
- Returns `{ path: string | null, vault: string }` as a JSON string prefixed with `=> ` per the eval response convention.

## Helper functions

### `inferType(value, explicit?)`

```typescript
function inferType(
  value: WritePropertyInput["value"],
  explicit?: PropertyWriteTypeLabel,
): PropertyWriteTypeLabel {
  if (explicit !== undefined) return explicit;
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "list";
  return "text";
}
```

**Contract**: explicit `type` wins; otherwise infer from JavaScript shape. NEVER from string-parsing heuristics (FR-008 / FR-009).

### `serialiseValue(value)`

```typescript
function serialiseValue(value: WritePropertyInput["value"]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"; // R10 / F2
    return value.join(",");              // R9 / F13
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value); // string passthrough; number → decimal string
}
```

### `parseFileTSV(stdout)`

```typescript
function parseFileTSV(stdout: string): { path: string } {
  for (const line of stdout.split("\n")) {
    if (line.startsWith("path\t")) {
      return { path: line.slice("path\t".length) };
    }
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stdout },
    message: "file subcommand stdout did not contain a path line",
  });
}
```

### `parseEvalResponse(stdout)`

Re-use of the existing pattern from [write_note's handler](../../../src/tools/write_note/handler.ts). Eval stdout is prefixed with `=> ` (F3 from 015-read-heading); the remainder is the JS expression's value as text. The handler `JSON.parse`s the body; failure throws a structured `CLI_REPORTED_ERROR(stage: "json-parse")`.

## Argv-passing invariants (FR-020, SC-019)

All user-supplied inputs reach the CLI as discrete argv parameters via `child_process.spawn`. No shell interpolation, no eval source-text interpolation, no string concatenation into the eval template (which is FIXED per R15).

Per-call argv composition (the cli-adapter handles the joining; the handler supplies `parameters: Record<string, string>`):

```
["property:set", "vault=<v>", "path=<p>", "name=<n>", "value=<serialised>", "type=<resolved>"]
```

`vault=` is hoisted first per the cli-adapter's argv-assembly contract. The order of `path` / `name` / `value` / `type` is determined by the cli-adapter's parameter-iteration order; the typed-tool contract does not lock the inter-parameter order beyond `vault=` first.

## Failure propagation

```text
zod parse fails                  → registerTool wraps → VALIDATION_ERROR
                                                        (with details.issues from zod)

handler throws UpstreamError     → registerTool's catch propagates via asToolError
                                                        (preserves code, message, details)

handler throws non-UpstreamError → registerTool re-throws → server's outer catch
                                                        (5xx-class fault — should not happen)
```

Each cli-adapter failure code is propagated unchanged:
- `CLI_BINARY_NOT_FOUND` — `obsidian` not on PATH or `OBSIDIAN_BIN` mis-set.
- `CLI_NON_ZERO_EXIT` — CLI exited with a non-zero status.
- `CLI_REPORTED_ERROR` — CLI exit 0 with `Error: ...` stdout, OR the 011-R5 `Vault not found.` re-classification.
- `ERR_NO_ACTIVE_FILE` — active-mode eval returned `path: null`.

NO new error codes (FR-027).

## Test seam pattern (R13)

Handler tests inject `deps.spawnFn` per the established convention from [cli-adapter test seams](../../../src/cli-adapter/cli-adapter.test.ts).

**Spawn count per request**:
- Specific + path: 1 spawn (property:set only).
- Specific + file: 2 spawns (file → property:set).
- Active happy: 2 spawns (eval → property:set).
- Active no-focused-file: 1 spawn (eval only; property:set short-circuited by the ERR_NO_ACTIVE_FILE throw).

Tests assert both the spawn-count AND the per-spawn argv shape via the stub's recorded invocations.

## Cross-references

- [spec.md FR-011, FR-013, FR-014, FR-015, FR-016, FR-024, FR-025, FR-026, FR-033](../spec.md) — handler-layer FRs.
- [data-model.md — CLI argv mapping table](../data-model.md) — argv composition source.
- [research.md R3, R5, R6, R10, R15, R16](../research.md) — argv decisions.
- [src/cli-adapter/cli-adapter.ts](../../../src/cli-adapter/cli-adapter.ts) — `invokeCli` and the four-priority error classifier.
- [src/tools/_register.ts](../../../src/tools/_register.ts) — `registerTool` factory.
- [src/tools/write_note/handler.ts:48-69](../../../src/tools/write_note/handler.ts#L48-L69) — `parseEvalResponse` precedent (reused).
