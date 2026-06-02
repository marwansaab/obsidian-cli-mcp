# Phase 0 Research: Verify Cross-Vault Routing

This feature carries no open NEEDS CLARIFICATION (the two 2026-06-02 clarifications closed scope). Phase 0 therefore records the **Step-0 classification** (run empirically at plan time) and pins the **forcing-gate verification method** carried forward from BI-0134's operational steps, so that `/speckit-tasks` and `/speckit-implement` execute against a settled cohort and a settled probe contract.

---

## D1 — Step-0 mechanism + mode classification (the at-risk set)

**Decision.** The genuinely-at-risk set is the **eval-composed read/query tools probed on their specific-mode (`vault=`) path only**. Every candidate handler was grepped for the `command:` it issues to `invokeCli`. Verdict per tool:

| Tool | Issued command | Mechanism | In read/query cohort? | At-risk path |
|------|----------------|-----------|-----------------------|--------------|
| `backlinks` | `eval` ([handler.ts:39](../../src/tools/backlinks/handler.ts#L39)) | eval-composed | **Yes (read)** | specific mode (`vault=`) |
| `links` | `eval` ([:37](../../src/tools/links/handler.ts#L37)) | eval-composed | **Yes (read)** | specific mode |
| `read_heading` | `eval` ([:36](../../src/tools/read_heading/handler.ts#L36)) | eval-composed | **Yes (read)** | specific mode |
| `find_by_property` | `eval` ([:33](../../src/tools/find_by_property/handler.ts#L33)) | eval-composed | **Yes (query)** | vault-named (no `target_mode`) |
| `tag` | `eval` ([:37](../../src/tools/tag/handler.ts#L37)) | eval-composed | **Yes (query)** | vault-named |
| `paths` | `eval` ([:34](../../src/tools/paths/handler.ts#L34)) | eval-composed | **Yes (query)** | specific mode |
| `pattern_search` | `eval` ([:52](../../src/tools/pattern_search/handler.ts#L52)) | eval-composed | **Yes (query)** | vault-named |
| `smart_connections_query` | `eval` ([:36](../../src/tools/smart_connections_query/handler.ts#L36)) | eval-composed | **Yes (query)** | vault-named |
| `smart_connections_similar` | `eval` ([:38](../../src/tools/smart_connections_similar/handler.ts#L38)) | eval-composed | **Yes (query)** | specific mode |
| `read_property` | `properties` ([:53,:65](../../src/tools/read_property/handler.ts#L53)) | **native-wrapper** | read, but not eval | B1 never applied |
| `outline` | `outline` ([:31](../../src/tools/outline/handler.ts#L31)) | **native-wrapper** | read, but not eval | B1 never applied |
| `read` | `read` ([:33](../../src/tools/read/handler.ts#L33)) | native-wrapper | read, not eval | B1 never applied |
| `search` | `search` / `search:context` ([:74](../../src/tools/search/handler.ts#L74)) | native-wrapper | query, not eval | B1 never applied |
| `context_search` | `search:context` ([:75](../../src/tools/context_search/handler.ts#L75)) | native-wrapper | query, not eval | B1 never applied |
| `bases` | `bases` ([:21](../../src/tools/bases/handler.ts#L21)) | native-wrapper | query, not eval | B1 never applied |
| `files` | `files` ([:53](../../src/tools/files/handler.ts#L53)) | native-wrapper | query, not eval | B1 never applied |
| `properties` | `properties` ([:31](../../src/tools/properties/handler.ts#L31)) | native-wrapper | query, not eval | B1 never applied |
| `views_base` | `base:views` ([:30](../../src/tools/views_base/handler.ts#L30)) | native-wrapper | query, focused-`.base`-only | B1 never applied |
| `query_base` | `eval` ([:59](../../src/tools/query_base/handler.ts#L59)) **+** `base:query` ([:376](../../src/tools/query_base/handler.ts#L376)) | **mixed** | query | **native** query path; the `eval` is only the closed-vault detector (emits `not-open` at [:453](../../src/tools/query_base/handler.ts#L453)) |
| `write_note`, `set_property`, `find_and_replace` | `eval` (+ native) | eval-composed | **No — write/mutation tools** | out of read/query scope |
| `open_file` | `eval` ([:75](../../src/tools/open_file/handler.ts#L75)) | eval-composed | **Excluded** | done in 061 / ADR-031 |

**Rationale.** B1's false claim only ever bit the **eval** mechanism in **specific mode** (the path that passes `vault=X` into an `obsidian eval`). Native-wrapper tools issue a native subcommand whose `vault=` honouring is already strongly evidenced and was never a B1 victim — so any "focus first" line on a native-wrapper doc is a *separate, clearer* error to correct without the eval framing. The nine eval-composed read/query tools match the spec's working set exactly; Step-0 added no eval read/query tool beyond it and removed none.

**Alternatives considered.** (a) Treating the BI's coverage-matrix names literally — rejected: it listed `read_property` and `outline` for classification, and Step-0 shows both are native-wrappers, not eval; it omitted `tag`, which Step-0 confirms *is* eval. The empirical grep is authoritative over the hand-drafted matrix. (b) Folding `query_base` into the at-risk eval set — rejected: its query is `base:query` (native); its `eval` call is the shared closed-vault detector, which is out of positive scope (D5). `query_base` is swept only as a native-wrapper doc check, with a note.

---

## D2 — Read/query PASS condition: answer from B, focus stays on A

**Decision.** For a **read/query** tool, the forcing-gate PASS condition is: *the answer is computed from vault B's content while Obsidian's focus stays on vault A.* A `vault=B` eval routes the **read** into B's `app` instance but does **not** move focus — only an open / `openLinkText` moves focus (that was `open_file`'s behaviour, not a read's).

**Rationale.** This is the single most likely probe-design error. `open_file` (061) PASSED by *switching focus to B*; a reader who copies that expectation would mark a correctly-routed read as FAIL because "focus didn't change." The correct read/query signal is the returned content, not the focused window. The probe MUST assert on returned content (an item present in B and absent/different in A), not on focus.

**Alternatives considered.** Asserting on focus change — rejected as actively wrong for reads (it would falsify a passing tool).

---

## D3 — Probe the at-risk path only; active-mode is correct-by-design

**Decision.** Probe **only** the specific-mode / vault-named path. Where a tool also exposes `target_mode: "active"` (or otherwise resolves "whatever is focused" with no `vault=`), that active path runs in the focused vault **by design** and MUST NOT be flipped or "corrected." Active-mode-bearing cohort tools: `backlinks`, `links`, `read_heading`, `paths`, `smart_connections_similar` (active + specific); vault-named-only (omit `vault` → focused default): `find_by_property`, `tag`, `pattern_search`, `smart_connections_query`.

**Rationale.** Active mode sets the dispatch vault to `undefined` and runs against the focused vault — that is the *definition* of active mode, not a B1 victim. The canonical hazard (from BI-0134) is `set_property`'s active-mode pre-flight eval: a "cross-vault" probe there would wrongly "confirm" a limitation that is actually correct. `set_property` is a write tool and out of cohort, but the same trap applies to any active path — so the rule is explicit.

**Alternatives considered.** Probing active mode for completeness — rejected: it can only produce a false-positive limitation, and the spec (US4-AC2) requires focused-only modes be left unchanged.

---

## D4 — Reproduce the documented failure scenario, not the convenient happy path

**Decision.** Each per-tool probe is designed from **what that tool's doc claims fails**, not from the convenient multi-window-open-B happy path. The current caveat across the cohort lives in each doc's "Multi-vault basename ambiguity" section as *"Recommendation: open the target vault in Obsidian before invoking `<tool>`."* The probe reproduces the real claimed context (open-but-unfocused B in a multi-window setup is the primary case here; single-window or genuinely-different contexts are noted per tool).

**Rationale.** The 061 probe ran multi-window (A and B both open in separate windows). If a tool's caveat actually describes a *different* context, confirming only the multi-window happy path would wrongly "correct" a doc whose limitation still holds. Designing from the doc's claim prevents a false correction.

**Alternatives considered.** A single uniform probe applied verbatim to every tool — rejected: it risks a false correction for any tool whose documented failure context differs.

---

## D5 — Closed-vault is out of positive scope; the in-feature code ceiling

**Decision.** Per the 2026-06-02 clarifications: (1) the **positive** cross-vault target is an **open-but-unfocused** vault; closed-but-registered is out of positive scope — each tool's existing closed-vault behaviour is retained and documented unchanged (Group A — `paths` [handler.ts:58](../../src/tools/paths/handler.ts#L58), `pattern_search` [:75](../../src/tools/pattern_search/handler.ts#L75), `smart_connections_query` [:60](../../src/tools/smart_connections_query/handler.ts#L60), `smart_connections_similar` — keep emitting `CLI_REPORTED_ERROR`/`VAULT_NOT_FOUND`/`reason:"not-open"`; Group B — `backlinks`, `links`, `read_heading`, `find_by_property`, `tag` — untouched). (2) In-feature handler code is capped at **wiring a signal the cohort already emits**; **zero new top-level code, zero new `details.reason`, no net-new routing/detection** — each of those is a dedicated BI.

**Rationale.** Closed-vault recovery is the open_file path (ADR-029/030) and is net-new behaviour for a read; building it here would over-scope. The error-vocabulary cap preserves Constitution Principle IV's zero-new-codes streak and ADR-015's additive-only rule. Because B1 is already known false for the shared read-eval mechanism, the expected genuine-limitation set is empty-or-near-empty, so the realistic outcome is documentation-only.

**Alternatives considered.** Recovery parity with `open_file` for the cohort, or a uniform closed-vault signal across all nine — both rejected at clarification as net-new work belonging to a dedicated BI.

---

## D6 — Verification environment and safety net

**Decision.** Drive `Obsidian.com` (the production-resolved console shim), never the GUI `Obsidian.exe`. Target vault `TestVault-Obsidian-CLI-MCP`; a second open vault (e.g. `The Setup`) is the focused/"other" vault A. Stage the discriminating content (an item present in B and absent/different in A) in B's `Sandbox/` scratch. Non-destructive: read-probes + doc edits only; any write-needing probe uses the test vault only. **Clean git working tree is mandatory before doc edits; rollback is `git restore .`.** Re-confirm any negative against `Obsidian.com` (the `.exe` detached-stdio false-clean artifact).

**Rationale.** This is the project's standing live-CLI protocol (`.memory/test-execution-instructions.md`; the `Obsidian.com`-not-`.exe` correction recorded 2026-05-30). Cross-vault probes change which vault Obsidian shows — coordinate with the user and restore focus afterward; tab residue in the test vault is harmless and closeable.

**Alternatives considered.** In-repo integration tests against a fixture vault — rejected: project test scope is unit-only; live cross-vault behaviour is a T0 probe, not a committed integration test.

---

## D7 — Per-tool evidence recording

**Decision.** Each per-tool result is recorded in `contracts/t0-probe-findings.md` (raw command, focused vault, target vault, returned content, verdict) at implement time, and each tool's doc is corrected only after its own probe passes (FR-003: never inferred from another tool). The B1 affected-features list in `.architecture/Obsidian CLI - Upstream Issues and Limitations.md` is updated once the sweep completes.

**Rationale.** Per-tool evidence is the core maintainer guarantee (US4); a single shared findings file with one row per tool makes the "confirmed on its own evidence" claim auditable.

**Alternatives considered.** A single cohort-wide verdict — rejected: that is exactly the extrapolation ADR-031 refused and BI-0134 exists to prevent.
