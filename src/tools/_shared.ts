// Original — no upstream. Shared types and helpers for the tool aggregator pattern. Post-010: the wrap-branch envelope helper deletes (FR-005). 068 (C3): toMcpInputSchema and its draft-07 parity normaliser are gone; the published input schema is whatever the MCP SDK v2 emits from the zod schema (see toSdkInputSchema in _register.ts). BI-034 (spec branch 034-fix-unicode-lookups): adds B64_PAYLOAD_DECODE_EXPR and composeEvalCode for the seven-tool atob+base64 eval-composition cohort — `atob()` in V8 returns a Latin-1 binary string; the new decode expression re-interprets the byte sequence as UTF-8 so non-ASCII identifiers survive the base64 round-trip. 068 PR 6 (R11, R12): ToolCall, the per-call context (signal and progress for the deps, confirmation for the handler), and BootDeps, a tool's deps without that per-call scope. 072: closedVaultNote, the closed-vault paragraph six read-tool descriptions share. 075: BYTES_WRITTEN_DESCRIPTION, the one published meaning of `bytes_written` (the size change) on the five single-note text writers.
import type { CallScope } from "../cli-adapter/cli-adapter.js";
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
 * The closed-vault paragraph shared by the tool descriptions of the six read tools whose
 * closed vault is brought up by the dispatch layer's ADR-029 cold-start retry (spec 072
 * FR-008). `command` is the CLI subcommand the tool runs, as it appears in the shim's
 * `Error: Command "<command>" not found.` answer.
 */
export function closedVaultNote(command: string): string {
  return `Closed vault: a registered vault that is not open is opened automatically and the call returns its normal result (the first call takes longer). If it cannot be brought up — for example, its command-line integration is disabled — the call fails with \`CLI_REPORTED_ERROR\` whose \`details.stdout\` starts \`Error: Command "${command}" not found.\` (vault unavailable): open the vault in Obsidian, then call again. This is a failure, never an empty result.`;
}

/** The `bytes_written` description shared by the output schemas of the five single-note text writers (spec 075 FR-008). */
export const BYTES_WRITTEN_DESCRIPTION =
  "Change in the note's size in bytes caused by this write: its size after the write minus its size before, counting a note that did not exist as 0. Zero when the size did not change; negative when the note shrank.";

/**
 * The four MCP behaviour hints, all required so TypeScript refuses a tool that leaves one
 * out (068 FR-020; values per spec FR-024, pinned by `_surface.test.ts`).
 */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

// The five rows of the spec FR-024 classification table. Each tool names its row; the
// per-tool pin in `_surface.test.ts` keeps its own literal copy on purpose (FR-023).
export const READ_ONLY_HINTS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
export const ADDITIVE_WRITE_HINTS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
export const REPEATABLE_WRITE_HINTS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
export const DESTRUCTIVE_HINTS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};
export const PASSTHROUGH_HINTS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * The project's own view of a registered tool's descriptor: the name, description,
 * annotations (the input of the planned read-only tool filter, 068 T074) and the `inputSchema`
 * JSON emitted from `toSdkInputSchema` at the SDK's target (parameter descriptions kept, 068
 * FR-029). `registerTool` refuses a schema without an object root, so the SDK publishes these
 * bytes unchanged (`_register.test.ts` pins descriptor === published through a real client).
 * Used for boot-time checks and co-located tests; clients read the descriptor, title included,
 * from the SDK's `tools/list`.
 */
export interface ToolDescriptor {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: Record<string, unknown>;
}

/**
 * The success / error envelope a tool's call-handler returns. Mirrors the MCP
 * SDK's `CallToolResult` shape. A success from a tool with an `outputSchema` also
 * carries `structuredContent`, the same object as the JSON text (068 FR-039). On the
 * failure path, `isError: true` flags the envelope as a structured error; the
 * JSON-stringified payload in `content[0].text` carries `code`, `message`, and
 * `details` per the project's UpstreamError serialization, and there is no
 * `structuredContent` (FR-040).
 */
export type ToolCallResult =
  | { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> }
  | { isError: true; content: Array<{ type: "text"; text: string }> };

/**
 * The two confirmation steps a tool handler receives as its third argument (068 R12), built by
 * `registerTool` from each `tools/call` request. Both run before anything irreversible.
 */
export interface Confirmation {
  /**
   * Step 1: returns when the client can answer a form elicitation; otherwise throws
   * CONFIRMATION_UNAVAILABLE with `unavailableMessage`, which names the safe route. No I/O.
   */
  requireConfirmable(unavailableMessage: string): void;
  /**
   * Step 2: returns once the human confirmed. Otherwise throws — CONFIRMATION_DECLINED for any
   * other answer, or the internal request for an answer, which `registerTool` hands to the SDK.
   * Call it only after `requireConfirmable`.
   */
  confirm(message: string): void;
}

/**
 * Everything `registerTool` knows about one call (068 R11, R12): the request's signal and
 * progress reporter, which it puts on the call's deps (so a handler that passes its deps on to
 * `invokeCli` honours cancellation and progress without touching them), and the confirmation
 * steps, which it hands to the handler.
 */
export type ToolCall = CallScope & Confirmation;

/**
 * A tool's boot-time deps (`create*Tool`'s argument): its `ExecuteDeps` without the per-call
 * scope, which `registerTool` adds to the deps of each call.
 */
export type BootDeps<TDeps> = Omit<TDeps, keyof CallScope>;

/**
 * The per-tool call handler — receives the raw `arguments` of a `tools/call` request (the
 * SDK passes them through unvalidated) and returns the response envelope. Per-tool zod
 * validation happens INSIDE this handler because each tool owns its own zod schema and
 * decides its own per-issue error formatting. `call` defaults to a non-interactive context
 * (no signal, no progress, cannot confirm) for direct calls outside an MCP request.
 */
export type ToolCallHandler = (args: unknown, call?: ToolCall) => Promise<ToolCallResult>;

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
