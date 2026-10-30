// Original — no upstream. Tests for the vaults tool registration: descriptor, read-only hints, deps wiring and the error envelope (068 FR-024, FR-036).
import { describe, expect, it, vi } from "vitest";

import { VAULTS_DESCRIPTION, VAULTS_TOOL_NAME, createVaultsTool } from "./index.js";
import { UpstreamError } from "../../errors.js";
import { createVaultRegistry } from "../../vault-registry/registry.js";
import { READ_ONLY_HINTS } from "../_shared.js";

function toolOver(invokeProbe: () => Promise<string>) {
  return createVaultsTool({ vaultRegistry: createVaultRegistry({ invokeProbe }) });
}

describe("createVaultsTool", () => {
  it("publishes name 'vaults' (ADR-010), its description and the read-only hints", () => {
    const tool = toolOver(vi.fn());
    expect(tool.descriptor.name).toBe(VAULTS_TOOL_NAME);
    expect(tool.descriptor.name).toBe("vaults");
    expect(tool.descriptor.description).toBe(VAULTS_DESCRIPTION);
    expect(tool.descriptor.annotations).toEqual(READ_ONLY_HINTS);
  });

  it("deps wired through: the handler lists the registry's vaults as JSON text", async () => {
    const result = await toolOver(vi.fn().mockResolvedValue("Work\t/w\n")).handler({});
    if ("isError" in result) throw new Error("unexpected error");
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      count: 1,
      vaults: [{ name: "Work", path: "/w", open: null }],
    });
  });

  it("an unexpected input key returns VALIDATION_ERROR without probing", async () => {
    const invokeProbe = vi.fn();
    const result = await toolOver(invokeProbe).handler({ vault: "Work" });
    expect("isError" in result && result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text).code).toBe("VALIDATION_ERROR");
    expect(invokeProbe).not.toHaveBeenCalled();
  });

  it("a CLI failure returns the structured error envelope", async () => {
    const failure = new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { reason: "app down" },
      message: "Obsidian is not running",
    });
    const result = await toolOver(vi.fn().mockRejectedValue(failure)).handler({});
    expect("isError" in result && result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      code: "CLI_REPORTED_ERROR",
      message: "Obsidian is not running",
      details: { reason: "app down" },
    });
  });
});
