// Original — no upstream. find_and_replace input + output schemas — strict object input (pattern/replacement/mode/case_insensitive/subfolder/include_code_blocks/include_html_comments/commit/vault + the single-note scope locators file/path/active_note) with superRefine for regex-syntax, subfolder path-traversal, and the shared `_note-locator.ts` refinements (file/path path-traversal, the file wikilink-bracket reject, the scope mutual-exclusivity matrix — SCOPE_CONFLICT); discriminated-union output keyed on `mode: "preview" | "commit"` per FR-025 with refine enforcing failing_note_locator IFF partial===true.
import { z } from "zod";

import { isStructurallySafePath } from "../../path-safety/schema.js";
import {
  appendNoteLocatorIssues,
  appendScopeConflictIssue,
  scopeConflictReason,
  type ScopeConflict,
} from "../_note-locator.js";

const PATTERN_MAX = 1000;
const REPLACEMENT_MAX = 1000;
const FULL_LINE_CAP_PLUS_ELLIPSIS = 501; // 500 + 1 ellipsis (U+2026)

// Scope mutual-exclusivity messages keyed by the SCOPE_CONFLICT reason (066-file-scope).
const SCOPE_CONFLICT_MESSAGES: Readonly<Record<ScopeConflict, string>> = {
  "file+path":
    "find_and_replace: `file` and `path` are mutually exclusive — supply exactly one single-note locator",
  "note+folder":
    "find_and_replace: a single-note scope (`file`/`path`) and a `subfolder` scope are mutually exclusive",
  "active+note":
    "find_and_replace: `active_note` cannot be combined with a named `file`/`path`",
  "active+folder":
    "find_and_replace: `active_note` cannot be combined with a `subfolder` scope",
  "active+vault":
    "find_and_replace: `active_note` cannot be combined with an explicit `vault` (the open note determines its own vault)",
};

export const findAndReplaceInputSchema = z
  .strictObject({
    pattern: z
      .string()
      .min(1, "pattern must not be empty")
      .max(PATTERN_MAX, `pattern exceeds ${PATTERN_MAX} chars`),
    replacement: z
      .string()
      .max(REPLACEMENT_MAX, `replacement exceeds ${REPLACEMENT_MAX} chars`),
    mode: z.enum(["literal", "regex"]).optional().default("literal"),
    case_insensitive: z.boolean().optional().default(false),
    subfolder: z.string().optional(),
    include_code_blocks: z.boolean().optional().default(false),
    include_html_comments: z.boolean().optional().default(false),
    commit: z.boolean().optional().default(false),
    vault: z.string().min(1).optional(),
    // Single-note scope locators (066-file-scope). All optional — omitting all
    // three preserves the vault-wide / subfolder default byte-for-byte (FR-014).
    // `file` is a bare note name resolved like a wikilink (shortest-unique-name);
    // `path` is an exact vault-relative path; `active_note` confines to the open note.
    file: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    active_note: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "regex") {
      try {
        new RegExp(v.pattern, v.case_insensitive ? "i" : "");
      } catch (cause) {
        ctx.addIssue({
          code: "custom",
          path: ["pattern"],
          message: (cause as Error).message,
          params: { subCode: "INVALID_PATTERN", subReason: "regex-syntax" },
        });
      }
    }
    if (v.subfolder !== undefined && v.subfolder.length > 0) {
      if (!isStructurallySafePath(v.subfolder)) {
        ctx.addIssue({
          code: "custom",
          path: ["subfolder"],
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
    appendNoteLocatorIssues(ctx, v);
    // Scope mutual-exclusivity matrix (066-file-scope, FR-006 / FR-007). Let
    // single-note = file | path | active_note. `vault` is permitted with a named
    // target (it selects the vault) and forbidden only under active_note; an empty
    // subfolder is the whole-vault passthrough (no conflict). All emitted before
    // any read; mapped to VALIDATION_ERROR + SCOPE_CONFLICT + reason in index.ts.
    appendScopeConflictIssue(
      ctx,
      scopeConflictReason({
        hasFile: v.file !== undefined,
        hasPath: v.path !== undefined,
        hasActive: v.active_note === true,
        hasVault: v.vault !== undefined,
        hasSubfolder: v.subfolder !== undefined && v.subfolder.length > 0,
      }),
      SCOPE_CONFLICT_MESSAGES,
    );
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
  });

const commitBranchSchema = z
  .strictObject({
    mode: z.literal("commit"),
    changed_notes: z.array(z.string().min(1)),
    total_occurrences_replaced: z.number().int().nonnegative(),
    partial: z.boolean(),
    failing_note_locator: z.string().min(1).optional(),
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
