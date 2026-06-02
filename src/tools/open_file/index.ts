// Original — no upstream. open_file registration via registerTool (BI-057; cross-vault rewrite
// ADR-031) — eval-composed surface that opens an existing vault file (any recognised type) as the
// focused, active file in ANY open or closed registered vault, switching focus to that vault and
// reporting the placement outcome. Descriptive tool name (ADR-010 N/A — no native `obsidian open`
// subcommand that can focus an existing tab; opening is eval-composed via app.workspace, the same
// mechanism write_note's `open` parameter uses, ADR-009). Zero new top-level error codes — Constitution
// Principle IV streak preserved (recovery is inherited from dispatchCli; no launcher import).
import { executeOpenFile, type ExecuteDeps } from "./handler.js";
import { openFileInputSchema } from "./schema.js";
import { registerTool } from "../_register.js";

import type { RegisteredTool } from "../_shared.js";

export const OPEN_FILE_TOOL_NAME = "open_file";

export const OPEN_FILE_DESCRIPTION =
  `Surface an existing vault file as the focused, visible, active file in the running Obsidian workspace — markdown notes AND any other recognised type (canvas, PDF, image, attachment). Decouples the open/hand-off affordance from \`write_note\` (which only opens what it just wrote): \`open_file\` opens a file you merely located.

**Cross-vault — opens in the vault you name, and switches focus to it.** The open lands in the \`vault\` you request whether it is the currently focused vault, an open-but-unfocused (background) vault, or a closed-but-registered vault, and Obsidian's focus moves to that vault. You do NOT need to pre-focus the vault. The previously focused vault stays open (focus just moves). A closed vault is brought up and a fully-quit app is launched automatically (inherited recovery) — a single call, no caller retry. No Obsidian setting or config is changed.

Targeting: \`vault\` (required — the vault to open in) + EXACTLY ONE of \`path\` (vault-relative path, any type) or \`file\` (bare name resolved by Obsidian's link resolver — resolves attachments too; MUST NOT contain \`[[\`/\`]]\` brackets — supply \`My Note\`, not \`[[My Note]]\`). The locator resolves IN the requested vault; a same-named file in another vault is never opened by mistake.

Options:
- \`new_tab\` (boolean, default \`false\`) — \`true\` opens a fresh tab and leaves the previously focused file open in its own tab (a new tab is created even if the file was already open). \`false\` focuses an existing tab for the file if one is open (no duplicate), else opens in the active tab.

Success shape — IDENTICAL across all file types: \`{ opened, vault, new_tab, placement }\`. \`opened\` is the resolved vault-relative path (canonicalised from whichever locator you supplied); \`vault\` is the vault the file was opened in; \`placement\` is exactly one of \`new_tab_created\` (a fresh tab was opened), \`existing_tab_reused\` (an already-open tab for the file was focused, no duplicate), or \`active_tab_used\` (the file opened into the active tab). The response carries no file-type field and no pane/leaf ids; do not branch on type.

After a successful open, the opened file becomes the active file: a subsequent \`target_mode: "active"\` tool call operates on it.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (missing \`vault\`; both/neither \`path\`/\`file\`; bracketed \`file\`; structurally-unsafe \`path\`/\`file\`; unknown field; non-boolean \`new_tab\`); \`CLI_REPORTED_ERROR\` with sub-discriminators (\`VAULT_NOT_FOUND\`/\`unknown\` — the sole hard vault error — for an unregistered name, \`FILE_NOT_FOUND\` for no such file/a folder in the requested vault, \`UNSUPPORTED_FILE_TYPE\` when Obsidian has no view for the extension — distinct from \`FILE_NOT_FOUND\`); \`CLI_NON_ZERO_EXIT\`/\`details.reason: "obsidian-not-running"\` (app down and could not be launched, e.g. \`OBSIDIAN_AUTO_LAUNCH=0\`); \`CLI_BINARY_NOT_FOUND\` (the \`obsidian\` binary is missing); \`INTERNAL_ERROR\` (malformed eval result). A registered vault that is merely closed or unfocused is NOT an error — it is a success path.

Out of scope: does NOT open files outside the vault (external paths), create or delete a vault, close/split/move/rearrange tabs (only the \`new_tab\` opt-in), edit file content, or scroll to a heading/block within the file. Call \`help({ tool_name: "open_file" })\` for worked examples and the full error roster with recovery hints.`;

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
