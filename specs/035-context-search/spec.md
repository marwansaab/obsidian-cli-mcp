# Feature Specification: Add Context Search

**Feature Branch**: `035-context-search`
**Created**: 2026-05-17
**Status**: Draft
**Input**: User description: "Add Context Search — a distinct context-bearing search tool that returns each match's file path, 1-based line number, and the matching line's text in a single call, alongside the existing path-only `search` sibling."

## Clarifications

### Session 2026-05-17

- Q: What is the BI's scope for the existing `search.context_lines` flag? → A: Leave the flag functional but mark it `deprecated` in `search`'s help text and add a cross-pointer to the new `search_context` tool. No code-behaviour change to `search`; documentation-only update on the existing tool's help surface. Driver: zero-risk deprecation trajectory — shipped callers continue to work; the help-doc guidance line (FR-020) can honestly call `search` "path-only-preferred" without misrepresenting its current schema; a future BI does the schema removal as a one-line edit after a deprecation window. This OVERRIDES the spec-stage Assumption that left the flag both unmodified AND unmentioned: the assumption is restated below to reflect the help-text touch as IN scope, while keeping `search`'s schema and handler code OUT of scope.
- Q: How does `folder` scoping handle nested subfolders? → A: **Recursive subtree-prefix** — `folder=Projects` matches every `.md` file under the `Projects/` subtree at any depth (`Projects/foo.md`, `Projects/sub/foo.md`, `Projects/a/b/c.md` all included). Direct-children-only semantic is NOT supported at v1; callers who want a non-recursive scope must combine `folder` with a post-call filter or wait for a future BI to add an opt-in non-recursive flag. Driver: matches the FR-003 "begins with that prefix" wording at segment boundaries; matches typical grep `--include` recursion; matches the upstream `obsidian search:context --path` flag's behaviour; one knob is simpler than two when the dominant agent expectation is recursive.
- Q: How is line-ending whitespace handled in the `text` field of each `matches` entry? → A: **Strip a single trailing `\r` only**. Lines terminated by CRLF (Windows-authored vaults) MUST have their trailing `\r` stripped before the `text` field is populated. All other whitespace — leading indentation (indented Markdown lists, code-block content), intentional trailing spaces (Markdown two-space hard-break), tabs, etc. — MUST be preserved verbatim. The 500-character cap (FR-012) MUST be measured AFTER the `\r` strip, so callers do not lose a useful byte to an invisible `\r`. The wrapper MUST NOT strip `\n`, leading whitespace, or any other character. Driver: eliminates Windows/macOS/Linux snapshot-test drift; preserves Markdown-significant whitespace; matches the principle of "normalise the platform artifact, preserve the author's intent".

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Per-match context returned inline (Priority: P1)

A caller supplies a non-empty keyword and a vault target; the tool returns, in one call, a structured list of matches in which every entry carries the matching file's vault-relative path, the 1-based line number of the matching line, and the full text of that line.

**Why this priority**: This is the MVP and the entire point of the feature. Without it, agents must follow the "find file → read file → locate line" three-call pattern that already dominates grep-style vault lookups. With it, the pattern collapses to one call and the latency / token cost of vault grep drops accordingly.

**Independent Test**: Populate a vault with a single note whose text spans multiple lines and contains the keyword `K` on lines 2 and 5. Call the new tool with `query=K`. Assert the response contains exactly two entries — one shaped `{path, line: 2, text: "<line 2 text>"}` and one shaped `{path, line: 5, text: "<line 5 text>"}` — and `count=2`.

**Acceptance Scenarios**:

1. **Given** the vault contains one or more lines matching `query=K`, **When** the tool is called, **Then** the response is a structured object containing a non-negative `count` and an array of entries, each carrying `path`, a 1-based `line`, and the matching line `text`.
2. **Given** the vault contains zero lines matching `query=K`, **When** the tool is called, **Then** the response is `count=0` with an empty match array — no error.
3. **Given** the `query` is empty or whitespace-only, **When** the request is submitted, **Then** validation fails with a structured error before any vault scan is performed.

---

### User Story 2 — Distinct sibling alongside the path-only tool (Priority: P2)

A developer choosing between vault-search tools sees TWO distinct tools listed side-by-side in the help surface — the existing path-only `search` and the new context-bearing tool — with guidance on which to prefer for which workload, and the two tools' response shapes are observably different.

**Why this priority**: The whole reason to add a second tool (rather than another flag on the existing one) is to make the precision-versus-cost tradeoff legible at the tool-selection boundary, not buried inside an input flag. If the help surface or the response shape doesn't make the two tools look distinct, the feature delivers no discoverability win and callers default to the wrong one.

**Independent Test**: Query the project's progressive-disclosure help surface for vault-search tooling. Assert that BOTH `search` (path-only) and the new context-bearing tool appear, that each carries a "prefer this when..." sentence, and that the published output schemas show the new tool's entries carry `line` + `text` fields the path-only tool does not.

**Acceptance Scenarios**:

1. **Given** the help surface is queried for vault-search tooling, **When** the response is rendered, **Then** both tools are listed side-by-side with a one-sentence guidance line per tool indicating when to prefer it.
2. **Given** an agent calls the new tool, **When** the response is returned, **Then** every entry carries a `line` (integer ≥ 1) and a `text` (string) field in addition to `path` — observably distinct from the path-only sibling's response, whose entries carry only `path`.

---

### User Story 3 — Scoped and capped result set (Priority: P2)

A caller can narrow a context-search call to a specific vault-relative folder, cap the number of returned matches at a positive integer of their choosing, and (independently) require case-sensitive matching; the response remains bounded on large vaults and carries a flag when the underlying match set was clipped.

**Why this priority**: Large vaults plus broad keywords (e.g. `the`, `a`) saturate the response budget. Folder scoping and a result cap are the two lowest-friction controls a caller has; without them the tool is unusable on real vaults. Case sensitivity exclusion is the standard companion knob — code-symbol grep (`getUser`) breaks under case-insensitive matching, so the toggle is essential when the dominant default (case-insensitive) is wrong.

**Independent Test**: (a) Populate a vault with 10 files each containing keyword `K` on one line; call with `query=K` and `limit=3` — assert exactly 3 entries returned and a `truncated: true` flag. (b) Populate a vault with `Projects/alpha.md` (contains `K`) and `Archive/old.md` (contains `K`); call with `query=K` and `folder=Projects` — assert only the `Projects/...` entry is returned. (c) Populate a vault with `note-a.md` containing `Foo` and `note-b.md` containing `foo`; call with `query=Foo` and `case_sensitive=true` — assert only `note-a.md`'s line is returned.

**Acceptance Scenarios**:

1. **Given** the call supplies `limit=N` and the underlying match set exceeds N, **When** the tool returns, **Then** exactly N entries appear in the response AND a boolean flag indicates the result was truncated.
2. **Given** the call supplies `folder=F`, **When** the tool runs, **Then** every entry's `path` falls under `F/` and matches outside `F` are excluded.
3. **Given** the call supplies `case_sensitive=true`, **When** the tool runs, **Then** lines that differ only in letter case from the query are excluded from the response.

---

### User Story 4 — Structured errors for missing targets (Priority: P3)

A caller whose request names an unknown vault, or an unknown folder within a known vault, receives a structured error that distinguishes "the target did not exist" from "the target existed but nothing matched".

**Why this priority**: An agent diagnosing why a search returned nothing needs to tell "I searched the right place and there's nothing" apart from "I searched a place that doesn't exist". The two cases warrant different follow-up — the first stops the search line of inquiry; the second prompts the agent to re-check its locator. Collapsing both into `count=0` is a debugging hazard.

**Independent Test**: (a) Call the tool with `vault="does-not-exist"` — assert a structured vault-not-found error is returned, not `count=0`. (b) Call the tool with a known vault and `folder="DoesNotExist"` — assert a structured folder-not-found error is returned, not `count=0`. (c) Call the tool with a known vault and a known folder containing no matches for the query — assert `count=0` (no error).

**Acceptance Scenarios**:

1. **Given** the named `vault` is not recognised by the CLI, **When** the tool is called, **Then** a structured vault-not-found error is returned — not an empty match list.
2. **Given** the named `folder` does not exist inside an otherwise-valid vault, **When** the tool is called, **Then** a structured folder-not-found error is returned — not an empty match list.
3. **Given** the vault and folder both exist but the query has zero matches, **When** the tool is called, **Then** the response is `count=0` with an empty match array — no error.

---

### Edge Cases

- Empty / whitespace-only `query` — surfaces a structured `VALIDATION_ERROR` before any vault scan.
- `query` longer than 1000 characters — surfaces a structured `VALIDATION_ERROR` before any vault scan (parity with the path-only sibling's input cap, FR-008).
- Non-positive `limit` (zero or negative) or `limit` greater than 10000 — surfaces a structured `VALIDATION_ERROR` before any vault scan (parity with the path-only sibling's range cap).
- Unknown parameter included in the request — surfaces a structured `VALIDATION_ERROR` (strict input schema; parity with every typed tool in the project).
- `folder` prefix with leading or trailing `/` — normalised before matching (`Projects`, `Projects/`, `/Projects`, `/Projects/` are equivalent).
- `folder=Projects` with vault containing `Projects/foo.md`, `Projects/sub/bar.md`, and `Projects/a/b/c.md` — ALL three are searched (recursive subtree-prefix per FR-003 / Clarification 2026-05-17). Direct-children-only filtering is the caller's responsibility (post-call filter).
- `folder=Proj` with vault containing `Projects/foo.md` — `Projects/foo.md` is NOT searched (segment-boundary protection per FR-003 — `Proj` is not a folder name; it is a stripped-down string the wrapper rejects as a non-folder prefix). Match is at folder-segment boundaries, not character-level substring.
- `folder` prefix case mismatch (`folder=Projects` against vault path `projects/foo.md`) — surfaces a structured folder-not-found error, not `count=0`. Folder-existence is checked case-sensitively, code-point-for-code-point.
- Vault omitted — currently focused vault is searched (implicit-active per the project-wide vault-targeting convention for vault-scoped query tools).
- Unknown vault name supplied — surfaces a structured vault-not-found error consistent with the project-wide vault-routing convention.
- A single file contains the keyword on multiple lines — each matching line produces its own entry (no per-file dedupe; the whole point of the tool is per-line context).
- The same line contains the keyword multiple times — the line appears exactly once (entries are keyed by `{path, line}`, not by per-occurrence).
- A matching line exceeds 500 characters — the `text` field is truncated to the first 500 characters with a trailing Unicode horizontal-ellipsis `…` (U+2026) appended (parity with the path-only sibling's line-mode FR-024). The line is still counted and surfaced; only its `text` representation is clipped.
- A matching line is exactly 500 characters — returned verbatim with NO ellipsis appended.
- A matching line on a CRLF-terminated file (Windows-authored vault) — the trailing `\r` is stripped before the `text` field is populated and before the 500-character cap is measured (FR-012 / Clarification 2026-05-17). No other whitespace is stripped; a line like `  - bullet  \r\n` becomes `text: "  - bullet  "` (leading two-space indent and trailing two-space Markdown hard-break preserved).
- A matching line ends with a literal `\r` that is NOT followed by `\n` (rare; non-standard line ending) — the `\r` is still stripped by FR-012's "single trailing `\r`" rule. The strip is unconditional on the trailing-position `\r`, not gated on `\r\n` adjacency.
- A matching line contains an embedded `\r` in the middle of the line text (rare; non-standard) — embedded `\r` characters are NOT stripped; only a single trailing `\r` is removed.
- `limit` omitted AND the underlying match set ≤ 1000 — full set returned; `truncated` absent or `false`.
- `limit` omitted AND the underlying match set > 1000 — exactly 1000 entries returned; `truncated: true` (implicit-cap clip; parity with the path-only sibling's FR-022).
- `limit=N` supplied AND the underlying match set > N — exactly N entries returned; `truncated: true` (explicit-cap clip).
- After the applicable cap is applied, the capped response STILL exceeds the cli-adapter's output budget (rare case with extraordinarily long line text exceeding the inherited 10 MiB cap) — inherited `CLI_NON_ZERO_EXIT` envelope surfaces from the cli-adapter's output-cap-kill (wrapper does NOT customise the message; parity with the path-only sibling's FR-018 defer-to-cli-adapter pattern).
- Match inside a fenced code block — included (the underlying CLI is keyword-only over file text; code-block exclusion is out of scope at v1).
- Match inside frontmatter YAML — included (whole-file text search; frontmatter-targeted lookups remain the responsibility of `find_by_property`).
- Case-insensitive mode with non-ASCII characters (`query=É` vs file text `é`) — does NOT match at v1; ASCII lower-fold only (parity with the path-only sibling's FR-009). Use `case_sensitive=true` to require exact-code-point match, or pre-normalise the query.
- Multi-token query (`query=foo bar`) — treated as a single literal substring including the space; matches the contiguous substring `foo bar` but not a file with `foo` on one line and `bar` on another (phrase-match semantics; parity with the path-only sibling's FR-001).
- Non-`.md` file in the vault contains the keyword — excluded from results (parity with the path-only sibling's FR-021); canvas / base / attachments / plugin-configs are NEVER returned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST accept a non-empty `query` string and return per-line context matches from a single vault target. The `query` is matched as a single literal substring (phrase match) — internal whitespace is preserved verbatim and matched as part of the substring. Token-AND, token-OR, boolean composition, and explicit phrase delimiters are NOT supported at v1.
- **FR-002**: The tool's response MUST be a structured object containing a non-negative integer `count`, an array `matches` of entries shaped `{ path: string, line: integer (1-based, ≥ 1), text: string }`, and an optional boolean `truncated` (see FR-010 / FR-011). `count` MUST equal `matches.length` (post-cap length, not pre-cap pre-flatten match-set size). The shape is invariant — there is no modal flag that swaps to a path-only response shape; callers wanting path-only output call the existing `search` sibling instead.
- **FR-003**: The tool MUST accept an optional `folder` parameter (vault-relative path prefix). When supplied, only files whose vault-relative path begins with that prefix MUST appear in the response. Matching MUST be **recursive subtree-prefix at folder-segment boundaries**: `folder=Projects` MUST include every `.md` file under the `Projects/` subtree at any depth (`Projects/foo.md`, `Projects/sub/foo.md`, `Projects/a/b/c.md`); `folder=Proj` MUST NOT match a file under `Projects/` (segment-boundary protection — Clarification 2026-05-17). The non-recursive (direct-children-only) semantic is NOT supported at v1.
- **FR-004**: The tool MUST normalise the `folder` parameter by stripping a single leading `/` and a single trailing `/` before matching; inputs `Projects`, `Projects/`, `/Projects`, and `/Projects/` MUST be equivalent. After normalisation, the wrapper MUST verify the folder exists in the named vault; a non-existent folder MUST surface a structured folder-not-found error (FR-013), NOT a silent empty result.
- **FR-005**: The tool MUST accept an optional `limit` parameter (positive integer in the inclusive range `1..10000`). When supplied, at most that many entries MUST appear in the `matches` array.
- **FR-006**: The tool MUST reject a `limit` outside the inclusive range `1..10000` (zero, negative, or greater than 10000) with a structured `VALIDATION_ERROR` BEFORE any vault scan.
- **FR-007**: The tool MUST accept an optional `case_sensitive` boolean (default `false`). When `false` or omitted the keyword match MUST be case-insensitive using ASCII lower-fold only — both the `query` and the file text MUST be folded via `String.prototype.toLowerCase()` (folding only the range `A-Z` ↔ `a-z`). Non-ASCII characters MUST be compared verbatim with no Unicode/ICU folding. When `case_sensitive=true` the match MUST be code-point-exact, both ASCII and non-ASCII.
- **FR-008**: The tool MUST reject an empty or whitespace-only `query`, OR a `query` exceeding 1000 characters in length, with a structured `VALIDATION_ERROR` BEFORE any vault scan. The 1000-character cap is measured on the raw input string (post-JSON-parse, pre-search); no trimming is applied before measurement.
- **FR-009**: The tool MUST reject any unknown input parameter with a structured `VALIDATION_ERROR` BEFORE any vault scan (strict input schema — parity with every typed tool in the project).
- **FR-010**: When `limit` is omitted, the tool MUST apply an implicit hard cap of 1000 entries on the response `matches` array. When `limit` IS supplied, that value MUST take precedence over the implicit cap in both directions (`limit=10` returns up to 10; `limit=5000` returns up to 5000). The cap unit is `matches.length` (one entry per matching LINE, post-flatten across files).
- **FR-011**: The response MUST include the boolean field `truncated` whenever the underlying pre-cap match set exceeded the applied cap (implicit 1000 OR a user-supplied `limit`); the value MUST be `true` in that case. When the underlying set fit within the cap, the wrapper MAY OMIT the field or set it to `false` — callers MUST treat `truncated` absent as equivalent to `false`. The response MUST NOT include the pre-cap match-set count as a separate field.
- **FR-012**: Before length-capping, the wrapper MUST strip a single trailing `\r` from each matching line's text if present (CRLF normalisation per Clarification 2026-05-17). No other whitespace MUST be stripped — leading indentation, tabs, intentional trailing spaces (Markdown hard-break), and any other character MUST be preserved verbatim. The post-strip `text` field of each `matches` entry MUST be capped at 500 characters. Lines whose post-strip text exceeds 500 characters MUST be truncated to their first 500 characters and have the Unicode horizontal-ellipsis character `…` (U+2026, single character) appended — final `text` length is 501 characters in that case. Lines whose post-strip text is ≤ 500 characters MUST be returned verbatim (no ellipsis appended). The 500-character cap is measured on the post-strip string; the `\r` (when present) is never counted against the cap.
- **FR-013**: The tool MUST surface a structured folder-not-found error when the (normalised) `folder` parameter names a path that does not exist inside the named vault. This is the load-bearing behavioural divergence from the path-only sibling `search` (whose missing-folder behaviour is empty result; the new tool treats missing-folder as a structured error so callers can distinguish "wrong locator" from "no match"). The error envelope MUST be one of the project's existing top-level error codes (Constitution Principle IV — zero new top-level codes introduced by this BI); the exact envelope identity is a planning decision deferred to `/speckit-plan`.
- **FR-014**: The tool MUST surface a structured vault-not-found error when the named `vault` is not recognised by the CLI. The envelope MUST follow the project-wide vault-routing convention (parity with `search` FR-016 — the inherited cli-adapter classifier emits the canonical vault-not-found envelope).
- **FR-015**: The tool MUST follow the project-wide vault-targeting convention for VAULT-SCOPED query tools (parity with `search` FR-016, BI-014, BI-024, BI-028): a single optional `vault?: string` parameter. When supplied, the named vault is targeted; when omitted, the CLI defaults to the currently focused vault. There is NO `mode` discriminator.
- **FR-016**: The tool MUST follow the project-wide error-envelope conventions; the v1 surface MUST introduce zero new top-level error codes (Constitution Principle IV).
- **FR-017**: The tool MUST restrict its search corpus to files whose vault-relative path ends in `.md` (case-insensitive on the extension — `.MD`, `.Md` accepted). Canvas (`.canvas`), base (`.base`), attachments, plugin configs (`.json`, `.css`), and any other non-`.md` file MUST be excluded from `matches`, even if the upstream subcommand would otherwise index them.
- **FR-018**: The `matches` array MUST be returned in a deterministic order so that repeated calls with identical inputs and stable vault state yield identical responses. Order MUST be `path` ascending (UTF-16 code-unit order), then `line` ascending (parity with `search`'s line-mode FR-019).
- **FR-019**: The output-too-large structured error MUST fire only when the response — AFTER the applicable cap (user-supplied `limit` or implicit 1000) has been applied — STILL exceeds the cli-adapter's output budget. The error surfaces as the inherited `CLI_NON_ZERO_EXIT` envelope from the cli-adapter's output-cap-kill; the wrapper does NOT construct a custom message. The error MUST NOT fire on a normally-capped response; the `truncated` flag (FR-010 / FR-011) is the routine signal that a larger underlying match set was clipped.
- **FR-020**: The tool's progressive-disclosure help surface MUST document the full input contract, the output shape, the error roster, and at least four worked examples. The help surface MUST also include a one-sentence guidance line indicating when to prefer this tool over the path-only `search` sibling. The `search` tool's help surface MUST be updated in the same BI to (a) mark `context_lines` as `deprecated — prefer the dedicated context-search tool` and (b) carry the inverse one-sentence pointer to the context tool when per-line context is needed. The `search` update is a help-text-only touch — `search`'s input schema, output schema, handler behaviour, and the `context_lines` flag's current semantics remain unchanged (Clarification 2026-05-17). Full removal of the `context_lines` flag is deferred to a future deprecation BI.
- **FR-021**: The response MUST NOT echo the locator inputs (`vault`, `query`, `folder`, `limit`, `case_sensitive`) — read-tool response convention (memory: read tools don't echo locator).

### Key Entities *(include if feature involves data)*

- **Keyword query**: a non-empty string the caller wants to find in file text. Treated as a single literal substring (phrase match); internal whitespace preserved verbatim. NOT a regex, NOT a token list, NOT a structured expression. Case-folding governed by the `case_sensitive` flag.
- **Line match**: a tuple `{path, line, text}` locating a single line in a `.md` file containing at least one occurrence of the keyword. `path` is vault-relative with forward-slash separators. `line` is a 1-based integer. `text` is the matching line's content, capped at 500 characters with a trailing `…` (U+2026) marker on truncated lines (FR-012).
- **Folder prefix**: a vault-relative folder path (no leading/trailing `/` after normalisation) restricting the search to files under that subtree. Unlike the path-only sibling's lenient missing-folder semantic, a missing folder here surfaces a structured error (FR-013).
- **Vault target**: an Obsidian vault identified by name (explicit `vault?` parameter) or implicitly (the currently focused vault). Unknown vault names surface a structured error (FR-014).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent retrieves per-line context (file path + 1-based line number + line text) for every keyword match in a single call, replacing the prior "find file → read file → locate line" three-call pattern. Median round-trips per grep-style lookup drops from 3 (path-only search + per-file read + line locator) to 1.
- **SC-002**: A query that yields zero matches returns `count=0` and an empty `matches` array, with no error. Distinguishable from the missing-locator error path by response shape (object-with-count vs structured error envelope).
- **SC-003**: A `folder=F` query returns 100% of matches under the `F/` subtree at any depth (recursive subtree-prefix per FR-003 / Clarification 2026-05-17) and 0% of matches outside `F/`. A `folder=F` query against a folder that does not exist surfaces a structured folder-not-found error, NOT `count=0`.
- **SC-004**: A `vault="does-not-exist"` query surfaces a structured vault-not-found error consistent with the project-wide vault-routing convention, NOT `count=0`.
- **SC-005**: A query with `limit=N` against a vault whose underlying match set exceeds N returns exactly N entries AND sets `truncated: true`. A query without `limit` against a vault with > 1000 matches returns exactly 1000 entries AND sets `truncated: true`. A query whose underlying match set fits the applied cap returns the full set AND omits (or sets `false`) the `truncated` flag.
- **SC-006**: A `case_sensitive=true` query returns only code-point-exact matches (ASCII and non-ASCII alike). A `case_sensitive=false` (or omitted) query returns ASCII case-insensitive matches (folds `A-Z` ↔ `a-z` only); non-ASCII characters compare verbatim.
- **SC-007**: Repeated calls with identical inputs and stable vault state return byte-identical responses (deterministic ordering — `path` ascending, then `line` ascending).
- **SC-008**: Invalid inputs (empty / whitespace-only `query`, `query` > 1000 chars, `limit` outside `1..10000`, unknown parameter) are rejected before any vault scan with a structured `VALIDATION_ERROR`.
- **SC-009**: A line whose post-strip text exceeds 500 characters appears in the response with `text` truncated to 500 characters plus a single `…` (U+2026) marker; lines whose post-strip text is ≤ 500 characters are returned verbatim with no ellipsis. A matching line from a CRLF-terminated file appears with its single trailing `\r` stripped and no other whitespace altered (FR-012 / Clarification 2026-05-17).
- **SC-010**: Non-`.md` files in the vault that contain the keyword are NOT returned, even when seeded explicitly. The corpus is the `.md` subset.
- **SC-011**: The progressive-disclosure help surface, when queried, returns the full input contract, the output shape, the error roster, at least four worked examples, AND a one-sentence guidance line on when to prefer this tool over the path-only `search` sibling. The `search` help surface carries the inverse one-sentence pointer.
- **SC-012**: The v1 surface introduces zero new top-level error codes (Constitution Principle IV; preserves the project's zero-new-top-level-codes streak).

## Assumptions

- The new registered tool name is `search_context` per ADR-010 single-word-verbatim-from-upstream (upstream subcommand is `obsidian search:context`; the colon flattens to underscore per the project's typed-tool naming convention seen across `read_property`, `find_by_property`, `read_heading`, etc.). The source module is expected at `src/tools/search_context/` with factory function `createSearchContextTool`. The exact spelling is a planning decision; `/speckit-plan` may revisit if a different verbatim form better honours ADR-010.
- The existing `search` tool's input schema, output schemas, and handler behaviour are unchanged by this BI. Its existing `context_lines` boolean flag (which today switches the response between path-only and line-context shapes per BI-033 FR-004) continues to function exactly as before. The `search` tool's HELP TEXT is updated in this BI (per FR-020 and the 2026-05-17 Clarification): `context_lines` is marked `deprecated — prefer the dedicated context-search tool`, and the help body gains a one-sentence cross-pointer to the new tool. No code-behaviour change to `search`. Full removal of the `context_lines` flag and its associated line-mode output schema is deferred to a future deprecation BI after a usage window.
- Vault targeting uses the project-wide vault-scoped-query convention (plain optional `vault?`; implicit-active on omit; parity with BI-014 / BI-024 / BI-028 / BI-033 FR-016). Active-mode TOCTOU is handled uniformly by the project-wide approach noted in the assistant's memory; this tool does not retrofit per-tool active-mode protection.
- The read-tool response convention applies: the tool returns data only; locator inputs (`vault`, `query`, `folder`, `limit`, `case_sensitive`) are NOT echoed in the response (FR-021).
- The folder-existence check (FR-013) is the load-bearing behavioural divergence from the path-only sibling. Implementation will likely use the project's existing `paths`-style vault metadata or a stat-equivalent CLI subcommand; the exact mechanism is a `/speckit-plan` decision. The check MUST happen wrapper-side regardless of upstream's empty-result behaviour, because the user-facing contract requires distinguishing "wrong folder" from "no match".
- The output-too-large detector (FR-019) reuses the project's existing output-budget infrastructure (cli-adapter's 10 MiB output-cap-kill) rather than introducing a new threshold. Parity with `search` FR-018's defer-to-cli-adapter pattern. Routine cap-clipping surfaces as `truncated: true`, not as an error envelope.
- The implicit 1000-entry cap (FR-010) and the 500-character per-line text cap (FR-012) are wrapper invariants — they are NOT plumbed through to the input schema as separately-configurable knobs. Callers who want a different cap pass `limit` explicitly (for the entry cap); the text cap has no caller knob.
- The underlying CLI is keyword-only (substring containment); regex and structured/logic-expression queries are out of scope at v1 (parity with `search`).
- Corpus is restricted to `.md` files (FR-017). Canvas, base, attachments, plugin configs, and other non-`.md` files are excluded wrapper-side — parity with `search` FR-021.
- Match semantics defer to the underlying CLI's interpretation of "file text" — frontmatter and code blocks are searched as ordinary text. Frontmatter-targeted lookups remain the responsibility of `find_by_property`.

## Out of scope

- Modifying the existing `search` tool's input schema, output schemas, or handler code. The `context_lines` flag on `search` is left functionally in place; the BI does update `search`'s HELP TEXT to mark the flag deprecated and add a cross-pointer (per FR-020 and the 2026-05-17 Clarification), but no executable behaviour of `search` changes. Full removal of the flag is a future deprecation BI.
- Multi-line context windows (returning lines N±k around each match). Only the matching line itself is returned at v1; widening the context window is a future enhancement.
- Regex or extended-pattern search beyond the underlying CLI's keyword-only substring semantics.
- Ranking, scoring, or relevance ordering of matches. Result order is deterministic by `(path, line)` ascending; relevance ordering is a future enhancement.
- Cross-vault search aggregation. Each call targets a single vault.
- Persistent search indexes or incremental re-indexing. The tool operates against the live vault state at call time.
- Pagination (`offset` parameter) — `limit` only at v1.
- Unicode / locale-aware case-folding (Turkish-i, German sharp-s, Greek sigma, full ICU folds). v1 case-insensitive mode is ASCII lower-fold only (FR-007), parity with `search` FR-009.
- Replace-in-vault (write-side counterpart). Separate BI when demand emerges.
- File-level locator parameters (`file`, `path`). This tool is vault-scoped; per-file context is the responsibility of `read` or `read_heading`.
- Multi-keyword boolean queries (`foo AND bar`, `foo OR bar`). Single literal-substring query per call at v1.
