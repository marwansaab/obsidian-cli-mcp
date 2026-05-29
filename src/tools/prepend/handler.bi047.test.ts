// Original - no upstream. prepend handler tests - BI-047 byte-delta-guard cohort
// (post-stat byte-delta guard / broadened FR-003 / payload-size buckets / over-cap
// rejection). Split from handler.test.ts (BI-058 F-E); shared fixtures live in
// _handler-fixtures.ts. The BI-045 US1-US4 cohort is in handler.test.ts.
import { performance } from "node:perf_hooks";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { deps, fakeFs, fakeRegistry, PREPEND_OK, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePrepend } from "./handler.js";
import { createPrependTool } from "./index.js";
import { MAX_CONTENT_LENGTH } from "./schema.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// ─────────────────────────────────────────────────────────────────────
// BI-047 US1 — post-stat byte-delta guard (FS_WRITE_FAILED sub-discriminator)
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US1 — post-stat byte-delta guard", () => {
  test("raises FS_WRITE_FAILED.post-stat-byte-delta-zero when upstream returns exit 0 but on-disk byte count is unchanged", async () => {
    const fs = fakeFs({ sizes: [MAX_CONTENT_LENGTH, MAX_CONTENT_LENGTH] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "Prepended to: Sandbox/silent-noop.md\n", stderr: "", exitCode: 0 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/silent-noop.md",
        content: "x".repeat(MAX_CONTENT_LENGTH),
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("post-stat-byte-delta-zero");
    expect((err as UpstreamError).details.path).toBe("Sandbox/silent-noop.md");
    expect((err as UpstreamError).details.vault).toBe("TestVault");
    expect((err as UpstreamError).details.preCallSize).toBe(MAX_CONTENT_LENGTH);
    expect((err as UpstreamError).details.postCallSize).toBe(MAX_CONTENT_LENGTH);
    expect((err as UpstreamError).message).toMatch(/upstream returned success but on-disk byte count is unchanged/i);
  });

  test("50-call regression cohort at MAX_CONTENT_LENGTH produces structured success envelope per call with byte-correct delta", async () => {
    const content = "x".repeat(MAX_CONTENT_LENGTH);
    const expectedDelta = MAX_CONTENT_LENGTH + 1;
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const bytesWrittenObservations: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const fs = fakeFs({ sizes: [0, expectedDelta] });
      const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
      const result = await executePrepend(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: `Sandbox/cohort/note-${i}.md`,
          content,
          inline: false,
        },
        deps({ spawnFn, vaultRegistry: reg, fs }),
      );
      bytesWrittenObservations.push(result.bytes_written);
      expect(result.path).toBe(`Sandbox/cohort/note-${i}.md`);
      expect(result.vault).toBe("TestVault");
      expect(result.inline).toBe(false);
    }
    expect(bytesWrittenObservations.length).toBe(50);
    expect(bytesWrittenObservations.every((b) => b === expectedDelta)).toBe(true);
  });

  test("in-cap success at boundary sizes produces structured success envelope with positive bytes_written", async () => {
    const cases = [
      { contentLen: 1, separator: 1 },
      { contentLen: Math.floor(MAX_CONTENT_LENGTH / 2), separator: 1 },
      { contentLen: MAX_CONTENT_LENGTH - 1, separator: 1 },
      { contentLen: MAX_CONTENT_LENGTH, separator: 1 },
    ];
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    for (const { contentLen, separator } of cases) {
      const pre = 100;
      const post = pre + contentLen + separator;
      const fs = fakeFs({ sizes: [pre, post] });
      const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
      const result = await executePrepend(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: `Sandbox/boundary-${contentLen}.md`,
          content: "x".repeat(contentLen),
          inline: false,
        },
        deps({ spawnFn, vaultRegistry: reg, fs }),
      );
      expect(result.bytes_written).toBe(contentLen + separator);
      expect(result.bytes_written).toBeGreaterThanOrEqual(1);
      expect(result.path).toBe(`Sandbox/boundary-${contentLen}.md`);
    }
  });

  test("p95 wall-clock latency across 50-call cohort ≤ 500 ms (wrapper-overhead bound)", async () => {
    const content = "x".repeat(MAX_CONTENT_LENGTH);
    const expectedDelta = MAX_CONTENT_LENGTH + 1;
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    const observations: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const fs = fakeFs({ sizes: [0, expectedDelta] });
      const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
      const start = performance.now();
      await executePrepend(
        {
          target_mode: "specific",
          vault: "TestVault",
          path: `Sandbox/latency/note-${i}.md`,
          content,
          inline: false,
        },
        deps({ spawnFn, vaultRegistry: reg, fs }),
      );
      observations.push(performance.now() - start);
    }
    observations.sort((a, b) => a - b);
    const p95 = observations[Math.floor(50 * 0.95)]!;
    expect(p95).toBeLessThanOrEqual(500);
  });

  test("concurrent calls against the same target serialize last-write-wins with no silent no-op", async () => {
    // Two prepend calls fired in rapid succession (< 100 ms apart) against the
    // same target path. The queue serialises them FIFO; the DI'd fs.stat
    // returns progressive byte counts that reflect both writes landing in order.
    // Per US1 AC3 + FR-010: both calls resolve to structured success envelopes
    // whose ordering matches the queue's serialisation; neither call produces
    // a silent no-op envelope.
    const reg = fakeRegistry({ TestVault: VAULT_ROOT });
    // Each call does pre-stat (read current size) + post-stat (read new size).
    // Call 1: pre=0, post=delta. Call 2: pre=delta, post=2*delta.
    const delta = MAX_CONTENT_LENGTH + 1;
    const fs = fakeFs({ sizes: [0, delta, delta, 2 * delta] });
    const { spawnFn, recorded } = makeQueuedSpawn([PREPEND_OK, PREPEND_OK]);
    const d = deps({ spawnFn, vaultRegistry: reg, fs });
    const args = {
      target_mode: "specific" as const,
      vault: "TestVault",
      path: "Sandbox/concurrent.md",
      content: "x".repeat(MAX_CONTENT_LENGTH),
      inline: false,
    };
    const p1 = executePrepend(args, d);
    const p2 = executePrepend(args, d);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.path).toBe("Sandbox/concurrent.md");
    expect(r2.path).toBe("Sandbox/concurrent.md");
    expect(r1.bytes_written).toBeGreaterThanOrEqual(1);
    expect(r2.bytes_written).toBeGreaterThanOrEqual(1);
    // FIFO serialisation: first invocation observes pre=0, post=delta; second
    // observes pre=delta, post=2*delta. Both are positive deltas — no silent
    // no-op produced.
    expect(r1.bytes_written).toBe(delta);
    expect(r2.bytes_written).toBe(delta);
    expect(recorded.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BI-047 US2 — broadened FR-003 enforcement (positive bytes_written shape
// against unchanged on-disk count is now structurally impossible)
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US2 — broadened FR-003 enforcement", () => {
  test("forbidden anti-pattern: success envelope with positive bytes_written but unchanged on-disk count is impossible", async () => {
    // The handler reads the post-call stat and computes bytesWritten as
    // postCallSize - preCallSize. With identical pre/post sizes, bytesWritten
    // is 0 and the guard fires. There is no code path that could emit
    // {bytes_written: <positive>} against an unchanged on-disk count.
    const fs = fakeFs({ sizes: [5000, 5000] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/unchanged.md",
        content: "y".repeat(100),
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("post-stat-byte-delta-zero");
  });

  test("negative byte-delta (file truncated under upstream's hand) also fires the guard", async () => {
    // Defensive: if for any reason post < pre (truncation), bytesWritten is
    // negative and the guard fires the same FS_WRITE_FAILED envelope rather
    // than emitting a negative bytes_written value (which would itself fail
    // the output schema's `.min(1)` invariant).
    const fs = fakeFs({ sizes: [10000, 8000] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/truncated.md",
        content: "z",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
    expect((err as UpstreamError).details.reason).toBe("post-stat-byte-delta-zero");
    expect((err as UpstreamError).details.preCallSize).toBe(10000);
    expect((err as UpstreamError).details.postCallSize).toBe(8000);
  });
});

// ─────────────────────────────────────────────────────────────────────
// BI-047 US3 — payload-size bucket coverage + simulated host-process crash
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US3 — payload-size bucket coverage", () => {
  test.each([
    { label: "well-under-cap (1024)", contentLen: 1024 },
    { label: "at-cap-boundary (MAX-1)", contentLen: MAX_CONTENT_LENGTH - 1 },
    { label: "exactly-at-cap (MAX)", contentLen: MAX_CONTENT_LENGTH },
  ])("$label produces structured success envelope", async ({ contentLen }) => {
    const pre = 100;
    const post = pre + contentLen + 1;
    const fs = fakeFs({ sizes: [pre, post] });
    const { spawnFn } = makeQueuedSpawn([PREPEND_OK]);
    const result = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: `Sandbox/bucket-${contentLen}.md`,
        content: "x".repeat(contentLen),
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    );
    expect(result.bytes_written).toBe(contentLen + 1);
  });

  test("above-cap (MAX+1) rejected by schema before executePrepend reached", async () => {
    // Per FR-002 / FR-004: over-cap rejection fires at the schema boundary
    // BEFORE the handler runs. This test verifies the schema-side gate; the
    // handler is not reached (no spawn invoked).
    const { prependInputSchema } = await import("./schema.js");
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/over-cap.md",
      content: "x".repeat(MAX_CONTENT_LENGTH + 1),
      inline: false,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "content");
    expect(issue?.code).toBe("too_big");
  });

  test("simulated host-process abnormal exit produces structured CLI_NON_ZERO_EXIT envelope", async () => {
    // The `obsidian.exe` GUI crash exit code observed during the prior BI-0017
    // active-mode investigation was 4294967295 (0xFFFFFFFF — unsigned-32
    // representation of -1). The dispatch layer surfaces this as
    // CLI_NON_ZERO_EXIT; the silent-no-op surface is not exercised because the
    // exit code is non-zero.
    const fs = fakeFs({ sizes: [0, 0] });
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "", stderr: "host process crashed\n", exitCode: 4294967295 },
    ]);
    const err = await executePrepend(
      {
        target_mode: "specific",
        vault: "TestVault",
        path: "Sandbox/crash.md",
        content: "x",
        inline: false,
      },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).code).toBe("CLI_NON_ZERO_EXIT");
  });
});

// ─────────────────────────────────────────────────────────────────────
// BI-047 US4 — over-cap rejection fires at schema boundary, no spawn invoked
// ─────────────────────────────────────────────────────────────────────

describe("BI-047 US4 — over-cap rejection at schema boundary", () => {
  test("rejects over-cap content before any spawnFn invocation (via registerTool boundary)", async () => {
    // Build a tool with a spawn spy that throws on any invocation. The schema
    // boundary rejection MUST fire before the handler runs.
    const spawnSpy = vi.fn(() => {
      throw new Error("spawn must NOT be invoked for over-cap content");
    });
    const tool = createPrependTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }),
      spawnFn: spawnSpy as unknown as SpawnLike,
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/over-cap.md",
      content: "x".repeat(MAX_CONTENT_LENGTH + 1),
    });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});
