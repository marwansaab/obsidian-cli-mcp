# Contract: Parameterised drift detector + integration round-trip

**Feature**: 009-fix-inputschema-publication
**Surface**: [src/tools/_register.test.ts](../../../src/tools/_register.test.ts) (EXTENDED file — pre-exists from feature 008 with `registerTool` + `assertToolDocsExist` tests; this feature appends three new `describe` blocks for the drift detector)
**Status**: Original. Closes feature 007's deferred T004 detector and feature 008's missing wire-level assertion in one move.

This contract specifies what the drift detector MUST observe and assert. It is the durable forcing function (FR-006 / FR-007 / FR-008) that prevents recurrence of the publication-pipeline bug fixed in 009 — and that catches every analogous regression in any future typed tool.

## Surface under test

The detector observes the **actual published `inputSchema` for every registered tool** at two layers:

1. **Unit layer** — direct registry walk. Reads `tool.descriptor.inputSchema` for each tool returned by `createServer({ registerSignalHandlers: false })`. Bypasses the SDK transport.
2. **Integration layer** — full SDK round-trip. Connects a `Client` and `Server` via `InMemoryTransport.createLinkedPair()`, calls `client.listTools()`, and asserts on the descriptors returned by the SDK's wire-validated response.

Both layers exist because the unit layer catches `_shared.ts` / `_register.ts` regressions while the integration layer catches future MCP SDK behaviour changes that might transform the descriptor in transit.

## Driver

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import type { JsonSchemaObject } from "../help/strip-schema.js";

type ToolInvariant = {
  type: "object";
  properties_includes?: ReadonlyArray<string>;
  properties_equals_set?: ReadonlyArray<string>;
  required_includes?: ReadonlyArray<string>;
  required_equals?: ReadonlyArray<string>;
  additionalProperties?: true | false;
};

const invariants: Readonly<Record<string, ToolInvariant>> = {
  read_note: {
    type: "object",
    properties_includes: ["target_mode", "vault", "file", "path"],
    required_includes: ["target_mode"],
    additionalProperties: true,
  },
  obsidian_exec: {
    type: "object",
    properties_equals_set: ["command", "vault", "parameters", "flags", "copy", "timeoutMs"],
    required_equals: ["command"],
    additionalProperties: false,
  },
  help: {
    type: "object",
    properties_includes: ["tool_name"],
  },
};

function assertInvariant(name: string, schema: Record<string, unknown>): void {
  const invariant = invariants[name];
  expect(invariant, `Tool '${name}' has no invariant entry — add one to specs/009-fix-inputschema-publication/data-model.md §5 and this file's invariants table`).toBeDefined();
  expect(schema.type, `Tool '${name}' inputSchema.type`).toBe(invariant.type);
  if (invariant.properties_includes) {
    const keys = Object.keys((schema.properties ?? {}) as Record<string, unknown>);
    expect(keys, `Tool '${name}' inputSchema.properties keys`).toEqual(
      expect.arrayContaining([...invariant.properties_includes]),
    );
  }
  if (invariant.properties_equals_set) {
    const keys = new Set(Object.keys((schema.properties ?? {}) as Record<string, unknown>));
    expect(keys, `Tool '${name}' inputSchema.properties keys`).toEqual(new Set(invariant.properties_equals_set));
  }
  if (invariant.required_includes) {
    expect(schema.required, `Tool '${name}' inputSchema.required`).toEqual(
      expect.arrayContaining([...invariant.required_includes]),
    );
  }
  if (invariant.required_equals) {
    expect(schema.required, `Tool '${name}' inputSchema.required`).toEqual([...invariant.required_equals]);
  }
  if (invariant.additionalProperties !== undefined) {
    expect(schema.additionalProperties, `Tool '${name}' inputSchema.additionalProperties`).toBe(invariant.additionalProperties);
  }
}
```

## Test groups

### Group 1 — Unit layer: registry-level published-shape invariants (FR-006 / FR-007)

```typescript
describe("registry: published inputSchema invariants (unit layer)", () => {
  it("every registered tool has an invariant entry", () => {
    const created = createServer({ registerSignalHandlers: false });
    const tools = (created.server as unknown as { _registeredTools?: ... })._registeredTools;
    // Or read via the Server's listTools handler — exact accessor TBD at impl time.
    // Each tool name MUST appear in `invariants`.
  });

  it.each(Object.keys(invariants))(
    "tool %s satisfies its invariant",
    (toolName: string) => {
      // 1. Locate the tool's descriptor in the live registry.
      // 2. Apply assertInvariant(toolName, descriptor.inputSchema).
    },
  );
});
```

### Group 2 — Integration layer: SDK wire round-trip (FR-008)

```typescript
describe("registry: published inputSchema invariants (integration layer — SDK round-trip)", () => {
  let client: Client;
  let listResponse: { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> };

  beforeAll(async () => {
    const [client_t, server_t] = InMemoryTransport.createLinkedPair();
    const created = createServer({ registerSignalHandlers: false });
    await created.server.connect(server_t);
    client = new Client({ name: "drift-detector", version: "0.0.0" }, { capabilities: {} });
    await client.connect(client_t);
    listResponse = await client.listTools();
  });

  afterAll(async () => { await client.close(); });

  it.each(Object.keys(invariants))(
    "tool %s wire-side satisfies its invariant",
    (toolName: string) => {
      const tool = listResponse.tools.find((t) => t.name === toolName);
      expect(tool, `Tool '${toolName}' missing from tools/list response`).toBeDefined();
      assertInvariant(toolName, tool!.inputSchema as Record<string, unknown>);
    },
  );
});
```

### Group 3 — Synthetic Pattern (a) and Pattern (b) fixtures (FR-003 / SC-009)

```typescript
describe("future-tool pattern fixtures", () => {
  // These do NOT register with the live server — they call registerTool directly to
  // produce a RegisteredTool, then assert on the published descriptor it carries.
  it("Pattern (a) — targetModeSchema.and(z.object({ note_text: z.string() })) publishes note_text + target-mode keys", () => {
    const schema = targetModeSchema.and(z.object({ note_text: z.string() }));
    const tool = registerTool({
      name: "synthetic_pattern_a",
      description: "fixture",
      schema,
      handler: async () => ({ content: [{ type: "text", text: "" }] }),
    });
    const props = Object.keys((tool.descriptor.inputSchema.properties ?? {}) as Record<string, unknown>);
    expect(props).toEqual(expect.arrayContaining(["target_mode", "vault", "file", "path", "note_text"]));
    expect(tool.descriptor.inputSchema.required).toEqual(expect.arrayContaining(["target_mode", "note_text"]));
  });

  it("Pattern (b) — fresh discriminated union over write_note-shape bases publishes the union of branch keys", () => {
    const writeNoteSpecific = z.object({
      target_mode: z.literal("specific"),
      vault: z.string().min(1),
      file: z.string().optional(),
      path: z.string().optional(),
      note_text: z.string(),
    }).passthrough();
    const writeNoteActive = z.object({
      target_mode: z.literal("active"),
      note_text: z.string(),
    }).passthrough();
    const schema = z
      .discriminatedUnion("target_mode", [writeNoteSpecific, writeNoteActive])
      .superRefine(() => {});
    const tool = registerTool({
      name: "synthetic_pattern_b",
      description: "fixture",
      schema,
      handler: async () => ({ content: [{ type: "text", text: "" }] }),
    });
    const props = Object.keys((tool.descriptor.inputSchema.properties ?? {}) as Record<string, unknown>);
    expect(props).toEqual(expect.arrayContaining(["target_mode", "vault", "file", "path", "note_text"]));
    expect(tool.descriptor.inputSchema.required).toEqual(expect.arrayContaining(["target_mode", "note_text"]));
  });
});
```

## Coverage map

| Spec requirement | Test group | Notes |
|---|---|---|
| FR-001 (read_note properties exposed) | Group 1 + Group 2 | invariants.read_note.properties_includes |
| FR-002 (read_note callable from strict client) | Manual SC-001 / SC-002 | Out of CI; recorded in 0.2.1 release notes (R9) |
| FR-003 (Pattern (a)/(b) inheritance) | Group 3 | synthetic fixtures; do NOT register with live server |
| FR-004 (target-mode runtime frozen) | (existing target-mode.test.ts) | 31 cases pass without modification |
| FR-005 / FR-007 (obsidian_exec frozen) | Group 1 + Group 2 | invariants.obsidian_exec.properties_equals_set + required_equals + additionalProperties |
| FR-006 (read_note drift detector) | Group 1 | parameterised over invariants table |
| FR-008 (drift observed at register/wire) | Group 1 (register) + Group 2 (wire) | both layers |
| FR-009 (mechanically derived) | (existing _shared.test.ts cases R12) | structural; no parallel JSON Schema |
| FR-010 (no new error codes) | (existing errors.test.ts identifier-set) | passes unchanged |
| FR-013 (zodToJsonSchema once) | (no test; structural — auditable in code review) | Plan/contract enforces |
| FR-014 (co-located tests) | THIS FILE'S LOCATION | _register.test.ts is co-located with _register.ts |
| FR-015 (no upward imports) | (lint/import rules) | target-mode/ untouched; helper-only fix |

## Negative-test scaffolding (manual, NOT in CI per SC-010)

The contract recommends a **once-per-release manual revert check** — the developer making the fix runs:

```bash
# Step 1: confirm the detector PASSES on the fixed source.
npx vitest run src/tools/_register.test.ts

# Step 2: deliberately revert the widening change in src/tools/_shared.ts (or stash and apply).

# Step 3: re-run the detector and confirm it FAILS with a message naming the missing property.
npx vitest run src/tools/_register.test.ts
# Expected: ✗ tool read_note ... Tool 'read_note' inputSchema.properties keys → AssertionError: Expected ... to contain ["target_mode"]

# Step 4: restore the widening, confirm pass again.
```

This is SC-010 — the detector's "fail when reverted" property — verified once by the implementer and recorded in the PR description, NOT asserted in CI (asserting it in CI would require a self-mutating test, which is anti-pattern).

## What this contract does NOT cover

- The `_shared.test.ts` unit cases for the kinds A–E in [envelope-helper.contract.md](envelope-helper.contract.md) — those are the helper's contract, not the registry's.
- The runtime `parse` correctness — that's `target-mode.test.ts`'s contract.
- The `help` tool's docs roster behaviour — that's feature 005's `assertToolDocsExist` test.
- The `stripSchemaDescriptions` walker — separate (unchanged) contract at [src/help/strip-schema.ts](../../../src/help/strip-schema.ts).
