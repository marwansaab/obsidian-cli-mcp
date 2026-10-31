// Original — no upstream. write_note handler tests for spec 070 (file-type support): every non-note target — a non-`.md` path, a `file` naming another core type, a focused canvas — is rejected as VALIDATION_ERROR + UNSUPPORTED_FILE_TYPE before any filesystem write, and every accepted input writes a `.md` path (US4 invariant). Split from handler.test.ts to keep each file under 1000 lines; shared fixtures live in _handler-fixtures.ts.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executeWriteNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { focusedFileResponse, makeQueuedSpawn } from "../_handler-test-fixtures.js";

import type { WriteNoteInput } from "./schema.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const registry = () => fakeRegistry({ TestVault: VAULT_ROOT });

describe("spec 070 — non-note targets are rejected before any write", () => {
  test.each([
    ["Boards/X.canvas", "canvas"],
    ["Att/I.png", "png"],
    ["Folder/Note", ""],
    ["Folder/todo.txt", "txt"],
  ])(
    "path=%s → UNSUPPORTED_FILE_TYPE / unsupported-type, nothing written",
    async (path, extension) => {
      const fs = fakeFs();
      const { spawnFn, recorded } = makeQueuedSpawn([]);
      const err = (await executeWriteNote(
        { target_mode: "specific", vault: "TestVault", path, content: "x", overwrite: true },
        deps({ spawnFn, vaultRegistry: registry(), fs }),
      ).catch((e) => e)) as UpstreamError;
      expect(err).toBeInstanceOf(UpstreamError);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details).toEqual({
        code: "UNSUPPORTED_FILE_TYPE",
        reason: "unsupported-type",
        path,
        extension,
        supported: ["note"],
      });
      expect(fs.writes).toHaveLength(0);
      expect(fs.mkdirs).toHaveLength(0);
      expect(recorded).toHaveLength(0);
    },
  );

  test("file='Plan.canvas' → rejected; no Plan.canvas.md is created", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([]);
    const err = (await executeWriteNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "Plan.canvas",
        content: "x",
        overwrite: false,
      },
      deps({ spawnFn, vaultRegistry: registry(), fs }),
    ).catch((e) => e)) as UpstreamError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
      path: "Plan.canvas",
      extension: "canvas",
    });
    expect(fs.writes).toHaveLength(0);
  });

  test("active mode with a focused canvas → rejected, nothing written", async () => {
    const fs = fakeFs();
    const { spawnFn, recorded } = makeQueuedSpawn([
      focusedFileResponse("Boards/Plan.canvas", VAULT_ROOT),
    ]);
    const err = (await executeWriteNote(
      { target_mode: "active", content: "x", overwrite: true },
      deps({ spawnFn, vaultRegistry: registry(), fs }),
    ).catch((e) => e)) as UpstreamError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
      path: "Boards/Plan.canvas",
    });
    expect(fs.writes).toHaveLength(0);
    expect(recorded).toHaveLength(1);
  });
});

describe("spec 070 — notes are still written as before", () => {
  test("file='version_1.2.3' → writes version_1.2.3.md (unrecognised segment stays in the stem)", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeWriteNote(
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "version_1.2.3",
        content: "x",
        overwrite: false,
      },
      deps({ spawnFn, vaultRegistry: registry(), fs }),
    );
    expect(result.path).toBe("version_1.2.3.md");
    expect(fs.writes).toHaveLength(1);
  });
});

// US4 invariant for the one in-scope tool that creates files: every success is a `.md` path,
// every non-note input is rejected.
describe("spec 070 invariant — write_note only ever writes notes", () => {
  const ACCEPTED: Array<[WriteNoteInput, string]> = [
    [
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "A/n.md",
        content: "x",
        overwrite: true,
      },
      "A/n.md",
    ],
    [
      { target_mode: "specific", vault: "TestVault", file: "n", content: "x", overwrite: true },
      "n.md",
    ],
    [
      { target_mode: "specific", vault: "TestVault", file: "n.md", content: "x", overwrite: true },
      "n.md",
    ],
    [
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "version_1.2.3",
        content: "x",
        overwrite: true,
      },
      "version_1.2.3.md",
    ],
  ];

  test.each(ACCEPTED)("accepted %j → .md path", async (input, path) => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
    const result = await executeWriteNote(input, deps({ spawnFn, vaultRegistry: registry(), fs }));
    expect(result.path).toBe(path);
    expect(result.path.endsWith(".md")).toBe(true);
  });

  test("accepted active focused note → .md path", async () => {
    const fs = fakeFs();
    const { spawnFn } = makeQueuedSpawn([focusedFileResponse("Daily/t.md", VAULT_ROOT), EVAL_OK]);
    const result = await executeWriteNote(
      { target_mode: "active", content: "x", overwrite: true },
      deps({ spawnFn, vaultRegistry: registry(), fs }),
    );
    expect(result.path).toBe("Daily/t.md");
  });

  test.each(["X.canvas", "X.base", "X.png", "X.pdf"])(
    "file=%j (another core type) → rejected",
    async (file) => {
      const fs = fakeFs();
      const { spawnFn } = makeQueuedSpawn([]);
      const err = (await executeWriteNote(
        { target_mode: "specific", vault: "TestVault", file, content: "x", overwrite: true },
        deps({ spawnFn, vaultRegistry: registry(), fs }),
      ).catch((e) => e)) as UpstreamError;
      expect(err.details).toMatchObject({
        code: "UNSUPPORTED_FILE_TYPE",
        reason: "unsupported-type",
      });
      expect(fs.writes).toHaveLength(0);
    },
  );
});
