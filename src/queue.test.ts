// Original — no upstream. Tests for the FIFO single-flight queue (FR-023).
import { test, expect } from "vitest";

import { createQueue } from "./queue.js";

test("queue.run resolves to the task's return value", async () => {
  const q = createQueue();
  const result = await q.run(async () => 42);
  expect(result).toBe(42);
});

test("queue.run rejects when the task throws", async () => {
  const q = createQueue();
  await expect(
    q.run(async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow(/boom/);
});

test("queue serializes tasks in arrival order (FIFO)", async () => {
  const q = createQueue();
  const events: string[] = [];
  const t1 = q.run(async () => {
    events.push("t1-start");
    await new Promise((r) => setTimeout(r, 30));
    events.push("t1-end");
    return 1;
  });
  const t2 = q.run(async () => {
    events.push("t2-start");
    await new Promise((r) => setTimeout(r, 5));
    events.push("t2-end");
    return 2;
  });
  const t3 = q.run(async () => {
    events.push("t3-start");
    return 3;
  });
  await Promise.all([t1, t2, t3]);
  expect(events).toEqual(["t1-start", "t1-end", "t2-start", "t2-end", "t3-start"]);
});

test("queue.depth reports pending (queued + in-flight) count", async () => {
  const q = createQueue();
  expect(q.depth()).toBe(0);
  let release: (() => void) | undefined;
  const blocker = new Promise<void>((r) => {
    release = r;
  });
  const t1 = q.run(async () => {
    await blocker;
    return 1;
  });
  expect(q.depth()).toBeGreaterThanOrEqual(1);
  release!();
  await t1;
  expect(q.depth()).toBe(0);
});

test("queue.shutdown drops queued tasks without running them", async () => {
  const q = createQueue();
  let release: (() => void) | undefined;
  const blocker = new Promise<void>((r) => {
    release = r;
  });
  let dropped1Started = false;
  let dropped2Started = false;
  const t1 = q.run(async () => {
    await blocker;
    return "first";
  });
  const droppedPromise1 = q
    .run(async () => {
      dropped1Started = true;
      return "dropped1";
    })
    .catch((e: unknown) => e);
  const droppedPromise2 = q
    .run(async () => {
      dropped2Started = true;
      return "dropped2";
    })
    .catch((e: unknown) => e);
  const droppedCount = q.shutdown();
  expect(droppedCount).toBe(2);
  release!();
  const firstResult = await t1;
  expect(firstResult).toBe("first");
  await droppedPromise1;
  await droppedPromise2;
  expect(dropped1Started).toBe(false);
  expect(dropped2Started).toBe(false);
});
