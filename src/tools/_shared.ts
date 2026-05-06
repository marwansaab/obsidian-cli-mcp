// Original — no upstream. Shared types and helpers for the tool aggregator pattern (plan-stage P8) plus the published-descriptor envelope helper (feature 007 / FR-002, widened in feature 009 / FR-001).
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ZodTypeAny } from "zod";

/**
 * The descriptor a tool publishes to MCP clients via `tools/list`. The strip
 * utility (FR-006) is applied to `inputSchema` BEFORE this object is constructed
 * — every per-tool registration is responsible for that.
 */
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * The success / error envelope a tool's call-handler returns. Mirrors the MCP
 * SDK's `CallToolResult` shape. On the failure path, `isError: true` flags the
 * envelope as a structured error; the JSON-stringified payload in `content[0].text`
 * carries `code`, `message`, and `details` per the project's UpstreamError serialization.
 */
export type ToolCallResult =
  | { content: Array<{ type: "text"; text: string }> }
  | { isError: true; content: Array<{ type: "text"; text: string }> };

/**
 * The per-tool call handler — receives validated `arguments` from the SDK
 * `CallToolRequest` and returns the response envelope. Per-tool zod validation
 * happens INSIDE this handler (not at the aggregator) because each tool owns
 * its own zod schema and decides its own per-issue error formatting.
 */
export type ToolCallHandler = (args: unknown) => Promise<ToolCallResult>;

/**
 * The aggregator pattern's per-tool unit (P8). Each tool's `register*Tool`
 * factory returns this shape; `src/server.ts` aggregates them into a single
 * `tools/list` response and a single `CallToolRequest` dispatcher.
 */
export interface RegisteredTool {
  descriptor: ToolDescriptor;
  handler: ToolCallHandler;
}

interface ToolErrorPayload {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Build the SDK error-response envelope from a structured payload. Used at every
 * boundary surface where an `UpstreamError` (or a `VALIDATION_ERROR`, or a
 * `TOOL_NOT_FOUND`) needs to flow through the SDK's `isError: true` shape.
 *
 * The payload's `code`, `message`, `details` are JSON-stringified into the single
 * text content block that MCP clients see — matching the precedent established
 * by feature 001 at src/tools/obsidian_exec/tool.ts:29-34.
 */
export function asToolError(payload: ToolErrorPayload): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

/**
 * A JSON Schema whose top-level `type` is `"object"`. The MCP `Tool` definition
 * requires every tool's `inputSchema` to satisfy this shape; `toMcpInputSchema`
 * is the helper that mechanically derives it from a zod schema (feature 007 /
 * FR-002 / FR-002a).
 */
export interface JsonSchemaObject {
  type: "object";
  [key: string]: unknown;
}

/**
 * Render any zod schema to a JSON Schema whose top-level `type` is `"object"`,
 * so the result is a valid `inputSchema` for an MCP `Tool` descriptor.
 *
 * Behaviour summary (per [contracts/envelope-helper.contract.md], feature 009):
 *   - Single `z.object({...})` (Kind A)            → returned verbatim (no-op).
 *   - `z.discriminatedUnion(...)` etc. (Kinds B/C/E)
 *                                                  → wrapped; top-level `anyOf`
 *                                                    rewritten to `oneOf` with
 *                                                    inner `type: "object"`
 *                                                    stripped from each branch;
 *                                                    AND a top-level `properties`
 *                                                    map (union of branch property
 *                                                    names; cross-branch string
 *                                                    discriminators surfaced as
 *                                                    `{ type: "string" }`, all other
 *                                                    keys leaf-`{}` widened) and a
 *                                                    top-level `required` array
 *                                                    (intersection of branch
 *                                                    `required`) emitted alongside.
 *   - `targetModeSchema.and(z.object({...}))` (Kind D — Pattern (a))
 *                                                  → walks both arms of `allOf`:
 *                                                    the inner anyOf/oneOf arm is
 *                                                    folded into `oneOf`; the
 *                                                    extras arm is preserved
 *                                                    verbatim under top-level
 *                                                    `allOf` AND contributes its
 *                                                    `properties` (leaf widening)
 *                                                    AND its `required` keys
 *                                                    (UNION'd into the top-level
 *                                                    `required`).
 *   - `$schema` keyword from the raw output is preserved.
 *   - The raw `zodToJsonSchema` output is NOT mutated.
 *
 * The widening exists to make the published `inputSchema` legible to
 * strict-naive MCP clients (e.g. Cowork) whose hand-rolled `Tool` validator
 * strips unknown top-level keys (`oneOf`, `additionalProperties`); without
 * top-level `properties`, those clients see `{ type: "object", properties: {} }`
 * and strip every outgoing argument before dispatch. Strict-rich SDK-shape
 * clients additionally read `oneOf` and apply per-branch constraints. Runtime
 * zod (`registerTool`'s `spec.schema.parse`) remains the single source of truth
 * for cross-field rules (XOR, forbidden-keys-in-active).
 *
 * No-throws: malformed inputs yield a well-formed but possibly unhelpful
 * envelope. The helper is not a runtime validator.
 */
export function toMcpInputSchema(zodSchema: ZodTypeAny): JsonSchemaObject {
  const raw = zodToJsonSchema(zodSchema, { $refStrategy: "none" }) as Record<string, unknown>;
  if (raw.type === "object") {
    // No-op branch — already an object schema. Return a fresh shallow copy to
    // honor the "do not mutate the raw output" invariant (consumers may extend
    // the returned object without affecting future calls' outputs).
    return { ...raw, type: "object" } as JsonSchemaObject;
  }
  // Wrap branch — top-level is anyOf / oneOf / allOf. Strip the $schema keyword
  // off so we can place it last for readability.
  const { $schema, anyOf, oneOf, allOf, ...rest } = raw as {
    $schema?: unknown;
    anyOf?: unknown;
    oneOf?: unknown;
    allOf?: unknown;
  } & Record<string, unknown>;

  // Identify the source of branches and any extras-arm metadata (Pattern (a) /
  // Kind D). For top-level anyOf / oneOf the branches come straight from the
  // raw output; for top-level allOf we walk each arm and pick out the
  // (single) anyOf/oneOf arm AND any extras arms with their own properties.
  let branches: Array<Record<string, unknown>> | undefined;
  const extrasArms: Array<Record<string, unknown>> = [];

  if (Array.isArray(anyOf)) {
    branches = anyOf as Array<Record<string, unknown>>;
  } else if (Array.isArray(oneOf)) {
    branches = oneOf as Array<Record<string, unknown>>;
  } else if (Array.isArray(allOf)) {
    for (const arm of allOf as Array<Record<string, unknown>>) {
      if (!arm || typeof arm !== "object") continue;
      if (Array.isArray(arm.anyOf)) {
        branches = arm.anyOf as Array<Record<string, unknown>>;
      } else if (Array.isArray(arm.oneOf)) {
        branches = arm.oneOf as Array<Record<string, unknown>>;
      } else if (arm.properties && typeof arm.properties === "object") {
        extrasArms.push(arm);
      }
    }
  }

  const envelope: Record<string, unknown> = {
    type: "object",
    additionalProperties: true,
    ...rest,
  };

  if (branches) {
    // Rewrite anyOf → oneOf (research P2: discriminated-union branches are
    // mutually exclusive, so oneOf is the more accurate keyword and produces
    // better LLM tool-use generation).
    envelope.oneOf = branches.map(stripInnerObjectType);

    // Top-level `properties` — union of branch property names (with `{}` leaf
    // widening, except cross-branch string discriminators which surface as
    // `{ type: "string" }`), then merged with extras-arm property names.
    const properties = unionTopLevelProperties(branches);
    for (const arm of extrasArms) {
      const armProps = arm.properties as Record<string, unknown>;
      for (const key of Object.keys(armProps)) {
        if (!Object.hasOwn(properties, key)) {
          properties[key] = {};
        }
      }
    }
    envelope.properties = properties;

    // Top-level `required` — intersection across branches, then UNION'd with
    // every extras-arm's required keys (extras arms are conjunctively combined
    // with the branches at runtime, so their required keys contribute additively
    // to the top-level required-set, not intersectively).
    const requiredSet = new Set(intersectionTopLevelRequired(branches));
    for (const arm of extrasArms) {
      const armRequired = Array.isArray(arm.required) ? (arm.required as string[]) : [];
      for (const key of armRequired) requiredSet.add(key);
    }
    if (requiredSet.size > 0) {
      envelope.required = Array.from(requiredSet).sort();
    }

    // Preserve the extras arms under top-level `allOf` so strict-rich clients
    // can still apply per-tool extension constraints (the inner anyOf/oneOf arm
    // is folded into `oneOf` above; only the extras arms survive in `allOf`).
    if (extrasArms.length > 0) {
      envelope.allOf = extrasArms;
    }
  } else if (Array.isArray(allOf)) {
    // allOf without an inner anyOf/oneOf arm — preserve verbatim.
    envelope.allOf = allOf;
  }

  if (typeof $schema === "string") {
    envelope.$schema = $schema;
  }
  return envelope as JsonSchemaObject;
}

/**
 * Compute the union of every branch's top-level `properties` keys, with `{}`
 * leaf widening except for cross-branch string discriminators (every branch
 * types this key as `string`) which are surfaced as `{ type: "string" }`. The
 * predicate is name-agnostic — covers `target_mode` today and any future
 * cross-branch string discriminator (e.g. `mode`, `kind`, `output_format`)
 * without per-tool tuning. Per-branch literal `const` values stay inside the
 * `oneOf` arms for strict-rich client validation.
 */
function unionTopLevelProperties(
  branches: ReadonlyArray<Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const branchPropMaps = branches.map((b) => {
    const props = b.properties;
    return props && typeof props === "object" ? (props as Record<string, unknown>) : {};
  });
  const allKeys = new Set<string>();
  for (const m of branchPropMaps) {
    for (const k of Object.keys(m)) allKeys.add(k);
  }
  const union: Record<string, Record<string, unknown>> = {};
  for (const key of allKeys) {
    const presentInAll = branchPropMaps.every((m) => Object.hasOwn(m, key));
    const allString =
      presentInAll &&
      branchPropMaps.every((m) => {
        const v = m[key];
        return (
          v !== null &&
          typeof v === "object" &&
          (v as Record<string, unknown>).type === "string"
        );
      });
    union[key] = allString ? { type: "string" } : {};
  }
  return union;
}

/**
 * Compute the intersection of every branch's top-level `required` array,
 * sorted for deterministic output across runs.
 */
function intersectionTopLevelRequired(
  branches: ReadonlyArray<Record<string, unknown>>,
): Array<string> {
  if (branches.length === 0) return [];
  const sets = branches.map((b) => {
    const req = b.required;
    return new Set(Array.isArray(req) ? (req as string[]) : []);
  });
  let result = sets[0]!;
  for (let i = 1; i < sets.length; i++) {
    const next = sets[i]!;
    result = new Set([...result].filter((x) => next.has(x)));
  }
  return Array.from(result).sort();
}

function stripInnerObjectType(branch: unknown): unknown {
  if (typeof branch !== "object" || branch === null) return branch;
  const obj = branch as Record<string, unknown>;
  if (obj.type !== "object") return branch;
  const { type: _stripped, ...rest } = obj;
  return rest;
}
