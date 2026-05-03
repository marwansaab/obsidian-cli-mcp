// Original — no upstream. Tests for the MCP Server bootstrap and lifecycle handlers (FR-001, FR-028, FR-029).
import { Writable } from "node:stream";

import { test, expect } from "vitest";

import { createServer, type ShutdownContext } from "./server.js";

function captureStream(): { stream: Writable; lines: () => string[] } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  return { stream, lines: () => Buffer.concat(chunks).toString("utf8").split("\n").filter((l) => l.length > 0) };
}

function makeContext() {
  const cap = captureStream();
  let exitCode: number | undefined;
  const ctx: ShutdownContext = {
    loggerStream: cap.stream,
    exit: (code: number) => {
      exitCode = code;
    },
    registerSignalHandlers: false,
  };
  return { cap, ctx, getExitCode: () => exitCode };
}

test("createServer constructs MCP Server with name and version metadata", () => {
  const { ctx } = makeContext();
  const { server } = createServer(ctx);
  expect(server).toBeTruthy();
});

test("createServer registers exactly one tool named 'obsidian_exec' (FR-001)", async () => {
  const { ctx } = makeContext();
  const { server } = createServer(ctx);
  const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
  const listHandler = handlers.get("tools/list");
  expect(listHandler).toBeTruthy();
  const result = (await listHandler!({ method: "tools/list", params: {} })) as { tools: { name: string }[] };
  expect(result.tools.length).toBe(1);
  expect(result.tools[0]!.name).toBe("obsidian_exec");
});

test("transport-close shutdown emits bridge.shutdown with reason transport_closed and exits 0", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("transport_closed");
  const lines = cap.lines();
  expect(lines.length).toBe(1);
  const event = JSON.parse(lines[0]!);
  expect(event.event).toBe("bridge.shutdown");
  expect(event.reason).toBe("transport_closed");
  expect(event.inFlightKilled).toBe(false);
  expect(event.queuedDropped).toBe(0);
  expect(getExitCode()).toBe(0);
});

test("SIGINT-style shutdown emits reason signal:SIGINT", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("signal:SIGINT");
  const event = JSON.parse(cap.lines()[0]!);
  expect(event.reason).toBe("signal:SIGINT");
  expect(getExitCode()).toBe(0);
});

test("SIGTERM-style shutdown emits reason signal:SIGTERM", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("signal:SIGTERM");
  const event = JSON.parse(cap.lines()[0]!);
  expect(event.reason).toBe("signal:SIGTERM");
  expect(getExitCode()).toBe(0);
});

test("shutdown is idempotent — second call is a no-op", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("transport_closed");
  triggerShutdown("signal:SIGINT");
  triggerShutdown("signal:SIGTERM");
  const lines = cap.lines();
  expect(lines.length).toBe(1);
  expect(getExitCode()).toBe(0);
});

test("shutdown calls killActiveChild and reports inFlightKilled in the bridge.shutdown log", () => {
  const { cap, ctx, getExitCode } = makeContext();
  let killCalled = false;
  ctx.killActiveChild = () => {
    killCalled = true;
    return true;
  };
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("transport_closed");
  expect(killCalled).toBe(true);
  const event = JSON.parse(cap.lines()[0]!);
  expect(event.inFlightKilled).toBe(true);
  expect(getExitCode()).toBe(0);
});

test("shutdown reports queuedDropped from queue.shutdown's return value (FR-029)", () => {
  const { cap, ctx } = makeContext();
  ctx.killActiveChild = () => false;
  const { triggerShutdown, queue } = createServer(ctx);
  let release: (() => void) | undefined;
  const blocker = new Promise<void>((r) => { release = r; });
  const inFlight = queue.run(() => blocker.then(() => "first"));
  inFlight.catch(() => undefined);
  const q1 = queue.run(async () => "q1");
  const q2 = queue.run(async () => "q2");
  q1.catch(() => undefined);
  q2.catch(() => undefined);
  triggerShutdown("signal:SIGTERM");
  const event = JSON.parse(cap.lines()[0]!);
  expect(event.reason).toBe("signal:SIGTERM");
  expect(event.queuedDropped).toBe(2);
  release?.();
});
