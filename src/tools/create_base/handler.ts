// Original — no upstream.
import { posix } from "node:path";

import {
  createBaseOutputSchema,
  type CreateBaseInput,
  type CreateBaseOutput,
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

const CREATED_PATTERN = /^Created:\s*(.+)$/m;
const BASE_NOT_FOUND_PATTERN = /Base file not found/i;

export async function executeCreateBase(
  input: CreateBaseInput,
  deps: ExecuteDeps,
): Promise<CreateBaseOutput> {
  const parameters: Record<string, string> = {
    path: input.path,
    name: input.name,
  };
  if (input.content !== undefined) parameters.content = input.content;
  if (input.view !== undefined) parameters.view = input.view;

  let cliResult: { stdout: string; stderr: string };
  try {
    cliResult = await invokeCli(
      {
        command: "base:create",
        parameters,
        flags: [],
        target_mode: "specific",
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
      if (BASE_NOT_FOUND_PATTERN.test(combined)) {
        throw new UpstreamError({
          code: "CLI_REPORTED_ERROR",
          cause: err,
          details: { code: "BASE_NOT_FOUND", path: input.path },
          message: `create_base: base file not found: ${input.path}`,
        });
      }
    }
    throw err;
  }

  const combined = `${cliResult.stdout}\n${cliResult.stderr}`;
  if (BASE_NOT_FOUND_PATTERN.test(combined)) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { code: "BASE_NOT_FOUND", path: input.path },
      message: `create_base: base file not found: ${input.path}`,
    });
  }

  const match = CREATED_PATTERN.exec(cliResult.stdout);
  if (!match) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        stage: "response-parse",
        stdout: cliResult.stdout.slice(0, 500),
      },
      message: "create_base: CLI stdout did not contain expected 'Created: <filename>' pattern",
    });
  }

  const createdFilename = match[1]!.trim();
  const baseDir = posix.dirname(input.path.replace(/\\/g, "/"));
  const baseName = posix.basename(input.path.replace(/\\/g, "/"), ".base");
  const itemDir = baseDir === "." ? baseName : `${baseDir}/${baseName}`;
  const itemPath = `${itemDir}/${createdFilename}`;

  return createBaseOutputSchema.parse({ path: itemPath, name: createdFilename });
}
