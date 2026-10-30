// Original — no upstream. registerTool factory and assertToolDocsExist aggregator: the only path from a zod schema to a tool registered on an MCP SDK v2 McpServer (ADR-006, ADR-039, FR-001..FR-006). 068 R2: the SDK receives the input schema through toSdkInputSchema, a pass-through Standard Schema adapter that publishes the zod schema's own JSON Schema emission and never rejects, so the tool's own zod parse, mapValidationError hook and {code, message, details} envelope stay in force; the callback returns (never throws) asToolError results.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ZodError, type z } from "zod";

import { UpstreamError } from "../errors.js";
import { asToolError, type RegisteredTool, type ToolCallResult, type ToolErrorPayload } from "./_shared.js";
import { stripSchemaDescriptions, type JsonSchemaObject } from "../help/strip-schema.js";

import type { McpServer, StandardSchemaWithJSON } from "@modelcontextprotocol/server";

export type ResponseFormat = "json" | "raw";

export interface ToolSpec<TSchema extends z.ZodType, TDeps = undefined> {
  name: string;
  description: string;
  schema: TSchema;
  deps?: TDeps;
  responseFormat?: ResponseFormat;
  handler: (input: z.infer<TSchema>, deps: TDeps) => Promise<unknown | ToolCallResult>;
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

type JsonSchemaOptions = Parameters<StandardSchemaWithJSON["~standard"]["jsonSchema"]["input"]>[0];

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
 * asks for (draft-2020-12), so the published bytes are SDK-native; descriptions below the
 * root are still stripped until PR 4 (C1). Its `validate` accepts every value unchanged:
 * the SDK's own input check would replace the project envelope with free text, so the
 * registered callback runs the zod parse instead.
 */
export function toSdkInputSchema(schema: z.ZodType): StandardSchemaWithJSON {
  const zodJsonSchema = schema["~standard"].jsonSchema;
  const emit =
    (io: "input" | "output") =>
    (options: JsonSchemaOptions): Record<string, unknown> =>
      stripSchemaDescriptions(zodJsonSchema[io](options) as JsonSchemaObject);
  return {
    "~standard": {
      version: 1,
      vendor: "obsidian-cli-mcp",
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: emit("input"), output: emit("output") },
    },
  };
}

export function registerTool<TSchema extends z.ZodType, TDeps = undefined>(
  spec: ToolSpec<TSchema, TDeps>,
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
  const responseFormat: ResponseFormat = spec.responseFormat ?? "json";

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

  const handler = async (args: unknown): Promise<ToolCallResult> => {
    let parsed: z.infer<TSchema>;
    try {
      parsed = spec.schema.parse(args) as z.infer<TSchema>;
    } catch (err) {
      if (err instanceof ZodError) return asToolError(toValidationError(err.issues, args));
      throw err;
    }

    let result: unknown;
    try {
      result = await spec.handler(parsed, spec.deps as TDeps);
    } catch (err) {
      // A runtime ZodError here is the handler's OWN output failing its defensive
      // `schema.parse` — an output-contract break, NOT bad client input. Surface
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

    if (responseFormat === "json") {
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    }
    return result as ToolCallResult;
  };

  return {
    descriptor: {
      name: spec.name,
      description: spec.description,
      inputSchema,
    },
    handler,
    register: (server: McpServer) => {
      server.registerTool(spec.name, { description: spec.description, inputSchema: sdkInputSchema }, handler);
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
