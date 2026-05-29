// Original — no upstream. open_file handler (BI-057) — single invokeCli wrapper around the eval
// subcommand with the frozen JS template + base64 JSON payload (R12 anti-injection). Eval-composed
// (no fs syscalls): resolveVaultPath(vault) → expectedBase (unknown → VAULT_NOT_FOUND/unknown via
// remapVaultNotFound) → composeEvalCode(JS_TEMPLATE,{expectedBase,path,file,new_tab}) → one
// target_mode:"active" eval → strip "=> " + JSON.parse + openEvalResponseSchema.safeParse (single
// decode, parity with backlinks) → classify {ok:false,code} → UpstreamError | {ok:true} → typed
// { opened, vault, new_tab }. Stage order FR-012a/ADR-014: unknown (TS, pre-eval) → not-open (guard)
// → FILE_NOT_FOUND → UNSUPPORTED_FILE_TYPE → success. The open IS the contract (FR-017): the eval
// result is classified, never best-effort-swallowed (the deliberate divergence from write_note's
// silent openLinkText). The open-eval mechanism shares write_note's openLinkText lineage (ADR-009).
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
import { parseEvalStdout, remapVaultNotFound } from "../_active-file.js";
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

/**
 * Stage 1 (FR-012a) — resolve the requested vault's absolute base path via the
 * registry. An unknown vault display name surfaces as the cohort
 * VAULT_NOT_FOUND/unknown triple BEFORE any eval is spawned (the guard fires
 * before file resolution). Mirrors find_and_replace's resolveVaultRoot.
 */
async function resolveExpectedBase(
  input: OpenFileInput,
  deps: ExecuteDeps,
): Promise<string> {
  try {
    return await deps.vaultRegistry.resolveVaultPath(input.vault);
  } catch (err) {
    remapVaultNotFound(err, input.vault, TOOL_NAME);
  }
}

export async function executeOpenFile(
  input: OpenFileInput,
  deps: ExecuteDeps,
): Promise<OpenFileOutput> {
  const expectedBase = await resolveExpectedBase(input, deps);

  const locator =
    input.path !== undefined
      ? { kind: "path" as const, value: input.path }
      : { kind: "name" as const, value: input.file! };

  const code = composeEvalCode(JS_TEMPLATE, {
    expectedBase,
    path: locator.kind === "path" ? locator.value : null,
    file: locator.kind === "name" ? locator.value : null,
    new_tab: input.new_tab ?? false,
  });

  // target_mode:"active" — the eval runs against the focused vault regardless of
  // vault= (upstream B1); the in-eval guard does the vault verification. An
  // invokeCli throw (Obsidian not running / binary missing) propagates unchanged
  // as the cohort's CLI_* error — never a fabricated success.
  const result = await invokeCli(
    { command: "eval", parameters: { code }, flags: [], target_mode: "active" },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  // Single-stage decode (block-body async IIFE settles to one value, R2): strip
  // the "=> " echo → JSON.parse → openEvalResponseSchema.safeParse. A malformed
  // result is an INTERNAL_ERROR invariant violation, never a silent success.
  let parsed: unknown;
  try {
    parsed = parseEvalStdout(result.stdout);
  } catch (err) {
    throw new UpstreamError({
      code: "INTERNAL_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `open_file: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  const validated = openEvalResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new UpstreamError({
      code: "INTERNAL_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "open_file: eval response shape unexpected",
    });
  }

  if (validated.data.ok === true) {
    return openFileOutputSchema.parse({
      opened: validated.data.opened,
      vault: input.vault,
      new_tab: validated.data.new_tab,
    });
  }

  throw mapEvalError(
    validated.data.code,
    validated.data.detail,
    input.vault,
    locator.value,
  );
}

function mapEvalError(
  code: OpenFileEvalErrorCode,
  detail: string | undefined,
  vault: string,
  locator: string,
): UpstreamError {
  switch (code) {
    case "VAULT_NOT_FOCUSED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { code: "VAULT_NOT_FOUND", reason: "not-open", vault },
        message: `open_file: vault "${vault}" is registered but is not the currently focused vault`,
      });
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
