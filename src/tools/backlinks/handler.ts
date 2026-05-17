// Original — no upstream. backlinks handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R12 anti-injection); R2/R9 single-call architecture; two-stage parse step (JSON.parse → backlinksEvalResponseSchema.safeParse) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse failure; envelope ok:false → UpstreamError mapping per R13 (NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE for BI-015 / BI-014 / BI-025 parity; FILE_NOT_FOUND / NOT_MARKDOWN → CLI_REPORTED_ERROR with details.stage='envelope-error').
import { JS_TEMPLATE } from "./_template.js";
import {
  backlinksEvalResponseSchema,
  type BacklinksEvalErrorCode,
  type BacklinksInput,
  type BacklinksOutput,
} from "./schema.js";
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

export async function executeBacklinks(
  input: BacklinksInput,
  deps: ExecuteDeps,
): Promise<BacklinksOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    active: input.target_mode === "active",
    path: input.target_mode === "specific" ? input.path ?? null : null,
    file: input.target_mode === "specific" ? input.file ?? null : null,
    with_counts: input.with_counts === true,
    total: input.total === true,
    limit: input.limit ?? null,
  });

  const result = await invokeCli(
    {
      command: "eval",
      vault: input.target_mode === "specific" ? input.vault : undefined,
      parameters: { code },
      flags: [],
      target_mode: input.target_mode,
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
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `backlinks: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  const validated = backlinksEvalResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "backlinks: eval response shape unexpected",
    });
  }

  if (validated.data.ok === true) {
    const out: BacklinksOutput = {
      count: validated.data.count,
      backlinks: validated.data.backlinks,
    };
    if (validated.data.truncated === true) out.truncated = true;
    return out;
  }

  throw mapEnvelopeError(validated.data.code, validated.data.detail);
}

function mapEnvelopeError(code: BacklinksEvalErrorCode, detail: string): UpstreamError {
  switch (code) {
    case "NO_ACTIVE_FILE":
      return new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: null,
        details: { stage: "envelope-error", detail },
        message: "backlinks: no note focused; switch to specific mode or focus a note.",
      });
    case "FILE_NOT_FOUND":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `backlinks: file not found (${detail})`,
      });
    case "NOT_MARKDOWN":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `backlinks: target is not a Markdown note (${detail})`,
      });
  }
}
