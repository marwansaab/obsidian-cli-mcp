// Original — no upstream. Spec 076 research D2: the pure predicate that tells whether Obsidian's
// default-mode prepend landed at the very end of a note with no body (empty, or a properties block
// only), so the final LF of `after` is the one Obsidian added and can be removed.

/**
 * True when `after` is `before + content + "\n"` and `before` does not end with the primitive root
 * of `content + "\n"`. That ending is the one shape the bytes cannot tell apart from an insertion
 * higher up in a note with a body, so the predicate refuses it to keep such notes untouched.
 */
export function landedAtEmptyBody(before: string, content: string, after: string): boolean {
  const w = content + "\n";
  const root = w.slice(0, (w + w).indexOf(w, 1));
  return after === before + w && !before.endsWith(root);
}
