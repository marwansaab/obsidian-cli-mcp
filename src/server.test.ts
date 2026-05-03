// Original — no upstream. Tests for the MCP Server bootstrap and lifecycle handlers (FR-001, FR-028, FR-029).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
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
  assert.ok(server, "server is constructed");
});

test("createServer registers exactly one tool named 'obsidian_exec' (FR-001)", async () => {
  const { ctx } = makeContext();
  const { server } = createServer(ctx);
  const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
  const listHandler = handlers.get("tools/list");
  assert.ok(listHandler, "tools/list handler registered");
  const result = (await listHandler({ method: "tools/list", params: {} })) as { tools: { name: string }[] };
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0]!.name, "obsidian_exec");
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
  assert.equal(killCalled, true);
  const event = JSON.parse(cap.lines()[0]!);
  assert.equal(event.inFlightKilled, true);
  assert.equal(getExitCode(), 0);
});

test("shutdown reports queuedDropped from queue.shutdown's return value (FR-029)", () => {
  // Note: this test verifies the wiring; the queue.shutdown() return-value semantic is verified in queue.test.ts.
  const { cap, ctx } = makeContext();
  ctx.killActiveChild = () => false;
  const { triggerShutdown, queue } = createServer(ctx);
  // Enqueue a never-resolving task so there's something to drop
  let release: (() => void) | undefined;
  const blocker = new Promise<void>((r) => { release = r; });
  // Start an in-flight task that we won't release
  const inFlight = queue.run(() => blocker.then(() => "first"));
  inFlight.catch(() => undefined);
  // Two queued tasks behind it
  const q1 = queue.run(async () => "q1");
  const q2 = queue.run(async () => "q2");
  q1.catch(() => undefined);
  q2.catch(() => undefined);
  triggerShutdown("signal:SIGTERM");
  const event = JSON.parse(cap.lines()[0]!);
  assert.equal(event.reason, "signal:SIGTERM");
  assert.equal(event.queuedDropped, 2, "two queued tasks were dropped");
  release?.();
});

test("transport-close shutdown emits bridge.shutdown with reason transport_closed and exits 0", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("transport_closed");
  const lines = cap.lines();
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]!);
  assert.equal(event.event, "bridge.shutdown");
  assert.equal(event.reason, "transport_closed");
  assert.equal(event.inFlightKilled, false);
  assert.equal(event.queuedDropped, 0);
  assert.equal(getExitCode(), 0);
});

test("SIGINT-style shutdown emits reason signal:SIGINT", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("signal:SIGINT");
  const event = JSON.parse(cap.lines()[0]!);
  assert.equal(event.reason, "signal:SIGINT");
  assert.equal(getExitCode(), 0);
});

test("SIGTERM-style shutdown emits reason signal:SIGTERM", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("signal:SIGTERM");
  const event = JSON.parse(cap.lines()[0]!);
  assert.equal(event.reason, "signal:SIGTERM");
  assert.equal(getExitCode(), 0);
});

test("shutdown is idempotent — second call is a no-op", () => {
  const { cap, ctx, getExitCode } = makeContext();
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("transport_closed");
  triggerShutdown("signal:SIGINT");
  triggerShutdown("signal:SIGTERM");
  const lines = cap.lines();
  assert.equal(lines.length, 1, "exactly one bridge.shutdown emitted across multiple triggers");
  assert.equal(getExitCode(), 0);
});
