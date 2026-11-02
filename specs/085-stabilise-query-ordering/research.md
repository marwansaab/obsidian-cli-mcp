# Research: Stabilise query ordering

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **HEAD at research**: `2734e99`

All findings come from CodeGraph (`codegraph_explore`) and direct reads at plan time. No `NEEDS CLARIFICATION` remains. The candidate-set size was settled in the 2026-11-02 clarification session (Option A), and `smart_connections_similar` was brought into scope by the analysis remediation (spec Clarifications; F5, D5).

## Findings

### F1: The plugin cuts the list to the agent's limit before the tool sorts

`src/tools/smart_connections_query/_template.ts:12` calls the plugin as follows:

```js
env.smart_sources.lookup({hypotheticals:[a.query],filter:{limit:a.limit},collection:'smart_blocks'})
```

Here `a.limit` is the agent's `limit`, which the handler passes in the payload (`handler.ts:28-32`). The documented three-level sort runs on what the plugin returns (lines 25–30), followed by `.slice(0,a.limit)` (line 31). That slice is a no-op whenever the plugin honours `filter.limit`. The plugin's own top-`limit` cut therefore decides which equal-score blocks make it onto the page, and the documented tie-break only reorders the survivors. This is the spec's defect.

### F2: The handler's tests cannot see the template's logic

`handler.test.ts` stubs the spawn and returns an envelope that has already been sorted. Its "sort" cases (`:149-230`) assert only that the envelope is passed through. `.memory/refactor-decisions.md` §31 records this gap for the eval templates generally. It names the in-process remedy: run `composeEvalCode(JS_TEMPLATE, payload)` under `node:vm` `runInNewContext` with a stub `app`, as `src/tools/links/_template.test.ts` and `src/tools/create_base/_template.test.ts` already do. `smart_connections_query` has no `_template.test.ts` today.

### F3: Where the 100 lives

The maximum limit appears only as the literal `.max(100)` in `smartConnectionsQueryInputSchema` (`schema.ts:29`). FR-002 needs the template to ask for that same number. Every other `_template.ts` imports only from `../_shared.js`, so a template importing from its own `schema.ts` would be a first for the codebase. It is a same-directory, one-directional edge: `schema.ts` imports only `zod` and `../_vault-field.js`. `schema.ts` already exports a cap constant the same way: `MAX_QUERY_LENGTH`, imported by `index.ts`.

### F4: The published description and the help page state the sort but not where the limit applies

- `SMART_CONNECTIONS_QUERY_DESCRIPTION` (`index.ts:18`) ends its per-match paragraph with "Sort: primary score descending, secondary path byte-ascending, tertiary headingPath.join('#') byte-ascending." Line 16 says `limit` "caps the matches list AND the count".
- `docs/tools/smart_connections_query.md:73` states the same sort order. The page's "Inherited limitations" list (`:162-172`) has eight items.

Changing the description moves that tool's `descriptionFingerprint` in `src/tools/_register-baseline.json`. The constitution (Technical Standards, fingerprint gate) requires a deliberate `npm run baseline:write` in the same PR. The input schema is not changed: `.max(MAX_LIMIT)` emits the same JSON Schema as `.max(100)`, so `schemaFingerprint` must not move.

### F5: `smart_connections_similar` shares the defect (brought into scope)

`src/tools/smart_connections_similar/_template.ts:29` calls `src.find_connections({limit:a.limit})`. It then maps, drops non-finite scores, drops the source note's own blocks (`m.path!==sourceKey`), sorts with the same comparator and slices (`:30-46`). It has the same limit-before-tie-break shape. Its schema has the same `limit` contract (`schema.ts:8-14`: `.max(100)`, `.default(20)`). Its description (`index.ts:13`, `:17`) and help page (`docs/tools/smart_connections_similar.md:79`) say the limit "mirrors the plugin's `find_connections({limit})` parameter".

The spec's input said to verify this separately. Per BI-0167's out-of-scope note, a shared slice-before-sort step is fixed together, and the analysis remediation recorded that decision in the spec's Clarifications. `handler.ts` passes `limit: input.limit` in the payload (`:36`); that stays unchanged, as in `smart_connections_query`.

### F6: The live test vault cannot exercise either tool

`.memory/test-execution-instructions.md` says `TestVault-Obsidian-CLI-MCP` has no plugins, so Smart Connections is absent there. The in-process vm test is the proof (F2). An optional read-only live check against a vault that already has Smart Connections indexed is described in [quickstart.md](quickstart.md) §3. It writes nothing.

## Decisions

### D1: Fix the candidate count at `MAX_LIMIT` (100) in the template

- **Decision**:
  - Export `MAX_LIMIT = 100` from `schema.ts`.
  - Use it in `.max(MAX_LIMIT)`.
  - In `_template.ts`, interpolate it into the lookup call as `filter:{limit:${MAX_LIMIT}}`, in the same way `${B64_PAYLOAD_DECODE_EXPR}` is interpolated today.
  - The sort and the trailing `.slice(0,a.limit)` stay as they are. The slice now does the cut that the plugin used to do.
- **Rationale**: this is clarification Option A. With one fixed candidate list, sorted in full, every limit from 1 to 100 is a leading slice of the same list (FR-001 to FR-004). Interpolating the constant keeps a single source of truth for "100". The handler, its payload and the handler tests do not change.
- **Alternatives considered**:
  - A literal `100` in the template, pinned by a test against the schema max. Rejected: it leaves two sources of truth that a test has to keep in step.
  - A new payload field set by the handler, such as `candidates: 100`. Rejected: it changes the payload that `handler.test.ts:64,93` asserts, with no caller-visible gain.
  - The full plugin set, with no `filter.limit`. Rejected in clarification: the plugin's default when no limit is given has not been probed.
  - More than 100 candidates. Rejected in clarification: a bigger request on every call.

### D2: New `src/tools/smart_connections_query/_template.test.ts` (vm)

- **Decision**: render the template with `composeEvalCode`, then run it under `node:vm` `runInNewContext`. The stub `app` holds a fake `smart-connections` plugin whose `lookup` does three things:
  - records the request it was given;
  - returns its fixture in **plugin order**, with equal-score items deliberately in reverse path order;
  - truncates that list to `filter.limit`, as the real plugin does.

  The contract rows T1–T9 run against this stub ([contracts/ordering-contract.md](contracts/ordering-contract.md)). Before the fix, T1, T2, T4 and T5 fail and T3 passes. After the fix, every row passes.
- **Rationale**: Principle II and refactor-decisions §31. This is the only in-process way to pin logic that runs inside Obsidian.
- **Alternatives considered**: handler-level tests only. Rejected: they assert the stub, not the template (F2).

### D3: Published text

- **Decision**:
  - **Description** (`index.ts`): append one sentence after the "Sort:" sentence: "`limit` is applied after this sort, to a fixed list of up to 100 candidates, so a smaller limit always returns a leading slice of a larger one."
  - **Help page**:
    - add the same guarantee under the sort-order line (`:73`);
    - add item 9 to Inherited limitations: equal-score matches that straddle the plugin's 100th candidate are chosen by the plugin.
  - **Baseline**: regenerate with `npm run baseline:write`. Among the fingerprints, only the `descriptionFingerprint` of `smart_connections_query` and of `smart_connections_similar` (D5) may change. The generator also rewrites the envelope metadata `generatedFromBranch` and `generatedAt`, which is expected.
- **Rationale**: FR-009, and the ADR-040 split between descriptions and help. The edge case is long-reference material, so it goes in the help page, not the description.

### D4: CHANGELOG and docs-as-code

- **Decision**:
  - Add an `[Unreleased]` spec line plus a `Fixed` entry to `CHANGELOG.md` covering both tools.
  - `.docs-as-code/` pages describing either tool's ordering are updated by `/speckit-docs-as-code <n>` after review, per the PR lifecycle in `CLAUDE.md`.

### D5: Apply D1 to D3 to `smart_connections_similar`

- **Decision**:
  - **Constant**: export a `MAX_LIMIT = 100` of its own from `src/tools/smart_connections_similar/schema.ts`, and use it in `.max(MAX_LIMIT)`. The `.describe(...)` text stays byte-identical.
  - **Template**: in `_template.ts`, change `src.find_connections({limit:a.limit})` to `src.find_connections({limit:${MAX_LIMIT}})`, importing `MAX_LIMIT` from `./schema.js`. The map, the non-finite and self-exclusion filters, the sort and `.slice(0,a.limit)` stay byte-identical.
  - **Tests**: new `src/tools/smart_connections_similar/_template.test.ts` (vm), covering contract rows T10–T15. Its stub `app` resolves the source note by `path`; its `env.smart_sources.items[sourceKey].find_connections` records the request, returns its fixture in plugin order (including some of the source note's own blocks), and truncates to `limit`.
  - **Description**: in `index.ts`, append one sentence after the "Sort order:" paragraph (line 17).
  - **Help page**: rewrite the `limit` bullet (`:79`) and add the 100-candidate edge under "Documented inherited limitations".
  - **Baseline**: its `descriptionFingerprint` moves in the same regeneration as `smart_connections_query`'s.
- **Rationale**: the same defect needs the same fix. Each tool keeps its own constant because Principle I forbids a tool → tool import. A shared constant in `_shared.ts` would put one tool family's limit in a module every tool imports, for two callers.
- **Alternatives considered**: a separate spec and backlog item for this tool. Rejected per BI-0167's out-of-scope note, as recorded in the spec's Clarifications.
- **Amendment (PR #116 code-quality review, 2026-11-02)**: the per-tool constant is replaced by one cohort leaf module, `src/tools/_smart-connections.ts`. It exports `MAX_LIMIT` and `SORT_SLICE_AND_EMIT`, the template tail from `.sort(` to the envelope, which was byte-identical in both templates. The rationale above rejected `_shared.ts`, which every tool imports; a leaf imported only by the two Smart Connections tools does not have that cost, and like `_base-path.ts` it is a downward edge, not a tool → tool one. Both rendered `JS_TEMPLATE` strings, both descriptions and both `limit` descriptions were checked byte-identical before and after, and the FR-018 baseline gate passed without `npm run baseline:write`.

## Follow-ups (out of scope)

None. The one candidate, `smart_connections_similar` (F5), is now in scope (D5).
