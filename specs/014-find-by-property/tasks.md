---
description: "Task list for 014-find-by-property — Find By Property Typed Frontmatter-Index Lookup"
---

# Tasks: Find By Property — Typed Frontmatter-Index Lookup

**Input**: Design documents from [`/specs/014-find-by-property/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test cases in the same task. The verify-fails-first sanity check is captured exactly once, manually, by S-14 / T011 (the deliberate-revert check on the implementer's machine — equivalent to 013's T011 S-14).

**Organization**: Tasks are grouped by user story per the project convention. The `find_by_property` module is fundamentally a single atomic ship — Stories 1–6 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 7 is the documentation layer; Story 8 (P3 stable ordering) is covered by a handler-test assertion + manual S-18. The `[US1]` / `[US7]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md §Test inventory](data-model.md#8-test-inventory-per-fr-026--sc-013---30-cases-total) maps each test case to its source User Story.

**Plan-stage findings carried forward (re-stated here so implementers see them before writing code)**:

- **R2 — `eval` subcommand load-bearing departure**: there is NO native find-by-property primitive in the Obsidian CLI. The handler routes through the developer-section `eval` subcommand with a frozen JS template that walks `app.metadataCache.fileCache` + `app.metadataCache.metadataCache`. The user input itself anticipated this with the "eval composition uses data-passing" clause.
- **R3 — single-call architecture**: each MCP request fires ONE `invokeCli` invocation. ~200 ms per call (live-probed). Handler tests assert `argvCalls.length === 1` on every code path.
- **R4 — adapter `target_mode` mapping**: the user-facing schema has NO `target_mode` field. Internal mapping: `vault === undefined ⇒ target_mode: "active"` (no `vault=` in argv); `vault !== undefined ⇒ target_mode: "specific"` (`vault=<v>` prefixed). Adapter unchanged.
- **R6 — anti-injection via base64-encoded JSON payload**: frozen JS template + base64 payload. User inputs flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` + `JSON.parse` at JS runtime. No user input ever reaches the JS source as text. Verifies FR-020 / SC-017 structurally.
- **R8 — folder path-traversal regex** (Q2 / FR-021): `FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/`. Schema rejection at the validation boundary; defence-in-depth in the JS template via `path.startsWith(prefix)`.
- **Q1 / Q2 / Q3 clarifications**: Q1 (array element-order) → order-sensitive; Q2 (folder traversal) → schema-level rejection; Q3 (multi-vault default) → documented limitation. All three codified in spec.md before plan.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers (US1 / US7 — the BI's two practical primary-stories per the file-vs-story mapping in plan.md). Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read_note` / `write_note` / `delete_note` / `read_property`). All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at [src/tools/find_by_property/](../../src/tools/find_by_property/) (does NOT exist yet — created by T003–T005).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–013). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler against verified wording for the cases deferred from plan stage (per [research.md](research.md#live-cli-findings) F1-F8 verified during plan; date/datetime semantics, Unicode NFC vs NFD, large match-set cap boundary deferred to T0; index staleness window AND list-of-mappings non-match added to T0 by /speckit-analyze C1 remediation), and verification that the existing 011-R5 cli-adapter unknown-vault response-inspection clause works for the `eval` subcommand without modification.

**Note on plan-stage coverage**: 8 critical findings (F1-F8) were verified live during plan stage (see [research.md Live CLI Findings](research.md#live-cli-findings)) — `eval` argv shape + `=> ` prefix; vault scoping via `vault=` BEFORE the subcommand; metadata-cache shape (path → hash → frontmatter indirection); native-type preservation through the cache; base64 anti-injection round-trip; the 11-row matching matrix (scalar / array / case / folder / type-faithful / null-vs-absent); unknown vault response shape (R5 inheritance); single-call latency. T001 below covers the 5 cases deferred to T0 (3 enumerated at plan stage + 2 added by /speckit-analyze C1 remediation).

- [X] T001 Live-CLI characterisation of the 5 deferred cases (post-/speckit-analyze C1 remediation: 3 → 5; cases T0.4 and T0.5 added to close the FR-027 case-14 / case-15 coverage gaps surfaced by /speckit-analyze). Run probes against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  > **Sub-task numbering note**: T0.X numbers below correspond to the 5 deferred FR-027 cases. T0.1 / T0.2 / T0.3 were enumerated during plan stage (see [research.md R7](research.md#r7--in-eval-matching-logic-scalar-array-case-folding-folder-filter)); T0.4 and T0.5 were added by the /speckit-analyze remediation pass to close the FR-027 case-14 (index staleness) and case-15 (list-of-mappings non-match) coverage gaps. The plan-verified matching matrix (scalar / array / case / folder / type-faithful / null-vs-absent) needs no T0 work.

  - **(T0.1) Date / datetime comparison semantics**: create `Sandbox/014-T0-dates.md` with frontmatter `due: 2026-12-31` (YAML date) and `updated: 2026-05-08T14:30:00` (YAML datetime). Probe `find_by_property` queries via the JS template (run `obsidian eval` with the rendered handler template) for: (a) `value: "2026-12-31"` against `due` — captures whether YAML dates are compared as strings or as Date objects; (b) `value: "2026/12/31"` against `due` — captures whether the YAML date format vs. slashed equivalent are equal; (c) `value: "2026-05-08T14:30:00"` against `updated`. Document the captured comparison semantics in research.md under the T0 section. **TRIGGER**: if Obsidian stores dates as JS `Date` objects (not strings), the `===` comparison in the handler's JS template MAY fail for date queries; the wrapper would need a `Date.prototype.getTime()` comparison branch. Verify whether this is the case.
  - **(T0.2) Unicode NFC vs NFD**: create `Sandbox/014-T0-nfc.md` with frontmatter `tag: café` (NFC — `c`, `a`, `f`, `é` as single composed character U+00E9) AND `Sandbox/014-T0-nfd.md` with frontmatter `tag: café` (NFD — `c`, `a`, `f`, `e`, U+0301 combining acute accent). Probe `find_by_property({ property: "tag", value: "café" })` (NFC query). Document whether the NFC query matches both, only NFC, or neither. **EXPECTED**: only NFC matches NFC (the JS template uses `===` which is byte-equal, not Unicode-aware). Document the observable in `docs/tools/find_by_property.md` (T007) so callers know to normalise client-side if they care.
  - **(T0.3) Large match-set output cap boundary**: seed `Sandbox/014-T0-bulk/` with ~1000 fixtures all carrying `category: bulk` (script-generated). Probe `find_by_property({ property: "category", value: "bulk" })`. Capture the response size in bytes. **EXPECTED**: well under 10 MiB (1000 × ~80 bytes/path = ~80 KB). Then seed an additional run targeting the cap — capture either (a) the full response if the vault is small enough to fit, or (b) the `CLI_NON_ZERO_EXIT` (output-cap kill) if the response exceeds 10 MiB. Document the observed boundary behaviour in research.md. **OPTIONAL — defer to a future BI if 10 MiB seeding is impractical**: the FR-019 contract (cap fires as structured error, not silent truncation) is structurally ensured by the cli-adapter's existing 10 MiB cap — T0.3's empirical confirmation is observability evidence, not a contract gate.
  - **(T0.4) Index staleness window after external on-disk edit (FR-027 case 14 — added by /speckit-analyze C1 remediation)**: create `Sandbox/014-T0-staleness.md` with frontmatter `id: BI-stale-original`. Run a baseline probe `find_by_property({ vault: "TestVault-Obsidian-CLI-MCP", property: "id", value: "BI-stale-original" })` and confirm the file is matched. Then **modify the file's frontmatter on disk via direct filesystem write** (PowerShell `Set-Content` or equivalent — bypassing Obsidian's mutator paths) to change the property to `id: BI-stale-modified`. **Without** issuing an `obsidian reload`, immediately re-run the same `find_by_property` query (still `value: "BI-stale-original"`). Capture: (a) does the response still include the file (stale index hit)? (b) the staleness-window duration before Obsidian's reindex catches up — measure via repeated polls until the response excludes the file. Then run a second probe with `value: "BI-stale-modified"` to confirm the new value eventually surfaces. Document the observed staleness window in research.md and `docs/tools/find_by_property.md` (T007). **CONTRACT**: the spec Edge Case "UNDERLYING CLI — index staleness at startup" + FR-022's wording — T0.4 captures the actual lag duration; documented as a known limitation, not a wrapper-side fix target.
  - **(T0.5) List-of-mappings non-match (FR-027 case 15 / FR-024 — added by /speckit-analyze C1 remediation)**: create `Sandbox/014-T0-mappings.md` with frontmatter `entries: [{author: "x", source: "a"}, {author: "y", source: "b"}]` (a list whose elements are themselves YAML mappings — rare but valid YAML). Probe: (a) `find_by_property({ property: "entries", value: "x", arrayMatch: true })` — scalar-against-list-of-objects → expected `{count: 0, paths: []}` (object element is never `===`-equal to a string scalar); (b) `find_by_property({ property: "entries", value: "x", arrayMatch: false })` — same expected outcome (scalar query against list-valued property never matches when arrayMatch is false). **CONTRACT**: FR-024's "list-valued properties whose elements are themselves YAML mappings MUST surface as `count: 0`, never as errors" — T0.5 verifies the JS template's matching logic naturally handles this via `===` (an object never strictly equals a scalar). The observation is the locked contract; if Obsidian crashes / errors / produces a non-zero count, the JS template needs an explicit defensive branch (NOT EXPECTED — Obsidian's metadata cache already preserves the structural shape per F3, and `===` is the only comparison path).

  **Cleanup**: after capture, ensure `Sandbox/` contains no `014-T0-*` files / dirs. Use `obsidian vault=TestVault-Obsidian-CLI-MCP delete path=Sandbox/014-T0-<name>.md` (to-trash; recoverable) for each fixture. Empty bulk dir via `rm -rf Sandbox/014-T0-bulk/`. The pre-existing `Welcome.md` at vault root is NEVER touched.

  **Constitution**: Principle IV (the captured wording becomes the source-of-truth for handler edge-case logic — preserves chain-of-custody from CLI to MCP client). FR-024, FR-027.

- [X] T002 [P after T001] **VERIFICATION + ADDITIVE TEST** — confirm the existing 011-R5 cli-adapter unknown-vault response-inspection clause at [src/cli-adapter/cli-adapter.ts:55-89](../../src/cli-adapter/cli-adapter.ts#L55-L89) works for the `eval` subcommand without source-code modification, and add a cross-subcommand test case to lock the inheritance. Two sub-tasks:

  - **(2a) Live verification** (already completed during plan stage — see [research.md Finding F7](research.md#f7--unknown-vault-response-shape)): `obsidian vault=NoSuchVault eval "code=app.vault.getName()"` returns `Vault not found.` on stdout, exit 0 — byte-identical to the create / delete / properties subcommands. The existing `UNKNOWN_VAULT_PREFIX = "Vault not found."` re-classifier handles `eval` identically. **No source-code changes to `src/cli-adapter/cli-adapter.ts` needed.**
  - **(2b) Adapter-test inheritance lock**: extend the existing 011-R5 / 012-T002 / 013-T002 unknown-vault test in [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) to add a `command: "eval"` row alongside the existing rows (or add a sibling `it()` block following the established pattern). Either way, the existing tests continue to pass for `create` / `delete` / `properties`. Header comment at [src/cli-adapter/cli-adapter.ts:1](../../src/cli-adapter/cli-adapter.ts#L1) already cites BI 011-write-note R5 / T002 + 012-delete-note T002; no header update needed (the clause is subcommand-agnostic).

  Depends on: T001 (loosely — T001 covers different cases; T002 is non-blocking confirmation of R5 inheritance for the `eval` subcommand).

  **Constitution**: Principle I (clause lives in the `cli-adapter` primitive, NOT in `find_by_property` — benefits all typed tools; this BI does NOT amend the primitive); Principle II (additive parameterised test case for the new subcommand). R5 inheritance.

**Checkpoint**: Foundational deliverables complete — handler logic is grounded in plan-stage-verified live-CLI wording (F1-F8) plus the 3 T0-locked cases. The R5 inheritance test now covers the `eval` subcommand. Phase 3 implementation can lock against the captured behaviour.

---

## Phase 3: User Story 1 — Scalar lookup + Folder + Array + Case + Validation + Unknown-vault (Priority: P1) 🎯 MVP

**Goal**: Ship the `find_by_property` module — schema, handler, registration — that delivers the core typed-tool surface. Implementation simultaneously satisfies User Stories 1, 2, 3, 4, 5, 6 acceptance criteria because they all exercise the same three source files. (Story 7 — documentation — is its own phase to keep doc-authoring and code-authoring loosely coupled. Story 8 — stable in-session ordering — is covered by handler test #18 + manual S-18.)

**Independent Test**: per [spec.md Story 1 IT](spec.md) — with a stub `spawnFn` injected via `deps`, `executeFindByProperty({ vault: "Demo", property: "id", value: "BI-030" }, deps)` against ONE stub child response (stdout `=> {"count":1,"paths":["a/b.md"]}`) returns `{ count: 1, paths: ["a/b.md"] }` AND the stub spawn was invoked ONCE with argv `["vault=Demo", "eval", "code=<rendered-js>"]` where the `code=` argv contains the frozen JS template prefix AND a base64 payload that decodes to the expected `{ property, value, folder, arrayMatch, caseSensitive }` object. Verifiable via `npx vitest run src/tools/find_by_property/handler.test.ts`.

### Implementation for User Story 1

- [X] T003 [US1] Create [src/tools/find_by_property/schema.ts](../../src/tools/find_by_property/schema.ts) and [src/tools/find_by_property/schema.test.ts](../../src/tools/find_by_property/schema.test.ts). Per [data-model.md §1](data-model.md#1-input-schema-zod-single-source-of-truth-per-constitution-iii) + [§2](data-model.md#2-output-schema-zod), [contracts/find-by-property-input.contract.md](contracts/find-by-property-input.contract.md). Depends on: nothing in this list (truly first source-code task).

  - **(3a) Author [src/tools/find_by_property/schema.ts](../../src/tools/find_by_property/schema.ts)** with the `// Original — no upstream. find_by_property input/output schemas — flat z.object (no target_mode discriminator per FR-002); polymorphic value union for type-faithful matching; folder-traversal regex per Q2/FR-021; cross-field superRefine rejecting array value when arrayMatch:true.` header (Principle V). Define:
    - `FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/` — exported constant for traceability + test reuse.
    - `findByPropertyInputSchema = z.object({ vault: z.string().min(1).optional(), property: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))]), folder: z.string().refine(v => !FOLDER_TRAVERSAL_REGEX.test(v), "folder must not contain '..' segments or start with '/' or '\\\\' (path-traversal escape)").optional(), arrayMatch: z.boolean().optional().default(true), caseSensitive: z.boolean().optional().default(true) }).strict().superRefine((input, ctx) => { if (Array.isArray(input.value) && input.arrayMatch === true) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "value cannot be an array when arrayMatch is true (default); pass a scalar for contains semantics, or set arrayMatch: false for exact-equality." }); } })` — exactly per [data-model.md §1](data-model.md#1-input-schema-zod-single-source-of-truth-per-constitution-iii). **NO `target_mode` discriminator** (FR-002 — the load-bearing departure).
    - `findByPropertyOutputSchema = z.object({ count: z.number().int().nonnegative(), paths: z.array(z.string()) }).strict()` — per FR-010.
    - `FindByPropertyInput = z.infer<typeof findByPropertyInputSchema>` and `FindByPropertyOutput = z.infer<typeof findByPropertyOutputSchema>` — type aliases ONLY (Principle III; no hand-rolled interfaces).
    - **No `.describe()` calls** (per ADR-005, SC-011).
  - **(3b) Author [src/tools/find_by_property/schema.test.ts](../../src/tools/find_by_property/schema.test.ts)** with the `// Original — no upstream. Tests for the find_by_property input schema — required field rules + polymorphic value union + cross-field superRefine + folder-traversal regex + defaults.` header. **18 test cases** per [data-model.md §8 schema.test.ts table](data-model.md#schemattests-ts---18-cases):
    - **(1) Story 5 AC#1** — `property: ""` rejected: `safeParse({ property: "", value: "x" }).success === false` AND issues include `path: ["property"]` with `code: "too_small"`.
    - **(2) Story 5 AC#2** — `property` omitted rejected: `safeParse({ value: "x" }).success === false` AND issues include `path: ["property"]` with `code: "invalid_type"`.
    - **(3) Story 5 AC#3** — `value` omitted rejected: `safeParse({ property: "id" }).success === false` AND issues include `path: ["value"]` with `code: "invalid_type"`.
    - **(4) Story 5 AC#4 (object)** — `value: { foo: "bar" }` rejected: `safeParse({ property: "id", value: { foo: "bar" } }).success === false` AND issues identify `value`.
    - **(5) Story 5 AC#4 (undefined → handled by required check)** — `value: undefined` rejected: equivalent to omitted; covered by case 3.
    - **(6) Story 5 AC#4 (array+arrayMatch:true via default)** — `value: ["x"]` rejected when `arrayMatch` defaulted: `safeParse({ property: "tags", value: ["x"] }).success === false` AND issues include the superRefine custom message about "arrayMatch is true (default)".
    - **(7) Story 3 AC#3** — `value: ["x"]` accepted when `arrayMatch: false`: `safeParse({ property: "tags", value: ["x"], arrayMatch: false }).success === true`.
    - **(8) Each scalar `value` type accepted** — parameterised `it.each` over `[ "x", 0, 7, true, false, null ]`; each `safeParse({ property: "p", value: <each> }).success === true`.
    - **(9) Story 5 AC#5** — unknown top-level key rejected: `safeParse({ property: "id", value: "x", foo: "bar" }).success === false` AND issues include `code: "unrecognized_keys"` with `keys: ["foo"]`.
    - **(10) Story 6 AC#1 / Q2 traversal escape** — `folder: ".."` rejected: `safeParse({ property: "id", value: "x", folder: ".." }).success === false` AND issues include `path: ["folder"]` with the custom message about `..` segments.
    - **(11) Q2 traversal escape — leading `..`**: `folder: "../foo"` rejected.
    - **(12) Q2 traversal escape — trailing `..`**: `folder: "foo/.."` rejected.
    - **(13) Q2 traversal escape — middle `..`**: `folder: "foo/../bar"` rejected.
    - **(14) Q2 traversal escape — leading `/` (Unix-absolute)**: `folder: "/abs"` rejected.
    - **(15) Q2 traversal escape — leading `\` (Windows-absolute)**: `folder: "\\abs"` rejected.
    - **(16) Regex word-boundary check** — `folder: "..foo"` accepted (the `..` is NOT bordered by separators on both sides; treated as part of a filename component).
    - **(17) Empty folder accepted** — `folder: ""` accepted (whole-vault search per FR-006).
    - **(18) Defaults applied** — `parsed = findByPropertyInputSchema.parse({ property: "id", value: "x" })`; assert `parsed.arrayMatch === true` AND `parsed.caseSensitive === true` (post-`.default(true)` on both fields).

  **Constitution**: Principle II (18 cases co-located); Principle III (single source of truth — schema is the only typed surface for input shape; the output schema is the only typed surface for output shape). FR-001..FR-009, FR-021, FR-026, SC-008, SC-010.

- [X] T004 [US1] Create [src/tools/find_by_property/handler.ts](../../src/tools/find_by_property/handler.ts) and [src/tools/find_by_property/handler.test.ts](../../src/tools/find_by_property/handler.test.ts). Per [data-model.md §3](data-model.md#3-js-template-frozen-string-constant-in-handlerts) + [§4](data-model.md#4-cli-invocation-argv-shape) + [§5](data-model.md#5-eval-response-parsing), [contracts/find-by-property-handler.contract.md](contracts/find-by-property-handler.contract.md), and [research.md R1, R2, R3, R4, R5, R6, R7, R10](research.md). Depends on: T003 (`FindByPropertyInput` / `FindByPropertyOutput` types).

  - **(4a) Author [src/tools/find_by_property/handler.ts](../../src/tools/find_by_property/handler.ts)** with the `// Original — no upstream. find_by_property handler: single invokeCli wrapper around the eval subcommand with a frozen JS template + base64 payload (R6 anti-injection); two-stage response parse (=> prefix strip + JSON.parse + output schema validate); R4 target_mode mapping (vault undefined → active, vault set → specific); count/paths invariant defensive check.` header (Principle V). Implement per [contracts/find-by-property-handler.contract.md §1-§5](contracts/find-by-property-handler.contract.md):
    - `executeFindByProperty(input: FindByPropertyInput, deps: ExecuteDeps): Promise<FindByPropertyOutput>`.
    - `ExecuteDeps = { logger: Logger, queue: Queue, spawnFn?: SpawnLike, env?: NodeJS.ProcessEnv }` — mirrors `executeReadProperty` exactly.
    - **NO per-call logger events** (per [research.md R1](research.md#r1--logger-surface-fr-observability-reconciliation) — handler is a thin `invokeCli` wrapper; observability via the cli-adapter's existing `dispatch*` events for the underlying call).
    - **`JS_TEMPLATE` frozen string constant** at module scope, per [data-model.md §3](data-model.md#3-js-template-frozen-string-constant-in-handlerts). The template is the IIFE that walks `app.metadataCache.fileCache` + `app.metadataCache.metadataCache`, applies the matching logic, and returns `JSON.stringify({count, paths})`. Single placeholder `__PAYLOAD_B64__` marks where the base64 payload is inserted at request time.
    - **Payload assembly**:
      ```ts
      const payloadJson = JSON.stringify({
        property: input.property,
        value: input.value,
        folder: input.folder ?? "",
        arrayMatch: input.arrayMatch,
        caseSensitive: input.caseSensitive,
      });
      const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
      const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
      ```
    - **Single `invokeCli` invocation**:
      - `target_mode: input.vault === undefined ? "active" : "specific"` (R4).
      - `vault: input.vault` (passed through; adapter ignores when `target_mode === "active"`).
      - `command: "eval"`.
      - `parameters: { code }` (single param).
      - `flags: []`.
    - **Two-stage response parse**:
      - Strip optional `=> ` prefix from `result.stdout.trimStart()`.
      - `JSON.parse` the remainder. On failure, throw `UpstreamError({code: "CLI_REPORTED_ERROR", cause: err, details: {stdout: result.stdout, stage: "json-parse"}, message: "find_by_property: eval response is not JSON: <stdout truncated>"})`.
      - `findByPropertyOutputSchema.safeParse` the JSON value. On failure, throw `UpstreamError({code: "CLI_REPORTED_ERROR", cause: parseErr.error, details: {stdout: result.stdout, stage: "schema-parse"}, message: "find_by_property: eval response shape unexpected"})`.
    - **Defensive count/paths invariant**: assert `validated.data.count === validated.data.paths.length`; on mismatch, throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stdout: result.stdout, stage: "count-paths-mismatch"}, message: "find_by_property: count !== paths.length (JS template bug)"})`. Defensive only — the JS template builds the envelope correctly by construction.
    - Return `validated.data`.
    - **Module size budget**: ≤ 130 LOC total file LOC (verified by `wc -l`). The JS template body adds bulk — if the file grows past 130 LOC, factor `JS_TEMPLATE` and `parseEvalResponse(stdout)` into a sibling `_template.ts` / `_parse.ts` module.
  - **(4b) Author [src/tools/find_by_property/handler.test.ts](../../src/tools/find_by_property/handler.test.ts)** with the `// Original — no upstream. Tests for the find_by_property handler — single-call argv assembly, base64 payload round-trip (R6 anti-injection lock), eval response parsing with => prefix, unknown-vault inheritance (R5), CLI error propagation, count/paths invariant, FR-023/FR-024 wrapper-non-transformation locks.` header. **24 test cases** per [data-model.md §8 handler.test.ts table](data-model.md#handlertestts---22-cases) (post-/speckit-analyze C2 remediation: 22 → 24, adding cases 23 + 24 to lock the FR-023 hierarchical-tag-rollup-not-performed and FR-024 list-of-mappings-non-match contracts at the test layer — previously docs-only). Each happy-path test asserts: parsed result, `argvCalls.length === 1`, argv shape `[<binary>, ...optional vault=<v>, "eval", "code=<rendered-js>"]`, and the `code=` argv's base64 payload decodes via `Buffer.from(<b64>, "base64").toString("utf-8")` + `JSON.parse` to the expected `{property, value, folder, arrayMatch, caseSensitive}` object.
    - **(1) US1 AC#1 — scalar string happy-path**: stub stdout `=> {"count":1,"paths":["backlog/BI-030.md"]}`; input `{ vault: "Demo", property: "id", value: "BI-030" }`; assert `{ count: 1, paths: ["backlog/BI-030.md"] }` AND argv contains `vault=Demo` AND base64 payload decodes to `{property:"id",value:"BI-030",folder:"",arrayMatch:true,caseSensitive:true}`.
    - **(2) US1 AC#4 — type-faithful number**: stub stdout `=> {"count":1,"paths":["x.md"]}`; input `{ vault: "Demo", property: "count", value: 7 }`; assert result + argv-payload `value: 7` (numeric, NOT string `"7"`).
    - **(3) US1 AC#5 — type-faithful boolean**: input `{ vault: "Demo", property: "archived", value: true }`; assert argv-payload `value: true`.
    - **(4) FR-014 — explicit-null query**: input `{ vault: "Demo", property: "explicit_null", value: null }`; assert argv-payload `value: null` (JSON null, not string `"null"`).
    - **(5) US1 AC#3 — no-match returns `{count:0, paths:[]}`, no error**: stub stdout `=> {"count":0,"paths":[]}`; assert returned envelope is `{count: 0, paths: []}` AND no error thrown.
    - **(6) US1 AC#2 — multi-match**: stub stdout `=> {"count":3,"paths":["a.md","b.md","c.md"]}`; assert returned `count === 3` AND `paths.length === 3`.
    - **(7) US2 AC#1 — folder-narrow happy-path**: input `{ vault: "Demo", property: "id", value: "BI-030", folder: "backlog" }`; stub stdout `=> {"count":1,"paths":["backlog/BI-030.md"]}`; assert argv-payload `folder: "backlog"`.
    - **(8) US2 AC#2 — folder-exclude returns no-match**: input `{ vault: "Demo", property: "id", value: "BI-030", folder: "archive" }`; stub stdout `=> {"count":0,"paths":[]}`; assert argv-payload `folder: "archive"` AND result is `{count: 0, paths: []}`.
    - **(9) US3 AC#1 — `arrayMatch: true` (default) — payload check**: input `{ vault: "Demo", property: "tags", value: "alpha" }`; assert argv-payload `arrayMatch: true` (defaulted) AND `value: "alpha"`.
    - **(10) US3 AC#3 — `arrayMatch: false` with array `value` — payload check**: input `{ vault: "Demo", property: "tags", value: ["alpha", "beta"], arrayMatch: false }`; assert argv-payload `arrayMatch: false` AND `value: ["alpha","beta"]`.
    - **(11) US4 AC#2 — `caseSensitive: false` — payload check**: input `{ vault: "Demo", property: "tag", value: "alpha", caseSensitive: false }`; assert argv-payload `caseSensitive: false`.
    - **(12) FR-003 — `vault` omitted → no `vault=` in argv (active-mode mapping)**: input `{ property: "id", value: "BI-030" }`; assert argv has NO `vault=` token AND base64 payload still encodes correctly.
    - **(13) FR-003 — `vault` supplied → `vault=` in argv**: covered by case 1 implicitly; an explicit assertion that argv[0] starts with `vault=` when `input.vault` is set.
    - **(14) US6 AC#1 — unknown vault → CLI_REPORTED_ERROR (R5 inheritance)**: stub stdout `Vault not found.\n`, exit 0; assert handler propagates `UpstreamError({ code: "CLI_REPORTED_ERROR" })` (cli-adapter's R5 re-classifier fires before the handler sees the response). Result is NOT `{count: 0, paths: []}` — anti-conflation per FR-017.
    - **(15) FR-019 — `CLI_NON_ZERO_EXIT` propagation**: stub exits 1 with stderr `"eval syntax error"`; assert handler propagates `UpstreamError({ code: "CLI_NON_ZERO_EXIT", details: { exitCode: 1, stderr: "eval syntax error\n" } })`.
    - **(16) FR-019 — `CLI_BINARY_NOT_FOUND` propagation**: stub `spawnFn` raises `Error` with `code: "ENOENT"`; assert handler propagates `UpstreamError({ code: "CLI_BINARY_NOT_FOUND" })`.
    - **(17) FR-019 — output-cap kill propagation**: stub raises `dispatchKill` (the dispatch-layer signal for cap exceedance); assert handler propagates `UpstreamError({ code: "CLI_NON_ZERO_EXIT" })` (the dispatch layer's wrapping). Confirms FR-012 / SC-014 — large match set produces structured error, not silent truncation.
    - **(18) Eval response WITHOUT `=> ` prefix parses anyway**: stub stdout `{"count":1,"paths":["x.md"]}` (bare JSON, no `=> ` prefix — tolerant parse); assert handler returns `{count: 1, paths: ["x.md"]}`.
    - **(19) Eval response is malformed JSON → `CLI_REPORTED_ERROR` parse stage**: stub stdout `=> not-valid-json`; assert handler propagates `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stage: "json-parse" } })`.
    - **(20) Eval response shape violates output schema → `CLI_REPORTED_ERROR` schema-parse stage**: stub stdout `=> {"wrong":"shape"}`; assert handler propagates `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stage: "schema-parse" } })`. Defensive backstop against an Obsidian internal-API change that breaks the JS template's response shape (R2 stability concern).
    - **(21) R6 anti-injection — `value: "'; alert(1); //"` survives base64 round-trip**: input `{ vault: "Demo", property: "key", value: "'; alert(1); //" }`; assert argv-payload's base64 string contains only `[A-Za-z0-9+/=]` characters AND decodes (via `Buffer.from(<b64>, "base64").toString("utf-8")` + `JSON.parse`) to a payload with `value: "'; alert(1); //"` exactly preserved. **Locks SC-017's structural-anti-injection contract.**
    - **(22) R6 anti-injection — `property: "name'; drop"` survives base64 round-trip**: input with `property` containing a single quote; same assertion as case 21. Confirms the anti-injection covers ALL user-supplied fields, not just `value`.
    - **(23) FR-023 — hierarchical-tag-rollup not performed (added by /speckit-analyze C2 remediation)**: input `{ vault: "Demo", property: "tags", value: "work" }`; stub stdout `=> {"count":0,"paths":[]}`; assert returned `{count: 0, paths: []}` AND argv-payload's decoded JSON has `value: "work"` exactly preserved (no rollup-transformation by the wrapper — e.g., the wrapper does NOT silently translate `"work"` to `"work/*"` or `["work","work/tasks"]`). Locks the wrapper's no-transformation contract per FR-023; the actual non-rollup matching is enforced by the JS template's `===` comparison (which is structurally non-rollup). This test is the wrapper-side mirror of that contract — guarantees a future refactor cannot introduce a rollup-translation step in the handler before the value reaches the JS template.
    - **(24) FR-024 — list-of-mappings query yields no-match envelope (added by /speckit-analyze C2 remediation)**: input `{ vault: "Demo", property: "entries", value: "x" }` (where `entries` is conceptually a list-of-mappings property in the vault); stub stdout `=> {"count":0,"paths":[]}`; assert returned `{count: 0, paths: []}` AND no error thrown AND argv-payload's decoded JSON has `value: "x"` (scalar) preserved. The handler-side test verifies the wrapper does NOT add a defensive type-of-property check before sending the query (the JS template handles list-of-mappings via `===` falsy comparison, returning `count:0` naturally). Locks the FR-024 wrapper-side contract — the JS template's empirical non-match behaviour is locked separately by T0.5 (live CLI). This test ensures a future refactor cannot inject a "reject list-of-mappings property at handler level" branch that would surface as an error rather than count:0.

  **Constitution**: Principle I (handler is a thin transformer; no `child_process.spawn` direct invocation per SC-011); Principle II (24 cases co-located, including the R6 anti-injection lock on every payload-bearing test AND the FR-023/FR-024 wrapper-non-transformation locks added by /speckit-analyze C2 remediation); Principle III (polymorphic value union enforced at schema; output schema enforced at handler); Principle IV (every `UpstreamError` propagated verbatim; no new codes per FR-019). FR-005, FR-010..FR-024, FR-026.

- [X] T005 [US1] Create [src/tools/find_by_property/index.ts](../../src/tools/find_by_property/index.ts) and [src/tools/find_by_property/index.test.ts](../../src/tools/find_by_property/index.test.ts). Per [contracts/find-by-property-handler.contract.md](contracts/find-by-property-handler.contract.md), [contracts/find-by-property-input.contract.md](contracts/find-by-property-input.contract.md), and the existing [src/tools/read_property/index.ts](../../src/tools/read_property/index.ts) precedent. Depends on: T003, T004.

  - **(5a) Author [src/tools/find_by_property/index.ts](../../src/tools/find_by_property/index.ts)** with the `// Original — no upstream. find_by_property tool registration via registerTool — wraps the { count, paths } envelope for the MCP wire.` header (Principle V). Mirror `read_property/index.ts` structure exactly:
    - Import `registerTool` from `../_register.js`, `executeFindByProperty, type ExecuteDeps` from `./handler.js`, `findByPropertyInputSchema` from `./schema.js`.
    - Export `FIND_BY_PROPERTY_TOOL_NAME = "find_by_property"`.
    - Export `FIND_BY_PROPERTY_DESCRIPTION` per FR-025: verb-led summary mentioning `help`, the tool's own name, the value→file lookup framing, and the `{count, paths}` output shape disclosure.
    - Export `RegisterDeps = ExecuteDeps`.
    - Export `createFindByPropertyTool(deps: RegisterDeps): RegisteredTool` — calls `registerTool({ name, description, schema, deps, handler })`.
  - **(5b) Author [src/tools/find_by_property/index.test.ts](../../src/tools/find_by_property/index.test.ts)** with the `// Original — no upstream. Tests for the find_by_property tool registration — descriptor shape, stripped schema, help mention, docs presence + content completeness, drift-detector parameterised lock.` header. **5 test cases**:
    - **(a) Story 7 — descriptor name**: `createFindByPropertyTool({ logger, queue }).descriptor.name === "find_by_property"`.
    - **(b) Story 7 + post-010 emitted-schema invariants**: emitted `inputSchema` has `type: "object"`, `additionalProperties: false`, `properties` has all 6 keys (`vault`, `property`, `value`, `folder`, `arrayMatch`, `caseSensitive`), `required` includes ONLY `["property", "value"]` (the rest are optional), AND zero `description` keys at any depth (walk via recursion). Per [contracts/find-by-property-input.contract.md §2](contracts/find-by-property-input.contract.md#2-emitted-json-schema-shape-after-zod-to-json-schema--stripschemadescriptions).
    - **(c) Story 7 — descriptor description**: non-empty AND contains literal substring `"help"` (case-insensitive) AND contains literal substring `"find_by_property"` AND contains a phrase surfacing the `{count, paths}` output shape (regex match for `/count.*paths|paths.*count/i`).
    - **(d) End-to-end VALIDATION_ERROR propagation + FR-018 spawn-spy gate**: inject a `deps.spawnFn` mock that throws `new Error("spawnFn called on validation failure — FR-018 violation")` if invoked. Call `createFindByPropertyTool({ logger, queue, spawnFn: spy }).handler({})` (missing required property + value); assert returned `ToolCallResult` is an `isError: true` envelope whose JSON-serialised payload has `code: "VALIDATION_ERROR"` AND assert the spawn-spy was NEVER called. Locks FR-018's "validation failures MUST occur strictly before any underlying CLI invocation" contract.
    - **(e) Story 7 / FR-025 docs presence + content completeness**: resolve [docs/tools/find_by_property.md](../../docs/tools/find_by_property.md) via `import.meta.url` per [research.md R13](research.md#r13--importmeta-url-path-resolution--coverage-threshold-preservation); assert file exists, does NOT contain the substring `<!-- TODO`, contains all 4 propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`), contains at least 4 example heading sections (`### Example` count ≥ 4), AND contains the multi-vault default-ambiguity limitation note (regex match for `/multi-?vault|multiple vaults|focused vault/i`). The doc itself is authored by T007.

  **Constitution**: Principle I (per-surface module entry point); Principle II (5 registration tests co-located); Principle III (the `inputSchema` is derived from the schema via `registerTool`'s `toMcpInputSchema` + `stripSchemaDescriptions` — no manual descriptor construction). FR-001, FR-025, FR-026, SC-008, SC-011, SC-012.

- [X] T006 [US1] Wire `find_by_property` into the MCP server. Edit [src/server.ts](../../src/server.ts):

  - **(6a)** Add the import in alphabetical position: `import { createFindByPropertyTool } from "./tools/find_by_property/index.js";` — placed between `createDeleteNoteTool` and `createHelpTool` imports (`delete_note` < `find_by_property` < `help`).
  - **(6b)** Add `createFindByPropertyTool({ logger, queue })` to the tools array between `createDeleteNoteTool({ logger, queue })` and `createHelpTool()` at [src/server.ts:67-68](../../src/server.ts#L67-L68).
  - **(6c)** Verify the registry-consistency test at [src/server.test.ts](../../src/server.test.ts) passes — the `assertToolDocsExist` aggregator now includes `find_by_property` and asserts [docs/tools/find_by_property.md](../../docs/tools/find_by_property.md) exists. (T007 authors that file; if T007 has not landed yet, this test FAILS until T007 lands. Acceptable transient failure within this BI's WIP — both T006 and T007 land in the same merge.)
  - **(6d)** Verify the post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `find_by_property` via its `it.each` registry walk. NO test-file modifications. Run `npx vitest run src/tools/_register.test.ts` — assert all `it.each` rows for `find_by_property` pass.

  Depends on: T005.

  **Constitution**: Principle I (two-line addition; no structural change to server.ts); Principle II (existing drift detector + registry-consistency test cover the new entry without test additions). FR-001, SC-011.

**Checkpoint**: Phase 3 complete. `find_by_property` is registered alongside `delete_note`, `help`, `obsidian_exec`, `read_note`, `read_property`, `write_note`. `tools/list` returns the post-010 flat descriptor for `find_by_property`. The 47 co-located tests (18 schema + 24 handler + 5 registration; bumped 22 → 24 by /speckit-analyze C2 remediation closing FR-023 / FR-024 coverage gaps) + the auto-covered drift detector + the registry-consistency test all pass. Stories 1, 2, 3, 4, 5, 6 acceptance criteria satisfied at the implementation layer (Story 7 docs gate is T007; Story 8 ordering is covered by handler test #18 + manual S-18).

---

## Phase 4: User Story 7 — Documentation surface (Priority: P2)

**Goal**: Author the new `docs/tools/find_by_property.md` body. Update sibling docs (index) to acknowledge the new tool. Story 7's tests in T005 case (e) ASSERT the doc's existence + content completeness; Phase 4 makes them pass.

**Independent Test**: per [spec.md Story 7 IT](spec.md) — `help({ tool_name: "find_by_property" })` returns the populated body (no TODO stub, all 4 error codes named, ≥4 worked examples covering scalar happy-path / folder-scoped / array-contains / case-insensitive, multi-vault default-ambiguity limitation documented). Verifiable by file inspection (T007 + T008 outputs) and by the index.test.ts case (e) added in T005.

- [X] T007 [P] [US7] Author [docs/tools/find_by_property.md](../../docs/tools/find_by_property.md) (NEW file — the `assertToolDocsExist` aggregator does NOT pre-populate stubs; T006's registry-consistency test will fail until this lands). Per FR-025 + Story 7 AC#1. Different file from src/, fully parallelisable with T003-T006.

  **Document content** (sections required):
  - **Header**: title (`# Find By Property (find_by_property)`), one-paragraph summary mentioning the typed surface + the value→file framing (replaces the "guess the path from convention" 1-5 call sequence) + the `{count, paths}` output shape.
  - **Input schema**: per-field policy table (matches [contracts/find-by-property-input.contract.md §3](contracts/find-by-property-input.contract.md#3-field-policy)). Document the 6 fields, their types, defaults, and required-vs-optional status.
  - **Output shape**: `{ count: number, paths: string[] }` — describe `count === paths.length` invariant, the in-session ordering stability (FR-022 / SC-018), the no-error-on-zero-match semantic.
  - **Error roster**: all 4 propagated codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`) with one-or-two sentences each describing when each surfaces. Specifically call out: (a) unknown-vault produces `CLI_REPORTED_ERROR`, NOT a silent zero-match (FR-017 / US6); (b) `folder` traversal escape produces `VALIDATION_ERROR` before any CLI call (FR-021 / Q2); (c) the cli-adapter's existing 10 MiB output cap fires for pathologically large match sets as `CLI_NON_ZERO_EXIT`, never silent truncation (FR-019 / SC-014). NO new codes.
  - **Worked examples (≥4 per Story 7 AC#1 / FR-025)**:
    - (i) **Scalar happy-path** — `find_by_property({ vault: "Demo", property: "id", value: "BI-030" })` → `{ count: 1, paths: ["backlog/BI-030.md"] }`.
    - (ii) **Folder-scoped narrow** — `find_by_property({ vault: "Demo", property: "status", value: "queued", folder: "backlog" })` → only matches under `backlog/`.
    - (iii) **Array contains (default `arrayMatch: true`)** — `find_by_property({ vault: "Demo", property: "tags", value: "alpha" })` → matches every note whose `tags` list contains `"alpha"`.
    - (iv) **Case-insensitive opt-in** — `find_by_property({ vault: "Demo", property: "tag", value: "alpha", caseSensitive: false })` → matches `Alpha`, `ALPHA`, etc.
    - (v) [optional] **Array exact-equality (`arrayMatch: false`, order-sensitive)** — `find_by_property({ property: "tags", value: ["alpha", "beta"], arrayMatch: false })` → matches only notes with `tags: [alpha, beta]` in that exact order; `[beta, alpha]` does NOT match (per Q1).
    - (vi) [optional] **Type-faithful numeric** — `find_by_property({ property: "count", value: 7 })` matches the number `7`, NOT the string `"7"`.
  - **Adversarial-edge-case behaviours**:
    - **Multi-vault default ambiguity (Q3 / R11)**: prominently note that when `vault` is omitted in a multi-vault setup the underlying CLI's focused-vault default may resolve ambiguously (no Obsidian instance running, no vault foregrounded, or two vaults equally foregrounded). Multi-vault users requiring vault-scoped certainty MUST supply `vault` explicitly. Cite [research.md R11](research.md#r11--multi-vault-default-ambiguity-q3--documented-limitation).
    - **eval-as-CLI-entry-point stability concern (R2)**: explain that `find_by_property` is implemented atop the Obsidian CLI's developer-section `eval` subcommand because no native find-by-property subcommand exists. The wrapper reaches into Obsidian's internal `app.metadataCache` API. Future Obsidian updates may surface as test failures rather than silent drift; the wrapper's response-shape parse step is the structural backstop.
    - **Order-sensitivity (Q1)**: when `arrayMatch: false` and `value` is an array, the comparison is **positional**. `[alpha, beta]` does NOT equal `[beta, alpha]`. Set-membership / multiset matching is NOT supported; callers needing it compose two `arrayMatch: true` calls and intersect.
    - **Date / datetime comparison** (cite T0.1 capture): document the observed comparison semantics — whether YAML dates compare as strings or as Date objects.
    - **Unicode NFC vs NFD** (cite T0.2 capture): document that the wrapper does NOT perform Unicode normalisation; two strings that compare equal in NFC but differ in raw bytes (NFC vs NFD) may not match each other. Callers needing normalisation should supply both forms or normalise client-side.
    - **Hierarchical-tag rollup is NOT performed** (FR-023): a query for `value: "work"` against a `tags` field MUST NOT match `tags: [work/tasks]`. Frontmatter tags are matched as opaque values.
    - **List-of-mappings non-match** (FR-024): a list-valued property whose elements are themselves YAML mappings surfaces as `count: 0` (no match), never an error.
    - **Folder path-traversal escape (FR-021 / Q2)**: a `folder` value containing any `..` path segment OR starting with `/` `\` is rejected at the schema validation boundary with `VALIDATION_ERROR`. No CLI dispatch occurs. Defence-in-depth: the JS template's `path.startsWith(prefix)` check operates against in-memory cache keys (vault-relative paths only); even if a traversal escape slipped past the schema, the cache contains no path outside the vault root.
    - **In-session output stability (FR-022 / SC-018)**: the same query within one MCP server session with no intervening vault state change returns byte-identical `paths` arrays. Order is NOT guaranteed across sessions or vault state changes (file additions / removals reorder the cache).
  - **Anti-injection structural guarantee (R6 / SC-017)**: brief callout explaining the implementation's structural anti-injection contract — user-supplied `property`, `value`, `folder` flow through `JSON.stringify` → base64 → frozen JS template's `atob` + `JSON.parse`. No user input ever reaches the JS source as text. The base64 alphabet `[A-Za-z0-9+/=]` is structurally safe inside any JS string literal. Most callers don't need to care; surfacing it for security-conscious reviewers.
  - **Cross-references**: links to the [cli-adapter](../../specs/003-cli-adapter/spec.md), the [help tool](../../specs/005-help-tool/spec.md), and `read_note` / `write_note` / `delete_note` / `read_property` as the sibling typed tools.

  **Header convention**: NO `// Original — no upstream.` header (Markdown documentation is exempt per [005-help-tool FR-019](../005-help-tool/spec.md)). NO `<!-- TODO -->` markers.

  **Constitution**: Principle V (Markdown exempt from source-header convention per existing precedent); ADR-005 (progressive-disclosure documentation lives in docs/, not in schema). FR-025, SC-012.

- [X] T008 [P] [US7] Update [docs/tools/index.md](../../docs/tools/index.md) — add a one-line summary for `find_by_property` per the existing convention. Match the established style for existing entries (typically `- [<tool_name>](<tool_name>.md): <one-sentence summary>`). The summary MUST surface the value→file lookup framing (e.g., `- [find_by_property](find_by_property.md): Find notes whose frontmatter property matches a given value (returns { count, paths } — the value→file inverse of read_property).`). Different file from T007; can run in parallel.

  **Constitution**: Principle V (Markdown exempt). FR-025.

**Checkpoint**: Phase 4 complete. `help({ tool_name: "find_by_property" })` returns the populated body. T005 case (e) passes (was failing prior — required T007 to land). The full `find_by_property` BI surface is now shippable.

---

## Phase 5: Polish & Release

**Purpose**: Release artifacts (CHANGELOG, package.json), end-to-end verification (quickstart S-1..S-15), manual verifications (S-16..S-18), and PR Constitution Compliance.

- [X] T009 [P] Update [package.json](../../package.json) `description` field to mention `find_by_property` alongside the existing typed tools. Current text (post-013): `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), write_note (typed create/overwrite tool), delete_note (typed delete tool with safety defaults), and read_property (typed surgical frontmatter-property read)."`. Update to: `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), write_note (typed create/overwrite tool), delete_note (typed delete tool with safety defaults), read_property (typed surgical frontmatter-property read), and find_by_property (typed value-to-file lookup over frontmatter)."`. No other package.json changes here (the version bump is in T010).

  **Constitution**: N/A (release-metadata only).

- [X] T010 Add a [CHANGELOG.md](../../CHANGELOG.md) release entry for `0.2.7` per the project's release convention. Bump `package.json:version` from `0.2.6` to `0.2.7` (PATCH bump per plan — purely additive surface; no breaking changes; the new typed surface for value→file lookup is a new tool-surface addition, not a behaviour change to existing tools). The CHANGELOG entry should:

  - **Add**: `find_by_property` typed MCP tool wrapping the Obsidian CLI's `eval` subcommand with a frozen JS template that walks `app.metadataCache`. Returns `{ count, paths }` — vault-relative paths of every note whose named frontmatter property matches the supplied value. Replaces the agent's "guess the path from convention" sequence (1–5 calls per identifier resolution) with a single typed call. Six-axis matching: scalar / array (contains or exact-equal) / case-sensitive or insensitive / folder-scoped or whole-vault / type-faithful (number 7 distinct from string "7") / null-vs-absent.
  - **Note**: this is the FIRST typed tool that does NOT use the project's `target_mode` discriminator (FR-002 — find_by_property is inherently vault-wide). The schema is a fresh `z.object({...}).strict().superRefine(...)` rather than `applyTargetModeRefinement(...)`.
  - **Note**: anti-injection is structural (R6) — user inputs flow through `JSON.stringify` → base64 → frozen JS template's `atob` + `JSON.parse`. No user input ever reaches the JS source as text.
  - **Note**: `arrayMatch: false` is order-sensitive — `[α,β]` does NOT equal `[β,α]` per the [Q1 clarification](../014-find-by-property/spec.md#clarifications). Set-membership semantics use `arrayMatch: true` (contains).
  - **Note**: `folder` field rejects path-traversal escapes (`..` segments, leading `/` `\`) at the schema validation boundary per the [Q2 clarification](../014-find-by-property/spec.md#clarifications) — security control.
  - **Note**: when `vault` is omitted in a multi-vault setup the focused-vault default may resolve ambiguously (per the [Q3 clarification](../014-find-by-property/spec.md#clarifications)) — multi-vault users supply `vault` explicitly.
  - **Note**: `obsidian_exec` remains the freeform escape hatch for unwrapped subcommands.
  - **Reference**: link to `specs/014-find-by-property/spec.md` for the full BI specification.

  Depends on: T007 (the docs that callers will use are in place before the release names them).

  **Constitution**: N/A (release-metadata).

- [X] T011 Run [quickstart.md](quickstart.md) S-1..S-15 verification (CI-runnable + sanity-check scenarios). Specifically:

  - **S-1 / S-3 / S-6**: `npm run test` — assert 0 failures; the 47 new tests across schema/handler/index pass (post-/speckit-analyze C2 remediation: 45 → 47).
  - **S-2 / S-13**: drift detector + registry-consistency test pass for `find_by_property`.
  - **Module-size budget**: `wc -l src/tools/find_by_property/handler.ts` ≤ 130; `wc -l src/tools/find_by_property/schema.ts` ≤ 80; `grep -nE "child_process\.spawn|spawn\(" src/tools/find_by_property/handler.ts` returns no matches (handler routes through `invokeCli`, not direct spawn).
  - **Type single-source-of-truth**: `grep -nE "^(interface|type)\s+FindByProperty.*=.*\{" src/tools/find_by_property/schema.ts` returns no matches (type ALIASES via `z.infer` are permitted; hand-rolled interfaces are forbidden per Principle III).
  - **No `.describe()` calls**: `grep -nE "\.describe\(" src/tools/find_by_property/schema.ts` returns no matches (per ADR-005, SC-008).
  - **S-14 (manual deliberate-revert sanity check)**: pick ONE critical line in [src/tools/find_by_property/handler.ts](../../src/tools/find_by_property/handler.ts) (e.g., the base64-encoding of the payload — replace `Buffer.from(payloadJson, "utf-8").toString("base64")` with `payloadJson` so the payload is interpolated raw); revert it temporarily; run `npx vitest run src/tools/find_by_property/`; assert at least 1 test fails (specifically test #21 or #22 — the anti-injection round-trip assertions). Restore the line via `git checkout`. Confirms the new tests actually exercise the new code paths.
  - **Single-call architecture (R3)**: every handler test asserts `argvCalls.length === 1`. Per R3.
  - **Anti-injection guarantee (R6)**: `grep -E "code=" src/tools/find_by_property/handler.ts` confirms the `code=` parameter is built via `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` and NOT by string concatenation of user input. The frozen JS template's body is unchanged across all queries.
  - **docs/tools/find_by_property.md greps**: file exists, contains `<!-- TODO` zero times, all 4 error codes mentioned, ≥4 example heading sections, multi-vault default-ambiguity note present, eval-as-CLI-entry-point stability concern present.
  - **Aggregate coverage gate**: aggregate statements coverage ≥ 89.6% (per [vitest.config.ts:20](../../vitest.config.ts#L20)).
  - **SC-011 — frozen-surface diff check**: `git diff main..HEAD -- src/tools/obsidian_exec/ src/tools/help/ src/tools/read_note/ src/tools/write_note/ src/tools/delete_note/ src/tools/read_property/ src/cli-adapter/ src/target-mode/ src/errors.ts src/logger.ts src/queue.ts` returns empty (no substantive diff in any sibling tool's module or any frozen primitive — except for the 011-R5 inheritance test additions in T002 which add a single `command: "eval"` parameterised case to `cli-adapter.test.ts`); `git diff main..HEAD -- src/server.ts` shows ≤4 added lines (one import + one tools-array entry + alphabetical placement).

  Depends on: T001-T010.

  **Constitution**: Principle II (full test suite passes); Principle III (zod single-source-of-truth verified); Principle IV (no new error codes, all failures structured). FR-026, SC-008, SC-010, SC-011, SC-013, SC-014, SC-017.

- [ ] T012 [P] Manual S-16 (token-saving observability) + S-17 (anti-injection structural verification) + S-18 (in-session output stability) from [quickstart.md](quickstart.md). Run against MCP Inspector / Claude Desktop with a fresh `npm run build` of the server. Capture:

  - **S-16**: token-count comparison between `find_by_property({ property: "id", value: "BI-030" })` and the prior 1–5-call workflow (full-file `read_note` plus client-side YAML parsing). Assert the `find_by_property` response is observably smaller (≤ ~200 chars structured response per SC-016) AND the agent's overall turn count for the lookup is reduced.
  - **S-17**: source-inspection of [src/tools/find_by_property/handler.ts](../../src/tools/find_by_property/handler.ts): (1) `JS_TEMPLATE` is a frozen string constant declared at module scope; (2) the only insertion into `JS_TEMPLATE` is the base64 payload via `replace("__PAYLOAD_B64__", payloadB64)`; (3) `payloadB64` is `Buffer.from(payloadJson, "utf-8").toString("base64")` with NO string concatenation of user inputs. Run an injection-attempt query (e.g., `value: "'; alert(1); //"`) against MCP Inspector; capture the runtime argv via the Inspector's request log and verify the JS template body is unchanged across all queries; only the base64 string varies.
  - **S-18**: invoke `find_by_property` twice in a row with identical input AND no intervening vault state change. Assert both responses' `paths` arrays are equal element-for-element in the same order (byte-identical response payloads).

  Captures the token-saving win (SC-016), the structural-anti-injection contract (SC-017), and the in-session ordering stability (SC-018).

  Depends on: T009 (built `dist/` ready for client loading) and T010 (the version/CHANGELOG that the PR description will reference).

  **Constitution**: Principle IV (real-CLI failure paths verified through real clients, not just stubs). SC-011, SC-016, SC-017, SC-018.

- [ ] T013 Fill the PR description's Constitution Compliance checklist (5/5 PASS expected per [plan.md Constitution Check](plan.md#constitution-check)). Also note in the PR description: (a) the FR-027 T0 capture results from T001 (which 5 deferred cases — 3 plan-enumerated + T0.4 / T0.5 added by /speckit-analyze C1 remediation — were verified with their wording), (b) NO plan-stage spec amendments (per R14 + the no-amendments paragraph in research.md — all spec contracts hold), (c) the resolution of the Q1 / Q2 / Q3 clarifications (codified in spec before plan; reaffirmed by live verification matrix), (d) the **scope-N/A** treatment of ADR-003 (target-mode) — find_by_property is value→file with no single-file or active-file concept; the ADR is NOT amended, just doesn't apply, (e) the /speckit-analyze remediation summary (1 HIGH C1 + 3 MEDIUM C2/A1/A2 + 5 LOW I1/I2/U1/C3/D1 — all dispositioned per [research.md §Plan-stage analyzer remediation](research.md#plan-stage-analyzer-remediation-2026-05-09)). Include links to the spec / plan / research / data-model / contracts artifacts. Per Constitution v1.2.0 §Development Workflow #8.

  Depends on: T001-T012.

  **Constitution**: §Development Workflow #8 (PR-level checklist). Principle I, II, III, IV, V verification.

**Checkpoint**: BI ready to merge. All 18 quickstart scenarios pass (15 CI + 3 manual); PR description complete; coverage gate green; manual end-to-end verifications captured. The PR can be opened for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: skipped — toolchain ready.
- **Foundational (Phase 2)**: T001 first, T002 [P after T001] (T002 is verification-only — confirms the existing 011-R5 cli-adapter clause works for `eval`; not blocking on T001's substance, only on T001's existence as a dependency-marker). Loosely BLOCKS Phase 3 — the deferred T0 cases (date/datetime, NFC/NFD, large match-set cap) are characterisations that inform documentation (T007) more than handler logic (T004); T004 can technically begin once T003 is done, but T007's docs need T0.1 / T0.2 captures.
- **User Story 1 (Phase 3)**: T003 → T004 → T005 → T006 (sequential per file dependencies). T006 depends on T007 for docs (registry-consistency test fails until T007 lands — but both T006 and T007 land in the same merge; transient WIP failure acceptable).
- **User Story 7 (Phase 4)**: T007 + T008 file-disjoint; can run in parallel ([P]).
- **Polish (Phase 5)**: T009 in parallel with T010, then T011 (depends on all prior), then T012 (depends on T009/T010), then T013 (depends on all).

### User Story Dependencies

- **User Story 1**: depends on Foundational (T001 for T0 captures). Deliverable spans T003 + T004 + T005 + T006. **Note**: this BI's "User Story 1 ship" effectively ALSO delivers Stories 2, 3, 4, 5, 6 because they exercise the same source files. The story-tag discipline maps acceptance criteria to test cases (per FR-026), not to separable implementation slices.
- **User Story 7**: depends on T005's index.test.ts case (e) + T007's docs authoring; deliverable is T007 + T008. Independent of Stories 1-6 in spirit (docs vs. code), but the index.test.ts case (e) couples them in test order.
- **User Story 8** (P3 stable in-session ordering): no dedicated implementation tasks. Covered by handler test #18 (eval response without `=> ` prefix parses anyway — implicitly exercises the in-process pure-function semantics that produces stable order) PLUS manual S-18 in T012.

### Within Each User Story

- Within US1: schema (T003) before handler (T004) before registration (T005) before server-wire (T006). Test cases land WITH their source file (no separate red-green TDD loop per project convention).
- Within US7: T007 / T008 are file-disjoint — fully parallelisable.

### Parallel Opportunities

- **T002** can run in parallel with T003-T006 once T001 is complete (T002 touches `cli-adapter`, T003-T005 touch `find_by_property/`, T006 touches `server.ts` — all file-disjoint).
- **T007 + T008** run in parallel with each other.
- **T007** can run in parallel with T003-T006 (file-disjoint).
- **T009** can run in parallel with T010.
- **T012** can run in parallel with T011 once T009/T010 are done (T012 is manual against a built `dist/`; T011 is automated against the source).

### Blocking-task Summary

| Blocker | Blocks | Reason |
|---|---|---|
| T001 | T007 (T0.1 date semantics + T0.2 NFC/NFD captures need to land in docs) | Live-CLI characterisation locks doc-stage adversarial-edge-case content |
| T003 | T004 (`FindByPropertyInput` import), T005 (`findByPropertyInputSchema` import) | Type/schema dependency |
| T004 | T005 (`executeFindByProperty` import) | Function dependency |
| T005 | T006 (`createFindByPropertyTool` import) | Factory dependency |
| T007 | T006 PASSING (registry-consistency test) | Doc must exist for `assertToolDocsExist` |
| T009 + T010 | T011 (CI verification needs version + CHANGELOG in place) | Release-metadata coupling |
| T011 | T012 (manual verification needs CI green first) | Confidence ordering |
| T012 + T013 | merge | PR completeness |

---

## Parallel Example: User Story 1 + Story 7 in parallel after Foundational

```text
# After T001 + T002 land:

# Track A — find_by_property source modules (sequential per file dep):
T003 (schema.ts + schema.test.ts)
  └─> T004 (handler.ts + handler.test.ts)
        └─> T005 (index.ts + index.test.ts)
              └─> T006 (server.ts wire-up)

# Track B — docs (parallelisable with track A):
T007 (docs/tools/find_by_property.md)        [P with T003-T006]
T008 (docs/tools/index.md update)            [P with T003-T006 AND with T007]
```

A solo implementer typically lands T003-T008 sequentially in commit order: T003 → T004 → T005 → T007 → T006 → T008 (with T007 BEFORE T006 so the registry-consistency test passes immediately). A two-implementer team can split tracks A and B.

---

## Implementation Strategy

### MVP First (User Story 1 — Stories 1, 2, 3, 4, 5, 6)

1. T001 (foundational live-CLI characterisation; 5 deferred cases against the authorised TestVault Sandbox — 3 plan-enumerated + T0.4 index staleness + T0.5 list-of-mappings added by /speckit-analyze C1 remediation).
2. T002 (verification-only — confirms 011-R5 cli-adapter clause works for `eval` subcommand; additive parameterised test).
3. T003 → T004 → T005 → T007 (out-of-order to satisfy T006's docs-presence test) → T006.
4. **STOP and VALIDATE**: run `npm run test`; assert 47 new tests pass; assert drift detector + registry-consistency tests pass; assert single-call architecture asserts on every handler test (R3); assert anti-injection round-trip assertions (tests 21, 22) pass distinguishably from happy-path tests; assert FR-014 null-disambiguation (test 4) distinguishes from the no-match case; assert FR-023 / FR-024 wrapper-non-transformation locks (tests 23, 24) hold.
5. The MVP is now `find_by_property` registered + schema + handler + index + docs. Stories 1-6 acceptance criteria all satisfied.

### Incremental Delivery

The 014-find-by-property BI is fundamentally a single atomic ship — there is no "ship a partial find_by_property" intermediate state because the schema/handler/index are tightly coupled. The "incremental" framing applies to the FOLLOW-UP BIs that compose on `find_by_property`: BI candidates are `query_frontmatter` (multi-criterion property-AND matching), `find_by_property_pattern` (regex / glob value matching), `find_by_tag_hierarchy` (hierarchical-tag rollup using Obsidian's tag index). Each is a separate BI; this BI delivers the equality-only single-property surface only.

### Quality Gates (in order)

1. T011 — `npm run test` green; coverage ≥ 89.6%; greps pass; single-call architecture verified at handler-test layer; anti-injection round-trip locked (tests 21, 22); deliberate-revert sanity check (S-14) passes.
2. T012 — manual S-16 against MCP Inspector / Claude Desktop (token-saving observation); S-17 source-inspection + injection-attempt argv capture (anti-injection structural verification); S-18 in-session ordering (byte-identical paths arrays across two identical calls).
3. T013 — Constitution Compliance checklist filled; ADR-003 scope-N/A note included; Q1/Q2/Q3 clarification resolutions cited; T0 capture results from T001 included.
4. PR opened, reviewed, merged.
5. T010's `0.2.7` version bump triggers an `npm publish` per the project release convention.

---

## Notes

- **[P] tasks** = different files, no dependencies on incomplete tasks in this list. Conservative reading; when in doubt, sequence them.
- **[Story] label** = the primary story this task delivers. The full story-to-test mapping lives in [data-model.md §8 test inventory](data-model.md#8-test-inventory-per-fr-026--sc-013---30-cases-total) so test cases can be read either by source-file (the implementation's organisation) or by user story (the spec's organisation).
- **No separate red-green TDD loop** — every task lands with its co-located tests in the same change; the verify-fails-first sanity check is captured manually once via T011's S-14 step (deliberate revert on a scratch branch).
- **Single-call architecture is non-negotiable** — every handler test MUST assert `argvCalls.length === 1`. The R3 contract is a load-bearing invariant that distinguishes find_by_property from 013-read-property's two-call architecture.
- **Anti-injection is structural, not behavioural** — every payload-bearing handler test MUST decode the `code=` argv's base64 substring and assert the decoded JSON matches the input. The R6 contract is the structural anti-injection guarantee per FR-020 / SC-017.
- **Commit cadence**: one task per commit. Subject per the project's `feat(014-find-by-property): <task description>` convention; body cites task ID + sub-task IDs (e.g., `T003 (3a, 3b)`) + FR/SC/R references.
- **CLAUDE.md follow-up**: after this BI merges, the SPECKIT context block in [CLAUDE.md](../../CLAUDE.md) flips to point at the next active feature. Not part of this BI's task list — handled by the next feature's `/speckit-plan`.
- **Avoid**: vague tasks (every task here cites file + sub-tasks); cross-file conflicts (every task names its target files); silently dropping the single-call assertion or the anti-injection round-trip; assuming a target_mode discriminator (this BI explicitly departs from it per FR-002).
