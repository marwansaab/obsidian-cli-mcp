// Original — no upstream. Shared types and helpers for the tool aggregator pattern. Post-010: the wrap-branch envelope helper deletes (FR-005). 068 (C3): toMcpInputSchema and its draft-07 parity normaliser are gone; the published input schema is whatever the MCP SDK v2 emits from the zod schema (see toSdkInputSchema in _register.ts). BI-034 (spec branch 034-fix-unicode-lookups): adds B64_PAYLOAD_DECODE_EXPR and composeEvalCode for the seven-tool atob+base64 eval-composition cohort — `atob()` in V8 returns a Latin-1 binary string; the new decode expression re-interprets the byte sequence as UTF-8 so non-ASCII identifiers survive the base64 round-trip.
import type { McpServer } from "@modelcontextprotocol/server";

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
 * The project's own view of a registered tool's descriptor: the name, the description and
 * the `inputSchema` JSON emitted from `toSdkInputSchema` at the SDK's target (descriptions
 * below the root stripped, FR-006). `registerTool` refuses a schema without an object root,
 * so the SDK publishes these bytes unchanged (`_register.test.ts` pins descriptor ===
 * published through a real client). Used for boot-time checks and co-located tests;
 * clients read the descriptor from the SDK's `tools/list`.
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
 * The per-tool call handler — receives the raw `arguments` of a `tools/call` request (the
 * SDK passes them through unvalidated) and returns the response envelope. Per-tool zod
 * validation happens INSIDE this handler because each tool owns its own zod schema and
 * decides its own per-issue error formatting.
 */
export type ToolCallHandler = (args: unknown) => Promise<ToolCallResult>;

/**
 * The aggregator pattern's per-tool unit. Each tool's `create*Tool` factory returns this
 * shape; `src/server.ts` builds the list once and calls `register` on every `McpServer` it
 * builds, so each served instance publishes and dispatches the same tools.
 */
export interface RegisteredTool {
  descriptor: ToolDescriptor;
  handler: ToolCallHandler;
  register: (server: McpServer) => void;
}

export interface ToolErrorPayload {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Build the SDK error-response envelope from a structured payload. Used at every
 * boundary surface where an `UpstreamError` (or a `VALIDATION_ERROR`) needs to
 * flow through the SDK's `isError: true` shape.
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
