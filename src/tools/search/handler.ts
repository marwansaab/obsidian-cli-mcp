// Original — no upstream. search handler — two-subcommand router (`search` /
// `search:context`) wrapping the native CLI; subcommand selection keyed on
// input.context_lines (R2). Zero-match sentinel detection on `No matches found.`
// stdout returns the empty envelope for the active mode rather than an error
// (FR-012 / R4 / F2). Staged parse — JSON.parse failures throw CLI_REPORTED_ERROR
// with details.stage="json-parse"; wire-schema failures with details.stage=
// "wire-parse" (I-7 / I-8). Default-mode pipeline: filter to `.md`, detect cap-clip
// via the appliedCap+1 probe trick (R3), sort UTF-16 ascending. Line-mode pipeline:
// file-level `.md` filter, flatMap to flat rows (drops empty `matches: []` entries
// naturally — R9), cap each text at 500 chars + U+2026 ellipsis (FR-024 / R10),
// detect truncation via cli-file-cap-fired OR flat-exceeds-cap (R3 conservative
// trade-off), sort by path asc then line asc (FR-019 / R11). Output schemas
// validated at the boundary. `truncated` field present only when true (I-11 /
// FR-023). Folder leading/trailing `/` normalised wrapper-side (FR-006 / I-5);
// empty post-strip omits the `path` parameter from CLI invocation. Zero new
// top-level error codes; zero new details.code values — Principle IV preserved.
import {
  searchContextWireSchema,
  searchDefaultOutputSchema,
  searchDefaultWireSchema,
  searchLineOutputSchema,
  type SearchDefaultOutput,
  type SearchInput,
  type SearchLineOutput,
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

const TEXT_CAP = 500;
const ELLIPSIS = "…";
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
    query: input.query,
    format: "json",
  };
  if (input.folder !== undefined) {
    const normalised = stripBoundarySlashes(input.folder);
    if (normalised.length > 0) parameters.path = normalised;
  }
  parameters.limit = String(useLines ? appliedCap : appliedCap + 1);
  if (input.case_sensitive === true) parameters.case = true;

  const result = await invokeCli(
    {
      command: useLines ? "search:context" : "search",
      vault: input.vault,
      parameters,
      flags: [],
      target_mode: "specific",
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
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
    const wire = wireParsed.data;
    const mdOnly = wire.filter((f) => f.file.toLowerCase().endsWith(".md"));
    const flat = mdOnly.flatMap((f) =>
      f.matches.map((m) => ({
        path: f.file,
        line: m.line,
        text: m.text.length <= TEXT_CAP ? m.text : m.text.slice(0, TEXT_CAP) + ELLIPSIS,
      })),
    );
    const cliFileCapFired = mdOnly.length === appliedCap;
    const flatExceedsCap = flat.length > appliedCap;
    const truncated = cliFileCapFired || flatExceedsCap;
    const sorted = [...flat].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line,
    );
    const trimmed = flatExceedsCap ? sorted.slice(0, appliedCap) : sorted;
    return searchLineOutputSchema.parse({
      count: trimmed.length,
      matches: trimmed,
      ...(truncated ? { truncated: true as const } : {}),
    });
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
    const truncated = mdOnly.length === appliedCap + 1;
    const sorted = [...mdOnly].sort();
    const trimmed = truncated ? sorted.slice(0, appliedCap) : sorted;
    return searchDefaultOutputSchema.parse({
      count: trimmed.length,
      paths: trimmed,
      ...(truncated ? { truncated: true as const } : {}),
    });
  }
}
