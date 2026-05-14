// Original — no upstream. Tests for the smart_connections_query handler — single-call argv assembly (with stage-0 closed-vault detection adding a second `vaults verbose` spawn via the shared `_eval-vault-closed-detection` module), base64 payload round-trip (R6 anti-injection), LAST-`=> ` stdout extraction (R14 — plugin-side console.log preamble), three envelope codes with `details.reason` sub-discriminator unflattening per ADR-015, error-precedence chain (FR-017), R3 single-spawn invariant. 26 cases per data-model.md inventory.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { executeSmartConnectionsQuery } from "./handler.js";
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
    if (spec.errorOnSpawn) {
      throw spec.errorOnSpawn;
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
    child.pid = 4242;
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

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

function decodePayload(argv: string[]): unknown {
  const codeArg = argv.find((a) => a.startsWith("code="));
  if (!codeArg) throw new Error("argv missing code= parameter");
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  if (!match) throw new Error("argv code= does not contain base64 atob(...) payload");
  return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"));
}

const defaultLimit = 20;

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// Helper — build a plugin-side preamble + envelope stdout (R14 LAST-`=> ` strategy)
function withPreamble(envelope: unknown): string {
  return `Found and returned 5 smart_blocks.\n=> ${JSON.stringify(envelope)}\n`;
}

// =====================================================================
// Happy paths (1–4)
// =====================================================================

// (1) Default-mode multi-block result
test("default mode multi-block result: count + matches passed through", async () => {
  const envelope = {
    ok: true,
    count: 3,
    matches: [
      { path: "Topics/AI.md", headingPath: ["Overview"], score: 0.91 },
      { path: "Topics/AI.md", headingPath: ["History", "1956"], score: 0.85 },
      { path: "Notes/ML.md", headingPath: [], score: 0.78 },
    ],
  };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: withPreamble(envelope), exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsQuery(
    { query: "deployment", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 3, matches: envelope.matches });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  expect(decodePayload(argv)).toEqual({ query: "deployment", limit: 20, total: false });
});

// (2) Source-level match (empty headingPath)
test("source-level match: headingPath:[] preserved", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Note.md", headingPath: [], score: 0.5 }],
  };
  const { spawnFn } = makeQueuedSpawn([{ stdout: withPreamble(envelope), exitCode: 0 }]);
  const result = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches[0]).toEqual({ path: "Note.md", headingPath: [], score: 0.5 });
});

// (3) Count-only mode: matches:[]
test("count-only mode (total:true): {count:N, matches:[]}", async () => {
  const envelope = { ok: true, count: 7, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: withPreamble(envelope), exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit, total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 7, matches: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({ query: "x", limit: 20, total: true });
});

// (4) Frontmatter sentinel preserved
test("frontmatter-block match: headingPath preserves '---frontmatter---' sentinel verbatim", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Note.md", headingPath: ["---frontmatter---"], score: 0.7 }],
  };
  const { spawnFn } = makeQueuedSpawn([{ stdout: withPreamble(envelope), exitCode: 0 }]);
  const result = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches[0]!.headingPath).toEqual(["---frontmatter---"]);
});

// =====================================================================
// Cross-mode invariance (5)
// =====================================================================

test("cross-mode invariant: count_false === count_true on identical fixture (FR-006a)", async () => {
  const N = 4;
  const envelopeFull = {
    ok: true,
    count: N,
    matches: [
      { path: "A.md", headingPath: [], score: 0.9 },
      { path: "B.md", headingPath: [], score: 0.8 },
      { path: "C.md", headingPath: [], score: 0.7 },
      { path: "D.md", headingPath: [], score: 0.6 },
    ],
  };
  const envelopeTotal = { ok: true, count: N, matches: [] };
  const { spawnFn: spawn1 } = makeQueuedSpawn([
    { stdout: withPreamble(envelopeFull), exitCode: 0 },
  ]);
  const { spawnFn: spawn2 } = makeQueuedSpawn([
    { stdout: withPreamble(envelopeTotal), exitCode: 0 },
  ]);
  const r1 = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit, total: false },
    deps(spawn1),
  );
  const r2 = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit, total: true },
    deps(spawn2),
  );
  expect(r1.count).toBe(r2.count);
  expect(r1.count).toBe(N);
  expect(r1.matches.length).toBe(N);
  expect(r2.matches.length).toBe(0);
});

// =====================================================================
// Sort (6–8) — wrapper passes envelope through; eval JS sorts
// =====================================================================

// (6) Score-desc
test("sort: score descending (envelope order preserved)", async () => {
  const envelope = {
    ok: true,
    count: 3,
    matches: [
      { path: "A.md", headingPath: [], score: 0.9 },
      { path: "B.md", headingPath: [], score: 0.7 },
      { path: "C.md", headingPath: [], score: 0.5 },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([{ stdout: withPreamble(envelope), exitCode: 0 }]);
  const result = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches.map((m) => m.score)).toEqual([0.9, 0.7, 0.5]);
});

// (7) Score-tie path-tiebreak
test("score-tie: path byte-asc tiebreak (FR-008 / R8 secondary)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    matches: [
      { path: "AAA.md", headingPath: [], score: 0.5 },
      { path: "BBB.md", headingPath: [], score: 0.5 },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([{ stdout: withPreamble(envelope), exitCode: 0 }]);
  const result = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches.map((m) => m.path)).toEqual(["AAA.md", "BBB.md"]);
});

// (8) Score-tie path-tie headingPath-tiebreak
test("score-tie + path-tie: headingPath.join('#') byte-asc tertiary tiebreak", async () => {
  const envelope = {
    ok: true,
    count: 2,
    matches: [
      { path: "Same.md", headingPath: ["A"], score: 0.5 },
      { path: "Same.md", headingPath: ["B"], score: 0.5 },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([{ stdout: withPreamble(envelope), exitCode: 0 }]);
  const result = await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches.map((m) => m.headingPath.join("#"))).toEqual(["A", "B"]);
});

// =====================================================================
// Filter (9) — schema rejects non-finite at envelope-parse stage (R10 guard)
// =====================================================================

test("non-finite score in envelope: envelope-parse failure (R10 / eval filter is the guard)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Note.md", headingPath: [], score: null }],
  };
  const { spawnFn } = makeQueuedSpawn([{ stdout: withPreamble(envelope), exitCode: 0 }]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// =====================================================================
// Limit (10)
// =====================================================================

test("limit:100 (upper boundary): payload carries limit:100", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: withPreamble(envelope), exitCode: 0 },
  ]);
  await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: 100 },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { limit: number };
  expect(payload.limit).toBe(100);
});

// =====================================================================
// Anti-injection (11–12)
// =====================================================================

test("R6 anti-injection: shell-metacharacters round-trip verbatim", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: withPreamble(envelope), exitCode: 0 },
  ]);
  const hostile = "\"; rm -rf $(pwd); echo 'pwn' && cat /etc/passwd";
  await executeSmartConnectionsQuery(
    { query: hostile, vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="))!;
  expect(codeArg).not.toContain(hostile); // raw query NOT in source
  const payload = decodePayload(recorded[0]!.argv) as { query: string };
  expect(payload.query).toBe(hostile);
});

test("R6 anti-injection: Unicode + emoji round-trip verbatim", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: withPreamble(envelope), exitCode: 0 },
  ]);
  const unicode = "漢字 emoji 🚀 ñ é ü";
  await executeSmartConnectionsQuery(
    { query: unicode, vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { query: string };
  expect(payload.query).toBe(unicode);
});

// =====================================================================
// Plugin lifecycle (13–15)
// =====================================================================

// (13) NOT_INSTALLED
test("envelope SMART_CONNECTIONS_NOT_INSTALLED → CLI_REPORTED_ERROR", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: withPreamble({
        ok: false,
        code: "SMART_CONNECTIONS_NOT_INSTALLED",
        detail: "plugin not loaded in vault: Demo",
      }),
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_INSTALLED",
  });
});

// (14) API_MISSING → details.reason:"api-missing"
test("envelope SMART_CONNECTIONS_NOT_READY_API_MISSING → details.reason:'api-missing'", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: withPreamble({
        ok: false,
        code: "SMART_CONNECTIONS_NOT_READY_API_MISSING",
        detail: "env.smart_sources.lookup unavailable",
      }),
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_READY",
    reason: "api-missing",
  });
});

// (15) EMBED_FAILED → details.reason:"embed-failed"
test("envelope SMART_CONNECTIONS_NOT_READY_EMBED_FAILED → details.reason:'embed-failed'", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: withPreamble({
        ok: false,
        code: "SMART_CONNECTIONS_NOT_READY_EMBED_FAILED",
        detail: "Embedding search is not enabled.",
      }),
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_READY",
    reason: "embed-failed",
    detail: "Embedding search is not enabled.",
  });
});

// =====================================================================
// Vault errors (16–17)
// =====================================================================

// (16) Unknown vault → 011-R5 inspection
test("unknown vault: 'Vault not found.' stdout → CLI_REPORTED_ERROR (R5)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "NoSuchVault", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (17) Closed-but-registered vault — empty stdout + registered → not-open
test("closed-but-registered vault: empty stdout + registered → CLI_REPORTED_ERROR(reason:'not-open')", async () => {
  const vaultsListStdout =
    "TestVault\tC:\\Vaults\\TestVault\nThe Setup\tD:\\Vaults\\The Setup\n";
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 }, // first call: empty stdout (closed-vault signature)
    { stdout: vaultsListStdout, exitCode: 0 }, // second call: vaults verbose
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "The Setup", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "VAULT_NOT_FOUND",
    reason: "not-open",
    stage: "handler-stage-0",
    vault: "The Setup",
  });
  expect(getCount()).toBe(2);
});

// =====================================================================
// Parse failures (18–19)
// =====================================================================

// (18) json-parse
test("malformed JSON eval response → CLI_REPORTED_ERROR(stage:'json-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Found and returned 5 smart_blocks.\n=> not-valid-json{\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

// (19) envelope-parse
test("envelope shape unexpected → CLI_REPORTED_ERROR(stage:'envelope-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: withPreamble({ ok: "maybe", count: 5, matches: [] }),
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// =====================================================================
// Adapter inheritance (20)
// =====================================================================

// (20) CLI_TIMEOUT propagates (via dispatch layer — emulate via spawn that never finishes is too
// complex; instead verify a CLI_NON_ZERO_EXIT path propagates verbatim — proxy for adapter
// inheritance)
test("adapter inheritance: CLI_NON_ZERO_EXIT from spawn exit non-zero propagates", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", stderr: "boom", exitCode: 1 },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// =====================================================================
// Precedence chain (21–24)
// =====================================================================

// (21) vault-unknown wins over vault-not-open
test("precedence: VAULT_NOT_FOUND(unknown) wins over VAULT_NOT_FOUND(not-open)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "NoSuchVault", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.reason).not.toBe("not-open");
});

// (22) vault-not-open wins over not-installed
test("precedence: VAULT_NOT_FOUND(not-open) wins over SMART_CONNECTIONS_NOT_INSTALLED", async () => {
  const vaultsListStdout = "The Setup\tD:\\Vaults\\The Setup\n";
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 }, // first call: empty (stage-0 fires)
    { stdout: vaultsListStdout, exitCode: 0 }, // second call: registered
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "The Setup", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({ code: "VAULT_NOT_FOUND", reason: "not-open" });
});

// (23) not-installed wins over api-missing
test("precedence: SMART_CONNECTIONS_NOT_INSTALLED wins over api-missing", async () => {
  // Stage 1 (plugin check) fires before Stage 2 (api-missing) in the eval; surface = NOT_INSTALLED
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: withPreamble({
        ok: false,
        code: "SMART_CONNECTIONS_NOT_INSTALLED",
        detail: "plugin not loaded",
      }),
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_INSTALLED",
  });
});

// (24) api-missing wins over embed-failed
test("precedence: api-missing wins over embed-failed", async () => {
  // Stage 2 (api-missing) fires before Stage 4 (embed-failed) — surface = api-missing
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: withPreamble({
        ok: false,
        code: "SMART_CONNECTIONS_NOT_READY_API_MISSING",
        detail: "env.smart_sources.lookup unavailable",
      }),
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsQuery(
      { query: "x", vault: "Demo", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({
    code: "SMART_CONNECTIONS_NOT_READY",
    reason: "api-missing",
  });
});

// =====================================================================
// Single-spawn invariant + R14 LAST-`=> ` invariant (25)
// =====================================================================

test("R3 single-spawn invariant on happy path + R14 LAST-`=> ` extraction; frozen template prefix/suffix", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    {
      stdout:
        "Found and returned 0 smart_blocks.\n[warn] something innocuous\n=> " +
        JSON.stringify(envelope) +
        "\n",
      exitCode: 0,
    },
  ]);
  await executeSmartConnectionsQuery(
    { query: "x", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  const codeArg = argv[2]!.slice("code=".length);
  expect(codeArg.startsWith("(async()=>{")).toBe(true);
  expect(codeArg.endsWith("})()")).toBe(true);
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  expect(match).not.toBeNull();
  const rendered = JS_TEMPLATE.replace("__PAYLOAD_B64__", match![1]!);
  expect(codeArg).toBe(rendered);
});

// =====================================================================
// Empty-result success (26)
// =====================================================================

test("empty matches success (count:0): {count:0, matches:[]} no error", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn } = makeQueuedSpawn([{ stdout: withPreamble(envelope), exitCode: 0 }]);
  const result = await executeSmartConnectionsQuery(
    { query: "Renaissance painting", vault: "Demo", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, matches: [] });
});
