# Implementation Plan: List Tags

**Branch**: `068-list-tags` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/068-list-tags/spec.md`

## Summary

Add `tags`, a new typed tool that returns an Obsidian vault's tag index, or one note's tag set, as `{ total, tags: [{ name, count? }] }`. It is a single-spawn `invokeCli` wrapper around the CLI's native `tags` subcommand. Every call sends `format=json counts`, plus `file=` / `path=` / `active` when a scope is requested. Four reshapes happen wrapper-side: strip exactly one leading `#` from each name (Q1), sort with the `properties` comparator (case-insensitive, then byte order; count-descending under `sortByCount`) (Q3), drop `count` when `includeCounts: false`, and validate the result against a strict output schema.

Addressing follows ADR-032's sibling-locator pattern, as required by ARCH-014 and the plan-stage ruling: optional `vault` (focused vault when omitted) plus `file` / `path` / `activeOnly`. At most one scope may be set, and `activeOnly` forbids `vault`. There is no `target_mode`. Scope conflicts map to `VALIDATION_ERROR` + `details.code: "SCOPE_CONFLICT"` + `details.reason`, reusing ADR-032's reasons. Every failure uses an existing code.

Index semantics (fenced-code exclusion, frontmatter + inline, hierarchy, case variants, non-ASCII, per-note count meaning) are inherited unchanged. Implement-time T0 probes characterise them, and the results become the documented contract. The probes run at implement time because the live-CLI gate file was absent at plan time.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `zod` ^4 (input/output/upstream schemas; `z.toJSONSchema` publication via `registerTool`), `@modelcontextprotocol/sdk` ^1.29 (registration through `registerTool`). Reused in-tree: `src/cli-adapter/cli-adapter.ts` (`invokeCli`), `src/path-safety/schema.ts` (`isStructurallySafePath`), `src/tools/_register.ts` (`registerTool` + `mapValidationError` hook), `src/errors.ts` (`UpstreamError`). **No new runtime dependency.**
**Storage**: None. One read-only CLI spawn per call; no filesystem access by the wrapper, no cache.
**Testing**: `vitest` (`vitest run --coverage`), co-located `src/tools/tags/{schema,handler,index}.test.ts` with a mocked spawn (`makeRegistrationStubSpawn` / `_handler-test-fixtures.ts`). Live-CLI T0 probes are gated by `.memory/test-execution-instructions.md` ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)).
**Target Platform**: Windows (reference), macOS, Linux — anywhere the server runs today.
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: One CLI spawn per call (no pre-resolution round-trip on the happy path), well inside the 10 s typed-tool timeout. Wrapper work is O(n log n) in the number of tags.
**Constraints**: Zero new top-level error codes, and no new `(code, details.code)` sub-states (ADR-015). Output bounded by the existing 10 MiB cap (`CLI_OUTPUT_TOO_LARGE`, no truncation). The schema must not import `src/target-mode/target-mode.ts` (plan-stage ruling). `invokeCli`, `dispatchCli`, ADR-003 unchanged.
**Scale/Scope**: One new module, `src/tools/tags/` (3 source + 3 test files). One registration line in `src/server.ts`. New `docs/tools/tags.md` + one `docs/tools/index.md` entry. One README tools-table row. Regenerated `_register-baseline.json` (one added entry). CLAUDE.md plan-pointer rotation.

**Resolved unknowns**: none outstanding. Addressing → research D2/D3. Wire-call shape → D4. Empty result → D5. Failure mapping → D6. Inherited semantics → D7. Each empirical item has a decided fallback in research § "T0 fallback table".

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below). Constitution v1.5.1 (ratified 2026-05-03, last amended 2026-07-05).*

| Gate | Verdict | Evidence |
|---|---|---|
| **I. Modular Code Organization** | Y | New self-contained `src/tools/tags/{schema,handler,index}.ts`. Imports flow tool → `cli-adapter` / `path-safety` / `errors` (downward only). No sibling-tool import; no new shared module (the scope matrix stays local — research D3). |
| **II. Public Surface Test Coverage** | Y | New MCP tool ships with co-located happy-path + failure/boundary tests in the same change. Every AC is mapped to a test (research D9). |
| **III. Boundary Input Validation with Zod** | Y | `tagsInputSchema` (strict object + `superRefine`) is the single source for the published `inputSchema` and the runtime parse. `TagsInput`/`TagsOutput` are `z.infer`. The upstream wire is parsed through `tagsUpstreamArraySchema`. No `typeof` chains at the boundary. Every `VALIDATION_ERROR`, including the sub-coded `SCOPE_CONFLICT` and `INVALID_NOTE` ones, carries zod's field paths in `details.issues` (analyze remediation R1). |
| **IV. Explicit Upstream Error Propagation** | Y | Every failure surfaces as `UpstreamError` / tool error with an existing code (contracts/errors.md). The single handler `catch` re-throws `ERR_NO_ACTIVE_FILE` with the same code and `cause`; no empty-result fallback. The unknown-vault exit-0 case is classified explicitly. |
| **V. Attribution & Layered Composition** | Y | Every new file carries `// Original — no upstream. …`. No lifted code. |
| **ADR-010** (names mirror upstream subcommand) | Y | Tool name `tags` = native `obsidian tags` subcommand (reserved by BI-028 R15). |
| **ADR-013** (plugin-namespace naming) | N/A | Native-CLI wrapper, not plugin-backed. |
| **ADR-014** (plugin-backed runtime dependency) | N/A | Native-CLI wrapper, not plugin-backed. |
| **ADR-015** (sub-discriminators via `details.reason`) | Y | Uses existing pairs `VALIDATION_ERROR`/`SCOPE_CONFLICT` and `VALIDATION_ERROR`/`INVALID_NOTE`, with reasons reused verbatim from ADR-032 (`file+path`, `active+note`, `active+vault`, `path-traversal`). No new pairs or sub-states. |

Further decisions checked: **ADR-032 / ARCH-014**: followed (sibling locators, no `target_mode`) per the plan-stage ruling. **ADR-003**: untouched (not imported, not amended). **ADR-006** (`registerTool` as the only registration path): followed. **ADR-029 / ADR-030**: inherited via `invokeCli` → `dispatchCli`; no new spawn site.

**Gate result: PASS** — no `N`, no Complexity Tracking entry required.

## Project Structure

### Documentation (this feature)

```text
specs/068-list-tags/
├── spec.md              # amended at plan stage (sibling-locator ruling)
├── plan.md              # this file
├── research.md          # Phase 0: D1–D9 + T0 fallback table
├── data-model.md        # Phase 1: input / upstream / entry / output shapes, ordering
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── input.md         # field contract, scope matrix, argv mapping
│   ├── output.md        # output shape + guarantees
│   ├── errors.md        # error roster (existing codes only)
│   └── t0-probe-plan.md # implement-time live probes P1–P10 + evidence log
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
src/tools/tags/
├── schema.ts            # NEW — tagsInputSchema (strict + superRefine scope matrix / path safety),
│                        #       tagsUpstreamArraySchema (.loose()), tagEntrySchema, tagsOutputSchema (+ invariants)
├── schema.test.ts       # NEW
├── handler.ts           # NEW — executeTags: argv build → invokeCli → empty/sentinel → JSON parse →
│                        #       strip '#' → compareTagNames sort → project → output parse; ERR_NO_ACTIVE_FILE re-message
├── handler.test.ts      # NEW
├── index.ts             # NEW — TAGS_TOOL_NAME, TAGS_DESCRIPTION, mapValidationError, createTagsTool
└── index.test.ts        # NEW

src/server.ts                       # EDIT — import + createTagsTool({ logger, queue }) in the registration list
src/tools/_register-baseline.json   # REGENERATE — `npm run baseline:write`; +1 `tags` entry only
docs/tools/tags.md                  # NEW — full help page (≥ 4 worked examples, error roster, inherited limitations)
docs/tools/index.md                 # EDIT — one `tags` line, contrasted with `tag`
README.md                           # EDIT — one row in the tools table
CLAUDE.md                           # EDIT — active-plan pointer → specs/068-list-tags/plan.md

# UNCHANGED (explicitly not edited): src/target-mode/** (deliberately NOT imported — plan-stage ruling / ADR-032),
#   src/cli-adapter/** (invokeCli / dispatchCli consumed as-is), src/tools/_active-file.ts (not imported unless the
#   P6 fallback fires), src/tools/_register.ts, src/path-safety/** (consumed as-is), src/errors.ts, src/queue.ts,
#   src/logger.ts, src/tools/tag/** and every other sibling tool module.
```

**Structure Decision**: Single-project layout. One new per-surface module under `src/tools/tags/` with the cohort's `{schema, handler, index}.ts` triple and co-located tests (Principles I and II), registered through `registerTool` from `server.ts`.

## Phase 0: Research → [research.md](research.md)

Decisions D1–D9: native `tags` subcommand (D1); sibling locators with the `invokeCli` facade called as `target_mode: "specific"` + optional `vault` (D2); scope matrix with `SCOPE_CONFLICT` reasons (D3); one upstream call shape with wrapper-owned ordering and projection (D4); empty result (D5); failure classification (D6); inherited semantics → T0 → contract (D7); surface, docs, baseline (D8); AC → test map (D9). There is also a pre-decided fallback for every T0 outcome.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md): `TagsInput`, `TagsUpstreamEntry`, `TagEntry`, `TagsOutput`, ordering, statelessness.
- [contracts/input.md](contracts/input.md), [contracts/output.md](contracts/output.md), [contracts/errors.md](contracts/errors.md): the public contract that `docs/tools/tags.md` will mirror.
- [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md): implement-time probes P1–P10, fixture notes, evidence log.
- [quickstart.md](quickstart.md): gates, unit runs, 14 live scenarios. Scenario 14 validates SC-005 (analyze remediation R7).
- Agent context: CLAUDE.md's active-plan pointer is rotated to this plan (the project's convention; there is no agent-context script in `.specify/scripts/powershell/`).

## Phase 1 re-check (post-design Constitution Check)

Unchanged: **PASS**. The design added no shared module, no new code or sub-state, no new dependency, and no import of `target-mode.ts`. Each of the five fallbacks (TSV parse, sentinel drop, `file` pre-check, explicit no-active / unknown-vault signature checks) stays within existing codes and existing helpers. The `file` pre-check fallback would reuse `_active-file.ts`'s `resolveFileByTsv`, an existing downward edge already used by several handlers, and would need `vaultRegistry` DI only if it fires. If it fires, this plan is amended before the code lands.

## Graphify structural check

**Graph availability**: `graphify-out/` and `.codegraph/` are both absent from this checkout, so the CLAUDE.md `/graphify explain|query|path` lookups could not run. The structural claims below come from direct source lookup of the named symbols instead: `src/server.ts`, `src/cli-adapter/cli-adapter.ts`, `src/tools/_register.ts`, `src/target-mode/target-mode.ts`, `src/tools/{properties,outline,find_and_replace}/*`. The post-implement step should re-run them as graph queries once a graph is available.

**Affected communities**: a new `tags` tool community (`schema` / `handler` / `index`). It joins the runtime spine through `handler.ts → invokeCli → dispatchCli`, the error spine through `handler.ts → UpstreamError`, and the boot spine through `server.ts → createTagsTool → registerTool`. That is the same three-spine attachment as `properties` and `outline`.

**Kernel-node touch surface**:
- `createServer()` (boot-spine entry, in `src/server.ts`): **touched**. One import and one registration-list line are added inside its tool array. This is the standard per-tool registration edit every new tool makes, with no new DI argument. It is still a kernel-node touch, so reviewers should confirm that only that one line changed.
- `createLogger()` / `createQueue()`: **not touched**. `logger` and `queue` arrive via `ExecuteDeps`; the handler never imports the factories.
- `UpstreamError`: **consumed, not changed**. The handler constructs it (the `ERR_NO_ACTIVE_FILE` re-message and the parse failures) with existing codes only; `src/errors.ts` is not edited.

**Deliberate non-edge**: `src/tools/tags/schema.ts` MUST NOT import `src/target-mode/target-mode.ts` (plan-stage ruling, ADR-032 parity). Post-implement verifies this non-edge.

**Guardrail impact**: the FR-018 registry-stability baseline gains exactly one entry (`tags`); no other tool's fingerprints move. `assertToolDocsExist` requires `docs/tools/tags.md` at boot. ADR-030's two-spawn-site invariant holds (no new spawn site).

**Post-implement structural verification** (after `/speckit-implement`; run `/graphify --update` first if the graph exists by then):
1. No new error-class node outside `src/errors.ts`, and no new top-level code.
2. `tags/handler.ts` imports neither `createLogger` / `createQueue` / `createServer` nor a sibling tool module. `tags/schema.ts` does not import `target-mode.ts`.
3. `tags` symbols land in their own community, attached to the runtime / error / boot spines like `properties`.
4. The new production files are connected (handler ↔ invokeCli, index ↔ registerTool ↔ server); the test files are weakly connected by design.
5. Only the `tags` baseline entry changed.

## Post-analyze remediation (2026-10-24)

The owner approved fixes R1–R7 for the `/speckit-analyze` findings; they are logged in spec Clarifications ("analyze remediation"). The plan-level effects are: field paths on every validation error (R1, Constitution Check Principle III row above); implement-time T0 timing wording carried into the spec (R2); FR-017 now names `CLI_REPORTED_ERROR` (R3); FR-007 now names the full path-safety predicate (R5); and quickstart scenario 14 covers SC-005 (R7). No design decision changed, and the Constitution Check remains PASS. H2 (the missing `.memory/test-execution-instructions.md`) is an owner action, not an artefact edit; Phase 1 of tasks.md still blocks on it.

## Complexity Tracking

No Constitution Check violations — section intentionally empty.
