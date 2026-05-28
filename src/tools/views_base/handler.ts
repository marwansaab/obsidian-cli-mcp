// Original — no upstream.
import {
  viewsBaseOutputSchema,
  type ViewsBaseInput,
  type ViewsBaseOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const NOT_A_BASE_FILE_PATTERN = /Active file is not a base file/i;

export async function executeViewsBase(
  _input: ViewsBaseInput,
  deps: ExecuteDeps,
): Promise<ViewsBaseOutput> {
  let cliResult: { stdout: string; stderr: string };
  try {
    cliResult = await invokeCli(
      {
        command: "base:views",
        parameters: {},
        flags: [],
        target_mode: "active",
      },
      {
        spawnFn: deps.spawnFn,
        env: deps.env,
        logger: deps.logger,
        queue: deps.queue,
      },
    );
  } catch (err) {
    if (err instanceof UpstreamError && err.code === "CLI_REPORTED_ERROR") {
      const stdout =
        typeof err.details["stdout"] === "string"
          ? (err.details["stdout"] as string)
          : "";
      const stderr =
        typeof err.details["stderr"] === "string"
          ? (err.details["stderr"] as string)
          : "";
      const combined = `${stdout}\n${stderr}`;
      if (NOT_A_BASE_FILE_PATTERN.test(combined)) {
        throw new UpstreamError({
          code: "CLI_REPORTED_ERROR",
          cause: err,
          details: { code: "BASE_NOT_FOUND" },
          message: "views_base: active file is not a base file",
        });
      }
    }
    throw err;
  }

  const combined = `${cliResult.stdout}\n${cliResult.stderr}`;
  if (NOT_A_BASE_FILE_PATTERN.test(combined)) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { code: "BASE_NOT_FOUND" },
      message: "views_base: active file is not a base file",
    });
  }

  const views = cliResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return viewsBaseOutputSchema.parse({ views, count: views.length });
}
