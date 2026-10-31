// Original — no upstream. patch_block handler tests for spec 075 (unify size reporting): bytes_written is the note's size after the edit minus its size before, positive, zero or negative, counted in bytes, not characters (contract §3 patch_block rows); and the uniform after-minus-before check shared by the five single-note text writers (SC-002). Split from handler.test.ts to keep each file under 1000 lines; shared fixtures live in _handler-fixtures.ts.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchBlock } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { makeQueuedSpawn } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const PARAGRAPH_NOTE = "intro\n\nhello ^foo\n\nclosing\n";
const TABLE_NOTE = "| a | b |\n| - | - |\n| 1 | 2 |\n^baz\ntrailing\n";

async function patch(original: string, blockId: string, content: string) {
  const fs = fakeFs({ content: original });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executePatchBlock(
    { target_mode: "specific", vault: "TestVault", path: "n.md", block_id: blockId, content },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  return { result, written: fs.writes[0]![1] };
}

describe("spec 075 contract §3 — patch_block bytes_written", () => {
  // Expected values come from the fixture's actual bytes before and after the edit (R1).
  test.each([
    ["paragraph grow", 4, PARAGRAPH_NOTE, "foo", "hello big"],
    ["paragraph same-size replace", 0, PARAGRAPH_NOTE, "foo", "world"],
    ["paragraph shrink", -3, PARAGRAPH_NOTE, "foo", "hi"],
    ['paragraph clear ("")', -5, PARAGRAPH_NOTE, "foo", ""],
    ["short paragraph shrink", -3, "body ^foo\n", "foo", "x"],
    ["separately-placed grow", 10, TABLE_NOTE, "baz", "| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |"],
    ["multi-byte: abc → 日本 counts bytes, not characters", 3, "abc ^foo\n", "foo", "日本"],
  ] as const)("%s → %i", async (_label, expected, original, blockId, content) => {
    const { result } = await patch(original, blockId, content);
    expect(result.bytes_written).toBe(expected);
  });

  test("bytes_written equals size after minus size before (075 uniform check)", async () => {
    const { result, written } = await patch(PARAGRAPH_NOTE, "foo", "new body");
    const sizeBefore = Buffer.byteLength(PARAGRAPH_NOTE, "utf8");
    const sizeAfter = Buffer.byteLength(written, "utf8");
    expect(result.bytes_written).toBe(sizeAfter - sizeBefore);
  });
});
