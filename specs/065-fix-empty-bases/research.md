# Research: Fix Empty Bases

**Feature**: 065-fix-empty-bases | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This BI has a settled contract (the tool doc already advertises empty → `{ bases: [], count: 0 }`) and a settled mechanism (the clarify session chose the positive `.base` filter). The decisions below record the rationale and the one empirical verification gate. No `NEEDS CLARIFICATION` remains.

---

## D1 — Modify the existing `bases` tool; do not add anything

**Decision**: Change only the membership predicate inside `executeBases` (`src/tools/bases/handler.ts`) and correct/extend its co-located `handler.test.ts`. No new tool, no `server.ts` registration line, no schema change.

**Rationale**: The defect is purely in stdout post-processing. The tool, its registration, its zod schemas, its description, its baseline fingerprints, and its public doc are all already correct (the doc even documents the intended empty-vault result). Touching any of them would be scope inflation and would needlessly move the `_register-baseline.json` `bases` fingerprints.

**Alternatives considered**: (a) a shared "filter CLI list output" helper in a cohort module — rejected: single call site, no second consumer, would add a module boundary for one predicate. (b) recognise the empty message in the adapter layer — rejected: the adapter is tool-agnostic; "what counts as a Base line" is `bases`-specific knowledge that belongs in the `bases` handler (Principle I).

---

## D2 — Positive `.base` filter, not message-match (clarify-settled)

**Decision**: On a clean exit, keep only stdout lines that end in `.base` (matched case-insensitively); drop every other line (the informational message, blank lines, whitespace-only lines).

**Rationale**: Recorded in spec Clarifications (Session 2026-06-30). The positive cue is **wording-independent**: it satisfies FR-002 ("current wording, or any future re-wording") for free, because membership never depends on the message text. It introduces no new error code (Principle IV) and matches the architecture's existing handler-side response-inspection idiom — inspect clean-exit stdout positively, let the CLI-failure path own errors.

**Alternatives considered**:
- **Negative message-match** (regex on "No base files found…", mirroring `views_base`'s `NOT_A_BASE_FILE_PATTERN`) — rejected: re-couples membership to upstream copy; a future re-wording silently regresses to the count=1 fake entry, breaking FR-002. (`views_base`'s pattern is for an *error* condition, not for list membership — a different problem.)
- **Hybrid** (positive filter + a defensive assert that the dropped line was the known message) — rejected: extra branches with no acceptance-criterion payoff, and the cross-check itself could throw on a benign re-word, manufacturing a failure where there is none.

---

## D3 — The empty vault is a SUCCESS, not an error

**Decision**: Treat the empty vault as a successful listing yielding `{ bases: [], count: 0 }`. Do NOT raise `UpstreamError` for it.

**Rationale**: The native `bases` subcommand exits 0 and prints an informational line to stdout when the vault has no `.base` files; `invokeCli` returns normally. Per the spec's own contract and Principle IV's "no silent fallback" being about *masking failures*, a genuine zero-result is not a failure — surfacing it as an error would be the opposite mistake (a false negative on a healthy vault). This is why the fix adds **no** new top-level code and **no** new `details.reason` sub-state (ADR-015 N/A): there is no new failure state, only a corrected success shape.

**Corroboration**: The defect symptom (count=1, name = the message) is *only reachable* if `invokeCli` returned successfully with the message on stdout. A non-zero exit would have thrown before the parse, producing an error rather than count=1. So the exit-0-on-stdout channel is implied by the bug report itself; D7 verifies it empirically.

---

## D4 — The populated path is byte-identical to today

**Decision**: Preserve today's populated-vault output exactly — same membership, same lexicographic sort.

**Rationale**: On a populated vault, every stdout line the CLI emits is a `.base` path. Today's pipeline is `split → trim → filter(non-empty) → sort`; the new pipeline is `split → trim → filter(lower.endsWith(".base")) → sort`. The only lines the new predicate removes that the old kept are non-`.base` lines — which a populated vault does not emit. Therefore the filtered, sorted output is identical (FR-004 / SC-003). A regression test asserts the exact pre-fix list for a multi-base fixture.

**Alternatives considered**: re-sort or de-duplicate — rejected: out of scope and would risk changing populated output.

---

## D5 — Retain `trim()`; match `.base` case-insensitively

**Decision**: Keep the existing per-line `trim()`; apply the predicate as `line.toLowerCase().endsWith(".base")`.

**Rationale**: `trim()` (already in the current handler) absorbs a trailing CR on Windows CRLF stdout, so a `My Base.base\r` line still ends in `.base` after trimming. Matching case-insensitively future-proofs against a vault whose file uses `.Base`/`.BASE` casing (rare, but the predicate costs nothing to make robust). Unlike `views_base` — which must NOT trim because trailing characters are part of a *view name* — a `bases` entry is a file path whose significant suffix is the `.base` extension, so trimming is safe and matches current behaviour.

**Verification**: T0 P2 records the real on-disk extension casing; the case-insensitive predicate is correct regardless of the answer.

---

## D6 — Correct the stale test fixture (it never reproduced the defect)

**Decision**: Rewrite the existing `handler.test.ts` case "happy: empty vault returns count=0" so its fixture is the **real** empty emission (`stdout: "No base files found in vault\n"`, exit 0), not the current `stdout: ""`.

**Rationale**: The present fixture (`stdout: ""`) yields count 0 under *both* the buggy and the fixed handler — it is green on `main` despite the bug, so it provides no protection. The corrected fixture is **red on `main`** (the blind split yields count 1) and **green after the fix** — a genuine regression guard, which is the whole point of Principle II coverage for this change.

---

## D7 — Empty-channel verification gate (T0 P1)

**Decision**: Before finalising, run a T0 probe confirming the empty-vault emission is exit-0 with the informational line on stdout (and capture stderr for completeness). Single-arm decision tree.

**Rationale**: D2's mechanism (filter stdout on clean exit) is correct **iff** the empty case arrives as a clean-exit stdout line — which D3 argues the defect already implies. The probe removes the last empirical doubt cheaply, per the project's T0 discipline (drive `Obsidian.com`, authorised TestVault scratch subdir; see [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)).

**Per-outcome arms**:
- **Expected — exit 0, message on stdout, no `.base` line**: positive filter on stdout is exactly right; ship the plan of record.
- **Surprise — message on stderr / non-zero exit**: would mean the current handler could not have produced count=1, contradicting the bug report; re-examine the reproduction before coding (not expected; flagged so the response is defined, not silent).

**Output**: research complete. All decisions recorded; the sole open item is a confirmation gate with a defect-implied expected outcome.
