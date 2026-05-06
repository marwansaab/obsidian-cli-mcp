// Original — no upstream. read_note MCP tool registration: returns a RegisteredTool wrapping executeReadNote with zod input parse + UpstreamError propagation.
import { ZodError } from "zod";

import { UpstreamError } from "../../errors.js";
import { stripSchemaDescriptions, type JsonSchemaObject } from "../../help/strip-schema.js";
import { asToolError, type RegisteredTool } from "../_shared.js";
import { executeReadNote, type ExecuteDeps } from "./handler.js";
import { readNoteInputSchema, readNoteInputJsonSchema } from "./schema.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export const READ_NOTE_TOOL_NAME = "read_note";

export const READ_NOTE_DESCRIPTION =
  'Read a note from an Obsidian vault. Returns the note\'s raw UTF-8 text as { content: <stdout> }. Specific mode: vault + exactly one of file (wikilink) or path (vault-relative). Active mode: no locator — reads the focused note. Call help({ tool_name: "read_note" }) for full parameter docs and the error-code roster.';

export interface RegisterDeps extends Omit<ExecuteDeps, never> {
  logger: Logger;
  queue: Queue;
}

export function registerReadNoteTool(deps: RegisterDeps): RegisteredTool {
  return {
    descriptor: {
      name: READ_NOTE_TOOL_NAME,
      description: READ_NOTE_DESCRIPTION,
      inputSchema: stripSchemaDescriptions(readNoteInputJsonSchema as JsonSchemaObject) as Record<string, unknown>,
    },
    handler: async (args) => {
      let parsed: ReturnType<typeof readNoteInputSchema.parse>;
      try {
        parsed = readNoteInputSchema.parse(args);
      } catch (err: unknown) {
        if (err instanceof ZodError) {
          return asToolError({
            code: "VALIDATION_ERROR",
            message: "read_note input failed schema validation",
            details: {
              issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
            },
          });
        }
        throw err;
      }
      try {
        const result = await executeReadNote(parsed, deps);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ content: result.content }) }],
        };
      } catch (err: unknown) {
        if (err instanceof UpstreamError) {
          return asToolError({
            code: err.code,
            message: err.message,
            details: err.details,
          });
        }
        throw err;
      }
    },
  };
}
