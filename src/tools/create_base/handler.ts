// Original — no upstream. create_base handler — wraps the native `obsidian base:create` subcommand.
// With no `vault`, the call runs against the vault in front exactly as before. With a named `vault`
// (spec 083), it runs a pipeline in that vault (research D5): resolve the vault (VAULT_NOT_FOUND),
// contain `base_path`, ask Obsidian through the frozen ITEM_FOLDER_TEMPLATE eval which folder the item
// will land in and contain that folder plus any folder part of `name` (Clarifications Q1), then
// `base:create vault=…`, then check the `Created:` path as a backstop that reports an escape with
// `createdPath` and never deletes the item (Clarifications Q4). BASE_NOT_FOUND gains `details.vault`
// only when a vault is named.
import { promises as nodeFs } from "node:fs";
import { posix } from "node:path";

import { ITEM_FOLDER_TEMPLATE } from "./_template.js";
import {
  createBaseOutputSchema,
  itemFolderEvalResponseSchema,
  type CreateBaseInput,
  type CreateBaseOutput,
} from "./schema.js";
import { invokeCli, invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError, stringDetail } from "../../errors.js";
import {
  assertCanonicalPath,
  decodeEvalEnvelope,
  resolveVaultRootOrRemap,
  type CanonicalGuardContext,
} from "../_active-file.js";
import { composeEvalCode } from "../_shared.js";

import type { SupportDeclaration } from "../../file-type/file-type.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

/** create_base adds an item to a base (`base_path`); others keep their INVALID_BASE_PATH rejection (spec 070 FR-007a). */
export const CREATE_BASE_SUPPORTED = ["base"] as const satisfies SupportDeclaration;

/** The realpath seam the named-vault containment checks resolve through (tests inject symlink escapes). */
export interface ExecuteFs {
  realpath: (p: string) => Promise<string>;
}

const DEFAULT_FS: ExecuteFs = { realpath: (p) => nodeFs.realpath(p) };

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  /**
   * Injected at the composition root (server.ts) — used when `vault` is named to resolve that
   * vault's root (or surface a typed VAULT_NOT_FOUND/unknown) BEFORE anything is spawned. The
   * handler never constructs it (DI discipline).
   */
  vaultRegistry: VaultRegistry;
  fs?: ExecuteFs;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const TOOL_NAME = "create_base";

const CREATED_PATTERN = /^Created:\s*(.+)$/m;
const BASE_NOT_FOUND_PATTERN = /Base file not found/i;

/**
 * BASE_NOT_FOUND for `input.base_path`. With no vault named, details and message are exactly the
 * pre-083 ones; with a vault, details gain `vault` and the message names it (research D4).
 */
function baseNotFound(input: CreateBaseInput, cause: unknown): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause,
    details: { code: "BASE_NOT_FOUND", path: input.base_path, ...(input.vault === undefined ? {} : { vault: input.vault }) },
    message:
      input.vault === undefined
        ? `create_base: base file not found: ${input.base_path}`
        : `create_base: base file not found in vault "${input.vault}": ${input.base_path}`,
  });
}

/**
 * Pre-creation stages of the named-vault pipeline (research D5 stages 1–4): resolve the vault
 * (VAULT_NOT_FOUND), contain `base_path`, ask Obsidian for the item folder, contain that folder
 * joined with any folder part of `name`. Any failure stops the call before `base:create`.
 * Returns the post-creation backstop for the `Created:` path.
 */
async function containNamedVaultTarget(
  input: CreateBaseInput,
  vault: string,
  deps: ExecuteDeps,
): Promise<(created: string) => Promise<void>> {
  const root = await resolveVaultRootOrRemap(deps.vaultRegistry, vault, TOOL_NAME);
  const guard: CanonicalGuardContext = { realpath: (deps.fs ?? DEFAULT_FS).realpath, logger: deps.logger, vaultLabel: vault };
  await assertCanonicalPath(root, input.base_path, guard);

  const result = await invokeEval({ code: composeEvalCode(ITEM_FOLDER_TEMPLATE, { path: input.base_path }), vault }, deps);
  const decoded = decodeEvalEnvelope(result, itemFolderEvalResponseSchema, {
    toolName: TOOL_NAME,
    malformedCode: "CLI_REPORTED_ERROR",
  });
  if (!decoded.ok) throw baseNotFound(input, null);

  const itemFolder = posix.join(decoded.folder, posix.dirname(input.name.replace(/\\/g, "/")));
  await assertCanonicalPath(root, itemFolder, { ...guard, attemptedPathLabel: itemFolder });

  // Post-creation backstop (Clarifications Q4): the `Created:` path must resolve inside the named
  // vault. An escape is reported with `createdPath`; the item is never deleted.
  return async (created) => {
    try {
      await assertCanonicalPath(root, created, guard);
    } catch (err) {
      if (err instanceof UpstreamError && err.code === "PATH_ESCAPES_VAULT") {
        throw new UpstreamError({
          code: "PATH_ESCAPES_VAULT",
          cause: err,
          details: { ...err.details, createdPath: created },
          message: `create_base: the item was created at "${created}", which resolves outside vault "${vault}"; it was not deleted`,
        });
      }
      throw err;
    }
  };
}

export async function executeCreateBase(
  input: CreateBaseInput,
  deps: ExecuteDeps,
): Promise<CreateBaseOutput> {
  const checkCreated = input.vault === undefined ? null : await containNamedVaultTarget(input, input.vault, deps);

  const parameters: Record<string, string> = {
    path: input.base_path,
    name: input.name,
  };
  if (input.content !== undefined) parameters.content = input.content;
  if (input.view_name !== undefined) parameters.view = input.view_name;

  let cliResult: { stdout: string; stderr: string };
  try {
    cliResult = await invokeCli(
      {
        command: "base:create",
        vault: input.vault,
        parameters,
        flags: [],
        target_mode: "specific",
      },
      deps,
    );
  } catch (err) {
    if (err instanceof UpstreamError && err.code === "CLI_REPORTED_ERROR") {
      const stdout = stringDetail(err.details, "stdout");
      const stderr = stringDetail(err.details, "stderr");
      const combined = `${stdout}\n${stderr}`;
      if (BASE_NOT_FOUND_PATTERN.test(combined)) throw baseNotFound(input, err);
    }
    throw err;
  }

  const combined = `${cliResult.stdout}\n${cliResult.stderr}`;
  if (BASE_NOT_FOUND_PATTERN.test(combined)) throw baseNotFound(input, null);

  const match = CREATED_PATTERN.exec(cliResult.stdout);
  if (!match) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        stage: "response-parse",
        stdout: cliResult.stdout.slice(0, 500),
      },
      message: "create_base: CLI stdout did not contain expected 'Created: <path>' pattern",
    });
  }

  // `Created:` carries the vault-relative path Obsidian chose (the Base's `file.inFolder` folder,
  // else the new-note location, joined with any folder part of `name`), so it is the response path
  // as-is, and the same value the named-vault backstop checks.
  const createdPath = match[1]!.trim().replace(/\\/g, "/");
  await checkCreated?.(createdPath);

  return createBaseOutputSchema.parse({ path: createdPath, name: posix.basename(createdPath) });
}
