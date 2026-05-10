---
description: "Task list for 017-cross-platform-support — extract binary resolution into src/binary-resolver/ and lift Windows-only restriction to macOS + Linux hosts"
---

# Tasks: Cross-Platform Binary Resolution (017)

**Input**: Design documents from `/specs/017-cross-platform-support/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED — Constitution Principle II is non-negotiable. Every public surface ships with at least one happy-path + one failure-or-boundary co-located vitest test in the same change. Test counts here match the data-model.md inventory (~30 cases for the new resolver + 4-5 case edits in existing files).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Within each story, tests are authored before implementation per Constitution / TDD discipline. The `src/binary-resolver/binary-resolver.ts` file is touched by multiple stories sequentially (single shared file as the resolver grows from OBSIDIAN_BIN-only → darwin → linux → win32 → error-shape refinement); each story's tasks add only its slice of behaviour.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no incomplete dependencies — can run in parallel
- **[Story]**: Maps task to a spec.md user story (US1..US7); REQUIRED for Phases 3-9; absent for Phases 1, 2, 10
- File paths in every task per CONTRIBUTING.md

## Path Conventions

- **Single-project layout** per Constitution Principle I + the project's existing tree
- Source: `src/<module>/<file>.ts`
- Co-located tests: `src/<module>/<file>.test.ts`
- Docs: `README.md` (no per-tool docs change in this BI)
- All paths shown are relative to repo root `c:/Github/obsidian-cli-mcp/`

---

## Phase 1: Setup

**Purpose**: Sanity-check that all design inputs are in place. No project initialization needed — the repo, tooling, and dependency tree all already exist.

- [X] T001 Verify [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md), and the two files under [contracts/](contracts/) (`binary-resolver.contract.md`, `cli-adapter-integration.contract.md`) all exist and are readable. Confirm no `[NEEDS CLARIFICATION]` markers remain in spec.md (per [checklists/requirements.md](checklists/requirements.md) PASS — 13/13 first-iteration). Verify the spec's two clarifications session entries (Q1 PATH-deferral, Q2 `fs.access(X_OK)` predicate) are present in spec.md's `## Clarifications` section.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: New resolver module + types + OBSIDIAN_BIN branch (platform-independent) + dispatch-layer integration scaffolding. Every user story (Phases 3-9) depends on these.

**⚠️ CRITICAL**: No user story work begins until this phase is complete. Within Phase 2, T002 → T003 → T004 → T005 sequentially (T002 sets up the test file; T003 adds OBSIDIAN_BIN cases to it; T004 implements the resolver shell; T005 wires the dispatch integration).

- [X] T002 Author [src/binary-resolver/binary-resolver.test.ts](../../src/binary-resolver/binary-resolver.test.ts) scaffolding. (a) Header comment policy per the project's existing test-file convention: grep existing co-located test files (e.g., `src/cli-adapter/_dispatch.test.ts`, `src/tools/write_note/handler.test.ts`) — if those files carry the `// Original — no upstream.` header, add it to the new file with the description `Cross-platform binary resolver — happy + failure tests per FR-001..FR-020.`; if existing test files omit the header (Constitution V's "modules without ANY header" rule applies to source modules; tests are conventionally derivative), omit it here too. The implementer's grep-then-decide step makes this convention-honest rather than over-applying Constitution V. (b) Imports: `vitest` (`describe`, `it`, `expect`, `vi`), `node:fs/promises` constants (`X_OK`), the (yet-to-exist) `resolveBinary` + `BinaryResolverDeps` + `ResolutionAttempt` from `./binary-resolver.js`. (c) Helper builder `createDeps(overrides: Partial<BinaryResolverDeps>): BinaryResolverDeps` that returns sane defaults (`env: {}`, `platform: "linux"`, `homedir: () => "/home/test"`, `access: vi.fn().mockResolvedValue(undefined)`) merged with overrides. (d) Helper `errno(code: string): NodeJS.ErrnoException` that builds an Object.assign'd `Error` with the given `code` field. (e) Group 6 invariant cases (4 cases per data-model.md): (1) `attempts` array is non-empty in every code path; (2) `attempts` is in resolution-order — OBSIDIAN_BIN (if set) first, platform-default (if applicable) next, PATH last; (3) two consecutive `resolveBinary` calls with the same deps both fire `access` — no caching (FR-009); (4) the resolver doesn't read `process.env` / `process.platform` directly — only via injected `deps` (asserted via `process.env = {}` and `deps.env = {OBSIDIAN_BIN: "/x"}`).

- [X] T003 Add Group 1 OBSIDIAN_BIN-branch cases (7 cases per data-model.md) to [src/binary-resolver/binary-resolver.test.ts](../../src/binary-resolver/binary-resolver.test.ts). (1) `OBSIDIAN_BIN` set + `access` resolves → `{path: env.OBSIDIAN_BIN, attempts: [{OBSIDIAN_BIN, /x, resolved}]}` regardless of platform. (2) `OBSIDIAN_BIN` set + `access` rejects ENOENT → throws `CLI_BINARY_NOT_FOUND`; `attempts[0].outcome === "not-found"`; no platform-default or PATH attempt recorded (FR-008). (3) `OBSIDIAN_BIN` set + `access` rejects EACCES → throws; `attempts[0].outcome === "found-but-not-executable"` (FR-020). (4) `OBSIDIAN_BIN` set + `access` rejects EPERM → same as case 3. (5) `OBSIDIAN_BIN` set + `access` rejects with non-`NodeJS.ErrnoException` → same as case 3 (defensive). (6) `OBSIDIAN_BIN` set to empty string → treated as "unset"; falls through to platform-default branch. (7) Cases 1-5 parametrised over `platform: ["darwin", "linux", "win32"]` via `it.each` to confirm platform-independence (FR-008 "exact-path attempt" rule).

- [X] T004 Implement [src/binary-resolver/binary-resolver.ts](../../src/binary-resolver/binary-resolver.ts) with types + OBSIDIAN_BIN branch + scaffolding for the platform-default and PATH branches. (a) Header per Constitution V (`// Original — no upstream. Three-tier binary resolver per FR-001..FR-008.`). (b) Export interfaces: `BinaryResolverDeps`, `BinaryResolverResult`, `ResolutionAttempt` per [contracts/binary-resolver.contract.md](contracts/binary-resolver.contract.md). (c) Export `resolveBinary(deps: BinaryResolverDeps): Promise<BinaryResolverResult>`. (d) OBSIDIAN_BIN branch (FR-001 / FR-008 / FR-020): when `deps.env.OBSIDIAN_BIN` is non-empty, call `await deps.access(deps.env.OBSIDIAN_BIN, fs.constants.X_OK)`; on success, return `{path: env.OBSIDIAN_BIN, attempts: [{source: "OBSIDIAN_BIN", path: env.OBSIDIAN_BIN, outcome: "resolved"}]}`; on failure, throw `UpstreamError({code: "CLI_BINARY_NOT_FOUND", cause: err, details: {platform, attempts: [{OBSIDIAN_BIN, env.OBSIDIAN_BIN, outcome}], PATH: env.PATH}})` where `outcome` is `"not-found"` if `err.code === "ENOENT"` else `"found-but-not-executable"`. (e) Stub the platform-default and PATH branches with a temporary `return {path: "obsidian", attempts: [{source: "PATH", path: "obsidian", outcome: "pending"}]}` — covers Phase-2 invariants but will be extended by Phase 3-6. (f) Import `fs.constants` from `node:fs` (default export's `constants` namespace) for the `X_OK` value when binding production defaults — but the resolver itself receives `mode: number` from the dispatch layer. T002+T003 cases all pass after this implementation.

- [X] T005 Wire dispatch-layer integration in [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts) per [contracts/cli-adapter-integration.contract.md](contracts/cli-adapter-integration.contract.md). (a) Add imports: `import { resolveBinary, type ResolutionAttempt } from "../binary-resolver/binary-resolver.js";`, `import * as fsPromises from "node:fs/promises";`, `import * as os from "node:os";`. (b) Replace line 60-62 area: change `const binary = env.OBSIDIAN_BIN ?? "obsidian";` to `const resolved = await resolveBinary({env, platform: process.platform, homedir: os.homedir, access: fsPromises.access}); const binary = resolved.path;`. (c) Add private helper `function settlePathAttempt(attempts: ResolutionAttempt[], outcome: "resolved" | "not-found"): ResolutionAttempt[]` per the contract — flips trailing `pending` PATH attempt's outcome. (d) Update both ENOENT throw sites (line 84-91 and line 163-170) to use the new error envelope: `details: {platform: process.platform, attempts: settlePathAttempt(resolved.attempts, "not-found"), PATH: env.PATH}`. (e) Update [src/cli-adapter/_dispatch.test.ts](../../src/cli-adapter/_dispatch.test.ts) lines 185-204 to consume new shape: rename test cases, replace `toMatchObject({binaryAttempted: "obsidian", PATH: "/x"})` with `toMatchObject({platform: expect.any(String), attempts: expect.any(Array), PATH: "/x"})` plus a follow-on `expect(err.details.attempts.at(-1)).toEqual({source: "PATH", path: "obsidian", outcome: "not-found"})`. (f) Add 2 NEW cases to `_dispatch.test.ts`: (i) `"OBSIDIAN_BIN set and not executable → resolveBinary throws → CLI_BINARY_NOT_FOUND propagates"` — set env.OBSIDIAN_BIN, mock fsPromises.access to reject (using `vi.spyOn(fsPromises, "access")`); confirm dispatchCli rejects with the structured error untouched. (ii) `"resolver returns successfully → spawn proceeds with the resolved binary"` — happy-path; assert `spawnFn` is called with the resolved path (e.g., `"obsidian"`) as `argv[0]`. T002+T003 plus the new and re-targeted dispatch tests all pass after this.

**Checkpoint**: Foundation ready — `src/binary-resolver/` module exists with the OBSIDIAN_BIN branch fully implemented + tested; dispatch-layer integration is wired; existing `_dispatch.test.ts` cases re-targeted to new shape. The platform-default branches are stubbed (return PATH-pending unconditionally) — Phases 3-6 build them out per-story.

---

## Phase 3: User Story 1 — macOS users can install and use the bridge (Priority: P1) 🎯 MVP

**Goal**: A developer on a recent macOS host (Sonoma+) can `npx -y @marwansaab/obsidian-cli-mcp` against a clean install where `/usr/local/bin/obsidian` exists, see the bridge boot, and have a basic `obsidian_exec` `version` call return Obsidian's running version on stdout.

**Independent Test**: Inject `platform: "darwin"`, `OBSIDIAN_BIN: undefined`, `access: vi.fn().mockResolvedValue(undefined)` against the resolver; assert `result.path === "/usr/local/bin/obsidian"` and `attempts === [{source: "platform-default", path: "/usr/local/bin/obsidian", outcome: "resolved"}]`. Map: quickstart S-1 + S-4.

### Tests for User Story 1 ⚠️

- [X] T006 [US1] Add Group 2 darwin platform-default cases (4 cases per data-model.md — case 5 is US7's symlink case) to [src/binary-resolver/binary-resolver.test.ts](../../src/binary-resolver/binary-resolver.test.ts). (1) darwin + `OBSIDIAN_BIN` unset + `access("/usr/local/bin/obsidian")` resolves → `{path: "/usr/local/bin/obsidian", attempts: [{platform-default, /usr/local/bin/obsidian, resolved}]}`; ALSO assert `accessSpy.mock.calls.length === 1` to lock the "PATH-not-consulted-when-platform-default-wins" edge case (from spec Edge Cases bullet "PATH includes the platform-default location"). (2) darwin + `OBSIDIAN_BIN` unset + `access` rejects ENOENT → falls through; result is `{path: "obsidian", attempts: [{platform-default, /usr/local/bin/obsidian, "not-found"}, {PATH, "obsidian", "pending"}]}`. (3) darwin + `OBSIDIAN_BIN` unset + `access` rejects EACCES → falls through; `attempts[0].outcome === "found-but-not-executable"` then PATH attempt pending. (4) darwin + `OBSIDIAN_BIN` set to `/foo` + `access("/foo")` resolves → OBSIDIAN_BIN wins; platform-default not consulted (assert `access` called with `/foo` only, not with `/usr/local/bin/obsidian`).

### Implementation for User Story 1

- [X] T007 [US1] Extend [src/binary-resolver/binary-resolver.ts](../../src/binary-resolver/binary-resolver.ts) with the platform-default branch for darwin per [contracts/binary-resolver.contract.md](contracts/binary-resolver.contract.md). (a) Add internal `function computePlatformDefault(platform: NodeJS.Platform, homedir: () => string): string | null` — returns `"/usr/local/bin/obsidian"` for `"darwin"`, `null` for everything else (linux + win32 stay null in this task; Phase 4 + 5 extend). (b) After the OBSIDIAN_BIN branch (when `env.OBSIDIAN_BIN` is unset), call `computePlatformDefault(deps.platform, deps.homedir)`; if non-null, attempt `await deps.access(platformDefaultPath, fs.constants.X_OK)`; on success, return resolved; on failure, push the failed attempt to `attempts` and continue to the PATH branch (replacing the temporary stub from T004 (e)). (c) PATH branch: push `{source: "PATH", path: "obsidian", outcome: "pending"}` to `attempts` and return `{path: "obsidian", attempts}`. T006 cases all pass after this.

**Checkpoint**: US1 functional — macOS resolver branch fully covered. quickstart S-1 + S-4 + invariants all green.

---

## Phase 4: User Story 2 — Linux users can install and use the bridge (Priority: P1)

**Goal**: A developer on a recent Linux host (Ubuntu 22.04+) can `npx -y @marwansaab/obsidian-cli-mcp` against a clean install where `~/.local/bin/obsidian` exists, see the bridge boot, and have a basic `obsidian_exec` `version` call return Obsidian's running version.

**Independent Test**: Inject `platform: "linux"`, `homedir: () => "/home/test"`, `OBSIDIAN_BIN: undefined`, `access: vi.fn().mockResolvedValue(undefined)`; assert `result.path === "/home/test/.local/bin/obsidian"` and `attempts === [{source: "platform-default", path: "/home/test/.local/bin/obsidian", outcome: "resolved"}]`. Map: quickstart S-2.

### Tests for User Story 2 ⚠️

- [X] T008 [US2] Add Group 3 linux platform-default cases (5 cases per data-model.md) to [src/binary-resolver/binary-resolver.test.ts](../../src/binary-resolver/binary-resolver.test.ts). (1) linux + `OBSIDIAN_BIN` unset + `homedir()` returns `/home/u` + `access("/home/u/.local/bin/obsidian")` resolves → `{path: "/home/u/.local/bin/obsidian", attempts: [{platform-default, /home/u/.local/bin/obsidian, resolved}]}`. (2) linux + `OBSIDIAN_BIN` unset + `access` rejects ENOENT → falls through; PATH attempt pending. (3) linux + `OBSIDIAN_BIN` unset + `access` rejects EACCES → falls through; outcome label `"found-but-not-executable"`. (4) linux + `homedir()` returns `/root` (root-user case) → `path === "/root/.local/bin/obsidian"`. (5) linux WSL guest case (FR-016): `process.platform === "linux"` per spec; behaviour identical to native Linux — assert via the same parametrised case as (1) but documented in the case name as covering WSL.

### Implementation for User Story 2

- [X] T009 [US2] Extend [src/binary-resolver/binary-resolver.ts](../../src/binary-resolver/binary-resolver.ts) with the linux platform-default branch. Generalise `computePlatformDefault` from T007: add `if (platform === "linux") return path.join(homedir(), ".local/bin/obsidian");`. Import `path` from `node:path`. T008 cases all pass after this. T006/T007 darwin cases continue passing.

**Checkpoint**: US2 functional — Linux resolver branch fully covered. quickstart S-2 + invariants all green.

---

## Phase 5: User Story 3 — Existing Windows behaviour is preserved (Priority: P1)

**Goal**: A Windows user upgrading from v0.3.0 sees byte-for-byte identical behaviour. The resolver returns `"obsidian"` immediately when `OBSIDIAN_BIN` is unset on win32; no `fs.access` syscall fires; the spawn continues to defer to the OS for `PATH` lookup.

**Independent Test**: Inject `platform: "win32"`, `OBSIDIAN_BIN: undefined`, `access: vi.fn()`; assert `result.path === "obsidian"`, `attempts === [{source: "PATH", path: "obsidian", outcome: "pending"}]`, AND `accessSpy.mock.calls.length === 0`. Map: quickstart S-3.

### Tests for User Story 3 ⚠️

- [X] T010 [US3] Add Group 4 win32 platform-skip cases (4 cases per data-model.md) to [src/binary-resolver/binary-resolver.test.ts](../../src/binary-resolver/binary-resolver.test.ts). (1) win32 + `OBSIDIAN_BIN` unset → no platform-default attempt; `attempts === [{PATH, "obsidian", "pending"}]` (FR-005). (2) win32 + `OBSIDIAN_BIN` set + `access` resolves → `path === env.OBSIDIAN_BIN`; `attempts === [{OBSIDIAN_BIN, .., resolved}]`. Identical to other platforms (R11). (3) win32 + `access` is NOT called when `OBSIDIAN_BIN` is unset → assert via `accessSpy.mock.calls.length === 0` (FR-005 byte-for-byte: no platform-default `fs.access` syscall on Windows). (4) Non-darwin/linux/win32 platforms (parametrised over `["freebsd", "openbsd", "sunos", "aix"]` via `it.each`) → behave like win32 per F4 generalisation; no platform-default attempt.

### Implementation for User Story 3

- [X] T011 [US3] Extend [src/binary-resolver/binary-resolver.ts](../../src/binary-resolver/binary-resolver.ts) — confirm `computePlatformDefault` returns `null` for `"win32"` and any non-`"darwin"`/non-`"linux"` platform (no code change expected if T007/T009 followed the contract — the function already returns `null` for those values via the implicit fall-through). Verify the resolver's behaviour: when `OBSIDIAN_BIN` is unset AND `computePlatformDefault` returns `null`, the resolver immediately pushes the PATH-pending attempt and returns — no `fs.access` syscall fires. Add a 1-line code comment citing R11 + F4 explaining the design decision (no Windows pre-check; no platform-default for FreeBSD/etc.). T010 cases all pass after this.

**Checkpoint**: US3 functional — Windows behaviour byte-for-byte preserved; non-darwin/linux platforms gracefully skip platform-default. quickstart S-3 + invariants all green.

---

## Phase 6: User Story 4 — Missing-binary failure is debuggable (Priority: P1)

**Goal**: A structured `CLI_BINARY_NOT_FOUND` error includes platform name, ordered attempts list with source labels (`"OBSIDIAN_BIN"`/`"platform-default"`/`"PATH"`), per-path outcome labels (`"not-found"`/`"found-but-not-executable"`), and the verbatim `PATH` env var. Sufficient for the user to fix the install without source-code consultation.

**Independent Test**: Inject `platform: "linux"`, `homedir: () => "/h"`, `env: {PATH: "/usr/bin:/bin"}`, `access: vi.fn().mockRejectedValue(errno("ENOENT"))`; force OS spawn to ENOENT (test seam in `_dispatch.test.ts`); assert `err.details.platform === "linux"`, `err.details.PATH === "/usr/bin:/bin"`, `err.details.attempts.length === 2` with the trailing `{source: "PATH", path: "obsidian", outcome: "not-found"}`. Map: quickstart S-5, S-6, S-7, S-8.

### Tests for User Story 4 ⚠️

- [X] T012 [US4] Add Group 5 multi-branch error-shape cases (5 cases per data-model.md) to [src/binary-resolver/binary-resolver.test.ts](../../src/binary-resolver/binary-resolver.test.ts). (1) linux + OBSIDIAN_BIN set + access rejects → throws; `attempts.length === 1`; `attempts[0].source === "OBSIDIAN_BIN"`. (2) linux + OBSIDIAN_BIN unset + platform-default access rejects → resolver returns successfully (no throw at resolver layer); `attempts` contains both the failed platform-default and the pending PATH. (3) `_dispatch.test.ts` integration: dispatch-layer's `settlePathAttempt` correctly mutates the trailing PATH attempt to `outcome: "not-found"` for the structured error (covered in `_dispatch.test.ts` test added in T005 (f) (i)). (4) `details.platform` matches `deps.platform` verbatim (parametrised). (5) `details.PATH` is `env.PATH` verbatim, including `undefined` when env.PATH is unset (assert `err.details.PATH === undefined`).

### Implementation for User Story 4

- [X] T013 [US4] Refine [src/binary-resolver/binary-resolver.ts](../../src/binary-resolver/binary-resolver.ts) error-throwing path to ensure exact FR-004 envelope shape. (a) Confirm the OBSIDIAN_BIN-failure throw site builds `details: {platform, attempts, PATH}` exactly — no legacy fields, no extras. (b) Confirm `outcome` labels follow the exact mapping: `err.code === "ENOENT"` → `"not-found"`; any other ErrnoException → `"found-but-not-executable"`; non-ErrnoException rejection → `"found-but-not-executable"` (defensive). (c) The outcome-decision logic is shared by the OBSIDIAN_BIN-failure path (T004) and the platform-default-failure path (T007 / T009) — implement it once inline at each call site (the predicate is one ternary expression); do NOT extract a named helper unless the test suite or the contract calls for it. Keeping the logic inline avoids growing the resolver's public-symbol surface beyond the contract's named exports. T012 cases all pass after this.

**Checkpoint**: US4 functional — structured-error shape locked across all failure paths; per-path outcome labels distinguish "wrong path" from "permission issue". quickstart S-5 / S-6 / S-7 / S-8 all green.

---

## Phase 7: User Story 5 — Typed tools inherit cross-platform support automatically (Priority: P1)

**Goal**: Every typed tool that dispatches a CLI call inherits the cross-platform binary resolution without per-tool plumbing. New typed tools added later inherit by virtue of routing through `dispatchCli`.

**Independent Test**: Run the existing test suites for all typed tools (`obsidian_exec`, `read_note`, `read_heading`, `read_property`, `find_by_property`, `delete_note`, `write_note`, `help`, `vault-registry`); assert every previously-passing test still passes. The single test file with hard-coded `details.binaryAttempted` (`obsidian_exec/handler.test.ts:111-122`) is updated; all other tools' CLI_BINARY_NOT_FOUND assertions only check `err.code` and pass unchanged. Map: quickstart S-9 + the per-tool verification matrix in data-model.md.

### Tests for User Story 5 ⚠️

- [X] T014 [US5] Update [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) line 111-122 case to consume new `details` shape. Replace `expect(err.details.binaryAttempted).toBe("obsidian")` with `expect(err.details.attempts.find((a: any) => a.source === "PATH")?.path).toBe("obsidian")` (and add `expect(err.details.platform).toBeOneOf(["darwin", "linux", "win32"])` for completeness). The case name MAY be updated to `"CLI_BINARY_NOT_FOUND integration: ENOENT-on-spawn surfaces with platform/attempts/PATH"` to reflect the new shape, OR kept as-is (case name is not load-bearing).

### Implementation for User Story 5

- [X] T015 [US5] Run `npm run test` (i.e., `vitest run --coverage`) and verify all currently-existing tool test files pass without edit: [src/tools/read_note/handler.test.ts](../../src/tools/read_note/handler.test.ts) (line 188-197 `code`-only assertion), [src/tools/read_heading/index.test.ts](../../src/tools/read_heading/index.test.ts) (line 145), [src/tools/read_property/handler.test.ts](../../src/tools/read_property/handler.test.ts) (line 392-405), [src/tools/read_property/index.test.ts](../../src/tools/read_property/index.test.ts) (line 123), [src/tools/find_by_property/handler.test.ts](../../src/tools/find_by_property/handler.test.ts) (line 320-333), [src/tools/find_by_property/index.test.ts](../../src/tools/find_by_property/index.test.ts) (line 133), [src/tools/delete_note/handler.test.ts](../../src/tools/delete_note/handler.test.ts) (line 180-191), [src/tools/delete_note/index.test.ts](../../src/tools/delete_note/index.test.ts) (line 123), [src/vault-registry/registry.test.ts](../../src/vault-registry/registry.test.ts) (line 65-68). Confirm zero edits required. The `_register.test.ts` consolidated drift detector also passes unchanged (no new tool registration). This task is pass/fail — if any test that was green on `main` fails after the BI's changes, treat it as a regression and surface to the user before declaring US5 complete.

**Checkpoint**: US5 functional — all eight typed tools' tests green; FR-006's "no per-tool plumbing" claim verified empirically. quickstart S-9 green.

---

## Phase 8: User Story 6 — Documentation reflects all supported platforms (Priority: P2)

**Goal**: README's Installation section gains macOS and Linux subsections; the existing Windows subsection is preserved unchanged. README's opening paragraph + Prerequisites and `package.json`'s `description` field are bumped to tri-platform framing. The `help` tool's per-tool documentation is unchanged across platforms.

**Independent Test**: Read the updated README; verify (a) the macOS and Linux subsections exist with install steps, Claude Desktop config path, OBSIDIAN_BIN override examples, and any platform-specific gotchas; (b) the Windows subsection content is preserved unchanged (diff-check the lines); (c) `help({tool_name: "obsidian_exec"})` output is byte-identical regardless of host platform. Map: quickstart M-5.

### Implementation for User Story 6

- [X] T016 [P] [US6] Update [README.md](../../README.md) opening paragraph (line 3) to drop the "minimal Windows-host MCP server" framing in favour of a tri-platform framing — e.g., "A minimal MCP server that bridges any MCP client (running locally or in a sandboxed container like Claude Cowork's Linux environment) to the Obsidian Integrated CLI binary on the operator's macOS, Linux, or Windows desktop. ...". Preserve the existing tool list (eight tools) and the v0.3.0 version reference unchanged.

- [X] T017 [P] [US6] Update [README.md](../../README.md) Installation > Prerequisites (line 22) to replace "Windows 10 / 11 host. macOS and Linux are out of scope for the 0.x release line" with a tri-platform list: Windows 10/11, macOS Sonoma+ (or recent versions), Linux Ubuntu 22.04+ (or equivalent — Debian, Fedora, Arch). Update the "Obsidian Integrated CLI binary discoverable on PATH" bullet to add a per-platform note: "Verify from a fresh shell prompt: `obsidian version`. If `obsidian` isn't on PATH, set `OBSIDIAN_BIN` in your MCP-client configuration to the absolute path. The bridge auto-detects the platform-default install location: macOS `/usr/local/bin/obsidian`, Linux `~/.local/bin/obsidian`, Windows defers to PATH."

- [X] T018 [US6] Add macOS and Linux Installation subsections to [README.md](../../README.md) AFTER the existing Windows subsection (preserving Windows content unchanged per FR-012). For macOS: install via `npm install -g @marwansaab/obsidian-cli-mcp` or `npx -y @marwansaab/obsidian-cli-mcp`; verify boot via `npx -y @marwansaab/obsidian-cli-mcp` (Press Ctrl+C exit); show the Claude Desktop config path `~/Library/Application Support/Claude/claude_desktop_config.json`; provide the JSON snippet with the optional `OBSIDIAN_BIN` override pointing at `/Applications/Obsidian.app/Contents/Resources/.../obsidian` for non-default installs. Note Gatekeeper first-run behaviour (may surface a prompt; subsequent calls succeed). For Linux: same install + boot-verification; show the Claude Desktop config path (typically `~/.config/Claude/claude_desktop_config.json` or equivalent — defer to client docs); document `~/.local/bin` PATH gotcha (some distros don't include it on default `PATH`; user adds `export PATH="$HOME/.local/bin:$PATH"` to `~/.bashrc` / `~/.zshrc`). Mention `OBSIDIAN_BIN` override for non-default install locations (`/opt/obsidian`, `~/bin`, `/snap/bin/obsidian`). For both: WSL Linux guests with Obsidian installed inside WSL are treated as native Linux; WSL guests with Obsidian on the Windows host are explicitly out of scope (see FR-016). ALSO update the `## MCP-client configuration > Claude Cowork (sandboxed Linux container) → Windows host` subsection's framing — the bridge can now run on macOS or Linux hosts as well as Windows; update the subsection title to `Claude Cowork (sandboxed container) → desktop host` (drop "Linux" + "Windows" from title) and rephrase the body's "the Windows obsidian binary" / "Run the bridge on the Windows host" wording to "the host Obsidian binary" / "Run the bridge on the operator's desktop host (Windows, macOS, or Linux)". The architectural point of the section (Cowork-side runtime is unchanged; bridge runs on the desktop, not in the container) is preserved.

- [X] T019 [P] [US6] Update [package.json](../../package.json) `description` field from `"Windows-host MCP server bridging MCP clients to the Obsidian Integrated CLI binary..."` to `"Cross-platform MCP server bridging MCP clients to the Obsidian Integrated CLI binary on macOS, Linux, and Windows hosts..."` (preserve the rest of the description text — the eight-tool roster + ADR-009 citation — unchanged).

**Checkpoint**: US6 functional — README and package.json identity bumps complete; help-tool output untouched (no per-tool docs edits in scope). quickstart M-5 ready for manual run on each platform.

---

## Phase 9: User Story 7 — Symbolic-link install paths resolve correctly (Priority: P3)

**Goal**: When the platform-default path is a symlink (Homebrew variant, custom install symlink), the resolver follows the symlink and the spawn invokes the resolved target binary. No `EISLNK` / `EACCES` / `ENOENT` from the resolver itself.

**Independent Test**: Stub `access` to resolve regardless of whether the path is a regular file or symlink; assert the resolver returns the platform-default path verbatim — the OS spawn will dereference at execution time per R9 / FR-007. Map: quickstart M-7 (manual on macOS/Linux).

### Tests for User Story 7 ⚠️

- [X] T020 [US7] Add the darwin symlink case (Group 2 case 5 per data-model.md) to [src/binary-resolver/binary-resolver.test.ts](../../src/binary-resolver/binary-resolver.test.ts). The test stubs `access: vi.fn().mockResolvedValue(undefined)` (success regardless of file kind — the kernel's `access(X_OK)` succeeds for symlinks pointing at executable targets) and asserts `result.path === "/usr/local/bin/obsidian"` (the symlink path verbatim, NOT the dereferenced target). The test name should call out the design decision per R9: "darwin + symlink at platform-default returns the platform-default path verbatim; OS spawn dereferences at execution time (R9 / FR-007)." NO source-file edit required for this task — the existing implementation from T007 already returns the path verbatim; this task adds the test that documents and locks the behaviour. Optional: add a 1-line comment in `binary-resolver.ts` near the platform-default access call citing R9 ("Symlinks transparently dereferenced by `fs.access(X_OK)` and the OS spawn — no `fs.realpath` call needed.").

**Checkpoint**: US7 functional (passively verified via existing implementation). quickstart M-7 ready for manual run.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Quality-gate runs, CHANGELOG, version bump decision. No behavioural changes; pure release-readiness.

- [X] T021 [P] Run `npm run lint` from repo root. Confirm zero warnings on the new and modified files: `src/binary-resolver/binary-resolver.ts`, `src/binary-resolver/binary-resolver.test.ts`, `src/cli-adapter/_dispatch.ts`, `src/cli-adapter/_dispatch.test.ts`, `src/tools/obsidian_exec/handler.test.ts`. Address any violations before declaring T021 complete.

- [X] T022 [P] Run `npm run typecheck` (i.e., `tsc --noEmit`) from repo root. Confirm zero errors on the full project, especially the new `BinaryResolverDeps` / `BinaryResolverResult` / `ResolutionAttempt` types and the `settlePathAttempt` helper in `_dispatch.ts`.

- [X] T023 Run `npm run test` (i.e., `vitest run --coverage`) from repo root. Confirm: (a) all ~30 new resolver test cases pass; (b) the 3 re-targeted + 2 new dispatch test cases pass; (c) the 1 re-targeted obsidian_exec test case passes; (d) all other test files pass without edit (per T015 verification); (e) coverage threshold from `vitest.config.ts` `test.coverage.thresholds.statements` is met (per Constitution Development Workflow gate 5). If statements coverage drops, decide whether to ratchet the threshold down (one-line edit; add justification to the BI's commit body) or add coverage. Sequential — depends on T021 + T022.

- [X] T024 [P] Run `npm run build` from repo root. Confirm `dist/` builds cleanly with no errors and the new `dist/binary-resolver/` subdirectory contains the compiled `binary-resolver.js` + type declarations. Verify the `bin` entry (`dist/index.js`) is functional via `node dist/index.js` (should boot the MCP server; Ctrl+C should produce the bridge.shutdown JSON line on stderr).

- [X] T025 Update [CHANGELOG.md](../../CHANGELOG.md) with the BI's user-visible changes. Sections: (a) Added: macOS support (`/usr/local/bin/obsidian` platform-default), Linux support (`~/.local/bin/obsidian` platform-default with documented `PATH` setup); (b) Changed: `CLI_BINARY_NOT_FOUND` UpstreamError `details` shape — `binaryAttempted` field replaced with structured `attempts: ResolutionAttempt[]` array, `platform` field added, `PATH` field preserved; (c) Internal: new `src/binary-resolver/` module owning the three-tier resolution algorithm (override → platform-default → PATH). Cite spec-id 017-cross-platform-support, FR-001..FR-020, and SC-001..SC-010.

- [X] T026 Decide version bump in [package.json](../../package.json) `version` field. PATCH bump (`0.3.0 → 0.3.1`) is the honest signal: this BI is purely additive (new platform support) and the `details`-shape change is internal diagnostic, not a contractual surface. MINOR bump (`0.3.0 → 0.4.0`) is also defensible if treating "macOS + Linux support" as a public-surface expansion. Surface the decision to the user with both options and the rationale; default recommendation is MINOR ("0.4.0") because the package's external-facing identity bumps from "Windows-host" to tri-platform. Update `package.json` `version` field per the user's selection.

**Checkpoint**: Release-ready. All quality gates pass; CHANGELOG records user-visible changes; version bump applied. Manual quickstart scenarios M-1..M-8 (per [quickstart.md](quickstart.md)) deferred to per-platform release validation by the maintainer.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories.
- **User Stories (Phases 3–9)**: All depend on Foundational. Phases 3 (US1) and 4 (US2) are independent and CAN run in parallel within the resolver source file BUT each adds to `binary-resolver.ts` sequentially — practical parallelism applies to the test-side work only. Phase 5 (US3) is independent of 3/4 (it's a no-code-change in the resolver's algorithm; just a test plus a comment). Phase 6 (US4) is structural and can land before or after 3/4/5. Phase 7 (US5) integrates with 3-6 — needs the resolver wired through dispatch; can land after Phase 2 if existing-test verification is the only goal. Phase 8 (US6) is documentation-only — independent of all source phases. Phase 9 (US7) is purely a test addition; can land after Phase 3 (US1's darwin branch).
- **Polish (Phase 10)**: Depends on all user stories complete.

### User Story Dependencies

- **US1 (P1)**: After Phase 2.
- **US2 (P1)**: After Phase 2. Independent of US1 (different platform branch in `computePlatformDefault`).
- **US3 (P1)**: After Phase 2. Independent of US1 / US2 (test-only + comment; no algorithmic change).
- **US4 (P1)**: After Phase 2. Builds on the OBSIDIAN_BIN-failure throw shape from T004; refines it. Independent of US1 / US2 / US3.
- **US5 (P1)**: After Phase 2 (specifically T005 dispatch integration). Needs the dispatch wiring to be in place; the `obsidian_exec` test edit (T014) is independent. T015 verification depends on all relevant tool changes being in place.
- **US6 (P2)**: Can start anytime after Phase 1 (independent of source code).
- **US7 (P3)**: After Phase 3 (needs T007's darwin platform-default branch in place).

### Within Each User Story

- Tests authored before implementation per Constitution Principle II.
- Source-file additions are append-only — earlier story's additions remain when later stories add their slice.
- Each story checkpoint validates by running `vitest run` against the new test file plus the modified existing test files.

### Parallel Opportunities

- T002 + T003 + T004 + T005 in Phase 2 are sequential (same file or downstream dependency).
- T016 + T017 + T019 (Phase 8) — different files (README.md edit vs. package.json edit), can run in parallel. T018 also touches README.md so depends on T016+T017 ordering.
- T021 + T022 + T024 in Phase 10 — different toolchain commands, can run in parallel.

### Cross-cutting

- The single resolver source file `src/binary-resolver/binary-resolver.ts` is touched by T004 (foundational), T007 (US1), T009 (US2), T011 (US3), T013 (US4). Sequential within story; not parallelisable within the source.
- The single test file `src/binary-resolver/binary-resolver.test.ts` is touched by T002, T003, T006, T008, T010, T012, T020. Sequential within story.

---

## Parallel Example: Phase 8 (Documentation)

```bash
# These three documentation tasks touch different files and can run concurrently:
Task: "T016 [P] [US6] Update README.md opening paragraph (line 3) to tri-platform framing"
Task: "T019 [P] [US6] Update package.json description field to tri-platform"
Task: "T017 [P] [US6] Update README.md Installation > Prerequisites to tri-platform list"
# T018 (add macOS + Linux subsections) depends on T016+T017 because all three touch README.md;
# T018 runs after the parallel batch.
```

## Parallel Example: Phase 10 (Quality Gates)

```bash
# Three independent toolchain commands; can run concurrently:
Task: "T021 [P] Run npm run lint"
Task: "T022 [P] Run npm run typecheck"
Task: "T024 [P] Run npm run build"
# T023 (npm run test) depends on T021+T022 passing first.
```

---

## Implementation Strategy

### MVP First (US1 — macOS platform-default; partial Linux + Windows via PATH)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — macOS platform-default branch
4. **STOP and VALIDATE**: Run `vitest run` — confirm S-1, S-4, plus all foundational invariants pass. The bridge now resolves macOS installs correctly via the platform-default branch. Linux and Windows users get partial coverage: the new dispatch integration (T005) routes through `resolveBinary`, which on Linux + Windows falls through to the OS spawn against `PATH` — exactly the v0.3.0 behaviour for Windows users on PATH, and unchanged for Linux users who already have `~/.local/bin` on `PATH` or who set `OBSIDIAN_BIN`.
5. Optional ship at this state: macOS users gain the bridge for the first time; Linux users with `PATH` set up gain it for the first time too (because the resolver now correctly delegates to OS spawn, which they could already use); Windows users see no behaviour change. Phase 4 (US2) adds Linux's platform-default-without-PATH-setup convenience; Phase 5 (US3) explicitly locks the Windows non-regression with tests; Phase 6 (US4) ships the enriched diagnostic envelope.

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready.
2. Phase 3 (US1 macOS) → MVP ship-ready. Test independently. Demo / dogfood.
3. Phase 4 (US2 Linux) → Linux platform-default added. Test independently.
4. Phase 5 (US3 Windows preservation) → Windows non-regression locked.
5. Phase 6 (US4 debuggable failure) → Error-shape upgrade.
6. Phase 7 (US5 typed-tool inheritance) → Verification only; no new functionality.
7. Phase 8 (US6 docs) → README + package.json bumps. SHIPPABLE-WITH-DOCS state.
8. Phase 9 (US7 symlink) → Test addition + design-decision comment.
9. Phase 10 (Polish) → Quality gates + CHANGELOG + version bump.

### Single-Developer Strategy

Linear walk through the phases is the right shape — the BI is a single-module addition with high cohesion. Parallel work splits between source phases and Phase 8 (docs) only. Total estimated effort: ~1-2 days for a developer familiar with the codebase, including test authoring and quality-gate passes.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps each task to a specific user story for traceability.
- Each user story is independently testable and ships an incremental capability slice.
- The `binary-resolver.ts` and `binary-resolver.test.ts` files grow append-only across stories — earlier slices remain functional as later slices land.
- Constitution II (test coverage) is satisfied per-story: every story's tests + impl land together.
- Constitution V (attribution) is satisfied at T004 / T002 (header on each new source file).
- Constitution IV (error propagation) is reused — no new error code; no plain `throw new Error` at any boundary.
- No mid-implementation refactors; no speculative abstractions; no TODO breadcrumbs.
- Avoid: vague tasks ("clean up resolver"), same-file conflicts (sequential within shared files), cross-story dependencies that break independence (US3/US7 depend on US1's darwin branch — explicit and minimal).
