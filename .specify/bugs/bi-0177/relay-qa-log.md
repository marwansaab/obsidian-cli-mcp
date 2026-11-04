# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0177-2026-11-04`, started 2026-11-04T01:32:37.520Z.

## 1. checks / preflight (2026-11-04T01:32:37.563Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0177. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0177 in the vault.
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

> Primed for BI-0177 — Distinguish File Blocking Move Destination Folder.
> Read: BI-0177, Constitution (v1.5.1), Architecture (Pipeline elements, Canonical contracts), ADR-015; also BI-0172 (origin, spec 090), TC-00701 (evidence), Obsidian CLI MCP Tool Notes (`move` section).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`. Title: "BI-0177 — Distinguish File Blocking Move Destination Folder".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (not finished or abandoned).
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. No "/speckit-bug-assess prompt" section. A "/speckit-specify prompt" section is present ("Distinguish blocked destination"). It describes the expected behaviour: when a file sits where the destination folder should be, the error says a file has that name, gives no create-the-folder advice, leaks no absolute path and changes nothing on disk. A genuinely missing folder still returns `FOLDER_NOT_FOUND`. Note left unchanged.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, reference "BI-0177 - Distinguish File Blocking Move Destination Folder"). Its answering rules apply from now on.
>
> Context for the run: the origin BI-0172 (spec branch `090-classify-missing-destination`) shipped in 0.9.0. TC-00701 is the failing evidence: `FOLDER_NOT_FOUND` is returned when `to: "Fixtures/BI-0172/c07/Blocker.md/"` and `Blocker.md` is an existing note.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Primed for BI-0177 — Distinguish File Blocking Move Destination Folder.
> Read: BI-0177, Constitution (v1.5.1), Architecture (Pipeline elements, Canonical contracts), ADR-015; also BI-0172 (origin, spec 090), TC-00701 (evidence), Obsidian CLI MCP Tool Notes (`move` section).
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Readiness checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` `vault_id` = `my-setup`, which matches `expected_vault_id` `my-setup` (vault display name `My-Setup-Vault`). Session-start reads done: MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault.
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`. Title: "BI-0177 — Distinguish File Blocking Move Destination Folder".
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (not finished or abandoned).
> 5. Variant: PASS. `variant: bug-fix`.
> 6. Prompt section: PASS. No "/speckit-bug-assess prompt" section. A "/speckit-specify prompt" section is present ("Distinguish blocked destination"). It describes the expected behaviour: when a file sits where the destination folder should be, the error says a file has that name, gives no create-the-folder advice, leaks no absolute path and changes nothing on disk. A genuinely missing folder still returns `FOLDER_NOT_FOUND`. Note left unchanged.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, reference "BI-0177 - Distinguish File Blocking Move Destination Folder"). Its answering rules apply from now on.
>
> Context for the run: the origin BI-0172 (spec branch `090-classify-missing-destination`) shipped in 0.9.0. TC-00701 is the failing evidence: `FOLDER_NOT_FOUND` is returned when `to: "Fixtures/BI-0172/c07/Blocker.md/"` and `Blocker.md` is an existing note.

## 2. assess / bug-assess (2026-11-04T01:33:46.893Z)

**Question (verbatim):**

> Return the bug report for job BI-0177 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0177`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0177
>
> ## Impact
> Spec 090's edge case "Destination folder name exists as a file" says a destination whose folder segment names an existing file is not a missing folder and must not carry the destination-folder-not-found signal. The tool classifies it as `FOLDER_NOT_FOUND` anyway, and the recovery hint (create the folder, then retry) cannot be followed, because a file already holds that name. An agent acting on the hint will either fail to create the folder or loop. Low frequency — it needs a destination path that runs through a file name — but it is a plain contract violation of the spec BI-0172 just shipped, and the misleading recovery advice is the harm the classification was meant to remove.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0172 - Classify Move Missing Destination Folder Error]] (spec `090-classify-missing-destination`), which stays in review. Evidence: [[TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `move` with `path: "Fixtures/BI-0172/c07/MoveMe.md"` and `to: "Fixtures/BI-0172/c07/Blocker.md/"`, where `Blocker.md` is an existing note, returned `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, `details.folder: "Fixtures/BI-0172/c07/Blocker.md"` and a message saying that folder "does not exist in the vault" and advising the caller to create it and retry. No absolute path leaked and nothing changed on disk, so the other BI-0172 rules held.
>
> ## Expected behaviour
> /speckit-specify Distinguish blocked destination
>
> ## Feature
> When an agent moves a file to a destination whose folder part is actually the name of an existing file, the failure says that a file is in the way, rather than saying the folder does not exist.
>
> ## Why
> Today this case is reported as a missing destination folder, with advice to create the folder and try again. That advice cannot work, because a file already has that name, so an agent following it fails again or gives up without understanding why.
>
> ## User stories
> - As an agent, I want a move blocked by a file sitting where the destination folder should be to be reported as such, so that I can rename or remove that file, or pick another destination.
> - As an agent, I want a genuinely missing destination folder to keep being reported as missing, so that the existing recovery advice still applies there.
>
> ## Acceptance criteria
>
> **Story: file in the way of the destination folder**
> - Given a note "Blocker.md" exists, when the agent moves another note to "Blocker.md/" inside the same folder, then the move fails, the error does not say the destination folder is missing, and it states that an existing file has that name.
> - Given the same failure, when the agent reads the error's recovery advice, then it does not tell the agent to create the folder.
> - Given the same failure, when the agent inspects the error, then it contains no absolute disk path and neither file has changed.
>
> **Story: missing folder unchanged**
> - Given the destination folder does not exist and no file has its name, when the agent moves a note there, then the error still reports a missing destination folder, as today.
>
> ## Out of scope
> - Creating destination folders automatically.
> - Renaming or removing the blocking file.
> - Other move failures, such as an existing destination file.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0177
>
> ## Impact
> Spec 090's edge case "Destination folder name exists as a file" says a destination whose folder segment names an existing file is not a missing folder and must not carry the destination-folder-not-found signal. The tool classifies it as `FOLDER_NOT_FOUND` anyway, and the recovery hint (create the folder, then retry) cannot be followed, because a file already holds that name. An agent acting on the hint will either fail to create the folder or loop. Low frequency — it needs a destination path that runs through a file name — but it is a plain contract violation of the spec BI-0172 just shipped, and the misleading recovery advice is the harm the classification was meant to remove.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to [[BI-0172 - Classify Move Missing Destination Folder Error]] (spec `090-classify-missing-destination`), which stays in review. Evidence: [[TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND]] (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `move` with `path: "Fixtures/BI-0172/c07/MoveMe.md"` and `to: "Fixtures/BI-0172/c07/Blocker.md/"`, where `Blocker.md` is an existing note, returned `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, `details.folder: "Fixtures/BI-0172/c07/Blocker.md"` and a message saying that folder "does not exist in the vault" and advising the caller to create it and retry. No absolute path leaked and nothing changed on disk, so the other BI-0172 rules held.
>
> ## Expected behaviour
> /speckit-specify Distinguish blocked destination
>
> ## Feature
> When an agent moves a file to a destination whose folder part is actually the name of an existing file, the failure says that a file is in the way, rather than saying the folder does not exist.
>
> ## Why
> Today this case is reported as a missing destination folder, with advice to create the folder and try again. That advice cannot work, because a file already has that name, so an agent following it fails again or gives up without understanding why.
>
> ## User stories
> - As an agent, I want a move blocked by a file sitting where the destination folder should be to be reported as such, so that I can rename or remove that file, or pick another destination.
> - As an agent, I want a genuinely missing destination folder to keep being reported as missing, so that the existing recovery advice still applies there.
>
> ## Acceptance criteria
>
> **Story: file in the way of the destination folder**
> - Given a note "Blocker.md" exists, when the agent moves another note to "Blocker.md/" inside the same folder, then the move fails, the error does not say the destination folder is missing, and it states that an existing file has that name.
> - Given the same failure, when the agent reads the error's recovery advice, then it does not tell the agent to create the folder.
> - Given the same failure, when the agent inspects the error, then it contains no absolute disk path and neither file has changed.
>
> **Story: missing folder unchanged**
> - Given the destination folder does not exist and no file has its name, when the agent moves a note there, then the error still reports a missing destination folder, as today.
>
> ## Out of scope
> - Creating destination folders automatically.
> - Renaming or removing the blocking file.
> - Other move failures, such as an existing destination file.

## 3. assess / resolve-assessment (2026-11-04T01:36:59.515Z)

**Question (verbatim):**

> Q1: Which `details.code` should `move` report when an existing file sits where the destination folder should be (for example `to: "Inbox/Note.md/"` where `Inbox/Note.md` is a note)?
>
> Context: today `moveFailure` (`src/tools/move/handler.ts:100-104`) sends every non-root ENOENT rename to `folderNotFound`, which returns `CLI_REPORTED_ERROR` + `details.code: "FOLDER_NOT_FOUND"`. The `paths` tool already publishes a sub-discriminator for exactly "this folder path is a file": `NOT_A_FOLDER`, in `pathsEnvelopeError` (`src/tools/paths/schema.ts:50`), emitted by its template (`src/tools/paths/_template.ts:15`) under the same top-level `CLI_REPORTED_ERROR`. Constitution Principle IV forbids new top-level codes; a `details.code` value is not one.
>
> | Option | Answer | Implications |
> |---|---|---|
> | A (recommended) | Reuse `NOT_A_FOLDER`, with `details.folder` = the blocking file's vault-relative path | One name for one meaning across tools; agents that already handle `paths`' `NOT_A_FOLDER` handle this too; the shape mirrors `FOLDER_NOT_FOUND` (`{ code, folder }`). |
> | B | A new move-specific code, e.g. `DESTINATION_BLOCKED_BY_FILE`, with `details.blocker` | More descriptive for `move`, but it adds a second name for a condition `paths` already names, and a new value to document. |
> | C | No `details.code`; only a distinct message | Meets "does not say missing", but agents get no stable value to branch on, unlike the `FOLDER_NOT_FOUND` case right next to it. |
>
> Recommended: A. It reuses an established sub-discriminator, so the fix adds no new vocabulary and stays a repair.

**Advisor** (escalate: none):

> 1. Reuse `NOT_A_FOLDER` under `CLI_REPORTED_ERROR`, with `details.folder` = the blocking file's vault-relative path, which mirrors the `FOLDER_NOT_FOUND` shape. Do not add a `details.reason`, because there is only one sub-state. The message must say that an existing file has that name. The recovery advice is to rename or remove that file or pick another destination, never to create the folder. Document `NOT_A_FOLDER` in `move`'s description and help, next to `FOLDER_NOT_FOUND`.
>
> Why: the BI's acceptance criteria ask for "states that an existing file has that name" and no create-folder advice. ADR-015's rationale rejects fragmenting the discriminator namespace with a second name for one condition, and Constitution Principle IV forbids new top-level codes. The vault records `paths`' `NOT_A_FOLDER` as undocumented (Fix-It discrepancies report), so `move` must document the value itself.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`, `200-Decisions/ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `XXX-Fix-It/Obsidian CLI MCP Discrepancies - 1 Tools and Features.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`: Appended a 2026-11-04 /speckit-clarify comment recording the answer: NOT_A_FOLDER with details.folder, no new code or reason, recovery advice and documentation requirements.

**Sent to the step:**

> 1. Reuse `NOT_A_FOLDER` under `CLI_REPORTED_ERROR`, with `details.folder` = the blocking file's vault-relative path, which mirrors the `FOLDER_NOT_FOUND` shape. Do not add a `details.reason`, because there is only one sub-state. The message must say that an existing file has that name. The recovery advice is to rename or remove that file or pick another destination, never to create the folder. Document `NOT_A_FOLDER` in `move`'s description and help, next to `FOLDER_NOT_FOUND`.
>
> Why: the BI's acceptance criteria ask for "states that an existing file has that name" and no create-folder advice. ADR-015's rationale rejects fragmenting the discriminator namespace with a second name for one condition, and Constitution Principle IV forbids new top-level codes. The vault records `paths`' `NOT_A_FOLDER` as undocumented (Fix-It discrepancies report), so `move` must document the value itself.

## 4. assess / resolve-assessment (2026-11-04T01:37:49.170Z)

**Question (verbatim):**

> Q2: If the blocker lookup itself fails (the extra `obsidian eval` times out, Obsidian stops answering, or the answer cannot be parsed), what should the `move` failure be?
>
> Context: the proposed fix runs one `invokeEval` only after an ENOENT/ENOTDIR rename failure, to check whether a segment of the destination folder is a file. Spec 090 already has a rule for "the extra lookup needed to report this failure failed": `withheldFailure` (`src/tools/move/handler.ts:89-97`, data-model E4c). It keeps the move's `code`, names the vault-relative source and destination, and attaches the lookup error as `cause`. `moveFailure` reaches it when `fileTargetVaultRoot` fails for any reason other than an unregistered vault (`handler.ts:105-113`). Principle IV forbids silent fallbacks.
>
> | Option | Answer | Implications |
> |---|---|---|
> | A (recommended) | Follow the E4c precedent: keep the move's `code` (`CLI_REPORTED_ERROR`), drop the raw CLI text, name the vault-relative source and destination, say the destination folder could not be checked, attach the lookup failure as `cause`, and set no `details.code` | Never misreports a blocked folder as missing; both failures are visible; no absolute path; same shape as the existing withheld failure. |
> | B | Fall back to today's `FOLDER_NOT_FOUND` | Keeps the common (truly missing) case's advice on a lookup hiccup, but silently reintroduces this bug whenever the lookup fails: the fallback Principle IV forbids. |
> | C | Throw the lookup failure in place of the move failure | Surfaces the lookup error but masks the move failure, which spec 090 D5 explicitly rejects. |
>
> Recommended: A. It reuses the handler's existing withheld-failure rule and keeps the failure loud without guessing.

**Advisor** (escalate: none):

> 2. A
>
> Why: BI-0172's 2026-11-02 /speckit-analyze follow-up already set the rule for a failed lookup. Keep the move's code, withhold the raw CLI text, name the vault-relative source and destination, and attach the lookup failure as the cause. Option B is the silent fallback that Constitution Principle IV forbids.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0172 - Classify Move Missing Destination Folder Error.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`: Appended a 2026-11-04 /speckit-clarify comment recording the answer: a failed blocker lookup follows the BI-0172 withheld-failure rule, with no FOLDER_NOT_FOUND fallback.

**Sent to the step:**

> 2. A
>
> Why: BI-0172's 2026-11-02 /speckit-analyze follow-up already set the rule for a failed lookup. Keep the move's code, withhold the raw CLI text, name the vault-relative source and destination, and attach the lookup failure as the cause. Option B is the silent fallback that Constitution Principle IV forbids.

## 5. assess / resolve-assessment (2026-11-04T01:38:03.912Z)

**Question (verbatim):**

> Q3: How should the fix establish the exact command-line output for a rename through a file? The assessment's [NEEDS CLARIFICATION] item: Windows is expected to give `Error: ENOENT: …, rename '…'`, and macOS/Linux `Error: ENOTDIR: …, rename '…'`. Neither line is captured verbatim.
>
> Context: classification keys on `ENOENT_RENAME_RE = /^Error: ENOENT: [^,]*, rename '/` (`src/tools/move/handler.ts:64`), applied by `isMissingDestinationFolder` (`:73`). The fix widens it to `ENOENT|ENOTDIR`. TC-00701 proves the Windows line matches the ENOENT regex (it was classified `FOLDER_NOT_FOUND`), but the line itself was not recorded. Spec 090's probe P5 (`specs/090-classify-missing-destination/research.md:16`) sent the raw folder form, which is not what `executeMove` forwards for a `path` locator (`handler.ts:123`). Only a Windows machine and the authorised test vault are available for live probes (`.memory/test-execution-instructions.md`).
>
> | Option | Answer | Implications |
> |---|---|---|
> | A (recommended) | `/speckit-bug-fix` runs a T0 live probe on Windows in the authorised test vault (sending exactly what `executeMove` forwards, `to=…/Blocker.md/MoveMe.md`) and records the verbatim line in `fix.md`; the POSIX ENOTDIR line stays inferred from libuv (spec 090 F5's basis) and its unit row uses the inferred shape | Captures the one platform that can be probed, keeps the fix moving, and is honest about the POSIX residual, as spec 090 did for its own macOS/Linux rows. |
> | B | Probe now, before the fix starts, and write the line into assessment.md | Same evidence earlier, but this settle step only edits the assessment, and the probe belongs with the fix's T0 work. |
> | C | No probe; rely on TC-00701 and the libuv inference | Cheapest, but the regex and the unit rows would rest on an uncaptured line. |
>
> Recommended: A. Probe on Windows at fix time and record the result; accept the POSIX form as inferred.

**Advisor** (escalate: none):

> 3. A, with one addition. Run the T0 probe through the production `Obsidian.com` shim, the path the wrapper resolves, never `Obsidian.exe`. Send exactly what `executeMove` forwards for a `path` locator. Record the verbatim line in `fix.md`. Mark the POSIX `ENOTDIR` row as inferred and list it as a residual.
>
> Why: Best Practices (Tooling and Environment) records that `.exe` probes gave false-clean output and corrupted CLI state. TC-00701 shows the Windows line matches the ENOENT regex but did not record the line itself, so a fix-time capture closes that gap.

Sources: `210-Guidelines/Best Practices.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`: Appended a 2026-11-04 /speckit-clarify comment recording the answer: a fix-time Windows T0 probe through Obsidian.com in the test vault, the verbatim line recorded, and the POSIX ENOTDIR line kept as an inferred residual.

**Sent to the step:**

> 3. A, with one addition. Run the T0 probe through the production `Obsidian.com` shim, the path the wrapper resolves, never `Obsidian.exe`. Send exactly what `executeMove` forwards for a `path` locator. Record the verbatim line in `fix.md`. Mark the POSIX `ENOTDIR` row as inferred and list it as a residual.
>
> Why: Best Practices (Tooling and Environment) records that `.exe` probes gave false-clean output and corrupted CLI state. TC-00701 shows the Windows line matches the ENOENT regex but did not record the line itself, so a fix-time capture closes that gap.

## 6. repair / bug-fix (2026-11-04T01:46:27.274Z)

**Question (verbatim):**

> BI-0177 fix: one existing test outside the assessment's file list now fails. The repo's standing rule (`.memory/refactor-decisions.md` item 5) needs your sign-off before I edit it.
>
> **Test:** `src/tools/move/index.test.ts:96`, "tool.handler returns the FOLDER_NOT_FOUND payload as an isError result (spec 090 R1)".
>
> **Why it fails:** the assessment intends a missing destination folder to cost a second CLI call, the blocked-destination lookup eval. This test stubs spawns with the single-spec `makeStubSpawn`, which answers that eval with the same ENOENT line. The lookup therefore fails, and the test gets the withheld failure instead of FOLDER_NOT_FOUND. The assessment lists `index.test.ts` only "if an assertion pins the description's wording", so it did not foresee this edit.
>
> | Option | Edit | Effect |
> |---|---|---|
> | A (recommended) | Switch this one test's stub to `makeQueuedSpawn([<the same ENOENT response>, { stdout: '=> {"ok":true,"blocker":null}\n', exitCode: 0 }])` and add `makeQueuedSpawn` to its import. No assertion, expected value or title changes. | The test pins the same wire payload, now through the real two-call flow. |
> | B | Leave `index.test.ts` untouched and stop here. Re-run `/speckit-bug-assess` to amend the file list first. | The fix stays uncommitted until the assessment is amended. |
>
> **Recommended: A.** The assessment already approved this kind of edit for the M1–M7 rows: their spawn queues gain the lookup's eval response. Here the change only adds one stub response to one test. Every expected value stays byte-identical, so the test still proves the FOLDER_NOT_FOUND wire payload. Everything else is done. The full suite has 4883 passed and 1 failed (this test). Typecheck and lint are clean.
>
> Reply A or B, or give other instructions.

**Advisor** (escalate: decision: The repo's standing rule (refactor-decisions item 5) reserves edits to existing tests for the owner, and this test is outside the assessment's approved file list. Only the owner's sign-off can authorise the edit.):

> A (recommended, pending the owner's sign-off). In `src/tools/move/index.test.ts:96`, switch only that test's stub to `makeQueuedSpawn([<the same ENOENT response>, { stdout: '=> {"ok":true,"blocker":null}\n', exitCode: 0 }])` and add `makeQueuedSpawn` to its import. Leave the title, the assertions and the expected values byte-identical. Record the edit and the reason for it in `fix.md`, as a test the assessment's file list did not cover.
>
> Why: the change keeps the FOLDER_NOT_FOUND wire payload pinned, now through the two-call flow the fix introduces. It mirrors the M1–M7 queue edits the assessment already approved. BI-0177's "missing folder unchanged" criterion requires that payload to stay as it is today. Do not edit until the owner rules.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> A. In `src/tools/move/index.test.ts:96`, switch that test's stub to `makeQueuedSpawn([<the same ENOENT response>, { stdout: '=> {"ok":true,"blocker":null}\n', exitCode: 0 }])` and add `makeQueuedSpawn` to its import. Leave the title, the assertions and the expected values byte-identical. Record the edit in `fix.md` as owner-approved, outside the assessment's file list.
>
> Why: owner ruling 2026-11-04 on this job. The test keeps pinning the FOLDER_NOT_FOUND wire payload through the new two-call flow, which BI-0177's "missing folder unchanged" criterion requires.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0177 - Distinguish File Blocking Move Destination Folder.md`: Appended a 2026-11-04 comment recording the owner ruling: approved the stub-only edit of move/index.test.ts:96 (queued spawn with the lookup eval response), assertions unchanged.

**Owner:** choice 1 (A: queue the lookup stub), via cli, 2026-11-04T01:47:00.547Z.

**Sent to the step:**

> A. In `src/tools/move/index.test.ts:96`, switch that test's stub to `makeQueuedSpawn([<the same ENOENT response>, { stdout: '=> {"ok":true,"blocker":null}\n', exitCode: 0 }])` and add `makeQueuedSpawn` to its import. Leave the title, the assertions and the expected values byte-identical. Record the edit in `fix.md` as owner-approved, outside the assessment's file list.
>
> Why: owner ruling 2026-11-04 on this job. The test keeps pinning the FOLDER_NOT_FOUND wire payload through the new two-call flow, which BI-0177's "missing folder unchanged" criterion requires.
