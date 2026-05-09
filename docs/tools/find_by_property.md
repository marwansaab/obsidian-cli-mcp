# `find_by_property`

## Overview

Find every note in an Obsidian vault whose named frontmatter property
matches a given value. Returns `{ count, paths }` — a JSON envelope
carrying the integer match count and the sorted vault-relative paths of
every match (for example, `Inbox/Notes.md`). Inverse direction of
[`read_property`](./read_property.md): where `read_property` goes
file → value (given a path, return the property's value), this tool goes
value → file. Replaces the agent's "guess the path from convention"
sequence (1–5 calls per identifier resolution) with a single typed call.
Use [`obsidian_exec`](./obsidian_exec.md) only for unwrapped subcommands.

Unlike the other typed tools, `find_by_property` is **inherently
vault-wide**: it has no notion of an "active file" or "single named
file". The schema therefore does NOT carry the project's `target_mode`
discriminator. Pass `vault` to scope to a specific vault; omit it to use
Obsidian's focused-vault default (with the multi-vault caveats below).

## Input Schema

```json
{
  "vault": "<vault name>",
  "property": "<property name>",
  "value": "<scalar | array<scalar>>",
  "folder": "<vault-relative subtree>",
  "arrayMatch": true,
  "caseSensitive": true
}
```

| Field | Type | Required | Default | Constraint |
|-------|------|----------|---------|------------|
| `vault` | string | optional | (focused vault) | length ≥ 1; when omitted, the underlying CLI resolves to its focused-vault default — see "Multi-vault default ambiguity" below. |
| `property` | string | YES | none | length ≥ 1; passed through verbatim — no sanitisation, no escaping. |
| `value` | `string \| number \| boolean \| null \| Array<scalar>` | YES | none | Type-faithful comparison: number `7` is distinct from string `"7"`. Array branch is allowed only when `arrayMatch: false`; pairing array with the default `arrayMatch: true` is rejected at the schema layer. |
| `folder` | string | optional | `""` (whole vault) | Vault-relative folder. Rejected at the schema layer if it contains any `..` path segment OR starts with `/` or `\` — see "Folder path-traversal closure" below. |
| `arrayMatch` | boolean | optional | `true` | When the property's stored value is a YAML list, `true` performs **contains-semantics** (any element strict-equals the query); `false` performs **order-sensitive exact-equality** with an array `value`. |
| `caseSensitive` | boolean | optional | `true` | When `false`, string-vs-string comparisons fold case via `toLowerCase()`. Numeric / boolean / null / mixed-type comparisons remain strict-equality. |

`additionalProperties: false`. Unknown top-level keys are rejected.

## Output

```json
{ "count": 1, "paths": ["backlog/BI-030.md"] }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | non-negative integer | Number of matching notes; equals `paths.length` (the wrapper checks the invariant defensively). |
| `paths` | `string[]` | Vault-relative paths of every match, in Obsidian's metadata-cache iteration order. Same query within one MCP server session, with no intervening vault state change, returns byte-identical `paths` arrays. |

A query with zero matches returns `{ "count": 0, "paths": [] }` and does
NOT raise an error (this is the contractually distinct "no match" outcome,
not conflated with the unknown-vault failure surface).

## Behavioural notes (live-CLI characterisation)

These behaviours are captured in
[research.md](../../specs/014-find-by-property/research.md) (plan-stage
findings F1–F8 + the T0 Live-CLI Capture 2026-05-09) and are observable
by callers — agents should plan for them.

### Single-call architecture

The wrapper issues exactly **one** CLI invocation per `find_by_property`
request: `obsidian [vault=<v>] eval code=<rendered-js>`. The frozen JS
template walks Obsidian's in-memory `app.metadataCache.fileCache`,
applies the matching logic in-process, and returns one
`JSON.stringify({count, paths})` envelope. End-to-end latency is
approximately 200 ms per call. The single-in-flight queue serialises all
CLI invocations.

### `eval`-as-CLI-entry-point stability concern

There is no native find-by-property subcommand in the Obsidian CLI;
`find_by_property` is implemented atop the developer-section `eval`
subcommand. The wrapper reaches into Obsidian's internal
`app.metadataCache.fileCache` + `app.metadataCache.metadataCache`
structure. Future Obsidian updates may surface as test failures rather
than silent drift; the wrapper's two-stage response parse
(`JSON.parse` then output-schema validation) is the structural
backstop — neither stage silently coerces.

### Anti-injection structural guarantee

User-supplied `property`, `value`, and `folder` flow through
`JSON.stringify` → `Buffer.from(...).toString("base64")` → the frozen JS
template's `atob('<base64>')` + `JSON.parse` chain. The JS template
itself is a frozen string constant; the only insertion is a base64
payload whose alphabet (`[A-Za-z0-9+/=]`) is structurally safe inside any
JS string literal. No matter what bytes the user supplies, the rendered
`code=<...>` argv contains exactly the frozen JS template + a base64
string. There is no path for user input to escape into the JS source.
Most callers do not need to think about this — surfacing it for
security-conscious reviewers.

### Multi-vault default ambiguity

When `vault` is omitted, the underlying Obsidian CLI resolves to its
**focused-vault default** — the vault whose window is currently
foregrounded. In single-vault setups this is unambiguous. In multi-vault
setups it may resolve to whichever vault Obsidian last focused, or fail
unpredictably if no vault is foregrounded. **Recommendation**: callers
that require deterministic vault scoping pass `vault` explicitly. Parity
with [013-read-property](../../specs/013-read-property/research.md)'s
multi-vault limitation.

### Order-sensitive exact-array equality (Q1)

`arrayMatch: false` with an array `value` performs **positional**
comparison via `every((e, i) => eq(e, y[i]))`. `[alpha, beta]` does NOT
equal `[beta, alpha]`. Set-membership / multiset matching is not
supported; callers needing it can compose two `arrayMatch: true` calls
and intersect the result paths client-side, OR run an `arrayMatch: false`
call against every plausible permutation.

### Hierarchical-tag rollup is NOT performed (FR-023)

A query with `property: "tags"` and `value: "work"` does NOT match a
note tagged `tags: [work/tasks]`. The wrapper treats frontmatter tags as
opaque values — `===` only. Callers wanting hierarchical-rollup
semantics must enumerate the descendant tags themselves.

### List-of-mappings non-match (FR-024)

A list-valued property whose elements are themselves YAML mappings
(e.g. `entries: [{author: x, source: a}, ...]`) surfaces as `count: 0`
when queried with a scalar value (an object never strict-equals a
string / number / boolean / null). The query does NOT error; it
simply returns an empty match set. Verified live (T0.5).

### Date / datetime comparison

Obsidian stores YAML date and datetime values in the metadata cache as
**plain JS strings** (verified live, T0.1). The wrapper compares with
`===`. Queries must use the YAML serialisation form
(e.g. `2026-12-31`, `2026-05-08T14:30:00`); slashed (`2026/12/31`) or
otherwise reformatted equivalents do NOT match — they are different
strings. Documented as a known wrapper-side limitation.

### Unicode normalisation (NFC vs NFD)

The wrapper does NOT perform Unicode normalisation (verified live,
T0.2). A query for `café` (NFC, `é` as U+00E9) matches only files whose
on-disk frontmatter is also NFC; an otherwise-identical NFD-encoded
file (`e` + U+0301 combining acute) does NOT match. Callers needing
normalisation-insensitive comparison should normalise client-side or
supply both forms.

### Folder path-traversal closure (Q2 / FR-021)

A `folder` value containing any `..` path segment (regardless of
position) OR starting with `/` or `\` is rejected at the schema
validation boundary with `VALIDATION_ERROR`. No CLI dispatch occurs.
Defence-in-depth: the JS template's `path.startsWith(prefix)` check
operates against in-memory cache keys (vault-relative paths only); even
if a traversal escape slipped past the schema, the cache contains no
path outside the vault root.

### In-session output stability (FR-022)

The same query within one MCP server session, with no intervening vault
state change, returns byte-identical `paths` arrays. Order is NOT
guaranteed across sessions or vault state changes — file additions,
removals, or reindexes reorder the cache. Agents that pin a specific
ordering should re-issue the query rather than relying on cross-session
stability.

### Output cap

Pathologically large match sets (e.g. a property that every note in a
huge vault carries) may exceed the cli-adapter's 10 MiB stdout cap. The
cap fires as `CLI_NON_ZERO_EXIT` (output-cap kill), never silent
truncation. No new error code is introduced.

### Unknown vault

Unknown vault names surface as `CLI_REPORTED_ERROR` with the verbatim
`Vault not found.` message (per the cli-adapter's R5 / T002
response-inspection clause inherited from the prior typed tools). This
is a contractually distinct failure surface from the zero-match outcome
(`{ count: 0, paths: [] }`); callers should not conflate them.

## Errors

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `find_by_property` introduces zero new error codes.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed `findByPropertyInputSchema` validation: missing or empty `property`, missing `value`, value typed outside the union, array `value` paired with the default `arrayMatch: true`, `folder` containing a `..` segment or leading `/` `\`, unknown top-level key, etc. | Agent retries with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (eval syntax error, output-cap kill, dispatch timeout, dispatch kill on signal). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — the unknown-vault response (`Vault not found.`) was matched by the cli-adapter's R5 inspection, OR the eval response was unparseable JSON (`details.stage = "json-parse"`), OR the eval response shape failed the output-schema check (`details.stage = "schema-parse"`), OR the defensive `count !== paths.length` invariant tripped (`details.stage = "count-paths-mismatch"`). | `details.message` and `details.stage` (when the wrapper added one) name the specific failure. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`find_by_property` propagates the adapter's classification verbatim with
no rewrites. **No new codes** are introduced.

## Examples

### Example 1 — Scalar happy-path (single match by id)

```json
{
  "name": "find_by_property",
  "arguments": {
    "vault": "MyVault",
    "property": "id",
    "value": "BI-030"
  }
}
```

Spawns `obsidian vault=MyVault eval code=<rendered-js>`. Returns
`{ "count": 1, "paths": ["backlog/BI-030.md"] }` for a frontmatter
property `id: BI-030` on exactly one note. Agents typically use this
form to resolve a logical identifier to its file path in one round trip.

### Example 2 — Folder-scoped narrow

```json
{
  "name": "find_by_property",
  "arguments": {
    "vault": "MyVault",
    "property": "status",
    "value": "queued",
    "folder": "backlog"
  }
}
```

Returns matches restricted to notes whose vault-relative path begins
with `backlog/`. Useful when the same property name appears in
multiple subtrees (e.g. `backlog/`, `archive/`, `inbox/`) and the
caller cares about only one.

### Example 3 — Array contains (default `arrayMatch: true`)

```json
{
  "name": "find_by_property",
  "arguments": {
    "vault": "MyVault",
    "property": "tags",
    "value": "alpha"
  }
}
```

Matches every note whose `tags` list contains `"alpha"` as an element.
The default `arrayMatch: true` plus a scalar `value` gives
contains-semantics. Note: hierarchical tags do NOT roll up — a note
tagged `tags: [alpha/sub]` does not match a query for `"alpha"`.

### Example 4 — Case-insensitive opt-in

```json
{
  "name": "find_by_property",
  "arguments": {
    "vault": "MyVault",
    "property": "tag",
    "value": "alpha",
    "caseSensitive": false
  }
}
```

Matches notes with `tag: Alpha`, `tag: ALPHA`, `tag: alpha`, etc. Case
folding applies only to string-vs-string comparisons; numeric, boolean,
and null comparisons remain strict-equality.

### Example 5 — Array exact-equality (`arrayMatch: false`, order-sensitive)

```json
{
  "name": "find_by_property",
  "arguments": {
    "property": "tags",
    "value": ["alpha", "beta"],
    "arrayMatch": false
  }
}
```

Matches notes with `tags: [alpha, beta]` in **that exact order**.
`tags: [beta, alpha]` does NOT match (per Q1). For set-membership
semantics, use `arrayMatch: true` with a scalar `value`.

### Example 6 — Type-faithful numeric

```json
{
  "name": "find_by_property",
  "arguments": {
    "property": "count",
    "value": 7
  }
}
```

Matches notes with `count: 7` (YAML number). Does NOT match notes with
`count: "7"` (YAML quoted string) — the comparison is type-faithful
strict-equality.

### Example 7 — Vault omitted (focused-vault default)

```json
{
  "name": "find_by_property",
  "arguments": {
    "property": "id",
    "value": "BI-030"
  }
}
```

Spawns `obsidian eval code=<rendered-js>` with no `vault=` argv prefix.
The CLI resolves to its focused-vault default. Multi-vault users should
prefer Example 1's explicit-`vault` form to avoid the default-resolution
ambiguity.

## References

- [014-find-by-property spec](../../specs/014-find-by-property/spec.md)
  — feature spec, the user input acceptance criteria, the FR-027
  characterisation cases, the three Q1/Q2/Q3 clarifications.
- [014-find-by-property research](../../specs/014-find-by-property/research.md)
  — R1–R14 decisions, live-CLI findings F1–F8, and the T0 Live-CLI
  Capture (2026-05-09) section that drove the date-as-string,
  Unicode-byte-equal, and zero-staleness behaviours documented above.
- [cli-adapter spec](../../specs/003-cli-adapter/spec.md) — the
  centralised `invokeCli` adapter that `find_by_property` routes its
  single call through, including the R5 / T002 unknown-vault
  response-inspection clause.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
- [read_property](./read_property.md) — the symmetric file → value
  surgical frontmatter read.
- [read_note](./read_note.md) — the typed full-file read tool.
- [write_note](./write_note.md) — the typed create/overwrite tool.
- [delete_note](./delete_note.md) — the typed delete tool.
- [obsidian_exec](./obsidian_exec.md) — the freeform escape hatch
  retained for unwrapped subcommands.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — the canonical roster of `UpstreamError` codes.
