# Contract: Predecessor spec retirements (Stories 1 & 2)

**Stories**: User Story 1 (`read_property` malformed-frontmatter), User Story 2 (`properties` dedup)
**Surface**: feature-spec files of the predecessor BIs
**Runtime change**: none

## Story 1 — `specs/013-read-property/spec.md` AC9 retirement

**Touched section**: User Story 1 → Acceptance Scenarios → scenario 9 (line 35 as of 2026-05-21).

**Before**:
> 9. **Given** a note whose frontmatter block is malformed (for example missing the closing `---` fence), **When** the agent reads any property, **Then** the call fails with a structured error.

**After**:
> 9. **Given** a note whose frontmatter block is malformed (for example missing the closing `---` fence, stray colons inside flow-mapping values, or unmatched brackets), **When** the agent reads any property, **Then** the response is `{ value: null, type: "unknown" }` — the wrapper does not distinguish the malformed-frontmatter case from the absent-property case. (Behaviour captured by BI-041 T0 probe T005 and authorised under Principle IV's intentional-best-effort-continue clause per BI-041 plan §Complexity Tracking.)

**Cross-references to retain unchanged**: BI-041 plan's Complexity Tracking entry remains the authoritative Principle IV decision record. No new ADR is created by this edit.

**Cross-references to add**: One forward-pointer line near the AC9 edit citing BI-041 plan as the source of the Principle IV authorisation.

## Story 2 — `specs/024-list-properties/spec.md` dedup-FR retirement

**Touched sections**: Every functional requirement that promises case-sensitive dedup of property names. The exact FR identifiers and counts are settled during `/speckit-implement` by reading the current `specs/024-list-properties/spec.md`. Expected scope (per the BI-041 plan's properties touched-file list):
- The FR that names case-sensitive dedup as the contract.
- The FR that names the byte-order tiebreak rule.
- Any acceptance scenario whose Given/When/Then implies case-sensitive distinction between property names.

**Replacement rule for each**:
- Drop any "case-sensitive" promise. Replace with: "Property names are collapsed case-insensitively by upstream before reaching the wrapper. The wrapper does not distinguish case-variant names; the collapsed entry's `noteCount` sums both contributors."
- Drop the byte-order tiebreak rule entirely, OR label it explicitly as "structurally unobservable — upstream collapses the very inputs the tiebreak was designed to disambiguate."

**Empirical anchor**: BI-041 quickstart properties case-variant probe (`specs/041-reconcile-cohort-doc-drift/quickstart.md` "Verify properties case-insensitive collapse"). The probe shows `noteCount: 2` for `AaTest` + `aatest`. The post-edit AC reads:

> **Given** two notes carrying frontmatter property names that differ only in case (e.g. `AaTest` and `aatest`), **When** the agent invokes `properties`, **Then** the response collapses them under upstream's case-insensitive rule with a single merged entry whose `noteCount` sums both contributors (e.g. `noteCount: 2`).

## Implementation note

These two stories are pure documentation edits to predecessor feature specs. They do NOT touch:
- Help-doc surfaces (already aligned by BI-041).
- Schema `.describe()` strings (already aligned by BI-041).
- Runtime code (out of scope; the wrapper already produces the live shapes the specs are being retired to match).

The audit pass-criteria checklist (Story 8) for `read_property` and `properties` clears after this BI lands because the feature-spec / help-doc / schema-describe triple now agrees with the live wire shape.
