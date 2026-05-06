// Original — no upstream. Tests for the JSON-lines stderr logger covering shutdown + the three dispatch.* failure-lifecycle methods (FR-018a).
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
  logger.shutdown({ reason: "signal:SIGINT", inFlightKilled: false, queuedDropped: 0 });
  const lines = cap.lines();
  expect(lines.length).toBe(1);
  const parsed = JSON.parse(lines[0]!);
  expect(parsed.event).toBe("bridge.shutdown");
  expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
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

test("logger dispatchTimeout emits dispatch.timeout shape", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.dispatchTimeout({
    callId: "abc",
    command: "read",
    pid: 1234,
    timeoutMs: 10_000,
    durationMs: 10_400,
  });
  const lines = cap.lines();
  expect(lines.length).toBe(1);
  const parsed = JSON.parse(lines[0]!);
  expect(parsed.event).toBe("dispatch.timeout");
  expect(parsed.callId).toBe("abc");
  expect(parsed.command).toBe("read");
  expect(parsed.pid).toBe(1234);
  expect(parsed.timeoutMs).toBe(10_000);
  expect(parsed.durationMs).toBe(10_400);
  expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("logger dispatchCap emits dispatch.cap shape with stream + bytes", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.dispatchCap({
    callId: "id-cap",
    command: "eval",
    pid: 99,
    stream: "stdout",
    capturedBytes: 11_534_336,
    limitBytes: 10 * 1024 * 1024,
  });
  const parsed = JSON.parse(cap.lines()[0]!);
  expect(parsed.event).toBe("dispatch.cap");
  expect(parsed.callId).toBe("id-cap");
  expect(parsed.stream).toBe("stdout");
  expect(parsed.capturedBytes).toBe(11_534_336);
  expect(parsed.limitBytes).toBe(10 * 1024 * 1024);
});

test("logger dispatchKill emits dispatch.kill shape with PID + duration", () => {
  const cap = captureStream();
  const logger = createLogger({ stream: cap.stream });
  logger.dispatchKill({ callId: "id-kill", command: "read", pid: 777, durationMs: 1_500 });
  const parsed = JSON.parse(cap.lines()[0]!);
  expect(parsed.event).toBe("dispatch.kill");
  expect(parsed.callId).toBe("id-kill");
  expect(parsed.pid).toBe(777);
  expect(parsed.durationMs).toBe(1_500);
});

test("logger defaults to process.stderr when no stream injected (smoke)", () => {
  const logger = createLogger();
  expect(typeof logger.shutdown).toBe("function");
  expect(typeof logger.dispatchTimeout).toBe("function");
  expect(typeof logger.dispatchCap).toBe("function");
  expect(typeof logger.dispatchKill).toBe("function");
});
