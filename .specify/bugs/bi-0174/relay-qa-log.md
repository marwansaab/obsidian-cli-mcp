# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0174-2026-11-04`, started 2026-11-04T04:48:13.335Z.

## 1. checks / preflight (2026-11-04T04:48:13.383Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0174. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0174 in the vault.
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

**Advisor** (escalate: scope: BI-0174's `variant` is `cleanup-no-false-advertisement`, not `bug-fix`, and it has only a /speckit-specify prompt. Whether to run it through the bug-fix flow or send it through the full spec-kit workflow is the owner's call.):

> Preflight for BI-0174: one check failed (variant).
>
> - **Vault identity:** pass. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id`. Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault. The Obsidian CLI MCP per-MCP Tool Notes are also loaded.
> - **Note:** found at `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`.
> - **Title:** BI-0174 — Reconcile Help And Description Drift After 0.9.0 Validation.
> - **Initiative:** pass. `initiative` is `[[Obsidian CLI MCP]]`.
> - **Status:** pass. `status` is `planned`, so the work is not finished.
> - **Variant:** FAIL. `variant` is `cleanup-no-false-advertisement`, not `bug-fix`. The `tier` is `must-fix-bug`.
> - **Prompt section:** pass. There is no "/speckit-bug-assess prompt" section, but there is a "/speckit-specify prompt" section ("Align help pages") that describes the expected behaviour. The note was not changed.
> - **Clarify skill:** loaded as `anthropic-skills:speckit-clarify-skill`, reference "BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation". Primed with the BI, Constitution v1.5.1 and Architecture. ADRs come up through the BI and Architecture; the Decision Log index was also read.
>
> Recommendation if the owner allows it: run it as a bug fix. The tier is `must-fix-bug`. The harm is false advertisement: published help and descriptions that disagree with how the server behaves. Its out-of-scope section rules out behaviour changes, except where an error has to change so that it agrees with its documentation.
>
> Watch-outs for this run:
> - The scope is wide: 13 items across about 35 help pages.
> - Item 7 (`patch_heading` `EMPTY_CONTENT`) lets the fix either change the doc or change the error mapping. Picking the second changes behaviour.
> - Items marked *unverified* must be reproduced before they are changed.
> - Items 5, 8, 9 and 10 follow the outcomes of BI-0175, BI-0176, BI-0180 and BI-0182.
> - An owner decision dated 2026-11-02 keeps TC-00586's heading rule strict. The help pages are renamed; the TC is not relaxed.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `220-Planning/Session Handover.md`

**Advisor, after the owner ruled** (escalate: none):

> Preflight for BI-0174: ready. The owner ruled "Run it anyway" on the variant mismatch.
>
> - **Vault identity:** pass. `vault_id` = `my-setup`, which matches `expected_vault_id`. Session-start reads done.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`.
> - **Title:** BI-0174 — Reconcile Help And Description Drift After 0.9.0 Validation.
> - **Initiative:** pass. `[[Obsidian CLI MCP]]`.
> - **Status:** pass. `planned`.
> - **Variant:** `cleanup-no-false-advertisement`, not `bug-fix` (tier is `must-fix-bug`). The owner ruled to run it as a bug fix anyway.
> - **Prompt section:** pass. There is no "/speckit-bug-assess prompt" section; the "/speckit-specify prompt" section ("Align help pages") describes the expected behaviour. The note was not changed.
> - **Clarify skill:** loaded as `anthropic-skills:speckit-clarify-skill`, reference "BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation". Primed with the BI, Constitution v1.5.1 and Architecture.
>
> Points to watch during the fix:
> - **Item 7 (`patch_heading` `EMPTY_CONTENT`):** changing the error mapping instead of the doc is a behaviour change.
> - **Items marked unverified:** reproduce each one before changing it. Leave accurate ones as they are and note them in the spec.
> - **Items 5, 8, 9 and 10:** they follow the outcomes of BI-0175, BI-0176, BI-0180 and BI-0182.
> - **TC-00586:** stays strict (owner decision 2026-11-02). Rename the 24 help pages; do not relax the TC.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`

**Owner:** choice 1 (Run it anyway), via cli, 2026-11-04T04:58:03.058Z.

**Sent to the step:**

> Preflight for BI-0174: ready. The owner ruled "Run it anyway" on the variant mismatch.
>
> - **Vault identity:** pass. `vault_id` = `my-setup`, which matches `expected_vault_id`. Session-start reads done.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`.
> - **Title:** BI-0174 — Reconcile Help And Description Drift After 0.9.0 Validation.
> - **Initiative:** pass. `[[Obsidian CLI MCP]]`.
> - **Status:** pass. `planned`.
> - **Variant:** `cleanup-no-false-advertisement`, not `bug-fix` (tier is `must-fix-bug`). The owner ruled to run it as a bug fix anyway.
> - **Prompt section:** pass. There is no "/speckit-bug-assess prompt" section; the "/speckit-specify prompt" section ("Align help pages") describes the expected behaviour. The note was not changed.
> - **Clarify skill:** loaded as `anthropic-skills:speckit-clarify-skill`, reference "BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation". Primed with the BI, Constitution v1.5.1 and Architecture.
>
> Points to watch during the fix:
> - **Item 7 (`patch_heading` `EMPTY_CONTENT`):** changing the error mapping instead of the doc is a behaviour change.
> - **Items marked unverified:** reproduce each one before changing it. Leave accurate ones as they are and note them in the spec.
> - **Items 5, 8, 9 and 10:** they follow the outcomes of BI-0175, BI-0176, BI-0180 and BI-0182.
> - **TC-00586:** stays strict (owner decision 2026-11-02). Rename the 24 help pages; do not relax the TC.

## 2. assess / bug-assess (2026-11-04T04:58:29.996Z)

**Question (verbatim):**

> Return the bug report for job BI-0174 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0174`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0174
>
> ## Impact
> The `help` tool and the tool descriptions are the agent's only map of the server. After 0.9.0's fixes, they still disagree with live behaviour in the places below. Harms: (a) false advertisement on the published surface; (b) error-branching code written against the docs never fires; (c) recovery hints send agents to tools, commands or actions that do not work; (d) inconsistent page structure defeats agents and tests that navigate help by section. Same class as BI-0166, [[BI-0105 - Reconcile Cohort Wide Tool Doc And Classifier Drift]] and [[BI-0122 - Re-Audit Tool Surfaces After Description And Help Doc Remediation]].
>
> 1. **All help pages — heading structure (TC-00586).** Only 11 of 35 pages (`delete`, `files`, `find_by_property`, `help`, `move`, `obsidian_exec`, `read`, `read_heading`, `read_property`, `rename`, `set_property`) have H2 headings beginning `Input`, `Output`, `Errors` and `Examples`. The other 24 use variants ("Error roster", "Error states", "Failure modes", "Worked examples", "Input schema", "Output envelope", "Input contract", "Output and error contract"):
>     - missing `Errors` and `Examples`: `append_note`, `backlinks`, `bases`, `context_search`, `create_base`, `find_and_replace`, `links`, `outline`, `paths`, `patch_block`, `patch_heading`, `pattern_search`, `prepend`, `properties`, `query_base`, `search`, `smart_connections_query`, `smart_connections_similar`, `tag`, `vaults`, `views_base`;
>     - missing `Input` and `Errors`: `get_active_file`;
>     - missing `Output` and `Errors`: `open_file`;
>     - missing `Errors`: `write_note`.
> 2. **Server instructions.** "Unsupported file types fail with UNSUPPORTED_FILE_TYPE" is not true cohort-wide: `find_and_replace` rejects a canvas with `INVALID_NOTE` / `not-eligible` (TC-00691); `links`, `backlinks` and `smart_connections_similar` use `NOT_MARKDOWN`; the Base tools use `INVALID_BASE_PATH`.
> 3. **Vault-unavailable example (several tools).** The descriptions and help of `paths`, `pattern_search`, `tag`, `query_base`, `smart_connections_query`, `smart_connections_similar` and `views_base` give "CLI integration disabled" as the example cause, with a `Command "…" not found` output. TC-00495 observed `Command line interface is not enabled.` for that cause.
> 4. **Unknown-vault claims (several tools).**
>     - `prepend` help (Fields and Error states), `append_note` help and description, `patch_block` help and description, and `patch_heading` description say an unknown vault returns `VAULT_NOT_FOUND`; live returns `VALIDATION_ERROR` with `requestedVault` / `knownVaults`. *Unverified:* the `patch_block` and `patch_heading` input tables say `VALIDATION_ERROR` while their own error tables say `VAULT_NOT_FOUND`.
>     - `smart_connections_similar` description, the `smart_connections_query` precedence line and the `tag` description claim `VAULT_NOT_FOUND` with reason `unknown`; live returns a plain `CLI_REPORTED_ERROR` "Vault not found." with no code or reason. The `search` description claims `details.code: "VAULT_NOT_FOUND"` (*unverified*).
>     - `find_and_replace`'s `VAULT_NOT_FOUND` recovery hint tells the caller to run the CLI command `obsidian vaults`; it should point to the `vaults` tool.
> 5. **`context_search`.**
>     - Help Example 4 step 5 and "Zero-match handling" still say a missing-folder error "propagates verbatim — no wrapping"; live top-level message is `CLI bridge upstream error: CLI_REPORTED_ERROR`. BI-0166 FR-009 (docs-only fix) did not land. (TC-00597)
>     - Description shows the cut marker as `...`; live uses `…` (U+2026). Same in `pattern_search`.
>     - Description omits that match text keeps leading whitespace ([[BI-0170 - Stop Trimming Context Search Match Text]]) and omits `MATCH_LINE_UNAVAILABLE`.
>     - Help error roster lacks the Cowork `-32602` caveat that `search` documents.
>     - `search` and `context_search` claim ASCII-only case folding (`É` does not match `é`); spec 087 says `CAFÉ` matches `café` (*unverified*).
>     - "Literal substring" wording — correct once [[BI-0175 - Restore Partial Word Matching In Search]] lands; re-check after it.
> 6. **`outline`.** Help Example 4 ("File not found") shows the top-level `Error: File "Missing.md" not found.`; live is wrapped. (TC-00600)
> 7. **`patch_heading`.** Help shows an `EMPTY_CONTENT` append error with `details.code: "EMPTY_CONTENT"`, `reason` and `mode`; live returns the generic schema-validation envelope with `issues[0]` of kind `custom`. Either the doc or the error mapping changes. (TC-00600)
> 8. **`find_and_replace`.**
>     - Error roster quotes `INVALID_SUBFOLDER` / `not-found` messages without the `find_and_replace: ` prefix the server adds. (TC-00601)
>     - Description is 4,825 characters; Claude Code truncates tool descriptions at 4,096, so the tail is lost.
>     - Help says calls using old parameter names receive `deprecated_parameters`; errors never carry it. State whether it is success-only (the behaviour side is [[BI-0182 - Complete Parameter Rename In Error Details]]).
>     - Help and messages say `folder` while the error code and key are still `INVALID_SUBFOLDER` / `subfolder` — docs follow BI-0182's outcome.
> 9. **`write_note`.**
>     - Short description does not say `bytes_written` is the size change on overwrite (the help defines it).
>     - `file` description says "resolved like a wikilink", while the help documents root resolution — align with [[BI-0176 - Resolve File Locator On Write Note Overwrite]].
> 10. **Bases family (`bases`, `query_base`, `create_base`, `views_base`).**
>     - `query_base` description sibling list says `create_base (create a new one)` and its help maps "Create a new .base file" to `create_base`; `create_base` actually adds an item note to an existing Base.
>     - *Unverified:* the `bases` entry in the help index says the vault argument is "ignored" while the `bases` page says it is honoured; the `query_base` Output sample shows `priority` as a number although values are stringified.
>     - `create_base` help Output shows the faulty `name` / `path` composition — align with [[BI-0180 - Fix Create Base Response Path For Folder Filtered Bases]].
>     - `views_base` open mode with no active file returns `ERR_NO_ACTIVE_FILE` (the help is right; spec 083 FR-006's `Error: No active file.` text is wrong), but the message tells the caller to use `target_mode: "specific"` with `vault` / `file`, which `views_base` does not have.
>     - The `views_base` and `create_base` validation-error shapes differ, and `PATH_ESCAPES_VAULT` carries only a generic top-level message; the docs should state each as returned. *Unverified:* `views_base` and `query_base` document different `INVALID_BASE_PATH` shapes.
> 11. **`links`, `backlinks`, `smart_connections_similar`.**
>     - `links` help says `target` is "byte-faithful to source"; live decodes Markdown link targets (`Head%20One` → `Head One`). (TC-00670)
>     - The `NOT_MARKDOWN` rows tell the caller to "use `read`" for non-Markdown files (`smart_connections_similar`: "read the source bytes via read" for PDFs and attachments); `read` rejects attachments and PDFs with `UNSUPPORTED_FILE_TYPE` and points to `open_file` (TC-00682). Hints should say `read` for canvases and Bases, `open_file` for attachments.
>     - `smart_connections_similar` help Overview shows `find_connections({limit})`; the limit is no longer passed (always 100).
> 12. **`delete`.** Help says "Delete a single note" / "deletes the note currently focused"; the tool deletes any file type (TC-00692).
> 13. **`read` error wording.** The `UNSUPPORTED_FILE_TYPE` message ends "Nothing was changed.", which reads oddly for a read-only tool (observed: `read: Fixtures/BI-041/probe-has-slash is a file with no extension; read supports notes, canvases and bases. Nothing was changed.`). Drop the sentence for read-only tools.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follows on from [[BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift]]: BI-0166's index and stub defects are fixed, and its residual items join every other help or description mismatch found in the same run, grouped here by owner direction (one BI for all help and description findings). Observed against `@marwansaab/obsidian-cli-mcp@0.9.0-local` built from `main`. Empirical evidence: [[TC-00586 - Help Returns A Doc For Every Registered Tool And None For Removed Names]], [[TC-00597 - Context Search Help Describes Missing Folder Error As Returned]], [[TC-00600 - Help Failing Examples Are Labelled And Show The Returned Error]] and [[TC-00601 - Help Quoted Validation Messages Match Server Wording]] (all fail); [[TC-00670 - Links Markdown Link Text Reported As Written Including Empty]], [[TC-00682 - Read Attachment Rejected With Unsupported File Type And Open File Alternative]], [[TC-00691 - Find And Replace Single Note Scope On Canvas Keeps INVALID_NOTE Rejection]], [[TC-00692 - Delete Canvas Sends It To Trash]] and [[TC-00495 - Vault Unavailable Terminates Without Hang]] supply the live behaviour the docs contradict. Items marked *unverified* were read from the docs but not reproduced live; the fix confirms each before changing it.
>
> **Owner decision (2026-11-02):** TC-00586's strict heading rule stays as written. Every help page that lacks the standard H2 headings is renamed to use `Input`, `Output`, `Errors` and `Examples` (suffixes such as `Output (success)` allowed), rather than relaxing the TC.
>
> ## Expected behaviour
> /speckit-specify Align help pages
>
> ## Feature
> Every help page and tool description the server publishes follows one standard section layout and describes inputs, outputs, errors, examples and recovery advice exactly as the server behaves today.
>
> ## Why
> A full test pass of the latest release found many places where the published guidance disagrees with the server: examples show errors in a form the server no longer returns, error codes and messages are quoted wrongly, recovery advice points at tools that refuse the file, one description is too long to be shown in full, and most help pages use their own section names. Agents use this guidance as their only map of the server, so each mismatch costs failed calls, error handling that never fires, or advice that cannot be followed.
>
> ## User stories
> - As an agent, I want every help page to use the same section names for inputs, outputs, errors and examples, so that I can find the part I need on any page.
> - As an agent, I want every example error to look exactly like the error the server returns, so that I can branch on it reliably.
> - As an agent, I want quoted messages and error codes to match the server's wording, so that matching on them works.
> - As an agent, I want recovery advice to point at a tool or action that actually works for my situation, so that following it fixes the problem.
> - As an agent, I want each tool description to be shown to me in full, so that I do not miss the end of its contract.
> - As an agent, I want the server's general guidance on unsupported files and unknown vaults to be true for every tool it covers, so that I can rely on it without checking each tool.
>
> ## Acceptance criteria
>
> **Story: standard sections**
> - Given any tool's help page, when an agent lists its section headings, then there are sections beginning "Input", "Output", "Errors" and "Examples".
>
> **Story: examples match returned errors**
> - Given any help example that shows an error, when the same call is made against the server, then the returned error matches the example's code, message and detail fields.
> - Given a search help page describing a missing-folder error, when the error is returned, then its top-level message matches the page.
>
> **Story: quoted wording matches**
> - Given any message or code quoted in a description or help page, when the agent triggers that error, then the server's wording is identical, including any tool-name prefix.
>
> **Story: working recovery advice**
> - Given a recovery hint about a file the tool cannot handle, when the agent follows it, then the suggested tool accepts that kind of file.
> - Given a recovery hint about an unknown vault, when the agent follows it, then it names a tool the agent can call.
> - Given a missing-active-file error from a tool, when the agent reads its advice, then it mentions only inputs that tool accepts.
>
> **Story: descriptions shown in full**
> - Given any tool description, when it is shown to an agent by a client that limits description length to 4,096 characters, then nothing is cut off.
>
> **Story: true general guidance**
> - Given the server's general guidance on unsupported file types and unknown vaults, when an agent triggers either case on any covered tool, then the returned error matches the guidance or the guidance names the per-tool exception.
>
> ## Out of scope
> - Changing tool behaviour, except where an error must change so that it and its documentation agree.
> - Behaviour defects tracked separately: partial-word search, overwrite by name, a file blocking a move destination, a missing named note in find-and-replace, stale parser messages for Bases, the created-item path for Bases, tag hash prefixes, and retired input names in errors.
> - Relaxing the help-page test's heading rule.
> - Rewriting help pages for style or length beyond what these fixes need.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0174
>
> ## Impact
> The `help` tool and the tool descriptions are the agent's only map of the server. After 0.9.0's fixes, they still disagree with live behaviour in the places below. Harms: (a) false advertisement on the published surface; (b) error-branching code written against the docs never fires; (c) recovery hints send agents to tools, commands or actions that do not work; (d) inconsistent page structure defeats agents and tests that navigate help by section. Same class as BI-0166, [[BI-0105 - Reconcile Cohort Wide Tool Doc And Classifier Drift]] and [[BI-0122 - Re-Audit Tool Surfaces After Description And Help Doc Remediation]].
>
> 1. **All help pages — heading structure (TC-00586).** Only 11 of 35 pages (`delete`, `files`, `find_by_property`, `help`, `move`, `obsidian_exec`, `read`, `read_heading`, `read_property`, `rename`, `set_property`) have H2 headings beginning `Input`, `Output`, `Errors` and `Examples`. The other 24 use variants ("Error roster", "Error states", "Failure modes", "Worked examples", "Input schema", "Output envelope", "Input contract", "Output and error contract"):
>     - missing `Errors` and `Examples`: `append_note`, `backlinks`, `bases`, `context_search`, `create_base`, `find_and_replace`, `links`, `outline`, `paths`, `patch_block`, `patch_heading`, `pattern_search`, `prepend`, `properties`, `query_base`, `search`, `smart_connections_query`, `smart_connections_similar`, `tag`, `vaults`, `views_base`;
>     - missing `Input` and `Errors`: `get_active_file`;
>     - missing `Output` and `Errors`: `open_file`;
>     - missing `Errors`: `write_note`.
> 2. **Server instructions.** "Unsupported file types fail with UNSUPPORTED_FILE_TYPE" is not true cohort-wide: `find_and_replace` rejects a canvas with `INVALID_NOTE` / `not-eligible` (TC-00691); `links`, `backlinks` and `smart_connections_similar` use `NOT_MARKDOWN`; the Base tools use `INVALID_BASE_PATH`.
> 3. **Vault-unavailable example (several tools).** The descriptions and help of `paths`, `pattern_search`, `tag`, `query_base`, `smart_connections_query`, `smart_connections_similar` and `views_base` give "CLI integration disabled" as the example cause, with a `Command "…" not found` output. TC-00495 observed `Command line interface is not enabled.` for that cause.
> 4. **Unknown-vault claims (several tools).**
>     - `prepend` help (Fields and Error states), `append_note` help and description, `patch_block` help and description, and `patch_heading` description say an unknown vault returns `VAULT_NOT_FOUND`; live returns `VALIDATION_ERROR` with `requestedVault` / `knownVaults`. *Unverified:* the `patch_block` and `patch_heading` input tables say `VALIDATION_ERROR` while their own error tables say `VAULT_NOT_FOUND`.
>     - `smart_connections_similar` description, the `smart_connections_query` precedence line and the `tag` description claim `VAULT_NOT_FOUND` with reason `unknown`; live returns a plain `CLI_REPORTED_ERROR` "Vault not found." with no code or reason. The `search` description claims `details.code: "VAULT_NOT_FOUND"` (*unverified*).
>     - `find_and_replace`'s `VAULT_NOT_FOUND` recovery hint tells the caller to run the CLI command `obsidian vaults`; it should point to the `vaults` tool.
> 5. **`context_search`.**
>     - Help Example 4 step 5 and "Zero-match handling" still say a missing-folder error "propagates verbatim — no wrapping"; live top-level message is `CLI bridge upstream error: CLI_REPORTED_ERROR`. BI-0166 FR-009 (docs-only fix) did not land. (TC-00597)
>     - Description shows the cut marker as `...`; live uses `…` (U+2026). Same in `pattern_search`.
>     - Description omits that match text keeps leading whitespace ([[BI-0170 - Stop Trimming Context Search Match Text]]) and omits `MATCH_LINE_UNAVAILABLE`.
>     - Help error roster lacks the Cowork `-32602` caveat that `search` documents.
>     - `search` and `context_search` claim ASCII-only case folding (`É` does not match `é`); spec 087 says `CAFÉ` matches `café` (*unverified*).
>     - "Literal substring" wording — correct once [[BI-0175 - Restore Partial Word Matching In Search]] lands; re-check after it.
> 6. **`outline`.** Help Example 4 ("File not found") shows the top-level `Error: File "Missing.md" not found.`; live is wrapped. (TC-00600)
> 7. **`patch_heading`.** Help shows an `EMPTY_CONTENT` append error with `details.code: "EMPTY_CONTENT"`, `reason` and `mode`; live returns the generic schema-validation envelope with `issues[0]` of kind `custom`. Either the doc or the error mapping changes. (TC-00600)
> 8. **`find_and_replace`.**
>     - Error roster quotes `INVALID_SUBFOLDER` / `not-found` messages without the `find_and_replace: ` prefix the server adds. (TC-00601)
>     - Description is 4,825 characters; Claude Code truncates tool descriptions at 4,096, so the tail is lost.
>     - Help says calls using old parameter names receive `deprecated_parameters`; errors never carry it. State whether it is success-only (the behaviour side is [[BI-0182 - Complete Parameter Rename In Error Details]]).
>     - Help and messages say `folder` while the error code and key are still `INVALID_SUBFOLDER` / `subfolder` — docs follow BI-0182's outcome.
> 9. **`write_note`.**
>     - Short description does not say `bytes_written` is the size change on overwrite (the help defines it).
>     - `file` description says "resolved like a wikilink", while the help documents root resolution — align with [[BI-0176 - Resolve File Locator On Write Note Overwrite]].
> 10. **Bases family (`bases`, `query_base`, `create_base`, `views_base`).**
>     - `query_base` description sibling list says `create_base (create a new one)` and its help maps "Create a new .base file" to `create_base`; `create_base` actually adds an item note to an existing Base.
>     - *Unverified:* the `bases` entry in the help index says the vault argument is "ignored" while the `bases` page says it is honoured; the `query_base` Output sample shows `priority` as a number although values are stringified.
>     - `create_base` help Output shows the faulty `name` / `path` composition — align with [[BI-0180 - Fix Create Base Response Path For Folder Filtered Bases]].
>     - `views_base` open mode with no active file returns `ERR_NO_ACTIVE_FILE` (the help is right; spec 083 FR-006's `Error: No active file.` text is wrong), but the message tells the caller to use `target_mode: "specific"` with `vault` / `file`, which `views_base` does not have.
>     - The `views_base` and `create_base` validation-error shapes differ, and `PATH_ESCAPES_VAULT` carries only a generic top-level message; the docs should state each as returned. *Unverified:* `views_base` and `query_base` document different `INVALID_BASE_PATH` shapes.
> 11. **`links`, `backlinks`, `smart_connections_similar`.**
>     - `links` help says `target` is "byte-faithful to source"; live decodes Markdown link targets (`Head%20One` → `Head One`). (TC-00670)
>     - The `NOT_MARKDOWN` rows tell the caller to "use `read`" for non-Markdown files (`smart_connections_similar`: "read the source bytes via read" for PDFs and attachments); `read` rejects attachments and PDFs with `UNSUPPORTED_FILE_TYPE` and points to `open_file` (TC-00682). Hints should say `read` for canvases and Bases, `open_file` for attachments.
>     - `smart_connections_similar` help Overview shows `find_connections({limit})`; the limit is no longer passed (always 100).
> 12. **`delete`.** Help says "Delete a single note" / "deletes the note currently focused"; the tool deletes any file type (TC-00692).
> 13. **`read` error wording.** The `UNSUPPORTED_FILE_TYPE` message ends "Nothing was changed.", which reads oddly for a read-only tool (observed: `read: Fixtures/BI-041/probe-has-slash is a file with no extension; read supports notes, canvases and bases. Nothing was changed.`). Drop the sentence for read-only tools.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follows on from [[BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift]]: BI-0166's index and stub defects are fixed, and its residual items join every other help or description mismatch found in the same run, grouped here by owner direction (one BI for all help and description findings). Observed against `@marwansaab/obsidian-cli-mcp@0.9.0-local` built from `main`. Empirical evidence: [[TC-00586 - Help Returns A Doc For Every Registered Tool And None For Removed Names]], [[TC-00597 - Context Search Help Describes Missing Folder Error As Returned]], [[TC-00600 - Help Failing Examples Are Labelled And Show The Returned Error]] and [[TC-00601 - Help Quoted Validation Messages Match Server Wording]] (all fail); [[TC-00670 - Links Markdown Link Text Reported As Written Including Empty]], [[TC-00682 - Read Attachment Rejected With Unsupported File Type And Open File Alternative]], [[TC-00691 - Find And Replace Single Note Scope On Canvas Keeps INVALID_NOTE Rejection]], [[TC-00692 - Delete Canvas Sends It To Trash]] and [[TC-00495 - Vault Unavailable Terminates Without Hang]] supply the live behaviour the docs contradict. Items marked *unverified* were read from the docs but not reproduced live; the fix confirms each before changing it.
>
> **Owner decision (2026-11-02):** TC-00586's strict heading rule stays as written. Every help page that lacks the standard H2 headings is renamed to use `Input`, `Output`, `Errors` and `Examples` (suffixes such as `Output (success)` allowed), rather than relaxing the TC.
>
> ## Expected behaviour
> /speckit-specify Align help pages
>
> ## Feature
> Every help page and tool description the server publishes follows one standard section layout and describes inputs, outputs, errors, examples and recovery advice exactly as the server behaves today.
>
> ## Why
> A full test pass of the latest release found many places where the published guidance disagrees with the server: examples show errors in a form the server no longer returns, error codes and messages are quoted wrongly, recovery advice points at tools that refuse the file, one description is too long to be shown in full, and most help pages use their own section names. Agents use this guidance as their only map of the server, so each mismatch costs failed calls, error handling that never fires, or advice that cannot be followed.
>
> ## User stories
> - As an agent, I want every help page to use the same section names for inputs, outputs, errors and examples, so that I can find the part I need on any page.
> - As an agent, I want every example error to look exactly like the error the server returns, so that I can branch on it reliably.
> - As an agent, I want quoted messages and error codes to match the server's wording, so that matching on them works.
> - As an agent, I want recovery advice to point at a tool or action that actually works for my situation, so that following it fixes the problem.
> - As an agent, I want each tool description to be shown to me in full, so that I do not miss the end of its contract.
> - As an agent, I want the server's general guidance on unsupported files and unknown vaults to be true for every tool it covers, so that I can rely on it without checking each tool.
>
> ## Acceptance criteria
>
> **Story: standard sections**
> - Given any tool's help page, when an agent lists its section headings, then there are sections beginning "Input", "Output", "Errors" and "Examples".
>
> **Story: examples match returned errors**
> - Given any help example that shows an error, when the same call is made against the server, then the returned error matches the example's code, message and detail fields.
> - Given a search help page describing a missing-folder error, when the error is returned, then its top-level message matches the page.
>
> **Story: quoted wording matches**
> - Given any message or code quoted in a description or help page, when the agent triggers that error, then the server's wording is identical, including any tool-name prefix.
>
> **Story: working recovery advice**
> - Given a recovery hint about a file the tool cannot handle, when the agent follows it, then the suggested tool accepts that kind of file.
> - Given a recovery hint about an unknown vault, when the agent follows it, then it names a tool the agent can call.
> - Given a missing-active-file error from a tool, when the agent reads its advice, then it mentions only inputs that tool accepts.
>
> **Story: descriptions shown in full**
> - Given any tool description, when it is shown to an agent by a client that limits description length to 4,096 characters, then nothing is cut off.
>
> **Story: true general guidance**
> - Given the server's general guidance on unsupported file types and unknown vaults, when an agent triggers either case on any covered tool, then the returned error matches the guidance or the guidance names the per-tool exception.
>
> ## Out of scope
> - Changing tool behaviour, except where an error must change so that it and its documentation agree.
> - Behaviour defects tracked separately: partial-word search, overwrite by name, a file blocking a move destination, a missing named note in find-and-replace, stale parser messages for Bases, the created-item path for Bases, tag hash prefixes, and retired input names in errors.
> - Relaxing the help-page test's heading rule.
> - Rewriting help pages for style or length beyond what these fixes need.

## 3. assess / bug-assess (2026-11-04T05:08:14.146Z)

**Question (verbatim):**

> **Q1 — Schema-layer sub-codes (item 7 and its new instances): change the docs, or lift the sub-code into `details`?**
>
> Context: `registerTool`'s generic envelope (`src/tools/_register.ts:187-192`, `validationIssues` at `:65-69`) keeps only each issue's `path`, `message` and `code`, and drops the `params` that refinements attach. Only `create_base` (`mapZodIssuesToToolError`, `create_base/index.ts:42`), `find_and_replace` and `prepend` (size limit only) supply a `mapValidationError` hook. So `patch_heading` (`EMPTY_CONTENT`, five `INVALID_HEADING_PATH` reasons, `schema.ts:23-121`), `patch_block` (`INVALID_BLOCK_ID`), `query_base` (`INVALID_BASE_PATH`, `INVALID_VIEW_NAME`) and `views_base` (`INVALID_BASE_PATH`) return `details.issues[0]` with `code: "custom"`, and `append_note` / `prepend` return a plain `too_small` for empty content. Their docs (except `views_base`) promise `details.code` / `details.reason`. ADR-015 (Decided) puts sub-discriminators in `details.reason`. `patch_heading` and `patch_block` messages carry no code prefix; the `_base-path.ts` messages do (`INVALID_BASE_PATH/empty: …`).
>
> | Option | Description |
> |--------|-------------|
> | A | Docs only. Rewrite every affected page and description to show the generic envelope (`details.issues[0]` with `path`, `code: "custom"` or `too_small`, `message`), as `views_base.md` does today. No behaviour change. Agents can tell `patch_heading` / `patch_block` reasons apart only by message text. |
> | B (recommended) | Lift. One shared `mapValidationError` helper (modelled on `create_base`'s) copies a refinement's `params` into `details.code` / `details.reason` (plus `field` etc.), keeps the message, and keeps `details.issues`. `patch_heading`, `patch_block`, `query_base` and `views_base` use it; `append_note` and `prepend` map empty content to `CONTENT_EMPTY`. The existing docs become true; only `views_base.md` is rewritten. Error-only behaviour change, no new codes. |
> | C | Lift for `patch_heading`, `patch_block`, `query_base`, `append_note` and `prepend` only, and leave `views_base` on the generic envelope as documented by BI-0179. Fewer edits, but `query_base` and `views_base` then report the same `INVALID_BASE_PATH` mistake in two shapes, the inconsistency the report flags in item 10. |
>
> Recommended: **B**. It keeps the machine-readable contract the docs, the schemas and ADR-015 already describe, instead of documenting it away. It reuses the hook seam and the `create_base` pattern already in the code, so no boot-spine change is needed. It also gives the whole Bases family one validation shape, which closes the item-10 inconsistency instead of documenting it.

**Advisor** (escalate: none):

> Q1. C
>
> Lift the sub-code into `details` (keep the message and `details.issues`) only where the docs already promise it: `patch_heading`, `patch_block`, `query_base`, and `append_note` / `prepend` (empty content → `CONTENT_EMPTY`). Leave `views_base` on the generic envelope and fix only its docs.
>
> Why:
> - BI-0174 item 7 lets either the doc or the error mapping change.
> - BI-0166 FR-008 already lifted these codes for `create_base`, and ADR-015 says sub-states go in `details.reason`, so lifting is the established pattern.
> - BI-0174 rules out behaviour changes except where an error must change to match its documentation. `views_base`'s live error already matches its help, so changing it is out of scope.
> - Item 10 asks the Bases docs to "state each [shape] as returned". Showing `query_base` and `views_base` in two shapes, each as returned, is what the BI asks for.
>
> Write only new tests. If an existing test checks the generic envelope for one of the lifted tools, editing it needs the owner's approval; don't change it without that.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0166 - Reconcile 0.9.0 Help Doc And Description Drift.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`: Added a *Clarified 2026-11-04 (Relay Q1)* note to Impact item 7: the error mapping changes and lifts details.code/reason for patch_heading, patch_block, query_base and append_note/prepend (CONTENT_EMPTY); views_base keeps the generic envelope and its docs are fixed instead.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`: Frontmatter updated: 2026-11-02 → 2026-11-04.

**Sent to the step:**

> Q1. C
>
> Lift the sub-code into `details` (keep the message and `details.issues`) only where the docs already promise it: `patch_heading`, `patch_block`, `query_base`, and `append_note` / `prepend` (empty content → `CONTENT_EMPTY`). Leave `views_base` on the generic envelope and fix only its docs.
>
> Why:
> - BI-0174 item 7 lets either the doc or the error mapping change.
> - BI-0166 FR-008 already lifted these codes for `create_base`, and ADR-015 says sub-states go in `details.reason`, so lifting is the established pattern.
> - BI-0174 rules out behaviour changes except where an error must change to match its documentation. `views_base`'s live error already matches its help, so changing it is out of scope.
> - Item 10 asks the Bases docs to "state each [shape] as returned". Showing `query_base` and `views_base` in two shapes, each as returned, is what the BI asks for.
>
> Write only new tests. If an existing test checks the generic envelope for one of the lifted tools, editing it needs the owner's approval; don't change it without that.

## 4. repair / bug-fix (2026-11-04T05:29:26.761Z)

**Question (verbatim):**

> **Q2 — `obsidian_exec` no-active-file advice (BI-0174 item 10e): may an existing test be edited?**
>
> Context: When no file is open, `obsidian_exec` passes the dispatch layer's `ERR_NO_ACTIVE_FILE` message through unchanged: `No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.` `obsidian_exec` has no `target_mode` or `file` input, so the advice breaks the BI's acceptance criterion "a missing-active-file error … mentions only inputs that tool accepts". The assessment planned a tool-local rethrow, as was just done for `views_base`. But the existing test `src/tools/obsidian_exec/handler.test.ts:144-146` pins that exact message for `obsidian_exec`, so the change would fail it. Your rule for this fix is to write only new tests and ask before editing an existing one. `docs/tools/obsidian_exec.md:92` already gives the right recovery: an explicit `vault` and an in-band `file=` / `path=` parameter.
>
> | Option | Description |
> |--------|-------------|
> | A (recommended) | Approve editing exactly one assertion, `obsidian_exec/handler.test.ts:144-146`, to the new message. `executeObsidianExec` rethrows `ERR_NO_ACTIVE_FILE` with the same code and details and the message `No active file in Obsidian. Open a note in Obsidian, or name the file in the command's own parameters (file= or path=) with vault.` A new test pins it. The dispatch message and its other tests (`_dispatch.test.ts`, `cli-adapter.test.ts`, `move/handler.test.ts`) stay unchanged. |
> | B | Leave `obsidian_exec`'s message as it is and record the gap as a follow-up BI. No test is edited, but the acceptance criterion stays unmet for `obsidian_exec`. |
>
> Recommended: **A**. It is a one-assertion edit in the tool the change targets. It meets the BI's criterion that advice names only the tool's own inputs, matches the `views_base` fix, and changes only the error message, which the BI allows ("except where an error must change so that it and its documentation agree").

**Advisor** (escalate: decision: Editing an existing test needs your approval for this job (BI-0178 is the precedent). The developer asks to change one assertion in obsidian_exec/handler.test.ts:144-146 so the no-active-file advice names only that tool's own inputs.):

> Q2. A, pending the owner's approval.
>
> Recommendation: edit exactly one assertion, `obsidian_exec/handler.test.ts:144-146`, to the new message. Rethrow `ERR_NO_ACTIVE_FILE` in `obsidian_exec` with the same code and details and the new message, and pin it with a new test. Leave the dispatch message and its other tests unchanged.
>
> Why:
> - BI-0174's Cleanup constraint: the no-active-file message "MUST NOT mention inputs the tool does not accept", and the acceptance criterion requires advice to name only the tool's own inputs. `obsidian_exec` has no `target_mode` or `file` input.
> - BI-0174's out-of-scope list allows an error to change when that is needed for it and its documentation to agree. Here only the message changes.
>
> Until the owner rules, do not edit the existing test.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0178 - Classify Missing Named Note In Find And Replace.md`

**Advisor, after the owner ruled** (escalate: none):

> Q2. A
>
> Owner ruling: you may edit exactly one existing assertion, `obsidian_exec/handler.test.ts:144-146`, to the new message.
>
> 1. In `obsidian_exec`, rethrow `ERR_NO_ACTIVE_FILE` with the same code and details. Use a message that names only the tool's own inputs: `file=` or `path=` in the command's parameters, with `vault`.
> 2. Add a new test that pins the new message.
> 3. Leave the dispatch message and its other tests unchanged: `_dispatch.test.ts`, `cli-adapter.test.ts`, `move/handler.test.ts`.
>
> Any other existing-test edit needs a new owner ruling.
>
> Why: BI-0174's Cleanup constraint says the no-active-file advice must not mention inputs the tool does not accept. Its out-of-scope list allows an error to change when that is needed for it and its documentation to agree.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`: Added a *Clarified 2026-11-04 (Relay Q2, owner ruling)* note to Impact item 10, on the views_base no-active-file bullet. It records that obsidian_exec gets a tool-local ERR_NO_ACTIVE_FILE message naming only its own inputs, and that the owner approved exactly one existing-test edit (obsidian_exec/handler.test.ts:144-146) plus a new test.

**Owner:** choice 1 (Approve one-assertion edit (A)), via cli, 2026-11-04T06:11:27.524Z.

**Sent to the step:**

> Q2. A
>
> Owner ruling: you may edit exactly one existing assertion, `obsidian_exec/handler.test.ts:144-146`, to the new message.
>
> 1. In `obsidian_exec`, rethrow `ERR_NO_ACTIVE_FILE` with the same code and details. Use a message that names only the tool's own inputs: `file=` or `path=` in the command's parameters, with `vault`.
> 2. Add a new test that pins the new message.
> 3. Leave the dispatch message and its other tests unchanged: `_dispatch.test.ts`, `cli-adapter.test.ts`, `move/handler.test.ts`.
>
> Any other existing-test edit needs a new owner ruling.
>
> Why: BI-0174's Cleanup constraint says the no-active-file advice must not mention inputs the tool does not accept. Its out-of-scope list allows an error to change when that is needed for it and its documentation to agree.

## 5. repair / settle-verdict (2026-11-04T06:15:17.193Z)

**Question (verbatim):**

> **BI-0174 verification came back `partial`. Do you accept it and open the pull request?**
>
> Every check that could be run safely passed:
> - live calls against the built server (TC-00597, TC-00600, TC-00601, the three unknown-vault forms, the lifted validation sub-codes, accented-letter folding, `%20` decoding in links, Base values as strings, the read-only messages, the instructions text and the description lengths);
> - the full suite (4,949 tests), typecheck, lint and the fingerprint gate.
>
> Three live checks were **not exercised**. Each needs your environment changed, not more code:
>
> 1. **`views_base` / `obsidian_exec` no-active-file advice (item 10e).** Needs Obsidian focused on `TestVault-Obsidian-CLI-MCP` with no file open, so I would close the vault's open tabs. Today it is covered only by unit tests that stub the CLI's `Error: No active file.` answer.
> 2. **Vault-unavailable row (item 3, seven pages).** Needs a registered vault that Obsidian cannot bring up (for example a registration whose folder Obsidian can't open). The rows rest on spec 072's earlier probe.
> 3. **Disabled-CLI row (item 3, seven pages).** Needs Obsidian's Settings > General > Advanced > Command line interface turned off for one call, then back on. The rows rest on BI-0132's TC-00495 probe and the dispatch code.
>
> The evidence shows no code gap, so widening the fix would not close any of these.
>
> | Option | Description |
> |--------|-------------|
> | A (recommended) | Accept the partial result and open the pull request. The three unexercised checks are already listed in test.md under "Residual Risks". |
> | B | Before the PR, authorise check 1 only: I focus the test vault, close its open tabs, call `views_base` (no `base_path`) and `obsidian_exec` (`outline`), record the answers in test.md, then reopen nothing (the test vault has no working state). Checks 2 and 3 stay residual risks. |
> | C | Hold the PR until you can set up checks 2 and 3 yourself (switch the CLI setting off, or stage an unreachable vault). I then re-run `/speckit-bug-test` to cover all three. |
>
> Recommended: **A**. All three gaps are environment checks on error paths whose code is small and unit-tested, and checks 2 and 3 already have earlier live probes behind them. The docs-only rows for 2 and 3 describe errors this BI did not change.

**Advisor** (escalate: decision: The developer asks you to accept a partial verification and open the PR. Check 1 also changes your Obsidian state, which Best Practices reserves for your approval for each session. Both are your call.):

> Verification sign-off: the owner decides. Recommendation: B.
>
> Do check 1 before the PR, if the owner allows it:
> 1. In `TestVault-Obsidian-CLI-MCP`, focus the vault and close its open tabs.
> 2. Call `views_base` with no `base_path`, and `obsidian_exec` with `outline`.
> 3. Record both answers in test.md.
>
> Leave checks 2 and 3 as residual risks in test.md. Then open the PR.
>
> Why:
> - Check 1 covers the only change in behaviour among the three. The new no-active-file messages, including the one-assertion `obsidian_exec` edit the owner approved, are proven today only by stubbed unit tests.
> - Check 1 is cheap, and `TestVault-Obsidian-CLI-MCP` is the designated test vault for destructive and environment probes.
> - Checks 2 and 3 are documentation rows for errors this BI did not change, and earlier live probes back them: spec 072 and TC-00495 / BI-0132. BI-0174 asks that every vault-unavailable example show what is actually returned, and those probes support the rows.
>
> Wait for the owner's ruling before closing tabs or opening the PR.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`, `210-Guidelines/Best Practices.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> The owner accepts the partial verification. Open the pull request.
>
> Keep the three checks that were not run listed under "Residual Risks" in test.md:
> 1. The `views_base` / `obsidian_exec` no-active-file advice (item 10). Covered only by unit tests.
> 2. The vault-unavailable row (item 3). Rests on spec 072's earlier probe.
> 3. The disabled-CLI row (item 3). Rests on TC-00495 (BI-0132).
>
> Do not close any tabs and do not change any Obsidian settings.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`: Added an 'Owner ruling (2026-11-04, Relay verification)' paragraph to the Status section: the partial verification is accepted and the PR may open. It names the three checks that were not run, which stay as residual risks in test.md.

**Owner:** choice 2 (A: accept partial, open PR), via cli, 2026-11-04T06:25:45.082Z.

**Sent to the step:**

> A
>
> The owner accepts the partial verification. Open the pull request.
>
> Keep the three checks that were not run listed under "Residual Risks" in test.md:
> 1. The `views_base` / `obsidian_exec` no-active-file advice (item 10). Covered only by unit tests.
> 2. The vault-unavailable row (item 3). Rests on spec 072's earlier probe.
> 3. The disabled-CLI row (item 3). Rests on TC-00495 (BI-0132).
>
> Do not close any tabs and do not change any Obsidian settings.
