# Data Model — Write Property

## Input schema (zod, single source of truth per Constitution III)

```typescript
// src/tools/write_property/schema.ts
import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const PROPERTY_WRITE_TYPE_LABELS = [
  "text", "list", "number", "checkbox", "date", "datetime"
] as const;
export type PropertyWriteTypeLabel = (typeof PROPERTY_WRITE_TYPE_LABELS)[number];

const valueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const writePropertyInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1),
    value: valueSchema,
    type: z.enum(PROPERTY_WRITE_TYPE_LABELS).optional(),
  }),
);

export const writePropertyOutputSchema = z
  .object({
    written: z.literal(true),
    path: z.string(),
    name: z.string(),
  })
  .strict();

export type WritePropertyInput = z.infer<typeof writePropertyInputSchema>;
export type WritePropertyOutput = z.infer<typeof writePropertyOutputSchema>;
```

**Notes on shape**:
- The input is the post-010 flat-extension idiom: `targetModeBaseSchema` (provides the target_mode discriminator + locator XOR + forbidden-key-in-active enforcement) extended with three write-property-specific fields. NO `.superRefine(...)` chain on top — parity with read_property's R3 / R6.
- `value` admits the four-shape union: `string`, `number`, `boolean`, `string[]`. **There is no `null` branch** (per FR-006); `null` is rejected at the boundary. **There is no heterogeneous-array branch** — `z.array(z.string())` rejects any element that isn't a string.
- `type` is the six-label enum from the user input. **There is no `"unknown"` branch** on the write side — unlike read_property's seven-label enum, the write side never accepts `"unknown"` as a caller-supplied type.
- `name` is `.min(1)` — empty string fails validation.
- Output `written` is `z.literal(true)`: success-only shape; failures throw `UpstreamError`.

## Type inference rules (FR-008)

When `type` is omitted, the handler resolves it from `value`'s JavaScript shape (NOT from string-parsing heuristics):

| `typeof value` (or `Array.isArray`) | Resolved type label |
|---|---|
| `boolean` | `"checkbox"` |
| `number` | `"number"` |
| `Array.isArray(value)` | `"list"` |
| `string` | `"text"` |

The resolved type label is what flows into the CLI argv `type=<label>` parameter (R3 / R6). When `type` is explicit, the explicit value wins.

**Date / datetime intentionally not inferable**: a string value like `"2026-12-31"` whose shape happens to parse as an ISO date is inferred as `"text"`. Callers who intend a date must pass `type: "date"` explicitly. This is the FR-009 deliberate-rule contract.

## CLI argv mapping table

For each `(target_mode, locator)` combination, the handler emits the following invokeCli calls:

| Mode | Calls | Call A argv | Call B argv |
|---|---|---|---|
| specific + path | **1** | — | `obsidian vault=<v> property:set name=<n> value=<v> [type=<t>] path=<p>` |
| specific + file (wikilink) | **2** | `obsidian vault=<v> file file=<wikilink>` | `obsidian vault=<v> property:set name=<n> value=<v> [type=<t>] path=<canonical-from-A>` |
| active | **2** | `obsidian eval code=<FIXED_TEMPLATE>` | `obsidian vault=<vault-from-A> property:set name=<n> value=<v> [type=<t>] path=<path-from-A>` |
| active + no focused file | **1** | `obsidian eval code=<FIXED_TEMPLATE>` (parsed.path === null → throws ERR_NO_ACTIVE_FILE; Call B short-circuited) | — |

**FIXED_TEMPLATE** (R15 — no user input interpolation):
```javascript
(()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,vault:app.vault.getName()});})()
```

The wrapper passes this as a discrete `code=` argv parameter via `child_process.spawn` (no shell). Anti-injection holds.

## Value serialisation (input.value → CLI `value=` parameter)

| Input shape | Output `value=` string | `type=` argv |
|---|---|---|
| `"hello"` (string) | `value=hello` | `type=text` (inferred) |
| `7` (number) | `value=7` | `type=number` (inferred) |
| `true` (boolean) | `value=true` | `type=checkbox` (inferred) |
| `false` (boolean) | `value=false` | `type=checkbox` (inferred) |
| `["alpha", "beta", "gamma"]` (3-element string[]) | `value=alpha,beta,gamma` | `type=list` (inferred) |
| `["alpha"]` (1-element string[]) | `value=alpha` | `type=list` (inferred) |
| `[]` (empty string[]) | `value=[]` (literal) | `type=list` (inferred) |
| `"2026-12-31"` + `type: "date"` | `value=2026-12-31` | `type=date` (explicit) |
| `"2026-05-10T14:30:00"` + `type: "datetime"` | `value=2026-05-10T14:30:00` | `type=datetime` (explicit) |
| `"hello # world"` (string with `#`) | `value=hello # world` | `type=text` (inferred) — CLI auto-quotes on disk per F9 |
| `["hello, world"]` (1-element with embedded `,`) | `value=hello, world` | `type=list` (inferred) — **DOCUMENTED LIMITATION**: CLI will split on the comma, producing a 2-element list on disk |

**Serialisation pseudocode**:

```typescript
function serialiseValue(value: WritePropertyInput["value"]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.join(",");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value); // string or number
}
```

## Response-shape construction

```typescript
return {
  written: true,
  path: canonicalPath,  // input.path, OR Call-A-resolved path
  name: input.name,     // verbatim echo
};
```

- `path` is the canonical vault-relative path. In specific+path mode it is `input.path`. In specific+file mode it is the path parsed from Call A's TSV. In active mode it is the path from Call A's eval JSON.
- `name` is echoed verbatim — including any dots, dashes, colons, etc. Caller-supplied byte-for-byte.

## Per-tool invariants

| Invariant | Source | Enforcement |
|---|---|---|
| Single MCP tool surface registered | FR-001 | Server registration at [src/server.ts](../../src/server.ts) (one new line). Drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers. |
| `target_mode` discriminator | FR-002 | targetModeBaseSchema enum. |
| Specific mode locator XOR | FR-003 | applyTargetModeRefinement superRefine. |
| Active mode forbids vault/file/path | FR-004 | applyTargetModeRefinement superRefine. |
| Non-empty `name` | FR-005 | `z.string().min(1)`. |
| `value` is one of 4 shapes | FR-006 | `z.union(...)` with `z.array(z.string())` (not `z.array(z.unknown())`). |
| `type` enum (when present) | FR-007 | `z.enum([...]).optional()`. |
| Type inference from value shape | FR-008 | `inferType()` helper in handler. |
| Date/datetime require explicit type | FR-009 | Inference rules — string defaults to text. |
| Strict mode forbids unknown keys | FR-010 | targetModeBaseSchema's `.strict()`. |
| Output `{written, path, name}` | FR-011 | writePropertyOutputSchema. |
| Type-vs-value contradiction → error | FR-012 | CLI rejection mapped via dispatch classifier to CLI_REPORTED_ERROR (per R6). |
| Add new key | FR-013 | CLI native — property:set adds when absent. |
| Overwrite existing key | FR-014 | CLI native — property:set replaces when present. |
| No-frontmatter file gets FM block | FR-015 | CLI native (verified F-no-FM). |
| Non-existent file → error | FR-016 | CLI native — `Error: File "..." not found.` mapped to CLI_REPORTED_ERROR. |
| Validation before any CLI call | FR-017 | registerTool's `schema.parse` runs before handler invocation. |
| Empty array → empty YAML list | FR-018 | Wrapper sends literal `value=[]` (R10 / F2). |
| Name passthrough | FR-019 | Handler emits `name=<input.name>` byte-for-byte. |
| Argv-array passing | FR-020 | invokeCli passes name/value as discrete argv elements. No shell, no eval interpolation. |
| YAML control chars round-trip | FR-021 | CLI auto-quotes on disk (F9). |
| Neighbouring fields preserved | FR-022 | CLI behaviour — values preserved byte-stable; YAML style normalises (R7 documented limitation). |
| CRLF / LF preservation | FR-023 | **PARTIAL** per R8 / F12; all-LF round-trips cleanly; CRLF files may have mixed endings post-write. |
| Active mode no focused file → error | FR-024 | eval pre-flight parses `parsed.path === null` → throws ERR_NO_ACTIVE_FILE. |
| Unknown vault → error | FR-025 | 011-R5 inheritance in cli-adapter. |
| Path-traversal handled by CLI | FR-026 | CLI confines (F7); maps to CLI_REPORTED_ERROR. |
| No new error codes | FR-027 | Confirmed — failures use VALIDATION_ERROR + the four cli-adapter codes + ERR_NO_ACTIVE_FILE. |
| Registration via registerTool factory | FR-028 | createWritePropertyTool wraps registerTool. |
| Each AC locked by ≥1 regression test | FR-029 | Test inventory below — 54 cases. |
| Live-CLI characterisation pass | FR-030 | research.md F1–F15; one case deferred to T0. |
| No existing typed-tool surface changes | FR-031 | Only server.ts grows by 2 lines (import + array entry). |
| Original-no-upstream headers | FR-032 | All 6 new source files carry the header. |
| Cross-type overwrite — resolved type wins | FR-033 | CLI native (F3); no wrapper logic. |

## Module layout & LOC budget

```text
src/tools/write_property/
├── schema.ts                    # ~30 LOC — writePropertyInputSchema + output + types + PROPERTY_WRITE_TYPE_LABELS
├── schema.test.ts               # ~250 LOC — 17 cases
├── handler.ts                   # ~150 LOC — executeWriteProperty + 3 helpers (inferType, serialiseValue, parseFileTSV) + FIXED_TEMPLATE constant
├── handler.test.ts              # ~750 LOC — 32 cases
├── index.ts                     # ~25 LOC — createWritePropertyTool factory via registerTool
└── index.test.ts                # ~80 LOC — 5 registration cases

docs/tools/write_property.md     # ~270 lines — input contract, output, error roster, 6 worked examples (each YAML type), known limitations (R7+R8+R9 element-with-comma)
```

**Total new source LOC**: ~205. Total new test LOC: ~1,080. Total new doc LOC: ~270.

**Modified existing files**:
- `src/server.ts`: +2 lines (import + tools-array entry, alphabetical between `createReadPropertyTool` and `createWriteNoteTool`).
- `docs/tools/index.md`: +1 line (table entry).
- `package.json`: 1-line description update.
- `CHANGELOG.md`: 1 new entry under `Unreleased`.
- `CLAUDE.md`: plan-pointer updated (Phase 1 step 3).
- `README.md`: tools-list section updated if present (TBD by /speckit-tasks).

**No edits to** `src/cli-adapter/`, `src/target-mode/`, `src/errors.ts`, `src/logger.ts`, `src/queue.ts`, `src/help/`, `src/tools/_register.ts`, `src/tools/_register.test.ts`, `src/tools/_shared.ts`, any existing per-tool module under `src/tools/`. FR-031 frozen-surface confirmed.

## Test inventory (motivates SC-015 floor of 30)

### schema.test.ts (17 cases)

| # | Case | Locks |
|---|---|---|
| 1 | specific + path + name + value (string) | US1 scenario 1 happy path |
| 2 | specific + file (wikilink) + name + value | US1 scenario 1 (file variant) |
| 3 | active + name + value | US2 scenario 1 |
| 4 | specific + path with explicit type | US1 scenario 5 / 6 |
| 5 | specific without locator → VALIDATION_ERROR | US3 scenario 1 / SC-008 |
| 6 | specific with both locators → VALIDATION_ERROR | US3 scenario 2 |
| 7 | specific without vault → VALIDATION_ERROR | US3 scenario 3 |
| 8 | empty name → VALIDATION_ERROR | US3 scenario 4 |
| 9 | missing name → VALIDATION_ERROR | US3 scenario 5 |
| 10 | missing value → VALIDATION_ERROR | US3 scenario 6 |
| 11 | value=null → VALIDATION_ERROR | US3 scenario 7 |
| 12 | value=object → VALIDATION_ERROR | US3 scenario 7 |
| 13 | value=heterogeneous-array → VALIDATION_ERROR | US3 scenario 7 |
| 14 | type=invalid-string → VALIDATION_ERROR | US3 scenario 8 |
| 15 | active with vault → VALIDATION_ERROR | US3 scenario 9 |
| 16 | active with file → VALIDATION_ERROR | US3 scenario 10 |
| 17 | active with path → VALIDATION_ERROR | US3 scenario 11; unknown-top-level key rejected (additionalProperties: false) covered by the strict() mode on targetModeBaseSchema and verified in case 17 via an extraneous-key probe |

### handler.test.ts (32 cases)

| # | Case | Locks |
|---|---|---|
| 1 | specific+path text — argv shape | US1#1, SC-001, FR-019, FR-020 |
| 2 | specific+path number — type inferred | US1#3, SC-003, FR-008 |
| 3 | specific+path boolean (true) — type inferred | US1#4, SC-004 |
| 4 | specific+path boolean (false) — type inferred | US1#4 |
| 5 | specific+path list 3-element — comma-joined argv | US1#2, SC-002, R9 |
| 6 | specific+path list 1-element | R9 single-element case |
| 7 | specific+path empty list — literal `[]` argv | US5#1, SC-010, FR-018, R10 |
| 8 | specific+path date with explicit type=date | US1#5, SC-005, FR-009 |
| 9 | specific+path datetime with explicit type=datetime | US1#6, SC-005 |
| 10 | specific+path with explicit type=text overriding default | FR-007 explicit-wins |
| 11 | specific+file — TWO calls (file → property:set) | US1#1 file variant, R3 specific+file |
| 12 | specific+file resolved canonical path in response | FR-011 response.path |
| 13 | active mode happy — TWO calls (eval → property:set), resolved path+vault in response | US2#1, SC-013 |
| 14 | active mode no focused file — ONE call (eval only), ERR_NO_ACTIVE_FILE | US2#2, FR-024 |
| 15 | active mode TOCTOU — focus shifts between probes; response.path reports the path resolved at step 1 | Edge case CONCURRENCY (active TOCTOU) |
| 16 | cross-type overwrite — number → text (R10 + FR-033) | US1#12, US2#4, SC-021 |
| 17 | overwrite same type — status queued → shipped | US1#7 |
| 18 | non-existent file → CLI_REPORTED_ERROR | US1#9, SC-007, FR-016 |
| 19 | unknown vault → CLI_REPORTED_ERROR (011-R5) | US1#10, FR-025 |
| 20 | type-vs-value contradiction (value=abc type=number) → CLI_REPORTED_ERROR | US1#11, SC-009, FR-012, R6 |
| 21 | type-vs-value contradiction (value=hello type=date) → CLI_REPORTED_ERROR | SC-009 |
| 22 | CLI_BINARY_NOT_FOUND propagates through | FR-027 |
| 23 | CLI_NON_ZERO_EXIT propagates through | FR-027 |
| 24 | name with dot — passthrough verbatim | FR-019, R10 (F10) |
| 25 | name with dash — passthrough verbatim | FR-019 |
| 26 | name with colon — passthrough verbatim | FR-019 |
| 27 | value with `#` — argv passthrough; CLI handles quoting | FR-020, FR-021 |
| 28 | value with leading `!` — argv passthrough | FR-021 |
| 29 | path-traversal `path=../../etc/passwd` → CLI_REPORTED_ERROR | FR-026, SC-020 |
| 30 | path-traversal `path=../OtherVault/x.md` → CLI_REPORTED_ERROR | SC-020 |
| 31 | response shape — specific+path echoes input.path | FR-011 |
| 32 | response shape — `written` is literal `true` | R11 |

### index.test.ts (5 cases)

| # | Case |
|---|---|
| 1 | Tool descriptor name is `"write_property"` |
| 2 | Description includes the tool's typed-write summary token |
| 3 | inputSchema has descriptions stripped (registerTool + stripSchemaDescriptions) |
| 4 | Help facility references `write_property` |
| 5 | `docs/tools/write_property.md` exists (asserted via assertToolDocsExist at server boot; verified per the drift detector) |

**Total: 17 + 32 + 5 = 54 cases**, vs SC-015 floor of 30. Drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers via its `it.each` registry walk — no edit required.

## Deferred work (T0 of /speckit-implement)

- **Concurrent-write probe** (FR-030 — last enumerated case): two parallel `property:set` invocations against the same fixture. Verifies the underlying serialiser's atomicity guarantees and any observed interleaving behaviour. Plan-stage deferred because orchestrated parallel CLI invocations are better handled inside the test suite's own test runner than via ad-hoc plan-stage probes.

All other 15 FR-030 enumerated cases verified live (F1–F15 in [research.md](./research.md)).
