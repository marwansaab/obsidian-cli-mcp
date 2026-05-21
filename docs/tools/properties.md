# `properties`

## Overview

Return the vault-wide catalogue of frontmatter property names with
per-property note counts as a typed envelope `{ count, properties: [{
name, noteCount }] }`. Wraps the upstream Obsidian CLI's `properties`
subcommand natively. The second **structural-discovery** primitive
(after [outline](./outline.md)) — where `read_property` returns one
property value in one note and `find_by_property` returns the set of
notes carrying a specific value, `properties` returns the union of
distinct names across the entire vault. Agents that previously combined
`obsidian_exec` with a full-vault grep plus client-side dedup pay one
to two orders of magnitude less token cost.

This tool is **vault-only** — there is no `target_mode` discriminator,
no `file` / `path` / `active` argument. Per-file frontmatter is covered
by [read_property](./read_property.md); per-name value lookups by
[find_by_property](./find_by_property.md).

## Input contract

`properties` consumes the schema below. Every field is rejected at the
boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

```json
{
  "vault": "<vault name>",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `vault` | string | OPTIONAL | length ≥ 1 — honoured by upstream; unregistered vault names surface as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` per [Inherited limitations](#multi-vault-default-ambiguity) |
| `total` | boolean | OPTIONAL | defaults to `false` |

### Per-field policy

- **`vault`** — the vault display name. When omitted, the focused vault
  is used. **Inherited limitation**: per the 2026-05-13 live probe (F4),
  the upstream CLI silently honours-as-noop the `vault=` parameter for
  the `properties` subcommand — the focused vault is what's actually
  used regardless. The wrapper accepts and forwards the parameter as
  data (FR-024 structural data-passing) but cannot enforce vault
  scoping. Parity with [files](./files.md), [outline](./outline.md),
  [read_heading](./read_heading.md), [find_by_property](./find_by_property.md).
- **`total`** — when `true`, the response carries `properties: []`
  with `count` set to the distinct property-name total. The CLI's
  native `total` flag is used (mutually exclusive with `format=json` at
  upstream per R3).

Out-of-scope upstream surfaces (rejected at the schema layer per
FR-005):

| Upstream parameter | Why not exposed | Alternative |
|---|---|---|
| `file=<name>` / `path=<path>` / `active` | Per-file frontmatter dump — different wire shape (single object, not array) | Use [read_property](./read_property.md) |
| `name=<name>` | Single-property note count (returns plain integer) | Use [find_by_property](./find_by_property.md) for value-to-file lookups |
| `sort=count` | Frequency-ordered list | Re-sort the `properties` list client-side |
| `counts` | No-op when `format=json` is set | n/a |
| `format=yaml|tsv` | Alternative output formats — wrapper hardcodes `format=json` for stable parsing | n/a |

## Output shape

Uniform envelope across both modes (the only difference is whether
`properties` is populated). The outer `count` value is identical
across both `total` branches for the same vault state (FR-006a
cross-mode invariant — confirmed by upstream per F3).

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
| `properties[].name` | string | Property name as upstream reports it after **case-insensitive collapse** (see "Dedup contract" below). Two notes carrying `Tags` and `tags` collapse to a single entry; upstream chooses the reported casing (typically the first-encountered casing in upstream's iteration order). |
| `properties[].noteCount` | integer ≥ 0 | Number of notes whose frontmatter declares this property name (sum across all case variants per the collapse rule). |

### Dedup contract (BI-041 FR-011 reconciled)

Upstream applies a **case-insensitive collapse** to frontmatter property
names: two notes carrying `AaTest` and `aatest` produce one merged entry
with `noteCount` summing both contributors. The reported casing in the
merged entry is upstream's choice (typically the first-encountered casing
in upstream's iteration order) — NOT alphabetical, NOT a wrapper-imposed
rule. The wrapper does not invent a tiebreaker and does not split case
variants.

The previously-documented "case-sensitive deduplication with byte-tiebreak
ordering" claim was incorrect (the wrapper sort was correct as
implementation; the assertion that case variants were *separate entries*
was wrong because upstream collapses them before the wrapper sees them).
This claim is **retired as of BI-041 (2026-05-21)**. Empirical anchor: a
fixture vault containing `AaTest.md` (`AaTest: value-1`) and `aatest.md`
(`aatest: value-2`) yields a single entry `{ name: "aatest", noteCount: 2 }`
(reported casing is upstream's choice — assert with case-insensitive regex).

### Sort order

`properties` is sorted alphabetical ascending by `name`, case-insensitive.
The sort is applied wrapper-side post-fetch (R8); upstream emits its own
order but the wrapper re-imposes the case-insensitive primary rule
regardless of upstream version's sort behaviour. Because upstream collapses
case variants before the wrapper sees them, no two entries share a
case-folded key — so no secondary tiebreak operates in practice.

### Empty vaults

A vault with zero frontmatter returns `{ count: 0, properties: [] }`
in both modes. No sentinel string is involved — upstream emits `[]`
(default mode) or `0` (count-only mode) which both flow naturally
through the handler's parse-and-map chain.

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

Use this as the entry point for "what frontmatter properties does this
vault use?" workflows. The upstream `type` metadata (`text`, `tags`,
`date`, `multitext`, `checkbox`, etc.) is dropped per FR-004 — future
BI may expose it as a separate field if user demand emerges.

### Example 2 — Named-vault scoping (multi-vault inherited limitation)

```json
{
  "name": "properties",
  "arguments": { "vault": "Architecture Notes" }
}
```

Spawns one call: `obsidian properties vault="Architecture Notes"
format=json`. **The upstream silently honours-as-noop the `vault=`
parameter** — the focused vault is what's actually used regardless. The
wrapper still passes the argument as data (FR-024); multi-vault users
must open the target vault in Obsidian before invoking. Parity with
`files`, `outline`, `read_heading`, `find_by_property`.

### Example 3 — Count-only mode (token-economical pre-flight read)

```json
{
  "name": "properties",
  "arguments": { "total": true }
}
```

Spawns one call: `obsidian properties total` (the `format=json`
parameter is omitted — `total` and `format=json` are mutually exclusive
at upstream per R3). Response:

```json
{ "count": 73, "properties": [] }
```

Use this when only the distinct-name count matters (size estimation,
quick existence check, drift watchdog). The outer `count` value
matches the default-mode `count` for the same vault state (FR-006a
cross-mode invariant). The count-only mode also bypasses the
output-cap risk entirely for vaults with very large inventories.

### Example 4 — Empty vault

```json
{
  "name": "properties",
  "arguments": {}
}
```

Against a vault with zero frontmatter, the response is:

```json
{ "count": 0, "properties": [] }
```

The handler's parse-and-map chain produces this from upstream's `[]`
JSON output naturally (no special-case sentinel detection required).

### Example 5 — Validation rejection

```json
{
  "name": "properties",
  "arguments": { "vault": "" }
}
```

The empty-string `vault` fails the schema's `.min(1)` check; the
registration layer maps the `ZodError` to `VALIDATION_ERROR`:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"VALIDATION_ERROR\",\"message\":\"properties input failed schema validation\",\"details\":{\"issues\":[{\"path\":[\"vault\"],\"message\":\"String must contain at least 1 character(s)\",\"code\":\"too_small\"}]}}" }]
}
```

Likewise, an unknown top-level key (e.g. `{ "file": "note.md" }`)
fails `additionalProperties: false` and surfaces as
`VALIDATION_ERROR — Unrecognized key(s) in object: 'file'`.

### Example 6 — Case-variant collapse (BI-041)

```json
{
  "name": "properties",
  "arguments": {}
}
```

Against a vault where some notes carry `AaTest:` and others `aatest:`,
upstream's case-insensitive collapse rule merges them into one entry with
`noteCount` summing both contributors:

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

The reported casing (`aatest` vs `AaTest` vs `AATEST`) is upstream's
choice, not a wrapper-imposed rule. Agents seeking "did this vault have
case-variant drift?" must compare against ground truth (e.g. by reading
individual notes via `read_property`) — the collapse rule erases the
case-variance signal from this tool's output. Agents seeking to normalise
case across the vault use `read_property` + `set_property` per-note.

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `properties` introduces **zero new error codes**.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (`vault` non-string, `vault` empty, `total` non-boolean, unknown top-level key including `file` / `path` / `active` / `name` / `sort` / `counts` / `format`). | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` | Wrapper-imposed: (a) JSON parse failure in default mode (`details.stage: "json-parse"` — upstream contract divergence); (b) integer parse failure in count-only mode (`details.stage: "total-parse"` — upstream contract divergence). | Investigate as a regression — the upstream contract was contract-stable per plan-stage F1/F3. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large inventories). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap-risk entirely (upstream returns a small integer regardless of inventory size). |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the cli-adapter's 10 MiB output cap (cap-exceeded kill). | Use `total: true`, OR reduce vault scope. |

**No `ERR_NO_ACTIVE_FILE`** — this tool has no active mode.
**`CLI_REPORTED_ERROR` for unknown vault — BI-042 reconciliation
(2026-05-21)**: contrary to the spec-stage F4 finding (which claimed
upstream silently honoured `vault=` as a noop), upstream Obsidian
CLI 1.12.7 DOES validate `vault=` and emit `"Vault not found."` on
stdout (exit 0) for unregistered vault display names. The 011-R5
cli-adapter unknown-vault inspection clause fires and reclassifies
to `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`
The original spec-stage FR-015 amendment remains a useful historical
record; the structurally-observable contract is now the
`CLI_REPORTED_ERROR` envelope above. See
[specs/042-close-audit-findings/contracts/vault-probe-evidence.md](../../specs/042-close-audit-findings/contracts/vault-probe-evidence.md)
T007 for the probe record.

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`properties` propagates the adapter's classification verbatim with no
rewrites.

## Inherited limitations

### Multi-vault default ambiguity

The Obsidian CLI's `vault=` parameter is honoured by upstream for the
`properties` subcommand. Invocations against an unregistered vault
name emit `"Vault not found."` on stdout (exit 0), which the
cli-adapter's 011-R5 inspection clause reclassifies as a structured
`CLI_REPORTED_ERROR` envelope with `details.message: "Vault not
found."` (see the error roster below). Invocations against a
registered vault name target that vault. The previously-documented
"silently honoured-as-noop" claim (spec-stage F4) is retired as of
BI-042 (2026-05-21) per the empirical probe captured against upstream
Obsidian CLI 1.12.7 — see
[specs/042-close-audit-findings/contracts/vault-probe-evidence.md](../../specs/042-close-audit-findings/contracts/vault-probe-evidence.md)
T007. (Empirical anchor: probe captured 2026-05-21 against
obsidian-cli 1.12.7; re-verify on next audit cycle.) Parity with
`files`, `outline`, `read_heading`, `find_by_property` — all
underwent the same reconciliation in this BI.

### Output-cap ceiling

Very large inventories may exceed the cli-adapter's 10 MiB output cap
and surface as `CLI_NON_ZERO_EXIT`. In practice this requires
~200,000 distinct property names; the `total: true` mode bypasses the
risk entirely — upstream returns a small integer regardless of
inventory size.

### Sort order is wrapper-locked

The case-insensitive-primary sort is applied wrapper-side post-fetch
(per the 2026-05-13 clarifications session Q1 / FR-013). The
byte-order tiebreak from the original FR-013 text is structurally
unobservable post-BI-041: upstream's case-insensitive collapse merges
case-variant names before the wrapper sees them, so no two entries
share a case-folded key and no secondary tiebreak operates in
practice. Upstream's order is not load-bearing for this tool — the
wrapper re-imposes the case-insensitive primary-key rule regardless
of upstream's default (`sort=name` ascending in the version probed at
plan stage). Callers needing alternative sort orders (e.g.
`sort=count` frequency-ordered) re-sort the `properties` list
client-side, or fall through to `obsidian_exec` for the
upstream-native `sort=count` view.

### Type metadata is dropped

Upstream emits a per-entry `type` field with values from `{aliases,
text, date, multitext, number, tags, checkbox, ...}`. The wrapper
drops this field per FR-004 (type-aware enumeration is out of scope).
Future BI may expose `type` as a separate field if user demand
emerges; until then, callers needing type metadata use
`obsidian_exec properties format=json` for the raw upstream wire
shape.

### Single-call architecture

Each MCP request fires exactly ONE `invokeCli` invocation regardless
of `vault` or `total`. End-to-end latency is approximately 1× a
single-call typed tool (~50–150 ms typical). All invocations serialise
through the project's single-in-flight queue.

### Argv anti-injection guarantee

User input (`vault`) flows through a discrete argv parameter to the
CLI's `properties` subcommand via `child_process.spawn` — no shell
interpolation, no `eval` source-text concatenation. The "no eval
injection vector" assertion holds because `properties` invokes the
native subcommand directly (stark contrast to `read_heading` /
`find_by_property` which compose against `eval`).

## Related tools

- [read_property](./read_property.md) — read a single property's
  value in a single note; pairs naturally with `properties` (discover
  the name set first, then read the per-note values).
- [find_by_property](./find_by_property.md) — find the set of notes
  whose frontmatter declares a specific property value; pairs
  naturally with `properties` for inventory-to-cohort workflows.
- [outline](./outline.md) — heading structure of a single Markdown
  note; the first structural-discovery primitive.
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch for
  `properties sort=count` (frequency-ordered) or
  `properties format=tsv` renderings.

## References

- [024-list-properties spec](../../specs/024-list-properties/spec.md)
  — feature spec, clarifications session 2026-05-13 (Q1 sort order
  drift-adjacent, Q2 `total` outer count semantic = distinct names),
  plan-stage FR-015 unknown-vault amendment per F4.
- [024-list-properties research](../../specs/024-list-properties/research.md)
  — R1–R14 design decisions, F1–F14 live findings, T0 capture
  summary.
- [024-list-properties data-model](../../specs/024-list-properties/data-model.md)
  — schema shapes, per-tool invariants, test inventory (45 cases).
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
