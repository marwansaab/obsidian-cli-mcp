// Original — no upstream. find_and_replace registration via registerTool with a mapValidationError hook that maps Zod issues into VALIDATION_ERROR envelopes carrying details.code (INVALID_PATTERN / INVALID_REPLACEMENT / INVALID_SUBFOLDER) + details.reason (empty / too-long / regex-syntax / path-traversal / not-found) per ADR-015. Zero new top-level error codes — Constitution Principle IV streak preserved.
import { type ZodIssue } from "zod";

import { executeFindAndReplace, type ExecuteDeps } from "./handler.js";
import { findAndReplaceInputSchema } from "./schema.js";
import { registerTool } from "../_register.js";
import { type RegisteredTool, type ToolErrorPayload } from "../_shared.js";

export const FIND_AND_REPLACE_TOOL_NAME = "find_and_replace";

export const FIND_AND_REPLACE_DESCRIPTION =
  `Find-and-replace with **preview-then-commit** semantics. Scan a vault, a sub-folder, or a single note for a literal-or-regex pattern; default returns a preview, \`commit: true\` rewrites the matches on disk.

**SCOPE — default is vault-wide; narrow it deliberately.** With no scope field this tool replaces matches across EVERY eligible \`.md\` file in the vault (or the named \`subfolder\`, recursively). To confine a change to ONE note, use a single-note scope (below) so the SCOPE — not a globally-unique pattern — bounds the blast radius. Agents have corrupted unintended files by committing wide-pattern replacements; ALWAYS preview first and inspect \`affected_notes\` before \`commit: true\`.

Required \`pattern\` (1..1000 UTF-16 code units). Required \`replacement\` (0..1000 chars; empty = deletion).

Optional \`mode: "literal" | "regex"\` (default \`"literal"\`). Regex mode uses ECMAScript (Node RegExp, V8) with \`$1\`/\`$&\`/\`$$\` interpolation in \`replacement\`. Literal mode inserts \`replacement\` verbatim — no metacharacter interpretation.

Optional \`case_insensitive\` (boolean, default false). Optional \`include_code_blocks\` (default false — fenced code blocks are SKIPPED). Optional \`include_html_comments\` (default false — \`<!-- ... -->\` is SKIPPED). Optional \`commit\` (boolean, default false — preview-only). Optional \`vault\` (string; absent routes to focused vault).

**Scope (choose at most one):**
- \`subfolder\` (vault-relative path) — confine to every eligible note under that folder, recursively. Path-traversal rejected with \`INVALID_SUBFOLDER\`/\`path-traversal\`; missing folder rejected with \`INVALID_SUBFOLDER\`/\`not-found\`.
- \`path\` (vault-relative path to one note, e.g. \`Projects/Alpha.md\`) — confine to exactly that note.
- \`file\` (bare note name, e.g. \`Alpha\`) — confine to exactly that note, resolved by Obsidian's shortest-unique-name (like a wikilink). Supply the bare name, NOT the \`[[…]]\` bracket form (rejected with a wikilink-bracket \`VALIDATION_ERROR\`).
- \`active_note: true\` — confine to the note currently open in the editor; supply no path. No note open → \`ERR_NO_ACTIVE_FILE\`.

A single-note scope (\`path\`/\`file\`/\`active_note\`) touches at most one note; a preview affects ≤ 1 note (early confirmation), and a zero-match named scope returns an empty success (not an error). Scopes are mutually exclusive — \`file\`+\`path\`, any single-note + \`subfolder\`, and \`active_note\` + (\`file\`/\`path\`/\`subfolder\`/\`vault\`) are rejected with \`VALIDATION_ERROR\` + \`details.code: "SCOPE_CONFLICT"\` before any note is read. \`vault\` is permitted with a named \`file\`/\`path\` (it selects the note's vault). A named target that does not exist → \`INVALID_NOTE\`/\`not-found\`; one that resolves to a non-\`.md\` or dotfolder note → \`INVALID_NOTE\`/\`not-eligible\`. Omit all scope fields for the byte-stable vault-wide default.

Response is a discriminated union on \`mode\`:
- **Preview**: \`{ mode: "preview", affected_notes: [{ path, occurrence_count, occurrences: [{ line_number, full_line, matched_substring, replacement_substring }] }], total_occurrences }\`. Notes path-ascending, occurrences (line, offset)-ascending.
- **Commit**: \`{ mode: "commit", changed_notes, total_occurrences_replaced, partial }\` plus \`failing_note_locator\` when \`partial: true\`. Per-note atomic writes (temp + rename).

**Guards**:
- **Occurrence cap**: > \`OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES\` (default 500) → \`VALIDATION_ERROR\` with \`details.code: "OCCURRENCE_COUNT_EXCEEDED"\`. Recovery: narrow the scope with \`subfolder\` or a tighter pattern.
- **Drift detection**: commit re-scans before writing; if the count differs from the preview → \`VALIDATION_ERROR\` with \`details.code: "OCCURRENCE_COUNT_DRIFT"\`. Recovery: re-run preview to pick up the new vault state (the wrapper refuses to commit a stale preview).

Eligible files: \`.md\` extension (case-insensitive) AND every path segment NOT starting with \`.\` (skips \`.obsidian/\`, \`.trash/\`, etc.).

Line-scoped only — \`\\n\` in \`pattern\` does NOT match cross-line; line endings preserved byte-for-byte. Zero-width regex matches (\`a*\`, \`^\`, \`$\`, \`\\b\`, lookarounds) are skipped. Frontmatter / indented code blocks / inline code spans are treated as PROSE.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` with sub-discriminators (\`INVALID_PATTERN\`/\`empty\`|\`too-long\`|\`regex-syntax\`; \`INVALID_REPLACEMENT\`; \`INVALID_SUBFOLDER\`/\`path-traversal\`|\`not-found\`; \`OCCURRENCE_COUNT_EXCEEDED\`; \`OCCURRENCE_COUNT_DRIFT\`); \`CLI_REPORTED_ERROR\` (\`VAULT_NOT_FOUND\`/\`unknown\`|\`not-open\`); \`PATH_ESCAPES_VAULT\` (canonical escape, security event logged); \`FS_WRITE_FAILED\` (\`details.reason: "read"\` no-op, OR \`"write"\` with \`partial: true\` + \`failing_note_locator\` + \`changed_notes\`).

Call \`help({ tool_name: "find_and_replace" })\` for worked examples (literal preview, regex preview, commit, error envelopes for each discriminator) and the full failure roster with recovery hints.`;

export type RegisterDeps = ExecuteDeps;

function mapZodIssuesToToolError(issues: ZodIssue[]): ToolErrorPayload {
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
    if (path0 === "subfolder") {
      if (issue.code === "custom" && params?.subReason === "path-traversal") {
        return {
          code: "VALIDATION_ERROR",
          message: "subfolder is not structurally safe",
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
    description: FIND_AND_REPLACE_DESCRIPTION,
    schema: findAndReplaceInputSchema,
    deps,
    handler: executeFindAndReplace,
    mapValidationError: mapZodIssuesToToolError,
  });
}
