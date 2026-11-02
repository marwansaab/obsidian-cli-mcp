// Original — no upstream. views_base handler — wraps the native `obsidian base:views` subcommand.
// Two modes: open-Base (no base_path → active `base:views` against the focused Base) and named-Base
// (base_path → focus that `.base` via the proven open mechanism, then active `base:views` reads it).
// Both share one enumeration + label-strip path. T0 P1: `base:views` emits `<name>\t<type>` (TAB
// delimiter); stripTypeLabel removes the trailing `\t<type>` only when <type> ∈ {table, cards, list}
// (the closed set captured live from the Bases registry), so internal spaces/hyphens/punctuation in
// the name survive (FR-003). `base:views` takes no path= — the named path is delivered by
// focus-then-active (T0 P3: reliable), NOT a path= call. It does honour vault= (spec 083 research
// P3), so both modes route by vault= when a vault is named: open mode reads the Base open in that
// vault, and its not-open error carries details.vault. Zero new top-level error
// codes (Principle IV); BASE_NOT_FOUND gains an additive details.reason (named-missing | not-open) per
// ADR-015 so the two base-not-found states stay distinguishable under one code, cohort-consistent with
// query_base. No silent open-Base substitution on any named-path failure (FR-009). Spec 081: a YAML
// parser complaint (the shared INVALID_YAML_PATTERN, the one query_base uses) on the failure or the
// clean-exit path is checked ahead of the not-a-base check and becomes BASE_MALFORMED/invalid-yaml in
// both modes; the named-mode not-a-base report is BASE_MALFORMED/unknown. The upstream report is kept
// bounded in details.message / messageLength (spec 080 rule).
import { FOCUS_BASE_TEMPLATE } from "./_template.js";
import {
  focusBaseEvalResponseSchema,
  viewsBaseOutputSchema,
  type ViewsBaseInput,
  type ViewsBaseOutput,
} from "./schema.js";
import { invokeCli, invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError, stringDetail } from "../../errors.js";
import { decodeEvalEnvelope, resolveVaultRootOrRemap } from "../_active-file.js";
import { INVALID_YAML_PATTERN, upstreamReport } from "../_base-malformed.js";
import { boundedExcerpt } from "../_eval-parse.js";
import { composeEvalCode } from "../_shared.js";

import type { SupportDeclaration } from "../../file-type/file-type.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

/** views_base reads a base (`base_path`); others keep their INVALID_BASE_PATH rejection (spec 070 FR-007a). */
export const VIEWS_BASE_SUPPORTED = ["base"] as const satisfies SupportDeclaration;

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  /**
   * Injected at the composition root (server.ts) — used whenever `vault` is named (either
   * mode) to surface a typed VAULT_NOT_FOUND/unknown (via resolveVaultRootOrRemap)
   * BEFORE anything is spawned. The handler never constructs it (DI discipline).
   */
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const TOOL_NAME = "views_base";

const NOT_A_BASE_FILE_PATTERN = /Active file is not a base file/i;

/**
 * The closed Bases view-type token set, captured live from the Bases internal-plugin
 * registry (`app.internalPlugins.plugins.bases.instance.registrations`) at T0 P1 —
 * Obsidian 1.12.7. `stripTypeLabel` strips a trailing tab-delimited token only when it
 * is one of these, so it never blind-trims a token that is part of a view name.
 */
const KNOWN_VIEW_TYPES: ReadonlySet<string> = new Set(["table", "cards", "list"]);

/**
 * Remove the injected `\t<type>` label from one `base:views` output line (T0 P1).
 * The delimiter is a TAB, which a view name cannot contain, so the split is
 * unambiguous and every name-internal/-trailing character (spaces, hyphens, colons,
 * parentheses) is preserved (FR-003 / SC-003). The strip fires only when the trailing
 * tab-delimited token is a known view type; otherwise the line is returned verbatim
 * (defensive — a future format without the label, or an unknown type, is not mangled).
 */
function stripTypeLabel(line: string): string {
  const tab = line.lastIndexOf("\t");
  if (tab === -1) return line;
  const type = line.slice(tab + 1);
  return KNOWN_VIEW_TYPES.has(type) ? line.slice(0, tab) : line;
}

/** A `<name>\t<type>` listing line: its trailing tab-delimited token is a known view type. */
function isViewLine(line: string): boolean {
  return stripTypeLabel(line) !== line;
}

/**
 * Split `base:views` stdout into its lines. Lines are NOT trimmed (that would drop
 * legitimate trailing characters of a name); only a trailing CR is stripped (CRLF
 * artifact) and empty lines (the trailing newline) filtered.
 */
function stdoutLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0);
}

/** What a focused Base's `base:views` report is recognised as. */
type FocusedBaseFailure = "invalid-yaml" | "not-a-base";

/**
 * A YAML parser complaint in `report` wins (spec 081); otherwise a "not a base file" report in
 * `notABaseText`. `notABaseText` is null where the not-a-base rule does not apply (a non-zero
 * exit keeps its pre-081 scope: only the YAML check widened to it).
 */
function recogniseFailure(report: string, notABaseText: string | null): FocusedBaseFailure | null {
  if (INVALID_YAML_PATTERN.test(report)) return "invalid-yaml";
  if (notABaseText !== null && NOT_A_BASE_FILE_PATTERN.test(notABaseText)) return "not-a-base";
  return null;
}

/**
 * The typed error for a recognised failure. Open mode (`basePath` undefined): not-a-base means
 * no Base is open → BASE_NOT_FOUND/not-open. Otherwise the `.base` is there but unusable →
 * BASE_MALFORMED with reason invalid-yaml or unknown, the named path, and the report bounded by
 * the spec 080 rule. `cause` is the originating dispatch error, or null on a clean exit.
 */
function focusedBaseError(
  basePath: string | undefined,
  failure: FocusedBaseFailure,
  cause: unknown,
  report: string,
  vault: string | undefined,
): UpstreamError {
  if (basePath === undefined && failure === "not-a-base") {
    // Spec 083 D4: a named vault is attributed; with none, details and message are unchanged.
    return new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      details: { code: "BASE_NOT_FOUND", reason: "not-open", ...(vault === undefined ? {} : { vault }) },
      message:
        vault === undefined
          ? "views_base: active file is not a base file"
          : `views_base: active file in vault "${vault}" is not a base file`,
    });
  }
  const base = basePath === undefined ? "the open base file" : `base file at "${basePath}"`;
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause,
    details: {
      code: "BASE_MALFORMED",
      reason: failure === "invalid-yaml" ? "invalid-yaml" : "unknown",
      ...(basePath === undefined ? {} : { base_path: basePath }),
      message: boundedExcerpt(report),
      messageLength: report.length,
    },
    message:
      failure === "invalid-yaml"
        ? `views_base: ${base} is malformed: its YAML cannot be parsed`
        : `views_base: ${base} is structurally unusable`,
  });
}

/**
 * Run `base:views` (in the named `vault` when one is given, else in the vault in front) and
 * return the clean `{views, count}` envelope. A recognised
 * failure on the dispatch-error path (CLI_REPORTED_ERROR / CLI_NON_ZERO_EXIT) or the
 * clean-exit path throws `focusedBaseError`; anything else is rethrown unchanged. On the
 * clean-exit path view lines are left out of the YAML scan, so a view named "YAML notes"
 * never trips it.
 */
async function listFocusedViews(
  deps: ExecuteDeps,
  basePath: string | undefined,
  vault: string | undefined,
): Promise<ViewsBaseOutput> {
  let cliResult: { stdout: string; stderr: string };
  try {
    cliResult = await invokeCli(
      {
        command: "base:views",
        vault,
        parameters: {},
        flags: [],
        target_mode: vault === undefined ? "active" : "specific",
      },
      deps,
    );
  } catch (err) {
    if (err instanceof UpstreamError && (err.code === "CLI_REPORTED_ERROR" || err.code === "CLI_NON_ZERO_EXIT")) {
      const report = upstreamReport(stringDetail(err.details, "stderr"), stringDetail(err.details, "stdout"));
      const failure = recogniseFailure(report, err.code === "CLI_REPORTED_ERROR" ? report : null);
      if (failure !== null) throw focusedBaseError(basePath, failure, err, report, vault);
    }
    throw err;
  }

  const lines = stdoutLines(cliResult.stdout);
  const report = upstreamReport(cliResult.stderr, lines.filter((line) => !isViewLine(line)).join("\n"));
  // Unlike the YAML check, the not-a-base check reads the raw output, view lines included.
  // Reading `report` instead would change clean-exit listing (a view named "Active file is not
  // a base file" would list), which spec 081 leaves as shipped (FR-012, BI-0137 Out of scope).
  const failure = recogniseFailure(report, `${cliResult.stdout}\n${cliResult.stderr}`);
  if (failure !== null) throw focusedBaseError(basePath, failure, null, report, vault);

  const views = lines.map(stripTypeLabel);
  return viewsBaseOutputSchema.parse({ views, count: views.length });
}

export async function executeViewsBase(
  input: ViewsBaseInput,
  deps: ExecuteDeps,
): Promise<ViewsBaseOutput> {
  // Typed unknown-vault error BEFORE anything is spawned, in both modes (cohort parity).
  if (input.vault !== undefined) {
    await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, TOOL_NAME);
  }

  // ── Named-Base mode (focus-then-active) ──────────────────────────────────────
  if (input.base_path !== undefined) {
    // Focus the named `.base` via the proven open mechanism. The eval runs in the
    // requested vault (target_mode:"specific" + vault=) when a vault is named —
    // recovery (closed vault cold-launch) inherited from dispatchCli — else in the
    // focused vault (target_mode:"active"). composeEvalCode base64-wraps the locator.
    const code = composeEvalCode(FOCUS_BASE_TEMPLATE, { path: input.base_path });
    const focusResult = await invokeEval({ code, vault: input.vault }, deps);

    const decoded = decodeEvalEnvelope(focusResult, focusBaseEvalResponseSchema, {
      toolName: TOOL_NAME,
      malformedCode: "INTERNAL_ERROR",
    });

    if (decoded.ok === false) {
      // The focus step's FILE_NOT_FOUND is REMAPPED to BASE_NOT_FOUND/named-missing
      // (cohort-consistent with query_base; never leaked) — FR-007, never a silent
      // substitution of the open Base (FR-009).
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { code: "BASE_NOT_FOUND", reason: "named-missing", base_path: input.base_path },
        message: `views_base: no base file found at "${input.base_path}"`,
      });
    }
    // The named `.base` is now focused; a recognised failure from here on means it exists
    // but Obsidian cannot use it → BASE_MALFORMED (see focusedBaseError).
  }

  // Both modes list the focused Base's views, in the named vault when one is given (spec 083
  // D3); open mode (no base_path) reads whatever Base is focused there.
  return listFocusedViews(deps, input.base_path, input.vault);
}
