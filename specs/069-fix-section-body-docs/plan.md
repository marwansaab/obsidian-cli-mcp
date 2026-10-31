# Implementation Plan: Fix Section-Body Documentation

**Branch**: `069-fix-section-body-docs` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/069-fix-section-body-docs/spec.md`

## Summary

BI-0039 is a docs-only correction to `docs/tools/read_heading.md`, the help page the `help` tool serves for `read_heading`. The page says the returned body "always begins with a leading `\n` byte" and tells agents to trim it. In fact `src/tools/read_heading/_template.ts` already removes the heading line's own line ending (`\r\n` or `\n`) and returns the rest unchanged. A body therefore starts with a line break only when the note has a blank line under the heading, and in CRLF notes that line break is `\r\n`. The fix replaces the overview caveat, the Output example and `content` row, and the empty-body paragraph. It adds a "Start of body" layout table, extends the CRLF / LF note, and corrects the bodies in Examples 1–3 so they match stated note layouts. Before the edit, a one-time live probe on the authorised test vault (six layouts plus the worked examples, eleven reads through the built server's `read_heading`) confirms every shown body, and the results go in `contracts/t0-probe-findings.md`. No `src/**` or test changes (clarification 2026-10-31, Option A).

## Technical Context

**Language/Version**: Markdown documentation. The runtime it describes is the current `read_heading` in `@marwansaab/obsidian-cli-mcp` 0.9.0 (TypeScript on Node), unchanged by this work.
**Primary Dependencies**: None for the doc diff. The probe uses the Obsidian desktop app and its CLI (`Obsidian.com`), driven through the built server's `read_heading`; versions are recorded in the findings.
**Storage**: N/A. Text files only: `docs/tools/read_heading.md` and files under `specs/069-fix-section-body-docs/`.
**Testing**: No `*.test.ts` additions or changes (FR-011). Verification is the live probe in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md), run against `TestVault-Obsidian-CLI-MCP` under `Sandbox/` per `.memory/test-execution-instructions.md`, plus the page checks in [contracts/doc-correction-contract.md](contracts/doc-correction-contract.md). The existing suite must stay green unchanged.
**Target Platform**: The published help page (`docs/tools/**/*.md` ships in the npm package via `package.json` `files`; `help` reads it at runtime from `DOCS_DIR`). It is read by LLM agents and people.
**Project Type**: Docs-only change within a TypeScript MCP-server library.
**Performance Goals**: N/A.
**Constraints**: (a) Behaviour unchanged (FR-008, SC-004); (b) the diff touches only `docs/tools/read_heading.md` and this feature folder (FR-011); (c) probe before editing, and the probe wins: any mismatch stops the edit; (d) published tool descriptions and schemas stay byte-stable, so the schema fingerprint baseline is not touched.
**Scale/Scope**: One doc file edited (seven edit points, E1–E7). One evidence file added (`contracts/t0-probe-findings.md`, written during implement). Six fixture notes and eleven reads in the probe (P1–P8), all cleaned up afterwards.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Docs-only change. Gate 8 of Development Workflow & Quality Gates grants N/A for Principles II–V to a docs-only PR, N/A for ADR-010 / ADR-013 / ADR-014 to a PR that adds no typed tool, and N/A for MCP Tool Surface Standards to a PR that changes no published tool, schema, or server instructions. Principle I also governs no touched surface.

| Gate | Verdict | Evidence |
|------|---------|----------|
| Principle I — Modular Code Organization | **N/A** | No source module touched; diff scope is `docs/tools/read_heading.md` plus this feature folder. |
| Principle II — Public Surface Test Coverage | **N/A** | No MCP tool added, renamed, or modified; `read_heading`'s behaviour, schema and description are unchanged. Docs-only carve-out applies. |
| Principle III — Boundary Input Validation with Zod | **N/A** | `src/tools/read_heading/schema.ts` unchanged. |
| Principle IV — Explicit Upstream Error Propagation | **N/A** | No handler touched; no new error code; the Errors table on the page is unchanged. |
| Principle V — Attribution & Layered Composition | **N/A** | No new source file. The new spec artifacts are not source modules. |
| ADR-010 — Typed Tool Names Mirror Upstream CLI Subcommand | **N/A** | No new typed tool. |
| ADR-013 — Plugin-Namespace Tool Naming Convention | **N/A** | No new typed tool. |
| ADR-014 — Plugin-Backed Typed Tools Runtime-Dependency Pattern | **N/A** | No new typed tool. |
| ADR-015 — Sub-Discriminators via details.reason | **N/A** | No new or changed `(top-level-code, details.code)` pair. |
| MCP Tool Surface Standards | **N/A** | No published tool description, schema, `outputSchema`, or server instructions change. `READ_HEADING_DESCRIPTION` and `readHeadingOutputSchema` stay byte-stable (research R2), so the fingerprint baseline is untouched. |
| Security Defaults | **N/A** | No write path, escape hatch, or destructive tool touched. The probe writes only its own Sandbox fixtures in the authorised vault and removes them. |

All gates N/A, so Complexity Tracking is empty. **Post-design re-check**: unchanged. Phase 1 produced planning text and a doc-edit contract only; the contract explicitly excludes `src/**` and tests.

### Graphify structural check

Queries against `graphify-out/graph.json` at HEAD of `main` (60f9d2f), per the `CLAUDE.md` docs-only carve-out:

- **Affected code**: none edited. `read_heading`'s runtime path is `createReadHeadingTool()` → `executeReadHeading()` → `JS_TEMPLATE`. Those two functions share a tool-specific community; its `JS_TEMPLATE` sits with the other eval-template constants (`backlinks`, `links`, `paths`, …). In the graph, `JS_TEMPLATE`'s only consumer is `read_heading/handler.ts`, and no test node reaches it. The strip rule the help will describe is therefore pinned by no test; the clarification accepted that, and the probe covers it once.
- **Help delivery**: `executeHelp()` and `DOCS_DIR` (`src/tools/help/handler.ts`) read `docs/tools/` at runtime, so the edited page is served without a code change.
- **Doc node**: `docs/tools/read_heading.md` spans a few semantic communities and is weakly connected. Its outside links go to sibling help pages (`outline`, `links`, `patch_heading`, `read`), to `CHANGELOG.md`, and to `.docs-as-code/capabilities/read.md`. None of those repeats the false claim (research R2). The `.docs-as-code` page is reviewed in the PR's `/speckit-docs-as-code` pass.
- **Kernel nodes**: `createLogger()`, `createQueue()`, `createServer()` and `UpstreamError` are **not touched**. This is the explicit no-touch claim for post-implement verification.
- **Post-implement**: checks 1–3 are trivially satisfied (no `src/**` change). Check 4 reduces to confirming the new spec artifacts (`contracts/*.md`) land in a BI-specific community and are not orphaned.

No contradiction found between the graph, the ADRs, and the architecture notes.

## Project Structure

### Documentation (this feature)

```text
specs/069-fix-section-body-docs/
├── plan.md                          # this file
├── spec.md                          # feature spec (clarified 2026-10-31)
├── research.md                      # Phase 0: R1–R5
├── data-model.md                    # Phase 1: section body, help page, probe evidence record
├── quickstart.md                    # Phase 1: probe → edit → page checks → gates
├── contracts/
│   ├── doc-correction-contract.md   # Phase 1: edits E1–E7 and page checks
│   ├── t0-probe-plan.md             # Phase 1: fixtures F1–F6, probes P1–P8
│   └── t0-probe-findings.md         # written by /speckit-implement after the probe
├── checklists/
│   └── requirements.md              # spec-quality checklist
└── tasks.md                         # Phase 2 (/speckit-tasks)
```

### Touched paths outside the feature directory

```text
docs/tools/
└── read_heading.md                  # E1–E7 per contracts/doc-correction-contract.md

CLAUDE.md                            # active-plan pointer rotated to this plan (agent context)
.specify/feature.json                # points at specs/069-fix-section-body-docs
```

**Structure Decision**: Docs-only; there is no `src/` layout to choose. The evidence layout (`contracts/t0-probe-plan.md` + `contracts/t0-probe-findings.md` + `contracts/doc-correction-contract.md`) follows the pattern of the earlier docs-correction work item `specs/062-verify-cross-vault-routing/contracts/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

All Constitution Check gates are **N/A**; no violations to justify. Table intentionally empty.
