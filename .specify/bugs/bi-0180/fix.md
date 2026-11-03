# Bug Fix: create_base reports the path Obsidian created

- **Slug**: bi-0180
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`executeCreateBase` now returns the `Created:` value from `base:create` (trimmed, backslashes normalised to `/`) as the response `path`, and its last segment as `name`, instead of composing `<baseDir>/<baseName>/<Created:>`. The named-vault backstop checks that same value, so the reported path and the checked path are one value. The published description and the help page now describe where Obsidian places the item.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/create_base/handler.ts` | modified | `path` = normalised `Created:` value; `name` = `posix.basename(path)`; `baseDir`/`baseName`/`itemDir` composition removed; backstop receives the same `createdPath`; parse-failure message says `'Created: <path>'`. |
| `src/tools/create_base/handler.test.ts` | modified + added tests | Five BI-0180 cases added; four existing expectations that pinned the composed shape updated; 083 C2 now also asserts the backstop resolved the reported path. |
| `src/tools/create_base/index.ts` | modified | `CREATE_BASE_DESCRIPTION` Response paragraph rewritten to describe the real path and name. |
| `src/tools/create_base/index.test.ts` | modified | Stubs that pair `Tasks.base` with a `Tasks/` result now report `Created: Tasks/New item.md` (expected values unchanged); C10 expects `New item.md`; the description assertion follows the new wording. |
| `src/tools/_register-baseline.json` | regenerated | Only `create_base.descriptionFingerprint` moved (plus `generatedFromBranch`). Input, output, title and annotations fingerprints unchanged. |
| `docs/tools/create_base.md` | modified | Output example and bullets, collision section ("in the folder the item lands in"), and Examples 1–2 now show the `file.inFolder` folder as the item's location. |

## Diff Highlights

```ts
// src/tools/create_base/handler.ts
const createdPath = match[1]!.trim().replace(/\\/g, "/");
await checkCreated?.(createdPath);

return createBaseOutputSchema.parse({ path: createdPath, name: posix.basename(createdPath) });
```

## Tests Added or Updated

- `handler.test.ts` › `BI-0180: folder-filtered base → path is the filter folder's item, name is the file name` — `Created: Fixtures/X/Items/New Item.md` for `Fixtures/X/Filtered.base` → `{ path: "Fixtures/X/Items/New Item.md", name: "New Item.md" }`.
- `handler.test.ts` › `BI-0180: base with no folder rule, root new-note location → path is the root file` — `Created: Task1.md` for `Fixtures/BI-0083/target.base` → `{ path: "Task1.md", name: "Task1.md" }`.
- `handler.test.ts` › `BI-0180: folder part in name → path keeps it, name is the last segment` — `Items/sub/Item.md` → `name: "Item.md"`.
- `handler.test.ts` › `BI-0180: collision in a folder → name carries the suffix` — `Items/Task 1.md` → `name: "Task 1.md"`.
- `handler.test.ts` › `BI-0180: a backslash-separated Created: path is reported with forward slashes` — pins the defensive normalisation (and CRLF trimming).
- `handler.test.ts` › `083 C2: named vault … result is the Created: path` — was pinning the buggy `Tasks/Tasks/New.md`; now `{ path: "Tasks/New.md", name: "New.md" }`, and the realpath seam shows the backstop resolved `<vault>/Tasks/New.md`, the reported path.
- `handler.test.ts` › `happy: …`, `happy: root-level base …`, `name collision auto-increment (R-005)`, `083 C1: no vault …` — expectations moved from the composed path to the `Created:` path.
- `index.test.ts` › `deps wired through`, `C10`, `O1`, `O2`, `083 C11`, `description uses the new names …` — see Changes.

## Local Verification

- `npm run baseline:write` → wrote 35 entries; diff shows only `create_base.descriptionFingerprint` changed.
- `npx vitest run` → 196 files passed, 1 skipped; 4807 tests passed, 6 skipped.
- `npm run typecheck` → clean. `npm run lint` → clean.
- Regression proof: with only `handler.ts` reverted to the pre-fix version, `npx vitest run src/tools/create_base` → 15 failures (every new and updated path/name case); restored afterwards.
- Live check against the test vault is left to `/speckit-bug-test`, per `.memory/test-execution-instructions.md` (assessment, Tests to add or update).

## CodeGraph structural verification

1. **No new error codes**: none. The `CREATED_PATTERN` miss still throws the existing `CLI_REPORTED_ERROR` with `stage: "response-parse"`; only its message text changed (`<filename>` → `<path>`). No error class added outside `src/errors.ts`.
2. **No DI factory imports**: `handler.ts` imports are unchanged; `createLogger()` / `createQueue()` stay confined to `server.ts`, and the handler gets them through `ExecuteDeps`.
3. **Module placement and import direction**: the change is local to `executeCreateBase` in `src/tools/create_base/`; no new imports (`posix` was already imported and is still used by `containNamedVaultTarget`).
4. **Reachability**: no new production symbols (`createdPath` is a local). `executeCreateBase` keeps its callers in `create_base/index.ts`.

Kernel-node claim from `assessment.md` ("the fix touches none of them") held: `createLogger()`, `createQueue()`, `UpstreamError` and `createServer()` are unchanged, and `UpstreamError` is used, not modified.

## Deviations from Assessment

- **More existing expectations than enumerated.** The assessment listed `handler.test.ts:189` and `:226` and `index.test.ts:206/216/224/248`. Three more handler tests (`happy: parsed filename + constructed path`, `happy: root-level base file path construction`, `name collision auto-increment (R-005)`) and the description assertion at `index.test.ts:297` also pinned the composed shape or the old wording. They fall under the assessment's "Update every existing expectation that pins the composed shape", so they were updated; the first two were also retitled to describe the new behaviour.
- **Index tests: stubs changed rather than expectations.** In `deps wired through`, `O1`, `O2` and `083 C11`, the stub now reports `Created: Tasks/New item.md` (a realistic folder-filtered result; C11's eval already says the item folder is `Tasks`), so the expected `path: "Tasks/New item.md"` / `name: "New item.md"` stay as they were. They still fail against the old handler. `C10` keeps its root stub and now expects `path: "New item.md"`.
- **One extra test** pins the defensive backslash normalisation the remediation called for.

## Follow-ups

- CHANGELOG: record the `create_base` response fix (callers that stripped a prefix from `path`, or read `name` as a path, see different values; the old values never pointed at a real file).
- PR's MCP Tool Surface Standards line: the `create_base` description fingerprint moved deliberately; input and output schemas unchanged.
- `/speckit-docs-as-code`: `.docs-as-code/capabilities/bases.md` and the ADR-053 page record this bug as open.
- Refactor-decisions item 16: `create_base/handler.test.ts` still has no bespoke `makeSpawn` (it already uses `makeQueuedSpawn`); that note looks stale, so worth checking at review.
- `/speckit-bug-test slug=bi-0180`: live folder-filtered and no-filter Bases in the authorised test vault, then `read` the returned path.
