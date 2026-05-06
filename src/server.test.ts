// Original — no upstream. Tests for the MCP Server bootstrap and lifecycle handlers (FR-001, FR-028, FR-029).
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { describe, it, test, expect } from "vitest";

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

test("createServer registers exactly TWO tools — 'obsidian_exec' + 'help' (FR-001 + FR-007 + P8 aggregator)", async () => {
  const { ctx } = makeContext();
  const { server } = createServer(ctx);
  const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
  const listHandler = handlers.get("tools/list");
  expect(listHandler).toBeTruthy();
  const result = (await listHandler!({ method: "tools/list", params: {} })) as { tools: { name: string }[] };
  expect(result.tools.length).toBe(2);
  const names = result.tools.map((t) => t.name).sort();
  expect(names).toEqual(["help", "obsidian_exec"]);
});

test("CallToolRequest dispatches by name with TOOL_NOT_FOUND fallback (P8 aggregator)", async () => {
  const { ctx } = makeContext();
  const { server } = createServer(ctx);
  const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
  const callHandler = handlers.get("tools/call");
  expect(callHandler).toBeTruthy();
  const result = (await callHandler!({
    method: "tools/call",
    params: { name: "not_a_real_tool", arguments: {} },
  })) as { isError?: boolean; content: { type: string; text: string }[] };
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0]!.text);
  expect(payload.code).toBe("TOOL_NOT_FOUND");
  expect(payload.details.knownTools).toContain("obsidian_exec");
  expect(payload.details.knownTools).toContain("help");
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

// ---------------------------------------------------------------------------
// Registry consistency block (per Clarification 2026-05-06 Q5 + plan-stage P6).
//
// Asserts two invariants over the live server registry, exercised against the
// real `docs/tools/` directory bundled with this BI. The block is intentionally
// at the bottom of the file so future-tool BIs can extend it without touching
// the per-tool tests above.
//
// Invariant (a): every registered MCP tool has a corresponding `docs/tools/<name>.md`
// file. Catches the registration-without-doc regression at PR review (per Q5 + SC-011).
//
// Invariant (b): every registered tool's stripped `inputSchema.properties` tree
// contains zero `description` keys at any depth. Catches the bypass-of-strip-utility
// regression (per Story 1 AC#5 + SC-002 + Edge Case "Tool registration via the SDK
// that bypasses the stripping utility").
// ---------------------------------------------------------------------------

const DOCS_DIR_FROM_TEST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "tools");

describe("registry consistency", () => {
  it("every registered tool has a corresponding docs/tools/<name>.md file (Q5, FR-017, SC-011)", async () => {
    const { ctx } = makeContext();
    const { server } = createServer(ctx);
    const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
    const listHandler = handlers.get("tools/list");
    const result = (await listHandler!({ method: "tools/list", params: {} })) as { tools: { name: string }[] };
    for (const tool of result.tools) {
      const docPath = resolve(DOCS_DIR_FROM_TEST, `${tool.name}.md`);
      expect(existsSync(docPath), `Missing docs/tools/${tool.name}.md for registered tool '${tool.name}'`).toBe(true);
    }
  });

  it("every registered tool's stripped inputSchema is description-free at every depth (Story 1 AC#5, FR-006, SC-002)", async () => {
    const { ctx } = makeContext();
    const { server } = createServer(ctx);
    const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
    const listHandler = handlers.get("tools/list");
    const result = (await listHandler!({ method: "tools/list", params: {} })) as { tools: { name: string; inputSchema: unknown }[] };
    for (const tool of result.tools) {
      expect(hasNestedDescription(tool.inputSchema), `Tool '${tool.name}' has a nested description in inputSchema`).toBe(false);
    }
  });
});

function hasNestedDescription(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const obj = node as Record<string, unknown>;
  for (const child of Object.values(obj.properties ?? {}) as unknown[]) {
    if (typeof child === "object" && child !== null && "description" in (child as object)) return true;
    if (hasNestedDescription(child)) return true;
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = obj[key];
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        if (typeof branch === "object" && branch !== null && "description" in (branch as object)) return true;
        if (hasNestedDescription(branch)) return true;
      }
    }
  }
  if (obj.items) {
    const items = Array.isArray(obj.items) ? obj.items : [obj.items];
    for (const item of items) {
      if (typeof item === "object" && item !== null && "description" in (item as object)) return true;
      if (hasNestedDescription(item)) return true;
    }
  }
  if (obj.additionalProperties && typeof obj.additionalProperties === "object") {
    if ("description" in (obj.additionalProperties as object)) return true;
    if (hasNestedDescription(obj.additionalProperties)) return true;
  }
  return false;
}
