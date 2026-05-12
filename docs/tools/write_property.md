# `write_property`

## Overview

Write a single named frontmatter property to an Obsidian vault note. Wraps
the Obsidian CLI's `property:set` subcommand and returns a typed result
`{ written: true, path, name }`. Symmetric write companion of
[`read_property`](./read_property.md): where `read_property` retired
`obsidian_exec` for surgical single-property reads, `write_property`
retires it for **surgical single-property writes** — agents that want to
flip one field no longer pay the cost of a full-file
[`read_note`](./read_note.md) plus [`write_note`](./write_note.md)
round-trip. Use [`obsidian_exec`](./obsidian_exec.md) only for unwrapped
subcommands.

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the note by either
  a wikilink (`file`) or a vault-relative `path`. The deterministic path;
  the focused note in the editor cannot shift between resolution and the
  write.
- **active** — write the property on the note currently focused in the
  Obsidian editor. The wrapper resolves the focused file via a fixed
  eval pre-flight before issuing the write, so the response always
  reports the path that received the write — not whatever was focused at
  some later moment. See "Active-mode multi-vault inheritance" below
  before using active mode in setups with more than one registered
  vault.

The discriminator is `target_mode`. The schema composes the shared
[target-mode primitive](../../specs/004-target-mode-schema/spec.md) plus
three required fields (`name`, `value`) and one optional field (`type`).

## Input Schema

`write_property` consumes the discriminated union below. Every field is
rejected at the boundary as `VALIDATION_ERROR` if the constraints fail.
Unknown top-level keys are rejected (`additionalProperties: false`) — the
schema is strict.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "name": "<property name>",
  "value": "<string | number | boolean | string[]>",
  "type": "<optional explicit type label>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"QuickNote"`) — CLI resolves to the canonical folder-prefixed path |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Inbox/Notes.md"`) |
| `name` | string | YES | length ≥ 1; passed through verbatim — no sanitisation |
| `value` | `string \| number \| boolean \| string[]` | YES | One of the four shapes; `null`, objects, and heterogeneous arrays rejected at the boundary |
| `type` | `"text" \| "list" \| "number" \| "checkbox" \| "date" \| "datetime"` | OPTIONAL | When omitted, inferred from `value`'s shape (see below); date/datetime require explicit |

The schema enforces "exactly one of `file` or `path`": providing both is
rejected with two issues (one per locator field), and providing neither
is rejected with a root-level issue.

### Active mode

```json
{
  "target_mode": "active",
  "name": "<property name>",
  "value": "<string | number | boolean | string[]>",
  "type": "<optional explicit type label>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `name` | string | YES | same semantics as specific mode; required in both modes |
| `value` | union | YES | same semantics as specific mode |
| `type` | enum | OPTIONAL | same semantics as specific mode |
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
| `value` | REQUIRED | REQUIRED | n/a |
| `type` | optional (inferred from `value`) | optional (inferred from `value`) | inferred |

## Type inference

When `type` is omitted, the resolved type label is derived from the
JavaScript shape of `value` — **never** from string-parsing heuristics:

| `typeof value` (or `Array.isArray`) | Inferred type |
|---|---|
| `boolean` | `"checkbox"` |
| `number` | `"number"` |
| `Array.isArray(value)` | `"list"` |
| `string` | `"text"` |

**Date / datetime are NOT inferable.** A string value like
`"2026-12-31"` whose shape happens to parse as an ISO date is inferred
as `"text"`. Callers who intend a date must pass `type: "date"`
explicitly. Same for `"datetime"`. The wrapper deliberately does not
regex-sniff strings for date shapes — Obsidian's authoritative type
system is set per-property at the vault level, not per-write.

## Value serialisation

| Input value shape | Wire `value=` argv |
|---|---|
| `"hello"` (string) | `value=hello` |
| `7` (number) | `value=7` |
| `true` (boolean) | `value=true` |
| `false` (boolean) | `value=false` |
| `["alpha", "beta"]` (string[]) | `value=alpha,beta` |
| `["alpha"]` (1-element list) | `value=alpha` |
| `[]` (empty list) | `value=[]` (literal `[]` — recognised by the CLI as "write an empty YAML list") |
| `"2026-12-31"` + `type: "date"` | `value=2026-12-31` |

Empty arrays produce a valid empty YAML list (`tags: []` on disk). The
literal `[]` argv is load-bearing — a bare `value=` (empty string) with
`type=list` produces a one-element list containing the empty string,
not an empty list.

## Output

```json
{ "written": true, "path": "notes/x.md", "name": "status" }
```

| Field | Type | Description |
|-------|------|-------------|
| `written` | `true` (literal) | Success marker; failures throw `UpstreamError` instead of returning `written: false`. |
| `path` | string | The vault-relative path of the file that received the write. In specific+path mode this echoes `input.path`. In specific+file mode this is the canonical path the wikilink resolved to. In active mode this is the path of the focused note at the moment of the eval pre-flight. |
| `name` | string | The property name as supplied by the caller — verbatim echo. |

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md](../../specs/018-write-property/research.md) (plan-stage
findings F1–F15) and are observable by callers — agents should plan for
them.

### Per-mode call architecture

The wrapper issues one or two CLI invocations per request:

- **Specific + path** — ONE call: `obsidian vault=<v> property:set name=<n> value=<sv> type=<t> path=<p>`. Returns when the CLI exits.
- **Specific + file (wikilink)** — TWO calls: `obsidian vault=<v> file file=<wikilink>` (TSV parse to discover the canonical path), then `obsidian vault=<v> property:set ... path=<canonical>`.
- **Active** — TWO calls: `obsidian eval code=<FIXED_TEMPLATE>` (returns `{path, vault}` from `app.workspace.getActiveFile()` + `app.vault.getName()`), then `obsidian vault=<resolved> property:set ... path=<resolved>`.

The two-call branches resolve the canonical path BEFORE the write,
eliminating any TOCTOU window where a focus-change between resolution
and write could land the write on a different file than reported in the
response.

End-to-end latency is approximately 1× a single-call typed tool in
specific+path mode, and approximately 2× in the two-call modes. All
invocations serialise through the project's single-in-flight queue.

### Active-mode multi-vault inheritance

The Obsidian CLI's `vault=` parameter is functionally ignored by `eval`
in active mode — the eval always runs against whatever vault Obsidian
currently has focused, regardless of the `vault=` argument. Same
limitation inherited by 011 / 013 / 014 / 015 / 016. **Recommendation**:
for setups with multiple registered vaults, prefer
`target_mode: "specific"` with an explicit `vault` argument when the
target vault is known.

### Cross-type overwrite — the resolved type wins

When `name` is already present in the file's frontmatter with a
different type, the write **replaces both the value and the on-disk
type representation**. The result is exactly the same as a fresh write
to a previously-absent key — the response `{ written, path, name }` is
identical, and the file ends up with the new value plus a property-type
registry entry matching the new type. No special wrapper logic; the
behaviour comes from `property:set` native semantics.

Example:
- Pre-state: `count: 7` (number).
- Write: `write_property({ ..., name: "count", value: "abc" })` (no explicit type).
- Post-state: `count: abc` (text). The vault's property-type registry's
  entry for `count` flips from `number` to `text`.

### YAML control characters auto-quoted by the CLI

Values containing `#`, `:`, leading `!`, leading `|`, leading `&`,
leading `*` are double-quoted automatically on disk. The wrapper passes
raw values through to argv; the CLI handles quoting. Round-trip via
`read_property` returns the original raw value, not the quoted form.

### Empty array writes a valid empty YAML list

`value: []` (empty array) writes the literal YAML `tags: []` block on
disk — not the property removed, not `null` substituted, and not a
one-element list containing the empty string. The wrapper sends the
literal string `"[]"` as the `value=` argv parameter; the CLI
recognises this shape as "write an empty YAML list".

### No frontmatter block — automatically created

Writing to a file that has no frontmatter block inserts a fresh `---`
block at the top of the file. No error; same response shape. The body
content is preserved verbatim below the new block.

### Path-traversal CLI-confined

`path: "../../etc/passwd"` and other traversal attempts are rejected by
the CLI's vault-confinement layer with
`Error: File "<path>" not found.` → `CLI_REPORTED_ERROR`. No file is
created outside the vault root.

### Unknown vault and missing file

- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the
  verbatim `Vault not found.` message (per the cli-adapter's R5
  response-inspection clause inherited from `write_note` / `delete_note`).
- **File not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim
  `Error: File "<path>" not found.` message. The path quoting in the
  message is the CLI's own — agents should not strip it.

### `name` field semantics

The `name` field is passed through verbatim. The wrapper does NOT
sanitise it, escape characters, rewrite YAML reserved words, or trim
whitespace. Names with dots, dashes, or colons all pass straight to the
CLI argv (`my.key`, `my-key`, `my:key` are all accepted). The
colon-in-key case (`my:key`) produces YAML with an unquoted internal
colon — borderline-invalid by strict YAML spec, but Obsidian's parser
tolerates it on read; documented as observed behaviour.

**Argv anti-injection guarantee**: the wrapper passes `name`, `value`,
and `type` as discrete argv parameters through `child_process.spawn` —
no shell interpolation, no eval source-text concatenation. The
active-mode eval pre-flight uses a FIXED template with no user-input
interpolation, so the SECURITY edge case's "no eval injection vector"
assertion holds for both call branches.

### Argv parameter order (informational)

The argv passed to the CLI follows the convention
`[binary, vault=<v>, command, k1=v1, k2=v2, ..., flag1, ...]`. For
`property:set` the parameter order is `name`, `value`, `type`, `path`
(driven by the handler's parameter Record). This order is informational
— the CLI is order-insensitive for these named parameters.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `write_property` introduces **zero new error codes** —
the failure surface is fully covered by codes already defined by the
foundation features.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed `writePropertyInputSchema` validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, missing or empty `name`, missing `value`, `value` outside the four-shape union, `type` outside the six-label enum, forbidden key in active mode, unknown top-level key, etc.). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code. | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:` (file not found, invalid type-vs-value, path traversal, etc.), OR the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection, OR the success-response was unparseable (active-mode eval response did not parse as JSON, or specific+file's TSV did not contain a `path` line). | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no note is focused in the Obsidian editor. The active-mode eval pre-flight returns `path: null`; the wrapper short-circuits before the write. | Operator-side: open a note in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`write_property` propagates the adapter's classification verbatim with
no rewrites. **No new codes** are introduced by this tool.

## Examples

### Example 1 — Specific mode, text property by path

```json
{
  "name": "write_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "name": "status",
    "value": "shipped"
  }
}
```

Spawns one call:
`obsidian vault=MyVault property:set name=status value=shipped type=text path=Inbox/Note.md`.
Returns `{ "written": true, "path": "Inbox/Note.md", "name": "status" }`.
The `type=text` argv is inferred from the string shape of `value`.

### Example 2 — Specific mode, list property by wikilink

```json
{
  "name": "write_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "file": "QuickNote",
    "name": "tags",
    "value": ["alpha", "beta"]
  }
}
```

Spawns two calls:
1. `obsidian vault=MyVault file file=QuickNote` — TSV output names the
   canonical path (e.g. `path\tInbox/QuickNote.md`).
2. `obsidian vault=MyVault property:set name=tags value=alpha,beta type=list path=Inbox/QuickNote.md`.

Returns `{ "written": true, "path": "Inbox/QuickNote.md", "name": "tags" }`.
Notice the `path` field reports the canonical path, not the wikilink.

### Example 3 — Specific mode, number property

```json
{
  "name": "write_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Stats/2026.md",
    "name": "count",
    "value": 7
  }
}
```

Spawns one call:
`obsidian vault=MyVault property:set name=count value=7 type=number path=Stats/2026.md`.
The `type=number` argv is inferred from the JavaScript `number` shape.

### Example 4 — Specific mode, date property with explicit type

```json
{
  "name": "write_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Tasks/T-1.md",
    "name": "due",
    "value": "2026-12-31",
    "type": "date"
  }
}
```

The `type: "date"` is REQUIRED — without it, the string value would be
written as `type=text`. The CLI validates the value against the
declared date format and writes the property with the on-disk type
locked to `date`.

### Example 5 — Active mode

```json
{
  "name": "write_property",
  "arguments": {
    "target_mode": "active",
    "name": "status",
    "value": "review"
  }
}
```

Spawns two calls:
1. `obsidian eval code=<FIXED_TEMPLATE>` — returns the focused note's
   path + vault as a JSON envelope.
2. `obsidian vault=<resolved> property:set name=status value=review type=text path=<resolved>`.

Returns the typed result for the focused note. If no note is focused,
surfaces `ERR_NO_ACTIVE_FILE`. **Multi-vault note**: see "Active-mode
multi-vault inheritance" above.

### Example 6 — Empty list (clears all elements)

```json
{
  "name": "write_property",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "name": "tags",
    "value": []
  }
}
```

Spawns one call:
`obsidian vault=MyVault property:set name=tags value=[] type=list path=Inbox/Note.md`.
The on-disk YAML becomes `tags: []` (valid empty YAML list). The
property is NOT removed — to remove a property, fall back to
[`obsidian_exec`](./obsidian_exec.md) with `property:remove`.

## Known Limitations

### CRLF line endings — partial preservation only

CRLF and LF line-ending preservation across writes is **best-effort and
partial**. All-LF files round-trip cleanly: a write to an all-LF file
produces an all-LF post-write file. CRLF files, however, end up with
**mixed line endings** post-write: the unmodified body region retains
its CRLF pairs, but the CLI-emitted modified frontmatter region uses LF
only. Per [research.md R8](../../specs/018-write-property/research.md),
this is a deliberate trade-off — full CRLF preservation would require
the wrapper to do a read-modify-write cycle the typed surface was
designed to avoid.

### YAML style (flow → block) — normalised on every write

Pre-existing flow-style YAML sequences like `tags: [a, b]` are
re-emitted as block-style on every write — even when the write targets
a DIFFERENT key. Per FR-022's "preserved to whatever degree the
underlying serialiser supports" wording, this is contract-compliant
behaviour, but it IS an observable diff worth documenting. Values are
preserved byte-stable; only the style normalises.

### List elements containing literal `,` characters

The wire format for `value: string[]` is comma-separated
(`value=alpha,beta,gamma` → `["alpha", "beta", "gamma"]` on disk). List
elements containing literal `,` characters will be split by the CLI's
parser, producing more elements than the caller intended. For example,
`value: ["hello, world"]` (one element with an embedded comma) produces
a two-element list `["hello", "world"]` on disk. Callers needing
comma-containing list elements fall back to
[`obsidian_exec`](./obsidian_exec.md) with a hand-built `property:set`
invocation, or to a `read_note` + body-edit + `write_note` workflow.

### Property removal — out of scope

`write_property` writes the property's value; it cannot delete a
property entirely. To remove a property, fall back to
[`obsidian_exec`](./obsidian_exec.md) with the CLI's `property:remove`
subcommand. Setting `value: []` writes an empty list, not "remove the
property".

### Active-mode `vault=` argument has no effect

The Obsidian CLI's `vault=` parameter is functionally ignored by `eval`
in active mode — same limitation inherited by 011 / 013 / 014 / 015 /
016. For setups with multiple registered vaults, the active-mode write
always targets the focused vault; the `vault=` field is not accepted in
active mode at the schema layer.

## References

- [018-write-property spec](../../specs/018-write-property/spec.md) —
  feature spec, the user input acceptance criteria, and the FR-030
  live-CLI characterisation requirements.
- [018-write-property research](../../specs/018-write-property/research.md)
  — R1–R16 design decisions, F1–F15 live findings, and the R8 + R7
  plan-stage spec amendments.
- [018-write-property data-model](../../specs/018-write-property/data-model.md)
  — schema shapes, type-inference table, value-serialisation table,
  per-mode CLI argv-mapping table.
- [read_property](./read_property.md) — the symmetric typed read tool.
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the
  centralised `invokeCli` adapter that `write_property` routes calls
  through, including the R5 / T002 unknown-vault response-inspection
  clause.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md)
  — the shared discriminated union the input schema composes via
  `applyTargetModeRefinement(targetModeBaseSchema.extend(...))`.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch for
  property removal, comma-in-list-element edge cases, and any
  unwrapped subcommand needs.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
