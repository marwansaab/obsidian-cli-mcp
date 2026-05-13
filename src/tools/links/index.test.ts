// Original — no upstream. Tests for the links tool registration — descriptor shape, stripped schema, help mention, docs presence + content completeness.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLinksTool,
  LINKS_DESCRIPTION,
  LINKS_TOOL_NAME,
} from "./index.js";
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

describe("createLinksTool — descriptor", () => {
  // (a) Descriptor name
  it("publishes name = 'links'", () => {
    const tool = createLinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(LINKS_TOOL_NAME);
    expect(tool.descriptor.name).toBe("links");
    expect(tool.descriptor.description).toBe(LINKS_DESCRIPTION);
  });

  // (b) Stripped emitted schema — ADR-005
  it("emits an inputSchema with target_mode/vault/file/path/total properties, additionalProperties:false, required={target_mode}, no description keys", () => {
    const tool = createLinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["file", "path", "target_mode", "total", "vault"]);
    const required = schema.required as string[];
    expect([...required].sort()).toEqual(["target_mode"]);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (c) Description references help(), the tool name, and the closed kind enum + total flag
  it("description references help(), the tool name 'links', the closed kind enum, and the count-only mode", () => {
    const tool = createLinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("links");
    expect(lower).toContain("wikilink");
    expect(lower).toContain("embed");
    expect(lower).toContain("markdown");
    expect(lower).toContain("total");
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("docs/tools/links.md exists and is non-stub (FR-018)", () => {
  // (d) Docs presence + content completeness — error codes, examples, multi-vault, frontmatter inclusion
  it("docs file exists, has no TODO marker, lists every error code + ≥4 worked examples + multi-vault note + frontmatter-inclusion note", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/links.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
      "ERR_NO_ACTIVE_FILE",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/multi-?vault|multiple vaults|focused vault/i);
    expect(body).toMatch(/frontmatter/i);
  });
});

describe("FR-018 baseline drift detector", () => {
  // (e) Baseline roll-forward gate — the fingerprint must match _register-baseline.json
  // post-npm-run-baseline:write. This test relies on T009 having been run.
  it("registered tool's fingerprint appears in _register-baseline.json", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === LINKS_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(typeof entry!.descriptionFingerprint).toBe("string");
    expect(typeof entry!.schemaFingerprint).toBe("string");
  });
});
