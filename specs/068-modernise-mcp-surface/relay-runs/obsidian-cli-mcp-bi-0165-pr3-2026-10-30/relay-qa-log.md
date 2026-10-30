# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0165-pr3-2026-10-30`, started 2026-10-30T00:14:29.704Z.

## 1. checks / preflight (2026-10-30T00:14:29.752Z)

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

> Preflight for BI-0165 passed: all six checks are green and the session is ready for questions.
>
> - **Vault identity:** `My-Setup-Vault` returns `vault_id` = `my-setup`, which matches `expected_vault_id`. PASS. The session-start reads were done earlier in this conversation.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `in-review`. PR 1 (#87) and PR 2 (#88) are waiting for the owner to merge; the latest `spec_branch` is `068-pr2-exec-gate`. The work isn't finished, so the run carries on. PASS.
> - **Specify prompt:** the "/speckit-specify prompt" section is there, and its command line (line 52) is `/speckit-specify Modernise MCP surface`, in the dash form. PASS. The note was not changed.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` was already loaded earlier in this conversation for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release". Its answering rules stay in force.
>
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

**Sent to the step:**

> Preflight for BI-0165 passed: all six checks are green and the session is ready for questions.
>
> - **Vault identity:** `My-Setup-Vault` returns `vault_id` = `my-setup`, which matches `expected_vault_id`. PASS. The session-start reads were done earlier in this conversation.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, titled "BI-0165 — Ship 0.9.0 SDK V2 And Safety Release". PASS.
> - **Initiative:** `[[Obsidian CLI MCP]]`. PASS.
> - **Status:** `in-review`. PR 1 (#87) and PR 2 (#88) are waiting for the owner to merge; the latest `spec_branch` is `068-pr2-exec-gate`. The work isn't finished, so the run carries on. PASS.
> - **Specify prompt:** the "/speckit-specify prompt" section is there, and its command line (line 52) is `/speckit-specify Modernise MCP surface`, in the dash form. PASS. The note was not changed.
> - **Clarify skill:** `anthropic-skills:speckit-clarify-skill` was already loaded earlier in this conversation for "BI-0165 - Ship 0.9.0 SDK V2 And Safety Release". Its answering rules stay in force.
>
> Awaiting clarification questions.

## 2. review / fix (2026-10-30T00:39:55.746Z)

**Question (verbatim):**

> Review finding F2 (ctx.createQueue test seam) — plan.md (Graphify structural check, kernel nodes: "ctx.createQueue (PR 3, T036): a test seam, defaulting to createQueue") and tasks.md T036 ("the spy passed as ctx.createQueue was called exactly once, and both servers route calls through that instance") require this seam, so I have not removed it without your ruling.
>
> Context: createServer already returns `queue`, and every queued call reaches it as `deps.queue.run(...)` (looked up at call time in cli-adapter.ts:78, invoke-bounded-cli.ts:65). So `vi.spyOn(app.queue, "run")` on the returned queue proves that two buildMcpServer instances share one queue without any seam. The `createQueueSpy` called-once assertion is true by construction (createServer runs once). The seam adds an optional field to the kernel-node createServer's ctx and a `defaultCreateQueue` import alias only for this one test.
>
> | Option | What happens |
> |---|---|
> | A (recommended) | Remove `ctx.createQueue` and the `defaultCreateQueue` alias from src/server.ts. Rewrite the T036 shared-queue test in src/server.protocol.test.ts to spy on `app.queue.run` (two clients, two calls, runSpy called twice on the one returned queue). Amend plan.md's kernel-node bullet and the T036 task text to match. One fewer kernel-node touch, same proof. |
> | B | Keep the seam exactly as plan.md / T036 specify. No change. |
>
> Recommended: A. It deletes a test-only parameter from the composition root and still proves FR-053 through the object the server already exposes. The plan named the seam only as the means to that proof, not as a requirement of its own.

**Advisor** (escalate: none):

> A
>
> Remove `ctx.createQueue` and the `defaultCreateQueue` alias. Prove the shared queue by spying on `app.queue.run`: two clients, two calls, one queue. Update the plan.md kernel-node bullet and the T036 text to match. This replaces the U1 seam advice from the analyze pass.
> Rationale: BI-0165 A3 only requires the single-flight queue to stay shared. The spy on the returned queue proves that through the server's existing surface, without a test-only field on `createServer` (Constitution Principle I).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended a footer HTML comment recording the PR 3 F2 clarification: drop the ctx.createQueue seam and prove the shared queue with a spy on app.queue.run.

**Sent to the step:**

> A
>
> Remove `ctx.createQueue` and the `defaultCreateQueue` alias. Prove the shared queue by spying on `app.queue.run`: two clients, two calls, one queue. Update the plan.md kernel-node bullet and the T036 text to match. This replaces the U1 seam advice from the analyze pass.
> Rationale: BI-0165 A3 only requires the single-flight queue to stay shared. The spy on the returned queue proves that through the server's existing surface, without a test-only field on `createServer` (Constitution Principle I).

## 3. record / record-in-vault (2026-10-30T00:47:24.867Z)

**Question (verbatim):**

> The work for job BI-0165 is now a reviewed, documented pull request. Record that on the job's note, following the vault's conventions for backlog items:
> - the spec branch: 068-pr3-sdk-v2
> - the feature folder in the code repository: specs/068-modernise-mcp-surface
> - the pull request: https://github.com/marwansaab/obsidian-cli-mcp/pull/89 (number 89)
> - the status that means "in review" in this vault (if the vault has no such status, escalate `decision` with up to 3 choices)
> - a dated HTML comment saying Relay run obsidian-cli-mcp-bi-0165-pr3-2026-10-30 produced it.
>
> Dry run: no. In a dry run, change nothing: list each edit you would make in `vault_edits`, starting its change with "Would". Otherwise list each edit you made.

**Advisor** (escalate: none):

> PR #89 is recorded on the BI-0165 note.
> - **Spec branch:** frontmatter `spec_branch` now reads `068-pr3-sdk-v2`. It replaces `068-pr2-exec-gate`, which is still named in the PR 2 Status paragraph and its audit comment.
> - **Status:** stays `in-review`, the vault's BI value for "in review". `updated` was already 2026-10-30.
> - **Status section:** a dated 2026-10-30 paragraph says PR 3 of 6 (A2 SDK v2 / dual-era stdio, C3 normaliser retired) is in review. It links https://github.com/marwansaab/obsidian-cli-mcp/pull/89 (#89), branch `068-pr3-sdk-v2`, and feature folder `specs/068-modernise-mcp-surface`.
> - **Audit comment:** a dated footer comment says Relay run obsidian-cli-mcp-bi-0165-pr3-2026-10-30 produced it.

Sources: `000-Meta/Vault Frontmatter Convention.md`, `000-Meta/Templates/Backlog Item Template.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Changed frontmatter spec_branch from 068-pr2-exec-gate to 068-pr3-sdk-v2.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Added to the Status section a paragraph dated 2026-10-30: PR 3 of 6 is in review, with the PR #89 link, branch 068-pr3-sdk-v2 and feature folder specs/068-modernise-mcp-surface.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0165 - Ship 0.9.0 SDK V2 And Safety Release.md`: Appended a footer comment dated 2026-10-30: Relay run obsidian-cli-mcp-bi-0165-pr3-2026-10-30 produced PR #89, and status stays in-review.

**Sent to the step:**

> PR #89 is recorded on the BI-0165 note.
> - **Spec branch:** frontmatter `spec_branch` now reads `068-pr3-sdk-v2`. It replaces `068-pr2-exec-gate`, which is still named in the PR 2 Status paragraph and its audit comment.
> - **Status:** stays `in-review`, the vault's BI value for "in review". `updated` was already 2026-10-30.
> - **Status section:** a dated 2026-10-30 paragraph says PR 3 of 6 (A2 SDK v2 / dual-era stdio, C3 normaliser retired) is in review. It links https://github.com/marwansaab/obsidian-cli-mcp/pull/89 (#89), branch `068-pr3-sdk-v2`, and feature folder `specs/068-modernise-mcp-surface`.
> - **Audit comment:** a dated footer comment says Relay run obsidian-cli-mcp-bi-0165-pr3-2026-10-30 produced it.
