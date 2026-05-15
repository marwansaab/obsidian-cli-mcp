# Implementation Plan: List Files Recursive — Typed Subtree Enumeration

**Branch**: `029-list-files-recursive` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/029-list-files-recursive/spec.md`

## Summary

BI-029 adds the **fifteenth** typed-tool wrap, the project's **first recursive subtree-enumeration primitive**, AND the **seventh member of the eval-driven typed-tool cohort** (after BI-014 / BI-015 / BI-025 / BI-026 / BI-027 / BI-028). Tool name **`tree`** is a single-word original choice — ADR-010 N/A because the wrapper composes via `eval` (not a single named native subcommand); the CLI has `files` and `folders` but no `tree` / `walk` / `find` per live-probe F-help, so the naming space is unconstrained.

User surface: `tree({ target_mode, vault?, folder?, depth?, ext?, total? })` returning `{ count: number, paths: string[] }`. Folder entries in `paths` end with `/` per FR-028; file entries do not. The trailing-character discrimination rule is the in-band file-vs-folder signal locked by the 2026-05-15 clarifications session.

STANDARD `target_mode` discriminator with folder-scoped adaptation (forbid `file`/`path`; accept `folder`) — parity with BI-019. Wraps **`eval`** subcommand (NOT native `files` or `folders` — F1 / F2 / F3 confirmed the natives lack depth bound, combined files+folders output, and missing-folder distinguishability; combining native subcommands would require two spawns and break R3 single-call architecture).

The eval JS template walks `app.vault.adapter` directly: `stat()` provides the missing/file/folder trichotomy (R7 / F6); `list()` provides immediate-children enumeration with files and folders separated (R8 / F5); the wrapper composes the recursive descent in-eval with a depth-bound level counter (R9), an in-walk dotfile filter (R12 / FR-027), a post-walk ext filter that excludes folders when set (R11 / FR-007), a trailing-slash transformation on folder entries (R10 / FR-028), and a wrapper-imposed byte-asc sort on the final string array (R13 / FR-013).

Single-call architecture branched at envelope-emission on `payload.total` (R3). Two new envelope codes — `FOLDER_NOT_FOUND` and `NOT_A_FOLDER` — surface as `CLI_REPORTED_ERROR` with distinguishing `details.code` per ADR-015 sub-discriminator pattern (R14 / FR-021). **Zero new top-level error codes**; the twelve-tool-and-counting zero-new-top-level-codes streak preserved.

Anti-injection via base64-encoded JSON payload + frozen JS template (R6, parity with the eval-cohort).

**Fourth consumer** of the cross-cutting `src/tools/_eval-vault-closed-detection/` shared module (BI-026 inline → BI-027 lifted → BI-028 third consumer → BI-029 fourth confirms the cross-cutting design at four consumers).

ONE clarifications-session Q&A locked 2026-05-15 (folder-entry representation in `paths` → trailing-slash on folders, bare on files — codified in FR-028 / SC-022). No plan-stage spec amendments (the spec's "planning-phase decision" placeholders for tool name / native-vs-eval / `details.code` strings are resolved here without amending the spec).

**Six-entry failure-mode roster**: `VALIDATION_ERROR`; `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "unknown")`; `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")`; `CLI_REPORTED_ERROR(stage: "json-parse")`; `CLI_REPORTED_ERROR(stage: "envelope-parse")`; `CLI_REPORTED_ERROR(stage: "envelope-error", code: "FOLDER_NOT_FOUND" | "NOT_A_FOLDER")`. Plus inherited `ERR_NO_ACTIVE_FILE` (dispatch-layer classifier) and `CLI_NON_ZERO_EXIT` (output cap kill).

NO new ADRs (ADR-010 N/A for eval-route; ADR-013 / ADR-014 / ADR-015 already cover this BI as the second consumer of ADR-015's sub-discriminator pattern). NO Constitution amendment (v1.5.0 stays — no new compliance row). NO new architecture snapshot. 43 co-located tests minimum (18 schema / 20 handler / 5 registration). Version bump **0.5.6 → 0.5.7** (PATCH; additive surface).

## Technical Context

**Language/Version**: TypeScript strict (per Constitution Technical Standards). `tsconfig.json` `module: "NodeNext"`, `target: "ES2024"`, `strict: true`.
**Primary Dependencies**: `zod` (input/output schemas; eval-envelope discriminated union); `@modelcontextprotocol/sdk` (transport — no new direct usage; consumed via `registerTool` factory); existing `src/cli-adapter/` (frozen 008-refactor surface — `invokeCli`); existing `src/tools/_eval-vault-closed-detection/` (4th consumer); existing `src/target-mode/target-mode.ts` (`targetModeBaseSchema` + `applyTargetModeRefinement`).
**Storage**: N/A (this surface is read-only; no state is persisted by the wrapper).
**Testing**: `vitest` co-located `*.test.ts` files; merge gate `vitest run` in CI; aggregate statements coverage threshold per `vitest.config.ts` (single source of truth).
**Target Platform**: tri-platform (Windows / macOS / Linux) via the 017-cross-platform binary resolver; this feature inherits the resolver unchanged.
**Project Type**: MCP server (CLI bridge over `obsidian-cli` binary).
**Performance Goals**: latency target unset (project convention — typed tools defer perf to plan-stage probes). Live-probe observation: `app.vault.adapter.list()` returns within ~10ms per directory on the test vault; a 1000-entry subtree walk completes in <500ms.
**Constraints**: 10 MiB output cap (inherited from BI-003); single-spawn architecture (I-2); zero new top-level error codes (Principle IV streak); original-no-upstream attribution headers on every new source file (Principle V).
**Scale/Scope**: typical Obsidian vault sizes (100s–10,000s of notes; up to ~50 folder depth). Pathological cases beyond the output cap surface as structured errors (SC-013 / US9).

## Constitution Check

*GATE: PASS on initial evaluation. Re-evaluated post-Phase-1 design: PASS.*

| Principle / ADR | Status | Evidence |
|---|---|---|
| **I. Modular Code Organization** | PASS | New surface lives in `src/tools/tree/{schema,handler,index}.ts` per the post-011 module-layout convention. Cross-module imports flow downward: tool → cli-adapter → cli-binary. The `_eval-vault-closed-detection/` shared module is imported via its public `index.ts` (BI-029 is the 4th consumer); no cyclic dependencies. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | PASS | 43 co-located tests across schema (18) / handler (20) / registration (5). Both happy-path AND failure-path tests are present (validation rejection, envelope-error mapping, closed-vault detection, output-cap inheritance). The test inventory is locked in data-model.md. |
| **III. Boundary Input Validation with Zod** | PASS | `treeInputSchema` is the single source of truth for the published `inputSchema` AND the runtime parse. `z.infer<typeof treeInputSchema>` is the canonical type; no parallel TypeScript interface. The schema enforces target_mode + folder + depth + ext + total + unknown-key rejection. |
| **IV. Explicit Upstream Error Propagation** | PASS | Every failure path returns an `UpstreamError` instance with `code` / `cause` / `details` per the existing convention. Zero new top-level error codes are added — the new `FOLDER_NOT_FOUND` and `NOT_A_FOLDER` strings are `details.code` values under the existing `CLI_REPORTED_ERROR` top-level code (ADR-015 sub-discriminator pattern). The 12-tool zero-new-top-level-codes streak is preserved. |
| **V. Attribution & Layered Composition Transparency** | PASS | All three new source files (`schema.ts`, `handler.ts`, `index.ts`) carry the `// Original — no upstream. <intent>.` header per FR-026. The frozen JS template is original (composed wrapper-side; not lifted from upstream). The `app.vault.adapter.{stat,list}` API references are Obsidian-runtime calls (not borrowed code) so no upstream attribution applies. |
| **ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand)** | N/A | The wrapper composes via the `eval` subcommand, not via a single named native subcommand. The CLI has `files` and `folders` but neither is a recursive listing primitive — combining them would require two spawns. With no single-named upstream, ADR-010 is N/A and the name is the "single-word original" branch. Per the constitutional explanation: "a PR that adds no [native-CLI-subcommand-mapped] typed tool is N/A on ADR-010". `tree` is an original single-word name with no upstream conflict. |
| **ADR-013 (Plugin-Namespace Tool Naming Convention)** | N/A | The wrapper is core-cache-backed (`app.vault.adapter`), not plugin-backed. ADR-013 governs only plugin-backed wrappers per its own scope. |
| **ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern)** | N/A | The wrapper is core-cache-backed, not plugin-backed. ADR-014 governs only plugin-backed wrappers. |
| **ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes)** | N/A | BI-029 introduces TWO new `(top-level-code, details.code)` pairs (`CLI_REPORTED_ERROR` × `FOLDER_NOT_FOUND` and `CLI_REPORTED_ERROR` × `NOT_A_FOLDER`) but NEITHER pair carries multi-state internal sub-discrimination — each is a single-state code with no `details.reason` sub-codes. Per the constitutional N/A rule: "a PR that introduces no new (top-level-code, details.code) pair with MULTIPLE SUB-STATES AND adds no new sub-states to existing pairs is N/A on ADR-015". Both conditions hold: (a) the two new pairs have no internal multi-state; (b) BI-029 introduces no new `details.reason` sub-states to existing pairs (the inherited `VAULT_NOT_FOUND.reason: "unknown" \| "not-open"` is reused via the shared closed-vault-detection module, but BI-029 adds no NEW reason values). The ADR-015 sub-discriminator pattern is therefore not exercised by this BI. (Note: introducing new top-level `(top-level-code, details.code)` pairs without sub-state ≠ exercising the sub-discriminator pattern; the latter is what ADR-015 governs.) |

No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/029-list-files-recursive/
├── plan.md                  # This file (/speckit-plan output)
├── research.md              # Phase 0 output — R1..R15 decisions + F1..F12 findings
├── data-model.md            # Phase 1 output — schemas + handler shape + test inventory
├── quickstart.md            # Phase 1 output — Q-1..Q-28 verification scenarios
├── contracts/
│   ├── tree-input.contract.md     # Input contract: zod + JSON Schema + 8 examples + error roster
│   └── tree-handler.contract.md   # Handler invariants I-1..I-14 + failure chain + test seam pattern
├── checklists/
│   └── requirements.md      # /speckit-specify quality checklist (already authored)
├── spec.md                  # Feature spec (Session 2026-05-15 clarification locked)
└── tasks.md                 # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── tree/                                  # NEW — BI-029
│   │   ├── schema.ts                          # NEW — treeInputSchema, treeOutputSchema, treeEnvelopeSchema
│   │   ├── schema.test.ts                     # NEW — 18 schema tests
│   │   ├── handler.ts                         # NEW — handleTree + FROZEN_TEMPLATE + frozen-template fingerprint test
│   │   ├── handler.test.ts                    # NEW — 20 handler tests
│   │   ├── index.ts                           # NEW — createTreeTool factory
│   │   └── index.test.ts                      # NEW — 5 registration tests
│   ├── _eval-vault-closed-detection/          # EXISTING (BI-027 lift, BI-028 second use) — BI-029 IS 4TH CONSUMER
│   │   ├── detector.ts                        # UNCHANGED
│   │   ├── registry-parser.ts                 # UNCHANGED
│   │   └── index.ts                           # UNCHANGED
│   ├── _register-baseline.json                # MODIFIED — add tree fingerprint; other tools BYTE-STABLE
│   ├── _register-baseline.test.ts             # UNCHANGED (verifier auto-detects new entry)
│   └── (existing typed tools — read, write, delete, files, ..., tag — all BYTE-STABLE)
├── server.ts                                  # MODIFIED — one import line + one tools-array entry (alphabetical)
├── cli-adapter/                               # UNCHANGED (frozen 008-refactor surface)
└── target-mode/target-mode.ts                 # UNCHANGED (targetModeBaseSchema + applyTargetModeRefinement reused)

docs/
└── tools/
    └── tree.md                                # NEW — per FR-022 progressive-disclosure entry

CHANGELOG.md                                   # MODIFIED — new [0.5.7] section
package.json                                   # MODIFIED — version 0.5.6 → 0.5.7
CLAUDE.md                                      # MODIFIED — active-narrative block rotated to BI-029
.architecture/Obsidian CLI MCP - Architecture.md  # VAULT-SIDE roll-forward queued (gitignored mirror in this repo; canonical authoring vault-side per the strictly-read-only-source rule). Not edited by /speckit-plan or /speckit-implement on the wrapper repo.
```

**Structure Decision**: BI-029 is purely additive at the public surface — the only existing source edits are (a) the `server.ts` registration list growing by one import + one array entry (alphabetical between `tag` and any subsequent tool — current alphabetical end so it lands LAST in the imports + tools array), and (b) the `_register-baseline.json` roll-forward (one new tool fingerprint; every prior fingerprint byte-stable).

The new module at `src/tools/tree/` follows the post-011 module-layout convention exactly (`{schema, handler, index}.ts` plus co-located `*.test.ts`).

## Phase 0 — Outline & Research (COMPLETE)

See [research.md](./research.md). Summary:

- R1–R15 decisions captured (logger surface; eval routing; single-call; tool name `tree`; target_mode mapping; anti-injection; stat trichotomy; recursive walk; depth bounding; trailing-slash; ext filter interaction; dotfile filter; sort; envelope-error mapping; 4th consumer of shared module).
- F1–F12 live findings captured (native `files`/`folders` shape + missing-folder asymmetry; eval works against unknown vault per R5 inheritance; `app.vault.adapter.stat` trichotomy; `app.vault.adapter.list` shape; ENOTDIR/ENOENT on raw list against file/missing; closed-vault transparent-open signature; trailing slash silently accepted on input).
- All NEEDS-CLARIFICATION items resolved at plan stage; no spec amendment required.

## Phase 1 — Design & Contracts (COMPLETE)

- **Schemas, eval template, payload, invariants, LOC budget, test inventory** → [data-model.md](./data-model.md).
- **Input contract** → [contracts/tree-input.contract.md](./contracts/tree-input.contract.md).
- **Handler contract** → [contracts/tree-handler.contract.md](./contracts/tree-handler.contract.md).
- **Verification scenarios** → [quickstart.md](./quickstart.md).
- **Agent context update** → CLAUDE.md active-narrative block rewritten to point at this plan (the SPECKIT-managed plan reference) and to add BI-029 narrative + retain BI-028 narrative as the previous predecessor block.

Constitution Check re-evaluated post-Phase-1 design: PASS. The design does not introduce any new ADR-amendment surface; the per-PR review gate checks all pass; no Complexity Tracking entries needed.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

No violations; this section is empty.
