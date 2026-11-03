// Original — no upstream. The one rule for a tag's leading `#`, shared by the tag-facing tools (BI-0181): exactly one leading `#` is removed, so `#x` and `x` name the same tag and `##x` stays distinct as `#x`. `tag` applies it to its input; `read_property` to the `tags` values it returns. find_by_property's eval template cannot import, so it carries an inline copy of the same rule (`nt` in `find_by_property/_template.ts`), pinned by that template's tests.

/** Removes one leading `#` from a tag, if present. */
export const stripTagHash = (tag: string): string => (tag.startsWith("#") ? tag.slice(1) : tag);
