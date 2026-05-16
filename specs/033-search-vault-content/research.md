# Research: Search Vault Content

**Branch**: `033-search-vault-content`
**Date**: 2026-05-16
**Phase**: 0 (Outline & Research)

Phase 0 decisions (R1..R16) plus plan-stage live-CLI probe findings (F1..F8) against the authorised `TestVault-Obsidian-CLI-MCP`. Live probes drove TWO spec-correction amendments (FR-016 wording; FR-021 implementation-detail note).

## Phase 0 Decisions

### R1 — Architecture: NATIVE wrapper, NOT eval

The wrapper invokes `obsidian search` (default mode) and `obsidian search:context` (line-level mode) directly via `invokeCli`. NOT an `eval` JS template walk.

**Rationale**: Live-probe F1 confirmed the native CLI exposes BOTH subcommands with first-class `format=text|json`. F1's `obsidian help` output:

```
search                Search vault for text
  query=<text>        - Search query (required)
  path=<folder>       - Limit to folder
  limit=<n>           - Max files
  total               - Return match count
  case                - Case sensitive
  format=text|json    - Output format (default: text)

search:context        Search with matching line context
  query=<text>        - Search query (required)
  path=<folder>       - Limit to folder
  limit=<n>           - Max files
  case                - Case sensitive
  format=text|json    - Output format (default: text)
```

Every spec input maps to a native flag (`query` → `query`, `folder` → `path`, `limit` → `limit`, `case_sensitive` → `case` flag). `format=json` produces structured output for both subcommands. The native subcommand surface already provides everything the spec needs.

**Departure from BI-028 precedent**: BI-028 pivoted from native `tag` to `eval` because the native `tag` subcommand had three contract mismatches (plain-text-only, zero-match-as-error, no child-subsumption). NONE of those mismatches apply here — `search`/`search:context` have JSON output, return empty results without erroring on the non-zero-match wire path (F2 sentinel is wrapper-handled), and have no hierarchical-subsumption requirement to enforce.

**Alternatives considered**: `eval` + manual file-walk (parity with BI-028) — rejected as gratuitously over-engineered when the native subcommand IS first-class. Hybrid (native for default mode, eval for line mode) — rejected; both native subcommands work.

### R2 — Two-subcommand routing keyed on `input.context_lines`

The handler routes to ONE of two CLI subcommands per call based on `input.context_lines`:

- `context_lines: false` (or omitted) → `subcommand: "search"`
- `context_lines: true` → `subcommand: "search:context"`

Both calls share the same parameter assembly (`query`, `path`, `limit`, `case`, `format=json`); only the subcommand name and the response-parse logic differ.

**Rationale**: Single tool surface `search` exposed to MCP callers (ADR-010 single-word-verbatim), with internal mode-routing. Parity with the multi-subcommand wrapping pattern used in BI-019 `files` (which routes to `obsidian files` or `obsidian files:listing` based on mode).

**Alternatives considered**: TWO separate MCP tools (`search` and `search_lines`) — rejected; spec User Story 2 explicitly frames line-level as a "mode" of the same tool, and ADR-010 names match upstream subcommands one-to-one but the project precedent (BI-019) permits a single MCP tool to internally route to multiple upstream subcommands when the user-facing operation is one conceptual primitive.

### R3 — Two-stage truncation: CLI-side cap detection + wrapper-side line clip

Both subcommands' CLI `limit=` flag caps **file count** (verified F4). Spec FR-022 / FR-023 caps **entry count** in the response array — which is `paths.length` in default mode (same as file count) but `matches.length` in line mode (potentially many lines per file, NOT same as file count). Wrapper handles the unit mismatch:

- **Default mode**: pass `limit = applied_cap + 1` to CLI (where `applied_cap = input.limit ?? 1000`). If CLI returns `applied_cap + 1` entries, set `truncated: true` and trim the response to `applied_cap`. Otherwise return as-is with `truncated` absent.
- **Line mode**: pass `limit = applied_cap` to CLI (file cap = line cap, conservative; over-flatten possible but bounded). Flatten the CLI's file-grouped response to a flat `{path, line, text}` array. If flattened length > applied_cap OR CLI returned ≥ applied_cap files (signal that file cap may have clipped), set `truncated: true` and trim the flat array to `applied_cap` entries.

**Rationale**: CLI emits no explicit truncation signal (F8). The `+1` probe is the standard technique for detecting cap-clip without an inline flag. Line mode's file-vs-line unit mismatch is fundamental; the conservative `truncated: true` when EITHER condition fires gives the caller a programmatic signal to re-query with `limit` raised (or `folder` narrowed).

**Trade-off documented**: in line mode, the `truncated: true` flag may fire even when the underlying flat-line set is exactly the applied cap (because the CLI clipped at the file cap and we can't tell whether any file-with-matches beyond the cap existed). This is conservative — preferring false-positive truncation signal to silent loss. Caller's recourse: raise `limit` (up to 10000) or narrow `folder`.

**Alternatives considered**: Fetch with NO `limit` flag and clip everything wrapper-side — rejected; potential MB-scale CLI stdout on large vaults would burn the cli-adapter's 10 MiB output cap unnecessarily. Two-phase fetch (probe-then-cap) — rejected; doubles round-trip cost.

### R4 — Zero-match: CLI sentinel `"No matches found.\n"` → wrapper converts to empty result

Live-probe F2 confirmed both `search` and `search:context` emit literal stdout `"\nNo matches found.\n"` (NOT JSON) on zero-match queries, with exit 0, regardless of `format=json` flag. The wrapper detects this exact sentinel and converts to the empty-result shape (`{count: 0, paths: []}` default, or `{count: 0, matches: []}` line mode).

**Rationale**: FR-012 ("never an error") lock. The native CLI has a wire-shape bug (returning non-JSON when JSON is requested) on the zero-match path; the wrapper translates. Same defensive pattern as BI-028 R5/R9 (zero-match isn't an error).

**Detection rule**: stdout `trimEnd().trimStart()` === `"No matches found."` AND exit code 0. Anything else is parsed as JSON. The trim guards against the leading `\n` the CLI emits.

**Alternatives considered**: Catch the JSON-parse failure and treat as zero-match — rejected; conflates the legitimate JSON-malformed case (a different `UpstreamError(CLI_REPORTED_ERROR, details.stage: "json-parse")`) with the zero-match-sentinel case. The sentinel is an exact known string.

### R5 — Folder normalisation wrapper-side; segment-boundary and case-sensitivity inherited from CLI

The wrapper normalises `folder` by stripping a single leading `/` AND a single trailing `/` (FR-006), then passes through as `path=<normalised>`. The CLI natively enforces segment-boundary matching (F3 confirmed `path=Fix` did NOT match `Fixtures/...`) AND case-sensitive matching (F3 confirmed `path=fixtures` did NOT match the existing `Fixtures/` folder).

**Rationale**: FR-005's segment-boundary requirement AND the Q2-locked case-sensitive folder matching are BOTH naturally satisfied by the upstream `path=` flag. The wrapper's only contribution is the leading/trailing-`/` normalisation (a UX nicety, not a semantic enforcement).

### R6 — `.md`-only filetype scope: NATIVELY enforced by CLI

Live-probe F6 seeded `Sandbox/bi033-md.md`, `bi033-canvas.canvas`, `bi033-base.base`, `bi033-txt.txt` (all containing `bi033-token`). `obsidian search query=bi033-token format=json` returned ONLY `["Sandbox/bi033-md.md"]`. The native CLI restricts search to `.md` files; non-`.md` files are excluded even when their text contains the keyword.

**Implication for FR-021**: the spec's "wrapper MUST restrict search corpus to `.md` files... even if upstream indexes them" clause is currently satisfied by upstream — no wrapper-side filter is needed at v1. The wrapper retains a defensive `.endsWith(".md")` post-filter (case-insensitive on extension per FR-021) as defence-in-depth: if a future Obsidian CLI version extends search to `.canvas`/`.base`/etc, the wrapper still meets the spec contract. The post-filter is a no-op against the current CLI but a regression-detector against future drift; a single co-located handler test asserts the filter rejects a synthetic non-`.md` row.

**Alternatives considered**: Drop the wrapper-side filter entirely — rejected; FR-021's spec wording explicitly requires wrapper enforcement, and the cost (one filter call per response, one test case) is negligible.

### R7 — Vault targeting: PLAIN `vault?`-only (NO `mode` discriminator)

The schema uses a single optional `vault?: string` parameter. When supplied, the CLI routes to the named vault. When omitted, the CLI defaults to the currently focused vault. There is NO `mode: 'active' | 'specific'` discriminator.

**Rationale**: Spec FR-016 originally described a `mode` discriminator field — but the project convention for VAULT-SCOPED query tools (verified across BI-014 `find_by_property`, BI-024 `properties`, BI-028 `tag`) uses plain `vault?`-only; the `target_mode` primitive in `src/target-mode/target-mode.ts` is the per-FILE typed-tool primitive per ADR-003 (file-scoped) and ADR-003-amendment-2026-05-07 (folder-scoped variant in BI-029 `paths`). `search` is intrinsically vault-wide-query-with-optional-folder-filter; it falls in the BI-028 cohort, not the BI-029 folder-addressing cohort.

**Spec amendment** (recorded in spec.md Clarifications "Plan-stage live-probe amendments" block): FR-016 restated to drop the `mode` discriminator and adopt plain `vault?`-only. The "mode: 'active' + vault name = VALIDATION_ERROR" edge case is removed. Vault-targeting acceptance scenarios simplified.

**Alternatives considered**: Use the BI-029 folder-scoped target_mode primitive — rejected; `folder?` here is a QUERY FILTER, not an addressing primitive (`paths` returns "paths under this folder"; `search` returns "matches in vault, optionally filtered to folder"). The conceptual shape is BI-028-like, not BI-029-like.

### R8 — `case_sensitive` mapping: conditional CLI `case` flag

Live-probe F5 confirmed the CLI's default behaviour is case-insensitive (`obsidian search query=welcome format=json` matched `Welcome.md`), and the `case` flag opts INTO case-sensitivity (`obsidian search query=welcome case format=json` returned `No matches found.`). The wrapper maps:

- `input.case_sensitive === true` → add `case` to CLI parameters (presence-only boolean flag)
- `input.case_sensitive === false || undefined` → omit `case` (CLI default case-insensitive)

**Rationale**: Spec Q5 clarification locked ASCII lower-fold semantics for case-insensitive mode. F5 shows the CLI's default already delivers case-insensitive matching that matches the spec contract. No wrapper-side fold needed (the CLI handles it). Unicode case-folding behaviour is whatever the CLI does internally — defer-to-upstream parity with BI-028 Q1 (ASCII-only documented; non-ASCII characters compare verbatim).

**Note**: Live probes did NOT exhaustively characterise the CLI's case-fold algorithm for non-ASCII (the TestVault has only ASCII fixtures). Defer-to-upstream documented as inherited limitation; future probe may surface specifics.

### R9 — Line-mode response flattening: drop `matches: []` entries

The native `search:context` response shape is file-grouped: `[{file: "<path>", matches: [{line: <int>, text: "<line text>"}]}]`. Some entries have `matches: []` — F7 confirmed this happens when a file is included by `search` (filename / heading / metadata match) but has no body line that contains the query literal. The wrapper FLATTENS to the spec's flat shape `[{path, line, text}]`:

```ts
const flat = jsonResponse.flatMap((entry) =>
  entry.matches.map((m) => ({ path: entry.file, line: m.line, text: m.text }))
);
```

Entries with `matches: []` contribute zero rows to the flat array — they are silently dropped in line mode. This means line-mode `count` may be LESS than default-mode `count` for the same query when filename-only matches exist (e.g. `query=Welcome` returns 2 paths in default mode but only 1 line-match in line mode, because `Welcome.md` itself has no body line containing "Welcome").

**Documented as inherited limitation** in tool docs: "Line mode returns only line-level matches; files matched by filename / heading / metadata with no matching body line are excluded from `matches` (they appear in default-mode `paths` but contribute zero rows to line-mode `matches`)."

**Rationale**: Spec FR-003 shape mandates `{path, line, text}` per entry — there's no provision for filename-only entries. Dropping is the contract-honest interpretation. Adding synthetic `line: 0` markers would violate FR-003's "1-based, ≥1" constraint.

### R10 — Per-line `text` capping: 500-char wrapper-side post-truncation

The wrapper post-processes each flattened `{path, line, text}` entry: if `text.length > 500`, truncate to first 500 characters and append `…` (U+2026 single character). Lines ≤ 500 chars are returned verbatim (no marker).

**Rationale**: FR-024 lock. Wrapper-side post-process keeps the JS template / CLI invocation simple; the cap fires INSIDE the line-mode flatten step:

```ts
const TEXT_CAP = 500;
const ELLIPSIS = "…";
const capLine = (text) => text.length <= TEXT_CAP ? text : text.slice(0, TEXT_CAP) + ELLIPSIS;
```

**Alternatives considered**: Pass through verbatim and rely on the 10 MiB cli-adapter cap — rejected; FR-024 explicitly specifies a 500-char cap with marker, and the cli-adapter cap is the wrong layer for per-line truncation. CLI-side line-length truncation flag — rejected; the CLI offers no such flag.

### R11 — Determinism: wrapper sort by `path` (default) and `path` + `line` (line mode)

CLI ordering across both subcommands is not contractually specified (live probes consistently returned `["Welcome.md", "Fixtures/BI-017/inline-markdown.md"]` order, but this may be vault-traversal-order which is not stable across Obsidian versions / vault reindexes). The wrapper SORTS the response post-flatten:

- Default mode: `result.paths.sort()` (UTF-16 code-unit ascending — `Array.prototype.sort()` default)
- Line mode: `result.matches.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)`

**Rationale**: FR-019 lock. SC-007 requires byte-identical responses on repeated calls. Wrapper-side sort gives reproducibility on top of upstream regardless of CLI traversal-order.

**Trade-off**: sort is O(N log N) where N ≤ 10000 (capped); negligible cost.

### R12 — Test seam: single `invokeCli` per request, mocked stdout shapes per subcommand

Handler tests mock `invokeCli`. Assertions verify:
1. Exactly one `invokeCli` call per request.
2. `subcommand` is `"search"` (default mode) OR `"search:context"` (line mode).
3. `parameters.query` flows through verbatim from input.
4. `parameters.path` is the normalised `folder` value (leading/trailing-`/` stripped) when input.folder supplied; omitted otherwise.
5. `parameters.limit` is `applied_cap + 1` (default mode) OR `applied_cap` (line mode).
6. `parameters.case` is `true` (presence flag) when `input.case_sensitive === true`; omitted otherwise.
7. `parameters.format` is always `"json"`.
8. `parameters.vault` flows through from input when present.

Test fixtures cover: happy default mode, happy line mode, zero-match sentinel, cap-clip detection (returns `applied_cap + 1` rows), `matches: []` entry dropping, 500-char line truncation, multi-file flatten with sort, malformed JSON, `Vault not found.` sentinel.

**Rationale**: Parity with BI-014 / BI-024 / BI-028 / BI-030 test patterns. Mocked `invokeCli` is the single seam.

### R13 — Structured response error envelope: cli-adapter classifier + wrapper-side stages

The handler's multi-stage parse:

- **Stage 0**: Zero-match sentinel — if `stdout.trim() === "No matches found."`, return empty result (NOT an error).
- **Stage 1**: `JSON.parse(stdout)`. Failure → `UpstreamError(CLI_REPORTED_ERROR, details: {stage: "json-parse"})`.
- **Stage 2**: `safeParse` against the per-mode wire-schema (`searchDefaultWireSchema` for `search`, `searchContextWireSchema` for `search:context`). Failure → `UpstreamError(CLI_REPORTED_ERROR, details: {stage: "wire-parse"})`.
- **Stage 3**: Apply mode-specific post-processing (default: pass paths through; line: flatten + drop-empty-matches + cap-text + clip-to-limit).
- **Stage 4**: Sort + compute `truncated` flag.
- **Stage 5**: Validate against per-mode `output-schema` at the boundary.
- **Stage 6**: Return to caller.

Pre-stage-0 failures (binary not found, CLI exit ≠ 0 with non-sentinel stderr, `Vault not found.` sentinel, output-cap kill) are handled by the inherited cli-adapter classifier (`CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)` etc.). The wrapper introduces ZERO new top-level error codes (Constitution Principle IV preserved — sixteen-tool zero-new-codes streak continues through BI-032).

**Rationale**: Parity with BI-024 / BI-028 / BI-030 staged parse. Differs from eval-cohort's stage-0 closed-vault detection (`_eval-vault-closed-detection` shared module) which is N/A here — this BI does NOT use `eval`.

### R14 — Logger surface: thin handler, no per-call tool-layer logging

The handler does NOT emit `logger.callStart` / `callEndSuccess` / `callEndFailure` events. Same outcome as every read-side typed tool. The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying invocation.

### R15 — Tool name: `search` (single-word verbatim from upstream `obsidian search` subcommand)

Tool name follows ADR-010 single-word-verbatim-from-upstream. The Obsidian CLI has an `obsidian search` subcommand (F1 confirmed). Per ADR-010, the typed-tool wrapper takes the upstream subcommand name verbatim. The fact that the internal handler routes to EITHER `search` OR `search:context` based on `context_lines` is an implementation detail that doesn't affect the user-facing tool name (BI-019 `files` precedent — also routes to multiple upstream subcommands internally).

**Alternatives considered**: `search_text`, `find_text`, `vault_search` (wrapper-invented) — rejected per ADR-010. Two separate MCP tools `search` + `search_lines` — rejected per R2 reasoning.

### R16 — Active-mode TOCTOU: inherited project convention, no per-tool retrofit

Per the assistant's memory note "Read tools don't echo locator... project-wide concerns (e.g. active-mode TOCTOU) get ADRs applied uniformly, not per-tool retrofits", this tool inherits whatever project-wide active-mode TOCTOU treatment exists. No per-tool active-mode guard is added.

## Plan-stage live-CLI probe findings

### F1 — Native CLI exposes both `search` and `search:context` with `format=json`

`obsidian help` output (truncated to relevant section):
```
search                Search vault for text
  query=<text>        - Search query (required)
  path=<folder>       - Limit to folder
  limit=<n>           - Max files
  total               - Return match count
  case                - Case sensitive
  format=text|json    - Output format (default: text)

search:context        Search with matching line context
  query=<text>        - Search query (required)
  path=<folder>       - Limit to folder
  limit=<n>           - Max files
  case                - Case sensitive
  format=text|json    - Output format (default: text)
```

**Impact**: drives R1 native-wrapper decision; no `eval` pivot needed.

### F2 — Zero-match path emits NON-JSON sentinel

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=NoSuchToken_zzzzz format=json
(stdout)
No matches found.
(stderr empty, exit 0)
```

CLI emits literal `"\nNo matches found.\n"` on stdout regardless of `format=json` flag. Same on `search:context`.

**Impact**: spec FR-012 ("never an error") locked by wrapper-side sentinel detection (R4).

### F3 — Folder filter (`path=`) is segment-boundary AND case-sensitive natively

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome path=Fixtures format=json
["Fixtures/BI-017/inline-markdown.md"]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome path=fixtures format=json
(stdout)
No matches found.

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome path=Fix format=json
(stdout)
No matches found.

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome path=Fixtures/ format=json
["Fixtures/BI-017/inline-markdown.md"]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome path=NonExistentFolder format=json
(stdout)
No matches found.
```

Confirms:
- Case-sensitive (`Fixtures` ≠ `fixtures`) — aligns with spec Q2 / FR-005.
- Segment-boundary (`Fix` does NOT match `Fixtures/`) — aligns with spec FR-005.
- Trailing slash equivalent (`Fixtures` === `Fixtures/`) — aligns with spec FR-006 (wrapper normalises before passing to be doubly sure).
- Non-existent folder → zero matches sentinel — aligns with spec edge case.

**Impact**: FR-005 / FR-006 fully satisfied by wrapper-side normalisation (FR-006) + CLI native behaviour (FR-005). No wrapper segment-boundary or case-fold logic needed.

### F4 — `limit=` is a FILE COUNT cap, not a match-line count

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome
["Welcome.md","Fixtures/BI-017/inline-markdown.md"]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome limit=1
["Welcome.md"]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search:context query=bi033-token limit=1
[{"file":"Sandbox/bi033-md.md","matches":[{"line":2,"text":"bi033-token here on line 2"},{"line":4,"text":"bi033-token again on line 4"}]}]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome limit=0
["Welcome.md","Fixtures/BI-017/inline-markdown.md"]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome limit=-1
["Welcome.md","Fixtures/BI-017/inline-markdown.md"]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=Welcome limit=10000
["Welcome.md","Fixtures/BI-017/inline-markdown.md"]
```

Confirms:
- `limit` caps file count (both subcommands).
- In line mode, capping at 1 file still returns ALL line matches within that file (not 1 line match).
- `limit=0` and `limit=-1` are silently ignored by CLI (returned as no-limit). Wrapper rejects these via zod first (FR-008).
- `limit=10000` accepted; large values OK at CLI layer.

**Impact**: drives R3 two-stage truncation (CLI `limit = applied_cap + 1` default mode; CLI `limit = applied_cap` line mode + wrapper-side flat-line clip).

### F5 — Case flag inverts default behaviour

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=welcome format=json
["Welcome.md","Fixtures/BI-017/inline-markdown.md"]

$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=welcome case format=json
(stdout)
No matches found.
```

CLI default is CASE-INSENSITIVE. Adding `case` opts into CASE-SENSITIVE matching. Aligns exactly with spec Q5 / FR-009: default insensitive, `case_sensitive=true` toggles into exact-match.

**Impact**: drives R8 — wrapper conditionally adds `case` flag.

### F6 — `.md`-only filetype scope: NATIVELY enforced by upstream

Seeded `Sandbox/bi033-md.md`, `bi033-canvas.canvas`, `bi033-base.base`, `bi033-txt.txt` (all containing `bi033-token`):

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=bi033-token format=json
["Sandbox/bi033-md.md"]
```

Only the `.md` file appears. Canvas/base/txt are all excluded by the upstream CLI itself.

**Impact**: FR-021 is currently satisfied by upstream. Wrapper retains a defensive `.endsWith(".md")` post-filter as future-proofing (R6); the filter is a no-op against the current CLI but a regression-detector against future indexing extension.

### F7 — `search:context` shape: file-grouped with optional empty `matches`

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP search:context query=Welcome format=json
[{"file":"Welcome.md","matches":[]},{"file":"Fixtures/BI-017/inline-markdown.md","matches":[{"line":7,"text":"### [Wikilink](Welcome) text"}]}]
```

The `Welcome.md` entry has `matches: []` — meaning the file matched (filename / metadata) but no body line contained the literal "Welcome" substring. Confirmed via `Welcome.md` body content read separately (no occurrence of "Welcome" in body text).

**Impact**: drives R9 — wrapper flattens to `{path, line, text}` shape and DROPS `matches: []` entries (no synthetic markers). Documented as inherited limitation: "line-mode `count` may be less than default-mode `count` for the same query when filename / metadata matches exist".

### F8 — Vault routing + unknown-vault sentinel: BI-028 parity

```
$ obsidian vault=NoSuchVault search query=Welcome format=json
Vault not found.
(exit 0)
```

Byte-identical to BI-028 F5. The cli-adapter's 011-R5 response-inspection clause fires and classifies as `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)`. Inherited unchanged.

## Inherited limitations (to be documented in tool docs)

1. **Filename / metadata matches inflate default-mode results vs line-mode**: a file matched by filename, heading text, or other non-body source appears in default-mode `paths` but contributes zero rows to line-mode `matches`. Line-mode `count` may therefore be LESS than default-mode `count` for the same query.
2. **Output cap inherited from cli-adapter (10 MiB)**: pathologically large responses produce a structured `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation. Practical safety net for `limit=10000` × giant line text.
3. **Multi-vault basename ambiguity**: same as BI-019 / BI-024 / BI-028. `vault=<name>` resolves a single vault per call; collisions across registered vaults route to the first match.
4. **Unicode case-folding behaviour is upstream-defined**: spec Q5 documents ASCII-only as the v1 guarantee; the underlying CLI's case-fold algorithm for non-ASCII is not exhaustively characterised. Defer-to-upstream; a sibling BI may revisit if real-user demand surfaces.
5. **No relevance ranking**: results are returned in the wrapper's deterministic sort order (path-asc for default mode, path-asc-then-line-asc for line mode). Relevance / score / recency ordering are explicitly out of scope at v1.
6. **`limit` semantics in line mode are conservative**: the `truncated: true` flag may fire even when the underlying line-match set is exactly the applied cap, because the CLI clipped at file cap (R3 trade-off). Caller's recourse: raise `limit` (up to 10000) or narrow `folder`.
7. **No `total: true` count-only mode at v1**: spec uses `truncated: boolean` flag instead. The CLI's native `total` flag (which would return `{"total": <int>}`) is NOT exposed by this wrapper; callers needing pre-flight counts must use the implicit-cap empty path (call without `limit`, check response `count` and `truncated`).
