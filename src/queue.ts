// Original — no upstream. FIFO single-flight queue: at most one task runs at a time, in arrival order (FR-023). 068 R11 (FR-051, FR-053): a task may carry the request's AbortSignal; aborted while queued, it is removed and never started; aborted while running, the queue leaves it alone (the task itself observes the signal).

const QUEUE_DROPPED = Symbol("queue.dropped");

interface QueueEntry {
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  /** Detaches the entry's abort listener once it leaves the FIFO (started or dropped). */
  release: () => void;
}

export interface QueueRunOptions {
  /** The request's cancellation signal (068 R11). Only a still-queued task is affected by it. */
  signal?: AbortSignal;
}

export interface Queue {
  run<T>(task: () => Promise<T>, opts?: QueueRunOptions): Promise<T>;
  depth(): number;
  shutdown(): number;
}

export function createQueue(): Queue {
  const pending: QueueEntry[] = [];
  let active = false;
  let shuttingDown = false;

  function pump(): void {
    if (active || shuttingDown) return;
    const next = pending.shift();
    if (!next) return;
    next.release();
    active = true;
    next.task().then(
      (value) => {
        active = false;
        next.resolve(value);
        pump();
      },
      (reason: unknown) => {
        active = false;
        next.reject(reason);
        pump();
      },
    );
  }

  return {
    run<T>(task: () => Promise<T>, opts: QueueRunOptions = {}): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (shuttingDown) {
          reject(QUEUE_DROPPED);
          return;
        }
        const { signal } = opts;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const entry: QueueEntry = {
          task: task as () => Promise<unknown>,
          resolve: resolve as (v: unknown) => void,
          reject,
          release: () => undefined,
        };
        if (signal) {
          const onAbort = (): void => {
            const index = pending.indexOf(entry);
            if (index === -1) return;
            pending.splice(index, 1);
            reject(signal.reason);
          };
          signal.addEventListener("abort", onAbort, { once: true });
          entry.release = () => signal.removeEventListener("abort", onAbort);
        }
        pending.push(entry);
        pump();
      });
    },
    depth(): number {
      return pending.length + (active ? 1 : 0);
    },
    shutdown(): number {
      shuttingDown = true;
      const dropped = pending.splice(0, pending.length);
      for (const entry of dropped) {
        entry.release();
        entry.reject(QUEUE_DROPPED);
      }
      return dropped.length;
    },
  };
}
