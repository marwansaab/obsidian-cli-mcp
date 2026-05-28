# Implementation Plan: Fix Search Truncation

**Branch**: `053-fix-search-truncation` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/053-fix-search-truncation/spec.md`

## Summary

The `search` and `context_search` tools apply `limit`-driven truncation **before** deterministic sorting, producing an arbitrary subset that is then re-sorted. Callers see a sorted slice of random-N entries from the CLI's return order instead of the first N entries of the deterministic ordering. The fix swaps the order of operations in all three truncation code paths: sort the full collection first, then take `.slice(0, appliedCap)`. No schema, error, or flag-firing changes.

## Technical Context

**Language/Version**: TypeScript, strict mode, Node.js >= 22.11
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`
**Storage**: N/A
**Testing**: `vitest` with `@vitest/coverage-v8`
**Target Platform**: Node.js (cross-platform MCP server)
**Project Type**: Library / MCP server
**Performance Goals**: N/A (logic-direction fix, no latency/throughput concern)
**Constraints**: Wrapper-internal only — upstream Obsidian CLI is a black box
**Scale/Scope**: Two handler files, three truncation sites, ~6 lines of production code changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|------|--------|----------|
| Principle I (Modular Code Organization) | Y | No new modules; changes confined to two existing handler files in their respective per-surface directories |
| Principle II (Public Surface Test Coverage) | Y | New leading-N-identity tests added to both `handler.test.ts` files in the same change |
| Principle III (Boundary Input Validation with Zod) | N/A | No schema changes; existing Zod boundary validation unchanged |
| Principle IV (Explicit Upstream Error Propagation) | N/A | No new error codes, no error-handling changes; `UpstreamError` usage untouched |
| Principle V (Attribution & Layered Composition) | Y | Existing `Original — no upstream` headers in both handler files remain accurate |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | N/A | No tool added or renamed |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | No plugin-backed tool added |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | No plugin-backed tool added |
| ADR-015 (Sub-Discriminators via details.reason) | N/A | No new error code pairs or sub-states |

No violations. Complexity Tracking table is empty.

### Graphify structural check

**Affected communities**: `executeSearch` (degree 5, search/handler community) and `executeContextSearch` (degree 14, context_search/handler community). Both are runtime-spine consumers — they call `invokeCli` and instantiate `UpstreamError` but do not modify either.

**Kernel-node touch surface**: This BI touches **none** of the kernel nodes (`createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`). `UpstreamError` is imported by both handlers but its definition, interface, and error-code set are unchanged. The fix is purely in the post-CLI pipeline — reordering two operations (`sort` and `slice`) within the handlers' own scope.

**Cross-module impact**: `context_search/handler.ts` imports `stripBoundarySlashes` from `search/handler.ts` and `searchContextWireSchema` from `search/schema.ts`. Neither of these imports is affected by the pipeline reorder; the cross-module dependency direction (context_search → search) is preserved.

## Project Structure

### Documentation (this feature)

```text
specs/053-fix-search-truncation/
├── plan.md              # This file
├── research.md          # Phase 0 — root cause analysis
├── data-model.md        # Phase 1 — pipeline order change
├── quickstart.md        # Phase 1 — verification guide
├── contracts/
│   └── truncation-pipeline.md  # Sort-before-slice invariant
└── tasks.md             # Phase 2 output (via /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── search/
│   │   ├── handler.ts        # FIX: three-site pipeline reorder (default + line modes)
│   │   └── handler.test.ts   # ADD: leading-N identity assertions
│   └── context_search/
│       ├── handler.ts        # FIX: one-site pipeline reorder
│       └── handler.test.ts   # ADD: leading-N identity assertions
docs/
└── tools/
    ├── search.md             # VERIFY: worked examples match runtime (no edit expected)
    └── context_search.md     # VERIFY: worked examples match runtime (no edit expected)
```

**Structure Decision**: No new directories. Changes are confined to two existing per-surface handler modules and their co-located test files.

## Complexity Tracking

> No Constitution Check violations. Table empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |

## Implementation Approach

### Fix Pattern

For each of the three truncation sites, the transformation is:

**Before** (current):
```typescript
const trimmed = exceeds ? collection.slice(0, appliedCap) : collection;
const sorted = [...trimmed].sort(comparator);
```

**After** (fixed):
```typescript
const sorted = [...collection].sort(comparator);
const trimmed = exceeds ? sorted.slice(0, appliedCap) : sorted;
```

The `exceeds` detection (`truncated` flag computation) continues to read from the untruncated `collection` and is unaffected by the reorder.

### Test Pattern

Each site gets a new test that:
1. Constructs a CLI stub returning results in reverse-sorted order (e.g., `["z.md", "m.md", "b.md", "a.md"]`).
2. Invokes the handler with a `limit` that triggers truncation (e.g., `limit: 2` with 4 results).
3. Asserts the returned entries are the first N of the deterministic sort (`["a.md", "b.md"]`), not the first N of the CLI order (`["z.md", "m.md"]`).

### Files Changed

| File | Change | FR |
|------|--------|----|
| `src/tools/search/handler.ts` | Swap sort/slice in default mode (L144–148) | FR-001, FR-003 |
| `src/tools/search/handler.ts` | Swap sort/slice in line mode (L113–128) | FR-001, FR-003 |
| `src/tools/context_search/handler.ts` | Swap sort/slice (L135–150) | FR-002, FR-003 |
| `src/tools/search/handler.test.ts` | Add leading-N identity tests (default + line) | FR-001, SC-001 |
| `src/tools/context_search/handler.test.ts` | Add leading-N identity test | FR-002, SC-001 |
