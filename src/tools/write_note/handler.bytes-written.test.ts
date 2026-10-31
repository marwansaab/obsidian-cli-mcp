// Original — no upstream. write_note handler tests for spec 075 (unify size reporting): bytes_written is the note's size after the write minus its size before (a new note counts as 0), across create (overwrite false and true), overwrite (grow, same size, shrink), multi-byte content and active mode; a pre-write stat failure other than ENOENT fails with FS_WRITE_FAILED before anything is written (FR-006a); and the uniform after-minus-before check shared by the five single-note text writers. Split from handler.test.ts to keep each file under 1000 lines; shared fixtures live in _handler-fixtures.ts.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executeWriteNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { focusedFileResponse, makeQueuedSpawn } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const registry = () => fakeRegistry({ TestVault: VAULT_ROOT });
const existing = (size: number) => fakeFs({ stat: async () => ({ size }) });

describe("spec 075 contract §3 — write_note bytes_written", () => {
  test.each([
    ["hello", false, 5],
    ["hello", true, 5],
    ["", false, 0],
    ["é", false, 2],
  ] as const)(
    "create %j (overwrite: %s) on an absent path → %i",
    async (content, overwrite, expected) => {
      const fs = fakeFs();
      const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
      const result = await executeWriteNote(
        { target_mode: "specific", vault: "TestVault", path: "n.md", content, overwrite },
        deps({ spawnFn, vaultRegistry: registry(), fs }),
      );
      expect(result).toEqual({ created: true, path: "n.md", bytes_written: expected });
    },
  );

  test.each([
    [55, 15],
    [40, 0],
    [10, -30],
  ])("overwrite a 40-byte note with %i bytes → %i", async (newSize, expected) => {
    const fs = existing(40);
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeWriteNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "x".repeat(newSize),
        overwrite: true,
      },
      deps({ spawnFn, vaultRegistry: registry(), fs }),
    );
    expect(result).toEqual({ created: false, path: "n.md", bytes_written: expected });
  });

  test("active mode overwrite reports the size change", async () => {
    const fs = existing(40);
    const { spawnFn } = makeQueuedSpawn([
      focusedFileResponse("Daily/today.md", VAULT_ROOT),
      EVAL_OK,
    ]);
    const result = await executeWriteNote(
      { target_mode: "active", content: "x".repeat(10), overwrite: true },
      deps({ spawnFn, vaultRegistry: fakeRegistry({}), fs }),
    );
    expect(result).toEqual({ created: false, path: "Daily/today.md", bytes_written: -30 });
  });

  test("stat fails with EACCES before an overwrite → FS_WRITE_FAILED, nothing written (FR-006a)", async () => {
    const eacces = Object.assign(new Error("EACCES: permission denied"), {
      code: "EACCES",
      syscall: "stat",
      path: "/test-vault/n.md",
    });
    const fs = fakeFs({
      stat: async () => {
        throw eacces;
      },
    });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = (await executeWriteNote(
      { target_mode: "specific", vault: "TestVault", path: "n.md", content: "x", overwrite: true },
      deps({ spawnFn, vaultRegistry: registry(), fs }),
    ).catch((e) => e)) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("FS_WRITE_FAILED");
    expect(err.details).toEqual({ errno: "EACCES", syscall: "stat", path: "/test-vault/n.md" });
    expect(err.cause).toBe(eacces);
    expect(fs.writes).toHaveLength(0);
    expect(fs.renames).toHaveLength(0);
  });

  test("bytes_written equals size after minus size before (075 uniform check)", async () => {
    const before = "# Old\n\nold body\n";
    const fs = fakeFs({ stat: async () => ({ size: Buffer.byteLength(before, "utf8") }) });
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeWriteNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        content: "# New\n",
        overwrite: true,
      },
      deps({ spawnFn, vaultRegistry: registry(), fs }),
    );
    const sizeBefore = Buffer.byteLength(before, "utf8");
    const sizeAfter = Buffer.byteLength(fs.writes[0]![1], "utf8");
    expect(result.bytes_written).toBe(sizeAfter - sizeBefore);
  });
});
