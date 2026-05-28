# Phase 0 Research: Complete Search Truncation

All Technical Context items were resolved without open NEEDS CLARIFICATION markers. The single spec-level clarification (universe bound) was resolved in the spec's Clarifications section on 2026-05-28: entire match set, no wrapper-side cap. The research below consolidates the empirical basis and resolves the remaining plan-level design decisions.

## Decision 1 — Stop forwarding the caller's `limit` to upstream; fetch the full match set

**Decision**: Omit the `limit` parameter from the upstream `search` / `search:context` invocation in all three truncation sites. Compute `appliedCap = input.limit ?? DEFAULT_CAP` and use it solely as the wrapper-side output-slice bound.

**Rationale**: The 2026-05-28 T0 upstream-order probe (archived at `specs/053-fix-search-truncation/.scratch/t0-upstream-order-probe-2026-05-28/FINDINGS.md`) established empirically:

- §1 — Upstream's pre-`limit` order is opaque and not path-ascending (observed `body-3, body-5, body-2, body-4, body-1`; deterministic but corresponding to no lexicographic/numeric/mtime/inode order).
- §2 — Under `limit=N`, upstream returns **exactly** the leading N of its own order — a strict prefix of the unbounded response, never N+1, never the full set.
- §3 — `search:context` behaves identically; `limit` counts files, not line matches.
- §4 — Therefore the wrapper, by forwarding `limit` (default mode `appliedCap+1`; line/context `appliedCap`), only ever sees an upstream-clipped, non-representative subset. Entries that would be the path-ascending leading N (`body-1, body-2`) may never reach the wrapper. The BI-0084 sort-then-slice is correct but operates on the wrong input set.

An unbounded upstream call returns the full match set (the probe's §1 unbounded run returned all five), so omitting `limit` is sufficient to obtain the full set in a single call for the realistic vault scale this project targets.

**Alternatives considered**:

- *Pass a high sentinel `limit` (e.g. 10000) instead of omitting it*: equivalent in effect for sets below the sentinel, but reintroduces the exact clipping bug for sets above it, and couples correctness to an arbitrary magic number. Rejected — omitting `limit` is the honest "give me everything" request and matches the no-cap clarification (FR-010).
- *Two-phase fetch (small probe first, full fetch only on suspected clip)*: doubles the round-trip count and complicates the handler for no correctness gain. Rejected per T0 §5 ("the alternative … doubles the round-trip count and complicates the handler").
- *Pagination loop*: only needed if a single upstream call imposes a hard server-side maximum. The probe found no such cap for the test corpus. Held in reserve per spec Assumption A3 — if a future probe reveals a single-call cap, pagination (not a wrapper cap) is the resolution; out of scope for this BI absent evidence of such a cap.

## Decision 2 — Preserving `truncated` semantics after the upstream-cap signal is removed

**Decision**: Re-derive `truncated` directly against the now-full collection, preserving each mode's existing observable firing character:

- **`search` default mode**: `truncated = mdOnly.length > appliedCap` (precise — fires only on a real drop).
- **`search` line mode** and **`context_search`**: `truncated = flat.length >= appliedCap` (conservative — fires on a real drop when `>`, and at `=== appliedCap` with no actual drop).

**Rationale**: The spec pins two preserved invariants:

- FR-005 / Out-of-Scope: "Changing the conservative `truncated: true` flag-firing rule, including the case where the flag fires when the match count equals `limit` with no actual drop" is out of scope — i.e. that conservative firing must be **retained**.
- The `count` invariant (FR-004) — `count === returned-array length` — is enforced by the existing output-schema `.refine` and is untouched.

Today the conservative fire is implemented as `cliFileCapFired = mdOnly.length === appliedCap`, a proxy for "upstream hit its forwarded file cap". Once the wrapper stops forwarding `limit`, upstream no longer caps the file count, so that proxy is no longer a meaningful signal — it cannot be preserved literally. The faithful realization of the **observable** rule the spec describes ("fires when the match count equals `limit`") is a direct comparison of the full flattened match count against `appliedCap`: `flat.length >= appliedCap`.

Default mode was never conservative (its `appliedCap+1` probe fired only when the full set strictly exceeded `appliedCap`; a full set of exactly `appliedCap` returned `appliedCap`, not `appliedCap+1`, so `truncated` stayed absent). Preserving that precise character means default mode uses `>`, not `>=`. The asymmetry between default (`>`) and line/context (`>=`) is intentional and mirrors the pre-existing asymmetry; it is not an oversight.

**Truth table** (let `S` = full collection size for the mode — `mdOnly.length` for default, `flat.length` for line/context):

| Mode | S vs appliedCap | actual drop? | `truncated` (new) | `truncated` (old) | preserved? |
|------|-----------------|--------------|-------------------|-------------------|------------|
| default | S > cap | yes | true | true | identical |
| default | S == cap | no | absent | absent | identical |
| default | S < cap | no | absent | absent | identical |
| line/context | S > cap | yes | true | true | identical |
| line/context | S == cap | no | true | true* | identical* |
| line/context | S < cap | no | absent | absent | identical |

\* Edge-case nuance: the old line/context fire keyed on **file** count (`mdOnly.length === appliedCap`), while the new rule keys on **flattened match** count (`flat.length >= appliedCap`). For the common case (one match per file) these coincide. They diverge only when a query produces multiple matches per file such that the file count is below `appliedCap` but the flattened match count reaches it: old → `truncated` absent, new → `truncated` true. The new behaviour is the one the spec's Out-of-Scope text literally prescribes ("fires when the match count equals `limit`"), so the divergence moves the implementation **toward** the stated rule, not away from it. Flagged for reviewer attention in the plan.

**Alternatives considered**:

- *`truncated = flat.length > appliedCap` for line/context (precise, drop-only)*: simpler, but **drops** the conservative count==limit fire, directly contradicting the Out-of-Scope mandate. Rejected.
- *Reconstruct a synthetic file-cap signal*: would require re-imposing an upstream file limit, which is the very thing being removed. Rejected — incoherent with Decision 1.

## Decision 3 — Over-fetch output-cap trade-off

**Decision**: Accept that omitting the upstream `limit` makes the CLI-to-wrapper pipe carry the full match set on every call. No new guard, no new error code. Pathological common-term queries that overflow the cli-adapter's 10 MiB output cap continue to surface through the existing `CLI_OUTPUT_TOO_LARGE` / `CLI_NON_ZERO_EXIT` `UpstreamError` codes.

**Rationale**: Spec Clarification 2026-05-28 + Assumptions A3/A4 accept vault-scale fetch cost as a consequence of the no-cap contract; the response to a performance concern is a better retrieval/sort strategy, never a contract narrowing. T0 §5 reaches the same conclusion ("This is the correct trade-off for correctness"). The existing output-cap backstop already covers the overflow case with a documented recovery path (narrow `folder` / `query` / `limit`), satisfying Principle IV without any new code. SC-006 (zero new error codes) is preserved.

**Alternatives considered**:

- *Wrapper-side universe cap to bound the fetch*: rejected by the spec clarification (Option B was declined).
- *New `CLI_RESULT_SET_TOO_LARGE` error code*: rejected — adds a top-level code, breaking the Principle IV zero-new-codes streak, for a case the existing cap already handles.

## Decision 4 — Test strategy

**Decision**: Drive the merge-gating proof entirely through in-process unit tests that mock `invokeCli` to return matches in upstream's non-path-ascending order; assert the handler returns the path-ascending leading N and the correct `truncated` value. Real-CLI T0 re-validation against the `body-{1..5}` fixture is a manual quickstart step, not part of the vitest gate.

**Rationale**: Per the project's unit-only test scope, the vitest suite mocks `invokeCli` and never invokes the real binary. Mocking lets a test return a deliberately scrambled order (e.g. `body-3, body-5, body-2, body-4, body-1`) and assert the path-ascending leading N — directly exercising the bug the real CLI exhibits, without a live vault. Live-CLI probes are governed by `.memory/test-execution-instructions.md` and belong to the manual quickstart, mirroring BI-0084's split.

**Alternatives considered**:

- *Live-CLI integration test in the gate*: rejected — violates the unit-only gate scope and requires the authorised test vault, which is unavailable in CI.
