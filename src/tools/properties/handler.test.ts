// Original — no upstream. Tests for the properties handler — 24 cases per data-model.md handler-test inventory. Covers default-mode + count-only happy paths, type field drop (R7/F5/FR-004), count→noteCount rename (R7/F6/FR-007), case-insensitive-primary + byte-tiebreak sort with drift-adjacent pairs (R8/FR-013), cross-mode invariant (FR-006a), empty-vault [] natural handling (R9 plan-stage assumption), argv shape per mode (R3 mutually exclusive), vault-set vs vault-omitted argv invariant (FR-024), single-spawn invariant (R3/R12), JSON / integer parse failures with details.stage discriminator, dispatch-layer auto-classification (output-cap), and the SC-014 token-cost regression.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeProperties } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: unknown;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeQueuedSpawn(responses: StubResponse[]): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(`unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`);
    }
    if (spec.errorOnSpawn) throw spec.errorOnSpawn;
    recorded.push({ binary, argv: [...argv], options });
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 8081;
    child.kill = (signal?: NodeJS.Signals) => {
      setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
      return true;
    };
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => {
        const closeCode = "exitCode" in spec ? (spec.exitCode ?? null) : 0;
        const closeSignal = "signal" in spec ? (spec.signal ?? null) : null;
        child.emit("exit", closeCode, closeSignal);
      });
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded };
}

function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =================== Happy paths — default mode ===================

// (1) multi-property fixture → full properties list with correct noteCount
test("default mode multi-property fixture → full list, count matches, correct noteCount per entry", async () => {
  const upstream = JSON.stringify([
    { name: "aliases", type: "aliases", count: 0 },
    { name: "author", type: "text", count: 5 },
    { name: "status", type: "text", count: 12 },
    { name: "tags", type: "tags", count: 8 },
  ]);
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: upstream + "\n", exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(recorded).toHaveLength(1);
  expect(result.count).toBe(4);
  expect(result.properties).toEqual([
    { name: "aliases", noteCount: 0 },
    { name: "author", noteCount: 5 },
    { name: "status", noteCount: 12 },
    { name: "tags", noteCount: 8 },
  ]);
});

// (2) type field dropped (R7/F5/FR-004)
test("upstream `type` field dropped — wrapper entry has exactly { name, noteCount } keys", async () => {
  const upstream = JSON.stringify([{ name: "tags", type: "tags", count: 4 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result.properties).toHaveLength(1);
  expect(Object.keys(result.properties[0]!).sort()).toEqual(["name", "noteCount"]);
  expect((result.properties[0] as { type?: unknown }).type).toBeUndefined();
});

// (3) count rename (R7/F6/FR-007)
test("upstream `count` renamed to wrapper `noteCount` byte-faithful", async () => {
  const upstream = JSON.stringify([{ name: "author", type: "text", count: 5 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result.properties[0]!.noteCount).toBe(5);
});

// (4) sort — case-insensitive primary + byte-order tiebreak (R8/FR-013 / Q1 clarification)
test("sort order — drift-adjacent case-distinct pairs: Aardvark next to aardvark, Tags next to tags", async () => {
  const upstream = JSON.stringify([
    { name: "Tags", type: "text", count: 1 },
    { name: "tags", type: "tags", count: 4 },
    { name: "Banana", type: "text", count: 2 },
    { name: "Aardvark", type: "text", count: 1 },
    { name: "aardvark", type: "text", count: 3 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result.properties.map((p) => p.name)).toEqual([
    "Aardvark",
    "aardvark",
    "Banana",
    "Tags",
    "tags",
  ]);
});

// (5) sort — alphabetical case-insensitive baseline (already-sorted upstream preserved)
test("sort order — already-sorted upstream preserved", async () => {
  const upstream = JSON.stringify([
    { name: "aliases", type: "aliases", count: 0 },
    { name: "author", type: "text", count: 5 },
    { name: "status", type: "text", count: 12 },
    { name: "tags", type: "tags", count: 8 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result.properties.map((p) => p.name)).toEqual(["aliases", "author", "status", "tags"]);
});

// (6) sort — all-lowercase fixture: alphabetical ascending preserved
test("sort order — all-lowercase fixture alphabetical ascending", async () => {
  const upstream = JSON.stringify([
    { name: "zebra", type: "text", count: 1 },
    { name: "apple", type: "text", count: 2 },
    { name: "mango", type: "text", count: 3 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result.properties.map((p) => p.name)).toEqual(["apple", "mango", "zebra"]);
});

// (7) stable sort — repeated calls on same upstream return identical order
test("stable sort — repeated calls return identical wrapper order", async () => {
  const upstream = JSON.stringify([
    { name: "Tags", type: "text", count: 1 },
    { name: "tags", type: "tags", count: 4 },
    { name: "Aardvark", type: "text", count: 1 },
    { name: "aardvark", type: "text", count: 3 },
  ]);
  const { spawnFn: spawnA } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const { spawnFn: spawnB } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const resA = await executeProperties({}, deps(spawnA));
  const resB = await executeProperties({}, deps(spawnB));
  expect(resA.properties.map((p) => p.name)).toEqual(resB.properties.map((p) => p.name));
});

// (8) reserved Obsidian properties appear alongside user-defined names
test("reserved Obsidian properties (tags, aliases, cssclasses) appear alongside user-defined names", async () => {
  const upstream = JSON.stringify([
    { name: "aliases", type: "aliases", count: 0 },
    { name: "author", type: "text", count: 5 },
    { name: "cssclasses", type: "multitext", count: 0 },
    { name: "tags", type: "tags", count: 8 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result.properties.map((p) => p.name)).toEqual(["aliases", "author", "cssclasses", "tags"]);
  expect(result.properties.find((p) => p.name === "tags")!.noteCount).toBe(8);
});

// (9) defence-in-depth pass-through: when upstream returns data on stdout (any vault name), wrapper passes it through unchanged.
// Historical note: this test originated as the "silently honoured-as-noop per F4/R5" case for unknown-vault names. The BI-042
// empirical probe (2026-05-21 against obsidian-cli 1.12.7) showed upstream now emits "Vault not found." on stdout for
// unregistered vault names — the cli-adapter R5 inspection reclassifies to CLI_REPORTED_ERROR (covered by case (9b) below).
// This test now serves as the inverse-direction regression guard: when upstream DOES return data (e.g. the vault= was
// registered, or a future upstream version changes back to silent-fallback), the wrapper does not impose extra classification.
test("data-stdout pass-through regression guard (any vault name) — wrapper imposes no extra classification on JSON data stdout", async () => {
  const upstream = JSON.stringify([{ name: "focused_vault_prop", type: "text", count: 1 }]);
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({ vault: "NonExistent" }, deps(spawnFn));
  expect(recorded[0]!.argv).toContain("vault=NonExistent");
  expect(result.count).toBe(1);
  expect(result.properties[0]!.name).toBe("focused_vault_prop");
});

// =================== Happy paths — count-only mode ===================

// (10) total:true against populated vault → { count: N, properties: [] }
test("total:true against populated vault (upstream '73') → { count: 73, properties: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "73\n", exitCode: 0 }]);
  const result = await executeProperties({ total: true }, deps(spawnFn));
  expect(result).toEqual({ count: 73, properties: [] });
});

// (11) total:true against empty vault (upstream '0') → { count: 0, properties: [] }
test("total:true against empty vault (upstream '0') → { count: 0, properties: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "0\n", exitCode: 0 }]);
  const result = await executeProperties({ total: true }, deps(spawnFn));
  expect(result).toEqual({ count: 0, properties: [] });
});

// =================== Cross-mode invariant ===================

// (12) same upstream → same outer count under both modes (FR-006a)
test("FR-006a cross-mode invariant — same outer count across default and count-only modes for the same vault state", async () => {
  const upstream = JSON.stringify([
    { name: "aliases", type: "aliases", count: 0 },
    { name: "author", type: "text", count: 5 },
    { name: "status", type: "text", count: 12 },
  ]);
  const { spawnFn: spawnDefault } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const { spawnFn: spawnTotal } = makeQueuedSpawn([{ stdout: "3\n", exitCode: 0 }]);
  const defaultOut = await executeProperties({}, deps(spawnDefault));
  const totalOut = await executeProperties({ total: true }, deps(spawnTotal));
  expect(defaultOut.count).toBe(totalOut.count);
});

// (13) default mode count === properties.length (FR-006a internal consistency)
test("default mode output.count === output.properties.length", async () => {
  const upstream = JSON.stringify([
    { name: "aliases", type: "aliases", count: 0 },
    { name: "author", type: "text", count: 5 },
    { name: "status", type: "text", count: 12 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result.count).toBe(result.properties.length);
});

// =================== Empty-vault path ===================

// (14) default mode + upstream '[]' → { count: 0, properties: [] }
test("default mode + upstream '[]' empty array → { count: 0, properties: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  const result = await executeProperties({}, deps(spawnFn));
  expect(result).toEqual({ count: 0, properties: [] });
});

// =================== Argv assertions ===================

// (15) default mode argv contains `format=json` and NOT `total`
test("default mode argv contains `format=json` and NOT `total`", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  await executeProperties({}, deps(spawnFn));
  const argv = recorded[0]!.argv;
  expect(argv).toContain("format=json");
  expect(argv).not.toContain("total");
});

// (16) count-only mode argv contains `total` and NOT `format=json`
test("count-only mode argv contains `total` and NOT `format=json`", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "0\n", exitCode: 0 }]);
  await executeProperties({ total: true }, deps(spawnFn));
  const argv = recorded[0]!.argv;
  expect(argv).toContain("total");
  expect(argv).not.toContain("format=json");
});

// (17) input.vault set → argv contains `vault=<value>` exactly (FR-024 structural data-passing)
test("input.vault 'Demo' → argv contains 'vault=Demo' exactly (no shell interpolation, FR-024)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  await executeProperties({ vault: "Demo" }, deps(spawnFn));
  expect(recorded[0]!.argv).toContain("vault=Demo");
  expect(recorded[0]!.argv).toContain("properties");
});

// (18) input.vault omitted → argv lacks any `vault=` token
test("input.vault omitted → argv does NOT contain any 'vault=' token", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  await executeProperties({}, deps(spawnFn));
  expect(recorded[0]!.argv.find((a) => a.startsWith("vault="))).toBeUndefined();
});

// (19) single spawn invocation per request (default mode)
test("default mode — ONE spawn invocation per request (single-call invariant R3/R12)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  await executeProperties({}, deps(spawnFn));
  expect(recorded).toHaveLength(1);
});

// (20) single spawn invocation per request (count-only mode)
test("count-only mode — ONE spawn invocation per request (single-call invariant R3/R12)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "0\n", exitCode: 0 }]);
  await executeProperties({ total: true }, deps(spawnFn));
  expect(recorded).toHaveLength(1);
});

// =================== Failure paths ===================

// (21) JSON parse failure → CLI_REPORTED_ERROR with details.stage = "json-parse"
test("JSON parse failure → CLI_REPORTED_ERROR with details.stage='json-parse' and details.stdout includes the malformed string", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "not valid json\n", exitCode: 0 }]);
  const err = (await captureRejection(executeProperties({}, deps(spawnFn)))) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
  expect(err.details.stdout).toBe("not valid json");
});

// (22) total-mode integer parse failure → CLI_REPORTED_ERROR with details.stage = "total-parse"
test("total-mode integer parse failure → CLI_REPORTED_ERROR with details.stage='total-parse' and details.stdout includes the malformed string", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "abc\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeProperties({ total: true }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("total-parse");
  expect(err.details.stdout).toBe("abc");
});

// (23) output-cap kill / non-zero exit → CLI_NON_ZERO_EXIT propagates unchanged
test("output-cap kill / non-zero exit → structured upstream error propagates unmodified", async () => {
  const { spawnFn } = makeQueuedSpawn([{ exitCode: 1, stderr: "cap exceeded" }]);
  const err = (await captureRejection(executeProperties({}, deps(spawnFn)))) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// (24) Token-cost regression (SC-014) — inventory payload materially smaller than full-vault grep equivalent.
// The "far smaller" claim is locked with a conservative 5× threshold for fixture-size flexibility (parity with BI-023 U1).
test("SC-014 token-cost regression — properties stdout bytes << equivalent full-vault grep bytes", async () => {
  // (a) Synthetic inventory payload: 50 distinct property entries (~2 KB JSON).
  const propertyEntries = Array.from({ length: 50 }, (_, i) => ({
    name: `prop_${String(i + 1).padStart(4, "0")}`,
    type: "text",
    count: 1 + i,
  }));
  const propertiesStdout = JSON.stringify(propertyEntries);

  // (b) Synthetic "full-vault grep" payload: 200 concatenated frontmatter blocks.
  //     Each block is the YAML frontmatter for a single note (~250 bytes); 200 blocks ≈ 50 KB markdown.
  const frontmatterBlock =
    "---\ntags: [a, b, c]\nauthor: Someone\nstatus: in-progress\nupdated: 2026-05-13\nrelated: [[X]], [[Y]], [[Z]]\nproject: Architecture\nvault_id: 00000000-0000-0000-0000-000000000000\n---\n";
  const grepEquivalent = frontmatterBlock.repeat(200);

  const propertiesBytes = Buffer.byteLength(propertiesStdout, "utf8");
  const grepBytes = Buffer.byteLength(grepEquivalent, "utf8");
  expect(propertiesBytes).toBeLessThan(grepBytes / 5);
});

// =====================================================================
// BI-041 US6 — case-insensitive collapse (FR-011)
// =====================================================================

// T0 probe captured 2026-05-21: upstream `properties format=json` against a vault
// containing `AaTest.md` (frontmatter `AaTest: value-1`) + `aatest.md` (frontmatter
// `aatest: value-2`) emits exactly ONE entry with the lowercase reported casing
// `aatest` and count summing both contributors. The runtime is correct (no change
// here); this test documents the live behaviour going forward so future drift
// surfaces immediately. The reported-casing assertion uses case-insensitive
// regex because upstream's casing choice is not under wrapper control.
test("BI-041 FR-011: case-variant frontmatter property names collapse to one entry with noteCount summed", async () => {
  const upstreamMergedEmit = JSON.stringify([
    { name: "aatest", type: "text", count: 2 },
  ]);
  const { spawnFn } = makeQueuedSpawn([
    { stdout: upstreamMergedEmit, exitCode: 0 },
  ]);
  const result = await executeProperties(
    { vault: "TestVault-Obsidian-CLI-MCP" },
    deps(spawnFn),
  );
  expect(result.count).toBe(1);
  expect(result.properties).toHaveLength(1);
  expect(result.properties[0]!.noteCount).toBe(2);
  expect(result.properties[0]!.name).toMatch(/aatest/i);
});
