// Original — no upstream. registerTool factory and assertToolDocsExist aggregator: the only path from a zod schema to a published MCP tool descriptor (ADR-006, FR-001..FR-006).
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ZodError, type ZodTypeAny, type z } from "zod";

import { UpstreamError } from "../errors.js";
import { asToolError, toMcpInputSchema, type RegisteredTool, type ToolCallResult } from "./_shared.js";
import { stripSchemaDescriptions, type JsonSchemaObject } from "../help/strip-schema.js";


export type ResponseFormat = "json" | "raw";

export interface ToolSpec<TSchema extends ZodTypeAny, TDeps = undefined> {
  name: string;
  description: string;
  schema: TSchema;
  deps?: TDeps;
  responseFormat?: ResponseFormat;
  handler: (input: z.infer<TSchema>, deps: TDeps) => Promise<unknown | ToolCallResult>;
}

export function registerTool<TSchema extends ZodTypeAny, TDeps = undefined>(
  spec: ToolSpec<TSchema, TDeps>,
): RegisteredTool {
  const inputSchemaRaw = toMcpInputSchema(spec.schema);
  const inputSchema = stripSchemaDescriptions(inputSchemaRaw as JsonSchemaObject) as Record<string, unknown>;
  const responseFormat: ResponseFormat = spec.responseFormat ?? "json";

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
        if (err instanceof ZodError) {
          return asToolError({
            code: "VALIDATION_ERROR",
            message: `${spec.name} input failed schema validation`,
            details: {
              issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
            },
          });
        }
        throw err;
      }

      let result: unknown;
      try {
        result = await spec.handler(parsed, spec.deps as TDeps);
      } catch (err) {
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
