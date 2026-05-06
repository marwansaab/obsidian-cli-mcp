# Quickstart: Progressive Disclosure Help Tool

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-06

## Purpose

This document walks through the end-to-end verification scenarios that prove the feature works once implementation lands. Each scenario maps to one or more spec User Stories / Functional Requirements / Success Criteria. The scenarios are written so a reviewer can execute them against a freshly-merged branch and verify the contract holds without needing to re-read the spec.

The scenarios fall into **three groups**:

1. **Component-level verification** (Scenarios 1–4): unit-test-style assertions on the strip utility and the help-tool handler/schema/tool modules. Run via `npm run test`.
2. **Server-level verification** (Scenarios 5–6): the registry-consistency gate in `server.test.ts`. Run via `npm run test`.
3. **Integration verification** (Scenarios 7–8): cross-cutting concerns that aren't fully captured by unit tests — packaging artifact contents and cwd-independence.

## Pre-conditions

Before running these scenarios, the implementation must satisfy the following from the plan:

- `src/help/strip-schema.ts` (and `.test.ts`) exist with the `// Original — no upstream.` header per FR-018.
- `src/tools/help/schema.ts`, `handler.ts`, `tool.ts` (and corresponding `.test.ts` files) exist with headers.
- `src/server.ts` registers BOTH `obsidian_exec` and `help`, both passed through `stripSchemaDescriptions` per FR-006.
- `docs/tools/` exists at the package root with the 9 files per FR-012 + Q3 (real `index.md`, `help.md`, `obsidian_exec.md`; six stubs).
- `package.json` `files` array includes `"docs/tools/**/*.md"` per FR-014.
- `src/errors.ts` (existing) needs no changes — the existing `UpstreamError` class accepts the new codes via its `code: string` field.
- `specs/001-add-cli-bridge/contracts/errors.contract.md` has been patched per [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md).
- `README.md` error-codes table gains the two new rows per FR-011.

## Scenario 1 — Strip utility, flat schema (Story 1 AC#1)

Open a Node REPL or write a one-off scratch script:

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { stripSchemaDescriptions } from "./src/help/strip-schema.js";

const schema = z.object({
  name: z.string().describe("a person's name"),
  age: z.number().int().describe("their age in years"),
});

const raw = zodToJsonSchema(schema, { $refStrategy: "none" });
console.log("BEFORE:", JSON.stringify(raw, null, 2));

const stripped = stripSchemaDescriptions(raw);
console.log("AFTER:", JSON.stringify(stripped, null, 2));
```

**Expected**: `BEFORE` shows `description` keys on both `name` and `age`. `AFTER` shows neither — but `type`, `required`, and other structural keys are unchanged. Verify the input `raw` object is unchanged after the call (mutation safety per AC#4).

**Test mapping**: `src/help/strip-schema.test.ts` cases 1 + 4.

## Scenario 2 — Strip utility, nested schema (Story 1 AC#2)

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { stripSchemaDescriptions } from "./src/help/strip-schema.js";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("a"), items: z.array(z.object({ id: z.string().describe("inner") })) }),
  z.object({ kind: z.literal("b"), other: z.string().describe("other field") }),
]);

const raw = zodToJsonSchema(schema, { $refStrategy: "none" });
const stripped = stripSchemaDescriptions(raw);
```

**Expected**: `JSON.stringify(stripped).includes("description")` is `false`. Every nested `description` (inside the `oneOf` branches, inside `items`, inside the inner-object `properties`) is removed.

**Test mapping**: `src/help/strip-schema.test.ts` case 2.

## Scenario 3 — `help` tool happy path: named tool (Story 2 AC#1, FR-008)

With the MCP server running, send a `tools/call` request for `help` with `tool_name: "obsidian_exec"`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "help", "arguments": { "tool_name": "obsidian_exec" } }
}
```

**Expected**: response body is the verbatim contents of `docs/tools/obsidian_exec.md` (the full doc per Clarification Q2 — NOT a stub):

```json
{
  "result": { "content": [{ "type": "text", "text": "# obsidian_exec\n\n…" }] }
}
```

The same call with `tool_name: "help"` returns `docs/tools/help.md`'s contents.
The same call with NO arguments (`{ "name": "help", "arguments": {} }`) returns `docs/tools/index.md`'s contents (the listing of the 8 visible tools).

**Test mapping**: `src/tools/help/handler.test.ts` cases 1, 2, 5.

## Scenario 4 — `help` tool failure paths

### 4a. Unknown tool → `HELP_TOOL_NOT_FOUND` (Story 2 AC#3)

```json
{ "method": "tools/call", "params": { "name": "help", "arguments": { "tool_name": "nonexistent_xyz" } } }
```

**Expected**: response carries `isError: true`; the `text` field of the content array is the JSON of:

```json
{
  "code": "HELP_TOOL_NOT_FOUND",
  "message": "No documentation file for the requested tool. Available tools: append_note, help, list_notes, list_vaults, obsidian_exec, read_note, search_vault, write_note.",
  "details": {
    "requestedName": "nonexistent_xyz",
    "availableTools": ["append_note", "help", "list_notes", "list_vaults", "obsidian_exec", "read_note", "search_vault", "write_note"]
  }
}
```

The agent self-corrects by retrying with one of the names from `availableTools`.

### 4b. Empty-string `tool_name` → `VALIDATION_ERROR` (Q1)

```json
{ "method": "tools/call", "params": { "name": "help", "arguments": { "tool_name": "" } } }
```

**Expected**: `isError: true`, `code: "VALIDATION_ERROR"`, `details.issues[0].path = ["tool_name"]`. The failure surfaces at the zod boundary, NOT at the filesystem lookup.

### 4c. Path-traversal probe → `HELP_TOOL_NOT_FOUND` (FR-010)

```json
{ "method": "tools/call", "params": { "name": "help", "arguments": { "tool_name": "../../etc/passwd" } } }
```

**Expected**: `isError: true`, `code: "HELP_TOOL_NOT_FOUND"`, `availableTools` is the same list as 4a. The `message` does NOT echo `"../../etc/passwd"` — the probe is invisible to anyone reading the agent-facing message. NO file outside `docs/tools/` is read (verifiable by strace / a filesystem-spying test in unit tests).

### 4c'. Reserved-name `help({ tool_name: "index" })` → `HELP_TOOL_NOT_FOUND` (Edge Case, remediation L1a)

```json
{ "method": "tools/call", "params": { "name": "help", "arguments": { "tool_name": "index" } } }
```

**Expected**: `isError: true`, `code: "HELP_TOOL_NOT_FOUND"`, `availableTools` does NOT include `"index"` (the reserved-name guard rejects this BEFORE the filesystem read; without the guard the implementation would erroneously return `index.md`'s content). This case validates the remediation L1a fix to the handler implementation.

### 4d. Missing `docs/tools/` directory → `HELP_DOCS_MISSING` (Q4)

This case requires a deliberate corruption of the install — temporarily rename or delete `docs/tools/` and re-issue any `help` call:

```json
{ "method": "tools/call", "params": { "name": "help", "arguments": {} } }
```

**Expected**: `isError: true`, `code: "HELP_DOCS_MISSING"`, `details.resolvedDocsDir` carries the absolute path the tool was looking at, `details.ioCode` is `"ENOENT"` (or equivalent). After restoring the directory, subsequent calls succeed.

**Test mapping**: `src/tools/help/handler.test.ts` cases 3, 6, 7, 8 + `src/tools/help/schema.test.ts` case 3.

## Scenario 5 — Top-level descriptions advertise `help` (Story 3, FR-015 + FR-016)

Issue a `tools/list` request:

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
```

**Expected**: response has TWO tool descriptors. Both have a `description` field that:

- Is non-empty.
- Contains the literal substring `"help"` (case-insensitive).
- Names the tool's own name in a `help("<name>")` invocation hint.

Specifically:
- `obsidian_exec.description` matches the P5-pinned string and ends with `Call help({ tool_name: "obsidian_exec" }) for full parameter docs and the error-code roster.`.
- `help.description` matches the P5-pinned string and ends with `Self-describing — call help({ tool_name: "help" }).`.

**Test mapping**: `src/tools/help/tool.test.ts` case 1 + the registry-consistency block's description-content assertion.

## Scenario 6 — Registry-consistency gate (Q5, P6)

The `describe("registry consistency", ...)` block in `src/server.test.ts` runs as part of `npm run test`. It iterates `server.tools` and asserts:

1. Every registered tool has a `docs/tools/<tool_name>.md` file.
2. Every registered tool's `inputSchema.properties` tree contains zero `description` keys at any nesting depth.

To validate the gate is wired correctly: temporarily register a third tool in `server.ts` (e.g., `server.setRequestHandler(...)` with a new tool name `"test_undoc"`) WITHOUT creating `docs/tools/test_undoc.md`. Re-run `npm run test`. The registry-consistency test MUST fail with a clear message naming `test_undoc`. Roll back the temporary registration before merging.

To validate the bypass-detection assertion: temporarily modify `src/tools/obsidian_exec/tool.ts` to skip the `stripSchemaDescriptions` call on `inputSchema`. Re-run `npm run test`. The registry-consistency test MUST fail because the `obsidian_exec` `inputSchema.properties` tree now contains `description` keys. Roll back before merging.

**Test mapping**: `src/server.test.ts` registry-consistency block (~2 cases).

## Scenario 7 — Packaging artifact contents (Story 4 AC#1, FR-014)

Run `npm pack --dry-run` from the repo root:

```sh
npm pack --dry-run
```

**Expected**: the dry-run output enumerates the would-be tarball contents. It MUST include:

- `dist/**` (the compiled TypeScript)
- `README.md`
- `LICENSE`
- `docs/tools/help.md`
- `docs/tools/index.md`
- `docs/tools/obsidian_exec.md`
- `docs/tools/read_note.md`
- `docs/tools/write_note.md`
- `docs/tools/append_note.md`
- `docs/tools/search_vault.md`
- `docs/tools/list_notes.md`
- `docs/tools/list_vaults.md`

If any of the 9 markdown files is missing, the `package.json` `files` glob is wrong. Fix and re-run.

## Scenario 8 — cwd-independence (Story 2 AC#4 / Story 4 AC#2, FR-009 + SC-005 + SC-008)

This scenario validates that the help tool resolves doc paths relative to its own module location, NOT to `process.cwd()`. Two equivalent paths:

### 8a. Unit-test style (already in `handler.test.ts` case 4)

```ts
import { tmpdir } from "node:os";
const original = process.cwd();
try {
  process.chdir(tmpdir());
  const result = await executeHelp({ tool_name: "help" });
  expect(result.content[0].text).toContain("help"); // returns help.md regardless of cwd
} finally {
  process.chdir(original);
}
```

### 8b. Integration-style (manual)

```sh
cd /tmp                      # any directory unrelated to the package root
node /absolute/path/to/dist/index.js < some-mcp-stdin-with-help-call
```

**Expected**: the help call returns the doc contents — the server has no awareness of the spawn cwd.

The implementation guard is the absence of `process.cwd()` in `src/tools/help/handler.ts` (verifiable by grep per SC-005).

## Token-economy validation (SC-006, P7)

This is NOT a test scenario — it is a one-off measurement noted in the PR description. Before merging:

1. Check out `004-target-mode-schema` HEAD (the pre-this-BI baseline).
2. Run the MCP server and capture `tools/list` response. Measure byte size of the JSON-serialized response.
3. Check out `005-help-tool` HEAD.
4. Run the MCP server and capture `tools/list` response. Measure byte size again.
5. Record both numbers in the PR description with the percentage reduction. Expected directional outcome: ≥ 50% reduction (closer to ~70% per ADR-005's directional claim).

Example PR description line:

> **Token economy (SC-006)**: `tools/list` response 1248 bytes → 412 bytes (67% reduction).

## Coverage gate (SC-009)

Run `npm run test` and verify the aggregate statements coverage is ≥ 84.3% (the floor at [vitest.config.ts:20](../../vitest.config.ts#L20)). The new modules + their test sets are net-additive; pre-implementation projection per [research.md](./research.md#v01x-baselines-reaffirmed) is the actual coverage moves UP by ~0.4–0.6 pp once the new code paths are exercised.

If actual coverage moves up by ≥ 1.0 pp, consider ratcheting the floor in a separate visible edit per the constitution's single-source-of-truth rule.

## Constitution compliance (FR-021)

The PR landing this feature MUST update the Constitution Compliance checklist with one Y/N/N/A per principle. Expected:

- [x] Principle I (Modular Code Organization): **Y**
- [x] Principle II (Public Surface Test Coverage): **Y**
- [x] Principle III (Boundary Input Validation with Zod): **Y**
- [x] Principle IV (Explicit Upstream Error Propagation): **Y**
- [x] Principle V (Attribution & Layered Composition): **Y**

Justification per [plan.md §Constitution Check](./plan.md#constitution-check).

## Cross-references

- Spec: [spec.md](./spec.md) — User Stories 1–4, FR-001 through FR-021, SC-001 through SC-011, Edge Cases (12 enumerated)
- Plan: [plan.md](./plan.md) — Phase 0 plan-stage decisions P1–P7, Phase 1 design output, Constitution Check
- Research: [research.md](./research.md) — full rationale for P1–P7 and v0.1.x baselines
- Data model: [data-model.md](./data-model.md) — strip utility I/O shape, help-tool I/O contract, docs/tools/ inventory, error-code rows
- Contracts: [contracts/strip-schema.contract.md](./contracts/strip-schema.contract.md), [contracts/help.contract.md](./contracts/help.contract.md), [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md)
