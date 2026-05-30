// Original — no upstream. dispatchCli: the single spawn-and-collect primitive owning argv assembly, four-priority classification, always-on bounds, atomic in-flight registry, and failure-only stderr logging (ADR-007, FR-008..FR-018a). Wraps one `dispatchOnce` attempt with the ADR-029 single cold-start retry: a form-(a) cold-start signature (`CLI_REPORTED_ERROR` whose stdout matches COLD_START_PATTERN, the registry-not-ready `Error: Command "<cmd>" not found.`) on the first attempt triggers exactly one re-spawn whose outcome is authoritative; all other outcomes are single-shot. Form (b) `Stream closed` is NOT retried — a dropped transport pipe carries no evidence of lifecycle position, so retrying it could double-apply a mutation; the default-safe posture leaves it single-shot (form (a) only). Signature pinned by 2026-05-30 T0 probes against the production `Obsidian.com` shim.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";

import { launchObsidian } from "../app-launcher/app-launcher.js";
import { resolveBinary, type ResolutionAttempt } from "../binary-resolver/binary-resolver.js";
import { UpstreamError } from "../errors.js";

import type { Logger } from "../logger.js";

export const SIGKILL_GRACE_MS = 2_000;

// BI-060 recovery constants (pinned by 2026-05-30 T0 probes; data-model §6).
/** The CLI-emitted, OS-invariant clause identifying the application-not-running condition (research D1). */
export const APP_NOT_RUNNING_PATTERN = /unable to find Obsidian/i;
/** Total readiness budget after a launch — bound that guarantees termination (research D3; T0 ~3 s + margin). */
export const OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS = 30_000;
/** Interval between bounded re-attempts while waiting for the launched app to become ready (research D3). */
export const LAUNCH_POLL_INTERVAL_MS = 750;

/** The launcher seam type — the real `launchObsidian`, substitutable in tests. */
export type LaunchFn = typeof launchObsidian;

export type SpawnLike = (binary: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface DispatchInput {
  command: string;
  vault?: string;
  parameters?: Record<string, string | number | boolean | undefined>;
  flags?: string[];
  copy?: boolean;
  timeoutMs: number;
  outputCapBytes: number;
}

export interface DispatchOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
  argv: string[];
}

export type ResolveBinaryFn = typeof resolveBinary;

export interface DispatchDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  /**
   * Test seam (per binary-resolver contract): substitute a synchronous-resolving
   * stub so timing-sensitive tests (`vi.useFakeTimers`, microtask-counting kills,
   * etc.) don't race against the production resolver's real `fs.access` I/O.
   * Defaults to the production three-tier resolver in `binary-resolver/`.
   */
  resolveBinary?: ResolveBinaryFn;
  /**
   * BI-060 test seam: substitute the app launcher so the recovery loop can be driven without
   * spawning a real opener. Defaults to the production `launchObsidian`. Injected here (not at
   * `createServer`) so both facades inherit recovery and the composition root is untouched.
   */
  launchFn?: LaunchFn;
}

interface InFlightContext {
  callId: string;
  command: string;
  startedAt: number;
  logger: Logger;
}

let inFlightChild: ChildProcess | null = null;
let inFlightContext: InFlightContext | null = null;

// Set by killInFlightChildren() (the server.ts triggerShutdown entry). Checked before the
// ADR-029 retry so a shutdown landing in the gap between attempt-1 settle and attempt-2 spawn
// skips the retry — otherwise attempt 2 would spawn AFTER the shutdown sweep saw an empty
// registry, orphaning the child (research D6).
let shuttingDown = false;

/**
 * The command-name-independent stdout signature that identifies a form-(a) cold-start: an
 * Obsidian command issued against a registered-but-closed vault whose command registry has
 * not loaded yet returns, on exit 0, `Error: Command "<cmd>" not found.` followed by an
 * edit-distance-dependent suffix. T0 live-CLI probes (2026-05-30, driving the production
 * `Obsidian.com` shim — NOT the GUI `.exe`, whose detached stdio produced a misleading
 * empty-exit-0; see specs/059-retry-cold-start/contracts/t0-probe-findings.md) observed two
 * suffixes for the same registry-not-ready state:
 *   - `Error: Command "eval" not found. It may require a plugin to be enabled.`   (no near match)
 *   - `Error: Command "read" not found. Did you mean: sync:read, daily:read, template:read?`
 * The invariant is therefore the PREFIX `Command "<cmd>" not found.`, not either suffix — an
 * earlier suffix-only literal silently missed the `read`-style cold-start. The anchored
 * `Error: Command "..." not found.` form excludes the adjacent `File not found` /
 * `Folder "x" not found.` / facade `Vault not found.` signatures, which are NOT command-registry
 * misses and must stay single-shot. dispatchCli priority (c) classifies the cold-start as
 * CLI_REPORTED_ERROR. Exported as the single source of truth shared with the co-located tests.
 */
export const COLD_START_PATTERN = /^\s*Error: Command "[^"]*" not found\./;

/**
 * Decides whether a first-attempt thrown value is a form-(a) cold-start eligible for one retry.
 * Type-guards before reading `.code`/`.details` (the caught value is `unknown`). Form (a) only:
 * form (b) `Stream closed` is NOT retried — a dropped transport pipe carries no evidence of
 * where in the command lifecycle it fired, so retrying it could double-apply a mutation; the
 * default-safe posture (research D5) is to leave it single-shot. Never matches CLI_TIMEOUT /
 * CLI_OUTPUT_TOO_LARGE / CLI_NON_ZERO_EXIT / CLI_BINARY_NOT_FOUND / ERR_NO_ACTIVE_FILE, nor a
 * non-command-not-found `Error:` stdout (e.g. File/Folder/Vault not-found) — those stay
 * single-shot (FR-008).
 *
 * Bounded false-positive (accepted): a read whose file body *begins* with
 * `Error: Command "<x>" not found.` is already classified CLI_REPORTED_ERROR by priority (c)
 * — independent of this retry — and here triggers one extra (idempotent) re-read before the
 * same error propagates. We deliberately do NOT anchor the pattern to end-of-line after the
 * period: the real signature carries a trailing suffix (` Did you mean: ...` / ` It may
 * require a plugin to be enabled.`), so an EOL anchor would FALSE-NEGATIVE genuine cold-starts
 * — a far worse failure (the feature silently no-ops) than one bounded, non-masking extra
 * spawn on pathological file content.
 */
export function isColdStart(value: unknown): boolean {
  return (
    value instanceof UpstreamError &&
    value.code === "CLI_REPORTED_ERROR" &&
    typeof value.details?.stdout === "string" &&
    COLD_START_PATTERN.test(value.details.stdout)
  );
}

/**
 * BI-060 recovery predicate — the structural sibling of `isColdStart`. Decides whether a thrown
 * value is the application-not-running condition eligible for an auto-launch + bounded re-attempt.
 * Keys off the `details.reason` sub-discriminator attached at classification time (priority (a),
 * below) — NOT a fresh stderr match — so the predicate is a cheap, allocation-free read. Disjoint
 * from `isColdStart` (app-down is a non-zero exit with the stderr signature; cold-start is exit 0
 * with the command-not-found stdout signature). Never matches CLI_TIMEOUT / CLI_OUTPUT_TOO_LARGE /
 * CLI_BINARY_NOT_FOUND / a generic CLI_NON_ZERO_EXIT without the reason (FR-009).
 */
export function isAppNotRunning(value: unknown): boolean {
  return (
    value instanceof UpstreamError &&
    value.code === "CLI_NON_ZERO_EXIT" &&
    value.details?.reason === "obsidian-not-running"
  );
}

/** The closed disable-set for the auto-launch opt-out (research D5; data-model §6). */
const AUTO_LAUNCH_DISABLE_SET = new Set(["0", "false", "no", "off"]);

/**
 * BI-060 opt-out (research D5) — auto-launch is ON by default; OFF only when `OBSIDIAN_AUTO_LAUNCH`,
 * trimmed and lower-cased, is one of {0,false,no,off}. Any other value (including unset) leaves it
 * on. Mirrors how `binary-resolver` reads `OBSIDIAN_BIN` (env vars are not a zod boundary surface).
 */
export function autoLaunchEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.OBSIDIAN_AUTO_LAUNCH;
  if (typeof raw !== "string") return true;
  return !AUTO_LAUNCH_DISABLE_SET.has(raw.trim().toLowerCase());
}

const AUTO_LAUNCH_DISABLED_MESSAGE =
  "Obsidian is not running and auto-launch is disabled (OBSIDIAN_AUTO_LAUNCH) — start Obsidian and try again.";

function launchExhaustedMessage(): string {
  return `Obsidian is not running and could not be auto-launched within ${OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS / 1000}s — start Obsidian and try again.`;
}

/**
 * Re-shape an app-not-running `CLI_NON_ZERO_EXIT` into the distinct, actionable error surfaced when
 * recovery cannot succeed. Reuses the existing top-level code (Principle IV — no new code) and the
 * `details` bag (preserving argv/stdout/stderr and the `reason` sub-discriminator), changing only
 * the human-facing `message`.
 */
function enrichAppNotRunning(error: UpstreamError, message: string): UpstreamError {
  return new UpstreamError({
    code: error.code,
    cause: error.cause,
    details: { ...error.details, reason: "obsidian-not-running" },
    message,
  });
}

/** Bounded sleep used by the readiness poll loop; unref'd so it never keeps the process alive. */
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

type KillReason =
  | { kind: "timeout" }
  | { kind: "cap"; stream: "stdout" | "stderr"; capturedBytes: number };

export function assembleArgv(input: DispatchInput, binary: string): string[] {
  const vaultPrefix = input.vault !== undefined ? [`vault=${input.vault}`] : [];
  const kvs = Object.entries(input.parameters ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  const flags = input.flags ?? [];
  const copySuffix = input.copy ? ["--copy"] : [];
  return [binary, ...vaultPrefix, input.command, ...kvs, ...flags, ...copySuffix];
}

function settlePathAttempt(
  attempts: ResolutionAttempt[],
  outcome: "resolved" | "not-found",
): ResolutionAttempt[] {
  // Trailing PATH attempt is settled by the dispatch layer once the spawn outcome is known
  // (resolver returns it as "pending"). Per Q1: PATH lookup is deferred to the OS spawn.
  const last = attempts[attempts.length - 1];
  if (last?.source === "PATH" && last.outcome === "pending") {
    return [...attempts.slice(0, -1), { source: "PATH", path: last.path, outcome }];
  }
  return attempts;
}

async function dispatchWithColdStartRetry(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutput> {
  // ADR-029 single cold-start retry (BI 059). Run one attempt; if it throws a form-(a) cold-start
  // signature, run exactly ONE more — the second attempt is authoritative (its resolve OR
  // throw is the final outcome; attempt 1's known-spurious error is discarded, Q1). Any other
  // outcome (success, or a non-cold-start failure) is returned/thrown unchanged — single-shot.
  let firstCallId = "";
  try {
    return await dispatchOnce(input, deps, (id) => {
      firstCallId = id;
    });
  } catch (error: unknown) {
    // Skip the retry when shutdown began in the attempt-1→attempt-2 gap, to avoid orphaning
    // attempt 2 after the shutdown sweep already ran (research D6).
    if (!isColdStart(error) || shuttingDown) throw error;
    return dispatchOnce(input, deps, (secondCallId) => {
      deps.logger.dispatchRetry({ command: input.command, firstCallId, secondCallId });
    });
  }
}

/**
 * BI-060 outer recovery layer, wrapping the ADR-029 cold-start retry. The inner path
 * (`dispatchWithColdStartRetry`) is run first; its outcome is authoritative for everything EXCEPT
 * an application-not-running throw (`isAppNotRunning`). Only that condition routes into recovery:
 * launch Obsidian exactly once, then re-attempt the original command in a bounded poll until it
 * resolves (or returns a non-app-down outcome), the bound elapses, or shutdown intervenes. The
 * already-running success path and every non-app-down failure (FR-009) are untouched — the recovery
 * branch is reached only after an app-not-running throw, so the success path adds zero overhead.
 * Re-attempting is side-effect-safe: app-down means the CLI errored before connecting, so the
 * command provably never executed (no double-apply, even for mutations). Single-flight (FR-006) is
 * provided structurally by `createQueue` (both facades wrap this in `queue.run`), not by new code.
 */
export async function dispatchCli(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutput> {
  const env = deps.env ?? process.env;
  try {
    return await dispatchWithColdStartRetry(input, deps);
  } catch (error: unknown) {
    if (!isAppNotRunning(error)) throw error; // FR-009 — non-app-down failures are never recovered.
    const appDown = error as UpstreamError;

    // D5 opt-out: skip the launch entirely; surface the distinct disabled error with zero added delay.
    if (!autoLaunchEnabled(env)) {
      deps.logger.dispatchRecovery({ command: input.command, launched: false, outcome: "disabled", attempts: 0 });
      throw enrichAppNotRunning(appDown, AUTO_LAUNCH_DISABLED_MESSAGE);
    }
    // Shutdown guard: a launch + poll started during teardown would orphan a child after the sweep.
    // Propagate the original app-down error unchanged (mirrors the cold-start retry's shutdown skip).
    if (shuttingDown) throw appDown;

    const launchFn = deps.launchFn ?? launchObsidian;
    const launchStartedAt = Date.now();
    // Launch exactly once (FR-003). An opener failure (ENOENT etc.) is swallowed here — the readiness
    // bound below governs the eventual distinct error, so a missing opener degrades to the same
    // bounded "could not auto-launch" outcome as a launch that simply never becomes ready.
    await launchFn({ vault: input.vault }).catch(() => undefined);

    const deadline = launchStartedAt + OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS;
    let attempts = 0;
    // Every app-down error in this loop is structurally identical (same input → same argv/stderr/
    // reason), so the initial `appDown` is the canonical one to enrich on exhaustion — no need to
    // track the latest re-attempt's error separately.
    while (Date.now() < deadline) {
      if (shuttingDown) throw appDown; // don't spawn a fresh re-attempt during teardown.
      attempts += 1;
      try {
        const out = await dispatchWithColdStartRetry(input, deps);
        deps.logger.dispatchRecovery({
          command: input.command,
          launched: true,
          outcome: "recovered",
          attempts,
          readyMs: Date.now() - launchStartedAt,
        });
        return out;
      } catch (reError: unknown) {
        if (!isAppNotRunning(reError)) throw reError; // first non-app-down outcome is authoritative.
        await sleep(LAUNCH_POLL_INTERVAL_MS);
      }
    }
    // Bound exhausted (FR-004/FR-010): surface the distinct, actionable could-not-launch error.
    deps.logger.dispatchRecovery({ command: input.command, launched: true, outcome: "unrecoverable", attempts });
    throw enrichAppNotRunning(appDown, launchExhaustedMessage());
  }
}

// One spawn-and-classify attempt. callId and startedAt are minted INSIDE so each attempt
// (first or retry) carries its own identity/clock — two attempts sharing one callId would
// collide in dispatch.timeout/cap/kill logs and double-count durationMs (research D7). The
// optional onCallId callback fires synchronously when the id is minted, letting the retry
// orchestrator capture both attempts' callIds for the dispatch.retry line without widening
// DispatchOutput / UpstreamError.
async function dispatchOnce(
  input: DispatchInput,
  deps: DispatchDeps,
  onCallId?: (callId: string) => void,
): Promise<DispatchOutput> {
  const env = deps.env ?? process.env;
  const resolveBinaryFn = deps.resolveBinary ?? resolveBinary;
  const resolved = await resolveBinaryFn({
    env,
    platform: process.platform,
    homedir: os.homedir,
    access: fsPromises.access,
  });
  const binary = resolved.path;
  const argv = assembleArgv(input, binary);
  const spawnArgs = argv.slice(1);
  const spawnFn = deps.spawnFn ?? nodeSpawn;
  const callId = randomUUID();
  onCallId?.(callId);
  const startedAt = Date.now();

  return new Promise<DispatchOutput>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnFn(binary, spawnArgs, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      // Atomic registry insertion (FR-015a / Q5): synchronous with spawn(),
      // BEFORE any await or microtask boundary. Both cells set together so
      // killInFlightChildren() can read context for its dispatch.kill emission.
      inFlightChild = child;
      inFlightContext = { callId, command: input.command, startedAt, logger: deps.logger };
    } catch (err: unknown) {
      const errnoCode = (err as NodeJS.ErrnoException).code;
      if (errnoCode === "ENOENT") {
        reject(
          new UpstreamError({
            code: "CLI_BINARY_NOT_FOUND",
            cause: err,
            details: {
              platform: process.platform,
              attempts: settlePathAttempt(resolved.attempts, "not-found"),
              PATH: env.PATH,
            },
          }),
        );
        return;
      }
      reject(err);
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killReason: KillReason | null = null;
    let sigkillTimer: NodeJS.Timeout | null = null;
    let settled = false;

    function clearRegistryIfMine(): void {
      if (inFlightChild === child) {
        inFlightChild = null;
        inFlightContext = null;
      }
    }

    function scheduleSigkill(): void {
      sigkillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already dead */
        }
      }, SIGKILL_GRACE_MS);
      sigkillTimer.unref?.();
    }

    function killChild(reason: KillReason): void {
      if (killReason || settled) return;
      killReason = reason;
      try {
        child.kill("SIGTERM");
      } catch {
        /* already dead */
      }
      scheduleSigkill();
    }

    const timeoutTimer = setTimeout(() => killChild({ kind: "timeout" }), input.timeoutMs);
    timeoutTimer.unref?.();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > input.outputCapBytes && !killReason) {
        stdoutChunks.push(chunk);
        killChild({ kind: "cap", stream: "stdout", capturedBytes: stdoutBytes });
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > input.outputCapBytes && !killReason) {
        stderrChunks.push(chunk);
        killChild({ kind: "cap", stream: "stderr", capturedBytes: stderrBytes });
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearRegistryIfMine();
      clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      if (err.code === "ENOENT") {
        reject(
          new UpstreamError({
            code: "CLI_BINARY_NOT_FOUND",
            cause: err,
            details: {
              platform: process.platform,
              attempts: settlePathAttempt(resolved.attempts, "not-found"),
              PATH: env.PATH,
            },
          }),
        );
        return;
      }
      reject(err);
    });

    function onTerminal(code: number | null, signal: NodeJS.Signals | null): void {
      if (settled) return;
      settled = true;
      clearRegistryIfMine();
      clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const durationMs = Date.now() - startedAt;
      const pid = child.pid ?? -1;

      // Bounds-fired classifications come first — they observed the kill before exit.
      if (killReason?.kind === "timeout") {
        deps.logger.dispatchTimeout({
          callId,
          command: input.command,
          pid,
          timeoutMs: input.timeoutMs,
          durationMs,
        });
        reject(
          new UpstreamError({
            code: "CLI_TIMEOUT",
            cause: null,
            details: {
              argv,
              timeoutMs: input.timeoutMs,
              partialStdout: stdout,
              partialStderr: stderr,
            },
          }),
        );
        return;
      }
      if (killReason?.kind === "cap") {
        const sourceChunks = killReason.stream === "stdout" ? stdoutChunks : stderrChunks;
        const partialBuffer = Buffer.concat(sourceChunks).subarray(0, input.outputCapBytes);
        const partial = partialBuffer.toString("utf8");
        deps.logger.dispatchCap({
          callId,
          command: input.command,
          pid,
          stream: killReason.stream,
          capturedBytes: killReason.capturedBytes,
          limitBytes: input.outputCapBytes,
        });
        reject(
          new UpstreamError({
            code: "CLI_OUTPUT_TOO_LARGE",
            cause: null,
            details: {
              argv,
              stream: killReason.stream,
              limitBytes: input.outputCapBytes,
              capturedBytes: killReason.capturedBytes,
              partial,
            },
          }),
        );
        return;
      }

      // Priority (a): non-zero exit (or signal-only termination via code === null → exitCode -1 sentinel).
      if (code !== 0) {
        const exitCode = code ?? -1;
        // BI-060: tag the application-not-running condition with the ADR-015 sub-discriminator so the
        // outer recovery layer (and callers) can distinguish it from a generic non-zero exit. The
        // CLI emits this clause identically across commands and OSes (research D1) — command-agnostic.
        const appDown = APP_NOT_RUNNING_PATTERN.test(stderr) ? { reason: "obsidian-not-running" } : {};
        reject(
          new UpstreamError({
            code: "CLI_NON_ZERO_EXIT",
            cause: { exitCode, signal },
            details: { argv, command: input.command, stdout, stderr, exitCode, signal, ...appDown },
          }),
        );
        return;
      }

      const trimmedHead = stdout.trimStart();

      // Priority (b): ERR_NO_ACTIVE_FILE — exit 0 with stdout starting with the canonical
      // phrase, case-insensitive (BI-041 FR-001). Upstream emits the capital-N canonical
      // form `"Error: No active file."` on `delete` / `rename` / `outline`; older lowercase
      // fixtures keep matching (monotonic widening). Anchor stays at the message head —
      // substring-anywhere matches are rejected by the prefix invariant. Must precede
      // priority (c).
      if (trimmedHead.toLowerCase().startsWith("error: no active file")) {
        const message = stdout.split("\n", 1)[0]!.trim();
        reject(
          new UpstreamError({
            code: "ERR_NO_ACTIVE_FILE",
            cause: null,
            details: { argv, command: input.command, stdout, stderr, exitCode: 0, message },
            message:
              'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
          }),
        );
        return;
      }

      // Priority (c): CLI_REPORTED_ERROR — exit 0 with stdout starting with `Error:` (any other suffix).
      if (trimmedHead.startsWith("Error:")) {
        const message = stdout.split("\n", 1)[0]!.trim();
        reject(
          new UpstreamError({
            code: "CLI_REPORTED_ERROR",
            cause: null,
            details: { argv, command: input.command, stdout, stderr, exitCode: 0, message },
          }),
        );
        return;
      }

      // Priority (d): success.
      resolve({ stdout, stderr, exitCode: 0, argv });
    }

    // Listen on both `exit` and `close` so the primitive works with stub spawns
    // (which historically emit `close` only) and with real child processes
    // (which emit `exit` first, then `close`). The settled guard ensures we
    // classify exactly once.
    child.on("exit", onTerminal);
    child.on("close", onTerminal);
  });
}

export function killInFlightChildren(): boolean {
  // Mark shutdown so an in-progress ADR-029 retry skips its second attempt (research D6).
  // Set unconditionally — even when no child is mid-flight (the retry gap), the flag must
  // latch so dispatchCli's retry guard sees it.
  shuttingDown = true;
  if (!inFlightChild || !inFlightContext) return false;
  const child = inFlightChild;
  const ctx = inFlightContext;
  const pid = child.pid ?? -1;
  try {
    child.kill("SIGTERM");
  } catch {
    /* already dead */
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already dead */
    }
  }, SIGKILL_GRACE_MS).unref?.();
  ctx.logger.dispatchKill({
    callId: ctx.callId,
    command: ctx.command,
    pid,
    durationMs: Date.now() - ctx.startedAt,
  });
  return true;
}

/** Test-only: reset the module-level registry + shutdown flag between tests. Not part of the public API. */
export function __resetInFlightRegistryForTests(): void {
  inFlightChild = null;
  inFlightContext = null;
  shuttingDown = false;
}
