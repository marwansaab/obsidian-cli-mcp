# ADR-064 — Tags are compared and returned without one leading `#`

- **Status:** Accepted
- **Date:** 2026-11-03
- **Source:** PR #131 (BI-0181, `.specify/bugs/bi-0181/`: assessment, fix
  and test reports, rulings Q1 = A, Q2 = A and Q3 = A), commits `64aef58`
  (the fix) and `c189321` (the PR #131 code-quality review's shared
  fragment)
- **Related:** ADR-046 (shared parameter names within a tool family), whose
  exact-name `name` lookup the property tools keep; ADR-040 (published
  parameter descriptions and server instructions), under which the rule is
  stated in the published surface.

## Context

Obsidian's metadata cache holds a note's frontmatter `tags` in two forms.
After the file watcher parses a note it holds them as written (`bi-0166`).
After the note is updated through Obsidian's own frontmatter writer — for
example when `set_property` changes another property — it holds them with a
leading `#` (`#bi-0166`). The file text has no `#` either way.
`find_by_property` compared the cached value with strict `===`, so a tag
lookup silently missed every note cached in the other form, and its result
changed from call to call as Obsidian refreshed notes. `read_property`
returned whichever form the cache held. Neither failed: the result was a
valid, incomplete answer.

## Decision

1. **Normalise at the reader, not the cache.** For the property named
   exactly `tags`, `find_by_property` removes one leading `#` from the stored
   value (a scalar string, or each string in a list) and from the query
   before comparing, and `read_property` removes it from the value it
   returns. The reported form is the file's: without `#` (Q1 = A).
2. **Only the exact key `tags`.** `Tags`, `tag` and every other property keep
   strict comparison and verbatim values, matching the property family's
   exact-name lookup (Q2 = A, ADR-046).
3. **Exactly one `#`.** `##x` becomes `#x` and is matched only by the query
   `##x`, the same rule the `tag` tool already applied to its input
   (Q3 = A).
4. **One home for the rule.** `src/tools/_tag-hash.ts` exports
   `TAGS_PROPERTY`, `stripTagHash`, `withoutTagHash` and
   `WITHOUT_TAG_HASH_JS`, the same value-level rule as in-eval source.
   `read_property` and `tag`'s input schema import the TypeScript forms;
   `find_by_property`'s frozen template interpolates the fragment as `tg`
   and applies it once to the stored value and once to the query, so its
   `eq` / `arrEq` comparators are unchanged. A parity table in
   `_tag-hash.test.ts` runs the fragment under `node:vm` against
   `withoutTagHash`.

## Alternatives rejected

- **Normalise only the query, by expanding it to both forms.** Exact-array
  matching (`array_match: false`) would need every `#` combination per
  element, and `read_property` would still return two forms.
- **Report tags with `#`** (Obsidian's `getAllTags` form). Consistent, but it
  disagrees with the file text and with what agents write back.
- **Force the cache back to one form**, for example by re-triggering a
  watcher parse after `set_property`. It chases Obsidian's internal refresh
  paths, adds spawns, and still leaves notes edited in the Obsidian UI in the
  `#` form.
- **Case-insensitive `tags` / `Tags` / `tag`, or every property of Obsidian
  type `tags`.** Diverges from the family's exact-name lookup and needs a
  type lookup inside the eval, with no evidence those keys get the `#` form.
- **Strip every leading `#`.** Merges values the file keeps distinct.
- **An inline copy in the eval template** (the fix as first written,
  commit `64aef58`, on the premise that a template cannot import). The
  PR #131 code-quality review argued the fix out of it: templates already
  interpolate shared fragments (`B64_PAYLOAD_DECODE_EXPR`,
  `SORT_SLICE_AND_EMIT`), and two parallel copies were held together only by
  parallel tests.

## Consequences

- `read_property`'s `tags` value is no longer verbatim from the cache: a tag
  written as `'#y'` in the YAML reads back as `y`, the same tag in
  Obsidian's model. The CHANGELOG entry calls this out as a behaviour change.
- `find_by_property`'s `value` description and `read_property`'s tool
  description state the rule, which moved exactly two register-baseline
  fingerprints (`find_by_property.schemaFingerprint`,
  `read_property.descriptionFingerprint`).
- No new error code or sub-code; a silent incomplete result is removed
  (constitution Principle IV).
- `tag/_template.ts`'s `normTag` still carries a third, older inline copy of
  the one-`#` strip. The owner ruled to leave it until the tag template is
  next touched (fix report, Follow-ups).
- Not exercised live: Obsidian's own trigger for the `#` form, which did not
  fire during the PR #131 test session; an MCP-client round trip; macOS and
  Linux. The fix does not depend on how a note reached either form.
