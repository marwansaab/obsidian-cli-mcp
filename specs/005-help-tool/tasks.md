---
description: "Task list for feature 005-help-tool"
---

# Tasks: Progressive Disclosure Help Tool

**Input**: Design documents from [specs/005-help-tool/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for this feature. FR-017 mandates co-located vitest cases for both components. Counts revised by /speckit-analyze remediation 2026-05-06 (findings C1, C2, L1a/b/c) — totals went from 22 to **27 new test bodies**: 7 cases for the strip utility at `src/help/strip-schema.test.ts` (Story 1 AC#1–4 + AC#6 + non-string-`description` Edge Case + root-description preservation per FR-003), 18 cases for the help tool spread across `src/tools/help/{schema,handler,tool}.test.ts` (4 schema + 11 handler + 3 tool), and 2 cases in the `describe("registry consistency", ...)` block in `src/server.test.ts` per Clarification Q5 + plan-stage P6. Coverage floor of 84.3% statements per FR-020 + [vitest.config.ts](../../vitest.config.ts) enforces the merge gate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4); omitted for setup/foundational/polish
- File paths in descriptions are repository-relative

## Path conventions

This is a single-library MCP server (per [plan.md](./plan.md#project-structure)). Source lives at `src/`, tests are co-located as `*.test.ts` per Constitution Principle II. This BI introduces:
- A new top-level shared utility directory at `src/help/` for the strip utility (parallel to `src/cli-adapter/`, `src/target-mode/`).
- A new per-surface module folder at `src/tools/help/` (matching the `src/tools/obsidian_exec/` layout: `schema.ts`, `handler.ts`, `tool.ts`, plus their `*.test.ts` siblings).
- A new bundled documentation directory at the package root: `docs/tools/` (9 markdown files: 3 real + 6 stubs).

Modified existing files: `src/server.ts` (registers the new help tool; both registrations route through the strip utility), `src/server.test.ts` (adds the registry-consistency block per P6), `src/tools/obsidian_exec/tool.ts` (top-level description condensed per P5; `inputSchema` wrapped through the strip utility), `src/tools/obsidian_exec/tool.test.ts` (asserts the new stripped-schema + condensed-description shape), `package.json` (`files` array gains `"docs/tools/**/*.md"`), `README.md` (error-codes table gains two rows), [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) (in-place patch per [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md)).

---

## Phase 1: Setup

**Purpose**: Verify the baseline so any failure observed later is attributable to this feature, not pre-existing state.

- [X] T001 Verify baseline at HEAD: run `npm run lint && npm run typecheck && npm run build && npm test` and confirm all four pass. Capture the baseline statements-coverage number from the vitest report (currently 84.3% floor + the actual which moves with each feature) to compare against the post-implementation number in T031; the floor is 84.3% per FR-020 / [vitest.config.ts](../../vitest.config.ts), and the actual number is expected to move *up* (~0.4–0.6 pp) once T002–T028's net-additive code + 22 tests land.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The bundled `docs/tools/` directory and the `package.json` packaging declaration. Both BLOCK every user story: US1's registry-consistency test asserts every registered tool has a doc file (so docs/tools/obsidian_exec.md must exist before US1 lands); US2's help tool reads from this directory; US3's description rewrite mentions `help("obsidian_exec")` and presupposes the doc file is reachable; US4's packaging test asserts the directory ships with `npm pack`.

**⚠️ CRITICAL**: T007–T030 cannot land until T002–T006 land.

- [X] T002 Create the `docs/tools/` directory and stub the 6 future-tool docs per FR-012 + Clarification Q3. Create directory `docs/tools/` at the repo root. Inside, create six stub files — `docs/tools/read_note.md`, `docs/tools/write_note.md`, `docs/tools/append_note.md`, `docs/tools/search_vault.md`, `docs/tools/list_notes.md`, `docs/tools/list_vaults.md` — each containing the structure shown in [data-model.md §"Stub file format"](./data-model.md#stub-file-format): a level-1 heading naming the tool, the literal `<!-- TODO(BI-XXX): populate this doc -->` marker (substitute the appropriate BI number per the architecture: BI-003 for read_note, others as committed), a paragraph explaining "this tool is not yet implemented; when it ships under BI-XXX this file will document its input/output/errors/examples", and links to `index.md` and `help.md`. The TODO marker is mechanically required per FR-012 + FR-019; the rest of the stub body is plan-stage authoring. Verifies FR-012 (the stub roster) + FR-019 (TODO marker on stubs).

- [X] T003 [P] Author `docs/tools/index.md` per FR-013 + [data-model.md §"`index.md` format"](./data-model.md#indexmd-format). Header: `# Available Tools` followed by a one-paragraph blurb directing the agent to `help({ tool_name: "<name>" })` for full docs. Body: alphabetically-sorted bullet list, one per `.md` file in `docs/tools/` (excluding `index.md` itself), formatted as `- **<tool_name>** — <one-line summary>.`. Stubbed tools use the placeholder `_(documentation pending — owned by a future BI)_`; `help` and `obsidian_exec` get real one-line summaries derived from their P5-pinned top-level descriptions. As of this BI's release the list contains 8 entries. Verifies FR-013.

- [X] T004 [P] Author `docs/tools/help.md` per FR-012 + [data-model.md §"`help.md` content outline"](./data-model.md#helpmd-content-outline). Sections: `# \`help\``, `## Input` (documents `tool_name: string (optional, non-empty)` and the omitted-name default), `## Output` (named-tool returns the file; omitted returns the index), `## Errors` (`VALIDATION_ERROR` for empty/non-string, `HELP_TOOL_NOT_FOUND` for unknown tool with `details.availableTools` self-correction hint, `HELP_DOCS_MISSING` for directory-missing operator-side failure), `## Examples` (three minimal calls). The body is the response payload to `help({ tool_name: "help" })` — verbatim user-facing prose. Verifies FR-012 (help.md exists with non-stub content) + Story 2 AC#1.

- [X] T005 [P] Author `docs/tools/obsidian_exec.md` per FR-012 + Clarification Q2 + [data-model.md §"`obsidian_exec.md` content outline"](./data-model.md#obsidian_execmd-content-outline). Body transcribed from the canonical contracts at [specs/001-add-cli-bridge/contracts/obsidian_exec.tool.json](../001-add-cli-bridge/contracts/obsidian_exec.tool.json) + [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md). Sections: `# obsidian_exec`, `## Input` (per-field documentation: `command`, `parameters`, `vault`, `flags`, `copy`, `timeoutMs`, with the per-field constraints from the zod schema at [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts)), `## Output` (the `{ stdout, stderr, exitCode, argv }` shape with `exitCode: 0` literal type), `## Errors` (the seven `UpstreamError.code` values that can fire from this tool: `CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`, `VALIDATION_ERROR`, `TOOL_NOT_FOUND` — adapter-only `ERR_NO_ACTIVE_FILE` is NOT in this list because the obsidian_exec handler does not split priority-(b) per 003's Out-of-Scope clause; mention this distinction explicitly), `## Examples` (3–4 minimal calls covering specific-mode + active-mode + a clipboard call). MUST NOT carry the `<!-- TODO -->` marker (this is a non-stub per Q2). Verifies FR-012 third bullet + Q2 + Story 2 AC#5.

- [X] T006 Update `package.json` `files` array to include the bundled docs per FR-014. Open [package.json](../../package.json), change `"files": ["dist", "README.md", "LICENSE"]` to `"files": ["dist", "docs/tools/**/*.md", "README.md", "LICENSE"]`. Run `npm pack --dry-run` and verify the output enumerates all 9 docs files (`docs/tools/help.md`, `docs/tools/index.md`, `docs/tools/obsidian_exec.md`, plus the 6 stubs). Sequential after T002–T005 (depends on the files existing). Verifies FR-014 + SC-007 + Story 4 AC#1.

**Checkpoint**: Foundation ready — US1/US2/US3/US4 implementation can begin. The `docs/tools/` directory exists with 9 files (3 real + 6 stubs), `npm pack` includes them, and `package.json` is updated.

---

## Phase 3: User Story 1 — Tool registration emits a stripped JSON Schema with structural validation intact (Priority: P1) 🎯 MVP

**Goal**: Implement the schema-stripping utility (`stripSchemaDescriptions`) and apply it at every existing tool registration site. After this phase, the `obsidian_exec` tool's `inputSchema` returned via `tools/list` carries no `description` keys at any nesting level inside the `properties` tree, but all structural keys (`type`, `properties`, `required`, `enum`, `anyOf`/`oneOf`, `items`, `additionalProperties`) remain intact. The new server-level registry-consistency test asserts both invariants on every registered tool.

**Independent Test**: Run `npm test`. The strip-utility tests at `src/help/strip-schema.test.ts` (6 cases) all pass. The registry-consistency block in `src/server.test.ts` passes for the single registered tool (`obsidian_exec`). Manually issue a `tools/list` request to the running server and verify `obsidian_exec.inputSchema.properties` has no `description` keys at any depth (Story 1 AC#5 / SC-002). The token-cost reduction (SC-006) becomes empirically measurable here even before US2 lands — `tools/list` byte size drops from the ~1100-char `OBSIDIAN_EXEC_DESCRIPTION` plus per-field descriptions to the stripped shape.

### Implementation for User Story 1

- [X] T007 [US1] Create the `src/help/` directory and the strip utility file with its module header per FR-018. Run `mkdir -p src/help` (the directory does not yet exist). Create [src/help/strip-schema.ts](../../src/help/strip-schema.ts) with: (1) original-contribution header `// Original — no upstream. Pure function: deep-copy a JSON Schema and remove every \`description\` field below the root (FR-001..FR-005, ADR-005 / BI-030).` per FR-018; (2) `import` statements only as needed (no `node:fs`, no `node:path`, no `node:url`, no logger — purity per FR-005 + SC-004); (3) the typed alias `JsonSchemaObject` definition (a recursive type covering the JSON Schema constructs the walker visits) — keep it implementation-internal, not exported. The file's only export at this stage is a placeholder `export function stripSchemaDescriptions(schema: JsonSchemaObject): JsonSchemaObject { return schema; }` — T008 replaces the body. Verifies FR-001 (module path) + FR-018 (header).

- [X] T008 [US1] Implement the recursive walker body of `stripSchemaDescriptions` in [src/help/strip-schema.ts](../../src/help/strip-schema.ts) per FR-002 + FR-003 + FR-004 + FR-005 + plan-stage P2. Body: `const clone = structuredClone(schema); walk(clone); return clone;` where `walk(node)` is a recursive helper that, for any object node: (a) deletes `node.properties[k].description` for each k in `node.properties` (if `node.properties` exists), (b) recurses into each value of `node.properties`, (c) recurses into `node.items` (if present and an object — handles both single-tuple and per-position-tuple-array cases), (d) recurses into each element of `node.anyOf` and `node.oneOf` (if either is an array), (e) recurses into `node.additionalProperties` (if present AND an object — boolean is left alone). Inside `walk(node)`, BEFORE recursing, also delete `node.description` IF the recursion is below the root (passed via a `depth >= 1` flag, so the root's own `description` is preserved per FR-003). Equivalent implementation: walk first calls `walkChildren(clone)` from within `stripSchemaDescriptions`, where `walkChildren` deletes `description` on any visited child object before recursing — preserving root-level description without an explicit depth flag. The walker explicitly does NOT visit `definitions` / `$defs` / `$ref` targets per the project's `$refStrategy: "none"` invocation pattern. Sequential after T007 (same file).

- [X] T009 [US1] Author the co-located vitest cases at [src/help/strip-schema.test.ts](../../src/help/strip-schema.test.ts) per FR-017 strip-utility minimum + recommended additions + remediation C2, with the file header per FR-018. Header: `// Original — no upstream. Co-located vitest cases for the schema-stripping utility (FR-017: 4 minimum + 2 recommended + 1 C2 remediation).`. Imports: `import { describe, it, expect } from "vitest"; import { z } from "zod"; import { zodToJsonSchema } from "zod-to-json-schema"; import { stripSchemaDescriptions } from "./strip-schema.js";`. **Seven** test bodies (case 7 added by /speckit-analyze remediation finding C2) inside one `describe("stripSchemaDescriptions", () => { ... })` block per [data-model.md §"Test coverage map"](./data-model.md#test-coverage-map):
   - **Case 1 (Story 1 AC#1)** — flat schema strip: build `z.object({ name: z.string().describe("a name"), age: z.number().describe("an age") })`, run through `zodToJsonSchema` then `stripSchemaDescriptions`, assert `result.properties.name.description` is `undefined`, `result.properties.age.description` is `undefined`, `result.properties.name.type === "string"`, `result.properties.age.type === "number"`.
   - **Case 2 (Story 1 AC#2)** — nested schema strip: build a discriminated union `z.discriminatedUnion("kind", [z.object({ kind: z.literal("a"), items: z.array(z.object({ id: z.string().describe("inner") })) }), z.object({ kind: z.literal("b"), other: z.string().describe("other") })])`, run through; assert `JSON.stringify(result).includes("description")` is `false` (no `description` key at any depth in any branch).
   - **Case 3 (Story 1 AC#3)** — no-descriptions input: build a schema with zero `.describe()` annotations, run through, assert `JSON.stringify(result) === JSON.stringify(input)` (structural equivalence, no errors, no missing keys).
   - **Case 4 (Story 1 AC#4)** — mutation safety: snapshot the input via `const snapshot = structuredClone(rawJsonSchema)`, call `stripSchemaDescriptions(rawJsonSchema)`, assert `rawJsonSchema` deep-equals `snapshot` post-call (`expect(rawJsonSchema).toEqual(snapshot)`).
   - **Case 5 (Story 1 AC#6, recommended)** — structural-key preservation: build a schema with `enum`, `anyOf`, `additionalProperties: false`, `pattern`, `default`, `minLength`; run through; verify each structural key is preserved at its original location.
   - **Case 6 (recommended, Edge Case "non-string description value")** — non-string `description`: construct a JSON Schema object literal in-test (don't go through zod) with `properties.foo.description = { malformed: "object" }`; run through; assert `result.properties.foo.description` is `undefined` (the strip is keyed on field name, not value type).
   - **Case 7 (FR-003, Edge Case "Top-level (root) description on the JSON Schema input", remediation C2)** — root-description preservation: build `z.object({ inner: z.string().describe("inner field") }).describe("root description goes here")`; run through `zodToJsonSchema` → assert `raw.description === "root description goes here"` (verifies zod-to-json-schema preserves root description); call `stripSchemaDescriptions(raw)`; assert `result.description === "root description goes here"` (root preserved per FR-003) AND `result.properties.inner.description` is `undefined` (inner stripped). Closes the explicit FR-003 coverage gap surfaced by /speckit-analyze.
   Sequential after T008 (depends on the function being implemented). Verifies FR-017 strip-utility minimum + FR-003 explicitly + SC-002 + SC-004.

- [X] T010 [US1] Update [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts) to wrap `obsidianExecInputJsonSchema` through `stripSchemaDescriptions` per FR-006. Specifically: (1) add the import `import { stripSchemaDescriptions } from "../../help/strip-schema.js";` near the top with the existing imports; (2) at the existing `inputSchema: obsidianExecInputJsonSchema as ...` line ([tool.ts:42](../../src/tools/obsidian_exec/tool.ts#L42)), change to `inputSchema: stripSchemaDescriptions(obsidianExecInputJsonSchema) as Record<string, unknown>`. The cast simplifies because the strip return type is the same as the input. The top-level `OBSIDIAN_EXEC_DESCRIPTION` constant is NOT touched in this task — that's T021 (US3). Sequential after T008 (depends on stripSchemaDescriptions existing). Verifies FR-006 applied to obsidian_exec.

- [X] T011 [US1] Update [src/tools/obsidian_exec/tool.test.ts](../../src/tools/obsidian_exec/tool.test.ts) to assert the stripped-schema property per Story 1 AC#5 + SC-002. Add one new `it(...)` case (or augment an existing tools/list assertion if one already covers `inputSchema` shape — verify by reading the file): after the existing tools/list test setup, walk the returned `tool.inputSchema` recursively and assert no `description` key exists at any depth inside `properties` / `items` / `anyOf` / `oneOf` / `additionalProperties` (a small `assertNoDescriptions(node)` helper inside the test file is acceptable). The test does NOT yet need to cover the help tool — that's T020 (US2) + T012 (the registry-consistency block). Sequential after T010 (same file). Verifies SC-010 (obsidian_exec inputSchema description-free post-this-BI).

- [X] T012 [US1] Add the `describe("registry consistency", () => { ... })` block to [src/server.test.ts](../../src/server.test.ts) per Clarification Q5 + plan-stage P6. Location: at the bottom of the file, after the existing test blocks. Body: ONE `describe` containing TWO `it(...)` cases:
   - **Case (a)** — every registered tool has a doc file: spin up the server via the existing test harness, capture the registered-tool list (via the SDK's tools/list handler or by inspecting whatever surface the existing server.test.ts already uses), and for each tool name, assert that `docs/tools/<tool_name>.md` exists relative to the package root. Use `node:fs/promises`'s `access` (or `existsSync` from `node:fs` if simpler in test code). Resolves the path the same way the help handler does — via `import.meta.url` — so the test passes regardless of cwd. As of US1 only `obsidian_exec` is registered, so the test asserts `docs/tools/obsidian_exec.md` exists (which T005 produced).
   - **Case (b)** — every registered tool's stripped `inputSchema.properties` tree is description-free: same harness; for each tool, recursively walk the `inputSchema` and assert no `description` keys appear inside `properties`/`items`/`anyOf`/`oneOf`/`additionalProperties` at any depth. As of US1 only `obsidian_exec` is registered; T010 ensured its inputSchema is stripped, so the test passes.
   The test file MUST carry the original-contribution header per FR-018 if it does not already (it already does — preserve it). Sequential after T010 + T011 (depends on the obsidian_exec strip wiring). Verifies SC-002 + SC-011 + the bypass-detection assertion from the Edge Case "Tool registration via the SDK that bypasses the stripping utility".

**Checkpoint**: US1 fully functional and testable independently. The strip utility ships, `obsidian_exec`'s registration applies it, and the registry-consistency gate passes for the single registered tool. The MVP is shippable here — the token-economy property holds even without the help tool, just for the existing single-tool surface.

---

## Phase 4: User Story 2 — `help` tool serves a tool's full Markdown documentation on demand (Priority: P1)

**Goal**: Register the new `help` MCP tool. After this phase, MCP clients can call `help({ tool_name: "<name>" })` and receive the contents of `docs/tools/<name>.md`, or `help({})` to receive the index. Three failure surfaces — `VALIDATION_ERROR` (empty/non-string), `HELP_TOOL_NOT_FOUND` (unknown tool, traversal probe), `HELP_DOCS_MISSING` (directory missing) — flow through `UpstreamError`. Doc-file resolution is anchored to `import.meta.url`, NOT `process.cwd()`.

**Independent Test**: With the help tool registered, `npm test` runs the 14 new test bodies across `src/tools/help/{schema,handler,tool}.test.ts`. The cwd-independence case in `handler.test.ts` (case 4) verifies path resolution survives `process.chdir()`. The registry-consistency block from T012 now asserts both `obsidian_exec` AND `help` have doc files (passes because T004 produced `docs/tools/help.md`) AND both have description-free stripped schemas (passes because T019 wires `help` registration through the strip utility).

### Implementation for User Story 2

- [X] T013 [P] [US2] Create the `src/tools/help/` directory and author [src/tools/help/schema.ts](../../src/tools/help/schema.ts) with the file header + zod schema + JSON Schema export. Run `mkdir -p src/tools/help`. File header per FR-018: `// Original — no upstream. Canonical zod schema for the help tool — single source of truth (Principle III, FR-007).`. Body matches the precedent at [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts):
   ```ts
   import { z } from "zod";
   import { zodToJsonSchema } from "zod-to-json-schema";

   export const helpInputSchema = z
     .object({
       tool_name: z.string().min(1).optional(),
     })
     .strict();

   export type HelpInput = z.infer<typeof helpInputSchema>;

   export const helpInputJsonSchema = zodToJsonSchema(helpInputSchema, {
     $refStrategy: "none",
   }) as Record<string, unknown>;
   ```
   The `.min(1)` is per Clarification Q1 (empty-string `tool_name` rejected at the zod boundary). The `.strict()` rejects unknown keys. Verifies FR-007 + Q1 + plan-stage P3.

- [X] T014 [US2] Author co-located vitest cases at [src/tools/help/schema.test.ts](../../src/tools/help/schema.test.ts) per FR-017 (schema-test minimum + remediation C1). Header: `// Original — no upstream. Co-located vitest cases for the help input schema (FR-017 + C1 remediation).`. Imports: `import { describe, it, expect } from "vitest"; import { helpInputSchema } from "./schema.js";`. **Four** test bodies (case 4 added by /speckit-analyze remediation finding C1) inside one `describe("helpInputSchema", () => { ... })` block:
   - **Case 1 (Story 2 AC#2)** — omitted `tool_name` parses successfully: `helpInputSchema.safeParse({})` → `result.success === true` and `result.data.tool_name` is `undefined`.
   - **Case 2 (Story 2 AC#1)** — non-empty `tool_name` parses: `helpInputSchema.safeParse({ tool_name: "obsidian_exec" })` → `result.success === true` and `result.data.tool_name === "obsidian_exec"`.
   - **Case 3 (Q1, Edge Case `help({ tool_name: "" })`)** — empty-string `tool_name` rejected: `helpInputSchema.safeParse({ tool_name: "" })` → `result.success === false` and at least one issue has `.path` containing `"tool_name"` AND `.code === "too_small"` (zod's code for `.min(1)` failures on strings).
   - **Case 4 (Story 2 AC#6, remediation C1)** — non-string `tool_name` rejected at zod boundary: `helpInputSchema.safeParse({ tool_name: 42 })` → `result.success === false`; assert at least one issue has `.path` containing `"tool_name"` AND `.code === "invalid_type"` (zod's code for type-mismatch on `z.string()`). Cover `null` and `boolean` variants in the same case if expedient (a small loop over `[42, null, true, []]`); each MUST fail with `path` including `"tool_name"`. Closes the explicit Story 2 AC#6 coverage gap surfaced by /speckit-analyze.
   Sequential after T013 (depends on the schema being defined). Verifies FR-007 + Q1 + Story 2 AC#6 explicitly.

- [X] T015 [P] [US2] Author [src/tools/help/handler.ts](../../src/tools/help/handler.ts) with the file header + handler implementation per FR-008 + FR-009 + FR-010 + FR-011 + plan-stage P4. Header per FR-018: `// Original — no upstream. help tool handler: directory check, path resolution, traversal defense, file read (FR-008..FR-011, P4).`. Implementation follows [research.md §"Help-tool handler implementation sketch"](./research.md#help-tool-handler-implementation-sketch) — see also [contracts/help.contract.md §"Behavioural contract"](./contracts/help.contract.md). Imports:
   ```ts
   import { readFile, access, readdir } from "node:fs/promises";
   import { resolve, relative, dirname, join, sep } from "node:path";
   import { fileURLToPath } from "node:url";

   import { UpstreamError } from "../../errors.js";

   import type { HelpInput } from "./schema.js";
   ```
   Module-level constants:
   ```ts
   const HERE = dirname(fileURLToPath(import.meta.url));
   export const DOCS_DIR = resolve(HERE, "../../docs/tools");
   ```
   Export `executeHelp(input: HelpInput): Promise<{ content: Array<{ type: "text"; text: string }> }>` with the **five** behavioural branches per FR-008 + remediation L1a (branch 3 is the reserved-name guard added by /speckit-analyze):
   1. Directory check via `access(DOCS_DIR)` — on rejection, throw `UpstreamError` with `code: "HELP_DOCS_MISSING"`, `cause: <the access error>`, `details: { resolvedDocsDir: DOCS_DIR, ioCode: (cause as NodeJS.ErrnoException)?.code }`, `message: \`docs/tools/ directory missing or unreadable at ${DOCS_DIR}\``.
   2. If `input.tool_name === undefined`, return `{ content: [{ type: "text", text: await readFile(join(DOCS_DIR, "index.md"), "utf8") }] }`.
   3. **Reserved-name guard (remediation L1a, Edge Case `help({ tool_name: "index" })`)**: if `input.tool_name === "index"`, throw `await notFound(input.tool_name, DOCS_DIR)`. WITHOUT this guard, the implementation would fall through to branch 5's filesystem read and erroneously return `index.md`'s contents — but the spec edge case binds `help({ tool_name: "index" })` to fail with `HELP_TOOL_NOT_FOUND`. The `notFound` helper's `availableTools` list (constructed by filtering `readdir` results to `.md` files excluding `index.md`) preserves the spec's "list excludes index" requirement automatically.
   4. Path-traversal defense (P4): if `input.tool_name.includes("\0")` → throw `await notFound(input.tool_name, DOCS_DIR)`. Then `const candidate = resolve(DOCS_DIR, \`${input.tool_name}.md\`); const rel = relative(DOCS_DIR, candidate);` — if `rel.startsWith("..")` OR `rel.includes(sep)` → throw `await notFound(...)`.
   5. `try { return { content: [{ type: "text", text: await readFile(candidate, "utf8") }] }; } catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") throw await notFound(input.tool_name, DOCS_DIR); throw cause; }`.
   Helper `notFound(requestedName: string, docsDir: string): Promise<never>`: read `await readdir(docsDir)`, filter to `.md` files excluding `index.md`, strip the `.md` suffix, sort alphabetically, then throw `UpstreamError` with `code: "HELP_TOOL_NOT_FOUND"`, `cause: null`, `details: { requestedName, availableTools }`, `message: \`No documentation file for the requested tool. Available tools: ${availableTools.join(", ")}.\`` (does NOT echo `requestedName` per FR-010). MUST NOT reference `process.cwd()` anywhere (verifiable by grep per SC-005). Verifies FR-008 + FR-009 + FR-010 + FR-011 + P4 + Q1 + Q4.

- [X] T016 [US2] Author co-located vitest cases at [src/tools/help/handler.test.ts](../../src/tools/help/handler.test.ts) per FR-017 (handler-test minimum + remediation L1a/b/c). Header: `// Original — no upstream. Co-located vitest cases for the help handler (FR-017 + L1 remediation: 11 cases covering AC#1-6 + Q4 + traversal + reserved-name + empty-file + orphan).`. **Eleven** test bodies (cases 9, 10, 11 added by /speckit-analyze remediation findings L1a, L1b, L1c) inside one `describe("executeHelp", () => { ... })` block, each per [data-model.md §"Test coverage map"](./data-model.md#test-coverage-map). The tests use a pre-existing fixtures harness (the BI's tests run against the real `docs/tools/` directory created by T002–T005, since path resolution is anchored to `import.meta.url` — at vitest runtime the resolved DOCS_DIR points to `<repo-root>/src/tools/help/../../../docs/tools/` which equals `<repo-root>/docs/tools/` because Node executes the source files via vite's TS loader, NOT the compiled dist; per [vitest.config.ts](../../vitest.config.ts) this is the standard test execution model). For the missing-directory case (case 7), the test temporarily moves the `docs/tools/` directory aside (or uses a separate vitest fixture that overrides DOCS_DIR via dependency injection — author the simplest approach that works given how DOCS_DIR is exported):
   - **Case 1 (Story 2 AC#1)**: `executeHelp({ tool_name: "obsidian_exec" })` returns `content[0].text` matching the contents of `docs/tools/obsidian_exec.md` from T005.
   - **Case 2 (Story 2 AC#2)**: `executeHelp({})` returns `content[0].text` matching `docs/tools/index.md` from T003.
   - **Case 3 (Story 2 AC#3)**: `executeHelp({ tool_name: "nonexistent_xyz" })` rejects with `UpstreamError`; `error.code === "HELP_TOOL_NOT_FOUND"`; `error.details.availableTools` is a non-empty array; `error.message.includes("nonexistent_xyz")` is `false` (anti-injection per FR-010).
   - **Case 4 (Story 2 AC#4 / Story 4 AC#2)** — cwd-independence: `const original = process.cwd(); try { process.chdir(os.tmpdir()); const result = await executeHelp({ tool_name: "help" }); expect(result.content[0].text.length).toBeGreaterThan(0); } finally { process.chdir(original); }`. Verifies SC-005 + SC-008.
   - **Case 5 (Story 2 AC#5)**: `executeHelp({ tool_name: "obsidian_exec" })` returns the FULL doc content (not a stub) — assert the returned text does NOT contain `<!-- TODO(BI-` (the stub marker).
   - **Case 6 (Story 2 AC#6 — defensive)**: schema-level rejection of non-string `tool_name` is covered by T014 case 4; add a defensive case here that pre-parsed input shape is what `executeHelp` expects (a typed `HelpInput`, not a raw `unknown` from the SDK).
   - **Case 7 (Q4, Edge Case "docs/tools/ directory missing")**: temporarily rename `docs/tools/` to `docs/tools.bak/` (or use DI to point at a non-existent path), call `executeHelp({})`, expect `UpstreamError` with `code === "HELP_DOCS_MISSING"`; restore in `finally` block.
   - **Case 8 (Edge Case "path traversal", FR-010)**: `executeHelp({ tool_name: "../../../etc/passwd" })` rejects with `HELP_TOOL_NOT_FOUND`; `error.message` does NOT include `"passwd"`; verify with a filesystem spy or post-call `existsSync` that no file outside `docs/tools/` was read.
   - **Case 9 (Edge Case `help({ tool_name: "index" })`, remediation L1a)**: `executeHelp({ tool_name: "index" })` rejects with `UpstreamError`; `error.code === "HELP_TOOL_NOT_FOUND"`; `error.details.availableTools` is a non-empty array AND does NOT include `"index"`; `error.message` does NOT include `"index"` (anti-injection — `requestedName` lives only in `details`). This case asserts the reserved-name guard added to T015's branch 3. Closes the latent correctness bug surfaced by /speckit-analyze.
   - **Case 10 (Edge Case "doc file exists but is empty", remediation L1b)**: temporarily create `docs/tools/_empty.md` as a zero-byte file (or use DI), invoke `executeHelp({ tool_name: "_empty" })`, assert `result.content[0].text === ""` (empty string success — the `help` tool does not validate doc-file content per FR-008). Cleanup in `finally`. Verifies the documented Edge Case.
   - **Case 11 (Edge Case "doc file exists but no tool with that name is registered", remediation L1c)**: leverage the existing six stub files (e.g., `read_note.md` per T002) — none of those tools are registered yet, so `executeHelp({ tool_name: "read_note" })` should succeed and return the stub's content. Assert `result.content[0].text.includes("<!-- TODO(BI-")` (the stub marker). This locks in FR-008's filesystem-as-source-of-truth design and prevents future regressions where someone might add a registry-cross-reference check.
   Sequential after T015 (depends on `executeHelp` being implemented). Verifies FR-008 + FR-010 + Q4 + 4 Edge Cases.

- [X] T017 [US2] Author [src/tools/help/tool.ts](../../src/tools/help/tool.ts) — the SDK registration with stripped schema and the P5-pinned top-level description. Header per FR-018: `// Original — no upstream. help MCP tool registration: ListTools + CallTool dispatch with progressive-disclosure docs (FR-007, FR-016, P5).`. Mirrors the obsidian_exec pattern at [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts):
   - Imports: `import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"; import { ZodError } from "zod"; import { stripSchemaDescriptions } from "../../help/strip-schema.js"; import { executeHelp } from "./handler.js"; import { helpInputSchema, helpInputJsonSchema } from "./schema.js"; import { UpstreamError } from "../../errors.js"; import type { Server } from "@modelcontextprotocol/sdk/server/index.js";`
   - Constants: `export const HELP_TOOL_NAME = "help";` and `export const HELP_DESCRIPTION = "Look up full Markdown documentation for any registered MCP tool. Call help() with no arguments for an index of available docs, or help({ tool_name: \"<name>\" }) for a specific tool's full parameter docs. Self-describing — call help({ tool_name: \"help\" })."` (the P5-pinned string).
   - Function `registerHelpTool(server: Server): void` that adds the help tool to the server's tool dispatch. CRITICAL: T019 wires this into the existing `setRequestHandler(ListToolsRequestSchema, ...)` so BOTH tools are returned in tools/list. Look at the existing pattern: the obsidian_exec registration uses `server.setRequestHandler(ListToolsRequestSchema, ...)` and `server.setRequestHandler(CallToolRequestSchema, ...)` directly — the SDK only allows ONE handler per request type. So the registration is either: (a) `registerHelpTool` returns the tool descriptor + the call-handler, and `server.ts` aggregates both tools' descriptors and dispatches by name; OR (b) the existing `registerObsidianExecTool` is refactored to merge help into its dispatch. Choose (a) — refactor the existing `registerObsidianExecTool` to NOT call `setRequestHandler` directly but instead return its descriptor + handler, and add a new `registerTools(server, [obsidianExecTool, helpTool])` aggregator in server.ts. This is cleaner long-term but is a small scope expansion. Alternative: keep the existing pattern as-is and have `registerHelpTool` REPLACE the existing handler with one that knows both tools — uglier but smaller diff. Plan-stage chooses; this task implements approach (a) for cleanliness.
   - Inside the dispatch: validate `req.params.arguments` via `helpInputSchema.parse(req.params.arguments)`; on `ZodError`, return `asToolError({ code: "VALIDATION_ERROR", message: "help input failed schema validation", details: { issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })) } })`. On success, await `executeHelp(parsed)`; on `UpstreamError`, return `asToolError({ code: err.code, message: err.message, details: err.details })`. Re-use or import `asToolError` (currently in obsidian_exec/tool.ts at lines 29-34) — extract to a shared `src/tools/_shared/error-response.ts` if convenient, or duplicate the 5-line helper inline. Plan-stage chooses; minimal-diff is to duplicate.
   - The tool descriptor object includes `name: HELP_TOOL_NAME`, `description: HELP_DESCRIPTION`, `inputSchema: stripSchemaDescriptions(helpInputJsonSchema)`. Verifies FR-006 + FR-007 + FR-016 + plan-stage P5.

- [X] T018 [US2] Author co-located vitest cases at [src/tools/help/tool.test.ts](../../src/tools/help/tool.test.ts) per FR-017 (tool-test minimum). Header per FR-018. Three test bodies inside one `describe("help tool registration", () => { ... })` block:
   - **Case 1 (Story 3 AC#3 + FR-016 + SC-003)** — top-level description mentions `help("help")`: import `HELP_DESCRIPTION` from `./tool.js`; assert it is a non-empty string; assert it includes the substring `"help("` AND somewhere later the substring `"help"` again (i.e., `help("help")` is mentioned).
   - **Case 2 (Story 1 AC#5 + FR-006 + SC-002)** — stripped `inputSchema` has no description in `properties` tree: spin up a server harness, register the help tool, capture the inputSchema from the tools/list response, walk the `properties` tree and assert no `description` key at any depth.
   - **Case 3 (FR-011)** — `HELP_TOOL_NOT_FOUND` round-trip: invoke the help tool via the SDK dispatch with `{ tool_name: "nonexistent_xyz" }`, capture the response, assert `result.isError === true`, parse `result.content[0].text` as JSON, assert the parsed object has `code: "HELP_TOOL_NOT_FOUND"` and a non-empty `details.availableTools`.
   Sequential after T017 (depends on the registration). Verifies FR-006 + FR-011 + FR-016 + Story 1 AC#5 + Story 3 AC#3.

- [X] T019 [US2] Update [src/server.ts](../../src/server.ts) to register the help tool alongside `obsidian_exec` per FR-006 (both registrations route through the strip utility, which is already done in T010 for obsidian_exec and T017 for help) and the aggregator pattern from T017. Specifically: add the import `import { registerHelpTool } from "./tools/help/tool.js";` and call `registerHelpTool(server, ...)` in `createServer` after the existing `registerObsidianExecTool(...)` call. If T017 chose approach (a) — return tool descriptors + handler instead of directly calling `setRequestHandler` — then refactor the existing `registerObsidianExecTool` similarly and aggregate both at this level. The end-state: `tools/list` returns BOTH descriptors; `tools/call` dispatches by name. Sequential after T017 (depends on the help tool's registration function existing). Verifies FR-006 applied to help + Story 2 AC#1 + Story 3 AC#1.

- [X] T020 [US2] Update [src/server.test.ts](../../src/server.test.ts) to verify both tools register. Per /speckit-analyze remediation L3, this task augments the EXISTING tools/list test inline (NOT add a new `it` block) — the test count summary in [research.md](./research.md#test-count-summary) and [data-model.md](./data-model.md#test-coverage-map) does not gain an entry. Specifically: locate the existing tools/list assertion (or the assertion added incidentally during the T019 aggregator-pattern refactor); add a length check that `tools.length === 2`; assert the descriptor names array equals `["obsidian_exec", "help"]` (sort first if order is not stable). The registry-consistency block from T012 automatically extends — its iteration covers the live registry, so it now asserts both `obsidian_exec.md` and `help.md` exist (T002 + T004 produced them) AND both tools' stripped schemas are description-free (T010 + T017 wired the strip). Sequential after T019 (same file as T012's block; depends on the help tool registration). Verifies SC-002 + SC-003 + SC-011 for both tools.

**Checkpoint**: US2 fully functional and testable independently. Help tool returns docs for any registered tool by name, returns the index for empty input, and surfaces three structured failure modes (`VALIDATION_ERROR`, `HELP_TOOL_NOT_FOUND`, `HELP_DOCS_MISSING`). Path resolution is cwd-independent.

---

## Phase 5: User Story 3 — Top-level descriptions advertise `help()` (Priority: P1)

**Goal**: Condense `obsidian_exec`'s existing 200-word top-level description to the P5-pinned verb-led summary that mentions `help("obsidian_exec")`. The help tool's own top-level description is already pinned at T017. After this phase, every registered tool's `tools/list` description is concise and points to `help` for full parameter docs.

**Independent Test**: An MCP client calling `tools/list` receives both descriptors. Each `description` is non-empty, contains the literal substring `"help"`, and references invoking it with the tool's own name (e.g., `obsidian_exec`'s description mentions `help("obsidian_exec")`). The token-economy reduction (SC-006) is empirically realized — `tools/list` byte size drops materially compared to the 004-target-mode-schema HEAD baseline.

### Implementation for User Story 3

- [X] T021 [US3] Condense the top-level `OBSIDIAN_EXEC_DESCRIPTION` constant in [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts#L15-L16) per FR-015 + plan-stage P5. Replace the existing ~200-word string with the P5-pinned exact wording: `"Invoke any Obsidian Integrated CLI subcommand. Returns stdout, stderr, exitCode, and the exact argv invoked. Failures (non-zero exit, in-band Error: prefix, missing binary, timeout, output > 10 MiB) surface as structured errors with stable codes. Call help({ tool_name: \"obsidian_exec\" }) for full parameter docs and the error-code roster."`. The semantic intent is preserved (verb-led summary + return shape + failure-mode summary); the volume drops from ~1100 chars to ~340 chars (~70% reduction) — corroborates SC-006 directional claim. Sequential after T010 (same file). Verifies FR-015 + Story 3 AC#2 + SC-010.

- [X] T022 [US3] Update [src/tools/obsidian_exec/tool.test.ts](../../src/tools/obsidian_exec/tool.test.ts) to assert the new description shape per Story 3 AC#1 + FR-015 + SC-003. If the existing tool.test.ts has assertions on the old `OBSIDIAN_EXEC_DESCRIPTION` text (likely — search for `"Invoke any Obsidian Integrated CLI subcommand"` or similar literal-match patterns), update them to the new P5 wording OR replace the literal-match assertions with structural checks: assert the description is non-empty, includes `"help("` (with the open paren — the agent-recovery hint), AND includes `"obsidian_exec"` (so the help reference targets this tool, not a generic `"<name>"`). The structural-check approach is more robust against future minor wording tweaks. Sequential after T021 (same file). Verifies SC-003 + SC-010.

**Checkpoint**: US3 fully functional. Both registered tools have concise verb-led descriptions that mention `help("<name>")`. The `tools/list` response is materially smaller than the pre-this-BI baseline.

---

## Phase 6: User Story 4 — Doc directory is bundled with the package and resolved from the module's own location (Priority: P2)

**Goal**: Verify the operational property that ties US1–US3 together at release time — the `docs/tools/` directory is bundled by `npm pack` and reachable at runtime regardless of the server's spawn cwd. This phase is mostly verification: T006 already updated `package.json` and T016 case 4 already covers cwd-independence at the unit level. T023 adds the explicit packaging-artifact check.

**Independent Test**: Run `npm pack --dry-run`. The output enumerates `docs/tools/help.md`, `docs/tools/index.md`, `docs/tools/obsidian_exec.md`, and the 6 stub files. Run `npm test` — the cwd-independence handler test (T016 case 4) passes.

### Implementation for User Story 4

- [X] T023 [US4] Verify `npm pack --dry-run` includes the bundled docs per FR-014 + Story 4 AC#1 + SC-007. Run `npm pack --dry-run` from the repo root. Capture stdout. Confirm the output enumerates ALL of: `docs/tools/help.md`, `docs/tools/index.md`, `docs/tools/obsidian_exec.md`, `docs/tools/read_note.md`, `docs/tools/write_note.md`, `docs/tools/append_note.md`, `docs/tools/search_vault.md`, `docs/tools/list_notes.md`, `docs/tools/list_vaults.md` — 9 markdown files total. If any file is missing, T006's `package.json` `files` glob is wrong (or T002–T005 didn't all land); fix and re-verify. This task is a manual verification step, not a vitest case — note the dry-run output in the PR description. Sequential after T006 + T002 + T003 + T004 + T005 (depends on the files existing AND being matched by the files glob). Verifies FR-014 + SC-007 + Story 4 AC#1.

- [X] T024 [US4] Confirm cwd-independence is asserted by an automated test (T016 case 4 already covers this at the handler-unit level). No new test is needed — this task is a verification checkpoint that T016 case 4 was authored correctly. Re-read [src/tools/help/handler.test.ts](../../src/tools/help/handler.test.ts) case 4: confirm it (a) saves `process.cwd()`, (b) calls `process.chdir(<temp-dir>)`, (c) invokes `executeHelp({ tool_name: "help" })`, (d) asserts the response is non-empty (the file resolved successfully despite the cwd change), (e) restores cwd in a `finally` block. If T016 case 4 does not satisfy these requirements, augment it. Sequential after T016. Verifies SC-005 + SC-008 + Story 4 AC#2.

**Checkpoint**: US4 fully verified. The package ships with bundled docs; the help tool resolves them from the module location, not cwd.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation-layer updates (errors contract, README), the SC-006 measurement, and the final merge-gate verification.

- [X] T025 [P] Apply the canonical errors-contract patch per FR-011 + [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md). Open [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md). Insert the two new sections (`### HELP_TOOL_NOT_FOUND` and `### HELP_DOCS_MISSING`) after the existing `ERR_NO_ACTIVE_FILE` section's priority-discrimination blockquote (currently around line 132 in the v0.1.3 baseline) and BEFORE the `## Serialization to MCP` heading. The exact body of each section is in [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md). Append the four new test-coverage bullets to the `## Test coverage requirements (Principle II)` list at the bottom of the file. Update the `## Serialization to MCP` paragraph (around line 160) to mention the new codes follow the same `cause`-omission rule. Verifies FR-011.

- [X] T026 [P] Update [README.md](../../README.md) error-codes table to add rows for `HELP_TOOL_NOT_FOUND` and `HELP_DOCS_MISSING` per FR-011 + the precedent set by features 002 + 003. Find the existing error-codes table (search for `CLI_NON_ZERO_EXIT` or the table heading). Add two rows matching the table's existing column layout — typically `| Code | When | Recovery |` or similar. Phrase the recovery columns per [data-model.md §"4. New error codes in the canonical errors contract"](./data-model.md#4-new-error-codes-in-the-canonical-errors-contract): for `HELP_TOOL_NOT_FOUND` the recovery is "agent-side: pick a name from `details.availableTools`"; for `HELP_DOCS_MISSING` the recovery is "operator-side: publish/install fix; not agent-recoverable". Verifies FR-011.

- [X] T027 Capture the SC-006 token-economy measurement per plan-stage P7 + Quickstart Scenario "Token-economy validation". Record both numbers in the PR description as a one-liner. (1) Check out the previous feature's HEAD (`git log --oneline | head` to find `004-target-mode-schema`'s merge commit, e.g., `b68f9fa`) — note the byte size of `tools/list` response by spinning up the server briefly and capturing it via a one-shot script (or by inspecting the existing `obsidian_exec.test.ts` snapshot if one exists). (2) Re-build at this BI's HEAD; capture the new byte size. (3) Compute the percentage reduction. Expected directional outcome ≥ 50% reduction (closer to ~70% per ADR-005). If the realized reduction is materially below ~50%, flag it in the PR description but do NOT block merge — the strip utility's correctness is independent of the realized reduction (per [research.md](./research.md) §"P7"). The PR description gains a line like: `**Token economy (SC-006)**: \`tools/list\` response 1248 bytes → 412 bytes (67% reduction).` Verifies SC-006.

- [X] T028 Verify the Constitution Compliance checklist per FR-021. The PR description MUST include exactly this block (per the constitution v1.1.0 §Development Workflow #8):
   ```
   - [ ] Principle I (Modular Code Organization): Y
   - [ ] Principle II (Public Surface Test Coverage): Y
   - [ ] Principle III (Boundary Input Validation with Zod): Y
   - [ ] Principle IV (Explicit Upstream Error Propagation): Y
   - [ ] Principle V (Attribution & Layered Composition): Y
   ```
   Justification per [plan.md §Constitution Check](./plan.md#constitution-check). All five Y. No deviations. Verifies FR-021.

- [X] T029 Run the full quickstart verification per [quickstart.md](./quickstart.md). Execute Scenarios 1–8 manually (or as automated test runs where applicable) and confirm each passes. Specifically: Scenarios 1–4 are unit-test driven (covered by T009 + T014 + T016 + T018) and pass when `npm test` passes; Scenarios 5–6 are server-test-block driven (covered by T012 + T020) and pass when `npm test` passes; Scenario 7 is the manual `npm pack --dry-run` check from T023; Scenario 8 is the cwd-independence check (covered by T016 case 4 / T024). The token-economy measurement at the end of quickstart.md is T027.

- [X] T030 Run `npm run lint && npm run typecheck && npm run build && npm test` and confirm all four pass. Capture the actual statements-coverage number. Compare to the T001 baseline. The expected delta is +0.4 to +0.6 pp (the new code is small and exhaustively tested per [research.md](./research.md) §"v0.1.x baselines reaffirmed"). The merge-gate floor at [vitest.config.ts:20](../../vitest.config.ts#L20) is 84.3% statements; the actual MUST be ≥ 84.3% per FR-020 + SC-009. If the actual is materially HIGHER than the floor (e.g., +1.0 pp or more), consider ratcheting the floor in a separate visible edit per the constitution's single-source-of-truth rule (do NOT bundle the ratchet into this BI's commit — it's a separate one-line edit). Verifies FR-020 + SC-009.

- [X] T031 Final review — read through [spec.md](./spec.md) and [plan.md](./plan.md), then walk the diff with [quickstart.md](./quickstart.md) open. Confirm every FR (FR-001 through FR-021) and every SC (SC-001 through SC-011) has a corresponding implementation + test. Confirm the five clarification answers (Q1 zod boundary, Q2 obsidian_exec full doc, Q3 hybrid stub roster, Q4 distinct error code, Q5 registry-consistency test) are all reflected in the diff. Confirm Constitution Principles I–V all evaluate Y per T028. Use this opportunity to spot-check that no `process.cwd()` reference snuck into `src/tools/help/` (SC-005) and no forbidden imports landed in `src/help/strip-schema.ts` (SC-004). If any gap is found, file a follow-up task; do NOT silently fix without recording it.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 — no dependencies; can start immediately.
- **Foundational (Phase 2)**: T002–T006 — depends on Setup. T002 + T003 + T004 + T005 can run in parallel ([P] markers); T006 depends on T002–T005 finishing. **BLOCKS Phases 3–7.**
- **User Story 1 (Phase 3)**: T007–T012 — depends on Foundational. Internal sequence: T007 → T008 → T009 (same file: src/help/strip-schema.ts + .test.ts). T010 + T011 + T012 are sequential against each other for src/server.test.ts and src/tools/obsidian_exec/tool.{ts,test.ts}, but T010+T011 are file-scoped to obsidian_exec (independent of T009 on the strip utility per se). **MVP completes here.**
- **User Story 2 (Phase 4)**: T013–T020 — depends on Phase 2 + T008 (strip utility callable from src/tools/help/tool.ts). Internal sequence: T013 → T014 (same file), T015 → T016 (same file), T013 + T015 in parallel ([P]); T017 depends on T013 + T015; T018 depends on T017; T019 depends on T017; T020 depends on T019.
- **User Story 3 (Phase 5)**: T021 → T022 — both modify obsidian_exec/tool.ts and tool.test.ts; sequential. Depends on T010 + T011 (same file already touched in US1).
- **User Story 4 (Phase 6)**: T023 + T024 — verification only. T023 depends on Phase 2 (T002–T006). T024 depends on T016.
- **Polish (Phase 7)**: T025–T031 — T025 + T026 in parallel ([P]); T027 + T028 + T029 + T030 + T031 sequential against each other (each depends on prior phases' completion).

### User Story Dependencies

- **US1 (P1)** is the MVP foundation. Stories US2–US4 all depend on US1's strip utility being callable.
- **US2 (P1)** depends on US1 (strip utility) + Phase 2 (docs/tools/ directory). Otherwise self-contained.
- **US3 (P1)** depends on US2 (the help tool must exist for the obsidian_exec description to mention `help("obsidian_exec")` meaningfully — though the description string itself can land before help registers, since it's a literal string).
- **US4 (P2)** depends on Phase 2 (docs/tools/ directory + package.json) + US2 (cwd-independence handler test exists).

### Within Each User Story

- Tests live in the same `*.test.ts` file as the surface they cover (Constitution Principle II). Within a story:
   - Implementation file (T013, T015, T017) → its test file (T014, T016, T018) — sequential when the test imports from the implementation.
   - Different module files within the same story can land in parallel ([P]) when there is no import dependency.
- Same-file tasks are always sequential (e.g., T007 → T008 → T009 all touch src/help/strip-schema.ts or its test).
- Story complete = all phase tasks pass; checkpoint marks the boundary.

### Parallel Opportunities

- **Phase 2**: T002, T003, T004, T005 in parallel (different doc files); T006 sequential after.
- **Phase 3**: limited parallelism — most tasks touch the same file (src/help/strip-schema.ts, src/tools/obsidian_exec/tool.ts, src/server.test.ts).
- **Phase 4**: T013 + T015 in parallel (different files); T014 sequential after T013, T016 sequential after T015. T017 → T018, T019, T020 sequential.
- **Phase 5**: T021 → T022 sequential.
- **Phase 6**: T023 + T024 in parallel (different concerns).
- **Phase 7**: T025 + T026 in parallel; T027 onward sequential.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch four doc-file authoring tasks in parallel (different files):
Task: "Create docs/tools/ directory + 6 stub files"  # T002 — must complete before [P] tasks below
# Then in parallel:
Task: "Author docs/tools/index.md"                   # T003 [P]
Task: "Author docs/tools/help.md"                    # T004 [P]
Task: "Author docs/tools/obsidian_exec.md"           # T005 [P]
# After all complete:
Task: "Update package.json files array"              # T006 (depends on T002-T005)
```

Strictly speaking T002 only needs to create the directory and the 6 stubs; T003/T004/T005 can author their files in parallel because each touches a distinct path. T002's directory creation must happen first (or the first parallel task that hits the missing directory creates it via `mkdir -p`).

---

## Implementation Strategy

### MVP First (User Story 1 Only — Strip Utility + obsidian_exec)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T006). Creates docs/tools/ with all 9 files; updates package.json. **CRITICAL — blocks everything else.**
3. Complete Phase 3: User Story 1 (T007–T012). Strip utility ships; obsidian_exec applies it; registry-consistency block asserts both invariants for the single registered tool.
4. **STOP and VALIDATE**: Run `npm test`. Issue a `tools/list` request manually. Verify `obsidian_exec.inputSchema.properties` has no `description` keys at any depth (Story 1 AC#5). Measure the SC-006 byte-size delta against the 004 HEAD baseline — even without the help tool registered, the delta should already be measurable.
5. Deploy/demo if ready. The token-economy property holds at single-tool surface even without US2's help tool.

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready (T001–T006).
2. Add User Story 1 (T007–T012) → Test independently → Demo (MVP — token economy realized).
3. Add User Story 2 (T013–T020) → Test independently → Demo (help tool now serves docs on demand).
4. Add User Story 3 (T021–T022) → Test independently → Demo (descriptions condensed; recovery-path discoverability complete).
5. Verify User Story 4 (T023–T024) → Confirm packaging + cwd-independence.
6. Polish (T025–T031) → Update canonical errors contract, README, capture SC-006 measurement, run final gate, final review.

### Parallel Team Strategy

With multiple developers (after Foundational completes):

- Developer A: Phase 3 (US1 — strip utility + obsidian_exec wiring + registry-consistency block).
- Developer B: Phase 4 (US2 — help tool — schema/handler/tool/server-registration/server-test-update). Dev B can work on T013 + T014 + T015 + T016 against a stub `stripSchemaDescriptions(schema => schema)` until Dev A's T008 lands; the integration point is T017's import of the real strip utility.
- Developer C: Phase 5 (US3) — depends on Dev A's T010 (same file as T021), so can start once T010 lands. Phase 6 (US4) — independent, can start once Phase 2 lands.

Stories complete and integrate independently. The registry-consistency block (T012) is the integration gate — it passes only when Dev A's strip wiring AND Dev B's help registration AND Phase 2's docs/tools/ contents all align.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Each user story is independently completable and testable (per the spec's user-story design).
- Verify tests fail before implementing (TDD posture is encouraged but not required since tests are co-located).
- Commit after each task or logical group (per the project's `/speckit-git-commit` workflow).
- Stop at any checkpoint to validate the story independently.
- The exact wording of `OBSIDIAN_EXEC_DESCRIPTION` (T021) and `HELP_DESCRIPTION` (T017) is plan-stage P5 — both are pinned literal strings; do not paraphrase during implementation.
- The aggregator pattern for `setRequestHandler` (T017 + T019) is a small refactor that is technically scope expansion beyond a strict interpretation of FR-007's "register a help tool" — it is justified because the MCP SDK only allows one handler per request type, so a true "register two tools" design requires aggregation. The plan's P3 sub-discussion mentions this; reviewers verify the refactor stays minimal (no new abstractions, just an aggregator that routes by name).
- Avoid: vague tasks, same-file conflicts (mark [P] only when files are genuinely independent), cross-story dependencies that break independence (US3 → US2 description-mention is a soft dependency — the literal string can land before help is registered; the test that asserts the description is correct still passes).
