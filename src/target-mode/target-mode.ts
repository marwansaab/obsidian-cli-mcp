// Original — no upstream. Flat z.object zod primitive for target_mode (ADR-003 amended 2026-05-07 / BI-029). 068 FR-031: the parameter-combination rules are stated in the published field descriptions; the flat schema and superRefine still enforce them at call time.
import { z } from "zod";

const FORBIDDEN_KEYS_IN_ACTIVE = ["vault", "file", "path"] as const;

// Exported so a tool that overrides `vault`, `file` or `path` in `.extend()` (to add its own
// refinement) publishes the same rule text.
export const TARGET_MODE_VAULT_DESCRIPTION =
  'Obsidian vault display name. Required when target_mode is "specific"; omit when "active".';
const LOCATOR_RULE = 'With target_mode "specific", give exactly one of file or path; omit both with "active".';
export const TARGET_MODE_FILE_DESCRIPTION = `Note name, resolved like a wikilink (e.g. "Meeting Notes"). ${LOCATOR_RULE}`;
export const TARGET_MODE_PATH_DESCRIPTION = `Exact vault-relative note path (e.g. "Projects/Alpha.md"). ${LOCATOR_RULE}`;

export const targetModeBaseSchema = z
  .strictObject({
    target_mode: z
      .enum(["specific", "active"])
      .describe(
        '"specific" targets a named vault and note (use for automation); "active" targets the note focused in Obsidian.',
      ),
    vault: z.string().min(1).optional().describe(TARGET_MODE_VAULT_DESCRIPTION),
    file: z.string().optional().describe(TARGET_MODE_FILE_DESCRIPTION),
    path: z.string().optional().describe(TARGET_MODE_PATH_DESCRIPTION),
  });

/**
 * Base object for the folder-scoped tools (`files`, `paths`, `get_active_file`). Same keys and
 * types as `targetModeBaseSchema`, with descriptions that state the folder-scoped rule: no note
 * locator in either mode; `vault` required when specific and omitted when active. Pair it with
 * `applyTargetModeRefinementForFolderScoped`.
 */
export const folderScopedTargetModeBaseSchema = targetModeBaseSchema.extend({
  target_mode: z
    .enum(["specific", "active"])
    .describe('"specific" targets a named vault; "active" targets the vault focused in Obsidian.'),
  vault: z.string().min(1).optional().describe(TARGET_MODE_VAULT_DESCRIPTION),
  file: z.string().optional().describe("Not accepted by this tool (it has no note locator); omit."),
  path: z.string().optional().describe("Not accepted by this tool (it has no note locator); omit."),
});

export function applyTargetModeRefinement<T extends z.ZodObject>(schema: T): T {
  return schema.superRefine((input, ctx) => {
    const record = input as Record<string, unknown>;
    if (record.target_mode === "specific") {
      if (record.vault === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["vault"],
          message: "vault is required in specific mode",
        });
      }
      const hasFile = record.file !== undefined;
      const hasPath = record.path !== undefined;
      if (!hasFile && !hasPath) {
        ctx.addIssue({
          code: "custom",
          path: [],
          message: "exactly one of `file` or `path` must be provided in specific mode (got neither)",
        });
      } else if (hasFile && hasPath) {
        ctx.addIssue({
          code: "custom",
          path: ["file"],
          message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
        });
        ctx.addIssue({
          code: "custom",
          path: ["path"],
          message: "exactly one of `file` or `path` must be provided in specific mode (got both)",
        });
      }
    } else {
      for (const key of FORBIDDEN_KEYS_IN_ACTIVE) {
        // Explicit-undefined is treated as "not provided" — semantically equivalent
        // to the absent-key case, matching pre-010 loose-object behaviour where
        // zod stripped undefined-valued passthrough keys before refinement ran.
        if (Object.hasOwn(record, key) && record[key] !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is not allowed in active mode`,
          });
        }
      }
    }
  });
}

export const targetModeSchema = applyTargetModeRefinement(targetModeBaseSchema);

export type TargetMode = z.infer<typeof targetModeSchema>;

// Folder-scoped variant of applyTargetModeRefinement (introduced by feature
// 019-list-files). The folder-scoped surface forbids the file-scoped locator
// fields (`file` and `path`) in BOTH modes — they have no meaning for tools
// that operate on a vault folder. The existing in-specific-requires-vault
// and in-active-forbids-vault rules are preserved verbatim.
export function applyTargetModeRefinementForFolderScoped<T extends z.ZodObject>(
  schema: T,
): T {
  return schema.superRefine((input, ctx) => {
    const record = input as Record<string, unknown>;
    if (Object.hasOwn(record, "file") && record.file !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: "file is not allowed for folder-scoped tools",
      });
    }
    if (Object.hasOwn(record, "path") && record.path !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message: "path is not allowed for folder-scoped tools",
      });
    }
    if (record.target_mode === "specific") {
      if (record.vault === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["vault"],
          message: "vault is required in specific mode",
        });
      }
    } else if (record.target_mode === "active") {
      if (Object.hasOwn(record, "vault") && record.vault !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["vault"],
          message: "vault is not allowed in active mode",
        });
      }
    }
  });
}
