# `read_heading`

## Overview

Read the body of a single named heading from a vault note. Returns `{ content: string }` — the body bytes between the matched heading and the next heading marker of any depth (or EOF). Saves the agent from a full-file `read` plus client-side Markdown parse (typically 5–50k tokens for long documents) — `read_heading` returns just the section's body (typically 100–500 tokens).

**Where the body starts:** right after the heading line, with that line's own line ending removed. Everything after it, including blank lines, is returned exactly as written, so use the body as returned: removing a leading character can delete real content or leave a stray `\r`. [Start of body](#start-of-body) shows the body for each layout.

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
| `heading` | string (length ≥ 1) | YES | never | `::`-separated heading path that starts at the note's level-1 heading, one segment per level (see [Heading-path rule](#heading-path-rule)). The target is level 2 or deeper, so the path has at least two non-empty segments. Heading existence is checked at execution. |

`additionalProperties: false`. Unknown top-level keys are rejected.

### Heading-path rule

The path starts at the note's level-1 heading and names one heading per level down to the target: each later segment is the heading exactly one level below the previous one. A level-3 target therefore needs three segments:

```
"Project::Tasks::Today"   →  # Project / ## Tasks / ### Today
"Project::Tasks"          →  # Project / ## Tasks
```

Leaving out the level-1 heading (`"Tasks::Today"`) fails with `HEADING_NOT_FOUND`, even though both headings exist in the note.

### Heading-path validator

The `heading` string is split on the literal `::` separator; the validator rejects strings that produce fewer than 2 segments OR any empty segment (leading `::`, trailing `::`, or consecutive `::`). The two-segment minimum means the target is level 2 or deeper, and the path names the level-1 heading first. A one-segment path is rejected with ``heading must contain at least two `::`-separated segments (e.g. "H1::H2")``. That message refers to addressing the level-1 heading on its own (a one-segment path); every path still starts at the level-1 heading. Heading existence is NOT pre-validated — semantic resolution happens at execution time and surfaces as a structured error.

### Unreachable sections

No `heading` path can reach the following sections. For each, use [`read`](./read.md) for the whole note and parse it client-side:

- **A level-1 section by itself** (`heading: "Foo"` with no `::`): the validator rejects one-segment paths. Fallback: [`read`](./read.md).
- **Any section in a note with no level-1 heading** (e.g. a note whose top heading is `## Section`): every path starts at the level-1 heading, so there is nothing to start from. Fallback: [`read`](./read.md).
- **Any section below a skipped level** (e.g. `### Orphan` directly under `# Other`, with no `##` between them): each segment must be exactly one level below the previous, so no path names `### Orphan` or anything under it. Fallback: [`read`](./read.md).
- **Headings whose text contains `::` literally** (e.g. an H2 titled `Best Practices :: Naming` where the `::` is part of the heading text): the segment splitter cannot disambiguate the literal `::` from the path separator. Fallback: [`read`](./read.md).
- **Setext-style headings** (text underlined with `===` for H1 or `---` for H2): Setext underlines are treated as content, not heading boundaries. Fallback: [`read`](./read.md).

A skipped level only blocks the sections at and below the skip on that branch: a skip below the target (for example a `####` directly under the `##` you want), or a skip in another branch of the note, does not block the target. When a note has several level-1 headings, a path may start at any of them.

## Output

```json
{ "content": "Use kebab-case.\n" }
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | The body of the matched heading, up to the next heading of any depth or the end of the note; see [Start of body](#start-of-body) for where it begins. Line endings (CRLF or LF), blank lines, fenced code blocks, table pipes, list indentation, and inline markdown are preserved byte-for-byte. |

A heading with an empty body returns `{ "content": "" }` — NOT an error. This is the structural empty-body case. A heading followed only by a blank line is not empty; [Start of body](#start-of-body) lists both cases.

## Behavioural notes

### Boundary rule

The body terminates at the **first subsequent heading marker of any depth** — child, sibling, or shallower — or at EOF. Child-heading subtrees are excluded from the parent's body.

### ATX-only

Only ATX-style headings (`# Heading` through `###### Heading` with the required space after the `#`-run) are recognised as path segments AND as body terminators. Setext-style underlines (`====` for H1, `----` for H2) are content, not boundaries.

### Segment matching

Minimal-normalisation, **case-sensitive byte compare**. Closing-ATX forms (e.g. `## My Heading ##`) and surrounding whitespace are stripped before matching. Inline markdown (`**bold**`, `[link](url)`) and Obsidian anchor markers (`^anchor-id`) survive in the heading text and MUST be supplied **verbatim** by the caller. Mis-cased segments do NOT match.

### Duplicate heading paths

When two or more headings in the same file share the textually-identical full path (e.g. two `## Naming` sections under the same `# Best Practices` parent), the **first-document-order** match is returned.

### Start of body

The heading line's own line ending, in either style, is never part of the body. A body starts with a line break only when the note has a blank line directly under the heading; text directly under the heading starts the body. By layout:

| Lines under `## Section` | Returned `content` |
|---|---|
| `Body text.` directly under the heading | `"Body text.\n"` |
| a blank line, then `Body text.` (LF note) | `"\nBody text.\n"` |
| a blank line, then `Body text.` (CRLF note) | `"\r\nBody text.\r\n"` |
| only a blank line, then the next heading (LF note) | `"\n"` |
| only a blank line, then the next heading (CRLF note) | `"\r\n"` |
| the next heading directly under | `""` |
| nothing: the heading is the note's last line | `""` |

### CRLF / LF line endings

Returned `content` carries the file's on-disk line endings byte-faithfully. A CRLF-encoded file yields `\r\n` byte pairs; an LF-encoded file yields `\n`. The wrapper does NOT normalise.

### Body byte-level preservation

Returned `content` is the raw bytes between heading positions, including fenced code blocks, table pipes, list indentation, inline markdown, and any literal Setext-underline text. No re-formatting is applied.

### Practical 10 MiB body ceiling

Heading bodies exceeding ~10 MiB (after JSON encoding; ~7 MiB raw content) trigger the output cap and surface as `CLI_NON_ZERO_EXIT`. Fall-back for very-large-body cases: [`read`](./read.md) the whole file and parse client-side.

### Multi-vault basename ambiguity

Multi-vault setups can still suffer from basename ambiguity: two vaults sharing the **same display name** are indistinguishable by the `vault=` argument, so a call may resolve to the wrong same-named vault. This is a genuine name-collision limit, and **focusing a vault neither fixes it nor is required for routing** — a specific-mode `vault=` read routes into the named vault even when that vault is open but unfocused (verified live per-tool by the BI-0134 forcing gate — [t0-probe-findings.md](../../specs/062-verify-cross-vault-routing/contracts/t0-probe-findings.md)). To disambiguate, give the colliding vaults distinct display names.

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | Input failed schema validation: missing or empty `heading`, single-segment heading (no `::`), heading with empty segments (leading/trailing/consecutive `::`), missing `vault` in specific mode, both `file` and `path` provided in specific mode, `vault`/`file`/`path` provided in active mode, unknown top-level key. | Retry with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN`. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (eval syntax error, dispatch timeout, dispatch kill on signal, output-cap kill — pathologically large body slice). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. For oversized bodies, fall back to [`read`](./read.md). |
| `CLI_REPORTED_ERROR` (`details.message: "Vault not found."`) | Unknown vault. | Verify the vault name; ensure the vault is registered in Obsidian. |
| `CLI_REPORTED_ERROR` (`details.stage: "json-parse"` or `"envelope-parse"`) | Eval response was unparseable or violated the envelope schema — upstream contract divergence. `details.stdout` holds the raw eval output, whole when it is 1,000 characters or fewer and otherwise its first and last 500 characters around a `[… cut …]` line, and `details.stdoutLength` gives the raw output's full length. Lines that other Obsidian plugins print around the eval's answer are ignored, so they never cause this error on their own. | Investigate as a regression. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "FILE_NOT_FOUND"`) | The named file does not exist. | Verify the path / wikilink; check for typos. |
| `CLI_REPORTED_ERROR` (`details.stage: "envelope-error"`, `details.code: "HEADING_NOT_FOUND"`) | The named heading does not exist in the file. | Most often the path leaves out the level-1 heading or skips a level; check that first. Then use [`outline`](./outline.md) to list the file's headings and retry. |
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

For a note where `Use kebab-case.` sits directly under `## Naming` (under `# Best Practices`), returns `{ "content": "Use kebab-case.\n" }`.

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

Resolves `best-practices` via the metadata cache (wikilink form, no extension), then slices the body of the `### Casing` section under `## Naming` under `# Best Practices`. With `Use lowercase letters and dashes.` directly under `### Casing`, returns `{ "content": "Use lowercase letters and dashes.\n" }`.

The path runs from the level-1 heading (`# Best Practices`) to the level-3 target (`### Casing`), one segment per level.

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

Resolves the focused note and slices the body of `## Section A` under `# Top`. With `Hello.` directly under `## Section A`, returns `{ "content": "Hello.\n" }`. If no note is focused, raises `ERR_NO_ACTIVE_FILE`.

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

Rejected at the schema boundary before any CLI dispatch. Returns `VALIDATION_ERROR` with field path `["heading"]` and a message about `at least two ::-separated segments`. The message refers to addressing the level-1 heading on its own; every path still starts at the level-1 heading. Fallback for an H1-only read: full-file [`read`](./read.md) plus client-side parse.

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

Returns `CLI_REPORTED_ERROR` with `details.stage: "envelope-error"` and `details.code: "HEADING_NOT_FOUND"`. The message field carries the unmatched segment path. Most often the path leaves out the level-1 heading or skips a level; check that first. Then use [`outline`](./outline.md) to list the file's headings and retry.

### Example 6 — Level-1 segment left out (heading-not-found)

```json
{
  "name": "read_heading",
  "arguments": {
    "target_mode": "specific",
    "vault": "Demo",
    "file": "best-practices",
    "heading": "Naming::Casing"
  }
}
```

Against the Example 2 note, this returns `CLI_REPORTED_ERROR` with `details.code: "HEADING_NOT_FOUND"`, even though `## Naming` and `### Casing` both exist: the path must start at the level-1 heading. The corrected path is `"Best Practices::Naming::Casing"`.
