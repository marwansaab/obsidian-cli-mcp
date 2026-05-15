// Original — no upstream. tree tool registration via registerTool — recursive subtree enumeration primitive returning a typed { count, paths } envelope with trailing-slash folder entries (FR-028 / SC-022). Fifteenth typed-tool wrap and the project's first recursive subtree-enumeration primitive. Tool name `tree` is a single-word original choice — ADR-010 N/A because the wrapper composes via the eval subcommand (NOT a single named native subcommand); the CLI has `files` and `folders` but no `tree`/`walk`/`find` per live-probe F-help.
import { registerTool } from "../_register.js";
import { executeTree, type ExecuteDeps } from "./handler.js";
import { treeInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const TREE_TOOL_NAME = "tree";

export const TREE_DESCRIPTION =
  'Recursively list every file and folder in a vault or sub-folder under it (returns { count, paths: string[] }). Folder entries in `paths` end with "/"; file entries do not — the trailing-character is the in-band file-vs-folder signal (FR-028). Fifteenth typed-tool wrap and the project\'s first recursive subtree-enumeration primitive. STANDARD target_mode discriminator with folder-scoped adaptation (forbids file/path locators in both modes; accepts optional folder). Required target_mode ("specific" or "active"). In specific mode: required vault (string). In active mode: vault forbidden — resolves to the focused vault at execution time. Optional folder (string, min 1 char; trailing slash silently normalised away; when omitted, traversal starts at the vault root). Optional depth (positive integer; when omitted, traversal is unbounded; depth=1 returns only immediate children; depth>actual-height silently accepted). Optional ext (string, min 1 char; leading-dot and bare forms equivalent — ".md" and "md" both match .md files; when set, folder entries are EXCLUDED from `paths` and only matching files appear). Optional total:true returns { count, paths: [] } — the count is invariant across both modes for the same filtered subtree. Paths sorted byte-asc on the final trailing-slash-rendered form. Dotfile filter applies uniformly: any path segment starting with "." excludes that file or folder (and folder children) from output. Missing folder → CLI_REPORTED_ERROR(details.code:"FOLDER_NOT_FOUND"); folder path resolves to a file → CLI_REPORTED_ERROR(details.code:"NOT_A_FOLDER"); these distinguish missing/not-a-folder from empty-folder (which returns { count: 0, paths: [] } — never an error) — a deliberate DEPARTURE from BI-019\'s `files` tool which conflates the three. Closed-but-registered vault detected via the shared `_eval-vault-closed-detection` module → CLI_REPORTED_ERROR(details.code:"VAULT_NOT_FOUND", details.reason:"not-open"); unknown vault → CLI_REPORTED_ERROR(details.code:"VAULT_NOT_FOUND") via the cli-adapter\'s 011-R5 inheritance. Active mode with no focused vault → ERR_NO_ACTIVE_FILE (dispatch-layer classifier). Pathological-size traversals exceeding the 10 MiB output cap surface as CLI_NON_ZERO_EXIT — callers fall back to total:true (single integer) or depth:1 (single-level listing). Call help({ tool_name: "tree" }) for the full parameter docs, four worked examples, the documented inherited limitations (multi-vault basename ambiguity; platform-dependent case-sensitivity; symlinks/permission-denied pass-through), and the six-entry failure roster.';

export type RegisterDeps = ExecuteDeps;

export function createTreeTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: TREE_TOOL_NAME,
    description: TREE_DESCRIPTION,
    schema: treeInputSchema,
    deps,
    handler: async (input, d) => executeTree(input, d),
  });
}
