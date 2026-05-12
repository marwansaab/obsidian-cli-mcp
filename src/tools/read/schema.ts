// Original — no upstream. read input schema: re-export of the target-mode primitive (BI-029) — read adds zero tool-specific fields, so the primitive IS the schema.
import { targetModeSchema, type TargetMode } from "../../target-mode/target-mode.js";

export const readInputSchema = targetModeSchema;
export type ReadNoteInput = TargetMode;
