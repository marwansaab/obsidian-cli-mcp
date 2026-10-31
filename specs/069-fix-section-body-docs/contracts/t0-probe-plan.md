# T0 Probe Plan: `read_heading` Start of Body

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Requirement**: FR-010, SC-005

This probe checks the corrected help against real returned bodies once. It reads through the `read_heading` tool of a server built from this branch, so it observes what an agent receives. It runs before the doc edit; the doc edit cannot change runtime behaviour, so the same results stand afterwards (SC-004).

## Rules

Follow `.memory/test-execution-instructions.md` (gitignored, assistant-only):

- Vault `TestVault-Obsidian-CLI-MCP` only; all fixtures under `Sandbox/069-probe-<timestamp>/`.
- Do not touch `Welcome.md` or the vault root. Capture `Sandbox/` before seeding and restore it afterwards.
- The server spawns bare `obsidian`, which resolves to `Obsidian.com`. Never drive `Obsidian.exe`.
- Pass `vault` explicitly (`target_mode: "specific"`).
- No destructive probes: this probe writes and removes only its own fixtures.

## Fixtures

Write each fixture file straight to disk with exact bytes (not through a write tool), so the line endings are exactly as listed. `⏎` is the note's line ending: `\n` in LF notes, `\r\n` in CRLF notes. `(blank)` is an empty line. Every file except F6 ends with a line ending.

**F1 `lf-layouts.md` (LF)**

```text
# Top
## Blank
(blank)
Body text.
## Direct
Body text.
## Empty
## OnlyBlank
(blank)
## End
```

**F2 `crlf-layouts.md` (CRLF)**

```text
# Top
## Blank
(blank)
Body text.
## OnlyBlank
(blank)
## End
```

**F3 `best-practices.md` (LF)**

```text
# Best Practices
## Naming
Use kebab-case.
### Casing
Use lowercase letters and dashes.
```

**F4 `active-example.md` (LF)**

```text
# Top
## Section A
Hello.
```

**F5 `last-line-eol.md` (LF, ends with a line ending)**: exact bytes `# Top\n## Last\n`.

**F6 `last-line-noeol.md` (LF, no trailing line ending)**: exact bytes `# Top\n## Last`.

After seeding, wait until Obsidian has indexed the files (for example, `outline` on each fixture lists its headings) before reading.

## Probes

| ID | Fixture | `heading` | Layout | Expected `content` (JSON) |
|---|---|---|---|---|
| P1 | F1 | `Top::Blank` | blank line under heading, LF | `"\nBody text.\n"` |
| P2 | F2 | `Top::Blank` | blank line under heading, CRLF | `"\r\nBody text.\r\n"` |
| P3 | F1 | `Top::Direct` | text directly under heading | `"Body text.\n"` |
| P4 | F1 | `Top::Empty` | next heading directly under | `""` |
| P5 | F1 and F2 | `Top::OnlyBlank` | only a blank line, then next heading (LF and CRLF) | `"\n"` (F1) and `"\r\n"` (F2) |
| P6 | F3 | `Best Practices::Naming` and `Best Practices::Naming::Casing` | Examples 1 and 2 | `"Use kebab-case.\n"` and `"Use lowercase letters and dashes.\n"` |
| P7 | F4 | `Top::Section A` | Example 3 (checked in specific mode) | `"Hello.\n"` |
| P8 | F5 and F6 | `Top::Last` | heading on the note's last line, with and without a trailing line ending | `""` (F5) and `""` (F6) |

P1–P5 and P8 are the six FR-010 layouts. P6–P7 check the worked examples (FR-007, SC-002). P5 and P8 back the E4 empty-body paragraph, and P5's F2 read backs its `"\r\n"` clause. There are eleven reads in all: P5, P6 and P8 are two reads each.

**P8 rule**: P8 decides the wording of E4's "or the heading is the note's last line" clause rather than gating the work. If both P8 reads return `""`, keep the clause as written. Otherwise reword E4 to state the observed bodies exactly, per line-ending case, and record the rewording in the findings. Any other mismatch (P1–P7) stops the work.

## Recording

Write `t0-probe-findings.md` beside this file using the evidence record in [../data-model.md](../data-model.md): one row per read (P5, P6 and P8 have two), with expected and observed `content` JSON-escaped exactly as the tool's `structuredContent` returned it, and a `match` / `mismatch` verdict. Also record the capture date, the branch and commit of the server build, `obsidian --version` output, and the cleanup result (`Sandbox/` back to its pre-run listing).

Any `mismatch` on P1–P7 stops the work: report it with the observed output verbatim and do not edit the help page until the owner decides.
