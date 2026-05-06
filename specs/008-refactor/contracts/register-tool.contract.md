# Contract — `registerTool` + `assertToolDocsExist`

**Module**: `src/tools/_register.ts`
**Status**: design

The publication-pipeline factory and the doc-file aggregation helper that together constitute "the registration entry point" per FR-001 / FR-005.

---

## `registerTool(spec)` signature

```ts
export function registerTool<TSchema extends ZodTypeAny, TDeps>(
  spec: ToolSpec<TSchema, TDeps>,
): RegisteredTool;
```

`ToolSpec` is detailed in [data-model.md §1](../data-model.md#1-toolspectschema-tdeps--input-to-registertool); `RegisteredTool` is unchanged from existing [src/tools/_shared.ts:40](../../src/tools/_shared.ts#L40).

---

## Pipeline guarantees (FR-002, FR-003, FR-004)

`registerTool` performs, in order:

1. **Render JSON Schema** — `inputSchemaRaw = toMcpInputSchema(spec.schema)`. The helper guarantees top-level `type: "object"` (per feature 007). No call site ever invokes `zodToJsonSchema` directly.
2. **Strip descriptions** — `inputSchema = stripSchemaDescriptions(inputSchemaRaw)`. Top-level `description` is preserved by the strip utility per its contract; nested descriptions are removed at every depth.
3. **Build the descriptor** — `{ name: spec.name, description: spec.description, inputSchema }`.
4. **Build the wrapped handler** — closes over `spec.schema`, `spec.handler`, `spec.deps`, `spec.responseFormat ?? "json"`. The wrapped handler is the function exposed via the returned `RegisteredTool.handler`.
5. **Return the `RegisteredTool` envelope**.

The wrapped handler's runtime behavior is defined in [data-model.md §2](../data-model.md#2-registeredtool--output-of-registertool-unchanged-from-existing-_sharedts) and detailed below.

---

## Wrapped handler runtime contract

Given an MCP `CallToolRequest` whose `params.arguments` reaches the handler as `args: unknown`:

```ts
async (args: unknown): Promise<ToolCallResult> => {
  let parsed: z.infer<TSchema>;
  try {
    parsed = spec.schema.parse(args);
  } catch (err) {
    if (err instanceof ZodError) {
      return asToolError({
        code: "VALIDATION_ERROR",
        message: `${spec.name} input failed schema validation`,
        details: { issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })) },
      });
    }
    throw err;
  }
  let result: unknown;
  try {
    result = await spec.handler(parsed, spec.deps as TDeps);
  } catch (err) {
    if (err instanceof UpstreamError) {
      return asToolError({ code: err.code, message: err.message, details: err.details });
    }
    throw err;
  }
  if ((spec.responseFormat ?? "json") === "json") {
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
  // responseFormat: "raw" — handler returned a pre-built ToolCallResult.
  return result as ToolCallResult;
};
```

**Invariants**:
- The published `inputSchema` always satisfies the MCP `Tool` definition's `type === "object"` constraint (delegated to `toMcpInputSchema`).
- Every `ZodError` raised by `spec.schema.parse(...)` becomes a `VALIDATION_ERROR` envelope. Tools never see ZodErrors in their handler bodies.
- Every `UpstreamError` raised inside the handler becomes a structured-error envelope preserving `code`, `message`, `details`. Tools never write per-tool `try / catch (UpstreamError)` boilerplate.
- `responseFormat: "raw"` handlers MUST return a value that satisfies `ToolCallResult`. TypeScript's structural typing enforces the discipline at compile time when the handler's return type is annotated.

---

## `assertToolDocsExist(tools, docsDir)` signature

```ts
export function assertToolDocsExist(
  tools: RegisteredTool[],
  docsDir: string,
): void;
```

**Behavior** (per Clarifications 2026-05-07 Q4 / FR-005):

1. Initialize `missing: string[] = []`.
2. For each `tool` in `tools`, compute `docPath = path.resolve(docsDir, ${tool.descriptor.name}.md)`.
3. If `existsSync(docPath) === false`, push `docs/tools/${tool.descriptor.name}.md` (relative form, for the error message) into `missing`. Continue iterating — do NOT throw mid-walk.
4. If `missing.length === 0`, return.
5. Otherwise, throw a single `Error` whose message is:

   ```
   Missing tool documentation files:
     - <path1>
     - <path2>
     ...

   Server boot failed because these registered tools have no documentation. Create the missing files and try again.
   ```

   (Multi-line strings render correctly in Node's default `Error` printing.)

**Invariants**:
- The walk completes regardless of how many docs are missing — every miss is reported.
- Fail-fast on the first miss is explicitly forbidden by FR-005.
- The function is synchronous; `existsSync` is the simplest, fastest primitive for the boot-time check.

---

## Worked examples

### Example A — typed tool registration (read_note)

```ts
// src/tools/read_note/index.ts
import { registerTool, type RegisteredTool } from "../_register.js";
import { readNoteInputSchema } from "./schema.js";
import { executeReadNote, type ExecuteDeps } from "./handler.js";

export interface RegisterDeps extends ExecuteDeps {}

export function createReadNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: "read_note",
    description: 'Read a note from an Obsidian vault. ...',
    schema: readNoteInputSchema,
    deps,
    handler: async (input, d) => {
      const result = await executeReadNote(input, d);
      return { content: result.content };
    },
  });
}
```

The published descriptor:
- `name: "read_note"`
- `description: "Read a note from an Obsidian vault. ..."`
- `inputSchema: { type: "object", additionalProperties: true, oneOf: [<active branch>, <specific branch>], $schema: "http://json-schema.org/..." }` — exactly today's published shape (modulo whitespace), guaranteed by `toMcpInputSchema(readNoteInputSchema)` + `stripSchemaDescriptions(...)`.

Handler-side: a `ZodError` from `readNoteInputSchema.parse(args)` becomes the standard `VALIDATION_ERROR` envelope; an `UpstreamError` from `executeReadNote` becomes `{ isError: true, content: [{ type: "text", text: JSON.stringify({ code, message, details }) }] }` — same as today, no per-tool wiring.

### Example B — raw-format tool registration (help)

```ts
// src/tools/help/index.ts
import { registerTool, type RegisteredTool } from "../_register.js";
import { helpInputSchema } from "./schema.js";
import { executeHelp } from "./handler.js";

export function createHelpTool(): RegisteredTool {
  return registerTool({
    name: "help",
    description: 'Look up full Markdown documentation for any registered MCP tool. ...',
    schema: helpInputSchema,
    handler: async (input) => executeHelp(input),  // returns a pre-built ToolCallResult
    responseFormat: "raw",
  });
}
```

The handler's return value (a `ToolCallResult` carrying Markdown content blocks) flows through unwrapped — `responseFormat: "raw"` short-circuits the JSON-stringify wrap.

### Example C — doc-file aggregation drill (FR-005)

Given a server boot where `docs/tools/help.md` and `docs/tools/read_note.md` are both missing:

```
Missing tool documentation files:
  - docs/tools/help.md
  - docs/tools/read_note.md

Server boot failed because these registered tools have no documentation. Create the missing files and try again.
```

The error is thrown by `assertToolDocsExist`, propagates up `createServer`, and aborts boot. The first missing file is NOT special-cased — both are listed in declaration order.

---

## Negative examples (what `registerTool` does NOT do)

- **Does NOT touch the filesystem.** No `fs` access; doc-file existence checks live in `assertToolDocsExist`.
- **Does NOT perform CLI dispatch.** That is `dispatchCli`'s domain; tool handlers route through `invokeCli` / `invokeBoundedCli` themselves.
- **Does NOT log.** All logging is downstream — either at the dispatch primitive (failure-lifecycle events per FR-018a) or at the server (shutdown event).
- **Does NOT cache.** Every call invokes the wrapped handler fresh.
- **Does NOT memoize the rendered JSON Schema.** `toMcpInputSchema(spec.schema)` runs once at registration time, in the constructor body — not per-call. (The result is captured in the descriptor closure.)
