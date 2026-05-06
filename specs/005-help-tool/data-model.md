# Data Model: Progressive Disclosure Help Tool

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-06

## Overview

This feature ships **two source-code components**, **one bundled documentation directory**, and **two new error-code identifiers** in the project's existing `UpstreamError` codespace. None of the components persists data; both run synchronously per call. The "data model" therefore describes:

1. The **strip utility's input/output shape** (a JSON Schema document — typed via `zod-to-json-schema`'s output shape).
2. The **`help` tool's input schema** (zod-validated at the MCP boundary) and its **output / error shapes** (the SDK's tool-response envelope).
3. The **`docs/tools/` directory inventory** (what files ship and what each contains).
4. The **two new `UpstreamError.code` rows** added to the project's canonical errors contract.

## 1. Strip utility — `stripSchemaDescriptions`

### Signature

```ts
// src/help/strip-schema.ts (P1)
export function stripSchemaDescriptions(schema: JsonSchemaObject): JsonSchemaObject;
```

`JsonSchemaObject` is a typed alias for the relevant `zod-to-json-schema` output shape — a recursive object type with the conventional JSON Schema keys. The exact alias name and definition are an implementation detail; the public signature is "JSON-Schema-object in, JSON-Schema-object out, deep copy."

### Input shape (JSON Schema produced by `zod-to-json-schema`)

The walker visits the following construct kinds. For each, the description-stripping rule is documented:

| Construct | Where it appears | Strip rule |
|-----------|------------------|------------|
| Root | top of the schema document | `description` PRESERVED at the root (FR-003) |
| `properties` | object schemas (`type: "object"`) | every value object recursed; its own `description` removed |
| `items` | array schemas (`type: "array"`) | object value (single tuple-item-schema, or per-position tuple array of objects) recursed; descriptions removed |
| `anyOf` | union/option schemas | each branch object recursed; descriptions removed |
| `oneOf` | union/option schemas (incl. discriminated union output) | each branch object recursed; descriptions removed |
| `additionalProperties` | object schemas, when an object (NOT when boolean) | recursed; descriptions removed |
| `definitions` / `$defs` / `$ref` | absent in this project (`$refStrategy: "none"` per [src/tools/obsidian_exec/schema.ts:19](../../src/tools/obsidian_exec/schema.ts#L19)) | NOT visited |
| Other keys (`type`, `required`, `enum`, `default`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `format`, `title`, `examples`, etc.) | anywhere | PRESERVED at every depth (FR-004) |

### Output shape

A deep-copy `JsonSchemaObject` with:
- The root's `description` (if present) preserved.
- Every other `description` field (anywhere below the root inside the visited constructs) removed.
- Every other key — `type`, `properties`, `required`, `enum`, `anyOf`, `oneOf`, `items`, `$ref`, `additionalProperties`, etc. — preserved exactly.
- The input object unchanged (deep-equal to its pre-call state per FR-005 / Story 1 AC#4).

### Behavioural invariants

- **Pure**: no filesystem, no network, no logger, no global state (FR-005, SC-004).
- **Idempotent**: `stripSchemaDescriptions(stripSchemaDescriptions(s))` is structurally equal to `stripSchemaDescriptions(s)`.
- **Deep copy**: the returned object shares no reference with the input at any depth (`structuredClone` per P2).
- **Type-preserving**: a `description: { foo: "bar" }` (non-string value) is removed regardless of value type — the strip is keyed on field name, not on value type (Edge Case "non-string description value").

## 2. `help` MCP tool

### Tool registration object (visible to MCP clients via `tools/list`)

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

The top-level `description` is the P5-pinned string. The `inputSchema` is the result of running `zodToJsonSchema(helpInputSchema, { $refStrategy: "none" })` through the strip utility (per FR-006).

### Input schema (zod, the single source of truth per Constitution Principle III)

```ts
// src/tools/help/schema.ts (P3)
export const helpInputSchema = z
  .object({
    tool_name: z.string().min(1).optional(),
  })
  .strict();

export type HelpInput = z.infer<typeof helpInputSchema>;

export const helpInputJsonSchema = zodToJsonSchema(helpInputSchema, { $refStrategy: "none" }) as Record<string, unknown>;
```

| Field | Type | Required | Constraint | Source |
|-------|------|----------|------------|--------|
| `tool_name` | `string` | NO (optional) | When present, MUST have length ≥ 1 (per Clarification Q1 — empty string rejected at the zod boundary as `VALIDATION_ERROR`) | FR-007, P3 |

The schema uses `.strict()` (matching the `obsidianExecSchema` precedent at [src/tools/obsidian_exec/schema.ts:14](../../src/tools/obsidian_exec/schema.ts#L14)) to reject unknown keys at the zod boundary. The inferred type `HelpInput` is `{ tool_name?: string }` — the canonical typed handle for the help tool's input throughout the codebase. No parallel hand-written interface exists.

### Output shape (success — the SDK's tool-response envelope)

```ts
{
  content: [
    {
      type: "text",
      text: <full UTF-8 contents of the resolved Markdown file>,
    },
  ],
}
```

There are exactly two success branches per FR-008:
- `tool_name` provided + matching file exists + name is NOT the reserved literal `"index"` → contents of `docs/tools/<tool_name>.md`.
- `tool_name` omitted (or input is `{}`) → contents of `docs/tools/index.md`.

The `text` field is the file's contents verbatim — no transformation, no transcoding, no summarisation. An empty file (zero bytes) returns `text: ""` (Edge Case "doc file exists but is empty").

**Reserved-name guard** (added by /speckit-analyze remediation L1a): `tool_name === "index"` is rejected with `HELP_TOOL_NOT_FOUND` BEFORE the filesystem read, even though `index.md` exists in the directory — the spec edge case binds this disambiguation. Without the guard, the implementation would erroneously return `index.md`'s content for the named-tool branch. The `notFound` helper's `availableTools` list already excludes `index.md` from the agent-facing message, so the failure surface is consistent with any other unknown name.

### Output shape (failure — the SDK's tool-error-response envelope)

The handler throws an `UpstreamError`; the registration's dispatcher (mirroring the `asToolError` helper at [src/tools/obsidian_exec/tool.ts:29-34](../../src/tools/obsidian_exec/tool.ts#L29-L34)) translates it to:

```ts
{
  isError: true,
  content: [
    {
      type: "text",
      text: JSON.stringify({ code: <error code>, message: <error message>, details: <details> }),
    },
  ],
}
```

The three reachable failure surfaces, with their `details` shapes:

| Failure surface | `code` | `details` shape | Trigger |
|-----------------|--------|------------------|---------|
| Non-string `tool_name`, empty-string `tool_name`, unknown key, etc. | `VALIDATION_ERROR` | `{ issues: Array<{ path, message, code }> }` (zod's standard issue shape, matching the precedent at [src/tools/obsidian_exec/tool.ts:60-67](../../src/tools/obsidian_exec/tool.ts#L60-L67)) | zod parse failure at the tool boundary |
| Named tool's `<tool_name>.md` does not exist within `docs/tools/`, OR resolves outside it (path traversal probe) | `HELP_TOOL_NOT_FOUND` | `{ requestedName: string, availableTools: string[] }` | Filesystem lookup miss after directory check passes (P4) |
| `docs/tools/` directory itself is missing, unreadable, or not a directory | `HELP_DOCS_MISSING` | `{ resolvedDocsDir: string, ioCode?: string }` | Directory check fails (Q4) |

The `requestedName` field in `HELP_TOOL_NOT_FOUND.details` carries the original `tool_name` input for operator-side debugging. The error's `message` field does NOT echo `requestedName` (per FR-010 anti-injection rule); it lists `availableTools` so the agent can self-correct.

### Doc-file path resolution

Anchored to the module's own location via `import.meta.url` per FR-009 + P4:

```ts
const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(HERE, "../../docs/tools");
// At runtime: dist/tools/help/handler.js → ../../docs/tools/  (dist-rooted, since dist/ is what npm publishes)
```

The `../../` is two levels up from `dist/tools/help/handler.js` to land in the package's `dist/` parent (which IS the package root in published artifacts because [package.json](../../package.json) `files: ["dist", "README.md", "LICENSE"]` lists `dist` and the new `docs/tools/**/*.md` as siblings). At runtime, `dirname(handler.js)` = `dist/tools/help`, so `../../docs/tools` = `dist/../docs/tools` = the package-root-level `docs/tools` directory. NPM packs both `dist/` and `docs/` as siblings into the tarball.

Wait — re-checking: the npm pack layout puts both `dist/` and `docs/` at the tarball's package root. The path resolution starts from `dist/tools/help/handler.js` (the compiled location), so `../../docs/tools` from there equals `dist/../docs/tools` which equals `<package-root>/docs/tools`. ✓ Correct.

### Path-traversal defense (P4 layered)

For each `tool_name` that survives the zod boundary (i.e., is a non-empty string):

1. Reject early if `tool_name.includes("\0")` → `HELP_TOOL_NOT_FOUND`.
2. `candidate = path.resolve(DOCS_DIR, \`${tool_name}.md\`)`.
3. `rel = path.relative(DOCS_DIR, candidate)`.
4. Reject if `rel.startsWith("..")` OR `rel.includes(path.sep)` → `HELP_TOOL_NOT_FOUND` (the same code as a missing file — a probe cannot distinguish "wrong name" from "tried to escape").

The agent-facing error message lists `availableTools` from `readdir(DOCS_DIR)` filtered to `.md` files (excluding `index.md`); the original `tool_name` is preserved in `details.requestedName` for operators reading structured logs.

## 3. `docs/tools/` directory inventory

The `docs/tools/` directory ships as part of the npm artifact (FR-014 — `package.json` `files` array gains `"docs/tools/**/*.md"`). The directory contains exactly **9 Markdown files** at this BI's release:

| File | Purpose | Content type | Trigger for `help` |
|------|---------|--------------|---------------------|
| `index.md` | Listing of all available tool docs, one line per tool with one-line summary | Hand-authored, real content | `help({})` or `help` with omitted `tool_name` |
| `help.md` | Full doc for the `help` tool itself (input schema, output shapes, error codes, examples) | Hand-authored, real content | `help({ tool_name: "help" })` |
| `obsidian_exec.md` | Full doc for the `obsidian_exec` tool, transcribed from [001's contracts](../001-add-cli-bridge/contracts/) per Clarification Q2 | Hand-authored, real content | `help({ tool_name: "obsidian_exec" })` |
| `read_note.md` | Stub with TODO marker — body owned by BI-003 | Stub: front-matter + heading + `<!-- TODO(BI-003): populate this doc -->` | `help({ tool_name: "read_note" })` (returns the stub content) |
| `write_note.md` | Stub with TODO marker — body owned by future BI | Stub | `help({ tool_name: "write_note" })` |
| `append_note.md` | Stub with TODO marker — body owned by future BI | Stub | `help({ tool_name: "append_note" })` |
| `search_vault.md` | Stub with TODO marker — body owned by future BI | Stub | `help({ tool_name: "search_vault" })` |
| `list_notes.md` | Stub with TODO marker — body owned by future BI | Stub | `help({ tool_name: "list_notes" })` |
| `list_vaults.md` | Stub with TODO marker — body owned by future BI (architecture-committed name per Q3) | Stub | `help({ tool_name: "list_vaults" })` |

### Stub file format

Every stub MUST carry the literal string `<!-- TODO(BI-XXX): populate this doc -->` (where `BI-XXX` is the future BI that owns the doc body) so the unfilled docs are mechanically discoverable. A reasonable stub body:

```markdown
# `<tool_name>`

<!-- TODO(BI-XXX): populate this doc when the tool ships -->

> This tool has not yet been implemented. When it ships under BI-XXX, this file will document its
> input schema, output shape, error codes, and usage examples.

See [the index](./index.md) for the full list of available tools, or [help](./help.md) for the
help tool's own documentation.
```

The exact body text is a stub-author choice; the TODO marker is the binding requirement.

### `index.md` format

A bullet list, one bullet per available `.md` file (excluding `index.md` itself), with the format `- **<tool_name>** — <one-line summary>.`. The bullets are alphabetically sorted by `tool_name` for stability across regenerations. The header is a level-1 `# Available Tools` heading.

For the 8 listed tools at this BI's release:

```markdown
# Available Tools

Call `help({ tool_name: "<name>" })` to read full documentation for any tool below.

- **append_note** — _(documentation pending — owned by a future BI)_.
- **help** — Look up full Markdown documentation for any registered MCP tool.
- **list_notes** — _(documentation pending — owned by a future BI)_.
- **list_vaults** — _(documentation pending — owned by a future BI)_.
- **obsidian_exec** — Invoke any Obsidian Integrated CLI subcommand.
- **read_note** — _(documentation pending — owned by a future BI)_.
- **search_vault** — _(documentation pending — owned by a future BI)_.
- **write_note** — _(documentation pending — owned by a future BI)_.
```

The placeholder text for stubbed tools is a plan-stage choice; reviewers may refine the wording.

### `help.md` content outline

```markdown
# `help`

Look up full Markdown documentation for any registered MCP tool.

## Input

- `tool_name` (string, optional, non-empty): the name of the tool to read docs for. When omitted,
  returns the index of all available tools.

## Output

- When `tool_name` is provided and matches an available tool: the full Markdown contents of that tool's doc.
- When `tool_name` is omitted: the contents of the index page (`index.md`).

## Errors

- `VALIDATION_ERROR`: `tool_name` is empty, non-string, or the input has unknown keys.
- `HELP_TOOL_NOT_FOUND`: `tool_name` is provided but no matching doc file exists. The error
  details carry `availableTools` so callers can self-correct.
- `HELP_DOCS_MISSING`: the documentation directory itself is missing or unreadable
  (a packaging or install integrity failure — not an agent-correctable error).

## Examples

- `help({})` — returns the index.
- `help({ tool_name: "help" })` — returns this page.
- `help({ tool_name: "obsidian_exec" })` — returns the full docs for `obsidian_exec`.
```

### `obsidian_exec.md` content outline

The body is transcribed from the canonical contracts at [specs/001-add-cli-bridge/contracts/obsidian_exec.tool.json](../001-add-cli-bridge/contracts/obsidian_exec.tool.json) and [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md). Sections expected: `# obsidian_exec`, `## Input` (per-field documentation: `command`, `parameters`, `vault`, `flags`, `copy`, `timeoutMs`), `## Output` (the `{ stdout, stderr, exitCode, argv }` shape), `## Errors` (the seven `UpstreamError.code` values from features 001/002/003 — `CLI_NONZERO_EXIT`, `CLI_REPORTED_ERROR`, `EXEC_TIMEOUT`, `OUTPUT_TOO_LARGE`, `BINARY_NOT_FOUND`, `VALIDATION_ERROR`, plus the cli-adapter's `ERR_NO_ACTIVE_FILE` and `CLI_NON_ZERO_EXIT` if relevant — actual list per the canonical errors.contract.md), `## Examples`. The exact content is plan-stage authoring; the structural sections bind.

## 4. New error codes in the canonical errors contract

The project's existing `UpstreamError` codespace (currently 8 codes per features 001/002/003) gains two members:

| `code` | Source | Trigger | `details` shape | Message format | Recovery path |
|--------|--------|---------|------------------|-----------------|---------------|
| `HELP_TOOL_NOT_FOUND` | This BI (FR-008 third bullet, Q4) | Named tool's `<tool_name>.md` does not exist within `docs/tools/`, OR `tool_name` resolves to a path outside `docs/tools/` (traversal probe), OR `tool_name` contains a NUL byte | `{ requestedName: string, availableTools: string[] }` | `"No documentation file for the requested tool. Available tools: <comma-list>."` (does NOT echo `requestedName` per FR-010) | Agent-side: pick a valid name from `availableTools` and retry |
| `HELP_DOCS_MISSING` | This BI (FR-008 fourth bullet, Q4) | `docs/tools/` directory itself is missing, unreadable, or is not a directory | `{ resolvedDocsDir: string, ioCode?: string }` (where `ioCode` is the underlying `node:fs` error code like `"ENOENT"`, `"ENOTDIR"`, or `"EACCES"`) | `"docs/tools/ directory missing or unreadable at <resolvedDocsDir>"` | Operator-side: publish/install fix; not agent-recoverable |

Both codes are added to:
- [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) — the canonical errors contract — via the diff in [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md).
- [README.md](../../README.md) — the error-codes table (FR-011).

## Test coverage map

This table maps every test body to the FR / Story / Edge-Case / Clarification it exercises:

Counts revised by /speckit-analyze remediation 2026-05-06 (findings C1, C2, L1a/b/c) — totals went from 22 to **27** with five additions for explicit Story 2 AC#6 coverage, root-description preservation, and three Edge Case scenarios.

| Test file | Test body | Covers |
|-----------|-----------|--------|
| `src/help/strip-schema.test.ts` | flat-schema strip | Story 1 AC#1, FR-002, SC-002 |
| `src/help/strip-schema.test.ts` | nested-schema strip (discriminated union, array items, anyOf/oneOf) | Story 1 AC#2, FR-002, FR-004 |
| `src/help/strip-schema.test.ts` | no-descriptions input | Story 1 AC#3, FR-002 |
| `src/help/strip-schema.test.ts` | mutation safety (input deep-equal pre/post) | Story 1 AC#4, FR-005, SC-004 |
| `src/help/strip-schema.test.ts` | structural-key preservation (type, required, enum, anyOf, oneOf, items, $ref absence, additionalProperties) | Story 1 AC#6, FR-004 |
| `src/help/strip-schema.test.ts` | non-string description value (`description: { foo: "bar" }`) | Edge Case "non-string description value", FR-002 |
| `src/help/strip-schema.test.ts` | **root-description preservation (`.describe()` at outer z.object) — added by remediation C2** | FR-003, Edge Case "Top-level (root) description on the JSON Schema input" |
| `src/tools/help/schema.test.ts` | omitted tool_name parses successfully | Story 2 AC#2, FR-007 |
| `src/tools/help/schema.test.ts` | non-empty tool_name parses successfully | Story 2 AC#1, FR-007 |
| `src/tools/help/schema.test.ts` | empty-string tool_name fails with path: ["tool_name"] | Clarification Q1, Edge Case `help({ tool_name: "" })`, FR-007 |
| `src/tools/help/schema.test.ts` | **non-string tool_name (e.g., 42) → invalid_type with path: ["tool_name"] — added by remediation C1** | Story 2 AC#6, FR-007 |
| `src/tools/help/handler.test.ts` | named tool returns file contents | Story 2 AC#1, FR-008 first bullet |
| `src/tools/help/handler.test.ts` | omitted tool_name returns index | Story 2 AC#2, FR-008 second bullet |
| `src/tools/help/handler.test.ts` | unknown tool → HELP_TOOL_NOT_FOUND with availableTools | Story 2 AC#3, FR-008 third bullet |
| `src/tools/help/handler.test.ts` | cwd-independence (chdir before invoke) | Story 2 AC#4 / Story 4 AC#2, FR-009, SC-005, SC-008 |
| `src/tools/help/handler.test.ts` | obsidian_exec.md returns its real content | Story 2 AC#5, FR-012 third bullet, Q2 |
| `src/tools/help/handler.test.ts` | non-string tool_name → VALIDATION_ERROR (defensive — schema-level coverage at C1) | Story 2 AC#6, FR-007 |
| `src/tools/help/handler.test.ts` | missing docs/tools/ → HELP_DOCS_MISSING | Clarification Q4, Edge Case "docs/tools/ directory missing", FR-008 fourth bullet |
| `src/tools/help/handler.test.ts` | path-traversal probe (`../../etc/passwd`) → HELP_TOOL_NOT_FOUND, no file read outside docs/tools/ | Edge Case "path traversal", FR-010 |
| `src/tools/help/handler.test.ts` | **`help({ tool_name: "index" })` → HELP_TOOL_NOT_FOUND with availableTools excluding index — added by remediation L1a** | Edge Case `help({ tool_name: "index" })`, reserved-name guard |
| `src/tools/help/handler.test.ts` | **empty doc file (zero bytes) → success with empty-string text — added by remediation L1b** | Edge Case "A doc file exists but is empty" |
| `src/tools/help/handler.test.ts` | **orphaned doc file (no registered tool) → success with file content — added by remediation L1c** | Edge Case "A doc file exists but no tool with that name is registered" |
| `src/tools/help/tool.test.ts` | top-level description mentions `help("help")` | Story 3 AC#3, FR-016, SC-003 |
| `src/tools/help/tool.test.ts` | stripped inputSchema has no descriptions in properties tree | Story 1 AC#5, FR-006, SC-002 |
| `src/tools/help/tool.test.ts` | HELP_TOOL_NOT_FOUND round-trips through SDK error-response shape | FR-011 |
| `src/server.test.ts` (additions) | every registered tool has a `docs/tools/<name>.md` file | Clarification Q5, FR-017 third bullet, SC-011 |
| `src/server.test.ts` (additions) | every registered tool's stripped inputSchema is description-free at every depth | Story 1 AC#5, FR-006, SC-002, Edge Case "registration bypass" |

**27 test bodies total** (revised from 22 by remediation pass). The minimum FR-017 set (4 strip + 3 help + 1 registry-consistency = 8 cases) is exceeded by 19 recommended-or-clarification-driven additions; reviewers may consolidate adjacent assertions but every scenario in the table MUST be exercised.
