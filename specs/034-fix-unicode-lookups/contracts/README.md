# Contracts: Fix Unicode Lookups

**Status**: No new or changed contracts in this BI.

## Rationale

This feature is a defect repair confined to the input-decode step of seven eval-composition tools. Per [spec.md](../spec.md) FR-007 and SC-005, this change:

- introduces **no** new MCP tool,
- changes **no** existing tool's request schema (zod input shape),
- changes **no** existing tool's response shape (output schema),
- changes **no** existing tool's error envelope or error-code roster,
- adds **no** new `(top-level-code, details.code)` pair or sub-state under any existing pair.

The fix removes a corruption step that ran below the schema boundary; the contract layer above it is byte-stable.

## Verification

Constitution Principle II (Public Surface Test Coverage) ships co-located tests per modified tool — but these are happy-path + non-ASCII boundary tests against the existing contracts, not new contract artefacts.

The registration-baseline contract test at [src/tools/_register-baseline.test.ts](../../../src/tools/_register-baseline.test.ts) enforces that every tool's `descriptionFingerprint` and `schemaFingerprint` (in [_register-baseline.json](../../../src/tools/_register-baseline.json)) is byte-identical to the recorded baseline. This BI MUST leave that file unchanged. Any drift indicates an accidental schema or description change and blocks merge.

## What lives in `/contracts/` for this BI

Nothing. This README is the explicit record that the directory is intentionally empty — not forgotten.
