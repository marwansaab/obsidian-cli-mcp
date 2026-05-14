## Feature Specification: Smart Connections Query — Semantic Search Over Vault Blocks by Text Query

**Feature Branch**: `027-smart-connections-query`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "Smart Connections Query — a typed tool that returns the semantically nearest blocks in a vault to a natural-language text query, using the Smart Connections plugin's `env.smart_sources.lookup({filter, collection:'smart_blocks'})` API. Callers supply a free-text query string (no source note required), optionally scope the call to a named vault, optionally cap the result count, and optionally request a count-only response. The wrapper is the second member of the eval-driven plugin-backed cohort opened by BI-026 (`smart_connections_similar`). Plan-phase deliverables: extract a cross-cutting `_eval-vault-closed-detection` shared module (consumed by both BI-026 and BI-027); retroactively patch BI-026 to (a) consume the shared detector and (b) emit `details.reason: \"api-missing\"` on its existing `SMART_CONNECTIONS_NOT_READY`; roll the canonical `.architecture/Obsidian CLI MCP - Architecture.md` forward (no new snapshot file)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Semantic search over the vault from a natural-language query (Priority: P1)

An agent (or a human caller through an MCP-aware client) needs to find the semantically nearest content in a vault to a text query — for example "what notes discuss embedding model fine-tuning?", "show me everything related to incident retros from Q3", or "find the section where we documented the deployment rollback procedure". The caller supplies a free-text query string, optionally scopes the call to a named vault, optionally caps the result count, and receives a structured ordered list of nearest-neighbour BLOCKS, each entry carrying the matched block's source file path, the heading-path locating the block inside that file, and a similarity score.

**Why this priority**: This is the dominant use case and the entry point that justifies the feature's existence. Today an agent that wants to find content in a vault matching a natural-language intent has no semantic discovery path through the typed-tool surface — it must either keyword-search via `obsidian_exec` (which misses semantic relationships text search cannot see — e.g. "rollback procedure" missing notes titled "reverting a bad deploy"), or know a specific source note to start from and use `smart_connections_similar` (which requires the caller to already have a related note in hand — circular when the goal is discovery). A single typed call turns "what content in the vault is semantically related to this question?" into a deterministic answer that mirrors what the user gets from the Smart Connections plugin's search experience. Without this story the feature offers no value; every other story refines this primary read path.

**Independent Test**: With the Smart Connections plugin installed and initial indexing completed against a test vault containing a known set of topically-clustered notes (e.g. five notes about "machine learning", three notes about "cooking", two notes about "travel"), invoke the tool with `{ query: "neural network training techniques", vault: "TestVault" }`. Assert the response carries `count` matching the number of returned matches, each match shaped as `{path, headingPath, score}` referencing a block inside a vault-existing note, the highest-scoring matches map to blocks inside the machine-learning notes, scores are monotonically non-increasing across the list, and the path-string format matches the vault-relative-with-`.md`-extension convention shared with the existing `files` typed tool. Independently testable in isolation; nothing in P2/P3 is required.

**Acceptance Scenarios**:

1. **Given** a vault with the Smart Connections plugin installed and initial indexing completed, AND a corpus where several blocks across multiple notes discuss "gradient descent variants", **When** the agent invokes the tool with `{ query: "gradient descent optimization variants", vault: "Demo" }`, **Then** the response carries the top-K matches (K being the default `limit` of 20, or fewer if the plugin returns fewer above its internal threshold) with each entry shaped as `{path, headingPath, score}`: `path` is the vault-relative path of the source note (everything before the first `#` in the plugin's block key, e.g. `"Topics/Neural-Networks.md"`); `headingPath` is an ordered array of heading segments after the first `#` (e.g. `["Neural Networks", "Backpropagation"]` for a block under H1 "Neural Networks" → H2 "Backpropagation"; `[]` if the plugin emits a source-level match for that file; literal `["---frontmatter---"]` for a frontmatter-block match — the wrapper does NOT normalise the plugin's sentinel); `score` is a finite numeric similarity value; AND `matches[0].score >= matches[1].score >= matches[2].score` (descending order; secondary tiebreaker `path` byte-compare ascending; tertiary tiebreaker `headingPath.join("#")` byte-compare ascending per FR-008).
2. **Given** the same vault and corpus AND a `limit: 5` parameter, **When** the agent invokes the tool with `{ query: "deployment rollback", limit: 5 }`, **Then** the response carries at most five matches in the `matches` array (the top five by plugin similarity score).
3. **Given** a query whose embedding has no matches above the plugin's internal threshold (an out-of-domain question against a topically narrow vault — e.g. asking about "Renaissance painting techniques" in a software-engineering vault), **When** the agent invokes the tool, **Then** the response is a structured success with `count: 0` and `matches: []` — NOT a structured error. A "no matches" outcome is the natural empty-result contract, not a failure.
4. **Given** a vault display name the host does not recognise (e.g. `vault: "Unknown"`), **When** the agent invokes the tool, **Then** the response is a structured error with `details.code = "VAULT_NOT_FOUND"` (and `details.reason` absent or `"unknown"`) via the cli-adapter's 011-R5 inspection clause — the call MUST NOT silently return an empty success and MUST NOT silently route to the focused vault.
5. **Given** a vault display name the host DOES recognise in `obsidian vaults` output (`vault: "Other"`) BUT the corresponding vault window is NOT currently open in Obsidian, **When** the agent invokes the tool, **Then** the response is a structured error with `details.code = "VAULT_NOT_FOUND"` AND `details.reason = "not-open"`. The wrapper detects the closed-vault case via the same empty-stdout + exit-0 + `vault=` + known-vault signature locked by BI-026's live probe on 2026-05-15. The detection is performed by the cross-cutting `_eval-vault-closed-detection` shared module extracted as part of this BI (consumed by both BI-026 and BI-027).
6. **Given** a vault the caller does NOT specify (`vault` parameter omitted), **When** the agent invokes the tool, **Then** the call routes to whichever vault is currently focused in the host's Obsidian window — matching the established optional-vault precedent shared with `files` (BI-019), `properties` (BI-024), and `find_by_property` (BI-014). The wrapper does NOT pre-resolve the focused vault; it relies on the upstream `obsidian eval` invocation's defer-to-focused-vault behaviour.

---

### User Story 2 — Validation rejects malformed inputs at the boundary (Priority: P1)

An agent (or a misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field.

**Why this priority**: Validation is the safety contract for every typed tool in this project, and zod-as-source-of-truth is a constitutional requirement. Without it, malformed callers reach the CLI and produce undefined or harmful behaviour. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called.

**Independent Test**: For each invalid input shape, call the tool with a CLI dispatcher spy. Assert the call rejects with a structured `VALIDATION_ERROR` AND that the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** the `query` field omitted entirely (e.g. `{ vault: "Demo" }`), **When** the agent invokes the tool, **Then** the call fails validation; no CLI call is made.
2. **Given** `query` set to an empty string `""`, **When** the agent invokes the tool, **Then** the call fails validation (the schema requires `.trim().min(1)` — at least one non-whitespace character after trim); no CLI call is made.
3. **Given** `query` set to whitespace-only (e.g. `"   \t\n  "`), **When** the agent invokes the tool, **Then** the call fails validation (trim reduces it to empty); no CLI call is made.
4. **Given** `query` set to a string longer than the wrapper's character cap (4000 characters by FR-024), **When** the agent invokes the tool, **Then** the call fails validation with a clear message identifying the field and the cap; no CLI call is made.
5. **Given** `query` set to a non-string value (e.g. a number, an array, an object), **When** the agent invokes the tool, **Then** the call fails validation; no CLI call is made.
6. **Given** `limit` set to a value outside the `1..100` range (e.g. `0`, `-5`, `101`, `1000`) OR to a non-integer (e.g. `5.5`, `"20"`), **When** the agent invokes the tool, **Then** the call fails validation; no CLI call is made.
7. **Given** `total` set to a non-boolean value (e.g. the string `"true"`), **When** the agent invokes the tool, **Then** the call fails validation; no CLI call is made.
8. **Given** `vault` set to an empty string `""`, **When** the agent invokes the tool, **Then** the call fails validation (the schema requires `.min(1)` when supplied); no CLI call is made.
9. **Given** any input with an unknown top-level key (e.g. `{ query: "x", threshold: 0.7 }` — `threshold` is not part of this tool's surface), **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.
10. **Given** `query` containing path-traversal characters, shell metacharacters, or control characters, **When** the agent invokes the tool, **Then** the wrapper's base64-encoded JSON payload + frozen JS template ensures the query text never reaches the JS source as source code; the query is treated as a literal embedding input regardless of its byte content (anti-injection per FR-019 / SC-019).

---

### User Story 3 — Count-only mode skips the per-match payload (Priority: P2)

An agent only needs to know how many semantic matches the plugin returns for a query — for a structural audit ("how many vault blocks discuss this topic?"), a heuristic ("does this query produce enough signal to be worth a full listing?"), or a pre-flight check before deciding whether a default-mode call is worthwhile. The caller invokes the tool with `total: true`. The response carries the `count` only — the per-match list is empty. The tool MUST NOT pay the per-match payload cost when the caller asks only for a count.

**Why this priority**: Count-only mode matches the established `total: true` precedent shared by every other enumerating typed tool in the project (`files`, `outline`, `properties`, `links`, `smart_connections_similar`). It is an optimisation, not a requirement of the core read path; agents that always set `total: false` lose no functionality. Independently testable from US1 with a separate single-line input variation.

**Independent Test**: Author a fixture vault where one query is known to return exactly seven matches above the plugin's threshold and another query is known to return zero matches. Call the tool with `total: true` against each. Assert the first response carries `count: 7` and an empty `matches` list; assert the second response carries `count: 0` and an empty `matches` list. Both succeed.

**Acceptance Scenarios**:

1. **Given** a query whose default-mode result list contains exactly seven matches at the default `limit`, **When** the agent invokes the tool with `{ query: "...", vault: "Demo", total: true }`, **Then** the response carries `count: 7` and `matches: []` (empty list).
2. **Given** the same query AND a `limit: 3` parameter AND `total: true`, **When** the agent invokes the tool, **Then** the response carries `count: 3` and `matches: []` — the `limit` parameter caps the count even in count-only mode (the count reflects what the agent would see in default mode at the same `limit`, NOT the unbounded plugin-returned result count).
3. **Given** count-only mode AND an unrecognised vault, **When** the agent invokes the tool with `{ query: "...", vault: "Unknown", total: true }`, **Then** the response is the same structured `VAULT_NOT_FOUND` error as in default mode (US1 scenario 4) — count-only mode does NOT suppress error paths; it only suppresses the per-match payload on success.
4. **Given** count-only mode AND the plugin not installed in the focused vault, **When** the agent invokes the tool with `{ query: "...", total: true }`, **Then** the response is the same structured `SMART_CONNECTIONS_NOT_INSTALLED` error as in default mode — count-only mode never silently masks plugin-lifecycle errors.

---

### User Story 4 — Plugin-lifecycle failures surface as structured errors (Priority: P1)

An agent (or the user's environment) calls the tool against a vault where the Smart Connections plugin is not installed, OR is installed but its `env.smart_sources.lookup` API path is not callable, OR throws when invoked (e.g. embedding model not loaded, OpenAI API key missing, network failure for cloud embed models, rate-limited). The tool MUST surface each lifecycle state as a distinct, agent-actionable structured error rather than failing generically.

**Why this priority**: Plugin-lifecycle observability is the contract that lets agents distinguish "config fix needed" from "transient error retry" from "user intervention required". Without it, agents cannot route remediation correctly — every plugin-related failure becomes an opaque "something is wrong" message that requires the user to debug. ADR-014 (plugin-backed typed tools runtime-dependency pattern) codifies the three-state lifecycle for the cohort; this BI is the second consumer.

**Independent Test**: Disable the Smart Connections plugin in a test vault and call the tool — assert `SMART_CONNECTIONS_NOT_INSTALLED`. Re-enable the plugin but configure it with an invalid embedding model setting (or remove the OpenAI API key from settings) and call the tool — assert `SMART_CONNECTIONS_NOT_READY` with `details.reason = "embed-failed"`. Patch the plugin's `env.smart_sources` to be undefined (defensively) and call the tool — assert `SMART_CONNECTIONS_NOT_READY` with `details.reason = "api-missing"`.

**Acceptance Scenarios**:

1. **Given** a vault where the Smart Connections plugin is NOT installed (or installed but disabled), **When** the agent invokes the tool, **Then** the response is a structured error with `details.code = "SMART_CONNECTIONS_NOT_INSTALLED"` — distinct from generic CLI failure; the agent's remediation is "install or enable the plugin".
2. **Given** a vault where the Smart Connections plugin IS installed and enabled BUT its `env.smart_sources` object is unavailable OR `env.smart_sources.lookup` is not a function (e.g. plugin in mid-load, plugin API path renamed across versions per the soft-pin minimum-version assumption), **When** the agent invokes the tool, **Then** the response is a structured error with `details.code = "SMART_CONNECTIONS_NOT_READY"` AND `details.reason = "api-missing"`.
3. **Given** a vault where the plugin and its API path ARE present BUT the call throws (embedding model not loaded, invalid OpenAI API key, cloud-embed network failure, rate-limited), **When** the agent invokes the tool, **Then** the response is a structured error with `details.code = "SMART_CONNECTIONS_NOT_READY"` AND `details.reason = "embed-failed"` — distinct from `api-missing` so the agent's remediation path differs ("check config / network / keys" vs "update plugin / wait for load"). The agent's `details.message` field should contain the upstream error string for diagnostic surface.
4. **Given** simultaneous failures (unknown vault AND plugin not installed AND embed-failed), **When** the agent invokes the tool, **Then** the response surfaces the outermost / cheapest discriminator per FR-017's precedence chain: `VAULT_NOT_FOUND(unknown)` → `VAULT_NOT_FOUND(not-open)` → `SMART_CONNECTIONS_NOT_INSTALLED` → `SMART_CONNECTIONS_NOT_READY(api-missing)` → `SMART_CONNECTIONS_NOT_READY(embed-failed)` → success.

---

### User Story 5 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how the semantic-query tool works, what the plugin prerequisites are, how to interpret the `score` field, and what the inherited limitations are. The published documentation MUST cover the per-field input contract, the output shape (both with and without count-only mode), the failure-mode roster (including the plugin lifecycle codes with their sub-discriminators), the inherited limitations (embedding-model-dependent score bands, indexing freshness, folder exclusions, plugin-version drift, local-model silent-truncation past their context window), the error-precedence chain, and at least four worked examples covering at least: a default-mode happy path, an explicit-vault happy path, a count-only-mode call, and at least one failure path (plugin-not-installed OR plugin-not-ready OR vault-not-open).

**Why this priority**: Inherited from the project's progressive-disclosure pattern (BI-005 help tool). Agents and operators need self-serve documentation; otherwise the tool becomes a "you have to know to ask" surface. Independently testable — a docs file exists at a registered path and contains specified content.

**Independent Test**: Read `docs/tools/smart_connections_query.md`. Assert it contains: (a) a one-line summary, (b) a per-field input table (`query`, `vault?`, `limit?`, `total?`), (c) an output table (`count`, `matches[*].path`, `matches[*].headingPath`, `matches[*].score`), (d) a failure-mode table covering at least the five entries in FR-013's roster (`VALIDATION_ERROR`, `VAULT_NOT_FOUND × 2 reasons`, `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY × 2 reasons`), (e) at least four worked examples, (f) the precedence chain from FR-017, and (g) the inherited-limitations list. Assert the help tool's registry-consistency test (BI-005 inheritance) does NOT fire — the new tool's registration is matched by a tool-docs file at the expected path.

**Acceptance Scenarios**:

1. **Given** the tool is registered AND the registry-consistency test runs, **When** the test asserts every registered tool has a matching `docs/tools/<name>.md` file, **Then** the assertion passes for `smart_connections_query`.
2. **Given** the docs file at `docs/tools/smart_connections_query.md`, **When** an operator reads the failure-mode section, **Then** they find the precedence chain documented verbatim and each code paired with its remediation guidance.

---

### Edge Cases

**LOCATOR — vault routing**:
- Caller omits `vault` AND no vault is currently focused in Obsidian (Obsidian itself not running, or running with no open vault): upstream `obsidian eval` failure surfaces via the cli-adapter's existing dispatch layer. The wrapper does NOT add a special pre-check.
- Caller supplies `vault` that exists in the host's vault registry BUT is not currently open: the cross-cutting `_eval-vault-closed-detection` shared module detects via the empty-stdout + exit-0 + known-vault signature and emits `VAULT_NOT_FOUND` with `details.reason = "not-open"` (the CLI transparently begins opening the vault as a side effect; retry after a brief delay).
- Caller supplies `vault` that does NOT exist in the host's vault registry: the cli-adapter's 011-R5 inspection clause re-classifies the "Vault not found." stdout to `CLI_REPORTED_ERROR` with `details.code = "VAULT_NOT_FOUND"` (and `details.reason` absent or `"unknown"`).

**QUERY — content edge cases**:
- Query containing only stop-words ("the and of"): the plugin embeds it normally; embedding-model behaviour determines the result. The wrapper neither pre-validates nor filters; results may be low-quality but the call succeeds with whatever the plugin returns. Inherited limitation #6 (embedding-model behaviour for low-information queries).
- Query exceeding the configured embedding model's context window (e.g. 4000 chars sent to a local model with 512-token capacity): the plugin's embed pipeline silently truncates the query to fit its context window. Wrapper-side cap (4000 chars) catches the obvious agent footgun (whole-document-pasted-as-query) but does NOT prevent silent truncation on small-context models. Documented inherited limitation.
- Query with Unicode (CJK characters, emojis, RTL scripts): the wrapper's base64-encoded JSON payload preserves the byte-exact query text; the embedding model handles Unicode per its training (typically well for common scripts, variably for less common ones). No wrapper-side normalisation.

**CONTENT — match shape edge cases**:
- A match whose `score` is non-finite (`NaN`, `Infinity`, `-Infinity`, `null`, `undefined`, missing field): the in-eval post-fetch pipeline applies a `Number.isFinite(score)` filter and silently drops the entry. Parity with BI-026 FR-009a.
- A match whose key has no `#` fragment (a source-level match, if the plugin ever emits one under `collection: 'smart_blocks'` — F7 from FR-026 will characterise): `path` is the full key; `headingPath` is `[]`.
- A match whose key's heading-segment is the plugin's frontmatter sentinel `---frontmatter---`: `headingPath` is `["---frontmatter---"]` — the wrapper does NOT normalise the sentinel.
- A match whose key is the same source path as another match but with a different heading-path: both appear as separate entries in the result list. Sort order's three-level tiebreak (score / path / headingPath) puts them adjacent in the response.
- ALL returned matches have non-finite scores after the `Number.isFinite` filter: the response is `{count: 0, matches: []}` — a zero-result success. NOT a structured error. (Same contract as zero-results-from-the-plugin.)

**PLUGIN LIFECYCLE — sub-state edge cases**:
- Plugin loaded but `env.smart_sources` is `null` or `undefined`: in-eval probe emits `SMART_CONNECTIONS_NOT_READY` with `details.reason = "api-missing"`.
- Plugin loaded AND `env.smart_sources` present BUT `lookup` is not a function: in-eval probe emits `SMART_CONNECTIONS_NOT_READY` with `details.reason = "api-missing"`.
- `lookup` is a function BUT calling it throws synchronously OR returns a rejected promise: in-eval `try/catch` (or `.catch()` chain on the awaited promise) catches the throw and emits `SMART_CONNECTIONS_NOT_READY` with `details.reason = "embed-failed"`. The upstream error message is carried verbatim in the envelope `detail` field.
- Plugin's first-install state where settings panel has never been opened (initial embed model not configured): behaviour to be characterised at plan stage (F13). Recommended emission: `SMART_CONNECTIONS_NOT_READY` with whichever reason the actual probe surfaces.

**INDEXING — freshness edge cases**:
- A note created between the moment of plugin's last indexing pass and the moment of the query: the note's blocks do NOT appear in the result. Inherited limitation #2.
- A note in a folder the plugin's settings exclude: the note's blocks do NOT appear in the result. Inherited limitation #3.

**CAPACITY — output cap edge case**:
- The underlying execution layer's 10 MiB output cap (inherited from 003) fires for a pathologically large match list: essentially impossible at the locked `limit: 1..100` ceiling (100 matches × ~80 bytes each ≈ 8 KiB, four orders of magnitude below the cap) but contractually preserved — produces a structured `CLI_NON_ZERO_EXIT` (output-cap kill), never a silent truncation.

## Requirements *(mandatory)*

### Functional Requirements

**INPUT CONTRACT**

- **FR-001**: The tool MUST accept an input object with the following top-level fields: a required `query` (string), an optional `vault` (string), an optional `limit` (integer), and an optional `total` (boolean). No `target_mode` discriminator — this is a fileless, vault-optional surface following the BI-014 / BI-019 / BI-024 precedent (ADR-003 governs per-file typed tools and does NOT apply).
- **FR-002**: The `query` field MUST be a string that, after trimming leading and trailing whitespace, contains at least one character and at most 4000 characters. Schema-level validation rejects empty, whitespace-only, and over-cap queries before any CLI invocation.
- **FR-003**: The `vault` field MUST be either omitted OR a non-empty string. When omitted, the call routes to whichever vault is currently focused in the host's Obsidian window (defer to upstream `obsidian eval` behaviour, parity with `files` / `properties` / `find_by_property`).
- **FR-004**: The `limit` field MUST be an integer between 1 and 100 inclusive, defaulting to 20 when omitted. Schema-level validation rejects non-integer, out-of-range, and non-numeric inputs.
- **FR-005**: The `total` field MUST be either omitted OR a boolean. When `true`, the response carries `count` only and `matches: []` (per FR-007); when omitted or `false`, the response carries the full per-match list.
- **FR-005a**: The input schema MUST reject unknown top-level keys (strict schema, parity with every other typed tool).

**OUTPUT CONTRACT**

- **FR-006**: The tool MUST return an output object with two fields: `count` (a non-negative integer — the number of matches the tool determined under the current `limit`, post-finite-score-filter) and `matches` (an ordered list of per-match entries). The list is empty when `total: true`; it is populated up to `limit` entries when `total: false`. The outer `count` ALWAYS represents the number of matches returned at the locked `limit`, NOT the unbounded plugin-returned result count.
- **FR-006a**: The cross-mode `count` invariant: for the same `query` / `vault` / `limit` triple, the `count` field's value is identical whether `total: true` or `total: false`. The only difference between the two modes is the population of the `matches` array. The wrapper enforces this invariant by computing the full match array in both modes and branching at envelope-emission on the `total` flag.
- **FR-007**: Each per-match entry MUST carry EXACTLY three fields: `path` (the matched block's source file path — the substring of the plugin's block key before the first `#`), `headingPath` (an ordered array of heading segments after the first `#`; empty `[]` for source-level matches if any appear; literal `["---frontmatter---"]` for frontmatter-block matches with the plugin's sentinel preserved verbatim), and `score` (a finite JavaScript number reflecting the plugin's similarity calculation). No additional fields surfaced. Parity with BI-026 FR-007.
- **FR-008**: The `matches` list MUST be sorted in three-level order: primary `score` descending; secondary `path` byte-compare ascending; tertiary `headingPath.join("#")` byte-compare ascending. Sort is applied INSIDE the eval JS template BEFORE the limit slice and BEFORE envelope emission, so it applies identically in both default and count-only modes.
- **FR-009**: Matches whose `score` is non-finite (`NaN`, `Infinity`, `-Infinity`, `null`, `undefined`, missing field) MUST be silently dropped via a `Number.isFinite(score)` filter in the in-eval post-fetch pipeline. The drop applies BEFORE the wrapper computes `count` and emits the envelope, so the outer `count` reflects the post-filter length consistently across both default and count-only modes.

**EXECUTION CONTRACT**

- **FR-010**: The tool MUST route through the `eval` subcommand of the Obsidian CLI bridge — the same eval-driven cohort entry-point shared with BI-014 / BI-015 / BI-025 / BI-026. The tool MUST NOT spawn separate native subcommands for the query; a single `eval` invocation per call (plus the optional second `vaults` invocation for closed-vault detection only on the empty-stdout signature) is the contracted shape.
- **FR-011**: The JS template executed inside `eval` MUST reach the Smart Connections plugin's lookup API via the path `app.plugins.plugins["smart-connections"].env.smart_sources.lookup(...)`. The template MUST call lookup as `lookup({ filter: { hypotheticals: [query], limit }, collection: "smart_blocks" })` per the World-A live-probe-verified shape (FR-026 / F1–F4). Plan-stage live probe MUST confirm the field name `hypotheticals` and the `filter.limit` placement before this FR is locked.
- **FR-012**: The wrapper MUST treat the user's `query` text as inert data, NOT executable code. The mechanism MUST be: serialise the entire payload (query, vault flag, limit, total flag) to JSON, base64-encode the JSON, substitute the base64 string into a frozen JS template at a single `__PAYLOAD_B64__` slot, and decode + JSON.parse the payload inside the JS at runtime. No part of the user input ever reaches the JS source as text. Parity with BI-026 FR-019.

**FAILURE-MODE ROSTER**

- **FR-013**: The tool's failure-mode roster MUST consist of EXACTLY the following structured errors (zero new top-level codes; zero new `details.code` strings — all already exist in the BI-026 roster):
  1. `VALIDATION_ERROR` — input shape violation; surfaced at the zod boundary before any CLI call.
  2. `CLI_REPORTED_ERROR` with `details.code = "VAULT_NOT_FOUND"` and `details.reason = "unknown"` (or absent) — the named vault is not in the host's vault registry; surfaced by the cli-adapter's 011-R5 inspection clause.
  3. `CLI_REPORTED_ERROR` with `details.code = "VAULT_NOT_FOUND"` and `details.reason = "not-open"` — the named vault IS in the host's vault registry BUT is not currently open; surfaced by the cross-cutting `_eval-vault-closed-detection` shared module.
  4. `CLI_REPORTED_ERROR` with `details.code = "SMART_CONNECTIONS_NOT_INSTALLED"` — the plugin is not present in the target vault; surfaced by the in-eval lifecycle probe.
  5. `CLI_REPORTED_ERROR` with `details.code = "SMART_CONNECTIONS_NOT_READY"` and `details.reason = "api-missing"` — the plugin is present BUT `env.smart_sources.lookup` is not a callable function (plugin in mid-load, plugin API path missing or renamed); surfaced by the in-eval API-shape probe.
  6. `CLI_REPORTED_ERROR` with `details.code = "SMART_CONNECTIONS_NOT_READY"` and `details.reason = "embed-failed"` — the plugin's lookup API IS callable BUT throws or rejects when invoked (embedding model not loaded, invalid OpenAI API key, network failure for cloud embed models, rate-limited); surfaced by the in-eval try/catch around the lookup call. The upstream error message is carried verbatim in the envelope's `detail` field.
  - PLUS the standard adapter-layer errors that any typed tool inherits: `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_TIMEOUT`. The roster above lists ONLY the tool-specific failure-mode surface.
- **FR-013a**: The new emission `SMART_CONNECTIONS_NOT_READY` with `details.reason = "embed-failed"` is introduced by this BI and applies the ADR-015 sub-discriminator pattern to the existing `SMART_CONNECTIONS_NOT_READY` code. As a cohort-consistency ripple, BI-026's handler (`smart_connections_similar`) MUST be retroactively patched in this same BI to emit `details.reason = "api-missing"` on its existing emission, so the `details.reason` field is exhaustive across the plugin cohort.
- **FR-014**: Zero-result successes (the plugin's lookup returns an empty array, OR every returned match has a non-finite score and is filtered out) MUST surface as `{ count: 0, matches: [] }` — a structured success, NOT a structured error. The empty-result contract is shared with BI-026.

**PRECEDENCE CHAIN**

- **FR-017**: When multiple error conditions fail simultaneously for a single call, the discriminator surfaces in this outer-to-inner / cheapest-first order:
  1. `VALIDATION_ERROR` (zod boundary, before any CLI call)
  2. `VAULT_NOT_FOUND` with `details.reason = "unknown"` (cli-adapter 011-R5 inspection, before eval runs)
  3. `VAULT_NOT_FOUND` with `details.reason = "not-open"` (shared closed-vault detector, on empty-stdout signature)
  4. `SMART_CONNECTIONS_NOT_INSTALLED` (in-eval plugin presence check)
  5. `SMART_CONNECTIONS_NOT_READY` with `details.reason = "api-missing"` (in-eval API-shape check)
  6. `SMART_CONNECTIONS_NOT_READY` with `details.reason = "embed-failed"` (in-eval lookup-call try/catch)
  7. Success
  - Plan-stage live probe MUST exercise at least one compound-failure case per adjacent pair in the chain to verify the earlier-priority discriminator fires.

**ANTI-INJECTION**

- **FR-019**: The wrapper MUST guarantee that no part of the user-supplied `query`, `vault`, or any other input reaches the JS source code that runs inside `eval` as text. The mechanism is the base64-encoded JSON payload pattern from FR-012. Verifiable structurally: the JS template contains exactly one substitution slot (`__PAYLOAD_B64__`) and the substituted value is base64-encoded JSON, not raw input.

**SHARED ABSTRACTION**

- **FR-020**: This BI MUST extract the closed-but-registered-vault detection logic (currently inline in BI-026's handler) into a cross-cutting shared module at `src/tools/_eval-vault-closed-detection/{detector, registry-parser}.ts`. The new module is CONSUMED by both BI-026 (`smart_connections_similar`) — refactored in this same BI as a behaviour-preserving change — AND by BI-027 (`smart_connections_query`). The module is NOT named `_smart-connections-shared` because the detection logic is plugin-agnostic; any future eval-driven typed tool that takes a vault parameter MAY consume it.
- **FR-020a**: The refactor of BI-026's handler to consume the shared module MUST be behaviour-preserving. The `_register-baseline.json` fingerprint for `smart_connections_similar` MUST remain unchanged across the refactor (the baseline locks the inputSchema + description; the refactor changes implementation only). All existing BI-026 handler tests MUST pass without modification (other than test fixtures that were directly verifying the inline `isVaultRegistered` helper — those move to the shared module's co-located tests).

**DOCUMENTATION & DISCLOSURE**

- **FR-021**: A new tool-docs file at `docs/tools/smart_connections_query.md` MUST be created, populated with: a one-line summary, a per-field input table, an output table, the failure-mode table (FR-013 roster), the error-precedence chain (FR-017), at least four worked examples, AND the documented inherited limitations list (see FR-022).
- **FR-022**: The docs file MUST document the following inherited limitations:
  1. Embedding-model-dependent score bands — the absolute score values are meaningful only relative to other scores from the same model; cross-model comparison is not supported.
  2. Indexing freshness — notes created or modified between the plugin's last indexing pass and the query do not appear in matches.
  3. Folder exclusions — notes in folders excluded by the plugin's settings are silently absent from matches.
  4. Plugin-version drift — the wrapper docs name a minimum probed plugin version (locked at plan stage per FR-024); older versions surfacing as `SMART_CONNECTIONS_NOT_READY` with `details.reason = "api-missing"`.
  5. Local-model silent truncation — queries longer than the configured embed model's context window (typically 256–512 tokens ≈ 1K–2K chars for local models) are silently truncated by the plugin before embedding; the wrapper's 4000-char cap catches obvious agent footguns but does NOT prevent this. Cross-reference the FR-002 cap.
  6. Low-information queries — queries containing only stop-words or generic phrasing produce embeddings near the corpus mean and return low-quality matches; this is a property of embedding models, not a wrapper-side bug.
- **FR-023**: The registry-consistency test (BI-005 inheritance) MUST pass for `smart_connections_query` — the help tool surfaces the tool's existence AND the tool-docs file exists at the registered path.

**ARCHITECTURE & DECISION PROTOCOL**

- **FR-024**: Plan-stage live probe MUST verify the upstream signature, behaviour, and edge cases enumerated in FR-026 (the F-finding list) before the implementation phase begins. Where live-probe findings contradict a spec-stage assumption, the spec MUST be amended (parity with BI-026's two live-probe-driven amendments to Q3 / grilling-Q3).
- **FR-025**: The canonical architecture document `.architecture/Obsidian CLI MCP - Architecture.md` MUST be rolled forward in this BI's plan commit to: (a) list `smart_connections_query` as the second member of the plugin-backed typed-content tools cohort, (b) reference the new `src/tools/_eval-vault-closed-detection/` cross-cutting shared module, and (c) note the FR-013a ripple to BI-026 (cohort-consistency `details.reason` addition). NO new architecture-snapshot file is created — BI-026's snapshot `Obsidian CLI MCP - Architecture with Smart Connections.md` is the first-of-kind frozen artefact; subsequent plugin BIs roll the canonical forward without creating new snapshots.
- **FR-026**: The plan-stage F-finding list MUST cover at minimum:
  - F1: existence of `env.smart_sources.lookup` as a callable function on the live installed plugin version
  - F2: exact lookup signature (`lookup({filter, collection})` vs alternatives)
  - F3: whether `filter.hypotheticals` is the correct field name and whether the plugin embeds text internally (confirms World-A vs World-B; FR-011 lock)
  - F4: `filter.limit` placement (inside filter vs top-level lookup arg)
  - F5: return shape (`Array<{item, score}>` vs `Array<{key, score}>` vs other)
  - F6: block-key extraction shape (same `path#h1#h2` format as `find_connections` per BI-026 F-finding)
  - F7: whether `collection: "smart_blocks"` ever emits source-level keys mixed with block-level
  - F8: empty/whitespace query behaviour (confirms `.trim().min(1)` schema defence is sufficient)
  - F9: very long query behaviour (4000-char cap; confirms inherited-limitation docs)
  - F10: closed-but-registered vault behaviour parity with BI-026 (same empty-stdout + transparent-open signature on `lookup`-based call)
  - F11: zero-results behaviour (empty array vs sentinel)
  - F12: embed-failure observability (synchronous throw vs rejected promise vs returned [])
  - F13: first-install / settings-never-opened state — does `env.smart_sources.lookup` exist? Sub-state characterisation for the NOT_READY reason discriminator.
  - F14: multi-vault routing — does `vault=<name> eval` route `lookup` to the correct vault's `env` instance (parity check with BI-026 F-finding)
  - F15: closed-vault detection mechanism — empty-stdout vs error string vs other signature for the lookup-based call
- **FR-027**: This BI MUST NOT introduce new ADRs, new top-level error codes, or new `details.code` strings. ADRs 013 / 014 / 015 (introduced in BI-026) cover this BI's design pattern unchanged; BI-027 is the second consumer of all three.
- **FR-028**: Version bump 0.5.3 → 0.5.4 (PATCH, additive surface). Constitution version unchanged at v1.5.0 — no new ADR row added.

### Key Entities

- **Smart Connections plugin lookup API**: The plugin object reached via `app.plugins.plugins["smart-connections"]`. Its `env.smart_sources.lookup({filter, collection})` method takes a filter object containing `hypotheticals: string[]` (text strings the plugin embeds internally via the user's configured embed model) and `limit: number` (max results), plus a `collection` argument set to `"smart_blocks"` to query block-level matches. Returns an ordered array of match entries (shape characterised at plan stage per F5–F7).
- **Block key**: The plugin's per-match identifier — a string in the format `<source_file_path>` (no `#`) for source-level matches OR `<source_file_path>#<heading_segment>#<heading_segment>...` for block-level matches. The wrapper splits on the first `#` to derive `path` and `headingPath`.
- **Plugin lifecycle state**: A four-state enumeration the wrapper distinguishes via in-eval probes:
  1. `NOT_INSTALLED` — plugin not present in vault
  2. `NOT_READY(api-missing)` — plugin loaded but lookup API path is unavailable
  3. `NOT_READY(embed-failed)` — plugin loaded and lookup API callable but call throws (embedding model / config / network failure)
  4. `READY` — plugin loaded and lookup API callable and returns successfully
  - The `READY` state does NOT imply every individual block has an embedding entry — it implies the lookup pipeline returns a structured array (possibly empty, possibly populated).
- **Similarity match**: A per-result entry of shape `{path: string, headingPath: string[], score: number}`. `score` is finite (post-filter). `headingPath` may be empty `[]`, contain the literal `["---frontmatter---"]` sentinel, or contain multiple heading segments.
- **Cross-cutting closed-vault detector**: The shared module extracted at `src/tools/_eval-vault-closed-detection/`, comprising the stage-0 detection branch (empty-stdout + exit-0 + named-vault signature → confirm via second `vaults verbose` call → emit structured error) plus the BOM-aware vault-registry stdout parser. Consumed by both `smart_connections_similar` (refactored in this BI) and `smart_connections_query` (new in this BI).

## Success Criteria *(mandatory)*

### Measurable Outcomes

**FEATURE OUTCOMES**

- **SC-001**: An agent's "find content in this vault matching a natural-language question" workflow is satisfied by a single typed call in 100% of cases where the plugin is installed and ready and the query produces ≥1 match above the plugin's threshold. No follow-up call to `obsidian_exec` or `read` is required for the discovery step.
- **SC-002**: The default-mode response carries exactly the per-match shape `{path, headingPath, score}` in 100% of test runs — no additional fields, no missing fields.
- **SC-003**: The count-only mode response carries exactly `{count, matches: []}` with an empty matches array in 100% of test runs (where the request specifies `total: true`).
- **SC-004**: The cross-mode `count` invariant (FR-006a) holds in 100% of test runs — for the same `query` / `vault` / `limit` triple, `total: true` and `total: false` produce identical `count` values.

**FAILURE-MODE OUTCOMES**

- **SC-005**: A malformed input (FR-001..FR-005a violation) surfaces as `VALIDATION_ERROR` AND the CLI dispatcher is NOT invoked in 100% of test runs.
- **SC-006**: A call against an unknown vault surfaces as `VAULT_NOT_FOUND` with `details.reason` absent or `"unknown"` via the cli-adapter's 011-R5 inspection clause in 100% of test runs.
- **SC-007**: A call against a registered-but-closed vault surfaces as `VAULT_NOT_FOUND` with `details.reason = "not-open"` via the cross-cutting `_eval-vault-closed-detection` shared module in 100% of test runs (manual T0 case during /speckit-implement).
- **SC-008**: A call against a vault where the plugin is not installed surfaces as `SMART_CONNECTIONS_NOT_INSTALLED` in 100% of test runs.
- **SC-009**: A call against a vault where the plugin is loaded but `env.smart_sources.lookup` is not a function surfaces as `SMART_CONNECTIONS_NOT_READY` with `details.reason = "api-missing"` in 100% of test runs.
- **SC-010**: A call against a vault where the plugin's lookup API throws or rejects (embed model failure, invalid API key, network failure) surfaces as `SMART_CONNECTIONS_NOT_READY` with `details.reason = "embed-failed"` in 100% of test runs.
- **SC-011**: The error-precedence chain (FR-017) is exercised by at least one regression test per adjacent pair, confirming the earlier-priority discriminator fires when multiple error conditions are simultaneously true.

**ARCHITECTURE & CONSISTENCY OUTCOMES**

- **SC-012**: ZERO new top-level error codes are introduced. The thirteen-tool zero-new-top-level-codes streak is preserved (Constitution Principle IV).
- **SC-013**: ZERO new `details.code` strings are introduced — all five entries in the FR-013 roster reuse codes already established in BI-026.
- **SC-014**: ZERO new ADRs are introduced. ADRs 013 / 014 / 015 cover this BI's design pattern as second consumer.
- **SC-015**: The cross-cutting `_eval-vault-closed-detection` shared module is extracted AND consumed by both `smart_connections_similar` (behaviour-preserving refactor; `_register-baseline.json` fingerprint unchanged) AND `smart_connections_query` (new consumer).
- **SC-016**: The cohort-consistency ripple FR-013a (BI-026 emits `details.reason = "api-missing"` on its existing `SMART_CONNECTIONS_NOT_READY`) is applied in this same BI.
- **SC-017**: The canonical architecture document `.architecture/Obsidian CLI MCP - Architecture.md` is rolled forward in the plan commit (FR-025). No new architecture-snapshot file is created.

**ANTI-INJECTION & SECURITY**

- **SC-018**: The base64-encoded JSON payload + frozen JS template pattern (FR-012 / FR-019) is verified structurally — handler test asserts the JS template contains exactly one `__PAYLOAD_B64__` slot AND the substituted value decodes round-trip to the original input via base64.atob + JSON.parse.

**DOCUMENTATION & DISCLOSURE**

- **SC-019**: The tool-docs file `docs/tools/smart_connections_query.md` exists, contains the FR-021 required sections, AND the BI-005 registry-consistency test passes.

**PERFORMANCE & CAPACITY**

- **SC-020**: A typical call completes within the same latency envelope as `smart_connections_similar` (BI-026 baseline ~200ms per call exclusive of the embedding-model embed time, which is plugin-internal).
- **SC-021**: A query whose serialised match list would exceed the underlying execution layer's 10 MiB cap produces a structured `CLI_NON_ZERO_EXIT` (output-cap kill) rather than a silent truncation in 100% of test runs (essentially unreachable at `limit: 1..100` but contractually preserved).

**TEST SURFACE**

- **SC-022**: The new tool ships with ≥40 co-located test cases covering schema validation, handler happy paths, handler failure-mode propagation, and registration consistency.
- **SC-023**: The shared `_eval-vault-closed-detection` module ships with ≥15 co-located test cases covering the detector branch and the BOM-aware registry parser.
- **SC-024**: The BI-026 ripple patches ship with ≥3 new regression test cases — one for the `details.reason = "api-missing"` emission AND at least two behaviour-preservation cases confirming the refactor did not change the handler's observable behaviour for the existing `api-missing` path.

## Assumptions

**Plan-stage live-probe assumptions** (verified during /speckit-plan; spec amended if contradicted):

- The Smart Connections plugin's `env.smart_sources.lookup({filter, collection})` method exists on the live installed plugin version (locked at plan-stage F1).
- `filter.hypotheticals` is the correct field name for text-to-embed-and-query input (locked at plan-stage F3).
- `filter.limit` is the correct placement for the cap (locked at plan-stage F4).
- The plugin embeds query text internally; the wrapper does NOT need to pre-compute embeddings (World A per the grilling Q3 lock).
- `collection: "smart_blocks"` returns block-level keys in the format characterised by BI-026's R7 split rule (verified at plan-stage F5–F7).
- Closed-but-registered vault behaviour reproduces on `lookup`-based eval calls with the same empty-stdout + transparent-open signature as on `find_connections`-based calls (locked at plan-stage F10).
- The plugin's lookup API failures (throws, rejected promises) are catchable inside the eval JS template via try/catch (locked at plan-stage F12).

**Constraints carried from prior BIs**:

- Minimum plugin version: locked at plan stage based on live probe (parity with BI-026 Q1 docs-only soft-pin).
- The wrapper does NOT pre-validate the user's embed-model configuration. Configuration issues surface as `SMART_CONNECTIONS_NOT_READY(embed-failed)` at runtime.
- The wrapper does NOT auto-retry on `VAULT_NOT_FOUND(not-open)`. The caller observes the structured error and retries after a brief delay if desired.

**Out of scope** (deferred to future BIs):

- Multi-hypothetical HyDE queries: the upstream `filter.hypotheticals` field is natively an array; this BI accepts a single `query: string` only and wraps it as `[query]`. A future BI MAY widen the type to `string | string[]` as a backwards-compatible change.
- Pre-computed embedding input: World B (caller supplies a pre-embedded vector, wrapper bypasses the embed pipeline) is not supported.
- Block content retrieval: the response includes block locators (`path` + `headingPath`) but NOT the block body. Agents needing block content chain `read_heading` with the `headingPath` array.
- Cross-vault search: every call is scoped to a single vault (named or focused). Querying across multiple vaults in one call is out of scope.
- Source-only matches (filtering out block-level results): the response carries whatever granularity the plugin returns at `collection: "smart_blocks"`. Agents who want source-level aggregation collapse by `path` client-side.
- Score thresholding: the wrapper does NOT expose a minimum-score filter. The plugin's internal threshold governs what enters the result set; the wrapper's `limit` caps the count.
- Folder-scope filtering: the wrapper does NOT expose `key_starts_with` or `exclude_keys` filter fields. The plugin's `exclude_folders` setting (configured in the plugin UI) governs corpus inclusion silently.
- Hybrid lexical + semantic search: the wrapper performs semantic-only search via embeddings. Keyword-anchored search is available via the existing `obsidian_exec` surface.
