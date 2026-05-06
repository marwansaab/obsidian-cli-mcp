# Contract: `help` MCP tool

**Module folder**: [src/tools/help/](../../../src/tools/help/)
**Source files**: `schema.ts` (zod input + JSON Schema), `handler.ts` (path resolution + filesystem reads + error mapping), `tool.ts` (SDK registration + dispatcher).
**Tests**: `schema.test.ts`, `handler.test.ts`, `tool.test.ts` (co-located per Constitution Principle II).
**Spec**: [../spec.md](../spec.md) §Requirements §Component 2
**Plan**: [../plan.md](../plan.md) §Summary §P3 §P4 §P5
**Research**: [../research.md](../research.md) §P3 §P4 §P5 §"Help-tool handler implementation sketch"

## Purpose

A public MCP tool that serves Markdown documentation for any registered tool on demand, implementing [ADR-005's](../../../.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md) decision #2 (Help Tool). Companion to the schema-stripping utility ([strip-schema.contract.md](./strip-schema.contract.md)) — together they constitute the progressive-disclosure pattern: tool-list responses carry no parameter descriptions (~70% token reduction at session start), and agents can fetch a tool's full docs once per session via `help({ tool_name: "<name>" })`.

## SDK registration

```ts
{
  name: "help",
  description:
    "Look up full Markdown documentation for any registered MCP tool. Call help() with no arguments " +
    "for an index of available docs, or help({ tool_name: \"<name>\" }) for a specific tool's full " +
    "parameter docs. Self-describing — call help({ tool_name: \"help\" }).",
  inputSchema: stripSchemaDescriptions(helpInputJsonSchema),
}
```

The top-level description is the P5-pinned string. The `inputSchema` is the JSON Schema produced from `helpInputSchema` via `zodToJsonSchema(..., { $refStrategy: "none" })`, then run through the strip utility per FR-006.

## Input schema (zod, single source of truth per Principle III)

```ts
// src/tools/help/schema.ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const helpInputSchema = z
  .object({
    tool_name: z.string().min(1).optional(),
  })
  .strict();

export type HelpInput = z.infer<typeof helpInputSchema>;

export const helpInputJsonSchema = zodToJsonSchema(helpInputSchema, { $refStrategy: "none" }) as Record<string, unknown>;
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `tool_name` | `string` | NO (optional) | When present, MUST have length ≥ 1 (Clarification Q1) |

The `.strict()` modifier rejects unknown keys at the zod boundary as `VALIDATION_ERROR` (matching the `obsidianExecSchema` precedent).

## Behavioural contract

### B1 — Named tool, doc exists (FR-008 first bullet)

**Trigger**: `tool_name` is provided (non-empty string per zod), AND `docs/tools/<tool_name>.md` exists at the resolved path AND is a regular file.

**Outcome**: Resolve the SDK call with:

```ts
{ content: [{ type: "text", text: <full UTF-8 contents of the file> }] }
```

### B2 — `tool_name` omitted, return index (FR-008 second bullet)

**Trigger**: Input is `{}` OR `tool_name` is absent from the input object.

**Outcome**: Resolve the SDK call with:

```ts
{ content: [{ type: "text", text: <full UTF-8 contents of docs/tools/index.md> }] }
```

If `index.md` itself is missing, the directory check (B5) has already fired (no directory → `HELP_DOCS_MISSING`); if the directory exists but `index.md` does not, the call falls through to the per-file `ENOENT` branch and surfaces as `HELP_TOOL_NOT_FOUND` with `requestedName: "index"` and `availableTools: <readdir result minus index.md>`. (This case is unreachable in practice — `index.md` ships in the BI's release.)

### B3 — Named tool, doc missing (FR-008 third bullet)

**Trigger**: `tool_name` is provided AND the resolved file does NOT exist (filesystem `ENOENT`).

**Outcome**: Throw `UpstreamError` with:

```ts
{
  code: "HELP_TOOL_NOT_FOUND",
  cause: <the ENOENT error from readFile, or null>,
  details: { requestedName: <input tool_name>, availableTools: <readdir of docs/tools/, .md files only, excluding index.md, sorted> },
  message: "No documentation file for the requested tool. Available tools: <comma-list>.",
}
```

The `message` does NOT echo `requestedName` per FR-010 (anti-injection); `details.requestedName` preserves the original input for operator-side debugging.

### B4 — Path-traversal probe (FR-010, P4)

**Trigger**: `tool_name` contains `..`, path separators, NUL bytes, or otherwise resolves outside `docs/tools/`.

**Outcome**: Same as B3 — throw `HELP_TOOL_NOT_FOUND` with the same shape. A probe cannot distinguish "wrong name" from "tried to escape" by observing the response. NO file is read outside `docs/tools/`.

Implementation per P4:

1. Reject if `tool_name.includes("\0")`.
2. `candidate = path.resolve(docsDir, \`${tool_name}.md\`)`.
3. `rel = path.relative(docsDir, candidate)`.
4. Reject if `rel.startsWith("..")` OR `rel.includes(path.sep)`.

### B5 — `docs/tools/` directory missing (FR-008 fourth bullet, Clarification Q4)

**Trigger**: The `docs/tools/` directory itself is missing, unreadable, or is not a directory. Detected by an `access()` call (or equivalent stat) at the start of the handler, BEFORE per-tool resolution.

**Outcome**: Throw `UpstreamError` with:

```ts
{
  code: "HELP_DOCS_MISSING",
  cause: <the underlying I/O error from access()>,
  details: { resolvedDocsDir: <absolute path>, ioCode: <"ENOENT" | "ENOTDIR" | "EACCES" | …> },
  message: "docs/tools/ directory missing or unreadable at <resolvedDocsDir>",
}
```

This branch fires regardless of whether `tool_name` was provided — the directory check precedes the per-tool lookup. Recovery is operator-side (publish/install fix), not agent-side.

### B6 — Empty-string `tool_name` (Clarification Q1)

**Trigger**: `tool_name` is provided as the empty string `""`.

**Outcome**: zod parse fails at the tool boundary BEFORE any handler logic runs. The dispatcher (mirroring [src/tools/obsidian_exec/tool.ts:60-67](../../../src/tools/obsidian_exec/tool.ts#L60-L67)) returns:

```ts
{
  isError: true,
  content: [{ type: "text", text: JSON.stringify({
    code: "VALIDATION_ERROR",
    message: "help input failed schema validation",
    details: { issues: [{ path: ["tool_name"], message: <zod's "String must contain at least 1 character(s)" or equivalent>, code: "too_small" }] },
  }) }],
}
```

The SDK never sees `HELP_TOOL_NOT_FOUND` for empty-string input.

### B7 — Non-string `tool_name` (Story 2 AC#6)

**Trigger**: `tool_name` is provided as a non-string value (number, boolean, object, array, null).

**Outcome**: Same surface as B6 (`VALIDATION_ERROR` with `path: ["tool_name"]`), but the zod issue's `code` is `invalid_type` instead of `too_small`.

### B8 — Unknown keys in input (`.strict()` rejection)

**Trigger**: Input contains keys other than `tool_name` (e.g., `help({ tool_name: "x", unknown: "y" })`).

**Outcome**: `VALIDATION_ERROR` per the `.strict()` modifier; zod's issue lists the unrecognized key.

## Path resolution

Anchored to the module's own location via `import.meta.url` per FR-009 + P4:

```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(HERE, "../../docs/tools");
```

At runtime, `import.meta.url` for the compiled handler is `file://.../dist/tools/help/handler.js`. `HERE` is `<package-root>/dist/tools/help`. `DOCS_DIR` resolves to `<package-root>/docs/tools` (since `dist/` and `docs/` are siblings inside the published package). The `package.json` `files` array includes both `dist/**` and `docs/tools/**/*.md` (FR-014).

`process.cwd()` is NOT referenced anywhere in the handler — verifiable by grep per SC-005.

## Failure surfaces summary

| Code | When | `details` | Recovery |
|------|------|-----------|----------|
| `VALIDATION_ERROR` (existing) | Zod parse failure (empty string, non-string, unknown keys) | `{ issues: Array<{ path, message, code }> }` | Agent retry with corrected input |
| `HELP_TOOL_NOT_FOUND` (new) | Named tool's file missing OR traversal probe | `{ requestedName, availableTools }` | Agent retry with a name from `availableTools` |
| `HELP_DOCS_MISSING` (new) | `docs/tools/` directory itself missing | `{ resolvedDocsDir, ioCode? }` | Operator-side publish/install fix |

Both new codes are added to [specs/001-add-cli-bridge/contracts/errors.contract.md](../../001-add-cli-bridge/contracts/errors.contract.md) via [errors.contract-patch.md](./errors.contract-patch.md) (FR-011).

## Test requirements (FR-017 help-tool minimum + recommended)

Per the [data-model test coverage map](../data-model.md#test-coverage-map):

### `src/tools/help/schema.test.ts` (~3 cases)

| ID | Case | Mapping |
|----|------|---------|
| 1 | Omitted `tool_name` parses successfully | Story 2 AC#2, FR-007 |
| 2 | Non-empty `tool_name` parses successfully | Story 2 AC#1, FR-007 |
| 3 | Empty-string `tool_name` fails with `path: ["tool_name"]` | Q1, Edge Case `help({ tool_name: "" })`, FR-007 |

### `src/tools/help/handler.test.ts` (~8 cases)

| ID | Case | Mapping |
|----|------|---------|
| 1 | Named tool returns file contents | Story 2 AC#1, B1 |
| 2 | Omitted `tool_name` returns `index.md` | Story 2 AC#2, B2 |
| 3 | Unknown tool → `HELP_TOOL_NOT_FOUND` with `availableTools` | Story 2 AC#3, B3 |
| 4 | cwd-independence (chdir before invoke) | Story 2 AC#4 / Story 4 AC#2, FR-009, SC-005, SC-008 |
| 5 | `obsidian_exec.md` returns its real content (NOT a stub) | Story 2 AC#5, FR-012, Q2 |
| 6 | Non-string `tool_name` → `VALIDATION_ERROR` | Story 2 AC#6, B7 |
| 7 | Missing `docs/tools/` directory → `HELP_DOCS_MISSING` | Q4, Edge Case "docs/tools/ directory missing", B5 |
| 8 | Path-traversal probe (`../../etc/passwd`) → `HELP_TOOL_NOT_FOUND` | Edge Case "path traversal", B4, FR-010 |

### `src/tools/help/tool.test.ts` (~3 cases)

| ID | Case | Mapping |
|----|------|---------|
| 1 | Top-level description mentions `help("help")` | Story 3 AC#3, FR-016, SC-003 |
| 2 | Stripped `inputSchema` has no `description` keys in `properties` tree | Story 1 AC#5, FR-006, SC-002 |
| 3 | `HELP_TOOL_NOT_FOUND` round-trips through SDK error-response shape | FR-011 |

## Module headers

Per Constitution Principle V (FR-018), every source file in `src/tools/help/` MUST carry `// Original — no upstream. <one-line description>.` Every test file likewise.

## Cross-references

- Companion utility: [strip-schema.contract.md](./strip-schema.contract.md)
- Errors-contract amendment: [errors.contract-patch.md](./errors.contract-patch.md)
- Canonical errors contract (target of the patch): [specs/001-add-cli-bridge/contracts/errors.contract.md](../../001-add-cli-bridge/contracts/errors.contract.md)
- Implementation sketch: [research.md §"Help-tool handler implementation sketch"](../research.md#help-tool-handler-implementation-sketch)
