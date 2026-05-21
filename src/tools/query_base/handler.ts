// Original — no upstream. query_base handler — wraps the native `obsidian base:query` subcommand (R1) returning a structured `{columns, rows, truncated, total_rows?}` envelope; staged pipeline: vault root resolve → Layer-2 canonical-path check → fs.stat pre-flight (BASE_NOT_FOUND / BASE_MALFORMED/empty) → invokeCli → stderr/stdout error classification (R4) → JSON.parse → wire envelope safeParse → closed-but-registered vault detection (cohort reuse, conditional pending T0 probe) → row post-process (reserved `path` injection + collision rename to `path_view` + columns vector synthesis) → 1000-row cap with `truncated` / `total_rows` signal (FR-013) → output schema parse. Zero new top-level error codes; new states surface via `details.code` sub-discrimination per ADR-015 (Principle IV streak: sixteenth tool).
import * as nodeFs from "node:fs/promises";
import { sep } from "node:path";

import {
  queryBaseOutputSchema,
  queryBaseWireSchema,
  QUERY_BASE_RESPONSE_ROW_CAP,
  type QueryBaseInput,
  type QueryBaseOutput,
  type QueryBaseRow,
  type QueryBaseWire,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { checkCanonicalPath } from "../../path-safety/canonical.js";
import { detectIfClosed } from "../_eval-vault-closed-detection/index.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteFs {
  stat: (p: string) => Promise<{ size: number }>;
  realpath: (p: string) => Promise<string>;
}

const DEFAULT_FS: ExecuteFs = {
  stat: async (p) => {
    const s = await nodeFs.stat(p);
    return { size: s.size };
  },
  realpath: (p) => nodeFs.realpath(p),
};

export interface FocusedVaultResponse {
  path: string | null;
  base: string;
}

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  fs?: ExecuteFs;
  /** Test seam. When absent, defaults to a wrapped `obsidian eval` against FOCUSED_VAULT_TEMPLATE. */
  invokeEval?: () => Promise<FocusedVaultResponse>;
}

export const FOCUSED_VAULT_TEMPLATE =
  "(async()=>JSON.stringify({path:app.workspace.getActiveFile()?.path??null,base:app.vault.adapter.basePath}))()";

function parseFocusedVaultStdout(stdout: string): FocusedVaultResponse | null {
  const trimmed = stdout.trimStart();
  const body = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;
  let outer: unknown;
  try {
    outer = JSON.parse(body);
  } catch {
    return null;
  }
  let parsed: unknown = outer;
  if (typeof outer === "string") {
    try {
      parsed = JSON.parse(outer);
    } catch {
      return null;
    }
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "base" in parsed &&
    typeof (parsed as { base: unknown }).base === "string"
  ) {
    const p = parsed as { path?: unknown; base: string };
    return {
      path: typeof p.path === "string" ? p.path : null,
      base: p.base,
    };
  }
  return null;
}

async function defaultInvokeEval(deps: ExecuteDeps): Promise<FocusedVaultResponse> {
  const result = await invokeCli(
    {
      command: "eval",
      parameters: { code: FOCUSED_VAULT_TEMPLATE },
      flags: [],
      target_mode: "active",
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );
  const out = parseFocusedVaultStdout(result.stdout);
  if (out === null) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stage: "focused-vault-resolve", stdout: result.stdout.slice(0, 500) },
      message: "query_base: focused-vault eval returned unparseable response",
    });
  }
  return out;
}

async function resolveVaultRoot(
  input: QueryBaseInput,
  deps: ExecuteDeps,
): Promise<string> {
  if (input.vault !== undefined) {
    try {
      return await deps.vaultRegistry.resolveVaultPath(input.vault);
    } catch (err) {
      if (err instanceof UpstreamError && err.code === "VALIDATION_ERROR") {
        throw new UpstreamError({
          code: "CLI_REPORTED_ERROR",
          cause: err,
          details: {
            code: "VAULT_NOT_FOUND",
            reason: "unknown",
            vault: input.vault,
          },
          message: `query_base: vault "${input.vault}" is not registered`,
        });
      }
      throw err;
    }
  }
  const invokeEval = deps.invokeEval ?? (() => defaultInvokeEval(deps));
  const focused = await invokeEval();
  return focused.base;
}

/**
 * Post-subprocess error classifier (R4 stage 3 / R5). Maps upstream's verbatim
 * error string (from stderr or stdout) onto the BI-039 sub-discriminator cohort.
 * The pattern table is populated empirically via /speckit-implement T0 probes
 * against the authorised test vault; until those land, the patterns below are
 * heuristic and the chain-of-custody fallback (`reason: "unknown"` carrying the
 * upstream message verbatim per Principle IV) covers unmatched cases.
 */
interface ClassifierMatch {
  kind: "BASE_MALFORMED";
  reason: "invalid-yaml" | "missing-required-key" | "unsupported-schema-version";
}
interface ClassifierViewMatch {
  kind: "VIEW_NOT_FOUND";
}
type ClassifierResult = ClassifierMatch | ClassifierViewMatch | null;

const CLASSIFIER_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  classify: () => ClassifierMatch | ClassifierViewMatch;
}> = [
  // VIEW_NOT_FOUND — upstream-reported missing-view-by-name patterns.
  {
    pattern: /\bview\b[^.]*\b(not\s+found|unknown|does\s+not\s+exist|no\s+such)\b/i,
    classify: () => ({ kind: "VIEW_NOT_FOUND" }),
  },
  // BASE_MALFORMED/invalid-yaml — YAML parser failures.
  {
    pattern: /\b(yaml(?:exception)?|yaml\s+parse|invalid\s+yaml|unexpected\s+token\s+at\s+line)\b/i,
    classify: () => ({ kind: "BASE_MALFORMED", reason: "invalid-yaml" }),
  },
  // BASE_MALFORMED/missing-required-key — schema-required key absent.
  {
    pattern: /\b(missing\s+required|required\s+key|views:\s+is\s+required|no\s+views\s+defined|key\s+['"]?views['"]?\s+is\s+required)\b/i,
    classify: () => ({ kind: "BASE_MALFORMED", reason: "missing-required-key" }),
  },
  // BASE_MALFORMED/unsupported-schema-version
  {
    pattern: /\b(unsupported\s+(schema\s+)?version|unknown\s+(schema\s+)?version|schema\s+version\s+\S+\s+(is\s+)?not\s+supported)\b/i,
    classify: () => ({ kind: "BASE_MALFORMED", reason: "unsupported-schema-version" }),
  },
];

function classifyUpstreamError(message: string): ClassifierResult {
  for (const entry of CLASSIFIER_PATTERNS) {
    if (entry.pattern.test(message)) return entry.classify();
  }
  return null;
}

interface RowPostProcessResult {
  rows: QueryBaseRow[];
  columns: string[];
}

/**
 * The hypothetical upstream metadata channel for the source-note path when a
 * view declares a custom column also named `path` (FR-002b collision case).
 * T0 probe #4 confirms the actual metadata channel; until then, the wrapper
 * recognises `_source_path` as a placeholder. If upstream emits a row containing
 * BOTH `_source_path` and a view-defined `path`, the wrapper uses `_source_path`
 * as the reserved row locator and renames the view-defined `path` to `path_view`.
 */
const SOURCE_PATH_METADATA_KEY = "_source_path";

function postProcessRows(
  upstreamRows: QueryBaseWire,
  fallbackColumns: string[] | null,
): RowPostProcessResult {
  if (upstreamRows.length === 0) {
    const columns = fallbackColumns ?? ["path"];
    if (!columns.includes("path")) columns.unshift("path");
    return { rows: [], columns };
  }

  // Detect collision: upstream emits a row carrying SOURCE_PATH_METADATA_KEY alongside
  // a view-defined `path` column. In that case, the wrapper-injected `path` wins
  // (from the metadata key) and the view-defined column moves to `path_view`.
  const firstRow = upstreamRows[0]!;
  const hasCollision =
    SOURCE_PATH_METADATA_KEY in firstRow && "path" in firstRow;

  // Derive column order from the first row's key iteration (ECMAScript insertion order),
  // excluding the metadata key.
  const firstRowKeys = Object.keys(firstRow).filter((k) => k !== SOURCE_PATH_METADATA_KEY);

  // Build columns vector. Reserved `path` at index 0; if collision, append `path_view`
  // at the position the view declared for the original `path`.
  let columns: string[];
  if (hasCollision) {
    columns = [];
    let pathSlotted = false;
    for (const key of firstRowKeys) {
      if (key === "path") {
        if (!pathSlotted) {
          columns.push("path");
          pathSlotted = true;
        }
        columns.push("path_view");
      } else {
        columns.push(key);
      }
    }
    if (!pathSlotted) columns.unshift("path");
  } else {
    columns = ["path"];
    for (const key of firstRowKeys) {
      if (key === "path") continue;
      columns.push(key);
    }
  }

  const rows: QueryBaseRow[] = upstreamRows.map((upstreamRow) => {
    const collisionInRow =
      SOURCE_PATH_METADATA_KEY in upstreamRow && "path" in upstreamRow;
    let reservedPath: string;
    let pathViewValue: unknown;

    if (collisionInRow) {
      const meta = upstreamRow[SOURCE_PATH_METADATA_KEY];
      if (typeof meta !== "string" || meta.length === 0) {
        throw new UpstreamError({
          code: "INTERNAL_ERROR",
          cause: null,
          details: {
            stage: "row-locator-synthesis",
            message: `upstream collision-metadata key ${SOURCE_PATH_METADATA_KEY} is not a non-empty string`,
          },
          message:
            "query_base: cannot synthesise reserved `path` row locator from upstream collision metadata",
        });
      }
      reservedPath = meta;
      pathViewValue = upstreamRow["path"];
    } else {
      const raw = upstreamRow["path"];
      if (typeof raw !== "string" || raw.length === 0) {
        throw new UpstreamError({
          code: "INTERNAL_ERROR",
          cause: null,
          details: {
            stage: "row-locator-synthesis",
            message: "upstream emitted no non-empty string `path` row locator and no collision metadata is available",
          },
          message:
            "query_base: cannot synthesise reserved `path` row locator from upstream emission",
        });
      }
      reservedPath = raw;
    }

    const out: QueryBaseRow = { path: reservedPath };
    if (collisionInRow) out["path_view"] = pathViewValue;
    for (const [k, val] of Object.entries(upstreamRow)) {
      if (k === "path") continue;
      if (k === SOURCE_PATH_METADATA_KEY) continue;
      out[k] = val;
    }
    return out;
  });

  return { rows, columns };
}

export async function executeQueryBase(
  input: QueryBaseInput,
  deps: ExecuteDeps,
): Promise<QueryBaseOutput> {
  const fs = deps.fs ?? DEFAULT_FS;
  const vaultLabel = input.vault ?? null;

  // === Stage 1 — vault root resolution + Layer-2 canonical-path check on the .base file ===
  const vaultRootRaw = await resolveVaultRoot(input, deps);
  const baseFileCheck = await checkCanonicalPath(vaultRootRaw, input.base_path, {
    realpath: fs.realpath,
  });
  if (!baseFileCheck.ok) {
    deps.logger.pathEscapeAttempt({
      vault: vaultLabel,
      attemptedPath: input.base_path,
    });
    throw new UpstreamError({
      code: "PATH_ESCAPES_VAULT",
      cause: null,
      details: {
        vault: vaultLabel,
        attemptedPath: input.base_path,
        resolvedPath: baseFileCheck.resolvedPath,
      },
    });
  }
  const resolvedBasePath = baseFileCheck.resolvedPath;

  // === Stage 2 — fs.stat pre-flight (R4 stage 1 + 2) ===
  let stats: { size: number };
  try {
    stats = await fs.stat(resolvedBasePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: err,
        details: { code: "BASE_NOT_FOUND", base_path: input.base_path },
        message: "query_base: base file not found at the supplied vault-relative path",
      });
    }
    throw err;
  }
  if (stats.size === 0) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        code: "BASE_MALFORMED",
        reason: "empty",
        base_path: input.base_path,
      },
      message: "query_base: base file is empty",
    });
  }

  // === Stage 3 — invoke upstream `obsidian base:query` ===
  const cliResult = await invokeCli(
    {
      command: "base:query",
      vault: input.vault,
      parameters: {
        path: input.base_path,
        view: input.view_name,
        format: "json",
      },
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

  // === Stage 4 — post-subprocess error classification (R4 stage 3 / R5) ===
  // Inspect stderr first, then stdout, for known error patterns. Upstream may emit
  // error text on either stream depending on the failure mode; T0 probes refine.
  const upstreamMessage = (cliResult.stderr.trim().length > 0
    ? cliResult.stderr.trim()
    : cliResult.stdout.trim());
  if (upstreamMessage.length > 0 && !upstreamMessage.startsWith("[")) {
    const classified = classifyUpstreamError(upstreamMessage);
    if (classified !== null) {
      if (classified.kind === "VIEW_NOT_FOUND") {
        throw new UpstreamError({
          code: "CLI_REPORTED_ERROR",
          cause: null,
          details: {
            code: "VIEW_NOT_FOUND",
            view_name: input.view_name,
            base_path: input.base_path,
          },
          message: "query_base: view not found in base file",
        });
      }
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          code: "BASE_MALFORMED",
          reason: classified.reason,
          base_path: input.base_path,
          message: upstreamMessage,
        },
        message: "query_base: base file is structurally unusable",
      });
    }
  }

  // === Stage 5 — closed-but-registered vault detection (cohort reuse, conditional) ===
  // T012 in tasks.md: dead-code candidate pending T0 probe (R10 #2). If upstream
  // surfaces closed-vault cleanly via exit code or stderr, this branch never fires.
  if (
    typeof input.vault === "string" &&
    cliResult.stdout.trim().length === 0 &&
    upstreamMessage.length === 0
  ) {
    const isRegistered = await detectIfClosed({
      vaultName: input.vault,
      deps: {
        logger: deps.logger,
        queue: deps.queue,
        spawnFn: deps.spawnFn,
        env: deps.env,
      },
    });
    if (isRegistered) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          code: "VAULT_NOT_FOUND",
          reason: "not-open",
          vault: input.vault,
        },
        message: `query_base: vault "${input.vault}" is registered but not open`,
      });
    }
  }

  // === Stage 6 — JSON.parse + wire envelope safeParse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cliResult.stdout);
  } catch (err) {
    // BASE_MALFORMED/unknown fallback only when STDERR carried a non-empty message
    // that no classifier pattern matched (chain-of-custody preserved via
    // details.message). When only stdout was non-JSON, surface as a clean
    // stage:json-parse for cohort parity with pattern_search.
    const stderrMessage = cliResult.stderr.trim();
    if (stderrMessage.length > 0) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: err,
        details: {
          code: "BASE_MALFORMED",
          reason: "unknown",
          base_path: input.base_path,
          message: stderrMessage,
        },
        message: "query_base: base file is structurally unusable (uncategorised)",
      });
    }
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: {
        stage: "json-parse",
        stdout: cliResult.stdout.slice(0, 500),
      },
      message: `query_base: CLI stdout was not valid JSON: ${(err as Error).message}`,
    });
  }

  const wireValidated = queryBaseWireSchema.safeParse(parsedJson);
  if (!wireValidated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: wireValidated.error,
      details: {
        stage: "envelope-parse",
        stdout: cliResult.stdout.slice(0, 500),
      },
      message: "query_base: CLI JSON failed wire-envelope schema parse",
    });
  }
  const upstreamRows: QueryBaseWire = wireValidated.data;

  // === Stage 7 — row post-process: path reservation + columns vector ===
  // Determinism (FR-003 / SC-003): the wrapper preserves upstream's emission order
  // verbatim. Per data-model.md the view's declared sort is trusted from upstream;
  // path-asc tiebreak is satisfied de facto when upstream emits in path order for
  // ties (R10 probe #3 validates the no-sort baseline). Same input → byte-identical
  // output. The wrapper does NOT re-sort because it has no signal for which column
  // the view declared as the primary sort key.
  const orderedRows = upstreamRows;
  const totalRowsBeforeCap = orderedRows.length;
  const capped = orderedRows.slice(0, QUERY_BASE_RESPONSE_ROW_CAP);
  const truncated = totalRowsBeforeCap > QUERY_BASE_RESPONSE_ROW_CAP;

  // For empty-rows upstream emission, we have no row-keys to derive columns from.
  // The wrapper degrades to the minimum-viable contract ["path"] per FR-002c — the
  // agent learns at least that `path` is always present. T0 probe #1 confirms
  // whether upstream emits a separate columns header for empty-view responses; if
  // so, we lift the column names from there.
  const { rows: rowsOut, columns } = postProcessRows(capped, null);

  // === Stage 8 — FR-005a view-name post-check ===
  // R5 documents that upstream owns the case-sensitive matching contract; the
  // wrapper passes view_name verbatim. No echo of view_name in upstream metadata
  // exists in the current contract surface — this stage is a no-op until T0
  // confirms an echo channel.
  void resolvedBasePath; // resolved path captured for debugging; suppress unused warning.
  void sep;

  // === Stage 9 — output schema parse (defence-in-depth) ===
  return queryBaseOutputSchema.parse({
    columns,
    rows: rowsOut,
    truncated,
    ...(truncated ? { total_rows: totalRowsBeforeCap } : {}),
  });
}
