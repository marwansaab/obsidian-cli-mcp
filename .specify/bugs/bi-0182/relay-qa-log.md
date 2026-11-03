# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0182-2026-11-03`, started 2026-11-03T12:34:24.565Z.

## 1. checks / preflight (2026-11-03T12:34:24.612Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0182. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0182 in the vault.
> 3. Its `initiative` must refer to "Obsidian CLI MCP". It is usually a wikilink, such as "[[Obsidian CLI MCP]]".
> 4. Its `status` must not mean the work is finished or abandoned (for example shipped, done, cancelled, superseded). Any other status (planned, in-flight, deferred and so on): report it and carry on.
> 5. Its `variant` must be `bug-fix`. This run repairs broken behaviour; a feature goes through the full spec-kit workflow instead.
> 6. It must have a "/speckit-bug-assess prompt" section, or else a "/speckit-specify prompt" section, which describes the expected behaviour. Don't change the note.
> 7. If you haven't already in this conversation, load the clarify skill with the Skill tool, using the reference "<id> - <title>" from the note. It may be listed as `speckit-clarify-skill` or `anthropic-skills:speckit-clarify-skill`. Follow its answering rules for every question that follows. If you can't load it, follow the answer format in your role instead, and say so in the summary; don't escalate for that.
>
> Answer with a short readiness summary: the vault id, the note's path, title, status and variant, and the result of each check.
> Escalate if a check fails, with at most 2 short choices (Relay adds "Stop the run" as a third):
> - `ungrounded`: the vault identity doesn't match, or the note or both prompt sections are missing. Choices: "Fixed: check again".
> - `scope`: the note belongs to another initiative, its status says the work is finished, or its variant isn't `bug-fix`. Choices: "Run it anyway", "Fixed: check again".

**Advisor** (escalate: none):

> Preflight passed for BI-0182 — Complete Parameter Rename In Error Details. All checks pass.
>
> 1. Vault identity: `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup`. PASS. The five session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the per-MCP note Obsidian CLI MCP - Tool Notes.
> 2. Note found: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`. PASS.
> 3. Initiative: `[[Obsidian CLI MCP]]`. PASS.
> 4. Status: `planned`, so the work is not finished. PASS. Carrying on.
> 5. Variant: `bug-fix`. PASS.
> 6. Prompt section: there is no "/speckit-bug-assess prompt" section, but there is a "/speckit-specify prompt" section. It describes the expected behaviour in three stories: errors use current names, error vocabulary is consistent, deprecation notice on failure. PASS. Note not changed.
> 7. Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0182 - Complete Parameter Rename In Error Details". PASS.
>
> Primed for BI-0182 — Complete Parameter Rename In Error Details.
> Read: BI, Constitution (v1.5.1), Architecture (Canonical contracts), ADR-046.
> Role: BA + Solution Architect, answering for the developer agent.
>
> Heads-up for later questions (no action at preflight): the BI's sub-item 2 conflicts with ADR-046.
> - The BI wants `find_and_replace` errors to stop using code `INVALID_SUBFOLDER` and detail key `details.subfolder`.
> - ADR-046 Decision 5 says "machine-readable error codes and `details` keys do not change". Its Consequences say `INVALID_SUBFOLDER` details "keep their `subfolder` key".
> - Sub-item 1 agrees with ADR-046 ("validation of the resolved value reports the new name").
> - On sub-item 3, ADR-046 says only that "the call's result" carries `deprecated_parameters`. It does not settle whether error responses should carry it.
>
> A question that would rename that error code or detail key will be escalated as `conflict`/`decision`.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`, `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Preflight passed for BI-0182 — Complete Parameter Rename In Error Details. All checks pass.
>
> 1. Vault identity: `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup`. PASS. The five session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the per-MCP note Obsidian CLI MCP - Tool Notes.
> 2. Note found: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`. PASS.
> 3. Initiative: `[[Obsidian CLI MCP]]`. PASS.
> 4. Status: `planned`, so the work is not finished. PASS. Carrying on.
> 5. Variant: `bug-fix`. PASS.
> 6. Prompt section: there is no "/speckit-bug-assess prompt" section, but there is a "/speckit-specify prompt" section. It describes the expected behaviour in three stories: errors use current names, error vocabulary is consistent, deprecation notice on failure. PASS. Note not changed.
> 7. Clarify skill: `anthropic-skills:speckit-clarify-skill` loaded with "BI-0182 - Complete Parameter Rename In Error Details". PASS.
>
> Primed for BI-0182 — Complete Parameter Rename In Error Details.
> Read: BI, Constitution (v1.5.1), Architecture (Canonical contracts), ADR-046.
> Role: BA + Solution Architect, answering for the developer agent.
>
> Heads-up for later questions (no action at preflight): the BI's sub-item 2 conflicts with ADR-046.
> - The BI wants `find_and_replace` errors to stop using code `INVALID_SUBFOLDER` and detail key `details.subfolder`.
> - ADR-046 Decision 5 says "machine-readable error codes and `details` keys do not change". Its Consequences say `INVALID_SUBFOLDER` details "keep their `subfolder` key".
> - Sub-item 1 agrees with ADR-046 ("validation of the resolved value reports the new name").
> - On sub-item 3, ADR-046 says only that "the call's result" carries `deprecated_parameters`. It does not settle whether error responses should carry it.
>
> A question that would rename that error code or detail key will be escalated as `conflict`/`decision`.

## 2. assess / bug-assess (2026-11-03T12:36:06.609Z)

**Question (verbatim):**

> Return the bug report for job BI-0182 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0182`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0182
>
> ## Impact
> BI-0109 renamed parameters so a tool family shares one vocabulary, and ADR-046 requires the new name everywhere a caller sees it. On error paths the rename is half done: the same mistake is reported under the old name on one tool and the new name on another, and the `find_and_replace` error's code and detail key disagree with its own message. A caller writing error handling against the documented new names misses these cases, and an agent calling with an old name gets no deprecation notice exactly when it most needs one — when the call failed. Low impact (error paths only, no data at risk) but it leaves the rename inconsistent across the family.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0109 - Standardise Cohort Tool Parameter Names]] (numbering per [[ADR-046 - Shared Parameter Names Within A Tool Family]]). Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local`, with no dedicated TC yet (the BI-0109 TCs, which check success paths, pass). Three sub-items:
>
> 1. `find_by_property` with `property: ""` (the deprecated name) reports the validation issue on path `["property"]`; ADR-046 says error details use the resolved new name (`name`), and `create_base` already does so for its renamed parameter.
> 2. `find_and_replace` errors for the renamed folder parameter still carry `details.code: "INVALID_SUBFOLDER"` and a `details.subfolder` key, while the messages say `folder`.
> 3. Error responses to calls that use an old parameter name carry no `deprecated_parameters` entry, although the description says calls using old names receive one. It may be success-only by design; if so, the description must say so.
>
> ## Expected behaviour
> /speckit-specify Complete parameter rename
>
> ## Feature
> Every error a tool returns names its inputs by their current names, and calls that use a retired input name get the deprecation notice in failures as well as successes, or the documentation states plainly that they do not.
>
> ## Why
> Inputs across a tool family were recently renamed so callers use one vocabulary. On error paths the old names still appear: one tool reports a problem under the retired name, another returns an error code and detail named after the old input while its message uses the new one. Callers handling errors by the documented names miss these cases, and agents still using old names get no notice when their call fails.
>
> ## User stories
> - As an agent, I want validation errors to point at the current input name, so that I can fix the call using the name the documentation gives.
> - As an agent, I want an error's code, detail fields and message to use the same input name, so that I can branch on any of them reliably.
> - As an agent calling with a retired input name, I want to learn the name is retired even when my call fails, so that I can update my calls.
>
> ## Acceptance criteria
>
> **Story: errors use current names**
> - Given a property lookup called with an empty value under the retired input name, when the call fails, then the error identifies the problem by the current input name.
> - Given the same mistake made under the current name, when the call fails, then the error is identical.
>
> **Story: consistent error vocabulary**
> - Given a find-and-replace call naming a folder that does not exist, when the call fails, then the error code, the detail field and the message all refer to the folder input by its current name.
>
> **Story: deprecation notice on failure**
> - Given a call using a retired input name that fails for another reason, when the agent reads the error, then it says the input name is retired and gives the current name — or, if notices are deliberately limited to successful calls, the documentation says so and no tool claims otherwise.
>
> ## Out of scope
> - Removing support for the retired input names.
> - Renaming any further inputs.
> - Changing successful responses.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0182
>
> ## Impact
> BI-0109 renamed parameters so a tool family shares one vocabulary, and ADR-046 requires the new name everywhere a caller sees it. On error paths the rename is half done: the same mistake is reported under the old name on one tool and the new name on another, and the `find_and_replace` error's code and detail key disagree with its own message. A caller writing error handling against the documented new names misses these cases, and an agent calling with an old name gets no deprecation notice exactly when it most needs one — when the call failed. Low impact (error paths only, no data at risk) but it leaves the rename inconsistent across the family.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0109 - Standardise Cohort Tool Parameter Names]] (numbering per [[ADR-046 - Shared Parameter Names Within A Tool Family]]). Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local`, with no dedicated TC yet (the BI-0109 TCs, which check success paths, pass). Three sub-items:
>
> 1. `find_by_property` with `property: ""` (the deprecated name) reports the validation issue on path `["property"]`; ADR-046 says error details use the resolved new name (`name`), and `create_base` already does so for its renamed parameter.
> 2. `find_and_replace` errors for the renamed folder parameter still carry `details.code: "INVALID_SUBFOLDER"` and a `details.subfolder` key, while the messages say `folder`.
> 3. Error responses to calls that use an old parameter name carry no `deprecated_parameters` entry, although the description says calls using old names receive one. It may be success-only by design; if so, the description must say so.
>
> ## Expected behaviour
> /speckit-specify Complete parameter rename
>
> ## Feature
> Every error a tool returns names its inputs by their current names, and calls that use a retired input name get the deprecation notice in failures as well as successes, or the documentation states plainly that they do not.
>
> ## Why
> Inputs across a tool family were recently renamed so callers use one vocabulary. On error paths the old names still appear: one tool reports a problem under the retired name, another returns an error code and detail named after the old input while its message uses the new one. Callers handling errors by the documented names miss these cases, and agents still using old names get no notice when their call fails.
>
> ## User stories
> - As an agent, I want validation errors to point at the current input name, so that I can fix the call using the name the documentation gives.
> - As an agent, I want an error's code, detail fields and message to use the same input name, so that I can branch on any of them reliably.
> - As an agent calling with a retired input name, I want to learn the name is retired even when my call fails, so that I can update my calls.
>
> ## Acceptance criteria
>
> **Story: errors use current names**
> - Given a property lookup called with an empty value under the retired input name, when the call fails, then the error identifies the problem by the current input name.
> - Given the same mistake made under the current name, when the call fails, then the error is identical.
>
> **Story: consistent error vocabulary**
> - Given a find-and-replace call naming a folder that does not exist, when the call fails, then the error code, the detail field and the message all refer to the folder input by its current name.
>
> **Story: deprecation notice on failure**
> - Given a call using a retired input name that fails for another reason, when the agent reads the error, then it says the input name is retired and gives the current name — or, if notices are deliberately limited to successful calls, the documentation says so and no tool claims otherwise.
>
> ## Out of scope
> - Removing support for the retired input names.
> - Renaming any further inputs.
> - Changing successful responses.

## 3. assess / bug-assess (2026-11-03T12:40:13.113Z)

**Question (verbatim):**

> **Q1 — `find_and_replace`'s folder error vocabulary (sub-item 2) conflicts with ADR-046.**
>
> Context: the missing-folder error is built in `resolveScope` (`src/tools/find_and_replace/handler.ts:551-561`), reached only from `executeFindAndReplace`, with `details: { code: "INVALID_SUBFOLDER", reason: "not-found", subfolder, vault }`. The path-traversal case is lifted to `INVALID_SUBFOLDER` by the tool's `mapValidationError` (`index.ts:135-147`). ADR-046 (Decided) Decision 5 says "machine-readable error codes and `details` keys do not change", and its Consequences name this exact key: "`find_and_replace`'s INVALID_SUBFOLDER details keep their `subfolder` key". Spec 073 FR-009, research D6 and the parameter-names contract §4 say the same. The BI's acceptance criterion asks for code, detail key and message to all name `folder`.
>
> | Option | Description |
> |--------|-------------|
> | A (recommended) | Keep `INVALID_SUBFOLDER` and `details.subfolder` as ADR-046 decided, and close sub-item 2 as by design. Add one sentence to `docs/tools/find_and_replace.md` saying the folder errors keep the stable code and key until the next major release. The code rename joins the removal follow-up at the next major release. |
> | B | Rename to a `folder`-named code and key now (for example `INVALID_FOLDER`, `details.folder`). Breaking for callers that branch on `INVALID_SUBFOLDER`; needs a new ADR superseding ADR-046 Decision 5 and Consequences for this case, and updates to existing tests (`handler.test.ts:603-675`, `index.test.ts:148-163`, `schema.test.ts:397-402`). |
> | C | Additive: keep the code and `details.subfolder`, and add `details.folder` with the same value. Non-breaking, but it still changes a `details` shape ADR-046 froze (new ADR or amendment needed), and the code stays old-named, so the criterion is only partly met. |
>
> Recommended: **A**. ADR-046 deliberately keeps machine-readable codes stable during the transition, so that no caller's error handling breaks before the next major release. Renaming the code is exactly the kind of breaking change that ADR reserves for the removal follow-up. The message already names `folder`, and the description already maps `folder` → `INVALID_SUBFOLDER`.

**Advisor** (escalate: conflict: BI-0182's sub-item 2 and acceptance criterion ask for a folder-named error code and detail key, but ADR-046 (Decided) freezes that code and that key until the next major release. Option A drops a BI criterion; options B and C would amend or reverse ADR-046. Either way, the owner has to choose.):

> 1. A
>
> The BI's criterion goes against ADR-046 (Decided). Decision 5 says "machine-readable error codes and `details` keys do not change". The Consequences say `find_and_replace`'s INVALID_SUBFOLDER details "keep their `subfolder` key". The BI's own Impact section misreads ADR-046 as requiring the new name everywhere. Keep `INVALID_SUBFOLDER` and `details.subfolder`. Document in `docs/tools/find_and_replace.md` that they stay stable until the next major release. Leave the rename to the removal follow-up. Leave sub-items 1 and 3 as they are.

Sources: `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. A
>
> Owner ruling: keep code `INVALID_SUBFOLDER` and key `details.subfolder` unchanged. Close sub-item 2 as by design. Add one sentence to `docs/tools/find_and_replace.md`: folder errors keep the stable code and key until the next major release. Rename the code and key only in the removal follow-up at the next major release. Change no tests for sub-item 2. The "consistent error vocabulary" criterion counts as met by the existing `folder` message plus that sentence.
>
> Per ADR-046 Decision 5 and its Consequences. The ruling is recorded on BI-0182, sub-item 2.

Sources: `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`: Status sub-item 2: added the owner ruling of 2026-11-03 (clarify Q1). The code and key stay as ADR-046 decided; the fix documents them in the help page instead of renaming them.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`: Frontmatter `updated` changed from 2026-11-02 to 2026-11-03.
- `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`: find_and_replace rename bullet: the INVALID_SUBFOLDER / details.subfolder behaviour is now described as by design until the next major release (ADR-046, owner ruling), not as lagging the rename.

**Owner:** choice 1 (A: keep code+key, document it), via cli, 2026-11-03T12:41:40.517Z.

**Sent to the step:**

> 1. A
>
> Owner ruling: keep code `INVALID_SUBFOLDER` and key `details.subfolder` unchanged. Close sub-item 2 as by design. Add one sentence to `docs/tools/find_and_replace.md`: folder errors keep the stable code and key until the next major release. Rename the code and key only in the removal follow-up at the next major release. Change no tests for sub-item 2. The "consistent error vocabulary" criterion counts as met by the existing `folder` message plus that sentence.
>
> Per ADR-046 Decision 5 and its Consequences. The ruling is recorded on BI-0182, sub-item 2.

## 4. assess / bug-assess (2026-11-03T12:42:27.865Z)

**Question (verbatim):**

> **Q2 — Deprecation notice on failed calls (sub-item 3).**
>
> Context: `registerTool` (`src/tools/_register.ts:194-201`) returns the validation envelope before any handler runs. The three `index.ts` wrappers call `withDeprecatedParameters` only on a resolved handler result. Spec 073 clarify Q2 and FR-011 define the notice for "a successful call", and FR-009 forbids other error changes. The three descriptions (`find_by_property/index.ts:25`, `find_and_replace/index.ts:46`, `create_base/index.ts:30`) and the three help pages say "a call that uses one gets `deprecated_parameters` in its result", without the word "successful".
>
> | Option | Description |
> |--------|-------------|
> | A (recommended) | Documentation only. The three descriptions and the three help pages say that a *successful* call using an old name gets `deprecated_parameters` and that error responses do not carry it. Description bytes move (deliberate fingerprint change). |
> | B | Notice on failure too. Every error response to a call that used an old name gains `details.deprecated_parameters`: handler failures through a catch in each `index.ts` wrapper, validation failures through each tool's `mapValidationError` from `rawArgs` (`find_by_property` gains a hook). Widens every error's `details` on three tools, against FR-009 and ADR-046 Decision 5, so it needs an ADR amendment. |
>
> Recommended: **A**. It is the report's own fallback ("if notices are deliberately limited to successful calls, the documentation says so"). It matches the decided design (FR-011 success-only, FR-009 errors unchanged), and it changes no machine-readable surface.

**Advisor** (escalate: none):

> 2. A
>
> The BI's sub-item 3 and its acceptance criterion already allow this outcome: "if notices are deliberately limited to successful calls, the documentation says so and no tool claims otherwise". ADR-046 Decision 5 puts the notice on "the call's result" and keeps error `details` keys unchanged. Option B would widen error `details` against that decision.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`, `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`: Status sub-item 3: recorded the clarify Q2 answer (advisor answer, not an owner ruling). The notice is success-only by design (spec 073, ADR-046 Decision 5), so the fix only corrects the three descriptions and help pages.

**Sent to the step:**

> 2. A
>
> The BI's sub-item 3 and its acceptance criterion already allow this outcome: "if notices are deliberately limited to successful calls, the documentation says so and no tool claims otherwise". ADR-046 Decision 5 puts the notice on "the call's result" and keeps error `details` keys unchanged. Option B would widen error `details` against that decision.

## 5. assess / bug-assess (2026-11-03T12:42:48.281Z)

**Question (verbatim):**

> **Q3 — Scope of sub-item 1: empty values only, or wrong-type values on old keys too?**
>
> Context: the probe shows two classes of old-key issue. Redundant value checks on alias fields (`find_by_property/schema.ts:32` `property` `.min(1)`, `create_base/schema.ts:36` `view` `.min(1)`) report `""` under the old name. Dropping them moves the check to the new-name side and fixes the report's case. Type checks on alias fields (`arrayMatch: "x"` → `["arrayMatch"]`; `create_base` `path: 5` → `["path"]` with message `base_path must be a string`) are the published type of the alias key, which ADR-046 requires to stay published. Only a path remap in the error mapping can move them to the new name.
>
> | Option | Description |
> |--------|-------------|
> | A (recommended) | Fix the empty-value class only: drop `min(1)` from the `property` and `view` aliases. This covers the report's acceptance criterion and the matching `create_base` `view` case. Wrong-type issues on old keys keep the old path, since the caller's own key is wrong-typed. |
> | B | Also remap: add a shared `renameIssuePaths` helper in `_deprecated-params.ts` and apply it in all three tools' `mapValidationError` (`find_by_property` gains a hook), so every per-value issue on an old key reports the replacement name. More code across three tools. |
>
> Recommended: **A**. It meets every acceptance criterion the report states with a two-line schema change and follows `create_base`'s `path` precedent. A wrong-type value is an error in the key the caller actually sent, and the conflict issue already reports at the old key for the same reason.

**Advisor** (escalate: none):

> 3. A
>
> The BI's acceptance criteria cover only an empty value under a retired name, and the same mistake under the current name must give an identical error. Dropping the alias `min(1)` checks covers that, including the matching `create_base` `view` case. ADR-046 Decision 5 says "validation of the resolved value reports the new name". A wrong-typed old-key value never resolves to the new name, so it keeps reporting the old key.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`, `200-Decisions/ADR-046 - Shared Parameter Names Within A Tool Family.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0182 - Complete Parameter Rename In Error Details.md`: Status sub-item 1: recorded the clarify Q3 answer (advisor answer). Scope is empty values on old keys (find_by_property `property`, create_base `view`). Wrong-type values on old keys keep the old path.

**Sent to the step:**

> 3. A
>
> The BI's acceptance criteria cover only an empty value under a retired name, and the same mistake under the current name must give an identical error. Dropping the alias `min(1)` checks covers that, including the matching `create_base` `view` case. ADR-046 Decision 5 says "validation of the resolved value reports the new name". A wrong-typed old-key value never resolves to the new name, so it keeps reporting the old key.
