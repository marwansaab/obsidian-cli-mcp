# Bug Fix: views_base lists views only once the named Base is the active file

- **Slug**: bi-0179
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

In named mode, `views_base`'s focus eval now checks that the named `.base` really is Obsidian's active file after `openLinkText`, waiting up to 1 s for a late switch. If the file never becomes active, the eval returns a new internal envelope, `FOCUS_NOT_APPLIED`. The handler then fails with `CLI_REPORTED_ERROR`, `details: { stage: "focus", base_path, active }` before `base:views` runs, so a `BASE_MALFORMED` error can no longer carry another Base's parser complaint. This is the preferred remediation from the assessment, with the error shape settled in its Open Questions (option A).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/views_base/_template.ts` | modified | After `await openLinkText(...)`, polls `getActiveFile() !== f` every 50 ms, at most 20 times (1 s, well inside the 10 s `TYPED_TOOL_TIMEOUT_MS`). Returns `{ok:true, opened}` only when the named file is active, otherwise `{ok:false, code:'FOCUS_NOT_APPLIED', active:<path or null>}`. The template is still one block-body async IIFE using `B64_PAYLOAD_DECODE_EXPR` (ADR-031 shape). Header comment explains why. |
| `src/tools/views_base/schema.ts` | modified | `focusBaseEvalResponseSchema`: the `ok:false` branch is now a nested `discriminatedUnion("code")` with the strict `FOCUS_NOT_APPLIED` variant (`active: string \| null`) beside `FILE_NOT_FOUND`. This is an internal envelope, so the fingerprint is not affected. |
| `src/tools/views_base/handler.ts` | modified | The named-mode focus step is its own function, `focusNamedBase` (the named-mode partner of `listFocusedViews`), which maps each failure code of the focus envelope in an exhaustive `switch`, so a new code cannot fall through to `BASE_NOT_FOUND` / `named-missing` unnoticed (PR #140 review). It maps `FOCUS_NOT_APPLIED` to `UpstreamError` `CLI_REPORTED_ERROR`, `cause: null`, `details: { stage: "focus", base_path, active }`, message `views_base: could not bring base file at "<path>" to the front`. It is thrown before `listFocusedViews`. The `FILE_NOT_FOUND` → `BASE_NOT_FOUND` / `named-missing` remap is unchanged. |
| `src/tools/_eval-template-fixtures.ts` | modified | `runEvalTemplate` also passes `setTimeout` into the `node:vm` context, because the template's wait needs it. Scope expansion, see Deviations. |
| `src/tools/views_base/_template.test.ts` | added tests | A `node:vm` suite against a stub `app`, on fake timers. |
| `src/tools/views_base/schema.test.ts` | added tests | The focus envelope's accepted and rejected (strict) shapes. |
| `src/tools/views_base/handler.test.ts` | added tests | `FOCUS_NOT_APPLIED` mapping (with `active` set and with `null`). |
| `docs/tools/views_base.md` | modified | Error roster gains the named-mode `details.stage: "focus"` row under the generic `CLI_REPORTED_ERROR` (Retry). The `BASE_MALFORMED` paragraph now says the report always describes the named Base. |
| `CHANGELOG.md` | modified | `### Fixed` entry for BI-0179. |

`src/tools/views_base/index.ts` and `VIEWS_BASE_DESCRIPTION` are unchanged. The FR-018 fingerprint gate passes without `baseline:write`, so the published surface did not move.

## Diff Highlights (optional)

```js
await app.workspace.openLinkText(f.path,'',false);
for(let i=0;i<20&&app.workspace.getActiveFile()!==f;i++)await new Promise(r=>setTimeout(r,50));
const g=app.workspace.getActiveFile();
if(g!==f)return JSON.stringify({ok:false,code:'FOCUS_NOT_APPLIED',active:g?g.path:null});
return JSON.stringify({ok:true,opened:f.path});
```

```ts
if (decoded.ok === false && decoded.code === "FOCUS_NOT_APPLIED") {
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "focus", base_path: input.base_path, active: decoded.active },
    message: `views_base: could not bring base file at "${input.base_path}" to the front`,
  });
}
```

## Tests Added or Updated

- `_template.test.ts` › "views_base FOCUS_BASE_TEMPLATE — focus check (BI-0179)", run under `node:vm` through `runEvalTemplate` on fake timers (`vi.useFakeTimers()` reaches the template's poll, so the bounded wait costs no real time):
  - an open that lands at once gives `ok:true` and makes exactly 2 `getActiveFile()` calls (no polling);
  - an open that lands late gives `ok:true` after polling;
  - an open that never lands gives `FOCUS_NOT_APPLIED` with `active` set to the file still in front, after exactly 21 checks (the 1 s bound);
  - nothing in front gives `active: null`;
  - the check compares the file object, so a different file in front is never taken for the named one;
  - a missing path or a folder still gives `FILE_NOT_FOUND`, with no open and no active-file check.
- `schema.test.ts` › "focus envelope: … accepted" (4 rows) and "… rejected (strict)" (5 rows): the new variant parses; a missing `active`, stray keys, an unknown code, and `ok:true` carrying a code are rejected.
- `handler.test.ts` › "BI-0179 focus not applied (%s)" (2 rows: `active` = `A/broken.base`, `active` = `null`): `CLI_REPORTED_ERROR`, `cause` null, `details` exactly `{ stage: "focus", base_path, active }` (no `code`, `reason`, `message` or `messageLength`), the exact headline, and only one spawn (`["eval"]`, no `base:views`; `makeQueuedSpawn` gets one response, per refactor-decisions item 16).
- Removed in the PR #140 review: a byte check of the template text for the active-file comparison (the vm suite proves the behaviour), and a handler test running two malformed Bases in succession (its stubbed spawns give each call its own complaint, so it passed before the fix too; the existing M-series cases cover the happy path, and the live runs in `test.md` cover the sequence).
- Existing tests are unchanged and green, including US2, US3, M1–M15, the byte-stability checks and the anti-injection round-trip.

## Local Verification

- Commands run:
  - `npx vitest run src/tools/views_base` → 4 files, 89 tests passed.
  - `npm run typecheck` → clean.
  - `npx eslint src/tools/views_base src/tools/_eval-template-fixtures.ts` → clean.
  - `npm test` (full suite with coverage) → exit 0. The `views_base` module is at 100 % statements and lines. The fingerprint gate passes, with no baseline change.
  - `npx vitest run docs-sync` → 4 passed.
- Live probe (assessment step 1), in `TestVault-Obsidian-CLI-MCP`, focused (`=> TestVault-Obsidian-CLI-MCP`), on Obsidian `1.15.0 (installer 1.14.4)`. Fixtures were seeded under `Sandbox/BI-0179-probe/` and removed afterwards. They were two malformed Bases with different faults in different folders sharing the basename `broken.base` (`A/` with `name: [unclosed`, `B/` with `name: [a, b`), the same two faults under different basenames (`alpha.base`, `beta.base`), a valid Base (`valid.base`, view `GoodView`) and a note.
  1. **Raw CLI probe** (`Obsidian.com eval` running the template's open plus a state capture, then `Obsidian.com base:views`), sequence note → A → B → A → alpha → beta → alpha. Right after `await openLinkText` resolved, `getActiveFile().path` and `activeLeaf.view.file.path` were the named file every time. `activeLeaf.working` was `false`, `activeEditor` was unset for Bases (set for the note), view type was `bases`, and no `console.error` was raised. `base:views` returned each Base's own complaint: 148 characters for the `[unclosed` fault, 128 for `[a, b`.
  2. **The repository's own handler**, built at HEAD before the fix (`dist/tools/views_base/handler.js` driven from a Node script with real `createQueue` / `createLogger`). I could not call the `views_base` MCP tool directly because the permission was not granted. A → B → A → alpha → beta → valid → alpha → valid, with `vault` named and without it: each malformed Base reported its own complaint (148 / 128). The report's exact fixtures, `_validation-056/broken.base` ⇄ `Fixtures/BI-0137/broken.base` (read-only, only focus changes), also reported 148 / 128 / 148 in both modes. The same sequences with another vault (`My-Setup-Vault`) in front and `vault` named gave the same correct results. The test vault was then focused again.
  3. **Malformed A → valid B** (Resolved (Relay) under Reproduction): `valid.base` listed `{"views":["GoodView"],"count":1}` after a malformed Base, both before and after the fix. It was never reported as malformed.
  4. **After the fix** (rebuilt `dist`), note → A → B → A → valid → B → alpha → beta → alpha → valid plus the report's fixtures: every malformed Base carries its own complaint and length, `valid.base` lists its view, and no call took the `FOCUS_NOT_APPLIED` path, because every open landed at once.
- Result: **TC-00736 did not reproduce on this machine.** The assessment's escalation condition (the active file is already B when `base:views` runs, yet the complaint is A's) was **not** observed either: whenever the named Base was active, its own complaint came back. That matches the assessment's root-cause reading, because `base:views` parses the active file. What remains unconfirmed is *why* the switch failed in the TC run (see Deviations).
- Vault residue: none. `Sandbox/BI-0179-probe/` was removed and `Welcome.md` is intact.

## CodeGraph structural verification

Run with `codegraph_explore` on `FOCUS_BASE_TEMPLATE`, `executeViewsBase`, `focusBaseEvalResponseSchema` and `runEvalTemplate` after the change.

1. **No new top-level error codes**: the focus failure uses the existing `CLI_REPORTED_ERROR`. `src/errors.ts` is untouched and no error class was added. `FOCUS_NOT_APPLIED` is an internal eval-envelope literal (like `FILE_NOT_FOUND`) and never reaches a caller as a code.
2. **DI discipline**: `handler.ts` imports no boot-time factory. `createLogger()` / `createQueue()` stay confined to `server.ts`, and the handler still receives them through `ExecuteDeps`.
3. **Module placement and import direction**: every production change is inside `src/tools/views_base/`, with no new imports. The one shared edit, `_eval-template-fixtures.ts`, is a test-support leaf (it adds a vm global) and its imports are unchanged.
4. **Reachability**: the new template branch and the new handler branch are reached from `executeViewsBase`, which `createViewsBaseTool` (`views_base/index.ts`) calls. The module-private `focusNamedBase` (added in the PR #140 review) has exactly one caller, `executeViewsBase`. No orphaned symbol was added.

Kernel-node claim from `assessment.md` ("the fix touches none of them") **held**: `createLogger()`, `createQueue()`, `UpstreamError` (used, not changed) and `createServer()` are untouched. `decodeEvalEnvelope` (`_active-file.ts`) is unchanged; the new variant goes through it as one more schema branch, as the assessment required.

## Deviations from Assessment

- **Mechanism not settled; no retry added.** Assessment step 1 expected the probe to show whether the open in the TC run was *late* or *dropped*, and step 2 adds a retry through `getLeaf(false).openFile(f, {active:true})` only if it is dropped. The probe showed neither, because the switch always landed at once on Obsidian 1.15.0, so there was no evidence for the retry and I did not add it. The check plus the bounded wait is in place. If the open is dropped, the call now fails honestly with `details.stage: "focus"` (retryable) instead of attaching the wrong complaint. The assessment's Risks section covers this outcome ("honest but less useful"). The report was filed on 2026-11-02 against `0.9.0-local`. The TC run may have been on Obsidian 1.14.4 (the installer version) before the 1.15.0 update, which the assessment's bundle reading also mentions; I could not test that version.
- **Scope expansion: `src/tools/_eval-template-fixtures.ts`.** Not in the assessment's file list. `runEvalTemplate` now also passes `setTimeout` into the vm context, because the template's wait uses it and refactor-decisions item 45 makes `runEvalTemplate` the one vm harness, so it must not be re-inlined. Existing `_template.test.ts` suites are unaffected (full suite green).
- **`schema.test.ts`** did not pin the envelope before. It gains the accepted/rejected envelope cases, as the assessment's test list asked.
- **Live probe ran through the built handler, not the MCP tool.** The `obsidian-cli-mcp-local` `views_base` tool call was not permitted in this session, so I drove `dist/tools/views_base/handler.js`, the same handler code the server runs, from a Node script.

## Follow-ups

- `/speckit-bug-test slug=bi-0179`: live TC-00736 sequence in both orders, valid-Base-first and note-first controls, and malformed A → valid B (B must list its own views). Seed fresh fixtures, because this run cleaned its fixtures up. Ideally also run through the MCP server itself.
- If TC-00736 ever reproduces after this fix, the call will now fail with `details.stage: "focus"` instead of misattributing. If that shows up in practice, revisit the retry from assessment step 2 (`getLeaf(false).openFile(f, {active:true})`) with the probe's state capture.
- PR note (from the assessment): `open_file`'s template also trusts `openLinkText` and does not check that the open landed. It is the same failure class and a possible follow-up BI, not changed here.
- `/speckit-docs-as-code` after review: `.docs-as-code/` pages that describe `views_base`'s focus-then-active step.
