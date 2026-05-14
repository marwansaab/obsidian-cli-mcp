# Quickstart — Smart Connections Query (BI-027)

Verification scenarios mapped to Success Criteria (SC-001..SC-024).

The bulk runs in CI as co-located vitest cases. Manual / live-CLI cases run during T0 of `/speckit-implement` against an Obsidian vault with Smart Connections installed.

---

## Q-1 — Default-mode happy path (CI, mock spawn)

**Setup**: spawnFn responds with a queued response carrying `=> {"ok":true,"count":3,"matches":[{"path":"a.md","headingPath":["H1"],"score":0.9},...]}` plus a `Found and returned N smart_blocks.` prefix line.

**Probe**: `executeSmartConnectionsQuery({ query: "test", limit: 3 }, deps)`.

**Assert**: returned object equals `{ count: 3, matches: [...] }`; spawn invoked exactly once with `command: "eval"` and `vault` undefined.

**Maps to**: SC-001, SC-002, SC-020.

---

## Q-2 — Count-only mode

**Setup**: spawnFn responds with `=> {"ok":true,"count":5,"matches":[]}`.

**Probe**: `executeSmartConnectionsQuery({ query: "test", limit: 5, total: true }, deps)`.

**Assert**: returned object equals `{ count: 5, matches: [] }`.

**Maps to**: SC-003.

---

## Q-3 — Cross-mode `count` invariant

**Setup**: spawnFn responds with different envelope payloads in each test:
- Default: `=> {"ok":true,"count":7,"matches":[...7 entries]}`
- Count-only: `=> {"ok":true,"count":7,"matches":[]}`

**Probe**: call the handler with `total: false` then with `total: true` (otherwise identical input).

**Assert**: `count` is 7 in both responses.

**Maps to**: SC-004.

---

## Q-4 — Validation rejects empty query (CI)

**Probe**: `smartConnectionsQueryInputSchema.safeParse({ query: "" })`.

**Assert**: failure with `success: false`; error path includes `query`; spawn never invoked.

**Maps to**: SC-005.

---

## Q-5 — Validation rejects whitespace-only query (CI)

**Probe**: `smartConnectionsQueryInputSchema.safeParse({ query: "   \t\n  " })`.

**Assert**: failure (trim reduces to empty); spawn never invoked.

**Maps to**: SC-005.

---

## Q-6 — Validation rejects > 4000-char query (CI)

**Probe**: `smartConnectionsQueryInputSchema.safeParse({ query: "x".repeat(4001) })`.

**Assert**: failure with max-length violation; spawn never invoked.

**Maps to**: SC-005.

---

## Q-7 — Validation rejects out-of-range limit (CI)

**Probe**: parse with `limit: 0`, then `limit: 101`, then `limit: 5.5`, then `limit: "20"`.

**Assert**: all fail; spawn never invoked.

**Maps to**: SC-005.

---

## Q-8 — Validation rejects unknown top-level key (CI)

**Probe**: parse with `{ query: "x", threshold: 0.7 }`.

**Assert**: failure (strict schema).

**Maps to**: SC-005.

---

## Q-9 — Unknown vault → `VAULT_NOT_FOUND(unknown)` (CI)

**Setup**: spawnFn responds with `Vault not found.\n` stdout, exit 0.

**Probe**: `executeSmartConnectionsQuery({ query: "test", vault: "DoesNotExist" }, deps)`.

**Assert**: throws `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `details.code: "VAULT_NOT_FOUND"`. `details.reason` is absent or `"unknown"` — surfaced by cli-adapter's 011-R5 inspection clause.

**Maps to**: SC-006.

---

## Q-10 — Closed-but-registered vault → `VAULT_NOT_FOUND(not-open)` (T0 — MANUAL)

**Setup**: requires the user to:
1. Close one of the registered vaults (e.g. "Other") in Obsidian's Vault Switcher.
2. Verify `obsidian vaults verbose` still lists "Other" as registered.

**Probe**: `obsidian "vault=Other" eval "code=app.vault.getName()"` directly OR through the wrapper.

**Expected**: empty stdout + exit 0 on the first call (CLI transparently begins opening the vault). The wrapper detects via the shared `_eval-vault-closed-detection` module and emits `VAULT_NOT_FOUND` with `details.reason = "not-open"`.

**Cleanup**: after the test, re-open the vault in Obsidian so subsequent probes work normally.

**Maps to**: SC-007.

---

## Q-11 — Plugin not installed → `SMART_CONNECTIONS_NOT_INSTALLED` (T0 — MANUAL or mock)

**Setup**: either (a) target a vault where Smart Connections is not installed (TestVault-Obsidian-CLI-MCP per the test-execution-instructions — but note: the spec says NO plugins authorised here; for this test the spawn response is mocked at the handler-test layer using a queue spy), or (b) handler-test fixture with a queued spawn response that emits `=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_INSTALLED","detail":"plugin not loaded in vault: TestVault"}`.

**Probe**: handler test or live CLI probe.

**Assert**: throws `UpstreamError` with `details.code: "SMART_CONNECTIONS_NOT_INSTALLED"`.

**Maps to**: SC-008.

---

## Q-12 — Plugin loaded but lookup not callable → `SMART_CONNECTIONS_NOT_READY(api-missing)` (CI, mock spawn)

**Setup**: spawnFn responds with `=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_READY_API_MISSING","detail":"env.smart_sources.lookup unavailable"}`.

**Probe**: handler call.

**Assert**: throws `UpstreamError` with `details.code: "SMART_CONNECTIONS_NOT_READY"` AND `details.reason: "api-missing"`.

**Maps to**: SC-009.

---

## Q-13 — Lookup returns error sentinel → `SMART_CONNECTIONS_NOT_READY(embed-failed)` (CI, mock spawn)

**Setup**: spawnFn responds with `=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_READY_EMBED_FAILED","detail":"Embedding search is not enabled."}` (after the plugin's `Found and returned...` prefix line).

**Probe**: handler call.

**Assert**: throws `UpstreamError` with `details.code: "SMART_CONNECTIONS_NOT_READY"` AND `details.reason: "embed-failed"`; `details.detail` is `"Embedding search is not enabled."` verbatim.

**Maps to**: SC-010.

---

## Q-14 — Precedence chain: api-missing < embed-failed (CI, mock spawn)

**Setup**: imagine both conditions are simultaneously true. The in-eval pipeline checks Stage 2 (`env.smart_sources.lookup` shape) BEFORE Stage 4 (lookup return value). So the test fixture renders the in-eval JS hitting Stage 2 first: spawnFn responds with `=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_READY_API_MISSING",...}`.

**Probe**: handler call.

**Assert**: `details.reason: "api-missing"` fires (earlier in chain).

**Maps to**: SC-011.

---

## Q-15 — Precedence chain: plugin-not-installed < api-missing (CI, mock spawn)

**Setup**: in-eval Stage 1 (plugin presence) fires before Stage 2 (API shape). spawnFn returns `=> {"ok":false,"code":"SMART_CONNECTIONS_NOT_INSTALLED",...}`.

**Probe**: handler call.

**Assert**: `details.code: "SMART_CONNECTIONS_NOT_INSTALLED"` fires (earlier in chain).

**Maps to**: SC-011.

---

## Q-16 — Precedence chain: vault-not-open < plugin-not-installed (CI, mock spawn)

**Setup**: spawnFn returns empty stdout (closed-vault signature) BEFORE the in-eval lifecycle checks run; the second `vaults verbose` call returns the vault as registered.

**Probe**: handler call with `vault: "Other"` (registered + closed).

**Assert**: `details.reason: "not-open"` fires (earlier in chain than any in-eval check).

**Maps to**: SC-011.

---

## Q-17 — Precedence chain: vault-unknown < vault-not-open (CI, mock spawn)

**Setup**: spawnFn returns `Vault not found.\n` (cli-adapter 011-R5 inspection fires).

**Probe**: handler call with `vault: "DoesNotExist"`.

**Assert**: `details.reason` is `"unknown"` or absent (NOT `"not-open"`) — 011-R5 fires before the shared detector ever runs.

**Maps to**: SC-011.

---

## Q-18 — BI-026 ripple: `details.reason: "api-missing"` emission on smart_connections_similar (CI)

**Setup**: spawnFn for `executeSmartConnectionsSimilar` responds with an envelope error simulating `env.smart_sources` undefined.

**Probe**: `executeSmartConnectionsSimilar({...specific path}, deps)`.

**Assert**: `details.reason: "api-missing"` is present on the resulting UpstreamError (NEW behaviour from the ripple — pre-ripple BI-026 emitted no `details.reason`).

**Maps to**: SC-016.

---

## Q-19 — Anti-injection round-trip with shell metacharacters (CI)

**Setup**: spawnFn captures the argv; test decodes the base64 payload from argv and asserts the embedded query matches the input byte-exactly.

**Probe**: `executeSmartConnectionsQuery({ query: "\"; rm -rf $(pwd); && cat /etc/passwd" }, deps)`.

**Assert**: the argv's `code=...` value contains a base64 string that round-trips to `{ query: "\"; rm -rf $(pwd); && cat /etc/passwd", limit: 20, total: false }`. The JS template contains exactly one `__PAYLOAD_B64__` substitution.

**Maps to**: SC-018.

---

## Q-20 — Anti-injection round-trip with Unicode and emojis (CI)

**Probe**: `executeSmartConnectionsQuery({ query: "漢字 🚀 emoji query" }, deps)`.

**Assert**: base64 round-trip preserves the multi-byte characters verbatim.

**Maps to**: SC-018.

---

## Q-21 — Three-level sort: score desc / path asc / headingPath asc (CI)

**Setup**: spawnFn responds with a manually-crafted match list where:
- Two matches share the same `score`; tiebreak by `path` (byte-asc).
- Two further matches share the same `score` AND the same `path`; tiebreak by `headingPath.join("#")` (byte-asc).

**Probe**: handler call.

**Assert**: returned `matches` array order matches the expected three-level sort.

**Maps to**: SC-002.

---

## Q-22 — Non-finite-score filter (CI)

**Setup**: spawnFn responds with a match list containing `NaN`, `Infinity`, `-Infinity`, `null`, and a missing-`score`-field entry alongside finite-score entries.

**Probe**: handler call.

**Assert**: the returned `matches` array contains ONLY the finite-score entries; `count` reflects the post-filter length.

**Maps to**: SC-002.

---

## Q-23 — Frontmatter-block sentinel preserved (CI)

**Setup**: spawnFn responds with a match whose key is `"Notes/Index.md#---frontmatter---"`.

**Probe**: handler call.

**Assert**: returned match has `path: "Notes/Index.md"` AND `headingPath: ["---frontmatter---"]` (sentinel preserved verbatim — no normalisation).

**Maps to**: SC-002.

---

## Q-24 — JSON-parse failure → `CLI_REPORTED_ERROR(stage: json-parse)` (CI)

**Setup**: spawnFn responds with malformed JSON (e.g. `=> {"ok":true,`).

**Probe**: handler call.

**Assert**: throws `UpstreamError` with `details.stage: "json-parse"`; first 500 chars of stdout preserved in `details.stdout` for debugging.

**Maps to**: spec FR-013 (parse failure inheritance).

---

## Q-25 — Envelope-parse failure → `CLI_REPORTED_ERROR(stage: envelope-parse)` (CI)

**Setup**: spawnFn responds with `=> {"ok":"maybe","count":3}` (invalid `ok` value).

**Probe**: handler call.

**Assert**: throws `UpstreamError` with `details.stage: "envelope-parse"`.

**Maps to**: spec FR-013 (parse failure inheritance).

---

## Q-26 — Live-CLI default happy path against The Setup vault (T0 — MANUAL)

**Setup**: ensure Smart Connections plugin is installed and indexed in "The Setup" vault.

**Probe**: from a node REPL or a dedicated /speckit-implement T0 script:
```
const result = await executeSmartConnectionsQuery(
  { query: "decision log architectural choices", vault: "The Setup", limit: 5 },
  { logger, queue }
);
console.log(JSON.stringify(result, null, 2));
```

**Assert** (sample output expected):
```json
{
  "count": 5,
  "matches": [
    { "path": "...", "headingPath": [...], "score": 0.6+ },
    ...
  ]
}
```

Each entry has finite `score`, `path` ending in `.md`, valid `headingPath` array.

**Maps to**: SC-001, SC-020.

---

## Q-27 — Live-CLI empty-vault probe (T0 — MANUAL — OPTIONAL)

**Setup**: target a vault with the plugin installed but no indexed content (or all-non-finite scores).

**Probe**: live wrapper call with any query.

**Assert**: response is `{ count: 0, matches: [] }`. NOT a structured error.

**Maps to**: spec FR-014 / inherited limitation #6.

---

## Q-28 — Registry-consistency test passes for smart_connections_query (CI)

**Setup**: register `createSmartConnectionsQueryTool({ logger, queue })` in `src/server.ts`'s tools array; baseline regenerated via `npm run baseline:write`.

**Probe**: existing `src/server.test.ts` registry-consistency assertion.

**Assert**: `docs/tools/smart_connections_query.md` exists; help tool surfaces the new tool's existence; `_register-baseline.json` fingerprint matches; no test regressions in other tools.

**Maps to**: SC-014, SC-019.

---

## Q-29 — Shared module: `detectIfClosed` happy path (CI)

**Setup**: in `src/tools/_eval-vault-closed-detection/detector.test.ts`, mock the second-call response with `Other\tC:\\path\\Other\n` stdout.

**Probe**: `detectIfClosed({ vaultName: "Other", deps })`.

**Assert**: returns `true`. Spawn was invoked once (the `vaults verbose` call).

**Maps to**: SC-015.

---

## Q-30 — Shared module: `detectIfClosed` returns false for unregistered (CI)

**Setup**: mock the `vaults verbose` response without "Other" in the registry.

**Probe**: `detectIfClosed({ vaultName: "Other", deps })`.

**Assert**: returns `false`.

**Maps to**: SC-015.

---

## Q-31 — Shared module: BOM-aware registry parser (CI)

**Probe**: parse a BOM-prefixed `vaults verbose` stdout via `parseVaultRegistry(...)`.

**Assert**: BOM stripped; vault names extracted correctly.

**Maps to**: SC-015.

---

## Coverage Map Summary

| Test execution mode | Scenarios | Status |
|---|---|---|
| **CI** (mock spawn, vitest co-located) | Q-1..Q-9, Q-12..Q-15, Q-17..Q-25, Q-28..Q-31 | 22 scenarios; runs on every `npm test` |
| **T0 manual** (real CLI, real vault, run during /speckit-implement) | Q-10, Q-11, Q-16, Q-26, Q-27 | 5 scenarios; requires user-side test setup |
| **Total** | 31 | |

---

## Mapping to Success Criteria

| SC | Scenario(s) |
|---|---|
| SC-001 | Q-1, Q-26 |
| SC-002 | Q-1, Q-21, Q-22, Q-23 |
| SC-003 | Q-2 |
| SC-004 | Q-3 |
| SC-005 | Q-4, Q-5, Q-6, Q-7, Q-8 |
| SC-006 | Q-9 |
| SC-007 | Q-10 (T0 manual) |
| SC-008 | Q-11 |
| SC-009 | Q-12 |
| SC-010 | Q-13 |
| SC-011 | Q-14, Q-15, Q-16, Q-17 |
| SC-012 | Verified by inspection — zero new top-level codes; baseline assertion |
| SC-013 | Verified by inspection — every `details.code` in the roster pre-exists in BI-026 |
| SC-014 | Verified by inspection — zero new ADRs |
| SC-015 | Q-29, Q-30, Q-31 |
| SC-016 | Q-18 |
| SC-017 | Verified by inspection — architecture doc updated in plan commit |
| SC-018 | Q-19, Q-20 |
| SC-019 | Q-28 |
| SC-020 | Q-1, Q-26 (latency observed during T0) |
| SC-021 | Verified contractually; output-cap kill unreachable at limit ≤ 100 per F9 |
| SC-022 | Verified by test-count inspection — 47 ≥ 40 floor |
| SC-023 | Verified by test-count inspection — 20 ≥ 15 floor |
| SC-024 | Verified by test-count inspection — 3 ≥ 3 floor |
