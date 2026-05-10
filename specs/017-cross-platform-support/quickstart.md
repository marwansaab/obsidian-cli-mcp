# Quickstart: Cross-Platform Binary Resolution

**Feature**: `017-cross-platform-support`
**Plan reference**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

This document enumerates verification scenarios mapped to the spec's Success Criteria (SC-001..SC-010). Scenarios prefixed `S-` are runnable as part of `vitest run` (CI-gated, seam-injected). Scenarios prefixed `M-` require physical access to a host of the relevant platform with Obsidian installed; M-scenarios are run manually on each release.

## CI-gated scenarios (vitest, seam-injected)

### S-1 — macOS happy path (platform-default resolves)

**Mapped SC**: SC-001 (macOS user boots and gets a `version` response).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const result = await resolveBinary({
  env: {},  // OBSIDIAN_BIN unset
  platform: "darwin",
  homedir: () => "/Users/test",  // unused on darwin (platform-default is absolute)
  access: vi.fn().mockResolvedValue(undefined),
});
expect(result).toEqual({
  path: "/usr/local/bin/obsidian",
  attempts: [{ source: "platform-default", path: "/usr/local/bin/obsidian", outcome: "resolved" }],
});
```

PASS criterion: resolver returns the platform-default path; attempts array contains exactly one resolved entry.

### S-2 — Linux happy path (platform-default resolves)

**Mapped SC**: SC-002 (Linux user boots and gets a `version` response).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const result = await resolveBinary({
  env: {},
  platform: "linux",
  homedir: () => "/home/test",
  access: vi.fn().mockResolvedValue(undefined),
});
expect(result).toEqual({
  path: "/home/test/.local/bin/obsidian",
  attempts: [{ source: "platform-default", path: "/home/test/.local/bin/obsidian", outcome: "resolved" }],
});
```

PASS criterion: resolver returns the home-expanded platform-default path; one resolved entry.

### S-3 — Windows preserve byte-for-byte (no platform-default check)

**Mapped SC**: SC-003 (Windows behaviour unchanged from v0.3.0).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const accessSpy = vi.fn();
const result = await resolveBinary({
  env: {},  // OBSIDIAN_BIN unset
  platform: "win32",
  homedir: () => "C:\\Users\\test",
  access: accessSpy,
});
expect(result).toEqual({
  path: "obsidian",
  attempts: [{ source: "PATH", path: "obsidian", outcome: "pending" }],
});
expect(accessSpy).not.toHaveBeenCalled();  // No fs.access fired on win32 (FR-005)
```

PASS criterion: resolver returns `"obsidian"`; no `access` syscall fired; attempts contains only the PATH-pending entry.

### S-4 — OBSIDIAN_BIN override wins over platform-default

**Mapped SC**: SC-001, SC-002 (override path scenarios).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const accessSpy = vi.fn().mockResolvedValue(undefined);
const result = await resolveBinary({
  env: { OBSIDIAN_BIN: "/custom/path/obsidian" },
  platform: "darwin",
  homedir: () => "/Users/test",
  access: accessSpy,
});
expect(result.path).toBe("/custom/path/obsidian");
expect(result.attempts).toEqual([{ source: "OBSIDIAN_BIN", path: "/custom/path/obsidian", outcome: "resolved" }]);
expect(accessSpy).toHaveBeenCalledWith("/custom/path/obsidian", expect.any(Number));
expect(accessSpy).toHaveBeenCalledTimes(1);  // Only checked the override; never checked platform-default.
```

PASS criterion: only the override is checked; platform-default not consulted.

### S-5 — OBSIDIAN_BIN set and not executable (no fall-through)

**Mapped SC**: SC-004 (debuggable failure).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
await expect(
  resolveBinary({
    env: { OBSIDIAN_BIN: "/nonexistent/obsidian", PATH: "/usr/bin:/bin" },
    platform: "linux",
    homedir: () => "/home/test",
    access: vi.fn().mockRejectedValue(enoent),
  }),
).rejects.toMatchObject({
  code: "CLI_BINARY_NOT_FOUND",
  details: {
    platform: "linux",
    attempts: [{ source: "OBSIDIAN_BIN", path: "/nonexistent/obsidian", outcome: "not-found" }],
    PATH: "/usr/bin:/bin",
  },
});
```

PASS criterion: throws `CLI_BINARY_NOT_FOUND`; attempts contains only the OBSIDIAN_BIN attempt (no fall-through per FR-008); details carry platform + PATH verbatim.

### S-6 — OBSIDIAN_BIN found-but-not-executable

**Mapped SC**: SC-004 (per-path outcome labels).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
await expect(
  resolveBinary({
    env: { OBSIDIAN_BIN: "/usr/bin/obsidian", PATH: "/usr/bin" },
    platform: "linux",
    homedir: () => "/home/test",
    access: vi.fn().mockRejectedValue(eacces),
  }),
).rejects.toMatchObject({
  code: "CLI_BINARY_NOT_FOUND",
  details: {
    platform: "linux",
    attempts: [{ source: "OBSIDIAN_BIN", path: "/usr/bin/obsidian", outcome: "found-but-not-executable" }],
    PATH: "/usr/bin",
  },
});
```

PASS criterion: outcome label is `"found-but-not-executable"` (FR-020).

### S-7 — Platform-default not executable falls through to PATH (resolver returns; spawn decides)

**Mapped SC**: SC-004 (multi-attempt error trail).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
const result = await resolveBinary({
  env: { PATH: "/usr/local/bin:/usr/bin" },
  platform: "darwin",
  homedir: () => "/Users/test",
  access: vi.fn().mockRejectedValue(eacces),
});
expect(result).toEqual({
  path: "obsidian",
  attempts: [
    { source: "platform-default", path: "/usr/local/bin/obsidian", outcome: "found-but-not-executable" },
    { source: "PATH", path: "obsidian", outcome: "pending" },
  ],
});
```

PASS criterion: resolver returns successfully (the PATH branch is for the dispatch layer to decide); attempts records both the failed platform-default and the pending PATH.

### S-8 — Full failure (all branches fail) → structured error from dispatch

**Mapped SC**: SC-004, SC-010 (debuggable missing-binary failure).
**Test home**: `src/cli-adapter/_dispatch.test.ts`

```ts
// resolveBinary returns the resolver-side attempts; the spawn ENOENT triggers
// the dispatch layer's amend-and-throw.
const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
const err = await captureRejection(
  dispatchCli(
    baseInput({ command: "version" }),
    { spawnFn, env: { PATH: "/usr/bin" }, logger: cap.logger },
  ),
);
expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
expect(err.details.platform).toBeOneOf(["darwin", "linux", "win32"]);  // Whatever the test host is
expect(err.details.PATH).toBe("/usr/bin");
expect(err.details.attempts.at(-1)).toEqual({ source: "PATH", path: "obsidian", outcome: "not-found" });
```

PASS criterion: structured error contains platform, attempts (with trailing PATH attempt outcome flipped to `"not-found"`), and PATH.

### S-9 — FR-006 inheritance: any tool's CLI_BINARY_NOT_FOUND test still asserts `err.code` only

**Mapped SC**: SC-005 (typed-tool inheritance).
**Test home**: existing tests already in place (`read_note/handler.test.ts:188`, `read_property/handler.test.ts:392`, `delete_note/handler.test.ts:180`, `find_by_property/handler.test.ts:320`, `read_heading/index.test.ts:145`).

PASS criterion: every existing tool's CLI_BINARY_NOT_FOUND assertion still passes after the BI's changes. This is verified passively by `vitest run` returning green; no edits to those files.

### S-10 — Per-spawn resolution (no caching)

**Mapped SC**: SC-008 (mid-session install changes are observable).
**Test home**: `src/binary-resolver/binary-resolver.test.ts`

```ts
const accessSpy = vi.fn().mockResolvedValue(undefined);
const deps = {
  env: {},
  platform: "darwin" as const,
  homedir: () => "/Users/test",
  access: accessSpy,
};
await resolveBinary(deps);
await resolveBinary(deps);
expect(accessSpy).toHaveBeenCalledTimes(2);  // Once per call — no caching (FR-009).
```

PASS criterion: `access` is called twice for two calls.

## Manual scenarios (run on each platform during release)

### M-1 — macOS happy path (real Obsidian install)

**Mapped SC**: SC-001.
**Setup**: clean macOS Sonoma+ host with Obsidian installed via the official installer (creates `/usr/local/bin/obsidian` symlink). No `OBSIDIAN_BIN` set.
**Steps**:
1. `npx -y @marwansaab/obsidian-cli-mcp` — verify the server boots without stdout output (stdout is reserved for MCP wire traffic).
2. Wire to Claude Desktop or MCP Inspector; confirm `tools/list` includes all eight tools.
3. Call `obsidian_exec` with `{ command: "version" }`. Expect `stdout` to contain Obsidian's version string.
4. Inspect the resolved binary: a `console.error` of `result.path` from `_dispatch.ts` would show `/usr/local/bin/obsidian` (or `OBSIDIAN_BIN`'s value if overridden).

PASS criterion: tool call returns Obsidian's version; no errors.

### M-2 — Linux happy path (real Obsidian install)

**Mapped SC**: SC-002.
**Setup**: clean Ubuntu 22.04+ host with Obsidian installed via the AppImage / .deb installer (creates `~/.local/bin/obsidian`). User's shell rc file has added `~/.local/bin` to `PATH`. No `OBSIDIAN_BIN` set.
**Steps**: same as M-1.

PASS criterion: tool call returns Obsidian's version; no errors.

### M-3 — Windows non-regression (against existing v0.3.0 host)

**Mapped SC**: SC-003.
**Setup**: Windows 11 host already running v0.3.0 successfully against a real vault. Upgrade to the cross-platform release.
**Steps**:
1. Run the full vitest suite — confirm all tests pass identically to v0.3.0.
2. Through Claude Desktop, exercise each typed tool against the real vault: `obsidian_exec`, `read_note`, `read_heading`, `read_property`, `find_by_property`, `write_note`, `delete_note`, `help`. Compare response shapes against a v0.3.0 baseline capture.

PASS criterion: every tool produces byte-identical responses.

### M-4 — Missing-binary structured error (no Obsidian install)

**Mapped SC**: SC-004, SC-010.
**Setup**: any host without `obsidian` on PATH and no platform-default install. No `OBSIDIAN_BIN` set.
**Steps**:
1. `npx -y @marwansaab/obsidian-cli-mcp` — server boots (resolution fires lazily per spawn, not at boot).
2. Through MCP Inspector, call any tool (e.g., `obsidian_exec` with `{ command: "version" }`).
3. Capture the response. The MCP error envelope's `details` must contain `platform`, `attempts` (with the platform-default and PATH branches both labelled per FR-004), and `PATH`.

PASS criterion: structured error includes all three diagnostic ingredients.

### M-5 — README walkthrough on each platform

**Mapped SC**: SC-007.
**Setup**: a maintainer (or volunteer test user) on each of macOS, Linux, Windows.
**Steps**: follow the relevant per-platform README subsection from a fresh state — install Obsidian, configure the MCP, verify a `version` call works.

PASS criterion: end-to-end install completes without consulting source code or docs beyond the linked Obsidian install guide.

### M-6 — macOS Gatekeeper first-run prompt

**Mapped SC**: documented edge case.
**Setup**: macOS host with Obsidian freshly installed (binary still has the quarantine attribute).
**Steps**:
1. First MCP-mediated `version` call — observe whether macOS surfaces a Gatekeeper / quarantine prompt.
2. Approve the prompt (or use `xattr -d com.apple.quarantine` to remove the attribute).
3. Subsequent calls succeed without prompting.

PASS criterion: documented behaviour matches: first call may prompt; subsequent calls succeed.

### M-7 — Symlink at platform-default

**Mapped SC**: SC-008.
**Setup**: macOS or Linux host. Replace the platform-default path with a symlink to a different executable (e.g., `ln -sf /Applications/Obsidian.app/Contents/Resources/.../obsidian /usr/local/bin/obsidian`).
**Steps**:
1. Through the bridge, call `obsidian_exec` with `{ command: "version" }`.
2. Inspect that the response is a normal success (Obsidian's version on stdout).

PASS criterion: spawn dereferences the symlink correctly; no `EISLNK` / `EACCES` / `ENOENT` from the resolver.

### M-8 — Cowork client (sandboxed Linux container) → host bridge

**Mapped SC**: SC-009.
**Setup**: any Cowork (or equivalent) sandboxed runtime configured to tunnel stdio to a bridge running on a macOS or Linux host.
**Steps**:
1. Configure the Cowork client to launch `npx -y @marwansaab/obsidian-cli-mcp` on the host via the existing host-stdio bridge mechanism (unchanged from v0.3.0).
2. Issue tool calls through the Cowork client.

PASS criterion: tool calls succeed; no Cowork-side configuration change required.

## SC coverage table

| SC | Title | CI-gated (S-) | Manual (M-) |
|---|---|---|---|
| SC-001 | macOS user boots and gets `version` | S-1, S-4 | M-1 |
| SC-002 | Linux user boots and gets `version` | S-2, S-4 | M-2 |
| SC-003 | Windows non-regression | S-3 | M-3 |
| SC-004 | Debuggable missing-binary failure | S-5, S-6, S-7, S-8 | M-4 |
| SC-005 | Typed-tool inheritance | S-9 | M-3 (covers all tools) |
| SC-006 | 100% P1 ACs locked by automated tests | S-1..S-10 | — |
| SC-007 | README walkthrough on each platform | — | M-5 |
| SC-008 | Symlink at platform-default | (S-7 covers seam-level) | M-7 |
| SC-009 | Cowork zero-change runtime | — | M-8 |
| SC-010 | Structured-error diagnostic content | S-5, S-6, S-7, S-8 | M-4 |

All ten SCs are covered by either CI-gated or manual scenarios. SC-006 is met by the existence of S-1 through S-10 themselves (every P1 user story acceptance scenario maps to ≥ 1 of these).
