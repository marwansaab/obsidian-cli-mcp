// Original — no upstream. invokeCli typed-tool facade: top-level vault field (symmetric with invokeBoundedCli per Code-5 / 2026-05-08), target-mode locator strip on parameters, queue-wrapped routing through dispatchCli with fixed 10 s / 10 MiB bounds (ADR-007, FR-013), success-path stdout inspection re-classifying unknown-vault responses to CLI_REPORTED_ERROR (BI 011-write-note R5 / T002 — verbatim CLI wording captured at T0.4: "Vault not found." on stdout, exit 0). 068 R11: the per-call signal and progress reporter pass to the queue and to dispatchCli. 080: `invokeEval` is the typed-eval facade — it wraps the code with a per-call answer tag (evalNonce seam, default randomUUID), the tag rides on the DispatchInput, and dispatch's located tagged answer comes back as `answer`; `invokeCli` itself has no eval-specific behaviour.
import { randomUUID } from "node:crypto";

import {
  dispatchCli,
  killInFlightChildren,
  type CallScope,
  type DispatchInput,
  type DispatchOutput,
  type LaunchFn,
  type ReportProgress,
  type ResolveBinaryFn,
  type SpawnLike,
} from "./_dispatch.js";
import { evalAnswerTag, wrapEvalCode } from "./eval-output.js";
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

export interface InvokeEvalInput {
  /** The JavaScript to evaluate. It is wrapped with this call's answer tag before it is spawned. */
  code: string;
  /**
   * Vault display name: `vault=` on the argv (specific mode). Undefined runs the eval in the
   * vault focused in Obsidian (active mode).
   */
  vault?: string;
}

export interface InvokeEvalSuccess {
  stdout: string;
  stderr: string;
  /**
   * The text after this call's answer tag on its `=> ` line, or null when no line carries the
   * tag or tagged lines disagree (spec 080). Plugin lines and look-alike `=> ` lines never count.
   */
  answer: string | null;
}

export interface InvokeCliDeps extends CallScope {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  queue: Queue;
  /** Test seam — passes through to dispatchCli. See DispatchDeps.resolveBinary. */
  resolveBinary?: ResolveBinaryFn;
  /** Test seam — passes through to dispatchCli's BI-060 recovery. See DispatchDeps.launchFn. */
  launchFn?: LaunchFn;
  /** Test seam — the nonce for an eval call's answer tag (spec 080). Defaults to `randomUUID`. */
  evalNonce?: () => string;
}

export { UpstreamError, killInFlightChildren };
export type { CallScope, LaunchFn, ReportProgress, ResolveBinaryFn, SpawnLike };

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
  return runTyped(input, deps).then((out) => ({ stdout: out.stdout, stderr: out.stderr }));
}

/**
 * Run `code` through `obsidian eval` in `vault` (specific mode) or the focused vault (active mode,
 * `vault` undefined), and return the call's tagged answer (spec 080). The code is wrapped so its
 * printed value starts with a per-call tag, which tells the answer apart from plugin lines,
 * look-alike `=> ` lines included. Every typed tool's eval goes through here; CLI failures reject
 * as the adapter's UpstreamError.
 */
export function invokeEval(input: InvokeEvalInput, deps: InvokeCliDeps): Promise<InvokeEvalSuccess> {
  const tag = evalAnswerTag((deps.evalNonce ?? randomUUID)());
  return runTyped(
    {
      command: "eval",
      vault: input.vault,
      parameters: { code: wrapEvalCode(input.code, tag) },
      flags: [],
      target_mode: input.vault === undefined ? "active" : "specific",
    },
    deps,
    tag,
  ).then((out) => ({ stdout: out.stdout, stderr: out.stderr, answer: out.evalAnswer ?? null }));
}

/** The shared typed-tool route: locator strip, fixed bounds, queue, dispatch, unknown-vault check. */
function runTyped(input: InvokeCliInput, deps: InvokeCliDeps, evalAnswerTag?: string): Promise<DispatchOutput> {
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
    ...(evalAnswerTag === undefined ? {} : { evalAnswerTag }),
  };
  // 068 R11: the signal reaches both the queue (a cancelled queued call never starts) and the
  // dispatch (a cancelled running call kills its child).
  return deps.queue.run(async () => {
    const out = await dispatchCli(dispatchInput, {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      resolveBinary: deps.resolveBinary,
      launchFn: deps.launchFn,
      signal: deps.signal,
      reportProgress: deps.reportProgress,
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
    return out;
  }, { signal: deps.signal });
}
