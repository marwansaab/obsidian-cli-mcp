# Implementation Plan: Reliable Writer

**Branch**: `016-reliable-writer` | **Date**: 2026-05-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-reliable-writer/spec.md`

## Summary

Replace the legacy `write_note` tool wholesale with a direct-filesystem-write implementation that never sends user content across the CLI argv pipe. The legacy implementation crashes Obsidian's main process for any content above ~4 KB on Windows because of an upstream argv→IPC chunk-boundary defect (filed at <https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119>). The eval-bypass design originally proposed for this BI was empirically refuted on 2026-05-10 — both `obsidian create` and `obsidian eval` crash equally above the same per-argv-element threshold. The chosen design (ratified by [ADR-009](../../.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md)) routes content via Node `fs` directly to the vault filesystem and uses small bug-safe `eval` calls only for control-plane operations (vault registry probe, focused-file resolution, `metadataCache` invalidation, optional editor-open) — all argv crossings stay under 250 bytes, orders of magnitude below the upstream IPC ceiling.

The replacement keeps the same tool name (`write_note`), the same target-mode discriminator (per ADR-003), and an output shape byte-stable with the predecessor (`{ created: boolean, path: string }`). Two deliberate breaking changes vs. the predecessor: the `template` parameter is dropped (migration path: `obsidian_exec`), and collision behaviour is now structured `FILE_EXISTS` instead of silent rename. Three new error codes added to the project roster: `PATH_ESCAPES_VAULT`, `FILE_EXISTS`, `FS_WRITE_FAILED`. Two new internal modules: `src/vault-registry/` (cached `vaultName → absolutePath` map, lazy-populated on first write) and `src/path-safety/` (schema-layer + runtime two-layer vault-root sandboxing with `fs.realpath` for symlink-escape detection).

## Technical Context

**Language/Version**: TypeScript strict mode, target ES2024, NodeNext module resolution. Authoritative typecheck via `tsc --noEmit` (per Constitution Technical Standards).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation, single source of truth for input/output shapes), `zod-to-json-schema` (publishes the MCP `inputSchema`). No new runtime dependencies introduced — Node's built-in `fs/promises` and `path` cover the new IO path; `crypto.randomUUID()` covers temp-file uniqueness.
**Storage**: Filesystem (Obsidian vault directory tree). The new tool writes via `fs.writeFile` (with `wx` flag for non-overwrite) and `fs.rename`. No database; no persistent state outside the vault filesystem and the in-process vault-registry cache.
**Testing**: `vitest run` with `@vitest/coverage-v8`. Co-located `*.test.ts` files per Principle II. New test files: `src/vault-registry/registry.test.ts`, `src/path-safety/{schema,canonical}.test.ts`, `src/tools/write_note/{schema,handler,index}.test.ts`.
**Target Platform**: Cross-platform Node.js >= 22.11 (per Constitution). Primary verification on Windows 11 (the platform where the upstream BI-038 defect manifests at the lower ~4 KB threshold); secondary on macOS / Linux. The `fs.realpath`, `fs.rename` (atomic same-volume), and `fs.writeFile` with `wx` flag behaviours are all standard POSIX + Windows-NTFS via libuv.
**Project Type**: MCP server (single-project layout per the constitution's MCP-server scope; no CLI surface, no web frontend). Co-located tests; flat module tree under `src/`.
**Performance Goals**: Specific-mode write latency target ~155 ms cold (vault-registry probe ~150 ms first call only), ~155 ms warm (5 ms fs writes + ~150 ms `metadataCache` invalidation eval). Active-mode adds one pre-write eval (~150 ms) for focused-file resolution → ~305 ms total. No artificial upper bound on content size or call latency (per spec Q4 — agent-side MCP timeout is the natural backstop).
**Constraints**: No user-supplied content may cross the CLI argv pipe at any size (FR-005, SC-007). All `eval` argv elements stay under 250 bytes. No new dependency on the cli-adapter's bounds (ADR-007's amendment 2026-05-10 carves out fs IO).
**Scale/Scope**: One typed tool replaced (`write_note`); two new internal modules introduced (`src/vault-registry/`, `src/path-safety/`). 6 user stories, 29 FRs, 12 SCs in the spec. Estimated implementation surface: ~250 LOC source / ~700 LOC test. Single-vault and multi-vault deployments both in scope; the multi-vault routing limitation (R11 in BI-038 / 014 / 015 history) is **resolved** for the new tool because the bridge owns path resolution end-to-end via the vault registry.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How satisfied |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | Three new per-surface modules introduced — `src/vault-registry/`, `src/path-safety/`, and the replacement `src/tools/write_note/`. Cross-module imports flow downward only: `write_note` handler → `vault-registry` + `path-safety` + `cli-adapter` (for the small evals) + Node `fs/promises`. No upward or cyclic dependencies. The `{schema, tool, handler}.ts`-style layout per Principle I applies to `src/tools/write_note/` (with `index.ts` as the canonical registration file per the post-011 convention). |
| **II. Public Surface Test Coverage** | ✅ PASS | The `write_note` MCP tool has co-located vitest cases at `src/tools/write_note/{schema,handler,index}.test.ts` covering at minimum every FR via at least one happy-path + one failure-or-boundary case each. The two new internal modules also ship co-located tests at `src/vault-registry/registry.test.ts` and `src/path-safety/{schema,canonical}.test.ts`. The post-010 consolidated drift detector at `src/tools/_register.test.ts` auto-covers the new `write_note` registration via its `it.each` registry walk. |
| **III. Boundary Input Validation with Zod** | ✅ PASS | `writeNoteInputSchema` and `writeNoteOutputSchema` are zod schemas; `WriteNoteInput` and `WriteNoteOutput` are `z.infer<typeof ...>`. Path-safety validators are implemented as zod `superRefine` clauses on the input schema. No hand-rolled `typeof`/`instanceof` chains at boundaries. The published MCP `inputSchema` is generated from the zod schema via `zod-to-json-schema`, with descriptions stripped per ADR-005. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | All failures surface as `UpstreamError` instances via the `registerTool` factory's existing pipeline. Three new stable codes introduced (`PATH_ESCAPES_VAULT`, `FILE_EXISTS`, `FS_WRITE_FAILED`) — each documented in `docs/tools/write_note.md` per FR-022 and added to `src/logger.ts:ErrorCode` per Analyze M4 in T002a. Vault-not-found surfaces as `VALIDATION_ERROR` (vault name is invalid input given the registry); `ERR_NO_ACTIVE_FILE` reused for active-mode no-focus. **Zero** plain `throw new Error(...)` at any boundary surface. Two intentional best-effort-continue paths — the `metadataCache` invalidation eval failure (FR-011) and the post-write `open` eval failure (FR-017) — are explicitly authorized by Spec FR-011 / FR-017 + Edge Cases bullet, with the success envelope still reporting the write outcome correctly (per Constitution IV's "if a partial-success or best-effort-continue path is intentional, it MUST cite the explicit user/spec decision that authorized it" carve-out). Both best-effort paths are silent (no per-call logger event) — only the security-relevant `PATH_ESCAPES_VAULT` rejection emits a typed `pathEscapeAttempt` event per FR-029 (typed `Logger.pathEscapeAttempt(event)` method added in T002a per Analyze C1). |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Per FR-027: every new source file (`src/vault-registry/registry.ts`, `src/path-safety/{schema,canonical}.ts`, `src/tools/write_note/{schema,handler,index}.ts`) MUST carry the standard `// Original — no upstream.` attribution header per Constitution V, plus a citation pointing at ADR-009 in the header comments. No upstream code lifted; all originals. README's "Attributions" section unchanged (no new upstreams). |

**Result**: All five principles satisfied. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/016-reliable-writer/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # User-facing specification (already locked through /speckit-clarify)
├── bug-report-draft.md  # Filed upstream forum report (forum.obsidian.md/.../114119)
├── research.md          # Phase 0 output — research decisions R1..R14, live CLI findings F1..F5
├── data-model.md        # Phase 1 output — module schemas, types, test inventory, LOC budget
├── quickstart.md        # Phase 1 output — verification scenarios mapped to SC-001..SC-012
├── contracts/           # Phase 1 output — per-module input/handler contracts
│   ├── write-note-input.contract.md
│   ├── write-note-handler.contract.md
│   ├── vault-registry.contract.md
│   └── path-safety.contract.md
├── checklists/
│   └── requirements.md  # Spec quality gate (already passing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root)

```text
src/
├── cli-adapter/                    # Existing — unchanged (per ADR-009 non-impact + ADR-007 amendment 2026-05-10)
│   ├── _dispatch.ts                #   continues to handle the small eval calls write_note emits
│   ├── cli-adapter.ts              #   public invokeCli facade unchanged
│   └── invoke-bounded-cli.ts       #   public invokeBoundedCli facade unchanged
├── target-mode/                    # Existing — unchanged
│   └── target-mode.ts              #   write_note's input schema reuses targetModeBaseSchema + applyTargetModeRefinement
├── vault-registry/                 # NEW per ADR-009 / FR-012 / FR-026
│   ├── registry.ts                 #   resolveVaultPath(name): lazy probe via 'obsidian vaults verbose', cached for MCP-process lifetime
│   └── registry.test.ts            #   co-located vitest cases
├── path-safety/                    # NEW per ADR-009 / FR-013 + FR-014 / FR-026
│   ├── schema.ts                   #   schema-layer rejection (../,  /, \, drive-letter, control chars) → VALIDATION_ERROR
│   ├── canonical.ts                #   runtime fs.realpath + startsWith(realVaultRoot+sep) → PATH_ESCAPES_VAULT
│   ├── schema.test.ts              #   co-located validator tests
│   └── canonical.test.ts           #   co-located runtime check tests
├── tools/
│   ├── _register.ts                # Existing — unchanged; new write_note routes through registerTool factory per ADR-006
│   ├── _register.test.ts           # Existing — auto-covers new write_note via the registry walk; no edits
│   ├── _shared.ts                  # Existing — unchanged
│   ├── delete_note/                # Existing — unchanged
│   ├── find_by_property/           # Existing — unchanged
│   ├── help/                       # Existing — unchanged
│   ├── obsidian_exec/              # Existing — unchanged (this is the migration path for template-based creates per FR-016)
│   ├── read_heading/               # Existing — unchanged
│   ├── read_note/                  # Existing — unchanged
│   ├── read_property/              # Existing — unchanged
│   └── write_note/                 # REPLACED WHOLESALE per FR-028
│       ├── schema.ts               #   writeNoteInputSchema + writeNoteOutputSchema (Z3.x); template rejected, open accepted
│       ├── handler.ts              #   the new direct-fs-write handler
│       ├── index.ts                #   createWriteNoteTool factory; same WRITE_NOTE_TOOL_NAME = "write_note"
│       ├── schema.test.ts          #   co-located schema tests
│       ├── handler.test.ts         #   co-located handler tests (every FR + edge case)
│       └── index.test.ts           #   co-located registration test
├── errors.ts                       # Existing — unchanged (UpstreamError class is the carrier; new codes are conventions, not types)
├── logger.ts                       # MODIFIED per Analyze C1 (2026-05-10): extend the Logger interface with a new typed `pathEscapeAttempt(event: PathEscapeAttemptEvent)` method per FR-029 (follows the existing per-event-type method convention); amend the `ErrorCode` union to add the three new codes (`PATH_ESCAPES_VAULT`, `FILE_EXISTS`, `FS_WRITE_FAILED`) per FR-020 / Analyze M4. Co-located `src/logger.test.ts` updated with at-least-one happy-path + at-least-one failure-or-boundary case for the new method per Constitution II.
├── queue.ts                        # Existing — unchanged
└── server.ts                       # MODIFIED: tools array entry for write_note keeps its alphabetical position (no name change). Two import-line/comment touches max.

docs/
└── tools/
    └── write_note.md               # REWRITTEN: full progressive-disclosure help per FR-022 covering the six required dimensions
```

**Structure Decision**: Single-project layout per the existing convention; tests co-located per Principle II. Two new modules (`vault-registry/`, `path-safety/`) introduced as the cleanly-separated foundations the new `write_note` composes against. The legacy `src/tools/write_note/` files are deleted wholesale (FR-028); git history preserves them. The `src/server.ts` registration list grows by zero lines net (entry stays at the same alphabetical position; just the import target may change if the legacy was previously importing additional symbols — verified during T0 of `/speckit-implement` that the import contract holds).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify. All five principles satisfied per the Constitution Check table above. No `N` entries; no Complexity Tracking entries needed.
