# Bug Fix: set_property writes wikilink lists as one scalar and splits list items on commas

- **Slug**: bi-0203
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`set_property` now sends an array value as a JSON array (`value=["[[A]]","[[B]]"]`) whenever the resolved type is `list`, so the CLI stores exactly the items sent, in order. Before the fix the handler joined the items with commas, which made the CLI split items containing a comma and store any wikilink list as one quoted scalar. An array sent with an explicit non-list `type` keeps today's comma-joined wire form byte for byte (owner ruling, option B).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/set_property/handler.ts` | modified | `serialiseValue(value, resolvedType)`: an array with resolved type `list` returns `JSON.stringify(value)` (`[]` stays the literal `"[]"`); an array with an explicit non-list type keeps `"[]"` / `value.join(",")`. `executeWriteProperty` passes the `resolvedType` it already computes. Header and inline comments describe the JSON wire form (BI-0203). |
| `src/tools/set_property/handler.test.ts` | updated 2 tests, added 8 | Cases (5) and (6) assert the JSON wire form; new cases (6a)–(6h) (the first six as one `test.each` table) cover the reported symptoms, escaping, the explicit `type: "text"` path and the two other target modes. |
| `docs/tools/set_property.md` | modified | Value serialisation table (string[], 1-element list, wikilink list, explicit non-list type rows) plus a paragraph on the JSON wire form; Example 2's argv; the "List elements containing literal `,` characters" known limitation replaced by "An array with an explicit non-list `type`"; the `obsidian_exec` reference bullet no longer names comma-in-list-element cases. The page is runtime payload (`help` serves it), so it moves with the fix. |

## Diff Highlights

```ts
export function serialiseValue(
  value: WritePropertyInput["value"],
  resolvedType: PropertyWriteTypeLabel,
): string {
  if (Array.isArray(value)) {
    if (resolvedType === "list") return JSON.stringify(value);
    if (value.length === 0) return "[]";
    return value.join(",");
  }
  ...
}
```

```ts
const resolvedType = inferType(input.value, input.type);
const serialisedValue = serialiseValue(input.value, resolvedType);
```

## Tests Added or Updated

Existing assertions changed (exactly the two the assessment lists, per `.memory/refactor-decisions.md` item 5):

- `handler.test.ts` (5) — `value=alpha,beta,gamma` → `value=["alpha","beta","gamma"]`; "comma-joined"/"joined" dropped from its title and comment.
- `handler.test.ts` (6) — `value=alpha` → `value=["alpha"]`.

Case (7) (`value=[]`) and every scalar case pass unchanged. `index.test.ts`, `_typed-result-fixtures.ts` and `_plugin-noise.test.ts` are untouched.

New cases in `src/tools/set_property/handler.test.ts`. (6a)–(6f) are rows of one `test.each` table (PR #150 review): each pins the whole specific+path argv, so the value lands as exactly one argv element.

- (6a) wikilink list without `type` → `value=["[[A]]","[[B]]"]` and `type=list` (TC-00904, criterion 2).
- (6b) the same list with explicit `type: "list"` (criterion 1).
- (6c) one-link list → `value=["[[A]]"]` (criterion 3).
- (6d) `["one","two, three"]` → `value=["one","two, three"]` (TC-00905, criterion 4).
- (6e) items with `"`, `\` and a comma → the exact JSON-escaped `value=["a \"q\" b","back\\slash","Smith, John"]`.
- (6f) `value: ["a","b"], type: "text"` → `value=a,b` with `type=text` (owner ruling, option B).
- (6g) specific+file mode: the `property:set` call carries the JSON wire form.
- (6h) active mode: the `property:set` call carries the JSON wire form.

## Local Verification

- `npx vitest run src/tools/set_property` → 3 files, 73 tests passed.
- `npx tsc --noEmit -p .` → exit 0.
- `npx eslint src/tools/set_property` → exit 0.
- `npx vitest run` (full suite) → 203 files passed, 1 skipped; 5079 tests passed, 6 skipped.
- The schema fingerprint gate (`_register.test.ts`, FR-018 baseline) passed without `baseline:write`: no published-surface change.
- Manual checks: none in this step. Live-CLI confirmation of TC-00904 and TC-00905 (with a `read_property` read-back) is left to `/speckit-bug-test`, under `.memory/test-execution-instructions.md`. The assessment's live probes already showed the CLI accepts this exact JSON wire form.

## CodeGraph structural verification

Ran `codegraph_explore` on `serialiseValue`, `inferType` and `executeWriteProperty` after the change.

1. **No new error codes** (Principle IV): none. No `UpstreamError` construction was added or changed, and no new error class exists outside `src/errors.ts`.
2. **No DI-factory imports**: `handler.ts`'s imports are unchanged (`cli-adapter`, `errors`, `_eval-parse` and type-only imports). It does not import `createLogger()` or `createQueue()`.
3. **Module placement and import direction**: the change stays in `src/tools/set_property/handler.ts`. No new imports, so import direction is unchanged (Principle I).
4. **Reachability**: `serialiseValue` still has its one production caller, `executeWriteProperty`, which `createSetPropertyTool` (`index.ts`) reaches. Nothing orphaned.

**Kernel-node claim held**: the assessment said the fix touches none of `createLogger()`, `createQueue()`, `UpstreamError` or `createServer()`, and it touches none of them.

## Deviations from Assessment

None. The fix stays within the three files the assessment lists and follows the option B remediation as amended.

## Follow-ups

- `/speckit-bug-test slug=bi-0203`: live-CLI confirmation of TC-00904 / TC-00905 in the authorised test vault, including `read_property` read-back.
- `/speckit-docs-as-code`: `.docs-as-code/` pages that describe the `set_property` wire form or the comma limitation, and the vault Tool Notes bullet on single-element wikilink lists (the same root cause; vault notes are outside this repository).
- `specs/018-write-property/research.md` R9 / F13 and `data-model.md`'s value-serialisation table still describe the comma join. They are historical spec records, so they are left as they are.
