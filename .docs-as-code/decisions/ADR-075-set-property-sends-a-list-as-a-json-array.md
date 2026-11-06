# ADR-075 — `set_property` sends a list as a JSON array, and an explicit non-list `type` keeps the comma join

- **Status:** Accepted
- **Date:** 2026-11-07
- **Source:** PR #150 (BI-0203, `.specify/bugs/bi-0203/`: assessment, fix
  and test reports, assessment ruling Q1 = B), commits `a9869d7` (the fix)
  and `58c6e6d` (the review's test-table refactor)
- **Related:** spec 018 (`specs/018-write-property/research.md`), whose R2
  keeps user values on the native `property:set` and out of eval source, and
  whose R9 / F13 had accepted comma splitting as a known limitation; R10 /
  FR-018, the literal `[]` for an empty list.

## Context

Until PR #150 `serialiseValue` (`src/tools/set_property/handler.ts`) joined a
non-empty array with commas, and `property:set` cannot split that text back
into the items. Text that starts with `[` but is not a JSON array is stored as
one quoted scalar, so `["[[A]]","[[B]]"]` landed as `related: "[[A]],[[B]]"`
(TC-00904), and plain text is split on every comma, so `["one","two, three"]`
landed as three items (TC-00905). Every such write returned `written: true`.
Spec 018 had characterised the comma case and accepted it; the wikilink case,
the commonest list property in a project vault, was never probed.

PR #150's live probes against the test vault showed that `property:set`
parses a JSON-array `value=` into exactly the items sent (wikilinks, commas,
quotes, non-ASCII, newlines, one-item and empty lists) and does its own YAML
quoting. The information was lost in the wrapper, not upstream.

## Decision

1. **A list goes out as a JSON array.** When the resolved type is `list`
   (inferred from an array, or given explicitly), `serialiseValue` returns
   `JSON.stringify(value)` as one argv element. `JSON.stringify([])` is the
   literal `[]`, so R10 / FR-018 holds without a separate branch.
2. **The wrapper adds no quoting.** The CLI quotes items it finds ambiguous
   (`- "[[A]]"`, `- "#tag"`) and leaves plain items alone, so a plain-word
   list is byte-identical on disk to what the comma join wrote.
3. **An explicit non-list `type` is honoured, not coerced** (ruling Q1 = B).
   A probe showed `value=["a","b"] type=text` writes a list, so the JSON form
   is sent only for `list`. An array with `type: "text"` (or any other
   non-list type) keeps the comma join byte for byte and is stored as the
   text `a,b`; a co-located test locks it.

## Alternatives rejected

- **JSON for every array** (option A, the assessment's recommendation). One
  rule in `serialiseValue`, but a text-typed write would become a list,
  ignoring the type the caller asked for. The owner ruled for B: BI-0203
  puts other property types out of scope, and the `set_property` feature
  note's type-mismatch edge case rules out silent coercion.
- **Write lists through an `eval` calling `processFrontMatter`.** Exact
  items too, but it reverses R2 (user values never in eval source), adds a
  frozen template with its own tests, and routes lists differently from
  scalars. Not needed once the native subcommand was known to take JSON.
- **Escape commas in the joined string.** Already rejected in R9; the CLI has
  no comma escape, and it would not fix the wikilink scalar.

## Consequences

- `set_property`'s schema, descriptions, error roster and fingerprint
  baseline did not move; the change is the `value=` argv of the one
  `property:set` call all three target modes share. No kernel node is
  touched.
- The `value=` argv now carries `"` characters. Dispatch spawns with
  `shell: false`, and the PR #150 live run round-tripped quotes through that
  path to `Obsidian.com` on Windows; non-Windows hosts are covered by unit
  tests only.
- The comma limitation survives in two places by design: an array with an
  explicit non-list `type`, and a string `value` with `type: "list"`
  (`"a,b"`), which passes through verbatim and is comma-split by the CLI.
- Notes damaged by the old join stay damaged until the property is written
  again; a rewrite repairs it, because `property:set` replaces the value.
  The published 0.9.0 package keeps the bug until the next release.
