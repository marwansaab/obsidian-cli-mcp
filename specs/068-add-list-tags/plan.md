# Implementation Plan: Add List Tags (`tags`)

**Branch**: `068-add-list-tags` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [specs/068-add-list-tags/spec.md](./spec.md)

## Summary

Add `tags`, a typed MCP tool that returns the vault's tag index or a single note's tag set as `{ total, tags: [{ name, count? }] }`. It is the inventory counterpart of the existing `tag` tool, which answers "which notes carry tag X". It wraps the native `obsidian tags` subcommand in **one** `invokeCli` call (`format=json` + `counts`, plus a `file=` / `path=` / `active` scope). The wrapper strips exactly one leading `#`, parses upstream's string counts to integers, sorts on its own side, and optionally drops counts.

Load-bearing decisions, each settled in clarify or found by live plan-stage probes ([research.md](./research.md)):

- **Scope matrix (ADR-038, Clarifications Q1).**
  - The tool keeps `target_mode`: specific mode requires `vault`, active mode forbids it.
  - `file` / `path` / `activeOnly` are optional, at most one, and allowed in **both** modes.
  - Implemented as `targetModeBaseSchema.extend()` plus a tool-local `superRefine`. ADR-003 is unamended.
- **Routing (research R3).** The handler always calls `invokeCli` with `target_mode: "specific"` and `vault: input.vault`, which is `undefined` in active mode. The frozen `invokeCli` strips `file` / `path` in active mode, which would silently turn a scoped request into a vault-wide one.
- **Names (Clarifications Q2).** One leading `#` is stripped and nothing else is rewritten. Upstream always emits exactly one `#` (F4), so the result round-trips into `tag`.
- **Ordering (Clarifications Q3).** ASCII-only lower-fold primary key with a UTF-8 byte-order tie-break, implemented by a tool-local comparator. `sortByCount` sorts count descending, then by the same comparator. Upstream `sort=count` is never used, because its ties are not deterministic (F10).
- **Pass-through semantics (Clarifications Q4 + F7/F8/F9).**
  - Counts are raw occurrences.
  - The vault-wide scope merges case variants and lists implied ancestors with rolled-up counts. Per-note scopes do neither.
  - The wrapper reshapes nothing; the help document explains each behaviour.
  - Plan-stage spec notes record that F9 corrected the Q4 premise. The Q4 decision itself is unchanged.
- **Errors.** Zero new top-level codes and zero new sub-states.
  - Unknown vault: the existing `invokeCli` R5 clause raises `CLI_REPORTED_ERROR` (F11).
  - Missing note: dispatch priority (c) raises `CLI_REPORTED_ERROR`.
  - No focused note: `ERR_NO_ACTIVE_FILE`, re-messaged to point at `file` / `path` (R9).
  - Validation failures: `VALIDATION_ERROR`, before any CLI call.
  - `path` passes through the ADR-009 Layer-1 `isStructurallySafePath` predicate.

## Technical Context

**Language/Version**: TypeScript in strict mode (`tsc --noEmit` clean), on Node.js ≥ 22.11 (`engines.node`).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport) and `zod` 4 (`z.toJSONSchema` via the existing `toMcpInputSchema`). No new dependencies.
**Storage**: N/A. The tool is stateless and reads Obsidian's metadata cache through a single CLI call.
**Testing**: vitest + `@vitest/coverage-v8`, with co-located `*.test.ts` files. The stub `spawnFn` is injected through `deps.spawnFn`, and CI never runs the real binary. The aggregate statements floor is **96** (`vitest.config.ts`), and the new module must not lower it.
**Target Platform**: cross-platform Node MCP server (stdio) that shells out to the Obsidian CLI (`Obsidian.com` on Windows).
**Project Type**: MCP server. This feature adds one registered typed tool.
**Performance Goals**: one CLI round trip (about 50–200 ms), plus an O(n log n) in-process sort over n unique tags.
**Constraints**:
- 10 s timeout and 10 MiB output cap per call (typed-tool defaults).
- A single in-flight CLI queue.
- These surfaces stay frozen: the cli-adapter (`invokeCli`, `dispatchCli`), `target-mode.ts`, `errors.ts`, `_register.ts`, `_shared.ts`, the help tool, and every other tool.
**Scale/Scope**:
- About 225 LOC of source and about 740 LOC of tests in `src/tools/tags/`.
- One new doc, `docs/tools/tags.md`.
- One-line edits in `src/server.ts` (import plus registration), `docs/tools/index.md`, and `src/tools/_register-baseline.json` (via `npm run baseline:write`).
- A version bump and release note at polish.
- The practical ceiling is about 150k–250k unique tags under the cap (estimate; measured at T0, research R11).

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design: still PASS.*

| Gate | Result | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ Y | New per-surface module `src/tools/tags/{schema,handler,index}.ts`. Imports flow downward only: `index → handler → cli-adapter`, and `schema → target-mode`, `schema → path-safety/schema` (edges that existing schemas already have). There is no lateral import from another tool: the comparator is tool-local, rather than importing `files/handler.ts` `compareUtf8Bytes` (R7). |
| **II. Public Surface Test Coverage** | ✅ Y | Co-located `schema.test.ts`, `handler.test.ts` and `index.test.ts`, with happy-path and failure/boundary cases in each. Every AC 1–16 is mapped to a named test ([contracts/tags-handler.contract.md](./contracts/tags-handler.contract.md) H6). The registry drift detector and baseline cover registration. |
| **III. Boundary Input Validation with Zod** | ✅ Y | `tagsInputSchema` is the single source of truth for both the published `inputSchema` and the runtime parse. The output and upstream wire are also zod schemas, and every type comes from `z.infer`. The ADR-038 matrix is a `superRefine` at the boundary, and the handler does not re-validate input. |
| **IV. Explicit Upstream Error Propagation** | ✅ Y | Zero new codes. Every failure is an `UpstreamError` that carries `code` / `cause` / `details`. The parse stages surface `details.stage`. The `ERR_NO_ACTIVE_FILE` re-message keeps the code, details and `cause`. Unknown vault and missing note are never an empty list (FR-015 / FR-016). The R3 routing prevents a silent scope drop. No `catch` returns a default. |
| **V. Attribution & Layered Composition** | ✅ Y | Every new `.ts` file carries `// Original — no upstream. …`. The comparator idiom is original, and the `json-parse` stage idiom is project-internal (from the `outline` / `properties` handlers), so no README Attributions change is needed. |
| **ADR-010** (names mirror upstream subcommand) | ✅ Y | `tags` is the name of `obsidian tags`. |
| **ADR-013** (plugin-namespace naming) | N/A | Native-CLI wrapper, not plugin-backed. |
| **ADR-014** (plugin-backed runtime dependency) | N/A | Native-CLI wrapper. |
| **ADR-015** (sub-discriminators) | N/A | No new `(code, details.code)` pair; `details.stage` is the existing handler parse discriminator. |

**Other ADRs:**
- **ADR-003** keeps the `target_mode` field but deliberately does not use its refinement, recorded in **ADR-038** (new, Decided, feature-specific, no checklist row). This is not a conflict: ADR-038 is an owner-ratified, tool-local carve-out in the ADR-032 style.
- **ADR-005** (stripped descriptions) and **ADR-006** (centralised `registerTool`) are reaffirmed.
- **ADR-009** Layer 1 is applied to `path`.
- **ADR-029** (cold-start retry) is inherited.

No Complexity Tracking entries are required.

## Graphify structural check

The graph was missing at session start (`graphify-out/` absent). It was rebuilt AST-only with `graphify update .` on 2026-10-25. No semantic `--update` was run; that is batched post-implement.

- **Affected communities.**
  - The new `tags` handler joins the runtime-spine handler community next to `executeProperties` / `executeOutline`, which share the same call profile: `invokeCli` plus the `UpstreamError` value type (`graphify explain executeProperties`).
  - The schema adds one more consumer of `isStructurallySafePath`, a widely-shared node in its own community with seven tool schemas plus `_base-path.ts` already consuming it (`graphify explain isStructurallySafePath`). It also adds a consumer of `targetModeBaseSchema`.
- **Kernel-node touch surface.**
  - `createServer()`: **touched by exactly one additive registration line.** `graphify path createServer createTagTool` shows a 1-hop `calls` edge, and `createTagsTool` becomes a sibling edge of the same shape. This is the standard per-tool boot-spine edit; the function body is otherwise unchanged.
  - `createLogger()` / `createQueue()`: **not touched.** The handler receives `logger` / `queue` as injected `ExecuteDeps`, and nothing imports the factories.
  - `UpstreamError`: **not modified.** The handler constructs it as a value, in the existing star pattern, and adds no new code.
- **Frozen-surface claim for post-implement verification.**
  - No edits under `src/cli-adapter/`, `src/target-mode/`, `src/errors.ts`, `src/tools/_register*.ts` (other than the baseline JSON regenerated by script), or any other tool directory.
  - No new error-class nodes.
  - No production import of `createLogger` / `createQueue` outside `server.ts`.
  - `src/tools/tags/*` is connected to `invokeCli`, `UpstreamError`, `targetModeBaseSchema`, `isStructurallySafePath` and `registerTool`, so it is not orphaned.

## Project Structure

### Documentation (this feature)

```text
specs/068-add-list-tags/
├── plan.md                         # This file
├── research.md                     # F1–F13 live findings + R1–R12 decisions
├── data-model.md                   # Input/entry/output/upstream schemas, pipeline, comparator, LOC budget
├── quickstart.md                   # Gate commands, offline Q-1..Q-12, live L-1..L-10
├── contracts/
│   ├── tags-input.contract.md      # Public MCP contract, examples, error roster, client-class note
│   └── tags-handler.contract.md    # Handler invariants H1–H6, AC → test map
├── checklists/requirements.md      # Spec quality checklist (16/16)
└── tasks.md                        # Phase 2 (/speckit-tasks — not created here)

.decisions/ADR-038 - Tags Tool-Local Target-Mode Scope Matrix.md   # gitignored mirror; Decision Log row added
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── tags/                       # NEW
│   │   ├── schema.ts               # tagsInputSchema (base.extend + ADR-038 superRefine), tagEntrySchema, tagsOutputSchema, tagsUpstreamArraySchema, z.infer types
│   │   ├── schema.test.ts          # AC 9–12, FR-012 path safety, types, activeOnly:false compatibility
│   │   ├── handler.ts              # executeTags, compareTagNames, NO_TAGS_SENTINEL, ERR_NO_ACTIVE_FILE re-message
│   │   ├── handler.test.ts         # AC 1–8, 13, 16; FR-015/016/018; R3 no-strip; parse-stage failures
│   │   ├── index.ts                # TAGS_TOOL_NAME, TAGS_DESCRIPTION, createTagsTool via registerTool
│   │   └── index.test.ts           # registration, stripped schema, AC 11 server-side pathway (0 spawns), AC 14 doc completeness
│   └── _register-baseline.json     # rolled forward by `npm run baseline:write`
└── server.ts                       # +import, +createTagsTool({ logger, queue }) after createTagTool

docs/tools/
├── tags.md                         # NEW full help document (contract, output, error roster, scope-semantics table, ≥4 examples, staleness, ceiling, client-class)
└── index.md                        # +1 catalogue line after `tag`
```

**Structure Decision**: single-project MCP server with the established per-surface `src/tools/<name>/{schema,handler,index}.ts` layout and co-located tests (Constitution I / II). Docs ship in `docs/tools/` and are served by the existing `help` tool. The `.docs-as-code/` update (capability page `list-and-inventory.md`, README inventory) happens in the `/speckit-docs-as-code` pass after review, per the PR lifecycle in CLAUDE.md.

## Phase notes

- **T0 (first implement task).** Re-run the live probes in [quickstart.md](./quickstart.md) L-1..L-10. In particular:
  - L-9: specific-mode `activeOnly` against an unfocused vault. If it can't be reproduced, document it as "not verified live" (spec FR-003, Edge Cases / Targeting).
  - L-10: the size ceiling, derived from the measured bytes per tag on a fixture of ≥1,000 tags (SC-006).

  If any F-series finding has drifted, stop and amend research and spec before writing the handler.
- **Environment.** The registered test-vault path differs from `.memory/test-execution-instructions.md` (research Environment note). The `.memory/` file is left for the owner to update.
- **Surfaced for the owner (not blocking).** `tag`'s documentation says it uses an "ASCII lower-fold", but its `_template.ts` uses `toLowerCase()`, which folds non-ASCII characters too (research R7). This does not affect `tags`.

## Complexity Tracking

No Constitution violations. No entries.
