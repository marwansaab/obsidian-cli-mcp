# Implementation Plan: Verify Cross-Vault Routing

**Branch**: `062-verify-cross-vault-routing` | **Date**: 2026-06-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/062-verify-cross-vault-routing/spec.md`
**Tracks**: BI-0134 — Re-verify Eval Cohort Cross-Vault Routing (deferred from ADR-031)

## Summary

ADR-031 falsified upstream limitation **B1** ("the `eval` subcommand ignores `vault=` and always runs against the focused vault") for `open_file` via a single forcing-gate probe, and deliberately declined to extrapolate to the rest of the eval-composition cohort. This feature is that deferred per-tool re-characterisation, scoped to the eval-based **read and query** tools.

The work is verification-and-documentation reconciliation, executed in three steps per tool: (0) **classify** the tool by mechanism (genuinely eval-composed vs native-wrapper) and by the at-risk mode (specific/`vault=` vs active/focused-by-design); (1) **forcing-gate probe** the at-risk path only, reproducing the *documented* failure scenario, against the authorised test vault with the target vault open-but-unfocused; (2) **correct the documentation** to one of three confirmed terminal states (routing confirmed → drop the false caveat; limitation confirmed + existing signal → state the real limitation; limitation confirmed but signal needs net-new detection → state the limitation and defer the signal to a dedicated BI).

Step 0 has already been run at plan time (grep of every candidate handler's issued `command`). It confirms the genuinely-at-risk eval-composed read/query set is exactly the spec's nine-tool working set; it reclassifies `read_property` / `outline` (and the other native-wrappers) out of the eval-B1 framing; and it surfaces `query_base` as a per-tool nuance (its query path is native `base:query`; its `eval` is only the closed-vault detector). Because B1 is already known false for the same `basePath`-read-eval mechanism these tools use, the expected outcome is **documentation-only for most or all cohort tools**, with handler code touched only in the narrow, clarified case where an existing sibling signal is merely unwired (FR-013/FR-014). No new error code, no new `details.reason`, no new routing — those are each a dedicated BI.

## Technical Context

**Language/Version**: TypeScript (strict, `tsc --noEmit` clean), Node.js ≥ 22.11 — unchanged; no source-language work expected.
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation), `vitest` (+ `@vitest/coverage-v8`). The live verification drives the Obsidian Integrated CLI via the production-resolved `Obsidian.com` shim.
**Storage**: N/A (no persistence). Verification reads two real vaults; any write-needing probe uses `TestVault-Obsidian-CLI-MCP` only.
**Testing**: `vitest run` unit tests co-located as `*.test.ts` (Principle II) — touched only if a handler's error behaviour is changed by a signal-wire (expected: none). Live cross-vault confirmation is a per-tool forcing-gate **T0 probe** at implement time, not an in-repo integration test (project test-scope convention).
**Target Platform**: Windows-primary (per `.memory/test-execution-instructions.md`); cross-platform CLI behaviour noted where it diverges.
**Project Type**: Single project (MCP server over the Obsidian CLI). Documentation + verification feature.
**Performance Goals**: N/A — no runtime path changes; no latency target.
**Constraints**: Error vocabulary additive-only — **zero new top-level `UpstreamError.code`, zero new `details.reason`** (Constitution Principle IV / ADR-015). Non-destructive by default (read-probes + doc edits); clean git working tree mandatory before doc edits; rollback `git restore .`. Active-mode (focused, no `vault=`) paths are correct-by-design and MUST NOT be flipped.
**Scale/Scope**: Nine eval-composed read/query tools at-risk (specific-mode path each); their nine `docs/tools/*.md` pages; the B1 register entry in `.architecture/Obsidian CLI - Upstream Issues and Limitations.md`; plus the native-wrapper read/query tools swept only for an incidental "focus first" doc error corrected without the eval framing. `open_file` excluded (061).

**No NEEDS CLARIFICATION** remain — the two `/speckit-clarify` answers (2026-06-02) pinned closed-vault scope (open-but-unfocused only) and the in-feature code ceiling (wire-existing-signal-only).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

This is expected to be a **documentation-and-verification** change (diff scope: `docs/tools/*.md`, `.architecture/…B1…`, `specs/062/**`). It MAY touch `src/**` only in the clarified narrow case of wiring a structured signal the cohort already emits into a tool that lacks the wiring — in which case the gates below switch from N/A to the noted Y obligations **in the same change**.

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | N/A (docs-only) → Y if signal-wire | No new module, no import-direction change. A signal-wire stays inside the tool's own `handler.ts`; the `{schema, tool, handler}.ts` layout is untouched. |
| **II. Public Surface Test Coverage** | N/A (docs-only) → Y if signal-wire | Docs carry no test obligation. If a handler's error behaviour changes, the change ships with its co-located `*.test.ts` failure-path case (a closed-vault/unreachable signal assertion) in the same diff. |
| **III. Boundary Input Validation with Zod** | N/A | No schema change. The clarification forbids new routing/passthrough, so no input shape changes; static Zod schemas stay the single source of truth. |
| **IV. Explicit Upstream Error Propagation** | Y (preserved) | Any signal surfaced reuses an existing `(code, details.code, details.reason)` triple already emitted by a sibling cohort tool — **zero new top-level codes, zero new reasons**. No `catch` masks a failure; the feature's whole point is to *replace* a silent-wrong-vault risk with a typed signal where one is genuinely needed. The zero-new-codes streak is preserved either way. |
| **V. Attribution & Layered Composition** | N/A (docs-only) → Y if signal-wire | No new module. An edited handler already carries its header; no attribution change. |
| **ADR-010 (names mirror CLI subcommand)** | N/A | No typed tool added or renamed. |
| **ADR-013 (plugin-namespace naming)** | N/A | No new plugin-backed tool. (`smart_connections_*` already conform.) |
| **ADR-014 (plugin-backed runtime-dependency pattern)** | N/A | No new plugin lifecycle state introduced; `smart_connections_*` lifecycle codes unchanged. |
| **ADR-015 (sub-discriminators via `details.reason`)** | N/A | No new `(top-level-code, details.code)` pair and **no new sub-state** added to an existing pair — minting a `details.reason` is explicitly deferred to a dedicated BI (FR-013). |

**Result: PASS.** No violations; **Complexity Tracking not required** (table below left empty). If implementation surfaces a tool needing real code work (net-new routing, net-new detection, or a new reason), that is filed as a dedicated BI per FR-014 and is NOT done under this feature — so no gate flips to `N`.

## Project Structure

### Documentation (this feature)

```text
specs/062-verify-cross-vault-routing/
├── plan.md                          # This file
├── research.md                      # Phase 0: Step-0 classification + forcing-gate method
├── data-model.md                    # Phase 1: classification table + per-tool verdict state machine
├── quickstart.md                    # Phase 1: per-tool probe + doc-verification walkthrough
├── contracts/
│   ├── t0-probe-plan.md             # Phase 1: per-tool forcing-gate probe contract (read/query PASS condition)
│   ├── doc-correction-contract.md   # Phase 1: per-tool current-caveat → required-corrected-state mapping
│   └── t0-probe-findings.md         # Implement-time: per-tool raw evidence (created during /speckit-implement)
├── checklists/
│   └── requirements.md              # Spec quality checklist (from /speckit-specify)
└── tasks.md                         # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
docs/tools/                          # PRIMARY edit surface (per-tool doc correction)
├── backlinks.md          links.md            read_heading.md       # eval reads
├── find_by_property.md   tag.md              paths.md              # eval queries
├── pattern_search.md     smart_connections_query.md  smart_connections_similar.md
└── (native-wrappers swept for incidental "focus first" only: read.md, read_property.md,
    outline.md, search.md, context_search.md, bases.md, files.md, properties.md, views_base.md)

.architecture/
└── Obsidian CLI - Upstream Issues and Limitations.md   # B1 affected-features list + mitigation status

src/tools/<tool>/                    # CONTINGENT only — expected untouched
├── handler.ts                       # edited ONLY to wire an already-emitted sibling signal (FR-013)
└── handler.test.ts                  # co-located failure-path test ships in the same change (Principle II)
```

**Structure Decision**: Single-project layout, unchanged. The feature's edit surface is overwhelmingly `docs/tools/*.md` plus one `.architecture` register page; the per-tool layout (`{schema, tool, handler}.ts`) is not reshaped. Handler code is touched only in the clarified narrow signal-wire case, and never to add routing, detection, or new error vocabulary.

### Graphify structural check

*Per CLAUDE.md `/speckit-plan` rule. Symbols are already known from the spec, the Step-0 classification, and the conversation, so the cold-start report is skipped (CLAUDE.md query-first rule).*

- **Kernel-node touch surface: NONE.** This plan touches none of the kernel nodes — `createServer()` (boot spine), `createLogger()` / `createQueue()` (boot-time DI factories), and `UpstreamError` (error-spine value type). No tool registration changes (boot spine untouched), no DI-factory construction outside `server.ts` (handlers keep receiving injected deps), and no change to `UpstreamError`'s definition or to the set of top-level codes in `src/errors.ts`. A contingent signal-wire would add at most one more *call site* constructing an **existing** `UpstreamError` code — the same star-with-`UpstreamError`-at-the-centre shape the cohort already exhibits — not a new error-class node. **This explicit no-touch claim is what the post-implement structural-verification step verifies against.**
- **Affected communities**: the runtime-spine community (the nine eval read/query handlers) — but only their prose docs and, contingently, one error-classification call site; no handler joins or leaves a community. The doc pages and `.architecture` register are prose surfaces, not code-graph nodes. New spec-artifact files land in a fresh BI-062 community.
- **Post-implement expectation** (degraded per the docs-only carve-out): checks 1–3 (no new error codes; no handler importing boot-time DI factories; new symbols in expected communities) are trivially satisfied if the diff stays docs-only; check 4 reduces to confirming the new `specs/062/**` artefacts are not orphaned. If a signal-wire lands, checks 1–3 apply in full to that one handler.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
