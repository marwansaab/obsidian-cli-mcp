// Original — no upstream. query_base's mirror of Obsidian 1.15's group order (BI-0207, owner ruling 2026-11-07): the Value semantics (Value.toString, Value.looseEquals) and BasesQueryResult.groupedData, mirrored from Obsidian's own code. Pure: no I/O; group-values.ts reads the values from Obsidian and checks them (including the collator locale) before they reach this module.
// - groups are made in row order; a row joins the first group whose key loosely equals its value (Value.looseEquals, looking first among groups whose key prints the same), else starts a new group;
// - the groups are then stably sorted: two keyed groups by Number difference when both keys are numbers, else by their printed keys under Intl.Collator {usage: "sort", sensitivity: "base", numeric: true} in Obsidian's locale, times -1 for DESC; the null group goes last in both directions.
// Within a group the rows keep upstream's order. A comparison this mirror cannot match fails the call with CLI_REPORTED_ERROR / details.code GROUPING_UNSUPPORTED; nothing falls back to ungrouped rows (Principle IV).
import { DATE_ONLY_PATTERN, DATE_TIME_PATTERN, LINK_TEXT_PATTERN } from "./_template.js";
import { UpstreamError } from "../../errors.js";

import type { QueryBaseGroupListElement, QueryBaseGroupValue } from "./schema.js";

/** The GROUPING_UNSUPPORTED failure: a grouping, value or locale query_base cannot mirror. */
export function groupingUnsupported(reason: string, details: Record<string, unknown>, message: string): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { code: "GROUPING_UNSUPPORTED", reason, ...details },
    message: `query_base: ${message}`,
  });
}

/** A list element whose value the mirror can match. */
export interface ListElement {
  v: Value;
  w?: QueryBaseGroupListElement["w"];
}

/** A mirrorable group value: the eval's forms without {u}, at any depth. */
export type Value = Exclude<QueryBaseGroupValue, null | { u: string } | { a: unknown }> | { a: ListElement[] } | null;

/** Obsidian's `Value.toString()`. */
export function valueText(v: Value): string {
  if (v === null) return "null";
  if ("n" in v) return String(v.n);
  if ("b" in v) return String(v.b);
  if ("l" in v) return `[[${v.l}${v.y !== null ? `|${v.y}` : ""}]]`;
  if ("a" in v) return v.a.map((e) => ("w" in e ? String(e.w) : valueText(e.v))).join(", ");
  return v.s;
}

/** The `data` of a primitive-backed value (String, Number, Boolean and Link extend Obsidian's primitive class). */
function primitiveData(v: Value): string | number | boolean | undefined {
  if (v === null || "a" in v || "d" in v) return undefined;
  if ("n" in v) return v.n;
  if ("b" in v) return v.b;
  if ("l" in v) return v.l;
  return v.s;
}

/**
 * A plain string Obsidian would re-parse when comparing it with a date or a link. Value conversion turns such
 * strings into dates and links before they reach a comparison (NOTE_GROUP_TEMPLATE uses the same patterns), so this
 * only guards against a mirror gap.
 */
function reparsedString(e: Value, as: "date" | "link"): string | null {
  if (e === null || !("s" in e) || "d" in e) return null;
  const hit = as === "date" ? DATE_TIME_PATTERN.test(e.s) || DATE_ONLY_PATTERN.test(e.s) : LINK_TEXT_PATTERN.test(e.s);
  return hit ? e.s : null;
}

/** `t.looseEquals(e)` for one Value class. */
function looseFrom(t: Value, e: Value): boolean {
  if (t === null) return false;
  if ("a" in t) {
    if (e !== null && "a" in e) return compareLists(t.a, e.a);
    return t.a.length === 1 && looseEquals(t.a[0]!.v, e);
  }
  if ("d" in t) {
    const s = reparsedString(e, "date");
    if (s !== null) throw groupingUnsupported("value-type", { value: s }, `the group value "${s}" needs date parsing the mirror cannot match`);
    if (e === null || !("d" in e)) return false;
    return !t.t || !e.t ? t.o === e.o : t.d === e.d;
  }
  if ("l" in t) {
    if (e !== null && "l" in e) return t.r !== null && e.r !== null ? t.r === e.r : t.l === e.l;
    const s = reparsedString(e, "link");
    if (s !== null) throw groupingUnsupported("value-type", { value: s }, `the group value "${s}" needs link resolution the mirror cannot match`);
    return false;
  }
  // String, Number and Boolean: JavaScript loose equality on the data, against any primitive-backed value.
  const other = primitiveData(e);
  // Loose `==` on purpose: Obsidian's PrimitiveValue.looseEquals is `this.data == t.data`.
  return other !== undefined && primitiveData(t) == other;
}

/** Obsidian's `Value.looseEquals(t, e)`: the same null, or either side's looseEquals. */
export function looseEquals(t: Value, e: Value): boolean {
  if (t === null && e === null) return true;
  return looseFrom(t, e) || looseFrom(e, t);
}

/** ListValue.compare with looseEquals: raw-identical primitive elements match without conversion. */
function compareLists(x: ListElement[], y: ListElement[]): boolean {
  if (x.length !== y.length) return false;
  return x.every((ex, i) => {
    const ey = y[i]!;
    if ("w" in ex && "w" in ey && ex.w === ey.w) return true;
    return looseEquals(ex.v, ey.v);
  });
}

export interface RowGroup {
  key: Value;
  rows: number[];
}

/**
 * Obsidian's grouping of `values` (one per row, in row order) and its group order for `direction`. `locale` is
 * Obsidian's collator locale, already checked against this server's ICU by readGroupValues.
 */
export function groupRows(values: readonly Value[], direction: "ASC" | "DESC", locale: string): RowGroup[] {
  const groups: RowGroup[] = [];
  const byText = new Map<string, RowGroup[]>();
  values.forEach((value, row) => {
    const text = valueText(value);
    let group = byText.get(text)?.find((g) => looseEquals(g.key, value));
    if (group === undefined) {
      group = groups.find((g) => looseEquals(g.key, value));
      if (group === undefined) {
        group = { key: value, rows: [] };
        groups.push(group);
      }
      const same = byText.get(text) ?? [];
      if (!same.includes(group)) same.push(group);
      byText.set(text, same);
    }
    group.rows.push(row);
  });

  const { compare } = new Intl.Collator(locale, { usage: "sort", sensitivity: "base", numeric: true });
  const sign = direction === "ASC" ? 1 : -1;
  return groups.sort((x, y) => {
    if (x.key !== null && y.key !== null) {
      const diff = "n" in x.key && "n" in y.key ? x.key.n - y.key.n : compare(valueText(x.key), valueText(y.key));
      return diff * sign;
    }
    return x.key !== null ? -1 : y.key !== null ? 1 : 0;
  });
}
