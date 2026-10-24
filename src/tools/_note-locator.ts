// Original — no upstream. Shared boundary refinements for the ADR-032 single-note sibling locators
// (`file` / `path`, optionally an active-note flag and a sub-folder scope). find_and_replace and tags
// validate them identically: structural path safety on both fields (INVALID_NOTE/path-traversal per
// ADR-015), the `[[` / `]]` wikilink-bracket reject on `file`, and the SCOPE_CONFLICT mutual-exclusivity
// matrix with ADR-032's single-reason roster. The wikilink-bracket message is also shared with the
// target-mode `file` fields of append_note and prepend. This module is the single source of truth for
// those contracts (Principle III); the per-tool variation is only which scope flags exist and the
// tool-prefixed conflict messages. It imports path-safety downward, so there is no tool→tool edge
// (Principle I) — a leaf util in the same family as `_base-path.ts`.
import { z } from "zod";

import { isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE } from "../path-safety/schema.js";

// Reject only the `[[` / `]]` bracket PAIRS that unambiguously signal the caller reached for
// wikilink syntax instead of the bare note name. Single brackets are legitimate inside note
// names (`[draft]`).
export const WIKILINK_BRACKET_REJECTION_MESSAGE =
  "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)";

/** True when `value` contains a wikilink bracket pair (`[[` or `]]`). */
export function hasWikilinkBrackets(value: string): boolean {
  return value.includes("[[") || value.includes("]]");
}

/**
 * Append the field-level issues for the sibling single-note locators to `ctx`. A structurally
 * unsafe `file` or `path` gets a custom issue carrying `params: { subCode: "INVALID_NOTE",
 * subReason: "path-traversal" }`; a structurally safe `file` containing `[[` / `]]` gets a custom
 * issue with no params, so it surfaces through the generic VALIDATION_ERROR channel.
 */
export function appendNoteLocatorIssues(
  ctx: z.RefinementCtx,
  locators: { file?: string | undefined; path?: string | undefined },
): void {
  const { file, path } = locators;
  if (file !== undefined) {
    if (!isStructurallySafePath(file)) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: STRUCTURALLY_UNSAFE_PATH_MESSAGE,
        params: { subCode: "INVALID_NOTE", subReason: "path-traversal" },
      });
    } else if (hasWikilinkBrackets(file)) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: WIKILINK_BRACKET_REJECTION_MESSAGE,
      });
    }
  }
  if (path !== undefined && !isStructurallySafePath(path)) {
    ctx.addIssue({
      code: "custom",
      path: ["path"],
      message: STRUCTURALLY_UNSAFE_PATH_MESSAGE,
      params: { subCode: "INVALID_NOTE", subReason: "path-traversal" },
    });
  }
}

/** SCOPE_CONFLICT reasons a tool with only single-note scopes (file / path / active) can emit. */
export type NoteScopeConflict = "file+path" | "active+note" | "active+vault";

/** SCOPE_CONFLICT reasons once a sub-folder scope is also accepted. */
export type ScopeConflict = NoteScopeConflict | "active+folder" | "note+folder";

/** Which scope inputs a request supplied. `hasActive` is true only for an explicit `true` flag. */
export interface NoteScopeFlags {
  hasFile: boolean;
  hasPath: boolean;
  hasActive: boolean;
  hasVault: boolean;
}

/**
 * The single SCOPE_CONFLICT reason for a request, or null when the combination is allowed. Rows
 * are checked in ADR-032 order and the first match wins, so a request with several conflicts
 * yields exactly one reason. `vault` is allowed with a named `file` / `path` (it selects the
 * note's vault) and forbidden only alongside the active note.
 */
export function scopeConflictReason(flags: NoteScopeFlags): NoteScopeConflict | null;
export function scopeConflictReason(flags: NoteScopeFlags & { hasSubfolder: boolean }): ScopeConflict | null;
export function scopeConflictReason(flags: NoteScopeFlags & { hasSubfolder?: boolean }): ScopeConflict | null {
  const hasNote = flags.hasFile || flags.hasPath;
  const hasSubfolder = flags.hasSubfolder === true;
  if (flags.hasFile && flags.hasPath) return "file+path";
  if (flags.hasActive && hasNote) return "active+note";
  if (flags.hasActive && hasSubfolder) return "active+folder";
  if (flags.hasActive && flags.hasVault) return "active+vault";
  if (hasNote && hasSubfolder) return "note+folder";
  return null;
}

/**
 * Append the cross-field SCOPE_CONFLICT issue for `reason` (a no-op when null). The issue has an
 * empty `path` and carries `params: { subCode: "SCOPE_CONFLICT", subReason: reason }`; `messages`
 * supplies the tool-prefixed human message for every reason the tool can produce.
 */
export function appendScopeConflictIssue<R extends ScopeConflict>(
  ctx: z.RefinementCtx,
  reason: R | null,
  messages: Readonly<Record<R, string>>,
): void {
  if (reason === null) return;
  ctx.addIssue({
    code: "custom",
    path: [],
    message: messages[reason],
    params: { subCode: "SCOPE_CONFLICT", subReason: reason },
  });
}
