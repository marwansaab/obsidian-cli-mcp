# `outline`

## Overview

Return the flat ordered list of every heading in a Markdown note as `{ count, headings: [{ level, text, line }] }`. Wraps the Obsidian CLI's `outline` subcommand. Structural-discovery primitive — where [`read`](./read.md) returns whole files and [`read_heading`](./read_heading.md) returns the body of a single named section, `outline` returns just the heading skeleton (typically a few hundred bytes). Agents that previously read the full file and client-side-parsed Markdown for a section list pay one to two orders of magnitude less token cost.

**Supported file types: notes only.** Canvases, bases, attachments and files of any other type are rejected with `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"` before any `outline` call (spec 070). See *File types* below.

## When to use this tool

| You want to | Reach for |
|---|---|
| List every heading in a note (with levels + line numbers) | `outline` |
| Count headings without their text | `outline` with `total: true` |
| Get the body of one specific heading | [`read_heading`](./read_heading.md) |
| Get the full file content (body + headings) | [`read`](./read.md) |
| Get outgoing references (links / embeds) from a note | [`links`](./links.md) |
| Use a non-JSON outline format (`tree`, `md`) | [`obsidian_exec`](./obsidian_exec.md) |

## Input contract

`outline` consumes the schema below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

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
| `total` | boolean | OPTIONAL | defaults to `false` |

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
| `total` | boolean | OPTIONAL | defaults to `false` |
| `vault` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `file` | (n/a) | FORBIDDEN | rejected at the schema layer |
| `path` | (n/a) | FORBIDDEN | rejected at the schema layer |

### Per-field policy

- **`file`** — wikilink-style file name (resolved via Obsidian's metadata cache). The `.md` extension is accepted but not required.
- **`path`** — exact vault-relative path. Path-traversal patterns (`../escape.md`, absolute paths) are passed through verbatim and rejected at the upstream CLI as `CLI_REPORTED_ERROR — Error: File "X" not found.`. The wrapper does NOT pre-validate `path`.
- **`total`** — when `true`, the response carries `headings: []` with `count` set to the heading total. The CLI's native `total` flag is used (mutually exclusive with `format=json` at upstream).

### File types

`outline` checks the type of the file it is about to outline and accepts only notes (`.md`, matched case-insensitively). How the file is found depends on the locator:

- **`path`** — the type check runs on the path as given, before any CLI call. A `path` naming a canvas, base, attachment or other file is rejected whether or not the file exists.
- **`file`** — the wrapper first resolves the name with one extra `obsidian file file=<name>` call, checks the type of the resolved path, then forwards the original `file=` to `outline`. A name that cannot be resolved surfaces the resolver's error before any type check.
- **active mode** — the wrapper first resolves the focused file with one extra focused-file `eval` call, checks its type, then outlines that resolved path with `path=<focused path>` and no `vault=`, so the CLI uses the same vault the lookup read. A focus change to another file between the two calls cannot redirect the outline. No focused file surfaces `ERR_NO_ACTIVE_FILE` before any type check.

A rejected call makes no `outline` call and carries `details: { code: "UNSUPPORTED_FILE_TYPE", reason: "unsupported-type", path, extension, supported: ["note"] }`.

## Output shape

Uniform envelope across both modes; the only difference is whether `headings` is populated.

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
| `headings[].level` | integer 1–6 | Source-faithful heading level. Never normalised (level-skipping preserved). |
| `headings[].text` | string | Heading text payload. Upstream already strips the ATX `#` markers, the closing-ATX `##` suffix, and surrounding whitespace; inline markdown and Obsidian anchor markers survive byte-faithfully. |
| `headings[].line` | integer ≥ 1 | 1-based source line. |

### Zero-heading notes

A note with no headings returns `{ count: 0, headings: [] }` in both modes. The wrapper detects the upstream literal `No headings found.` sentinel (case-sensitive byte equality after trim) before parse and maps both modes to the empty envelope.

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

Spawns `obsidian vault=Demo outline format=json path=Projects/Roadmap.md`. Example response:

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

Resolves the focused file with a focused-file `eval` call, checks that it is a note, then spawns `obsidian outline format=json path=<focused path>` (no `vault=`: the CLI uses the vault the lookup read). Because the outline addresses the resolved path, a focus change to another file after the lookup cannot redirect it. The response carries no `vault` echo.

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

Spawns `obsidian vault=Demo outline total path=Projects/Roadmap.md` (the `format=json` parameter is omitted — `total` and `format=json` are mutually exclusive at upstream). Response:

```json
{ "count": 4, "headings": [] }
```

Use this for a token-economical pre-flight read when only the count matters (size estimation, structural completeness check, etc.).

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

The CLI returns `Error: File "Missing.md" not found.` exit 0. The dispatch-layer `Error:`-prefix classifier maps this to:

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

Rejected by the wrapper before any `outline` call (spec 070). The same rejection fires for bases, attachments, and any file that is not a `.md` note:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "outline: Whiteboards/Architecture.canvas is a canvas (.canvas); outline supports notes. Nothing was changed.",
  "details": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "reason": "unsupported-type",
    "path": "Whiteboards/Architecture.canvas",
    "extension": "canvas",
    "supported": ["note"]
  }
}
```

Before spec 070 this call reached the CLI, which replied `Error: File is not a markdown file.`, surfaced as an undiscriminated `CLI_REPORTED_ERROR`.

## Error roster

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed the schema (missing `target_mode`, missing `vault` in specific mode, neither `file` nor `path` in specific mode, both `file` AND `path` in specific mode, `vault`/`file`/`path` in active mode, `total` non-boolean, unknown top-level key, `vault` empty). | Retry with corrected input. `details.issues` carries per-issue `path` + `message` + zod code. |
| `VALIDATION_ERROR` (`details.code: "UNSUPPORTED_FILE_TYPE"`, `details.reason: "unsupported-type"`) | The file to outline is not a `.md` note (a canvas, base, attachment, or any other file). Raised before any `outline` call; for `file` and active calls, after the target resolves. `details` carries `path` (the resolved vault-relative path), `extension` (original case, `""` if none) and `supported: ["note"]`. | Nothing was changed. Use [`read`](./read.md) for a canvas or base's raw text. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band. Four sub-cases: (a) file not found (`Error: File "X" not found.`, from the `file` resolver or from `outline` itself), (b) path-traversal (treated as literal filename by upstream, surfaces as case (a)), (c) wrapper JSON parse failure (`details.stage: "json-parse"` — upstream contract divergence), (d) wrapper integer parse failure in count-only mode (`details.stage: "total-parse"`). | Case (a): verify the path / file name. Cases (c/d): investigate as a regression. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no Obsidian note is focused. | Ask the user to open a note in Obsidian, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (typical cause: output-cap kill on pathologically large outlines). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Use `total: true` to bypass the cap risk entirely (upstream returns a small integer regardless of heading count). |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_OUTPUT_TOO_LARGE` | The CLI's stdout exceeded the cli-adapter's 10 MiB output cap. | Use `total: true`, OR reduce note size. |

## Inherited limitations

### Multi-vault default ambiguity

The Obsidian CLI's `vault=` parameter is honoured by upstream for the `outline` subcommand. Invocations against an unregistered vault name emit `"Vault not found."` on stdout (exit 0), which the cli-adapter reclassifies as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."`. Invocations against a registered vault name target that vault.

### Output-cap ceiling

Very large outlines may exceed the cli-adapter's 10 MiB output cap and surface as `CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses this risk entirely — upstream returns a small integer regardless of heading count.

### Setext headings are included

The upstream CLI's `outline format=json` output INCLUDES Setext underline-style headings (`Title\n=====`, `Title\n-----`) alongside ATX-style headings. The wrapper preserves this — Setext entries appear in `headings` byte-faithfully. This differs from [`read_heading`](./read_heading.md), which excludes Setext from its addressable surface. Use `outline` to detect the presence of Setext headings in a note's structure when needed.

### Indented-code-block and frontmatter opacity

Heading-like text inside CommonMark indented code blocks does NOT appear in the outline. YAML frontmatter content and fenced-code-block content are similarly opaque. The wrapper defers to upstream's parser behaviour for all three cases.

### Latency

Approximately 50–200 ms per call. All invocations serialise through the project's single-in-flight queue.
