// Original — no upstream. Tests for the vaults handler: listing, empty list, duplicate names kept, registry failure propagated (068 FR-036); BI-0132 a cli-disabled probe failure fails the listing and lookup, and recovers in the same session.
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

// BI-0132: the probe rejects as invokeCli does on the disabled-CLI notice (that classification is
// pinned in cli-adapter.test.ts). The same error object must reach the caller, not [] or VALIDATION_ERROR.
test("BI-0132: with the command line disabled, vaults and a named-vault lookup fail with cli-disabled, then recover in the same session", async () => {
  const failure = new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { reason: "cli-disabled" } });
  const invokeProbe = vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce(failure).mockResolvedValue("Work\t/w\n");
  const vaultRegistry = createVaultRegistry({ invokeProbe });

  await expect(executeVaults({}, { vaultRegistry })).rejects.toBe(failure); // not { count: 0, vaults: [] }
  await expect(vaultRegistry.resolveVaultPath("Work")).rejects.toBe(failure); // not "is not registered"

  // The owner turns the setting back on: the next call succeeds without a restart.
  expect(await executeVaults({}, { vaultRegistry })).toEqual({ count: 1, vaults: [{ name: "Work", path: "/w", open: null }] });
});
