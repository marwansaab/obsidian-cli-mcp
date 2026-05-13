// Original — no upstream. links handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R6 anti-injection); R2/R3 single-call architecture branched at envelope-emission on `a.total`; two-stage parse step (JSON.parse → linksEvalResponseSchema.safeParse) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse failure; envelope ok:false → UpstreamError mapping per R13 (NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE for BI-015 / BI-014 parity per T0.2 lock; FILE_NOT_FOUND / NOT_MARKDOWN → CLI_REPORTED_ERROR with details.stage='envelope-error').
import { JS_TEMPLATE } from "./_template.js";
import {
  linksEvalResponseSchema,
  type LinksEvalErrorCode,
  type LinksInput,
  type LinksOutput,
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

export async function executeLinks(
  input: LinksInput,
  deps: ExecuteDeps,
): Promise<LinksOutput> {
  const payloadJson = JSON.stringify({
    active: input.target_mode === "active",
    path: input.target_mode === "specific" ? input.path ?? null : null,
    file: input.target_mode === "specific" ? input.file ?? null : null,
    total: input.total === true,
  });
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

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
      message: `links: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  const validated = linksEvalResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "links: eval response shape unexpected",
    });
  }

  if (validated.data.ok === true) {
    return { count: validated.data.count, links: validated.data.links };
  }

  throw mapEnvelopeError(validated.data.code, validated.data.detail);
}

function mapEnvelopeError(code: LinksEvalErrorCode, detail: string): UpstreamError {
  switch (code) {
    case "NO_ACTIVE_FILE":
      // T0.2 lock: align with BI-015 read_heading precedent — envelope
      // NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (not CLI_REPORTED_ERROR).
      return new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: null,
        details: { stage: "envelope-error", detail },
        message: "links: no note focused; switch to specific mode or focus a note.",
      });
    case "FILE_NOT_FOUND":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `links: file not found (${detail})`,
      });
    case "NOT_MARKDOWN":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `links: target is not a Markdown note (${detail})`,
      });
  }
}
