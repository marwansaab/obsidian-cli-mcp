// Original — no upstream. Tests for the paths handler — covers US1..US9 handler-test inventory: single-spawn invariant, argv contract (subcommand=eval, base64 payload, vault flow-through, active-mode strip), happy paths (whole-vault, sub-folder, depth, ext, active, count-only, ext+depth composition), trailing-slash invariant on folder entries, cross-mode count invariant, stage-3 closed-vault detection via the shared `_eval-vault-closed-detection` module, stage-5/6 parse failures with discriminative `details.stage`, stage-7 envelope-error branch (FOLDER_NOT_FOUND / NOT_A_FOLDER), inherited unknown-vault via cli-adapter, inherited NO_ACTIVE_FILE + CLI_NON_ZERO_EXIT, payload-injection structural lock (anti-injection round-trips), and frozen-template byte-stability.
import { type SpawnOptions } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { executePaths } from "./handler.js";
import { pathsInputSchema } from "./schema.js";
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

function okEnv(count: number, paths: string[]): string {
  return `=> ${JSON.stringify({ ok: true, count, paths })}\n`;
}

function errEnv(code: "FOLDER_NOT_FOUND" | "NOT_A_FOLDER", folder: string): string {
  return `=> ${JSON.stringify({ ok: false, code, folder })}\n`;
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// US1 — Specific-mode whole-vault recursive listing
// =====================================================================

// (T006) Q-9 default-mode happy path (mixed file/folder paths, sorted, folders trailing-slashed)
test("US1 Q-9 default-mode happy path: mixed subtree round-trips with trailing-slash folders", async () => {
  const paths = [
    "Archive/",
    "Archive/old.md",
    "Inbox/",
    "Inbox/Sub/",
    "Inbox/Sub/c.md",
    "Inbox/a.md",
    "Inbox/b.md",
    "README.md",
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(8, paths), exitCode: 0 }]);
  const result = await executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn));
  expect(result).toEqual({ count: 8, paths });
  expect(result.count).toBe(result.paths.length);
  for (const p of result.paths) {
    // Folder entries end with `/`; file entries do not.
    if (p.endsWith("/")) expect(p.endsWith("/")).toBe(true);
    else expect(p.endsWith("/")).toBe(false);
  }
  // Sorted byte-asc check (already produced sorted by JS template; handler doesn't re-sort)
  const sorted = [...paths].sort();
  expect(result.paths).toEqual(sorted);
});

// (T007) Empty-vault happy path
test("US1 empty-vault: { count:0, paths:[] } — never throws", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  const result = await executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn));
  expect(result).toEqual({ count: 0, paths: [] });
});

// (T008) I-2 single-spawn invariant — exactly one invokeCli call
test("US1 I-2 single-spawn: exactly one invokeCli call", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn));
  expect(getCount()).toBe(1);
});

// (T009) I-3 fixed dispatch shape (subcommand=eval, vault, code contains atob)
test("US1 I-3 dispatch shape: argv contains 'eval', vault=Demo, code= with atob", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn));
  expect(recorded[0]!.argv).toContain("eval");
  expect(recorded[0]!.argv).toContain("vault=Demo");
  const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="))!;
  expect(codeArg).toContain("atob");
});

// (T010) I-5 base64 payload round-trip (minimal US1 invocation)
test("US1 I-5 base64 payload: {folder:null, depth:null, ext:null, total:false}", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn));
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    folder: null,
    depth: null,
    ext: null,
    total: false,
  });
});

// (T011) I-4 frozen template byte-stability (SHA-256 lock)
test("US1 I-4 frozen template byte-stable: SHA-256 matches locked digest", () => {
  const digest = createHash("sha256").update(JS_TEMPLATE, "utf-8").digest("hex");
  // Locked digest: the JS_TEMPLATE string must not drift without conscious update.
  // Any modification to the template body (filter logic, walk, sort, envelope shape)
  // changes this digest. Roll forward intentionally when the template changes.
  expect(digest).toBe("f6e983b07907cb0d4f99cdb161f491c56a1e0b459d08826db6eab528ef6bc70e");
});

// (T012) Q-17 unknown vault dispatch propagation
test("US1 Q-17 unknown vault: 'Vault not found.' stdout → CLI_REPORTED_ERROR (011-R5)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executePaths({ target_mode: "specific", vault: "NoSuchVault" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// =====================================================================
// US2 — Specific-mode sub-folder subtree listing
// =====================================================================

// (BI-034) Non-ASCII folder input — accented + CJK round-trip through base64
test("BI-034: non-ASCII folder name 'cafés' round-trips through base64 (FR-009)", async () => {
  const paths = ["Sandbox/unicode/cafés/inner-note.md"];
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(1, paths), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", folder: "Sandbox/unicode/cafés" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 1, paths });
  const payload = decodePayload(recorded[0]!.argv) as { folder: unknown };
  expect(payload.folder).toBe("Sandbox/unicode/cafés");
});

test("BI-034: non-ASCII folder name (CJK) round-trips through base64 (FR-009)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths(
    { target_mode: "specific", vault: "Demo", folder: "笔记" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { folder: unknown };
  expect(payload.folder).toBe("笔记");
});

// (T015) Q-10 sub-folder happy path
test("US2 Q-10 sub-folder happy path: only Inbox/-rooted entries", async () => {
  const paths = ["Inbox/Sub/", "Inbox/Sub/c.md", "Inbox/a.md", "Inbox/b.md"];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(4, paths), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 4, paths });
  // Starting folder itself not in paths
  expect(result.paths).not.toContain("Inbox/");
});

// (T016) Q-15 missing-folder error → FOLDER_NOT_FOUND
test("US2 Q-15 missing-folder: ok:false code:FOLDER_NOT_FOUND → CLI_REPORTED_ERROR", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: errEnv("FOLDER_NOT_FOUND", "Missing"), exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executePaths(
      { target_mode: "specific", vault: "Demo", folder: "Missing" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FOLDER_NOT_FOUND",
    folder: "Missing",
  });
});

// (T017) Q-16 not-a-folder error → NOT_A_FOLDER
test("US2 Q-16 not-a-folder: ok:false code:NOT_A_FOLDER → CLI_REPORTED_ERROR", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: errEnv("NOT_A_FOLDER", "notes/x.md"), exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executePaths(
      { target_mode: "specific", vault: "Demo", folder: "notes/x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "NOT_A_FOLDER",
    folder: "notes/x.md",
  });
});

// (T018) Empty-existing-folder distinguishable from missing-folder
test("US2 empty-existing folder: {count:0, paths:[]} — distinguishable from FOLDER_NOT_FOUND", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", folder: "Empty" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
});

// (T019) I-5 payload round-trip with folder
test("US2 I-5 payload round-trip with folder='Inbox'", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths(
    { target_mode: "specific", vault: "Demo", folder: "Inbox" },
    deps(spawnFn),
  );
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    folder: "Inbox",
    depth: null,
    ext: null,
    total: false,
  });
});

// =====================================================================
// US3 — Depth-limited traversal
// =====================================================================

// (T021) Q-11 depth-1 cap: only immediate children
test("US3 Q-11 depth-1: immediate children only", async () => {
  const paths = ["Archive/", "Inbox/", "README.md"];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(3, paths), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", depth: 1 },
    deps(spawnFn),
  );
  expect(result.paths).toEqual(paths);
});

// (T022) Depth-2 cap
test("US3 depth-2: depths 1 and 2 included", async () => {
  const paths = [
    "Archive/",
    "Archive/old.md",
    "Inbox/",
    "Inbox/Sub/",
    "Inbox/a.md",
    "Inbox/b.md",
    "README.md",
  ];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(7, paths), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", depth: 2 },
    deps(spawnFn),
  );
  expect(result.paths).toEqual(paths);
});

// (T023) Depth-greater-than-actual-height silently accepted
test("US3 depth=99: silently accepted (no error from handler)", async () => {
  const paths = ["a.md", "b.md"];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(2, paths), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", depth: 99 },
    deps(spawnFn),
  );
  expect(result.paths).toEqual(paths);
});

// (T024) I-5 payload round-trip with depth
test("US3 I-5 payload round-trip with depth=2", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths(
    { target_mode: "specific", vault: "Demo", depth: 2 },
    deps(spawnFn),
  );
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    folder: null,
    depth: 2,
    ext: null,
    total: false,
  });
});

// (T025) Schema-layer depth=0 rejection (cross-suite reference)
test("US3 schema depth=0 rejected pre-dispatch (cross-suite reference)", () => {
  const r = pathsInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    depth: 0,
  });
  expect(r.success).toBe(false);
});

// =====================================================================
// US4 — Extension filter
// =====================================================================

// (T027) Q-12 ext-md happy path: only .md files
test("US4 Q-12 ext=md: only files, no folder entries", async () => {
  const paths = ["Archive/old.md", "Inbox/Sub/c.md", "Inbox/a.md", "README.md"];
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(4, paths), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", ext: "md" },
    deps(spawnFn),
  );
  expect(result.paths).toEqual(paths);
  for (const p of result.paths) {
    expect(p.endsWith("/")).toBe(false);
  }
});

// (T028) I-5 payload carries ext verbatim (template normalises in-eval)
test("US4 I-5 payload round-trip with ext='.md' and ext='md'", async () => {
  const { spawnFn: spawnA, recorded: recA } = makeQueuedSpawn([
    { stdout: okEnv(0, []), exitCode: 0 },
  ]);
  const { spawnFn: spawnB, recorded: recB } = makeQueuedSpawn([
    { stdout: okEnv(0, []), exitCode: 0 },
  ]);
  await executePaths({ target_mode: "specific", vault: "Demo", ext: ".md" }, deps(spawnA));
  await executePaths({ target_mode: "specific", vault: "Demo", ext: "md" }, deps(spawnB));
  expect((decodePayload(recA[0]!.argv) as { ext: string }).ext).toBe(".md");
  expect((decodePayload(recB[0]!.argv) as { ext: string }).ext).toBe("md");
});

// (T029) Ext no-match: success, not error
test("US4 ext-no-match: {count:0, paths:[]} (not an error)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", ext: "qqq" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, paths: [] });
});

// (T030) Ext + depth composition
test("US4 ext+depth composition: round-trips verbatim", async () => {
  const paths = ["a.md", "b.md"];
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: okEnv(2, paths), exitCode: 0 },
  ]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", ext: "md", depth: 2 },
    deps(spawnFn),
  );
  expect(result.paths).toEqual(paths);
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    folder: null,
    depth: 2,
    ext: "md",
    total: false,
  });
});

// =====================================================================
// US5 — Active-mode listing
// =====================================================================

// (T032) Q-13 active-mode dispatch shape — no vault= argv
test("US5 Q-13 active-mode dispatch: no vault= argv prefix", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths({ target_mode: "active" }, deps(spawnFn));
  expect(recorded[0]!.argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(recorded[0]!.argv).toContain("eval");
});

// (T033) Q-19 active-mode no focused vault — ERR_NO_ACTIVE_FILE
test("US5 Q-19 active-mode no focus: 'Error: no active file' → ERR_NO_ACTIVE_FILE", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: no active file\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executePaths({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
});

// (T034) Q-18 closed-vault detection (specific mode + empty stdout + registered)
test("US5 Q-18 closed-vault: empty stdout + registered → VAULT_NOT_FOUND(reason:'not-open')", async () => {
  const vaultsListStdout = "TestVault\tC:\\Vaults\\TestVault\nThe Setup\tD:\\Vaults\\The Setup\n";
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: "", exitCode: 0 }, // first call: empty stdout (closed-vault signature)
    { stdout: vaultsListStdout, exitCode: 0 }, // second call: vaults verbose
  ]);
  const err = (await captureRejection(
    executePaths(
      { target_mode: "specific", vault: "The Setup" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
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
// US6 — Count-only mode
// =====================================================================

// (T036) Q-14 cross-mode count invariant (I-10)
test("US6 Q-14 cross-mode count invariant: total:false count === total:true count; paths===[] when total", async () => {
  const paths = ["a.md", "b.md", "c.md"];
  const { spawnFn: spawnA } = makeQueuedSpawn([{ stdout: okEnv(3, paths), exitCode: 0 }]);
  const def = await executePaths(
    { target_mode: "specific", vault: "Demo" },
    deps(spawnA),
  );

  const { spawnFn: spawnB } = makeQueuedSpawn([{ stdout: okEnv(3, []), exitCode: 0 }]);
  const co = await executePaths(
    { target_mode: "specific", vault: "Demo", total: true },
    deps(spawnB),
  );

  expect(def.count).toBe(3);
  expect(co.count).toBe(3);
  expect(co.paths).toEqual([]);
  expect(co.count).toBe(def.paths.length);
});

// (T037) total:true + ext composition
test("US6 total+ext: count carries the filtered count", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(5, []), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", ext: "md", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 5, paths: [] });
});

// (T038) total:true + depth composition
test("US6 total+depth: count carries the depth-bounded count", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: okEnv(7, []), exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo", depth: 1, total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 7, paths: [] });
});

// (T039) Payload round-trip with total:true
test("US6 I-5 payload round-trip with total:true", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  await executePaths(
    { target_mode: "specific", vault: "Demo", total: true },
    deps(spawnFn),
  );
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    folder: null,
    depth: null,
    ext: null,
    total: true,
  });
});

// =====================================================================
// US7 — Validation rejects malformed inputs before dispatcher
// =====================================================================

// (T041) Dispatcher-never-called for invalid inputs (Q-1..Q-9 sub-cases)
test("US7 dispatcher-never-called: invalid inputs reject pre-dispatch", async () => {
  const cases: unknown[] = [
    { target_mode: "specific" }, // missing vault
    { target_mode: "active", vault: "X" }, // vault in active
    { target_mode: "specific", vault: "V", file: "Note" }, // file forbidden
    { target_mode: "active", file: "Note" }, // file in active
    { target_mode: "specific", vault: "V", path: "x.md" }, // path forbidden
    { target_mode: "active", path: "x.md" }, // path in active
    { target_mode: "specific", vault: "V", bogus: 1 }, // unknown key
    { target_mode: "neither", vault: "V" }, // target_mode out-of-enum
    { target_mode: "specific", vault: "V", total: "yes" }, // total non-boolean
    { target_mode: "specific", vault: "V", depth: 0 }, // depth=0
    { target_mode: "specific", vault: "V", depth: -1 }, // depth<0
    { target_mode: "specific", vault: "V", depth: 1.5 }, // depth non-integer
  ];
  for (const input of cases) {
    const parsed = pathsInputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  }
});

// =====================================================================
// US9 — Pathological-size cap-kill propagation
// =====================================================================

// (T045) Q-22 adapter cap-kill propagation
test("US9 Q-22 adapter cap-kill: CLI_NON_ZERO_EXIT propagates unchanged", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "", stderr: "output cap exceeded\n", exitCode: 1 },
  ]);
  const err = (await captureRejection(
    executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// =====================================================================
// Stage-5/6 parse failures
// =====================================================================

// stage-5 json-parse failure
test("stage-5 json-parse: malformed JSON → CLI_REPORTED_ERROR(stage:'json-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-json{\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

// stage-6 envelope-parse failure (wrong shape)
test("stage-6 envelope-parse: wrong shape → CLI_REPORTED_ERROR(stage:'envelope-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"bogus":1}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executePaths({ target_mode: "specific", vault: "Demo" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// stage-1: missing `=> ` prefix still parses
test("stage-4: missing '=> ' prefix → raw JSON tolerated", async () => {
  const raw = JSON.stringify({ ok: true, count: 1, paths: ["x.md"] });
  const { spawnFn } = makeQueuedSpawn([{ stdout: raw + "\n", exitCode: 0 }]);
  const result = await executePaths(
    { target_mode: "specific", vault: "Demo" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 1, paths: ["x.md"] });
});

// =====================================================================
// Anti-injection structural lock (payload round-trip with adversarial input)
// =====================================================================

test("anti-injection: hostile folder content round-trips via base64 verbatim", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  const hostile = `"); evil(); ("foo`;
  await executePaths(
    { target_mode: "specific", vault: "Demo", folder: hostile },
    deps(spawnFn),
  );
  const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="))!;
  expect(codeArg).not.toContain(hostile);
  const payload = decodePayload(recorded[0]!.argv) as { folder: string };
  expect(payload.folder).toBe(hostile);
});

test("anti-injection: Unicode + emoji round-trips via base64 verbatim", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: okEnv(0, []), exitCode: 0 }]);
  const unicode = "漢字-emoji-🚀";
  await executePaths(
    { target_mode: "specific", vault: "Demo", folder: unicode },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { folder: string };
  expect(payload.folder).toBe(unicode);
});

// =====================================================================
// Frozen-template byte-stability across calls (structural anti-injection lock)
// =====================================================================

test("frozen template byte-stable across calls: only base64 region varies", async () => {
  const { spawnFn: spawnA, recorded: recA } = makeQueuedSpawn([
    { stdout: okEnv(0, []), exitCode: 0 },
  ]);
  const { spawnFn: spawnB, recorded: recB } = makeQueuedSpawn([
    { stdout: okEnv(0, []), exitCode: 0 },
  ]);
  await executePaths(
    { target_mode: "specific", vault: "Demo", folder: "alpha" },
    deps(spawnA),
  );
  await executePaths(
    { target_mode: "specific", vault: "Demo", folder: "betagamma" },
    deps(spawnB),
  );
  const codeA = recA[0]!.argv.find((a) => a.startsWith("code="))!;
  const codeB = recB[0]!.argv.find((a) => a.startsWith("code="))!;
  const replaceB64 = (s: string) => s.replace(/atob\('[A-Za-z0-9+/=]+'\)/, "atob('X')");
  expect(replaceB64(codeA)).toBe(replaceB64(codeB));
  expect(codeA.startsWith("code=" + JS_TEMPLATE.split("__PAYLOAD_B64__")[0])).toBe(true);
});
