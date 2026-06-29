# Quickstart: Fix Views Base

**Feature**: 064-fix-views-base | **Date**: 2026-06-29 | **Plan**: [plan.md](plan.md)

Manual validation scenarios mapped to the user stories. Run against the authorised TestVault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (drive `Obsidian.com`). These complement the co-located `vitest` unit tests; per the project's test-scope memory, integration/manual TC-XXX cases live in the user's tracker, not here.

## Preconditions

- A `.base` (call it **Tasks.base**) with ≥3 views, including one view name with a space and one with punctuation.
- A second `.base` in a different, unfocused vault (or an unfocused background vault) — **Other.base**.

## US1 — Clean view names (P1)

1. Focus **Tasks.base** in Obsidian. Call `views_base` with `{}`.
   - **Expect**: `{ views: [...], count: N }` where every name is plain — no trailing type label, no extra delimiter, no trailing whitespace.
2. Take a returned name that contains a space/punctuation; call `query_base` with `{ base_path: "<Tasks.base path>", view_name: "<that name verbatim>" }`.
   - **Expect**: `query_base` accepts the name with **no** edits (SC-001). The space/punctuation is intact (SC-003).

## US2 — List the views of a named Base (P2)

3. Focus a **non-`.base`** note (or a different Base). Call `views_base` with `{ base_path: "<Tasks.base path>" }`.
   - **Expect**: the views of **Tasks.base**, regardless of what was focused (FR-004 / SC-002). No human re-focus needed.
4. Call `views_base` with `{ base_path: "<Other.base path>", vault: "<Other vault>" }` while that vault is unfocused/closed.
   - **Expect**: the views of **Other.base** in the named vault (cross-vault; the vault is brought up if needed).
5. Call `views_base` with `{}` while **Tasks.base** is focused (no `base_path`).
   - **Expect**: the views of the focused Base — unchanged from today (FR-005 / SC-005).

## US3 — Failure causes stay distinguishable (P3)

6. Call `views_base` with `{ base_path: "Nope/Missing.base" }` (does not exist).
   - **Expect**: a clear failure for **named Base not found**, distinct from "no Base open" (FR-007).
7. Focus a non-`.base` note; call `views_base` with `{}` (no `base_path`).
   - **Expect**: the **no Base open** failure (`BASE_NOT_FOUND`) — unchanged from today (FR-006).
8. Call `views_base` with `{ base_path: "Notes/Daily.md" }` (not a `.base`).
   - **Expect**: an **input-validation** failure (`INVALID_BASE_PATH/wrong-extension`), distinct from named-not-found (FR-008/012).
9. Call `views_base` with `{ base_path: "<Tasks.base path>", vault: "NoSuchVault" }`.
   - **Expect**: `VAULT_NOT_FOUND/unknown` (FR-007/D7).
10. For every failure in 6–9: confirm the result is a clear typed error and that **no** call silently returned the views of whatever Base was focused (FR-009 / SC-006).

## Edge — Empty views (D10)

11. Focus a `.base` declaring no views; call `views_base` with `{}`.
    - **Expect**: whatever Obsidian reports (a materialised default view) — the known edge, not fixed here.
