// Original — no upstream. query_base's grouped-view rows (BI-0207, owner ruling 2026-11-07): reads each row's group value from Obsidian in read-only eval batches (planned by the shared `planEvalBatches` under EVAL_BATCH_CODE_MAX, paths grouped by folder, spec 088 F10) and groups and orders the rows the way Obsidian 1.15's BasesQueryResult.groupedData does, which this module mirrors from Obsidian's own code:
// - groups are made in row order; a row joins the first group whose key loosely equals its value (Value.looseEquals, looking first among groups whose key prints the same), else starts a new group;
// - the groups are then stably sorted: two keyed groups by Number difference when both keys are numbers, else by their printed keys under Intl.Collator {usage: "sort", sensitivity: "base", numeric: true} in Obsidian's locale, times -1 for DESC; the null group goes last in both directions.
// Within a group the rows keep upstream's order. A value or property this mirror cannot match fails the call with CLI_REPORTED_ERROR / details.code GROUPING_UNSUPPORTED; a failed batch fails it with the eval's own typed error. Nothing falls back to ungrouped rows (Principle IV).
import {
  DATE_ONLY_PATTERN,
  DATE_TIME_PATTERN,
  FILE_GROUP_TEMPLATE,
  LINK_TEXT_PATTERN,
  NOTE_GROUP_TEMPLATE,
} from "./_template.js";
import {
  queryBaseGroupValuesSchema,
  type QueryBaseGroupListElement,
  type QueryBaseGroupValue,
} from "./schema.js";
import { invokeEval, type InvokeCliDeps } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { decodeEvalEnvelope } from "../_active-file.js";
import { EVAL_BATCH_CODE_MAX, planEvalBatches, type EvalBatch } from "../_eval-batches.js";
import { composeEvalCode } from "../_shared.js";

/** The longest composed eval code one group-value batch may send: the shared eval batch limit. */
export const GROUP_VALUES_CODE_MAX = EVAL_BATCH_CODE_MAX;

/** The file properties the mirror reads; any other `file.*` grouping is unsupported. */
const FILE_PROPERTIES = new Set(["folder", "ext", "tags", "ctime", "mtime"]);

/** Which value a grouping reads: a frontmatter property (`note`) or a file property (`file`, lower-cased). */
export interface GroupSource {
  kind: "note" | "file";
  name: string;
}

export function groupingUnsupported(reason: string, details: Record<string, unknown>, message: string): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { code: "GROUPING_UNSUPPORTED", reason, ...details },
    message: `query_base: ${message}`,
  });
}

/**
 * The value source of a `groupBy.property`, read the way Obsidian reads property ids: `note.`, `file.` and
 * `formula.` prefixes name their kind, anything else is a note property. Throws GROUPING_UNSUPPORTED for a
 * formula or a file property the mirror does not read.
 */
export function groupSource(property: string): GroupSource {
  const dot = property.indexOf(".");
  const prefix = dot < 0 ? "" : property.slice(0, dot);
  if (prefix === "file" || property === "file") {
    const name = dot < 0 ? "file" : property.slice(dot + 1).toLowerCase();
    if (FILE_PROPERTIES.has(name)) return { kind: "file", name };
  } else if (prefix !== "formula") {
    return { kind: "note", name: prefix === "note" ? property.slice(dot + 1) : property };
  }
  throw groupingUnsupported(
    "property",
    { property },
    `grouping by "${property}" is not supported; query_base reports groups for note properties and for file.folder, file.ext, file.tags, file.ctime and file.mtime`,
  );
}

function splitPath(path: string): [string, string] {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? ["", path] : [path.slice(0, slash), path.slice(slash + 1)];
}

function batchCode(source: GroupSource, batch: EvalBatch<string>): string {
  return composeEvalCode(source.kind === "note" ? NOTE_GROUP_TEMPLATE : FILE_GROUP_TEMPLATE, {
    p: source.name,
    f: batch,
  });
}

/** The batches for `paths`, in order, as [folder, names] tuples; a path that would take a batch past the limit starts the next one. */
export function planGroupBatches(source: GroupSource, paths: readonly string[]): Array<EvalBatch<string>> {
  return planEvalBatches(paths, splitPath, (batch) => batchCode(source, batch));
}

/** Each path's group value from Obsidian, in order, and the locale Obsidian orders groups in. */
export async function readGroupValues(
  source: GroupSource,
  paths: readonly string[],
  vault: string | undefined,
  deps: InvokeCliDeps,
): Promise<{ locale: string; values: Value[] }> {
  let locale: string | null = null;
  const values: QueryBaseGroupValue[] = [];
  for (const batch of planGroupBatches(source, paths)) {
    const result = await invokeEval({ code: batchCode(source, batch), vault }, deps);
    const answer = decodeEvalEnvelope(result, queryBaseGroupValuesSchema, {
      toolName: "query_base",
      malformedCode: "CLI_REPORTED_ERROR",
    });
    const asked = batch.reduce((n, [, names]) => n + names.length, 0);
    if (answer.values.length !== asked) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-parse", asked, answered: answer.values.length },
        message: "query_base: group-value eval answered for a different set of rows",
      });
    }
    if (locale !== null && answer.locale !== locale) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-parse", locales: [locale, answer.locale] },
        message: "query_base: group-value eval batches reported different collator locales",
      });
    }
    locale = answer.locale;
    values.push(...answer.values);
  }
  if (locale === null) {
    throw new UpstreamError({
      code: "INTERNAL_ERROR",
      cause: null,
      details: { stage: "group-values" },
      message: "query_base: readGroupValues needs at least one row path",
    });
  }
  return { locale, values: values.map((value, i) => mirrored(value, paths[i]!)) };
}

// --- The mirror of Obsidian's Value semantics --------------------------------------------------

/** A list element whose value the mirror can match. */
export interface ListElement {
  v: Value;
  w?: QueryBaseGroupListElement["w"];
}

/** A mirrorable group value: the eval's forms without {u}, at any depth. */
export type Value = Exclude<QueryBaseGroupValue, null | { u: string } | { a: unknown }> | { a: ListElement[] } | null;

/** `value` as a mirrorable Value; throws for a {u} form at any depth (a gone note, or a value the mirror cannot match). */
function mirrored(value: QueryBaseGroupValue, path: string): Value {
  if (value === null) return null;
  if ("u" in value) {
    if (value.u === "note-not-found") {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "group-values", reason: "note-not-found", path },
        message: `query_base: "${path}" is no longer in the vault, so its group cannot be read; run the query again`,
      });
    }
    throw groupingUnsupported("value-type", { path, value_type: value.u }, `the group value of "${path}" (${value.u}) is not supported`);
  }
  if ("a" in value) return { a: value.a.map((e) => ({ ...e, v: mirrored(e.v, path) })) };
  return value;
}

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

/** Obsidian's grouping of `values` (one per row, in row order) and its group order for `direction`. */
export function groupRows(values: readonly Value[], direction: "ASC" | "DESC", locale: string): RowGroup[] {
  if (Intl.Collator.supportedLocalesOf([locale]).length === 0) {
    throw groupingUnsupported("collator-locale", { locale }, `Obsidian orders groups in locale "${locale}", which this server cannot match`);
  }
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
