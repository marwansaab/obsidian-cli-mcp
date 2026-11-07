// Original — no upstream. query_base handler — wraps the native `obsidian base:query` subcommand (R1) returning a structured `{columns, rows, truncated, total_rows?}` envelope; staged pipeline: vault root resolve → Layer-2 canonical-path check → fs.stat pre-flight (BASE_NOT_FOUND / BASE_MALFORMED/empty) → invokeCli → stderr/stdout error classification (R4) → JSON.parse → wire envelope safeParse → view grouping (BI-0207: read the `.base` and find the view's `groupBy` in TypeScript; an ungrouped view continues unchanged with no eval, a grouped view gets each row's group value from read-only eval batches and is reordered into Obsidian's group order with a reserved `group` key and a top-level `group_by`) → row post-process (reserved `path` injection + collision rename to `path_view` + columns vector synthesis) → 1000-row cap with `truncated` / `total_rows` signal (FR-013) → output schema parse. The invalid-yaml classifier pattern and the upstream-report composition are shared with views_base (spec 081, `_base-malformed.ts`). Zero new top-level error codes; new states surface via `details.code` sub-discrimination per ADR-015 (Principle IV streak: sixteenth tool).
import * as nodeFs from "node:fs/promises";

import { findViewGrouping } from "./group-by.js";
import { groupingUnsupported, groupRows, valueText } from "./group-order.js";
import { groupSource, readGroupValues, type GroupSource } from "./group-values.js";
import {
  queryBaseOutputSchema,
  queryBaseWireSchema,
  QUERY_BASE_RESPONSE_ROW_CAP,
  type QueryBaseGroupBy,
  type QueryBaseInput,
  type QueryBaseOutput,
  type QueryBaseRow,
  type QueryBaseWire,
} from "./schema.js";
import { invokeCli, invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError, stringDetail } from "../../errors.js";
import {
  assertCanonicalPath,
  FOCUSED_VAULT_TEMPLATE,
  parseFocusedVault,
  remapVaultNotFound,
} from "../_active-file.js";
import { INVALID_YAML_PATTERN, upstreamReport } from "../_base-malformed.js";
import { stdoutDetails } from "../_eval-parse.js";
import { getErrno } from "../_fs-errors.js";

import type { SupportDeclaration } from "../../file-type/file-type.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

/** query_base runs a view of a base (`base_path`); others keep their INVALID_BASE_PATH rejection (spec 070 FR-007a). */
export const QUERY_BASE_SUPPORTED = ["base"] as const satisfies SupportDeclaration;

export interface ExecuteFs {
  stat: (p: string) => Promise<{ size: number }>;
  realpath: (p: string) => Promise<string>;
  /** Reads the `.base` text (UTF-8) to find the view's grouping (BI-0207). */
  readFile: (p: string) => Promise<string>;
}

const DEFAULT_FS: ExecuteFs = {
  stat: async (p) => {
    const s = await nodeFs.stat(p);
    return { size: s.size };
  },
  realpath: (p) => nodeFs.realpath(p),
  readFile: (p) => nodeFs.readFile(p, "utf8"),
};

export interface FocusedVaultResponse {
  path: string | null;
  base: string;
}

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  fs?: ExecuteFs;
  /** Test seam. When absent, defaults to a wrapped `obsidian eval` against FOCUSED_VAULT_TEMPLATE. */
  invokeEval?: () => Promise<FocusedVaultResponse>;
}

async function defaultInvokeEval(deps: ExecuteDeps): Promise<FocusedVaultResponse> {
  const result = await invokeEval({ code: FOCUSED_VAULT_TEMPLATE }, deps);
  // Shared double-decode + shape-check; query_base collapses both failure stages
  // into its single focused-vault-resolve stage and discards the cause.
  const out = parseFocusedVault(result);
  if (!out.ok) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stage: "focused-vault-resolve", ...stdoutDetails(result.stdout) },
      message: "query_base: focused-vault eval returned unparseable response",
    });
  }
  return out.parsed;
}

async function resolveVaultRoot(
  input: QueryBaseInput,
  deps: ExecuteDeps,
): Promise<string> {
  if (input.vault !== undefined) {
    try {
      return await deps.vaultRegistry.resolveVaultPath(input.vault);
    } catch (err) {
      remapVaultNotFound(err, input.vault, "query_base");
    }
  }
  const evalFocusedVault = deps.invokeEval ?? (() => defaultInvokeEval(deps));
  const focused = await evalFocusedVault();
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
  // BASE_MALFORMED/invalid-yaml — YAML parser failures (shared with views_base: see _base-malformed.ts).
  {
    pattern: INVALID_YAML_PATTERN,
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

/**
 * Classify an upstream error string (combined stdout + stderr per BI-041 FR-003)
 * onto the typed VIEW_NOT_FOUND / BASE_MALFORMED sub-discriminator cohort and
 * throw the corresponding CLI_REPORTED_ERROR. Returns without throwing when no
 * pattern matches, when both channels are empty, or when a channel carries a JSON
 * array (the `[`-prefix short-circuit that defeats false-positive VIEW_NOT_FOUND
 * when stdout is valid JSON) — the caller then continues (success path) or
 * re-throws the original dispatch error (catch path). Shared by both
 * classification sites: pass `cause = err` from the dispatch-error catch
 * (preserving chain-of-custody) or `cause = null` from the success-path scan.
 */
function classifyAndThrow(
  stdout: string,
  stderr: string,
  input: QueryBaseInput,
  cause: unknown,
): void {
  const upstreamMessage = upstreamReport(stderr, stdout);
  if (
    upstreamMessage.length === 0 ||
    upstreamMessage.startsWith("[") ||
    stdout.trim().startsWith("[")
  ) {
    return;
  }
  const classified = classifyUpstreamError(upstreamMessage);
  if (classified === null) return;
  if (classified.kind === "VIEW_NOT_FOUND") {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
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
    cause,
    details: {
      code: "BASE_MALFORMED",
      reason: classified.reason,
      base_path: input.base_path,
      message: upstreamMessage,
    },
    message: "query_base: base file is structurally unusable",
  });
}

/** A failed read of the `.base`: ENOENT is BASE_NOT_FOUND, anything else is rethrown as raised. */
function baseReadError(err: unknown, input: QueryBaseInput): unknown {
  if (getErrno(err) === "ENOENT") {
    return new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { code: "BASE_NOT_FOUND", base_path: input.base_path },
      message: "query_base: base file not found at the supplied vault-relative path",
    });
  }
  return err;
}

/** A grouped view the mirror can match (BI-0207): the published `group_by` and where each row's group value comes from. */
interface Grouping {
  groupBy: QueryBaseGroupBy;
  source: GroupSource;
}

/**
 * BI-0207: the named view's grouping, from the `.base` text. A grouping this server cannot mirror (a custom group
 * order, a `groupBy` the scan cannot read, an unsupported property) fails the call; it never reads as ungrouped.
 */
async function readViewGrouping(fs: ExecuteFs, resolvedBasePath: string, input: QueryBaseInput): Promise<Grouping | null> {
  let text: string;
  try {
    text = await fs.readFile(resolvedBasePath);
  } catch (err) {
    throw baseReadError(err, input);
  }
  const grouping = findViewGrouping(text, input.view_name);
  if (grouping.kind === "none") return null;
  if (grouping.kind === "unreadable") {
    throw groupingUnsupported(
      "unreadable-group-by",
      { base_path: input.base_path, view_name: input.view_name, detail: grouping.detail },
      `cannot read the grouping of view "${input.view_name}" (${grouping.detail}); query_base reads the block-style YAML Obsidian writes`,
    );
  }
  if (grouping.kind === "custom-order") {
    throw groupingUnsupported(
      "custom-group-order",
      { base_path: input.base_path, view_name: input.view_name },
      `view "${input.view_name}" sets a custom group order (groupOrder), which query_base does not support`,
    );
  }
  const groupBy: QueryBaseGroupBy = { property: grouping.property, direction: grouping.direction };
  return { groupBy, source: groupSource(grouping.property) };
}

/** A row with its reserved `path` row locator, always the first key (FR-002b). */
type ReservedRow = QueryBaseRow & { path: string };

/**
 * The hypothetical upstream metadata channel for the source-note path when a
 * view declares a custom column also named `path` (FR-002b collision case).
 * T0 probe #4 confirms the actual metadata channel; until then, the wrapper
 * recognises `_source_path` as a placeholder. If upstream emits a row containing
 * BOTH `_source_path` and a view-defined `path`, the wrapper uses `_source_path`
 * as the reserved row locator and renames the view-defined `path` to `path_view`.
 */
const SOURCE_PATH_METADATA_KEY = "_source_path";

/**
 * The columns vector, derived from the first upstream row's key order (ECMAScript insertion order), excluding the
 * metadata key. Reserved `path` at index 0; on a collision, `path_view` sits where the view declared its own `path`.
 * With no rows the wrapper degrades to the minimum-viable contract ["path"] (FR-002c): it has no signal for
 * view-declared column names absent row data.
 */
function viewColumns(firstRow: QueryBaseRow | undefined): string[] {
  if (firstRow === undefined) return ["path"];

  // Detect collision: upstream emits a row carrying SOURCE_PATH_METADATA_KEY alongside
  // a view-defined `path` column. In that case, the wrapper-injected `path` wins
  // (from the metadata key) and the view-defined column moves to `path_view`.
  const hasCollision = SOURCE_PATH_METADATA_KEY in firstRow && "path" in firstRow;
  const firstRowKeys = Object.keys(firstRow).filter((k) => k !== SOURCE_PATH_METADATA_KEY);
  if (!hasCollision) return ["path", ...firstRowKeys.filter((k) => k !== "path")];

  const columns: string[] = [];
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
  return columns;
}

/** One upstream row with the reserved `path` first (from the collision metadata when present) and the rest in order. */
function reserveRow(upstreamRow: QueryBaseRow): ReservedRow {
  const collisionInRow = SOURCE_PATH_METADATA_KEY in upstreamRow && "path" in upstreamRow;
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

  const out: ReservedRow = { path: reservedPath };
  if (collisionInRow) out["path_view"] = pathViewValue;
  for (const [k, val] of Object.entries(upstreamRow)) {
    if (k === "path") continue;
    if (k === SOURCE_PATH_METADATA_KEY) continue;
    out[k] = val;
  }
  return out;
}

/** `row` with the reserved `group` key right after `path`; a view column named `group` moves to `group_view`. */
function withGroup({ path, ...rest }: ReservedRow, group: string | null): QueryBaseRow {
  const out: QueryBaseRow = { path, group };
  for (const [k, v] of Object.entries(rest)) out[k === "group" ? "group_view" : k] = v;
  return out;
}

/** The columns vector of a grouped view: `group` right after `path`, a view column named `group` as `group_view`. */
function withGroupColumn(columns: string[]): string[] {
  return columns.flatMap((c) => (c === "path" ? ["path", "group"] : [c === "group" ? "group_view" : c]));
}

/**
 * A grouped view's rows (BI-0207) in Obsidian's group order, upstream's order within a group, each with its `group`.
 * Every row (before the cap) gets its group value from Obsidian; an empty view makes no eval.
 */
async function inGroupOrder(
  rows: ReservedRow[],
  grouping: Grouping,
  input: QueryBaseInput,
  deps: ExecuteDeps,
): Promise<QueryBaseRow[]> {
  if (rows.length === 0) return [];
  const { locale, values } = await readGroupValues(grouping.source, rows.map((r) => r.path), input.vault, deps);
  return groupRows(values, grouping.groupBy.direction, locale).flatMap((group) => {
    const text = group.key === null ? null : valueText(group.key);
    return group.rows.map((i) => withGroup(rows[i]!, text));
  });
}

export async function executeQueryBase(
  input: QueryBaseInput,
  deps: ExecuteDeps,
): Promise<QueryBaseOutput> {
  const fs = deps.fs ?? DEFAULT_FS;
  const vaultLabel = input.vault ?? null;

  // === Stage 1 — vault root resolution + Layer-2 canonical-path check on the .base file ===
  const vaultRootRaw = await resolveVaultRoot(input, deps);
  const resolvedBasePath = await assertCanonicalPath(vaultRootRaw, input.base_path, {
    realpath: fs.realpath,
    logger: deps.logger,
    vaultLabel,
  });

  // === Stage 2 — fs.stat pre-flight (R4 stage 1 + 2) ===
  let stats: { size: number };
  try {
    stats = await fs.stat(resolvedBasePath);
  } catch (err) {
    throw baseReadError(err, input);
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
  let cliResult: { stdout: string; stderr: string };
  try {
    cliResult = await invokeCli(
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
      deps,
    );
  } catch (err) {
    // BI-041 FR-003 / FR-004: the upstream CLI emits "Error: View not found: <name>"
    // on stdout with exitCode 0. The dispatch-layer's priority (c) catches every
    // stdout prefix matching `Error:` and throws CLI_REPORTED_ERROR before stage 4
    // can inspect it. Intercept that generic shape, scan BOTH channels via the
    // same classifier table the success path uses, and re-throw with the typed
    // sub-discriminator (`details.code: "VIEW_NOT_FOUND"` etc.). Other UpstreamError
    // shapes (CLI_NON_ZERO_EXIT, CLI_BINARY_NOT_FOUND, CLI_TIMEOUT, the
    // ERR_NO_ACTIVE_FILE typed surface) propagate unchanged.
    if (err instanceof UpstreamError && err.code === "CLI_REPORTED_ERROR") {
      const dispatchStdout = stringDetail(err.details, "stdout");
      const dispatchStderr = stringDetail(err.details, "stderr");
      classifyAndThrow(dispatchStdout, dispatchStderr, input, err);
    }
    throw err;
  }

  // === Stage 4 — post-subprocess error classification (R4 stage 3 / R5) ===
  // Success-path classification: scan BOTH channels (BI-041 FR-003). Stderr-only
  // upstream emits reach this branch because dispatch priority (c) only inspects
  // stdout. Stdout-only emits are intercepted in the catch above. Shares the
  // classifier table + throw shapes with the catch path via classifyAndThrow;
  // `cause` is null here (no originating dispatch error on the success path).
  classifyAndThrow(cliResult.stdout, cliResult.stderr, input, null);

  // === Stage 5 — JSON.parse + wire envelope safeParse ===
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

  // === Stage 6 — the view's grouping (BI-0207). Upstream's base:query ignores `groupBy`, so for a grouped
  // view the wrapper reads each row's group value from Obsidian and applies Obsidian's group order itself.
  // An ungrouped view makes no eval call.
  const grouping = await readViewGrouping(fs, resolvedBasePath, input);

  // === Stage 7 — row post-process: path reservation (+ group order) + columns vector, then the cap ===
  // Determinism (FR-003 / SC-003): an ungrouped view keeps upstream's emission order
  // verbatim. Per data-model.md the view's declared sort is trusted from upstream;
  // path-asc tiebreak is satisfied de facto when upstream emits in path order for
  // ties (R10 probe #3 validates the no-sort baseline). Same input → byte-identical
  // output. The wrapper does NOT re-sort because it has no signal for which column
  // the view declared as the primary sort key. An ungrouped view reserves only the
  // rows under the cap; a grouped view reserves every row, because the cap applies
  // after the group order.
  const rows =
    grouping === null
      ? upstreamRows.slice(0, QUERY_BASE_RESPONSE_ROW_CAP).map(reserveRow)
      : (await inGroupOrder(upstreamRows.map(reserveRow), grouping, input, deps)).slice(0, QUERY_BASE_RESPONSE_ROW_CAP);
  const columns = viewColumns(upstreamRows[0]);
  const totalRowsBeforeCap = upstreamRows.length;
  const truncated = totalRowsBeforeCap > QUERY_BASE_RESPONSE_ROW_CAP;

  // === Stage 8 — output schema parse (defence-in-depth) ===
  return queryBaseOutputSchema.parse({
    columns: grouping === null ? columns : withGroupColumn(columns),
    rows,
    truncated,
    ...(truncated ? { total_rows: totalRowsBeforeCap } : {}),
    ...(grouping === null ? {} : { group_by: grouping.groupBy }),
  });
}
