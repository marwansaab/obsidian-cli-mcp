---
description: "Task list for 024-list-properties — Vault-Wide Frontmatter Property Inventory"
---

# Tasks: Properties — Vault-Wide Frontmatter Property Inventory

**Input**: Design documents from [`/specs/024-list-properties/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT a separate red/green TDD loop; every implementation task lands with its co-located test cases in the same task. Total target: 45 tests across the new module (16 schema / 24 handler / 5 registration). The verify-fails-first sanity check is captured exactly once, manually, by S-deliberate-revert in T016 (parity with BI-023 precedent).

**Organization**: Tasks are grouped by user story per the project convention. The `properties` module is fundamentally a single atomic ship — Stories 1, 2, 3, 4 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 5 is the documentation layer. The `[USx]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md § Test inventory](data-model.md#test-inventory-45-cases) maps each test case to its source User Story.

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code):

- **R2 — native `properties` subcommand wrap (NOT eval)**: probed live 2026-05-13 (F1). `obsidian properties format=json` returns `[{name, type, count}]` directly — the wrapper's wire shape. NO eval composition, NO JS template, NO base64 payload. Architectural parity with `files` (BI-019) and `outline` (BI-023).
- **R3 — single-call architecture branched on `input.total`**: ONE `invokeCli` invocation per request. Default mode → `format=json` parameter only. Count-only mode → `total` flag only.
- **R7 — two upstream-to-wrapper transforms per entry**: DROP `type` field per FR-004 (type metadata out of scope), RENAME `count` → `noteCount` per FR-007 (avoids collision with outer envelope's `count`). Implemented as `array.map(({ name, count }) => ({ name, noteCount: count }))` — TypeScript destructure drops `type` implicitly.
- **R8 — wrapper-side post-fetch sort (LOAD-BEARING for FR-013)**: case-insensitive primary key with byte-order tiebreak. Drift-adjacent display (`Tags` next to `tags`) per the 2026-05-13 Q1 clarification. Wrapper-locked regardless of upstream version's sort behaviour.
- **R5 — vault routing limitation INHERITED**: probed live (F4). `vault=` is silently honoured-as-noop; focused vault is always used. The 011-R5 unknown-vault response-inspection clause does NOT fire for `properties` (no "Vault not found." string). Documented limitation; multi-vault users open the target vault before invoking. Parity with `files` (BI-019), `outline` (BI-023), `read_heading` (BI-015), `find_by_property` (BI-014). Spec FR-015 was amended at plan stage to defer-to-upstream pattern; T005 case 9 (Q-9 unknown-vault) verifies the inherited limitation.
- **R11 — cross-mode invariant holds by upstream construction**: probed live (F3). Upstream's `total` flag returns plain integer `73` matching `format=json` array length (73 entries) for the focused vault. Sum of per-property counts was 4159 (NOT what `total` returned). Q2 clarification's Option A (outer `count` = distinct property names) is confirmed by upstream behaviour; no wrapper-side recomputation required. The count-only handler is a single-stage integer parse.
- **R9 — empty-vault detection (deferred to T0)**: best-evidence assumption is that upstream returns `[]` JSON array (default mode) and `0` integer (count-only mode); both handled natively by the parse-and-map-and-sort chain. T0.1 verifies live; sentinel-detection branch is a planning contingency (parallel to BI-023 R9) — implemented only if T0.1 reveals a sentinel string.
- **Q1 / Q2 clarifications session 2026-05-13** (codified in spec.md): Q1 (sort order) → case-insensitive primary + byte-order tiebreak, wrapper-side post-fetch — drift-adjacent display per the user's drift-detection motivation. Q2 (`total: true` outer count semantic) → distinct property names (NOT sum of occurrences) — CONFIRMED by upstream per F3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers. Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read` / `delete` / `files` / `read_heading` / `read_property` / `set_property` / `rename` / `write_note` / `find_by_property` / `outline`). All paths are relative to the repo root. Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at `src/tools/properties/` (does NOT exist yet — created by T002–T004).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–023). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler against verified upstream behaviour for the cases deferred from plan stage (per [research.md § Plan-stage status](research.md#plan-stage-status)).

**Note on plan-stage coverage**: 14 architecture-locking findings (F1–F14) were verified live during plan stage on 2026-05-13 — see [research.md § Live-CLI findings](research.md#live-cli-findings-probed-2026-05-13-against-the-focused-vault-with-the-hosts-obsidian-cli). T001 below covers the 5 cases deferred to T0 because they require fixtures NOT seeded at plan stage AND a focused fixture vault.

- [X] T001 Live-CLI characterisation of the 5 deferred T0 cases. Run probes against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  - **(T0.1) Empty-vault behaviour (R9 verification)**: open Obsidian focused on TestVault-Obsidian-CLI-MCP (or a freshly-created bare vault with zero notes carrying frontmatter — e.g. seed only `Sandbox/no-frontmatter.md` containing just `# Body`, no `---` block). Probe: `obsidian properties vault=TestVault-Obsidian-CLI-MCP format=json` and `obsidian properties vault=TestVault-Obsidian-CLI-MCP total`. **Expected per R9**: default mode returns `[]` (with newline); count-only mode returns `0`. **TRIGGER**: if upstream emits a sentinel string (e.g. `No properties found.` or similar, parity with BI-023 F7), document the actual string in research.md and AMEND T004's handler.ts to add a sentinel-detection branch BEFORE the JSON.parse / integer-parse step (parallel to BI-023's `EMPTY_OUTLINE_SENTINEL`). Add a `EMPTY_INVENTORY_SENTINEL` constant if needed. Add the corresponding handler test case to T005 covering the sentinel. **Note**: if the test vault has even one note with frontmatter, this probe won't surface empty-vault behaviour — seed a dedicated empty vault OR temporarily remove all frontmatter from TestVault before probing (restore after).

  - **(T0.2) Body-content opacity + null-valued key + nested YAML end-to-end (F12 / FR-010 / FR-011 / FR-012 verification — extended per /speckit-analyze C1 remediation 2026-05-13)**: seed `Sandbox/properties-T0-bodyopacity.md` with this exact content (fixture extended at remediation to cover FR-021 cases 5 + 6 + 7 in a single probe):
    ```
    ---
    realkey: yes
    nullkey:
    nested:
      child: foo
      grandchild:
        deep: bar
    ---
    # Body

    ```yaml
    fakekey_fenced: nope
    ```

        indented_fake_key: nope
    ```
    Open TestVault as focused. Probe: `obsidian properties vault=TestVault-Obsidian-CLI-MCP format=json` and confirm:
    - **FR-010 (body opacity)**: `realkey` appears AND `fakekey_fenced` / `indented_fake_key` do NOT.
    - **FR-011 (null-valued key inclusion)**: `nullkey` appears in the listing with `noteCount: 1` — presence of the key in frontmatter is the inclusion criterion, NOT the value's content. Document the actual upstream `count` value AND whether upstream emits `nullkey` at all (best-evidence expectation per the BI-023 precedent is yes — Obsidian's metadata cache enumerates frontmatter keys regardless of value semantics).
    - **FR-012 (top-level YAML key only)**: `nested` appears with `noteCount: 1` AND `child` / `grandchild` / `deep` do NOT — counting is at the top-level YAML key per the spec. Document the actual upstream behaviour.

    **Expected per F12 / BI-023 precedent + FR-011 / FR-012 inclusion-via-defer-to-upstream**: upstream's Obsidian metadata cache separates frontmatter from body content AND emits one entry per top-level YAML key with appropriate inclusion semantics for null values. Inventory contents: `realkey`, `nullkey`, `nested` — three entries, each `noteCount: 1`. Body-content tokens absent. Nested children absent.

    **TRIGGER**: (a) if `fakekey_fenced` or `indented_fake_key` appear in the listing, FR-010's deferred-to-upstream contract is broken — wrapper would need a body-content filter, major scope expansion; escalate to user. (b) if `nullkey` does NOT appear in the listing, FR-011's "presence-is-inclusion" contract is contradicted by upstream — escalate; the spec's FR-011 may need amendment. (c) if `child` / `grandchild` / `deep` appear as separate entries (not nested under `nested`), FR-012's top-level-key contract is contradicted — escalate; the wrapper would need a key-flattening filter. Document the actual upstream behaviour for all three subcases either way. Clean up fixture.

  - **(T0.3) Case-distinct sort verification end-to-end (F13 / FR-013 verification)**: seed two notes in TestVault Sandbox: `Sandbox/properties-T0-case-A.md` with frontmatter `---\nTags: [a]\nAardvark: 1\n---\n` and `Sandbox/properties-T0-case-B.md` with frontmatter `---\ntags: [b]\naardvark: 2\n---\n`. Open TestVault as focused. Probe: `obsidian properties vault=TestVault-Obsidian-CLI-MCP format=json` and confirm all four names (`Tags`, `tags`, `Aardvark`, `aardvark`) appear in the upstream output. Then exercise the wrapper end-to-end (via direct invocation or unit test) and confirm the wrapper's output order is `Aardvark, aardvark, Tags, tags` (case-insensitive primary + byte-order tiebreak per FR-013). **TRIGGER**: if upstream's sort or the wrapper's post-fetch sort produces a different order, debug the sort comparator in T004's handler.ts. Clean up fixtures.

  - **(T0.4) Path-traversal `vault=` value (Q-11 / SC-011 verification)**: probe `obsidian properties vault=../escape format=json`. **Expected per F4 / R5**: same focused-vault output as `obsidian properties format=json` (the `vault=` parameter is silently honoured-as-noop; `../` chars are treated as literal characters in the registry name, which doesn't match any registered vault, so upstream falls back to focused vault). **TRIGGER**: if upstream somehow escapes the registry boundary OR if any filesystem mutation occurs OR if upstream surfaces an error, the FR-017 / SC-011 contract changes — document the actual behaviour. The wrapper's schema-layer `.min(1)` check already rejects empty-string vault; if upstream rejects path-traversal-shaped vault values with a structured error, the wrapper inherits that classification via the dispatch-layer's `Error:`-prefix classifier (no wrapper code change needed). No fixture seeding needed.

  - **(T0.5) Very-large-inventory cap-boundary (Q-21 / SC-021 verification — OPTIONAL)**: if the focused vault has fewer than ~50,000 distinct property names (highly likely; even the user's productive vault has 73), seed a synthetic vault to push the `format=json` output past 10 MiB. Estimate: each JSON entry is ~50 bytes (`{"name":"prop_NNNNN","type":"text","count":N},\n`); 10 MiB ÷ 50 ≈ 200,000 entries. Generate by scripting a vault with 200,000 distinct frontmatter property names spread across notes. **TRIGGER per FR-018 / R10**: either (a) full output under cap, OR (b) `CLI_NON_ZERO_EXIT` with `details.killReason = {kind: "cap", stream: "stdout"}`. Document which outcome fires and at approximately what property-name count. The `total: true` flag bypasses this risk entirely — confirm by re-probing with `total` flag against the same huge fixture; expected: small integer in stdout regardless of property-name count. **OPTIONAL — defer this T0.5 case if seeding 200k property names is impractical**: the FR-018 contract (cap fires as structured error, not silent truncation) is structurally ensured by the cli-adapter's existing 10 MiB cap — empirical confirmation is observability evidence, not a contract gate.

**Checkpoint**: Foundational characterisation complete. Empty-vault behaviour locked (either `[]`/`0` natural handling OR sentinel-detection branch added to T004); body-content opacity confirmed; case-distinct sort verified end-to-end; path-traversal contract confirmed; cap-boundary outcome documented. User-story implementation can now begin.

---

## Phase 3: User Story 1 — Vault-wide property inventory with per-property note counts (Priority: P1) 🎯 MVP

**Goal**: Add the typed `properties` MCP tool surface that returns `{ count, properties: [{ name, noteCount }] }` for the focused (or named) vault. Covers FR-001..FR-014 (default mode happy path + dedup + case-sensitive + body-content opacity + null-valued keys + nested YAML + sort + empty-vault + cross-mode invariant).

**Independent Test**: invoke `properties({})` against a vault with overlapping frontmatter; assert response shape `{ count, properties: [...] }` with correct name/noteCount per entry. Per [quickstart.md](quickstart.md) Q-1 / Q-2 / Q-3 / Q-4.

> **Note on bundled stories**: T002–T009 below are the single source implementation that delivers Stories 1, 2, 3, 4 in one atomic ship. The `[US1]` tag marks primary-story attribution; US2/US3/US4 are sub-stories of the same module and ride along (no separate code paths). Story-tag breakdown by file:
>
> - schema.ts → US1 (default-mode shape) + US2 (vault field) + US3 (validation refinement) + US4 (count-only `total` field)
> - handler.ts → US1 (default-mode happy path + dedup pass-through + sort) + US2 (vault parameter flows to argv) + US4 (count-only branch)
> - index.ts → US1 (registration)
> - docs/tools/properties.md → US5 (documentation)

### Implementation for User Story 1 (MVP — bundled with US2/US3/US4)

- [X] T002 [P] [US1] Create [src/tools/properties/schema.ts](../../src/tools/properties/schema.ts) per [data-model.md § Schema shapes](data-model.md#schema-shapes-zod-source-of-truth-per-constitution-iii). Export `propertiesInputSchema` (plain `z.object({ vault: z.string().min(1).optional(), total: z.boolean().optional() }).strict()` — NO `target_mode` discriminator, NO `targetModeBaseSchema` import, NO `applyTargetModeRefinement` wrap), `propertiesOutputSchema` (strict envelope `{ count: z.number().int().nonnegative(), properties: z.array(propertyEntrySchema) }`), `propertyEntrySchema` (strict `{ name: string, noteCount: nonnegative int }`), `propertiesUpstreamEntrySchema` (passthrough `{ name: string, type: string, count: nonnegative int }` — defence-in-depth against future upstream field additions), `propertiesUpstreamArraySchema = z.array(propertiesUpstreamEntrySchema)`, inferred types `PropertiesInput` / `PropertiesOutput` / `PropertyEntry` via `z.infer`. Carry the `// Original — no upstream. <one-line description>.` header per Constitution V (FR-023).

- [X] T003 [P] [US1] Create [src/tools/properties/schema.test.ts](../../src/tools/properties/schema.test.ts) with 16 cases per [data-model.md § Schema (16 cases)](data-model.md#test-inventory-45-cases). Cases: empty object ✓; vault-only ✓; total-only ✓; total false ✓; vault+total ✓; vault empty-string ✗; vault non-string (number/null) ✗; total non-boolean (string/integer) ✗; unknown top-level key (`file` ✗ / `active` ✗ / `format` ✗ / `sort` ✗); inferred PropertiesInput / PropertiesOutput types compile against representative values; output schema strict rejects extra fields (e.g. `type` on a per-entry record). Carry `// Original — no upstream.` header.

- [X] T004 [US1] Create [src/tools/properties/handler.ts](../../src/tools/properties/handler.ts) per [contracts/properties-handler.contract.md](contracts/properties-handler.contract.md). Export `executeProperties(input, deps)` with signature `(input: PropertiesInput, deps: ExecuteDeps) => Promise<PropertiesOutput>`. Logic:
  1. Build CLI parameters: if `input.vault` is defined, add `vault: input.vault`. If `input.total !== true`, add `format: "json"`. Else (count-only mode), omit `format`.
  2. Build flags: if `input.total === true`, push `"total"`. Else, empty array.
  3. ONE `invokeCli({ command: "properties", parameters, flags }, { spawnFn, env, logger, queue })` (R3 single-call invariant). NO `target_mode` field passed (vault-only surface — cli-adapter's `stripTargetLocators` does NOT execute).
  4. Trim stdout.
  5. **If T0.1 reveals a sentinel string**: detect it (case-sensitive byte equality after trim) → return `{ count: 0, properties: [] }` regardless of mode. (Skip this step if T0.1 confirms `[]` / `0` natural empty handling.)
  6. Count-only mode (`input.total === true`): `Number.parseInt(trimmed, 10)` + `String(count) === trimmed` exact-match check → wrap parse failure as `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.stage: "total-parse"` + `details.stdout: trimmed`. Return `{ count, properties: [] }`.
  7. Default mode: `JSON.parse(trimmed)` → wrap parse failure as `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.stage: "json-parse"` + `details.stdout: trimmed`. Then `propertiesUpstreamArraySchema.parse(parsed)` (ZodError pass-through to `VALIDATION_ERROR` — contract-divergence signal).
  8. Default mode transform: `array.map(({ name, count }) => ({ name, noteCount: count }))` — TypeScript destructure drops `type` implicitly per R7.
  9. Default mode sort (R8 / FR-013): `array.sort((a, b) => { const aLower = a.name.toLowerCase(); const bLower = b.name.toLowerCase(); if (aLower !== bLower) return aLower < bLower ? -1 : 1; return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; })`.
  10. Return `{ count: properties.length, properties }`.
  Define `ExecuteDeps` interface (parity with `outline` / `files` handler — `{ logger, queue, spawnFn?, env? }`). Carry `// Original — no upstream.` header. Implements FR-002 / FR-003 / FR-006 / FR-006a / FR-007 / FR-008 / FR-009 / FR-010 / FR-011 / FR-012 / FR-013 / FR-014 / FR-016 / FR-018.

- [X] T005 [US1] Create [src/tools/properties/handler.test.ts](../../src/tools/properties/handler.test.ts) with 24 cases per [data-model.md § Handler (24 cases)](data-model.md#test-inventory-45-cases). Inject stub `spawnFn` per `vi.fn().mockResolvedValue({stdout, stderr: "", exitCode: 0})`. Per-test assertions: `spawnFn.mock.calls.length === 1` (single-call invariant); argv content (default mode contains `format=json`, NOT `total`; count-only mode contains `total`, NOT `format=json`; vault-set argv contains `vault=<value>` exactly; vault-omitted argv lacks any `vault=` token); output equality.

  Happy-path cases (default mode):
  1. Multi-property fixture (mocked upstream stdout with 4+ entries varying name/type/count) → returns full `properties` list with correct `noteCount` per entry.
  2. Type field dropped: mocked upstream entry `{ name: "tags", type: "tags", count: 4 }` → wrapper output entry has exactly `{ name: "tags", noteCount: 4 }` (no `type` key — assert via `Object.keys(entry).sort()`).
  3. Count rename: mocked upstream `{ name: "author", count: 5 }` → wrapper output's `noteCount` equals `5`.
  4. Sort order — case-insensitive primary + byte-order tiebreak: mocked upstream emits `[Tags(1), tags(4), Banana(2), Aardvark(1), aardvark(3)]` (unsorted) → wrapper emits `[Aardvark, aardvark, Banana, Tags, tags]`.
  5. Sort order — alphabetical case-insensitive baseline: mocked upstream emits already-sorted list `[aliases, author, status, tags]` → wrapper emits identical order.
  6. Sort order — all-lowercase fixture: alphabetical ascending preserved.
  7. Stable sort: repeated calls on the same mocked upstream return identical wrapper order.
  8. Reserved Obsidian properties (`tags`, `aliases`, `cssclasses`) appear in output alongside user-defined names with correct counts (parity to user-defined names — no special filter).
  9. **Case 9 (Q-9 unknown-vault per amended FR-015)**: assert that `{ vault: "NonExistent" }` does NOT produce a wrapper-imposed `CLI_REPORTED_ERROR`. The handler receives whatever mocked stdout the test provides; the test asserts the wrapper returns the parsed output (no error). The argv contains `vault=NonExistent` exactly (structural data-passing per FR-024). The actual upstream "silently honours-as-noop" behaviour is verified live at T0.1 / Q-18; the unit test locks the wrapper's no-special-case contract.

  Happy-path cases (count-only mode):
  10. `total: true` against populated vault (mocked upstream `73\n`) → `{ count: 73, properties: [] }`.
  11. `total: true` against empty vault (mocked upstream `0\n`) → `{ count: 0, properties: [] }`.

  Cross-mode invariant:
  12. Same upstream returns same outer `count` under both `total: false` and `total: true` modes (FR-006a). Mock the spawnFn twice with the same fixture; assert `default.count === total.count`.
  13. Default mode `output.count === output.properties.length` (FR-006a internal consistency).

  Empty-vault path:
  14. Default mode + mocked upstream stdout `[]\n` → `{ count: 0, properties: [] }`. If T0.1 reveals a sentinel string instead, swap this case for `stdout: "<sentinel>\n"` and adjust the handler implementation accordingly.

  Argv assertions:
  15. Default mode argv contains `format=json` and NOT `total`.
  16. Count-only mode argv contains `total` and NOT `format=json`.
  17. When `input.vault` is set to `"Demo"`: argv contains `vault=Demo` exactly (no shell interpolation, no eval; the `vault=` value flows as a separate process argument per FR-024).
  18. When `input.vault` is omitted: argv does NOT contain any `vault=` token (assert via `argv.find((a) => a.startsWith("vault=")) === undefined`).
  19. Single spawn invocation per request (default mode).
  20. Single spawn invocation per request (count-only mode).

  Failure paths:
  21. JSON parse failure (mocked upstream stdout `"not valid json\n"`) → `CLI_REPORTED_ERROR` with `details.stage === "json-parse"` AND `details.stdout` includes the malformed string.
  22. Total-mode integer parse failure (mocked upstream stdout `"abc\n"`) → `CLI_REPORTED_ERROR` with `details.stage === "total-parse"` AND `details.stdout` includes the malformed string.
  23. Output-cap kill: mock the spawnFn to reject with an `UpstreamError({ code: "CLI_NON_ZERO_EXIT", details: { killReason: { kind: "cap", stream: "stdout" } } })`. Assert the handler propagates the error unchanged (no wrapping).

  Token-cost regression (Q-14 / SC-014 — added in parity with BI-023's U1 remediation):
  24. Token-cost regression: seed two upstream stdout fixtures — (a) a synthetic inventory payload with 50 distinct property entries (~2 KB JSON), (b) a synthetic "full-vault grep" payload (concatenated frontmatter blocks from 200 notes, ~50 KB markdown). Assert `Buffer.byteLength(propertiesStdout, "utf8") < Buffer.byteLength(grepEquivalent, "utf8") / 5` (inventory payload at least 5× smaller — locks SC-014's "far smaller than full-vault grep" claim with a conservative 5× threshold for fixture flexibility).

  Carry `// Original — no upstream.` header.

- [X] T006 [US1] Create [src/tools/properties/index.ts](../../src/tools/properties/index.ts). Export `createPropertiesTool(deps: RegisterDeps): RegisteredTool` via the `registerTool` factory (parity with `outline` / `files` / `read`). Export `PROPERTIES_TOOL_NAME = "properties"` constant and `PROPERTIES_DESCRIPTION` string (mention the typed `{ count, properties: [{ name, noteCount }] }` envelope, the count-only `total` switch, the multi-vault inherited limitation, and a pointer to `help({ tool_name: "properties" })` for full docs — model after `OUTLINE_DESCRIPTION` shape and length). Carry `// Original — no upstream.` header.

- [X] T007 [US1] Create [src/tools/properties/index.test.ts](../../src/tools/properties/index.test.ts) with 5 registration cases: (a) `createPropertiesTool({...}).descriptor.name === "properties"`; (b) descriptor `inputSchema` has descriptions stripped (ADR-005 — assert no `description` field appears in the JSON Schema); (c) `PROPERTIES_DESCRIPTION` mentions `help({ tool_name: "properties" })`; (d) `docs/tools/properties.md` exists with non-stub content (assert file size > 1 KB AND contains the strings "Worked example" + "Error roster" — placeholder check; full content asserted by T009's drift detector); (e) the `_register-baseline.test.ts` drift detector fingerprint matches the rolled-forward baseline (this depends on T009 — comment as "AFTER T009"). Carry `// Original — no upstream.` header.

- [X] T008 [US1] Edit [src/server.ts](../../src/server.ts): add the import line `import { createPropertiesTool } from "./tools/properties/index.js";` in alphabetical position (between `createOutlineTool` and `createReadTool` — verify alphabetical order matches the existing import block). Add the `createPropertiesTool({ logger, queue })` entry in the tools array, alphabetical position (between `createOutlineTool` and `createReadTool`). DO NOT pass `vaultRegistry` (parity with `files` / `outline` — properties does not need vault verification per R5). Verify by `npm run typecheck` AND by `npm run test -- src/server.test.ts` — the existing registry-consistency test auto-covers `properties`'s docs/ presence once the registration lands.

- [X] T009 [US1] Roll forward [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write`. This adds the new `properties` tool's fingerprint (`{ name: "properties", descriptionFingerprint: "<sha256>", schemaFingerprint: "<sha256>" }`) to the baseline array per BI-022's FR-018 contract. Verify: (a) `git diff src/tools/_register-baseline.json` shows ONLY the new `properties` entry added (no other tool's fingerprint changed — confirms SC-015); (b) `npm run test -- src/tools/_register-baseline.test.ts` passes after the roll-forward. **TRIGGER**: if any other tool's fingerprint changed, halt — accidental description-text drift or schema-shape drift in another tool. Investigate before continuing.

**Checkpoint US1/US2/US3/US4**: schema + handler + registration + baseline rolled forward + server registers the tool. The MCP server now serves `properties` end-to-end. Run `npm run test` to verify all 45 new tests pass + existing 023 baseline test passes (with the rolled-forward baseline). Run `npm run typecheck` and `npm run lint` to verify zero regressions.

---

## Phase 4: User Story 5 — Documentation surface (Priority: P2)

**Goal**: Author the progressive-disclosure help facility's documentation file for the properties tool. Covers FR-019 + the `help({ tool_name: "properties" })` consumer surface.

**Independent Test**: invoke `help({ tool_name: "properties" })` and confirm the doc renders with input contract + output × 2 modes + error roster + ≥4 worked examples. Per [quickstart.md](quickstart.md) Q-16.

- [X] T010 [US5] Create [docs/tools/properties.md](../../docs/tools/properties.md) (~175 lines). Structure mirrors `docs/tools/outline.md` and `docs/tools/files.md`. Required sections:
  1. **Overview** — single-paragraph summary linking to FR-001's tool name and the wrap of upstream `obsidian properties`.
  2. **Input contract** — per-field table with type, required, default. Covers `vault` (optional, non-empty string, defaults to focused vault) / `total` (optional boolean, defaults to false). NO `target_mode` discriminator (vault-only surface). NO `file` / `path` / `active` (rejected at schema layer per FR-005). Reference [contracts/properties-input.contract.md](contracts/properties-input.contract.md).
  3. **Output shape** — separate JSON schemas for default mode (`{ count, properties: [{ name, noteCount }, ...] }`) and count-only mode (`{ count, properties: [] }`). Note that the envelope is uniform across modes; `total: true` populates `count` and leaves `properties` empty. Explicitly note the cross-mode invariant FR-006a (same `count` value across both modes for the same vault state).
  4. **Worked examples** (≥4 per FR-019):
     - Example 1: default-scope happy path (`{}` input, focused vault has frontmatter — returns full inventory).
     - Example 2: named-vault scoping (`{ vault: "Architecture Notes" }` — note that upstream silently honours-as-noop the `vault=` parameter; the focused vault is used; multi-vault users open the target vault before invoking).
     - Example 3: count-only mode (`{ total: true }` against populated vault — returns `{ count: N, properties: [] }`).
     - Example 4: empty vault (`{}` against vault with no frontmatter — returns `{ count: 0, properties: [] }`).
     - Example 5 (bonus): validation rejection (`{ vault: "" }` — returns `VALIDATION_ERROR`).
     - Example 6 (bonus): case-distinct drift detection — show fixture with `Tags` and `tags` returning adjacent entries per FR-013 sort.
  5. **Error roster** — each `code` with trigger condition. Covers `VALIDATION_ERROR`, `CLI_REPORTED_ERROR` (2 sub-cases — JSON-parse failure, total-parse failure), `CLI_NON_ZERO_EXIT` (output-cap), `CLI_BINARY_NOT_FOUND`. Explicitly note NO `ERR_NO_ACTIVE_FILE` (no active mode for this tool) AND NO `CLI_REPORTED_ERROR` for unknown vault (silently honoured-as-noop per F4 / R5).
  6. **Inherited limitations**:
     - Multi-vault default ambiguity (per F4 / R5 / R14) — `vault=` is silently honoured-as-noop; the focused vault is always used. Multi-vault users open the target vault before invoking. The wrapper does not add a vault-registry pre-check. Parity with `files` (BI-019), `outline` (BI-023), `read_heading` (BI-015), `find_by_property` (BI-014).
     - Output-cap ceiling (per R10) — practical 10 MiB inherited from cli-adapter; very large inventories may surface as `CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses this risk.
     - Sort order is wrapper-locked (per Q1 / FR-013) — case-insensitive primary + byte-order tiebreak; drift-adjacent display. Wrapper does not expose alternative sort parameters (callers re-sort client-side if needed).
     - Type metadata is dropped (per FR-004 / R13 / F5) — upstream emits `type` per entry; wrapper does not expose it. Future BI may expose `type` as a separate field if user demand emerges.
  7. **Related tools**: cross-link to `read_property` (single file's property value), `find_by_property` (notes carrying a specific value), `outline` (heading structure of a single note), `obsidian_exec` (escape hatch for `sort=count` or `format=tsv`).
  
  No `// Original` header (Markdown docs are exempt per BI-005 FR-019). Implements FR-019 and Q-16's content-completeness assertion.

- [X] T011 [US5] Edit [docs/tools/index.md](../../docs/tools/index.md): add a one-line entry for `properties` in alphabetical position (between `outline` and `read`). Format must match the existing convention (verify by reading the file's current entries). Implements the implicit "tool-list discoverability" surface that the help-tool consumes.

**Checkpoint US5**: `help({ tool_name: "properties" })` returns the populated docs page; the registry-consistency test from BI-005 auto-covers the file's existence; T007's case (d) asserts content completeness.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Release mechanics, README sweep, and a deliberate-fails-first sanity check.

- [X] T012 [P] Edit [package.json](../../package.json): bump `version` from `0.5.1` to `0.5.2` (additive surface — PATCH under semver since no existing-tool surface changes). Update the `description` field to mention `properties` alongside the existing typed-tool list (verify by reading the current description; the convention is to list the tool names — extend with `properties` in alphabetical position). Run `npm install` to update `package-lock.json` (if present). Verify by `npm run build` succeeds.

- [X] T013 [P] Edit [CHANGELOG.md](../../CHANGELOG.md): add a new `## [0.5.2]` section (or append under `## [Unreleased]` per the existing convention — verify by reading the current CHANGELOG structure). Section content per CONTRIBUTING.md's CHANGELOG conventions: headline ("Added: typed `properties` tool — vault-wide frontmatter property inventory with per-property note counts"), one paragraph describing the new surface (input shape + output envelope + count-only mode + drift-adjacent sort), one paragraph naming the design decisions deferred to upstream (body-content opacity per FR-010 / F12, unknown-vault silently-honoured-as-noop per FR-015 amended at plan stage / F4, top-level-key counting per FR-012, null-valued-key inclusion per FR-011), references section linking to the spec / plan / tasks. No migration block (additive surface; zero existing-tool changes per FR-022 / SC-015).

- [X] T014 [P] Edit [README.md](../../README.md): if the README contains a tools-list section, add a line for `properties` in alphabetical position. If the README does NOT enumerate tools (verify by reading), this task is a no-op — close it out without an edit.

- [X] T015 Run the full test + quality gates locally:
  ```powershell
  npm run lint          # zero warnings
  npm run typecheck     # tsc --noEmit clean
  npm run test          # 45 new tests pass + existing tests pass + coverage >= 91.3% statements
  npm run build         # tsc -p tsconfig.build.json succeeds
  ```
  All four MUST pass before moving to T016. Capture the coverage delta — the new module is small (~140 LOC) with near-100% test coverage, so the aggregate floor either stays at 91.3% or ratchets up. If coverage drops below 91.3%, investigate which existing module lost coverage (likely an integration regression from the server.ts edit) before continuing.

- [X] T016 Deliberate-fails-first sanity check (S-deliberate-revert per project convention). On a fresh local commit:
  1. Choose ONE handler test case (suggested: T005 case 4 — sort order case-distinct fixture).
  2. Edit [src/tools/properties/handler.ts](../../src/tools/properties/handler.ts) to break the contract — e.g., remove the post-fetch sort step (skip the `.sort(...)` call entirely).
  3. Run `npm run test -- src/tools/properties/handler.test.ts` — expect AT LEAST the chosen case to FAIL with a deep-equality diff naming the expected-vs-actual `properties` order.
  4. Revert the handler edit (`git checkout src/tools/properties/handler.ts`).
  5. Re-run `npm run test -- src/tools/properties/handler.test.ts` — expect ALL cases to PASS.
  
  This proves the test suite has live coverage of the contract and isn't accidentally green for the wrong reason. Document in your PR description that this check was performed.

- [ ] T017 Run the manual end-to-end smoke — DEFERRED (manual gate). Requires MCP Inspector or Claude Desktop with TestVault-Obsidian-CLI-MCP focused; not run during /speckit-implement. Operator runs as the pre-merge final check.

  ORIGINAL DIRECTIVE BELOW (kept verbatim for the operator): end-to-end smoke per [quickstart.md § End-to-end smoke](quickstart.md#end-to-end-smoke-after-speckit-implement-completes). Boot the freshly-built MCP server against MCP Inspector or Claude Desktop with `TestVault-Obsidian-CLI-MCP` opened in Obsidian. Exercise the 8 listed scenarios (tools/list visibility, default-scope happy, count-only happy, named-vault inherited-limitation, validation rejection on empty vault, validation rejection on unknown key, help facility round-trip, cross-mode invariant). Document any deviation from expected output and reconcile before declaring the BI shippable.

**Checkpoint Polish**: all 17 tasks complete. The BI is shippable. Open a PR; per CONTRIBUTING the PR description includes the Constitution Compliance checklist (5× Y) AND a confirmation that T016's deliberate-fails-first sanity check was performed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: NONE — skipped (no new tooling).
- **Foundational (Phase 2 — T001)**: BLOCKS T004 + T005 (handler tests need T001's locked empty-vault behaviour + case-distinct sort confirmation). T002 / T003 (schema + schema tests) are independent of T001 and can run in parallel with it.
- **User Story 1 phase (T002–T009)**: T002 / T003 in parallel; T004 depends on T001 + T002; T005 depends on T004; T006 depends on T002 + T004; T007 depends on T006 + T010 (case d) + T009 (case e); T008 depends on T006; T009 depends on T008.
- **User Story 5 phase (T010–T011)**: T010 can run in parallel with T002–T008 (independent files); T011 can run in parallel with T010.
- **Polish (Phase 5 — T012–T017)**: T012 / T013 / T014 in parallel (independent files); T015 depends on ALL prior tasks landing; T016 depends on T015 passing; T017 depends on T015 + a freshly-built dist (so depends on T015's `npm run build`).

### User Story Dependencies

- **US1 / US2 / US3 / US4 (P1/P1/P1/P2)**: bundled into the single source ship (T002–T009). All four complete simultaneously.
- **US5 (P2)**: independent of US1's source code. T010 can be authored in parallel with T002–T008. The registry-consistency test (T007 case d) ties US1 and US5 together at test time but the source files are independent.

### Parallel Opportunities

| Group | Tasks | Why parallelisable |
|---|---|---|
| A | T001 + T002 + T003 + T010 | T001 (live probes) + T002 (schema source) + T003 (schema tests) + T010 (docs) all touch independent files |
| B | T002 + T003 | schema + its tests — independent files |
| C | T011 + T012 + T013 + T014 | docs/index + package.json + CHANGELOG + README — independent files |

### Within Each User Story

- Schema (T002) before handler (T004) — handler imports `PropertiesInput` / `PropertiesOutput` types from schema.
- Handler (T004) before handler tests (T005) — tests import `executeProperties`.
- Handler (T004) before registration (T006) — registration imports `executeProperties`.
- Registration (T006) before server.ts edit (T008) — server imports `createPropertiesTool`.
- Server.ts edit (T008) before baseline roll-forward (T009) — baseline regen scans the live registry.
- Baseline roll-forward (T009) before T015 quality gates — `_register-baseline.test.ts` would otherwise fail.

---

## Parallel Example: User Story 1 + User Story 5 simultaneously

```bash
# Group A — kick off T001 (live probes), T002 (schema source), T003 (schema tests), T010 (docs) in parallel:
Task: "T001 — Live-CLI characterisation against TestVault-Obsidian-CLI-MCP"
Task: "T002 — Create src/tools/properties/schema.ts with four zod schemas + types"
Task: "T003 — Create src/tools/properties/schema.test.ts with 16 cases"
Task: "T010 — Create docs/tools/properties.md with ≥4 worked examples"

# After T001 + T002 land, kick off T004:
Task: "T004 — Create src/tools/properties/handler.ts per contracts/properties-handler.contract.md"

# After T004 lands, kick off T005 + T006 in parallel:
Task: "T005 — Create src/tools/properties/handler.test.ts with 24 cases"
Task: "T006 — Create src/tools/properties/index.ts with createPropertiesTool factory"

# After T006 lands, kick off T008:
Task: "T008 — Edit src/server.ts to register createPropertiesTool"

# After T008 lands, kick off T009 (single command):
Task: "T009 — Run npm run baseline:write to roll forward _register-baseline.json"

# After T009 lands AND T010 lands, kick off T007:
Task: "T007 — Create src/tools/properties/index.test.ts with 5 registration cases"
```

---

## Implementation Strategy

### MVP First (User Story 1 — bundles US2/US3/US4)

1. Skip Phase 1 (no setup needed).
2. Complete Phase 2 (T001 — live-CLI characterisation of 5 deferred T0 cases).
3. Complete Phase 3 (T002–T009 — schema + handler + registration + server edit + baseline roll-forward).
4. **STOP and VALIDATE**: run `npm run test` — all 40 of US1/US2/US3/US4's tests pass (excludes the 5 registration cases in T007 that depend on T010 docs). Run T015's full quality-gate sweep early as a smoke check.
5. Defer US5 docs (T010–T011) and Polish (T012–T017) for the next iteration if you want to ship MVP-only. Note: the registry-consistency test from BI-005 will fail without `docs/tools/properties.md`; minimum docs-stub is required even for MVP. So T010 is effectively part of MVP.

### Incremental Delivery (recommended path)

1. T001 (live probes) → T002+T003 (schema) → confirm schema tests pass.
2. T004+T005 (handler) → confirm handler tests pass.
3. T006+T008+T009 (registration + server + baseline) → confirm registry baseline test passes.
4. T010+T011 (docs) → confirm registry-consistency test passes.
5. T007 (registration tests) → 45-test ship complete.
6. T012–T014 (release mechanics) → T015 (quality gates) → T016 (sanity check) → T017 (smoke).
7. Open PR.

### Parallel Team Strategy

With multiple developers / agents:

- Dev A: T001 (live probes against TestVault — needs Obsidian + access).
- Dev B: T002+T003 (schema + tests — pure TS, no live CLI).
- Dev C: T010+T011 (docs — independent files).
- Once A+B+C complete, Dev B picks up T004+T005, Dev A picks up T006+T008+T009.
- Dev C polishes T007 once T009 lands; everyone converges on T015–T017.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [USx] label maps task to specific user story for traceability per the bundled-stories model.
- The single `properties` module ships US1/US2/US3/US4 simultaneously; US5 is its independent docs ship.
- Verify tests fail before implementing — once per BI via T016's deliberate-fails-first sanity check.
- Commit after each task or each logical group per the project's commit-on-invocation convention.
- Stop at any checkpoint to validate independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
- ZERO new error codes (FR-018 / Constitution Principle IV). ZERO new ADRs. ZERO existing-tool surface changes (SC-015).
