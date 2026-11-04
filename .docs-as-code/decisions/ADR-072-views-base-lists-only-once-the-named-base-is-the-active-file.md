# ADR-072 — `views_base` lists only once the named Base is the active file

- **Status:** Accepted
- **Date:** 2026-11-04
- **Source:** PR #140 (BI-0179, `.specify/bugs/bi-0179/`: assessment, fix
  and test reports, assessment rulings Q1 and Q2, owner ruling of
  2026-11-04 on the partial verification), commits `f6a1f61` (the fix) and
  `20df04d` (the review's exhaustive mapping)
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), whose closed `details.reason` sets this decision
  leaves as they are; ADR-031 (Cross-Vault Open via Vault-Targeted Focus),
  whose block-body async IIFE the focus template keeps; ADR-029 (Retry Once
  on Cold-Start Vault-Launch Failure), which keeps retries in the dispatch
  layer.

## Context

Named-mode `views_base` focuses the named `.base` with one `eval`
(`FOCUS_BASE_TEMPLATE`) and then runs the CLI's active-mode `base:views`,
which parses whatever file Obsidian has active. Before PR #140 the template
returned `ok: true` as soon as `app.workspace.openLinkText` resolved. That
proves nothing: Obsidian catches an open that throws, and a leaf still busy
with an earlier open skips the next one, so the promise resolves either way
(the assessment's reading of the Obsidian 1.14.4 and 1.15.0 bundles).

TC-00736 (0.9.0-local) showed the result: a `BASE_MALFORMED` error for
`Fixtures/BI-0137/broken.base` whose `details.message` and
`details.messageLength` described the previously open
`_validation-056/broken.base` (148 characters instead of 128). The parser
complaint does not name its file, so nothing downstream can tell which Base
it is about.

The live probe for PR #140 did not reproduce the failure on Obsidian 1.15.0:
every open landed synchronously. The mechanism is inferred from the bundle,
not observed.

## Decision

1. **Check focus where it is set.** After `await openLinkText(...)`, the
   template compares `app.workspace.getActiveFile()` with the resolved file
   object (not its path). If they differ, it polls every 50 ms, at most 20
   times, well inside the 10 s typed-tool dispatch timeout. A healthy call
   gains one synchronous comparison and no wait.
2. **A dropped focus is its own envelope variant.** The template returns
   `{ok:false, code:'FOCUS_NOT_APPLIED', active:<path or null>}`;
   `focusBaseEvalResponseSchema` gains the strict variant. It is an internal
   handoff envelope, so no fingerprint moves.
3. **Fail before listing, as a retryable stage.** `focusNamedBase`
   (`src/tools/views_base/handler.ts`) throws `CLI_REPORTED_ERROR` with
   `details: { stage: "focus", base_path, active }`, `cause: null` and
   `views_base: could not bring base file at "<path>" to the front`, before
   `listFocusedViews` runs. It carries no `details.code`, no
   `details.reason` and no parser complaint (assessment Q2 = A). The help
   page lists it under the generic `CLI_REPORTED_ERROR` row's "Retry".
4. **Every focus failure is mapped by name.** The review of PR #140 moved
   the focus step into `focusNamedBase`, which maps each envelope code in a
   `switch` ending in a `never` check, so a future code is a compile error
   rather than a silent `BASE_NOT_FOUND` / `named-missing`.

## Alternatives rejected

- **A second open through `getLeaf(false).openFile(f, {active:true})` when
  the wait expires** (assessment remediation step 2, the reserve retry).
  Not added, by owner ruling of 2026-11-04 (option A): the probe never saw a
  dropped open, so there was no evidence the retry would land where the
  first open did not. A caller retries instead.
- **`BASE_NOT_FOUND` with a new `not-focused` reason** (assessment Q2
  option B). It widens a closed ADR-015 reason set and calls a Base that
  exists "not found".
- **`INTERNAL_ERROR`** (Q2 option C). It reports a host-app condition as a
  bridge invariant violation and does not signal that a retry may work.
- **Dropping `details.message` in named mode, or keeping it only when it
  can be attributed.** It removes the diagnosis spec 081 promises, and the
  complaint cannot be attributed because it does not name its file.
- **A second `eval` after `base:views` to discard a mismatched result.** A
  spawn on every named call, and a check after the fact.
- **Parsing the `.base` in the server.** It duplicates Obsidian's parser;
  the Bases cohort never parses `.base` itself (spec 081 research D2(c)).
- **Retrying focus and listing in the handler.** Recovery lives in the
  dispatch layer (ADR-029), and a retry still needs the detection of
  decision 1.

## Consequences

- A `BASE_MALFORMED` report in named mode describes the named Base whatever
  was open before the call, by construction rather than by observation:
  no live run took the `FOCUS_NOT_APPLIED` path, which unit tests alone
  cover (`.specify/bugs/bi-0179/test.md`, Residual Risks).
- If Obsidian drops an open in the field, the caller gets a retryable focus
  error instead of a misattributed complaint. If it drops every such open,
  every affected call fails that way; that is the cost of not adding the
  reserve retry.
- A person switching focus between the focus `eval` and `base:views` can
  still swap the file. That residual is accepted, as for the other
  active-mode callers.
- `runEvalTemplate` (`src/tools/_eval-template-fixtures.ts`) now passes
  `setTimeout` into its `node:vm` context, so a template that waits can be
  run in-process, under fake timers.
- `open_file`'s template trusts `openLinkText` the same way and reports a
  placement without checking that it landed. PR #140 names it as the same
  failure class and leaves it as a follow-up.
- `src/errors.ts`, the published schemas, `VIEWS_BASE_DESCRIPTION` and the
  boot spine did not change. No kernel node is touched.
