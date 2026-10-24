# Relay Q&A log: speckit

Run `dry-run-bi-0014`, started 2026-10-24T09:57:29.137Z.

## 1. pre-implementation / specify (2026-10-24T09:57:29.154Z)

**Question (verbatim):**

> Return the full content of the "/speckit-specify prompt" section of this backlog item's note, verbatim and complete, in `answer`, without the surrounding code fence. Do not edit or summarise it. If the note has no such section, set escalate to ungrounded.

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

## 2. pre-implementation / clarify (2026-10-24T10:01:24.970Z)

**Question (verbatim):**

> ## Question 1: Form of tag names in output
>
> **Context**: The spec currently says names are returned "verbatim as the underlying index reports them (including or excluding a leading `#`)". Earlier probes (BI-028 research F2) showed Obsidian's tag index keys carry the `#` (`["#bi-005","#fixture","#alpha",…]`). The sibling `tag` tool strips one leading `#` from its input, and `properties` returns bare names. Frontmatter `tags:` lists store tags without `#`.
>
> **Recommended:** Option A. A bare name matches how tags are written in frontmatter, how `tag` normalises its input, and how `properties` reports names. That makes rename planning and comparisons with frontmatter values direct, with no prefix to strip. Removing the `#` only drops the syntax marker; it does not change the tag itself.
>
> | Option | Description |
> |--------|-------------|
> | A | Bare names: strip exactly one leading `#` from each name (`alpha`, `parent/child`). |
> | B | `#`-prefixed names: always return with a leading `#` (`#alpha`), normalising if the index ever omits it. |
> | C | Verbatim: return whatever the underlying index gives, and document the observed form (current spec default). |
> | Short | Provide a different short answer (<=5 words). |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 1. A
>
> Same normalisation as sibling `tag`, which strips one leading `#` from its input (Features/tag.md, TC-00273, BI-0044 clarify Q4). Wrapper-era `list_tags` also returned bare names (`a/b`, `a`). Only the sigil is dropped: hierarchical entries and counts still pass through unchanged, per the BI's "wrapper does not reshape" rule.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/tag.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Cases/TC-00273 - Leading Hash Stripped From Input Tag.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0044 - Add List Files With Tag.md`, `000-Meta/MCP Tool Notes/Obsidian Modified MCP Server - Tool Notes.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Research/Obsidian CLI.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Added a 2026-10-24 HTML comment recording clarify Q1: output tag names are bare, with exactly one leading # stripped.

**Sent to the step:**

> 1. A
>
> Same normalisation as sibling `tag`, which strips one leading `#` from its input (Features/tag.md, TC-00273, BI-0044 clarify Q4). Wrapper-era `list_tags` also returned bare names (`a/b`, `a`). Only the sigil is dropped: hierarchical entries and counts still pass through unchanged, per the BI's "wrapper does not reshape" rule.

## 3. pre-implementation / clarify (2026-10-24T10:02:51.994Z)

**Question (verbatim):**

> ## Question 2: Tags differing only by letter case
>
> **Context**: The spec's Edge Cases say case variants (`#Alpha` vs `#alpha`) are "reported as the underlying index reports them — merged or separate — without wrapper reshaping." Earlier probes (BI-028 F2) found Obsidian's tag index keys are case-preserved: `Alpha` and `alpha` are distinct keys, and the native `tag` lookup is case-sensitive. Obsidian's tag pane, however, groups case variants together. The sibling `tag` tool folds case for its *lookup* only. `properties` keeps case-distinct names as separate entries and sorts them next to each other, so drift stays visible (`src/tools/properties/handler.ts:76`).
>
> **Recommended:** Option A. It follows the "wrapper does not reshape" rule and matches `properties`. Case-distinct entries are themselves a tag-quality audit finding, so merging them in the wrapper would hide exactly what audits look for. If the CLI turns out to merge, that behaviour is documented as inherited.
>
> | Option | Description |
> |--------|-------------|
> | A | Inherit: never merge in the wrapper. Case variants appear as separate entries whenever the index keeps them separate; the observed behaviour is characterised at plan stage and documented. |
> | B | Always separate: guarantee one entry per case variant with its own count, even if the CLI merges them (may force a different data source). |
> | C | Always merge: fold case in the wrapper and sum counts into one entry (display name chosen by a fixed rule). |
> | Short | Provide a different short answer (<=5 words). |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 2. Inherit (A). Wrapper never merges or splits case variants. Spec must not promise "separate entries" or "merged entries". Probe the CLI at plan stage, then write the observed behaviour into the spec and help doc as the contract.
>
> Correct the premise: `properties` does NOT keep case variants separate. Upstream collapses them case-insensitively, and BI-0089/BI-0108 retired the case-sensitive FR-009 promise for that reason (Features/properties.md, TC-00196). Don't cite `properties` as precedent for separate entries.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/properties.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0108 - Close Outstanding Audit Findings.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/tag.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Added a 2026-10-24 HTML comment recording clarify Q2: inherit upstream case handling with no wrapper merge or split, and correcting the premise that `properties` keeps case variants separate.

**Sent to the step:**

> 2. Inherit (A). Wrapper never merges or splits case variants. Spec must not promise "separate entries" or "merged entries". Probe the CLI at plan stage, then write the observed behaviour into the spec and help doc as the contract.
>
> Correct the premise: `properties` does NOT keep case variants separate. Upstream collapses them case-insensitively, and BI-0089/BI-0108 retired the case-sensitive FR-009 promise for that reason (Features/properties.md, TC-00196). Don't cite `properties` as precedent for separate entries.

## 4. pre-implementation / clarify (2026-10-24T10:03:43.764Z)

**Question (verbatim):**

> ## Question 3: What "alphabetical by name" means
>
> **Context**: AC-5 requires default ordering "alphabetical by name", and FR-011 uses the same order to break count ties under `sortByCount`. The spec currently leaves the collation to planning ("the deterministic name ordering the planning stage selects"). This decides every ordering test, including case and non-ASCII names. The project already has one wrapper-side precedent: `properties` re-sorts after fetching, with lower-cased comparison first and byte order as the tiebreak (`src/tools/properties/handler.ts:76`).
>
> **Recommended:** Option A. The wrapper owns the order, so tests don't depend on undocumented CLI collation. It reuses the existing project precedent, gives the same result on every machine (no locale dependence), and puts names that differ only by case next to each other if the CLI returns them separately.
>
> | Option | Description |
> |--------|-------------|
> | A | Wrapper sort: lower-cased comparison first, then UTF-16 code-unit (byte-order) tiebreak; the same rule breaks count ties. Same as `properties`. |
> | B | Wrapper sort: plain code-unit order (uppercase sorts before lowercase, `Zeta` before `alpha`). |
> | C | Locale-aware wrapper sort (natural-language collation; result can vary by runtime locale). |
> | D | Inherit: pass the CLI's default name order through unchanged and document it (no wrapper sort). |
> | Short | Provide a different short answer (<=5 words). |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: none):

> 3. A
>
> This reuses the `properties` Q1/A1 precedent: compare case-insensitively first, then byte-order tiebreak (Features/properties.md). The tiebreak only matters when case variants reach the wrapper separately (Q2), and BI-0108 says a tiebreak that is never exercised must be labelled that way, not dropped silently. If the probe shows the CLI merges case variants, mark the tiebreak "unobservable end-to-end" in the spec.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Features/properties.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0108 - Close Outstanding Audit Findings.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Added a 2026-10-24 HTML comment recording clarify Q3: wrapper-side sort comparing case-insensitively first with a UTF-16 code-unit tiebreak, also used for count ties.

**Sent to the step:**

> 3. A
>
> This reuses the `properties` Q1/A1 precedent: compare case-insensitively first, then byte-order tiebreak (Features/properties.md). The tiebreak only matters when case variants reach the wrapper separately (Q2), and BI-0108 says a tiebreak that is never exercised must be labelled that way, not dropped silently. If the probe shows the CLI merges case variants, mark the tiebreak "unobservable end-to-end" in the spec.

## 5. pre-implementation / plan (2026-10-24T10:06:51.515Z)

**Question (verbatim):**

> ## Question: How `tags` addresses the vault, given ADR-032 and ARCH-014
>
> **Context**: The spec (from your input) makes `target_mode` required. In specific mode `vault` is required; in active mode `vault` is forbidden. `file`, `path` and `activeOnly` are optional ways to narrow the listing. Three existing project facts pull against this:
>
> - **ADR-032** (BI-066, `find_and_replace` file scope; per `specs/066-file-scope/research.md` D3). It added an optional single-note scope to a vault-wide tool using sibling optional fields (`file` / `path` / `active_note` alongside `vault?`), and rejected `target_mode` because it "would overload a file-targeted primitive onto a vault-wide surface … and require an ADR-003 amendment". **ARCH-014** reserves the optional `vault?` style for vault-wide queries; `tag`, `properties` and `search` all use it.
> - **ADR-003's standard refinement** (`src/target-mode/target-mode.ts`) requires exactly one of `file`/`path` in specific mode and forbids `vault`/`file`/`path` in active mode. `tags` fits neither that nor the folder-scoped variant, so the schema needs a new third variant.
> - **`invokeCli` removes `file`/`path` from the call in active mode** (`src/cli-adapter/cli-adapter.ts`, `stripTargetLocators`). Active mode plus `file` would therefore quietly become a vault-wide listing unless that runtime path is changed. My spec's edge-case bullet ("in active mode, `file`/`path` resolve against the focused vault") assumed otherwise. I wrote it, not you, and it needs correcting either way.
>
> **Precedent for keeping `target_mode`**: `get_active_file` (BI-063, clarify Q1) already uses `target_mode` purely to choose the vault (active = focused vault, specific = named vault), through the folder-scoped refinement. `tags` would extend that pattern with optional note scoping.
>
> **Recommended:** Option A. It keeps your input contract (AC-10 and AC-12 unchanged) and follows the `get_active_file` precedent. It also respects ADR-003's "active mode forbids locators" rule, so `invokeCli` needs no change. Because it departs from the reasoning of ADR-032 and ARCH-014, the plan records a new ADR explaining when `target_mode` may act as the vault selector for a vault-wide tool with optional note scope.
>
> | Option | Description |
> |--------|-------------|
> | A | Keep `target_mode` as the vault selector. Add a third refinement variant in `target-mode.ts`: specific mode requires `vault` and allows at most one of `file`/`path`/`activeOnly: true`; active mode forbids `vault`/`file`/`path` but allows `activeOnly`. Naming a single note in active mode therefore means `activeOnly: true`; `file`/`path` need specific mode. Record a new ADR that distinguishes this case from ADR-032. |
> | B | As A, but active mode also allows `file`/`path` against the focused vault. This needs a change to `invokeCli`'s locator removal in active mode (or a workaround that calls specific mode without a vault), and it departs from ADR-003's rule that active mode forbids locators. |
> | C | Follow ADR-032 / ARCH-014: drop `target_mode`. Use a plain optional `vault?` (omitted means the focused vault) plus sibling `file`/`path`/`activeOnly`. This changes your input contract: AC-10 and AC-12 are reworded, and the spec is amended. |
> | Short | Provide a different short answer (<=5 words). |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: conflict: BI-0014's /speckit-specify prompt (2026-05-08) requires `target_mode` on `tags`. ADR-032 (2026-06-30) and the Architecture note (ARCH-014) say vault-wide tools with optional note scope use `vault?` plus sibling locators. Keeping the BI's contract means a new ADR that departs from ADR-032; following ADR-032 changes the BI's AC-10/AC-12.):

> 4. Recommended: C, pending the owner's ruling. Drop `target_mode`. Use optional `vault?` (focused vault when omitted) plus sibling `file` / `path` / `activeOnly`, at most one of the three. Mirror ADR-032's matrix: `vault` may accompany `file`/`path` to choose the vault; `activeOnly: true` forbids `vault`, `file` and `path`. Reword AC-10 and AC-12 to fit. Drop the "active mode resolves `file`/`path` against the focused vault" edge-case bullet. Leave `invokeCli` and ADR-003 unchanged.
>
> Why: ADR-032 (decided 2026-06-30) chose sibling locators over `target_mode` and calls it "a reusable pattern for any future inherently-vault-wide tool that later gains an optional single-note or open-note scope". ARCH-014 (Tool categories; Target-mode intent) and ADR-003's scope both keep vault-wide tools on `vault?`. The BI's `target_mode` contract was written on 2026-05-08, before both. Option A would need a new ADR carving `tags` out of ADR-032. Hold the schema shape until the owner rules; the other clarify answers stand either way.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`

**Advisor, after the owner ruled** (escalate: none):

> 4. C. Drop `target_mode`. Inputs: `vault?` (focused vault when omitted), `file?`, `path?`, `activeOnly?`, `sortByCount?`, `includeCounts?`.
> - At most one of `file` / `path` / `activeOnly: true`. None set = vault-wide listing.
> - `vault` may accompany `file` / `path` to choose the note's vault.
> - `activeOnly: true` forbids `vault`, `file` and `path`; that combination fails validation before any CLI call. No focused note → `ERR_NO_ACTIVE_FILE`, keeping AC-13's recovery hint.
> - Reword AC-10: "`vault` omitted → focused vault; `vault` supplied (alone or with `file`/`path`) → named vault."
> - Reword AC-12: "`activeOnly: true` + `vault` → `VALIDATION_ERROR`; no CLI call."
> - Drop the edge-case bullet "active mode resolves `file`/`path` against focused vault".
> - Model scope conflicts as `VALIDATION_ERROR` with `details.code`/`details.reason`, per ADR-015 and as ADR-032 does. Zero new top-level codes.
> - Don't import `target-mode.ts` and don't add a refinement variant. Leave `invokeCli` and ADR-003 unchanged. No new ADR.
>
> Ruling: follow ADR-032's sibling-locator pattern for vault-wide tools with optional note scope, as ARCH-014 (Tool categories) also requires. The BI's /speckit-specify prompt and ACs are amended to match.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`, `200-Decisions/ADR-003 - Enforce Target Mode in Typed Tools.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Architecture.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: /speckit-specify prompt Inputs: removed `target_mode`; `vault` is now optional (focused vault when omitted), allowed with file/path, forbidden with activeOnly; activeOnly is exclusive of file/path/vault.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Reworded AC-10 (vault omitted → focused vault; supplied → named vault) and AC-12 (activeOnly + vault fails validation, no CLI call).
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Related: noted that ADR-003's scope excludes `tags`; added an ADR-032 link as the pattern this BI follows.
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Added a 2026-10-24 HTML comment recording the clarify Q4 conflict, escalation and owner ruling C; bumped `updated` to 2026-10-24.
- `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`: Related Notes: added BI-0014 as the pattern's second adopter, with a dated 2026-10-24 comment; decision text unchanged.

**Owner:** choice 1 (C: follow ADR-032, drop target_mode), via ntfy, 2026-10-24T11:04:58.388Z.

**Sent to the step:**

> 4. C. Drop `target_mode`. Inputs: `vault?` (focused vault when omitted), `file?`, `path?`, `activeOnly?`, `sortByCount?`, `includeCounts?`.
> - At most one of `file` / `path` / `activeOnly: true`. None set = vault-wide listing.
> - `vault` may accompany `file` / `path` to choose the note's vault.
> - `activeOnly: true` forbids `vault`, `file` and `path`; that combination fails validation before any CLI call. No focused note → `ERR_NO_ACTIVE_FILE`, keeping AC-13's recovery hint.
> - Reword AC-10: "`vault` omitted → focused vault; `vault` supplied (alone or with `file`/`path`) → named vault."
> - Reword AC-12: "`activeOnly: true` + `vault` → `VALIDATION_ERROR`; no CLI call."
> - Drop the edge-case bullet "active mode resolves `file`/`path` against focused vault".
> - Model scope conflicts as `VALIDATION_ERROR` with `details.code`/`details.reason`, per ADR-015 and as ADR-032 does. Zero new top-level codes.
> - Don't import `target-mode.ts` and don't add a refinement variant. Leave `invokeCli` and ADR-003 unchanged. No new ADR.
>
> Ruling: follow ADR-032's sibling-locator pattern for vault-wide tools with optional note scope, as ARCH-014 (Tool categories) also requires. The BI's /speckit-specify prompt and ACs are amended to match.

## 6. pre-implementation / analyze (2026-10-24T11:14:46.691Z)

**Question (verbatim):**

> Would you like me to suggest concrete remediation edits for the top 7 issues (H1, I1, I2, F1, U1, D1, C1)?

**Advisor** (escalate: none):

> Yes. Propose concrete edits for all seven (H1, I1, I2, F1, U1, D1, C1) and apply them to spec/plan/tasks before `/speckit-implement`.
>
> Rules:
> - Make the artefacts match the amended BI-0014 prompt and the clarify rulings Q1–Q4: bare tag names; inherit case handling; case-insensitive sort with code-unit tiebreak; `vault?` + sibling locators per ADR-032, no `target_mode`.
> - If an issue can only be fixed by changing BI scope, reversing an ADR, or reopening Q1–Q4, don't edit for it. Send it back here as a numbered clarification question.
> - Log each remediation in the spec's Clarifications section so it can be traced.
>
> Constitution, Spec-kit workflow: clarify is repeated "until no underspecified items remain" before plan/implement, and every Q&A goes into Clarifications.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `200-Decisions/ADR-032 - Find And Replace File Scope via Sibling Locators.md`

**Sent to the step:**

> Yes. Propose concrete edits for all seven (H1, I1, I2, F1, U1, D1, C1) and apply them to spec/plan/tasks before `/speckit-implement`.
>
> Rules:
> - Make the artefacts match the amended BI-0014 prompt and the clarify rulings Q1–Q4: bare tag names; inherit case handling; case-insensitive sort with code-unit tiebreak; `vault?` + sibling locators per ADR-032, no `target_mode`.
> - If an issue can only be fixed by changing BI scope, reversing an ADR, or reopening Q1–Q4, don't edit for it. Send it back here as a numbered clarification question.
> - Log each remediation in the spec's Clarifications section so it can be traced.
>
> Constitution, Spec-kit workflow: clarify is repeated "until no underspecified items remain" before plan/implement, and every Q&A goes into Clarifications.

## 7. pre-implementation / resolve-analysis (2026-10-24T11:17:49.488Z)

**Question (verbatim):**

> ## Question: H2 — the live-CLI test instructions file is missing
>
> **Context**: CLAUDE.md requires reading `.memory/test-execution-instructions.md` before any real `obsidian` CLI call. It is missing from this checkout; `.memory/` doesn't exist at all. In `tasks.md`, Phase 1 (live probes T001–T008) blocks Phase 2. That's because T009 needs the JSON field names from probe P1, and the story tests use stdout captured by probes P2–P8. So `/speckit-implement` stops at T001. I can't create the file myself: CLAUDE.md says not to edit `.memory/` unless you ask.
>
> **Recommended:** Option B. It removes the hard block without weakening the rule: no live CLI call happens until the file exists. The rework risk is small, because only `tagsUpstreamArraySchema`, `EMPTY_TAGS_SENTINEL` and the stdout fixtures depend on the probe results. Each probe already has a fallback decided in advance.
>
> | Option | Description |
> |--------|-------------|
> | A | You restore `.memory/test-execution-instructions.md` before `/speckit-implement`. No artefact change; H2 closes when the file exists. Implement stays blocked until then. |
> | B | Provisional build. Phase 2–US5 go ahead in-process against an assumed CLI output format: `[{ tag: "#x", count: n }]`, `[]` for an empty result, `Error: No active file.`, a CLI error message for a missing note, and `Vault not found.` (exit 0). The provisional schema and fixtures are marked as such. Phase 1 probes become a gate before the PR (and before T038 docs and T041 baseline); they run as soon as you restore the file, and any mismatch is fixed through the existing fallback table. |
> | C | Point me at another authorised vault and set of rules to use instead (give the details). I'd record them in the spec as a one-off, without touching `.memory/`. |
> | Short | Provide a different short answer (<=5 words). |
>
> You can reply with the option letter (e.g., "A"), accept the recommendation by saying "yes" or "recommended", or provide your own short answer.

**Advisor** (escalate: ungrounded: `.memory/test-execution-instructions.md` is gitignored and local; the vault doesn't hold its content and has no rule on building ahead of the live-CLI gate. Only the owner can restore the file or approve a substitute such as the vault's GL-003 test instructions.):

> Recommended: B, pending the owner. Build Phase 2 through US5 in-process against the assumed output format. Mark `tagsUpstreamArraySchema`, `EMPTY_TAGS_SENTINEL` and the stdout fixtures PROVISIONAL in code comments and tasks.md. Make the Phase 1 probes T001–T008 a hard gate before T038 (docs), T041 (baseline) and the PR. Make no live `obsidian` call until `.memory/test-execution-instructions.md` exists. When the probes run, settle every mismatch through the existing fallback table and log it in the spec's Clarifications section.
>
> Why the owner is needed: the vault can't recreate the file. It is gitignored, project-local and "deferred, not documented as its own page" (CLAUDE.md Files). The closest vault rules are GL-003 (Obsidian CLI MCP - Test Execution Instructions): use test vault `TestVault-Obsidian-CLI-MCP` and drive `Obsidian.com`, never `Obsidian.exe`. Whether GL-003 may stand in for the CLAUDE.md gate is the owner's call, not yours.

Sources: `460-Claude Code/Claude Code - Settings/CLAUDE.md Files.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Test Execution Instructions.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0134 - Re-verify Eval Cohort Cross-Vault Routing.md`, `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Constitution.md`

**Advisor, after the owner ruled** (escalate: none):

> H2. A. Don't change any artefact. Keep Phase 1 (T001–T008) blocking Phase 2. Don't build against assumed CLI output and don't substitute other rules. Don't create or edit `.memory/`. `/speckit-implement` stops at T001 until the owner restores `.memory/test-execution-instructions.md`. Then read it and run the probes as planned. H2 closes when the file exists.
>
> The file is gitignored and local, so the vault can't supply it (CLAUDE.md Files). The CLAUDE.md test-execution gate applies unchanged.

Sources: `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`, `460-Claude Code/Claude Code - Settings/CLAUDE.md Files.md`

Edits:
- `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog/BI-0014 - Add List Tags.md`: Added a 2026-10-24 HTML comment recording /speckit-analyze H2 (missing .memory/test-execution-instructions.md), the escalation and owner ruling A: owner restores the file; implement stays blocked at T001.

**Owner:** choice 2 (A: I'll restore the file first), via ntfy, 2026-10-24T11:23:03.883Z.

**Sent to the step:**

> H2. A. Don't change any artefact. Keep Phase 1 (T001–T008) blocking Phase 2. Don't build against assumed CLI output and don't substitute other rules. Don't create or edit `.memory/`. `/speckit-implement` stops at T001 until the owner restores `.memory/test-execution-instructions.md`. Then read it and run the probes as planned. H2 closes when the file exists.
>
> The file is gitignored and local, so the vault can't supply it (CLAUDE.md Files). The CLAUDE.md test-execution gate applies unchanged.
