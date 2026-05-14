# Quickstart — `smart_connections_similar` Typed MCP Tool

**Feature**: [026-smart-connections-similar](./spec.md)
**Date**: 2026-05-15

This document is the Phase 1 verification scenarios artefact for `smart_connections_similar`. Each scenario (Q-1..Q-28) maps to one or more Success Criteria (SC-001..SC-028) in [spec.md](./spec.md). Most scenarios are executed by handler / schema / registration tests in CI (no real `obsidian` binary required; the cli-adapter's stub `spawnFn` is injected via `deps.spawnFn` per the established test-seam convention). A small subset (closed-but-registered vault, plugin uninstall, plugin not ready in fresh vault, multi-vault basename ambiguity) is executed manually against `TestVault-Obsidian-CLI-MCP` during T0 of `/speckit-implement` because the state changes are intrusive to script and easier to drive interactively.

**TestVault prerequisite for T0 cases**: the Smart Connections plugin must be installed AND initial embedding indexing must be complete. Probe vault size at plan stage was 68 sources (TestVault), 450 sources (The Setup), 22 sources (Ways of Working). Fixture notes seeded under `Sandbox/` per the [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) protocol; clean up post-probe.

**How to run CI cases**: `npm test -- src/tools/smart_connections_similar/`. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3); the base64-decoded payload is asserted bit-for-bit against the expected structural shape.

**How to run T0 cases**: open the requisite vault in Obsidian, follow the protocol gates in [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md), invoke the real wrapper via `executeSmartConnectionsSimilar(input, realDeps)` against the fixture, capture the response, and clean up.

---

## CI scenarios (Q-1..Q-10, Q-11b, Q-13..Q-22, Q-25..Q-28)

### Q-1 — Specific-mode by-path happy path

**SC-001, SC-007a**

CI handler test. Stub `invokeCli` returns a success envelope mirroring the live probe at F4: `{ok: true, count: 3, matches: [{path: "Topics/Neural-Networks.md", headingPath: ["Neural Networks", "Backpropagation"], score: 0.86}, {path: "Topics/Gradient-Descent.md", headingPath: [], score: 0.81}, {path: "Projects/ML-Project.md", headingPath: ["Overview"], score: 0.74}]}`. Invoke `executeSmartConnectionsSimilar({target_mode:'specific', vault:'Demo', path:'Topics/ML.md', limit: 20}, {invokeCli: stub})`.

**Assertions**: response carries `count: 3`, `matches.length: 3`; per-entry `path`, `headingPath`, `score` byte-faithful; `score` values monotonically non-increasing.

### Q-2 — Specific-mode by-file (basename) equivalence

**SC-002**

CI handler test. Same fixture as Q-1. Invoke with `{target_mode:'specific', vault:'Demo', file:'ML'}`. Stub's eval JS resolves `getFirstLinkpathDest('ML', '')` to the same source key as Q-1's `path`.

**Assertion**: response structurally equivalent to Q-1 — same `count`, same per-entry values, same order.

### Q-3 — Active-mode happy path

**SC-003**

CI handler test. Stub mocks `app.workspace.getActiveFile()` returning the same source as Q-1. Invoke with `{target_mode:'active'}`. Stub returns the Q-1 envelope.

**Assertion**: response identical to Q-1 (active-mode resolves the focused file, then the eval JS executes the same downstream pipeline).

### Q-4 — Active-mode + no focused file

**SC-004**

CI handler test. Stub returns the eval envelope `{ok:false, code:'NO_ACTIVE_FILE', detail:'No note focused.'}`. Invoke with `{target_mode:'active'}`.

**Assertion**: `executeSmartConnectionsSimilar` throws `UpstreamError` with `code: 'ERR_NO_ACTIVE_FILE'` (or `CLI_REPORTED_ERROR` per T0 lock — both satisfy FR-018).

### Q-5 — Zero-match contract (empty matches, no error)

**SC-005**

CI handler test. Stub returns envelope `{ok: true, count: 0, matches: []}` (semantic-outlier note with no neighbours above plugin's internal threshold).

**Assertion**: response `{count: 0, matches: []}`; no error thrown; cross-mode invariant holds (re-run with `total: true` produces same `count: 0`).

### Q-6 — Self-exclusion at source-level

**SC-006**

CI handler test. Stub returns envelope with a match whose key matches the source path exactly (`path === sourcePath`, `headingPath: []`) mixed in with valid neighbours. The in-eval `.filter(m => m.path !== sourcePath)` excludes the self-match before envelope emission.

**Assertion**: returned `matches` does NOT contain any entry whose `path` equals the source path; `count` reflects post-filter length.

### Q-6a — Self-exclusion at block-inside-source (NEW per Q3 amendment)

**SC-006**

CI handler test. Stub returns envelope with two matches whose `path` equals the source path: one source-level (`headingPath: []`) and one block-level (`headingPath: ["Section A"]`). The source-path-keyed filter excludes BOTH.

**Assertion**: returned `matches` excludes both self-entries regardless of `headingPath` shape; count reflects post-filter length. Locks the 2026-05-15 live-probe-driven amendment to grilling Q3.

### Q-7 — Three-level sort: score-tie + path-tie + headingPath-tie

**SC-007**

CI handler test. Stub returns envelope with four matches: two tied on `score: 0.85` (paths `A.md` and `B.md` — secondary tiebreak `path` byte-asc places `A.md` first); two tied on `score: 0.70` with same `path: "C.md"` (different `headingPath: ["X"]` vs `["Y"]` — tertiary tiebreak `headingPath.join("#")` byte-asc places `["X"]` first).

**Assertion**: order is `A.md`, `B.md`, `C.md#X`, `C.md#Y`. Three-level sort verified per FR-008.

### Q-7a — Per-match three-field exhaustive shape

**SC-007a**

CI handler test. Stub returns envelope where each match carries the exact three keys `{path, headingPath, score}` plus a speculative `original` field. The output zod schema `.strict()` rejects the extra field at the envelope-parse stage.

**Assertion**: handler throws `UpstreamError` with `details.stage: 'envelope-parse'`. Locks FR-007 exhaustive-fields contract.

### Q-8 — FILE_NOT_FOUND (unresolved locator)

**SC-008**

CI handler test. Invoke with `{target_mode:'specific', vault:'Demo', path:'DoesNotExist.md'}`. Stub returns envelope `{ok:false, code:'FILE_NOT_FOUND', detail:'path: DoesNotExist.md'}`.

**Assertion**: throws `UpstreamError` with `code: 'CLI_REPORTED_ERROR'`, `details: {stage:'envelope-error', code:'FILE_NOT_FOUND', detail:'path: DoesNotExist.md'}`. Repeat with `file: 'DoesNotExist'` (basename); same shape with `wikilink: DoesNotExist` detail.

### Q-9 — SOURCE_NOT_INDEXED (file exists, not in plugin's index)

**SC-009**

CI handler test. Stub returns envelope `{ok:false, code:'SOURCE_NOT_INDEXED', detail:'key: Topics/UnindexedNote.md'}` — the file exists in the vault but `env.smart_sources.items[key]` returned `undefined`.

**Assertion**: throws `UpstreamError` with `details.code: 'SOURCE_NOT_INDEXED'`. Distinct from FILE_NOT_FOUND (file does NOT exist) and SMART_CONNECTIONS_NOT_READY (plugin's API path unavailable).

### Q-10 — NOT_MARKDOWN (non-.md source)

**SC-010**

CI handler test. Invoke with `{target_mode:'specific', vault:'Demo', path:'Sandbox/probe.canvas'}`. Stub returns envelope `{ok:false, code:'NOT_MARKDOWN', detail:'path: Sandbox/probe.canvas extension: canvas'}` — in-eval `f.extension === 'md'` guard fired before plugin call.

**Assertion**: throws `UpstreamError` with `details.code: 'NOT_MARKDOWN'`. Parity with BI-025.

### Q-11 — VAULT_NOT_FOUND(unknown) — unregistered vault

**SC-011**

CI handler test. Invoke with `{target_mode:'specific', vault:'Unknown', path:'whatever.md'}`. Stub returns stdout `Vault not found.` (plain text, exit 0). The cli-adapter's 011-R5 inspection clause fires (inherited test surface).

**Assertion**: throws `UpstreamError` with `code: 'CLI_REPORTED_ERROR'`, `details.code: 'VAULT_NOT_FOUND'` (and `details.reason` absent or `"unknown"` per FR-017).

### Q-11a — VAULT_NOT_FOUND(not-open) — closed-but-registered vault (MANUAL T0)

**SC-011a**

MANUAL T0 against TestVault. Close a registered vault (e.g. "The Setup") in Obsidian while leaving it registered in `obsidian vaults` output. Invoke `executeSmartConnectionsSimilar({target_mode:'specific', vault:'The Setup', path:'Home.md'}, realDeps)`. Per F7 / F8 / F9, the CLI emits empty stdout + exit 0 AND transparently opens the vault as a side effect; the handler's empty-stdout-plus-known-vault detection fires.

**Assertion**: response is `CLI_REPORTED_ERROR(details.code: 'VAULT_NOT_FOUND', details.reason: 'not-open')`. NOT a generic JSON parse failure (which would lose the actionable signal). Re-running the same call after a brief delay should succeed (vault is now opening).

### Q-11b — FR-017b precedence chain (six adjacent-pair fixtures)

**SC-011b**

CI handler test. Six compound-failure fixtures, each pair verifying the earlier-priority discriminator fires:

1. `VAULT_NOT_FOUND(unknown)` vs `VAULT_NOT_FOUND(not-open)` — supply unregistered vault `Unknown` whose name is ALSO not in `obsidian vaults` output; assert `details.reason: "unknown"` (or absent).
2. `VAULT_NOT_FOUND(not-open)` vs `SMART_CONNECTIONS_NOT_INSTALLED` — closed-but-registered vault where SC plugin is also uninstalled; assert `details.reason: "not-open"` fires first.
3. `SMART_CONNECTIONS_NOT_INSTALLED` vs `FILE_NOT_FOUND` — plugin uninstalled AND path unresolved; assert `SMART_CONNECTIONS_NOT_INSTALLED` fires.
4. `FILE_NOT_FOUND` vs `NOT_MARKDOWN` — unresolved `path` with `.canvas` extension; assert `FILE_NOT_FOUND` (extension check follows resolution).
5. `NOT_MARKDOWN` vs `SMART_CONNECTIONS_NOT_READY` — `.canvas` source AND plugin's API path missing; assert `NOT_MARKDOWN` fires first.
6. `SMART_CONNECTIONS_NOT_READY` vs `SOURCE_NOT_INDEXED` — plugin loaded but `find_connections` not callable AND source not in index; assert `SMART_CONNECTIONS_NOT_READY` fires.

**Assertion**: each fixture's response carries the earlier-priority `details.code`. Locks FR-017b precedence chain.

### Q-12 — SMART_CONNECTIONS_NOT_INSTALLED (MANUAL T0 or stubbed)

**SC-012**

MANUAL T0 against TestVault: temporarily disable the Smart Connections plugin (Settings → Community plugins → toggle off). Invoke against the now-uninstalled vault.

OR CI handler test: stub returns envelope `{ok:false, code:'SMART_CONNECTIONS_NOT_INSTALLED', detail:'plugin: smart-connections'}`.

**Assertion**: throws `UpstreamError` with `details.code: 'SMART_CONNECTIONS_NOT_INSTALLED'`. After T0, re-enable the plugin.

### Q-13 — SMART_CONNECTIONS_NOT_READY (env.smart_sources missing)

**SC-013**

CI handler test. Stub returns envelope `{ok:false, code:'SMART_CONNECTIONS_NOT_READY', detail:'env.smart_sources unavailable'}` — plugin installed but the in-eval API path probe (`app.plugins.plugins["smart-connections"].env.smart_sources?.items`) resolves to undefined or non-callable.

**Assertion**: throws `UpstreamError` with `details.code: 'SMART_CONNECTIONS_NOT_READY'`. Covers both "indexing in progress" and "API drift" sub-states per FR-016.

### Q-14 — VALIDATION_ERROR — all 8 invalid input shapes (US3)

**SC-014**

CI schema test. Iterate the eight US3 scenarios with a dispatcher spy:

1. Missing `vault` in specific mode → reject.
2. Missing both `file` AND `path` in specific mode → reject.
3. Both `file` AND `path` supplied (XOR violation) → reject.
4. Unknown top-level key (`threshold`) → reject.
5. Non-boolean `total` (e.g. `"true"` string) → reject.
6. `limit` out-of-range (`0`, `-5`, `101`, `1000`) OR non-integer (`5.5`, `"20"`) → reject.
7. `path` with traversal characters (`"../../etc/passwd"`) → reject.
8. Missing / unknown / non-string `target_mode` → reject.

**Assertion**: each invocation raises `VALIDATION_ERROR`; dispatcher spy NEVER called. Locks FR-019.

### Q-15 — Path-traversal rejection

**SC-015**

CI schema test (subset of Q-14 scenario 7, called out separately for SC mapping). Invoke with `path: "../../etc/passwd"`.

**Assertion**: rejected at schema layer; no filesystem read attempted; structured `VALIDATION_ERROR` reaches the caller.

### Q-16 — Count-only mode + cross-mode invariant

**SC-016**

CI handler test. Run Q-1's fixture under `total: false`, capture `count`. Re-run identical fixture under `total: true`, capture `count`.

**Assertion**: `count_false === count_true`; `total:true` returns `matches: []`; `total:false` returns full `matches.length === count`. Locks FR-006a cross-mode invariant.

### Q-17 — Limit boundary 1 / 20 / 100 + out-of-range

**SC-017**

CI schema + handler tests. Schema tests: `limit: 1` accepted; `limit: 20` accepted (default); `limit: 100` accepted; `limit: 0` / `limit: 101` / `limit: -5` / `limit: 5.5` rejected. Handler test: stub respects the requested `limit` (plugin's internal threshold may cap below, per F12 "upper-bound, not guarantee").

**Assertion**: boundary values pass schema; out-of-range values fail with `VALIDATION_ERROR`; `matches.length <= limit` holds always.

### Q-18 — Token-savings rough observation (payload size)

**SC-018**

CI handler test. Record the JSON-serialised response payload size for a `limit: 20` happy path response. Assert size < 5 KiB (typical: ~1.5-3 KiB per F4 shape × 20). Compare against the published threshold for "full-file read alternative" (a 50-KiB note + agent-side embedding pipeline is two orders of magnitude larger).

**Assertion**: payload size below threshold; SC-018 observability locked.

### Q-19 — Existing tools' public output unchanged

**SC-019**

CI registration test. Inspect BI-022 registry-stability baseline drift detector output post-implementation. Every existing tool's `descriptionFingerprint` and `schemaFingerprint` is byte-equal to pre-implementation.

**Assertion**: zero entries in the drift detector diff except the new `smart_connections_similar` entry. Inherited from BI-022 machinery.

### Q-20 — Docs completeness (5 inherited limitations, 8-entry error roster, >=4 worked examples)

**SC-020**

CI registration test. Load `docs/tools/smart_connections_similar.md`. Assert structural completeness via grep / parse:

- Per-field input contract (target_mode, vault, file, path, limit, total).
- Output shape for default mode AND count-only mode.
- Eight-entry error roster: VALIDATION_ERROR, VAULT_NOT_FOUND, FILE_NOT_FOUND, NO_ACTIVE_FILE, NOT_MARKDOWN, SMART_CONNECTIONS_NOT_INSTALLED, SMART_CONNECTIONS_NOT_READY, SOURCE_NOT_INDEXED — plus the `details.reason: "not-open"` sub-discriminator under VAULT_NOT_FOUND.
- Error-precedence chain (FR-017b).
- Five documented inherited limitations: embedding-model-dependent score bands, indexing freshness, folder exclusions, plugin-version drift surfaces as `SMART_CONNECTIONS_NOT_READY`, multi-vault basename ambiguity.
- Minimum probed Smart Connections plugin version (soft-pin per Q1).
- At least four worked examples covering at least four distinct usage modes.

**Assertion**: all structural elements present.

### Q-21 — Regression test count >= 50

**SC-021**

CI meta-test. Walk `src/tools/smart_connections_similar/*.test.ts`. Count `it(...)` / `test(...)` blocks across schema, handler, registration suites.

**Assertion**: total count >= 50 (per data-model.md's 20 / 38 / 5 = 63-case inventory per the /speckit-analyze C1 remediation; was stated as 57 = 20 / 32 / 5 in initial output).

### Q-22 — Zero new top-level error codes

**SC-022**

CI meta-test. Grep `src/errors.ts` for the canonical UpstreamError code enum. Compare against pre-implementation snapshot.

**Assertion**: zero new top-level codes added. All eight plugin-specific failures (incl. `not-open`) surface via `CLI_REPORTED_ERROR` with `details.code` / `details.reason` discriminators. The eleven-tool zero-new-top-level-codes streak since BI-011 preserved.

### Q-23 — Live-CLI characterisation pass — 17 cases (MANUAL T0)

**SC-023**

MANUAL T0 against TestVault. Run all 17 FR-025 characterisation cases:

1. specific-mode by-path happy path on indexed source.
2. specific-mode by-file (basename) on same source.
3. specific-mode with `limit: 5`.
4. specific-mode with `limit: 100`.
5. specific-mode against zero-neighbour source.
6. specific-mode against score-tie source.
7. specific-mode against `.canvas` source (NOT_MARKDOWN).
8. specific-mode against unindexed `.md` source (SOURCE_NOT_INDEXED).
9. active-mode happy path against focused indexed note.
10. active-mode with no focused file (NO_ACTIVE_FILE).
11. specific-mode with unresolved `path` (FILE_NOT_FOUND).
12. specific-mode with unresolved `file` basename (FILE_NOT_FOUND).
13. specific-mode with `vault: "Unknown"` (VAULT_NOT_FOUND via 011-R5).
14. count-only against indexed note (cross-mode invariant).
15. count-only against zero-neighbour note.
16. specific-mode against vault with plugin temporarily disabled (SMART_CONNECTIONS_NOT_INSTALLED).
17. specific-mode against fresh vault before indexing completes (SMART_CONNECTIONS_NOT_READY).

**Assertion**: all 17 outcomes recorded; persist findings in research.md addendum.

### Q-24 — Plan-stage live-plugin probe findings persisted

**SC-024**

CI meta-check. Inspect `research.md` for findings F1..F14: vault routing on eval (F1), no native subcommand (F2), plugin API path (F3), find_connections return shape (F4), block-level granularity (F5), frontmatter sentinel (F6), closed-vault empty-stdout signature (F7), 011-R5 does NOT fire for closed-vault (F8), transparent open side effect (F9), cross-vault SC install confirmation (F10), env.smart_sources structure (F11), limit-vs-threshold cap (F12), score band observation (F13), getName() inside eval (F14).

**Assertion**: all 14 findings present with verbatim probe output; the JS template's API path matches F3/F4 exactly with no speculative branches.

### Q-25 — Structural data-passing verifiable by rendered JS inspection

**SC-025**

CI handler test. For Q-1's invocation, capture the `code=…` argv parameter. Decode the base64 region embedded in the frozen template (`atob` the captured payload string). `JSON.parse` it.

**Assertion**: decoded payload equals `{active: false, vault: 'Demo', path: 'Topics/ML.md', file: null, limit: 20, total: false}` bit-for-bit. The frozen JS source string contains NO caller-supplied byte (no `Demo`, no `Topics/ML.md` as text). Locks FR-028 anti-injection contract; parity with BI-014 / BI-015 / BI-025.

### Q-26 — Output-cap kill on overflow (unreachable at limit:100 but contract preserved)

**SC-026**

CI handler test (synthetic). Stub returns stdout exceeding 10 MiB (a payload size impossible under realistic plugin behaviour at `limit: 100` per F12 — 100 matches × ~80 bytes each ≈ 8 KiB — but the dispatch-layer cap-kill contract is preserved structurally).

**Assertion**: response is `CLI_NON_ZERO_EXIT` (output-cap kill), NOT a silent truncation. Inherited from feature 003.

### Q-27 — ADR-013 published + Decision Log row

**SC-027**

CI meta-check. Inspect `.decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md` for the four required clauses (scope, format, discriminator with BI-022, migration policy). Inspect `.decisions/Decision Log.md` for the new ADR-013 row.

**Assertion**: ADR-013 file present with all four clauses; Decision Log carries one new row referencing ADR-013 status `Decided` 2026-05-15.

### Q-28 — Architecture snapshot populated + base file rolled forward

**SC-028, SC-028a**

CI meta-check. Inspect `.architecture/Obsidian CLI MCP - Architecture with Smart Connections.md` for the BI-026-time-frozen snapshot content (new typed-tool surface, plugin-namespace convention, plugin-as-runtime-dependency pattern, 8-entry failure roster, FR-017b precedence chain, 4 inherited limitations, minimum probed plugin version). Inspect `.architecture/Obsidian CLI MCP - Architecture.md` for the same content rolled forward.

**Assertion**: both files share BI-026-time content; the snapshot file is FROZEN (no future-BI touch markers); the base file is the canonical forward-going source-of-truth.

---

## Manual T0 scenarios summary

Cases requiring intrusive state changes against `TestVault-Obsidian-CLI-MCP` during T0 of `/speckit-implement`, per the [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) protocol:

- **Q-11a** — closed-but-registered vault detection (close a registered vault before probe).
- **Q-12** — plugin uninstalled (temporarily disable Smart Connections; re-enable after).
- **Q-23** — full 17-case FR-025 characterisation pass (includes Q-12, plus fresh-vault SMART_CONNECTIONS_NOT_READY which requires either a fresh vault or in-eval API stub).

All other scenarios run in CI against the stub `spawnFn`.

---

## Mapping table (Q -> SC)

| Q-N | SCs covered | CI / Manual |
|---|---|---|
| Q-1 | SC-001, SC-007a | CI |
| Q-2 | SC-002 | CI |
| Q-3 | SC-003 | CI |
| Q-4 | SC-004 | CI |
| Q-5 | SC-005 | CI |
| Q-6 | SC-006 | CI |
| Q-6a | SC-006 | CI |
| Q-7 | SC-007 | CI |
| Q-7a | SC-007a | CI |
| Q-8 | SC-008 | CI |
| Q-9 | SC-009 | CI |
| Q-10 | SC-010 | CI |
| Q-11 | SC-011 | CI |
| Q-11a | SC-011a | MANUAL T0 |
| Q-11b | SC-011b | CI |
| Q-12 | SC-012 | MANUAL T0 (or stubbed) |
| Q-13 | SC-013 | CI |
| Q-14 | SC-014 | CI |
| Q-15 | SC-015 | CI |
| Q-16 | SC-016 | CI |
| Q-17 | SC-017 | CI |
| Q-18 | SC-018 | CI |
| Q-19 | SC-019 | CI |
| Q-20 | SC-020 | CI |
| Q-21 | SC-021 | CI |
| Q-22 | SC-022 | CI |
| Q-23 | SC-023 | MANUAL T0 |
| Q-24 | SC-024 | CI (meta-check) |
| Q-25 | SC-025 | CI |
| Q-26 | SC-026 | CI |
| Q-27 | SC-027 | CI (meta-check) |
| Q-28 | SC-028, SC-028a | CI (meta-check) |
