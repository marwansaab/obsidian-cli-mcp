# Bug Fix: tag values read and matched in two forms depending on metadata-cache state

- **Slug**: bi-0181
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

For the property named exactly `tags`, `find_by_property` now removes one leading `#` from both the cached value and the query before comparing, and `read_property` returns `tags` values without one leading `#`. Both tools now give the same answer whichever form Obsidian's metadata cache holds (`bi-0166` or `#bi-0166`), and the form returned is the one written in the file. The rule "remove exactly one leading `#`" now lives in one leaf module, `src/tools/_tag-hash.ts`, which `read_property` and the `tag` tool's input schema both import. The eval template carries an inline copy because it cannot import.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/_tag-hash.ts` | added | Leaf module exporting `stripTagHash(tag)`: removes one leading `#`. No imports. |
| `src/tools/_tag-hash.test.ts` | added test | Pins the one-`#` rule (`#x`, `x`, `##x`, `#`, empty, inner `#`, leading space). |
| `src/tools/find_by_property/_template.ts` | modified | New `nt` arrow (identity unless `a.property === 'tags'`) applied to both sides inside `eq`, so the scalar, contains and exact-array branches all compare after the strip. Header comment updated. Payload is still base64 JSON; no user input is interpolated (R6). |
| `src/tools/find_by_property/_template.test.ts` | added test | Runs the template under `node:vm` through the shared `runEvalTemplate` harness with a stub `app.metadataCache`. |
| `src/tools/find_by_property/schema.ts` | modified | `value` parameter description gains the visible rule: for `tags`, one leading `#` is ignored on both sides. |
| `src/tools/read_property/handler.ts` | modified | `withoutTagHash` applied to the Call A value when `input.name === "tags"` (strings in a list, or a scalar string). `type` resolution and the heterogeneous-list downgrade are unchanged. Header comment updated. |
| `src/tools/read_property/handler.test.ts` | added tests | Five BI-0181 cases (see below). |
| `src/tools/read_property/index.ts` | modified | Tool description gains "tags values are returned without a leading "#", as written in the file." |
| `src/tools/tag/schema.ts` | modified | The inline `s.startsWith("#") ? s.slice(1) : s` transform now calls `stripTagHash`. Behaviour and published bytes unchanged (scope expansion, see Deviations). |
| `src/tools/_register-baseline.json` | regenerated | `npm run baseline:write`. Moved exactly two fingerprints: `find_by_property.schemaFingerprint` (the `value` description) and `read_property.descriptionFingerprint`. `tag` did not move. |
| `docs/tools/find_by_property.md` | modified | `value` and `array_match` rows; new *Tags and the leading `#`* section; *Hierarchical-tag rollup* "opaque values" sentence qualified; Example 3 note. |
| `docs/tools/read_property.md` | modified | `value` row's "Verbatim" claim qualified; new *Tags* section. |
| `CHANGELOG.md` | modified | `Fixed` entry under `[Unreleased]`, with the `read_property` behaviour change called out. |

## Diff Highlights

`find_by_property/_template.ts` (in-eval JS):

```js
const nt=a.property==='tags'?(x=>typeof x==='string'&&x.startsWith('#')?x.slice(1):x):(x=>x);
const eq=(x,y)=>(x=nt(x),y=nt(y),(typeof x==='string'&&typeof y==='string'&&!a.caseSensitive)?x.toLowerCase()===y.toLowerCase():x===y);
```

`arrEq` and both list branches call `eq`, so one change covers scalar, contains (`array_match: true`) and exact-array (`array_match: false`) matching. Case folding runs after the strip. Every other property gets the identity `nt`, so its comparison is unchanged.

`read_property/handler.ts`:

```ts
const value = input.name === TAGS_PROPERTY ? withoutTagHash(parsedA[input.name]) : parsedA[input.name];
```

## Tests Added or Updated

- `src/tools/find_by_property/_template.test.ts`
  - "query without # finds every note, whichever form the cache holds, and repeats identically": eleven notes, alternating `#project-x` / `project-x` in the cache, all returned, twice (criterion 1).
  - "query with # returns the same notes as the query without it" (criterion 2).
  - "scalar tags values are compared the same way".
  - "array_match false compares each element after the strip, and order still matters": `["a","b"]` and `["#a","b"]` both match cached `["a","b"]`, `["#a","b"]` and `["#a","#b"]`, not `["#b","#a"]`.
  - "case_sensitive false composes with the strip": `#Project-X` matches `project-x` and `#PROJECT-X` only when case-insensitive.
  - Boundary "strips only one #": cached `##x` matched by `##x`, not by `x` or `#x`.
  - "non-string elements in a tags list compare as before": `7`, `"7"`, `null`.
  - Boundary "leaves every other property strict": `keywords: ["#a"]` matched by `#a` only; `Tags: ["#a"]` not matched by `a`.
- `src/tools/read_property/handler.test.ts`
  - "BI-0181: cached #-form tags list → values without # (type list)".
  - "BI-0181: raw and #-form cache entries read back identically" (criterion 3).
  - "BI-0181: scalar tags string loses one leading # only" (`#solo` → `solo`, `##solo` → `#solo`).
  - "BI-0181 boundary: other properties keep their # verbatim (keywords, Tags)".
  - "BI-0181: heterogeneous tags list strips strings only and still downgrades to unknown" (`["#a", 1]` → `["a", 1]`, `type: "unknown"`).
- `src/tools/_tag-hash.test.ts`: the one-`#` rule table.
- Registration fingerprint: `_register.test.ts` baseline equality passes after the deliberate regeneration.

## Local Verification

- `npx vitest run src/tools/_tag-hash.test.ts src/tools/find_by_property src/tools/read_property src/tools/tag` → 11 files, 217 tests passed.
- Regression proof: with `find_by_property/_template.ts` temporarily restored to `HEAD`, `_template.test.ts` failed 5 of 8 (every `#`-normalisation case); the 3 boundary cases (one-`#` only, non-strings, other properties strict) passed on both, as they should. The fixed template was then put back (`git diff --stat` confirmed).
- `npm run baseline:write` → wrote 35 entries; the diff moves only the two fingerprints listed above plus `generatedFromBranch`.
- `npm run typecheck` → clean. `npm run lint` → clean.
- `npx vitest run` (full suite) → 195 files passed, 1 skipped; 4788 tests passed, 6 skipped.
- Manual checks: none. The live check in the assessment (two `Sandbox/` notes in the test vault, one brought into the `#` cache form with `property:set`) is left to `/speckit-bug-test`, which runs the vault scenarios under `.memory/test-execution-instructions.md`.

## CodeGraph structural verification

Queried with `codegraph_explore` on `stripTagHash`, `withoutTagHash`, `TAGS_PROPERTY`, `tagInputSchema` and `executeReadProperty` after the change.

1. **No new error codes** (Principle IV): no new error class or code; no failure path changed. `errors.ts` is untouched.
2. **No DI factory imports in handlers**: `read_property/handler.ts` imports only `cli-adapter`, `errors` and the new leaf; `createLogger()` / `createQueue()` stay confined to `server.ts`.
3. **Module placement and import direction** (Principle I): `src/tools/_tag-hash.ts` is a leaf with no imports. `read_property/handler.ts` and `tag/schema.ts` import it downward. No sideways tool → tool edge was added (the assessment ruled out importing from `tag/`).
4. **Reachable, not orphaned**: `stripTagHash` has production callers in `read_property/handler.ts` (through `withoutTagHash`, called from `executeReadProperty`) and `tag/schema.ts` (`tagInputSchema`, used by `tag/index.ts`). `withoutTagHash` and `TAGS_PROPERTY` are called from `executeReadProperty`.

**Kernel-node claim held**: the assessment said the fix touches none of the kernel nodes. It does not: `createLogger()`, `createQueue()`, `UpstreamError` and `createServer()` are unchanged, and both handlers still receive `logger` / `queue` through `ExecuteDeps`.

## Deviations from Assessment

- **Scope expansion: `src/tools/tag/schema.ts`** (not in *Files likely to change*; the assessment's structural check lists `tag` as not changed). Its inline one-`#` transform now calls the shared `stripTagHash`. Reason: the assessment requires the two tag-facing tools to follow the same rule, and its structural check says a strip helper factored out of `read_property` belongs in a shared `src/tools/_*.ts` sibling. Keeping `tag`'s inline copy as well would leave three copies of one rule; the repository's code-review record asks for one canonical home for a shared rule. The change is behaviour-identical (`tag`'s schema tests pass unchanged) and fingerprint-neutral (`tag`'s baseline entry did not move).
- **Added `src/tools/_tag-hash.ts` and `_tag-hash.test.ts`**: the assessment allowed for the helper ("if factored out") without naming the file. The test is co-located per Principle II.
- No other deviation. The template edit, the `read_property` strip, the key scope (exactly `tags`, case-sensitive), the one-`#` rule and the description, docs and CHANGELOG changes follow the Proposed Remediation and its resolved questions.

## Code-review fixes (PR #131)

The thermo-nuclear code-quality review found that the template's inline copy was avoidable: a frozen template can interpolate a JS-source fragment from a leaf module, as it already does with `B64_PAYLOAD_DECODE_EXPR`, and as the smart_connections templates do with `SORT_SLICE_AND_EMIT`. It also found that the value-level rule lived only in `read_property`. Both are fixed, with behaviour unchanged:

- `src/tools/_tag-hash.ts` now owns `TAGS_PROPERTY`, `withoutTagHash` (moved from `read_property/handler.ts`) and `WITHOUT_TAG_HASH_JS`, the same value-level rule as in-eval source.
- `find_by_property/_template.ts` interpolates `WITHOUT_TAG_HASH_JS` as `tg` and applies it once to the stored value and once to the query (`q`). `eq` is back to the bytes on `main`. The *Diff Highlights* above show the first version.
- `_tag-hash.test.ts` gains a parity table: `withoutTagHash` and `WITHOUT_TAG_HASH_JS` (run under `node:vm`) give the same answers. The `_template.test.ts` and `read_property` tests pass unchanged, and the fingerprint baseline did not move.

## Follow-ups

- Run the assessment's live check in `/speckit-bug-test`: seed two `Sandbox/` notes tagged `bi0181-live`, bring one into the `#` cache form with `property:set` on another key, confirm `find_by_property` with `bi0181-live` and `#bi0181-live` both return both notes and `read_property` on `tags` returns `["bi0181-live"]` for both, then clean up.
- `/speckit-docs-as-code` should record the `tags` rule on the `.docs-as-code/` pages for `find_by_property` / `read_property` and the new `_tag-hash.ts` leaf.
- If a later Obsidian version also caches other keys (`aliases`, custom lists) with `#`, a new report can widen the key scope; the probes found only a lowercase `tags` list in `#` form (assessment Risks).
