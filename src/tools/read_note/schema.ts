// Original — no upstream. read_note input schema: re-export of the target-mode primitive (BI-029) — read_note adds zero tool-specific fields, so the primitive IS the schema. JSON Schema is the primitive's companion export, which goes through the envelope helper to satisfy MCP `Tool.inputSchema` (feature 007 / FR-002).
import { targetModeSchema, targetModeJsonSchema, type TargetMode } from "../../target-mode/target-mode.js";

export const readNoteInputSchema = targetModeSchema;
export type ReadNoteInput = TargetMode;
export const readNoteInputJsonSchema = targetModeJsonSchema;
