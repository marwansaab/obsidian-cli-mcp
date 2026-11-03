# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0132-2026-11-04`, started 2026-11-03T22:25:15.467Z.

## 1. checks / preflight (2026-11-03T22:25:15.510Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0132. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0132 in the vault.
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

> Primed for BI-0132 — Classify CLI Disabled Stdout As Structured Error.
>
> Readiness summary:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which matches `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the per-MCP Obsidian CLI MCP Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`. Title: "BI-0132 — Classify CLI Disabled Stdout As Structured Error".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `queued` (not finished or abandoned). It was re-validated 2026-11-03 against 0.9.0-local. Live reproduction still needs the owner to turn off Obsidian's Command line interface setting. A source check found no classifier rule for the `Command line interface is not enabled.` notice.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. `## /speckit-specify prompt` is present and describes the expected behaviour. There is no `/speckit-bug-assess prompt` section. The note was not changed.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, ref "BI-0132 - Classify CLI Disabled Stdout As Structured Error").
>
> Read: BI, Constitution (v1.5.1, Principle IV), Architecture (error mapping, adapter R5 clause, ADR-029 cold-start retry, vault registry), ADR-007 (incl. 2026-05-07 amendment on the unprefixed `Vault not found.` signature) and ADR-015 (`details.reason` sub-discriminator; 2026-11-01 amendment per ADR-045).
> Role: BA + Solution Architect, answering for Claude Code.
> Scope notes for the fix: the BI covers every surface, not just `obsidian_exec`:
> - `obsidian_exec`
> - plain CLI-backed typed tools
> - eval-backed tools
> - the `vaults` tool and the vault-registry lookups used by named-vault writers and `query_base`
> - help and description text that names "CLI integration disabled"
>
> Match the exact upstream notice only (the BI-0173 false-positive lesson). Add no new top-level error code. BI-0174 item 3 overlaps the help-text correction and should follow this BI's outcome.
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-007 - Centralized CLI Bounds with Selective Override.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `220-Planning/Session Handover.md`

**Sent to the step:**

> Primed for BI-0132 — Classify CLI Disabled Stdout As Structured Error.
>
> Readiness summary:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which matches `expected_vault_id` `my-setup` (CLI display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the per-MCP Obsidian CLI MCP Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`. Title: "BI-0132 — Classify CLI Disabled Stdout As Structured Error".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `queued` (not finished or abandoned). It was re-validated 2026-11-03 against 0.9.0-local. Live reproduction still needs the owner to turn off Obsidian's Command line interface setting. A source check found no classifier rule for the `Command line interface is not enabled.` notice.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. `## /speckit-specify prompt` is present and describes the expected behaviour. There is no `/speckit-bug-assess prompt` section. The note was not changed.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, ref "BI-0132 - Classify CLI Disabled Stdout As Structured Error").
>
> Read: BI, Constitution (v1.5.1, Principle IV), Architecture (error mapping, adapter R5 clause, ADR-029 cold-start retry, vault registry), ADR-007 (incl. 2026-05-07 amendment on the unprefixed `Vault not found.` signature) and ADR-015 (`details.reason` sub-discriminator; 2026-11-01 amendment per ADR-045).
> Role: BA + Solution Architect, answering for Claude Code.
> Scope notes for the fix: the BI covers every surface, not just `obsidian_exec`:
> - `obsidian_exec`
> - plain CLI-backed typed tools
> - eval-backed tools
> - the `vaults` tool and the vault-registry lookups used by named-vault writers and `query_base`
> - help and description text that names "CLI integration disabled"
>
> Match the exact upstream notice only (the BI-0173 false-positive lesson). Add no new top-level error code. BI-0174 item 3 overlaps the help-text correction and should follow this BI's outcome.
> Awaiting clarification questions.

## 2. assess / bug-assess (2026-11-03T22:26:03.088Z)

**Question (verbatim):**

> Return the bug report for job BI-0132 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0132`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0132
>
> ## Impact
> The cli-adapter classifies a CLI failure by stdout shape: an `Error:`-prefixed line → `CLI_REPORTED_ERROR`, plus the R5 reclassification of the unprefixed `Vault not found.` signature (per [[ADR-007 - Centralized CLI Bounds with Selective Override]] / [[Obsidian CLI MCP - Architecture]]; extended to named-vault `obsidian_exec` calls by [[BI-0173 - Classify Vault Not Found In Obsidian Exec|BI-0173]] in 0.9.0). The CLI-disabled message is a **third unprefixed failure string** that no rule catches, so:
>
> - `obsidian_exec` returns `{ stdout: "Command line interface is not enabled. …", exitCode: 0, … }` as a **success** — a caller/agent can misread the informational message as data.
> - Typed tools parse that stdout as if it were a normal result (e.g. `read` would treat the message as file content; `files total` would fail to parse a count).
> - Eval-backed typed tools fail, but with a parse error that hides the cause (inferred from the 0.9.0 source).
> - The vault registry would read the notice as an empty vault list, so `vaults` would report no vaults and named-vault writers would claim the vault is not registered (inferred from the 0.9.0 source).
> - The published guidance describes this cause with a different output (see Status item 1), so agents that branch on the docs would not recognise it.
>
> This violates Constitution Principle IV (upstream failures must surface as structured `UpstreamError`, never masked as success). It is the same class as the R5 `Vault not found.` reclassification — a known, narrow seam. Trigger is narrow (only when the user has disabled the CLI), hence low impact, but the silent-success masking is a correctness gap worth closing. Empirically confirmed 2026-05-30: `obsidian_exec files total vault=TestVault-Obsidian-CLI-MCP` with the CLI toggle OFF returned `exitCode: 0` + the not-enabled stdout, no error wrapper. The cold-start retry correctly did NOT fire (the message is not the `Error: Command "<cmd>" not found.` cold-start signature), so this is orthogonal to BI-0130 — a classification gap, not a retry gap.
>
> ## Status and evidence
> *Re-validated 2026-11-03 against @marwansaab/obsidian-cli-mcp@0.9.0-local:* still valid. Not re-checked live: needs owner — reproducing the defect means turning off Obsidian's **Command line interface** setting, which is an owner action in the Obsidian app. Read-only source check of `main` (0.9.0, HEAD `0189e0c`): there is still no rule for the `Command line interface is not enabled.` answer anywhere in `src/`. The CLI adapter recognises only `Error:`-prefixed lines, the cold-start signature `Error: Command "…" not found.`, and the unprefixed `Vault not found.` answer (now also on `obsidian_exec` calls that name a vault, since [[BI-0173 - Classify Vault Not Found In Obsidian Exec]] shipped). What changed since 2026-10-31:
>
> 1. **Docs now point at this case with the wrong output.** [[BI-0076 - Revise Or Retire Closed Vault Not Open Detection Signature]] shipped in 0.9.0: closed vaults now open transparently, and the descriptions and help of `paths`, `pattern_search`, `tag`, `query_base`, `smart_connections_query`, `smart_connections_similar` and `views_base` give "its command-line integration is disabled" as the example cause of the vault-unavailable failure, with `details.stdout` starting `Error: Command "eval" not found.` (re-read in today's tool descriptions). [[TC-00495 - Vault Unavailable Terminates Without Hang|TC-00495]]'s 2026-05-30 probe found that the setting produces the not-enabled answer instead, so [[TC-00727 - Registered Vault That Cannot Be Brought Up Returns Vault Unavailable Failure|TC-00727]] uses a missing vault folder rather than the setting. Correcting that example is item 3 of [[BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation]]. The two BIs overlap: this BI defines the failure, so BI-0174 item 3 should follow this BI's outcome (or, if BI-0174 lands first, simply drop the "integration disabled" example).
> 2. **The defect is wider than one string.** Inferred from the 0.9.0 source, not observed: with the setting off, `obsidian_exec` and plain CLI-backed typed tools such as `read` return the notice as a success (as the note's content for `read`); eval-backed typed tools fail with an opaque `CLI_REPORTED_ERROR` at `stage: "json-parse"` that does not name the cause; the `vaults` tool would parse the notice as zero vaults and return `{count: 0, vaults: []}`; and named-vault calls that resolve the vault through the vault registry (`write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`, `query_base`) would fail with `VALIDATION_ERROR` "Vault … is not registered with Obsidian." and an empty `knownVaults` — a misleading cause. The fix therefore has to cover every surface, not just `obsidian_exec`.
> 3. The cold-start retry would still not fire, since the notice does not match its signature. The `/speckit-specify` prompt below replaces the deferred placeholder.
>
> *Queued — validation needs owner (2026-10-31):* turn OFF Obsidian Settings → General → Advanced → **Command line interface**, run `obsidian_exec({command:"files", flags:["total"], vault:"TestVault-Obsidian-CLI-MCP"})` and one typed tool (e.g. `read` on any TestVault note) against `obsidian-cli-mcp-local` 0.9.0-local, record whether each returns a success envelope carrying the "Command line interface is not enabled…" stdout or a structured `UpstreamError`, then turn the setting back ON. (Read-only source check of `C:\\Github\\obsidian-cli-mcp` found no classifier rule for that string outside Smart Connections specs/tests, so the gap is likely still present — not confirmed live.)
>
> *Queued (candidate)* — surfaced 2026-05-30 during [[BI-0130 - Retry Once On Cold Start Vault Launch Not Found]] / [[TC-00495 - Vault Unavailable Terminates Without Hang|TC-00495]] (AC7) live probing. When Obsidian's **Command line interface** setting (Settings → General → Advanced) is OFF, every CLI invocation returns `exitCode: 0` with stdout `Command line interface is not enabled. Please turn it on in Settings > General > Advanced.` and **no `Error:` prefix** — so the cli-adapter classifier does not recognise it and the wrapper returns it as a **success envelope**, not an `UpstreamError`.
>
> ## Expected behaviour
> *Plan-stage notes (not part of the prompt):* extend the cli-adapter reclassification seam (the one that already catches the unprefixed `Vault not found.`) to detect the CLI-disabled stdout and surface it as `CLI_REPORTED_ERROR`, ideally with a `details.code: "CLI_DISABLED"` (or `details.reason`) discriminator per [[ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes]] so an agent can act (prompt the user to enable the CLI). Zero new top-level error code (Principle IV streak preserved). The vault-registry probe needs the same check so `vaults` and named-vault lookups do not read the notice as an empty list. Match the exact upstream notice only, so real output that merely contains the words is not misclassified (the BI-0173 false-positive lesson). Add a regression test pinning the exact upstream string.
>
> /speckit-specify Report disabled CLI
>
> ## Feature
> When Obsidian's command-line setting is switched off, every operation the server offers stops with a clear failure that says the command line is disabled and that the user must turn it back on, instead of passing Obsidian's notice back as if it were a normal result.
>
> ## Why
> With the setting off, Obsidian answers every request with a short notice rather than an error. Today that notice comes back as success: raw commands look as if they worked, reading a note returns the notice as the note's text, the vault list comes back empty, and other operations fail with messages that blame a parsing problem or claim the vault is not registered. Agents then act on false data or chase the wrong cause, when the only fix is a setting the user has to change.
>
> ## User stories
> - As an agent, I want any operation to fail with a clear "command line disabled" failure when the setting is off, so that I never treat the notice as real content.
> - As an agent using the raw command passthrough, I want the disabled notice reported as a failure, so that I do not read it as the command's output.
> - As an agent listing or naming vaults, I want the disabled state reported as such, so that I am not told there are no vaults or that a vault I named is not registered.
> - As an agent, I want the failure to say the user must turn the setting on, so that I ask them to do it instead of retrying.
> - As an agent reading the published guidance, I want this failure described exactly as it is returned, so that my error handling recognises it.
> - As a user, I want everything to work again as soon as I turn the setting back on, so that no restart or extra step is needed.
>
> ## Acceptance criteria
>
> **Story: no notice returned as content**
> - Given the setting is off, when an agent reads a note, then the call fails with the disabled failure and no note text is returned.
> - Given the setting is off, when an agent runs any other operation, then it fails with the same disabled failure, not a success, an empty result or a parsing failure.
>
> **Story: raw passthrough**
> - Given the setting is off, when an agent runs a raw command, then the result is the disabled failure, and Obsidian's original notice is included in the failure for reference.
> - Given the setting is on, when a raw command's real output happens to contain the same words, then the output is returned unchanged as a success.
>
> **Story: vault listing and naming**
> - Given the setting is off, when an agent lists vaults, then it gets the disabled failure, not an empty list.
> - Given the setting is off, when an agent names a registered vault, then it gets the disabled failure, not an "unknown vault" or "not registered" failure.
>
> **Story: actionable failure**
> - Given the disabled failure, when an agent inspects it, then it can tell this case apart from an unknown vault, a vault that could not be opened and a missing note, and the message says the user must turn the setting on in Obsidian.
> - Given the setting is off, when a call is made, then it returns promptly, without repeated retries.
>
> **Story: accurate guidance**
> - Given any help page or description that names a disabled command line as a cause of failure, when an agent compares it with the failure actually returned, then they match.
>
> **Story: recovery**
> - Given the user turns the setting back on, when the agent repeats the call in the same session, then it succeeds normally.
>
> ## Out of scope
> - Turning the setting on automatically, or changing any Obsidian setting.
> - Checking the setting before each call; the failure is recognised from Obsidian's answer.
> - Changing how vaults that cannot be opened for other reasons are reported.
> - Other corrections to help pages and descriptions beyond describing this failure.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0132
>
> ## Impact
> The cli-adapter classifies a CLI failure by stdout shape: an `Error:`-prefixed line → `CLI_REPORTED_ERROR`, plus the R5 reclassification of the unprefixed `Vault not found.` signature (per [[ADR-007 - Centralized CLI Bounds with Selective Override]] / [[Obsidian CLI MCP - Architecture]]; extended to named-vault `obsidian_exec` calls by [[BI-0173 - Classify Vault Not Found In Obsidian Exec|BI-0173]] in 0.9.0). The CLI-disabled message is a **third unprefixed failure string** that no rule catches, so:
>
> - `obsidian_exec` returns `{ stdout: "Command line interface is not enabled. …", exitCode: 0, … }` as a **success** — a caller/agent can misread the informational message as data.
> - Typed tools parse that stdout as if it were a normal result (e.g. `read` would treat the message as file content; `files total` would fail to parse a count).
> - Eval-backed typed tools fail, but with a parse error that hides the cause (inferred from the 0.9.0 source).
> - The vault registry would read the notice as an empty vault list, so `vaults` would report no vaults and named-vault writers would claim the vault is not registered (inferred from the 0.9.0 source).
> - The published guidance describes this cause with a different output (see Status item 1), so agents that branch on the docs would not recognise it.
>
> This violates Constitution Principle IV (upstream failures must surface as structured `UpstreamError`, never masked as success). It is the same class as the R5 `Vault not found.` reclassification — a known, narrow seam. Trigger is narrow (only when the user has disabled the CLI), hence low impact, but the silent-success masking is a correctness gap worth closing. Empirically confirmed 2026-05-30: `obsidian_exec files total vault=TestVault-Obsidian-CLI-MCP` with the CLI toggle OFF returned `exitCode: 0` + the not-enabled stdout, no error wrapper. The cold-start retry correctly did NOT fire (the message is not the `Error: Command "<cmd>" not found.` cold-start signature), so this is orthogonal to BI-0130 — a classification gap, not a retry gap.
>
> ## Status and evidence
> *Re-validated 2026-11-03 against @marwansaab/obsidian-cli-mcp@0.9.0-local:* still valid. Not re-checked live: needs owner — reproducing the defect means turning off Obsidian's **Command line interface** setting, which is an owner action in the Obsidian app. Read-only source check of `main` (0.9.0, HEAD `0189e0c`): there is still no rule for the `Command line interface is not enabled.` answer anywhere in `src/`. The CLI adapter recognises only `Error:`-prefixed lines, the cold-start signature `Error: Command "…" not found.`, and the unprefixed `Vault not found.` answer (now also on `obsidian_exec` calls that name a vault, since [[BI-0173 - Classify Vault Not Found In Obsidian Exec]] shipped). What changed since 2026-10-31:
>
> 1. **Docs now point at this case with the wrong output.** [[BI-0076 - Revise Or Retire Closed Vault Not Open Detection Signature]] shipped in 0.9.0: closed vaults now open transparently, and the descriptions and help of `paths`, `pattern_search`, `tag`, `query_base`, `smart_connections_query`, `smart_connections_similar` and `views_base` give "its command-line integration is disabled" as the example cause of the vault-unavailable failure, with `details.stdout` starting `Error: Command "eval" not found.` (re-read in today's tool descriptions). [[TC-00495 - Vault Unavailable Terminates Without Hang|TC-00495]]'s 2026-05-30 probe found that the setting produces the not-enabled answer instead, so [[TC-00727 - Registered Vault That Cannot Be Brought Up Returns Vault Unavailable Failure|TC-00727]] uses a missing vault folder rather than the setting. Correcting that example is item 3 of [[BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation]]. The two BIs overlap: this BI defines the failure, so BI-0174 item 3 should follow this BI's outcome (or, if BI-0174 lands first, simply drop the "integration disabled" example).
> 2. **The defect is wider than one string.** Inferred from the 0.9.0 source, not observed: with the setting off, `obsidian_exec` and plain CLI-backed typed tools such as `read` return the notice as a success (as the note's content for `read`); eval-backed typed tools fail with an opaque `CLI_REPORTED_ERROR` at `stage: "json-parse"` that does not name the cause; the `vaults` tool would parse the notice as zero vaults and return `{count: 0, vaults: []}`; and named-vault calls that resolve the vault through the vault registry (`write_note`, `append_note`, `prepend`, `patch_heading`, `patch_block`, `query_base`) would fail with `VALIDATION_ERROR` "Vault … is not registered with Obsidian." and an empty `knownVaults` — a misleading cause. The fix therefore has to cover every surface, not just `obsidian_exec`.
> 3. The cold-start retry would still not fire, since the notice does not match its signature. The `/speckit-specify` prompt below replaces the deferred placeholder.
>
> *Queued — validation needs owner (2026-10-31):* turn OFF Obsidian Settings → General → Advanced → **Command line interface**, run `obsidian_exec({command:"files", flags:["total"], vault:"TestVault-Obsidian-CLI-MCP"})` and one typed tool (e.g. `read` on any TestVault note) against `obsidian-cli-mcp-local` 0.9.0-local, record whether each returns a success envelope carrying the "Command line interface is not enabled…" stdout or a structured `UpstreamError`, then turn the setting back ON. (Read-only source check of `C:\\Github\\obsidian-cli-mcp` found no classifier rule for that string outside Smart Connections specs/tests, so the gap is likely still present — not confirmed live.)
>
> *Queued (candidate)* — surfaced 2026-05-30 during [[BI-0130 - Retry Once On Cold Start Vault Launch Not Found]] / [[TC-00495 - Vault Unavailable Terminates Without Hang|TC-00495]] (AC7) live probing. When Obsidian's **Command line interface** setting (Settings → General → Advanced) is OFF, every CLI invocation returns `exitCode: 0` with stdout `Command line interface is not enabled. Please turn it on in Settings > General > Advanced.` and **no `Error:` prefix** — so the cli-adapter classifier does not recognise it and the wrapper returns it as a **success envelope**, not an `UpstreamError`.
>
> ## Expected behaviour
> *Plan-stage notes (not part of the prompt):* extend the cli-adapter reclassification seam (the one that already catches the unprefixed `Vault not found.`) to detect the CLI-disabled stdout and surface it as `CLI_REPORTED_ERROR`, ideally with a `details.code: "CLI_DISABLED"` (or `details.reason`) discriminator per [[ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes]] so an agent can act (prompt the user to enable the CLI). Zero new top-level error code (Principle IV streak preserved). The vault-registry probe needs the same check so `vaults` and named-vault lookups do not read the notice as an empty list. Match the exact upstream notice only, so real output that merely contains the words is not misclassified (the BI-0173 false-positive lesson). Add a regression test pinning the exact upstream string.
>
> /speckit-specify Report disabled CLI
>
> ## Feature
> When Obsidian's command-line setting is switched off, every operation the server offers stops with a clear failure that says the command line is disabled and that the user must turn it back on, instead of passing Obsidian's notice back as if it were a normal result.
>
> ## Why
> With the setting off, Obsidian answers every request with a short notice rather than an error. Today that notice comes back as success: raw commands look as if they worked, reading a note returns the notice as the note's text, the vault list comes back empty, and other operations fail with messages that blame a parsing problem or claim the vault is not registered. Agents then act on false data or chase the wrong cause, when the only fix is a setting the user has to change.
>
> ## User stories
> - As an agent, I want any operation to fail with a clear "command line disabled" failure when the setting is off, so that I never treat the notice as real content.
> - As an agent using the raw command passthrough, I want the disabled notice reported as a failure, so that I do not read it as the command's output.
> - As an agent listing or naming vaults, I want the disabled state reported as such, so that I am not told there are no vaults or that a vault I named is not registered.
> - As an agent, I want the failure to say the user must turn the setting on, so that I ask them to do it instead of retrying.
> - As an agent reading the published guidance, I want this failure described exactly as it is returned, so that my error handling recognises it.
> - As a user, I want everything to work again as soon as I turn the setting back on, so that no restart or extra step is needed.
>
> ## Acceptance criteria
>
> **Story: no notice returned as content**
> - Given the setting is off, when an agent reads a note, then the call fails with the disabled failure and no note text is returned.
> - Given the setting is off, when an agent runs any other operation, then it fails with the same disabled failure, not a success, an empty result or a parsing failure.
>
> **Story: raw passthrough**
> - Given the setting is off, when an agent runs a raw command, then the result is the disabled failure, and Obsidian's original notice is included in the failure for reference.
> - Given the setting is on, when a raw command's real output happens to contain the same words, then the output is returned unchanged as a success.
>
> **Story: vault listing and naming**
> - Given the setting is off, when an agent lists vaults, then it gets the disabled failure, not an empty list.
> - Given the setting is off, when an agent names a registered vault, then it gets the disabled failure, not an "unknown vault" or "not registered" failure.
>
> **Story: actionable failure**
> - Given the disabled failure, when an agent inspects it, then it can tell this case apart from an unknown vault, a vault that could not be opened and a missing note, and the message says the user must turn the setting on in Obsidian.
> - Given the setting is off, when a call is made, then it returns promptly, without repeated retries.
>
> **Story: accurate guidance**
> - Given any help page or description that names a disabled command line as a cause of failure, when an agent compares it with the failure actually returned, then they match.
>
> **Story: recovery**
> - Given the user turns the setting back on, when the agent repeats the call in the same session, then it succeeds normally.
>
> ## Out of scope
> - Turning the setting on automatically, or changing any Obsidian setting.
> - Checking the setting before each call; the failure is recognised from Obsidian's answer.
> - Changing how vaults that cannot be opened for other reasons are reported.
> - Other corrections to help pages and descriptions beyond describing this failure.

## 3. assess / resolve-assessment (2026-11-03T22:30:03.307Z)

**Question (verbatim):**

> Q1 — Reproduction: steps 3–5 have not been run live (the read result, the vaults result and the named-vault write result while the command line is off). The symptoms for those three steps are inferred from the 0.9.0 source; only the obsidian_exec step was seen live, on 2026-05-30. Should the fix start on the source-inferred symptoms?
>
> | Option | Description |
> |---|---|
> | A (recommended) | Accept the source-inferred symptoms for steps 3–5 and start the fix now. /speckit-bug-test runs steps 1–6 live with the owner toggling the setting, and records before/after results there. |
> | B | Block the fix until the owner reproduces steps 3–5 live on 0.9.0 with the setting off. |
> | C | Drop steps 3–5 from the reproduction and keep only the observed obsidian_exec step. |
>
> Recommendation: A. Every tool reaches the CLI through dispatchCli. `invokeCli` → `runTyped` → `dispatchCli` serves every typed tool and the registry probe in server.ts:100–108; `invokeBoundedCli` → `dispatchCli` serves obsidian_exec. So the obsidian_exec observation already exercises the same exit-0 path, and the downstream symptoms follow directly from the source: `parseVaultsVerboseOutput` skips lines without a tab, and `executeReadNote` returns stdout as the note's content. A live reproduction adds confidence but would not change the fix.

**Advisor** (escalate: none):

> Q1. A
>
> Rationale: the BI already says steps 3–5 are "Inferred from the 0.9.0 source, not observed". It still requires that "the fix therefore has to cover every surface, not just `obsidian_exec`", and its spec prompt covers read, vault listing and vault naming in its acceptance criteria. Live validation of the setting is an owner step under "Queued — validation needs owner", not a precondition for starting the fix. Option C would cut scope the BI explicitly includes. (BI-0132 Status items 2–3 and the Impact section.)

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`

**Sent to the step:**

> Q1. A
>
> Rationale: the BI already says steps 3–5 are "Inferred from the 0.9.0 source, not observed". It still requires that "the fix therefore has to cover every surface, not just `obsidian_exec`", and its spec prompt covers read, vault listing and vault naming in its acceptance criteria. Live validation of the setting is an owner step under "Queued — validation needs owner", not a precondition for starting the fix. Option C would cut scope the BI explicitly includes. (BI-0132 Status items 2–3 and the Impact section.)

## 4. assess / resolve-assessment (2026-11-03T22:30:14.202Z)

**Question (verbatim):**

> Q2 — Match rule: which stdout should count as the disabled-CLI notice?
>
> | Option | Description |
> |---|---|
> | A (recommended) | Exact whole output: `stdout.trim() === "Command line interface is not enabled. Please turn it on in Settings > General > Advanced."`. This is the narrowest rule: output that merely contains the words, or a note that begins with them, stays a success. It is the same form the raw facade already uses for `Vault not found.` (invoke-bounded-cli.ts:83). |
> | B | First-sentence prefix: `stdout.trimStart().startsWith("Command line interface is not enabled.")`. This survives a future rewording of the second sentence, but would misclassify a note whose text begins with that sentence. It is the form the typed facade uses for `Vault not found.` (cli-adapter.ts:152). |
> | C | Exact first sentence on a single-line output: trimmed stdout has no newline and starts with `Command line interface is not enabled.`. A middle ground: it tolerates a reworded second sentence and stays a success for multi-line content. |
>
> Recommendation: A. It is the only option that meets the acceptance criterion "real output that happens to contain the same words is returned unchanged" in every case, and it follows the BI-0173 / spec 091 false-positive lesson. If Obsidian ever rewords the notice, behaviour falls back to today's, which is no worse than now, and the regression test pins the verbatim string so the drift is visible when a T0 capture is repeated.

**Advisor** (escalate: none):

> Q2. A
>
> Rationale: the BI's plan-stage notes say "Match the exact upstream notice only, so real output that merely contains the words is not misclassified (the BI-0173 false-positive lesson). Add a regression test pinning the exact upstream string." The BI's Status section records that string verbatim as `Command line interface is not enabled. Please turn it on in Settings > General > Advanced.` (BI-0132, `/speckit-specify prompt` plan-stage notes and Status.)

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`

**Sent to the step:**

> Q2. A
>
> Rationale: the BI's plan-stage notes say "Match the exact upstream notice only, so real output that merely contains the words is not misclassified (the BI-0173 false-positive lesson). Add a regression test pinning the exact upstream string." The BI's Status section records that string verbatim as `Command line interface is not enabled. Please turn it on in Settings > General > Advanced.` (BI-0132, `/speckit-specify prompt` plan-stage notes and Status.)

## 5. assess / resolve-assessment (2026-11-03T22:30:21.218Z)

**Question (verbatim):**

> Q3 — Discriminator shape: how does an agent tell the disabled-CLI failure apart under the existing CLI_REPORTED_ERROR code?
>
> | Option | Description |
> |---|---|
> | A (recommended) | Flat `details.reason: "cli-disabled"` on the dispatch-level CLI_REPORTED_ERROR, alongside the usual exit-0 details (argv, command, stdout, stderr, exitCode, message). This mirrors the only other dispatch-level condition, `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"`, set in dispatchOnce at _dispatch.ts:601 and documented in README.md:133 and README.md:254 ("the state of a condition goes in details.reason"). |
> | B | `details.code: "CLI_DISABLED"`, matching the tool-level details.code discriminators such as `VAULT_NOT_FOUND` (_active-file.ts:312) and `BASE_NOT_FOUND`. |
> | C | Both: `details.code: "CLI_DISABLED"` plus `details.reason: "cli-disabled"`. |
>
> Recommendation: A. The condition is detected in dispatch, the same layer that sets obsidian-not-running, and ADR-015 puts the state of a condition in details.reason. Under README.md:254, details.code names a specific domain condition (file, vault, base). Every option keeps the top-level code set unchanged (Principle IV). Option C duplicates the signal for no gain.

**Advisor** (escalate: none):

> Q3. A
>
> Rationale: the BI allows either form ("`details.code: "CLI_DISABLED"` (or `details.reason`) discriminator per ADR-015") and requires zero new top-level codes. The Architecture note's app-down recovery element sets the precedent for a condition detected at dispatch: `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"`, a sub-discriminator per ADR-015. Under ADR-015 the literal must be kebab-case and listed in the per-tool docs, which `"cli-disabled"` satisfies and the BI's "accurate guidance" story covers. (BI-0132 plan-stage notes; Obsidian CLI MCP - Architecture; ADR-015 Decision.)

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`

**Sent to the step:**

> Q3. A
>
> Rationale: the BI allows either form ("`details.code: "CLI_DISABLED"` (or `details.reason`) discriminator per ADR-015") and requires zero new top-level codes. The Architecture note's app-down recovery element sets the precedent for a condition detected at dispatch: `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"`, a sub-discriminator per ADR-015. Under ADR-015 the literal must be kebab-case and listed in the per-tool docs, which `"cli-disabled"` satisfies and the BI's "accurate guidance" story covers. (BI-0132 plan-stage notes; Obsidian CLI MCP - Architecture; ADR-015 Decision.)

## 6. assess / resolve-assessment (2026-11-03T22:30:33.988Z)

**Question (verbatim):**

> Q4 — Live confirmation: when should the owner toggle Obsidian's Command line interface setting off and on to capture the verbatim notice and verify the fix? The notice wording comes from a single 2026-05-30 probe and is not recorded anywhere in this repository.
>
> | Option | Description |
> |---|---|
> | A (recommended) | Live check in /speckit-bug-test only. The fix pins the string recorded in BI-0132 / TC-00495. Bug-test asks the owner to turn the setting off, runs obsidian_exec, read, vaults and one named-vault writer against the authorised test vault, checks each returns CLI_REPORTED_ERROR with the cli-disabled discriminator and the verbatim notice in details.stdout, then has the owner turn the setting back on and confirms recovery in the same session. If the captured notice differs, the fix's constant is corrected before the PR. |
> | B | A T0 capture during /speckit-bug-fix before any code changes (owner toggles the setting first), plus the bug-test live run. |
> | C | No live check. Rely on the 2026-05-30 observation and unit tests only, and record the live run as a follow-up. |
>
> Recommendation: A. One owner toggle session covers both the string capture and the end-to-end verification. A wrong constant fails safe (behaviour stays as today) and would surface in that same session before merge. Option B costs a second toggle session for little gain; option C leaves the acceptance criteria unverified against the real CLI.

**Advisor** (escalate: none):

> Q4. A
>
> Rationale: the BI records the verbatim notice (`Command line interface is not enabled. Please turn it on in Settings > General > Advanced.`). It treats the live check as one owner step: turn the setting OFF, run `obsidian_exec` and a typed tool against TestVault-Obsidian-CLI-MCP, record each result, then turn the setting back ON. That fits a single toggle session at test time. The spec's recovery story ("same session") is checked in that same run. (BI-0132 Status, "Queued — validation needs owner"; acceptance criteria under Story: recovery.)

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0132 - Classify CLI Disabled Stdout As Structured Error.md`

**Sent to the step:**

> Q4. A
>
> Rationale: the BI records the verbatim notice (`Command line interface is not enabled. Please turn it on in Settings > General > Advanced.`). It treats the live check as one owner step: turn the setting OFF, run `obsidian_exec` and a typed tool against TestVault-Obsidian-CLI-MCP, record each result, then turn the setting back ON. That fits a single toggle session at test time. The spec's recovery story ("same session") is checked in that same run. (BI-0132 Status, "Queued — validation needs owner"; acceptance criteria under Story: recovery.)
