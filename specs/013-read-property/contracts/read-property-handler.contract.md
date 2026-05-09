# Contract — `read_property` Handler

**Feature**: [013-read-property](../spec.md)
**Date**: 2026-05-09

This document is the public contract for `executeReadProperty(input, deps)` — the handler function that powers the `read_property` MCP tool. It captures the dependency shape, the **two-call** `invokeCli` architecture (R3), the argv-mapping rules, the response-parsing logic for both calls, the type-translation rule (R6), the `No frontmatter found.` short-circuit (R7), and the failure propagation chain.

---

## Signature

```ts
// src/tools/read_property/handler.ts
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import type { ReadPropertyInput, ReadPropertyOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeReadProperty(
  input: ReadPropertyInput,
  deps: ExecuteDeps,
): Promise<ReadPropertyOutput>;
```

The deps shape mirrors `executeReadNote` / `executeWriteNote` / `executeDeleteNote` exactly. `spawnFn` and `env` are test seams (per R9); `logger` and `queue` are the production wiring (passed by `src/server.ts` from the shared `createServer` setup).

---

## Invariants

### Pre-condition: input is parsed and validated

The handler trusts its `input` parameter. It MUST NOT re-parse against the schema, MUST NOT defensively check for missing required fields, and MUST NOT inspect raw user input. The `registerTool` factory parses input via `readPropertyInputSchema.parse(args)` and only invokes the handler with a successfully-parsed `ReadPropertyInput`.

Specifically, the handler relies on these post-parse guarantees:
- `input.target_mode === "specific" || input.target_mode === "active"`
- If `input.target_mode === "specific"`: `input.vault` is a non-empty string; exactly one of `input.file` / `input.path` is defined.
- If `input.target_mode === "active"`: `input.vault === undefined`, `input.file === undefined`, `input.path === undefined`.
- `input.name` is a non-empty string in BOTH modes.
- No unknown top-level keys (post-strict-mode).

### Two-call architecture invariants (R3)

1. **Call A is always issued first**: file-scoped `properties path=<p> format=json` (specific) or `properties format=json active` (active). Returns the file's frontmatter as JSON.
2. **Call B is issued ONLY after Call A determines the property is present**: vault-scoped `properties format=json`. Returns the type-metadata array. Skipped when:
   - Call A returns `No frontmatter found.` (short-circuit per R7 — type is `"unknown"`).
   - The requested property `name` is absent from Call A's parsed JSON (short-circuit — type is `"unknown"`).
3. **Both calls run through the SAME `invokeCli` deps**: same `logger`, same `queue`, same `spawnFn`. The queue serialises them through one in-flight channel.
4. **Call B's `vault` parameter** equals Call A's vault in specific mode; equals `undefined` in active mode (per R4's documented limitation).

### Argv assembly invariants

1. **Subcommand**: always `"properties"` (R2 — plural, NOT `property:read`).
2. **`format=json` always present** as a parameter (NOT a flag) on both calls.
3. **`name` NEVER forwarded to CLI** (R2): the wrapper extracts by name client-side after JSON.parse.
4. **Vault hoisting**: `vault` is passed as a top-level field to `invokeCli`; the cli-adapter's `dispatchCli` hoists it to the `vault=<value>` argv-prefix slot.
5. **Locator XOR**: at most one of `parameters.file` / `parameters.path` is present per Call A (specific mode); active mode has neither.
6. **`active` flag emission**: Call A in active mode emits `flags: ["active"]`. Call B never emits `active` (vault-scoped, not focused-note-specific per R4). Specific-mode Call A emits `flags: []`.

### Response parsing invariants

1. **Call A success-path branching**:
   - `stdout.trimStart().startsWith("No frontmatter found.")` → return `{value: null, type: "unknown"}` (R7).
   - Otherwise → `JSON.parse(stdout)`. If parse throws, throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: { stdout }, message: "read_property could not parse Call A response"})`.
   - If `!(input.name in parsedA)` → return `{value: null, type: "unknown"}` (FR-010 — absent property).
   - Otherwise → extract `value = parsedA[input.name]`; proceed to Call B.

2. **Call B response handling**:
   - `JSON.parse(stdout)`. If parse throws, throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: { stdout }, message: "read_property could not parse Call B response"})`.
   - Find entry where `entry.name === input.name`. If undefined (defensive — shouldn't happen if Call A returned a value), `type = "unknown"`. Otherwise `type = translateObsidianType(entry.type)`.
   - Return `{value, type}`.

3. **`value` is the raw parsed-JSON value**: no flattening, no coercion, no re-stringification. The MCP wire envelope's `JSON.stringify(result)` (in `registerTool`) re-encodes for transmission.

4. **`type` translation is via the lookup table** (R6): `OBSIDIAN_TYPE_TO_SPEC_TYPE[entry.type] ?? "unknown"`. No regex pattern-matching on values, no inferred labels, no override of Obsidian's resolution.

### Failure propagation invariants

1. **No swallowing**: the handler does NOT catch `UpstreamError` to mask, mutate, or re-classify. It propagates the adapter's classification verbatim; `registerTool`'s outer catch wraps it via `asToolError`.
2. **Re-throw on unexpected**: any non-`UpstreamError` exception (e.g., a runtime TypeError from a bug in argv-assembly) is allowed to escape; `registerTool` re-throws to the SDK envelope.
3. **No new error codes**: zero new codes are introduced (FR-021). The four propagated codes from the adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) plus `VALIDATION_ERROR` from `registerTool` cover the entire failure surface.
4. **Unparseable JSON on Call A or Call B**: throws `UpstreamError({code: "CLI_REPORTED_ERROR", ...})`. Treats unparseable success as an in-band CLI error rather than crashing the bridge.
5. **Unknown vault**: `Vault not found.` on stdout (exit 0) is re-classified by the cli-adapter to `CLI_REPORTED_ERROR` per [011-write-note R5](../../011-write-note/research.md). The handler propagates; no `read_property`-specific handling needed for either call.
6. **Active-mode no-active-file**: the cli-adapter classifies "No active file" responses as `ERR_NO_ACTIVE_FILE` (or `CLI_REPORTED_ERROR`, depending on the dispatch layer's specialisation). The handler propagates verbatim.
7. **Missing-file response**: `Error: File "..." not found.` on stdout is caught by the dispatch layer's `Error:` prefix matcher → `CLI_REPORTED_ERROR`. Propagated verbatim.

---

## `invokeCli` call shape (canonical)

### Specific mode (Call A + Call B)

```ts
// Call A — file-scoped value
const parametersA: Record<string, string> = {
  ...(input.file !== undefined ? { file: input.file } : {}),
  ...(input.path !== undefined ? { path: input.path } : {}),
  format: "json",
};
const callA = await invokeCli(
  {
    command: "properties",
    vault: input.vault!,
    parameters: parametersA,
    flags: [],
    target_mode: "specific",
  },
  deps,
);

// Process Call A
const trimmedA = callA.stdout.trimStart();
if (trimmedA.startsWith("No frontmatter found.")) {
  return { value: null, type: "unknown" };
}
let parsedA: Record<string, unknown>;
try {
  parsedA = JSON.parse(callA.stdout) as Record<string, unknown>;
} catch (err) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: err,
    details: { stdout: callA.stdout, call: "A" },
    message: `read_property could not parse Call A response: ${callA.stdout.slice(0, 200)}`,
  });
}
if (!Object.prototype.hasOwnProperty.call(parsedA, input.name)) {
  return { value: null, type: "unknown" };
}
const value = parsedA[input.name];

// Call B — vault-scoped type metadata
const callB = await invokeCli(
  {
    command: "properties",
    vault: input.vault!,
    parameters: { format: "json" },
    flags: [],
    target_mode: "specific",
  },
  deps,
);
let parsedB: Array<{ name: string; type: string; count: number }>;
try {
  parsedB = JSON.parse(callB.stdout) as typeof parsedB;
} catch (err) {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: err,
    details: { stdout: callB.stdout, call: "B" },
    message: `read_property could not parse Call B response: ${callB.stdout.slice(0, 200)}`,
  });
}
const entry = parsedB.find((p) => p.name === input.name);
const type = entry ? translateObsidianType(entry.type) : "unknown";

return { value: value as ReadPropertyOutput["value"], type };
```

### Active mode (Call A + Call B)

```ts
// Call A — focused-note value (active flag)
const callA = await invokeCli(
  {
    command: "properties",
    vault: undefined,
    parameters: { format: "json" },
    flags: ["active"],
    target_mode: "active",
  },
  deps,
);
// ... same processing as specific mode ...

// Call B — default-vault type metadata (R4 limitation)
const callB = await invokeCli(
  {
    command: "properties",
    vault: undefined,
    parameters: { format: "json" },
    flags: [],
    target_mode: "active",
  },
  deps,
);
// ... same processing as specific mode ...
```

The two branches share the same response-processing logic. The only differences:
- Call A: `vault` differs (specific value vs `undefined`); `parameters` differs (locator-bearing vs `{format: "json"}`); `flags` differs (`[]` vs `["active"]`).
- Call B: `vault` differs (specific value vs `undefined`); `parameters` and `flags` are identical (`{format: "json"}`, `[]`).

### `translateObsidianType` helper

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

---

## Test seam (FR-023 Handler Tests)

`deps.spawnFn` is the canonical injection point. Tests construct stub `SpawnLike` factories that return mock `ChildProcess` objects with controlled exit codes, stdout, and stderr. **Each MCP request fires TWO spawn invocations** (Call A + Call B); test stubs respond to both.

Example handler test scaffold:

```ts
test("Story 1 AC#1 — text property happy path", async () => {
  const argvCalls: string[][] = [];
  const stubResponses = [
    { exitCode: 0, stdout: '{"status":"in-progress"}\n' },                    // Call A
    { exitCode: 0, stdout: '[{"name":"status","type":"text","count":1}]\n' }, // Call B
  ];
  let callIdx = 0;
  const stubSpawn = makeStubSpawn({
    onSpawn: (binary, argv) => argvCalls.push(argv),
    response: () => stubResponses[callIdx++]!,
  });
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status" },
    { logger: createLogger(), queue: createQueue(), spawnFn: stubSpawn },
  );
  expect(result).toEqual({ value: "in-progress", type: "text" });
  expect(argvCalls).toEqual([
    ["vault=Demo", "properties", "path=notes/x.md", "format=json"],
    ["vault=Demo", "properties", "format=json"],
  ]);
});

test("Story 1 AC#7 — absent property short-circuits Call B", async () => {
  const argvCalls: string[][] = [];
  const stubResponses = [
    { exitCode: 0, stdout: '{"status":"in-progress"}\n' }, // Call A — name "missing_field" NOT in parsed
    // Call B should NOT be issued
  ];
  let callIdx = 0;
  const stubSpawn = makeStubSpawn({
    onSpawn: (binary, argv) => argvCalls.push(argv),
    response: () => stubResponses[callIdx++]!,
  });
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "missing_field" },
    { logger: createLogger(), queue: createQueue(), spawnFn: stubSpawn },
  );
  expect(result).toEqual({ value: null, type: "unknown" });
  expect(argvCalls.length).toBe(1); // Only Call A
});
```

Argv shape in tests reflects `dispatchCli`'s actual hoisting — `vault=` first, then subcommand, then key=value parameters, then flags.

---

## Test inventory (FR-023)

The handler test file (`handler.test.ts`) covers ~22 cases mapped to user stories and SCs (bumped 17 → 22 by the /speckit-analyze remediation pass to close F2, F3, F5 coverage gaps — full case list maintained in [tasks.md T004 (4b)](../tasks.md)):

| # | Test description | Maps to |
|---|------------------|---------|
| 1 | text property happy path (Call A + Call B) | US1 AC#1, SC-001 |
| 2 | list property → array, type "list" | US1 AC#2, SC-002 |
| 3 | number property → number, type "number" | US1 AC#3, SC-003 |
| 4 | checkbox property → boolean, type "checkbox" | US1 AC#4, SC-004 |
| 5 | date property → string, type "date" | US1 AC#5, SC-005 |
| 6 | datetime property → string, type "datetime" | US1 AC#6, SC-005 |
| 7 | absent property short-circuits Call B | US1 AC#7, SC-006 |
| 8 | no-frontmatter file short-circuits both calls | US1 AC#8, SC-006 |
| 9 | malformed-frontmatter conflated with no-fm (R7) | FR-011 / FR-012 conflation per R7 |
| 10 | unknown vault → CLI_REPORTED_ERROR (R5 inheritance) | US1 AC#11 |
| 11 | missing file → CLI_REPORTED_ERROR (Error: prefix) | US1 AC#10 |
| 12 | active mode happy path (active flag in Call A; Call B without vault) | US2 AC#1, SC-007 |
| 13 | active mode no focused note → CLI_REPORTED_ERROR | US2 AC#3 |
| 14 | mapping value → object, type "unknown" (Q2) | FR-027, SC-007 |
| 15 | heterogeneous list → array, type "unknown" (US4) | FR-017, SC-007 |
| 16 | type translation: multitext → list | R6 |
| 17 | name with dots/dashes passes through verbatim | FR-018 |
| 18 | literal-null string round-trip → `{value: "null", type: "text"}` (F2) | FR-009, SC-007 |
| 19 | explicit-null distinguishability → `{value: null, type: "<typed>"}` distinguishable from absent (F2) | FR-009, SC-007 |
| 20 | active-mode + absent property → `{value: null, type: "unknown"}` (F3) | US2 AC#2, FR-010 |
| 21 | CLI_BINARY_NOT_FOUND propagation (F5) | FR-021 |
| 22 | CLI_NON_ZERO_EXIT propagation (F5) | FR-021 |

Plus the schema test file (`schema.test.ts`) covers ~14 cases (target-mode primitive's existing rules + the `name` field's required + min(1) rules + unknown-key rejection).

Plus the registration test file (`index.test.ts`) covers 5 cases (descriptor name, stripped schema, help mention, doc presence + content completeness, drift-detector parameterised lock + spawn-spy gate per F10).

Total: 14 + 22 + 5 = **41 tests** — exceeds SC-011's floor of 25.

---

## Audit-trail invariant (no structural distinguisher)

Unlike `delete_note`'s `toTrash` audit invariant, `read_property` is a read-only operation with no destructive consequence. There is no audit invariant to enforce in the output shape. The `value`/`type` pair is the entire structural contract; per-tool invariant 13 (R3 two-call invariant) governs the wrapper's behaviour, not an audit field.

---

## Handler module size budget

Total file LOC ≤ 80. Breakdown estimate:

| Section | LOC |
|---------|-----|
| `// Original — no upstream.` header | 1 |
| imports (invokeCli, UpstreamError, schema types, Logger, Queue) | ~7 |
| `ExecuteDeps` interface | ~6 |
| `OBSIDIAN_TYPE_TO_SPEC_TYPE` constant + `translateObsidianType` helper | ~14 |
| `executeReadProperty` body — Call A logic (vault hoisting, parameters, response handling, no-fm short-circuit, JSON parse, absent-key short-circuit) | ~30 |
| Call B logic (vault hoisting, parameters, response handling, JSON parse, type lookup) | ~18 |
| Return statement | ~2 |
| blank lines / minimal comments | ~2 |
| **Total** | **~80** |

Higher than `delete_note`'s ≤50 ceiling because of the two-call architecture (R3). If the handler grows beyond 80 LOC, refactor candidates: extract `parsePropertiesJsonObject(stdout)` and `extractTypeFromMetadata(stdout, name)` to helper functions or a `_parse.ts` sibling module.

---

## Stability

- **Internal**: yes. The handler is not exported from `src/index.ts`; its only consumer is `src/tools/read_property/index.ts`.
- **Test contract**: the `ExecuteDeps` interface is the test surface. Renaming or restructuring it requires updating the co-located handler tests in the same change.
- **Adapter coupling**: the handler is tightly coupled to `invokeCli`'s `InvokeCliInput` shape. If the adapter's signature changes, the handler updates in lock-step with siblings.
- **CLI coupling**: the response parsing locks against the live CLI's response wording (`No frontmatter found.` per R7; the JSON object shape per R2; the metadata array shape per R6). Future CLI version drift surfaces as test failures rather than silent regressions.

---

## Cross-references

- [spec.md](../spec.md) — FRs that drive this contract (FR-007 through FR-027)
- [data-model.md](../data-model.md) — argv mapping table, response-parsing decision tree, type-translation table, per-tool invariants
- [research.md](../research.md) — R1 (no logger events), R2 (subcommand selection), R3 (two-call architecture), R4 (active flag), R5 (unknown-vault inheritance), R6 (type translation), R7 (no-fm short-circuit), R8 (Q1/Q2 contingencies), R11 (locator argv direct map)
- [read-property-input.contract.md](./read-property-input.contract.md) — input schema this handler consumes
- [012-delete-note/contracts/delete-note-handler.contract.md](../../012-delete-note/contracts/delete-note-handler.contract.md) — sibling artifact this one mirrors (with the two-call architecture as the load-bearing departure)
