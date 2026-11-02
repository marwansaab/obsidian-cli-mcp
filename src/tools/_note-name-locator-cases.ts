// Original — no upstream. Shared note-name locator battery (spec 089, BI-0171): rows N1–N9 of contracts/note-name-contract.md, written once for the direct-fs editors that resolve a `file` name through `resolveFsTarget` (patch_block, patch_heading). Each editor's co-located `handler.note-name.test.ts` calls `describeNoteNameLocator` with its handler, its fs fixture and the few facts that differ per editor. Test support only: excluded from the build.
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { __resetInFlightRegistryForTests } from "../cli-adapter/_dispatch.js";
import { UpstreamError } from "../errors.js";
import {
  captureRejection,
  fileTsvResponse,
  makeQueuedSpawn,
  unwrapEvalCode,
  type StubResponse,
} from "./_handler-test-fixtures.js";

import type { SpawnLike } from "../cli-adapter/_dispatch.js";

export type NoteLocator = { file: string } | { path: string };

/** The tracking arrays both editors' `fakeFs` fixtures carry. */
interface TrackedFs {
  reads: string[];
  writes: Array<[string, string]>;
  renames: Array<[string, string]>;
}

export interface NoteNameSubject<TFs extends TrackedFs> {
  /** The vault root the subject's registry maps `TestVault` to. */
  vaultRoot: string;
  /** A note the edit succeeds on. */
  note: string;
  /** The editor's fs double: every read returns `content`, or `readFile` when given. */
  fakeFs(content: string, readFile?: () => Promise<string>): TFs;
  /** Runs the editor in specific mode on `locator` in `vault`, against a registry knowing only `TestVault`. */
  execute(
    locator: NoteLocator,
    vault: string,
    spawnFn: SpawnLike,
    fs: TFs,
  ): Promise<{ path: string }>;
  /** Asserts the edit landed where it should in the written text. */
  assertEdited(written: string): void;
  /** A note lacking the edit's target, and the `details.code` the editor reports for it (N7). */
  targetMissing: { note: string; code: string };
}

const EVAL_OK: StubResponse = { stdout: "=> undefined\n", exitCode: 0 };

export function describeNoteNameLocator<TFs extends TrackedFs>(
  subject: NoteNameSubject<TFs>,
): void {
  beforeEach(() => __resetInFlightRegistryForTests());
  afterEach(() => __resetInFlightRegistryForTests());

  function run(
    locator: NoteLocator,
    responses: StubResponse[],
    fs: TFs = subject.fakeFs(subject.note),
    vault = "TestVault",
  ) {
    const spawn = makeQueuedSpawn(responses);
    return { call: subject.execute(locator, vault, spawn.spawnFn, fs), fs, ...spawn };
  }

  async function rejection(call: Promise<unknown>): Promise<UpstreamError> {
    const err = await captureRejection(call);
    expect(err).toBeInstanceOf(UpstreamError);
    return err as UpstreamError;
  }

  describe("N1 — a bare name edits the note it resolves to in a sub-folder", () => {
    test("reads and writes the resolved path and reports it", async () => {
      const { call, fs, recorded } = run({ file: "Meeting Notes" }, [
        fileTsvResponse("Projects/Deep/Meeting Notes.md"),
        EVAL_OK,
      ]);
      const result = await call;
      const abs = join(subject.vaultRoot, "Projects/Deep/Meeting Notes.md");
      expect(fs.reads[0]).toBe(abs);
      expect(fs.renames[0]![1]).toBe(abs);
      expect(result.path).toBe("Projects/Deep/Meeting Notes.md");
      subject.assertEdited(fs.writes[0]![1]);
      expect(recorded.length).toBe(2);
      expect(recorded[0]!.argv).toContain("file");
      expect(recorded[0]!.argv).toContain("vault=TestVault");
      expect(recorded[0]!.argv).toContain("file=Meeting Notes");
    });
  });

  describe("N2 — the lookup runs before any fs read; the refresh names the resolved note", () => {
    test("one spawn precedes the first read, and the refresh eval carries the resolved path", async () => {
      const { spawnFn, recorded, getCount } = makeQueuedSpawn([
        fileTsvResponse("Projects/Deep/Meeting Notes.md"),
        EVAL_OK,
      ]);
      let spawnsAtFirstRead: number | undefined;
      const fs = subject.fakeFs(subject.note, async () => {
        spawnsAtFirstRead ??= getCount();
        return subject.note;
      });
      await subject.execute({ file: "Meeting Notes" }, "TestVault", spawnFn, fs);
      expect(spawnsAtFirstRead).toBe(1);
      const codeArg = recorded[1]!.argv.find((a) => a.startsWith("code="));
      expect(codeArg).toBeDefined();
      const code = unwrapEvalCode(codeArg!);
      expect(code).toContain("Projects/Deep/Meeting Notes.md");
      expect(code).not.toContain(JSON.stringify("Meeting Notes"));
    });
  });

  describe("N3 — the locator is sent to the lookup as given", () => {
    test.each([["Projects/Meeting Notes.md"], ["Projects/Meeting Notes"]])(
      "file: %s",
      async (file) => {
        const { call, recorded } = run({ file }, [
          fileTsvResponse("Projects/Meeting Notes.md"),
          EVAL_OK,
        ]);
        const result = await call;
        expect(recorded[0]!.argv).toContain(`file=${file}`);
        expect(result.path).toBe("Projects/Meeting Notes.md");
      },
    );
  });

  describe("N4 — a name that matches no note fails like read, before any fs access", () => {
    test("passes Obsidian's not-found line through as CLI_REPORTED_ERROR, not NOTE_NOT_FOUND", async () => {
      const { call, fs, recorded } = run({ file: "Missing" }, [
        { stdout: 'Error: File "Missing" not found.\n', exitCode: 0 },
      ]);
      const err = await rejection(call);
      expect(err.code).toBe("CLI_REPORTED_ERROR");
      expect(err.details.message).toBe('Error: File "Missing" not found.');
      expect(err.details.code).toBeUndefined();
      expect(fs.reads).toEqual([]);
      expect(fs.writes).toEqual([]);
      expect(fs.renames).toEqual([]);
      expect(recorded.length).toBe(1);
    });
  });

  describe("N5 — a lookup answer without a path line fails at the TSV parse", () => {
    test("CLI_REPORTED_ERROR stage file-tsv-parse, no fs read", async () => {
      const { call, fs } = run({ file: "Meeting Notes" }, [
        { stdout: "not a TSV line\n", exitCode: 0 },
      ]);
      const err = await rejection(call);
      expect(err.code).toBe("CLI_REPORTED_ERROR");
      expect(err.details.stage).toBe("file-tsv-parse");
      expect(fs.reads).toEqual([]);
    });
  });

  describe("N6 — an unknown vault fails before the lookup", () => {
    test("registry error, no spawn, no fs read", async () => {
      const { call, fs, recorded } = run({ file: "Meeting Notes" }, [], undefined, "Nope");
      const err = await rejection(call);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(recorded.length).toBe(0);
      expect(fs.reads).toEqual([]);
    });
  });

  describe("N7 — a target missing from the resolved note names the resolved path", () => {
    test(`${subject.targetMissing.code} with details.path, no write`, async () => {
      const { call, fs } = run(
        { file: "x" },
        [fileTsvResponse("Projects/x.md")],
        subject.fakeFs(subject.targetMissing.note),
      );
      const err = await rejection(call);
      expect(err.code).toBe("CLI_REPORTED_ERROR");
      expect(err.details.code).toBe(subject.targetMissing.code);
      expect(err.details.path).toBe("Projects/x.md");
      expect(fs.writes).toEqual([]);
    });
  });

  describe("N8 — a path makes no lookup", () => {
    test("one spawn (the refresh), no file= argv", async () => {
      const { call, recorded } = run({ path: "n.md" }, [EVAL_OK]);
      const result = await call;
      expect(recorded.length).toBe(1);
      expect(recorded[0]!.argv.some((a) => a.startsWith("file="))).toBe(false);
      expect(result.path).toBe("n.md");
    });
  });

  describe("N9 — a bare name of a note at the vault root edits that note", () => {
    test("reads and writes Daily.md, not Daily", async () => {
      const { call, fs } = run({ file: "Daily" }, [fileTsvResponse("Daily.md"), EVAL_OK]);
      const result = await call;
      const abs = join(subject.vaultRoot, "Daily.md");
      expect(fs.reads[0]).toBe(abs);
      expect(fs.renames[0]![1]).toBe(abs);
      expect(result.path).toBe("Daily.md");
    });
  });
}
