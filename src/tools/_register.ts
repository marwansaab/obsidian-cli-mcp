// Original — no upstream. registerTool factory and assertToolDocsExist aggregator: the only path from a zod schema to a tool registered on an MCP SDK v2 McpServer (ADR-006, ADR-039, FR-001..FR-006). 068 R2: the SDK receives the input schema through toSdkInputSchema, a pass-through Standard Schema adapter that publishes the zod schema's own JSON Schema emission and never rejects, so the tool's own zod parse, mapValidationError hook and {code, message, details} envelope stay in force; the callback returns (never throws) asToolError results. 068 PR 4: every spec carries a title and all four annotations, and parameter descriptions are published unstripped (ADR-040). 068 PR 5 (R6, FR-039): a spec may carry an outputSchema, published through the toSdkOutputSchema pass-through adapter (object root for unions of objects); the callback checks each success against it, reporting drift as INTERNAL_ERROR, and successes carry structuredContent plus the identical JSON text. 068 PR 6 (R11, R12): every call gets a ToolCall context — the request's AbortSignal and, when a progress token was sent, a progress reporter, both also merged into the call's deps — plus the two confirmation steps from _confirm.ts; a pending confirmation goes back to the SDK as an input_required result.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ZodError, type z } from "zod";

import { UpstreamError } from "../errors.js";
import { ConfirmationRequested, NON_INTERACTIVE_CALL, requestConfirmation } from "./_confirm.js";
import {
  asToolError,
  type Confirmation,
  type RegisteredTool,
  type ToolAnnotations,
  type ToolCall,
  type ToolCallResult,
  type ToolErrorPayload,
} from "./_shared.js";

import type { CallScope } from "../cli-adapter/cli-adapter.js";
import type { McpServer, ServerContext, StandardSchemaWithJSON } from "@modelcontextprotocol/server";

/** Build the call context of one `tools/call` request from the SDK's handler context. */
function toolCallFromRequest(server: McpServer, ctx: ServerContext, toolName: string): ToolCall {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  return {
    signal: ctx.mcpReq.signal,
    // 068 FR-054: defined only when the request carried a progress token.
    reportProgress:
      progressToken === undefined
        ? undefined
        : (progress, total, message) => {
            // Best-effort: a progress notice that cannot be sent (the transport closed) must not
            // fail the call it describes.
            ctx.mcpReq
              .notify({ method: "notifications/progress", params: { progressToken, progress, total, message } })
              .catch(() => undefined);
          },
    ...requestConfirmation(server, ctx, toolName),
  };
}

interface ToolSpecBase<TSchema extends z.ZodType, TDeps> {
  name: string;
  /** Human-readable name shown by clients (068 FR-019). */
  title: string;
  description: string;
  /** All four behaviour hints, explicit (068 FR-020, FR-024). */
  annotations: ToolAnnotations;
  schema: TSchema;
  deps?: TDeps;
  /**
   * Optional mapper from Zod issues to a structured VALIDATION_ERROR payload for
   * INPUT-validation failures (the schema `.parse` of the incoming args). When
   * absent, a generic envelope listing the raw issues is emitted. `rawArgs` is the
   * unparsed input, for mappers that echo input-derived fields (e.g. prepend's
   * contentLength). A runtime ZodError thrown by the handler itself (a defensive
   * output `schema.parse`) is an output-contract break, NOT input validation, so it
   * surfaces as INTERNAL_ERROR and does NOT pass through this hook.
   */
  mapValidationError?: (issues: z.core.$ZodIssue[], rawArgs: unknown) => ToolErrorPayload;
}

/** A call's deps: the tool's boot-time deps plus the request's scope (068 R11); none for a tool without deps. */
type CallDeps<TDeps> = TDeps extends undefined ? undefined : TDeps & CallScope;

type Handler<TSchema extends z.ZodType, TDeps, TResult> = (
  input: z.infer<TSchema>,
  deps: CallDeps<TDeps>,
  confirmation: Confirmation,
) => Promise<TResult>;

/**
 * How a tool's success reaches the wire. There are three cases, and only these three
 * type-check, so an `outputSchema` on a raw tool cannot be written:
 * - `responseFormat: "raw"`: the handler builds the `ToolCallResult` itself.
 * - JSON (the default): the result is sent as one JSON text block.
 * - JSON with an `outputSchema` (068 FR-039): the schema is published through
 *   `toSdkOutputSchema`, the handler must return a value of that schema (checked at run
 *   time too; drift is INTERNAL_ERROR), and a success carries it both as
 *   `structuredContent` and as the identical JSON text. Only for a result that is always
 *   a JSON object.
 */
export type ToolSpec<TSchema extends z.ZodType, TDeps = undefined, TOutput extends z.ZodType = z.ZodType> =
  ToolSpecBase<TSchema, TDeps> &
    (
      | { responseFormat: "raw"; outputSchema?: never; handler: Handler<TSchema, TDeps, ToolCallResult> }
      | { responseFormat?: "json"; outputSchema?: never; handler: Handler<TSchema, TDeps, unknown> }
      | { responseFormat?: "json"; outputSchema: TOutput; handler: Handler<TSchema, TDeps, z.input<TOutput>> }
    );

/**
 * The JSON Schema target the SDK passes to `~standard.jsonSchema` when it publishes a
 * tool (the SDK's private `JSON_SCHEMA_CONVERSION_TARGET`). The project descriptor is
 * emitted with the same target so it carries the bytes clients receive; the
 * descriptor-vs-published test in `_register.test.ts` fails if the SDK ever changes it.
 */
const SDK_JSON_SCHEMA_TARGET = "draft-2020-12";

/**
 * Pass-through Standard Schema adapter for a tool's input schema (068 R2). Its JSON
 * Schema is the zod schema's own `~standard.jsonSchema` emission for the target the SDK
 * asks for (draft-2020-12), so the published bytes are SDK-native, parameter descriptions
 * included (068 FR-029, ADR-040). Its `validate` accepts every value unchanged: the SDK's
 * own input check would replace the project envelope with free text, so the registered
 * callback runs the zod parse instead.
 */
export function toSdkInputSchema(schema: z.ZodType): StandardSchemaWithJSON {
  return {
    "~standard": {
      version: 1,
      vendor: "obsidian-cli-mcp",
      validate: (value: unknown) => ({ value }),
      jsonSchema: schema["~standard"].jsonSchema,
    },
  };
}

/**
 * Pass-through Standard Schema adapter for a tool's output schema (068 R6, the mirror of
 * `toSdkInputSchema`). Its JSON Schema is the zod schema's own emission with one addition: a
 * root that is a union whose variants are all `type: "object"` (zod emits it with no root
 * `type`) gains `type: "object"`, so the published schema has an object root, which the 2025-era
 * codec leaves unwrapped and both eras publish identically (FR-039). Nothing else changes, and
 * the result data is never wrapped. Its `validate` accepts every value unchanged: the SDK's own
 * output check would report a failure as free text, so the registered callback runs the zod
 * check instead and reports drift as the INTERNAL_ERROR envelope (Principle IV).
 */
export function toSdkOutputSchema(schema: z.ZodType): StandardSchemaWithJSON {
  const zod = schema["~standard"];
  return {
    "~standard": {
      version: 1,
      vendor: "obsidian-cli-mcp",
      validate: (value: unknown) => ({ value }),
      jsonSchema: {
        input: zod.jsonSchema.input,
        output: (options) => withObjectRootForObjectUnion(zod.jsonSchema.output(options)),
      },
    },
  };
}

function withObjectRootForObjectUnion(json: Record<string, unknown>): Record<string, unknown> {
  if (json["type"] !== undefined) return json;
  const variants = json["anyOf"] ?? json["oneOf"];
  const allObjects =
    Array.isArray(variants) &&
    variants.length > 0 &&
    variants.every((v) => typeof v === "object" && v !== null && (v as Record<string, unknown>)["type"] === "object");
  return allObjects ? { type: "object", ...json } : json;
}

export function registerTool<TSchema extends z.ZodType, TDeps = undefined, TOutput extends z.ZodType = z.ZodType>(
  spec: ToolSpec<TSchema, TDeps, TOutput>,
): RegisteredTool {
  const sdkInputSchema = toSdkInputSchema(spec.schema);
  const inputSchema = sdkInputSchema["~standard"].jsonSchema.input({ target: SDK_JSON_SCHEMA_TARGET });
  // MCP requires an object-root inputSchema (FR-002). The SDK would silently add a missing
  // root `type: "object"` to what it publishes, leaving the descriptor out of step with the
  // wire, so a schema that does not emit one is refused here, at boot.
  if (inputSchema["type"] !== "object") {
    throw new Error(
      `${spec.name}: input schema must emit a top-level "type": "object" (FR-002), got ${JSON.stringify(inputSchema["type"])}`,
    );
  }
  const sdkOutputSchema = spec.outputSchema === undefined ? undefined : toSdkOutputSchema(spec.outputSchema);
  const outputSchema = sdkOutputSchema?.["~standard"].jsonSchema.output({ target: SDK_JSON_SCHEMA_TARGET });
  // A non-object output root would be wrapped by the 2025-era codec, so the two eras would
  // publish different schemas. FR-039 allows no era exception: refuse it at boot instead.
  if (outputSchema !== undefined && outputSchema["type"] !== "object") {
    throw new Error(
      `${spec.name}: output schema must emit a top-level "type": "object" (FR-039), got ${JSON.stringify(outputSchema["type"])}`,
    );
  }

  // INPUT-validation mapping only: the per-tool hook when supplied, else a generic
  // issues-listing envelope. A runtime/output ZodError thrown by the handler does
  // NOT use this — it surfaces as INTERNAL_ERROR in the handler-execution catch below.
  const toValidationError = (issues: z.core.$ZodIssue[], rawArgs: unknown): ToolErrorPayload =>
    spec.mapValidationError?.(issues, rawArgs) ?? {
      code: "VALIDATION_ERROR",
      message: `${spec.name} input failed schema validation`,
      details: {
        issues: issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      },
    };

  const handler = async (args: unknown, call: ToolCall = NON_INTERACTIVE_CALL): Promise<ToolCallResult> => {
    let parsed: z.infer<TSchema>;
    try {
      parsed = spec.schema.parse(args) as z.infer<TSchema>;
    } catch (err) {
      if (err instanceof ZodError) return asToolError(toValidationError(err.issues, args));
      throw err;
    }

    // 068 R11: per-call deps, so the request's signal and progress reporter reach invokeCli.
    const deps = (
      spec.deps === undefined ? undefined : { ...spec.deps, signal: call.signal, reportProgress: call.reportProgress }
    ) as CallDeps<TDeps>;

    let result: unknown;
    try {
      result = await spec.handler(parsed, deps, call);
      // 068 R6: the published output contract is checked here, not by the SDK. Validation
      // only — the handler's own value is what goes on the wire.
      spec.outputSchema?.parse(result);
    } catch (err) {
      // A runtime ZodError here is the handler's output failing its outputSchema or its own
      // defensive `schema.parse` — an output-contract break, NOT bad client input. Surface
      // it as INTERNAL_ERROR (never VALIDATION_ERROR, and never through the
      // input-shaped mapValidationError hook) so the client is not told to fix
      // input that was valid. INTERNAL_ERROR is already in the code set — the
      // Principle IV zero-new-codes streak holds.
      if (err instanceof ZodError) {
        return asToolError({
          code: "INTERNAL_ERROR",
          message: `${spec.name} produced a response that failed its output contract`,
          details: {
            issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
          },
        });
      }
      if (err instanceof UpstreamError) {
        return asToolError({
          code: err.code,
          message: err.message,
          details: err.details,
        });
      }
      throw err;
    }

    if (spec.responseFormat === "raw") return result as ToolCallResult;
    const content = [{ type: "text" as const, text: JSON.stringify(result) }];
    // 068 FR-039: the same object as structured data. Errors above stay text-only (FR-040).
    if (sdkOutputSchema !== undefined) return { content, structuredContent: result as Record<string, unknown> };
    return { content };
  };

  return {
    descriptor: {
      name: spec.name,
      description: spec.description,
      annotations: spec.annotations,
      inputSchema,
    },
    handler,
    register: (server: McpServer) => {
      server.registerTool(
        spec.name,
        {
          title: spec.title,
          description: spec.description,
          annotations: spec.annotations,
          inputSchema: sdkInputSchema,
          ...(sdkOutputSchema !== undefined && { outputSchema: sdkOutputSchema }),
        },
        async (args, ctx) => {
          try {
            return await handler(args, toolCallFromRequest(server, ctx, spec.name));
          } catch (err) {
            // 068 R12: the confirmation prompt goes back to the SDK as an input_required result.
            if (err instanceof ConfirmationRequested) return err.result;
            throw err;
          }
        },
      );
    },
  };
}

/**
 * Walk every registered tool and confirm a docs/tools/{name}.md file exists.
 * Aggregates ALL missing files into one error message; never fail-fast on the
 * first miss (Clarifications 2026-05-07 Q4 / FR-005).
 */
export function assertToolDocsExist(tools: RegisteredTool[], docsDir: string): void {
  const missing: string[] = [];
  for (const tool of tools) {
    const name = tool.descriptor.name;
    const absolute = resolve(docsDir, `${name}.md`);
    if (!existsSync(absolute)) {
      missing.push(`docs/tools/${name}.md`);
    }
  }
  if (missing.length === 0) return;
  const lines = missing.map((p) => `  - ${p}`).join("\n");
  throw new Error(
    `Missing tool documentation files:\n${lines}\n\nServer boot failed because these registered tools have no documentation. Create the missing files and try again.`,
  );
}
