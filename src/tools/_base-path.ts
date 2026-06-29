// Original — no upstream. Shared boundary refinement for the Bases-family `.base` path locator.
// create_base (field `path`), query_base (field `base_path`), and views_base (field `base_path`)
// validate a vault-relative `.base` path identically — empty / too-long / path-traversal /
// wrong-extension — emitting INVALID_BASE_PATH sub-issues whose `params: { code, reason, field,
// value_length? }` follow the ADR-015 sub-discrimination convention (callers branch on
// `issue.params.code`). This module is the single source of truth for that contract (Principle III);
// the only per-tool variation is the field name, threaded through the issue `path`, the human
// message, and `params.field`. It imports path-safety downward, so there is no tool→tool edge
// (Principle I) — it is a leaf util in the same family as `isStructurallySafePath`.
import { z } from "zod";

import { isStructurallySafePath } from "../path-safety/schema.js";

/** Maximum accepted length, in UTF-16 code units, of a `.base` path locator. */
export const BASE_PATH_MAX = 1000;

/**
 * Append the INVALID_BASE_PATH sub-issues for a vault-relative `.base` path `value` to `ctx`.
 *
 * `field` is the input key being validated — `"path"` for create_base, `"base_path"` for query_base
 * and views_base. It is threaded through the issue `path`, the human-readable message, and
 * `params.field` so each tool's emitted issues are byte-identical to its prior hand-rolled copy.
 * No issue is added when `value` is structurally valid (non-empty, within length, no traversal shape,
 * `.base` extension); the caller is responsible for only invoking this when `value` is a string.
 */
export function appendBasePathIssues(ctx: z.RefinementCtx, value: string, field: string): void {
  const value_length = value.length;
  if (value_length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `INVALID_BASE_PATH/empty: ${field} is empty`,
      params: { code: "INVALID_BASE_PATH", reason: "empty", field, value_length },
    });
  } else if (value_length > BASE_PATH_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `INVALID_BASE_PATH/too-long: ${field} exceeds ${BASE_PATH_MAX} UTF-16 code units`,
      params: { code: "INVALID_BASE_PATH", reason: "too-long", field, value_length },
    });
  } else if (!isStructurallySafePath(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `INVALID_BASE_PATH/path-traversal: ${field} contains path-traversal shapes`,
      params: { code: "INVALID_BASE_PATH", reason: "path-traversal", field, value },
    });
  } else if (!/\.base$/i.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `INVALID_BASE_PATH/wrong-extension: ${field} must end with .base`,
      params: { code: "INVALID_BASE_PATH", reason: "wrong-extension", field, value },
    });
  }
}
