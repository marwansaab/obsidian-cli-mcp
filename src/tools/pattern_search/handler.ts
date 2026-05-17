// Original — no upstream. pattern_search handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R12 anti-injection); single-call architecture (R2); folder normalisation via stripBoundarySlashes (R5 sibling-consumption from ../search/handler.ts); closed-but-registered-vault detection via the shared _eval-vault-closed-detection module (sibling parity with paths); multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse / FOLDER_NOT_FOUND; (path, line, offset) ascending sort (R2); zero new top-level error codes; zero new details.code values — Principle IV streak preserved.
import { JS_TEMPLATE } from "./_template.js";
import {
  patternSearchEvalEnvelopeSchema,
  patternSearchOutputSchema,
  type PatternSearchInput,
  type PatternSearchMatch,
  type PatternSearchOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { detectIfClosed } from "../_eval-vault-closed-detection/index.js";
import { composeEvalCode } from "../_shared.js";
import { stripBoundarySlashes } from "../search/handler.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

const DEFAULT_CAP = 1000;

export interface ExecuteDeps {
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

  // === Stage 3 — single invokeCli (R2) ===
  const result = await invokeCli(
    {
      command: "eval",
      vault: input.vault,
      parameters: { code },
      flags: [],
      target_mode: "specific",
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  // === Stage 4 — strip eval prefix ===
  let stdout = result.stdout.trimStart();
  if (stdout.startsWith("=> ")) stdout = stdout.slice(3);

  // === Stage 5 — closed-but-registered-vault detection (sibling parity with paths) ===
  if (typeof input.vault === "string" && result.stdout.trim().length === 0) {
    const vaultName = input.vault;
    const isRegistered = await detectIfClosed({ vaultName, deps });
    if (isRegistered) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          code: "VAULT_NOT_FOUND",
          reason: "not-open",
          stage: "handler-stage-0",
          vault: vaultName,
        },
        message: `pattern_search: vault "${vaultName}" is registered but not open`,
      });
    }
  }

  // === Stage 6 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stdout);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `pattern_search: CLI stdout was not valid JSON: ${(err as Error).message}`,
    });
  }

  // === Stage 7 — envelope safeParse ===
  const validated = patternSearchEvalEnvelopeSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "pattern_search: CLI JSON failed envelope wire-schema parse",
    });
  }

  // === Stage 8 — discriminate on ok ===
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

  // === Stage 9 — post-process ok branch (R6 defensive .md filter, R2 sort, output validation) ===
  const mdOnly = validated.data.matches.filter((m) => m.path.toLowerCase().endsWith(".md"));
  const sorted = [...mdOnly].sort(comparePatternSearchMatch);
  return patternSearchOutputSchema.parse({
    count: sorted.length,
    matches: sorted,
    ...(validated.data.truncated ? { truncated: true as const } : {}),
  });
}

function comparePatternSearchMatch(a: PatternSearchMatch, b: PatternSearchMatch): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  if (a.line !== b.line) return a.line - b.line;
  return a.offset - b.offset;
}
