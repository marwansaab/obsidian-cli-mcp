# Research: Add Bases Surface (054)

**Date**: 2026-05-28
**Branch**: `054-add-bases-surface`

## CLI Characterization (T0 Probes)

### `bases` subcommand

```
obsidian --help excerpt:
  bases                 List all base files in vault

Parameters: none listed in help
```

**Probe results**:

| Probe | Command | Output |
|-------|---------|--------|
| Default vault | `obsidian bases` | Plain text, one vault-relative path per line |
| Explicit vault | `obsidian bases vault="TestVault-Obsidian-CLI-MCP"` | Same output as default — `vault=` silently ignored |
| Nonexistent vault | `obsidian bases vault="NonExistentVault99999"` | Same output — confirms silent ignore |
| Empty vault | not probed | Expected: empty stdout (no lines) |

**Output format**: Plain text, newline-separated vault-relative paths. No JSON mode. No count-only mode.

```
000-Meta/Bases/Type ID Index.base
220-Planning/Backlog (Base).base
421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog.base
421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases.base
Vault Health Check.base
```

**Decision**: R-001. `vault=` parameter silently ignored.
**Rationale**: The `vault=` parameter is accepted syntactically but has no effect on the output. The CLI always returns bases from the currently active vault context. The wrapper MUST still accept the `vault` schema parameter (cohort parity with `query_base`), but the tool's documentation MUST note this as an inherited CLI limitation: vault routing is not honoured for `bases`.
**Alternatives**: (a) Omit `vault` from schema — rejected because it breaks cohort symmetry and prevents forward compatibility if the CLI adds support later. (b) Pre-flight vault resolution — rejected because the wrapper cannot enumerate `.base` files itself without CLI cooperation.

**Decision**: R-002. No count-only mode available in CLI.
**Rationale**: The CLI `bases` subcommand has no parameters at all — no `--count`, no `total`, no `format=` option. The `total: true` conditional flag in the spec (FR-004) resolves to "not exposed."
**Alternatives**: (a) Wrapper-side count-only (still call CLI, strip paths) — rejected as over-engineering for zero CLI-side savings.

### `base:views` subcommand

```
obsidian --help excerpt:
  base:views            List views in the current base file

Parameters: none listed in help
```

**Probe results**:

| Probe | Command | Output |
|-------|---------|--------|
| No params | `obsidian base:views` | `Error: Active file is not a base file: <path>` |
| With path | `obsidian base:views path="000-Meta/Bases/Type ID Index.base"` | Same error — `path=` silently ignored |
| With file | `obsidian base:views file="Type ID Index"` | Same error — `file=` silently ignored |
| With vault | `obsidian base:views vault="TestVault-Obsidian-CLI-MCP"` | Same error — `vault=` silently ignored |

**Output format**: Could not observe success output because the subcommand is active-mode-only and the currently active file was not a `.base` file during probing. Expected output: plain text list of view names (one per line), based on the pattern established by `bases`.

**Decision**: R-003. `base:views` is active-mode-only — no specific-mode support.
**Rationale**: The CLI `base:views` subcommand does not accept `path=`, `file=`, or any other locator parameter. It operates exclusively on the currently focused file in Obsidian. When the focused file is not a `.base` file, it errors with `Error: Active file is not a base file: <path>`. This means the `views_base` typed tool can ONLY work in active mode — an agent cannot programmatically enumerate views of a specific base file via this CLI subcommand.
**Alternatives**: (a) Parse `.base` file YAML directly to extract view names — rejected because it bypasses the CLI adapter pattern, introduces a dependency on `.base` file format (undocumented, may change across Obsidian versions), and violates the "typed wrapper over CLI subcommand" architectural contract. (b) Defer `views_base` entirely until CLI adds specific-mode support — considered but the tool still delivers value in active-mode workflows where the user has a `.base` file focused. (c) Compose `views_base` via `obsidian eval` — rejected because `eval` is for plugin APIs, not native CLI subcommands.

**Design impact**: The `views_base` tool MUST be documented as active-mode-only. The `path` parameter from FR-011 of the spec cannot be required — it must either be omitted entirely or accepted and used only for the wrapper's own validation/pre-flight checks (but NOT passed to the CLI). The tool's description MUST explicitly state the active-mode limitation so agents understand they need the user to have a `.base` file focused in Obsidian for this tool to work.

### `base:create` subcommand

```
obsidian --help excerpt:
  base:create           Create a new item in a base
    file=<name>         - Base file name
    path=<path>         - Base file path
    view=<name>         - View name
    name=<name>         - New file name
```

**Probe results**:

| Probe | Command | Output | Exit |
|-------|---------|--------|------|
| Happy path | `base:create path="..." name="TEST-PROBE-DELETE-ME"` | `Created: TEST-PROBE-DELETE-ME.md` | 0 |
| Name collision | same command repeated | `Created: TEST-PROBE-DELETE-ME 1.md` | 0 |
| With content | `base:create ... content="Hello world body"` | `Created: TEST-PROBE-CONTENT.md` | 0 |
| With view | `base:create ... view="All"` | `Created: TEST-PROBE-VIEW.md` | 0 |
| Bad view | `base:create ... view="NonexistentView999"` | `Created: TEST-PROBE-BADVIEW.md` | 0 |
| Bad path | `base:create path="nonexistent.base" name="x"` | `Error: Base file not found: nonexistent.base` | 1 |
| With open flag | `base:create ... open` | `Created: TEST-PROBE-OPEN.md` | 0 |

**Output format**: `Created: <filename>.md` on success. Only the filename is returned, NOT the vault-relative path.

**Decision**: R-004. `vault=` silently ignored for `base:create` (same as `bases`).
**Rationale**: Files were not found in the expected vault directory, suggesting `vault=` routing is broken for `base:create` as well. Same inherited limitation as `bases`. Document as inherited CLI limitation.

**Decision**: R-005. Name collision results in auto-increment, not error.
**Rationale**: The CLI appends ` 1`, ` 2`, etc. to the filename when a collision occurs. This is well-defined behaviour (not a silent overwrite) and aligns with the spec's acceptance criterion: "follows whatever well-defined behaviour the underlying CLI exposes — never a silent overwrite." The wrapper surfaces the ACTUAL created filename (from the `Created: <filename>.md` response), which may differ from the requested name. The wrapper MUST NOT fabricate a collision error.
**Alternatives**: (a) Pre-check for collision and error — rejected because the wrapper would need to enumerate files in the base's directory, which is outside the CLI adapter pattern and introduces a TOCTOU race.

**Decision**: R-006. View parameter not validated by CLI.
**Rationale**: `base:create` with a nonexistent `view=` value still succeeds. The CLI does not validate view names during item creation. The wrapper MAY pre-validate the view name (via a `base:views` call) but this would require active mode. Document that view validation is not performed.
**Alternatives**: (a) Pre-validate view via `base:views` — rejected because `base:views` is active-mode-only. (b) Pre-validate by parsing the `.base` YAML — rejected (same reasoning as R-003).

**Decision**: R-007. `content=` parameter accepted but not documented in help.
**Rationale**: The `content=` parameter is not listed in `obsidian base:create --help` output but is accepted without error. Cannot confirm whether content was actually written to the created file (files were not locatable in expected vault due to vault-routing issue). Document as "accepted, behaviour unverified." Plan-phase implementation should test content writing as a T0 probe during `/speckit-implement`.

**Decision**: R-008. `base:create` returns only filename, not vault-relative path.
**Rationale**: The `Created: <filename>.md` response contains only the filename. To fulfill FR-019 (return created item's vault-relative path), the wrapper MUST construct the path from: (a) the base file's directory (derived from the `path` input parameter) + (b) the returned filename. This is consistent with how Obsidian Bases creates items — items live in a subdirectory named after the base file (e.g., `000-Meta/Bases/Type ID Index/<item-name>.md`). The exact directory structure will be confirmed during implementation T0 probes.

## Vault Routing Summary

| Subcommand | `vault=` behaviour |
|------------|-------------------|
| `base:query` | Accepted and routed (confirmed by BI-039 research) |
| `bases` | Silently ignored |
| `base:views` | Silently ignored |
| `base:create` | Silently ignored |

This asymmetry within the Bases family is an inherited CLI limitation. All three new tools still accept `vault` in their schemas for cohort parity and forward compatibility, but their documentation MUST note that vault routing is not honoured by the underlying CLI for these subcommands.

## Design Decisions Summary

| ID | Decision | Impact |
|----|----------|--------|
| R-001 | `vault=` silently ignored for `bases` | Document as limitation; keep schema param for forward compat |
| R-002 | No count-only mode in CLI | FR-004 `total` flag not exposed |
| R-003 | `base:views` is active-mode-only | `views_base` tool is active-mode-only; no `path` input parameter |
| R-004 | `vault=` silently ignored for `base:create` | Same as R-001 |
| R-005 | Name collision → auto-increment | Wrapper surfaces actual filename; no fabricated error |
| R-006 | View parameter not validated by CLI | Wrapper does not pre-validate views |
| R-007 | `content=` undocumented but accepted | Document as accepted; verify during implementation |
| R-008 | `base:create` returns filename only | Wrapper constructs vault-relative path from base directory + filename |

## Spec Updates Required

1. **FR-004** (`total` flag): Resolve to "not exposed" — CLI has no count-only mode.
2. **FR-008** (`views_base` view names): Update to reflect active-mode-only — no `path` parameter.
3. **FR-011** (`views_base` path parameter): Remove or make N/A — CLI does not support specific mode for `base:views`.
4. **FR-012** (`views_base` active mode): Change from MAY to MUST — active mode is the ONLY mode.
5. **FR-019** (`create_base` path return): Clarify that path is wrapper-constructed from base directory + CLI-returned filename.
6. **FR-021** (`create_base` name collision): Update to document auto-increment behaviour.
7. **`views_base` acceptance scenarios**: Scenario 1 (specific path) must be rewritten for active mode.
8. **Vault routing**: Add inherited-limitation note to each tool's documentation requirements.
