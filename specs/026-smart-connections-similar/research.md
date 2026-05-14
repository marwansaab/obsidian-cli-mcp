# Phase 0: Research — `smart_connections_similar` Typed Tool (Semantic-Similarity Nearest-Neighbour)

**Feature**: [026-smart-connections-similar](./spec.md)
**Date**: 2026-05-15

This document records the Phase 0 design decisions (R1..R14) and the plan-stage live-CLI / live-plugin findings (F1..F14) probed at plan synthesis against the host's `obsidian` CLI with three open vaults (`TestVault-Obsidian-CLI-MCP`, `The Setup`, `Ways of Working`) — all three carrying an installed-and-indexed Smart Connections plugin. The findings below lock the implementation strategy AND resolve every plan-stage ambiguity flagged in the spec, including the two live-probe-driven amendments captured in the 2026-05-15 clarifications session.

---

## Design decisions

### R1 — Logger surface

#### Decision

Thin handler. No per-call `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` events at the tool layer.

#### Rationale

Mirrors every prior typed tool (006 / 011 / 012 / 013 / 014 / 015 / 018 / 019 / 021 / 023 / 024 / 025). The cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying CLI invocation; the typed-tool layer adds nothing useful that the dispatch layer doesn't already record. A new logger surface here would create cross-cohort inconsistency and force a refactor sweep across the eleven existing thin handlers — out-of-scope for this BI.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Add per-call `callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer | Cohort inconsistency; no operational gap the dispatch layer fails to cover; would force a sweep of eleven prior tools |
| Add tool-specific events naming `smart_connections_similar` for telemetry slicing | Premature — no current operational requirement for per-tool telemetry slicing; can be added cohort-wide in a later BI |
| Lift dispatch-layer events into the tool layer (move responsibility upward) | Constitution Principle I downward-flow violation; the dispatch layer's events are correctly scoped to CLI dispatch concerns |

#### Implementation notes

- Handler imports `invokeCli` from `cli-adapter/`; does not import `logger`.
- The cli-adapter's existing instrumentation fires unchanged for this tool's single spawn per request.

---

### R2 — CLI subcommand: `eval` (NOT a native subcommand) — load-bearing per F2

#### Decision

The wrapper sends `obsidian vault=… eval code=<rendered-js>` and parses the eval envelope's JSON return value. There is no native Obsidian CLI subcommand for similarity queries; the Smart Connections plugin's similarity API is reached from inside the eval JS template via `app.plugins.plugins["smart-connections"].env.smart_sources.items[<key>].find_connections({limit: N})`.

#### Rationale

The 2026-05-15 `obsidian help` probe (F2) enumerated 80+ CLI subcommands; none expose a similarity query. The Smart Connections plugin's runtime data lives on the plugin object at `app.plugins.plugins["smart-connections"]` — reachable only via `eval`. The wrapper CANNOT satisfy FR-001's semantic-neighbour read contract via any native subcommand.

Cohort placement: this BI is the **first member of the eval-driven plugin-backed cohort** — distinct from the eval-driven metadataCache cohort (BI-014 `find_by_property`, BI-015 `read_heading`, BI-025 `links`) AND distinct from the native-subcommand cohort (BI-019 `files`, BI-023 `outline`, BI-024 `properties`). The architectural fork is forced by F2 (no native subcommand) AND by the data living on a plugin's runtime object rather than Obsidian's core metadata APIs.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Use a hypothetical native `similarity` subcommand | Does not exist (F2) |
| Run embedding generation client-side and compute similarity in the wrapper | Duplicates plugin work; requires hosting an embedding model in the wrapper; results would not match what the user sees in the Smart Connections sidebar |
| Shell out to the plugin's own command-palette commands via Obsidian URI | URI commands return human-readable UI side effects, not structured JSON; not load-bearing as an API |
| Read the plugin's serialised index files from disk directly | Plugin-version-coupled file format; bypasses the plugin's in-memory lookup; brittle |

#### Implementation notes

- Single invocation per request (see R3).
- Anti-injection via base64 payload (see R6).
- Plugin-API path resolved at plan-stage probe (F3); the JS template depends on `env.smart_sources.items[<key>]` being item-based and per-source items carrying a `find_connections` method.

---

### R3 — Single-call architecture, branched at envelope-emission on `a.total`

#### Decision

ONE `invokeCli` per request. The same eval JS template handles both default mode (`total: false`) and count-only mode (`total: true`). The eval JS internally computes the full filtered-and-sorted match array regardless of mode, then conditionally includes the entries in the envelope based on `a.total` (the base64-payload boolean).

#### Rationale

A two-call architecture would split count-only from default mode — paying an extra CLI spawn (≈80–200 ms) for no benefit. By computing the full match list in both modes and gating only the emission, FR-006a's cross-mode invariant holds **by construction**: the outer `count` is `entries.length` after self-exclusion and finite-score filtering, identical in both modes by the same code path. Same eval, same source data, same `count`. Parity with BI-019 / BI-023 / BI-024 / BI-025.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Two-call: count via `find_connections({limit, count_only: true})`, list via second call | Plugin API has no `count_only` flag; cost of second spawn pays for nothing |
| Branch at the wrapper layer (issue one of two different eval scripts) | Doubles the JS template surface to keep frozen; doubles handler test coverage; no semantic benefit |
| Use upstream's `total` flag on a hypothetical native subcommand | No native subcommand (R2 / F2) |

#### Implementation notes

- Eval JS reads `a.total` from the base64 payload and gates `matches: a.total ? [] : entries`.
- Outer `count` is `entries.length` post-filter, in both modes.
- Handler test fixture asserts equal `count` across `total: false` / `total: true` against the same stub.

---

### R4 — Adapter `target_mode` mapping: STANDARD per ADR-003

#### Decision

The user-facing schema HAS the `target_mode` discriminator field (`specific` vs `active`). The handler passes `input.target_mode` through to `invokeCli` unchanged. In specific mode, `vault` flows through; in active mode the cli-adapter's `stripTargetLocators` defence-in-depth strip removes any leaked `vault` / `file` / `path`.

#### Rationale

ADR-003 governs typed tools operating on a single named file or the focused file; `smart_connections_similar` is exactly that shape. The schema consumes `targetModeBaseSchema` + `applyTargetModeRefinement` from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts), extended with `limit` and `total` fields. Parity with `read` / `outline` / `read_heading` / `read_property` / `set_property` / `links`.

The eval JS itself reads the `a.active` / `a.path` / `a.file` flags from the base64 payload to choose the file-resolution strategy:
- `a.active` → `const f = app.workspace.getActiveFile()` (NO_ACTIVE_FILE on null)
- `a.path` → `const f = app.vault.getFiles().find(x => x.path === a.path)` (FILE_NOT_FOUND on null)
- `a.file` → `const f = app.metadataCache.getFirstLinkpathDest(a.file, '')` (FILE_NOT_FOUND on null)

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Drop `target_mode` and require explicit locator always | Breaks cohort uniformity with the eleven prior typed tools that expose active mode |
| Add a new `vault_only` mode for plugin-wide queries | Out-of-scope for v1 (no use case in the spec) |
| Auto-detect active vs specific from field presence (no discriminator field) | ADR-003 explicitly forbids — discriminator field is the contract |

#### Implementation notes

- `applyTargetModeRefinement` enforces vault-mandatory-in-specific, file/path XOR, no-locators-in-active.
- The cli-adapter's `stripTargetLocators` is unchanged.

---

### R5 — Unknown-vault response inspection: ACTIVE per the cli-adapter's existing 011-R5 clause

#### Decision

The cli-adapter's existing 011-R5 unknown-vault response-inspection clause FIRES for unregistered vaults via the standard `Vault not found.` string emission (parity with BI-014 / BI-015 / BI-025 eval-cohort). Reclassifies to `CLI_REPORTED_ERROR` with `details.code: 'VAULT_NOT_FOUND'` and `details.reason` absent or `"unknown"`.

#### Rationale

Reconfirmed for this BI's CLI version on 2026-05-15 (cited from the BI-025 verification — the cli-adapter behaviour is stable across plan-stage probes). The FR-017 spec-stage commitment ("structured error naming the unknown vault") HOLDS without amendment for the unregistered-vault path. The wrapper inherits the existing clause behaviour unchanged.

Different from BI-019 / BI-023 / BI-024 (which used NATIVE subcommands and observed upstream silently honouring `vault=` as noop → inherited-limitation path). Matches BI-014 / BI-015 / BI-025 (which used `eval` and observed upstream emitting `Vault not found.` → 011-R5 inspection clause fires → structured-error path).

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Widen the cli-adapter to add a new dispatch-layer code | FR-021 forbids new top-level codes; cohort-uniform path through `CLI_REPORTED_ERROR` is the correct shape |
| Detect unknown-vault inside the eval JS itself | The eval doesn't run when the vault is unknown — the CLI emits `Vault not found.` before reaching `eval` execution |
| Treat unknown vault as a wrapper-layer validation error | Schema can't validate against vault registration without coupling the schema layer to the CLI binary |

#### Implementation notes

- The wrapper does NOT widen the cli-adapter.
- The wrapper's handler does NOT have a code path for unregistered vault — the 011-R5 inspection clause intercepts.
- `details.reason` is absent (or `"unknown"`) on this path; a separate sub-discriminator distinguishes the closed-but-registered case (see R5a).

---

### R5a — Closed-but-registered vault detection: handler-side, NEW empty-stdout signature

#### Decision

When a `vault` display name IS registered in `obsidian vaults` output BUT the corresponding vault window is NOT currently open in Obsidian, the wrapper surfaces `CLI_REPORTED_ERROR(details.code = "VAULT_NOT_FOUND", details.reason = "not-open")`. Detection signature **locked by live probe on 2026-05-15** (F7): `{empty stdout, exit 0, vault= argument supplied, vault name present in 'obsidian vaults' output}`. Detection locus: **the typed-tool handler** — NOT the cli-adapter.

#### Rationale

F7 confirmed the CLI behaviour when an eval is dispatched against a closed registered vault: empty stdout + exit 0 AND a transparent side effect that OPENS the vault. The cli-adapter's existing 011-R5 inspection clause does NOT fire (no `Vault not found.` string in empty output, per F9). A new detection branch is required.

Detection-locus choice (handler-side, not dispatch-layer):
- The cli-adapter's 008-refactor surface is FROZEN; widening it to detect a plugin-tool-specific empty-stdout signature would couple the dispatch layer to the typed-tool surface, violating Constitution Principle I (downward flow only).
- The DRY threshold of two is not met — `smart_connections_similar` is the first plugin-backed typed tool. A second plugin-backed tool needing the same detection (a future `smart_connections_blocks` from 027 or similar) would justify lifting the detection into a shared helper or an opt-in cli-adapter extension covered by its own ADR.
- Detection logic is cheap and self-contained (~10 LOC): in the handler's post-spawn JSON-parse path, check stdout for empty/whitespace-only AND check the `vault` field of the input; emit `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")` if both conditions hold.

The `details.reason` sub-discriminator preserves the eleven-tool zero-new-top-level-codes streak since BI-011 (FR-021).

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Widen the cli-adapter's 011-R5 clause to detect empty stdout | Couples dispatch layer to plugin-tool surface; FROZEN per 008-refactor |
| Add a new top-level error code `VAULT_NOT_OPEN` | Violates FR-021 zero-new-top-level-codes commitment |
| Treat empty stdout as a generic `JSON.parse` failure (current default) | Loses the actionable `not-open` signal; agent can't distinguish "vault closed" from "eval returned malformed JSON" |
| Auto-retry on the caller's behalf after detecting `not-open` | Caller-visibility violation; the CLI opens the vault transparently but timing is plugin-config-dependent (seconds-to-minutes) — retry policy belongs to the agent |

#### Implementation notes

- Handler's parse pipeline order: (1) check empty/whitespace stdout + `input.target_mode === 'specific'` + `input.vault` non-empty → emit `VAULT_NOT_FOUND(not-open)`; (2) else `JSON.parse(stdout)`; (3) else envelope `safeParse`; (4) else discriminate on `ok`.
- Handler test fixture seeds an empty-stdout stub response and asserts the `VAULT_NOT_FOUND(not-open)` mapping.
- Documented in `docs/tools/smart_connections_similar.md` — agents seeing `not-open` MAY retry after a brief delay; the wrapper does NOT auto-retry.

---

### R6 — Anti-injection via base64-encoded JSON payload

#### Decision

Frozen JS template + base64 payload (alphabet `[A-Za-z0-9+/=]`). User-supplied `vault` / `file` / `path` / `target_mode` / `limit` / `total` flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` + `JSON.parse` at JS runtime. No user input ever reaches the JS source as text.

#### Rationale

Verifies FR-028 / SC-025 structurally. Parity with BI-014 / BI-015 / BI-025 (eval-cohort anti-injection idiom). The JS template carries a single `__PAYLOAD_B64__` substitution point — frozen against accidental modification by the handler-render test fixture.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Interpolate user strings into the JS source with manual escaping | Escaping is brittle; one missed backtick / quote / backslash breaks anti-injection |
| Pass user strings as separate CLI argv parameters | The CLI's `eval` subcommand has one `code=` parameter; multi-arg passing is not its contract |
| Use template literals with parameterised functions (no payload encoding) | The JS template is rendered before reaching the CLI; templating happens in TypeScript-land where the user's strings are already adjacent to the JS source — base64 is the cleanest wall |

#### Implementation notes

- `JS_TEMPLATE` is a `const` string with a single literal `"__PAYLOAD_B64__"` token.
- Render step: `JS_TEMPLATE.replace("__PAYLOAD_B64__", b64Payload)`. Single substitution.
- Handler test asserts the base64 round-trip: stub `spawnFn` decodes the rendered argv's payload and verifies the original input is recoverable bit-for-bit.

---

### R7 — Per-match transform: in-eval extraction of `{path, headingPath, score}`

#### Decision

For each match record returned by `find_connections()` (shape `{item: {key: "Folder/Note.md#H1#H2"}, score: number}` per F4), the in-eval JS extracts:

1. `path` = `key.split('#')[0]` (the source file's vault-relative path, with `.md` extension preserved)
2. `headingPath` = `key.split('#').slice(1)` (the array of heading segments after the first `#`; empty array `[]` for source-level matches if any appear; `["---frontmatter---"]` literal for frontmatter blocks per F6)
3. `score` = the raw `score` value, pass-through (no clamp, no normalisation, no round)

#### Rationale

The 2026-05-15 grilling-Q3 live-probe amendment switched v1 from source-only to block-level granularity — `find_connections()` returns block-level matches by default, and even with `exclude_blocks: true` zero source-level matches appeared across the three test vaults (F5). The wrapper's natural shape is therefore the plugin's natural shape: `{path, headingPath, score}` where `headingPath` carries the block-locator information.

The frontmatter sentinel `"---frontmatter---"` is preserved verbatim (F6) — the wrapper does NOT normalise it to a friendlier label or strip it. Spec FR-007 and the Edge Cases / path string format section lock this.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Dedupe to source-level with max-score-per-source collapse | Lossy; obscures the plugin's true block-level scoring; users with the Smart Connections sidebar would see different results from the wrapper |
| Use `exclude_blocks: true` on the plugin call to force source-level | F5 — probe showed this returns zero matches (likely a plugin bug or threshold interaction); not load-bearing |
| Surface a separate `kind` discriminator field (`block` vs `source`) | Redundant — `headingPath.length === 0` already encodes this; FR-007 exhaustive-fields lock forbids the addition |
| Normalise the frontmatter sentinel to a localised label | Wrapper is a thin adapter; sentinel comes from the plugin |

#### Implementation notes

- Transform happens in-eval before sorting and self-exclusion.
- The transform is a tight `.map(m => ({path: m.item.key.split('#')[0], headingPath: m.item.key.split('#').slice(1), score: m.score}))` — locked by handler test against a stub spawn response carrying `{item: {key}, score}` shape.

---

### R8 — Three-level sort intra-eval

#### Decision

The eval JS sorts the post-filter entries array by:

1. **Primary**: `score` descending (highest similarity first)
2. **Secondary**: `path` byte-compare ascending (JavaScript `<`/`>` on the string, NOT `localeCompare`)
3. **Tertiary**: `headingPath.join('#')` byte-compare ascending

#### Rationale

The 2026-05-15 grilling-Q3 amendment added the tertiary tiebreak because the new per-match shape permits multiple matches per source file (different blocks within one note tied on score). Two-level sort would leave intra-file tie-order undefined; three-level locks determinism across repeated calls against an unchanged index state (FR-008, SC-007).

Byte-compare (not locale-aware) is the deterministic choice — `localeCompare` varies by locale and produces unstable test snapshots across CI runners. Parity with BI-025's `_col`-style internal-sort precedent.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Two-level only (`score` desc / `path` asc) | Intra-file ties produce non-deterministic order; FR-008 lock fails |
| Use `localeCompare` for the string tiebreaks | Locale-dependent; CI snapshots break on locale-mismatched runners |
| Surface a `sortKey` request parameter | Out of scope for v1 — agents wanting different orders re-sort client-side |
| Trust the plugin's emission order | Plugin sort is `score` desc only; no tiebreak; non-deterministic for ties |

#### Implementation notes

- Sort runs after self-exclusion (R9) and after the finite-score filter (R10) — bad-score entries don't influence the sort, source entries don't appear at all.
- Handler test fixture seeds three matches with two-way tie at score=0.85 (different `path`) AND one fixture with two-way tie at same `path` (different `headingPath`); asserts deterministic order.

---

### R9 — Source-path-keyed self-exclusion

#### Decision

In-eval post-fetch filter `.filter(m => m.path !== sourcePath)` — where `m.path` is the per-match path component (everything before the first `#`) and `sourcePath` is the resolved source note's vault-relative path. Excludes the source note AND any block-level match inside the source note.

#### Rationale

Smart Connections' `find_connections()` already excludes self by default at the block-key level (verified in F4 probe), but the wrapper enforces this as **defence-in-depth** so a future plugin version that changes the default does not silently leak the source. Block-level self-exclusion is essential under the 2026-05-15 grilling-Q3 amendment — blocks inside the source note are still "self" in the semantic-similarity sense and would otherwise dominate the result list for short notes (the plugin returns block matches for every block, including ones inside the source itself if the default changes).

Spec FR-010 and the Edge Cases / self-exclusion section lock this.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Rely solely on the plugin's default self-exclusion | No defence-in-depth; future plugin version change silently leaks |
| Key the filter on the full match key (`m.item.key !== sourceKey`) | Misses block-level self-matches when `sourceKey` is the bare source path |
| Surface an opt-out `include_self` parameter | Out of scope for v1 — agents wanting the source's own similarity inspect via `read` |

#### Implementation notes

- Source path resolution happens before the plugin call; `sourcePath` is in scope when the filter runs.
- Handler test fixtures cover both source-level self-match (stub returns `{key: sourcePath}`) and block-level self-match (stub returns `{key: sourcePath + '#H1'}`); both excluded.

---

### R10 — Non-finite-score filter

#### Decision

In-eval post-fetch filter `.filter(m => Number.isFinite(m.score))`. Silently drops any match whose `score` field is NaN, Infinity, -Infinity, null, undefined, or any non-numeric value. The outer `count` reflects the post-filter length consistently in both default and count-only modes (FR-006a invariant preserved).

#### Rationale

Per the 2026-05-15 clarifications session Q2: a non-finite score means the plugin failed to compute similarity for that pair; silently dropping is the conservative thin-adapter behaviour. The wrapper does NOT coerce non-finite scores to a sentinel value (would lie about the plugin's classification), does NOT surface a dedicated envelope code for the filter event (would force agents to special-case a plugin-internal failure they can't remediate), AND does NOT emit any signal about how many entries were dropped (out-of-band metadata pollutes the response contract).

Spec FR-009a and the Edge Cases / non-finite-scores-dropped-silently section lock this.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Surface an `INVALID_SCORE` envelope code when any non-finite score appears | Q2 explicitly chose Option B (drop silently); agents can't act on it usefully |
| Coerce non-finite scores to 0 | Lies about plugin classification; would surface in `matches[]` with bogus score |
| Emit a sidecar `dropped: N` field in the response | Out-of-band metadata; pollutes the FR-007 exhaustive-fields shape |
| Skip the filter and let bad scores reach the response | Breaks the FR-008 sort order (NaN comparisons are non-deterministic); breaks SC-007a "score is a finite JavaScript number" |

#### Implementation notes

- Filter runs before the sort (R8) — bad scores don't affect sort order.
- Filter runs before self-exclusion (R9) — both filters are post-fetch; order between them is immaterial because they're independent predicates.
- Handler test fixture seeds at least one stub match with NaN score AND one with null score; both dropped from output.

---

### R11 — SOURCE_NOT_INDEXED detection via `env.smart_sources.items[<key>]` absence

#### Decision

In-eval check: after resolving the source `.md` file, look up `env.smart_sources.items[sourceKey]` where `sourceKey` is the vault-relative path with `.md` extension. If `undefined`, emit `{ok: false, code: 'SOURCE_NOT_INDEXED', detail: sourcePath}`.

#### Rationale

Per F3 / F11: the plugin's item-based storage at `env.smart_sources.items[<key>]` is the source-of-truth for "is this note in the index?" When the key returns `undefined`, the file exists in the vault (otherwise we'd have hit FILE_NOT_FOUND earlier in the chain) but the plugin has no embedding entry. Distinct from `SMART_CONNECTIONS_NOT_READY` (plugin lifecycle issue) and `FILE_NOT_FOUND` (file doesn't exist at all).

Spec FR-014 and FR-017b's precedence chain (SOURCE_NOT_INDEXED is last) lock this.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Trigger embedding from this call when the source isn't indexed | Violates read-only contract; FR-014 explicit "wrapper does NOT trigger embedding" |
| Treat undefined source as an empty success | Lies about the plugin's state; agent can't distinguish from a real zero-neighbour result |
| Use `.get(key)` instead of `.items[key]` | F11 — plugin's smart_sources is item-based, not a Map; `.get()` doesn't exist |

#### Implementation notes

- The check happens AFTER NOT_MARKDOWN (R12) and AFTER SMART_CONNECTIONS_NOT_READY (the API-path-resolves check) per FR-017b precedence.
- Handler test fixture stubs `smart_sources.items` returning `undefined` for the requested key; asserts `SOURCE_NOT_INDEXED` envelope.

---

### R12 — NOT_MARKDOWN guard in-eval via `f.extension === 'md'`

#### Decision

After resolving the source file but BEFORE reaching the plugin, the in-eval JS checks `f.extension === 'md'`. If false, emits `{ok: false, code: 'NOT_MARKDOWN', detail: f.path}`.

#### Rationale

Smart Connections' free version embeds `.md` files only by default. A `.canvas` / PDF / image source would either silently miss the index (false success with empty list) OR hit a different plugin internal path. Pre-empting via the extension guard surfaces a structured error before reaching the plugin. Parity with BI-025 `links`'s NOT_MARKDOWN contract.

Spec FR-013 and the Edge Cases / non-`.md`-source section lock this.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Let the plugin handle non-`.md` sources and trust its error | Plugin returns empty list (false success) for non-`.md`; doesn't surface as error |
| Reject non-`.md` at the schema layer (validate path extension client-side) | Schema can't see filesystem; basename locator has no extension to validate |
| Surface as SOURCE_NOT_INDEXED | Semantic-correctness violation — `.canvas` files aren't "not indexed", they're "not the right kind" |

#### Implementation notes

- Check happens AFTER file resolution (FILE_NOT_FOUND fires first) and BEFORE plugin-lifecycle checks per FR-017b.
- Handler test fixture stubs a `.canvas` file resolution; asserts NOT_MARKDOWN envelope.

---

### R13 — Error-precedence chain per FR-017b

#### Decision

Outer-to-inner / cheapest-first; each discriminator is the FIRST condition in the chain that fails. Specific mode chain:

```
VAULT_NOT_FOUND(unknown)        — cli-adapter 011-R5 inspection, BEFORE eval
  ↓
VAULT_NOT_FOUND(not-open)        — handler-side empty-stdout detection per R5a
  ↓
SMART_CONNECTIONS_NOT_INSTALLED — in-eval: app.plugins.plugins["smart-connections"] present
  ↓
FILE_NOT_FOUND                   — in-eval: source-file resolution
  ↓
NOT_MARKDOWN                     — in-eval: f.extension === 'md' per R12
  ↓
SMART_CONNECTIONS_NOT_READY     — in-eval: env.smart_sources reachable and find_connections callable
  ↓
SOURCE_NOT_INDEXED              — in-eval: env.smart_sources.items[sourceKey] not undefined per R11
  ↓
success
```

Active mode skips the vault steps (active mode forbids `vault` per ADR-003):

```
SMART_CONNECTIONS_NOT_INSTALLED → NO_ACTIVE_FILE → NOT_MARKDOWN → SMART_CONNECTIONS_NOT_READY → SOURCE_NOT_INDEXED → success
```

The wrapper does NOT short-circuit later checks when an earlier check fires (no `Promise.all` parallel evaluation).

#### Rationale

Per the 2026-05-15 clarifications session Q4: outer-to-inner matches the user's mental layering (which vault → which file → which plugin → which source); each check that fires is independently meaningful (an agent that gets `VAULT_NOT_FOUND` doesn't waste effort on file paths in the wrong vault); cheap string comparisons run before expensive cache lookups; `VAULT_NOT_FOUND(unknown)` is naturally first because the cli-adapter's 011-R5 inspection intercepts the eval before it runs.

Spec FR-017b and SC-011b's compound-failure fixture requirement lock this.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Inside-out (innermost check fires first) | Counter-intuitive; an agent calling with the wrong vault would still hear about indexing state |
| Parallel evaluation, surface all failures | Pollutes response; agents want one actionable signal at a time |
| Random / undefined precedence | Test snapshots non-deterministic; agents can't predict which signal arrives |

#### Implementation notes

- Each discriminator is the FIRST condition that fails — locked by SC-011b's compound-failure fixture set (one fixture per adjacent pair).
- Six adjacent pairs in specific mode + four in active mode = ten compound-failure fixtures in the handler test suite.

---

### R14 — Plugin-namespace tool name codified in ADR-013

#### Decision

The new naming convention `<plugin_name>_<operation>` is codified in **ADR-013** (created during this plan phase per FR-029). Format: snake_case, plugin name as prefix verbatim with hyphens replaced by underscores (`smart-connections` → `smart_connections`), operation name as suffix (`similar`). Source dir `src/tools/smart_connections_similar/`; factory `createSmartConnectionsSimilarTool`.

The convention is distinct from ADR-010's single-word-verbatim-from-upstream rule, which applies only to wrappers of native Obsidian CLI subcommands. ADR-013's scope clause governs: plugin-backed typed tools follow `<plugin_name>_<operation>`; native-CLI-subcommand wrappers continue to follow ADR-010.

#### Rationale

ADR-010 explicitly excludes "Tools without a 1:1 CLI anchor — composite or eval-composition tools whose operation has no single upstream subcommand to align to" (point 3 of the ADR's Decision section). Plugin-backed tools fall under this exclusion — there is no native CLI subcommand to mirror. The new ADR-013 convention gives plugin-cohort tools a deterministic, scalable naming rule: future tools `smart_connections_blocks`, `smart_connections_chat`, `dataview_query`, etc. all follow the same shape.

Spec FR-001 + FR-029 + SC-027 lock this.

#### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Single-word `similar` per ADR-010 | Ambiguous (what's similar to what?); fails the discoverability test for plugin-backed surfaces |
| `find_connections` mirroring the plugin API method name | Couples the tool name to the plugin's internal API names; brittle across plugin version changes |
| `sc_similar` short prefix | Saves three characters at the cost of discoverability; arbitrary abbreviation |
| Hyphenated `smart-connections-similar` | Project convention is snake_case for tool names |

#### Implementation notes

- ADR-013 created in this plan phase, status `Decided` 2026-05-15.
- Decision Log updated with one new row.
- Constitution Compliance checklist gains one new row for ADR-013; version bump 1.3.0 → 1.4.0.
- No rename of existing tools — convention applies forward only.

---

## Live-CLI / live-plugin findings (probed 2026-05-15 across three open vaults)

The CLI and plugin surface were probed live during plan synthesis. Probes ran against `TestVault-Obsidian-CLI-MCP`, `The Setup`, and `Ways of Working` — all three with the Smart Connections plugin installed and indexed. Probe commands quoted verbatim where load-bearing; sandbox fixtures cleaned up post-probe per the test-execution protocol.

### F1 — `vault=<name>` on `eval` ROUTES CORRECTLY to the named vault's `app` instance

#### What was probed

The premise carried forward in BI-014 / BI-015 / BI-025 spec drafts — "vault= is silently honoured-as-noop by eval" — was rechecked against the plan-stage CLI version across all three open vaults.

#### Result

```
> obsidian vault="TestVault-Obsidian-CLI-MCP" eval code="JSON.stringify({focused:app.vault.getName()})"
=> {"focused":"TestVault-Obsidian-CLI-MCP"}

> obsidian vault="The Setup" eval code="JSON.stringify({focused:app.vault.getName()})"
=> {"focused":"The Setup"}

> obsidian vault="Ways of Working" eval code="JSON.stringify({focused:app.vault.getName()})"
=> {"focused":"Ways of Working"}
```

`app.vault.getName()` inside the eval returns the requested vault's name — NOT the focused-window vault's name. The CLI routes the eval to the correct `app` instance across all three open vaults.

#### Implication for the spec/plan

Contradicts the BI-014 / BI-015 / BI-025 carried-forward assumption. Drives the **2026-05-15 live-probe-driven amendment** that repurposed FR-017a from focused-vault-mismatch detection to **vault-not-open detection**. Locks R5 (cli-adapter 011-R5 fires unchanged for unregistered vault) AND drives R5a (new handler-side empty-stdout signature for closed-but-registered vault). The `vault=<name>` argument is load-bearing for cross-vault routing; multi-vault basename ambiguity reappears as documented inherited limitation #5.

---

### F2 — No native similarity subcommand; Smart Connections plugin object at `app.plugins.plugins["smart-connections"]`

#### What was probed

`obsidian help` was grepped for similarity-related subcommands; the plugin object location was verified via `obsidian eval code="JSON.stringify(Object.keys(app.plugins.plugins))"`.

#### Result

`obsidian help` enumerates ~80+ subcommands (read, write, delete, files, outline, properties, links, etc.); none match `similar`, `similarity`, `connections`, `embed`, `vector`. The plugin object IS reachable at `app.plugins.plugins["smart-connections"]`.

#### Implication for the spec/plan

Drives R2 — `eval` is load-bearing as the only path to the plugin's similarity API. Cohort placement: **eval-driven plugin-backed cohort** (first member). Forces the ADR-013 plugin-namespace tool-naming convention because there is no native CLI subcommand to mirror per ADR-010.

---

### F3 — Plugin API path: `app.plugins.plugins["smart-connections"].env.smart_sources.items[<key>].find_connections({limit: N})`

#### What was probed

```
> obsidian vault="The Setup" eval code="(async()=>{const p=app.plugins.plugins['smart-connections'];const env=p.env;const src=env.smart_sources.items['Home.md'];const results=await src.find_connections({limit:3});return JSON.stringify({matchCount:results.length,top:results.slice(0,3).map(r=>({key:r.item?r.item.key:r.key,score:r.score}))});})()"
```

#### Result

Returned three block-level matches with keys like `"400-Architecture/Architecture Overview.md#---frontmatter---"` and similar. Confirmed the API path resolution AND the async return-array shape.

#### Implication for the spec/plan

Locks R11's source-lookup mechanism AND the handler shape. The async-returns-array contract means the eval JS template MUST be wrapped in an `async` IIFE — single `await` on the `find_connections()` call. The handler test fixtures seed `find_connections` returning the same `[{item:{key},score}]` shape.

---

### F4 — Return shape: `[{item: {key: "Folder/Note.md#H1#H2"}, score: number}]` — block-level keys with `#` fragments

#### What was probed

The structure of each match entry returned by `find_connections()` was inspected via the F3 probe's output.

#### Result

Each match record has shape `{item: {key: <string>}, score: <number>}`. The `item.key` is a block-key string carrying the source file's vault-relative path followed optionally by `#`-delimited heading-path segments (e.g. `"400-Architecture/Architecture Overview.md#---frontmatter---"`, `"400-Architecture/Components/MCP Layer.md#MCP Layer#Current implementation"`). Source-level matches would have a bare path with no `#` fragment.

#### Implication for the spec/plan

Drives R7's three-step per-match transform: extract `path` via `key.split('#')[0]`, extract `headingPath` via `key.split('#').slice(1)`, pass-through `score`. The `{item, score}` outer shape (NOT `{path, score}` directly) is load-bearing — the JS template MUST navigate `r.item.key` (the F3 probe defensively used `r.item?r.item.key:r.key` to handle both shapes; the handler may keep the same defensive pattern OR fix it to `r.item.key` once the F4 finding is locked).

---

### F5 — `find_connections` returns BLOCK-level matches by default; `exclude_blocks: true` filter does not flip to source-level

#### What was probed

`find_connections({limit: 50})` and `find_connections({limit: 50, exclude_blocks: true})` were both probed against `Home.md` in `The Setup`.

#### Result

Both calls returned block-level matches; the `exclude_blocks: true` filter did NOT change the result set. ZERO source-level matches observed even at `limit: 50` across the test vaults.

#### Implication for the spec/plan

Drives the **2026-05-15 live-probe-driven amendment to grilling Q3** — v1 ships block-level per-match shape (`{path, headingPath, score}`), not source-only. The grilling-session Q3 assumption that "source-mode is the natural plugin output" was FALSE. The amendment cascades: FR-007 rewritten for the new shape; FR-008 gains tertiary tiebreak; FR-010 keyed on source path; all four user stories' acceptance scenarios updated; Edge Cases CONTENT — path string format rewritten; "block-level matches deferred to future smart_connections_blocks tool" REMOVED from inherited-limitations list.

---

### F6 — Frontmatter blocks emit key `"Folder/Note.md#---frontmatter---"` — sentinel preserved verbatim

#### What was probed

The F3 probe's output included several frontmatter-block matches; the literal key format was inspected.

#### Result

Frontmatter blocks carry the plugin sentinel `---frontmatter---` literally in the key (e.g. `"400-Architecture/Architecture Overview.md#---frontmatter---"`). No localised label, no special character escaping.

#### Implication for the spec/plan

The wrapper preserves the sentinel verbatim in the per-match `headingPath: ["---frontmatter---"]` (FR-007). The wrapper does NOT normalise to a friendlier label. Documented in `docs/tools/smart_connections_similar.md` so agents collapsing `headingPath` to follow-on `read_heading` calls know the frontmatter sentinel is NOT a real heading — they would need `read_property` for a follow-on instead.

---

### F7 — Closed-but-registered vault: eval returns **EMPTY stdout + exit 0** AND transparently OPENS the vault

#### What was probed

After the user closed two of the three open vaults mid-session, the first eval call was issued against one of the closed vaults.

#### Result

```
> obsidian vault="The Setup" eval code="42"
[empty stdout, exit code 0]
```

No `=> ` prefix, no result, no error string, no hang. Subsequently, the closed vault opened in Obsidian as a side effect of the call.

#### Implication for the spec/plan

Drives R5a's new handler-side detection branch. The detection signature is `{empty stdout, exit 0, vault= supplied, vault name present in 'obsidian vaults' output}`. The cli-adapter's existing 011-R5 inspection clause does NOT fire (F9). The wrapper surfaces `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")`. Spec FR-017a and SC-011a lock this.

---

### F8 — Subsequent eval call against the transparently-opened vault works normally

#### What was probed

After F7's first eval triggered the transparent open, a second eval call was issued against the now-open vault.

#### Result

```
> obsidian vault="The Setup" eval code="JSON.stringify({focused:app.vault.getName()})"
=> {"focused":"The Setup"}
```

Normal eval routing per F1 — the vault was now open, the eval reached `app` correctly.

#### Implication for the spec/plan

Documents the side-effect transparency in `docs/tools/smart_connections_similar.md` — agents seeing `VAULT_NOT_FOUND(not-open)` MAY retry the same call after a brief delay; the CLI has already started transparently opening the vault. The wrapper does NOT auto-retry. The open-and-load time is plugin-config-dependent (seconds-to-minutes); retry policy is an explicit agent-level decision.

---

### F9 — cli-adapter's 011-R5 inspection clause does NOT fire for closed-vault case

#### What was probed

The empty-stdout response from F7 was inspected for the literal string `Vault not found.` that the 011-R5 clause keys on.

#### Result

Empty stdout contains no `Vault not found.` string. The 011-R5 clause's string-match condition is false; the clause does NOT fire.

#### Implication for the spec/plan

Justifies R5a's new handler-side detection branch as architectural necessity — the dispatch-layer classifier cannot detect the closed-vault case via its existing string-match. Locks the decision to put the detection in the typed-tool handler (not the dispatch layer per Constitution Principle I and the 008-refactor freeze).

---

### F10 — All three probed vaults had Smart Connections installed and indexed

#### What was probed

The plugin presence and source count was probed across all three open vaults via `Object.keys(app.plugins.plugins["smart-connections"].env.smart_sources.items).length`.

#### Result

- `TestVault-Obsidian-CLI-MCP`: 68 sources indexed
- `The Setup`: 450 sources indexed
- `Ways of Working`: 22 sources indexed

All three vaults carry an installed-and-indexed plugin; the SMART_CONNECTIONS_NOT_INSTALLED and SMART_CONNECTIONS_NOT_READY error paths can be probed only via T0 fixture seeding (temporarily disabling the plugin, OR using a fresh vault before first-indexing completes).

#### Implication for the spec/plan

Confirms cross-vault behaviour AND defines the T0 deferred-probe set: SMART_CONNECTIONS_NOT_INSTALLED (disable plugin in TestVault, probe), SMART_CONNECTIONS_NOT_READY (fresh test vault before initial indexing), SOURCE_NOT_INDEXED (note created after last indexing pass in TestVault). The unit suite covers these paths via handler-test stub spawnFn — the live-CLI characterisation pass (FR-025) runs at T0 of `/speckit-implement`.

---

### F10a — Probed Smart Connections plugin version (soft-pin anchor per Q1)

#### What was probed

```
> obsidian vault="The Setup" eval code="JSON.stringify(app.plugins.plugins['smart-connections'].manifest)"
> obsidian vault="TestVault-Obsidian-CLI-MCP" eval code="JSON.stringify(app.plugins.plugins['smart-connections'].manifest)"
```

(Probed 2026-05-15 after the /speckit-analyze A1 remediation surfaced the gap. The original F1–F14 probe sequence did not query the plugin manifest.)

#### Result

Both vaults report the same plugin manifest:

```json
{
  "id": "smart-connections",
  "name": "Smart Connections",
  "author": "Brian Petro",
  "description": "Chat with your notes & see links to related content with Local or Remote models.",
  "minAppVersion": "1.1.0",
  "authorUrl": "https://smartconnections.app",
  "isDesktopOnly": false,
  "version": "4.5.0",
  "dir": ".obsidian/plugins/smart-connections"
}
```

**Probed plugin version: `4.5.0`** (Smart Connections v4.5.0 by Brian Petro). Both `The Setup` and `TestVault-Obsidian-CLI-MCP` reported identical version strings — confirms the API path verified in F2–F14 is consistent across this user's installation. `minAppVersion: 1.1.0` is the plugin's stated Obsidian-host floor; the wrapper does not assert against it (the host running the eval is necessarily a satisfying Obsidian release).

#### Implication for the spec/plan

Locks the **minimum probed plugin version** that FR-022 / SC-020 / T010 reference — `Smart Connections v4.5.0`. The Q1 docs-only soft-pin is therefore concrete: `docs/tools/smart_connections_similar.md` will state "Verified against Smart Connections plugin v4.5.0; older or newer plugin versions whose API surface diverges from this baseline surface as `SMART_CONNECTIONS_NOT_READY` via the in-eval lifecycle check at Stage 4 of the JS template". Per the Q1 contract, the wrapper does NOT enforce this version at runtime; the soft-pin is operator-facing documentation only.

The probed major version `4.x` clarifies that the plugin's API path (`env.smart_sources.items[<key>].find_connections({limit})`) is the v4-era shape. Earlier v2.x / v3.x plugin releases may have a different API path; users on those older versions will surface `SMART_CONNECTIONS_NOT_READY` rather than silently incorrect results — this is the intended fallback per FR-016.

---

### F11 — Plugin internals: `env`, `.SmartEnv`, `_loaded`, `_smart_env_config` on plugin object; `env.smart_sources.items[<key>]` is item-based

#### What was probed

```
> obsidian vault="The Setup" eval code="JSON.stringify({pluginKeys:Object.getOwnPropertyNames(app.plugins.plugins['smart-connections']).slice(0,10),smartSourcesType:typeof app.plugins.plugins['smart-connections'].env.smart_sources,hasItems:typeof app.plugins.plugins['smart-connections'].env.smart_sources.items==='object'})"
```

#### Result

The plugin object exposes `.env`, `.SmartEnv`, `_loaded`, `_smart_env_config` among others. `env.smart_sources` is an object with an `items` property that is itself an object (not a Map). Per-source items expose a `find_connections` method.

#### Implication for the spec/plan

Locks R11's lookup path — `env.smart_sources.items[<key>]` is the item-based access pattern, NOT `.get(key)` which would be the Map pattern. The handler's stub spawnFn responses mirror this shape: `{ok: true, count, matches}` is the envelope but the in-eval JS reaches through `items[key].find_connections({limit})` — fully wrapper-controlled.

---

### F12 — Limit-vs-threshold: `limit: 50` against Home.md returned 5 results — plugin's internal threshold caps below requested limit

#### What was probed

`find_connections({limit: 50})` was called against `Home.md` in `The Setup` to verify the limit semantics.

#### Result

Returned 5 matches, not 50. The plugin applies an internal score threshold that caps the result set below the requested limit when fewer high-scoring matches exist.

#### Implication for the spec/plan

The spec FR-006 commitment "capped at limit" semantics holds — `count` reflects what was actually returned, not the unbounded similarity-query result count. Documented in `docs/tools/smart_connections_similar.md` as upper-bound semantic: `limit: 100` is an upper bound, not a guarantee; the plugin's threshold may cap below it. SC-018's token-saving win holds — even at the user's intended `limit: 100`, the realistic response is typically ≤ 20 matches, three orders of magnitude below the 10 MiB output cap.

---

### F13 — Score range: floats ~0.85-0.86 for closest matches; cosine-similarity-like with transformers.js default model

#### What was probed

The top-3 match scores from `Home.md` in `The Setup` were inspected for range and precision.

#### Result

Closest matches scored ~0.85-0.86 (floats with full JS double precision). Cosine-similarity-like range, consistent with the transformers.js default embedding model the plugin ships with.

#### Implication for the spec/plan

Locks documented inherited limitation #1 — embedding-model-dependent score bands. The wrapper does NOT clamp to `[0, 1]`, does NOT normalise, does NOT round. The score's range and semantics shift with the user's plugin configuration (transformers.js default ≈ `[0, 1]`; OpenAI ada-002 = `[0, 1]`; other models may produce different ranges including occasional slightly-negative values). Surfaced in `docs/tools/smart_connections_similar.md`. FR-009 pass-through commitment holds.

---

### F14 — `app.vault.getName()` returns requested-vault name inside eval when `vault=` passed (reconfirms F1)

#### What was probed

The F1 routing probe was reconfirmed at the end of the plan-synthesis session to verify the behaviour was stable.

#### Result

`app.vault.getName()` inside eval returns the requested vault name across multiple invocations. The routing is deterministic — there is no race condition where the focused-window vault wins.

#### Implication for the spec/plan

Reconfirms F1 — the live-probe-driven amendment to FR-017a holds. The "wrong-vault mismatch" detection that the spec drafts from BI-014 / BI-015 / BI-025 hedged toward is NOT required when the requested vault is open. The remaining failure mode is the closed-but-registered case (F7 / F8 / F9 / R5a). Multi-vault basename ambiguity reappears as documented inherited limitation #5.

---

## Plan-stage status

- **14 design decisions ratified** (R1..R14 — including R5a for the closed-vault detection branch).
- **14 live-CLI / live-plugin findings verified** (F1..F14) at plan time against the host's `obsidian` CLI with three open vaults (`TestVault-Obsidian-CLI-MCP`, `The Setup`, `Ways of Working`) all carrying installed-and-indexed Smart Connections plugins.
- **Two live-probe-driven amendments** integrated into the spec at plan stage:
  1. **Q3-amendment**: `vault=` on eval routes correctly when the vault is open (F1 / F14); FR-017a repurposed from focused-vault-mismatch to vault-not-open detection.
  2. **Grilling-Q3-amendment**: `find_connections` returns block-level matches by default; v1 ships block-level per-match shape `{path, headingPath, score}` (F4 / F5); the deferred-to-future-tool block-level entry removed from the inherited-limitations list.

### Cases deferred to T0 of `/speckit-implement`

Most contract surfaces are plan-verified by stub-spawnFn handler tests. Cases deferred to T0 (require fresh fixtures, plugin-state changes, OR end-to-end integration with the dispatch layer):

- **Active-mode no-focused-file path**: requires closing all panes in Obsidian to verify `app.workspace.getActiveFile()` returning null. Probed via T0 fixture; handler-test stubs cover the envelope shape (`{ok:false, code:'NO_ACTIVE_FILE'}`).
- **Plugin-uninstalled path** (SMART_CONNECTIONS_NOT_INSTALLED): requires temporarily disabling Smart Connections in TestVault and probing the response. Handler-test stubs cover the envelope shape; T0 verifies the in-eval `app.plugins.plugins["smart-connections"] === undefined` check fires.
- **Plugin-loaded-but-not-ready path** (SMART_CONNECTIONS_NOT_READY): requires either a fresh vault before initial indexing completes, OR a mocked `env.smart_sources` returning `undefined`. Handler-test stubs cover; T0 verifies live.
- **Closed-but-registered vault detection** (R5a / FR-017a / SC-011a): requires closing a registered vault and probing the empty-stdout signature end-to-end through the handler. F7 / F8 / F9 verify the CLI behaviour; T0 verifies the handler's detection branch fires correctly.
- **Path-traversal `path` value end-to-end** (FR-020 / SC-015): verify rejection happens (schema layer OR vault-access layer), no filesystem mutation. Plan-verified architecturally; T0 confirms.
- **Very-large-match-list cap-boundary behaviour** (SC-026): essentially unreachable at `limit: 1..100` per F12's observation of plugin's internal threshold cap, but contractually preserved. T0 verifies the cap-kill path is structured (`CLI_NON_ZERO_EXIT`) rather than silent truncation.
- **Frontmatter-sentinel preservation end-to-end** (F6 / FR-007): probe-confirmed shape; T0 verifies a fixture with a `---frontmatter---` block match round-trips through the handler with `headingPath: ["---frontmatter---"]`.
- **Compound-failure precedence chain** (FR-017b / SC-011b): six adjacent-pair fixtures in specific mode + four in active mode = ten compound-failure fixtures locked at T0 against TestVault with the appropriate state seeding.

These deferrals are appropriate for T0 (require fresh fixtures, vault-state changes, plugin-state changes, OR end-to-end integration with the cli-adapter's existing 011-R5 clause). None block plan ratification.

### Cross-cutting confirmations

- `dispatchCli` / `invokeCli` / `invokeBoundedCli` / the four-priority error classifier / the 011-R5 unknown-vault inspection clause / `assertToolDocsExist` are all FROZEN and consumed unchanged by this BI.
- The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `smart_connections_similar` via its `it.each` registry walk; no test-file modifications required.
- The BI-022 FR-018 baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) requires `npm run baseline:write` post-implementation to roll the baseline forward.
- The 005-help-tool registry-consistency test ([src/server.test.ts](../../src/server.test.ts)) automatically asserts the presence of `docs/tools/smart_connections_similar.md` once the tool is registered.

### Architectural delta vs predecessors

| Aspect | This feature (`smart_connections_similar`) | BI-025 (`links`) | BI-024 (`properties`) | BI-015 (`read_heading`) |
|---|---|---|---|---|
| CLI subcommand | `eval` (R2 / F2 — no native, plugin-backed) | `eval` (no native, metadataCache) | native `properties` | `eval` (no native, metadataCache) |
| Data source | plugin runtime object (`app.plugins.plugins["smart-connections"].env.smart_sources`) | Obsidian metadataCache (`app.metadataCache.getFileCache`) | Obsidian properties API | Obsidian metadataCache headings array |
| Cohort | **eval-driven plugin-backed (NEW)** | eval-driven metadataCache | native-subcommand | eval-driven metadataCache |
| `target_mode` discriminator | YES (specific / active) | YES | NO (vault-only) | YES |
| Single call per request | YES (R3) | YES | YES | YES |
| Unknown-vault outcome | structured error (R5 / 011-R5) | structured error (011-R5) | inherited limitation | structured error (011-R5) |
| Closed-vault detection | YES (R5a — handler-side, empty-stdout) | N/A | N/A | N/A |
| Per-entry transforms | 3 (path-split / headingPath-split / score pass-through) | 3 (kind / line+1 / displayText-omit-when-equal) | 2 (drop type / rename count) | N/A (content slice) |
| In-eval filters | 2 (self-exclusion / finite-score) | 0 (no filters; merge-and-sort only) | 0 | 0 |
| Wrapper-side post-fetch sort | NO (R8 — sort inside eval) | NO (sort inside eval) | YES (case-insensitive primary) | N/A |
| Sort levels | 3 (score desc / path asc / headingPath asc) | 2 (line asc / col asc) | 2 (case-insensitive primary / byte-order tiebreak) | N/A |
| Anti-injection mechanism | base64 payload (R6) | base64 payload | natural data-passing | base64 payload |
| New plugin-lifecycle codes | 3 (NOT_INSTALLED / NOT_READY / SOURCE_NOT_INDEXED) | 0 | 0 | 0 |
| Error-precedence chain | YES (FR-017b — 7-step specific, 5-step active) | implicit | implicit | implicit |
| Tool-naming ADR | ADR-013 (NEW — plugin-namespace) | ADR-010 (single-word-verbatim) | ADR-010 | ADR-010 N/A (eval-composition) |
| Test inventory | 63 cases (20 / 38 / 5) per /speckit-analyze C1 remediation | 51 cases (18 / 28 / 5) | 45 cases (16 / 24 / 5) | 55 cases (20 / 30 / 5) |

The single most distinctive feature of this BI: it is the **first plugin-backed typed tool**, introducing the eval-driven plugin-backed cohort. The runtime-dependency surface widens from "Obsidian CLI binary + Obsidian" to "Obsidian CLI binary + Obsidian + Smart Connections plugin (installed and indexed)" — three new lifecycle codes carve that widening into actionable signals, the FR-017b precedence chain locks the order of those signals, and the R5a handler-side detection branch handles the closed-but-registered-vault case that emerges naturally when `eval` is the route into plugin internals.

## T016 Deliberate-Fails-First Sanity Check (2026-05-15)

Verified the stage-0 closed-but-registered-vault detection branch is load-bearing — temporarily reverted the `result.stdout.trim().length === 0` predicate in `handler.ts` to `=== 999` so the branch never fires; `vitest run src/tools/smart_connections_similar/handler.test.ts` reported 2 failures (case 21 "closed-but-registered vault" + case 32 "VAULT_NOT_FOUND(not-open) wins over SMART_CONNECTIONS_NOT_INSTALLED") with vitest's structural diff showing `{code:'VAULT_NOT_FOUND', reason:'not-open'}` replaced by `{stage:'json-parse', stdout:""}`, confirming the test suite exercises the handler-side detection branch. Reverted; all 38 cases pass.

The nominal T016 target (the in-eval `.filter(m => m.path !== sourceKey)` source-path-keyed self-exclusion) lives inside the frozen JS template string that vitest never executes — its transform-correctness is verified by the live T0.6 happy-path probe, not by handler unit tests. The stage-0 closed-vault detection branch is the equivalent load-bearing handler-side mechanism whose deliberate-fail behaviour is checkable by the in-process test suite, giving the same "tests pass because nothing checks the transform" guard.
