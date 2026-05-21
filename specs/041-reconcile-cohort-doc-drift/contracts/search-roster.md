# Contract: search error roster reconciliation

**Anchor**: `docs/tools/search.md` (rendered help-doc) + `src/tools/search/schema.ts` `.describe()` block.
**FRs satisfied**: FR-009.
**SCs satisfied**: SC-004.

## Scope

The `search` rendered help-doc's error roster reconciles to the Cowork pathway with explicit BI-0086 carve-outs for codes Cowork's client-side transforms render unreachable. No runtime change to `search` is in scope.

## Reconciliation principle (FR-009 three-part criterion)

1. **(a)** Every error code reachable on the Cowork pathway (post-client-side strip and coerce) MUST appear in the roster.
2. **(b)** Every code reachable only on the strict-rich pathway MUST appear in the roster WITH the strict-rich-pathway-only flag AND the BI-0086 carve-out rationale inline.
3. **(c)** No code unreachable on both pathways MAY appear in the roster.

## Carve-out roster (BI-0086)

Exactly two entries. Format pinned by `research.md` Task 4:

> `VALIDATION_ERROR(unrecognized_keys)` — *(strict-rich pathway only, per BI-0086 — Cowork strips unknown top-level keys client-side per `additionalProperties: false`, so this code never fires on Cowork)*
>
> Out-of-range `limit` — *(strict-rich pathway only, per BI-0086 — Cowork surfaces this as MCP transport error `-32602` (Invalid Params), not as the wrapper's wrapped `VALIDATION_ERROR`)*

Each carve-out entry stays in the roster (the strict-rich pathway still produces them; agents using Claude Desktop / MCP Inspector need to know what to recover from). The flag tells Cowork-reading agents the code is unreachable on their pathway and is safe to omit from their recovery code.

## Roster contents (full set, post-reconciliation)

The full roster is determined empirically by enumerating reachable invocations on both pathways during /speckit-implement T0 probes. The unreconciled current roster is captured pre-edit; the post-edit roster reflects FR-009 (a) + (b) + (c). The carve-out flag format above is the only structural addition; all other codes carry no flag (they are reachable on both pathways).

**Pre-edit baseline capture** (to be filled during /speckit-implement T0 probe against the current `search` help-doc):

- Codes in current roster: <captured from existing `docs/tools/search.md`>
- Codes reachable on Cowork pathway: <captured from T0 probe enumeration>
- Codes reachable on strict-rich pathway only: <captured from T0 probe enumeration>

**Post-edit roster** (target shape, derived from the three pre-edit captures):

- Roster = (Cowork-reachable codes, unflagged) ∪ (strict-rich-only codes, flagged with BI-0086 inline rationale).
- Codes in pre-edit baseline NOT in post-edit roster: deletion candidates (FR-009 (c) — documented-but-never-produced removal).
- Codes reachable on Cowork pathway NOT in pre-edit baseline: addition candidates (FR-009 (a) — produced-but-never-documented add).

## Test additions (co-located per Principle II)

In `src/tools/search/schema.test.ts`:

1. **Carve-out flag pattern present exactly twice**: assert the `.describe()` text on the `search` schema contains exactly two occurrences of the substring `"strict-rich pathway only, per BI-0086"`. The literal count is the auditable carve-out count per Assumption A10.
2. **`VALIDATION_ERROR(unrecognized_keys)` flagged**: assert the `.describe()` text contains the phrase `"VALIDATION_ERROR(unrecognized_keys)"` within 200 characters of `"strict-rich pathway only"`.
3. **Out-of-range `limit` flagged**: assert the `.describe()` text contains the phrase `"Out-of-range \`limit\`"` (or equivalent post-formatting) within 200 characters of `"strict-rich pathway only"`.

Help-doc edits in `docs/tools/search.md` are reviewed by inspection during PR review.

## What is NOT in this edit

- No change to `search`'s input schema. The `additionalProperties: false` behaviour is the published contract Cowork relies on; relaxing it would break Cowork's strip semantics.
- No change to `search`'s handler. No runtime classification widening for `search` is in scope (Out-of-Scope: only the two named classifier widenings for ERR_NO_ACTIVE_FILE and VIEW_NOT_FOUND).
- No carve-out for the `limit` range bound itself. The MCP transport `-32602` surface for out-of-range `limit` on the Cowork pathway is Cowork's choice; the wrapper does not surface it.

## Verification

After the edit ships, an automated audit script can enumerate `search` invocations on the Cowork pathway (post-strip-and-coerce) and assert:

- Every produced code appears in the roster (FR-009 (a) via SC-004).
- Every roster code not flagged strict-rich-pathway-only is produced (FR-009 (b) via SC-004).
- The two flagged codes do NOT fire on the Cowork pathway (carve-out invariant).
- The two flagged codes DO fire on the strict-rich pathway (carve-out reachability).
