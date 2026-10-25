// Original — no upstream. tags handler — single-spawn invokeCli wrapper around the CLI's native `tags` subcommand (research R2: always `format=json` + `counts`, plus a `file=` / `path=` / `active` scope; `sort` and `total` are never sent). Always routes with target_mode "specific" so invokeCli's active-mode locator strip cannot silently widen a note-scoped request to the whole vault (R3 / ADR-038). Pipeline: "No tags found." sentinel → JSON parse → loose upstream-wire parse → strip exactly one leading `#` and parse string counts strictly → wrapper-side sort (ASCII-only lower-fold, UTF-8 byte order; count-descending first under sortByCount) → optional count projection. ERR_NO_ACTIVE_FILE is re-messaged to point at `file` / `path` (R9); every other failure propagates unchanged through the dispatch classifier.
import { tagsUpstreamArraySchema, type TagEntry, type TagsInput, type TagsOutput } from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

/** Upstream's literal reply when a scope carries no tags (research F3) — exit 0, not JSON. */
export const NO_TAGS_SENTINEL = "No tags found.";

const NO_ACTIVE_FILE_MESSAGE =
  "No active file in Obsidian. Focus a note in the editor, or call tags with `file` or `path` instead of `activeOnly: true`.";

function utf8Compare(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function asciiLowerFold(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * Clarifications Q3 ordering: ASCII-only lower-fold primary key compared by UTF-8
 * bytes, then UTF-8 byte order of the original name. Non-ASCII is never folded,
 * and the order is total — it returns 0 only for identical strings. Kept
 * tool-local rather than importing `files/handler.ts` (research R7, Principle I).
 */
export function compareTagNames(a: string, b: string): number {
  const fa = asciiLowerFold(a);
  const fb = asciiLowerFold(b);
  if (fa !== fb) return utf8Compare(fa, fb);
  return utf8Compare(a, b);
}

function toEntry(entry: { tag: string; count?: string }): { name: string; count: number } {
  const name = entry.tag.startsWith("#") ? entry.tag.slice(1) : entry.tag;
  const raw = entry.count;
  const count = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(count)) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      message: `Tags reply carried an unparseable count for ${JSON.stringify(entry.tag)}: ${JSON.stringify(raw)}`,
      details: { stage: "count-parse", tag: entry.tag, count: raw },
    });
  }
  return { name, count };
}

export async function executeTags(input: TagsInput, deps: ExecuteDeps): Promise<TagsOutput> {
  const activeOnly = input.activeOnly === true;
  const sortByCount = input.sortByCount === true;
  const includeCounts = input.includeCounts !== false;

  const parameters: Record<string, string> = { format: "json" };
  if (input.file !== undefined) parameters.file = input.file;
  if (input.path !== undefined) parameters.path = input.path;
  const flags = activeOnly ? ["counts", "active"] : ["counts"];

  let stdout: string;
  try {
    const result = await invokeCli(
      {
        command: "tags",
        // ADR-038 / research R3: ALWAYS "specific", in both target modes. invokeCli
        // strips file/path from parameters when target_mode is "active", which would
        // silently turn a note-scoped request into a vault-wide listing. In active mode
        // the schema has already guaranteed vault is undefined, so no `vault=` reaches
        // argv and the CLI targets the focused vault — exactly the active-mode routing.
        target_mode: "specific",
        vault: input.vault,
        parameters,
        flags,
      },
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
    );
    stdout = result.stdout;
  } catch (err) {
    if (err instanceof UpstreamError && err.code === "ERR_NO_ACTIVE_FILE") {
      throw new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: err,
        details: { ...err.details, tool: "tags" },
        message: NO_ACTIVE_FILE_MESSAGE,
      });
    }
    throw err;
  }

  const trimmed = stdout.trim();
  if (trimmed === NO_TAGS_SENTINEL) return { total: 0, tags: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      message: `Tags JSON parse failed: ${(cause as Error).message}`,
      details: { stage: "json-parse", stdout: trimmed },
    });
  }

  const shape = tagsUpstreamArraySchema.safeParse(parsed);
  if (!shape.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: shape.error,
      message: "Tags reply did not match the expected [{ tag, count }] shape",
      details: { stage: "shape-parse", stdout: trimmed },
    });
  }

  const entries = shape.data.map(toEntry);
  entries.sort(
    sortByCount
      ? (a, b) => b.count - a.count || compareTagNames(a.name, b.name)
      : (a, b) => compareTagNames(a.name, b.name),
  );
  const tags: TagEntry[] = includeCounts ? entries : entries.map(({ name }) => ({ name }));
  return { total: tags.length, tags };
}
