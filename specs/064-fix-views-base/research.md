# Research: Fix Views Base

**Feature**: 064-fix-views-base | **Date**: 2026-06-29 | **Plan**: [plan.md](plan.md)

Phase 0 decisions. Each: Decision / Rationale / Alternatives considered. The contract is settled by the spec Clarifications (2026-06-29); the mechanism is settled by the user's plan-time direction. Remaining empirical items are T0 verification gates (see [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)), not `NEEDS CLARIFICATION`.

---

## D1 — Modify the existing tool, don't add one

- **Decision**: `views_base` already exists and is registered in `server.ts`. This BI edits its `schema.ts` / `handler.ts` / `index.ts` (+ the three co-located tests), regenerates its `_register-baseline.json` fingerprints, and rewrites `docs/tools/views_base.md`. No new tool; no new `server.ts` registration line.
- **Rationale**: The spec is a fix + additive extension of one surface. Adding `base_path` and rewriting the description changes the tool's published shape → both `schemaFingerprint` and `descriptionFingerprint` move; that is a reviewed baseline regen, the expected path for modifying a tool (contrast: adding a tool would also add a baseline entry + a registration line).
- **Alternatives**: A second "named views" tool alongside `views_base` — rejected; duplicates the surface, splits the contract, and contradicts the spec's "only the views listing is in scope".

## D2 — Stay native; eval-composition is fallback-only

- **Decision**: Keep `views_base` in the native-CLI-wrapper Bases family (`bases` / `query_base` / `create_base`). The named-Base capability is composed from native pieces (focus + active `base:views`). Full eval-composition is the documented fallback (D9), used only if focus-then-active proves racy (T0 P3).
- **Rationale**: The whole Bases family is native-wrapped; promoting `views_base` to the eval cohort would make it the lone eval member of its family — a cohort-cohesion cost the user explicitly flagged. Native focus-then-active reaches a non-focused Base without that cost.
- **Alternatives**: Eval-composition as primary — rejected up front per the user's directive (fallback-only). Client-side `.base`-YAML parse — rejected as primary (brushes the BI-041 "no client-side `.base` parse" norm; would need a new ADR).

## D3 — US2 via focus-then-active (primary mechanism)

- **Decision**: When `base_path` is supplied, focus that `.base` as the active file in the target vault using the proven cross-vault open mechanism (BI-0065 / `open_file`: a `target_mode:"specific"` eval carrying `vault=requested`, B1-false; `active` when no `vault`), then run active-mode `base:views`, then label-strip. When `base_path` is omitted, run active-mode `base:views` against the already-focused Base (unchanged).
- **Rationale**: This delivers US2 **regardless** of whether `base:views path=` works — the user's key correction. `open_file`'s own contract states "after a successful open, the opened file becomes the active file: a subsequent `target_mode:\"active\"` tool call operates on it" — exactly the handoff `views_base` needs. The mechanism is proven cross-vault cohort-wide (BI-0134).
- **Alternatives**: Require the user to pre-focus the Base (status quo) — rejected; that is the very defect US2 removes. Depend solely on `base:views path=` — rejected; it may not work (D4), and focus-first does not depend on it.

## D4 — Re-probe `base:views path=`; distrust 054 R-003

- **Decision**: The T0 probe (P2) re-tests `base:views path=<rel>` and `base:views vault=<unfocused> path=<rel>` with forcing methodology: drive `Obsidian.com` (never `.exe`), target a **non-focused** `.base`, pass `vault=` set to a vault that is **not** the focused one. If `path=` resolves the named Base → ship US2 via single-call native specific-mode (`base:views path=` [+`vault=`]). If it does not → ship US2 via focus-then-active (D3). Either way the spec contract is identical.
- **Rationale**: 054 R-003 ("`base:views` ignores `path=`, active-only") is a candidate misobservation of the same class the project already reversed twice — BI-0134 falsified upstream B1 ("eval ignores `vault=`"), and the Best-Practices F4 note records a `vault=`-resolves-to-focused-name slip. Forking the plan on an unverified negative would be a mistake; the probe is cheap and decisive.
- **Alternatives**: Trust R-003 and skip the `path=` re-test — rejected; risks shipping the more complex focus-first path when a one-call path exists. Trust that `path=` works and skip focus-first — rejected; risks US2 being undeliverable if R-003 still holds.

## D5 — US1: label-strip, punctuation-safe

- **Decision**: Replace the current pass-through line-split (which trims whitespace only) with a precise strip of the injected type label, anchored to the **known Bases view-type token set** (e.g. `table`, `cards`, … — the closed set captured by T0 P1). The strip removes only the trailing label (and its delimiter); it never blind-trims a trailing token, so legitimate internal/trailing spaces and punctuation survive (FR-003 / SC-003).
- **Rationale**: The returned name must equal the name `query_base` accepts (FR-002 / SC-001). The current handler returns `"<name> <label>"` verbatim. Anchoring to known type tokens is the only strip that satisfies "preserve internal punctuation" without a separate clean-name channel from upstream (which `base:views` does not provide).
- **Alternatives**: Split on the last delimiter unconditionally — rejected; over-strips names that legitimately contain the delimiter. Ask upstream for structured output — rejected; `base:views` has no JSON/structured mode (T0 P1 confirms format). Parse the `.base` YAML for names — rejected as primary (BI-041 norm; new-ADR territory).

## D6 — `base_path` validation mirrors `query_base`

- **Decision**: Add optional `base_path: string` validated by a zod `superRefine` byte-for-byte like `query_base`'s `base_path`: empty → `INVALID_BASE_PATH/empty`; > 1000 UTF-16 units → `/too-long`; path-traversal shape → `/path-traversal`; not ending `.base` → `/wrong-extension`. Omitted → open-Base active mode (FR-005).
- **Rationale**: Cohort parity (Principle III, single source of truth, ADR-015 `params` sub-discrimination) means the identifier `bases` emits and `query_base` accepts validates identically across the family. FR-012 mandates this parity; the clarify phase settled "wrong-extension is a validation failure, distinct from named-not-found".
- **Alternatives**: A looser/bare-name locator — rejected by clarify (vault-relative `.base` path; no bare-name resolution layer). Reuse `query_base`'s schema object wholesale — rejected; `views_base` has no `view_name` and `base_path` is optional here, so the refinement is shared by pattern, not by importing the sibling schema.

## D7 — `vault` routes the focus eval cross-vault

- **Decision**: For the named path, `vault` is honoured — the focus eval runs `target_mode:"specific"` with `vault=requested` (B1 false, ADR-031), so the named Base is focused in that vault even if it is unfocused or closed (inherited ADR-029/030 recovery). An unknown vault name surfaces `CLI_REPORTED_ERROR/VAULT_NOT_FOUND/unknown` via `remapVaultNotFound` **before** the `base:views` read. With no `base_path`, `vault` retains its existing open-Base cohort-parity behaviour (the active `base:views` ignores it — documented inherited limitation).
- **Rationale**: Cross-vault reach is the point of US2 (an agent that discovered a Base by name should not need it pre-focused). `open_file` already proves vault-correct cross-vault routing; `views_base` reuses the same mechanism.
- **Alternatives**: Ignore `vault` entirely (status quo) — rejected; defeats cross-vault discovery. A `target_mode` discriminator union on the input — rejected; the spec models naming as an optional additive parameter, not a mode switch (cohort parity with `query_base`, where `vault` is optional alongside `base_path`).

## D8 — Error roster: zero new top-level codes

- **Decision**: Reuse existing surfaces. `VALIDATION_ERROR` (+ `INVALID_BASE_PATH` sub-issues) for a malformed locator; `CLI_REPORTED_ERROR` with `details.code` for the rest:
  - **no Base open** (no `base_path`, focused file is not a `.base` / nothing focused) → `BASE_NOT_FOUND` (existing active-mode behaviour, unchanged).
  - **named Base not found** (the named `.base` does not exist in the vault) → the focus mechanism's `FILE_NOT_FOUND` (distinct top-level `details.code` from `BASE_NOT_FOUND`).
  - **named target is malformed** (`.base` exists but cannot be used) → `BASE_MALFORMED` (cohort with `query_base`), if upstream surfaces it.
  - **bad vault** → `VAULT_NOT_FOUND/unknown`.
  All distinct; no silent open-Base substitution on any named-path failure (FR-009).
- **Rationale**: Principle IV — preserve the zero-new-top-level-codes streak; ADR-015 keeps finer signal under `details`. The focus arm gives named-not-found a naturally distinct code (`FILE_NOT_FOUND`), so no new `details.reason` is needed there.
- **Alternatives**: A dedicated `NOT_A_BASE` top-level code — rejected (clarify folded it into validation/malformed; Principle IV). Collapse named-not-found and no-base-open into one `BASE_NOT_FOUND` — rejected (FR-007/SC-004 require distinguishability).

## D8a — Conditional `details.reason` (ADR-015, "only if needed")

- **Decision**: Introduce a `BASE_NOT_FOUND` `details.reason` (`named-missing` vs `not-open`) **only if** the resolved mechanism (e.g. the `path=` native arm, if P2 passes and upstream reports a missing named Base under the same generic shape as no-base-open) cannot otherwise distinguish them. The focus-first arm needs none (`FILE_NOT_FOUND` ≠ `BASE_NOT_FOUND`).
- **Rationale**: The user's directive: "new `details.reason` only if needed (ADR-015)". Additive-only; zero new top-level codes regardless. The exact need is settled by the T0 probe outcome and recorded in data-model.
- **Alternatives**: Always add the reason — rejected (unnecessary surface if `FILE_NOT_FOUND` already distinguishes). Never add it — rejected (would leave the `path=` arm unable to satisfy SC-004 if upstream conflates).

## D9 — Eval-composition fallback (only if P3 fails)

- **Decision**: If focus-then-active proves racy or unreliable (T0 P3 — e.g. `base:views` reads the previously-focused file before the open settles), fall back to doing the load + enumerate atomically inside one `obsidian eval` (`target_mode` per `vault`). This accepts `views_base` becoming the lone eval member of the Bases family.
- **Rationale**: A single eval has no cross-call ordering race. It is the project's proven escape hatch when a native composition is unreliable.
- **Alternatives**: Add a poll/verify loop between the focus and the read — rejected unless P3 shows a bounded, reliable settle (extra round-trips, fragile). A client-side `.base`-YAML read (in or out of eval) — rejected unless unavoidable; **requires a new ADR** (BI-041 norm) and is the last resort.

## D10 — Empty-views quirk left as-is

- **Decision**: When a Base declares no views, Obsidian materialises a single default view; the listing reports whatever the chosen mechanism reports (native `base:views` would emit the materialised default). Not normalised, not masked.
- **Rationale**: Explicitly out of scope per the spec ("documented as a known edge, not fixed here"). Normalising it would require interpreting Obsidian's default-view behaviour — new scope.
- **Alternatives**: Return `[]` for an empty declared-views set — rejected (would require client-side `.base` interpretation to know the declared set was empty; out of scope).

---

**Output**: all decisions recorded; no `NEEDS CLARIFICATION` remains. The mechanism arm (native `path=` vs native focus-first vs eval fallback) is selected at implement-time by the T0 forcing-gate probe; every arm satisfies the same spec contract and error roster.
