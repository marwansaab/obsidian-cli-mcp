// Original — no upstream. patch_heading handler tests for spec 075 (unify size reporting): bytes_written is the note's size after the edit minus its size before, positive, zero or negative, counted in bytes, not characters, across append, prepend and replace (contract §3 patch_heading rows); and the uniform after-minus-before check shared by the five single-note text writers (SC-002). Split from handler.test.ts to keep each file under 1000 lines; shared fixtures live in _handler-fixtures.ts.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  deps,
  EVAL_OK,
  fakeFs,
  fakeRegistry,
  SAMPLE_NOTE,
  VAULT_ROOT,
} from "./_handler-fixtures.js";
import { executePatchHeading } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { makeQueuedSpawn } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const SMALL_NOTE = "# Top\n## A\nbody\n## B\n";

async function patch(
  original: string,
  headingPath: string,
  mode: "append" | "prepend" | "replace",
  content: string,
) {
  const fs = fakeFs({ content: original });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executePatchHeading(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      heading_path: headingPath,
      mode,
      content,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  return { result, written: fs.writes[0]![1] };
}

describe("spec 075 contract §3 — patch_heading bytes_written", () => {
  // Expected values come from the fixture's actual bytes before and after the edit (R1).
  test.each([
    ["append", 6, SMALL_NOTE, "Top#A", "append", "added\n"],
    ["append into a nested section", 2, SAMPLE_NOTE, "Daily#Tasks#TODO", "append", "x\n"],
    ["prepend", 5, SMALL_NOTE, "Top#A", "prepend", "lead\n"],
    ["replace with same-size content", 0, SMALL_NOTE, "Top#A", "replace", "xyzw\n"],
    ["replace with shorter content", -2, SMALL_NOTE, "Top#A", "replace", "ab\n"],
    ['replace with "" (clear the body)', -5, SMALL_NOTE, "Top#A", "replace", ""],
    [
      "multi-byte: x → é counts bytes, not characters",
      1,
      "# Top\n## A\nx\n## B\n",
      "Top#A",
      "replace",
      "é\n",
    ],
  ] as const)("%s → %i", async (_label, expected, original, headingPath, mode, content) => {
    const { result } = await patch(original, headingPath, mode, content);
    expect(result.bytes_written).toBe(expected);
  });

  test("bytes_written equals size after minus size before (075 uniform check)", async () => {
    const { result, written } = await patch(SMALL_NOTE, "Top#A", "replace", "new body\n");
    const sizeBefore = Buffer.byteLength(SMALL_NOTE, "utf8");
    const sizeAfter = Buffer.byteLength(written, "utf8");
    expect(result.bytes_written).toBe(sizeAfter - sizeBefore);
  });
});
