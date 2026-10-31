# Research: Omit Derived Labels

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-31

All Technical Context unknowns are resolved. The only open items are the implement-time verification gates in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

## T0 evidence (plan-time probe, 2026-10-31)

A read-only probe dumped `app.metadataCache.getFileCache(file).{frontmatterLinks, links, embeds}` (fields `link`, `original`, `displayText`) for a fixture note holding every shape the spec names. It ran against `TestVault-Obsidian-CLI-MCP` through `Obsidian.com eval`, as `.memory/test-execution-instructions.md` requires. The fixture lived under `Sandbox/p071/` and was removed afterwards; `Welcome.md` was untouched. Raw output: [contracts/t0-cache-shapes.json](contracts/t0-cache-shapes.json).

| Source text | `link` | `displayText` (cache) | Reported today | Spec says |
|---|---|---|---|---|
| `[[Tgt#Head]]` | `Tgt#Head` | `Tgt > Head` | `Tgt > Head` | absent |
| `[[Tgt#^blk]]` | `Tgt#^blk` | `Tgt > ^blk` | `Tgt > ^blk` | absent |
| `[[Tgt#H1#H2]]` | `Tgt#H1#H2` | `Tgt > H1 > H2` | `Tgt > H1 > H2` | absent |
| `[[#Local]]` | `#Local` | `Local` | `Local` | absent |
| `[[#^lb]]` | `#^lb` | `^lb` | `^lb` | absent |
| `![[Tgt#Head]]` | `Tgt#Head` | `Tgt > Head` | `Tgt > Head` | absent |
| `![[Tgt#^blk]]` | `Tgt#^blk` | `Tgt > ^blk` | `Tgt > ^blk` | absent |
| `![[paper.pdf#page=3]]` | `paper.pdf#page=3` | `paper.pdf > page=3` | `paper.pdf > page=3` | absent |
| frontmatter `"[[Tgt#Head]]"` | `Tgt#Head` | `Tgt > Head` | `Tgt > Head` | absent |
| `[[Tgt#Head\|Custom Display]]` | `Tgt#Head` | `Custom Display` | `Custom Display` | `Custom Display` |
| `[[Tgt#^blk\|Other Label]]` | `Tgt#^blk` | `Other Label` | `Other Label` | `Other Label` |
| `![[Tgt#Head\|Emb Alias]]` | `Tgt#Head` | `Emb Alias` | `Emb Alias` | `Emb Alias` |
| `[[Tgt#Head\|Tgt > Head]]` | `Tgt#Head` | `Tgt > Head` | `Tgt > Head` | `Tgt > Head` |
| table `[[Tgt#Head\\|Tbl Alias]]` | `Tgt#Head` | `Tbl Alias` | `Tbl Alias` | `Tbl Alias` |
| `[[Tgt\|Alias]]` | `Tgt` | `Alias` | `Alias` | `Alias` |
| `![[img.png\|300]]` | `img.png` | `300` | `300` | `300` |
| `![[img.png\|300x200]]` | `img.png` | `300x200` | `300x200` | `300x200` |
| `[[Tgt#Head\|]]` | `Tgt#Head` | `""` | `""` | absent |
| `[[Tgt#Head\| ]]` | `Tgt#Head` | `""` | `""` | absent |
| `[[Tgt\|]]` | `Tgt` | `""` | `""` | absent |
| `[[Tgt#Head\|Tgt#Head]]` | `Tgt#Head` | `Tgt#Head` | absent | absent (unchanged) |
| `[[Tgt\|Tgt]]` | `Tgt` | `Tgt` | absent | absent (unchanged) |
| `[[Tgt]]` | `Tgt` | `Tgt` | absent | absent (unchanged) |
| `![[img.png]]` | `img.png` | `img.png` | absent | absent (unchanged) |
| `[Text](Tgt.md#Head)` | `Tgt.md#Head` | `Text` | `Text` | `Text` (unchanged) |
| `[](Tgt.md#Head)` | `Tgt.md#Head` | `""` | `""` | `""` (unchanged, out of scope) |
| `![alt](img.png)` | `img.png` | `alt` | `alt` | `alt` (unchanged) |

Findings:

- **F1**: Obsidian always fills `displayText`. When no alias is written it builds one from the link: `"<file> > <fragment…>"` for cross-note fragments, and the bare fragment for same-note fragments. The omit-when-equal transform from spec 025 (F6) therefore lets every fragment-bearing link through.
- **F2**: `original` holds the raw source span for every entry, frontmatter links included. Every author-written alias, including the table-escaped `\|` form, puts a `|` inside the brackets; no derived label comes with one. Wiki-link targets cannot contain `|`, so `original.includes('|')` is exactly "the author wrote the alias separator".
- **F3**: Obsidian trims aliases: a blank alias (`| `) is reported as `""`, like an empty one. Whether leading and trailing spaces are trimmed off a non-blank alias is gate G1 in the probe plan; the rule reports the cache value either way, as it does today.
- **F4**: Frontmatter links derive labels too, which contradicts the spec's original out-of-scope bullet. Clarified 2026-10-31: they are included.

## D1: Detect the alias from `original`, not from the label's shape

**Decision**: An entry written in wiki form (its `original` starts with `[[` or `![[`) gets `displayText` only when all three hold: `original` contains `|`, `displayText` is not `""`, and `displayText !== link`. Entries not in wiki form (Markdown links and images) keep today's rule unchanged: `displayText` is emitted when `displayText !== link`.

**Rationale**: FR-003 requires a source-based decision. F2 shows that `original` holds exactly the source fact needed, inside the same cache entry the template already reads, so no extra call or second parse is needed. Both other conditions keep the rules that already apply: `!== link` keeps the spec 025 omit-when-equal rule (`[[Tgt|Tgt]]` stays absent), and `!== ""` carries out the clarified empty or blank alias rule (FR-004a). The value emitted is still the cache's `displayText`, so plain aliased links come back byte-for-byte as they do today (FR-004).

**Alternatives considered**:
- *Match the `"X > Y"` shape* (the help page's current workaround): rejected. It drops a real alias written as `Tgt > Head`, which FR-003 and the edge case forbid, and it misses same-note fragments, whose derived label has no `>`.
- *Slice the alias text out of `original` and emit it raw*: rejected. Plain aliased links would then differ from today wherever Obsidian normalises the alias (F3, gate G1), which breaks FR-004. Parsing the separator, the table escape and the closing brackets again in the template only reimplements what Obsidian already did.
- *Gate only fragment-bearing entries (`link` contains `#`)*: rejected. The clarified empty-alias rule covers plain links too, and one condition for every wiki-form entry is simpler than a fragment test.

## D2: One rule for every wiki-form entry, wherever it comes from

**Decision**: The D1 rule runs inside the existing shared `wrap` function, so body links, body embeds and frontmatter links all go through it. Wiki form is recognised from `original` (`startsWith('[[')` or `startsWith('![[')`). This is the same field the `kind` synthesis already reads (spec 025 F4).

**Rationale**: Clarification Q3 includes frontmatter links, and Q1 covers every fragment and every embed. Keeping the rule in the one existing `wrap` function makes it uniform by construction, which leaves one decision point to test.

**Alternatives considered**: a separate wrap per cache array — rejected as needless duplication (the cache entries have the same `link`/`original`/`displayText` shape).

## D3: No schema, error or kind change

**Decision**: `linkEntrySchema` already declares `displayText` optional. The change emits that optional field less often, so the output schema, the eval-envelope schema, `kind`, `target`, `line`, sort order and `count` all stay as they are (FR-005). No error path is added or changed.

**Rationale**: Principle III (the schema stays the single source of truth for the published shape) and Principle IV (zero new codes) are met with no work.

## D4: Test the template's logic by executing it, not by mocking its output

**Decision**: Add a co-located test that runs the rendered `JS_TEMPLATE` in `node:vm` (`runInNewContext`, the harness `src/tools/_shared.test.ts` already uses) against a stub `app` whose `metadataCache.getFileCache` returns the probe's cache entries. The test asserts the emitted entries row by row against [data-model.md](data-model.md).

**Rationale**: The existing `handler.test.ts` cases feed ready-made envelopes through a mocked spawn, so they never exercise the template's `displayText` transform; that gap is how the derived-label defect shipped. Running the template against real cache shapes recorded in T0 covers the decision point itself, which Principle II and FR-008 require. The stub needs only `app.vault.getFiles`, `app.metadataCache.getFirstLinkpathDest` / `getFileCache`, `app.workspace.getActiveFile`, plus `TextDecoder`, `Uint8Array` and `atob` for the payload decode.

**Alternatives considered**: extract `wrap` into a TypeScript function and inject it into the template — rejected. The template is a frozen string run inside Obsidian; splitting it adds a build-time composition step for one function.

## D5: Surface text

**Decision**:
- `LINKS_DESCRIPTION`: replace the sentence "displayText is present only when the source carries an alias distinct from the link target." with the single rule from [contracts/display-label.md](contracts/display-label.md). It applies alike to links, embeds and frontmatter links, with no caveat.
- `docs/tools/links.md`: rewrite the `links[].displayText` row, removing the CAVEAT and the regex workaround (FR-006, FR-007); add a short "Display label rule" subsection with worked rows; update any example whose output changes.
- `npm run baseline:write` regenerates `_register-baseline.json`. Only `links`' `descriptionFingerprint` may move.
- Leave `docs/tools/index.md` and the server instructions alone: neither mentions the label rule.

**Rationale**: MCP Tool Surface Standards (the fingerprint baseline is a deliberate-change gate) and FR-006/FR-007. `.docs-as-code/` follows in the `/speckit-docs-as-code` pass after review, per CLAUDE.md.

## D6: Agents relying on the old workaround

**Decision**: No compatibility shim. The documented workaround (`target.includes("#") && / > /.test(displayText)`) stops matching once no derived labels are emitted, and the only false negative it could have produced (an author alias shaped like `X > Y`) is now reported correctly.

**Rationale**: The change narrows output toward the published contract. A caller that follows either the old or the new help gets correct results.
