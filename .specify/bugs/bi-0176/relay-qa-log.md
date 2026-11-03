# Relay Q&A log: speckit-bugfix

Run `obsidian-cli-mcp-bugfix-bi-0176-2026-11-03`, started 2026-11-03T05:55:00.816Z.

## 1. checks / preflight (2026-11-03T05:55:00.861Z)

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

> Primed for BI-0176 — Resolve File Locator On Write Note Overwrite.
>
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md` in `My-Setup-Vault`). It matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. Also read the Obsidian CLI MCP Tool Notes.
> - Note path: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`. Found. PASS.
> - Title: BI-0176 — Resolve File Locator On Write Note Overwrite.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned`. The work is not finished or abandoned. PASS.
> - Variant: `bug-fix`. PASS.
> - Prompt section: there is no "/speckit-bug-assess prompt" section. There is a "/speckit-specify prompt" section. It sets out the expected behaviour: overwriting by `file` name targets the same note `read` resolves, wherever it is in the vault; a name that matches no note behaves as documented; a name that matches several notes behaves the same way the reading tools handle it, or fails with a clear ambiguity error; a temporary file lock reports the same error code as the sibling writers, with no absolute disk path. PASS. The note was not changed.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` is loaded with "BI-0176 - Resolve File Locator On Write Note Overwrite". PASS.
> - Read: the BI, the Constitution (v1.5.1), the Architecture, ADR-009, ADR-044, and the sibling BI-0171 (shipped 0.9.0, resolves `file` names vault-wide for patch_heading and patch_block). The Tool Notes entry for `write_note` confirms both defects. It also gives the current workaround: always pass `path`.
> - Role: BA + Solution Architect, answering for Claude Code. Awaiting questions.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `200-Decisions/ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge.md`, `200-Decisions/ADR-044 - File-Path Tools Check The Resolved File And Keep Its Type.md`, `BI-0171 - Resolve File Locator In Patch Heading`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

**Sent to the step:**

> Primed for BI-0176 — Resolve File Locator On Write Note Overwrite.
>
> - Vault id: `my-setup` (read from `000-Meta/Vault Identity.md` in `My-Setup-Vault`). It matches `expected_vault_id`. PASS.
> - Session-start reads done: MCP Tool Notes (index), Best Practices, Decision Log, Session Handover, About This Vault. Also read the Obsidian CLI MCP Tool Notes.
> - Note path: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`. Found. PASS.
> - Title: BI-0176 — Resolve File Locator On Write Note Overwrite.
> - Initiative: `[[Obsidian CLI MCP]]`. PASS.
> - Status: `planned`. The work is not finished or abandoned. PASS.
> - Variant: `bug-fix`. PASS.
> - Prompt section: there is no "/speckit-bug-assess prompt" section. There is a "/speckit-specify prompt" section. It sets out the expected behaviour: overwriting by `file` name targets the same note `read` resolves, wherever it is in the vault; a name that matches no note behaves as documented; a name that matches several notes behaves the same way the reading tools handle it, or fails with a clear ambiguity error; a temporary file lock reports the same error code as the sibling writers, with no absolute disk path. PASS. The note was not changed.
> - Clarify skill: `anthropic-skills:speckit-clarify-skill` is loaded with "BI-0176 - Resolve File Locator On Write Note Overwrite". PASS.
> - Read: the BI, the Constitution (v1.5.1), the Architecture, ADR-009, ADR-044, and the sibling BI-0171 (shipped 0.9.0, resolves `file` names vault-wide for patch_heading and patch_block). The Tool Notes entry for `write_note` confirms both defects. It also gives the current workaround: always pass `path`.
> - Role: BA + Solution Architect, answering for Claude Code. Awaiting questions.

## 2. assess / bug-assess (2026-11-03T05:56:03.688Z)

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

## 3. assess / resolve-assessment (2026-11-03T05:59:04.152Z)

**Question (verbatim):**

> Q1 — Reproduction, secondary defect: [NEEDS CLARIFICATION: which syscall reported the EPERM in the live run (`stat`, `rename` or the `wx` `open`)].
>
> Context: in `src/tools/write_note/handler.ts`, every fs failure (`mkdir`, the pre-write `stat`, the atomic tmp+`rename`, the `wx` create) goes through the same private `mapFsError`. The fix sends all of them through the cohort's `mapFsWriteError`, so the fix and its tests are the same whichever syscall it was.
>
> | Option | Description |
> |---|---|
> | A (recommended) | Record it as not determined and not needed. The fix covers every syscall in the handler, and the unit tests throw EPERM / EBUSY / EACCES from `stat`, `rename`, `writeFile` and `mkdir` alike. |
> | B | Record that it was the atomic `rename` (the usual Windows sharing-violation point when Obsidian or an indexer holds the file). This is an inference, not an observation. |
> | C | Hold the fix until a live repro in the authorised test vault pins the syscall. |
>
> Recommended: A. The answer would not change the root cause, the remediation, the files or the tests. B would record a guess as fact, and C costs a live destructive probe for no change to the fix.

**Advisor** (escalate: none):

> A
>
> The BI's Status section and the write_note entry in Tool Notes record only "`FS_WRITE_FAILED` (EPERM) with absolute disk paths in `message` and `details.path`". Neither says which syscall raised it, and the BI's acceptance criterion is about the error code and the missing absolute path, not the syscall. Record it as not determined and not needed.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Added a 'Clarified 2026-11-03 (/speckit-bug-assess Q1)' sentence to the Impact section's secondary-defect paragraph: the EPERM syscall was not recorded and is not needed, since every fs failure goes through one mapper.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Frontmatter updated: 2026-11-02 → 2026-11-03.

**Sent to the step:**

> A
>
> The BI's Status section and the write_note entry in Tool Notes record only "`FS_WRITE_FAILED` (EPERM) with absolute disk paths in `message` and `details.path`". Neither says which syscall raised it, and the BI's acceptance criterion is about the error code and the missing absolute path, not the syscall. Record it as not determined and not needed.

## 4. assess / resolve-assessment (2026-11-03T05:59:33.315Z)

**Question (verbatim):**

> Q2 — Open Question: should `write_note`'s editor-conflict errno set be `{EBUSY, EPERM, EACCES}` (as `append_note` and `patch_heading`) or `{EBUSY, EPERM}` (as `patch_block`)?
>
> Context: `mapFsWriteError` (`src/tools/_fs-errors.ts:49`) takes a per-tool `conflictErrnos` set. `append_note/handler.ts:50` and `patch_heading/handler.ts:57` pass `{EBUSY, EPERM, EACCES}`. `patch_block/handler.ts:56` passes `{EBUSY, EPERM}`, and refactor-decisions records that as a deliberate divergence. Errnos in the set become `CLI_REPORTED_ERROR` + `details.code: "EXTERNAL_EDITOR_CONFLICT"`, `reason: "file-locked"`. Other errnos become `FS_WRITE_FAILED` with a vault-relative `details.path`.
>
> | Option | Description |
> |---|---|
> | A (recommended) | `{EBUSY, EPERM, EACCES}`, the majority cohort set (append_note, patch_heading). One retry rule covers write_note, append_note and patch_heading exactly. Trade-off: a real permission-denied EACCES is reported as a conflict, the same trade-off those two tools already make. |
> | B | `{EBUSY, EPERM}`, the patch_block set. A non-lock EACCES stays `FS_WRITE_FAILED`, but write_note would then diverge from the two writers that create or extend whole notes. |
> | C | `{EBUSY}` only. The narrowest, but the observed live failure was EPERM, so it would not fix the reported case. |
>
> Recommended: A. It matches the report's goal that 'one retry rule covers every writer' for the closest siblings, and it fixes the observed EPERM case.

**Advisor** (escalate: none):

> B
>
> Map `EBUSY` and `EPERM` to `EXTERNAL_EDITOR_CONFLICT`. Keep `EACCES` as `FS_WRITE_FAILED`, with a vault-relative `details.path`. ADR-009 Decision point 7 names EACCES as a generic fs failure that must surface as `FS_WRITE_FAILED`. The write_note feature page also routes OS-reserved names (`CON.md` and similar, typically EACCES) to `FS_WRITE_FAILED`. Option A would reverse that for write_note. B still fixes the observed EPERM case and matches every sibling on the errnos they all treat as a lock.

Sources: `200-Decisions/ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/write_note.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/patch_heading.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Added a 'Clarified 2026-11-03 (/speckit-bug-assess Q2)' sentence to the Impact section's secondary-defect paragraph: EBUSY/EPERM → EXTERNAL_EDITOR_CONFLICT; EACCES stays FS_WRITE_FAILED per ADR-009 point 7 and the write_note feature page.

**Sent to the step:**

> B
>
> Map `EBUSY` and `EPERM` to `EXTERNAL_EDITOR_CONFLICT`. Keep `EACCES` as `FS_WRITE_FAILED`, with a vault-relative `details.path`. ADR-009 Decision point 7 names EACCES as a generic fs failure that must surface as `FS_WRITE_FAILED`. The write_note feature page also routes OS-reserved names (`CON.md` and similar, typically EACCES) to `FS_WRITE_FAILED`. Option A would reverse that for write_note. B still fixes the observed EPERM case and matches every sibling on the errnos they all treat as a lock.

## 5. repair / bug-fix (2026-11-03T06:03:03.281Z)

**Question (verbatim):**

> Q1 — Which name-lookup design should write_note use for a specific-mode `file`?
>
> Context: the assessment's Proposed Remediation (the contract for /speckit-bug-fix) says: call `resolveFileByTsv(deps, vault, file, "write_note")` (the `obsidian file` TSV lookup the sibling editors use via `resolveFsTarget`), and fall back to the vault-root short-form rule only when Obsidian answers `Error: File "<name>" not found.`. But `.memory/refactor-decisions.md` item 51 — which the code-quality review reads — records an owner ruling from the closed dry-run PR #126 (scope (a), 2026-11-03), marked "Settled … do NOT re-raise": write_note resolves the name through its own vault-confirming eval (`write_note/_template.ts` `NAME_LOOKUP_TEMPLATE` → `{vault: app.vault.getName(), path: getFirstLinkpathDest(file, '')?.path ?? null}`), NOT `resolveFileByTsv`, because the TSV cannot say which vault answered; a non-named vault gives `CLI_REPORTED_ERROR` / `details.code: "VAULT_MISMATCH"` `{vault, answeredBy, file}` with nothing written; null `path` falls back to the short-form rule; the lookup lives in `lookupNoteByName(deps, vault, file): Promise<string | null>`. That ruling came from a bug-test escalation that the dry run itself later called a false alarm (the probe had put `vault=` after the subcommand), but the vault check was kept "as protection against any misrouting, at no extra call". The dry run's code (commits 6afc4ad, cbcce78) still exists in the object store and passed the full suite and live probes. CodeGraph/assessment facts: `resolveFileByTsv` lives in `src/tools/_active-file.ts` and is shared by `_file-target.ts` and `find_and_replace`; either design adds no top-level error code and touches no kernel node.
>
> | Option | What I would build | Trade-off |
> |---|---|---|
> | A (recommended) | Follow refactor-decisions item 51: vault-confirming eval (`NAME_LOOKUP_TEMPLATE` + `nameLookupEvalResponseSchema` + `lookupNoteByName`, `VAULT_MISMATCH` sub-code under `CLI_REPORTED_ERROR`), ported from the dry run; errors via `mapFsWriteError` with `{EBUSY, EPERM}` as the assessment says. Logged in fix.md under Deviations from Assessment. | Matches the standing owner ruling, so the code review will not ask for the same restructuring again; already proven live in the dry run. Adds a `details.code` (`VAULT_MISMATCH`) the assessment did not name, and diverges from the sibling editors' TSV lookup. |
> | B | Follow the assessment as written: `resolveFileByTsv` + not-found fallback (`Error: File "<name>" not found.`). | Simpler, same lookup as `read`/`patch_*`, no new sub-code. Contradicts memory item 51, which the review will likely flag; item 51 would then need correcting as stale. |
>
> Recommendation: A — the memory explicitly says the ruling is settled and not to re-raise it, and the Relay rules ask me to follow the review memory's standing rules as I write.

**Advisor** (escalate: conflict: The assessment and the vault (BI-0176's acceptance criterion and ADR-032's cohort-parity rule) point to the shared TSV lookup. The repo's refactor-decisions item 51 records an owner ruling from closed dry-run PR #126 for a vault-confirming eval with a new VAULT_MISMATCH sub-code. Only the owner can say whether that ruling still stands, given its trigger was later called a false alarm.):

> B (recommended, pending owner)
>
> Use `resolveFileByTsv(deps, vault, file, "write_note")`, the same lookup as `read`, `patch_heading` and `patch_block`. Fall back to the vault-root short-form rule only on `Error: File "<name>" not found.`. Add no `VAULT_MISMATCH` sub-code. Map errors via `mapFsWriteError` with `{EBUSY, EPERM}`.
>
> Rationale: the BI's acceptance criterion is "the note chosen is the one reading by that name returns". ADR-032 names `resolveFileByTsv` as the cohort's single name-resolution path, "avoiding the 'name resolves differently than the rest of the surface' failure". The vault has no record of the PR #126 ruling or of `VAULT_MISMATCH`. By the agent's own account, that ruling rests on a probe the dry run later called a false alarm. Hold the build until the owner confirms whether item 51 still stands. If item 51 still stands, build A and log it under Deviations from Assessment.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0171 - Resolve File Locator In Patch Heading.md`, `XXX-Fix-It/Obsidian CLI MCP Discrepancies - 7 Repo-Internal Drift.md`

**Advisor, after the owner ruled** (escalate: none):

> B
>
> The owner ruled for B. Use `resolveFileByTsv(deps, vault, file, "write_note")`, the same `obsidian file` lookup `read`, `patch_heading` and `patch_block` use. Fall back to the vault-root short-form rule only on `Error: File "<name>" not found.`. Build no vault-confirming eval and no `VAULT_MISMATCH` sub-code. Map errors via `mapFsWriteError` with `{EBUSY, EPERM}`. Item 51 of `.memory/refactor-decisions.md` is superseded by this ruling. Note this in fix.md so the code review does not apply item 51.
>
> Rationale: owner ruling 2026-11-03, now recorded on BI-0176. It matches the BI's acceptance criterion ("the note chosen is the one reading by that name returns") and ADR-032's cohort parity rule.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Recorded the owner ruling 2026-11-03 (Q1 = B) in the Impact section: write_note resolves `file` via resolveFileByTsv with not-found fallback to the vault-root rule, no VAULT_MISMATCH; it supersedes refactor-decisions item 51, which needs correcting in a repo session.

**Owner:** choice 1 (B: TSV lookup, as assessed), via ntfy, 2026-11-03T06:04:34.515Z.

**Sent to the step:**

> B
>
> The owner ruled for B. Use `resolveFileByTsv(deps, vault, file, "write_note")`, the same `obsidian file` lookup `read`, `patch_heading` and `patch_block` use. Fall back to the vault-root short-form rule only on `Error: File "<name>" not found.`. Build no vault-confirming eval and no `VAULT_MISMATCH` sub-code. Map errors via `mapFsWriteError` with `{EBUSY, EPERM}`. Item 51 of `.memory/refactor-decisions.md` is superseded by this ruling. Note this in fix.md so the code review does not apply item 51.
>
> Rationale: owner ruling 2026-11-03, now recorded on BI-0176. It matches the BI's acceptance criterion ("the note chosen is the one reading by that name returns") and ADR-032's cohort parity rule.

## 6. repair / bug-fix (2026-11-03T06:04:59.062Z)

**Question (verbatim):**

> Q2 — May I make these edits to existing tests (refactor-decisions item 5 requires explicit sign-off before touching existing tests)?
>
> The new lookup spawn and the deliberate error-contract change (assessment: EPERM → EXTERNAL_EDITOR_CONFLICT; every FS_WRITE_FAILED carries a vault-relative `details.path`) make these existing cases fail unchanged:
>
> 1. `src/tools/write_note/handler.test.ts`: the four `020/US1` `file`-based cases (short-form → `<file>.md`, internal periods, `.md` verbatim, folder-separator rejection) each queue one extra lookup reply (a "no note has this name" answer) ahead of their existing responses — no assertion changes; test #9 (rename `EPERM`) changes its expected code from `FS_WRITE_FAILED` to `CLI_REPORTED_ERROR` with `details.code: "EXTERNAL_EDITOR_CONFLICT"` and its title accordingly (tmp-unlink assertion unchanged).
> 2. `src/tools/write_note/handler.file-type.test.ts`: the `file`-based cases (`Plan.canvas`, `version_1.2.3`, the ACCEPTED `test.each` rows that use `file`, the other-core-type `test.each`) queue the same extra lookup reply — no assertion changes.
> 3. `src/tools/write_note/handler.bytes-written.test.ts`: the stat-`EACCES` case's expected `details.path` changes from `"/test-vault/n.md"` to `"n.md"`.
>
> New tests go in new co-located files (`handler.note-name.test.ts`, `handler.fs-errors.test.ts`, and `_template.test.ts` under Q1 option A); `_handler-fixtures.ts` gains one canned lookup-reply helper. If any other existing assertion fails, I stop and raise it rather than edit it.
>
> | Option | Meaning |
> |---|---|
> | A (recommended) | Approve exactly the edits above, nothing else. |
> | B | Do not edit existing tests; I stop and report the fix as not-applied. |
>
> Recommendation: A — every edit follows from the assessment's deliberate contract change or from the new lookup spawn, and no expected `path`, `created` or `bytes_written` value changes.

**Advisor** (escalate: decision: The project rule (refactor-decisions item 5) reserves edits to existing tests for the owner's explicit sign-off. Only the owner can approve this list.):

> A (recommended, pending owner sign-off)
>
> Edit exactly the listed existing tests and nothing else:
> 1. `write_note/handler.test.ts`: the four `020/US1` `file` cases each queue one extra lookup reply ("not found" from the TSV lookup), with no assertion changes. In test #9 (rename EPERM), the expected code becomes `CLI_REPORTED_ERROR` with `details.code: "EXTERNAL_EDITOR_CONFLICT"`, and the title changes to match.
> 2. `handler.file-type.test.ts`: the listed `file` cases queue the same extra reply, with no assertion changes.
> 3. `handler.bytes-written.test.ts`: in the stat-EACCES case, the expected `details.path` changes from `/test-vault/n.md` to `n.md`. The code stays `FS_WRITE_FAILED`, per Q2.
>
> Drop `_template.test.ts`. Q1 was ruled B, so no eval template is built. Any other existing assertion that fails: stop and raise it.
>
> Rationale: every edit follows from the Q1 = B ruling (TSV lookup spawn) and the BI's lock acceptance criterion (sibling-matching code, no absolute path). Item 5 of refactor-decisions reserves existing-test edits for the owner, as the earlier test-edit approvals recorded on BI-0169 and BI-0170 show.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0169 - Match Multi Word Search Queries As Literal Phrases.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0170 - Stop Trimming Context Search Match Text.md`

**Advisor, after the owner ruled** (escalate: none):

> A
>
> The owner approved exactly these edits:
> - `write_note/handler.test.ts`: the four `020/US1` `file` cases each queue one extra lookup "not found" reply, with no assertion changes. In test #9 (rename EPERM), the expected code becomes `CLI_REPORTED_ERROR` with `details.code: "EXTERNAL_EDITOR_CONFLICT"`, and the title changes to match. The tmp-unlink assertion stays as is.
> - `handler.file-type.test.ts`: the listed `file` cases queue the same extra reply, with no assertion changes.
> - `handler.bytes-written.test.ts`: in the stat-EACCES case, the expected `details.path` changes from `/test-vault/n.md` to `n.md`. The code stays `FS_WRITE_FAILED`.
>
> Don't add `_template.test.ts`, since Q1 was ruled B. Any other existing assertion that fails: stop and raise it.
>
> Rationale: owner ruling 2026-11-03 under refactor-decisions item 5, now recorded on BI-0176.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0176 - Resolve File Locator On Write Note Overwrite.md`: Appended an audit comment recording the owner ruling 2026-11-03 (Q2 = A): the exact approved existing-test edits in the three write_note test files, no _template.test.ts, any other failure stops for owner review.

**Owner:** choice 1 (A: approve exactly these edits), via ntfy, 2026-11-03T06:05:45.175Z.

**Sent to the step:**

> A
>
> The owner approved exactly these edits:
> - `write_note/handler.test.ts`: the four `020/US1` `file` cases each queue one extra lookup "not found" reply, with no assertion changes. In test #9 (rename EPERM), the expected code becomes `CLI_REPORTED_ERROR` with `details.code: "EXTERNAL_EDITOR_CONFLICT"`, and the title changes to match. The tmp-unlink assertion stays as is.
> - `handler.file-type.test.ts`: the listed `file` cases queue the same extra reply, with no assertion changes.
> - `handler.bytes-written.test.ts`: in the stat-EACCES case, the expected `details.path` changes from `/test-vault/n.md` to `n.md`. The code stays `FS_WRITE_FAILED`.
>
> Don't add `_template.test.ts`, since Q1 was ruled B. Any other existing assertion that fails: stop and raise it.
>
> Rationale: owner ruling 2026-11-03 under refactor-decisions item 5, now recorded on BI-0176.
