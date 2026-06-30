# Contract: `bases` (empty-vault correction)

**Feature**: 065-fix-empty-bases | **Date**: 2026-06-30 | **Tool**: `bases` (existing; modified, not added)

The `bases` tool enumerates every Obsidian Base (`.base`) file in the vault and returns their vault-relative paths as a sorted, names-only list with a count. This contract restates the behavioural guarantees and pins the one that changes: the empty-vault result.

---

## Interface (unchanged)

- **Input**: `{ vault?: string }` (strict). `vault` is accepted for cohort parity and currently ignored by the underlying CLI (inherited limitation — out of scope here).
- **Output**: `{ bases: string[]; count: number }` (strict; `count === bases.length`; `bases` sorted lexicographically ascending).
- **Side effects**: none — read-only with respect to vault contents.

---

## Behavioural guarantees

### G1 — Empty vault → empty result (CHANGED)
**Given** a vault with zero `.base` files, **when** `bases` is called, **then** the result is exactly `{ "bases": [], "count": 0 }`. The underlying CLI's informational line (current text "No base files found in vault", or any future re-wording) MUST NOT appear in `bases` and MUST NOT contribute to `count`. *(FR-001, FR-002, FR-003; SC-001, SC-002)*

### G2 — Membership is the positive `.base` cue (CHANGED)
**Given** the CLI's clean-exit stdout, **when** `bases` builds the list, **then** a line is included **iff**, after trimming, its lowercased form ends in `.base`. Every other line — the informational message, blank lines, whitespace-only lines — is excluded. Recognition is independent of the informational message's wording. *(FR-002)*

### G3 — Populated vault unchanged (REGRESSION GUARD)
**Given** a vault with one or more `.base` files, **when** `bases` is called, **then** the returned `bases` and `count` are identical to the pre-fix output: same membership, same lexicographic order, `count === bases.length`. *(FR-004; SC-003)*

### G4 — Single real Base → count 1 (BOUNDARY)
**Given** a vault with exactly one `.base` file, **when** `bases` is called, **then** the result lists that one path with `count: 1` — the positive filter never mistakes a real single Base for the empty signal. *(FR-005)*

### G5 — Failures stay distinct from empty (UNCHANGED)
**Given** a genuine failure (vault not found, dispatch error, non-zero CLI exit, cold-start/recovery failure), **when** `bases` is called, **then** it raises `UpstreamError` (`CLI_REPORTED_ERROR` or an inherited `CLI_*` recovery code; `VALIDATION_ERROR` for malformed input) — never `{ bases: [], count: 0 }`. The filter runs only on a clean exit, after the error path has had its chance. No new top-level error code and no new `details.reason` are introduced. *(FR-006; SC-004; Principle IV)*

### G6 — Names-only, scope-confined (UNCHANGED)
**Given** any call, **when** `bases` returns, **then** each entry is a path string only (no per-Base detail), and the handling of the `vault` argument is exactly as before. *(FR-007)*

---

## Worked examples

### Empty vault (the fix)
```jsonc
// CLI clean-exit stdout: "No base files found in vault\n"   (exit 0)
{ "bases": [], "count": 0 }
```

### Populated vault (unchanged)
```jsonc
// CLI clean-exit stdout:
//   "Vault Health Check.base\n000-Meta/Bases/Type ID Index.base\n220-Planning/Backlog (Base).base\n"
{
  "bases": [
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base"
  ],
  "count": 3
}
```

### Informational line mixed with real paths (defensive)
```jsonc
// Hypothetical CLI stdout: "No base files found in vault\nReal One.base\n"
{ "bases": ["Real One.base"], "count": 1 }   // message dropped; real path kept
```

### Genuine failure (unchanged)
```jsonc
// CLI non-zero exit / stderr error  → throws, never returns an envelope
UpstreamError { code: "CLI_REPORTED_ERROR", details: { ... }, cause: ... }
```

---

## Test obligations (Principle II — co-located in `handler.test.ts`)

- **Happy / empty (regression)**: stdout `"No base files found in vault\n"` → `{ bases: [], count: 0 }`. *(red on `main`, green after fix — G1)*
- **Happy / populated**: multi-base stdout → exact sorted list, `count` matches. *(G3)*
- **Boundary / single base**: one `.base` line → `count: 1`. *(G4)*
- **Boundary / message mixed with paths**: message + `.base` lines → only paths survive. *(G2)*
- **Boundary / whitespace or blank**: `"   \n\n"` → `{ bases: [], count: 0 }`. *(G2)*
- **Boundary / case-insensitive extension**: a `.Base`/`.BASE` line is kept. *(G2)*
- **Failure**: non-zero exit + stderr → rejects with `UpstreamError`. *(G5 — retained from the current suite)*
