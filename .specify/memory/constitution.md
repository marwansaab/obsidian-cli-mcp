<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 (MINOR — Test framework standard switched from
node:test to Vitest; new automated coverage gate added to Development Workflow.)

Modified sections:
  - Technical Standards & Stack Constraints → Test framework paragraph rewritten:
    Vitest with @vitest/coverage-v8 is now the mandated framework (replaces
    node:test). node:test, jest, and mocha are now the "requires amendment"
    list.
  - Development Workflow & Quality Gates → Inserted a new gate (#5) for the
    aggregate statements coverage threshold. Subsequent gates renumbered
    (5→6, 6→7, 7→8). The discipline rule that branch / function / per-file
    thresholds are forbidden without amendment is also captured here.

Added sections: none.
Removed sections: none.
Modified principles: none — all five principles unchanged.

Driver: bringing the repo's CI gating in line with the project's actual
implementation needs (V8 coverage with reporter ecosystem, threshold gating,
single-source-of-truth floor that ratchets via visible diff). Vitest's V8
coverage provider gives this off the shelf; node:test's experimental coverage
flag does not.

Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ compatible — its Constitution Check
    section already delegates to this file; no edits required.
  - .specify/templates/spec-template.md: ✅ no constitution-specific references.
  - .specify/templates/tasks-template.md: ✅ no constitution-specific references.
  - .specify/templates/checklist-template.md: ✅ no constitution-specific references.
  - CLAUDE.md: ✅ already defers to plan/constitution; no edits required.

Follow-up TODOs:
  - README.md: add an "Attributions" section per Principle V before any module
    with upstream lineage is merged. (Currently the repo has no source-derived
    code to attribute, but the section MUST exist before any lifted code lands.)
  - 001-add-cli-bridge: existing tests must migrate from node:test to Vitest
    in the same change set that lands this amendment.
-->

# obsidian-cli-mcp Constitution

A TypeScript project that exposes a command-line interface and an MCP server
surface for working with Obsidian vaults.

## Core Principles

### I. Modular Code Organization

Code MUST be organized into small, single-purpose modules with explicit
boundaries. Each CLI command, MCP tool, vault-access helper, and
external-service adapter lives in its own module and exposes a narrow, typed
interface. Cross-module imports MUST flow in one direction (command/tool →
service → adapter → external SDK); no upward or cyclic dependencies. A module
that grows beyond a single clear responsibility MUST be split before new
functionality is added to it. Prefer a `{schema, command, handler}.ts` (or
`{schema, tool, handler}.ts`) layout per surface.

**Rationale**: Clean module boundaries keep the CLI surface, the MCP surface,
and the underlying vault logic from contaminating each other, and make every
piece independently testable.

### II. Public Surface Test Coverage (NON-NEGOTIABLE)

Every externally callable surface — every CLI command, every MCP tool
registered with the server, every published API entry point — MUST ship with
at least one happy-path test AND at least one failure-or-boundary test (input
validation failure, upstream error, boundary violation, or empty/edge input)
in the same change that adds, renames, or modifies it. A surface MUST NOT be
merged, exposed, or renamed without its tests. Tests MUST be co-located with
the source module they cover — a module at `src/foo.ts` has its tests at
`src/foo.test.ts`, not under a parallel `tests/` tree. The co-located
convention keeps tests discoverable from the source they exercise and matches
the per-surface module layout in Principle I.

**Rationale**: CLI commands and MCP tools are the contract this project offers
to humans and to LLM agents respectively. A regression in either is observable
to every downstream caller immediately and silently — there is no UI layer to
catch it. Tests are the only enforcement.

### III. Boundary Input Validation with Zod

Every CLI command parser and every MCP tool wrapper MUST validate its incoming
arguments through a `zod` schema before any business logic, network call, or
filesystem access runs. The schema MUST be the single source of truth for both
the surface's published shape (CLI help text generation, MCP `inputSchema` via
`zod-to-json-schema` or equivalent) and the runtime parse. Validation failures
MUST return a structured error with the field paths reported by zod; validated
values MUST be passed to inner functions as already-typed objects, not
re-validated downstream. Internal helpers MAY trust their inputs.

The zod-inferred type (`z.infer<typeof schema>`) MUST be the canonical type
used downstream; redefining the same shape as a TypeScript interface or
hand-written type elsewhere is a violation. Types and schemas MUST NOT drift
apart — there is one source of truth per surface, and it is the zod schema.

**Rationale**: A single validation point at the boundary keeps internal code
free of defensive checks, ensures the published schema and runtime behavior
cannot drift apart, and produces precise, actionable error messages for both
human users and LLM clients.

### IV. Explicit Upstream Error Propagation

Errors raised by upstream systems (the Obsidian Integrated CLI binary, the
filesystem, any embedding or LLM provider, any HTTP client) MUST be either
(a) handled with a documented recovery path or (b) surfaced to the caller as a
structured error that preserves the upstream status code, message, and — where
safe — the underlying cause. `catch` blocks MUST NOT return empty results,
default values, or `null` to mask a failure. Logging an error and continuing
is NOT handling it. If a partial-success or best-effort-continue path is
intentional, it MUST cite the explicit user/spec decision that authorized it
(a Clarifications entry, an ADR, or a referenced issue), and the response
payload MUST report what succeeded AND what failed.

Errors propagated to callers MUST be instances of a project-defined
`class UpstreamError extends Error` (or a discriminated subclass thereof)
carrying at minimum: `code` (a stable string identifier), `cause` (the
original thrown value where available), and `details` (a structured record
with the upstream status / context / field paths). The MCP SDK MUST serialize
these errors via the SDK's error-response shape; the CLI surface MUST surface
them as non-zero exit codes with the structured payload printed to stderr in
the parser-selected format. Plain `throw new Error("…")` at any boundary
surface is a violation.

**Rationale**: Silent failures present as "the caller got an empty or wrong
answer" — indistinguishable from a legitimate result and impossible to debug
from the outside. Explicit propagation preserves the chain of custody for
failures all the way to the human or agent that invoked the surface; a typed
error class lets reviewers grep for `UpstreamError` to audit every place
failures cross a boundary.

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
- **CLI**: `citty` is the sole CLI parsing library. Argument and option specs
  MUST be derived from the same zod schemas that drive the MCP `inputSchema`
  (per Principle III); ad-hoc `citty` definitions that diverge from the zod
  schema are a constitution violation. The shared schema lives in the
  `schema.ts` of the per-surface module.
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

   Any `N` MUST be paired with a Complexity Tracking entry in the corresponding
   plan that justifies the deviation. `N/A` is permitted only when the change
   touches no surface that the principle governs (e.g., a docs-only PR is N/A
   on II–V).

**Spec-kit workflow**: Any feature larger than a single-file change MUST
enter via `/speckit-specify` → `/speckit-clarify` (repeated until no
underspecified items remain) → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`. Spec Clarifications log every Q&A so that later
readers can trace each decision back to the conversation that produced it.
The plan's Constitution Check table cites how each principle is satisfied
or documents and justifies any deviation. `tasks.md` is dependency-ordered.

Code review MUST verify each gate explicitly; "CI is green" is necessary but
not sufficient — reviewers also confirm Principles I–V by inspection.

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
  guidance is materially expanded.
- **PATCH**: Wording clarifications, typo fixes, rationale rewrites that do
  not change the rule.

**Runtime guidance**: Day-to-day development guidance lives in `CLAUDE.md`
and in feature-specific plans under `specs/`. Those documents MUST defer to
this constitution; if they imply a contradiction, treat it as a bug in the
guidance document and fix it.

**Version**: 1.1.0 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-05-03
