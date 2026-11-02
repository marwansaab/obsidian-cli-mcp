// Original — no upstream. Forces a wrong heading index through the real patch_heading handler to pin the UNSAFE_PLACEMENT refusal (spec 086 FR-009/FR-010, contracts/placement-contract.md U1).
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { deps, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchHeading } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { captureRejection, makeQueuedSpawn } from "../_handler-test-fixtures.js";
import { HEADING_TEMPLATE } from "../_line-ending-fixtures.js";

// research D4: shift the real walker's result one line down, so the handler edits a line the
// walker did not name. parseHeadingPath and resolveHeadingIdentity stay real. Confined to this file.
vi.mock("./heading-walk.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("./heading-walk.js")>();
  return {
    ...m,
    walkHeadings: (c: string, s: string[]) => {
      const r = m.walkHeadings(c, s);
      return (
        r && {
          ...r,
          markerLineIndex: r.markerLineIndex + 1,
          reachStartLineIndex: r.reachStartLineIndex + 1,
        }
      );
    },
  };
});

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

it("U1: a heading index that does not match the resolved heading is refused with UNSAFE_PLACEMENT and nothing is written", async () => {
  const fs = fakeFs({ content: HEADING_TEMPLATE });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await captureRejection(
    executePatchHeading(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "n.md",
        heading_path: "Top#Last",
        mode: "replace",
        content: "new",
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ),
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
  expect((err as UpstreamError).details).toEqual({
    code: "UNSAFE_PLACEMENT",
    heading_path: "Top#Last",
    path: "n.md",
  });
  // One read: the race re-read did not run.
  expect(fs.reads).toHaveLength(1);
  expect(fs.writes).toHaveLength(0);
  expect(fs.renames).toHaveLength(0);
});
