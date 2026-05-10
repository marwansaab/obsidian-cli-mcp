# Implementation Plan: Cross-Platform Binary Resolution

**Branch**: `017-cross-platform-support` | **Date**: 2026-05-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-cross-platform-support/spec.md`

## Summary

Lift the bridge's Windows-only restriction by extracting binary resolution from a one-line `env.OBSIDIAN_BIN ?? "obsidian"` lookup at [src/cli-adapter/_dispatch.ts:62](../../src/cli-adapter/_dispatch.ts#L62) into a new `src/binary-resolver/` module that performs an ordered three-tier resolution: (1) `OBSIDIAN_BIN` override, (2) platform-default install path (`/usr/local/bin/obsidian` on macOS, `~/.local/bin/obsidian` on Linux, no platform-default on Windows per FR-005), (3) fall-through to OS-spawn `PATH` lookup. The resolver runs once per `dispatchCli` call (FR-009 — no caching). Failure surfaces as the existing `CLI_BINARY_NOT_FOUND` UpstreamError (FR-010 — no new code) with enriched `details`: a structured `attempts: ResolutionAttempt[]` array carrying source / path / outcome per branch, plus the host platform name and the verbatim `PATH` env var.

The work is entirely below the typed-tool surface; no new MCP tool, no new public API, no schema changes, no new error codes, no new ADRs. All eight currently-shipping tools (`obsidian_exec`, `help`, `read_note`, `read_heading`, `read_property`, `find_by_property`, `write_note`, `delete_note`) and every future typed tool inherit cross-platform support without per-tool plumbing because the resolver lives below `dispatchCli`. The two existing test files that assert specific `CLI_BINARY_NOT_FOUND` `details` shape ([src/cli-adapter/_dispatch.test.ts:185-204](../../src/cli-adapter/_dispatch.test.ts#L185-L204) and [src/tools/obsidian_exec/handler.test.ts:111-122](../../src/tools/obsidian_exec/handler.test.ts#L111-L122)) are updated in the same change to consume the new shape per Constitution II. README's Installation section gains macOS and Linux subsections (FR-012); the existing Windows subsection is preserved unchanged. `package.json`'s `description` field and README's opening paragraph are bumped from "Windows-host" to tri-platform framing per FR-019.

Two clarification answers from the 2026-05-10 session shape the design:
- **Q1 (PATH-branch shape)**: the resolver defers `PATH` lookup to the OS spawn — no in-tree `which`-walk, no `PATHEXT` reimplementation. The `"PATH"` Resolution-attempt tuple records source `"PATH"`, path = bare command name (`"obsidian"`), outcome = `"not-found"` if the spawn fails ENOENT.
- **Q2 (executability predicate)**: `fs.access(path, fs.constants.X_OK)` for the `"OBSIDIAN_BIN"` and `"platform-default"` attempts. Kernel-side check; respects mode AND ownership on POSIX in one syscall; succeeds for any existing file on Windows (which preserves FR-005's byte-for-byte Windows behaviour).

## Technical Context

**Language/Version**: TypeScript strict mode, target ES2024, NodeNext module resolution. Authoritative typecheck via `tsc --noEmit` (per Constitution Technical Standards).
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP transport), `zod` (boundary validation, single source of truth for input/output shapes — unchanged by this BI), `zod-to-json-schema` (publishes the MCP `inputSchema` — unchanged). No new runtime dependencies introduced — Node's built-in `node:os` (`homedir()`, `platform`), `node:fs/promises` (`access`), and `node:path` (already in use) cover the new resolver.
**Storage**: N/A — the resolver is stateless. No filesystem writes; only existence + executability checks via `fs.access(X_OK)`.
**Testing**: `vitest run` with `@vitest/coverage-v8`. Co-located `*.test.ts` files per Principle II. New test file: `src/binary-resolver/binary-resolver.test.ts` (~30 cases). Existing test files modified: [src/cli-adapter/_dispatch.test.ts](../../src/cli-adapter/_dispatch.test.ts) (3 cases re-targeted to the new `CLI_BINARY_NOT_FOUND` details shape), [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) (1 integration assertion re-targeted). All cases run on the host platform via seam-injected `process.platform` / `os.homedir()` / `fs.access` — no CI matrix required (FR-014; matches the project memory's "test scope is unit-only" feedback).
**Target Platform**: Cross-platform Node.js >= 22.11 (per Constitution). The resolver itself runs on any platform Node supports; the platform-default branches activate based on the runtime value of `process.platform` (`"darwin"`, `"linux"`, `"win32"`). Verification: Windows 11 (CI happens on the user's host); macOS / Linux verified via seam-injected platform values in unit tests; manual quickstart runs on each physical platform during release validation.
**Project Type**: MCP server (single-project layout per the constitution's MCP-server scope; no CLI surface, no web frontend). Co-located tests; flat module tree under `src/`.
**Performance Goals**: Resolver latency target ≤ 1 ms per `dispatchCli` call on a hot-cached inode. `fs.access(X_OK)` is a single syscall (~50 µs on a hot path); the resolver fires it 0–2 times per call (zero on Windows when `OBSIDIAN_BIN` is unset; one for `OBSIDIAN_BIN` if set; one for the platform-default on macOS/Linux). No artificial budget needed — `fs.access` is faster than the spawn boundary by orders of magnitude.
**Constraints**: No new error code (FR-010); the existing `CLI_BINARY_NOT_FOUND` code is extended via richer `details`. No new MCP tool, no new public API, no schema-layer surface change (FR-011). Standard library only — no new runtime dependencies (FR-017). Resolution runs at each spawn (FR-009 — no caching).
**Scale/Scope**: One new internal module (`src/binary-resolver/`); zero new tools; zero new error codes; zero new ADRs. 7 user stories, 20 FRs, 10 SCs, 11 edge cases in the spec. Estimated implementation surface: ~80–100 LOC source / ~250–300 LOC test for the resolver itself + ~20 LOC of edits to existing tests and `_dispatch.ts`. README + `package.json` documentation/identity bumps.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How satisfied |
|---|---|---|
| **I. Modular Code Organization** | ✅ PASS | One new per-surface module introduced — `src/binary-resolver/`. The module exposes a narrow interface: `resolveBinary(deps): Promise<{path, attempts}>`. Cross-module imports flow downward only: `cli-adapter/_dispatch.ts` (consumer) → `binary-resolver` (producer) → Node `node:os`, `node:fs/promises`. No upward or cyclic dependencies. The resolver is single-purpose: turn `(env, platform, homedir, access)` into `{path, attempts}` or throw `UpstreamError(CLI_BINARY_NOT_FOUND)`. The post-011 module convention applies (`<feature>.ts` plus co-located `<feature>.test.ts`); since this is a single file/test pair with no registration surface, no `index.ts` indirection is needed. |
| **II. Public Surface Test Coverage** | ✅ PASS | The `binary-resolver` module ships co-located vitest cases at `src/binary-resolver/binary-resolver.test.ts` covering at minimum every FR via at least one happy-path + one failure-or-boundary case for each of the three branches (override, platform-default × {darwin, linux}, win32 PATH-only) AND the structured-error-shape detail. The two existing test files that asserted the legacy `details: { binaryAttempted, PATH }` shape are updated in the same change to consume the new shape — `_dispatch.test.ts` (3 cases) and `obsidian_exec/handler.test.ts` (1 case) — so no test that was passing on `main` is left red. The post-010 consolidated drift detector at `src/tools/_register.test.ts` is unaffected (no new tool surface). |
| **III. Boundary Input Validation with Zod** | ✅ PASS | This BI introduces no new MCP-tool input or output surface. Existing tool schemas (`obsidian_exec`, `read_note`, etc.) are unchanged. The resolver is internal — its input is `(env, platform, homedir, access)` injected by the dispatch layer; internal helpers MAY trust their inputs per Principle III's last sentence. Hand-rolled `typeof`/`instanceof` checks are NOT used at any boundary surface; `zod` is still the only runtime input-validation library. |
| **IV. Explicit Upstream Error Propagation** | ✅ PASS | Resolution failures surface as the existing `UpstreamError({code: "CLI_BINARY_NOT_FOUND", ...})` instances thrown directly from the resolver and caught in `_dispatch.ts`. No new code introduced (FR-010); the change is to the `details` field's content. The `cause` field carries the underlying ENOENT (when raised by spawn) or `null` (when the resolver decides eagerly via `fs.access`). No `catch` block returns empty results, default values, or `null` to mask resolution failure. No plain `throw new Error(...)` at any boundary surface. The existing `ErrorCode` union in `src/logger.ts:4-10` is unchanged (no new code added). |
| **V. Attribution & Layered Composition Transparency** | ✅ PASS | Every new source file (`src/binary-resolver/binary-resolver.ts`, `src/binary-resolver/binary-resolver.test.ts`) carries the `// Original — no upstream. <description>.` header per Constitution V. No upstream code lifted; algorithm is original three-tier resolver with deferred-to-spawn `PATH` branch (the existing dispatch logic was already in this shape — the BI generalises and structures it). README's "Attributions" section unchanged (no new upstreams). |

**Result**: All five principles satisfied. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/017-cross-platform-support/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # User-facing specification (locked through /speckit-clarify 2026-05-10)
├── research.md          # Phase 0 output — research decisions R1..R13
├── data-model.md        # Phase 1 output — module schemas, types, test inventory, LOC budget
├── quickstart.md        # Phase 1 output — verification scenarios mapped to SC-001..SC-010
├── contracts/           # Phase 1 output — per-module contracts
│   ├── binary-resolver.contract.md
│   └── cli-adapter-integration.contract.md
├── checklists/
│   └── requirements.md  # Spec quality gate (passing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root)

```text
src/
├── binary-resolver/                  # NEW per FR-006 / FR-018
│   ├── binary-resolver.ts            #   resolveBinary(deps): Promise<{path, attempts}> | throws CLI_BINARY_NOT_FOUND
│   └── binary-resolver.test.ts       #   co-located vitest cases (~30 cases — see data-model.md)
├── cli-adapter/                      # MODIFIED — single dispatch site consumes the resolver
│   ├── _dispatch.ts                  #   line 62 area: replace `env.OBSIDIAN_BIN ?? "obsidian"` with `await resolveBinary({...})`; both ENOENT-path UpstreamError throws inherit the resolved attempts list
│   ├── _dispatch.test.ts             #   3 cases re-targeted to consume the new `details` shape (lines 185-204)
│   ├── cli-adapter.ts                #   public invokeCli facade unchanged
│   ├── cli-adapter.test.ts           #   unchanged
│   ├── invoke-bounded-cli.ts         #   public invokeBoundedCli facade unchanged
│   └── invoke-bounded-cli.test.ts    #   unchanged
├── errors.ts                         # Existing — unchanged (UpstreamError class is the carrier)
├── logger.ts                         # Existing — unchanged (no new ErrorCode)
├── tools/
│   ├── obsidian_exec/                # MODIFIED — handler.test.ts:111-122 case re-targeted to consume the new `details` shape
│   ├── help/                         # Existing — unchanged
│   ├── read_note/                    # Existing — unchanged (inherits cross-platform support automatically)
│   ├── read_heading/                 # Existing — unchanged (inherits)
│   ├── read_property/                # Existing — unchanged (inherits)
│   ├── find_by_property/             # Existing — unchanged (inherits)
│   ├── write_note/                   # Existing — unchanged (inherits)
│   ├── delete_note/                  # Existing — unchanged (inherits)
│   ├── _register.ts                  # Existing — unchanged
│   ├── _register.test.ts             # Existing — unchanged (no new tool registration)
│   ├── _shared.ts                    # Existing — unchanged
│   └── _shared.test.ts               # Existing — unchanged
├── target-mode/                      # Existing — unchanged
├── path-safety/                      # Existing — unchanged
├── vault-registry/                   # Existing — unchanged
├── help/                             # Existing — unchanged
├── queue.ts                          # Existing — unchanged
├── server.ts                         # Existing — unchanged (no new tool registration)
├── server.test.ts                    # Existing — unchanged
├── index.ts                          # Existing — unchanged
└── ...

README.md                             # MODIFIED per FR-012 / FR-019 — Installation section gains macOS + Linux subsections; opening paragraph + Prerequisites updated to tri-platform framing
package.json                          # MODIFIED per FR-019 — description field updated to drop "Windows-host" framing in favour of tri-platform framing
```

**Structure Decision**: Single-project layout per the existing convention; tests co-located per Principle II. One new module (`binary-resolver/`) introduced as a sibling to `cli-adapter/`. The module sits below the cli-adapter in the dependency graph (`_dispatch.ts` imports from `binary-resolver`, never the other way around). Single-file `<module>.ts` + `<module>.test.ts` shape — no `index.ts` indirection because the module exposes a single function and a small accompanying type. This matches the project's convention for single-purpose modules where the post-011 `index.ts`-as-registration pattern doesn't apply (there's nothing to register).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify. All five principles satisfied per the Constitution Check table above. No `N` entries; no Complexity Tracking entries needed.
