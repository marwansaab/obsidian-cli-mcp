// Original — no upstream. Shared active/specific locator resolution for the write + vault-scan tool cohorts (F1 of the thermo-nuclear code-quality review). Centralises the focused-file / focused-vault `obsidian eval` round-trip, the eval answer parse (spec 080: the call's tagged answer line, other plugins' output ignored, parse errors carrying the stdout excerpt), the cohort-uniform ERR_NO_ACTIVE_FILE message, the registry VALIDATION_ERROR -> CLI_REPORTED_ERROR/VAULT_NOT_FOUND remap, the `obsidian file` TSV path resolver (plus `findFileByTsv`, its null-on-not-found variant whose caller decides what a miss means — write_note's create-by-name, BI-0176, and find_and_replace's INVALID_NOTE/not-found, BI-0178 — and Obsidian's `FILE_NOT_FOUND_LINE`), the canonical-path / PATH_ESCAPES_VAULT guard, and the reverse vault display-name lookup that were previously copy-pasted across write_note, append_note, prepend, patch_block, patch_heading, find_and_replace, and query_base. Every helper preserves the prior inlined behaviour byte-for-byte (template strings, error codes, messages, and `details` shapes); divergences between consumers (tool name in messages, the no-active-file label, the per-note attempted-path label) surface as explicit parameters rather than forked copies. It also hosts `decodeEvalEnvelope` — the eval-composed cohort's shared `parseEvalAnswer` + `safeParse` envelope decoder (backlinks, links, open_file, get_active_file, views_base, paths, read_heading, tag, smart_connections_query, smart_connections_similar), with the per-tool malformed-eval code (CLI_REPORTED_ERROR vs INTERNAL_ERROR) as an explicit parameter.

import { parseEvalAnswer, stdoutDetails } from "./_eval-parse.js";
import {
  invokeCli,
  invokeEval,
  type CallScope,
  type InvokeEvalSuccess,
  type SpawnLike,
} from "../cli-adapter/cli-adapter.js";
import { stringDetail, UpstreamError } from "../errors.js";
import { checkCanonicalPath } from "../path-safety/canonical.js";

import type { Logger } from "../logger.js";
import type { Queue } from "../queue.js";
import type { VaultRegistry } from "../vault-registry/registry.js";
import type { ZodType } from "zod";

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
export interface EvalDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

/** The parts of an `invokeEval` result the decoders read: the raw stdout and this call's answer. */
export type EvalAnswer = Pick<InvokeEvalSuccess, "stdout" | "answer">;

/**
 * Decode an eval-composed tool's `obsidian eval` result into its validated discriminated
 * envelope. JSON-parses the call's answer (via {@link parseEvalAnswer}; other plugins' lines
 * around it are ignored, spec 080), then `schema.safeParse`. On either failure throws an
 * UpstreamError carrying `details.stage` ("json-parse" | "envelope-parse") plus the raw-output
 * excerpt and length from {@link stdoutDetails}. `malformedCode` lets each caller keep its
 * existing top-level classification: the eval-composed cohort historically uses
 * CLI_REPORTED_ERROR (backlinks/links — a malformed eval reads as an upstream report), while
 * open_file uses INTERNAL_ERROR (a malformed envelope is an internal invariant violation).
 */
export function decodeEvalEnvelope<T>(
  result: EvalAnswer,
  schema: ZodType<T>,
  opts: { toolName: string; malformedCode: "CLI_REPORTED_ERROR" | "INTERNAL_ERROR" },
): T {
  const { stdout } = result;
  let parsed: unknown;
  try {
    parsed = parseEvalAnswer(result.answer);
  } catch (err) {
    throw new UpstreamError({
      code: opts.malformedCode,
      cause: err,
      details: { stage: "json-parse", ...stdoutDetails(stdout) },
      message: `${opts.toolName}: eval response is not JSON: ${stdout.slice(0, 200)}`,
    });
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new UpstreamError({
      code: opts.malformedCode,
      cause: validated.error,
      details: { stage: "envelope-parse", ...stdoutDetails(stdout) },
      message: `${opts.toolName}: eval response shape unexpected`,
    });
  }
  return validated.data;
}

function isFocusedFileResponse(value: unknown): value is FocusedFileResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (typeof v.path === "string" || v.path === null) && typeof v.base === "string";
}

/** Discriminated result of {@link parseFocusedVault}: the validated `{path, base}` envelope or the failure stage. */
export type FocusedVaultParse =
  | { ok: true; parsed: FocusedFileResponse }
  | { ok: false; stage: "json-parse" | "envelope-parse"; cause: unknown };

/**
 * Vault-cohort focused-vault parse: the double-decode + shape-check shared by find_and_replace and
 * query_base. The answer of FOCUSED_VAULT_TEMPLATE may be a JSON-encoded STRING
 * (`"{\"path\":...,\"base\":...}"`), so after the outer {@link parseEvalAnswer} an inner `JSON.parse`
 * re-decodes the string form; the bare-object form is accepted too. Returns the failure STAGE rather
 * than throwing, so each caller maps it to its own error contract: find_and_replace keeps the
 * `json-parse` / `envelope-parse` distinction and the cause; query_base collapses both into its single
 * `focused-vault-resolve` stage and discards the cause.
 */
export function parseFocusedVault(result: EvalAnswer): FocusedVaultParse {
  let outer: unknown;
  try {
    outer = parseEvalAnswer(result.answer);
  } catch (cause) {
    return { ok: false, stage: "json-parse", cause };
  }
  let parsed: unknown = outer;
  if (typeof outer === "string") {
    try {
      parsed = JSON.parse(outer);
    } catch (cause) {
      return { ok: false, stage: "envelope-parse", cause };
    }
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "base" in parsed &&
    typeof (parsed as { base: unknown }).base === "string"
  ) {
    const p = parsed as { path?: unknown; base: string };
    return { ok: true, parsed: { path: typeof p.path === "string" ? p.path : null, base: p.base } };
  }
  return { ok: false, stage: "envelope-parse", cause: null };
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
 * Throws:
 * - CLI_REPORTED_ERROR `details.stage: "json-parse"` (stdout excerpt + length) on a missing or
 *   unparseable answer.
 * - CLI_REPORTED_ERROR `details.stage: "envelope-parse"` (parsed value, stdout excerpt + length) on
 *   wrong shape.
 * - ERR_NO_ACTIVE_FILE with the cohort-uniform, tool-named message when no file is focused.
 */
export async function resolveActiveFocusedFile(
  deps: EvalDeps,
  toolName: string,
): Promise<ActiveFileLocator> {
  const focused = await invokeEval({ code: FOCUSED_FILE_TEMPLATE }, deps);
  let parsed: unknown;
  try {
    parsed = parseEvalAnswer(focused.answer);
  } catch (e) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: e,
      details: { stage: "json-parse", ...stdoutDetails(focused.stdout) },
      message: "active-mode focused-file eval returned unparseable response",
    });
  }
  if (!isFocusedFileResponse(parsed)) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stage: "envelope-parse", parsed, ...stdoutDetails(focused.stdout) },
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

/** Resolved focused-file locator plus the resolved vault display name — the file-cohort write tools' full active-mode locator. */
export interface ActiveLocatorWithVault extends ActiveFileLocator {
  vaultDisplayName: string;
}

/**
 * File-cohort active-mode resolution WITH the vault display name resolved — the common shape for the
 * write/edit tools whose output envelope carries a `vault` field (append_note, prepend, patch_block,
 * patch_heading). Composes {@link resolveActiveFocusedFile} + {@link resolveVaultDisplayName}; the
 * no-active-file and parse-error throws are inherited verbatim. write_note opts out (its output has no
 * `vault` field, so it consumes resolveActiveFocusedFile directly).
 */
export async function resolveActiveLocatorWithVault(
  deps: EvalDeps & { vaultRegistry: VaultRegistry },
  toolName: string,
): Promise<ActiveLocatorWithVault> {
  const { vaultRoot, relPath } = await resolveActiveFocusedFile(deps, toolName);
  return {
    vaultRoot,
    relPath,
    vaultDisplayName: resolveVaultDisplayName(deps.vaultRegistry, vaultRoot),
  };
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
    deps,
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
 * Obsidian's answer when a file command names a file that does not exist: `Error: File
 * "<name>" not found.` on stdout, exit 0 (spec 077 T0), surfaced by dispatch as
 * CLI_REPORTED_ERROR with the line as `details.message`. prepend matches it on its own
 * command's output.
 */
export const FILE_NOT_FOUND_LINE = /^\s*Error: File ".*" not found\.\s*$/m;

/**
 * {@link resolveFileByTsv} with the miss left to the caller: `null` only when Obsidian
 * reports the name as not found; every other failure propagates unchanged. The caller
 * decides what a miss means: write_note creates the note by the short-form rule (BI-0176),
 * find_and_replace fails with INVALID_NOTE/not-found (BI-0178).
 */
export async function findFileByTsv(
  deps: EvalDeps,
  vault: string,
  file: string,
  toolName: string,
): Promise<string | null> {
  try {
    return await resolveFileByTsv(deps, vault, file, toolName);
  } catch (e) {
    if (
      e instanceof UpstreamError &&
      e.code === "CLI_REPORTED_ERROR" &&
      FILE_NOT_FOUND_LINE.test(stringDetail(e.details, "message"))
    ) {
      return null;
    }
    throw e;
  }
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

/**
 * Resolve a known vault display name to its absolute base path via the registry,
 * remapping the registry's unknown-vault VALIDATION_ERROR to the cohort
 * VAULT_NOT_FOUND/unknown triple (via {@link remapVaultNotFound}). The vault-known
 * half of the resolve-or-remap pattern shared by find_and_replace (its
 * vault-supplied branch) and open_file (vault always required). Always returns on
 * success or throws — never undefined.
 */
export async function resolveVaultRootOrRemap(
  vaultRegistry: VaultRegistry,
  vault: string,
  toolName: string,
): Promise<string> {
  try {
    return await vaultRegistry.resolveVaultPath(vault);
  } catch (err) {
    remapVaultNotFound(err, vault, toolName);
  }
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
