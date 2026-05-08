# Data Model — `delete_note` Typed MCP Tool

**Feature**: [012-delete-note](./spec.md)
**Date**: 2026-05-08

This document is the Phase 1 design artifact for `delete_note`. It captures the input and output schema shapes, the user-field → CLI-argv mapping table, the response-parsing decision tree, the per-tool invariants, and the module layout LOC budget. The schemas here are the binding contract; the spec's prose narrates them, but if the prose and the schema diverge, **the schema wins** (Constitution Principle III).

---

## Module Layout

```
src/tools/delete_note/
├── schema.ts             # ~30 LOC — input + output schemas, types via z.infer
├── schema.test.ts        # ~150 LOC — 13 cases per FR-016
├── handler.ts            # ~50 LOC — thin invokeCli wrapper + parseDeleteResponse
├── handler.test.ts       # ~250 LOC — 12 cases per FR-016
├── index.ts              # ~25 LOC — createDeleteNoteTool factory via registerTool
└── index.test.ts         # ~120 LOC — 5 cases per FR-016
```

Total: ~120 LOC of source + ~520 LOC of co-located tests = ~640 LOC. Lower than write_note's ~150–200 LOC source (see [011 data-model.md](../011-write-note/data-model.md)) because:
- One field (`permanent`), not four (`content` / `template` / `overwrite` / `open`).
- No active-mode `superRefine` clauses (R6 — `permanent` has unambiguous semantics in both modes).
- `parseDeleteResponse` is structurally similar to `parseCreateResponse` but with no `created` boolean derivation (the response only echoes the path; `toTrash` is computed from input, not parsed).

Per Constitution Principle V, every source file carries the `// Original — no upstream. <one-line description>.` header. Test files inherit the same header convention (the `// Original — no upstream.` line).

---

## Input Schema (`deleteNoteInputSchema`)

### Composition

```ts
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const deleteNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    permanent: z.boolean().optional().default(false),
  }),
);

export type DeleteNoteInput = z.infer<typeof deleteNoteInputSchema>;
```

**Note the absence of a `.superRefine(...)` chain** — R6's departure from `write_note`'s schema. The target-mode primitive's existing rules (vault required in specific, locator XOR, vault/file/path forbidden in active, top-level `additionalProperties: false`) plus the `permanent` field's `.default(false)` are the entire input contract.

### Field-by-field

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `target_mode` | `z.enum(["specific", "active"])` | YES | From `targetModeBaseSchema`. Discriminator. |
| `vault` | `z.string().min(1)` | YES in specific, FORBIDDEN in active | Enforced by `applyTargetModeRefinement`. |
| `file` | `z.string()` | OPTIONAL in specific (XOR with `path`), FORBIDDEN in active | Wikilink-form locator. From `targetModeBaseSchema`. |
| `path` | `z.string()` | OPTIONAL in specific (XOR with `file`), FORBIDDEN in active | Vault-relative path with `.md` extension. From `targetModeBaseSchema`. |
| `permanent` | `z.boolean().optional().default(false)` | OPTIONAL in BOTH modes | `delete_note`-specific field. Default false (= to trash). Explicit-true bypasses trash. |

**Strict mode**: top-level `additionalProperties: false` is inherited from `targetModeBaseSchema`'s `.extend()` call (per [010-flatten-target-mode](../010-flatten-target-mode/spec.md) FR-002 — `.extend()` preserves the base's `unknownKeys` setting; `.merge()` would have reset to `"strip"`). Unknown keys at the top level surface as `code: "unrecognized_keys"` issues.

### Per-mode field policy

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (must be `"specific"`) | required (must be `"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `permanent` | OPTIONAL | OPTIONAL | `false` (coerced post-parse) |

**Note vs `write_note`**: `permanent` is permitted in active mode without restriction. `write_note` had three additional active-mode rules (overwrite-required, template-forbidden, open-forbidden); `delete_note` has zero. See R6.

### Validation issue paths

The composed schema produces `details.issues[]` entries with these `path` arrays for each violation class:

| Violation | `issues[].path` | Issue code |
|-----------|----------------|-----------|
| Specific mode, neither `file` nor `path` | `[]` (root-level) | `custom` (target-mode primitive) |
| Specific mode, both `file` AND `path` | `["file"]` and `["path"]` | `custom` |
| Specific mode, missing `vault` | `["vault"]` | `invalid_type` or `custom` |
| Active mode, `vault` present | `["vault"]` | `custom` |
| Active mode, `file` present | `["file"]` | `custom` |
| Active mode, `path` present | `["path"]` | `custom` |
| Unknown top-level key | `["pancakes"]` (or whichever key) | `unrecognized_keys` |
| Invalid `target_mode` value | `["target_mode"]` | `invalid_enum_value` |
| `permanent` non-boolean | `["permanent"]` | `invalid_type` |

Each violation surfaces as its own `details.issues[]` entry, following zod's standard issue shape. Multiple violations in one input produce multiple issues in one parse failure (no fail-fast).

---

## Output Schema (`deleteNoteOutputSchema`)

```ts
export const deleteNoteOutputSchema = z
  .object({
    deleted: z.literal(true),
    path: z.string(),
    toTrash: z.boolean(),
  })
  .strict();

export type DeleteNoteOutput = z.infer<typeof deleteNoteOutputSchema>;
```

### Field-by-field

| Field | Type | Notes |
|-------|------|-------|
| `deleted` | `z.literal(true)` | Always `true` on the success path. Failures throw `UpstreamError`, never produce `deleted: false`. Mirrors `read_note`'s no-discriminator response. |
| `path` | `z.string()` | The CLI-canonical vault-relative path AT THE MOMENT OF DELETION. For wikilink-form input (`file=`), this is the resolved folder-prefixed path (e.g., `Inbox/QuickNote.md`). |
| `toTrash` | `z.boolean()` | Derived structurally: `toTrash = !parsed.permanent`. NOT parsed from the CLI's response. The typed surface owns the safety-default contract; this is the audit-trail signal operators filter on. |

### Type inference

`DeleteNoteOutput` is `z.infer<typeof deleteNoteOutputSchema>` — equivalent to:

```ts
type DeleteNoteOutput = {
  deleted: true; // literal type, NOT boolean
  path: string;
  toTrash: boolean;
};
```

The literal `true` for `deleted` is intentional: it signals to TypeScript callers that they don't need to discriminate on `deleted` — every successful return has the same `deleted` value. Failures take the throw path, never a `deleted: false` shape.

### Audit-trail invariant (SC-014)

For every successful call:

```
toTrash === !parsed.permanent
```

Equivalently:

| Caller-supplied `permanent` | Resulting `toTrash` |
|------------------------------|---------------------|
| omitted (defaults to `false`) | `true` (file moved to trash) |
| explicit `false` | `true` (file moved to trash) |
| explicit `true` | `false` (file permanently deleted) |
| explicit `undefined` (zod accepts as omitted) | `true` (file moved to trash) |

Operators auditing logs filter on `toTrash === false` to surface every irreversible deletion. The invariant is enforced by the handler's structural derivation (FR-010); SC-014 verifies it across all four success-path combinations.

---

## CLI Invocation Shape

### `invokeCli` call

```ts
await invokeCli(
  {
    command: "delete",
    vault: input.target_mode === "specific" ? input.vault! : undefined,
    parameters: <derived per the table below>,
    flags: input.permanent === true ? ["permanent"] : [],
    target_mode: input.target_mode,
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
```

- `command: "delete"` — the live-CLI subcommand name verified during plan stage (R3 / [Live CLI Findings](./research.md#live-cli-findings)).
- `vault` is passed as a TOP-LEVEL field (per [011 PSR-3](../011-write-note/research.md)). The cli-adapter's `dispatchCli` hoists it to the `vault=<value>` argv-prefix slot. The handler does NOT include `vault` inside `parameters`.
- `target_mode` is forwarded so the adapter applies its active-mode locator-stripping defence-in-depth (per [src/cli-adapter/cli-adapter.ts:60-62](../../src/cli-adapter/cli-adapter.ts#L60-L62)).

### Argv mapping table

| User-facing field | Specific mode → CLI argv | Active mode → CLI argv |
|-------------------|--------------------------|------------------------|
| `target_mode` | (used for adapter behaviour, not forwarded as argv) | (used for adapter behaviour, not forwarded as argv) |
| `vault` | `vault=<value>` (hoisted by adapter) | n/a — undefined |
| `file` (wikilink) | `file=<value>` (parameters) | n/a — schema rejects |
| `path` (vault-relative) | `path=<value>` (parameters) | n/a — schema rejects |
| `permanent: true` | `permanent` (flags array) | `permanent` (flags array) |
| `permanent: false` (or omitted) | (no token emitted in argv) | (no token emitted in argv) |

**Default-false-omit rule**: `permanent: false` (whether default-coerced or explicitly set) MUST NOT emit any `permanent`-shaped token in argv. Spec Story 1 AC#2 + Story 3 AC#2.

**Note vs `write_note`**: there is NO field rename. The user-facing `file` maps directly to CLI argv `file=<value>` for the `delete` subcommand (R3). `write_note` had a `file` → `name=` rename because `create` uses a different argv key.

### Argv produced (concrete examples)

| Input | Argv passed to spawn (post-vault-hoist) |
|-------|------------------------------------------|
| `{ target_mode: "specific", vault: "MyVault", path: "Inbox/Old.md" }` | `["delete", "vault=MyVault", "path=Inbox/Old.md"]` |
| `{ target_mode: "specific", vault: "MyVault", file: "QuickNote" }` | `["delete", "vault=MyVault", "file=QuickNote"]` |
| `{ target_mode: "specific", vault: "V", path: "Old.md", permanent: true }` | `["delete", "vault=V", "path=Old.md", "permanent"]` |
| `{ target_mode: "specific", vault: "V", path: "Old.md", permanent: false }` | `["delete", "vault=V", "path=Old.md"]` |
| `{ target_mode: "active" }` | `["delete"]` |
| `{ target_mode: "active", permanent: true }` | `["delete", "permanent"]` |

The exact placement of the `permanent` token within the argv array is determined by the cli-adapter's `dispatchCli` argv-assembler; the handler emits `flags: ["permanent"]` and the adapter places the flag-token after the parameters (matching the existing convention for `overwrite` / `open` in `write_note`).

---

## Response Parsing

### `parseDeleteResponse` decision tree

Hypothesised (locked at T0 per R4):

```
stdout.trimStart() ─ matches /^(Trashed|Deleted): (.+?)\s*$/m? ─ yes ─→ { deleted: true, path: <captured>, toTrash: <derived from input> }
                                                                  └─ no ──→ throw UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stdout }, message: "delete_note could not parse CLI response: ..." })
```

(The actual regex pattern depends on T0's captured wording. The hypothesis above mirrors the `write_note` `parseCreateResponse` pattern at [src/tools/write_note/handler.ts:16](../../src/tools/write_note/handler.ts#L16) — `/^(Created|Overwrote):\s+(.+?)\s*$/m`. The first capture group exists only to extract the subject for diagnostic / logging purposes; it does NOT drive `toTrash`'s value. `toTrash` is always computed from input, not from regex match.)

### `toTrash` derivation (NOT from response)

```ts
const toTrash = !parsedInput.permanent;
```

Computed AFTER the response is parsed but BEFORE the output is returned. The CLI's response wording is irrelevant to this field; the typed surface owns the audit invariant.

### Failure cases handled by the regex match failure

| CLI behaviour | Adapter classification | Handler behaviour |
|---------------|------------------------|-------------------|
| Exit 0, stdout `Error: file not found at ...` | `CLI_REPORTED_ERROR` (caught at dispatch layer's `Error:` prefix matcher) | Propagate verbatim (handler never sees the success path) |
| Exit 0, stdout `Vault not found.` | `CLI_REPORTED_ERROR` (caught at adapter's `UNKNOWN_VAULT_PREFIX` re-classifier per R5) | Propagate verbatim |
| Exit 0, stdout `OK` (no path) | Reaches handler's success path; `parseDeleteResponse` regex fails | Throws `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stdout }, message: "delete_note could not parse CLI response: OK" })` |
| Exit 1, any stderr | `CLI_NON_ZERO_EXIT` (dispatch layer) | Propagate verbatim |
| Spawn failure (ENOENT) | `CLI_BINARY_NOT_FOUND` (dispatch layer) | Propagate verbatim |
| Active mode, no focused note | `ERR_NO_ACTIVE_FILE` (dispatch layer per [003-cli-adapter](../003-cli-adapter/spec.md) FR-008(b)) | Propagate verbatim |

---

## Per-tool Invariants

These invariants MUST hold at all times. Violations are bugs.

1. **Schema is the single source of truth** (Constitution Principle III). The same `deleteNoteInputSchema` produces both the runtime `parse` AND the published JSON Schema (via `toMcpInputSchema` at [src/tools/_shared.ts](../../src/tools/_shared.ts)). The TypeScript type is `z.infer<typeof deleteNoteInputSchema>`. No hand-rolled `interface`, no parallel JSON Schema, no `as` casts that bypass parse.

2. **Output shape is also zod-derived** (Constitution Principle III, FR-005). `deleteNoteOutputSchema` defines the exact runtime contract for the handler's return value AND the inferred TypeScript type. The handler does NOT return ad-hoc objects.

3. **Audit invariant** (FR-010, SC-014): `toTrash === !parsedInput.permanent` for every successful return. Verified by the parameterised handler test enumerated under spec Story 8.

4. **Default-false-omit in argv** (FR-007, Story 1 AC#2 + Story 3 AC#2): the `permanent` token MUST NOT appear in argv when `parsedInput.permanent === false`. Equivalently: handler emits `flags: input.permanent === true ? ["permanent"] : []`, never `flags: input.permanent === false ? [] : ["permanent"]` (the equivalence is conceptually identical but the test's argv-assertion locks against the empty-array path).

5. **Verbatim path propagation** (FR-010): the `path` field in the output is the CLI's reported value, NOT a re-derivation from the input locator. For wikilink-form input (`file=`) the CLI resolves to a folder-prefixed canonical path; the handler propagates the resolved value verbatim.

6. **No new error codes** (Constitution Principle IV, FR-018): the handler propagates `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`); `registerTool` wraps `ZodError` as `VALIDATION_ERROR`. Five codes total. No `delete_note`-specific codes.

7. **Re-throw on unexpected** (Story 6 AC#4): any non-`UpstreamError` exception escaping the adapter (e.g., a runtime TypeError from a bug in argv-assembly) is re-thrown by the handler — `registerTool`'s outer catch then re-throws to the SDK envelope. Mirrors the `obsidian_exec` / `read_note` / `write_note` precedent.

8. **No re-validation in the handler** (Constitution Principle III): the handler trusts its `DeleteNoteInput` parameter. It does NOT re-parse against the schema, does NOT defensively check for missing required fields, and does NOT inspect raw user input.

9. **No `child_process.spawn` in the tool layer** (SC-003): the handler routes ONLY through `invokeCli(...)`. Direct spawn calls in `src/tools/delete_note/` are bugs.

10. **Sibling tools unchanged** (SC-009): `obsidian_exec` / `read_note` / `write_note` source files (and tests, and docs) have zero substantive diff. The only acceptable diff is `src/server.ts`'s tool-registration list growing by one entry.

---

## JSON Schema Emit Shape (post-010 flat)

The published `inputSchema` (after `stripSchemaDescriptions`) MUST conform to this shape — verifiable via the consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts):

```jsonc
{
  "type": "object",
  "properties": {
    "target_mode": { "type": "string", "enum": ["specific", "active"] },
    "vault": { "type": "string", "minLength": 1 },
    "file": { "type": "string" },
    "path": { "type": "string" },
    "permanent": { "type": "boolean", "default": false }
  },
  "required": ["target_mode"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

Note:
- All five top-level properties are typed inline (`type: "object"` at the top level, no `oneOf` envelope).
- `additionalProperties: false` at the top level (post-010 strict-mode safety net).
- `required: ["target_mode"]` — `vault`'s conditional requirement (specific mode only) is NOT encoded in the JSON Schema's `required` array. It's enforced at runtime via the `applyTargetModeRefinement` `superRefine`. This is the canonical post-010 trade-off (per the [drift-detector contract](../010-flatten-target-mode/contracts/flat-target-mode.contract.md)) — the flat shape is more permissive on paper than the runtime contract; the runtime is the authoritative gate.
- Zero `description` keys at any depth — the strip utility removes them all (per ADR-005).

The drift detector's `it.each` registry walk auto-asserts these properties for every registered tool, including `delete_note` once it's added to `src/server.ts`. No `delete_note`-specific drift fixture is added (per spec FR-016 + 010 FR-008).

---

## RegisterDeps Shape

```ts
// In src/tools/delete_note/handler.ts:
export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike; // test seam; production is undefined → cli-adapter uses real child_process.spawn
  env?: NodeJS.ProcessEnv; // test seam; production is undefined → cli-adapter uses real process.env
}

// In src/tools/delete_note/index.ts:
export type RegisterDeps = ExecuteDeps;

export function createDeleteNoteTool(deps: RegisterDeps): RegisteredTool;
```

Mirrors `createWriteNoteTool` exactly. `src/server.ts` passes the same `logger` and `queue` instances to `createDeleteNoteTool`, `createWriteNoteTool`, `createReadNoteTool`, and `createObsidianExecTool` so all four tools serialize through one channel (FR-008).

---

## Top-level Description (FR-012)

The descriptor's `description` field — the concise verb-led summary that mentions `help` and surfaces the safety-default disclosure:

```
Delete a note from an Obsidian vault. Default sends the file to the OS trash (recoverable); permanent: true bypasses trash and is irreversible. Call help({ tool_name: "delete_note" }) for full parameter docs and the error-code roster.
```

(Reasonable default per FR-012; exact wording may be polished during /speckit-implement at T005. The structural contract — verb-led summary + `help` mention with the tool's own name + safety-default disclosure with the irreversibility warning — binds.)

---

## Cross-references

- [spec.md](./spec.md) — FRs and SCs this artifact refines into runtime contract
- [research.md](./research.md) — design decisions R1–R10 + plan-stage live-CLI findings
- [contracts/delete-note-input.contract.md](./contracts/delete-note-input.contract.md) — public input contract
- [contracts/delete-note-handler.contract.md](./contracts/delete-note-handler.contract.md) — handler invariants + invokeCli call shape
- [quickstart.md](./quickstart.md) — verification scenarios mapped to SCs
- [011-write-note data-model.md](../011-write-note/data-model.md) — sibling artifact this one mirrors
