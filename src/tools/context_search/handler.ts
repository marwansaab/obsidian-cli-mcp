// Original — no upstream. context_search handler — single-subcommand wrapper over
// obsidian search:context with FR-013 post-empty folder-existence probe (R4) and
// FR-012 CRLF strip (R5). Re-uses BI-033's stripBoundarySlashes + searchContextWireSchema
// via direct imports (R6 / R8 — module direction context_search → search, no cycle).
// Pipeline: assemble parameters (query as one escaped, double-quoted phrase per spec
// 087, format=json, optional path, optional case) → invokeCli(search:context). No
// `limit` is forwarded upstream (BI-055): upstream returns the full match set, the
// wrapper sorts it, then slices to appliedCap, so the visible subset is the
// (path asc, line asc) leading N across the entire match set.
// Zero-match sentinel branch — if folder was supplied and normalises non-empty, fire a
// second invokeCli(folder) probe so a missing folder surfaces as the inherited
// dispatch-classifier CLI_REPORTED_ERROR instead of count=0. JSON.parse / wire-parse
// failures emit CLI_REPORTED_ERROR(details.stage). The rows come from lineMatches
// (search/line-matches.ts, shared with search's line mode): one entry per line (none
// for a line-break query; spec 087), a single trailing \r stripped per FR-012, text
// capped at 500 chars + U+2026 marker, conservative truncation via
// `flat.length >= appliedCap` (fires on a real drop and at flat===cap with no drop —
// FR-005), sorted by (path, line) ascending, sliced to appliedCap. Output
// boundary-validated via contextSearchOutputSchema.
import {
  contextSearchOutputSchema,
  type ContextSearchInput,
  type ContextSearchOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { stripBoundarySlashes } from "../search/handler.js";
import { lineMatches } from "../search/line-matches.js";
import { literalPhraseQuery } from "../search/literal-phrase.js";
import { searchContextWireSchema } from "../search/schema.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_CAP = 1000;
const ZERO_MATCH_SENTINEL = "No matches found.";

function stripCr(s: string): string {
  return s.endsWith("\r") ? s.slice(0, -1) : s;
}

export async function executeContextSearch(
  input: ContextSearchInput,
  deps: ExecuteDeps,
): Promise<ContextSearchOutput> {
  const appliedCap = input.limit ?? DEFAULT_CAP;

  const parameters: Record<string, string | true> = {
    query: literalPhraseQuery(input.query),
    format: "json",
  };

  let normalisedFolder: string | undefined;
  if (input.folder !== undefined) {
    const stripped = stripBoundarySlashes(input.folder);
    if (stripped.length > 0) {
      normalisedFolder = stripped;
      parameters.path = stripped;
    }
  }

  if (input.case_sensitive === true) parameters.case = true;

  const result = await invokeCli(
    {
      command: "search:context",
      vault: input.vault,
      parameters,
      flags: [],
      target_mode: "specific",
    },
    deps,
  );

  if (result.stdout.trim() === ZERO_MATCH_SENTINEL) {
    if (normalisedFolder !== undefined) {
      // FR-013 post-empty folder-existence probe (R4). The dispatch classifier
      // catches `Error: Folder "X" not found.` stdout and throws
      // CLI_REPORTED_ERROR; we propagate verbatim. A success here just confirms
      // the folder exists but had no matches — return the empty envelope.
      await invokeCli(
        {
          command: "folder",
          vault: input.vault,
          parameters: { path: normalisedFolder },
          flags: [],
          target_mode: "specific",
        },
        deps,
      );
    }
    return contextSearchOutputSchema.parse({ count: 0, matches: [] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `context_search: CLI stdout was not valid JSON: ${(cause as Error).message}`,
    });
  }

  const wireParsed = searchContextWireSchema.safeParse(parsed);
  if (!wireParsed.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: wireParsed.error,
      details: { stage: "wire-parse", stdout: result.stdout.slice(0, 500) },
      message: "context_search: CLI JSON failed search:context wire-schema parse",
    });
  }

  return contextSearchOutputSchema.parse(
    lineMatches(input.query, wireParsed.data, appliedCap, stripCr),
  );
}
