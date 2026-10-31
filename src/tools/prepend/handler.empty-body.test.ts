// Original — no upstream. prepend handler tests for spec 076 (empty-note insertion): contract
// §3 examples E1–E8 and E12, the §4 failure rows, the race and ambiguity cases, and the mirror
// check against append_note (FR-005). Shared fixtures live in _handler-fixtures.ts.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, fakeFs, fakeRegistry, PREPEND_OK, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePrepend, type ExecuteFs } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  captureLogger,
  captureRejection,
  makeQueuedSpawn,
  silentLogger,
} from "../_handler-test-fixtures.js";
import { executeAppendNote, type ExecuteFs as AppendNoteFs } from "../append_note/handler.js";

import type { Logger } from "../../logger.js";
import type { StubResponse } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const PATH = "Sandbox/empty.md";
const EVAL_OK: StubResponse = { stdout: "=> ok\n", exitCode: 0 };
const PROPS = "---\nkey: v\n---\n";
const PROPS_CRLF = "---\r\nkey: v\r\n---\r\n";

function errnoError(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  e.syscall = "open";
  return e;
}

const bytes = (s: string): number => Buffer.byteLength(s, "utf8");

/**
 * Run prepend against a fake note whose text goes `before` → `after` across the call. The
 * default spawn queue answers the prepend call and the correction's metadata-refresh eval.
 */
function runPrepend(opts: {
  before: string | Error;
  after: string | Error;
  content: string;
  inline?: boolean;
  responses?: StubResponse[];
  sizes?: number[];
  over?: Partial<ExecuteFs>;
  logger?: Logger;
}) {
  const sizeOf = (v: string | Error): number => (typeof v === "string" ? bytes(v) : 0);
  const fs = fakeFs({
    sizes: opts.sizes ?? [sizeOf(opts.before), sizeOf(opts.after)],
    contents: [opts.before, opts.after],
    over: opts.over,
  });
  const queued = makeQueuedSpawn(opts.responses ?? [PREPEND_OK, EVAL_OK]);
  const promise = executePrepend(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: PATH,
      content: opts.content,
      inline: opts.inline ?? false,
    },
    deps({
      spawnFn: queued.spawnFn,
      vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }),
      fs,
      logger: opts.logger,
    }),
  );
  return { fs, queued, promise };
}

describe("spec 076 US1 — empty note holds exactly the supplied text", () => {
  test("E1: default mode rewrites the note as the content, bytes_written equals its size", async () => {
    const { fs, queued, promise } = runPrepend({ before: "", after: "first\n", content: "first" });
    const result = await promise;
    expect(result).toEqual({ path: PATH, vault: "TestVault", bytes_written: 5, inline: false });
    expect(fs.writes).toHaveLength(1);
    expect(fs.writes[0]!.content).toBe("first");
    expect(fs.renames).toEqual([{ from: fs.writes[0]!.path, to: fs.statCalls[0] }]);
    expect(queued.getCount()).toBe(2);
    expect(queued.recorded[1]!.argv).toContain("eval");
  });

  test("E2: inline mode is already exact — no read, no write", async () => {
    const { fs, queued, promise } = runPrepend({
      before: "",
      after: "first",
      content: "first",
      inline: true,
      responses: [PREPEND_OK],
    });
    const result = await promise;
    expect(result.bytes_written).toBe(5);
    expect(fs.readCalls).toEqual([]);
    expect(fs.writes).toEqual([]);
    expect(queued.getCount()).toBe(1);
  });

  test("E3: content ending in a line break keeps exactly that one", async () => {
    const { fs, promise } = runPrepend({ before: "", after: "first\n\n", content: "first\n" });
    expect((await promise).bytes_written).toBe(6);
    expect(fs.writes.map((w) => w.content)).toEqual(["first\n"]);
  });

  test("E4: multi-byte content — bytes_written counts UTF-8 bytes", async () => {
    const { fs, promise } = runPrepend({ before: "", after: "café\n", content: "café" });
    expect((await promise).bytes_written).toBe(5);
    expect(fs.writes.map((w) => w.content)).toEqual(["café"]);
  });

  test("race: another writer changed the note — no write, the measured size change is reported", async () => {
    const { fs, queued, promise } = runPrepend({
      before: "",
      after: "first\nX",
      content: "first",
      sizes: [0, 6],
      responses: [PREPEND_OK],
    });
    expect((await promise).bytes_written).toBe(6);
    expect(fs.writes).toEqual([]);
    expect(queued.getCount()).toBe(1);
  });

  test("metadata refresh failure never fails the call", async () => {
    const events: Array<Record<string, unknown>> = [];
    const { promise } = runPrepend({
      before: "",
      after: "first\n",
      content: "first",
      responses: [PREPEND_OK, { stdout: "", stderr: "boom", exitCode: 1 }],
      logger: captureLogger(events),
    });
    expect((await promise).bytes_written).toBe(5);
    const failed = events.filter((e) => e.event === "bridge.metadata_refresh_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ vault: "TestVault", relPath: PATH });
  });
});

describe("spec 076 §4 — failures", () => {
  test("read-back fails on an empty note → FS_WRITE_FAILED extra-trailing-newline", async () => {
    const ebusy = errnoError("EBUSY");
    const { fs, promise } = runPrepend({
      before: "",
      after: ebusy,
      content: "first",
      sizes: [0, 6],
      responses: [PREPEND_OK],
    });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("FS_WRITE_FAILED");
    expect(err.details).toEqual({
      reason: "extra-trailing-newline",
      path: PATH,
      vault: "TestVault",
      errno: "EBUSY",
    });
    expect(err.cause).toBe(ebusy);
    expect(err.message).toMatch(
      /extra trailing line break Obsidian added could not be removed \(EBUSY\)/,
    );
    expect(fs.writes).toEqual([]);
  });

  test.each([
    ["a note with a body", "abc", "def", [3, 7]],
    ["a properties-only note", PROPS, "Lead", [bytes(PROPS), bytes(PROPS) + 5]],
  ])(
    "read-back fails on %s → FS_WRITE_FAILED unverified, no reason",
    async (_label, before, content, sizes) => {
      const ebusy = errnoError("EBUSY");
      const { fs, promise } = runPrepend({
        before,
        after: ebusy,
        content,
        sizes,
        responses: [PREPEND_OK],
      });
      const err = (await captureRejection(promise)) as UpstreamError;
      expect(err.code).toBe("FS_WRITE_FAILED");
      expect(err.details).toEqual({ errno: "EBUSY", syscall: "open", path: PATH });
      expect(err.cause).toBe(ebusy);
      expect(err.message).toMatch(/Do not send the content again/);
      expect(fs.writes).toEqual([]);
    },
  );

  test("writeAtomic rename fails → FS_WRITE_FAILED extra-trailing-newline, tmp unlinked", async () => {
    const eperm = errnoError("EPERM");
    const { fs, promise } = runPrepend({
      before: "",
      after: "first\n",
      content: "first",
      responses: [PREPEND_OK],
      over: {
        rename: async () => {
          throw eperm;
        },
      },
    });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err.code).toBe("FS_WRITE_FAILED");
    expect(err.details).toEqual({
      reason: "extra-trailing-newline",
      path: PATH,
      vault: "TestVault",
      errno: "EPERM",
    });
    expect(err.cause).toBe(eperm);
    expect(fs.unlinks).toEqual([fs.writes[0]!.path]);
  });

  test("pre-read ENOENT → upstream NOTE_NOT_FOUND classification, no correction", async () => {
    const { fs, promise } = runPrepend({
      before: errnoError("ENOENT"),
      after: "",
      content: "first",
      sizes: [0, 0],
      responses: [{ stdout: "Error: Note not found.\n", exitCode: 0 }],
    });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.code).toBe("NOTE_NOT_FOUND");
    expect(fs.readCalls).toHaveLength(1);
    expect(fs.writes).toEqual([]);
  });

  test("pre-read non-ENOENT → FS_WRITE_FAILED before Obsidian is called", async () => {
    const eacces = errnoError("EACCES");
    const { fs, queued, promise } = runPrepend({
      before: eacces,
      after: "",
      content: "first",
      responses: [PREPEND_OK],
    });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err.code).toBe("FS_WRITE_FAILED");
    expect(err.details).toEqual({ errno: "EACCES", syscall: "open", path: PATH });
    expect(err.cause).toBe(eacces);
    expect(queued.getCount()).toBe(0);
    expect(fs.writes).toEqual([]);
  });

  test("inline mode never reads the note, so an unreadable note still prepends (FR-009)", async () => {
    const { fs, queued, promise } = runPrepend({
      before: errnoError("EACCES"),
      after: "",
      content: "first",
      inline: true,
      sizes: [3, 8],
      responses: [PREPEND_OK],
    });
    expect((await promise).bytes_written).toBe(5);
    expect(fs.readCalls).toEqual([]);
    expect(queued.getCount()).toBe(1);
  });
});

describe("mirror with append_note (spec 076 FR-005)", () => {
  test.each(["first", "first\n", "café"])(
    "content %j: same note and same bytes_written",
    async (content) => {
      const { fs, promise } = runPrepend({ before: "", after: content + "\n", content });
      const prependResult = await promise;

      const appendWrites: string[] = [];
      const appendFs: AppendNoteFs = {
        realpath: async (p: string) => {
          if (p === VAULT_ROOT) return VAULT_ROOT;
          throw errnoError("ENOENT");
        },
        readFile: async () => "",
        writeFile: async (_p: string, c: string) => {
          appendWrites.push(c);
        },
        rename: async () => {},
        unlink: async () => {},
      };
      const appendResult = await executeAppendNote(
        { target_mode: "specific", vault: "TestVault", path: PATH, content, inline: false },
        {
          logger: silentLogger(),
          queue: createQueue(),
          vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }),
          spawnFn: makeQueuedSpawn([EVAL_OK]).spawnFn,
          env: {},
          fs: appendFs,
        },
      );

      expect(fs.writes.map((w) => w.content)).toEqual(appendWrites);
      expect(prependResult.bytes_written).toBe(appendResult.bytes_written);
    },
  );
});

describe("spec 076 US3 — notes with only a properties block", () => {
  test("E5: LF properties block — rewritten without the extra line break", async () => {
    const { fs, promise } = runPrepend({ before: PROPS, after: PROPS + "Lead\n", content: "Lead" });
    expect((await promise).bytes_written).toBe(4);
    expect(fs.writes.map((w) => w.content)).toEqual([PROPS + "Lead"]);
  });

  test("E6: inline mode — no read, no write", async () => {
    const { fs, promise } = runPrepend({
      before: PROPS,
      after: PROPS + "Lead",
      content: "Lead",
      inline: true,
      responses: [PREPEND_OK],
    });
    expect((await promise).bytes_written).toBe(4);
    expect(fs.readCalls).toEqual([]);
    expect(fs.writes).toEqual([]);
  });

  test("E7: CRLF properties block — rewritten without the extra line break", async () => {
    const { fs, promise } = runPrepend({
      before: PROPS_CRLF,
      after: PROPS_CRLF + "Lead\n",
      content: "Lead",
    });
    expect((await promise).bytes_written).toBe(4);
    expect(fs.writes.map((w) => w.content)).toEqual([PROPS_CRLF + "Lead"]);
  });

  test("E8: no line break after the closing --- — placement kept, extra line break removed", async () => {
    const before = "---\nkey: v\n---";
    const { fs, promise } = runPrepend({ before, after: before + "Lead\n", content: "Lead" });
    expect((await promise).bytes_written).toBe(4);
    expect(fs.writes.map((w) => w.content)).toEqual([before + "Lead"]);
  });

  test("E12: ambiguity guard — content repeating the note's end is left as Obsidian wrote it", async () => {
    const { fs, queued, promise } = runPrepend({
      before: PROPS,
      after: PROPS + "---\n",
      content: "---",
      responses: [PREPEND_OK],
    });
    expect((await promise).bytes_written).toBe(4);
    expect(fs.writes).toEqual([]);
    expect(queued.getCount()).toBe(1);
  });
});
