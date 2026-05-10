# Contract: `src/binary-resolver/binary-resolver.ts`

**Feature**: `017-cross-platform-support`
**Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md) | **Data model**: [../data-model.md](../data-model.md)

This contract is the load-bearing surface between the binary-resolver module and its consumer (`src/cli-adapter/_dispatch.ts`). It defines the function signature, the dependency-injection record, the result shape, the error shape, and the per-FR invariants the implementation must satisfy.

## Function signature

```ts
export function resolveBinary(deps: BinaryResolverDeps): Promise<BinaryResolverResult>;
```

## Types

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

export interface ResolutionAttempt {
  source: "OBSIDIAN_BIN" | "platform-default" | "PATH";
  path: string;
  outcome: "resolved" | "not-found" | "found-but-not-executable" | "pending";
}
```

## Field policy

### `BinaryResolverDeps`

| Field | Required? | Production wiring | Test wiring |
|---|---|---|---|
| `env` | yes | `process.env` (passed through `_dispatch.ts`'s `deps.env ?? process.env`) | A plain object with at most `OBSIDIAN_BIN` and `PATH` keys |
| `platform` | yes | `process.platform` | A literal: `"darwin"`, `"linux"`, `"win32"`, or any other value (test cases for FreeBSD-class skipping) |
| `homedir` | yes | `os.homedir` (the function reference, not a call) | `() => "/Users/test"` (darwin), `() => "/home/test"` (linux), `() => "C:\\Users\\test"` (win32) |
| `access` | yes | `(await import("node:fs/promises")).access` | `vi.fn()` returning a resolved/rejected promise per case |

**Invariants**:
- `env` is read-only; `resolveBinary` MUST NOT mutate it.
- `platform` is treated as opaque; the resolver compares against literal values (`"darwin"`, `"linux"`, `"win32"`) and falls through to PATH-only on any other value (R11 generalisation per F4).
- `homedir` is called at most once per `resolveBinary` invocation, only on the `"linux"` branch when computing the platform-default. On `"darwin"` and `"win32"`, `homedir` is NOT called (assertable in tests via spy).
- `access` is called 0–1 times per `resolveBinary` invocation:
  - 0 calls when `OBSIDIAN_BIN` is unset AND `platform` is `"win32"` (or other non-darwin/linux).
  - 1 call when `OBSIDIAN_BIN` is set OR (`OBSIDIAN_BIN` is unset AND `platform` is `"darwin"` or `"linux"`).
  - Never 2 calls in a single invocation — once `OBSIDIAN_BIN` is set, the platform-default branch is not consulted (FR-008).

### `BinaryResolverResult`

| Field | Type | Notes |
|---|---|---|
| `path` | string | The binary path (or bare command name `"obsidian"`) the dispatch layer should pass to `spawn()`. |
| `attempts` | `ResolutionAttempt[]` | Ordered, non-empty. Records every branch the resolver consulted. |

**Invariants**:
- `path` is non-empty.
- `attempts` is non-empty.
- `attempts` is in resolution-order: `OBSIDIAN_BIN` (if applicable) first, `platform-default` (if applicable) next, `PATH` last.
- The last `ResolutionAttempt` in `attempts` has `outcome: "resolved"` if `path` is the resolved path; otherwise `attempts[attempts.length - 1].source === "PATH"` and its outcome is `"pending"` (the dispatch layer settles it after spawn).

### `ResolutionAttempt`

**`source` semantics**:
- `"OBSIDIAN_BIN"` — the attempt is the value of `env.OBSIDIAN_BIN`. Only present when `env.OBSIDIAN_BIN` is set and non-empty.
- `"platform-default"` — the attempt is the platform-default path: `/usr/local/bin/obsidian` on darwin, `path.join(homedir(), ".local/bin/obsidian")` on linux. NOT present on win32 or other platforms.
- `"PATH"` — the attempt is the bare command name `"obsidian"`, deferred to the OS spawn for `PATH` resolution. Always present unless an earlier branch resolved (i.e., always present except when `OBSIDIAN_BIN` resolved or platform-default resolved).

**`outcome` semantics**:
- `"resolved"` — `fs.access(X_OK)` succeeded for OBSIDIAN_BIN/platform-default, OR the OS spawn succeeded for PATH (set by the dispatch layer, not the resolver).
- `"not-found"` — `fs.access` rejected with `code === "ENOENT"`, OR the OS spawn rejected with ENOENT (set by dispatch layer).
- `"found-but-not-executable"` — `fs.access` rejected with any other errno (typically `"EACCES"`, `"EPERM"`).
- `"pending"` — only ever appears on a `"PATH"` attempt that the resolver returned without settling. The dispatch layer rewrites this to `"resolved"` (on spawn success) or `"not-found"` (on spawn ENOENT) before throwing the structured error.

## Resolution algorithm (normative)

```text
function resolveBinary(deps):
  attempts = []
  ENV = deps.env

  // Branch 1: OBSIDIAN_BIN override
  if ENV.OBSIDIAN_BIN is non-empty string:
    try {
      await deps.access(ENV.OBSIDIAN_BIN, fs.constants.X_OK)
      attempts.push({source: "OBSIDIAN_BIN", path: ENV.OBSIDIAN_BIN, outcome: "resolved"})
      return {path: ENV.OBSIDIAN_BIN, attempts}
    } catch (err) {
      // FR-008 / FR-020: no fall-through on override failure.
      outcome = (err.code === "ENOENT") ? "not-found" : "found-but-not-executable"
      attempts.push({source: "OBSIDIAN_BIN", path: ENV.OBSIDIAN_BIN, outcome})
      throw new UpstreamError({
        code: "CLI_BINARY_NOT_FOUND",
        cause: err,
        details: { platform: deps.platform, attempts, PATH: ENV.PATH }
      })
    }

  // Branch 2: platform-default (if applicable)
  platformDefaultPath = computePlatformDefault(deps.platform, deps.homedir)
  if platformDefaultPath is non-null:
    try {
      await deps.access(platformDefaultPath, fs.constants.X_OK)
      attempts.push({source: "platform-default", path: platformDefaultPath, outcome: "resolved"})
      return {path: platformDefaultPath, attempts}
    } catch (err) {
      outcome = (err.code === "ENOENT") ? "not-found" : "found-but-not-executable"
      attempts.push({source: "platform-default", path: platformDefaultPath, outcome})
      // Fall through to PATH branch.
    }

  // Branch 3: PATH (deferred to OS spawn)
  attempts.push({source: "PATH", path: "obsidian", outcome: "pending"})
  return {path: "obsidian", attempts}


function computePlatformDefault(platform, homedir):
  if platform === "darwin":
    return "/usr/local/bin/obsidian"
  if platform === "linux":
    return path.join(homedir(), ".local/bin/obsidian")
  // win32 and any other platform: no platform-default
  return null
```

## Error envelope (when `resolveBinary` throws)

The thrown error is the existing `UpstreamError` class (no new code per FR-010):

```ts
new UpstreamError({
  code: "CLI_BINARY_NOT_FOUND",
  cause: <NodeJS.ErrnoException from fs.access>,
  details: {
    platform: NodeJS.Platform,         // deps.platform verbatim
    attempts: ResolutionAttempt[],     // see invariants above
    PATH: string | undefined,          // deps.env.PATH verbatim
  },
});
```

The resolver only throws on the `OBSIDIAN_BIN`-set-and-failed path. On the platform-default-failed-fall-through-to-PATH path, the resolver returns successfully with a `pending` PATH attempt; the dispatch layer is responsible for the post-spawn throw if the OS spawn ENOENTs.

## Per-FR contract rows

| FR | What this contract enforces |
|---|---|
| FR-001 | OBSIDIAN_BIN check is the first branch; the resolver's `access` call uses `env.OBSIDIAN_BIN` literally. |
| FR-002 | Platform-default is computed from `deps.platform` + `deps.homedir()`; macOS = `/usr/local/bin/obsidian`, Linux = `<homedir>/.local/bin/obsidian`, Windows / other = no platform-default. |
| FR-003 | Executability check is `deps.access(path, fs.constants.X_OK)` — kernel-side check via the injected access function. |
| FR-004 | Error envelope shape is exactly `{code: "CLI_BINARY_NOT_FOUND", cause, details: {platform, attempts, PATH}}`. |
| FR-005 | Win32 + OBSIDIAN_BIN unset: no `access` call fired; result is `{path: "obsidian", attempts: [{PATH, "obsidian", "pending"}]}`. |
| FR-007 | The resolver does not call `fs.realpath`; symlink dereferencing happens transparently in `fs.access` and in the OS spawn (R9). |
| FR-008 | OBSIDIAN_BIN-set-and-failed: throws immediately; `attempts.length === 1`; no platform-default or PATH branch is consulted. |
| FR-009 | The resolver maintains no state; two consecutive calls fire the same number of `access` calls per call. |
| FR-010 | The thrown error code is the existing `"CLI_BINARY_NOT_FOUND"`; no new code introduced. |
| FR-014 | All four deps are dependency-injected; no module-level `process.env` / `os.homedir()` / `fsPromises.access` reads in the resolver. |
| FR-018 | The source file carries the `// Original — no upstream.` header per Constitution V. |
| FR-020 | OBSIDIAN_BIN-set + `access` rejects with non-ENOENT errno → throws with `attempts[0].outcome === "found-but-not-executable"`. |

## Test seam invariants

Every test case in `binary-resolver.test.ts` MUST inject all four deps explicitly. No test imports `process.env` / `os.homedir` / `fsPromises.access` directly. No test uses `vi.mock` to replace module-level imports. This invariant is what makes FR-014 honest — the resolver behaves identically regardless of the host OS the tests are running on, because the host's actual platform / env / fs state is never consulted.
