// Original — no upstream. tags handler — single-spawn invokeCli wrapper around the CLI's native `tags` subcommand: always sends `format=json counts` (plus `file=` / `path=` / `active` for a single-note scope) through the optional-`vault` facade idiom (`target_mode: "specific"`, so file/path are never stripped — research D2). Wrapper transforms: empty sentinel `No tags found.` (T0 P2) is treated as `[]`, so both yield { total: 0, tags: [] }; JSON parse via the shared parseCliJson + upstream-shape validation (`CLI_REPORTED_ERROR`, details.stage json-parse / upstream-shape); digit-string count → integer (T0 P1); exactly one leading `#` stripped (FR-013); shared compareNames sort (case-insensitive primary, UTF-16 code-unit tiebreak; count-descending first under sortByCount — FR-011); count projection under includeCounts: false (FR-009); defensive tagsOutputSchema parse. The only catch re-throws ERR_NO_ACTIVE_FILE with the same code, cause and details and a tags-specific recovery message (FR-016); every other failure (unknown vault, missing note, output cap, dispatch codes) propagates unchanged.
import { tagsOutputSchema, tagsUpstreamArraySchema, type TagsInput, type TagsOutput } from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { parseCliJson } from "../_cli-json.js";
import { compareNames } from "../_collation.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

/** Upstream's plain-text empty-result signal for both scopes (T0 probe P2, 2026-10-24). */
export const EMPTY_TAGS_SENTINEL = "No tags found.";

export const TAGS_NO_ACTIVE_FILE_MESSAGE =
  "No active file in Obsidian. Open a note in the editor, or call tags with `file` or `path` instead of `activeOnly`.";

/** Remove exactly one leading `#` (FR-013); every other character is left as-is. */
export function stripLeadingHash(name: string): string {
  return name.startsWith("#") ? name.slice(1) : name;
}

export async function executeTags(input: TagsInput, deps: ExecuteDeps): Promise<TagsOutput> {
  const parameters: Record<string, string> = { format: "json" };
  if (input.file !== undefined) parameters.file = input.file;
  if (input.path !== undefined) parameters.path = input.path;
  const flags = ["counts"];
  if (input.activeOnly === true) flags.push("active");

  let stdout: string;
  try {
    ({ stdout } = await invokeCli(
      {
        command: "tags",
        vault: input.vault,
        parameters,
        flags,
        target_mode: "specific",
      },
      {
        spawnFn: deps.spawnFn,
        env: deps.env,
        logger: deps.logger,
        queue: deps.queue,
      },
    ));
  } catch (err) {
    // The dispatch-layer message advises `target_mode: "specific"`, which tags
    // does not have; re-message with the tags recovery hint, same code.
    if (err instanceof UpstreamError && err.code === "ERR_NO_ACTIVE_FILE") {
      throw new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: err,
        details: err.details,
        message: TAGS_NO_ACTIVE_FILE_MESSAGE,
      });
    }
    throw err;
  }

  // The empty sentinel is the same result as an empty JSON array, so it joins
  // the normal pipeline instead of returning early.
  const trimmed = stdout.trim();
  const parsed = trimmed === EMPTY_TAGS_SENTINEL ? [] : parseCliJson(trimmed, "Tags");

  const upstream = tagsUpstreamArraySchema.safeParse(parsed);
  if (!upstream.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: upstream.error,
      message: "Tags upstream output did not match the expected [{ tag, count }] shape",
      details: {
        stage: "upstream-shape",
        stdout: trimmed,
        issues: upstream.error.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      },
    });
  }

  // Sort on upstream counts before projection, so sortByCount still applies
  // when includeCounts is false (FR-011).
  const entries = upstream.data
    .map((e) => ({ name: stripLeadingHash(e.tag), count: Number(e.count) }))
    .sort(
      input.sortByCount === true
        ? (a, b) => b.count - a.count || compareNames(a.name, b.name)
        : (a, b) => compareNames(a.name, b.name),
    );
  const tags = input.includeCounts === false ? entries.map(({ name }) => ({ name })) : entries;
  return tagsOutputSchema.parse({ total: tags.length, tags });
}
