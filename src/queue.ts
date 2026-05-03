// Original — no upstream. FIFO single-flight queue: at most one task runs at a time, in arrival order (FR-023).

const QUEUE_DROPPED = Symbol("queue.dropped");

interface QueueEntry {
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export interface Queue {
  run<T>(task: () => Promise<T>): Promise<T>;
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
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (shuttingDown) {
          reject(QUEUE_DROPPED);
          return;
        }
        pending.push({
          task: task as () => Promise<unknown>,
          resolve: resolve as (v: unknown) => void,
          reject,
        });
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
        entry.reject(QUEUE_DROPPED);
      }
      return dropped.length;
    },
  };
}
