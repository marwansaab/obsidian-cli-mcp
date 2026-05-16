// Original — no upstream. Shared types and helpers for the tool aggregator pattern. Post-010: the wrap-branch envelope helper deletes (FR-005); toMcpInputSchema is now a one-line delegate to zodToJsonSchema. The flat-z.object().strict().superRefine encoding of targetModeSchema (feature 010) emits a natural single-flat-object descriptor directly; no envelope synthesis required. BI-034 (spec branch 034-fix-unicode-lookups): adds B64_PAYLOAD_DECODE_EXPR and composeEvalCode for the seven-tool atob+base64 eval-composition cohort — `atob()` in V8 returns a Latin-1 binary string; the new decode expression re-interprets the byte sequence as UTF-8 so non-ASCII identifiers survive the base64 round-trip.
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ZodTypeAny } from "zod";

/**
 * UTF-8-safe replacement for the legacy `JSON.parse(atob('__PAYLOAD_B64__'))` decode
 * embedded inside every eval-composition `_template.ts`. `atob()` in V8 yields a
 * Latin-1 binary string — UTF-8 multi-byte sequences survive base64 transit at the
 * byte level but get mojibake-interpreted post-`atob`. This expression converts
 * each Latin-1 code point back to its original byte via `Uint8Array.from(...,
 * c=>c.charCodeAt(0))` and then re-decodes the byte sequence as UTF-8 via
 * `TextDecoder("utf-8")`. The `__PAYLOAD_B64__` placeholder is substituted at
 * compose time by `composeEvalCode`. Spec branch: 034-fix-unicode-lookups.
 */
export const B64_PAYLOAD_DECODE_EXPR =
  "new TextDecoder(\"utf-8\").decode(Uint8Array.from(atob('__PAYLOAD_B64__'),c=>c.charCodeAt(0)))";

/**
 * Compose the eval-side JS code string from a template carrying the
 * `__PAYLOAD_B64__` placeholder and a JSON-serialisable payload. Centralises the
 * `JSON.stringify` → `Buffer.from(...).toString("base64")` →
 * `template.replace(placeholder, b64)` boilerplate previously duplicated across
 * seven handlers. Throws if the template lacks the placeholder so a future
 * eval-composition tool cannot silently lose its payload.
 */
export function composeEvalCode(template: string, payload: unknown): string {
  if (!template.includes("__PAYLOAD_B64__")) {
    throw new Error("composeEvalCode: template is missing the __PAYLOAD_B64__ placeholder");
  }
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  return template.replace("__PAYLOAD_B64__", payloadB64);
}

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
