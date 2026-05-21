# Contract: properties dedup help-doc + spec reconciliation

**Anchor**: `docs/tools/properties.md` + `src/tools/properties/schema.ts` `.describe()` block.
**FRs satisfied**: FR-011.
**SCs satisfied**: SC-006.

## Pre-edit state

The `properties` help-doc currently asserts case-sensitive dedup with byte-tiebreak ordering — promising two separate entries for fixture property names `AaTest` vs `aatest`. The live runtime collapses them under upstream's case-insensitive convention into one entry with `noteCount: 2`. Agent code written against the doc misses notes. The spec was wrong, not the runtime.

## Reconciliation method

Promote the observed live behaviour to the doc contract. No runtime change — the wrapper already passes upstream's collapsed output through verbatim.

## Edit (both artefacts)

> The `properties` tool returns the union of frontmatter property names across all notes in the vault, deduplicated under upstream's **case-insensitive** convention. Two property names differing only in case (e.g. `AaTest` and `aatest`) collapse to a single entry with `noteCount` summing both contributors. The reported casing in the merged entry is upstream's choice (typically the first-encountered casing in upstream's iteration order, NOT an alphabetical or wrapper-imposed rule). The wrapper does not invent a tiebreaker; the previously-documented case-sensitive dedup with byte-tiebreak ordering claim was incorrect and is **retired** as of BI-041.

## Empirical anchor

Fixture vault layout:
- `notes/AaTest.md` — frontmatter `AaTest: value-1`
- `notes/aatest.md` — frontmatter `aatest: value-2`

Invocation: `properties { vault: "fixture" }`.
Expected response: exactly one entry for the (case-insensitively merged) name with `noteCount: 2`. The reported casing is whichever upstream emits (captured during /speckit-implement T0 probe; the test asserts the count and the collapse, NOT the specific casing).

## Test additions (co-located per Principle II)

In `src/tools/properties/schema.test.ts`:

1. **Case-insensitive collapse claim present**: assert the `.describe()` text on the `properties` schema contains the phrase `"case-insensitive"` AND `"collapse"` (or `"merge"`).
2. **Byte-tiebreak claim retired**: assert the `.describe()` text does NOT contain the phrase `"byte-tiebreak"` (the rebuttal — confirms the old claim is gone).

In `src/tools/properties/handler.test.ts`:

3. **Case-variant collapse fixture**: mock upstream emission representing two notes `AaTest.md` (frontmatter `AaTest`) and `aatest.md` (frontmatter `aatest`); assert the wrapper returns exactly one entry with `noteCount: 2` (collapse confirmed). The reported casing field is asserted with `expect.stringMatching(/aatest/i)` — case-insensitive — because upstream's choice is not under wrapper control.

## What is NOT in this edit

- No runtime change to `properties`. The handler already passes upstream's collapsed output through; the live behaviour is correct, only the doc was wrong.
- No change to the wrapper's iteration / ordering choices. Upstream owns the casing decision.
- No expansion to three-way case variants (`AaTest` + `aaTEST` + `AATEST`) — the spec Edge Cases entry covers the principle; the test fixture is the minimal two-way case. Three-way collapse follows by induction on the case-insensitive convention.

## Spec retirement

The older `properties` spec (likely `specs/024-list-properties/spec.md` based on the cohort numbering) carries the byte-tiebreak claim. As part of this BI's PR, the older spec gets an inline retraction note in its Out-of-Scope or Notes section:

> **Note (retracted by BI-041, 2026-05-21)**: the byte-tiebreak-ordering claim in this spec was incorrect — the live wrapper collapses case-variant property names under upstream's case-insensitive convention. See `specs/041-reconcile-cohort-doc-drift/contracts/properties-dedup.md` for the corrected contract.

The retraction note preserves the older spec's history (does not edit the original claim) while pointing future readers at the corrected contract.
