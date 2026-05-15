# Quickstart — 029-list-files-recursive

**Branch**: `029-list-files-recursive`
**Date**: 2026-05-15
**Status**: Phase 1 deliverable.

Verification scenarios Q-1..Q-28 mapped to spec success criteria SC-001..SC-022. Most cases run in CI as Vitest assertions against mocked `invokeCli`; a smaller manual subset runs at T0 of `/speckit-implement` against the authorised test vault.

## CI scenarios (Vitest)

### Schema validation (Q-1..Q-8 → SC-008)

**Q-1** — `target_mode: "specific"` with no `vault` → `VALIDATION_ERROR`, zero invokeCli calls.
**Q-2** — `target_mode: "active"` with `vault: "Demo"` → `VALIDATION_ERROR`, zero invokeCli calls.
**Q-3** — Any mode with `file: "Foo.md"` → `VALIDATION_ERROR`, zero invokeCli calls.
**Q-4** — Any mode with `path: "Foo/Bar.md"` → `VALIDATION_ERROR`, zero invokeCli calls.
**Q-5** — Unknown top-level key `{ target_mode: "active", foo: "bar" }` → `VALIDATION_ERROR`.
**Q-6** — `target_mode: "unknown"` → `VALIDATION_ERROR`.
**Q-7** — `total: "true"` (string), `total: 1`, `total: null` → all `VALIDATION_ERROR`.
**Q-8** — `depth: 0`, `depth: -1`, `depth: 1.5`, `depth: "2"`, `depth: null` → all `VALIDATION_ERROR`. `folder: 42`, `ext: ["md"]`, `folder: null` → all `VALIDATION_ERROR`.

### Handler — happy paths (Q-9..Q-14 → SC-001..SC-007)

**Q-9** — Specific-mode whole-vault listing: mock invokeCli returns envelope with mixed file/folder paths; assert response shape `{ count, paths }`, `count === paths.length`, folder entries end with `/`, file entries do not, sort is byte-asc.
**Q-10** — Sub-folder listing with `folder: "Inbox"`: assert response excludes paths outside `Inbox/` subtree.
**Q-11** — Depth-limited listing `depth: 1`: assert response contains only depth-1 entries (immediate children).
**Q-12** — Ext filter `ext: "md"`: assert response contains only `.md` files; no folder entries.
**Q-13** — Active-mode listing: assert dispatch shape carries `targetMode: "active"` and no `vault`.
**Q-14** — Cross-mode count: same fixture queried with `total: false` and `total: true` returns identical `count`; `total: true` response has `paths === []`.

### Handler — error paths (Q-15..Q-22 → SC-005, SC-010, SC-011, SC-013, SC-017)

**Q-15** — Mock envelope `{ ok: false, code: "FOLDER_NOT_FOUND", folder: "Missing" }` → handler throws `CLI_REPORTED_ERROR(stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder: "Missing")`.
**Q-16** — Mock envelope `{ ok: false, code: "NOT_A_FOLDER", folder: "notes/x.md" }` → handler throws `CLI_REPORTED_ERROR(stage: "envelope-error", code: "NOT_A_FOLDER", folder: "notes/x.md")`.
**Q-17** — Mock invokeCli throws `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "unknown")` → handler propagates unchanged.
**Q-18** — Mock invokeCli returns empty-stdout transparent-open signature → `detectEvalVaultClosed` throws `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")`; handler propagates.
**Q-19** — Mock invokeCli throws `ERR_NO_ACTIVE_FILE` (active mode, no focus) → handler propagates unchanged.
**Q-20** — Mock invokeCli returns malformed JSON (`"=> nope"`) → `CLI_REPORTED_ERROR(stage: "json-parse")`.
**Q-21** — Mock invokeCli returns valid JSON failing envelope shape (`"=> {\"ok\":true}"`) → `CLI_REPORTED_ERROR(stage: "envelope-parse")`.
**Q-22** — Mock adapter cap-kill (`CLI_NON_ZERO_EXIT` from BI-003 cap mechanism) → handler propagates unchanged.

### Handler — invariants (Q-23..Q-26 → I-1..I-14)

**Q-23** — Single-spawn invariant: every handler invocation produces exactly one `invokeCli` call (spy.toHaveBeenCalledTimes(1)).
**Q-24** — Base64 payload round-trip: decode the captured `parameters.code` and assert the decoded JSON matches `{ folder, depth, ext, total }` with the expected normalised values (null for omitted optionals; default false for total).
**Q-25** — Frozen template byte-stability: SHA-256 of the FROZEN_TEMPLATE constant is locked. Drift fails the test (anti-injection regression).
**Q-26** — Trailing-slash invariant: mock envelope with mixed entries; assert every folder entry in the FINAL response ends with `/` and every file entry does not.

### Registration (Q-27, Q-28 → SC-014, SC-015)

**Q-27** — Tool registered with name `tree`; tool registry includes a new fingerprint in `_register-baseline.json`; existing tools' fingerprints UNCHANGED.
**Q-28** — Tool description carries the FR-028 trailing-slash promise (one-line); `docs/tools/tree.md` exists per BI-005 registry-consistency check; at least 4 worked examples in the doc.

## Manual T0 scenarios (live CLI)

Run at T0 of `/speckit-implement` against `…\TestVault-Obsidian-CLI-MCP\Sandbox\bi029-*` fixtures per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Each case asserts the LIVE CLI behaviour matches the spec; any divergence is a research finding that drives a spec amendment or task adjustment.

- **T0-M1** — Seed `Sandbox/bi029-mixed/` fixture (US1-style subtree). Call `tree({ target_mode: "active", folder: "Sandbox/bi029-mixed" })` against the focused TestVault. Assert response carries every file and folder with the trailing-slash invariant.
- **T0-M2** — Same fixture, `depth: 1` cap. Assert only immediate children.
- **T0-M3** — Seed `Sandbox/bi029-dot/` fixture with dotfiles. Call `tree({ ..., folder: "Sandbox/bi029-dot" })`. Assert dotfile filter eats every `.gitkeep` / `.hidden.md` / `.config/inner.md` entry.
- **T0-M4** — Path-traversal probe `folder: "../bait"`. Assert structured `CLI_REPORTED_ERROR` (vault-confined) — no listing of files outside the vault.
- **T0-M5** — Synthetic large fixture (5000 files under `Sandbox/bi029-large/`). Call `tree({ ..., folder: "Sandbox/bi029-large" })` WITHOUT `total` AND WITHOUT `depth` — assert structured output-cap error. Same fixture with `total: true` succeeds with the full count. Same fixture with `depth: 1` succeeds (single-level listing within cap).
- **T0-M6** — Missing folder `folder: "DoesNotExist"`. Assert `CLI_REPORTED_ERROR(stage: "envelope-error", code: "FOLDER_NOT_FOUND")`.
- **T0-M7** — Not-a-folder `folder: "Welcome.md"`. Assert `CLI_REPORTED_ERROR(stage: "envelope-error", code: "NOT_A_FOLDER")`.

## Inspection / structural cases (not runtime)

- **Insp-1** — Verify all three new source files (`schema.ts`, `handler.ts`, `index.ts`) carry the `// Original — no upstream. <intent>.` header (Principle V / FR-026).
- **Insp-2** — Verify the BI-029 registry fingerprint is included in `_register-baseline.json` and every prior-tool fingerprint is byte-stable.
- **Insp-3** — Verify the frozen JS template renders with EXACTLY one `__PAYLOAD_B64__` token (a `replace` invocation should produce a fully bound code string with no remaining tokens).
- **Insp-4** — Verify `docs/tools/tree.md` exists and is not a stub (must cover per-field input contract, both output-shape branches, depth-bounding semantics, folders-vs-files rule, failure-mode roster, ≥4 worked examples).

## Coverage matrix

| SC | Covered by |
|---|---|
| SC-001 | Q-9 |
| SC-002 | Q-10 |
| SC-003 | Q-11 |
| SC-004 | Q-12 |
| SC-005 | Q-15, Q-16, T0-M6, T0-M7 |
| SC-006 | Q-14 |
| SC-007 | Q-9 (sort assertion), Q-26 |
| SC-008 | Q-1..Q-8 |
| SC-009 | Q-9 (trailing-slash normalisation in fixture) — also asserted by T0-M1 trailing-slash input variant |
| SC-010 | Q-17 |
| SC-011 | Q-19 |
| SC-012 | T0-M4 |
| SC-013 | T0-M5 |
| SC-014 | Insp-2 |
| SC-015 | Q-28, Insp-4 |
| SC-016 | Test count >= 43 (data-model.md test inventory) |
| SC-017 | Q-15, Q-16 (no new top-level codes; FOLDER_NOT_FOUND / NOT_A_FOLDER under CLI_REPORTED_ERROR.details.code per ADR-015) |
| SC-018 | Research findings F1..F12 persisted in research.md |
| SC-019 | n/a — qualitative metric (verifiable by single-call architecture); locked by I-2 |
| SC-020 | Q-23, Q-25, Insp-3 |
| SC-021 | T0-M3 (dotfile filter live verification) |
| SC-022 | Q-26 (trailing-slash invariant byte-asserted on mock fixtures); T0-M1 (live verification) |

## Stop conditions

- The CI suite returns 43 passing tests minimum; any failure blocks merge.
- T0 manual cases produce observable behaviour matching the spec; any divergence drives a spec amendment via post-implement `/speckit-clarify` or an FR-024 characterisation roster update.
- Inspection cases all pass; missing attribution, missing baseline entry, missing docs file → block.
