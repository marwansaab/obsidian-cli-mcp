// Original — no upstream. prepend tool registration per BI-045 / ADR-010 — wraps the upstream `obsidian prepend` subcommand via the executePrepend CLI-wrap handler through registerTool (ADR-006); responseFormat: "json" emits the { path, vault, bytes_written, inline } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executePrepend, type ExecuteDeps } from "./handler.js";
import { MAX_CONTENT_LENGTH, prependInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PREPEND_TOOL_NAME = "prepend";

// Single source of truth: pull the numeric cap from the same constant the
// schema enforces, so the description's documented ceiling and the schema's
// enforced ceiling cannot drift (SC-008 contract-and-implementation match).
export const PREPEND_DESCRIPTION =
  `Prepend \`content\` at the LOGICAL top of an existing markdown note in a single call. Frontmatter-aware: when the target note has a YAML frontmatter block (opening \`---\`, body, closing \`---\`), the prepended content lands IMMEDIATELY AFTER the closing \`---\` and the frontmatter is preserved BYTE-FOR-BYTE (FR-005a / FR-011); when there is no frontmatter, the content lands at byte zero. Detection is delegated to the upstream Obsidian CLI (FR-005b — no wrapper-side YAML parser). Specific mode: vault + exactly one of file (bare wikilink-form name, no \`[[…]]\` brackets — FR-001a) or path (vault-relative) + content. Active mode: just content — NO opt-in flag is required (deliberate cohort exception to write_note's overwrite:true, inherited from BI-044's additive-not-destructive safety profile — wrong-target = recoverable additive noise at the TOP of an unintended note, not destruction). Default-separator behaviour: when the supplied content does NOT end with a line break, upstream inserts a separator matching the note's existing line-ending convention (LF or CRLF preserved) between the prepended content and the existing leading body line (FR-006); when the content already ends with \`\\n\` or \`\\r\\n\`, that trailing line break IS the separator and no additional one is inserted (FR-006a — the prepend-direction symmetric of BI-044's append-direction rule); when the existing body is empty (0-byte file OR frontmatter-only-no-body), no trailing separator is inserted (FR-009). Optional inline:true fuses the new content directly onto the existing leading body line with NO wrapper-inserted separator (FR-007) — useful for prefixing a partial leading sentence. The FR-005a frontmatter-aware insertion-point rule is UNCHANGED by the inline opt-in. Content is preserved BYTE-FOR-BYTE VERBATIM (FR-010a — no trim, no normalisation). Content MUST be non-empty (FR-013) and MUST NOT exceed ${MAX_CONTENT_LENGTH} UTF-16 code units (FR-018 — Windows CreateProcess command-line cap safety; oversized payloads surface as VALIDATION_ERROR + details.code: CONTENT_TOO_LARGE; callers needing larger payloads use the full-replace write_note surface which is fs-direct and cap-free). The wrapper CLI-wraps the upstream \`obsidian prepend\` subcommand (cohort divergence from append_note's fs-direct pipeline — rationale: frontmatter-aware operations defer detection to the upstream's well-tested YAML parser; cohort precedent: set_property, read_property, properties, find_by_property). Naming-convention footnote: the tool name \`prepend\` mirrors the upstream subcommand per ADR-010; the asymmetry with sibling \`append_note\` is deliberate (mirror-name for CLI-wrappers; descriptive-name for fs-direct re-implementations). The wrapper performs a pre-flight \`obsidian file\` TSV resolver call when \`file\` is supplied so the response always carries the canonical vault-relative path per FR-003. No auto-create — call write_note for new notes. Cross-invocation contract: concurrent prepends against the same note resolve last-write-wins (FR-026); callers needing stronger guarantees coordinate externally. Typed error states surface via UpstreamError.details.code: CONTENT_EMPTY (validation), CONTENT_TOO_LARGE (validation, NEW), NOTE_NOT_FOUND, EXTERNAL_EDITOR_CONFLICT (file-locked sub-reason; Windows file-lock detection only), plus PATH_ESCAPES_VAULT, VAULT_NOT_FOUND, ERR_NO_ACTIVE_FILE. Call help({ tool_name: "prepend" }) for the full input schema, error roster, default-separator worked examples, frontmatter-aware insertion-point rule, inline opt-in interaction, and cross-invocation last-write-wins contract.`;

export type RegisterDeps = ExecuteDeps;

export function createPrependTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PREPEND_TOOL_NAME,
    description: PREPEND_DESCRIPTION,
    schema: prependInputSchema,
    deps,
    handler: async (input, d) => executePrepend(input, d),
  });
}
