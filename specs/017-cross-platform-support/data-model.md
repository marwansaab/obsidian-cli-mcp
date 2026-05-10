# Phase 1: Design & Contracts — Data Model

**Feature**: `017-cross-platform-support`
**Created**: 2026-05-10
**Plan reference**: [plan.md](plan.md) | **Research reference**: [research.md](research.md)

This document captures the concrete TypeScript types, module-level interfaces, test inventory, and LOC budget for the Cross-Platform Binary Resolution feature. Decisions captured here are downstream of (and consistent with) Phase 0 research.

## Module: `src/binary-resolver/`

### Public surface

```ts
// src/binary-resolver/binary-resolver.ts
// Original — no upstream. Three-tier binary resolver per FR-001..FR-008.

import type { UpstreamError } from "../errors.js";

/**
 * One ordered entry in the resolver's decision trail. The structured
 * `CLI_BINARY_NOT_FOUND` UpstreamError details carries an array of these
 * (per FR-004), and the success path returns the array on the result.
 */
export interface ResolutionAttempt {
  source: "OBSIDIAN_BIN" | "platform-default" | "PATH";
  /**
   * For OBSIDIAN_BIN and platform-default: the absolute path that was
   * checked via fs.access(X_OK). For PATH: the bare command name
   * ("obsidian") that the OS spawn will resolve against $PATH (per Q1).
   */
  path: string;
  /**
   * "resolved" — fs.access(X_OK) succeeded for OBSIDIAN_BIN/platform-default,
   *              OR the OS spawn succeeded for PATH.
   * "not-found" — ENOENT (file doesn't exist, OR PATH-spawn ENOENT).
   * "found-but-not-executable" — fs.access(X_OK) failed with any non-ENOENT
   *              errno (typically EACCES, EPERM).
   * "pending" — the resolver returned with this attempt unresolved; the
   *              dispatch layer will set the final outcome after the spawn.
   */
  outcome: "resolved" | "not-found" | "found-but-not-executable" | "pending";
}

export interface BinaryResolverDeps {
  /** Process env (typically `process.env`). Read-only; never mutated. */
  env: NodeJS.ProcessEnv;
  /** Platform identifier (typically `process.platform`). */
  platform: NodeJS.Platform;
  /** Returns the running user's home directory (typically `os.homedir`). */
  homedir: () => string;
  /**
   * fs.access(X_OK) equivalent (typically `fsPromises.access`). Returns
   * void on success; rejects with NodeJS.ErrnoException on failure.
   */
  access: (path: string, mode: number) => Promise<void>;
}

export interface BinaryResolverResult {
  /**
   * The binary path or bare command name to pass to spawn().
   * - OBSIDIAN_BIN branch resolved → the override path.
   * - platform-default branch resolved → the platform-default absolute path.
   * - Both fell through → "obsidian" (deferred to OS spawn against PATH).
   */
  path: string;
  /**
   * Ordered list of attempts the resolver made, in the order they were tried.
   * Used by the dispatch layer to (a) annotate the structured error if the
   * subsequent spawn ENOENTs on the PATH-deferral branch, and (b) for
   * diagnostic logging on success (currently unused — see R10).
   */
  attempts: ResolutionAttempt[];
}

/**
 * Resolve the Obsidian CLI binary to spawn for the next dispatchCli call.
 *
 * Resolution priority:
 *   1. env.OBSIDIAN_BIN (if set) — fs.access(X_OK); fail loudly if not executable
 *      (FR-008 / FR-020).
 *   2. Platform-default (if applicable to the platform) — fs.access(X_OK);
 *      fall through to PATH branch on any access failure.
 *   3. PATH fallback — return the bare command name "obsidian"; the dispatch
 *      layer spawns it and the OS resolves against $PATH (per Q1).
 *
 * @throws UpstreamError({code: "CLI_BINARY_NOT_FOUND", details: {platform, attempts, PATH}})
 *         when OBSIDIAN_BIN is set but its access check fails (FR-008 / FR-020 — no fall-through).
 *         The PATH-branch failure is detected by the dispatch layer at spawn time, not here.
 */
export function resolveBinary(deps: BinaryResolverDeps): Promise<BinaryResolverResult>;
```

### Per-platform behaviour

| `deps.platform` | Platform-default path | When OBSIDIAN_BIN unset, resolver returns... |
|---|---|---|
| `"darwin"` | `/usr/local/bin/obsidian` | If `fs.access` succeeds → `{path: "/usr/local/bin/obsidian", attempts: [{platform-default, "/usr/local/bin/obsidian", "resolved"}]}`. Else → `{path: "obsidian", attempts: [{platform-default, "/usr/local/bin/obsidian", <"not-found"\|"found-but-not-executable">}, {PATH, "obsidian", "pending"}]}`. |
| `"linux"` | `path.join(deps.homedir(), ".local/bin/obsidian")` | Same shape as darwin, with the Linux platform-default substituted. |
| `"win32"` | (none — skipped per FR-005) | `{path: "obsidian", attempts: [{PATH, "obsidian", "pending"}]}`. No platform-default attempt is recorded. |
| any other (`"freebsd"`, `"sunos"`, `"aix"`, `"openbsd"`) | (none — generalised win32 behaviour per F4) | Same as win32. |

When `OBSIDIAN_BIN` IS set, the resolver runs only the override branch on every platform — the platform-default and PATH branches are not consulted. On success: `{path: env.OBSIDIAN_BIN, attempts: [{OBSIDIAN_BIN, env.OBSIDIAN_BIN, "resolved"}]}`. On failure: throws `CLI_BINARY_NOT_FOUND` with `attempts: [{OBSIDIAN_BIN, env.OBSIDIAN_BIN, <"not-found"\|"found-but-not-executable">}]`.

### Dispatch-layer integration

`src/cli-adapter/_dispatch.ts` consumes the resolver as follows (simplified):

```ts
// Existing imports + new resolver import
import { resolveBinary, type ResolutionAttempt } from "../binary-resolver/binary-resolver.js";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";

export async function dispatchCli(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutput> {
  const env = deps.env ?? process.env;

  // [NEW] Resolve the binary before spawn assembly.
  const resolved = await resolveBinary({
    env,
    platform: process.platform,
    homedir: os.homedir,
    access: fsPromises.access,
  });

  const binary = resolved.path;
  const argv = assembleArgv(input, binary);
  const spawnArgs = argv.slice(1);
  // ... rest of dispatchCli unchanged ...

  // ENOENT-on-spawn paths (line 84 + line 163 today): the resolver's attempts
  // list propagates into the structured error.
  reject(
    new UpstreamError({
      code: "CLI_BINARY_NOT_FOUND",
      cause: err,
      details: {
        platform: process.platform,
        // Mark the trailing PATH attempt's outcome as "not-found" since the
        // OS spawn just confirmed it.
        attempts: markPathAttemptNotFound(resolved.attempts),
        PATH: env.PATH,
      },
    }),
  );
}
```

The `markPathAttemptNotFound` helper is a small internal function in `_dispatch.ts` (not in `binary-resolver`) that finds the trailing `pending` PATH attempt and rewrites its outcome to `"not-found"`. Since this only fires on the spawn-ENOENT path (the resolver itself has no way to know the spawn outcome), it lives at the call site. ~5 LOC.

### Internal state

The resolver has NO module-level state. No caching (FR-009). Pure function modulo the injected I/O dependencies.

### Per-FR test seam coverage

| FR | What it asserts | Test seam |
|---|---|---|
| FR-001 | `OBSIDIAN_BIN` highest priority | Inject `env: {OBSIDIAN_BIN: "/x"}`, assert `path === "/x"` regardless of platform-default existence. |
| FR-002 | Platform-default ordering | Inject `platform: "darwin"`, assert `path === "/usr/local/bin/obsidian"` when `access` resolves. Same for Linux with homedir. |
| FR-003 | Executable-by-running-user check | Inject `access: () => Promise.reject({code: "EACCES"})`, assert fall-through to PATH for platform-default; assert throw for OBSIDIAN_BIN. |
| FR-004 | Structured-error detail shape | Force all branches to fail (OBSIDIAN_BIN unset, platform-default ENOENT, PATH ENOENT-on-spawn). Assert `err.details.platform`, `err.details.attempts`, `err.details.PATH`. |
| FR-005 | Windows preserve byte-for-byte | Inject `platform: "win32"`, assert `path === "obsidian"`, attempts contains only PATH (no platform-default attempt). |
| FR-006 | Resolver lives below typed-tool surface | Asserted by `_dispatch.test.ts` integration: every typed tool that goes through `_dispatch.ts` inherits the resolution. |
| FR-007 | Symlink dereferences | Asserted by quickstart M-7 (manual on macOS); unit-level not feasible without filesystem. |
| FR-008 | OBSIDIAN_BIN no-fall-through | Inject `env: {OBSIDIAN_BIN: "/x"}` + `access: () => reject(ENOENT)`, assert throw with `attempts.length === 1` (no platform-default or PATH attempt). |
| FR-009 | Per-spawn resolution | Two consecutive `resolveBinary` calls with the same deps; assert `access` is called twice (once per call) — no caching. |
| FR-010 | No new error code | Spec assertion only; verified by inspection (no `ErrorCode` union edit). |
| FR-011 | No new MCP tool | Spec assertion only; verified by inspection of `server.ts` registration list (unchanged). |
| FR-014 | Test seams | Self-evident — every test injects all four deps. |
| FR-018 | Constitution V (header) | Verified by inspection (each new source file has the `// Original — no upstream.` header). |
| FR-020 | OBSIDIAN_BIN found-but-not-executable | Inject `env: {OBSIDIAN_BIN: "/x"}` + `access: () => reject({code: "EACCES"})`, assert throw with `attempts[0].outcome === "found-but-not-executable"`. |

## Test inventory

### `src/binary-resolver/binary-resolver.test.ts` (new, ~30 cases)

Organisation: `describe` blocks per resolution branch; `it.each` for parametrised cross-platform cases.

#### Group 1 — `OBSIDIAN_BIN` branch (~7 cases)

1. `OBSIDIAN_BIN` set + `access` resolves → `{path: env.OBSIDIAN_BIN, attempts: [{OBSIDIAN_BIN, /x, resolved}]}` regardless of platform.
2. `OBSIDIAN_BIN` set + `access` rejects ENOENT → throws `CLI_BINARY_NOT_FOUND`; `attempts[0].outcome === "not-found"`; no platform-default or PATH attempt recorded (FR-008).
3. `OBSIDIAN_BIN` set + `access` rejects EACCES → throws `CLI_BINARY_NOT_FOUND`; `attempts[0].outcome === "found-but-not-executable"` (FR-020).
4. `OBSIDIAN_BIN` set + `access` rejects EPERM → same as case 3 (any non-ENOENT errno → `"found-but-not-executable"`).
5. `OBSIDIAN_BIN` set + `access` rejects with non-`NodeJS.ErrnoException` → same as case 3 (defensive: opaque rejection treated as "not executable").
6. `OBSIDIAN_BIN` set to an empty string → treated as "unset" (zod-equivalent edge case); falls through to platform-default.
7. `OBSIDIAN_BIN` cross-platform: cases 1-5 parametrised over `["darwin", "linux", "win32"]` to confirm platform-independence (FR-008's "exact-path attempt" rule).

#### Group 2 — Platform-default branch on `darwin` (~5 cases)

1. darwin + `OBSIDIAN_BIN` unset + `access("/usr/local/bin/obsidian")` resolves → `{path: "/usr/local/bin/obsidian", attempts: [{platform-default, /usr/local/bin/obsidian, resolved}]}`.
2. darwin + `OBSIDIAN_BIN` unset + `access` rejects ENOENT → falls through; result is `{path: "obsidian", attempts: [{platform-default, /usr/local/bin/obsidian, "not-found"}, {PATH, "obsidian", "pending"}]}`.
3. darwin + `OBSIDIAN_BIN` unset + `access` rejects EACCES → falls through; `attempts[0].outcome === "found-but-not-executable"` then PATH attempt pending.
4. darwin + `OBSIDIAN_BIN` set to `/foo` + `access("/foo")` resolves → OBSIDIAN_BIN wins; platform-default not consulted (assert `access` called with `/foo` only).
5. darwin + symlink at platform-default (the test stubs `access` to resolve regardless of whether the path is a regular file or symlink) → returns the platform-default path verbatim (R9 / FR-007); the OS spawn dereferences at execution time.

#### Group 3 — Platform-default branch on `linux` (~5 cases)

1. linux + `OBSIDIAN_BIN` unset + `homedir()` returns `/home/u` + `access("/home/u/.local/bin/obsidian")` resolves → `{path: "/home/u/.local/bin/obsidian", ...}`.
2. linux + `OBSIDIAN_BIN` unset + `access` rejects ENOENT → falls through; PATH attempt pending.
3. linux + `OBSIDIAN_BIN` unset + `access` rejects EACCES → falls through; outcome label `"found-but-not-executable"`.
4. linux + `homedir()` returns `/root` (root-user case) → `path === "/root/.local/bin/obsidian"` (the resolver respects whatever `homedir()` returns; no special-casing).
5. linux + WSL guest: `process.platform === "linux"` per spec FR-016; behaviour identical to native Linux. Asserted via the same parametrised cases above.

#### Group 4 — Win32 platform-skip (~4 cases)

1. win32 + `OBSIDIAN_BIN` unset → no platform-default attempt; `attempts === [{PATH, "obsidian", "pending"}]` (FR-005, FR-011 of resolver: skip platform-default).
2. win32 + `OBSIDIAN_BIN` set + `access` resolves → `path === env.OBSIDIAN_BIN`; `attempts === [{OBSIDIAN_BIN, .., resolved}]`. Identical to other platforms (R11).
3. win32 + `access` is NOT called when `OBSIDIAN_BIN` is unset → assert via spy that `access` was invoked zero times (FR-005 byte-for-byte preservation: no platform-default `fs.access` syscall).
4. Non-darwin/linux/win32 platforms (`"freebsd"`, `"openbsd"`) → behave like win32 (skip platform-default per F4 generalisation).

#### Group 5 — Multi-branch fall-through error shape (~5 cases)

1. linux + OBSIDIAN_BIN set + access rejects → throws; `attempts.length === 1`; `attempts[0].source === "OBSIDIAN_BIN"`.
2. linux + OBSIDIAN_BIN unset + platform-default access rejects → resolver returns; spawn-time ENOENT at dispatch layer is what produces the throw (covered in dispatch tests below).
3. The dispatch layer's `markPathAttemptNotFound` correctly mutates the trailing PATH attempt: assert it produces `attempts[N-1].outcome === "not-found"` for the structured error (covered in `_dispatch.test.ts`).
4. Structured-error `details.platform` matches the injected platform value verbatim.
5. Structured-error `details.PATH` is `env.PATH` verbatim (including `undefined` when env.PATH is unset).

#### Group 6 — Symbol invariants and edge cases (~4 cases)

1. `attempts` array is non-empty in every code path (success and failure).
2. `attempts` is in resolution order — OBSIDIAN_BIN (if set) first, platform-default (if applicable) next, PATH last.
3. Two consecutive `resolveBinary` calls with the same deps both fire `access` — no caching (FR-009).
4. The resolver doesn't read `process.env` or `process.platform` directly — only via the injected `deps` (asserted by test setup with `process.env = {}` and an unrelated `deps.env = {OBSIDIAN_BIN: "/x"}`).

### `src/cli-adapter/_dispatch.test.ts` (modified, 3 cases re-targeted)

The three existing cases at lines 185–204:

1. `"ENOENT on spawn → CLI_BINARY_NOT_FOUND with details {platform, attempts, PATH}"` (renamed; updated to assert the new shape).
2. `"child.error ENOENT → CLI_BINARY_NOT_FOUND with new details shape"` (similar update).
3. The `it.each` table at line 392 still asserts `code === "CLI_BINARY_NOT_FOUND"`; no shape assertion; no edit needed.

Plus 1–2 new cases in `_dispatch.test.ts` to cover the resolver-throw path (when `resolveBinary` itself throws, e.g., OBSIDIAN_BIN-set-and-not-executable):

4. NEW: `"OBSIDIAN_BIN set and not executable → resolveBinary throws → CLI_BINARY_NOT_FOUND propagates"` — mock `resolveBinary` to throw; assert the dispatch layer surfaces the same error untouched.
5. NEW: `"resolver returns successfully → spawn proceeds with the resolved binary"` — happy-path integration; assert `spawnFn` is called with `resolved.path` as the first arg.

### `src/tools/obsidian_exec/handler.test.ts` (modified, 1 case re-targeted)

The case at lines 111–122 asserts `err.details.binaryAttempted === "obsidian"`. Update to assert through the new shape: `err.details.attempts.find(a => a.source === "PATH")?.path === "obsidian"`. Same case name; same intent.

## LOC budget

| File | Source LOC | Test LOC |
|---|---|---|
| `src/binary-resolver/binary-resolver.ts` | ~80 | — |
| `src/binary-resolver/binary-resolver.test.ts` | — | ~280 |
| `src/cli-adapter/_dispatch.ts` (delta — replace lines 60–95 + 155–175) | +25 / -10 | — |
| `src/cli-adapter/_dispatch.test.ts` (delta — 3 cases re-targeted + 2 new) | — | +30 / -15 |
| `src/tools/obsidian_exec/handler.test.ts` (delta — 1 case re-targeted) | — | +5 / -3 |
| README.md (per-platform Installation subsections + opening + Prerequisites) | ~40 | — |
| `package.json` (description bump) | +1 / -1 | — |
| **Total** | **~145 net new** | **~310 net new** |

Estimate envelope: ~80–100 LOC source for the resolver itself; ~250–300 LOC test for the resolver itself; small surgical edits to existing files. Matches the plan's Technical Context "Scale/Scope" estimate.

## Per-tool verification matrix (FR-006 inheritance)

| Tool | Test file | Asserts CLI_BINARY_NOT_FOUND propagation? | Edit required? |
|---|---|---|---|
| `obsidian_exec` | `src/tools/obsidian_exec/handler.test.ts` | Yes (line 111-122, asserts `details.binaryAttempted`) | ✅ EDIT — re-target one assertion to new shape |
| `read_note` | `src/tools/read_note/handler.test.ts` | Yes (line 188-197, asserts `code` only) | ❌ no edit |
| `read_heading` | `src/tools/read_heading/index.test.ts` | Yes (line 145, asserts `code` only) | ❌ no edit |
| `read_property` | `src/tools/read_property/handler.test.ts` (line 392-405), `index.test.ts` (line 123) | Yes (asserts `code` only) | ❌ no edit |
| `find_by_property` | `src/tools/find_by_property/handler.test.ts` (line 320-333), `index.test.ts` (line 133) | Yes (asserts `code` only) | ❌ no edit |
| `delete_note` | `src/tools/delete_note/handler.test.ts` (line 180-191), `index.test.ts` (line 123) | Yes (asserts `code` only) | ❌ no edit |
| `write_note` | `src/tools/write_note/handler.test.ts` | No (writes via fs, doesn't spawn) | ❌ no edit |
| `help` | `src/tools/help/handler.test.ts` | No (in-process help; no spawn) | ❌ no edit |
| `vault-registry` (internal) | `src/vault-registry/registry.test.ts` (line 65-68) | Yes (asserts `code` only) | ❌ no edit |
| `_dispatch` (internal) | `src/cli-adapter/_dispatch.test.ts` (line 185-204, 392) | Yes (asserts `details` shape at 185-204) | ✅ EDIT — re-target 3 assertions to new shape |

Total: 2 files modified, 8 files unchanged. Confirms FR-006's "no per-tool plumbing" claim — only the integration boundary (`_dispatch.test.ts`) and the one tool that asserts on `details` shape (`obsidian_exec/handler.test.ts`) need edits.
