# Data Model — `read_property` Typed MCP Tool

**Feature**: [013-read-property](./spec.md)
**Date**: 2026-05-09

This document is the Phase 1 design artifact for `read_property`. It captures the input and output schema shapes, the two-call CLI invocation architecture (R3), the user-field → CLI-argv mapping table, the type-label translation table (R6), the response-parsing decision tree (R7's `No frontmatter found.` short-circuit), the per-tool invariants, and the module layout LOC budget.

**Constitution Principle III gate**: the schemas here are the binding contract; the spec's prose narrates them, but if prose and schema diverge, **the schema wins**.

---

## Module Layout

```
src/tools/read_property/
├── schema.ts             # ~50 LOC — input + output schemas, types via z.infer, type-label enum
├── schema.test.ts        # ~200 LOC — 14 cases per FR-023
├── handler.ts            # ~80 LOC — two-call invokeCli wrapper + parsePropertiesResponse + type translation
├── handler.test.ts       # ~430 LOC — 22 cases per FR-023 (bumped 17 → 22 by /speckit-analyze remediation)
├── index.ts              # ~25 LOC — createReadPropertyTool factory via registerTool
└── index.test.ts         # ~120 LOC — 5 cases per FR-023
```

Total: ~155 LOC source + ~670 LOC tests = ~825 LOC. Higher than `delete_note`'s ~120 LOC source because:
- Two-call architecture (R3) means the handler does response-parse + name-lookup + type-translation across two responses, not one.
- Output schema's `value` is a polymorphic union (string / number / boolean / array / object / null) requiring zod union construction.
- Type-translation table is a separate constant + helper (R6).
- The `No frontmatter found.` short-circuit clause (R7) adds branching.

Per Constitution Principle V, every source file carries the `// Original — no upstream. <one-line description>.` header.

---

## Input Schema (`readPropertyInputSchema`)

### Composition

```ts
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const readPropertyInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1),
  }),
);

export type ReadPropertyInput = z.infer<typeof readPropertyInputSchema>;
```

**Note the absence of a `.superRefine(...)` chain beyond the target-mode primitive's** — same posture as `delete_note` (departure from `write_note`'s three active-mode clauses). The `name` field has well-defined semantics in both modes: it identifies the property to read, regardless of how the locator is resolved.

### Field-by-field

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `target_mode` | `z.enum(["specific", "active"])` | YES | From `targetModeBaseSchema`. Discriminator. |
| `vault` | `z.string().min(1)` | YES in specific, FORBIDDEN in active | Enforced by `applyTargetModeRefinement`. |
| `file` | `z.string()` | OPTIONAL in specific (XOR with `path`), FORBIDDEN in active | Wikilink-form locator. |
| `path` | `z.string()` | OPTIONAL in specific (XOR with `file`), FORBIDDEN in active | Vault-relative path with `.md` extension. |
| `name` | `z.string().min(1)` | YES in BOTH modes | Property name. Passed through to CLI verbatim per FR-018. Empty string fails validation. |

**Strict mode**: top-level `additionalProperties: false` is inherited from `targetModeBaseSchema`'s `.extend()` call. Unknown keys at the top level surface as `code: "unrecognized_keys"` issues.

### Per-mode field policy

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (must be `"specific"`) | required (must be `"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `name` | REQUIRED | REQUIRED | n/a |

**Note vs `delete_note`**: identical structure plus the additional REQUIRED `name` field. No new active-mode rules — `name` is required uniformly across both modes.

### Validation issue paths

| Violation | `issues[].path` | Issue code |
|-----------|----------------|-----------|
| Specific mode, neither `file` nor `path` | `[]` | `custom` (target-mode primitive) |
| Specific mode, both `file` AND `path` | `["file"]` and `["path"]` | `custom` |
| Specific mode, missing `vault` | `["vault"]` | `invalid_type` or `custom` |
| Active mode, `vault` present | `["vault"]` | `custom` |
| Active mode, `file` present | `["file"]` | `custom` |
| Active mode, `path` present | `["path"]` | `custom` |
| Missing `name` | `["name"]` | `invalid_type` |
| `name === ""` | `["name"]` | `too_small` |
| Unknown top-level key | `["pancakes"]` (or whichever key) | `unrecognized_keys` |
| Invalid `target_mode` value | `["target_mode"]` | `invalid_enum_value` |

Multiple violations in one input produce multiple issues in one parse failure (no fail-fast).

---

## Output Schema (`readPropertyOutputSchema`)

```ts
export const PROPERTY_TYPE_LABELS = ["text", "list", "number", "checkbox", "date", "datetime", "unknown"] as const;
export type PropertyTypeLabel = (typeof PROPERTY_TYPE_LABELS)[number];

const propertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.unknown()),
  z.null(),
]);

export const readPropertyOutputSchema = z
  .object({
    value: propertyValueSchema,
    type: z.enum(PROPERTY_TYPE_LABELS),
  })
  .strict();

export type ReadPropertyOutput = z.infer<typeof readPropertyOutputSchema>;
```

### Field-by-field

| Field | Type | Notes |
|-------|------|-------|
| `value` | `string \| number \| boolean \| unknown[] \| Record<string, unknown> \| null` | The property's value, JSON-encoded native type from Call A. Verbatim — no flattening, no coercion. The object branch covers Q2's mapping case (FR-027). |
| `type` | `PropertyTypeLabel` (`"text" \| "list" \| "number" \| "checkbox" \| "date" \| "datetime" \| "unknown"`) | Translated from Obsidian's resolved label per R6. The `"unknown"` fallback covers absent (key not in Call A's parsed JSON), heterogeneous-list (FR-017), no-frontmatter / malformed-frontmatter (R7), and any future Obsidian label outside the translation table. |

### Type inference

`ReadPropertyOutput` is `z.infer<typeof readPropertyOutputSchema>` — equivalent to:

```ts
type ReadPropertyOutput = {
  value: string | number | boolean | unknown[] | Record<string, unknown> | null;
  type: "text" | "list" | "number" | "checkbox" | "date" | "datetime" | "unknown";
};
```

No discriminator: the success-path return shape is uniform. Failures throw `UpstreamError` (never produce a discriminated `ok: false` shape). Mirrors `read_note`'s no-discriminator response.

### Polymorphic `value` rationale

The output schema's `value` is a union of six primitive / structural types because YAML frontmatter values can be any of those shapes per FR-008 + FR-027. JSON encoding (from Call A) maps each YAML shape to one of these six runtime types deterministically. Zod's `z.union(...)` is the source of truth for both runtime parse AND inferred TypeScript type.

---

## CLI Invocation Shape — Two-Call Architecture (R3)

### Call A — file-scoped value (always issued)

```ts
const callA = await invokeCli(
  {
    command: "properties",
    vault: input.target_mode === "specific" ? input.vault! : undefined,
    parameters:
      input.target_mode === "specific"
        ? {
            ...(input.file !== undefined ? { file: input.file } : {}),
            ...(input.path !== undefined ? { path: input.path } : {}),
            format: "json",
          }
        : { format: "json" },
    flags: input.target_mode === "active" ? ["active"] : [],
    target_mode: input.target_mode,
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
```

- Subcommand: `"properties"` (R2 — plural, NOT `property:read`).
- `format=json` is always emitted as a parameter (NOT a flag — per `obsidian help` it's a key=value: `format=json`).
- Active mode adds `active` to flags (R4).

### Call B — vault-scoped type metadata (always issued in current baseline)

```ts
const callB = await invokeCli(
  {
    command: "properties",
    vault: input.target_mode === "specific" ? input.vault! : undefined,
    parameters: { format: "json" },
    flags: [],
    target_mode: input.target_mode,
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
```

- NO `path=` / `file=` (vault-scoped, not file-scoped).
- NO `active` flag (the type metadata is vault-wide, not focused-note-specific — R4).
- In active mode, `vault` is `undefined` (the active-mode CLI invocation runs against Obsidian's default vault per R4's documented multi-vault limitation).

### Argv mapping table

| User-facing field | Call A argv (specific) | Call A argv (active) | Call B argv (specific) | Call B argv (active) |
|-------------------|------------------------|----------------------|------------------------|----------------------|
| `target_mode` | (used for adapter behaviour) | (used for adapter behaviour) | (used for adapter behaviour) | (used for adapter behaviour) |
| `vault` | `vault=<value>` | n/a | `vault=<value>` | n/a |
| `file` | `file=<value>` | n/a (forbidden) | (omitted) | (omitted) |
| `path` | `path=<value>` | n/a (forbidden) | (omitted) | (omitted) |
| `name` | (NOT forwarded; client-side post-filter) | (NOT forwarded; client-side post-filter) | (NOT forwarded; client-side post-filter) | (NOT forwarded; client-side post-filter) |
| (literal `format=json`) | `format=json` | `format=json` | `format=json` | `format=json` |
| (active flag) | (omitted) | `active` | (omitted) | (omitted) |

**Key insight**: `name` is NEVER forwarded to the CLI as argv. The CLI's `properties` subcommand has a `name=<name>` parameter that returns a count integer (not the value), so the wrapper never uses it. The wrapper extracts the property by name client-side from Call A's parsed JSON.

### Argv produced (concrete examples)

| Input | Call A argv (post-vault-hoist) | Call B argv (post-vault-hoist) |
|-------|--------------------------------|--------------------------------|
| `{target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status"}` | `["vault=Demo", "properties", "path=notes/x.md", "format=json"]` | `["vault=Demo", "properties", "format=json"]` |
| `{target_mode: "specific", vault: "Demo", file: "QuickNote", name: "tags"}` | `["vault=Demo", "properties", "file=QuickNote", "format=json"]` | `["vault=Demo", "properties", "format=json"]` |
| `{target_mode: "active", name: "status"}` | `["properties", "format=json", "active"]` | `["properties", "format=json"]` |

The exact placement of `format=json` and the `active` flag within the argv array is determined by `dispatchCli`'s argv-assembler (parameters first, flags last). Tests assert against the final argv that hits `spawnFn`.

---

## Type Label Translation (R6)

```ts
const OBSIDIAN_TYPE_TO_SPEC_TYPE: Record<string, PropertyTypeLabel> = {
  text: "text",
  multitext: "list",
  aliases: "list",
  tags: "list",
  number: "number",
  checkbox: "checkbox",
  date: "date",
  datetime: "datetime",
  unknown: "unknown",
};

function translateObsidianType(obsidianLabel: string): PropertyTypeLabel {
  return OBSIDIAN_TYPE_TO_SPEC_TYPE[obsidianLabel] ?? "unknown";
}
```

**Translation table** (live-verified per R6):

| Obsidian label (Call B `type`) | Spec label (output `type`) |
|---|---|
| `text` | `text` |
| `multitext` | `list` |
| `aliases` | `list` |
| `tags` | `list` |
| `number` | `number` |
| `checkbox` | `checkbox` |
| `date` | `date` |
| `datetime` | `datetime` |
| `unknown` | `unknown` |
| (anything else) | `unknown` |

The fallback to `"unknown"` for unrecognised labels is forward-compatible: a future Obsidian version that adds new type labels will surface as `"unknown"` rather than crashing the schema's `z.enum` validation.

---

## Response Parsing — Decision Tree

### Call A response handling

```
Call A stdout ──→ trimStart() ──→ startsWith("No frontmatter found.")? ─yes─→ return { value: null, type: "unknown" }  // R7 (FR-011 / FR-012 conflation)
                                                                          └─no──→ JSON.parse(stdout) ──→ throws? ─yes─→ throw UpstreamError({code: "CLI_REPORTED_ERROR", details: { stdout }, message: "read_property could not parse Call A response"})
                                                                                                       └─no──→ frontmatter object ──→ name in object? ─no──→ return { value: null, type: "unknown" }  // ABSENT property
                                                                                                                                                       └─yes──→ extract value; proceed to Call B
```

### Call B response handling

```
Call B stdout ──→ JSON.parse(stdout) ──→ throws? ─yes─→ throw UpstreamError({code: "CLI_REPORTED_ERROR", details: { stdout }, message: "read_property could not parse Call B response"})
                                       └─no──→ array of {name, type, count} ──→ find entry where entry.name === input.name ──→ entry undefined? ─yes─→ type = "unknown"  // shouldn't happen if value was extracted from Call A; defensive fallback
                                                                                                                              └─no──→ type = translateObsidianType(entry.type)
                                                                                                                              └─→ return { value: <Call A value>, type }
```

### Error path classifications

| CLI behaviour | Adapter / handler classification | Handler behaviour |
|---------------|----------------------------------|-------------------|
| Exit 0, stdout `Vault not found.` (Call A or Call B) | `CLI_REPORTED_ERROR` (adapter's `UNKNOWN_VAULT_PREFIX` re-classifier per R5) | Propagate verbatim |
| Exit 0, stdout `Error: File "..." not found.` (Call A) | `CLI_REPORTED_ERROR` (dispatch layer's `Error:` prefix matcher) | Propagate verbatim |
| Exit 0, stdout `Error: No active file. ...` (Call A, active mode) | `CLI_REPORTED_ERROR` or `ERR_NO_ACTIVE_FILE` (whichever the dispatch layer assigns) | Propagate verbatim |
| Exit 0, stdout `No frontmatter found.` (Call A) | (handler-layer, NOT dispatch-layer) | Short-circuit return `{value: null, type: "unknown"}` per R7 |
| Exit 0, stdout malformed JSON (Call A or Call B) | `CLI_REPORTED_ERROR` (handler throws) | Throws with raw stdout in details |
| Exit 1, any stderr | `CLI_NON_ZERO_EXIT` (dispatch layer) | Propagate verbatim |
| Spawn failure (ENOENT) | `CLI_BINARY_NOT_FOUND` (dispatch layer) | Propagate verbatim |

---

## Per-tool Invariants

These invariants MUST hold at all times. Violations are bugs.

1. **Schema is the single source of truth** (Constitution Principle III). The same `readPropertyInputSchema` produces both the runtime `parse` AND the published JSON Schema. The TypeScript type is `z.infer<typeof readPropertyInputSchema>`. No hand-rolled `interface`, no parallel JSON Schema, no `as` casts that bypass parse.

2. **Output shape is also zod-derived** (Constitution Principle III, FR-007). `readPropertyOutputSchema` defines both the runtime contract for the handler's return value AND the inferred TypeScript type. The handler does NOT return ad-hoc objects; the union schema covers all six possible runtime shapes for `value`.

3. **Two-call invariant** (R3): every successful return is the result of TWO `invokeCli` calls (Call A + Call B), serialised through the queue. The early-exit paths (`No frontmatter found.` → `{value: null, type: "unknown"}`; absent key in Call A → `{value: null, type: "unknown"}`) skip Call B because the type label is structurally fixed at `"unknown"` for those cases.

4. **Default-true `active` flag in active mode for Call A**: the handler emits `flags: ["active"]` for Call A in active mode. NOT for Call B (which is vault-scoped per R4).

5. **`name` never forwarded to CLI** (R2): the wrapper extracts the property by name client-side after JSON.parse. The CLI's `name=<n>` parameter on `properties` is NOT used.

6. **Type translation via lookup table** (R6): the handler ONLY translates via `OBSIDIAN_TYPE_TO_SPEC_TYPE`. Pattern-matching on values (e.g., regex-matching a date-shaped string to assign `"date"`) is forbidden — that would invent semantics beyond what Obsidian's property-type system surfaces.

7. **Verbatim value propagation** (FR-008): the `value` field in the output is the JSON-parsed Call A value, NOT a re-encoded / re-stringified shape. For object values, the handler propagates the JS object verbatim; the MCP serialisation envelope (registerTool's `JSON.stringify(result)`) re-encodes for the wire.

8. **No new error codes** (Constitution Principle IV, FR-021): the handler propagates `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) plus `VALIDATION_ERROR` from `registerTool`. Five codes total. No `read_property`-specific codes.

9. **Re-throw on unexpected**: any non-`UpstreamError` exception escaping `invokeCli` is re-thrown by the handler — `registerTool`'s outer catch then re-throws to the SDK envelope. Mirrors the precedent.

10. **No re-validation in the handler** (Constitution Principle III): the handler trusts its `ReadPropertyInput` parameter. It does NOT re-parse against the schema, does NOT defensively check for missing required fields, and does NOT inspect raw user input.

11. **No `child_process.spawn` in the tool layer** (FR-019 spirit): the handler routes ONLY through `invokeCli(...)`. Direct spawn calls in `src/tools/read_property/` are bugs.

12. **Sibling tools unchanged** (SC-009): `obsidian_exec` / `read_note` / `write_note` / `delete_note` source files (and tests, and docs) have zero substantive diff. The only acceptable diff is `src/server.ts`'s tool-registration list growing by one entry.

13. **`name` passes through verbatim** (FR-018): the handler does NOT sanitise, escape, or rewrite `input.name`. Names containing dots, dashes, or YAML reserved words are passed through to JSON.parse's lookup unchanged. The only operation on `name` is `Object.prototype.hasOwnProperty.call(parsed_a, input.name)` and `parsed_a[input.name]`.

---

## JSON Schema Emit Shape (post-010 flat)

The published `inputSchema` (after `stripSchemaDescriptions`) MUST conform to this shape:

```jsonc
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "name": { "type": "string", "minLength": 1 }
  },
  "required": ["target_mode", "name"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Note:
- All five top-level properties are typed inline (no `oneOf` envelope).
- `additionalProperties: false` at the top level (post-010 strict-mode safety net).
- `required: ["target_mode", "name"]` — both are unconditionally required across both modes.
- `vault`'s conditional requirement (specific-mode only) is enforced at runtime via `applyTargetModeRefinement`'s `superRefine`, NOT in the JSON Schema's `required` array (the canonical post-010 trade-off).
- Zero `description` keys at any depth.

The drift detector's `it.each` registry walk auto-asserts these properties for every registered tool, including `read_property` once it's added to `src/server.ts`. No `read_property`-specific drift fixture is added.

---

## RegisterDeps Shape

```ts
// In src/tools/read_property/handler.ts:
export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike; // test seam
  env?: NodeJS.ProcessEnv; // test seam
}

// In src/tools/read_property/index.ts:
export type RegisterDeps = ExecuteDeps;

export function createReadPropertyTool(deps: RegisterDeps): RegisteredTool;
```

Mirrors `createReadNoteTool` / `createDeleteNoteTool` exactly. `src/server.ts` passes the same `logger` and `queue` instances to all tool registrations so the four typed tools serialise through one channel.

---

## Top-level Description (FR-022)

The descriptor's `description` field — concise verb-led summary mentioning `help`:

```
Read a single named frontmatter property from a vault note. Returns { value, type } with the property's native YAML type preserved (text / list / number / checkbox / date / datetime / unknown). Specific mode: vault + exactly one of file (wikilink) or path (vault-relative) + name. Active mode: just name (reads the focused note). Absent properties and frontmatter-less files return { value: null, type: "unknown" } without error. Call help({ tool_name: "read_property" }) for full parameter docs and the error-code roster.
```

Reasonable default per FR-022; exact wording polished during /speckit-implement at the registration task. The structural contract (verb-led summary + `help` mention with the tool's own name + the `{value, type}` output shape disclosure + the no-error-on-absent disclosure) binds.

---

## Cross-references

- [spec.md](./spec.md) — FRs and SCs this artifact refines into runtime contract
- [research.md](./research.md) — design decisions R1–R12 + plan-stage live-CLI findings
- [contracts/read-property-input.contract.md](./contracts/read-property-input.contract.md) — public input contract
- [contracts/read-property-handler.contract.md](./contracts/read-property-handler.contract.md) — handler invariants + two-call invokeCli shape
- [quickstart.md](./quickstart.md) — verification scenarios mapped to SCs
- [012-delete-note data-model.md](../012-delete-note/data-model.md) — sibling artifact for the per-tool layout pattern
