# `read_heading`

## Overview

Read the body of a single named heading from a vault note. Returns
`{ content: string }` — the body bytes between the matched heading and
the next heading marker of any depth (or EOF). Replaces the agent's
"full-file `read_note` plus client-side Markdown parse" sequence
(typically 5–50k tokens for long documents) with a single typed call
returning just the named section's body bytes (typically 100–500
tokens). Token-saving framing: where
[`read_note`](./read_note.md) returns whole files and
[`read_property`](./read_property.md) returns a single frontmatter
field, `read_heading` is the heading-targeted retrieval primitive — the
sixth typed-tool wrap and the first heading-body extraction surface.
Use [`obsidian_exec`](./obsidian_exec.md) only for unwrapped
subcommands.

## Input Schema

```json
{
  "target_mode": "specific" | "active",
  "vault": "<vault name>",
  "file": "<wikilink>",
  "path": "<vault-relative path>",
  "heading": "H1::H2"
}
```

| Field | Type | Required | When forbidden | Notes |
|-------|------|----------|----------------|-------|
| `target_mode` | `"specific" \| "active"` | YES | never | Standard discriminator (ADR-003). Selects between named-file specific mode and focused-file active mode. |
| `vault` | string (length ≥ 1) | in specific mode | in active mode | Vault display name. The CLI's `vault=` parameter is functionally ignored by the underlying `eval` subcommand — see "Multi-vault default ambiguity" below. |
| `file` | string | specific mode (XOR with `path`) | active mode; or with `path` in specific mode | Wikilink form (no extension, no folder). Resolved in-eval via `app.metadataCache.getFirstLinkpathDest`. |
| `path` | string | specific mode (XOR with `file`) | active mode; or with `file` in specific mode | Vault-relative path including `.md`. Used directly against `app.metadataCache.fileCache`. |
| `heading` | string (length ≥ 1) | YES | never | `::`-separated heading path. Structural validator: ≥2 non-empty segments. Heading existence is checked at execution. |

`additionalProperties: false`. Unknown top-level keys are rejected.

### Heading-path validator

Structural-only per FR-006 / FR-007. The `heading` string is split on
the literal `::` separator; the validator rejects strings that produce
fewer than 2 segments OR any empty segment (leading `::`, trailing `::`,
or consecutive `::`). Heading existence is NOT pre-validated — semantic
resolution happens at execution time and surfaces as a structured error
(see "Errors" below).

The following heading shapes are **out-of-reach** for `read_heading`:

- **Single-segment H1-only reads** (`heading: "Foo"` with no `::`): the
  validator rejects them. Documented fallback: `read_note` plus
  client-side parse for the H1's body.
- **Headings whose text contains `::` literally** (e.g. an H2 titled
  `Best Practices :: Naming` where the `::` is part of the heading
  text): the segment splitter cannot disambiguate the literal `::`
  from the path separator. Documented fallback: `read_note` plus
  client-side parse.
- **Setext-style headings** (text underlined with `===` for H1 or
  `---` for H2): per the [Q2 clarification](../../specs/015-read-heading/spec.md#clarifications),
  Setext underlines are content, not heading boundaries. Documented
  fallback: `read_note` plus client-side parse if the caller needs
  Setext addressability.

## Output

```json
{ "content": "Use kebab-case.\n" }
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | The body bytes of the matched heading. Byte-faithful pass-through (FR-019, FR-020) — line endings (CRLF or LF), fenced code blocks, table pipes, list indentation, inline markdown all preserved verbatim. The leading line terminator immediately after the heading line is stripped so the body starts with prose. |

A heading whose body is empty (next heading marker appears on the very
next line, with no intervening prose) returns `{ "content": "" }` —
NOT an error. This is the structural empty-body case per FR-011.

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md](../../specs/015-read-heading/research.md) (plan-stage
findings F1–F8 + the T0 Live-CLI Capture sections) and are observable
by callers — agents should plan for them.

### Single-call architecture

The wrapper issues exactly **one** CLI invocation per `read_heading`
request: `obsidian [vault=<v>] eval code=<rendered-js>`. The frozen
JS template walks Obsidian's pre-parsed
`app.metadataCache.metadataCache[hash].headings` array (which already
carries `{heading, level, position: {start: {offset}, end: {offset}}}`
per ATX heading and excludes fenced-code-block heading-like text from
the array), finds the first matching segment-path, and slices the body
via `await app.vault.adapter.read(path)`. End-to-end latency is
approximately 200 ms per call. The single-in-flight queue serialises
all CLI invocations.

### `eval`-as-CLI-entry-point stability concern

There is no native heading-body subcommand in the Obsidian CLI;
`read_heading` is implemented atop the developer-section `eval`
subcommand (parity with [`find_by_property`](./find_by_property.md)).
The wrapper reaches into Obsidian's internal
`app.metadataCache.metadataCache[hash].headings`, `app.vault.adapter.read`,
`app.workspace.getActiveFile`, and
`app.metadataCache.getFirstLinkpathDest` APIs. Future Obsidian updates
may surface as test failures rather than silent drift; the wrapper's
two-stage envelope-parse step (`JSON.parse` then strict envelope-schema
validation) is the structural backstop — neither stage silently
coerces.

### Anti-injection structural guarantee

User-supplied `path`, `file`, and `heading` flow through
`JSON.stringify` → `Buffer.from(...).toString("base64")` → the frozen
JS template's `atob('<base64>')` + `JSON.parse` chain at request time.
The JS template itself is a frozen string constant; the only insertion
is a base64 payload whose alphabet (`[A-Za-z0-9+/=]`) is structurally
safe inside any JS string literal. No matter what bytes the user
supplies, the rendered `code=<...>` argv contains exactly the frozen
JS template plus a base64 string. There is no path for user input to
escape into the JS source. Most callers do not need to think about
this — surfacing it for security-conscious reviewers.

### Multi-vault default ambiguity

The underlying CLI's `vault=` parameter is functionally **ignored** by
the `eval` subcommand — verified live during plan stage. The eval runs
against whichever vault Obsidian's running instance currently has
focused. In single-vault setups this is unambiguous. In multi-vault
setups, multi-vault users must **open the target vault** in Obsidian
before invoking `read_heading`. Same inherited limitation as
[`find_by_property`](./find_by_property.md),
[`read_property`](./read_property.md), and the prior typed tools. The
`vault` schema field is preserved for forward compatibility — if a
future Obsidian release routes `eval` per-vault, the wrapper will
already pass the parameter.

### Boundary rule (Q1)

The body terminates at the **first subsequent heading marker of any
depth** — child, sibling, or shallower — or at EOF. Child-heading
subtrees are excluded from the parent's body. Per the [Q1
clarification](../../specs/015-read-heading/spec.md#clarifications)
of the 2026-05-09 session.

### ATX-only (Q2)

Only ATX-style headings (`# Heading` through `###### Heading` with the
required space after the `#`-run) are recognised as path segments AND
as body terminators. Setext-style underlines (`====` for H1, `----`
for H2) are content, not boundaries. Per the [Q2
clarification](../../specs/015-read-heading/spec.md#clarifications).
The JS template applies a defence-in-depth filter
(`text.charAt(h.position.start.offset) === '#'`) to enforce ATX-only
even on Obsidian versions that include Setext entries in the headings
array.

### Segment matching (Q3 / FR-028)

Minimal-normalisation, **case-sensitive byte compare**. Closing-ATX
forms (e.g. `## My Heading ##`) and surrounding whitespace are stripped
by Obsidian's pre-parser before the heading text reaches the matcher.
Inline markdown (`**bold**`, `[link](url)`) and Obsidian anchor markers
(`^anchor-id`) survive in the heading text and MUST be supplied
**verbatim** by the caller. Mis-cased segments do NOT match. Per the
[Q3 clarification](../../specs/015-read-heading/spec.md#clarifications).

### Duplicate heading paths (FR-017)

When two or more headings in the same file share the textually-identical
full path (e.g. two `## Naming` sections under the same `# Best
Practices` parent), the **first-document-order** match is returned.
Locks deterministic behaviour.

### CRLF / LF line endings (FR-019)

Returned `content` carries the file's on-disk line endings byte-faithfully.
The wrapper does NOT normalise line endings — a CRLF-encoded file
yields `\r\n` byte pairs in the response; an LF-encoded file yields
`\n`.

### Body byte-level preservation (FR-020)

Returned `content` is the raw bytes between heading positions, including
fenced code blocks, table pipes, list indentation, inline markdown, and
any literal Setext-underline text. The wrapper does NOT re-format.

### Practical 10 MiB body ceiling

Heading bodies exceeding ~10 MiB after JSON encoding (~7 MiB raw
content) trigger the cli-adapter's output cap, surfacing as
`CLI_NON_ZERO_EXIT` (output-cap kill). Recommended fall-back for
very-large-body cases: full-file `read_note`. No new error code is
introduced.

### Unknown vault

Unknown vault names surface as `CLI_REPORTED_ERROR` with the verbatim
`Vault not found.` message (per the cli-adapter's R5 / T002
response-inspection clause inherited from the prior typed tools).

## Errors

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `read_heading` introduces zero new error codes.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed `readHeadingInputSchema` validation: missing or empty `heading`, single-segment heading (no `::`), heading with empty segments (leading/trailing/consecutive `::`), missing `vault` in specific mode, both `file` and `path` provided in specific mode, `vault`/`file`/`path` provided in active mode, unknown top-level key. Validation occurs strictly before any CLI dispatch (FR-018). | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (eval syntax error, dispatch timeout, dispatch kill on signal, output-cap kill — pathologically large body slice). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band: (a) unknown-vault response (`Vault not found.`) caught by the cli-adapter's R5 inspection; (b) eval response was unparseable JSON (`details.stage = "json-parse"`); (c) eval response shape violated the discriminated-union envelope (`details.stage = "envelope-parse"`); (d) envelope `ok: false` with `code: "FILE_NOT_FOUND"` (`details.stage = "envelope-error"`, `details.code = "FILE_NOT_FOUND"` — FR-014); (e) envelope `ok: false` with `code: "HEADING_NOT_FOUND"` (`details.stage = "envelope-error"`, `details.code = "HEADING_NOT_FOUND"` — FR-013). | `details.message`, `details.stage`, and `details.code` (when added) name the specific failure. |
| `ERR_NO_ACTIVE_FILE` | Active mode invoked while no note is focused. Surfaces via either the structured envelope `{ok: false, code: "NO_ACTIVE_FILE"}` (primary path) or the dispatch-layer four-priority classifier catching `Error: no active file` on stdout (defensive backstop). | Switch to specific mode with an explicit `vault` + `file`/`path`, OR open a note in Obsidian to make it active. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`read_heading` propagates the adapter's classification verbatim with no
rewrites. **No new codes** are introduced (FR-022).

## Examples

### Example 1 — Specific mode, 2-segment heading by path

```json
{
  "name": "read_heading",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "areas/best-practices.md",
    "heading": "Best Practices::Naming"
  }
}
```

Spawns `obsidian vault=Demo eval code=<rendered-js>`. Returns
`{ "content": "Use kebab-case.\n" }` for the body of the `## Naming`
section under `# Best Practices`. Replaces the agent's "full-file
`read_note` then client-side Markdown parse" sequence.

### Example 2 — Specific mode, 3-segment nested heading by file (wikilink)

```json
{
  "name": "read_heading",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "file": "best-practices",
    "heading": "Best Practices::Naming::Casing"
  }
}
```

Resolves `best-practices` via `app.metadataCache.getFirstLinkpathDest`
(wikilink form, no extension, no folder), then slices the body of the
`### Casing` section under `## Naming` under `# Best Practices`. Returns
`{ "content": "Use lowercase letters and dashes.\n" }`.

### Example 3 — Active mode

```json
{
  "name": "read_heading",
  "arguments": {
    "target_mode": "active",
    "heading": "Top::Section A"
  }
}
```

Spawns `obsidian eval code=<rendered-js>` with no `vault=` argv prefix.
Resolves the focused note via `app.workspace.getActiveFile()` and
slices the body of `## Section A` under `# Top`. Returns
`{ "content": "Hello.\n" }`. If no note is focused, raises
`ERR_NO_ACTIVE_FILE`.

### Example 4 — Validation rejection (single-segment heading)

```json
{
  "name": "read_heading",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "x.md",
    "heading": "BestPractices"
  }
}
```

The schema validator rejects this at the boundary before any CLI
dispatch occurs. Returns a `VALIDATION_ERROR` envelope with field
path `["heading"]` and a message about `at least two ::-separated
segments`. The fallback for an H1-only read is full-file `read_note`
plus client-side parse.

### Example 5 — Heading-not-found error

```json
{
  "name": "read_heading",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "areas/best-practices.md",
    "heading": "Best Practices::NonExistent"
  }
}
```

Returns `CLI_REPORTED_ERROR` with `details.stage = "envelope-error"`
and `details.code = "HEADING_NOT_FOUND"`. The message field carries the
verbatim eval-envelope `detail` describing the unmatched segment path.

## References

- [015-read-heading spec](../../specs/015-read-heading/spec.md) —
  feature spec, three Q1/Q2/Q3 clarifications session 2026-05-09.
- [015-read-heading research](../../specs/015-read-heading/research.md)
  — R1–R14 decisions, live-CLI findings F1–F8.
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the
  centralised `invokeCli` adapter that `read_heading` routes its single
  call through, including the R5 / T002 unknown-vault
  response-inspection clause.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
- [read_note](./read_note.md) — the typed full-file read tool; the
  documented fallback for out-of-reach heading paths (single-segment
  H1, `::`-in-text, Setext).
- [read_property](./read_property.md) — the symmetric file → property
  surgical read.
- [find_by_property](./find_by_property.md) — the closest sibling: also
  eval-composition-based, also has the inherited vault-routing
  limitation.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch
  retained for unwrapped subcommands.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
