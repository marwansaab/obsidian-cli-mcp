// Original — no upstream. smart_connections_query handler — single invokeEval call with the frozen JS template + base64 JSON payload (R6 anti-injection); R2/R3 single-call architecture branched at envelope-emission on a.total; a closed vault is brought up by the shared ADR-029 cold-start retry inside invokeEval, and a vault that cannot be brought up propagates as that retry's CLI_REPORTED_ERROR unchanged (spec 072); stage-1 extraction reads the call's tagged eval answer (spec 080 FR-002, superseding the R14 LAST-`=> ` strategy) because the plugin's lookup API emits plugin-side console.log output around the eval-return line; two-stage parse (JSON.parse → smartConnectionsQueryEvalResponseSchema.safeParse); envelope ok:false → UpstreamError mapping per R13 — three envelope codes flatten the (code, reason) pair for parse-time discrimination; handler unflattens into CLI_REPORTED_ERROR(details.code='SMART_CONNECTIONS_NOT_READY', details.reason='api-missing'|'embed-failed') per ADR-015.
import { JS_TEMPLATE } from "./_template.js";
import {
  smartConnectionsQueryEvalResponseSchema,
  type SmartConnectionsQueryEvalErrorCode,
  type SmartConnectionsQueryInput,
  type SmartConnectionsQueryOutput,
} from "./schema.js";
import { invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { decodeEvalEnvelope } from "../_active-file.js";
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

  const result = await invokeEval({ code, vault: input.vault }, deps);

  // === Stage 1 — decode this call's tagged eval answer (spec 080 FR-002, superseding R14) ===
  // The plugin's lookup API emits plugin-side console.log lines
  // ("Found and returned N smart_blocks.") AND `[warn]` lines on stdout around
  // the eval-return line. invokeEval returns the body of this call's own tagged
  // answer line as `answer`, so those lines (look-alike `=> ` lines included)
  // are ignored wherever they appear.
  const envelope = decodeEvalEnvelope(result, smartConnectionsQueryEvalResponseSchema, {
    toolName: "smart_connections_query",
    malformedCode: "CLI_REPORTED_ERROR",
  });

  // === Stage 2 — discriminate on `ok` ===
  if (envelope.ok === true) {
    return { count: envelope.count, matches: envelope.matches };
  }

  throw mapEnvelopeError(envelope.code, envelope.detail);
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
