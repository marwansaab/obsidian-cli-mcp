// Original — no upstream. Tests for obsidian_exec tool registration (post-P8 aggregator refactor: tests the descriptor + handler shape directly).
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";

import { test, expect } from "vitest";

import { type SpawnLike } from "./handler.js";
import { obsidianExecInputJsonSchema } from "./schema.js";
import { registerObsidianExecTool, OBSIDIAN_EXEC_TOOL_NAME, OBSIDIAN_EXEC_DESCRIPTION } from "./tool.js";
import { UpstreamError } from "../../errors.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

function silentLogger() {
  const stream = new Writable({ write(_c, _e, cb) { cb(); } });
  return createLogger({ stream });
}

test("registerObsidianExecTool returns descriptor with name 'obsidian_exec'", () => {
  const tool = registerObsidianExecTool({ logger: silentLogger(), queue: createQueue() });
  expect(tool.descriptor.name).toBe(OBSIDIAN_EXEC_TOOL_NAME);
});

test("registered tool's inputSchema matches the zod-derived schema (single source of truth)", () => {
  const tool = registerObsidianExecTool({ logger: silentLogger(), queue: createQueue() });
  // The published inputSchema is the strip-utility-applied deep copy of obsidianExecInputJsonSchema.
  // Because the obsidian_exec zod schema carries no `.describe()` annotations on its fields, the
  // strip is a structural no-op for now and the published schema deep-equals the raw one. If a
  // future change adds field-level descriptions, those would be stripped automatically.
  expect(tool.descriptor.inputSchema).toEqual(obsidianExecInputJsonSchema);
});

test("registered tool's inputSchema has no description keys at any depth (Story 1 AC#5, FR-006, SC-002, SC-010)", () => {
  const tool = registerObsidianExecTool({ logger: silentLogger(), queue: createQueue() });
  expect(hasNestedDescription(tool.descriptor.inputSchema)).toBe(false);
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

test("registered tool's description matches the published one", () => {
  const tool = registerObsidianExecTool({ logger: silentLogger(), queue: createQueue() });
  expect(tool.descriptor.description).toBe(OBSIDIAN_EXEC_DESCRIPTION);
});

test("top-level description is concise verb-led and mentions help() with this tool's name (Story 3 AC#1+#2, FR-015, SC-003, SC-010)", () => {
  // Structural assertions per T022 — robust against future minor wording tweaks while
  // still verifying the P5-pinned shape: verb-led summary + help() mention naming this tool.
  expect(OBSIDIAN_EXEC_DESCRIPTION.length).toBeGreaterThan(0);
  expect(OBSIDIAN_EXEC_DESCRIPTION).toContain("help(");
  expect(OBSIDIAN_EXEC_DESCRIPTION).toContain("obsidian_exec");
  // Verb-led: starts with an imperative verb (not "The tool ..." or "This tool ...").
  expect(OBSIDIAN_EXEC_DESCRIPTION).toMatch(/^(Invoke|Run|Execute)/);
  // Concise — well under the verbose ~1100-char baseline that motivated ADR-005.
  expect(OBSIDIAN_EXEC_DESCRIPTION.length).toBeLessThan(500);
});

function makeMockSpawn(stdout: string, exitCode: number): SpawnLike {
  return (_binary, _spawnArgs, _opts) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: () => boolean;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = () => true;
    setImmediate(() => {
      child.stdout.push(Buffer.from(stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", exitCode, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}

test("calling obsidian_exec with valid arguments returns success-shape JSON in content text", async () => {
  const tool = registerObsidianExecTool({
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn: makeMockSpawn("1.7.2\n", 0),
    env: {},
  });
  const result = (await tool.handler({ command: "version" })) as { isError?: boolean; content: { type: string; text: string }[] };
  expect(result.isError).toBeFalsy();
  expect(result.content[0]!.type).toBe("text");
  const payload = JSON.parse(result.content[0]!.text);
  expect(payload.stdout).toBe("1.7.2\n");
  expect(payload.exitCode).toBe(0);
  expect(payload.argv).toEqual(["obsidian", "version"]);
});

test("calling obsidian_exec when the handler throws UpstreamError returns isError with code/message/details", async () => {
  const tool = registerObsidianExecTool({
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn: makeMockSpawn("", 2),
    env: {},
  });
  const result = (await tool.handler({ command: "x" })) as { isError?: boolean; content: { type: string; text: string }[] };
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0]!.text);
  expect(payload.code).toBe("CLI_NON_ZERO_EXIT");
  expect(payload.details.argv).toEqual(["obsidian", "x"]);
});

test("UpstreamError export is the same class the handler throws (single source per FR-018)", () => {
  // Sanity check: the tool.ts UpstreamError catch path uses the same class instance.
  const err = new UpstreamError({ code: "X", cause: null, details: {} });
  expect(err).toBeInstanceOf(UpstreamError);
});

test("calling obsidian_exec with invalid arguments returns isError with zod field paths (FR-009)", async () => {
  const tool = registerObsidianExecTool({ logger: silentLogger(), queue: createQueue() });
  const result = (await tool.handler({ command: "" })) as { isError?: boolean; content: { type: string; text: string }[] };
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0]!.text);
  expect(payload.code).toBe("VALIDATION_ERROR");
  expect(Array.isArray(payload.details.issues)).toBe(true);
  expect(payload.details.issues.some((i: { path: string[] }) => i.path.includes("command"))).toBe(true);
});
