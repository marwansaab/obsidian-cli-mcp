// Original — no upstream. query_base handler tests — US1 envelope/ordering/truncation/collision/empty/vault cohort plus US2 BASE_NOT_FOUND / BASE_MALFORMED (five reasons) / VIEW_NOT_FOUND / PATH_ESCAPES_VAULT classification cohort. Mock-only per project test-scope memory; T0 live captures live elsewhere.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { resolve as resolvePath } from "node:path";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

// Platform-absolute vault root for cross-platform tests: `path.resolve("/vault")`
// returns `/vault` on POSIX and `<drive>:\vault` on Windows. Using a non-absolute
// stub like `"C:\\Vault"` triggers `path.resolve` to prepend the CWD on Linux,
// which then trips the canonical-path check before the test's intended branch
// fires (caught in CI 2026-05-21).
const TEST_VAULT_ROOT = resolvePath("/vault");

import { executeQueryBase, type ExecuteDeps } from "./handler.js";
import {
  __resetInFlightRegistryForTests,
  type SpawnLike,
} from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeQueuedSpawn(responses: StubResponse[]): {
  spawnFn: SpawnLike;
  recorded: SpawnRecording[];
  getCount: () => number;
} {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(
        `unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`,
      );
    }
    recorded.push({ binary, argv: [...argv], options });
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7777;
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
  return { spawnFn, recorded, getCount: () => idx };
}

function silentLogger(): Logger {
  return createLogger({
    stream: new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

interface DepsOpts {
  spawnFn: SpawnLike;
  vaultRoot?: string;
  fsStat?: (p: string) => Promise<{ size: number }>;
  fsRealpath?: (p: string) => Promise<string>;
}

function makeStubRegistry(vaultRoot: string): VaultRegistry {
  return {
    async resolveVaultPath(_name: string): Promise<string> {
      return vaultRoot;
    },
  };
}

function deps(opts: DepsOpts): ExecuteDeps {
  const vaultRoot = opts.vaultRoot ?? TEST_VAULT_ROOT;
  return {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn: opts.spawnFn,
    env: {},
    vaultRegistry: makeStubRegistry(vaultRoot),
    fs: {
      stat: opts.fsStat ?? (async () => ({ size: 100 })),
      realpath: opts.fsRealpath ?? (async (p: string) => p),
    },
  };
}

const HAPPY_INPUT = {
  base_path: "Indexes/Active.base",
  view_name: "Open",
  vault: "Demo",
};

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// US1 — Happy paths
// =====================================================================

test("US1: single-row happy path emits envelope with `path` at columns[0] + native-type preservation", async () => {
  const rows = [
    {
      path: "Issues/BI-0039.md",
      id: "BI-0039",
      status: "open",
      priority: 1,
      open: true,
      tags: ["bug", "p1"],
      meta: null,
    },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.columns[0]).toBe("path");
  expect(r.columns).toEqual(["path", "id", "status", "priority", "open", "tags", "meta"]);
  expect(r.rows).toHaveLength(1);
  expect(r.rows[0]).toEqual(rows[0]);
  expect(r.truncated).toBe(false);
  expect(r.total_rows).toBeUndefined();
});

test("US1: multi-row happy path preserves upstream emission order (path-asc baseline)", async () => {
  const rows = [
    { path: "Issues/BI-0039.md", status: "open" },
    { path: "Issues/BI-0040.md", status: "open" },
    { path: "Issues/BI-0048.md", status: "closed" },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.rows.map((row) => row["path"])).toEqual([
    "Issues/BI-0039.md",
    "Issues/BI-0040.md",
    "Issues/BI-0048.md",
  ]);
});

test("US1: default-column-set introspection (FR-008) — columns reflects every view-emitted column", async () => {
  const rows = [
    {
      path: "Notes/a.md",
      title: "Alpha",
      created: "2026-01-01",
      tags: ["t1"],
      mood: 0.7,
    },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.columns).toEqual(["path", "title", "created", "tags", "mood"]);
  expect(Object.keys(r.rows[0]!).sort()).toEqual(
    ["created", "mood", "path", "tags", "title"],
  );
});

test("US1: empty-rows response (FR-006 / FR-002c) → rows=[], columns=['path'], truncated=false, no total_rows", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify([]), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.rows).toEqual([]);
  expect(r.columns).toEqual(["path"]);
  expect(r.truncated).toBe(false);
  expect(r.total_rows).toBeUndefined();
});

test("US1: multi-view sibling-no-leak (FR-007 / SC-004) — view A columns only", async () => {
  const rowsA = [
    { path: "x.md", status: "open" },
    { path: "y.md", status: "closed" },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rowsA), exitCode: 0 },
  ]);
  const r = await executeQueryBase(
    { ...HAPPY_INPUT, view_name: "A" },
    deps({ spawnFn }),
  );
  expect(r.columns).toEqual(["path", "status"]);
  for (const row of r.rows) {
    expect(row).not.toHaveProperty("priority");
    expect(row).not.toHaveProperty("tags");
  }
});

test("US1: multi-view sibling-no-leak symmetric — view B columns only", async () => {
  const rowsB = [
    { path: "x.md", priority: 1, tags: ["urgent"] },
    { path: "y.md", priority: 3, tags: [] },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rowsB), exitCode: 0 },
  ]);
  const r = await executeQueryBase(
    { ...HAPPY_INPUT, view_name: "B" },
    deps({ spawnFn }),
  );
  expect(r.columns).toEqual(["path", "priority", "tags"]);
  for (const row of r.rows) expect(row).not.toHaveProperty("status");
});

test("US1: reserved-key collision (FR-002b) — `_source_path` + view-defined `path` → path_view rename", async () => {
  const rows = [
    {
      _source_path: "Issues/BI-0039.md",
      path: "Custom view path A",
      priority: 1,
    },
    {
      _source_path: "Issues/BI-0040.md",
      path: "Custom view path B",
      priority: 2,
    },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.columns).toEqual(["path", "path_view", "priority"]);
  expect(r.rows[0]).toEqual({
    path: "Issues/BI-0039.md",
    path_view: "Custom view path A",
    priority: 1,
  });
  expect(r.rows[1]).toEqual({
    path: "Issues/BI-0040.md",
    path_view: "Custom view path B",
    priority: 2,
  });
});

// =====================================================================
// US1 — Truncation (FR-013)
// =====================================================================

test("US1: truncation — 1247 rows → 1000 rows, truncated:true, total_rows:1247", async () => {
  const rows = Array.from({ length: 1247 }, (_, i) => ({
    path: `Notes/${String(i).padStart(5, "0")}.md`,
    n: i,
  }));
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.rows).toHaveLength(1000);
  expect(r.truncated).toBe(true);
  expect(r.total_rows).toBe(1247);
  expect(r.rows[0]!["path"]).toBe("Notes/00000.md");
  expect(r.rows[999]!["path"]).toBe("Notes/00999.md");
});

test("US1: exactly 1000 rows → no false-positive truncation signal", async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    path: `Notes/${String(i).padStart(4, "0")}.md`,
  }));
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.rows).toHaveLength(1000);
  expect(r.truncated).toBe(false);
  expect(r.total_rows).toBeUndefined();
});

// =====================================================================
// US1 — Determinism (SC-003)
// =====================================================================

test("SC-003: repeat invocation against same fixture → byte-identical JSON.stringify", async () => {
  const rows = [
    { path: "b.md", priority: 1 },
    { path: "a.md", priority: 2 },
    { path: "c.md", priority: 3 },
  ];
  const { spawnFn: s1 } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const { spawnFn: s2 } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r1 = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn: s1 }));
  const r2 = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn: s2 }));
  expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
});

test("US1: view's primary sort (created desc + path-asc tiebreaker) preserved verbatim from upstream emission", async () => {
  const rows = [
    { path: "a.md", created: "2026-05-01" },
    { path: "b.md", created: "2026-05-01" }, // same created → path-asc tiebreak (a < b)
    { path: "c.md", created: "2025-12-31" },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.rows.map((row) => row["path"])).toEqual(["a.md", "b.md", "c.md"]);
});

// =====================================================================
// US1 — Vault selection (FR-009)
// =====================================================================

test("US1: input.vault=undefined does NOT trigger closed-vault detection (single spawn only)", async () => {
  const rows = [{ path: "x.md" }];
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const r = await executeQueryBase(
    { base_path: "Indexes/Active.base", view_name: "Open" },
    {
      ...deps({ spawnFn }),
      // For the no-vault path we inject a synthetic focused-vault response.
      invokeEval: async () => ({ path: null, base: TEST_VAULT_ROOT }),
    },
  );
  expect(r.rows).toEqual([{ path: "x.md" }]);
  expect(getCount()).toBe(1);
});

test("US1: closed-but-registered vault (FR-009) → CLI_REPORTED_ERROR/VAULT_NOT_FOUND/not-open", async () => {
  const registry = "Demo\tC:\\Vault\nThe Setup\tD:\\Vaults\\The Setup\n";
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 }, // base:query returns empty stdout
    { stdout: registry, exitCode: 0 }, // detectIfClosed → vaults verbose
  ]);
  const err = (await captureRejection(
    executeQueryBase(
      { ...HAPPY_INPUT, vault: "The Setup" },
      deps({ spawnFn }),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "VAULT_NOT_FOUND",
    reason: "not-open",
    vault: "The Setup",
  });
});

test("US1: unknown vault via cli-adapter `Vault not found.` reclassifier → CLI_REPORTED_ERROR verbatim", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Vault not found.\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(
      { ...HAPPY_INPUT, vault: "NoSuchVault" },
      deps({ spawnFn }),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

test("US1: vault unknown via vaultRegistry resolveVaultPath → CLI_REPORTED_ERROR/VAULT_NOT_FOUND/unknown", async () => {
  const { spawnFn } = makeQueuedSpawn([]);
  const registryThatRejects: VaultRegistry = {
    async resolveVaultPath(_n: string) {
      throw new UpstreamError({
        code: "VALIDATION_ERROR",
        cause: null,
        details: { requestedVault: "X", knownVaults: [] },
        message: 'Vault "X" is not registered with Obsidian.',
      });
    },
  };
  const d: ExecuteDeps = {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
    env: {},
    vaultRegistry: registryThatRejects,
    fs: { stat: async () => ({ size: 100 }), realpath: async (p) => p },
  };
  const err = (await captureRejection(
    executeQueryBase({ ...HAPPY_INPUT, vault: "X" }, d),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "VAULT_NOT_FOUND",
    reason: "unknown",
    vault: "X",
  });
});

// =====================================================================
// US1 — Wire-envelope failures
// =====================================================================

test("US1: CLI stdout JSON parse failure → CLI_REPORTED_ERROR/stage=json-parse", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "[not valid json", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "json-parse" });
});

test("US1: wire envelope shape failure (object instead of array) → CLI_REPORTED_ERROR/stage=envelope-parse", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify({ rows: [] }), exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "envelope-parse" });
});

// =====================================================================
// US1 — Read-only structural lock (FR-015)
// =====================================================================

test("FR-015 read-only: handler never invokes fs.writeFile (cohort lock)", async () => {
  let writeFileCalls = 0;
  const stat = async () => ({ size: 100 });
  const realpath = async (p: string) => p;
  const fs = {
    stat,
    realpath,
    // Synthetic guard — handler should not depend on fs.writeFile or similar.
    writeFile: async () => {
      writeFileCalls++;
    },
  } as ExecuteDeps["fs"];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify([{ path: "x.md" }]), exitCode: 0 },
  ]);
  await executeQueryBase(HAPPY_INPUT, {
    ...deps({ spawnFn }),
    fs,
  });
  expect(writeFileCalls).toBe(0);
});

// =====================================================================
// US2 — Pre-flight error classification (T021)
// =====================================================================

test("US2: BASE_NOT_FOUND — fs.stat throws ENOENT → CLI_REPORTED_ERROR/BASE_NOT_FOUND + details.base_path", async () => {
  const { spawnFn } = makeQueuedSpawn([]); // no spawn should fire
  const err = (await captureRejection(
    executeQueryBase(
      HAPPY_INPUT,
      deps({
        spawnFn,
        fsStat: async () => {
          const e = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException;
          e.code = "ENOENT";
          throw e;
        },
      }),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "BASE_NOT_FOUND",
    base_path: "Indexes/Active.base",
  });
});

test("US2: BASE_MALFORMED/empty — fs.stat returns size 0 → CLI_REPORTED_ERROR/BASE_MALFORMED/empty", async () => {
  const { spawnFn } = makeQueuedSpawn([]);
  const err = (await captureRejection(
    executeQueryBase(
      HAPPY_INPUT,
      deps({ spawnFn, fsStat: async () => ({ size: 0 }) }),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "BASE_MALFORMED",
    reason: "empty",
    base_path: "Indexes/Active.base",
  });
});

test("US2: BASE_MALFORMED/invalid-yaml — upstream emits YAMLException stderr → BASE_MALFORMED/invalid-yaml", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", stderr: "YAMLException: unexpected token at line 5", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "BASE_MALFORMED",
    reason: "invalid-yaml",
    base_path: "Indexes/Active.base",
  });
  expect(err.details["message"]).toContain("YAMLException");
});

test("US2: BASE_MALFORMED/invalid-yaml — js-yaml structural error with no literal `yaml` token (BI-057 live T0 probe) → BASE_MALFORMED/invalid-yaml + verbatim message", async () => {
  // Live 2026-05-29 probe: a syntactically broken `.base` surfaced as this exact
  // string, which matches none of the pre-BI-057 invalid-yaml alternatives and
  // previously fell through to the generic verbatim-message path.
  const upstream =
    "Error: Flow sequence in block collection must be sufficiently indented and end with a ]";
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", stderr: upstream, exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "BASE_MALFORMED",
    reason: "invalid-yaml",
    base_path: "Indexes/Active.base",
  });
  expect(err.details["message"]).toContain("sufficiently indented");
});

test("US2: BASE_MALFORMED/missing-required-key — `views: is required` → BASE_MALFORMED/missing-required-key", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", stderr: 'key "views" is required', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "BASE_MALFORMED",
    reason: "missing-required-key",
  });
});

test("US2: BASE_MALFORMED/unsupported-schema-version → BASE_MALFORMED/unsupported-schema-version", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", stderr: "Unsupported schema version 99", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "BASE_MALFORMED",
    reason: "unsupported-schema-version",
  });
});

test("US2: BASE_MALFORMED/unknown — unrecognised stderr + unparseable stdout → BASE_MALFORMED/unknown + verbatim message", async () => {
  const upstream = "Some unrecognised error nobody anticipated";
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "garbled non-json", stderr: upstream, exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "BASE_MALFORMED",
    reason: "unknown",
    base_path: "Indexes/Active.base",
    message: upstream,
  });
});

test("US2: VIEW_NOT_FOUND — `View 'Open' not found` → VIEW_NOT_FOUND + details.view_name + details.base_path", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", stderr: "View 'Open' not found in base file", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "VIEW_NOT_FOUND",
    view_name: "Open",
    base_path: "Indexes/Active.base",
  });
});

test("US1: no-vault path exercises default FOCUSED_VAULT_TEMPLATE eval round-trip", async () => {
  const focusedResp = JSON.stringify(
    JSON.stringify({ path: null, base: TEST_VAULT_ROOT }),
  );
  const { spawnFn } = makeQueuedSpawn([
    // 1st spawn: focused-vault eval → returns the JSON-string-wrapped envelope.
    { stdout: `=> ${focusedResp}\n`, exitCode: 0 },
    // 2nd spawn: base:query → returns wire envelope.
    { stdout: JSON.stringify([{ path: "x.md" }]), exitCode: 0 },
  ]);
  // Build deps WITHOUT injecting invokeEval, so defaultInvokeEval runs.
  const d: ExecuteDeps = {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
    env: {},
    vaultRegistry: makeStubRegistry("C:\\Vault"),
    fs: { stat: async () => ({ size: 100 }), realpath: async (p) => p },
  };
  const r = await executeQueryBase(
    { base_path: "Indexes/Active.base", view_name: "Open" },
    d,
  );
  expect(r.rows).toEqual([{ path: "x.md" }]);
});

test("US1: no-vault path with unparseable focused-vault eval → CLI_REPORTED_ERROR/stage=focused-vault-resolve", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "=> garbled-not-json\n", exitCode: 0 },
  ]);
  const d: ExecuteDeps = {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
    env: {},
    vaultRegistry: makeStubRegistry("C:\\Vault"),
    fs: { stat: async () => ({ size: 100 }), realpath: async (p) => p },
  };
  const err = (await captureRejection(
    executeQueryBase(
      { base_path: "Indexes/Active.base", view_name: "Open" },
      d,
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "focused-vault-resolve" });
});

test("US1: INTERNAL_ERROR — upstream row has no `path` and no collision metadata", async () => {
  const rows = [{ status: "open", priority: 1 }]; // no `path`, no `_source_path`
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("INTERNAL_ERROR");
  expect(err.details).toMatchObject({ stage: "row-locator-synthesis" });
});

test("US1: INTERNAL_ERROR — collision metadata key present but empty", async () => {
  const rows = [{ _source_path: "", path: "view-custom", priority: 1 }];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: JSON.stringify(rows), exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, deps({ spawnFn })),
  )) as UpstreamError;
  expect(err.code).toBe("INTERNAL_ERROR");
  expect(err.details).toMatchObject({ stage: "row-locator-synthesis" });
});

test("US2: fs.stat non-ENOENT error re-thrown unchanged", async () => {
  const { spawnFn } = makeQueuedSpawn([]);
  const eaccErr = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
  eaccErr.code = "EACCES";
  const err = await captureRejection(
    executeQueryBase(
      HAPPY_INPUT,
      deps({
        spawnFn,
        fsStat: async () => {
          throw eaccErr;
        },
      }),
    ),
  );
  expect(err).toBe(eaccErr);
});

test("US2: PATH_ESCAPES_VAULT — realpath returns path outside vault root → PATH_ESCAPES_VAULT + logger event", async () => {
  let pathEscapeAttemptCalls = 0;
  const customLogger: Logger = {
    ...silentLogger(),
    pathEscapeAttempt: () => {
      pathEscapeAttemptCalls++;
    },
  };
  const { spawnFn } = makeQueuedSpawn([]);
  const d: ExecuteDeps = {
    logger: customLogger,
    queue: createQueue(),
    spawnFn,
    env: {},
    vaultRegistry: makeStubRegistry("C:\\Vault"),
    fs: {
      stat: async () => ({ size: 100 }),
      // realpath of the vault root → "C:\\Vault"; realpath of the parent dir → escaping path.
      realpath: async (p: string) => {
        if (p === "C:\\Vault") return "C:\\Vault";
        return "C:\\Elsewhere";
      },
    },
  };
  const err = (await captureRejection(
    executeQueryBase(HAPPY_INPUT, d),
  )) as UpstreamError;
  expect(err.code).toBe("PATH_ESCAPES_VAULT");
  expect(err.details).toMatchObject({ attemptedPath: "Indexes/Active.base" });
  expect(pathEscapeAttemptCalls).toBe(1);
});

// =====================================================================
// BI-041 US2 — Both-channel VIEW_NOT_FOUND classification (FR-003 / FR-004 / FR-005)
// =====================================================================

// T0 probe capture: upstream emits "Error: View not found: <name>" on STDOUT
// with exitCode 0 and empty stderr. Pre-edit prefer-stderr-fallback ternary
// drops the message; both-channel scan reaches the classifier.
test("BI-041 US2: VIEW_NOT_FOUND on stdout-only emit (T0-captured upstream shape)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: "Error: View not found: NonExistentView\nAvailable views: Open\n",
      stderr: "",
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeQueryBase(
      { ...HAPPY_INPUT, view_name: "NonExistentView" },
      deps({ spawnFn }),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "VIEW_NOT_FOUND",
    view_name: "NonExistentView",
    base_path: "Indexes/Active.base",
  });
});

// Bug-fix anchor: pre-edit ternary picked stderr (non-empty incidental warning)
// and discarded the stdout error phrase, so this case surfaced as BASE_MALFORMED/
// unknown via the stage-6 fallback. Post-edit both-channel concat exposes the
// VIEW_NOT_FOUND phrase regardless of which channel carried the warning.
test("BI-041 US2: VIEW_NOT_FOUND on stdout emit with incidental stderr (bug-fix anchor)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: "Error: View not found: NonExistentView\n",
      stderr: "warn: connection slow\n",
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeQueryBase(
      { ...HAPPY_INPUT, view_name: "NonExistentView" },
      deps({ spawnFn }),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "VIEW_NOT_FOUND",
    view_name: "NonExistentView",
    base_path: "Indexes/Active.base",
  });
});

// JSON-array short-circuit must beat the both-channel scan when stderr carries
// a warning but stdout is a valid JSON-array success response. The `[`-prefix
// guard on stdoutTrimmed wins over the combined-message classification.
test("BI-041 US2: JSON-array short-circuit preserved when stderr carries a warning", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: "[]\n",
      stderr: "warn: empty result\n",
      exitCode: 0,
    },
  ]);
  const r = await executeQueryBase(HAPPY_INPUT, deps({ spawnFn }));
  expect(r.rows).toEqual([]);
  expect(r.columns).toEqual(["path"]);
  expect(r.truncated).toBe(false);
});
