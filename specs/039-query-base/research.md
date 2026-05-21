# Research: Query Base (Phase 0)

**Branch**: `039-query-base` | **Date**: 2026-05-20
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the Technical Context unknowns flagged in plan.md and pins the upstream contract that the wrapper's design depends on. Each finding records the **Decision** taken, the **Rationale**, and the **Alternatives Considered**, per the speckit research convention.

## R1 — Upstream `obsidian base:query` subcommand surface

**Decision**: Wrap `obsidian base:query path=<vault-rel> view=<name> format=json` via the existing `invokeCli` adapter; treat the upstream as the system-of-record for view evaluation, row emission, and column-set selection. The wrapper performs input validation, response envelope assembly, error classification, and the deterministic post-sort.

**Rationale**: Probing the live `obsidian` CLI binary at planning time (2026-05-20) confirmed `base:query` is a first-class subcommand in the upstream Obsidian Integrated CLI. The `obsidian --help` output enumerates the subcommand's exact parameters:

```text
base:query            Query a base and return results
  file=<name>         - Base file name
  path=<path>         - Base file path
  view=<name>         - View name to query
  format=json|csv|tsv|md|paths  - Output format (default: json)
```

The subcommand is anchored in the same parameter family the existing typed-tool cohort already wraps (`file=`, `path=`, `vault=` semantics); the format default is `json`, matching the spec's FR-002 envelope-shape contract. No upstream subcommand surface gap blocks the wrapper.

**Alternatives Considered**:
- **`obsidian eval` with a JS template** (the pattern used by `pattern_search`, `context_search`, `smart_connections_similar`): rejected. `eval` is the right tool when no native CLI subcommand exists for the operation; `base:query` ships natively, so wrapping it directly is the ADR-010 mechanical path. Using `eval` would also break the ADR-010 mapping (no `base:query` source token to derive `query_base` from), force the wrapper to authour the row-emission logic in JavaScript inside the eval template, and re-implement what upstream already does.
- **Probe `obsidian` repeatedly with `format=tsv` or `format=csv` and re-parse**: rejected. The spec contract requires JSON shape; converting tabular text back to JSON adds escaping ambiguity and breaks the no-parser-per-caller value proposition.

## R2 — Upstream row-emission shape (the `path` reservation evidence)

**Decision**: Trust upstream to emit rows as `[{ path: string, ...viewDefinedColumns }, ...]` when the view selects `file.path` (or its equivalents); wrapper synthesises `path` from row metadata when the view does NOT select `file.path`, per the spec's FR-002a contract. The wrapper validates `path`'s presence on every row before assembling the envelope; missing `path` after both upstream emission AND synthesis attempts is a wrapper-internal invariant violation surfaced as `CLI_REPORTED_ERROR` with `details.stage: "row-locator-synthesis"`.

**Rationale**: BI-0048's 2026-05-18 live probe (cited verbatim in the Session 2026-05-20 clarifications, Q1 of pass 1) locked the upstream emission shape as `[{ "path": "...", "id": "..." }]` for a `file.path`-selecting view. The dotted-namespace upstream column `file.path` surfaces in the row JSON as the last-segment key `path`. This empirical observation has two consequences for the wrapper:

1. **`path` as the reserved row-locator field is well-grounded** — upstream's natural emission shape AND the cohort's ADR-003 `path=` locator convention agree on the same key. No wrapper renaming needed; the upstream's emitted shape IS the contract.
2. **Synthesis path is bounded** — when a view's column selection omits `file.path`, the wrapper still has the row's underlying note binding available from upstream's emission metadata. The synthesis is conceptually a single-field lookup, not value invention; Constitution Principle IV (no silent fallbacks) holds.

**Alternatives Considered**:
- **Reserve `id` alongside `path`** (the Session-2 Q6 option B): rejected per the Session-2 Q6 clarification — `id`'s universality, semantic stability, and synthesis cost all fail relative to `path`. The BI-0048 probe's `id` emission is descriptive of one vault's view-author choice (the Type ID Index Base's deliberate selection of an `id`-producing column under this vault's frontmatter convention), not generalisable.
- **Wrapper-side full last-segment normalization across all dotted columns** (force `note.name` → `name`, `customnamespace.foo` → `foo`): rejected. The wrapper does NOT transform non-`path` keys (FR-002d); upstream's native emission scheme governs. If upstream emits a dotted key for a non-`file.*` namespace, the wrapper surfaces it dotted; that is correct passthrough behaviour.

## R3 — Truncation cap and `total_rows` surfacing

**Decision**: Wrapper-side cap at 1000 rows. The wrapper invokes upstream WITHOUT any `--limit` flag (upstream's `base:query` help output shows no such flag), reads upstream's full row array from stdout, and applies the cap in the post-process phase. When `rows.length > 1000`, the wrapper sets `truncated: true` and `total_rows = upstreamRows.length` (the wrapper KNOWS the full count because it read the full array before capping); the wrapper then slices to the first 1000 rows in the FR-003 deterministic order. When `rows.length <= 1000`, `truncated: false` and `total_rows` is omitted (FR-013).

**Rationale**: Two design constraints converge on this approach:

1. **Upstream offers no native limit flag** (verified against `obsidian --help` for `base:query`): the wrapper cannot push the cap down to upstream, so it must apply the cap client-side after reading the full result.
2. **`total_rows` accuracy** (FR-013): the wrapper must report the upstream's full match count when truncated. Since the wrapper holds the full array briefly, the count is exactly `upstreamRows.length` — no need to re-invoke upstream with a separate count query.

This approach incurs the cost of reading and parsing the full upstream array even for views that would have produced 10,000+ rows; mitigated by the `TYPED_TOOL_OUTPUT_CAP_BYTES` (10 MiB) hard cap at the cli-adapter layer, which protects against truly pathological row sets that would exceed memory and would route via `CLI_REPORTED_ERROR` with `details.code: "OUTPUT_CAP_EXCEEDED"` (existing cli-adapter behaviour, no new error code).

**Alternatives Considered**:
- **Push `--limit=1000` into upstream invocation**: rejected. Flag does not exist in the `base:query` subcommand surface (verified empirically). Could be filed as an upstream feature request, but the wrapper cannot wait on it.
- **Stream upstream stdout incrementally and stop at 1000 rows**: rejected. The `invokeCli` adapter buffers the full stdout up to `TYPED_TOOL_OUTPUT_CAP_BYTES` before returning; streaming JSON parse would require new cli-adapter machinery (new buffered-stream interface, new memory-boundary policy, new test surface). Out of scope for v1; the buffered-read-then-cap approach is acceptably bounded by the existing 10 MiB stdout cap.
- **Surface `total_rows` only as best-effort (FR-013 sub-option D from the Session-1 Q4 clarification)**: rejected at clarify time. The user locked `total_rows` as required-when-truncated; the wrapper-side full-array-read implementation makes this contract exact, not best-effort.

## R4 — `BASE_MALFORMED` sub-state detection strategy

**Decision**: Three-stage detection ladder. (1) **Pre-flight existence check** — `fs.stat` on the resolved canonical `base_path` distinguishes `BASE_NOT_FOUND` (ENOENT) from "file exists, proceed". (2) **Pre-flight zero-byte check** — if the file exists but has zero bytes, surface `BASE_MALFORMED` with `details.reason: "empty"` without invoking upstream. (3) **Upstream invocation + stderr classification** — invoke `obsidian base:query`; on non-zero exit or recognized error patterns in stderr, classify into `details.reason: "invalid-yaml"` / `"missing-required-key"` / `"unsupported-schema-version"` / `"unknown"` via a pattern-match table populated from live probes of upstream's actual error messages.

**Rationale**: The spec's FR-005b contract is wrapper-facing; it does not commit to which upstream error message maps to which sub-reason. The wrapper takes the obligation to map. Pre-flight checks for existence and zero-byte fire before any subprocess spawn (cheap; bounded), catching the two clearest sub-states. The remaining sub-reasons require classifying upstream's stderr / stdout output, which is the existing cli-adapter pattern (Principle IV — explicit propagation rather than swallowing the upstream message).

The classification table for stage 3 will be populated during /speckit-implement via T0 live probes against deliberately-malformed `.base` fixtures (empty file shall already be caught in stage 2; invalid-yaml fixture; missing-views-key fixture; future-version-marker fixture). When upstream's stderr does not match any known pattern, the wrapper surfaces `details.reason: "unknown"` with the upstream message verbatim in `details.message` (Principle IV — preserve the chain of custody for failures).

**Alternatives Considered**:
- **Wrapper parses the `.base` file's YAML client-side and classifies sub-states without invoking upstream**: rejected. YAML parsing is in-tree heavy (would pull a YAML dependency or hand-roll); the wrapper would duplicate Bases-schema-validation logic that upstream already performs; drift between wrapper's understanding of the schema and upstream's would silently break the contract. Better: let upstream be the authority and parse its error output.
- **Single `BASE_MALFORMED` `details.reason: "unknown"` for every structurally-broken case** (don't classify): rejected at the Session-2 Q10 clarification. The caller's remediation paths differ across sub-states (a YAML-syntax error vs. a schema-version-mismatch needs different fixes); giving the agent a coarse "something is wrong" answer doesn't satisfy the agent-actionable-error principle.
- **Pre-flight the `.base` file's YAML existence and key shape WITHOUT invoking upstream when those checks pass**: rejected. The wrapper would have to maintain a separate model of the Bases schema; any future Bases plugin version that adds a required key would silently mis-classify until the wrapper catches up. Better: pre-flight only the cheap unambiguous checks (exists, zero-byte) and let upstream catch everything else.

## R5 — View-name matching: where in the stack the case-sensitive check fires

**Decision**: View-name matching fires upstream-side. The wrapper passes `view=<name>` verbatim to `obsidian base:query`; when upstream reports "view not found" (via non-zero exit or a recognized stderr pattern), the wrapper classifies as `CLI_REPORTED_ERROR` + `details.code: "VIEW_NOT_FOUND"` with the offending `view_name` and the resolved base-file path echoed back in `details`. The wrapper does NOT pre-parse the `.base` file's YAML to enumerate views.

**Rationale**: Per R4's argument against client-side YAML parsing, view enumeration is upstream's responsibility. The exact-case-sensitive matching contract (FR-005a) is enforced de facto by passing the caller's `view_name` verbatim to upstream — upstream's matching semantics ARE the contract. Empirical confirmation is captured during /speckit-implement via T0 probes (case-mismatch fixture, whitespace-padded fixture); if upstream turns out to be case-insensitive or to trim whitespace, the wrapper layers a client-side post-check to restore the FR-005a exact-match contract (compare the caller's `view_name` against upstream's emitted view-name in any pre-success metadata, surfacing VIEW_NOT_FOUND if they differ).

**Alternatives Considered**:
- **Wrapper pre-parses `.base` YAML to enumerate views and rejects mis-cased view names before invoking upstream**: rejected for the same reasons as R4's YAML-parse rejection — schema drift risk, duplication of upstream logic, additional YAML dependency.
- **Trust upstream's case sensitivity blindly**: rejected at probe time if upstream is permissive. The wrapper owns the FR-005a contract, so when upstream's behaviour diverges, the wrapper layers a post-check; the contract is the wrapper's, not upstream's.

## R6 — Vault selection and resolution

**Decision**: Reuse the existing read-side cohort's vault contract — single optional `vault?: string` field on the input schema, focused-vault default when absent, resolution via the project's lazy vault registry (the same `invokeCli`-level path that `read_note` / `read_property` / `pattern_search` already exercise). The wrapper supplies `vault: input.vault` to `invokeCli`'s top-level field; the cli-adapter's existing `Vault not found.` reclassifier surfaces unknown vaults as `CLI_REPORTED_ERROR` per FR-009. Closed-but-registered vault detection uses the shared `detectIfClosed` helper from `src/tools/_eval-vault-closed-detection/` (already imported by `pattern_search` and the search cohort) IF the upstream returns an empty stdout for a registered-but-closed vault (probe at implement time to confirm whether this detection path is needed for the non-`eval` `base:query` subcommand).

**Rationale**: Zero divergence from cohort. The vault resolution machinery is already centralised; reusing it costs nothing and inherits all the cohort's test coverage. The closed-but-registered detection is only required if upstream silently returns empty data for closed vaults (the `eval`-based cohort's known behaviour); since `base:query` is a non-`eval` subcommand, its closed-vault behaviour may differ — probe at T0.

**Alternatives Considered**:
- **Add a `base_path`-aware vault inference** (if the supplied vault-relative path is unambiguous across known vaults, infer the vault): rejected. Cohort uniformity matters more than caller convenience for one tool; the agent should declare its vault intent explicitly.
- **Skip the closed-but-registered detection entirely**: deferred to T0 — depends on upstream behaviour for non-`eval` subcommands against a closed-but-registered vault. If upstream reports closure cleanly, no extra detection is needed; if it returns empty data silently (the eval-cohort failure mode), the shared helper is wired in.

## R7 — Source-tree layout and registration wiring

**Decision**: New module at `src/tools/query_base/{index, schema, handler}.ts` plus three co-located `*.test.ts` files. Wiring into the server boot path is a one-line import + one-line factory call at `src/server.ts` (alongside the 26 existing `createXTool` imports + factory calls — cohort precedent from BI-038 / pattern_search / read_property). A separate one-entry append to `src/tools/_register-baseline.json` updates the registry-stability baseline fixture per BI-031 / FR-018. No edits to `src/tools/_register.ts` (the centralised factory), `src/tools/_registration-stub.ts` (the test-fixture SpawnLike helper), `src/cli-adapter/`, or `src/errors.ts`.

**Rationale**: This is the cohort-canonical pattern for adding a new typed tool. Sixteen prior tools followed it (the streak count post-this-BI). The centralised `registerTool` factory consumes the zod input schema directly, publishes it via `zodToJsonSchema`, and wires the `handler` into the MCP `Server.tool` slot; the new tool inherits the full publication / dispatch pipeline by following the same pattern as `pattern_search` / `search` / `find_and_replace`.

**Alternatives Considered**:
- **Hand-author the MCP server tool registration in `server.ts`**: rejected — bypasses ADR-006 (centralised registration). The centralised factory IS the pattern.
- **Add a new shared cli-adapter helper for Bases-family tools** (since `query_base`, `views_base`, `create_base` all share a base file targeting pattern): deferred. With only one Bases-family tool shipping in this BI, the abstraction is premature. If a second Bases-family tool lands, that's the right time to extract a shared helper.

## R8 — Test fixture strategy

**Decision**: Use vitest's `vi.fn()` spawn mocks for unit tests — return canned stdout / stderr / exit-code payloads modelled on real upstream emissions. Live-CLI fixtures are NOT used in vitest tests per the project's test-execution-instructions.md (vitest is unit-only; live-CLI probes happen during /speckit-implement T0 probes, before the unit tests are authored, and the probe data populates the canned response fixtures).

**Rationale**: Per the project's test-scope memory: "this repo covers vitest unit tests only; manual/integration TC-XXX cases live elsewhere". The mock-based pattern is established in every sibling tool's `handler.test.ts`. T0 probes against the authorised test vault produce the canned fixtures; the handler tests assert the wrapper's behaviour against those fixtures, not against a live CLI.

**Alternatives Considered**:
- **Run live-CLI tests inside vitest against an authorised test vault**: rejected — violates the test-scope memory and would pollute the test vault on every test run. The unit/integration split exists for a reason.
- **Property-based / generative fixtures via fast-check**: out of scope for v1. The error-state and column-shape surface is bounded enough that explicit fixtures cover it.

## R9 — Field-name choice in the wrapper's Zod schema

**Decision**: Use `base_path` (snake_case, matches the spec's prose) for the vault-relative `.base` file path, and `view_name` (snake_case, matches the spec) for the view name. Both diverge from upstream's CLI arg names (`path=` and `view=` respectively); the divergence is intentional and follows cohort precedent.

**Rationale**: The cohort does NOT mechanically mirror upstream CLI arg names in Zod schema field names. Counter-examples: `read_property`'s input schema uses `name` for the property name (whereas upstream uses `property=`); `pattern_search` introduces `pattern` (no upstream equivalent of the same name). The cohort convention is to choose Zod field names that are agent-readable, snake_case-cohort-consistent, and unambiguous in the published `inputSchema` description text. `base_path` is unambiguous (vs. just `path`, which could be misread as "path inside the .base file"); `view_name` is unambiguous (vs. just `view`, which could be misread as a view object). The wrapper performs an internal rename inside `handler.ts` (`input.base_path` → `path=` on the CLI argv; `input.view_name` → `view=`).

**Alternatives Considered**:
- **Use `path` and `view` for direct CLI-arg parity**: rejected. `path` collides with the response envelope's reserved `row.path` field name — agents reading documentation would confuse the input parameter with the row's source-note locator. `view` is too unspecific; the agent's mental model is "I'm passing the name of a view", not "I'm passing a view".
- **Use `file` and `view`** (since upstream supports both `file=` and `path=`): rejected. The spec exclusively talks about `.base` file path; supporting upstream's fuzzy `file=` lookup adds an axis the spec doesn't lock and would force a clarification.

## R10 — Open probes deferred to /speckit-implement T0

The following items are deliberately deferred to /speckit-implement Phase T0 because they require live `obsidian` CLI invocation against the authorised test vault and cannot be settled in this planning phase:

1. **Exact upstream error-message wording for view-not-found, base-not-found, base-malformed (each sub-reason).** Drives the stderr-pattern-match table in R4 / R5.
2. **Upstream behaviour for a closed-but-registered vault on `base:query`** (does upstream exit non-zero with a clear message, or return empty stdout silently like the eval-cohort?). Drives whether R6's `detectIfClosed` helper is wired in.
3. **Upstream's emission shape for a view with no explicit sort.** Confirms whether the wrapper-applied `path`-asc baseline (FR-003) ever needs to absorb upstream churn or whether upstream is already path-asc by default for no-sort views.
4. **Upstream's behaviour for a view that selects user-defined dotted-namespace columns** (e.g., `customnamespace.foo`). Confirms whether the wrapper sees `customnamespace.foo` as the row-key (passthrough; expected per FR-002d) or `foo` (last-segment normalisation; would require schema accommodation).
5. **Upstream's behaviour for a `.base` file at a folder whose canonical resolution escapes the vault root via symlink.** Confirms the cli-adapter's existing `PATH_ESCAPES_VAULT` posture covers this case for `base:query`, or whether the wrapper needs an additional client-side `fs.realpath` check.

Each of these is a fixture-population probe, not a contract decision. The spec contract is already locked; T0 probes only confirm the implementation's behaviour against the contract.

## Summary table

| ID  | Decision | Anchor |
|-----|----------|--------|
| R1  | Wrap `obsidian base:query` directly via `invokeCli` | ADR-010 mechanical mapping |
| R2  | Trust upstream's `path` emission; synthesise when absent | BI-0048 probe; FR-002a |
| R3  | Wrapper-side 1000-row cap; full upstream read for `total_rows` | FR-013 |
| R4  | Three-stage `BASE_MALFORMED` detection (stat → zero-byte → upstream stderr classify) | FR-005b; ADR-015 |
| R5  | Upstream-side view matching; wrapper post-check for FR-005a exact-case | FR-005 / FR-005a |
| R6  | Cohort-uniform vault contract; reuse `detectIfClosed` if needed | FR-009; cohort |
| R7  | Per-surface module triplet; one-line registration-stub addition | Principle I; ADR-006 |
| R8  | Mock-based vitest unit tests; live probes during /speckit-implement T0 | Project test-scope memory |
| R9  | Snake_case Zod field names: `base_path`, `view_name` | Cohort precedent |
| R10 | Five live-probe items deferred to /speckit-implement T0 | Implementation phase |
