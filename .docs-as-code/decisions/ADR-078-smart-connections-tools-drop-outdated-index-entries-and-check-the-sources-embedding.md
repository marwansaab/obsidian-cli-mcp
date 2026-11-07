# ADR-078 — Smart Connections tools drop outdated index entries and check the source's embedding

- **Status:** Accepted
- **Date:** 2026-11-07
- **Source:** PR #156 (BI-0195, `.specify/bugs/bi-0195/assessment.md` Q1
  and Q2, `fix.md`, `test.md`), commits `e18b173`, `096825e`
- **Related:** ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency
  Pattern), whose lifecycle stages and their order are unchanged and whose
  `SOURCE_NOT_INDEXED` wording this decision widens (see Consequences).
  ADR-015, whose `details.code` set is unchanged. [ADR-055](ADR-055-smart-connections-tools-fetch-a-fixed-candidate-list-before-sorting.md),
  whose single cut to `limit` the new filters run ahead of.

## Context

The 0.9.0 black-box run found two failures in the Smart Connections tools
(TC-00892, TC-00899, TC-00225).

1. **A listed source with no embedding.** Smart Connections 4.7.2 adds a
   note to `env.smart_sources.items` before it embeds it, and may never embed
   a very short one. `smart_connections_similar`'s Stage 5 asked only whether
   the entry existed and had `find_connections`, so it called the plugin,
   whose `nearest()` threw `Invalid vector input to nearest()`. The caller got
   dispatch's untyped `CLI_REPORTED_ERROR` with no `details.code`, not the
   documented `SOURCE_NOT_INDEXED`.
2. **One outdated index entry failed the call.** After a note was moved, the
   plugin returned a candidate with an empty key. `TO_MATCH_JS` turned it into
   `path: ""`, which fails `matchEntrySchema` (`path` ends in `.md`), so the
   whole call failed at `envelope-parse`. Both templates passed every
   finite-scored candidate through. Whether a moved or deleted note can also
   leave an entry under its old, non-empty path was not confirmed live and not
   ruled out.

## Decision

1. **Check the plugin's own condition before calling it.**
   `smart_connections_similar`'s Stage 5 also emits `SOURCE_NOT_INDEXED`,
   with the resolved path as `detail`, when the source's `vec` is not an array
   or typed array. That is the condition on which `nearest()` throws. Reading
   the `vec` getter cannot throw in 4.7.2 and changes no plugin state. The
   handler's existing mapping is reused unchanged.
2. **Drop outdated entries inside the eval, before the sort and the cut.**
   Each template filters its candidates ahead of `SORT_SLICE_AND_EMIT`, so the
   leading-slice, tie-break, `count` and `total` rules count only kept
   matches.
3. **Different filters for the two tools** (owner ruling 2026-11-07,
   "Filter old paths in similar only"):
   - `smart_connections_similar` keeps a match only when
     `app.vault.getAbstractFileByPath(path)` is a file with extension `md`.
     That drops empty keys, the old paths of moved or deleted notes, and
     non-note candidates.
   - `smart_connections_query` drops only empty paths. Every non-empty path
     still passes through verbatim with no vault lookup, keeping BI-0074 Q2's
     pass-through (TC-00261).
   - Each template's header comment names the ruling, so the two filters are
     not merged later. The filters stay in the templates, not in the cohort
     leaf `_smart-connections.ts`, because each tool keeps its own rule.

## Alternatives rejected

- **Catch the plugin's throw and match its message.** A `try/catch` on
  `Invalid vector input to nearest()` ties the classification to the
  plugin's message text, and a broad catch would hide other plugin failures
  as "not indexed" (constitution Principle IV).
- **A new error code for "listed, not embedded yet".** The caller's recovery
  is the same as for "not indexed" (wait for the plugin's pass), and ADR-015's
  code set would grow for no caller-visible distinction.
- **The vault-note filter in both tools** (assessment Q1 option A for both).
  It would end the query tool's documented pass-through of non-empty stale
  paths; the owner kept that behaviour for `smart_connections_query`.
- **Only the empty-path filter in both tools** (Q1 option B). It fixes the
  observed failure but leaves `smart_connections_similar` returning an old
  path that no longer names a note, as a valid-looking match.
- **One shared filter in the cohort leaf.** The two rules differ by ruling,
  so a shared helper would have to take the rule as a parameter or force the
  tools into one rule.

## Consequences

- An unembedded source now fails as `SOURCE_NOT_INDEXED` naming the note and
  returns results once the plugin embeds it (about 20 s later for an
  eight-paragraph note in `test.md`). A one-line note kept the typed failure
  for the whole 244 s probe.
- `SOURCE_NOT_INDEXED` now means "no entry in the plugin's index, or an entry
  with no embedding yet". ADR-014 (in the gitignored `.decisions/`) says only
  the first. The assessment recommends an amendment line there; that is the
  owner's call, and no new code was added.
- The check reads `src.vec`, a public getter in 4.7.2. If a later plugin
  version renamed it, every source would read as not indexed: a typed,
  documented failure rather than a wrong result.
- `count` can be below `limit` when the plugin returned outdated entries,
  like the existing non-finite-score drop and self-exclusion. The drop is
  silent: no envelope code marks it.
- `smart_connections_similar` makes one in-memory `getAbstractFileByPath`
  call per candidate, at most `MAX_LIMIT` (100), inside the existing eval. No
  extra spawn.
- No handler, schema, error code, description or fingerprint changed.
- Not shown live in PR #156 (`test.md` Residual Risks): an empty key on the
  query side and a non-empty stale old path. Both are pinned in-process, by
  `smart_connections_query/_template.stale-entry.test.ts` and the BI-0195
  rows of the similar template and lifecycle suites.
