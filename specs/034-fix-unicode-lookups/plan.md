# Implementation Plan: Fix Unicode Lookups

**Branch**: `034-fix-unicode-lookups` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/034-fix-unicode-lookups/spec.md`

## Summary

Repair the silent-non-ASCII-lookup defect that affects every eval-composition tool whose JS template decodes its user-payload via `JSON.parse(atob('__PAYLOAD_B64__'))`. `atob()` in V8 returns a Latin-1 binary string — UTF-8 multi-byte sequences survive base64 transit but are interpreted byte-per-code-point post-`atob`, producing mojibake before any comparator runs. The user-supplied identifier therefore never matches the vault's authored content for any input containing a character outside U+0000..U+007F.

**Technical approach** (resolved at [research.md §1, §3, §4](research.md)): replace `JSON.parse(atob(b64))` with `JSON.parse(new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))))` everywhere the pattern appears — a centralised text fragment in `src/tools/_shared.ts` embedded by each of the seven affected `_template.ts` files, plus a Node-side `composeEvalCode(template, payload)` helper in the same module that centralises the base64-encode + placeholder-substitute boilerplate currently duplicated across seven handlers.

**Scope expansion vs spec** (resolved at [research.md §3](research.md)): the spec named three tools (`read_heading`, `read_property`, `find_by_property`); the static audit found **seven** tools share the atob+base64 defect (`read_heading`, `find_by_property`, `paths`, `links`, `tag`, `smart_connections_similar`, `smart_connections_query`) and that `read_property` does NOT share it (it uses an argv-based path with native JS string equality on UTF-8-correct strings — not affected by the atob bug). The plan broadens the fix to the full seven-tool cohort per ADR-004's centralised-adapter spirit and keeps `read_property` in scope only as a verification test (predicted-passing) per research.md §2.3.

## Technical Context

**Language/Version**: TypeScript, strict mode (`tsc --noEmit` clean); compiled per [tsconfig.json](../../tsconfig.json) for `"module": "NodeNext"`, `"target": "ES2024"`.
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation), `vitest` + `@vitest/coverage-v8` (test framework). No new dependency added by this BI.
**Storage**: N/A — the fix is in source code only; no persistent state.
**Testing**: `vitest run` (CI gate). Co-located `*.test.ts` per Principle II. Live-CLI T0 probes follow [quickstart.md](quickstart.md) against `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).
**Target Platform**: Node.js >= 22.11 (host runtime for the MCP server) + Obsidian Integrated CLI eval context (V8-based, Electron renderer) — the latter is where the decoder fix lands.
**Project Type**: MCP server (single-project TypeScript layout under `src/`).
**Performance Goals**: byte-for-byte response shape parity pre/post-fix; no measurable per-call latency change (the decoder is one extra `TextDecoder` + `Uint8Array.from` call per eval invocation, both O(payload-length) and negligible against the spawn cost).
**Constraints**: zero new top-level error codes per Constitution Principle IV (preserves the streak); zero new sub-states per ADR-015; byte-stable `_register-baseline.json` per FR-018; output cap behaviour unchanged.
**Scale/Scope**: 7 templates touched + 1 shared module updated + 7 (or 8, counting `read_property`'s verification test) co-located test files extended. ~50 LOC source delta, ~150 LOC test delta.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / ADR | Status | Evidence |
|---|---|---|
| **I — Modular Code Organization** | Y | The fix lands at the existing per-surface `_template.ts` files and the existing shared `src/tools/_shared.ts`. The cohort layout becomes more uniform, not less, after extracting `find_by_property`'s inlined template to `_template.ts` (research.md §4.4). No upward or cyclic imports introduced. |
| **II — Public Surface Test Coverage** | Y | Each of the 7 modified tools ships at least one non-ASCII boundary test in the same change set, co-located as `*.test.ts`. `read_property` ships a verification test per research.md §2.3. ASCII happy-path tests remain. |
| **III — Boundary Input Validation with Zod** | Y (no change) | The defect is BELOW the schema layer (in the V8-eval-side payload decode); no schema changes. Confirmed by code-walk at [research.md §1.1](research.md). |
| **IV — Explicit Upstream Error Propagation** | Y | Zero new top-level error codes. The fix removes a silent-empty-result failure mode without introducing a new one. The seventeen-tool zero-new-codes streak (now extending past BI-033 search) is preserved. |
| **V — Attribution & Layered Composition** | Y | Existing files carry their `Original — no upstream` headers and are unaffected. If the shared decoder helper introduces a new file, it carries the same header. (Likely an addition to existing `src/tools/_shared.ts` rather than a new file — see Structure Decision.) |
| **ADR-010** (Typed Tool Names Mirror Upstream) | N/A | No tool renamed. |
| **ADR-013** (Plugin-Namespace Tool Naming) | N/A | No plugin-namespace tool added or renamed. The two affected plugin-namespace tools (`smart_connections_*`) get the decoder fix only. |
| **ADR-014** (Plugin-Backed Runtime-Dependency Pattern) | N/A | The three lifecycle-state error codes (`SMART_CONNECTIONS_NOT_INSTALLED` / `_NOT_READY` / `SOURCE_NOT_INDEXED`) live BELOW the decode line in the smart_connections_* templates and are byte-identical pre/post-fix. Verified at task execution by diffing the decode-line locus only. |
| **ADR-015** (`details.reason` Sub-Discriminators) | N/A | No new `(top-level-code, details.code)` pair; no new sub-state. |

All rows pass without any `N`. No Complexity Tracking entry required for the principle/ADR rows; one scope-narrowing entry recorded below for the deliberately-skipped Smart Connections live probe.

## Project Structure

### Documentation (this feature)

```text
specs/034-fix-unicode-lookups/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — cohort audit, fix locus, alternatives
├── data-model.md        # Phase 1 output — defect repair; no new entities
├── quickstart.md        # Phase 1 output — manual T0 live-CLI probe script
├── contracts/
│   └── README.md        # Phase 1 output — explicit "no contracts changed" note
├── checklists/
│   └── requirements.md  # spec-quality validation (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── _shared.ts                                # EXTENDED — add B64_PAYLOAD_DECODE_EXPR text constant + composeEvalCode() helper
│   ├── _shared.test.ts                           # EXTENDED — happy + non-ASCII tests for composeEvalCode and the decoder expression
│   ├── read_heading/_template.ts                 # MODIFIED — decode line uses shared expression
│   ├── read_heading/handler.ts                   # MODIFIED — uses composeEvalCode()
│   ├── read_heading/handler.test.ts              # EXTENDED — non-ASCII heading-path test
│   ├── find_by_property/_template.ts             # NEW — extracted from inlined JS_TEMPLATE in handler.ts
│   ├── find_by_property/handler.ts               # MODIFIED — imports _template.ts, uses composeEvalCode()
│   ├── find_by_property/handler.test.ts          # EXTENDED — non-ASCII value test
│   ├── paths/_template.ts                        # MODIFIED — decode line
│   ├── paths/handler.ts                          # MODIFIED — uses composeEvalCode()
│   ├── paths/handler.test.ts                     # EXTENDED — non-ASCII folder test
│   ├── links/_template.ts                        # MODIFIED — decode line
│   ├── links/handler.ts                          # MODIFIED — uses composeEvalCode()
│   ├── links/handler.test.ts                     # EXTENDED — non-ASCII wikilink target test
│   ├── tag/_template.ts                          # MODIFIED — decode line
│   ├── tag/handler.ts                            # MODIFIED — uses composeEvalCode()
│   ├── tag/handler.test.ts                       # EXTENDED — non-ASCII tag query test
│   ├── smart_connections_similar/_template.ts    # MODIFIED — decode line ONLY (lifecycle branches byte-stable)
│   ├── smart_connections_similar/handler.ts      # MODIFIED — uses composeEvalCode()
│   ├── smart_connections_similar/handler.test.ts # EXTENDED — non-ASCII input test (mocked invokeCli)
│   ├── smart_connections_query/_template.ts      # MODIFIED — decode line ONLY (lifecycle branches byte-stable)
│   ├── smart_connections_query/handler.ts        # MODIFIED — uses composeEvalCode()
│   ├── smart_connections_query/handler.test.ts   # EXTENDED — non-ASCII query test (mocked invokeCli)
│   ├── read_property/handler.test.ts             # EXTENDED — non-ASCII property-NAME verification test (predicted-passing per research.md §2.3)
│   └── _register-baseline.json                   # MUST stay byte-identical (FR-007 + SC-005 enforcement; verified by _register-baseline.test.ts)
```

**Structure Decision**: The fix lives in `src/tools/_shared.ts`, not `src/cli-adapter/`. Rationale: the decoder expression is a per-template concern (it is embedded inside the eval body), and the compose helper is a per-handler concern (it bridges JS payload → base64 → template substitution). Both are tool-layer concerns, not CLI-adapter concerns. `cli-adapter/` retains its current concern of dispatching `obsidian` invocations — it has no business knowing about per-tool eval-template internals. This placement keeps imports flowing strictly toolward (`tools → tools/_shared`), preserving Principle I's one-directional import rule.

`find_by_property`'s inlined template extracts to a new `find_by_property/_template.ts` so the cohort layout becomes uniform (matches `read_heading/_template.ts`, `paths/_template.ts`, etc.). The Principle-I housekeeping is small enough to land alongside the decoder fix rather than spawn a separate spec.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Live-CLI T0 probe SKIPPED for `smart_connections_similar` and `smart_connections_query` | The authorised test vault (per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md)) is intentionally plugin-free. Running a live Smart Connections probe requires installing the plugin, which violates the vault's bare-vault invariant and risks polluting other tests' state. | Installing the plugin and reverting after the probe — rejected because the install/uninstall cycle is not a guaranteed-clean operation in Obsidian, the plugin writes vault-side state (a `.smart-env/` directory), and the test instructions explicitly authorise the bare-vault invariant. The decoder fix is verified at the unit-test layer (mocked `invokeCli`) for both tools; the live probe adds no information beyond what the unit tests already cover for this specific defect class. |

(This is not a Constitution Principle violation — it is a deliberate scope-narrowing of the live-CLI probe per quickstart.md Probe 7. Recorded here for traceability per the project's "deferred scope is documented" convention.)

## Phase 0: Outline & Research — completed

See [research.md](research.md). Key resolutions:

- **§1 Cohort audit**: 7 atob+base64 tools affected (vs spec's 3-named). 1 spec-named tool (`read_property`) is NOT atob-affected.
- **§2 Spec contradiction**: `read_property` predicted-unaffected per static analysis; verified by added test (not a fix).
- **§3 Scope decision**: broaden to the 7-tool cohort per ADR-004 spirit (5 rationales recorded).
- **§4 Fix shape**: shared decoder text constant in `_shared.ts` + `composeEvalCode()` Node-side helper. Inlined `find_by_property` template extracts to `_template.ts`.
- **§5 ADR alignment**: only ADR-004 in play (positively). ADR-009 / ADR-010 / ADR-013 / ADR-014 / ADR-015 not in play.
- **§6 Defence-in-depth**: lifecycle-state branches in `smart_connections_*` templates byte-stable; Setext-defence filter in `read_heading` byte-stable; the fix is one expression in seven sites.
- **§7 Fixture inventory**: BI-038 fixtures cover 2 of 6 live probes; T0-prep task adds 4 new fixtures under `Sandbox/unicode/`; Smart Connections probes skipped per Complexity Tracking above.
- **§8 Graph queries deferred**: Grep audit produced the same answer the graph queries would; no new information.
- **§9 Open items**: 0 blocking. All NEEDS CLARIFICATION resolved.

## Phase 1: Design & Contracts — completed

- **[data-model.md](data-model.md)**: defect repair — no new persistent entity, no schema change, no contract artefact. The entities in the cone of influence are the payload object (mojibake → correct), the three spec-named identifier kinds (heading path, property name, property value), and the new internal source-code constants (shared decoder snippet + compose helper).
- **[contracts/README.md](contracts/README.md)**: no new or changed contracts; `_register-baseline.json` MUST stay byte-identical; the registration-baseline test enforces this gate.
- **[quickstart.md](quickstart.md)**: 7 probes (Probe 7 deliberately SKIPPED per Complexity Tracking). Pre-stage fixtures under `Sandbox/unicode/`. Cleanup expected after the run.
- **Agent-context update**: CLAUDE.md `<!-- SPECKIT START -->...<!-- SPECKIT END -->` block rotated to point at this plan (separate edit, applied at the end of `/speckit-plan`).

## Re-evaluation of Constitution Check (post-design)

All rows still pass without `N`. The seven `_template.ts` edits + seven `handler.ts` edits + extending `_shared.ts` are tightly scoped Principle-I-uniform changes; each modified tool ships its required Principle-II tests; no zod schema or error code is added (Principles III, IV); the shared helper file carries the existing `Original — no upstream` header on `_shared.ts` (Principle V). ADR-010 / ADR-013 / ADR-014 / ADR-015 remain N/A as documented above.

## Exit

Phase 0 + Phase 1 deliverables complete. Ready for `/speckit-tasks` to produce the dependency-ordered task list.
