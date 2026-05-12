# Data Model — Rename Note Typed MCP Tool

**Branch**: `021-rename-note` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Input schema

The wire-format zod schema, composed via the post-010 Pattern (a) flat-extension idiom:

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const renameNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1).regex(/^[^/\\]+$/, "name must not contain folder separators; use move_note to relocate the file to a different folder"),
  }),
);

export type RenameNoteInput = z.infer<typeof renameNoteInputSchema>;
```

**Field policy**:

| Field | Type | Specific mode | Active mode |
|-------|------|---------------|-------------|
| `target_mode` | `"specific" \| "active"` | REQUIRED | REQUIRED |
| `vault` | `string.min(1).optional` | REQUIRED (per target-mode primitive) | FORBIDDEN (per target-mode primitive) |
| `file` | `string.optional` | XOR with `path` (per target-mode primitive) | FORBIDDEN (per target-mode primitive) |
| `path` | `string.optional` | XOR with `file` (per target-mode primitive) | FORBIDDEN (per target-mode primitive) |
| `name` | `string.min(1).regex(/^[^/\\]+$/)` | REQUIRED | REQUIRED |

**Strict mode**: `additionalProperties: false` inherited from `targetModeBaseSchema.strict()`. Any top-level key other than the five listed above fails the parse with `code: "unrecognized_keys"`.

## Output schema

```typescript
export const renameNoteOutputSchema = z.object({
  renamed: z.literal(true),
  fromPath: z.string(),
  toPath: z.string(),
}).strict();

export type RenameNoteOutput = z.infer<typeof renameNoteOutputSchema>;
```

Three fields, strict mode. The `renamed` field is `z.literal(true)` because every successful return path produces it; failures surface through `UpstreamError`. Parity with `delete_note`'s `deleted: literal(true)` shape.

## Per-mode argv-mapping table

Locked at plan stage (R3 + F1). Exhaustive across all valid input combinations.

| target_mode | locator | name input | Adapter call shape |
|-------------|---------|------------|--------------------|
| `specific` | `path: "Inbox/Old.md"` | `"New"` | `invokeCli({ command: "rename", vault: <v>, parameters: { path: "Inbox/Old.md", name: "New.md" }, flags: [], target_mode: "specific" })` |
| `specific` | `path: "Inbox/Old.md"` | `"New.md"` | `invokeCli({ command: "rename", vault: <v>, parameters: { path: "Inbox/Old.md", name: "New.md" }, flags: [], target_mode: "specific" })` |
| `specific` | `file: "QuickNote"` | `"Quick Note"` | `invokeCli({ command: "rename", vault: <v>, parameters: { file: "QuickNote", name: "Quick Note.md" }, flags: [], target_mode: "specific" })` |
| `specific` | `path: "Drafts/Sketch.md"` | `"Sketch.canvas"` | `invokeCli({ command: "rename", vault: <v>, parameters: { path: "Drafts/Sketch.md", name: "Sketch.canvas.md" }, flags: [], target_mode: "specific" })` — `.canvas` not `.md` → `.md` appended; cross-extension renames out of scope per /speckit-clarify Q1 |
| `specific` | `path: "Inbox/Note.md"` | `"Note"` | `invokeCli({ command: "rename", vault: <v>, parameters: { path: "Inbox/Note.md", name: "Note.md" }, flags: [], target_mode: "specific" })` — same-name no-op case; CLI's behaviour (accept/reject/noop) captured at T0 |
| `active` | (n/a — forbidden by schema) | `"Today"` | `invokeCli({ command: "rename", vault: undefined, parameters: { name: "Today.md" }, flags: [], target_mode: "active" })` |

The `vault` field is hoisted to the TOP-LEVEL of the `invokeCli` argument (per 011-write-note PSR-3) — NOT inside `parameters`. The cli-adapter's `stripTargetLocators` defence-in-depth strip removes any leaked `vault`/`file`/`path` from `parameters` in active mode (a redundant safety net since the schema already rejects them).

## Extension-handling rule truth table

The `appendMdIfMissing` helper (~3 LOC in `handler.ts`) implements the /speckit-clarify Q1 resolution. Truth table:

| `name` input | `name.endsWith(".md")` | Forwarded argv-token value |
|--------------|------------------------|----------------------------|
| `"Fixed"` | `false` | `"Fixed.md"` |
| `"Fixed.md"` | `true` | `"Fixed.md"` |
| `"Doc.v1.draft"` | `false` | `"Doc.v1.draft.md"` |
| `"Doc.v1.draft.md"` | `true` | `"Doc.v1.draft.md"` |
| `"Renamed.MD"` | `false` (case-sensitive) | `"Renamed.MD.md"` |
| `"Sketch.canvas"` | `false` | `"Sketch.canvas.md"` |
| `"image.png"` | `false` | `"image.png.md"` |
| `"weird.xyz"` | `false` | `"weird.xyz.md"` |
| `"日記"` | `false` | `"日記.md"` |
| `".md"` | `true` | `".md"` (technically passes; this edge case is documented in `docs/tools/rename_note.md` but not specifically tested — the OS handles dot-only filenames per platform) |

Note: `name` cannot be empty (`.min(1)` rejects at schema layer) and cannot contain `/` or `\` (`.regex(...)` rejects at schema layer), so the helper never sees those values.

## Folder-separator-rejection truth table

The `name` field's regex `/^[^/\\]+$/` enforces /speckit-clarify Q2's resolution. Truth table:

| `name` input | regex `^[^/\\]+$` match | Result |
|--------------|--------------------------|--------|
| `"Fixed"` | yes | passes |
| `"Fixed.md"` | yes | passes |
| `"Sub/Fixed"` | no (`/` present) | `VALIDATION_ERROR` with `name` field path |
| `"Sub\\Fixed"` | no (`\` present) | `VALIDATION_ERROR` with `name` field path |
| `"a/b/c"` | no (`/` present) | `VALIDATION_ERROR` |
| `""` | no (empty doesn't satisfy `[^/\\]+`) | `VALIDATION_ERROR` — both `too_small` and `invalid_string`; the test asserts on whichever zod emits first |
| `"日/記"` | no (`/` present) | `VALIDATION_ERROR` |

## Per-tool invariants ↔ FR mapping

| Invariant | FR | Tested at |
|-----------|----|-----------|
| Module layout: `src/tools/rename_note/{schema, handler, index}.ts` + co-located tests | FR-001 | Tree structure (verified at /speckit-implement T010) |
| Schema composes `applyTargetModeRefinement(targetModeBaseSchema.extend(...))` (NOT `.merge()`) | FR-002 | Schema test: unknown-key rejected via `additionalProperties: false` |
| `name: z.string().min(1).regex(/^[^/\\]+$/)` | FR-003 | Schema tests cases (j), (k), (m) |
| Zero `.describe()` calls in schema.ts | FR-004 | grep verifiable; SC-005 |
| Output schema is also zod-derived | FR-005 | Schema test for output shape |
| JSON Schema via `zod-to-json-schema` (auto via `registerTool`'s `toMcpInputSchema`) | FR-006 | Drift detector at `_register.test.ts` |
| Single `invokeCli` call per request; vault hoisted to top-level | FR-007 + R9 | Handler tests assert `spawnFn.callCount === 1`; argv shape verified per the per-mode argv-mapping table |
| Routed through shared CLI queue | FR-008 | Handler tests via `deps.queue` |
| No per-call logger events at tool layer | FR-009 + R1 | grep verifiable; observability flows through cli-adapter events |
| Response shape `{ renamed: true, fromPath, toPath }` | FR-010 | Handler tests across happy-path cases |
| Registration via `registerTool` factory | FR-011 | Index test for descriptor shape |
| Top-level description mentions `help("rename_note")` + link-rewriting caveat | FR-012 | Index test for description-field content |
| `src/server.ts` tools-array entry added (alphabetical) | FR-013 | server.ts diff |
| Non-stub `docs/tools/rename_note.md` with ≥4 worked examples + Scope section + link-rewriting caveat | FR-014 | Index test for doc presence + non-stub assertion; SC-006 |
| `docs/tools/index.md` entry | FR-015 | Inspection |
| ~52 co-located tests | FR-016 | Test inventory (below) |
| Coverage floor preserved | FR-017 | `vitest run --coverage` aggregate ≥ 91.3% |
| Constitution Compliance checklist all-Y | FR-018 | PR description |
| T0 live-CLI characterisation pass | FR-019 | Captured into research.md amendment block at T0 completion |

## Test inventory (target: ~52 cases)

### Schema tests (`schema.test.ts`) — ~25 cases

Happy-path:
1. specific + path + `name` (Story 1)
2. specific + file + `name` (Story 2)
3. specific + path + `name.endsWith(".md")` (Story 3 verbatim-forwarding case)
4. specific + path + UTF-8 `name` (e.g., `日記`)
5. active + `name` (Story 5)

Failure-path:
6. specific without locator (Story 6 AC#1)
7. specific with both locators (Story 6 AC#2)
8. specific without vault (Story 6 AC#3)
9. active with `vault` (Story 6 AC#4)
10. active with `file` (Story 6 AC#4)
11. active with `path` (Story 6 AC#4)
12. specific with unknown top-level key (Story 6 AC#5)
13. specific with empty `name: ""` (Story 6 AC#6)
14. specific with `name` absent (Story 6 AC#7a)
15. specific with `name: 42` (non-string) (Story 6 AC#7b)
16. specific with `name: "Sub/X"` (Story 6 AC#8 — slash)
17. specific with `name: "Sub\\X"` (Story 6 AC#8 — backslash)
18. specific with `name: "a/b/c"` (multiple slashes)
19. specific with invalid discriminator (Story 6 AC#6 — but referencing target_mode: "unknown")
20. specific with `vault: ""` (empty-string vault per Edge Case)
21. specific with `name` containing leading slash (e.g., `name: "/Fixed"`)
22. specific with `name` containing trailing slash (e.g., `name: "Fixed/"`)
23. inferred TypeScript type compiles correctly (compile-time check via `expectTypeOf`)
24. output schema validates `{ renamed: true, fromPath: "P", toPath: "P" }` (same-name case)
25. output schema rejects `{ renamed: false, ... }` (literal-true check)

### Handler tests (`handler.test.ts`) — ~22 cases

Happy-path argv assembly:
1. Story 1 happy path: specific + path + `name: "Fixed"` → argv name token = `"Fixed.md"`
2. b2: `name: "Fixed.md"` → argv name token = `"Fixed.md"` (verbatim)
3. b3: `name: "Renamed.MD"` → argv name token = `"Renamed.MD.md"` (case-sensitive)
4. b4: `name: "Doc.v1.draft"` → argv name token = `"Doc.v1.draft.md"` (internal periods)
5. b5: `name: "Sketch.canvas"` → argv name token = `"Sketch.canvas.md"` (cross-extension narrowing)
6. Story 2: specific + file + `name`
7. Story 5 AC#1: active + `name` → argv has no locator tokens
8. UTF-8 `file: "笔记"` + `name: "日記"` → byte-perfect forwarding

Happy-path response parsing:
9. parseRenameResponse extracts fromPath/toPath from CLI stdout (T0-locked wording)
10. Same-name no-op (Story 9): `fromPath === toPath` invariant

Failure-path:
11. Adapter throws `CLI_BINARY_NOT_FOUND` → propagates (Story 7 AC#1)
12. Adapter throws `CLI_NON_ZERO_EXIT` with stderr → propagates (Story 7 AC#2)
13. Adapter throws `CLI_REPORTED_ERROR` for source-not-found → propagates verbatim (Story 4 AC#1 / Story 7 AC#3)
14. Adapter throws `CLI_REPORTED_ERROR` for destination-collision → propagates verbatim (Story 4 AC#2)
15. Adapter throws `ERR_NO_ACTIVE_FILE` (active mode) → propagates (Story 5 AC#3)
16. Adapter throws unknown-vault `CLI_REPORTED_ERROR` (011-R5 inherited) → propagates
17. Adapter throws non-`UpstreamError` exception → re-throws verbatim WITHOUT `asToolError` wrapping (Story 7 AC#4)
18. parseRenameResponse fails to match CLI stdout → `CLI_REPORTED_ERROR` with stdout in details

Single-spawn invariant (R9):
19. Happy path: `spawnFn.callCount === 1` (specific + path)
20. Happy path: `spawnFn.callCount === 1` (specific + file)
21. Happy path: `spawnFn.callCount === 1` (active)

Audit-trail invariant (Story 9 / FR-010):
22. Same-name rename: response carries `renamed: true` AND `fromPath === toPath` by string equality

### Registration tests (`index.test.ts`) — ~5 cases

1. `createRenameNoteTool({ logger, queue })` returns a `RegisteredTool` whose `descriptor.name === "rename_note"`
2. Descriptor's `inputSchema` has zero `description` keys at any depth (stripped); top-level `additionalProperties: false`; all five top-level properties (`target_mode`, `vault`, `file`, `path`, `name`) typed inline; no `oneOf` envelope
3. Descriptor's `description` field is non-empty, contains `"help"` (case-insensitive), references `rename_note` by name, AND surfaces the link-rewriting caveat
4. `docs/tools/rename_note.md` exists AND does NOT contain a TODO/stub marker AND positively contains all five error codes + four worked examples + link-rewriting caveat + Scope section
5. Registered handler validates input via the zod schema and propagates `VALIDATION_ERROR` for malformed input (round-trip through the registerTool wrapper)

## Module layout LOC budget

| File | Estimated LOC | Notes |
|------|---------------|-------|
| `src/tools/rename_note/schema.ts` | ~25 | Including `// Original — no upstream.` header, imports, input + output schemas, type exports |
| `src/tools/rename_note/handler.ts` | ~60 | Including header, imports, `appendMdIfMissing` (~3 LOC), `parseRenameResponse` (~10 LOC), `executeRenameNote` (~30 LOC), types (~5 LOC) |
| `src/tools/rename_note/index.ts` | ~25 | Including header, imports, name + description constants, factory function |
| `src/tools/rename_note/schema.test.ts` | ~300 | ~25 cases @ ~12 LOC average |
| `src/tools/rename_note/handler.test.ts` | ~350 | ~22 cases @ ~16 LOC average (includes stub spawn setup) |
| `src/tools/rename_note/index.test.ts` | ~100 | ~5 cases @ ~20 LOC average (descriptor inspection + doc-presence read) |
| **Source total** | **~110 LOC** | Three source files; SC-007 ceiling ≤60 LOC on handler.ts |
| **Test total** | **~750 LOC** | Three co-located test files |
| `docs/tools/rename_note.md` | ~220 lines | Non-stub Markdown per FR-014 |
| `src/server.ts` diff | +2 lines | Import + tools-array entry |
| `docs/tools/index.md` diff | +1 line | Tools index entry |
| `CHANGELOG.md` diff | +N lines | Patch-version entry per SC-016 |
| `package.json` diff | 1 line | Version bump 0.4.3 → 0.4.4 per SC-016 |
| `CLAUDE.md` diff | +1 line (via Phase 1 step 3) | Plan-pointer update |

Total new code: ~110 source LOC + ~750 test LOC + ~220 docs lines + ~5 lines of wiring across server.ts / index.md / CHANGELOG.md / package.json / CLAUDE.md.

## Compatibility / release

- **Version bump**: 0.4.3 → 0.4.4 (patch — purely additive surface; no existing tool changes, no error codes added, no ADRs amended). Per SC-016.
- **CHANGELOG entry**: names `rename_note`, summarises the input/output shape, surfaces the vault-config-dependent link-rewriting caveat, names the /speckit-clarify Q1 scope narrowing (cross-extension renames out of scope; obsidian_exec is the fallback).
- **README**: tools-list section updated if present.
- **docs/tools/index.md**: one-line entry per the existing convention.
- **No ADR amendments**. ADR-003 (target-mode enforcement), ADR-005 (token-optimized tool definitions), ADR-006 (centralized tool registration) are all implemented by this BI without modification.

## Open questions

NONE at plan stage. The two /speckit-clarify decisions (Q1, Q2) are locked. All FR-019 cases are deferred to T0 of /speckit-implement (NOT open questions — they're characterisation tasks with verification gates).
