# Contract: Leading-N over the full match set + truncation flag

**Surfaces**: `search` (default + line modes), `context_search`
**Status**: target contract after BI-055 lands. Supersedes the BI-0110 help-doc truncation-direction description.

## C1 — Leading-N over the full match set

For a query matching a set `M` of notes/records, ordered path-ascending as `O = sort(M)`:

- `search` with `limit = N` MUST return exactly `O[0 .. min(N, |M|)-1]` (default mode: the paths; line mode: the per-line matches of those entries).
- `context_search` with `limit = N` MUST return matches covering exactly `O[0 .. min(N, |M|)-1]`.
- The returned subset MUST be independent of the order in which upstream surfaces results. (Upstream order is opaque and non-path-ascending per T0 §1.)

**Negative form**: the wrapper MUST NOT forward the caller's `limit` (nor any caller-derived value such as `limit + 1`) to upstream as the result-set bound. Upstream is invoked without a `limit`, so it returns the full match set; the slice happens wrapper-side after the path-ascending sort. (FR-001, FR-002, FR-003, FR-010.)

## C2 — `count` invariant (unchanged)

`count` MUST equal the length of the returned `paths` / `matches` array. Enforced by the existing output-schema `.refine`. (FR-004.)

## C3 — `truncated` firing (observable behaviour preserved)

`truncated` is `z.literal(true).optional()` — present only when truncation fires; absent means `false`.

Let `S` be the full-collection size for the mode (`mdOnly.length` for default; `flat.length` for line/context), compared against `appliedCap = input.limit ?? DEFAULT_CAP`:

- `search` **default mode**: `truncated === true` iff `S > appliedCap` (precise).
- `search` **line mode** and `context_search`: `truncated === true` iff `S >= appliedCap` (conservative — fires at `S == appliedCap` even with no actual drop).

This preserves each mode's pre-existing observable firing. The conservative count==limit fire (line/context) MUST be retained — it is explicitly out of scope to change. (FR-005.)

## C4 — No new error codes

Over-fetch of large result sets MUST surface only through existing `UpstreamError` codes (`CLI_OUTPUT_TOO_LARGE`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`). No new top-level code, no new `details.code`. (SC-006, Principle IV.)

## C5 — Help-doc fidelity

The `search` and `context_search` help-doc truncation-direction descriptions MUST state that the wrapper fetches the full match set (no upstream `limit`), sorts path-ascending, then slices to `limit`, so the visible subset is the leading N of the deterministic ordering across the full match set. A reader running the documented call against the documented fixture MUST observe a response matching the documented description verbatim. (FR-006, FR-007, SC-003, SC-004.)

## Test obligations (unit, mocked `invokeCli`)

Each surface ships, in the same change, at least:

1. **Leading-N over scrambled upstream order** — stub `invokeCli` to return matches in a non-path-ascending order (e.g. `body-3, body-5, body-2, body-4, body-1`); assert the handler returns the path-ascending leading N (`body-1, body-2` for `limit = 2`). Proves C1.
2. **`truncated` real-drop** — `S > appliedCap`; assert `truncated === true` and `count === appliedCap`. Proves C3 (drop branch).
3. **`truncated` conservative / boundary** — line/context: `S === appliedCap` with no drop → `truncated === true`; default: `S === appliedCap` → `truncated` absent. Proves C3 (preserved asymmetry) and C2.
4. **Total ≤ limit** — `S < appliedCap`; assert all entries returned in path-ascending order, `truncated` absent, no drop. Proves C1 (no-truncation path) + C2.

Default mode and line mode of `search` are tested independently (two distinct pipelines in `search/handler.ts`).
