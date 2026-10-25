# Relay Q&A log: speckit

Run `obsidian-cli-mcp-bi-0014-dry-2026-10-25`, started 2026-10-25T02:59:20.204Z.

## 1. pre-implementation / preflight (2026-10-25T02:59:20.254Z)

**Question (verbatim):**

> Preflight for this Relay run of job BI-0014. Do every check, then answer.
>
> 1. Vault identity, now, even if you checked earlier in this conversation (Obsidian may have switched vaults since): with obsidian-cli-mcp, using the vault display name in your CLAUDE.md, read the `vault_id` property of `000-Meta/Vault Identity.md`. It must equal the `expected_vault_id` in your CLAUDE.md. If this conversation hasn't yet done your CLAUDE.md's session-start reads, do them now too.
> 2. Find the backlog note for BI-0014 in the vault.
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

> Primed for BI-0014 — Add List Tags.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-003, ADR-006, ADR-007, ADR-010. Session-start reads done: MCP Tool Notes index plus the Obsidian CLI MCP per-MCP file, Best Practices, Decision Log, Session Handover, About This Vault.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Preflight checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which matches `expected_vault_id: my-setup` (CLI display name `My-Setup-Vault`).
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`. Title "Add List Tags". The H1 reads "BI-014 — Add List Tags", an old 3-digit form; this is cosmetic and does not affect the run.
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (body: *Queued*, Wave 2 follow-up). The work is neither finished nor abandoned.
> 5. Specify prompt: PASS. A `## /speckit-specify prompt` section exists, and the prompt starts with `/speckit-specify Add List Tags — …`, which is the dash form. The note was not changed.
> 6. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, ref "BI-0014 - Add List Tags"). Its answering rules apply to every question that follows.
>
> Things the clarify questions may need to settle (not blockers):
> - The BI prompt (last rewritten 2026-05-08) gives the tool the `target_mode` + `vault` + file/path shape. But the Architecture's "Tool categories" and "Target-mode intent" sections say inherently vault-wide tools use an optional `vault?` and no `target_mode`, because ADR-003's scope doesn't cover them. This tool is vault-wide by default, with optional file scoping.
> - The prompt was written before several sibling tools shipped (`tag` for files-by-tag, `properties` with `total: true`, the ADR-015 sub-discriminators, the ADR-029/030 dispatch recovery). The output-shape and count-mode conventions may need to follow those tools.

Sources: `000-Meta/Vault Identity.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `Obsidian CLI MCP - Architecture`, `ADR-003 - Enforce Target Mode in Typed Tools`, `ADR-006 - Centralized Tool Registration`, `ADR-007 - Centralized CLI Bounds with Selective Override`, `ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand`, `000-Meta/MCP Tool Notes.md`, `000-Meta/MCP Tool Notes/Obsidian CLI MCP - Tool Notes.md`, `210-Guidelines/Best Practices.md`, `200-Decisions/Decision Log.md`, `220-Planning/Session Handover.md`, `000-Meta/About This Vault.md`

**Sent to the step:**

> Primed for BI-0014 — Add List Tags.
> Read: BI, Constitution (v1.5.1), Architecture (ARCH-014), ADR-003, ADR-006, ADR-007, ADR-010. Session-start reads done: MCP Tool Notes index plus the Obsidian CLI MCP per-MCP file, Best Practices, Decision Log, Session Handover, About This Vault.
> Role: BA + Solution Architect, answering for Claude Code.
> Awaiting clarification questions.
>
> Preflight checks:
> 1. Vault identity: PASS. `000-Meta/Vault Identity.md` → `vault_id: my-setup`, which matches `expected_vault_id: my-setup` (CLI display name `My-Setup-Vault`).
> 2. Note found: PASS. `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`. Title "Add List Tags". The H1 reads "BI-014 — Add List Tags", an old 3-digit form; this is cosmetic and does not affect the run.
> 3. Initiative: PASS. `initiative: "[[Obsidian CLI MCP]]"`.
> 4. Status: PASS. `status: planned` (body: *Queued*, Wave 2 follow-up). The work is neither finished nor abandoned.
> 5. Specify prompt: PASS. A `## /speckit-specify prompt` section exists, and the prompt starts with `/speckit-specify Add List Tags — …`, which is the dash form. The note was not changed.
> 6. Clarify skill: LOADED (`anthropic-skills:speckit-clarify-skill`, ref "BI-0014 - Add List Tags"). Its answering rules apply to every question that follows.
>
> Things the clarify questions may need to settle (not blockers):
> - The BI prompt (last rewritten 2026-05-08) gives the tool the `target_mode` + `vault` + file/path shape. But the Architecture's "Tool categories" and "Target-mode intent" sections say inherently vault-wide tools use an optional `vault?` and no `target_mode`, because ADR-003's scope doesn't cover them. This tool is vault-wide by default, with optional file scoping.
> - The prompt was written before several sibling tools shipped (`tag` for files-by-tag, `properties` with `total: true`, the ADR-015 sub-discriminators, the ADR-029/030 dispatch recovery). The output-shape and count-mode conventions may need to follow those tools.

## 2. pre-implementation / specify (2026-10-25T03:00:26.494Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of job BI-0014's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

**Advisor** (escalate: none):

> /speckit-specify Add List Tags — A typed MCP tool that returns the vault's tag index (or a single file's tag set) with optional per-tag occurrence counts.
>
> Why we want this. Tag-index discovery — "what tags are in use, with what frequency" — drives tag-quality audits, rename planning, and tag-shape exploration. The underlying CLI exposes this surface but returns plain text; agents that consume it must parse the lines themselves. A typed surface returns a structured array directly with first-class count semantics.
>
> Tool surface — tags:
>
> Inputs:
> - target_mode: "specific" | "active" (required) — the project's standard target-mode discriminator. Specific mode demands a vault; active mode forbids `vault` and operates on the focused vault.
> - vault: string — vault display name; required in specific mode, forbidden in active mode.
> - file: string (optional) — when set, restrict the listing to a single file's tag set (wikilink form).
> - path: string (optional) — same as file but vault-relative path with extension.
> - activeOnly: boolean (optional, default false) — when true, restrict the listing to whichever file Obsidian's editor currently has focused. Mutually exclusive with file/path.
> - sortByCount: boolean (optional, default false) — when true, sort results by occurrence count descending. Default is by tag name (alphabetical).
> - includeCounts: boolean (optional, default true) — when true, include per-tag occurrence counts. When false, return names only.
>
> Constraint: at most ONE of `file`, `path`, `activeOnly` may be set. Multiple is a validation failure. When none is set, the listing is vault-wide.
>
> Outputs:
> - total: number — the number of tags returned.
> - tags: { name: string, count?: number }[] — the tag list. `count` is omitted from each entry when `includeCounts: false`.
>
> Acceptance criteria. Priority labels: P1 = must-pass to ship; P2 = should-pass; P3 = nice-to-have.
>
> [P1]
> 1. With no scoping (no file / path / activeOnly), the response contains the vault-wide tag index with counts.
> 2. With `file` set, the response contains only that file's tags.
> 3. With `path` set, the same scoping behaviour as `file`.
> 4. With `activeOnly: true`, the response contains the focused file's tags.
> 5. `sortByCount: true` returns the tags ordered by count descending; default ordering is alphabetical by name.
> 6. `includeCounts: false` returns name-only entries (no `count` field on any element).
> 7. A vault with no tags returns `{ total: 0, tags: [] }` — no error.
> 8. Tag-shaped tokens inside fenced code blocks are NOT counted (verified against a fixture).
> 9. Two of (file, path, activeOnly) supplied together fail validation; no underlying CLI call occurs.
> 10. Specific-mode without `vault` fails validation.
> 11. Any input with an unknown top-level key fails validation; no underlying CLI call occurs.
> 12. Active-mode with `vault` supplied fails validation.
> 13. `activeOnly: true` with no focused note fails with a structured error directing the caller to focus a note or switch to file/path.
>
> [P2]
> 14. The published tool documentation (served via the project's progressive-disclosure help facility) provides full per-field input contract, output shape, error roster, and at least four worked examples (vault-wide; file-scoped; sortByCount; activeOnly). The current placeholder stub is replaced.
> 15. Each acceptance criterion above is locked by at least one regression test that survives subsequent re-runs unchanged.
>
> [P3]
> 16. Tags whose name matches a known Obsidian-built-in tag pattern are returned the same as user-defined tags (no special casing).
>
> Adversarial edge cases. The implementation MUST handle, document, or explicitly defer each of the following.
>
> CONCURRENCY:
> - Files may be added, removed, or have their tags edited during the listing. Results reflect the underlying enumeration's snapshot semantics; document the staleness window.
>
> CONTENT:
> - Tag-shaped tokens inside fenced code blocks (e.g. `#hashtag` in a code sample) MUST NOT contribute to counts. This is a known wrapper-era fidelity gap that the underlying surface fixes natively; this tool inherits the fix.
> - Tags with non-ASCII or non-Latin characters — capture observable behaviour (does the underlying index treat them the same as ASCII tags?).
> - Hierarchical tags (`#parent/child`) — both forms should appear in the index; whether the parent's count includes the child's occurrences is a documented underlying-surface decision, not a wrapper concern.
> - Tags inside frontmatter `tags:` lists vs inline `#hashtag` markers — both surface in the index by default.
>
> LIMITS:
> - A vault with thousands of unique tags. The output cap applies; document the practical ceiling.
>
> UNDERLYING:
> - An unknown vault display name may produce a response that the bridge's classifier does not treat as an error. The implementation MUST handle this case explicitly.
>
> CLIENT-CLASS:
> - The validation behaviour for "unknown top-level keys" (criterion 11) is directly observable only from MCP clients that forward unknown keys to the server. Document the dual-pathway distinction in the test case.
>
> SECURITY:
> - The `vault`, `file`, `path` inputs are caller-supplied. Path-traversal on `path` MUST either be rejected at the validation boundary or be verified to be rejected by the underlying layer.
>
> This BI's deliverable MUST satisfy the project Constitution. Test coverage, attribution headers, structured error propagation, zod-as-source-of-truth, and modular organisation are all mandatory and are defined in `.specify/memory/constitution.md`.
>
> Out of scope:
> - Tag mutation (rename, add, remove) — separate future feature; out of reach today via the underlying surface alone.
> - Files-by-tag listing ("which files have tag X") — separate future feature.
> - Cross-vault tag aggregation — caller iterates per-vault.
> - Hierarchical-tag rollup (parent count includes children) — inherited from the underlying surface's decision; the wrapper does not reshape.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`

**Sent to the step:**

> /speckit-specify Add List Tags — A typed MCP tool that returns the vault's tag index (or a single file's tag set) with optional per-tag occurrence counts.
>
> Why we want this. Tag-index discovery — "what tags are in use, with what frequency" — drives tag-quality audits, rename planning, and tag-shape exploration. The underlying CLI exposes this surface but returns plain text; agents that consume it must parse the lines themselves. A typed surface returns a structured array directly with first-class count semantics.
>
> Tool surface — tags:
>
> Inputs:
> - target_mode: "specific" | "active" (required) — the project's standard target-mode discriminator. Specific mode demands a vault; active mode forbids `vault` and operates on the focused vault.
> - vault: string — vault display name; required in specific mode, forbidden in active mode.
> - file: string (optional) — when set, restrict the listing to a single file's tag set (wikilink form).
> - path: string (optional) — same as file but vault-relative path with extension.
> - activeOnly: boolean (optional, default false) — when true, restrict the listing to whichever file Obsidian's editor currently has focused. Mutually exclusive with file/path.
> - sortByCount: boolean (optional, default false) — when true, sort results by occurrence count descending. Default is by tag name (alphabetical).
> - includeCounts: boolean (optional, default true) — when true, include per-tag occurrence counts. When false, return names only.
>
> Constraint: at most ONE of `file`, `path`, `activeOnly` may be set. Multiple is a validation failure. When none is set, the listing is vault-wide.
>
> Outputs:
> - total: number — the number of tags returned.
> - tags: { name: string, count?: number }[] — the tag list. `count` is omitted from each entry when `includeCounts: false`.
>
> Acceptance criteria. Priority labels: P1 = must-pass to ship; P2 = should-pass; P3 = nice-to-have.
>
> [P1]
> 1. With no scoping (no file / path / activeOnly), the response contains the vault-wide tag index with counts.
> 2. With `file` set, the response contains only that file's tags.
> 3. With `path` set, the same scoping behaviour as `file`.
> 4. With `activeOnly: true`, the response contains the focused file's tags.
> 5. `sortByCount: true` returns the tags ordered by count descending; default ordering is alphabetical by name.
> 6. `includeCounts: false` returns name-only entries (no `count` field on any element).
> 7. A vault with no tags returns `{ total: 0, tags: [] }` — no error.
> 8. Tag-shaped tokens inside fenced code blocks are NOT counted (verified against a fixture).
> 9. Two of (file, path, activeOnly) supplied together fail validation; no underlying CLI call occurs.
> 10. Specific-mode without `vault` fails validation.
> 11. Any input with an unknown top-level key fails validation; no underlying CLI call occurs.
> 12. Active-mode with `vault` supplied fails validation.
> 13. `activeOnly: true` with no focused note fails with a structured error directing the caller to focus a note or switch to file/path.
>
> [P2]
> 14. The published tool documentation (served via the project's progressive-disclosure help facility) provides full per-field input contract, output shape, error roster, and at least four worked examples (vault-wide; file-scoped; sortByCount; activeOnly). The current placeholder stub is replaced.
> 15. Each acceptance criterion above is locked by at least one regression test that survives subsequent re-runs unchanged.
>
> [P3]
> 16. Tags whose name matches a known Obsidian-built-in tag pattern are returned the same as user-defined tags (no special casing).
>
> Adversarial edge cases. The implementation MUST handle, document, or explicitly defer each of the following.
>
> CONCURRENCY:
> - Files may be added, removed, or have their tags edited during the listing. Results reflect the underlying enumeration's snapshot semantics; document the staleness window.
>
> CONTENT:
> - Tag-shaped tokens inside fenced code blocks (e.g. `#hashtag` in a code sample) MUST NOT contribute to counts. This is a known wrapper-era fidelity gap that the underlying surface fixes natively; this tool inherits the fix.
> - Tags with non-ASCII or non-Latin characters — capture observable behaviour (does the underlying index treat them the same as ASCII tags?).
> - Hierarchical tags (`#parent/child`) — both forms should appear in the index; whether the parent's count includes the child's occurrences is a documented underlying-surface decision, not a wrapper concern.
> - Tags inside frontmatter `tags:` lists vs inline `#hashtag` markers — both surface in the index by default.
>
> LIMITS:
> - A vault with thousands of unique tags. The output cap applies; document the practical ceiling.
>
> UNDERLYING:
> - An unknown vault display name may produce a response that the bridge's classifier does not treat as an error. The implementation MUST handle this case explicitly.
>
> CLIENT-CLASS:
> - The validation behaviour for "unknown top-level keys" (criterion 11) is directly observable only from MCP clients that forward unknown keys to the server. Document the dual-pathway distinction in the test case.
>
> SECURITY:
> - The `vault`, `file`, `path` inputs are caller-supplied. Path-traversal on `path` MUST either be rejected at the validation boundary or be verified to be rejected by the underlying layer.
>
> This BI's deliverable MUST satisfy the project Constitution. Test coverage, attribution headers, structured error propagation, zod-as-source-of-truth, and modular organisation are all mandatory and are defined in `.specify/memory/constitution.md`.
>
> Out of scope:
> - Tag mutation (rename, add, remove) — separate future feature; out of reach today via the underlying surface alone.
> - Files-by-tag listing ("which files have tag X") — separate future feature.
> - Cross-vault tag aggregation — caller iterates per-vault.
> - Hierarchical-tag rollup (parent count includes children) — inherited from the underlying surface's decision; the wrapper does not reshape.

## 3. pre-implementation / clarify (2026-10-25T03:03:58.049Z)

**Question (verbatim):**

> ## Question 1: How should `target_mode` combine with the scope fields (`file` / `path` / `activeOnly`)?
>
> **Context**: The feature description says "active mode forbids `vault`", and the spec currently assumes `file` and `path` stay allowed in both modes. Neither existing target-mode refinement does that:
> - The standard per-file refinement (used by 15 tool schemas, e.g. `outline`, `read_property`) forbids `vault`, `file` AND `path` in active mode, and requires exactly one of `file`/`path` in specific mode. So a vault-wide listing would be impossible.
> - The folder-scoped variant (used by `files`, `paths`, `get_active_file`) forbids only `vault` in active mode, but rejects `file`/`path` in **both** modes.
>
> So `tags` needs a third, tool-local rule whichever way this goes. ADR-003 (Enforce Target Mode in Typed Tools) governs this convention. The closest precedent is ADR-032 (Find And Replace File Scope via Sibling Locators), which kept a tool-local scope rule rather than amending ADR-003.
>
> **What we need to know**: In active mode, may the caller still name a note with `file` / `path`? And what does `activeOnly: true` mean in specific mode?
>
> **Recommended:** Option A. It matches the feature description as written, keeps every scope reachable in both modes, and mirrors the upstream `obsidian tags` flags directly. The tool-local rule gets recorded as a feature-specific ADR in the ADR-032 style, so ADR-003 stays unamended.
>
> | Option | Description |
> |--------|-------------|
> | A | Active mode forbids only `vault`. `file`, `path` and `activeOnly` are allowed in both modes (at most one). In active mode they resolve inside the focused vault; in specific mode, `activeOnly` means the focused note of the named vault (error if it has none). Tool-local refinement plus a new feature-specific ADR; ADR-003 unamended. |
> | B | Active mode forbids `vault`, `file` and `path` (as in the per-file cohort); only vault-wide or `activeOnly` is allowed there. Specific mode allows any one of `file` / `path` / `activeOnly`, or none for vault-wide. Closer to the cohort habit, but still a tool-local rule. |
> | C | Active mode means "the focused note" (implicit `activeOnly`, so `file`/`path`/`activeOnly` are forbidden). Specific mode means vault-wide or `file`/`path`. The `activeOnly` field is dropped from the surface. This conflicts with the feature description's input list. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: conflict: The BI-0014 prompt (2026-05-08) gives `tags` a `target_mode` discriminator, but ADR-032 (2026-06-30) and the Architecture page keep `target_mode` off inherently vault-wide tools in favour of optional `vault` plus sibling locators. Options A and B would also need a new feature-specific ADR, which is a new decision.):

> 1. None of A/B/C. Drop `target_mode` from `tags`. Use the ADR-032 sibling-locator pattern: optional `vault` (focused vault when absent), optional `file` | `path` | `activeOnly`, at most one of the three. No scope field set → vault-wide. `activeOnly: true` forbids `vault`/`file`/`path`. `vault` alongside `file`/`path` picks the note's vault. `activeOnly` with no open note → existing `ERR_NO_ACTIVE_FILE`. Scope conflicts → `VALIDATION_ERROR` + `details.code`/`details.reason` (ADR-015). Zero new top-level codes. ADR-003 left unamended. No new ADR needed: ADR-032 already covers this pattern. Rewrite AC 10/12 to fit (no specific/active mode checks); AC 9 and AC 13 stay.
>
> Rationale: ADR-032 (decided 2026-06-30, after the BI prompt of 2026-05-08) keeps `target_mode` off inherently vault-wide tools and says its pattern is reusable for "any future inherently-vault-wide tool that later gains an optional single-note or open-note scope". The Architecture page says the same: inherently vault-wide tools expose optional `vault?`, not `target_mode`. The closest siblings, `properties` and `tag`, follow it. Pending owner ruling, because the BI's input list still says `target_mode`.

Sources: `ADR-032 - Find And Replace File Scope via Sibling Locators`, `ADR-003 - Enforce Target Mode in Typed Tools`, `ADR-015 - Sub-Discriminators via details.reason for Multi-State Error Codes`, `Obsidian CLI MCP - Architecture`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`

**Advisor, after the owner ruled** (escalate: none):

> 1. A
>
> Owner ruling: keep `target_mode`, using the Option A scope matrix. Record the tool-local rule as feature-specific ADR-038, written in the style of ADR-032. Leave ADR-003 unamended.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `ADR-003 - Enforce Target Mode in Typed Tools`, `ADR-032 - Find And Replace File Scope via Sibling Locators`, `000-Meta/Bases/Type ID Index.base`, `200-Decisions/Decision Log.md`

Edits:
- `200-Decisions/ADR-038 - Tags Target Mode Scope Matrix.md`: Would create ADR-038 (next id after ADR-037 per the Type ID Index base) from the ADR Template with status decided, initiatives [[Obsidian CLI MCP]], date_decided 2026-10-25. Decision: `tags` keeps `target_mode`; active mode forbids only `vault`; `file`/`path`/`activeOnly` (at most one) are allowed in both modes and resolve in the focused vault (active) or the named vault (specific); `activeOnly` in specific mode means the named vault's focused note, and errors if it has none; with no scope field, the listing is vault-wide. Rationale: matches the BI input list and the upstream `obsidian tags` flags. Alternatives: B, C, and the ADR-032 sibling-locator pattern (rejected by the owner ruling). ADR-003 unamended. No Constitution checklist row.
- `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`: Would add a Related Notes bullet pointing at ADR-038, recording that `tags` deliberately departs from ADR-032's reusable vault-wide pattern by owner ruling. The Decision text would not change.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Would add [[ADR-038 - Tags Target Mode Scope Matrix]] to Related, append a dated HTML-comment audit line recording the 2026-10-25 clarify ruling (Option A; target_mode kept; ADR-038), and bump `updated:` to 2026-10-25. The /speckit-specify prompt would not change.

**Owner:** choice 2 (Keep target_mode: option A), via ntfy, 2026-10-25T03:21:35.876Z.

**Sent to the step:**

> 1. A
>
> Owner ruling: keep `target_mode`, using the Option A scope matrix. Record the tool-local rule as feature-specific ADR-038, written in the style of ADR-032. Leave ADR-003 unamended.

## 4. pre-implementation / clarify (2026-10-25T03:22:46.408Z)

**Question (verbatim):**

> ## Question 2: In what form does `tags[].name` come back?
>
> **Context**: The spec currently assumes names come back without a leading `#` (Assumptions, "Tag name form"), and FR-007 requires that a name from `tags` can be passed straight to the existing `tag` tool.
> - The `tag` tool's input schema trims the value and then strips a single leading `#` (`src/tools/tag/schema.ts:11`). So both `project` and `#project` work as input there, but `##project` would not.
> - Obsidian's index stores inline tags *with* `#` and frontmatter tags *without* it (BI-028 research F6/F8). The upstream `obsidian tags` text output is expected to print them with `#` (to be confirmed live at T0).
>
> The answer fixes the published output shape, every regression test's expected values, and the worked examples in the help document.
>
> **What we need to know**: Should the wrapper strip the leading `#` from each name, or pass names through in the form the underlying surface reports?
>
> **Recommended:** Option A. One canonical form regardless of where a tag came from (frontmatter or inline). It matches the form `tag` normalises to, so names round-trip cleanly. It also matches the frontmatter `tags:` form agents write back with `set_property`.
>
> | Option | Description |
> |--------|-------------|
> | A | Strip one leading `#`. Names come back bare (`project/alpha`), whatever the source. |
> | B | Keep the leading `#` (`#project/alpha`), normalised so every name carries exactly one. Mirrors Obsidian's tag-pane display and the expected upstream text form. |
> | C | Pass through whatever the underlying surface returns, without normalising. The form could then differ between scopes or upstream versions, which weakens FR-007. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 2. A
>
> Rationale: the `tag` feature page (FEAT-018) uses the bare form as the canonical tag form. Its input contract trims the value, then strips one leading `#` (TC-00273 locks this). It also treats frontmatter and inline tags alike through `metadataCache`. Returning bare names from `tags` keeps one form whatever the source, and lets FR-007's round trip into `tag` work.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/tag.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00273 - Leading Hash Stripped From Input Tag.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`

**Sent to the step:**

> 2. A
>
> Rationale: the `tag` feature page (FEAT-018) uses the bare form as the canonical tag form. Its input contract trims the value, then strips one leading `#` (TC-00273 locks this). It also treats frontmatter and inline tags alike through `metadataCache`. Returning bare names from `tags` keeps one form whatever the source, and lets FR-007's round trip into `tag` work.

## 5. pre-implementation / clarify (2026-10-25T03:23:38.351Z)

**Question (verbatim):**

> ## Question 3: What sort order defines "alphabetical by name" (the default ordering and the tie-break under `sortByCount`)?
>
> **Context**: FR-004 currently says a single, documented, deterministic sort order applies to both the default ordering and count ties, but doesn't name it (Assumptions defers it to plan). The repo already uses three different orders:
> - `properties`, the closest sibling (a vault-wide name inventory with counts), sorts case-insensitively first, then by byte order to break ties. Its test `sort order — drift-adjacent case-distinct pairs` locks `Aardvark, aardvark, Banana, Tags, tags`.
> - `files` sorts by UTF-8 byte order (`compareUtf8Bytes`, `src/tools/files/handler.ts:72`).
> - `bases`, `search`, `find_and_replace` and others use the default JS `.sort()` (UTF-16 code-unit order).
>
> Tags often come in case variants (`#Project` vs `#project`, which the wrapper won't merge per FR-008) and non-ASCII names, so the order decides where those land and fixes the expected values in the AC 5 tests.
>
> **What we need to know**: Which order should `tags` use?
>
> **Recommended:** Option A. It matches the closest sibling inventory tool, so agents see one convention across the two name-inventory tools. Case variants sit next to each other (useful for tag-quality audits), and the byte-order tie-break keeps the result fully deterministic.
>
> | Option | Description |
> |--------|-------------|
> | A | Case-insensitive first, then byte order to break ties (the `properties` convention): `Aardvark, aardvark, Banana`. |
> | B | Pure UTF-8 byte order (the `files` convention): every uppercase ASCII letter before every lowercase one, `Aardvark, Banana, aardvark`. |
> | C | Keep the order the underlying `obsidian tags` reports ("default: name") without re-sorting. That order isn't documented and could drift between upstream versions. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 3. Use A: the primary key is an ASCII lower-fold of the name, and ties break by UTF-8 byte order. The same comparator serves as the default order and breaks count ties under `sortByCount`. Non-ASCII characters are not folded; they compare by bytes. Lock this with an AC 5 fixture of case variants (`Aardvark, aardvark, Banana`).
>
> Rationale: this is the `properties` convention (feature page, Q1/A1: case-insensitive primary, byte-order tiebreak; TC-00197). On `properties` the tiebreak can't be observed, because upstream merges case variants first. For `tags` the wrapper does not merge (FR-008), so the tiebreak shows and must be tested. The ASCII-only fold matches the `tag` tool's lower-fold (FEAT-018, TC-00272).

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/properties.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/tag.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`

**Sent to the step:**

> 3. Use A: the primary key is an ASCII lower-fold of the name, and ties break by UTF-8 byte order. The same comparator serves as the default order and breaks count ties under `sortByCount`. Non-ASCII characters are not folded; they compare by bytes. Lock this with an AC 5 fixture of case variants (`Aardvark, aardvark, Banana`).
>
> Rationale: this is the `properties` convention (feature page, Q1/A1: case-insensitive primary, byte-order tiebreak; TC-00197). On `properties` the tiebreak can't be observed, because upstream merges case variants first. For `tags` the wrapper does not merge (FR-008), so the tiebreak shows and must be tested. The ASCII-only fold matches the `tag` tool's lower-fold (FEAT-018, TC-00272).

## 6. pre-implementation / clarify (2026-10-25T03:24:27.165Z)

**Question (verbatim):**

> ## Question 4: When a tag exists only as part of a hierarchical tag (`#parent/child` with no bare `#parent` anywhere), must `parent` appear as its own entry?
>
> **Context**: The feature description says "Hierarchical tags (`#parent/child`) — both forms should appear in the index". It also says parent-includes-children rollup is out of scope and the wrapper does not reshape (FR-008). The spec currently returns parent entries "if reported" by the underlying index. Obsidian's metadata-cache tag index records the full tag strings that are actually written, and the tag-pane tree builds parent nodes for display. So the upstream `obsidian tags` listing is expected to omit an implied-only parent (to be confirmed live at T0).
>
> Structural fact: the existing `tag` tool already does segment-bounded child subsumption (`tag` with `parent` returns notes tagged `parent/child`; FEAT-018). So an implied parent stays queryable through the FR-007 round trip, even if `tags` doesn't list it.
>
> This decides whether the wrapper synthesises entries, what count (if any) such an entry carries, and the AC 1 / hierarchical fixture expectations.
>
> **What we need to know**: Should `tags` add entries for implied-only parents?
>
> **Recommended:** Option A. It keeps FR-008's no-reshape rule and avoids inventing a count, which would either be a rollup (out of scope) or a fake zero. The help document explains that implied parents are reachable through `tag`. "Both forms appear" then holds whenever both forms are actually written in the vault.
>
> | Option | Description |
> |--------|-------------|
> | A | No synthesis. List exactly the tags the underlying index reports. An implied-only parent is absent, and the help document says so and points to `tag` subsumption. The fixture asserts the observed upstream behaviour (T0). |
> | B | Add a separate entry for each missing ancestor, with `count` omitted (or 0) to mark it as implied. Adds a wrapper-invented entry kind and breaks `total` = tags actually written. |
> | C | Add missing ancestors whose `count` is the sum of their descendants' counts. This is the hierarchical rollup the feature description lists as out of scope. |
> | Short | Provide a different short answer (<=5 words) |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 4. A

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/tag.md`

**Sent to the step:**

> 4. A
