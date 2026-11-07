# Bug Assessment: No-active-file advice names inputs or tools the caller cannot use

- **Slug**: bi-0193
- **Created**: 2026-11-07
- **Source**: pasted text (BI-0193 backlog note, *Planned* 2026-11-05, filed 2026-11-04 as a follow-up of BI-0174 item 10)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> **Impact.** Recovery advice that names an input the tool does not accept cannot be followed: the agent's retry fails validation, or it gives up. Same harm as BI-0174 item 10 for the tools it did not cover.
>
> **Status and evidence.** The shared `ERR_NO_ACTIVE_FILE` message in the dispatch layer still advises `target_mode` for tools that do not have it. BI-0174 (item 10) gave `views_base` and `obsidian_exec` their own messages naming only their own inputs; every other tool that can raise the error still gets the shared advice.

Expected behaviour (drafted 2026-11-05 with the `speckit-specify-skill`), condensed:

- **Feature.** When a tool fails because Obsidian has no active file, its recovery advice names only inputs that this tool actually accepts.
- **Matching advice.** For any tool that can raise this error, every input the advice names is one the tool accepts, and following the advice exactly gives a retry that passes validation.
- **Tools with a target mode.** Called in active mode, the advice names specific mode with a vault and a note.
- **Tools without a target mode.** The advice does not mention a target mode and names the tool's own inputs instead.
- **Out of scope.** The two tools already fixed (`views_base`, `obsidian_exec`); changing which tools support active mode; other error messages.

No URL was supplied, so the URL trust policy did not apply.

## Symptom

A tool that fails with `ERR_NO_ACTIVE_FILE` should tell the agent how to retry using that tool's own inputs. Today the advice depends on which of six code paths raised the error. Two tools give advice that cannot be followed. `find_and_replace` tells the agent to pass `target_mode=specific`, which its strict schema rejects. `set_property` tells the agent to call `write_property`, a retired tool name. Four more tools say "switch to specific mode" without naming the vault and note the acceptance criteria require.

## Reproduction

Step 1 has a live reproduction (TC-00776). The other steps use unit-level stubs. Re-running TC-00776 needs the owner to focus the test vault and close its tabs (`owner_input: required`); the assistant does not close tabs itself, and no new live probe is added.

1. **Live, TC-00776** (0.9.0-local, run 2026-11-03 and 2026-11-04): `find_and_replace` with `active_note: true` and no note open. The focused-file eval returns `path: null`. Error: `ERR_NO_ACTIVE_FILE`, message `No active file in Obsidian. Open a note in the editor, or call find_and_replace with target_mode=specific + vault + file/path.` The tool has no `target_mode`; its single-note scope is `path` / `file`. A retry with `target_mode` fails with `VALIDATION_ERROR` (unrecognised key; the input schema is a `z.strictObject`, `src/tools/find_and_replace/schema.ts:42`). Its own page, `docs/tools/find_and_replace.md:140`, already gives the right advice: "Open a note in the editor, or name one explicitly with `path`/`file`." TC-00428 (`append_note`) returns the same sentence with its own tool name, which shows the message is built per tool in `_active-file.ts`, not only by the CLI.
2. `set_property` with `target_mode: "active"` and no note focused: message `No active file in Obsidian. Open a note in the editor, or call write_property with target_mode=specific.` `write_property` is a retired tool name (`src/tools/help/handler.test.ts:188`, `src/tools/_register.test.ts:817`). The advice names no vault and no note, so a retry with only `target_mode: "specific"` fails validation (`vault is required in specific mode`, plus the missing-locator issue).
3. `backlinks`, `links`, `read_heading` and `smart_connections_similar` in active mode with no note focused: the message is `<tool>: no note focused; switch to specific mode or focus a note.` It names no wrong input, but it does not name the vault and the note that specific mode requires (acceptance criterion *tools with a target mode*).
4. `delete` and `read_property` in active mode with no note focused: the CLI answers `Error: No active file.`, and dispatch raises its shared message `No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.` Both tools accept `target_mode`, `vault`, `file` and `path`, so this advice can be followed.

**Resolved (Relay):** the owner rejected the narrow code-traced finding. A tool with no target mode does receive advice that names `target_mode`: `find_and_replace` with `active_note: true`, reproduced live by TC-00776 (step 1). The message comes from the per-tool builder `noActiveFileMessage(toolName)` in `src/tools/_active-file.ts`, not from the dispatch layer, so the owner asked for a re-trace of every place the message is built. The re-trace (all `code: "ERR_NO_ACTIVE_FILE"` constructions and every caller of the shared resolvers, at HEAD) is in *Suspected Code Paths* under **Every builder of the message**. Scope: every tool that can raise the error, except `views_base` and `obsidian_exec` (BI-0193 Out of scope). The eval route by which a tool without a target mode could still receive the dispatch-level message is recorded as a residual risk (see *Risks & Considerations*). TC-00776 is the reproduction; no new live probe is added.

## Suspected Code Paths

Six places build an `ERR_NO_ACTIVE_FILE` message:

- `src/cli-adapter/_dispatch.ts:660-672`: shared dispatch message (priority (b)), which advises `target_mode: "specific"` and vault/file. Real reach: `delete` (active mode, `src/tools/delete/handler.ts:63-72`), `read_property` (active mode with the `active` flag, `src/tools/read_property/handler.ts:52-53`), and `views_base` and `obsidian_exec`, which already rewrap it (BI-0174). For `eval` (spec 080 C2), the phrase may also start any line when no answer line was found, so in principle any eval-based tool can receive it; `src/tools/move/handler.test.ts:281-299` pins that path with a stub.
- `src/tools/_active-file.ts:144-146` `noActiveFileMessage(toolName)`, called from `resolveActiveFocusedFile` (`:201-208`): the file-cohort message, `call <tool> with target_mode=specific + vault + file/path`. This is correct for its target-mode callers (write_note, append_note, prepend, patch_block, patch_heading through `resolveActiveLocatorWithVault` / `resolveFsTarget`, and read, rename, move, outline through `resolveFileTarget` in `src/tools/_file-target.ts:50`). It is **wrong** for `find_and_replace`, which has no `target_mode` and calls the same resolver (`src/tools/find_and_replace/handler.ts:464`).
- `src/tools/set_property/handler.ts:111-118`: its own inline message, which names the retired `write_property` and no vault or note.
- `src/tools/backlinks/handler.ts:62-68`, `src/tools/links/handler.ts:55-63`, `src/tools/read_heading/handler.ts:45-51`, `src/tools/smart_connections_similar/handler.ts:61-69`: the eval envelope's `NO_ACTIVE_FILE` mapped to `ERR_NO_ACTIVE_FILE` with the message `<tool>: no note focused; switch to specific mode or focus a note.`
- `src/tools/views_base/handler.ts:155-156,182` and `src/tools/obsidian_exec/handler.ts:53-54,82`: already fixed by BI-0174 through `throwIfNoActiveFile` (out of scope).
- `src/tools/get_active_file/handler.ts:13-14`: deliberately never raises `ERR_NO_ACTIVE_FILE` (not affected).

**Every builder of the message** (re-traced after the Relay answer, at HEAD: every `code: "ERR_NO_ACTIVE_FILE"` construction outside tests, and every caller of the shared resolvers):

| Builder | Tools that raise it | Advice names | Accepted by the tool? | In this fix |
|---|---|---|---|---|
| `_active-file.ts:144-146,201-208` `noActiveFileMessage(toolName)` via `resolveActiveFocusedFile` | `write_note` (`write_note/handler.ts:103`); `read`, `rename`, `move`, `outline` (via `resolveFileTarget`, `_file-target.ts:50`); `append_note`, `prepend`, `patch_block`, `patch_heading` (via `resolveFsTarget` → `resolveActiveLocatorWithVault`, `_file-target.ts:80`, `_active-file.ts:248`) | `target_mode=specific`, vault, file/path | Yes (all built on `targetModeBaseSchema`) | No change (already compliant; TC-00428 is `append_note`'s live instance) |
| same builder | `find_and_replace` (`find_and_replace/handler.ts:464`, `active_note: true`) | `target_mode=specific`, vault, file/path | **No**: no `target_mode`; `vault` forbidden with `active_note` | **Yes**: own advice via `throwIfNoActiveFile` |
| `set_property/handler.ts:111-118` (inline) | `set_property` (active mode) | retired tool `write_property`, `target_mode=specific` | **No**: wrong tool name; no vault or note named | **Yes**: `noActiveFileMessage("set_property")` |
| `backlinks/handler.ts:62-68`, `links/handler.ts:55-63`, `read_heading/handler.ts:45-51`, `smart_connections_similar/handler.ts:61-69` | those four tools (active mode, envelope `NO_ACTIVE_FILE`) | "specific mode" only | Names nothing wrong, but no vault or note | **Yes**: `noActiveFileMessage("<tool>")` |
| `_dispatch.ts:660-672` (shared dispatch default) | `delete`, `read_property` (active mode); in principle any eval caller via spec 080 C2 | `target_mode: "specific"`, vault/file | Yes for `delete` and `read_property` | No change (Relay Q1 = A); eval route is a residual risk |
| `views_base/handler.ts:155-156,182`, `obsidian_exec/handler.ts:53-54,82` (rethrow via `throwIfNoActiveFile`) | `views_base`, `obsidian_exec` | their own inputs | Yes | Out of scope (fixed by BI-0174) |

`get_active_file` never raises the error (`get_active_file/handler.ts:13-14`).

Which tools have a target mode: every tool built on `targetModeBaseSchema` + `applyTargetModeRefinement` (`src/target-mode/target-mode.ts:12-26,45`) accepts `target_mode`, `vault`, `file` and `path`. That covers delete, read_property, set_property, move, rename, outline, read, write_note, append_note, prepend, patch_block, patch_heading, backlinks, links, read_heading and smart_connections_similar. The folder-scoped tools (`files`, `paths`, `get_active_file`) take `target_mode` and `vault` but reject `file` / `path`. `find_and_replace` has no `target_mode`; its active-note input is `active_note: true`, which forbids `vault` and is exclusive with `file` / `path` (`src/tools/find_and_replace/schema.ts:165-186`).

## Root Cause Hypothesis

No-active-file advice has no single owner. Each path that detects the condition writes its own sentence. The shared sentences (the dispatch default and the file-cohort `noActiveFileMessage`) assume every caller has the target-mode inputs. Two sentences have drifted: `set_property` still uses its pre-rename tool name, and the four eval tools use a short form that omits the inputs. Concretely, `find_and_replace` reuses the file-cohort resolver, so it inherits advice for inputs it does not have. `set_property` predates the shared resolver and kept its own copy with the old tool name. The BI-0174 memory note (`.memory/refactor-decisions.md` item 44(b)) records that the deeper root fix, "the caller supplies the advice to dispatch", was scoped out of BI-0174. The live defect is in the tool-level messages, not the dispatch default: TC-00776 shows `find_and_replace` receiving the per-tool `noActiveFileMessage`, and TC-00428 shows `append_note` receiving the same sentence with its own name. The dispatch default reaches only `delete` and `read_property`, which accept every input it names. The only tools without a target mode known to reach it (`views_base`, `obsidian_exec`) are fixed. Any other tool without a target mode could reach it only through the eval C2 route, which is recorded as a residual risk (Relay Q1 = A). Confidence: **high**. The `find_and_replace` defect is reproduced live (TC-00776), and the `set_property` and four-eval-tool defects are read directly from the code and pinned by the schemas.

## Proposed Remediation

**Preferred**: give every target-mode tool the one existing cohort sentence, and give `find_and_replace` its own advice. Leave the dispatch default as it is (Relay Q1 = A).

1. `src/tools/_active-file.ts`: export `noActiveFileMessage(toolName)` unchanged (`No active file in Obsidian. Open a note in the editor, or call <tool> with target_mode=specific + vault + file/path.`). It already names specific mode, a vault and a note, and its two pinned assertions in `_active-file.test.ts:118,243` stay as they are.
2. `src/tools/set_property/handler.ts`: build the message with `noActiveFileMessage("set_property")`. Code and `details: {}` stay unchanged. The existing test (`set_property/handler.test.ts:270-280`) checks only the code. The three other `write_property:` prefixes (`:69`, `:100`, `:108`) stay unchanged (Relay Q3 = A). `fix.md` records them as a follow-up finding; whether to file a backlog item is the owner's call.
3. `backlinks`, `links`, `read_heading`, `smart_connections_similar` handlers: replace the `message` of the `ERR_NO_ACTIVE_FILE` mapping with `noActiveFileMessage("<tool>")`. Keep `details` (`stage: "envelope-error"`, `detail`) byte-identical, and leave the eval templates (and so `details.detail`) untouched, since template strings are recorded and asserted (refactor-decisions review check 2).
4. `src/tools/find_and_replace/handler.ts:464`: wrap the `resolveActiveFocusedFile(deps, "find_and_replace")` call so that an `ERR_NO_ACTIVE_FILE` is rethrown through the existing `throwIfNoActiveFile(err, advice)` (the documented rule in refactor-decisions item 44(b): a new such tool calls it and never re-copies the block). Use advice that names only its own inputs and matches `docs/tools/find_and_replace.md:140`, for example `No active file in Obsidian. Open a note in the editor, or call find_and_replace without active_note and name the note with path or file (and vault).` Code, cause and `details` stay unchanged.
5. Dispatch default (`_dispatch.ts:668-669`): unchanged, and its tests unchanged (Relay Q1 = A). Its real reachers (`delete`, `read_property`) accept every input it names, and the two tools without a target mode that reach it are already rewrapped.

**Alternatives** (considered; B and C were declined by Relay Q1 = A):
- *Q1 = B, caller-supplied advice at dispatch.* Add an optional `noActiveFileAdvice` to `DispatchInput` / `InvokeCliInput` / `InvokeEvalInput` / `InvokeBoundedCliInput`. Dispatch uses it when set, and `views_base` / `obsidian_exec` pass it instead of rethrowing. This is the root fix named in BI-0174. But it changes the runtime spine's input contracts (`dispatchCli` sits under every handler), and it guarantees nothing more unless every call site passes advice, which would touch most handlers.
- *Q1 = C, neutral dispatch default.* Reword the dispatch message so it names no input (for example `No active file in Obsidian. Open a note in Obsidian, then call again.`), and have `delete` and `read_property` rethrow it with `noActiveFileMessage`. This closes the latent eval C2 route for every tool without a target mode (and the folder-scoped `files` / `paths`, whose schemas reject `file`). The cost is editing pinned assertions in `_dispatch.test.ts` (several), `cli-adapter.test.ts` and `move/handler.test.ts:294-296`.
- *Give `resolveActiveFocusedFile` an optional advice argument* instead of the `find_and_replace` rethrow. This avoids a catch block, but it widens a resolver signature that eight callers share, for one caller. The rethrow helper exists for exactly this purpose.

**Files likely to change**:
- `src/tools/_active-file.ts` (export `noActiveFileMessage`; JSDoc updated)
- `src/tools/set_property/handler.ts`
- `src/tools/backlinks/handler.ts`, `src/tools/links/handler.ts`, `src/tools/read_heading/handler.ts`, `src/tools/smart_connections_similar/handler.ts`
- `src/tools/find_and_replace/handler.ts`
- Tests: `src/tools/set_property/handler.test.ts`, `src/tools/find_and_replace/scope.test.ts`, the four eval tools' `handler.test.ts`, `src/tools/smart_connections_similar/handler.lifecycle.test.ts` (see Q2)
- Docs, at the docs-as-code pass: any `docs/tools/*.md` page that quotes the old wording. The grep at assessment time found none that quote the four eval tools' or set_property's sentence. `find_and_replace.md:140` already matches the preferred advice.

**Tests to add or update**:
- `set_property`: active mode with no focused note → `ERR_NO_ACTIVE_FILE` whose message names `set_property`, `target_mode=specific`, `vault` and `file/path`, and does not contain `write_property`.
- `find_and_replace`: `active_note: true` with no note open → `ERR_NO_ACTIVE_FILE` whose message names `active_note`, `path` / `file` and does not contain `target_mode`; `details` unchanged.
- `backlinks`, `links`, `read_heading`, `smart_connections_similar`: the envelope `NO_ACTIVE_FILE` → message equals `noActiveFileMessage(<tool>)`; `details` unchanged.
- One acceptance-level guard (in `_active-file.test.ts` or a small cross-tool test): for each tool's advice, every input it names is a key of that tool's published input schema. This can be a table of `{tool, message, inputSchema}`, so a future drift such as `write_property` fails a test.
- Existing assertion to edit (approved, Relay Q2 = A, owner ruling 2026-11-07): only `smart_connections_similar/handler.lifecycle.test.ts:138`, changed to `No active file in Obsidian. Open a note in the editor, or call smart_connections_similar with target_mode=specific + vault + file/path.` Line 139's `details` stays unchanged, and a new test pins the new message. If any other existing test fails, stop and raise it: any other edit to an existing test needs a fresh owner ruling.

## Risks & Considerations

- **Test-edit gate.** `.memory/refactor-decisions.md` item 5 requires owner approval before an existing assertion changes. The owner approved exactly one (Relay Q2 = A, 2026-11-07): `smart_connections_similar/handler.lifecycle.test.ts:138`; line 139's `details.detail` stays. Any other failing existing test stops the fix for a fresh ruling.
- **No new error code** (Principle IV). Every path keeps `ERR_NO_ACTIVE_FILE`, and only the `message` changes. `details` stays byte-identical everywhere, so a client that branches on `code` / `details` sees no change.
- **Message is published contract.** Agents may match on message text. The four eval tools lose their `<tool>: ` prefix if they adopt the cohort sentence. Acceptable, since the code is the stable discriminator, but the docs-as-code pass should check `docs/tools/{backlinks,links,read_heading,smart_connections_similar}.md` error tables.
- **Residual risk: the eval C2 route** (accepted, Relay Q1 = A). A tool without a target mode could still receive the dispatch default if an eval produced no answer line and some line started `Error: no active file`. Obsidian's `eval` does not print that line itself; only a plugin would. This fix leaves the route open on purpose: closing it (option C) would edit the dispatch message's pinned tests, which BI-0174 item 10 kept unchanged.
- **Live re-check.** TC-00776 can be re-run only with the owner focusing the test vault and closing its tabs (`owner_input: required`). `/speckit-bug-test` must not close tabs itself.
- **Folder-scoped tools.** `files` / `paths` / `get_active_file` would name `file`, which they reject, if they ever received the dispatch default. `get_active_file` never errors on no active file. `files` runs the `files` CLI command in active mode, and whether that command can answer `Error: No active file.` is unverified. It is part of the residual risk accepted with Relay Q1 = A.
- **Observability.** None: messages are not logged on this path (dispatch priority (b) does not log, `_dispatch.test.ts:401`).

## CodeGraph structural check

- **Affected modules.** `src/tools/_active-file.ts` (shared resolver module; `resolveActiveFocusedFile` is called by `_file-target.ts`, `write_note`, `find_and_replace` and `resolveActiveLocatorWithVault`; `throwIfNoActiveFile` is called by `views_base` and `obsidian_exec`), and the handlers of `set_property`, `find_and_replace`, `backlinks`, `links`, `read_heading` and `smart_connections_similar`. All are runtime-spine handlers or the tools-layer helper beneath them. No boot-spine file (`server.ts`, `tools/_register.ts`) changes.
- **Blast radius.** Changing `noActiveFileMessage` itself would reach every file-cohort tool through `resolveActiveFocusedFile`, so the preferred path keeps its text and only exports it. `dispatchCli` (`src/cli-adapter/_dispatch.ts`) sits under every typed and bounded call through `invokeCli` / `invokeEval` / `invokeBoundedCli`. The preferred path does not touch it; alternatives B and C do.
- **Imports.** The new imports run tools → `_active-file.ts` (sibling helper in the same layer), the same direction as the existing `views_base` / `obsidian_exec` imports. No upward or cyclic import.
- **Kernel nodes.** The fix touches **none** of the kernel nodes. `createLogger()` and `createQueue()` are neither changed nor imported by any changed handler. `createServer()` is not changed. `UpstreamError` is only constructed with its existing shape and an existing code (`src/errors.ts` unchanged). Post-fix verification should hold this claim, together with the four checks in CLAUDE.md, in `fix.md`.

## Open Questions

**Q1. The dispatch-level message: change it in this fix?**

Context: `_dispatch.ts:668-669` advises `target_mode: "specific"` and vault/file. CodeGraph shows `dispatchCli` under every `invokeCli` / `invokeEval` / `invokeBoundedCli` call. Tracing the call sites, the CLI commands that actually answer `Error: No active file.` are reached only by `delete` and `read_property` (both accept `target_mode`, `vault`, `file` and `path`) and by the already fixed `views_base` and `obsidian_exec`. Other tools reach it only through the eval C2 rule, when a plugin prints the line and no answer is found.

| Option | What | Trade-off |
|---|---|---|
| **A (recommended)** | Leave the dispatch message unchanged; fix the six tool-level messages as above. | One existing-test edit; no runtime-spine change. A latent eval-C2 path stays for tools without a target mode. |
| B | Add caller-supplied advice to the dispatch input (the root fix named in BI-0174). | Changes the dispatch / adapter input contracts and many call sites, for no reachable defect beyond A. |
| C | Make the dispatch default name no input; `delete` and `read_property` rethrow it with the cohort advice. | Closes the latent path for every tool, but edits several pinned assertions in `_dispatch.test.ts`, `cli-adapter.test.ts` and `move/handler.test.ts`. |

Recommendation: A. It fixes every reachable defect with the smallest test change. B and C buy protection against a path no real Obsidian call is known to take.

**Resolved (Relay):** A. Leave the dispatch message and its tests as they are, and fix the six tool-level messages: `set_property`, `find_and_replace`, `backlinks`, `links`, `read_heading` and `smart_connections_similar`. The eval route for tools without a target mode is recorded as a residual risk. Why: BI-0174 item 10 (owner ruling 2026-11-04) fixed `views_base` and `obsidian_exec` and kept the dispatch message and its tests unchanged. BI-0193's Out of scope excludes those two tools and other error messages. The dispatch message's reachers (`delete`, `read_property`) accept every input it names, so it already meets the acceptance criteria. TC-00776 shows the live defect is in the tool-level messages. This answer approves no test edit by itself; that is Q2.

**Q2. May one existing assertion be edited?** `src/tools/smart_connections_similar/handler.lifecycle.test.ts:138` pins `smart_connections_similar: no note focused; switch to specific mode or focus a note.` as the `ERR_NO_ACTIVE_FILE` message. The preferred path changes that message to the cohort sentence. Recommendation: approve exactly that one assertion (line 138 only; line 139's `details` stays), and pin the new message with a new test. If any other existing test fails, stop and raise it.

**Resolved (Relay):** A (owner ruling 2026-11-07, recorded in the BI-0193 Status section). Edit only the assertion at `src/tools/smart_connections_similar/handler.lifecycle.test.ts:138`, to `No active file in Obsidian. Open a note in the editor, or call smart_connections_similar with target_mode=specific + vault + file/path.` Keep line 139's `details` unchanged, and add a new test that pins the new message. If any other existing test fails, stop and raise it: any other edit to an existing test needs a fresh owner ruling.

**Q3. `set_property`'s other `write_property:` prefixes.** The `CLI_REPORTED_ERROR` messages at `set_property/handler.ts:69,100,108` also carry the retired name. They are other error messages and therefore out of scope as written. Recommendation: leave them, and raise them as their own item if the owner wants them corrected.

**Resolved (Relay):** A. Leave the three `write_property:` messages unchanged in this fix, and record them as a follow-up finding in the fix report (`fix.md`). Do not create a backlog item; whether to file one is the owner's call (the owner has recorded the finding on BI-0193). Why: BI-0193's Out of scope excludes "Other error messages"; only the no-active-file message is in scope. The `write_property` → `set_property` rename was BI-0061.
