# Feature Specification: List Tags

**Feature Branch**: `068-list-tags`
**Created**: 2026-10-24
**Status**: Draft
**Input**: User description: "Add List Tags — A typed MCP tool that returns the vault's tag index (or a single file's tag set) with optional per-tag occurrence counts. Tag-index discovery — 'what tags are in use, with what frequency' — drives tag-quality audits, rename planning, and tag-shape exploration. The underlying CLI exposes this surface but returns plain text; agents that consume it must parse the lines themselves. A typed surface returns a structured array directly with first-class count semantics. Tool surface `tags`: inputs `target_mode`, `vault`, `file`, `path`, `activeOnly`, `sortByCount`, `includeCounts`; outputs `{ total, tags: { name, count? }[] }`. Out of scope: tag mutation, files-by-tag listing, cross-vault aggregation, hierarchical-tag rollup."

> **Input superseded in part**: the `target_mode` input in the quoted request above is superseded by the plan-stage ruling in Clarifications (ADR-032 sibling locators: `vault?` + `file` / `path` / `activeOnly`). The quote is kept verbatim as the historical record of the request.

> **Terminology**: a **tag** is an Obsidian tag as the vault's tag index records it — an inline `#hashtag` marker in a note body or an entry in a note's frontmatter `tags:` list. The **tag index** is the vault-wide inventory of distinct tags. An **occurrence count** is the number the underlying tag index reports for a tag; the wrapper does not recompute it. **Scope** is the set of notes the listing covers: the whole vault (default), one named note (`file` or `path`), or the note currently active in the editor (`activeOnly`).

> **Relationship to `tag`**: the existing `tag` tool answers "which notes carry tag X?" (per-tag, value→files). This feature is its inventory sibling: "which tags exist, and how often?" (vault→tags). The name `tags` was explicitly reserved for this inventory operation when `tag` was named (BI-028 research R15), following ADR-010's single-word-verbatim naming from the upstream `tags` subcommand.

## Clarifications

### Session 2026-10-24

- Q: What form do tag names take in the output — bare, `#`-prefixed, or verbatim from the index? → A: **Bare names: strip exactly one leading `#`** (`alpha`, `parent/child`). This is the same normalisation the sibling `tag` tool applies to its input (Features/tag.md, TC-00273, BI-0044 clarify Q4), and the wrapper-era `list_tags` also returned bare names (`a/b`, `a`). Only the `#` is removed; hierarchical names and counts pass through unchanged, per the "wrapper does not reshape" rule.
- Q: How are tags that differ only by letter case (`#Alpha` vs `#alpha`) handled — inherit, always separate, or always merge? → A: **Inherit.** The wrapper never merges or splits case variants, and the spec promises neither separate nor merged entries. The behaviour of the underlying surface is probed at plan stage, and what is observed is written into this spec and the help documentation as the contract. *(Timing note, analyze remediation R2: the probe runs as implement-time T0 probe P4, because the live-CLI gate file was absent at plan time. The ruling itself is unchanged.)*
- Q: What collation defines "alphabetical by name" (default order and the tiebreak for equal counts)? → A: **Wrapper-side sort: compare case-insensitively (lower-cased) first, then break ties by byte order (UTF-16 code unit)**, reusing the `properties` Q1/A1 precedent (Features/properties.md). The same rule breaks count ties under `sortByCount`. The byte-order tiebreak only fires when case variants reach the wrapper as separate entries (see the case-variant answer above). If the plan-stage probe shows the underlying surface merges case variants, the spec MUST label the tiebreak "unobservable end-to-end" rather than drop it silently (BI-0108 precedent). *(Timing note, analyze remediation R2: "plan-stage probe" is carried out as implement-time T0 probe P4. The ruling itself is unchanged.)*

### Session 2026-10-24 (plan-stage ruling)

- Q: How does `tags` address the vault — required `target_mode` (as in the original request), or ADR-032's sibling-locator pattern? → A: **Sibling locators (ADR-032 pattern); `target_mode` is dropped.** Inputs are `vault?` (the focused vault when omitted), `file?`, `path?`, `activeOnly?`, `sortByCount?`, `includeCounts?`. At most one of `file` / `path` / `activeOnly: true` may be set; none set means a vault-wide listing. `vault` may accompany `file` / `path` to choose the note's vault. `activeOnly: true` forbids `vault`, `file`, and `path`; that combination fails validation before any CLI call. With no active note the call fails with `ERR_NO_ACTIVE_FILE`, keeping AC-13's recovery hint. Scope conflicts are `VALIDATION_ERROR` with a `details.code` / `details.reason` sub-discriminator (ADR-015, as ADR-032 does); no new top-level codes. The schema does not import the shared target-mode module and adds no refinement variant; `invokeCli` and ADR-003 are unchanged; no new ADR. Ruling: vault-wide tools with an optional note scope follow ADR-032's sibling-locator pattern, as ARCH-014 (Tool categories) requires. AC-10 and AC-12 are reworded (see User Story 4), and the original request's `target_mode` input is superseded.

### Session 2026-10-24 (analyze remediation)

Owner-approved fixes for the `/speckit-analyze` findings. None of them changes BI scope, reverses an ADR, or reopens Q1–Q4 or the plan-stage ruling.

- Q (R1 / H1): Must validation errors with a sub-code (`SCOPE_CONFLICT`, `INVALID_NOTE`) still report zod's field paths? → A: **Yes.** Every `VALIDATION_ERROR` carries `details.issues: [{ path, message, code }]` alongside `details.code` / `details.reason` (Constitution Principle III, parity with `find_and_replace/index.ts`). Applied to FR-006, contracts/errors.md, research.md D3, tasks T032/T035.
- Q (R2 / I1): The spec said several inherited behaviours are probed "at plan stage" or "during planning", but no live probe could run at plan time. When are they probed? → A: **As implement-time T0 probes P4/P5** ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)). Edge Cases, FR-011 and Assumptions are reworded, and the Q2/Q3 answers carry a timing note. The rulings are unchanged.
- Q (R3 / I2): Which code does a `file` / `path` naming no note produce — `FILE_NOT_FOUND` or `CLI_REPORTED_ERROR`? → A: **`CLI_REPORTED_ERROR` carrying the upstream not-found message** (the dispatch-layer classification; T0 P6 pins the wording). FR-017 and User Story 2 scenario 6 name the code.
- Q (R4 / F1): Several test tasks editing the same file were marked `[P]`. → A: **`[P]` is removed from same-file siblings** (T017, T018, T023, T027, T031). It is kept only where the files differ. Applied to tasks.md and its parallel notes.
- Q (R5 / U1): FR-007 said "absolute or `..`", but the validation boundary rejects more. → A: **FR-007 names the full structural path-safety predicate** (empty, leading `/` or `\`, drive letter, `..` segment, control character or DEL) and the resulting `INVALID_NOTE` / `path-traversal` error. Applied to FR-007, User Story 4 scenario 5 and the SECURITY edge case.
- Q (R6 / D1): The quoted Input still lists `target_mode`. → A: **The quote is kept verbatim as the historical request**, with a "superseded in part" note directly below it pointing to the plan-stage ruling.
- Q (R7 / C1): How is SC-005 (an agent builds correct requests from the help page alone) validated? → A: **By a quickstart scenario**: build the four documented example requests using only `help({ tool_name: "tags" })` output, run them, and confirm each succeeds on the first attempt. Added as quickstart scenario 14 and included in task T043.
- Q (R8 / C2): FR-015 (frontmatter + inline both appear) has no in-process regression test. Is that acceptable? → A: **Yes.** It is an inherited index behaviour with no wrapper logic, so a mocked-spawn test would prove nothing. It is verified live by T0 probe P4 and quickstart scenario 2, and `docs/tools/tags.md` states this (task T038).

### Session 2026-10-24 (implement-time T0 probe results)

The owner ruled `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP` the authorised test vault (GL-003). The Metcash path in `.memory/test-execution-instructions.md` is stale, and correcting it is an owner action. Probes P1–P10 ran there through `Obsidian.com`; the evidence is in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). Each result was settled against the research fallback table. The mismatches with the plan-time hypotheses are logged below.

- Q (T0-1 / P1): What wire format does `tags format=json counts` emit? → A: **A JSON array of `{ tag, count }`. `tag` carries a leading `#`, and `count` is a decimal-digit string (`"3"`), not a number.** *Mismatch*: data-model § 2 assumed a numeric `count`. The upstream schema now accepts only a `^\d+$` string, and the handler converts it to an integer. A non-digit `count` is an `upstream-shape` failure. The public output contract is unchanged (`count` is an integer). No TSV fallback is needed.
- Q (T0-2 / P2): What is the empty-result signal? → A: **The plain-text sentinel `No tags found.`, for both single-note and vault-wide scope.** `EMPTY_TAGS_SENTINEL` takes that value, matched exactly after trim. `[]` is also accepted defensively, and trimmed-empty stdout is not treated as empty. This matches the pre-decided D5 branch.
- Q (T0-3 / P4): Are case variants merged or separate? → A: **It depends on scope.** Vault-wide, the index merges them into one entry with a summed count, reported with the first-seen casing (`#T068-Case` 2). Single-note scope keeps them separate (`#T068-Case` 1, `#t068-case` 1). *Mismatch*: the fallback table had only a binary "merged" row. The applied resolution: FR-011's byte-order tiebreak is labelled "unobservable end-to-end" **for vault-wide listings only**; it stays observable, implemented and unit-tested for single-note listings. The Q2 ruling (inherit, never merge or split) is unchanged.
- Q (T0-4 / P4): How are hierarchical tags presented? → A: **Vault-wide, every ancestor of a nested tag appears as its own entry, and its count includes its descendants' occurrences** (`#t068-parent` 2 = 1 standalone + 1 child). Single-note scope lists only the literal tags, with no synthesised parent. This is inherited unchanged: the wrapper neither adds nor removes parent entries (FR-013, Out of Scope).
- Q (T0-5 / P5): What does `count` mean? → A: **Occurrences, not notes.** Three inline `#t068-multi` markers in one note give `count` 3, both in that note's listing and vault-wide.
- Q (T0-6 / P6–P8, P10): Do the failure signatures match the dispatch classifiers? → A: **Yes. No fallback applies.**
  - A missing note gives `Error: File "<locator>" not found.`, which is `CLI_REPORTED_ERROR`.
  - No active note gives `Error: No active file. Use file=<name> or path=<path> to specify a file.`, which is `ERR_NO_ACTIVE_FILE`.
  - An unknown vault gives `Vault not found.` with exit 0, which `invokeCli` re-classifies as `CLI_REPORTED_ERROR`.
  - Focused-vault `file` scoping works without `vault=`.

  plan.md is unchanged, and no `vaultRegistry` DI is needed.
- Q (T0-7 / P9): What is the practical size ceiling? → A: **About 53 bytes per entry (pretty-printed JSON), so on the order of 10⁵ distinct tags fit under the 10 MiB cap.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List the vault-wide tag index with counts (Priority: P1)

An automation agent running a tag-quality audit asks for every tag in a named vault. It receives one structured list of every distinct tag with how often each occurs, plus a total, without parsing any text. From that one call it can spot near-duplicate spellings, rarely used tags, and the overall tag shape of the vault.

**Why this priority**: This is the core value of the feature and the minimum viable slice. Every other story narrows, reorders, or slims this listing. Today the agent must issue a raw CLI call and parse tab-separated lines itself; a structured index with counts is the reason the tool exists.

**Independent Test**: Against a fixture vault whose tags and occurrence counts are known, request the tag index with no scoping. Verify every known tag appears exactly once with its expected count, the total equals the number of entries, and entries are in alphabetical order by name.

**Acceptance Scenarios**:

1. **Given** a vault containing tagged notes, **When** the agent requests the tag index with no `file`, `path`, or `activeOnly`, **Then** it receives every distinct tag in the vault, each with its occurrence count, and `total` equals the number of tags returned. *(AC-1)*
2. **Given** a vault with no tags at all, **When** the agent requests the tag index, **Then** it receives `{ total: 0, tags: [] }` as a success, not an error. *(AC-7)*
3. **Given** a fixture note containing a tag-shaped token (e.g. `#hashtag`) only inside a fenced code block, **When** the agent requests the tag index, **Then** that token does not appear in the listing and does not contribute to any count. *(AC-8)*
4. **Given** a note that declares tags both in its frontmatter `tags:` list and as inline `#hashtag` markers, **When** the agent requests the tag index, **Then** tags from both sources appear in the listing.
5. **Given** a vault containing hierarchical tags (`#parent/child`), **When** the agent requests the tag index, **Then** the listing reflects the underlying index's treatment of hierarchical tags unchanged (whether the parent appears as its own entry, and whether the parent's count includes children, are documented as inherited behaviour — the wrapper does not roll up or split).
6. **Given** a tag whose name resembles an Obsidian built-in or reserved-looking pattern, **When** the agent requests the tag index, **Then** that tag is returned exactly like any user-defined tag, with no special casing. *(AC-16)*

---

### User Story 2 - Scope the listing to a single note (Priority: P1)

An agent planning a rename, or inspecting one note's classification, asks for the tags carried by a single note — named either by its wikilink-style name (`file`) or by its vault-relative path with extension (`path`), or as "whatever note the user has open" (`activeOnly`). It receives the same structured shape, restricted to that note's tag set.

**Why this priority**: Per-note tag sets are the second core question the underlying surface answers, and the input contract defines all three scoping modes as first-class. The `activeOnly` path also carries a mandatory failure contract (no active note) that must ship with the feature.

**Independent Test**: Against fixture notes with known tag sets, request the listing scoped by `file`, then by `path` for the same note, then with `activeOnly: true` while that note is active. Verify all three return exactly that note's tags and nothing else. Then close every pane and verify `activeOnly: true` fails with a structured no-active-note error.

**Acceptance Scenarios**:

1. **Given** a note with a known tag set, **When** the agent requests the listing with `file` naming that note, **Then** it receives only that note's tags. *(AC-2)*
2. **Given** the same note, **When** the agent requests the listing with `path` set to its vault-relative path, **Then** it receives the same tag set as the `file`-scoped request. *(AC-3)*
3. **Given** a note is active in the editor, **When** the agent requests the listing with `activeOnly: true`, **Then** it receives only the active note's tags. *(AC-4)*
4. **Given** no note is active in the editor, **When** the agent requests the listing with `activeOnly: true`, **Then** the call fails with a structured error that tells the caller to focus a note or switch to `file` / `path`. *(AC-13)*
5. **Given** a note that exists but carries no tags, **When** the agent requests that note's listing, **Then** it receives `{ total: 0, tags: [] }` as a success.
6. **Given** a `file` or `path` that names no existing note, **When** the agent requests the listing, **Then** the call fails with `CLI_REPORTED_ERROR` carrying the upstream not-found message, never a silent empty list.

---

### User Story 3 - Control ordering and payload weight (Priority: P1)

An agent hunting for the most-used tags asks for the listing ordered by count, highest first. An agent that only needs the tag vocabulary (e.g. to offer autocomplete or check spelling) asks for names only, without counts, to keep the response small.

**Why this priority**: Both switches are part of the P1 acceptance set (AC-5, AC-6). Count-descending order is the natural view for frequency audits; name-only output is the token-economical view for vocabulary checks.

**Independent Test**: Against a fixture vault with tags of distinct and tied counts, request the listing with `sortByCount: true` and verify counts are non-increasing with ties broken by name; request it with defaults and verify alphabetical order; request it with `includeCounts: false` and verify no entry carries a `count` field.

**Acceptance Scenarios**:

1. **Given** a vault with tags of differing counts, **When** the agent requests the listing with `sortByCount: true`, **Then** entries are ordered by count, highest first, and tags with equal counts are ordered alphabetically by name. *(AC-5)*
2. **Given** the same vault, **When** the agent requests the listing with default options, **Then** entries are ordered alphabetically by name. *(AC-5)*
3. **Given** any scope, **When** the agent requests the listing with `includeCounts: false`, **Then** every entry carries only `name` and no entry has a `count` field. *(AC-6)*
4. **Given** `includeCounts: false` and `sortByCount: true` together, **When** the agent requests the listing, **Then** entries are still ordered by count (highest first) even though counts are not shown.

---

### User Story 4 - Reject malformed requests before anything runs (Priority: P1)

An agent that builds a request incorrectly — conflicting scopes, a vault alongside `activeOnly`, an unexpected field, or a path that tries to leave the vault — gets an immediate, structured validation failure that names the problem, and the vault is never touched. An agent that names a vault (or omits it) gets the listing from exactly the vault it meant.

**Why this priority**: The validation contract (AC-9 through AC-12, plus the path-traversal security requirement) is P1. Rejecting bad input at the boundary keeps the tool predictable for agents and keeps caller-supplied strings away from the underlying layer.

**Independent Test**: Submit each invalid input shape listed below and verify each fails with a validation error and that no underlying CLI call is recorded.

**Acceptance Scenarios**:

1. **Given** a request that sets two or more of `file`, `path`, and `activeOnly: true`, **When** it is submitted, **Then** it fails validation and no underlying CLI call occurs. *(AC-9)*
2. **Given** a request with `vault` omitted, **When** it is submitted, **Then** it runs against the focused vault; **given** a request with `vault` supplied (alone or with `file` / `path`), **Then** it runs against the named vault. *(AC-10, reworded at plan stage)*
3. **Given** a request carrying any unknown top-level key, **When** it is submitted, **Then** it fails validation and no underlying CLI call occurs. *(AC-11)*
4. **Given** a request with `activeOnly: true` and a `vault`, **When** it is submitted, **Then** it fails with `VALIDATION_ERROR` and no underlying CLI call occurs. *(AC-12, reworded at plan stage)*
5. **Given** a `file` or `path` that is structurally unsafe (empty, starting with `/` or `\`, starting with a drive letter, containing a `..` segment, or containing a control character or DEL), **When** it is submitted, **Then** it is rejected with `VALIDATION_ERROR` before reaching the underlying layer.
6. **Given** a request naming a `vault` that is not registered, **When** it is submitted, **Then** it fails with a structured vault-not-found error rather than an empty listing or an unclassified response.

---

### User Story 5 - Discover the contract through the help facility (Priority: P2)

An agent that has never used the tool asks the project's help facility for `tags` and receives full documentation: every input field and its constraints, the output shape, the error roster, the inherited limitations, and worked examples it can copy.

**Why this priority**: Progressive-disclosure documentation is how agents learn a tool without trial and error. It is P2 because the tool is usable from its published schema alone, but adoption and correct use depend on the worked examples and the documented inherited behaviours.

**Independent Test**: Call the help facility for `tags` and verify the returned page covers every input field, the output shape, every error the tool can return, the documented edge-case behaviours, and at least four worked examples (vault-wide, file-scoped, sortByCount, activeOnly). Verify the help index lists `tags` with a one-line summary.

**Acceptance Scenarios**:

1. **Given** the tool has shipped, **When** an agent asks the help facility for `tags`, **Then** it receives the full per-field input contract, output shape, error roster, and at least four worked examples covering vault-wide, file-scoped, sortByCount, and activeOnly use. *(AC-14)*
2. **Given** the help index, **When** an agent lists available tools, **Then** `tags` appears with a one-line summary that distinguishes it from `tag`.

---

### Edge Cases

- **Concurrent edits (CONCURRENCY)**: notes may be added, removed, or re-tagged while a listing runs. The listing reflects a single snapshot of the underlying tag index at the moment it is read. Obsidian updates that index asynchronously after a file changes, so a listing can lag a just-made edit by the index's refresh delay. This staleness window is documented; the tool does not wait for, or force, re-indexing.
- **Fenced code blocks (CONTENT)**: tag-shaped tokens inside fenced code blocks do not count. This is inherited from the underlying index (which already excludes them) and locked by a fixture-backed test, closing a fidelity gap that earlier text-scanning approaches had.
- **Non-ASCII and non-Latin tags (CONTENT)**: tags such as `#café` or `#日本語` are returned as the underlying index reports them, with no normalisation, case-folding, or transliteration by the wrapper. Observed (T0 probe P4, [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)): the index recognises them exactly as it does ASCII tags, and `#t068-café` and `#t068-日本語` come back byte-identical. Their position in the output follows the wrapper's sort rule (FR-011), not the index's.
- **Case variants**: for tags that differ only by letter case (e.g. `#Alpha` and `#alpha`), the wrapper neither merges nor splits entries; whatever the underlying surface returns passes through. This spec deliberately promises neither separate nor merged entries. Observed (T0 probe P4, [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)), and now the documented contract: **vault-wide listings merge case variants** into one entry whose count sums both, reported with the first-seen casing. **Single-note listings keep them separate.** FR-011's byte-order tiebreak is therefore unobservable end-to-end in vault-wide listings and observable in single-note listings. (The sibling `tag` tool case-folds its *lookup*; this inventory does not reshape names.)
- **Hierarchical tags (CONTENT)**: `#parent/child` appears as the underlying index presents it. Whether the parent also appears, and whether its count includes children, is an inherited decision; the wrapper neither rolls up nor splits. Observed (T0 probe P4): **vault-wide, every ancestor appears as its own entry, and its count includes its descendants' occurrences**. A single-note listing shows only the literal tags.
- **Frontmatter vs inline (CONTENT)**: tags from frontmatter `tags:` lists and inline `#hashtag` markers both appear by default.
- **Count meaning under single-note scope**: when the listing is scoped to one note, each `count` is whatever the underlying surface reports for that scope. Observed (T0 probe P5, [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)): `count` is the number of **occurrences**, not notes. It counts the occurrences within the note in single-note scope, and the occurrences across the vault in vault-wide scope.
- **Very large tag vocabularies (LIMITS)**: a vault with thousands of unique tags is returned in full — there is no wrapper-side truncation. If the underlying response exceeds the project's existing output-size cap, the call fails with the existing structured output-too-large error rather than returning a partial list. The practical ceiling is documented. Observed (T0 probe P9): about 53 bytes per entry, which puts it on the order of 10⁵ distinct tags.
- **Unknown vault display name (UNDERLYING)**: the underlying layer may answer an unknown vault name with output that does not look like an error (e.g. an empty or prose response with a success exit). The tool must detect this case explicitly and fail with the structured vault-not-found error, never an empty listing.
- **Vault not open / Obsidian not running**: inherited from the project's shared command-dispatch behaviour (cold-start retry and app-launch recovery); no per-tool recovery is added.
- **Unknown top-level keys (CLIENT-CLASS)**: some MCP clients strip keys not present in the published schema before sending; others forward them. Rejection is directly observable only on the forwarding pathway. The regression test exercises the server-side rejection directly and its description documents the dual-pathway distinction.
- **`activeOnly: false` with `file` or `path`**: `activeOnly: false` is the default and counts as "not set", so it may be combined with `file` or `path` without triggering the mutual-exclusion rule.
- **Path traversal (SECURITY)**: a caller-supplied `file` or `path` that fails the project's structural path-safety predicate (empty, leading `/` or `\`, drive letter, `..` segment, control character or DEL) is rejected at the validation boundary. `vault` and `file` are passed to the underlying layer only as discrete argument values, never as shell text.
- **`activeOnly` and the vault**: the active note determines its own vault (the focused vault), so `activeOnly: true` cannot be combined with `vault`; that request fails validation rather than guessing which vault was meant.

## Requirements *(mandatory)*

### Functional Requirements

**Surface and inputs**

- **FR-001**: The system MUST expose a typed tool named `tags` that returns the tag index of an Obsidian vault, or the tag set of one note, as structured data.
- **FR-002**: The tool MUST accept an optional, non-empty `vault` (vault display name). When `vault` is omitted the listing runs against the focused vault; when supplied (alone or with `file` / `path`) it runs against the named vault. The tool has no `target_mode` input (plan-stage ruling: ADR-032 sibling-locator pattern, per ARCH-014).
- **FR-003**: The tool MUST accept optional scoping inputs `file` (bare note name, wikilink-style, without `[[` / `]]` brackets), `path` (vault-relative path including extension), and `activeOnly` (boolean, default `false`). At most one of `file`, `path`, and `activeOnly: true` may be supplied; supplying more than one MUST fail validation. `activeOnly: true` MUST NOT be combined with `vault`. When none of the three is supplied, the listing is vault-wide.
- **FR-004**: The tool MUST accept optional `sortByCount` (boolean, default `false`) and `includeCounts` (boolean, default `true`).
- **FR-005**: The tool MUST reject any unknown top-level input key with a validation failure.
- **FR-006**: Every validation failure MUST be reported as `VALIDATION_ERROR` before any underlying CLI call is made. Scope conflicts (FR-003) MUST carry a `details.code` / `details.reason` sub-discriminator naming the conflicting combination (ADR-015, parity with ADR-032's scope-conflict shape). Every `VALIDATION_ERROR`, sub-coded or not, MUST also carry the field paths reported by zod in `details.issues` (`[{ path, message, code }]`, Constitution Principle III, parity with `find_and_replace`).
- **FR-007**: The tool MUST reject, at the validation boundary, a `file` or `path` that fails the project's structural path-safety predicate: empty, starting with `/` or `\`, starting with a drive letter, containing a `..` segment, or containing a control character or DEL. The rejection is `VALIDATION_ERROR` with `details.code: "INVALID_NOTE"` and `details.reason: "path-traversal"`.

**Outputs**

- **FR-008**: On success the tool MUST return `{ total, tags }`, where `tags` is a list of `{ name, count? }` entries and `total` equals the number of entries in `tags`.
- **FR-009**: When `includeCounts` is `true` (default), every entry MUST carry a numeric `count` equal to the occurrence count the underlying index reports for that tag in the requested scope. When `includeCounts` is `false`, no entry may carry a `count` field.
- **FR-010**: Each tag MUST appear at most once in a response.
- **FR-011**: By default, entries MUST be ordered alphabetically by name, where "alphabetical" means a wrapper-applied sort that compares lower-cased names first and breaks ties by byte (UTF-16 code-unit) order. When `sortByCount` is `true`, entries MUST be ordered by count, highest first, with equal counts ordered by that same name rule. Ordering by count MUST apply even when `includeCounts` is `false`. The byte-order tiebreak only fires for names that differ only by case. T0 probe P4 showed that the underlying surface merges case variants in vault-wide listings and keeps them separate in single-note listings. The spec and help documentation therefore label the tiebreak "unobservable end-to-end" for vault-wide listings; it stays implemented and unit-tested, and is observable for single-note listings.
- **FR-012**: A scope that contains no tags (an untagged vault, or an untagged note) MUST return `{ total: 0, tags: [] }` as a success.
- **FR-013**: Tag names MUST be returned in bare form: exactly one leading `#` is stripped from each name as the underlying index reports it (e.g. `#parent/child` → `parent/child`), and nothing else changes. The wrapper MUST NOT case-fold, normalise, transliterate, roll up or split hierarchical tags, merge or split case variants, or special-case any tag name.

**Content fidelity**

- **FR-014**: Tag-shaped tokens inside fenced code blocks MUST NOT appear in the listing or contribute to any count.
- **FR-015**: Tags declared in frontmatter `tags:` lists and inline `#hashtag` markers MUST both appear in the listing.

**Failures**

- **FR-016**: `activeOnly: true` with no active note MUST fail with the project's existing structured no-active-file error, whose message directs the caller to focus a note or use `file` / `path` instead.
- **FR-017**: A `file` or `path` that resolves to no existing note MUST fail with `CLI_REPORTED_ERROR` carrying the upstream not-found message (the dispatch layer's classification of the CLI's `Error: …` output; T0 probe P6 pins the wording). It is not the separate `FILE_NOT_FOUND` code, and it is never an empty listing.
- **FR-018**: An unregistered `vault` MUST fail with the project's existing structured vault-not-found classification (`CLI_REPORTED_ERROR` carrying the CLI's `Vault not found.` message), including when the underlying layer's response for an unknown vault would not otherwise be classified as an error.
- **FR-019**: An underlying response that exceeds the project's existing output-size cap MUST fail with the existing structured output-too-large error; the tool MUST NOT return a silently truncated list.
- **FR-020**: Any other underlying failure, or an underlying response the tool cannot interpret, MUST surface as a structured error with a stable code and diagnostic details — never as an empty or partial success.
- **FR-021**: The feature MUST introduce no new top-level error codes; every failure MUST be classified through codes the project already defines.

**Documentation and regression locking**

- **FR-022**: The help facility MUST serve a documentation page for `tags` containing the full per-field input contract, the output shape, the error roster, the inherited behaviours listed under Edge Cases (staleness window, case handling, non-ASCII handling, hierarchical-tag handling, single-note count meaning, practical size ceiling, client-class unknown-key pathways), and at least four worked examples: vault-wide, file-scoped, sortByCount, and activeOnly.
- **FR-023**: The help index MUST list `tags` with a one-line summary that distinguishes it from `tag`.
- **FR-024**: Each acceptance criterion AC-1 through AC-16 MUST be locked by at least one automated regression test that passes unchanged on repeated runs. AC-8 (fenced code exclusion) MUST be backed by a fixture note containing a tag-shaped token inside a fenced code block.
- **FR-025**: The deliverable MUST satisfy every principle of the project constitution (modular organisation, co-located public-surface tests, schema-as-single-source-of-truth validation, explicit upstream error propagation, attribution headers).

### Key Entities

- **Tag listing request**: the caller's question — which vault (an optional name; the focused vault when omitted), which scope (vault-wide, one note by name or path, or the active note), which ordering, and whether counts are wanted.
- **Tag entry**: one distinct tag in the requested scope — its bare name (the index's name with one leading `#` removed), and, when requested, its occurrence count.
- **Tag listing result**: the ordered collection of tag entries plus the total number of entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent obtains a vault's complete tag inventory with per-tag counts in a single call, with zero text parsing on the agent's side (down from one raw call plus custom line parsing).
- **SC-002**: For a fixture vault with known tags and counts, 100% of expected tags appear exactly once with the expected counts, and 0 tag-shaped tokens from fenced code blocks appear.
- **SC-003**: 100% of the invalid request shapes listed in User Story 4 are rejected, and 0 of them reach the underlying CLI.
- **SC-004**: 100% of acceptance criteria AC-1 through AC-16 are covered by automated regression tests that pass on three consecutive runs without modification.
- **SC-005**: An agent reading only the help page for `tags` can construct a correct request for each of the four documented scenarios (vault-wide, file-scoped, sortByCount, activeOnly) on the first attempt.
- **SC-006**: Zero new error codes are added to the project's error roster.
- **SC-007**: Every documented edge case in this specification (concurrency, content, limits, underlying, client-class, security) has either a regression test or an explicit documented statement of inherited behaviour.

## Assumptions

- **Underlying surface**: the Obsidian Integrated CLI's `tags` subcommand already offers vault-wide and per-note (`file`, `path`, `active`) listing, optional counts, count-ordered sorting, and a structured output format; the typed tool builds on it rather than re-scanning notes. Whether the tool wraps that subcommand directly or composes the same data another way is a planning decision.
- **Inherited index semantics**: fenced-code exclusion, frontmatter-plus-inline coverage, hierarchical-tag presentation, case-variant handling, and non-ASCII handling all come from Obsidian's own tag index. The wrapper characterises these behaviours through the implement-time T0 probes ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)) and documents them; it does not change them. For case variants, the probe result is written back into this spec as the contract (see Clarifications).
- **Name form**: tag names are returned bare, with exactly one leading `#` removed (see Clarifications). A bare name feeds straight into the sibling `tag` tool, which accepts names with or without a leading `#`.
- **Alphabetical order**: "alphabetical by name" is a wrapper-applied sort, case-insensitive first with a byte-order tiebreak (see Clarifications and FR-011). It does not depend on the underlying surface's own ordering or on the runtime locale, and it applies both to the default order and to count ties. Non-ASCII names sort by the same rule.
- **No placeholder stub exists today**: the request mentions replacing a placeholder documentation stub for this tool, but no `tags` stub is present in the current help documentation (the existing stubs are for other future tools). The feature therefore adds a new documentation page and a new help-index entry rather than replacing one.
- **Output cap**: the project's existing per-call output-size cap for typed tools applies unchanged; at typical tag-name lengths it accommodates vocabularies far larger than thousands of tags, and the documented practical ceiling is derived from it.
- **Addressing pattern**: `tags` is a vault-wide tool with an optional single-note scope, so it follows ADR-032's sibling-locator pattern (optional `vault` plus sibling `file` / `path` / `activeOnly`), as ARCH-014 requires for that tool category. It does not use the `target_mode` discriminator (ADR-003), which stays reserved for file-targeted tools (plan-stage ruling in Clarifications).
- **Recovery behaviour**: vault-not-open and Obsidian-not-running handling is inherited from the project's shared dispatch layer, as for every other CLI-backed typed tool.
- **Live-vault testing**: any test that invokes the real Obsidian CLI follows the project's authorised test-vault and scratch-folder protocol; fixture notes for this feature (fenced-code token, hierarchical tags, non-ASCII tags, frontmatter-plus-inline tags) are created there.

## Out of Scope

- Tag mutation (rename, add, remove) — a separate future feature.
- Files-by-tag listing ("which notes carry tag X") — already served by the existing `tag` tool.
- Cross-vault tag aggregation — callers iterate per vault.
- Hierarchical-tag rollup (parent count including children) — inherited from the underlying index; the wrapper does not reshape.
- Pagination or wrapper-side truncation of very large listings.
