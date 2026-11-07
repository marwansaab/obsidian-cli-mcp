// Original — no upstream. query_base's grouped-view values (BI-0207, owner ruling 2026-11-07): maps a view's `groupBy.property` to the value source the eval templates read, reads each row's group value from Obsidian in read-only eval batches (planned by the shared `planEvalBatches` under EVAL_BATCH_CODE_MAX, paths grouped by folder, spec 088 F10), and checks each answer at the boundary: the row count, one collator locale across batches that this server's ICU supports, and every value mirrorable (group-order.ts orders them). A value, property or locale the mirror cannot match fails the call with CLI_REPORTED_ERROR / details.code GROUPING_UNSUPPORTED; a failed batch fails it with the eval's own typed error. Nothing falls back to ungrouped rows (Principle IV).
import { FILE_GROUP_TEMPLATE, NOTE_GROUP_TEMPLATE } from "./_template.js";
import { groupingUnsupported, type Value } from "./group-order.js";
import { queryBaseGroupValuesSchema, type QueryBaseGroupValue } from "./schema.js";
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

/**
 * Each path's group value from Obsidian, in order, and the locale Obsidian orders groups in, checked: every value
 * mirrorable, then the locale one this server's ICU supports (so groupRows can trust it).
 */
export async function readGroupValues(
  source: GroupSource,
  paths: readonly string[],
  vault: string | undefined,
  deps: InvokeCliDeps,
): Promise<{ locale: string; values: Value[] }> {
  let locale: string | null = null;
  const answered: QueryBaseGroupValue[] = [];
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
    answered.push(...answer.values);
  }
  if (locale === null) {
    throw new UpstreamError({
      code: "INTERNAL_ERROR",
      cause: null,
      details: { stage: "group-values" },
      message: "query_base: readGroupValues needs at least one row path",
    });
  }
  const values = answered.map((value, i) => mirrored(value, paths[i]!));
  if (Intl.Collator.supportedLocalesOf([locale]).length === 0) {
    throw groupingUnsupported("collator-locale", { locale }, `Obsidian orders groups in locale "${locale}", which this server cannot match`);
  }
  return { locale, values };
}

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
