# Feature Specification: Tool Description and Help-Doc Rewrite for MCP-Client Audience

**Feature Branch**: `049-tool-docs-rewrite`
**Created**: 2026-05-27
**Status**: In progress (HIGH-severity batch shipped; MEDIUM-severity batch pending maintainer scope decision)

## Why this BI exists

The project's tool documentation has two client-facing surfaces:

1. **`description` field on `tools/list`** — always-on, sent to the MCP client on every reasoning round. Every character is paid per round.
2. **Markdown help doc via `help({ tool_name })`** — on-demand, only loaded when an agent calls it.

Both surfaces were written for project insiders (maintainers tracking architecture history). They are threaded with internal traceability tokens (FR-NNN, BI-NNN, ADR-NNN, SC-NNN, R/Q/T0 references), cohort-comparison asides, pipeline-internal commentary, and cross-links to repo files (`specs/NNN/...`, `.decisions/...`, `.architecture/...`) that an MCP client cannot follow.

For an LLM agent consuming these surfaces to decide WHICH tool to call and HOW to call it correctly, the internal jargon is pure noise. It wastes tokens, confuses tool selection, and worst — when stale facts leak through — actively misleads the agent.

BI-047 set the precedent by rewriting `prepend`'s two surfaces for the MCP-client audience. This BI applies the same audience discipline to the remaining 27 tools (out of 28 typed tools; `help` is meta and out of scope).

## Audit reference

An MCP-client session audited all 28 tool surfaces against the BI-047 reference standard (see `.scratch/obsidian-cli-mcp - Tool Description and Help Doc Audit 2026-05-27.md` for the full report — kept local-only per the project's investigation-evidence convention).

The audit identified:

- **7 HIGH-severity findings** — stale facts that mislead callers:
  - `paths` — help doc body uses the wrong tool name `tree` in 3 places
  - `read` — claims content is verbatim; upstream appends a synthetic trailing `\n` for files lacking one
  - `read_heading` — claims leading line terminator is stripped; body always begins with `\n`
  - `move` — stale blockquote claiming active-mode-no-focused-note surfaces as `CLI_REPORTED_ERROR` (fixed in v0.7.0; now correctly classifies as `ERR_NO_ACTIVE_FILE`)
  - `links` — claims `displayText` is omitted for bare wikilinks but doesn't warn about fragment-bearing wikilinks where Obsidian auto-populates the field
  - `smart_connections_query` — the 4000-char cap stated in both surfaces is empirically unsafe (triggers upstream argv-IPC defect + 30–60 s host-process recovery)
  - `properties` — help doc carries an internal contradiction on whether `vault=` is honoured by upstream

- **20 MEDIUM-severity findings** — internal jargon, deletable sections, missing alternative-tool pointers. The audit identified 5 cross-cutting patterns (Pattern A–E):
  - Pattern A: FR / BI / ADR / SC / R / Q / T0 traceability tokens scattered through prose
  - Pattern B: repo-relative spec-file pointers
  - Pattern C: `## Dual validation envelope (BI-042 cohort acknowledgement)` sections (present verbatim across 8+ tools)
  - Pattern D: pipeline footnotes ("Single-call architecture", "Anti-injection guarantee", "Why eval not native ...")
  - Pattern E: cohort comparison asides ("cohort parity with X", "deliberate cohort exception to Y")

## Scope

- **In scope**: rewrite the description string in `src/tools/<name>/index.ts` and the help doc at `docs/tools/<name>.md` for each affected tool. Update any test that locks the docs body shape (e.g. `index.test.ts` assertions on string presence). Regenerate `src/tools/_register-baseline.json` after each batch.

- **Out of scope**: behaviour changes beyond the smart_connections_query cap reduction (which mirrors the BI-047 prepend pattern of tightening the schema to the empirically safe ceiling). Tool renames, new error codes, new input fields, new output fields — all out of scope.

## Acceptance criteria

For each touched tool:

1. The description on `tools/list` contains no FR/BI/ADR/SC/R/Q/T0 tokens, no cohort terminology, no spec-file cross-links the client cannot access.
2. The help doc returned by `help({ tool_name })` contains no FR/BI/ADR/SC/R/Q/T0 tokens, no project-internal sections, no spec-file cross-links.
3. Error states in both surfaces include actionable recovery hints (what the error means + what to do).
4. Where the tool has siblings the agent might pick instead, the description names them by tool name.
5. Existing facts that are stale (per the HIGH-severity findings) are corrected to match the implementation ground truth.
6. `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run` all pass with no regressions.
7. `npm run baseline:write` regenerates only the affected tools' `descriptionFingerprint` (schemaFingerprint should not change unless the schema changed — only `smart_connections_query` has a schema change in this BI).

## Reference standard

`prepend`'s two surfaces (shipped in BI-047) are the target style. Each rewrite is benchmarked against `prepend`'s shape:

- Description: ~1500 chars, 7 short sections (overview, alternatives table, targeting, separator, content rules, error recovery, help-pointer).
- Help doc: deeper but no internal jargon; worked examples inline; cross-links only to sibling tool docs (`./other.md`) and external URLs (forum threads, public docs).

## Implementation strategy

1. **Wave 1 (this branch's first commit)**: 7 HIGH-severity fixes — paths, read, read_heading, move, links, smart_connections_query, properties.
2. **Wave 2 (subject to scope decision)**: 20 MEDIUM-severity fixes — pattern-driven mechanical cleanup across the remaining tool roster.

The audit recommends per-tool atomic commits. This BI bundles each wave into a single commit for review tractability; individual rewrites within a commit are pure docs/test changes with no behavioural couplings between tools.
