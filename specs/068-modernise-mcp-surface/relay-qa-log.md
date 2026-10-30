# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0165-pr2-2026-10-30`, started 2026-10-29T23:30:30.479Z.

## 1. checks / preflight (2026-10-29T23:30:30.527Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0165. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0165 in the vault.
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

> BI-0165 preflight: all six checks pass, and the session is ready for clarification questions.
>
> - **Vault identity:** `My-Setup-Vault` has `vault_id` = `my-setup`, matching `expected_vault_id`. PASS. The session-start reads were already done in this conversation.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `in-review`. PR 1 of 6 is open as #87 on `068-pr1-fixes`, waiting for the owner to merge it. The work is not finished, so the run carries on. PASS.
> - **Specify prompt:** the "/speckit-specify prompt" section is there and its command is `/speckit-specify Modernise MCP surface`, the dash form. PASS. The note was not changed.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` was already loaded earlier in this conversation for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release", and its answering rules still apply.
>
> For context, owner rulings already recorded on the note: C1 (descriptions now, union later), B3 (refuse when the client cannot confirm), the C2 denylist exactly as briefed, the tool named `vaults`, and one Relay run per PR.
>
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

**Sent to the step:**

> BI-0165 preflight: all six checks pass, and the session is ready for clarification questions.
>
> - **Vault identity:** `My-Setup-Vault` has `vault_id` = `my-setup`, matching `expected_vault_id`. PASS. The session-start reads were already done in this conversation.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `in-review`. PR 1 of 6 is open as #87 on `068-pr1-fixes`, waiting for the owner to merge it. The work is not finished, so the run carries on. PASS.
> - **Specify prompt:** the "/speckit-specify prompt" section is there and its command is `/speckit-specify Modernise MCP surface`, the dash form. PASS. The note was not changed.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` was already loaded earlier in this conversation for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release", and its answering rules still apply.
>
> For context, owner rulings already recorded on the note: C1 (descriptions now, union later), B3 (refuse when the client cannot confirm), the C2 denylist exactly as briefed, the tool named `vaults`, and one Relay run per PR.
>
> Awaiting clarification questions.
