// Original — no upstream. views_base handler — wraps the native `obsidian base:views` subcommand.
// Two modes: open-Base (no base_path → active `base:views` against the focused Base) and named-Base
// (base_path → focus that `.base` via the proven open mechanism, then active `base:views` reads it).
// Both share one enumeration + label-strip path. T0 P1: `base:views` emits `<name>\t<type>` (TAB
// delimiter); stripTypeLabel removes the trailing `\t<type>` only when <type> ∈ {table, cards, list}
// (the closed set captured live from the Bases registry), so internal spaces/hyphens/punctuation in
// the name survive (FR-003). T0 P2: `base:views` ignores path=/vault= (active-only) — the named path
// is delivered by focus-then-active (T0 P3: reliable), NOT a path= call. Zero new top-level error
// codes (Principle IV); BASE_NOT_FOUND gains an additive details.reason (named-missing | not-open) per
// ADR-015 so the two base-not-found states stay distinguishable under one code, cohort-consistent with
// query_base. No silent open-Base substitution on any named-path failure (FR-009).
import { FOCUS_BASE_TEMPLATE } from "./_template.js";
import {
  focusBaseEvalResponseSchema,
  viewsBaseOutputSchema,
  type ViewsBaseInput,
  type ViewsBaseOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError, stringDetail } from "../../errors.js";
import { decodeEvalEnvelope, resolveVaultRootOrRemap } from "../_active-file.js";
import { composeEvalCode } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  /**
   * Injected at the composition root (server.ts) — used by the named-Base + `vault`
   * arm to surface a typed VAULT_NOT_FOUND/unknown (via resolveVaultRootOrRemap)
   * BEFORE any focus eval is spawned. The handler never constructs it (DI discipline).
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

/**
 * Parse `base:views` stdout into the clean view-name list. Lines are NOT trimmed
 * (that would drop legitimate trailing characters of a name); only a trailing CR is
 * stripped (CRLF artifact) and empty lines (the trailing newline) filtered.
 */
function parseViews(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line.length > 0)
    .map(stripTypeLabel);
}

function adapterDeps(deps: ExecuteDeps) {
  return { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue };
}

/**
 * Run active-mode `base:views` and return the clean `{views, count}` envelope.
 * A "not a base file" report (on either the dispatch-error path or the clean-exit
 * success path) is routed to `onNotABase`, which throws the branch-appropriate typed
 * error (open mode → BASE_NOT_FOUND/not-open; named mode → BASE_MALFORMED). `cause`
 * is the originating dispatch error on the catch path, or null on the success path.
 */
async function listFocusedViews(
  deps: ExecuteDeps,
  onNotABase: (cause: unknown) => never,
): Promise<ViewsBaseOutput> {
  let cliResult: { stdout: string; stderr: string };
  try {
    cliResult = await invokeCli(
      { command: "base:views", parameters: {}, flags: [], target_mode: "active" },
      adapterDeps(deps),
    );
  } catch (err) {
    if (err instanceof UpstreamError && err.code === "CLI_REPORTED_ERROR") {
      const combined = `${stringDetail(err.details, "stdout")}\n${stringDetail(err.details, "stderr")}`;
      if (NOT_A_BASE_FILE_PATTERN.test(combined)) onNotABase(err);
    }
    throw err;
  }

  const combined = `${cliResult.stdout}\n${cliResult.stderr}`;
  if (NOT_A_BASE_FILE_PATTERN.test(combined)) onNotABase(null);

  const views = parseViews(cliResult.stdout);
  return viewsBaseOutputSchema.parse({ views, count: views.length });
}

export async function executeViewsBase(
  input: ViewsBaseInput,
  deps: ExecuteDeps,
): Promise<ViewsBaseOutput> {
  // ── Named-Base mode (focus-then-active) ──────────────────────────────────────
  if (input.base_path !== undefined) {
    // Typed unknown-vault error BEFORE any eval is spawned (cohort parity).
    if (input.vault !== undefined) {
      await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, TOOL_NAME);
    }

    // Focus the named `.base` via the proven open mechanism. The eval runs in the
    // requested vault (target_mode:"specific" + vault=) when a vault is named —
    // recovery (closed vault cold-launch) inherited from dispatchCli — else in the
    // focused vault (target_mode:"active"). composeEvalCode base64-wraps the locator.
    const code = composeEvalCode(FOCUS_BASE_TEMPLATE, { path: input.base_path });
    const focusResult = await invokeCli(
      {
        command: "eval",
        vault: input.vault,
        parameters: { code },
        flags: [],
        target_mode: input.vault !== undefined ? "specific" : "active",
      },
      adapterDeps(deps),
    );

    const decoded = decodeEvalEnvelope(focusResult.stdout, focusBaseEvalResponseSchema, {
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

    // The named `.base` is now focused → list its views. A post-focus "not a base
    // file" report means the `.base` exists but Obsidian cannot use it → BASE_MALFORMED.
    return listFocusedViews(deps, (cause) => {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause,
        details: { code: "BASE_MALFORMED", base_path: input.base_path },
        message: `views_base: base file at "${input.base_path}" is structurally unusable`,
      });
    });
  }

  // ── Open-Base mode (unchanged behaviour + additive details.reason) ───────────
  return listFocusedViews(deps, (cause) => {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      details: { code: "BASE_NOT_FOUND", reason: "not-open" },
      message: "views_base: active file is not a base file",
    });
  });
}
