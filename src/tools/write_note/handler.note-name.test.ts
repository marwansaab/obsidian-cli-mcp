// Original — no upstream. write_note handler tests for BI-0176: a specific-mode `file` name is resolved like a wikilink by the same `obsidian file` lookup read, patch_heading and patch_block use (resolveFileByTsv), so an existing note is written wherever it is. Only Obsidian's `Error: File "<name>" not found.` falls back to the vault-root short-form rule; any other lookup failure propagates with nothing written. `path` and active mode make no lookup.
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executeWriteNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import {
  captureRejection,
  coldStartResponse,
  fileNotFoundResponse,
  fileTsvResponse,
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
      [fileTsvResponse("Sub/Alpha.md"), EVAL_OK],
      { stat: async () => ({ size: 3 }) },
    );
    expect(await call).toEqual({ created: false, path: "Sub/Alpha.md", bytes_written: 0 });
    expect(fs.renames).toHaveLength(1);
    expect(fs.renames[0]![1]).toBe(SUB_ALPHA);
    expect(fs.writes.every(([p]) => p.startsWith(join(VAULT_ROOT, "Sub")))).toBe(true);
    expect(recorded).toHaveLength(2);
    // The lookup is the sibling editors' `obsidian file file=<name>` call in the named vault.
    expect(recorded[0]!.argv).toContain("file");
    expect(recorded[0]!.argv).toContain("vault=TestVault");
    expect(recorded[0]!.argv).toContain("file=Alpha");
    const refresh = recorded[1]!.argv.find((a) => a.startsWith("code="));
    expect(unwrapEvalCode(refresh!)).toContain('getFileByPath("Sub/Alpha.md")');
  });

  test("overwrite=false returns FILE_EXISTS for the resolved note and writes nothing", async () => {
    const attempted: string[] = [];
    const { call, fs } = run(byName("Alpha", false), [fileTsvResponse("Sub/Alpha.md")], {
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

  test("a name at the vault root resolves to the root note, as before (boundary)", async () => {
    const { call, fs } = run(byName("Alpha", true), [fileTsvResponse("Alpha.md"), EVAL_OK]);
    expect(await call).toEqual({ created: true, path: "Alpha.md", bytes_written: 3 });
    expect(fs.renames[0]![1]).toBe(join(VAULT_ROOT, "Alpha.md"));
  });

  test("a name resolving to a non-note file is rejected before any write", async () => {
    const { call, fs } = run(byName("Plan", true), [fileTsvResponse("Att/Plan.png")]);
    const err = await rejection(call);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", path: "Att/Plan.png" });
    expectNothingWritten(fs);
  });

  test("a folder-qualified name that exists resolves to that note", async () => {
    const { call } = run(byName("Folder/Note", true), [fileTsvResponse("Folder/Note.md"), EVAL_OK]);
    expect((await call).path).toBe("Folder/Note.md");
  });

  test("a closed-but-registered vault: the cold-start retry re-runs the lookup", async () => {
    const { call, recorded } = run(byName("Alpha", true), [
      coldStartResponse("file"),
      fileTsvResponse("Sub/Alpha.md"),
      EVAL_OK,
    ]);
    expect((await call).path).toBe("Sub/Alpha.md");
    expect(recorded).toHaveLength(3);
    expect(recorded[1]!.argv).toContain("file=Alpha");
  });
});

describe("a name no note has falls back to the documented rule", () => {
  test.each([
    ["Beta", "Beta.md"],
    ["Beta.md", "Beta.md"],
    ["version_1.2.3", "version_1.2.3.md"],
    ["Folder/Beta.md", "Folder/Beta.md"],
  ])("file=%j → creates %s, created true", async (file, path) => {
    const { call, fs } = run(byName(file, true), [fileNotFoundResponse(file), EVAL_OK]);
    expect(await call).toEqual({ created: true, path, bytes_written: 3 });
    expect(fs.renames[0]![1]).toBe(join(VAULT_ROOT, path));
  });

  test("overwrite=false creates the root note with the wx flag", async () => {
    const { call, fs } = run(byName("Beta", false), [fileNotFoundResponse("Beta"), EVAL_OK]);
    expect(await call).toEqual({ created: true, path: "Beta.md", bytes_written: 3 });
    expect(fs.writes).toHaveLength(1);
    expect(fs.writes[0]![0]).toBe(join(VAULT_ROOT, "Beta.md"));
  });
});

describe("any other lookup failure propagates and nothing is written", () => {
  test("an answer without a path line → CLI_REPORTED_ERROR stage file-tsv-parse", async () => {
    const { call, fs } = run(byName("Alpha", true), [{ stdout: "name\tAlpha\n", exitCode: 0 }]);
    const err = await rejection(call);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("file-tsv-parse");
    expectNothingWritten(fs);
  });

  test("an Error: line other than not-found → CLI_REPORTED_ERROR passed through", async () => {
    const { call, fs } = run(byName("Alpha", true), [{ stdout: "Error: Something else failed.\n", exitCode: 0 }]);
    const err = await rejection(call);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe("Error: Something else failed.");
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
    expect(recorded[0]!.argv.some((a) => a.startsWith("file="))).toBe(false);
  });

  test("active mode makes no lookup", async () => {
    const { call, recorded } = run(
      { target_mode: "active", content: "x", overwrite: true },
      [focusedFileResponse("Sub/Alpha.md", VAULT_ROOT), EVAL_OK],
    );
    expect((await call).path).toBe("Sub/Alpha.md");
    expect(recorded).toHaveLength(2);
    expect(recorded.some((r) => r.argv.some((a) => a.startsWith("file=")))).toBe(false);
  });
});
