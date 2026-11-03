// Original — no upstream. pattern_search handler — single invokeEval call with the frozen JS template + base64 JSON payload (R12 anti-injection); single-call architecture (R2); folder normalisation via stripBoundarySlashes (R5 sibling-consumption from ../search/handler.ts); a closed vault is brought up by the dispatch layer's cold-start retry (ADR-029), and an empty answer falls through to the json-parse failure; multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse / FOLDER_NOT_FOUND; envelope match order kept as is, because the template owns the (path, line, offset) order: it sorts notes by path before its capped scan, so no handler-side sort could repair a capped subset (BI-0183); zero new top-level error codes; zero new details.code values — Principle IV streak preserved.
import { JS_TEMPLATE } from "./_template.js";
import {
  patternSearchEvalEnvelopeSchema,
  patternSearchOutputSchema,
  type PatternSearchInput,
  type PatternSearchOutput,
} from "./schema.js";
import { invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { parseEvalAnswer, stdoutDetails } from "../_eval-parse.js";
import { composeEvalCode } from "../_shared.js";
import { stripBoundarySlashes } from "../search/handler.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

const DEFAULT_CAP = 1000;

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executePatternSearch(
  input: PatternSearchInput,
  deps: ExecuteDeps,
): Promise<PatternSearchOutput> {
  // === Stage 1 — folder normalisation (R5 — stripBoundarySlashes from sibling search) ===
  let normalisedFolder: string | null = null;
  if (input.folder !== undefined) {
    const stripped = stripBoundarySlashes(input.folder);
    if (stripped.length > 0) normalisedFolder = stripped;
  }

  const appliedCap = input.limit ?? DEFAULT_CAP;

  // === Stage 2 — payload assembly + template render (R12) ===
  const code = composeEvalCode(JS_TEMPLATE, {
    pattern: input.pattern,
    folder: normalisedFolder,
    case_sensitive: input.case_sensitive !== false,
    limit: appliedCap,
  });

  // === Stage 3 — single invokeEval (R2) ===
  const result = await invokeEval({ code, vault: input.vault }, deps);

  // === Stage 4 — invokeEval returns this call's tagged eval answer as `answer`; other plugins' output is ignored (spec 080) ===

  // === Stage 5 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = parseEvalAnswer(result.answer);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", ...stdoutDetails(result.stdout) },
      message: `pattern_search: CLI stdout was not valid JSON: ${(err as Error).message}`,
    });
  }

  // === Stage 6 — envelope safeParse ===
  const validated = patternSearchEvalEnvelopeSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", ...stdoutDetails(result.stdout) },
      message: "pattern_search: CLI JSON failed envelope wire-schema parse",
    });
  }

  // === Stage 7 — discriminate on ok ===
  if (validated.data.ok === false) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        code: "FOLDER_NOT_FOUND",
        folder: validated.data.folder,
        stage: "handler-stage-3",
      },
      message: "pattern_search: folder not found in vault",
    });
  }

  // === Stage 8 — post-process ok branch (R6 defensive .md filter, output validation; order is the template's, BI-0183) ===
  const mdOnly = validated.data.matches.filter((m) => m.path.toLowerCase().endsWith(".md"));
  return patternSearchOutputSchema.parse({
    count: mdOnly.length,
    matches: mdOnly,
    ...(validated.data.truncated ? { truncated: true as const } : {}),
  });
}
