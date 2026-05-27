# `read_heading`

## Overview

Read the body of a single named heading from a vault note. Returns `{ content: string }` — the body bytes between the matched heading and the next heading marker of any depth (or EOF). Saves the agent from a full-file `read` plus client-side Markdown parse (typically 5–50k tokens for long documents) — `read_heading` returns just the section's body (typically 100–500 tokens).

**Leading-newline caveat:** the body always begins with a leading `\n` byte (the line terminator after the matched heading line itself). Trim client-side if you need the body to start with prose.

## When to use this tool

| You want to | Reach for |
|---|---|
| One named section's body from a known file | `read_heading` |
| Whole file content | [`read`](./read.md) |
| Just a frontmatter property value | [`read_property`](./read_property.md) |
| The full heading structure / outline of a file | [`outline`](./outline.md) |
| Edit (not just read) a section's body | [`patch_heading`](./patch_heading.md) |

## Input schema

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
| `target_mode` | `"specific" \| "active"` | YES | never | Discriminator. |
| `vault` | string (length ≥ 1) | in specific mode | in active mode | Vault display name. Unregistered names surface as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` |
| `file` | string | specific mode (XOR with `path`) | active mode; or with `path` in specific mode | Wikilink form (no extension, no folder). |
| `path` | string | specific mode (XOR with `file`) | active mode; or with `file` in specific mode | Vault-relative path including `.md`. |
| `heading` | string (length ≥ 1) | YES | never | `::`-separated heading path. Validator requires ≥2 non-empty segments. Heading existence is checked at execution. |

`additionalProperties: false`. Unknown top-level keys are rejected.

### Heading-path validator

The `heading` string is split on the literal `::` separator; the validator rejects strings that produce fewer than 2 segments OR any empty segment (leading `::`, trailing `::`, or consecutive `::`). Heading existence is NOT pre-validated — semantic resolution happens at execution time and surfaces as a structured error.

The following heading shapes are **out-of-reach** for `read_heading`:

- **Single-segment H1-only reads** (`heading: "Foo"` with no `::`): the validator rejects them. Fallback: [`read`](./read.md) plus client-side parse for the H1's body.
- **Headings whose text contains `::` literally** (e.g. an H2 titled `Best Practices :: Naming` where the `::` is part of the heading text): the segment splitter cannot disambiguate the literal `::` from the path separator. Fallback: [`read`](./read.md) plus client-side parse.
- **Setext-style headings** (text underlined with `===` for H1 or `---` for H2): Setext underlines are treated as content, not heading boundaries. Fallback: [`read`](./read.md) plus client-side parse.

## Output

```json
{ "content": "\nUse kebab-case.\n" }
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | The body bytes of the matched heading. The body always begins with a leading `\n` byte (the line terminator after the heading line itself); trim client-side if you need the body to start with prose. Line endings (CRLF or LF), fenced code blocks, table pipes, list indentation, and inline markdown are preserved byte-for-byte. |

A heading whose body is empty (next heading marker appears on the very next line, with no intervening prose) returns `{ "content": "" }` — NOT an error. This is the structural empty-body case.

## Behavioural notes

### Boundary rule

The body terminates at the **first subsequent heading marker of any depth** — child, sibling, or shallower — or at EOF. Child-heading subtrees are excluded from the parent's body.

### ATX-only

Only ATX-style headings (`# Heading` through `###### Heading` with the required space after the `#`-run) are recognised as path segments AND as body terminators. Setext-style underlines (`====` for H1, `----` for H2) are content, not boundaries.

### Segment matching

Minimal-normalisation, **case-sensitive byte compare**. Closing-ATX forms (e.g. `## My Heading ##`) and surrounding whitespace are stripped before matching. Inline markdown (`**bold**`, `[link](url)`) and Obsidian anchor markers (`^anchor-id`) survive in the heading text and MUST be supplied **verbatim** by the caller. Mis-cased segments do NOT match.

### Duplicate heading paths

When two or more headings in the same file share the textually-identical full path (e.g. two `## Naming` sections under the same `# Best Practices` parent), the **first-document-order** match is returned.

### CRLF / LF line endings

Returned `content` carries the file's on-disk line endings byte-faithfully. A CRLF-encoded file yields `\r\n` byte pairs; an LF-encoded file yields `\n`. The wrapper does NOT normalise.

### Body byte-level preservation

Returned `content` is the raw bytes between heading positions, including fenced code blocks, table pipes, list indentation, inline markdown, and any literal Setext-underline text. No re-formatting is applied.

### Practical 10 MiB body ceiling

Heading bodies exceeding ~10 MiB (after JSON encoding; ~7 MiB raw content) trigger the output cap and surface as `CLI_NON_ZERO_EXIT`. Fall-back for very-large-body cases: [`read`](./read.md) the whole file and parse client-side.

### Multi-vault basename ambiguity

Multi-vault setups suffer from basename ambiguity — two vaults sharing the same display name are indistinguishable by the `vault=` argument. **Recommendation**: open the target vault in Obsidian before invoking `read_heading`.

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed schema validation: missing or empty `heading`, single-segment heading (no `::`), heading with empty segments (leading/trailing/consecutive `::`), missing `vault` in specific mode, both `file` and `path` provided in specific mode, `vault`/`file`/`path` provided in active mode, unknown top-level key. | Retry with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (eval syntax error, dispatch timeout, dispatch kill on signal, output-cap kill — pathologically large body slice). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. For oversized bodies, fall back to [`read`](./read.md). |
| `CLI_REPORTED_ERROR` (`details.message: "Vault not found."`) | Unknown vault. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"` or `"envelope-parse"`) | Eval response was unparseable or violated the envelope schema — upstream contract divergence. | Investigate as a regression. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | The named file does not exist. | Verify the path / wikilink; check for typos. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "HEADING_NOT_FOUND"`) | The named heading does not exist in the file. | Use [`outline`](./outline.md) to list the file's actual headings, then retry with a valid heading path. |
| `ERR_NO_ACTIVE_FILE` | Active mode invoked while no note is focused. | Switch to specific mode with an explicit `vault` + `file`/`path`, OR ask the user to open a note in Obsidian. |

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

Returns `{ "content": "\nUse kebab-case.\n" }` for the body of the `## Naming` section under `# Best Practices`.

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

Resolves `best-practices` via the metadata cache (wikilink form, no extension), then slices the body of the `### Casing` section under `## Naming` under `# Best Practices`. Returns `{ "content": "\nUse lowercase letters and dashes.\n" }`.

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

Resolves the focused note and slices the body of `## Section A` under `# Top`. Returns `{ "content": "\nHello.\n" }`. If no note is focused, raises `ERR_NO_ACTIVE_FILE`.

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

Rejected at the schema boundary before any CLI dispatch. Returns `VALIDATION_ERROR` with field path `["heading"]` and a message about `at least two ::-separated segments`. Fallback for an H1-only read: full-file [`read`](./read.md) plus client-side parse.

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

Returns `CLI_REPORTED_ERROR` with `details.stage: "envelope-error"` and `details.code: "HEADING_NOT_FOUND"`. The message field carries the unmatched segment path. Use [`outline`](./outline.md) to list the file's actual headings, then retry.
