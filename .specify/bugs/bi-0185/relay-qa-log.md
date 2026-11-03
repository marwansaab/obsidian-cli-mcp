# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0185-2026-11-04`, started 2026-11-03T21:29:09.405Z.

## 1. checks / preflight (2026-11-03T21:29:09.459Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0185. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0185 in the vault.
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

> Primed for BI-0185 - Return Structured Error When Named Vault Folder Is Missing.
>
> Readiness summary:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id`. I re-checked it this turn through `My-Setup-Vault`. The session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the Obsidian CLI MCP Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, so the work is not finished or abandoned.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. The note has a "/speckit-specify prompt" section; it has no "/speckit-bug-assess prompt" section. The specify prompt sets out the expected behaviour: a registered vault whose folder is missing returns a structured "vault unavailable" error with a specific code and a recovery hint. The unknown-vault error stays unchanged, available vaults behave as before, and no bare system error without a code is ever returned. I did not change the note.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, reference "BI-0185 - Return Structured Error When Named Vault Folder Is Missing"). I will follow its answering rules for every question that follows.
>
> Context read for the questions to come:
> - Constitution v1.5.1, Principle IV: errors must be typed `UpstreamError` objects with `code`, `cause` and `details`; a bare `throw` is not allowed.
> - ADR-015: use a `details.reason` sub-discriminator for error codes that have several states.
> - ADR-014, amended by ADR-045: `VAULT_NOT_FOUND(not-open)` is retired, and a vault that stays unavailable comes back as `CLI_REPORTED_ERROR`.
> - Architecture, "Canonical contracts" section.
> - Tool Notes entry for this bug: `query_base` returns a raw `ENOENT` error, while `paths` already returns a structured `CLI_REPORTED_ERROR`.
>
> Role: BA + Solution Architect, answering for Claude Code. Waiting for the bug-assessment questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-014 - Plugin-Backed Typed Tools Runtime-Dependency Pattern.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `220-Planning/Session Handover.md`

**Sent to the step:**

> Primed for BI-0185 - Return Structured Error When Named Vault Folder Is Missing.
>
> Readiness summary:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` has `vault_id` = `my-setup`, which matches `expected_vault_id`. I re-checked it this turn through `My-Setup-Vault`. The session-start reads are done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover and About This Vault, plus the Obsidian CLI MCP Tool Notes.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned`, so the work is not finished or abandoned.
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. The note has a "/speckit-specify prompt" section; it has no "/speckit-bug-assess prompt" section. The specify prompt sets out the expected behaviour: a registered vault whose folder is missing returns a structured "vault unavailable" error with a specific code and a recovery hint. The unknown-vault error stays unchanged, available vaults behave as before, and no bare system error without a code is ever returned. I did not change the note.
> 7. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, reference "BI-0185 - Return Structured Error When Named Vault Folder Is Missing"). I will follow its answering rules for every question that follows.
>
> Context read for the questions to come:
> - Constitution v1.5.1, Principle IV: errors must be typed `UpstreamError` objects with `code`, `cause` and `details`; a bare `throw` is not allowed.
> - ADR-015: use a `details.reason` sub-discriminator for error codes that have several states.
> - ADR-014, amended by ADR-045: `VAULT_NOT_FOUND(not-open)` is retired, and a vault that stays unavailable comes back as `CLI_REPORTED_ERROR`.
> - Architecture, "Canonical contracts" section.
> - Tool Notes entry for this bug: `query_base` returns a raw `ENOENT` error, while `paths` already returns a structured `CLI_REPORTED_ERROR`.
>
> Role: BA + Solution Architect, answering for Claude Code. Waiting for the bug-assessment questions.

## 2. assess / bug-assess (2026-11-03T21:32:38.719Z)

**Question (verbatim):**

> Return the bug report for job BI-0185 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0185`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0185
>
> ## Impact
> Every other failure from these tools is a typed `{code, message, details}` envelope that callers branch on. This one is an untyped string, so an agent cannot tell "vault folder missing" from an internal crash, has no recovery hint, and sees an absolute path from the host's file system in the message. A registered vault whose folder was moved, renamed or deleted (or sits on a disconnected drive) is a realistic state. `query_base`'s documented error roster does not list this case at all.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-03 with the owner's approval. Verified on `@marwansaab/obsidian-cli-mcp@0.9.0-local` (Obsidian 1.14.5) with [[TC-00727 - Registered Vault That Cannot Be Brought Up Returns Vault Unavailable Failure]] (fail): a scratch vault `OCM-Unavailable-Probe` was registered in Obsidian, then its folder was renamed on disk. `query_base` `{vault: "OCM-Unavailable-Probe", base_path: "x.base", view_name: "All"}` returned the raw string `ENOENT: no such file or directory, realpath 'C:\Users\sirzi\AppData\Local\Temp\OCM-Unavailable-Probe'` — no `code`, no `details`, and an absolute disk path. The tool never reached the CLI: its pre-flight resolution of the vault folder threw, and the Node error escaped untyped. Other tools that resolve a named vault's folder before running the same way (the Bases family and the fs-direct writers) are likely affected; confirm which during specification. `paths` on the same vault returned a structured `CLI_REPORTED_ERROR` (`stage: "json-parse"`), so it is not affected by this BI.
>
> ## Expected behaviour
> /speckit-specify Report missing vaults
>
> ## Feature
> When an agent targets a registered vault whose folder no longer exists on disk, the tool returns a clear, structured "vault unavailable" failure instead of a raw system error.
>
> ## Why
> Today a vault whose folder was moved or deleted makes some tools fail with a raw system error that has no error code, no recovery hint and exposes a full disk path. Agents cannot tell this apart from an internal crash, so they cannot recover or tell the user what to fix.
>
> ## User stories
> - As an agent, I want a call to a vault whose folder is missing to fail with a named error code, so that I can branch on it like any other failure.
> - As an agent, I want that failure to tell me what to do next, so that I can ask the user to restore or re-open the vault.
> - As a vault owner, I want error messages not to expose full disk paths unnecessarily, so that logs and transcripts don't leak my folder layout.
>
> ## Acceptance criteria
>
> **Story: missing vault folder gives a named failure**
> - Given a vault that is registered in Obsidian but whose folder has been renamed or deleted, when the agent runs a base view in it, then the call fails with the documented structured error shape carrying a specific code for an unavailable vault.
> - Given the same vault, when the agent calls any other tool that resolves the vault's folder before running, then it fails with the same code.
> - Given a vault name that is not registered at all, when the agent targets it, then the existing unknown-vault failure is returned, unchanged and distinct from the unavailable-vault failure.
> - Given an available vault, when the agent runs the same calls, then results are unchanged.
>
> **Story: the failure carries a recovery hint**
> - Given the unavailable-vault failure, when the agent reads its message, then it states that the vault's folder could not be found and suggests restoring the folder or re-opening the vault in Obsidian.
>
> **Story: no raw system errors**
> - Given any failure caused by the vault folder being missing, when the agent receives it, then it is never a bare system error string without a code.
>
> ## Out of scope
> - Automatically relocating, recreating or re-registering a missing vault.
> - Changing behaviour when Obsidian itself is not running (covered by auto-launch).
> - Changing the unknown-vault failure.
> - Tools that already return a structured failure for this case.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0185
>
> ## Impact
> Every other failure from these tools is a typed `{code, message, details}` envelope that callers branch on. This one is an untyped string, so an agent cannot tell "vault folder missing" from an internal crash, has no recovery hint, and sees an absolute path from the host's file system in the message. A registered vault whose folder was moved, renamed or deleted (or sits on a disconnected drive) is a realistic state. `query_base`'s documented error roster does not list this case at all.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-03 with the owner's approval. Verified on `@marwansaab/obsidian-cli-mcp@0.9.0-local` (Obsidian 1.14.5) with [[TC-00727 - Registered Vault That Cannot Be Brought Up Returns Vault Unavailable Failure]] (fail): a scratch vault `OCM-Unavailable-Probe` was registered in Obsidian, then its folder was renamed on disk. `query_base` `{vault: "OCM-Unavailable-Probe", base_path: "x.base", view_name: "All"}` returned the raw string `ENOENT: no such file or directory, realpath 'C:\Users\sirzi\AppData\Local\Temp\OCM-Unavailable-Probe'` — no `code`, no `details`, and an absolute disk path. The tool never reached the CLI: its pre-flight resolution of the vault folder threw, and the Node error escaped untyped. Other tools that resolve a named vault's folder before running the same way (the Bases family and the fs-direct writers) are likely affected; confirm which during specification. `paths` on the same vault returned a structured `CLI_REPORTED_ERROR` (`stage: "json-parse"`), so it is not affected by this BI.
>
> ## Expected behaviour
> /speckit-specify Report missing vaults
>
> ## Feature
> When an agent targets a registered vault whose folder no longer exists on disk, the tool returns a clear, structured "vault unavailable" failure instead of a raw system error.
>
> ## Why
> Today a vault whose folder was moved or deleted makes some tools fail with a raw system error that has no error code, no recovery hint and exposes a full disk path. Agents cannot tell this apart from an internal crash, so they cannot recover or tell the user what to fix.
>
> ## User stories
> - As an agent, I want a call to a vault whose folder is missing to fail with a named error code, so that I can branch on it like any other failure.
> - As an agent, I want that failure to tell me what to do next, so that I can ask the user to restore or re-open the vault.
> - As a vault owner, I want error messages not to expose full disk paths unnecessarily, so that logs and transcripts don't leak my folder layout.
>
> ## Acceptance criteria
>
> **Story: missing vault folder gives a named failure**
> - Given a vault that is registered in Obsidian but whose folder has been renamed or deleted, when the agent runs a base view in it, then the call fails with the documented structured error shape carrying a specific code for an unavailable vault.
> - Given the same vault, when the agent calls any other tool that resolves the vault's folder before running, then it fails with the same code.
> - Given a vault name that is not registered at all, when the agent targets it, then the existing unknown-vault failure is returned, unchanged and distinct from the unavailable-vault failure.
> - Given an available vault, when the agent runs the same calls, then results are unchanged.
>
> **Story: the failure carries a recovery hint**
> - Given the unavailable-vault failure, when the agent reads its message, then it states that the vault's folder could not be found and suggests restoring the folder or re-opening the vault in Obsidian.
>
> **Story: no raw system errors**
> - Given any failure caused by the vault folder being missing, when the agent receives it, then it is never a bare system error string without a code.
>
> ## Out of scope
> - Automatically relocating, recreating or re-registering a missing vault.
> - Changing behaviour when Obsidian itself is not running (covered by auto-launch).
> - Changing the unknown-vault failure.
> - Tools that already return a structured failure for this case.

## 3. assess / resolve-assessment (2026-11-03T21:36:51.346Z)

**Question (verbatim):**

> Question 1 of 4 — What should the new details.reason value be for a registered vault whose folder is missing?
>
> Context: the fix keeps the cohort's existing shape. `remapVaultNotFound` (src/tools/_active-file.ts:306) already emits `CLI_REPORTED_ERROR` with `details: {code: "VAULT_NOT_FOUND", reason: "unknown", vault}` for an unregistered name. ADR-015 adds a sub-state as a kebab-case `details.reason` under the existing discriminator, not as a new code. Separately, `src/tools/_shared.ts:42` already uses the words "vault unavailable" for a different state: a closed vault that cannot be brought up, which fails with `Error: Command "…" not found.`
>
> | Option | Value | Notes |
> |---|---|---|
> | A (recommended) | `"folder-missing"` | Says exactly what is wrong and what the fix is (restore the folder). Does not clash with the existing "vault unavailable" wording for a vault that cannot be brought up. |
> | B | `"unavailable"` | Matches the TC-00727 title ("Returns Vault Unavailable Failure"), but uses the same word as the cannot-be-brought-up state, which needs a different fix. |
> | C | `"missing-folder"` | Same meaning as A, different word order. |
>
> Recommended: A, `"folder-missing"`. It describes the state, follows ADR-015's kebab-case rule, and keeps the two "not reachable" fixes apart for agents.

**Advisor** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `200-Decisions/ADR-045 - Closed Vaults Recovered Only By The Dispatch Retry.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00727 - Registered Vault That Cannot Be Brought Up Returns Vault Unavailable Failure.md`

**Sent to the step:**

> A

## 4. assess / resolve-assessment (2026-11-03T21:37:22.889Z)

**Question (verbatim):**

> Question 2 of 4 — Where should the new failure be listed in each affected tool's error roster?
>
> Context: eight tools gain the failure (query_base, create_base, find_and_replace, write_note, append_note, prepend, patch_block, patch_heading). ADR-015 says each (code, reason) pair is listed in the per-tool docs (`docs/tools/<tool>.md`, which `help` serves word for word). Several of these tools' descriptions in `index.ts` also carry a partial "Typed errors via …" list. Those descriptions are published tool surface, fingerprinted by the FR-018 baseline (`_register-baseline.json`), so editing them is a deliberate surface change that needs `npm run baseline:write`.
>
> | Option | Scope | Notes |
> |---|---|---|
> | A (recommended) | `docs/tools/*.md` only, updated in the fix commit | Meets ADR-015 and the report's "query_base's documented error roster does not list this case". The published surface and the baseline stay put. |
> | B | `docs/tools/*.md` and each affected `index.ts` description | The roster is complete wherever it appears, but the published descriptions and baseline fingerprints of eight tools change. |
> | C | Leave all docs to `/speckit-docs-as-code` | The fix commit changes code only. Docs follow later in the same PR. |
>
> Recommended: A. It documents the pair where ADR-015 requires, ships the docs with the code, and leaves the published surface unchanged, since the descriptions' lists are already partial.

**Advisor** (escalate: conflict: BI-0185's Out of scope defers "error-roster and help wording for the new code" to BI-0174. ADR-015 (a constitution checklist gate) requires the new (code, reason) pair to be listed in each tool's docs/tools page, which help serves word for word. The owner should decide whether the roster rows ship with this fix.):

> A. Add the `(CLI_REPORTED_ERROR, VAULT_NOT_FOUND, folder-missing)` row to the `docs/tools/*.md` error roster of each affected tool, in the fix commit. Leave the `index.ts` descriptions and the baseline untouched. Rewording descriptions and help to match goes to BI-0174 once this lands.
>
> ADR-015 (Decision → closed-enum semantics; enforcement: code review checks reasons against the per-tool enumeration) requires each (code, reason) pair to be listed in `docs/tools/<tool>.md`. BI-0185's Out of scope sends "Error-roster and help wording for the new code" to BI-0174, so the two notes disagree on the roster rows. A satisfies ADR-015's gate and leaves the remaining wording work to BI-0174.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> Owner ruling, 2026-11-04: in this fix, add the `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `folder-missing` row to the `docs/tools/*.md` error roster of every affected tool, as ADR-015 requires. Do not change the `index.ts` descriptions or the baseline. The remaining description and help wording stays with BI-0174 (see the BI-0185 Out of scope section).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0174 - Reconcile Help And Description Drift After 0.9.0 Validation.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`: Out of scope bullet narrowed to description/help wording beyond the roster rows; added the owner ruling of 2026-11-04 that the docs/tools roster row for VAULT_NOT_FOUND / folder-missing ships with this fix per ADR-015, with index.ts descriptions and the baseline unchanged.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`: Frontmatter updated: 2026-11-03 → 2026-11-04.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`: Appended a dated HTML audit comment recording the owner ruling on Relay clarify Q2.

**Owner:** choice 1 (A: roster rows in this fix), via ntfy, 2026-11-03T21:38:26.723Z.

**Sent to the step:**

> A
>
> Owner ruling, 2026-11-04: in this fix, add the `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `folder-missing` row to the `docs/tools/*.md` error roster of every affected tool, as ADR-015 requires. Do not change the `index.ts` descriptions or the baseline. The remaining description and help wording stays with BI-0174 (see the BI-0185 Out of scope section).

## 5. assess / resolve-assessment (2026-11-03T21:38:56.479Z)

**Question (verbatim):**

> Question 3 of 4 — If the live check in /speckit-bug-test shows another route that still returns a raw system error for a missing vault folder, should it be fixed in this BI or recorded as a follow-up?
>
> Context: the routes to check are a `file` (note name) locator on write_note / append_note / prepend / patch_block / patch_heading, which runs `obsidian file` (via `resolveFileByTsv` / `findFileByTsv`) BEFORE the shared guard, and `bases` / `views_base`, which call only `resolveVaultRootOrRemap` and then the CLI. Whether they fail structured depends on what the CLI answers for a vault whose folder is gone. `paths` already returned a structured `CLI_REPORTED_ERROR` in TC-00727. The report puts tools that already fail structured out of scope.
>
> | Option | Handling | Notes |
> |---|---|---|
> | A (recommended) | Probe in /speckit-bug-test. A route that already fails structured stays as is. A route that escapes raw is recorded as a follow-up BI. | Keeps this fix to the one root cause the report proved (the shared guard), and the report's out-of-scope line covers the structured routes. |
> | B | Probe now. Extend this fix to any route that escapes raw. | One BI covers every route, but the fix could widen into CLI-answer classification that has not been assessed. |
> | C | No probe. Rely on the report's evidence alone. | Fastest. Leaves the report's "confirm which tools are affected" partly unanswered. |
>
> Recommended: A.

**Advisor** (escalate: none):

> 3. Probe every listed route. Leave a route that already fails with a structured error (any `UpstreamError` with a `code`) as it is. Fix any route that lets a raw system error escape in this BI, using the same `VAULT_NOT_FOUND` / `folder-missing` error. Do not reclassify CLI answers that are already structured; that stays out of scope.
>
> Basis: BI-0185's acceptance criteria. The "no raw system errors" story says a missing vault folder never produces a bare error string without a code. "Same code for any other tool that resolves the vault's folder" puts raw-escaping routes in scope. Its Out of scope section excludes only "tools that already return a structured failure for this case". Record each route's probe result in the spec. That answers the BI's "confirm which tools are affected" point.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00727 - Registered Vault That Cannot Be Brought Up Returns Vault Unavailable Failure.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Sent to the step:**

> 3. Probe every listed route. Leave a route that already fails with a structured error (any `UpstreamError` with a `code`) as it is. Fix any route that lets a raw system error escape in this BI, using the same `VAULT_NOT_FOUND` / `folder-missing` error. Do not reclassify CLI answers that are already structured; that stays out of scope.
>
> Basis: BI-0185's acceptance criteria. The "no raw system errors" story says a missing vault folder never produces a bare error string without a code. "Same code for any other tool that resolves the vault's folder" puts raw-escaping routes in scope. Its Out of scope section excludes only "tools that already return a structured failure for this case". Record each route's probe result in the spec. That answers the BI's "confirm which tools are affected" point.

## 6. assess / resolve-assessment (2026-11-03T21:39:11.192Z)

**Question (verbatim):**

> Question 4 of 4 — Should errors other than ENOENT from the vault-root check (for example EPERM, EIO or UNKNOWN, which Windows can return for a disconnected network or removable drive) also map to the new missing-folder failure?
>
> Context: `checkCanonicalPath` (src/path-safety/canonical.ts:37-59) swallows ENOENT only while walking up below an existing folder, and rethrows every other error. So after the fix, any non-ENOENT failure on the root still reaches `registerTool`, which rethrows anything that is not an `UpstreamError` or `ZodError`. Only ENOENT has been observed (TC-00727).
>
> | Option | Mapping | Notes |
> |---|---|---|
> | A (recommended) | ENOENT only. Rethrow every other error unchanged. Record the other errors as a follow-up if the live check shows one. | Matches the observed failure. Does not guess which errors mean "vault folder missing". |
> | B | ENOENT plus a fixed list (ENOTDIR, EIO, EPERM, UNKNOWN) | Covers more drive states, but EPERM can also mean a real permission problem, which would then be misreported as a missing folder. |
> | C | Any error from the root check | No raw string can escape this check, but every root failure gets the folder-missing hint, even ones with other causes. |
>
> Recommended: A.

**Advisor** (escalate: none):

> 4. Map ENOENT and ENOTDIR on the vault root to `VAULT_NOT_FOUND` / `folder-missing`. Do not rethrow other errnos (EPERM, EIO, UNKNOWN, …) raw: wrap each in an existing structured `UpstreamError` envelope that keeps the errno code in `details`, without the `folder-missing` reason or hint and without the absolute path in the message. Add no new code or reason for them. Record any errno the live check turns up in the spec.
>
> Basis: Constitution Principle IV says errors crossing the boundary MUST be `UpstreamError` with `code` / `cause` / `details`, so "rethrow unchanged" would leave a raw escape the fix is touching. BI-0185's user story keeps disk paths out of messages. Use the folder-missing hint only where the folder really is gone (ENOENT, or ENOTDIR when a path segment is not a folder), so a real permission or I/O fault is not misreported.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`

**Sent to the step:**

> 4. Map ENOENT and ENOTDIR on the vault root to `VAULT_NOT_FOUND` / `folder-missing`. Do not rethrow other errnos (EPERM, EIO, UNKNOWN, …) raw: wrap each in an existing structured `UpstreamError` envelope that keeps the errno code in `details`, without the `folder-missing` reason or hint and without the absolute path in the message. Add no new code or reason for them. Record any errno the live check turns up in the spec.
>
> Basis: Constitution Principle IV says errors crossing the boundary MUST be `UpstreamError` with `code` / `cause` / `details`, so "rethrow unchanged" would leave a raw escape the fix is touching. BI-0185's user story keeps disk paths out of messages. Use the folder-missing hint only where the folder really is gone (ENOENT, or ENOTDIR when a path segment is not a folder), so a real permission or I/O fault is not misreported.
