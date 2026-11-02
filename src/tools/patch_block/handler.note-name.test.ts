// Original — no upstream. patch_block note-name locator tests (spec 089, BI-0171): a `file` name resolves through the shared `obsidian file` lookup before any fs access (rows N1–N9 of contracts/note-name-contract.md).
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchBlock } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import {
  fileTsvResponse,
  makeQueuedSpawn,
  unwrapEvalCode,
  type StubResponse,
} from "../_handler-test-fixtures.js";

import type { FakeFsHandle } from "./_handler-fixtures.js";
import type { PatchBlockInput } from "./schema.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const NOTE = "intro\n\nA simple paragraph. ^foo\n\nclosing\n";

function input(locator: { file: string } | { path: string }, vault = "TestVault"): PatchBlockInput {
  return { target_mode: "specific", vault, ...locator, block_id: "foo", content: "Replaced text." };
}

function run(
  locator: { file: string } | { path: string },
  responses: StubResponse[],
  fs: FakeFsHandle,
  vault?: string,
) {
  const spawn = makeQueuedSpawn(responses);
  const call = executePatchBlock(
    input(locator, vault),
    deps({ spawnFn: spawn.spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  return { call, ...spawn };
}

async function rejection(call: Promise<unknown>): Promise<UpstreamError> {
  const err = await call.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  return err as UpstreamError;
}

describe("N1 — a bare name edits the note it resolves to in a sub-folder", () => {
  test("reads and writes the resolved path and reports it", async () => {
    const fs = fakeFs({ content: NOTE });
    const { call, recorded } = run(
      { file: "Meeting Notes" },
      [fileTsvResponse("Projects/Deep/Meeting Notes.md"), EVAL_OK],
      fs,
    );
    const result = await call;
    const abs = join(VAULT_ROOT, "Projects/Deep/Meeting Notes.md");
    expect(fs.reads[0]).toBe(abs);
    expect(fs.renames[0]![1]).toBe(abs);
    expect(result.path).toBe("Projects/Deep/Meeting Notes.md");
    expect(fs.writes[0]![1]).toContain("Replaced text. ^foo");
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
    const fs = fakeFs(
      {},
      {
        readFile: async () => {
          spawnsAtFirstRead ??= getCount();
          return NOTE;
        },
      },
    );
    await executePatchBlock(
      input({ file: "Meeting Notes" }),
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(spawnsAtFirstRead).toBe(1);
    const codeArg = recorded[1]!.argv.find((a) => a.startsWith("code="));
    expect(codeArg).toBeDefined();
    const code = unwrapEvalCode(codeArg!);
    expect(code).toContain("Projects/Deep/Meeting Notes.md");
    expect(code).not.toContain('getFileByPath("Meeting Notes")');
  });
});

describe("N3 — the locator is sent to the lookup as given", () => {
  test.each([["Projects/Meeting Notes.md"], ["Projects/Meeting Notes"]])(
    "file: %s",
    async (file) => {
      const fs = fakeFs({ content: NOTE });
      const { call, recorded } = run(
        { file },
        [fileTsvResponse("Projects/Meeting Notes.md"), EVAL_OK],
        fs,
      );
      const result = await call;
      expect(recorded[0]!.argv).toContain(`file=${file}`);
      expect(result.path).toBe("Projects/Meeting Notes.md");
    },
  );
});

describe("N4 — a name that matches no note fails like read, before any fs access", () => {
  test("passes Obsidian's not-found line through as CLI_REPORTED_ERROR, not NOTE_NOT_FOUND", async () => {
    const fs = fakeFs({ content: NOTE });
    const { call, recorded } = run(
      { file: "Missing" },
      [{ stdout: 'Error: File "Missing" not found.\n', exitCode: 0 }],
      fs,
    );
    const err = await rejection(call);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.code).not.toBe("FS_WRITE_FAILED");
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
    const fs = fakeFs({ content: NOTE });
    const { call } = run(
      { file: "Meeting Notes" },
      [{ stdout: "not a TSV line\n", exitCode: 0 }],
      fs,
    );
    const err = await rejection(call);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("file-tsv-parse");
    expect(fs.reads).toEqual([]);
  });
});

describe("N6 — an unknown vault fails before the lookup", () => {
  test("registry error, no spawn, no fs read", async () => {
    const fs = fakeFs({ content: NOTE });
    const { call, recorded } = run({ file: "Meeting Notes" }, [], fs, "Nope");
    const err = await rejection(call);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(recorded.length).toBe(0);
    expect(fs.reads).toEqual([]);
  });
});

describe("N7 — a block missing from the resolved note names the resolved path", () => {
  test("BLOCK_NOT_FOUND with details.path, no write", async () => {
    const fs = fakeFs({ content: "no markers here\n" });
    const { call } = run({ file: "x" }, [fileTsvResponse("Projects/x.md")], fs);
    const err = await rejection(call);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.code).toBe("BLOCK_NOT_FOUND");
    expect(err.details.path).toBe("Projects/x.md");
    expect(fs.writes).toEqual([]);
  });
});

describe("N8 — a path makes no lookup", () => {
  test("one spawn (the refresh), no file= argv", async () => {
    const fs = fakeFs({ content: NOTE });
    const { call, recorded } = run({ path: "n.md" }, [EVAL_OK], fs);
    const result = await call;
    expect(recorded.length).toBe(1);
    expect(recorded[0]!.argv.some((a) => a.startsWith("file="))).toBe(false);
    expect(result.path).toBe("n.md");
  });
});

describe("N9 — a bare name of a note at the vault root edits that note", () => {
  test("reads and writes Daily.md, not Daily", async () => {
    const fs = fakeFs({ content: NOTE });
    const { call } = run({ file: "Daily" }, [fileTsvResponse("Daily.md"), EVAL_OK], fs);
    const result = await call;
    const abs = join(VAULT_ROOT, "Daily.md");
    expect(fs.reads[0]).toBe(abs);
    expect(fs.renames[0]![1]).toBe(abs);
    expect(result.path).toBe("Daily.md");
  });
});
