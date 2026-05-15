# Implementation Plan: Move Note — Typed Single-File Move (Optionally with Rename)

**Branch**: `030-move-note` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [/specs/030-move-note/spec.md](./spec.md)

## Summary

Add `move`, the **sixteenth** typed-tool wrap on top of the foundation completed by features 003–029. Where the prior fifteen typed surfaces (`read`, `write_note`, `delete`, `read_property`, `find_by_property`, `read_heading`, `set_property`, `files`, `rename`, `outline`, `properties`, `links`, `smart_connections_similar`, `smart_connections_query`, `tag`, `tree`) wrap their respective CLI subcommands for reading, creating/overwriting, deleting, frontmatter-property access, heading-body reads, folder listing, in-place rename, outline/properties/link enumeration, plugin similarity/query, tag-index retrieval, and recursive subtree enumeration, `move` wraps the Obsidian CLI's `move` subcommand for **single-file move (optionally with rename) of vault files**. The user-facing surface: `move({ target_mode, vault?, file?, path?, to })` returning `{ moved: true, fromPath, toPath }`. Today the only path is `obsidian_exec move …` returning raw text the agent must parse; the typed surface returns the structured shape directly with per-mode validation, the strict trailing-`/` discriminator + source-`.md`-guarded `.md` append rule on the `to` field, the vault-config-dependent link-rewriting caveat documented prominently, and structured upstream-error propagation. The closest sibling on the typed-tool track is `rename` (021): `rename` handles filename-on-disk in the source's folder; `move` handles path-on-disk and delegates link-rewriting to Obsidian's "Automatically update internal links" vault setting.

**Technical approach** (locked at Phase 0 / [research.md](./research.md)):

- **CLI subcommand**: `move` (native, NOT eval, NOT obsidian_exec). **Verified live during plan (F1)** — `obsidian help` lists `move` as a first-class command with parameters `file=<name>`, `path=<path>`, `to=<path>` (`to` required), description "Move or rename a file" confirming the spec's framing that one CLI subcommand handles both relocation and rename. The wrapper's user-facing field names (`file`, `path`, `to`) map to the CLI argv keys verbatim — no PSR-5-style locator argv-key rename (cf. 011-write-note's `file=` → `name=` mapping).
- **Per-mode call architecture (R3)**: ONE `invokeCli` call per request, regardless of `target_mode` or input locator shape. No two-call branches.
  - **Specific + path**: `vault=<v> move path=<p> to=<resolveTo(to, p)>`.
  - **Specific + file**: `vault=<v> move file=<f> to=<to-verbatim>` (the wrapper cannot apply the source-`.md` guard because `fromPath` is CLI-resolved; T0 case xiii captures the CLI's native handling).
  - **Active**: `move to=<to-verbatim>` (no `vault=`, no `file=`, no `path=`; CLI's "most commands default to the active file" rule covers the locator-less case).
- **Schema**: post-010 flat-extension idiom. `applyTargetModeRefinement(targetModeBaseSchema.extend({ to: z.string().min(1) }))`. The `to` field's `.min(1)` enforces the [P1] AC #7 empty-`to` rejection. No regex or shape constraint at the schema layer — the strict trailing-`/` discriminator (Q2 lock) is a handler-layer branch in the `resolveTo` helper, not a validation rule. The target-mode primitive's existing rules (vault required in specific, exactly-one-of file/path in specific, vault/file/path forbidden in active, additionalProperties: false) apply unchanged.
- **Output schema**: `z.object({ moved: z.literal(true), fromPath: z.string(), toPath: z.string() }).strict()`. Three fields, strict mode. The `moved` field is `z.literal(true)` because every successful return path produces it (parity with `delete`'s `deleted: literal(true)` and `rename`'s `renamed: literal(true)`); failures surface through `UpstreamError`.
- **`to`-shape transform (per /speckit-clarify Q1 + Q2 — locked 2026-05-15)**: file-local helper `resolveTo(to, fromPath)` of ~12 LOC implements the two-branch logic: `to.endsWith("/")` → folder-target (`to + basename(fromPath)`); otherwise → full-path-target with source-`.md`-guarded `.md` append (`if (fromPath.endsWith(".md") && !filenamePortion.endsWith(".md")) to + ".md" else verbatim`). Both `endsWith` predicates are literal byte-equality, case-sensitive — mirrors the 020-fix-write-gaps R2 lock and the 021-rename Q1 lock for `name`. The source-`.md` guard is the /speckit-clarify Q1 departure from rename's unconditional append: non-`.md` sources bypass the rule entirely, preventing silent cross-type conversion (`Plan.canvas + to: "Archive/Renamed"` forwards `Archive/Renamed` verbatim, NOT `Archive/Renamed.md`).
- **Wrapper-side applicability of the source-`.md` guard**: full applicability only in specific + `path=` mode (where `fromPath` is the validated input `parsed.path`). In specific + `file=` and active modes the source is CLI-resolved (wikilink → on-disk path, or active-file lookup); the wrapper cannot apply the guard without violating the R3 single-spawn invariant, so it forwards `to=` verbatim. T0 case xiii captures the CLI's native `to=` behaviour in those modes.
- **Strict trailing-`/` discriminator (per /speckit-clarify Q2 — locked 2026-05-15)**: `to: "Archive/"` → folder-target; `to: "Archive"` → full-path-target (with the post-Q1 source-extension-dependent outcome). No heuristic disambiguation; no validation-layer reject for ambiguous shapes; no source-location probe. Documented prominently in `docs/tools/move.md` per FR-014 (enhanced post-Q2).
- **Response-parsing (R14)**: the CLI's verbatim success/failure wording is captured during T0 of `/speckit-implement` per FR-019 (NOT live during plan to keep this BI scope-honest; only the load-bearing argv shape + cheap-and-safe error wordings are verified at plan stage — F1–F5b). The handler's `parseMoveResponse(stdout)` helper is locked against the T0 wording. Anticipated shapes per existing 011/012/021 precedent: `Moved: <fromPath> → <toPath>` (single-line) or two-line; the actual wording binds at T0.
- **Registration**: via the existing `registerTool` factory at [src/tools/_register.ts](../../src/tools/_register.ts) — auto-applies `stripSchemaDescriptions`, wraps `ZodError → VALIDATION_ERROR`, propagates `UpstreamError → asToolError`, and JSON-serialises typed output objects into the MCP `content[0].text` envelope (matching prior tools' pattern exactly).
- **Module layout**: `src/tools/move/{schema,handler,index}.ts` with co-located `*.test.ts` per the post-011 convention. All six new source files carry the `// Original — no upstream.` attribution header per Constitution V.
- **Active-mode no-focused-note classifier behaviour (R9)**: surfaces as `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`) because the native CLI's `move` subcommand emits capital-N `Error: No active file.` while the bridge's dispatch-layer classifier targets lowercase only. Empirically confirmed across `delete` (TC-049) and `rename` (TC-171); T0 case (ix) verifies the same wording for `move`. Bridge-classifier change is out of scope for this BI (cross-cutting concern tracked under [[BI-0027 - Audit Tool Descriptions]] dimension C.2).
- **Post-022 baseline roll-forward (R13 / FR-013a)**: `npm run baseline:write` rolls forward `src/tools/_register-baseline.json` to add the `move` entry in the same commit that registers the tool. Without this, the durable registry-stability test at `src/tools/_register.test.ts` fails.

## Technical Context

**Language/Version**: TypeScript (strict mode, `tsc --noEmit` clean) — pinned in [tsconfig.json](../../tsconfig.json), runtime Node.js >= 22.11 per `engines.node` in [package.json](../../package.json).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (validation, single source of truth per Constitution III), `zod-to-json-schema` (consumed via the existing `toMcpInputSchema` helper at [src/tools/_shared.ts](../../src/tools/_shared.ts)). No new runtime dependencies.
**Storage**: N/A — the tool is stateless. The CLI moves files via Obsidian's running instance; `move` is the wrapper.
**Testing**: vitest with `@vitest/coverage-v8`. Co-located `*.test.ts` per module. The aggregate statements coverage threshold floor is **91.3%** ([vitest.config.ts:20](../../vitest.config.ts#L20)). Tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention; no real `obsidian` binary executions in CI. Every handler test asserts exactly ONE spawn per the R11 single-spawn invariant.
**Target Platform**: cross-platform Node.js MCP server (Windows / macOS / Linux). The host shells out to the Obsidian CLI binary via `child_process.spawn`. Per the 017-cross-platform-support resolver chain, binary discovery is OS-independent. The wrapper's `resolveTo` helper uses literal byte-equality `endsWith(".md")` and `endsWith("/")` — byte-for-byte reproducible across platforms. Backslash-in-`to` handling deferred to T0 case xii per R10.
**Project Type**: MCP server with one new typed tool. Per Constitution v1.5.0, the project exposes "an MCP server surface" only; `move` adds one entry to the registered-tool list at [src/server.ts](../../src/server.ts) (alphabetical: inserted between `links` and `obsidian_exec`).
**Performance Goals**: per-call latency ≈ 1× existing single-call typed tools (one CLI invocation, ~150–300 ms typical). The call and the response fit comfortably within the typed-tool 10 s timeout / 10 MiB output cap inherited from the cli-adapter. **Token savings on the response side** are the primary win — a structured `{ moved, fromPath, toPath }` envelope replaces what previously required `obsidian_exec` returning plain text plus client-side parsing of the response wording for the canonical paths.
**Constraints**:
- 10 s per-call timeout, 10 MiB output cap (typed-tool defaults applied automatically by `invokeCli` per [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts)).
- Single-in-flight CLI queue gates all CLI invocations — single-spawn per request (R11) composes cleanly with the existing queue.
- 008-refactor surface frozen — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the `obsidian_exec` argv-assembly contract, the `assertToolDocsExist` aggregator, the 011-R5 unknown-vault response-inspection clause are all frozen. `move` inherits without modification.
- The `move` CLI response shape is the locked coupling surface; future Obsidian version drift surfaces as test failures rather than silent regressions.
- The 017-cross-platform-support binary-resolver layer is frozen — `move` inherits cross-platform support below `dispatchCli` automatically.
- No new target-mode helpers are introduced. `move` reuses the existing `applyTargetModeRefinement` + `targetModeBaseSchema` exactly as 011/012/013/015/018/021 do; no folder-scoped variant is needed (this is NOT a folder-scoped tool — it's file-scoped like `rename`/`delete`/`read`).
- The post-022 registry-stability baseline at `src/tools/_register-baseline.json` MUST be rolled forward in the same commit per FR-013a / R13.
- The inherited capital-N classifier mismatch on active-mode no-focused-note (R9) is documented in the error roster, not fixed at this layer — fixing it is a cross-cutting BI tracked under [[BI-0027 - Audit Tool Descriptions]] dimension C.2.
**Scale/Scope**: ~165 LOC of new source code across `schema.ts` (~25 LOC) / `handler.ts` (~70 LOC) / `index.ts` (~25 LOC), plus three co-located test files totalling ~880 LOC (~24 schema cases / ~28 handler cases / ~5 registration cases = ~57 cases). One new doc at `docs/tools/move.md` (~250 lines including ≥4 worked examples per FR-014, error roster with the `CLI_REPORTED_ERROR` active-mode note, `to` shape rules section with the surprise-case worked examples per FR-014 enhanced post-Q2, link-rewriting caveat, rename-equivalence note). Two lines of edit in `src/server.ts` (import + tools-array entry), one line each in `docs/tools/index.md`, `package.json` (version bump 0.5.7 → 0.5.8 per SC-016), `CHANGELOG.md`, and `CLAUDE.md` (active-narrative rotation). One regenerated JSON file at `src/tools/_register-baseline.json` (per R13).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / ADR | Compliance | Evidence |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | New tool lives at `src/tools/move/` per the established `{schema, handler, index}.ts` per-surface layout (verified against existing siblings `delete`, `files`, `find_by_property`, `help`, `links`, `obsidian_exec`, `outline`, `properties`, `read`, `read_heading`, `read_property`, `rename`, `set_property`, `smart_connections_query`, `smart_connections_similar`, `tag`, `tree`, `write_note`). Downward-flow chain preserved: `index.ts` → `handler.ts` → `cli-adapter` → `child_process.spawn`. No upward or cyclic imports. The schema module imports from `target-mode/` (peer primitive — UNCHANGED, no new helper); the handler imports from `cli-adapter/` (peer); `index.ts` imports from `_register.ts` (sibling factory). The `resolveTo` helper is file-local in `handler.ts` (~12 LOC) — not a peer module. |
| **II. Public Surface Test Coverage** | ✅ PASS | `move` is a public MCP tool surface. Co-located tests at `src/tools/move/{schema,handler,index}.test.ts` (~24 schema cases / ~28 handler cases / ~5 registration cases per FR-016 = **~57 tests total**, exceeding the precedent floor of 30). Happy-path AND failure-path coverage in every layer. The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) automatically covers `move` via its `it.each` registry walk; no test-file modifications required. The registry-consistency test at [src/server.test.ts](../../src/server.test.ts) automatically asserts `docs/tools/move.md` exists once `move` is registered. The post-022 baseline test at [src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts) requires the FR-013a / R13 roll-forward to pass; the roll-forward lands in the same commit. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | Input schema is `applyTargetModeRefinement(targetModeBaseSchema.extend({ to: z.string().min(1) }))` — composed from the project's single-source-of-truth `target_mode` primitive plus one move-specific field. Inferred TypeScript type via `z.infer<typeof moveInputSchema>`. **Output type ALSO via zod schema** `moveOutputSchema = z.object({ moved: z.literal(true), fromPath, toPath }).strict()` (per FR-005 / FR-006) — no hand-rolled types. The `to` field's `.min(1)` rejects empty strings at the zod boundary. No regex or shape constraint at the schema layer (the strict trailing-`/` discriminator is a handler-layer branch per R6/R7; the source-`.md` guard is a handler-layer transform per R6). `registerTool` parses input via `schema.parse` before the handler runs (auto-wrap `ZodError → VALIDATION_ERROR` with `details.issues`). Handler trusts validated input; no defensive checks. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Zero new error codes (per FR-017a, Constitution Principle IV). Failures flow through `VALIDATION_ERROR` (zod) and `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`). The active-mode no-focused-note case surfaces as `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`) per the inherited bridge-classifier mismatch — documented explicitly in the error roster per FR-014, not papered over per SC-014. The 011-R5 unknown-vault response-inspection clause in the cli-adapter is inherited verbatim — no `move`-specific handling needed; F2 confirms the response signature is byte-identical to the 011-R5 baseline. Source-not-found, destination-collision, path-traversal, and permission-denied all flow through the cli-adapter's four-priority classification (T0 verifies the exact mapping per FR-019). `registerTool`'s catch blocks propagate `UpstreamError` via `asToolError` and re-throw any other exception. No `catch + return null/empty/default` patterns. |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/tools/move/{schema,handler,index}.ts` + three `*.test.ts`) carries the `// Original — no upstream. <one-line description>.` header per the established convention (FR-001). The Markdown doc at `docs/tools/move.md` is exempt per [005-help-tool](../005-help-tool/spec.md) FR-019. README's Attributions section is unchanged (no new lifted code). The `resolveTo` helper and the `parseMoveResponse` helper are both original wrapper logic; not derived from any external project. |
| **ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand)** | ✅ PASS | Tool name `move` is the single-word verbatim upstream CLI subcommand name per `obsidian help` (F1). Parity with the post-022 single-word convention (`read`, `delete`, `files`, `rename`, `outline`, `properties`, `links`, `tag`, `tree`). |
| **ADR-013 (Plugin-Namespace Tool Naming Convention)** | N/A | `move` wraps a native CLI subcommand, NOT a plugin API. Per the Constitution v1.5.0 parenthetical: "a PR that adds a native-CLI-wrapper typed tool is N/A on ADR-013". |
| **ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern)** | N/A | Same reason as ADR-013. `move` is not plugin-backed; no plugin-lifecycle states (`<PLUGIN>_NOT_INSTALLED` / `<PLUGIN>_NOT_READY` / `SOURCE_NOT_INDEXED`) apply. |
| **ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes)** | N/A | `move` introduces no new `(top-level-code, details.code)` pair with multiple sub-states; adds no new sub-states to existing pairs. Per the Constitution v1.5.0 parenthetical: "a PR that introduces no new `(top-level-code, details.code)` pair with multiple sub-states AND adds no new sub-states to existing pairs is N/A on ADR-015". |

**Coverage gate**: aggregate statements floor is 91.3% ([vitest.config.ts:20](../../vitest.config.ts#L20)); the new tests must not drop the aggregate below this. The new module is ~165 LOC; the ~57 co-located test cases provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Constitution Compliance checklist** (for the eventual PR): Principles I–V all evaluate as Y; ADR-010 Y; ADR-013 / ADR-014 / ADR-015 all N/A per the Constitution v1.5.0 parentheticals. No deviations needed; no Complexity Tracking entries required.

**Plan-stage spec amendments documented in research.md (per R12)**: NONE. The two /speckit-clarify decisions (Q1 source-`.md`-guarded `.md` append rule, Q2 strict trailing-`/` discriminator) were locked at spec-stage session 2026-05-15 and are already integrated in spec.md. The five live-CLI findings (F1–F5b) ratify the spec's assumptions without surfacing any contradictions.

## Project Structure

### Documentation (this feature)

```text
specs/030-move-note/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions R1–R14 + plan-stage live-CLI findings F1–F5b + FR-019 deferred-T0 case roster (13 cases, 4 verified/partially-verified at plan stage)
├── data-model.md        # Phase 1 output — input/output schema shapes, per-mode argv-mapping table, `resolveTo` truth table, per-tool invariants ↔ FR mapping, test inventory (~57 cases)
├── quickstart.md        # Phase 1 output — verification scenarios (Q-1..Q-N) mapped 1:1 to SC-001..SC-016 + manual T0 scenarios for live-CLI characterisation
├── contracts/
│   ├── move-input.contract.md     # Public input contract (zod schema + emitted JSON Schema shape + field policy + worked examples + validation/downstream failure rosters)
│   └── move-handler.contract.md   # Handler invariants (deps shape, single-spawn invariant, resolveTo helper contract, response-parsing locked against T0 capture, failure propagation, test-seam pattern)
├── checklists/
│   └── requirements.md  # Spec quality checklist (filled at /speckit-specify time + updated post-/speckit-clarify)
└── tasks.md             # Phase 2 output (created by /speckit-tasks, NOT by this command)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── move/                              # NEW per-surface module (FR-001)
│   │   ├── schema.ts                      # moveInputSchema (target-mode primitive + to: z.string().min(1)), moveOutputSchema (literal true / fromPath / toPath), types via z.infer (FR-002..FR-006); ~25 LOC
│   │   ├── schema.test.ts                 # ~24 cases per FR-016 (target-mode interactions + to non-empty + to non-string + unknown-key + invalid discriminator)
│   │   ├── handler.ts                     # executeMove(input, deps) — single-spawn invokeCli wrapper + resolveTo helper (R6) + parseMoveResponse (locked against T0 capture); ~70 LOC
│   │   ├── handler.test.ts                # ~28 cases per FR-016 (per-mode argv shape, resolveTo cases b/b2/b3/b4/b5/f2, error code propagation, single-spawn invariant, same-folder rename equivalence, capital-N CLI_REPORTED_ERROR active-mode case)
│   │   ├── index.ts                       # createMoveTool factory via registerTool (FR-011); ~25 LOC
│   │   └── index.test.ts                  # ~5 registration cases per FR-016 (descriptor name, stripped schema, help mention, doc presence + non-stub assertion, drift-detector parameterised lock)
│   ├── _register.ts                       # FROZEN (verified — no edits needed; registerTool covers move out-of-the-box)
│   ├── _register.test.ts                  # FROZEN — drift detector's it.each registry walk auto-covers move
│   ├── _register-baseline.json            # MODIFIED — rolled forward via `npm run baseline:write` per R13 / FR-013a; one new entry `{ name: "move", descriptionFingerprint, schemaFingerprint }`; other entries byte-identical per SC-009
│   ├── _register-baseline.test.ts         # FROZEN — durable test consumes the regenerated baseline JSON
│   ├── _register-baseline.ts              # FROZEN — shared helper unchanged
│   ├── _shared.ts                         # FROZEN
│   ├── _shared.test.ts                    # FROZEN
│   ├── _eval-vault-closed-detection/      # FROZEN (cross-cutting shared module; move is not eval-driven so does not consume it)
│   ├── delete/                            # FROZEN (SC-009 — zero substantive diff; classifier-mismatch attribution shared with move per R9)
│   ├── files/                             # FROZEN (SC-009)
│   ├── find_by_property/                  # FROZEN (SC-009)
│   ├── help/                              # FROZEN
│   ├── links/                             # FROZEN (SC-009)
│   ├── obsidian_exec/                     # FROZEN (SC-009)
│   ├── outline/                           # FROZEN (SC-009)
│   ├── properties/                        # FROZEN (SC-009)
│   ├── read/                              # FROZEN (SC-009)
│   ├── read_heading/                      # FROZEN (SC-009)
│   ├── read_property/                     # FROZEN (SC-009)
│   ├── rename/                            # FROZEN (SC-009 — closest sibling; classifier-mismatch attribution shared with move per R9; the folder-separator rule on its `name` field is the structural enforcement point that scopes `rename` to in-place and defers path changes to `move`)
│   ├── set_property/                      # FROZEN (SC-009)
│   ├── smart_connections_query/           # FROZEN (SC-009)
│   ├── smart_connections_similar/         # FROZEN (SC-009)
│   ├── tag/                               # FROZEN (SC-009)
│   ├── tree/                              # FROZEN (SC-009)
│   └── write_note/                        # FROZEN (SC-009)
├── server.ts                              # +2 lines: import + createMoveTool({ logger, queue }) added to the tools array (alphabetical: inserted between createLinksTool and createObsidianExecTool, at line ~?)
├── server.test.ts                         # registry-consistency test auto-covers move's docs/ presence (no edits)
├── cli-adapter/                           # FROZEN (008-refactor surface + 011-R5 unknown-vault inspection clause; F2 confirms unchanged behaviour for `move`)
├── binary-resolver/                       # FROZEN (017-cross-platform-support surface)
├── target-mode/                           # FROZEN — no new helper needed (move reuses the existing applyTargetModeRefinement; parity with 011/012/013/015/018/021)
├── help/                                  # FROZEN
├── errors.ts                              # FROZEN (no new codes per FR-017a; the CLI_REPORTED_ERROR classifier-mismatch attribution lives in docs/tools/move.md and in the spec, not in the code)
├── logger.ts                              # FROZEN (per R1 — no callStart/callEnd events introduced)
└── queue.ts                               # FROZEN

docs/tools/
├── move.md                                # NEW non-stub doc per FR-014 (input schema, output shape, error roster WITH the explicit CLI_REPORTED_ERROR active-mode note, ≥4 worked examples, `to` shape rules section WITH the trailing-`/` surprise-case worked examples per FR-014 enhanced post-Q2, link-rewriting caveat, rename-equivalence note, adversarial edge cases)
├── index.md                               # +1 line entry per the existing convention
├── obsidian_exec.md                       # FROZEN (SC-015 — possibly updated with one line pointing at move for relocation operations; verifiable by inspection)
└── (all other tool docs)                  # FROZEN

CHANGELOG.md                               # +1 entry under the patch version (0.5.8 per SC-016) naming `move`, summarising the input/output shape, calling out the vault-config-dependent link-rewriting caveat, and noting the inherited active-mode no-focused-note classifier behaviour
package.json                               # version 0.5.7 → 0.5.8 per SC-016
README.md                                  # tools-list section updated (if present)
CLAUDE.md                                  # active-narrative block rotated: 029-list-files-recursive demoted to predecessor; 030-move-note becomes the active feature; plan-pointer updated to reference this plan
.architecture/Obsidian CLI MCP - Architecture.md  # canonical architecture document rolled forward (parity with the per-BI roll-forward convention 026/027/028/029 established)
```

**Structure Decision**: Single-project layout per the existing project shape. `src/tools/move/` is the entire functional surface for this feature; everything else is one-line wiring (server registration, docs index, package description, CHANGELOG, CLAUDE.md narrative) or out-of-tree documentation (README) plus the baseline JSON roll-forward (per R13). Per Constitution Principle I, the new module is single-purpose (typed single-file move of vault files); per Principle II, tests are co-located with sources. No new peer-module helpers are introduced — `move` is the most additive plan-stage shape for a new typed tool that follows the 021-rename precedent (file-scoped, single-spawn, no eval composition, no plugin runtime).

## Phase 0: Research Decisions Summary

Full detail in [research.md](./research.md). Brief index of decisions ratified there:

- **R1 — Logger surface**: thin handler, no per-call events. Mirrors 011–021 actual implementation.
- **R2 — CLI subcommand selection**: `move` (native). NOT eval, NOT obsidian_exec. F1 confirms (live `obsidian help` output captured at plan stage).
- **R3 — Per-mode call architecture**: ONE `invokeCli` call per request, regardless of mode. Specific mode includes `vault=`; active mode omits.
- **R4 — Target-mode mapping**: STANDARD (file-scoped, like 011/012/013/015/018/021). No folder-scoped variant.
- **R5 — Unknown-vault response inspection**: inherited from cli-adapter's 011-R5 clause unchanged. F2 verifies byte-identical signature match.
- **R6 — `to`-shape transform (per /speckit-clarify Q1, locked 2026-05-15)**: file-local `resolveTo(to, fromPath)` helper. Trailing-`/` → folder-target branch (append source basename); otherwise → full-path-target with source-`.md`-guarded `.md` append. Fully applicable in specific + `path=` mode only; `file=` and active modes forward `to=` verbatim and accept CLI's native handling per T0 case xiii.
- **R7 — Strict trailing-`/` discriminator (per /speckit-clarify Q2, locked 2026-05-15)**: no heuristic, no validation-reject, no probe. `to.endsWith("/")` discriminates.
- **R8 — `to` field schema**: `z.string().min(1)` only. No regex, no shape validation at the zod layer. Strict-discriminator + source-`.md` guard live in the `resolveTo` helper at the handler layer.
- **R9 — Active-mode no-focused-note classifier behaviour**: surfaces as `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`) per inherited bridge-classifier mismatch (capital-N reply not recognised). Empirically confirmed across `delete` TC-049 and `rename` TC-171; T0 case (ix) confirms for `move`.
- **R10 — Backslash-in-`to`**: forwarded verbatim. T0 case (xii) captures behaviour.
- **R11 — Single-spawn invariant**: every request fires exactly ONE `invokeCli` call.
- **R12 — Plan-stage spec amendments: NONE**. The two /speckit-clarify decisions are already integrated; F1–F5b ratify without surfacing contradictions.
- **R13 — Post-022 baseline roll-forward (per FR-013a)**: `npm run baseline:write` in the same commit as `move`'s registration.
- **R14 — Response-parsing locked at T0**: `parseMoveResponse(stdout)` regex/parse rule finalised at T0 against the captured success/failure wording per FR-019.

**Plan-stage status**: 14 design decisions ratified. **5 live-CLI findings captured at plan stage** (F1 subcommand argv shape; F2 unknown-vault response; F3 source-not-found wording; F4 missing-`to=` wording — unreachable from wrapper; F5/F5b source-traversal handling + source-resolution short-circuit). **13 FR-019 cases enumerated**, of which 4 are verified or partially verified at plan stage (F1 → xiii; F2 → vii; F3 → v; F5/F5b → x partial); 9 remain deferred to T0 of `/speckit-implement` and bundled into a `T001 [LIVE]` task at /speckit-tasks time. Cases (x) destination-traversal and (xii) backslash-in-`to` are gated by SC-012 (path-traversal precondition with the same amendment-shape sketch the 021-rename plan uses). Case (ix) capital-N no-focused-note classifier mismatch is the SC-014 load-bearing assertion.

## Phase 1: Design Artifacts

Generated in this command run:

- **[research.md](./research.md)** — design decisions R1–R14 + plan-stage live-CLI findings F1–F5b + Phase 0 amendment record per R12 + FR-019 deferred-T0 case roster.
- **[data-model.md](./data-model.md)** — input/output schema shapes, per-mode CLI argv-mapping table, `resolveTo` truth table, per-tool invariants ↔ FR mapping, module layout LOC budget, test inventory (~57 cases — 24 schema / 28 handler / 5 registration).
- **[contracts/move-input.contract.md](./contracts/move-input.contract.md)** — public input contract: zod schema, emitted JSON Schema shape, field-by-field rules, worked examples covering all valid input shapes, validation failure roster, downstream failure roster.
- **[contracts/move-handler.contract.md](./contracts/move-handler.contract.md)** — handler invariants: deps shape, single-spawn invariant (R11), argv shape table (exhaustive across all valid input combinations × `target_mode` × locator), `resolveTo` helper contract with the ten worked examples (locked at /speckit-clarify Q1 + Q2), response-parsing locked against T0 capture, failure propagation chain.
- **[quickstart.md](./quickstart.md)** — verification scenarios (Q-1..Q-N) mapped 1:1 to SC-001..SC-016 + manual T0 scenarios (M-1..M-N) for live-CLI characterisation gaps deferred from plan stage.
- **CLAUDE.md active-narrative rotation** — the 029-list-files-recursive block is demoted to the predecessor section; the new 030-move-note block becomes the active feature per the established per-BI convention.
- **`.architecture/Obsidian CLI MCP - Architecture.md` roll-forward** — the canonical architecture document is updated to reference `move` as the sixteenth typed-tool and the second member of the file-scoped write-side cohort alongside `rename` / `delete` / `set_property`.

## Constitution Re-Check (Post-Design)

| Principle / ADR | Compliance | Notes |
|---|---|---|
| I. Modular Code Organization | ✅ PASS | Phase 1 confirmed the per-surface layout. No new peer-module helpers; `resolveTo` and `parseMoveResponse` are both file-local in `handler.ts`. The downward-flow chain is unchanged from the existing typed-tool siblings. |
| II. Public Surface Test Coverage | ✅ PASS | Test-set inventory frozen at ~57 cases (24 schema / 28 handler / 5 registration). Drift detector auto-covers. Every handler test asserts the single-spawn invariant. Source-`.md`-guard suppression case (FR-016 f2) is the SC-013 load-bearing assertion; capital-N active-mode case (FR-016 l) is the SC-014 load-bearing assertion. |
| III. Boundary Input Validation with Zod | ✅ PASS | Output schema also zod-derived. Input schema's `to` field carries `.min(1)` only — no regex, no shape constraint at the schema layer. The `to`-shape transform rule (per /speckit-clarify Q1 + Q2) lives at the handler layer, NOT the schema layer — it's a transformation of validated input, not validation itself. |
| IV. Explicit Upstream Error Propagation | ✅ PASS | Zero new codes confirmed. R5 inherits the 011-R5 cli-adapter response-inspection clause without modification; F2 ratifies. The inherited capital-N classifier mismatch (R9) is documented as observable behaviour in the error roster, NOT papered over with a synthetic `ERR_NO_ACTIVE_FILE` claim — per SC-014. T0 verifies the exact code mapping for each CLI failure mode (source-not-found, destination-exists, no-active-file, path-traversal, unknown-vault, permission-denied). |
| V. Attribution & Layered Composition | ✅ PASS | All six new source files carry the `// Original — no upstream.` header. No upstream code lifted. The `resolveTo` helper and the `parseMoveResponse` helper are both original wrapper logic; not derived from any external project. |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | ✅ PASS | Confirmed at Phase 0 (F1). Tool name `move` is verbatim from `obsidian help`. |
| ADR-013 / ADR-014 / ADR-015 | N/A | Confirmed per the Constitution v1.5.0 parentheticals — native-CLI-wrapper, no plugin runtime, no new sub-discriminator pairs. |

**No Complexity Tracking entries.** No deviations.

## Complexity Tracking

> **No deviations from constitution.** All five principles evaluate as `Y` for this feature; ADR-010 evaluates as `Y`; ADR-013 / ADR-014 / ADR-015 evaluate as `N/A`. No `N` entries; no Complexity Tracking entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (n/a)      | (n/a)                               |
