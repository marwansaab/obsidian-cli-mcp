# Data Model: Omit Derived Labels

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

No new entity and no shape change. The published per-entry shape stays `{ target, line, kind, displayText? }` (`linkEntrySchema`, strict). This feature changes only **when** the optional `displayText` field is emitted.

## Input: link-cache entry (read inside Obsidian)

| Field | Source | Use |
|---|---|---|
| `link` | `LinkCache.link` / `FrontmatterLinkCache.link` | becomes `target` (unchanged) |
| `original` | raw source span, e.g. `[[Tgt#Head\|Alias]]` | `kind` synthesis (unchanged); **new**: wiki-form and alias-separator test |
| `displayText` | Obsidian's label: alias if written, else derived | emitted as `displayText` when the rule below allows |
| `position` | body entries only | `line`, `_col` (unchanged) |

## Display-label rule (DisplayLabelRule)

Let `wiki = original.startsWith('[[') || original.startsWith('![[')`.

| Entry form | `displayText` emitted when |
|---|---|
| wiki form (body link, body embed, frontmatter link) | `original.includes('\|')` **and** `displayText !== ''` **and** `displayText !== link` |
| Markdown link or image | `displayText !== link` (unchanged: link text or alt text reported as written, empty included; analysis I1, option (b)) |

The emitted value is always the cache's `displayText`, unmodified.

## Worked rows (each becomes a template-execution test case)

Taken from the T0 probe ([contracts/t0-cache-shapes.json](contracts/t0-cache-shapes.json)).

| # | `original` | Source | Emitted `displayText` | Spec reference |
|---|---|---|---|---|
| 1 | `[[Tgt#Head]]` | body link | — (absent) | US1-1, FR-001 |
| 2 | `[[Tgt#^blk]]` | body link | — | US1-2 |
| 3 | `[[Tgt#H1#H2]]` | body link | — | edge: nested heading |
| 4 | `[[#Local]]` | body link | — | edge: same note |
| 5 | `[[#^lb]]` | body link | — | edge: same note |
| 6 | `"[[Tgt#Head]]"` | frontmatter | — | US1-3, Clarification Q3 |
| 7 | `![[Tgt#Head]]` | embed | — | US2-1 |
| 8 | `![[Tgt#^blk]]` | embed | — | US2-2 |
| 9 | `![[paper.pdf#page=3]]` | embed | — | US2-3, Clarification Q1 |
| 10 | `[[Tgt#Head\|Custom Display]]` | body link | `Custom Display` | US3-1 |
| 11 | `[[Tgt#^blk\|Other Label]]` | body link | `Other Label` | US3-2 |
| 12 | `[[Tgt\|Alias]]` | body link | `Alias` | US3-3 |
| 13 | `![[Tgt#Head\|Emb Alias]]` | embed | `Emb Alias` | US3-4 |
| 14 | `[[Tgt#Head\|Tgt > Head]]` | body link | `Tgt > Head` | edge: alias that looks derived, FR-003 |
| 15 | `[[Tgt#Head\\|Tbl Alias]]` | body link (table) | `Tbl Alias` | edge: table |
| 16 | `![[img.png\|300]]` | embed | `300` | Clarification Q2 |
| 17 | `![[img.png\|300x200]]` | embed | `300x200` | Clarification Q2 |
| 18 | `[[Tgt#Head\|]]` | body link | — | FR-004a |
| 19 | `[[Tgt#Head\| ]]` | body link | — | FR-004a (cache `""`) |
| 20 | `[[Tgt\|]]` | body link | — | FR-004a, Clarification Q4 |
| 21 | `[[Tgt#Head\|Tgt#Head]]` | body link | — | edge: alias equal to target |
| 22 | `[[Tgt\|Tgt]]` | body link | — | unchanged |
| 23 | `[[Tgt]]` | body link | — | US4-1, unchanged |
| 24 | `![[img.png]]` | embed | — | US4-2, unchanged |
| 25 | `[Text](Tgt.md#Head)` | Markdown link | `Text` | unchanged (out of scope) |
| 26 | `[](Tgt.md#Head)` | Markdown link | `""` | unchanged (out of scope) |
| 27 | `![alt](img.png)` | Markdown image | `alt` | unchanged |

Invariants checked alongside the rows: `target`, `line`, `kind`, entry order and `count` are identical with and without the change (FR-005), and `total: true` returns the same `count` (SC-004 via the existing cross-mode test).
