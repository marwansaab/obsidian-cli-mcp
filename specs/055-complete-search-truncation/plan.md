# Implementation Plan: Complete Search Truncation

**Branch**: `055-complete-search-truncation` | **Date**: 2026-05-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/055-complete-search-truncation/spec.md`

## Summary

BI-0084 (v0.7.11) made the wrapper sort-then-slice, but the wrapper still forwards the caller's `limit` to upstream (`search` default mode forwards `appliedCap + 1`; `search:context` line mode and `context_search` forward `appliedCap`). The 2026-05-28 T0 probe proved upstream clips to the leading N of its own opaque, non-path-ascending order **before** the wrapper sees the data, so the wrapper sorts and slices a non-representative subset. The fix: stop forwarding the caller's `limit` to upstream, fetch the entire match set, sort path-ascending wrapper-side, then slice to `appliedCap`. The truncation-detection probes (which were coupled to the forwarded upstream limit) are re-derived against the now-full collection while preserving each mode's existing observable `truncated`-firing behaviour. No schema changes, no new error codes, no new parameters. The `search` / `context_search` help-doc truncation-direction sections are rewritten in the same change set.

## Technical Context

**Language/Version**: TypeScript, strict mode, Node.js >= 22.11
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`
**Storage**: N/A
**Testing**: `vitest` with `@vitest/coverage-v8`; unit tests mock `invokeCli` (no live CLI in the merge-gating suite)
**Target Platform**: Node.js (cross-platform MCP server)
**Project Type**: Library / MCP server
**Performance Goals**: N/A for correctness; see Constraints for the over-fetch trade-off
**Constraints**: Wrapper-internal only — upstream Obsidian CLI is a black box. Omitting the upstream `limit` means the CLI-to-wrapper pipe now carries the full match set on every `search` / `context_search` call; the existing 10 MiB cli-adapter output cap (surfaced as `CLI_OUTPUT_TOO_LARGE` / `CLI_NON_ZERO_EXIT`) remains the backstop for pathological common-term queries. Accepted per spec Clarification 2026-05-28 and Assumptions A3/A4 — correctness over pipe economy; no contract narrowing.
**Scale/Scope**: Two handler files, three truncation sites (search default, search line, context_search), plus two help-doc rewrites and co-located test additions. ~15–25 lines of production code changed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|------|--------|----------|
| Principle I (Modular Code Organization) | Y | No new modules. Changes confined to the two existing per-surface handler files; the `context_search → search` import direction (`stripBoundarySlashes`, `searchContextWireSchema`) is unchanged. No new cross-module edges. |
| Principle II (Public Surface Test Coverage) | Y | Both `search` and `context_search` are modified surfaces. New leading-N-over-full-set tests + truncated-firing tests added to both `handler.test.ts` files in the same change. Happy-path + boundary (count==limit, total<=limit) covered. |
| Principle III (Boundary Input Validation with Zod) | N/A | No schema changes. `limit` min/max, `query` refine, output schemas all unchanged; existing Zod boundary validation untouched. |
| Principle IV (Explicit Upstream Error Propagation) | Y | No new error codes, no new `details.code` values. Over-fetch failures continue to surface through the existing `UpstreamError` codes (`CLI_OUTPUT_TOO_LARGE`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`); no `catch` masks a failure. Zero-new-code streak preserved (SC-006). |
| Principle V (Attribution & Layered Composition) | Y | Both handlers carry `Original — no upstream` headers. Headers' prose descriptions of the truncation pipeline are updated to match the new fetch-full-then-slice flow in the same change. |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | N/A | No tool added or renamed. |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | No plugin-backed tool added. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | No plugin-backed tool added. |
| ADR-015 (Sub-Discriminators via details.reason) | N/A | No new `(top-level-code, details.code)` pair and no new sub-states. |

No violations. Complexity Tracking table is empty.

### Graphify structural check

**Scope**: this BI's diff touches `src/**` (two handlers + two test files) and docs (two help docs). Not docs-only; the `src/**` rules apply.

**Affected communities**: `executeSearch` (search/handler community) and `executeContextSearch` (context_search/handler community). Both are runtime-spine consumers — they call `invokeCli` and construct `UpstreamError`, but modify neither. Same change surface as BI-0084 (053-fix-search-truncation), which reordered sort/slice in these exact two functions.

**Kernel-node touch surface**: this BI touches **none** of the kernel nodes (`createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`). `UpstreamError` is imported and instantiated by both handlers but its definition, interface, and error-code set are unchanged — no new code is added to the `src/errors.ts` community. No production handler reaches into the boot-time DI factories; `createLogger()` / `createQueue()` remain confined to `server.ts`. The change is entirely within the post-`invokeCli` pipeline of the two handlers' own scope (what `parameters.limit` gets sent upstream, and how `truncated` is computed from the returned collection).

**Cross-module impact**: `context_search/handler.ts` continues to import `stripBoundarySlashes` from `search/handler.ts` and `searchContextWireSchema` from `search/schema.ts`. Neither import changes; the dependency direction (context_search → search) is preserved. No new imports introduced.

**Post-implement verification target**: confirm no new error-class node appears outside `src/errors.ts`, no handler imports the DI factories, and the new test fixtures land in the existing search / context_search communities (not a surprise community). Run `/graphify --update` after implement.

## Project Structure

### Documentation (this feature)

```text
specs/055-complete-search-truncation/
├── plan.md              # This file
├── research.md          # Phase 0 — T0 consolidation + truncated-flag design decision
├── data-model.md        # Phase 1 — fetch-full → sort → slice pipeline + truncated truth table
├── quickstart.md        # Phase 1 — verification guide (fixture, calls, expected subsets)
├── contracts/
│   └── leading-n-truncation.md  # Leading-N-over-full-set + truncated-firing contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (via /speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── search/
│   │   ├── handler.ts        # FIX: drop upstream limit forwarding; re-derive truncated for default + line modes; update header prose
│   │   └── handler.test.ts   # ADD: leading-N-over-full-set + truncated-firing assertions (default + line)
│   └── context_search/
│       ├── handler.ts        # FIX: drop upstream limit forwarding; re-derive truncated; update header prose
│       └── handler.test.ts   # ADD: leading-N-over-full-set + truncated-firing assertions
docs/
└── tools/
    ├── search.md             # REWRITE: "Truncation slice direction" + "Conservative truncation in line mode" to describe full-set fetch
    └── context_search.md     # REWRITE: "Truncation slice direction" + "Conservative truncation" to describe full-set fetch
```

**Structure Decision**: No new directories. Changes are confined to the two existing per-surface handler modules, their co-located test files, and the two help docs. `docs/tools/search_vault.md` is the deprecated-alias doc and is checked during implement for any stale truncation-direction prose, but no rewrite is planned unless it carries a BI-0110 truncation-direction section.

## Complexity Tracking

> No Constitution Check violations. Table empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |

## Implementation Approach

### Fix pattern — drop the upstream limit, slice wrapper-side

For all three truncation sites the upstream call stops carrying the caller-derived `limit`. `appliedCap = input.limit ?? DEFAULT_CAP` is still computed and used **only** as the wrapper-side output-slice bound (FR-010 — `DEFAULT_CAP` governs the default output slice, never the fetch universe).

**`search` default mode** (`search/handler.ts`, currently L66 + L144–153):

- Remove `appliedCap + 1` from the upstream `parameters.limit`. Omit the upstream `limit` entirely so upstream returns the full match set (T0 §1 confirms an unbounded call returns every match).
- Truncation detection moves from the `appliedCap + 1` probe to a direct comparison against the full collection: `const truncated = mdOnly.length > appliedCap;` — **precise**, identical observable behaviour to today (default mode never conservatively over-fired; count==cap with no drop → `truncated` absent).
- `const sorted = [...mdOnly].sort(); const trimmed = truncated ? sorted.slice(0, appliedCap) : sorted;`

**`search` line mode** (`search/handler.ts`, currently L66 + L103–133) and **`context_search`** (`context_search/handler.ts`, currently L69 + L135–155):

- Omit the upstream `limit` so upstream returns all matching files (T0 §3 confirms `search:context` behaves identically to `search`).
- The `cliFileCapFired = mdOnly.length === appliedCap` probe was a proxy for "upstream hit its file cap"; it is meaningless once upstream is not capping. Re-derive the **observable** conservative rule directly against the full flattened collection: `const truncated = flat.length >= appliedCap;` (fires on real drop when `>`, and conservatively when `=== appliedCap` with no drop — the case spec Out-of-Scope explicitly mandates preserving).
- `const sorted = [...flat].sort((a,b) => path asc then line asc); const trimmed = sorted.slice(0, appliedCap);` (slice is a no-op when `flat.length <= appliedCap`).

The full design rationale and a mode-by-mode truth table are in [research.md](research.md) (decision: "Preserving `truncated` semantics after the upstream-cap signal is removed") and [data-model.md](data-model.md). The one observable edge-case shift this introduces — line/context mode now fires `truncated` when the flattened match count equals `appliedCap` even if the file count is below `appliedCap` (previously the file-count proxy would not fire there) — is documented and flagged for reviewer attention; it brings the implementation **into** alignment with the Out-of-Scope's stated conservative rule ("fires when the match count equals `limit`"), rather than away from it.

### Help-doc rewrite

`docs/tools/search.md` ("Truncation slice direction", L102–104; "Conservative truncation in line mode", L234–236) and `docs/tools/context_search.md` ("Truncation slice direction", L81–83; "Conservative truncation", L278–280) currently state the wrapper "sorts the full collection first, then slices". That phrasing is the now-stale BI-0110 contract: today "the full collection" is the upstream-clipped subset, so the worked examples can diverge from runtime. The rewrite states explicitly that the wrapper fetches the **entire match set** from upstream (no upstream `limit`), sorts path-ascending, then slices to the caller's `limit`, so the visible subset is the leading N of the deterministic ordering across the full match set. The "Inherited limitations" output-cap note is checked and, if needed, tightened to reflect that the full set now always crosses the pipe.

### Files changed

| File | Change | FR |
|------|--------|----|
| `src/tools/search/handler.ts` | Drop upstream limit (default + line); re-derive `truncated`; update header prose | FR-001, FR-003, FR-005, FR-010 |
| `src/tools/context_search/handler.ts` | Drop upstream limit; re-derive `truncated`; update header prose | FR-002, FR-003, FR-005, FR-010 |
| `src/tools/search/handler.test.ts` | Add leading-N-over-full-set + truncated-firing tests (default + line) | FR-001, FR-005, SC-001, SC-005 |
| `src/tools/context_search/handler.test.ts` | Add leading-N-over-full-set + truncated-firing tests | FR-002, FR-005, SC-002, SC-005 |
| `docs/tools/search.md` | Rewrite truncation-direction + conservative-truncation sections | FR-006, SC-003 |
| `docs/tools/context_search.md` | Rewrite truncation-direction + conservative-truncation sections | FR-007, SC-004 |

### Verification

Unit suite (mocked `invokeCli`) is the merge gate: stub upstream to return matches in upstream's non-path-ascending order (e.g. `body-3, body-5, body-2, body-4, body-1` per T0 §1), assert the handler returns the path-ascending leading N. A T0 re-validation against the real CLI + `body-{1..5}` fixture is a manual quickstart step (gated by `.memory/test-execution-instructions.md`), not part of the vitest gate.
