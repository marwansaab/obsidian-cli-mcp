// Original — no upstream. tags input/output/upstream-wire schemas — flat strict input (vault? + sibling single-note locators file?/path?/activeOnly? per ADR-032, plus sortByCount?/includeCounts?) with a superRefine delegating to the shared `_note-locator.ts` refinements: file/path structural path safety (INVALID_NOTE/path-traversal), the file wikilink-bracket reject, and the scope mutual-exclusivity matrix (SCOPE_CONFLICT: file+path / active+note / active+vault); NO target_mode (plan-stage ruling — this module deliberately does not import src/target-mode/). Upstream wire pinned by T0 probe P1 (2026-10-24): `[{ tag: "#name", count: "<digits>" }]` — count arrives as a decimal-digit STRING. Strict output { total, tags: [{ name, count? }] } with invariants total === tags.length, unique names, and count present on all entries or none.
import { z } from "zod";

import {
  appendNoteLocatorIssues,
  appendScopeConflictIssue,
  scopeConflictReason,
  type NoteScopeConflict,
} from "../_note-locator.js";

// Scope mutual-exclusivity messages keyed by the SCOPE_CONFLICT reason. The
// reasons are ADR-032's roster verbatim (no new sub-states per ADR-015).
const SCOPE_CONFLICT_MESSAGES: Readonly<Record<NoteScopeConflict, string>> = {
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
    appendNoteLocatorIssues(ctx, v);
    // Scope matrix (contracts/input.md). `activeOnly: false` counts as not set.
    appendScopeConflictIssue(
      ctx,
      scopeConflictReason({
        hasFile: v.file !== undefined,
        hasPath: v.path !== undefined,
        hasActive: v.activeOnly === true,
        hasVault: v.vault !== undefined,
      }),
      SCOPE_CONFLICT_MESSAGES,
    );
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
