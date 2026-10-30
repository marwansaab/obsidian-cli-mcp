// Original — no upstream. Tests for the FIFO single-flight queue (FR-023).
import { describe, test, expect } from "vitest";

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

describe("cancellation (068 R11, T082)", () => {
  function blockedQueue() {
    const q = createQueue();
    let release: (() => void) | undefined;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    const first = q.run(async () => {
      await blocker;
      return "first";
    });
    return { q, first, release: () => release!() };
  }

  test("a queued task aborted before it starts is removed, rejected with the abort reason and never run; the next task runs", async () => {
    const { q, first, release } = blockedQueue();
    const controller = new AbortController();
    let cancelledStarted = false;
    const cancelled = q.run(
      async () => {
        cancelledStarted = true;
        return "cancelled";
      },
      { signal: controller.signal },
    );
    const next = q.run(async () => "next");
    expect(q.depth()).toBe(3);

    const reason = new Error("client cancelled");
    controller.abort(reason);
    await expect(cancelled).rejects.toBe(reason);
    expect(q.depth()).toBe(2);

    release();
    expect(await first).toBe("first");
    expect(await next).toBe("next");
    expect(cancelledStarted).toBe(false);
    expect(q.depth()).toBe(0);
  });

  test("an already-aborted signal rejects at once without queueing the task", async () => {
    const q = createQueue();
    const controller = new AbortController();
    controller.abort("gone");
    let started = false;
    await expect(
      q.run(
        async () => {
          started = true;
        },
        { signal: controller.signal },
      ),
    ).rejects.toBe("gone");
    expect(started).toBe(false);
    expect(q.depth()).toBe(0);
  });

  test("an abort while the task runs leaves the queue alone: the task's own result settles the call", async () => {
    const q = createQueue();
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const running = q.run(
      () =>
        new Promise<string>((r) => {
          release = () => r("finished");
        }),
      { signal: controller.signal },
    );
    await Promise.resolve();
    controller.abort();
    release!();
    expect(await running).toBe("finished");
  });

  test("an abort after the task settled is ignored", async () => {
    const q = createQueue();
    const controller = new AbortController();
    const done = await q.run(async () => "done", { signal: controller.signal });
    controller.abort();
    expect(done).toBe("done");
    expect(await q.run(async () => "after")).toBe("after");
  });

  test("shutdown still drops a queued task that carries a signal, and depth stays correct", async () => {
    const { q, first, release } = blockedQueue();
    const controller = new AbortController();
    const queued = q.run(async () => "queued", { signal: controller.signal }).catch((e: unknown) => e);
    expect(q.shutdown()).toBe(1);
    controller.abort();
    release();
    await first;
    expect(typeof (await queued)).toBe("symbol");
    expect(q.depth()).toBe(0);
  });
});

test("queue.run rejects when enqueued after shutdown (QUEUE_DROPPED)", async () => {
  const q = createQueue();
  q.shutdown();
  let taskStarted = false;
  await expect(
    q.run(async () => {
      taskStarted = true;
      return 1;
    }),
  ).rejects.toBeDefined();
  expect(taskStarted).toBe(false);
});
