// Original — no upstream. get_active_file registration via registerTool (BI-063) — the read counterpart of
// open_file. Eval-composed surface (ADR-010 N/A — no native `obsidian active-file` subcommand; the active
// file is read from app.workspace.getActiveFile() via `obsidian eval`). Reports the active file of the
// focused vault (target_mode:"active") or a named vault (target_mode:"specific", routed cross-vault),
// returning { active: { path, name, basename, extension } | null }. Zero new top-level error codes —
// Constitution Principle IV streak preserved (recovery inherited from dispatchCli; no launcher import).
import { executeGetActiveFile, type ExecuteDeps } from "./handler.js";
import { getActiveFileInputSchema } from "./schema.js";
import { registerTool } from "../_register.js";

import type { RegisteredTool } from "../_shared.js";

export const GET_ACTIVE_FILE_TOOL_NAME = "get_active_file";

export const GET_ACTIVE_FILE_DESCRIPTION =
  `Report the active file — the note Obsidian currently has focused — so an agent can confirm what is active before acting on it. The read counterpart of \`open_file\`: where \`open_file\` makes a file active, \`get_active_file\` tells you which file is active right now. Makes implicit focus state explicit (the discovery remedy for the ADR-003 implicit-active-state risk).

Targeting — two modes:
- \`target_mode: "active"\` (no \`vault\`) — the FOCUSED vault's active file.
- \`target_mode: "specific"\` + \`vault\` — a NAMED vault's active file, read CROSS-VAULT: the answer reflects that vault's active file even when it is open-but-unfocused (a background window). You do NOT pre-focus the vault, and focus is NOT changed (this is a pure read). No \`file\`/\`path\` is accepted in either mode — the active file IS the implicit target, there is no locator.

Success shape — \`{ active: { path, name, basename, extension } | null }\`:
- \`path\` — vault-relative path; directly reusable as a \`path\` locator for a follow-up operation against the same file.
- \`name\` — file name including extension; \`name === basename + extension\`.
- \`basename\` — name without the final extension (\`note.draft.md\` → \`note.draft\`).
- \`extension\` — the final dot-delimited segment without the dot, or \`""\` when the name has no dot (then \`name === basename\`). Non-ASCII characters are returned raw (no normalization).

**No active file is a SUCCESS, not an error.** When nothing is active (empty workspace, all panes closed, or a non-file view in front) the result is \`{ active: null }\` — a successful result you branch on via \`active === null\`. This tool NEVER raises \`ERR_NO_ACTIVE_FILE\` (a deliberate divergence from the rest of the eval cohort, whose tools treat no-active-file as a usage error).

Timing: the answer is a point-in-time snapshot of the active file at lookup time — it may be stale by the time a follow-up action runs (no locking/pinning). If an app-down launch fired as inherited recovery, the relaunched vault's active file may differ (null / last-open) from the pre-down state — the answer reflects post-launch focus.

Response is file-only: no \`vault\` / \`target_mode\` echo, no pane / split / leaf info, no cursor / heading / block position.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (missing \`vault\` in specific mode; \`vault\` supplied in active mode; any \`file\`/\`path\` locator; unknown field); \`CLI_REPORTED_ERROR\` with \`details.code: "VAULT_NOT_FOUND"\` / \`reason: "unknown"\` (an unregistered \`vault\` — never \`{ active: null }\`, never another vault's data) or a malformed eval response; \`CLI_NON_ZERO_EXIT\` / \`details.reason: "obsidian-not-running"\` (app down and could not be launched, e.g. \`OBSIDIAN_AUTO_LAUNCH=0\`); \`CLI_BINARY_NOT_FOUND\` (the \`obsidian\` binary is missing). A registered vault that is merely closed or unfocused is NOT an error — it is a success path (inherited recovery).

Out of scope: never changes which file is active (pure read); reports no pane/split/leaf or cursor/heading/block position; does not report a non-file view as the active file. Call \`help({ tool_name: "get_active_file" })\` for worked examples and the full error roster with recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createGetActiveFileTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: GET_ACTIVE_FILE_TOOL_NAME,
    description: GET_ACTIVE_FILE_DESCRIPTION,
    schema: getActiveFileInputSchema,
    deps,
    handler: async (input, d) => executeGetActiveFile(input, d),
  });
}
