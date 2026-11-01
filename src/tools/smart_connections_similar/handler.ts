// Original — no upstream. smart_connections_similar handler — single invokeEval call with the frozen JS template + base64 JSON payload (R6 anti-injection); R2/R3 single-call architecture branched at envelope-emission on a.total; a closed vault is brought up by the dispatch layer's cold-start retry (ADR-029), and an empty answer fails at json-parse; two-stage parse step (JSON.parse → smartConnectionsSimilarEvalResponseSchema.safeParse) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse failure; envelope ok:false → UpstreamError mapping per R13 (NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE for BI-015 / BI-025 parity per T0.1 lock; FILE_NOT_FOUND / NOT_MARKDOWN / SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY / SOURCE_NOT_INDEXED → CLI_REPORTED_ERROR with details.stage='envelope-error').
import { JS_TEMPLATE } from "./_template.js";
import {
  smartConnectionsSimilarEvalResponseSchema,
  type SmartConnectionsSimilarEvalErrorCode,
  type SmartConnectionsSimilarInput,
  type SmartConnectionsSimilarOutput,
} from "./schema.js";
import { invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { decodeEvalEnvelope } from "../_active-file.js";
import { composeEvalCode } from "../_shared.js";

import type { SupportDeclaration } from "../../file-type/file-type.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

/** smart_connections_similar takes a Markdown note as its source; others keep their NOT_MARKDOWN rejection (spec 070 FR-007a). */
export const SMART_CONNECTIONS_SIMILAR_SUPPORTED = ["note"] as const satisfies SupportDeclaration;

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeSmartConnectionsSimilar(
  input: SmartConnectionsSimilarInput,
  deps: ExecuteDeps,
): Promise<SmartConnectionsSimilarOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    active: input.target_mode === "active",
    path: input.target_mode === "specific" ? (input.path ?? null) : null,
    file: input.target_mode === "specific" ? (input.file ?? null) : null,
    limit: input.limit,
    total: input.total === true,
  });

  const result = await invokeEval({ code, vault: input.target_mode === "specific" ? input.vault : undefined }, deps);

  // === Stage 1 — decode this call's tagged eval answer into the envelope; other plugins' output is ignored (spec 080) ===
  const envelope = decodeEvalEnvelope(result, smartConnectionsSimilarEvalResponseSchema, {
    toolName: "smart_connections_similar",
    malformedCode: "CLI_REPORTED_ERROR",
  });

  // === Stage 2 — discriminate on `ok` ===
  if (envelope.ok === true) {
    return { count: envelope.count, matches: envelope.matches };
  }

  throw mapEnvelopeError(envelope.code, envelope.detail);
}

function mapEnvelopeError(
  code: SmartConnectionsSimilarEvalErrorCode,
  detail: string,
): UpstreamError {
  switch (code) {
    case "NO_ACTIVE_FILE":
      // T0.1 lock: align with BI-015 read_heading / BI-025 links precedent — envelope
      // NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (not CLI_REPORTED_ERROR).
      return new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: null,
        details: { stage: "envelope-error", detail },
        message: "smart_connections_similar: no note focused; switch to specific mode or focus a note.",
      });
    case "FILE_NOT_FOUND":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: file not found (${detail})`,
      });
    case "NOT_MARKDOWN":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: target is not a Markdown note (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_INSTALLED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: Smart Connections plugin is not installed in the vault (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_READY":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, reason: "api-missing", detail },
        message: `smart_connections_similar: Smart Connections plugin is loaded but its similarity API is not ready (${detail})`,
      });
    case "SOURCE_NOT_INDEXED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: source note has no embedding yet (${detail})`,
      });
  }
}
