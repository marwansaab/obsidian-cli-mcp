# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0121-2026-11-04`, started 2026-11-03T23:07:10.111Z.

## 1. checks / preflight (2026-11-03T23:07:10.155Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0121. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0121 in the vault.
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

> Preflight passed. Ready for BI-0121.
>
> - **Vault id:** `my-setup`. It matches `expected_vault_id`, read from `000-Meta/Vault Identity.md` through obsidian-cli-mcp with vault `My-Setup-Vault`. All five CLAUDE.md session-start reads are done.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`
> - **Title:** BI-0121 — Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression
> - **Status:** `queued`. The work is not finished or abandoned, so the run can go ahead.
> - **Variant:** `bug-fix`
>
> Check results:
> 1. Vault identity: passed.
> 2. Backlog note found: passed.
> 3. Initiative is `[[Obsidian CLI MCP]]`: passed.
> 4. Status is queued, not finished: passed.
> 5. Variant is `bug-fix`: passed.
> 6. Prompt section: passed. There is no "/speckit-bug-assess prompt" section, but the "/speckit-specify prompt" section exists and describes the expected behaviour. It was rewritten 2026-11-03 for the 0.9.0 set of affected tools, and the note was not changed.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, using "BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression"). I also read the Constitution v1.5.1, the Architecture, ADR-003 and BI-0117, the bug this one depends on.
>
> Context for the assessment, all from the BI's Status section (not checks):
> - The bug fires only when the server's vault-name cache is cold, meaning the first call after a server start is an active-mode call. A cold lookup returns nothing, and the tool falls back to the vault's absolute folder path.
> - With a cold cache, two tools fail with `Vault not found.`:
>   - active-mode `prepend`
>   - `find_and_replace` given a `file` and no `vault`
> - Three tools only report the wrong `vault` value (the folder path instead of the display name): active-mode `append_note`, `patch_heading` and `patch_block`.
> - Not affected: `read`, `outline`, `rename`, `move`, `set_property` and `write_note`.
> - No test case exists yet that checks this cold-cache case.
> - The live cold-cache check needs a fresh server restart, which only the owner can do.
> - BI-0117 is marked shipped in 0.7.9, but its own notes say the code path did not change, so `prepend` is now part of this BI.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0117 - Fix Prepend Active Mode Vault Not Found.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools.md`, `000-Meta/MCP Tool Notes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Preflight passed. Ready for BI-0121.
>
> - **Vault id:** `my-setup`. It matches `expected_vault_id`, read from `000-Meta/Vault Identity.md` through obsidian-cli-mcp with vault `My-Setup-Vault`. All five CLAUDE.md session-start reads are done.
> - **Note:** `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`
> - **Title:** BI-0121 — Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression
> - **Status:** `queued`. The work is not finished or abandoned, so the run can go ahead.
> - **Variant:** `bug-fix`
>
> Check results:
> 1. Vault identity: passed.
> 2. Backlog note found: passed.
> 3. Initiative is `[[Obsidian CLI MCP]]`: passed.
> 4. Status is queued, not finished: passed.
> 5. Variant is `bug-fix`: passed.
> 6. Prompt section: passed. There is no "/speckit-bug-assess prompt" section, but the "/speckit-specify prompt" section exists and describes the expected behaviour. It was rewritten 2026-11-03 for the 0.9.0 set of affected tools, and the note was not changed.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, using "BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression"). I also read the Constitution v1.5.1, the Architecture, ADR-003 and BI-0117, the bug this one depends on.
>
> Context for the assessment, all from the BI's Status section (not checks):
> - The bug fires only when the server's vault-name cache is cold, meaning the first call after a server start is an active-mode call. A cold lookup returns nothing, and the tool falls back to the vault's absolute folder path.
> - With a cold cache, two tools fail with `Vault not found.`:
>   - active-mode `prepend`
>   - `find_and_replace` given a `file` and no `vault`
> - Three tools only report the wrong `vault` value (the folder path instead of the display name): active-mode `append_note`, `patch_heading` and `patch_block`.
> - Not affected: `read`, `outline`, `rename`, `move`, `set_property` and `write_note`.
> - No test case exists yet that checks this cold-cache case.
> - The live cold-cache check needs a fresh server restart, which only the owner can do.
> - BI-0117 is marked shipped in 0.7.9, but its own notes say the code path did not change, so `prepend` is now part of this BI.

## 2. assess / bug-assess (2026-11-03T23:08:04.555Z)

**Question (verbatim):**

> Return the bug report for job BI-0121 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0121`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0121
>
> ## Impact
> Latent regression risk across the active-mode surfaces of five typed tools (0.9.0 source): a hard `Vault not found.` failure on `prepend` (active mode) and on `find_and_replace` with a `file` locator and no `vault`, and a wrong `vault` value — the vault's absolute folder path instead of its display name — in the responses of `append_note`, `patch_heading` and `patch_block`. The bug fires only on a cold registry cache — every caller-session that has issued ANY prior specific-mode call against a registered vault primes the cache and masks the bug. In practice:
>
> - **Caller-flow exposure varies.** Sessions where the first call against a vault is an active-mode call (a natural "operate on the note I have open" pattern) hit the bug. Sessions where the first call is specific-mode (e.g. listing a folder, reading a named note) prime the cache and never see the bug. The bug surfaces non-deterministically from a caller's perspective unless the caller knows about the priming requirement.
> - **Cohort consistency is currently asymmetric.** Sibling typed tools' active-mode surfaces are documented as a uniform pattern (see [[ADR-003 - Enforce Target Mode in Typed Tools]]). The bug breaks this uniformity: agents who learn from one tool's behaviour cannot rely on the same behaviour from another. Since 0.9.0 the file-path tools (`read`, `outline`, `rename`, `move`) are immune while the write cohort is not, which widens the asymmetry.
> - **Diagnosis cost compounds.** Without BI-0117's bisect findings, each cohort tool's vault-not-found failure would have to be re-bisected independently. This BI's audit + TC artefacts collapse that cost to a single sweep.
>
> The bug is not safety-critical in the BI-0117 sense (no silent corruption, no host-process crash) — the cohort tools fail loud-ish with a misleading-but-recoverable error. Tier-2 / 02-medium impact reflects the latent + conditional nature; were any cohort tool the only active-mode path for its operation (no specific-mode alternative), the tier would rise.
>
> ## Status and evidence
> *Re-validated 2026-11-03 against @marwansaab/obsidian-cli-mcp@0.9.0-local:* partly valid — the latent defect is still in the code, but the set of tools it affects has changed. Not re-checked live: needs owner — the probe needs a fresh server process whose very first call is the active-mode call, and this session's server was already primed (the `vaults` tool and every named-vault lookup fill the vault-name cache, and nothing empties it); restarting the server is an owner action. Read-only source check of `main` (0.9.0, HEAD `0189e0c`):
>
> - **Mechanism unchanged.** The registry's reverse lookup (`resolveVaultDisplayName`, now `src/vault-registry/registry.ts:107-113`) is still synchronous and returns `null` on a cold cache, and nothing fills the cache at server start-up. The `?? base` fallback now lives once, in `resolveVaultDisplayName` in `src/tools/_active-file.ts`, which `resolveActiveLocatorWithVault` uses for the active mode of `append_note`, `prepend`, `patch_block` and `patch_heading`.
> - **Hard failure still latent** (the vault's absolute folder path is sent to Obsidian as `vault=` and answered `Vault not found.`): active-mode `prepend`, which forwards the looked-up name to the CLI `prepend` command; and `find_and_replace` with a `file` locator and no `vault`, which forwards it to the CLI `file` lookup. [[BI-0117 - Fix Prepend Active Mode Vault Not Found|BI-0117]] is marked shipped in 0.7.9 on two passing [[TC-00446 - Prepend Active Mode Writes Focused Note|TC-00446]] runs, but its own 2026-05-27 notes record a source-versus-empirical mismatch (the code path had not changed), so those runs most likely had a primed cache. BI-0117's ship does not protect `prepend`; this BI now carries it.
> - **Wrong response value only:** `append_note`, `patch_heading` and `patch_block` write through the filesystem in active mode and never send the looked-up name to Obsidian, so a cold cache would only put the absolute folder path in the response's `vault` field instead of the display name.
> - **Immune — ticked off:** `set_property` (takes the vault name from Obsidian's own answer), `write_note` (no `vault` in its response), and — since [[BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes|BI-0060]] shipped in 0.9.0 — `read`, `outline`, `rename` and `move`, whose active mode sends no `vault=` and never consults the lookup (the BI-0060 advisor ruling recorded at the foot of this page landed).
> - **No cold-cache TC exists** yet for any tool in the cohort.
> - The 0.9.0 cohort is therefore `prepend` and `find_and_replace` (failure) plus `append_note`, `patch_heading` and `patch_block` (wrong `vault` value). The fix options are unchanged: make the reverse lookup fill the cache on demand (BI-0117 fix path 1), or stop sending a looked-up name to Obsidian (BI-0060's shape) and fail loud when a response name cannot be resolved (fix path 2). The `obsidian.exe` / `Obsidian.com` side finding below was not re-checked. The `/speckit-specify` prompt below was rewritten for the new cohort.
>
> *Queued — validation needs owner (2026-10-31):* restart the `obsidian-cli-mcp-local` server (fresh process, registry cache cold), focus a note in `TestVault-Obsidian-CLI-MCP`, and make the VERY FIRST call of the lifetime an active-mode `prepend` (then, each in its own fresh restart, active-mode `append_note`, `patch_heading`, `patch_block`, and `find_and_replace` with `file` and no `vault`) — no prior `vaults` / specific-mode call, since `vaults` and any `resolveVaultPath` prime the cache. Record success vs `Vault not found.` and the envelope's `vault` value. (Read-only source check of 0.9.0: registry `resolveVaultDisplayName` is still synchronous-non-priming and the `?? base` fallback now lives centrally in `src/tools/_active-file.ts`; `prepend` and `find_and_replace` (file locator, no vault) still feed the fallback into CLI argv — likely still latent; `append_note` / `patch_heading` / `patch_block` are fs-direct, so a cold cache would only put the absolute path in the envelope `vault` field; `set_property` uses the eval-returned vault name and is immune.)
>
> *New* — filed 2026-05-26 (evening) as the cohort follow-up to [[BI-0117 - Fix Prepend Active Mode Vault Not Found|BI-0117]]'s confirmed root cause. Claude Code's active-mode bisect (`obsidian-cli-mcp/specs/045-prepend-note/active-mode-bisect-2026-05-26.md`) traced the prepend failure to a wrapper-layer pattern that is structurally shared across the cohort:
>
> 1. **Handler-side `?? parsed.base` fallback.** When a typed tool's active-mode resolution calls `deps.vaultRegistry.resolveVaultDisplayName(parsed.base)` and the registry returns `null` (cold cache), the handler falls through to `vaultDisplayName: reverseLookup ?? parsed.base`, smuggling the absolute filesystem path into the `vault=` argv element.
> 2. **Registry-side synchronous-non-priming `resolveVaultDisplayName`.** `src/vault-registry/registry.ts:78-84` (lines 107–113 in 0.9.0) returns `null` immediately on a cold in-memory cache without issuing the `obsidian vaults verbose` probe, so the cache stays cold until SOME prior specific-mode call primes it via `resolveVaultPath`.
>
> The `prepend` bisect proved the pattern fires deterministically on `prepend` and is suppressed by any prior specific-mode call in the MCP-server lifetime. The cohort sweep is required because the same handler-to-registry pattern is documented (registry.ts:14 comment names `patch_heading`) or strongly suspected (`append_note`, `set_property`) in sibling tools. Until empirically tested under cold-cache conditions, the cohort tools' active-mode surfaces carry latent vault-not-found regression risk identical to BI-0117's.
>
> **Scope of this BI** — verify and (if confirmed) remediate the cohort. At filing, three sibling tools were in scope: `append_note`, `patch_heading`, `set_property`. As of the 2026-11-03 re-validation above, the cohort is `prepend`, `find_and_replace` (`file` locator, no `vault`), `append_note`, `patch_heading` and `patch_block`; `set_property` is immune. Each needs:
>
> 1. **Cold-cache active-mode probe.** Spin a fresh MCP-server lifetime (no prior specific-mode calls), invoke the tool's active-mode surface against a focused note, observe whether the call returns the same `CLI_REPORTED_ERROR "Vault not found."` envelope BI-0117 documents. Record the result. (Note: `append_note` is fs-direct per [[BI-0008 - Add Append Note]] and may bypass the CLI entirely — verify whether its active-mode resolution path still touches the registry; if it does not, this tool is structurally immune and can be ticked off.)
> 2. **Source-code audit.** Grep the wrapper-repo source for the `?? parsed.base` fallback pattern across every handler with an active-mode branch. Enumerate every consumer of `resolveVaultDisplayName`. Cross-reference against the bisect report's named consumers (the registry.ts:14 comment names `patch_heading`).
> 3. **Regression-lock TC.** For each cohort tool that empirically reproduces the bug, file a sibling TC under the relevant feature folder (analogous to TC-00446's shape — cold-cache active-mode against a focused note, expects success). For cohort tools that pass empirically, file a regression-lock TC anyway so the fix in BI-0117 doesn't drift.
>
> **Relationship to BI-0117's primary fix path.** BI-0117's Amendment identifies three fix paths in priority order. Fix path 1 (async auto-prime in registry) is a one-place change that would automatically eliminate this entire cohort's latent exposure — every consumer of `resolveVaultDisplayName` becomes safe simultaneously. Fix path 2 (defensive secondary, fail-loud on null reverse-lookup in the handler) must be applied per-handler if the project chooses defence in depth — that is the work this BI tracks. Fix path 3 (architectural alternative, per-handler) is also per-handler work this BI would track. The plan-stage decision on BI-0117 determines how much per-handler work this BI carries: if fix path 1 lands cleanly, this BI degrades to verification-only; if fix paths 2 or 3 are chosen, this BI carries the per-handler change-set across the cohort.
>
> **Side-finding worth a Tool Notes entry (carry-over from BI-0117 Amendment).** `obsidian.exe` and `Obsidian.com` behave differently on a cache-cold `vault=<abs-FS-path>` input: `.exe` silently crashes with exit 4294967295; `.com` returns `Vault not found.\n` with exit 0. The wrapper resolves to `.com` on Windows today, so the user-visible failure mode is the latter — but a future host with only `.exe` on PATH would surface `CLI_NON_ZERO_EXIT (4294967295)` instead of `CLI_REPORTED_ERROR ("Vault not found.")` from the same root cause. The cohort sweep should record which failure-mode shape each cohort tool surfaces under each binary entry-point (probe under both if practical).
>
> ## Expected behaviour
> /speckit-specify Stabilise focused-vault operations
>
> ## Feature
> Operations that act on the note or vault currently focused in Obsidian behave the same whether they are the first call the server handles or a later one: they act on the focused vault and report that vault by its display name.
>
> ## Why
> Today, if the first call after the server starts adds text to the top of the focused note, or replaces text in a note given by name without naming a vault, it can fail with "vault not found" although the vault is open. Some other edits to the focused note report the vault's folder location instead of its name. The same calls work once any call that names a vault has run, so the failure looks random and agents learn to make a pointless warm-up call.
>
> ## User stories
> - As an agent, I want my first call in a fresh session to edit the focused note successfully, so that I do not need a warm-up call.
> - As an agent, I want to replace text in a note given by name, without naming a vault, as my first call, so that it works on the focused vault exactly as it does later.
> - As an agent, I want every edit to the focused note to report the vault by its display name, so that I can reuse that name in later calls.
> - As an agent, I want a clear failure that names the real problem when the focused vault genuinely cannot be identified, so that I am never told an open vault was not found.
> - As a maintainer, I want the first-call behaviour of each of these operations confirmed for every release, so that a later change cannot bring the failure back unnoticed.
>
> ## Acceptance criteria
>
> **Story: first-call edit of the focused note**
> - Given a fresh session with no earlier calls and a note focused in a registered vault, when the agent's first call adds text to the top of the focused note, then the text is written and the response names the vault by its display name.
> - Given the same fresh-session conditions, when the first call adds text to the end of the focused note, replaces a heading's section in it or replaces a block in it, then the edit succeeds and the response names the vault by its display name, not its folder location.
> - Given an earlier call has already named a vault, when the same edits run, then the results are the same as in a fresh session.
>
> **Story: first-call replace in a named note in the focused vault**
> - Given a fresh session and a registered vault focused in Obsidian, when the agent's first call previews a replacement in a note given by name without naming a vault, then the note is found in the focused vault and the preview is returned.
>
> **Story: unchanged behaviour elsewhere**
> - Given no note is focused, when any of these edits targets the focused note, then the existing no-active-note failure is returned, unchanged.
> - Given operations that already behave the same on a first call (reading, outlining, renaming and moving the focused file, setting a property on it, rewriting it), when they run first in a fresh session, then their behaviour is unchanged.
>
> **Story: genuinely unidentifiable vault**
> - Given the focused vault cannot be matched to any vault Obsidian lists, when one of these operations runs, then it fails with a clear message naming that state, never a "vault not found" failure caused by passing on the vault's folder location.
>
> **Story: confirmed for each release**
> - Given each operation in scope, when its fresh-session scenario is checked for a release, then the result matches the scenarios above.
>
> ## Out of scope
> - Adding focused-note support to operations that do not have it.
> - Changing any operation's inputs.
> - Operations that already behave the same on a first call (reading, outlining, renaming, moving, setting a property, rewriting a note).
> - How Obsidian itself answers a request that names an unknown vault.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0121
>
> ## Impact
> Latent regression risk across the active-mode surfaces of five typed tools (0.9.0 source): a hard `Vault not found.` failure on `prepend` (active mode) and on `find_and_replace` with a `file` locator and no `vault`, and a wrong `vault` value — the vault's absolute folder path instead of its display name — in the responses of `append_note`, `patch_heading` and `patch_block`. The bug fires only on a cold registry cache — every caller-session that has issued ANY prior specific-mode call against a registered vault primes the cache and masks the bug. In practice:
>
> - **Caller-flow exposure varies.** Sessions where the first call against a vault is an active-mode call (a natural "operate on the note I have open" pattern) hit the bug. Sessions where the first call is specific-mode (e.g. listing a folder, reading a named note) prime the cache and never see the bug. The bug surfaces non-deterministically from a caller's perspective unless the caller knows about the priming requirement.
> - **Cohort consistency is currently asymmetric.** Sibling typed tools' active-mode surfaces are documented as a uniform pattern (see [[ADR-003 - Enforce Target Mode in Typed Tools]]). The bug breaks this uniformity: agents who learn from one tool's behaviour cannot rely on the same behaviour from another. Since 0.9.0 the file-path tools (`read`, `outline`, `rename`, `move`) are immune while the write cohort is not, which widens the asymmetry.
> - **Diagnosis cost compounds.** Without BI-0117's bisect findings, each cohort tool's vault-not-found failure would have to be re-bisected independently. This BI's audit + TC artefacts collapse that cost to a single sweep.
>
> The bug is not safety-critical in the BI-0117 sense (no silent corruption, no host-process crash) — the cohort tools fail loud-ish with a misleading-but-recoverable error. Tier-2 / 02-medium impact reflects the latent + conditional nature; were any cohort tool the only active-mode path for its operation (no specific-mode alternative), the tier would rise.
>
> ## Status and evidence
> *Re-validated 2026-11-03 against @marwansaab/obsidian-cli-mcp@0.9.0-local:* partly valid — the latent defect is still in the code, but the set of tools it affects has changed. Not re-checked live: needs owner — the probe needs a fresh server process whose very first call is the active-mode call, and this session's server was already primed (the `vaults` tool and every named-vault lookup fill the vault-name cache, and nothing empties it); restarting the server is an owner action. Read-only source check of `main` (0.9.0, HEAD `0189e0c`):
>
> - **Mechanism unchanged.** The registry's reverse lookup (`resolveVaultDisplayName`, now `src/vault-registry/registry.ts:107-113`) is still synchronous and returns `null` on a cold cache, and nothing fills the cache at server start-up. The `?? base` fallback now lives once, in `resolveVaultDisplayName` in `src/tools/_active-file.ts`, which `resolveActiveLocatorWithVault` uses for the active mode of `append_note`, `prepend`, `patch_block` and `patch_heading`.
> - **Hard failure still latent** (the vault's absolute folder path is sent to Obsidian as `vault=` and answered `Vault not found.`): active-mode `prepend`, which forwards the looked-up name to the CLI `prepend` command; and `find_and_replace` with a `file` locator and no `vault`, which forwards it to the CLI `file` lookup. [[BI-0117 - Fix Prepend Active Mode Vault Not Found|BI-0117]] is marked shipped in 0.7.9 on two passing [[TC-00446 - Prepend Active Mode Writes Focused Note|TC-00446]] runs, but its own 2026-05-27 notes record a source-versus-empirical mismatch (the code path had not changed), so those runs most likely had a primed cache. BI-0117's ship does not protect `prepend`; this BI now carries it.
> - **Wrong response value only:** `append_note`, `patch_heading` and `patch_block` write through the filesystem in active mode and never send the looked-up name to Obsidian, so a cold cache would only put the absolute folder path in the response's `vault` field instead of the display name.
> - **Immune — ticked off:** `set_property` (takes the vault name from Obsidian's own answer), `write_note` (no `vault` in its response), and — since [[BI-0060 - Widen Hardcoded Md Extension Support To Obsidian Native Filetypes|BI-0060]] shipped in 0.9.0 — `read`, `outline`, `rename` and `move`, whose active mode sends no `vault=` and never consults the lookup (the BI-0060 advisor ruling recorded at the foot of this page landed).
> - **No cold-cache TC exists** yet for any tool in the cohort.
> - The 0.9.0 cohort is therefore `prepend` and `find_and_replace` (failure) plus `append_note`, `patch_heading` and `patch_block` (wrong `vault` value). The fix options are unchanged: make the reverse lookup fill the cache on demand (BI-0117 fix path 1), or stop sending a looked-up name to Obsidian (BI-0060's shape) and fail loud when a response name cannot be resolved (fix path 2). The `obsidian.exe` / `Obsidian.com` side finding below was not re-checked. The `/speckit-specify` prompt below was rewritten for the new cohort.
>
> *Queued — validation needs owner (2026-10-31):* restart the `obsidian-cli-mcp-local` server (fresh process, registry cache cold), focus a note in `TestVault-Obsidian-CLI-MCP`, and make the VERY FIRST call of the lifetime an active-mode `prepend` (then, each in its own fresh restart, active-mode `append_note`, `patch_heading`, `patch_block`, and `find_and_replace` with `file` and no `vault`) — no prior `vaults` / specific-mode call, since `vaults` and any `resolveVaultPath` prime the cache. Record success vs `Vault not found.` and the envelope's `vault` value. (Read-only source check of 0.9.0: registry `resolveVaultDisplayName` is still synchronous-non-priming and the `?? base` fallback now lives centrally in `src/tools/_active-file.ts`; `prepend` and `find_and_replace` (file locator, no vault) still feed the fallback into CLI argv — likely still latent; `append_note` / `patch_heading` / `patch_block` are fs-direct, so a cold cache would only put the absolute path in the envelope `vault` field; `set_property` uses the eval-returned vault name and is immune.)
>
> *New* — filed 2026-05-26 (evening) as the cohort follow-up to [[BI-0117 - Fix Prepend Active Mode Vault Not Found|BI-0117]]'s confirmed root cause. Claude Code's active-mode bisect (`obsidian-cli-mcp/specs/045-prepend-note/active-mode-bisect-2026-05-26.md`) traced the prepend failure to a wrapper-layer pattern that is structurally shared across the cohort:
>
> 1. **Handler-side `?? parsed.base` fallback.** When a typed tool's active-mode resolution calls `deps.vaultRegistry.resolveVaultDisplayName(parsed.base)` and the registry returns `null` (cold cache), the handler falls through to `vaultDisplayName: reverseLookup ?? parsed.base`, smuggling the absolute filesystem path into the `vault=` argv element.
> 2. **Registry-side synchronous-non-priming `resolveVaultDisplayName`.** `src/vault-registry/registry.ts:78-84` (lines 107–113 in 0.9.0) returns `null` immediately on a cold in-memory cache without issuing the `obsidian vaults verbose` probe, so the cache stays cold until SOME prior specific-mode call primes it via `resolveVaultPath`.
>
> The `prepend` bisect proved the pattern fires deterministically on `prepend` and is suppressed by any prior specific-mode call in the MCP-server lifetime. The cohort sweep is required because the same handler-to-registry pattern is documented (registry.ts:14 comment names `patch_heading`) or strongly suspected (`append_note`, `set_property`) in sibling tools. Until empirically tested under cold-cache conditions, the cohort tools' active-mode surfaces carry latent vault-not-found regression risk identical to BI-0117's.
>
> **Scope of this BI** — verify and (if confirmed) remediate the cohort. At filing, three sibling tools were in scope: `append_note`, `patch_heading`, `set_property`. As of the 2026-11-03 re-validation above, the cohort is `prepend`, `find_and_replace` (`file` locator, no `vault`), `append_note`, `patch_heading` and `patch_block`; `set_property` is immune. Each needs:
>
> 1. **Cold-cache active-mode probe.** Spin a fresh MCP-server lifetime (no prior specific-mode calls), invoke the tool's active-mode surface against a focused note, observe whether the call returns the same `CLI_REPORTED_ERROR "Vault not found."` envelope BI-0117 documents. Record the result. (Note: `append_note` is fs-direct per [[BI-0008 - Add Append Note]] and may bypass the CLI entirely — verify whether its active-mode resolution path still touches the registry; if it does not, this tool is structurally immune and can be ticked off.)
> 2. **Source-code audit.** Grep the wrapper-repo source for the `?? parsed.base` fallback pattern across every handler with an active-mode branch. Enumerate every consumer of `resolveVaultDisplayName`. Cross-reference against the bisect report's named consumers (the registry.ts:14 comment names `patch_heading`).
> 3. **Regression-lock TC.** For each cohort tool that empirically reproduces the bug, file a sibling TC under the relevant feature folder (analogous to TC-00446's shape — cold-cache active-mode against a focused note, expects success). For cohort tools that pass empirically, file a regression-lock TC anyway so the fix in BI-0117 doesn't drift.
>
> **Relationship to BI-0117's primary fix path.** BI-0117's Amendment identifies three fix paths in priority order. Fix path 1 (async auto-prime in registry) is a one-place change that would automatically eliminate this entire cohort's latent exposure — every consumer of `resolveVaultDisplayName` becomes safe simultaneously. Fix path 2 (defensive secondary, fail-loud on null reverse-lookup in the handler) must be applied per-handler if the project chooses defence in depth — that is the work this BI tracks. Fix path 3 (architectural alternative, per-handler) is also per-handler work this BI would track. The plan-stage decision on BI-0117 determines how much per-handler work this BI carries: if fix path 1 lands cleanly, this BI degrades to verification-only; if fix paths 2 or 3 are chosen, this BI carries the per-handler change-set across the cohort.
>
> **Side-finding worth a Tool Notes entry (carry-over from BI-0117 Amendment).** `obsidian.exe` and `Obsidian.com` behave differently on a cache-cold `vault=<abs-FS-path>` input: `.exe` silently crashes with exit 4294967295; `.com` returns `Vault not found.\n` with exit 0. The wrapper resolves to `.com` on Windows today, so the user-visible failure mode is the latter — but a future host with only `.exe` on PATH would surface `CLI_NON_ZERO_EXIT (4294967295)` instead of `CLI_REPORTED_ERROR ("Vault not found.")` from the same root cause. The cohort sweep should record which failure-mode shape each cohort tool surfaces under each binary entry-point (probe under both if practical).
>
> ## Expected behaviour
> /speckit-specify Stabilise focused-vault operations
>
> ## Feature
> Operations that act on the note or vault currently focused in Obsidian behave the same whether they are the first call the server handles or a later one: they act on the focused vault and report that vault by its display name.
>
> ## Why
> Today, if the first call after the server starts adds text to the top of the focused note, or replaces text in a note given by name without naming a vault, it can fail with "vault not found" although the vault is open. Some other edits to the focused note report the vault's folder location instead of its name. The same calls work once any call that names a vault has run, so the failure looks random and agents learn to make a pointless warm-up call.
>
> ## User stories
> - As an agent, I want my first call in a fresh session to edit the focused note successfully, so that I do not need a warm-up call.
> - As an agent, I want to replace text in a note given by name, without naming a vault, as my first call, so that it works on the focused vault exactly as it does later.
> - As an agent, I want every edit to the focused note to report the vault by its display name, so that I can reuse that name in later calls.
> - As an agent, I want a clear failure that names the real problem when the focused vault genuinely cannot be identified, so that I am never told an open vault was not found.
> - As a maintainer, I want the first-call behaviour of each of these operations confirmed for every release, so that a later change cannot bring the failure back unnoticed.
>
> ## Acceptance criteria
>
> **Story: first-call edit of the focused note**
> - Given a fresh session with no earlier calls and a note focused in a registered vault, when the agent's first call adds text to the top of the focused note, then the text is written and the response names the vault by its display name.
> - Given the same fresh-session conditions, when the first call adds text to the end of the focused note, replaces a heading's section in it or replaces a block in it, then the edit succeeds and the response names the vault by its display name, not its folder location.
> - Given an earlier call has already named a vault, when the same edits run, then the results are the same as in a fresh session.
>
> **Story: first-call replace in a named note in the focused vault**
> - Given a fresh session and a registered vault focused in Obsidian, when the agent's first call previews a replacement in a note given by name without naming a vault, then the note is found in the focused vault and the preview is returned.
>
> **Story: unchanged behaviour elsewhere**
> - Given no note is focused, when any of these edits targets the focused note, then the existing no-active-note failure is returned, unchanged.
> - Given operations that already behave the same on a first call (reading, outlining, renaming and moving the focused file, setting a property on it, rewriting it), when they run first in a fresh session, then their behaviour is unchanged.
>
> **Story: genuinely unidentifiable vault**
> - Given the focused vault cannot be matched to any vault Obsidian lists, when one of these operations runs, then it fails with a clear message naming that state, never a "vault not found" failure caused by passing on the vault's folder location.
>
> **Story: confirmed for each release**
> - Given each operation in scope, when its fresh-session scenario is checked for a release, then the result matches the scenarios above.
>
> ## Out of scope
> - Adding focused-note support to operations that do not have it.
> - Changing any operation's inputs.
> - Operations that already behave the same on a first call (reading, outlining, renaming, moving, setting a property, rewriting a note).
> - How Obsidian itself answers a request that names an unknown vault.

## 3. assess / bug-assess (2026-11-03T23:12:56.384Z)

**Question (verbatim):**

> Q1 — Fix shape
>
> Context: CodeGraph shows that the registry's `resolveVaultDisplayName` (src/vault-registry/registry.ts:107) returns null on a cold cache. The forward lookup `resolveVaultPath` (registry.ts:88) runs the single-flight `probe()` when it misses. The shared helper `resolveVaultDisplayName` (src/tools/_active-file.ts:207) has callers in `resolveActiveLocatorWithVault` (used by `resolveFsTarget` for append_note, prepend, patch_block and patch_heading) and in `find_and_replace`'s `resolveSingleNoteScope` (handler.ts:487).
>
> | Option | Description |
> |---|---|
> | A | When the reverse lookup misses, it probes once with the existing single-flight `probe()`, the same way `resolveVaultPath` does (068 FR-037). The helper becomes async and fails loud when the result is null, and never returns the folder path. prepend keeps sending `vault=<name>`, which is now always a registered name. No other handler changes. |
> | B | A, plus the BI-0060 shape for active-mode prepend and the find_and_replace `file` lookup: send `path=` with no `vault=`, as read, outline, rename and move do. This changes two tools' argv and the tests that pin it. |
> | C | Fail loud only, with no probe (BI-0117 fix path 2 alone). A cold first call would then always fail with the new error. |
>
> Recommended: A. It is a change in one place that fixes all five tools, and the response `vault` field still needs the lookup under B anyway. C contradicts the first-call acceptance criteria. B adds argv churn and satisfies no extra criterion.

**Advisor** (escalate: none):

> 1. A. On null after probe: fail loud with an existing typed error (BI-0117 fix path 2: VALIDATION_ERROR naming the unregistered base path). No new top-level code. If the probe itself fails: propagate the probe's error, leave the cache unset, and re-probe on the next call.
>
> Rationale: BI-0117's Amendment ranks the registry auto-prime first and the fail-loud second, and BI-0121's Status keeps both options open. A satisfies the first-call criteria in the specify prompt as well as the "genuinely unidentifiable vault" criterion. Constitution IV allows no new top-level codes. The Architecture's vault-registry caching rule: the cache is set only on a successful probe, and the next call retries.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0117 - Fix Prepend Active Mode Vault Not Found.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`: Appended a dated HTML-comment audit line recording the advisor's Q1 answer (option A: auto-prime + fail loud on null, existing error code, probe failure propagates), marked as an advisor answer, not an owner ruling.

**Sent to the step:**

> 1. A. On null after probe: fail loud with an existing typed error (BI-0117 fix path 2: VALIDATION_ERROR naming the unregistered base path). No new top-level code. If the probe itself fails: propagate the probe's error, leave the cache unset, and re-probe on the next call.
>
> Rationale: BI-0117's Amendment ranks the registry auto-prime first and the fail-loud second, and BI-0121's Status keeps both options open. A satisfies the first-call criteria in the specify prompt as well as the "genuinely unidentifiable vault" criterion. Constitution IV allows no new top-level codes. The Architecture's vault-registry caching rule: the cache is set only on a successful probe, and the next call retries.

## 4. assess / bug-assess (2026-11-03T23:13:21.696Z)

**Question (verbatim):**

> Q2 — Failure classification when the focused vault matches no vault Obsidian lists
>
> Context: per Principle IV, the new throw site in `_active-file.ts` must use an existing top-level code. The neighbouring precedent is `remapVaultNotFound` (_active-file.ts:307), which maps an unknown vault name to `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "unknown", vault }`. The acceptance criteria say this case must never look like a "vault not found" failure caused by passing the folder location.
>
> | Option | Description |
> |---|---|
> | A | `CLI_REPORTED_ERROR` with `details: { reason: "focused-vault-unregistered", base: <folder path> }` (an ADR-015 sub-discriminator). The message names the state and the remedy, for example: "<tool>: the focused vault's folder does not match any vault Obsidian lists; pass `vault` or reopen the vault in Obsidian." |
> | B | `CLI_REPORTED_ERROR` with the cohort triple `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered", base }`. It shares the existing VAULT_NOT_FOUND family, but the label is "vault not found", which the acceptance criteria warn against. |
> | C | `VALIDATION_ERROR`. Rejected in principle, because the caller's input is valid and the state comes from Obsidian. |
>
> Recommended: A. It is a distinct, specific failure on an existing code, and it does not reuse the "vault not found" label.

**Advisor** (escalate: none):

> 2. Use `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`. Add `reason` as a new ADR-015 value on the existing VAULT_NOT_FOUND pair. The message names the state and the remedy, e.g. "<tool>: the focused vault's folder matches no vault Obsidian lists; call in specific mode with `vault`, or re-open the vault in Obsidian." Put no absolute disk path in the message or in `details` (drop `base`). List the new reason in the error roster of each affected tool's docs/tools page. This replaces the VALIDATION_ERROR rider in the Q1 answer.
>
> Rationale:
> - ADR-015 keeps the category in `details.code` and puts the sub-state in `reason`. Option A's reason-only shape has no `details.code`, which breaks that pattern.
> - BI-0185 (same fs-direct tools) already uses `VAULT_NOT_FOUND`/`folder-missing` and treats disk paths in errors as a leak.
> - The acceptance criterion bans a "vault not found" failure *caused by passing on the folder location*. A message that names the real state meets it.

Sources: `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`: Appended a dated HTML-comment audit line recording the advisor's Q2 answer (CLI_REPORTED_ERROR / VAULT_NOT_FOUND / reason focused-unregistered, no disk path, roster row per ADR-015), marked as an advisor answer, replacing the Q1 VALIDATION_ERROR rider.

**Sent to the step:**

> 2. Use `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`. Add `reason` as a new ADR-015 value on the existing VAULT_NOT_FOUND pair. The message names the state and the remedy, e.g. "<tool>: the focused vault's folder matches no vault Obsidian lists; call in specific mode with `vault`, or re-open the vault in Obsidian." Put no absolute disk path in the message or in `details` (drop `base`). List the new reason in the error roster of each affected tool's docs/tools page. This replaces the VALIDATION_ERROR rider in the Q1 answer.
>
> Rationale:
> - ADR-015 keeps the category in `details.code` and puts the sub-state in `reason`. Option A's reason-only shape has no `details.code`, which breaks that pattern.
> - BI-0185 (same fs-direct tools) already uses `VAULT_NOT_FOUND`/`folder-missing` and treats disk paths in errors as a leak.
> - The acceptance criterion bans a "vault not found" failure *caused by passing on the folder location*. A message that names the real state meets it.

## 5. assess / bug-assess (2026-11-03T23:14:00.110Z)

**Question (verbatim):**

> Q3 — Approval to edit existing tests (refactor-decisions item 5)
>
> Context: seven existing tests pin today's fallback, and the fix necessarily changes what they expect. The list: src/vault-registry/registry.test.ts:310 ("returns null when the cache has not been primed" → it probes once and returns the name); src/tools/_active-file.test.ts:255 and :261 (the helper falls back to the base path, with the method returning null and with the method absent → it throws the new error); src/tools/append_note/handler.test.ts:952, src/tools/prepend/handler.test.ts:792, src/tools/patch_block/handler.test.ts:799 and src/tools/patch_heading/handler.test.ts:747 ("envelope falls back to the base path" → it fails with the new error and nothing is written). The interface is widened to `string | null | Promise<string | null>`, so the other synchronous stubs compile unchanged.
>
> | Option | Description |
> |---|---|
> | A | Approve exactly these seven edits and nothing else. If any other existing test fails during the fix, stop and raise it for review. Do not edit that test. |
> | B | Approve these seven, plus any active-mode test that turns out to use a stub registry returning null or omitting the method, as long as only its expected `vault` or error changes. |
> | C | No approval: keep the fallback tests and find another approach. |
>
> Recommended: A. The search found exactly these seven. Any further failure would be a surprise worth seeing.

**Advisor** (escalate: decision: The developer is asking for approval to edit seven existing tests. Only the owner can approve edits to existing tests, and no owner ruling on this job covers them yet.):

> 3. A. Approve exactly these seven edits:
> - registry.test.ts:310
> - _active-file.test.ts:255 and :261
> - the four handler "falls back to the base path" tests (append_note :952, prepend :792, patch_block :799, patch_heading :747)
>
> Each edit changes only the expected result: the reverse lookup now probes and returns the name, or the call fails with `CLI_REPORTED_ERROR`/`VAULT_NOT_FOUND`/`focused-unregistered` and nothing is written. If any other existing test fails, stop and raise it. Do not edit it.
>
> Rationale: these seven tests pin the folder-path fallback that the BI-0121 fix removes (Q1 option A, Q2 classification). Constitution II requires the changed behaviour to be tested in the same change. This is a recommendation only: edits to existing tests need the owner's approval.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0117 - Fix Prepend Active Mode Vault Not Found.md`

**Advisor, after the owner ruled** (escalate: none):

> 3. A. Owner approved option A: these seven tests only.
>
> The seven tests:
> - registry.test.ts:310
> - _active-file.test.ts:255 and :261
> - append_note handler.test.ts:952
> - prepend handler.test.ts:792
> - patch_block handler.test.ts:799
> - patch_heading handler.test.ts:747
>
> Change only each test's expected result. Either the lookup probes and returns the name, or the call fails with `CLI_REPORTED_ERROR`/`VAULT_NOT_FOUND`/`focused-unregistered` and nothing is written. If any other existing test fails, stop and raise it. Do not edit it.
>
> Ruling recorded on BI-0121.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`: Appended a dated HTML-comment audit line recording the owner's Q3 ruling: approve option A, exactly the seven named existing-test edits (expectation changes only); any other failing existing test is to be stopped and raised, not edited.

**Owner:** choice 1 (Approve A: these seven only), via cli, 2026-11-04T00:06:19.960Z.

**Sent to the step:**

> 3. A. Owner approved option A: these seven tests only.
>
> The seven tests:
> - registry.test.ts:310
> - _active-file.test.ts:255 and :261
> - append_note handler.test.ts:952
> - prepend handler.test.ts:792
> - patch_block handler.test.ts:799
> - patch_heading handler.test.ts:747
>
> Change only each test's expected result. Either the lookup probes and returns the name, or the call fails with `CLI_REPORTED_ERROR`/`VAULT_NOT_FOUND`/`focused-unregistered` and nothing is written. If any other existing test fails, stop and raise it. Do not edit it.
>
> Ruling recorded on BI-0121.

## 6. assess / bug-assess (2026-11-04T00:06:34.778Z)

**Question (verbatim):**

> Q4 — Live cold-cache confirmation
>
> Context: the defect only shows on a fresh server process whose very first call is the active-mode call. `vaults` and any named-vault lookup prime the cache, and nothing empties it. Restarting the obsidian-cli-mcp-local server is an owner action. The unit tests will wire the real `createVaultRegistry` with a stub probe to cover the cold path in process.
>
> | Option | Description |
> |---|---|
> | A | Live check in /speckit-bug-test only, on the fixed build. The owner restarts the server five times. Each time, the first call is one cohort tool against a note focused in TestVault-Obsidian-CLI-MCP: active-mode prepend, append_note, patch_heading and patch_block, then find_and_replace with `file` and no `vault`. Each must succeed and report `vault: "TestVault-Obsidian-CLI-MCP"`. The live pre-fix reproduction is skipped, because the source and the pinned tests already prove it. |
> | B | A, plus a live pre-fix reproduction on the current build before the fix (five more restarts). |
> | C | No live check. The in-process cold-cache tests are the only evidence. |
>
> Recommended: A. It gives the release-level confirmation the BI asks for, at the lowest owner cost.

**Advisor** (escalate: scope: Option A drops the live pre-fix probe that the BI's scope item 1 lists for each tool, and it commits the owner to five server restarts. Only the owner can narrow the scope or commit their own time.):

> 4. A, with one addition: when the run is recorded, name the TCs for the five checks as the regression-lock TCs the BI asks for, one per cohort tool.
>
> The live check runs in /speckit-bug-test on the fixed build. The owner restarts the server once per tool, and the first call each time is that cohort tool against a note focused in TestVault-Obsidian-CLI-MCP:
> - active-mode prepend
> - active-mode append_note
> - active-mode patch_heading
> - active-mode patch_block
> - find_and_replace with `file` and no `vault`
>
> Each call must succeed and report `vault: "TestVault-Obsidian-CLI-MCP"`. Skip the live pre-fix reproduction. The unit tests cover the cold path in process, using the real `createVaultRegistry` with a stub probe.
>
> Rationale:
> - The specify prompt's "confirmed for each release" criterion asks for a check after the fix, and A meets it.
> - The BI's 2026-11-03 re-validation already confirmed the defect from the source, so the pre-fix probe in scope item 1 adds no new evidence.
> - Scope item 3 asks for one regression-lock TC per cohort tool.
> - The server restarts are an owner action (BI Status), so the live checks depend on the owner's time.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0185 - Return Structured Error When Named Vault Folder Is Missing.md`

**Advisor, after the owner ruled** (escalate: none):

> 4. A. The owner ruled: live check after the fix only.
>
> The live check runs in /speckit-bug-test on the fixed build. The owner restarts the server once per tool, and the first call each time is that tool against a note focused in TestVault-Obsidian-CLI-MCP:
> - active-mode prepend
> - active-mode append_note
> - active-mode patch_heading
> - active-mode patch_block
> - find_and_replace with `file` and no `vault`
>
> Each call must succeed and report `vault: "TestVault-Obsidian-CLI-MCP"`. Skip the live pre-fix reproduction. The in-process cold-cache unit tests cover the cold path: the real `createVaultRegistry` with a stub probe. The five checks after the fix serve as the BI's regression-lock TCs, one per tool (scope item 3).
>
> The ruling is recorded on BI-0121.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`: Appended a dated HTML-comment audit line recording the owner's Q4 ruling: post-fix live cold-cache check only (five owner restarts, one per cohort tool, expect success + display-name vault), pre-fix live reproduction dropped, the five checks serve as scope item 3's regression-lock TCs.

**Owner:** choice 1 (A: live check post-fix only), via cli, 2026-11-04T00:07:36.468Z.

**Sent to the step:**

> 4. A. The owner ruled: live check after the fix only.
>
> The live check runs in /speckit-bug-test on the fixed build. The owner restarts the server once per tool, and the first call each time is that tool against a note focused in TestVault-Obsidian-CLI-MCP:
> - active-mode prepend
> - active-mode append_note
> - active-mode patch_heading
> - active-mode patch_block
> - find_and_replace with `file` and no `vault`
>
> Each call must succeed and report `vault: "TestVault-Obsidian-CLI-MCP"`. Skip the live pre-fix reproduction. The in-process cold-cache unit tests cover the cold path: the real `createVaultRegistry` with a stub probe. The five checks after the fix serve as the BI's regression-lock TCs, one per tool (scope item 3).
>
> The ruling is recorded on BI-0121.

## 7. assess / bug-assess (2026-11-04T00:09:00.864Z)

**Question (verbatim):**

> Q5 — Four more existing tests break under the approved design (my test list missed them)
>
> Context: the Q1 ruling makes the registry's reverse lookup probe when it misses, so both the registry method and the `_active-file.ts` helper must become async. The Q3 approval covers seven tests. These four also break, and Q3 says to stop and raise them:
> - `src/vault-registry/registry.test.ts:172` ("returns the registered display name for a known basePath") and `:189` ("returns null for an unknown basePath"). Both call `reg.resolveVaultDisplayName!(...)` synchronously and compare the returned value with `toBe`, so after the change they would compare a Promise. The fix only adds `await`. The expected values ("TestVault-Obsidian-CLI-MCP", "The Setup", null) stay the same.
> - `src/tools/_active-file.test.ts:245` ("returns the registry display name when one resolves"): the same issue for the helper. The fix only adds `await`. The expected value "My Vault" stays the same.
> - `src/tools/_active-file.test.ts:225` (`resolveActiveLocatorWithVault` "falls back to the base path when the registry has no display name"): this test pins the fallback itself. Its expected result changes to `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`.
>
> | Option | Description |
> |---|---|
> | A | Approve these four as well, for 11 in total. For 172, 189 and 245, the only change is adding `await`, with the same expected values. For 225, the only change is the flip to the fail-loud expectation. Any other failing test: stop and raise it. |
> | B | Keep the registry's `resolveVaultDisplayName` synchronous and cache-only, and add a separate optional async registry method (for example `refreshVaultNames()`) that the helper calls before the lookup. Then 172, 189 and 310 stay unchanged, but 225 and 245 still break, and the registry interface gains a second method just to avoid touching tests. |
> | C | Something else (please describe). |
>
> Recommended: A. Three of the edits are mechanical, adding `await` with unchanged expected values. The fourth is the same fallback flip you already approved for 255 and 261. B adds interface surface only to avoid touching tests, and it does not avoid all of them.

**Advisor** (escalate: decision: The developer wants to edit four more existing tests. Only the owner can approve that, and the Q3 ruling approved exactly seven and said to stop and raise any others.):

> 5. A. Approve the four extra edits, for 11 in total:
> - registry.test.ts:172 and :189, and _active-file.test.ts:245: add `await` only. Expected values stay the same ("TestVault-Obsidian-CLI-MCP", "The Setup", null, "My Vault").
> - _active-file.test.ts:225: change only the expected result, to `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`.
>
> If any other existing test fails, stop and raise it. Do not edit it.
>
> Rationale:
> - Making the lookup async is how the Q1 answer works (option A: probe on a miss).
> - 225 is the same fallback change already approved for :255/:261 (Q3 ruling), with the Q2 classification.
> - Option B adds a second registry method only to avoid editing tests, and still breaks 225 and 245.
>
> This is a recommendation: the Q3 ruling approved exactly seven tests, so these four need the owner's own approval.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> 5. A. The owner approved these four as well, so 11 existing-test edits are approved in total.
>
> - `registry.test.ts:172` and `:189`, and `_active-file.test.ts:245`: add `await` only. The expected values stay the same.
> - `_active-file.test.ts:225`: change only the expected result, to `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`.
>
> If any other existing test fails, stop and raise it. Do not edit it.
>
> The ruling is recorded on BI-0121.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0121 - Sweep Active Mode Cold Cache Cohort For Vault Not Found Regression.md`: Appended a dated HTML-comment audit line recording the owner's Q5 ruling: four more existing-test edits approved (11 total) — registry.test.ts:172/:189 and _active-file.test.ts:245 add `await` only, _active-file.test.ts:225 flips to the focused-unregistered failure; any other failing test is to be stopped and raised.

**Owner:** choice 1 (Approve A: these four too (11)), via cli, 2026-11-04T00:47:17.887Z.

**Sent to the step:**

> 5. A. The owner approved these four as well, so 11 existing-test edits are approved in total.
>
> - `registry.test.ts:172` and `:189`, and `_active-file.test.ts:245`: add `await` only. The expected values stay the same.
> - `_active-file.test.ts:225`: change only the expected result, to `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`.
>
> If any other existing test fails, stop and raise it. Do not edit it.
>
> The ruling is recorded on BI-0121.
