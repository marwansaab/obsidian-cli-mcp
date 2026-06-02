# `find_by_property`

## Overview

Find every note in an Obsidian vault whose named frontmatter property matches a given value. Returns `{ count, paths }` — a JSON envelope carrying the integer match count and the sorted vault-relative paths of every match (for example, `Inbox/Notes.md`). Inverse direction of [`read_property`](./read_property.md): where `read_property` goes file → value (given a path, return the property's value), this tool goes value → file.

> **NOTE — the property-name parameter is `property:`, not `name:`** (diverges from sibling [`read_property`](./read_property.md) / [`set_property`](./set_property.md) which use `name:`). A call passing `name:` instead fails with `VALIDATION_ERROR`.

Unlike most typed tools, `find_by_property` is **inherently vault-wide**: it has no notion of an "active file" or "single named file". The schema therefore does NOT carry the `target_mode` discriminator. Pass `vault` to scope to a specific vault; omit it to use Obsidian's focused-vault default (with the multi-vault caveats below).

## When to use this tool

| You want to | Reach for |
|---|---|
| Find every note whose frontmatter property = value | `find_by_property` |
| Read a single property from one named note | [`read_property`](./read_property.md) |
| Write / update a single frontmatter value | [`set_property`](./set_property.md) |
| List every property name + type in the vault | [`properties`](./properties.md) |
| Find notes by tag | [`tag`](./tag.md) |
| Find notes by text content | [`search`](./search.md) / [`pattern_search`](./pattern_search.md) |
| Run a Bases-family structured query | [`query_base`](./query_base.md) |

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
| `vault` | string | optional | (focused vault) | length ≥ 1; when omitted, the underlying CLI resolves to its focused-vault default — see *Multi-vault default ambiguity* below. |
| `property` | string | YES | none | length ≥ 1; passed through verbatim — no sanitisation, no escaping. |
| `value` | `string \| number \| boolean \| null \| Array<scalar>` | YES | none | Type-faithful comparison: number `7` is distinct from string `"7"`. Array branch is allowed only when `arrayMatch: false`; pairing array with the default `arrayMatch: true` is rejected at the schema layer. |
| `folder` | string | optional | `""` (whole vault) | Vault-relative folder. Rejected at the schema layer if it contains any `..` path segment OR starts with `/` or `\` — see *Folder path-traversal closure* below. |
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

A query with zero matches returns `{ "count": 0, "paths": [] }` and does NOT raise an error (this is the contractually distinct "no match" outcome, not conflated with the unknown-vault failure surface).

## Behavioural notes

### Latency

Approximately 200 ms per call. All invocations serialise through the wrapper's single-in-flight queue.

### Multi-vault default ambiguity

When `vault` is omitted, the underlying Obsidian CLI resolves to its **focused-vault default** — the vault whose window is currently foregrounded. In single-vault setups this is unambiguous. In multi-vault setups it may resolve to whichever vault Obsidian last focused, or fail unpredictably if no vault is foregrounded. **Recommendation**: callers that require deterministic vault scoping pass `vault` explicitly — a named `vault` routes to that vault even when it is open but unfocused (focus is not required; verified per-tool by the BI-0134 forcing gate, [t0-probe-findings.md](../../specs/062-verify-cross-vault-routing/contracts/t0-probe-findings.md)).

### Order-sensitive exact-array equality

`arrayMatch: false` with an array `value` performs **positional** comparison via `every((e, i) => eq(e, y[i]))`. `[alpha, beta]` does NOT equal `[beta, alpha]`. Set-membership / multiset matching is not supported; callers needing it can compose two `arrayMatch: true` calls and intersect the result paths client-side, OR run an `arrayMatch: false` call against every plausible permutation.

### Hierarchical-tag rollup is NOT performed

A query with `property: "tags"` and `value: "work"` does NOT match a note tagged `tags: [work/tasks]`. The wrapper treats frontmatter tags as opaque values — `===` only. Callers wanting hierarchical-rollup semantics must enumerate the descendant tags themselves.

### List-of-mappings non-match

A list-valued property whose elements are themselves YAML mappings (e.g. `entries: [{author: x, source: a}, ...]`) surfaces as `count: 0` when queried with a scalar value (an object never strict-equals a string / number / boolean / null). The query does NOT error; it simply returns an empty match set.

### Date / datetime comparison

Obsidian stores YAML date and datetime values in the metadata cache as **plain JS strings**. The wrapper compares with `===`. Queries must use the YAML serialisation form (e.g. `2026-12-31`, `2026-05-08T14:30:00`); slashed (`2026/12/31`) or otherwise reformatted equivalents do NOT match — they are different strings.

### Unicode normalisation (NFC vs NFD)

The wrapper does NOT perform Unicode normalisation. A query for `café` (NFC, `é` as U+00E9) matches only files whose on-disk frontmatter is also NFC; an otherwise-identical NFD-encoded file (`e` + U+0301 combining acute) does NOT match. Callers needing normalisation-insensitive comparison should normalise client-side or supply both forms.

### Folder path-traversal closure

A `folder` value containing any `..` path segment (regardless of position) OR starting with `/` or `\` is rejected at the schema validation boundary with `VALIDATION_ERROR`. No CLI dispatch occurs. Defence-in-depth: the JS template's `path.startsWith(prefix)` check operates against in-memory cache keys (vault-relative paths only); even if a traversal escape slipped past the schema, the cache contains no path outside the vault root.

### In-session output stability

The same query within one MCP server session, with no intervening vault state change, returns byte-identical `paths` arrays. Order is NOT guaranteed across sessions or vault state changes — file additions, removals, or reindexes reorder the cache. Agents that pin a specific ordering should re-issue the query rather than relying on cross-session stability.

### Output cap

Pathologically large match sets (e.g. a property that every note in a huge vault carries) may exceed the cli-adapter's 10 MiB stdout cap. The cap fires as `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation.

### Unknown vault

Unknown vault names surface as `CLI_REPORTED_ERROR` with the verbatim `Vault not found.` message. This is a contractually distinct failure surface from the zero-match outcome (`{ count: 0, paths: [] }`); callers should not conflate them.

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed schema validation: missing or empty `property`, missing `value`, value typed outside the union, array `value` paired with the default `arrayMatch: true`, `folder` containing a `..` segment or leading `/` `\`, unknown top-level key, etc. | Retry with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (eval syntax error, output-cap kill, dispatch timeout, dispatch kill on signal). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — the unknown-vault response (`Vault not found.`) was detected, OR the eval response was unparseable JSON (`details.stage: "json-parse"`), OR the eval response shape failed the output-schema check (`details.stage: "schema-parse"`), OR the defensive `count !== paths.length` invariant tripped (`details.stage: "count-paths-mismatch"`). | `details.message` and `details.stage` (when the wrapper added one) name the specific failure. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

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

Spawns `obsidian vault=MyVault eval code=<rendered-js>`. Returns `{ "count": 1, "paths": ["backlog/BI-030.md"] }` for a frontmatter property `id: BI-030` on exactly one note. Agents typically use this form to resolve a logical identifier to its file path in one round trip.

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

Returns matches restricted to notes whose vault-relative path begins with `backlog/`. Useful when the same property name appears in multiple subtrees (e.g. `backlog/`, `archive/`, `inbox/`) and the caller cares about only one.

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

Matches every note whose `tags` list contains `"alpha"` as an element. The default `arrayMatch: true` plus a scalar `value` gives contains-semantics. Note: hierarchical tags do NOT roll up — a note tagged `tags: [alpha/sub]` does not match a query for `"alpha"`.

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

Matches notes with `tag: Alpha`, `tag: ALPHA`, `tag: alpha`, etc. Case folding applies only to string-vs-string comparisons; numeric, boolean, and null comparisons remain strict-equality.

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

Matches notes with `tags: [alpha, beta]` in **that exact order**. `tags: [beta, alpha]` does NOT match. For set-membership semantics, use `arrayMatch: true` with a scalar `value`.

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

Matches notes with `count: 7` (YAML number). Does NOT match notes with `count: "7"` (YAML quoted string) — the comparison is type-faithful strict-equality.

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

Spawns `obsidian eval code=<rendered-js>` with no `vault=` argv prefix. The CLI resolves to its focused-vault default. Multi-vault users should prefer Example 1's explicit-`vault` form to avoid the default-resolution ambiguity.
