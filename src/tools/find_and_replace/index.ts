// Original — no upstream. find_and_replace registration — custom RegisteredTool builder (not registerTool) so the handler can map Zod issues into VALIDATION_ERROR envelopes carrying details.code (INVALID_PATTERN / INVALID_REPLACEMENT / INVALID_SUBFOLDER) + details.reason (empty / too-long / regex-syntax / path-traversal) per ADR-015. Twelfth typed-tool wrap; zero new top-level error codes — Constitution Principle IV streak preserved.
import { ZodError, type ZodIssue } from "zod";

import { executeFindAndReplace, type ExecuteDeps } from "./handler.js";
import { findAndReplaceInputSchema } from "./schema.js";
import { UpstreamError } from "../../errors.js";
import { stripSchemaDescriptions } from "../../help/strip-schema.js";
import {
  asToolError,
  toMcpInputSchema,
  type JsonSchemaObject,
  type RegisteredTool,
} from "../_shared.js";

export const FIND_AND_REPLACE_TOOL_NAME = "find_and_replace";

export const FIND_AND_REPLACE_DESCRIPTION =
  'Scan every Markdown note in a vault (or under a named sub-folder) for a literal-string-or-regex pattern and either preview the replacement (default) or commit the rewrite on disk (when `commit: true`). Twelfth typed-tool wrap; the project\'s first preview-then-commit surface. Required `pattern` (1..1000 UTF-16 code units); required `replacement` (0..1000 UTF-16 code units; empty = deletion). Optional `mode: "literal" | "regex"` (default `"literal"`). Regex mode uses ECMAScript (Node `RegExp`, V8) — `$1`/`$&`/`$$` interpolation in `replacement`; literal mode inserts `replacement` verbatim with no metacharacter interpretation. Optional `case_insensitive: boolean` (default `false`, parity with sibling `pattern_search` BI-037). Optional `subfolder` (vault-relative, structurally validated at the input boundary AND canonicalised at runtime per ADR-009 two-layer path safety). Optional `include_code_blocks` (default `false`): when `false`, occurrences inside paired fenced code blocks (` ``` ` / `~~~`) are SKIPPED. Optional `include_html_comments` (default `false`): when `false`, occurrences inside `<!-- … -->` are SKIPPED. The two opt-ins are independent. Optional `commit: boolean` (default `false`); when omitted or `false`, NO note on disk is mutated and the response is the preview branch. Optional `vault: string` for named-vault routing; absent routes to the focused vault (parity with `pattern_search`). Response is a discriminated union keyed on `mode: "preview" | "commit"`. Preview branch: `{ mode: "preview", affected_notes: [{ path, occurrence_count, occurrences: [{ line_number, full_line, matched_substring, replacement_substring }] }], total_occurrences }` — notes path-ascending, occurrences `(line_number, offset)`-ascending. Commit branch: `{ mode: "commit", changed_notes, total_occurrences_replaced, partial }` plus optional `failing_note_locator` when `partial: true`. Per-note atomic writes via temp+rename through the injected `Queue` (FR-024). Eligible files: `.md` extension (case-insensitive) AND every path segment must NOT start with `.` (skips `.obsidian/`, `.trash/`, etc.). Drift detection: commit re-runs the scan; total-count mismatch surfaces `VALIDATION_ERROR` + `details.code: "OCCURRENCE_COUNT_DRIFT"`. Configured-bound guard: total occurrences > `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES` (default 500) surfaces `VALIDATION_ERROR` + `details.code: "OCCURRENCE_COUNT_EXCEEDED"`. Validation errors: empty pattern → `details.code: "INVALID_PATTERN"` + `details.reason: "empty"`; over-cap pattern → `…/too-long`; invalid regex (regex mode) → `…/regex-syntax`; over-cap replacement → `details.code: "INVALID_REPLACEMENT"`; path-traversal-shaped subfolder → `details.code: "INVALID_SUBFOLDER"` + `details.reason: "path-traversal"`; unknown subfolder → `details.code: "INVALID_SUBFOLDER"` (existence). Vault errors: unknown vault → `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"`; closed vault → `…/not-open`. Path-safety: canonical-level escape → `PATH_ESCAPES_VAULT` + `pathEscapeAttempt` security event (ADR-009). FS failures: read errors during scan → `FS_WRITE_FAILED` + `details.reason: "read"` (no partial flag; nothing written); write errors during commit → `FS_WRITE_FAILED` + `details.reason: "write"` + `details.partial: true` + `details.failing_note_locator` + `details.changed_notes` + `details.total_occurrences_replaced`. Line-scoped only (FR-016) — `\\n` in `pattern` does not match cross-line; line endings preserved byte-for-byte. Zero-width regex matches (`a*`, `^`, `$`, `\\b`, lookarounds) are skipped (BI-037 parity). Frontmatter is treated as PROSE — `---`-delimited YAML at the top of a note is NOT a separately-skipped region. Indented code blocks are treated as prose; inline code spans (`` `…` ``) are treated as prose. Strongly prefer issuing a preview first; agents that commit without previewing risk over-broad replacements that the bound + drift guards may not catch. Call `help({ tool_name: "find_and_replace" })` for the full parameter docs, worked examples, and the thirteen-discriminator error envelope cohort.';

export type RegisterDeps = ExecuteDeps;

function mapZodIssuesToToolError(issues: ZodIssue[]): {
  code: string;
  message: string;
  details: Record<string, unknown>;
} {
  const mappedIssues = issues.map((i) => ({
    path: i.path,
    message: i.message,
    code: i.code,
  }));
  for (const issue of issues) {
    const path0 = issue.path[0];
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
      const params = (issue as { params?: { subReason?: string } }).params;
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
      const params = (issue as { params?: { subReason?: string } }).params;
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
  const inputSchemaRaw = toMcpInputSchema(findAndReplaceInputSchema);
  const inputSchema = stripSchemaDescriptions(
    inputSchemaRaw as JsonSchemaObject,
  ) as Record<string, unknown>;

  return {
    descriptor: {
      name: FIND_AND_REPLACE_TOOL_NAME,
      description: FIND_AND_REPLACE_DESCRIPTION,
      inputSchema,
    },
    handler: async (args: unknown) => {
      const parsed = findAndReplaceInputSchema.safeParse(args);
      if (!parsed.success) {
        return asToolError(mapZodIssuesToToolError(parsed.error.issues));
      }
      try {
        const result = await executeFindAndReplace(parsed.data, deps);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result) },
          ],
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return asToolError(mapZodIssuesToToolError(err.issues));
        }
        if (err instanceof UpstreamError) {
          return asToolError({
            code: err.code,
            message: err.message,
            details: err.details,
          });
        }
        throw err;
      }
    },
  };
}
