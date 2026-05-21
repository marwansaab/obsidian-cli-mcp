// Original — no upstream. patch_heading tool registration per BI-040 / ADR-009 — wraps the executePatchHeading direct-fs-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, heading_path, mode, bytes_written } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executePatchHeading, type ExecuteDeps } from "./handler.js";
import { patchHeadingInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PATCH_HEADING_TOOL_NAME = "patch_heading";

export const PATCH_HEADING_DESCRIPTION =
  'Surgically rewrite the body under a named heading inside a markdown note, addressed by its full hierarchical path through the heading hierarchy. Three placement modes: append (insert at end of the heading\'s full reach, before the next equal-or-higher-rank heading), prepend (insert immediately after the heading marker line), replace (swap the direct body, preserving the marker and child subtrees). Specific mode: vault + exactly one of file/path + heading_path + mode + content. Active mode: heading_path + mode + content (the wrapper resolves the focused note). The heading_path locator uses `#` as the segment separator (cohort parity with Obsidian wikilink anchors); minimum two segments — top-level headings are out of scope. First match wins on duplicate sibling headings; headings whose literal text contains `#` are permanently unreachable through this tool. Empty content is rejected for append/prepend and accepted for replace (legitimate "clear the body" operation). Five typed error states surface via UpstreamError.details.code: HEADING_NOT_FOUND, HEADING_RACE, EXTERNAL_EDITOR_CONFLICT, INVALID_HEADING_PATH, EMPTY_CONTENT. Call help({ tool_name: "patch_heading" }) for the full input schema, error roster, body-shape gotchas, and worked-example quickstart snippets.';

export type RegisterDeps = ExecuteDeps;

export function createPatchHeadingTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATCH_HEADING_TOOL_NAME,
    description: PATCH_HEADING_DESCRIPTION,
    schema: patchHeadingInputSchema,
    deps,
    handler: async (input, d) => executePatchHeading(input, d),
  });
}
