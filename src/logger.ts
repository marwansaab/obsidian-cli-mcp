// Original — no upstream. JSON-lines stderr logger for failure-lifecycle dispatch events and shutdown (FR-018a, data-model §9).
import type { Writable } from "node:stream";

export type ErrorCode =
  | "CLI_NON_ZERO_EXIT"
  | "CLI_BINARY_NOT_FOUND"
  | "CLI_TIMEOUT"
  | "CLI_OUTPUT_TOO_LARGE"
  | "CLI_REPORTED_ERROR"
  | "ERR_NO_ACTIVE_FILE"
  | "FILE_EXISTS"
  | "FS_WRITE_FAILED"
  | "PATH_ESCAPES_VAULT";
export type ShutdownReason = "transport_closed" | "signal:SIGINT" | "signal:SIGTERM";

export interface ShutdownEvent {
  reason: ShutdownReason;
  inFlightKilled: boolean;
  queuedDropped: number;
}

export interface DispatchTimeoutEvent {
  callId: string;
  command: string;
  pid: number;
  timeoutMs: number;
  durationMs: number;
}

export interface DispatchCapEvent {
  callId: string;
  command: string;
  pid: number;
  stream: "stdout" | "stderr";
  capturedBytes: number;
  limitBytes: number;
}

export interface DispatchKillEvent {
  callId: string;
  command: string;
  pid: number;
  durationMs: number;
}

export interface DispatchRetryEvent {
  command: string;
  firstCallId: string;
  secondCallId: string;
}

export interface DispatchRecoveryEvent {
  command: string;
  /** false only in the disabled (opt-out) path — no launch is attempted there. */
  launched: boolean;
  outcome: "recovered" | "unrecoverable" | "disabled";
  /** Re-attempts made during the readiness poll loop. */
  attempts: number;
  /** Present only when outcome === "recovered" — ms from launch to a successful re-attempt. */
  readyMs?: number;
}

export interface PathEscapeAttemptEvent {
  vault: string | null;
  attemptedPath: string;
}

export interface Logger {
  shutdown(event: ShutdownEvent): void;
  dispatchTimeout(event: DispatchTimeoutEvent): void;
  dispatchCap(event: DispatchCapEvent): void;
  dispatchKill(event: DispatchKillEvent): void;
  dispatchRetry(event: DispatchRetryEvent): void;
  dispatchRecovery(event: DispatchRecoveryEvent): void;
  pathEscapeAttempt(event: PathEscapeAttemptEvent): void;
}

export interface LoggerOptions {
  stream?: Writable;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const stream: Writable = options.stream ?? process.stderr;

  function emit(payload: Record<string, unknown>): void {
    stream.write(JSON.stringify(payload) + "\n");
  }

  return {
    shutdown(event: ShutdownEvent): void {
      emit({
        event: "bridge.shutdown",
        ts: new Date().toISOString(),
        reason: event.reason,
        inFlightKilled: event.inFlightKilled,
        queuedDropped: event.queuedDropped,
      });
    },
    dispatchTimeout(event: DispatchTimeoutEvent): void {
      emit({
        event: "dispatch.timeout",
        ts: new Date().toISOString(),
        callId: event.callId,
        command: event.command,
        pid: event.pid,
        timeoutMs: event.timeoutMs,
        durationMs: event.durationMs,
      });
    },
    dispatchCap(event: DispatchCapEvent): void {
      emit({
        event: "dispatch.cap",
        ts: new Date().toISOString(),
        callId: event.callId,
        command: event.command,
        pid: event.pid,
        stream: event.stream,
        capturedBytes: event.capturedBytes,
        limitBytes: event.limitBytes,
      });
    },
    dispatchKill(event: DispatchKillEvent): void {
      emit({
        event: "dispatch.kill",
        ts: new Date().toISOString(),
        callId: event.callId,
        command: event.command,
        pid: event.pid,
        durationMs: event.durationMs,
      });
    },
    dispatchRetry(event: DispatchRetryEvent): void {
      emit({
        event: "dispatch.retry",
        ts: new Date().toISOString(),
        command: event.command,
        firstCallId: event.firstCallId,
        secondCallId: event.secondCallId,
      });
    },
    dispatchRecovery(event: DispatchRecoveryEvent): void {
      emit({
        event: "dispatch.recovery",
        ts: new Date().toISOString(),
        command: event.command,
        launched: event.launched,
        outcome: event.outcome,
        attempts: event.attempts,
        // Omit readyMs entirely unless present (only the "recovered" outcome carries it).
        ...(event.readyMs !== undefined ? { readyMs: event.readyMs } : {}),
      });
    },
    pathEscapeAttempt(event: PathEscapeAttemptEvent): void {
      emit({
        event: "pathEscapeAttempt",
        ts: new Date().toISOString(),
        vault: event.vault,
        attemptedPath: event.attemptedPath,
      });
    },
  };
}
