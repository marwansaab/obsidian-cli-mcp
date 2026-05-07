// Original — no upstream. Shared types and helpers for the tool aggregator pattern. Post-010: the wrap-branch envelope helper deletes (FR-005); toMcpInputSchema is now a one-line delegate to zodToJsonSchema. The flat-z.object().strict().superRefine encoding of targetModeSchema (feature 010) emits a natural single-flat-object descriptor directly; no envelope synthesis required.
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
 * The aggregator pattern's per-tool unit. Each tool's `register*Tool` factory
 * returns this shape; `src/server.ts` aggregates them into a single `tools/list`
 * response and a single `CallToolRequest` dispatcher.
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
 */
export function asToolError(payload: ToolErrorPayload): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

/**
 * A JSON Schema whose top-level `type` is `"object"`. The MCP `Tool` definition
 * requires every tool's `inputSchema` to satisfy this shape.
 */
export interface JsonSchemaObject {
  type: "object";
  [key: string]: unknown;
}

/**
 * Render any zod schema to a JSON Schema whose top-level `type` is `"object"`,
 * so the result is a valid `inputSchema` for an MCP `Tool` descriptor. Post-010
 * this is a one-line delegate to `zodToJsonSchema` — every consumer schema is a
 * `ZodObject` (with optional `.strict()` + `.superRefine`) whose emit shape is
 * already a flat object descriptor.
 */
export function toMcpInputSchema(zodSchema: ZodTypeAny): JsonSchemaObject {
  return zodToJsonSchema(zodSchema, { $refStrategy: "none" }) as JsonSchemaObject;
}
