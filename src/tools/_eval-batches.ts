// Original — no upstream. The one planner for batched read-only evals (spec 088 F10, BI-0207 PR #158 review): the Obsidian.com shim answers nothing above about 4,000 characters of eval code, so a tool that sends many items splits them into batches whose composed code stays at or under EVAL_BATCH_CODE_MAX. Items join the current batch in order, consecutive items with the same key share one [key, values] tuple, and an item that would take the batch past the limit starts the next batch. Used by context_search's read-back and query_base's group values.

/** The longest composed eval code one batch may send (spec 088 research D3, F10). */
export const EVAL_BATCH_CODE_MAX = 2900;

/** A batch: [key, values] tuples in item order. */
export type EvalBatch<V> = Array<[string, V[]]>;

function withEntry<V>(batch: EvalBatch<V>, key: string, value: V): EvalBatch<V> {
  const last = batch.at(-1);
  return last !== undefined && last[0] === key
    ? [...batch.slice(0, -1), [key, [...last[1], value]]]
    : [...batch, [key, [value]]];
}

/**
 * The batches for `items`, in order. `entry` gives each item's key and value, and `code` composes a batch's eval
 * code. Every batch holds at least one item; a single item longer than the limit still gets its own batch.
 */
export function planEvalBatches<T, V>(
  items: readonly T[],
  entry: (item: T) => [string, V],
  code: (batch: EvalBatch<V>) => string,
): Array<EvalBatch<V>> {
  const batches: Array<EvalBatch<V>> = [];
  let batch: EvalBatch<V> = [];
  for (const item of items) {
    const [key, value] = entry(item);
    const next = withEntry(batch, key, value);
    if (batch.length > 0 && code(next).length > EVAL_BATCH_CODE_MAX) {
      batches.push(batch);
      batch = withEntry([], key, value);
    } else {
      batch = next;
    }
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
