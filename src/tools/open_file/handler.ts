// Original — no upstream. open_file handler (BI-057; cross-vault rewrite ADR-031) — single
// vault-targeted eval. resolveVaultRootOrRemap(vault) provides the typed unknown-vault pre-eval
// check (VAULT_NOT_FOUND/unknown via remapVaultNotFound); its base path is no longer used (no guard).
// composeEvalCode(JS_TEMPLATE,{path,file,new_tab}) → ONE target_mode:"specific" eval with
// vault=requested. Because `eval` honours vault= (B1 false, ADR-031) the eval runs in the requested
// vault: it resolves the locator there and opens the file (switching focus to that vault) via the
// explicit placement branch. decodeEvalEnvelope (strip "=> " + JSON.parse + safeParse) → on ok:true
// return typed { opened, vault, new_tab, placement }; on ok:false classify FILE_NOT_FOUND /
// UNSUPPORTED_FILE_TYPE → UpstreamError. The open IS the contract (FR-017): the eval result is
// classified, never best-effort-swallowed.
//
// Recovery is fully INHERITED and vault-correct from dispatchCli (ADR-029/030) — the call carries
// vault=requested, so a closed vault cold-launches and an app-down launch targets obsidian://open?vault=requested.
// open_file adds NO per-tool retry/poll/launch and imports no spawn site / app-launcher. The BI-057
// focused-vault guard, the VAULT_NOT_FOCUSED → VAULT_NOT_FOUND/not-open mapping, the focus-switch, the
// verify-poll, and any launchFn are all DELETED. No new top-level code, no new details.reason
// (reason:"not-open" retires from emission, ADR-015 additive-only).
import { JS_TEMPLATE } from "./_template.js";
import {
  openEvalResponseSchema,
  openFileOutputSchema,
  type OpenFileEvalErrorCode,
  type OpenFileInput,
  type OpenFileOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { decodeEvalEnvelope, resolveVaultRootOrRemap } from "../_active-file.js";
import { composeEvalCode } from "../_shared.js";

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

const TOOL_NAME = "open_file";

export async function executeOpenFile(
  input: OpenFileInput,
  deps: ExecuteDeps,
): Promise<OpenFileOutput> {
  // Stage 1 (pre-eval) — resolve the requested vault via the registry purely for
  // the typed unknown-vault error: an unknown display name surfaces as the cohort
  // VAULT_NOT_FOUND/unknown triple BEFORE any eval is spawned. The returned base
  // path is intentionally discarded — there is no focused-vault guard (ADR-031), so
  // the eval payload no longer carries `expectedBase`.
  await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, TOOL_NAME);

  // Exactly one of path/file is present (schema superRefine, FR-005), so the eval
  // payload carries both fields with the absent one nulled, and locatorLabel (used in
  // the error path) is simply whichever locator was supplied.
  const locatorLabel = input.path ?? input.file!;

  const code = composeEvalCode(JS_TEMPLATE, {
    path: input.path ?? null,
    file: input.file ?? null,
    new_tab: input.new_tab ?? false,
  });

  // target_mode:"specific" with vault=requested — `eval` honours vault= (B1 false,
  // ADR-031), so the eval runs IN the requested vault: it resolves the locator there
  // and opens the file, switching focus to that vault. Recovery (closed vault →
  // ADR-029 cold-start retry; app down → ADR-030 vault-targeted launch) is inherited
  // from dispatchCli and is vault-correct because the call carries vault=requested. An
  // invokeCli throw (Obsidian not running / binary missing) propagates unchanged as
  // the cohort's CLI_* error — never a fabricated success.
  const result = await invokeCli(
    { command: "eval", vault: input.vault, parameters: { code }, flags: [], target_mode: "specific" },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  // Single-stage decode via the shared eval-envelope decoder: strip the "=> " echo
  // → JSON.parse → openEvalResponseSchema.safeParse. A malformed result is an
  // INTERNAL_ERROR invariant violation (not the cohort's CLI_REPORTED_ERROR — open
  // owns the envelope contract), never a silent success.
  const data = decodeEvalEnvelope(result.stdout, openEvalResponseSchema, {
    toolName: "open_file",
    malformedCode: "INTERNAL_ERROR",
  });

  if (data.ok === true) {
    return openFileOutputSchema.parse({
      opened: data.opened,
      vault: input.vault,
      new_tab: data.new_tab,
      placement: data.placement,
    });
  }

  throw mapEvalError(data.code, data.detail, input.vault, locatorLabel);
}

function mapEvalError(
  code: OpenFileEvalErrorCode,
  detail: string | undefined,
  vault: string,
  locator: string,
): UpstreamError {
  switch (code) {
    case "FILE_NOT_FOUND":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { code: "FILE_NOT_FOUND", path: locator, vault },
        message: `open_file: no file found at "${locator}" in vault "${vault}"`,
      });
    case "UNSUPPORTED_FILE_TYPE":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          code: "UNSUPPORTED_FILE_TYPE",
          extension: detail ?? "",
          path: locator,
          vault,
        },
        message: `open_file: Obsidian has no registered view for file type "${detail ?? "unknown"}"`,
      });
  }
}
