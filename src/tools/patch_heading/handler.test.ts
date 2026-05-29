// Original — no upstream. patch_heading handler tests per BI-040 / Principle II. Covers US1 happy paths (all 3 modes, body shapes, line-ending + trailing-newline preservation, frontmatter preservation, no-backup, no-streaming, repeat-invocation determinism, post-write eval); US2 HEADING_NOT_FOUND + HEADING_RACE; US3 active mode (focused-file eval, ERR_NO_ACTIVE_FILE, eval parse/envelope failures); US4 EXTERNAL_EDITOR_CONFLICT classification (EBUSY/EPERM/EACCES) + ENOSPC fall-through to FS_WRITE_FAILED + PATH_ESCAPES_VAULT.
import { resolve } from "node:path";
import { Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { executePatchHeading, type ExecuteFs } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const VAULT_ROOT = resolve("/test-vault");

const SAMPLE_NOTE =
  "---\n" +
  "date: 2026-05-21\n" +
  "tags: [daily]\n" +
  "---\n" +
  "\n" +
  "# Daily\n" +
  "\n" +
  "## Tasks\n" +
  "\n" +
  "### TODO\n" +
  "\n" +
  "- Buy groceries\n" +
  "- Submit timesheet\n" +
  "\n" +
  "### Done\n" +
  "\n" +
  "- Reviewed PR #128\n" +
  "\n" +
  "## Notes\n" +
  "\n" +
  "A quick thought.\n";

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
      return canned.content ?? SAMPLE_NOTE;
    }),
    writeFile: vi.fn(async (p: string, c: string) => {
      writes.push([p, c]);
    }),
    rename: vi.fn(async (from: string, to: string) => {
      renames.push([from, to]);
    }),
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      // Parent directories of the absPath are presumed-existing.
      // Anything else (including the absPath itself when probed): throw ENOENT — the
      // canonical-path check uses ENOENT to mean "non-existent leaf, fall back to lexical".
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
// US1 happy paths — three modes × multiple body shapes
// ─────────────────────────────────────────────────────────────────────

describe("US1 happy paths — three placement modes", () => {
  test("append against ### TODO lands the new bullet before ### Done", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "- File expense report\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("Daily Notes/2026-05-21.md");
    expect(result.vault).toBe("TestVault");
    expect(result.heading_path).toBe("Daily#Tasks#TODO");
    expect(result.mode).toBe("append");
    expect(result.bytes_written).toBeGreaterThan(0);

    // The written content places the new bullet at end-of-reach — immediately before
    // the next equal-or-higher-rank heading marker. The trailing blank line that
    // preceded `### Done` in the original note is preserved at its line position
    // (data-model.md §Body-edit-algorithm — append inserts at `reachEndLineIndex`).
    const written = fs.writes[0]![1];
    expect(written).toContain("- Submit timesheet\n\n- File expense report\n### Done");
    // Frontmatter unchanged.
    expect(written.startsWith("---\ndate: 2026-05-21\ntags: [daily]\n---\n\n# Daily\n")).toBe(true);
    // Trailing newline preserved.
    expect(written.endsWith("\n")).toBe(true);
  });

  test("prepend a lead-in under ## Notes preserves the existing thought", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Notes",
        mode: "prepend",
        content: "lead-in line\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    // Lead-in lands immediately after `## Notes`.
    expect(written).toContain("## Notes\nlead-in line\n");
    // Original thought preserved.
    expect(written).toContain("A quick thought.");
  });

  test("replace the ### Done body preserves marker and subsequent siblings", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#Done",
        mode: "replace",
        content: "- New entry\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    // ### Done marker preserved
    expect(written).toContain("### Done\n");
    // Old "Reviewed PR #128" replaced
    expect(written).not.toContain("- Reviewed PR #128");
    expect(written).toContain("- New entry");
    // ## Notes sibling preserved
    expect(written).toContain("## Notes");
  });

  test("replace with empty content clears the direct body (FR-018a)", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "replace",
        content: "",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    expect(written).toContain("### TODO\n### Done");
    expect(written).not.toContain("Buy groceries");
  });
});

describe("US1 body shapes", () => {
  test("append on heading with empty body lands content immediately after marker", async () => {
    const empty =
      "# Top\n" +
      "## A\n" +
      "## B\n";
    const fs = fakeFs({ content: empty });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#A",
        mode: "append",
        content: "new\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("# Top\n## A\nnew\n## B\n");
  });

  test("replace on heading with child subtree preserves the child", async () => {
    const withChild =
      "# Top\n" +
      "## A\n" +
      "direct\n" +
      "### Child\n" +
      "c1\n" +
      "## B\n";
    const fs = fakeFs({ content: withChild });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#A",
        mode: "replace",
        content: "newdirect\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(fs.writes[0]![1]).toBe("# Top\n## A\nnewdirect\n### Child\nc1\n## B\n");
  });

  test("append on last heading in note lands content at end-of-file, trailing-newline preserved", async () => {
    const last =
      "# Top\n" +
      "## Only\n" +
      "body\n";
    const fs = fakeFs({ content: last });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#Only",
        mode: "append",
        content: "extra\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    expect(written).toBe("# Top\n## Only\nbody\nextra\n");
  });
});

describe("US1 line-ending + trailing-newline preservation (FR-014 / FR-015)", () => {
  test("CRLF input → output is CRLF", async () => {
    const crlf = "# Top\r\n## A\r\nbody\r\n## B\r\n";
    const fs = fakeFs({ content: crlf });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#A",
        mode: "append",
        content: "new\r\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    expect(written).toBe("# Top\r\n## A\r\nbody\r\nnew\r\n## B\r\n");
  });

  test("no trailing newline preserved (FR-014)", async () => {
    const noTrailing =
      "# Top\n" +
      "## A\n" +
      "body\n" +
      "## B"; // no trailing \n
    const fs = fakeFs({ content: noTrailing });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#B",
        mode: "append",
        content: "extra\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    expect(written.endsWith("\n")).toBe(false);
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
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "subdir/escape.md",
        heading_path: "Top#Sub",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs, logger }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("PATH_ESCAPES_VAULT");
    expect((err as UpstreamError).details.vault).toBe("TestVault");
    expect((err as UpstreamError).details.attemptedPath).toBe("subdir/escape.md");
    const escapeEvent = events.find((e) => e.event === "pathEscapeAttempt");
    expect(escapeEvent).toBeDefined();
    expect(escapeEvent!.attemptedPath).toBe("subdir/escape.md");
    expect(fs.writes.length).toBe(0);
  });

  test("ENOENT on readFile → FS_WRITE_FAILED with errno=ENOENT, note-not-found message", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT", syscall: "open" });
    const fs = fakeFs(
      {},
      {
        readFile: vi.fn(async () => {
          throw enoent;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Top#Sub",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("ENOENT");
    expect((err as UpstreamError).message).toContain("not found");
  });

  test("ENOSPC on writeFile → FS_WRITE_FAILED (not EXTERNAL_EDITOR_CONFLICT)", async () => {
    const enospc = Object.assign(new Error("ENOSPC"), { code: "ENOSPC", syscall: "write" });
    const fs = fakeFs(
      {},
      {
        writeFile: vi.fn(async () => {
          throw enospc;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.errno).toBe("ENOSPC");
  });
});

describe("US1 success envelope + IO invariants", () => {
  test("output envelope has exactly five keys", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(Object.keys(result).sort()).toEqual(
      ["bytes_written", "heading_path", "mode", "path", "vault"],
    );
  });

  test("bytes_written equals Buffer.byteLength of written content", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    const written = fs.writes[0]![1];
    expect(result.bytes_written).toBe(Buffer.byteLength(written, "utf8"));
  });

  test("no fs.writeFile call targets a path ending in .bak / .backup / .old (FR-024 no-backup)", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "replace",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    for (const [p] of fs.writes) {
      expect(p.endsWith(".bak") || p.endsWith(".backup") || p.endsWith(".old")).toBe(false);
    }
  });

  test("repeat-invocation determinism: two identical calls write identical bytes (SC-004)", async () => {
    const fs1 = fakeFs();
    const fs2 = fakeFs();
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const args = {
      target_mode: "specific" as const,
      vault: "TestVault",
      path: "Daily Notes/2026-05-21.md",
      heading_path: "Daily#Tasks#TODO",
      mode: "append" as const,
      content: "deterministic\n",
    };
    const { spawnFn: s1 } = makeQueuedSpawn([EVAL_OK]);
    const r1 = await executePatchHeading(args, deps({ spawnFn: s1, vaultRegistry: reg, fs: fs1 }));
    const { spawnFn: s2 } = makeQueuedSpawn([EVAL_OK]);
    const r2 = await executePatchHeading(args, deps({ spawnFn: s2, vaultRegistry: reg, fs: fs2 }));
    // Output envelopes are byte-identical (bytes_written derived from same content).
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(fs1.writes[0]![1]).toBe(fs2.writes[0]![1]);
  });

  test("metadataCache invalidation eval fires after write; failure does not throw", async () => {
    const fs = fakeFs();
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: "Error: cache invalidation failed\n", exitCode: 1 },
    ]);
    const result = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "x\n",
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
// US2 HEADING_NOT_FOUND + HEADING_RACE
// ─────────────────────────────────────────────────────────────────────

describe("US2 HEADING_NOT_FOUND", () => {
  test("heading path with no matching leaf → HEADING_NOT_FOUND", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Daily#NotebookExtract",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("HEADING_NOT_FOUND");
    expect((err as UpstreamError).details.heading_path).toBe("Daily#NotebookExtract");
    expect((err as UpstreamError).details.path).toBe("n.md");
    expect(fs.writes.length).toBe(0);
    expect(fs.renames.length).toBe(0);
  });

  test("right-text-wrong-parent → HEADING_NOT_FOUND, fs not modified", async () => {
    const note = "# Other\n## Sub\nbody\n";
    const fs = fakeFs({ content: note });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#Sub",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("HEADING_NOT_FOUND");
    expect(fs.writes.length).toBe(0);
  });
});

describe("US2 HEADING_RACE", () => {
  test("leaf renamed between resolve and re-walk → HEADING_RACE with current_identity=null", async () => {
    const initial =
      "# Daily\n" +
      "## Tasks\n" +
      "### TODO\n" +
      "- a\n" +
      "### Done\n";
    const renamed =
      "# Daily\n" +
      "## Tasks\n" +
      "### Pending\n" +
      "- a\n" +
      "### Done\n";
    let readCount = 0;
    const fs = fakeFs(
      {},
      {
        readFile: vi.fn(async () => {
          readCount++;
          return readCount === 1 ? initial : renamed;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("HEADING_RACE");
    expect((err as UpstreamError).details.current_identity).toBeNull();
    const orig = (err as UpstreamError).details.original_identity as { markerLineText: string };
    expect(orig.markerLineText).toBe("### TODO");
    expect(fs.writes.length).toBe(0);
    expect(fs.renames.length).toBe(0);
  });

  test("rank changed in-place → HEADING_RACE with rank mismatch", async () => {
    const initial =
      "# Top\n" +
      "## Section\n" +
      "body\n";
    const renamed =
      "# Top\n" +
      "### Section\n" +
      "body\n";
    let readCount = 0;
    const fs = fakeFs(
      {},
      {
        readFile: vi.fn(async () => {
          readCount++;
          return readCount === 1 ? initial : renamed;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#Section",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("HEADING_RACE");
    // current_identity is null because "Top#Section" no longer resolves: ### Section
    // is at rank 3, but the walker expects rank 2 under # Top for the second segment.
    expect((err as UpstreamError).details.current_identity).toBeNull();
    expect(fs.writes.length).toBe(0);
  });

  test("unrelated body edit (heading identity unchanged) is NOT a race; write proceeds", async () => {
    const initial =
      "# Top\n" +
      "## A\n" +
      "- a\n" +
      "## B\n";
    const concurrentEdit =
      "# Top\n" +
      "## A\n" +
      "- a\n" +
      "- b\n" +
      "## B\n";
    let readCount = 0;
    const fs = fakeFs(
      {},
      {
        readFile: vi.fn(async () => {
          readCount++;
          return readCount === 1 ? initial : concurrentEdit;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#A",
        mode: "append",
        content: "added\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.bytes_written).toBeGreaterThan(0);
    // Write proceeded with edits derived from the ORIGINAL content; last-write-wins.
    expect(fs.writes[0]![1]).toBe("# Top\n## A\n- a\nadded\n## B\n");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US3 active mode (focused-file eval + envelope shape)
// ─────────────────────────────────────────────────────────────────────

describe("US3 active mode", () => {
  test("focused file resolves; patch lands at the resolved path; envelope reflects display name", async () => {
    const focusedResp: StubResponse = {
      stdout: `=> {"path":"Daily Notes/today.md","base":${JSON.stringify(VAULT_ROOT)}}\n`,
      exitCode: 0,
    };
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([focusedResp, EVAL_OK]);
    const result = await executePatchHeading(
      {
        target_mode: "active",
        heading_path: "Daily#Tasks#TODO",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.path).toBe("Daily Notes/today.md");
    expect(result.vault).toBe("TestVault");
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
      { content: "# Top\n## A\nbody\n" },
      {
        realpath: vi.fn(async (p: string) => {
          if (p === FALLBACK_ROOT) return FALLBACK_ROOT;
          throw enoent();
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([focusedResp, EVAL_OK]);
    const result = await executePatchHeading(
      {
        target_mode: "active",
        heading_path: "Top#A",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.vault).toBe(FALLBACK_ROOT);
  });

  test("no focused file (path: null) → ERR_NO_ACTIVE_FILE, no fs touched", async () => {
    const focusedResp: StubResponse = {
      stdout: `=> {"path":null,"base":${JSON.stringify(VAULT_ROOT)}}\n`,
      exitCode: 0,
    };
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([focusedResp]);
    const err = await executePatchHeading(
      {
        target_mode: "active",
        heading_path: "Daily#Tasks",
        mode: "append",
        content: "x\n",
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
    const err = await executePatchHeading(
      {
        target_mode: "active",
        heading_path: "A#B",
        mode: "append",
        content: "x\n",
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
    const err = await executePatchHeading(
      {
        target_mode: "active",
        heading_path: "A#B",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.stage).toBe("envelope-parse");
  });
});

// ─────────────────────────────────────────────────────────────────────
// US4 EXTERNAL_EDITOR_CONFLICT
// ─────────────────────────────────────────────────────────────────────

describe("US4 EXTERNAL_EDITOR_CONFLICT", () => {
  test("fs.rename throws EBUSY → EXTERNAL_EDITOR_CONFLICT reason='file-locked' errno=EBUSY", async () => {
    const ebusy = Object.assign(new Error("EBUSY: resource busy"), {
      code: "EBUSY",
      errno: -4082,
      syscall: "rename",
    });
    const fs = fakeFs(
      {},
      {
        rename: vi.fn(async () => {
          throw ebusy;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Notes",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.reason).toBe("file-locked");
    expect((err as UpstreamError).details.errno).toBe("EBUSY");
    // Tmp file was unlinked best-effort.
    expect(fs.unlinks.length).toBe(1);
  });

  test("fs.writeFile throws EPERM (on tmp) → EXTERNAL_EDITOR_CONFLICT errno=EPERM", async () => {
    const eperm = Object.assign(new Error("EPERM"), {
      code: "EPERM",
      syscall: "open",
    });
    const fs = fakeFs(
      {},
      {
        writeFile: vi.fn(async () => {
          throw eperm;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Notes",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.errno).toBe("EPERM");
  });

  test("fs.rename throws EACCES → classified as EXTERNAL_EDITOR_CONFLICT", async () => {
    const eacces = Object.assign(new Error("EACCES"), {
      code: "EACCES",
      syscall: "rename",
    });
    const fs = fakeFs(
      {},
      {
        rename: vi.fn(async () => {
          throw eacces;
        }),
      },
    );
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Daily Notes/2026-05-21.md",
        heading_path: "Daily#Notes",
        mode: "append",
        content: "x\n",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
    expect((err as UpstreamError).details.errno).toBe("EACCES");
  });
});
