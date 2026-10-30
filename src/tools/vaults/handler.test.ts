// Original — no upstream. Tests for the vaults handler: listing, empty list, duplicate names kept, registry failure propagated (068 FR-036).
import { expect, test, vi } from "vitest";

import { executeVaults } from "./handler.js";
import { UpstreamError } from "../../errors.js";
import { createVaultRegistry } from "../../vault-registry/registry.js";

function registryOver(stdout: string) {
  const invokeProbe = vi.fn().mockResolvedValue(stdout);
  return { invokeProbe, vaultRegistry: createVaultRegistry({ invokeProbe }) };
}

test("lists every vault with open: null, in CLI order", async () => {
  const { vaultRegistry } = registryOver("Work\tC:\\Vaults\\Work\nHome\t/home/me/Home\n");
  expect(await executeVaults({}, { vaultRegistry })).toEqual({
    count: 2,
    vaults: [
      { name: "Work", path: "C:\\Vaults\\Work", open: null },
      { name: "Home", path: "/home/me/Home", open: null },
    ],
  });
});

test("an empty CLI listing returns count 0 and an empty list", async () => {
  const { vaultRegistry } = registryOver("");
  expect(await executeVaults({}, { vaultRegistry })).toEqual({ count: 0, vaults: [] });
});

test("vaults sharing a name are both listed with their own paths", async () => {
  const { vaultRegistry } = registryOver("Notes\t/a/Notes\nNotes\t/b/Notes\n");
  const result = await executeVaults({}, { vaultRegistry });
  expect(result.count).toBe(2);
  expect(result.vaults.map((v) => v.path)).toEqual(["/a/Notes", "/b/Notes"]);
});

test("every call re-reads the CLI listing", async () => {
  const { invokeProbe, vaultRegistry } = registryOver("Work\t/w\n");
  await executeVaults({}, { vaultRegistry });
  await executeVaults({}, { vaultRegistry });
  expect(invokeProbe).toHaveBeenCalledTimes(2);
});

test("a CLI failure propagates as the UpstreamError, not an empty list", async () => {
  const failure = new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: {}, message: "app down" });
  const vaultRegistry = createVaultRegistry({ invokeProbe: vi.fn().mockRejectedValue(failure) });
  await expect(executeVaults({}, { vaultRegistry })).rejects.toBe(failure);
});
