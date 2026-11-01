// Original — no upstream. Spec 078 — prepend's size limit: content over MAX_CONTENT_BYTES UTF-8 bytes is refused during input validation as VALIDATION_ERROR / CONTENT_TOO_LARGE with details.reason "bytes", before anything reaches the vault or Obsidian; contract B1–B16. Also home to the registered-path character-limit cases (BI-045 FR-018), so both limits are tested in one place; the toEqual payloads of B1 and B5 pin that both share details.code and only the size limit carries reason "bytes" (spec 078 US3).
import { describe, expect, test, vi } from "vitest";

import { fakeFs } from "./_handler-fixtures.js";
import { createPrependTool } from "./index.js";
import { MAX_CONTENT_BYTES, MAX_CONTENT_LENGTH } from "./schema.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

import type { SpawnLike } from "../../cli-adapter/cli-adapter.js";
import type { ToolCallResult } from "../_shared.js";

function build() {
  const resolveVaultPath = vi.fn(async (): Promise<string> => {
    throw new UpstreamError({ code: "MARKER_PASSED_SCHEMA", cause: null, details: {} });
  });
  const spawnFn = vi.fn(() => {
    throw new Error("spawn must not be called");
  });
  const fs = fakeFs();
  const tool = createPrependTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: { resolveVaultPath, resolveVaultDisplayName: () => null },
    fs,
    spawnFn: spawnFn as unknown as SpawnLike,
  });
  return { tool, resolveVaultPath, spawnFn, fs };
}

type Built = ReturnType<typeof build>;

function payloadOf(
  result: ToolCallResult,
): Record<string, unknown> & { details: Record<string, unknown> } {
  expect("isError" in result && result.isError).toBe(true);
  const first = result.content[0] as { type: "text"; text: string };
  return JSON.parse(first.text) as Record<string, unknown> & { details: Record<string, unknown> };
}

function expectUntouched(b: Built): void {
  expect(b.resolveVaultPath).not.toHaveBeenCalled();
  expect(b.spawnFn).not.toHaveBeenCalled();
  expect(b.fs.statCalls).toEqual([]);
  expect(b.fs.readCalls).toEqual([]);
  expect(b.fs.writes).toEqual([]);
}

function sizeLimitError(contentBytes: number) {
  return {
    code: "VALIDATION_ERROR",
    message: `content exceeds maximum size of ${MAX_CONTENT_BYTES} UTF-8 bytes (got ${contentBytes})`,
    details: {
      code: "CONTENT_TOO_LARGE",
      reason: "bytes",
      contentBytes,
      maxBytes: MAX_CONTENT_BYTES,
    },
  };
}

function charLimitError(contentLength: number) {
  return {
    code: "VALIDATION_ERROR",
    message: `content exceeds maximum length of ${MAX_CONTENT_LENGTH} UTF-16 code units (got ${contentLength})`,
    details: { code: "CONTENT_TOO_LARGE", contentLength, maxLength: MAX_CONTENT_LENGTH },
  };
}

const SPECIFIC = { target_mode: "specific", vault: "TestVault", path: "n.md" } as const;
const CJK_1500 = "中".repeat(1500);

describe("size limit refuses (spec 078 FR-001–FR-004)", () => {
  test.each([
    { label: "B1 1,500 CJK characters", args: { ...SPECIFIC, content: CJK_1500 }, bytes: 4500 },
    {
      label: "B2 B1 with inline: true",
      args: { ...SPECIFIC, content: CJK_1500, inline: true },
      bytes: 4500,
    },
    { label: "B3 active mode", args: { target_mode: "active", content: CJK_1500 }, bytes: 4500 },
    {
      label: "B4 missing note",
      args: { ...SPECIFIC, path: "Sandbox/missing.md", content: CJK_1500 },
      bytes: 4500,
    },
    {
      label: "B11 one 2-byte character over",
      args: { ...SPECIFIC, content: "a".repeat(3071) + "é" },
      bytes: 3073,
    },
    { label: "B12 769 emoji", args: { ...SPECIFIC, content: "😀".repeat(769) }, bytes: 3076 },
    {
      label: "B13 lone surrogate",
      args: { ...SPECIFIC, content: "\uD800" + "a".repeat(3070) },
      bytes: 3073,
    },
    {
      label: "B16 CRLF counted as 2 bytes",
      args: { ...SPECIFIC, content: "中".repeat(1023) + "\r\n" + "ab" },
      bytes: 3073,
    },
  ])("$label → CONTENT_TOO_LARGE / reason bytes, nothing touched", async ({ args, bytes }) => {
    const b = build();
    const payload = payloadOf(await b.tool.handler(args));
    expect(payload).toEqual(sizeLimitError(bytes));
    expectUntouched(b);
  });

  test("B1 is refused in under one second (spec SC-003)", async () => {
    const b = build();
    const start = performance.now();
    const payload = payloadOf(await b.tool.handler({ ...SPECIFIC, content: CJK_1500 }));
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(payload.details.reason).toBe("bytes");
  });
});

describe("within both limits reaches the handler (spec 078 FR-006)", () => {
  test.each([
    { label: "B7 3,072 ASCII", content: "a".repeat(3072) },
    { label: "B8 1,024 CJK (3,072 bytes)", content: "中".repeat(1024) },
    { label: "B9 1,536 two-byte characters", content: "é".repeat(1536) },
    { label: "B10 768 emoji", content: "😀".repeat(768) },
    { label: "B14 mixed script", content: "a".repeat(3000) + "中".repeat(24) },
    { label: "B15 CRLF boundary", content: "a".repeat(3070) + "\r\n" },
  ])("$label → validation passes", async ({ content }) => {
    const b = build();
    const payload = payloadOf(await b.tool.handler({ ...SPECIFIC, content }));
    expect(payload.code).toBe("MARKER_PASSED_SCHEMA");
    expect(b.resolveVaultPath).toHaveBeenCalledTimes(1);
  });
});

describe("the two limits together (spec 078 FR-005)", () => {
  test("B5 over the character limit → the unchanged character-limit error", async () => {
    const b = build();
    const payload = payloadOf(await b.tool.handler({ ...SPECIFIC, content: "a".repeat(3073) }));
    expect(payload).toEqual(charLimitError(3073));
    expect(payload.details).not.toHaveProperty("reason");
    expectUntouched(b);
  });

  test("ten times over the character limit → the same character-limit error (BI-045 FR-018)", async () => {
    const b = build();
    const wayOver = MAX_CONTENT_LENGTH * 10;
    const payload = payloadOf(await b.tool.handler({ ...SPECIFIC, content: "x".repeat(wayOver) }));
    expect(payload).toEqual(charLimitError(wayOver));
    expectUntouched(b);
  });

  test("B6 over both limits → the character-limit error wins", async () => {
    const b = build();
    const payload = payloadOf(await b.tool.handler({ ...SPECIFIC, content: "🚀".repeat(1537) }));
    expect(payload).toEqual(charLimitError(3074));
    expectUntouched(b);
  });
});
