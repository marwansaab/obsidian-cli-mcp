# Behavioural Contract: `views_base` (BI-064)

**Feature**: 064-fix-views-base | **Date**: 2026-06-29 | **Plan**: [../plan.md](../plan.md)

The published behaviour of the modified `views_base` tool. Tests assert against this contract.

## Surface

- **Name**: `views_base` (unchanged).
- **Input** (strict): `{ base_path?: string, vault?: string }`.
  - `base_path` — optional vault-relative `.base` path. Present ⇒ name a specific Base. Absent ⇒ the Base focused in Obsidian.
  - `vault` — optional vault display name (min length 1). With `base_path`, routes the listing to that vault (cross-vault). Without `base_path`, inherited open-Base behaviour (not honoured by the active subcommand).
- **Output** (strict): `{ views: string[], count: number }`, `count === views.length`. Unchanged shape.
- **Read-only**: never mutates vault contents. The named path focuses the target Base (which file is active changes) — an accepted, documented side effect of naming a Base; the open-Base path changes nothing.

## Clean-names guarantee (US1)

- Every entry in `views` is a **plain view name**: no trailing type label, no extra delimiter, no trailing whitespace.
- Each returned name is accepted **verbatim** as `query_base`'s `view_name` for the same Base — no caller-side cleanup (SC-001).
- View names containing spaces or punctuation are returned **character-for-character** identical to their definition in the Base; only the injected type label (and its delimiter) is removed (FR-003 / SC-003). The strip is anchored to the known Bases view-type token set — it never blind-trims a trailing token.
- Empty declared-views set: reported as the chosen mechanism reports it (Obsidian materialises a default view — known edge, not normalised; D10).

## Modes

| `base_path` | `vault` | Behaviour |
|---|---|---|
| absent | any | List the views of the **focused** Base (unchanged from today). |
| present | absent | List the views of the **named** Base in the **focused** vault. |
| present | present | List the views of the **named** Base in the **named** vault (cross-vault; focuses it whether open, unfocused, or closed). |

- A named Base **always wins** over whatever is focused; the open Base is never substituted for a named target (FR-004 / SC-006).

## Error roster (zero new top-level codes)

| Cause | `code` | `details` |
|---|---|---|
| Malformed `base_path` (empty / too-long / path-traversal / not `.base`) | `VALIDATION_ERROR` | zod issues; `params.code: "INVALID_BASE_PATH"`, `params.reason` |
| Named Base not found | `CLI_REPORTED_ERROR` | `code: "FILE_NOT_FOUND"` (or `BASE_NOT_FOUND` + `reason:"named-missing"` if the resolved arm requires the conditional reason) |
| No Base open (no `base_path`, focused file is not a `.base` / nothing focused) | `CLI_REPORTED_ERROR` | `code: "BASE_NOT_FOUND"` (+ `reason:"not-open"` if conditional) |
| Named target is malformed (`.base` exists but unusable) | `CLI_REPORTED_ERROR` | `code: "BASE_MALFORMED"` |
| Unknown `vault` name | `CLI_REPORTED_ERROR` | `code: "VAULT_NOT_FOUND", reason: "unknown", vault` |
| Other upstream CLI failure / app down / binary missing | inherited `CLI_*` | adapter-provided |
| Malformed input (unknown key, empty `vault`) | `VALIDATION_ERROR` | zod issues |

- All named-path failure causes are mutually distinguishable, reported consistently with the listing's other failures, and none is resolved by silently substituting the open Base (FR-009/010 / SC-004/006).

## Invariants

- Output shape and `count === views.length` refinement unchanged.
- Names-only (no per-view type/filter/row-count — FR-011).
- Zero new top-level error codes (Principle IV); any new `details.reason` is additive and conditional (ADR-015).
- `base_path` validation is byte-for-byte the `query_base` `INVALID_BASE_PATH` contract (FR-012).
