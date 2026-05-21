# `outline`

## Overview

Return the flat ordered list of every heading in a Markdown note as a
typed envelope `{ count, headings: [{ level, text, line }] }`. Wraps the
upstream Obsidian CLI's `outline` subcommand natively. The first
**structural-discovery** primitive — where `read` returns whole files
(typically 5–50 kB) and `read_heading` returns the body of a single
named section, `outline` returns the heading skeleton (typically a few
hundred bytes). Agents that previously read the full file and
client-side-parsed Markdown for a section list pay one to two orders
of magnitude less token cost.

The tool supports two target modes:

- **specific** — name the vault and exactly one of `file` (wikilink) or
  `path` (vault-relative path).
- **active** — operate on the currently focused note in the focused
  vault. No `vault`, `file`, or `path` argument is permitted.

The discriminator is `target_mode`. The schema composes the
[target-mode primitive](../../specs/004-target-mode-schema/spec.md)
with the standard file-scoped refinement (vault-required-in-specific,
file/path XOR in specific, vault/file/path forbidden in active). A
single optional `total` boolean field layers on top to switch the tool
into count-only mode.

## Input contract

`outline` consumes the schema below. Every field is rejected at the
boundary as `VALIDATION_ERROR` if the constraints fail. Unknown
top-level keys are rejected (`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "file": "<wikilink-style name>",
  "path": "<vault-relative path>",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | XOR | exactly one of `file` / `path` |
| `path` | string | XOR | exactly one of `file` / `path` |
| `total` | boolean | OPTIONAL | defaults to false |

### Active mode

```json
{
  "target_mode": "active",
  "total": false
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `total` | boolean | OPTIONAL | defaults to false |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `file` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `path` | (n/a) | FORBIDDEN | rejected at the schema layer |

### Per-field policy

- **`file`** — wikilink-style file name (resolved via Obsidian's
  metadata cache). The `.md` extension is accepted but not required.
- **`path`** — exact vault-relative path. Path-traversal patterns
  (`../escape.md`, absolute paths) are passed through verbatim and
  rejected at the upstream CLI as `CLI_REPORTED_ERROR — Error: File "X"
  not found.` (per F16). The wrapper does NOT pre-validate `path`.
- **`total`** — when `true`, the response carries `headings: []` with
  `count` set to the heading total. The CLI's native `total` flag is
  used (mutually exclusive with `format=json` at upstream per F14).

## Output shape

Uniform envelope across both modes (the only difference is whether
`headings` is populated).

### Default mode (`total !== true`)

```json
{
  "count": 4,
  "headings": [
    { "level": 1, "text": "Top",   "line": 1 },
    { "level": 2, "text": "Sub A", "line": 3 },
    { "level": 2, "text": "Sub B", "line": 5 },
    { "level": 3, "text": "Leaf",  "line": 7 }
  ]
}
```

### Count-only mode (`total: true`)

```json
{ "count": 4, "headings": [] }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | integer ≥ 0 | Heading count. Identical across both `total` branches for the same source file. |
| `headings` | array | One entry per heading in source order. Populated in default mode; always `[]` in count-only mode. |
| `headings[].level` | integer 1–6 | Source-faithful heading level. Never normalised (level-skipping preserved per FR-014). |
| `headings[].text` | string | Heading text payload. Upstream already strips the ATX `#` markers, the closing-ATX `##` suffix, and surrounding whitespace; inline markdown and Obsidian anchor markers survive byte-faithfully. |
| `headings[].line` | integer ≥ 1 | 1-based source line. |

### Zero-heading notes

A note with no headings returns `{ count: 0, headings: [] }` in both
modes. The wrapper detects the upstream literal `No headings found.`
sentinel (case-sensitive byte equality after trim) before parse and
maps both modes to the empty envelope.

## Worked examples

### Example 1 — Specific mode, multi-heading note by path

```json
{
  "name": "outline",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Projects/Roadmap.md"
  }
}
```

Spawns one call: `obsidian vault=Demo outline format=json
path=Projects/Roadmap.md`. Example response:

```json
{
  "count": 4,
  "headings": [
    { "level": 1, "text": "Q1 Plan",     "line": 1 },
    { "level": 2, "text": "Milestones",  "line": 3 },
    { "level": 2, "text": "Risks",       "line": 12 },
    { "level": 3, "text": "Open Items",  "line": 20 }
  ]
}
```

### Example 2 — Active mode, focused note

```json
{
  "name": "outline",
  "arguments": { "target_mode": "active" }
}
```

Spawns one call: `obsidian outline format=json` (no `vault=` /
`file=` / `path=` arguments — the upstream resolves against the
focused note in the focused vault). The active-mode TOCTOU caveat
applies; the response carries no `vault` echo.

### Example 3 — Count-only, multi-heading file

```json
{
  "name": "outline",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Projects/Roadmap.md",
    "total": true
  }
}
```

Spawns one call: `obsidian vault=Demo outline total
path=Projects/Roadmap.md` (the `format=json` parameter is omitted —
`total` and `format=json` are mutually exclusive at upstream per
F14). Response:

```json
{ "count": 4, "headings": [] }
```

Use this for a token-economical pre-flight read when only the count
matters (size estimation, structural completeness check, etc.).

### Example 4 — File not found

```json
{
  "name": "outline",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Missing.md"
  }
}
```

The CLI returns `Error: File "Missing.md" not found.` exit 0. The
dispatch-layer `Error:`-prefix classifier maps this to:

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"code\":\"CLI_REPORTED_ERROR\",\"message\":\"Error: File \\\"Missing.md\\\" not found.\",\"details\":{...}}" }]
}
```

### Example 5 — Non-Markdown filetype rejection

```json
{
  "name": "outline",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "path": "Whiteboards/Architecture.canvas"
  }
}
```

The CLI returns `Error: File is not a markdown file.` exit 0
(verified at plan stage per F9 for `.canvas`; the same error fires
for `.pdf`, attachments, and any non-`.md` filetype). The
dispatch-layer classifier maps to `CLI_REPORTED_ERROR`. The wrapper
performs no pre-validation of filetype — the upstream is the
authoritative rejector.

## Error roster

All failure surfaces flow through `UpstreamError` per Constitution
Principle IV. `outline` introduces **zero new error codes**.

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `total` non-boolean, unknown top-level key, `vault` empty). | Agent retries with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band. Five sub-cases: (a) file not found (`Error: File "X" not found.`), (b) non-Markdown filetype (`Error: File is not a markdown file.`), (c) path-traversal (treated as literal filename by upstream, surfaces as case (a)), (d) wrapper-imposed JSON parse failure (`details.stage: "json-parse"` — upstream contract divergence), (e) wrapper-imposed integer parse failure in count-only mode (`details.stage: "total-parse"` — upstream contract divergence). | Case (a): verify the path / file name. Case (b): use `obsidian_exec` if the upstream subcommand supports the filetype, else `read` for raw bytes. Cases (d/e): investigate as a regression — the upstream contract was contract-stable per plan-stage F1/F6. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. Upstream surfaces `Error: no active file` exit 0; dispatch-layer classifier auto-maps to `ERR_NO_ACTIVE_FILE`. | Operator-side: open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large outlines). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap-risk entirely (upstream returns a small integer regardless of heading count). |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the cli-adapter's 10 MiB output cap (cap-exceeded kill). | Use `total: true`, OR reduce note size. |

The canonical errors contract is at
[specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md);
`outline` propagates the adapter's classification verbatim with no
rewrites.

## Inherited limitations

### Multi-vault default ambiguity

The Obsidian CLI's `vault=` parameter is honoured by upstream for the
`outline` subcommand. Invocations against an unregistered vault name
emit `"Vault not found."` on stdout (exit 0), which the cli-adapter's
011-R5 inspection clause reclassifies as a structured
`CLI_REPORTED_ERROR` envelope with `details.message: "Vault not
found."` (see the error roster below). Invocations against a
registered vault name target that vault. The previously-documented
"silently honoured-as-noop" claim (spec-stage F8) is retired as of
BI-042 (2026-05-21) per the empirical probe captured against upstream
Obsidian CLI 1.12.7 — see
[specs/042-close-audit-findings/contracts/vault-probe-evidence.md](../../specs/042-close-audit-findings/contracts/vault-probe-evidence.md)
T006. (Empirical anchor: probe captured 2026-05-21 against
obsidian-cli 1.12.7; re-verify on next audit cycle.) Parity with
`files` (BI-019), which underwent the same reconciliation in this BI.

### Output-cap ceiling

Very large outlines may exceed the cli-adapter's 10 MiB output cap
and surface as `CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses
this risk entirely — upstream returns a small integer regardless of
heading count.

### Setext-included contract (defer-to-upstream)

The upstream CLI's `outline format=json` output INCLUDES Setext
underline-style headings (`Title\n=====`, `Title\n-----`) alongside
ATX-style headings. The wrapper preserves this — Setext entries
appear in `headings` byte-faithfully. This differs from
[read_heading](./read_heading.md) (BI-015) which excludes Setext from
its addressable surface. Use `outline` to detect the presence of
Setext headings in a note's structure when needed.

The plan-stage research (F10) recorded this contract as a
defer-to-upstream pattern, logically consistent with the
clarifications-session Q2/A2 decision to defer indented-code-block
opacity to upstream.

### Indented-code-block opacity (defer-to-upstream)

Heading-like text inside CommonMark indented code blocks does NOT
appear in the outline (verified at plan stage per F12). YAML
frontmatter content is similarly opaque (per F11), as is fenced-code-
block content (per F2). The wrapper defers to upstream's parser
behaviour for all three cases; no wrapper-side detector required.

### Single-call architecture

Each MCP request fires exactly ONE `invokeCli` invocation regardless
of `target_mode` or `total`. End-to-end latency is approximately 1×
a single-call typed tool (~50–200 ms typical). All invocations
serialise through the project's single-in-flight queue.

### Argv anti-injection guarantee

User inputs (`vault`, `file`, `path`) flow through discrete argv
parameters to the CLI's `outline` subcommand via
`child_process.spawn` — no shell interpolation, no `eval`
source-text concatenation. The "no eval injection vector" assertion
holds because `outline` invokes the native subcommand directly
(stark contrast to `read_heading` / `find_by_property` which compose
against `eval`).

## Related tools

- [read](./read.md) — full file content; use when you need the body,
  not just the heading skeleton.
- [read_heading](./read_heading.md) — body of a single named heading
  by `H1::H2[::H3]` path; pairs naturally with `outline` (outline
  first to discover the heading path, then read_heading to fetch the
  body).
- [obsidian_exec](./obsidian_exec.md) — freeform escape hatch for
  `outline format=tree` or `outline format=md` renderings.

## References

- [023-outline spec](../../specs/023-outline/spec.md) — feature spec,
  clarifications session 2026-05-13 (Q1 marker-stripping, Q2
  indented-code defer-to-upstream, Q3 non-`.md` rejection), plan-stage
  Setext defer-to-upstream amendment.
- [023-outline research](../../specs/023-outline/research.md) —
  R1–R14 design decisions, F1–F16 live findings, T0 capture summary.
- [023-outline data-model](../../specs/023-outline/data-model.md) —
  schema shapes, per-tool invariants, test inventory (52 cases).
- [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md)
  — canonical roster of `UpstreamError` codes.
- [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md)
  — shared discriminator the input schema composes via the
  standard file-scoped refinement.
- [help tool spec](../../specs/005-help-tool/spec.md) — the
  schema-stripping contract and `help({ tool_name })` lookup that
  surfaces this document.
