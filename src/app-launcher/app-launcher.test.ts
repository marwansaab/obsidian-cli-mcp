// Original — no upstream. Co-located tests for launchObsidian — per-platform opener + argv,
// vault URL-encoding, vault-less fallback, detached/unref fire-and-forget, opener-ENOENT rejection
// (BI-060 US1 / contract §2). All platform behaviour is exercised through an injected `platform` +
// `spawnFn` seam — no real process is ever spawned.
import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { launchObsidian, type SpawnLike } from "./app-launcher.js";

interface SpawnRec {
  command: string;
  args: string[];
  options: Record<string, unknown>;
}

/**
 * Stub spawn that records the invocation and emits either `spawn` (success) or `error` (failure),
 * mirroring real `node:child_process` semantics (success → `spawn`; missing binary → `error` with
 * no `spawn`). `throwSync` simulates a synchronous spawn throw.
 */
function makeStubSpawn(
  opts: { errno?: NodeJS.ErrnoException["code"]; throwSync?: NodeJS.ErrnoException } = {},
): { spawnFn: SpawnLike; recorded: SpawnRec[]; unrefCount: () => number } {
  const recorded: SpawnRec[] = [];
  let unrefCalls = 0;
  const spawnFn: SpawnLike = (command, args, options) => {
    if (opts.throwSync) throw opts.throwSync;
    recorded.push({ command, args: [...args], options: options as unknown as Record<string, unknown> });
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {
      unrefCalls += 1;
    };
    setImmediate(() => {
      if (opts.errno) {
        const e = new Error(`spawn ${opts.errno}`) as NodeJS.ErrnoException;
        e.code = opts.errno;
        child.emit("error", e);
      } else {
        child.emit("spawn");
      }
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded, unrefCount: () => unrefCalls };
}

describe("launchObsidian — per-platform opener + argv", () => {
  it("win32 → cmd /c start \"\" <uri>", async () => {
    const { spawnFn, recorded } = makeStubSpawn();
    await launchObsidian({ vault: "V" }, { platform: "win32", spawnFn });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.command).toBe("cmd");
    expect(recorded[0]!.args).toEqual(["/c", "start", "", "obsidian://open?vault=V"]);
  });

  it("darwin → open <uri>", async () => {
    const { spawnFn, recorded } = makeStubSpawn();
    await launchObsidian({ vault: "V" }, { platform: "darwin", spawnFn });
    expect(recorded[0]!.command).toBe("open");
    expect(recorded[0]!.args).toEqual(["obsidian://open?vault=V"]);
  });

  it("linux → xdg-open <uri>", async () => {
    const { spawnFn, recorded } = makeStubSpawn();
    await launchObsidian({ vault: "V" }, { platform: "linux", spawnFn });
    expect(recorded[0]!.command).toBe("xdg-open");
    expect(recorded[0]!.args).toEqual(["obsidian://open?vault=V"]);
  });

  it("unknown platform falls back to xdg-open (POSIX default)", async () => {
    const { spawnFn, recorded } = makeStubSpawn();
    await launchObsidian({ vault: "V" }, { platform: "freebsd" as NodeJS.Platform, spawnFn });
    expect(recorded[0]!.command).toBe("xdg-open");
    expect(recorded[0]!.args).toEqual(["obsidian://open?vault=V"]);
  });
});

describe("launchObsidian — vault URL-encoding + vault-less fallback", () => {
  it("URL-encodes spaces in the vault name", async () => {
    const { spawnFn, recorded } = makeStubSpawn();
    await launchObsidian({ vault: "My Vault" }, { platform: "darwin", spawnFn });
    expect(recorded[0]!.args).toEqual(["obsidian://open?vault=My%20Vault"]);
  });

  it("URL-encodes unicode in the vault name", async () => {
    const { spawnFn, recorded } = makeStubSpawn();
    await launchObsidian({ vault: "Café 笔记" }, { platform: "linux", spawnFn });
    expect(recorded[0]!.args).toEqual([`obsidian://open?vault=${encodeURIComponent("Café 笔记")}`]);
  });

  it("vault-less fallback → bare obsidian:// app-open", async () => {
    const { spawnFn, recorded } = makeStubSpawn();
    await launchObsidian({}, { platform: "win32", spawnFn });
    expect(recorded[0]!.args).toEqual(["/c", "start", "", "obsidian://"]);
  });
});

describe("launchObsidian — fire-and-forget spawn options", () => {
  it("spawns detached / stdio ignore / windowsHide and unref's on success", async () => {
    const { spawnFn, recorded, unrefCount } = makeStubSpawn();
    await launchObsidian({ vault: "V" }, { platform: "linux", spawnFn });
    expect(recorded[0]!.options).toMatchObject({ detached: true, stdio: "ignore", windowsHide: true, shell: false });
    expect(unrefCount()).toBe(1);
  });

  it("resolves to void on a successful spawn", async () => {
    const { spawnFn } = makeStubSpawn();
    await expect(launchObsidian({ vault: "V" }, { platform: "darwin", spawnFn })).resolves.toBeUndefined();
  });
});

describe("launchObsidian — failure surfaces to the orchestrator", () => {
  it("rejects when the opener binary is missing (ENOENT 'error' event)", async () => {
    const { spawnFn, unrefCount } = makeStubSpawn({ errno: "ENOENT" });
    await expect(launchObsidian({ vault: "V" }, { platform: "linux", spawnFn })).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(unrefCount()).toBe(0); // never reached the spawn handler
  });

  it("rejects when spawn throws synchronously", async () => {
    const boom = new Error("sync spawn fail") as NodeJS.ErrnoException;
    boom.code = "EACCES";
    const { spawnFn } = makeStubSpawn({ throwSync: boom });
    await expect(launchObsidian({ vault: "V" }, { platform: "win32", spawnFn })).rejects.toBe(boom);
  });
});
