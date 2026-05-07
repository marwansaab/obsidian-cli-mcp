# Contract — Post-010 Consolidated Drift Detector

**Feature**: `010-flatten-target-mode`
**Module**: [src/tools/_register.test.ts](../../../src/tools/_register.test.ts)
**Status**: Plan-stage contract; SUPERSEDES [feature 009's drift-detector.contract.md](../../009-fix-inputschema-publication/contracts/drift-detector.contract.md).

The post-010 drift detector consolidates feature 009's three groups (unit-layer registry walk, integration-layer SDK round-trip, synthetic Pattern (a)/(b) fixtures) into a single group with two layers (registry walk + SDK round-trip). Pattern (b) is deleted (clarification C4 / FR-009); Pattern (a) is folded into Layer 1 as a synthetic fixture row in the invariant table.

---

## §1 — Structure

```ts
describe("registry: published inputSchema invariants (post-010)", () => {
  // Layer 1 — registry walk + per-tool invariants
  describe("registry walk", () => {
    it("every registered tool has an invariant entry", async () => { ... });
    it.each(Object.keys(invariants))(
      "tool %s satisfies its invariant",
      async (toolName) => { ... },
    );
  });

  // Layer 2 — SDK round-trip via InMemoryTransport
  describe("SDK round-trip", () => {
    let client: Client;
    beforeAll(async () => { ... connect via InMemoryTransport ... });
    afterAll(async () => { await client.close(); });
    it.each(Object.keys(invariantsForLiveRegistry))(
      "tool %s wire-side satisfies its invariant",
      (toolName) => { ... },
    );
  });

  // Synthetic Pattern (a) fixture (folded into Layer 1's table; NOT a separate group)
  describe("synthetic Pattern (a) — flat extension via .extend()", () => {
    it("registers and publishes a flat object with the union of base + extension keys", () => { ... });
  });
});
```

The single `describe` block contains: (a) Layer 1's two `it.each` cases, (b) Layer 2's two `it.each` cases (gated by a single `beforeAll` / `afterAll` pair), and (c) one `it` for the synthetic Pattern (a) fixture. Total: 5–6 `it` invocations, ~270 LOC (target post-feature; SC-008).

The synthetic Pattern (a) fixture is folded into the same `describe` block rather than being its own group because: (a) Pattern (b) is gone, so there is no peer Pattern fixture to group with; (b) the fixture asserts the same flat-object invariants that Layer 1 already encodes for live tools; (c) the fixture's purpose is to verify "future Pattern (a) consumers inherit the publication-pipeline contract automatically" — best expressed alongside the table that defines that contract.

---

## §2 — Per-tool invariant table

| Tool | Source | `type` | `properties_equals_set` | `required_equals` | `additionalProperties` |
|---|---|---|---|---|---|
| `read_note` | live registry | `"object"` | `["target_mode", "vault", "file", "path"]` | `["target_mode"]` | `false` |
| `obsidian_exec` | live registry | `"object"` | `["command", "vault", "parameters", "flags", "copy", "timeoutMs"]` | `["command"]` | `false` |
| `help` | live registry | `"object"` | (whatever help's current shape requires — typically `["tool_name"]`) | `[]` | `false` |
| `synthetic_pattern_a` | inline fixture | `"object"` | `["target_mode", "vault", "file", "path", "note_text"]` | `["target_mode", "note_text"]` | `false` |

The `invariants` object in the test file MUST satisfy this table verbatim. A change to any cell requires a contract amendment.

**Why `properties_equals_set` (exact match) instead of `properties_includes` (subset)?** Post-010, the publication pipeline is `zodToJsonSchema(strictFlat)` — a deterministic, exact-match transformation. The invariant should be exact, not subset; a subset assertion would silently allow drift (e.g., a future bug that adds an unexpected `properties` key would not fail). Feature 009 used `properties_includes` because the wrap-branch synthesis could in principle produce supersets; that concern is gone.

**Why `additionalProperties: false` for `read_note` (vs. `true` in 009)?** Clarification C3: the post-010 schema is `.strict()`, which emits `false`. This is a deliberate, narrow runtime-behaviour change recorded in [spec.md](../spec.md)'s FR-002 carve-out and in `CHANGELOG.md` (FR-012). The drift detector pins this value explicitly.

---

## §3 — Layer 1: registry walk

Iterates the registered tools from `createServer({ registerSignalHandlers: false })` and asserts each one against its invariant table row.

```ts
async function listToolsViaRegistry(): Promise<Array<{ name: string; inputSchema: Record<string, unknown> }>> {
  const { server } = createServer({ registerSignalHandlers: false });
  const handlers = (server as unknown as { _requestHandlers: Map<string, ListToolsHandler> })._requestHandlers;
  const listHandler = handlers.get("tools/list");
  if (!listHandler) throw new Error("tools/list handler not registered");
  const result = await listHandler({ method: "tools/list", params: {} });
  return result.tools;
}

it("every registered tool has an invariant entry (forces future tool authors to declare a contract)", async () => {
  const tools = await listToolsViaRegistry();
  const missing = tools.map((t) => t.name).filter((n) => !(n in invariants));
  expect(missing, `tools missing invariant entry: ${missing.join(", ")}`).toEqual([]);
});

it.each(Object.keys(invariants).filter((n) => n !== "synthetic_pattern_a"))(
  "tool %s satisfies its invariant",
  async (toolName: string) => {
    const tools = await listToolsViaRegistry();
    const tool = tools.find((t) => t.name === toolName);
    expect(tool, `Tool '${toolName}' not found in live registry`).toBeDefined();
    assertInvariant(toolName, tool!.inputSchema);
  },
);
```

`assertInvariant` reads from the `invariants` table and applies the per-cell `expect(...)` calls. Same pattern as feature 009's helper, simplified to only the keys this contract supports (`type`, `properties_equals_set`, `required_equals`, `additionalProperties` — no more `properties_includes` / `required_includes`).

The `synthetic_pattern_a` row is filtered OUT of the live-registry walk (it isn't registered with the server); it has its own dedicated `it` block at §5.

---

## §4 — Layer 2: SDK round-trip

Same invariant table, applied to `client.listTools()`'s response after an `InMemoryTransport` round-trip. Catches future MCP SDK behaviour changes that might transform the descriptor in transit (e.g., a future SDK version that strips unknown keys; today's SDK uses `Tool.inputSchema = .catchall(z.unknown())` and preserves the descriptor verbatim).

```ts
let client: Client;
let listResponse: { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> };

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const created = createServer({ registerSignalHandlers: false });
  await created.server.connect(serverTransport);
  client = new Client({ name: "drift-detector", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  listResponse = (await client.listTools()) as typeof listResponse;
});

afterAll(async () => { await client.close(); });

it.each(Object.keys(invariants).filter((n) => n !== "synthetic_pattern_a"))(
  "tool %s wire-side satisfies its invariant",
  (toolName: string) => {
    const tool = listResponse.tools.find((t) => t.name === toolName);
    expect(tool, `Tool '${toolName}' missing from tools/list response`).toBeDefined();
    assertInvariant(toolName, tool!.inputSchema);
  },
);
```

---

## §5 — Synthetic Pattern (a) fixture

Verifies that future Pattern (a) consumers inherit the publication-pipeline contract automatically. Built inline; never registered with the live server.

```ts
it("Pattern (a) — applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() })) publishes the flat union shape", () => {
  const schema = applyTargetModeRefinement(
    targetModeBaseSchema.extend({ note_text: z.string() }),
  );
  const tool = registerTool({
    name: "synthetic_pattern_a",
    description: "drift-detector fixture",
    schema,
    handler: async () => ({ content: [{ type: "text" as const, text: "" }] }),
  });
  assertInvariant("synthetic_pattern_a", tool.descriptor.inputSchema as Record<string, unknown>);
});
```

The `assertInvariant` call uses the `synthetic_pattern_a` row from the table at §2. If a future zod-to-json-schema upgrade or a regression in `applyTargetModeRefinement` changes the emitted shape, this case fails with a per-cell `expect` mismatch.

**Why `.extend()` not `.merge()`?** Per research R2, `.merge()` resets `unknownKeys` to `"strip"` while emitting the same JSON Schema; the fixture must use `.extend()` to pin the canonical post-010 idiom. A regression that flips the example to `.merge()` would still pass the wire-shape assertions but would silently break the runtime strict-mode contract for Pattern (a) consumers — code review enforces this.

---

## §6 — Removed groups (vs. feature 009)

Feature 009's three-group structure DELETES as follows:

| 009 group | Disposition | Reason |
|---|---|---|
| Group 1 (unit-layer registry walk) | KEPT (Layer 1) — simplified | Same purpose; `properties_includes` / `required_includes` flip to `_equals_*` for tighter invariants. |
| Group 2 (SDK round-trip) | KEPT (Layer 2) — unchanged | Defense-in-depth against SDK behaviour changes; cheap to keep. |
| Group 3 (Pattern (a)/(b) synthetic fixtures) | DELETED — Pattern (b) gone outright (FR-009); Pattern (a) folded into Layer 1's table | The wrap branch is deleted (FR-005); there is no envelope synthesis for these fixtures to verify. The Pattern (a) fixture migrates as a single `it` block at §5; the Pattern (b) fixture's only purpose was to verify the wrap branch handled fresh discriminated unions, which is no longer applicable. |

**Result**: ~270 LOC post-010 (down from 473; SC-008).

---

## §7 — Stability invariants

| Invariant | Why |
|---|---|
| `obsidian_exec`'s row is byte-stable from `0.2.0` / `0.2.1` / `0.2.2` | FR-007 — flat-`z.object` schemas are unaffected by the flatten; their published shape was already correct. |
| `help`'s row is byte-stable from `0.2.0` / `0.2.1` / `0.2.2` | FR-016 — help's schema is already a flat `z.object`; not touched. |
| `read_note`'s `additionalProperties` flips `true` (post-009) → `false` (post-010) | C3 — deliberate, narrow runtime-behaviour change. |
| `read_note`'s `properties` keys are unchanged (`target_mode`, `vault`, `file`, `path`) | FR-006 — the property roster is the same; only the encoding flips from `oneOf` envelope to flat object. |
| `read_note`'s `required` is `["target_mode"]` post-010 (vs. `["target_mode"]` post-009) | FR-006 — same `required` array (zod-to-json-schema computes from the unrefined base, not the superRefine). |

The drift detector fails on any cell-level violation with a message naming the offending tool and the offending key. This is the forcing function (FR-008 / SC-005 / SC-006) that prevents regressions in either the publication pipeline (re-introducing the wrap branch) or the schema encoding (re-introducing the discriminated union) from reaching a release tag.
