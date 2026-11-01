// Original — no upstream. tag handler — single invokeEval call with the frozen JS template + base64 JSON payload (R6 / FR-020 anti-injection); R2/R3 single-call architecture branched at envelope-emission on `wantTotal`; a closed vault is brought up by the shared ADR-029 cold-start retry in the dispatch layer, so the handler has no closed-vault stage of its own (spec 072); stage-1 extraction reads the call's tagged eval answer, so other plugins' output around it is ignored (spec 080); stages 2-5 multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok → per-mode output validation) with structured CLI_REPORTED_ERROR propagation; ZERO new top-level error codes + ZERO new details.code values (preserves fourteen-tool zero-new-codes streak).
import { JS_TEMPLATE } from "./_template.js";
import {
  tagCountOnlyOutputSchema,
  tagDefaultOutputSchema,
  tagEvalEnvelopeSchema,
  type TagCountOnlyOutput,
  type TagDefaultOutput,
  type TagInput,
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

export async function executeTag(
  input: TagInput,
  deps: ExecuteDeps,
): Promise<TagDefaultOutput | TagCountOnlyOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    query: input.tag,
    total: input.total === true,
  });

  const result = await invokeEval({ code, vault: input.vault }, deps);

  // === Stage 1 — decode this call's tagged eval answer into the envelope; other plugins' output is ignored (spec 080) ===
  const envelope = decodeEvalEnvelope(result, tagEvalEnvelopeSchema, {
    toolName: "tag",
    malformedCode: "CLI_REPORTED_ERROR",
  });

  // === Stage 2 — discriminate on ok ===
  if (!envelope.ok) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stage: "envelope-error", code: envelope.code, detail: envelope.detail },
      message: `tag: eval envelope reported ${envelope.code}${envelope.detail ? ` (${envelope.detail})` : ""}`,
    });
  }

  // === Stage 3 — per-mode output validation + return ===
  if (envelope.mode === "count-only") {
    return tagCountOnlyOutputSchema.parse(envelope.total);
  }
  return tagDefaultOutputSchema.parse({
    count: envelope.count,
    paths: envelope.paths,
  });
}
