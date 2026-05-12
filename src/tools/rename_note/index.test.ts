// Original — no upstream. Tests for the rename_note tool registration — descriptor shape, stripped schema, help mention + link-rewriting caveat, docs presence + non-stub, thin-handler logger drift lock (FR-009 / R1).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRenameNoteTool, RENAME_NOTE_DESCRIPTION, RENAME_NOTE_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

function makeStubSpawn(opts: { stdout?: string; exitCode?: number } = {}): SpawnLike {
  return (binary, _argv, _options: SpawnOptions) => {
    void binary;
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7;
    child.kill = () => true;
    setImmediate(() => {
      if (opts.stdout) child.stdout.push(Buffer.from(opts.stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}

const silentLogger = () =>
  createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

function walkSchema(node: unknown, fn: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkSchema(item, fn);
    return;
  }
  fn(node as Record<string, unknown>);
  for (const value of Object.values(node as Record<string, unknown>)) walkSchema(value, fn);
}

describe("createRenameNoteTool — descriptor", () => {
  // (a) Story 8 AC#1 — descriptor name
  it("publishes name = 'rename_note' and description verbatim", () => {
    const tool = createRenameNoteTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(RENAME_NOTE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("rename_note");
    expect(tool.descriptor.description).toBe(RENAME_NOTE_DESCRIPTION);
  });

  // (b) Story 8 AC#2 — emitted inputSchema shape: flat, additionalProperties:false, no description keys
  it("emits a flat inputSchema with all 5 properties, additionalProperties:false, no description keys (Story 8 AC#2)", () => {
    const tool = createRenameNoteTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.oneOf).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["file", "name", "path", "target_mode", "vault"]);
    expect(schema.required).toEqual(expect.arrayContaining(["target_mode"]));
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (c) Story 8 AC#3 — description references help, the tool's own name, AND surfaces the link-rewriting caveat
  it("description references help(), 'rename_note', AND surfaces the link-rewriting caveat (Story 8 AC#3, FR-012)", () => {
    const tool = createRenameNoteTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("rename_note");
    expect(desc).toMatch(/Automatically update internal links|link/i);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("createRenameNoteTool — handler integration via registerTool", () => {
  // (d) VALIDATION_ERROR end-to-end propagation (registerTool ZodError wrap)
  it("malformed input (empty name) surfaces as VALIDATION_ERROR isError envelope", async () => {
    const tool = createRenameNoteTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const result = (await tool.handler({
      target_mode: "specific",
      vault: "V",
      path: "P.md",
      name: "",
    })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("rename_note");
  });
});

describe("docs/tools/rename_note.md exists and is non-stub (FR-014)", () => {
  // (e) Story 8 AC#4 / FR-014 — doc presence + content
  it("docs file resolves via import.meta.url, has no TODO/stub marker, contains 5 error codes + ≥4 examples + Scope section + link-rewriting caveat", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/rename_note.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    expect(body).not.toContain("<!-- stub");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
      "ERR_NO_ACTIVE_FILE",
    ]) {
      expect(body).toContain(code);
    }
    // ≥4 code-fenced example blocks (``` opening fences)
    const fenceCount = (body.match(/```/g) ?? []).length;
    expect(fenceCount).toBeGreaterThanOrEqual(8); // 4 examples × 2 fences each
    // Scope section heading
    expect(body).toMatch(/##\s+Scope/i);
    // Link-rewriting caveat
    expect(body).toMatch(/Automatically update internal links/);
    // move_note recovery hint surfaced
    expect(body).toContain("move_note");
  });
});

describe("handler.ts thin-handler logger drift lock (FR-009 / R1)", () => {
  // (f) FR-009 structural lock: handler must not introduce per-call logger events
  it("handler.ts emits zero per-call logger events; deps.logger flows only into invokeCli", () => {
    const handlerPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "./handler.ts",
    );
    const source = readFileSync(handlerPath, "utf8");
    // Zero logger event invocations at the handler layer
    expect(source).not.toMatch(/logger\.(callStart|callEndSuccess|callEndFailure|callEnd)\b/);
    // deps.logger is forwarded to invokeCli; should appear exactly once as `logger: deps.logger`
    const matches = source.match(/logger:\s*deps\.logger/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
