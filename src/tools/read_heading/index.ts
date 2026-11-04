// Original — no upstream. read_heading tool registration via registerTool — wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadHeading, type ExecuteDeps } from "./handler.js";
import { readHeadingInputSchema, readHeadingOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const READ_HEADING_TOOL_NAME = "read_heading";

export const READ_HEADING_DESCRIPTION =
  "Read the body of one heading in a note, up to the next heading of any depth, found by its `::`-separated heading path. Choose it for one section; use `read` for the whole note and `read_property` for one frontmatter property.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createReadHeadingTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_HEADING_TOOL_NAME,
    title: "Read Heading",
    annotations: READ_ONLY_HINTS,
    description: READ_HEADING_DESCRIPTION,
    schema: readHeadingInputSchema,
    outputSchema: readHeadingOutputSchema,
    deps,
    handler: async (input, d) => executeReadHeading(input, d),
  });
}
