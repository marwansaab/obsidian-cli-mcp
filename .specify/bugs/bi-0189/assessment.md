# Bug Assessment: open_file reports success without checking that the file became active

- **Slug**: bi-0189
- **Created**: 2026-11-07
- **Source**: pasted text (backlog item BI-0189, "Confirm opened file")
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Condensed from the BI-0189 report:

> `open_file` reports success with `opened` and `placement`, and its help says the opened file becomes the active file, so a following active-mode call acts on it. If Obsidian's open fails silently, the success is false, and the next active-mode call (possibly a write) lands on whatever file was active before.

Status and evidence given in the report: planned 2026-11-05 (Open Bugs triage: still valid after the 0.9.0 validation). Filed 2026-11-04 as a follow-up of BI-0179, which fixed the same weakness in `views_base` (a focus failure now returns `CLI_REPORTED_ERROR` with `details.stage: "focus"`). `open_file` was not in BI-0179's scope. Not yet reproduced live on `open_file`.

Acceptance criteria from the report:

- A note exists and Obsidian opens it: the result reports success and the active file is that note.
- A note exists and Obsidian's open silently fails: the result is an error, not a success.
- The error says the file did not become active, names the requested file and advises how to recover.
- The error contains no absolute disk path.
- An agent that follows the error's advice changes no note other than the one the error names.

Out of scope: changing placement (new tab, split or other options); checking focus for any other tool; retrying the open automatically.

No URL was supplied, so the URL Trust Policy did not apply.

## Symptom

`open_file` returns `{ opened, vault, new_tab, placement }` as soon as its eval has called `openLinkText` or `setActiveLeaf`, without checking that the file is now Obsidian's active file. When the open fails silently, the tool still reports success, and the caller's next `target_mode: "active"` call acts on the file that was active before. Expected: success only when the requested file is the active file, and a structured, retryable error otherwise.

## Reproduction

1. In the authorised test vault (`.memory/test-execution-instructions.md`), have note A open and active.
2. Call `open_file` on note B under conditions where Obsidian's open does not land (the trigger is not known; see below).
3. Observe `{ opened: "B.md", placement: ... }` although A is still the active file.
4. Call an active-mode write (for example `append_note` with `target_mode: "active"`): it changes A.

No live trigger is known. BI-0179's live probe on Obsidian 1.15.0 found every open landed at once (`.specify/bugs/bi-0179/fix.md`, Local Verification), so the silent failure has not been reproduced on this machine for either tool, and BI-0189 itself says "Not yet reproduced live". The defect is grounded in code instead: the template returns `ok:true` unconditionally after the open, and Obsidian's open paths can fail without signalling (see Suspected Code Paths).

Resolved (Relay): option A plus one cross-vault live case, settled 2026-11-07. The fix does not wait for a live reproduction, and no probe tries to induce the failure live. The failure path is proven **by construction, not by observation**: stub-app template tests (`runEvalTemplate` under fake timers, with an open that never changes the active file) plus handler and schema tests. The live check in `/speckit-bug-test` shows only that there are no false focus failures: `open_file` on a note, a canvas, a PDF or image and a `.base`, in all three placements, each followed by `get_active_file` returning that file, **plus** a note opened in a registered vault other than the focused one, followed by `get_active_file` with `target_mode: "specific"` and that vault named. The missing live trigger is recorded as a residual risk (see Risks & Considerations). Rationale (owner): ADR-072 settled `views_base` the same way ("no live run took the `FOCUS_NOT_APPLIED` path, which unit tests alone cover"). The cross-vault case is needed because ADR-031 makes `open_file` a vault-targeted eval that moves focus to the requested vault, and that path is the most likely to give a false focus failure.

## Suspected Code Paths

- `src/tools/open_file/_template.ts:37-40` (`JS_TEMPLATE`): the defect site. All three placement branches (`openLinkText(path,'',true)`, `setActiveLeaf(existing,{focus:true})`, `openLinkText(path,'',false)`) are followed directly by `return JSON.stringify({ok:true,opened:f.path,...})`. `opened` echoes the resolved file, not what Obsidian has in front; nothing reads `app.workspace.getActiveFile()`.
- `src/tools/open_file/handler.ts:84-96` (`executeOpenFile`): accepts `data.ok === true` as proof of the open and returns the success shape.
- `src/tools/open_file/schema.ts:126-146` (`OPEN_FILE_EVAL_ERROR_CODES`, `openEvalResponseSchema`): the envelope has only `FILE_NOT_FOUND` and `UNSUPPORTED_FILE_TYPE` failures. It cannot express "the open did not land".
- `src/tools/open_file/handler.ts:101-128` (`mapEvalError`): an exhaustive `switch` over the two codes; the new code needs a case here.
- `src/tools/open_file/index.ts:16-17` (`OPEN_FILE_DESCRIPTION`) and `docs/tools/open_file.md:11` promise that the file becomes the active file so a following active-mode call acts on it; `docs/tools/open_file.md:110` says "On every failure mode, nothing is opened".

Why the open can fail silently, from BI-0179's reading of the Obsidian 1.14.4 / 1.15.0 bundle (`.specify/bugs/bi-0179/assessment.md`, Suspected Code Paths): `workspace.openLinkText` wraps the open in `try { … } catch (e) { new Notice(e.message); console.error(e); return }`, so an open that throws still resolves; `WorkspaceLeaf.setViewState` skips a second open into a leaf that is still `working`; `getActiveFile()` is `activeEditor?.file || getActiveFileView()?.file`. `open_file`'s `existing_tab_reused` branch calls `setActiveLeaf` without awaiting anything, so its effect is not observed at all before the return.

The reference fix is already in the tree: `src/tools/views_base/_template.ts:31-35` (`FOCUS_BASE_TEMPLATE`) polls `getActiveFile() !== f` every 50 ms up to 20 times, returns `{ok:false, code:'FOCUS_NOT_APPLIED', active}` on a miss, and `src/tools/views_base/handler.ts:236-246` (`focusNamedBase`) maps it to `CLI_REPORTED_ERROR` with `details.stage: "focus"`.

## Root Cause Hypothesis

`open_file`'s eval trusts that `openLinkText` / `setActiveLeaf` changed the active file and reports success unconditionally. Obsidian's open swallows its own failures and can skip an open into a busy leaf, so a failed open is indistinguishable from a successful one to the template, and the handler returns a success whose `opened` field names a file that is not active. Confidence: **high** that the tool cannot detect a failed open (direct from the template code). **Low** on how often the open actually fails in practice: BI-0179's probe never saw it on 1.15.0, and BI-0189 has no observed case.

## Proposed Remediation

**Preferred**: apply BI-0179's focus check to `open_file`, inside the same single eval, and fail honestly when it does not land.

1. **`JS_TEMPLATE`** (`_template.ts`): after the placement branch, for all three placements, poll `app.workspace.getActiveFile()!==f` every 50 ms, at most 20 times (1 s, well inside the 10 s dispatch timeout), exactly as `FOCUS_BASE_TEMPLATE` does. Return the existing `{ok:true, opened:f.path, new_tab, placement}` only when the active file is `f` (object identity, not path text). Otherwise return `{ok:false, code:'FOCUS_NOT_APPLIED', opened:f.path, active:<g.path or null>}`. `opened` carries the resolved vault-relative path so the error can name the file even when the caller gave a wikilink name. Keep the single block-body async IIFE with `B64_PAYLOAD_DECODE_EXPR` (ADR-031 shape), the placement branches unchanged (placement is out of scope) and no retry of the open (out of scope).
2. **`openEvalResponseSchema`** (`schema.ts`): add a strict `FOCUS_NOT_APPLIED` variant (`opened: string`, `active: string | null`) beside the two existing failure codes, following `focusBaseEvalResponseSchema`'s nested `discriminatedUnion("code")` shape. It is an internal handoff envelope, not the published surface, so the fingerprint does not move.
3. **`executeOpenFile` / `mapEvalError`** (`handler.ts`): map `FOCUS_NOT_APPLIED` to `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `cause: null`, `details: { stage: "focus", path: <resolved path>, vault, active }` (no `details.code`, no `details.reason`, so ADR-015's closed sets are untouched, matching BI-0179's settled option A), and a message that says the file did not become active, names it and gives the recovery, for example: `open_file: "<path>" did not become the active file in vault "<vault>"; retry open_file, or act on it with target_mode "specific", vault "<vault>" and path "<path>" instead of an active-mode call`. Every value is vault-relative or a vault display name, so no absolute disk path appears (the eval returns no `basePath`). Keep the `switch` exhaustive (`never` default) as `focusNamedBase` does.

This covers the acceptance criteria: success only after the active-file check; a structured `CLI_REPORTED_ERROR` that says the file did not become active, names it (`details.path`, message) and advises retry or a specific-mode call; no absolute path; and the advised specific-mode call targets only the named file, so no other note is changed.

**Alternatives**:
- A second eval after the open that reads `getActiveFile()` (or reuse `FOCUSED_FILE_TEMPLATE`). Rejected: an extra spawn on every call, it returns `basePath` (an absolute disk path the error must not carry), and the check belongs where the open happens, as BI-0179 placed it.
- Report `INTERNAL_ERROR`. Rejected for the reason BI-0179 gave: the failure is an upstream, retryable host condition, not a bridge invariant violation.
- Add `details.code: "FOCUS_NOT_APPLIED"` or a new `reason`. Rejected: widens an ADR-015 closed set for no caller benefit; `details.stage: "focus"` is the established convention for this exact failure (`views_base`).

**Files likely to change**:
- `src/tools/open_file/_template.ts` (and its header comment)
- `src/tools/open_file/_template.test.ts`
- `src/tools/open_file/schema.ts`
- `src/tools/open_file/schema.test.ts`
- `src/tools/open_file/handler.ts` (and its header comment)
- `src/tools/open_file/handler.test.ts`
- `docs/tools/open_file.md` (error roster gains the `details.stage: "focus"` row; the "nothing is opened" sentence is no longer true for this row, because the file may be showing in a leaf without being active)
- `CHANGELOG.md`

`src/tools/open_file/index.ts` is not expected to change: `OPEN_FILE_DESCRIPTION` names no error codes, so the fingerprint baseline should not move. If the fix edits the description, regenerate the baseline deliberately and say so in the PR.

**Tests to add or update**:
- `_template.test.ts`: a `node:vm` suite through `runEvalTemplate` (`src/tools/_eval-template-fixtures.ts`, which already passes `setTimeout` since BI-0179; refactor-decisions item 45 makes it the one vm harness) on fake timers, for each of the three placements: the open lands at once → `ok:true` with no polling; lands late → `ok:true` after polling; never lands → `FOCUS_NOT_APPLIED` with `opened` and `active` set after the 1 s bound; nothing in front → `active: null`; a different file object with the same path text is not taken for `f`. `FILE_NOT_FOUND` and `UNSUPPORTED_FILE_TYPE` still return before any open or check. Keep the existing byte-stability and anti-injection tests.
- `schema.test.ts`: the new variant is accepted; missing `active` / `opened`, stray keys, and `ok:true` carrying a code are rejected (strict).
- `handler.test.ts`, failure: the envelope `{ok:false, code:'FOCUS_NOT_APPLIED', opened:'B.md', active:'A.md'}` raises `CLI_REPORTED_ERROR`, `cause` null, `details` exactly `{ stage: "focus", path: "B.md", vault, active: "A.md" }`, the exact message, and exactly one spawn (`makeQueuedSpawn` with one response, refactor-decisions item 16). A `file` (wikilink name) locator case shows `details.path` is the resolved path. Boundary: `active: null` takes the same path. A check that no string in the error contains the registry's base path (`/vaults/Work`).
- Existing happy-path, placement, `new_tab`, error-roster and app-down tests stay green unchanged.
- Live check in `/speckit-bug-test` (authorised vault, scratch folder): `open_file` on a note, a canvas, a PDF/image and a `.base`, in all three placements, each followed by `get_active_file` returning that file. This guards against a false focus failure for file types whose view `getActiveFile()` might not report. Plus the cross-vault case (Resolved (Relay) under Reproduction): open a note in a registered vault other than the focused one, then `get_active_file` with `target_mode: "specific"` and that vault named must return that note, with no focus failure. The silent-failure path itself is not run live; it is proven by construction through the vm suite and the handler and schema tests (Resolved (Relay) under Reproduction).

## Risks & Considerations

- **Residual risk: no live trigger.** The silent open failure has never been observed on `open_file` (nor on `views_base` since BI-0179). The new failure path is proven by construction (stub-app template tests under fake timers, plus handler and schema tests), not by observation, as ADR-072 accepted for `views_base`. If a real trigger turns up, it will now surface as the `details.stage: "focus"` error instead of a false success; revisit the bound or a retry then (Resolved (Relay) under Reproduction).
- **Cross-vault opens.** ADR-031 runs the eval in the requested vault and moves focus there; a vault that is unfocused or cold-launched is the likeliest place for a late or missing active file, hence a false focus failure. The 1 s bound applies there too; the live cross-vault case checks it.
- **False failures for unusual views.** `getActiveFile()` returns a file only when the active view is an editor or a `FileView`. Core views (markdown, canvas, PDF, image, Bases) are `FileView`s, but a plugin-registered view for some extension might not be, and its open would then be reported as a focus failure. The live check above covers the core types; a plugin view that fails it should be raised as its own item, not worked around here.
- **Vault focus is not verified.** The check confirms the file is active in the requested vault's workspace (the eval runs there, ADR-031). It does not prove that vault's window is the one in front, which is what a vault-less active-mode call targets. That is the existing ADR-031 contract and outside this report's scope; the error advice (name `vault` explicitly) is safe either way.
- **Latency**: the wait runs only when the first check fails; a healthy open gains one synchronous `getActiveFile()` comparison.
- **Published surface**: input and output schemas are unchanged. The failure uses the existing `CLI_REPORTED_ERROR` with `details.stage`, so no ADR-015 set grows and no top-level code is added (Principle IV). Callers that branch on the success shape are unaffected; a caller that today receives a false success now receives an error, which is the intended change.
- **Residual race**: a human changing focus between `open_file` returning and the caller's next active-mode call can still redirect that call. Same accepted focus-switch residual as BI-0179 and the active-mode refresh callers (`.memory/refactor-decisions.md`).
- **Related, out of scope**: `write_note`'s `open` option also opens through `openLinkText` and does not check the result. Same failure class; mention it in the PR as a possible follow-up, do not change it here (the report rules out other tools).
- **Docs**: `.docs-as-code/` pages describing `open_file` get updated by `/speckit-docs-as-code` after review.

## CodeGraph structural check

- **Affected module**: `src/tools/open_file/` only. `JS_TEMPLATE` (`_template.ts`) is consumed only by `executeOpenFile` in `handler.ts` and tested by `_template.test.ts`. `openEvalResponseSchema` (`schema.ts`) is read only by `executeOpenFile` through `decodeEvalEnvelope`. `executeOpenFile` is called only by the tool registration in `open_file/index.ts` (`createOpenFileTool`) and its tests. No other tool imports `open_file`; `views_base` reuses the open mechanism through `composeEvalCode`, not by importing `open_file` (Principle I).
- **Shared helpers used, not changed**: `decodeEvalEnvelope` and `resolveVaultRootOrRemap` (`src/tools/_active-file.ts`) are among the most-depended-on helpers in the tool layer; the fix must not change them. The new envelope variant passes through `decodeEvalEnvelope` as one more schema branch. `composeEvalCode` / `B64_PAYLOAD_DECODE_EXPR` (`_shared.ts`) and `runEvalTemplate` (`_eval-template-fixtures.ts`, test support) are used unchanged.
- **Blast radius**: every `open_file` call (all three placements gain the check), its template / schema / handler tests, and the `open_file` help page. Agents that chain `open_file` into active-mode calls are the intended beneficiaries.
- **Kernel nodes**: the fix touches none of them. `createLogger()` and `createQueue()` stay confined to `server.ts` (`createServer` constructs both and injects them into `createOpenFileTool`); the handler keeps receiving them through `ExecuteDeps`. `UpstreamError` is used, not changed, and the failure is classified under the existing `CLI_REPORTED_ERROR`, with no new code in `src/errors.ts`. `createServer()` is not touched.

## Open Questions

None. The error shape follows the owner's BI-0179 ruling (option A: `CLI_REPORTED_ERROR` with `details.stage: "focus"`, no `details.code` or `details.reason`), and the report's acceptance criteria fix the message content (says the file did not become active, names it, advises recovery, no absolute path).
