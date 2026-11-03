# Bug Fix: A registered vault whose folder is missing fails with a raw ENOENT string

- **Slug**: bi-0185
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`assertCanonicalPath` (`src/tools/_active-file.ts`), the shared Layer-2 guard of the eight affected tools, now classifies a vault root that cannot be resolved instead of letting Node's errno escape. ENOENT / ENOTDIR on the root becomes `CLI_REPORTED_ERROR` with `details: {code: "VAULT_NOT_FOUND", reason: "folder-missing", vault}` and a recovery hint; any other errno on the root becomes `CLI_REPORTED_ERROR` with `details: {stage: "vault-root-check", errno, vault}`. Neither the message nor `details` carries the absolute path. Each affected tool's `docs/tools/*.md` error roster lists both rows.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/_active-file.ts` | modified | `assertCanonicalPath` wraps `checkCanonicalPath`; on a throw, the private `canonicalCheckFailure` re-probes the vault root and classifies it, reading the errno with the shared `getErrno` (`_fs-errors.ts`, PR #136 review). Header comment names the new classification. One new import edge, `_active-file.ts` → `_fs-errors.ts`, two tools-layer leaf modules; `_fs-errors.ts` imports only `../errors.js`, so there is no cycle. The `CanonicalCheckOutcome` type comes from the module already imported. |
| `src/tools/_active-file.test.ts` | added tests | New `describe` block "vault root cannot be resolved (BI-0185)": 8 cases. |
| `src/tools/_handler-test-fixtures.ts` | added fixtures | `missingFolderRealpath(root, code = "ENOENT")` and `folderMissingDetails(vault)`, shared by the nine new handler/index cases and, through `code`, by the ENOTDIR / EPERM / EIO cases in `_active-file.test.ts` (PR #136 review). Vitest-free, like the rest of the module. |
| `src/tools/query_base/handler.test.ts` | added test | Handler-level case, no spawn. |
| `src/tools/query_base/index.test.ts` | added test | Registered-tool case: `isError: true` JSON envelope, not free text (acceptance criterion 6). |
| `src/tools/create_base/handler.test.ts` | added test | Named-vault mode, nothing spawned. |
| `src/tools/find_and_replace/handler.test.ts` | added test | `it.each` over vault-wide and single-note-by-path scopes, no spawn. |
| `src/tools/write_note/handler.test.ts` | added test | `path` locator, no spawn, no mkdir, no write. |
| `src/tools/append_note/handler.test.ts` | added test | `path` locator, no spawn, no read. |
| `src/tools/prepend/handler.test.ts` | added test | `path` locator, no spawn, no stat. |
| `src/tools/patch_block/handler.test.ts` | added test | `path` locator, no spawn, no read. |
| `src/tools/patch_heading/handler.test.ts` | added test | `path` locator, no spawn, no read. |
| `docs/tools/{query_base,create_base,find_and_replace,write_note,append_note,prepend,patch_block,patch_heading}.md` | modified | Error roster: one `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `folder-missing` row and one `vault-root-check` row, in each page's own table format. |

`index.ts` descriptions and `_register-baseline.json` are unchanged (Q2 ruling); the FR-018 fingerprint gate passes without `npm run baseline:write`.

## Diff Highlights

```ts
let check: CanonicalCheckOutcome;
try {
  check = await checkCanonicalPath(vaultRoot, inputPath, { realpath: ctx.realpath });
} catch (err) {
  throw await canonicalCheckFailure(err, vaultRoot, ctx);
}
```

`canonicalCheckFailure` realpaths `vaultRoot` once more. If that succeeds, the original failure came from below the root and is returned unchanged. If it fails, its errno decides the envelope:

```ts
details: { code: "VAULT_NOT_FOUND", reason: "folder-missing", vault },
message: `Vault "<name>" is registered with Obsidian, but its folder could not be found on disk. ` +
         "Restore the folder, or re-open the vault in Obsidian, then call again.",
// any other errno:
details: { stage: "vault-root-check", errno, vault },
message: `The folder of vault "<name>" could not be checked (<errno>).`,
```

With a null `vaultLabel` (active mode) the subject reads "The focused vault" / "the focused vault". `cause` keeps the errno; `registerTool` never serialises it.

## Tests Added or Updated

- `src/tools/_active-file.test.ts` › "assertCanonicalPath — vault root cannot be resolved (BI-0185)":
  - `ENOENT` and `ENOTDIR` on the root → exact `details`, exact message, `cause` is the errno, no root path in message or `details`, no `pathEscapeAttempt` event (assessment tests a, b2, e).
  - a missing drive (ENOENT at every ancestor) → the same folder-missing envelope (test b).
  - a null vault label reads as the focused vault.
  - `EPERM` and `EIO` on the root → `{stage: "vault-root-check", errno, vault}`, exact message, no hint, no path (test c).
  - a failure below a root that resolves (ENOTDIR on `Welcome.md/x.md`) is rethrown unchanged (see Deviations 1).
  - The three existing success / escape cases pass unchanged (test d).
- One handler-level case per affected tool (query_base, create_base, find_and_replace ×2, write_note, append_note, prepend, patch_block, patch_heading): known vault + `missingFolderRealpath(root)` → `folderMissingDetails(vault)`, message without the root path, `makeQueuedSpawn([])` with `getCount() === 0` (create_base: `recorded.length === 0`), and no fs read / write where the fixture tracks it.
- `src/tools/query_base/index.test.ts`: the registered tool returns `isError: true` with the JSON `{code, message, details}` text, the recovery hint, and no root path in the text.
- Unknown-vault regression: the existing `VAULT_NOT_FOUND` / `unknown` tests (query_base, create_base, find_and_replace, `remapVaultNotFound`) and write_note's registry `VALIDATION_ERROR` test pass unchanged.
- The new `_active-file` and handler tests were run against the pre-fix `_active-file.ts` (stashed): all of them failed, then passed with the fix restored.

## Local Verification

- Commands run:
  - `npx vitest run` on `_active-file.test.ts`, `src/path-safety` and the eight tool folders → 57 files passed, 1264 tests passed, 6 skipped.
  - `npm test` (full suite with coverage) → 196 files passed, 1 skipped; 4837 tests passed, 6 skipped. The FR-018 baseline test passes without regenerating.
  - `npm run typecheck` → clean. `npm run lint` → clean.
  - `npx prettier --check` on the two changed source files reports warnings, but the `HEAD` versions of both files fail the same check. That is pre-existing and not touched here.
- Manual checks: the live route probe, see below.

### Q3 route probe (owner ruling)

The assessment asks this step to probe, live and before the code change, each route outside the shared guard against a registered vault whose folder is missing: the `file` locators of write_note / append_note / prepend / patch_block / patch_heading, and `bases` / `views_base`.

**The live probe could not be set up in this unattended run.** The probe needs a vault that Obsidian has registered but whose folder is gone. TC-00727's scratch vault (`OCM-Unavailable-Probe`) is no longer registered (`obsidian vaults verbose` lists seven vaults, all with existing folders). Neither the CLI (`vaults` only lists) nor an `obsidian://` URI registers a new vault. Obsidian keeps its vault list in memory: an entry added to `%APPDATA%\obsidian\obsidian.json` did not show up in `obsidian vaults verbose`. That entry was removed straight away, and the file was checked byte-identical to its backup. Renaming the folder of the one authorised test vault, `TestVault-Obsidian-CLI-MCP`, while Obsidian has it open was ruled out as too risky for the vault that the rest of this Relay run depends on.

Instead, each route was checked by reading the code:

| Route | Path before any vault-folder access | Can a raw system error escape? |
|---|---|---|
| `file` locator on append_note, prepend, patch_block, patch_heading (`resolveFsTarget` → `resolveFileByTsv`) | registry lookup, then `obsidian file` through `invokeCli`. A missing `path` line throws `CLI_REPORTED_ERROR` / `file-tsv-parse`; a CLI error is `CLI_REPORTED_ERROR` from dispatch. A resolved path then reaches `assertCanonicalPath`, which is now fixed. | No |
| `file` locator on write_note (`findFileByTsv`) | same lookup. A "not found" answer falls back to create-by-name, then the fixed guard; any other failure is an `UpstreamError` from dispatch. | No |
| `file` locator on find_and_replace | the guard runs on the raw root before `findFileByTsv`, so the fixed guard answers first. | No |
| `bases` | `resolveVaultRootOrRemap`, then `invokeCli` only; output is filtered stdout. No filesystem access. | No |
| `views_base` | `resolveVaultRootOrRemap`, then `invokeEval` / `invokeCli` with `decodeEvalEnvelope`; every failure is an `UpstreamError`. No filesystem access. | No |

Result: no route outside the shared guard can let a raw system error escape, because every one reaches Obsidian only through `invokeCli` / `invokeEval`, whose failures are `UpstreamError`s. So no route needed a fix beyond `assertCanonicalPath`. What Obsidian answers on those routes (structured either way) is still unobserved. `/speckit-bug-test` should record it once a registered vault with a missing folder exists (see Follow-ups).

No errno other than ENOENT was observed, because nothing was run live.

## CodeGraph structural verification

Run with `codegraph_explore` on `canonicalCheckFailure`, `getErrno`, `assertCanonicalPath`, `missingFolderRealpath` and `folderMissingDetails`.

1. **No new top-level error codes**: both envelopes use the existing `CLI_REPORTED_ERROR`. No error class was added and `src/errors.ts` is unchanged. One new `details.reason` value (`folder-missing`) sits under the existing `VAULT_NOT_FOUND` discriminator (ADR-015). `stage: "vault-root-check"` reuses the existing `details.stage` key.
2. **No boot-time DI factory imports**: `_active-file.ts`'s only new import is `getErrno` from `./_fs-errors.js`. `createLogger` / `createQueue` stay confined to `server.ts` (the test fixture module already imported `createLogger`, unchanged).
3. **Module placement and direction**: the new private helpers sit in `src/tools/_active-file.ts` next to `assertCanonicalPath`. The import changes are the type-only `CanonicalCheckOutcome` from `../path-safety/canonical.js`, a module that file already imported downward, and `getErrno` from the sibling leaf `./_fs-errors.js` (which imports only `../errors.js`, so no cycle). `src/path-safety/canonical.ts` is unchanged.
4. **Reachability**: `canonicalCheckFailure` → called by `assertCanonicalPath` (production, 19 call sites across the eight handlers); `getErrno` (existing, shared) → now also called by `canonicalCheckFailure`. The two fixtures are test-support exports with nine callers each, all in tests, as expected.

**Kernel-node claim held**: the assessment said the fix touches none of the kernel nodes. `createLogger()`, `createQueue()` and `createServer()` are untouched. `UpstreamError` is only constructed with an existing code; the class is unchanged.

## Deviations from Assessment

1. **The root is re-probed before classifying.** The assessment maps any ENOENT / ENOTDIR thrown by `checkCanonicalPath` to `folder-missing`. ENOENT can only escape for the root, but ENOTDIR (and EACCES, ELOOP and the like) can also come from a path segment *below* an existing root. For example, on Linux `path: "Welcome.md/x.md"` makes `realpath` throw ENOTDIR at the first step of the walk. Mapped blindly, that would tell the agent the vault folder is missing, and it would change a call on an available vault (acceptance criterion 4). So `canonicalCheckFailure` realpaths the root once more (only on the failure path). If the root fails, its own errno picks the folder-missing or `vault-root-check` envelope. If the root resolves, the original error is rethrown unchanged, as before this fix. This matches the Q4 ruling's wording ("errnos on the vault root", "ENOTDIR when a path segment [of the vault path] is not a folder"). Errors below an existing root are not caused by a missing vault folder, so they stay out of this BI (see Follow-ups).
2. **The Q3 live probe was replaced by a code-reading check.** The live probe could not be set up unattended (see Q3 route probe above). No raw-escaping route was found, so the diff stays within `_active-file.ts` and the tests.
3. **The rosters also list the `vault-root-check` row.** The Q2 ruling names the `folder-missing` row. The `vault-root-check` envelope (Q4) is a new failure state of the same tools, so it is listed next to it, so the help pages describe every new failure. `index.ts` descriptions and the baseline are still unchanged.
4. **Shared test fixtures.** `missingFolderRealpath` and `folderMissingDetails` were added to `src/tools/_handler-test-fixtures.ts`, a file the assessment did not list, so the nine new cases share one fixture instead of nine copies.
5. **Null vault label.** In active mode `vaultLabel` is null, so the message reads "The focused vault …" and `details.vault` is `null`. The assessment's message assumed a named vault.

## Follow-ups

- `/speckit-bug-test`: re-run TC-00727 and the Q3 routes live. That needs a registered vault with a missing folder, set up through Obsidian's vault switcher ("Open folder as vault" on a scratch folder under `%TEMP%`, then rename the folder). Removing it afterwards also needs the vault switcher ("Remove from list"). Either the owner does this, or the step decides whether to do it.
- Raw errnos from *below* an existing vault root (for example ENOTDIR for `Welcome.md/x.md` on Linux, EACCES on a subfolder, ELOOP) still escape `assertCanonicalPath` unchanged, as before this fix. That is outside BI-0185 (not a missing vault folder), but the same Principle IV gap. Candidate for its own BI.
- write_note, patch_heading and the `resolveFsTarget` editors still report an unregistered vault as the registry's raw `VALIDATION_ERROR` / top-level `VAULT_NOT_FOUND` row rather than the cohort's `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `unknown`. That is pre-existing and unchanged (acceptance criterion 3). Worth noting for BI-0174's roster reconciliation.
- `src/tools/_active-file.ts` and `src/tools/_handler-test-fixtures.ts` fail `prettier --check` on `HEAD` already. That is pre-existing.
