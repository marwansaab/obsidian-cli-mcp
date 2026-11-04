# Contract: Tool Description Audit

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **Research**: [../research.md](../research.md)

## §P Published-surface changes

| Id | Surface | Change |
|---|---|---|
| P1 | 35 top-level tool descriptions | Rewritten under §S. Each ≤ 400 characters; ≤ 12,000 in total. |
| P2 | Parameter descriptions | Identifiers and version history removed (`properties`, `query_base`, `read_property` and `search` root descriptions; research F2). A parameter may gain at most one sentence stating an input rule moved out of its tool's description (§S7). |
| P3 | Server instructions | One line replaced (§I1). Nothing else changes. |
| P4 | `help` description | Replaced (§I2). |
| P5 | `docs/tools/index.md` | Every entry becomes its tool's first sentence (§I3). The header stays. |
| P6 | `docs/tools/<name>.md` | Gains every fact cut from the description that the page lacked (§H). |
| P7 | `_register-baseline.json` | Regenerated in the same change. Description and schema fingerprints move; titles, annotations and output schemas do not. |

**Unchanged:**

- every tool's name, title, annotations, input-schema shape (keys, types, `required`, refinements), output schema, handler and error codes;
- `src/errors.ts` and `src/server.ts`.

## §S Description rules

- **S1:** Sentence 1 states what the tool does. It reads on its own and becomes the index entry. It contains no `e.g.` or `i.e.`.
- **S2:** Sentence 2 says when to choose the tool. It names, in backticks, every sibling from the tool's families (data-model E6) and what each sibling is for when that is the reason to choose it instead. A tool in no family (`help`, `vaults`, `obsidian_exec`) says when to use it.
- **S3:** A caveat follows when the tool can lose data or a default widens its reach. This covers:
  - overwrite (`write_note`);
  - trash vs permanent (`delete`);
  - links rewritten per vault setting, and the file keeping its type (`move`, `rename`);
  - vault-wide default scope and preview until `commit: true` (`find_and_replace`, worded without "preview first");
  - blocked commands and `OBSIDIAN_MCP_ALLOW_EVAL` (`obsidian_exec`).
- **S4:** The existing `describeSupport(...)` sentence stays, last (ADR-044).
- **S5:** Nothing else. Result shapes, caps and limits, error codes, cross-vault and closed-vault behaviour, deprecated-name lists, examples and version history move out (§H, §S7).
- **S6:** Existing pinned phrases are kept where they fit S1 to S4 without strain: the tool's own name, sibling names, the trash / irreversible wording, link rewriting, "keeps its type", `obsidian_exec`, "The created item is a note.", `context_search` in `pattern_search`, and `{ tool_name: "help" }`. This is the LIKELY-KEEP class. If one of these assertions fails, the description is reworded to keep the phrase; the test is not edited.
- **S7:** An input-combination rule found only in a tool's description is stated, in one sentence, in the description of the parameter it constrains (FR-004a; constitution "Visible input rules"). Target-mode combination rules are never repeated: they live once in the shared target-mode descriptions. These parameter descriptions must not gain text without a new approved edit:
  - `find_by_property`: `name`, `case_sensitive`;
  - `find_and_replace`: `case_sensitive`, `folder`;
  - `create_base`: `base_path`, `view_name`;
  - `query_base`: `base_path`.
- **S8:** Stale claims are cut and not carried into any parameter: `set_property`'s client caveat about passing an explicit `type` (Clarification Q3). The help page keeps what it already says, and the reviewer record's `detail` gap notes the claim as possibly stale.

## §I Instructions and help

- **I1:** `RULES` in `src/instructions/instructions.ts`, last line:
  - old: `- \`help\` holds each tool's long reference: examples, error codes and recovery hints.`
  - new: `- \`help\` with a tool's name returns its full contract; with none, it lists every tool.`
  - The full instructions go from 1,996 to 1,997 characters, under the 2,000 limit.
- **I2:** `HELP_DESCRIPTION`:
  > `Return any registered tool's full contract (inputs, output, errors and examples) as Markdown when given its name in tool_name, or the index of every tool when called with no arguments. Self-describing: { tool_name: "help" } documents this tool.`
  - The first sentence is the index entry.
  - The text does not match `/call \`?help\(/i`.
- **I3:** Index entries are `- **<name>** — <firstSentence(description)>`, one per offered tool, in the existing alphabetical order. The two header lines are unchanged.

## §A Audit command

- **A1:** `npm run audit:descriptions` runs `node scripts/audit-descriptions.ts`. It prints the Markdown report (data-model E10) to stdout.
  - It exits 0 when the report is produced, whatever the verdicts. It is a report, not a gate.
  - It exits non-zero only when the report cannot be built: the reviewer record fails validation, the vitest run fails, or git or `package.json` cannot be read. The cause goes to stderr.
- **A2:** `scripts/_vitest-dump.ts` exports `runVitestDump(testFileName: string, makeSource: (dumpPath: string) => string): Promise<string>`. It creates the scratch directory and dump path itself, writes `src/tools/<testFileName>` from `makeSource(dumpPath)`, runs `npx vitest run --no-coverage <file>`, returns the dump's text, and in `finally` removes both the temporary test and the scratch directory. `scripts/write-register-baseline.ts` and `scripts/audit-descriptions.ts` both use it.
  - Regression gate: `npm run baseline:write` on a tree with no surface change leaves `_register-baseline.json` byte-identical, apart from `generatedAt` / `generatedFromBranch`.
- **A3:** `meta` passed to the renderer:
  - `version` from `package.json`;
  - `sha` from `git rev-parse --short HEAD`;
  - `branch` from `git rev-parse --abbrev-ref HEAD`;
  - `date` as `YYYY-MM-DD` in local time.

## §T New test rows

**`src/tools/_description-audit.test.ts`** unit-tests the pure helpers on fixtures:

| Row | Asserts |
|---|---|
| T-ID1 | P1–P6 each find their sample: `BI-0134`, `FR-006a`, `ADR-031`, `TC-00586`, `US6`, `T066`, `spec 078`, "per spec", "a new BI". |
| T-ID2 | P7 finds `Q1` in "per the Q1 clarification", `B1` in "B1 falsified" and `A10` in "Assumption A10". |
| T-ID3 | Nothing is reported for `UTF-8`, `UTF-16`, `V8`, `2026-05-17`, `UNSUPPORTED_FILE_TYPE`, `ERR_NO_ACTIVE_FILE`, `` `Q1 Goals` ``, `"Q1 Goals"`, `H2` or `limit 1..100`. |
| T-FS | `firstSentence`: stops at the first `. ` or at the end; keeps a `.` inside `` `.md` ``; a text with no period is returned whole. |
| T-IX | `parseIndexEntries` returns a name → text map and ignores the header lines. |
| T-FAM | `siblingsOf("read_property")` equals the 5 names. `missingSiblings` reports the names a description lacks. `help`, `vaults` and `obsidian_exec` have no family. |
| T-REC1 | A valid record parses, including a PASS or N/A carrying a `gap` note. An unknown key, a bad verdict, a FAIL or PARTIAL without `gap`, or a short fingerprint is rejected with the zod issue path. |
| T-REP1 | For a 3-tool fixture surface, the matrix has 3 rows, each row has 9 verdict cells, and every FAIL or PARTIAL cell has its `### <tool>: <check>` Gaps entry. |
| T-REP2 | A changed description fingerprint makes every judgement cell of that tool `NEEDS REVIEW (was …)`. A missing record entry gives `NEEDS REVIEW (not recorded)`. The mechanical cells are still computed. |
| T-REP3 | Over-budget description → Budget `FAIL (n)`, with a gap naming the overflow. Index text ≠ first sentence → Index `FAIL`. An identifier in a parameter description → IDs `FAIL`, with the gap naming the field path. |
| T-REP4 | A tool in no family → Family `N/A`. A member missing a sibling name → Family `FAIL`, with the missing names (computed overrides the record). A tool with no roster field → Shared fields `N/A`. |
| T-REP5 | Header: total over 12,000 → `FAIL`; the help pointer missing from the instructions → `FAIL`; the needs-review count is correct. Routing lines not in the record → `NEEDS REVIEW`. |
| T-REP6 | A PASS cell whose record carries a `gap` note gets a `## Notes` entry `### <tool>: <check> (PASS)` with that text. A PASS cell without `gap` gets none. FAIL and PARTIAL still go to `## Gaps`. |
| T-REP7 | Tool-count guard: a fixture surface of 3 tools against a docs fixture with 3 pages → `PASS`; with 4 pages → `FAIL`, naming both counts. |
| T-COL | `collectPublishedSurface()` measures the full default list whatever the access settings. With `process.env` carrying `OBSIDIAN_MCP_READ_ONLY=1` and `OBSIDIAN_MCP_DISABLE=delete` (restored in `finally`), it still returns every tool that has a help page. |

**`src/tools/_description-quality.test.ts`** holds the standing checks on the live surface (`collectPublishedSurface()`):

| Row | Asserts |
|---|---|
| Q1 | Every description is ≤ 400 characters. The failure lists `name (length)`. |
| Q2 | The total of all descriptions is ≤ 12,000. |
| Q3 | No internal identifier in any description, in any `inputSchema` / `outputSchema` description at any depth, in the instructions, or in `index.md`. The failure lists `where: match`. |
| Q4 | The instructions contain the I1 line, and the `help` description matches the pointer (contains "full contract" and "tool_name"). |
| Q5 | Every index entry equals the first sentence of its tool's published description. The failure lists the tool names. |
| Q6 | `src/tools/_description-audit-record.json` parses (schema validity only). Stale or missing verdicts are not checked, per Clarification Q4. |
| Q7 | `renderAuditReport(collectPublishedSurface(), record, meta)` on the live surface has exactly `tools.length` matrix rows with 9 verdict cells each (FR-017, FR-019). The verdicts themselves are not asserted, per Clarification Q4. |

**Red checks** (quickstart §2), each applied temporarily and then reverted: an over-length description fails Q1, a `BI-0001` added to a parameter description fails Q3, and an index entry edit fails Q5.

## §X Existing test edits (APPROVED by the owner, 2026-11-04, Option A, recorded on BI-0027)

Refactor-decisions item 5 requires this list to be approved before any existing test is touched. It was approved as written, with the stop rule below. X-CV applies, because the closed-vault question was ruled A. The rules:

- **X-L (length lower bound) → delete the assertion.** Q1 now holds the upper bound. The rows:
  - `backlinks/index.test.ts:32`;
  - `bases/index.test.ts:46` (the whole `it`);
  - `create_base/index.test.ts:46` (the whole `it`);
  - `views_base/index.test.ts:52` (the whole `it`);
  - `find_and_replace/index.test.ts:31`;
  - `get_active_file/index.test.ts:41`;
  - `open_file/index.test.ts:43`;
  - `pattern_search/index.test.ts:54-61` (the whole `it`);
  - `query_base/index.test.ts:80` (the whole `it`).
- **X-P (detail now on the help page) → keep the same phrase and the same matcher, and change the subject from the description to the help page text.** The page is `readFileSync(join(DOCS_DIR, "<tool>.md"), "utf8")`, lowercased when the original lowercased the description. Rows marked `+` lack the phrase verbatim on the page today; the phrase is added to the right section of the page (§H), not reworded in the test.
- **X-A (rule now in a parameter description) → same phrase, subject changed to that parameter's published description.**
- **X-LOOP → drop the description from a `for (const text of [desc, …])` loop.** The loop's other subjects (the parameter, the page) stay, and so does each phrase.
- **X-CV (closed-vault note; applies, ruled A).** `expect(desc).toContain(closedVaultNote("<cmd>"))` becomes `expect(helpPage).toContain('Command "<cmd>" not found.')`, and the `closedVaultNote` import is removed. The `_shared.test.ts` test "closedVaultNote states closed-vault recovery and vault unavailable for the given subcommand" (line 84 to the end of that `test`), its import at line 9, and the "072: closedVaultNote wording." note in the file header are deleted together with the helper.

| File | Lines | Rule |
|---|---|---|
| backlinks/index.test.ts | 46 `.md`, 47 `bypass`, 48 `self-reference`, 49 `frontmatter` | X-P |
| bases/index.test.ts | 85 | X-CV |
| bases/index.test.ts | 86 `VAULT_NOT_FOUND` | X-P |
| bases/index.test.ts | 87-89 "Optional `vault` (string): lists that vault's Bases. Omit to list the vault in front." | X-P+ |
| create_base/index.test.ts | 95-98 `INVALID_BASE_PATH`, `INVALID_NAME`, `CONTENT_TOO_LARGE`, `BASE_NOT_FOUND` | X-P |
| create_base/index.test.ts | 297 | X-CV |
| create_base/index.test.ts | 298 `VAULT_NOT_FOUND` | X-P |
| create_base/index.test.ts | 299 `PATH_ESCAPES_VAULT` sentence | X-P+ |
| create_base/index.test.ts | 300-302 vault sentence | X-P+ |
| create_base/index.test.ts | 313 `Required \`base_path\` (string, 1..1000 chars)`, 314 `Optional \`view_name\` (string)`, 315 output `path` sentence | X-P+ |
| create_base/index.test.ts | 317-319 deprecated-names sentence | X-P+ (Deprecated names section) |
| find_and_replace/index.test.ts | 35 `active_note`, 36 `SCOPE_CONFLICT`, 37 `single-note` | X-P |
| find_and_replace/index.test.ts | 44 `` `VAULT_NOT_FOUND`/`unknown` `` | X-P+ |
| find_and_replace/index.test.ts | 356 `Optional \`case_sensitive\` (boolean, default true).` | X-P+ |
| find_and_replace/index.test.ts | 358-360 deprecated-names sentence | X-P+ |
| find_by_property/index.test.ts | 34 `/count.*paths\|paths.*count/i` | X-P |
| find_by_property/index.test.ts | 141 `Inputs:` sentence, 143-145 deprecated-names sentence | X-P+ |
| files/index.test.ts | 30 `target_mode`, 32 `total` | X-P |
| get_active_file/index.test.ts | 60, 61, 62, 63, 64, 65, 66, 71, 77, 78 | X-P |
| links/index.test.ts | 43 `total` | X-P |
| links/index.test.ts | 108-110 alias sentence | X-P+ |
| open_file/index.test.ts | 59 `cross-vault`, 60 `placement`, 61 `switches focus`, 62 `new_tab`, 65 `unsupported_file_type` | X-P |
| paths/index.test.ts | 76 `end with "/"` | X-P+ |
| paths/index.test.ts | 81 | X-CV |
| patch_block/index.test.ts | 122-123 | X-P. The `indexOf("Typed errors via")` anchor is dropped; the page must contain `` `UNSAFE_PLACEMENT` ``. |
| patch_heading/index.test.ts | 145-146 | X-P, as for patch_block |
| patch_heading/index.test.ts | 194-196, 220-223 | X-LOOP |
| patch_heading/index.test.ts | 237-238 | X-LOOP (the description half) |
| pattern_search/index.test.ts | 96 `case_sensitive`, 97 `default` | X-P, unless S6 keeps them in the sibling sentence (then no edit) |
| pattern_search/index.test.ts | 102 | X-CV |
| prepend/index.test.ts | 48 `3072` | X-A (`content`, which already contains it) |
| prepend/index.test.ts | 91 `3072 UTF-8 bytes`, 92 `details.reason: "bytes"` | X-P |
| query_base/index.test.ts | 105-108 `BASE_NOT_FOUND`, `BASE_MALFORMED`, `VIEW_NOT_FOUND`, `VAULT_NOT_FOUND` | X-P |
| query_base/index.test.ts | 113 | X-CV |
| read_heading/index.test.ts | 134-136, 142-145 | X-LOOP |
| read_heading/index.test.ts | 152-158 | X-LOOP (the description half) |
| smart_connections_query/index.test.ts | 44-50, 61 | X-P |
| smart_connections_query/index.test.ts | 56 | X-CV |
| smart_connections_similar/index.test.ts | 44-49, 60 | X-P |
| smart_connections_similar/index.test.ts | 55 | X-CV |
| tag/index.test.ts | 42 | X-CV |
| views_base/index.test.ts | 63 `base_path` | no edit if S2 names it; otherwise X-A (`base_path`) |
| views_base/index.test.ts | 64 `Named Base`, 70-73 `INVALID_BASE_PATH`, `named-missing`, `not-open`, `VAULT_NOT_FOUND`, 92 | X-P |
| views_base/index.test.ts | 91 | X-CV |
| views_base/index.test.ts | 93-94 vault sentences | X-P+ |
| _surface.test.ts | 158-163 | Expectation `["views_base"]` becomes `[]`. Title: "no tool description mentions a not-open state". |
| _file-type-support.test.ts | 80-81 (`move` and `rename`: "keeps its type", `obsidian_exec`) | No edit expected (S3/S6 keep both). If either still fails, X-P to the two pages. |
| search/schema.test.ts | 24-25 | The regex becomes `/strict-rich pathway only/g` (still exactly 2), and the title drops the identifier. |
| instructions/instructions.test.ts | 93 | The pinned phrase becomes `` "`help` with a tool's name returns its full contract" ``. |

**Stop rule:** any other existing assertion that fails during implement stops the work. It is raised to the owner, and that test is not edited. No expected value other than those listed may change.

## §H Help-page moves

For each tool, before its description is rewritten:

1. List every fact in the current description.
2. Find each fact on `docs/tools/<tool>.md`, in the section it belongs to (Input, Output, Errors or Examples).
3. Add any fact the page lacks, in the page's own style, to that section. This includes every phrase marked `X-P+` in §X.
4. Record the outcome in the reviewer record's `detail` verdict.

Facts that disagree with the page are settled by reading the code, and only for facts this feature moves (spec edge case).

**Closed-vault note** (owner ruling, Amendment 2026-11-04 on ADR-045). Each of the pages `bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag` and `views_base` must state two things:

- **The vault-unavailable answer:** `Error: Command "<cmd>" not found.`, an uncoded `CLI_REPORTED_ERROR` with no `details.code` or `details.reason`.
- **Automatic opening:** a closed registered vault is opened automatically.

All 9 pages already carry the first. `tag.md` gains the second (research F4).

## §C CHANGELOG

Under `## [Unreleased]`, `### Changed`:

> Tool descriptions are now short. Each says what the tool does, when to pick it over related tools, and any data-loss caveat, in at most 400 characters. All of them together are at most 12,000 characters, down from about 62,000. The detail they used to carry (result shapes, limits, error codes, examples) is on each tool's `help` page, and the server instructions say how to open it. Published descriptions, parameter descriptions and the help index no longer quote internal tracking numbers. `npm run audit:descriptions` prints a per-tool audit report.
