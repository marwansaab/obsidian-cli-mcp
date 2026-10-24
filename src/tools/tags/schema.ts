// Original — no upstream. tags input/output/upstream-wire schemas — flat strict input (vault? + sibling single-note locators file?/path?/activeOnly? per ADR-032, plus sortByCount?/includeCounts?) with a superRefine for file/path structural path safety (INVALID_NOTE/path-traversal), the file wikilink-bracket reject, and the scope mutual-exclusivity matrix (SCOPE_CONFLICT: file+path / active+note / active+vault); NO target_mode (plan-stage ruling — this module deliberately does not import src/target-mode/). Upstream wire pinned by T0 probe P1 (2026-10-24): `[{ tag: "#name", count: "<digits>" }]` — count arrives as a decimal-digit STRING. Strict output { total, tags: [{ name, count? }] } with invariants total === tags.length, unique names, and count present on all entries or none.
import { z } from "zod";

import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "../../path-safety/schema.js";

// Parity with find_and_replace/append_note — reject only the `[[` / `]]` bracket
// PAIRS; single brackets are legitimate inside note names (`[draft]`).
const WIKILINK_BRACKET_REJECTION_MESSAGE =
  "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)";

// Scope mutual-exclusivity messages keyed by the SCOPE_CONFLICT reason. The
// reasons are ADR-032's roster verbatim (no new sub-states per ADR-015). Kept
// local rather than shared with find_and_replace (research D3).
const SCOPE_CONFLICT_MESSAGES: Record<string, string> = {
  "file+path": "tags: `file` and `path` are mutually exclusive — supply at most one single-note locator",
  "active+note": "tags: `activeOnly: true` cannot be combined with a named `file`/`path`",
  "active+vault":
    "tags: `activeOnly: true` cannot be combined with an explicit `vault` (the open note determines its own vault)",
};

export const tagsInputSchema = z
  .strictObject({
    vault: z.string().min(1).optional(),
    file: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    activeOnly: z.boolean().optional(),
    sortByCount: z.boolean().optional(),
    includeCounts: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
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
    // Scope matrix (contracts/input.md). `activeOnly: false` counts as not set.
    // Rows are checked in contract order; the first match is the single reason.
    const hasFile = v.file !== undefined;
    const hasPath = v.path !== undefined;
    const hasActive = v.activeOnly === true;
    const hasVault = v.vault !== undefined;
    let scopeConflict: string | null = null;
    if (hasFile && hasPath) scopeConflict = "file+path";
    else if (hasActive && (hasFile || hasPath)) scopeConflict = "active+note";
    else if (hasActive && hasVault) scopeConflict = "active+vault";
    if (scopeConflict !== null) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: SCOPE_CONFLICT_MESSAGES[scopeConflict]!,
        params: { subCode: "SCOPE_CONFLICT", subReason: scopeConflict },
      });
    }
  });

export const tagsUpstreamEntrySchema = z
  .object({
    tag: z.string().min(1),
    count: z.string().regex(/^\d+$/, "upstream count must be a decimal-digit string"),
  })
  .loose();

export const tagsUpstreamArraySchema = z.array(tagsUpstreamEntrySchema);

export const tagEntrySchema = z.strictObject({
  name: z.string().min(1),
  count: z.number().int().nonnegative().optional(),
});

export const tagsOutputSchema = z
  .strictObject({
    total: z.number().int().nonnegative(),
    tags: z.array(tagEntrySchema),
  })
  .superRefine((v, ctx) => {
    if (v.total !== v.tags.length) {
      ctx.addIssue({
        code: "custom",
        path: ["total"],
        message: `total (${v.total}) must equal tags.length (${v.tags.length})`,
      });
    }
    const seen = new Set<string>();
    v.tags.forEach((entry, i) => {
      if (seen.has(entry.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["tags", i, "name"],
          message: `duplicate tag name: ${JSON.stringify(entry.name)}`,
        });
      }
      seen.add(entry.name);
    });
    const withCount = v.tags.filter((t) => "count" in t).length;
    if (withCount !== 0 && withCount !== v.tags.length) {
      ctx.addIssue({
        code: "custom",
        path: ["tags"],
        message: "count must be present on every entry or on none",
      });
    }
  });

export type TagsInput = z.infer<typeof tagsInputSchema>;
export type TagsUpstreamEntry = z.infer<typeof tagsUpstreamEntrySchema>;
export type TagEntry = z.infer<typeof tagEntrySchema>;
export type TagsOutput = z.infer<typeof tagsOutputSchema>;
