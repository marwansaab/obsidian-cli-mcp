// Original — no upstream. pattern_search handler tests.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { executePatternSearch } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

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

interface OkEnv {
  ok: true;
  count: number;
  matches: Array<{ path: string; line: number; offset: number; match: string; text: string }>;
  truncated?: true;
}

function okEnv(env: Omit<OkEnv, "ok">): string {
  const body: OkEnv = { ok: true, ...env };
  return `=> ${JSON.stringify(body)}\n`;
}

function folderNotFoundEnv(folder: string): string {
  return `=> ${JSON.stringify({ ok: false, code: "FOLDER_NOT_FOUND", folder })}\n`;
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// US1 happy paths
// =====================================================================

// (1) BI-token cross-reference happy path
test("US1 (1) happy: 3-match envelope round-trips with (path, line, offset) sort", async () => {
  const matches = [
    { path: "a.md", line: 1, offset: 0, match: "BI-0042", text: "BI-0042" },
    { path: "a.md", line: 2, offset: 0, match: "BI-0043", text: "BI-0043" },
    { path: "b.md", line: 1, offset: 13, match: "BI-0099", text: "Reference to BI-0099 in line." },
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 3, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "BI-\\d{4}", vault: "Demo" }, deps(spawnFn));
  expect(r.count).toBe(3);
  expect(r.matches).toEqual(matches);
  expect(r.truncated).toBeUndefined();
});

// (2) zero-match envelope = empty success
test("US1 (2) zero-match envelope → { count:0, matches:[] }", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "Z{50}", vault: "Demo" }, deps(spawnFn));
  expect(r).toEqual({ count: 0, matches: [] });
});

// (3) multi-match per line, sorted by offset ascending
test("US1 (3) multi-match per line: 3 entries differing only in offset, sorted asc", async () => {
  const line = "foo and foo again and foo";
  const matches = [
    { path: "m.md", line: 1, offset: 0, match: "foo", text: line },
    { path: "m.md", line: 1, offset: 22, match: "foo", text: line },
    { path: "m.md", line: 1, offset: 8, match: "foo", text: line },
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 3, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "foo", vault: "Demo" }, deps(spawnFn));
  expect(r.matches.map((m) => m.offset)).toEqual([0, 8, 22]);
});

// (4) cross-file matches sorted by path UTF-16 first
test("US1 (4) cross-file matches sorted by path UTF-16 ascending", async () => {
  const matches = [
    { path: "z.md", line: 1, offset: 0, match: "x", text: "x" },
    { path: "a.md", line: 99, offset: 5, match: "x", text: "x" },
    { path: "m.md", line: 2, offset: 0, match: "x", text: "x" },
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 3, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn));
  expect(r.matches.map((m) => m.path)).toEqual(["a.md", "m.md", "z.md"]);
});

// =====================================================================
// US1 line-cap (R10 / Q2)
// =====================================================================

// (5) line ≤ 500 chars → text verbatim
test("US1 (5) line ≤ 500 chars → text returned verbatim", async () => {
  const line = "a".repeat(500);
  const matches = [{ path: "x.md", line: 1, offset: 0, match: "a", text: line }];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "a", vault: "Demo" }, deps(spawnFn));
  expect(r.matches[0]!.text.length).toBe(500);
  expect(r.matches[0]!.text).toBe(line);
});

// (6) line > 500 chars → text.length === 501 (500 + …)
test("US1 (6) line > 500 chars → text.length === 501 (500 + …)", async () => {
  const text = "a".repeat(500) + "…";
  const matches = [{ path: "x.md", line: 1, offset: 0, match: "a", text }];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "a", vault: "Demo" }, deps(spawnFn));
  expect(r.matches[0]!.text.length).toBe(501);
  expect(r.matches[0]!.text.endsWith("…")).toBe(true);
});

// (7) match begins past 500 → text is clipped prefix + …, match intact
test("US1 (7) match starts past 500-cap → match intact, text clipped", async () => {
  const text = "x".repeat(500) + "…";
  const matches = [{ path: "long.md", line: 1, offset: 540, match: "needle", text }];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "needle", vault: "Demo" }, deps(spawnFn));
  expect(r.matches[0]!.match).toBe("needle");
  expect(r.matches[0]!.offset).toBe(540);
  expect(r.matches[0]!.text.length).toBe(501);
});

// =====================================================================
// US1 zero-length skip (R8 / Q3)
// =====================================================================

// (8) zero-entries envelope for ^ — wrapper returns empty success
test("US1 (8) zero-length-skip envelope → empty success", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "^", vault: "Demo" }, deps(spawnFn));
  expect(r).toEqual({ count: 0, matches: [] });
});

// (9) envelope carrying one non-empty match alongside template-side dropped zero-widths
test("US1 (9) one non-empty match survives zero-length skip → wrapper carries it through", async () => {
  const matches = [{ path: "x.md", line: 1, offset: 5, match: "foo", text: "abcdefoo" }];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "foo|^", vault: "Demo" }, deps(spawnFn));
  expect(r.matches).toEqual(matches);
});

// =====================================================================
// US1 truncation (R9 / R3)
// =====================================================================

// (10) 1000 entries + truncated:true (implicit cap fire)
test("US1 (10) 1000 entries + truncated:true (implicit cap fire)", async () => {
  const matches = Array.from({ length: 1000 }, (_, i) => ({
    path: `f${String(i).padStart(4, "0")}.md`,
    line: 1,
    offset: 0,
    match: "x",
    text: "x",
  }));
  const { spawnFn } = makeQueuedSpawn([
    { stdout: okEnv({ count: 1000, matches, truncated: true }), exitCode: 0 },
  ]);
  const r = await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn));
  expect(r.count).toBe(1000);
  expect(r.truncated).toBe(true);
});

// (11) 50 entries + truncated + explicit limit:50 → decoded payload carries limit:50
test("US1 (11) explicit limit:50 — decoded payload carries limit:50; truncated:true", async () => {
  const matches = Array.from({ length: 50 }, (_, i) => ({
    path: `f${String(i).padStart(4, "0")}.md`,
    line: 1,
    offset: 0,
    match: "x",
    text: "x",
  }));
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 50, matches, truncated: true }), exitCode: 0 },
  ]);
  const r = await executePatternSearch(
    { pattern: "x", vault: "Demo", limit: 50 },
    deps(spawnFn),
  );
  expect(r.count).toBe(50);
  expect(r.truncated).toBe(true);
  const payload = decodePayload(recorded[0]!.argv) as { limit: number };
  expect(payload.limit).toBe(50);
});

// (12) 5000 entries, no truncated, explicit limit:5000 — truncated absent
test("US1 (12) explicit limit:5000 — underlying set fits → truncated ABSENT", async () => {
  const matches = Array.from({ length: 5000 }, (_, i) => ({
    path: `f${String(i).padStart(5, "0")}.md`,
    line: 1,
    offset: 0,
    match: "x",
    text: "x",
  }));
  const { spawnFn } = makeQueuedSpawn([
    { stdout: okEnv({ count: 5000, matches }), exitCode: 0 },
  ]);
  const r = await executePatternSearch(
    { pattern: "x", vault: "Demo", limit: 5000 },
    deps(spawnFn),
  );
  expect(r.count).toBe(5000);
  expect(r.truncated).toBeUndefined();
});

// =====================================================================
// US1 error paths
// =====================================================================

// (13) closed-but-registered vault → CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason:not-open)
test("US1 (13) closed-but-registered vault: empty stdout + vault in registry → VAULT_NOT_FOUND(not-open)", async () => {
  const registry = "TestVault\tC:\\Vaults\\TestVault\nThe Setup\tD:\\Vaults\\The Setup\n";
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 },
    { stdout: registry, exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executePatternSearch({ pattern: "x", vault: "The Setup" }, deps(spawnFn)),
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

// (14) unknown vault — cli-adapter classifier → CLI_REPORTED_ERROR with "Vault not found."
test("US1 (14) unknown vault: 'Vault not found.' stdout → CLI_REPORTED_ERROR propagated verbatim", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executePatternSearch({ pattern: "x", vault: "NoSuchVault" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (15) malformed JSON stdout → CLI_REPORTED_ERROR(stage: json-parse)
test("US1 (15) stdout 'not valid json' → CLI_REPORTED_ERROR(stage:json-parse)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not valid json\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "json-parse" });
});

// (16) envelope-schema mismatch (unknown extra key) → CLI_REPORTED_ERROR(stage: envelope-parse)
test("US1 (16) extra key in envelope → CLI_REPORTED_ERROR(stage:envelope-parse)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"count":0,"matches":[],"surprise":"extra"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "envelope-parse" });
});

// (17) output-cap kill — CLI process killed; expects CLI_NON_ZERO_EXIT propagation
test("US1 (17) non-zero exit (10 MiB output cap kill) → CLI_NON_ZERO_EXIT propagated", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "", stderr: "killed", exitCode: 1 }]);
  const err = (await captureRejection(
    executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// =====================================================================
// US2 folder scope
// =====================================================================

// (18) folder happy
test("US2 (18) folder happy: payload carries folder verbatim", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch(
    { pattern: "x", folder: "Projects", vault: "Demo" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { folder: string };
  expect(payload.folder).toBe("Projects");
});

// (19) folder normalisation (slashes stripped)
test("US2 (19) folder '/Projects/' → payload carries 'Projects'", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch(
    { pattern: "x", folder: "/Projects/", vault: "Demo" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { folder: string };
  expect(payload.folder).toBe("Projects");
});

// (20) folder normalisation empty post-strip
test("US2 (20) folder '/' → payload carries folder:null (whole-vault scan)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch(
    { pattern: "x", folder: "/", vault: "Demo" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { folder: unknown };
  expect(payload.folder).toBeNull();
});

// (21) folder-not-found envelope → CLI_REPORTED_ERROR(FOLDER_NOT_FOUND)
test("US2 (21) FOLDER_NOT_FOUND envelope → CLI_REPORTED_ERROR(details.code:FOLDER_NOT_FOUND)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: folderNotFoundEnv("NoSuchFolder"), exitCode: 0 }]);
  const err = (await captureRejection(
    executePatternSearch(
      { pattern: "x", folder: "NoSuchFolder", vault: "Demo" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "FOLDER_NOT_FOUND",
    folder: "NoSuchFolder",
    stage: "handler-stage-3",
  });
});

// =====================================================================
// US3 case-sensitivity
// =====================================================================

// (22) default omitted → payload case_sensitive:true (FR-007 default flip)
test("US3 (22) default omitted → payload carries case_sensitive:true", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn));
  const payload = decodePayload(recorded[0]!.argv) as { case_sensitive: boolean };
  expect(payload.case_sensitive).toBe(true);
});

// (23) explicit case_sensitive:true → payload case_sensitive:true
test("US3 (23) explicit case_sensitive:true → payload carries true", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch(
    { pattern: "x", case_sensitive: true, vault: "Demo" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { case_sensitive: boolean };
  expect(payload.case_sensitive).toBe(true);
});

// (24) explicit case_sensitive:false → payload case_sensitive:false
test("US3 (24) explicit case_sensitive:false → payload carries false", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch(
    { pattern: "x", case_sensitive: false, vault: "Demo" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { case_sensitive: boolean };
  expect(payload.case_sensitive).toBe(false);
});

// =====================================================================
// Structural data-passing (R12 anti-injection)
// =====================================================================

// (25) base64 anti-injection structural lock
test("R12 (25) anti-injection: caller-supplied values appear ONLY inside decoded base64 payload", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch(
    {
      pattern: "});malicious()/*",
      folder: "Projects",
      case_sensitive: false,
      limit: 42,
      vault: "Demo",
    },
    deps(spawnFn),
  );
  const argv = recorded[0]!.argv;
  const codeArg = argv.find((a) => a.startsWith("code="))!;
  // Caller values must NOT appear as raw text outside the base64 atob substring.
  // Strip the base64 substring before scanning.
  const m = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg)!;
  const b64 = m[1]!;
  const codeWithoutB64 = codeArg.replace(b64, "");
  expect(codeWithoutB64).not.toContain("});malicious()/*");
  expect(codeWithoutB64).not.toContain("Projects");
  // Frozen template prefix + suffix preserved
  expect(codeArg).toContain("(async()=>{");
  expect(codeArg).toContain("})()");
  // Decoded payload carries the values verbatim
  const payload = decodePayload(argv) as Record<string, unknown>;
  expect(payload).toEqual({
    pattern: "});malicious()/*",
    folder: "Projects",
    case_sensitive: false,
    limit: 42,
  });
});

// =====================================================================
// Deterministic + invariants
// =====================================================================

// (26) byte-identical repeated call
test("SC-003 (26) byte-identical repeated call: same envelope → JSON.stringify equal", async () => {
  const matches = [{ path: "a.md", line: 1, offset: 0, match: "x", text: "x" }];
  const { spawnFn: s1 } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const { spawnFn: s2 } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const r1 = await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(s1));
  const r2 = await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(s2));
  expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
});

// (27) sort invariant
test("(27) unsorted envelope matches → response sorted (path, line, offset) ascending", async () => {
  const matches = [
    { path: "b.md", line: 5, offset: 3, match: "x", text: "x" },
    { path: "a.md", line: 2, offset: 9, match: "x", text: "x" },
    { path: "a.md", line: 2, offset: 1, match: "x", text: "x" },
    { path: "a.md", line: 1, offset: 0, match: "x", text: "x" },
  ];
  const { spawnFn } = makeQueuedSpawn([
    { stdout: okEnv({ count: 4, matches }), exitCode: 0 },
  ]);
  const r = await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn));
  expect(r.matches.map((m) => `${m.path}#${m.line}:${m.offset}`)).toEqual([
    "a.md#1:0",
    "a.md#2:1",
    "a.md#2:9",
    "b.md#5:3",
  ]);
});

// (28) response-key-set invariant + locator no-echo
test("(28) response key invariant: non-truncated={count,matches}; truncated={count,matches,truncated}; locator NEVER echoed", async () => {
  // non-truncated
  const { spawnFn: s1 } = makeQueuedSpawn([{ stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 }]);
  const r1 = await executePatternSearch(
    { pattern: "x", folder: "P", vault: "V" },
    deps(s1),
  );
  expect(Object.keys(r1).sort()).toEqual(["count", "matches"]);
  expect(JSON.stringify(r1)).not.toContain("pattern");
  expect(JSON.stringify(r1)).not.toContain("vault");
  expect(JSON.stringify(r1)).not.toContain("folder");

  // truncated
  const { spawnFn: s2 } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [], truncated: true }), exitCode: 0 },
  ]);
  const r2 = await executePatternSearch({ pattern: "x", vault: "V" }, deps(s2));
  expect(Object.keys(r2).sort()).toEqual(["count", "matches", "truncated"]);
});

// =====================================================================
// Spec edge-cases + explicit structural locks (analyse 2026-05-17 C1-C7)
// =====================================================================

// (29) FR-013 plain-text scanning — match inside fenced code block returned verbatim
test("C1 (29) FR-013: match inside fenced code block passed through verbatim", async () => {
  const matches = [
    { path: "Docs.md", line: 7, offset: 4, match: "TODO", text: "    TODO inside code fence" },
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "TODO", vault: "Demo" }, deps(spawnFn));
  expect(r.matches).toEqual(matches);
});

// (30) match spans entire line
test("C2 (30) match spans entire line: match === text, both populated, neither truncated", async () => {
  const matches = [
    { path: "Short.md", line: 1, offset: 0, match: "exact-full-line", text: "exact-full-line" },
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 1, matches }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "exact-full-line", vault: "Demo" }, deps(spawnFn));
  expect(r.matches[0]!.match).toBe(r.matches[0]!.text);
});

// (31) FR-012 line-scoped guarantee
test("C3 (31) FR-012 line-scoped: 'foo\\nbar' pattern against per-line split → zero matches, not error", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 }]);
  const r = await executePatternSearch({ pattern: "foo\\nbar", vault: "Demo" }, deps(spawnFn));
  expect(r).toEqual({ count: 0, matches: [] });
});

// (32) valid folder, empty result — distinguishable from folder-not-found
test("C4 (32) valid-folder-empty: payload carries folder, response is empty success, NOT FOLDER_NOT_FOUND", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  const r = await executePatternSearch(
    { pattern: "x", folder: "EmptyDir", vault: "Demo" },
    deps(spawnFn),
  );
  expect(r).toEqual({ count: 0, matches: [] });
  expect(r).not.toHaveProperty("truncated");
  const payload = decodePayload(recorded[0]!.argv) as { folder: string };
  expect(payload.folder).toBe("EmptyDir");
});

// (33) FR-007 case-insensitive behavioural pass-through
test("C5 (33) case_sensitive:false envelope carries case-mixed entries → wrapper passes through unchanged", async () => {
  const matches = [
    { path: "P.md", line: 1, offset: 0, match: "TODO", text: "TODO upper" },
    { path: "P.md", line: 2, offset: 0, match: "todo", text: "todo lower" },
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv({ count: 2, matches }), exitCode: 0 }]);
  const r = await executePatternSearch(
    { pattern: "todo", case_sensitive: false, vault: "Demo" },
    deps(spawnFn),
  );
  expect(r.matches.map((m) => m.match)).toEqual(["TODO", "todo"]);
});

// (34) FR-015 read-only structural lock — static-source assertion on JS_TEMPLATE
test("C7 (34) FR-015 read-only: JS_TEMPLATE contains NO mutating Obsidian API call substrings", () => {
  const forbidden = [
    "app.vault.modify",
    "app.vault.create",
    "app.vault.delete",
    "app.vault.adapter.write",
    "app.vault.adapter.remove",
    "app.fileManager.renameFile",
  ];
  for (const substr of forbidden) {
    expect(JS_TEMPLATE).not.toContain(substr);
  }
});

// =====================================================================
// Single-spawn invariant + argv shape (per-test guards reused by many cases)
// =====================================================================

test("R2 single-spawn invariant: exactly one invokeCli call for happy path", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn));
  expect(getCount()).toBe(1);
});

test("dispatch shape: argv contains 'eval', vault=Demo, code= with atob", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv({ count: 0, matches: [] }), exitCode: 0 },
  ]);
  await executePatternSearch({ pattern: "x", vault: "Demo" }, deps(spawnFn));
  expect(recorded[0]!.argv).toContain("eval");
  expect(recorded[0]!.argv).toContain("vault=Demo");
  const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="))!;
  expect(codeArg).toContain("atob");
});
