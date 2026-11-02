// Original — no upstream. Forces a wrong block index through the real patch_block handler to pin the UNSAFE_PLACEMENT refusal (spec 086 FR-016, contracts/placement-contract.md U2).
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { deps, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchBlock } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { captureRejection, makeQueuedSpawn } from "../_handler-test-fixtures.js";
import { BLOCK_TEMPLATE } from "../_line-ending-fixtures.js";

// research D4: shift the real finder's result one line down, so the handler edits a line the
// finder did not name. Confined to this file.
vi.mock("./block-scan.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("./block-scan.js")>();
  return {
    ...m,
    findBlock: (c: string, id: string) => {
      const r = m.findBlock(c, id);
      return (
        r && {
          ...r,
          markerLineIndex: r.markerLineIndex + 1,
          blockStartLineIndex: r.blockStartLineIndex + 1,
          blockEndLineIndex: r.blockEndLineIndex + 1,
        }
      );
    },
  };
});

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

it("U2: a block index that does not match the found block is refused with UNSAFE_PLACEMENT and nothing is written", async () => {
  const fs = fakeFs({ content: BLOCK_TEMPLATE });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await captureRejection(
    executePatchBlock(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        block_id: "para",
        content: "New",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ),
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
  expect((err as UpstreamError).details).toEqual({
    code: "UNSAFE_PLACEMENT",
    block_id: "para",
    path: "n.md",
  });
  expect(fs.writes).toHaveLength(0);
  expect(fs.renames).toHaveLength(0);
});
