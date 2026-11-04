# Data Model: Audit Tool Descriptions

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

No tool input, output, error or behaviour changes (FR-022). The entities below are the published texts this feature rewrites, plus the two artefacts it adds: the reviewer record and the audit report.

## E1: Published surface (collected, never stored)

`collectPublishedSurface()` (`src/tools/_description-audit.ts`) builds it from the live server: a v2 client lists the tools of `createServer({ registerSignalHandlers: false, env: {} }).buildMcpServer()`.

The empty `env` is deliberate (analyze U1). The owner's `OBSIDIAN_MCP_*` access settings never shrink the audited surface, so the collector always measures the full default tool list: the largest list the server can publish (FR-014). This is the same principle that keeps the help index listing the full set whatever the owner's settings.

| Field | Source | Notes |
|---|---|---|
| `tools[]` | `tools/list` | Each entry has `name`, `description`, `inputSchema`, `outputSchema?` and `annotations`. |
| `instructions` | `client.getInstructions()` | Built by `buildInstructions(offered)`. |
| `indexText` | `docs/tools/index.md`, as `help()` returns it | Read from `DOCS_DIR`. |
| `helpPageCount` | `listToolPages(DOCS_DIR).length` | Feeds the report's tool-count guard (E10). |

## E2: Up-front description (per tool)

| Rule | Check | Kind |
|---|---|---|
| length ≤ 400 | `description.length` | computed (standing test and report) |
| sentence 1 states what the tool does | first sentence (E4) | reviewer |
| sentence 2 names every sibling in the tool's families | backticked names vs the family roster (E6) | computed in report only (D9); the contradiction part is reviewer |
| data-loss caveat kept where it applies | text | reviewer |
| file-type sentence kept where `describeSupport` was used | `_file-type-support.test.ts:75` | existing test |
| no internal identifiers | patterns (E8) | computed (standing and report) |
| no history, no internal vocabulary | text | reviewer ("self-contained") |
| no "call help(", "specific mode", "display name" or "preview first" | `_surface.test.ts` `FORBIDDEN_IN_DESCRIPTIONS` | existing test |

**Total**: the sum of all `description.length` must be ≤ 12,000 (standing test and report header).

## E3: Parameter and output descriptions

These are every `description` key at any depth of `inputSchema` and `outputSchema`, including root descriptions.

- They are not budgeted (Clarification Q1).
- They must contain no internal identifiers (E8).
- They may gain at most one sentence stating an input rule moved out of the tool's description (FR-004a).
- Parameters whose descriptions are pinned by exact or prefix equality must not gain a sentence without an approved test edit (research F5).

## E4: First sentence

`firstSentence(description)` is the prefix up to and including the first `.` that is followed by whitespace or ends the string. A description with no such `.` is its own first sentence.

## E5: Help index entry

- **Line form:** `- **<name>** — <text>`, matched by `/^- \*\*([^*]+)\*\* — (.*)$/m`. The prefix is the one `docs-sync.test.ts` already parses.
- **Rule:** `<text>` must equal `firstSentence(description)` for that tool, with one entry per offered tool. `docs-sync.test.ts` already guards duplicates, missing entries and extra entries.
- **Header:** the two header lines stay as they are, and the identifier scan covers them.

## E6: Family roster (constant `FAMILIES`)

| Key | Members |
|---|---|
| `text-search` | `search`, `context_search`, `pattern_search` |
| `frontmatter-property` | `read_property`, `set_property`, `find_by_property`, `properties` |
| `metadata-search` | `find_by_property`, `tag` |
| `reading` | `read`, `read_heading`, `read_property` |
| `note-writers` | `write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`, `find_and_replace` |
| `file-operations` | `move`, `rename`, `delete` |
| `folder-listing` | `files`, `paths` |
| `note-structure` | `links`, `backlinks`, `outline` |
| `smart-connections` | `smart_connections_query`, `smart_connections_similar` |
| `active-file` | `get_active_file`, `open_file` |
| `bases` | `bases`, `views_base`, `query_base`, `create_base` |

- **Siblings of a tool:** the union of the other members of every family that contains it. For example, `read_property` has `read`, `read_heading`, `set_property`, `find_by_property` and `properties`.
- **No family** (family check N/A): `help`, `vaults`, `obsidian_exec`.
- **Roster changes:** `metadata-search` is added beyond FR-015's minimum because the routing line "Find notes by metadata: `find_by_property`, `tag`" pairs them. FR-015's link-graph family is renamed `note-structure` to match the routing line "A note's headings and links".

## E7: Shared-field roster (constant `SHARED_FIELDS`)

`vault`, `target_mode`, `file`, `path`, `folder`, `case_sensitive`, `total`, `limit`.

The report appendix lists, for each field, every distinct description text and the tools that carry it. Some differences are already decided (ADR-046: the `case_sensitive` defaults; the `limit` ranges). These pass the reviewer check when the parameter description states the tool's own default or range.

## E8: Internal-identifier patterns (constant `INTERNAL_ID_PATTERNS`)

| Id | Pattern | Scope |
|---|---|---|
| P1 | `\b(?:BI\|FR\|NFR\|SC\|ADR\|TC)-\d+[a-z]?\b` | whole text |
| P2 | `\bUS\d+\b` | whole text |
| P3 | `\bT\d{3}\b` | whole text |
| P4 | `\bspecs? \d{3}\b` (case-insensitive) | whole text |
| P5 | `\bper spec\b` (case-insensitive) | whole text |
| P6 | `\bBI\b` | whole text |
| P7 | `\b[ABDQR]\d{1,2}\b` | outside `` `…` `` spans and `"…"` strings |

`findInternalIds(text)` returns `{ pattern, match, index }[]`.

## E9: Reviewer judgement record (`src/tools/_description-audit-record.json`)

```text
{
  schemaVersion: 1,
  tools: {
    <toolName>: {
      descriptionFingerprint: <sha256 hex of the published description>,
      schemaFingerprint:      <sha256 hex of canonicalJSON(inputSchema)>,
      checks: {
        purpose | safety | detail | selfContained | family | sharedFields:
          { verdict: "PASS" | "PARTIAL" | "FAIL" | "N/A", gap?: string }
      }
    }
  },
  routing: { <routing line text, exactly as published>: { verdict, gap? } }
}
```

Validation, by zod `descriptionAuditRecordSchema`, strict:

- `verdict` is one of the four values.
- `gap` is required and non-empty when `verdict` is `FAIL` or `PARTIAL`. It is allowed, but optional, on `PASS` and `N/A`, as a note such as a possibly stale claim (analyze I2; spec edge case on stale claims).
- Both fingerprints are 64 lowercase hex characters.
- Unknown keys are rejected.

**When a verdict needs review**, for each tool:

| Record state | Displayed |
|---|---|
| no entry | every judgement cell shows `NEEDS REVIEW (not recorded)` |
| either fingerprint differs from the live one | every judgement cell shows `NEEDS REVIEW (was <verdict>)` |
| both fingerprints match | the recorded verdict |

A family or shared-field cell that is computed (D9) overrides the record.

A routing line with no record entry, or whose text changed, shows as `NEEDS REVIEW`.

## E10: Audit report (Markdown on stdout)

1. **Title:** `# Tool description audit: <version> (<short sha>, <branch>), <YYYY-MM-DD>`.
2. **Summary list:**
   - registered tool count, measured with empty access settings (E1). It is checked against the number of help pages (`listToolPages(DOCS_DIR)`): PASS when they are equal, FAIL otherwise. This tool-count guard catches a shrunken or partial surface;
   - per-tool budget (400);
   - total budget (12,000) and the measured total, with a PASS or FAIL verdict;
   - help pointer in the instructions: PASS or FAIL;
   - help pointer in the `help` description: PASS or FAIL;
   - internal identifiers in the instructions and the index header: PASS or FAIL;
   - count of cells needing review.
3. **Matrix:** one row per registered tool, in `tools/list` order sorted by name. Columns: `Tool | Purpose | Budget | Safety | Detail | IDs | Self-contained | Family | Shared fields | Index`. Each cell holds `PASS`, `PARTIAL`, `FAIL`, `N/A` or `NEEDS REVIEW (…)`. The Budget cell also shows the length, for example `PASS (312)`.
4. **`## Gaps`:** one `### <tool>: <check> (<verdict>)` heading and its gap paragraph for every FAIL or PARTIAL, recorded or computed.
5. **`## Notes`:** one `### <tool>: <check> (<verdict>)` entry with its note for every PASS or N/A cell whose record carries `gap` text, such as a possibly stale claim kept on the help page. The Gaps section is the minimum, not a cap: no recorded `gap` text is ever dropped.
6. **`## Routing walk-through`:** a table with one row per published routing line and its verdict.
7. **`## Shared-field descriptions`:** for each field in E7, its distinct descriptions with the tools that carry each.

**Invariants:**

- The number of matrix rows equals `tools.length`.
- Every row has exactly 9 verdict cells.
- Every FAIL or PARTIAL cell has a Gaps entry.
- Every other cell with recorded `gap` text has a Notes entry.
