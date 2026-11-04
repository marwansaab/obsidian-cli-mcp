// Original — no upstream. find_and_replace registration via registerTool (BI-0174: description kept within 4,096 characters, detail on the help page) with a mapValidationError hook that maps Zod issues into VALIDATION_ERROR envelopes carrying details.code (INVALID_PATTERN / INVALID_REPLACEMENT / INVALID_SUBFOLDER) + details.reason (empty / too-long / regex-syntax / path-traversal / not-found) per ADR-015. Zero new top-level error codes — Constitution Principle IV streak preserved.
import { type z } from "zod";

import { type ExecuteDeps, executeFindAndReplace, FIND_AND_REPLACE_SUPPORTED } from "./handler.js";
import { FIND_AND_REPLACE_RENAMES, findAndReplaceInputSchema, findAndReplaceOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { deprecatedNamesNote, withDeprecatedParameters } from "../_deprecated-params.js";
import { registerTool } from "../_register.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool, type ToolErrorPayload } from "../_shared.js";

export const FIND_AND_REPLACE_TOOL_NAME = "find_and_replace";

export const FIND_AND_REPLACE_DESCRIPTION =
  `Find-and-replace with **preview-then-commit** semantics. Scan a vault, a sub-folder, or a single note for a literal-or-regex pattern; default returns a preview, \`commit: true\` rewrites the matches on disk. ${describeSupport(FIND_AND_REPLACE_SUPPORTED)}

**SCOPE — default is vault-wide; narrow it deliberately.** With no scope field this tool replaces matches across EVERY eligible \`.md\` file in the vault (or the named \`folder\`, recursively). To confine a change to ONE note, use a single-note scope (below) so the SCOPE — not a globally-unique pattern — bounds the blast radius. Agents have corrupted unintended files by committing wide-pattern replacements.

Required \`pattern\` (1..1000 UTF-16 code units). Required \`replacement\` (0..1000 chars; empty = deletion).

Optional \`mode: "literal" | "regex"\` (default \`"literal"\`). Regex mode uses ECMAScript with \`$1\`/\`$&\`/\`$$\` interpolation in \`replacement\`. Literal mode inserts \`replacement\` verbatim.

Optional \`case_sensitive\` (boolean, default true). Optional \`include_code_blocks\` / \`include_html_comments\` (default false: fenced code and \`<!-- ... -->\` are SKIPPED), \`commit\` (default false: preview only), \`vault\` (absent: the focused vault).

**Scope (choose at most one):**
- \`folder\` (vault-relative path) — confine to every eligible note under that folder, recursively. A traversal shape or a missing folder is rejected with \`INVALID_SUBFOLDER\`/\`path-traversal\` or \`not-found\`.
- \`path\` (vault-relative path to one note, e.g. \`Projects/Alpha.md\`) — confine to exactly that note.
- \`file\` (bare note name, e.g. \`Alpha\`) — confine to exactly that note, resolved like a wikilink; the \`[[…]]\` bracket form is rejected.
- \`active_note: true\` — confine to the note currently open in the editor; supply no path. No note open → \`ERR_NO_ACTIVE_FILE\`.

A single-note scope (\`path\`/\`file\`/\`active_note\`) touches at most one note, and a zero-match named scope returns an empty success (not an error). Scopes are mutually exclusive — \`file\`+\`path\`, any single-note + \`folder\`, and \`active_note\` + (\`file\`/\`path\`/\`folder\`/\`vault\`) are rejected with \`VALIDATION_ERROR\` + \`details.code: "SCOPE_CONFLICT"\` before any note is read. \`vault\` may accompany a named \`file\`/\`path\`. A named target that does not exist → \`INVALID_NOTE\`/\`not-found\`; one that resolves to a non-\`.md\` or dotfolder note → \`INVALID_NOTE\`/\`not-eligible\`.

Response is a discriminated union on \`mode\`: preview \`{ mode: "preview", affected_notes: [{ path, occurrence_count, occurrences }], total_occurrences }\` (notes by path; each occurrence gives its line and the matched and replacement text), or commit \`{ mode: "commit", changed_notes, total_occurrences_replaced, partial }\` plus \`failing_note_locator\` when \`partial: true\` (per-note atomic writes).

**Guards**: more than \`OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES\` (default 500) matches → \`OCCURRENCE_COUNT_EXCEEDED\` (narrow the scope); a commit re-scans first, and a count that differs from the preview → \`OCCURRENCE_COUNT_DRIFT\` (preview again).

Eligible files: \`.md\` (any case) with no path segment starting with \`.\` (skips \`.obsidian/\`, \`.trash/\`).

Line-scoped: \`\\n\` in \`pattern\` never matches across lines; line endings are kept byte-for-byte. Zero-width regex matches are skipped. Frontmatter, indented code and inline code count as prose.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` with sub-discriminators (\`INVALID_PATTERN\`/\`empty\`|\`too-long\`|\`regex-syntax\`; \`INVALID_REPLACEMENT\`; \`INVALID_SUBFOLDER\`/\`path-traversal\`|\`not-found\`; \`OCCURRENCE_COUNT_EXCEEDED\`; \`OCCURRENCE_COUNT_DRIFT\`); \`CLI_REPORTED_ERROR\` (\`VAULT_NOT_FOUND\`/\`unknown\`); \`PATH_ESCAPES_VAULT\` (symlink escape, logged); \`FS_WRITE_FAILED\` (\`details.reason: "read"\`: nothing written; \`"write"\`: \`partial: true\` with \`failing_note_locator\` and \`changed_notes\`).

${deprecatedNamesNote(FIND_AND_REPLACE_RENAMES)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

function mapZodIssuesToToolError(issues: z.core.$ZodIssue[]): ToolErrorPayload {
  const mappedIssues = issues.map((i) => ({
    path: i.path,
    message: i.message,
    code: i.code,
  }));
  for (const issue of issues) {
    const path0 = issue.path[0];
    const params = (issue as { params?: { subCode?: string; subReason?: string } }).params;
    // Scope mutual-exclusivity (066-file-scope) — cross-field custom issue with
    // an empty path; matched on subCode regardless of path[0].
    if (issue.code === "custom" && params?.subCode === "SCOPE_CONFLICT") {
      return {
        code: "VALIDATION_ERROR",
        message: issue.message,
        details: {
          code: "SCOPE_CONFLICT",
          reason: params.subReason,
          issues: mappedIssues,
        },
      };
    }
    // Structurally-unsafe single-note locator → INVALID_NOTE/path-traversal
    // (parity with INVALID_SUBFOLDER/path-traversal). The `[[…]]` reject on
    // `file` carries no subReason and falls through to the generic channel.
    if (
      (path0 === "file" || path0 === "path") &&
      issue.code === "custom" &&
      params?.subReason === "path-traversal"
    ) {
      return {
        code: "VALIDATION_ERROR",
        message: `${String(path0)} is not structurally safe`,
        details: {
          code: "INVALID_NOTE",
          reason: "path-traversal",
          issues: mappedIssues,
        },
      };
    }
    if (path0 === "pattern") {
      if (issue.code === "too_small") {
        return {
          code: "VALIDATION_ERROR",
          message: "pattern must not be empty",
          details: {
            code: "INVALID_PATTERN",
            reason: "empty",
            issues: mappedIssues,
          },
        };
      }
      if (issue.code === "too_big") {
        return {
          code: "VALIDATION_ERROR",
          message: "pattern exceeds maximum length of 1000 UTF-16 code units",
          details: {
            code: "INVALID_PATTERN",
            reason: "too-long",
            issues: mappedIssues,
          },
        };
      }
      if (issue.code === "custom" && params?.subReason === "regex-syntax") {
        return {
          code: "VALIDATION_ERROR",
          message: "pattern is not a valid ECMAScript regular expression",
          details: {
            code: "INVALID_PATTERN",
            reason: "regex-syntax",
            issues: mappedIssues,
          },
        };
      }
    }
    if (path0 === "replacement" && issue.code === "too_big") {
      return {
        code: "VALIDATION_ERROR",
        message: "replacement exceeds maximum length of 1000 UTF-16 code units",
        details: {
          code: "INVALID_REPLACEMENT",
          issues: mappedIssues,
        },
      };
    }
    if (path0 === "folder") {
      if (issue.code === "custom" && params?.subReason === "path-traversal") {
        return {
          code: "VALIDATION_ERROR",
          message: "folder is not structurally safe",
          details: {
            code: "INVALID_SUBFOLDER",
            reason: "path-traversal",
            issues: mappedIssues,
          },
        };
      }
    }
  }
  return {
    code: "VALIDATION_ERROR",
    message: `${FIND_AND_REPLACE_TOOL_NAME} input failed schema validation`,
    details: { issues: mappedIssues },
  };
}

export function createFindAndReplaceTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: FIND_AND_REPLACE_TOOL_NAME,
    title: "Find And Replace",
    annotations: DESTRUCTIVE_HINTS,
    description: FIND_AND_REPLACE_DESCRIPTION,
    schema: findAndReplaceInputSchema,
    outputSchema: findAndReplaceOutputSchema,
    deps,
    handler: async (input, d, call) =>
      withDeprecatedParameters(await executeFindAndReplace(input, d, call), input.deprecated_parameters),
    mapValidationError: mapZodIssuesToToolError,
  });
}
