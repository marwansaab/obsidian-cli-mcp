// Original — no upstream. read_note input schema: re-export of the target-mode primitive (BI-029) — read_note adds zero tool-specific fields, so the primitive IS the schema.
import { zodToJsonSchema } from "zod-to-json-schema";

import { targetModeSchema, type TargetMode } from "../../target-mode/target-mode.js";

export const readNoteInputSchema = targetModeSchema;
export type ReadNoteInput = TargetMode;
export const readNoteInputJsonSchema = zodToJsonSchema(readNoteInputSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;
