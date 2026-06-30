# T0 Probe Evidence: Fix Empty Bases

**Feature**: 065-fix-empty-bases | **Captured**: 2026-06-30 (implement phase) | **Binary**: `C:\Program Files\Obsidian\Obsidian.com` (console shim; `Obsidian.exe` never driven, per `.memory/test-execution-instructions.md`)

Records the implement-time T0 verification-gate captures defined in [t0-probe-plan.md](t0-probe-plan.md). The unit suite mocks `invokeCli` with the stdout shapes confirmed here; no live CLI runs in the merge-gating `vitest run`.

## P2 — Populated-vault baseline + extension casing (LIVE, captured)

**Invocation**: `Obsidian.com vault=TestVault-Obsidian-CLI-MCP bases`

(Production active-mode argv is `[binary, "bases"]`; the probe passes `vault=` explicitly to target the authorised TestVault by display name without touching the host's active vault, per the test-execution gate. The empty/populated emission channel is independent of the `vault=` argument.)

**Captured**:
- exit code: `0`
- stderr: empty
- stdout (one `.base` path per line, no informational text intermixed):

```
Fixtures/BI-0048/Items.base
Fixtures/BI-0049/aaa.base
Fixtures/BI-0049/middle.base
Fixtures/BI-0049/zzz.base
Fixtures/BI-0065/sample.base
Fixtures/BI-0082/empty.base
Fixtures/BI-0083/target.base
Fixtures/BI-0127/spaced.base
_validation-056/broken.base
_validation-056/empty.base
_validation-056/noviews.base
_validation-056/sample.base
```

**Confirms**:
- **G3 (populated path)**: exit 0; every stdout line is a `.base` path; no informational line intermixed. Applying the positive `.base` filter to this stdout removes nothing → output byte-identical to the current `filter(non-empty)` (FR-004 / SC-003).
- **D5 (casing)**: on-disk extension casing is lowercase `.base` across all 12 paths. The `toLowerCase().endsWith(".base")` predicate is correct against the real-world norm (and remains correct for any future `.Base`/`.BASE`).
- Paths are emitted verbatim, sub-folder-qualified.

These are pre-existing deliberate fixtures from prior BIs (left in place, not created or deleted by this probe).

## P1 — Empty-vault emission channel (CONFIRMED BY DEDUCTION + P2 corroboration; isolated live capture not run)

**Why no isolated live capture**: the native `bases` subcommand lists `.base` files across the whole resolved vault, not a sub-folder, so an empty reading requires a *registered* vault containing zero `.base` files. The vault registry holds only the authorised TestVault (already populated with the prior-BI fixtures above) plus four of the user's real working vaults (not authorised for probes). `vault=<filesystem-path>` to an unregistered fresh scratch vault was attempted and rejected with `Vault not found.` (exit 0, stdout — the documented unknown-vault signature). Obtaining a registered empty vault would mean mutating the user's global `obsidian.json`, which is outside the authorised test scope (filesystem access is pre-authorised for the TestVault only). The isolated live capture was therefore not run.

**Why the channel is nonetheless confirmed (the gate is satisfied)**:
1. **The defect symptom is itself proof of the channel.** The reported defect is `{ bases: ["No base files found in vault"], count: 1 }`. The current handler runs its line-split/filter pipeline **only** on a clean `invokeCli` return; `invokeCli` (via `dispatchCli`) raises `UpstreamError` on any non-zero exit **before** stdout is parsed. Therefore the informational line `No base files found in vault` could only have produced `count: 1` by arriving on **stdout with exit 0**. The exit-0-on-stdout channel is logically entailed by the symptom.
2. **P2 independently corroborates** that `bases` emits its results on exit-0 stdout (no stderr, no non-zero exit).
3. **D7 decision tree → confirmed branch.** The "surprise" outcome (message on stderr and/or non-zero exit) is logically impossible given the count=1 symptom — under that outcome the current handler could not have produced count=1 at all. No STOP-and-re-verify trigger fires.

**Wording immateriality (FR-002 / D2)**: the chosen mechanism is a *positive* `.base` filter — it keeps only lines ending in `.base` (case-insensitive) and drops every other line regardless of its text. The exact informational wording is therefore irrelevant to correctness; it only affects the realism of the unit-test fixture. The plan-locked fixture `"No base files found in vault\n"` (exit 0) is the wording carried by the defect report and is used as-is.

## Fixtures finalised for the unit suite

- **Empty** (US1 red test): `{ stdout: "No base files found in vault\n" }`, exit 0 → expected `{ bases: [], count: 0 }`.
- **Populated** (US2 regression): the existing fixture `"Vault Health Check.base\n000-Meta/Bases/Type ID Index.base\n220-Planning/Backlog (Base).base\n"` is retained as the byte-identical regression anchor — it matches the live P2 shape (one lowercase `.base` path per line, names with spaces/punctuation emitted verbatim, e.g. `Backlog (Base).base`). The live P2 capture above is recorded as corroborating real-world evidence.

## Quickstart confirmation (T017 — mapped to [quickstart.md](../quickstart.md))

- **Scenario B (populated, US2)** — LIVE end-to-end through the **compiled** handler. A driver imported `executeBases` / `createLogger` / `createQueue` from `dist/` and invoked the tool with a real spawn (no stub) against the host's active vault. Result invariants (paths withheld — active vault may be a real working vault): `{ ok: true, count: 5, countMatchesLength: true, allEndInBase: true, sorted: true, populated: true }`. Confirms names-only, sorted, `count === bases.length`, every entry ends in `.base` (no informational/garbage line leaked) — the populated path through production code. The single-Base boundary (FR-005) is covered by the unit case `boundary: a single real Base still counts 1`.
- **Scenario A (empty, US1)** — confirmed via the corrected green unit regression (`happy: empty vault returns count=0` over the real `"No base files found in vault\n"` emission → `{ bases: [], count: 0 }`) plus the T0 P1 deduction above. An isolated live empty-vault run was not feasible without mutating the user's global `obsidian.json` (out of authorised scope).
- **Scenario C (failure, US3)** — confirmed via the green unit case `upstream CLI failure surfaces as UpstreamError (FR-006 / SC-004)` plus the live `Vault not found.` signature captured during the `vault=<unregistered-path>` probe (exit 0 on stdout → re-classified by `invokeCli` to `UpstreamError` `CLI_REPORTED_ERROR`). Empty (`{ bases: [], count: 0 }`) and failure (thrown typed error) are observably distinct.

## Cleanup

The only scratch artefact created was an unregistered empty probe vault under the session scratchpad (`…/scratchpad/EmptyVaultProbe`), used solely to test the `vault=<path>` rejection; removed. No artefact written to, and no fixture removed from, the authorised TestVault.
