# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0172-2026-11-02`, started 2026-11-02T09:32:36.119Z.

## 1. checks / preflight (2026-11-02T09:32:36.164Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0172. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0172 in the vault.
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

> Primed for BI-0172 — Classify Move Missing Destination Folder Error.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-015, move feature page (FEAT-019), Obsidian CLI MCP Tool Notes (`move` section). Session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> Role: BA + Solution Architect, answering for Claude Code.
> Skill: `anthropic-skills:speckit-clarify-skill` loaded.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`).
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`. Title: "BI-0172 — Classify Move Missing Destination Folder Error".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, which is neither finished nor abandoned. Tier must-fix-bug, variant bug-fix, complexity 01-low.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists and the prompt starts with `/speckit-specify Classify missing destination`, the exact dash form. Note left unchanged.
> 6. Clarify skill: PASS. Loaded with the reference "BI-0172 - Classify Move Missing Destination Folder Error". Its answer rules apply to every question that follows.
>
> Awaiting clarification questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `move (FEAT-019 feature page)`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Primed for BI-0172 — Classify Move Missing Destination Folder Error.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-015, move feature page (FEAT-019), Obsidian CLI MCP Tool Notes (`move` section). Session-start reads done (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> Role: BA + Solution Architect, answering for Claude Code.
> Skill: `anthropic-skills:speckit-clarify-skill` loaded.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which equals `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`).
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`. Title: "BI-0172 — Classify Move Missing Destination Folder Error".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, which is neither finished nor abandoned. Tier must-fix-bug, variant bug-fix, complexity 01-low.
> 5. Specify prompt: PASS. The `## /speckit-specify prompt` section exists and the prompt starts with `/speckit-specify Classify missing destination`, the exact dash form. Note left unchanged.
> 6. Clarify skill: PASS. Loaded with the reference "BI-0172 - Classify Move Missing Destination Folder Error". Its answer rules apply to every question that follows.
>
> Awaiting clarification questions.

## 2. pre-implementation / specify (2026-11-02T09:33:25.655Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0172's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Classify missing destination
>
> ## Feature
> When an agent moves a note into a folder that does not exist, the failure is reported as a clear, typed "destination folder not found" error that names the folder by its vault-relative path.
>
> ## Why
> Moving a note into a missing folder currently fails with the operating system's raw error text, which exposes the vault's absolute location on disk and gives the agent no stable signal to act on. The equivalent failure for a missing source note is already reported clearly.
>
> ## User stories
> - As an agent, I want a distinct, machine-readable signal when the destination folder is missing, so that I can create the folder and retry.
> - As an operator, I want tool errors to contain no absolute disk paths of my vault, so that my machine's folder layout is not exposed.
>
> ## Acceptance criteria
>
> **Story: typed failure**
> - Given a destination folder that does not exist, when an agent moves a note there, then the move fails with a stable destination-folder-not-found signal and the note stays where it was.
> - Given that failure, when the agent reads it, then it names the missing folder by its vault-relative path.
>
> **Story: no absolute paths**
> - Given any move failure, when the error is returned, then it contains no absolute disk paths.
>
> **Story: distinguishable failures**
> - Given a missing source note and, separately, a missing destination folder, when each move fails, then the two failures are distinguishable by a stable signal.
>
> ## Out of scope
> - Creating missing destination folders automatically.
> - Link-rewriting behaviour after a successful move.
> - Rename failures.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`

**Sent to the step:**

> /speckit-specify Classify missing destination
>
> ## Feature
> When an agent moves a note into a folder that does not exist, the failure is reported as a clear, typed "destination folder not found" error that names the folder by its vault-relative path.
>
> ## Why
> Moving a note into a missing folder currently fails with the operating system's raw error text, which exposes the vault's absolute location on disk and gives the agent no stable signal to act on. The equivalent failure for a missing source note is already reported clearly.
>
> ## User stories
> - As an agent, I want a distinct, machine-readable signal when the destination folder is missing, so that I can create the folder and retry.
> - As an operator, I want tool errors to contain no absolute disk paths of my vault, so that my machine's folder layout is not exposed.
>
> ## Acceptance criteria
>
> **Story: typed failure**
> - Given a destination folder that does not exist, when an agent moves a note there, then the move fails with a stable destination-folder-not-found signal and the note stays where it was.
> - Given that failure, when the agent reads it, then it names the missing folder by its vault-relative path.
>
> **Story: no absolute paths**
> - Given any move failure, when the error is returned, then it contains no absolute disk paths.
>
> **Story: distinguishable failures**
> - Given a missing source note and, separately, a missing destination folder, when each move fails, then the two failures are distinguishable by a stable signal.
>
> ## Out of scope
> - Creating missing destination folders automatically.
> - Link-rewriting behaviour after a successful move.
> - Rename failures.

## 3. pre-implementation / clarify (2026-11-02T09:35:50.544Z)

**Question (verbatim):**

> **Question:** When a move fails, which absolute disk paths must be kept out of the error the agent receives? (FR-005)
>
> **Why it matters:** This sets how far the privacy fix reaches and what the "no absolute paths" acceptance test searches for. The widest reading changes a shared layer that every tool uses, not just `move`.
>
> **Context (from the code index):** A move failure reported by the CLI arrives as `CLI_REPORTED_ERROR`. Its `details` carry the CLI's raw `stdout`, `stderr` and `argv` (`src/cli-adapter/cli-adapter.ts:158`). For a missing destination folder that raw text is where the vault's absolute location leaks. Separately, the shared binary resolver puts the searched install paths and the whole `PATH` environment variable into `CLI_BINARY_NOT_FOUND` details (`src/binary-resolver/binary-resolver.ts:52`), for every tool, not just `move`. The draft spec assumes the guarantee covers only the vault's location and anything inside it.
>
> **Recommended:** Option A - It protects what the operator story asks for (where the vault lives), keeps the change inside `move`, and leaves the install diagnostics operators need to fix a missing CLI. Those diagnostics name program locations, not vault contents.
>
> | Option | Description |
> |--------|-------------|
> | A | Vault paths only: no move failure may contain the vault's absolute location or the absolute path of anything inside it. This covers the message and every `details` field, raw CLI `stdout`/`stderr`/`argv` included. Install diagnostics (`CLI_BINARY_NOT_FOUND` search paths, `PATH`) stay as they are. |
> | B | Every absolute path: no move failure may contain any absolute disk path, install diagnostics included. That means changing the shared binary-not-found failure, which every tool shares. |
> | C | Missing-destination failure only: just the new destination-folder-not-found failure must be free of absolute paths. Other move failures are left as they are. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md#Impact`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md#/speckit-specify prompt (operator user story)`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md#Pipeline elements (CLI_BINARY_NOT_FOUND diagnostics)`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`: Appended a dated audit comment recording the clarify ruling: FR-005 covers vault paths only (message and all details fields, raw stdout/stderr/argv included). CLI_BINARY_NOT_FOUND install diagnostics are out of scope.

**Sent to the step:**

> A

## 4. pre-implementation / clarify (2026-11-02T09:36:49.445Z)

**Question (verbatim):**

> **Question:** Which stable signal should a move into a missing destination folder carry? (FR-001, FR-008)
>
> **Why it matters:** Agents will branch on this exact value. It is fixed in tests and the help page, and changing it later breaks callers.
>
> **Context (from the code index):** Other tools already report a missing folder as top-level code `CLI_REPORTED_ERROR` with the sub-signal `details.code: "FOLDER_NOT_FOUND"` plus the folder's vault-relative path (`src/tools/pattern_search/handler.ts:84`; the `paths` eval envelope at `src/tools/paths/schema.ts:50` uses the same `FOLDER_NOT_FOUND` value). Today `move` reports a missing source note as `CLI_REPORTED_ERROR` with Obsidian's message and no `details.code` (`src/tools/move/handler.test.ts:314`). Constitution Principle IV rules out a new top-level code, so every option keeps `CLI_REPORTED_ERROR`.
>
> **Recommended:** Option A - It reuses the folder-not-found vocabulary agents already meet on this server. The destination is the only folder a move refers to, so the sub-code alone cannot be misread, and the missing source still differs because it has no `details.code`.
>
> | Option | Description |
> |--------|-------------|
> | A | Reuse the existing sub-code: `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"` and the missing folder's vault-relative path in details. The missing-source failure stays unchanged. |
> | B | New move-specific sub-code: `CLI_REPORTED_ERROR` with `details.code: "DESTINATION_FOLDER_NOT_FOUND"` and the folder's vault-relative path. It is more explicit, but it is a second name for a concept the server already names. |
> | C | Option A, and also tag the missing source: the missing-source failure additionally gets `details.code: "FILE_NOT_FOUND"` (an added field; its message stays the same), so both not-found failures carry an explicit sub-code. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> Use A. Carry the missing folder's vault-relative path in `details.folder`, the field `paths` already uses beside `FOLDER_NOT_FOUND`. Leave the missing-source failure unchanged. Add no `details.reason`.
>
> Rationale: the BI scopes the fix to the destination; its Why says the missing source is "already reported clearly". Reusing `FOLDER_NOT_FOUND` + `details.folder` follows ADR-015's rule against splitting the discriminator namespace. There is only one sub-state, so the ADR-015 test for `details.reason` is not met.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md#paths (v0.6.0+)`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md#IV. Explicit Upstream Error Propagation`

**Sent to the step:**

> Use A. Carry the missing folder's vault-relative path in `details.folder`, the field `paths` already uses beside `FOLDER_NOT_FOUND`. Leave the missing-source failure unchanged. Add no `details.reason`.
>
> Rationale: the BI scopes the fix to the destination; its Why says the missing source is "already reported clearly". Reusing `FOLDER_NOT_FOUND` + `details.folder` follows ADR-015's rule against splitting the discriminator namespace. There is only one sub-state, so the ADR-015 test for `details.reason` is not met.

## 5. pre-implementation / clarify (2026-11-02T09:37:41.891Z)

**Question (verbatim):**

> **Question:** When a move fails in a way the server does not recognise and the raw command-line text contains the vault's absolute location, what should the agent receive? (FR-005, User Story 2 scenario 3)
>
> **Why it matters:** Answer 1 promised that no move failure contains a vault path. This decides how that promise holds for failures nobody has classified yet, and how much of Obsidian's wording the agent keeps to diagnose them.
>
> **Context (from the code index):** A `CLI_REPORTED_ERROR` keeps the CLI's raw `stdout`, `stderr` and `message` in `details` (`src/cli-adapter/cli-adapter.ts:158`). The `move` handler's deps carry no vault registry (`src/tools/move/handler.ts:14`), and `resolveFileTarget` returns the vault's absolute folder only in active mode (`src/tools/_file-target.ts:37`). So rewriting paths in specific mode means looking up the vault's folder, which today only the direct-fs tools do (`resolveFsTarget`, `_file-target.ts:72`).
>
> **Recommended:** Option A - It keeps Obsidian's own wording, which is the agent's only clue to an unclassified failure, while honouring answer 1. Looking up the vault's folder is a step the direct-fs tools already take.
>
> | Option | Description |
> |--------|-------------|
> | A | Rewrite: replace every occurrence of the vault's absolute folder in the message and in every details field (including raw `stdout`/`stderr`) with the vault-relative form. This covers both path separators and, on Windows, letter case. The failure keeps its code and the rest of Obsidian's wording. |
> | B | Withhold: for unrecognised move failures, drop the raw `stdout`/`stderr` from details and return a generic message that names the vault-relative source and destination. Classified failures (missing source, destination exists, missing folder) keep their messages. Nothing can leak, but the diagnostic text is lost. |
> | C | Rewrite where the vault folder is found, and withhold the raw text when any other absolute path pattern remains after the rewrite. This is the most defensive option and the most complex to test. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md#IV. Explicit Upstream Error Propagation`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md#Pipeline elements (Filesystem-direct write path / vault-registry)`

**Sent to the step:**

> A

## 6. pre-implementation / plan (2026-11-02T09:47:37.196Z)

**Question (verbatim):**

> **Question:** Do you approve the existing-test edits X1–X6 that come from making `vaultRegistry` a required `move` dependency? (plan D6, contract §X)
>
> **Why it matters:** Refactor-decisions item 5 requires sign-off before any existing test is touched. Without these edits the existing `move` tests stop type-checking once the dependency is added.
>
> **Context (from the code index):** `move`'s `ExecuteDeps` (`src/tools/move/handler.ts:14`) has no registry today, and `server.ts:123` builds the tool from `{ logger, queue }`. In specific mode, the vault root that the path rewrite needs (Clarification Q3) comes from `vaultRegistry.resolveVaultPath`, called only after a failure. That is the same pattern spec 074 used for `read` (`src/tools/read/handler.ts:55-57`). The edits only add a field; no assertion, expected value, title or spawn queue changes:
> - X1: `move/handler.test.ts` imports `stubVaultRegistry` and adds `const REGISTRY = stubVaultRegistry("V", "/vaults/V")`.
> - X2: the `deps()` helper (lines 19–21) adds `vaultRegistry: REGISTRY`.
> - X3: the 25 inline `{ logger, queue, spawnFn, env }` literals in that file each add `vaultRegistry: REGISTRY`.
> - X4: `move/index.test.ts` imports `stubVaultRegistry`, and its four `createMoveTool({...})` literals (lines 20, 32, 43, 64) add a registry.
> - X5: `_typed-result-fixtures.ts:210` becomes `createMoveTool({ ...cli(…), vaultRegistry: registryAt("/vaults/MyVault") })`.
> - X6: `_plugin-noise.test.ts:230` becomes the same, with `registryAt(NOTE_ROOT)`.
>
> The stub root never appears in any existing test's CLI text, so every existing failure test still gets its original error object back. If any other existing test fails during implement, it stops and is raised to you.
>
> **Recommended:** Option A - The edits only add a field, the precedent is spec 074 (`read`), and a required dependency keeps production free of a test-only "no registry" branch.
>
> | Option | Description |
> |--------|-------------|
> | A | Approve X1–X6 exactly as listed (field additions only). Any other failing existing test stops implement for review. |
> | B | Reject. Make `vaultRegistry` optional on `move` instead, so no existing test changes. Production always passes it, but the handler needs a branch for a missing registry, and that branch only exists for tests. |
> | C | Reject. Derive the vault root from the absolute path in the CLI's error text, with no registry and no dependency change. This works only for Node fs-style error lines; other failures that echo the root would not be rewritten. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md#II. Public Surface Test Coverage (NON-NEGOTIABLE)`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md#Pipeline elements (Filesystem-direct write path — vault-registry resolveVaultPath)`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`

**Sent to the step:**

> A

## 7. pre-implementation / analyze (2026-11-02T09:51:37.961Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 3 issues?
>
> - **F1 (MEDIUM)**: tasks.md T009 expects "the default message" for M13. Today's unknown-vault error actually carries `message: "Vault not found."` (set by `runTyped`, `src/cli-adapter/cli-adapter.ts:154-159`).
> - **U1 (MEDIUM)**: research D5 / data-model R-f return the original, unscrubbed error on ANY registry lookup failure. A failed cold-cache `vaults` probe (timeout, app down) would therefore leak the vault root, against V2 / FR-005. Proposed fix: pass the original through only for the registry's not-registered `VALIDATION_ERROR` and rethrow any other lookup failure. Alternatively, record the residual explicitly.
> - **C1 (MEDIUM)**: the spec's Edge Case "Separators and case" promises that a backslash destination (`Archive\\2026\\Old.md`) reports `Archive/2026`, but no test row covers it. Proposed fix: add an M row for the full-path backslash form, or narrow the edge case.

**Advisor** (escalate: none):

> Yes. Apply all three:
>
> - **F1:** Fix T009. Expect `message: "Vault not found."`, the message unknown-vault errors carry today. The test asserts current behaviour; it changes none.
> - **U1:** Fix it; don't record a residual. Pass the original move failure through untouched only for the registry's not-registered `VALIDATION_ERROR`. On any other lookup failure, don't rethrow the lookup error in its place. Keep the move failure's code, withhold the raw `stdout`/`stderr`/`message`, name the vault-relative source and destination, and attach the lookup failure as `cause`. Add a test row for the probe-failure case.
> - **C1:** Add the M row for the full-path backslash destination (`Archive\\2026\\Old.md` reports `Archive/2026`). Keep the edge case as written.
>
> Rationale: the BI's clarification (FR-005) says no move failure may carry the vault's absolute location. A recorded residual would break that. Constitution Principle IV forbids masking the move failure behind the lookup error and asks that both failures be reported.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md#IV. Explicit Upstream Error Propagation`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md#Design-shaping constraints (Vault registry caching)`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`: Appended a dated audit comment: the vault-path guarantee holds even when the vault root lookup fails. Pass-through only for not-registered VALIDATION_ERROR; otherwise withhold raw text and attach the lookup failure as cause; no recorded residual.

**Sent to the step:**

> Yes. Apply all three:
>
> - **F1:** Fix T009. Expect `message: "Vault not found."`, the message unknown-vault errors carry today. The test asserts current behaviour; it changes none.
> - **U1:** Fix it; don't record a residual. Pass the original move failure through untouched only for the registry's not-registered `VALIDATION_ERROR`. On any other lookup failure, don't rethrow the lookup error in its place. Keep the move failure's code, withhold the raw `stdout`/`stderr`/`message`, name the vault-relative source and destination, and attach the lookup failure as `cause`. Add a test row for the probe-failure case.
> - **C1:** Add the M row for the full-path backslash destination (`Archive\\2026\\Old.md` reports `Archive/2026`). Keep the edge case as written.
>
> Rationale: the BI's clarification (FR-005) says no move failure may carry the vault's absolute location. A recorded residual would break that. Constitution Principle IV forbids masking the move failure behind the lookup error and asks that both failures be reported.
