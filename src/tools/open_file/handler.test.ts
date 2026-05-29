// Original — no upstream. open_file handler tests (BI-057) — single-call argv assembly, base64
// payload round-trip (R12 anti-injection lock), eval-envelope classification with the "=> " echo,
// the FR-012a stage order (unknown → not-open → FILE_NOT_FOUND → UNSUPPORTED_FILE_TYPE → success),
// any-type coverage (US2), new_tab passthrough (US3), the full typed-failure taxonomy (US4),
// Obsidian-not-running propagation, malformed-eval INTERNAL_ERROR, and determinism (SC-006).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeOpenFile } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

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
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

/** Registry that resolves to a fixed base path (the focused vault's expected base). */
function fakeRegistry(base = "/vaults/Work"): VaultRegistry {
  return { resolveVaultPath: async () => base };
}

/** Registry that raises the cohort's unknown-vault VALIDATION_ERROR. */
function unknownVaultRegistry(): VaultRegistry {
  return {
    resolveVaultPath: async () => {
      throw new UpstreamError({
        code: "VALIDATION_ERROR",
        cause: null,
        details: { requestedVault: "Typo" },
        message: 'Vault "Typo" is not registered with Obsidian.',
      });
    },
  };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

function deps(spawnFn: SpawnLike, vaultRegistry: VaultRegistry = fakeRegistry()) {
  return { logger: silentLogger(), queue: createQueue(), vaultRegistry, spawnFn, env: {} };
}

function decodePayload(argv: string[]): Record<string, unknown> {
  const codeArg = argv.find((a) => a.startsWith("code="));
  if (!codeArg) throw new Error("argv missing code= parameter");
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  if (!match) throw new Error("argv code= does not contain base64 atob(...) payload");
  return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8")) as Record<string, unknown>;
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// US1 — happy path MVP
// =====================================================================

test("happy path by path: returns { opened, vault, new_tab:false }; payload encodes expectedBase + path (US1)", async () => {
  const envelope = { ok: true, opened: "Projects/Roadmap.md", new_tab: false };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile(
    { vault: "Work", path: "Projects/Roadmap.md", new_tab: false },
    deps(spawnFn),
  );
  expect(result).toEqual({ opened: "Projects/Roadmap.md", vault: "Work", new_tab: false });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("eval");
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(decodePayload(argv)).toEqual({
    expectedBase: "/vaults/Work",
    path: "Projects/Roadmap.md",
    file: null,
    new_tab: false,
  });
});

test("happy path by file: payload encodes file set / path null; opened is the canonical path (US1/FR-003)", async () => {
  const envelope = { ok: true, opened: "Projects/Roadmap.md", new_tab: false };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Work", file: "Roadmap" }, deps(spawnFn));
  expect(result).toEqual({ opened: "Projects/Roadmap.md", vault: "Work", new_tab: false });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    expectedBase: "/vaults/Work",
    path: null,
    file: "Roadmap",
    new_tab: false,
  });
});

test("VAULT_NOT_FOUND / unknown: registry miss → no eval call (guard fires before eval) (US1/FR-012a)", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Typo", path: "a.md" }, deps(spawnFn, unknownVaultRegistry())),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ code: "VAULT_NOT_FOUND", reason: "unknown", vault: "Typo" });
  expect(getCount()).toBe(0);
});

test("VAULT_NOT_FOUND / not-open: eval {ok:false,code:VAULT_NOT_FOCUSED} → CLI_REPORTED_ERROR (US1)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"VAULT_NOT_FOCUSED"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Archive", path: "old.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "VAULT_NOT_FOUND",
    reason: "not-open",
    vault: "Archive",
  });
});

test("Obsidian-not-running: invokeCli ENOENT throw propagates as CLI_BINARY_NOT_FOUND, never a success (US1)", async () => {
  const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  const { spawnFn } = makeQueuedSpawn([{ errorOnSpawn: enoent }]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

test("determinism (SC-006): two identical calls produce byte-equal eval argv + identical envelopes", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false };
  const { spawnFn: s1, recorded: r1 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const { spawnFn: s2, recorded: r2 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const out1 = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(s1));
  const out2 = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(s2));
  expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
  expect(r1[0]!.argv).toEqual(r2[0]!.argv);
  expect(Object.keys(out1).sort()).toEqual(["new_tab", "opened", "vault"]);
});

// =====================================================================
// US2 — open any vault-supported file type (not markdown only)
// =====================================================================

for (const opened of ["Boards/Architecture.canvas", "Papers/transformer.pdf", "Assets/diagram.png"]) {
  test(`any-type happy path: ${opened} → identical { opened, vault, new_tab } shape (US2/FR-009)`, async () => {
    const envelope = { ok: true, opened, new_tab: false };
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
    ]);
    const result = await executeOpenFile({ vault: "Research", path: opened }, deps(spawnFn));
    expect(result).toEqual({ opened, vault: "Research", new_tab: false });
    expect(Object.keys(result).sort()).toEqual(["new_tab", "opened", "vault"]);
  });
}

test("any-type by file: attachment bare name opens with identical shape (US2/FR-009)", async () => {
  const envelope = { ok: true, opened: "Assets/diagram.png", new_tab: false };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Research", file: "diagram.png" }, deps(spawnFn, fakeRegistry("/vaults/Research")));
  expect(result).toEqual({ opened: "Assets/diagram.png", vault: "Research", new_tab: false });
  expect(decodePayload(recorded[0]!.argv).file).toBe("diagram.png");
});

test("UNSUPPORTED_FILE_TYPE: eval detail carries the extension → details.extension (US2)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"UNSUPPORTED_FILE_TYPE","detail":"sqlite"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "data/export.sqlite" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "UNSUPPORTED_FILE_TYPE",
    extension: "sqlite",
    path: "data/export.sqlite",
    vault: "Work",
  });
});

test("UNSUPPORTED_FILE_TYPE is distinguishable from FILE_NOT_FOUND (US2/FR-009)", async () => {
  const { spawnFn: s1 } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"UNSUPPORTED_FILE_TYPE","detail":"sqlite"}\n', exitCode: 0 },
  ]);
  const { spawnFn: s2 } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"x.md"}\n', exitCode: 0 },
  ]);
  const unsupported = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "data/export.sqlite" }, deps(s1)),
  )) as UpstreamError;
  const notFound = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "x.md" }, deps(s2)),
  )) as UpstreamError;
  expect(unsupported.details.code).toBe("UNSUPPORTED_FILE_TYPE");
  expect(notFound.details.code).toBe("FILE_NOT_FOUND");
  expect(unsupported.details.code).not.toBe(notFound.details.code);
});

// =====================================================================
// US3 — open in a new tab, or focus the existing tab without duplicating
// =====================================================================

test("new_tab:true → payload encodes new_tab:true; envelope echoes the effective flag (US3/FR-008)", async () => {
  const envelope = { ok: true, opened: "Reference/Style Guide.md", new_tab: true };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile(
    { vault: "Work", path: "Reference/Style Guide.md", new_tab: true },
    deps(spawnFn),
  );
  expect(result.new_tab).toBe(true);
  expect(decodePayload(recorded[0]!.argv).new_tab).toBe(true);
});

test("new_tab omitted → payload encodes false (default reuse-existing-tab dedup) (US3/FR-008)", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn));
  expect(result.new_tab).toBe(false);
  expect(decodePayload(recorded[0]!.argv).new_tab).toBe(false);
});

test("new_tab:false explicit → payload encodes false (US3)", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  await executeOpenFile({ vault: "Work", path: "a.md", new_tab: false }, deps(spawnFn));
  expect(decodePayload(recorded[0]!.argv).new_tab).toBe(false);
});

// =====================================================================
// US4 — distinguish every failure mode through typed errors, never a silent no-op
// =====================================================================

test("stage order (FR-012a): unknown precedes any eval-envelope error — registry miss never reaches file-not-found", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Typo", path: "a.md" }, deps(spawnFn, unknownVaultRegistry())),
  )) as UpstreamError;
  expect(err.details.code).toBe("VAULT_NOT_FOUND");
  expect(err.details.reason).toBe("unknown");
  expect(getCount()).toBe(0);
});

test("folder target → eval {ok:false,code:FILE_NOT_FOUND} → FILE_NOT_FOUND (US4/FR-014)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"Projects"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "Projects" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ code: "FILE_NOT_FOUND", path: "Projects", vault: "Work" });
});

test("malformed eval result (non-JSON) → INTERNAL_ERROR + details.stage:'json-parse' (US4)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-valid-json{\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("INTERNAL_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

test("wrong-shape eval result → INTERNAL_ERROR + details.stage:'envelope-parse' (US4)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"opened":"a.md"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("INTERNAL_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

test("focus-unchanged invariant (FR-017): every failure case rejects, never issues a success envelope", async () => {
  const failures: StubResponse[] = [
    { stdout: '=> {"ok":false,"code":"VAULT_NOT_FOCUSED"}\n', exitCode: 0 },
    { stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"x.md"}\n', exitCode: 0 },
    { stdout: '=> {"ok":false,"code":"UNSUPPORTED_FILE_TYPE","detail":"sqlite"}\n', exitCode: 0 },
  ];
  for (const f of failures) {
    const { spawnFn } = makeQueuedSpawn([f]);
    const err = await captureRejection(
      executeOpenFile({ vault: "Work", path: "x" }, deps(spawnFn)),
    );
    expect(err).toBeInstanceOf(UpstreamError);
  }
});

test("anti-injection (R12): a hostile locator round-trips ONLY inside the base64 payload (US4)", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false };
  const hostile = 'Tricky"); doSomething(); //.md';
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  await executeOpenFile({ vault: "Work", path: hostile }, deps(spawnFn));
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(decodePayload(argv).path).toBe(hostile);
  for (const a of argv) {
    if (a.startsWith("code=")) continue;
    expect(a.includes(hostile)).toBe(false);
  }
});
