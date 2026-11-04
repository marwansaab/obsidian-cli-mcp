# Bug Assessment: Smart Connections tools report `headingPath: [""]` for text before a note's first heading

- **Slug**: bi-0184
- **Created**: 2026-11-04
- **Source**: pasted text (backlog item BI-0184, filed 2026-11-03; evidence from TC-00503 and the 0.9.0 owner-input regression, Block 2, on `@marwansaab/obsidian-cli-mcp@0.9.0-local`)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

Condensed from the pasted BI-0184 text:

> A caller that checks `headingPath.length === 0` to tell "the note as a whole / its opening text" from "a section under a heading" gets the wrong answer: `[""]` has length 1, so a pre-heading block looks like a section whose heading is an empty string. Joining the segments (for example to build a `read_heading` path or a display label) produces a dangling separator. Low impact: the `path` and `score` are correct, and a caller can filter empty segments as a workaround.
>
> Evidence: with Smart Connections installed in `TestVault-Obsidian-CLI-MCP`, `smart_connections_similar` returned `Fixtures/BI-0062/long-line.md` with `headingPath: [""]` (TC-00503, 2026-11-03 row), and the same shape appeared for `Fixtures/BI-0123/latin-3072.md`. Both are blocks that sit before the note's first heading: the plugin keys them as `<path>#`, with nothing after the `#`. The tool descriptions promise `headingPath: []` for a source-level match. Seen on both `smart_connections_query` and `smart_connections_similar`, which share the same key-splitting step.

Acceptance criteria (from the report's "Expected behaviour" section):

1. A note's opening paragraph (before its first heading) returned by `smart_connections_query` has `headingPath: []`.
2. Another note's opening text returned by `smart_connections_similar` has `headingPath: []`.
3. A note with no headings at all still has `headingPath: []`.
4. A match inside a nested section still lists the section's headings in order.
5. A frontmatter match still has `headingPath: ["---frontmatter---"]`.
6. No result's `headingPath` contains an empty string.

Out of scope (per the report): which blocks are matched, their scores or their order; adding line numbers or excerpts; changing how the plugin indexes or names blocks.

## Symptom

When the Smart Connections plugin returns a block keyed `<path>#` (the text before the note's first heading), both tools report it as `headingPath: [""]`, a one-element array holding an empty heading name. Expected: `headingPath: []`, the shape the tool descriptions and `docs/tools/smart_connections_*.md` document for a source-level match.

## Reproduction

1. In a vault with Smart Connections installed and indexed (the report used `TestVault-Obsidian-CLI-MCP`), pick a note that has body text before its first heading (the report's `Fixtures/BI-0062/long-line.md` and `Fixtures/BI-0123/latin-3072.md`).
2. Call `smart_connections_similar` on a source note that is similar to it, or `smart_connections_query` with a query that matches its opening text.
3. The result entry for that note's opening block carries `headingPath: [""]`.

No live reproduction was run for this assessment. The TC-00503 evidence is concrete, and the code below produces `[""]` from a `<path>#` key by construction (`"".split("#")` is `[""]` in JavaScript). The fix's live check (`/speckit-bug-test`) should run against the authorised test vault per `.memory/test-execution-instructions.md`.

## Suspected Code Paths

- `src/tools/smart_connections_query/_template.ts:19-23`: the per-match `.map` splits `m.key` on its first `#`; `headingPath=hashIdx===-1?[]:key.slice(hashIdx+1).split('#')`. For the key `<path>#`, `key.slice(hashIdx+1)` is `""` and `.split('#')` returns `[""]`. This is the root cause on the query side.
- `src/tools/smart_connections_similar/_template.ts:33-37`: the same split, written a second time, on `r.item.key||r.key`. Same root cause on the similar side. (The report says the two tools "share the same key-splitting step"; in the code the step is two copies of the same expression, one per template, not one shared fragment.)
- `src/tools/_smart-connections.ts:10-18`: `SORT_SLICE_AND_EMIT`, the shared tail. Its tertiary sort key is `headingPath.join('#')`, which is `""` for both `[]` and `[""]`, so the order is unchanged by the fix. Not a defect site; listed because the fix's natural home is beside it (see Remediation).
- `src/tools/smart_connections_query/schema.ts:39-44` and `src/tools/smart_connections_similar/schema.ts:26`: `matchEntrySchema.headingPath` is `z.array(z.string())`, so `[""]` passes the eval-envelope parse and the output schema. Not a defect site; a schema-level `min(1)` on segments is an alternative (see below).
- `src/tools/smart_connections_query/index.ts:19` and `src/tools/smart_connections_similar/index.ts:16`: the descriptions promise "empty `[]` for source-level matches". The text is already correct for the fixed behaviour; no description change is needed, so the tool-surface fingerprint baseline should not move.

## Root Cause Hypothesis

Both eval templates turn a Smart Connections block key into `{path, headingPath}` by splitting on the first `#` and then splitting the remainder on `#`, with no handling for an empty remainder. The plugin keys a note's pre-heading block as `<path>#` with nothing after the `#`, so the remainder is `""`, and `"".split('#')` yields `[""]` rather than `[]`. The `hashIdx===-1` branch only covers keys with no `#` at all (whole-source matches), which is why a note with no headings already reports `[]`. Confidence: high. The JavaScript behaviour is deterministic and both observed keys fit the shape.

## Proposed Remediation

**Preferred**: move the key-to-`{path, headingPath}` split into one JS-source fragment exported by the cohort leaf `src/tools/_smart-connections.ts` (beside `MAX_LIMIT` and `SORT_SLICE_AND_EMIT`), and interpolate it into both templates in place of their two inline copies. The fragment drops empty segments after splitting: `key.slice(hashIdx+1).split('#').filter(s=>s!=='')`. A `<path>#` key then yields `[]`; `<path>#H1#H2` still yields `["H1","H2"]`; `<path>#---frontmatter---` still yields `["---frontmatter---"]`; a key with no `#` still yields `[]`. Filtering every empty segment, not just the all-empty case, also meets acceptance criterion 6 for any other key with an empty segment (`<path>#H1#`, `<path>##H2`) should the plugin emit one. This follows the standing rules in `.memory/refactor-decisions.md` item 45 (the Smart Connections cohort keeps shared logic in `_smart-connections.ts`; don't re-inline) and item 53 (a frozen eval template shares a rule by interpolating a fragment from a leaf module, never by an inline copy). Each template keeps its own key extraction (`m.key||''` vs `(r.item&&r.item.key)||r.key||''`) and passes the key into the shared fragment, for example as a small `const splitKey=key=>{…}` helper emitted once per template, or as an expression fragment over a local `key`.

**Alternatives**:
- Patch each template's inline split in place (add `.filter(s=>s!=='')` twice). Smallest diff, but it leaves the same rule written twice in the two templates, which item 45 / item 53 tell the review to refuse; the code-quality review would likely ask for the shared fragment anyway.
- Normalise in the handlers after `decodeEvalEnvelope` (map `headingPath` through a filter in TypeScript). Keeps the templates untouched, but splits the key-split rule across eval and TS code, and item 54's precedent is that the template owns the shape it emits. Not recommended.
- Tighten `matchEntrySchema.headingPath` to `z.array(z.string().min(1))`. This would turn `[""]` into a `CLI_REPORTED_ERROR`/parse failure instead of a correct answer, so the whole call would fail on a valid plugin result. Rejected as the fix; it could be added on top of the preferred fix as a guard, but it changes the published output schema (fingerprint baseline) for no caller-visible gain.

**Files likely to change**:
- `src/tools/_smart-connections.ts` (new exported fragment for the key split, with its header comment updated)
- `src/tools/smart_connections_query/_template.ts` (interpolate the fragment; header comment's Stage 5 text)
- `src/tools/smart_connections_similar/_template.ts` (interpolate the fragment; header comment's Stage 6 text)
- `src/tools/smart_connections_query/_template.test.ts`
- `src/tools/smart_connections_similar/_template.test.ts`
- Possibly `src/tools/_smart-connections-fixtures.ts` if its `keyOf` oracle needs a pre-heading case (it already maps `[]` to a bare path)
- `docs/tools/smart_connections_query.md` and `docs/tools/smart_connections_similar.md` only if the docs pass decides to state that a `<path>#` key maps to `[]` (the existing text already promises `[]` for source-level matches); that edit belongs to `/speckit-docs-as-code`, not the fix.

**Tests to add or update** (in the `node:vm` `_template.test.ts` suites, which run the real template through `runEvalTemplate` from `_eval-template-fixtures.ts`):
- `smart_connections_query`: a lookup result with key `Note.md#` returns `{ path: "Note.md", headingPath: [] }` (AC 1); `Note.md` (no `#`) still returns `[]` (AC 3); `Note.md#H1#H2` still returns `["H1","H2"]` (AC 4); `Note.md#---frontmatter---` still returns `["---frontmatter---"]` (AC 5).
- `smart_connections_similar`: a `find_connections` result whose `item.key` is `Other.md#` returns `headingPath: []` (AC 2), with the same three regression rows.
- In both suites, one mixed result set (pre-heading, whole-note, nested, frontmatter keys, plus `Note.md#H1#` / `Note.md##H2` edge keys) asserts no returned `headingPath` contains `""` (AC 6), and that the sort order and scores are unchanged from the pre-fix render for keys that were already well-formed (out-of-scope guard).
- If the fragment lands in `_smart-connections.ts`, a small test pinning the fragment's input→output table directly, compared through `JSON.stringify` because vm arrays come from another realm (item 53).

## Risks & Considerations

- **Ordering**: `SORT_SLICE_AND_EMIT` compares `headingPath.join('#')`; `[""]` and `[]` both join to `""`, so ties between a pre-heading block and a whole-note block of the same path and score keep their relative order. Edge keys with interior empty segments (`<path>##H2` → `["H2"]`) would join differently after the fix (`"H2"` vs `"#H2"`), which can move them relative to a sibling with a real `["H2"]` path. No such key has been observed; note it in `fix.md` if the edge-case filter is kept.
- **Collision**: after the fix, a pre-heading block and a whole-note match on the same path both report `headingPath: []`. The report's acceptance criteria ask for exactly that ("the same as a match on the note as a whole"), so this is intended, not a regression.
- **Frozen-template byte stability**: the change alters the rendered `JS_TEMPLATE` of both tools on purpose. Any existing test that pins the rendered template or its prefix must be updated deliberately, not loosened. The tool descriptions and the input/output schemas do not change, so the tool-surface fingerprint baseline should stay as it is; if it moves, that is a sign the fix strayed.
- **Plugin key shapes**: the fix assumes the plugin's key grammar is `<path>[#seg]*`. Sub-block ids like `#{1}` stay ordinary segments (the docs already say so). A heading whose own text contains `#` would still be split; that is long-standing behaviour and out of scope.
- **No security, migration or performance impact**: one extra `.filter` over a short array per match, on at most `MAX_LIMIT` candidates.

## CodeGraph structural check

- **Affected modules**: the Smart Connections cohort only. `src/tools/_smart-connections.ts` (cohort leaf, imported by both `_template.ts` files and by both `schema.ts` / `index.ts` files for `MAX_LIMIT`), `src/tools/smart_connections_query/_template.ts` and `src/tools/smart_connections_similar/_template.ts` (each imported by its own `handler.ts`, which passes `JS_TEMPLATE` to `composeEvalCode` and then `invokeEval`). No other tool imports either template.
- **Blast radius**: the two templates' `JS_TEMPLATE` constants, their handlers (`executeSmartConnectionsQuery`, the similar handler), and the tests that run or pin them: `smart_connections_query/_template.test.ts`, `smart_connections_similar/_template.test.ts`, the two `handler.test.ts` files (which stub `invokeCli`, so they assert whatever the stub returns and are not affected by template logic, per `.memory/refactor-decisions.md` item 31), and `_smart-connections-fixtures.ts`. A new export in `_smart-connections.ts` is a downward edge from each tool to the cohort leaf, the same direction as the existing `MAX_LIMIT` / `SORT_SLICE_AND_EMIT` imports (Principle I).
- **Kernel nodes**: the fix touches none of them. `createLogger()`, `createQueue()`, `UpstreamError` and `createServer()` are not changed, called or newly imported; the error path (`mapEnvelopeError` → `UpstreamError`) is untouched, and no new error code is introduced. The post-fix structural verification checks against this claim.

## Open Questions

None. The report's acceptance criteria settle the expected shape (`[]`, the same as a whole-note match), and the remediation's one design choice (shared fragment vs two inline copies) is settled by the standing review rules in `.memory/refactor-decisions.md` items 45 and 53.
