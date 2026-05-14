# `smart_connections_similar`

## Overview

Return the typed list of semantically-similar block-level matches for
a single source note via the Smart Connections plugin's similarity
API as a typed envelope
`{ count, matches: [{ path, headingPath, score }] }`. The project's
**first plugin-backed typed-content primitive** — where prior typed
tools route into Obsidian's core APIs (`metadataCache`, `vault.read`,
native subcommands), `smart_connections_similar` routes into a
plugin's runtime object at
`app.plugins.plugins["smart-connections"].env.smart_sources.items[<key>]
.find_connections({limit})`.

Wraps the Obsidian CLI's `eval` subcommand under the hood — there is
no native similarity subcommand. The wrapper renders a frozen JS
template against the plugin's runtime object and emits a structured
envelope. The agent does not need to know this — the call surface is
a typed MCP tool.

The tool supports two target modes:

- **specific** — name the vault and exactly one of `file` (wikilink)
  or `path` (vault-relative path).
- **active** — operate on the currently focused note in the focused
  vault. No `vault`, `file`, or `path` argument is permitted.

The discriminator is `target_mode`. The schema composes the
[target-mode primitive](../../specs/004-target-mode-schema/spec.md)
with the standard file-scoped refinement (vault-required-in-specific,
file/path XOR in specific, vault/file/path forbidden in active). Two
optional fields layer on top: `limit` (integer 1..100, default 20)
caps the result list AND the count; `total` (boolean) switches to
count-only mode.

The tool name follows the
[ADR-013 plugin-namespace convention](../../.decisions/ADR-013%20-%20Plugin-Namespace%20Tool%20Naming%20Convention.md)
— `<plugin_name>_<operation>`. Sibling rule to ADR-010 for native-
CLI-subcommand wrappers; mutually exclusive in scope.

## Input contract

Every field is rejected at the boundary as `VALIDATION_ERROR` if the
constraints fail. Unknown top-level keys are rejected
(`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "file": "<wikilink-style name>",
  "path": "<vault-relative path>",
  "limit": 20,
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | XOR | exactly one of `file` / `path` |
| `path` | string | XOR | exactly one of `file` / `path` |
| `limit` | integer | OPTIONAL | 1..100, default 20 |
| `total` | boolean | OPTIONAL | defaults to false |

### Active mode

```json
{
  "target_mode": "active",
  "limit": 20,
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `limit` | integer | OPTIONAL | 1..100, default 20 |
| `total` | boolean | OPTIONAL | defaults to false |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `file` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `path` | (n/a) | FORBIDDEN | rejected at the schema layer |

### Per-field policy

- **`file`** — wikilink-style file name (resolved inside the eval JS
  via `app.metadataCache.getFirstLinkpathDest`). The `.md` extension
  is accepted but not required.
- **`path`** — exact vault-relative path. Path-traversal patterns
  (`../escape.md`, absolute paths) are looked up against
  `app.vault.getAbstractFileByPath` — Obsidian's index uses vault-
  relative keys without `..` resolution, so the lookup returns null
  and the wrapper surfaces `CLI_REPORTED_ERROR(FILE_NOT_FOUND)`. No
  filesystem mutation occurs outside the vault.
- **`limit`** — caps the matches list length AND the count. Mirrors
  the plugin's `find_connections({limit})` parameter. The wrapper
  also applies a final `.slice(0, limit)` after sorting so that any
  plugin-internal cap below `limit` is honoured.
- **`total`** — when `true`, the response carries `matches: []` with
  `count` set to the total match count. The `count` is identical
  between `total: false` and `total: true` for the same note state
  at the same instant (cross-mode invariant, FR-006a).

## Output shape

Uniform envelope across both modes (the only difference is whether
`matches` is populated).

### Default mode (`total !== true`)

```json
{
  "count": 4,
  "matches": [
    { "path": "Topics/AI.md",     "headingPath": ["Overview"],            "score": 0.91 },
    { "path": "Topics/AI.md",     "headingPath": ["History", "1956"],     "score": 0.85 },
    { "path": "Notes/ML.md",      "headingPath": [],                       "score": 0.78 },
    { "path": "Bibliography.md",  "headingPath": ["---frontmatter---"],   "score": 0.70 }
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": 4, "matches": [] }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Total post-filter, post-self-exclusion match count. Identical across both `total` branches for the same source file. |
| `matches` | array | One entry per block-level match in `(score desc, path byte-asc, headingPath.join('#') byte-asc)` order. Populated in default mode; always `[]` in count-only mode. |
| `matches[].path` | string ending `.md` | Source file's vault-relative path with `.md` extension preserved — everything before the FIRST `#` in the plugin's match key. Directly pasteable into other typed tools' `path=` field. |
| `matches[].headingPath` | array of strings | Heading-path segments locating the matched block within `path` — split on `#` AFTER the first `#`. Empty `[]` for source-level matches; literal `["---frontmatter---"]` for frontmatter-block matches (plugin sentinel preserved verbatim, NOT normalised by the wrapper); multi-segment array for nested-heading-block matches. |
| `matches[].score` | finite number | Raw plugin-returned score (pass-through; no clamp / normalise / round). Embedding-model-dependent semantics — transformers.js ≈ `[0, 1]`; OpenAI ada-002 ≈ `[0, 1]`. |

### Block-vs-source granularity

The tool returns **block-level matches by default** — this is the
plugin's natural output shape. A single source note can produce
multiple entries (one per matching heading block, plus optionally a
frontmatter-block entry, plus optionally a source-level entry). Agents
wanting source-level granularity collapse to `path` client-side:

```js
Object.values(Object.fromEntries(matches.map(m => [m.path, m])))
```

keeps the highest-scoring entry per source.

### Sort order

Entries are sorted by `(score desc, path byte-asc, headingPath.join('#')
byte-asc)`. Pure byte-compare; no `localeCompare`; deterministic
across repeat calls.

### Filters applied inside the eval

- **Non-finite-score filter** (R10 / Q2): entries where `score` is
  `NaN`, `Infinity`, `-Infinity`, `null`, `undefined`, or any non-
  number are silently dropped. No envelope code is emitted for the
  filter event — bad entries simply don't appear.
- **Source-path-keyed self-exclusion** (R9 / FR-010): entries where
  `m.path === sourceKey` are removed. This excludes the source note
  AND any block inside the source from the result list (block-inside-
  source matches would otherwise dominate short notes per the plugin's
  natural output).

## Worked examples

### Example 1 — Specific mode, indexed note by path

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Source/Note.md",
    "limit": 10
  }
}
```

Fires one `invokeCli` (`obsidian vault=Demo eval code=<rendered-js>`).
Example response:

```json
{
  "count": 4,
  "matches": [
    { "path": "Topics/AI.md",    "headingPath": ["Overview"],          "score": 0.91 },
    { "path": "Topics/AI.md",    "headingPath": ["History", "1956"],   "score": 0.85 },
    { "path": "Notes/ML.md",     "headingPath": [],                     "score": 0.78 },
    { "path": "Bibliography.md", "headingPath": ["---frontmatter---"], "score": 0.70 }
  ]
}
```

### Example 2 — Specific mode by wikilink basename

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "file": "Note"
  }
}
```

Structurally equivalent to Example 1 when `Note` resolves unambiguously
to the same note via `app.metadataCache.getFirstLinkpathDest("Note",
"")`. When the basename matches multiple files, Obsidian's wikilink-
resolution semantics decide which file (the wrapper does NOT impose
disambiguation).

### Example 3 — Active mode, focused note

```json
{
  "name": "smart_connections_similar",
  "arguments": { "target_mode": "active" }
}
```

Fires one `invokeCli` (`obsidian eval code=<rendered-js>` — no
`vault=`). The eval resolves the source via
`app.workspace.getActiveFile()`. When no note is focused, the response
is a structured `ERR_NO_ACTIVE_FILE` error.

### Example 4 — Count-only pre-flight

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Source/Note.md",
    "total": true
  }
}
```

Same single eval invocation as Example 1; the envelope branch on
`a.total` inside the eval JS suppresses the per-entry list. Response:

```json
{ "count": 4, "matches": [] }
```

Use this for token-economical pre-flight reads (size estimation,
fan-out check, whether the source has any semantic neighbours at all).

### Example 5 — Plugin not installed

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Source/Note.md"
  }
}
```

When the Smart Connections plugin is not enabled in `Demo`, the
in-eval lifecycle check fires and returns an envelope
`SMART_CONNECTIONS_NOT_INSTALLED`. The wrapper maps to
`CLI_REPORTED_ERROR(stage:'envelope-error',
code:'SMART_CONNECTIONS_NOT_INSTALLED')`.

### Example 6 — Closed-but-registered vault retry pattern

```json
{
  "name": "smart_connections_similar",
  "arguments": {
    "target_mode": "specific",
    "vault": "The Setup",
    "path": "Process/notes.md"
  }
}
```

If `The Setup` is registered with Obsidian but the vault window is
not currently open, the CLI emits empty stdout + exit 0 AND
transparently opens the vault as a side effect. The wrapper's
handler stage-0 detection branch fires and surfaces
`CLI_REPORTED_ERROR(details.code:'VAULT_NOT_FOUND',
details.reason:'not-open')`. Agents MAY retry the same call after a
brief delay (typically 1–3 s while Obsidian finishes opening the
vault).

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `smart_connections_similar` introduces **zero new
top-level error codes** — the eleven-tool zero-new-codes streak since
BI-011 is preserved.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `limit` out of range / non-integer, `total` non-boolean, unknown top-level key, `vault` empty). | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"` or absent) | Specific mode + `vault` not registered with Obsidian. Upstream emits `Vault not found.` and the cli-adapter's 011-R5 inspection clause reclassifies. | Supply a registered vault display name. |
| `CLI_REPORTED_ERROR` (`details.code: "VAULT_NOT_FOUND"`, `details.reason: "not-open"`, `details.stage: "handler-stage-0"`) | Specific mode + `vault` IS registered but is NOT currently open in Obsidian. The CLI emitted empty stdout + exit 0 AND transparently OPENED the vault as a side effect; the wrapper's stage-0 detection branch fires. | Retry the same call after a brief delay (typically 1–3 s) — the vault is now opening. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "SMART_CONNECTIONS_NOT_INSTALLED"`) | The Smart Connections plugin is not enabled in the target vault. | Enable the plugin in Obsidian's community-plugins settings. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | `path` does not match any file in the vault, OR `file` (basename) does not resolve via `getFirstLinkpathDest`. `details.detail` distinguishes (`path: <path>` vs `wikilink: <file>`). | Verify the path / basename; check for typos; confirm the vault contains the file. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "NOT_MARKDOWN"`) | The resolved file's extension is not `.md` (e.g. `.canvas`, `.pdf`, attachments). | Use a different tool, or read the source bytes via `read`. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "SMART_CONNECTIONS_NOT_READY"`) | The plugin is loaded but its similarity API path (`env.smart_sources.items`) is unavailable — either initial indexing is still in progress OR a plugin-version drift has changed the API shape. | Wait for indexing to complete (visible in the plugin's UI as "X embeddings to make: 0"); or check that the installed plugin version matches the minimum probed v4.x — earlier v2.x / v3.x releases may have a different API path. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "SOURCE_NOT_INDEXED"`) | The source note exists in the vault but has not been indexed by the plugin yet (typical for just-created notes; the plugin's indexing-trigger debounce defaults to ~5 s). | Wait for the next indexing pass, or trigger a manual re-index from the plugin's UI. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. The eval surfaces envelope `NO_ACTIVE_FILE` and the wrapper maps to this code (parity with BI-015 read_heading / BI-025 links per T0.1 lock). | Operator-side: open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"`) | Stage-2 JSON parse on the eval stdout failed. Catch-all for upstream eval misbehaviour. | Investigate as a regression — the upstream contract was stable per plan-stage F2/F3/F4/F5/F6. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-parse"`) | Stage-3 envelope-schema validation failed. Catch-all for unexpected envelope keys (e.g. upstream version drift in the plugin's match shape). | Investigate as a regression. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large match lists — essentially unreachable at `limit: 100` per the practical-ceiling note below). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`smart_connections_similar` propagates the adapter's classification
verbatim with no rewrites beyond the two parse-failure stages, the
six envelope-error mappings, and the stage-0 closed-vault detection
branch documented above.

## Error-precedence chain (FR-017b)

Outer-to-inner, cheapest-first. Specific mode order:

```
VAULT_NOT_FOUND(unknown)            ← cli-adapter 011-R5 inspection
 → VAULT_NOT_FOUND(not-open)        ← handler stage-0 detection
 → SMART_CONNECTIONS_NOT_INSTALLED  ← in-eval Stage 1
 → FILE_NOT_FOUND                   ← in-eval Stage 2
 → NOT_MARKDOWN                     ← in-eval Stage 3
 → SMART_CONNECTIONS_NOT_READY      ← in-eval Stage 4
 → SOURCE_NOT_INDEXED               ← in-eval Stage 5
 → success
```

Active mode skips the two vault steps (active mode forbids the
`vault` argument per ADR-003). Each compound failure surfaces the
FIRST condition in the chain that fails — agents see exactly one
discriminator per failed call.

## Plugin-as-runtime-dependency

`smart_connections_similar` is the project's first typed tool whose
runtime dependency includes a third-party Obsidian plugin. The
plugin-lifecycle codes (`SMART_CONNECTIONS_NOT_INSTALLED` /
`SMART_CONNECTIONS_NOT_READY` / `SOURCE_NOT_INDEXED`) surface the
three discrete lifecycle states agents may encounter.

### Minimum probed Smart Connections plugin version

Verified against Smart Connections plugin **v4.5.0** (by Brian Petro;
manifest `id: smart-connections`, `minAppVersion: 1.1.0`). The wrapper
documents this as a **soft-pin** (per Q1 clarification) — the wrapper
does NOT enforce a version check at runtime. Users on older or newer
plugin versions whose API surface diverges from this baseline surface
deterministically as `SMART_CONNECTIONS_NOT_READY` via the in-eval
lifecycle check at Stage 4 of the JS template. The probed major
version `4.x` clarifies that the plugin's API path (`env.smart_sources
.items[<key>].find_connections({limit})`) is the v4-era shape; earlier
v2.x / v3.x plugin releases may have a different API path.

### Closed-but-registered-vault retry pattern

Per F7 / F8 live probe (2026-05-15): when a registered vault is not
currently open in Obsidian, the CLI emits empty stdout + exit 0 for
the FIRST `eval` invocation against that vault AND transparently
OPENS the vault as a side effect; the SECOND `eval` invocation
against the now-open vault works normally. The wrapper's handler
stage-0 detection branch surfaces the first call as
`CLI_REPORTED_ERROR(reason:'not-open')`. Agents that observe this
discriminator MAY retry the same call after a brief delay (typically
1–3 s while Obsidian finishes opening the vault); subsequent calls
will succeed against the now-open vault.

## Documented inherited limitations

### Embedding-model-dependent score bands

The `score` field is pass-through from the plugin. Different embedding
models (transformers.js local, OpenAI ada-002, OpenAI text-embedding-3-
small, etc.) produce different score ranges and distributions. The
wrapper does NOT clamp, normalise, or round. Agents comparing scores
across vaults should confirm the embedding model is identical.

### Indexing freshness

Results reflect the plugin's last embedding pass, NOT the vault's
current HEAD state. Recently edited or just-created notes may surface
as `SOURCE_NOT_INDEXED` until the next indexing pass completes
(plugin default debounce ≈ 5 s). For just-edited notes, the score
may reflect the previous version of the body text.

### Folder exclusions in plugin config

The Smart Connections plugin honours user-configured folder
exclusions silently — excluded folders' notes never appear in
`env.smart_sources.items` and therefore never appear in the result
list, nor surface `SOURCE_NOT_INDEXED` (they are simply absent). The
wrapper has no visibility into the plugin's exclusion config.

### Plugin-version drift surfaces as `SMART_CONNECTIONS_NOT_READY`

Per the Q1 docs-only soft-pin: no runtime version check. API drift
between minor plugin releases that changes the `env.smart_sources
.items[<key>].find_connections` path surfaces deterministically as
`SMART_CONNECTIONS_NOT_READY` via Stage 4 of the JS template. The
wrapper will NOT silently return wrong results for an incompatible
plugin version.

### Multi-vault basename ambiguity

The `vault=` parameter routes correctly to the named vault's `app`
instance (per F1 live probe), BUT the `file` (basename) lookup is
per-vault. Two vaults with notes sharing the same basename will each
resolve `file: "Note"` to their own `Note.md` — the wrapper does NOT
attempt cross-vault disambiguation. Use `path` for unambiguous
identification.

## Out-of-scope surfaces

- **Free-text semantic query** — single-source-note primitive only;
  defer to a future `smart_connections_query` tool.
- **Chat / RAG** — out of wrapper scope.
- **Embedding retrieval** — out of scope; the wrapper does NOT return
  raw embedding vectors.
- **Embedding generation trigger** — read-only surface; the wrapper
  does NOT trigger re-indexing.
- **Folder filters at request layer** — callers filter results client-
  side.
- **Threshold parameter** — model-dependent; deferred (callers filter
  by score client-side).
- **`exclude_self` request flag** — wrapper enforces source-path-
  keyed self-exclusion defence-in-depth regardless.
- **Cross-vault similarity** — single-vault per call.
- **Ranking-metadata discriminator** — collapsed into single `score`
  field.

## Practical ceiling

At `limit: 100`, each emitted entry is ~120 bytes
(`{"path":"Folder/Note.md","headingPath":["H1","H2"],"score":0.85}`);
100 matches × 120 bytes ≈ 12 KiB, **four orders of magnitude** below
the cli-adapter's 10 MiB cap. Cap-kill via `CLI_NON_ZERO_EXIT` is
effectively unreachable in practice but contractually preserved.

## Related tools

- [links](./links.md) — outgoing-link inventory for a single note;
  the deterministic-structure counterpart to the semantic-similarity
  primitive.
- [outline](./outline.md) — the heading skeleton for the same note;
  pairs with `smart_connections_similar` for full structural +
  semantic discovery.
- [read](./read.md) — full file content; use when you need the body
  bytes after identifying a similar source via this tool.
- [read_heading](./read_heading.md) — body of a single named
  heading; pair with `smart_connections_similar` to fetch the body
  of a matched block (use the `path` plus the `headingPath` joined
  with `::` as the `heading` argument).
- [find_by_property](./find_by_property.md) — frontmatter property
  search across the vault; the deterministic-metadata counterpart to
  the semantic-similarity primitive.
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch when
  the wrapper's shape is insufficient.

## References

- [026-smart-connections-similar spec](../../specs/026-smart-connections-similar/spec.md)
  — feature spec; clarifications session 2026-05-15 (Q1 docs-only
  soft-pin for minimum plugin version, Q2 silently drop non-finite
  scores, Q3 vault-mismatch detection — revised by live-probe
  amendment to closed-vault not-open, Q4 outer-to-inner / cheapest-
  first error precedence chain, Q5 architecture-doc snapshot
  semantics).
- [026-smart-connections-similar research](../../specs/026-smart-connections-similar/research.md)
  — Phase 0 decisions R1..R14, plan-stage live-CLI/plugin findings
  F1..F14, T0 captures.
- [026-smart-connections-similar data-model](../../specs/026-smart-connections-similar/data-model.md)
  — schema shapes, frozen JS template, base64 payload assembly,
  per-tool invariants, test inventory.
- [ADR-013 Plugin-Namespace Tool Naming Convention](../../.decisions/ADR-013%20-%20Plugin-Namespace%20Tool%20Naming%20Convention.md)
  — codifies the `<plugin_name>_<operation>` convention.
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md)
  — shared discriminator the input schema composes via the standard
  file-scoped refinement.
- [help tool spec](../../specs/005-help-tool/spec.md) — the schema-
  stripping contract and `help({ tool_name })` lookup that surfaces
  this document.
