# Contract: CHANGELOG Migration Block Shape (FR-010)

**Branch**: `022-rename-typed-tools` | **Date**: 2026-05-12 | **Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This contract documents the shape of the CHANGELOG.md section the rename release ships. Per FR-010 and SC-004, the migration must be presented in a single contiguous block that a caller can read in one pass.

## 1. Section header

A single new `## [0.5.0]` section is inserted at the top of `CHANGELOG.md`, above the existing `## [0.4.4]` section:

```markdown
## [0.5.0] - 2026-05-12
```

The date format matches the existing convention (`YYYY-MM-DD`) and the version-number-in-brackets prefix matches Keep a Changelog format.

## 2. Required content blocks (in order)

The `## [0.5.0]` section MUST contain the following blocks in this order:

### 2.1 — Headline / classification paragraph

A leading paragraph in **bold** identifying this as a breaking-change MINOR release with a one-line summary. Example shape (final wording authored at /speckit-implement time):

```markdown
**MINOR release (breaking — typed tool renames)** — Five typed MCP tools rename to match their upstream Obsidian CLI subcommand names: `read_note` → `read`, `delete_note` → `delete`, `list_files` → `files`, `write_property` → `set_property`, `rename_note` → `rename`. Single-release wholesale cleanup; no deprecation aliases. Pre-v1.0 semver window permits the MINOR-level breaking change. Spec-id 022-rename-typed-tools, FR-001..FR-021, SC-001..SC-010.
```

### 2.2 — `### Changed (BREAKING)` subsection — the migration block

A single contiguous subsection containing the punch-list and the naming convention. This is the **canonical migration block** referenced by FR-010 / SC-004; callers read this and update their references.

Required content:

- **Five mapping rows** in old → new form, presented either as a Markdown table or a tight bullet list. Each row names the old tool, the new tool, and one-sentence justification.
- **The two-clause naming convention** stated explicitly:
  - "Single-word upstream subcommand → tool name equals the subcommand verbatim."
  - "Composite `namespace:action` upstream subcommand → tool name is the `action_namespace` reversal."
- **Caller migration instructions**: a one-paragraph "what to do" section telling MCP-client authors to search-and-replace the five names in their stored configurations.
- **The no-aliases stance**: explicit statement that retired names produce tool-not-found errors with no "did you mean" hint and no aliasing.
- **The `help` routing rule**: `help({ tool_name: "<new>" })` returns the doc body; `help({ tool_name: "<old>" })` returns tool-not-found.
- **Forward reference to BI-060** explaining that the handler-layer filetype widening (which closes the same false-advertisement gap at the behaviour layer) ships separately, after this rename.

Example skeleton (final wording authored at /speckit-implement time):

```markdown
### Changed (BREAKING)

**Five typed tools renamed to match upstream Obsidian CLI subcommand names**. The wrapper's typed-tool track had accumulated five names whose `_note` / `list_` / `write_` prefixes diverged from the upstream subcommand. Pre-v1.0 is the bounded-cost window to consolidate before MAJOR-stability obligations take hold.

| Old tool name    | New tool name   | Upstream CLI subcommand | Why                                                                                                      |
|------------------|-----------------|--------------------------|----------------------------------------------------------------------------------------------------------|
| `read_note`      | `read`          | `read`                   | wrapper-added `_note` suffix dropped; upstream operates on any vault file, not just notes                |
| `delete_note`    | `delete`        | `delete`                 | same                                                                                                     |
| `list_files`     | `files`         | `files`                  | wrapper-added `list_` prefix dropped (the CLI subcommand omits it)                                       |
| `write_property` | `set_property`  | `property:set`           | `namespace:action` reversed to `action_namespace`; aligns with `read_property` and `find_by_property`    |
| `rename_note`    | `rename`        | `rename`                 | wrapper-added `_note` suffix dropped                                                                     |

**Naming convention codified**:

- Single-word upstream subcommand → tool name equals the subcommand verbatim.
- Composite `namespace:action` upstream subcommand → tool name is the `action_namespace` reversal (lowercase, underscore-joined).

**Migration instructions**: Search-and-replace the five retired names in your stored MCP-client configurations with their new counterparts. The schema fields each tool accepts are unchanged; only the tool name changes. Existing call shapes will work byte-identically under the new names.

**No aliases**: The retired names are removed wholesale. `tools/call` against a retired name returns the standard `TOOL_NOT_FOUND` error. `help({ tool_name: "<retired>" })` returns a tool-not-found error rather than aliasing to the new name. No "did you mean" suggestion is provided — the wrapper does not maintain a soft-deprecation layer.

**Forward reference**: The renamed tools' top-level `description:` text still uses "Markdown note" / "note" filetype-scope language in places. The handler-layer widening that broadens this to "any vault file" (Markdown, Canvas, Bases, attachments) is tracked separately under BI-060 and ships after this rename. The temporary mismatch is accepted.
```

### 2.3 — `### Internal` subsection — durable registry-stability test

A short subsection describing the FR-018 architectural addition:

```markdown
### Internal

**`src/tools/_register-baseline.json`** — checked-in JSON snapshot of every registered tool's `(name, descriptionFingerprint, schemaFingerprint)` triple. The accompanying durable test in `src/tools/_register.test.ts` (`describe("registry: stability baseline (FR-018)", ...)`) asserts the live registry matches the baseline. Future BIs that intentionally add, remove, or rename a tool MUST roll the baseline forward in the same commit. Catches accidental registry mutations before merge; complements (does not replace) the existing per-tool invariants drift detector. Spec contract at [specs/022-rename-typed-tools/contracts/registry-baseline.contract.md](specs/022-rename-typed-tools/contracts/registry-baseline.contract.md).

**Frozen surfaces (SC-009 equivalent)**: `obsidian_exec`, `help`, `find_by_property`, `read_heading`, `write_note` and the five-tool punch-list above all preserve their input-schema fields, output shapes, and error codes byte-identically across the rename. Zero new error codes (FR-008); zero new ADRs; zero schema-field changes (FR-016).
```

### 2.4 — `### References` subsection

Standard tail-of-section references, matching the convention used by `## [0.4.4]` and prior:

```markdown
### References

- Spec: [specs/022-rename-typed-tools/spec.md](specs/022-rename-typed-tools/spec.md)
- Plan: [specs/022-rename-typed-tools/plan.md](specs/022-rename-typed-tools/plan.md)
- Research: [specs/022-rename-typed-tools/research.md](specs/022-rename-typed-tools/research.md)
- Data model: [specs/022-rename-typed-tools/data-model.md](specs/022-rename-typed-tools/data-model.md)
- Quickstart: [specs/022-rename-typed-tools/quickstart.md](specs/022-rename-typed-tools/quickstart.md)
- Baseline contract: [specs/022-rename-typed-tools/contracts/registry-baseline.contract.md](specs/022-rename-typed-tools/contracts/registry-baseline.contract.md)
- Migration-block contract: [specs/022-rename-typed-tools/contracts/changelog-migration-block.contract.md](specs/022-rename-typed-tools/contracts/changelog-migration-block.contract.md)
```

## 3. Structural rules (asserted by docs-audit / manual inspection)

- The `## [0.5.0]` section MUST appear exactly once in `CHANGELOG.md`.
- The migration block (§2.2) MUST be contiguous — the five mappings appear in a single subsection, not scattered across multiple `### Changed` entries.
- The five new names (`read`, `delete`, `files`, `set_property`, `rename`) MUST each appear at least once in §2.2.
- The five retired names (`read_note`, `delete_note`, `list_files`, `write_property`, `rename_note`) MUST each appear at least once in §2.2 as old-side mapping anchors.
- The section MUST NOT mention "deprecated alias", "deprecation window", "did you mean", or any phrase implying that retired names continue to work.
- No edits are made to the pre-existing `## [0.4.4]`, `## [0.4.3]`, ... sections — they are historical record per Keep a Changelog conventions.

## 4. Out of scope for this contract

- **Exact prose wording**: §2.1's headline paragraph and §2.2's per-row justifications are skeletons. The /speckit-implement step authors final wording matching the project's existing CHANGELOG voice.
- **Per-tool changelog "Behaviour preserved" callouts**: Not required. The migration block's "schema fields unchanged" claim suffices; FR-006 / FR-007 enforce the no-behaviour-change guarantee.
- **A separate `MIGRATION.md` file**: Out of scope per research R4 and spec FR-010 — the migration block lives in CHANGELOG.md.
- **`package.json.description` update**: Not required by this BI. The current description (cross-platform MCP server framing) survives the rename. BI-060 may revisit this.
