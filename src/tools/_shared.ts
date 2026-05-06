// Original — no upstream. Shared types and helpers for the tool aggregator pattern (plan-stage P8) plus the published-descriptor envelope helper (feature 007 / FR-002).
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
 * `zodToJsonSchema` produces top-level `anyOf` for unions / discriminated
 * unions / refined unions — outputs that satisfy JSON Schema validity but NOT
 * the MCP `Tool` definition's narrower requirement. This helper wraps such
 * outputs into `{ type: "object", additionalProperties: true, oneOf: [...] }`,
 * preserving each branch's shape while satisfying the protocol.
 *
 * Behaviour summary (per [contracts/envelope-helper.contract.md]):
 *   - Single `z.object({...})`            → returned verbatim (no-op).
 *   - `z.discriminatedUnion(...)` etc.    → wrapped; top-level `anyOf` is
 *                                           rewritten to `oneOf`; inner
 *                                           `type: "object"` stripped from
 *                                           each branch (the outer one suffices).
 *   - `$schema` keyword from the raw output is preserved.
 *   - The raw `zodToJsonSchema` output is NOT mutated.
 *
 * No-throws: malformed inputs yield a well-formed but possibly unhelpful
 * envelope. The helper is not a runtime validator.
 */
export function toMcpInputSchema(zodSchema: ZodTypeAny): JsonSchemaObject {
  const raw = zodToJsonSchema(zodSchema, { $refStrategy: "none" }) as Record<string, unknown>;
  if (raw.type === "object") {
    // Already an object schema — return a fresh shallow copy to honor the
    // "do not mutate the raw output" invariant (consumers may extend the
    // returned object without affecting future calls' outputs).
    return { ...raw, type: "object" } as JsonSchemaObject;
  }
  // Top-level is anyOf / oneOf / allOf — wrap inside an object envelope.
  // Strip the $schema keyword off so we can place it last for readability.
  const { $schema, anyOf, oneOf, allOf, ...rest } = raw as {
    $schema?: unknown;
    anyOf?: unknown;
    oneOf?: unknown;
    allOf?: unknown;
  } & Record<string, unknown>;
  // Rewrite anyOf → oneOf when present (research P2: discriminated-union
  // branches are mutually exclusive, so oneOf is the more accurate keyword
  // and produces better LLM tool-use generation).
  const branches = Array.isArray(anyOf)
    ? anyOf.map(stripInnerObjectType)
    : Array.isArray(oneOf)
      ? oneOf.map(stripInnerObjectType)
      : undefined;
  const envelope: Record<string, unknown> = {
    type: "object",
    additionalProperties: true,
    ...rest,
  };
  if (branches) {
    envelope.oneOf = branches;
  } else if (Array.isArray(allOf)) {
    envelope.allOf = allOf;
  }
  if (typeof $schema === "string") {
    envelope.$schema = $schema;
  }
  return envelope as JsonSchemaObject;
}

function stripInnerObjectType(branch: unknown): unknown {
  if (typeof branch !== "object" || branch === null) return branch;
  const obj = branch as Record<string, unknown>;
  if (obj.type !== "object") return branch;
  const { type: _stripped, ...rest } = obj;
  return rest;
}
