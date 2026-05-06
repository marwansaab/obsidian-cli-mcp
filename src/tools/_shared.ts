// Original — no upstream. Shared types and helpers for the tool aggregator pattern (plan-stage P8).

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
