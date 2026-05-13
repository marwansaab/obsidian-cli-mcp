---
description: "Task list for 023-outline — Structured Heading Outline of a Vault Note"
---

# Tasks: Outline — Structured Heading Outline of a Vault Note

**Input**: Design documents from [`/specs/023-outline/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT a separate red/green TDD loop; every implementation task lands with its co-located test cases in the same task. Total target: 52 tests across the new module (18 schema / 29 handler / 5 registration — post-/speckit-analyze U1 remediation 2026-05-13: 28 → 29 handler cases added SC-012 token-cost regression). The verify-fails-first sanity check is captured exactly once, manually, by S-deliberate-revert in T016 (parity with predecessors).

**Organization**: Tasks are grouped by user story per the project convention. The `outline` module is fundamentally a single atomic ship — Stories 1, 2, 3, 4, 5 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 6 is the documentation layer. The `[USx]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md § Test inventory](data-model.md#test-inventory-51-cases) maps each test case to its source User Story.

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code):

- **R2 — native `outline` subcommand wrap (NOT eval)**: probed live 2026-05-13 (F1). `obsidian outline format=json` returns `[{level, heading, line}]` directly — the wrapper's wire shape. NO eval composition, NO JS template, NO base64 payload. Stark contrast to BI-014 / BI-015 / BI-018 patterns.
- **R3 — single-call architecture branched on `input.total`**: ONE `invokeCli` invocation per request. Default mode → `format=json` parameter only. Count-only mode → `total` flag only (the two are mutually exclusive at upstream per F14).
- **R9 — empty-outline sentinel detection (LOAD-BEARING)**: zero-heading files return upstream literal `No headings found.` plain text — NOT `[]` JSON, NOT integer `0`. Handler MUST detect this sentinel BEFORE attempting JSON.parse / integer parse and map both modes to `{ count: 0, headings: [] }`. The only handler-side branch logic that escapes the "thin handler" pattern.
- **R8 — non-`.md` filetype rejection (FR-027) satisfied entirely by upstream + dispatch-layer classifier**: probed live (F9). Upstream returns `Error: File is not a markdown file.` exit 0; dispatch layer's existing `Error:`-prefix classifier maps to `CLI_REPORTED_ERROR`. ZERO wrapper-side filetype guard required.
- **R5 — vault routing limitation INHERITED**: probed live (F8). `vault=` is silently honoured-as-noop; focused vault is always used. The 011-R5 unknown-vault response-inspection clause does NOT fire for `outline` (no "Vault not found." string). Documented limitation; multi-vault users open the target vault before invoking. Parity with `files`. **Note**: post-/speckit-analyze I1 remediation 2026-05-13, FR-016 + SC-005 were amended to defer-to-upstream pattern (the spec-stage assumption that drove "MUST reclassify to CLI_REPORTED_ERROR" was contradicted by F8 — see [spec.md ## Clarifications ### Plan-stage findings 2026-05-13](spec.md#plan-stage-findings-2026-05-13)). T005 case 22 verifies the amended contract.
- **R11 — Setext defer-to-upstream (PLAN-STAGE SPEC AMENDMENT)**: F10 — live probe revealed upstream INCLUDES Setext entries, contradicting spec-stage FR-013. Plan applied the same defer-to-upstream pattern locked for indented-code-blocks in clarifications-session Q2/A2. Spec FR-013 amended at plan stage; wrapper does NOT filter Setext entries.
- **F1 / FR-008 — field rename `heading` → `text`**: upstream's per-entry text field is named `heading` (singular); wrapper output uses `text`. Handler's parse step performs the 1:1 rename during the upstream-to-wrapper transform.
- **Q1 / Q2 / Q3 clarifications session 2026-05-13** (codified in spec.md): Q1 (marker-stripping) → strip-leading-marker + closing-ATX + surrounding-whitespace (satisfied automatically by upstream per F3); Q2 (indented-code-block opacity) → defer to upstream (confirmed F12); Q3 (non-`.md` rejection) → wrapper boundary (actually satisfied entirely by upstream + dispatch-layer classifier per F9).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers. Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read` / `delete` / `files` / `read_heading` / `read_property` / `set_property` / `rename` / `write_note` / `find_by_property`). All paths are relative to the repo root. Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at [src/tools/outline/](../../src/tools/outline/) (does NOT exist yet — created by T002–T004).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–022). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler against verified wording for the cases deferred from plan stage (per [research.md § Plan-stage status](research.md#design-decisions)).

**Note on plan-stage coverage**: 16 architecture-locking findings (F1–F16) were verified live during plan stage on 2026-05-13 — see [research.md § Live-CLI findings](research.md#live-cli-findings-probed-2026-05-13-against-testvault-obsidian-cli-mcp). T001 below covers the 4 cases deferred to T0 because they require either fixtures NOT seeded at plan stage, multi-extension verification, or no-focus state.

- [X] T001 Live-CLI characterisation of the 4 deferred T0 cases. Run probes against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  - **(T0.1) Active-mode no-focus error string (R13 verification)**: open Obsidian and close all tabs (no file focused). Probe: `obsidian outline format=json` (no vault, no path/file). **Expected per R13**: `Error: no active file` exit 0 → dispatch-layer auto-classifier maps to `ERR_NO_ACTIVE_FILE`. **TRIGGER**: if the error string differs (e.g. `Error: No active markdown file.` or different wording), document the actual string in research.md and update T004's handler test (case 24 — active-mode no-focus) to assert against the actual upstream wording. The dispatch-layer classifier may need to grow a new substring match if the wording doesn't match the existing patterns — escalate to user before adding new classifier logic.

  - **(T0.2) Multi-extension non-`.md` rejection (FR-027 / SC-021 verification)**: seed three files in `Sandbox/`: `outline-T0-canvas.canvas` (`{"nodes":[],"edges":[]}` body), `outline-T0-pdf.pdf` (any small PDF — can copy a system file or generate a 1-byte stub `%PDF-1.0\n`), `outline-T0-image.png` (any image — copy from another vault location or generate a tiny PNG header). Probe each: `obsidian outline path=Sandbox/outline-T0-<ext>.<ext> vault=TestVault-Obsidian-CLI-MCP format=json`. **Expected**: `Error: File is not a markdown file.` exit 0 for all three (per F9 already verified for `.canvas`). Lock the actual error message in T004's handler test (case 23 — non-`.md` rejection) by asserting on the upstream message text. **TRIGGER**: if any extension produces a different error message or different exit code, document and reconcile; SC-021's "at least three Obsidian-recognised non-Markdown extensions" requires all three to map cleanly to `CLI_REPORTED_ERROR`.

  - **(T0.3) CRLF / LF parity (Q-19 / SC-019 verification)**: seed `Sandbox/outline-T0-crlf.md` with CRLF line endings (`("# Heading 1`r`n`r`n## Heading 2`r`n").repeat(...)` via PowerShell `Out-File -Encoding utf8` then `byte` substitution, or use `Set-Content -NoNewline` + manual byte injection). Confirm via `Get-Content -AsByteStream` that the file is CRLF on disk. Seed `Sandbox/outline-T0-lf.md` with the equivalent LF-only content (`Out-File -NoNewline` followed by manual `0x0A` line breaks, or write via Node `fs.writeFileSync` with explicit `\n`). Probe each: `obsidian outline path=Sandbox/outline-T0-<lf|crlf>.md vault=TestVault-Obsidian-CLI-MCP format=json`. **Expected**: identical output (`level` / `heading` / `line` bytewise equal across both fixtures — both terminator styles count as one source line). **TRIGGER**: if `line` numbers differ across CRLF vs LF (e.g. CRLF counts each `\r\n` as two lines), SC-019's "identical heading entries" promise breaks — document the discrepancy and either amend SC-019 or implement wrapper-side line-count normalisation (the latter would significantly grow the handler beyond the planned scope; escalate to user).

  - **(T0.4) Very-large-outline cap-boundary (Q-20 / SC-020 verification)**: seed `Sandbox/outline-T0-huge.md` with a synthesised body containing enough headings to push the `format=json` output past 10 MiB. Estimate: each JSON entry is ~70 bytes (`{"level":N,"heading":"Heading NNNNN","line":NNNNN},\n`); 10 MiB ÷ 70 ≈ 150,000 headings. Generate with: `1..150000 | %{"# Heading $_`n"} | Out-File Sandbox/outline-T0-huge.md`. Probe: `obsidian outline path=Sandbox/outline-T0-huge.md vault=TestVault-Obsidian-CLI-MCP format=json`. **Expected per FR-020 / R10**: either (a) full output under cap, OR (b) `CLI_NON_ZERO_EXIT` with `details.killReason = {kind: "cap", stream: "stdout"}`. Document which outcome fires and at approximately what heading count. The `total: true` flag bypasses this risk entirely — confirm by re-probing with `total` flag against the same huge fixture; expected: small integer in stdout regardless of heading count. **OPTIONAL — defer this T0.4 case if seeding 150k headings is impractical**: the FR-020 contract (cap fires as structured error, not silent truncation) is structurally ensured by the cli-adapter's existing 10 MiB cap — empirical confirmation is observability evidence, not a contract gate.

**Checkpoint**: Foundational characterisation complete. Active-mode no-focus error string locked into T004's handler test; multi-extension non-`.md` rejection confirmed; CRLF/LF parity locked; cap-boundary outcome documented. User-story implementation can now begin.

---

## Phase 3: User Story 1 — Specific-mode outline of a named note (Priority: P1) 🎯 MVP

**Goal**: Add the typed `outline` MCP tool surface that, given `target_mode: "specific"` + `vault` + exactly one of `file` / `path`, returns `{ count, headings: [{ level, text, line }] }` for the named note. Covers FR-001..FR-004, FR-006..FR-016 (default mode happy path + file-not-found + unknown-vault-inherited-limitation + level-skipping).

**Independent Test**: invoke `outline({ target_mode: "specific", vault: "TestVault-Obsidian-CLI-MCP", path: "Sandbox/<fixture>.md" })` against a multi-heading fixture; assert response shape `{ count, headings }` with correct level/text/line per entry. Per [quickstart.md](quickstart.md) Q-1 / Q-2 / Q-3 / Q-4 / Q-5.

> **Note on bundled stories**: T002–T010 below are the single source implementation that delivers Stories 1, 2, 3, 4, 5 in one atomic ship. The `[US1]` tag marks primary-story attribution; US2/US3/US4/US5 are sub-stories of the same module and ride along (no separate code paths). Story-tag breakdown by file:
>
> - schema.ts → US1 (default-mode shape) + US3 (validation refinement) + US4 (count-only `total` field)
> - handler.ts → US1 (default-mode happy path) + US2 (active mode pass-through) + US4 (count-only branch) + US5 (byte-faithful pass-through)
> - index.ts → US1 (registration)
> - docs/tools/outline.md → US6 (documentation)

### Implementation for User Story 1 (MVP — bundled with US2/US3/US4/US5)

- [X] T002 [P] [US1] Create [src/tools/outline/schema.ts](../../src/tools/outline/schema.ts) per [data-model.md § Schema shapes](data-model.md#schema-shapes-zod-source-of-truth-per-constitution-iii). Export `outlineInputSchema` (reuses `targetModeBaseSchema` extended with optional `total: z.boolean()`, wrapped in `applyTargetModeRefinement` per ADR-003), `outlineOutputSchema` (strict envelope `{ count: z.number().int().nonnegative(), headings: z.array(outlineHeadingSchema) }`), `outlineHeadingSchema` (strict `{ level: 1..6, text: string, line: positive int }`), `outlineUpstreamArraySchema` (passthrough — defence-in-depth against future upstream field additions), inferred types `OutlineInput` / `OutlineOutput` / `OutlineHeading` via `z.infer`. Carry the `// Original — no upstream. <one-line description>.` header per Constitution V (FR-025).

- [X] T003 [P] [US1] Create [src/tools/outline/schema.test.ts](../../src/tools/outline/schema.test.ts) with 18 cases per [data-model.md § Schema (18 cases)](data-model.md#test-inventory-51-cases). Cases: target_mode discriminator (specific+vault+path ✓ / specific+vault+file ✓ / specific+both-locators ✗ / specific+no-locator ✗ / specific+no-vault ✗ / active ✓ / active+vault ✗ / active+file ✗ / active+path ✗); total field validation (true/false/omitted/string-rejection); additionalProperties strict (unknown key in specific ✗ / unknown key in active ✗); empty vault ✗; type inference compile checks. Carry `// Original — no upstream.` header.

- [X] T004 [US1] Create [src/tools/outline/handler.ts](../../src/tools/outline/handler.ts) per [contracts/outline-handler.contract.md](contracts/outline-handler.contract.md). Export `executeOutline(input, deps)` with signature `(input: OutlineInput, deps: ExecuteDeps) => Promise<OutlineOutput>`. Logic:
  1. Build CLI parameters from `input.file` / `input.path`.
  2. If `input.total === true`: add `total` to flags array; do NOT add `format=json` parameter.
  3. Else: add `format: "json"` to parameters; flags empty.
  4. ONE `invokeCli({ command: "outline", vault: input.vault, parameters, flags, target_mode: input.target_mode }, { spawnFn, env, logger, queue })` (R3 single-call invariant).
  5. Trim stdout. Detect empty-outline sentinel `"No headings found."` (case-sensitive byte equality after trim) → return `{ count: 0, headings: [] }` regardless of mode (R9).
  6. Default mode: `JSON.parse(trimmed)` → wrap parse failure as `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.stage: "json-parse"` + `details.stdout: trimmed`. Then `outlineUpstreamArraySchema.parse(parsed)` (ZodError pass-through to `VALIDATION_ERROR` — contract-divergence signal). Map each upstream entry `{level, heading, line}` → `{level, text: heading, line}`. Return `{ count: headings.length, headings }`.
  7. Count-only mode: `Number.parseInt(trimmed, 10)` + `String(count) === trimmed` exact-match check → wrap parse failure as `UpstreamError` with `code: "CLI_REPORTED_ERROR"` + `details.stage: "total-parse"` + `details.stdout: trimmed`. Return `{ count, headings: [] }`.
  Export `EMPTY_OUTLINE_SENTINEL` constant. Define `ExecuteDeps` interface (parity with `files` handler — `{ logger, queue, spawnFn?, env? }`). Carry `// Original — no upstream.` header. Implements FR-005 / FR-007 / FR-009 / FR-010 / FR-011 / FR-014 / FR-015 / FR-018 / FR-020.

- [X] T005 [US1] Create [src/tools/outline/handler.test.ts](../../src/tools/outline/handler.test.ts) with 29 cases per [data-model.md § Handler (28 cases)](data-model.md#test-inventory-51-cases) (post-/speckit-analyze U1 remediation 2026-05-13: 28 → 29 — added case 29 to close SC-012 token-cost regression coverage gap). Bundle fixtures from T001's T0 capture (multi-level / zero-heading / Setext / fenced / indented-code / inline-markdown / `::`-substring / closing-ATX / level-skipping / CRLF / LF). Inject stub `spawnFn` per `vi.fn().mockResolvedValue({stdout, stderr: "", exitCode: 0})`. Per-test assertions: `spawnFn.mock.calls.length === 1` (single-call invariant); argv content (default mode contains `format=json`, NOT `total`; count-only mode contains `total`, NOT `format=json`; specific mode contains `vault=…`; active mode argv omits vault/file/path); output equality. Failure cases (JSON parse failure → `CLI_REPORTED_ERROR.details.stage = "json-parse"`; integer parse failure → `details.stage = "total-parse"`; file-not-found upstream → `CLI_REPORTED_ERROR` via dispatch-layer; non-`.md` upstream → `CLI_REPORTED_ERROR` via dispatch-layer; active-mode no-focus → `ERR_NO_ACTIVE_FILE` via dispatch-layer; path-traversal → `CLI_REPORTED_ERROR` via dispatch-layer; output-cap kill → `CLI_NON_ZERO_EXIT`; binary-not-found → `CLI_BINARY_NOT_FOUND`; UpstreamError pass-through). **Case 22 (Q-5 unknown-vault)** verifies the inherited limitation per amended FR-016 / SC-005 (post-/speckit-analyze I1 remediation 2026-05-13): assert that `vault: "NonExistent"` does NOT produce a wrapper-imposed CLI_REPORTED_ERROR — instead, the focused-vault outline is returned (or the file-not-found path fires if the locator does not resolve in the focused vault). **Case 24 (active-mode no-focus)** verifies amended SC-007: assert ERR_NO_ACTIVE_FILE is the structured code; assert the message is the upstream string (T0.1's locked wording — typically `"no active file"`); do NOT assert the wrapper adds a "switch to specific mode" string — that guidance lives in T010's docs. **Case 29 (token-cost regression — added per SC-012 / Q-12)**: seed two upstream stdout fixtures — (a) a synthetic outline payload with 50 headings (~3.5 KB JSON), (b) a synthetic full-file `read` payload of the same logical note (~30 KB markdown). Assert `Buffer.byteLength(outlineStdout, "utf8") < Buffer.byteLength(fullReadStdout, "utf8") / 5` (outline payload is at least 5× smaller than full-file equivalent — locks SC-012's "two orders of magnitude" claim with a conservative 5× threshold for fixture size flexibility). Carry `// Original — no upstream.` header.

- [X] T006 [US1] Create [src/tools/outline/index.ts](../../src/tools/outline/index.ts). Export `createOutlineTool(deps: RegisterDeps): RegisteredTool` via the `registerTool` factory (parity with `files`/`read`/etc.). Export `OUTLINE_TOOL_NAME = "outline"` constant and `OUTLINE_DESCRIPTION` string (mention the typed `{ count, headings }` envelope, the count-only `total` switch, the multi-vault inherited limitation note, and a pointer to `help({ tool_name: "outline" })` for full docs — model after `FILES_DESCRIPTION` shape and length). Carry `// Original — no upstream.` header.

- [X] T007 [US1] Create [src/tools/outline/index.test.ts](../../src/tools/outline/index.test.ts) with 5 registration cases: (a) `createOutlineTool({...}).descriptor.name === "outline"`; (b) descriptor `inputSchema` has descriptions stripped (ADR-005 — assert no `description` field appears in the JSON Schema); (c) `OUTLINE_DESCRIPTION` mentions `help({ tool_name: "outline" })`; (d) `docs/tools/outline.md` exists with non-stub content (assert file size > 1 KB AND contains the strings "Worked example" + "Error roster" — placeholder check; full content asserted by T008's drift detector); (e) the `_register-baseline.test.ts` drift detector fingerprint matches the rolled-forward baseline (this depends on T009 — comment as "AFTER T009"). Carry `// Original — no upstream.` header.

- [X] T008 [US1] Edit [src/server.ts](../../src/server.ts): add the import line `import { createOutlineTool } from "./tools/outline/index.js";` in alphabetical position (between `createObsidianExecTool` and `createReadTool` — verify alphabetical order matches the existing import block). Add the `createOutlineTool({ logger, queue })` entry in the tools array, alphabetical position (between `createObsidianExecTool` and `createReadTool`). DO NOT pass `vaultRegistry` (parity with `files` — outline does not need vault verification per R5). Verify by `npm run typecheck` AND by `npm run test -- src/server.test.ts` — the existing registry-consistency test auto-covers `outline`'s docs/ presence once the registration lands.

- [X] T009 [US1] Roll forward [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) by running `npm run baseline:write`. This adds the new `outline` tool's fingerprint (`{ name: "outline", descriptionFingerprint: "<sha256>", schemaFingerprint: "<sha256>" }`) to the baseline array per BI-022's FR-018 contract. Verify: (a) `git diff src/tools/_register-baseline.json` shows ONLY the new `outline` entry added (no other tool's fingerprint changed — confirms SC-013); (b) `npm run test -- src/tools/_register-baseline.test.ts` passes after the roll-forward. **TRIGGER**: if any other tool's fingerprint changed, halt — accidental description-text drift or schema-shape drift in another tool. Investigate before continuing.

**Checkpoint US1/US2/US3/US4/US5**: schema + handler + registration + baseline rolled forward + server registers the tool. The MCP server now serves `outline` end-to-end. Run `npm run test` to verify all 51 new tests pass + existing 022 baseline test passes. Run `npm run typecheck` and `npm run lint` to verify zero regressions.

---

## Phase 4: User Story 6 — Documentation surface (Priority: P2)

**Goal**: Author the progressive-disclosure help facility's documentation file for the outline tool. Covers FR-021 + the `help({ tool_name: "outline" })` consumer surface.

**Independent Test**: invoke `help({ tool_name: "outline" })` and confirm the doc renders with input contract + output × 2 modes + error roster + ≥4 worked examples. Per [quickstart.md](quickstart.md) Q-14.

- [X] T010 [US6] Create [docs/tools/outline.md](../../docs/tools/outline.md) (~180 lines). Structure mirrors `docs/tools/files.md` and `docs/tools/read_heading.md`. Required sections:
  1. **Overview** — single-paragraph summary linking to FR-001's tool name and the wrap of upstream `obsidian outline`.
  2. **Input contract** — per-field table with type, required-in-mode, forbidden-in-mode, default. Covers `target_mode` / `vault` / `file` / `path` / `total`. Reference [contracts/outline-input.contract.md](contracts/outline-input.contract.md).
  3. **Output shape** — separate JSON schemas for default mode (`{ count, headings: [...] }`) and count-only mode (`{ count, headings: [] }`). Note that the envelope is uniform across modes; `total: true` populates `count` and leaves `headings` empty.
  4. **Worked examples** (≥4 per FR-021):
     - Example 1: specific-mode default outline by path (multi-heading fixture).
     - Example 2: focused-note happy path (active mode).
     - Example 3: count-only mode against multi-heading file (`{ count: 5, headings: [] }`).
     - Example 4: file-not-found error (`CLI_REPORTED_ERROR — Error: File "X" not found.`).
     - Example 5 (bonus): non-`.md` filetype rejection (`CLI_REPORTED_ERROR — Error: File is not a markdown file.`) per FR-027.
  5. **Error roster** — each `code` with trigger condition. Covers `VALIDATION_ERROR`, `CLI_REPORTED_ERROR` (5 sub-cases — FNF, non-`.md`, path-traversal, JSON-parse failure, total-parse failure), `ERR_NO_ACTIVE_FILE`, `CLI_NON_ZERO_EXIT` (output-cap), `CLI_BINARY_NOT_FOUND`.
  6. **Inherited limitations**:
     - Multi-vault default ambiguity (per F8 / R5 / R14) — `vault=` is silently honoured-as-noop; multi-vault users open the target vault before invoking.
     - Output-cap ceiling (per R10) — practical 10 MiB inherited from cli-adapter; very large outlines may surface as `CLI_NON_ZERO_EXIT`. The `total: true` mode bypasses this risk.
     - Setext-included note (per F10 / amended FR-013) — the upstream CLI includes Setext-underline-style headings in its output; the wrapper preserves this. Differs from `read_heading` (BI-015) which excludes Setext from its addressable surface. Use `outline` to detect Setext headings in a note's structure.
  7. **Related tools**: cross-link to `read` (full file content), `read_heading` (single section's body), `obsidian_exec` (escape hatch for tree / md format).
  
  No `// Original` header (Markdown docs are exempt per BI-005 FR-019). Implements FR-021 and Q-14's content-completeness assertion.

- [X] T011 [US6] Edit [docs/tools/index.md](../../docs/tools/index.md): add a one-line entry for `outline` in alphabetical position (between `obsidian_exec` and `read`). Format must match the existing convention (verify by reading the file's current entries). Implements the implicit "tool-list discoverability" surface that the help-tool consumes.

**Checkpoint US6**: `help({ tool_name: "outline" })` returns the populated docs page; the registry-consistency test from BI-005 auto-covers the file's existence; T007's case (d) asserts content completeness.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Release mechanics, README sweep, and a deliberate-fails-first sanity check.

- [X] T012 [P] Edit [package.json](../../package.json): bump `version` from `0.5.0` to `0.5.1` (additive surface — PATCH under semver since no existing-tool surface changes). Update the `description` field to mention `outline` alongside the existing typed-tool list (verify by reading the current description; the convention is to list the tool names — extend with `outline` in alphabetical position). Run `npm install` to update `package-lock.json` (if present). Verify by `npm run build` succeeds.

- [X] T013 [P] Edit [CHANGELOG.md](../../CHANGELOG.md): add a new `## [0.5.1]` section (or append under `## [Unreleased]` per the existing convention — verify by reading the current CHANGELOG structure). Section content per CONTRIBUTING.md's CHANGELOG conventions: headline ("Added: typed `outline` tool — structured heading outline of a vault note"), one paragraph describing the new surface (input shape + output envelope + count-only mode), one paragraph naming the design decisions deferred to upstream (Setext defer-to-upstream per F10, indented-code-block opacity per Q2/A2, non-`.md` rejection via dispatch-layer classifier per F9), references section linking to the spec / plan / tasks. No migration block (additive surface; zero existing-tool changes per FR-024 / SC-013).

- [X] T014 [P] Edit [README.md](../../README.md): if the README contains a tools-list section, add a line for `outline` in alphabetical position. If the README does NOT enumerate tools (verify by reading), this task is a no-op — close it out without an edit.

- [X] T015 Run the full test + quality gates locally:
  ```powershell
  npm run lint          # zero warnings
  npm run typecheck     # tsc --noEmit clean
  npm run test          # 51 new tests pass + existing tests pass + coverage >= 91.3% statements
  npm run build         # tsc -p tsconfig.build.json succeeds
  ```
  All four MUST pass before moving to T016. Capture the coverage delta — the new module is small (~145 LOC) with near-100% test coverage, so the aggregate floor either stays at 91.3% or ratchets up. If coverage drops below 91.3%, investigate which existing module lost coverage (likely an integration regression from the server.ts edit) before continuing.

- [X] T016 Deliberate-fails-first sanity check (S-deliberate-revert per project convention). On a fresh local commit:
  1. Choose ONE handler test case (suggested: T005's "default mode happy path against multi-level fixture").
  2. Edit [src/tools/outline/handler.ts](../../src/tools/outline/handler.ts) to break the contract — e.g., return `{ count: 0, headings: [] }` regardless of input (drop the JSON.parse).
  3. Run `npm run test -- src/tools/outline/handler.test.ts` — expect AT LEAST the chosen case to FAIL with a deep-equality diff naming the expected-vs-actual `headings` array.
  4. Revert the handler edit (`git checkout src/tools/outline/handler.ts`).
  5. Re-run `npm run test -- src/tools/outline/handler.test.ts` — expect ALL cases to PASS.
  
  This proves the test suite has live coverage of the contract and isn't accidentally green for the wrong reason. Document in your PR description that this check was performed.

- [ ] T017 Run the manual end-to-end smoke — DEFERRED (manual gate). Requires MCP Inspector or Claude Desktop with TestVault-Obsidian-CLI-MCP focused; not run during /speckit-implement. Operator runs as the pre-merge final check.

  ORIGINAL DIRECTIVE BELOW (kept verbatim for the operator): end-to-end smoke per [quickstart.md § End-to-end smoke](quickstart.md#end-to-end-smoke-after-speckit-implement-completes). Boot the freshly-built MCP server against MCP Inspector or Claude Desktop with `TestVault-Obsidian-CLI-MCP` opened in Obsidian. Exercise the 6 listed scenarios (tools/list visibility, active mode happy, specific zero-heading file, count-only, validation rejection, help facility round-trip). Document any deviation from expected output and reconcile before declaring the BI shippable.

**Checkpoint Polish**: all 17 tasks complete. The BI is shippable. Open a PR; per CONTRIBUTING the PR description includes the Constitution Compliance checklist (5× Y) AND a confirmation that T016's deliberate-fails-first sanity check was performed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: NONE — skipped (no new tooling).
- **Foundational (Phase 2 — T001)**: BLOCKS T004 + T005 (handler tests need T001's locked error strings + multi-extension confirmation + CRLF/LF parity assertion). T002 / T003 (schema + schema tests) are independent of T001 and can run in parallel with it.
- **User Story 1 phase (T002–T009)**: T002 / T003 in parallel; T004 depends on T001 + T002; T005 depends on T004; T006 depends on T002 + T004; T007 depends on T006 + T010 (case d) + T009 (case e); T008 depends on T006; T009 depends on T008.
- **User Story 6 phase (T010–T011)**: T010 can run in parallel with T002–T008 (independent files); T011 can run in parallel with T010.
- **Polish (Phase 5 — T012–T017)**: T012 / T013 / T014 in parallel (independent files); T015 depends on ALL prior tasks landing; T016 depends on T015 passing; T017 depends on T015 + a freshly-built dist (so depends on T015's `npm run build`).

### User Story Dependencies

- **US1 / US2 / US3 / US4 / US5 (P1/P1/P1/P2/P2)**: bundled into the single source ship (T002–T009). All five complete simultaneously.
- **US6 (P2)**: independent of US1's source code. T010 can be authored in parallel with T002–T008. The registry-consistency test (T007 case d) ties US1 and US6 together at test time but the source files are independent.

### Parallel Opportunities

| Group | Tasks | Why parallelisable |
|---|---|---|
| A | T001 + T002 + T003 + T010 | T001 (live probes) + T002 (schema source) + T003 (schema tests) + T010 (docs) all touch independent files |
| B | T002 + T003 | schema + its tests — independent files |
| C | T011 + T012 + T013 + T014 | docs/index + package.json + CHANGELOG + README — independent files |

### Within Each User Story

- Schema (T002) before handler (T004) — handler imports `OutlineInput` / `OutlineOutput` types from schema.
- Handler (T004) before handler tests (T005) — tests import `executeOutline`.
- Handler (T004) before registration (T006) — registration imports `executeOutline`.
- Registration (T006) before server.ts edit (T008) — server imports `createOutlineTool`.
- Server.ts edit (T008) before baseline roll-forward (T009) — baseline regen scans the live registry.
- Baseline roll-forward (T009) before T015 quality gates — `_register-baseline.test.ts` would otherwise fail.

---

## Parallel Example: User Story 1 + User Story 6 simultaneously

```bash
# Group A — kick off T001 (live probes), T002 (schema source), T003 (schema tests), T010 (docs) in parallel:
Task: "T001 — Live-CLI characterisation against TestVault-Obsidian-CLI-MCP"
Task: "T002 — Create src/tools/outline/schema.ts with three zod schemas + types"
Task: "T003 — Create src/tools/outline/schema.test.ts with 18 cases"
Task: "T010 — Create docs/tools/outline.md with ≥4 worked examples"

# After T001 + T002 land, kick off T004:
Task: "T004 — Create src/tools/outline/handler.ts per contracts/outline-handler.contract.md"

# After T004 lands, kick off T005 + T006 in parallel:
Task: "T005 — Create src/tools/outline/handler.test.ts with 28 cases"
Task: "T006 — Create src/tools/outline/index.ts with createOutlineTool factory"

# After T006 lands, kick off T008:
Task: "T008 — Edit src/server.ts to register createOutlineTool"

# After T008 lands, kick off T009 (single command):
Task: "T009 — Run npm run baseline:write to roll forward _register-baseline.json"

# After T009 lands AND T010 lands, kick off T007:
Task: "T007 — Create src/tools/outline/index.test.ts with 5 registration cases"
```

---

## Implementation Strategy

### MVP First (User Story 1 — bundles US2/US3/US4/US5)

1. Skip Phase 1 (no setup needed).
2. Complete Phase 2 (T001 — live-CLI characterisation of 4 deferred T0 cases).
3. Complete Phase 3 (T002–T009 — schema + handler + registration + server edit + baseline roll-forward).
4. **STOP and VALIDATE**: run `npm run test` — all 46 of US1/US2/US3/US4/US5's tests pass. Run T015's full quality-gate sweep early as a smoke check.
5. Defer US6 docs (T010–T011) and Polish (T012–T017) for the next iteration if you want to ship MVP-only. Note: the registry-consistency test from BI-005 will fail without `docs/tools/outline.md`; minimum docs-stub is required even for MVP. So T010 is effectively part of MVP.

### Incremental Delivery (recommended path)

1. T001 (live probes) → T002+T003 (schema) → confirm schema tests pass.
2. T004+T005 (handler) → confirm handler tests pass.
3. T006+T008+T009 (registration + server + baseline) → confirm registry baseline test passes.
4. T010+T011 (docs) → confirm registry-consistency test passes.
5. T007 (registration tests) → 51-test ship complete.
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
- The single `outline` module ships US1/US2/US3/US4/US5 simultaneously; US6 is its independent docs ship.
- Verify tests fail before implementing — once per BI via T016's deliberate-fails-first sanity check.
- Commit after each task or each logical group per the project's commit-on-invocation convention.
- Stop at any checkpoint to validate independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
- ZERO new error codes (FR-020 / Constitution Principle IV). ZERO new ADRs. ZERO existing-tool surface changes (SC-013).
