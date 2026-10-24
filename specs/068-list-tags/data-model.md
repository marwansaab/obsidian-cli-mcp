# Data Model: List Tags

**Feature**: `068-list-tags` · **Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md)

All shapes below are defined once, as zod schemas in `src/tools/tags/schema.ts`. Downstream types are `z.infer` of those schemas (Principle III). This document describes them; it does not redefine them.

## 1. `TagsInput` — the tool's published input (`tagsInputSchema`)

Flat `z.strictObject` (unknown keys → `unrecognized_keys`), plus a `superRefine` for the scope matrix and path safety.

| Field | Type | Required | Default | Constraint |
|---|---|---|---|---|
| `vault` | string | no | focused vault | `min(1)`. Forbidden with `activeOnly: true`. |
| `file` | string | no | — | `min(1)`; passes `isStructurallySafePath`; contains no `[[` or `]]`. Bare note name, resolved by Obsidian as a wikilink would be. |
| `path` | string | no | — | `min(1)`; passes `isStructurallySafePath`. Vault-relative, extension included. |
| `activeOnly` | boolean | no | `false` | `true` forbids `vault`, `file`, `path`. |
| `sortByCount` | boolean | no | `false` | — |
| `includeCounts` | boolean | no | `true` | — |

Defaults are applied in the handler (`=== true` / `!== false` checks). They are not zod `.default()`s, so the published JSON Schema stays free of injected defaults (parity with the cohort).

**Scope** (derived, never published):

| Inputs | Scope | Vault |
|---|---|---|
| none of `file`/`path`/`activeOnly:true` | vault-wide | `vault` or focused |
| `file` | one note by name | `vault` or focused |
| `path` | one note by path | `vault` or focused |
| `activeOnly: true` | the active note | focused (implied) |

Conflicting combinations: see [contracts/input.md](contracts/input.md) § Scope matrix.

## 2. `TagsUpstreamEntry` — the CLI wire format (`tagsUpstreamArraySchema`)

A `.loose()` array entry schema, tolerant of future upstream field additions (parity with `properties` and `outline`). Working hypothesis, to be pinned by T0 probe P1:

| Field | Type | Notes |
|---|---|---|
| `tag` | string | Tag name as the index reports it, expected with a leading `#` |
| `count` | number (int ≥ 0) | Present because `counts` is always sent |

If P1 shows different field names, only this schema and the handler's field read change. The public output contract does not.

## 3. `TagEntry` — one element of the output (`tagEntrySchema`)

`z.strictObject`:

| Field | Type | Present when | Rule |
|---|---|---|---|
| `name` | string, `min(1)` | always | Upstream name with exactly one leading `#` removed. Nothing else changed (FR-013). |
| `count` | int ≥ 0 | `includeCounts !== false` | Upstream count, verbatim (FR-009). Key absent, not `undefined`, when counts are off. |

## 4. `TagsOutput` — the tool's result (`tagsOutputSchema`)

`z.strictObject`, plus a `superRefine` enforcing the invariants:

| Field | Type | Rule |
|---|---|---|
| `total` | int ≥ 0 | `=== tags.length` |
| `tags` | `TagEntry[]` | Names unique (FR-010). Either every entry has `count` or none does. Ordered per § 5. |

The handler parses its own result against this schema before returning. A failure surfaces as `INTERNAL_ERROR` (the `registerTool` runtime-ZodError branch).

## 5. Ordering

- `compareTagNames(a, b)`: compare `a.toLowerCase()` with `b.toLowerCase()` by UTF-16 code unit (`<` / `>`, never `localeCompare`); if equal, compare `a` with `b` by UTF-16 code unit.
- Default order: ascending by `compareTagNames`.
- `sortByCount: true`: descending by upstream count, ties by `compareTagNames`. This also applies when `includeCounts: false`; the sort runs on upstream counts before projection.
- Upstream order is never relied on.

## 6. Lifecycle / state

None. The tool is a stateless, read-only, single-snapshot query. No caching, no retries beyond the inherited dispatch-layer cold-start retry.
