// Original — no upstream. context_search handler — single-subcommand wrapper over
// obsidian search:context with FR-013 post-empty folder-existence probe (R4) and
// FR-012 CRLF strip (R5). Re-uses BI-033's stripBoundarySlashes + searchContextWireSchema
// via direct imports (R6 / R8 — module direction context_search → search, no cycle).
// Pipeline: assemble parameters (query, format=json, optional path, limit, optional
// case) → invokeCli(search:context). Zero-match sentinel branch — if folder was
// supplied and normalises non-empty, fire a second invokeCli(folder) probe so a
// missing folder surfaces as the inherited dispatch-classifier CLI_REPORTED_ERROR
// instead of count=0. JSON.parse / wire-parse failures emit
// CLI_REPORTED_ERROR(details.stage). Flatten file-grouped wire to per-line rows,
// strip a single trailing \r per FR-012, cap text at 500 chars + U+2026 marker,
// detect truncation via cliFileCapFired OR flatExceedsCap (R9 conservative line-mode
// trade-off inherited from BI-033 R3), trim if needed, sort by (path, line)
// ascending. Output boundary-validated via contextSearchOutputSchema.
import {
  contextSearchOutputSchema,
  type ContextSearchInput,
  type ContextSearchMatch,
  type ContextSearchOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { stripBoundarySlashes } from "../search/handler.js";
import { searchContextWireSchema } from "../search/schema.js";

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

function stripCr(s: string): string {
  return s.endsWith("\r") ? s.slice(0, -1) : s;
}

function capLine(text: string): string {
  return text.length <= TEXT_CAP ? text : text.slice(0, TEXT_CAP) + ELLIPSIS;
}

export async function executeContextSearch(
  input: ContextSearchInput,
  deps: ExecuteDeps,
): Promise<ContextSearchOutput> {
  const appliedCap = input.limit ?? DEFAULT_CAP;

  const parameters: Record<string, string | true> = {
    query: input.query,
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

  parameters.limit = String(appliedCap);
  if (input.case_sensitive === true) parameters.case = true;

  const result = await invokeCli(
    {
      command: "search:context",
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
        {
          spawnFn: deps.spawnFn,
          env: deps.env,
          logger: deps.logger,
          queue: deps.queue,
        },
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

  const wire = wireParsed.data;
  const mdOnly = wire.filter((f) => f.file.toLowerCase().endsWith(".md"));
  const flat: ContextSearchMatch[] = mdOnly.flatMap((f) =>
    f.matches.map((m) => ({
      path: f.file,
      line: m.line,
      text: capLine(stripCr(m.text)),
    })),
  );
  const cliFileCapFired = mdOnly.length === appliedCap;
  const flatExceedsCap = flat.length > appliedCap;
  const truncated = cliFileCapFired || flatExceedsCap;
  const trimmed = flatExceedsCap ? flat.slice(0, appliedCap) : flat;
  const sorted = [...trimmed].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line,
  );
  return contextSearchOutputSchema.parse({
    count: sorted.length,
    matches: sorted,
    ...(truncated ? { truncated: true as const } : {}),
  });
}
