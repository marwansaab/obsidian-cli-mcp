// Original — no upstream. Tests for executeFindAndReplace — covers US1 preview/commit happy-paths, code-block + HTML-comment skip defaults, frontmatter-as-prose, drift, FS read/write failures (with partial-commit envelope inlined), canonical-level vault + per-note escapes, line-ending + BOM preservation, vault not-found + not-open, focused-vault invokeEval discovery, concurrent commits via Queue, US2 include_* opt-ins, US3 subfolder narrowing + unknown-subfolder + symlink-escape, US4 bound enforcement (preview + commit + second-scan recheck) + env-var fallback + WARN.
import { resolve, sep } from "node:path";
import { Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetMaxOccurrencesCacheForTests,
  executeFindAndReplace,
  type ExecuteDeps,
  type ExecuteFs,
  type FocusedVaultResponse,
} from "./handler.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";
import type { Dirent } from "node:fs";

const VAULT_ROOT = resolve("/find-replace-vault");

function captureLogger(events: Array<Record<string, unknown>>): Logger {
  return createLogger({
    stream: new Writable({
      write(chunk, _enc, cb) {
        try {
          events.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
        cb();
      },
    }),
  });
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
  };
}

interface MemFile {
  abs: string;
  content: string;
}

function makeDirent(name: string, parentPath: string, isFileVal: boolean): Dirent {
  const d = {
    name,
    parentPath,
    path: parentPath,
    isFile: () => isFileVal,
    isDirectory: () => !isFileVal,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  };
  return d as unknown as Dirent;
}

interface FakeFsState {
  files: Map<string, string>;
  writes: Array<{ path: string; content: string }>;
  renames: Array<{ from: string; to: string }>;
  unlinks: string[];
  realpathOverride?: (p: string) => Promise<string>;
}

function inMemoryFs(
  files: MemFile[],
  vaultRoot: string,
  options: {
    readErrorByRel?: Record<string, NodeJS.ErrnoException>;
    writeErrorByRel?: Record<string, NodeJS.ErrnoException>;
    renameErrorByRel?: Record<string, NodeJS.ErrnoException>;
    realpathOverride?: (p: string) => Promise<string>;
    readdirError?: NodeJS.ErrnoException;
    missingSubfolders?: Set<string>;
  } = {},
): { fs: ExecuteFs; state: FakeFsState } {
  const state: FakeFsState = {
    files: new Map(files.map((f) => [f.abs, f.content])),
    writes: [],
    renames: [],
    unlinks: [],
  };
  const fs: ExecuteFs = {
    readdir: vi.fn(async (root: string, _opts) => {
      if (options.readdirError) throw options.readdirError;
      const entries: Dirent[] = [];
      // Emit a Dirent for every file whose absolute path lives under `root`.
      // (Recursive walk semantics — Node returns all descendants flattened.)
      for (const abs of state.files.keys()) {
        if (!abs.startsWith(root)) continue;
        const tail = abs.slice(root.length);
        if (!tail.startsWith(sep) && tail.length > 0) continue;
        // Compute parent dir and file name.
        const parentPath = abs.slice(0, abs.length - (abs.split(sep).pop()?.length ?? 0));
        const name = abs.split(sep).pop()!;
        const parentTrim = parentPath.endsWith(sep)
          ? parentPath.slice(0, -1)
          : parentPath;
        entries.push(makeDirent(name, parentTrim, true));
      }
      return entries;
    }),
    readFile: vi.fn(async (p: string, _enc: "utf8") => {
      const rel = p.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.readErrorByRel?.[rel]) throw options.readErrorByRel[rel];
      const content = state.files.get(p);
      if (content === undefined) {
        const e = new Error("ENOENT") as NodeJS.ErrnoException;
        e.code = "ENOENT";
        throw e;
      }
      return content;
    }),
    writeFile: vi.fn(async (p: string, content: string) => {
      // The tmp path is `${abs}.${uuid}.tmp` — match the target by stripping the suffix.
      const targetMatch = p.match(/^(.+)\.[0-9a-f-]+\.tmp$/i);
      const target = targetMatch?.[1] ?? p;
      const rel = target.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.writeErrorByRel?.[rel]) throw options.writeErrorByRel[rel];
      state.writes.push({ path: p, content });
    }),
    rename: vi.fn(async (from: string, to: string) => {
      const rel = to.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.renameErrorByRel?.[rel]) throw options.renameErrorByRel[rel];
      state.renames.push({ from, to });
      const writeEntry = state.writes.find((w) => w.path === from);
      if (writeEntry) state.files.set(to, writeEntry.content);
    }),
    unlink: vi.fn(async (p: string) => {
      state.unlinks.push(p);
    }),
    realpath: vi.fn(async (p: string) => {
      if (options.realpathOverride) return options.realpathOverride(p);
      if (p === vaultRoot) return vaultRoot;
      // Treat subfolder paths under vaultRoot as existing only if they don't
      // appear in missingSubfolders.
      const rel = p.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.missingSubfolders?.has(rel)) {
        const e = new Error("ENOENT") as NodeJS.ErrnoException;
        e.code = "ENOENT";
        throw e;
      }
      if (p.startsWith(vaultRoot)) return p;
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    }),
  };
  return { fs, state };
}

function relToAbs(rel: string): string {
  return resolve(VAULT_ROOT, rel.split("/").join(sep));
}

function baseDeps(over: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    logger: over.logger ?? silentLogger(),
    queue: over.queue ?? createQueue(),
    vaultRegistry: over.vaultRegistry ?? fakeRegistry({ V: VAULT_ROOT }),
    fs: over.fs,
    randomUUID: over.randomUUID ?? (() => "00000000-0000-0000-0000-000000000000"),
    invokeEval: over.invokeEval,
    env: over.env ?? {},
    spawnFn: over.spawnFn,
    warn: over.warn,
  };
}

beforeEach(() => {
  __resetMaxOccurrencesCacheForTests();
});
afterEach(() => {
  __resetMaxOccurrencesCacheForTests();
});

// =============================================================================
// US1 — Preview-then-commit MVP
// =============================================================================

describe("US1 — preview happy path", () => {
  it("three notes / five occurrences — preview lists each per-occurrence in path-ascending order with no fs mutation", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Decisions/A.md"), content: "See ADR-0042.\nSecond ADR-0042 ref.\nThird ADR-0042 here." },
      { abs: relToAbs("Inbox/notes/wiki.md"), content: "[[ADR-0042]] rename target" },
      { abs: relToAbs("Archive/2024/r.md"), content: "Some ADR-0042 occurrence." },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "ADR-0042", replacement: "ADR-0089", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, vaultRegistry: fakeRegistry({ V: VAULT_ROOT }) }),
    );
    expect(result.mode).toBe("preview");
    if (result.mode === "preview") {
      expect(result.total_occurrences).toBe(5);
      expect(result.affected_notes.length).toBe(3);
      expect(result.affected_notes.map((n: { path: string }) => n.path)).toEqual([
        "Archive/2024/r.md",
        "Decisions/A.md",
        "Inbox/notes/wiki.md",
      ]);
      const decisions = result.affected_notes.find(
        (n: { path: string }) => n.path === "Decisions/A.md",
      )!;
      expect(decisions.occurrence_count).toBe(3);
      expect(decisions.occurrences.map((o: { line_number: number }) => o.line_number)).toEqual([1, 2, 3]);
      expect(decisions.occurrences[0]!.matched_substring).toBe("ADR-0042");
      expect(decisions.occurrences[0]!.replacement_substring).toBe("ADR-0089");
    }
    expect(state.writes.length).toBe(0);
    expect(state.renames.length).toBe(0);
  });
});

describe("US1 — preview no-mutate assertion (FR-014 / SC-002)", () => {
  it("preview NEVER calls writeFile or rename, regardless of result shape", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("A.md"), content: "alpha alpha alpha" },
      { abs: relToAbs("B.md"), content: "alpha twice alpha" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    await executeFindAndReplace(
      { pattern: "alpha", replacement: "beta", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.rename).not.toHaveBeenCalled();
    expect(state.writes.length).toBe(0);
    expect(state.renames.length).toBe(0);
  });
});

describe("US1 — commit happy path", () => {
  it("commit rewrites the notes on disk byte-for-byte outside the matched spans", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("A.md"), content: "before ADR-0042 middle ADR-0042 end" },
      { abs: relToAbs("B.md"), content: "single ADR-0042 occurrence" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "ADR-0042", replacement: "ADR-0089", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(result.mode).toBe("commit");
    if (result.mode === "commit") {
      expect(result.changed_notes).toEqual(["A.md", "B.md"]);
      expect(result.total_occurrences_replaced).toBe(3);
      expect(result.partial).toBe(false);
    }
    // Final on-disk content (after rename)
    expect(state.files.get(relToAbs("A.md"))).toBe(
      "before ADR-0089 middle ADR-0089 end",
    );
    expect(state.files.get(relToAbs("B.md"))).toBe(
      "single ADR-0089 occurrence",
    );
    expect(state.renames.length).toBe(2);
  });
});

describe("US1 — empty result", () => {
  it("preview with no match returns empty success", async () => {
    const files: MemFile[] = [{ abs: relToAbs("a.md"), content: "no match here" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "xyzzy", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    );
    expect(result).toEqual({
      mode: "preview",
      affected_notes: [],
      total_occurrences: 0,
    });
  });

  it("commit with no match returns empty success (partial: false)", async () => {
    const files: MemFile[] = [{ abs: relToAbs("a.md"), content: "no match here" }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "xyzzy", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(result).toEqual({
      mode: "commit",
      changed_notes: [],
      total_occurrences_replaced: 0,
      partial: false,
    });
    expect(state.writes.length).toBe(0);
  });
});

describe("US1 — code-block skip default (FR-006)", () => {
  it("occurrence inside fenced code block is NOT counted by default", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("note.md"),
      content: "OldName in prose\n```\nOldName inside fence\n```\nafter",
    }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "OldName", replacement: "NewName", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    );
    if (result.mode === "preview") {
      expect(result.total_occurrences).toBe(1);
      expect(result.affected_notes[0]!.occurrences[0]!.line_number).toBe(1);
    }
  });
});

describe("US1 — HTML-comment skip default (FR-007)", () => {
  it("occurrence inside <!-- --> is NOT counted by default", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("note.md"),
      content: "OldName in prose\n<!-- OldName inside comment -->\nafter",
    }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "OldName", replacement: "NewName", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    );
    if (result.mode === "preview") {
      expect(result.total_occurrences).toBe(1);
    }
  });
});

describe("US1 — frontmatter as prose (FR-018)", () => {
  it("leading --- YAML frontmatter containing the pattern IS counted and IS replaced", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "---\ntitle: ADR-0042 something\n---\nBody text",
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "ADR-0042", replacement: "ADR-0089", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(result.mode).toBe("commit");
    expect(state.files.get(relToAbs("n.md"))).toBe(
      "---\ntitle: ADR-0089 something\n---\nBody text",
    );
  });
});

describe("US1 — drift detection (FR-012)", () => {
  it("OCCURRENCE_COUNT_DRIFT when scans yield different totals", async () => {
    let readCount = 0;
    const { fs } = inMemoryFs(
      [{ abs: relToAbs("a.md"), content: "pat pat pat" }],
      VAULT_ROOT,
    );
    // Override readFile to return different content on second invocation
    fs.readFile = vi.fn(async (_p: string) => {
      readCount++;
      if (readCount === 1) return "pat pat pat";
      return "pat pat pat pat"; // an extra pat appears between scans
    });
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "rep", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("OCCURRENCE_COUNT_DRIFT");
    expect((err as UpstreamError).details.preview_count).toBe(3);
    expect((err as UpstreamError).details.commit_count).toBe(4);
  });
});

describe("US1 — per-note read failure during scan (FS_WRITE_FAILED/read)", () => {
  it("EACCES on readFile aborts BEFORE any write, no partial flag", async () => {
    const eaccess = Object.assign(new Error("EACCES"), { code: "EACCES" });
    const files: MemFile[] = [
      { abs: relToAbs("a.md"), content: "x" },
      { abs: relToAbs("b.md"), content: "y" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT, {
      readErrorByRel: { "b.md": eaccess as NodeJS.ErrnoException },
    });
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("read");
    expect((err as UpstreamError).details.errno).toBe("EACCES");
    expect((err as UpstreamError).details.path).toBe("b.md");
    expect((err as UpstreamError).details.partial).toBeUndefined();
    expect(state.writes.length).toBe(0);
  });
});

describe("US1 — FS_WRITE_FAILED on second-of-three during commit", () => {
  it("partial:true with first note kept + failing_note_locator", async () => {
    const enospc = Object.assign(new Error("ENOSPC"), {
      code: "ENOSPC",
      syscall: "write",
    });
    const files: MemFile[] = [
      { abs: relToAbs("a.md"), content: "p" },
      { abs: relToAbs("b.md"), content: "p" },
      { abs: relToAbs("c.md"), content: "p" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT, {
      writeErrorByRel: { "b.md": enospc as NodeJS.ErrnoException },
    });
    const err = await executeFindAndReplace(
      { pattern: "p", replacement: "q", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("write");
    expect((err as UpstreamError).details.errno).toBe("ENOSPC");
    expect((err as UpstreamError).details.partial).toBe(true);
    expect((err as UpstreamError).details.changed_notes).toEqual(["a.md"]);
    expect((err as UpstreamError).details.failing_note_locator).toBe("b.md");
    expect((err as UpstreamError).details.total_occurrences_replaced).toBe(1);
    // a.md was renamed; b.md and c.md were not
    expect(state.renames.length).toBe(1);
  });
});

describe("US1 — line-ending preservation", () => {
  it("CRLF source — endings preserved on commit", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "alpha pat beta\r\nsecond pat line\r\nlast",
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    await executeFindAndReplace(
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(state.files.get(relToAbs("n.md"))).toBe(
      "alpha REP beta\r\nsecond REP line\r\nlast",
    );
  });

  it("LF source — endings preserved on commit", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "alpha pat beta\nsecond pat line\nlast",
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    await executeFindAndReplace(
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(state.files.get(relToAbs("n.md"))).toBe(
      "alpha REP beta\nsecond REP line\nlast",
    );
  });

  it("Mixed CRLF/LF — endings preserved per-line on commit", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "pat\r\npat\npat\r\nlast",
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    await executeFindAndReplace(
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(state.files.get(relToAbs("n.md"))).toBe("X\r\nX\nX\r\nlast");
  });

  it("Trailing-newline absence preserved (no \\n added)", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "pat trailing", // no \n at EOF
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    await executeFindAndReplace(
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(state.files.get(relToAbs("n.md"))).toBe("X trailing");
  });

  it("BOM preserved at start of file", async () => {
    const BOM = "﻿";
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: `${BOM}pat content`,
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    await executeFindAndReplace(
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(state.files.get(relToAbs("n.md"))).toBe(`${BOM}X content`);
  });
});

describe("US1 — vault registry errors", () => {
  it("unknown vault → CLI_REPORTED_ERROR + VAULT_NOT_FOUND + reason:unknown", async () => {
    const { fs } = inMemoryFs([], VAULT_ROOT);
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "_", mode: "literal", vault: "Typo", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, vaultRegistry: fakeRegistry({ V: VAULT_ROOT }) }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.code).toBe("VAULT_NOT_FOUND");
    expect((err as UpstreamError).details.reason).toBe("unknown");
    expect((err as UpstreamError).details.vault).toBe("Typo");
  });
});

describe("US1 — focused-vault discovery via invokeEval", () => {
  it("input.vault absent invokes invokeEval exactly once and uses .base as vault root", async () => {
    const files: MemFile[] = [{ abs: relToAbs("note.md"), content: "alpha" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const invokeEval = vi.fn(
      async (): Promise<FocusedVaultResponse> => ({ path: null, base: VAULT_ROOT }),
    );
    const result = await executeFindAndReplace(
      { pattern: "alpha", replacement: "X", mode: "literal", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, invokeEval }),
    );
    expect(invokeEval).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("preview");
  });

  it("input.vault present does NOT invoke invokeEval (call-count zero)", async () => {
    const files: MemFile[] = [{ abs: relToAbs("note.md"), content: "alpha" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const invokeEval = vi.fn(
      async (): Promise<FocusedVaultResponse> => ({ path: null, base: VAULT_ROOT }),
    );
    await executeFindAndReplace(
      { pattern: "alpha", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, invokeEval }),
    );
    expect(invokeEval).not.toHaveBeenCalled();
  });
});

describe("US1 — canonical-level vault escape on per-note path", () => {
  it("note's parent dir resolves outside vault root → PATH_ESCAPES_VAULT + pathEscapeAttempt log", async () => {
    const escapeTarget = resolve("/escape-target");
    const files: MemFile[] = [{ abs: relToAbs("subdir/evil.md"), content: "pat" }];
    const events: Array<Record<string, unknown>> = [];
    const { fs } = inMemoryFs(files, VAULT_ROOT, {
      realpathOverride: async (p: string) => {
        if (p === VAULT_ROOT) return VAULT_ROOT;
        // Parent dir of the per-note check resolves outside the vault root —
        // mirrors write_note's path-escape test pattern.
        return escapeTarget;
      },
    });
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs, logger: captureLogger(events) }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("PATH_ESCAPES_VAULT");
    const escapeEvent = events.find((e) => e.event === "pathEscapeAttempt");
    expect(escapeEvent).toBeDefined();
  });
});

describe("US1 — concurrent commits serialize through Queue (FR-024)", () => {
  it("concurrent commits both resolve and the queue serializes per-note writes", async () => {
    const fileA = { abs: relToAbs("a.md"), content: "pat" };
    const fileB = { abs: relToAbs("b.md"), content: "pat" };
    const { fs } = inMemoryFs([fileA, fileB], VAULT_ROOT);
    const sharedQueue = createQueue();
    let concurrentInsideQueue = 0;
    let maxConcurrent = 0;
    const originalWrite = fs.writeFile;
    fs.writeFile = vi.fn(async (p: string, content: string) => {
      concurrentInsideQueue++;
      maxConcurrent = Math.max(maxConcurrent, concurrentInsideQueue);
      await new Promise((r) => setImmediate(r));
      concurrentInsideQueue--;
      return originalWrite(p, content);
    }) as ExecuteFs["writeFile"];
    const deps = baseDeps({ fs, queue: sharedQueue });
    const p1 = executeFindAndReplace(
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      deps,
    );
    const p2 = executeFindAndReplace(
      { pattern: "pat", replacement: "Y", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      deps,
    );
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.mode).toBe("commit");
    expect(r2.mode).toBe("commit");
    // The Queue serializes — at most one write inside the queue at any time.
    expect(maxConcurrent).toBe(1);
  });
});

// =============================================================================
// US2 — include_* opt-ins
// =============================================================================

describe("US2 — include_code_blocks opt-in", () => {
  it("include_code_blocks:true surfaces the fence occurrence and rewrites it on commit", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "Old in prose\n```\nOld inside fence\n```\nafter",
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const preview = await executeFindAndReplace(
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    );
    if (preview.mode === "preview") expect(preview.total_occurrences).toBe(2);
    const commit = await executeFindAndReplace(
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: false, commit: true },
      baseDeps({ fs }),
    );
    expect(commit.mode).toBe("commit");
    expect(state.files.get(relToAbs("n.md"))).toBe(
      "New in prose\n```\nNew inside fence\n```\nafter",
    );
  });
});

describe("US2 — include_html_comments opt-in", () => {
  it("include_html_comments:true surfaces the comment occurrence and rewrites it on commit", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "Old in prose\n<!-- Old in comment -->\nafter",
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const commit = await executeFindAndReplace(
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: true, commit: true },
      baseDeps({ fs }),
    );
    expect(commit.mode).toBe("commit");
    expect(state.files.get(relToAbs("n.md"))).toBe(
      "New in prose\n<!-- New in comment -->\nafter",
    );
  });
});

describe("US2 — both opt-ins independent (mixed-flag)", () => {
  it("include_code_blocks=true + include_html_comments=false surfaces fence but not comment", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "Old prose\n```\nOld fence\n```\n<!-- Old comment -->\n",
    }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const r = await executeFindAndReplace(
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    );
    if (r.mode === "preview") {
      expect(r.total_occurrences).toBe(2); // prose + fence; comment skipped
    }
  });

  it("both opt-ins true → all three occurrences surface", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "Old prose\n```\nOld fence\n```\n<!-- Old comment -->\n",
    }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const r = await executeFindAndReplace(
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: true, commit: false },
      baseDeps({ fs }),
    );
    if (r.mode === "preview") expect(r.total_occurrences).toBe(3);
  });
});

// =============================================================================
// US3 — subfolder scope
// =============================================================================

describe("US3 — subfolder narrows the response", () => {
  it("subfolder scope excludes sibling subtrees", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Decisions/A.md"), content: "pat" },
      { abs: relToAbs("Inbox/B.md"), content: "pat" },
    ];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const r = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", subfolder: "Decisions", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    );
    if (r.mode === "preview") {
      expect(r.total_occurrences).toBe(1);
      expect(r.affected_notes[0]!.path).toBe("Decisions/A.md");
    }
  });
});

describe("US3 — unknown subfolder", () => {
  it("ENOENT on subfolder realpath → VALIDATION_ERROR/INVALID_SUBFOLDER (reason: not-found)", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Decisions/A.md"), content: "pat" },
    ];
    const { fs } = inMemoryFs(files, VAULT_ROOT, {
      missingSubfolders: new Set(["DoesNotExist"]),
    });
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", subfolder: "DoesNotExist", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("INVALID_SUBFOLDER");
    expect((err as UpstreamError).details.reason).toBe("not-found");
    expect((err as UpstreamError).details.subfolder).toBe("DoesNotExist");
  });
});

describe("FR-013 symmetry — INVALID_SUBFOLDER closed union { 'path-traversal' | 'not-found' }", () => {
  it("BOTH rejection branches carry details.reason narrowed to the closed union", async () => {
    // Import the wrapped tool locally so this test exercises the full
    // schema → handler → tool-error envelope pipeline for both branches.
    // The path-traversal branch fires at the schema layer (superRefine);
    // the not-found branch fires at the handler layer (fs.realpath ENOENT).
    // This test fails until BI-042 US4 lands (the handler-layer branch
    // gains its reason: "not-found" emission at T017).
    const { createFindAndReplaceTool } = await import("./index.js");

    // Branch A — schema-layer path-traversal rejection.
    {
      const tool = createFindAndReplaceTool(baseDeps({}));
      const result = await tool.handler({
        pattern: "x",
        replacement: "y",
        subfolder: "../escape",
        vault: "V",
      });
      expect("isError" in result && result.isError).toBe(true);
      const payload = JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.details.code).toBe("INVALID_SUBFOLDER");
      expect(payload.details.reason).toBe("path-traversal");
      expect(["path-traversal", "not-found"]).toContain(payload.details.reason);
    }

    // Branch B — handler-layer ENOENT rejection.
    {
      const files: MemFile[] = [
        { abs: relToAbs("Decisions/A.md"), content: "x" },
      ];
      const { fs } = inMemoryFs(files, VAULT_ROOT, {
        missingSubfolders: new Set(["DoesNotExist"]),
      });
      const tool = createFindAndReplaceTool(baseDeps({ fs }));
      const result = await tool.handler({
        pattern: "x",
        replacement: "y",
        subfolder: "DoesNotExist",
        vault: "V",
      });
      expect("isError" in result && result.isError).toBe(true);
      const payload = JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.details.code).toBe("INVALID_SUBFOLDER");
      expect(payload.details.reason).toBe("not-found");
      expect(["path-traversal", "not-found"]).toContain(payload.details.reason);
    }
  });
});

describe("US3 — subfolder symlink escape", () => {
  it("subfolder's parent resolves outside vault root → PATH_ESCAPES_VAULT + pathEscapeAttempt log", async () => {
    const escape = resolve("/elsewhere");
    const files: MemFile[] = [];
    const events: Array<Record<string, unknown>> = [];
    const { fs } = inMemoryFs(files, VAULT_ROOT, {
      realpathOverride: async (p: string) => {
        if (p === VAULT_ROOT) return VAULT_ROOT;
        return escape;
      },
    });
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "_", mode: "literal", vault: "V", subfolder: "outer/EvilLink", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, logger: captureLogger(events) }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("PATH_ESCAPES_VAULT");
    expect(events.some((e) => e.event === "pathEscapeAttempt")).toBe(true);
  });
});

// =============================================================================
// US4 — bound guard
// =============================================================================

describe("US4 — bound exceeded on preview", () => {
  it("preview refuses with OCCURRENCE_COUNT_EXCEEDED when total > bound", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "pat ".repeat(15),
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: "10" } }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("OCCURRENCE_COUNT_EXCEEDED");
    expect((err as UpstreamError).details.bound).toBe(10);
    expect((err as UpstreamError).details.count).toBe(15);
    expect((err as UpstreamError).details.env_var).toBe(
      "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES",
    );
    expect(state.writes.length).toBe(0);
  });

  it("commit refuses identically with no notes touched", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "pat ".repeat(15),
    }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs, env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: "10" } }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("OCCURRENCE_COUNT_EXCEEDED");
    expect(state.writes.length).toBe(0);
  });
});

describe("US4 — bound exactly equal succeeds", () => {
  it("count === bound succeeds", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "pat ".repeat(10),
    }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const r = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: "10" } }),
    );
    expect(r.mode).toBe("preview");
  });
});

describe("US4 — env-var default fallback", () => {
  it("env unset → bound 500 applied", async () => {
    const files: MemFile[] = [{
      abs: relToAbs("n.md"),
      content: "pat ".repeat(5),
    }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const r = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, env: {} }),
    );
    expect(r.mode).toBe("preview");
  });

  it.each([["abc"], ["-5"], ["0"]])(
    "env set to invalid value %j → fallback 500 + warn invoked",
    async (raw: string) => {
      __resetMaxOccurrencesCacheForTests();
      const files: MemFile[] = [{ abs: relToAbs("n.md"), content: "pat" }];
      const { fs } = inMemoryFs(files, VAULT_ROOT);
      const warn = vi.fn();
      const r = await executeFindAndReplace(
        { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
        baseDeps({ fs, env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: raw }, warn }),
      );
      expect(r.mode).toBe("preview");
      expect(warn).toHaveBeenCalledWith(
        "find_and_replace.bound.fallback",
        expect.objectContaining({
          env_var: "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES",
          provided: raw,
          fallback: 500,
        }),
      );
    },
  );
});

describe("US4 — second-scan bound recheck", () => {
  it("second-scan total > bound surfaces bound-exceeded, NOT drift", async () => {
    const files: MemFile[] = [{ abs: relToAbs("n.md"), content: "pat pat" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    let reads = 0;
    fs.readFile = vi.fn(async () => {
      reads++;
      // First scan: 2 occurrences; second scan: 6 (over bound)
      return reads === 1 ? "pat pat" : "pat pat pat pat pat pat";
    });
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs, env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: "5" } }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("OCCURRENCE_COUNT_EXCEEDED");
  });
});
