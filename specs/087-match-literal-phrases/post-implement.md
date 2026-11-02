# Post-implement: 087 Match literal phrases

## T001 baseline

Branch `087-match-literal-phrases`, before any edit. `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell: all three passed.

- `tsc --noEmit`: clean.
- `eslint .`: clean.
- `npm test`: 179 test files passed, 1 skipped (180); 4308 tests passed, 6 skipped (4314). Coverage: statements 96.89%, branches 94.61%, functions 91.7%, lines 97.7%, above the 91.3% statement floor. The FR-018 baseline gate passed.

No pre-existing failure.

## T005 US1 red

`npx vitest run src/tools/search/literal-phrase.test.ts src/tools/search/handler.literal-phrase.test.ts src/tools/context_search/handler.literal-phrase.test.ts` before T006–T008:

- `literal-phrase.test.ts` (L1, L5): suite failed to load, `Error: Cannot find module './literal-phrase.js'`.
- `search/handler.literal-phrase.test.ts`: 8 of 8 failed (S1, S3 ×2, S8, S9 ×4) on the argv assertion, e.g. `expected [ 'search', 'query=alpha beta', …(1) ] to include 'query="alpha beta"'`.
- `context_search/handler.literal-phrase.test.ts`: 6 of 6 failed (C1, C3 ×2, C8, C9 ×2) on the argv assertion.

## T009 existing-test gate

`npx vitest run src/tools/search/handler.test.ts src/tools/context_search/handler.test.ts`, unedited, after T006–T008: 2 failed, 98 passed. The two failures were exactly the approved lines:

- `src/tools/search/handler.test.ts:41:16` (Q-1 default-mode happy path);
- `src/tools/context_search/handler.test.ts:44:16` (H1 happy path).

The condition of the owner's option-B approval held, so each line changed from `expect(argv).toContain("query=foo");` to `expect(argv).toContain('query="foo"');`. Nothing else in either file changed.

## T010 US1 green

`npx vitest run src/tools/search src/tools/context_search`: 9 files, 177 tests passed.

## T014 US2 red

The same three new files, before T015–T017: 11 failed, 18 passed.

- L7, L8 ×2: `TypeError: oneMatchPerLine is not a function`.
- S4, S5, S6, S7 and C4, C5, C6, C7 failed on the repeated or line-break rows.

S5 and C5 pin the returned lines as well as `count` and `truncated`. On the unfixed code, slicing the raw rows to the cap also gives `count: 2, truncated: true`, so the counts alone would not bite. The contract's S5 row already names lines `[1, 2]`; C5 pins `a.md:1`, `b.md:1`.

## T018 US2 green

`npx vitest run src/tools/search src/tools/context_search`: 9 files, 188 tests passed. Both existing `handler.test.ts` files pass with no edits beyond T009's two lines.

## T022 US3 green

L2, L3, L4, L6 (9 inputs), S2 (both modes) and C2 added. `npx vitest run src/tools/search src/tools/context_search`: 9 files, 203 tests passed. As planned, these rows passed when written, because US1 already implements the escape; T026's red check proves they bite.

## T023–T025 docs

- `docs/tools/search.md`: the literal-phrase paragraph on the `query` bullet; the one-per-line sentence on the line-mode `matches` row; the whole-phrase sentence on *Filename-match inflation*.
- `docs/tools/context_search.md`: the literal-phrase paragraph on the `query` bullet; the one-per-line sentence on the `matches` row.
- `CHANGELOG.md` `[Unreleased]`: the spec 087 line and the `### Fixed` bullet, verbatim from T025.

The ASCII-fold wording was not touched (research D7).

**Follow-up for `/speckit-docs-as-code`**: `docs/tools/context_search.md` *Missing folder* walk-through, step 1, still shows the first call as `obsidian search:context query=anything path=DoesNotExist format=json`. After this change the argv element is `query="anything"`. T024 and the contract say "change nothing else", so the line was left; the docs pass should correct it.

## T026 full gate and red check

- `npx vitest run src/tools/search src/tools/context_search`: 9 files, 203 tests passed.
- `npm test`: 182 files passed, 1 skipped (183); 4352 tests passed, 6 skipped (4358). Statements 96.9%, above the 91.3% floor. The FR-018 baseline gate passed without `npm run baseline:write`.
- `npm run typecheck`: clean.
- `npm run lint`: the first run reported one error, `` `./literal-phrase.js` import should occur before import of `./schema.js` `` (`import-x/order`) in `search/handler.ts`. The import was moved above `./schema.js`; the re-run is clean.

Red check, each step applied to both handlers in memory and restored from the saved text afterwards (`git diff` confirmed the restore):

1. `query: input.query`: 19 failed. S1, S2 ×2, S3 ×2, S8, S9 ×4; C1, C2, C3 ×2, C8, C9 ×2; and the two T009-edited existing assertions (Q-1, H1).
2. `oneMatchPerLine` bypassed: 8 failed. S4, S5, S6, S7; C4, C5, C6, C7. (C6 is not on the quickstart's step-2 list but also fails, on its count.)

Restored and re-run: 203 passed.

1000-line gate (`[System.IO.File]::ReadAllLines(p).Length`):

| File | Lines |
|---|---|
| `src/tools/search/literal-phrase.test.ts` | 69 |
| `src/tools/search/handler.literal-phrase.test.ts` | 166 |
| `src/tools/context_search/handler.literal-phrase.test.ts` | 130 |
| `src/tools/search/handler.test.ts` | 746 |
| `src/tools/context_search/handler.test.ts` | 596 |

## T027 published-surface gate

`git diff --stat main -- src/tools/_register-baseline.json src/tools/search/schema.ts src/tools/context_search/schema.ts src/tools/search/index.ts src/tools/context_search/index.ts src/errors.ts` printed nothing (contract P1, P2). `npm run baseline:write` was not run.

## T028 structural verification

`codegraph sync`, then `codegraph_explore "literalPhraseQuery oneMatchPerLine executeSearch executeContextSearch"`:

1. **No new error class or code.** `src/errors.ts` is unchanged (T027). The handler diffs add no `UpstreamError` construction; the only added imports are the `literal-phrase.js` lines.
2. **No DI factory import.** Neither handler imports `createLogger` or `createQueue`; both still receive logger and queue through `ExecuteDeps`. `server.ts` is unchanged.
3. **Module placement.** `literal-phrase.ts` imports only `import type { SearchContextWireFile } from "./schema.js"`. Its importers are exactly `search/handler.ts`, `context_search/handler.ts` (over the existing context_search → search edge) and `literal-phrase.test.ts`. No new cross-tool edge, no cycle.
4. **Reachable.** Both exports have production callers in both handlers.

No deviation from the plan's kernel-node no-touch claim: `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are untouched and gain no caller or construction site.

## T029 live check (required)

`npm run build`, then a Node script driving `node dist/index.js` over stdio with the SDK v2 `Client` / `StdioClientTransport`. Vault `TestVault-Obsidian-CLI-MCP` (confirmed with `Obsidian.com eval "code=app.vault.getName()"` → `=> TestVault-Obsidian-CLI-MCP`), folder `Sandbox/087-live-20261102175037/`. The script was kept outside the repository and the vault, and deleted afterwards.

Fixtures, one `obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=app.vault.create(…)"` per note (text passed base64-decoded): `p1` `alpha beta here`, `p2` `alpha only`, `p3` `beta only`, `p4` `beta alpha reversed`, `p5` `end alpha` / `beta start`, `p6` `alpha beta and alpha beta`, `p7` `say "hello" twice`, `p10` `-draft item`, `p11` `draft only`, `p12` `tag:urgent`, `p13` `body #urgent`, `p14` `a\b`. `obsidian files folder=…` listed all 12.

Every call passed `vault` and `folder`. All fixtures share one folder, so `alpha beta` correctly finds both notes that contain the phrase (`p1` and `p6`).

| Query | `search` | `context_search` | Result |
|---|---|---|---|
| `alpha beta` | `p1.md`, `p6.md` | `p1.md:1`, `p6.md:1` (p6's line once, though it holds the phrase twice) | PASS, PASS |
| `say "hello" twice` | `p7.md` | `p7.md:1` | PASS, PASS |
| `-draft` | `p10.md` (not `p11.md`) | `p10.md:1` `-draft item` | PASS, PASS |
| `tag:urgent` | `p12.md` (not `p13.md`) | `p12.md:1` `tag:urgent` | PASS, PASS |
| `a\b` | `p14.md` | `p14.md:1` `a\b` | PASS, PASS |

`p2`, `p3`, `p4` and `p5` (words apart, reversed, or split across a line break) were returned by no call.

**Cases attempted 10, passed 10, failed 0.**

Clean-up: `app.vault.delete(<folder>, true)` → `=> deleted`. Afterwards no `087-*` entry remains in `Sandbox/` (13 entries, as before the run), nothing from the run is in `.trash/`, and `Welcome.md` is present. No residue.
