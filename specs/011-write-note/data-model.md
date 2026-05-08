# Data Model — Write Note Typed MCP Tool

**Feature**: [011-write-note](./spec.md)
**Date**: 2026-05-08

This document captures the input/output schema shapes, the active-mode `superRefine` clauses, the user-field → CLI-argv mapping, the response-parsing decision tree, and the per-tool invariants. It is the authoritative reference for implementation; spec.md captures intent, contracts/ captures the public surface, this file captures the wire-level shape.

---

## Input schema

### Composition

```ts
// src/tools/write_note/schema.ts
import { z } from "zod";
import {
  applyTargetModeRefinement,
  targetModeBaseSchema,
} from "../../target-mode/target-mode.js";

export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    content: z.string(),
    template: z.string().optional(),
    overwrite: z.boolean().optional().default(false),
    open: z.boolean().optional(),                          // NO .default(false) — see R6
  })
).superRefine((input, ctx) => {
  if (input.target_mode !== "active") return;
  // Active-mode-specific clauses per Clarifications 2026-05-08 Q1, Q3.
  if (input.overwrite !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["overwrite"],
      message: "overwrite must be true in active mode (active mode is destructive by definition; explicit-opt-in posture binds uniformly)",
    });
  }
  if (input.template !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["template"],
      message: "template is not allowed in active mode",
    });
  }
  if (input.open !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["open"],
      message: "open is not allowed in active mode",
    });
  }
});

export type WriteNoteInput = z.infer<typeof writeNoteInputSchema>;
```

### Per-mode field policy

| Field | Specific mode | Active mode |
|---|---|---|
| `target_mode` | required (`"specific"`) | required (`"active"`) |
| `vault` | required (string, min 1) | forbidden — error from primitive's superRefine |
| `file` | optional; XOR with `path` | forbidden — error from primitive's superRefine |
| `path` | optional; XOR with `file` | forbidden — error from primitive's superRefine |
| `content` | required (any string, including empty) | required (any string, including empty) |
| `template` | optional | **forbidden — error from write_note superRefine (R6 / Clarifications 2026-05-08 Q3)** |
| `overwrite` | optional, default `false` | **must be exactly `true` — error from write_note superRefine (R6 / Clarifications 2026-05-08 Q1)** |
| `open` | optional (no schema-level default — handler reads `parsed.open ?? false`) | **forbidden — error from write_note superRefine (R6 / Clarifications 2026-05-08 Q3)** |
| any other top-level key | forbidden — `unrecognized_keys` error from `targetModeBaseSchema.strict()` | forbidden — same |

### `superRefine` issue shapes

| Trigger | `details.issues[]` entry shape |
|---|---|
| Specific mode, no `vault` | `{ code: "custom", path: ["vault"], message: "vault is required in specific mode" }` (from primitive) |
| Specific mode, neither `file` nor `path` | `{ code: "custom", path: [], message: "exactly one of `file` or `path` must be provided in specific mode (got neither)" }` (from primitive) |
| Specific mode, both `file` AND `path` | TWO issues: `{ code: "custom", path: ["file"], message: "exactly one of … (got both)" }` AND `{ code: "custom", path: ["path"], message: "exactly one of … (got both)" }` (from primitive) |
| Active mode, `vault` / `file` / `path` present | `{ code: "custom", path: [<key>], message: "<key> is not allowed in active mode" }` (from primitive) |
| Active mode, `overwrite !== true` | `{ code: "custom", path: ["overwrite"], message: "overwrite must be true in active mode ..." }` (from write_note) |
| Active mode, `template !== undefined` | `{ code: "custom", path: ["template"], message: "template is not allowed in active mode" }` (from write_note) |
| Active mode, `open !== undefined` | `{ code: "custom", path: ["open"], message: "open is not allowed in active mode" }` (from write_note) |
| Unknown top-level key (any mode) | `{ code: "unrecognized_keys", keys: [<key>], path: [], message: "Unrecognized key(s) in object: '<key>'" }` (from `.strict()`) |
| `target_mode` absent | `{ code: "invalid_type", path: ["target_mode"], received: "undefined" }` (from base) |
| `target_mode` invalid value | `{ code: "invalid_enum_value", path: ["target_mode"], options: ["specific", "active"], received: <value> }` (from base) |
| `content` absent | `{ code: "invalid_type", path: ["content"], received: "undefined" }` (from base) |

### TypeScript-inferred type

```ts
export type WriteNoteInput = z.infer<typeof writeNoteInputSchema>;
// = {
//     target_mode: "specific" | "active";
//     vault?: string;
//     file?: string;
//     path?: string;
//     content: string;
//     template?: string;
//     overwrite: boolean;        // required after parse (default false)
//     open?: boolean;            // optional after parse (no default)
//   }
```

Note: post-parse, `overwrite` is `boolean` (not `boolean | undefined`) because `.default(false)` collapses the optional. `open` remains `boolean | undefined` because no default applies — the handler reads `parsed.open ?? false`.

---

## Output schema

```ts
export const writeNoteOutputSchema = z
  .object({
    created: z.boolean(),
    path: z.string(),
  })
  .strict();

export type WriteNoteOutput = z.infer<typeof writeNoteOutputSchema>;
```

### Fields

- `created: boolean` — `true` for fresh creations; `false` for overwrites of existing files (also for active-mode rewrites of the focused note).
- `path: string` — the canonical vault-relative path the CLI reports. May differ from the input `file`-form locator's wikilink (the CLI resolves the wikilink to a concrete location). For active mode, this is the focused note's path.

The handler does NOT validate the output against `writeNoteOutputSchema` at runtime — the type is the source of truth for the handler's return shape; the schema exists for documentation and to anchor `WriteNoteOutput` via `z.infer`. The MCP envelope (`{ content: [{ type: "text", text: JSON.stringify(result) }] }`) is constructed by `registerTool`'s `responseFormat: "json"` default.

---

## Argv mapping (handler-layer)

For invocation `invokeCli({ command: "create", vault, parameters, flags, target_mode }, deps)`:

### Specific mode

| Source | Argv slot | Token form | Conditional |
|---|---|---|---|
| `parsed.vault` (required) | `vault` (top-level field) | hoisted by `dispatchCli` to `vault=<value>` argv prefix | always |
| `parsed.file` (optional, XOR with `path`) | `parameters.name` | `name=<value>` | only if defined |
| `parsed.path` (optional, XOR with `file`) | `parameters.path` | `path=<value>` | only if defined |
| `parsed.content` (required) | `parameters.content` | `content=<value>` | always |
| `parsed.template` (optional) | `parameters.template` | `template=<value>` | only if defined |
| `parsed.overwrite === true` | `flags` | bare-word `overwrite` | only if `true` (default-false-omit per Story 3 AC#3) |
| `parsed.open === true` | `flags` | bare-word `open` | only if `true` (handler reads `parsed.open ?? false`) |

### Active mode

| Source | Argv slot | Token form | Conditional |
|---|---|---|---|
| (no vault) | `vault` (top-level field) | undefined → not emitted | always (active-mode `vault` is undefined per primitive) |
| (no file) | (n/a) | (n/a) | always (active-mode `file` rejected by schema) |
| (no path) | (n/a) | (n/a) | always (active-mode `path` rejected by schema) |
| `parsed.content` (required) | `parameters.content` | `content=<value>` | always |
| `parsed.template` (forbidden) | (n/a) | (n/a) | always (active-mode `template` rejected by schema) |
| `parsed.overwrite === true` (guaranteed by schema) | `flags` | bare-word `overwrite` | unconditionally emitted (parse guarantees `true`) |
| `parsed.open` (forbidden) | (n/a) | (n/a) | always (active-mode `open` rejected by schema) |

### `invokeCli` call shape

```ts
const { stdout } = await invokeCli(
  {
    command: "create",
    vault: parsed.target_mode === "specific" ? parsed.vault! : undefined,
    parameters: <derived per table above>,
    flags: <derived per table above>,
    target_mode: parsed.target_mode,
  },
  { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
);
```

The `vault!` non-null assertion is justified by the primitive's `superRefine` runtime invariant ("vault is required in specific mode" — schema would have rejected the parse otherwise).

---

## Response parsing (CLI stdout → output object)

### Provisional algorithm (per R4)

```ts
function parseCreateResponse(stdout: string): WriteNoteOutput {
  // Strip leading whitespace; the live CLI's response prefixes with a blank line.
  const trimmed = stdout.trimStart();
  
  // R4 provisional: the CLI emits "Created: <path>" for fresh creations.
  // T0.1, T0.2 verify; T0.3 verifies the overwrite-success wording.
  const createdMatch = trimmed.match(/^Created:\s+(.+?)\s*$/m);
  if (createdMatch) {
    return { created: true, path: createdMatch[1] };
  }
  
  // R4 residual (T0.3 verifies): the overwrite-success wording is hypothesised
  // as "Updated: <path>" or similar. Until T0.3 captures the actual wording,
  // this branch is a placeholder.
  const updatedMatch = trimmed.match(/^Updated:\s+(.+?)\s*$/m);
  if (updatedMatch) {
    return { created: false, path: updatedMatch[1] };
  }
  
  // No recognised pattern — wrap as UpstreamError (matches the cli-adapter's
  // CLI_REPORTED_ERROR posture for unparseable success responses).
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    message: `write_note could not parse CLI response: ${trimmed.slice(0, 200)}`,
    details: { stdout: trimmed },
  });
}
```

### T0 amendment triggers

If T0.3 reveals the CLI does NOT emit `"Updated: <path>"` (or similar) and the create-vs-overwrite signal is absent from the CLI response:
- (a) Add a pre-call `obsidian file path=<path>` existence check; degrades latency. Last-resort.
- (b) Add a post-call file-stat call; relies on timestamp diffing.
- (c) Always report `created: true` with caveat in docs/tools/write_note.md.

The implementation chooses one before merge; the choice is documented in research.md as an R4 amendment.

### Active-mode parsing

R4's algorithm is identical for active mode. The CLI's `obsidian create` (no locator) returns the focused note's path on success per the spec; T0.8 verifies. If active mode returns a different shape (e.g., empty stdout because the active-mode rewrite is a side-effect operation that doesn't print the path), the parsing logic gains an active-mode branch that infers the path from a follow-up `obsidian file active` call OR returns `{ created: false, path: "" }` with a documented caveat. The amendment trigger is the same as R4's overwrite-signal trigger.

---

## Per-tool invariants (drift-detector contributions)

The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) has an `it.each` table of per-tool invariants. Adding `write_note` to the tools registry causes the table to fire for `write_note` automatically. The expected per-tool invariants for `write_note`:

| Invariant | Expected for write_note |
|---|---|
| `descriptor.name` | `"write_note"` |
| `descriptor.inputSchema.type` | `"object"` |
| `descriptor.inputSchema.additionalProperties` | `false` |
| `descriptor.inputSchema.properties` keys (set) | `{ target_mode, vault, file, path, content, template, overwrite, open }` |
| `descriptor.inputSchema.required` (set) | depends on zod-to-json-schema emit (likely `["target_mode", "content"]` because the `superRefine` enforces vault-required-in-specific at runtime, not via the JSON Schema's `required` array) |
| zero `description` keys at any depth in `inputSchema` | true (post-strip) |
| `descriptor.description` includes literal `"help"` (case-insensitive) | true (per FR-012) |
| `descriptor.description` references `write_note` by name | true (per FR-012) |

These are inherited from the existing drift-detector contract; no new invariants added.

---

## Module layout (file-by-file)

| File | Purpose | LOC estimate |
|---|---|---|
| `src/tools/write_note/schema.ts` | Define `writeNoteInputSchema`, `writeNoteOutputSchema`, types via `z.infer`. | ~50 |
| `src/tools/write_note/handler.ts` | `executeWriteNote(input, deps)` — argv assembly, `invokeCli` call, response parsing. | ~70 |
| `src/tools/write_note/index.ts` | `createWriteNoteTool(deps)` factory via `registerTool`. Exports `WRITE_NOTE_TOOL_NAME` and `WRITE_NOTE_DESCRIPTION` constants. | ~30 |
| `src/tools/write_note/schema.test.ts` | 15 cases per FR-016. | ~250 |
| `src/tools/write_note/handler.test.ts` | 12 cases per FR-016. | ~300 |
| `src/tools/write_note/index.test.ts` | 5 registration cases per FR-016. | ~150 |
| **Source subtotal** | | **~150** |
| **Test subtotal** | | **~700** |
| **Module total** | | **~850 LOC** |

Plus single-line edits:
- `src/server.ts`: add `createWriteNoteTool({ logger, queue })` to the tools array.
- `docs/tools/index.md`: add one-line entry for `write_note`.
- `docs/tools/obsidian_exec.md`: add one paragraph noting `write_note` as the typed surface for create/overwrite.
- `package.json`: update `description` to mention `write_note`.
- `CHANGELOG.md`: add release entry.
- `docs/tools/write_note.md`: new file (~150 lines per FR-014).
