# Contract: read_property malformed-frontmatter spec + help-doc unification

**Anchor**: `docs/tools/read_property.md` + `src/tools/read_property/schema.ts` `.describe()` block.
**FRs satisfied**: FR-010.
**Authorising decision**: spec Clarifications Q2 (Option A) + Assumption A11.

## Pre-edit state

Two artefacts disagree on the malformed-YAML-frontmatter contract:
- Spec text (somewhere in `src/tools/read_property/schema.ts` `.describe()` or the older feature spec at `specs/013-read-property/spec.md`): says one shape.
- Help-doc text (`docs/tools/read_property.md`): says another shape.

The two candidate shapes per spec Story 5:
- (i) Empty value with `type: "unknown"` (e.g. `{ value: null, type: "unknown" }`).
- (ii) Typed error code (e.g. `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `details.code: "MALFORMED_FRONTMATTER"` or similar).

## Reconciliation method

T0 probe (research.md Task 3) captures the live wire shape against a fixture note with intentionally broken YAML frontmatter (e.g. `malformed-frontmatter.md` body `---\nkey: value: with: stray: colons\n---\n# Heading`). The captured shape is the single source of truth. Both spec and help-doc reconcile to it byte-for-byte.

## Branch A — captured shape is (i) empty-value-`type:"unknown"`

### Edit (both artefacts)

> When the wrapper handles a note with malformed YAML frontmatter, the response carries `{ value: null, type: "unknown" }` (or the verbatim captured shape — substitute exact bytes during /speckit-implement). The `type: "unknown"` discriminator signals that the wrapper successfully reached the note but could not parse the frontmatter to determine the property's type. Agents recovering from this surface should treat `type: "unknown"` as the failed-read signal and avoid assuming the property is absent.

### Principle IV gate

`/speckit-analyze` rules whether this shape satisfies Principle IV's intentional-best-effort-continue clause (the wrapper reports what succeeded — the note was reached, the property name was located — AND what failed — the type is unknown because the frontmatter would not parse). If yes, no Complexity Tracking entry is needed. If no, the conditional row in `plan.md` Complexity Tracking is populated, citing spec Clarifications Q2 as the authorising decision per Principle IV's "Clarifications entry, ADR, or referenced issue" clause.

## Branch B — captured shape is (ii) typed error code

### Edit (both artefacts)

> When the wrapper handles a note with malformed YAML frontmatter, the response carries `code: CLI_REPORTED_ERROR` with `details.code: <captured>` (substitute exact code during /speckit-implement) and `details.<captured-fields>`. Agents recovering from this surface should handle it as a typed upstream error per the project's general error-handling pattern.

### Principle IV gate

Trivially satisfied — the shape is a typed UpstreamError. No Complexity Tracking entry needed.

## Test additions (co-located per Principle II)

In `src/tools/read_property/schema.test.ts`:

1. **Malformed-frontmatter contract text present**: assert the `.describe()` text on the `read_property` schema contains a phrase matching the captured shape (e.g. `"type: \"unknown\""` for Branch A, or `"details.code: \"<captured>\""` for Branch B). Brittle-string assertion tolerated per Principle III.
2. **Spec ↔ help-doc agreement**: assert the schema `.describe()` text and the `docs/tools/read_property.md` text both contain the captured-shape phrase. (Implementation: read both files in the test setup; perform substring search on both.)

In `src/tools/read_property/handler.test.ts`:

- No new tests needed for the runtime path (no runtime change per Q2 Option A). The existing handler tests already exercise the current shape.

## What is NOT in this edit

- No runtime change to `read_property`. Out-of-Scope per spec + Clarifications Q2 Option A.
- No change to the cohort tools' input schemas.
- No expansion to other tools with potential frontmatter-parsing concerns (e.g. `properties`, `find_by_property`). The reconciliation is `read_property`-only per spec scope.

## Plan-phase deliverable

During /speckit-plan re-evaluation (Phase 1 second Constitution Check), the Complexity Tracking row in `plan.md` is left as conditional. It is populated or removed at /speckit-implement time once T0 probe captures the actual shape and /speckit-analyze rules on the Principle IV gate.
