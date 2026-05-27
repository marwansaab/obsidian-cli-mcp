# `prepend`

## Overview

`prepend` writes the caller's `content` payload at the LOGICAL top of an existing markdown note in a single MCP call. It is the symmetric sibling of [`append_note`](./append_note.md): where `append_note` lands bytes at the END of the file, `prepend` lands them at the START — but with frontmatter-aware placement (FR-005a — the defining contract): when the target note has a YAML frontmatter block, the prepended content lands IMMEDIATELY AFTER the closing `---` and the frontmatter is preserved byte-for-byte; when no frontmatter is present, the content lands at byte zero.

The tool eliminates the read-then-rewrite cycle that would otherwise force callers to ship the whole note through the full-replace write surface every time they want to add a TL;DR line, a status block, or a header pre-amble — and it eliminates the metadata-corruption risk of a naive byte-zero prepend that would tear the YAML frontmatter apart.

Pipeline pick: BI-045 is the FIRST cohort tool to choose CLI-wrap for a content-carrying write tool, wrapping the upstream `obsidian prepend` subcommand. Frontmatter detection is delegated to upstream's well-tested YAML parser per FR-005b (no wrapper-side parser). Rationale + cohort-divergence audit trail in [research.md §R1](../../specs/045-prepend-note/research.md).

## When to use this tool

| You want to | Reach for |
|---|---|
| Add one or more lines at the **start** of an existing note (after any frontmatter) | `prepend` |
| Add one or more lines at the **end** of an existing note | [`append_note`](./append_note.md) |
| Create a new note (or wholesale-replace one) | [`write_note`](./write_note.md) |
| Replace the body under a named heading | [`patch_heading`](./patch_heading.md) |
| Replace the body tied to a `^block-id` marker | [`patch_block`](./patch_block.md) |
| Find/replace text patterns across many regions | [`find_and_replace`](./find_and_replace.md) |
| Edit a value in YAML frontmatter | [`set_property`](./set_property.md) |
| Insert content BEFORE the frontmatter (rare) | Out of scope — `prepend` lands AFTER the frontmatter; use `write_note` with a manually-constructed full-document body for the rare case. |

## Input schema

The schema is strict: `additionalProperties: false`. Cross-reference: [`specs/045-prepend-note/contracts/input.schema.json`](../../specs/045-prepend-note/contracts/input.schema.json).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "path": "<vault-relative path>",
  "content": "<bytes to prepend>",
  "inline": false
}
```

Or by wikilink-form bare name:

```json
{
  "target_mode": "specific",
  "vault": "<vault display name>",
  "file": "<bare note name, no [[…]] brackets>",
  "content": "<bytes to prepend>"
}
```

### Active mode

```json
{
  "target_mode": "active",
  "content": "<bytes to prepend>"
}
```

The wrapper resolves the focused note via a small `obsidian eval`. **NO opt-in flag is required** — this is the deliberate cohort exception to `write_note`'s mandatory `overwrite: true` in active mode, inherited from BI-044's additive-not-destructive safety profile (wrong-target = recoverable additive noise at the TOP of an unintended note, not destruction).

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES | Discriminator per ADR-003. |
| `vault` | string ≥ 1 char | iff specific | Resolved via the lazy vault registry. Unknown vault → `VAULT_NOT_FOUND`. |
| `file` | string ≥ 1 char (structurally safe; no `[[` / `]]`) | XOR with `path`, iff specific | Wikilink-form bare name. Pre-flight `obsidian file` TSV resolver canonicalises the name to a vault-relative path. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file`, iff specific | Vault-relative path. Brackets are NOT a special case here (legal in note names). |
| `content` | string, ≥ 1 char and ≤ 3072 UTF-16 code units | YES | Non-empty per FR-013; cap per FR-008a (lowered from 24576 to 3072 in BI-047 — driven by an upstream Obsidian.com argv-IPC defect that hangs the host process around 4 KB of content on Windows; see *Size ceiling* below). Preserved BYTE-FOR-BYTE VERBATIM by upstream (FR-010a — no trim, no normalisation). |
| `inline` | boolean | NO (default `false`) | When `true`, suppresses the wrapper-or-upstream-inserted separator (FR-007). |

## Frontmatter-aware insertion-point rule (FR-005a — DEFINING CONTRACT)

When the target note has a YAML frontmatter block (opening `---` at byte zero, body, closing `---`), the prepended content lands **IMMEDIATELY AFTER** the closing `---` per FR-005a, and the frontmatter block is preserved BYTE-FOR-BYTE per FR-011. When the target has no frontmatter block, the prepended content lands at byte zero. Detection is delegated to the upstream Obsidian CLI per FR-005b — no wrapper-side YAML parser is introduced.

Malformed-frontmatter behaviour (missing closing `---`, leading `---` used as a horizontal rule rather than a frontmatter delimiter) is inherited verbatim from upstream — the wrapper publishes no separate typed error for malformed-frontmatter cases. Captured at T0 against the live vault per [research.md §R2](../../specs/045-prepend-note/research.md) probe T0-P12.

Worked example: a journal entry with

```markdown
---
date: 2026-05-26
tags: [journal]
---

# 2026-05-26
Body
```

+ `content: "## TL;DR\n\nMade significant progress."` produces

```markdown
---
date: 2026-05-26
tags: [journal]
---
## TL;DR

Made significant progress.

# 2026-05-26
Body
```

The frontmatter is byte-stable; a separator is inserted between the prepended content's last byte (`.`) and the existing leading body line (`# 2026-05-26`).

## Default-separator behaviour (FR-006 + FR-006a)

Per spec FR-006 / FR-006a (the prepend-direction symmetric of BI-044's existing-trailing-newline rule), the upstream's separator decision is:

| Content ends with | Default `inline: false` behaviour | `inline: true` behaviour |
|---|---|---|
| Non-newline (e.g. `…Lead`) | A separator matching the note's existing line-ending convention (LF or CRLF preserved) is inserted between the prepended content and the existing leading body line (FR-006). | NO separator inserted — content fuses directly onto the existing leading body line. |
| `\n` (LF-trailing) | The content's trailing `\n` IS the separator (FR-006a) — no additional separator inserted. | Same — content lands without an additional separator. |
| `\r\n` (CRLF-trailing) | The content's trailing `\r\n` IS the separator (FR-006a + FR-008). | Same. |
| (empty file or frontmatter-only-no-body) | No trailing separator (FR-009 symmetric). | Same. |

The "supplied content's trailing line break IS the separator" rule is load-bearing for the line-builder pattern (`content` without trailing newline) and the paragraph-builder pattern (`content` with trailing newline): both produce clean byte-stable concatenation under repeated default-mode prepends.

Worked examples (drawn from [quickstart.md](../../specs/045-prepend-note/quickstart.md)):

- `existing = "abc"`, `content = "def"`, default → `"def\nabc"` (separator inserted).
- `existing = "abc"`, `content = "def\n"`, default → `"def\nabc"` (content's `\n` IS the separator; no double newline).
- `existing = ""`, `content = "def"`, default → `"def"` (FR-009).
- `existing = "---\nkey: v\n---\nbody"`, `content = "Lead"`, default → `"---\nkey: v\n---\nLead\nbody"` (frontmatter preserved; FR-005a + FR-006).

## Inline opt-in (FR-007)

`inline: true` fuses `content` directly onto the existing leading body line with NO wrapper-or-upstream-inserted separator. The frontmatter-aware insertion-point rule (FR-005a) is **UNCHANGED** by the inline opt-in — the prepended content still lands after the closing `---` when frontmatter is present; only the separator between the prepended content and the existing leading body line is suppressed.

Use case: extending an existing leading sentence, prefixing a leading list-item marker, completing a partial prefix.

Example: `existing = "Existing-prefix continues here"`, `content = "NEW-"`, `inline: true` → `"NEW-Existing-prefix continues here"`. `bytes_written` exactly equals `content.length` (4 chars) — no separator overhead.

## Locator shapes

Two locator shapes in specific mode:

- **`path`** — vault-relative file path (e.g. `"Sandbox/journal-2026-05-26.md"`). Fed verbatim into Layer 2 canonical-path safety.
- **`file`** — bare wikilink-form note name (e.g. `"tasks"`, NOT `"[[tasks]]"`). The wrapper performs a pre-flight `obsidian file file=<name>` TSV resolver call (byte-stable with `append_note` + `set_property`'s pattern) to canonicalise the name to a vault-relative path; the response's `path` field carries that canonical path per FR-003.

Wikilink-form brackets are rejected at the schema layer per FR-001a: `[[…]]` pairs trigger a `VALIDATION_ERROR` with the message *"wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)"*. Single brackets (e.g. `[draft]`) are legal in note names and not rejected. Cohort parity with BI-044's `safeFileField` pattern (a future cohort cleanup may lift the helper to a shared location when a third consumer appears).

Active mode (`target_mode: "active"`) supplies neither `file` nor `path`; the wrapper resolves the currently-focused note via eval. NO opt-in flag (FR-004a).

## Naming-convention footnote (ADR-010 applies)

The tool name `prepend` **mirrors** the upstream `obsidian prepend` subcommand per ADR-010. The descriptive-name convention (`prepend_note`) would be wrong because the wrapper is CLI-wrap, not fs-direct. The asymmetry with the additive-write sibling `append_note` (which uses the descriptive convention because it is fs-direct) is **deliberate** and cohort-discipline-consistent:

- **Mirror-name** (e.g. `prepend`, `read`, `delete`, `set_property`) = CLI-wrappers around an upstream subcommand.
- **Descriptive-name** (e.g. `append_note`, `write_note`, `patch_heading`, `patch_block`) = fs-direct re-implementations.

Per FR-027, callers cannot infer the pipeline pick from the tool name alone without project-internal context; the observable contract (frontmatter-aware placement, default-separator behaviour, byte-for-byte content preservation, documented size ceiling, typed error states) is the published surface.

## Output envelope

```typescript
interface PrependOutput {
  path: string;            // Canonical vault-relative path of the prepended note
  vault: string;           // Vault display name (specific mode echo, or resolved reverse-lookup in active mode)
  bytes_written: number;   // Delta: post-edit file size minus pre-edit file size
  inline: boolean;         // Echo of the inline mode that the wrapper actually applied
}
```

- `path` is ALWAYS canonical: a caller who supplied `file: "tasks"` receives `path: "tasks.md"` (whatever the resolver yields).
- `bytes_written` is the delta — the wrapper stat's the file before and after the upstream prepend call. Exactly equals `content.length` when FR-006a fires (content's trailing newline IS the separator) or when inline mode suppresses the separator; equals `content.length + sizeof(separator)` (1 byte for LF, 2 for CRLF) when FR-006 fires.
- `inline` is `false` for default calls (input `inline: false` or omitted), `true` for input `inline: true`.

## Error states

Full enumeration cross-referenced to [`specs/045-prepend-note/contracts/errors.md`](../../specs/045-prepend-note/contracts/errors.md). Zero new top-level codes introduced; one new `details.code` value (`CONTENT_TOO_LARGE` under `VALIDATION_ERROR`, single state per ADR-015).

| Top-level `code` | `details.code` | Trigger |
|---|---|---|
| `VALIDATION_ERROR` | `CONTENT_EMPTY` (reused from BI-044) | Empty content (FR-013). |
| `VALIDATION_ERROR` | `CONTENT_TOO_LARGE` | Content > 3072 UTF-16 code units (FR-008a — lowered from 24576 in BI-047). |
| `VALIDATION_ERROR` | n/a (Zod-issue-path channel) | Bracket-rejection (FR-001a), locator-mutex (FR-014), unknown-extra-field (FR-015), structural-path-safety, inline-type-mismatch. |
| `CLI_REPORTED_ERROR` | `NOTE_NOT_FOUND` (reused) | Upstream's `prepend` (or the pre-flight `obsidian file` resolver) signalled the target does not exist. No file created (FR-012 / FR-016 / FR-025). |
| `CLI_REPORTED_ERROR` | `EXTERNAL_EDITOR_CONFLICT` (reused) | Upstream signalled the target is held open by an external editor. `details.reason: "file-locked"`; `"unsaved-changes"` is reserved per BI-040 R6 for a future detection mechanism. File on disk unchanged. |
| `CLI_REPORTED_ERROR` | n/a (generic) | Unrecognised upstream failure (no matching pattern). Carries `details.stage: "prepend-cli"` + `details.stdout` + `details.stderr` for operator diagnosis. |
| `PATH_ESCAPES_VAULT` | n/a | Layer 2 canonical-path check failed. |
| `VAULT_NOT_FOUND` | n/a | Vault registry rejection. |
| `ERR_NO_ACTIVE_FILE` | n/a | Active mode but no note focused (FR-004). |

**FS_WRITE_FAILED with `details.reason: "post-stat-byte-delta-zero"`** (added in BI-047): the wrapper stats the target file before and after the upstream `prepend` call. When upstream returns exit 0 but the on-disk byte count is unchanged (the silent-no-op failure mode the upstream's argv-IPC defect can produce), the wrapper raises `FS_WRITE_FAILED` with `details.reason: "post-stat-byte-delta-zero"`, `details.preCallSize`, `details.postCallSize`, and a descriptive message instead of emitting a misleading `bytes_written: 0` success envelope. Recovery: usually transient lock contention or upstream IPC degradation; retry once after confirming the file is not held open by an external editor. If the failure repeats at the same payload size, you have likely hit the cap-boundary IPC defect — call `write_note` instead.

Other filesystem-level upstream failures (disk full, read-only filesystem, permission denied) still surface as generic `CLI_REPORTED_ERROR` with `details.stage: "prepend-cli"` and the operator inspects `details.stdout` / `details.stderr` for diagnosis. Future cohort work may consolidate these under additional `FS_WRITE_FAILED` sub-discriminators.

## Size ceiling (FR-008a — superseded FR-017 / FR-018)

**Explicit cap of 3072 UTF-16 code units** (lowered from 24576 in BI-047 per the empirical T0-R1 bisect probe). The cap is NOT driven by the Windows `CreateProcess` command-line maximum (which sits around ~32 767 chars — six orders larger than this cap). The cap is bounded by an **upstream Obsidian.com argv-IPC defect** that hangs the host process around 4 KB of content on Windows. Bisect data: 10/10 trials succeed at 3584 chars; 0/10 succeed at 4096 chars (calls SIGTERM after 12 s, then Obsidian's CLI-receiving state degrades until the GUI is restarted). The 3072 cap leaves ~1 KB of safety margin for the `vault=` / `path=` argv-overhead a real prepend call adds on top of the content payload.

The defect is upstream-side (matches [forum thread 113867](https://forum.obsidian.md/t/cli-content-parameter-corrupts-multi-byte-utf-8-at-8-kb-chunk-boundary-silent/113867), no Obsidian-team response). **Chunking the content does not help** — the defect re-fires on each call regardless of cumulative size. Callers needing payloads above the cap MUST use the full-replace [`write_note`](./write_note.md) surface, which is fs-direct and cap-free.

The cap is enforced at the schema layer via `z.string().max(3072)`; oversized payloads surface as `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` BEFORE any spawn occurs (FR-023). The cap MAY be ratcheted back up in a future BI if upstream Obsidian repairs the argv-IPC defect.

**SC-008 traceability**: the docs state the 3072 number; the schema enforces the same number via the shared `MAX_CONTENT_LENGTH` constant in `src/tools/prepend/schema.ts`; the tool description string interpolates the same constant — therefore docs match enforcement, SC-008 satisfied.

## Detection-capability caveats (FR-022 platform variance)

`EXTERNAL_EDITOR_CONFLICT` detection is platform-divergent and inherits BI-040's / BI-044's detection-capability statement byte-stably (the divergence is upstream-side under BI-045's CLI-wrap pipeline rather than wrapper-side under BI-044's fs-direct pipeline, but the observable contract is identical):

- **Windows**: the upstream signals editor-conflict when an external editor holds the target file with non-shared-delete access (typically surfaced as `EBUSY` / `EPERM` / `EACCES` through upstream's process layer).
- **Linux / macOS**: the upstream has no analogous signal for in-memory-only dirty state, so the prepend lands on disk and the external editor sees a refreshed file on next focus.

Callers automating against multi-platform deployments must plan around the divergence.

## Single-invocation atomicity (FR-021)

A single `prepend` invocation MUST NOT leave the note on disk in a half-written or otherwise inconsistent state at any observable instant within the wrapper's control. Under BI-045's CLI-wrap pipeline, atomicity is **inherited from the upstream** `obsidian prepend` subcommand's internal write pipeline — the wrapper does not introduce additional atomicity machinery. If the upstream uses an atomic temp-then-rename pattern (cohort-empirical for the Obsidian Integrated CLI's write subcommands), single-invocation atomicity holds; if upstream uses a non-atomic in-place rewrite, the wrapper inherits whatever observable interleaving the OS exposes.

Interrupted invocations (power loss, `kill -9` against the upstream process) leave on-disk state to the operating system. The wrapper makes no claim beyond what upstream provides; callers needing transactional guarantees across invocation boundaries combine `prepend` with the cohort's external coordination patterns (see *Cross-invocation contract* below).

## Cross-invocation contract

`prepend` publishes a **last-write-wins** contract for cross-invocation races per FR-026. Two concurrent `prepend` calls against the same note resolve last-write-wins per the upstream's atomicity (inherited per the previous section). Callers needing stronger guarantees coordinate externally. No `PREPEND_RACE` discriminator is published (cohort parity with `write_note`, `append_note`, `patch_block`; deliberate divergence from `patch_heading`'s `HEADING_RACE`).

## Scope split

- Auto-create a new note → [`write_note`](./write_note.md) (FR-012 + FR-025: `prepend` does NOT auto-create).
- Insert content BEFORE the frontmatter (rare) → out of scope (FR-024). Use `write_note` with a manually-constructed full-document body.
- Symmetric additive write at the end of the file → [`append_note`](./append_note.md).
- Write under a named heading → [`patch_heading`](./patch_heading.md).
- Write tied to a `^block-id` marker → [`patch_block`](./patch_block.md).

## Pipeline footnote (FR-027)

The spec's pipeline-agnostic stance preserves the behaviour contract regardless of implementation. The current implementation is CLI-wrap of `obsidian prepend`; future BIs may change the pipeline (e.g., to fs-direct with a wrapper-side parser, contingent on a spec amendment to FR-005b). Callers cannot rely on the pipeline choice; the contract is the observable behaviour + the documented size ceiling + the typed error states enumerated above.

## Worked-example quickstart snippets

See [`specs/045-prepend-note/quickstart.md`](../../specs/045-prepend-note/quickstart.md) for the complete 16-example walkthrough covering each file-shape × inline state (frontmatter + body, no frontmatter, frontmatter + empty body, 0-byte file, leading-partial-line), every typed error (CONTENT_EMPTY, CONTENT_TOO_LARGE, bracket-rejection, locator-mutex, NOTE_NOT_FOUND, EXTERNAL_EDITOR_CONFLICT), and the active-mode + wikilink-form-locator coverage.
