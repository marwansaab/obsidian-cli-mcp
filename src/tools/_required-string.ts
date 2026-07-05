// Original — no upstream. Shared required-string field builder (BI-067 / PR #78 review).
// zod 4 removed the v3 `required_error` / `invalid_type_error` params in favor of a single
// `error` callback; the four migrated fields (create_base `path`/`name`, query_base
// `base_path`/`view_name`) share this one closure so the "<field> is required" /
// "<field> must be a string" message contract has a single source instead of four
// copy-pasted callbacks. Per-tool FR-010 tests pin the published strings exactly.
import { z } from "zod";

/**
 * A required `z.string()` whose missing-key and wrong-type messages carry the field
 * name: `"<field> is required"` when the input is absent, `"<field> must be a string"`
 * otherwise.
 */
export function requiredString(field: string): z.ZodString {
  return z.string({
    error: (issue) =>
      issue.input === undefined ? `${field} is required` : `${field} must be a string`,
  });
}
