# Bug Assessment: views_base attaches the previous malformed Base's parser complaint to the named Base

- **Slug**: bi-0179
- **Created**: 2026-11-04
- **Source**: pasted text (backlog item BI-0179, "Attribute parser complaints")
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Condensed from the BI-0179 report:

> BI-0137 keeps the parser complaint as secondary detail in `details.message` (spec 081 FR-005, FR-006) so a caller can show the user what is wrong with the Base. When the previously active file was a different malformed Base, that detail describes the wrong file: line numbers and quoted content point at a Base the caller did not ask about. [...] The headline, code, reason and path are correct, so callers that branch only on the code are unaffected. The TC's likely-cause note: the parse state is read before the newly focused Base has re-rendered. Low frequency (needs two malformed Bases in succession) but it silently misattributes the diagnosis.

Evidence given in the report: TC-00736 (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `views_base` on `_validation-056/broken.base` and then on `Fixtures/BI-0137/broken.base` returned, for the second call, `details.code: "BASE_MALFORMED"` with the correct `reason`, `base_path` and headline, but `details.message` carried the complaint about `_validation-056/broken.base` (`name: [unclosed`, `messageLength: 148`) instead of the named Base's own complaint (`name: [a, b`, `messageLength: 128`). It reproduced in both directions. When the previously active file was a valid Base or a note, the complaint matched the named Base.

Acceptance criteria from the report:

- Two malformed Bases A and B with different faults, listed in either order: each error carries its own Base's complaint and length.
- A malformed Base B listed after a valid Base, a note or another malformed Base was open: the complaint and its length are the same in every case.
- If the parser cannot supply a complaint for the named Base, the error still identifies the Base as malformed and does not include another Base's complaint.

Out of scope: the top-level message, error category and reason; running a view or creating items; repairing Bases.

No URL was supplied, so the URL Trust Policy did not apply.

## Symptom

In named mode, `views_base` focuses the named `.base` and then runs active-mode `base:views`. When the file open before the call was a different malformed Base, the `BASE_MALFORMED` error for the named Base carries the earlier Base's YAML complaint and length in `details.message` / `details.messageLength`. The expected result is a complaint that always describes the named Base, whatever was open before.

## Reproduction

1. In the authorised test vault, create two malformed Bases with different faults, for example A with `name: [unclosed` and B with `name: [a, b` (the report used `_validation-056/broken.base` and `Fixtures/BI-0137/broken.base`).
2. Call `views_base` with `base_path` = A. Observe `BASE_MALFORMED` / `invalid-yaml` with A's complaint (correct).
3. Call `views_base` with `base_path` = B. Observe `BASE_MALFORMED` / `invalid-yaml`, `base_path` = B and B's headline, but `details.message` is A's complaint (`messageLength` 148, not 128).
4. Repeat in the opposite order: the second call again carries the first Base's complaint.
5. Control: with a valid Base or a note open before step 3, B's own complaint comes back.

Untested order: whether the same stale focus also turns a valid Base B into a false `BASE_MALFORMED` when a malformed Base A was open just before it. The report did not test that order. Spec 081's live run (`specs/081-classify-malformed-base/contracts/t0-probe-findings.md`, T020 steps 2 to 4) went from the broken fixture to the control fixture and listed the control correctly, which suggests that order is unaffected.

Resolved (Relay): option A, settled 2026-11-04. The order stays in scope as a verification step. The fix's first live probe also runs malformed A → valid B and records the result in `fix.md`, and `/speckit-bug-test` adds that order to its live check: B must list its own views. Rationale (owner): the BI-0179 user story "the result to be the same whatever file was open before my call" covers every prior-focus case, including a valid B listed after a malformed A. It is a verification step and adds no code, so the scope does not change. The focus check in the remediation already covers this order, because it compares the active file with the named file whether B is valid or not.

## Suspected Code Paths

- `src/tools/views_base/_template.ts:21-27` (`FOCUS_BASE_TEMPLATE`): the defect site. It calls `await app.workspace.openLinkText(f.path,'',false)` and then returns `{ok:true, opened:f.path}` without checking that the named file actually became the active file. `opened` echoes the requested path, not what Obsidian has in front.
- `src/tools/views_base/handler.ts:213-238` (`executeViewsBase`, named mode): accepts `decoded.ok === true` as proof that the named Base is focused, then calls `listFocusedViews`, which runs `base:views` against whatever is active.
- `src/tools/views_base/handler.ts:117-152` (`focusedBaseError`): attaches `base_path` from the input and `message` / `messageLength` from the `base:views` report. When the report describes a different file, the two halves of the error disagree. This is the visible symptom, not the cause.
- `src/tools/views_base/schema.ts:46-49` (`focusBaseEvalResponseSchema`): the focus envelope has only `ok:true` or `ok:false / FILE_NOT_FOUND`. It cannot express "the open did not land".

What Obsidian does, read from the app bundle shipped on this machine (`resources/obsidian.asar`, 1.14.4, and the `obsidian-1.15.0.asar` update; minified, so names are the bundle's own):

- The `base:views` CLI handler runs `getActiveFile()`, rejects a non-`.base` with `Active file is not a base file`, then parses `await vault.cachedRead(activeFile)` with the Bases query parser on every call. It reads no rendered or cached parse state from the view. The read cache is a `WeakMap` keyed by the file object, so it cannot return another file's text.
- `workspace.openLinkText` wraps the whole open in `try { … } catch (e) { new Notice(e.message); console.error(e); return }`, so an open that throws resolves normally.
- `WorkspaceLeaf.setViewState` begins `if (!this.working) { … }`, so a second open into a leaf that is still processing one is silently skipped. It also wraps `view.setState(...)` in `try/catch(console.error)`.
- `workspace.getActiveFile()` is `activeEditor?.file || getActiveFileView()?.file`.

## Root Cause Hypothesis

`base:views` parses the active file fresh on every call, so a complaint that quotes Base A can only mean that Obsidian's active file was still A when `base:views` ran. The tool trusts the focus step: the template returns `ok:true` once `openLinkText` resolves, but `openLinkText` resolves even when the open fails (it swallows the error), and `setViewState` can skip an open without any signal. Nothing checks `getActiveFile()` afterwards. So when the switch from one malformed Base to another does not land, `views_base` reports B's path and headline with A's complaint. Confidence: **high** that the active file was still A at listing time (this follows from the `base:views` handler code and the observed output). **Low to medium** on why that switch fails only from one malformed Base to another: the bundle shows several ways the open can fail silently, but not which one fires. The TC's guess, that the parse state is read before the view re-renders, does not fit the bundle, because `base:views` never reads view state. The fix's first live probe has to settle the mechanism.

## Proposed Remediation

**Preferred**: make the named-mode focus step confirm that it landed, and stop trusting `ok:true` as proof.

1. **Live probe first** (per `.memory/test-execution-instructions.md`, in the authorised vault's scratch area). Reproduce A to B with two malformed fixtures that have different basenames and with two that share a basename. After the focus eval, record `app.workspace.getActiveFile()?.path`, `app.workspace.activeLeaf.view.file?.path`, `app.workspace.activeLeaf.working`, whether `app.workspace.activeEditor` is set, and any console error. Also run malformed A → valid B (Resolved (Relay) under Reproduction) and record the result in `fix.md`. If the active file is already B when `base:views` runs and the complaint is still A's, this hypothesis is wrong: stop and escalate.
2. **`FOCUS_BASE_TEMPLATE`**: after `await openLinkText(...)`, check `app.workspace.getActiveFile() === f`. If it is not, wait a short, bounded time, polling every few tens of milliseconds and staying well inside the dispatch timeout, and check again. If the probe shows the open is dropped rather than late, retry it once through a path that does not swallow errors, such as `app.workspace.getLeaf(false).openFile(f, {active:true})`. Return `{ok:true, opened:<getActiveFile().path>}` only when the active file is `f`. Otherwise return a new envelope variant, `{ok:false, code:'FOCUS_NOT_APPLIED', active:<path or null>}`. Keep the template a single block-body async IIFE using `B64_PAYLOAD_DECODE_EXPR` (ADR-031 shape).
3. **`focusBaseEvalResponseSchema`**: add the `FOCUS_NOT_APPLIED` strict variant. It is an internal handoff envelope and not fingerprinted.
4. **`executeViewsBase`**: map `FOCUS_NOT_APPLIED` to `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `cause: null`, `details: { stage: "focus", base_path, active }` (no `details.code`, no `details.reason`, no `message` / `messageLength`) and a message such as `views_base: could not bring base file at "<path>" to the front` (Resolved (Relay) under Open Questions). It is thrown before `listFocusedViews`, so no `base:views` runs against the wrong file and the error carries no Base's parser complaint. This keeps FR-009 ("no silent open-Base substitution on any named-path failure") true for the complaint as well as for the listing. The `FILE_NOT_FOUND` → `BASE_NOT_FOUND` / `named-missing` remap is unchanged.

With the focus confirmed, every complaint `focusedBaseError` attaches comes from `base:views` on the named file. That covers all three acceptance criteria by construction, including the third: whatever the report holds, it is the named Base's. Open mode is unchanged, because it reads whatever is focused by contract.

**Alternatives**:
- Drop `details.message` in named mode, or keep it only when it can be attributed. Rejected: it removes the diagnosis spec 081 FR-005 and FR-006 promise, and it can't tell which file a complaint is about, because the complaint does not name its file.
- After `base:views`, run a second eval to read `getActiveFile()` and discard a mismatched result. Rejected: it adds a spawn to every named call and checks after the fact. The check belongs where focus is set.
- Parse the named `.base` client-side to produce the complaint. Rejected for the same reason spec 081 research D2(c) gave: it duplicates Obsidian's parser, and the Bases cohort never parses `.base` itself.
- Retry the whole focus + list sequence on mismatch. Rejected as the first choice: it needs a reliable way to detect the mismatch anyway, which is step 2, and a retry loop in the handler goes against the "recovery lives in dispatch" rule (`.memory/refactor-decisions.md` item 13 and the ADR-029 retry ownership).

**Files likely to change**:
- `src/tools/views_base/_template.ts`
- `src/tools/views_base/_template.test.ts`
- `src/tools/views_base/schema.ts`
- `src/tools/views_base/schema.test.ts` (if it pins the envelope)
- `src/tools/views_base/handler.ts`
- `src/tools/views_base/handler.test.ts`
- `docs/tools/views_base.md` (the generic `CLI_REPORTED_ERROR` roster row gains the named-mode focus failure, `details.stage: "focus"`, retry; plus a note that the parser complaint always describes the named Base)
- `CHANGELOG.md`

`src/tools/views_base/index.ts` is not expected to change. The agreed shape adds no `details.code` or `details.reason` the description would have to name, so the description fingerprint in `src/tools/_register-baseline.json` should not move. If the fix does edit the description, regenerate the baseline deliberately and say so in the PR.

**Tests to add or update**:
- `_template.test.ts`: the template checks `getActiveFile()` against the resolved file after the open, and returns `FOCUS_NOT_APPLIED` with `active` when they differ. Keep the existing byte-stability and anti-injection checks.
- `handler.test.ts`, happy path: the focus envelope `{ok:true, opened:B}` and a `base:views` complaint about B give `BASE_MALFORMED` / `invalid-yaml` with B's message and length (existing M-series cases stay green).
- `handler.test.ts`, failure: the focus envelope `{ok:false, code:'FOCUS_NOT_APPLIED', active:A}` raises `CLI_REPORTED_ERROR` with `details` exactly `{ stage: "focus", base_path: B, active: A }`: no `code`, `reason`, `message` or `messageLength`, so it carries no Base's parser complaint. It spawns exactly one process (no `base:views`; `makeQueuedSpawn` provisioned with one response, per refactor-decisions item 16).
- `handler.test.ts`, boundary: `active: null` (nothing focused after the open) takes the same path.
- `schema.test.ts` / envelope: the new variant is accepted and stray keys are rejected (strict).
- Live check in `/speckit-bug-test`: TC-00736's sequence in both orders, plus valid-Base-first and note-first controls. Each error carries its own Base's complaint and length (148 versus 128 in the report's fixtures). Also malformed A → valid B: B lists its own views and is not reported as malformed (Resolved (Relay) under Reproduction).

## Risks & Considerations

- **The mechanism is unconfirmed.** The preferred fix's check-and-wait is right whatever the cause, but whether a retry is needed, and how long to wait, depends on the probe. If Obsidian never applies the second open, every malformed-to-malformed named call becomes a focus-failure error instead of a misattributed one. That is honest but less useful, and the owner should know before shipping.
- **Latency**: the wait applies only when the first check fails, so a healthy call gains one synchronous `getActiveFile()` comparison. The wait bound must stay well below the dispatch timeout.
- **Published surface**: the input and output schemas are unchanged. The focus failure reuses the roster's generic `CLI_REPORTED_ERROR` row with a `details.stage` key, so no `details.code` or `details.reason` set grows (ADR-015). If `VIEWS_BASE_DESCRIPTION` changes, the fingerprint baseline moves deliberately.
- **Residual race**: a human changing focus between the focus eval and `base:views` can still swap the file. That is the same accepted focus-switch residual recorded for the active-mode refresh callers (`.memory/refactor-decisions.md`, the `resolveActiveLocatorWithVault` entry). It is out of scope here.
- **Related, out of scope**: `open_file`'s template also relies on `openLinkText` and reports a placement without checking it landed. Same failure class; mention it in the PR as a possible follow-up, do not change it here.
- **Docs**: `.docs-as-code/` pages that describe `views_base`'s focus-then-active step get updated by `/speckit-docs-as-code` after review.

## CodeGraph structural check

- **Affected module**: `src/tools/views_base/` only. `FOCUS_BASE_TEMPLATE` (`_template.ts`) is consumed only by `executeViewsBase` in `handler.ts` and tested by `_template.test.ts`. `focusBaseEvalResponseSchema` (`schema.ts`) is read only by `executeViewsBase` through `decodeEvalEnvelope`. `executeViewsBase` is called only by the tool registration in `views_base/index.ts` (`createViewsBaseTool`) and its tests.
- **Shared helpers used, not changed**: `decodeEvalEnvelope` (`src/tools/_active-file.ts`) is among the most-depended-on helpers in the tool layer (used across the eval-composed tools), so the fix must not change it. The new envelope variant goes through it unchanged as one more schema branch. `composeEvalCode` / `B64_PAYLOAD_DECODE_EXPR` (`_shared.ts`), `upstreamReport` / `INVALID_YAML_PATTERN` (`_base-malformed.ts`) and `boundedExcerpt` (`_eval-parse.ts`) are untouched. `query_base` shares only `_base-malformed.ts` with `views_base` and is unaffected.
- **Blast radius**: `views_base` named-mode calls (open mode reads no focus envelope and is unaffected), its template/schema/handler tests, and the `views_base` help page. No other tool imports `views_base`.
- **Kernel nodes**: the fix touches none of them. `createLogger()` and `createQueue()` stay confined to `server.ts` (`createServer` constructs both and injects them into `createViewsBaseTool`). The handler keeps receiving them through `ExecuteDeps`. `UpstreamError` is used, not changed, and the focus failure is classified under an existing top-level code with no new code in `src/errors.ts`. `createServer()` is not touched.

## Open Questions

- How should `views_base` report a named Base it could not bring to the front? This only happens on the new focus-failure path. Today the only failure the focus step can report is `FILE_NOT_FOUND`, which the handler remaps to `BASE_NOT_FOUND` / `named-missing` (`executeViewsBase`, `handler.ts:221-231`). Eval envelope failures elsewhere already carry `details.stage` (`decodeEvalEnvelope` emits `stage: "json-parse"` / `"envelope-parse"`).

  | Option | Shape | Trade-off |
  |---|---|---|
  | A (recommended) | `CLI_REPORTED_ERROR`, `details: { stage: "focus", base_path, active }`, no `details.code`, message such as `views_base: could not bring base file at "<path>" to the front` | Falls under the roster's existing "Other upstream CLI failure, retry" row. No new `details.code` or reason, so ADR-015's closed sets stay as they are. Follows the existing `details.stage` convention. The caller learns it is transient and retryable, not a property of the Base. |
  | B | `CLI_REPORTED_ERROR`, `details: { code: "BASE_NOT_FOUND", reason: "not-focused", base_path }` | Branchable under a code callers already handle, but it adds a value to a closed reason set and calls an existing Base "not found", which is misleading. |
  | C | `INTERNAL_ERROR` | Treats a host-app behaviour as a bridge invariant violation. Not retry-signalling, and it hides an upstream condition. |

  Recommended: A, because it reports exactly what happened (the Base exists, Obsidian did not switch to it) without widening any closed set, and it matches the existing `stage` convention.

  Resolved (Relay): option A, settled 2026-11-04. The focus failure is `CLI_REPORTED_ERROR` with `details: { stage: "focus", base_path, active }`, no `details.code` and no `details.reason`. Rationale (owner): under ADR-015 the `details.reason` sets are closed, and adding a reason is a contract change. Option A adds no code and no reason, and it fits the existing `CLI_REPORTED_ERROR` envelope (Constitution IV), so option B is out. The error must not carry another Base's parser complaint (BI-0179 criterion "does not include another Base's complaint"). The remediation (step 4) and the handler failure test above carry this shape.
