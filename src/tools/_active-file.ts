// Original — no upstream. Shared active/specific locator resolution for the write + vault-scan tool cohorts (F1 of the thermo-nuclear code-quality review). Centralises the focused-file / focused-vault `obsidian eval` round-trip, the `"=> "` stdout strip, the cohort-uniform ERR_NO_ACTIVE_FILE message, the registry VALIDATION_ERROR -> CLI_REPORTED_ERROR/VAULT_NOT_FOUND remap, the `obsidian file` TSV path resolver, the canonical-path / PATH_ESCAPES_VAULT guard, and the reverse vault display-name lookup that were previously copy-pasted across write_note, append_note, prepend, patch_block, patch_heading, find_and_replace, and query_base. Every helper preserves the prior inlined behaviour byte-for-byte (template strings, error codes, messages, and `details` shapes); divergences between consumers (tool name in messages, the no-active-file label, the per-note attempted-path label) surface as explicit parameters rather than forked copies.
import { invokeCli, type SpawnLike } from "../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../errors.js";
import { checkCanonicalPath } from "../path-safety/canonical.js";

import type { Logger } from "../logger.js";
import type { Queue } from "../queue.js";
import type { VaultRegistry } from "../vault-registry/registry.js";

/**
 * Frozen `obsidian eval` template that resolves the focused FILE: returns the
 * active file's vault-relative path (or `null`) plus the vault's absolute
 * `basePath`. Consumed by the file cohort (write_note, append_note, prepend,
 * patch_block, patch_heading). Byte-stable — the active-mode handler tests assert
 * on the recorded argv, so this string MUST NOT change without coordinating every
 * consumer + its tests.
 */
export const FOCUSED_FILE_TEMPLATE =
  "(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()";

/**
 * Frozen `obsidian eval` template that resolves the focused VAULT root only. The
 * `path` field is emitted for parity with FOCUSED_FILE_TEMPLATE but is unused by
 * the vault cohort (find_and_replace, query_base), which never errors on the
 * no-active-file case. Byte-stable for the same reason as FOCUSED_FILE_TEMPLATE.
 */
export const FOCUSED_VAULT_TEMPLATE =
  "(async()=>JSON.stringify({path:app.workspace.getActiveFile()?.path??null,base:app.vault.adapter.basePath}))()";

/** Parsed shape of both eval templates: `{path, base}`. */
export interface FocusedFileResponse {
  path: string | null;
  base: string;
}

/** The subset of a handler's ExecuteDeps needed to drive an `obsidian eval` round-trip. */
export interface EvalDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

function adapterDeps(deps: EvalDeps) {
  return { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue };
}

/**
 * Strip the eval echo prefix (`"=> "`) and JSON.parse the remainder. The `obsidian
 * eval` subcommand prints the expression value as text prefixed with `"=> "`;
 * everything downstream re-parses that body as JSON. Throws on invalid JSON — the
 * caller decides how to wrap the failure (the stage discriminator differs per
 * consumer, so wrapping stays at the call site).
 */
export function parseEvalStdout(stdout: string): unknown {
  const trimmed = stdout.trimStart();
  const body = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;
  return JSON.parse(body);
}

function isFocusedFileResponse(value: unknown): value is FocusedFileResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (typeof v.path === "string" || v.path === null) && typeof v.base === "string";
}

/** The cohort-uniform ERR_NO_ACTIVE_FILE message for the file cohort. */
function noActiveFileMessage(toolName: string): string {
  return `No active file in Obsidian. Open a note in the editor, or call ${toolName} with target_mode=specific + vault + file/path.`;
}

/** Resolved focused-file locator: the vault root (absolute basePath) + the active file's vault-relative path. */
export interface ActiveFileLocator {
  vaultRoot: string;
  relPath: string;
}

/**
 * File-cohort active-mode resolution: run FOCUSED_FILE_TEMPLATE through `obsidian
 * eval`, parse + shape-check the response, and return `{vaultRoot, relPath}`.
 *
 * Throws (byte-identical to the prior inlined copies):
 * - CLI_REPORTED_ERROR `details.stage: "json-parse"` (full stdout) on unparseable JSON.
 * - CLI_REPORTED_ERROR `details.stage: "envelope-parse"` (parsed value) on wrong shape.
 * - ERR_NO_ACTIVE_FILE with the cohort-uniform, tool-named message when no file is focused.
 */
export async function resolveActiveFocusedFile(
  deps: EvalDeps,
  toolName: string,
): Promise<ActiveFileLocator> {
  const focused = await invokeCli(
    { command: "eval", parameters: { code: FOCUSED_FILE_TEMPLATE }, flags: [], target_mode: "active" },
    adapterDeps(deps),
  );
  let parsed: unknown;
  try {
    parsed = parseEvalStdout(focused.stdout);
  } catch (e) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: e,
      details: { stage: "json-parse", stdout: focused.stdout },
      message: "active-mode focused-file eval returned unparseable response",
    });
  }
  if (!isFocusedFileResponse(parsed)) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stage: "envelope-parse", parsed },
      message: "active-mode focused-file eval returned unexpected shape",
    });
  }
  if (parsed.path === null) {
    throw new UpstreamError({
      code: "ERR_NO_ACTIVE_FILE",
      cause: null,
      details: {},
      message: noActiveFileMessage(toolName),
    });
  }
  return { vaultRoot: parsed.base, relPath: parsed.path };
}

/**
 * Reverse-lookup the vault display name for an absolute base path, falling back to
 * the base path itself when the registry has no matching entry (or has not been
 * primed). `resolveVaultDisplayName` is optional on VaultRegistry so pre-F3 test
 * stubs without it degrade to the base-path literal — exactly the prior duck-typed
 * behaviour, minus the per-handler intersection cast.
 */
export function resolveVaultDisplayName(vaultRegistry: VaultRegistry, base: string): string {
  return vaultRegistry.resolveVaultDisplayName?.(base) ?? base;
}

/**
 * Specific-mode wikilink-form `file` resolver: run `obsidian file file=<name>` and
 * extract the `path\t<relPath>` line from the TSV stdout. Consumed by append_note
 * and prepend (set_property keeps its own copy until it joins this module).
 *
 * Throws CLI_REPORTED_ERROR `details.stage: "file-tsv-parse"` (stdout sliced to 500)
 * when no path line is present — byte-identical to the prior per-handler copies.
 */
export async function resolveFileByTsv(
  deps: EvalDeps,
  vault: string,
  file: string,
  toolName: string,
): Promise<string> {
  const fileInfo = await invokeCli(
    { command: "file", vault, parameters: { file }, flags: [], target_mode: "specific" },
    adapterDeps(deps),
  );
  for (const line of fileInfo.stdout.split("\n")) {
    if (line.startsWith("path\t")) {
      return line.slice("path\t".length).trim();
    }
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "file-tsv-parse", stdout: fileInfo.stdout.slice(0, 500) },
    message: `${toolName}: file subcommand stdout did not contain a path line`,
  });
}

/**
 * Re-throw a vault-registry resolution failure as the cohort VAULT_NOT_FOUND shape.
 * When the registry raised VALIDATION_ERROR (unknown vault display name), surface
 * CLI_REPORTED_ERROR with `details.code: "VAULT_NOT_FOUND"`, `details.reason:
 * "unknown"`; any other failure rethrows unchanged. Consumed by find_and_replace
 * and query_base. Always throws (signature `never`).
 */
export function remapVaultNotFound(err: unknown, vault: string, toolName: string): never {
  if (err instanceof UpstreamError && err.code === "VALIDATION_ERROR") {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { code: "VAULT_NOT_FOUND", reason: "unknown", vault },
      message: `${toolName}: vault "${vault}" is not registered`,
    });
  }
  throw err;
}

/** Context for {@link assertCanonicalPath}. */
export interface CanonicalGuardContext {
  realpath: (p: string) => Promise<string>;
  logger: Logger;
  /** The vault display name for the pathEscapeAttempt event + details, or null. */
  vaultLabel: string | null;
  /**
   * What gets logged + echoed as `attemptedPath`. Defaults to `inputPath`. Override
   * only where the logged label diverges from the value handed to checkCanonicalPath
   * (e.g. find_and_replace logs the forward-slash `rel` but resolves the
   * separator-joined path).
   */
  attemptedPathLabel?: string;
}

/**
 * Run the Layer-2 canonical-path check and, on escape, log `pathEscapeAttempt` and
 * throw PATH_ESCAPES_VAULT. Returns the canonical absolute path on success.
 * Byte-identical to the prior inlined PATH_ESCAPES_VAULT blocks across all seven
 * consumers (the `details` shape is `{vault, attemptedPath, resolvedPath}`).
 */
export async function assertCanonicalPath(
  vaultRoot: string,
  inputPath: string,
  ctx: CanonicalGuardContext,
): Promise<string> {
  const check = await checkCanonicalPath(vaultRoot, inputPath, { realpath: ctx.realpath });
  if (!check.ok) {
    const attemptedPath = ctx.attemptedPathLabel ?? check.attemptedPath;
    ctx.logger.pathEscapeAttempt({ vault: ctx.vaultLabel, attemptedPath });
    throw new UpstreamError({
      code: "PATH_ESCAPES_VAULT",
      cause: null,
      details: { vault: ctx.vaultLabel, attemptedPath, resolvedPath: check.resolvedPath },
    });
  }
  return check.resolvedPath;
}
