// Original — no upstream. query_base's view-grouping scan (BI-0207, owner ruling 2026-11-07): reads a named view's `groupBy` (and whether it sets a custom `groupOrder`) from the `.base` text in TypeScript, so an ungrouped view needs no eval. It recognises the block-style YAML Obsidian writes (the technique create_base's ITEM_FOLDER_TEMPLATE uses for `filters`, copied here, not imported); a shape it cannot read is reported as `unreadable`, never as ungrouped. Obsidian's own rule (read from its view parser) decides what counts as grouped: a non-empty string `property` and a `direction` of exactly `ASC` or `DESC`; any other `groupBy` leaves the view ungrouped, and `groupOrder` only counts when it is a list.

export type ViewGrouping =
  | { kind: "none" }
  | { kind: "grouped"; property: string; direction: "ASC" | "DESC"; customOrder: boolean }
  | { kind: "unreadable"; detail: string };

interface Line {
  indent: number;
  text: string;
}

interface KeyLine {
  key: string;
  /** The text after `key:`, comment included; empty when the value is on the lines below. */
  rest: string;
  index: number;
}

type Scalar = { ok: true; value: string; plain: boolean } | { ok: false };

const NOT_A_STRING_PLAIN = /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[-+]?(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][-+]?\d+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)|0x[0-9a-fA-F]+|0o[0-7]+)$/;

function isBlank(text: string): boolean {
  return /^\s*(#.*)?$/.test(text);
}

function toLines(text: string): Line[] {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((raw) => {
      const indent = /^ */.exec(raw)![0].length;
      return { indent, text: raw.slice(indent) };
    });
}

/** A one-line YAML scalar: single- or double-quoted, or plain (trailing comment dropped). */
function scalar(raw: string): Scalar {
  const v = raw.trim();
  const single = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(v);
  if (single) return { ok: true, value: single[1]!.replace(/''/g, "'"), plain: false };
  const double = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(v);
  if (double) {
    try {
      return { ok: true, value: JSON.parse(`"${double[1]!}"`) as string, plain: false };
    } catch {
      return { ok: false };
    }
  }
  if (v.length === 0 || /^[[{|>&*!%@`'"]/.test(v)) return { ok: false };
  const plain = v.replace(/\s+#.*$/, "");
  if (/:\s|:$/.test(plain)) return { ok: false };
  return { ok: true, value: plain, plain: true };
}

/** A `key: rest` line; the key plain or quoted. `null` when the line is not a mapping entry. */
function keyLine(text: string, index: number): KeyLine | null {
  const m = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"\-[{][^:#]*?|-[^\s:#][^:#]*?)\s*:(?:\s+(.*))?$/.exec(text);
  if (!m) return null;
  const key = scalar(m[1]!);
  if (!key.ok) return null;
  return { key: key.value, rest: m[2] ?? "", index };
}

/**
 * The entries of the mapping whose keys sit at `indent`, from `start` up to the first line less
 * indented (or `end`). Lines that are deeper, or that start a sequence item at `indent` (a list
 * value written flush with its key), belong to the entry above them.
 */
function mappingEntries(lines: Line[], start: number, end: number, indent: number): KeyLine[] | null {
  const entries: KeyLine[] = [];
  for (let i = start; i < end; i++) {
    const line = lines[i]!;
    if (isBlank(line.text)) continue;
    if (line.indent < indent) break;
    if (line.indent > indent || /^-(\s|$)/.test(line.text)) continue;
    const entry = keyLine(line.text, i);
    if (entry === null) return null;
    entries.push(entry);
  }
  return entries;
}

/** The index of the first line after `index` that is not blank, or `lines.length`. */
function nextContent(lines: Line[], index: number): number {
  let i = index + 1;
  while (i < lines.length && isBlank(lines[i]!.text)) i++;
  return i;
}

/** The end (exclusive) of the block owned by the line at `index`: the lines below it indented deeper than `indent`. */
function blockEnd(lines: Line[], index: number, indent: number): number {
  let i = index + 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (isBlank(line.text)) continue;
    if (line.indent <= indent) break;
  }
  return i;
}

/** The named view's grouping, read from the `.base` text the way Obsidian's view parser reads it. */
export function findViewGrouping(text: string, viewName: string): ViewGrouping {
  // Fast path: a `.base` that never says `groupBy` has no grouped view.
  if (!text.includes("groupBy")) return { kind: "none" };
  const lines = toLines(text);

  const viewsAt = lines.findIndex((l) => l.indent === 0 && /^views\s*:/.test(l.text));
  if (viewsAt < 0) return { kind: "unreadable", detail: "no block-style top-level views key" };
  if (!isBlank(lines[viewsAt]!.text.replace(/^views\s*:/, ""))) {
    return { kind: "unreadable", detail: "views is not a block sequence" };
  }

  const first = nextContent(lines, viewsAt);
  const dash = /^-(\s+|$)/.exec(lines[first]?.text ?? "");
  if (!dash) return { kind: "unreadable", detail: "views is not a block sequence" };
  const itemIndent = lines[first]!.indent;

  // Obsidian runs the first view whose name matches, so the scan stops at the first match.
  let i = first;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent !== itemIndent) break;
    const item = /^-(\s+)(\S.*)$/.exec(line.text);
    if (!item) break;
    const keyIndent = itemIndent + 1 + item[1]!.length;
    // The item's lines: its first line (re-indented as a key line) plus every deeper line below it.
    const end = blockEnd(lines, i, itemIndent);
    const itemLines: Line[] = [{ indent: keyIndent, text: item[2]! }, ...lines.slice(i + 1, end)];
    const entries = mappingEntries(itemLines, 0, itemLines.length, keyIndent);
    if (entries === null) return { kind: "unreadable", detail: "a view has a key the scan cannot read" };

    const nameEntry = entries.find((e) => e.key === "name");
    const name = nameEntry === undefined ? null : scalar(nameEntry.rest);
    if (name === null || !name.ok) return { kind: "unreadable", detail: "a view's name cannot be read" };
    if (name.value === viewName) return viewGrouping(itemLines, entries, keyIndent);
    i = end;
  }
  return { kind: "unreadable", detail: "the view was not found in the base file" };
}

function viewGrouping(lines: Line[], entries: KeyLine[], keyIndent: number): ViewGrouping {
  const groupBy = entries.find((e) => e.key === "groupBy");
  if (groupBy === undefined) return { kind: "none" };
  if (!isBlank(groupBy.rest)) return { kind: "unreadable", detail: "groupBy is not a block mapping" };

  const childStart = nextContent(lines, groupBy.index);
  const childIndent = lines[childStart]?.indent ?? 0;
  if (childStart >= lines.length || childIndent <= keyIndent) {
    return { kind: "unreadable", detail: "groupBy is not a block mapping" };
  }
  const children = mappingEntries(lines, childStart, blockEnd(lines, groupBy.index, keyIndent), childIndent);
  if (children === null) return { kind: "unreadable", detail: "groupBy has a key the scan cannot read" };
  const property = children.find((e) => e.key === "property");
  const direction = children.find((e) => e.key === "direction");
  if (property === undefined || direction === undefined) {
    return { kind: "unreadable", detail: "groupBy lacks property or direction" };
  }
  const p = scalar(property.rest);
  const d = scalar(direction.rest);
  if (!p.ok || !d.ok || (p.plain && NOT_A_STRING_PLAIN.test(p.value))) {
    return { kind: "unreadable", detail: "groupBy property or direction cannot be read" };
  }
  // Obsidian keeps the grouping only for a non-empty string property and an exact ASC / DESC.
  if (p.value.length === 0 || (d.value !== "ASC" && d.value !== "DESC")) return { kind: "none" };
  return { kind: "grouped", property: p.value, direction: d.value, customOrder: hasListGroupOrder(lines, entries, keyIndent) };
}

/** Whether the view's `groupOrder` is a list (flow `[...]` or block items), which Obsidian treats as a custom group order. */
function hasListGroupOrder(lines: Line[], entries: KeyLine[], keyIndent: number): boolean {
  const order = entries.find((e) => e.key === "groupOrder");
  if (order === undefined) return false;
  if (/^\[/.test(order.rest.trim())) return true;
  if (!isBlank(order.rest)) return false;
  const next = lines[nextContent(lines, order.index)];
  return next !== undefined && next.indent >= keyIndent && /^-(\s|$)/.test(next.text);
}
