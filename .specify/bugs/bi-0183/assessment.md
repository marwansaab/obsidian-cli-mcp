# Bug Assessment: pattern_search applies `limit` before its documented sort

- **Slug**: bi-0183
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0183, filed 2026-11-03; evidence from TC-00821 on `@marwansaab/obsidian-cli-mcp@0.9.0-local`)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Condensed from the pasted BI-0183 text:

> `pattern_search` documents its results as sorted by `(path, line, offset)` ascending and `limit` as a cap on the `matches` array, so a caller reads a capped result as the first N matches. Instead the cap is applied before the sort, to Obsidian's own emission order, and the survivors are then sorted. This is the same slice-before-sort class already fixed for `search` / `context_search` (BI-0084, BI-0124) and for `smart_connections_query` (BI-0167). Harms: (a) a small `limit` used to sample or preview matches returns an arbitrary subset that looks like the top of the list; (b) raising the limit does not extend the earlier result, so paging logic sees results change; (c) `pattern_search` disagrees with `search` and `context_search` on what a capped result means. `truncated: true` is still set correctly. Workaround: request a large `limit` and slice client-side.
>
> Evidence: in `My-Setup-Vault`, `pattern_search` `^id: BI-01[0-9][0-9]$` over the backlog folder returned 72 matches sorted by path, starting BI-0103 … BI-0107. The same call with `limit: 5` returned `truncated: true` and BI-0177, BI-0178, BI-0180, BI-0181, BI-0182: five entries from the end of the path order, with BI-0179 skipped, so not even a contiguous block. TC-00821 records the failure.

Acceptance criteria (summarised from the report's "Expected behaviour" section):

1. With 72 matches in total and `limit: 5`, the 5 results are the first 5 of the full ordered list, in the same order.
2. For any limit smaller than the total, no match that sorts earlier than a returned match is missing.
3. For limits N < M, the N results equal the first N of the M results, in the same order.
4. `truncated: true` is present when the total exceeds the limit, and absent when it does not.

Out of scope (per the report): how patterns are matched or which notes are searched; the default or maximum limit; paging or offset controls; other search tools.

## Symptom

When the full match set is larger than `limit`, `pattern_search` returns `limit` matches taken in whatever order `app.vault.getMarkdownFiles()` lists the notes, and only then sorts them by `(path, line, offset)`. The response looks like the top of the sorted list but is an arbitrary subset of it. Expected: the first `limit` matches of the full set in `(path, line, offset)` order, with `truncated: true` when matches were left out.

## Reproduction

1. In a vault where a folder's notes produce more matches than a chosen `limit` (the report used `My-Setup-Vault`, the backlog folder, pattern `^id: BI-01[0-9][0-9]$`, 72 matches), call `pattern_search` with no `limit`. The matches come back sorted by path, starting with the lowest paths (BI-0103 …).
2. Call it again with `limit: 5`. The response carries `truncated: true` and five matches that are not the first five of step 1 (the report saw BI-0177, BI-0178, BI-0180, BI-0181, BI-0182).

No live reproduction was run for this assessment. The report's TC-00821 evidence is concrete, and the code below shows the defect directly: the cap is enforced inside the eval template, while it walks files in `getMarkdownFiles()` order, and the handler sorts afterwards. The order `getMarkdownFiles()` returns is Obsidian's internal file-map order, not path order. That explains the non-contiguous block in the report: notes created or touched recently sit at the end of the map. The fix's live check (`/speckit-bug-test`) should run against the authorised test vault per `.memory/test-execution-instructions.md`.

## Suspected Code Paths

- `src/tools/pattern_search/_template.ts:9`: `const files=app.vault.getMarkdownFiles().filter(...)`. The file list is not sorted, so the scan order is Obsidian's map order.
- `src/tools/pattern_search/_template.ts:11-23`: the scan loop pushes matches into `out` and stops at `if(out.length>=cap){truncated=true;break outer;}`. The cap (`a.limit`, the handler's `appliedCap`) is applied in scan order. This is the root cause.
- `src/tools/pattern_search/handler.ts:39-47` `executePatternSearch()`: passes `limit: appliedCap` (default `DEFAULT_CAP = 1000`) into the template payload.
- `src/tools/pattern_search/handler.ts:92-99`: filters to `.md`, sorts the already-capped survivors with `comparePatternSearchMatch` (`handler.ts:102-107`), and echoes the template's `truncated`. Sorting here cannot recover matches the template already dropped.
- `src/tools/pattern_search/index.ts` (`PATTERN_SEARCH_DESCRIPTION`) and `docs/tools/pattern_search.md:49,79`: document `limit` as "caps the response `matches` array" and the sort as `(path, line, offset)` ascending. Neither says which matches survive a cap. `.docs-as-code/capabilities/search-and-discovery.md:131-136` claims that truncated results for `search`, `context_search`, `pattern_search` and `backlinks` are "the **first N of a deterministic sort of the full match set**". For `pattern_search` that claim is currently false.
- References for the correct pattern: `src/tools/search/handler.ts:127-130` (filter → precise truncation → sort → slice) and `src/tools/search/line-matches.ts:23-39` `selectLines()` (sort → slice), both from BI-0084 / BI-0124; and `src/tools/_smart-connections.ts` `SORT_SLICE_AND_EMIT` (sort before slice inside an eval template), from BI-0167.

## Root Cause Hypothesis

The eval template enforces `limit` while it scans, and it scans notes in the order `app.vault.getMarkdownFiles()` returns them. That order is not path order. Once `limit` matches have been collected, the scan stops, and every later note in map order is never read, even if its path sorts first. The handler then sorts only the survivors, so the response is ordered but not the leading slice. Within one note, the scan already emits matches in `(line, offset)` ascending order (lines in order; `re.exec` advances `lastIndex`). So the only missing step is sorting the note list by path before the scan. Confidence: **high**. The code shows the defect directly, and it explains the report's observation of trailing, non-contiguous entries.

## Proposed Remediation

**Preferred**: sort the file list by path inside the template before the scan loop, using the same UTF-16 code-unit comparison as `comparePatternSearchMatch` (`a.path<b.path?-1:a.path>b.path?1:0`). Then the in-template cap keeps exactly the leading `limit` matches of the full `(path, line, offset)` order. This works because (a) paths are unique, (b) matches within a note are already emitted in `(line, offset)` order, and (c) the scan visits notes in path order. The early exit stays, so the template still reads only as many notes as it needs and the output stays bounded by `limit`. That matters for `CLI_OUTPUT_TOO_LARGE` (10 MiB) and the 10-second typed-tool timeout. Truncation detection stays exact: `truncated` is set only when a further match exists past the cap (`out.length>=cap` checked before each push). That meets acceptance criterion 4. The handler's `.md` filter and sort can stay as defensive steps: the sort is now a no-op on a correctly ordered envelope, and it keeps the response contract independent of the template. The change is confined to one line of `_template.ts`, plus its header comment.

**Alternatives**:
- *Return every match from the template and sort/slice in the handler* (the `search` / `context_search` shape). The cap and truncation would live in TypeScript next to the sort. Trade-off: the template could no longer stop early, so a broad pattern over a large vault would scan every note and serialise every match. That risks `CLI_OUTPUT_TOO_LARGE` and `CLI_TIMEOUT` in cases where a small `limit` succeeds today. Rejected for that reason.
- *Collect all matches in the template, then sort and slice there* (the `SORT_SLICE_AND_EMIT` shape from `_smart-connections.ts`). Output stays bounded, but scanning still covers every note, with all matches held in memory, and no early exit. Sorting the file list first gives the same result with less work, so this alternative only adds cost.

**Files likely to change**:
- `src/tools/pattern_search/_template.ts`: sort `files` by path before the loop; update the header comment.
- `src/tools/pattern_search/_template.test.ts` (new): run the rendered template in the shared vm harness `runEvalTemplate` from `src/tools/_eval-template-fixtures.ts` (the standing rule in `.memory/refactor-decisions.md` item 45 says do not re-roll that harness), against a fake `app` whose `getMarkdownFiles()` returns notes out of path order.
- `src/tools/pattern_search/handler.ts`: header comment only, if its description of the stage order needs it. No logic change.
- Docs (handled in `/speckit-docs-as-code` after review, listed here for completeness): `docs/tools/pattern_search.md` and `PATTERN_SEARCH_DESCRIPTION` should say a capped result is the leading `limit` matches of the `(path, line, offset)` order. A wording change to the description shifts the tool-surface fingerprint baseline, a deliberate-change gate under the MCP Tool Surface Standards, so keep that edit deliberate or leave the description untouched.

**Tests to add or update**:
- Template vm test: notes returned by `getMarkdownFiles()` in reverse or shuffled path order, several matches per note and several per line. Assert that `limit: N` returns exactly the first N of the full sorted set, in order, for every N from 1 to total − 1 (the all-pairs N < M prefix check used for BI-0167: `page(n) == page(total).slice(0, n)`). This covers acceptance criteria 1–3.
- Truncation boundaries in the same suite: `limit` = total − 1 → `truncated: true`; `limit` = total and `limit` > total → `truncated` absent. This covers criterion 4.
- A cap that falls mid-note and mid-line (several matches on one line): the slice cuts between offsets of the same line and keeps the lower offsets.
- The existing `handler.test.ts` cases (sort invariant (27), truncation (10)–(12), response key invariant (28), read-only lock (34)) should pass unchanged. In particular, (34) asserts that `JS_TEMPLATE` contains no mutating API substrings; a `.sort(...)` on a local array is not one of them.

## Risks & Considerations

- **Performance**: sorting the note list costs O(F log F) path comparisons per call, which is small next to reading notes. The early exit now stops after the first `limit` matches in path order instead of map order. The number of notes read before stopping can differ from today in either direction, but stays bounded by the same `limit`.
- **Comparator parity**: the in-template comparison must be the same UTF-16 code-unit ordering as `comparePatternSearchMatch`, or the handler's sort would reorder a correctly capped set. Do not use `localeCompare`, which applies locale collation. The vm test above pins this.
- **API surface**: response shape, input schema and error codes do not change. Only which matches survive a cap changes, from arbitrary to the documented leading slice. No kernel node is touched. No new error code.
- **Fingerprint baseline**: only affected if `PATTERN_SEARCH_DESCRIPTION` is reworded. The template is not part of the published schema.
- **Template tests**: no existing test asserts the full `JS_TEMPLATE` string byte for byte (only substring checks in (34)), so the change does not break a recorded-argv fixture. Verify with the suite run.

## CodeGraph structural check

- **Affected module**: `src/tools/pattern_search/` only. `JS_TEMPLATE` (`_template.ts`) is used by `executePatternSearch` (`handler.ts`) and by `handler.test.ts`. `executePatternSearch` is called only from `createPatternSearchTool` (`index.ts`). `comparePatternSearchMatch` has one caller, `executePatternSearch`.
- **Blast radius**: confined to the `pattern_search` tool. No other tool imports `pattern_search`'s template or handler. The handler's one cross-tool import (`stripBoundarySlashes` from `../search/handler.js`) is unaffected. The reference implementations (`search/handler.ts`, `search/line-matches.ts` `selectLines`, `context_search/handler.ts`, `_smart-connections.ts`) are read for precedent only and do not change.
- **Kernel nodes**: the fix touches **none** of the kernel nodes. `createLogger()`, `createQueue()` and `createServer()` are not touched. `UpstreamError` keeps its existing uses in `handler.ts`, with no new code, no new `details.code`, and no change to any throw site. The post-fix verification checks against this claim.

## Open Questions

None. The report fixes the expected behaviour, and the preferred fix needs no design choice that conflicts with an ADR or a standing rule in `.memory/refactor-decisions.md`.

Resolved (Relay): settled before the fix with no questions to ask. The assessment has no `[NEEDS CLARIFICATION]` items and no open questions. The remediation is a repair: it makes the existing `limit` and sort contract hold, and adds no behaviour, parameter or public surface beyond what the report expects. Root cause, remediation, files and tests stand as written above.
