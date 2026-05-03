// Original — no upstream. Tests for the JSON-lines stderr logger (FR-024, FR-025, FR-026).
import { Writable } from "node:stream";

import { test, expect } from "vitest";

import { createLogger } from "./logger.js";

function captureStream(): { stream: Writable; lines: () => string[] } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  return {
    stream,
    lines: () => Buffer.concat(chunks).toString("utf8").split("\n").filter((l) => l.length > 0),
  };
}

test("logger writes one JSON object per line, terminated with \\n", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.callStart({ callId: "id1", command: "version", vault: null, argv: ["obsidian", "version"], queueDepth: 0 });
  const lines = cap.lines();
  expect(lines.length).toBe(1);
  const parsed = JSON.parse(lines[0]!);
  expect(parsed.event).toBe("call.start");
  expect(parsed.callId).toBe("id1");
  expect(parsed.command).toBe("version");
  expect(parsed.vault).toBeNull();
  expect(parsed.argv).toEqual(["obsidian", "version"]);
  expect(parsed.queueDepth).toBe(0);
  expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("logger callEndSuccess emits success shape", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.callEndSuccess({ callId: "id2", durationMs: 412, stdoutBytes: 100, stderrBytes: 0 });
  const parsed = JSON.parse(cap.lines()[0]!);
  expect(parsed.event).toBe("call.end");
  expect(parsed.exitCode).toBe(0);
  expect(parsed.durationMs).toBe(412);
  expect(parsed.stdoutBytes).toBe(100);
  expect(parsed.stderrBytes).toBe(0);
});

test("logger callEndFailure emits failure shape with errorCode", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.callEndFailure({ callId: "id3", errorCode: "CLI_NON_ZERO_EXIT", durationMs: 50, exitCode: 2, signal: null });
  const parsed = JSON.parse(cap.lines()[0]!);
  expect(parsed.event).toBe("call.end");
  expect(parsed.errorCode).toBe("CLI_NON_ZERO_EXIT");
  expect(parsed.durationMs).toBe(50);
  expect(parsed.exitCode).toBe(2);
  expect(parsed.signal).toBeNull();
  expect(parsed.stdoutBytes).toBeUndefined();
});

test("logger shutdown emits bridge.shutdown shape with discriminator reason", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.shutdown({ reason: "signal:SIGINT", inFlightKilled: true, queuedDropped: 2 });
  const parsed = JSON.parse(cap.lines()[0]!);
  expect(parsed.event).toBe("bridge.shutdown");
  expect(parsed.reason).toBe("signal:SIGINT");
  expect(parsed.inFlightKilled).toBe(true);
  expect(parsed.queuedDropped).toBe(2);
});

test("logger callId correlates start and end lines", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.callStart({ callId: "abc", command: "v", vault: null, argv: ["obsidian", "v"], queueDepth: 0 });
  logger.callEndSuccess({ callId: "abc", durationMs: 1, stdoutBytes: 0, stderrBytes: 0 });
  const lines = cap.lines();
  expect(lines.length).toBe(2);
  const start = JSON.parse(lines[0]!);
  const end = JSON.parse(lines[1]!);
  expect(start.callId).toBe(end.callId);
});

test("logger defaults to process.stderr when no stream injected (smoke)", () => {
  const logger = createLogger();
  expect(typeof logger.callStart).toBe("function");
  expect(typeof logger.callEndSuccess).toBe("function");
  expect(typeof logger.callEndFailure).toBe("function");
  expect(typeof logger.shutdown).toBe("function");
});
