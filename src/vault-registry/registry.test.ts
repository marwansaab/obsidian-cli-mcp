// Original — no upstream. Tests for the lazy vault registry per ADR-009 / FR-012 — first-call probe + cache hits, parser tolerance, retry-on-failure, concurrent-first-call deduplication.
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createVaultRegistry, type VaultRegistry } from "./registry.js";
import { UpstreamError } from "../errors.js";

const TWO_VAULT_STDOUT =
  "TestVault-Obsidian-CLI-MCP\tC:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\TestVault-Obsidian-CLI-MCP\n" +
  "The Setup\tC:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\The Setup\n";

beforeEach(() => {});
afterEach(() => {});

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

// (1) First call fires probe; subsequent calls hit cache (no second probe)
test("first call fires probe; second call hits cache (no second probe)", async () => {
  const probe = vi.fn().mockResolvedValue(TWO_VAULT_STDOUT);
  const reg: VaultRegistry = createVaultRegistry({ invokeProbe: probe });
  await reg.resolveVaultPath("The Setup");
  await reg.resolveVaultPath("TestVault-Obsidian-CLI-MCP");
  await reg.resolveVaultPath("The Setup");
  expect(probe).toHaveBeenCalledTimes(1);
});

// (2) Probe response with multiple vaults parsed correctly (tab-separated)
test("multi-vault probe output parsed by tab", async () => {
  const probe = vi.fn().mockResolvedValue(TWO_VAULT_STDOUT);
  const reg = createVaultRegistry({ invokeProbe: probe });
  expect(await reg.resolveVaultPath("TestVault-Obsidian-CLI-MCP")).toBe(
    "C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\TestVault-Obsidian-CLI-MCP",
  );
  expect(await reg.resolveVaultPath("The Setup")).toBe(
    "C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\The Setup",
  );
});

// (3) resolveVaultPath("known") returns expected absolute path
test("resolveVaultPath('known') returns expected absolute path", async () => {
  const probe = vi.fn().mockResolvedValue("MyVault\t/abs/path/to/MyVault\n");
  const reg = createVaultRegistry({ invokeProbe: probe });
  expect(await reg.resolveVaultPath("MyVault")).toBe("/abs/path/to/MyVault");
});

// (4) resolveVaultPath("unknown") throws VALIDATION_ERROR (vault not in registry)
test("resolveVaultPath('unknown') throws VALIDATION_ERROR", async () => {
  const probe = vi.fn().mockResolvedValue(TWO_VAULT_STDOUT);
  const reg = createVaultRegistry({ invokeProbe: probe });
  const err = await captureRejection(reg.resolveVaultPath("Nonexistent"));
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
  expect((err as UpstreamError).details.requestedVault).toBe("Nonexistent");
  expect((err as UpstreamError).details.knownVaults).toEqual(
    expect.arrayContaining(["TestVault-Obsidian-CLI-MCP", "The Setup"]),
  );
});

// (5) First call probe failure (CLI_BINARY_NOT_FOUND) propagates; cache stays empty
test("probe failure propagates; cache stays empty", async () => {
  const probeError = new UpstreamError({
    code: "CLI_BINARY_NOT_FOUND",
    cause: null,
    details: {},
    message: "binary missing",
  });
  const probe = vi.fn().mockRejectedValueOnce(probeError);
  const reg = createVaultRegistry({ invokeProbe: probe });
  const err = await captureRejection(reg.resolveVaultPath("anything"));
  expect(err).toBe(probeError);
});

// (6) First-call probe failure → second call retries probe (no stuck-failed state)
test("probe failure on first call → second call retries probe", async () => {
  const probeError = new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: {},
    message: "Obsidian not running",
  });
  const probe = vi
    .fn()
    .mockRejectedValueOnce(probeError)
    .mockResolvedValueOnce(TWO_VAULT_STDOUT);
  const reg = createVaultRegistry({ invokeProbe: probe });
  await captureRejection(reg.resolveVaultPath("The Setup"));
  expect(probe).toHaveBeenCalledTimes(1);
  // second call retries
  expect(await reg.resolveVaultPath("The Setup")).toBe(
    "C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\The Setup",
  );
  expect(probe).toHaveBeenCalledTimes(2);
});

// (7) Successful probe after a previous failure populates cache
test("successful probe after prior failure populates cache; subsequent call no probe", async () => {
  const probeError = new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: {},
    message: "Obsidian not running",
  });
  const probe = vi
    .fn()
    .mockRejectedValueOnce(probeError)
    .mockResolvedValueOnce(TWO_VAULT_STDOUT);
  const reg = createVaultRegistry({ invokeProbe: probe });
  await captureRejection(reg.resolveVaultPath("The Setup"));
  await reg.resolveVaultPath("The Setup");
  await reg.resolveVaultPath("TestVault-Obsidian-CLI-MCP");
  expect(probe).toHaveBeenCalledTimes(2);
});

// (8) Probe response with empty stdout returns empty registry
test("empty stdout returns empty registry; all lookups VALIDATION_ERROR", async () => {
  const probe = vi.fn().mockResolvedValue("");
  const reg = createVaultRegistry({ invokeProbe: probe });
  const err = await captureRejection(reg.resolveVaultPath("AnyVault"));
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
  expect((err as UpstreamError).details.knownVaults).toEqual([]);
});

// (9) Probe response with malformed row (no \t) is skipped silently; well-formed rows still parsed
test("malformed row (no tab) skipped silently; well-formed rows still parsed", async () => {
  const probe = vi.fn().mockResolvedValue(
    "broken-row-without-tab\n" + "GoodVault\t/abs/good\n" + "\n",
  );
  const reg = createVaultRegistry({ invokeProbe: probe });
  expect(await reg.resolveVaultPath("GoodVault")).toBe("/abs/good");
  const err = await captureRejection(reg.resolveVaultPath("broken-row-without-tab"));
  expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
});

// (10) Concurrent first-calls share one probe (no double-probe on race)
test("concurrent first-calls share one probe (deduplicated via inFlightProbe)", async () => {
  let resolveProbe!: (value: string) => void;
  const probe = vi.fn().mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        resolveProbe = resolve;
      }),
  );
  const reg = createVaultRegistry({ invokeProbe: probe });
  const p1 = reg.resolveVaultPath("The Setup");
  const p2 = reg.resolveVaultPath("TestVault-Obsidian-CLI-MCP");
  const p3 = reg.resolveVaultPath("The Setup");
  expect(probe).toHaveBeenCalledTimes(1);
  resolveProbe(TWO_VAULT_STDOUT);
  const [a, b, c] = await Promise.all([p1, p2, p3]);
  expect(a).toBe("C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\The Setup");
  expect(b).toBe("C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\TestVault-Obsidian-CLI-MCP");
  expect(c).toBe(a);
  expect(probe).toHaveBeenCalledTimes(1);
});

// (Bonus) Tolerate \r\n line endings (Windows) and BOM
test("tolerates \\r\\n line endings and BOM", async () => {
  const probe = vi.fn().mockResolvedValue("﻿Alpha\t/abs/alpha\r\nBeta\t/abs/beta\r\n");
  const reg = createVaultRegistry({ invokeProbe: probe });
  expect(await reg.resolveVaultPath("Alpha")).toBe("/abs/alpha");
  expect(await reg.resolveVaultPath("Beta")).toBe("/abs/beta");
});
