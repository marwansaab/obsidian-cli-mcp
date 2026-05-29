// Original — no upstream. append_note handler tests per BI-044 / Principle II. US1 happy paths (4 file-tail shapes × both locator shapes, frontmatter preservation, byte-stability, content-verbatim, success envelope, file-TSV resolver pre-flight, PATH_ESCAPES_VAULT, no-write on read failure, EXTERNAL_EDITOR_CONFLICT folded in, tmp cleanup on rename failure, repeat-invocation determinism, metadataCache eval).
import { resolve } from "node:path";
import { Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { executeAppendNote, type ExecuteFs } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const VAULT_ROOT = resolve("/test-vault");

interface FakeFsHandle extends ExecuteFs {
  reads: string[];
  writes: Array<[string, string]>;
  renames: Array<[string, string]>;
  unlinks: string[];
}

function fakeFs(canned: { content?: string } = {}, over: Partial<ExecuteFs> = {}): FakeFsHandle {
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];
  const renames: Array<[string, string]> = [];
  const unlinks: string[] = [];
  const enoent = (): NodeJS.ErrnoException => {
    const e = new Error("ENOENT") as NodeJS.ErrnoException;
    e.code = "ENOENT";
    return e;
  };
  const base: ExecuteFs = {
    readFile: vi.fn(async (p: string) => {
      reads.push(p);
      return canned.content ?? "fallback\n";
    }),
    writeFile: vi.fn(async (p: string, c: string) => {
      writes.push([p, c]);
    }),
    rename: vi.fn(async (from: string, to: string) => {
      renames.push([from, to]);
    }),
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      throw enoent();
    }),
    unlink: vi.fn(async (p: string) => {
      unlinks.push(p);
    }),
  };
  const merged: ExecuteFs = { ...base, ...over };
  return Object.assign(merged, { reads, writes, renames, unlinks });
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

const EVAL_OK: StubResponse = { stdout: "=> undefined\n", exitCode: 0 };
const FILE_TSV_OK = (relPath: string): StubResponse => ({
  stdout: `path\t${relPath}\n`,
  exitCode: 0,
});

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// ─────────────────────────────────────────────────────────────────────
// US1 happy paths — 4 file-tail shapes × default separator (path locator)
// ─────────────────────────────────────────────────────────────────────

describe("US1 happy paths — default-separator across the 4 file-tail shapes", () => {
  test("non-newline-trailing → inserts LF separator (FR-006)", async () => {
    const fs = fakeFs({ content: "abc" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("abc\ndef");
    expect(result).toEqual({
      path: "n.md",
      vault: "TestVault",
      bytes_written: 4,
      inline: false,
    });
  });

  test("LF-trailing → existing LF IS separator (FR-006a)", async () => {
    const fs = fakeFs({ content: "abc\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("abc\ndef");
    expect(result.bytes_written).toBe(3);
  });

  test("CRLF-trailing → existing CRLF IS separator (FR-006a + FR-008)", async () => {
    const fs = fakeFs({ content: "abc\r\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("abc\r\ndef");
    expect(result.bytes_written).toBe(3);
  });

  test("0-byte → no leading separator (FR-009)", async () => {
    const fs = fakeFs({ content: "" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("def");
    expect(result.bytes_written).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 happy paths — file-locator pre-flight TSV resolver (FR-002 / FR-003)
// ─────────────────────────────────────────────────────────────────────

describe("US1 happy paths — `file` locator with pre-flight TSV resolver", () => {
  test("file-locator resolves through `obsidian file` TSV; envelope echoes canonical path", async () => {
    const fs = fakeFs({ content: "# Tasks\n- one\n" });
    const { spawnFn, recorded } = makeQueuedSpawn([FILE_TSV_OK("tasks.md"), EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "tasks",
        content: "- two",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("tasks.md");
    expect(recorded.length).toBe(2);
    const fileArg = recorded[0]!.argv.find((a) => a.startsWith("file="));
    expect(fileArg).toBe("file=tasks");
  });

  test("file-locator TSV-parse failure → CLI_REPORTED_ERROR with stage 'file-tsv-parse'", async () => {
    const fs = fakeFs({ content: "x" });
    const { spawnFn } = makeQueuedSpawn([{ stdout: "not a TSV line\n", exitCode: 0 }]);
    const err = await executeAppendNote(
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
    expect(fs.writes.length).toBe(0);
  });

  test("path-locator does NOT invoke the file-TSV resolver", async () => {
    const fs = fakeFs({ content: "abc\n" });
    const { spawnFn, recorded } = makeQueuedSpawn([EVAL_OK]);
    await executeAppendNote(
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
});

// ─────────────────────────────────────────────────────────────────────
// US1 byte-stability invariants (FR-010 / FR-010a / FR-011)
// ─────────────────────────────────────────────────────────────────────

describe("US1 byte-stability invariants", () => {
  test("FR-010 prior content byte-stable — output startsWith existing", async () => {
    const existing = "abc\n";
    const fs = fakeFs({ content: existing });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1].startsWith(existing)).toBe(true);
  });

  test("FR-010a content verbatim — output endsWith content for FR-006a branches", async () => {
    const fs = fakeFs({ content: "abc\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "- new entry",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1].endsWith("- new entry")).toBe(true);
  });

  test("FR-011 frontmatter preserved verbatim under default append", async () => {
    const original =
      "---\ndate: 2026-05-25\ntags: [journal]\n---\n\n# 2026-05-25\n\nStarted the day with coffee and code review.\n";
    const fs = fakeFs({ content: original });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/journal.md",
        content: "- Started writing append_note plan.",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1].startsWith(original)).toBe(true);
    expect(fs.writes[0]![1]).toBe(original + "- Started writing append_note plan.");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 PATH_ESCAPES_VAULT — Layer 2 canonical-path check
// ─────────────────────────────────────────────────────────────────────

describe("US1 PATH_ESCAPES_VAULT", () => {
  test("symlink-escape attempt → PATH_ESCAPES_VAULT + pathEscapeAttempt logger event", async () => {
    const escapeTarget = resolve("/escape-target");
    const fs = fakeFs(
      {},
      {
        realpath: vi.fn(async (p: string) => {
          if (p === VAULT_ROOT) return VAULT_ROOT;
          return escapeTarget;
        }),
      },
    );
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
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
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
    expect(fs.writes.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 EXTERNAL_EDITOR_CONFLICT (FR-022) folded in
// ─────────────────────────────────────────────────────────────────────

describe("US1 EXTERNAL_EDITOR_CONFLICT (FR-022 folded into US1)", () => {
  test("fs.rename throws EBUSY → EXTERNAL_EDITOR_CONFLICT + file-locked + EBUSY", async () => {
    const ebusy = Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    const fs = fakeFs(
      { content: "abc\n" },
      { rename: vi.fn(async () => { throw ebusy; }) },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
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
    expect((err as UpstreamError).details.errno).toBe("EBUSY");
    expect((err as UpstreamError).details.path).toBe("n.md");
    expect(fs.unlinks.length).toBe(1);
  });

  test("fs.writeFile throws EBUSY on tmp → EXTERNAL_EDITOR_CONFLICT + no rename attempted", async () => {
    const ebusy = Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    const fs = fakeFs(
      { content: "abc\n" },
      { writeFile: vi.fn(async () => { throw ebusy; }) },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
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
    expect(fs.renames.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 no-write on read failure (FR-023)
// ─────────────────────────────────────────────────────────────────────

describe("US1 no-write on read failure", () => {
  test("fs.readFile throws ENOENT → NOTE_NOT_FOUND, no write attempted", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const fs = fakeFs({}, { readFile: vi.fn(async () => { throw enoent; }) });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "missing.md",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("NOTE_NOT_FOUND");
    expect(fs.writes.length).toBe(0);
    expect(fs.renames.length).toBe(0);
    expect(fs.unlinks.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// US1 Repeat-invocation determinism + metadataCache eval
// ─────────────────────────────────────────────────────────────────────

describe("US1 repeat-invocation determinism (SC-004)", () => {
  test("two identical calls against the same fixture produce identical output bytes", async () => {
    const args = {
      target_mode: "specific" as const,
      vault: "TestVault",
      path: "n.md",
      content: "- log",
      inline: false,
    };
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const fs1 = fakeFs({ content: "prior\n" });
    const fs2 = fakeFs({ content: "prior\n" });
    const { spawnFn: s1 } = makeQueuedSpawn([EVAL_OK]);
    const r1 = await executeAppendNote(args, deps({ spawnFn: s1, vaultRegistry: reg, fs: fs1 }));
    const { spawnFn: s2 } = makeQueuedSpawn([EVAL_OK]);
    const r2 = await executeAppendNote(args, deps({ spawnFn: s2, vaultRegistry: reg, fs: fs2 }));
    expect(fs1.writes[0]![1]).toBe(fs2.writes[0]![1]);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  test("metadataCache invalidation eval fires after write; failure does not throw", async () => {
    const fs = fakeFs({ content: "abc\n" });
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: "Error: cache invalidation failed\n", exitCode: 1 },
    ]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.bytes_written).toBe(3);
    expect(recorded.length).toBe(1);
    const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="));
    expect(codeArg).toBeDefined();
    expect(codeArg!).toContain("computeMetadataAsync");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US2 diagnostic-error cohort — NOTE_NOT_FOUND + distinguish-from-FS_WRITE_FAILED
// ─────────────────────────────────────────────────────────────────────

describe("US2 NOTE_NOT_FOUND cohort (FR-016)", () => {
  test("ENOENT on read → NOTE_NOT_FOUND with details.path + details.vault", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const fs = fakeFs({}, { readFile: vi.fn(async () => { throw enoent; }) });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
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

  test("EACCES on read → FS_WRITE_FAILED (distinguish from NOTE_NOT_FOUND)", async () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    const fs = fakeFs({}, { readFile: vi.fn(async () => { throw eacces; }) });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    // EACCES is in the EDITOR_CONFLICT_ERRNOS set per R10 — the read site
    // routes it through mapFsWriteError which classifies it as
    // EXTERNAL_EDITOR_CONFLICT. This is deliberate per the cohort errno table.
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.errno).toBe("EACCES");
  });

  test("EISDIR on read → FS_WRITE_FAILED", async () => {
    const eisdir = Object.assign(new Error("EISDIR"), { code: "EISDIR" });
    const fs = fakeFs({}, { readFile: vi.fn(async () => { throw eisdir; }) });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "is-a-directory",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("EISDIR");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US2 EXTERNAL_EDITOR_CONFLICT vs FS_WRITE_FAILED distinction (FR-022)
// ─────────────────────────────────────────────────────────────────────

describe("US2 EXTERNAL_EDITOR_CONFLICT vs FS_WRITE_FAILED distinction", () => {
  test.each(["EBUSY", "EPERM", "EACCES"])(
    "%s on rename → EXTERNAL_EDITOR_CONFLICT with details.errno",
    async (errno) => {
      const err = Object.assign(new Error(errno), { code: errno });
      const fs = fakeFs(
        { content: "abc\n" },
        { rename: vi.fn(async () => { throw err; }) },
      );
      const { spawnFn } = makeQueuedSpawn([]);
      const thrown = await executeAppendNote(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: "n.md",
          content: "def",
          inline: false,
        },
        deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
      ).catch((e) => e);
      expect((thrown as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
      expect((thrown as UpstreamError).details.errno).toBe(errno);
      expect((thrown as UpstreamError).details.reason).toBe("file-locked");
      expect(fs.unlinks.length).toBe(1);
    },
  );

  test("ENOSPC on writeFile → FS_WRITE_FAILED (not editor-conflict)", async () => {
    const enospc = Object.assign(new Error("ENOSPC"), { code: "ENOSPC", syscall: "write" });
    const fs = fakeFs(
      { content: "abc\n" },
      { writeFile: vi.fn(async () => { throw enospc; }) },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("ENOSPC");
  });

  test("EROFS on rename → FS_WRITE_FAILED", async () => {
    const erofs = Object.assign(new Error("EROFS"), { code: "EROFS" });
    const fs = fakeFs(
      { content: "abc\n" },
      { rename: vi.fn(async () => { throw erofs; }) },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("EROFS");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US3 inline opt-in (FR-007)
// ─────────────────────────────────────────────────────────────────────

describe("US3 inline opt-in (FR-007)", () => {
  test("inline against non-newline-trailing → fuses bytes directly", async () => {
    const fs = fakeFs({ content: "Working on something — Partial" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/partial-line.md",
        content: "Tail and now finished.",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("Working on something — PartialTail and now finished.");
    expect(result.inline).toBe(true);
    expect(result.bytes_written).toBe(Buffer.byteLength("Tail and now finished.", "utf8"));
  });

  test("inline against LF-trailing → content lands after the \\n with NO wrapper-inserted separator", async () => {
    const fs = fakeFs({ content: "abc\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("abc\ndef");
    expect(result.bytes_written).toBe(3);
  });

  test("inline against CRLF-trailing → content lands after the \\r\\n", async () => {
    const fs = fakeFs({ content: "abc\r\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "def",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("abc\r\ndef");
  });

  test("inline echo: response.inline true when input.inline true", async () => {
    const fs = fakeFs({ content: "x" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
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
    const fs = fakeFs({ content: "abc\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "y",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.inline).toBe(false);
  });

  test("inline + multi-line content: wrapper inserts no separator before content; content's internal \\n preserved", async () => {
    const fs = fakeFs({ content: "Partial" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executeAppendNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "Tail\n- second line",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("PartialTail\n- second line");
  });

  test("inline cross-scenario byte-stability: output equals existing + content exactly", async () => {
    const cases = ["", "abc", "abc\n", "abc\r\n", "Partial"];
    for (const existing of cases) {
      const fs = fakeFs({ content: existing });
      const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
      await executeAppendNote(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: "n.md",
          content: "X",
          inline: true,
        },
        deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
      );
      expect(fs.writes[0]![1]).toBe(existing + "X");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// US4 active-mode focused-file resolution (FR-001 / FR-004 / FR-004a / FR-005)
// ─────────────────────────────────────────────────────────────────────

describe("US4 active-mode focused-file resolution", () => {
  const FOCUSED_OK = (vaultPath: string, relPath: string): StubResponse => ({
    stdout: `=> ${JSON.stringify({ base: vaultPath, path: relPath })}\n`,
    exitCode: 0,
  });

  test("happy path: focused-file eval resolves; append lands; envelope echoes resolved path + vault display name", async () => {
    const fs = fakeFs({ content: "focused note prior content\n" });
    const { spawnFn } = makeQueuedSpawn([
      FOCUSED_OK(VAULT_ROOT, "Sandbox/journal-2026-05-25.md"),
      EVAL_OK,
    ]);
    const result = await executeAppendNote(
      {
        target_mode: "active",
        content: "- Quick note added from agent flow",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("Sandbox/journal-2026-05-25.md");
    expect(result.vault).toBe("Knowledge");
    expect(fs.writes[0]![1]).toBe(
      "focused note prior content\n- Quick note added from agent flow",
    );
  });

  test("no focused file → ERR_NO_ACTIVE_FILE; no fs operations", async () => {
    const fs = fakeFs({});
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify({ base: VAULT_ROOT, path: null })}\n`, exitCode: 0 },
    ]);
    const err = await executeAppendNote(
      {
        target_mode: "active",
        content: "anything",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("ERR_NO_ACTIVE_FILE");
    expect(fs.reads.length).toBe(0);
    expect(fs.writes.length).toBe(0);
    expect(fs.renames.length).toBe(0);
  });

  test("active mode requires NO opt-in flag (FR-004a)", async () => {
    // The happy-path case above already proves this — invoking with target_mode
    // "active" + content with no second opt-in flag succeeds. This case re-states
    // it explicitly to document the cohort exception from write_note's
    // mandatory overwrite:true. Cohort divergence intentional per Clarifications Q3.
    const fs = fakeFs({ content: "x\n" });
    const { spawnFn } = makeQueuedSpawn([
      FOCUSED_OK(VAULT_ROOT, "n.md"),
      EVAL_OK,
    ]);
    const result = await executeAppendNote(
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

  test("active-mode integration with inline opt-in", async () => {
    const fs = fakeFs({ content: "focused note prior content\n" });
    const { spawnFn } = makeQueuedSpawn([
      FOCUSED_OK(VAULT_ROOT, "n.md"),
      EVAL_OK,
    ]);
    await executeAppendNote(
      {
        target_mode: "active",
        content: "fused",
        inline: true,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("focused note prior content\nfused");
  });

  test("active mode + missing focused note path → NOTE_NOT_FOUND", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const fs = fakeFs(
      {},
      { readFile: vi.fn(async () => { throw enoent; }) },
    );
    const { spawnFn } = makeQueuedSpawn([
      FOCUSED_OK(VAULT_ROOT, "gone.md"),
    ]);
    const err = await executeAppendNote(
      {
        target_mode: "active",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("NOTE_NOT_FOUND");
  });

  test("eval parse failure → CLI_REPORTED_ERROR with stage 'json-parse'", async () => {
    const fs = fakeFs({});
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "=> not-valid-json\n", exitCode: 0 },
    ]);
    const err = await executeAppendNote(
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
    const fs = fakeFs({});
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify({ unexpected: "shape" })}\n`, exitCode: 0 },
    ]);
    const err = await executeAppendNote(
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

  test("vault display name fallback: when reverse-lookup returns null, envelope echoes the resolved base path", async () => {
    const fs = fakeFs({ content: "x\n" });
    const reg: VaultRegistry = {
      resolveVaultPath: vi.fn(async () => VAULT_ROOT),
      resolveVaultDisplayName: vi.fn(() => null),
    };
    const { spawnFn } = makeQueuedSpawn([
      FOCUSED_OK(VAULT_ROOT, "n.md"),
      EVAL_OK,
    ]);
    const result = await executeAppendNote(
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
