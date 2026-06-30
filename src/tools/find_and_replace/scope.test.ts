// Original — no upstream. find_and_replace single-note scope tests (066-file-scope),
// split from handler.test.ts: US1 named path/file, US2 active_note, US3 scope-conflict
// rejection, and the backward-compat + guards-still-fire polish cohort. Shared fixtures
// in _handler-fixtures.ts.
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_EVAL,
  baseDeps,
  captureLogger,
  FILE_TSV_OK,
  fakeRegistry,
  inMemoryFs,
  relToAbs,
  VAULT_ROOT,
  type MemFile,
} from "./_handler-fixtures.js";
import {
  __resetMaxOccurrencesCacheForTests,
  executeFindAndReplace,
  type FocusedVaultResponse,
} from "./handler.js";
import { UpstreamError } from "../../errors.js";
import { makeQueuedSpawn } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

beforeEach(() => {
  __resetMaxOccurrencesCacheForTests();
});
afterEach(() => {
  __resetMaxOccurrencesCacheForTests();
});

describe("066-file-scope US1 — named single-note scope by path", () => {
  it("preview confines to the one named note; every other note byte/mtime unchanged (SC-001)", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Inbox/A.md"), content: "STATUS here" },
      { abs: relToAbs("Projects/Target.md"), content: "STATUS in target\nSTATUS again" },
      { abs: relToAbs("Archive/C.md"), content: "STATUS elsewhere" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", vault: "V", path: "Projects/Target.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs }),
    );
    expect(result.mode).toBe("preview");
    if (result.mode === "preview") {
      expect(result.affected_notes.length).toBe(1);
      expect(result.affected_notes[0]!.path).toBe("Projects/Target.md");
      expect(result.total_occurrences).toBe(2);
    }
    // No writes anywhere; other notes' bytes untouched.
    expect(state.writes.length).toBe(0);
    expect(state.files.get(relToAbs("Inbox/A.md"))).toBe("STATUS here");
    expect(state.files.get(relToAbs("Archive/C.md"))).toBe("STATUS elsewhere");
    // SC-001 read-half: ONLY the target is read — no sibling is touched (not just
    // not-written). Pins the "no other note is read" clause directly rather than
    // relying on the pattern-bearing-sibling fixture coincidence.
    const readPaths = state.reads;
    expect(readPaths).toEqual([relToAbs("Projects/Target.md")]);
  });

  it("commit rewrites only the named note; all other notes byte/mtime unchanged (SC-001)", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Inbox/A.md"), content: "STATUS here" },
      { abs: relToAbs("Projects/Target.md"), content: "STATUS in target" },
      { abs: relToAbs("Archive/C.md"), content: "STATUS elsewhere" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", vault: "V", path: "Projects/Target.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false },
      baseDeps({ fs }),
    );
    expect(result.mode).toBe("commit");
    if (result.mode === "commit") {
      expect(result.changed_notes).toEqual(["Projects/Target.md"]);
      expect(result.total_occurrences_replaced).toBe(1);
      expect(result.partial).toBe(false);
    }
    expect(state.files.get(relToAbs("Projects/Target.md"))).toBe("STATE in target");
    // Siblings untouched.
    expect(state.files.get(relToAbs("Inbox/A.md"))).toBe("STATUS here");
    expect(state.files.get(relToAbs("Archive/C.md"))).toBe("STATUS elsewhere");
    expect(state.renames.length).toBe(1);
    // SC-001 read-half: every read (first + drift re-scan) hits ONLY the target.
    const readPaths = state.reads;
    expect(readPaths.length).toBeGreaterThan(0);
    expect(readPaths.every((p) => p === relToAbs("Projects/Target.md"))).toBe(true);
  });

  it("named-path + explicit vault resolves within the named vault (G2 / FR-015 allow-case)", async () => {
    const OTHER = resolve("/other-vault");
    const files: MemFile[] = [{ abs: resolve(OTHER, "Projects", "Target.md"), content: "STATUS x" }];
    const { fs, state } = inMemoryFs(files, OTHER);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", vault: "Work", path: "Projects/Target.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs, vaultRegistry: fakeRegistry({ Work: OTHER }) }),
    );
    expect(result.mode).toBe("preview");
    if (result.mode === "preview") {
      expect(result.affected_notes.map((n) => n.path)).toEqual(["Projects/Target.md"]);
    }
    expect(state.writes.length).toBe(0);
  });

  it("zero-match named scope returns an empty success (not an error)", async () => {
    const files: MemFile[] = [{ abs: relToAbs("Projects/Target.md"), content: "nothing matches" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "ZZZ-absent", replacement: "y", mode: "literal", vault: "V", path: "Projects/Target.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs }),
    );
    expect(result).toEqual({ mode: "preview", affected_notes: [], total_occurrences: 0 });
  });

  it("ineligible named target (non-.md) → INVALID_NOTE/not-eligible", async () => {
    const { fs, state } = inMemoryFs([], VAULT_ROOT);
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "y", mode: "literal", vault: "V", path: "Board.canvas", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("INVALID_NOTE");
    expect((err as UpstreamError).details.reason).toBe("not-eligible");
    expect(state.reads).toEqual([]);
    expect(state.writes.length).toBe(0);
  });

  it("ineligible named target (dot-dir segment) → INVALID_NOTE/not-eligible", async () => {
    const { fs } = inMemoryFs([], VAULT_ROOT);
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "y", mode: "literal", vault: "V", path: ".obsidian/config.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("INVALID_NOTE");
    expect((err as UpstreamError).details.reason).toBe("not-eligible");
  });

  it("missing named note → INVALID_NOTE/not-found naming the note (US3-AC4)", async () => {
    const ghostAbs = relToAbs("Projects/Ghost.md");
    const { fs, state } = inMemoryFs([], VAULT_ROOT, {
      realpathOverride: async (p: string) => {
        if (p === ghostAbs) {
          const e = new Error("ENOENT") as NodeJS.ErrnoException;
          e.code = "ENOENT";
          throw e;
        }
        return p; // vault root + parent dirs resolve in-place
      },
    });
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "y", mode: "literal", vault: "V", path: "Projects/Ghost.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("INVALID_NOTE");
    expect((err as UpstreamError).details.reason).toBe("not-found");
    expect((err as UpstreamError).details.note).toBe("Projects/Ghost.md");
    expect(state.reads).toEqual([]);
    expect(state.writes.length).toBe(0);
  });

  it("named-file resolves via the obsidian-file TSV channel (mocked resolveFileByTsv)", async () => {
    const files: MemFile[] = [{ abs: relToAbs("Projects/Target.md"), content: "STATUS once" }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const { spawnFn, getCount } = makeQueuedSpawn([FILE_TSV_OK("Projects/Target.md")]);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", vault: "V", file: "Target", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs, spawnFn }),
    );
    expect(getCount()).toBe(1); // exactly one `obsidian file` spawn
    expect(result.mode).toBe("preview");
    if (result.mode === "preview") {
      expect(result.affected_notes.map((n) => n.path)).toEqual(["Projects/Target.md"]);
    }
    expect(state.writes.length).toBe(0);
  });

  it("named-file COMMIT resolves once and does NOT re-resolve on the drift re-scan (D8)", async () => {
    const files: MemFile[] = [{ abs: relToAbs("Projects/Target.md"), content: "STATUS once" }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    // Exactly ONE queued `obsidian file` response: makeQueuedSpawn throws on
    // overflow, so a commit-time re-resolve (a second TSV spawn) would fail here.
    const { spawnFn, getCount } = makeQueuedSpawn([FILE_TSV_OK("Projects/Target.md")]);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", vault: "V", file: "Target", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false },
      baseDeps({ fs, spawnFn }),
    );
    expect(result.mode).toBe("commit");
    if (result.mode === "commit") {
      expect(result.changed_notes).toEqual(["Projects/Target.md"]);
      expect(result.total_occurrences_replaced).toBe(1);
      expect(result.partial).toBe(false);
    }
    expect(getCount()).toBe(1); // the bare name resolved ONCE across preview + commit scans (D8)
    expect(state.files.get(relToAbs("Projects/Target.md"))).toBe("STATE once");
    expect(state.renames.length).toBe(1);
  });

  it("focused file fork (vault absent) reverse-resolves the display name from the RAW base, not the canonicalised root", async () => {
    // Regression guard for the canonical-vs-raw divergence: an ancestor-symlinked
    // root makes assertCanonicalPath's realpath (CANON) differ from Obsidian's
    // reported basePath (RAW = the registry's reverse-lookup key). The display name
    // MUST be resolved from RAW, else `obsidian file vault=<name>` receives a
    // filesystem path it cannot resolve.
    const RAW = resolve("/sym/vault");
    const CANON = resolve("/real/vault"); // shares basename "vault" so the root check passes
    const symParent = resolve("/sym");
    const realParent = resolve("/real");
    const targetAbs = resolve(CANON, "Projects", "Target.md");
    const files: MemFile[] = [{ abs: targetAbs, content: "STATUS once" }];
    const { fs, state } = inMemoryFs(files, CANON, {
      realpathOverride: async (p: string) => {
        if (p === RAW) return CANON; // the vault root is an ancestor symlink
        if (p === symParent) return realParent; // its parent resolves consistently
        return p; // CANON, CANON/Projects, target, etc. resolve in-place
      },
    });
    // resolveVaultDisplayName returns the registered name ONLY for the RAW base.
    const registry: VaultRegistry = {
      resolveVaultPath: vi.fn(async () => CANON),
      resolveVaultDisplayName: vi.fn((base: string) => (base === RAW ? "FocusedDisplay" : `PATH:${base}`)),
    };
    const invokeEval = vi.fn(async (): Promise<FocusedVaultResponse> => ({ path: null, base: RAW }));
    const { spawnFn, recorded } = makeQueuedSpawn([FILE_TSV_OK("Projects/Target.md")]);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", file: "Target", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs, vaultRegistry: registry, invokeEval, spawnFn }),
    );
    expect(result.mode).toBe("preview");
    // The `obsidian file` spawn received the registered DISPLAY NAME (from RAW),
    // not the canonicalised filesystem path — proves resolveVaultDisplayName(rawRoot).
    const vaultArg = recorded[0]!.argv.find((a) => a.startsWith("vault="));
    expect(vaultArg).toBe("vault=FocusedDisplay");
    expect(state.writes.length).toBe(0);
  });

  it("named-path whose canonical path escapes the vault → PATH_ESCAPES_VAULT + pathEscapeAttempt (C1 / FR-013 Layer-2)", async () => {
    const { dirname } = await import("node:path");
    const parentOfVault = dirname(VAULT_ROOT);
    const subdirAbs = resolve(VAULT_ROOT, "subdir");
    const escape = resolve("/elsewhere");
    const events: Array<Record<string, unknown>> = [];
    const { fs, state } = inMemoryFs([], VAULT_ROOT, {
      realpathOverride: async (p: string) => {
        if (p === VAULT_ROOT) return VAULT_ROOT;
        if (p === parentOfVault) return parentOfVault;
        if (p === subdirAbs) return escape; // the note's parent dir resolves outside
        return p;
      },
    });
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "y", mode: "literal", vault: "V", path: "subdir/evil.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs, logger: captureLogger(events) }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("PATH_ESCAPES_VAULT");
    expect(events.some((e) => e.event === "pathEscapeAttempt")).toBe(true);
    expect(state.writes.length).toBe(0);
  });
});

// =============================================================================
// 066-file-scope — US2 currently-open note (T014)
// =============================================================================

describe("066-file-scope US2 — active_note scope", () => {
  it("preview confines to the open note and reports its location; siblings unchanged (SC-001/G1)", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Projects/Target.md"), content: "STATUS open" },
      { abs: relToAbs("Inbox/A.md"), content: "STATUS sibling" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const { spawnFn } = makeQueuedSpawn([ACTIVE_EVAL("Projects/Target.md")]);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", active_note: true, case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, spawnFn }),
    );
    expect(result.mode).toBe("preview");
    if (result.mode === "preview") {
      expect(result.affected_notes.length).toBe(1);
      expect(result.affected_notes[0]!.path).toBe("Projects/Target.md");
    }
    expect(state.writes.length).toBe(0);
    expect(state.files.get(relToAbs("Inbox/A.md"))).toBe("STATUS sibling");
    // SC-001 read-half: the open note is the ONLY note read.
    const readPaths = state.reads;
    expect(readPaths).toEqual([relToAbs("Projects/Target.md")]);
  });

  it("commit rewrites only the open note; siblings byte-unchanged (SC-001/G1)", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Projects/Target.md"), content: "STATUS open" },
      { abs: relToAbs("Inbox/A.md"), content: "STATUS sibling" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const { spawnFn } = makeQueuedSpawn([ACTIVE_EVAL("Projects/Target.md")]);
    const result = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", active_note: true, case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true },
      baseDeps({ fs, spawnFn }),
    );
    expect(result.mode).toBe("commit");
    if (result.mode === "commit") {
      expect(result.changed_notes).toEqual(["Projects/Target.md"]);
    }
    expect(state.files.get(relToAbs("Projects/Target.md"))).toBe("STATE open");
    expect(state.files.get(relToAbs("Inbox/A.md"))).toBe("STATUS sibling");
  });

  it("no note open → ERR_NO_ACTIVE_FILE; nothing read or changed (US2-AC2)", async () => {
    const files: MemFile[] = [{ abs: relToAbs("Projects/Target.md"), content: "STATUS" }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const { spawnFn } = makeQueuedSpawn([ACTIVE_EVAL(null)]);
    const err = await executeFindAndReplace(
      { pattern: "STATUS", replacement: "STATE", mode: "literal", active_note: true, case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, spawnFn }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("ERR_NO_ACTIVE_FILE");
    expect(state.reads).toEqual([]);
    expect(state.writes.length).toBe(0);
  });

  it("ineligible active file (non-.md) → INVALID_NOTE/not-eligible (T0 P2 sub-probe b)", async () => {
    // Per the T0 P2 decision tree: if Obsidian reports a non-null path for a
    // non-markdown active view, the handler eligibility check rejects it. (If
    // instead Obsidian reports path:null, the no-active-file branch fires — the
    // other documented outcome; this asserts the path-non-null branch.)
    const { fs, state } = inMemoryFs([], VAULT_ROOT);
    const { spawnFn } = makeQueuedSpawn([ACTIVE_EVAL("Board.canvas")]);
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "y", mode: "literal", active_note: true, case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false },
      baseDeps({ fs, spawnFn }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("INVALID_NOTE");
    expect((err as UpstreamError).details.reason).toBe("not-eligible");
    expect(state.reads).toEqual([]);
    expect(state.writes.length).toBe(0);
  });
});

// =============================================================================
// 066-file-scope — US3 conflict + missing-note rejection reads nothing (T017)
// =============================================================================

describe("066-file-scope US3 — rejections read/change nothing (via wrapped tool)", () => {
  it("a SCOPE_CONFLICT rejects at the schema boundary; the handler never runs (no read/write)", async () => {
    const { createFindAndReplaceTool } = await import("./index.js");
    const files: MemFile[] = [{ abs: relToAbs("A.md"), content: "x" }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const tool = createFindAndReplaceTool(baseDeps({ fs }));
    const result = await tool.handler({
      pattern: "x",
      replacement: "y",
      path: "A.md",
      subfolder: "Drafts",
      vault: "V",
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.details.code).toBe("SCOPE_CONFLICT");
    expect(payload.details.reason).toBe("note+folder");
    expect(state.reads).toEqual([]);
    expect(state.writes.length).toBe(0);
  });
});

// =============================================================================
// 066-file-scope — Polish: backward-compat + guards under single-note (T019)
// =============================================================================

describe("066-file-scope Polish — unscoped vault-wide is byte-identical to pre-feature (FR-014/SC-005)", () => {
  it("an unscoped call (no new fields) still walks the whole vault and lists every match", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("Inbox/A.md"), content: "pat here" },
      { abs: relToAbs("Projects/B.md"), content: "pat there" },
    ];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "pat", replacement: "x", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs }),
    );
    expect(result.mode).toBe("preview");
    if (result.mode === "preview") {
      expect(result.affected_notes.map((n) => n.path)).toEqual(["Inbox/A.md", "Projects/B.md"]);
      expect(result.total_occurrences).toBe(2);
    }
  });
});

describe("066-file-scope Polish — guards still fire under a single-note scope (FR-011)", () => {
  it("OCCURRENCE_COUNT_EXCEEDED fires under a single-note scope", async () => {
    const files: MemFile[] = [{ abs: relToAbs("Projects/Target.md"), content: "pat ".repeat(15) }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", path: "Projects/Target.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false, active_note: false },
      baseDeps({ fs, env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: "10" } }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("OCCURRENCE_COUNT_EXCEEDED");
    expect(state.writes.length).toBe(0);
  });

  it("OCCURRENCE_COUNT_DRIFT fires under a single-note scope (fixed-target re-read)", async () => {
    const { fs } = inMemoryFs([{ abs: relToAbs("Projects/Target.md"), content: "pat pat pat" }], VAULT_ROOT);
    let reads = 0;
    fs.readFile = vi.fn(async () => {
      reads++;
      return reads === 1 ? "pat pat pat" : "pat pat pat pat"; // edited between scans
    });
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "rep", mode: "literal", vault: "V", path: "Projects/Target.md", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details.code).toBe("OCCURRENCE_COUNT_DRIFT");
    expect((err as UpstreamError).details.preview_count).toBe(3);
    expect((err as UpstreamError).details.commit_count).toBe(4);
  });
});
