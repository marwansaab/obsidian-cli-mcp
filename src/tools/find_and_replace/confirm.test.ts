// Original — no upstream. find_and_replace 068 PR 6 tests, split from handler.test.ts: the
// multi-note commit confirmation (R12, FR-048/FR-049a, T080), cancel between notes (R11,
// FR-052a, T086) and per-note commit progress (FR-054, T088). Shared fixtures in
// _handler-fixtures.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { baseDeps, inMemoryFs, relToAbs, VAULT_ROOT, type MemFile } from "./_handler-fixtures.js";
import {
  __resetMaxOccurrencesCacheForTests,
  executeFindAndReplace as executeWithCall,
  type ExecuteDeps,
} from "./handler.js";
import { UpstreamError } from "../../errors.js";
import { answeredCall, captureLogger, makeQueuedSpawn } from "../_handler-test-fixtures.js";

import type { FindAndReplaceInput } from "./schema.js";

// The cancel and progress cases run as if the human confirmed the multi-note commit.
const executeFindAndReplace = (input: FindAndReplaceInput, deps: ExecuteDeps) =>
  executeWithCall(input, deps, answeredCall("find_and_replace"));

beforeEach(() => {
  __resetMaxOccurrencesCacheForTests();
});
afterEach(() => {
  __resetMaxOccurrencesCacheForTests();
});

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
    case_sensitive: true,
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
    const confirmed = answeredCall("find_and_replace");
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
    const err = await executeWithCall(commit(), baseDeps({ fs }), answeredCall("find_and_replace", answer)).catch((e: unknown) => e);
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
    const unavailable = await executeWithCall(commit({ folder: "Sub" }), baseDeps({ fs })).catch((e: unknown) => e);
    expect((unavailable as UpstreamError).details).toEqual({ code: "CONFIRMATION_UNAVAILABLE" });

    const asked: string[] = [];
    const confirmed = answeredCall("find_and_replace");
    await executeWithCall(commit({ folder: "Sub" }), baseDeps({ fs }), {
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
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_sensitive: true, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false },
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
      { pattern: "pat", replacement: "REP", mode: "literal", vault: "V", case_sensitive: true, include_code_blocks: false, include_html_comments: false, commit: true, active_note: false },
      { ...baseDeps({ fs }), reportProgress: (p, t, m) => reports.push([p, t, m]) },
    );
    expect(reports).toEqual([
      [1, 2, "A.md"],
      [2, 2, "B.md"],
    ]);
  });
});
