# Phase 1 Data Model: Verify Cross-Vault Routing

This feature has no runtime data model (it adds no schema, no new response shape). The "entities" below are the **verification artefacts** the feature produces and reconciles, plus the per-tool **verdict state machine** that drives each documentation correction. They exist so `/speckit-tasks` can enumerate one unit of work per tool against a settled set of states.

## Entities

### CohortTool

A read or query tool under re-verification.

| Field | Values | Source |
|-------|--------|--------|
| `name` | tool id (e.g. `backlinks`) | `src/tools/<name>/` |
| `surface` | `read` \| `query` | spec cohort definition |
| `mechanism` | `eval-composed` \| `native-wrapper` \| `mixed` | Step-0 grep of issued `command` (research.md D1) |
| `at_risk_path` | `specific` (`vault=`) \| `vault-named` \| `native` (B1 N/A) | research.md D1 |
| `has_active_mode` | `true` \| `false` | schema `target_mode` discriminator |
| `closed_vault_group` | `A` (emits `not-open`) \| `B` (no closed detection) \| `n/a` | research.md D5 |
| `doc_path` | `docs/tools/<name>.md` | repo |
| `caveat_locus` | section + line of the "open the target vault first" recommendation | grep of the doc |

**Eval-composed read/query members (at-risk):** `backlinks`, `links`, `read_heading` (read); `find_by_property`, `tag`, `paths`, `pattern_search`, `smart_connections_query`, `smart_connections_similar` (query).
**Native-wrapper read/query (B1 N/A, incidental sweep only):** `read`, `read_property`, `outline`, `search`, `context_search`, `bases`, `files`, `properties`, `views_base`.
**Mixed:** `query_base` (native query path; eval = closed-vault detector only).
**Excluded:** `open_file` (061); `write_note` / `set_property` / `find_and_replace` (write tools).

### ProbeRun

One forcing-gate verification of one tool's at-risk path.

| Field | Values |
|-------|--------|
| `tool` | → CohortTool.name |
| `focused_vault` | vault A (the "other" vault, e.g. `The Setup`) |
| `target_vault` | vault B (`TestVault-Obsidian-CLI-MCP`, open-but-unfocused) |
| `discriminator` | the item present in B and absent/different in A |
| `call` | the exact `vault=B` invocation in the at-risk mode |
| `returned_from` | `B` (pass) \| `A` (fail — silent wrong-vault) \| `error` |
| `focus_after` | recorded but NOT a pass/fail criterion for reads (research.md D2) |
| `verdict` | → ToolVerdict |

**Invariant (FR-012):** `returned_from` MUST never be `A` silently. A read computed from A when B was named is the exact failure the feature exists to eliminate.

### ToolVerdict — terminal state machine

Each tool resolves to exactly one terminal state (FR-009). The documentation correction is a pure function of the state.

```
                         ┌─────────────────────────────────────────────┐
   ProbeRun.returned_from = B ─────────────►  ROUTING_CONFIRMED         │
                         │                    (drop the false caveat)   │
                         │                                              │
   returned_from = error / A-blocked,         LIMITATION_SIGNALLED      │
   AND an existing sibling signal ───────────►(state the real limit +  │
   can be reused/wired                         reuse the signal)        │
                         │                                              │
   genuine limitation, but producing the       LIMITATION_DEFERRED      │
   signal needs NET-NEW detection ────────────►(state the real limit;  │
                                                defer signal to a       │
                                                dedicated BI — NOT      │
                                                failed)                 │
                         └─────────────────────────────────────────────┘
```

| State | Doc action | Code action | FR |
|-------|-----------|-------------|----|
| `ROUTING_CONFIRMED` | Remove the "open the target vault first" precondition; keep any genuine same-name-collision note as the real, scoped limitation. | None. | FR-006, FR-009a |
| `LIMITATION_SIGNALLED` | Replace the blanket caveat with the real, confirmed limitation. | Wire an **already-emitted sibling** signal only (zero new code/reason). | FR-007, FR-009b, FR-010, FR-013 |
| `LIMITATION_DEFERRED` | State the real, confirmed limitation; note the signal is deferred to a dedicated BI. | None in-feature; file a dedicated BI. | FR-009c, FR-014 |

**Signal-fit caution (analyze I1):** the cohort's only existing reachability signal — `VAULT_NOT_FOUND` / `reason:"not-open"` — is **closed-vault-semantic**. It MUST NOT be reused for an *open-but-unfocused mis-route* (US3's actual state). If no already-emitted sibling signal genuinely fits that state, the verdict is `LIMITATION_DEFERRED`, not `LIMITATION_SIGNALLED`.

**Expected distribution (research.md D5):** Given B1 is already false for the shared read-eval mechanism, `ROUTING_CONFIRMED` is the expected verdict for most or all nine tools → documentation-only outcome. `LIMITATION_SIGNALLED` / `LIMITATION_DEFERRED` apply only if a specific tool's own probe contradicts that expectation.

### CaveatCorrection

The before→after mapping applied to one doc once its ToolVerdict is known. Full per-tool table in [contracts/doc-correction-contract.md](contracts/doc-correction-contract.md).

| Field | Values |
|-------|--------|
| `doc_path` | `docs/tools/<tool>.md` |
| `before` | the exact current caveat text (e.g. "Recommendation: open the target vault in Obsidian before invoking `<tool>`") |
| `after` | per ToolVerdict state (removed / replaced with real limit / replaced + deferral note) |
| `basename_collision_note` | retained as the genuine residual limitation, distinct from the removed focus precondition (FR-008) |

### B1RegisterEntry

The single shared upstream-limitation record updated once the sweep completes.

| Field | Action |
|-------|--------|
| `file` | `.architecture/Obsidian CLI - Upstream Issues and Limitations.md` |
| `affected_features` | per-tool rows updated to reflect each ToolVerdict (B1 removed where `ROUTING_CONFIRMED`) |
| `mitigation_status` | updated once the cohort is swept |
| `scope_note` | native-wrapper tools recorded as never-a-B1-victim, not as B1-resolved |

## Validation rules

- **Per-tool evidence (FR-003):** every `CaveatCorrection` is gated on its own `ProbeRun.verdict`, never another tool's.
- **No-silent-wrong-vault (FR-012):** any `ProbeRun` with `returned_from = A` is a hard stop, not a passable result.
- **Active-mode immutability (FR-004, research.md D3):** no `CaveatCorrection` touches an active-mode/focused-only path's behaviour or its (correct) focused-vault documentation.
- **Error-vocabulary cap (FR-013):** any `LIMITATION_SIGNALLED` code action reuses an existing `(code, details.code, details.reason)` triple — verified against `src/errors.ts` (no new top-level code) and the cohort's existing `not-open` emission (no new reason).
