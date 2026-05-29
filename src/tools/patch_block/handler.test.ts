// Original — no upstream. patch_block handler tests per BI-043 / Principle II. Covers US1 happy paths (all 3 success shapes — paragraph / list-item / separately-placed; empty-content acceptance; multi-line content; line-ending + trailing-newline preservation; frontmatter preservation; no-backup; repeat-invocation determinism; post-write metadataCache eval); US1 EXTERNAL_EDITOR_CONFLICT (EBUSY / EPERM) + FS_WRITE_FAILED (ENOSPC / EACCES) + PATH_ESCAPES_VAULT; US2 BLOCK_NOT_FOUND (missing id + fenced-code marker + mis-cased id + empty note); US2 BLOCK_ON_HEADING (ATX rank 1–6 + setext rank 1+2 + paragraph-followed-by-non-underline NOT promoted); US2 NOTE_NOT_FOUND vs FS_WRITE_FAILED distinction; US3 active mode (focused-file eval + ERR_NO_ACTIVE_FILE + eval parse / envelope failures + vault display-name reverse-lookup fallback).
import { resolve } from "node:path";
import { Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { executePatchBlock, type ExecuteFs } from "./handler.js";
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
      return canned.content ?? "fallback ^foo\n";
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

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// ─────────────────────────────────────────────────────────────────────
// US1 happy paths — three success block shapes
// ─────────────────────────────────────────────────────────────────────

describe("US1 happy paths — three success block shapes", () => {
  test("paragraph replace lands new body and preserves marker byte-stably", async () => {
    const note = "intro\n\nA simple paragraph. ^foo\n\nclosing\n";
    const fs = fakeFs({ content: note });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Replaced text.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("n.md");
    expect(result.vault).toBe("TestVault");
    expect(result.block_id).toBe("foo");
    expect(result.block_shape).toBe("paragraph");
    expect(result.bytes_written).toBeGreaterThan(0);
    expect(fs.writes[0]![1]).toBe("intro\n\nReplaced text. ^foo\n\nclosing\n");
  });

  test("list-item replace preserves '- ' prefix and sibling items", async () => {
    const note = "- sibling A\n- target ^bar\n- sibling B\n";
    const fs = fakeFs({ content: note });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "bar",
        content: "replaced",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.block_shape).toBe("list-item");
    expect(fs.writes[0]![1]).toBe("- sibling A\n- replaced ^bar\n- sibling B\n");
  });

  test("separately-placed replace against a table preserves marker line verbatim", async () => {
    const note =
      "| col1 | col2 |\n" +
      "| ---- | ---- |\n" +
      "| a    | b    |\n" +
      "^baz\n" +
      "trailing\n";
    const fs = fakeFs({ content: note });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const newTable =
      "| col1 | col2 |\n" +
      "| ---- | ---- |\n" +
      "| new1 | new2 |\n" +
      "| new3 | new4 |";
    const result = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "baz",
        content: newTable,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.block_shape).toBe("separately-placed");
    expect(fs.writes[0]![1]).toBe(
      "| col1 | col2 |\n| ---- | ---- |\n| new1 | new2 |\n| new3 | new4 |\n^baz\ntrailing\n",
    );
  });
});

describe("US1 empty-content acceptance (FR-007)", () => {
  test("paragraph with empty content → ' ^<id>' marker line", async () => {
    const fs = fakeFs({ content: "before\nBody. ^foo\nafter\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("before\n ^foo\nafter\n");
  });

  test("list-item with empty content preserves prefix byte-stably", async () => {
    const fs = fakeFs({ content: "- item ^foo\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("-  ^foo\n");
  });

  test("separately-placed with empty content collapses block to zero lines; marker line byte-stable", async () => {
    const fs = fakeFs({
      content: "| a | b |\n| - | - |\n^foo\nafter\n",
    });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("^foo\nafter\n");
  });
});

describe("US1 multi-line content", () => {
  test("paragraph: multi-line content lands as multiple lines with marker on last line", async () => {
    const fs = fakeFs({ content: "Original. ^foo\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Line 1.\nLine 2.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("Line 1.\nLine 2. ^foo\n");
  });
});

describe("US1 line-ending + trailing-newline preservation (FR-012 / FR-013)", () => {
  test("CRLF input → CRLF output across all three success shapes", async () => {
    const fs = fakeFs({ content: "intro\r\nBody. ^foo\r\nafter\r\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("intro\r\nReplaced. ^foo\r\nafter\r\n");
  });

  test("no trailing newline preserved", async () => {
    const fs = fakeFs({ content: "intro\nBody. ^foo" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1].endsWith("\n")).toBe(false);
    expect(fs.writes[0]![1]).toBe("intro\nReplaced. ^foo");
  });
});

describe("US1 frontmatter preservation (FR-014)", () => {
  test("note with leading YAML frontmatter is byte-stable in the modified output", async () => {
    const note =
      "---\n" +
      "date: 2026-05-25\n" +
      "tags: [daily]\n" +
      "---\n" +
      "\n" +
      "Real paragraph ^foo\n";
    const fs = fakeFs({ content: note });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    // Frontmatter bytes 0..32 (`---\ndate...\n---\n`) unchanged.
    expect(written.startsWith("---\ndate: 2026-05-25\ntags: [daily]\n---\n\n")).toBe(true);
    expect(written).toContain("Replaced. ^foo");
  });

  test("synthetic '^foo' inside frontmatter is NOT bound; body marker wins", async () => {
    const note =
      "---\n" +
      "decoy: text ^foo\n" +
      "---\n" +
      "\n" +
      "Real paragraph ^foo\n";
    const fs = fakeFs({ content: note });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    // Frontmatter decoy unchanged.
    expect(written).toContain("decoy: text ^foo");
    // Body paragraph patched.
    expect(written).toContain("Replaced. ^foo");
  });
});

describe("US1 PATH_ESCAPES_VAULT + FS_WRITE_FAILED", () => {
  test("symlink escape attempt → PATH_ESCAPES_VAULT + pathEscapeAttempt logger event", async () => {
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
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "subdir/escape.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs, logger }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("PATH_ESCAPES_VAULT");
    expect((err as UpstreamError).details.attemptedPath).toBe("subdir/escape.md");
    const escapeEvent = events.find((e) => e.event === "pathEscapeAttempt");
    expect(escapeEvent).toBeDefined();
    expect(fs.writes.length).toBe(0);
  });

  test("ENOSPC on writeFile → FS_WRITE_FAILED (NOT classified as editor-conflict)", async () => {
    const enospc = Object.assign(new Error("ENOSPC"), { code: "ENOSPC", syscall: "write" });
    const fs = fakeFs(
      { content: "body ^foo\n" },
      {
        writeFile: vi.fn(async () => {
          throw enospc;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("ENOSPC");
  });

  test("EACCES on writeFile → FS_WRITE_FAILED (cohort divergence: not editor-conflict for patch_block)", async () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES", syscall: "open" });
    const fs = fakeFs(
      { content: "body ^foo\n" },
      {
        writeFile: vi.fn(async () => {
          throw eacces;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("EACCES");
  });
});

describe("US1 EXTERNAL_EDITOR_CONFLICT (FR-021)", () => {
  test("fs.rename throws EBUSY → EXTERNAL_EDITOR_CONFLICT reason='file-locked' errno=EBUSY", async () => {
    const ebusy = Object.assign(new Error("EBUSY"), {
      code: "EBUSY",
      errno: -4082,
      syscall: "rename",
    });
    const fs = fakeFs(
      { content: "body ^foo\n" },
      {
        rename: vi.fn(async () => {
          throw ebusy;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.reason).toBe("file-locked");
    expect((err as UpstreamError).details.errno).toBe("EBUSY");
    expect((err as UpstreamError).details.path).toBe("n.md");
    // Tmp file was unlinked best-effort.
    expect(fs.unlinks.length).toBe(1);
  });

  test("fs.writeFile throws EPERM on tmp → EXTERNAL_EDITOR_CONFLICT errno=EPERM", async () => {
    const eperm = Object.assign(new Error("EPERM"), { code: "EPERM", syscall: "open" });
    const fs = fakeFs(
      { content: "body ^foo\n" },
      {
        writeFile: vi.fn(async () => {
          throw eperm;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.errno).toBe("EPERM");
  });
});

describe("US1 success envelope + IO invariants", () => {
  test("output envelope has exactly five keys", async () => {
    const fs = fakeFs({ content: "body ^foo\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(Object.keys(result).sort()).toEqual(
      ["block_id", "block_shape", "bytes_written", "path", "vault"],
    );
  });

  test("bytes_written equals Buffer.byteLength of written content", async () => {
    const fs = fakeFs({ content: "body ^foo\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.bytes_written).toBe(Buffer.byteLength(fs.writes[0]![1], "utf8"));
  });

  test("no fs.writeFile call targets a path ending in .bak / .backup / .old (FR-025 no-backup)", async () => {
    const fs = fakeFs({ content: "body ^foo\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    for (const [p] of fs.writes) {
      expect(p.endsWith(".bak") || p.endsWith(".backup") || p.endsWith(".old")).toBe(false);
    }
  });

  test("FR-015 — wrapper does not introduce extra ^<id> markers in the output", async () => {
    const fs = fakeFs({ content: "before\nBody. ^foo\nafter\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    // The marker `^foo` appears exactly once in input and once in output.
    const occurrences = (written.match(/\^foo/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  test("repeat-invocation determinism: two identical calls write identical bytes (SC-004)", async () => {
    const note = "intro\n\nBody. ^foo\n\nclosing\n";
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const fs1 = fakeFs({ content: note });
    const fs2 = fakeFs({ content: note });
    const args = {
      target_mode: "specific" as const,
      vault: "TestVault",
      path: "n.md",
      block_id: "foo",
      content: "deterministic",
    };
    const { spawnFn: s1 } = makeQueuedSpawn([EVAL_OK]);
    const r1 = await executePatchBlock(args, deps({ spawnFn: s1, vaultRegistry: reg, fs: fs1 }));
    const { spawnFn: s2 } = makeQueuedSpawn([EVAL_OK]);
    const r2 = await executePatchBlock(args, deps({ spawnFn: s2, vaultRegistry: reg, fs: fs2 }));
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(fs1.writes[0]![1]).toBe(fs2.writes[0]![1]);
  });

  test("metadataCache invalidation eval fires after write; failure does not throw", async () => {
    const fs = fakeFs({ content: "body ^foo\n" });
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: "Error: cache invalidation failed\n", exitCode: 1 },
    ]);
    const result = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.bytes_written).toBeGreaterThan(0);
    expect(recorded.length).toBe(1);
    const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="));
    expect(codeArg).toBeDefined();
    expect(codeArg!).toContain("computeMetadataAsync");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US2 BLOCK_NOT_FOUND (FR-017)
// ─────────────────────────────────────────────────────────────────────

describe("US2 BLOCK_NOT_FOUND", () => {
  test("id absent from note → BLOCK_NOT_FOUND with details.block_id + details.path", async () => {
    const fs = fakeFs({ content: "no markers here\n" });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("BLOCK_NOT_FOUND");
    expect((err as UpstreamError).details.block_id).toBe("foo");
    expect((err as UpstreamError).details.path).toBe("n.md");
    expect(fs.writes.length).toBe(0);
    expect(fs.renames.length).toBe(0);
  });

  test("id only inside fenced code → BLOCK_NOT_FOUND (FR-011 fenced-code opacity)", async () => {
    const fs = fakeFs({ content: "before\n```\ntext ^foo\n```\nafter\n" });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("BLOCK_NOT_FOUND");
    expect(fs.writes.length).toBe(0);
  });

  test("mis-cased id → BLOCK_NOT_FOUND (FR-003 case-sensitivity)", async () => {
    const fs = fakeFs({ content: "body ^Foo\n" });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("BLOCK_NOT_FOUND");
  });

  test("empty note → BLOCK_NOT_FOUND for any id", async () => {
    const fs = fakeFs({ content: "" });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("BLOCK_NOT_FOUND");
  });

  test("id only inside frontmatter → BLOCK_NOT_FOUND (FR-014)", async () => {
    const fs = fakeFs({
      content: "---\ndecoy: text ^foo\n---\n\nbody without marker\n",
    });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("BLOCK_NOT_FOUND");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US2 BLOCK_ON_HEADING (FR-019a)
// ─────────────────────────────────────────────────────────────────────

describe("US2 BLOCK_ON_HEADING — ATX shape", () => {
  test.each([1, 2, 3, 4, 5, 6])(
    "rank %i ATX heading attachment → BLOCK_ON_HEADING heading_shape='atx'",
    async (rank: number) => {
      const note = `${"#".repeat(rank)} Heading ^foo\n`;
      const fs = fakeFs({ content: note });
      const { spawnFn } = makeQueuedSpawn([]);
      const err = await executePatchBlock(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: "n.md",
          block_id: "foo",
          content: "x",
        },
        deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
      ).catch((e) => e);
      expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
      expect((err as UpstreamError).details.code).toBe("BLOCK_ON_HEADING");
      expect((err as UpstreamError).details.heading_shape).toBe("atx");
      expect((err as UpstreamError).details.block_id).toBe("foo");
      expect((err as UpstreamError).details.path).toBe("n.md");
      expect(fs.writes.length).toBe(0);
    },
  );
});

describe("US2 BLOCK_ON_HEADING — setext shape", () => {
  test("setext rank 1 (===) → BLOCK_ON_HEADING heading_shape='setext'", async () => {
    const fs = fakeFs({ content: "Heading text ^foo\n===\nbody\n" });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("BLOCK_ON_HEADING");
    expect((err as UpstreamError).details.heading_shape).toBe("setext");
    expect(fs.writes.length).toBe(0);
  });

  test("setext rank 2 (---) → BLOCK_ON_HEADING heading_shape='setext'", async () => {
    const fs = fakeFs({ content: "Heading text ^foo\n---\nbody\n" });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("BLOCK_ON_HEADING");
    expect((err as UpstreamError).details.heading_shape).toBe("setext");
  });

  test("paragraph followed by non-underline does NOT promote → patch lands as paragraph", async () => {
    const fs = fakeFs({ content: "Heading text ^foo\nNot an underline\n" });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.block_shape).toBe("paragraph");
    expect(fs.writes[0]![1]).toBe("Replaced. ^foo\nNot an underline\n");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US2 NOTE_NOT_FOUND (FR-018) — read-side ENOENT
// ─────────────────────────────────────────────────────────────────────

describe("US2 NOTE_NOT_FOUND", () => {
  test("ENOENT on readFile → NOTE_NOT_FOUND with details.path + details.vault; no write attempted", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const fs = fakeFs(
      {},
      {
        readFile: vi.fn(async () => {
          throw enoent;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Missing.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("NOTE_NOT_FOUND");
    expect((err as UpstreamError).details.path).toBe("Missing.md");
    expect((err as UpstreamError).details.vault).toBe("TestVault");
    expect(fs.writes.length).toBe(0);
    expect(fs.renames.length).toBe(0);
  });

  test("EACCES on readFile (NOT ENOENT) → FS_WRITE_FAILED (or non-NOTE_NOT_FOUND)", async () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    const fs = fakeFs(
      {},
      {
        readFile: vi.fn(async () => {
          throw eacces;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Locked.md",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    // NOT NOTE_NOT_FOUND — falls through to mapFsWriteError → FS_WRITE_FAILED (EACCES is
    // not in patch_block's EBUSY/EPERM editor-conflict set).
    expect((err as UpstreamError).details.code).not.toBe("NOTE_NOT_FOUND");
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("EACCES");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US3 active mode (focused-file eval + envelope shape)
// ─────────────────────────────────────────────────────────────────────

describe("US3 active mode", () => {
  test("focused file resolves; patch lands; envelope reflects display name", async () => {
    const focusedResp: StubResponse = {
      stdout: `=> {"path":"Daily Notes/today.md","base":${JSON.stringify(VAULT_ROOT)}}\n`,
      exitCode: 0,
    };
    const fs = fakeFs({ content: "Body. ^foo\n" });
    const { spawnFn } = makeQueuedSpawn([focusedResp, EVAL_OK]);
    const result = await executePatchBlock(
      {
        target_mode: "active",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("Daily Notes/today.md");
    expect(result.vault).toBe("TestVault");
    expect(result.block_shape).toBe("paragraph");
  });

  test("envelope falls back to basePath when reverse-lookup returns null", async () => {
    const FALLBACK_ROOT = resolve("/unknown-vault-root");
    const focusedResp: StubResponse = {
      stdout: `=> {"path":"today.md","base":${JSON.stringify(FALLBACK_ROOT)}}\n`,
      exitCode: 0,
    };
    const enoent = (): NodeJS.ErrnoException => {
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      return e;
    };
    const fs = fakeFs(
      { content: "Body. ^foo\n" },
      {
        realpath: vi.fn(async (p: string) => {
          if (p === FALLBACK_ROOT) return FALLBACK_ROOT;
          throw enoent();
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([focusedResp, EVAL_OK]);
    const result = await executePatchBlock(
      {
        target_mode: "active",
        block_id: "foo",
        content: "Replaced.",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.vault).toBe(FALLBACK_ROOT);
  });

  test("no focused file (path: null) → ERR_NO_ACTIVE_FILE; no fs touched", async () => {
    const focusedResp: StubResponse = {
      stdout: `=> {"path":null,"base":${JSON.stringify(VAULT_ROOT)}}\n`,
      exitCode: 0,
    };
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([focusedResp]);
    const err = await executePatchBlock(
      {
        target_mode: "active",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("ERR_NO_ACTIVE_FILE");
    expect(fs.reads.length).toBe(0);
    expect(fs.writes.length).toBe(0);
    expect(fs.renames.length).toBe(0);
  });

  test("invalid JSON in eval response → CLI_REPORTED_ERROR + stage='json-parse'", async () => {
    const focusedResp: StubResponse = { stdout: "=> not valid json\n", exitCode: 0 };
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([focusedResp]);
    const err = await executePatchBlock(
      {
        target_mode: "active",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.stage).toBe("json-parse");
  });

  test("unexpected envelope shape → CLI_REPORTED_ERROR + stage='envelope-parse'", async () => {
    const focusedResp: StubResponse = { stdout: `=> {"unexpected":"shape"}\n`, exitCode: 0 };
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([focusedResp]);
    const err = await executePatchBlock(
      {
        target_mode: "active",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.stage).toBe("envelope-parse");
  });

  test("NOTE_NOT_FOUND under active mode echoes '<focused>' for details.vault", async () => {
    const focusedResp: StubResponse = {
      stdout: `=> {"path":"Missing.md","base":${JSON.stringify(VAULT_ROOT)}}\n`,
      exitCode: 0,
    };
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const fs = fakeFs(
      {},
      {
        readFile: vi.fn(async () => {
          throw enoent;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([focusedResp]);
    const err = await executePatchBlock(
      {
        target_mode: "active",
        block_id: "foo",
        content: "x",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("NOTE_NOT_FOUND");
    expect((err as UpstreamError).details.vault).toBe("<focused>");
  });
});
