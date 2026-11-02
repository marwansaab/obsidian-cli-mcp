# Post-implement: 085 Stabilise query ordering

## T001 — Starting gate

Run on branch `085-stabilise-query-ordering` before any edit, in PowerShell:
`npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }`.

- `typecheck`: pass.
- `lint`: pass.
- `test`: pass — 172 test files passed, 1 skipped; 4,182 tests passed, 6 skipped. Coverage summary: statements 96.86%, branches 94.55%, functions 91.68%, lines 97.69%.

No pre-existing failure.

## T004 — Schemas still publish the same surface

`npx vitest run src/tools/smart_connections_query/schema.test.ts src/tools/smart_connections_similar/schema.test.ts src/tools/_register.test.ts`, with no `baseline:write`, after T002 and T003: 3 files, 153 tests, all pass unedited. Neither `schemaFingerprint` moved (contract S3, data-model V6).

## T007 — Red proof (US1 rows against the unfixed templates)

`npx vitest run src/tools/smart_connections_query/_template.test.ts src/tools/smart_connections_similar/_template.test.ts`: 8 failed, 9 passed.

| Row | Result | Assertion message |
|-----|--------|-------------------|
| T1 | fail | `expected [ { path: 'Z.md', …(2) } ] to deeply equal [ { path: 'A.md', …(2) } ]` |
| T2 | fail | `page(1) vs page(2): expected [ { path: 'N3.md', …(2) } ] to deeply equal [ { path: 'N3.md', …(2) } ]` (different heading paths in the same note) |
| T5 (limit 1) | fail | `expected 1 to be 100` |
| T5 (limit 20) | fail | `expected 20 to be 100` |
| T5 (limit 100) | pass | the old request already equals `MAX_LIMIT` at `limit: 100` |
| T6, T8, T9 | pass | allowed by T007 |
| T10 | fail | `expected [ { path: 'Z.md', …(2) } ] to deeply equal [ { path: 'A.md', …(2) } ]` |
| T11 | fail | `page(1) vs page(2): expected [ { path: 'N3.md', …(2) } ] to deeply equal [ { path: 'N3.md', …(2) } ]` |
| T13 (limit 1) | fail | `expected 1 to be 100` |
| T13 (limit 20) | fail | `expected 20 to be 100` |
| T13 (limit 100) | pass | as for T5 at `limit: 100` |
| T14, T15 | pass | allowed by T007 |

Every row T007 requires to fail (T1, T2, T5, T10, T11, T13) fails.

## T010 — Fix in place

After T008 and T009, `npx vitest run src/tools/smart_connections_query src/tools/smart_connections_similar`: 8 files, 183 tests, all pass. Each tool's `handler.test.ts`, `index.test.ts` and `schema.test.ts` pass unedited.

## Deviation — `smart_connections_similar.md` `limit` bullet wording (T016 vs S5)

T016 gave the bullet as "`limit` is applied after the filters and the sort below". Contract row S5 (T012) requires the page to match `/applied after (this|the) sort/`, which that wording does not. The bullet was written "`limit` is applied after the sort and the filters below" instead: the same statement, with the two items swapped so it satisfies S5. The rest of the T016 text is as given.

## T017 — Baseline diff (contract S3)

`npm run baseline:write`, then `git diff src/tools/_register-baseline.json`: 3 lines changed.

- `generatedFromBranch`: `083-enable-cross-vault-bases` → `085-stabilise-query-ordering` (expected metadata; `generatedAt` did not change).
- `smart_connections_query.descriptionFingerprint`: `c63f2151…99816a` → `c2065d95…82e7e0`.
- `smart_connections_similar.descriptionFingerprint`: `d4b98b30…c2b34b` → `e70785e3…f36928`.

No other fingerprint moved: every `schemaFingerprint`, `outputSchemaFingerprint`, `titleFingerprint` and `annotationsFingerprint` is unchanged, and no other tool's entry changed.

## T018 — Surface suites

`npx vitest run src/tools/smart_connections_query src/tools/smart_connections_similar src/tools/_register.test.ts src/tools/_surface.test.ts`: 10 files, 355 tests, all pass, S1, S2, S4 and S5 included. Before T013–T016 the four new S cases failed, as T011 and T012 require.

## T021 — Red check with the US2 rows (both tools)

1. Reverted in place: `filter:{limit:${MAX_LIMIT}}` → `filter:{limit:a.limit}` and `find_connections({limit:${MAX_LIMIT}})` → `find_connections({limit:a.limit})`.
2. Both `_template.test.ts` files: 11 failed, 10 passed.
   - `smart_connections_query`: T1, T2, T5 (limit 1), T5 (limit 20), T4, T7 failed. T7 was allowed to pass; it fails because its finite candidates arrive with ties out of order, so a cut before the sort changes the page at `limit: 2`.
   - `smart_connections_similar`: T10, T11, T13 (limit 1), T13 (limit 20), T12 failed.
   - T3, T6, T8, T9, T14, T15 and the `limit: 100` cases of T5/T13 passed.
3. Restored both files from the saved content. The SHA-256 of each file after the restore equals its hash before the revert, and `git diff` of both templates shows only the T008/T009 changes (the `MAX_LIMIT` import, the request line and the header comment).
4. Re-run: 21 tests, all pass.

## T023 — Full gate

- `typecheck`: pass. `lint`: pass.
- `test`: pass. 174 test files passed, 1 skipped; 4,207 tests passed, 6 skipped (T001: 172 / 4,182; the difference is the two new `_template.test.ts` files and the four new S cases). Coverage: statements 96.87%, branches 94.55%, functions 91.68%, lines 97.69%.
- `format:check`: **fails, and this is pre-existing, not caused by this feature.** T001 did not run it, and CI (`.github/workflows/ci.yml`) does not run it either. Repository-wide, `prettier --check .` flags 1,268 files on this Windows checkout (CRLF working copy), and 1,019 even with `--end-of-line auto`. The files this feature touched were checked one by one:
  - the two new `_template.test.ts` files and both edited `index.test.ts` files were formatted (their HEAD versions were clean) and pass `prettier --check`;
  - both `_template.ts` files pass with `--end-of-line auto`, as at HEAD;
  - both `schema.ts` and both `index.ts` already failed at HEAD. After this change, prettier's diff for each is the same size as at HEAD (83, 42, 16 and 21 changed lines), so this feature added no new formatting issue.

## T024 — Post-implement structural verification

`codegraph sync`, then `codegraph_explore "MAX_LIMIT JS_TEMPLATE smartConnectionsQueryInputSchema smartConnectionsSimilarInputSchema executeSmartConnectionsQuery executeSmartConnectionsSimilar"`.

1. **No new error class or code.** `git diff HEAD -- src/errors.ts` is empty. No new `UpstreamError` is constructed; the handlers are unchanged.
2. **DI discipline.** `git diff HEAD -- src/server.ts` is empty, and no file in either tool directory imports `createLogger` or `createQueue`.
3. **Imports.** Each `_template.ts` imports only `./schema.js` (`MAX_LIMIT`) and `../_shared.js` (`B64_PAYLOAD_DECODE_EXPR`). Neither `schema.ts` imports its template (query: `zod`, `../_vault-field.js`; similar: `zod`, `../../target-mode/target-mode.js`). No tool → tool edge: neither tool imports the other.
4. **Reachability.** Each `MAX_LIMIT` is used in production by its `schema.ts` (`.max(MAX_LIMIT)`) and by its `_template.ts` (`JS_TEMPLATE`), which its handler renders (`executeSmartConnectionsQuery` / `executeSmartConnectionsSimilar` → `composeEvalCode(JS_TEMPLATE, …)`), and the handler is called from its `index.ts`.

**Kernel-node no-touch claim holds.** `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are not edited, and no production file gains a call to them. The `src/` files changed are the two tools' `schema.ts`, `_template.ts`, `index.ts` and `index.test.ts`, the two new `_template.test.ts` files, and `_register-baseline.json`.

## Review fixes (PR #116 code-quality review)

- `src/tools/_smart-connections.ts` (new) exports `MAX_LIMIT` and `SORT_SLICE_AND_EMIT`; both `_template.ts` files interpolate the tail, and both `schema.ts` and `index.ts` interpolate `MAX_LIMIT` into `.max`, `.describe` and the descriptions.
- Byte identity: a temporary test captured both `JS_TEMPLATE` strings, both tool descriptions and both `limit` parameter descriptions before the change and compared them after; all six were identical. The FR-018 baseline gate passed and `_register-baseline.json` did not move.
- Tests: `runEvalTemplate` in `src/tools/_eval-template-fixtures.ts` replaces the four hand-written vm harnesses (create_base, links, both smart_connections); the ordering oracle is shared in `src/tools/_smart-connections-fixtures.ts`. Both match the `_*fixtures.ts` build and coverage excludes; `dist/tools` holds `_smart-connections.js` only. T2/T11 now compare each page against page(100) (tasks.md Notes). The S2/S5 docs tests reuse a describe-scoped `docsPath`.
- Structural re-check after `codegraph sync`: no new error code, `src/errors.ts` and `src/server.ts` untouched, no kernel node touched; `_smart-connections.ts` imports nothing and is imported only by the two tools' `schema.ts`, `_template.ts` and `index.ts` (and their tests); no tool → tool edge.

## T025 — SC-005

**SC-005 unverified live: no Smart Connections vault available.** `TestVault-Obsidian-CLI-MCP` has no plugins, and this unattended run was not granted access to the local Obsidian MCP tools, so no other vault could be checked. Nothing was written to any vault.

Fallback evidence (spec SC-005): `limit: 100` is already an allowed input for both tools, so the 100-candidate request each call now makes is a size both tools already made. The transport payload is still cut to `limit` inside the eval, so the stdout size per call is unchanged.
