# Quickstart: Fix Empty Bases

**Feature**: 065-fix-empty-bases | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Manual validation scenarios mapped to the three user stories. The merge-gating evidence is the co-located unit suite (`src/tools/bases/handler.test.ts`, `invokeCli` mocked); these scenarios are for human/agent confirmation against a real vault and mirror the unit cases.

> Test-execution gate: before any live-CLI run, read `.memory/test-execution-instructions.md` (authorised TestVault, scratch subdirectory, cleanup). Drive `Obsidian.com`, never the GUI `Obsidian.exe`.

---

## Scenario A — Empty vault returns an honest empty result (US1 / P1)

1. Point the active context at a vault (or sanctioned scratch subfolder) containing **zero** `.base` files.
2. Call `bases` (no arguments).
3. **Expect**: `{ "bases": [], "count": 0 }`.
4. **Fail signal (the old bug)**: `{ "bases": ["No base files found in vault"], "count": 1 }` — a fake entry built from the informational message. Must NOT occur.

*Covers FR-001, FR-002, FR-003; SC-001, SC-002.*

---

## Scenario B — Populated vault listing is unchanged (US2 / P1)

1. Point the active context at a vault containing a known set of `.base` files (include one with spaces/punctuation, e.g. `220-Planning/Backlog (Base).base`).
2. Call `bases` (no arguments).
3. **Expect**: the same sorted, names-only list and `count` you got before the fix — same membership, same lexicographic order, `count === bases.length`.
4. **Boundary (single Base)**: against a vault with exactly one `.base` file, expect that one path with `count: 1` (FR-005).

*Covers FR-004, FR-005; SC-003.*

---

## Scenario C — Genuine failures stay distinguishable from empty (US3 / P2)

1. Drive `bases` into a real failure — e.g. a vault that cannot be resolved, or an upstream CLI error.
2. **Expect**: an `UpstreamError` (`CLI_REPORTED_ERROR` or an inherited `CLI_*` recovery code; `VALIDATION_ERROR` for malformed input) — a clear failure, plainly distinct from `{ bases: [], count: 0 }`.
3. **Fail signal**: an empty list with `count: 0` returned for a condition that is actually an error. Must NOT occur.

*Covers FR-006; SC-004.*

---

## Done criteria

- Scenario A returns `{ bases: [], count: 0 }` (was the count=1 fake entry).
- Scenario B is byte-identical to pre-fix output, including the single-Base boundary.
- Scenario C surfaces a typed error, never an empty list.
- `vitest run` green, including the corrected empty-vault regression fixture and the new boundary cases.
- `npm run lint` / `npm run typecheck` / `npm run build` clean.
- `_register-baseline.json` `bases` fingerprints unchanged (published surface frozen).
