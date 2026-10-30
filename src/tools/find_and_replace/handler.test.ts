// Original — no upstream. Tests for executeFindAndReplace core behaviour — US1
// preview/commit happy-paths, code-block + HTML-comment skip defaults,
// frontmatter-as-prose, drift, FS read/write failures (with partial-commit envelope
// inlined), canonical-level vault + per-note escapes, line-ending + BOM preservation,
// vault not-found + not-open, focused-vault invokeEval discovery, concurrent commits
// via Queue, US2 include_* opt-ins, US3 subfolder narrowing + unknown-subfolder +
// symlink-escape, US4 bound enforcement + env-var fallback + WARN. Single-note scope
// (066-file-scope) lives in scope.test.ts; shared fixtures in _handler-fixtures.ts.
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  baseDeps,
  fakeRegistry,
  inMemoryFs,
  relToAbs,
  VAULT_ROOT,
  type MemFile,
} from "./_handler-fixtures.js";
import {
  __resetMaxOccurrencesCacheForTests,
  executeFindAndReplace as executeWithCall,
  type ExecuteDeps,
  type ExecuteFs,
  type FocusedVaultResponse,
} from "./handler.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { answeredCall, captureLogger, makeQueuedSpawn } from "../_handler-test-fixtures.js";

import type { FindAndReplaceInput } from "./schema.js";

// The commit mechanics below run as if the human confirmed every multi-note commit (068 R12);
// the confirmation, cancel and progress paths have their own describe blocks at the end.
const executeFindAndReplace = (input: FindAndReplaceInput, deps: ExecuteDeps) =>
  executeWithCall(input, deps, answeredCall());

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
      { pattern: "ADR-0042", replacement: "ADR-0089", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "alpha", replacement: "beta", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs }),
    );
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
      { pattern: "ADR-0042", replacement: "ADR-0089", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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

describe("068 A1 — metadata refresh per committed note", () => {
  const twoNotes = (): MemFile[] => [
    { abs: relToAbs("Sub/A.md"), content: "pat one" },
    { abs: relToAbs("B.md"), content: "pat two" },
  ];
  const commitInput = { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false } as const;

  it("a 2-note commit on a real queue completes, with one refresh per changed note in the written vault", async () => {
    const { fs, state } = inMemoryFs(twoNotes(), VAULT_ROOT);
    const { spawnFn, recorded } = makeQueuedSpawn([
      { stdout: "=> ok\n", exitCode: 0 },
      { stdout: "=> ok\n", exitCode: 0 },
    ]);
    const result = await executeFindAndReplace(commitInput, baseDeps({ fs, spawnFn, queue: createQueue() }));
    expect(result).toEqual({ mode: "commit", changed_notes: ["B.md", "Sub/A.md"], total_occurrences_replaced: 2, partial: false });
    expect(state.renames.length).toBe(2);
    expect(recorded.map((r) => r.argv.find((a) => a.startsWith("vault=")))).toEqual(["vault=V", "vault=V"]);
    expect(recorded.map((r) => r.argv.find((a) => a.startsWith("code=")))).toEqual([
      expect.stringContaining('getFileByPath("B.md")'),
      expect.stringContaining('getFileByPath("Sub/A.md")'),
    ]);
  });

  it("a refresh failure does not change the commit result and is logged", async () => {
    const { fs } = inMemoryFs(twoNotes(), VAULT_ROOT);
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "Error: boom\n", exitCode: 1 },
      { stdout: "=> ok\n", exitCode: 0 },
    ]);
    const events: Array<Record<string, unknown>> = [];
    const result = await executeFindAndReplace(commitInput, baseDeps({ fs, spawnFn, logger: captureLogger(events) }));
    expect(result).toEqual({ mode: "commit", changed_notes: ["B.md", "Sub/A.md"], total_occurrences_replaced: 2, partial: false });
    const failed = events.filter((e) => e.event === "bridge.metadata_refresh_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ vault: "V", relPath: "B.md", reason: "cli-error" });
  });
});

describe("US1 — empty result", () => {
  it("preview with no match returns empty success", async () => {
    const files: MemFile[] = [{ abs: relToAbs("a.md"), content: "no match here" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const result = await executeFindAndReplace(
      { pattern: "xyzzy", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "xyzzy", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "OldName", replacement: "NewName", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "OldName", replacement: "NewName", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "ADR-0042", replacement: "ADR-0089", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "rep", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "x", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "p", replacement: "q", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
      baseDeps({ fs }),
    );
    expect(state.files.get(relToAbs("n.md"))).toBe(`${BOM}X content`);
  });
});

describe("US1 — vault registry errors", () => {
  it("unknown vault → CLI_REPORTED_ERROR + VAULT_NOT_FOUND + reason:unknown", async () => {
    const { fs } = inMemoryFs([], VAULT_ROOT);
    const err = await executeFindAndReplace(
      { pattern: "x", replacement: "_", mode: "literal", vault: "Typo", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "alpha", replacement: "X", mode: "literal", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "alpha", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "X", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
      deps,
    );
    const p2 = executeFindAndReplace(
      { pattern: "pat", replacement: "Y", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs }),
    );
    if (preview.mode === "preview") expect(preview.total_occurrences).toBe(2);
    const commit = await executeFindAndReplace(
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: true, commit: true , active_note: false },
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
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "Old", replacement: "New", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: true, include_html_comments: true, commit: false , active_note: false },
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
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", subfolder: "Decisions", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", subfolder: "DoesNotExist", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "x", replacement: "_", mode: "literal", vault: "V", subfolder: "outer/EvilLink", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
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
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
        { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
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
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true , active_note: false },
      baseDeps({ fs, env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: "5" } }),
    ).catch((e) => e);
    expect((err as UpstreamError).details.code).toBe("OCCURRENCE_COUNT_EXCEEDED");
  });
});

// =============================================================================
// Coverage gaps — clipFullLine ellipsis, defaultInvokeEval (parse + throw),
// listEligibleNotes readdir failure, subfolder realpath non-ENOENT rethrow.
// =============================================================================

describe("clipFullLine — full_line over FULL_LINE_CAP gets ellipsis (L189)", () => {
  it("matched line longer than 500 chars reports a full_line ending with the ellipsis", async () => {
    // 600-char prose line containing the pattern; clip at 500 + U+2026.
    const longLine = "pat " + "x".repeat(600);
    const files: MemFile[] = [{ abs: relToAbs("n.md"), content: longLine }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const r = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs }),
    );
    expect(r.mode).toBe("preview");
    if (r.mode === "preview") {
      const fullLine = r.affected_notes[0]!.occurrences[0]!.full_line;
      expect(fullLine.endsWith("…")).toBe(true);
      expect(fullLine.length).toBe(501); // 500 cap + 1 ellipsis char
    }
  });
});

describe("defaultInvokeEval — default factory drives obsidian eval (L192-220)", () => {
  // FOCUSED_VAULT_TEMPLATE returns JSON.stringify({...}); the `obsidian eval`
  // echo lands as `=> "<json-encoded string>"`. parseFocusedVault strips the
  // `=> ` echo + JSON.parse (outer string), then JSON.parse again (inner object).
  function focusedVaultStdout(envelope: { path: string | null; base: string }): string {
    return "=> " + JSON.stringify(JSON.stringify(envelope));
  }

  it("input.vault absent + no injected invokeEval → default eval round-trip resolves the focused vault root", async () => {
    const files: MemFile[] = [{ abs: relToAbs("note.md"), content: "alpha" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const { spawnFn, getCount } = makeQueuedSpawn([
      { stdout: focusedVaultStdout({ path: null, base: VAULT_ROOT }), exitCode: 0 },
    ]);
    const result = await executeFindAndReplace(
      { pattern: "alpha", replacement: "X", mode: "literal", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs, spawnFn }), // invokeEval omitted → defaultInvokeEval runs
    );
    expect(getCount()).toBe(1); // exactly one `obsidian eval` spawn
    expect(result.mode).toBe("preview");
    if (result.mode === "preview") {
      expect(result.total_occurrences).toBe(1);
      expect(result.affected_notes[0]!.path).toBe("note.md");
    }
  });

  it("default eval round-trip with UNPARSEABLE stdout → CLI_REPORTED_ERROR (L212-218 throw)", async () => {
    const files: MemFile[] = [{ abs: relToAbs("note.md"), content: "alpha" }];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const { spawnFn } = makeQueuedSpawn([
      // `=> ` echo present but the body is not valid JSON → parseFocusedVault
      // fails at the json-parse stage.
      { stdout: "=> not-valid-json-at-all", exitCode: 0 },
    ]);
    const err = await executeFindAndReplace(
      { pattern: "alpha", replacement: "X", mode: "literal", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs, spawnFn }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((err as UpstreamError).details.stage).toBe("json-parse");
    expect((err as UpstreamError).details.stdout).toBe("=> not-valid-json-at-all");
  });
});

describe("listEligibleNotes — readdir failure surfaces via mapFsError (L252)", () => {
  it("readdirError seam set → FS_WRITE_FAILED with reason:read + errno", async () => {
    const eio = Object.assign(new Error("EIO"), {
      code: "EIO",
      syscall: "scandir",
    }) as NodeJS.ErrnoException;
    const files: MemFile[] = [{ abs: relToAbs("a.md"), content: "pat" }];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT, { readdirError: eio });
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("read");
    expect((err as UpstreamError).details.errno).toBe("EIO");
    expect((err as UpstreamError).details.syscall).toBe("scandir");
    expect(state.writes.length).toBe(0);
  });
});


describe("subfolder realpath — non-ENOENT error rethrows raw (L436)", () => {
  it("EACCES (not ENOENT) on the subfolder realpath probe bubbles unchanged", async () => {
    const { dirname } = await import("node:path");
    const parentOfVault = dirname(VAULT_ROOT);
    const subAbs = resolve(VAULT_ROOT, "Sub");
    const eacces = Object.assign(new Error("EACCES"), {
      code: "EACCES",
      syscall: "stat",
    }) as NodeJS.ErrnoException;
    const files: MemFile[] = [{ abs: relToAbs("Sub/a.md"), content: "pat" }];
    // Path-discriminating override: canonical checks (vault root + its parent)
    // succeed so assertCanonicalPath passes; only the direct L421 probe on the
    // resolved subfolder path throws a NON-ENOENT error → the L436 raw rethrow.
    const { fs } = inMemoryFs(files, VAULT_ROOT, {
      realpathOverride: async (p: string) => {
        if (p === subAbs) throw eacces;
        if (p === VAULT_ROOT) return VAULT_ROOT;
        if (p === parentOfVault) return parentOfVault;
        return p;
      },
    });
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "_", mode: "literal", vault: "V", subfolder: "Sub", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: false , active_note: false },
      baseDeps({ fs }),
    ).catch((e) => e);
    // Raw rethrow — NOT wrapped in an UpstreamError, NOT the INVALID_SUBFOLDER branch.
    expect(err).toBe(eacces);
    expect((err as NodeJS.ErrnoException).code).toBe("EACCES");
    expect(err).not.toBeInstanceOf(UpstreamError);
  });
});

// =============================================================================
// 068 PR 6 — confirmation (R12, FR-048/FR-049a), cancel (R11, FR-052a), progress (FR-054)
// =============================================================================

describe("068 R12 — multi-note commit confirmation (T080)", () => {
  const threeNotes = (): MemFile[] => [
    { abs: relToAbs("A.md"), content: "pat a" },
    { abs: relToAbs("Sub/B.md"), content: "pat b" },
    { abs: relToAbs("Sub/C.md"), content: "pat c" },
  ];
  const commit = (over: Partial<FindAndReplaceInput> = {}): FindAndReplaceInput => ({
    pattern: "pat",
    replacement: "REP",
    mode: "literal",
    vault: "V",
    case_insensitive: false,
    include_code_blocks: false,
    include_html_comments: false,
    commit: true,
    active_note: false,
    ...over,
  });

  it.each([
    ["vault given", { vault: "V" }],
    ["vault omitted (focused vault)", { vault: undefined }],
  ])("unavailable (%s): CONFIRMATION_UNAVAILABLE; no spawn, no registry probe, no read, no write", async (_label, over) => {
    const { fs, state } = inMemoryFs(threeNotes(), VAULT_ROOT);
    const { spawnFn, recorded } = makeQueuedSpawn([]);
    const resolveVaultPath = vi.fn(async () => VAULT_ROOT);
    const err = await executeWithCall(commit(over), baseDeps({ fs, spawnFn, vaultRegistry: { resolveVaultPath } })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((err as UpstreamError).details).toEqual({ code: "CONFIRMATION_UNAVAILABLE" });
    expect((err as UpstreamError).message).toContain("Commit one note at a time with `file` or `path`");
    expect(recorded).toHaveLength(0);
    expect(resolveVaultPath).not.toHaveBeenCalled();
    expect(state.reads).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it("confirmed: writes every note; the question carries the vault, scope and note count", async () => {
    const { fs, state } = inMemoryFs(threeNotes(), VAULT_ROOT);
    const asked: string[] = [];
    const confirmed = answeredCall();
    const result = await executeWithCall(commit(), baseDeps({ fs }), {
      ...confirmed,
      confirm: (message) => {
        asked.push(message);
        confirmed.confirm(message);
      },
    });
    expect(result).toMatchObject({ mode: "commit", changed_notes: ["A.md", "Sub/B.md", "Sub/C.md"], partial: false });
    expect(state.renames).toHaveLength(3);
    expect(asked).toEqual(['Replace 3 occurrence(s) of "pat" in 3 note(s) across vault "V"? The notes are rewritten in place.']);
  });

  it.each([
    ["decline", { action: "decline" as const }],
    ["cancel", { action: "cancel" as const }],
    ["accept with confirm:false", { action: "accept" as const, content: { confirm: false } }],
  ])("%s → CONFIRMATION_DECLINED and nothing is written", async (_label, answer) => {
    const { fs, state } = inMemoryFs(threeNotes(), VAULT_ROOT);
    const err = await executeWithCall(commit(), baseDeps({ fs }), answeredCall(answer)).catch((e: unknown) => e);
    expect((err as UpstreamError).details).toEqual({ code: "CONFIRMATION_DECLINED", action: answer.action });
    expect(state.writes).toEqual([]);
    expect(state.renames).toEqual([]);
  });

  it("a single-note scope asks nothing, even from a client that cannot confirm", async () => {
    const { fs, state } = inMemoryFs(threeNotes(), VAULT_ROOT);
    const result = await executeWithCall(commit({ path: "A.md" }), baseDeps({ fs }));
    expect(result).toMatchObject({ mode: "commit", changed_notes: ["A.md"] });
    expect(state.renames).toHaveLength(1);
  });

  it("a subfolder scope still asks, and the question names the subfolder", async () => {
    const { fs } = inMemoryFs(threeNotes(), VAULT_ROOT);
    const unavailable = await executeWithCall(commit({ subfolder: "Sub" }), baseDeps({ fs })).catch((e: unknown) => e);
    expect((unavailable as UpstreamError).details).toEqual({ code: "CONFIRMATION_UNAVAILABLE" });

    const asked: string[] = [];
    const confirmed = answeredCall();
    await executeWithCall(commit({ subfolder: "Sub" }), baseDeps({ fs }), {
      ...confirmed,
      confirm: (message) => {
        asked.push(message);
        confirmed.confirm(message);
      },
    });
    expect(asked[0]).toContain('in 2 note(s) under "Sub" in vault "V"');
  });

  it("a preview asks nothing", async () => {
    const { fs } = inMemoryFs(threeNotes(), VAULT_ROOT);
    const result = await executeWithCall(commit({ commit: false }), baseDeps({ fs }));
    expect(result).toMatchObject({ mode: "preview", total_occurrences: 3 });
  });
});

describe("068 R11 — cancel between notes (T086, FR-052a)", () => {
  it("cancel after the first of three writes: note 1 changed, notes 2 and 3 unchanged, commitCancelled lists both groups", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("1.md"), content: "pat one" },
      { abs: relToAbs("2.md"), content: "pat two" },
      { abs: relToAbs("3.md"), content: "pat three" },
    ];
    const { fs, state } = inMemoryFs(files, VAULT_ROOT);
    const controller = new AbortController();
    const reason = new Error("cancelled by client");
    const events: Array<Record<string, unknown>> = [];
    const deps: ExecuteDeps = {
      ...baseDeps({ fs, logger: captureLogger(events) }),
      signal: controller.signal,
      // The cancel lands right after note 1 is written and reported.
      reportProgress: (progress) => {
        if (progress === 1) controller.abort(reason);
      },
    };
    const err = await executeFindAndReplace(
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false },
      deps,
    ).catch((e: unknown) => e);
    expect(err).toBe(reason);
    expect(state.files.get(relToAbs("1.md"))).toBe("REP one");
    expect(state.files.get(relToAbs("2.md"))).toBe("pat two");
    expect(state.files.get(relToAbs("3.md"))).toBe("pat three");
    const cancelled = events.filter((e) => e.event === "find_and_replace.commit_cancelled");
    expect(cancelled).toEqual([
      expect.objectContaining({ vault: "V", committed: ["1.md"], skipped: ["2.md", "3.md"] }),
    ]);
  });
});

describe("068 FR-054 — commit progress (T088)", () => {
  it("reports (n, total, relPath) after each written note", async () => {
    const files: MemFile[] = [
      { abs: relToAbs("A.md"), content: "pat a" },
      { abs: relToAbs("B.md"), content: "pat b" },
    ];
    const { fs } = inMemoryFs(files, VAULT_ROOT);
    const reports: Array<[number, number, string]> = [];
    await executeFindAndReplace(
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_insensitive: false, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false },
      { ...baseDeps({ fs }), reportProgress: (p, t, m) => reports.push([p, t, m]) },
    );
    expect(reports).toEqual([
      [1, 2, "A.md"],
      [2, 2, "B.md"],
    ]);
  });
});
