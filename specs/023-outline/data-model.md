# Phase 1: Data Model — Outline Typed Tool

## Schema shapes (zod source-of-truth per Constitution III)

### Input schema — `outlineInputSchema`

File-scoped; reuses `targetModeBaseSchema` + `applyTargetModeRefinement` per ADR-003 / the post-010 flat extension idiom. Adds a single optional `total: boolean` field. NO `heading` / `folder` / `ext` / `format` field — the wrapper hardcodes `format=json` (default mode) or sends just the `total` flag (count-only mode) per R3 / F14.

```typescript
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const outlineInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    total: z.boolean().optional(),
  }),
);

export type OutlineInput = z.infer<typeof outlineInputSchema>;
```

Resolved field policy:

| Field | Type | Required in specific | Required in active | Forbidden in active | Notes |
|---|---|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | yes | yes | — | Discriminator (FR-002) |
| `vault` | `string` (min 1) | yes | — | yes | FR-003 / FR-004 |
| `file` | `string` | XOR with `path` | — | yes | FR-003 / FR-004 |
| `path` | `string` | XOR with `file` | — | yes | FR-003 / FR-004 |
| `total` | `boolean` | no (default false) | no (default false) | — | FR-005 — count-only switch |

Strict object — no unknown top-level keys allowed (FR-006). Path-traversal in `path` is NOT regex-rejected at the schema layer; instead it is rejected at the vault-access layer per F16 (FR-019 permissive locus).

### Output schema — `outlineOutputSchema`

Single envelope shape across both default and count-only modes (FR-007). In default mode, `headings` is fully populated; in count-only mode, `headings` is empty.

```typescript
const outlineHeadingSchema = z
  .object({
    level: z.number().int().min(1).max(6),
    text: z.string(),
    line: z.number().int().positive(),
  })
  .strict();

export const outlineOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    headings: z.array(outlineHeadingSchema),
  })
  .strict();

export type OutlineOutput = z.infer<typeof outlineOutputSchema>;
export type OutlineHeading = z.infer<typeof outlineHeadingSchema>;
```

Field semantics (FR-008 / FR-009 / FR-010 / FR-011):
- `level`: 1–6, source-faithful (FR-014 — never normalised).
- `text`: heading text payload — upstream's `format=json` already strips the `#`-marker prefix and the closing-ATX `##` suffix and surrounding whitespace per F3; inline markdown / `::` / Obsidian anchor markers all survive byte-faithfully per F4 / F5. Wrapper does NOT post-process.
- `line`: 1-based source line (FR-010); upstream's `format=json` already returns 1-based per F1 — no wrapper-side adjustment.

### Upstream wire schema — `outlineUpstreamHeadingSchema`

The shape returned by `obsidian outline format=json`. Used internally by the handler's parse step. Field-name mapping `heading` → `text` happens during the upstream-to-wrapper transform.

```typescript
const outlineUpstreamHeadingSchema = z
  .object({
    level: z.number().int().min(1).max(6),
    heading: z.string(),
    line: z.number().int().positive(),
  })
  .passthrough(); // tolerant to upstream adding fields in future

const outlineUpstreamArraySchema = z.array(outlineUpstreamHeadingSchema);
```

`passthrough()` rather than `strict()` — defence-in-depth against future upstream additions (e.g., a `position.start.offset` field) that should not break the wrapper. The wrapper extracts only `level` / `heading` / `line` and discards anything extra.

---

## Handler shape

```typescript
export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const EMPTY_OUTLINE_SENTINEL = "No headings found.";

export async function executeOutline(
  input: OutlineInput,
  deps: ExecuteDeps,
): Promise<OutlineOutput> {
  const flags: string[] = input.total === true ? ["total"] : [];
  const parameters: Record<string, string> = {};
  if (input.total !== true) parameters.format = "json";
  if (input.file !== undefined) parameters.file = input.file;
  if (input.path !== undefined) parameters.path = input.path;

  const result = await invokeCli(
    {
      command: "outline",
      vault: input.vault,
      parameters,
      flags,
      target_mode: input.target_mode,
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );

  const trimmed = result.stdout.trim();

  // R9: empty-outline sentinel detection — both modes share this branch.
  if (trimmed === EMPTY_OUTLINE_SENTINEL) {
    return { count: 0, headings: [] };
  }

  if (input.total === true) {
    // F6: total-mode upstream returns plain integer.
    const count = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(count) || count < 0 || String(count) !== trimmed) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        message: `Outline total mode returned non-integer stdout: ${JSON.stringify(trimmed)}`,
        details: { stage: "total-parse", stdout: trimmed },
      });
    }
    return { count, headings: [] };
  }

  // Default mode: parse JSON array, map heading→text.
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      message: `Outline JSON parse failed: ${(cause as Error).message}`,
      cause,
      details: { stage: "json-parse", stdout: trimmed },
    });
  }
  const upstreamArray = outlineUpstreamArraySchema.parse(parsed);
  const headings = upstreamArray.map((h) => ({
    level: h.level,
    text: h.heading,
    line: h.line,
  }));
  return { count: headings.length, headings };
}
```

Single `invokeCli` invocation per request (R3 / R12). The two failure paths (`total-parse`, `json-parse`) wrap into `CLI_REPORTED_ERROR` with a `details.stage` discriminator; no new error codes (FR-020 / Constitution Principle IV). All other failures (file-not-found, non-`.md` filetype, unknown vault silently ignored, output-cap kill, binary-not-found, no-active-file) flow through the dispatch layer's existing classifier without wrapper involvement (R7 / R8 / R5 / R10 / R13).

---

## Per-tool invariants

| Invariant | Source | Locked by |
|---|---|---|
| Tool name is `outline` | FR-001, F1 (matches upstream subcommand) | `OUTLINE_TOOL_NAME = "outline"` constant |
| Single CLI invocation per request | R3 / R12 | handler tests assert `spawnFn.mock.calls.length === 1` |
| Default mode sends `format=json` only | R3 / F14 | handler test asserts argv contains `format=json` AND does NOT contain `total` |
| Count-only mode sends `total` flag only | R3 / F14 | handler test asserts argv contains `total` AND does NOT contain `format=json` |
| Empty-outline sentinel maps to `{ count: 0, headings: [] }` | R9 / F7 | handler tests for both modes against fixture stdout = `"No headings found.\n"` |
| Default mode field rename `heading` → `text` | F1 / FR-008 | handler test asserts output `headings[0].text === upstream[0].heading` |
| `level` / `line` survive byte-faithfully | F1 / FR-010 / FR-014 | handler test compares output entries 1:1 against fixture upstream JSON |
| Inline markdown / anchor markers / `::` survive byte-faithfully | F4 / F5 / FR-011 | handler test asserts text byte equality across structurally-rich fixture |
| `total: true` returns `headings: []` even when count > 0 | FR-005 / FR-007 | handler test for non-zero file under total mode |
| Validation rejects unknown keys, conflicting locators, active-mode locator presence | FR-003 / FR-004 / FR-006 | schema tests (10+ cases) |
| Output schema admits no extra fields (strict) | FR-007 | output schema test asserts strict parse |

---

## Module LOC budget

| File | Source LOC | Test LOC | Notes |
|---|---|---|---|
| `src/tools/outline/schema.ts` | ~30 | — | Three zod schemas (input, output, upstream array) + types |
| `src/tools/outline/schema.test.ts` | — | ~250 | 18 cases (target_mode discriminator + total + additionalProperties + types) |
| `src/tools/outline/handler.ts` | ~90 | — | `executeOutline` + sentinel constant + parse/branch logic |
| `src/tools/outline/handler.test.ts` | — | ~600 | 28 cases (default mode happy + count-only mode happy + empty-outline both modes + field rename + level+line+text byte-faithful + inline markdown / `::` / closing-ATX survival via fixture + JSON parse failure + integer parse failure + unknown-vault silently ignored + file-not-found upstream + non-`.md` upstream rejection + active-mode happy + active-mode no-focus + argv shape default mode + argv shape total mode + single-spawn-per-request invariant) |
| `src/tools/outline/index.ts` | ~25 | — | `createOutlineTool` factory via `registerTool` |
| `src/tools/outline/index.test.ts` | — | ~80 | 5 cases (descriptor name, stripped schema, help mention, doc presence, drift-detector lock) |
| **Totals** | **~145** | **~930** | 51 tests across 3 layers — exceeds SC-015's floor of 25 |

`docs/tools/outline.md` ~180 lines (input schema, output shape × 2 modes, error roster, ≥4 worked examples, multi-vault inherited limitation, output-cap ceiling, Setext-included note, deferred-to-upstream architectural note linking to FR-012a / amended FR-013).

---

## Test inventory (51 cases)

**Schema (18 cases — `schema.test.ts`)**:

1. `target_mode: "specific"` + `vault` + `path` → ✓
2. `target_mode: "specific"` + `vault` + `file` → ✓
3. `target_mode: "specific"` + `vault` + both `file` AND `path` → ✗ (XOR)
4. `target_mode: "specific"` + `vault` + neither `file` NOR `path` → ✗
5. `target_mode: "specific"` + no `vault` → ✗
6. `target_mode: "active"` → ✓
7. `target_mode: "active"` + `vault` set → ✗
8. `target_mode: "active"` + `file` set → ✗
9. `target_mode: "active"` + `path` set → ✗
10. `total: true` valid in specific → ✓
11. `total: true` valid in active → ✓
12. `total: false` valid → ✓
13. `total` omitted (defaults) → ✓
14. `total: "true"` (string) → ✗
15. Unknown top-level key in specific → ✗ (FR-006 strict)
16. Unknown top-level key in active → ✗
17. `vault: ""` empty string → ✗ (min 1)
18. Inferred `OutlineInput` and `OutlineOutput` types compile

**Handler (28 cases — `handler.test.ts`)**:

Happy paths (default mode):
1. Multi-level fixture in specific+path → returns full headings array
2. Multi-level fixture in specific+file (wikilink) → returns full headings array
3. Multi-level fixture in active mode → returns full headings array
4. Field rename: upstream `heading` → output `text` byte-faithful
5. Inline markdown survives (`**bold**`)
6. `::` substring survives (`Sub-beta::case`)
7. Closing-ATX form pre-stripped (`## Title ##` → `Title`) — defers to upstream per F3
8. Setext entries appear in output (per F10 / R11) — locks deferred-to-upstream
9. Indented-code-block `#`-lines absent (per F12 / FR-012a) — locks deferred-to-upstream
10. Frontmatter `#`-like content absent (per F11)
11. Level-skipping preserved (FR-014)

Happy paths (count-only mode):
12. `total: true` against multi-heading file → `{ count: N, headings: [] }`
13. `total: true` against zero-heading file (`No headings found.` upstream) → `{ count: 0, headings: [] }`

Empty outline:
14. Default mode + zero-heading file → `{ count: 0, headings: [] }`

Argv assertions:
15. Default mode argv contains `format=json` and NOT `total`
16. Count-only mode argv contains `total` and NOT `format=json`
17. Both modes argv contains `vault=…` in specific mode
18. Active mode argv omits vault/file/path (cli-adapter strips)
19. Single spawn invocation per request

Failure paths:
20. JSON parse failure → `CLI_REPORTED_ERROR` with `details.stage = "json-parse"`
21. Total-mode integer parse failure (non-numeric stdout) → `CLI_REPORTED_ERROR` with `details.stage = "total-parse"`
22. File-not-found upstream → `CLI_REPORTED_ERROR` (dispatch-layer auto-classified)
23. Non-`.md` filetype upstream rejection → `CLI_REPORTED_ERROR` (dispatch-layer auto-classified per R8)
24. Active-mode no-focus → `ERR_NO_ACTIVE_FILE` (dispatch-layer auto-classified per R13; upstream string TBD at T0)
25. Path-traversal `path=../escape.md` → `CLI_REPORTED_ERROR` (per F16 / FR-019)
26. Output-cap kill (very large outline) → `CLI_NON_ZERO_EXIT` (dispatch-layer auto-classified per R10)
27. Binary not found → `CLI_BINARY_NOT_FOUND` (dispatch-layer auto-classified)
28. UpstreamError pass-through (handler does NOT wrap UpstreamError thrown by invokeCli)

**Registration (5 cases — `index.test.ts`)**:

1. `createOutlineTool({ logger, queue }).descriptor.name === "outline"`
2. Descriptor `inputSchema` has descriptions stripped (ADR-005)
3. `OUTLINE_DESCRIPTION` mentions `help({ tool_name: "outline" })`
4. `docs/tools/outline.md` exists with non-stub content (≥4 worked examples + error roster + input/output contracts)
5. The `_register-baseline.json` / `_register.test.ts` drift detector and FR-018 baseline both PASS after `npm run baseline:write` rolls forward
