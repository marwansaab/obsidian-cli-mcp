# Phase 1 — Quickstart: Verification Scenarios

**Branch**: `022-rename-typed-tools` | **Date**: 2026-05-12 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This document maps 12 verification scenarios (Q-1..Q-12) to the spec's success criteria (SC-001..SC-010). Every scenario is either a vitest unit test that already exists (migrated with its renamed source dir) or a new vitest test added by this BI. There are no manual / live-CLI scenarios — this BI has no external-system interaction (see research.md "Live-CLI / external-system findings").

## Verification matrix

| Scenario | What it verifies | SC mapping | Test mechanism | Status |
|----------|------------------|------------|----------------|--------|
| Q-1 | `tools/list` exposes the 5 new names exactly once each | SC-001 | Existing drift detector in `_register.test.ts` walks registry; `it.each(liveRegistryToolNames)` re-derives from renamed invariants-map keys | Already covered (registry walk + SDK round-trip) |
| Q-2 | `tools/list` does NOT expose any of the 5 retired names | SC-001 | New baseline-test Assertion 3 (explicit absence check) | New in this BI |
| Q-3 | Each renamed tool's input-schema `properties / required / additionalProperties` triple is byte-identical to pre-rename | SC-010 | Existing `_register.test.ts` invariants assertions (`assertInvariant`) — applied to the same five entries under their new keys | Already covered; key renames migrate it |
| Q-4 | Each renamed tool's output shape matches pre-rename for valid inputs | SC-002 | Existing handler tests under each renamed dir — `handler.test.ts` for `src/tools/read/`, `delete/`, `files/`, `set_property/`, `rename/` — assertions byte-identical pre/post rename | Already covered; co-located tests migrate |
| Q-5 | Each renamed tool's error codes match pre-rename for failure inputs | SC-003, SC-009 | Existing handler tests' failure-path assertions (VALIDATION_ERROR / CLI_REPORTED_ERROR / CLI_NON_ZERO_EXIT / etc.) — byte-identical pre/post | Already covered; co-located tests migrate |
| Q-6 | `help({ tool_name: <new> })` returns the doc body for each renamed tool | SC-006 | Existing help-tool handler test exercises a name → doc-file lookup; the 5 new docs (`docs/tools/read.md`, etc.) exist post-rename so the lookup succeeds | Covered post-`assertToolDocsExist` pass |
| Q-7 | `help({ tool_name: <old> })` returns tool-not-found for each retired name | SC-006 | Existing help-tool handler test already exercises tool-not-found for an orphan stub name (`append_note`); 5 new per-name cases added under the same `describe` block | New: 5 cases in `help/handler.test.ts` |
| Q-8 | `package.json.version` is `0.5.0` (MINOR bump from `0.4.4`) | SC-005 | Manual / CI: `node -p "require('./package.json').version"` returns `"0.5.0"` | Manual at branch tip |
| Q-9 | `CHANGELOG.md` contains the migration block listing all 5 mappings together | SC-004 | Manual / docs-audit: grep for the 5 old → new mapping lines within a single `## [0.5.0]` section | Manual at branch tip |
| Q-10 | `README.md` and `docs/tools/index.md` contain zero references to retired names | SC-007 | Manual grep: `grep -E '(read_note\|delete_note\|list_files\|write_property\|rename_note)' README.md docs/tools/index.md` returns zero matches | Manual at branch tip |
| Q-11 | `docs/tools/<new>.md` exists for each new name; `docs/tools/<old>.md` absent for each retired | SC-007 | Existing `assertToolDocsExist` boot-time check raises if any registered tool lacks its doc file; manual `git status` confirms old files removed | Already covered + manual |
| Q-12 | FR-018 durable test passes with the current baseline; fails with a precise deviation message under tamper conditions | SC-008 | New `_register.test.ts` baseline-stability `describe(...)` block with three assertions (matches / structural / retired-names-absent); a separate "tamper-test" assertion verifies the failure message names the deviating tool and fingerprint | New in this BI |

## Detailed scenarios

### Q-1 — `tools/list` exposes 5 new names (SC-001)

**Setup**: `createServer({ registerSignalHandlers: false })` → `listToolsViaRegistry()`.

**Assertion**: For each of `["read", "delete", "files", "set_property", "rename"]`, the returned `tools[].name` array contains the name exactly once.

**Test path**: `src/tools/_register.test.ts` — the existing `it.each(liveRegistryToolNames)` test row covers this once the invariants-map keys are renamed (per R7). No new code; the rename of `read_note → read` in the `invariants` map auto-causes `liveRegistryToolNames` to include `"read"` instead of `"read_note"`, and the `it.each` row asserts `read` is present.

### Q-2 — Retired names absent from `tools/list` (SC-001)

**Setup**: Same as Q-1.

**Assertion**: The `tools[].name` array's intersection with `["read_note", "delete_note", "list_files", "write_property", "rename_note"]` is empty.

**Test path**: New baseline-test Assertion 3 in `_register.test.ts`. The assertion's failure message names the retired tools that crept back in.

### Q-3 — Input-schema field set byte-identical (SC-010)

**Setup**: Existing `assertInvariant(toolName, schema)` helper applied to each renamed tool's live `inputSchema`.

**Assertion**: For each renamed tool, the published `properties` key set equals the pre-rename set (table in [data-model.md §6](data-model.md)); `required` array equals pre-rename; `additionalProperties === false` unchanged.

**Test path**: `src/tools/_register.test.ts` — the existing `assertInvariant` is invoked from the existing `it.each(liveRegistryToolNames)` block. The five renamed entries appear under their new keys with byte-identical bodies (only the key name changed).

### Q-4 — Output shape matches pre-rename (SC-002)

**Setup**: Each renamed tool's `handler.test.ts` has happy-path tests that drive a stub `spawnFn` and assert the returned MCP envelope payload.

**Assertion**: For each renamed tool, every existing happy-path test passes byte-identically after the rename (the test bodies migrate with `git mv`; only `describe(...)` block titles may be updated to the new name).

**Test path**:
- `src/tools/read/handler.test.ts` (was `src/tools/read_note/handler.test.ts`).
- `src/tools/delete/handler.test.ts` (was `src/tools/delete_note/handler.test.ts`).
- `src/tools/files/handler.test.ts` (was `src/tools/list_files/handler.test.ts`).
- `src/tools/set_property/handler.test.ts` (was `src/tools/write_property/handler.test.ts`).
- `src/tools/rename/handler.test.ts` (was `src/tools/rename_note/handler.test.ts`).

### Q-5 — Error codes match pre-rename (SC-003, SC-009)

**Setup**: Same files as Q-4; their failure-path test cases exercise the existing UpstreamError code surface (VALIDATION_ERROR, CLI_REPORTED_ERROR, CLI_NON_ZERO_EXIT, ERR_NO_ACTIVE_FILE, etc.).

**Assertion**: Every failure-path test passes byte-identically. No new error codes are introduced (FR-008 enforced by code review and the absence of any new `UpstreamError` subclass).

**Test path**: Same as Q-4.

### Q-6 — `help({ tool_name: <new> })` returns doc body (SC-006)

**Setup**: `createHelpTool()` from `src/tools/help/index.ts`; invoke its handler with each of the 5 new names.

**Assertion**: For each new name, the response's `content[0].text` is a non-empty string matching the body of `docs/tools/<new_name>.md`.

**Test path**: `src/tools/help/handler.test.ts` — existing test machinery exercises name → doc-file lookup; 5 new assertions added (or 1 parameterised `it.each`).

### Q-7 — `help({ tool_name: <old> })` returns tool-not-found (SC-006)

**Setup**: Same as Q-6; invoke with each of the 5 retired names.

**Assertion**: For each retired name, the response is a structured tool-not-found error using the same error shape `help` returns for an unknown name (e.g. `append_note` — already exercised in the existing test).

**Test path**: `src/tools/help/handler.test.ts` — new `it.each` over the 5 retired names; each asserts `isError === true` and the error payload's `code` matches the existing tool-not-found shape.

### Q-8 — Version bump (SC-005)

**Verification**: Manually run `node -p "require('./package.json').version"` at the branch tip; expect `0.5.0`. Optionally a one-line vitest assertion (`expect(pkg.version).toBe("0.5.0")`) inside `_register.test.ts` could verify this automatically, though that test would need its own roll-forward step.

### Q-9 — CHANGELOG migration block (SC-004)

**Verification**: Manual review of `CHANGELOG.md` after the BI lands. Confirm:

- A single `## [0.5.0]` section exists.
- Inside that section, a single `### Changed (BREAKING)` subsection (or equivalently-named block) lists all 5 mappings together.
- The migration block contains the strings `read_note`, `delete_note`, `list_files`, `write_property`, `rename_note` (old anchors) and `read`, `delete`, `files`, `set_property`, `rename` (new anchors).
- No other section in CHANGELOG.md references the rename.

A docs-audit one-liner: `grep -c 'read_note.*->.*read' CHANGELOG.md` returns `1` (a single mapping line under the new section).

### Q-10 — README and docs/tools/index.md cleanup (SC-007)

**Verification**: `grep -E '(read_note|delete_note|list_files|write_property|rename_note)' README.md docs/tools/index.md` returns zero matches.

### Q-11 — Doc-file presence (SC-007)

**Verification**:
- `ls docs/tools/{read,delete,files,set_property,rename}.md` succeeds for all 5.
- `ls docs/tools/{read_note,delete_note,list_files,write_property,rename_note}.md` fails for all 5 (files removed).
- `assertToolDocsExist` boot-time check passes (which it must, or `createServer` would throw at boot).

### Q-12 — FR-018 durable test + tamper-test (SC-008)

**Setup**: New `describe("registry: stability baseline (FR-018)", ...)` in `src/tools/_register.test.ts`. Three assertions per [contracts/registry-baseline.contract.md §4](contracts/registry-baseline.contract.md):
- Assertion 1: live fingerprints match baseline.
- Assertion 2: baseline file conforms to schema.
- Assertion 3: retired names absent.

**Tamper-test** (additional verification, not a permanent test case — performed once at /speckit-implement to confirm the failure mode works):

1. Mutate one byte in `src/tools/_register-baseline.json` (e.g. flip one hex char of a fingerprint).
2. Run `npm test`.
3. Confirm Assertion 1 fails with a diff that names the mutated tool and shows old-vs-new fingerprint.
4. Revert the byte; tests pass again.

Alternative tamper: introduce a spurious tool factory in `src/server.ts` and re-run. Assertion 1 fails with an "extra tool" diff. Revert and re-run.

This tamper-test is a one-shot validation at /speckit-implement; it is NOT checked in as a permanent test case (a test that intentionally fails has the wrong semantic). The implementation commit message records the tamper-test result as evidence the test machinery actually detects deviations.

## Coverage summary

All 10 success criteria from spec.md (SC-001..SC-010) are covered by the 12 scenarios above. Mapping:

| SC | Covered by |
|----|------------|
| SC-001 (`tools/list` reflects punch-list) | Q-1, Q-2 |
| SC-002 (call success preserves output) | Q-4 |
| SC-003 (call failure preserves error code) | Q-5 |
| SC-004 (single changelog block) | Q-9 |
| SC-005 (MINOR semver bump) | Q-8 |
| SC-006 (`help` routes by new name; rejects old) | Q-6, Q-7 |
| SC-007 (README + docs use new names) | Q-10, Q-11 |
| SC-008 (FR-018 durable test catches deviations) | Q-12 |
| SC-009 (no new error codes) | Q-5 (by inspection — set of error codes asserted is the pre-rename set) |
| SC-010 (no schema-field changes) | Q-3 |

## Pre-release checklist

Before merging the rename branch:

- [ ] `npm run lint` passes with zero warnings.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm test` (the full suite, with coverage) passes; coverage threshold met or ratcheted upward in `vitest.config.ts`.
- [ ] Q-1..Q-12 all green.
- [ ] `git grep -E '(read_note|delete_note|list_files|write_property|rename_note)' -- README.md docs/tools/index.md` produces zero matches.
- [ ] CLAUDE.md active-narrative top-block describes 022; predecessor 021..015 blocks intact.
- [ ] `git log --oneline main..HEAD` shows expected commit shape (per /speckit-tasks output) with no surprise commits.
- [ ] PR description's Constitution Compliance checklist marks I/II/III/IV/V all `Y`.
