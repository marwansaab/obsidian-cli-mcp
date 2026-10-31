// Original — no upstream. append_note handler tests for spec 070 (file-type support): a canvas, base or attachment target — given by `path`, resolved from `file`, or focused in active mode — is rejected as VALIDATION_ERROR + UNSUPPORTED_FILE_TYPE before the note is read or written; a Markdown target still appends. Split from handler.test.ts to keep each file under 1000 lines.
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { executeAppendNote, type ExecuteFs } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  fileTsvResponse,
  focusedFileResponse,
  makeQueuedSpawn,
  silentLogger,
  stubVaultRegistry,
  type StubResponse,
} from "../_handler-test-fixtures.js";

import type { AppendNoteInput } from "./schema.js";
import type { SpawnLike } from "../../cli-adapter/_dispatch.js";

const VAULT_ROOT = resolve("/test-vault");

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

function trackingFs(): ExecuteFs & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    readFile: async (p) => {
      calls.push(`read ${p}`);
      return "abc\n";
    },
    writeFile: async (p) => {
      calls.push(`write ${p}`);
    },
    rename: async (from) => {
      calls.push(`rename ${from}`);
    },
    realpath: async (p) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    unlink: async () => {},
  };
}

function deps(spawnFn: SpawnLike, fs: ExecuteFs) {
  return {
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubVaultRegistry("TestVault", VAULT_ROOT),
    spawnFn,
    env: {},
    fs,
  };
}

const CASES: Array<[label: string, input: AppendNoteInput, spawns: StubResponse[], path: string]> =
  [
    [
      "path to a canvas",
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Boards/Plan.canvas",
        content: "x",
        inline: false,
      },
      [],
      "Boards/Plan.canvas",
    ],
    [
      "file resolving to a canvas",
      {
        target_mode: "specific",
        vault: "TestVault",
        file: "Plan.canvas",
        content: "x",
        inline: false,
      },
      [fileTsvResponse("Boards/Plan.canvas")],
      "Boards/Plan.canvas",
    ],
    [
      "active with a focused base",
      { target_mode: "active", content: "x", inline: false },
      [focusedFileResponse("Views/Tasks.base", VAULT_ROOT)],
      "Views/Tasks.base",
    ],
  ];

describe("spec 070 — append_note rejects non-note targets before reading or writing", () => {
  test.each(CASES)(
    "%s → UNSUPPORTED_FILE_TYPE / unsupported-type, no read, no write",
    async (_label, input, spawns, path) => {
      const fs = trackingFs();
      const { spawnFn } = makeQueuedSpawn(spawns);
      const err = (await executeAppendNote(input, deps(spawnFn, fs)).catch(
        (e) => e,
      )) as UpstreamError;
      expect(err).toBeInstanceOf(UpstreamError);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details).toMatchObject({
        code: "UNSUPPORTED_FILE_TYPE",
        reason: "unsupported-type",
        path,
        supported: ["note"],
      });
      expect(fs.calls).toEqual([]);
    },
  );

  test("a Markdown target still appends", async () => {
    const fs = trackingFs();
    const { spawnFn } = makeQueuedSpawn([{ stdout: "=> undefined\n", exitCode: 0 }]);
    const result = await executeAppendNote(
      { target_mode: "specific", vault: "TestVault", path: "n.md", content: "def", inline: false },
      deps(spawnFn, fs),
    );
    expect(result.path).toBe("n.md");
    expect(fs.calls.some((c) => c.startsWith("write "))).toBe(true);
  });
});
