# Implementation Plan: Close Audit Findings

**Branch**: `042-close-audit-findings` | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/042-close-audit-findings/spec.md`

## Summary

Close the cohort audit umbrella's open-findings ledger in a single coordinated reconciliation pass across the typed-tool cohort. Eight user stories cover seven sub-areas of drift plus one verification story:

- **Two predecessor partial-ship retirements** (Stories 1 & 2) — `specs/013-read-property/spec.md` AC9 and the `specs/024-list-properties/spec.md` dedup-FR text retire claims the BI-041 cycle landed in the help-doc surface but not in the predecessor feature specs.
- **One cohort-wide empirical reconciliation** (Story 3) — the `vault=` cohort (`outline`, `properties`, `files`, `read_heading`, `set_property`, plus four F1-inferred eval-composed tools `find_by_property`, `backlinks`, `read_property`, `tag`) probes each tool against the live binary and reconciles every "silently honoured-as-noop" / "functionally ignored" phrasing to the empirical surface (Branch A: retire; Branch B: anchor with date + version).
- **One runtime change** (Story 4) — `src/tools/find_and_replace/handler.ts:512-523` adds `details.reason: "not-found"` to the ENOENT-on-subfolder rejection branch, making the envelope symmetric with the existing path-traversal-shape branch (`details.reason: "path-traversal"`). Single-line `details` edit, no schema change, no new top-level code; adds a new sub-state to an existing `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair per ADR-015.
- **Three cohort-wide documentation reconciliations** (Stories 5, 6, 7) — per-tool error rosters acknowledge both validation envelope shapes (wrapped `UpstreamError` and MCP transport `-32602`); truncation slice direction documented explicitly on `search`, `context_search`, `backlinks` with cross-tool divergence call-out; `backlinks` carries an explicit cross-folder reach caveat.
- **One verification pass** (Story 8) — maintainer-run audit re-run produces `specs/042-close-audit-findings/audit-pass-record.md` with one row per cohort tool clearing the five pass criteria.

The only runtime behaviour change is the single `details.reason` addition in Story 4. All other deliverables are documentation reconciliations. The Out-of-Scope ban from spec stands — no new typed tools, no schema-level changes to existing typed tools, no validation-envelope-shape collapse, no truncation-direction runtime standardisation, no `displayText` semantics edits, no audit-framework changes.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode (`tsc --noEmit` clean), `target: ES2024`, `module: NodeNext`.
**Primary Dependencies**: `@modelcontextprotocol/sdk` (^1.0.4) for MCP transport; `zod` (^3.23.8) for boundary validation; `zod-to-json-schema` (^3.23.5) for published `inputSchema` rendering.
**Storage**: None (stateless wrapper; vault state lives in upstream Obsidian).
**Testing**: `vitest` (^4.1.5) with `@vitest/coverage-v8` (V8 provider). Tests are co-located `*.test.ts` per Principle II. Mock-only at unit scope. T0 empirical probes for Story 3 (`vault=` cohort), Story 5 (dual-envelope per tool), Story 6 (backlinks truncation direction), and Story 7 (cross-folder reach) run against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Per the project test-scope memory, no integration TC scaffolding under `specs/042-.../test-cases/` — manual probes are tracker-side; characterisation captures persist to `contracts/`.
**Target Platform**: Node.js ≥ 22.11 (LTS floor per constitution Technical Standards); cross-platform (macOS / Linux / Windows).
**Project Type**: Library / CLI bridge — TypeScript MCP server published as `@marwansaab/obsidian-cli-mcp` (`bin: obsidian-cli-mcp`). Single-project structure rooted at `src/`.
**Performance Goals**: Negligible. The runtime change is one `details` object literal edit — constant-cost. Documentation-only edits have zero runtime cost.
**Constraints**: Zero new top-level error codes (Principle IV streak preserved at 15 tools; this BI does not add a tool). No schema input-shape changes (Out-of-Scope). Existing `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair gains one new sub-state via `details.reason` per ADR-015 — exhaustive closed union `{ "path-traversal", "not-found" }` after Story 4.
**Scale/Scope**: 13 cohort tools touched across the eight stories (named in `specs/042-close-audit-findings/spec.md` scope sentence). One runtime-code file touched (`src/tools/find_and_replace/handler.ts`); one runtime-test file touched (`src/tools/find_and_replace/handler.test.ts`, plus one new symmetry test). Help-doc edits across the cohort scope per per-story FR-016, FR-019, FR-021. Predecessor feature-spec edits at `specs/013-read-property/spec.md` and `specs/024-list-properties/spec.md`. Audit-pass-record artefact at `specs/042-close-audit-findings/audit-pass-record.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Y / N / N/A | Evidence |
|------|-------------|----------|
| Principle I — Modular Code Organization | **Y** | The Story 4 runtime change is localised to `src/tools/find_and_replace/handler.ts:512-523` — within the existing per-surface module. No cross-module imports, no upward dependencies, no `{schema, tool, handler}.ts` rearrangement. Documentation edits touch `docs/tools/*.md`, predecessor feature-spec files, and `src/tools/<name>/schema.ts` `.describe()` strings (the published-shape source-of-truth surface per Principle III). No new modules. |
| Principle II — Public Surface Test Coverage | **Y** | Story 4 ships with co-located test additions in the same change: (a) update of the existing failure-path test at `src/tools/find_and_replace/handler.test.ts:720-733` (assertion flip from absence to `"not-found"`); (b) a new symmetry test asserting both rejection branches expose `details.reason` narrowed to the closed union `"path-traversal" \| "not-found"`. The path-traversal regression test at `src/tools/find_and_replace/index.test.ts:134-148` continues as the happy-path-equivalent symmetry counterpart. Stories 1–3 and 5–7 are documentation-only edits exercising the help-doc + schema `.describe()` round-trip already covered by `_register-baseline.test.ts`. |
| Principle III — Boundary Input Validation with Zod | **Y** | No input-schema shape changes anywhere. `find_and_replace/schema.ts` is unchanged for Story 4. The new sub-state lives at the handler layer where the validation rejection is detected (filesystem `realpath` ENOENT) — not at the schema layer (where the path-traversal-shape rejection is already produced via `superRefine`). Stories 5 and 6 add documentation about envelope shapes that are already produced by existing validation paths; no schema changes. |
| Principle IV — Explicit Upstream Error Propagation | **Y** | The Story 4 runtime change adds a new sub-state to an existing `UpstreamError` envelope; the `code` field is unchanged (`VALIDATION_ERROR`), the `details.code` field is unchanged (`INVALID_SUBFOLDER`). The zero-new-top-level-codes streak (per BI-041 plan §Constraints) is preserved. No `catch` blocks return empty results; no plain `throw new Error(...)` introduced. Stories 1 & 2 retire stale "structured error" / "case-sensitive dedup" promises in predecessor specs; no runtime impact on Principle IV compliance. The BI-041 Complexity Tracking entry for `read_property` malformed-frontmatter remains as the authoritative Principle IV decision record; this BI cross-references it but does not re-justify it. |
| Principle V — Attribution & Layered Composition | **Y** | All touched source files (`src/tools/find_and_replace/handler.ts`, `handler.test.ts`, `index.ts`) already carry their `Original — no upstream.` headers. The `index.ts:1` header comment is updated to extend the `details.reason` enumeration; no new files, no upstream code lifted. |
| ADR-010 — Typed Tool Names Mirror Upstream CLI Subcommand | **N/A** | No new typed tool added; the 13 cohort tools' names are unchanged. |
| ADR-013 — Plugin-Namespace Tool Naming Convention | **N/A** | No new plugin-namespace tool added. |
| ADR-014 — Plugin-Backed Typed Tools Runtime-Dependency Pattern | **N/A** | No plugin-backed tool added; the 13 cohort tools wrap native upstream CLI subcommands or compose via `eval`. |
| ADR-015 — Sub-Discriminators via `details.reason` for Multi-State Error Codes | **Y** | The Story 4 change adds a new sub-state `"not-found"` to the existing `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair via `details.reason`. This is the canonical ADR-015 pattern; the closed union `{ "path-traversal", "not-found" }` is exhaustive across both rejection branches that construct this pair. Doc surface (Story 4 help-doc edit) names both sub-states on the `INVALID_SUBFOLDER` row of `find_and_replace`'s error roster. |

**Pre-research gate verdict**: PASS. No Complexity Tracking entries required at gate time. The cohort-wide documentation reconciliations are N/A on principles II–V (no source modules touched outside Story 4) and N/A on the four ADRs (no new tools, no new sub-discriminator pair structure beyond Story 4's one new sub-state).

## Project Structure

### Documentation (this feature)

```text
specs/042-close-audit-findings/
├── plan.md                                                # This file (/speckit-plan output)
├── research.md                                            # Phase 0 — 8 tasks, one per story area
├── data-model.md                                          # Phase 1 — touched entities + invariants
├── contracts/
│   ├── find_and_replace-sub-discriminator.md              # Story 4 wire shape before/after
│   ├── vault-cohort-reconciliation.md                     # Story 3 cohort enumeration + probe protocol
│   ├── dual-validation-envelope-roster.md                 # Story 5 roster format
│   ├── truncation-direction-roster.md                     # Story 6 per-tool direction + divergence
│   ├── backlinks-cross-folder-caveat.md                   # Story 7 caveat text
│   ├── predecessor-spec-retirements.md                    # Stories 1 & 2 retraction text
│   ├── vault-probe-evidence.md                            # Created during /speckit-implement
│   ├── dual-envelope-evidence.md                          # Created during /speckit-implement
│   ├── truncation-direction-evidence.md                   # Created during /speckit-implement
│   └── backlinks-cross-folder-evidence.md                 # Created during /speckit-implement
├── quickstart.md                                          # Per-story verification walkthrough
├── checklists/
│   └── requirements.md                                    # /speckit-specify quality checklist (16/16 pass)
├── audit-pass-record.md                                   # Story 8 — created during /speckit-implement
└── tasks.md                                               # Phase 2 output (/speckit-tasks — NOT this command)
```

### Source Code (repository root)

The wrapper is a single TypeScript project rooted at `src/`. The Decision below names the existing layout the BI touches. No directory rearrangement.

```text
src/
├── tools/
│   ├── find_and_replace/
│   │   ├── handler.ts                # ★ TOUCH (Story 4) — add `reason: "not-found"` to ENOENT branch's details payload
│   │   ├── handler.test.ts           # ★ TOUCH (Story 4) — flip existing assertion + add symmetry test
│   │   ├── index.ts                  # ★ TOUCH (Story 4) — header comment reason enumeration extended
│   │   ├── index.test.ts             # unchanged — existing path-traversal symmetry test continues to pass
│   │   ├── schema.ts                 # unchanged
│   │   └── ...other files            # unchanged
│   ├── outline/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — `.describe()` if Branch A reconciliation removes wording
│   ├── properties/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — same
│   ├── files/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — same
│   ├── read_heading/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — same
│   ├── set_property/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — same
│   ├── find_by_property/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — same
│   ├── backlinks/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — empirical anchor on existing correct text
│   ├── read_property/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — empirical anchor or retraction
│   ├── tag/
│   │   └── schema.ts                 # ☆ MAYBE TOUCH (Story 3) — same
│   ├── search/                       # unchanged (Story 5/6 edits stay in docs/tools/search.md)
│   ├── context_search/               # unchanged
│   ├── pattern_search/               # unchanged
│   ├── query_base/                   # unchanged
│   └── ...other tools                # unchanged

docs/tools/
├── find_and_replace.md               # ★ TOUCH (Story 4 + Story 5) — error roster names both INVALID_SUBFOLDER sub-states + dual-envelope columns
├── outline.md                        # ★ TOUCH (Story 3) — vault= phrasing reconciled per Branch A or B classification
├── properties.md                     # ★ TOUCH (Story 3) — same
├── files.md                          # ★ TOUCH (Story 3) — same
├── read_heading.md                   # ★ TOUCH (Story 3) — same
├── set_property.md                   # ★ TOUCH (Story 3) — same
├── find_by_property.md               # ★ TOUCH (Story 3 + Story 5) — vault= reconciliation + dual-envelope roster
├── backlinks.md                      # ★ TOUCH (Stories 3, 5, 6, 7) — empirical anchor + dual envelope + truncation direction + cross-folder caveat
├── read_property.md                  # ★ TOUCH (Story 3) — empirical anchor on existing aligned text
├── tag.md                            # ★ TOUCH (Story 3 + Story 5) — vault= reconciliation + dual-envelope roster
├── search.md                         # ★ TOUCH (Story 5 + Story 6) — dual-envelope roster + truncation direction
├── context_search.md                 # ★ TOUCH (Story 5 + Story 6) — same
├── pattern_search.md                 # ★ TOUCH (Story 5) — dual-envelope roster
├── query_base.md                     # ★ TOUCH (Story 5) — dual-envelope roster
└── ...other docs                     # unchanged

specs/013-read-property/
└── spec.md                           # ★ TOUCH (Story 1) — AC9 retirement + BI-041 cross-reference

specs/024-list-properties/
└── spec.md                           # ★ TOUCH (Story 2) — dedup-FR retirement + case-insensitive collapse contract
```

**Structure Decision**: Single-project TypeScript layout per the project's established `src/{cli-adapter,errors,tools,...}` tree (verified by Glob over `src/` and confirmed by the existing 13-tool cohort named in the spec). No new directories. One runtime-code file touched (`src/tools/find_and_replace/handler.ts`). Up to nine schema files MAY be touched if Story 3 reconciliations require updating `.describe()` strings on tools whose Branch-A classification requires retracting in-schema phrasing; otherwise, the Story 3 deliverable is in `docs/tools/*.md` only. Predecessor feature-spec edits at two paths under `specs/`. Help-doc edits across the cohort scope. Audit-pass-record artefact under this BI's spec directory.

## Phase 0 — Outline & Research

Eight tasks drive `research.md` (one per story area):

1. **`read_property` malformed-frontmatter spec/help-doc reconciliation target shape** — settle the AC9 replacement text; cross-reference the BI-041 Principle IV authorisation.
2. **`properties` dedup contract retirement target shape** — settle the case-insensitive collapse promotion + byte-tiebreak retirement.
3. **`vault=` cohort empirical enumeration + per-tool reconciliation** — cohort enumeration by `docs/tools/` grep walk; probe protocol with the false-positive discriminator (A vs B vs C invocations); per-tool reconciliation branches.
4. **`find_and_replace` symmetric sub-discriminator runtime change target** — sub-discriminator value `"not-found"` chosen; closed union `{ "path-traversal", "not-found" }` settled; diff scope and test plan recorded.
5. **Dual validation envelope acknowledgement cohort enumeration** — cohort by `schema.ts` walk for field-level numeric/length constraints; per-tool roster format adapted from BI-041 Task 4 carve-out flag.
6. **Truncation slice direction documentation cohort + cross-tool divergence call-out** — `search` and `context_search` confirmed LEADING by code-read; `backlinks` requires T0 probe to capture upstream direction.
7. **`backlinks` cross-folder reach caveat target text** — canonical caveat text settled; T0 probe protocol for the cross-folder fixture vault.
8. **Audit umbrella location + Story 8 verification protocol** — confirmed no checked-in audit artefact exists; FR-022 verification is the maintainer-run cohort pass against the five pass criteria documented in research.md Task 8; per-BI audit-pass-record format settled.

**Method**: All probes run against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Mock-only unit tests handle the regression coverage for Story 4. T0 probes anchor empirical claims for Stories 3, 5, 6, 7. No new test categories beyond what the project already runs.

**Output**: `research.md` with Decision / Rationale / Alternatives entries for each of the eight tasks. No `[NEEDS CLARIFICATION]` items emerged; Phase 1 proceeds with design artefacts.

## Phase 1 — Design & Contracts

**Prerequisites**: `research.md` complete with the eight Decisions above.

### 1. Data model (`data-model.md`)

Touched entities (per spec Key Entities, with implementation anchors):

- **`(VALIDATION_ERROR, INVALID_SUBFOLDER)` sub-discriminator pair (runtime change)** — closed union `{ "path-traversal", "not-found" }` after Story 4. Anchors: `src/tools/find_and_replace/schema.ts:42-51`, `src/tools/find_and_replace/index.ts:82-89`, `src/tools/find_and_replace/handler.ts:512-523`.
- **Documentation surface (help-doc + feature spec + schema `.describe()` triples)** — the three surfaces MUST agree post-BI per the docs-IS-the-contract invariant.
- **Cohort enumerations (per-story scope)** — one cohort per story; explicit per-story scope listed.
- **Probe records (Story 3)** — per-tool record shape; persisted to `contracts/vault-probe-evidence.md`.
- **Audit pass-criteria checklist (Story 8)** — five criteria per tool; recorded in `audit-pass-record.md`.

### 2. Contracts (`contracts/`)

One contract file per story (or per logical group):

- `contracts/find_and_replace-sub-discriminator.md` — Story 4 before/after wire shape + closed-union pin + diff scope + Constitution compliance signal.
- `contracts/vault-cohort-reconciliation.md` — Story 3 cohort enumeration + per-tool probe-record shape + Branch A / Branch B reconciliation rules.
- `contracts/dual-validation-envelope-roster.md` — Story 5 wrapped vs MCP transport envelope shapes + per-tool roster format.
- `contracts/truncation-direction-roster.md` — Story 6 per-tool slice direction + divergence call-out format + sort-order pin.
- `contracts/backlinks-cross-folder-caveat.md` — Story 7 canonical caveat text + probe-evidence layout.
- `contracts/predecessor-spec-retirements.md` — Stories 1 & 2 retraction text for `specs/013-read-property/spec.md` AC9 and `specs/024-list-properties/spec.md` dedup-FR text.

Probe-evidence files (`vault-probe-evidence.md`, `dual-envelope-evidence.md`, `truncation-direction-evidence.md`, `backlinks-cross-folder-evidence.md`) are created during `/speckit-implement` Phase 2 — their schemas are defined in the parent contract files above.

### 3. Quickstart (`quickstart.md`)

Per-story verification walkthrough. Each story has a numbered verification block that an agent can run against the live wrapper after `/speckit-implement` ships. Quickstart cites the relevant `contracts/` artefact for the expected wire shape per story.

### 4. Agent context update

The repo's `CLAUDE.md` carries the active-plan reference between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers. The reference will be updated to point at `specs/042-close-audit-findings/plan.md`. No per-BI inline ADR additions — ADR-010 / ADR-013 / ADR-014 are N/A; ADR-015 is Y but does not introduce a new pair (it adds a sub-state to an existing pair, which is the normal ADR-015 cadence the constitution already accommodates).

**Output**: `data-model.md`, `contracts/{find_and_replace-sub-discriminator,vault-cohort-reconciliation,dual-validation-envelope-roster,truncation-direction-roster,backlinks-cross-folder-caveat,predecessor-spec-retirements}.md`, `quickstart.md`, updated `CLAUDE.md` plan reference.

## Post-design Constitution re-check

After Phase 1 design artefacts (`data-model.md`, six `contracts/*.md`, `quickstart.md`) are in place, re-evaluate the Constitution Check:

- **Principle I**: still **Y** — no module structure changed; the design preserves the single-touchpoint location of the Story 4 runtime change.
- **Principle II**: still **Y** — the Story 4 test plan is recorded in `contracts/find_and_replace-sub-discriminator.md` and `quickstart.md` Story 4 block. Test additions co-located.
- **Principle III**: still **Y** — design adds no schema input-shape changes; the `find_and_replace/schema.ts` remains unchanged.
- **Principle IV**: still **Y** — design preserves the zero-new-top-level-codes streak. The Story 4 sub-state addition is explicitly scoped to the existing `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair.
- **Principle V**: still **Y** — no new files in the design; all artefacts land in pre-existing directories or under the BI's own `specs/042-close-audit-findings/` subtree (which carries no source-attribution requirement).
- **ADR-010 / ADR-013 / ADR-014**: still **N/A**.
- **ADR-015**: still **Y** — design names the closed union `{ "path-traversal", "not-found" }` explicitly in `contracts/find_and_replace-sub-discriminator.md` and `data-model.md`. The doc-side surface (Story 4 help-doc edit) is in scope.

**Post-design gate verdict**: PASS. No Complexity Tracking entries required. The conditional Complexity Tracking entry from BI-041 plan (the Principle IV decision on `read_property` malformed-frontmatter) is referenced by this BI's Story 1 but is NOT re-justified here — it remains BI-041's record; Story 1 only retires the surviving contradictory text in the predecessor feature spec.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified.**

No entries. Every Constitution gate is Y or N/A on this BI. The Story 4 runtime change is the canonical ADR-015 application pattern; no violation is introduced.
