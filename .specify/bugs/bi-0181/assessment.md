# Bug Assessment: tag values read and matched in two forms depending on metadata-cache state

- **Slug**: bi-0181
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0181, filed 2026-11-02 from the 0.9.0-local test run)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

Condensed from the pasted BI-0181 text:

> Frontmatter tags are written without `#` (`tags: [bi-0166]`), and that is the form agents use when they look them up. Because the metadata cache adds `#` once Obsidian re-parses a note, the same tag is reported in two forms depending on cache state, and a lookup by the written form silently misses every re-parsed note. Harms: (a) `find_by_property` on `tags` returns incomplete or empty results with no error, and the answer changes as Obsidian re-parses notes in the background, which is why consecutive calls disagreed; (b) `read_property` returns a value that does not match the file's text, so read-compare-write logic sees a spurious difference; (c) tags are the most common lookup key in this vault's workflows (BI and TC tags, initiative tags). Normalising the leading `#` on both the read side and the comparison side makes the result independent of cache state.
>
> Evidence: on `@marwansaab/obsidian-cli-mcp@0.9.0-local`, after Obsidian re-parsed a note, its metadata cache reported the `tags` values with a leading `#`. `read_property` on `tags` returned `"#bi-0166"` for such a note, while notes not yet re-parsed returned the raw value `bi-0166`. `find_by_property` on `tags` with value `bi-0166` returned 0 matches; with `#bi-0166` it returned 11. An earlier probe in the same run saw the same `tags` lookup return 2 and then 0 results.

The report's acceptance criteria (summarised):

1. Eleven notes tagged "project-x", some re-indexed and some not: a search by tag "project-x" returns all eleven, and repeating the search gives the same result.
2. A search by "#project-x" returns the same eleven notes.
3. Reading a note's tags before and after the vault re-indexes it gives the same value both times, in the documented form.

Out of scope (per the report): nested tag hierarchies and partial tag matching; tags written inline in the note body; properties other than tags; changing how tags are stored in notes.

## Symptom

`read_property` and `find_by_property` both read frontmatter from Obsidian's metadata cache, and the cache reports a `tags` list as `["bi-0166"]` or `["#bi-0166"]` depending on which code path last refreshed that note. `read_property` returns whichever form the cache holds. `find_by_property` compares it with strict equality, so a query for `bi-0166` misses every note whose cache entry carries the `#`. The result changes from call to call as notes are refreshed, and no error is raised. Expected: one documented form on read (the form written in the file, without `#`), and matching that does not depend on which form the cache holds or on whether the query has a leading `#`.

## Reproduction

Reproduced live on Obsidian 1.15.0 (installer 1.14.4) in the authorised test vault `TestVault-Obsidian-CLI-MCP` (no plugins), with a throwaway note under `Sandbox/`. The note was removed afterwards and `Sandbox/` was left as it was before the run.

1. Write `Sandbox/bi0181-probe.md` directly to disk with frontmatter `tags:\n  - bi-0181-probe\nstatus: x`.
2. Read the cache: `Obsidian.com eval "code=JSON.stringify(app.metadataCache.getCache('Sandbox/bi0181-probe.md').frontmatter)"` → `{"tags":["bi-0181-probe"],"status":"x"}`. `Obsidian.com properties vault=TestVault-Obsidian-CLI-MCP path=Sandbox/bi0181-probe.md format=json` (the call `read_property` makes) → `"tags": ["bi-0181-probe"]`.
3. Change another property through Obsidian's own frontmatter writer: `Obsidian.com property:set vault=TestVault-Obsidian-CLI-MCP path=Sandbox/bi0181-probe.md name=status value=y` (the call `set_property` makes).
4. Read the cache again → `{"tags":["#bi-0181-probe"],"status":"y"}`, and `properties … format=json` → `"tags": ["#bi-0181-probe"]`. The file text still reads `tags:\n  - bi-0181-probe`.
5. Append a line to the file from outside Obsidian and wait for the file watcher → the cache reads `{"tags":["bi-0181-probe"],"status":"y"}` again.

Further observations from the same probes:

- In one run, the cache still held the raw form about 3 s after `property:set` and switched to `#` only after `app.metadataCache.computeFileMetadataAsync(file)`, the call `invalidateMetadataCache` makes after direct-fs writes. So the `#` form can also appear after our own post-write refresh. Either way, the form in the cache depends on timing and on which path refreshed the note last.
- A vault-wide scan of the test vault's cache found the fixture `Fixtures/BI-0076/closed-note.md` cached as `"tags": ["#bi0076closed"]`, while its file text is `tags:\n  - bi0076closed`. The file was modified today, by an earlier run.
- In `My-Setup-Vault`, the vault the report comes from, all eleven notes tagged `bi-0166` (TC-00594 … TC-00604) have `  - bi-0166` without `#` in their file text. The `#` form the report saw therefore exists only in the cache. That vault's community plugins (`obsidian-local-rest-api`, `omnisearch`, `obsidian-excalidraw-plugin`, `smart-connections`) do not edit frontmatter. Agents often flip `status` on those notes with `set_property`, which is the trigger shown in step 3.
- Only a lowercase `tags` key holding a **list** was seen in `#` form. After `property:set`, `Tags: [cap]`, `tag: [sing]`, `aliases: [al]`, a custom list `keywords: [kw]` and a scalar `tags: single` all stayed raw.

Reproduction against the MCP surface follows directly from the code below: `read_property` returns `parsedA["tags"]` from the `properties` output as is, and `find_by_property`'s template compares `fm.tags` elements with `===`. No separate MCP-level run was needed.

## Suspected Code Paths

- `src/tools/find_by_property/_template.ts:7-23`: the frozen eval template walks `app.metadataCache.fileCache` × `metadataCache`. It compares with `eq` (strict `===`, or `toLowerCase()` when `caseSensitive` is false). The scalar branch is `v.some(e=>eq(e,a.value))` (line 19) and the exact-array branch is `arrEq` (line 20). Neither removes a leading `#` from the cached value or from `a.value`, so `"bi-0166" !== "#bi-0166"`. This is the root cause of harm (a).
- `src/tools/find_by_property/handler.ts:23-29` `executeFindByProperty()`: builds the payload (`property`, `value`, `folder`, `arrayMatch`, `caseSensitive`) and validates the output. It passes `input.value` through unchanged.
- `src/tools/read_property/handler.ts:58-73` `executeReadProperty()`: Call A (`properties … format=json`) returns the cached frontmatter, and `value = parsedA[input.name]` is returned as is (line 73). This is the root cause of harm (b).
- `src/tools/read_property/index.ts:10`, `docs/tools/read_property.md:83`: `value` is documented as "Verbatim — no flattening, no coercion". That wording has to change for `tags`.
- `docs/tools/find_by_property.md:42,92,177`: describes strict-equality contains-semantics on `tags` ("The wrapper treats frontmatter tags as opaque values — `===` only"). That has to change for the leading `#`.
- `src/tools/set_property/handler.ts:132-146` `executeWriteProperty()`: its `property:set` call is one trigger of the `#` form in the cache (reproduction step 3). This is not a defect in our code: it is Obsidian's native frontmatter writer, and the cache returns to raw on the next external write. Listed because it explains why notes edited with `set_property` show the symptom.
- `src/tools/_note-io.ts:83-85` `buildInvalidateTemplate()`: the post-write `computeFileMetadataAsync` refresh. Observed once to settle the cache in the `#` form. Not a defect to fix here (spec 068 / refactor-decisions item 24 fix this call; `computeMetadataAsync` wedges the worker). Normalising in the readers makes the result independent of whichever path refreshed the cache.
- Reference for the normalisation rule: `src/tools/tag/schema.ts:13` already strips **a single** leading `#` from the `tag` tool's input (`s.startsWith("#") ? s.slice(1) : s`), and `tag`'s description says "with or without a leading `#`". The fix should follow the same rule so the two tag-facing tools agree.

## Root Cause Hypothesis

High confidence. Obsidian keeps frontmatter in its metadata cache in two forms for the `tags` list. A note parsed by the file watcher after an external write holds the values as written (`bi-0166`). A note whose cache was last updated through Obsidian's own frontmatter path (`property:set`, so `set_property`, and seen once after `computeFileMetadataAsync`) holds them with a leading `#`. Both tools read that cache directly and treat the value as opaque. `read_property` returns it as is. `find_by_property` compares it with `===`. So their output follows cache state, which changes in the background. The defect in our code is the missing normalisation at the two read and compare sites; the two cache forms are Obsidian behaviour we cannot change from the server.

## Proposed Remediation

**Preferred**: normalise a single leading `#` on `tags` values at both sites, with the documented form being **without `#`**: the form written in the file, the form agents write, and the form the `tag` tool reduces its input to.

1. **`find_by_property` (comparison side)**: in `_template.ts`, when `a.property === "tags"`, strip one leading `#` from every string on both sides before comparing: the cached value (each element of a list, or a scalar string) and the query (`a.value`, or each element of an array `value` for `array_match: false`). For example, add a small `nt=x=>typeof x==='string'&&x.startsWith('#')?x.slice(1):x` applied inside the comparison only when the property is `tags`, so every other property keeps today's strict `===`. Do this inside the template rather than by rewriting `input.value` in the handler: a query normalised in the handler would still miss cached `#` values, and the cached side can only be reached inside the eval. Case folding (`case_sensitive: false`) composes unchanged, because the strip runs before `eq`. Non-string elements (numbers, null) pass through untouched.
2. **`read_property` (read side)**: in `executeReadProperty`, when `input.name === "tags"`, strip one leading `#` from each string element of a list value, and from a scalar string value, before returning. Leave `type` resolution (Call B) and the heterogeneous-list downgrade unchanged. Apply the strip to the value only.
3. **Key scope**: exactly the property name `tags`, matched case-sensitively like every other `name` in both tools. Both tools already look up `name` literally. The probes saw the `#` form only on `tags`, and the report puts other properties out of scope (`tag`, `Tags`, `aliases` and custom lists stayed raw after `property:set`).
4. **Published surface (constitution, *visible input rules*)**: say it where agents read it. In `find_by_property`'s `value` parameter description (or the tool description): "For `tags`, a leading `#` is ignored on both sides." In `read_property`'s tool description, add a clause such as "`tags` values are returned without a leading `#`". These text changes move the registered-tool fingerprint baseline (`src/tools/_register-baseline.json`), which is the deliberate-change gate, so regenerate it in the same change. Update `docs/tools/read_property.md` (the `value` row "Verbatim" claim and a short *Tags* subsection) and `docs/tools/find_by_property.md` (the `array_match` row, the *Hierarchical-tag rollup* paragraph's "opaque values" sentence, and Example 3's note) so the help pages match. Add a `Fixed` entry to `CHANGELOG.md`.

No new error code (Principle IV), no new module, no new dependency, no change to how tags are stored.

**Alternatives**:
- *Normalise only the query, in the handler* (add both `x` and `#x` forms to the query). Cheaper than a template change, but `array_match: false` exact-array matching would need every combination of `#` per element, and `read_property` would still return two forms. Rejected: it does not meet acceptance criterion 3, and it hides the rule in query expansion.
- *Report tags with `#` (Obsidian's `getAllTags` form)*. Also consistent, but it disagrees with the file text and with what agents write, which is the read-compare-write harm (b) in the report. Rejected.
- *Force the cache back to the raw form* (for example, re-trigger a watcher parse after `set_property`). This chases Obsidian's internal refresh paths, adds spawns, and still leaves notes edited in the Obsidian UI in the `#` form. Rejected: the readers must be robust to either cache form.

**Files likely to change**:
- `src/tools/find_by_property/_template.ts`: the `tags`-only strip inside the comparison; header comment.
- `src/tools/read_property/handler.ts`: the `tags`-only strip on the returned value; header comment.
- `src/tools/find_by_property/schema.ts` and/or `src/tools/find_by_property/index.ts`: visible rule in the `value` description or tool description.
- `src/tools/read_property/index.ts`: visible rule in the tool description.
- `src/tools/_register-baseline.json`: regenerated for the description changes.
- New `src/tools/find_by_property/_template.test.ts`: co-located (Principle II), runs the template under `node:vm` with a fake `app`.
- `src/tools/read_property/handler.test.ts`: tags normalisation cases.
- `docs/tools/read_property.md`, `docs/tools/find_by_property.md`, `CHANGELOG.md`.

**Tests to add or update**:
- `find_by_property/_template.test.ts` (template logic in-process, per refactor-decisions item 31: `composeEvalCode(JS_TEMPLATE, payload)` under `node:vm` `runInNewContext` with a fake `app.metadataCache.fileCache` / `metadataCache`, following the existing `context_search/_template.test.ts` / `links/_template.test.ts` / `_eval-template-fixtures.ts` pattern):
  - Mixed cache: some notes cached `tags: ["project-x"]`, others `["#project-x"]`. Query `"project-x"` returns all of them (criterion 1), and query `"#project-x"` returns the same set (criterion 2).
  - `array_match: false` with `["a","b"]` matches a cached `["#a","b"]` and `["#a","#b"]`, and order still matters.
  - `case_sensitive: false` with `"#Project-X"` matches cached `["project-x"]` and `["#PROJECT-X"]`.
  - Boundary: only one `#` is stripped on each side. A cached `"##x"` becomes `"#x"`, so queries `"x"` and `"#x"` (both become `"x"`) do not match it, and query `"##x"` does.
  - Boundary: the strip is limited to `tags`. A non-`tags` property (for example `keywords: ["#a"]`) queried with `"a"` does not match, and with `"#a"` does.
  - Non-string elements (numbers, null) in a `tags` list compare as before.
- `read_property/handler.test.ts`:
  - Call A returns `{"tags":["#bi-0166","x"]}` → `value: ["bi-0166","x"]`, `type: "list"`.
  - Call A returns `{"tags":["bi-0166"]}` → unchanged (criterion 3: both cache forms give the same value).
  - Scalar `{"tags":"#solo"}` → `"solo"`.
  - Boundary: a non-`tags` property `{"keywords":["#a"]}` is returned as is.
  - Heterogeneous `tags` list (`["#a", 1]`) → `["a", 1]` with `type: "unknown"` (downgrade unaffected).
- Registration / fingerprint: the baseline test passes after deliberate regeneration.
- Live check (per `.memory/test-execution-instructions.md`, in `Sandbox/` of the test vault): seed two notes tagged `bi0181-live`, bring one into the `#` cache form with `property:set` on another key, then confirm that `find_by_property` with `bi0181-live` and with `#bi0181-live` both return both notes, and that `read_property` on `tags` returns `["bi0181-live"]` for both. Clean up afterwards.

## Risks & Considerations

- **Published-contract change on `read_property`**: `value` stops being "verbatim" for `tags`. A caller that relied on seeing `#` in the cache form gets the stripped form. That form matches the file text, which is the point of the fix; record it in the CHANGELOG under `Fixed`.
- **A tag literally written with `#` in YAML** (for example `tags: ['#y']`, which Obsidian accepts as the tag `y`) reads back as `y`. That differs from the file text, but it is the same tag in Obsidian's model and the documented form. The docs should say so. Writing such a value is unchanged (out of scope: storage).
- **`find_by_property` widens on `tags` only**: a query `"#x"` now also matches notes cached as `x`, and vice versa. That is criterion 2. No other property's matching changes.
- **Template edit**: in-Obsidian code is not covered by handler tests (refactor-decisions item 31). The `node:vm` template test closes that gap for this change. The edit must keep the R6 anti-injection shape: the payload stays base64 JSON, and no user input is interpolated into the template.
- **Cache-state behaviour is Obsidian's, version-dependent**: if a future Obsidian also adds `#` to other keys (`aliases`, custom lists), this fix will not cover them. The scope follows the report and the probe evidence. A later report can widen it.
- **Hierarchical and partial matching unchanged**: `project` still does not match `project/x` (out of scope, and the docs already say so).
- **Fingerprint baseline**: the description changes need a deliberate regeneration of `_register-baseline.json`. The constitution treats that as a reviewed change, not drift.

## CodeGraph structural check

Queried with `codegraph_explore` on `executeFindByProperty`, `executeReadProperty`, `READ_PROPERTY_DESCRIPTION`, `FIND_BY_PROPERTY_DESCRIPTION`, `findByPropertyInputSchema`, `executeWriteProperty`, `executeProperties`, `invalidateMetadataCache` / `buildInvalidateTemplate`, and the kernel nodes as they reach these handlers (through `ExecuteDeps`).

- **Affected modules**: `src/tools/find_by_property/` (template, plus description text in schema/index) and `src/tools/read_property/` (handler, plus description text in index), along with the generated `src/tools/_register-baseline.json` and docs. `executeFindByProperty` and `executeReadProperty` each have one production caller, their `create…Tool` registration in the same module's `index.ts`, registered from the boot spine (`server.ts`). Other dependents are their own test suites, `_typed-result-fixtures.ts` (tool factories only) and `_plugin-noise.test.ts` (lists `find_by_property`). `JS_TEMPLATE` is consumed only by `find_by_property/handler.ts`.
- **Not changed**: `set_property` (its `property:set` is a trigger, not a defect), `_note-io.ts` (`invalidateMetadataCache` stays as spec 068 left it), the `properties` catalogue tool (names and counts only, no values), `tag` (already strips `#`), `query_base` (Obsidian's own Bases engine).
- **Imports stay one-directional** (Principle I): a strip helper, if factored out of `read_property`, belongs in a shared `src/tools/_*.ts` sibling (not in `tag/`, which would be a sideways import between tool modules). The template copy is in-eval JS and cannot import, so a TS helper plus the template's inline arrow means two copies; pin both with tests.
- **Error spine**: no new error code or class. No failure path changes.
- **Kernel nodes**: the fix touches none of them. `createLogger()` / `createQueue()` stay confined to `server.ts` (both handlers keep receiving `logger` / `queue` through `ExecuteDeps`), `UpstreamError` is used, not modified, and `createServer()` is unchanged.

## Open Questions

- Resolved (Relay): the documented form is **without `#`** (option A). `read_property` returns `tags` values without a leading `#`, and `find_by_property` strips it from both the cached value and the query before comparing. Reason: BI-0181's harm (b) is that `read_property` returns a value that does not match the file text, and its tags are written without `#` (`tags: [bi-0166]`). The Impact section asks for the leading `#` to be normalised on both the read side and the comparison side. This is the only option that meets all three acceptance criteria. Rejected: adding `#` everywhere (it contradicts the file text), and normalising only `find_by_property` (fails criterion 3).
- Resolved (Relay): the normalisation applies to exactly the `tags` key, matched case-sensitively like every other `name` (option A). Reason: BI-0181 puts "Properties other than tags" out of scope, and the fix must not change how `name` is looked up in the property tools, which ADR-046 treats as one family sharing the `name` parameter. The live probes agree: only a lowercase `tags` list was cached with `#`. Rejected: case-insensitive `tags` / `tag` / `Tags` (diverges from the family's exact-name lookup, and no evidence those keys get the `#` form); every property of Obsidian type `tags` (needs an extra type lookup in the eval for no observed gain).
- Resolved (Relay): exactly **one** leading `#` is stripped, on both the cached value and the query (option A). A cached `##x` becomes `#x` and is matched only by the query `##x`. Reason: BI-0181 asks to normalise "the leading `#`", the single `#` the metadata cache adds when a note is re-parsed. The `tag` tool strips one leading `#` from its input (`src/tools/tag/schema.ts:13`, and its description), and the fix uses the same rule. Stripping more would merge values the file keeps distinct, which is outside the bug. Rejected: stripping every leading `#` (`/^#+/`).

The answers confirm the provisional choices already written into the Proposed Remediation, Tests and Risks sections above. No section changes.
