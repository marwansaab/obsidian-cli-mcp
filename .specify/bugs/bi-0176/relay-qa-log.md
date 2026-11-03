# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0176-dry-2026-11-03`, started 2026-11-03T01:19:22.545Z.

## 1. checks / preflight (2026-11-03T01:19:22.590Z)

**Question (verbatim):**

> Preflight for this Relay bug-fix run of job BI-0176. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0176 in the vault.
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

> Ready for BI-0176. All checks pass.
>
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md`). It matches `expected_vault_id`. I did all five session-start reads (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`
> - Title: "BI-0176 — Resolve File Locator On Write Note Overwrite"
> - Status: `planned` (not finished or abandoned, so the run continues)
> - Variant: `bug-fix`
>
> Checks:
> 1. Vault identity: PASS.
> 2. Backlog note found: PASS.
> 3. `initiative` is `[[Obsidian CLI MCP]]`: PASS.
> 4. Status `planned` is not shipped, done, cancelled or superseded: PASS.
> 5. Variant is `bug-fix`: PASS.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section, but a "/speckit-specify prompt" section is present. It describes the expected behaviour:
>    - Replacing a note by name resolves it vault-wide, the way `read` does, and reports it as a replacement, not a creation. No duplicate note appears at the vault root.
>    - A name with no match creates a new note where the documentation says it will.
>    - A name that matches several notes is handled the same way the reading tools handle it, or fails with an ambiguity error, and the documentation says which.
>    - A transient file lock returns the same code the sibling writers use (`EXTERNAL_EDITOR_CONFLICT`), with no absolute disk path in the error.
>    I did not change the note.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, args "BI-0176 - Resolve File Locator On Write Note Overwrite"). Primed with the BI, the Constitution v1.5.1, the Architecture note, ADR-009 (direct filesystem write path), sibling BI-0171 (`file` locator fix, shipped in 0.9.0), and the `write_note` gotchas on the Obsidian CLI MCP Tool Notes page.
>
> Dry run: no vault edits.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge.md`, `BI-0171 - Resolve File Locator In Patch Heading`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Ready for BI-0176. All checks pass.
>
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md`). It matches `expected_vault_id`. I did all five session-start reads (MCP Tool Notes index, Best Practices, Decision Log, Session Handover, About This Vault).
> - Note: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`
> - Title: "BI-0176 — Resolve File Locator On Write Note Overwrite"
> - Status: `planned` (not finished or abandoned, so the run continues)
> - Variant: `bug-fix`
>
> Checks:
> 1. Vault identity: PASS.
> 2. Backlog note found: PASS.
> 3. `initiative` is `[[Obsidian CLI MCP]]`: PASS.
> 4. Status `planned` is not shipped, done, cancelled or superseded: PASS.
> 5. Variant is `bug-fix`: PASS.
> 6. Prompt section: PASS. There is no "/speckit-bug-assess prompt" section, but a "/speckit-specify prompt" section is present. It describes the expected behaviour:
>    - Replacing a note by name resolves it vault-wide, the way `read` does, and reports it as a replacement, not a creation. No duplicate note appears at the vault root.
>    - A name with no match creates a new note where the documentation says it will.
>    - A name that matches several notes is handled the same way the reading tools handle it, or fails with an ambiguity error, and the documentation says which.
>    - A transient file lock returns the same code the sibling writers use (`EXTERNAL_EDITOR_CONFLICT`), with no absolute disk path in the error.
>    I did not change the note.
> 7. Clarify skill: loaded (`anthropic-skills:speckit-clarify-skill`, args "BI-0176 - Resolve File Locator On Write Note Overwrite"). Primed with the BI, the Constitution v1.5.1, the Architecture note, ADR-009 (direct filesystem write path), sibling BI-0171 (`file` locator fix, shipped in 0.9.0), and the `write_note` gotchas on the Obsidian CLI MCP Tool Notes page.
>
> Dry run: no vault edits.

## 2. assess / bug-assess (2026-11-03T01:20:15.951Z)

**Question (verbatim):**

> Return the bug report for job BI-0176 as one message in `answer`, built only from the note's own text. Do not edit, summarise or add to it.
> - If the note has a "/speckit-bug-assess prompt" section: its full content, verbatim and complete, without the surrounding code fence.
> - Otherwise exactly this, with each section's full content verbatim and complete: a first line `/speckit-bug-assess slug=BI-0176`, a blank line, the line `## Impact` followed by the note's "Impact" section, a blank line, the line `## Status and evidence` followed by the note's "Status" section, a blank line, and the line `## Expected behaviour` followed by the content of its "/speckit-specify prompt" section without the surrounding code fence. Leave out any of the first two sections the note doesn't have.
> If the note has neither prompt section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-bug-assess slug=BI-0176
>
> ## Impact
> `write_note`'s `file` parameter description says the name is "resolved like a wikilink", but for a write the tool resolves the name only at the vault root (its help documents root resolution for new notes). With `overwrite: true`, an existing note in a sub-folder is therefore not found, and the tool silently creates a second note at the root and reports success (`created: true`). Harms: (a) the caller believes it replaced the note, but the original is unchanged and stale; (b) a duplicate with the same frontmatter `id` now exists, breaking ID-indexed Bases and lookups until someone notices; (c) the behaviour disagrees with sibling tools — `read` and, after [[BI-0171 - Resolve File Locator In Patch Heading]], `patch_heading` / `patch_block` resolve a bare name vault-wide. Only a careful caller that reads `created: true` on an intended overwrite would catch it.
>
> Secondary: the transient-lock failure returns `FS_WRITE_FAILED` with absolute disk paths in the error, whereas the sibling fs-direct writers (`append_note`, `prepend`, `patch_heading`, `patch_block`) classify the same condition as `EXTERNAL_EDITOR_CONFLICT` with vault-relative detail. The absolute path leaks machine layout and the different code defeats a caller's shared retry logic.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local` built from `main`, in `My-Setup-Vault`: `write_note` with `target_mode: "specific"`, `file: "<note name>"` and `overwrite: true`, aimed at existing test-case notes in the `Obsidian CLI MCP - Test Cases` sub-folder, returned `created: true` and wrote a new note of the same name at the vault root instead of replacing the existing note. Three stray root copies resulted, each carrying a duplicate test-case id (the names of [[TC-00299 - Search Non Empty Query Returns Matching Paths And Count]], [[TC-00300 - Search Zero Match Returns Empty Paths Not Error]] and [[TC-00302 - Search Context Lines True Returns Path Line And Text]]); they were trashed and the intended notes rewritten by `path`. Secondary observation from the same run: on a transient Windows file lock, `write_note` returned `FS_WRITE_FAILED` (EPERM) with absolute disk paths in `message` and `details.path`.
>
> ## Expected behaviour
> /speckit-specify Resolve overwrite target
>
> ## Feature
> When an agent replaces an existing note by giving its name rather than its full path, the note that is replaced is the same note that reading by that name would return, wherever it lives in the vault; and a temporary lock on the file is reported the same way the other writing tools report it.
>
> ## Why
> Today, replacing a note by name only looks at the top of the vault. If the note lives in a sub-folder, a second note with the same name is created at the top instead, and the operation reports success. The agent believes the note was updated, the real note stays stale, and a duplicate appears. Other tools already find a named note anywhere in the vault, so the same name points to different notes depending on the tool.
>
> ## User stories
> - As an agent, I want replacing a note by name to replace the existing note wherever it is, so that I never create a duplicate by accident.
> - As an agent, I want a name that matches no existing note to behave predictably and as documented, so that I know where a new note will be created.
> - As an agent, I want a name that matches more than one note to be handled the same way the reading tools handle it, so that the same name means the same note across tools.
> - As an agent, I want a temporary file lock during a write to be reported with the same error the other writing tools use, without exposing the machine's disk paths, so that one retry rule covers every writer.
>
> ## Acceptance criteria
>
> **Story: replace by name finds the existing note**
> - Given a note "Alpha" exists only in a sub-folder, when the agent replaces "Alpha" by name with overwrite allowed, then that note's content is replaced, the response reports that an existing note was replaced, and no new note appears at the vault root.
> - Given the same note, when the agent reads "Alpha" by name after the replacement, then the new content is returned.
>
> **Story: new note by name**
> - Given no note named "Beta" exists anywhere, when the agent writes "Beta" by name, then a new note is created where the documentation says it will be, and the response reports a new note.
>
> **Story: consistent name resolution**
> - Given two notes share a name, when the agent replaces that name, then the note chosen is the one reading by that name returns, or the call fails with a clear ambiguity error — and the documentation says which.
>
> **Story: temporary lock**
> - Given the target file is briefly locked by another program, when the write fails, then the error code matches the one the other writing tools return for the same situation, and the error contains no absolute disk path.
>
> ## Out of scope
> - Writing by full path, which already behaves correctly.
> - Appending, prepending or patching notes.
> - Retrying writes automatically.
> - Changing how the size of a write is reported.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`

**Sent to the step:**

> /speckit-bug-assess slug=BI-0176
>
> ## Impact
> `write_note`'s `file` parameter description says the name is "resolved like a wikilink", but for a write the tool resolves the name only at the vault root (its help documents root resolution for new notes). With `overwrite: true`, an existing note in a sub-folder is therefore not found, and the tool silently creates a second note at the root and reports success (`created: true`). Harms: (a) the caller believes it replaced the note, but the original is unchanged and stale; (b) a duplicate with the same frontmatter `id` now exists, breaking ID-indexed Bases and lookups until someone notices; (c) the behaviour disagrees with sibling tools — `read` and, after [[BI-0171 - Resolve File Locator In Patch Heading]], `patch_heading` / `patch_block` resolve a bare name vault-wide. Only a careful caller that reads `created: true` on an intended overwrite would catch it.
>
> Secondary: the transient-lock failure returns `FS_WRITE_FAILED` with absolute disk paths in the error, whereas the sibling fs-direct writers (`append_note`, `prepend`, `patch_heading`, `patch_block`) classify the same condition as `EXTERNAL_EDITOR_CONFLICT` with vault-relative detail. The absolute path leaks machine layout and the different code defeats a caller's shared retry logic.
>
> ## Status and evidence
> *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local` built from `main`, in `My-Setup-Vault`: `write_note` with `target_mode: "specific"`, `file: "<note name>"` and `overwrite: true`, aimed at existing test-case notes in the `Obsidian CLI MCP - Test Cases` sub-folder, returned `created: true` and wrote a new note of the same name at the vault root instead of replacing the existing note. Three stray root copies resulted, each carrying a duplicate test-case id (the names of [[TC-00299 - Search Non Empty Query Returns Matching Paths And Count]], [[TC-00300 - Search Zero Match Returns Empty Paths Not Error]] and [[TC-00302 - Search Context Lines True Returns Path Line And Text]]); they were trashed and the intended notes rewritten by `path`. Secondary observation from the same run: on a transient Windows file lock, `write_note` returned `FS_WRITE_FAILED` (EPERM) with absolute disk paths in `message` and `details.path`.
>
> ## Expected behaviour
> /speckit-specify Resolve overwrite target
>
> ## Feature
> When an agent replaces an existing note by giving its name rather than its full path, the note that is replaced is the same note that reading by that name would return, wherever it lives in the vault; and a temporary lock on the file is reported the same way the other writing tools report it.
>
> ## Why
> Today, replacing a note by name only looks at the top of the vault. If the note lives in a sub-folder, a second note with the same name is created at the top instead, and the operation reports success. The agent believes the note was updated, the real note stays stale, and a duplicate appears. Other tools already find a named note anywhere in the vault, so the same name points to different notes depending on the tool.
>
> ## User stories
> - As an agent, I want replacing a note by name to replace the existing note wherever it is, so that I never create a duplicate by accident.
> - As an agent, I want a name that matches no existing note to behave predictably and as documented, so that I know where a new note will be created.
> - As an agent, I want a name that matches more than one note to be handled the same way the reading tools handle it, so that the same name means the same note across tools.
> - As an agent, I want a temporary file lock during a write to be reported with the same error the other writing tools use, without exposing the machine's disk paths, so that one retry rule covers every writer.
>
> ## Acceptance criteria
>
> **Story: replace by name finds the existing note**
> - Given a note "Alpha" exists only in a sub-folder, when the agent replaces "Alpha" by name with overwrite allowed, then that note's content is replaced, the response reports that an existing note was replaced, and no new note appears at the vault root.
> - Given the same note, when the agent reads "Alpha" by name after the replacement, then the new content is returned.
>
> **Story: new note by name**
> - Given no note named "Beta" exists anywhere, when the agent writes "Beta" by name, then a new note is created where the documentation says it will be, and the response reports a new note.
>
> **Story: consistent name resolution**
> - Given two notes share a name, when the agent replaces that name, then the note chosen is the one reading by that name returns, or the call fails with a clear ambiguity error — and the documentation says which.
>
> **Story: temporary lock**
> - Given the target file is briefly locked by another program, when the write fails, then the error code matches the one the other writing tools return for the same situation, and the error contains no absolute disk path.
>
> ## Out of scope
> - Writing by full path, which already behaves correctly.
> - Appending, prepending or patching notes.
> - Retrying writes automatically.
> - Changing how the size of a write is reported.

## 3. assess / resolve-assessment (2026-11-03T01:23:40.321Z)

**Question (verbatim):**

> Q1 — Which file-system errors should write_note report as a lock (CLI_REPORTED_ERROR with details.code "EXTERNAL_EDITOR_CONFLICT")?
>
> Context: The reported failure was EPERM on the atomic rename. The sibling writers disagree. append_note and patch_heading treat {EBUSY, EPERM, EACCES} as a lock. patch_block treats only {EBUSY, EPERM} as a lock and reports EACCES as FS_WRITE_FAILED. write_note today has a test pinning EACCES → FS_WRITE_FAILED, and its help page lists EACCES as a permissions failure that needs the user to act.
>
> | Option | Answer | Effect |
> |---|---|---|
> | A (recommended) | {EBUSY, EPERM} | Covers the observed errno. Matches patch_block. EACCES stays a permissions failure (FS_WRITE_FAILED, now with a vault-relative path). The existing EACCES test and the help page's EACCES guidance stay true. |
> | B | {EBUSY, EPERM, EACCES} | Matches append_note and patch_heading exactly. EACCES is reclassified as a lock, which changes the existing EACCES test and the help page's advice. A genuine permissions denial would then be reported as "close the file in the editor and retry". |
>
> Recommendation: A. It fixes the reported case with the smallest contract change and does not tell callers to retry a permissions denial.

**Advisor** (escalate: none):

> A

Sources: `200-Decisions/ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/write_note.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Would append a clarification to the Impact section's 'Secondary' paragraph: '*Clarified 2026-11-03 (/speckit-clarify Q1):* only EBUSY and EPERM are reported as a lock (EXTERNAL_EDITOR_CONFLICT), matching patch_block; EACCES stays FS_WRITE_FAILED, now with a vault-relative path, per ADR-009 Decision point 7.'

**Sent to the step:**

> A

## 4. assess / resolve-assessment (2026-11-03T01:23:55.890Z)

**Question (verbatim):**

> Q2 — With overwrite: false, what should write_note do when the name already belongs to a note in a sub-folder?
>
> Context: Once a `file` name resolves the way read resolves it, a write by the name "Alpha" targets Sub/Alpha.md when that note exists. Today, overwrite: false with that name creates a second Alpha.md at the vault root. That is the same duplicate the report describes, only without overwrite.
>
> | Option | Answer | Effect |
> |---|---|---|
> | A (recommended) | Return FILE_EXISTS for the resolved note (Sub/Alpha.md) and write nothing | The same name means the same note in every tool and every overwrite setting. No duplicate is created. A caller who really wants a second root note uses `path: "Alpha.md"`. |
> | B | Keep creating a new note at the vault root, and resolve vault-wide only when overwrite is true | Keeps today's overwrite:false behaviour, but the same name then points at different notes depending on a flag, and the duplicate-id harm remains. |
>
> Recommendation: A. It follows directly from the report's consistency story and closes the second route to the same duplicate.

**Advisor** (escalate: none):

> A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `200-Decisions/ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Would append a clarification to the Impact section: '*Clarified 2026-11-03 (/speckit-clarify Q2):* with overwrite: false, a `file` name that resolves to an existing note anywhere in the vault returns FILE_EXISTS for that note and writes nothing; a second root note requires an explicit `path`.'

**Sent to the step:**

> A

## 5. assess / resolve-assessment (2026-11-03T01:24:04.560Z)

**Question (verbatim):**

> Q3 — How should the fix reproduce the transient file lock? The reported run did not record which program held the lock or for how long.
>
> | Option | Answer | Effect |
> |---|---|---|
> | A (recommended) | Reproduce it in-process: inject EPERM (and EBUSY) from the fs double's rename in a unit test, the way the sibling writers' lock tests already do. No live lock repro is required. | Deterministic, runs on Linux and Windows CI, and checks the code, the vault-relative path and that no absolute path appears anywhere. |
> | B | Option A, plus a best-effort live probe on Windows during /speckit-bug-test (hold the test-vault note open with an exclusive share lock and write to it) | Adds real-OS evidence, at the cost of a Windows-only, timing-sensitive manual step. |
> | C | Ask the reporter for the program and timing before fixing | Blocks the fix on information the classification change does not need. |
>
> Recommendation: A. The defect is in how the error is classified, which an injected errno exercises fully.

**Advisor** (escalate: none):

> B, with one correction: the live probe is deterministic, not timing-sensitive. Use the TC-00412 lock harness.
>
> Regression test: inject EPERM and EBUSY from the fs double's rename, as in option A. Assert `CLI_REPORTED_ERROR` with `details.code: "EXTERNAL_EDITOR_CONFLICT"`, a vault-relative `details.path`, and no absolute path in `message` or `details`.
>
> Live Windows probe during bug-test: in TestVault-Obsidian-CLI-MCP, hold the target note with PowerShell `[System.IO.File]::Open(<abs path>, Open, ReadWrite, FileShare.ReadWrite)` (no `FileShare.Delete`). Call `write_note` with `overwrite: true`. Expect the lock envelope with `errno: "EPERM"` and the file byte-identical to before the call. Release with `$f.Close()`. If the run cannot hold the lock itself, record the probe as owner-input and keep the injected-errno test as the gate.
>
> Do not wait for the reporter's program or timing details.
>
> Rationale: TC-00412 shows a PowerShell lock without Delete sharing deterministically produces EPERM on the rename, and Notepad-style editors do not lock.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00412 - Patch Heading External Editor Conflict Throws EXTERNAL_EDITOR_CONFLICT.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/patch_heading.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Would append a clarification to the Status section: '*Clarified 2026-11-03 (/speckit-clarify Q3):* lock reproduced by injected EPERM/EBUSY on rename in unit tests, plus a live Windows probe using the TC-00412 PowerShell FileShare.ReadWrite (no Delete) harness; reporter details not needed.'

**Sent to the step:**

> B, with one correction: the live probe is deterministic, not timing-sensitive. Use the TC-00412 lock harness.
>
> Regression test: inject EPERM and EBUSY from the fs double's rename, as in option A. Assert `CLI_REPORTED_ERROR` with `details.code: "EXTERNAL_EDITOR_CONFLICT"`, a vault-relative `details.path`, and no absolute path in `message` or `details`.
>
> Live Windows probe during bug-test: in TestVault-Obsidian-CLI-MCP, hold the target note with PowerShell `[System.IO.File]::Open(<abs path>, Open, ReadWrite, FileShare.ReadWrite)` (no `FileShare.Delete`). Call `write_note` with `overwrite: true`. Expect the lock envelope with `errno: "EPERM"` and the file byte-identical to before the call. Release with `$f.Close()`. If the run cannot hold the lock itself, record the probe as owner-input and keep the injected-errno test as the gate.
>
> Do not wait for the reporter's program or timing details.
>
> Rationale: TC-00412 shows a PowerShell lock without Delete sharing deterministically produces EPERM on the rename, and Notepad-style editors do not lock.
