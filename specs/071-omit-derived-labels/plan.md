# Implementation Plan: Omit Derived Labels

**Branch**: `071-omit-derived-labels` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/071-omit-derived-labels/spec.md`

> **Modify one existing typed tool (`links`).** No new tool, schema field, error code or dependency. One condition changes in the eval template's `wrap` function, and the published rule text is corrected in the description and the help page.

## Summary

The `links` tool reports `displayText` whenever Obsidian's cache value differs from the link (the spec 025 F6 omit-when-equal transform). Obsidian always fills `displayText`, and for an unaliased fragment link it derives one (`"Tgt > Head"`, `"paper.pdf > page=3"`, or the bare fragment for same-note links). Every unaliased heading, block or other fragment link and embed therefore comes back with a label the note never contained. The plan-time probe ([research.md](research.md) T0 evidence) showed the same derived label on frontmatter (property) links — the spec calls them "property links"; the plan and tasks say "frontmatter links" — and an empty-string label on empty or blank aliases, plain links included.

**Primary requirements** (spec, after clarify and the plan-stage rulings): no label on any unaliased fragment-bearing wiki-form link or embed, frontmatter links included (FR-001, Clarifications Q1/Q3); author aliases kept as written, including size text and aliases shaped like `X > Y` (FR-002, FR-003, Q2); empty or blank aliases treated as no alias everywhere (FR-004a, Q4); everything else unchanged (FR-004, FR-005); one rule in the description and the help page, no caveat, no "embeds never" claim (FR-006, FR-007); tests for every shape (FR-008).

**Technical approach**:

- **D1/D2**: In `src/tools/links/_template.ts`, `wrap` emits `displayText` for a wiki-form entry (`original` starts with `[[` or `![[`) only when `original` contains `|`, `displayText !== ''` and `displayText !== link`. Markdown-form entries keep `displayText !== link`, so their link text or alt text is reported as written, empty included (analysis I1, option (b)). Because one `wrap` serves frontmatter links, body links and embeds, the rule is uniform by construction. The emitted value is still the cache's `displayText`.
- **D4**: A new co-located test runs the rendered template in `node:vm` against a stub `app` loaded with the T0 cache shapes, and checks all 27 [data-model.md](data-model.md) rows. Until now the template's transform was never executed in tests: handler tests mock the envelope.
- **D5**: One description sentence replaced, the `docs/tools/links.md` displayText row rewritten with the workaround removed, and the baseline regenerated (only `links.descriptionFingerprint` moves). Rule text: [contracts/display-label.md](contracts/display-label.md).

**T0 gates** ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)): G0 is done at plan time. Implement time has three gates: G1 (alias trimming, wording only), G2 (end-to-end through the built tool), G3 (aliased frontmatter list items keep `|` in `original`).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged. The template body is plain ES2015+ JavaScript run inside Obsidian's renderer.
**Primary Dependencies**: `zod` 4, `@modelcontextprotocol/server` (SDK v2) — unchanged. Reused in-tree: `src/tools/_shared.ts` (`composeEvalCode`, `B64_PAYLOAD_DECODE_EXPR`), `node:vm` (test only, already used by `_shared.test.ts`). **No new dependency.**
**Storage**: N/A (read-only tool; Obsidian metadata cache).
**Testing**: `vitest run`, co-located `*.test.ts`. New template-execution test in `src/tools/links/`; `index.test.ts` gets assertions on the description sentence; existing `handler.test.ts` cases stay as they are (they cover envelope passthrough). Live evidence via T0 G1–G3.
**Target Platform**: Windows (reference, probed), macOS, Linux; CI on Linux and Windows.
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: No added CLI call; one extra string test per cache entry inside the existing eval.
**Constraints**: Zero new error codes (Principle IV); output schema unchanged (Principle III); `target`/`line`/`kind`/order/`count` byte-stable (FR-005); plain aliased links report the same value as today (FR-004).
**Scale/Scope**: `src/tools/links/{_template.ts, index.ts, index.test.ts}` + one new test file; `docs/tools/links.md`; `src/tools/_register-baseline.json` (regenerated). **No edits to** `handler.ts`, `schema.ts`, `_shared.ts`, `errors.ts`, `server.ts`, `_register.ts`, `backlinks`, the server instructions or `docs/tools/index.md`.

**Resolved unknowns**: all (research D1–D6, Clarifications Q1–Q4). Remaining: the implement-time T0 gates G1–G3, each with a recorded fallback.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below). Constitution v1.6.0.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Change stays inside `src/tools/links/`. Graph fact: `links/_template.ts::JS_TEMPLATE` is imported only by `links/handler.ts` and `links/handler.test.ts`. No new import edge, no new module, no cross-tool import. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Same change ships a co-located template-execution test. Happy cases: author aliases kept, rows 10–17 and 25–27. Boundary cases: derived labels dropped, empty or blank aliases, alias equal to target, rows 1–9 and 18–24. `index.test.ts` covers the description sentence. |
| **III. Boundary Input Validation with Zod** | **Y** | Input and output schemas unchanged; `displayText` was already `z.string().optional()`. The envelope is still parsed by `linksEvalResponseSchema`. |
| **IV. Explicit Upstream Error Propagation** | **Y** | No error path added, removed or remapped. No silent fallback: the field is omitted only where the published contract says it is absent. |
| **V. Attribution & Layered Composition** | **Y** | `_template.ts` keeps its `Original — no upstream.` header; its intent line is updated to name the alias-separator rule in place of "displayText omit-when-equal (F6/Q1)". The new test file carries an `Original — no upstream.` header. |
| **ADR-010** | **N/A** | No new or renamed tool. |
| **ADR-013 / ADR-014** | **N/A** | No plugin-backed tool touched. |
| **ADR-015** (sub-discriminators) | **N/A** | No error pair added or changed. |
| **MCP Tool Surface Standards** | **Y** | One description sentence reworded so it states the visible output rule; title, annotations, schemas and server instructions unchanged. The fingerprint baseline is regenerated deliberately; the reviewer checks that only `links.descriptionFingerprint` moved. |
| **Security Defaults** | **N/A** | Read-only tool; no write path, escape hatch or elicitation touched. The eval payload stays base64 (R6), and the template change reads only fields the template already reads. |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: **none of the kernel nodes are touched.** `createServer`, `createLogger`, `createQueue` and `UpstreamError` gain and lose no edges. `executeLinks` keeps its calls to `invokeCli`, `composeEvalCode`, `decodeEvalEnvelope` and `mapEnvelopeError` unchanged.

**ADR note**: no new ADR. This restores the spec 025 Q1 contract ("displayText absent when the source has no alias"), a spec-level clarify lock, not an ADR. It amends spec 025's implementation note F6 (omit-when-equal was assumed sufficient), recorded in research F1.

## Project Structure

### Documentation (this feature)

```text
specs/071-omit-derived-labels/
├── plan.md                    # This file
├── research.md                # T0 evidence (F1–F4) + decisions D1–D6
├── data-model.md              # DisplayLabelRule + 27 worked rows (test cases)
├── quickstart.md              # automated gate + manual scenarios per story
├── contracts/
│   ├── display-label.md       # published rule, description sentence, help-page row, baseline expectation
│   ├── t0-probe-plan.md       # G0 (done), G1–G3 implement-time
│   └── t0-cache-shapes.json   # G0 raw evidence
├── checklists/requirements.md
└── tasks.md                   # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/tools/links/
├── _template.ts               # wrap(): alias-separator rule for wiki-form entries (D1/D2); header intent line
├── _template.test.ts          # NEW — runs the rendered template in node:vm against T0 cache shapes (D4)
├── index.ts                   # LINKS_DESCRIPTION: one sentence replaced (D5)
└── index.test.ts              # asserts new sentence, no " > " caveat
src/tools/_register-baseline.json   # regenerated (npm run baseline:write); only links.descriptionFingerprint moves
docs/tools/links.md                 # displayText row rewritten; worked-rows table; caveat + workaround removed

# UNCHANGED: src/tools/links/{handler.ts, schema.ts, handler.test.ts, schema.test.ts},
#   src/tools/_shared.ts, src/errors.ts, src/server.ts, src/tools/_register.ts,
#   src/instructions/**, src/tools/backlinks/**, docs/tools/index.md
```

**Structure Decision**: Single project. All code changes are inside the existing `links` tool module, plus its docs page and the regenerated baseline.

## Phase 0: Research → research.md

- **T0 evidence** — 27 cache shapes probed live, findings F1–F4.
- **D1** — Detect the alias from `original` (`|` present), drop empty labels, keep omit-when-equal; Markdown entries unchanged.
- **D2** — One rule in the shared `wrap`, covering frontmatter links, body links and embeds.
- **D3** — No schema, error or kind change.
- **D4** — Test by executing the template in `node:vm`.
- **D5** — Surface text and baseline.
- **D6** — No shim for the old workaround.

**Output**: research.md, no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)** — input cache fields, the DisplayLabelRule table, 27 worked rows mapped to spec references.
- **[contracts/display-label.md](contracts/display-label.md)** — the published rule, the exact description sentence, the help-page row, the baseline expectation, the not-changed list.
- **[contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)** — G0–G3 with fallbacks.
- **[quickstart.md](quickstart.md)** — automated gate and manual scenarios per user story.
- **Agent context** — `CLAUDE.md` SPECKIT block now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated against the data model and contracts:

- No schema or error change (III, IV).
- The change stays inside one tool module, with no new edges (I).
- Every rule row is a test case in a co-located test that runs the real template (II).
- Headers are kept, with the template intent line updated (V).
- The description and the baseline move deliberately and are reviewed (MCP Tool Surface Standards).

**No gate regressed; Complexity Tracking empty.**

## Graphify structural check

Scoped lookups (`graphify explain`) on the symbols named in the spec and in the survey.

**Affected communities**: the `links` tool's own nodes only. Graph facts:

- `links/_template.ts::JS_TEMPLATE` has exactly two importers, `links/handler.ts` and `links/handler.test.ts`. The other nine tools' `JS_TEMPLATE` nodes are separate and untouched.
- `executeLinks` sits in the handler cluster around `UpstreamError`, with outgoing calls to `invokeCli`, `composeEvalCode`, `decodeEvalEnvelope` and `mapEnvelopeError`. None of those calls changes.
- `LINKS_DESCRIPTION` is imported by `links/index.test.ts` and by `src/tools/_file-type-support.test.ts`. The replacement sentence must keep the `describeSupport(LINKS_SUPPORTED)` sentence that the latter asserts.
- `backlinks` has its own template and reports no labels; it is out of scope and unaffected.

**Kernel-node touch surface**: none. No change to `createServer`, `createLogger`, `createQueue` or `UpstreamError`, and no edge added to or removed from any of them.

**Guardrail impact**: the registry fingerprint baseline moves for `links` description only. The tool count is unchanged.

**Post-implement structural verification** (`graphify update .`, then `/graphify --update`):

1. No new error-class node.
2. No handler imports the DI factories, and `server.ts` is unchanged.
3. The new `_template.test.ts` node attaches to `links/_template.ts::JS_TEMPLATE` (weak connectivity is expected for a test file).
4. No production node is added, so there is no orphan risk.
5. Only `links.descriptionFingerprint` moved in the baseline.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
