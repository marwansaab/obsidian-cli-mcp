// Original — no upstream. JSON-lines stderr logger for call lifecycle events (FR-024, FR-025, FR-026).
import type { Writable } from "node:stream";

export type ErrorCode =
  | "CLI_NON_ZERO_EXIT"
  | "CLI_BINARY_NOT_FOUND"
  | "CLI_TIMEOUT"
  | "CLI_OUTPUT_TOO_LARGE"
  | "CLI_REPORTED_ERROR"
  | "ERR_NO_ACTIVE_FILE";
export type ShutdownReason = "transport_closed" | "signal:SIGINT" | "signal:SIGTERM";

export interface CallStartEvent {
  callId: string;
  command: string;
  vault: string | null;
  argv?: string[];
  queueDepth: number;
  locator?: "file" | "path" | "active";
}

export interface CallEndSuccessEvent {
  callId: string;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes?: number;
}

export interface CallEndFailureEvent {
  callId: string;
  errorCode: ErrorCode;
  durationMs: number;
  exitCode?: number;
  signal?: string | null;
}

export interface ShutdownEvent {
  reason: ShutdownReason;
  inFlightKilled: boolean;
  queuedDropped: number;
}

export interface Logger {
  callStart(event: CallStartEvent): void;
  callEndSuccess(event: CallEndSuccessEvent): void;
  callEndFailure(event: CallEndFailureEvent): void;
  shutdown(event: ShutdownEvent): void;
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
    callStart(event: CallStartEvent): void {
      const payload: Record<string, unknown> = {
        event: "call.start",
        ts: new Date().toISOString(),
        callId: event.callId,
        command: event.command,
        vault: event.vault,
        queueDepth: event.queueDepth,
      };
      if (event.argv !== undefined) payload.argv = event.argv;
      if (event.locator !== undefined) payload.locator = event.locator;
      emit(payload);
    },
    callEndSuccess(event: CallEndSuccessEvent): void {
      const payload: Record<string, unknown> = {
        event: "call.end",
        ts: new Date().toISOString(),
        callId: event.callId,
        exitCode: 0,
        durationMs: event.durationMs,
        stdoutBytes: event.stdoutBytes,
      };
      if (event.stderrBytes !== undefined) payload.stderrBytes = event.stderrBytes;
      emit(payload);
    },
    callEndFailure(event: CallEndFailureEvent): void {
      const payload: Record<string, unknown> = {
        event: "call.end",
        ts: new Date().toISOString(),
        callId: event.callId,
        errorCode: event.errorCode,
        durationMs: event.durationMs,
      };
      if (event.exitCode !== undefined) payload.exitCode = event.exitCode;
      if (event.signal !== undefined) payload.signal = event.signal;
      emit(payload);
    },
    shutdown(event: ShutdownEvent): void {
      emit({
        event: "bridge.shutdown",
        ts: new Date().toISOString(),
        reason: event.reason,
        inFlightKilled: event.inFlightKilled,
        queuedDropped: event.queuedDropped,
      });
    },
  };
}
