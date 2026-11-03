// Original — no upstream. The one rule for a tag's leading `#`, shared by the tag-facing tools (BI-0181): exactly one leading `#` is removed, so `#x` and `x` name the same tag and `##x` stays distinct as `#x`. `tag` applies `stripTagHash` to its input; `read_property` applies `withoutTagHash` to the `tags` value it returns; find_by_property's eval template interpolates `WITHOUT_TAG_HASH_JS`, the same value-level rule as in-eval source, pinned to `withoutTagHash` by a parity table in `_tag-hash.test.ts`. `tag/_template.ts`'s `normTag` still carries an older inline copy of the one-`#` strip.

/** The one property whose values get the leading-`#` rule, matched exactly (case-sensitive). */
export const TAGS_PROPERTY = "tags";

/** Removes one leading `#` from a tag, if present. */
export const stripTagHash = (tag: string): string => (tag.startsWith("#") ? tag.slice(1) : tag);

/** Applies `stripTagHash` to a scalar string, or to each string element of a list; anything else is returned as is. */
export function withoutTagHash(value: unknown): unknown {
  if (typeof value === "string") return stripTagHash(value);
  if (Array.isArray(value)) return value.map((e: unknown) => (typeof e === "string" ? stripTagHash(e) : e));
  return value;
}

/** `withoutTagHash` as in-eval JavaScript source (a function expression), for frozen eval templates. */
export const WITHOUT_TAG_HASH_JS =
  "(v=>{const s=x=>typeof x==='string'&&x.startsWith('#')?x.slice(1):x;return Array.isArray(v)?v.map(s):s(v);})";
