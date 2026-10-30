// Original — no upstream. Shared optional `vault` field for the tools without target_mode that
// fall back to the vault focused in Obsidian (068 FR-030 / PR #90 review): one schema and one
// published description instead of a copy per tool. Tools whose `vault` has a different rule
// (ignored by the CLI, not allowed with another field) keep their own declaration.
import { z } from "zod";

export const focusedVaultField = z
  .string()
  .min(1)
  .optional()
  .describe("Obsidian vault display name. Omit to use the vault focused in Obsidian.");
