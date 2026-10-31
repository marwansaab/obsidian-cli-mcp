// Original — no upstream. prepend handler tests for spec 070 (file-type support): a canvas, base or attachment target — given by `path`, resolved from `file`, or focused in active mode — is rejected as VALIDATION_ERROR + UNSUPPORTED_FILE_TYPE before the stat and the `prepend` CLI call. Split from handler.test.ts to keep each file under 1000 lines; shared fixtures live in _handler-fixtures.ts.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, fakeFs, fakeRegistry, PREPEND_OK, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePrepend } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import {
  fileTsvResponse,
  focusedFileResponse,
  makeQueuedSpawn,
  type StubResponse,
} from "../_handler-test-fixtures.js";

import type { PrependInput } from "./schema.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const CASES: Array<[label: string, input: PrependInput, spawns: StubResponse[], path: string]> = [
  [
    "path to an image",
    { target_mode: "specific", vault: "TestVault", path: "Att/I.png", content: "x", inline: false },
    [],
    "Att/I.png",
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

describe("spec 070 — prepend rejects non-note targets before the stat and the prepend call", () => {
  test.each(CASES)(
    "%s → UNSUPPORTED_FILE_TYPE / unsupported-type, no prepend spawn",
    async (_label, input, spawns, path) => {
      const fs = fakeFs();
      const { spawnFn, recorded } = makeQueuedSpawn(spawns);
      const err = (await executePrepend(
        input,
        deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
      ).catch((e) => e)) as UpstreamError;
      expect(err).toBeInstanceOf(UpstreamError);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details).toMatchObject({
        code: "UNSUPPORTED_FILE_TYPE",
        reason: "unsupported-type",
        path,
        supported: ["note"],
      });
      expect(fs.statCalls).toEqual([]);
      expect(recorded.some((r) => r.argv.includes("prepend"))).toBe(false);
    },
  );

  test("a Markdown target still prepends", async () => {
    const fs = fakeFs({ sizes: [3, 5] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK]);
    const result = await executePrepend(
      { target_mode: "specific", vault: "TestVault", path: "n.md", content: "x", inline: false },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.bytes_written).toBe(2);
    expect(recorded[0]!.argv).toContain("prepend");
  });
});
