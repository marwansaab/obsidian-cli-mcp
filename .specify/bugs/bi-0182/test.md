# Bug Verification: renamed parameters still surface under their old names on error paths

- **Slug**: bi-0182
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. The assessment's in-process probe was re-run against the fixed schemas: `property: ""` and `view: ""` now fail with the same issue as `name: ""` and `view_name: ""`, at the new name. The rows the owner's rulings left alone are unchanged: wrong-typed values on old keys still report the old key (Q3 A), and the `INVALID_SUBFOLDER` contract is unchanged (Q1 A). The success-only notice is documented everywhere (Q2 A). The full suite, typecheck and lint pass, with no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | The assessment's probe table (eight inputs) re-run through `safeParse` on the current schemas, as a throwaway vitest file in a temp directory (deleted afterwards). No vault and no CLI. | pass | Both defect rows now report `["name"]` / `["view_name"]`, identical to the new-name rows. Every other row matches the assessment's expected or by-ruling result. |
| New / updated tests | `npx vitest run src/tools/find_by_property src/tools/create_base src/tools/find_and_replace -t "BI-0182\|deprecated"` | pass | 45 passed, 343 skipped. This covers the four BI-0182 tests and the O2/O4 deprecated-name batteries. `fix.md` records that the four BI-0182 tests fail when the fix is stashed. |
| Regression (changed modules + surface) | `npx vitest run src/tools/find_by_property src/tools/create_base src/tools/find_and_replace src/tools/_register.test.ts src/tools/_surface.test.ts src/tools/_deprecated-params.test.ts src/help` | pass | 19 files passed, 1 skipped; 560 tests passed, 6 skipped. Includes the FR-018 fingerprint check against the regenerated baseline, the family-name surface checks and docs-sync. |
| Full suite + coverage | `npm test` | pass | 196 files passed, 1 skipped; 4815 tests passed, 6 skipped; 97.08% statements (floor 91.3%). |
| Type-check | `npm run typecheck` | pass | `tsc --noEmit`, exit 0. |
| Lint | `npm run lint` | pass | `eslint .`, exit 0. |
| Documentation claim (sub-item 3) | `grep -rn "call that uses" src docs README.md`, keeping only lines without "successful call" | pass | No match. No description or help page still claims that every call gets `deprecated_parameters`. |
| Documentation (sub-item 2) | Read `docs/tools/find_and_replace.md` | pass | Line 49 states that `INVALID_SUBFOLDER` and `details.subfolder` are stable until the next major release. The error roster (lines 129–130) is unchanged. |

## Output Excerpts

Post-fix probe (compare with the assessment's *Reproduction* table):

```
find_by_property {"property":"","value":"x"} -> ["name"] too_small / Too small: expected string to have >=1 characters
find_by_property {"name":"","value":"x"} -> ["name"] too_small / Too small: expected string to have >=1 characters
create_base {"path":"","name":"n"} -> ["base_path"] custom / INVALID_BASE_PATH/empty: base_path is empty
create_base {"base_path":"a.base","name":"n","view":""} -> ["view_name"] too_small / Too small: expected string to have >=1 characters
create_base {"base_path":"a.base","name":"n","view_name":""} -> ["view_name"] too_small / Too small: expected string to have >=1 characters
find_and_replace {"pattern":"a","replacement":"b","vault":"V","subfolder":"../x"} -> ["folder"] custom / path is not structurally safe (...)
find_by_property {"name":"a","value":"x","arrayMatch":"x"} -> ["arrayMatch"] invalid_type / Invalid input: expected boolean, received string
create_base {"path":5,"name":"n"} -> ["path"] invalid_type / base_path must be a string
```

Full suite:

```
 Test Files  196 passed | 1 skipped (197)
      Tests  4815 passed | 6 skipped (4821)
All files          |   97.08 |    94.73 |   92.36 |   97.84 |
```

## Residual Risks

- The reproduction ran in process against the schemas, as the assessment's own probe did. The envelope seen through the registered tool (`registerTool` → `VALIDATION_ERROR`) is covered by the two new `index.test.ts` cases. No live MCP client or Obsidian CLI was used; none is needed, because validation fails before anything is spawned.
- The published surface changed on purpose: the deprecated `property` and `view` keys no longer publish `minLength: 1`, and three descriptions were reworded. A client that validated those keys locally will now send `""` and receive the server-side error at the new name, which is the intended behaviour.
- By ruling, these remain: wrong-typed old-key values report the old key (Q3 A), and the folder errors keep the `subfolder`-named code and key (Q1 A). ADR-046 Decision 5 still lacks the word "successful"; `fix.md` *Follow-ups* records that.
- `npx prettier --check` warnings on the changed source files predate this fix (`fix.md`). Prettier is not part of `npm test`.

## Recommendation

Close the bug: verified. The reported symptom no longer reproduces, the regression tests pin it, and the full suite, typecheck and lint pass. Go on to open the PR, then review and the docs-as-code pass. The ADR-046 wording is for the owner or the docs-as-code step.
