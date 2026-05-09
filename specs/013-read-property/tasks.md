---
description: "Task list for 013-read-property — Read Property Typed Surgical Frontmatter Read"
---

# Tasks: Read Property — Typed Surgical Frontmatter Read

**Input**: Design documents from [`/specs/013-read-property/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test cases in the same task. The verify-fails-first sanity check is captured exactly once, manually, by S-14 (the deliberate-revert check on the implementer's machine — equivalent to 012's T013).

**Organization**: Tasks are grouped by user story per the project convention. The `read_property` module is fundamentally a single atomic ship — Stories 1–4 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 5 is the documentation layer. The `[US1]` tag marks primary-story attribution for each implementation task; the test inventory in [contracts/read-property-handler.contract.md §Test inventory](contracts/read-property-handler.contract.md#test-inventory-fr-023-handler-tests) maps each test case to its source User Story (so you can read tests stories-first AND implementation files-first). Phase 2 Foundational is the live-CLI characterisation of the 6 cases deferred from plan stage (T001) and the cli-adapter R5 inheritance verification for the new subcommand (T002).

**Plan-stage spec amendments documented in [research.md](research.md) — re-stated here so implementers see them before writing code**:
- **R3 — Two-call architecture**: each MCP request fires TWO `invokeCli` calls (Call A file-scoped + Call B vault-scoped). Latency cost ≈ 2× single-call. Handler tests assert both spawn invocations on happy paths; short-circuit cases assert ONE invocation.
- **R7 — FR-011 / FR-012 conflation**: Obsidian conflates "no frontmatter block" with "malformed frontmatter (missing closing fence)". Both cases produce `No frontmatter found.` on stdout; the handler short-circuits to `{value: null, type: "unknown"}`. Spec FR-012's "structured error for malformed" is weakened to match Obsidian.
- **R4 — Active-mode multi-vault limitation**: in active mode, Call B uses no `vault=` (queries Obsidian's default vault for type metadata). Single-vault correct; multi-vault may report wrong type labels in active mode. Documented in T007's docs.
- **Q1 / Q2 contingencies resolved without spec amendment**: Q1 (absent vs explicit-null) does NOT fire — Obsidian's metadata channel distinguishes; Q2 (mappings) confirmed — Obsidian itself labels mappings as `"unknown"` natively.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers (US1 / US5 — the `read_property` BI's two practical primary-stories per the file-vs-story mapping in plan.md). Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read_note` / `write_note` / `delete_note`). All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at [src/tools/read_property/](../../src/tools/read_property/) (does NOT exist yet — created by T003–T005).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–012). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler's response-parsing logic against verified wording for the 6 cases deferred from plan stage (per [research.md "Findings deferred to T0"](research.md#findings-deferred-to-t0-require-destructive--live-obsidian-probes)), and verification that the existing 011-R5 cli-adapter unknown-vault response-inspection clause works for the `properties` subcommand without modification.

**Note on plan-stage coverage**: 9 of 15 FR-024 cases were already verified live during plan stage (see [research.md Live CLI Findings](research.md#live-cli-findings-plan-stage-probes--2026-05-09)) — subcommand argv shape, file-scoped value preservation for all six native types, vault-scoped type metadata, unknown vault, missing file, no-frontmatter, malformed-frontmatter conflation, active-mode no-focused-note, wikilink locator. T001 below covers ONLY the 6 cases deferred to T0.

- [ ] T001 Live-CLI characterisation of the 6 deferred FR-024 cases. Run probes against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  > **Sub-task numbering note**: T0.X numbers below correspond to the 6 deferred FR-024 cases per the deferred-cases table in [research.md](research.md#findings-deferred-to-t0-require-destructive--live-obsidian-probes). The 9 plan-verified cases (subcommand argv, six native types, unknown vault, missing file, no-fm, malformed-fm, active no-focused-note, wikilink locator) need no T0 work.

    - **(T0.1) Active-mode happy path**: open Obsidian and focus a known scratch note (created via `write_note` to `Sandbox/013-T0-active-fixture.md` with one-property frontmatter). Run `obsidian properties format=json active`. Capture stdout (expected: file-scoped JSON object — same shape as specific-mode). Verify response is the focused-note's frontmatter. **TRIGGER**: if active-mode response shape differs from specific-mode (e.g., the CLI returns metadata array instead of the JSON object), the handler's active-mode response handling needs an active-mode-specific branch. **Lock**: handler test #12 `Story 2 AC#1 — active mode happy path` against this captured shape.
    - **(T0.2) YAML comments inside frontmatter**: create `Sandbox/013-T0-comments.md` with frontmatter containing `# this is a comment` lines. Probe `obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-T0-comments.md format=json`. Capture whether comments appear in the JSON output (likely stripped by Obsidian's YAML parser). Document characterised behaviour in research.md.
    - **(T0.3) YAML anchors (`&name`)**: create `Sandbox/013-T0-anchors.md` with frontmatter using `&name`-style anchors. Probe; capture whether Obsidian dereferences the anchor (substituting the value), preserves the syntax, or rejects the file as malformed (R7 conflation). Document in research.md.
    - **(T0.4) YAML aliases (`*name`)**: create `Sandbox/013-T0-aliases.md` with frontmatter using `*name`-style alias references (depending on T0.3's anchor outcome — same file may exercise both). Probe; document the resolution behaviour.
    - **(T0.5) CRLF-vs-LF round-tripping**: create two byte-identical-by-content fixtures with explicit different line endings — `Sandbox/013-T0-crlf.md` (CRLF, written via PowerShell `-Encoding utf8` with `[System.IO.File]::WriteAllText` and explicit `\r\n`) and `Sandbox/013-T0-lf.md` (LF, written via `Out-File -Encoding utf8NoBOM` with explicit `\n`). Probe both; assert byte-identical JSON responses. Per FR-020.
    - **(T0.6) Heterogeneous-list type label (US4 / FR-017)**: create `Sandbox/013-T0-mixed.md` with frontmatter `mixed: [1, "two", 3]`. Probe file-scoped (Call A — confirms `value` is the heterogeneous array). Probe vault-scoped (Call B — captures Obsidian's resolved label for the heterogeneous-list shape; expected `"unknown"` or `"multitext"`). **TRIGGER**: if Obsidian labels heterogeneous lists as `"multitext"`, the R6 translation table maps to `"list"` — but US4's spec contract requires `type: "unknown"` for heterogeneous lists. **Resolution**: the handler post-processes — if `type` resolves to `"list"` AND the `value` array contains mixed runtime types, downgrade `type` to `"unknown"` per FR-017. Lock the handler test #15 `heterogeneous list → array, type "unknown"` against this captured behaviour.

  **Cleanup**: after capture, ensure `Sandbox/` contains no `013-T0-*` files. Use `obsidian vault=TestVault-Obsidian-CLI-MCP delete path=Sandbox/013-T0-<name>.md` (to-trash; recoverable) for each fixture. The pre-existing `Welcome.md` at vault root is NEVER touched.

  **Constitution**: Principle IV (the captured wording becomes the source-of-truth for handler edge-case logic — preserves chain-of-custody from CLI to MCP client). FR-020 / FR-024 / SC-013.

- [ ] T002 [P after T001] **VERIFICATION + ADDITIVE TEST** — confirm the existing 011-R5 cli-adapter unknown-vault response-inspection clause at [src/cli-adapter/cli-adapter.ts:55-89](../../src/cli-adapter/cli-adapter.ts#L55-L89) works for the `properties` subcommand without source-code modification, and add a cross-subcommand test case to lock the inheritance. Two sub-tasks:

  - **(2a) Live verification** (already completed during plan stage — see [research.md Finding 4](research.md#finding-4-unknown-vault-response-r5-inheritance)): `obsidian vault=NoSuchVault properties path=Sandbox/013-plan-types.md format=json` returns `Vault not found.` on stdout, exit 0 — byte-identical to the create / delete subcommands. The existing `UNKNOWN_VAULT_PREFIX = "Vault not found."` re-classifier handles `properties` identically. **No source-code changes to `src/cli-adapter/cli-adapter.ts` needed.**
  - **(2b) Adapter-test inheritance lock**: extend the existing 011-R5 / 012-T002 unknown-vault test in [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) to add a `command: "properties"` row alongside the existing `command: "create"` and `command: "delete"` rows (or add a sibling `it()` block following the established pattern). Either way, the existing tests continue to pass for `create` and `delete`. Header comment at [src/cli-adapter/cli-adapter.ts:1](../../src/cli-adapter/cli-adapter.ts#L1) already cites BI 011-write-note R5 / T002 + 012-delete-note T002; no header update needed (the clause is subcommand-agnostic).

  Depends on: T001 (loosely — T001 covers different cases; T002 is non-blocking confirmation of R5 inheritance for the `properties` subcommand).

  **Constitution**: Principle I (clause lives in the `cli-adapter` primitive, NOT in `read_property` — benefits all typed tools; this BI does NOT amend the primitive); Principle II (additive parameterised test case for the new subcommand). R5 inheritance.

**Checkpoint**: Foundational deliverables complete — handler logic is grounded in T0-verified live-CLI wording for all 15 FR-024 cases (9 plan-verified + 6 T0-locked). The R5 inheritance test now covers the `properties` subcommand. Phase 3 implementation can lock against the captured behaviour.

---

## Phase 3: User Story 1 — Specific-mode + Active-mode + Validation + Heterogeneous-list (Priority: P1) 🎯 MVP

**Goal**: Ship the `read_property` module — schema, handler, registration — that delivers the core typed-tool surface. Implementation simultaneously satisfies Stories 1, 2, 3, 4 acceptance criteria because they all exercise the same three source files. (Story 5 — documentation — is its own phase to keep doc-authoring and code-authoring loosely coupled.)

**Independent Test**: per [spec.md Story 1 IT](spec.md) — with a stub `spawnFn` injected via `deps`, `executeReadProperty({ target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status" }, deps)` against TWO stub child responses (Call A returns `{"status":"in-progress"}` JSON; Call B returns `[{"name":"status","type":"text","count":1}]`) returns `{ value: "in-progress", type: "text" }` AND the stub spawn was invoked TWICE with argv `["vault=Demo", "properties", "path=notes/x.md", "format=json"]` then `["vault=Demo", "properties", "format=json"]`. Verifiable via `npx vitest run src/tools/read_property/handler.test.ts`.

### Implementation for User Story 1

- [ ] T003 [US1] Create [src/tools/read_property/schema.ts](../../src/tools/read_property/schema.ts) and [src/tools/read_property/schema.test.ts](../../src/tools/read_property/schema.test.ts). Per [data-model.md §Input Schema](data-model.md#input-schema-readpropertyinputschema) + [§Output Schema](data-model.md#output-schema-readpropertyoutputschema), [contracts/read-property-input.contract.md](contracts/read-property-input.contract.md). Depends on: nothing in this list (truly first source-code task).

  - **(3a) Author [src/tools/read_property/schema.ts](../../src/tools/read_property/schema.ts)** with the `// Original — no upstream. read_property input/output schemas — flat target-mode primitive extension; required name field; polymorphic value union for native YAML types; seven-label type enum.` header (Principle V). Define:
    - `readPropertyInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ name: z.string().min(1) }))` — exactly per [data-model.md §Input Schema](data-model.md#input-schema-readpropertyinputschema). **NO `.superRefine(...)` chain** beyond the target-mode primitive's (parity with `delete_note`'s R6).
    - `PROPERTY_TYPE_LABELS = ["text", "list", "number", "checkbox", "date", "datetime", "unknown"] as const` — the public seven-label enum.
    - `PropertyTypeLabel = (typeof PROPERTY_TYPE_LABELS)[number]` — type alias.
    - `propertyValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown()), z.null()])` — polymorphic value covering all six runtime shapes from JSON-parsed frontmatter values (FR-008 + FR-027 mapping branch).
    - `readPropertyOutputSchema = z.object({ value: propertyValueSchema, type: z.enum(PROPERTY_TYPE_LABELS) }).strict()` — per FR-007.
    - `ReadPropertyInput = z.infer<typeof readPropertyInputSchema>` and `ReadPropertyOutput = z.infer<typeof readPropertyOutputSchema>` — type aliases ONLY (Principle III; no hand-rolled interfaces).
    - **No `.describe()` calls** (per ADR-005, SC-008).
  - **(3b) Author [src/tools/read_property/schema.test.ts](../../src/tools/read_property/schema.test.ts)** with the `// Original — no upstream. Tests for the read_property input schema — happy paths across both modes + name field rules + 9 Story 3 validation classes.` header. **14 test cases** per [contracts/read-property-handler.contract.md §Test inventory](contracts/read-property-handler.contract.md#test-inventory-fr-023-handler-tests):
    - **(a) Story 1 happy-path** — specific mode with `path=` + `name`: `safeParse({ target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status" }).success === true`.
    - **(b) Story 1 happy-path variant** — specific mode with `file=` + `name`: `safeParse({ target_mode: "specific", vault: "Demo", file: "QuickNote", name: "tags" }).success === true`.
    - **(c) Story 2 happy-path** — active mode + `name`: `safeParse({ target_mode: "active", name: "status" }).success === true` AND `parsed.vault === undefined` AND `parsed.file === undefined` AND `parsed.path === undefined`.
    - **(d) Story 3 AC#1** — neither file nor path: `safeParse({ target_mode: "specific", vault: "Demo", name: "x" }).success === false` AND issues include `message` matching `/exactly one of/`.
    - **(e) Story 3 AC#2** — both locators: `safeParse({ target_mode: "specific", vault: "Demo", file: "F", path: "F.md", name: "x" }).success === false` AND issues include `path: ["file"]` AND `path: ["path"]`.
    - **(f) Story 3 AC#3** — vault missing in specific: `safeParse({ target_mode: "specific", file: "F", name: "x" }).success === false` AND issues include `path: ["vault"]`.
    - **(g) Story 3 AC#4** — empty `name`: `safeParse({ target_mode: "specific", vault: "Demo", path: "x.md", name: "" }).success === false` AND issues include `path: ["name"]` with `code: "too_small"`.
    - **(h) Story 3 AC#5** — missing `name`: `safeParse({ target_mode: "specific", vault: "Demo", path: "x.md" }).success === false` AND issues include `path: ["name"]` with `code: "invalid_type"`.
    - **(i) Story 3 AC#6** — active mode with `vault`: `safeParse({ target_mode: "active", vault: "V", name: "x" }).success === false` AND issues include `path: ["vault"]` and message matching `/active mode/`.
    - **(j) Story 3 AC#7** — active mode with `file`: `safeParse({ target_mode: "active", file: "F", name: "x" }).success === false` AND issues include `path: ["file"]`.
    - **(k) Story 3 AC#8** — active mode with `path`: `safeParse({ target_mode: "active", path: "P.md", name: "x" }).success === false` AND issues include `path: ["path"]`.
    - **(l) Story 3 AC#9** — unknown top-level key: `safeParse({ target_mode: "active", name: "x", foo: "bar" }).success === false` AND issues include `code: "unrecognized_keys"` with `keys: ["foo"]`.
    - **(m) Invalid discriminator**: `safeParse({ target_mode: "unknown", vault: "V", path: "P.md", name: "x" }).success === false` AND issues identify `target_mode`.
    - **(n) `name` with dots/dashes** (FR-018 — pass-through verbatim): `safeParse({ target_mode: "specific", vault: "V", path: "P.md", name: "complex.field-name" }).success === true` AND `parsed.name === "complex.field-name"` (no sanitisation).

  **Constitution**: Principle II (14 cases co-located); Principle III (single source of truth — schema is the only typed surface for input shape; the polymorphic value union + seven-label enum are the only typed surfaces for the output shape). FR-001 through FR-008, FR-018, FR-023, SC-008.

- [ ] T004 [US1] Create [src/tools/read_property/handler.ts](../../src/tools/read_property/handler.ts) and [src/tools/read_property/handler.test.ts](../../src/tools/read_property/handler.test.ts). Per [data-model.md §CLI Invocation Shape](data-model.md#cli-invocation-shape--two-call-architecture-r3) + [§Response Parsing](data-model.md#response-parsing--decision-tree), [contracts/read-property-handler.contract.md](contracts/read-property-handler.contract.md), and [research.md R1, R2, R3, R4, R6, R7, R11](research.md). Depends on: T001 (response-handling locked at T0.1, T0.6 captures), T003 (`ReadPropertyInput` / `ReadPropertyOutput` types).

  - **(4a) Author [src/tools/read_property/handler.ts](../../src/tools/read_property/handler.ts)** with the `// Original — no upstream. read_property handler: two-call invokeCli wrapper (Call A file-scoped value + Call B vault-scoped type metadata) per R3; type-label translation per R6; No-frontmatter short-circuit per R7; absent-key short-circuit; verbatim name passthrough per FR-018.` header (Principle V). Implement per [contracts/read-property-handler.contract.md §invariants](contracts/read-property-handler.contract.md#invariants):
    - `executeReadProperty(input: ReadPropertyInput, deps: ExecuteDeps): Promise<ReadPropertyOutput>`.
    - `ExecuteDeps = { logger: Logger, queue: Queue, spawnFn?: SpawnLike, env?: NodeJS.ProcessEnv }` — mirrors `executeReadNote` exactly.
    - **NO per-call logger events** (per [research.md R1](research.md#r1--logger-surface-fr-009-reconciliation-supersedes-spec-fr-009-wording-where-applicable) — handler is a thin `invokeCli` wrapper; observability via the cli-adapter's existing `dispatch*` events for each of the two calls).
    - `OBSIDIAN_TYPE_TO_SPEC_TYPE` constant + `translateObsidianType(obsidianLabel: string): PropertyTypeLabel` helper per [data-model.md §Type Label Translation](data-model.md#type-label-translation-r6).
    - **Call A — file-scoped value** (always issued first):
      - Specific mode: `parameters: { ...locator, format: "json" }`, `flags: []`, `vault: input.vault!`.
      - Active mode: `parameters: { format: "json" }`, `flags: ["active"]`, `vault: undefined`.
      - Subcommand: `"properties"` (R2 — plural, NOT `property:read`).
    - **Call A response handling**:
      - If `stdout.trimStart().startsWith("No frontmatter found.")` → return `{value: null, type: "unknown"}` (R7 short-circuit; FR-011 + FR-012 conflation).
      - Else `JSON.parse(stdout)`. On parse failure, throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: { stdout, call: "A" }, message: "read_property could not parse Call A response: ..."})`.
      - If `!Object.prototype.hasOwnProperty.call(parsedA, input.name)` → return `{value: null, type: "unknown"}` (absent property; FR-010).
      - Else extract `value = parsedA[input.name]`; proceed to Call B.
    - **Call B — vault-scoped type metadata**:
      - Specific mode: `parameters: { format: "json" }`, `flags: []`, `vault: input.vault!`.
      - Active mode: `parameters: { format: "json" }`, `flags: []`, `vault: undefined` (R4 multi-vault limitation — queries default vault).
    - **Call B response handling**:
      - `JSON.parse(stdout)`. On parse failure, throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: { stdout, call: "B" }, message: "read_property could not parse Call B response: ..."})`.
      - Find `entry = parsedB.find(p => p.name === input.name)`. If undefined → `obsidianType = "unknown"` (defensive — shouldn't happen if Call A returned a value).
      - `type = translateObsidianType(entry?.type ?? "unknown")`.
    - **US4 / FR-017 heterogeneous-list post-processing**: AFTER `type` is computed, if `type === "list"` AND `Array.isArray(value)` AND the array contains mixed runtime types (e.g., contains both numbers AND strings — `new Set(value.map(v => typeof v)).size > 1`), downgrade `type` to `"unknown"`. Locked against T0.6's captured behaviour.
    - Return `{ value: value as ReadPropertyOutput["value"], type }`.
    - **Module size budget**: ≤ 80 LOC total file LOC (verified by `wc -l`). If exceeded, factor `parsePropertiesJsonObject(stdout)` and `extractTypeFromMetadata(stdout, name)` into a sibling `_parse.ts` module.
  - **(4b) Author [src/tools/read_property/handler.test.ts](../../src/tools/read_property/handler.test.ts)** with the `// Original — no upstream. Tests for the read_property handler — TWO-CALL argv assembly (Call A + Call B), JSON.parse + name extraction, R6 type translation, R7 short-circuit, R3/R4 active mode, US4 heterogeneous-list downgrade, UpstreamError propagation, null-disambiguation triplet, CLI error code propagation.` header. **22 test cases** per [contracts/read-property-handler.contract.md §Test inventory](contracts/read-property-handler.contract.md#test-inventory-fr-023-handler-tests) (post-/speckit-analyze remediation: 17 → 22, adding F2/F3/F5 coverage):
    - **(1) Story 1 AC#1 — text property happy path** (Call A + Call B): stub Call A returns `{"status":"in-progress"}`, Call B returns `[{"name":"status","type":"text","count":1}]`; assert `{ value: "in-progress", type: "text" }` AND argvCalls equals `[["vault=Demo", "properties", "path=notes/x.md", "format=json"], ["vault=Demo", "properties", "format=json"]]`.
    - **(2) Story 1 AC#2 — list property** (Call A + Call B): stub Call A returns `{"tags":["alpha","beta"]}`, Call B returns `[{"name":"tags","type":"multitext","count":1}]`; assert `{ value: ["alpha", "beta"], type: "list" }` (R6: multitext → list).
    - **(3) Story 1 AC#3 — number property**: stub Call A `{"count":7}`, Call B `[{"name":"count","type":"number","count":1}]`; assert `{ value: 7, type: "number" }`.
    - **(4) Story 1 AC#4 — checkbox property**: stub Call A `{"archived":true}`, Call B `[{"name":"archived","type":"checkbox","count":1}]`; assert `{ value: true, type: "checkbox" }`.
    - **(5) Story 1 AC#5 — date property**: stub Call A `{"due":"2026-12-31"}`, Call B `[{"name":"due","type":"date","count":1}]`; assert `{ value: "2026-12-31", type: "date" }`.
    - **(6) Story 1 AC#6 — datetime property**: stub Call A `{"updated":"2026-05-08T14:30:00"}`, Call B `[{"name":"updated","type":"datetime","count":1}]`; assert `{ value: "2026-05-08T14:30:00", type: "datetime" }`.
    - **(7) Story 1 AC#7 — absent property short-circuits Call B**: stub Call A `{"status":"x"}` (name `missing_field` NOT in object); assert `{ value: null, type: "unknown" }` AND `argvCalls.length === 1` (only Call A issued). Call B stub MUST NOT be consumed.
    - **(8) Story 1 AC#8 — no-frontmatter file short-circuits both calls**: stub Call A `\nNo frontmatter found.\n`; assert `{ value: null, type: "unknown" }` AND `argvCalls.length === 1`. R7.
    - **(9) Story 1 AC#9 — malformed-frontmatter conflated with no-fm (R7)**: stub Call A returns `\nNo frontmatter found.\n` (Obsidian's response for malformed); assert `{ value: null, type: "unknown" }` AND `argvCalls.length === 1`. **Documents the FR-011/FR-012 conflation at the test layer.**
    - **(10) Story 1 AC#11 — unknown vault → CLI_REPORTED_ERROR**: stub Call A exits 0 with stdout `Vault not found.`; assert handler propagates `UpstreamError({ code: "CLI_REPORTED_ERROR" })` (cli-adapter's R5 re-classifier fires before the handler sees the response).
    - **(11) Story 1 AC#10 — missing file → CLI_REPORTED_ERROR**: stub Call A exits 0 with stdout `Error: File "Sandbox/__missing__.md" not found.`; assert handler propagates `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { message: "Error: File ..." } })` — verbatim CLI wording preserved.
    - **(12) Story 2 AC#1 — active mode happy path** (T0.1-locked): stub Call A returns `{"status":"review"}`, Call B returns `[{"name":"status","type":"text","count":1}]`; assert `{ value: "review", type: "text" }` AND argvCalls equals `[["properties", "format=json", "active"], ["properties", "format=json"]]` (NO `vault=` on either call; `active` flag on Call A only — R4).
    - **(13) Story 2 AC#3 — active mode no focused note → CLI_REPORTED_ERROR / ERR_NO_ACTIVE_FILE**: stub Call A exits 0 with stdout `Error: No active file. ...`; assert handler propagates `UpstreamError({ code: <whichever the dispatch layer assigns> })`.
    - **(14) Q2 / FR-027 — mapping value happy path**: stub Call A `{"metadata":{"author":"x","source":"y"}}`, Call B `[{"name":"metadata","type":"unknown","count":1}]`; assert `{ value: {"author":"x","source":"y"}, type: "unknown" }`. **Confirms Obsidian's native `unknown` label passthrough per R6 + R8.**
    - **(15) US4 / FR-017 — heterogeneous list → array, type "unknown"** (T0.6-locked): stub Call A `{"mixed":[1,"two",3]}`, Call B `[{"name":"mixed","type":"<T0.6-captured-label>","count":1}]`; assert `{ value: [1, "two", 3], type: "unknown" }`. The post-processing downgrade (handler 4a step) fires when `type === "list"` AND the array has mixed runtime types — converting to `"unknown"`.
    - **(16) R6 — type translation table is exhaustive**: parameterised `it.each` over the translation table — for each Obsidian label (`text`, `multitext`, `aliases`, `tags`, `number`, `checkbox`, `date`, `datetime`, `unknown`, `madeup_future_label`), stub Call B with that label; assert the spec label per [data-model.md §Type Label Translation](data-model.md#type-label-translation-r6) (with `madeup_future_label` → `"unknown"` per the fallback rule).
    - **(17) FR-018 / FR-019 — `name` with dots/dashes passes through** + **`name` NEVER forwarded to CLI argv**: parameterised cases for `name: "with.dots"`, `name: "with-dashes"`, `name: "_underscore"`. stub Call A returns `{<exact name>: "value"}`, Call B returns `[{"name":<exact name>,"type":"text","count":1}]`; assert correct `value` extraction. **Verify `argvCalls[0]` and `argvCalls[1]` BOTH do NOT contain any `name=` argv parameter** — the wrapper's name handling is post-CLI-response.
    - **(18) F2 — FR-009 literal-null string round-trip** (added by /speckit-analyze remediation): stub Call A returns `{"key":"null"}` (the four-character JSON string `"null"`, distinct from JSON `null`), Call B returns `[{"name":"key","type":"text","count":1}]`; assert `{ value: "null", type: "text" }`. Locks SC-007's "literal `\"null\"` distinguishable from YAML null" contract.
    - **(19) F2 — FR-009 explicit-null distinguishability**: stub Call A returns `{"key":null}` (JSON null, equivalent to YAML's `key:` with no value), Call B returns `[{"name":"key","type":"text","count":1}]`; assert `{ value: null, type: "text" }`. Distinguishable from test (7) which asserts `{ value: null, type: "unknown" }` for the absent-key case. Locks the discriminator mechanism specified in spec.md Edge Cases / CONTENT — null disambiguation + FR-009.
    - **(20) F3 — Story 2 AC#2 active-mode + absent property** (added by /speckit-analyze remediation): stub Call A returns `{"other":"x"}` with `["properties", "format=json", "active"]` argv (active flag); name `missing_in_active`; assert `{ value: null, type: "unknown" }` AND `argvCalls.length === 1` (Call B short-circuited because the property is absent). Locks the active-mode parallel of test (7).
    - **(21) F5 — FR-021 CLI_BINARY_NOT_FOUND propagation** (added by /speckit-analyze remediation, mirrors delete_note handler test (g)): stub `spawnFn` for Call A raises a synthetic `Error` with `code: "ENOENT"`; assert handler propagates `UpstreamError({ code: "CLI_BINARY_NOT_FOUND" })`. Call B is never reached.
    - **(22) F5 — FR-021 CLI_NON_ZERO_EXIT propagation** (added by /speckit-analyze remediation, mirrors delete_note handler test (h)): stub Call A exits `1` with stderr `"permission denied"`; assert handler propagates `UpstreamError({ code: "CLI_NON_ZERO_EXIT", details: { exitCode: 1, stderr: "permission denied\n" } })`.

  **Constitution**: Principle I (handler is a thin transformer; no `child_process.spawn` direct invocation per SC-008); Principle II (22 cases co-located, including TWO-CALL assertions on every happy path); Principle III (polymorphic value union enforced); Principle IV (every `UpstreamError` propagated verbatim; no new codes per FR-021). FR-007, FR-008, FR-009, FR-010, FR-011, FR-013..FR-021, FR-023, FR-027.

- [ ] T005 [US1] Create [src/tools/read_property/index.ts](../../src/tools/read_property/index.ts) and [src/tools/read_property/index.test.ts](../../src/tools/read_property/index.test.ts). Per [contracts/read-property-handler.contract.md](contracts/read-property-handler.contract.md), [contracts/read-property-input.contract.md](contracts/read-property-input.contract.md), and the existing [src/tools/delete_note/index.ts](../../src/tools/delete_note/index.ts) precedent. Depends on: T003, T004.

  - **(5a) Author [src/tools/read_property/index.ts](../../src/tools/read_property/index.ts)** with the `// Original — no upstream. read_property tool registration via registerTool — responseFormat: "json" wraps the { value, type } envelope for the MCP wire.` header (Principle V). Mirror `delete_note/index.ts` structure exactly:
    - Import `registerTool` from `../_register.js`, `executeReadProperty, type ExecuteDeps` from `./handler.js`, `readPropertyInputSchema` from `./schema.js`.
    - Export `READ_PROPERTY_TOOL_NAME = "read_property"`.
    - Export `READ_PROPERTY_DESCRIPTION` per FR-022 + [data-model.md §Top-level Description](data-model.md#top-level-description-fr-022): verb-led summary mentioning `help` AND the tool's own name AND the `{value, type}` output shape disclosure AND the no-error-on-absent disclosure.
    - Export `RegisterDeps = ExecuteDeps`.
    - Export `createReadPropertyTool(deps: RegisterDeps): RegisteredTool` — calls `registerTool({ name, description, schema, deps, handler })`.
  - **(5b) Author [src/tools/read_property/index.test.ts](../../src/tools/read_property/index.test.ts)** with the `// Original — no upstream. Tests for the read_property tool registration — descriptor shape, stripped schema, help mention + output-shape disclosure, docs presence + content completeness.` header. **5 test cases**:
    - **(a) Story 5 — descriptor name**: `createReadPropertyTool({ logger, queue }).descriptor.name === "read_property"`.
    - **(b) Story 5 + post-010 emitted-schema invariants**: emitted `inputSchema` has `type: "object"`, `additionalProperties: false`, `properties` has all 5 keys (`target_mode`, `vault`, `file`, `path`, `name`), `required` includes BOTH `target_mode` AND `name`, AND zero `description` keys at any depth (walk via recursion). Per [contracts/read-property-input.contract.md emitted-schema](contracts/read-property-input.contract.md#emitted-json-schema-the-wire-shape-mcp-clients-see).
    - **(c) Story 5 — descriptor description**: non-empty AND contains literal substring `"help"` (case-insensitive) AND contains literal substring `"read_property"` AND contains a phrase surfacing the `{value, type}` output shape (regex match for `/value.*type|type.*value/i`).
    - **(d) End-to-end VALIDATION_ERROR propagation + FR-016 spawn-spy gate** (F10 — strengthened by /speckit-analyze remediation): inject a `deps.spawnFn` mock that throws `new Error("spawnFn called on validation failure — FR-016 violation")` if invoked. Call `createReadPropertyTool({ logger, queue, spawnFn: spy }).handler({ target_mode: "specific" })` (missing required vault + locator + name); assert returned `ToolCallResult` is an `isError: true` envelope whose JSON-serialised payload has `code: "VALIDATION_ERROR"` AND assert the spawn-spy was NEVER called. Locks FR-016's "validation failures MUST occur strictly before any underlying CLI invocation" contract.
    - **(e) Story 5 / FR-022 docs presence + content completeness**: resolve [docs/tools/read_property.md](../../docs/tools/read_property.md) via `import.meta.url` per [research.md R10](research.md#r10--importmeta-url-path-resolution--coverage-threshold-preservation); assert file exists, does NOT contain the substring `<!-- TODO`, contains all 5 propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`), contains at least 4 example heading sections (`### Example` count ≥ 4), AND contains the active-mode multi-vault limitation note (regex match for `/multi-?vault|multiple vaults|default vault/i`). The doc itself is authored by T007.

  **Constitution**: Principle I (per-surface module entry point); Principle II (5 registration tests co-located); Principle III (the `inputSchema` is derived from the schema via `registerTool`'s `toMcpInputSchema` + `stripSchemaDescriptions` — no manual descriptor construction). FR-001, FR-022, FR-023, SC-008, SC-009, SC-010.

- [ ] T006 [US1] Wire `read_property` into the MCP server. Edit [src/server.ts](../../src/server.ts):

  - **(6a)** Add the import in alphabetical position: `import { createReadPropertyTool } from "./tools/read_property/index.js";` — placed between `createReadNoteTool` and `createWriteNoteTool` imports (`read_note` < `read_property` < `write_note`).
  - **(6b)** Add `createReadPropertyTool({ logger, queue })` to the tools array between `createReadNoteTool({ logger, queue })` and `createWriteNoteTool({ logger, queue })` at [src/server.ts:69-70](../../src/server.ts#L69-L70).
  - **(6c)** Verify the registry-consistency test at [src/server.test.ts](../../src/server.test.ts) passes — the `assertToolDocsExist` aggregator now includes `read_property` and asserts [docs/tools/read_property.md](../../docs/tools/read_property.md) exists. (T007 authors that file; if T007 has not landed yet, this test FAILS until T007 lands. Acceptable transient failure within this BI's WIP — both T006 and T007 land in the same merge.)
  - **(6d)** Verify the post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `read_property` via its `it.each` registry walk. NO test-file modifications. Run `npx vitest run src/tools/_register.test.ts` — assert all `it.each` rows for `read_property` pass.

  Depends on: T005.

  **Constitution**: Principle I (two-line addition; no structural change to server.ts); Principle II (existing drift detector + registry-consistency test cover the new entry without test additions). FR-001, SC-009.

**Checkpoint**: Phase 3 complete. `read_property` is registered alongside `delete_note`, `help`, `obsidian_exec`, `read_note`, `write_note`. `tools/list` returns the post-010 flat descriptor for `read_property`. The 41 co-located tests (14 schema + 22 handler + 5 registration; bumped 36 → 41 by /speckit-analyze remediation closing F2/F3/F5 gaps) + the auto-covered drift detector + the registry-consistency test all pass. Stories 1, 2, 3, 4 acceptance criteria satisfied at the implementation layer (Story 5 docs gate is T007).

---

## Phase 4: User Story 5 — Documentation surface (Priority: P2)

**Goal**: Author the new `docs/tools/read_property.md` body. Update sibling docs (index) to acknowledge the new tool. Story 5's tests in T005 case (e) ASSERT the doc's existence + content completeness; Phase 4 makes them pass.

**Independent Test**: per [spec.md Story 5 IT](spec.md) — `help({ tool_name: "read_property" })` returns the populated body (no TODO stub, all 5 error codes named, ≥4 worked examples covering ≥4 distinct YAML types, active-mode multi-vault limitation documented). Verifiable by file inspection (T007 + T008 outputs) and by the index.test.ts case (e) added in T005.

- [ ] T007 [P] [US5] Author [docs/tools/read_property.md](../../docs/tools/read_property.md) (NEW file — the `assertToolDocsExist` aggregator does NOT pre-populate stubs; T006's registry-consistency test will fail until this lands). Per FR-022 + Story 5 AC#1. Different file from src/, fully parallelisable with T003-T006.

  **Document content** (sections required):
  - **Header**: title (`# Read Property (read_property)`), one-paragraph summary mentioning the typed surface + the token-saving framing (single property read vs full-file fetch) + the `{value, type}` output shape.
  - **Input schema**: per-mode field policy table (matches [contracts/read-property-input.contract.md per-mode-field-policy](contracts/read-property-input.contract.md#per-mode-field-policy-runtime-post-superrefine)). Document `name` is required in BOTH modes.
  - **Output shape**: `{ value: string|number|boolean|array|object|null, type: "text"|"list"|"number"|"checkbox"|"date"|"datetime"|"unknown" }` — describe the polymorphic value (per FR-008 + FR-027 mapping branch), the seven-label type enum, and the absent-property semantic (`{value: null, type: "unknown"}` with no error).
  - **Error roster**: all 5 propagated codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) with one-or-two sentences each describing when each surfaces. NO new codes.
  - **Worked examples (≥4 per Story 5 AC#1 / FR-022 — ≥4 distinct YAML types)**:
    - (i) text property — specific mode `path=` + `name`.
    - (ii) list property — wikilink locator (`file=`) + `name`; demonstrates Obsidian's `multitext` label translation to `"list"`.
    - (iii) number / checkbox / date / datetime — at least 2 of these (e.g., date showing `type: "date"` and number showing `type: "number"`).
    - (iv) absent property — `{value: null, type: "unknown"}` no-error response.
    - (v) [optional] mapping property — demonstrates Q2's `{value: <object>, type: "unknown"}` shape.
  - **Adversarial-edge-case behaviours captured during T0**:
    - **No-frontmatter / malformed-frontmatter conflation (R7)**: explicitly document that Obsidian conflates these two cases — both produce `{value: null, type: "unknown"}` with no error. Cite [research.md R7](research.md#r7--no-frontmatter-found-response-tool-layer-detection-fr-011--fr-012-spec-amendment).
    - **Active-mode multi-vault limitation (R4)**: prominently note that in active mode, type metadata is queried against Obsidian's default vault (not the focused-note's vault). Single-vault users get correct behaviour; multi-vault users may report wrong type labels in active mode. Recommend specific mode for type-correctness when multiple vaults are registered. Cite [research.md R4](research.md#r4--active-mode-the-active-flag-is-the-scope-selector).
    - **Type label inference vs explicit-type assignment**: document that Obsidian's `properties format=json` channel reports the property's type as stored in `.obsidian/types.json`. A property whose type was never explicitly set (via the Obsidian UI Properties panel or `obsidian property:set type=...`) may report `"text"` even if its YAML value is date / datetime / number-shaped. The wrapper reflects Obsidian's authoritative resolution; users seeing "wrong" type labels should explicit-type via Obsidian's UI.
    - **YAML comments / anchors / aliases** (cite T0.2/T0.3/T0.4 captures): document the observed behaviour for each.
    - **CRLF-vs-LF round-tripping** (cite T0.5): line endings do NOT affect the parsed value.
    - **`name` field**: no wrapper-side sanitisation — names with dots, dashes, YAML reserved words pass through verbatim. The argv anti-injection guarantee is structural (the wrapper does NOT forward `name=` to the CLI; extraction is client-side after JSON.parse).
  - **Two-call architecture note**: a brief, optional callout that explains the wrapper issues two CLI invocations under the hood (file-scoped value + vault-scoped type metadata). Latency cost ≈ 2× a single-call typed tool. Most callers don't need to care; surfacing it for power users investigating performance.
  - **Cross-references**: links to the [target-mode primitive](../../specs/004-target-mode-schema/spec.md), the [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md), the [cli-adapter](../../specs/003-cli-adapter/spec.md), the [help tool](../../specs/005-help-tool/spec.md), and [read_note](../../specs/006-read-note/spec.md) / [write_note](../../specs/011-write-note/spec.md) / [delete_note](../../specs/012-delete-note/spec.md) as the sibling tools.

  **Header convention**: NO `// Original — no upstream.` header (Markdown documentation is exempt per [005-help-tool FR-019](../005-help-tool/spec.md)). NO `<!-- TODO -->` markers.

  **Constitution**: Principle V (Markdown exempt from source-header convention per existing precedent); ADR-005 (progressive-disclosure documentation lives in docs/, not in schema). FR-022, SC-010.

- [ ] T008 [P] [US5] Update [docs/tools/index.md](../../docs/tools/index.md) — add a one-line summary for `read_property` per the existing convention. Match the established style for existing entries (typically `- [<tool_name>](<tool_name>.md): <one-sentence summary>`). The summary MUST surface the surgical-read framing (e.g., `- [read_property](read_property.md): Read a single named frontmatter property from a vault note (returns { value, type } with native YAML types preserved).`). Different file from T007; can run in parallel.

  **Constitution**: Principle V (Markdown exempt). FR-022.

**Checkpoint**: Phase 4 complete. `help({ tool_name: "read_property" })` returns the populated body. T005 case (e) passes (was failing prior — required T007 to land). The full `read_property` BI surface is now shippable.

---

## Phase 5: Polish & Release

**Purpose**: Release artifacts (CHANGELOG, package.json), end-to-end verification (quickstart S-1..S-15), and PR Constitution Compliance.

- [ ] T009 [P] Update [package.json](../../package.json) `description` field to mention `read_property` alongside the existing typed tools. Current text (post-012): `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), write_note (typed create/overwrite tool), and delete_note (typed delete tool with safety defaults)."`. Update to: `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), write_note (typed create/overwrite tool), delete_note (typed delete tool with safety defaults), and read_property (typed surgical frontmatter-property read)."`. No other package.json changes.

  **Constitution**: N/A (release-metadata only).

- [ ] T010 Add a [CHANGELOG.md](../../CHANGELOG.md) release entry for `0.2.6` per the project's release convention. Bump `package.json:version` from `0.2.5` to `0.2.6` (PATCH bump per plan — purely additive surface; no breaking changes; the new typed surface for surgical frontmatter reads is a new tool-surface addition, not a behaviour change to existing tools). The CHANGELOG entry should:
  - **Add**: `read_property` typed MCP tool wrapping the Obsidian CLI's `properties` (plural) subcommand with `format=json`. Returns `{ value, type }` with native YAML types preserved (text / list / number / checkbox / date / datetime / unknown). Replaces full-file reads + client-side YAML parsing for the single-property read use case (token-saving win).
  - **Note**: two-call architecture under the hood — Call A file-scoped for value, Call B vault-scoped for type metadata. Latency cost ≈ 2× a single-call typed tool; most callers don't observe the difference.
  - **Note**: active mode in multi-vault setups has a known limitation — type metadata is queried against Obsidian's default vault, not the focused-note's vault. Single-vault correct.
  - **Note**: `obsidian_exec` remains the freeform escape hatch for unwrapped subcommands (the create subcommand's `newtab` flag, future subcommands).
  - **Reference**: link to `specs/013-read-property/spec.md` for the full BI specification.

  Depends on: T007 (the docs that callers will use are in place before the release names them).

  **Constitution**: N/A (release-metadata).

- [ ] T011 Run [quickstart.md](quickstart.md) S-1..S-11 + S-14 verification (CI-runnable + sanity-check scenarios). Specifically:
  - **S-1**: `npm run test` — assert 0 failures; 25 acceptance scenarios (Story 1 AC#1-11 + Story 2 AC#1-3 + Story 3 AC#1-9 + Story 4 AC#1 + Story 5 AC#1) pass.
  - **S-2 / S-7**: drift detector + registry-consistency test pass for `read_property`.
  - **S-3**: `wc -l src/tools/read_property/handler.ts` ≤ 80; `grep -nE "child_process\.spawn|spawn\(" src/tools/read_property/handler.ts` returns no matches.
  - **S-4**: `grep -nE "^(interface|type)\s+ReadProperty.*=.*\{" src/tools/read_property/schema.ts` returns no matches (type ALIASES via `z.infer` are permitted).
  - **S-5**: `grep -nE "\.describe\(" src/tools/read_property/schema.ts` returns no matches.
  - **S-6**: docs/tools/read_property.md greps pass (no `<!-- TODO`, all 5 error codes mentioned, ≥4 example headings, active-mode multi-vault limitation note).
  - **S-7 (handler-level)**: every happy-path test asserts `argvCalls.length === 2`; short-circuit-path tests assert `argvCalls.length === 1`. Per R3.
  - **S-8**: type-label translation table parameterised test fires for every entry. Per R6.
  - **S-9**: `grep -E "name=" src/tools/read_property/handler.ts` returns no matches in any argv-construction context — the wrapper NEVER forwards `name=` to the CLI. Per R2 + FR-019.
  - **S-10**: aggregate statements coverage ≥ 89.6% (per [vitest.config.ts:20](../../vitest.config.ts#L20)).
  - **S-11**: `git diff main..HEAD -- src/tools/obsidian_exec/ src/tools/help/ src/tools/read_note/ src/tools/write_note/ src/tools/delete_note/ src/cli-adapter/ src/target-mode/ src/errors.ts src/logger.ts src/queue.ts` returns empty (no substantive diff in any sibling tool's module or any frozen primitive); `git diff main..HEAD -- src/server.ts` shows ≤4 added lines (one import + one tools-array entry). Per SC-009.
  - **S-14 (deliberate-revert sanity check)**: pick ONE critical line in [src/tools/read_property/handler.ts](../../src/tools/read_property/handler.ts) (e.g., the `flags: ["active"]` emission for active-mode Call A); revert it temporarily; run `npx vitest run src/tools/read_property/`; assert at least 1 test fails (specifically the active-mode happy-path test #12). Restore the line via `git checkout`. Confirms the new tests actually exercise the new code paths.
  - **F4 — FR-020 CRLF/LF lock acknowledgment** (added by /speckit-analyze remediation): FR-020's "byte-identical responses regardless of line-ending convention" contract is locked at the LIVE-CLI layer via T001 T0.5, NOT via stub-based handler tests. Rationale: stub-based tests construct synthetic stdout strings already JSON-parsed identically (the JSON parser is line-ending-agnostic for content), so a handler test would prove the JSON parser handles line endings — not that the live CLI does. The authoritative regression for FR-020 is T001 T0.5's live-CLI probe, captured into research.md. Reviewers cross-checking FR-020 coverage refer to T001 T0.5 (NOT to a handler test).

  Depends on: T001-T010.

  **Constitution**: Principle II (full test suite passes); Principle III (zod single-source-of-truth verified); Principle IV (no new error codes, all failures structured). FR-023, SC-008, SC-009, SC-010, SC-011, SC-013, SC-014, SC-015.

- [ ] T012 Manual S-12 (MCP Inspector end-to-end) + S-13 (Claude Desktop end-to-end) from [quickstart.md](quickstart.md). Capture results in PR description. The strict-rich client (MCP Inspector) observes the unknown-key rejection per Story 3 AC#9; the strict-naive client (Claude Desktop) strips unknown keys client-side per the published schema (also CORRECT per the dual-pathway documented in spec Edge Cases). Manual one-time pre-merge step. Captures the token-saving win observable in real client traces (≤ ~200 chars structured response per SC-014).

  Depends on: T009 (built `dist/` ready for client loading) and T010 (the version/CHANGELOG that the PR description will reference).

  **Constitution**: Principle IV (real-CLI failure paths verified through real clients, not just stubs). SC-009, SC-014.

- [ ] T013 Fill the PR description's Constitution Compliance checklist (5/5 PASS expected per [plan.md Constitution Check](plan.md#constitution-check)). Also note in the PR description: (a) the FR-024 T0 capture results from T001 (which 6 deferred cases were verified with their wording), (b) the spec amendments documented in research.md per R12 (R3 two-call architecture, R7 FR-011/FR-012 conflation, R4 active-mode multi-vault limitation), (c) the resolution of the Q1 / Q2 contingencies (Q1 does NOT fire; Q2 confirmed). Also run **S-15** (documentation cross-reference check) — manual checklist that every claim in `docs/tools/read_property.md` is traceable to a spec FR or research artefact entry. Include links to the spec / plan / research artifacts. Per Constitution v1.2.0 §Development Workflow #8.

  Depends on: T001-T012.

  **Constitution**: §Development Workflow #8 (PR-level checklist). Principle I, II, III, IV, V verification.

**Checkpoint**: BI ready to merge. All 15 quickstart scenarios pass; PR description complete; coverage gate green; manual end-to-end verifications captured. The PR can be opened for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: skipped — toolchain ready
- **Foundational (Phase 2)**: T001 first, T002 [P after T001] (T002 is verification-only — confirms the existing 011-R5 cli-adapter clause works for `properties`; not blocking on T001's substance, only on T001's existence as a dependency-marker). BLOCKS Phase 3 because the handler logic (T004) locks against T0.1 (active-mode happy path) and T0.6 (heterogeneous-list type label).
- **User Story 1 (Phase 3)**: T003 → T004 → T005 → T006 (sequential per file dependencies). T004 depends on T001 for the captured T0.1 / T0.6 wording. T006 depends on T007 for docs (registry-consistency test fails until T007 lands — but both T006 and T007 land in the same merge; transient WIP failure acceptable).
- **User Story 5 (Phase 4)**: T007 + T008 file-disjoint; can run in parallel ([P]).
- **Polish (Phase 5)**: T009 in parallel with T010, then T011 (depends on all prior), then T012 (depends on T009/T010), then T013 (depends on all).

### User Story Dependencies

- **User Story 1**: depends on Foundational (T001 for T0.1 + T0.6 wording lock); deliverable spans T003 + T004 + T005 + T006. **Note**: this BI's "User Story 1 ship" effectively ALSO delivers Stories 2, 3, 4 because they exercise the same source files. The story-tag discipline maps acceptance criteria to test cases (per FR-023), not to separable implementation slices. Story 4's heterogeneous-list test lives as test case (15) inside T004's handler tests.
- **User Story 5**: depends on T005's index.test.ts case (e) + T007's docs authoring; deliverable is T007 + T008. Independent of Stories 1-4 in spirit (docs vs. code), but the index.test.ts case (e) couples them in test order.

### Within Each User Story

- Within US1: schema (T003) before handler (T004) before registration (T005) before server-wire (T006). Test cases land WITH their source file (no separate red-green TDD loop per project convention).
- Within US5: T007 / T008 are file-disjoint — fully parallelisable.

### Parallel Opportunities

- **T002** can run in parallel with T003-T006 once T001 is complete (T002 touches `cli-adapter`, T003-T005 touch `read_property/`, T006 touches `server.ts` — all file-disjoint).
- **T007 + T008** run in parallel with each other.
- **T007** can run in parallel with T003-T006 (file-disjoint).
- **T009** can run in parallel with T010.

### Blocking-task Summary

| Blocker | Blocks | Reason |
|---|---|---|
| T001 | T004 (T0.1 active-mode + T0.6 heterogeneous-list lock), T011 case S-7 | Live-CLI characterisation gates handler logic for the 6 deferred cases |
| T003 | T004 (`ReadPropertyInput` import), T005 (`readPropertyInputSchema` import) | Type/schema dependency |
| T004 | T005 (`executeReadProperty` import) | Function dependency |
| T005 | T006 (`createReadPropertyTool` import) | Factory dependency |
| T007 | T006 PASSING (registry-consistency test) | Doc must exist for assertToolDocsExist |
| T009 + T010 | T011 (CI verification needs version + CHANGELOG in place) | Release-metadata coupling |
| T011 | T012 (manual verification needs CI green first) | Confidence ordering |
| T012 + T013 | merge | PR completeness |

---

## Parallel Example: User Story 1 + Story 5 in parallel after Foundational

```text
# After T001 + T002 land:

# Track A — read_property source modules (sequential per file dep):
T003 (schema.ts + schema.test.ts)
  └─> T004 (handler.ts + handler.test.ts)
        └─> T005 (index.ts + index.test.ts)
              └─> T006 (server.ts wire-up)

# Track B — docs (parallelisable with track A):
T007 (docs/tools/read_property.md)        [P with T003-T006]
T008 (docs/tools/index.md update)         [P with T003-T006 AND with T007]
```

A solo implementer typically lands T003-T008 sequentially in commit order: T003 → T004 → T005 → T007 → T006 → T008 (with T007 BEFORE T006 so the registry-consistency test passes immediately). A two-implementer team can split tracks A and B.

---

## Implementation Strategy

### MVP First (User Story 1 — Stories 1, 2, 3, 4)

1. T001 (foundational live-CLI characterisation; 6 deferred FR-024 cases against the authorised TestVault Sandbox).
2. T002 (verification-only — confirms 011-R5 cli-adapter clause works for `properties` subcommand; additive parameterised test).
3. T003 → T004 → T005 → T007 (out-of-order to satisfy T006's docs-presence test) → T006.
4. **STOP and VALIDATE**: run `npm run test`; assert 41 new tests pass (post-/speckit-analyze remediation count); assert drift detector + registry-consistency tests pass; assert two-call architecture asserts on every happy-path test (R3); assert the heterogeneous-list downgrade fires (US4); assert the FR-009 null-disambiguation triplet (tests 7 / 18 / 19) all pass distinguishably.
5. The MVP is now `read_property` registered + schema + handler + index + docs. Stories 1-4 acceptance criteria all satisfied.

### Incremental Delivery

The 013-read-property BI is fundamentally a single atomic ship — there is no "ship a partial read_property" intermediate state because the schema/handler/index are tightly coupled. The "incremental" framing applies to the FOLLOW-UP BIs that compose on `read_property`: BI candidates are `read_properties` (multi-property batch read), `write_property` (typed surgical write — Obsidian's `property:set` subcommand), `remove_property` (typed surgical delete — Obsidian's `property:remove` subcommand).

### Quality Gates (in order)

1. T011 — `npm run test` green; coverage ≥ 89.6%; greps pass; two-call architecture (S-7) verified at handler-test layer; deliberate-revert sanity check (S-14) passes.
2. T012 — manual S-12 against MCP Inspector; manual S-13 against Claude Desktop. Token-saving observation captured (≤ ~200 chars structured response per SC-014).
3. T013 — Constitution Compliance checklist filled; spec amendments documented; Q1/Q2 contingency resolutions cited; S-15 docs cross-reference check completed.
4. PR opened, reviewed, merged.
5. T010's `0.2.6` version bump triggers an `npm publish` per the project release convention.

---

## Notes

- **[P] tasks** = different files, no dependencies on incomplete tasks in this list. Conservative reading; when in doubt, sequence them.
- **[Story] label** = the primary story this task delivers. The full story-to-test mapping lives in [contracts/read-property-handler.contract.md §Test inventory](contracts/read-property-handler.contract.md#test-inventory-fr-023-handler-tests) so test cases can be read either by source-file (the implementation's organisation) or by user story (the spec's organisation).
- **No separate red-green TDD loop** — every task lands with its co-located tests in the same change; the verify-fails-first sanity check is captured manually once via T011's S-14 step (deliberate revert on a scratch branch).
- **Two-call architecture is non-negotiable** — every handler test on a happy path MUST assert `argvCalls.length === 2` with the correct argv on each. Short-circuit cases (no-fm, absent property) MUST assert `argvCalls.length === 1`. The R3 contract is a load-bearing invariant.
- **Commit cadence**: one task per commit. Subject per the project's `feat(013-read-property): <task description>` convention; body cites task ID + sub-task IDs (e.g., `T003 (3a, 3b)`) + FR/SC/R references.
- **CLAUDE.md follow-up**: after this BI merges, the SPECKIT context block in [CLAUDE.md](../../CLAUDE.md) flips to point at the next active feature. Not part of this BI's task list — handled by the next feature's `/speckit-plan`.
- **Avoid**: vague tasks (every task here cites file + sub-tasks); cross-file conflicts (every task names its target files); silently dropping the two-call architecture assertions; assuming a single-call optimisation (the lazy-on-string optimisation in research.md is explicitly DEFERRED to a future BI).
