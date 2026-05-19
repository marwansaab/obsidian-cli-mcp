// Original — no upstream. query_base tool registration via registerTool — wraps the upstream `obsidian base:query` subcommand to return matched rows from a named view inside an Obsidian Bases (.base) file as a structured `{ columns, rows, truncated, total_rows? }` envelope. Sixteenth typed-tool wrap; ADR-010 mechanical name from `base:query`.
import { registerTool } from "../_register.js";
import { executeQueryBase, type ExecuteDeps } from "./handler.js";
import { queryBaseInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const QUERY_BASE_TOOL_NAME = "query_base";

export const QUERY_BASE_DESCRIPTION =
  'Run a named view from an Obsidian Bases (.base) file and return its matched rows as a structured JSON envelope — the typed wrapper for the upstream `obsidian base:query` subcommand and the first member of the Bases-family cohort (siblings: `bases`, `views_base`, `create_base`). Required `base_path` (string, 1..1000 chars): vault-relative path to the .base file; MUST end with `.base` (case-insensitive on the extension). Required `view_name` (string, 1..1000 chars): exact case-sensitive match against the views declared in the file — no whitespace trim, no fuzzy. Optional `vault` (string): routes to a named vault; omitted routes to the focused vault. Response shape: `{ columns: string[], rows: Array<Record<string, unknown>>, truncated: boolean, total_rows?: number }` — the reserved key `path` always occupies `columns[0]` and is present on every row as the vault-relative source-note locator; a view-defined column named `path` is renamed to `path_view` per the reserved-key collision rule (FR-002b) and appears in `columns` at its declared index; non-`path` keys are upstream-passthrough (FR-002d) preserving native JSON types (string / number / boolean / null / nested object / ISO-date string). Empty views return success with `rows: []` AND `columns` populated (FR-006 / FR-002c). Row count capped at 1000 (FR-013); when the view matches more, `truncated: true` AND `total_rows` reports upstream\'s full match count so the caller can plan a narrowing strategy; when ≤ 1000 rows, `truncated: false` AND `total_rows` is omitted. Determinism (FR-003 / SC-003): the wrapper preserves upstream\'s emission order verbatim — the view\'s declared sort is honoured upstream; `path` ascending serves as the de-facto baseline for views with no explicit sort. Four typed failure states distinguishable via `details.code`: `BASE_NOT_FOUND` (file missing), `BASE_MALFORMED` (file present but unusable; five `details.reason` sub-states: `empty`, `invalid-yaml`, `missing-required-key`, `unsupported-schema-version`, `unknown`), `VIEW_NOT_FOUND` (file fine, view missing), `VAULT_NOT_FOUND` (unknown / closed-but-registered, `details.reason` ∈ `unknown` / `not-open`). Input validation routes via `VALIDATION_ERROR` with `details.code: INVALID_BASE_PATH` (sub-reasons `empty`, `too-long`, `wrong-extension`, `path-traversal`) or `INVALID_VIEW_NAME` (sub-reasons `empty`, `too-long`). Layer-2 path-safety on `base_path` surfaces `PATH_ESCAPES_VAULT` per ADR-009. Read-only — the tool never mutates vault contents. Call help({ tool_name: "query_base" }) for the full parameter docs, the eleven worked quickstart examples, and the complete failure-mode roster.';

export type RegisterDeps = ExecuteDeps;

export function createQueryBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: QUERY_BASE_TOOL_NAME,
    description: QUERY_BASE_DESCRIPTION,
    schema: queryBaseInputSchema,
    deps,
    handler: async (input, d) => executeQueryBase(input, d),
  });
}
