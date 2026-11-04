// Original — no upstream. create_base tool registration via registerTool; spec 084: a mapValidationError hook lifts the first sub-coded issue's ADR-015 params (INVALID_BASE_PATH / INVALID_NAME / CONTENT_TOO_LARGE) to details.code, details.reason (when present) and details.field, with that issue's own message, next to the unchanged generic details.issues (BI-0174: through the shared liftSubCodedIssueKeys); every other validation failure returns undefined and gets registerTool's generic envelope.
import { withDeprecatedParameters } from "../_deprecated-params.js";
import { registerTool } from "../_register.js";
import { liftSubCodedIssueKeys } from "../_validation-details.js";
import { CREATE_BASE_SUPPORTED, executeCreateBase, type ExecuteDeps } from "./handler.js";
import { createBaseInputSchema, createBaseOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import {
  ADDITIVE_WRITE_HINTS,
  type BootDeps,
  type RegisteredTool,
} from "../_shared.js";

export const CREATE_BASE_TOOL_NAME = "create_base";

export const CREATE_BASE_DESCRIPTION =
  `Add an item note to an existing Obsidian Bases (\`.base\`) file. Use it to create a Base entry; \`bases\` lists the vault's \`.base\` files, \`views_base\` lists a Base's view names, and \`query_base\` returns a view's rows. The created item is a note. ${describeSupport(CREATE_BASE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

/**
 * The schema's sub-coded custom issues (`appendBasePathIssues` and the name / content checks)
 * carry ADR-015 params; the first one, in superRefine order, is the error the caller acts on,
 * lifted with its `code`, `reason` (when present) and `field` only. The deprecated-name conflict
 * issue carries no params, so it and every other failure fall through to registerTool's generic
 * envelope.
 */
const liftCreateBaseIssue = liftSubCodedIssueKeys(["code", "reason", "field"]);

export function createCreateBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: CREATE_BASE_TOOL_NAME,
    title: "Create Base",
    annotations: ADDITIVE_WRITE_HINTS,
    description: CREATE_BASE_DESCRIPTION,
    schema: createBaseInputSchema,
    outputSchema: createBaseOutputSchema,
    deps,
    handler: async (input, d) => withDeprecatedParameters(await executeCreateBase(input, d), input.deprecated_parameters),
    mapValidationError: liftCreateBaseIssue,
  });
}
