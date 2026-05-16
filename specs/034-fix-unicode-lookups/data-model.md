# Data Model: Fix Unicode Lookups

**Branch**: `034-fix-unicode-lookups` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This feature is a defect repair on the input-decode step of seven eval-composition tools. **No new persistent entity, schema, or stored shape is introduced.** No existing entity, schema, or stored shape changes. The wire contracts of every affected tool — request schema, response shape, error envelope, error codes — are byte-stable pre/post-fix.

## Entities in the cone of influence

| Entity | What it is | Pre-fix | Post-fix |
|---|---|---|---|
| **Payload object (JS-side, V8-eval context)** | The `a` object obtained from `JSON.parse(<decode-expression>('__PAYLOAD_B64__'))` inside each rendered JS template. Carries the user-supplied lookup identifier (`a.segments`, `a.value`, `a.property`, `a.folder`, etc.). | Each non-ASCII string field arrives **mojibake** (Latin-1 interpretation of UTF-8 bytes). Downstream comparisons against vault content miss. | Each non-ASCII string field arrives **as authored** (UTF-8 correctly decoded). Comparisons match. |
| **Heading-path identifier** (per spec §Key Entities) | A caller-supplied sequence of heading-title segments used to locate a section. | Today the lookup compares the corrupted segment list against the note's authored heading titles → miss. | Same comparator (`stack[j]!==a.segments[j]`), same comparand on the vault side, uncorrupted comparand on the input side → match. |
| **Property name identifier** (per spec §Key Entities) | A caller-supplied key string used to locate a property. | For `read_property`: already uncorrupted (uses argv path, not atob). Predicted to work today; verified by added test. For the spec's claim that this is broken: see [research.md §2](research.md). |
| **Property value identifier** (per spec §Key Entities) | A caller-supplied value string used to filter notes by frontmatter value. | Used by `find_by_property` via `eq(v, a.value)`. Today `a.value` is mojibake → no match. | `a.value` arrives correctly → match. |
| **Eval payload (Node-side, pre-encode)** | The JSON-serialised object produced by `Buffer.from(JSON.stringify({...}), "utf-8").toString("base64")` (in each handler). | UTF-8 bytes correct on the WAY IN to base64; the round-trip is broken only at the OUT side because of the Latin-1 decode. | Pre-encode side is unchanged; post-decode side becomes UTF-8-correct. |
| **Shared decoder snippet** (NEW, internal) | A text-fragment constant exported from `src/tools/_shared.ts` providing the UTF-8-safe decode expression to embed in every eval template. | Does not exist. Each `_template.ts` carries its own copy of `JSON.parse(atob('__PAYLOAD_B64__'))`. | Lives in `_shared.ts`. Each `_template.ts` substitutes the same fragment into its eval body. Not a persisted entity — purely an internal source-code constant. |
| **Shared compose helper** (NEW, internal) | `composeEvalCode(template: string, payload: unknown): string` in `src/tools/_shared.ts`. | Does not exist. Each handler runs the three-line compose (`JSON.stringify` → `Buffer.from(...).toString("base64")` → `JS_TEMPLATE.replace(...)`) inline. | Lives in `_shared.ts`. Each handler calls it. Not a persisted entity — purely an internal helper function. |

## What is NOT in the data model

- **No new MCP tool surface.** Every affected tool's registered name, input schema, output schema, and error code roster are byte-stable. Per `_register-baseline.json`, all twenty `descriptionFingerprint` / `schemaFingerprint` values stay byte-identical post-fix.
- **No new error code or sub-state.** Per spec FR-007 and Constitution Principle IV. The defect repair removes a failure mode (silent-empty-lookup-on-non-ASCII); it does not introduce a new one. ADR-015's `details.reason` sub-discriminator surface is unchanged.
- **No persistent storage.** The fix lives entirely in source code (`_template.ts` literals, `_shared.ts` helper, handler.ts call sites). No DB, no on-disk cache, no migration.
- **No vault-side change.** The fix changes how the eval-composition tools interpret their input payload, not how Obsidian stores notes. The vault's notes and frontmatter are unchanged before, during, and after the fix.

## Validation rules

The fix's behavioural contract per the spec:

| Rule | Source |
|---|---|
| The decoded `a.<field>` value MUST be character-for-character identical to the JSON-serialised payload that the handler emitted, for every Unicode code point in U+0000..U+10FFFF that the spec's input domain allows. | FR-009 (exact characters as received, no normalisation folding) |
| `Object.keys(a)` and every `a[key]` value's type MUST be identical to the pre-fix decode result for any payload whose every code point falls in U+0000..U+007F (basic ASCII). | FR-006 (no ASCII regression) |
| Comparators inside the templates (`x===y`, `x.toLowerCase()===y.toLowerCase()`, `arrEq`, `stack[j]!==a.segments[j]`) MUST remain unchanged in source. | FR-009 (no fuzzy match) + research.md §4 (one-line scope) |
| The eval response shape produced by each affected template MUST be byte-stable pre/post-fix for any payload that produced a correct response pre-fix. | FR-007 (no response-shape change) |

## State transitions

None. The fix has no state; it changes a deterministic decoding step from one (broken) interpretation to another (correct) interpretation.
