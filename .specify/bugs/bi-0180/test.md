# Bug Verification: create_base reports the path Obsidian created

- **Slug**: bi-0180
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. Against the authorised test vault, every `create_base` call returned the path of the note Obsidian created, with `name` set to that note's file name. This held for a folder-filtered Base (with and without `vault`), for a name collision, and for a Base with no folder rule where `name` carries a folder part. Each returned `path` opened with `read`. The full unit suite, typecheck and lint pass, and no regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), live | Built `dist/` (`npm run build`), then called `create_base` through the real MCP server (`createServer().buildMcpServer()` + in-memory client), spawning `Obsidian.com` against `TestVault-Obsidian-CLI-MCP`, with fixtures under `Sandbox/BI-0180-20261103225055/`; then `read` on each returned `path` | pass | 5/5 cases (L1–L5 below). Files on disk match the reported paths exactly; nothing was written to the vault root. |
| New / updated tests | `npx vitest run` (includes `src/tools/create_base/handler.test.ts`, `index.test.ts`) | pass | The five BI-0180 handler cases and the updated 083 C1/C2, index O1/O2/C10/C11 cases all pass. |
| Fix discriminates (from fix.md) | `npx vitest run src/tools/create_base` with only `handler.ts` reverted | pass | 15 failures against the pre-fix handler (recorded in fix.md); 0 with the fix. |
| Regression suite | `npx vitest run` | pass | 196 files passed, 1 skipped; 4807 tests passed, 6 skipped. |
| Registry fingerprint gate | Part of `npx vitest run` (`_register.test.ts` baseline equality) | pass | Only `create_base.descriptionFingerprint` moved, deliberately (fix.md). |
| Lint / type-check | `npm run lint`, `npm run typecheck` | pass | Both clean. |

### Live cases

Vault new-note location probed first: `newFileLocation: "root"`, `getNewFileParent('') → "/"`. So the no-folder-rule cases put a folder part in `name` to keep every write inside `Sandbox/`. That is also the report's "a `name` with a folder part" acceptance criterion.

`Filtered.base`: top-level `filters: and: [file.inFolder("Sandbox/BI-0180-20261103225055/Items")]`. `NoFilter.base`: no `filters`.

| Case | Input | Response | On disk | `read(path)` |
|------|-------|----------|---------|--------------|
| L1 folder filter, named vault | `Filtered.base`, `name: "BI0180 New Names"` | `path: "Sandbox/BI-0180-20261103225055/Items/BI0180 New Names.md"`, `name: "BI0180 New Names.md"` | same | ok |
| L2 collision | repeat of L1 | `path: ".../Items/BI0180 New Names 1.md"`, `name: "BI0180 New Names 1.md"` | same | ok |
| L3 folder filter, no `vault` (test vault focused) | `Filtered.base`, `name: "Focused Item"` | `path: ".../Items/Focused Item.md"`, `name: "Focused Item.md"` | same | ok |
| L4 no folder rule, folder part in name, named vault | `NoFilter.base`, `name: "Sandbox/BI-0180-…/Loose/Task1"` | `path: ".../Loose/Task1.md"`, `name: "Task1.md"` | same | ok |
| L5 no folder rule, folder part in name, no `vault` | `NoFilter.base`, `name: "Sandbox/BI-0180-…/Loose/Task2"` | `path: ".../Loose/Task2.md"`, `name: "Task2.md"` | same | ok |

Before the fix, L1 is the report's evidence 1 shape: it reported `<folder>/<folder>/<item>.md` with `name` equal to the full path. L1 and L4 also passed the named-vault post-creation backstop, which now checks the same value the response reports.

## Output Excerpts

```
L1 filtered, named vault -> {"path":"Sandbox/BI-0180-20261103225055/Items/BI0180 New Names.md","name":"BI0180 New Names.md"}
   read(path) -> ok
L2 filtered, named vault, collision -> {"path":"Sandbox/BI-0180-20261103225055/Items/BI0180 New Names 1.md","name":"BI0180 New Names 1.md"}
L4 no folder rule, folder part in name, named vault -> {"path":"Sandbox/BI-0180-20261103225055/Loose/Task1.md","name":"Task1.md"}
```

```
 Test Files  196 passed | 1 skipped (197)
      Tests  4807 passed | 6 skipped (4813)
```

## Cleanup

`Sandbox/BI-0180-20261103225055/` (two `.base` fixtures and five created notes) was deleted afterwards. The vault root, `Welcome.md` and the rest of `Sandbox/` match the pre-run listing. The temporary driver script lived outside the repository and vault, and was removed.

## Residual Risks

- **Item at the vault root not exercised live.** That is the report's evidence 2 (`Task1.md` at the root for a no-filter Base without a folder part in `name`). The test-vault rules forbid writes to the vault root, so the live cases used a folder part in `name` instead. The root shape is covered by unit tests (`Created: Task1.md` → `{ path: "Task1.md", name: "Task1.md" }`). It goes through the same code path as L4/L5: the `Created:` value is passed through unchanged.
- **Non-root new-note location** (a vault configured to put new notes in a folder) was not exercised live. The handler reports whatever `Created:` says, so it should hold. A vault set up that way would confirm it.
- **Backslash `Created:` values** are handled only defensively and covered by a unit test. No observed Obsidian output uses them.

## Recommendation

Close the bug once the PR passes review: verified end-to-end against the real CLI and covered by regression tests. Before merge, record the CHANGELOG entry and the deliberate `create_base` description-fingerprint change in the PR's MCP Tool Surface Standards line (fix.md Follow-ups).
