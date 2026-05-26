# `append_note`

## Overview

`append_note` writes the caller's `content` payload at the end of an existing markdown note in a single MCP call. It is a typed write tool in the `write_note` / `patch_heading` / `patch_block` lineage (ADR-009 direct-filesystem-write substrate): the wrapper performs a read-modify-write through Node `fs` after using a small bug-safe `eval` for active-mode focused-file resolution. User content never crosses the CLI argv pipe at any size — the upstream argv-IPC defect that crashes Obsidian above ~4 KB on Windows is bypassed.

The tool eliminates the read-then-rewrite cycle that would otherwise force callers to ship the whole note through the full-replace write surface every time they want to add a journal line, a list item, or a log entry.

## When to use this tool

| You want to | Reach for |
|---|---|
| Add one or more lines at the **end** of an existing note | `append_note` |
| Create a new note (or wholesale-replace one) | [`write_note`](./write_note.md) |
| Replace the body under a named heading | [`patch_heading`](./patch_heading.md) |
| Replace the body tied to a `^block-id` marker | [`patch_block`](./patch_block.md) |
| Find/replace text patterns across many regions | [`find_and_replace`](./find_and_replace.md) |
| Edit a value in YAML frontmatter | [`set_property`](./set_property.md) |
| Prepend at the start of a note, or insert mid-file | Out of scope — a future `prepend` surface will own start-of-file; mid-file insertion is covered by `patch_heading` / `patch_block`. |

## Input schema

The schema is strict: `additionalProperties: false`. Cross-reference: [`specs/044-append-note/contracts/input.schema.json`](../../specs/044-append-note/contracts/input.schema.json).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "path": "<vault-relative path>",
  "content": "<bytes to append>",
  "inline": false
}
```

Or by wikilink-form bare name:

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "file": "<bare note name, no [[…]] brackets>",
  "content": "<bytes to append>"
}
```

### Active mode

```json
{
  "target_mode": "active",
  "content": "<bytes to append>"
}
```

The wrapper resolves the focused note via a small `obsidian eval`. **NO opt-in flag is required** — this is the deliberate cohort exception to `write_note`'s mandatory `overwrite: true` in active mode, justified by the additive-not-destructive safety profile of append (wrong-target = recoverable additive noise, not total content destruction). See the *Cross-invocation contract* and *Detection-capability caveats* sections.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES | Discriminator per ADR-003. |
| `vault` | string ≥ 1 char | iff specific | Resolved via the lazy vault registry. Unknown vault → `VAULT_NOT_FOUND`. |
| `file` | string ≥ 1 char (structurally safe; no `[[` / `]]`) | XOR with `path`, iff specific | Wikilink-form bare name. Pre-flight `obsidian file` TSV resolver canonicalises the name to a vault-relative path. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file`, iff specific | Vault-relative path. Brackets are NOT a special case here (legal in note names). |
| `content` | string, ≥ 1 char | YES | Non-empty per FR-013. No max-length cap (substrate-bounded). Preserved BYTE-FOR-BYTE VERBATIM (no trim, no normalisation, no auto-appended trailing newline). |
| `inline` | boolean | NO (default `false`) | When `true`, suppresses the wrapper-inserted separator (FR-007). |

## Default-separator behaviour

The wrapper inspects the file's last byte to decide whether to insert a separator before `content`. The rule is settled at Clarifications 2026-05-25 and recorded as FR-006 / FR-006a / FR-008 / FR-009:

| File ends with | Default `inline: false` behaviour | `inline: true` behaviour |
|---|---|---|
| Non-newline (e.g. `…Partial`) | Wrapper inserts a separator matching the file's existing line-ending convention (LF or CRLF) before `content` (FR-006). | Wrapper inserts NOTHING — content fuses directly onto the trailing line. |
| `\n` (LF-trailing) | The existing `\n` IS the separator (FR-006a) — wrapper inserts NOTHING. | Same — `content` lands immediately after the existing `\n`. |
| `\r\n` (CRLF-trailing) | The existing `\r\n` IS the separator (FR-006a + FR-008). | Same. |
| 0 bytes (empty file) | No leading separator (FR-009). | Same. |

The "existing trailing line break IS the separator" rule is load-bearing for repeated appends: both the line-builder pattern (`content` without trailing newline) and the paragraph-builder pattern (`content` with trailing newline) produce clean byte-stable concatenation under repeated default-mode appends.

Worked examples (drawn from the [quickstart](../../specs/044-append-note/quickstart.md)):

- `existing = "abc"`, `content = "def"`, default → `"abc\ndef"` (separator inserted).
- `existing = "abc\n"`, `content = "def"`, default → `"abc\ndef"` (existing `\n` IS the separator; no double newline).
- `existing = "abc\r\n"`, `content = "def"`, default → `"abc\r\ndef"` (CRLF preserved).
- `existing = ""`, `content = "def"`, default → `"def"`.

## Inline opt-in

`inline: true` fuses `content` directly onto the file's existing trailing byte with NO wrapper-inserted separator (FR-007). Use case: finishing a partial trailing line, or building up a composite line across multiple calls.

Example: `existing = "Working on something — Partial"`, `content = "Tail and now finished."`, `inline: true` → `"Working on something — PartialTail and now finished."`.

## Locator shapes

Two locator shapes in specific mode:

- **`path`** — vault-relative file path (e.g. `"Sandbox/journal-2026-05-25.md"`). Fed verbatim into Layer 2 canonical-path safety.
- **`file`** — bare wikilink-form note name (e.g. `"tasks"`, NOT `"[[tasks]]"`). The wrapper performs a pre-flight `obsidian file file=<name>` TSV resolver call (byte-stable with `set_property`'s pattern) to canonicalise the name to a vault-relative path; the response's `path` field carries that canonical path per FR-003.

Wikilink-form brackets are rejected at the schema layer per FR-001a: `[[…]]` pairs trigger a `VALIDATION_ERROR` with the message *"wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)"*. Single brackets (e.g. `[draft]`) are legal in note names and not rejected.

Active mode (`target_mode: "active"`) supplies neither `file` nor `path`; the wrapper resolves the currently-focused note via eval. NO opt-in flag (FR-004a). **Naming-convention footnote**: the tool name `append_note` follows the cohort's descriptive-name convention for fs-direct write tools (parity with `write_note`, `patch_heading`, `patch_block`); per FR-027 this is internal cohort discipline, not a published-contract pipeline guarantee. Callers cannot infer fs-direct vs CLI-wrap from the tool name alone without project-internal context.

## Output envelope

```typescript
interface AppendNoteOutput {
  path: string;            // Canonical vault-relative path of the written note
  vault: string;           // Vault display name (specific mode echo, or resolved reverse-lookup in active mode)
  bytes_written: number;   // Delta: post-edit file size minus pre-edit file size
  inline: boolean;         // Echo of the inline mode that the wrapper actually applied
}
```

- `path` is ALWAYS canonical: a caller who supplied `file: "tasks"` receives `path: "tasks.md"` (whatever the resolver yields).
- `bytes_written` is the delta — `content.length` exactly when FR-006a fires (existing newline IS the separator) or when inline mode bypasses the separator; `content.length + sizeof(separator)` (1 byte for LF, 2 for CRLF) when FR-006 fires.
- `inline` is `false` for default calls (input `inline: false` or omitted), `true` for input `inline: true`.

## Error states

Full enumeration cross-referenced to [`specs/044-append-note/contracts/errors.md`](../../specs/044-append-note/contracts/errors.md). Zero new top-level codes introduced; one new `details.code` value (`CONTENT_EMPTY` under `VALIDATION_ERROR`).

| Top-level `code` | `details.code` | Trigger |
|---|---|---|
| `VALIDATION_ERROR` | `CONTENT_EMPTY` (new, single state) | Empty content (FR-013). |
| `VALIDATION_ERROR` | n/a (Zod-issue-path channel) | Bracket-rejection (FR-001a), locator-mutex (FR-014), unknown-extra-field (FR-015), structural-path-safety, inline-type-mismatch. |
| `CLI_REPORTED_ERROR` | `NOTE_NOT_FOUND` (reused) | `fs.readFile` ENOENT — the target note does not exist. No file created (FR-012 / FR-016 / FR-025). |
| `CLI_REPORTED_ERROR` | `EXTERNAL_EDITOR_CONFLICT` (reused) | Windows sharing-violation (`EBUSY` / `EPERM` / `EACCES`) on `fs.rename` or `fs.writeFile`. File on disk is unchanged. `details.reason: "file-locked"`; `"unsaved-changes"` is reserved per BI-040 R6 for a future detection mechanism. |
| `PATH_ESCAPES_VAULT` | n/a | Layer 2 canonical-path check failed (ADR-009). |
| `FS_WRITE_FAILED` | n/a | Substrate errno other than the editor-conflict / ENOENT cohort (`ENOSPC`, `EROFS`, `EISDIR`, etc.). |
| `VAULT_NOT_FOUND` | n/a | Vault registry rejection. |
| `ERR_NO_ACTIVE_FILE` | n/a | Active mode but no note focused (FR-004). |

## Size ceiling

Per research.md R3 and FR-017: **no explicit wrapper-imposed cap**. Content size is bounded by available memory and the filesystem's max-file-size limit; for realistic notes (≤ 100 MB), no caller-visible ceiling applies. The fs-direct pipeline (R1) removes the BI-0038 argv-defect motivation for an aggressive cap.

**SC-007 traceability**: the docs state "substrate-bounded; no wrapper-imposed cap"; the wrapper enforces no cap; therefore docs match enforcement.

**FR-018 deferral**: the spec's oversized-content fail-loud path is explicitly deferred to a future BI. If a future BI introduces an explicit `z.string().max(N)` schema refinement, the contract surfaces as `VALIDATION_ERROR + details.code: "CONTENT_TOO_LARGE"` per the cohort's existing validation-error vocabulary.

## Detection-capability caveats (FR-022 platform variance)

`EXTERNAL_EDITOR_CONFLICT` detection is platform-divergent and inherits BI-040's detection-capability statement byte-stably:

- **Windows**: the substrate signals editor-conflict via `fs.rename` `EBUSY` / `EPERM` / `EACCES` when an editor holds the file with non-shared-delete access.
- **Linux / macOS**: the substrate has no analogous signal for in-memory-only dirty state, so the append lands on disk and the external editor sees a refreshed file on next focus.

Callers automating against multi-platform deployments must plan around the divergence.

## Cross-invocation contract

`append_note` publishes a **last-write-wins** contract for cross-invocation races per FR-026. Two concurrent `append_note` calls against the same note result in last-write-wins per the substrate's atomic rename. Callers needing stronger guarantees coordinate externally. No `APPEND_RACE` discriminator is published (cohort parity with `write_note`, `patch_block`; deliberate divergence from `patch_heading`'s `HEADING_RACE`).

## Scope split

- Auto-create a new note → [`write_note`](./write_note.md) (FR-012 + FR-025: `append_note` does NOT auto-create).
- Write under a named heading → [`patch_heading`](./patch_heading.md).
- Write tied to a `^block-id` marker → [`patch_block`](./patch_block.md).
- Prepend at the start of a note → out of scope; a future `prepend` surface will own this.

## Worked-example quickstart snippets

See [`specs/044-append-note/quickstart.md`](../../specs/044-append-note/quickstart.md) for the complete 11-example walkthrough covering each file-tail shape × inline state, each typed error, and the repeat-append byte-stability scenario.
