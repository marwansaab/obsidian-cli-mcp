// Original — no upstream. Tests for the JSON-lines stderr logger (FR-024, FR-025, FR-026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
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
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]!);
  assert.equal(parsed.event, "call.start");
  assert.equal(parsed.callId, "id1");
  assert.equal(parsed.command, "version");
  assert.equal(parsed.vault, null);
  assert.deepEqual(parsed.argv, ["obsidian", "version"]);
  assert.equal(parsed.queueDepth, 0);
  assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("logger callEndSuccess emits success shape", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.callEndSuccess({ callId: "id2", durationMs: 412, stdoutBytes: 100, stderrBytes: 0 });
  const parsed = JSON.parse(cap.lines()[0]!);
  assert.equal(parsed.event, "call.end");
  assert.equal(parsed.exitCode, 0);
  assert.equal(parsed.durationMs, 412);
  assert.equal(parsed.stdoutBytes, 100);
  assert.equal(parsed.stderrBytes, 0);
});

test("logger callEndFailure emits failure shape with errorCode", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.callEndFailure({ callId: "id3", errorCode: "CLI_NON_ZERO_EXIT", durationMs: 50, exitCode: 2, signal: null });
  const parsed = JSON.parse(cap.lines()[0]!);
  assert.equal(parsed.event, "call.end");
  assert.equal(parsed.errorCode, "CLI_NON_ZERO_EXIT");
  assert.equal(parsed.durationMs, 50);
  assert.equal(parsed.exitCode, 2);
  assert.equal(parsed.signal, null);
  assert.equal(parsed.stdoutBytes, undefined, "no stdoutBytes on failure");
});

test("logger shutdown emits bridge.shutdown shape with discriminator reason", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.shutdown({ reason: "signal:SIGINT", inFlightKilled: true, queuedDropped: 2 });
  const parsed = JSON.parse(cap.lines()[0]!);
  assert.equal(parsed.event, "bridge.shutdown");
  assert.equal(parsed.reason, "signal:SIGINT");
  assert.equal(parsed.inFlightKilled, true);
  assert.equal(parsed.queuedDropped, 2);
});

test("logger callId correlates start and end lines", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.callStart({ callId: "abc", command: "v", vault: null, argv: ["obsidian", "v"], queueDepth: 0 });
  logger.callEndSuccess({ callId: "abc", durationMs: 1, stdoutBytes: 0, stderrBytes: 0 });
  const lines = cap.lines();
  assert.equal(lines.length, 2);
  const start = JSON.parse(lines[0]!);
  const end = JSON.parse(lines[1]!);
  assert.equal(start.callId, end.callId);
});

test("logger defaults to process.stderr when no stream injected (smoke)", () => {
  const logger = createLogger();
  assert.equal(typeof logger.callStart, "function");
  assert.equal(typeof logger.callEndSuccess, "function");
  assert.equal(typeof logger.callEndFailure, "function");
  assert.equal(typeof logger.shutdown, "function");
});
