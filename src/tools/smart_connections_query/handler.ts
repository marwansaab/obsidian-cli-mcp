// Original — no upstream. smart_connections_query handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R6 anti-injection); R2/R3 single-call architecture branched at envelope-emission on a.total; a closed vault is brought up by the shared ADR-029 cold-start retry inside invokeCli, and a vault that cannot be brought up propagates as that retry's CLI_REPORTED_ERROR unchanged (spec 072); stage-1 extraction uses LAST-`=> ` strategy (R14) because the plugin's lookup API emits plugin-side console.log output BEFORE the `=> ` eval-return marker; two-stage parse (JSON.parse → smartConnectionsQueryEvalResponseSchema.safeParse); envelope ok:false → UpstreamError mapping per R13 — three envelope codes flatten the (code, reason) pair for parse-time discrimination; handler unflattens into CLI_REPORTED_ERROR(details.code='SMART_CONNECTIONS_NOT_READY', details.reason='api-missing'|'embed-failed') per ADR-015.
import { JS_TEMPLATE } from "./_template.js";
import {
  smartConnectionsQueryEvalResponseSchema,
  type SmartConnectionsQueryEvalErrorCode,
  type SmartConnectionsQueryInput,
  type SmartConnectionsQueryOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { composeEvalCode } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeSmartConnectionsQuery(
  input: SmartConnectionsQueryInput,
  deps: ExecuteDeps,
): Promise<SmartConnectionsQueryOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    query: input.query,
    limit: input.limit,
    total: input.total === true,
  });

  const result = await invokeCli(
    {
      command: "eval",
      vault: input.vault,
      parameters: { code },
      flags: [],
      target_mode: input.vault ? "specific" : "active",
    },
    deps,
  );

  // === Stage 1 — LAST-`=> ` extraction (R14) ===
  // The plugin's lookup API emits plugin-side console.log lines
  // ("Found and returned N smart_blocks.") AND `[warn]` lines on stdout BEFORE
  // the `=> ` eval-return marker. BI-026's trimStart+startsWith strategy does
  // not survive this; we anchor on the LAST `\n=> ` occurrence with fallbacks
  // for the no-preamble and no-marker cases.
  let payload: string;
  const marker = "\n=> ";
  const idx = result.stdout.lastIndexOf(marker);
  if (idx >= 0) {
    payload = result.stdout.slice(idx + marker.length);
  } else if (result.stdout.startsWith("=> ")) {
    payload = result.stdout.slice(3);
  } else {
    payload = result.stdout;
  }

  // === Stage 2 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(payload);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `smart_connections_query: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  // === Stage 3 — envelope safeParse ===
  const validated = smartConnectionsQueryEvalResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "smart_connections_query: eval response shape unexpected",
    });
  }

  // === Stage 4 — discriminate on `ok` ===
  if (validated.data.ok === true) {
    return { count: validated.data.count, matches: validated.data.matches };
  }

  throw mapEnvelopeError(validated.data.code, validated.data.detail);
}

function mapEnvelopeError(
  code: SmartConnectionsQueryEvalErrorCode,
  detail: string,
): UpstreamError {
  switch (code) {
    case "SMART_CONNECTIONS_NOT_INSTALLED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_query: Smart Connections plugin is not installed in the vault (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_READY_API_MISSING":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          stage: "envelope-error",
          code: "SMART_CONNECTIONS_NOT_READY",
          reason: "api-missing",
          detail,
        },
        message: `smart_connections_query: Smart Connections plugin is loaded but its lookup API is unavailable (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_READY_EMBED_FAILED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          stage: "envelope-error",
          code: "SMART_CONNECTIONS_NOT_READY",
          reason: "embed-failed",
          detail,
        },
        message: `smart_connections_query: lookup returned an error sentinel (${detail})`,
      });
  }
}
