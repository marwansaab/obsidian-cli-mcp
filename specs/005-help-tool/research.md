# Research: Progressive Disclosure Help Tool

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-06

## Status

No `NEEDS CLARIFICATION` items remain after [spec.md](./spec.md)'s five clarifications (one `/speckit-clarify` session on 2026-05-06: Q1 empty-string `tool_name` failure surface; Q2 `obsidian_exec.md` content; Q3 stub roster; Q4 missing-`docs/tools/` error code; Q5 registry-consistency test). This document records the empirical decisions, project-internal precedents, and plan-stage resolutions that Phase 1 design depends on.

## Decisions inherited from spec.md clarifications

| ID | Decision | Source |
|----|----------|--------|
| Q1 | Empty-string `tool_name` rejected at the zod boundary as `VALIDATION_ERROR`. Schema is `tool_name: z.string().min(1).optional()`. `HELP_TOOL_NOT_FOUND` only fires for non-empty names that don't resolve to an existing `.md` file. | spec.md Clarifications, FR-007, FR-008 (last bullet), Edge Cases (`help({ tool_name: "" })` row), Story 2 AC#6 |
| Q2 | `docs/tools/obsidian_exec.md` is a full doc, not a stub — body transcribed from [001's contracts](../001-add-cli-bridge/contracts/) (`obsidian_exec.tool.json` for shape; `errors.contract.md` for the error-code roster). | spec.md Clarifications, FR-012 (third bullet), Out of Scope |
| Q3 | Stub roster = (FR-012's canonical 5) ∪ (architecture-committed names). Today resolves to **6 stubs**: `read_note.md`, `write_note.md`, `append_note.md`, `search_vault.md`, `list_notes.md`, `list_vaults.md`. Architecture page contributes `list_vaults` beyond FR-012's enumeration. | spec.md Clarifications, FR-012 (fourth bullet) |
| Q4 | Missing-`docs/tools/`-directory raises a distinct `HELP_DOCS_MISSING` code, separate from `HELP_TOOL_NOT_FOUND`. Two new `UpstreamError` codes total. Recovery paths are different (operator publish/install fix vs agent self-correction), so distinct codes preserve the meaning of `details.availableTools`. | spec.md Clarifications, FR-008 (fourth bullet), FR-011, Edge Cases (`docs/tools/` directory missing row), Key Entities, Assumptions |
| Q5 | Registry-consistency test ships in this BI — a server-level iteration test that asserts every registered tool has a corresponding `docs/tools/<tool_name>.md` file. Self-maintaining (derives from the live registry). The inverse direction (orphan docs → registered tool) remains tolerated per FR-008. | spec.md Clarifications, FR-017 (third bullet), SC-011, Edge Cases ("registered tool with no doc file" row) |

## Plan-stage decisions resolved during this Phase 0

The spec deliberately deferred seven decisions to plan stage. All seven are resolved here:

| ID | Decision | Rationale |
|----|----------|-----------|
| **P1** (FR-001, strip utility module path + export name) | Module: `src/help/strip-schema.ts`. Test: `src/help/strip-schema.test.ts`. Exported function: `stripSchemaDescriptions(schema)`. | The `src/help/` directory groups the two source roots belonging to the help feature (the strip utility and — in `src/tools/help/` — the per-surface module folder for the help tool). The strip utility lives at `src/help/`, NOT at `src/tools/help/strip-schema.ts`, because it is consumed by every tool registration (existing `obsidian_exec`, the new `help` tool, every future BI-003-25 tool) — placing it inside `src/tools/help/` would invert the dependency direction (every other tool would import from `src/tools/help/`). Function name `stripSchemaDescriptions` is verb-led per the project's naming convention (`executeObsidianExec`, `invokeCli`, `applyTargetModeSpecificRefinement`). Alternative `stripDescriptions` rejected — the noun is too generic and could refer to e.g. CLI option descriptions. Alternative `src/strip-schema/` rejected — the utility is logically part of the help feature's surface area, not a free-standing primitive like `src/cli-adapter/` or `src/target-mode/`. |
| **P2** (FR-002 + FR-005, recursive walker tactic) | A single hand-rolled recursive function. `structuredClone(input)` for the deep copy, then recursive in-place delete of `description` keys on the clone at every visited node. Walker visits: `properties` (object: each value recursed), `items` (object or array of objects: each recursed), `anyOf` / `oneOf` (array: each element recursed), `additionalProperties` (object only — boolean is left alone). The walker explicitly does NOT recurse into `definitions` / `$defs` / `$ref` targets. | `structuredClone` is available since Node 17 — within the project's `engines.node >= 22.11` floor. JSON Schema's recursive structure has at most six relevant node kinds (the five above + the root); a hand-rolled walker is ≲ 30 LOC and avoids both the dependency cost and the runtime cost of a generic JSON-walker library. The "delete-after-clone" pattern is simpler than the "build-fresh-from-source" pattern because the clone preserves all the structural keys (FR-004) automatically — only the targeted `description` keys need to be removed. The walker's exclusion of `$defs` / `$ref` targets is safe because [src/tools/obsidian_exec/schema.ts:19](../../src/tools/obsidian_exec/schema.ts#L19) invokes `zodToJsonSchema` with `$refStrategy: "none"`, so refs do not appear in our schemas; if a future schema needs `$ref` (e.g., very large discriminated unions exceeding inlining cost), the walker is extended in a follow-up BI without breaking this BI's contract. |
| **P3** (FR-007, help tool input-schema annotation choice) | The `tool_name` field carries NO `.describe()` annotation in the zod schema. The schema is exactly `z.object({ tool_name: z.string().min(1).optional() })` (with `.strict()` per the project precedent at [src/tools/obsidian_exec/schema.ts:14](../../src/tools/obsidian_exec/schema.ts#L14)). | Per FR-006 the strip utility is applied to every registration including this one — any `.describe()` on the schema would be stripped at registration time and would never reach `tools/list`. Adding it would create the false impression that the description survives end-to-end and would tempt future maintainers to put load-bearing info there. Constitution Principle III is satisfied — the schema is the single source of truth for runtime parse + structural shape; the documentation lives in `docs/tools/help.md` (FR-012) and the top-level (registration-object-level) description (P5). The `.strict()` modifier matches the `obsidianExecSchema` precedent and rejects unknown keys (e.g., `help({ tool_name: "x", unknown: "y" })`) at the zod boundary as `VALIDATION_ERROR`. |
| **P4** (FR-010, path-traversal defense implementation) | Three-layer defense in [src/tools/help/handler.ts](../../src/tools/help/handler.ts):<br/>**(a)** Reject early if `tool_name.includes("\0")` (NUL byte) — surfaces as `HELP_TOOL_NOT_FOUND` rather than as a downstream `ERR_INVALID_ARG_VALUE` from `readFile`.<br/>**(b)** Resolve via `const candidate = path.resolve(docsDir, \`${tool_name}.md\`)`.<br/>**(c)** Compute `const rel = path.relative(docsDir, candidate)`; reject if `rel` starts with `..` OR contains a path separator (i.e., the resolved path escapes `docsDir` OR descends into a subdirectory).<br/>**(d)** The error message echoes ONLY the available-tool-names list (from `readdir(docsDir)` filtered to `.md` files, excluding `index.md`); the original `tool_name` lives in `details.requestedName` for operator-side debugging but never in the agent-facing message. | The "resolve then check relative" pattern is the canonical `node:path`-based traversal defense; it correctly handles `..`, absolute paths, mixed separators (`/` vs `\` on Windows), and URL-encoded variants because Node normalizes those during `path.resolve`. The bare-filename check in step (c) (no path separator) is necessary because `path.relative(docsDir, path.resolve(docsDir, "subdir/file"))` returns `"subdir/file"` — without a leading `..` — yet the candidate IS inside `docsDir`; we want to reject it because the lookup-key is supposed to be a flat filename, not a path. The NUL-byte guard in (a) is defense in depth: filesystem APIs typically reject NUL embeds, but the resulting error code (`ERR_INVALID_ARG_VALUE`) would surface as a generic exception rather than the structured `HELP_TOOL_NOT_FOUND` we want the agent to recover from. The "don't echo `tool_name` in the agent-facing message" rule prevents the `help` tool from becoming a log-injection vector if an attacker probes with a malicious string; `details.requestedName` is preserved for operators who can read structured logs safely. Alternative — regex-validate `tool_name` at the zod boundary (e.g., `z.string().regex(/^[a-z_][a-z0-9_]*$/)`) — rejected because it shifts the failure to `VALIDATION_ERROR` and complicates Q1's "empty string only" rejection rule (`.min(1)` + `.regex(...)` would reject more than empty strings); also, traversal IS a runtime path concern, not a structural-validity concern. |
| **P5** (FR-015 + FR-016, top-level description wording) | Pinned strings:<br/>**`help` tool**: `"Look up full Markdown documentation for any registered MCP tool. Call help() with no arguments for an index of available docs, or help({ tool_name: \"<name>\" }) for a specific tool's full parameter docs. Self-describing — call help({ tool_name: \"help\" })."`<br/>**`obsidian_exec` tool** (replaces the existing 200-word string at [src/tools/obsidian_exec/tool.ts:15-16](../../src/tools/obsidian_exec/tool.ts#L15-L16)): `"Invoke any Obsidian Integrated CLI subcommand. Returns stdout, stderr, exitCode, and the exact argv invoked. Failures (non-zero exit, in-band Error: prefix, missing binary, timeout, output > 10 MiB) surface as structured errors with stable codes. Call help({ tool_name: \"obsidian_exec\" }) for full parameter docs and the error-code roster."` | Both strings satisfy: (a) verb-led summary at the head ("Look up", "Invoke"); (b) explicit mention of `help("<name>")` invocation; (c) ≲ 350 chars (well under the SC-006 token-economy ceiling, even though no mechanical cap exists per Out of Scope); (d) preserve the semantic intent of each tool. The `obsidian_exec` description is condensed from ~1100 chars to ~340 chars (~70% reduction) — corroborates the SC-006 directional claim at the description alone. Future BI-003-25 each pin their own short description (matching this format) when they ship; this BI does not pre-author them. |
| **P6** (Clarification Q5 + bypass-detection Edge Case, registry-consistency test location) | A single new `describe("registry consistency", () => { ... })` block at the bottom of [src/server.test.ts](../../src/server.test.ts), holding both assertions:<br/>**(i)** every registered tool has a `docs/tools/<tool_name>.md` file (per Clarification Q5 + FR-017);<br/>**(ii)** every registered tool's `inputSchema.properties` tree is description-free at every nesting level (per Story 1 AC#5 / SC-002 / Edge Case "Tool registration via the SDK that bypasses the stripping utility"). | Both assertions iterate the same `server.tools` collection — splitting them into separate test files would duplicate the iteration scaffold without adding clarity. Co-locating them in `server.test.ts` (the existing server-level test surface) keeps the registry gate visible to every reviewer who touches `server.ts`. The block is named `registry consistency` for grep-discoverability and so future BI authors who add tools see the gate in one place. Alternative — separate `src/server.registry.test.ts` — rejected because it splinters the server-level test concerns; the existing `server.test.ts` is the canonical home for cross-tool assertions. The bypass-detection assertion (ii) does NOT live in `src/help/strip-schema.test.ts` because the strip utility's tests exercise the function in isolation; the bypass concern is "does every registration site CALL the function" — a server-level concern, not a utility-level one. |
| **P7** (SC-006 measurement mechanism) | A one-off measurement noted in the PR description, NOT a benchmark test. The PR author measures the JSON-serialized `tools/list` response byte count (a) before applying the strip utility — i.e., on the tip of `004-target-mode-schema` HEAD with the existing 200-word `OBSIDIAN_EXEC_DESCRIPTION` + any per-field `.describe()` annotations — and (b) after, on this BI's HEAD with the strip utility applied + the P5 condensed top-level descriptions. Records the delta in the PR description as a one-liner (e.g., `"tools/list: 1245 bytes → 412 bytes (67% reduction)"`). | SC-006's claim is directional (~70%) and environmental — the actual reduction depends on how many tools are registered, how many `.describe()` annotations each schema carries, and how the JSON serializer formats the output (whitespace, key ordering). Running it as a vitest benchmark would tie the merge gate to a number that drifts every time a tool ships a new `.describe()` annotation, creating a maintenance burden out of proportion to the value. A one-off PR-description measurement is enough to validate the directional claim and provides a permanent record (the PR is the audit trail) without binding future merges to the number. SC-006 is satisfied when the PR description carries this measurement and the directional claim (≥ 50% reduction at the typical-tool surface, weighted toward the ~70% claim from ADR-005) holds. Alternative — a vitest benchmark with a soft threshold — rejected because soft thresholds don't gate merges and adding a hard threshold would re-introduce the maintenance-burden problem. Alternative — embed the measurement in the SC-002 registry-consistency test — rejected because that test asserts a structural invariant (no descriptions in the properties tree); adding a byte-size-delta measurement would conflate two concerns. |
| **P8** (FR-007 + FR-008, SDK-dispatch aggregator pattern — added 2026-05-06 by /speckit-analyze remediation, finding I2) | Refactor [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts)'s `registerObsidianExecTool` to return its tool descriptor + per-tool call-handler instead of calling `setRequestHandler` directly. Add a parallel `registerHelpTool` returning the same shape. In [src/server.ts](../../src/server.ts), call BOTH registration functions, aggregate their descriptors into the single `ListToolsRequestSchema` handler's response, and route `CallToolRequestSchema` invocations to the per-tool handler by name (with the existing `TOOL_NOT_FOUND` fallback). | The MCP SDK's `Server.setRequestHandler(...)` allows exactly ONE handler per request type. Without aggregation, the second `register*Tool` call would clobber the first. Aggregation keeps the existing `obsidian_exec` test surface, the existing error-response shape via `asToolError`, and the existing `OBSIDIAN_EXEC_DESCRIPTION`/`HELP_TOOL_NAME` constants intact. The refactor lands in T017 + T019. Alternative — keep `registerObsidianExecTool` direct and have `registerHelpTool` REPLACE the handler with one knowing both tools — rejected: brittle ordering (later-registered wins), and harder to test in isolation. Alternative — split into `setRequestHandler(ListToolsRequestSchema, ...)` + `setRequestHandler(CallToolRequestSchema, ...)` calls per tool — impossible (SDK constraint). |

## v0.1.x baselines reaffirmed

These constraints carry through unchanged from 001/002/003/004 and are *not* re-litigated by this feature:

- **`zod` ^3.23.8 is the boundary validator** (Constitution Technical Standards). The `help` tool's input schema uses `z.object({...}).strict()` with `z.string().min(1).optional()` — all stable in 3.x.
- **`zod-to-json-schema` ^3.23.5 is the JSON Schema generator** for MCP `inputSchema` registration. Invoked with `$refStrategy: "none"` per the [obsidian_exec precedent](../../src/tools/obsidian_exec/schema.ts) — this guarantees the strip utility never encounters `$ref` nodes (P2).
- **`@modelcontextprotocol/sdk` ^1.0.4 is the sole MCP transport** (Constitution Technical Standards). The `help` tool registers via the SDK's `Server.setRequestHandler(CallToolRequestSchema, …)` pattern, sharing the dispatcher with `obsidian_exec` per the existing [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts) precedent. The `ListToolsRequestSchema` handler now returns BOTH tools.
- **Vitest + `@vitest/coverage-v8`** is the test framework (per constitution v1.1.0). All new `*.test.ts` files run alongside the existing test set with no config changes.
- **Coverage floor 84.3% statements** at [vitest.config.ts:20](../../vitest.config.ts#L20) (pinned by feature 002 and reaffirmed by features 003 + 004). The new modules + their test sets are net-additive; pre-implementation projection is the actual statements coverage moves up by ~0.4–0.6 pp once the new code paths are exercised. The merge-gate floor stays at 84.3% and ratchets via a separate visible edit per the constitution's single-source-of-truth rule (v1.1.0 §Development Workflow #5).
- **`UpstreamError` is the boundary error class** ([src/errors.ts](../../src/errors.ts)). Two new codes are introduced — `HELP_TOOL_NOT_FOUND` and `HELP_DOCS_MISSING` — and added to the canonical [001 errors contract](../001-add-cli-bridge/contracts/errors.contract.md) per the established 002 + 003 pattern. The README error-codes table gains two rows (FR-011).
- **No `Logger.ErrorCode` extension is introduced by this BI**: the `help` tool uses the existing logger via `deps.logger` injected at registration time — same posture as `obsidian_exec`. Per the existing [src/logger.ts](../../src/logger.ts) precedent, structured failure logging emits `code` strings; the two new `HELP_*` codes flow through the existing `Logger.callEndFailure` path without requiring a new log-event type. Whether `logger.callStart` / `logger.callEnd` fires for help-tool invocations is a tactical implementation detail that the per-surface handler decides; the existing convention in `obsidian_exec` is to log every call, and the `help` tool follows the same convention by default. Volume: agent sessions typically issue O(N) help calls at session start where N = number of tools the agent uses. Cheap relative to the per-call CLI invocations `obsidian_exec` already logs.

## Module structure

The new code lives at three locations under `src/`:

```text
src/
├── help/                                 # NEW directory — shared utility for ALL tool registrations
│   ├── strip-schema.ts                   # P1 + P2: pure function exporting stripSchemaDescriptions
│   └── strip-schema.test.ts              # P1: ~6 cases (FR-017 + recommended)
└── tools/
    ├── obsidian_exec/                    # EXISTING — only tool.ts is modified (P5 + FR-006 strip wrapper)
    │   ├── schema.ts                     # unchanged
    │   ├── handler.ts                    # unchanged
    │   ├── tool.ts                       # MODIFIED: top-level description condensed; inputSchema wrapped through stripSchemaDescriptions
    │   └── *.test.ts                     # tool.test.ts gains assertions on the new description shape
    └── help/                             # NEW directory — per-surface module folder
        ├── schema.ts                     # P3: zod input schema + zodToJsonSchema-derived raw JSON Schema
        ├── schema.test.ts                # ~3 schema-parse cases (omitted, present non-empty, empty rejected)
        ├── handler.ts                    # P4 + FR-008..FR-011: path resolution, directory check, traversal defense, UpstreamError construction
        ├── handler.test.ts               # ~8 handler I/O cases
        ├── tool.ts                       # FR-007 + FR-016 + P5: SDK registration with stripped schema + verb-led description
        └── tool.test.ts                  # ~3 registration cases
```

Plus the bundled documentation:

```text
docs/
└── tools/                                # NEW — bundled with npm release per FR-014
    ├── help.md                           # FR-012: full doc for the help tool itself
    ├── index.md                          # FR-013: listing of all available docs
    ├── obsidian_exec.md                  # FR-012 + Q2: full doc transcribed from 001's contracts; NOT a stub
    ├── read_note.md                      # Q3 stub
    ├── write_note.md                     # Q3 stub
    ├── append_note.md                    # Q3 stub
    ├── search_vault.md                   # Q3 stub
    ├── list_notes.md                     # Q3 stub
    └── list_vaults.md                    # Q3 stub (architecture-committed name)
```

And the registry-consistency gate:

```text
src/server.test.ts                        # MODIFIED: adds `describe("registry consistency", () => {...})` block per P6
```

The directory layout deliberately does NOT introduce a `tests/` parallel tree — Constitution Principle II requires co-location, and this feature respects that throughout.

## Strip-utility implementation sketch

The walker is small enough to capture inline:

```ts
// Original — no upstream. Pure function: deep-copy a JSON Schema and remove every `description` field below the root.
const STRIPPABLE_DESCRIPTION_LOCATIONS = ["properties", "items", "anyOf", "oneOf", "additionalProperties"] as const;

export function stripSchemaDescriptions(schema: JsonSchemaObject): JsonSchemaObject {
  const clone = structuredClone(schema);
  // Root-level `description` is deliberately preserved per FR-003.
  for (const value of walkChildren(clone)) {
    if (typeof value === "object" && value !== null && "description" in value) {
      delete (value as Record<string, unknown>).description;
    }
  }
  return clone;
}

function* walkChildren(node: unknown): Generator<unknown> {
  if (typeof node !== "object" || node === null) return;
  // Visit each child schema construct; the `description` key removal happens in the caller.
  // (full implementation in src/help/strip-schema.ts)
}
```

Pseudocode only — the real implementation handles `properties` (object), `items` (object or array), `anyOf` / `oneOf` (array of objects), `additionalProperties` (object or boolean — only object is recursed), and recurses into each visited child's own `properties` / `items` / `anyOf` / `oneOf` / `additionalProperties`. The `description`-key delete happens at every recursion frame.

## Help-tool handler implementation sketch

```ts
// Original — no upstream. help tool handler: directory check, path resolution, traversal defense, file read.
import { readFile, access, readdir } from "node:fs/promises";
import { resolve, relative, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { UpstreamError } from "../../errors.js";

import type { HelpInput } from "./schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// docs/tools/ relative to the COMPILED dist/tools/help/ location at runtime.
// At runtime: dist/tools/help/handler.js → ../../docs/tools/  (i.e. dist-rooted, not source-rooted).
// The package.json `files` array bundles docs/tools/**/*.md alongside dist/.
const DOCS_DIR = resolve(HERE, "../../docs/tools");

export async function executeHelp(input: HelpInput): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // (a) Directory existence check (FR-008 fourth bullet, Q4 → HELP_DOCS_MISSING)
  try {
    await access(DOCS_DIR);
  } catch (cause) {
    throw new UpstreamError({
      code: "HELP_DOCS_MISSING",
      cause,
      details: { resolvedDocsDir: DOCS_DIR, ioCode: (cause as NodeJS.ErrnoException)?.code },
      message: `docs/tools/ directory missing or unreadable at ${DOCS_DIR}`,
    });
  }

  // (b) Empty input → return index.md
  const name = input.tool_name;
  if (name === undefined) {
    return { content: [{ type: "text", text: await readFile(join(DOCS_DIR, "index.md"), "utf8") }] };
  }

  // (c) Reserved-name guard (added by /speckit-analyze remediation L1a per Edge Case
  // "help({ tool_name: 'index' })"): the literal name "index" resolves to index.md which
  // exists, but it is NOT a tool's doc — the spec binds this to HELP_TOOL_NOT_FOUND. The
  // notFound helper's availableTools list already excludes index.md, so the failure surface
  // is consistent with any other unknown name.
  if (name === "index") throw await notFound(name, DOCS_DIR);

  // (d) Path-traversal defense (P4)
  if (name.includes("\0")) throw await notFound(name, DOCS_DIR);
  const candidate = resolve(DOCS_DIR, `${name}.md`);
  const rel = relative(DOCS_DIR, candidate);
  if (rel.startsWith("..") || rel.includes(sep) || rel === "..") throw await notFound(name, DOCS_DIR);

  // (e) Read file
  try {
    return { content: [{ type: "text", text: await readFile(candidate, "utf8") }] };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") throw await notFound(name, DOCS_DIR);
    throw cause; // unexpected I/O error — let it bubble (Principle IV non-recovery path)
  }
}

async function notFound(requestedName: string, docsDir: string): Promise<never> {
  const available = (await readdir(docsDir)).filter((f) => f.endsWith(".md") && f !== "index.md").map((f) => f.slice(0, -3));
  throw new UpstreamError({
    code: "HELP_TOOL_NOT_FOUND",
    cause: null,
    details: { requestedName, availableTools: available },
    message: `No documentation file for the requested tool. Available tools: ${available.join(", ")}.`,
  });
}
```

Pseudocode only — the real implementation is split across `handler.ts` + `tool.ts` per the per-surface convention; the SDK-dispatcher in `tool.ts` translates `executeHelp`'s return shape (or thrown `UpstreamError`) into the SDK's tool-error-response shape via the same `asToolError` helper as `obsidian_exec` ([src/tools/obsidian_exec/tool.ts:29-34](../../src/tools/obsidian_exec/tool.ts#L29-L34)).

## Test count summary

Counts revised by /speckit-analyze remediation 2026-05-06 (findings C1, C2, L1a/b/c) — totals were 22 in the original plan; remediation added 5 cases for explicit Story 2 AC#6 coverage (C1), root-description preservation per FR-003 (C2), and three Edge Case scenarios L1 surfaced (index-rejection per L1a, empty-file per L1b, orphaned-doc per L1c).

| Test file | Cases | Mapping |
|-----------|-------|---------|
| `src/help/strip-schema.test.ts` | 7 | Story 1 AC#1–4 + AC#6 + non-string-`description` Edge Case + **root-description preservation per FR-003 (C2)** |
| `src/tools/help/schema.test.ts` | 4 | Q1 empty-string rejection, omitted-tool_name acceptance, non-empty parses, **non-string `tool_name` per Story 2 AC#6 (C1)** |
| `src/tools/help/handler.test.ts` | 11 | Story 2 AC#1–5, plus Q4 `HELP_DOCS_MISSING`, plus path-traversal probe per FR-010, plus NUL-byte probe, **plus `help({ tool_name: "index" })` rejection per L1a Edge Case**, **plus empty doc file → empty string per L1b Edge Case**, **plus orphaned doc file → success per L1c Edge Case** |
| `src/tools/help/tool.test.ts` | 3 | top-level description mentions help, stripped schema absent of nested descriptions, error round-trip |
| `src/server.test.ts` (additions) | 2 | P6: registry → docs mapping + bypass-detection assertion (one block, two `it(...)` cases) |
| **Total new test bodies** | **27** | All FR-017 minimums + recommended additions + post-remediation cases |

## ADR-005 alignment

This feature is the literal implementation of [.decisions/ADR-005 - Token-Optimized Tool Definitions via Progressive Disclosure.md](../../.decisions/ADR-005%20-%20Token-Optimized%20Tool%20Definitions%20via%20Progressive%20Disclosure.md). The four ADR decisions map 1:1:

| ADR-005 decision | This feature's implementation |
|------------------|-------------------------------|
| #1 — Automated Schema Stripping | `stripSchemaDescriptions` at P1; applied at every registration site per FR-006 + P6 |
| #2 — Help Tool (`help`) | The new `help` MCP tool at `src/tools/help/` per FR-007 |
| #3 — Embedded Documentation in `docs/tools/` | The bundled directory at the package root per FR-012 + FR-014 |
| #4 — Caveman Descriptions | The condensed top-level descriptions at P5; FR-015 + FR-016 bind every tool |

No ADR amendment, no new ADR. The [Architecture document](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) names BI-030 as this implementation; this feature IS BI-030.
