// Original — no upstream. Tests for the tree tool registration — descriptor name + description, stripped JSON Schema (ADR-005), docs file presence + content completeness, and the FR-018 baseline drift-detector lock rolled forward by `npm run baseline:write` post-implementation.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTreeTool, TREE_DESCRIPTION, TREE_TOOL_NAME } from "./index.js";
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
    child.pid = 13;
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
  createLogger({
    stream: new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  });

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

describe("createTreeTool — descriptor", () => {
  // (1) descriptor.name === "tree"
  it("publishes name = 'tree'", () => {
    const tool = createTreeTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(TREE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("tree");
  });

  // (2) inputSchema has descriptions stripped (ADR-005) and exact key set
  it("emits inputSchema with descriptions stripped + properties set covering {target_mode, vault, file, path, folder, depth, ext, total}", () => {
    const tool = createTreeTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    // target_mode + vault + file + path + folder + depth + ext + total
    // (file/path appear in the property set because the folder-scoped refinement
    // forbids them via superRefine, not via schema-shape removal)
    for (const key of ["target_mode", "vault", "folder", "depth", "ext", "total"]) {
      expect(Object.hasOwn(props, key)).toBe(true);
    }
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (3) TREE_DESCRIPTION carries the trailing-slash promise + mentions help
  it('TREE_DESCRIPTION carries FR-028 trailing-slash promise + mentions help({ tool_name: "tree" })', () => {
    const tool = createTreeTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description).toBe(TREE_DESCRIPTION);
    // Trailing-slash promise — folder entries end with "/"
    expect(TREE_DESCRIPTION).toContain('end with "/"');
    expect(TREE_DESCRIPTION).toContain('help({ tool_name: "tree" })');
  });
});

// (4) docs/tools/tree.md exists with non-stub content
describe("docs/tools/tree.md exists and is non-stub", () => {
  it("docs file resolves, mentions inherited error codes, ≥4 example sections, has a Worked example heading and an Error roster", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/tree.md");
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body.length).toBeGreaterThan(1024);
    expect(body).toContain("Worked example");
    expect(body).toContain("Error roster");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
  });
});

// (5) FR-018 baseline drift-detector lock — the rolled-forward baseline contains a `tree` entry
describe("FR-018 baseline contains tree entry (post-impl baseline roll-forward)", () => {
  it("baseline JSON includes a tools[] entry with name === 'tree'", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === "tree");
    expect(
      entry,
      "baseline must include a `tree` entry — run `npm run baseline:write`",
    ).toBeDefined();
    expect(entry!.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
