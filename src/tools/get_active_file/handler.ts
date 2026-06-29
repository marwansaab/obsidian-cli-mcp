// Original — no upstream. get_active_file handler (BI-063) — reports the active file of the focused vault
// (target_mode:"active") or a named vault (target_mode:"specific", routed cross-vault). Single eval-composition
// round-trip through invokeCli → dispatchCli, decoded by the shared decodeEvalEnvelope.
//
// active mode: one target_mode:"active" eval, no vault — runs against the focused vault.
// specific mode: a pre-eval resolveVaultRootOrRemap(vault) provides the typed unknown-vault check
//   (VAULT_NOT_FOUND/unknown via remapVaultNotFound) BEFORE the eval; its base path is discarded (no
//   focused-vault guard — ADR-031, B1 false). The eval then routes vault=requested, target_mode:"specific",
//   so getActiveFile() returns THAT vault's active file even when it is open-but-unfocused (FR-011).
//
// The { active: null } arm is an AUTHORIZED SUCCESS, not an error: this tool's purpose is to report
// presence/absence, so "nothing is active" is the legitimate queried answer (FR-005 / research D3 /
// Principle IV's Clarifications-exception). get_active_file deliberately does NOT emit ERR_NO_ACTIVE_FILE
// and does NOT consume resolveActiveFocusedFile (the cohort's no-active-file-is-an-error helper).
//
// Recovery (closed vault → ADR-029 cold-start retry; app down → ADR-030 launch) is INHERITED from
// dispatchCli and vault-correct because the call carries vault=requested. An invokeCli throw (app
// down/unrecoverable, binary missing) propagates unchanged — never a fabricated success. No per-tool
// retry/launch; no app-launcher import. Zero new top-level error codes (FR-016 / Principle IV).
import { ACTIVE_FILE_TEMPLATE } from "./_template.js";
import {
  getActiveFileEvalResponseSchema,
  getActiveFileOutputSchema,
  type GetActiveFileInput,
  type GetActiveFileOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { decodeEvalEnvelope, resolveVaultRootOrRemap } from "../_active-file.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const TOOL_NAME = "get_active_file";

export async function executeGetActiveFile(
  input: GetActiveFileInput,
  deps: ExecuteDeps,
): Promise<GetActiveFileOutput> {
  // specific mode only: the requested vault is non-undefined here (the schema refinement requires it),
  // so `vault !== undefined` narrows to the named vault. active mode leaves it undefined.
  const vault = input.target_mode === "specific" ? input.vault : undefined;

  if (vault !== undefined) {
    // Pre-eval typed unknown-vault check: an unregistered display name surfaces as the cohort
    // VAULT_NOT_FOUND/unknown triple BEFORE any eval is spawned (FR-010, like open_file). The returned
    // base path is intentionally discarded — there is no focused-vault guard (ADR-031).
    await resolveVaultRootOrRemap(deps.vaultRegistry, vault, TOOL_NAME);
  }

  // One eval. specific → vault=requested + target_mode:"specific" (B1 false → runs IN the named vault).
  // active → no vault + target_mode:"active" (runs against the focused vault). No caller data is injected
  // into the template (no payload), so the only routing is the vault/target_mode carried here.
  const result = await invokeCli(
    {
      command: "eval",
      vault,
      parameters: { code: ACTIVE_FILE_TEMPLATE },
      flags: [],
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  // Strip the "=> " echo → JSON.parse → safeParse. A malformed body is the cohort's CLI_REPORTED_ERROR
  // (a malformed eval reads as an upstream report), never a silent success.
  const data = decodeEvalEnvelope(result.stdout, getActiveFileEvalResponseSchema, {
    toolName: TOOL_NAME,
    malformedCode: "CLI_REPORTED_ERROR",
  });

  // `data.active` carries null straight through to { active: null } with NO error branch — the AUTHORIZED
  // SUCCESS for "no active file" (FR-005 / research D3 / Principle IV Clarifications-exception). A reviewer
  // grepping for null returns sees this is the queried answer, not a masked empty result.
  return getActiveFileOutputSchema.parse({ active: data.active });
}
