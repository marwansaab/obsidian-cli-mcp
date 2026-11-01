# ADR-051 — `prepend` caps content in UTF-8 bytes as a second limit, reported as a `details.reason` sub-state

- **Status:** Accepted
- **Date:** 2026-11-01
- **Source:** PR #106 (`specs/078-refuse-oversized-text/`, research F1 to F6,
  D1 to D3, clarification Q1, contract B1 to B16), commits `8c23650` and
  `00cccae`
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), whose rule gives the error its shape;
  [ADR-049](ADR-049-prepend-keeps-obsidians-write-and-removes-the-added-line-break.md)
  (`prepend` keeps Obsidian's write), the reason `prepend` still passes its
  content on Obsidian's command line and so needs a cap at all

Neither the spec nor the plan asked for this record. It is written because
the PR settled the unit `prepend`'s cap counts in and the shape of the new
refusal, and review then moved where the two limits' precedence is decided.
It is numbered as 1 + the highest ADR number used anywhere (ADR-046 is
reserved by spec 073's plan); the vault's Decision Log needs the matching
entry.

## Context

`prepend` capped `content` at 3072 UTF-16 code units (`MAX_CONTENT_LENGTH`,
zod `.max()`), chosen in BI-047 to leave about 1 KB below the Obsidian
command-line fault near 4 KB. Both bisects behind that number used plain
Latin text, where characters and UTF-8 bytes coincide (research F2). BI-0123
then recorded 1,500 × `中` — 1,500 characters, inside the cap, but 4,500
UTF-8 bytes — crashing Obsidian. The fault follows the UTF-8 size, so the
cap counted the wrong unit for any non-Latin text.

Agents already route `VALIDATION_ERROR` / `details.code: CONTENT_TOO_LARGE`
to `write_note`, and that error's payload (`contentLength`, `maxLength`, no
`reason`) was to stay byte-identical (spec 078 FR-005).

## Decision

1. **A second, separate limit.** `MAX_CONTENT_BYTES = 3072` sits beside
   `MAX_CONTENT_LENGTH` in `src/tools/prepend/schema.ts`, measured with
   `Buffer.byteLength(content, "utf8")` (research D1; clarification Q1,
   option A, which keeps the character cap's ~1 KB headroom, now in bytes).
   The character limit stays as it was.
2. **Checked in the schema.** A `superRefine` on `content` raises a `custom`
   issue carrying the final message and `params: { subReason: "bytes",
   contentBytes }`. It runs inside `registerTool`'s parse, before target
   resolution, the filesystem or Obsidian (Principle III).
3. **A `details.reason` sub-state, not a new code.** The prepend mapper
   returns `VALIDATION_ERROR` / `details.code: CONTENT_TOO_LARGE` /
   `details.reason: "bytes"` with `contentBytes` and `maxBytes` (research D2,
   chosen by the owner at plan time). The character-limit error is the
   origin sub-state and keeps no `reason`, as ADR-015 allows. The closed set
   is listed in `docs/tools/prepend.md`.
4. **The character limit wins, decided by the schema.** `.max()` carries
   `{ abort: true }`, so text over both limits never reaches the size check
   and yields only `too_big` (FR-005). The mapper checks the two issue kinds
   in one pass.

## Alternatives rejected

- **Check the size in `executePrepend`** (research D1). It runs after target
  resolution, so an oversized call on a missing note would report
  `NOTE_NOT_FOUND`, and it moves a boundary rule out of the boundary.
- **Make the one cap count bytes** (research D1). It would change the
  character-limit error's message and fields, which callers already match.
- **Derive `MAX_CONTENT_BYTES` from `MAX_CONTENT_LENGTH`** (research D1). The
  two measure different things and may move apart.
- **A new `details.code`** (ADR-015 option b; research D2). Declined by the
  owner: callers that map `CONTENT_TOO_LARGE` to `write_note` keep working
  only if the code stays.
- **Add `reason: "characters"` to the existing error** (research D2). It
  would change that error's `details`.
- **Order-independent mapper over both issues** (research D2 as first
  implemented, commit `8c23650`). Zod 4 reports both `too_big` and `custom`
  for text over both limits (research F3), so the first version scanned every
  issue for `too_big` before looking at any `custom` one, and measured the
  bytes a second time from the raw arguments. PR #106's code-quality review
  (commit `00cccae`, findings F1 and F2) argued the PR out of it: one zod
  flag makes the double issue impossible, and the measured issue carries the
  message and size. Probed on zod 4, `abort` adds nothing to the emitted JSON
  Schema, and the FR-018 fingerprint gate passed without a baseline rewrite.

## Consequences

- Non-Latin content over 3,072 bytes is refused before Obsidian is called:
  1,024 CJK characters or 768 emoji reach the limit, and a CRLF counts 2
  bytes. Some calls between 3,073 bytes and the fault that succeeded before
  are now refused; `write_note` is their route.
- The byte limit is not in the published JSON Schema, which cannot express
  it; `maxLength: 3072` still describes only the character limit. The
  `content` description and the tool description state both, from the
  constants, and `prepend`'s description and schema fingerprints moved in
  the baseline.
- `path` and `vault` share the command line and are not counted
  (spec 078 Assumptions).
- `create_base`, `set_property` and any other tool that passes text on
  Obsidian's command line keep the character-vs-byte gap; each is its own
  item (spec 078 plan Follow-ups).
