# Quickstart — Verifying `read_heading`

**Feature**: [015-read-heading](./spec.md)
**Date**: 2026-05-09

22 verification scenarios mapped 1:1 to SC-001..SC-022. S-1..S-19 are CI-runnable via the co-located vitest suite. S-20..S-22 are manual end-to-end steps run against MCP Inspector or Claude Desktop with the real Obsidian binary and the authorised test vault.

The numbering matches the success-criteria numbering in [spec.md § Success Criteria](./spec.md#success-criteria-mandatory) for traceability.

---

## CI scenarios (vitest, no real Obsidian binary)

### S-1 — 2-segment path returns matched section's body verbatim (SC-001)

Setup: handler test with stub `spawnFn` returning `=> {"ok":true,"content":"Use kebab-case.\n"}` for the eval probe.
Input: `{target_mode: "specific", vault: "Demo", path: "x.md", heading: "Best Practices::Naming"}`.
Assert: returned `{content: "Use kebab-case.\n"}`. Stub spawn called once.

### S-2 — 3+-segment nested path returns deeply-nested body (SC-002)

Setup: stub returns body bytes of nested heading.
Input: `{target_mode: "specific", vault: "Demo", path: "x.md", heading: "Best Practices::Naming::Casing"}`.
Assert: returned `{content: <nested body>}`. Argv contains base64 payload that decodes to `{segments: ["Best Practices", "Naming", "Casing"]}`.

### S-3 — Sibling-level body terminator (SC-003 part 1)

Setup: stub heading metadata where `headings[matchIdx+1]` is at the same level as the matched heading.
Assert: body slice excludes the sibling heading line. Returned body content is the prose between the matched heading and the sibling.

### S-4 — Higher-level body terminator (SC-003 part 2)

Setup: stub heading metadata where `headings[matchIdx+1]` is at a shallower level (e.g. matched H2, terminator is H1).
Assert: body slice excludes the higher heading line.

### S-5 — Child-level body terminator (SC-004)

Setup: stub heading metadata where `headings[matchIdx+1]` is at a deeper level (e.g. matched H2, terminator is H3 child).
Assert: body slice excludes the child heading line. The H3's prose is NOT in the returned body (US1 scenario 2).

### S-6 — Fenced code block opacity (SC-005)

Setup: stub heading metadata that does NOT include any heading whose `position.start.offset` falls inside a fenced region. Stub the file text to contain `## Example heading inside fence` between fence markers, but the metadata array reflects Obsidian's pre-parsed exclusion.
Assert: body slice from matched heading INCLUDES the fenced-block content (the fenced `## Example heading` is treated as content, not a body terminator).

### S-7 — Empty body (SC-006)

Setup: stub heading metadata where `headings[matchIdx+1].position.start.offset === headings[matchIdx].position.end.offset + 1` (only a single line terminator between the heading and the next).
Assert: returned body is the empty string `""` (after the leading-line-terminator strip).

### S-8 — Duplicate heading paths first-match (SC-007)

Setup: stub heading metadata containing two headings with the textually-identical full path, in document order.
Assert: handler returns the body of the FIRST occurrence. Locks FR-017's first-match convention.

### S-9 — CRLF round-trip (SC-008 part 1)

Setup: stub `app.vault.adapter.read` (via the eval-response stub) to return file content with `\r\n` line endings. The matched body slice contains `\r\n` bytes.
Assert: returned `{content}` contains `\r\n` bytes byte-faithfully (no normalisation to `\n`). Test asserts the byte-for-byte identity by comparing JSON-encoded representations.

### S-10 — LF round-trip (SC-008 part 2)

Setup: stub returns file content with `\n` line endings.
Assert: returned `{content}` contains `\n` bytes (no expansion to `\r\n`). Byte-for-byte assertion.

### S-11 — Byte-faithful structure preservation (SC-009)

Setup: stub returns body content containing a fenced code block with `\`\`\`typescript\n...\n\`\`\``, a Markdown table with pipe characters and column alignment, and a nested list with mixed indentation.
Assert: returned `{content}` contains all bytes verbatim — fence markers intact, table pipes intact, list indentation intact.

### S-12 — Validation rejection summary (SC-010)

Setup: a parameterised test runs all 10 US3 scenarios (single-segment heading, leading/trailing/interior empty segments, specific without vault, specific with both locators, active with each forbidden key, unknown top-level key) against `readHeadingInputSchema.safeParse`.
Assert: every case fails with `VALIDATION_ERROR`. Verifies via dispatcher spy that `spawnFn` was NEVER called for any of the 10 cases.

### S-13 — Heading not found error (SC-011)

Setup: stub returns `=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"segments: A::B not found in x.md"}`.
Assert: handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: "HEADING_NOT_FOUND", detail: "segments: A::B not found in x.md"}})`. The vault name, locator, and heading path are preserved in the error context.

### S-14 — File not found error (SC-012)

Setup: stub returns `=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: x.md"}`.
Assert: handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: "FILE_NOT_FOUND", detail: "path: x.md"}})`.

### S-15 — Unknown vault → reclassified (SC-013)

Setup: stub returns `Vault not found.` stdout exit 0 (the cli-adapter's 011-R5 inspection clause re-classifies BEFORE the handler's parse step).
Assert: handler propagates `UpstreamError({code: "CLI_REPORTED_ERROR", details: {message: "Vault not found.", ...}})` unchanged.

### S-16 — Active mode happy path / no focus (SC-014)

Setup A: stub returns body for a happy-path eval response in active mode.
Setup B: stub returns `=> {"ok":false,"code":"NO_ACTIVE_FILE","detail":"No note focused..."}`.
Assert A: `{content}` returned. Argv has NO `vault=` prefix.
Assert B: handler throws `UpstreamError({code: "ERR_NO_ACTIVE_FILE", details: {stage: "envelope-error", detail}})`.

### S-17 — Token saving observable (SC-015) — INFO

Not a vitest case per se. Documented in `docs/tools/read_heading.md` as the user-visible value statement, with example payload sizes (typical heading body 100–500 chars vs full-file 5–50k for long documents). Asserted at the architecture level by the single-call wire shape: one eval response carrying just the body bytes.

### S-18 — Existing tools unchanged (SC-016)

Setup: the existing `obsidian_exec` / `read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property` / `help` `*.test.ts` files remain green after `read_heading` is added.
Assert: `vitest run` passes for all prior tests AND the only diff to existing source files is `src/server.ts` registration list growth.

### S-19 — Documentation completeness (SC-017)

Setup: registry-consistency test from 005-help-tool walks the registered tools list AND asserts `docs/tools/read_heading.md` exists.
Assert: the doc contains the per-field input contract, output shape, failure-mode roster, practical-ceiling note for very large bodies, documented fallback for out-of-reach paths, AND at least four worked examples covering distinct usage modes.

---

## Manual end-to-end scenarios (TestVault opening required)

### S-20 — Live happy path against TestVault (SC-001 / SC-002 / SC-006)

Setup:
1. Open `TestVault-Obsidian-CLI-MCP` in Obsidian; ensure it is the focused vault.
2. Seed `Sandbox/015-quickstart.md` with the following content:
```
# Best Practices

Top intro paragraph.

## Naming

Use kebab-case.

### Casing

Use lowercase letters and dashes.

## Tests

Write the test first.
```
3. Run the MCP server (`npm run build && node dist/index.js`).
4. From MCP Inspector or Claude Desktop, call `read_heading({target_mode: "specific", vault: "TestVault-Obsidian-CLI-MCP", path: "Sandbox/015-quickstart.md", heading: "Best Practices::Naming"})`.

Expected response: `{content: "Use kebab-case.\n"}`.

Then call: `read_heading({..., heading: "Best Practices::Naming::Casing"})`.
Expected: `{content: "Use lowercase letters and dashes.\n"}`.

Then call: `read_heading({..., heading: "Best Practices::Tests"})`.
Expected: `{content: "Write the test first.\n"}` (last heading; body extends to EOF).

Cleanup: delete `Sandbox/015-quickstart.md`.

### S-21 — Live segment-matching characterisation (SC-022)

Setup: seed `Sandbox/015-segments.md` with:
```
# Outer

## Plain Heading

Plain prose.

## Heading With Trailing Whitespace   

Trailing whitespace prose.

## Heading With Closing ATX ##

Closing ATX prose.

## My **Bold** Heading

Bold prose.

## Section ^my-anchor

Anchor prose.
```

Probe each heading via `read_heading({...heading: "Outer::<text>"})` and assert the body matches:
- `"Outer::Plain Heading"` → `"Plain prose.\n"`
- `"Outer::Heading With Trailing Whitespace"` → `"Trailing whitespace prose.\n"` (Obsidian post-trim)
- `"Outer::Heading With Closing ATX"` → `"Closing ATX prose.\n"` (Obsidian post-strip closing-`##`)
- `"Outer::My **Bold** Heading"` → `"Bold prose.\n"` (inline markdown survives)
- `"Outer::Section ^my-anchor"` → `"Anchor prose.\n"` (anchor survives)
- `"Outer::My Bold Heading"` → `HEADING_NOT_FOUND` (inline markdown stripped → does not match)
- `"Outer::Section"` → `HEADING_NOT_FOUND` (anchor stripped → does not match)
- `"Outer::plain heading"` → `HEADING_NOT_FOUND` (mis-cased)

Cleanup: delete `Sandbox/015-segments.md`.

### S-22 — Setext exclusion + fenced opacity (SC-005 + R14)

Setup: seed `Sandbox/015-setext.md` with:
```
# Outer

## ATX Section

Some prose.

A line that looks like Setext H2
---------------------------------

This text is below a Setext underline. It should be part of `## ATX Section`'s body
because the Setext underline is content, not a boundary.

```markdown
## Heading-like text inside fence
This should also be content.
```

End of section.
```

Probe: `read_heading({..., heading: "Outer::ATX Section"})`.
Assert: returned body INCLUDES "A line that looks like Setext H2", the `---` line, the fenced block, and "End of section." — none of those internal-looking-like-headings act as terminators. The body terminates at EOF (the file has no further ATX heading after `## ATX Section`).

Cleanup: delete `Sandbox/015-setext.md`.

---

## Test mapping summary

| SC | CI scenario | Manual scenario |
|---|---|---|
| SC-001 | S-1 | S-20 |
| SC-002 | S-2 | S-20 |
| SC-003 | S-3, S-4 | (covered by S-20 implicitly via H2 sibling termination) |
| SC-004 | S-5 | S-20 (`Best Practices::Naming` → terminated by `### Casing`) |
| SC-005 | S-6 | S-22 |
| SC-006 | S-7 | (could be added to S-20 with an empty-bodied heading) |
| SC-007 | S-8 | (deferred — manual test would need a duplicate-path fixture) |
| SC-008 | S-9, S-10 | (deferred — manual test would need to seed CRLF and LF fixtures) |
| SC-009 | S-11 | S-22 (fenced code block survives) |
| SC-010 | S-12 | (n/a — pure validation) |
| SC-011 | S-13 | S-21 (HEADING_NOT_FOUND cases) |
| SC-012 | S-14 | (covered by manual probe to nonexistent file) |
| SC-013 | S-15 | (covered by manual probe with `vault: "DefinitelyNotARegisteredVault"`) |
| SC-014 | S-16 | (covered by switching focus and running active-mode probe) |
| SC-015 | S-17 (info) | (n/a — architectural property) |
| SC-016 | S-18 | (n/a — automated check) |
| SC-017 | S-19 | (n/a — doc presence) |
| SC-018 | (covered by total-test-count assertion) | (n/a) |
| SC-019 | (covered by lint check; no new error code definitions in errors.ts) | (n/a) |
| SC-020 | (covered by research.md cases enumeration; verified by T0 against TestVault) | S-20, S-21, S-22 |
| SC-021 | (covered by S-1's argv decode + S-13/S-14's anti-injection round-trip lock) | (n/a — structural) |
| SC-022 | (covered by S-21's parameterised assertions) | S-21 |

---

## Cleanup checklist (for manual scenarios)

After running S-20 / S-21 / S-22:
- [ ] `Sandbox/015-quickstart.md` removed
- [ ] `Sandbox/015-segments.md` removed
- [ ] `Sandbox/015-setext.md` removed
- [ ] `Sandbox/` directory empty
- [ ] No residue in `.trash/` from these probes

Report any vault residue you couldn't auto-clean to the user before running further tests.
