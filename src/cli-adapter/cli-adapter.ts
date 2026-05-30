// Original — no upstream. invokeCli typed-tool facade: top-level vault field (symmetric with invokeBoundedCli per Code-5 / 2026-05-08), target-mode locator strip on parameters, queue-wrapped routing through dispatchCli with fixed 10 s / 10 MiB bounds (ADR-007, FR-013), success-path stdout inspection re-classifying unknown-vault responses to CLI_REPORTED_ERROR (BI 011-write-note R5 / T002 — verbatim CLI wording captured at T0.4: "Vault not found." on stdout, exit 0).
import { dispatchCli, killInFlightChildren, type DispatchInput, type LaunchFn, type ResolveBinaryFn, type SpawnLike } from "./_dispatch.js";
import { UpstreamError } from "../errors.js";

import type { Logger } from "../logger.js";
import type { Queue } from "../queue.js";

export type TargetMode = "specific" | "active";

export const TYPED_TOOL_TIMEOUT_MS = 10_000;
export const TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024;

export interface InvokeCliInput {
  command: string;
  /**
   * Vault display name. Top-level field (matching `invokeBoundedCli`'s shape) so
   * both facades have symmetric public input contracts. In `target_mode: "active"`
   * the field is ignored; in `"specific"` it flows through to `dispatchCli`'s
   * argv prefix per the documented order [binary, vault=..., command, kvs...].
   */
  vault?: string;
  parameters: Record<string, string | number | boolean | undefined>;
  flags: string[];
  target_mode: TargetMode;
  copy?: boolean;
}

export interface InvokeCliSuccess {
  stdout: string;
  stderr: string;
}

export interface InvokeCliDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  queue: Queue;
  /** Test seam — passes through to dispatchCli. See DispatchDeps.resolveBinary. */
  resolveBinary?: ResolveBinaryFn;
  /** Test seam — passes through to dispatchCli's BI-060 recovery. See DispatchDeps.launchFn. */
  launchFn?: LaunchFn;
}

export { UpstreamError, killInFlightChildren };
export type { LaunchFn, ResolveBinaryFn, SpawnLike };

const TARGET_LOCATOR_KEYS = new Set(["vault", "file", "path"]);

function stripTargetLocators(
  parameters: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean | undefined> {
  const stripped: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(parameters)) {
    if (!TARGET_LOCATOR_KEYS.has(k)) stripped[k] = v;
  }
  return stripped;
}

const UNKNOWN_VAULT_PREFIX = "Vault not found.";

export function invokeCli(input: InvokeCliInput, deps: InvokeCliDeps): Promise<InvokeCliSuccess> {
  // Defence-in-depth strip in active mode: the typed-tool target_mode schema
  // already rejects vault/file/path at the boundary, but a hypothetical future
  // caller that constructs `parameters` less carefully gets the same protection
  // here. With vault now a top-level field, the strip primarily defends against
  // file/path leaking in via parameters (vault stripping is redundant but harmless).
  const parameters =
    input.target_mode === "active" ? stripTargetLocators(input.parameters) : input.parameters;
  const dispatchInput: DispatchInput = {
    command: input.command,
    vault: input.target_mode === "active" ? undefined : input.vault,
    parameters,
    flags: input.flags,
    copy: input.copy ?? false,
    timeoutMs: TYPED_TOOL_TIMEOUT_MS,
    outputCapBytes: TYPED_TOOL_OUTPUT_CAP_BYTES,
  };
  return deps.queue.run(async () => {
    const out = await dispatchCli(dispatchInput, {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      resolveBinary: deps.resolveBinary,
      launchFn: deps.launchFn,
    });
    // R5 / T002: success-path stdout inspection. The CLI returns exit 0 with
    // stdout `Vault not found.` for unknown vault display names, so the
    // dispatch-layer four-priority classification (which only inspects
    // `Error:` prefixes on stdout) does NOT catch it. Re-classify here so all
    // typed tools inherit the structured failure surface.
    const trimmed = out.stdout.trimStart();
    if (trimmed.startsWith(UNKNOWN_VAULT_PREFIX)) {
      const message = trimmed.split("\n", 1)[0]!.trim();
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { command: input.command, stdout: out.stdout, stderr: out.stderr, exitCode: 0, message },
        message,
      });
    }
    return { stdout: out.stdout, stderr: out.stderr };
  });
}
