// Original — no upstream. Tests for the files tool registration — descriptor name + description, stripped JSON Schema (ADR-005), help-facility index reference, docs file presence + content completeness.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFilesTool, FILES_DESCRIPTION, FILES_TOOL_NAME } from "./index.js";
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
    child.pid = 11;
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

const silentLogger = () => createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });

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

describe("createFilesTool — descriptor", () => {
  // (1) descriptor name = "files"
  it("publishes name = 'files'", () => {
    const tool = createFilesTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(FILES_TOOL_NAME);
    expect(tool.descriptor.name).toBe("files");
  });

  // (2) description mentions target_mode, folder, total, and "help"
  it("description references target_mode, folder, total, files, and help", () => {
    const tool = createFilesTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.description).toBe(FILES_DESCRIPTION);
    const lower = FILES_DESCRIPTION.toLowerCase();
    expect(lower).toContain("target_mode");
    expect(lower).toContain("folder");
    expect(lower).toContain("total");
    expect(lower).toContain("files");
    expect(lower).toContain("help");
  });

  // (3) emitted inputSchema is the post-010 flat shape, descriptions stripped per ADR-005
  it("emits flat inputSchema with 7 properties (target_mode/vault/file/path/folder/ext/total), required: [target_mode], additionalProperties:false, no description keys", () => {
    const tool = createFilesTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(
      ["ext", "file", "folder", "path", "target_mode", "total", "vault"],
    );
    const required = schema.required as string[];
    expect(required).toEqual(["target_mode"]);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });
});

// (4) help facility references files — the help tool reads from the docs index
describe("help facility references files (registry-consistency)", () => {
  it("docs/tools/index.md mentions files", () => {
    const indexPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/index.md");
    expect(existsSync(indexPath)).toBe(true);
    const body = readFileSync(indexPath, "utf8");
    expect(body).toContain("files");
  });
});

// (5) docs/tools/files.md exists and is non-stub
describe("docs/tools/files.md exists and is non-stub", () => {
  it("docs file resolves, no TODO marker, mentions inherited error codes, ≥4 example sections, has a known-limitations note", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/files.md");
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
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
    expect(body).toMatch(/known limitation|limitations/i);
  });
});
