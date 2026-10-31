// Original — no upstream. find_and_replace input + output schemas — strict object input (pattern/replacement/mode/case_sensitive/folder/include_code_blocks/include_html_comments/commit/vault + the single-note scope locators file/path/active_note) with superRefine for regex-syntax, folder + file/path path-traversal, the file wikilink-bracket reject, and the scope mutual-exclusivity matrix (SCOPE_CONFLICT); discriminated-union output keyed on `mode: "preview" | "commit"` per FR-025 with refine enforcing failing_note_locator IFF partial===true. Spec 073: family-aligned keys case_sensitive / folder, with deprecated aliases case_insensitive (opposite polarity) / subfolder folded by the transform (old+new rejected; deprecated_parameters notice on both output branches).
import { z } from "zod";

import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "../../path-safety/schema.js";
import {
  appendAliasConflictIssue,
  collectDeprecatedParameters,
  deprecatedAlias,
  deprecatedParametersField,
  type ParameterRename,
} from "../_deprecated-params.js";

const PATTERN_MAX = 1000;
const REPLACEMENT_MAX = 1000;
const FULL_LINE_CAP_PLUS_ELLIPSIS = 501; // 500 + 1 ellipsis (U+2026)

// Parity with append_note/prepend — reject only the `[[` / `]]` bracket PAIRS that
// unambiguously signal the caller reached for wikilink syntax instead of the bare
// note name. Single brackets are legitimate inside note names (`[draft]`).
const WIKILINK_BRACKET_REJECTION_MESSAGE =
  "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)";

// Scope mutual-exclusivity messages keyed by the SCOPE_CONFLICT reason (066-file-scope).
const SCOPE_CONFLICT_MESSAGES: Record<string, string> = {
  "file+path":
    "find_and_replace: `file` and `path` are mutually exclusive — supply exactly one single-note locator",
  "note+folder":
    "find_and_replace: a single-note scope (`file`/`path`) and a `folder` scope are mutually exclusive",
  "active+note":
    "find_and_replace: `active_note` cannot be combined with a named `file`/`path`",
  "active+folder":
    "find_and_replace: `active_note` cannot be combined with a `folder` scope",
  "active+vault":
    "find_and_replace: `active_note` cannot be combined with an explicit `vault` (the open note determines its own vault)",
};

const CASE_INSENSITIVE_RENAME: ParameterRename = { old: "case_insensitive", replacement: "case_sensitive", inverted: true };
const SUBFOLDER_RENAME: ParameterRename = { old: "subfolder", replacement: "folder" };

export const FIND_AND_REPLACE_RENAMES: readonly ParameterRename[] = [CASE_INSENSITIVE_RENAME, SUBFOLDER_RENAME];

// Today's default is case-sensitive; `case_insensitive` carries the opposite polarity.
function resolveCaseSensitive(v: { case_sensitive?: boolean; case_insensitive?: boolean }): boolean {
  return v.case_sensitive ?? !(v.case_insensitive ?? false);
}

export const findAndReplaceInputSchema = z
  .strictObject({
    pattern: z
      .string()
      .min(1, "pattern must not be empty")
      .max(PATTERN_MAX, `pattern exceeds ${PATTERN_MAX} chars`)
      .describe(`Text or ECMAScript regex to find, matched within single lines; 1 to ${PATTERN_MAX} characters.`),
    replacement: z
      .string()
      .max(REPLACEMENT_MAX, `replacement exceeds ${REPLACEMENT_MAX} chars`)
      .describe(
        `Replacement text, 0 to ${REPLACEMENT_MAX} characters (empty deletes the match); $1/$&/$$ interpolate in regex mode.`,
      ),
    mode: z
      .enum(["literal", "regex"])
      .optional()
      .default("literal")
      .describe('How pattern is read: "literal" (verbatim text) or "regex" (ECMAScript). Default "literal".'),
    case_sensitive: z.boolean().optional().describe("Match case exactly when true. Default true."),
    case_insensitive: deprecatedAlias(z.boolean(), CASE_INSENSITIVE_RENAME),
    folder: z
      .string()
      .optional()
      .describe(
        'Vault-relative folder to search under, recursively (e.g. "Projects"). Default: the whole vault. Not combinable with file, path or active_note.',
      ),
    subfolder: deprecatedAlias(z.string(), SUBFOLDER_RENAME),
    include_code_blocks: z
      .boolean()
      .optional()
      .default(false)
      .describe("Also replace inside fenced code blocks when true. Default false (skipped)."),
    include_html_comments: z
      .boolean()
      .optional()
      .default(false)
      .describe("Also replace inside <!-- --> HTML comments when true. Default false (skipped)."),
    commit: z
      .boolean()
      .optional()
      .default(false)
      .describe("Write the replacements to disk when true. Default false (preview only, nothing changes)."),
    vault: z
      .string()
      .min(1)
      .optional()
      .describe("Obsidian vault display name. Omit to use the vault focused in Obsidian; not allowed with active_note."),
    // Single-note scope locators (066-file-scope). All optional — omitting all
    // three preserves the vault-wide / folder default byte-for-byte (FR-014).
    // `file` is a bare note name resolved like a wikilink (shortest-unique-name);
    // `path` is an exact vault-relative path; `active_note` confines to the open note.
    file: z
      .string()
      .min(1)
      .optional()
      .describe('Confine to one note named like a wikilink (e.g. "Alpha"), no [[ ]] brackets. Not combinable with path or folder.'),
    path: z
      .string()
      .min(1)
      .optional()
      .describe('Confine to one note by exact vault-relative path (e.g. "Projects/Alpha.md"). Not combinable with file or folder.'),
    active_note: z
      .boolean()
      .optional()
      .default(false)
      .describe("Confine to the note open in Obsidian when true. Default false; not combinable with file, path, folder or vault."),
  })
  .superRefine((v, ctx) => {
    for (const rename of FIND_AND_REPLACE_RENAMES) appendAliasConflictIssue(ctx, v, rename);
    const folder = v.folder ?? v.subfolder;
    if (v.mode === "regex") {
      try {
        new RegExp(v.pattern, resolveCaseSensitive(v) ? "" : "i");
      } catch (cause) {
        ctx.addIssue({
          code: "custom",
          path: ["pattern"],
          message: (cause as Error).message,
          params: { subCode: "INVALID_PATTERN", subReason: "regex-syntax" },
        });
      }
    }
    if (folder !== undefined && folder.length > 0) {
      if (!isStructurallySafePath(folder)) {
        ctx.addIssue({
          code: "custom",
          path: ["folder"],
          message:
            "path is not structurally safe (must not start with '/', '\\\\', or a drive letter; must not contain '..' segments or control characters)",
          params: { subCode: "INVALID_SUBFOLDER", subReason: "path-traversal" },
        });
      }
    }
    // Single-note locator field-shape checks (066-file-scope). Structural
    // path-safety on file/path maps to INVALID_NOTE/path-traversal (parity with
    // INVALID_SUBFOLDER/path-traversal); the `[[…]]` reject on file surfaces
    // through the cohort's standard VALIDATION_ERROR channel (no sub-code).
    if (v.file !== undefined) {
      if (!isStructurallySafePath(v.file)) {
        ctx.addIssue({
          code: "custom",
          path: ["file"],
          message: STRUCTURALLY_UNSAFE_PATH_MESSAGE,
          params: { subCode: "INVALID_NOTE", subReason: "path-traversal" },
        });
      } else if (v.file.includes("[[") || v.file.includes("]]")) {
        ctx.addIssue({
          code: "custom",
          path: ["file"],
          message: WIKILINK_BRACKET_REJECTION_MESSAGE,
        });
      }
    }
    if (v.path !== undefined && !isStructurallySafePath(v.path)) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message: STRUCTURALLY_UNSAFE_PATH_MESSAGE,
        params: { subCode: "INVALID_NOTE", subReason: "path-traversal" },
      });
    }
    // Scope mutual-exclusivity matrix (066-file-scope, FR-006 / FR-007). Let
    // single-note = file | path | active_note. `vault` is permitted with a named
    // target (it selects the vault) and forbidden only under active_note; an empty
    // folder is the whole-vault passthrough (no conflict). All emitted before
    // any read; mapped to VALIDATION_ERROR + SCOPE_CONFLICT + reason in index.ts.
    const hasFile = v.file !== undefined;
    const hasPath = v.path !== undefined;
    const hasActive = v.active_note === true;
    const hasSubfolder = folder !== undefined && folder.length > 0;
    const hasVault = v.vault !== undefined;
    let scopeConflict: string | null = null;
    if (hasFile && hasPath) scopeConflict = "file+path";
    else if (hasActive && (hasFile || hasPath)) scopeConflict = "active+note";
    else if (hasActive && hasSubfolder) scopeConflict = "active+folder";
    else if (hasActive && hasVault) scopeConflict = "active+vault";
    else if ((hasFile || hasPath) && hasSubfolder) scopeConflict = "note+folder";
    if (scopeConflict !== null) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: SCOPE_CONFLICT_MESSAGES[scopeConflict],
        params: { subCode: "SCOPE_CONFLICT", subReason: scopeConflict },
      });
    }
  })
  .transform((v) => {
    const { case_insensitive: _caseInsensitive, subfolder, ...rest } = v;
    const folder = rest.folder ?? subfolder;
    const deprecated_parameters = collectDeprecatedParameters(v, FIND_AND_REPLACE_RENAMES);
    return {
      ...rest,
      case_sensitive: resolveCaseSensitive(v),
      ...(folder !== undefined && { folder }),
      ...(deprecated_parameters !== undefined && { deprecated_parameters }),
    };
  });

export type FindAndReplaceInput = z.infer<typeof findAndReplaceInputSchema>;

const occurrenceSchema = z
  .strictObject({
    line_number: z.number().int().min(1),
    full_line: z.string().max(FULL_LINE_CAP_PLUS_ELLIPSIS),
    matched_substring: z.string(),
    replacement_substring: z.string(),
  });

const affectedNoteSchema = z
  .strictObject({
    path: z.string().min(1),
    occurrence_count: z.number().int().min(1),
    occurrences: z.array(occurrenceSchema),
  });

const previewBranchSchema = z
  .strictObject({
    mode: z.literal("preview"),
    affected_notes: z.array(affectedNoteSchema),
    total_occurrences: z.number().int().nonnegative(),
    deprecated_parameters: deprecatedParametersField,
  });

const commitBranchSchema = z
  .strictObject({
    mode: z.literal("commit"),
    changed_notes: z.array(z.string().min(1)),
    total_occurrences_replaced: z.number().int().nonnegative(),
    partial: z.boolean(),
    failing_note_locator: z.string().min(1).optional(),
    deprecated_parameters: deprecatedParametersField,
  });

export const findAndReplaceOutputSchema = z
  .discriminatedUnion("mode", [previewBranchSchema, commitBranchSchema])
  .superRefine((v, ctx) => {
    if (v.mode === "commit") {
      if (v.partial === true && v.failing_note_locator === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["failing_note_locator"],
          message: "failing_note_locator MUST be present when partial === true",
        });
      }
      if (v.partial === false && v.failing_note_locator !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["failing_note_locator"],
          message: "failing_note_locator MUST be absent when partial === false",
        });
      }
    }
  });

export type FindAndReplaceOutput = z.infer<typeof findAndReplaceOutputSchema>;
export type FindAndReplaceOccurrence = z.infer<typeof occurrenceSchema>;
export type FindAndReplaceAffectedNote = z.infer<typeof affectedNoteSchema>;

export const FULL_LINE_CAP = 500;
export const FULL_LINE_ELLIPSIS = "…";
