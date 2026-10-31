# T0 Probe Findings: `read_heading` Start of Body

**Feature**: [../spec.md](../spec.md) | **Probe plan**: [t0-probe-plan.md](t0-probe-plan.md) | **Requirement**: FR-010, SC-004, SC-005

## Capture

| Field | Value |
|---|---|
| Capture date | 2026-10-31 |
| Server build | branch `069-fix-section-body-docs`, commit `aab6228`, `npm run build` (`tsc -p tsconfig.build.json`) passed |
| Server under test | `node dist/index.js` from this repo, driven by a scratch MCP stdio client (`@modelcontextprotocol/client` 2.4.0 `Client` + `StdioClientTransport`) calling `read_heading` and `outline`. The `obsidian-cli-mcp-local` MCP tools were not authorised in this session, so the stdio-client route named in T002 was used. This branch changes no `src/**`, so the runtime is the same either way. |
| Obsidian CLI | Bare `obsidian` resolves to `C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`. `obsidian --version` is not a command on this CLI (`Error: Command "--version" not found. Did you mean: version?`); `obsidian version` prints `1.14.5 (installer 1.14.4)`. |
| Vault | `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/069-probe-20261031-1200/` |

## Fixtures

Written straight to disk with `System.IO.File.WriteAllText` and a BOM-less UTF-8 encoding, then read back as bytes. F2's every line ends `0D 0A`; F6's last byte is `74` (`t`). Obsidian indexed all six before the reads (`outline` listed the expected headings for each on the first attempt).

| ID | Path | Exact bytes |
|---|---|---|
| F1 | `lf-layouts.md` (LF) | `# Top\n## Blank\n\nBody text.\n## Direct\nBody text.\n## Empty\n## OnlyBlank\n\n## End\n` |
| F2 | `crlf-layouts.md` (CRLF) | `# Top\r\n## Blank\r\n\r\nBody text.\r\n## OnlyBlank\r\n\r\n## End\r\n` |
| F3 | `best-practices.md` (LF) | `# Best Practices\n## Naming\nUse kebab-case.\n### Casing\nUse lowercase letters and dashes.\n` |
| F4 | `active-example.md` (LF) | `# Top\n## Section A\nHello.\n` |
| F5 | `last-line-eol.md` (LF) | `# Top\n## Last\n` |
| F6 | `last-line-noeol.md` (LF, no trailing line ending) | `# Top\n## Last` |

## Reads

All reads used `target_mode: "specific"`, `vault: "TestVault-Obsidian-CLI-MCP"` and `path: "Sandbox/069-probe-20261031-1200/<fixture>"`. Observed values are the `structuredContent.content` strings, JSON-escaped. The text content block carried the identical JSON in every case.

| Probe | Fixture | `heading` | Expected `content` | Observed `content` | Verdict |
|---|---|---|---|---|---|
| P1 | F1 | `Top::Blank` | `"\nBody text.\n"` | `"\nBody text.\n"` | match |
| P2 | F2 | `Top::Blank` | `"\r\nBody text.\r\n"` | `"\r\nBody text.\r\n"` | match |
| P3 | F1 | `Top::Direct` | `"Body text.\n"` | `"Body text.\n"` | match |
| P4 | F1 | `Top::Empty` | `""` | `""` | match |
| P5 | F1 | `Top::OnlyBlank` | `"\n"` | `"\n"` | match |
| P5 | F2 | `Top::OnlyBlank` | `"\r\n"` | `"\r\n"` | match |
| P6 | F3 | `Best Practices::Naming` | `"Use kebab-case.\n"` | `"Use kebab-case.\n"` | match |
| P6 | F3 | `Best Practices::Naming::Casing` | `"Use lowercase letters and dashes.\n"` | `"Use lowercase letters and dashes.\n"` | match |
| P7 | F4 | `Top::Section A` | `"Hello.\n"` | `"Hello.\n"` | match |
| P8 | F5 | `Top::Last` | `""` | `""` | match |
| P8 | F6 | `Top::Last` | `""` | `""` | match |

**Gate**: P1–P7 all match, so the doc edit proceeds. Both P8 reads returned `""`, so E4's "or the heading is the note's last line" clause stays as written; no rewording was needed.

## Cleanup

`Sandbox/069-probe-20261031-1200/` and its six fixtures were deleted from disk (no `.trash/` entry, since nothing went through Obsidian's delete). `Sandbox/` was listed again and matches the pre-run listing exactly (`BI-0008`, `BI-0016`, `BI-0165`, `BI-0168`, `BV`, `TC-00005`, `TC-00030`, `TC-00033`, `TC-00034`, `TN`, `pr3-check-2026-10-30.md`, `Serial-focus.md`, `TC-00038-focus.md`). `Welcome.md` at the vault root is untouched. No residue.

## Post-edit verification

After edits E1–E7 to `docs/tools/read_heading.md`:

- **Page check 1**: the search for `always begins`, `Leading-newline`, ``leading `\n` byte`` and `rim client-side` prints nothing.
- **Page check 2**: the page shows ten `content` values. Only the empty-body paragraph's `"\n"` / `"\r\n"` clause and the two Start of body rows for a blank line under the heading begin with `\n` or `\r\n`.
- **Page check 3**: every shown body has a backing read above. Output block = P6 (Naming); empty-body paragraph `""` = P4 and P8, `"\n"` / `"\r\n"` = P5; Start of body table rows = P3, P1, P2, P5 (F1), P4; Examples 1–3 = P6, P6, P7.
- **Page check 4**: `git diff --stat main...HEAD` and `git status --short` list only `docs/tools/read_heading.md`, files under `specs/069-fix-section-body-docs/`, `CLAUDE.md` and `.specify/feature.json`. Nothing under `src/**`, no `*.test.ts`. `git diff main...HEAD -- src/tools/read_heading/` is empty, so `READ_HEADING_DESCRIPTION` and `readHeadingOutputSchema` are unchanged (FR-009).
- **Served help**: `help` with `tool_name: "read_heading"` on the built server returns text containing the "**Where the body starts:**" paragraph and the "### Start of body" note, and no "Leading-newline" text.
- **Gates**: `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` pass (154 test files passed, 1 skipped; 3128 tests passed, 6 skipped). No test or `vitest.config.ts` change.

### After the PR #96 review amendment

The page was cut back to one full statement of the rule (contract "Amendment: one canonical statement"). Page check 1 still prints nothing. Page check 2: the page shows twelve `content` values, and only the four Start of body rows for a blank line under the heading begin with `\n` or `\r\n`. Page check 3: Output block = P6 (Naming); empty-body paragraph `""` = P4 and P8; Start of body rows = P3, P1, P2, P5 (F1), P5 (F2), P4, P8; Examples 1–3 = P6, P6, P7. No new body claim was added without a backing read above, so no new probe was needed.

## Graphify structural check (docs-only carve-out)

`graphify update .` (AST-only) ran after the final diff. Checks 1–3 (no new error codes outside `src/errors.ts`, no handler importing the boot-time DI factories, new symbols in expected communities) are trivially satisfied because no `src/**` file changed; the kernel nodes `createLogger()`, `createQueue()`, `createServer()` and `UpstreamError` are untouched, as the plan claimed. Check 4: the three `contracts/` artifacts (`doc-correction-contract.md`, `t0-probe-plan.md`, this file) are present in the graph, each with several section nodes and edges, and they share a BI-specific community. None is orphaned.

## Success criteria

| Criterion | Status | Evidence |
|---|---|---|
| SC-001 | met | Page check 1 prints nothing; the Output block and Examples 1–3 no longer show a leading `\n`. |
| SC-002 | met | Examples 1–3 equal P6 and P7 observed bodies (page check 3). |
| SC-003 | met | The Where the body starts paragraph and the Start of body table predict P1, P2, P3 and P4, and each prediction matches the observed body. |
| SC-004 | met | No `src/**` change; the runtime that produced these reads is the runtime that ships. |
| SC-005 | met | 6 of 6 FR-010 layouts (P1–P5, P8) match; P6–P7 also match. |
