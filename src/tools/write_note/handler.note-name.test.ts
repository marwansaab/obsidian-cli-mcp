// Original — no upstream. write_note handler tests for BI-0176: a specific-mode `file` name is resolved like a wikilink by one lookup eval in the named vault (`vault=` on the argv), so an existing note is written wherever it is, and only a name no note has falls back to the vault-root short-form rule. The lookup reports the vault it ran in; any other vault than the named one fails as CLI_REPORTED_ERROR / VAULT_MISMATCH with nothing written (owner ruling, scope (a)). `path` and active mode make no lookup.
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, nameLookupResponse, VAULT_ROOT } from "./_handler-fixtures.js";
import { executeWriteNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import {
  captureRejection,
  coldStartResponse,
  focusedFileResponse,
  makeQueuedSpawn,
  unwrapEvalCode,
  type StubResponse,
} from "../_handler-test-fixtures.js";

import type { ExecuteFs } from "./handler.js";
import type { WriteNoteInput } from "./schema.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const SUB_ALPHA = join(VAULT_ROOT, "Sub/Alpha.md");

function byName(file: string, overwrite: boolean): WriteNoteInput {
  return { target_mode: "specific", vault: "TestVault", file, content: "new", overwrite };
}

function run(input: WriteNoteInput, responses: StubResponse[], over: Partial<ExecuteFs> = {}) {
  const fs = fakeFs(over);
  const spawn = makeQueuedSpawn(responses);
  const call = executeWriteNote(
    input,
    deps({ spawnFn: spawn.spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  return { call, fs, ...spawn };
}

async function rejection(call: Promise<unknown>): Promise<UpstreamError> {
  const err = await captureRejection(call);
  expect(err).toBeInstanceOf(UpstreamError);
  return err as UpstreamError;
}

function expectNothingWritten(fs: ReturnType<typeof fakeFs>): void {
  expect(fs.mkdirs).toHaveLength(0);
  expect(fs.writes).toHaveLength(0);
  expect(fs.renames).toHaveLength(0);
}

describe("a name that resolves to a note in a sub-folder", () => {
  test("overwrite=true replaces that note: created false, resolved path, nothing at the root", async () => {
    const { call, fs, recorded } = run(
      byName("Alpha", true),
      [nameLookupResponse("Sub/Alpha.md"), EVAL_OK],
      { stat: async () => ({ size: 3 }) },
    );
    expect(await call).toEqual({ created: false, path: "Sub/Alpha.md", bytes_written: 0 });
    expect(fs.renames).toHaveLength(1);
    expect(fs.renames[0]![1]).toBe(SUB_ALPHA);
    expect(fs.writes.every(([p]) => p.startsWith(join(VAULT_ROOT, "Sub")))).toBe(true);
    expect(recorded).toHaveLength(2);
    // The lookup is an eval routed to the named vault (vault= ahead of the subcommand).
    expect(recorded[0]!.argv.slice(0, 2)).toEqual(["vault=TestVault", "eval"]);
    const lookup = recorded[0]!.argv.find((a) => a.startsWith("code="));
    expect(unwrapEvalCode(lookup!)).toContain("getFirstLinkpathDest(a.file,'')");
    const refresh = recorded[1]!.argv.find((a) => a.startsWith("code="));
    expect(unwrapEvalCode(refresh!)).toContain('getFileByPath("Sub/Alpha.md")');
  });

  test("overwrite=false returns FILE_EXISTS for the resolved note and writes nothing", async () => {
    const attempted: string[] = [];
    const { call, fs } = run(byName("Alpha", false), [nameLookupResponse("Sub/Alpha.md")], {
      writeFile: async (p: string) => {
        attempted.push(p);
        throw Object.assign(new Error("EEXIST"), { code: "EEXIST", syscall: "open" });
      },
    });
    const err = await rejection(call);
    expect(err.code).toBe("FILE_EXISTS");
    expect(err.details).toEqual({ errno: "EEXIST", path: "Sub/Alpha.md", vault: "TestVault" });
    expect(attempted).toEqual([SUB_ALPHA]);
    expect(fs.renames).toHaveLength(0);
  });

  test("a name resolving to a non-note file is rejected before any write", async () => {
    const { call, fs } = run(byName("Plan", true), [nameLookupResponse("Att/Plan.png")]);
    const err = await rejection(call);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", path: "Att/Plan.png" });
    expectNothingWritten(fs);
  });
});

describe("a name no note has falls back to the documented rule", () => {
  test.each([
    ["Beta", "Beta.md"],
    ["Beta.md", "Beta.md"],
    ["Folder/Beta.md", "Folder/Beta.md"],
  ])("file=%j → creates %s, created true", async (file, path) => {
    const { call, fs } = run(byName(file, true), [nameLookupResponse(null), EVAL_OK]);
    expect(await call).toEqual({ created: true, path, bytes_written: 3 });
    expect(fs.renames[0]![1]).toBe(join(VAULT_ROOT, path));
  });

  test("a closed-but-registered vault: the cold-start retry re-runs the lookup in the named vault", async () => {
    const { call, recorded } = run(byName("Alpha", true), [
      coldStartResponse("eval"),
      nameLookupResponse("Sub/Alpha.md"),
      EVAL_OK,
    ]);
    expect((await call).path).toBe("Sub/Alpha.md");
    expect(recorded).toHaveLength(3);
    expect(recorded[1]!.argv).toContain("vault=TestVault");
  });
});

describe("a lookup that did not run in the named vault writes nothing (VAULT_MISMATCH)", () => {
  test.each([
    ["found a note there", "Projects/Alpha.md"],
    ["found no note there", null],
  ])("another vault answered and %s → CLI_REPORTED_ERROR / VAULT_MISMATCH", async (_label, path) => {
    const { call, fs, recorded } = run(byName("Alpha", true), [nameLookupResponse(path, "OtherVault")]);
    const err = await rejection(call);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toEqual({
      code: "VAULT_MISMATCH",
      vault: "TestVault",
      answeredBy: "OtherVault",
      file: "Alpha",
    });
    expect(err.message).toBe(
      'write_note: the lookup of "Alpha" ran in vault "OtherVault", not "TestVault", so nothing was written. Retry, or address the note by path.',
    );
    expectNothingWritten(fs);
    expect(recorded).toHaveLength(1);
  });

  test("with overwrite=false too: no root create", async () => {
    const { call, fs } = run(byName("Alpha", false), [nameLookupResponse(null, "OtherVault")]);
    const err = await rejection(call);
    expect(err.details.code).toBe("VAULT_MISMATCH");
    expectNothingWritten(fs);
  });
});

describe("any other lookup failure propagates and nothing is written", () => {
  test.each([
    ["no answer line", { stdout: "not an answer\n", exitCode: 0 }, "json-parse"],
    ["an answer of the wrong shape", { stdout: '=> {"path":"Sub/Alpha.md"}\n', exitCode: 0 }, "envelope-parse"],
  ])("%s → CLI_REPORTED_ERROR stage %s", async (_label, response, stage) => {
    const { call, fs } = run(byName("Alpha", true), [response]);
    const err = await rejection(call);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe(stage);
    expectNothingWritten(fs);
  });
});

describe("no lookup where none is needed", () => {
  test("an unknown vault fails before the lookup", async () => {
    const fs = fakeFs();
    const { spawnFn, getCount } = makeQueuedSpawn([]);
    const err = await rejection(
      executeWriteNote(
        { target_mode: "specific", vault: "Nope", file: "Alpha", content: "x", overwrite: true },
        deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
      ),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(getCount()).toBe(0);
    expect(fs.mkdirs).toHaveLength(0);
  });

  test("path makes no lookup", async () => {
    const { call, recorded } = run(
      { target_mode: "specific", vault: "TestVault", path: "Sub/Alpha.md", content: "x", overwrite: true },
      [EVAL_OK],
    );
    expect((await call).path).toBe("Sub/Alpha.md");
    expect(recorded).toHaveLength(1);
    expect(unwrapEvalCode(recorded[0]!.argv.find((a) => a.startsWith("code="))!)).not.toContain("getFirstLinkpathDest");
  });

  test("active mode makes no lookup", async () => {
    const { call, recorded } = run(
      { target_mode: "active", content: "x", overwrite: true },
      [focusedFileResponse("Sub/Alpha.md", VAULT_ROOT), EVAL_OK],
    );
    expect((await call).path).toBe("Sub/Alpha.md");
    expect(recorded).toHaveLength(2);
    expect(
      recorded.some((r) => r.argv.some((a) => a.startsWith("code=") && unwrapEvalCode(a).includes("getFirstLinkpathDest"))),
    ).toBe(false);
  });
});
