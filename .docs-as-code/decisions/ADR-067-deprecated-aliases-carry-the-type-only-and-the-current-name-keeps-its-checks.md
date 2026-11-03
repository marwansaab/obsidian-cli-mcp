# ADR-067 — Deprecated aliases carry the type only, and the current name keeps its checks

- **Status:** Accepted
- **Date:** 2026-11-03
- **Source:** PR #135 (BI-0182, `.specify/bugs/bi-0182/`: assessment, fix
  and test reports, owner rulings Q1 = A, Q2 = A, Q3 = A and, during the
  PR #135 code-quality review, Q4 = A), commits `84f0c1b` (the fix) and
  `bb6935f` (the review fixes)
- **Related:**
  [ADR-046](ADR-046-shared-parameter-names-within-a-tool-family.md) (Shared
  Parameter Names Within a Tool Family), whose Decision 5 ("validation of the
  resolved value reports the new name") this record makes true for empty
  values and narrows for calls with more than one mistake; ADR-015
  (Sub-Discriminators via details.reason for Multi-State Error Codes), whose
  `INVALID_SUBFOLDER` sub-states stay as they are

## Context

Spec 073 (PR #101) renamed seven parameters and keeps the old names as
deprecated aliases until the next major release. Each tool's input schema is
a published object that declares both names, a transform
(`foldDeprecatedAliases`) that moves an old-name value onto its replacement,
and a pipe into the new-name schema (see
[architecture](../architecture.md#renamed-parameters-deprecated-aliases-folded-before-validation)).

Two of the alias fields, `find_by_property.property` and `create_base.view`,
were declared with the same `z.string().min(1)` as their new-name twins. zod
checks the published object before the transform runs, so `property: ""`
failed at `["property"]` and `view: ""` at `["view"]`, where `name: ""` and
`view_name: ""` failed at the new name. ADR-046 Decision 5, spec 073 research
D6 and the help pages said the new name is reported whichever key was used.
The second case was found during assessment; the report named only the
first.

## Decision

1. **An alias field carries the value's type only, never a value check**
   (Q3 = A). `property` and `view` became `deprecatedAlias(z.string(), …)`.
   The folded new-name schema already checks the resolved value, so the
   check runs once, under the new name. The rule is written once, in the doc
   comment of `deprecatedAlias` in `src/tools/_deprecated-params.ts`, so the
   next rename (ADR-046 Decision 6) meets it at the helper rather than in a
   copied call-site comment.
2. **A wrong-typed old-name value still reports the old key** (Q3 = A). The
   type check stays on the alias, so `arrayMatch: "x"` or `path: 5` fails at
   the old key, before the fold. Remapping those issues was ruled out of
   scope.
3. **The current-name keys keep their published checks** (Q4 = A).
   `find_by_property.name` and `create_base.view_name` keep `.min(1)` on the
   published object. An issue there stops the pipe before the folded
   schema's refinements run, so a call with two mistakes behaves differently
   by name: the old-name call reports both, the current-name call reports
   only the first. Every issue names the current key, which is what ADR-046
   Decision 5 requires; issue-list parity is guaranteed only for a call with
   one mistake.
4. **The `deprecated_parameters` notice is for successful calls only**
   (Q2 = A). Spec 073 FR-011 already said so and the code already behaved so;
   the tool descriptions and help pages now say it. The description line is
   built by `deprecatedNamesNote(renames)` from each tool's `*_RENAMES` table,
   byte-identical to the three hand-written lines it replaced.
5. **`find_and_replace`'s folder errors keep `INVALID_SUBFOLDER` and
   `details.subfolder`** (Q1 = A) until the next major release, per ADR-046's
   Consequences. The help page now says so; the messages name `folder`.

## Alternatives rejected

- **Move the current-name checks into the folded schema** (Q4 = B). Both
  names would then fail with identical issue lists however many mistakes a
  call has, but the published JSON Schema of `name` and `view_name` would
  lose `minLength: 1`, a weaker contract for every caller on the current
  names to buy parity for callers on names that are going away.
- **Report the deprecation notice on error responses too** (Q2). It would
  add a field to the error envelope of three tools; FR-011 scoped the notice
  to successful results.
- **Rename `INVALID_SUBFOLDER` and `details.subfolder` now** (Q1). A breaking
  change to a stable machine-readable surface, which ADR-046 deferred to the
  major release that removes the old names.

## Consequences

- `property: ""` and `view: ""` fail with the same `VALIDATION_ERROR` issue
  as `name: ""` and `view_name: ""`, at the new name. No new error code,
  sub-code or reason (constitution Principle IV).
- The published input schema moved deliberately: the deprecated `property`
  and `view` keys lost `minLength: 1`, and the three descriptions gained the
  success-only wording. `src/tools/_register-baseline.json` was regenerated
  for those three entries (the FR-018 fingerprint gate).
- `deprecatedAliasCases` in `src/tools/_deprecated-params-test-cases.ts`
  takes an optional invalid value per replacement and builds parity rows
  (old-name and new-name payloads must fail with identical issues). They
  cover `property`, `view`, `path` and `subfolder`; restoring `.min(1)` on
  either alias fails them. One schema test per tool pins the two-mistake
  behaviour of Decision 3.
- ADR-046 Decision 5 still reads "the call's result carries
  `deprecated_parameters`" without "successful". This repository's ADR-046
  is a byte-equal mirror of the vault's canonical copy, so it is not edited
  here; Decision 4 above is the narrower statement.
- Not exercised live: validation fails before anything is spawned, so no
  MCP client or Obsidian CLI run was needed.
