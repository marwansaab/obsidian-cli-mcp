# Phase 0: Outline & Research — Cross-Platform Binary Resolution

**Feature**: `017-cross-platform-support`
**Created**: 2026-05-10
**Plan reference**: [plan.md](plan.md)

This document captures the research decisions taken before implementation. Decisions enumerated here are downstream of (and consistent with) the spec's Clarifications session (2026-05-10) — Q1 (PATH-branch shape) and Q2 (executability predicate) — and the live state of [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts). Where a decision was settled by a specific spec FR or clarify Q, the source is cited.

## Research decisions

### R1 — Module location: `src/binary-resolver/` (sibling to `src/cli-adapter/`)

**Decision**: Extract resolution into a new top-level module `src/binary-resolver/`. Single file `binary-resolver.ts` + co-located `binary-resolver.test.ts`. No `index.ts` indirection (the module exposes one function and a small accompanying type — there's nothing to register).

**Rationale**: Constitution Principle I demands per-surface modules with single responsibility. Resolution is conceptually below the cli-adapter (the adapter consumes a resolved binary path, the resolver produces it) and is reused at every spawn — placing it under `src/cli-adapter/` would conflate "spawn-and-classify" with "find-the-binary-to-spawn". A sibling directory keeps the dependency direction clean: `_dispatch.ts → binary-resolver` (downward only). The single-file `<module>.ts` + `<module>.test.ts` shape matches the project's convention for narrow modules without a registration surface (e.g., before the post-011 `{schema, handler, index}.ts` shape was adopted, similar single-purpose modules used the bare-pair layout).

**Alternatives considered**:
- **Place inside `src/cli-adapter/` as `binary-resolver.ts`**: rejected — conflates concerns; the adapter's responsibility is spawn-and-classify, not "find the binary".
- **Place at `src/cli-adapter/_resolver.ts` (underscore-prefixed internal)**: rejected — the `_dispatch.ts` underscore convention means "module-internal helper not part of the public surface"; the resolver isn't a `_dispatch.ts` helper, it's a peer module that the dispatch consumes.
- **Inline into `_dispatch.ts`**: rejected — the resolver needs ~80 LOC and ~30 test cases; inlining bloats `_dispatch.ts` and makes seam-injection (FR-014) noisier because every test would have to mock the inlined logic via private exports.

**Source**: Constitution Principle I; spec FR-006.

### R2 — Resolution algorithm: ordered three-tier fall-through

**Decision**: The resolver runs the three branches in this fixed order and returns at the first one that resolves to an executable file:

1. **`OBSIDIAN_BIN` (override)** — when `env.OBSIDIAN_BIN` is set: check the path via `fs.access(path, fs.constants.X_OK)`. If it succeeds, return `{path: env.OBSIDIAN_BIN, attempts: [{source: "OBSIDIAN_BIN", path: env.OBSIDIAN_BIN, outcome: "resolved"}]}`. If `fs.access` throws (any error — ENOENT for not-found, EACCES for not-executable), do NOT fall through; throw `CLI_BINARY_NOT_FOUND` with the override attempt's outcome labelled (`"not-found"` for ENOENT, `"found-but-not-executable"` for any other access-failure errno).
2. **Platform-default** — when `OBSIDIAN_BIN` is unset: compute the platform-default path. macOS (`process.platform === "darwin"`): `/usr/local/bin/obsidian`. Linux (`process.platform === "linux"`): `path.join(os.homedir(), ".local/bin/obsidian")`. Windows (`process.platform === "win32"`): no platform-default; skip this branch entirely. For darwin/linux: check the path via `fs.access(X_OK)`. If it succeeds, return `{path: <platform-default>, attempts: [...]}`. If `fs.access` throws, fall through to the `PATH` branch — record the attempt with outcome `"not-found"` (ENOENT) or `"found-but-not-executable"` (any other access-failure errno) for the structured-error detail.
3. **`PATH` (deferred to OS spawn)** — return `{path: "obsidian", attempts: [<override attempt if any>, <platform-default attempt if any>, {source: "PATH", path: "obsidian", outcome: "pending"}]}`. The dispatch layer spawns this bare command name; the OS resolves it against `PATH` natively. If the spawn fails ENOENT, the dispatch layer throws `CLI_BINARY_NOT_FOUND` with the resolver's attempts list amended — the `PATH` attempt's outcome is set to `"not-found"`. If the spawn succeeds, the resolver's job is done.

**Rationale**: this is the exact priority the spec input encoded (FR-001 → FR-002 → FR-003), modelled as a function. The `OBSIDIAN_BIN` branch's no-fall-through behaviour (FR-008 / FR-020) is captured by the early throw; the platform-default branch's fall-through-on-failure is captured by the continuation; the `PATH` branch's deferral to the OS spawn is captured by returning the bare command name and letting `_dispatch.ts` proceed (no resolver-side `which`-walk).

**Alternatives considered**:
- **Resolve all three branches before deciding (collect-then-pick)**: rejected — adds unnecessary `fs.access` calls when an early branch resolves; semantics are first-match-wins, not best-match-wins.
- **Separate functions per platform (`resolveOnDarwin`, `resolveOnLinux`, `resolveOnWindows`)**: rejected — the three platforms differ only by which platform-default path is computed; a single function with a platform predicate is clearer and reduces test surface.

**Source**: spec FR-001, FR-002, FR-003, FR-008, FR-020; spec User Story 4 acceptance scenarios.

### R3 — Executability predicate: `fs.access(path, fs.constants.X_OK)`

**Decision**: Use `fs.access(path, fs.constants.X_OK)` (from `node:fs/promises`) for the `"OBSIDIAN_BIN"` and `"platform-default"` attempts. Returns void on success; throws on failure with `errno`-bearing `NodeJS.ErrnoException`. `ENOENT` → outcome `"not-found"`; any other error code → outcome `"found-but-not-executable"`.

**Rationale**: locked by spec Clarifications Q2 (2026-05-10). `fs.access(X_OK)` is the kernel's own answer to "can the running process execute this file?" — it respects mode AND ownership on POSIX in one syscall, and succeeds for any existing file on Windows. The Windows behaviour preserves FR-005's byte-for-byte non-regression because Windows defers actual execute-permission enforcement to the spawn anyway. Matches FR-003's "executable by the running user" wording exactly.

**Alternatives considered** (from clarify Q2): `fs.statSync().mode & 0o111` (ignores ownership; coarser); spawn-probe (conflates permission failures with "binary doesn't accept --version"); manual `getuid` / `getgid` math (POSIX-only; reimplements `fs.access`).

**Source**: spec Clarifications Q2 (2026-05-10); spec FR-003, FR-020.

### R4 — `PATH` branch shape: defer lookup to the OS spawn

**Decision**: The resolver does NOT implement an in-tree `which`-walk. When neither `OBSIDIAN_BIN` nor the platform-default resolves, the resolver returns `{path: "obsidian"}` and `_dispatch.ts` spawns the bare command name. The OS handles `PATH` resolution natively (Windows: `PATHEXT` ordering; POSIX: literal `PATH` walk with no extension manipulation). The `"PATH"` Resolution-attempt tuple records source `"PATH"`, path = `"obsidian"`, and the outcome is set when the spawn settles — the resolver itself returns the attempt with outcome `"pending"`, and `_dispatch.ts` rewrites it to `"resolved"` (on spawn success) or `"not-found"` (on ENOENT) before throwing or proceeding.

**Rationale**: locked by spec Clarifications Q1 (2026-05-10). Replicating the OS `PATH` walk would force the resolver to reimplement Windows `PATHEXT` resolution (`.exe` / `.cmd` / `.bat` / `.com` / case-folding rules), POSIX literal-walk (no extension manipulation), and edge cases like `PATH` entries with embedded quotes or trailing separators. The OS already does this correctly and the structured `CLI_BINARY_NOT_FOUND` error already includes `process.env.PATH` verbatim — sufficient grep-fodder for the user without duplicating OS logic.

**Alternatives considered** (from clarify Q1): in-tree enumeration of every `PATH` entry; hybrid `which`-equivalent that finds the first matching entry but only existence-checks.

**Source**: spec Clarifications Q1 (2026-05-10); spec FR-004.

### R5 — Tilde expansion for `~/.local/bin/obsidian`: `os.homedir()` at resolution time

**Decision**: The Linux platform-default path is computed as `path.join(os.homedir(), ".local/bin/obsidian")` at each resolution call. The resolver never stores or pre-computes the home directory — `os.homedir()` is called fresh per `resolveBinary` invocation (FR-009 — no caching).

**Rationale**: `os.homedir()` is the canonical Node API for "the running user's home directory". It honours `HOME` on POSIX, `USERPROFILE` on Windows, and falls back to `pwuid` / `getenv` chain when those are unset. Computing the path per-call is consistent with FR-009's no-caching mandate and matches the cost model (~50 ns to read `process.env.HOME`). Storing the home dir in module state would couple the cross-spawn lifetime that FR-009 explicitly forbids.

**Alternatives considered**:
- **Cache `os.homedir()` once at module load**: rejected — violates FR-009; `HOME` could change between calls (rare but documented in `setHomedir`-style scenarios).
- **Use `process.env.HOME` directly**: rejected — Windows uses `USERPROFILE`, not `HOME`; `os.homedir()` handles the platform difference.

**Source**: spec FR-002, FR-009.

### R6 — Error envelope shape: extend `CLI_BINARY_NOT_FOUND` `details`, no new code

**Decision**: Extend the existing `UpstreamError({code: "CLI_BINARY_NOT_FOUND", ...})` thrown at [src/cli-adapter/_dispatch.ts:84-91](../../src/cli-adapter/_dispatch.ts#L84-L91) and [src/cli-adapter/_dispatch.ts:163-170](../../src/cli-adapter/_dispatch.ts#L163-L170). Replace the legacy `details: { binaryAttempted, PATH }` shape with the new structured shape:

```ts
details: {
  platform: NodeJS.Platform;          // process.platform value: "darwin" | "linux" | "win32" | ...
  attempts: ResolutionAttempt[];      // ordered list of resolution branches
  PATH: string | undefined;           // process.env.PATH verbatim; undefined if env.PATH was unset
}
```

The `binaryAttempted` field is dropped — `attempts[attempts.length - 1].path` carries the same information in a strictly richer form (per-attempt source + outcome). No new `ErrorCode` is added to the union in `src/logger.ts:4-10`.

**Rationale**: locked by spec FR-010. UpstreamError `details` is diagnostic, not contractual — the project's other typed tools (`read_note`, `read_property`, etc.) only ever assert on `err.code`, not the shape of `err.details`. The two test files that assert specific shape (`_dispatch.test.ts:185-204`, `obsidian_exec/handler.test.ts:111-122`) are updated in the same change to consume the new shape.

**Alternatives considered**:
- **Add a new `BINARY_RESOLUTION_FAILED` code distinct from `CLI_BINARY_NOT_FOUND`**: rejected — FR-010 forbids new codes; resolution failure and spawn-time ENOENT are observably the same failure mode (binary not found).
- **Keep `binaryAttempted` for backward compat alongside the new fields**: rejected — agents and tools never depend on `details` shape; dropping the field is cleaner and removes a stale-data risk if a future change updates one but not the other.

**Source**: spec FR-004, FR-010.

### R7 — Test seams: dependency-injected `(env, platform, homedir, access)`

**Decision**: The resolver signature is:

```ts
export interface BinaryResolverDeps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  homedir: () => string;
  access: (path: string, mode: number) => Promise<void>;
}

export interface BinaryResolverResult {
  path: string;
  attempts: ResolutionAttempt[];
}

export function resolveBinary(deps: BinaryResolverDeps): Promise<BinaryResolverResult>;
```

All four dependencies are injectable via the `BinaryResolverDeps` record. The `_dispatch.ts` consumer wires the production defaults (`process.env`, `process.platform`, `os.homedir`, `fsPromises.access`); tests inject stubs that fix `platform` to `"darwin"`/`"linux"`/`"win32"`, fix `homedir()` to a deterministic value, and supply an `access` stub that resolves or rejects per-case.

**Rationale**: FR-014 mandates seam-based testing without requiring CI to physically run on each platform. The four-tuple is exactly the I/O surface the resolver touches — adding any other dep would expand the seam unnecessarily, and removing any would force the resolver to import a side-effecting module directly (which would defeat the seam). The `homedir: () => string` shape (function returning string) matches Node's `os.homedir()`'s call signature, so the production wiring is `homedir: os.homedir` directly with no adapter.

**Alternatives considered**:
- **Pass a fully-built "PlatformContext" object (single dep with `.platform`, `.env`, `.homedir`, `.access`)**: rejected — denser type, harder to override one field at a time in tests.
- **Module-level `process.platform` / `os.homedir()` reads with `vi.mock` overrides**: rejected — `vi.mock` is fragile across vitest versions and obscures the I/O surface; explicit deps are clearer.

**Source**: spec FR-014; project memory ("Test scope is unit-only").

### R8 — Per-spawn resolution, no caching

**Decision**: The resolver is a pure function: given `BinaryResolverDeps`, it returns a `BinaryResolverResult` (or throws). It maintains no module-level cache. `_dispatch.ts` calls `resolveBinary(...)` at the top of `dispatchCli`, awaits the result, and uses `result.path` as the binary to spawn. A binary uninstalled or moved between two `dispatchCli` calls observably fails at the second call.

**Rationale**: locked by spec FR-009. The resolver's cost is two `fs.access` syscalls in the worst case (~100 µs on hot-cached inodes); caching saves ~100 µs but introduces cache-invalidation surface, mid-session drift risk, and a second source of truth. The trade-off goes the right way without caching.

**Alternatives considered**:
- **Cache the resolved path for the MCP-server-process lifetime**: rejected — FR-009 forbids; mid-session install changes (uninstall, move, reinstall to a different path) become silent stale resolutions.
- **Cache for a short TTL (e.g., 60 s)**: rejected — pure complexity for ~100 µs savings; the dispatch layer is already on the order of 100 ms per call.

**Source**: spec FR-009.

### R9 — Symlink handling: rely on OS spawn + `fs.access` to dereference

**Decision**: When the platform-default path is a symlink, the resolver does NOT call `fs.realpath` to resolve the link target. The `fs.access(path, X_OK)` call dereferences the symlink internally and returns success if the resolved target is executable; the resolver returns the symlink path verbatim to the spawn, and the OS spawn dereferences it again at execution time via libuv. The user observes a successful spawn against the symlink path.

**Rationale**: spec FR-007 says "the OS spawn dereferences the symlink at execution time"; both `fs.access` and the OS spawn already handle this transparently. Adding an explicit `fs.realpath` call would (a) require additional code, (b) require additional tests, (c) potentially break the user's observable resolution path (the user passed `/usr/local/bin/obsidian` and would see `/Applications/Obsidian.app/Contents/.../obsidian` in the structured error — actively worse for debuggability). Trusting the libuv-level symlink semantics is the right move.

**Alternatives considered**:
- **Resolve symlinks via `fs.realpath` before spawn**: rejected — additional code surface, no observable benefit, worse error-detail content.
- **Reject symlinks defensively (`fs.lstat` + symlink check)**: rejected — would refuse legitimate Homebrew / custom-symlink installs; spec FR-007 explicitly mandates symlink-following.

**Source**: spec FR-007; spec User Story 7.

### R10 — Logger surface: no new event; UpstreamError carries diagnostic

**Decision**: The resolver does NOT emit logger events. Resolution failure surfaces as a thrown `UpstreamError(CLI_BINARY_NOT_FOUND)` whose details carry the full diagnostic; the existing `registerTool` factory's logger plumbing handles the failure-side audit trail. Resolution success is silent.

**Rationale**: matches the precedent set by 011–015 ("no per-call events at the tool layer"). The dispatch layer's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events cover the spawn-side diagnostics; resolution failure is a single high-detail failure event surfaced via the UpstreamError path. Adding a `dispatchResolveFailed` event would (a) duplicate the UpstreamError content, (b) double-log on failure (once via the event, once via the thrown error's `registerTool`-level capture), (c) introduce a `Logger` interface change that the BI explicitly does not need.

**Alternatives considered**:
- **Emit `dispatchResolveFailed(event)` per failed resolution**: rejected — duplicate logging surface; UpstreamError's `details` already carries the diagnostic.
- **Emit `dispatchResolveSucceeded(event)` per successful resolution**: rejected — high-frequency spam (every CLI call); no debugging value.

**Source**: post-011 logger-surface precedent; spec Constitution-IV satisfaction.

### R11 — Windows preserve byte-for-byte: skip platform-default branch on win32

**Decision**: The resolver explicitly skips the platform-default branch when `process.platform === "win32"`. `OBSIDIAN_BIN` (if set) → spawn the override; otherwise → spawn the bare name `"obsidian"` (deferring to `PATH` lookup). The resolver does NOT attempt any file-existence check on Windows when `OBSIDIAN_BIN` is unset — the spawn handles the lookup natively.

**Rationale**: spec FR-005 mandates byte-for-byte preservation of v0.3.0 Windows behaviour. The current Windows code path is exactly `binary = env.OBSIDIAN_BIN ?? "obsidian"` followed by `spawn(binary, ...)`; the resolver replicates this when `platform === "win32"`. The `attempts` array on Windows contains at most one entry (the `OBSIDIAN_BIN` attempt if set) plus the `PATH` attempt; no platform-default attempt is recorded.

**Alternatives considered**:
- **Treat Windows the same as macOS/Linux but with a heuristic platform-default like `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe`**: rejected — the official Windows installer registers `obsidian` on `PATH` directly; pre-checking a non-canonical install path would diverge from v0.3.0 behaviour without user benefit.
- **Apply the platform-default branch to Windows but with no path (i.e., always fall through)**: rejected — adds a no-op attempt to the structured error for no gain.

**Source**: spec FR-005, spec User Story 3.

### R12 — README + `package.json` identity bump

**Decision**: Update three external surfaces:
- **`package.json` `description`**: replace "Windows-host MCP server bridging MCP clients..." with a tri-platform framing ("Cross-platform MCP server bridging MCP clients to the Obsidian Integrated CLI binary on macOS, Linux, and Windows hosts. Ships obsidian_exec, ...").
- **README.md opening paragraph** (line 3): replace "A minimal Windows-host MCP server..." with a tri-platform framing.
- **README.md Installation > Prerequisites** (line 22): replace "Windows 10 / 11 host. macOS and Linux are out of scope for the 0.x release line" with a per-platform list (Windows 10 / 11, macOS Sonoma+, Linux Ubuntu 22.04+ or equivalent) plus per-platform install-path notes.
- **README.md Installation** (after Windows subsection): add macOS and Linux subsections covering the platform-default path, `OBSIDIAN_BIN` override examples, and any `PATH` setup steps (Linux's `~/.local/bin` may not be on default `PATH` on some distros — call out the shell rc file edit explicitly).
- **README.md Claude Desktop subsection**: add per-platform configuration paths (`%APPDATA%\Claude\claude_desktop_config.json` on Windows; `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS; appropriate Linux path).

The existing Windows subsection's content is preserved unchanged in content and ordering (FR-012).

**Rationale**: spec FR-012, FR-019. The package's external identity (npm description + README opening) currently misrepresents the new capability; without updating these, agents and humans pattern-matching against the registry / README will continue to assume Windows-only.

**Alternatives considered**:
- **Bump only README, leave `package.json` `description`**: rejected — npm registry and `npm info` calls would still surface "Windows-host"; a user installing from npm would never read the README.
- **Add per-platform README subsections in a separate BI**: rejected — docs and behaviour shipping together is the project's pattern (see 016's README + tool-doc updates landing in the same change).

**Source**: spec FR-012, FR-019.

### R13 — Existing-test amendments: `_dispatch.test.ts` and `obsidian_exec/handler.test.ts`

**Decision**: Two existing test files need surgical updates to consume the new `CLI_BINARY_NOT_FOUND` `details` shape:

- **`src/cli-adapter/_dispatch.test.ts`**: three test cases at lines 185–204 currently assert `err.details).toMatchObject({ binaryAttempted: "obsidian", PATH: "/x" })` and check the legacy two-field shape. Update each to assert the new shape: `err.details.platform`, `err.details.attempts: ResolutionAttempt[]`, `err.details.PATH`. The case names ("ENOENT on spawn → CLI_BINARY_NOT_FOUND with details ...") are also updated to drop the legacy field-name reference.
- **`src/tools/obsidian_exec/handler.test.ts`**: one test case at lines 111–122 currently asserts `err.details.binaryAttempted).toBe("obsidian")`. Update to assert the equivalent through the new shape: `err.details.attempts.find(a => a.source === "PATH")?.path).toBe("obsidian")` (or equivalent — the path-of-the-PATH-attempt is the migration of `binaryAttempted`).

All other test files that reference `CLI_BINARY_NOT_FOUND` (`read_note/handler.test.ts`, `read_property/handler.test.ts`, `delete_note/handler.test.ts`, `find_by_property/handler.test.ts`, `read_heading/index.test.ts`, etc.) only assert `err.code === "CLI_BINARY_NOT_FOUND"` — they're agnostic to `details` shape and need no edits.

**Rationale**: Constitution II requires the test suite to remain green in the same change that updates a public surface. The two files identified above are the only ones with tight `details`-shape coupling.

**Alternatives considered**:
- **Keep the legacy `binaryAttempted` field for backward compat alongside the new shape**: rejected — see R6's "no backward-compat hack" stance (CLAUDE.md global guidance).

**Source**: Constitution II; live grep against `src/` 2026-05-10.

## Live findings (verified during plan)

### F1 — Existing dispatch-layer ENOENT surface is exactly the migration target

Grepped `binaryAttempted` 2026-05-10. Two production sites in [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts):
- Line 89: spawn-throw ENOENT (the `try { spawnFn(...) } catch (err) { if (errnoCode === "ENOENT") ... }` path).
- Line 168: child error event ENOENT (the `child.on("error", err => { if (err.code === "ENOENT") ... })` path).

Both throw `UpstreamError({code: "CLI_BINARY_NOT_FOUND", cause: err, details: { binaryAttempted: binary, PATH: env.PATH }})`. The migration replaces `binary` (set at line 62 from `env.OBSIDIAN_BIN ?? "obsidian"`) with the resolved-from-`resolveBinary()` value, and replaces the two-field `details` literal with the new shape. The migration is self-contained to lines 60–95 and 155–175 of `_dispatch.ts` plus its three test cases.

### F2 — `CLI_BINARY_NOT_FOUND` `details` is internal diagnostic, not a contract

Grep against the entire `src/` tree 2026-05-10 confirms that `binaryAttempted` is asserted by exactly two test files (`_dispatch.test.ts` and `obsidian_exec/handler.test.ts`). All other tools that propagate `CLI_BINARY_NOT_FOUND` (`read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`) only check `err.code` — they're details-agnostic. This confirms that the `details` shape is internal to the dispatch layer and not part of any cross-tool contract; replacing it with a richer shape is safe.

### F3 — `vault-registry/registry.test.ts:65-68` expects `CLI_BINARY_NOT_FOUND` propagation but doesn't assert details

The vault-registry test asserts `err.code === "CLI_BINARY_NOT_FOUND"` but does NOT assert `err.details` shape. No edit needed for this test under the new shape.

### F4 — `process.platform` values are stable: `"darwin"`, `"linux"`, `"win32"`, plus rare `"freebsd"` / `"sunos"` / `"aix"` / `"openbsd"`

Node's `process.platform` documentation lists: `"aix"`, `"darwin"`, `"freebsd"`, `"linux"`, `"openbsd"`, `"sunos"`, `"win32"`. The resolver handles `"darwin"` and `"linux"` explicitly, falls to PATH-only on `"win32"` per FR-005, and SHOULD fall to PATH-only on any other value (matching the Windows behaviour: skip the platform-default branch). The "rare BSD / Solaris / AIX" platforms aren't supported by Obsidian itself, but the resolver's behaviour on them is well-defined: `OBSIDIAN_BIN` (if set) wins; otherwise spawn the bare name and let `PATH` decide. This is captured in R11 as "skip platform-default on win32" and generalised here as "skip platform-default on any platform other than darwin/linux".

### F5 — `os.homedir()` is well-defined on every supported platform

Verified Node docs: `os.homedir()` honours `$HOME` on POSIX, `%USERPROFILE%` on Windows, falls back to `getpwuid_r()` / `GetUserProfileDirectoryW()` if those are unset. Never returns `undefined`. Returns a string with no trailing separator. Safe to feed to `path.join` directly.

## Open items (deferred, to be resolved during /speckit-implement T0)

None. All R1–R13 are settled at plan stage; the spec's two clarifications + the existing dispatch-layer code shape remove all design ambiguity. T0 of /speckit-implement is purely "wire it up": create the resolver, swap the dispatch line, update the four affected tests, run the full vitest suite to confirm zero regressions.
