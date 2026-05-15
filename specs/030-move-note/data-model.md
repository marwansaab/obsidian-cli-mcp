# Phase 1 Data Model — Move Note Typed MCP Tool

**Branch**: `030-move-note` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document captures the input/output schema shapes, per-mode CLI argv-mapping table, `resolveTo` helper truth table, per-tool invariants ↔ FR mapping, module layout LOC budget, and test inventory for `move`.

## Input schema

Composed via the post-010 Pattern (a) flat-extension idiom per [010-flatten-target-mode](../010-flatten-target-mode/spec.md):

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const moveInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    to: z.string().min(1),
  })
);

export type MoveInput = z.infer<typeof moveInputSchema>;
```

The composed schema inherits the target-mode primitive's full per-mode contract end-to-end:
- `target_mode: "specific" | "active"` (required)
- `vault` required in specific, forbidden in active
- exactly one of `file`/`path` in specific, both forbidden in active
- `to` required in both modes, non-empty
- `additionalProperties: false` strict-mode against unknown top-level keys

**No tool-specific superRefine clauses are added** beyond the target-mode primitive's existing rules. The strict trailing-`/` discriminator (per /speckit-clarify Q2) and the source-`.md`-guarded `.md` append rule (per /speckit-clarify Q1) live at the handler layer in the `resolveTo` helper — they are transformations of validated input, not validation rules.

**No `.describe()` annotations** anywhere (per FR-004 / SC-005 — parameter documentation lives in `docs/tools/move.md`).

## Output schema

```typescript
export const moveOutputSchema = z.object({
  moved: z.literal(true),
  fromPath: z.string(),
  toPath: z.string(),
}).strict();

export type MoveOutput = z.infer<typeof moveOutputSchema>;
```

Three fields, strict mode. The `moved` field is `z.literal(true)` because every successful return path produces it (parity with `delete`'s `deleted: literal(true)` and `rename`'s `renamed: literal(true)`); failures surface through `UpstreamError`. JSON-serialised into the MCP `content[0].text` envelope per the existing tool-call-result convention.

## Per-mode CLI argv-mapping table

The handler routes validated input through the cli-adapter's `invokeCli` entry point. The CLI subcommand name is **`move`** (verified at plan-stage F1). The argv shape is `[obsidian, [vault=<v>,]? move, file=<f>|path=<p>|<omitted>, to=<resolved-to>]`. The wrapper's user-facing schema field names map to the CLI argv keys verbatim.

| `target_mode` | Locator input | Argv tokens emitted | `to=` value | Notes |
|----------------|---------------|----------------------|--------------|-------|
| `specific` | `path=<p>` | `vault=<v>` + `move` + `path=<p>` + `to=<resolveTo(to, p)>` | post-resolveTo transform applies (source-`.md` guard fully evaluable wrapper-side) | Headline P1 case; full applicability of R6 |
| `specific` | `file=<f>` | `vault=<v>` + `move` + `file=<f>` + `to=<to verbatim>` | verbatim (wrapper cannot apply source-`.md` guard without pre-resolve roundtrip per R3) | CLI native handling per T0 case xiii |
| `active` | — | `move` + `to=<to verbatim>` | verbatim (same reason as `file=` mode) | No `vault=`, no `file=`, no `path=` |

The cli-adapter's `stripTargetLocators` defensive layer (per [003-cli-adapter](../003-cli-adapter/spec.md)) removes any leaked `vault=`/`file=`/`path=` in active mode regardless — the wrapper's omission is the primary mechanism; the adapter's strip is the safety net.

## `resolveTo` helper truth table (per FR-003 + /speckit-clarify Q1 + Q2)

File-local helper in `handler.ts`:

```typescript
function resolveTo(to: string, fromPath: string): string {
  if (to.endsWith("/")) {
    return to + basename(fromPath);
  }
  const filenamePortion = to.includes("/") ? to.slice(to.lastIndexOf("/") + 1) : to;
  if (fromPath.endsWith(".md") && !filenamePortion.endsWith(".md")) {
    return to + ".md";
  }
  return to;
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
```

Both `endsWith` predicates are literal byte-equality, case-sensitive. Both helpers are file-local (no exports), ~12 LOC combined.

**Truth table** (specific + `path=` mode, where the source-`.md` guard fully evaluates wrapper-side):

| `fromPath` | `to` input | Branch | Output | Caller-visible `toPath` |
|-------------|------------|--------|--------|--------------------------|
| `Inbox/Note.md` | `Archive/` | folder-target | `Archive/Note.md` | `Archive/Note.md` |
| `Inbox/Note.md` | `Archive/2026/` | folder-target | `Archive/2026/Note.md` | `Archive/2026/Note.md` |
| `Inbox/Note.md` | `Archive/Renamed.md` | full-path verbatim | `Archive/Renamed.md` | `Archive/Renamed.md` |
| `Inbox/Note.md` | `Archive/Renamed` | full-path + append (source-`.md` AND filename non-`.md`) | `Archive/Renamed.md` | `Archive/Renamed.md` |
| `Inbox/Note.md` | `Archive/Doc.v1.draft` | full-path + append (internal periods preserved; `.draft` not in allowlist) | `Archive/Doc.v1.draft.md` | `Archive/Doc.v1.draft.md` |
| `Inbox/Note.md` | `Archive/Renamed.MD` | full-path + append (case-sensitive non-match; `.MD` ≠ `.md`) | `Archive/Renamed.MD.md` | `Archive/Renamed.MD.md` |
| `Inbox/Note.md` | `Archive/Plan.canvas` | full-path + append (`.canvas` not `.md`) | `Archive/Plan.canvas.md` | `Archive/Plan.canvas.md` (cross-type intent NOT honoured by default; route through `obsidian_exec move` for literal `.canvas` destination) |
| `Boards/Plan.canvas` | `Archive/` | folder-target | `Archive/Plan.canvas` | `Archive/Plan.canvas` (basename preserved verbatim; no extension transform) |
| `Boards/Plan.canvas` | `Archive/Renamed` | full-path verbatim (source-`.md` guard suppresses append; `fromPath.endsWith(".md") === false`) | `Archive/Renamed` | `Archive/Renamed` (CLI handles extensionless destination per T0 case xi) |
| `Boards/Plan.canvas` | `Archive/Renamed.md` | full-path verbatim (caller-explicit `.md`; cross-type intent honoured) | `Archive/Renamed.md` | `Archive/Renamed.md` |
| `Inbox/日記.md` | `Archive/` | folder-target | `Archive/日記.md` | `Archive/日記.md` (UTF-8 bytes forwarded verbatim) |
| `Welcome.md` | `Archive` (no trailing `/`) | full-path + append (the surprise case per R7) | `Archive.md` | `Archive.md` at vault root |
| `Inbox/Original.md` | `Inbox/Renamed.md` | full-path verbatim (same-folder rename equivalence per Story 8) | `Inbox/Renamed.md` | `Inbox/Renamed.md` — both source and destination share `Inbox/` as the parent folder, so the Story 8 invariant `dirname(fromPath) === dirname(toPath)` holds by string equality |

**Active and `file=` modes**: the wrapper forwards `to=` verbatim. The CLI's native handling determines whether `.md` is appended on `.md`-source moves. T0 case xiii captures this; the spec's structural contract (the rule fires in specific + `path=` mode) binds; active/`file=`-mode behaviour matches CLI native handling per FR-019.

## Per-tool invariants ↔ FR mapping

| Invariant | FR coverage | Lock |
|-----------|--------------|------|
| Tool name is exactly `"move"` (verbatim upstream subcommand) | FR-001 / FR-013 / ADR-010 | `descriptor.name === "move"` assertion at `index.test.ts` |
| Module lives at `src/tools/move/{schema,handler,index}.ts` + co-located tests | FR-001 / Principle I / II | Filesystem layout |
| Input schema composes `applyTargetModeRefinement(targetModeBaseSchema.extend({...}))` via `.extend()` (NOT `.merge()`) | FR-002 / Constitution III | Schema test asserts strict-mode posture |
| `to: z.string().min(1)` with no `.regex()` | FR-003 / SC-005 | Schema test cases for empty / non-string / valid |
| Output schema is `z.object({ moved: z.literal(true), fromPath, toPath }).strict()` | FR-005 / FR-006 | Output type via `z.infer`; strict mode |
| No `.describe()` calls in `schema.ts` | FR-004 / SC-005 | grep assertion |
| Single `invokeCli` call per request, regardless of mode | FR-007 / R3 / R11 | Handler test asserts `spawnFn.callCount === 1` for every test case |
| `vault=` passed as top-level field (NOT in `parameters`) | FR-007 / 011-PSR-3 | Adapter call shape verified by handler tests |
| `parameters.file` XOR `parameters.path` in specific mode | FR-007 | Schema's target-mode refinement; verified at schema tests |
| `parameters` has no locator tokens in active mode | FR-007 | Handler test in active mode |
| `resolveTo(to, fromPath)` applies trailing-`/` branch + source-`.md` guard per /speckit-clarify Q1 + Q2 | FR-003 / R6 / R7 / SC-013 | Handler tests (b)–(f2) cover the truth table |
| Handler returns `{ moved: true, fromPath, toPath }` byte-identical to CLI response wording | FR-010 | Handler tests assert payload shape; T0 confirms wording via `parseMoveResponse` |
| `same-folder` invariant `dirname(fromPath) === dirname(toPath)` holds for the rename-equivalence case | FR-010 / Story 8 | Handler test (n) |
| Active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`) | R9 / SC-014 / FR-014 | Handler test (l) injects capital-N stub error; asserts propagated code |
| `RegisterDeps` accepts `{ logger, queue }` + adapter pass-through | FR-008 / FR-009 / R1 | `index.ts` factory signature |
| Single in-flight queue serialises all CLI invocations | FR-008 | `src/server.ts` wiring (already shared) |
| `registerTool` factory applies `stripSchemaDescriptions`, wraps `ZodError`, propagates `UpstreamError` | FR-011 | Existing factory; no change |
| Top-level `description` mentions `help("move")` AND surfaces link-rewriting caveat | FR-012 | `index.test.ts` asserts substring match |
| Post-022 baseline rolls forward in same commit | FR-013a / R13 | `npm run baseline:write` lands with the new module; SC-009 fingerprint check |
| `docs/tools/move.md` exists, non-stub, ≥4 worked examples + error roster with `CLI_REPORTED_ERROR` note + `to`-shape rules + trailing-`/` surprise-case worked examples + link-rewriting caveat | FR-014 / FR-015 / SC-006 | `index.test.ts` asserts file presence + substring matches |
| Five propagated error codes only (no new) | FR-017a / Principle IV | grep assertion on `errors.ts`; no new entries |
| Original-no-upstream headers on every new source file | FR-001 / Principle V | header line in each `.ts` file |
| Constitution Compliance checklist evaluates as Y/Y/Y/Y/Y/Y/N/A/N/A/N/A | FR-018 | PR description |

## Test inventory (target: ~57 cases)

### Schema tests (`src/tools/move/schema.test.ts`) — ~24 cases

Cover the seven malformed-input classes (Story 4) plus four happy-path cases (Stories 1, 2, 5). Tests use the zod schema directly via `moveInputSchema.safeParse(...)`; no handler / spawn coupling.

1. Happy-path specific mode with `path=` and folder-target `to` (`to: "Archive/"`)
2. Happy-path specific mode with `path=` and full-path-target `to` (`to: "Archive/Renamed.md"`)
3. Happy-path specific mode with `path=` and full-path-target `to` without `.md` (`to: "Archive/Renamed"`)
4. Happy-path specific mode with `file=` (`file: "Tax-2026"`, `to: "Archive/"`)
5. Happy-path active mode (`target_mode: "active"`, `to: "Archive/"`)
6. Happy-path UTF-8 multi-byte path (`path: "Inbox/日記.md"`, `to: "Archive/"`)
7. Failure: neither `file` nor `path` in specific mode
8. Failure: both `file` AND `path` in specific mode (locator XOR violation)
9. Failure: `vault` missing in specific mode
10. Failure: `vault: ""` (empty string) in specific mode
11. Failure: forbidden `vault` key in active mode
12. Failure: forbidden `file` key in active mode
13. Failure: forbidden `path` key in active mode
14. Failure: unknown top-level key `pancakes: "yes"`
15. Failure: invalid `target_mode` discriminator value (e.g., `"all"`)
16. Failure: `target_mode` absent
17. Failure: `to` absent
18. Failure: `to: ""` (empty string)
19. Failure: `to: 42` (non-string)
20. Failure: `to: null`
21. Failure: `to: []` (array)
22. Failure: `target_mode: 42` (non-string discriminator)
23. Parity check: post-010 strict mode posture preserved (additional key in nested target-mode shape rejected) — drift detector covers in `_register.test.ts` but include a smoke case here
24. UTF-8 in `to` (`to: "アーカイブ/"`) accepts

### Handler tests (`src/tools/move/handler.test.ts`) — ~28 cases

Cover the per-mode argv-mapping table, the `resolveTo` truth table cases (b)–(f2), error code propagation, the single-spawn invariant, the same-folder rename-equivalence invariant, and the capital-N CLI_REPORTED_ERROR active-mode case. Tests inject the stub adapter via `deps.spawnFn`; every test asserts `spawnFn.callCount === 1`.

1. Happy-path specific + `path=` + folder-target invokes adapter with argv `vault=<v>, move, path=<p>, to=<p-folder + basename>` and returns `{ moved: true, fromPath, toPath }` (Story 1 AC#1)
2. Folder-target preserves source basename for nested subfolder `to: "Archive/2026/"` (Story 1 AC#2)
3. Folder-target preserves internal-periods source basename (`path: "Drafts/Doc.v1.draft.md", to: "Archive/"` → `Archive/Doc.v1.draft.md`) (Story 1 AC#3)
4. Full-path-target with explicit `.md` forwarded verbatim (Story 2 AC#1)
5. Full-path-target append (.md source, .md non-suffix) — `path: "Inbox/Note.md", to: "Archive/Renamed"` → forwarded `Archive/Renamed.md` (Story 2 AC#2)
6. Full-path-target append with internal periods — `to: "Archive/Doc.v1.draft"` → `Archive/Doc.v1.draft.md`
7. Full-path-target case-sensitive non-match — `to: "Archive/Renamed.MD"` → `Archive/Renamed.MD.md`
8. **Source-`.md` guard suppression** on non-`.md` source — `path: "Boards/Plan.canvas", to: "Archive/Renamed"` → forwarded `Archive/Renamed` verbatim (Story 2 AC#3; SC-013 load-bearing assertion)
9. Source-`.md`-guard suppression: caller-explicit `.md` preserved on non-`.md` source — `path: "Boards/Plan.canvas", to: "Archive/Renamed.md"` → forwarded `Archive/Renamed.md` verbatim
10. Happy-path specific + `file=` (wikilink locator) invokes adapter with argv `vault=<v>, move, file=<f>, to=<to verbatim>` (Story 2 AC#4)
11. Happy-path active mode invokes adapter with argv `move, to=<to verbatim>` (no locator tokens) (Story 5 AC#1)
12. Source-not-found stub-adapter throws `CLI_REPORTED_ERROR` → handler propagates verbatim (Story 3 AC#1)
13. Destination-collision stub-adapter throws `CLI_REPORTED_ERROR` → handler propagates verbatim with collision message (Story 3 AC#2)
14. `CLI_BINARY_NOT_FOUND` stub-adapter throws → handler propagates (Story 6 AC#1)
15. `CLI_NON_ZERO_EXIT` stub-adapter throws → handler propagates with stderr (Story 6 AC#2)
16. Generic `CLI_REPORTED_ERROR` stub-adapter throws → handler propagates verbatim (Story 6 AC#3)
17. **Active-mode no-focused-note**: stub-adapter throws `CLI_REPORTED_ERROR` with `details.message: "Error: No active file.\n"` → handler propagates `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`) (Story 5 AC#3; SC-014 load-bearing assertion)
18. Non-`UpstreamError` exception escapes adapter → handler re-throws verbatim WITHOUT `asToolError` wrapping (Story 6 AC#4)
19. Same-folder move (rename equivalence) — `dirname(fromPath) === dirname(toPath)` holds (Story 8 AC#1)
20. Specific + `path=` + full-path-target round-trip from input through `resolveTo` to response — assert handler returns canonical paths from CLI response, NOT re-derived input values
21. UTF-8 multi-byte path + UTF-8 multi-byte `to` round-trip
22. Single-spawn invariant: every preceding test asserts `spawnFn.callCount === 1` (composite assertion in shared beforeEach / test wrapper)
23. `parseMoveResponse` regex/parse rule (locked at T0 per R14): handler converts CLI stdout `"Moved: <from> → <to>\n"` (or alternative shape per T0 capture) to `{ moved: true, fromPath, toPath }` with byte-identical paths
24. `parseMoveResponse` on empty stdout (CLI accepts and returns nothing — anticipated alternative shape) falls back to deriving `fromPath` from input + `toPath` from resolveTo output
25. `parseMoveResponse` on unrecognised stdout shape returns an `UpstreamError` with `code: CLI_REPORTED_ERROR` + the stdout in `details` — guards against silent passthrough of CLI changes
26. Folder-target with `to: "/"` (vault-root single slash) edge case: handler forwards verbatim, CLI handles (T0 deferred)
27. `to=` value with leading `./` (current-folder shape): handler forwards verbatim (no normalisation), CLI handles (T0 deferred)
28. Argv key ordering invariant: argv tokens emit in stable order regardless of input-key ordering (Map iteration / Object spread stability across Node versions)

### Registration tests (`src/tools/move/index.test.ts`) — ~5 cases

1. `createMoveTool({ logger, queue })` returns a `RegisteredTool` whose `descriptor.name === "move"`
2. Descriptor's `inputSchema` has zero `description` keys at any depth AND has top-level `additionalProperties: false` AND has all five properties typed inline (no `oneOf`) — Story 7 AC#1, AC#2
3. Descriptor's `description` field is non-empty, contains `"help"` (case-insensitive), references `"move"` by name, AND surfaces the link-rewriting caveat — Story 7 AC#3
4. Registered handler validates input via the zod schema and propagates `VALIDATION_ERROR` for malformed input — Story 4 ACs
5. `docs/tools/move.md` exists, does NOT contain a TODO/stub marker, AND positively contains: all four propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`); the explicit note that active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR` (not `ERR_NO_ACTIVE_FILE`) with the verbatim `Error: No active file.` wording; all four required example shapes (FR-014 examples (i)–(iv)); the link-rewriting caveat; the trailing-`/` discriminator surprise-case worked examples per FR-014 enhanced post-Q2; the `.md` append rule with source-`.md`-guard explanation — Story 7 AC#4 / SC-006

**Drift detector** at `src/tools/_register.test.ts` auto-covers `move` via its `it.each` registry walk (per [010-flatten-target-mode](../010-flatten-target-mode/spec.md) FR-008). No test-file modifications required there.

**Registry-consistency test** at `src/server.test.ts` (per [005-help-tool](../005-help-tool/spec.md) FR-017) auto-asserts `docs/tools/move.md` exists once `move` is registered. No changes there.

**Durable registry-stability baseline test** at `src/tools/_register-baseline.test.ts` requires the FR-013a / R13 roll-forward (`npm run baseline:write`) to pass; the roll-forward lands in the same commit.

## Module layout LOC budget

| File | LOC budget | Notes |
|------|------------|-------|
| `src/tools/move/schema.ts` | ~25 | Input + output schemas, types via `z.infer`, JSON Schema export. Original-no-upstream header. |
| `src/tools/move/handler.ts` | ~70 | `executeMove(input, deps)` thin wrapper + `resolveTo(to, fromPath)` helper (~12 LOC) + `basename(path)` helper (~3 LOC) + `parseMoveResponse(stdout)` helper (~15 LOC, locked at T0). Original-no-upstream header. |
| `src/tools/move/index.ts` | ~25 | `createMoveTool({ logger, queue, ...deps })` factory via `registerTool`. Top-level `description` mentions `help("move")` and link-rewriting caveat. Original-no-upstream header. |
| `src/tools/move/schema.test.ts` | ~280 | ~24 cases × ~12 LOC each |
| `src/tools/move/handler.test.ts` | ~480 | ~28 cases × ~17 LOC each (stub spawn injection + assertion is denser than schema tests) |
| `src/tools/move/index.test.ts` | ~120 | ~5 cases × ~24 LOC each (registration assertions + docs-file body parse) |
| **Source subtotal** | **~120** | Three files |
| **Test subtotal** | **~880** | Three files; ~57 cases total |
| `docs/tools/move.md` | ~250 | New doc per FR-014 |
| `docs/tools/index.md` | +1 line | New entry |
| `src/server.ts` | +2 lines | Import + tools-array entry |
| `src/tools/_register-baseline.json` | +1 entry | Per R13 — regenerated via `npm run baseline:write` |
| `package.json` | +1 line edit | Version 0.5.7 → 0.5.8 |
| `CHANGELOG.md` | +1 entry | Patch version 0.5.8 |
| `CLAUDE.md` | active-narrative rotation | 029 demoted; 030 active |
| `.architecture/Obsidian CLI MCP - Architecture.md` | roll-forward | Adds `move` to the typed-tool inventory per the established convention |

## Compatibility / release

- **Additive surface**: `move` is a new typed tool. No existing tool's schema, output, error codes, or description changes. Per SC-009 the existing tools' source directories show zero substantive diff (only `_register-baseline.json` gains one entry; existing entries' fingerprints are byte-identical).
- **Version bump**: 0.5.7 → 0.5.8 (patch) per SC-016. Additive surface; no breaking changes.
- **No new error codes**. The inherited capital-N classifier mismatch on active-mode no-focused-note is documented as observable behaviour, not addressed via new code. Bridge-classifier change is a separate cross-cutting BI.
- **No ADR amendments**. ADR-010 PASS (verbatim upstream name); ADR-013 / ADR-014 / ADR-015 N/A (native-CLI-wrapper; no plugin runtime; no new sub-discriminator pairs).

## Open questions

None at Phase 1. All Phase 0 decisions ratified; all FR-019 cases either verified at plan stage (F1–F5b) or queued for T0 of `/speckit-implement` (cases (i)–(iv), (vi), (viii)–(xii) — 9 cases bundled into one `T001 [LIVE]` task at /speckit-tasks time).
