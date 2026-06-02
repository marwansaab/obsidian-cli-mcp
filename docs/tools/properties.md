# `properties`

## Overview

Return the vault-wide catalogue of frontmatter property names with per-property note counts as a typed envelope `{ count, properties: [{ name, noteCount }] }`. Saves the agent from combining `obsidian_exec` with a full-vault grep plus client-side dedup — one to two orders of magnitude less token cost.

This tool is **vault-only** — there is no `target_mode` discriminator, no `file` / `path` / `active` argument.

## When to use this tool

| You want to | Reach for |
|---|---|
| Catalogue of distinct property names in a vault (with counts) | `properties` |
| Read one property value from one note | [`read_property`](./read_property.md) |
| Find the set of notes carrying a specific property value | [`find_by_property`](./find_by_property.md) |
| Write / update a property value | [`set_property`](./set_property.md) |
| Heading structure of a single note | [`outline`](./outline.md) |
| Frequency-ordered list (`sort=count`) or other native upstream output | [`obsidian_exec`](./obsidian_exec.md) |

## Input contract

`properties` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

```json
{
  "vault": "<vault name>",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `vault` | string | OPTIONAL | length ≥ 1 — honoured by upstream; unregistered vault names surface as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` |
| `total` | boolean | OPTIONAL | defaults to `false` |

### Per-field policy

- **`vault`** — the vault display name. When omitted, the focused vault is used. The upstream CLI honours the `vault=` parameter for the `properties` subcommand: registered display names route the call to that vault; unregistered names surface as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`. See *Multi-vault basename ambiguity* below for limits.
- **`total`** — when `true`, the response carries `properties: []` with `count` set to the distinct property-name total. Uses the upstream's native `total` flag (mutually exclusive with `format=json` at upstream).

Out-of-scope upstream parameters (rejected at the schema layer):

| Upstream parameter | Alternative |
|---|---|
| `file=<name>` / `path=<path>` / `active` | Per-file frontmatter dump — use [`read_property`](./read_property.md). |
| `name=<name>` | Single-property note count (plain integer). Use [`find_by_property`](./find_by_property.md) for value-to-file lookups. |
| `sort=count` | Re-sort the `properties` list client-side, OR route through [`obsidian_exec`](./obsidian_exec.md). |
| `counts` | No-op when `format=json` is set. |
| `format=yaml \| tsv` | Wrapper hardcodes `format=json` for stable parsing. |

## Output shape

Uniform envelope across both modes (the only difference is whether `properties` is populated). The outer `count` value is identical across both `total` branches for the same vault state.

### Default mode (`total !== true`)

```json
{
  "count": 4,
  "properties": [
    { "name": "aliases", "noteCount": 0 },
    { "name": "author",  "noteCount": 5 },
    { "name": "status",  "noteCount": 12 },
    { "name": "tags",    "noteCount": 8 }
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": 4, "properties": [] }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Number of distinct property names in the vault. Identical across both `total` branches for the same vault state. |
| `properties` | array | One entry per distinct property name. Populated in default mode; always `[]` in count-only mode. |
| `properties[].name` | string | Property name as upstream reports it after **case-insensitive collapse** (see *Dedup contract* below). Two notes carrying `Tags` and `tags` collapse to a single entry. |
| `properties[].noteCount` | integer ≥ 0 | Number of notes whose frontmatter declares this property name (sum across all case variants). |

### Dedup contract

Upstream applies a **case-insensitive collapse** to frontmatter property names: two notes carrying `AaTest` and `aatest` produce one merged entry with `noteCount` summing both contributors. The reported casing in the merged entry is upstream's choice (typically the first-encountered casing in upstream's iteration order). The wrapper does not invent a tiebreaker and does not split case variants.

Empirical anchor: a vault containing `AaTest.md` (`AaTest: value-1`) and `aatest.md` (`aatest: value-2`) yields a single entry `{ name: "aatest", noteCount: 2 }` (reported casing is upstream's choice — assert with case-insensitive regex).

### Sort order

`properties` is sorted alphabetically ascending by `name`, case-insensitive. The wrapper re-imposes this order post-fetch regardless of upstream's order. Because upstream collapses case variants before the wrapper sees them, no two entries share a case-folded key — so no secondary tiebreak operates in practice.

### Empty vaults

A vault with zero frontmatter returns `{ count: 0, properties: [] }` in both modes.

## Worked examples

### Example 1 — Default-scope happy path

```json
{
  "name": "properties",
  "arguments": {}
}
```

Spawns one call: `obsidian properties format=json`. Example response:

```json
{
  "count": 4,
  "properties": [
    { "name": "aliases", "noteCount": 0 },
    { "name": "author",  "noteCount": 5 },
    { "name": "status",  "noteCount": 12 },
    { "name": "tags",    "noteCount": 8 }
  ]
}
```

Use this as the entry point for "what frontmatter properties does this vault use?" workflows. The upstream `type` metadata (`text`, `tags`, `date`, `multitext`, `checkbox`, etc.) is dropped — use [`obsidian_exec`](./obsidian_exec.md) for the raw upstream output if you need it.

### Example 2 — Named-vault scoping

```json
{
  "name": "properties",
  "arguments": { "vault": "Architecture Notes" }
}
```

Spawns one call: `obsidian properties vault="Architecture Notes" format=json`. The upstream honours the vault routing; unregistered vault names surface as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`.

### Example 3 — Count-only mode (token-economical pre-flight read)

```json
{
  "name": "properties",
  "arguments": { "total": true }
}
```

Spawns one call: `obsidian properties total` (the `format=json` parameter is omitted — `total` and `format=json` are mutually exclusive at upstream). Response:

```json
{ "count": 73, "properties": [] }
```

Use this when only the distinct-name count matters (size estimation, quick existence check). The count-only mode also bypasses the output-cap risk entirely for vaults with very large inventories.

### Example 4 — Empty vault

```json
{
  "name": "properties",
  "arguments": {}
}
```

Against a vault with zero frontmatter:

```json
{ "count": 0, "properties": [] }
```

### Example 5 — Validation rejection

```json
{
  "name": "properties",
  "arguments": { "vault": "" }
}
```

The empty-string `vault` fails `.min(1)`:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"properties input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"vault\"],\"message\":\"String must contain at least 1 character(s)\",\"code\":\"too_small\"}]}}" }]
}
```

Unknown top-level keys (e.g. `{ "file": "note.md" }`) fail `additionalProperties: false` and surface as `VALIDATION_ERROR — Unrecognized key(s) in object: 'file'`.

### Example 6 — Case-variant collapse

```json
{
  "name": "properties",
  "arguments": {}
}
```

Against a vault where some notes carry `AaTest:` and others `aatest:`, upstream's case-insensitive collapse merges them:

```json
{
  "count": 3,
  "properties": [
    { "name": "aatest",   "noteCount": 5 },
    { "name": "banana",   "noteCount": 2 },
    { "name": "vault_id", "noteCount": 8 }
  ]
}
```

The reported casing (`aatest` vs `AaTest` vs `AATEST`) is upstream's choice, not a wrapper-imposed rule. The collapse rule erases the case-variance signal from this tool's output — agents needing per-note casing must read individual notes via [`read_property`](./read_property.md).

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (`vault` non-string, `vault` empty, `total` non-boolean, unknown top-level key including `file` / `path` / `active` / `name` / `sort` / `counts` / `format`). | Retry with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.message: "Vault not found."`) | Unknown vault display name. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"` or `"total-parse"`) | Upstream output did not match the expected JSON / integer shape — upstream contract divergence. | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large inventories). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap-risk entirely. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the 10 MiB output cap. | Use `total: true`, OR reduce vault scope. |

**No `ERR_NO_ACTIVE_FILE`** — this tool has no active mode.

## Inherited limitations

### Multi-vault basename ambiguity

Multi-vault setups can suffer from basename ambiguity: two vaults sharing the **same display name** are indistinguishable by the `vault=` argument. This is a genuine name-collision limit — **focusing a vault does not fix it, and focus is not required**: `properties` is a native CLI command that honours `vault=` and routes to the named vault even when it is open but unfocused (confirmed live 2026-06-02). To disambiguate genuinely same-named vaults, give them distinct display names.

### Output-cap ceiling

Very large inventories may exceed the 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT`. In practice this requires ~200,000 distinct property names; the `total: true` mode bypasses the risk entirely — upstream returns a small integer regardless of inventory size.

### Type metadata is dropped

Upstream emits a per-entry `type` field with values from `{aliases, text, date, multitext, number, tags, checkbox, ...}`. The wrapper drops this field — type-aware enumeration is out of scope. Callers needing type metadata use [`obsidian_exec`](./obsidian_exec.md) with `properties format=json` for the raw upstream wire shape.

### Latency

Approximately 50–150 ms per call. All invocations serialise through the wrapper's single-in-flight queue.
