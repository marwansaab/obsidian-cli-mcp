// Original — no upstream. search handler — two-subcommand router (`search` /
// `search:context`) wrapping the native CLI; subcommand selection keyed on
// input.context_lines (R2). The query is sent as one escaped regular expression
// (spec 087, BI-0175, literal-phrase.ts) so the CLI matches it literally in both subcommands.
// Zero-match sentinel detection on `No matches found.` stdout returns the empty
// envelope for the active mode rather than an error (FR-012 / R4 / F2). Staged
// parse — JSON.parse failures throw CLI_REPORTED_ERROR with details.stage=
// "json-parse"; wire-schema failures with details.stage="wire-parse" (I-7 / I-8).
// No `limit` is forwarded upstream (BI-055): upstream returns the full match set,
// the wrapper sorts it, then slices to appliedCap, so the visible subset is the
// path-ascending leading N across the entire match set.
// Default-mode pipeline: filter to `.md`, sort UTF-16 ascending, detect truncation
// precisely via `mdOnly.length > appliedCap`, slice to appliedCap when truncated.
// Line-mode pipeline: selectLines + lineOutput (line-matches.ts, shared with context_search) —
// `.md` filter, one entry per line (none for a line-break query; spec 087), flat
// rows (drops empty `matches: []` entries naturally — R9), 500-char cap + U+2026
// (FR-024 / R10), conservative truncation (FR-005), (path, line) ascending sort
// (FR-019 / R11), slice to appliedCap; this mode keeps a trailing \r in the text.
// Output schemas validated at the boundary. `truncated` field present only when
// true (I-11 / FR-023). Folder leading/trailing `/` normalised wrapper-side (FR-006 / I-5);
// empty post-strip omits the `path` parameter from CLI invocation. Zero new
// top-level error codes; zero new details.code values — Principle IV preserved.
import { lineOutput, selectLines } from "./line-matches.js";
import { literalPhraseQuery } from "./literal-phrase.js";
import {
  searchContextWireSchema,
  searchDefaultOutputSchema,
  searchDefaultWireSchema,
  searchLineOutputSchema,
  type SearchDefaultOutput,
  type SearchInput,
  type SearchLineOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

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

export function stripBoundarySlashes(s: string): string {
  let r = s;
  if (r.startsWith("/")) r = r.slice(1);
  if (r.endsWith("/")) r = r.slice(0, -1);
  return r;
}

export async function executeSearch(
  input: SearchInput,
  deps: ExecuteDeps,
): Promise<SearchDefaultOutput | SearchLineOutput> {
  const useLines = input.context_lines === true;
  const appliedCap = input.limit ?? DEFAULT_CAP;

  const parameters: Record<string, string | true> = {
    query: literalPhraseQuery(input.query),
    format: "json",
  };
  if (input.folder !== undefined) {
    const normalised = stripBoundarySlashes(input.folder);
    if (normalised.length > 0) parameters.path = normalised;
  }
  if (input.case_sensitive === true) parameters.case = true;

  const result = await invokeCli(
    {
      command: useLines ? "search:context" : "search",
      vault: input.vault,
      parameters,
      flags: [],
      target_mode: "specific",
    },
    deps,
  );

  if (result.stdout.trim() === ZERO_MATCH_SENTINEL) {
    return useLines
      ? searchLineOutputSchema.parse({ count: 0, matches: [] })
      : searchDefaultOutputSchema.parse({ count: 0, paths: [] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `search: CLI stdout was not valid JSON: ${(cause as Error).message}`,
    });
  }

  if (useLines) {
    const wireParsed = searchContextWireSchema.safeParse(parsed);
    if (!wireParsed.success) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: wireParsed.error,
        details: { stage: "wire-parse", stdout: result.stdout.slice(0, 500) },
        message: "search: CLI JSON failed search:context wire-schema parse",
      });
    }
    return searchLineOutputSchema.parse(
      lineOutput(selectLines(input.query, wireParsed.data, appliedCap)),
    );
  } else {
    const wireParsed = searchDefaultWireSchema.safeParse(parsed);
    if (!wireParsed.success) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: wireParsed.error,
        details: { stage: "wire-parse", stdout: result.stdout.slice(0, 500) },
        message: "search: CLI JSON failed default-mode wire-schema parse",
      });
    }
    const wire = wireParsed.data;
    const mdOnly = wire.filter((p) => p.toLowerCase().endsWith(".md"));
    const truncated = mdOnly.length > appliedCap;
    const sorted = [...mdOnly].sort();
    const trimmed = truncated ? sorted.slice(0, appliedCap) : sorted;
    return searchDefaultOutputSchema.parse({
      count: trimmed.length,
      paths: trimmed,
      ...(truncated ? { truncated: true as const } : {}),
    });
  }
}
