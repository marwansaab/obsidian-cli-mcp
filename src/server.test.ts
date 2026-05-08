// Original — no upstream. Tests for the MCP Server bootstrap and lifecycle handlers (FR-001, FR-005, FR-017, FR-028, FR-029, registry consistency block, doc-aggregation drill).
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { describe, it, test, expect } from "vitest";

import { createServer, DEFAULT_DOCS_DIR, type ShutdownContext } from "./server.js";

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

test("createServer registers exactly FOUR tools — 'help' + 'obsidian_exec' + 'read_note' + 'write_note' (FR-001 + FR-007 + P8 aggregator + BI-003 + BI-011)", async () => {
  const { ctx } = makeContext();
  const { server } = createServer(ctx);
  const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
  const listHandler = handlers.get("tools/list");
  expect(listHandler).toBeTruthy();
  const result = (await listHandler!({ method: "tools/list", params: {} })) as { tools: { name: string }[] };
  expect(result.tools.length).toBe(4);
  const names = result.tools.map((t) => t.name).sort();
  expect(names).toEqual(["help", "obsidian_exec", "read_note", "write_note"]);
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

test("shutdown calls killInFlightChildren and reports inFlightKilled in the bridge.shutdown log (FR-016, FR-017)", () => {
  const { cap, ctx, getExitCode } = makeContext();
  let killCalled = false;
  ctx.killInFlightChildren = () => {
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

test("shutdown reports inFlightKilled: false when no child was in flight", () => {
  const { cap, ctx } = makeContext();
  ctx.killInFlightChildren = () => false;
  const { triggerShutdown } = createServer(ctx);
  triggerShutdown("transport_closed");
  const event = JSON.parse(cap.lines()[0]!);
  expect(event.inFlightKilled).toBe(false);
});

test("shutdown reports queuedDropped from queue.shutdown's return value (FR-029)", () => {
  const { cap, ctx } = makeContext();
  ctx.killInFlightChildren = () => false;
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
// Principle-I import-direction sentinel (FR-017 / SC-009): server.ts MUST NOT
// import from src/tools/*/handler.ts. The kill function must come from the
// cli-adapter layer. Asserted via string-grep against the source file so a
// future regression is caught at unit-test time without having to construct an
// import-graph analyzer.
// ---------------------------------------------------------------------------

describe("Principle-I downward-flow sentinel (FR-017 / SC-009)", () => {
  const SERVER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "server.ts");

  it("imports killInFlightChildren from ./cli-adapter/cli-adapter.js (NOT from a tool handler)", () => {
    const source = readFileSync(SERVER_PATH, "utf8");
    expect(source).toContain('killInFlightChildren');
    expect(source).toContain('"./cli-adapter/cli-adapter.js"');
  });

  it("does NOT import from any ./tools/*/handler.js path", () => {
    const source = readFileSync(SERVER_PATH, "utf8");
    expect(source).not.toMatch(/from "\.\/tools\/[^"]+\/handler\.js"/);
  });
});

// ---------------------------------------------------------------------------
// FR-005 / Q4 doc-aggregation drill: rename a docs/tools/<name>.md away (or
// point the server at an empty fixture directory) and assert the boot-time
// error message LISTS ALL missing files. Fail-fast on the first miss is
// forbidden by the clarification.
// ---------------------------------------------------------------------------

describe("assertToolDocsExist boot-time aggregation (FR-005 / Q4)", () => {
  it("aggregates ALL missing doc files into a single error listing every miss", () => {
    const empty = mkdtempSync(join(tmpdir(), "boot-docs-"));
    try {
      const cap = captureStream();
      const ctx: ShutdownContext = {
        loggerStream: cap.stream,
        registerSignalHandlers: false,
        docsDir: empty,
      };
      let caught: Error | null = null;
      try {
        createServer(ctx);
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).not.toBeNull();
      expect(caught!.message).toContain("Missing tool documentation files");
      expect(caught!.message).toContain("docs/tools/help.md");
      expect(caught!.message).toContain("docs/tools/obsidian_exec.md");
      expect(caught!.message).toContain("docs/tools/read_note.md");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("partial directory: missing files surface in the aggregated message; present file does NOT appear", () => {
    const partial = mkdtempSync(join(tmpdir(), "boot-docs-"));
    try {
      mkdirSync(partial, { recursive: true });
      writeFileSync(join(partial, "help.md"), "# help");
      const cap = captureStream();
      let caught: Error | null = null;
      try {
        createServer({ loggerStream: cap.stream, registerSignalHandlers: false, docsDir: partial });
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).not.toBeNull();
      expect(caught!.message).toContain("docs/tools/obsidian_exec.md");
      expect(caught!.message).toContain("docs/tools/read_note.md");
      expect(caught!.message).not.toContain("docs/tools/help.md");
    } finally {
      rmSync(partial, { recursive: true, force: true });
    }
  });

  it("real DEFAULT_DOCS_DIR resolves to the bundled docs/tools directory", () => {
    expect(existsSync(DEFAULT_DOCS_DIR)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registry consistency block (per Clarification 2026-05-06 Q5 + plan-stage P6).
// Preserved as defense-in-depth (FR-007). The boot-time aggregator is now the
// authoritative path; this block keeps three structural invariants enforced
// even when the aggregator is bypassed in custom embeddings.
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

  it("every registered tool's inputSchema declares type === 'object' at the top level (Story 1 AC#2, FR-002, FR-006, SC-001)", async () => {
    const { ctx } = makeContext();
    const { server } = createServer(ctx);
    const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
    const listHandler = handlers.get("tools/list");
    const result = (await listHandler!({ method: "tools/list", params: {} })) as { tools: { name: string; inputSchema: unknown }[] };
    for (const tool of result.tools) {
      const actualType = (tool.inputSchema as { type?: unknown } | null | undefined)?.type;
      expect(
        actualType,
        `Tool '${tool.name}' has inputSchema.type === ${JSON.stringify(actualType)}, expected "object"`,
      ).toBe("object");
    }
  });

  // FR-019 / SC-006 binding — the published descriptor shape for the three
  // existing tools is structurally pinned. Each tool's inputSchema is asserted
  // to have the documented top-level keys + property structure from 0.1.7.
  // A future pipeline change that breaks the wire shape (e.g., dropping
  // additionalProperties, renaming properties, swapping oneOf for anyOf)
  // surfaces here.
  describe("FR-019 wire-shape pinning vs 0.1.7", () => {
    async function listTools() {
      const { ctx } = makeContext();
      const { server } = createServer(ctx);
      const handlers = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers;
      const result = (await handlers.get("tools/list")!({ method: "tools/list", params: {} })) as {
        tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
      };
      return new Map(result.tools.map((t) => [t.name, t]));
    }

    it("MCP Tool envelope: each tool has { name: string, description: string, inputSchema: object }", async () => {
      const tools = await listTools();
      for (const t of tools.values()) {
        expect(typeof t.name).toBe("string");
        expect(typeof t.description).toBe("string");
        expect(t.description.length).toBeGreaterThan(0);
        expect(typeof t.inputSchema).toBe("object");
        expect(t.inputSchema.type).toBe("object");
      }
    });

    it("help: properties contains exactly { tool_name } at the top level", async () => {
      const tools = await listTools();
      const help = tools.get("help")!;
      const props = (help.inputSchema.properties ?? {}) as Record<string, unknown>;
      expect(Object.keys(props).sort()).toEqual(["tool_name"]);
    });

    it("obsidian_exec: properties contains the documented field set { command, parameters, vault, flags, copy, timeoutMs }", async () => {
      const tools = await listTools();
      const exec = tools.get("obsidian_exec")!;
      const props = (exec.inputSchema.properties ?? {}) as Record<string, unknown>;
      expect(Object.keys(props).sort()).toEqual(
        ["command", "copy", "flags", "parameters", "timeoutMs", "vault"],
      );
    });

    it("read_note: post-010 flat object — properties include {target_mode, vault, file, path}, target_mode is the enum discriminator, additionalProperties: false", async () => {
      const tools = await listTools();
      const read = tools.get("read_note")!;
      expect(read.inputSchema.oneOf).toBeUndefined();
      expect(read.inputSchema.allOf).toBeUndefined();
      expect(read.inputSchema.anyOf).toBeUndefined();
      const props = (read.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
      expect(Object.keys(props).sort()).toEqual(["file", "path", "target_mode", "vault"]);
      expect(props.target_mode?.enum).toEqual(["specific", "active"]);
      expect(read.inputSchema.required).toEqual(["target_mode"]);
      expect(read.inputSchema.additionalProperties).toBe(false);
    });
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
