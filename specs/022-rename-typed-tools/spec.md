# Feature Specification: Rename Typed Tools to Match Upstream CLI Subcommand Names

**Feature Branch**: `022-rename-typed-tools`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User description: "Rename five typed tools (`read_note` → `read`, `delete_note` → `delete`, `list_files` → `files`, `write_property` → `set_property`, `rename_note` → `rename`) to match their upstream Obsidian CLI subcommand names; single-release MINOR-bump breaking change with no deprecation aliases."

## Background *(non-mandatory context)*

This feature is a **surface-rename sweep**, not a new tool wrap. Across features 006 / 011 / 012 / 013 / 014 / 015 / 018 / 019 / 021 the wrapper has accumulated nine typed tools whose names were chosen one-at-a-time without a uniform convention. Five of those nine names diverge — by a wrapper-side decision rather than an upstream constraint — from the Obsidian CLI subcommand they wrap:

| Current typed-tool name | Upstream CLI subcommand | Mismatch character |
|-------------------------|-------------------------|--------------------|
| `read_note`             | `read`                  | wrapper-added `_note` suffix narrows scope to "notes" though `read` operates on any vault file |
| `delete_note`           | `delete`                | wrapper-added `_note` suffix narrows scope identically |
| `list_files`            | `files`                 | wrapper-added `list_` verb prefix that the CLI omits |
| `write_property`        | `property:set`          | semantic translation (`write` for `set`) that breaks the namespace-reversal convention applied elsewhere |
| `rename_note`           | `rename`                | wrapper-added `_note` suffix narrows scope identically (the typed surface is currently scoped to `.md` per 021-rename-note's clarifications, but the upstream subcommand is just `rename`) |

The cost of those mismatches falls on MCP client authors: a caller reading `tools/list` sees `read_note` and reasonably concludes the tool only operates on Markdown notes, when in fact the wrapped CLI subcommand handles any vault file (Markdown, Canvas, Bases, attachments). The handler-layer filetype widening that closes this gap at the **behaviour** layer is tracked separately under BI-060; this BI closes it at the **name** layer.

Two naming conventions are codified by this BI:

- **Single-word upstream subcommand → tool name equals the subcommand verbatim.** Applies to `read`, `delete`, `files`, `rename`.
- **Composite `namespace:action` upstream subcommand → tool name is the `action_namespace` reversal (lowercase, underscore-joined).** Applies to `property:set` → `set_property`. The convention is the same pattern the existing `read_property` and `find_by_property` names follow against upstream `property:get` and `property:find`.

The rename is shipped as a **single bundled release** with no deprecation-alias layer. The pre-v1.0 window is the bounded-cost moment to consolidate; carrying both old and new names forward — even briefly — doubles the surface area callers have to learn, doubles the test matrix, and turns "which name is canonical" into a question the docs have to answer indefinitely. After v1.0 the wrapper would owe callers a stability guarantee on whatever names ship; correcting the names afterwards becomes a major-bump migration. Doing it now is a MINOR-bump migration with one changelog block.

This BI does not touch:

- **Tool handler behaviour.** Every renamed tool accepts the same schema fields, returns the same output shape, surfaces the same error codes, and respects the same per-mode invariants as it did pre-rename. The only observable change to a caller is the tool name in `tools/list` and `tools/call`.
- **Schema field names.** `target_mode`, `vault`, `file`, `path`, `name`, `value`, `type`, `folder`, `ext`, `total`, `heading`, and any other field defined on a renamed tool's input schema keep their names exactly. A rename of *tool* names does not justify a rename of *field* names.
- **Tools that lack a 1:1 upstream CLI subcommand to anchor against.** `write_note`, `find_by_property`, and `read_heading` are out of scope: `write_note` wraps multiple upstream behaviours (create + overwrite + frontmatter shaping), `find_by_property` wraps `eval` (no `property:find` subcommand exists), and `read_heading` likewise wraps `eval`. Renaming these would require independent decisions about what their canonical names should be — tracked as separate BIs.
- **Bridge / MCP-meta tools.** `obsidian_exec` and `help` have no upstream CLI subcommand counterpart (they are wrapper-native primitives), so no upstream-alignment rationale applies.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — `tools/list` exposes the five new names; the five old names are absent (Priority: P1)

An MCP client author boots the wrapper and asks the server for its tool catalogue. They expect every tool whose upstream CLI subcommand is publicly named to surface under the upstream name (with the `namespace:action` reversal convention for composite subcommands). They send `tools/list` and the response includes `read`, `delete`, `files`, `set_property`, and `rename` as named typed tools alongside the unchanged tools (`write_note`, `find_by_property`, `read_heading`, `obsidian_exec`, `help`). The five retired names (`read_note`, `delete_note`, `list_files`, `write_property`, `rename_note`) are not present under any form — no alias, no deprecated-stub, no hidden synonym.

**Why this priority**: This is the headline value of the feature. The surface change is what every other piece of work hinges on; without it, the migration block, version bump, help routing, and pre-release verification all have nothing to verify. An MCP client author who reads `tools/list` after the release sees a catalogue that's predictable from the upstream CLI subcommand names — which is the entire point of the BI.

**Independent Test**: With the wrapper booted in-process and a stub `spawnFn`, calling `tools/list` against the MCP server returns a payload whose `tools[].name` array (a) contains every member of `{read, delete, files, set_property, rename}`, (b) contains zero members of `{read_note, delete_note, list_files, write_property, rename_note}`, and (c) is otherwise byte-identical to the pre-rename baseline in length and unchanged-tool membership. The test does not depend on the live CLI — it asserts the registration shape only.

**Acceptance Scenarios**:

1. **Given** the wrapper is booted with default configuration, **When** an MCP client calls `tools/list`, **Then** the response's `tools[].name` array includes `read`, `delete`, `files`, `set_property`, and `rename` exactly once each AND does NOT include `read_note`, `delete_note`, `list_files`, `write_property`, or `rename_note`.
2. **Given** the wrapper is booted, **When** an MCP client iterates the `tools[].name` array and intersects it with the pre-rename baseline's name set, **Then** the symmetric difference is exactly `{added: [read, delete, files, set_property, rename], removed: [read_note, delete_note, list_files, write_property, rename_note]}` — no surprise additions, no surprise removals, no unexpected name flips.
3. **Given** the wrapper is booted, **When** an MCP client looks up the schema, description, and input shape for each new name, **Then** every field that was present on the corresponding pre-rename tool is present under the new name AND no field was added or removed as part of the rename.

---

### User Story 2 — Renamed tools accept the same inputs and return the same outputs as their pre-rename counterparts (Priority: P1)

A migrating MCP client author updates their stored configuration to reference the new names and re-runs the same call shapes that worked pre-rename. Each call returns the same result — same output shape, same field values, same error codes for failure paths. The caller does not need to translate field names, retype arguments, or branch on the wrapper version. The rename is **purely a surface-name change**.

For example: a caller who previously invoked `read_note({ target_mode: "specific", vault: "MyVault", path: "Inbox/Note.md" })` and got back `{ content: "<file body>" }` now invokes `read({ target_mode: "specific", vault: "MyVault", path: "Inbox/Note.md" })` against the renamed tool and gets back `{ content: "<file body>" }` byte-identical. A caller who previously got `CLI_REPORTED_ERROR` with a specific message for a malformed call now gets the same `CLI_REPORTED_ERROR` with the same message under the new name. No new error codes are introduced.

**Why this priority**: P1 alongside Story 1. A rename without behaviour preservation would not be a rename — it would be a name change *and* a behaviour change shipped together, which violates the "one bundled migration" contract callers are promised. The two stories are inseparable from the caller's perspective: the surface change is what's visible, the behaviour preservation is what makes the visible change safe.

**Independent Test**: A regression-test sweep over each renamed tool that drives the new name through a stub adapter using the same call shapes the pre-rename test suite exercised and asserts identical output. Per-tool tests assert: (a) the input schema accepts the same set of valid inputs as pre-rename, (b) the output shape matches pre-rename exactly, (c) the failure error codes match pre-rename exactly, and (d) the argv emitted by the adapter for any given input is byte-identical to pre-rename.

**Acceptance Scenarios**:

1. **Given** the wrapper is booted with a stub `spawnFn` that mirrors pre-rename CLI behaviour, **When** an MCP client invokes any of the five renamed tools (e.g. `read`, `delete`, `files`, `set_property`, `rename`) with arguments that the pre-rename counterpart accepted as valid, **Then** the tool returns a result whose JSON-serialised payload is byte-identical to what the pre-rename counterpart returned for the same inputs.
2. **Given** the wrapper is booted, **When** an MCP client invokes a renamed tool with inputs that the pre-rename counterpart rejected as `VALIDATION_ERROR`, **Then** the renamed tool rejects with `VALIDATION_ERROR` and the issue path / message is byte-identical to pre-rename.
3. **Given** the wrapper is booted with a stub `spawnFn` that exits non-zero or emits an in-band `Error:` reply, **When** an MCP client invokes a renamed tool against that stub, **Then** the tool returns an MCP error response whose `code` matches what the pre-rename counterpart returned for the same stub behaviour (no new error codes are introduced; the set of codes the renamed tools can produce is exactly the set the pre-rename counterparts produced).
4. **Given** the wrapper is booted, **When** an MCP client lists each renamed tool's input-schema field names, **Then** every field name matches pre-rename exactly — no schema field has been renamed, added, or removed as part of this BI.

---

### User Story 3 — A single migration block in CHANGELOG.md documents all five renames coherently (Priority: P2)

An MCP client author reading the release's `CHANGELOG.md` finds a single migration block that lists all five renames with their rationale, presented together. The block names every old → new mapping, describes the naming convention being applied (single-word verbatim; `namespace:action` reversed), and tells callers what they need to do to migrate (search-and-replace the five names in their stored MCP-client configurations). The block is not scattered across five separate changelog entries — the caller can read the migration in one pass.

The author also notices the release's semver version number reflects a **MINOR bump** from the previous release (e.g., `0.4.x → 0.5.0`). A PATCH bump would understate the breaking change; a MAJOR bump would overstate it in a pre-v1.0 codebase where `0.x.y` semver semantics permit MINOR-level breaking changes.

**Why this priority**: P2 — the migration documentation is downstream of the surface change (you can't document what hasn't shipped), but it's how callers learn what changed and what to do about it. Without a coherent migration block, callers discover the rename by getting tool-not-found errors at runtime, which forces a debug-then-fix cycle instead of a read-then-update cycle. The semver bump is part of the same story because that's the field downstream tooling (dependency managers, semver-bot integrations) reads to flag the release as breaking.

**Independent Test**: A documentation-audit test over the rename release's `CHANGELOG.md` body. The test asserts: (a) a single contiguous block exists that lists all five old → new mappings, (b) the block contains the strings `read_note → read`, `delete_note → delete`, `list_files → files`, `write_property → set_property`, and `rename_note → rename`, (c) the release section header reflects a MINOR bump from the previous release, and (d) no other section of `CHANGELOG.md` references the renames piecemeal. A separate audit over `package.json`'s `version` field confirms the MINOR bump numerically.

**Acceptance Scenarios**:

1. **Given** the rename release's `CHANGELOG.md`, **When** a caller reads it top-to-bottom, **Then** they encounter exactly one section dedicated to the rename and that section lists all five old → new mappings together with the naming convention rationale.
2. **Given** the rename release's `package.json`, **When** a caller compares its `version` to the previous release's `version`, **Then** the MINOR component has incremented by one AND the PATCH component has reset to zero AND the MAJOR component is unchanged.
3. **Given** the rename release's README and `docs/tools/*.md` files, **When** a caller searches for references to renamed tools, **Then** every reference uses the new name — except where an old-name reference is deliberately preserved as historical narrative (e.g., a "renamed in v0.x" callout, a predecessor-feature reference inside `CLAUDE.md`'s retained-narrative blocks).

---

### User Story 4 — `help` routes by new name and rejects old names (Priority: P2)

A caller invoking the `help` tool to read a renamed tool's documentation passes the new name and receives the doc body for that tool. A caller who hasn't migrated yet and passes an old name receives a structured tool-not-found error — not a silently-aliased redirect, not an empty response. The strict rejection forces the caller to update their reference rather than continuing to operate against a name that no longer exists in `tools/list`.

For example: `help({ tool_name: "read" })` returns the body of `docs/tools/read.md` (renamed from `docs/tools/read_note.md`). `help({ tool_name: "read_note" })` returns the same tool-not-found error shape that `help` returns today for any unknown name.

**Why this priority**: P2 — `help`'s routing behaviour is part of the migration UX. A caller who asks the wrapper "what tools exist and how do I use them" must get a coherent answer that points them at the new names. Aliasing `help` to old names would contradict Story 1's "no deprecation aliases" contract; failing silently would leave the caller without a recovery path.

**Independent Test**: Per-name `help` tests. For each of the five new names, `help({ tool_name: "<new>" })` returns the doc body successfully. For each of the five old names, `help({ tool_name: "<old>" })` returns a tool-not-found error with the same code and message shape `help` returns for any unknown name today.

**Acceptance Scenarios**:

1. **Given** the wrapper is booted post-rename, **When** an MCP client calls `help({ tool_name: "read" })` (or `delete`, `files`, `set_property`, `rename`), **Then** the response carries the doc body for the renamed tool (sourced from `docs/tools/<new-name>.md`).
2. **Given** the wrapper is booted post-rename, **When** an MCP client calls `help({ tool_name: "read_note" })` (or `delete_note`, `list_files`, `write_property`, `rename_note`), **Then** the response is a structured tool-not-found error — the same error shape `help` returns for any name not in the typed-tool registry; it does NOT carry the renamed tool's doc body and does NOT mention the new name.
3. **Given** the wrapper is booted, **When** an MCP client calls `help` without arguments to receive the full tool catalogue, **Then** the catalogue listing reflects the new names exactly and does not list any retired name.

---

### User Story 5 — Pre-release verification confirms the surface change matches the planned punch-list (Priority: P3)

The wrapper maintainer building the rename branch wants confidence that the surface change matches what was planned — no surprise additions, no surprise removals, no unexpected name flips. They capture the `tools/list` envelope from the rename branch and diff it against the pre-rename baseline (captured from `main` immediately before the rename branch was cut). The diff matches the expected five-rename punch-list exactly: five names removed, five names added, every other entry unchanged.

**Why this priority**: P3 — this is a maintainer-facing verification gate rather than a caller-facing capability. It's lower priority than caller-facing stories because the rename will be visible to callers regardless of whether the maintainer ran this check; the value is catching maintainer errors (e.g., accidentally adding a sixth rename, accidentally forgetting one of the five, accidentally renaming a tool's field by typo) before the release ships rather than after.

**Independent Test**: An automated unit test (added as part of this BI) that compares the live `tools/list` output against a checked-in JSON baseline of the five-rename punch-list. The baseline lists the exact set of `removed` and `added` tool names. The test fails if any of the following hold: (a) any retired name still appears in the registry, (b) any new name is missing from the registry, (c) any tool not in the punch-list has been renamed, or (d) any tool has been added/removed besides the punch-list. The test is removed (or its baseline is rolled forward) after the rename release ships.

**Acceptance Scenarios**:

1. **Given** the rename branch is built and the pre-rename baseline `tools/list` snapshot is checked in alongside the test, **When** the maintainer runs the verification test, **Then** the test passes — the diff matches the five-rename punch-list exactly.
2. **Given** the rename branch is modified to accidentally rename a sixth tool (e.g., a maintainer typo renames `write_note` → `write`), **When** the verification test runs, **Then** the test fails and the failure message names the surprise rename.
3. **Given** the rename branch accidentally omits one of the planned five renames (e.g., `rename_note` was missed), **When** the verification test runs, **Then** the test fails and the failure message names the missing rename.

---

### Edge Cases

- **Caller invokes a retired name via `tools/call`.** The MCP server returns the standard "tool not found" error for an unknown tool name. The error message names the unknown tool by the name the caller supplied (e.g., `read_note`) — it does NOT include a "did you mean: read?" suggestion as part of this BI, because building an alias-suggestion layer is a separate decision and risks behaving as a soft-deprecation channel. The changelog block is the canonical migration aid.
- **Caller's stored configuration references a mix of old and new names.** Each old-name reference fails with tool-not-found independently; each new-name reference succeeds. The wrapper does not maintain partial-migration state; the caller migrates all five references or none.
- **A predecessor `CLAUDE.md` block, predecessor `spec.md`, or git commit message references an old name.** These are deliberate historical narrative and are NOT rewritten by this BI. Story 3's acceptance scenario about README/doc references covers forward-facing documentation only.
- **The retained-narrative blocks in `CLAUDE.md` mention `read_note`, `delete_note`, etc. as predecessor names.** These remain unchanged — the narrative blocks describe historical state at the time the predecessor BI shipped. Rewriting them would falsify the historical record and produce drift between the narrative and the predecessor `spec.md` files. The current-feature narrative block at the top of `CLAUDE.md` (active at the time of the rename release) uses new names.
- **The naming convention encounters a tool whose upstream subcommand is multi-word but not `namespace:action` shaped.** No such tool exists in the current registry or the in-scope renames, but if a future tool's upstream subcommand is e.g. `my-action` or `verb noun`, the convention does not prescribe a behaviour. The convention as codified by this BI is sufficient for the five renames in scope; future tools whose upstream subcommand falls outside the two patterns require an explicit naming decision when they are added. Documented in Assumptions.
- **A renamed tool's `docs/tools/<old-name>.md` file is renamed to `docs/tools/<new-name>.md`.** The registry-consistency test that asserts a doc file exists per registered tool (introduced by 005-help-tool) is updated to point at the new path. The rename release does NOT leave a stale `docs/tools/<old-name>.md` file in the repo, and does NOT add a redirect / placeholder at the old path.
- **A caller's MCP client library caches the `tools/list` response.** Between cache invalidations the caller may continue to use stale names. This is an MCP-client concern, not a wrapper concern — the wrapper's contract is that the server returns the correct list at boot; the caller's cache invalidation is the caller's responsibility. Story 3's migration block notes this so callers know to flush any stored cache.
- **The handler-layer filetype widening (BI-060) lands before this rename.** This BI does not depend on the order: if BI-060 lands first, the renamed tools simply describe a widened scope using the new names from day one. If this rename lands first (the expected order), the tool descriptions temporarily continue to read "note" in some places — an accepted, time-bounded mismatch per the out-of-scope clause that BI-060 closes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The wrapper MUST expose typed tools named `read`, `delete`, `files`, `set_property`, and `rename` in `tools/list`.
- **FR-002**: The wrapper MUST NOT expose typed tools named `read_note`, `delete_note`, `list_files`, `write_property`, or `rename_note` in `tools/list` under any name, alias, deprecation-stub, or hidden-synonym mechanism.
- **FR-003**: The wrapper's naming convention MUST be: a single-word upstream Obsidian CLI subcommand maps to a tool name equal to the subcommand verbatim. (Applied here to `read`, `delete`, `files`, `rename`.)
- **FR-004**: The wrapper's naming convention MUST be: a composite `namespace:action` upstream Obsidian CLI subcommand maps to a tool name in the `action_namespace` form, lowercase, joined by underscore. (Applied here to `property:set` → `set_property`.)
- **FR-005**: Each renamed tool MUST accept the same input-schema field names, field types, optionality, and field-level constraints as its pre-rename counterpart.
- **FR-006**: Each renamed tool MUST return the same output shape (field names, field types, presence/absence semantics) as its pre-rename counterpart.
- **FR-007**: Each renamed tool MUST surface the same `UpstreamError` error codes for the same upstream failure modes as its pre-rename counterpart.
- **FR-008**: No new `UpstreamError` codes MAY be introduced by this BI.
- **FR-009**: The renamed tools' implementation files MAY be moved to new paths matching the new names (e.g., `src/tools/read_note/` → `src/tools/read/`) but MUST NOT change the implementation's externally observable behaviour.
- **FR-010**: The release's `CHANGELOG.md` MUST contain a single migration block that lists all five old → new mappings together with the naming-convention rationale.
- **FR-011**: The release's `package.json` `version` field MUST reflect a MINOR semver bump from the previous release.
- **FR-012**: The release's `README.md` and per-tool help documents (`docs/tools/*.md`) MUST reference renamed tools by the new name, except where an old-name reference is deliberately preserved as historical narrative (e.g., a "renamed in v0.x" callout or a `CLAUDE.md` retained-narrative block).
- **FR-013**: For each of the five renamed tools, `help({ tool_name: "<new_name>" })` MUST return the doc body for the renamed tool sourced from `docs/tools/<new_name>.md`.
- **FR-014**: For each of the five retired names, `help({ tool_name: "<old_name>" })` MUST return a tool-not-found error using the same error shape `help` returns for any unknown tool name; it MUST NOT alias to the renamed tool.
- **FR-015**: The `help` tool's catalogue listing (when called without arguments) MUST list renamed tools by the new name and MUST NOT list retired names.
- **FR-016**: Schema field names (e.g. `target_mode`, `vault`, `file`, `path`, `name`, `value`, `type`, `folder`, `ext`, `total`, `heading`) MUST NOT change as part of this BI.
- **FR-017**: The wrapper MUST NOT rename `write_note`, `find_by_property`, `read_heading`, `obsidian_exec`, or `help` as part of this BI.
- **FR-018**: A pre-release verification mechanism (an automated unit test) MUST compare the post-rename `tools/list` registry against a checked-in baseline of the five-rename punch-list and fail if any of: a retired name still appears; a new name is missing; a tool outside the punch-list has been renamed; or any tool has been added or removed beyond the punch-list.
- **FR-019**: The `docs/tools/<old_name>.md` files MUST be renamed to `docs/tools/<new_name>.md` (or replaced with new files of the same body content under the new names). The repo MUST NOT contain stale `docs/tools/<old_name>.md` files post-release.
- **FR-020**: Internal cross-references between docs / code / specs that point at a renamed tool MUST be updated to use the new name, except where an old-name reference is deliberately preserved as historical narrative (see FR-012 for the exception scope). Predecessor `specs/0XX-*/spec.md` files and `CLAUDE.md`'s retained-narrative blocks describing historical state are NOT rewritten.
- **FR-021**: The renamed tool implementations' factory function names (e.g., `createReadNoteTool` → `createReadTool`) MAY be updated to match the new tool names. This is an internal-code rename and has no caller-visible effect; it is included only because retaining factory names that name a retired tool would create drift between the registry and the source.

### Key Entities *(include if feature involves data)*

- **Tool name**: the public identifier callers use in `tools/call`, `tools/list`, and `help({ tool_name })`. The five tool names that change as part of this BI are listed under FR-001 / FR-002.
- **Naming convention**: the rule mapping an upstream CLI subcommand to a typed-tool name. Two clauses, codified by FR-003 and FR-004.
- **Pre-rename baseline `tools/list`**: a JSON snapshot of the `tools/list` envelope captured from `main` immediately before the rename branch is cut. Used by FR-018's verification mechanism to confirm the rename diff matches the punch-list exactly.
- **Migration block**: the single contiguous section of `CHANGELOG.md` that documents all five renames for the rename release. Referenced by FR-010 and Story 3.
- **Per-tool help document**: the Markdown file at `docs/tools/<tool_name>.md` that `help({ tool_name })` returns the body of. Referenced by FR-013, FR-014, FR-019.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the release ships, 100% of the five planned renames are reflected in `tools/list` — every new name appears under its new name and every retired name is absent.
- **SC-002**: After the release ships, an MCP client author who only changed tool-name references in their configuration (no other code changes) sees identical behaviour for every previously-working call — 100% of pre-rename successful call shapes succeed under the new names with byte-identical output.
- **SC-003**: After the release ships, an MCP client author who only changed tool-name references sees identical error codes for every previously-failing call — 100% of pre-rename failure paths produce the same `UpstreamError` code under the new names.
- **SC-004**: A caller can complete the migration of all five renames by reading exactly one section of `CHANGELOG.md` — no information needed for the migration is scattered across other changelog entries, other release notes, or external documentation.
- **SC-005**: The release's semver version number reflects a MINOR bump only — the MAJOR component is unchanged from the previous release, the MINOR component has incremented by one, and the PATCH component has reset to zero.
- **SC-006**: After the release ships, 100% of `help({ tool_name: "<retired_name>" })` invocations return a tool-not-found error and 0% return the renamed tool's doc body.
- **SC-007**: After the release ships, 100% of references to a renamed tool in `README.md` and `docs/tools/*.md` use the new name (the only exception is deliberate historical narrative, scoped per FR-012).
- **SC-008**: The pre-release verification test (FR-018) passes on the rename branch and fails on a tampered branch where any planned rename is omitted, any unplanned rename is added, or any tool outside the punch-list is altered.
- **SC-009**: No new `UpstreamError` codes are introduced by the rename release — the set of error codes the renamed tools can produce equals the set their pre-rename counterparts produced.
- **SC-010**: No schema field names change as part of the rename release — the set of input-schema field names exposed by each renamed tool equals the set exposed by its pre-rename counterpart.

## Assumptions

- **Pre-v1.0 window applies.** The wrapper is in the `0.x.y` pre-v1.0 phase where MINOR-level breaking changes are permitted under semver semantics. After v1.0 a rename of this scope would require a MAJOR bump; the bounded-cost-now rationale depends on the v1.0 line not yet having been crossed.
- **MCP clients are responsible for their own configuration updates.** The wrapper does not maintain a deprecation-alias layer, a tool-name-suggestion layer, or a "did you mean" hint in the tool-not-found error. The single changelog migration block (FR-010) is the canonical migration aid; clients read it and update their configurations.
- **Two naming-convention clauses are sufficient for the five in-scope renames.** Future typed-tool additions whose upstream subcommand falls outside the single-word and `namespace:action` patterns require an explicit naming decision at the time they are added. This BI does not pre-codify a third clause for hypothetical future shapes.
- **The handler-layer filetype widening (BI-060) is decoupled.** This BI ships independently of BI-060; the temporary name/description mismatch (where `read` implies broader scope than the description currently describes) is accepted and resolved when BI-060 lands. The two BIs do not block each other.
- **BI-019 / 021-rename-note ships its tool as `rename_note` first per its current plan.** The rename to `rename` happens as part of this sweep, applied to whichever name `rename_note` was registered under when this BI's branch is cut. This BI does not amend 021's plan to ship `rename` directly — 021 ships first under its existing name; this BI renames it as part of the wider sweep.
- **The registry-consistency test introduced by 005-help-tool gates the per-tool doc-file existence.** Renaming `docs/tools/<old>.md` → `docs/tools/<new>.md` keeps that test passing because the test asserts existence of a file per registered tool by current name. The test does not require a transition aid for renamed files.
- **Future MCP connector implementations for Obsidian (or related vault ecosystems) are out of scope.** This BI's convention applies to this wrapper only; other connectors make their own naming decisions independently.

## Out of Scope

- **Renaming `write_note`, `find_by_property`, `read_heading`.** These typed tools have no 1:1 upstream CLI subcommand to anchor against and are tracked as separate decisions. `write_note` wraps multiple upstream behaviours; `find_by_property` and `read_heading` wrap `eval`.
- **Renaming `obsidian_exec` or `help`.** These are wrapper-native bridge / MCP-meta tools with no upstream CLI subcommand counterpart.
- **Renaming schema field names.** `target_mode`, `vault`, `file`, `path`, `name`, `value`, `type`, `folder`, `ext`, `total`, `heading`, and any other input-schema field stay unchanged. Only tool names change.
- **Deprecation-window aliases that keep the old names alive alongside the new ones.** The cleanup is wholesale by intent — no grace period.
- **Backporting the rename to older wrapper releases.** Forward-going only, against current `main`.
- **A "did you mean: <new_name>?" suggestion in the tool-not-found error.** Future enhancement at most; not part of this BI.
- **Applying the convention to other MCP connectors in the broader vault ecosystem.** Separate connectors make their own naming decisions.
- **The handler-layer filetype widening that closes the same false-advertisement gap at the behaviour layer.** Tracked separately under BI-060, which ships after this rename. Top-level tool `description:` text on the renamed tools is NOT required to broaden its filetype-scope language as part of this release; the temporary mismatch is accepted and resolved when BI-060 lands (before v1.0).
- **Amending BI-019 / 021-rename-note's plan to ship `rename` directly.** 021 ships `rename_note` first per its current plan; this BI renames it to `rename` as part of the wider sweep.
- **Changes to any predecessor `specs/0XX-*/spec.md` file or `CLAUDE.md`'s retained-narrative blocks describing historical state.** These are historical records and are not rewritten by the rename. FR-020's scope-narrowing clause makes this explicit.
- **A naming-convention enforcement test or lint rule applied at PR-review time to future typed-tool additions.** Out of scope for this BI — convention is enforced by review, not by machinery.
