// Original — no upstream. Tests for the smart_connections_similar handler — single-call argv assembly (with stage-0 closed-vault detection adding a second `vaults` spawn), base64 payload round-trip (R6 anti-injection lock), eval envelope parsing with => prefix, per-match shape transforms (source-level / nested-heading / frontmatter-sentinel / fallback {key, score}), non-finite-score filter (R10/Q2), source-path-keyed self-exclusion (R9/FR-010), three-level sort with secondary path-byte-asc + tertiary headingPath.join('#')-byte-asc tiebreak (R8/FR-008), cross-mode count invariant (FR-006a), limit cap, eight envelope error codes via R13 mapping table, FR-017b precedence-chain compound fixtures, json-parse / envelope-parse failures, cap-kill propagation.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { executeSmartConnectionsSimilar } from "./handler.js";
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

// Input with limit:20 default applied (the handler is called with already-validated
// input by registerTool in production, so test fixtures replicate that contract).
const defaultLimit = 20;

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// Happy paths (cases 1–6)
// =====================================================================

// (1) specific + path + mixed block-level matches → multi-entry response
test("specific + path + mixed block-level matches: multi-entry response with correct path/headingPath/score (US1 happy)", async () => {
  const envelope = {
    ok: true,
    count: 4,
    matches: [
      { path: "Topics/AI.md", headingPath: ["Overview"], score: 0.91 },
      { path: "Topics/AI.md", headingPath: ["History", "1956"], score: 0.85 },
      { path: "Notes/ML.md", headingPath: [], score: 0.78 },
      { path: "Bibliography.md", headingPath: ["---frontmatter---"], score: 0.7 },
    ],
  };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "Source/Note.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 4, matches: envelope.matches });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  expect(argv[2]!.startsWith("code=")).toBe(true);
  expect(decodePayload(argv)).toEqual({
    active: false,
    path: "Source/Note.md",
    file: null,
    limit: 20,
    total: false,
  });
});

// (2) specific + file (basename) resolves via getFirstLinkpathDest path
test("specific + file (basename): payload carries file=<basename>, path=null", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", file: "brief", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, matches: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: null,
    file: "brief",
    limit: 20,
    total: false,
  });
});

// (3) specific + path + total:true → count-only response
test("specific + path + total:true: returns {count:N, matches:[]} (US4)", async () => {
  const envelope = { ok: true, count: 7, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    {
      target_mode: "specific",
      vault: "Demo",
      path: "x.md",
      limit: defaultLimit,
      total: true,
    },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 7, matches: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: "x.md",
    file: null,
    limit: 20,
    total: true,
  });
});

// (4) specific + path + empty matches envelope → {count:0, matches:[]} no error (FR-011)
test("specific + path + empty matches envelope: returns {count:0, matches:[]} no error (FR-011)", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "empty.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, matches: [] });
});

// (5) active + focused-file fixture
test("active + focused-file: argv has no vault= AND payload active=true (US2)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Other.md", headingPath: [], score: 0.6 }],
  };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "active", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.count).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv[0]).toBe("eval");
  expect(decodePayload(argv)).toEqual({
    active: true,
    path: null,
    file: null,
    limit: 20,
    total: false,
  });
});

// (6) active + total:true → count-only response
test("active + total:true: count-only response (US4)", async () => {
  const envelope = { ok: true, count: 12, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "active", limit: defaultLimit, total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 12, matches: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: true,
    path: null,
    file: null,
    limit: 20,
    total: true,
  });
});

// =====================================================================
// Per-match shape transforms — passthrough; the eval JS does the work
// (cases 7–12)
// =====================================================================

// (7) source-level match key (no #) → headingPath:[]
test("source-level match: headingPath:[] (R7/F4)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Folder/Note.md", headingPath: [], score: 0.85 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches[0]).toEqual({
    path: "Folder/Note.md",
    headingPath: [],
    score: 0.85,
  });
});

// (8) single-segment heading match → headingPath:["Heading"]
test("single-segment heading match: headingPath:['Heading'] (R7/F4)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Folder/Note.md", headingPath: ["Heading"], score: 0.8 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches[0]!.headingPath).toEqual(["Heading"]);
});

// (9) multi-segment heading match → headingPath:["H1","H2","H3"]
test("multi-segment heading match: headingPath:['H1','H2','H3'] (R7/F4)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Folder/Note.md", headingPath: ["H1", "H2", "H3"], score: 0.75 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches[0]!.headingPath).toEqual(["H1", "H2", "H3"]);
});

// (10) frontmatter-block match → headingPath:["---frontmatter---"] verbatim (F6)
test("frontmatter-block match: headingPath preserves '---frontmatter---' sentinel verbatim (F6)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [
      { path: "Folder/Note.md", headingPath: ["---frontmatter---"], score: 0.7 },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches[0]!.headingPath).toEqual(["---frontmatter---"]);
});

// (11) non-finite-score filter — wrapper passes through whatever envelope contains;
// the strict envelope schema requires finite scores so the eval JS filter is the
// guard. A stub envelope containing a non-finite score will fail envelope-parse;
// the test verifies the schema-level rejection, demonstrating the filter is the
// only path by which finite-only entries reach the handler output.
test("non-finite-score entry in envelope: envelope-parse failure (R10/Q2 — eval filter is the guard)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Folder/Note.md", headingPath: [], score: null }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// (12) per-match three-field exhaustive shape (FR-007 SC-007a)
test("per-match three-field exhaustive shape: only path / headingPath / score keys (FR-007 / SC-007a)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Folder/Note.md", headingPath: ["H1"], score: 0.9 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  const keys = Object.keys(result.matches[0]!).sort();
  expect(keys).toEqual(["headingPath", "path", "score"]);
});

// =====================================================================
// Sort + self-exclusion (cases 13–16) — wrapper passes envelope through;
// the eval JS performs the sort + filter, so these tests verify the
// envelope shape that the handler accepts.
// =====================================================================

// (13) score-tie + path-tiebreak
test("score-tie: response orders by path byte-asc (secondary tiebreak / FR-008)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    matches: [
      { path: "AAA.md", headingPath: [], score: 0.5 },
      { path: "BBB.md", headingPath: [], score: 0.5 },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches.map((m) => m.path)).toEqual(["AAA.md", "BBB.md"]);
});

// (14) score-tie + path-tie + headingPath-tiebreak
test("score-tie + path-tie: response orders by headingPath.join('#') byte-asc (tertiary tiebreak)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    matches: [
      { path: "Same.md", headingPath: ["A"], score: 0.5 },
      { path: "Same.md", headingPath: ["B"], score: 0.5 },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches.map((m) => m.headingPath.join("#"))).toEqual(["A", "B"]);
});

// (15) self-exclusion source-level — wrapper passes envelope through; the in-eval
// .filter(m=>m.path!==sourcePath) excludes the source entry, so a well-formed
// envelope will simply omit it. Verify by stub envelope containing entries with
// distinct paths from the source.
test("self-exclusion source-level: source entry absent from response (R9/FR-010)", async () => {
  // envelope reflects the post-eval-filter state (source NOT present)
  const envelope = {
    ok: true,
    count: 1,
    matches: [{ path: "Other.md", headingPath: [], score: 0.5 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "Source.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(result.matches.map((m) => m.path)).not.toContain("Source.md");
});

// (16) self-exclusion block-inside-source: envelope reflects the post-eval-filter
// state where ALL block-inside-source entries have been removed
test("self-exclusion block-inside-source: all entries with path === sourcePath absent from response (R9/FR-010/SC-006)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    matches: [
      { path: "Other.md", headingPath: [], score: 0.6 },
      { path: "Different.md", headingPath: ["H1"], score: 0.5 },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "Source.md", limit: defaultLimit },
    deps(spawnFn),
  );
  for (const m of result.matches) {
    expect(m.path).not.toBe("Source.md");
  }
});

// =====================================================================
// Cross-mode invariant + limit (cases 17–19)
// =====================================================================

// (17) cross-mode invariant: count_false === count_true on same fixture
test("cross-mode invariant: count_false === count_true on identical fixture (FR-006a / R3)", async () => {
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
    { stdout: `=> ${JSON.stringify(envelopeFull)}\n`, exitCode: 0 },
  ]);
  const { spawnFn: spawn2 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelopeTotal)}\n`, exitCode: 0 },
  ]);
  const r1 = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit, total: false },
    deps(spawn1),
  );
  const r2 = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit, total: true },
    deps(spawn2),
  );
  expect(r1.count).toBe(r2.count);
  expect(r1.count).toBe(N);
  expect(r1.matches.length).toBe(N);
  expect(r2.matches.length).toBe(0);
});

// (18) limit:5 honoured — payload carries limit:5 verbatim
test("limit:5: payload carries limit:5 (FR-006 / SC-017)", async () => {
  const envelope = {
    ok: true,
    count: 5,
    matches: [
      { path: "A.md", headingPath: [], score: 0.9 },
      { path: "B.md", headingPath: [], score: 0.8 },
      { path: "C.md", headingPath: [], score: 0.7 },
      { path: "D.md", headingPath: [], score: 0.6 },
      { path: "E.md", headingPath: [], score: 0.5 },
    ],
  };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: 5 },
    deps(spawnFn),
  );
  expect(result.matches.length).toBe(5);
  const payload = decodePayload(recorded[0]!.argv) as { limit: number };
  expect(payload.limit).toBe(5);
});

// (19) limit:100 upper boundary — payload carries limit:100 verbatim
test("limit:100 (upper boundary): payload carries limit:100", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: 100 },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { limit: number };
  expect(payload.limit).toBe(100);
});

// =====================================================================
// Error paths (cases 20–28)
// =====================================================================

// (20) unknown vault — cli-adapter 011-R5 surfaces 'Vault not found.'
test("unknown vault: 'Vault not found.' stdout → CLI_REPORTED_ERROR (R5 / FR-017)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "NoSuchVault", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (21) closed-but-registered vault — empty stdout + exit 0 + vault registered
test("closed-but-registered vault: empty stdout + registered vault → CLI_REPORTED_ERROR(reason:'not-open') (R5a / FR-017a / SC-011a)", async () => {
  const vaultsListStdout =
    "TestVault-Obsidian-CLI-MCP\tC:\\\\Vaults\\\\TestVault\nThe Setup\tD:\\\\Vaults\\\\The Setup\nWays of Working\tE:\\\\Vaults\\\\Ways of Working\n";
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 }, // first call: empty stdout from eval
    { stdout: vaultsListStdout, exitCode: 0 }, // second call: vaults list confirming registration
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "The Setup", path: "x.md", limit: defaultLimit },
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

// (22) unresolved path → envelope FILE_NOT_FOUND
test("unresolved path: envelope FILE_NOT_FOUND → CLI_REPORTED_ERROR (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: missing.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "missing.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FILE_NOT_FOUND",
    detail: "path: missing.md",
  });
});

// (23) unresolved file (basename) → envelope FILE_NOT_FOUND with wikilink: detail
test("unresolved file (basename): envelope FILE_NOT_FOUND with wikilink: detail (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"wikilink: ghost"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", file: "ghost", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FILE_NOT_FOUND",
    detail: "wikilink: ghost",
  });
});

// (24) .canvas / non-md → envelope NOT_MARKDOWN
test("non-.md target: envelope NOT_MARKDOWN → CLI_REPORTED_ERROR (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NOT_MARKDOWN","detail":"path: Sandbox/board.canvas extension: canvas"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      {
        target_mode: "specific",
        vault: "Demo",
        path: "Sandbox/board.canvas",
        limit: defaultLimit,
      },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "envelope-error", code: "NOT_MARKDOWN" });
});

// (25) plugin not installed → envelope SMART_CONNECTIONS_NOT_INSTALLED
test("plugin not installed: envelope SMART_CONNECTIONS_NOT_INSTALLED → CLI_REPORTED_ERROR (FR-015 / SC-012)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_INSTALLED","detail":"plugin not loaded in vault: Demo"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_INSTALLED",
  });
});

// (26) plugin loaded but env.smart_sources undefined → envelope SMART_CONNECTIONS_NOT_READY
test("plugin not ready: envelope SMART_CONNECTIONS_NOT_READY → CLI_REPORTED_ERROR (FR-016 / SC-013)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_READY","detail":"env.smart_sources unavailable"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_READY",
  });
});

// (27) source not in env.smart_sources.items → envelope SOURCE_NOT_INDEXED
test("source not indexed: envelope SOURCE_NOT_INDEXED → CLI_REPORTED_ERROR (FR-014 / SC-009)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"SOURCE_NOT_INDEXED","detail":"Folder/Note.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "Folder/Note.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SOURCE_NOT_INDEXED",
  });
});

// (28) active + no focused file → envelope NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (T0.1 lock)
test("active + no focused file: envelope NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (T0.1 / BI-015 parity)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NO_ACTIVE_FILE","detail":"No note focused; switch to specific mode or focus a note."}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "active", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.details).toMatchObject({ stage: "envelope-error" });
});

// =====================================================================
// Parse failures (cases 29–30)
// =====================================================================

// (29) malformed eval stdout (non-JSON) → CLI_REPORTED_ERROR(stage:json-parse)
test("malformed JSON eval response → CLI_REPORTED_ERROR(stage:'json-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-valid-json{\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

// (30) envelope shape unknown → CLI_REPORTED_ERROR(stage:envelope-parse)
test("envelope shape unexpected → CLI_REPORTED_ERROR(stage:'envelope-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":true,"count":5,"matches":[],"surprise":"extra"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// =====================================================================
// FR-017b precedence-chain compound fixtures (cases 31–36)
// Each verifies the earlier-priority discriminator wins when multiple
// failure conditions could fire. The eval JS encodes the order at template
// source level; the handler tests verify the surface envelope code.
// =====================================================================

// (31) VAULT_NOT_FOUND(unknown) wins over VAULT_NOT_FOUND(not-open): unknown
// vault classifier fires upstream of the handler stage-0 detection branch
test("precedence: VAULT_NOT_FOUND(unknown) wins over VAULT_NOT_FOUND(not-open)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "NoSuchVault", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  // The cli-adapter's classifier does not attach details.reason='not-open'
  expect(err.details.reason).not.toBe("not-open");
});

// (32) VAULT_NOT_FOUND(not-open) wins over SMART_CONNECTIONS_NOT_INSTALLED:
// the stage-0 detection fires from empty stdout + registered vault, the eval
// never runs to evaluate the plugin lifecycle check
test("precedence: VAULT_NOT_FOUND(not-open) wins over SMART_CONNECTIONS_NOT_INSTALLED", async () => {
  const vaultsListStdout = "The Setup\tD:\\\\Vaults\\\\The Setup\n";
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 },
    { stdout: vaultsListStdout, exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "The Setup", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({
    code: "VAULT_NOT_FOUND",
    reason: "not-open",
  });
});

// (33) SMART_CONNECTIONS_NOT_INSTALLED wins over FILE_NOT_FOUND: in-eval the
// plugin check happens before file resolution; envelope carries NOT_INSTALLED
test("precedence: SMART_CONNECTIONS_NOT_INSTALLED wins over FILE_NOT_FOUND", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_INSTALLED","detail":"plugin not loaded"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "nonexistent.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_INSTALLED",
  });
});

// (34) FILE_NOT_FOUND wins over NOT_MARKDOWN: the file resolution stage
// fires before the extension check, so a non-existent .canvas surfaces as
// FILE_NOT_FOUND not NOT_MARKDOWN
test("precedence: FILE_NOT_FOUND wins over NOT_MARKDOWN", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: nonexistent.canvas"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      {
        target_mode: "specific",
        vault: "Demo",
        path: "nonexistent.canvas",
        limit: defaultLimit,
      },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FILE_NOT_FOUND",
  });
});

// (35) NOT_MARKDOWN wins over SMART_CONNECTIONS_NOT_READY: the extension
// guard fires before plugin-readiness; .canvas surfaces NOT_MARKDOWN even
// when env.smart_sources is missing
test("precedence: NOT_MARKDOWN wins over SMART_CONNECTIONS_NOT_READY", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NOT_MARKDOWN","detail":"path: board.canvas extension: canvas"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "board.canvas", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "NOT_MARKDOWN",
  });
});

// (36) SMART_CONNECTIONS_NOT_READY wins over SOURCE_NOT_INDEXED: the readiness
// check fires before per-source lookup
test("precedence: SMART_CONNECTIONS_NOT_READY wins over SOURCE_NOT_INDEXED", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_READY","detail":"env.smart_sources unavailable"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_READY",
  });
});

// =====================================================================
// Argv / payload invariants (cases 37–38)
// =====================================================================

// (37) base64 payload round-trip — verbatim user input including hostile bytes
test("R6 anti-injection: base64 payload round-trips verbatim incl. hostile bytes", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const hostilePath = "Sandbox/Tricky\"); doSomething(); //.md";
  await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: hostilePath, limit: defaultLimit },
    deps(spawnFn),
  );
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  const codeArg = argv[2]!.slice("code=".length);
  expect(codeArg).not.toContain(hostilePath); // raw path never in source
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  expect(match).not.toBeNull();
  const payload = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf-8"));
  expect(payload).toEqual({
    active: false,
    path: hostilePath,
    file: null,
    limit: 20,
    total: false,
  });
});

// (38) single invokeCli per request + frozen template prefix/suffix + only b64
// region varies (R3 / R6 / R12)
test("R3 single-call invariant: one spawn per request; frozen template prefix/suffix; only b64 region varies", async () => {
  const envelope = { ok: true, count: 0, matches: [] };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  await executeSmartConnectionsSimilar(
    { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
    deps(spawnFn),
  );
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  const codeArg = argv[2]!.slice("code=".length);
  // Frozen template prefix (async IIFE)
  expect(codeArg.startsWith("(async()=>{")).toBe(true);
  expect(codeArg.endsWith("})()")).toBe(true);
  // The rendered code differs from JS_TEMPLATE only by the b64 substitution
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  expect(match).not.toBeNull();
  expect(/^[A-Za-z0-9+/=]+$/.test(match![1]!)).toBe(true);
  const rendered = JS_TEMPLATE.replace("__PAYLOAD_B64__", match![1]!);
  expect(codeArg).toBe(rendered);
});

// =====================================================================
// BI-027 ripple regression cases (39–41) — per FR-013a + FR-020a
// =====================================================================

// (39) details.reason: "api-missing" emission on env.smart_sources undefined path
// (cohort-consistency with BI-027's SMART_CONNECTIONS_NOT_READY emissions per
// ADR-015 worked-example pattern)
test("BI-027 ripple: details.reason:'api-missing' on env.smart_sources undefined path", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_READY","detail":"env.smart_sources unavailable"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
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

// (40) details.reason: "api-missing" emission on the find_connections method-missing path
// (same envelope code from the eval template's stage-4 readiness check; the wrapper does
// not distinguish at the wire — both surface "api-missing" by handler convention)
test("BI-027 ripple: details.reason:'api-missing' on find_connections method-missing path", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_READY","detail":"smart_sources.items[<key>].find_connections not a function"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "Demo", path: "x.md", limit: defaultLimit },
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

// (41) Behaviour-preservation regression on refactored stage-0 closed-vault detection.
// After swapping the inline isVaultRegistered helper for the shared
// `_eval-vault-closed-detection` module, the closed-vault path must emit a byte-equal
// error response (same code / details / message) as before the refactor.
test("BI-027 ripple: stage-0 closed-vault detection produces byte-equal error after shared-module refactor", async () => {
  const vaultsListStdout = "The Setup\tD:\\\\Vaults\\\\The Setup\n";
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 },
    { stdout: vaultsListStdout, exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeSmartConnectionsSimilar(
      { target_mode: "specific", vault: "The Setup", path: "x.md", limit: defaultLimit },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual({
    code: "VAULT_NOT_FOUND",
    reason: "not-open",
    stage: "handler-stage-0",
    vault: "The Setup",
  });
  expect(err.message).toBe(
    'Vault "The Setup" is registered but not currently open in Obsidian; the CLI has begun opening it — retry after a brief delay.',
  );
  expect(getCount()).toBe(2);
});
