# Feature Specification: Cross-Platform Binary Resolution

**Feature Branch**: `017-cross-platform-support`
**Created**: 2026-05-10
**Status**: Draft
**Input**: User description: "Add Cross Platform — Extend the Obsidian CLI Bridge MCP from Windows-only support to macOS and Linux hosts. The bridge's core architecture remains unchanged; this work adds per-platform binary resolution, PATH conventions, and platform-specific test coverage."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — macOS users can install and use the bridge (Priority: P1)

A developer on a recent macOS host (Sonoma or later) installs the bridge with `npx -y @marwansaab/obsidian-cli-mcp` and configures their MCP client to spawn it. The Obsidian Integrated CLI binary is at the platform's documented install location (`/usr/local/bin/obsidian`, the location the official Obsidian installer registers via a symlink). The bridge boots, registers its tool surface, and the agent can immediately make a basic CLI call (e.g., `obsidian_exec` with `version`) and receive the running Obsidian's version string back.

**Why this priority**: macOS is the larger of the two non-Windows segments blocked today and is one of the two P1 platform restorations the BI exists to deliver. Without a working macOS path the bridge is functionally inert for that audience even when their Obsidian install is otherwise correct.

**Independent Test**: install via `npx` on a clean macOS host where `/usr/local/bin/obsidian` exists and is executable; assert (a) the MCP server boots without error, (b) `obsidian_exec` is registered and listable, (c) a `version` call returns Obsidian's version string on stdout, and (d) the resolved binary path matches the platform-default location (or the value of `OBSIDIAN_BIN` if that override is set).

**Acceptance Scenarios**:

1. **Given** a macOS host with the official Obsidian installer's symlink at `/usr/local/bin/obsidian` and no `OBSIDIAN_BIN` override, **when** the MCP server is launched via `npx`, **then** the server boots, registers `obsidian_exec`, and a basic `version` call returns the running Obsidian's version on stdout.
2. **Given** a macOS host with `OBSIDIAN_BIN` set to a non-default but valid binary path, **when** the server boots, **then** the override wins over the platform-default and over `PATH` lookup, and basic calls succeed against the override.
3. **Given** a macOS host where `/usr/local/bin/obsidian` does NOT exist (e.g., custom install at `~/Applications`) but the binary IS reachable via `PATH`, **when** the server boots, **then** the platform-default check fails cleanly, the `PATH` fallback resolves the binary, and basic calls succeed.

---

### User Story 2 — Linux users can install and use the bridge (Priority: P1)

A developer on a recent Linux host (Ubuntu 22.04+ or equivalent) installs the bridge with `npx -y @marwansaab/obsidian-cli-mcp` and configures their MCP client to spawn it. The Obsidian Integrated CLI binary is at the platform's documented install location (`~/.local/bin/obsidian`, the user-local location the Linux installer uses). The bridge boots, the tool surface registers, and a basic agent call returns Obsidian's version string.

**Why this priority**: Linux is the second of the two blocked segments. Linux users frequently run Obsidian under Wayland or X11 and need the same agent integration available to Windows and macOS users. P1 for the same reason as US1 — the BI's name asks for both platforms.

**Independent Test**: install via `npx` on a clean Linux host where `~/.local/bin/obsidian` exists and is executable; assert the MCP server boots, `obsidian_exec` is registered, a `version` call returns the running Obsidian's version, and the resolved binary path matches the platform-default location (or the override value if set).

**Acceptance Scenarios**:

1. **Given** a Linux host with the binary at `~/.local/bin/obsidian` (executable bit set) and no `OBSIDIAN_BIN` override, **when** the MCP server is launched via `npx`, **then** the server boots, `obsidian_exec` registers, and a basic `version` call succeeds.
2. **Given** a Linux host where `~/.local/bin/obsidian` does NOT exist but the binary is reachable via `PATH` (e.g., user installed to `/opt/obsidian`, `~/bin`, or `/snap/bin`), **when** the server boots, **then** the platform-default check fails cleanly, the `PATH` fallback resolves the binary, and basic calls succeed.
3. **Given** a Linux host running under WSL with Obsidian installed inside the WSL guest, **when** the server boots from inside WSL, **then** it behaves exactly like a native Linux host — resolution honours the same Linux platform-default plus `PATH` ordering and basic calls succeed.

---

### User Story 3 — Existing Windows behaviour is preserved (Priority: P1)

A developer on Windows already running the bridge against the v0.3.0 release upgrades to the cross-platform release. The agent-side `obsidian_exec` and typed-tool surface continues to behave identically — every call that succeeded against v0.3.0 succeeds against the new release with the same response shape, and no new failure modes appear in the Windows path.

**Why this priority**: regression-prevention for the only currently-shipping platform. The bridge has Windows users on v0.3.0 today; their experience is the baseline that the cross-platform work cannot regress. P1 because a working baseline that breaks under refactor is worse than the pre-cross-platform state.

**Independent Test**: against the same Windows host that was passing the v0.3.0 test suite, run the new release's full test suite plus the `quickstart.md` flows; assert (a) every test that passed on v0.3.0 still passes, (b) no Windows-only test fails because of the cross-platform changes, and (c) the resolved binary on Windows matches v0.3.0 behaviour (i.e., `OBSIDIAN_BIN` if set, else the bare command name `"obsidian"` resolved by the OS spawn against `PATH`).

**Acceptance Scenarios**:

1. **Given** a Windows host where `obsidian` is on `PATH` (the Obsidian installer's default registration), **when** the new release boots without `OBSIDIAN_BIN` set, **then** resolution behaviour matches v0.3.0 byte-for-byte — the spawned binary, the resulting argv, and the response shape are unchanged.
2. **Given** a Windows host with `OBSIDIAN_BIN` set to an explicit absolute path, **when** the new release boots, **then** the override wins exactly as it did on v0.3.0.
3. **Given** a Windows host where `obsidian` is NOT on `PATH` and `OBSIDIAN_BIN` is unset, **when** the new release boots, **then** the failure mode is the same structured `CLI_BINARY_NOT_FOUND` error v0.3.0 produced — additionally now annotated with the platform name (`"win32"`) and any platform-default path attempted (none on Windows, so the attempted-paths list contains only the `PATH`-lookup branch).

---

### User Story 4 — Missing-binary failure is debuggable (Priority: P1)

A user installs the bridge on a host that does not yet have Obsidian installed (or has it installed at a non-standard location not on `PATH`). The bridge's first CLI invocation fails — but the failure carries enough structured detail (platform name, every path the resolver attempted, the current `PATH`) for the user to fix the install without having to read source code or attach a debugger.

**Why this priority**: bad first-run errors are the single largest contributor to abandoned installs. A failure that says only "binary not found" forces the user to guess which paths were checked, on which platform, against what `PATH`. A failure that names every ingredient lets the user pattern-match against their actual install state. P1 because this is the user's first interaction with the failure surface and sets the support burden for the BI.

**Independent Test**: run the bridge on a host with no `obsidian` binary anywhere — no platform default, no `PATH` entry, no `OBSIDIAN_BIN`. Issue any CLI call. Assert the response is a structured error whose `details` field contains the host platform name (`"darwin"`, `"linux"`, or `"win32"`), the ordered list of paths the resolver attempted (including any `OBSIDIAN_BIN` value when that env var was set), per-path outcome labels, and the current `PATH` env var. Assert no other error code is produced (i.e., the wrapper does not crash, does not return a generic `CLI_NON_ZERO_EXIT`, does not return an empty success).

**Acceptance Scenarios**:

1. **Given** a host with no Obsidian installed and no `OBSIDIAN_BIN` set, **when** any tool call is made, **then** the response is a structured `CLI_BINARY_NOT_FOUND` error whose details include the platform name, the platform-default path that was tried (if applicable to the platform), the `PATH` env var, and a list of attempted paths in resolution order.
2. **Given** a host with `OBSIDIAN_BIN` set to a path that does not exist, **when** any tool call is made, **then** the same structured error fires with `OBSIDIAN_BIN`'s value included in the attempted-paths list and labelled with source `"OBSIDIAN_BIN"` and outcome `"not-found"`.
3. **Given** a host with `OBSIDIAN_BIN` set to a path that exists but is not executable (permission bit cleared), **when** any tool call is made, **then** the same structured error fires with the override path labelled with source `"OBSIDIAN_BIN"` and outcome `"found-but-not-executable"`, so the user can pattern-match the permission issue.
4. **Given** a host where the platform-default path exists but is not executable (permission bit cleared) and `OBSIDIAN_BIN` is unset, **when** any tool call is made, **then** resolution falls through to `PATH` lookup; the structured error fires only if `PATH` lookup also fails to find an executable binary, and the error's attempted-paths list captures both the platform-default attempt (with outcome `"found-but-not-executable"`) and the `PATH` attempt.

---

### User Story 5 — Typed tools inherit cross-platform support automatically (Priority: P1)

The bridge ships a tool surface (`obsidian_exec`, `read_note`, `read_heading`, `read_property`, `find_by_property`, `write_note`, `delete_note`, `help`). Every typed tool that dispatches a CLI call inherits the cross-platform binary resolution without any per-tool plumbing. New typed tools added later (Wave 2 and beyond) inherit the same behaviour by virtue of routing through the centralised CLI-dispatch layer — no per-tool platform branches, no per-tool `OBSIDIAN_BIN` reads.

**Why this priority**: per-tool plumbing is a maintenance trap and a source of cross-platform regressions. Centralising the resolution at the dispatch layer is the lowest-cost defence against per-tool drift. P1 because every typed tool added under Waves 1+ relies on this for free, and a single per-tool branch creeping in undermines the whole BI.

**Independent Test**: pick three typed tools at random (e.g., `read_note`, `write_note`, `read_property`); assert each tool's test suite passes on macOS and Linux without any per-tool platform-specific stubs or test branches; assert that the spawn-call argv shape captured by the tools' tests is identical across platforms except for the resolved binary path itself.

**Acceptance Scenarios**:

1. **Given** the centralised CLI-dispatch layer's resolution behaviour is updated, **when** a typed tool's tests run on macOS, Linux, or Windows, **then** the typed tool's own test code requires no platform branches — only the dispatch layer's resolution tests cover platform-specific behaviour.
2. **Given** a future typed tool is added under the existing dispatch convention, **when** that tool ships, **then** it inherits cross-platform binary resolution with zero per-tool changes.

---

### User Story 6 — Documentation reflects all supported platforms (Priority: P2)

A new user reading the README sees per-platform install instructions for Windows, macOS, and Linux. The platform-specific gotchas (Linux `~/.local/bin` not on the default `PATH` on some distros, macOS Gatekeeper first-run prompt, install-location variance) are called out so users can match their actual install state before reading source code. The `help` tool's per-tool documentation surface is unchanged across platforms — there are no platform-specific carve-outs in the typed-tool docs because the cross-platform work is below the tool surface.

**Why this priority**: docs reduce support burden but do not block the runtime correctness goals of the BI. P2 because the runtime work in US1–US5 stands alone; docs are an amplifier, not a prerequisite.

**Independent Test**: read the updated README's Installation section; verify (a) each of Windows, macOS, and Linux has a subsection covering install path, `PATH` setup, and any platform-specific notes; (b) the existing Windows subsection's content is preserved; (c) `help` tool output for any registered tool is byte-identical regardless of host platform.

**Acceptance Scenarios**:

1. **Given** the README is reviewed by a macOS user, **when** they follow the macOS subsection, **then** they install the bridge end-to-end without consulting source code or external docs beyond the linked Obsidian install guide.
2. **Given** the README is reviewed by a Linux user whose `PATH` does not include `~/.local/bin`, **when** they follow the Linux subsection, **then** the docs explicitly call out the `PATH` setup step and the user does NOT have to debug a "binary not found" error to learn it.
3. **Given** the existing Windows subsection's content, **when** the diff for this BI is reviewed, **then** the Windows content is preserved unchanged (no rewording, no reordering, no factual edits).
4. **Given** the `help` tool is invoked with a registered tool name on macOS, Linux, or Windows, **when** the response is compared across platforms, **then** the output is byte-identical (no platform-specific carve-outs in the per-tool Markdown).

---

### User Story 7 — Symbolic-link install paths resolve correctly (Priority: P3)

A user has a custom install (e.g., a Homebrew-installed Obsidian variant on macOS, or a manual `/usr/local/bin/obsidian` symlink to `/Applications/Obsidian.app/Contents/Resources/.../obsidian`) where the platform-default path is itself a symlink rather than a regular file. The resolver follows the symlink and the spawned process invokes the resolved target binary.

**Why this priority**: covers a population of users with non-default installs but is not blocking for the official-installer case. P3 because the `PATH` fallback covers most symlink scenarios already; ensuring the platform-default check itself dereferences symlinks is a refinement.

**Independent Test**: on macOS, replace `/usr/local/bin/obsidian` with a symlink to a sibling executable; assert resolution succeeds and the spawned process runs the symlink target's effective binary, with no `EISLNK`, `EACCES`, or `ENOENT` error from the resolver.

**Acceptance Scenarios**:

1. **Given** the platform-default path is a symlink to an existing executable file, **when** the resolver checks the platform-default path, **then** the symlink is honoured and the resolver returns the platform-default path (not the symlink target's path) as the binary to spawn — the OS spawn dereferences the symlink itself at execution time.

---

### Edge Cases

- **`OBSIDIAN_BIN` set to non-existent path**: structured `CLI_BINARY_NOT_FOUND` error with the override value in the attempted-paths list, labelled source `"OBSIDIAN_BIN"` and outcome `"not-found"`. Resolution does NOT fall through to platform-default or `PATH` — the user explicitly named the binary.
- **`OBSIDIAN_BIN` set to existing-but-non-executable path**: structured `CLI_BINARY_NOT_FOUND` error with the override path labelled outcome `"found-but-not-executable"`. Resolution does NOT fall through.
- **`PATH` includes the platform-default location**: the platform-default check fires first by ordering and resolves the binary; the `PATH` fallback is not consulted in this path. Resolution is deterministic and does not double-resolve or mis-report.
- **macOS Gatekeeper / quarantine attribute**: first invocation on a fresh install may surface the OS's Gatekeeper prompt; subsequent invocations succeed without prompting. This is an OS-level behaviour outside the bridge's control; the bridge captures and surfaces the resulting error if Gatekeeper denies the spawn.
- **Linux distros that don't follow the `~/.local/bin` convention**: the `PATH` fallback covers `/opt/obsidian`, `~/bin`, `/snap/bin/obsidian`, and similar non-standard locations. The platform-default is a convenience, not a requirement; documented in the README's Linux subsection.
- **macOS users who installed Obsidian to `~/Applications` instead of `/Applications`**: the symlink convention may not apply; the `PATH` fallback covers it. Documented in the README's macOS subsection.
- **WSL Linux guest with Obsidian installed inside WSL**: treated as native Linux. The same resolution ordering applies.
- **WSL Linux guest with Obsidian installed on the Windows host**: explicitly out of scope. Documented as a separate architectural problem (the WSL-side spawn cannot reach Windows binaries through the WSL/host boundary).
- **Obsidian installed but desktop app not yet launched**: resolution succeeds (the binary file exists); the call subsequently fails at the dispatch layer with `CLI_NON_ZERO_EXIT` or a CLI-reported error because the underlying CLI requires a running Obsidian desktop instance. Documented; observable behaviour unchanged from the Windows-only baseline.
- **Obsidian uninstalled mid-session**: resolution at the next call fires `CLI_BINARY_NOT_FOUND` because the previously-resolved path no longer points to an executable file. The bridge does NOT cache the resolved binary across spawns — the resolver runs at each spawn.
- **Platform-default binary exists but is not executable (permission bit cleared)**: resolution falls through to `PATH` lookup. If `PATH` also fails, the structured error includes both the platform-default path (labelled `"found-but-not-executable"`) and the `PATH` attempt.
- **Cowork's MCP runtime tunnels stdio to the bridge process**: the cross-platform binary-resolution work happens entirely inside the MCP server process; Cowork-side configuration is unchanged. Verified.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST honour the `OBSIDIAN_BIN` environment variable as the highest-priority binary source. When set, the resolver tries only the value of `OBSIDIAN_BIN` and does NOT fall through to platform-default or `PATH` lookup if the override path fails to resolve to an executable file.
- **FR-002**: The system MUST attempt the platform-default install path BEFORE falling back to `PATH` lookup, when `OBSIDIAN_BIN` is unset. The platform-default paths are:
  - macOS (`process.platform === "darwin"`): `/usr/local/bin/obsidian`
  - Linux (`process.platform === "linux"`): `~/.local/bin/obsidian` (where `~` expands to the running user's home directory at resolution time)
  - Windows (`process.platform === "win32"`): no separate platform-default — `PATH` lookup only (the official Windows installer registers `obsidian` on `PATH` directly)
- **FR-003**: The system MUST treat a platform-default path as resolved only when the path exists AND is executable by the running user. A path that exists but is not executable counts as "not resolved" and triggers the `PATH` fallback.
- **FR-004**: When neither the override, the platform-default, nor the `PATH` lookup resolves an executable binary, the system MUST fail with a structured `CLI_BINARY_NOT_FOUND` error whose `details` field includes:
  - the host platform name (the literal value of `process.platform`),
  - the ordered list of paths the resolver attempted (with each entry labelled by source: `"OBSIDIAN_BIN"`, `"platform-default"`, `"PATH"`),
  - for each attempted path, an outcome label (`"not-found"`, `"found-but-not-executable"`) sufficient to distinguish "wrong path" from "permission issue",
  - the current `PATH` environment variable's value.
- **FR-005**: The system MUST preserve Windows behaviour byte-for-byte from the v0.3.0 baseline when running on Windows: the resolver attempts `OBSIDIAN_BIN` first, then defers to `PATH` lookup via the OS spawn. No platform-default file-existence pre-check fires on Windows.
- **FR-006**: The cross-platform binary resolution MUST live below every typed tool's CLI dispatch — at the centralised CLI-adapter / dispatch layer (today: [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts)) — so that every existing typed tool and every future typed tool inherits the resolution without per-tool changes.
- **FR-007**: The system MUST follow symbolic links at the platform-default path. A symlink at `/usr/local/bin/obsidian` (or `~/.local/bin/obsidian`) pointing to a real executable MUST resolve as if the binary were directly at the platform-default path — the OS spawn dereferences the symlink at execution time.
- **FR-008**: When `OBSIDIAN_BIN` is set, the resolver MUST treat its value as a single, exact-path attempt — neither prefix-matched, glob-expanded, nor `PATH`-resolved. The override is the agent-operator's explicit naming of the binary.
- **FR-009**: The resolver MUST run at each CLI dispatch (i.e., per spawn). The system MUST NOT cache the resolved path across spawns within the MCP-server-process lifetime — a binary uninstalled or moved mid-session must observably fail at the next call rather than continue to spawn against a stale resolution.
- **FR-010**: The system MUST NOT introduce a new error code for resolution failures. Resolution failures continue to surface as the existing `CLI_BINARY_NOT_FOUND` code; the change is to the `details` field's content (richer attempted-paths list, platform name, per-path outcome labels) — not to the code surface.
- **FR-011**: The system MUST NOT add a new MCP tool, a new ADR, or a new public-API surface as part of this BI. The work is entirely below the typed-tool surface; the agent-visible tool list and per-tool input/output contracts are unchanged.
- **FR-012**: The README's Installation section MUST gain per-platform subsections for macOS and Linux. The existing Windows subsection MUST be preserved unchanged in content and ordering.
- **FR-013**: The `help` tool's per-tool Markdown documentation MUST remain platform-neutral. No per-tool docs gain a "macOS-only" or "Linux-only" carve-out as a result of this BI.
- **FR-014**: Each P1 acceptance criterion MUST be locked by at least one regression test that survives subsequent re-runs unchanged. Test seams MUST allow simulating each platform branch without requiring the test to physically run on that platform (e.g., injecting `process.platform`, `os.homedir()`, and filesystem-existence checks via dependency injection).
- **FR-015**: The system MUST NOT auto-install Obsidian on the host. Resolution surfaces an existing install — if the user has not yet installed Obsidian, the structured error from FR-004 is the bridge's deliverable, and the install is the user's responsibility (linked in the README's per-platform sections).
- **FR-016**: WSL Linux guests with Obsidian installed inside the guest MUST be treated as native Linux hosts. WSL guests where Obsidian is installed on the Windows host (across the guest/host boundary) are explicitly out of scope; the bridge does not attempt cross-boundary spawn and does not document such a configuration as supported.
- **FR-017**: The bridge's existing test framework, lint config, type-check config, and dependency surface MUST be sufficient for the cross-platform work — no new runtime dependencies are added solely to satisfy this BI's resolver. Standard-library APIs (`node:os`, `node:fs`, `node:path`, `node:process`) are the resolver's only foundation.
- **FR-018**: The cross-platform work MUST remain compatible with the project Constitution's Principles I–V. The resolver MUST live in a per-surface module, MUST ship co-located tests covering happy-path and failure-or-boundary cases for each platform branch, MUST surface failures through the existing `UpstreamError` shape, and MUST carry an `Original — no upstream.` header on each new source file (or the appropriate attribution header on any code lifted from another project).
- **FR-019**: The `package.json` `description` field and the `README.md` opening paragraph MUST be updated to reflect that the bridge supports Windows, macOS, and Linux hosts (today both describe the bridge as "Windows-host"). The description text outside this scope-bump SHOULD be otherwise preserved.
- **FR-020**: When `OBSIDIAN_BIN` is set to a path that exists but is not executable, resolution MUST fail with the structured error rather than fall through. The override is the user's explicit naming and a permission failure on the named binary is a user-fixable misconfiguration that should be surfaced loudly, not masked by silent fallback.

### Key Entities

- **Platform identity**: the canonical name of the host OS for the running MCP-server process. Values: `"darwin"` (macOS), `"linux"` (Linux including WSL guests), `"win32"` (Windows). Drives which platform-default path is attempted. Sourced from Node's `process.platform` at resolution time.
- **Resolution attempt**: a single ordered tuple `(source, path, outcome)` capturing one branch of the resolver's decision. `source` is one of `"OBSIDIAN_BIN"`, `"platform-default"`, `"PATH"`. `path` is the absolute path checked (or the bare command name in the `PATH` case). `outcome` is one of `"resolved"`, `"not-found"`, `"found-but-not-executable"`. The structured error in FR-004 carries the ordered list of attempts.
- **Platform-default path**: the per-platform location the official Obsidian installer (or distro-equivalent) registers the binary at. macOS: `/usr/local/bin/obsidian`. Linux: `~/.local/bin/obsidian` (user-local, expanded against the running user's home directory). Windows: not applicable — `PATH` registration is the equivalent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user on macOS Sonoma or later, with the official Obsidian installer's symlink at `/usr/local/bin/obsidian`, can boot the bridge with a single `npx -y @marwansaab/obsidian-cli-mcp` invocation and have a basic `obsidian_exec` `version` call return Obsidian's running version on stdout — without setting `OBSIDIAN_BIN`, without manual `PATH` adjustments, and without consulting source code.
- **SC-002**: A user on Ubuntu 22.04+ (or equivalent), with the binary at `~/.local/bin/obsidian` and that path on their `PATH`, can boot the bridge with a single `npx` invocation and have a basic `obsidian_exec` `version` call succeed under the same conditions.
- **SC-003**: A user on Windows running v0.3.0 today sees zero behaviour changes when upgrading to the cross-platform release. Every test that passes on v0.3.0 passes on the new release; every `obsidian_exec` and typed-tool call produces a byte-for-byte identical response shape.
- **SC-004**: A user on a host with no Obsidian installed (or with Obsidian at a non-standard, non-`PATH` location and no `OBSIDIAN_BIN` set) makes a tool call and receives a single structured `CLI_BINARY_NOT_FOUND` error whose detail field names the platform, lists every path attempted in resolution order with per-path outcome labels, and includes the current `PATH` — sufficient for the user to fix the install without reading source code.
- **SC-005**: All eight currently-shipping tools (`obsidian_exec`, `help`, `read_note`, `read_heading`, `read_property`, `find_by_property`, `write_note`, `delete_note`) work on macOS, Linux, and Windows hosts with zero per-tool platform-specific code. New typed tools added in subsequent BIs inherit cross-platform support automatically.
- **SC-006**: 100% of the P1 acceptance criteria across User Stories 1–5 are locked by at least one automated regression test that survives subsequent CI runs unchanged.
- **SC-007**: A new user reading the README can, on each of the three supported platforms, complete the install end-to-end without consulting source code, without consulting external docs other than the linked Obsidian install guide, and without trial-and-error setting of `OBSIDIAN_BIN`.
- **SC-008**: When the resolver's platform-default path is a symlink (Homebrew variant, custom install symlink), the bridge spawns successfully — exit-zero — without any `EISLNK`, `EACCES`, or `ENOENT` error from the resolver itself.
- **SC-009**: Cowork's MCP runtime (and any equivalent host-process MCP runtime that launches the configured `command` and tunnels stdio) requires zero changes in this BI. The cross-platform work happens entirely inside the bridge's own process, below the MCP wire boundary; the runtime sees the same `npx` command and the same stdio shape regardless of host platform.
- **SC-010**: A `CLI_BINARY_NOT_FOUND` error fired on a host with no Obsidian installed contains 100% of the diagnostic ingredients required to fix the install: platform name, attempted-paths list with sources, per-path outcome labels, and the current `PATH`. No subsequent tool call or source-code consultation is required to identify which paths the resolver checked.

## Assumptions

- The user has a working Obsidian desktop install on their host. The bridge resolves an existing install; auto-installing Obsidian is out of scope.
- The user has Node.js >= 22.11 installed on their host, matching the existing `engines.node` floor. No new runtime requirement is introduced.
- The official Obsidian installer's macOS symlink at `/usr/local/bin/obsidian` is the canonical install location for the macOS platform-default check. Users who installed to a different location (e.g., `~/Applications`) rely on the `PATH` fallback or on `OBSIDIAN_BIN`.
- The Obsidian installer's Linux convention of placing the binary at `~/.local/bin/obsidian` is the canonical location for the Linux platform-default check. Distros and personal-preference installs that use other locations rely on the `PATH` fallback or on `OBSIDIAN_BIN`.
- The CLI requires a running Obsidian desktop instance per its own documented behaviour. Headless workflows are out of scope — those route through Obsidian Headless, not this MCP. If the user's Obsidian desktop is not running, calls will fail at the dispatch layer (after resolution succeeds), not at the resolver.
- macOS Gatekeeper and quarantine-attribute behaviour is the OS's responsibility. The bridge captures and surfaces the resulting error if Gatekeeper denies the spawn but does not attempt to bypass or pre-handle Gatekeeper prompts.
- Cowork's MCP runtime — and equivalent host-process runtimes — is unchanged. The cross-platform work is entirely server-side; clients see the same wire surface regardless of host platform.
- The binary path is server-side; the agent never supplies it. No injection vector is introduced by extending the resolution logic.

## Out of Scope

- WSL routing across the Linux-guest / Windows-host boundary — separate architectural problem; not addressed here.
- A separate macOS-only or Linux-only MCP variant — one binary, one resolution layer, all platforms.
- Universal-binary or ARM-vs-x86 distinctions in the wrapper — Obsidian's installer handles architecture automatically; the wrapper does not branch by `process.arch`.
- Headless / CI environments — the underlying CLI requires a running Obsidian desktop instance.
- Auto-installing Obsidian on the host — that's the user's responsibility; the bridge resolves an existing install and surfaces a structured error when no install is found.
- Caching the resolved binary path across spawns — out of scope per FR-009; resolution runs at each spawn so that mid-session install changes are observable.
- Adding a new error code for resolution failures — out of scope per FR-010; the existing `CLI_BINARY_NOT_FOUND` code is extended via richer `details`, not multiplied.
