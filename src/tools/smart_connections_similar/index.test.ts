// Original — no upstream. Tests for the smart_connections_similar tool registration — descriptor shape, plugin-namespace name + plugin-lifecycle codes in description, docs presence + content completeness, FR-018 baseline drift detector entry.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSmartConnectionsSimilarTool,
  SMART_CONNECTIONS_SIMILAR_DESCRIPTION,
  SMART_CONNECTIONS_SIMILAR_TOOL_NAME,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createSmartConnectionsSimilarTool — descriptor", () => {
  // (a) Descriptor name follows ADR-013 plugin-namespace convention
  it("publishes name = 'smart_connections_similar' (ADR-013 plugin-namespace)", () => {
    const tool = createSmartConnectionsSimilarTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(SMART_CONNECTIONS_SIMILAR_TOOL_NAME);
    expect(tool.descriptor.name).toBe("smart_connections_similar");
    expect(tool.descriptor.description).toBe(SMART_CONNECTIONS_SIMILAR_DESCRIPTION);
  });

  // (c) Description references plugin-lifecycle codes, headingPath, total/limit; no target-mode rule repeat (068 FR-028)
  it("description references plugin-lifecycle codes, headingPath, limit/total, and repeats no target-mode rule", () => {
    const tool = createSmartConnectionsSimilarTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    expect(desc).not.toMatch(/specific mode/i);
    expect(desc).toContain("headingPath");
    expect(desc).toContain("limit");
    expect(desc).toContain("total");
    expect(desc).toContain("SMART_CONNECTIONS_NOT_INSTALLED");
    expect(desc).toContain("SMART_CONNECTIONS_NOT_READY");
    expect(desc).toContain("SOURCE_NOT_INDEXED");
    expect(desc.length).toBeGreaterThan(0);
  });

  // (c1) spec 072 FR-008 / SC-007: closed vault recovers; vault unavailable is a failure; no not-open
  it("description states closed-vault recovery and vault unavailable, and no not-open state", () => {
    const desc = SMART_CONNECTIONS_SIMILAR_DESCRIPTION;
    for (const s of ["Closed vault", "opened automatically", 'Command "', "vault unavailable", "never an empty result"]) {
      expect(desc).toContain(s);
    }
    expect(desc).not.toContain("not-open");
    expect(desc).not.toContain("registered but not open");
    const closedVaultSentence = desc.slice(desc.indexOf("Closed vault")).split("\n\n")[0]!;
    expect(closedVaultSentence).not.toContain("Vault not found");
    expect(closedVaultSentence).not.toContain("VAULT_NOT_FOUND");
  });
});

// (c2) handler-closure execution — VALID input runs `handler: async (input, d) => executeSmartConnectionsSimilar(...)`
// (the closure short-circuited by VALIDATION_ERROR in every other case here). A success eval envelope
// proves the closure executes and produces a JSON-wrapped { count, matches } envelope.
describe("createSmartConnectionsSimilarTool — handler closure (valid input)", () => {
  it("tool.handler runs the closure on valid input and returns a content array", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: '=> {"ok":true,"count":0,"matches":[]}\n', exitCode: 0 },
    ]);
    const tool = createSmartConnectionsSimilarTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn,
      env: {},
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "Demo",
      path: "Source/Note.md",
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      count: 0,
      matches: [],
    });
  });
});

describe("docs/tools/smart_connections_similar.md exists and is non-stub (FR-022)", () => {
  // (d) Docs presence + content completeness
  it("docs file exists, has no TODO marker, lists every error code + ≥4 worked examples + plugin-lifecycle text", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/smart_connections_similar.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body.length).toBeGreaterThan(1024);
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
      "ERR_NO_ACTIVE_FILE",
      "VAULT_NOT_FOUND",
      "SMART_CONNECTIONS_NOT_INSTALLED",
      "SMART_CONNECTIONS_NOT_READY",
      "SOURCE_NOT_INDEXED",
      "FILE_NOT_FOUND",
      "NOT_MARKDOWN",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/headingPath/);
    expect(body).toMatch(/plugin-lifecycle|Smart Connections plugin/i);
    expect(body).toMatch(/vault unavailable/i);
    expect(body).toMatch(/minimum probed|minimum plugin version|v4\.|Smart Connections/i);
  });
});

describe("FR-018 baseline drift detector", () => {
  // (e) Baseline roll-forward gate — the fingerprint must match _register-baseline.json
  it("registered tool's fingerprint appears in _register-baseline.json (after T009 baseline:write)", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === SMART_CONNECTIONS_SIMILAR_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(typeof entry!.descriptionFingerprint).toBe("string");
    expect(typeof entry!.schemaFingerprint).toBe("string");
  });
});
