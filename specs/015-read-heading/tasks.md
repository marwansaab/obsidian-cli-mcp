---
description: "Task list for 015-read-heading — Read Heading Typed Heading-Body Read"
---

# Tasks: Read Heading — Typed Heading-Body Read

**Input**: Design documents from [`/specs/015-read-heading/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test cases in the same task. The verify-fails-first sanity check is captured exactly once, manually, by S-deliberate-revert in T011 (parity with 013's T011 / 014's T011).

**Organization**: Tasks are grouped by user story per the project convention. The `read_heading` module is fundamentally a single atomic ship — Stories 1, 2, 3, and 5 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 4 is the documentation layer. The `[US1]` / `[US4]` tags mark primary-story attribution for each implementation task; the test inventory in [data-model.md § Test inventory](data-model.md#test-inventory) maps each test case to its source User Story.

**Plan-stage findings carried forward** (re-stated here so implementers see them before writing code):

- **R2 — `eval` subcommand load-bearing departure**: there is NO native heading-body subcommand in the Obsidian CLI (verified via `obsidian help`; `read` returns whole files, `outline` lists headings, `bookmark` accepts `subpath` but writes a bookmark). The handler routes through the developer-section `eval` subcommand with a frozen JS template.
- **R3 — single-call architecture**: each MCP request fires ONE `invokeCli` invocation. ~200 ms per call. Handler tests assert `argvCalls.length === 1` on every code path.
- **R4 — STANDARD adapter `target_mode` mapping**: this feature has the standard `target_mode: "specific" | "active"` discriminator. The handler passes `input.target_mode` through to `invokeCli` unchanged. In specific mode `vault` flows through; in active mode the cli-adapter's `stripTargetLocators` defence-in-depth strip removes any leaked vault/file/path. ADR-003 enforced via `applyTargetModeRefinement` reuse.
- **R6 — anti-injection via base64-encoded JSON payload**: frozen JS template + base64 payload. User inputs (`path`, `file`, `heading`-as-segment-array, `active`-bool) flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` + `JSON.parse` at JS runtime. No user input ever reaches the JS source as text. Verifies FR-021 / SC-021 structurally.
- **R7 — Obsidian's pre-parsed `headings` array reuse** (CRITICAL load-bearing finding): `app.metadataCache.metadataCache[fc.hash].headings` is `[{heading, level, position: {start: {offset}, end: {offset}}}, ...]`. Obsidian has ALREADY done ATX-marker recognition AND fence-opacity. Body slicing collapses to `text.slice(headings[matchIdx].position.end.offset, headings[matchIdx+1]?.position.start.offset ?? text.length)` with leading-line-terminator strip.
- **R13 — structured eval-response error envelope**: discriminated union `{ok: true, content}` | `{ok: false, code, detail}`. Handler's two-stage parse (`JSON.parse` + envelope safeParse) wraps both wire-format failures and envelope `ok: false` onto existing `UpstreamError` codes per FR-022 (zero new error codes).
- **R14 — Setext exclusion defence-in-depth filter**: JS template applies `text.charAt(h.position.start.offset) === '#'` to enforce Q2's ATX-only rule regardless of Obsidian-version behaviour. T0.2 verifies whether the filter is functional or no-op.
- **Q1 / Q2 / Q3 clarifications**: Q1 (boundary rule) → first-subsequent-heading-marker-of-any-depth; Q2 (heading marker syntax) → ATX only; Q3 (segment matching) → minimal-normalisation, case-sensitive byte compare. All three codified in spec.md before plan.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers (US1 / US4 — the BI's two practical primary-stories per the file-vs-story mapping in plan.md). Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property`). All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at [src/tools/read_heading/](../../src/tools/read_heading/) (does NOT exist yet — created by T003–T005).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–014). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler against verified wording for the cases deferred from plan stage (per [research.md § Plan-stage status](research.md#plan-stage-status)), and verification that the existing 011-R5 cli-adapter unknown-vault response-inspection clause works for the `eval` subcommand (already verified in 014; confirmed for 015 by inheritance).

**Note on plan-stage coverage**: 8 architecture-locking findings (F1–F8) were verified live during plan stage (see [research.md § Live CLI Findings](research.md#live-cli-findings)) — `obsidian help` confirms no native heading-body subcommand; `eval` argv shape; `=> ` prefix on stdout; eval errors as `Error: <msg>` exit 0; `app.vault.adapter.read` async + string return; `app.metadataCache.metadataCache[hash].headings` shape; vault-routing limitation reproduced; sandbox empty cleanup. T001 below covers the 20 cases deferred to T0 because they require fixtures in TestVault and the test vault to be focused at probe time (post-/speckit-analyze A2 remediation 2026-05-09: 16 → 20, adding Group E sub-cases T0.17–T0.20).

- [ ] T001 Live-CLI characterisation of the 20 deferred T0 cases (post-/speckit-analyze A2 remediation: 16 → 20 — added Group E sub-cases T0.17/T0.18/T0.19/T0.20 to close the empty-body / duplicate-first-match / file-not-found-path / file-not-found-wikilink coverage gaps, which were stub-tested only at handler layer but not live-CLI characterised per FR-025's "live-CLI characterisation pass" wording). Run probes against the authorised test vault `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) (gated by CLAUDE.md `## Test Execution`). **Open the test vault in Obsidian and confirm focus before running probes** (per the F7 vault-routing limitation — eval runs against the focused vault). Capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Cleanup all fixtures from `Sandbox/` after capture. Cases:

  > **Sub-task numbering note**: T0.X numbers below correspond to the 20 deferred cases enumerated in [research.md § Plan-stage status](research.md#plan-stage-status). Group A is segment-matching (T0.1–T0.5); Group B is content edge cases (T0.6–T0.9); Group C is body terminators (T0.10–T0.13); Group D is runtime errors and ceiling (T0.14–T0.16); Group E is stub-coverage live-confirmation (T0.17–T0.20 — added by /speckit-analyze A2 remediation 2026-05-09).

  ### Group A — segment matching (FR-028 characterisation)

  - **(T0.1) Closing-ATX form**: seed `Sandbox/015-T0-segments.md` with the heading line `## Heading With Closing ATX ##` and a single line of body prose `Closing ATX prose.`. Probe: `obsidian eval code="(()=>{const fc=app.metadataCache.fileCache['Sandbox/015-T0-segments.md'];return JSON.stringify(app.metadataCache.metadataCache[fc.hash].headings.find(h => h.heading.includes('Closing')));})()"`. **Expected**: `heading: "Heading With Closing ATX"` (Obsidian's pre-parser strips the closing `##`). **TRIGGER**: if Obsidian preserves the closing `##` as part of the heading text (e.g. `heading: "Heading With Closing ATX ##"`), document the actual behaviour and update R8 / FR-028's segment-matching contract accordingly.
  - **(T0.2) Surrounding whitespace**: same fixture, add heading line `## Heading With Trailing Whitespace   ` (3 trailing spaces). Probe: inspect `heading` field of the matching entry. **Expected**: `heading: "Heading With Trailing Whitespace"` (trimmed).
  - **(T0.3) Inline markdown survives**: same fixture, add heading line `## My **Bold** Heading`. Probe: inspect `heading` field. **Expected**: `heading: "My **Bold** Heading"` (markdown tokens preserved as plain text).
  - **(T0.4) Obsidian anchor survives**: same fixture, add heading line `## Section ^my-anchor-id`. Probe: inspect `heading` field. **Expected**: `heading: "Section ^my-anchor-id"` (anchor preserved as plain text).
  - **(T0.5) Mis-cased fail**: covered structurally — segment matching is case-sensitive byte equality per FR-028 / R8; tested at the handler-test layer (T004 case 37). **NOTE (post-/speckit-analyze C1 remediation 2026-05-09)**: T0.5's live confirmation requires the wrapper to exist (depends on T004), which contradicts T001's foundational-phase placement. T0.5 is therefore enumerated here for FR-025 traceability but is **NOT executed during T001** — execution happens in T012's S-21 manual scenario where it sits naturally alongside the other segment-matching live captures. T0.1–T0.4's heading-text-strip behaviour observed against Obsidian's metadataCache (which IS executable in T001) is sufficient to lock the segment-matcher's contract for T004's stub authoring.

  ### Group B — content edge cases

  - **(T0.6) Setext-as-content (R14 verification)**: seed `Sandbox/015-T0-setext.md` with content:
    ```
    # Outer

    ## ATX Section

    Some prose.

    A line that looks like Setext H2
    ---------------------------------

    More body content.
    ```
    Probe: `obsidian eval code="(()=>{const fc=app.metadataCache.fileCache['Sandbox/015-T0-setext.md'];return JSON.stringify(app.metadataCache.metadataCache[fc.hash].headings);})()"`. **Two outcomes possible**:
    - (a) Headings array contains ONLY ATX entries (`# Outer`, `## ATX Section`); the Setext line is excluded. → R14's defence-in-depth filter is a no-op.
    - (b) Headings array ALSO contains a Setext entry (`heading: "A line that looks like Setext H2"`, `level: 2`); the JS template's filter functionally excludes it. → R14's filter is load-bearing.
    Document the observed outcome in research.md under T0. Either way, the wrapper's behaviour is correct (Setext is content, not a boundary).
  - **(T0.7) Fenced-code-block opacity**: seed `Sandbox/015-T0-fence.md` with:
    ````
    # Outer

    ## ATX Section

    Some prose.

    ```markdown
    ## Heading-like text inside fence
    ```

    Trailing prose.
    ````
    Probe: inspect `headings` array. **Expected**: only `# Outer` and `## ATX Section`; the fenced `## Heading-like text inside fence` is NOT in the array (Obsidian's pre-parser already excludes it). Confirms FR-012 is structurally satisfied by Obsidian, not by wrapper-side fence tracking.
  - **(T0.8) CRLF round-trip**: seed `Sandbox/015-T0-crlf.md` with CRLF line endings (use PowerShell `Set-Content -NoNewline ... | %{$_ -replace "\n", "\r\n"}` or equivalent). Confirm via hex dump that the file is CRLF on disk. Probe: `obsidian eval code="(async()=>{const txt=await app.vault.adapter.read('Sandbox/015-T0-crlf.md');return JSON.stringify({len:txt.length,hasCR:txt.includes('\r'),hasLF:txt.includes('\n')});})()"`. **TRIGGER**: if `hasCR === false`, Obsidian normalises CRLF to LF on read; this would break SC-008's "CRLF round-trip verbatim" promise — escalate to user before continuing implementation.
  - **(T0.9) LF round-trip**: seed `Sandbox/015-T0-lf.md` with pure LF line endings. Probe: same shape. **Expected**: `hasLF: true`, `hasCR: false`.

  ### Group C — body terminators

  - **(T0.10) Sibling terminator**: structurally guaranteed by R7's slice formula (next heading at same level → terminator). Confirmed by T0.6's heading-array probe. Document.
  - **(T0.11) Higher-level terminator**: structurally guaranteed by R7 (next heading at shallower level → terminator). Confirmed by T0.6.
  - **(T0.12) Child-level terminator**: structurally guaranteed by R7 (next heading at deeper level → terminator; child subtree excluded per Q1).
  - **(T0.13) EOF terminator**: structurally guaranteed by R7's `?? text.length` fallback when `headings[matchIdx + 1]` is undefined.

  **(post-/speckit-analyze C2 remediation 2026-05-09)**: T0.10–T0.13 are all derived from the SAME R7 slice formula and require NO new fixtures or probes — they are confirmed by direct inspection of `headings[i+1].position.start.offset` against the multi-depth fixture seeded for T0.6. They are listed individually here for FR-025 traceability (one case per terminator-depth observable), but T001's empirical work for these four cases reduces to a single inspection of T0.6's headings array. Document the four observable confirmations in research.md under T0; do NOT seed four separate fixtures.

  ### Group D — runtime errors and ceiling

  - **(T0.14) Active-mode happy path**: seed `Sandbox/015-T0-active.md` with a `# Top\n## Section\nProse.` body. **Open the file in Obsidian** so it becomes the active file. Probe: `obsidian eval code="(()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?f.path:null});})()"`. **Expected**: `path: "Sandbox/015-T0-active.md"`. Then probe with `getActiveFile()` returning null (close all tabs) — expected `path: null`.
  - **(T0.15) Active-mode no-focus**: with no file active in Obsidian, `getActiveFile()` returns `null`. The JS template's envelope returns `{ok: false, code: "NO_ACTIVE_FILE"}`. Verified live by replaying T0.14's no-active probe and confirming the envelope shape is what the handler expects.
  - **(T0.16) Very large body cap-boundary**: seed `Sandbox/015-T0-large.md` with a single `## Big Section` heading followed by ~11 MiB of generated body content (`("x".repeat(80) + "\n").repeat(150000)`). Probe `read_heading({path: "Sandbox/015-T0-large.md", heading: "Outer::Big Section"})` after T004 lands. **Expected**: `CLI_NON_ZERO_EXIT` with `details.killReason = {kind: "cap", stream: "stdout", capturedBytes: ~10 MiB}`. **OPTIONAL — defer to a future BI if 10 MiB seeding is impractical**: the FR-020 contract (cap fires as structured error, not silent truncation) is structurally ensured by the cli-adapter's existing 10 MiB cap — T0.16's empirical confirmation is observability evidence, not a contract gate.

  ### Group E — stub-coverage live-confirmation (added by /speckit-analyze A2 remediation 2026-05-09)

  These four cases were originally covered only by T004's stub-driven handler tests (cases 29 / 32 / 40); /speckit-analyze A2 surfaced that FR-025's "live-CLI characterisation pass" wording requires live observation for them. Added here to close the coverage gap. Each is quick to fixture and exercises the wrapper end-to-end after T004 lands (so these run alongside T012 in practice, but are enumerated under T001 for FR-025 traceability — captured in research.md's T0 section).

  - **(T0.17) Empty-body case (FR-011 live confirmation)**: seed `Sandbox/015-T0-empty.md` with content:
    ```
    # Outer

    ## Empty Section
    ## Sibling Section

    Sibling has prose.
    ```
    (Note: `## Empty Section` is followed directly by `## Sibling Section` with NO intervening prose — the body of `Empty Section` is the empty string.) Probe `obsidian eval code="(()=>{const fc=app.metadataCache.fileCache['Sandbox/015-T0-empty.md'];return JSON.stringify(app.metadataCache.metadataCache[fc.hash].headings.map(h=>({h:h.heading,start:h.position.start.offset,end:h.position.end.offset})));})()"` to confirm the headings array carries `Empty Section` and `Sibling Section` as adjacent entries with `headings[1].position.start.offset === headings[0].position.end.offset + 1` (or +2 for CRLF — accounts for the line terminator only). Then probe `read_heading({path: "Sandbox/015-T0-empty.md", heading: "Outer::Empty Section"})` after T004 lands. **Expected**: `{content: ""}` (empty string, no error). Confirms FR-011 against the live CLI.
  - **(T0.18) Duplicate heading first-match (FR-017 live confirmation)**: seed `Sandbox/015-T0-duplicate.md` with content:
    ```
    # Outer

    ## Duplicate

    First occurrence body.

    ## Duplicate

    Second occurrence body.
    ```
    (Note: TWO headings share the textually-identical full path `Outer::Duplicate`.) Probe `read_heading({path: "Sandbox/015-T0-duplicate.md", heading: "Outer::Duplicate"})`. **Expected**: `{content: "First occurrence body.\n"}` (first-document-order match per FR-017). Confirms the JS template's `for` loop with `break` on match preserves first-match semantics against the live CLI.
  - **(T0.19) File-not-found (path mode) (FR-014 live confirmation)**: probe `read_heading({target_mode: "specific", vault: "TestVault-Obsidian-CLI-MCP", path: "Sandbox/015-T0-nonexistent.md", heading: "A::B"})` (no fixture seeded — the path deliberately does not exist). **Expected**: `CLI_REPORTED_ERROR` with `details.code = "FILE_NOT_FOUND"` and `details.detail` containing `path: Sandbox/015-T0-nonexistent.md`. Confirms the JS template's `fileCache[resolvedPath]` null check + envelope `ok: false, code: "FILE_NOT_FOUND"` returns surface correctly through the wrapper.
  - **(T0.20) File-not-found (file/wikilink mode) (FR-014 live confirmation)**: probe `read_heading({target_mode: "specific", vault: "TestVault-Obsidian-CLI-MCP", file: "definitely-not-a-note", heading: "A::B"})` (wikilink resolution should fail). **Expected**: `CLI_REPORTED_ERROR` with `details.code = "FILE_NOT_FOUND"` and `details.detail` containing `wikilink: definitely-not-a-note`. Confirms the JS template's `app.metadataCache.getFirstLinkpathDest` null check + envelope FILE_NOT_FOUND surfaces correctly through the wrapper.

  **Cleanup**: after capture, ensure `Sandbox/` contains no `015-T0-*` files. Use `obsidian vault=TestVault-Obsidian-CLI-MCP delete path=Sandbox/015-T0-<name>.md` (to-trash; recoverable) for each fixture. The pre-existing `Welcome.md` at vault root is NEVER touched.

  **Constitution**: Principle IV (the captured wording becomes the source-of-truth for handler edge-case logic — preserves chain-of-custody from CLI to MCP client). FR-025.

- [ ] T002 [P after T001] **VERIFICATION + ADDITIVE TEST** — confirm the existing 011-R5 cli-adapter unknown-vault response-inspection clause at [src/cli-adapter/cli-adapter.ts:55-89](../../src/cli-adapter/cli-adapter.ts#L55-L89) works for the `eval` subcommand without source-code modification. Two sub-tasks:

  - **(2a) Live verification** (already cited from 014's R5): `obsidian vault=NoSuchVault eval "code=app.vault.getName()"` returns `Vault not found.` on stdout, exit 0 — byte-identical to the create / delete / properties subcommands. The existing `UNKNOWN_VAULT_PREFIX = "Vault not found."` re-classifier handles `eval` identically. **No source-code changes to `src/cli-adapter/cli-adapter.ts` needed.** Re-run the probe to lock it for 015's record.
  - **(2b) Adapter-test inheritance lock**: 014's T002 already added the `command: "eval"` parameterised case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts). Verify that case still passes (`npx vitest run src/cli-adapter/cli-adapter.test.ts`). NO test-file additions needed for 015 — the inheritance lock is already in place from 014.

  Depends on: T001 (loosely — T001 covers different cases; T002 is non-blocking re-confirmation of R5 inheritance for the `eval` subcommand for 015's record).

  **Constitution**: Principle I (clause lives in the `cli-adapter` primitive, NOT in `read_heading`); Principle II (existing parameterised test case verified, no additions). R5 inheritance.

**Checkpoint**: Foundational deliverables complete — handler logic is grounded in plan-stage-verified live-CLI wording (F1-F8) plus the 20 T0-locked cases (post-/speckit-analyze A2 remediation: 16 → 20). The R5 inheritance for `eval` is re-confirmed (test added in 014's T002 still passes). Phase 3 implementation can lock against the captured behaviour.

---

## Phase 3: User Stories 1, 2, 3 — Specific-mode + Active-mode + Validation (Priority: P1) 🎯 MVP

**Goal**: Ship the `read_heading` module — schema, handler, registration — that delivers the core typed-tool surface. Implementation simultaneously satisfies User Stories 1, 2, 3, and 5 acceptance criteria because they all exercise the same three source files. (Story 4 — documentation — is its own phase to keep doc-authoring and code-authoring loosely coupled.)

**Independent Test**: per [spec.md US1 IT](spec.md#user-story-1--specific-mode-heading-body-read-returns-the-named-section-verbatim-priority-p1) — with a stub `spawnFn` injected via `deps`, `executeReadHeading({target_mode: "specific", vault: "Demo", path: "x.md", heading: "H1::H2"}, deps)` against ONE stub child response (stdout `=> {"ok":true,"content":"Use kebab-case.\n"}`) returns `{content: "Use kebab-case.\n"}` AND the stub spawn was invoked ONCE with argv `["vault=Demo", "eval", "code=<rendered-js>"]` where the `code=` argv contains the frozen JS template prefix AND a base64 payload that decodes to `{active: false, path: "x.md", file: null, segments: ["H1", "H2"]}`. Verifiable via `npx vitest run src/tools/read_heading/handler.test.ts`.

### Implementation for User Stories 1, 2, 3

- [ ] T003 [US1] Create [src/tools/read_heading/schema.ts](../../src/tools/read_heading/schema.ts) and [src/tools/read_heading/schema.test.ts](../../src/tools/read_heading/schema.test.ts). Per [data-model.md § Input schema](data-model.md#input-schema) + [§ Output schema](data-model.md#output-schema), [contracts/read-heading-input.contract.md](contracts/read-heading-input.contract.md). Depends on: nothing in this list (truly first source-code task).

  - **(3a) Author [src/tools/read_heading/schema.ts](../../src/tools/read_heading/schema.ts)** with the `// Original — no upstream. read_heading input/output/eval-envelope schemas — standard target_mode discriminator extension; structural-only heading-path validator (FR-006 / FR-007 — split on ::, require >=2 non-empty segments); paths-only output; discriminated-union eval-envelope wire format.` header (Principle V). Define:
    - `HEADING_PATH_SEPARATOR = "::"` — exported constant for traceability + test reuse.
    - `validateHeadingPath(value: string): true | string` — pure function returning `true` on pass or an error message string on fail. Rules: split on `HEADING_PATH_SEPARATOR`; require at least 2 segments; require every segment non-empty.
    - `readHeadingInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({heading: z.string().min(1).refine(v => validateHeadingPath(v) === true, v => ({message: validateHeadingPath(v) as string}))}))` — exactly per [data-model.md § Input schema](data-model.md#input-schema). Reuses `applyTargetModeRefinement` and `targetModeBaseSchema` per ADR-003.
    - `readHeadingOutputSchema = z.object({content: z.string()}).strict()` — per FR-009.
    - `READ_HEADING_EVAL_ERROR_CODES = ["FILE_NOT_FOUND", "HEADING_NOT_FOUND", "NO_ACTIVE_FILE"] as const` — exported tuple for test reuse + envelope schema.
    - `readHeadingEvalResponseSchema = z.discriminatedUnion("ok", [z.object({ok: z.literal(true), content: z.string()}).strict(), z.object({ok: z.literal(false), code: z.enum(READ_HEADING_EVAL_ERROR_CODES), detail: z.string()}).strict()])` — per R13 / FR-022.
    - `ReadHeadingInput = z.infer<typeof readHeadingInputSchema>`, `ReadHeadingOutput = z.infer<typeof readHeadingOutputSchema>`, `ReadHeadingEvalResponse = z.infer<typeof readHeadingEvalResponseSchema>`, `ReadHeadingEvalErrorCode = (typeof READ_HEADING_EVAL_ERROR_CODES)[number]` — type aliases ONLY (Principle III; no hand-rolled interfaces).
    - **No `.describe()` calls** (per ADR-005, SC-016).
  - **(3b) Author [src/tools/read_heading/schema.test.ts](../../src/tools/read_heading/schema.test.ts)** with the `// Original — no upstream. Tests for the read_heading input + output + eval-envelope schemas — target_mode discriminator + structural heading-path validator + additionalProperties + envelope discriminator.` header. **20 test cases** per [data-model.md § Schema tests (20 cases)](data-model.md#schema-tests-20-cases):
    - **(1) US3 AC#5 — `target_mode: "specific"` with no `vault`**: `safeParse({target_mode: "specific", path: "x.md", heading: "A::B"}).success === false` AND issues include `path: ["vault"]`.
    - **(2) US3 AC#3 — `target_mode: "specific"` with no `file` AND no `path`**: `safeParse({target_mode: "specific", vault: "v", heading: "A::B"}).success === false` AND issues mention "exactly one of `file` or `path` must be provided in specific mode".
    - **(3) US3 AC#4 — `target_mode: "specific"` with both `file` AND `path`**: rejected with the same XOR error.
    - **(4) US3 AC#7 — `target_mode: "active"` with `vault` set**: `safeParse({target_mode: "active", vault: "v", heading: "A::B"}).success === false` AND issues include `path: ["vault"]` mentioning "is not allowed in active mode".
    - **(5) US3 AC#8 — `target_mode: "active"` with `file` set**: rejected with similar `file is not allowed in active mode`.
    - **(6) US3 AC#9 — `target_mode: "active"` with `path` set**: rejected with similar `path is not allowed in active mode`.
    - **(7) Happy specific-path**: `safeParse({target_mode: "specific", vault: "v", path: "x.md", heading: "A::B"}).success === true`.
    - **(8) Happy active**: `safeParse({target_mode: "active", heading: "A::B"}).success === true`.
    - **(9) US3 AC#6 (empty heading)**: `heading: ""` rejected by `z.string().min(1)`; issues include `path: ["heading"]` with `code: "too_small"`.
    - **(10) US3 AC#6 (omitted heading)**: `heading` field omitted; rejected as `invalid_type`.
    - **(11) US3 AC#1 — single-segment heading**: `heading: "Foo"` rejected; error message contains "at least two".
    - **(12) US3 AC#2 (leading empty)**: `heading: "::Foo"` rejected; error message mentions "non-empty".
    - **(13) US3 AC#2 (trailing empty)**: `heading: "Bar::"` rejected; same error.
    - **(14) US3 AC#2 (interior empty)**: `heading: "A::::B"` rejected; same error.
    - **(15) Valid 2-segment heading**: `heading: "A::B"` accepted.
    - **(16) Valid 6-segment heading (max nesting matches H6)**: `heading: "A::B::C::D::E::F"` accepted.
    - **(17) US3 AC#10 — unknown top-level key rejected**: `safeParse({target_mode: "active", heading: "A::B", foo: "bar"}).success === false` AND issues include `code: "unrecognized_keys"`.
    - **(18) Output schema rejects extra keys**: `readHeadingOutputSchema.safeParse({content: "x", extra: "y"}).success === false`.
    - **(19) Output schema rejects non-string content**: `readHeadingOutputSchema.safeParse({content: 123}).success === false`.
    - **(20) Eval envelope discriminator** (parameterised it.each): `{ok: true}` without content → fail; `{ok: false}` without code → fail; `{ok: false, code: "OTHER"}` → fail (enum constraint); `{ok: true, content: "x"}` → pass; `{ok: false, code: "FILE_NOT_FOUND", detail: "x"}` → pass.

  **Constitution**: Principle II (20 cases co-located); Principle III (single source of truth — schema is the only typed surface for input shape; the output schema is the only typed surface for output shape; the envelope schema is the only typed surface for the eval wire format). FR-001..FR-009, FR-022, FR-024, SC-010, SC-019.

- [ ] T004 [US1] Create [src/tools/read_heading/handler.ts](../../src/tools/read_heading/handler.ts) and [src/tools/read_heading/handler.test.ts](../../src/tools/read_heading/handler.test.ts). Per [data-model.md § JS template body](data-model.md#js-template-body) + [§ Base64 payload assembly](data-model.md#base64-payload-assembly), [contracts/read-heading-handler.contract.md](contracts/read-heading-handler.contract.md), and [research.md R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R13, R14](research.md). Depends on: T003 (`ReadHeadingInput` / `ReadHeadingOutput` / envelope schema imports).

  - **(4a) Author [src/tools/read_heading/handler.ts](../../src/tools/read_heading/handler.ts)** with the `// Original — no upstream. read_heading handler: single invokeCli wrapper around the eval subcommand with a frozen JS template + base64 payload (R6 anti-injection); reuses Obsidian's pre-parsed metadataCache headings array (R7); two-stage envelope parse with discriminator-mapped UpstreamError (R13); Setext defence-in-depth filter (R14).` header (Principle V). Implement per [contracts/read-heading-handler.contract.md](contracts/read-heading-handler.contract.md):
    - `executeReadHeading(input: ReadHeadingInput, deps: ExecuteDeps): Promise<ReadHeadingOutput>`.
    - `ExecuteDeps = {logger: Logger, queue: Queue, spawnFn?: SpawnLike, env?: NodeJS.ProcessEnv}` — mirrors `executeReadProperty` exactly.
    - **NO per-call logger events** (R1).
    - **`JS_TEMPLATE` frozen string constant** at module scope, exactly per [data-model.md § JS template body](data-model.md#js-template-body). Single placeholder `__PAYLOAD_B64__` marks the base64 insertion point. Template includes the R14 Setext defence-in-depth filter (`text.charAt(h.position.start.offset) === '#'`).
    - **Payload assembly**:
      ```ts
      const payloadJson = JSON.stringify({
        active: input.target_mode === "active",
        path:   input.target_mode === "specific" ? input.path ?? null : null,
        file:   input.target_mode === "specific" ? input.file ?? null : null,
        segments: input.heading.split(HEADING_PATH_SEPARATOR),
      });
      const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
      const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);
      ```
    - **Single `invokeCli` invocation** (R3 / R4):
      - `target_mode: input.target_mode` (passed through unchanged — STANDARD R4 mapping; no flat-departure hack).
      - `vault: input.target_mode === "specific" ? input.vault : undefined`.
      - `command: "eval"`.
      - `parameters: {code}`.
      - `flags: []`.
    - **Two-stage envelope parse** (R13):
      - Strip optional `=> ` prefix from `result.stdout.trimStart()`.
      - Stage 1: `JSON.parse`. On failure, throw `UpstreamError({code: "CLI_REPORTED_ERROR", cause: err, details: {stage: "json-parse", stdout: result.stdout.slice(0, 500)}, message: "read_heading: eval response is not JSON: <prefix>"})`.
      - Stage 2: `readHeadingEvalResponseSchema.safeParse`. On failure, throw `UpstreamError({code: "CLI_REPORTED_ERROR", cause: validated.error, details: {stage: "envelope-parse", stdout: result.stdout.slice(0, 500)}, message: "read_heading: eval response shape unexpected"})`.
    - **Envelope-error mapping** (R13 table):
      - `validated.data.ok === false` AND `code === "NO_ACTIVE_FILE"` → throw `UpstreamError({code: "ERR_NO_ACTIVE_FILE", details: {stage: "envelope-error", detail}, message: "read_heading: no note focused; switch to specific mode or focus a note."})`.
      - `validated.data.ok === false` AND `code === "FILE_NOT_FOUND"` → throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: "FILE_NOT_FOUND", detail}, message: "read_heading: file not found (<detail>)"})`.
      - `validated.data.ok === false` AND `code === "HEADING_NOT_FOUND"` → throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: "HEADING_NOT_FOUND", detail}, message: "read_heading: heading path not found in file (<detail>)"})`.
      - `validated.data.ok === true` → return `{content: validated.data.content}`.
    - **Module size budget**: ≤ 130 LOC total file LOC (verified by `wc -l`). The JS template body adds bulk — if the file grows past 130 LOC, factor `JS_TEMPLATE` into a sibling `_template.ts` module.
  - **(4b) Author [src/tools/read_heading/handler.test.ts](../../src/tools/read_heading/handler.test.ts)** with the `// Original — no upstream. Tests for the read_heading handler — single-call argv assembly, base64 payload round-trip (R6 anti-injection lock), eval envelope parsing with => prefix, envelope ok:false → UpstreamError mapping (R13), unknown-vault inheritance (R5), CLI error propagation, single-spawn invariant.` header. **30 test cases** per [data-model.md § Handler tests (30 cases)](data-model.md#handler-tests-30-cases). Each happy-path test asserts: parsed result, `argvCalls.length === 1`, argv shape `[<binary>, ...optional vault=<v>, "eval", "code=<rendered-js>"]`, and the `code=` argv's base64 payload decodes via `Buffer.from(<b64>, "base64").toString("utf-8")` + `JSON.parse` to the expected `{active, path, file, segments}` object.

    **Happy path × file resolution × target_mode** (4 cases — IDs 21–24 per data-model.md):
    - **(21) US1 — specific + path + 2-segment heading**: stub stdout `=> {"ok":true,"content":"Use kebab-case.\n"}`; input `{target_mode: "specific", vault: "Demo", path: "x.md", heading: "Best Practices::Naming"}`; assert returned `{content: "Use kebab-case.\n"}` AND argv contains `vault=Demo` AND base64 payload decodes to `{active: false, path: "x.md", file: null, segments: ["Best Practices", "Naming"]}`.
    - **(22) US1 — specific + path + 3-segment nested heading**: stub stdout `=> {"ok":true,"content":"Use lowercase.\n"}`; input heading `"Best Practices::Naming::Casing"`; assert payload `segments: ["Best Practices", "Naming", "Casing"]`.
    - **(23) US1 — specific + file (wikilink)**: input `{target_mode: "specific", vault: "Demo", file: "best-practices", heading: "A::B"}`; stub stdout `=> {"ok":true,"content":"x"}`; assert payload `{file: "best-practices", path: null, ...}`.
    - **(24) US2 — active mode**: input `{target_mode: "active", heading: "A::B"}`; stub stdout `=> {"ok":true,"content":"Hello.\n"}`; assert argv has NO `vault=` token AND payload `{active: true, path: null, file: null, segments: ["A", "B"]}`.

    **Body terminators** (4 cases — IDs 25–28):
    - **(25) Sibling-level terminator**: stub returns body containing prose followed by another sibling heading line in the rendered text — but the terminator location is determined entirely inside the eval. The handler test stubs the eval response to assert the body slice excludes the sibling. Use representative `=> {"ok":true,"content":"<prose only, sibling heading already excluded>"}`.
    - **(26) Higher-level terminator**: same pattern; stub returns `=> {"ok":true,"content":"<prose only, parent heading already excluded>"}`.
    - **(27) Child-level terminator (US1 AC#2 — child subtree exclusion)**: same pattern; stub returns `=> {"ok":true,"content":"<prose only, child heading and its subtree already excluded>"}`.
    - **(28) EOF terminator**: same pattern; stub returns body up to text.length with no further heading bytes.

    **Edge content cases** (4 cases — IDs 29–32):
    - **(29) US1 AC#4 — empty body**: stub stdout `=> {"ok":true,"content":""}`; assert returned `{content: ""}` (empty string, no error).
    - **(30) US5 AC#2 — fence opacity**: stub returns body containing fenced ` ```markdown\n## Example heading inside fence\n``` ` literal content; assert returned `{content: <body with fence intact>}` (the fence text is included as content, not mistakenly treated as a terminator — Obsidian's pre-parsing already does this; the handler test verifies the wrapper does not transform the body).
    - **(31) Setext exclusion (R14)**: stub returns body containing a Setext-underline literal; assert the body content includes the Setext underline characters as content (not as a terminator). The R14 filter operates inside the eval; the handler test verifies the wrapper does not double-process.
    - **(32) FR-017 — duplicate heading paths first-match**: stub returns the FIRST occurrence's body; assert the wrapper returns it verbatim. Duplicate-disambiguation logic lives inside the eval; the handler test verifies the wrapper passes through.

    **Segment matching characterisation (FR-028)** (5 cases — IDs 33–37):
    - **(33) Closing-ATX form**: stub returns `=> {"ok":true,"content":"Closing ATX prose.\n"}` for input heading `"Outer::Heading With Closing ATX"`; assert payload's segments include the `"Heading With Closing ATX"` segment verbatim AND returned content is the body. The wrapper does not strip closing-ATX from the segment (that's Obsidian's job).
    - **(34) Surrounding whitespace**: input heading `"Outer::Heading With Trailing Whitespace"`; stub returns body; assert payload `segments` includes the trimmed heading text verbatim. The wrapper does not trim segments (that's Obsidian's job).
    - **(35) Inline markdown survives**: input heading `"Outer::My **Bold** Heading"`; stub returns body; assert payload `segments` includes `"My **Bold** Heading"` verbatim (the `**` characters are preserved in the segment text). Then a second sub-case: input heading `"Outer::My Bold Heading"` (without the `**`); stub returns `=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"..."}`; assert handler throws `CLI_REPORTED_ERROR` with `details.code === "HEADING_NOT_FOUND"`.
    - **(36) Anchor survives**: input heading `"Outer::Section ^my-anchor"`; payload `segments` includes `"Section ^my-anchor"` verbatim. Then sub-case: input `"Outer::Section"` (without anchor) → HEADING_NOT_FOUND.
    - **(37) Mis-cased segment**: input heading `"Outer::heading"` against a stub that returns HEADING_NOT_FOUND; assert handler propagates the envelope-error mapping per R13 (CLI_REPORTED_ERROR + details.code).

    **CRLF / LF line endings** (2 cases — IDs 38–39):
    - **(38) CRLF round-trip**: stub stdout `=> {"ok":true,"content":"Line 1\r\nLine 2\r\n"}` (the JSON encodes `\r\n` as `\\r\\n`; after JSON.parse the JS string contains literal `\r\n` byte pairs). Assert returned `content` contains `\r\n` byte-faithfully — compare byte-for-byte via `content === "Line 1\r\nLine 2\r\n"`.
    - **(39) LF round-trip**: stub stdout `=> {"ok":true,"content":"Line 1\nLine 2\n"}`. Assert returned `content === "Line 1\nLine 2\n"` (no expansion to CRLF).

    **Envelope ok:false cases** (3 cases — IDs 40–42):
    - **(40) FILE_NOT_FOUND**: stub stdout `=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: x.md"}`; assert handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: "FILE_NOT_FOUND", detail: "path: x.md"}})`.
    - **(41) HEADING_NOT_FOUND**: stub stdout `=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"segments: A::B not found in x.md"}`; assert handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-error", code: "HEADING_NOT_FOUND", ...}})`.
    - **(42) NO_ACTIVE_FILE**: stub stdout `=> {"ok":false,"code":"NO_ACTIVE_FILE","detail":"No note focused..."}`; assert handler throws `UpstreamError({code: "ERR_NO_ACTIVE_FILE", details: {stage: "envelope-error", detail}})` (NOTE: code is `ERR_NO_ACTIVE_FILE` not `CLI_REPORTED_ERROR`, per R13's mapping).

    **Parse failures** (2 cases — IDs 43–44):
    - **(43) JSON parse failure**: stub stdout `=> not-valid-json{`; assert handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "json-parse"}})`.
    - **(44) Envelope schema-parse failure**: stub stdout `=> {"ok":true}` (missing `content` field); assert handler throws `UpstreamError({code: "CLI_REPORTED_ERROR", details: {stage: "envelope-parse"}})`.

    **UpstreamError pass-through (cli-adapter inheritance)** (3 cases — IDs 45–47):
    - **(45) Vault not found (R5 inheritance)**: stub stdout `Vault not found.\n`, exit 0; cli-adapter's 011-R5 reclassifies BEFORE handler's parse step; assert handler propagates `UpstreamError({code: "CLI_REPORTED_ERROR", details: {message: "Vault not found.", ...}})` unchanged.
    - **(46) Error: no active file (dispatch-layer reclassifier)**: stub stdout `Error: no active file\n`, exit 0; assert handler propagates `UpstreamError({code: "ERR_NO_ACTIVE_FILE", ...})`. Defensive: the structured-envelope path (case 42) is the primary route, but if Obsidian's eval-runtime ever throws "Error: no active file" from a different path (e.g. a future Obsidian internal-API change), the dispatch-layer classifier still catches it.
    - **(47) Output cap fired**: stub raises `dispatchKill` (the dispatch-layer signal for cap exceedance); assert handler propagates `UpstreamError({code: "CLI_NON_ZERO_EXIT", details: {killReason: {kind: "cap"}}})`.

    **Wire shape lock (R6 / R12)** (3 cases — IDs 48–50):
    - **(48) Argv shape in specific mode**: assert argv = `[<binary>, "vault=Demo", "eval", "code=(async()=>{...})()"]`; the `code=` value MUST start with the frozen JS template prefix `(async()=>{` and end with the frozen suffix `})()`.
    - **(49) Argv shape in active mode**: assert argv = `[<binary>, "eval", "code=(async()=>{...})()"]`; assert no `vault=` token at any position.
    - **(50) R6 anti-injection — adversarial heading round-trips through base64**: input heading `'Outer::Inner"); doSomething(); //'` (contains injection-shaped chars); assert the argv payload regex `atob\('([A-Za-z0-9+/=]+)'\)` matches AND decoding the base64 + JSON.parse yields `segments: ["Outer", 'Inner"); doSomething(); //']` exactly preserved. Locks SC-021's structural-anti-injection contract.

    **Single-spawn invariant**: every test asserts `spawnCount === 1` after `executeReadHeading` returns/throws. R3 lock; prevents future regressions that would add a pre-flight probe call.

  **Constitution**: Principle I (handler is a thin transformer; no `child_process.spawn` direct invocation per SC-016); Principle II (30 cases co-located, including the R6 anti-injection lock on every payload-bearing test); Principle III (envelope schema is the only typed surface for the eval wire format); Principle IV (every `UpstreamError` propagated verbatim or wrapped per R13's mapping table; no new codes per FR-022). FR-009..FR-022, FR-024.

- [ ] T005 [US1] Create [src/tools/read_heading/index.ts](../../src/tools/read_heading/index.ts) and [src/tools/read_heading/index.test.ts](../../src/tools/read_heading/index.test.ts). Per [contracts/read-heading-handler.contract.md](contracts/read-heading-handler.contract.md), [contracts/read-heading-input.contract.md](contracts/read-heading-input.contract.md), and the existing [src/tools/read_property/index.ts](../../src/tools/read_property/index.ts) precedent. Depends on: T003, T004.

  - **(5a) Author [src/tools/read_heading/index.ts](../../src/tools/read_heading/index.ts)** with the `// Original — no upstream. read_heading tool registration via registerTool — wraps the { content } envelope for the MCP wire.` header (Principle V). Mirror `read_property/index.ts` structure exactly:
    - Import `registerTool` from `../_register.js`, `executeReadHeading, type ExecuteDeps` from `./handler.js`, `readHeadingInputSchema` from `./schema.js`.
    - Export `READ_HEADING_TOOL_NAME = "read_heading"`.
    - Export `READ_HEADING_DESCRIPTION` per FR-023: verb-led summary mentioning `help`, the tool's own name, the heading-targeted-body framing, the `{content: string}` output shape, AND the structural-only heading-path validator (≥2 non-empty `::`-separated segments).
    - Export `RegisterDeps = ExecuteDeps`.
    - Export `createReadHeadingTool(deps: RegisterDeps): RegisteredTool` — calls `registerTool({name, description, schema, deps, handler})`.
  - **(5b) Author [src/tools/read_heading/index.test.ts](../../src/tools/read_heading/index.test.ts)** with the `// Original — no upstream. Tests for the read_heading tool registration — descriptor shape, stripped schema, help mention, docs presence + content completeness, drift-detector parameterised lock.` header. **5 test cases** (IDs 51–55):
    - **(51) Descriptor name**: `createReadHeadingTool({logger, queue}).descriptor.name === "read_heading"`.
    - **(52) Stripped emitted schema**: emitted `inputSchema` has `type: "object"`, `additionalProperties: false`, `properties` includes all 5 keys (`target_mode`, `vault`, `file`, `path`, `heading`), `required` includes `["target_mode", "heading"]`, AND zero `description` keys at any depth (walk via recursion).
    - **(53) Descriptor description**: non-empty AND contains literal substring `"help"` (case-insensitive) AND contains literal substring `"read_heading"` AND contains a phrase surfacing the heading-path requirement (regex match for `/heading.*path|::|two.*segment/i`).
    - **(54) End-to-end VALIDATION_ERROR propagation + FR-018 spawn-spy gate**: inject a `deps.spawnFn` mock that throws `new Error("spawnFn called on validation failure — FR-018 violation")` if invoked. Call `createReadHeadingTool({logger, queue, spawnFn: spy}).handler({target_mode: "active", heading: "single-segment"})`; assert returned `ToolCallResult` is an `isError: true` envelope whose JSON-serialised payload has `code: "VALIDATION_ERROR"` AND assert the spawn-spy was NEVER called. Locks FR-018's "validation failures MUST occur strictly before any underlying CLI invocation" contract.
    - **(55) FR-023 docs presence + content completeness**: resolve [docs/tools/read_heading.md](../../docs/tools/read_heading.md) via `import.meta.url` (parity with 014's R13); assert file exists, does NOT contain the substring `<!-- TODO`, contains all 5 propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`), contains at least 4 example heading sections (`### Example` count ≥ 4), AND contains the multi-vault default-ambiguity limitation note (regex match for `/multi-?vault|multiple vaults|focused vault/i`) AND the documented fallback for out-of-reach paths (regex match for `/single-?segment|setext|::.*literally/i`). The doc itself is authored by T007.

  **Constitution**: Principle I (per-surface module entry point); Principle II (5 registration tests co-located); Principle III (the `inputSchema` is derived from the schema via `registerTool`'s `toMcpInputSchema` + `stripSchemaDescriptions` — no manual descriptor construction). FR-001, FR-023, FR-024, SC-016, SC-017.

- [ ] T006 [US1] Wire `read_heading` into the MCP server. Edit [src/server.ts](../../src/server.ts):

  - **(6a)** Add the import in alphabetical position: `import { createReadHeadingTool } from "./tools/read_heading/index.js";` — placed between `createObsidianExecTool` and `createReadNoteTool` imports (`obsidian_exec` < `read_heading` < `read_note`).
  - **(6b)** Add `createReadHeadingTool({logger, queue})` to the tools array between `createObsidianExecTool({logger, queue})` and `createReadNoteTool({logger, queue})` at [src/server.ts:71-72](../../src/server.ts#L71-L72).
  - **(6c)** Verify the registry-consistency test at [src/server.test.ts](../../src/server.test.ts) passes — the `assertToolDocsExist` aggregator now includes `read_heading` and asserts [docs/tools/read_heading.md](../../docs/tools/read_heading.md) exists. (T007 authors that file; if T007 has not landed yet, this test FAILS until T007 lands. Acceptable transient failure within this BI's WIP — both T006 and T007 land in the same merge.)
  - **(6d)** Verify the post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `read_heading` via its `it.each` registry walk. NO test-file modifications. Run `npx vitest run src/tools/_register.test.ts` — assert all `it.each` rows for `read_heading` pass.

  Depends on: T005.

  **Constitution**: Principle I (two-line addition; no structural change to server.ts); Principle II (existing drift detector + registry-consistency test cover the new entry without test additions). FR-001, SC-016.

**Checkpoint**: Phase 3 complete. `read_heading` is registered alongside `delete_note`, `find_by_property`, `help`, `obsidian_exec`, `read_note`, `read_property`, `write_note`. `tools/list` returns the post-010 flat descriptor for `read_heading`. The 55 co-located tests (20 schema + 30 handler + 5 registration) + the auto-covered drift detector + the registry-consistency test all pass. Stories 1, 2, 3, and 5 acceptance criteria satisfied at the implementation layer (Story 4 docs gate is T007).

---

## Phase 4: User Story 4 — Documentation surface (Priority: P2)

**Goal**: Author the new `docs/tools/read_heading.md` body. Update sibling docs (index) to acknowledge the new tool. Story 4's tests in T005 case (55) ASSERT the doc's existence + content completeness; Phase 4 makes them pass.

**Independent Test**: per [spec.md US4 IT](spec.md#user-story-4--documentation-surface-for-the-typed-tool-priority-p2) — `help({tool_name: "read_heading"})` returns the populated body (no TODO stub, all 5 error codes named, ≥4 worked examples covering 2-segment specific-mode / 3+-segment nested / active-mode / heading-not-found error or validation-rejection error, multi-vault default-ambiguity limitation documented, documented fallback for out-of-reach paths named). Verifiable by file inspection (T007 + T008 outputs) and by the index.test.ts case (55) added in T005.

- [ ] T007 [P] [US4] Author [docs/tools/read_heading.md](../../docs/tools/read_heading.md) (NEW file — the `assertToolDocsExist` aggregator does NOT pre-populate stubs; T006's registry-consistency test will fail until this lands). Per FR-023 + US4 AC#1. Different file from src/, fully parallelisable with T003-T006.

  **Document content** (sections required):
  - **Header**: title (`# Read Heading (read_heading)`), one-paragraph summary mentioning the typed surface + the heading-targeted-body framing + the `{content: string}` output shape + the token-saving framing (replaces 5–50k char full-file `read_note` + parse with 100–500 char structured response).
  - **Input schema**: per-field policy table (matches [contracts/read-heading-input.contract.md § Field policy](contracts/read-heading-input.contract.md#field-policy)). Document the 5 fields, their types, defaults, and required-vs-optional status. Document the standard `target_mode` discriminator semantics (specific vs active) per ADR-003.
  - **Heading-path validator (FR-006 / FR-007)**: structural-only — split on `::`, ≥2 non-empty segments. Single-segment H1-only reads, headings whose text contains `::` literally, and Setext-style headings are out-of-reach. Document the fallbacks: full-file `read_note` plus client-side parse for all three out-of-reach cases.
  - **Output shape**: `{content: string}` — describe the byte-faithful pass-through (FR-019, FR-020), the empty-body case (FR-011), the line-ending preservation, the no-error-on-zero-prose semantic (a heading with no body returns `content: ""`, not an error).
  - **Error roster**: all 5 propagated codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) with one-or-two sentences each describing when each surfaces. Specifically call out: (a) heading-not-found produces `CLI_REPORTED_ERROR` with `details.code = "HEADING_NOT_FOUND"` (FR-013); (b) file-not-found produces `CLI_REPORTED_ERROR` with `details.code = "FILE_NOT_FOUND"` (FR-014); (c) unknown-vault produces `CLI_REPORTED_ERROR` per 011-R5 inheritance (FR-015); (d) active-mode no-focus produces `ERR_NO_ACTIVE_FILE` (FR-016); (e) validation rejections (single-segment, empty-segment, target_mode discriminator violations) produce `VALIDATION_ERROR` before any CLI dispatch (FR-018); (f) the cli-adapter's existing 10 MiB output cap fires for pathologically large body slices as `CLI_NON_ZERO_EXIT`, never silent truncation. NO new codes.
  - **Worked examples (≥4 per US4 AC#1 / FR-023)**:
    - (i) **2-segment specific-mode** — `read_heading({target_mode: "specific", vault: "Demo", path: "areas/best-practices.md", heading: "Best Practices::Naming"})` → `{content: "Use kebab-case.\n"}`.
    - (ii) **3+-segment nested specific-mode (file locator)** — `read_heading({target_mode: "specific", vault: "Demo", file: "best-practices", heading: "Best Practices::Naming::Casing"})` → `{content: "Use lowercase letters and dashes.\n"}`.
    - (iii) **Active-mode** — `read_heading({target_mode: "active", heading: "Top::Section A"})` → `{content: "Hello.\n"}`.
    - (iv) **Validation-rejection example** — `read_heading({target_mode: "specific", vault: "Demo", path: "x.md", heading: "BestPractices"})` → `VALIDATION_ERROR` with field path `["heading"]` and message about ≥2 segments.
    - (v) [optional] **Heading-not-found example** — `read_heading({..., heading: "Best Practices::NonExistent"})` → `CLI_REPORTED_ERROR` with `details.code = "HEADING_NOT_FOUND"`.
  - **Adversarial-edge-case behaviours**:
    - **Multi-vault default ambiguity (R11)**: prominently note that the underlying CLI's `vault=` parameter is functionally ignored by `eval`. The eval runs against whichever vault Obsidian's running instance currently has focused. Multi-vault users open the target vault before invoking `read_heading`. Cite [research.md R11](research.md#r11--multi-vault-default-ambiguity-documented-limitation).
    - **eval-as-CLI-entry-point stability concern (R2)**: explain that `read_heading` is implemented atop the Obsidian CLI's developer-section `eval` subcommand because no native heading-body subcommand exists. The wrapper reaches into Obsidian's internal `app.metadataCache.metadataCache[hash].headings`, `app.vault.adapter.read`, `app.workspace.getActiveFile`, and `app.metadataCache.getFirstLinkpathDest` APIs. Future Obsidian updates may surface as test failures rather than silent drift; the wrapper's two-stage envelope-parse step is the structural backstop.
    - **Boundary rule (Q1)**: the body terminates at the first subsequent heading marker of any depth — child, sibling, or shallower — or at EOF. Child-heading subtrees are excluded from the parent's body. Cite Q1 of the 2026-05-09 clarifications session.
    - **ATX-only (Q2)**: only ATX-style headings (`# Heading` through `###### Heading` with the required space after the `#`-run) are recognised as path segments AND as body terminators. Setext-style underlines (`====` for H1, `----` for H2) are content, not boundaries. Documented fallback: `read_note` plus client-side parse if the caller needs Setext addressability.
    - **Segment matching (Q3 / FR-028)**: minimal-normalisation, case-sensitive byte compare. Closing-ATX (`## Heading ##`) and surrounding whitespace are stripped by Obsidian's pre-parser; inline markdown (`**bold**`, `[link](url)`) and Obsidian anchor markers (`^anchor-id`) survive in the heading text and MUST be supplied verbatim by the caller. Mis-cased segments (different case from the heading text) do NOT match.
    - **Duplicate heading paths (FR-017)**: when two or more headings in the same file share the textually-identical full path, the first-document-order match is returned. Locks deterministic behaviour.
    - **CRLF / LF line endings (FR-019)**: returned `content` carries the file's on-disk line endings byte-faithfully. The wrapper does NOT normalise line endings.
    - **Body byte-level preservation (FR-020)**: returned `content` is the raw bytes between heading positions, including fenced code blocks, table pipes, list indentation. The wrapper does NOT re-format.
    - **Practical 10 MiB body ceiling (R10)**: heading bodies exceeding ~10 MiB after JSON encoding (~7 MiB raw content) trigger the cli-adapter's output cap, surfacing as `CLI_NON_ZERO_EXIT`. Recommended fall-back for very-large-body cases: full-file `read_note`.
  - **Anti-injection structural guarantee (R6 / SC-021)**: brief callout explaining the implementation's structural anti-injection contract — user-supplied `path`, `file`, `heading` flow through `JSON.stringify` → base64 → frozen JS template's `atob` + `JSON.parse`. No user input ever reaches the JS source as text. The base64 alphabet `[A-Za-z0-9+/=]` is structurally safe inside any JS string literal. Most callers don't need to care; surfacing it for security-conscious reviewers.
  - **Cross-references**: links to the [cli-adapter](../../specs/003-cli-adapter/spec.md), the [help tool](../../specs/005-help-tool/spec.md), `read_note` (the documented fallback for out-of-reach heading paths), and `find_by_property` (the closest sibling — also eval-composition-based, also has the inherited vault-routing limitation).

  **Header convention**: NO `// Original — no upstream.` header (Markdown documentation is exempt per [005-help-tool FR-019](../005-help-tool/spec.md)). NO `<!-- TODO -->` markers.

  **Constitution**: Principle V (Markdown exempt from source-header convention per existing precedent); ADR-005 (progressive-disclosure documentation lives in docs/, not in schema). FR-023, SC-017.

- [ ] T008 [P] [US4] Update [docs/tools/index.md](../../docs/tools/index.md) — add a one-line summary for `read_heading` per the existing convention. Match the established style for existing entries (typically `- [<tool_name>](<tool_name>.md): <one-sentence summary>`). The summary MUST surface the heading-targeted-body framing (e.g., `- [read_heading](read_heading.md): Read the body of a single named heading from a vault note (returns { content: string } — replaces full-file read_note plus client-side Markdown parse for the section-extraction case).`). Different file from T007; can run in parallel.

  **Constitution**: Principle V (Markdown exempt). FR-023.

**Checkpoint**: Phase 4 complete. `help({tool_name: "read_heading"})` returns the populated body. T005 case (55) passes (was failing prior — required T007 to land). The full `read_heading` BI surface is now shippable.

---

## Phase 5: Polish & Release

**Purpose**: Release artifacts (CHANGELOG, package.json), end-to-end verification (quickstart S-1..S-19), manual verifications (S-20..S-22), and PR Constitution Compliance.

- [ ] T009 [P] Update [package.json](../../package.json) `description` field to mention `read_heading` alongside the existing typed tools. Current text (post-014): `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), write_note (typed create/overwrite tool), delete_note (typed delete tool with safety defaults), read_property (typed surgical frontmatter-property read), and find_by_property (typed value-to-file lookup over frontmatter)."`. Update to: `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), read_heading (typed heading-body read tool), write_note (typed create/overwrite tool), delete_note (typed delete tool with safety defaults), read_property (typed surgical frontmatter-property read), and find_by_property (typed value-to-file lookup over frontmatter)."`. No other package.json changes here (the version bump is in T010).

  **Constitution**: N/A (release-metadata only).

- [ ] T010 Add a [CHANGELOG.md](../../CHANGELOG.md) release entry for `0.2.8` per the project's release convention. Bump `package.json:version` from `0.2.7` to `0.2.8` (PATCH bump per plan — purely additive surface; no breaking changes; the new typed surface for heading-body reads is a new tool-surface addition, not a behaviour change to existing tools). The CHANGELOG entry should:

  - **Add**: `read_heading` typed MCP tool wrapping the Obsidian CLI's `eval` subcommand with a frozen JS template that walks `app.metadataCache.metadataCache[hash].headings` (Obsidian's pre-parsed heading array) to find a named heading and slice its body via `app.vault.adapter.read(path)`. Returns `{content: string}` — the body bytes between the matched heading's `position.end.offset` and the next heading marker of any depth (or EOF). Replaces the agent's "full-file read_note + client-side Markdown parse" sequence (5-50k tokens for long documents) with a single typed call returning just the named section's body bytes (typically 100-500 tokens).
  - **Note**: the schema uses the STANDARD `target_mode: "specific" | "active"` discriminator (parity with `read_note` / `write_note` / `delete_note` / `read_property`); this is the FIRST eval-composition typed tool to do so (014's `find_by_property` is vault-wide and has no discriminator).
  - **Note**: the `heading` field is validated structurally — split on `::`, require ≥2 non-empty segments. Single-segment H1-only reads, headings whose text contains `::` literally, and Setext-style headings are out-of-reach (documented fallback: full-file `read_note` plus client-side parse).
  - **Note**: anti-injection is structural (R6 / parity with 014) — user inputs flow through `JSON.stringify` → base64 → frozen JS template's `atob` + `JSON.parse`. No user input ever reaches the JS source as text.
  - **Note**: the boundary rule is **first-subsequent-heading-marker-of-any-depth** per the [Q1 clarification](../015-read-heading/spec.md#clarifications) — child subtrees are naturally excluded.
  - **Note**: ATX-only — Setext underlines are content, not boundaries — per the [Q2 clarification](../015-read-heading/spec.md#clarifications).
  - **Note**: segment matching is **case-sensitive minimal-normalisation byte compare** per the [Q3 clarification](../015-read-heading/spec.md#clarifications) — closing-ATX and surrounding whitespace are stripped by Obsidian's pre-parser; inline markdown and anchor markers survive and MUST be supplied verbatim.
  - **Note**: the inherited vault-routing limitation applies (the CLI's `vault=` parameter is functionally ignored by `eval`; multi-vault users open the target vault before invoking) — same limitation as 014 / 013 / 011.
  - **Note**: heading-not-found, file-not-found, and active-mode-no-focus all surface as structured errors via the eval-envelope's `{ok: false, code, detail}` discriminator; zero new error codes per FR-022.
  - **Note**: `obsidian_exec` remains the freeform escape hatch for unwrapped subcommands.
  - **Reference**: link to `specs/015-read-heading/spec.md` for the full BI specification.

  Depends on: T007 (the docs that callers will use are in place before the release names them).

  **Constitution**: N/A (release-metadata).

- [ ] T011 Run [quickstart.md](quickstart.md) S-1..S-19 verification (CI-runnable + sanity-check scenarios). Specifically:

  - **S-1..S-19 from quickstart.md**: `npm run test` — assert 0 failures; the 55 new tests across schema/handler/index pass.
  - **Drift detector + registry-consistency test**: pass for `read_heading`.
  - **Module-size budget**: `wc -l src/tools/read_heading/handler.ts` ≤ 130; `wc -l src/tools/read_heading/schema.ts` ≤ 80; `grep -nE "child_process\.spawn|spawn\(" src/tools/read_heading/handler.ts` returns no matches (handler routes through `invokeCli`, not direct spawn).
  - **Type single-source-of-truth**: `grep -nE "^(interface|type)\s+ReadHeading.*=.*\{" src/tools/read_heading/schema.ts` returns no matches (type ALIASES via `z.infer` are permitted; hand-rolled interfaces are forbidden per Principle III).
  - **No `.describe()` calls**: `grep -nE "\.describe\(" src/tools/read_heading/schema.ts` returns no matches (per ADR-005, SC-016).
  - **S-deliberate-revert (manual sanity check)**: pick ONE critical line in [src/tools/read_heading/handler.ts](../../src/tools/read_heading/handler.ts) (e.g., the base64-encoding of the payload — replace `Buffer.from(payloadJson, "utf-8").toString("base64")` with `payloadJson` so the payload is interpolated raw); revert it temporarily; run `npx vitest run src/tools/read_heading/`; assert at least 1 test fails (specifically test #50 — the anti-injection round-trip assertion). Restore the line via `git checkout`. Confirms the new tests actually exercise the new code paths.
  - **Single-call architecture (R3)**: every handler test asserts `argvCalls.length === 1`. Per R3.
  - **Anti-injection guarantee (R6)**: `grep -E "code=" src/tools/read_heading/handler.ts` confirms the `code=` parameter is built via `JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64)` and NOT by string concatenation of user input. The frozen JS template's body is unchanged across all queries.
  - **docs/tools/read_heading.md greps**: file exists, contains `<!-- TODO` zero times, all 5 error codes mentioned (`VALIDATION_ERROR` / `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR` / `ERR_NO_ACTIVE_FILE`), ≥4 example heading sections, multi-vault default-ambiguity note present, eval-as-CLI-entry-point stability concern present, out-of-reach fallback (single-segment / `::`-in-text / Setext) present.
  - **Aggregate coverage gate**: aggregate statements coverage ≥ 89.6% (per [vitest.config.ts:20](../../vitest.config.ts#L20)).
  - **SC-016 — frozen-surface diff check**: `git diff main..HEAD -- src/tools/obsidian_exec/ src/tools/help/ src/tools/read_note/ src/tools/write_note/ src/tools/delete_note/ src/tools/read_property/ src/tools/find_by_property/ src/cli-adapter/ src/target-mode/ src/errors.ts src/logger.ts src/queue.ts` returns empty (no substantive diff in any sibling tool's module or any frozen primitive); `git diff main..HEAD -- src/server.ts` shows ≤4 added lines (one import + one tools-array entry + alphabetical placement).

  Depends on: T001-T010.

  **Constitution**: Principle II (full test suite passes); Principle III (zod single-source-of-truth verified); Principle IV (no new error codes, all failures structured). FR-024, SC-010, SC-016, SC-017, SC-018, SC-019, SC-021.

- [ ] T012 [P] Manual S-20 (live happy path against TestVault) + S-21 (segment-matching characterisation) + S-22 (Setext exclusion + fenced opacity) from [quickstart.md](quickstart.md). Run against MCP Inspector / Claude Desktop with a fresh `npm run build` of the server and the test vault opened in Obsidian. Capture:

  - **S-20**: seed `Sandbox/015-quickstart.md` with the multi-heading fixture from quickstart.md. Probe `read_heading` for `Best Practices::Naming` (expect `"Use kebab-case.\n"`), `Best Practices::Naming::Casing` (expect `"Use lowercase letters and dashes.\n"`), `Best Practices::Tests` (expect `"Write the test first.\n"` — last heading; body extends to EOF). Cleanup the fixture.
  - **S-21**: seed `Sandbox/015-segments.md` with the closing-ATX / surrounding-whitespace / inline-markdown / anchor / case-sensitivity fixture from quickstart.md. Probe each heading and assert: closing-ATX matches the trimmed text; trailing-whitespace matches the trimmed text; inline-markdown survives (matches verbatim, fails when stripped); anchor survives (matches verbatim, fails when stripped); mis-cased fails. Cleanup.
  - **S-22**: seed `Sandbox/015-setext.md` with the Setext-as-content + fenced-code-block-with-heading fixture from quickstart.md. Probe `read_heading({heading: "Outer::ATX Section"})` and assert the body INCLUDES the Setext-underline line, the fenced block, and the trailing prose (none of those internal-looking-like-headings act as terminators). Cleanup.

  Captures the live-CLI characterisation deferred from T0 (segment-matching, Setext, fenced-opacity), the active-mode happy path, and the documented fallback signposting.

  Depends on: T009 (built `dist/` ready for client loading) and T010 (the version/CHANGELOG that the PR description will reference).

  **Constitution**: Principle IV (real-CLI failure paths verified through real clients, not just stubs). SC-001, SC-002, SC-005, SC-009, SC-014, SC-022.

- [ ] T013 Fill the PR description's Constitution Compliance checklist (5/5 PASS expected per [plan.md Constitution Check](plan.md#constitution-check)). Also note in the PR description: (a) the T0 capture results from T001 (which 20 deferred cases were verified with their wording — 5 segment-matching + 4 content edge cases + 4 body terminators + 3 runtime + 4 stub-coverage live-confirmation added by /speckit-analyze A2 remediation), (b) the /speckit-analyze remediation summary (2 MEDIUM A1 + A2 + 3 LOW B1 + C1 + C2 — all dispositioned; A1 reconciled SC-020's case count 19 → 23 to match FR-025's enumeration; A2 added Group E T0.17–T0.20 to T001 to close stub-only coverage gaps; B1 added forward reference from FR-019 to FR-020; C1 explicitly deferred T0.5 to T012 S-21; C2 documented T0.10–T0.13 as derived from T0.6 with no separate fixtures), (c) NO plan-stage spec amendments (per [plan.md Reporting](plan.md#reporting) — all spec contracts hold against the live CLI and against Obsidian's metadataCache shape), (d) the resolution of the Q1 / Q2 / Q3 clarifications (codified in spec before plan; reaffirmed by live verification matrix), (e) the **scope-ENFORCED** treatment of ADR-003 (target-mode) — `read_heading` reuses `applyTargetModeRefinement` + `targetModeBaseSchema` from `src/target-mode/target-mode.ts`; the ADR is NOT amended. Include links to the spec / plan / research / data-model / contracts artifacts. Per Constitution v1.2.0 §Development Workflow #8.

  Depends on: T001-T012.

  **Constitution**: §Development Workflow #8 (PR-level checklist). Principle I, II, III, IV, V verification.

**Checkpoint**: BI ready to merge. All 22 quickstart scenarios pass (19 CI + 3 manual); PR description complete; coverage gate green; manual end-to-end verifications captured. The PR can be opened for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: skipped — toolchain ready.
- **Foundational (Phase 2)**: T001 first, T002 [P after T001] (T002 is verification-only — re-confirms the existing 011-R5 cli-adapter clause works for `eval`, with the test inheritance lock already in place from 014). Loosely BLOCKS Phase 3 — the deferred T0 cases inform documentation (T007) AND lock segment-matching behaviour (T0.1–T0.5 inform T004's stub responses).
- **User Story 1 / 2 / 3 / 5 (Phase 3)**: T003 → T004 → T005 → T006 (sequential per file dependencies). T006 depends on T007 for docs (registry-consistency test fails until T007 lands — but both T006 and T007 land in the same merge; transient WIP failure acceptable).
- **User Story 4 (Phase 4)**: T007 + T008 file-disjoint; can run in parallel ([P]).
- **Polish (Phase 5)**: T009 in parallel with T010, then T011 (depends on all prior), then T012 (depends on T009/T010), then T013 (depends on all).

### User Story Dependencies

- **User Story 1 (specific-mode happy path P1)**: depends on Foundational (T001 for T0 captures). Deliverable spans T003 + T004 + T005 + T006. **Note**: this BI's "User Story 1 ship" effectively ALSO delivers Stories 2, 3, and 5 because they exercise the same source files. The story-tag discipline maps acceptance criteria to test cases (per FR-024), not to separable implementation slices.
- **User Story 2 (active-mode P1)**: implementation entirely covered by T004 cases 24, 42, 49 + T011's S-16 + T012's manual probe. No dedicated tasks.
- **User Story 3 (validation P1)**: implementation entirely covered by T003's 20 schema cases + T005's case 54. No dedicated tasks.
- **User Story 4 (P2 docs)**: depends on T005's index.test.ts case (55) + T007's docs authoring; deliverable is T007 + T008. Independent of Stories 1/2/3/5 in spirit (docs vs. code), but the index.test.ts case (55) couples them in test order.
- **User Story 5 (P3 byte-fidelity)**: implementation entirely covered by T004 cases 30, 31, 38, 39 (CRLF / LF / fenced-code / Setext). No dedicated tasks.

### Within Each User Story

- Within US1: schema (T003) before handler (T004) before registration (T005) before server-wire (T006). Test cases land WITH their source file (no separate red-green TDD loop per project convention).
- Within US4: T007 / T008 are file-disjoint — fully parallelisable.

### Parallel Opportunities

- **T002** can run in parallel with T003-T006 once T001 is complete (T002 touches `cli-adapter`, T003-T005 touch `read_heading/`, T006 touches `server.ts` — all file-disjoint).
- **T007 + T008** run in parallel with each other.
- **T007** can run in parallel with T003-T006 (file-disjoint).
- **T009** can run in parallel with T010.
- **T012** can run in parallel with T011 once T009/T010 are done (T012 is manual against a built `dist/`; T011 is automated against the source).

### Blocking-task Summary

| Blocker | Blocks | Reason |
|---|---|---|
| T001 | T007 (T0.1–T0.5 segment-matching captures, T0.6 Setext outcome, T0.8/T0.9 CRLF/LF outcomes need to land in docs) | Live-CLI characterisation locks doc-stage adversarial-edge-case content |
| T001 (specifically T0.1–T0.5, T0.6) | T004 (handler test stubs depend on Obsidian's heading-text-strip behaviour to match real-world responses) | Test-fixture authenticity |
| T003 | T004 (`ReadHeadingInput` / `readHeadingEvalResponseSchema` imports) | Type/schema dependency |
| T004 | T005 (`executeReadHeading` import) | Function dependency |
| T005 | T006 (`createReadHeadingTool` import) | Factory dependency |
| T007 | T006 PASSING (registry-consistency test) | Doc must exist for `assertToolDocsExist` |
| T009 + T010 | T011 (CI verification needs version + CHANGELOG in place) | Release-metadata coupling |
| T011 | T012 (manual verification needs CI green first) | Confidence ordering |
| T012 + T013 | merge | PR completeness |

---

## Parallel Example: User Story 1 + Story 4 in parallel after Foundational

```text
# After T001 + T002 land:

# Track A — read_heading source modules (sequential per file dep):
T003 (schema.ts + schema.test.ts)
  └─> T004 (handler.ts + handler.test.ts)
        └─> T005 (index.ts + index.test.ts)
              └─> T006 (server.ts wire-up)

# Track B — docs (parallelisable with track A):
T007 (docs/tools/read_heading.md)        [P with T003-T006]
T008 (docs/tools/index.md update)        [P with T003-T006 AND with T007]
```

A solo implementer typically lands T003-T008 sequentially in commit order: T003 → T004 → T005 → T007 → T006 → T008 (with T007 BEFORE T006 so the registry-consistency test passes immediately). A two-implementer team can split tracks A and B.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3 + 5 — the implementation slice)

1. T001 (foundational live-CLI characterisation; 20 deferred cases against the authorised TestVault Sandbox — 16 originally enumerated at plan stage + 4 added by /speckit-analyze A2 remediation 2026-05-09).
2. T002 (verification-only — re-confirms 011-R5 cli-adapter clause works for `eval` subcommand; test inheritance lock already in place from 014).
3. T003 → T004 → T005 → T007 (out-of-order to satisfy T006's docs-presence test) → T006.
4. **STOP and VALIDATE**: run `npm run test`; assert 55 new tests pass; assert drift detector + registry-consistency tests pass; assert single-call architecture asserts on every handler test (R3); assert anti-injection round-trip assertion (test 50) passes distinguishably from happy-path tests; assert envelope error mapping (tests 40–42) maps onto the right UpstreamError codes per R13's table.
5. The MVP is now `read_heading` registered + schema + handler + index + docs. Stories 1, 2, 3, 5 acceptance criteria all satisfied.

### Incremental Delivery

The 015-read-heading BI is fundamentally a single atomic ship — there is no "ship a partial read_heading" intermediate state because the schema/handler/index are tightly coupled. The "incremental" framing applies to the FOLLOW-UP BIs that compose on `read_heading`: BI candidates are `write_heading` (write the body of a single named heading), `find_heading` (find headings whose text matches a pattern across the vault), `read_heading_with_subtree` (returns a heading's body PLUS all its child-heading subtrees — the "outer span" interpretation that Q1 rejected for the base case). Each is a separate BI; this BI delivers the body-only single-segment-path read surface.

### Quality Gates (in order)

1. T011 — `npm run test` green; coverage ≥ 89.6%; greps pass; single-call architecture verified at handler-test layer; anti-injection round-trip locked (test 50); deliberate-revert sanity check passes.
2. T012 — manual S-20 against MCP Inspector / Claude Desktop (live happy path with seeded fixture); S-21 segment-matching characterisation against the closing-ATX / surrounding-whitespace / inline-markdown / anchor / case-sensitivity fixture; S-22 Setext exclusion + fenced opacity against the Setext-as-content + fenced-code-block-with-heading fixture.
3. T013 — Constitution Compliance checklist filled; ADR-003 scope-ENFORCED note included; Q1/Q2/Q3 clarification resolutions cited; T0 capture results from T001 included.
4. PR opened, reviewed, merged.
5. T010's `0.2.8` version bump triggers an `npm publish` per the project release convention.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability (US1 / US4 only — US2, US3, US5 are covered by tests within US1's source files)
- Each user story should be independently completable and testable
- Verify tests fail before implementing (S-deliberate-revert in T011)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
