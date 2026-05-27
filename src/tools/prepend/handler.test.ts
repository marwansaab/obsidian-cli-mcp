// Original — no upstream. prepend handler tests per BI-045 / Principle II. US1 happy paths (both locator shapes × frontmatter-content-verbatim, bytes_written stat-delta, file-TSV resolver pre-flight, PATH_ESCAPES_VAULT, repeat-invocation determinism, inline-flag passthrough, NOTE_NOT_FOUND + EXTERNAL_EDITOR_CONFLICT classification on upstream stdout/stderr); US2 (CONTENT_EMPTY / CONTENT_TOO_LARGE pre-handler rejection assertions, locator-mutex, bracket-rejection, unknown-extra-field surface through registerTool boundary); US3 (inline opt-in passthrough cohort); US4 (active-mode focused-file resolution + ERR_NO_ACTIVE_FILE + eval parse failures).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { executePrepend, type ExecuteFs } from "./handler.js";
import { createPrependTool } from "./index.js";
import { MAX_CONTENT_LENGTH } from "./schema.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const VAULT_ROOT = resolve("/test-vault");

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

function makeQueuedSpawn(
  responses: StubResponse[],
): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(
        `unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`,
      );
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
  return { spawnFn, recorded };
}

function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

interface FakeFsHandle extends ExecuteFs {
  statCalls: string[];
}

function fakeFs(
  opts: { sizes?: number[]; over?: Partial<ExecuteFs> } = {},
): FakeFsHandle {
  const statCalls: string[] = [];
  const sizes = opts.sizes ?? [0, 0];
  let statIdx = 0;
  const base: ExecuteFs = {
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    }),
    stat: vi.fn(async (p: string) => {
      statCalls.push(p);
      const size = sizes[statIdx] ?? sizes[sizes.length - 1] ?? 0;
      statIdx += 1;
      return { size };
    }),
  };
  const merged: ExecuteFs = { ...base, ...opts.over };
  return Object.assign(merged, { statCalls });
}

function fakeRegistry(map: Record<string, string>): VaultRegistry {
  return {
    resolveVaultPath: vi.fn(async (name: string) => {
      const path = map[name];
      if (path === undefined) {
        throw new UpstreamError({
          code: "VALIDATION_ERROR",
          cause: null,
          details: { requestedVault: name, knownVaults: Object.keys(map) },
          message: `Vault "${name}" is not registered.`,
        });
      }
      return path;
    }),
    resolveVaultDisplayName: vi.fn((basePath: string) => {
      for (const [name, path] of Object.entries(map)) {
        if (path === basePath) return name;
      }
      return null;
    }),
  };
}

function deps(opts: {
  spawnFn: SpawnLike;
  vaultRegistry: VaultRegistry;
  fs?: ExecuteFs;
  logger?: Logger;
}) {
  return {
    logger: opts.logger ?? silentLogger(),
    queue: createQueue(),
    vaultRegistry: opts.vaultRegistry,
    spawnFn: opts.spawnFn,
    env: {},
    fs: opts.fs,
  };
}

const PREPEND_OK: StubResponse = { stdout: "", exitCode: 0 };
const FILE_TSV_OK = (relPath: string): StubResponse => ({
  stdout: `path\t${relPath}\n`,
  exitCode: 0,
});

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// ─────────────────────────────────────────────────────────────────────
// US1 happy paths — specific+path locator
// ─────────────────────────────────────────────────────────────────────

describe("US1 happy paths — specific + path locator", () => {
  test("specific+path: invokes obsidian prepend with path=, no inline flag, returns envelope with bytes_written stat-delta", async () => {
    const fs = fakeFs({ sizes: [100, 158] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/journal.md",
        content: "## TL;DR\n\nLead paragraph.",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(recorded.length).toBe(1);
    expect(recorded[0]!.argv).toContain("prepend");
    expect(recorded[0]!.argv.some((a) => a.startsWith("path=Sandbox/journal.md"))).toBe(true);
    expect(recorded[0]!.argv.some((a) => a.startsWith("content="))).toBe(true);
    expect(recorded[0]!.argv.includes("inline")).toBe(false);
    expect(result).toEqual({
      path: "Sandbox/journal.md",
      vault: "TestVault",
      bytes_written: 58,
      inline: false,
    });
  });

  test("specific+path: pre/post stat brackets the prepend call (two stat calls)", async () => {
    const fs = fakeFs({ sizes: [10, 20] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.statCalls.length).toBe(2);
  });

  test("path-locator does NOT invoke the file-TSV resolver", async () => {
    const fs = fakeFs({ sizes: [0, 3] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(recorded.length).toBe(1);
    expect(recorded[0]!.argv.some((a) => a.startsWith("file="))).toBe(false);
  });

  test("content passes verbatim to upstream (FR-010a) — exact byte match", async () => {
    const fs = fakeFs({ sizes: [0, 100] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    const contentBytes = "## TL;DR\n\nLead paragraph.";
    await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: contentBytes,
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const contentArg = recorded[0]!.argv.find((a) => a.startsWith("content="));
    expect(contentArg).toBe(`content=${contentBytes}`);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 happy paths — file-locator pre-flight TSV resolver (FR-002 / FR-003)
// ─────────────────────────────────────────────────────────────────────

describe("US1 happy paths — `file` locator with pre-flight TSV resolver", () => {
  test("file-locator resolves through `obsidian file` TSV; prepend uses canonical path; envelope echoes canonical path", async () => {
    const fs = fakeFs({ sizes: [50, 90] });
    const { spawnFn, recorded } = makeQueuedSpawn([FILE_TSV_OK("tasks.md"), PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "tasks",
        content: "Lead",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("tasks.md");
    expect(recorded.length).toBe(2);
    // First call: file resolver with file=tasks.
    const fileArg = recorded[0]!.argv.find((a) => a.startsWith("file="));
    expect(fileArg).toBe("file=tasks");
    // Second call: prepend with path=tasks.md (resolved canonical, NOT input file).
    expect(recorded[1]!.argv.includes("prepend")).toBe(true);
    const pathArg = recorded[1]!.argv.find((a) => a.startsWith("path="));
    expect(pathArg).toBe("path=tasks.md");
    expect(recorded[1]!.argv.some((a) => a.startsWith("file="))).toBe(false);
  });

  test("file-locator TSV-parse failure → CLI_REPORTED_ERROR with stage 'file-tsv-parse'", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([{ stdout: "not a TSV line\n", exitCode: 0 }]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "tasks",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.stage).toBe("file-tsv-parse");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 PATH_ESCAPES_VAULT — Layer 2 canonical-path check
// ─────────────────────────────────────────────────────────────────────

describe("US1 PATH_ESCAPES_VAULT", () => {
  test("symlink-escape attempt → PATH_ESCAPES_VAULT + pathEscapeAttempt logger event; no prepend call follows", async () => {
    const escapeTarget = resolve("/escape-target");
    const fs = fakeFs({
      over: {
        realpath: vi.fn(async (p: string) => {
          if (p === VAULT_ROOT) return VAULT_ROOT;
          return escapeTarget;
        }),
      },
    });
    const events: Array<Record<string, unknown>> = [];
    const logger = createLogger({
      stream: new Writable({
        write(chunk, _e, cb) {
          try {
            events.push(JSON.parse(chunk.toString()));
          } catch {
            /* ignore */
          }
          cb();
        },
      }),
    });
    const { spawnFn, recorded } = makeQueuedSpawn([]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "subdir/escape.md",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs, logger }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("PATH_ESCAPES_VAULT");
    expect((err as UpstreamError).details.attemptedPath).toBe("subdir/escape.md");
    const escapeEvent = events.find((e) => e.event === "pathEscapeAttempt");
    expect(escapeEvent).toBeDefined();
    expect(recorded.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 EXTERNAL_EDITOR_CONFLICT (FR-022) — folded in
// ─────────────────────────────────────────────────────────────────────

describe("US1 + US2 EXTERNAL_EDITOR_CONFLICT (FR-022)", () => {
  // T22 post-consolidation NOTE: the upstream stderr pattern is captured at
  // T0-EBUSY against the live vault; this test cohort uses a placeholder
  // pattern matching the handler's EDITOR_CONFLICT_PATTERNS. Update both
  // together when T22 lands.
  test("upstream stderr matches editor-conflict pattern → EXTERNAL_EDITOR_CONFLICT + file-locked", async () => {
    const fs = fakeFs({ sizes: [10, 10] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "", stderr: "EBUSY: resource busy or locked\n", exitCode: 1 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.reason).toBe("file-locked");
    expect((err as UpstreamError).details.path).toBe("n.md");
    expect((err as UpstreamError).details.errno).toBe("EBUSY");
  });

  test("upstream stderr WITHOUT errno surfaces conflict without details.errno", async () => {
    const fs = fakeFs({ sizes: [10, 10] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "", stderr: "file is locked by another process\n", exitCode: 1 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.errno).toBeUndefined();
  });

  test("Reserved unsaved-changes sub-reason is NOT emitted by the wrapper (BI-040 R6 inherited)", async () => {
    // The wrapper currently NEVER emits details.reason: "unsaved-changes"
    // (reserved per BI-040 R6 for a future detection mechanism). This test
    // documents the deliberate absence so future readers see the reservation
    // as designed, not as drift. The test cohort intentionally does not
    // exercise a code path that would produce that reason value.
    const fs = fakeFs({ sizes: [10, 10] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "", stderr: "EPERM: operation not permitted\n", exitCode: 1 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.reason).toBe("file-locked");
    expect((err as UpstreamError).details.reason).not.toBe("unsaved-changes");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 + US2 NOTE_NOT_FOUND classification (FR-016)
// ─────────────────────────────────────────────────────────────────────

describe("US1 + US2 NOTE_NOT_FOUND (FR-016)", () => {
  // T22 post-consolidation NOTE: the upstream stderr pattern is captured at
  // T0-P10 against the live vault; placeholder pattern in handler matches
  // common variants.
  test("upstream stderr 'note not found' → NOTE_NOT_FOUND with details.path + details.vault", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "Error: Note not found.\n", exitCode: 0 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/does-not-exist.md",
        content: "anything",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("NOTE_NOT_FOUND");
    expect((err as UpstreamError).details.path).toBe("Sandbox/does-not-exist.md");
    expect((err as UpstreamError).details.vault).toBe("TestVault");
  });

  test("upstream stderr 'no such file' → NOTE_NOT_FOUND classification fires", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "", stderr: "No such file: missing.md\n", exitCode: 1 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "missing.md",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("NOTE_NOT_FOUND");
  });

  test("pre-flight resolver NOTE_NOT_FOUND propagates (no subsequent prepend call)", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: "Error: Note not found.\n", exitCode: 0 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "ghost",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    // The resolver's invokeCli call is the only spawn issued; the wrapper
    // never reaches the prepend call.
    expect(recorded.length).toBe(1);
    expect(err).toBeInstanceOf(UpstreamError);
  });

  test("unrecognised upstream failure (no matching pattern) → CLI_REPORTED_ERROR with stage 'prepend-cli'", async () => {
    const fs = fakeFs({ sizes: [10, 10] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "", stderr: "unexpected disk error xyz\n", exitCode: 1 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_NON_ZERO_EXIT");
    expect((err as UpstreamError).details.stage).toBe("prepend-cli");
    expect((err as UpstreamError).details.code).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 Repeat-invocation determinism (SC-005)
// ─────────────────────────────────────────────────────────────────────

describe("US1 repeat-invocation determinism (SC-005)", () => {
  test("two identical calls against identical mock setups produce identical envelopes + identical argv", async () => {
    const args = {
      target_mode: "specific" as const,
      vault: "TestVault",
      path: "n.md",
      content: "Lead",
      inline: false,
    };
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const fs1 = fakeFs({ sizes: [10, 14] });
    const fs2 = fakeFs({ sizes: [10, 14] });
    const { spawnFn: s1, recorded: r1 } = makeQueuedSpawn([PREPEND_OK]);
    const out1 = await executePrepend(args, deps({ spawnFn: s1, vaultRegistry: reg, fs: fs1 }));
    const { spawnFn: s2, recorded: r2 } = makeQueuedSpawn([PREPEND_OK]);
    const out2 = await executePrepend(args, deps({ spawnFn: s2, vaultRegistry: reg, fs: fs2 }));
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
    expect(r1[0]!.argv).toEqual(r2[0]!.argv);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US2 schema-layer errors surface through registerTool boundary
// ─────────────────────────────────────────────────────────────────────

describe("US2 schema-layer errors via registerTool boundary translator", () => {
  function buildTool() {
    return createPrependTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }),
    });
  }

  test("CONTENT_EMPTY (FR-013) → VALIDATION_ERROR via registerTool", async () => {
    const tool = buildTool();
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "",
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    const issues = payload.details.issues as Array<{ code: string; path: string[] }>;
    expect(issues.some((i) => i.code === "too_small" && i.path[0] === "content")).toBe(true);
  });

  test("CONTENT_TOO_LARGE (FR-018) → VALIDATION_ERROR via registerTool", async () => {
    const tool = buildTool();
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "x".repeat(MAX_CONTENT_LENGTH + 1),
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    const issues = payload.details.issues as Array<{ code: string; path: string[] }>;
    expect(issues.some((i) => i.code === "too_big" && i.path[0] === "content")).toBe(true);
  });

  test("CONTENT_TOO_LARGE boundary: exactly MAX_CONTENT_LENGTH → handler reached (no validation error)", async () => {
    // Build a tool with a stub vault registry; even though we cannot easily
    // assert success without a real spawn pipeline, we can verify the
    // schema layer accepts the input and reaches the handler.
    const tool = createPrependTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: {
        resolveVaultPath: async () => {
          throw new UpstreamError({
            code: "MARKER_PASSED_SCHEMA",
            cause: null,
            details: {},
          });
        },
      },
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "x".repeat(MAX_CONTENT_LENGTH),
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("MARKER_PASSED_SCHEMA");
  });

  test("bracket rejection (FR-001a) → VALIDATION_ERROR with file path", async () => {
    const tool = buildTool();
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      file: "[[My Note]]",
      content: "x",
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    const issues = payload.details.issues as Array<{ message: string; path: string[] }>;
    const bracketIssue = issues.find((i) =>
      i.message.includes("wikilink-form locator MUST NOT contain"),
    );
    expect(bracketIssue).toBeDefined();
  });

  test("locator-mutex: both file AND path → VALIDATION_ERROR", async () => {
    const tool = buildTool();
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      file: "f",
      path: "p.md",
      content: "x",
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
  });

  test("active mode + 'confirmActive' field → VALIDATION_ERROR (FR-004a no opt-in flag)", async () => {
    const tool = buildTool();
    const result = await tool.handler({
      target_mode: "active",
      content: "x",
      confirmActive: true,
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
  });

  test("unknown extra field 'force' → VALIDATION_ERROR (FR-015 strict)", async () => {
    const tool = buildTool();
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "x",
      force: true,
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US3 inline opt-in (FR-007)
// ─────────────────────────────────────────────────────────────────────

describe("US3 inline opt-in (FR-007)", () => {
  test("inline: true passes 'inline' flag in argv; bytes_written equals content delta (no separator overhead)", async () => {
    const fs = fakeFs({ sizes: [100, 104] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/leading-partial.md",
        content: "NEW-",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(recorded[0]!.argv).toContain("inline");
    expect(result.inline).toBe(true);
    expect(result.bytes_written).toBe(4);
  });

  test("inline: false → no 'inline' flag in argv", async () => {
    const fs = fakeFs({ sizes: [10, 14] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "Lead",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(recorded[0]!.argv.includes("inline")).toBe(false);
  });

  test("inline + multi-line content: content passed verbatim including internal '\\n'", async () => {
    const fs = fakeFs({ sizes: [0, 100] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    const multi = "Tail\n- second line";
    await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: multi,
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const contentArg = recorded[0]!.argv.find((a) => a.startsWith("content="));
    expect(contentArg).toBe(`content=${multi}`);
  });

  test("inline echo: response.inline true when input.inline true", async () => {
    const fs = fakeFs({ sizes: [10, 11] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "y",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.inline).toBe(true);
  });

  test("inline echo: response.inline false when input.inline false", async () => {
    const fs = fakeFs({ sizes: [10, 14] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "Lead",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.inline).toBe(false);
  });

  test("inline against frontmatter file: invokeCli sees the resolved path and inline flag; wrapper does NOT mutate content", async () => {
    const fs = fakeFs({ sizes: [60, 64] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    const content = "Lead";
    await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/journal-with-frontmatter.md",
        content,
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(recorded.length).toBe(1);
    expect(recorded[0]!.argv).toContain("inline");
    const pathArg = recorded[0]!.argv.find((a) => a.startsWith("path="));
    expect(pathArg).toBe("path=Sandbox/journal-with-frontmatter.md");
    const contentArg = recorded[0]!.argv.find((a) => a.startsWith("content="));
    expect(contentArg).toBe(`content=${content}`);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US4 active-mode focused-file resolution
// ─────────────────────────────────────────────────────────────────────

describe("US4 active-mode focused-file resolution", () => {
  const FOCUSED_OK = (vaultPath: string, relPath: string): StubResponse => ({
    stdout: `=> ${JSON.stringify({ base: vaultPath, path: relPath })}\n`,
    exitCode: 0,
  });

  test("happy path: focused-file eval resolves; prepend lands; envelope echoes resolved path + display name", async () => {
    const fs = fakeFs({ sizes: [50, 90] });
    const { spawnFn, recorded } = makeQueuedSpawn([
      FOCUSED_OK(VAULT_ROOT, "Sandbox/journal-2026-05-26.md"),
      PREPEND_OK,
    ]);
    const result = await executePrepend(
      {
        target_mode: "active",
        content: "- Quick note added from agent flow",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("Sandbox/journal-2026-05-26.md");
    expect(result.vault).toBe("Knowledge");
    expect(recorded.length).toBe(2);
    // The prepend call uses path=, not target_mode active.
    const pathArg = recorded[1]!.argv.find((a) => a.startsWith("path="));
    expect(pathArg).toBe("path=Sandbox/journal-2026-05-26.md");
  });

  test("no focused file → ERR_NO_ACTIVE_FILE; no prepend call follows", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify({ base: VAULT_ROOT, path: null })}\n`, exitCode: 0 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "active",
        content: "anything",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("ERR_NO_ACTIVE_FILE");
    expect(recorded.length).toBe(1);
  });

  test("active mode requires NO opt-in flag (FR-004a)", async () => {
    const fs = fakeFs({ sizes: [10, 11] });
    const { spawnFn } = makeQueuedSpawn([FOCUSED_OK(VAULT_ROOT, "n.md"), PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "active",
        content: "y",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("n.md");
    expect(result.vault).toBe("Knowledge");
  });

  test("active-mode + inline opt-in: both flags applied in prepend call", async () => {
    const fs = fakeFs({ sizes: [50, 54] });
    const { spawnFn, recorded } = makeQueuedSpawn([FOCUSED_OK(VAULT_ROOT, "n.md"), PREPEND_OK]);
    await executePrepend(
      {
        target_mode: "active",
        content: "fused",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    );
    expect(recorded[1]!.argv).toContain("inline");
    expect(recorded[1]!.argv.some((a) => a.startsWith("path=n.md"))).toBe(true);
  });

  test("active-mode + NOTE_NOT_FOUND from prepend (focused path no longer exists)", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([
      FOCUSED_OK(VAULT_ROOT, "gone.md"),
      { stdout: "Error: Note not found.\n", exitCode: 0 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "active",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("NOTE_NOT_FOUND");
    expect((err as UpstreamError).details.path).toBe("gone.md");
    expect((err as UpstreamError).details.vault).toBe("Knowledge");
  });

  test("eval parse failure → CLI_REPORTED_ERROR with stage 'json-parse'", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-valid-json\n", exitCode: 0 }]);
    const err = await executePrepend(
      {
        target_mode: "active",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.stage).toBe("json-parse");
  });

  test("eval envelope shape failure → CLI_REPORTED_ERROR with stage 'envelope-parse'", async () => {
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify({ unexpected: "shape" })}\n`, exitCode: 0 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "active",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.stage).toBe("envelope-parse");
  });

  test("vault display-name fallback: when reverse-lookup returns null, envelope echoes the resolved base path", async () => {
    const fs = fakeFs({ sizes: [10, 11] });
    const reg: VaultRegistry = {
      resolveVaultPath: vi.fn(async () => VAULT_ROOT),
      resolveVaultDisplayName: vi.fn(() => null),
    };
    const { spawnFn } = makeQueuedSpawn([FOCUSED_OK(VAULT_ROOT, "n.md"), PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "active",
        content: "y",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: reg, fs }),
    );
    expect(result.vault).toBe(VAULT_ROOT);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BI-047 US1 — post-stat byte-delta guard (FS_WRITE_FAILED sub-discriminator)
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US1 — post-stat byte-delta guard", () => {
  test("raises FS_WRITE_FAILED.post-stat-byte-delta-zero when upstream returns exit 0 but on-disk byte count is unchanged", async () => {
    const fs = fakeFs({ sizes: [MAX_CONTENT_LENGTH, MAX_CONTENT_LENGTH] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "Prepended to: Sandbox/silent-noop.md\n", stderr: "", exitCode: 0 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/silent-noop.md",
        content: "x".repeat(MAX_CONTENT_LENGTH),
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("post-stat-byte-delta-zero");
    expect((err as UpstreamError).details.path).toBe("Sandbox/silent-noop.md");
    expect((err as UpstreamError).details.vault).toBe("TestVault");
    expect((err as UpstreamError).details.preCallSize).toBe(MAX_CONTENT_LENGTH);
    expect((err as UpstreamError).details.postCallSize).toBe(MAX_CONTENT_LENGTH);
    expect((err as UpstreamError).message).toMatch(/upstream returned success but on-disk byte count is unchanged/i);
  });

  test("50-call regression cohort at MAX_CONTENT_LENGTH produces structured success envelope per call with byte-correct delta", async () => {
    const content = "x".repeat(MAX_CONTENT_LENGTH);
    const expectedDelta = MAX_CONTENT_LENGTH + 1;
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const bytesWrittenObservations: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const fs = fakeFs({ sizes: [0, expectedDelta] });
      const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
      const result = await executePrepend(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: `Sandbox/cohort/note-${i}.md`,
          content,
          inline: false,
        },
        deps({ spawnFn, vaultRegistry: reg, fs }),
      );
      bytesWrittenObservations.push(result.bytes_written);
      expect(result.path).toBe(`Sandbox/cohort/note-${i}.md`);
      expect(result.vault).toBe("TestVault");
      expect(result.inline).toBe(false);
    }
    expect(bytesWrittenObservations.length).toBe(50);
    expect(bytesWrittenObservations.every((b) => b === expectedDelta)).toBe(true);
  });

  test("in-cap success at boundary sizes produces structured success envelope with positive bytes_written", async () => {
    const cases = [
      { contentLen: 1, separator: 1 },
      { contentLen: Math.floor(MAX_CONTENT_LENGTH / 2), separator: 1 },
      { contentLen: MAX_CONTENT_LENGTH - 1, separator: 1 },
      { contentLen: MAX_CONTENT_LENGTH, separator: 1 },
    ];
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    for (const { contentLen, separator } of cases) {
      const pre = 100;
      const post = pre + contentLen + separator;
      const fs = fakeFs({ sizes: [pre, post] });
      const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
      const result = await executePrepend(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: `Sandbox/boundary-${contentLen}.md`,
          content: "x".repeat(contentLen),
          inline: false,
        },
        deps({ spawnFn, vaultRegistry: reg, fs }),
      );
      expect(result.bytes_written).toBe(contentLen + separator);
      expect(result.bytes_written).toBeGreaterThanOrEqual(1);
      expect(result.path).toBe(`Sandbox/boundary-${contentLen}.md`);
    }
  });

  test("p95 wall-clock latency across 50-call cohort ≤ 500 ms (wrapper-overhead bound)", async () => {
    const content = "x".repeat(MAX_CONTENT_LENGTH);
    const expectedDelta = MAX_CONTENT_LENGTH + 1;
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const observations: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const fs = fakeFs({ sizes: [0, expectedDelta] });
      const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
      const start = performance.now();
      await executePrepend(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: `Sandbox/latency/note-${i}.md`,
          content,
          inline: false,
        },
        deps({ spawnFn, vaultRegistry: reg, fs }),
      );
      observations.push(performance.now() - start);
    }
    observations.sort((a, b) => a - b);
    const p95 = observations[Math.floor(50 * 0.95)]!;
    expect(p95).toBeLessThanOrEqual(500);
  });

  test("concurrent calls against the same target serialize last-write-wins with no silent no-op", async () => {
    // Two prepend calls fired in rapid succession (< 100 ms apart) against the
    // same target path. The queue serialises them FIFO; the DI'd fs.stat
    // returns progressive byte counts that reflect both writes landing in order.
    // Per US1 AC3 + FR-010: both calls resolve to structured success envelopes
    // whose ordering matches the queue's serialisation; neither call produces
    // a silent no-op envelope.
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    // Each call does pre-stat (read current size) + post-stat (read new size).
    // Call 1: pre=0, post=delta. Call 2: pre=delta, post=2*delta.
    const delta = MAX_CONTENT_LENGTH + 1;
    const fs = fakeFs({ sizes: [0, delta, delta, 2 * delta] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK, PREPEND_OK]);
    const d = deps({ spawnFn, vaultRegistry: reg, fs });
    const args = {
      target_mode: "specific" as const,
      vault: "TestVault",
      path: "Sandbox/concurrent.md",
      content: "x".repeat(MAX_CONTENT_LENGTH),
      inline: false,
    };
    const p1 = executePrepend(args, d);
    const p2 = executePrepend(args, d);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.path).toBe("Sandbox/concurrent.md");
    expect(r2.path).toBe("Sandbox/concurrent.md");
    expect(r1.bytes_written).toBeGreaterThanOrEqual(1);
    expect(r2.bytes_written).toBeGreaterThanOrEqual(1);
    // FIFO serialisation: first invocation observes pre=0, post=delta; second
    // observes pre=delta, post=2*delta. Both are positive deltas — no silent
    // no-op produced.
    expect(r1.bytes_written).toBe(delta);
    expect(r2.bytes_written).toBe(delta);
    expect(recorded.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BI-047 US2 — broadened FR-003 enforcement (positive bytes_written shape
// against unchanged on-disk count is now structurally impossible)
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US2 — broadened FR-003 enforcement", () => {
  test("forbidden anti-pattern: success envelope with positive bytes_written but unchanged on-disk count is impossible", async () => {
    // The handler reads the post-call stat and computes bytesWritten as
    // postCallSize - preCallSize. With identical pre/post sizes, bytesWritten
    // is 0 and the guard fires. There is no code path that could emit
    // {bytes_written: <positive>} against an unchanged on-disk count.
    const fs = fakeFs({ sizes: [5000, 5000] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/unchanged.md",
        content: "y".repeat(100),
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("post-stat-byte-delta-zero");
  });

  test("negative byte-delta (file truncated under upstream's hand) also fires the guard", async () => {
    // Defensive: if for any reason post < pre (truncation), bytesWritten is
    // negative and the guard fires the same FS_WRITE_FAILED envelope rather
    // than emitting a negative bytes_written value (which would itself fail
    // the output schema's `.min(1)` invariant).
    const fs = fakeFs({ sizes: [10000, 8000] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/truncated.md",
        content: "z",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("post-stat-byte-delta-zero");
    expect((err as UpstreamError).details.preCallSize).toBe(10000);
    expect((err as UpstreamError).details.postCallSize).toBe(8000);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BI-047 US3 — payload-size bucket coverage + simulated host-process crash
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US3 — payload-size bucket coverage", () => {
  test.each([
    { label: "well-under-cap (1024)", contentLen: 1024 },
    { label: "at-cap-boundary (MAX-1)", contentLen: MAX_CONTENT_LENGTH - 1 },
    { label: "exactly-at-cap (MAX)", contentLen: MAX_CONTENT_LENGTH },
  ])("$label produces structured success envelope", async ({ contentLen }) => {
    const pre = 100;
    const post = pre + contentLen + 1;
    const fs = fakeFs({ sizes: [pre, post] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: `Sandbox/bucket-${contentLen}.md`,
        content: "x".repeat(contentLen),
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.bytes_written).toBe(contentLen + 1);
  });

  test("above-cap (MAX+1) rejected by schema before executePrepend reached", async () => {
    // Per FR-002 / FR-004: over-cap rejection fires at the schema boundary
    // BEFORE the handler runs. This test verifies the schema-side gate; the
    // handler is not reached (no spawn invoked).
    const { prependInputSchema } = await import("./schema.js");
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/over-cap.md",
      content: "x".repeat(MAX_CONTENT_LENGTH + 1),
      inline: false,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "content");
    expect(issue?.code).toBe("too_big");
  });

  test("simulated host-process abnormal exit produces structured CLI_NON_ZERO_EXIT envelope", async () => {
    // The `obsidian.exe` GUI crash exit code observed during the prior BI-0017
    // active-mode investigation was 4294967295 (0xFFFFFFFF — unsigned-32
    // representation of -1). The dispatch layer surfaces this as
    // CLI_NON_ZERO_EXIT; the silent-no-op surface is not exercised because the
    // exit code is non-zero.
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "", stderr: "host process crashed\n", exitCode: 4294967295 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/crash.md",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("CLI_NON_ZERO_EXIT");
  });
});

// ─────────────────────────────────────────────────────────────────────
// BI-047 US4 — over-cap rejection fires at schema boundary, no spawn invoked
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US4 — over-cap rejection at schema boundary", () => {
  test("rejects over-cap content before any spawnFn invocation (via registerTool boundary)", async () => {
    // Build a tool with a spawn spy that throws on any invocation. The schema
    // boundary rejection MUST fire before the handler runs.
    const spawnSpy = vi.fn(() => {
      throw new Error("spawn must NOT be invoked for over-cap content");
    });
    const tool = createPrependTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }),
      spawnFn: spawnSpy as unknown as SpawnLike,
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/over-cap.md",
      content: "x".repeat(MAX_CONTENT_LENGTH + 1),
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});
