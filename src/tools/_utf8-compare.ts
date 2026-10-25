// Original — no upstream. Shared UTF-8 byte-order comparator (068 / PR #85 review). `files` sorts
// paths with it (R8 / FR-027) and `tags` breaks name ties with it (068 R7); it lives in this leaf
// module so neither tool imports the other (Principle I).

/** Compares two strings by their UTF-8 bytes, not JavaScript's default UTF-16 code units. */
export function compareUtf8Bytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
