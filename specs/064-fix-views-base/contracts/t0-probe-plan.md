# T0 Forcing-Gate Probe Plan: Fix Views Base

**Feature**: 064-fix-views-base | **Date**: 2026-06-29 | **Plan**: [../plan.md](../plan.md)

Implement-time live-CLI probes that decide the named-Base mechanism and finalise the label-strip. **Gate**: read [.memory/test-execution-instructions.md](../../../.memory/test-execution-instructions.md) before running — it names the authorised TestVault, the scratch subdirectory, the destructive-probe protocol, and cleanup. **Drive `Obsidian.com`** (production-resolved console shim), **never** the GUI `Obsidian.exe` (detached stdio → false-clean empty-exit-0). These probes produce real CLI invocations against a real vault.

## Fixtures (in the authorised TestVault scratch subdir)

- **Base A** — a `.base` with ≥3 views of mixed types; one view name contains **spaces**, one contains **punctuation** (e.g. a trailing `)` or a `:`), to exercise FR-003/SC-003.
- **Base B** — a second `.base` in a **different, unfocused** vault (or an unfocused background vault), for the cross-vault / non-focused probes.
- **Empty Base** — a `.base` declaring **no** views (for the D10 empty-views quirk capture).

## Probes

### P1 — Real `base:views` active-mode output format (REQUIRED)

- Focus Base A; run `obsidian base:views` (active). Capture exact stdout bytes.
- **Determines**: the injected type-label shape (delimiter + the closed view-type token set) so `stripTypeLabel` is precise; the corrected `handler.test.ts` fixtures (the current `"All\nActive\n"` fixtures are clean and do **not** match reality).
- **Assert at design-finalisation**: stripping Base A's punctuation-bearing view name yields the name `query_base` accepts (round-trip: feed the stripped name into `query_base view_name=` and confirm acceptance).

### P2 — Re-test `base:views path=` / `vault=` (distrust 054 R-003)

- With Base A **not** focused (focus a non-`.base` note, or Base B's vault), run:
  - `obsidian base:views path="<rel-to-Base-A>"`
  - `obsidian base:views vault="<Base-B-vault, unfocused>" path="<rel-to-Base-B>"`
- **Forcing methodology**: target a **non-focused** `.base`; set `vault=` to a vault that is **not** the focused one (per Best-Practices "probe explicit `vault=<X>` with X ≠ focused vault"). Drive `Obsidian.com`.
- **Determines**: whether `path=` (and cross-vault `vault=`) now resolve the named Base.
  - **PASS** ⇒ ship US2 via single-call native specific-mode (`base:views path=` [+`vault=`]).
  - **FAIL** (R-003 still holds) ⇒ ship US2 via focus-then-active (P3).

### P3 — Focus-then-active reliability (no race)

- Focus a non-`.base` note. Then, in sequence (as the handler would): focus Base A via the proven open mechanism (`open_file`-style eval) → immediately run `obsidian base:views` (active). Repeat for Base B cross-vault.
- **Determines**: whether `base:views` reliably reads the **just-focused** Base (not the previously-focused file) without a poll/verify step.
  - **RELIABLE** ⇒ focus-then-active is the native arm.
  - **RACY/UNRELIABLE** ⇒ fall back to eval-composition (P4).
- Also capture: does focusing a **missing** `.base` surface `FILE_NOT_FOUND` cleanly (⇒ "named Base not found"), and is it distinct from the no-base-open `BASE_NOT_FOUND`?

### P4 — In-eval Bases view-enumeration API (only if P2 and P3 both fail)

- Probe whether a single `obsidian eval` can load Base A by vault-relative path (cross-vault via `vault=`) and enumerate its view **names** cleanly.
- **Determines**: the eval-composition fallback mechanism (atomic load + enumerate, no cross-call race).
- **ADR gate**: if the only viable enumeration is a client-side `.base`-YAML read, that diverges from the BI-041 "no client-side `.base` parse" norm → **author a new ADR** before taking this path.

### P-edge — Empty-views quirk (capture, do not fix)

- Focus the Empty Base; run `base:views`. Record what Obsidian emits (expected: a single materialised default view). Document in the contract as the known edge (D10). No code path normalises it.

## Decision tree

```
P2 (path=) PASS ─────────────────────────► native specific-mode (base:views path= [+vault=])  ── 1 call
P2 FAIL ─► P3 (focus-then-active) RELIABLE ► native focus-first (open .base → base:views active) ── 2 calls
P3 RACY ─► P4 viable ─────────────────────► eval-composition fallback (atomic load+enumerate)
P4 needs client-YAML ─────────────────────► STOP: author a new ADR, then proceed
```

All arms: US1 label-strip (P1-finalised), the same error roster, zero new top-level codes. `BASE_NOT_FOUND` carries `details.reason` (`named-missing` vs `not-open`) in **every** arm — the focus-first arm remaps its upstream `FILE_NOT_FOUND` to `BASE_NOT_FOUND/named-missing` (cohort consistency with `query_base`), and the `path=` arm classifies upstream's missing-base report to the same shape (ADR-015 additive).
