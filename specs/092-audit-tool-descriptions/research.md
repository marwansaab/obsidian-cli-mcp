# Research: Audit Tool Descriptions

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-04 | **HEAD**: `ca36d07`

All measurements below come from the published surface as a client sees it: a v2 client lists the tools of a freshly built `createServer().buildMcpServer()` over the in-memory transport (`connectInMemoryClient`, the same path `fingerprintLiveRegistry` uses). Nothing here needed the Obsidian CLI, so the test-execution gate in `.memory/test-execution-instructions.md` does not apply: no probe touched a vault.

## Findings

### F1: Sizes today

- 35 tools are registered in the default configuration, and no configuration registers more. Read-only mode only removes tools.
- Their top-level descriptions total **62,067** characters.
- Only 4 are at or under 400: `delete` 216, `help` 249, `obsidian_exec` 261 and `read` 392. `rename` (429) and `read_property` (407) are close.
- The longest are `find_and_replace` 4,046, `pattern_search` 3,484, `open_file` 3,348 and `get_active_file` 3,104.
- The server instructions are **1,996** characters. Both `instructions.test.ts:61` and `server.protocol.test.ts:90` require fewer than 2,000.

### F2: Internal identifiers in published text

I scanned every top-level description, every `description` key at any depth of every `inputSchema` and `outputSchema`, the server instructions and `docs/tools/index.md`. Hits:

| Where | Identifiers |
|---|---|
| `get_active_file` description | `ADR-003`; "eval cohort" |
| `tag` description | `BI-0134`, `ADR-031`, "B1 falsified" |
| `properties` input root description | `BI-041`, `FR-011` |
| `query_base` input root description | `BI-041` ×2, `FR-006`, `FR-007`, `FR-008` |
| `read_property` input root description | `BI-041`, `FR-010` |
| `search` input root description | `BI-0086` ×2, `FR-009`, `SC-004`, "Assumption A10", "a new BI" |
| `docs/tools/index.md` | `BI-047`, `ADR-009`, `FR-005b`, `FR-006a`, "spec FR-007", "spec 078", "the 2026-05-17 Q1 clarification", "per Q2" |
| server instructions | none |
| any `outputSchema` description | none |

Some identifier-shaped tokens are public and must not be reported: `UTF-8`, `UTF-16` and `V8` appear in nine published texts. No `TC-`, `US`, `T0nn` or `R`/`D` research labels appear anywhere today.

Version-history and internal-vocabulary phrases (FR-006):

- **Index:** "an earlier version of this entry said" ×2, "lowered from 24576 in BI-047", "used to accept", "eighteenth" / "sixteenth typed-tool wrap", "cohort divergence", "wrapper-side".
- **Descriptions:** "wrapper-side" (`files`), "eval cohort" (`get_active_file`), "Residual limitation" and "B1 falsified" (`tag`).
- **Input root descriptions:** "the previously-documented … claim was incorrect" (`properties`).

### F3: Existing tests that read description text

A read-only sweep of every `*.test.ts` found 399 assertion rows that read a description, the instructions or the index. When each description is cut to at most 400 characters:

- **NEUTRAL (208):** pass whatever the text says, for example `toBe(SAME_CONSTANT)` or a `not.toMatch` the short text cannot trigger.
- **LIKELY-KEEP (38):** assert what a short description will still say: the tool's own name, a sibling's name, the trash / irreversible caveat, link rewriting.
- **WILL-FAIL-LENGTH (9):** a lower bound on description length:
  - `>= 400` on `bases:46`, `create_base:46` and `views_base:52`;
  - `> 300` on `find_and_replace:31`, `get_active_file:41`, `open_file:43`, `pattern_search:60` and `query_base:80`;
  - `> 200` on `backlinks:32`.
- **WILL-FAIL-DETAIL (110):** assert a detail that moves out of the description: result shapes, error-code rosters, cap numbers, the closed-vault note, deprecated-name lists, cross-vault rules. For most of them the same phrase is already on the tool's help page. The rest have no verbatim copy there.
- **Instruction and index pins:** `instructions.test.ts:93` pins the help line verbatim ("`help` holds each tool's long reference"). `docs-sync.test.ts:79` reads only the `- **<name>** —` prefixes of index entries, never the text after the dash.

Refactor-decisions item 5 forbids editing existing tests without an enumerated, owner-approved list, so the approval request is [contract §X](contracts/description-audit-contract.md#x-existing-test-edits-owner-approval-required). Two more existing tests are affected:

- `search/schema.test.ts:25` counts the string `strict-rich pathway only, per BI-0086` (F2 says `BI-0086` must go). Its regex must drop the identifier.
- `_surface.test.ts:162` expects exactly `["views_base"]` to mention `not-open`.

### F4: Shared sentences inside descriptions

- **`describeSupport(X_SUPPORTED)`** (`src/file-type/file-type.ts:89`): 16 descriptions end with its sentence. Two forms: "Works on any file type (notes, canvases, bases, attachments and others)." (72 characters, on `move`, `rename`, `delete` and `open_file`), or "Supported file types: …." (28 to 49 characters).
  - ADR-044 decision 1 makes this sentence the published half of each tool's support declaration.
  - The instructions rule "Descriptions name exceptions." points at it.
  - `_file-type-support.test.ts:75` pins it in all 16 descriptions.
- **`closedVaultNote(command)`** (`src/tools/_shared.ts:41`): about 380 characters, used in 9 descriptions (`bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag`, `views_base`).
  - On its own it nearly fills the 400 budget.
  - ADR-045 decision 2 says "the six descriptions say so through one shared sentence … and the six reference pages carry a vault-unavailable row". All 9 help pages already contain `Command "<cmd>" not found`. `tag.md` lacks "opened automatically".
- **`BYTES_WRITTEN_DESCRIPTION`** and **`BASE_PATH_DESCRIPTION`**: output and parameter descriptions only, untouched.

### F5: Visible input rules that live only in tool descriptions

The constitution (MCP Tool Surface Standards, "Visible input rules") requires rules that JSON Schema can express to be published, either in the schema or in the description of the parameters they constrain. Several descriptions state such rules today, for example `find_and_replace`'s single-note scope exclusivity and `set_property`'s "`date` / `datetime` require an explicit `type`".

Cutting a rule from the description without restating it in the constrained parameter's description would break that standard. These parameter descriptions are pinned by exact equality or prefix, so a moved rule cannot be appended to them without a test edit:

- `find_by_property`: `name`, `case_sensitive`;
- `find_and_replace`: `case_sensitive`, `folder`;
- `create_base`: `base_path`, `view_name`;
- `query_base`: `base_path`.

### F6: Instruction headroom

- The help line `- \`help\` holds each tool's long reference: examples, error codes and recovery hints.` is 84 characters.
- The replacement in D4 is 85 characters, so the instructions go from 1,996 to 1,997, under the 2,000 limit.
- A line keeps its place only if every backticked word in it is an offered tool name (`offered()`, `src/instructions/instructions.ts:40`; refactor-decisions item 27(d)). The new line can therefore backtick only `help`, and no parameter name.

### F7: Running TypeScript scripts

`npm run baseline:write` runs `node scripts/write-register-baseline.ts` (Node ≥ 22.11 type stripping). Node cannot resolve the project's `.js`-on-`.ts` import specifiers, so the script writes a temporary vitest file under `src/tools/`, runs it, and reads back a JSON dump (the script header explains why). An audit command that needs the live tool list hits the same constraint.

### F8: Test-support modules and `dist/`

`tsconfig.build.json` excludes `src/tools/_register-baseline.ts` and the fixture globs from the build. Refactor-decisions item 30 explains why a non-production module imported by a script must be listed by name.

## Decisions

### D1: Description shape

- **Sentence 1** says what the tool does and reads on its own. It becomes the help-index entry.
- **Sentence 2** says when to choose the tool, naming every sibling from its families in backticks.
- **Optional caveat.** A data-loss statement or a default that widens reach (FR-002), kept as short as possible.
- **File-type sentence.** Kept wherever it exists today (F4, ADR-044), last.
- **Everything else moves out** (FR-003):
  - result shapes, caps, error codes, cross-vault routing, closed-vault behaviour, deprecated-name lists and examples go to the help page;
  - an input-combination rule goes into the constrained parameter's description, at most one sentence (FR-004a, F5).

The full rules are in [contract §S](contracts/description-audit-contract.md#s-description-rules).

- *Rationale:* this fits FR-001 to FR-004a, the 400 budget and ADR-044. The largest sibling list (5 names) costs about 90 characters.
- *Rejected:* dropping the file-type sentence. It saves at most 72 characters per tool but breaks ADR-044 decision 1, the instructions rule "Descriptions name exceptions." and 16 pinned assertions.

### D2: The closed-vault note — RULED A (owner, 2026-11-04; Amendment 2026-11-04 on ADR-045)

**Decided: move it to the help pages and retire the shared helper.** Each of the 9 help pages states the vault-unavailable answer (`Error: Command "<cmd>" not found.`, an uncoded `CLI_REPORTED_ERROR`) and that a closed registered vault is opened automatically. The rest of ADR-045 stands: the error is unchanged, with no `details.code` or `details.reason`, recognised by `COLD_START_PATTERN`.

- The 9 descriptions drop `closedVaultNote(...)`. All 9 help pages already carry the vault-unavailable answer, and `tag.md` gains its "opened automatically" sentence.
- `closedVaultNote` and its `_shared.test.ts` block are deleted, since nothing in production calls it any more.
- The 9 tests that pin it in the description assert instead that the help page contains `Command "<cmd>" not found.`.
- ADR-045 decision 2 then says the reference pages carry the note and the descriptions do not. This is an amendment the owner adds to the vault ADR.
- *Rationale:* this is failure behaviour (FR-003), and at about 380 characters it cannot share a 400-character description with a purpose sentence.
- *Alternatives:*
  - (B) A shortened shared sentence of about 170 characters kept in the 9 descriptions, which keeps ADR-045 as written. It costs about 40% of each budget for edge-case behaviour.
  - (C) One cross-cutting line in the server instructions. There is no headroom (F6) without cutting other lines.

### D3: Internal-identifier patterns

Applied to the whole text:

- prefixed codes `\b(?:BI|FR|NFR|SC|ADR|TC)-\d+[a-z]?\b`;
- `\bUS\d+\b`;
- `\bT\d{3}\b`;
- `\bspecs? \d{3}\b`;
- `\bper spec\b`;
- the bare word `\bBI\b`.

Applied only outside backtick code spans and double-quoted strings, so example text such as a heading `"Q1 Goals"` is not reported (spec edge case, FR-007):

- one-letter labels `\b[ABDQR]\d{1,2}\b` (clarification, assumption, research and decision labels, such as "Q1", "B1", "A10").

`UTF-8`, `UTF-16`, `V8`, ISO dates and every error code fall outside all patterns. Each pattern has positive and negative unit rows ([contract §T](contracts/description-audit-contract.md#t-new-test-rows)).

- *Rejected:* a broad `[A-Z]+-?\d+` pattern with an allow-list. It flags `UTF-8`, and every future public token would need an allow-list edit.

### D4: Help pointer wording

The instructions rule becomes:

`- \`help\` with a tool's name returns its full contract; with none, it lists every tool.`

It is 85 characters (F6), names no tool other than `help` (FR-008), and covers every tool.

`HELP_DESCRIPTION` becomes a description whose first sentence says it returns any registered tool's full contract by name, or the index with no arguments (FR-009). It keeps the existing `{ tool_name: "help" }` sentence, which `help/index.test.ts:11` pins, and avoids the forbidden "call help(" pattern. The text is in [contract §I](contracts/description-audit-contract.md#i-instructions-and-help).

### D5: Help index format

- Each entry is `- **<name>** — <first sentence>`. The first sentence is the description up to and including the first `.` that is followed by whitespace or ends the text. The header lines stay.
- Writers must not put an abbreviation such as "e.g." or "i.e." in sentence 1. The standing check catches it, because the entry then no longer matches.
- `help` still returns the file byte-for-byte. Equality is a test (Clarification Q2), not a runtime build.

### D6: One module for the audit, outside `dist/`

- `src/tools/_description-audit.ts` holds the budgets, the family and shared-field rosters, the identifier patterns, the pure checks and the Markdown renderer, plus `collectPublishedSurface(deps?)`. That function lists the live tools, instructions and index the way `fingerprintLiveRegistry` does, with an injectable `buildMcpServer`.
- It is added by name to `tsconfig.build.json`'s exclude list (F8).
- The standing checks (`src/tools/_description-quality.test.ts`) and the audit command both use it, so the two cannot disagree.
- *Rationale:* this is the `_register-baseline.ts` precedent. Like that module it imports `../server.js` and `_mcp-client-fixtures.js`, and it is not production code. Its callers are a test and a script, which is the expected shape for a test-support module, not an orphan.

### D7: The audit command

- `npm run audit:descriptions` runs `node scripts/audit-descriptions.ts` and prints the Markdown report to stdout. The maintainer redirects it to a file to file it.
- The script reads the version from `package.json` and the short SHA and branch from git, then runs a temporary vitest dumper (F7). The dumper calls `collectPublishedSurface()` and `renderAuditReport(surface, record, meta)` and writes the Markdown to a scratch file, which the script prints.
- The script's vitest-runner code (write a temporary test, spawn `npx vitest run`, read the dump, clean up) moves out of `scripts/write-register-baseline.ts` into `scripts/_vitest-dump.ts`, and both scripts use it. *Verification:* `npm run baseline:write` on an unchanged tree must produce a byte-identical `_register-baseline.json`, checked before any description changes.
- *Rejected:*
  - copying the runner into the new script, which makes a second copy of the same spawn and cleanup logic;
  - a vitest test that writes the report as a side effect, which would make `npm test` write files.

### D8: Reviewer judgement record

- `src/tools/_description-audit-record.json` is hand-kept JSON, parsed with a zod schema in `_description-audit.ts` (Principle III at the file boundary).
- Each tool entry holds:
  - `descriptionFingerprint` and `schemaFingerprint` (sha256 of the published description and of the canonical `inputSchema`, both reusing `sha256` / `canonicalJSON` from `_register-baseline.ts`);
  - one verdict, plus an optional `gap`, for each of the six judgement checks.
- A separate `routing` map keyed by routing-line text holds the SC-008 walk-through.
- **When a verdict needs review:** if the fingerprint of the description, or of the input schema, differs from the recorded one, every judgement verdict for that tool shows as "needs review". A missing tool entry or routing line does too.
- *Rationale:* FR-021a. The schema fingerprint is included because the shared-field and visible-rule judgements read parameter descriptions.
- An invalid record (zod failure) fails the audit command with the zod issue list. It never fails `npm test`, apart from the unit rows that parse fixtures (Clarification Q4).

### D9: Mechanical vs judgement checks per report column

| Column | Source |
|---|---|
| Purpose and when-to-use | reviewer |
| Per-tool budget | computed: ≤ 400 |
| Safety caveat kept | reviewer; may be N/A |
| Detail preserved on help page | reviewer |
| No internal identifiers | computed over the description, every `inputSchema` / `outputSchema` description, and the tool's index entry |
| Self-contained | reviewer |
| Family consistency | computed N/A for a tool in no family; computed FAIL listing missing sibling names when a member does not name every other member; otherwise reviewer |
| Shared-field consistency | computed N/A when the tool has none of the roster fields; otherwise reviewer, aided by the report's per-field appendix of distinct descriptions |
| Help index agreement | computed: entry equals first sentence |

The server-level rows, total budget, the help pointer in the instructions and in `help`'s description, and identifiers in the instructions and the index header, are computed in the report header.

- The family "names siblings" computation is report-only, not a standing test. This follows Clarification Q4: a feature that adds a tool to a family should not have to edit every sibling's description mid-cycle.

### D10: Test edits

The owner approved the rule-based edit list in contract §X as written (plan question 1, Option A, 2026-11-04, recorded on BI-0027), including its stop rule:

- Only the listed edits may be made.
- Any other failing existing assertion stops the work and goes back to the owner.
- The 38 LIKELY-KEEP assertions are satisfied by the wording of the descriptions, never by editing the tests.

## Follow-ups (not this feature)

- Help pages still contain internal identifiers ("help page wording beyond the checks" is out of scope).
- The input root descriptions of `properties`, `query_base`, `read_property` and `search` are long reference blocks inside the schema. This feature removes only their identifiers and history. Shortening them is a separate question, because the owner's budget ruling counts only top-level descriptions.
- `tsconfig.build.json` already excludes the test-support modules; refactor-decisions item 30 is otherwise closed.
