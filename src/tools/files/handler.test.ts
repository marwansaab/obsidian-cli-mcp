// Original — no upstream. Tests for the files handler — 28 cases per data-model.md handler-test inventory. Covers per-mode argv shape (single-spawn invariant R13), stdout parsing (R16), filter pipeline (FR-026 sub-folder defence-in-depth, FR-028 dotfile defence-in-depth, R6 non-recursive load-bearing), UTF-8 byte-compare lexical sort (R8/FR-027 — non-BMP differs from JS default), total flag wrapper-side discard (R7 — count parity across modes), trailing-slash + path-traversal CLI passthrough (F4/F15), and error propagation (R5 unknown-vault inheritance, CLI_BINARY_NOT_FOUND, CLI_NON_ZERO_EXIT, ERR_NO_ACTIVE_FILE).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeListFiles } from "./handler.js";
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
    child.pid = 9090;
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

// =================== Argv-shape tests (T008 — cases #1–#5) ===================

// (1) specific + folder + ext — argv shape; no `total` token ever
test("specific+folder+ext — argv [vault, files, folder, ext]; no total token; ONE spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "Inbox/a.md\n", exitCode: 0 }]);
  await executeListFiles(
    { target_mode: "specific", vault: "Demo", folder: "Inbox", ext: "md", total: true },
    deps(spawnFn),
  );
  expect(recorded).toHaveLength(1);
  const argv = recorded[0]!.argv;
  expect(argv).toContain("vault=Demo");
  expect(argv).toContain("files");
  expect(argv).toContain("folder=Inbox");
  expect(argv).toContain("ext=md");
  expect(argv).not.toContain("total");
});

// (2) specific + folder, no ext
test("specific+folder no-ext — argv [vault, files, folder]; ONE spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  await executeListFiles(
    { target_mode: "specific", vault: "Demo", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(recorded).toHaveLength(1);
  const argv = recorded[0]!.argv;
  expect(argv).toContain("vault=Demo");
  expect(argv).toContain("files");
  expect(argv).toContain("folder=Inbox");
  expect(argv).not.toContain("ext=");
});

// (3) specific, no folder
test("specific no-folder — argv [vault, files]; ONE spawn (vault-root listing)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  await executeListFiles({ target_mode: "specific", vault: "Demo" }, deps(spawnFn));
  expect(recorded).toHaveLength(1);
  const argv = recorded[0]!.argv;
  expect(argv).toContain("vault=Demo");
  expect(argv).toContain("files");
  expect(argv.some((a) => a.startsWith("folder="))).toBe(false);
});

// (4) active + folder — no vault prefix
test("active+folder — argv [files, folder] (no vault=); ONE spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  await executeListFiles({ target_mode: "active", folder: "Daily" }, deps(spawnFn));
  expect(recorded).toHaveLength(1);
  const argv = recorded[0]!.argv;
  expect(argv).toContain("files");
  expect(argv).toContain("folder=Daily");
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
});

// (5) active, no folder, no ext
test("active no-folder no-ext — argv [files]; ONE spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  await executeListFiles({ target_mode: "active" }, deps(spawnFn));
  expect(recorded).toHaveLength(1);
  const argv = recorded[0]!.argv;
  expect(argv).toContain("files");
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv.some((a) => a.startsWith("folder="))).toBe(false);
  expect(argv.some((a) => a.startsWith("ext="))).toBe(false);
});

// =================== Stdout-parsing + sort tests (T009 — cases #6–#11) ===================

// (6) stdout of 3 direct-child paths → sorted response
test("3-path stdout → { count: 3, paths: [lex-sorted] }", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/b.md\nInbox/c.md\nInbox/a.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 3, paths: ["Inbox/a.md", "Inbox/b.md", "Inbox/c.md"] });
});

// (7) unsorted stdout → lex-sorted response
test("unsorted stdout → UTF-8 byte-compare lex-sorted response", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/zeta.md\nInbox/alpha.md\nInbox/M.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox" },
    deps(spawnFn),
  );
  // UTF-8 byte-compare: capital letters precede lowercase
  expect(result.paths).toEqual(["Inbox/M.md", "Inbox/alpha.md", "Inbox/zeta.md"]);
});

// (8) non-BMP character stdout → UTF-8 byte order (differs from JS default UTF-16)
test("non-BMP character stdout — sort uses UTF-8 byte order, NOT JS default UTF-16", async () => {
  // Emoji 🍎 (U+1F34E) vs ñ (U+00F1) — in UTF-16 code-unit order ñ < 🍎 (because ñ's
  // single code unit 0x00F1 < emoji's surrogate-pair leading 0xD83C). In UTF-8 byte
  // order, ñ encodes as 0xC3 0xB1 (2 bytes starting with 0xC3) while 🍎 encodes as
  // 0xF0 0x9F 0x8D 0x8E (4 bytes starting with 0xF0). 0xC3 < 0xF0, so UTF-8 also
  // puts ñ before 🍎 — same order at this codepoint pair. Pick a clearer test:
  // compare "ñ" (0xC3 0xB1) vs "𐀀" (U+10000, UTF-8: 0xF0 0x90 0x80 0x80;
  // UTF-16: 0xD800 0xDC00). In UTF-16 code-unit order, 0xD800 < 0xC3B1 numerically
  // but JS compares code units lexically — "ñ" first byte 0x00F1 vs "𐀀" first
  // surrogate 0xD800: ñ (0x00F1) < 0xD800, so JS puts ñ first. UTF-8 byte: 0xC3 vs
  // 0xF0 — ñ also first. Same order. Need a tricky pair: compare "𠀀" (U+20000,
  // UTF-8 0xF0 0xA0 0x80 0x80) with "￿" (U+FFFF, UTF-8 0xEF 0xBF 0xBF).
  // UTF-16: "￿" is 0xFFFF, "𠀀" is 0xD840 0xDC00 — 0xD840 < 0xFFFF so JS puts
  // 𠀀 first. UTF-8: 0xF0 vs 0xEF — 0xEF < 0xF0 so byte-compare puts ￿ first.
  // DIFFERENT order.
  const bmpHighest = "￿.md"; // U+FFFF
  const nonBmp = "\u{20000}.md"; // U+20000 surrogate pair
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `${nonBmp}\n${bmpHighest}\n`, exitCode: 0 },
  ]);
  const result = await executeListFiles({ target_mode: "active" }, deps(spawnFn));
  // UTF-8 byte order puts ￿ first (0xEF…) before non-BMP \u{20000} (0xF0…)
  expect(result.paths).toEqual([bmpHighest, nonBmp]);
  // Sanity: assert JS default order would have differed
  const jsDefault = [bmpHighest, nonBmp].slice().sort();
  expect(jsDefault[0]).toBe(nonBmp);
});

// (9) empty stdout → { count: 0, paths: [] } (missing/empty/folder-names-a-file conflated)
test("empty stdout → { count: 0, paths: [] } — FR-010 conflated empty shape", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Missing" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
});

// (10) trailing-newline-only stdout → empty response
test("trailing-newline-only stdout '\\n' → empty response", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "\n", exitCode: 0 }]);
  const result = await executeListFiles({ target_mode: "active" }, deps(spawnFn));
  expect(result).toEqual({ count: 0, paths: [] });
});

// (11) mixed empty lines → empties dropped
test("mixed empty lines in stdout → empties dropped (R16)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/a.md\n\nInbox/b.md\n\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 2, paths: ["Inbox/a.md", "Inbox/b.md"] });
});

// =================== Filter pipeline tests (T016 — cases #12–#16, #20) ===================

// (12) recursive stdout → non-recursive filter drops sub-tree paths
test("recursive stdout — non-recursive filter drops sub-tree paths (R6 load-bearing)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: "Fixtures/BI-038/repro.md\nFixtures/BI-038/v0.2.9/us1.md\nFixtures/BI-038/v0.2.9/us2.md\n",
      exitCode: 0,
    },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Fixtures/BI-038" },
    deps(spawnFn),
  );
  // folder has 2 components, expected = 3; "Fixtures/BI-038/repro.md" (3) kept;
  // "Fixtures/BI-038/v0.2.9/us1.md" (4) dropped.
  expect(result.paths).toEqual(["Fixtures/BI-038/repro.md"]);
  expect(result.count).toBe(1);
});

// (13) sub-folder entry (path ending /) → dropped by FR-026 filter
test("sub-folder entry (path ending '/') → FR-026 filter drops it", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/a.md\nInbox/Sub/\nInbox/b.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 2, paths: ["Inbox/a.md", "Inbox/b.md"] });
});

// (14) dotfile entry (filename starting .) → dropped by FR-028
test("dotfile entry (filename starting '.') → FR-028 filter drops it", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/a.md\nInbox/.hidden.md\nInbox/b.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 2, paths: ["Inbox/a.md", "Inbox/b.md"] });
});

// (15) path with dot-prefixed sub-component → dropped (any segment, not just leaf)
test("path with dot-prefixed sub-component → FR-028 filter drops (any segment)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/visible.md\nInbox/.hidden/file.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox" },
    deps(spawnFn),
  );
  // ".hidden/file.md" has 3 components anyway (non-recursive would drop) but
  // FR-028 takes it out structurally too.
  expect(result.paths).toEqual(["Inbox/visible.md"]);
});

// (16) folder: ".obsidian" → every result has dot-prefixed first segment → empty
test("folder='.obsidian' + dotfile-prefixed result paths → FR-028 eats every result", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: ".obsidian/app.json\n.obsidian/workspace.json\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: ".obsidian" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
});

// (20) vault-root listing — threshold computed from no-folder
test("vault-root listing (no folder) — 1-component kept, 2-component dropped", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "root.md\nSubdir/leaf.md\nother.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles({ target_mode: "specific", vault: "V" }, deps(spawnFn));
  expect(result).toEqual({ count: 2, paths: ["other.md", "root.md"] });
});

// =================== total flag tests (T011 — cases #17–#19) ===================

// (17) total:true + 5-path stdout → { count: 5, paths: [] }
test("total:true + 5-path stdout → { count: 5, paths: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/a.md\nInbox/b.md\nInbox/c.md\nInbox/d.md\nInbox/e.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 5, paths: [] });
});

// (18) total:false + same fixture → populated paths, count matches total:true
test("total:false + same fixture → count parity with total:true (R7 / SC-005)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Inbox/a.md\nInbox/b.md\nInbox/c.md\nInbox/d.md\nInbox/e.md\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(result.count).toBe(5);
  expect(result.paths).toHaveLength(5);
});

// (19) total:true + ext filter → count reflects CLI's ext-filtered subset
test("total:true + ext filter — count reflects CLI-filtered subset", async () => {
  // CLI ext filtering happens upstream; the wrapper sees only the filtered stdout.
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "Assets/a.png\nAssets/b.png\n", exitCode: 0 },
  ]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Assets", ext: "png", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 2, paths: [] });
  expect(recorded[0]!.argv).toContain("ext=png");
});

// =================== Error propagation (T017 — cases #21–#24) + active no-focus (T012 — #25) ===================

// (21) unknown vault → CLI_REPORTED_ERROR via 011-R5 inspection
test("unknown vault stdout 'Vault not found.' → CLI_REPORTED_ERROR (011-R5)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeListFiles({ target_mode: "specific", vault: "Nope" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (22) generic Error: stdout → CLI_REPORTED_ERROR via four-priority classifier
test("generic 'Error: …' stdout → CLI_REPORTED_ERROR (dispatch-layer classifier)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: Something went wrong in CLI.\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeListFiles({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
});

// (23) CLI binary not found → CLI_BINARY_NOT_FOUND propagates
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND propagates", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeQueuedSpawn([{ errorOnSpawn: enoent }]);
  const err = (await captureRejection(
    executeListFiles({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// (24) non-zero exit → CLI_NON_ZERO_EXIT
test("non-zero exit → CLI_NON_ZERO_EXIT propagates with stderr in details", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stderr: "permission denied", exitCode: 1 }]);
  const err = (await captureRejection(
    executeListFiles({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("permission denied");
});

// (25) active mode, no focused vault — CLI returns ERR_NO_ACTIVE_FILE or CLI_REPORTED_ERROR
test("active no-focus — CLI 'Error: no active file' → ERR_NO_ACTIVE_FILE (T012)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: no active file\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeListFiles({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  // The dispatch-layer four-priority classifier maps 'Error: no active file' to
  // ERR_NO_ACTIVE_FILE; the M-2 manual probe in T021 locks the live shape.
  expect(["ERR_NO_ACTIVE_FILE", "CLI_REPORTED_ERROR"]).toContain(err.code);
});

// =================== Trailing-slash + path-traversal pass-through (T010 — cases #26, #27) ===================

// (26) trailing-slash folder=Inbox/ passes through verbatim (CLI normalises per F4)
test("trailing-slash folder='Inbox/' passes through verbatim to argv (CLI-normalised per F4)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "Inbox/" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("folder=Inbox/");
});

// (27) path-traversal folder=../../etc passes through verbatim (CLI confines per F15)
test("path-traversal folder='../../etc' passes through verbatim; CLI-confined → empty response", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  const result = await executeListFiles(
    { target_mode: "specific", vault: "V", folder: "../../etc" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("folder=../../etc");
  expect(result).toEqual({ count: 0, paths: [] });
});

// =================== Output-cap (T015 — case #28) ===================

// (28) output-cap exceeded → structured error in BOTH total:false AND total:true
test("output-cap / non-zero exit propagates unmodified for BOTH total:false and total:true (Plan-amendment-1)", async () => {
  // total:false branch
  {
    const { spawnFn } = makeQueuedSpawn([{ exitCode: 1, stderr: "cap exceeded" }]);
    const err = (await captureRejection(
      executeListFiles(
        { target_mode: "specific", vault: "V", folder: "Huge" },
        deps(spawnFn),
      ),
    )) as UpstreamError;
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  }
  // total:true branch — same stub shape, same propagation
  {
    const { spawnFn } = makeQueuedSpawn([{ exitCode: 1, stderr: "cap exceeded" }]);
    const err = (await captureRejection(
      executeListFiles(
        { target_mode: "specific", vault: "V", folder: "Huge", total: true },
        deps(spawnFn),
      ),
    )) as UpstreamError;
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  }
});
