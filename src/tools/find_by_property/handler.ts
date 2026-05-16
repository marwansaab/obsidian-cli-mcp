// Original — no upstream. find_by_property handler: single invokeCli wrapper around the eval subcommand with a frozen JS template + base64 payload (R6 anti-injection); two-stage response parse (=> prefix strip + JSON.parse + output schema validate); R4 target_mode mapping (vault undefined → active, vault set → specific); count/paths invariant defensive check. BI-034 (spec branch 034-fix-unicode-lookups): JS_TEMPLATE extracted to sibling `_template.ts` so the cohort layout matches `read_heading/_template.ts` etc.; payload compose uses the shared `composeEvalCode` helper.
import { JS_TEMPLATE } from "./_template.js";
import { findByPropertyOutputSchema, type FindByPropertyInput, type FindByPropertyOutput } from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { composeEvalCode } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeFindByProperty(
  input: FindByPropertyInput,
  deps: ExecuteDeps,
): Promise<FindByPropertyOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    property: input.property,
    value: input.value,
    folder: input.folder ?? "",
    arrayMatch: input.arrayMatch,
    caseSensitive: input.caseSensitive,
  });

  const target_mode = input.vault === undefined ? "active" : "specific";
  const result = await invokeCli(
    {
      command: "eval",
      vault: input.vault,
      parameters: { code },
      flags: [],
      target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  let stdout = result.stdout.trimStart();
  if (stdout.startsWith("=> ")) stdout = stdout.slice(3);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stdout);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stdout: result.stdout, stage: "json-parse" },
      message: `find_by_property: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  const validated = findByPropertyOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stdout: result.stdout, stage: "schema-parse" },
      message: "find_by_property: eval response shape unexpected",
    });
  }

  if (validated.data.count !== validated.data.paths.length) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stdout: result.stdout, stage: "count-paths-mismatch" },
      message: "find_by_property: count !== paths.length (JS template invariant violation)",
    });
  }

  return validated.data;
}
