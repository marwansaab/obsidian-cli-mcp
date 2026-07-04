// Original — no upstream. Shared types and helpers for the tool aggregator pattern. Post-010: the wrap-branch envelope helper deletes (FR-005). BI-067: toMcpInputSchema converts via zod 4's built-in z.toJSONSchema (io:"input", target:"draft-7") followed by normalizeToDraft7Parity — a four-rule recursive pass that reproduces the retired v3-era converter's emission byte-for-byte so the committed registry fingerprint baseline passes unregenerated (FR-008/FR-009, contracts/descriptor-parity.contract.md). BI-034 (spec branch 034-fix-unicode-lookups): adds B64_PAYLOAD_DECODE_EXPR and composeEvalCode for the seven-tool atob+base64 eval-composition cohort — `atob()` in V8 returns a Latin-1 binary string; the new decode expression re-interprets the byte sequence as UTF-8 so non-ASCII identifiers survive the base64 round-trip.
import { z } from "zod";

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

export interface ToolErrorPayload {
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

const SAFE_INT_MAX = 9007199254740991; // Number.MAX_SAFE_INTEGER
const SAFE_INT_MIN = -9007199254740991;

const JSON_PRIMITIVE_TYPES = new Set(["string", "number", "integer", "boolean", "null"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** N2 branch test: exactly one key, `type`, whose value is a JSON primitive name. */
function isBarePrimitiveBranch(branch: unknown): boolean {
  return (
    isPlainObject(branch) &&
    Object.keys(branch).length === 1 &&
    typeof branch["type"] === "string" &&
    JSON_PRIMITIVE_TYPES.has(branch["type"])
  );
}

/**
 * Normalize one node of a freshly emitted zod-4 JSON Schema back to the retired
 * zod-to-json-schema draft-07 emission (contracts/descriptor-parity.contract.md).
 * Rules, in order:
 *
 * - N1: `propertyNames` deep-equal `{"type":"string"}` → delete. zod 4 stamps it on
 *   every plain-string-key record; the v3 converter never emitted it.
 * - N1b (ONLY when N1 did not fire): `additionalProperties` deep-equal `{}` → `true`
 *   (looseObject emission). The N1→N1b ordering is load-bearing: the propertyNames
 *   marker is what distinguishes a record-of-unknown (whose `additionalProperties: {}`
 *   is legitimate in both versions and must survive) from a looseObject.
 * - N2: `anyOf` where the node has no own `type` and EVERY branch is a bare
 *   single-key `{type: <primitive>}` → collapse to `type: [...]`, branch order
 *   preserved (array order is significant in the fingerprint hash). Mixed unions
 *   stay `anyOf`, matching the v3 converter's all-or-nothing collapse.
 * - N3: on `type: "integer"` nodes, delete `maximum`/`minimum` iff they equal the
 *   ±Number.MAX_SAFE_INTEGER sentinels zod 4 stamps on unbounded ints. FUTURE-AUTHOR
 *   GUARD: a hand-authored `.max(9007199254740991)` is indistinguishable from the
 *   sentinel and would be stripped — no such bound exists in the repo; add a parity
 *   fixture to _shared.test.ts before authoring one.
 * - N4: `oneOf` → `anyOf` (zod 4 emits oneOf for discriminated unions; the v3
 *   converter emitted anyOf).
 */
function normalizeNode(node: Record<string, unknown>): void {
  const propertyNames = node["propertyNames"];
  if (
    isPlainObject(propertyNames) &&
    Object.keys(propertyNames).length === 1 &&
    propertyNames["type"] === "string"
  ) {
    delete node["propertyNames"];
  } else if (
    isPlainObject(node["additionalProperties"]) &&
    Object.keys(node["additionalProperties"] as Record<string, unknown>).length === 0
  ) {
    node["additionalProperties"] = true;
  }

  const anyOf = node["anyOf"];
  if (
    Array.isArray(anyOf) &&
    anyOf.length > 0 &&
    !("type" in node) &&
    anyOf.every(isBarePrimitiveBranch)
  ) {
    node["type"] = anyOf.map((branch) => (branch as Record<string, unknown>)["type"]);
    delete node["anyOf"];
  }

  if (node["type"] === "integer") {
    if (node["maximum"] === SAFE_INT_MAX) {
      delete node["maximum"];
    }
    if (node["minimum"] === SAFE_INT_MIN) {
      delete node["minimum"];
    }
  }

  if ("oneOf" in node) {
    node["anyOf"] = node["oneOf"];
    delete node["oneOf"];
  }
}

/**
 * Recursive post-order walk applying normalizeNode to every object node of the
 * emitted schema. Mutates only the freshly emitted JSON value (never the zod
 * schema); deterministic, no I/O.
 */
function normalizeToDraft7Parity(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeToDraft7Parity(item);
    }
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    normalizeToDraft7Parity(value[key]);
  }
  normalizeNode(value);
}

/**
 * Render any zod schema to a JSON Schema whose top-level `type` is `"object"`,
 * so the result is a valid `inputSchema` for an MCP `Tool` descriptor. BI-067:
 * zod 4's built-in `z.toJSONSchema` replaces the retired zod-to-json-schema
 * delegate. `io: "input"` is REQUIRED — the default output mode marks
 * `.optional().default()` fields as required. `target: "draft-7"` is REQUIRED —
 * it emits the `$schema` draft-07 URI byte-identical to the published (hashed)
 * descriptors; do NOT strip `$schema`. The normalization pass restores the exact
 * v3-era emission so the committed fingerprint baseline passes unregenerated.
 */
export function toMcpInputSchema(zodSchema: z.ZodType): JsonSchemaObject {
  const emitted = z.toJSONSchema(zodSchema, { io: "input", target: "draft-7" });
  normalizeToDraft7Parity(emitted);
  return emitted as JsonSchemaObject;
}
