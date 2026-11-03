# Bug Fix: renamed parameters still surface under their old names on error paths

- **Slug**: bi-0182
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

An empty value sent under a deprecated parameter name now fails exactly like the same value under the current name. The redundant `min(1)` checks on the `property` (`find_by_property`) and `view` (`create_base`) alias fields are gone, so the check runs once, after the fold, on `name` and `view_name`. The three renamed tools' descriptions and help pages now say that only a successful call carries `deprecated_parameters`. The `find_and_replace` help page states that the folder errors deliberately keep `INVALID_SUBFOLDER` and `details.subfolder` until the next major release. This follows the owner's rulings on Q1, Q2 and Q3, all option A.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/find_by_property/schema.ts` | modified | `property: deprecatedAlias(z.string(), PROPERTY_RENAME)`: `min(1)` dropped, with a one-line comment saying why (sub-item 1). |
| `src/tools/create_base/schema.ts` | modified | `view: deprecatedAlias(z.string(), VIEW_RENAME)`: `min(1)` dropped, with the same comment (sub-item 1). |
| `src/tools/find_by_property/index.ts` | modified | Description: "a successful call that uses one gets `deprecated_parameters` in its result; error responses do not carry it" (sub-item 3). |
| `src/tools/find_and_replace/index.ts` | modified | The same description wording (sub-item 3). |
| `src/tools/create_base/index.ts` | modified | The same description wording (sub-item 3). |
| `src/tools/_register-baseline.json` | regenerated | `npm run baseline:write`. This is a deliberate FR-018 move. Exactly three entries changed: `find_by_property` (description and schema), `create_base` (description and schema), `find_and_replace` (description only). The schema moves are the loss of `minLength: 1` on the deprecated `property` and `view` keys. |
| `docs/tools/find_by_property.md` | modified | The success-only notice wording. Also a new bullet: `property: ""` fails like `name: ""`, at `path: ["name"]`. |
| `docs/tools/create_base.md` | modified | The success-only notice wording. The existing "validation reports the new name" bullet gains the `view: ""` / `view_name` case. |
| `docs/tools/find_and_replace.md` | modified | The success-only notice wording. Also a new bullet (sub-item 2, Q1 A): the folder errors keep the stable code `INVALID_SUBFOLDER` and the `details.subfolder` key until the next major release, and their messages name `folder`. |
| `src/tools/find_by_property/schema.test.ts` | added test | Empty `property` and empty `name` give identical issues at `["name"]`. |
| `src/tools/create_base/schema.test.ts` | added test | Empty `view` and empty `view_name` give identical issues at `["view_name"]`. |
| `src/tools/find_by_property/index.test.ts` | added test, updated assertion | Adds an envelope-identity test through the registered tool. The description assertion changes to the success-only wording. |
| `src/tools/create_base/index.test.ts` | added test, updated assertion | The same as above, for `view` / `view_name`. |
| `src/tools/find_and_replace/index.test.ts` | updated assertion | The description assertion changes to the success-only wording. |

## Diff Highlights

```ts
// find_by_property/schema.ts
-    property: deprecatedAlias(z.string().min(1), PROPERTY_RENAME),
+    // No min(1) on the alias: the folded `name` checks the value, so an empty `property` reports `name`.
+    property: deprecatedAlias(z.string(), PROPERTY_RENAME),

// create_base/schema.ts
-  view: deprecatedAlias(z.string().min(1), VIEW_RENAME),
+  // No min(1) on the alias: the folded `view_name` checks the value, so an empty `view` reports `view_name`.
+  view: deprecatedAlias(z.string(), VIEW_RENAME),
```

## Tests Added or Updated

- `src/tools/find_by_property/schema.test.ts` › "BI-0182: empty property reports the same single issue as empty name, at [name]". Pins one `too_small` issue at `["name"]`, deep-equal to the `name: ""` issues.
- `src/tools/create_base/schema.test.ts` › "BI-0182: empty view reports the same single issue as empty view_name, at [view_name]". The same check for `view`.
- `src/tools/find_by_property/index.test.ts` › "BI-0182: property: "" returns the same VALIDATION_ERROR envelope as name: "", at [name], with no notice". The whole tool result equals the `name: ""` result, and `details` has no `deprecated_parameters` key, which pins the success-only rule.
- `src/tools/create_base/index.test.ts` › "BI-0182: view: "" returns the same VALIDATION_ERROR envelope as view_name: "", at [view_name]". The same check through the registered tool.
- The description tests in the three `index.test.ts` files ("description uses the new names … lists the deprecated ones") now assert the success-only wording, as the assessment's *Tests to add or update* requires for sub-item 3.
- Unchanged and still passing: the O2 equivalence and O4 conflict batteries (`deprecatedAliasCases`, with the `property` + `name` conflict still at `["property"]`), the `_surface.test.ts` family checks, and the `find_and_replace` `INVALID_SUBFOLDER` assertions, which still pin the frozen contract.

## Local Verification

- The fix was stashed to check that the new tests catch the bug. Without it, all four `BI-0182` tests fail (the issue lands at `["property"]` / `["view"]`). With the fix, they pass.
- `npx vitest run src/tools/find_by_property src/tools/create_base src/tools/find_and_replace` → 16 files passed, 1 skipped; 382 tests passed, 6 skipped.
- `npm run baseline:write` → 35 entries written; the diff touches only the three tools above.
- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `npm test` (with coverage) → 196 files passed, 1 skipped; 4815 tests passed, 6 skipped; 97.08% statements, above the 91.3% floor.
- `npx prettier --check` on the changed source files reports style warnings. They were already there before this change: `find_by_property/schema.ts` fails the same check with the fix stashed. They were left alone to keep the diff small.
- No live CLI or vault was used. All the tests above are in-process.

## CodeGraph structural verification

These are the four post-fix checks on the changed symbols (`findByPropertyArgsSchema`, `createBaseArgsSchema`, `FIND_BY_PROPERTY_DESCRIPTION`, `CREATE_BASE_DESCRIPTION`, `FIND_AND_REPLACE_DESCRIPTION`):

1. **No new error codes.** Nothing was added to `src/errors.ts`, and no `UpstreamError` construction changed. The empty-value failure goes through the existing generic `VALIDATION_ERROR` envelope.
2. **No DI factory imports in handlers.** No imports changed. `createLogger()` and `createQueue()` are still constructed only in `server.ts`.
3. **Placement and import direction.** No new symbols or imports. Both schema edits narrow an existing field inside its own tool module.
4. **Reachability.** No new production symbols. The changed schemas and descriptions keep their existing callers in each tool's `index.ts`.

**Kernel-node claim.** The assessment said the fix touches no kernel node. That held: `createLogger()`, `createQueue()`, `createServer()` and the `UpstreamError` class are all unchanged. `registerTool` and `deprecatedAlias` / `foldDeprecatedAliases` are unchanged as well.

## Deviations from Assessment

- **Documentation slightly beyond the listed wording.** `docs/tools/find_by_property.md` gains one bullet, and `docs/tools/create_base.md` one sentence, stating that an empty value under the old name reports the new name. Sub-item 1 makes that observable behaviour, and `create_base.md` already documents the matching `path` → `base_path` case. Prose only, no code impact.
- **Existing assertions edited.** The three description assertions in the `index.test.ts` files pinned the old sentence verbatim, so they had to change. The assessment's *Tests to add or update* already calls for this ("each tool's description test asserts the success-only wording"), and the owner's Q2 ruling (option A) approved the wording change. No other existing assertion failed or was changed, so the assessment's "no existing test edit is expected for sub-item 1" held.

## Follow-ups

- ADR-046 Decision 5 says "the call's result carries" the notice without the word "successful". This fix leaves `.decisions/` alone. The owner, or the `/speckit-docs-as-code` pass, may want to say "successful" there and in `.docs-as-code/`.
- The `INVALID_SUBFOLDER` code and the `details.subfolder` key get renamed together with the alias removal at the next major release (Q1 A).
- Wrong-typed values on old keys (`arrayMatch: "x"`, `path: 5`) still report the old key, by ruling (Q3 A).

## Review fixes (PR #135 code-quality review)

The code-quality review of PR #135 raised three findings. All three are fixed within the assessment's remediation. No published byte moved: the FR-018 gate passes against the baseline this fix already regenerated, without a further `baseline:write`.

- **Q4: parity when a call has two mistakes (owner ruling 2026-11-03, option A).** The current-name keys `name` (`find_by_property`) and `view_name` (`create_base`) keep `.min(1)` on the published object. An issue there stops the transform→pipe before the folded schema's superRefine runs. With a second mistake, the old-name call therefore also reports that mistake, while the current-name call stops at the first issue. Every issue still names the current key, so ADR-046 Decision 5 and the BI criterion, which covers a call with one mistake, are met. Option B, moving those checks into the folded schema, was declined because it would narrow the published schema of the current-name keys. The help pages for both tools no longer say "fails exactly like"; they describe the two-mistake behaviour, and the CHANGELOG entry gains the same sentence. One test per tool pins it: `{property: "", value: ["x"]}` reports issues at `[name]` and `[value]`, and `{view: "", name: ""}` reports issues at `[view_name]` and `[name]`.
- **The alias rule has one home.** The two copied call-site comments are gone. The doc comment of `deprecatedAlias` (`src/tools/_deprecated-params.ts`) now states the rule: an alias field takes the value's type only, never a value check, because the folded schema checks the value under the replacement name. `deprecatedAliasCases` (`src/tools/_deprecated-params-test-cases.ts`) takes an optional invalid value per replacement and builds parity cases: the old-name and new-name payloads must fail with identical issues. These rows replace the two bespoke BI-0182 schema tests. They also cover `path` → `base_path` (`""`) and `subfolder` → `folder` (`"../x"`), which already behaved correctly. A check that restored `.min(1)` on the `property` and `view` aliases fails all four BI-0182 schema rows.
- **One builder for the "Deprecated names" line.** `deprecatedNamesNote(renames)` in `_deprecated-params.ts` builds the line from each tool's `*_RENAMES` table. An inverted rename gets " (opposite value)". The three `index.ts` descriptions use it, and the output is byte-identical: the fingerprint gate passes unchanged. The per-tool `index.test.ts` description assertions keep their literal sentences as the independent check, and `_deprecated-params.test.ts` pins the helper.

Quality gates after the review fixes: `npm run typecheck` clean, `npm run lint` clean, `npm test` 196 files passed (1 skipped), 4820 tests passed (6 skipped), 97.08% statements.
