// Original — no upstream. registerTool factory and assertToolDocsExist aggregator: the only path from a zod schema to a published MCP tool descriptor (ADR-006, FR-001..FR-006).
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ZodError, type ZodIssue, type ZodTypeAny, type z } from "zod";

import { UpstreamError } from "../errors.js";
import { asToolError, toMcpInputSchema, type RegisteredTool, type ToolCallResult, type ToolErrorPayload } from "./_shared.js";
import { stripSchemaDescriptions, type JsonSchemaObject } from "../help/strip-schema.js";


export type ResponseFormat = "json" | "raw";

export interface ToolSpec<TSchema extends ZodTypeAny, TDeps = undefined> {
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
  mapValidationError?: (issues: ZodIssue[], rawArgs: unknown) => ToolErrorPayload;
}

export function registerTool<TSchema extends ZodTypeAny, TDeps = undefined>(
  spec: ToolSpec<TSchema, TDeps>,
): RegisteredTool {
  const inputSchemaRaw = toMcpInputSchema(spec.schema);
  const inputSchema = stripSchemaDescriptions(inputSchemaRaw as JsonSchemaObject) as Record<string, unknown>;
  const responseFormat: ResponseFormat = spec.responseFormat ?? "json";

  // INPUT-validation mapping only: the per-tool hook when supplied, else a generic
  // issues-listing envelope. A runtime/output ZodError thrown by the handler does
  // NOT use this — it surfaces as INTERNAL_ERROR in the handler-execution catch below.
  const toValidationError = (issues: ZodIssue[], rawArgs: unknown): ToolErrorPayload =>
    spec.mapValidationError?.(issues, rawArgs) ?? {
      code: "VALIDATION_ERROR",
      message: `${spec.name} input failed schema validation`,
      details: {
        issues: issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      },
    };

  return {
    descriptor: {
      name: spec.name,
      description: spec.description,
      inputSchema,
    },
    handler: async (args: unknown): Promise<ToolCallResult> => {
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
