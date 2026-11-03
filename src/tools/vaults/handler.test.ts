// Original — no upstream. Tests for the vaults handler: listing, empty list, duplicate names kept, registry failure propagated (068 FR-036); BI-0132 the command-line-disabled notice fails the listing and recovers in the same session.
import { expect, test, vi } from "vitest";

import { executeVaults } from "./handler.js";
import { CLI_DISABLED_ANSWER } from "../../cli-adapter/_dispatch.js";
import { invokeCli } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { createVaultRegistry } from "../../vault-registry/registry.js";
import { captureRejection, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

import type { SpawnLike } from "../../cli-adapter/_dispatch.js";

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

/** A registry whose probe runs `vaults verbose` through the real invokeCli, as server.ts wires it. */
function registryThroughCli(spawnFn: SpawnLike) {
  const cliDeps = { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
  return createVaultRegistry({
    invokeProbe: async () =>
      (await invokeCli({ command: "vaults", parameters: {}, flags: ["verbose"], target_mode: "specific" }, cliDeps)).stdout,
  });
}

test("BI-0132: with the command line disabled, vaults and a named-vault lookup fail with cli-disabled, then recover in the same session", async () => {
  const notice = { stdout: `${CLI_DISABLED_ANSWER}\n`, exitCode: 0 };
  const { spawnFn } = makeQueuedSpawn([notice, notice, { stdout: "Work\t/w\n", exitCode: 0 }]);
  const vaultRegistry = registryThroughCli(spawnFn);

  const listed = (await captureRejection(executeVaults({}, { vaultRegistry }))) as UpstreamError;
  expect(listed.code).toBe("CLI_REPORTED_ERROR"); // not { count: 0, vaults: [] }
  expect(listed.details.reason).toBe("cli-disabled");

  const lookup = (await captureRejection(vaultRegistry.resolveVaultPath("Work"))) as UpstreamError;
  expect(lookup.code).toBe("CLI_REPORTED_ERROR"); // not VALIDATION_ERROR "is not registered"
  expect(lookup.details.reason).toBe("cli-disabled");

  // The owner turns the setting back on: the next call succeeds without a restart.
  expect(await executeVaults({}, { vaultRegistry })).toEqual({ count: 1, vaults: [{ name: "Work", path: "/w", open: null }] });
});
