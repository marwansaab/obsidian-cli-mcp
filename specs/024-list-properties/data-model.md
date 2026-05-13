# Phase 1: Data Model — Properties Typed Tool

## Schema shapes (zod source-of-truth per Constitution III)

### Input schema — `propertiesInputSchema`

Vault-scoped; NO `target_mode` discriminator (per FR-004 — different from `read`, `delete`, `read_heading`, `outline`, etc.). Two optional fields: `vault` (string, min 1) and `total` (boolean, defaults to `false`). NO `file` / `path` / `active` / `name` / `sort` / `counts` / `format` fields — the wrapper hardcodes `format=json` (default mode) or `total` (count-only mode) per R3.

```typescript
import { z } from "zod";

export const propertiesInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    total: z.boolean().optional(),
  })
  .strict();

export type PropertiesInput = z.infer<typeof propertiesInputSchema>;
```

Resolved field policy:

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `vault` | `string` (min 1) | no | (focused vault — inherited limitation per R5 / F4) | FR-002 |
| `total` | `boolean` | no | `false` | FR-003 — count-only switch |

Strict object — no unknown top-level keys allowed (FR-005). Path-traversal in `vault` is NOT regex-rejected at the schema layer beyond the `.min(1)` non-empty check; defence-in-depth from F4 (upstream silently honours-as-noop the `vault=` parameter) and the cli-adapter's argv data-passing (R6) means a malicious `vault` value cannot reach a shell-evaluated context AND cannot escape the vault registry. Per FR-017 the locus of rejection is permissive — schema OR vault-access layer.

### Output schema — `propertiesOutputSchema`

Single envelope shape across both default and count-only modes (FR-006 / FR-006a). In default mode, `properties` is fully populated; in count-only mode, `properties` is empty.

```typescript
const propertyEntrySchema = z
  .object({
    name: z.string(),
    noteCount: z.number().int().nonnegative(),
  })
  .strict();

export const propertiesOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    properties: z.array(propertyEntrySchema),
  })
  .strict();

export type PropertiesOutput = z.infer<typeof propertiesOutputSchema>;
export type PropertyEntry = z.infer<typeof propertyEntrySchema>;
```

Field semantics (FR-006 / FR-007 / FR-008 / FR-009 / FR-013):

- `count`: number of distinct property names found in the vault (FR-006). Identical value across default and count-only modes for the same vault state (FR-006a cross-mode invariant; verified live by upstream's `total` flag returning array length per F3).
- `properties[i].name`: the YAML key byte-faithful from source. Case-sensitive deduplication (FR-009).
- `properties[i].noteCount`: number of notes whose frontmatter declares this property name (positive integer; an entry with `noteCount: 0` never appears in the array because that property is not in active use).
- `properties` ordering: alphabetical ascending by `name` with case-insensitive primary key and byte-order tiebreak (FR-013). Wrapper-side post-fetch sort (R8); upstream emits its own order but the wrapper re-imposes.

### Upstream wire schema — `propertiesUpstreamEntrySchema`

The shape returned by `obsidian properties format=json`. Used internally by the handler's parse step. Two field transforms happen during the upstream-to-wrapper map: drop `type` (per R7 / FR-004), rename `count` → `noteCount` (per R7 / FR-007).

```typescript
const propertiesUpstreamEntrySchema = z
  .object({
    name: z.string(),
    type: z.string(),
    count: z.number().int().nonnegative(),
  })
  .passthrough(); // tolerant to upstream adding fields in future

const propertiesUpstreamArraySchema = z.array(propertiesUpstreamEntrySchema);
```

`passthrough()` rather than `strict()` — defence-in-depth against future upstream additions (e.g., a `firstSeen` field) that should not break the wrapper. The wrapper extracts only `name` / `count` and discards `type` and anything extra.

---

## Handler shape

```typescript
export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeProperties(
  input: PropertiesInput,
  deps: ExecuteDeps,
): Promise<PropertiesOutput> {
  const flags: string[] = input.total === true ? ["total"] : [];
  const parameters: Record<string, string> = {};
  if (input.total !== true) parameters.format = "json";
  if (input.vault !== undefined) parameters.vault = input.vault;

  const result = await invokeCli(
    {
      command: "properties",
      parameters,
      flags,
      // NOTE: no target_mode field — properties is vault-only (R4 NOT APPLICABLE).
      // cli-adapter's stripTargetLocators does NOT execute for this tool.
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );

  const trimmed = result.stdout.trim();

  if (input.total === true) {
    // F3: total-mode upstream returns plain integer (distinct property names count).
    const count = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(count) || count < 0 || String(count) !== trimmed) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        message: `Properties total mode returned non-integer stdout: ${JSON.stringify(trimmed)}`,
        details: { stage: "total-parse", stdout: trimmed },
      });
    }
    return { count, properties: [] };
  }

  // Default mode: parse JSON array, drop type, rename count→noteCount, post-fetch sort.
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      message: `Properties JSON parse failed: ${(cause as Error).message}`,
      cause,
      details: { stage: "json-parse", stdout: trimmed },
    });
  }
  const upstreamArray = propertiesUpstreamArraySchema.parse(parsed);
  const properties = upstreamArray
    .map(({ name, count }) => ({ name, noteCount: count }))
    .sort((a, b) => {
      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();
      if (aLower !== bLower) return aLower < bLower ? -1 : 1;
      // Tiebreak: byte-order (uppercase letters precede lowercase per ASCII).
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  return { count: properties.length, properties };
}
```

Single `invokeCli` invocation per request (R3 / R12). The two failure paths (`total-parse`, `json-parse`) wrap into `CLI_REPORTED_ERROR` with a `details.stage` discriminator; no new error codes (FR-018 / Constitution Principle IV). All other failures (output-cap kill, binary-not-found) flow through the dispatch layer's existing classifier without wrapper involvement (R10). The unknown-vault case does NOT produce a wrapper-side error per R5 / F4 — upstream silently uses the focused vault.

**No empty-vault sentinel branch** — best-evidence assumption from R9 is that upstream returns `[]` JSON array (handled natively by the parse → map → sort chain, producing `{ count: 0, properties: [] }`) AND returns `0` for `total` mode (handled natively by the integer parse). If T0 reveals a sentinel string, the handler gains a sentinel-detection branch parallel to BI-023 R9 (planning contingency; not implemented at plan stage).

---

## Per-tool invariants

| Invariant | Source | Locked by |
|---|---|---|
| Tool name is `properties` | FR-001, F1 (matches upstream subcommand) | `PROPERTIES_TOOL_NAME = "properties"` constant |
| Single CLI invocation per request | R3 / R12 | handler tests assert `spawnFn.mock.calls.length === 1` |
| Default mode sends `format=json` only | R3 | handler test asserts argv contains `format=json` AND does NOT contain `total` |
| Count-only mode sends `total` flag only | R3 | handler test asserts argv contains `total` AND does NOT contain `format=json` |
| `vault` parameter is omitted from argv when input.vault is undefined | R6 | handler test with no-vault input asserts argv lacks `vault=` |
| `vault` parameter flows as a data argument in argv | R6 / FR-024 | handler test asserts argv element is exactly `vault=<value>` (no shell interpolation, no eval) |
| Per-entry `type` field is dropped during upstream-to-wrapper transform | R7 / FR-004 / F5 | handler test asserts output entries have exactly `{ name, noteCount }` keys |
| Per-entry `count` field is renamed to `noteCount` | R7 / FR-007 / F6 | handler test asserts wrapper output's `noteCount` equals upstream's `count` for the same entry |
| `properties` list is sorted case-insensitive-primary + byte-tiebreak | R8 / FR-013 | handler test against fixture `Tags, tags, Aardvark, aardvark` asserts order `Aardvark, aardvark, Tags, tags` |
| Outer `count` equals `properties.length` in default mode | FR-006a | handler test asserts `output.count === output.properties.length` |
| Outer `count` matches between default and count-only modes for the same vault | FR-006a / R11 | handler test runs both modes against the same mocked upstream and asserts `defaultOutput.count === totalOutput.count` |
| Validation rejects unknown keys, non-empty `vault`, non-boolean `total` | FR-005 / FR-002 / FR-003 | schema tests (7+ cases) |
| Output schema admits no extra fields (strict) | FR-006 / FR-007 | output schema test asserts strict parse |
| Type field carries no exposure surface in wrapper output | FR-004 | output schema does not declare `type` AND handler test asserts wrapper output entries do not carry `type` |

---

## Module LOC budget

| File | Source LOC | Test LOC | Notes |
|---|---|---|---|
| `src/tools/properties/schema.ts` | ~30 | — | Three zod schemas (input, output, upstream array) + types |
| `src/tools/properties/schema.test.ts` | — | ~220 | 16 cases (vault optional + total optional + types + strict + min-1 + unknown-key) |
| `src/tools/properties/handler.ts` | ~85 | — | `executeProperties` + parse/branch/sort logic |
| `src/tools/properties/handler.test.ts` | — | ~620 | 24 cases (default mode happy + count-only mode happy + empty vault both modes + field rename + type drop + sort order including case-distinct + cross-mode invariant + JSON parse failure + integer parse failure + active/file/path inputs forbidden via schema + argv shape × 2 modes + vault omitted vs supplied argv shape + single-spawn-per-request invariant + output-cap kill + binary-not-found + token-cost regression for SC-014) |
| `src/tools/properties/index.ts` | ~25 | — | `createPropertiesTool` factory via `registerTool` |
| `src/tools/properties/index.test.ts` | — | ~80 | 5 cases (descriptor name, stripped schema, help mention, doc presence, drift-detector lock) |
| **Totals** | **~140** | **~920** | 45 tests across 3 layers — exceeds SC-017's floor of 20 |

`docs/tools/properties.md` ~175 lines (input schema, output shape × 2 modes, error roster, ≥4 worked examples, multi-vault inherited limitation, output-cap ceiling, sort-order note linking to FR-013 clarifications session, type-metadata-out-of-scope note linking to BI-060 / future BI).

---

## Test inventory (45 cases)

**Schema (16 cases — `schema.test.ts`)**:

1. Empty object `{}` → ✓ (all fields optional)
2. `{ vault: "Demo" }` → ✓
3. `{ total: true }` → ✓
4. `{ total: false }` → ✓
5. `{ vault: "Demo", total: true }` → ✓
6. `{ vault: "" }` → ✗ (min 1)
7. `{ vault: 42 }` → ✗ (non-string)
8. `{ vault: null }` → ✗
9. `{ total: "true" }` → ✗ (non-boolean string)
10. `{ total: 1 }` → ✗
11. Unknown top-level key `{ vault: "Demo", file: "note.md" }` → ✗ (FR-005 strict)
12. Unknown top-level key `{ active: true }` → ✗
13. Unknown top-level key `{ format: "json" }` → ✗
14. Unknown top-level key `{ sort: "count" }` → ✗
15. Inferred `PropertiesInput` and `PropertiesOutput` types compile against representative values
16. Output schema `propertiesOutputSchema.strict()` rejects extra fields (e.g. `type` on a per-entry record)

**Handler (24 cases — `handler.test.ts`)**:

Happy paths (default mode):

1. Vault with multiple distinct properties → returns all entries with correct `noteCount`
2. Type field dropped: upstream entry `{ name: "tags", type: "tags", count: 4 }` → wrapper entry `{ name: "tags", noteCount: 4 }` (no `type`)
3. Count rename: wrapper `noteCount` equals upstream `count` field for the same entry
4. Sort order — case-insensitive primary + byte-tiebreak: upstream emits `[Tags, tags, Banana, Aardvark, aardvark]` (unsorted) → wrapper emits `[Aardvark, aardvark, Banana, Tags, tags]`
5. Sort order — alphabetical case-insensitive baseline: upstream emits already-sorted list → wrapper emits identical order
6. Sort order — all-lowercase fixture: alphabetical ascending preserved
7. Stable sort: repeated calls on same upstream return identical wrapper order
8. Reserved Obsidian properties (`tags`, `aliases`, `cssclasses`) appear in output alongside user-defined names with correct counts (parity to user-defined names — no special treatment)
9. Nested YAML value: upstream emits one entry per top-level YAML key only (verifies FR-012 deferred-to-upstream)

Happy paths (count-only mode):

10. `total: true` against populated vault → `{ count: N, properties: [] }`
11. `total: true` against empty vault (assume `0` integer per R9) → `{ count: 0, properties: [] }`

Cross-mode invariant:

12. Same upstream returns same outer `count` under both `total: false` and `total: true` modes (FR-006a)
13. Default mode `output.count === output.properties.length`

Empty vault:

14. Default mode + upstream emits `[]` → `{ count: 0, properties: [] }`

Argv assertions:

15. Default mode argv contains `format=json` and NOT `total`
16. Count-only mode argv contains `total` and NOT `format=json`
17. When `input.vault` is set: argv contains `vault=<value>` exactly (no shell interpolation)
18. When `input.vault` is omitted: argv does NOT contain a `vault=` token
19. Single spawn invocation per request (default mode)
20. Single spawn invocation per request (count-only mode)

Failure paths:

21. JSON parse failure (malformed upstream stdout) → `CLI_REPORTED_ERROR` with `details.stage = "json-parse"`
22. Total-mode integer parse failure (non-numeric stdout) → `CLI_REPORTED_ERROR` with `details.stage = "total-parse"`
23. Output-cap kill (very large inventory) → `CLI_NON_ZERO_EXIT` (dispatch-layer auto-classified per R10)
24. Token-cost regression (SC-014): seed a fixture upstream stdout with 50 distinct property entries (~2 KB JSON). Synthesise a comparable "full-vault grep" payload (cat-all-frontmatter blocks of 200 notes, ~50 KB markdown). Assert `Buffer.byteLength(propertiesStdout, "utf8") < Buffer.byteLength(grepEquivalent, "utf8") / 5` (inventory payload at least 5× smaller; locks SC-014's "far smaller than full-vault grep" claim with conservative 5× threshold for fixture flexibility).

**Registration (5 cases — `index.test.ts`)**:

1. `createPropertiesTool({ logger, queue }).descriptor.name === "properties"`
2. Descriptor `inputSchema` has descriptions stripped (ADR-005)
3. `PROPERTIES_DESCRIPTION` mentions `help({ tool_name: "properties" })`
4. `docs/tools/properties.md` exists with non-stub content (≥4 worked examples + error roster + input/output contracts + multi-vault inherited limitation note)
5. The `_register-baseline.json` / `_register.test.ts` drift detector and FR-018 baseline both PASS after `npm run baseline:write` rolls forward

---

## Differences vs predecessor BIs (architectural delta map)

| Predecessor | Architectural facet | This BI's choice | Reason |
|---|---|---|---|
| BI-019 (`files`) | Has `folder` parameter | NO `folder` parameter | Out of scope per user input (filter by folder is deferred) |
| BI-019 (`files`) | Has `target_mode` discriminator | NO `target_mode` | Vault-only surface; no active mode (per user input) |
| BI-023 (`outline`) | Per-entry shape `{level, text, line}` | Per-entry shape `{name, noteCount}` | Different domain (heading vs property) |
| BI-023 (`outline`) | Wrapper field rename `heading` → `text` | Wrapper field rename `count` → `noteCount` AND drop `type` | One additional drop (FR-004 out-of-scope type metadata) |
| BI-023 (`outline`) | Empty sentinel detection (`No headings found.`) | None at plan stage; T0 may add if empty-vault probe surfaces sentinel | R9 deferred to T0 |
| BI-023 (`outline`) | No post-fetch sort (upstream order is the contract) | Wrapper-side post-fetch sort (case-insensitive primary + byte-tiebreak) | Drift-detection UX (per Q1 clarification 2026-05-13) |
| BI-014 / BI-015 / BI-018 | Eval composition | Native subcommand | Parity with BI-019 / BI-023 — no eval needed |
| All target_mode tools | `applyTargetModeRefinement` consumed | NOT consumed | No target_mode discriminator |
