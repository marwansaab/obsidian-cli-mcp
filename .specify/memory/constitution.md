<!--
SYNC IMPACT REPORT
==================
Version change: 1.3.0 → 1.4.0 (MINOR — a new normative gate is added:
the Constitution Compliance checklist gains a seventh row pointing at
ADR-013 (Plugin-Namespace Tool Naming Convention). Principles I–V are
unchanged in substance, name, and rationale; ADR-010's row is unchanged;
the per-PR review gate widens to acknowledge the new ADR. Mirrors the
1.2.0 → 1.3.0 amendment pattern that added the ADR-010 row.)

Modified sections:
  - Development Workflow & Quality Gates → point 8 (Constitution
    Compliance checklist): a seventh row appended below the existing
    six rows pointing at ADR-013.
  - Development Workflow & Quality Gates → the "Any `N` MUST be
    paired with..." prose: parenthetical example extended from "a PR
    that adds no typed tool is N/A on ADR-010" to "a PR that adds no
    typed tool is N/A on ADR-010 AND ADR-013; a PR that adds a
    native-CLI-wrapper typed tool is N/A on ADR-013; a PR that adds a
    plugin-API-wrapper typed tool is N/A on ADR-010".
  - Development Workflow & Quality Gates → the "Code review MUST
    verify each gate explicitly..." paragraph: extended from
    "Principles I–V and the ADR-010 naming check by inspection" to
    "Principles I–V and the ADR-010 / ADR-013 naming checks by
    inspection".
  - Footer version line: 1.3.0 → 1.4.0; Last Amended 2026-05-13 →
    2026-05-15. Ratified date unchanged (2026-05-03).

Added sections: none. The new checklist row reuses the existing
Constitution Compliance checklist machinery — no new top-level
sections, no new principles, no new normative paragraphs beyond the
checklist row and the two prose-companion edits.

Removed sections: none.

Modified principles: none. Principles I–V are byte-stable in name,
ordering, and rationale. The change is purely additive at the
per-PR gate layer.

Driver: codifying the plugin-namespace tool-naming convention that
BI-026 (026-smart-connections-similar) establishes for typed-tool
wrappers over plugin-exposed APIs. The convention previously did not
exist; BI-026 is the first instance (`smart_connections_similar`
wraps the Smart Connections plugin's similarity-search API reached
via `obsidian eval`). ADR-013 (decided 2026-05-15, file at
.decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md)
lifts the convention into a normative artefact. The new Constitution
Compliance row is the per-PR enforcement gate that catches
non-conforming plugin-backed tool names at /speckit-plan time,
complementing both the ADR-010 row (which governs native-CLI
wrappers) and the FR-018 registry-stability baseline test (already
shipped under BI-0061) which catches drift in the CURRENT set but
cannot catch a new plugin-backed tool introduced with a
non-conforming name.

Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ Constitution Check
    section already references "Constitution Check gate documented in
    the plan template"; no edit required — plans cite ADRs alongside
    principles in the existing free-form gate evidence rows.
  - .specify/templates/spec-template.md: ✅ no constitution-gate
    references; no edit required.
  - .specify/templates/tasks-template.md: ✅ no constitution-gate
    references; no edit required.
  - .specify/templates/checklist-template.md: ✅ no constitution-gate
    references; no edit required.
  - CLAUDE.md: ✅ already defers to plan/constitution; no edits
    required for the constitution amendment itself (the
    BI-026-specific active-narrative rewrite is a separate concern
    handled by /speckit-plan's Phase-1 agent-context-update step).

Follow-up TODOs:
  - None. ADR-013 is in place at
    .decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md
    and registered in .decisions/Decision Log.md (verified at
    amendment time).

PRIOR SYNC IMPACT REPORT (preserved for reference):
==================
Version change: 1.2.0 → 1.3.0 (MINOR — a new normative gate is added:
the Constitution Compliance checklist gains a sixth row pointing at
ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand). Principles
I–V are unchanged in substance, name, and rationale; only the per-PR
review gate widens to acknowledge the new ADR.)

Modified sections:
  - Development Workflow & Quality Gates → point 8 (Constitution
    Compliance checklist): a sixth row appended below the five
    Principle rows pointing at ADR-010.
  - Development Workflow & Quality Gates → the "Any `N` MUST be
    paired with..." prose immediately below the checklist: rephrased
    from "no surface that the principle governs" to "no surface that
    the principle or ADR governs"; the parenthetical example expanded
    from "a docs-only PR is N/A on II–V" to "a docs-only PR is N/A
    on II–V; a PR that adds no typed tool is N/A on ADR-010".
  - Development Workflow & Quality Gates → the "Code review MUST
    verify each gate explicitly..." paragraph: extended from
    "Principles I–V by inspection" to "Principles I–V and the ADR-010
    naming check by inspection".
  - Footer version line: 1.2.0 → 1.3.0; Last Amended 2026-05-07 →
    2026-05-13. Ratified date unchanged (2026-05-03).

Added sections: none. The new checklist row reuses the existing
Constitution Compliance checklist machinery — no new top-level
sections, no new principles, no new normative paragraphs beyond the
checklist row and the two prose-companion edits.

Removed sections: none.

Modified principles: none. Principles I–V are byte-stable in name,
ordering, and rationale. The change is purely additive at the
per-PR gate layer.

Driver: codifying the typed-tool naming convention that BI-0061
(022-rename-typed-tools) applied wholesale in
@marwansaab/obsidian-cli-mcp@0.5.0 — renaming `read_note → read`,
`delete_note → delete`, `list_files → files`, `write_property →
set_property`, `rename_note → rename` to mirror upstream Obsidian CLI
subcommand names. The convention previously lived only in BI-0061
prose. ADR-010 (decided 2026-05-13, file at
.decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md)
lifts the convention into a normative artefact. The new Constitution
Compliance row is the per-PR enforcement gate that catches non-
conforming names at /speckit-plan time, complementing the FR-018
registry-stability baseline test (already shipped under BI-0061)
which catches drift in the CURRENT set but cannot catch a new tool
introduced with a non-conforming name.

Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ Constitution Check
    section already references "Constitution Check gate documented in
    the plan template"; no edit required — plans cite ADRs alongside
    principles in the existing free-form gate evidence rows.
  - .specify/templates/spec-template.md: ✅ no constitution-gate
    references; no edit required.
  - .specify/templates/tasks-template.md: ✅ no constitution-gate
    references; no edit required.
  - .specify/templates/checklist-template.md: ✅ no constitution-gate
    references; no edit required.
  - CLAUDE.md: ✅ already defers to plan/constitution; no edits
    required.

Follow-up TODOs:
  - None. ADR-010 is already in place at
    .decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md
    and registered in .decisions/Decision Log.md (verified at
    amendment time).
-->

# obsidian-cli-mcp Constitution

A TypeScript project that exposes an MCP server surface for working with
Obsidian vaults.

## Core Principles

### I. Modular Code Organization

Code MUST be organized into small, single-purpose modules with explicit
boundaries. Each MCP tool, vault-access helper, and external-service
adapter lives in its own module and exposes a narrow, typed interface.
Cross-module imports MUST flow in one direction (tool → service →
adapter → external SDK); no upward or cyclic dependencies. A module
that grows beyond a single clear responsibility MUST be split before new
functionality is added to it. Prefer a `{schema, tool, handler}.ts`
layout per surface.

**Rationale**: Clean module boundaries keep the MCP surface and the
underlying vault logic from contaminating each other, and make every
piece independently testable.

### II. Public Surface Test Coverage (NON-NEGOTIABLE)

Every externally callable surface — every MCP tool registered with the
server, every published API entry point — MUST ship with at least one
happy-path test AND at least one failure-or-boundary test (input
validation failure, upstream error, boundary violation, or empty/edge
input) in the same change that adds, renames, or modifies it. A surface
MUST NOT be merged, exposed, or renamed without its tests. Tests MUST
be co-located with the source module they cover — a module at
`src/foo.ts` has its tests at `src/foo.test.ts`, not under a parallel
`tests/` tree. The co-located convention keeps tests discoverable from
the source they exercise and matches the per-surface module layout in
Principle I.

**Rationale**: MCP tools are the contract this project offers to LLM
agents. A regression is observable to every downstream caller
immediately and silently — there is no UI layer to catch it. Tests are
the only enforcement.

### III. Boundary Input Validation with Zod

Every MCP tool wrapper MUST validate its incoming arguments through a
`zod` schema before any business logic, network call, or filesystem
access runs. The schema MUST be the single source of truth for both
the surface's published shape (MCP `inputSchema` via
`zod-to-json-schema` or equivalent) and the runtime parse. Validation
failures MUST return a structured error with the field paths reported
by zod; validated values MUST be passed to inner functions as
already-typed objects, not re-validated downstream. Internal helpers
MAY trust their inputs.

The zod-inferred type (`z.infer<typeof schema>`) MUST be the canonical
type used downstream; redefining the same shape as a TypeScript
interface or hand-written type elsewhere is a violation. Types and
schemas MUST NOT drift apart — there is one source of truth per
surface, and it is the zod schema.

**Rationale**: A single validation point at the boundary keeps internal
code free of defensive checks, ensures the published schema and runtime
behavior cannot drift apart, and produces precise, actionable error
messages for LLM clients.

### IV. Explicit Upstream Error Propagation

Errors raised by upstream systems (the Obsidian Integrated CLI binary,
the filesystem, any embedding or LLM provider, any HTTP client) MUST be
either (a) handled with a documented recovery path or (b) surfaced to
the caller as a structured error that preserves the upstream status
code, message, and — where safe — the underlying cause. `catch` blocks
MUST NOT return empty results, default values, or `null` to mask a
failure. Logging an error and continuing is NOT handling it. If a
partial-success or best-effort-continue path is intentional, it MUST
cite the explicit user/spec decision that authorized it (a
Clarifications entry, an ADR, or a referenced issue), and the response
payload MUST report what succeeded AND what failed.

Errors propagated to callers MUST be instances of a project-defined
`class UpstreamError extends Error` (or a discriminated subclass
thereof) carrying at minimum: `code` (a stable string identifier),
`cause` (the original thrown value where available), and `details` (a
structured record with the upstream status / context / field paths).
The MCP SDK MUST serialize these errors via the SDK's error-response
shape. Plain `throw new Error("…")` at any boundary surface is a
violation.

**Rationale**: Silent failures present as "the caller got an empty or
wrong answer" — indistinguishable from a legitimate result and
impossible to debug from the outside. Explicit propagation preserves
the chain of custody for failures all the way to the agent that invoked
the surface; a typed error class lets reviewers grep for `UpstreamError`
to audit every place failures cross a boundary.

### V. Attribution & Layered Composition Transparency

Any module whose algorithm, structure, or non-trivial code derives from
another project MUST carry a header comment naming the upstream source,
license SPDX identifier, the commit hash or version pinned, and a one-line
description of what was lifted vs. what was adapted. When a feature is
composed of multiple layers (e.g., a primitive lifted from one source, a
composition pattern adapted from another, and an original wrapper layer),
each layer MUST be labeled in its header so readers can tell at a glance
which code is original and which is borrowed.

Original-contribution modules — those with no upstream — MUST carry a header
of the form `// Original — no upstream. <one-line description of intent>.`
Modules without ANY header (neither attribution nor original-contribution)
are a violation regardless of whether they are in fact original; the absence
of a header is indistinguishable from forgotten attribution.

README MUST list every upstream in an "Attributions" section with the same
SPDX + version metadata. Lifting code without attribution is a constitution
violation regardless of how permissive the upstream license is.

**Rationale**: Transparency about what was built versus what was composed is
a primary quality signal of this project and a legal hygiene requirement. It
also lets future maintainers upgrade lifted code by tracing each layer back
to its source.

## Technical Standards & Stack Constraints

- **Language**: TypeScript, strict mode, `tsc --noEmit` clean. No `any` in
  public signatures; `unknown` only when immediately narrowed via zod.
- **TypeScript config**: `tsconfig.json` MUST set `"module": "NodeNext"`,
  `"moduleResolution": "NodeNext"`, `"target": "ES2024"` (or higher matching
  the `engines.node` floor), `"strict": true`. Project-wide `tsc --noEmit` is
  the authoritative typecheck.
- **Runtime**: Node.js >= 22.11 (latest 22.x LTS minor at ratification). Set
  `engines.node` in `package.json` accordingly. Newer stable APIs (the
  built-in test runner, `fetch`, `AbortController`, web streams) are
  permitted; legacy polyfills MUST NOT be added. Bumping the floor to >= 24
  (or higher) requires a constitution amendment that cites the specific API
  requirement driving the bump.
- **Validation**: `zod` is the only permitted runtime input-validation
  library at any boundary surface. Hand-rolled `typeof` / `instanceof` chains
  at boundaries are a constitution violation.
- **MCP**: `@modelcontextprotocol/sdk` is the sole MCP transport. Tool
  registration MUST go through the SDK's `Server` API; ad-hoc JSON-RPC
  handling is forbidden.
- **Test framework**: `vitest` with `@vitest/coverage-v8` for the V8 coverage
  provider. Test files use the `*.test.ts` naming convention and live
  co-located with their source module (per Principle II). The merge-gating
  test command is `vitest run` (CI); developers may use `vitest` (watch) and
  `vitest --ui` locally. Coverage configuration lives in `vitest.config.ts`;
  the aggregate statements threshold is the **single source of truth** for
  the merge floor and is ratcheted via a one-line visible edit (no env vars,
  no CI flags, no separate gate config). Other test frameworks (`node:test`,
  `jest`, `mocha`) require a dependency-justification entry per the
  Dependencies rule and a constitution amendment.
- **Lint & format**: `eslint` (flat config) MUST pass with zero warnings
  before merge. Prettier is the formatter of record; formatting
  disagreements are not resolved in review.
- **Dependencies**: New runtime dependencies MUST be justified in the PR
  description against the alternative of a small in-tree implementation.
  Bias hard toward in-tree for anything under ~150 LOC or with a narrow
  surface area.

## Development Workflow & Quality Gates

The following gates apply to every change before it can be merged:

1. `npm run lint` passes with zero warnings.
2. `npm run typecheck` passes.
3. `npm run build` succeeds.
4. The test suite covering all public surfaces passes (Principle II). Diffs
   that add, rename, or modify a public surface MUST include the corresponding
   test additions in the same change.
5. The aggregate **statements** coverage threshold passes — configured in
   `vitest.config.ts` under `test.coverage.thresholds.statements`. This is
   the single source of truth for the merge floor; it ratchets upward (or
   downward, if intentional) via a one-line visible edit. **Branch /
   function / per-file thresholds are forbidden without an amendment** —
   they are reported in the text reporter as advisory information but do
   NOT block merge. Adding `branches`, `functions`, `lines`, or `perFile`
   keys to `test.coverage.thresholds` without a constitution amendment is a
   violation; reviewers MUST flag any PR that does so.
6. The Sync Impact Report at the top of this file is updated whenever the
   constitution itself is amended.
7. Spec-driven changes (those produced via `/speckit-plan` and
   `/speckit-tasks`) MUST pass the Constitution Check gate documented in the
   plan template before implementation begins.
8. Every PR description includes a Constitution Compliance checklist with one
   Y / N / N/A entry per principle:

   - [ ] Principle I (Modular Code Organization): Y / N / N/A
   - [ ] Principle II (Public Surface Test Coverage): Y / N / N/A
   - [ ] Principle III (Boundary Input Validation with Zod): Y / N / N/A
   - [ ] Principle IV (Explicit Upstream Error Propagation): Y / N / N/A
   - [ ] Principle V (Attribution & Layered Composition): Y / N / N/A
   - [ ] ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand): Y / N / N/A
   - [ ] ADR-013 (Plugin-Namespace Tool Naming Convention): Y / N / N/A

   Any `N` MUST be paired with a Complexity Tracking entry in the corresponding
   plan that justifies the deviation. `N/A` is permitted only when the change
   touches no surface that the principle or ADR governs (e.g., a docs-only PR
   is N/A on II–V; a PR that adds no typed tool is N/A on ADR-010 AND ADR-013;
   a PR that adds a native-CLI-wrapper typed tool is N/A on ADR-013; a PR that
   adds a plugin-API-wrapper typed tool is N/A on ADR-010).

**Spec-kit workflow**: Any feature larger than a single-file change MUST
enter via `/speckit-specify` → `/speckit-clarify` (repeated until no
underspecified items remain) → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`. Spec Clarifications log every Q&A so that later
readers can trace each decision back to the conversation that produced it.
The plan's Constitution Check table cites how each principle is satisfied
or documents and justifies any deviation. `tasks.md` is dependency-ordered.

Code review MUST verify each gate explicitly; "CI is green" is necessary but
not sufficient — reviewers also confirm Principles I–V and the ADR-010 / ADR-013
naming checks by inspection.

## Governance

This constitution supersedes all other contributor guidance, including
`README.md`, agent prompts, and prior conventions. Where this document and
another guide disagree, this document wins; the other guide MUST be updated
to match within the same change set.

**Amendment procedure**: Amendments are proposed by editing this file via
`/speckit-constitution`, which regenerates the Sync Impact Report, bumps the
version per the rules below, and updates the `Last Amended` date. Amendments
MUST be reviewed in a dedicated PR — not bundled with feature work.

**Versioning policy** (semantic versioning of the constitution):

- **MAJOR**: A principle is removed, redefined in a backward-incompatible
  way, or a governance rule is reversed.
- **MINOR**: A new principle or normative section is added, or existing
  guidance is materially expanded or contracted in scope (e.g., a stack
  surface is descoped from the project, or a new surface is added).
- **PATCH**: Wording clarifications, typo fixes, rationale rewrites that do
  not change the rule.

**Runtime guidance**: Day-to-day development guidance lives in `CLAUDE.md`
and in feature-specific plans under `specs/`. Those documents MUST defer to
this constitution; if they imply a contradiction, treat it as a bug in the
guidance document and fix it.

**Version**: 1.4.0 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-05-15
