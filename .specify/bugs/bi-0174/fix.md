# Bug Fix: help pages and tool descriptions disagree with live behaviour

- **Slug**: bi-0174
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The help pages, tool descriptions, input-schema field descriptions and server instructions now describe errors, messages, detail fields, recovery hints and section layout as the server returns them. Per the owner's Q1 ruling (option C), five tools now lift their documented schema-layer sub-codes into `details`; `views_base` and `obsidian_exec` get their own no-active-file advice, and `read` / `outline` drop "Nothing was changed." from their file-type rejection. New tests lock the heading rule, the 4,096-character description cap, the instructions exception, and each changed error.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/_validation-details.ts` | added | Shared `mapValidationError` lifts: `liftSubCodedIssue` (first custom issue with `params.code` → its params plus `details.issues`, the issue's own message) and `liftEmptyContent` (empty `content` → `details.code: "CONTENT_EMPTY"`). Both return `undefined` otherwise, so registerTool's generic envelope applies. |
| `src/tools/{patch_heading,patch_block,query_base}/index.ts` | modified | `mapValidationError: liftSubCodedIssue` (item 7). `query_base` sibling wording now says `create_base` adds an item note to an existing Base (item 10a). Unknown-vault wording in the two patch descriptions (item 4a). |
| `src/tools/append_note/index.ts` | modified | `mapValidationError: liftEmptyContent`; unknown-vault wording (item 4a). |
| `src/tools/prepend/index.ts` | modified | Existing hook now ends with `return liftEmptyContent(issues)` instead of hand-rolling the generic envelope (refactor-decisions item 44: migrate the hand-copied fallback when the file is touched). Output for every non-empty-content failure is byte-identical. |
| `src/tools/views_base/handler.ts` | modified | `listFocusedViews` rethrows `ERR_NO_ACTIVE_FILE` with the same code, cause and details and the message `No active file in Obsidian. Open a Base in Obsidian, or call views_base with base_path to name one.` (item 10e). |
| `src/tools/obsidian_exec/handler.ts` | modified | `executeObsidianExec` rethrows `ERR_NO_ACTIVE_FILE` with the same code, cause and details and the message `No active file in Obsidian. Open a note in Obsidian, or name the file in the command's own parameters (file= or path=) with vault.` (item 10e; owner ruling Q2 = A). The dispatch message is unchanged. |
| `src/file-type/file-type.ts`, `src/tools/{read,outline}/handler.ts` | modified | Opt-in `readOnly` on `SupportedFileTypeCheck`; `read` and `outline` set it, so their message leaves out "Nothing was changed." (item 13). Write tools unchanged. |
| `src/instructions/instructions.ts` | modified | File-type rule keeps its pinned sentence and adds "Descriptions name exceptions." (item 2). To stay under the instructions' existing 2,000-character test, the opening's second sentence was shortened ("Each tool's description and parameters state its inputs and valid combinations.") and the `help` rule drops the word "worked". Full text is 1,996 characters. |
| `src/tools/find_and_replace/index.ts` | modified | Description cut from 4,867 to under 4,096 characters (item 8b): response, guards, eligibility and line-scope paragraphs condensed; the full detail stays on the help page. The deprecated-names / success-only note and every test-pinned phrase are unchanged. |
| `src/tools/{search,context_search}/{index,schema}.ts` | modified | Case folding: "case-insensitive, accented letters included — `CAFÉ` matches `café`" replaces the ASCII-only claim (item 5e, confirmed live). `context_search` description adds leading-whitespace preservation and `MATCH_LINE_UNAVAILABLE` (item 5c). `search` unknown-vault wording (item 4b). |
| `src/tools/{smart_connections_query,smart_connections_similar,tag,backlinks}/index.ts` | modified | Unknown vault stated as `CLI_REPORTED_ERROR` with `Vault not found.` and no `details.code` (item 4b). |
| `src/tools/links/index.ts` | modified | Names `details.code NOT_MARKDOWN` (so the instructions' exception holds) and states that a Markdown link's target is URL-decoded (item 11a, confirmed live). |
| `src/tools/write_note/index.ts` | modified | Description says `bytes_written` is the size change and can be 0 or negative on overwrite (item 9a). |
| `src/tools/_register-baseline.json` | regenerated | `npm run baseline:write`, deliberate (descriptions and two `case_sensitive` field descriptions moved). |
| `docs/tools/*.md` (28 pages) | modified | Headings: `## Error roster`/`Error states`/`Failure modes` → `## Errors — …`, `## Worked examples` → `## Examples — Worked examples`; `get_active_file` gets `## Input — targeting, two modes`; `open_file` gets `## Output`; `write_note`'s `### Errors` becomes `## Errors`; `append_note` and `prepend` get a new `## Examples` section (success + `CONTENT_EMPTY`). Content fixes per item: unknown-vault rows and hints (4a/4b/4c), disabled-CLI rows on the seven pages (3), `context_search` missing-folder wrapping and `-32602` caveat (5a/5d), fold sections (5e), `outline` Example 4 (6), lifted shapes on `patch_heading`/`patch_block`/`query_base`/`append_note`/`prepend` (7), `find_and_replace` message prefixes (8a), `query_base` routing row and `priority` sample (10a/10c), `index.md` `bases` entry (10b), `views_base` and `obsidian_exec` no-active-file messages (10e), `PATH_ESCAPES_VAULT` messages (10f), `links` decoding and `NOT_MARKDOWN` hints, `smart_connections_similar` `find_connections({limit: 100})` (11), `delete` file wording (12), `read`/`outline` messages (13). |
| `.docs-as-code/capabilities/bases.md` | modified | One anchor updated (`#error-roster` → `#errors--error-roster`), because the heading rename broke it. |
| `src/tools/_validation-details.test.ts` | added test | Lift behaviour through each registered tool, plus `views_base` keeping the generic envelope (after the PR #142 review: direct unit tests of the lifts; the per-tool cases moved to each tool's `index.test.ts`, see Review fixes). |
| `src/tools/help/docs-sync.test.ts` | added test | TC-00586 heading rule (code-fenced headings ignored) with a self-test. |
| `src/tools/_surface.test.ts` | added test | Every published description ≤ 4,096 characters. |
| `src/instructions/instructions.test.ts` | added test | The extended file-type rule survives every tool filter. |
| `src/file-type/file-type.test.ts`, `src/tools/{read,outline}/handler.test.ts`, `src/tools/views_base/handler.test.ts`, `src/tools/obsidian_exec/handler.test.ts` | added tests | Read-only messages; `views_base` and `obsidian_exec` no-active-file advice. |
| `src/tools/obsidian_exec/handler.test.ts:144-146` | updated assertion | The one existing-test edit, approved by the owner (Q2 = A): the pinned message is now the tool-specific one. |

## Diff Highlights

```ts
// src/tools/_validation-details.ts
export function liftSubCodedIssue(issues: z.core.$ZodIssue[]): ToolErrorPayload | undefined {
  for (const issue of issues) {
    if (issue.code !== "custom" || issue.params?.["code"] === undefined) continue;
    return { code: "VALIDATION_ERROR", message: issue.message, details: { ...issue.params, issues: validationIssues(issues) } };
  }
  return undefined;
}
```

```ts
// src/file-type/file-type.ts
message: `${toolName}: ${relPath} is ${describeFile(extension, true)}; ${toolName} supports ${describeCategories(supported)}.${check.readOnly === true ? "" : " Nothing was changed."}${hint}`,
```

## Tests Added or Updated

One existing assertion was edited, with the owner's approval (Q2 = A): `src/tools/obsidian_exec/handler.test.ts:144-146` now pins `obsidian_exec`'s new no-active-file message. No other existing test was edited.

- `src/tools/_validation-details.test.ts` (per-tool cases now in each tool's `index.test.ts`, see Review fixes) — `patch_heading` `EMPTY_CONTENT` (full envelope), `INVALID_HEADING_PATH` `single-segment` and `empty-segment` (`segment_index`); `patch_block` `INVALID_BLOCK_ID` `empty` (full envelope) and `contains-invalid-chars` (`offending_index`); `query_base` `INVALID_BASE_PATH` `wrong-extension` (full envelope), `INVALID_VIEW_NAME` `too-long`, and an unrelated failure staying generic; `views_base` `x.md` staying generic with no `details.code`; `append_note` / `prepend` `CONTENT_EMPTY` and their generic fallback.
- `src/tools/help/docs-sync.test.ts` — every page has H2 headings beginning `Input`, `Output`, `Errors`, `Examples`.
- `src/tools/_surface.test.ts` — "every published tool description is at most 4,096 characters".
- `src/instructions/instructions.test.ts` — the rule line with its exception is present for all tools, the read-only set and no tools.
- `src/file-type/file-type.test.ts` — `readOnly: true` drops the sentence and keeps the alternative hint.
- `src/tools/read/handler.test.ts`, `src/tools/outline/handler.test.ts` — exact read-only messages.
- `src/tools/views_base/handler.test.ts` — `ERR_NO_ACTIVE_FILE` keeps code and details, message names only views_base's inputs.
- `src/tools/obsidian_exec/handler.test.ts` — new case: `ERR_NO_ACTIVE_FILE` keeps the dispatch details, message names only obsidian_exec's inputs.

## Local Verification

- `npm test` (vitest with coverage) → 199 files passed, 1 skipped; 4,949 tests passed, 6 skipped. Coverage thresholds met.
- `npm run typecheck` → clean. `npm run lint` → clean (one import-order fix applied by `eslint --fix`). `npm run build` → clean; `dist/tools/_validation-details.js` emitted.
- `npm run baseline:write` → 35 entries rewritten (deliberate FR-018 change).
- Prettier is not a CI gate here, and the touched files were already unformatted at HEAD; it was not run over them.
- **Live checks** (raw `Obsidian.com` against `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/bi0174/`, removed afterwards; the local MCP server's tools were not permitted in this session, so the CLI was probed directly):
  - `search:context query="CAFÉ CRÈME" path=Sandbox/bi0174` → `Sandbox/bi0174/Fold.md:4: bi0174 café crème marker`; with the `case` flag, `query="CAFÉ"` → `No matches found.`; `search query="CAFÉ"` → `Sandbox/bi0174/Fold.md`. The default fold covers accented letters (item 5e).
  - `eval` of `metadataCache.getCache("Sandbox/bi0174/Fold.md").links` → `[{"link":"Head One.md","original":"[link](Head%20One.md)"},…]`; the `links` template emits `e.link` as `target`, so `%20` is decoded (item 11a).
  - `base:query … format=json` → `"priority": "1"` for YAML `priority: 1`: values are strings (item 10c).
  - Not run: the vault-unavailable `Error: Command "…" not found.` answer (needs a registered vault that cannot be brought up) and the disabled-CLI notice (needs the user's Obsidian setting turned off). The docs rows rely on spec 072's T0 probe and BI-0132's TC-00495 probe; `/speckit-bug-test` can re-check them.

## Deviations from Assessment

- **`obsidian_exec` no-active-file advice (item 10e) — needed one existing-test edit.** The assessment expected no existing test to fail, but `src/tools/obsidian_exec/handler.test.ts:144-146` pinned the dispatch message for `obsidian_exec`. The fix stopped and asked. Owner ruling Q2 = A (2026-11-04): edit exactly that assertion to the new message, add a new test pinning it, and leave the dispatch message and its other tests (`_dispatch.test.ts`, `cli-adapter.test.ts`, `move/handler.test.ts`) unchanged. Applied as ruled; `docs/tools/obsidian_exec.md` now states the message.
- **Instructions wording (item 2).** The appended exception is "Descriptions name exceptions." rather than the assessment's longer example, because the existing `instructions.test.ts:61` and `server.protocol.test.ts:90` cap the full text below 2,000 characters (it was already at 1,990). Two other sentences were shortened to make room (see Changes). The pinned sentence is verbatim.
- **Two smart_connections pages keep the string `VAULT_NOT_FOUND`.** The existing `smart_connections_{query,similar}/index.test.ts` require each page to contain `VAULT_NOT_FOUND`. The pages now say there is no `VAULT_NOT_FOUND` code for these tools, which is true and keeps those tests unedited.
- **`create_base` keeps its lifted keys.** It lifts only `code`, `reason` and `field`; `liftSubCodedIssue` copies every param (the `patch_heading` docs promise `segment_index` and `value_length`). Copying every param for `create_base` would add `value` / `value_length` to its errors, a behaviour change outside this BI. So `query_base` lifts `value` / `value_length` too, while `create_base` does not; both are documented as returned. After the PR #142 code-quality review, `create_base`'s hook is `liftSubCodedIssueKeys(["code", "reason", "field"])` from the shared module instead of its own copy of the loop; its `details` keep the same keys in the same order, and its existing `index.test.ts` cases pass unchanged.
- **`views_base` disabled-CLI row.** `views_base.md` had no vault-unavailable row; the disabled-CLI row was added anyway, since the seven pages the report names include `views_base`.
- **Item 10d** (`create_base` Output) needed no change: the page already matches BI-0180's `path` / `name` contract.
- **Scope expansion.** `.docs-as-code/capabilities/bases.md` (one anchor the heading rename broke) and `docs/tools/index.md`'s `bases` entry (item 10b, named in the assessment) were edited.

## CodeGraph structural verification

1. **No new error codes.** No new class in or outside `src/errors.ts`. The lifts reuse `VALIDATION_ERROR` with existing documented `details.code` values; `views_base` and `obsidian_exec` rethrow the existing `ERR_NO_ACTIVE_FILE`.
2. **No DI factory imports.** No handler imports `createLogger()` or `createQueue()`; the changed handlers (`views_base`, `obsidian_exec`, `read`, `outline`) import only `throwIfNoActiveFile` from the shared `_active-file.ts` (views_base and obsidian_exec, after the PR #142 review).
3. **One-directional imports.** `src/tools/_validation-details.ts` is a leaf imported by tool `index.ts` files. It imports `validationIssues` from `_register.ts` and the `ToolErrorPayload` type from `_shared.ts`, neither of which imports it back, so there is no cycle and no tool→tool edge.
4. **Reachable.** `liftSubCodedIssue` is called from the `patch_heading`, `patch_block` and `query_base` registrations, and `liftEmptyContent` from `append_note` and `prepend`. The two `NO_ACTIVE_FILE_MESSAGE` constants are used by `listFocusedViews` and `executeObsidianExec`, and `readOnly` is set by the `read` and `outline` handlers.

Kernel-node claim held: no change to `createLogger()`, `createQueue()`, `createServer()` or `UpstreamError`.

## Follow-ups

- The instructions are at 1,996 of their 2,000-character test cap; the next rule added will need room made.
- Docs-as-code pass: `.docs-as-code/` pages that quote the changed messages, the instructions text or the description lengths.
- `create_base` could switch to the full `liftSubCodedIssue` in a later BI if adding `value` / `value_length` to its errors is wanted.
- The root of item 10e is `_dispatch.ts`'s ERR_NO_ACTIVE_FILE message, which advises `target_mode` and vault/file. Letting the caller supply that advice would remove the per-tool rethrows, but it changes the dispatch spine, which the assessment kept out of scope; it is a candidate for its own item.
- Live re-check of the vault-unavailable and disabled-CLI rows during `/speckit-bug-test` if a safe setup exists.

## Review fixes (PR #142 code-quality review)

Behaviour-preserving restructuring after the thermo-nuclear code-quality review; no error code, message, `details` or published byte changed (the FR-018 fingerprint passed without `baseline:write`).

| File | Change |
|------|--------|
| `src/tools/_active-file.ts` | New `throwIfNoActiveFile(err, advice)`: rethrows an ERR_NO_ACTIVE_FILE with the same code, cause and details and the tool's advice, and returns for any other error. It replaces the two copied catch-and-rewrap blocks in `views_base/handler.ts` (`listFocusedViews`) and `obsidian_exec/handler.ts` (`executeObsidianExec`). |
| `src/tools/_validation-details.ts` | The lift loop is written once (`liftFirstSubCoded`); `liftSubCodedIssue` keeps every param and the new `liftSubCodedIssueKeys(keys)` keeps only the named ones. |
| `src/tools/create_base/index.ts` | Its own `mapZodIssuesToToolError` is replaced by `liftSubCodedIssueKeys(["code", "reason", "field"])`. |
| `src/tools/_validation-details.test.ts` | Now unit-tests the three lifts directly on issues from a small zod schema. |
| `src/tools/{patch_heading,patch_block,query_base,views_base,append_note,prepend}/index.test.ts` | The per-tool wiring cases that were in `_validation-details.test.ts` moved here unchanged (Principle II co-location; `create_base` already tests its hook in its own `index.test.ts`). They read the result text with the shared `textOf`. |
| `src/tools/_active-file.test.ts` | Direct tests for `throwIfNoActiveFile`. |

Left as is: `SupportedFileTypeCheck.readOnly` stays opt-in, as assessment item 13 specifies; making it required would edit existing `file-type.test.ts` calls and is raised with the owner.
