# `read_property`

## Overview

Read a single named frontmatter property from an Obsidian vault note. Wraps
the Obsidian CLI's `properties` (plural) subcommand with `format=json` and
returns a typed result `{ value, type }` where `value` is the property's
native YAML-derived runtime type (string / number / boolean / array / object
/ null) and `type` is one of seven labels naming Obsidian's resolved
property type. Direct counterpart of [`read`](./read.md): where
`read` retired `obsidian_exec` for full-file reads, `read_property`
retires it for **surgical frontmatter-property reads** — agents that want a
single property no longer pay the token cost of a full-file fetch plus
client-side YAML parsing. Use [`obsidian_exec`](./obsidian_exec.md) only for
unwrapped subcommands.

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the note by either a
  wikilink (`file`) or a vault-relative `path`. The deterministic path; the
  focused note in the editor cannot shift between parse and execution.
- **active** — read the property from the note currently focused in the
  Obsidian editor. See "Active-mode multi-vault limitation" below before
  using active mode in setups with more than one registered vault.

The discriminator is `target_mode`. The schema composes the shared
[target-mode primitive](../../specs/004-target-mode-schema/spec.md) plus the
required `name` field. **Departure from `write_note`**: there are no
active-mode-specific rules — `name` has well-defined semantics in both
modes.

## Input Schema

`read_property` consumes the discriminated union below. Every field is
rejected at the boundary as `VALIDATION_ERROR` if the constraints fail.
Unknown top-level keys are rejected (`additionalProperties: false`) — the
schema is strict.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "name": "<property name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"QuickNote"`) — CLI resolves to the canonical folder-prefixed path |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Inbox/Notes.md"`) |
| `name` | string | YES | length ≥ 1; passed through verbatim — no sanitisation |

The schema enforces "exactly one of `file` or `path`": providing both is
rejected with two issues (one per locator field), and providing neither is
rejected with a root-level issue.

### Active mode

```json
{
  "target_mode": "active",
  "name": "<property name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `name` | string | YES | same semantics as specific mode; required in both modes |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer with one issue on `path: ["vault"]` |
| `file` | (n/a) | FORBIDDEN | same |
| `path` | (n/a) | FORBIDDEN | same |

For the discriminator's full contract see the
[target-mode primitive spec](../../specs/004-target-mode-schema/spec.md).

### Per-mode field policy

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (`"specific"`) | required (`"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `name` | REQUIRED (non-empty) | REQUIRED (non-empty) | n/a |

## Output

```json
{ "value": "in-progress", "type": "text" }
```

| Field | Type | Description |
|-------|------|-------------|
| `value` | `string \| number \| boolean \| unknown[] \| Record<string, unknown> \| null` | The property's native runtime value as JSON-decoded by Obsidian. Verbatim — no flattening, no coercion. The object branch covers YAML mapping values per Q2 (resolved without spec amendment). |
| `type` | `"text" \| "list" \| "number" \| "checkbox" \| "date" \| "datetime" \| "unknown"` | Obsidian's resolved property type, translated through the wrapper's lookup table (Obsidian's internal `multitext` / `aliases` / `tags` all map to `"list"`; `unknown` passes through verbatim; unrecognised future labels fall back to `"unknown"`). |

### Absent properties and frontmatter-less notes

If the requested `name` is not present in the file's frontmatter, the
response is **not an error** — the tool returns `{ "value": null, "type":
"unknown" }`. The same response surfaces for files with no frontmatter
block at all (see "No-frontmatter / malformed-frontmatter conflation"
below). Agents distinguishing absent vs explicit-null can use the `type`
field as the discriminator: an absent property always reports `"unknown"`,
while an explicit YAML null retains the typed label Obsidian assigned (e.g.
`"text"`, `"date"`).

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md](../../specs/013-read-property/research.md) (plan-stage
findings + T0 Live-CLI Capture 2026-05-09) and are observable by callers —
agents should plan for them.

### Two-call architecture

The wrapper issues **two** CLI invocations under the hood per `read_property`
request:

1. **Call A (file-scoped)** — `obsidian vault=<v> properties path=<p> format=json` (or `obsidian properties format=json active` in active mode). Returns the file's frontmatter as a JSON object; the wrapper extracts the requested property by name client-side.
2. **Call B (vault-scoped)** — `obsidian vault=<v> properties format=json` (no locator, no `active` flag). Returns Obsidian's resolved type-metadata array; the wrapper looks up the requested name and translates the type label.

End-to-end latency is approximately 2× a single-call typed tool. Both
invocations serialise through the project's single-in-flight queue.
Short-circuit cases (no frontmatter, or property absent from the
frontmatter) skip Call B because the type is structurally fixed at
`"unknown"`. Most callers do not need to think about the two-call shape;
power users investigating performance can observe it in the cli-adapter's
`dispatch*` log events.

### Active-mode multi-vault limitation

In active mode, Call B is issued **without** a `vault=` parameter — Obsidian
returns type metadata for its **default vault**, which may not be the same
vault that owns the focused note. For users with a single registered
Obsidian vault, this is correct. For users with multiple registered vaults,
type labels reported in active mode may belong to the wrong vault. **The
`value` is always correct** (Call A reads the focused note's frontmatter
directly); only `type` may mis-resolve. **Recommendation**: when type-correctness
matters and multiple vaults are registered, prefer `target_mode: "specific"`
with an explicit `vault` argument.

### No-frontmatter / malformed-frontmatter conflation

Obsidian conflates "no frontmatter block" with "malformed frontmatter
(missing closing fence)" — both surface as `No frontmatter found.` on
stdout. Per [research.md R7](../../specs/013-read-property/research.md), the
wrapper does **not** distinguish the two cases. Both produce `{ "value":
null, "type": "unknown" }` with no error. Spec FR-012's "structured error
for malformed frontmatter" is weakened to match Obsidian's actual conflation;
this is a known limitation of the underlying CLI.

### Type label inference vs explicit-type assignment

Obsidian's `properties format=json` channel reports the property's type as
stored in the vault's `.obsidian/types.json` config. A property whose type
was never explicitly set (via the Obsidian UI Properties panel or
`obsidian property:set type=...`) may report `"text"` even if its YAML
value is date-/datetime-/number-shaped. The wrapper reflects Obsidian's
authoritative resolution; users seeing "wrong" type labels should
explicit-type the property via Obsidian's UI rather than expect the wrapper
to regex-infer types from raw values.

### YAML comments, anchors, aliases

- **Comments** (`# foo` lines and inline `# bar`): stripped clean by
  Obsidian's parser before JSON serialisation; never appear in `value`
  (T0.2-verified).
- **Anchors** (`&name`) and **aliases** (`*name`): dereferenced at parse
  time per standard YAML; the wrapper sees the post-dereference value, not
  the anchor syntax (T0.3 + T0.4-verified).

### CRLF-vs-LF round-tripping

Line endings (LF vs CRLF) in the source file do not affect the parsed
`value`. The wrapper produces byte-identical JSON responses for fixtures
that differ only in line-ending convention (T0.5-verified).

### Heterogeneous list values

A frontmatter list with mixed runtime types (e.g. `mixed: [1, "two", 3]`)
gets `type: "unknown"` natively from Obsidian (T0.6-verified). The wrapper
also defensively downgrades `type: "list"` to `"unknown"` when the JSON
array contains heterogeneous element types — this guarantees the FR-017
invariant holds even if a future Obsidian version mislabels a heterogeneous
list as `multitext`.

### `name` field semantics

The `name` field is passed through verbatim. The wrapper does NOT sanitise
it, escape characters, rewrite YAML reserved words, or trim whitespace.
Names with dots, dashes, or other special characters are looked up
literally in the JSON-parsed frontmatter object via
`Object.prototype.hasOwnProperty.call(parsed, name)`.

**Argv anti-injection guarantee**: the wrapper does NOT forward `name=` to
the CLI as an argv parameter. Property extraction is entirely client-side
after `JSON.parse`, so even if a hypothetical future implementation passed
`name=` to the CLI, the cli-adapter's array-form argv passing prevents
shell-metacharacter injection structurally.

### Unknown vault and missing file

- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim
  `Vault not found.` message (per the cli-adapter's R5 / T002
  response-inspection clause inherited from `write_note` and `delete`).
- **File not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim
  `Error: File "<path>" not found.` message. The path quoting in the
  message is the CLI's own — agents should not strip it.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution Principle
IV. `read_property` introduces zero new error codes — the failure surface
is fully covered by codes already defined by the foundation features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `readPropertyInputSchema` validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, missing or empty `name`, forbidden key in active mode, unknown top-level key, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code. | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:` (file not found, etc.), OR the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection, OR the success-response was unparseable JSON. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but the underlying CLI invocation reported no active file. | Operator-side: open a note in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`read_property` propagates the adapter's classification verbatim with no
rewrites. **No new codes** are introduced by this tool.

## Examples

### Example 1 — Specific mode, text property by path

```json
{
  "name": "read_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "name": "status"
  }
}
```

Spawns Call A `obsidian vault=MyVault properties path=Inbox/Note.md format=json`
and Call B `obsidian vault=MyVault properties format=json`. Returns
`{ "value": "in-progress", "type": "text" }` for a frontmatter property
`status: in-progress`.

### Example 2 — Specific mode, list property by wikilink

```json
{
  "name": "read_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "file": "QuickNote",
    "name": "tags"
  }
}
```

Spawns Call A `obsidian vault=MyVault properties file=QuickNote format=json`
and Call B `obsidian vault=MyVault properties format=json`. Returns
`{ "value": ["alpha", "beta"], "type": "list" }` for a frontmatter property
`tags: [alpha, beta]`. Obsidian's internal `multitext` label translates to
the spec's `"list"` per the R6 lookup table.

### Example 3 — Specific mode, date property

```json
{
  "name": "read_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Tasks/T-1.md",
    "name": "due"
  }
}
```

Returns `{ "value": "2026-12-31", "type": "date" }` when the property has
been explicit-typed as `date` via Obsidian's UI. (If never explicit-typed,
the type may report `"text"` even though the value looks date-shaped — see
"Type label inference vs explicit-type assignment" above.)

### Example 4 — Specific mode, number property

```json
{
  "name": "read_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Stats/2026.md",
    "name": "count"
  }
}
```

Returns `{ "value": 7, "type": "number" }` for `count: 7`.

### Example 5 — Active mode

```json
{
  "name": "read_property",
  "arguments": {
    "target_mode": "active",
    "name": "status"
  }
}
```

Spawns Call A `obsidian properties format=json active` (no `vault=`) and
Call B `obsidian properties format=json` (no `vault=`, no `active` flag).
Returns the typed result for the property in the focused note. If no note
is focused, surfaces `ERR_NO_ACTIVE_FILE`. **Multi-vault note**: in setups
with multiple registered vaults, Call B may report type metadata for the
default vault rather than the focused-note's vault — see "Active-mode
multi-vault limitation" above.

### Example 6 — Absent property, no error

```json
{
  "name": "read_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "name": "nonexistent_property"
  }
}
```

Returns `{ "value": null, "type": "unknown" }` without raising an error.
Same response surfaces for a file with no frontmatter block at all. Agents
distinguishing "property absent" from "property explicitly null" can read
the `type` field — explicit-null retains a typed label, absent always
reports `"unknown"`.

### Example 7 — Mapping (object) property

```json
{
  "name": "read_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Index/About.md",
    "name": "metadata"
  }
}
```

For frontmatter `metadata: {author: Alice, source: import}`, returns
`{ "value": { "author": "Alice", "source": "import" }, "type": "unknown" }`.
Mappings get `"unknown"` natively from Obsidian (Q2 confirmed).

## References

- [013-read-property spec](../../specs/013-read-property/spec.md) — feature
  spec, the user input acceptance criteria, the FR-024 live-CLI
  characterisation requirements.
- [013-read-property research](../../specs/013-read-property/research.md) —
  R1–R12 decisions plus the T0 Live-CLI Capture (2026-05-09) section that
  drove the observable behaviours documented above (subcommand selection,
  two-call architecture, type translation table, no-frontmatter
  short-circuit, active-mode multi-vault limitation).
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the centralised
  `invokeCli` adapter that `read_property` routes both calls through,
  including the R5 / T002 unknown-vault response-inspection clause.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) —
  the shared discriminated union the input schema composes via
  `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`.
- [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md) —
  the `additionalProperties: false`, no-`oneOf` JSON Schema shape published
  in `tools/list`.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that surfaces
  this document.
- [read](./read.md) — the symmetric typed full-file read tool.
- [write_note](./write_note.md) — the symmetric typed create/overwrite tool.
- [delete](./delete.md) — the symmetric typed delete tool.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch retained
  for unwrapped subcommands.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
