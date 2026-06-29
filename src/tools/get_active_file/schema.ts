// Original — no upstream. get_active_file input/output schemas (BI-063). Input reuses the
// shared folder-scoped target-mode refinement (vault required in specific, forbidden in active; file/path
// forbidden in BOTH modes — the active file is the implicit target, there is no locator) — byte-pattern
// parity with the `files` tool. Output { active: FileInfo | null } where null is a SUCCESS (no active
// file), not an error (research D3 / FR-005). All shapes are .strict() — the Zod schema is the single
// source of truth (z.infer downstream; Principle III). No vault/target_mode echo (FR-015); file-only —
// no pane/leaf/cursor fields (FR-017/018), enforced structurally by fileInfoSchema.strict().
import { z } from "zod";

import {
  applyTargetModeRefinementForFolderScoped,
  targetModeBaseSchema,
} from "../../target-mode/target-mode.js";

// Input: the shared folder-scoped refinement applied to the base target-mode object. Because
// targetModeBaseSchema declares `file`/`path` as optional, the emitted MCP inputSchema lists them
// even though the refinement always rejects them — identical published-but-rejected shape to the
// shipped `files`/`paths` tools (accepted cohort convention; data-model I1 / spec FR-009).
export const getActiveFileInputSchema =
  applyTargetModeRefinementForFolderScoped(targetModeBaseSchema);
export type GetActiveFileInput = z.infer<typeof getActiveFileInputSchema>;

// The four Obsidian-native TFile identity fields (FR-001..004). `name` = `basename` + `extension`;
// `extension` is "" when the name has no dot (FR-003); characters are returned raw, no normalization
// (FR-004). No re-parser — the substrate is the source of truth for the basename/extension split.
export const fileInfoSchema = z
  .object({
    path: z.string(),
    name: z.string(),
    basename: z.string(),
    extension: z.string(),
  })
  .strict();

// Output AND eval-envelope decode target — one strict shape serves both. A present active file, or null
// when nothing is active (FR-005/006), distinguishable on `active === null`. .strict() rejects any extra
// field (pane/split/leaf/cursor) — the structural guarantee for FR-017/018.
//
// There is deliberately NO separate ok-wrapped envelope schema. getActiveFile() returns a TFile or null and
// cannot fail at the eval level, so — unlike the discriminated-union cohort (backlinks/links/open_file,
// which carry ok:true|false arms for real in-eval failures like FILE_NOT_FOUND / NOT_MARKDOWN) — there is
// no ok:false case to discriminate. The frozen template (_template.ts) emits this exact `{ active }` shape,
// and the handler's decodeEvalEnvelope validates the eval stdout straight into it; a malformed/unparseable
// body is caught there and classified CLI_REPORTED_ERROR.
export const getActiveFileOutputSchema = z
  .object({ active: fileInfoSchema.nullable() })
  .strict();
export type GetActiveFileOutput = z.infer<typeof getActiveFileOutputSchema>;
