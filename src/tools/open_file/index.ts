// Original — no upstream. open_file registration via registerTool (BI-057) — eval-composed surface
// that opens an existing vault file (any recognised type) as the focused, active file. Descriptive
// tool name (ADR-010 N/A — no native `obsidian open` subcommand; opening is eval-composed via
// app.workspace, the same mechanism write_note's `open` parameter uses, ADR-009). Zero new top-level
// error codes — Constitution Principle IV streak preserved.
import { executeOpenFile, type ExecuteDeps } from "./handler.js";
import { openFileInputSchema } from "./schema.js";
import { registerTool } from "../_register.js";

import type { RegisteredTool } from "../_shared.js";

export const OPEN_FILE_TOOL_NAME = "open_file";

export const OPEN_FILE_DESCRIPTION =
  `Surface an existing vault file as the focused, visible, active file in the running Obsidian workspace — markdown notes AND any other recognised type (canvas, PDF, image, attachment). Decouples the open/hand-off affordance from \`write_note\` (which only opens what it just wrote): \`open_file\` opens a file you merely located.

**Focused-vault precondition (upstream B1).** The open ALWAYS lands in Obsidian's currently focused vault. You MUST name that focused vault in \`vault\`; if the named vault is registered but not the focused one (closed, or open in a background window), the call fails with \`CLI_REPORTED_ERROR\` + \`details.code: "VAULT_NOT_FOUND"\` + \`details.reason: "not-open"\` and opens nothing. Make the requested vault active in Obsidian, then retry.

Targeting: \`vault\` (required) + EXACTLY ONE of \`path\` (vault-relative path, any type) or \`file\` (bare name resolved by Obsidian's link resolver — resolves attachments too; MUST NOT contain \`[[\`/\`]]\` brackets — supply \`My Note\`, not \`[[My Note]]\`).

Options:
- \`new_tab\` (boolean, default \`false\`) — \`true\` opens a fresh tab and leaves the previously focused file open in its own tab (a new tab is created even if the file was already open). \`false\` focuses an existing tab for the file if one is open (no duplicate), else opens in the active tab.

Any recognised type opens via its native Obsidian viewer with an IDENTICAL success shape \`{ opened, vault, new_tab }\` — \`opened\` is the resolved vault-relative path (canonicalised from whichever locator you supplied). The response carries no file-type field; do not branch on type.

After a successful open, the opened file becomes the active file: a subsequent \`target_mode: "active"\` tool call operates on it.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (missing \`vault\`; both/neither \`path\`/\`file\`; bracketed \`file\`; structurally-unsafe \`path\`/\`file\`; unknown field; non-boolean \`new_tab\`); \`CLI_REPORTED_ERROR\` with sub-discriminators (\`VAULT_NOT_FOUND\`/\`unknown\` for an unregistered name, \`VAULT_NOT_FOUND\`/\`not-open\` for a non-focused vault, \`FILE_NOT_FOUND\` for no such file/a folder, \`UNSUPPORTED_FILE_TYPE\` when Obsidian has no view for the extension — distinct from \`FILE_NOT_FOUND\`); \`CLI_BINARY_NOT_FOUND\`/\`CLI_NON_ZERO_EXIT\` (Obsidian not running / spawn failure); \`INTERNAL_ERROR\` (malformed eval result).

Out of scope: does NOT open files outside the vault (external paths), switch or open a different vault, close/split/move/rearrange tabs (only the \`new_tab\` opt-in), edit file content, or scroll to a heading/block within the file. Call \`help({ tool_name: "open_file" })\` for worked examples and the full error roster with recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createOpenFileTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: OPEN_FILE_TOOL_NAME,
    description: OPEN_FILE_DESCRIPTION,
    schema: openFileInputSchema,
    deps,
    handler: async (input, d) => executeOpenFile(input, d),
  });
}
