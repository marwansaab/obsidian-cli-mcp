# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0060-2026-10-31`, started 2026-10-31T05:04:57.745Z.

## 1. checks / preflight (2026-10-31T05:04:57.788Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0060. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0060 in the vault.
> 3. Its `initiative` must refer to "Obsidian CLI MCP". It is usually a wikilink, such as "[[Obsidian CLI MCP]]".
> 4. Its `status` must not mean the work is finished or abandoned (for example shipped, done, cancelled, superseded). Any other status (planned, in-flight, deferred and so on): report it and carry on.
> 5. It must have a "/speckit-specify prompt" section, and the command at the start of that prompt must be exactly `/speckit-specify` (the dash form). Don't change the note.
> 6. If you haven't already in this conversation, load the clarify skill with the Skill tool, using the reference "<id> - <title>" from the note. It may be listed as `speckit-clarify-skill` or `anthropic-skills:speckit-clarify-skill`. Follow its answering rules for every question that follows. If you can't load it, follow the answer format in your role instead, and say so in the summary; don't escalate for that.
>
> Answer with a short readiness summary: the vault id, the note's path, title and status, and the result of each check.
> Escalate if a check fails, with at most 2 short choices (Relay adds "Stop the run" as a third):
> - `ungrounded`: the vault identity doesn't match, or the note or its specify-prompt section is missing. Choices: "Fixed: check again".
> - `scope`: the note belongs to another initiative, or its status says the work is finished. Choices: "Run it anyway", "Fixed: check again".
> - `conflict`: the command isn't `/speckit-specify` (for example the older `/speckit.specify`). Say that the owner should change the note's command to `/speckit-specify`. Choices: "Fixed: check again".

**Advisor** (escalate: none):

> Primed for BI-0060 — Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.
>
> Readiness, check by check:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which matches `expected_vault_id: my-setup` (read through obsidian-cli-mcp, vault `My-Setup-Vault`). Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. Obsidian CLI MCP - Tool Notes also loaded.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`. Title: "Widen Hardcoded Md Extension Support To Obsidian Native Filetypes".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (re-validated 2026-10-31 against 0.9.0-local; the rename of a `.canvas` file still silently produces a `.md`).
> 5. Specify prompt: PASS. The "/speckit-specify prompt" section is present. The command is exactly `/speckit-specify` (dash form), with the opener `/speckit-specify Prevent filetype changes`. The note was not changed.
> 6. Clarify skill: PASS. `anthropic-skills:speckit-clarify-skill` is loaded with "BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes". Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-003, ADR-009. Role: BA + Solution Architect, answering for Claude Code. Its answering rules (letter only, or a short directive in caveman-full with a cited rationale) apply to every question from here on.
>
> Heads-up for later questions: the BI defers the filetype allowlist roster to `/speckit-clarify`. It also says that if the roster sets a project-wide policy it needs a new ADR. A question that tries to settle the roster for the whole project will therefore be escalated as `decision`. A per-tool roster can go in the spec's clarifications log.
>
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `Obsidian CLI MCP - Architecture`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools`, `200-Decisions/ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Primed for BI-0060 — Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.
>
> Readiness, check by check:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which matches `expected_vault_id: my-setup` (read through obsidian-cli-mcp, vault `My-Setup-Vault`). Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. Obsidian CLI MCP - Tool Notes also loaded.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`. Title: "Widen Hardcoded Md Extension Support To Obsidian Native Filetypes".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (re-validated 2026-10-31 against 0.9.0-local; the rename of a `.canvas` file still silently produces a `.md`).
> 5. Specify prompt: PASS. The "/speckit-specify prompt" section is present. The command is exactly `/speckit-specify` (dash form), with the opener `/speckit-specify Prevent filetype changes`. The note was not changed.
> 6. Clarify skill: PASS. `anthropic-skills:speckit-clarify-skill` is loaded with "BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes". Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-003, ADR-009. Role: BA + Solution Architect, answering for Claude Code. Its answering rules (letter only, or a short directive in caveman-full with a cited rationale) apply to every question from here on.
>
> Heads-up for later questions: the BI defers the filetype allowlist roster to `/speckit-clarify`. It also says that if the roster sets a project-wide policy it needs a new ADR. A question that tries to settle the roster for the whole project will therefore be escalated as `decision`. A per-tool roster can go in the spec's clarifications log.
>
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-10-31T05:05:40.641Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0060's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Prevent filetype changes
>
> ## Feature
> Every tool that takes a vault file path either handles Obsidian's native file types (notes, canvases, bases, attachments) correctly or rejects a type it does not support with a clear error; no tool silently changes a file's type.
>
> ## Why
> Renaming a canvas currently succeeds and turns it into a Markdown note, with no error, so the agent believes it renamed the canvas. Several tools quietly assume every vault file is a Markdown note, and the agent cannot tell which ones from the tool surface.
>
> ## User stories
> - As an agent, I want renaming or moving a non-Markdown file to keep its file type, so that a canvas stays a canvas.
> - As an agent, I want a tool that supports notes only to reject other file types with a clear error, so that I know to use another route.
> - As an agent, I want each tool's description to state which file types it supports, so that I pick the right tool first time.
> - As a vault owner, I want no tool to change a file's type unless asked, so that my canvases, bases and attachments are never silently converted.
>
> ## Acceptance criteria
>
> **Story: file type preserved**
> - Given a canvas, base or attachment, when an agent renames or moves it with a tool that supports that type, then the file keeps its original extension.
>
> **Story: unsupported types rejected**
> - Given a tool that supports notes only, when an agent passes a canvas, base or attachment path, then the call fails with a clear unsupported-file-type error and nothing in the vault changes.
> - Given a rename whose result would carry a different extension from the source, when the agent calls it, then the call does not silently produce a different file type.
>
> **Story: documented support**
> - Given any tool that takes a vault file path, when an agent reads its description, then the supported file types are named.
>
> **Story: no silent conversion**
> - Given any successful path-handling call, when the agent compares the resulting path with the input, then the file type is unchanged unless the agent explicitly asked for a different one.
>
> ## Out of scope
> - New tools for editing canvas or base contents.
> - Plugin-defined file types beyond Obsidian's core types.
> - Rendering or previewing attachments.
> - Heading-, block- and property-level tools, which are Markdown-only by design.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`

**Sent to the step:**

> /speckit-specify Prevent filetype changes
>
> ## Feature
> Every tool that takes a vault file path either handles Obsidian's native file types (notes, canvases, bases, attachments) correctly or rejects a type it does not support with a clear error; no tool silently changes a file's type.
>
> ## Why
> Renaming a canvas currently succeeds and turns it into a Markdown note, with no error, so the agent believes it renamed the canvas. Several tools quietly assume every vault file is a Markdown note, and the agent cannot tell which ones from the tool surface.
>
> ## User stories
> - As an agent, I want renaming or moving a non-Markdown file to keep its file type, so that a canvas stays a canvas.
> - As an agent, I want a tool that supports notes only to reject other file types with a clear error, so that I know to use another route.
> - As an agent, I want each tool's description to state which file types it supports, so that I pick the right tool first time.
> - As a vault owner, I want no tool to change a file's type unless asked, so that my canvases, bases and attachments are never silently converted.
>
> ## Acceptance criteria
>
> **Story: file type preserved**
> - Given a canvas, base or attachment, when an agent renames or moves it with a tool that supports that type, then the file keeps its original extension.
>
> **Story: unsupported types rejected**
> - Given a tool that supports notes only, when an agent passes a canvas, base or attachment path, then the call fails with a clear unsupported-file-type error and nothing in the vault changes.
> - Given a rename whose result would carry a different extension from the source, when the agent calls it, then the call does not silently produce a different file type.
>
> **Story: documented support**
> - Given any tool that takes a vault file path, when an agent reads its description, then the supported file types are named.
>
> **Story: no silent conversion**
> - Given any successful path-handling call, when the agent compares the resulting path with the input, then the file type is unchanged unless the agent explicitly asked for a different one.
>
> ## Out of scope
> - New tools for editing canvas or base contents.
> - Plugin-defined file types beyond Obsidian's core types.
> - Rendering or previewing attachments.
> - Heading-, block- and property-level tools, which are Markdown-only by design.

## 3. pre-implementation / specify (2026-10-31T05:08:09.755Z)

**Question (verbatim):**

> ## Question 1: Explicit extension change on rename or move
>
> **Context**: User Story 2, scenario 2 (and FR-006): "Given a rename or move whose destination would carry a different extension from the source, When the agent calls it, Then the call does not silently produce a different file type." The input also says "the file type is unchanged unless the agent explicitly asked for a different one". The silent case (a destination with no extension) is settled: the file keeps the source's extension. Still open: what happens when the agent explicitly types a different core-type extension, for example renaming `Plan.canvas` to `Plan.md`, or moving `Plan.canvas` to `Archive/Plan.md`.
>
> **What we need to know**: When the destination explicitly names a recognised file type extension that differs from the source's, should the call be rejected, honoured, or honoured only by `move`?
>
> **Suggested Answers**:
>
> | Option | Answer | Implications |
> |--------|--------|--------------|
> | A (recommended) | Reject on both rename and move with the unsupported-file-type error; obsidian_exec remains the explicit route | Strictest and simplest. A changed extension never fixes the content: a canvas renamed to .md is still canvas data in a broken note. It also catches agents that wrongly assume every file is a note. Only drawback: no typed tool can change a type on purpose. |
> | B | Honour it on both rename and move: an explicit extension counts as the agent asking, and the result path shows the new extension | Matches the input's "unless explicitly asked" wording literally. But an agent that types `Plan.md` out of habit still silently corrupts a canvas, which is the failure this feature exists to stop. |
> | C | Reject on rename, honour on move | Rename stays a pure same-type name change; move's full destination path counts as an explicit request. Two tools follow different rules, which the descriptions must explain. |
> | Custom | Provide your own answer | Describe the rule, for example which tools honour it and whether the result must flag the type change. |
>
> **Your choice**: _[Wait for user response]_

**Advisor** (escalate: none):

> 1. A
>
> A typed rename or move rejects an explicit change to another extension, so the type never changes without a clear signal. That satisfies the "no silent conversion" story, and "unless explicitly asked" is still served through `obsidian_exec`, which is already the documented route for non-`.md` renames. Per BI-0060 Impact (silent mutation is the worst failure mode) and its Cleanup constraint ("the schema must reject unsupported types or the handler must preserve them"; no middle ground).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Sent to the step:**

> 1. A
>
> A typed rename or move rejects an explicit change to another extension, so the type never changes without a clear signal. That satisfies the "no silent conversion" story, and "unless explicitly asked" is still served through `obsidian_exec`, which is already the documented route for non-`.md` renames. Per BI-0060 Impact (silent mutation is the worst failure mode) and its Cleanup constraint ("the schema must reject unsupported types or the handler must preserve them"; no middle ground).

## 4. pre-implementation / clarify (2026-10-31T05:10:02.037Z)

**Question (verbatim):**

> **Question 1: Which error envelope carries the unsupported-file-type rejection?**
>
> **Context**: FR-007 says a tool rejects an unsupported type "returning a tool error with a stable unsupported-file-type error code". Taken literally, that reads as a new top-level `UpstreamError.code`. Constitution Principle IV and ADR-015 keep a zero-new-top-level-codes practice and model finer states as `details.code` / `details.reason` under an existing code. The graph shows `UpstreamError` as the error-spine value type that almost every handler imports (among the top god-nodes); it is a pure value type, so the choice spreads to every tool this feature touches. Three precedents already exist in the code: `links` and `backlinks` emit `CLI_REPORTED_ERROR` with `details.code: "NOT_MARKDOWN"`; `open_file` emits `CLI_REPORTED_ERROR` with `details.code: "UNSUPPORTED_FILE_TYPE"` when Obsidian has no view for an extension; `find_and_replace` (ADR-032) models an ineligible target under `VALIDATION_ERROR` with `details.code`.
>
> **Recommended:** Option A. The rejection happens in the server before Obsidian is called, so it is an input-validation failure, not a CLI report. It keeps the zero-new-codes streak, matches the ADR-032 precedent, and reuses the `UNSUPPORTED_FILE_TYPE` name agents already see from `open_file`. Existing emissions stay unchanged, so no client breaks (ADR-015 is additive-only).
>
> | Option | Description |
> |--------|-------------|
> | A | `VALIDATION_ERROR` with `details.code: "UNSUPPORTED_FILE_TYPE"`, and `details` carrying the received extension and the accepted types. Existing `NOT_MARKDOWN` (links, backlinks) and `open_file`'s CLI-reported `UNSUPPORTED_FILE_TYPE` stay as they are. |
> | B | Same as A, but also move `links` and `backlinks` from `NOT_MARKDOWN` to the new shape, so one name covers every notes-only rejection. This is a breaking change for any client that matches `NOT_MARKDOWN`. |
> | C | `CLI_REPORTED_ERROR` with `details.code: "UNSUPPORTED_FILE_TYPE"`, matching `open_file` exactly, even though the CLI never runs for these rejections. |
> | D | A new top-level `UpstreamError.code` `UNSUPPORTED_FILE_TYPE`. This breaks the Principle IV zero-new-codes practice and needs a Complexity Tracking entry plus a new ADR. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 1. A
>
> The rejection happens at the boundary, before Obsidian is called, so it belongs under `VALIDATION_ERROR` with a `details.code` discriminator. ADR-032 already models `find_and_replace`'s ineligible-target state this way, and it keeps the zero-new-top-level-codes streak (Constitution IV, ADR-014, ADR-015). Leave the existing `NOT_MARKDOWN` emissions alone: ADR-015 allows only additive changes, and renaming them would be a breaking contract change outside this BI's cleanup.

Sources: `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`

**Sent to the step:**

> 1. A
>
> The rejection happens at the boundary, before Obsidian is called, so it belongs under `VALIDATION_ERROR` with a `details.code` discriminator. ADR-032 already models `find_and_replace`'s ineligible-target state this way, and it keeps the zero-new-top-level-codes streak (Constitution IV, ADR-014, ADR-015). Leave the existing `NOT_MARKDOWN` emissions alone: ADR-015 allows only additive changes, and renaming them would be a breaking contract change outside this BI's cleanup.

## 5. pre-implementation / clarify (2026-10-31T05:10:49.855Z)

**Question (verbatim):**

> **Question 2: Which file types does `read` accept?**
>
> **Context**: The spec's Assumptions leave the per-tool support set to planning beyond rename, move, delete and open-file, and expect content-editing tools to stay notes-only. `read` is different: it changes nothing, and today it passes any path straight to Obsidian's `read` with no type check. A canvas (JSON) or a base (YAML) comes back as usable text. An attachment (image, audio, video, PDF) comes back as binary bytes decoded as UTF-8, which is garbage the agent cannot detect. Its description says only "Read a note". The answer sets `read`'s declared support, its description, and its test matrix (SC-002, SC-003).
>
> **Recommended:** Option A. Canvases and bases are plain-text Obsidian formats that agents need to inspect before deciding on an edit route, and reading them changes nothing. Attachments return corrupted text, so a clear UNSUPPORTED_FILE_TYPE rejection is better than silent garbage.
>
> | Option | Description |
> |--------|-------------|
> | A | Notes, canvases and bases (all text) are supported; attachments are rejected with UNSUPPORTED_FILE_TYPE. |
> | B | Notes only; canvases, bases and attachments are rejected. Simplest and consistent with the rest of the content cohort, but it removes a read path for canvas and base content that works today. |
> | C | Every core type is supported, attachments included, and documented as returning raw decoded text. No rejection, but the agent still gets unusable output for binary files. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 2. A
>
> Under BI-0060's Cleanup constraint, each tool either handles a file type properly or rejects it with a structured error. There is no documented-assumption middle ground, which rules out C, the "raw decoded text" option. Canvases and bases are text, and `read` already handles them correctly, so it should declare them supported. Binary attachments come back as text that is silently corrupted, so reject them. That is a per-tool choice, so record it in the spec's Clarifications log and not in an ADR.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Sent to the step:**

> 2. A
>
> Under BI-0060's Cleanup constraint, each tool either handles a file type properly or rejects it with a structured error. There is no documented-assumption middle ground, which rules out C, the "raw decoded text" option. Canvases and bases are text, and `read` already handles them correctly, so it should declare them supported. Binary attachments come back as text that is silently corrupted, so reject them. That is a per-tool choice, so record it in the spec's Clarifications log and not in an ADR.

## 6. pre-implementation / analyze (2026-10-31T05:24:44.352Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 4 issues?
>
> Top issues:
> - I1 (HIGH): FR-007a exempts only links, backlinks and open_file, but the plan also keeps smart_connections_similar (NOT_MARKDOWN), find_and_replace (INVALID_NOTE/not-eligible) and the Bases trio (INVALID_BASE_PATH). As written, SC-003 cannot pass for four notes-only tools. Proposed fix: extend FR-007a with those tools and reword SC-003 and the US2 Independent Test.
> - I2 (HIGH): resolving file/active targets and then forwarding path= changes the CLI arguments and spawn count for Markdown calls in read, rename, move and outline. About 18 existing `file=` and active-mode argument assertions, plus outline's single-spawn test, would change, which contradicts SC-005 and T032. Options: (a) keep path forwarding, define SC-005 at the outcome level and list the Markdown tests that change on purpose; or (b) in file mode, forward the original `file=` after the pre-check and keep path forwarding only for active mode. Recommended: (b), because file-mode arguments stay unchanged and only the extra resolution call is new.
> - I3 (MEDIUM): the spec's not-found edge case contradicts D9 (a missing `photo.png` passed to read by path reports UNSUPPORTED_FILE_TYPE). Proposed fix: narrow the edge case to name-based and active resolution.
> - C1 (MEDIUM): FR-003 has no behaviour test showing delete accepts canvas or attachment paths. Proposed fix: add a delete handler test task.

**Advisor** (escalate: none):

> Yes. Apply all four fixes; no need to send the edits back for review first.
>
> - **I1:** Extend FR-007a to cover `smart_connections_similar` (`NOT_MARKDOWN`), `find_and_replace` (`INVALID_NOTE`/`not-eligible`) and the Bases trio (`INVALID_BASE_PATH`). Reword SC-003 and the US2 Independent Test to match. Existing rejections stay as they are, because ADR-015 allows only additive changes and the Q1 answer said the same. `VALIDATION_ERROR` + `UNSUPPORTED_FILE_TYPE` is for new rejections only.
> - **I2:** Option (b). In file mode, forward the original `file=` after the pre-check, and forward the resolved path only in active mode. Markdown calls keep the same arguments, so SC-005 holds as written. The extra resolution call is the only new behaviour; test it on its own.
> - **I3:** Narrow the edge case to name-based and active resolution. A path-based type check runs at the boundary before any vault access (Constitution III), so a missing `photo.png` passed to `read` correctly gets `UNSUPPORTED_FILE_TYPE`.
> - **C1:** Add a delete handler test showing that canvas and attachment paths are accepted. Constitution II requires a happy-path test and a failure-or-boundary test for every surface that is modified.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes.md`

**Sent to the step:**

> Yes. Apply all four fixes; no need to send the edits back for review first.
>
> - **I1:** Extend FR-007a to cover `smart_connections_similar` (`NOT_MARKDOWN`), `find_and_replace` (`INVALID_NOTE`/`not-eligible`) and the Bases trio (`INVALID_BASE_PATH`). Reword SC-003 and the US2 Independent Test to match. Existing rejections stay as they are, because ADR-015 allows only additive changes and the Q1 answer said the same. `VALIDATION_ERROR` + `UNSUPPORTED_FILE_TYPE` is for new rejections only.
> - **I2:** Option (b). In file mode, forward the original `file=` after the pre-check, and forward the resolved path only in active mode. Markdown calls keep the same arguments, so SC-005 holds as written. The extra resolution call is the only new behaviour; test it on its own.
> - **I3:** Narrow the edge case to name-based and active resolution. A path-based type check runs at the boundary before any vault access (Constitution III), so a missing `photo.png` passed to `read` correctly gets `UNSUPPORTED_FILE_TYPE`.
> - **C1:** Add a delete handler test showing that canvas and attachment paths are accepted. Constitution II requires a happy-path test and a failure-or-boundary test for every surface that is modified.
