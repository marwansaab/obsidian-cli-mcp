<!--
SYNC IMPACT REPORT
==================
Version change: 1.5.1 → 1.6.0 (MINOR — two normative sections are
added under Technical Standards (MCP Tool Surface Standards; Security
Defaults); the MCP standard is rewritten and materially expanded for
TypeScript SDK v2 and protocol revision 2026-07-28; Principle IV gains
a cancellation-and-progress requirement and a restated serialization
sentence; the quality gates gain a Linux + Windows CI gate and two
Constitution Compliance checklist lines. MAJOR was considered and
rejected: the policy reserves MAJOR for a principle removed or
redefined incompatibly, or a governance rule reversed. No Core
Principle is removed, renamed, reordered, or redefined, and no
governance rule is reversed. The MCP bullet does reverse which SDK
package is mandated, but it is a stack constraint, and replacing a
stack surface is the policy's own MINOR example. Principle IV's
normative content — UpstreamError with code / cause / details, no
silent fallbacks, no plain `throw new Error` at boundaries — is
unchanged; only its wire form is restated for SDK v2.)

Driver: the 0.8.20 scope handover from the obsidian-cli-mcp-review
research (researched 2026-10-27, baseline commit 0b02f8c). The MCP
spec moved to revision 2026-07-28 (stateless; `server/discover`
replaces `initialize`). TypeScript SDK v2 (`@modelcontextprotocol/
server`, `/client`, `/core`; stable since 2026-07-27) implements it;
SDK v1 (`@modelcontextprotocol/sdk`) stays on 2025-11-25 with fixes
only until about 2027-01-27. The v1.5.1 Technical Standards pinned the
project to the v1 package and its low-level `Server` API, so the
0.8.20 migration would have been a violation. Clients (Claude Code,
Claude apps, VS Code, Codex) now act on tool annotations, titles, and
server instructions, and the security defaults peer servers ship
(eval off, read-only modes) were not yet a rule here.

Modified sections:
  - Principle IV (Explicit Upstream Error Propagation) → second
    paragraph: the sentence "The MCP SDK MUST serialize these errors
    via the SDK's error-response shape" is replaced: tool failures
    are tool results with `isError: true` carrying the UpstreamError's
    code, message, and details; malformed requests and unknown tools
    MAY be protocol errors where the SDK makes them so; the
    zero-new-top-level-codes practice and ADR-015 sub-discriminators
    are stated as unaffected. Enables A2.
  - Principle IV → new third paragraph: long-running calls honor
    client cancellation (drop queued work; terminate an in-flight CLI
    child) and report progress when given a progress token. Enables
    A3. Name, order, and rationale of Principle IV unchanged.
  - Technical Standards → MCP bullet: replaced in full. SDK v2 line
    (`@modelcontextprotocol/server` + stdio subpath) is the sole MCP
    implementation; v1 package forbidden once the migration lands;
    `McpServer.registerTool` mandatory, hand-written `tools/list` /
    `tools/call` handlers forbidden except SDK-uncovered methods with
    an ADR; dual-era stdio via `serveStdio`; no Roots / Sampling /
    Logging capabilities; stderr-only diagnostics; Node floor note.
    Enables A2.
  - Technical Standards → Dependencies bullet: the swap from
    `@modelcontextprotocol/sdk` to the v2 packages is recorded as
    pre-justified by this amendment. Enables A2.
  - Development Workflow & Quality Gates → point 8: intro widened to
    "per principle, ADR, and standards section"; two lines appended
    (MCP Tool Surface Standards; Security Defaults); N/A prose
    extended with one rule per new line.
  - Development Workflow & Quality Gates → new point 9: CI runs lint,
    typecheck, test, and build on both Linux and Windows runners.
    Enables A4.
  - Development Workflow & Quality Gates → "Code review MUST verify
    each gate explicitly..." paragraph: extended to the two new
    sections.
  - Governance → new "Adoption of v1.6.0" paragraph: the code base at
    ratification does not meet the new rules; each rule binds from the
    merge of the 0.8.20 item that brings its code into line, and PRs
    in the interim MUST NOT add new non-conformance. Added by the
    amender for coherence (not in the amendment request); the owner
    may strike it at ratification.
  - Footer version line: 1.5.1 → 1.6.0; Last Amended 2026-07-05 →
    2026-10-28. Ratified date unchanged (2026-05-03).

Added sections:
  - Technical Standards → "MCP Tool Surface Standards" (### subsection):
      title on every tool .................................. B1
      explicit four-hint annotations block ................. B1
      every parameter described; stripping forbidden
        (retires ADR-005's mechanism) ...................... C1
      JSON-Schema-expressible input rules visible to clients,
        structurally or in descriptions .................... C1
      server instructions (standalone first 512 chars;
        well under 4,096) .................................. B2
      outputSchema SHOULD; structuredContent + identical
        text when published; errors text-only .............. B5
      schema dialect = what the SDK emits; no normalizing;
        fingerprint baseline kept as deliberate-change gate  C3
      whole-list tests for title, annotations, parameter
        descriptions ....................................... B1, C1
  - Technical Standards → "Security Defaults" (### subsection):
      escape hatches (eval, dev:*, devtools, plugin install /
        enable / disable, restart) refused unless opted in;
        typed tools' templated eval exempt ................. C2
      read-only mode + allowlist / denylist ................ B3
      elicitation for permanent delete and vault-wide
        find-and-replace commit; decline / cancel changes
        nothing and returns a structured error ............. B3
      write paths canonicalized via realpath of the nearest
        existing ancestor .................................. A5

Removed sections: none. No principle, standard, or gate is removed.
ADR-005's description-stripping mechanism is retired by the MCP Tool
Surface Standards; ADR-005 itself is superseded by a separate ADR
(scope item C1), not by this amendment.

Modified principles: Principle IV body only (serialization sentence
restated; cancellation / progress paragraph added). Principles I–V
names, order, and rationale unchanged. Principles I, II, III, and V
are byte-unchanged.

0.8.20 scope items enabled:
  A2 (SDK v2, McpServer, dual-era stdio) — MCP bullet, Dependencies
     bullet, Principle IV serialization sentence.
  A3 (cancellation and progress) — Principle IV third paragraph.
  A4 (Windows CI runner) — quality gate 9.
  A5 (vault-escape gap under symlinks) — Security Defaults, vault
     containment of writes.
  B1 (annotations and titles) — MCP Tool Surface Standards, title /
     annotations / enforcement.
  B2 (server instructions) — MCP Tool Surface Standards, server
     instructions.
  B3 (read-only mode, allowlist, confirmation) — Security Defaults,
     read-only mode and confirmation rules.
  B5 (typed results) — MCP Tool Surface Standards, typed results.
  C1 (stop stripping descriptions) — MCP Tool Surface Standards,
     parameter descriptions and visible input rules.
  C2 (gate unrestricted eval) — Security Defaults, escape hatches.
  C3 (retire the draft-07 parity normalizer) — MCP Tool Surface
     Standards, schema dialect.
  A1 (metadata-cache refresh fix) and B4 (list_vaults) need no
  amendment: both already fit the v1.5.1 text.

Decisions deliberately left open (the owner decides in the 0.8.20
scope; the text is written so either answer complies):
  B3 — behavior when the client cannot elicit. Security Defaults
       accepts either a refusal with a structured error or a per-call
       permission prompt the client enforces.
  C1 — whether input rules are made visible structurally (e.g. a
       discriminated union emitting `oneOf`) or stated in parameter
       descriptions. MCP Tool Surface Standards accepts either.

Templates and guidance checked (2026-10-28):
  - .specify/templates/plan-template.md: ✅ no edit. Its Constitution
    Check derives gates from this file ("Gates determined based on
    constitution file") and enumerates no checklist rows, so the new
    lines reach plans the same way the existing ones do.
  - .specify/templates/spec-template.md: ✅ no constitution-gate or
    checklist references; no edit.
  - .specify/templates/tasks-template.md: ✅ no constitution-gate or
    checklist references; no edit. (Pre-existing, not addressed here:
    its sample text calls tests OPTIONAL, which Principle II overrides
    for public surfaces.)
  - .specify/templates/checklist-template.md: ✅ no references.
  - .claude/skills/speckit-plan/SKILL.md: ✅ fills the Constitution
    Check "from constitution"; generic, no edit.
  - .claude/skills/speckit-docs-as-code/SKILL.md: ✅ refers to the
    Compliance table generically and lists only ADR-governed rows;
    no edit.
  - .claude/skills/speckit-constitution/SKILL.md: ✅ generic; no edit.
  - CLAUDE.md SPECKIT block: ✅ updated — constitution summary now
    names the Principle IV additions, the two new standards sections,
    and the two new checklist lines.
  - .docs-as-code/tech-stack.md and .docs-as-code/architecture.md:
    ⚠ pending. Both say the constitution requires the low-level SDK
    `Server` API. Out of this governance-only change's file scope;
    `/speckit-docs-as-code <n>` on the amendment PR corrects them per
    the PR lifecycle.
  - README.md: ⚠ pending with C2 / B3 — Security Defaults requires the
    README to document the escape-hatch opt-in variable with a warning,
    and B3 adds the read-only / allowlist / denylist variables.

Follow-up TODOs:
  - Known non-conformance at ratification, each closed by its 0.8.20
    item (see Governance → Adoption of v1.6.0): v1 SDK and low-level
    `Server` with hand-written handlers (A2); no cancellation or
    progress (A3); Ubuntu-only CI (A4); lexical fallback in
    `src/path-safety/canonical.ts` (A5); no titles or annotations
    (B1); no server instructions (B2); no read-only mode, filtering,
    or elicitation (B3); no published output schemas (B5); stripped
    parameter descriptions (C1); open `eval` in `obsidian_exec` (C2);
    draft-07 parity normalizer (C3).
  - New ADRs: one superseding the low-level-`Server` decision (A2);
    one superseding ADR-005 (C1). Register both in
    .decisions/Decision Log.md.
  - Remove the "Adoption of v1.6.0" paragraph by PATCH amendment once
    0.8.20 is released.

PRIOR SYNC IMPACT REPORT (v1.5.0 → v1.5.1, preserved for reference):
==================
Version change: 1.5.0 → 1.5.1 (PATCH — wording-only exemplar update
inside Principle III. The published-shape exemplar "MCP `inputSchema`
via `zod-to-json-schema` or equivalent" becomes "MCP `inputSchema` via
`z.toJSONSchema` or equivalent": BI-067 (067-upgrade-tech-stack,
PR #78) migrated the repo to zod 4 and retired the deprecated
zod-to-json-schema package from the manifest, replacing it with zod's
built-in z.toJSONSchema converter plus a descriptor-parity normalizer.
The principle's normative content — zod schema as single source of
truth for published shape and runtime parse, structured validation
errors, z.infer as the canonical downstream type — is byte-unchanged.
The "or equivalent" qualifier already made the old wording compliant;
this PATCH merely names the current concrete mechanism so the exemplar
matches reality.)

Modified sections:
  - Principle III (Boundary Input Validation with Zod) → first
    paragraph: exemplar package name swap only. No MUST/SHOULD
    changes, no new obligations, no removed obligations.
  - Footer version line: 1.5.0 → 1.5.1; Last Amended 2026-07-05.
    Ratified date unchanged (2026-05-03).

Added sections: none.
Removed sections: none.
Modified principles: Principle III wording only (exemplar); name,
ordering, rationale, and all normative language unchanged.

Templates checked (2026-07-05): plan-template.md, spec-template.md,
tasks-template.md, checklist-template.md, constitution-template.md —
zero references to zod-to-json-schema; no propagation needed.
Runtime guidance checked: CLAUDE.md Principle III summary names no
converter package; README has no converter reference. No follow-ups.

Driver: BI-067 T049 — the amendment was queued at plan time
(plan.md Constitution Check, Principle III row) with its precondition
gate "zod-to-json-schema absent from the manifest", satisfied when
PR #78 merged. Dedicated amendment PR per the governance procedure;
never bundled with 067 feature work.

PRIOR SYNC IMPACT REPORT (v1.4.0 → v1.5.0, preserved for reference):
==================
Version change: 1.4.0 → 1.5.0 (MINOR — TWO new normative gates are
added: the Constitution Compliance checklist gains an eighth row
pointing at ADR-014 (Plugin-Backed Typed Tools: Runtime-Dependency
Pattern) AND a ninth row pointing at ADR-015 (Sub-Discriminators via
details.reason for Multi-State Error Codes). Principles I–V are
unchanged in substance, name, and rationale; ADR-010 and ADR-013 rows
are unchanged; the per-PR review gate widens to acknowledge the two
new ADRs. Mirrors the 1.3.0 → 1.4.0 amendment pattern that added the
ADR-013 row.)

Modified sections:
  - Development Workflow & Quality Gates → point 8 (Constitution
    Compliance checklist): an eighth row appended below the existing
    seven rows pointing at ADR-014, and a ninth row pointing at
    ADR-015.
  - Development Workflow & Quality Gates → the "Any `N` MUST be
    paired with..." prose: parenthetical example extended to cover
    the two new ADRs. ADR-014 N/A applies when the BI adds no
    plugin-backed typed tool. ADR-015 N/A applies when the BI
    introduces no new `(top-level-code, details.code)` pair with
    multiple sub-states and adds no new sub-states to existing pairs.
  - Development Workflow & Quality Gates → the "Code review MUST
    verify each gate explicitly..." paragraph: extended from
    "Principles I-V and the ADR-010 / ADR-013 naming checks by
    inspection" to "Principles I-V and the ADR-010 / ADR-013 naming
    checks AND the ADR-014 plugin-lifecycle / ADR-015 sub-discriminator
    checks by inspection".
  - Footer version line: 1.4.0 → 1.5.0; Last Amended 2026-05-15
    (unchanged date — same day as the v1.4.0 amendment). Ratified
    date unchanged (2026-05-03).

Added sections: none. The two new checklist rows reuse the existing
Constitution Compliance checklist machinery — no new top-level
sections, no new principles, no new normative paragraphs beyond the
two checklist rows and the two prose-companion edits.

Removed sections: none.

Modified principles: none. Principles I–V are byte-stable in name,
ordering, and rationale. The change is purely additive at the
per-PR gate layer.

Driver: codifying TWO architectural patterns surfaced by BI-026
(026-smart-connections-similar) that the original BI-026 plan phase
only documented inline in spec.md / plan.md / research.md, leaving
them coupled to BI-026 instead of lifted to project-wide norms. The
/speckit-analyze review pass on 2026-05-15 surfaced the gap; the
user requested ADR-fication of both patterns. (1) ADR-014 codifies
the plugin-backed typed-tools runtime-dependency failure-mode pattern
— three plugin-lifecycle states (`<PLUGIN>_NOT_INSTALLED` /
`<PLUGIN>_NOT_READY` / `SOURCE_NOT_INDEXED`) under
CLI_REPORTED_ERROR.details.code, fixed stage-order in-eval lifecycle
checks per FR-017b's precedence chain, docs-only soft-pin for
plugin-version drift per Q1. (2) ADR-015 codifies the sub-discriminator
pattern via `details.reason` for multi-state error codes within a
single `(top-level-code, details.code)` pair — preserves the
constitutional zero-new-top-level-codes streak while permitting
finer agent-actionable signal. Both ADRs are sibling-or-elaboration
of existing constitutional/ADR conventions (Principle IV +
ADR-013) and apply to every future BI in the plugin-backed cohort
AND any future BI with multi-sub-state failure shapes regardless
of cohort.

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
  - CLAUDE.md: ✅ active-narrative block already mentions ADR-013;
    will be amended to mention ADR-014 + ADR-015 in the same change
    set as this constitution amendment (separate commit per the
    project convention for narrative rotations).

Follow-up TODOs:
  - None. ADR-014 and ADR-015 are in place at
    .decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md
    and .decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md
    (gitignored repo mirrors) and registered in
    .decisions/Decision Log.md (also gitignored mirror).
    Vault-side sync to canonical authoring locations at
    `421-Custom Connectors/Obsidian CLI MCP/200-Decisions/ADR-014 - ...`
    and `421-Custom Connectors/Obsidian CLI MCP/200-Decisions/ADR-015 - ...`
    is queued for a vault-side session per the
    strictly-read-only-source rule on the wrapper repo.

PRIOR SYNC IMPACT REPORT (v1.3.0 → v1.4.0, preserved for reference):
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
`z.toJSONSchema` or equivalent) and the runtime parse. Validation
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
Tool failures MUST be returned as tool results with `isError: true`
whose content carries the `UpstreamError`'s `code`, `message`, and
`details`. Malformed requests and calls to unknown tools MAY surface as
JSON-RPC protocol errors where the SDK makes them so. This
serialization leaves unchanged the practice of introducing no new
top-level codes and the `details.reason` sub-discriminators of ADR-015.
Plain `throw new Error("…")` at any boundary surface is a violation.

Long-running calls MUST honor the client's cancellation: a cancelled
request that has not started MUST be dropped from the queue without
running, and a cancelled request whose CLI child is already running
MUST have that child killed; in neither case may the cancelled call
block the work queued behind it. When the client supplies a progress
token, long-running calls MUST report progress against it.

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
- **MCP**: The official MCP TypeScript SDK, v2 line, is the sole MCP
  implementation: `@modelcontextprotocol/server`, with stdio from its
  `@modelcontextprotocol/server/stdio` subpath. The v1 package
  `@modelcontextprotocol/sdk` MUST NOT be used once the SDK v2 migration
  lands.
  - Tools MUST be registered through `McpServer.registerTool`.
    Hand-written request handlers (`setRequestHandler` for `tools/list`
    or `tools/call`) and ad-hoc JSON-RPC handling are forbidden, except
    for a protocol method the SDK does not cover; each such exception
    requires an ADR.
  - The stdio entry point MUST serve both protocol eras, 2025-11-25
    (`initialize`) and 2026-07-28 (`server/discover`), through the SDK's
    dual-era serving (`serveStdio`) for as long as supported clients
    still use the older handshake.
  - The server MUST NOT declare the deprecated Roots, Sampling, or
    Logging capabilities. Diagnostics go to stderr only; stdout carries
    MCP messages only.
  - SDK v2 requires Node 20+. The >= 22.11 floor under **Runtime**
    already satisfies it and stays where it is.
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
  surface area. Replacing `@modelcontextprotocol/sdk` with the SDK v2
  packages (`@modelcontextprotocol/server`, and `/core` or `/client`
  where needed) is pre-justified by the v1.6.0 amendment; the migration
  PR cites that amendment rather than re-arguing the swap.

### MCP Tool Surface Standards

These rules govern what MCP clients and models see of each published
tool. They complement Principle III, which makes the zod schema the
source of a tool's published shape.

- **Title**: Every published tool MUST carry a human-readable `title`.
- **Annotations**: Every published tool MUST carry an explicit
  `annotations` block that sets all four of `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint`. Leaving any
  hint to the specification's pessimistic defaults is a violation.
- **Parameter descriptions**: Every input parameter in a published
  `inputSchema` MUST carry a description. Stripping parameter
  descriptions from published schemas is forbidden. This retires the
  mechanism ADR-005 introduced; ADR-005 itself is superseded by a
  separate ADR.
- **Visible input rules**: Rules on a tool's input that JSON Schema can
  express (fields required together, mutually exclusive fields, fields
  conditional on a mode field) MUST be visible to clients, either
  structurally in the published schema or stated in the descriptions of
  the parameters they constrain. This constitution does not prescribe
  which of the two.
- **Server instructions**: The server MUST publish server
  `instructions`. Their opening MUST stand alone within the first 512
  characters, and the whole text MUST stay well under 4,096 characters.
- **Typed results**: A tool that returns a JSON object SHOULD publish an
  `outputSchema` derived from its zod output schema. A tool that does
  MUST return the result as `structuredContent` AND the identical JSON
  as a text content block. Error results stay text-only.
- **Schema dialect**: The published schema dialect is whatever the SDK
  emits. Normalizing emitted schemas to imitate a retired converter, or
  to keep a fingerprint unchanged, is forbidden. The registry
  fingerprint baseline remains a deliberate-change gate: a change to
  the published surface fails it, and the fix is to review the change
  and regenerate the baseline in the same PR.
- **Enforcement**: Tests MUST enforce the title, annotations, and
  parameter-description rules across the whole published tool list.

### Security Defaults

- **Escape hatches off by default**: Commands that execute arbitrary
  code or drive developer tooling (the Obsidian CLI's `eval`, `dev:*`,
  `devtools`, plugin install / enable / disable, and `restart`) MUST be
  refused by default. They MAY be enabled only through an explicit
  opt-in environment variable that the README documents with a warning.
  Typed tools' internal use of `eval` through fixed templates with
  encoded payloads is exempt, because it never passes caller-supplied
  code.
- **Read-only mode and tool filtering**: The server MUST offer a
  read-only mode that registers only tools annotated
  `readOnlyHint: true`, plus allowlist and denylist controls over which
  tools are registered.
- **Confirmation of irreversible operations**: Irreversible operations
  (permanent delete; a vault-wide find-and-replace commit) MUST ask the
  human to confirm through elicitation where the client supports it. A
  declined or cancelled confirmation MUST change nothing and MUST return
  a structured error (Principle IV). Where the client cannot elicit, the
  operation MUST NOT proceed unconfirmed: refusing it with a structured
  error and gating it behind a per-call permission prompt the client
  enforces both satisfy this rule.
- **Vault containment of writes**: Every vault write path MUST be
  canonicalized against the vault root by resolving its nearest existing
  ancestor with `realpath`, so that symlinks and junctions under
  not-yet-existing folders cannot escape the vault. Falling back to the
  lexical path when an ancestor does not yet exist is a violation.

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
   Y / N / N/A entry per principle, ADR, and standards section listed:

   - [ ] Principle I (Modular Code Organization): Y / N / N/A
   - [ ] Principle II (Public Surface Test Coverage): Y / N / N/A
   - [ ] Principle III (Boundary Input Validation with Zod): Y / N / N/A
   - [ ] Principle IV (Explicit Upstream Error Propagation): Y / N / N/A
   - [ ] Principle V (Attribution & Layered Composition): Y / N / N/A
   - [ ] ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand): Y / N / N/A
   - [ ] ADR-013 (Plugin-Namespace Tool Naming Convention): Y / N / N/A
   - [ ] ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern): Y / N / N/A
   - [ ] ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes): Y / N / N/A
   - [ ] MCP Tool Surface Standards: Y / N / N/A
   - [ ] Security Defaults: Y / N / N/A

   Any `N` MUST be paired with a Complexity Tracking entry in the corresponding
   plan that justifies the deviation. `N/A` is permitted only when the change
   touches no surface that the principle or ADR governs (e.g., a docs-only PR
   is N/A on II–V; a PR that adds no typed tool is N/A on ADR-010 AND ADR-013
   AND ADR-014; a PR that adds a native-CLI-wrapper typed tool is N/A on
   ADR-013 AND ADR-014; a PR that adds a plugin-API-wrapper typed tool is
   N/A on ADR-010; a PR that introduces no new `(top-level-code, details.code)`
   pair with multiple sub-states AND adds no new sub-states to existing pairs
   is N/A on ADR-015; a PR that changes no published tool, schema, or server
   instructions is N/A on MCP Tool Surface Standards; a PR that touches no
   write path, no escape hatch, and no destructive tool is N/A on Security
   Defaults).
9. CI MUST run the full lint, typecheck, test, and build pipeline on both
   Linux and Windows runners. Windows is a primary platform for this server;
   a change is not green until both runners are.

**Spec-kit workflow**: Any feature larger than a single-file change MUST
enter via `/speckit-specify` → `/speckit-clarify` (repeated until no
underspecified items remain) → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`. Spec Clarifications log every Q&A so that later
readers can trace each decision back to the conversation that produced it.
The plan's Constitution Check table cites how each principle is satisfied
or documents and justifies any deviation. `tasks.md` is dependency-ordered.

Code review MUST verify each gate explicitly; "CI is green" is necessary but
not sufficient — reviewers also confirm Principles I–V and the ADR-010 / ADR-013
naming checks AND the ADR-014 plugin-lifecycle / ADR-015 sub-discriminator
checks AND the MCP Tool Surface Standards / Security Defaults checks by
inspection.

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

**Adoption of v1.6.0**: The rules v1.6.0 added or rewrote (the MCP
standard, MCP Tool Surface Standards, Security Defaults, Principle IV's
cancellation and progress requirement, and gate 9) set the target of the
0.8.20 release; the code base at ratification does not yet meet them. Each
rule binds the code it governs from the merge of the 0.8.20 work item that
brings that code into line. Until then, a PR is not in violation for
non-conformance it did not introduce, MUST NOT add new non-conformance, and
records the pending item in its checklist entry (e.g. `N/A (pending B1)`).
Once 0.8.20 is released this paragraph is spent and SHOULD be removed by a
PATCH amendment.

**Version**: 1.6.0 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-10-28
