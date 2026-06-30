# Data Model: Fix Empty Bases

**Feature**: 065-fix-empty-bases | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This BI changes one transformation step inside `executeBases`. There is no schema change, no new entity persisted, and no new error state. The "model" here is the in-flight shape of the listing and the single predicate that changed.

---

## Entities

### Base name
- **What it is**: a vault-relative path to a `.base` file (e.g. `220-Planning/Backlog (Base).base`).
- **Recognition rule (changed)**: a clean-exit stdout line denotes a Base **iff**, after `trim()`, its lowercased form ends in `.base`.
- **Attributes**: the path string only (names-only — FR-007). No size, times, or view count (out of scope).

### Bases listing result
- **Shape (unchanged)**: `{ bases: string[]; count: number }` — `basesOutputSchema` (strict; refined so `count === bases.length`).
- **Empty result**: `{ bases: [], count: 0 }` — the corrected output for a vault with zero `.base` files (FR-001).
- **Ordering (unchanged)**: `bases` sorted lexicographically ascending.
- **Invariant**: `count === bases.length`, enforced by the existing `basesOutputSchema.parse(...)` for every result, including the empty one.

### Empty-result signal
- **What it is**: the informational line the native `bases` subcommand prints on a clean exit when the vault has no `.base` files (currently `"No base files found in vault"`).
- **Classification**: not a Base, not a failure — it is a successful zero-result.
- **Recognition (changed)**: recognised **structurally**, by the *absence* of any `.base`-ending line on a clean exit — NOT by matching its text. Any future re-wording is handled with no code change (FR-002).

---

## Schema delta

**None.** `src/tools/bases/schema.ts` is unchanged:

```ts
basesInputSchema  = z.object({ vault: z.string().min(1).optional() }).strict();        // unchanged
basesOutputSchema = z.object({ bases: z.array(z.string()), count: z.number().int().min(0) })
                      .strict()
                      .refine(o => o.count === o.bases.length, "count must equal bases.length"); // unchanged
```

Because the published input/output shape and the tool description do not move, the `bases` entry in `src/tools/_register-baseline.json` (`descriptionFingerprint` / `schemaFingerprint`) is **frozen** and the FR-018 baseline-stability test stays green without regeneration.

---

## Handler control flow

### Today (buggy)
```text
invokeCli({ command: "bases", target_mode: "active" })   // throws UpstreamError on non-zero exit / dispatch failure
  └─ on clean exit → result.stdout
       .split("\n")
       .map(trim)
       .filter(len > 0)          ← BUG: keeps the "No base files found in vault" line
       .sort()
  → basesOutputSchema.parse({ bases, count: bases.length })   // empty vault → count 1, fake name
```

### After fix
```text
invokeCli({ command: "bases", target_mode: "active" })   // UNCHANGED — error path owned here, runs before parse
  └─ on clean exit → result.stdout
       .split("\n")
       .map(trim)
       .filter(line => line.toLowerCase().endsWith(".base"))   ← CHANGED predicate: non-empty → ends-in-.base
       .sort()
  → basesOutputSchema.parse({ bases, count: bases.length })   // empty vault → { bases: [], count: 0 }
```

**The only line that changes** is the `.filter(...)` predicate: `line.length > 0` becomes `line.toLowerCase().endsWith(".base")`. Everything before (`split`, `trim`) and after (`sort`, `parse`) is identical.

### Failure path (unchanged)
Non-zero exit, dispatch error, or cold-start/recovery failure → `invokeCli` raises `UpstreamError` **before** the filter executes. The handler adds no `try/catch`, no fallback, and no new classification — Story 3 / FR-006 are satisfied by the pre-existing propagation. The filter only ever runs on a clean (exit-0) success, so it can never convert a failure into an empty list.

---

## Error roster (unchanged)

| Condition | Surfaced as | Notes |
|-----------|-------------|-------|
| Empty vault (zero `.base` files) | **success** `{ bases: [], count: 0 }` | NOT an error — the correction this BI delivers (FR-001) |
| Populated vault | **success** `{ bases: [...], count: N }` | byte-identical to today (FR-004) |
| Upstream CLI failure (non-zero exit / stderr error) | `UpstreamError` `CLI_REPORTED_ERROR` (+ inherited `CLI_*` recovery codes) | raised by `invokeCli`; unchanged |
| Malformed input (unknown key, strict mode) | `UpstreamError` `VALIDATION_ERROR` | raised by the zod boundary; unchanged |

**Zero new top-level codes; zero new `details.reason` sub-states** (Principle IV; ADR-015 N/A). The table is identical to today's except that the empty vault moves from "accidental count=1 success" to "correct count=0 success".

---

## Validation rules traceability

| Rule | Source | Enforcement |
|------|--------|-------------|
| Empty vault → `{ bases: [], count: 0 }` | FR-001 | predicate drops the informational line; `parse` confirms `count === 0 === bases.length` |
| `.base`-only membership, wording-independent | FR-002 | `line.toLowerCase().endsWith(".base")` |
| Count never inflated by informational line | FR-003 | informational line fails the predicate |
| Populated output unchanged | FR-004 | predicate removes no `.base` line; sort unchanged |
| Single real `.base` → count 1 | FR-005 | a `.base` line passes the predicate |
| Failure ≠ empty; no new code | FR-006 | error path owned by `invokeCli` before the filter; no new classification |
| Names-only; `vault` arg untouched | FR-007 | output shape unchanged; handler still ignores `vault` exactly as before |
