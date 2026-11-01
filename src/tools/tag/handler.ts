// Original — no upstream. tag handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R6 / FR-020 anti-injection); R2/R3 single-call architecture branched at envelope-emission on `wantTotal`; a closed vault is brought up by the shared ADR-029 cold-start retry in the dispatch layer, so the handler has no closed-vault stage of its own (spec 072); stage-1 extraction reads the call's tagged eval answer, so other plugins' output around it is ignored (spec 080); stages 2-5 multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok → per-mode output validation) with structured CLI_REPORTED_ERROR propagation; ZERO new top-level error codes + ZERO new details.code values (preserves fourteen-tool zero-new-codes streak).
import { JS_TEMPLATE } from "./_template.js";
import {
  tagCountOnlyOutputSchema,
  tagDefaultOutputSchema,
  tagEvalEnvelopeSchema,
  type TagCountOnlyOutput,
  type TagDefaultOutput,
  type TagInput,
} from "./schema.js";
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { parseEvalAnswer, stdoutDetails } from "../_eval-parse.js";
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

  // === Stage 1 — invokeCli returns this call's tagged eval answer as `answer`; other plugins' output is ignored (spec 080) ===

  // === Stage 2 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = parseEvalAnswer(result.answer);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", ...stdoutDetails(result.stdout) },
      message: `tag: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  // === Stage 3 — envelope safeParse ===
  const validated = tagEvalEnvelopeSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", ...stdoutDetails(result.stdout) },
      message: "tag: eval response shape unexpected",
    });
  }
  const envelope = validated.data;

  // === Stage 4 — discriminate on ok ===
  if (!envelope.ok) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stage: "envelope-error", code: envelope.code, detail: envelope.detail },
      message: `tag: eval envelope reported ${envelope.code}${envelope.detail ? ` (${envelope.detail})` : ""}`,
    });
  }

  // === Stage 5 — per-mode output validation + return ===
  if (envelope.mode === "count-only") {
    return tagCountOnlyOutputSchema.parse(envelope.total);
  }
  return tagDefaultOutputSchema.parse({
    count: envelope.count,
    paths: envelope.paths,
  });
}
