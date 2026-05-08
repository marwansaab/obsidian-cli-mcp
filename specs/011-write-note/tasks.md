---
description: "Task list for 011-write-note — Add Write Note Typed MCP Tool"
---

# Tasks: Add Write Note Typed MCP Tool

**Input**: Design documents from [`/specs/011-write-note/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test cases in the same task. The verify-fails-first sanity check is captured exactly once, manually, by T013 (the SC-009 deliberate-revert check on the implementer's machine — equivalent to 010's T011).

**Organization**: Tasks are grouped by user story per the project convention. The `write_note` module is fundamentally a single atomic ship — Stories 1–7 + 9 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 8 is the registration + documentation layer. The `[US1]` tag marks the primary-story attribution for each implementation task; the test inventory in [spec.md FR-016](spec.md#fr-016) maps each test case to its source User Story (so you can read tests stories-first AND implementation files-first). Phase 2 Foundational is the live-CLI characterisation (T001) that gates SC-012 + SC-011 and the conditional cli-adapter R5 clause (T002).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers (US1 / US8 — the `write_note` BI's two practical primary-stories per the file-vs-story mapping in plan.md). Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read_note`). All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at [src/tools/write_note/](../../src/tools/write_note/) (does NOT exist yet — created by T003–T005).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–010). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler's response-parsing logic against verified wording, and the optional adapter-layer clause that the unknown-vault edge case may need.

**⚠️ CRITICAL — SC-012 GATE**: T001 case (vii) verifies the live CLI rejects path-traversal-shaped paths (`../../etc/passwd.md`). If the CLI does NOT reject, this BI is amended pre-ship to add a tool-layer reject (one schema test case + one schema-`superRefine` clause); the merge gate does not clear without verification. Per [research.md FR-019](research.md#fr-019-case-capture-status) + [spec.md SC-012](spec.md).

- [X] T001 Live-CLI characterisation (T0 protocol per [research.md](research.md#fr-019-case-capture-status)). Run live probes against a USER-AUTHORISED scratch subdirectory in the active vault (e.g., `_speckit-011-write-note-research/`); capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Update R4 / R5 / handler logic / schema clauses if any T0 result differs from the provisional decisions. Cleanup the scratch subdir via `obsidian delete path=_speckit-011-write-note-research/...` after capture. Cases:

    - **(T0.1) Specific-mode create at new path**: `obsidian vault="<vault>" create path="_speckit-011-write-note-research/case1.md" content="hello"`. Capture stdout (provisional R4: `Created: <path>`) and exit code. Lock the parser's expected substring.
    - **(T0.2) Specific-mode create via wikilink**: `obsidian vault="<vault>" create name="ScratchNote-T0-2" content="hello"`. Capture stdout (expected `Created: <CLI-resolved canonical path>`) and the canonical-path resolution rule (which folder does the wikilink land in by default?).
    - **(T0.3) Specific-mode overwrite**: re-run T0.1 with the `overwrite` flag added — `obsidian vault="<vault>" create path="_speckit-011-write-note-research/case1.md" content="rewritten" overwrite`. Capture the wording. **TRIGGER**: if create vs overwrite is indistinguishable from CLI output, R4 amends pre-merge per [research.md R4 alternatives](research.md#r4--createdtrue-vs-createdfalse-derivation-from-cli-response).
    - **(T0.4) Unknown vault (R5 verification)**: `obsidian vault="NoSuchVault" create path="x.md" content="x"`. Capture stdout (expected `Vault not found.`) and EXIT CODE. **TRIGGER**: if exit code is `1` (not `0`), R5 collapses to a no-op (CLI_NON_ZERO_EXIT covers it) and T002 is skipped.
    - **(T0.5) Overwrite=false against existing**: re-run T0.1 WITHOUT `overwrite`; capture the verbatim CLI rejection wording. The handler's `CLI_REPORTED_ERROR.message` propagation is locked against this wording per Story 3.
    - **(T0.6) Non-existent template**: `obsidian vault="<vault>" create path="_speckit-011-write-note-research/case6.md" content="x" template="DefinitelyNotATemplate"`. Capture wording + exit code; classify per propagated code (likely `CLI_REPORTED_ERROR` or `CLI_NON_ZERO_EXIT`).
    - **(T0.7) Path-traversal — SC-012 GATE**: `obsidian vault="<vault>" create path="_speckit-011-write-note-research/../../etc/passwd_test.md" content="x"`. **MUST be rejected by the CLI** (either non-zero exit with stderr explaining, or exit 0 with `Error:` on stdout). Verify the on-disk filesystem does NOT have a new `passwd_test.md` outside the vault root. **TRIGGER**: if the CLI accepts the input and writes outside the vault, T003 grows a schema-layer `superRefine` clause that rejects `path` values containing `../` or `..\\` segments (plus a co-located schema test case); merge gate does not clear without this.
    - **(T0.8) Active-mode rewrite of focused note**: with a focused note open in Obsidian, `obsidian create content="active T0.8" overwrite`. Capture stdout (expected: focused-note's path, possibly with `Updated:` or `Created:` prefix per T0.3). **TRIGGER**: if active-mode response differs from specific-mode shape, the handler's `parseCreateResponse` gains an active-mode-specific branch.

  **Cleanup**: after capture, `obsidian delete path=_speckit-011-write-note-research/case1.md`, `obsidian delete path=_speckit-011-write-note-research/case6.md`, `obsidian delete path="<wikilink-resolved canonical path>"` (from T0.2), AND remove the `_speckit-011-write-note-research/` folder if empty. Confirm zero residual files via `obsidian files folder=_speckit-011-write-note-research`.

  **Constitution**: Principle IV (the captured wording becomes the source-of-truth for handler error classification — preserves chain-of-custody from CLI to MCP client). FR-019 / SC-011 / SC-012.

- [X] T002 [P after T001] **CONDITIONAL** — R5 adapter-layer response-inspection clause for unknown-vault, IF AND ONLY IF T0.4 confirms the CLI returns exit code `0` with stdout `Vault not found.`. Add to [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) a stdout-pattern check inside `invokeCli`'s success path: after the `dispatchCli` call returns success, if `out.stdout.trimStart()` matches the captured T0.4 prefix, throw `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "<verbatim CLI wording>", details: { stdout: out.stdout, stderr: out.stderr } })` instead of returning the success envelope. Co-located test in [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) — feed a stub `spawnFn` that returns exit-0 + the verbatim T0.4 stdout; assert the call rejects with `UpstreamError({ code: "CLI_REPORTED_ERROR" })` AND the message preserves the CLI wording verbatim. Update [src/cli-adapter/cli-adapter.ts:1](../../src/cli-adapter/cli-adapter.ts#L1) header comment to note the response-inspection clause and cite the BI / research note.

  **If T0.4 confirms exit code is `1` (not `0`)**: T002 collapses to a single-line update to the [research.md](research.md) R5 entry noting "T0.4 verified exit-1; CLI_NON_ZERO_EXIT covers without inspection" and a brief note in `docs/tools/write_note.md` (in T007). No code changes.

  **Constitution**: Principle I (clause lives in the `cli-adapter` primitive, NOT in `write_note` — benefits all typed tools); Principle IV (failure surfaces through structured `UpstreamError` with verbatim CLI wording in `details.message`); Principle V (header updated to credit the BI). Edge Cases (unknown vault display name) / R5.

**Checkpoint**: Foundational deliverables complete — handler response-parsing logic and the cli-adapter's unknown-vault classification are both grounded in verified live-CLI wording. SC-012 is verified or amended-pre-ship. Phase 3 implementation can now lock against the captured wording.

---

## Phase 3: User Story 1 — Specific-mode create + the typed-tool surface (Priority: P1) 🎯 MVP

**Goal**: Ship the `write_note` module — schema, handler, registration — that delivers the core typed-tool surface. Implementation simultaneously satisfies Stories 1, 2, 3, 4, 5, 6, 7, 9 acceptance criteria because they all exercise the same three source files. (Story 8 — documentation + registration descriptor — is its own phase to keep doc-authoring and code-authoring loosely coupled.)

**Independent Test**: per [spec.md Story 1 IT](spec.md) — with a stub `spawnFn` injected via `deps`, `executeWriteNote({ target_mode: "specific", vault: "MyVault", path: "Inbox/Idea.md", content: "# Idea\n\nBody\n" }, deps)` against a stub child that exits `0` with the verified-from-T0.1 stdout returns `{ created: true, path: "Inbox/Idea.md" }` AND the stub spawn was invoked with argv `["create", "vault=MyVault", "path=Inbox/Idea.md", "content=# Idea\n\nBody\n"]` (vault hoisted first per the adapter's argv-assembly contract). Verifiable via `npx vitest run src/tools/write_note/handler.test.ts`.

### Implementation for User Story 1

- [X] T003 [US1] Create [src/tools/write_note/schema.ts](../../src/tools/write_note/schema.ts) and [src/tools/write_note/schema.test.ts](../../src/tools/write_note/schema.test.ts). Per [data-model.md §1](data-model.md), [contracts/write-note-input.contract.md](contracts/write-note-input.contract.md), and [research.md R6](research.md). Depends on: nothing in this list (truly first source-code task).

  - **(3a) Author [src/tools/write_note/schema.ts](../../src/tools/write_note/schema.ts)** with the `// Original — no upstream. write_note input/output schemas — flat target-mode primitive extension + active-mode superRefine clauses (Clarifications 2026-05-08).` header (Principle V). Define:
    - `writeNoteInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ content: z.string(), template: z.string().optional(), overwrite: z.boolean().optional().default(false), open: z.boolean().optional() })).superRefine(<active-mode rules>)` — exactly per [data-model.md §1 / R6](data-model.md). The three active-mode clauses (overwrite-required, template-forbidden, open-forbidden) bundled into a single chained `.superRefine` callback.
    - `writeNoteOutputSchema = z.object({ created: z.boolean(), path: z.string() }).strict()` — per FR-005.
    - `WriteNoteInput = z.infer<typeof writeNoteInputSchema>` and `WriteNoteOutput = z.infer<typeof writeNoteOutputSchema>` — type aliases ONLY (Principle III; no hand-rolled interfaces).
    - **No `.describe()` calls** (per FR-004, SC-005).
  - **(3b) Author [src/tools/write_note/schema.test.ts](../../src/tools/write_note/schema.test.ts)** with the `// Original — no upstream. Tests for the write_note input schema — happy paths, all 10 Story 6 validation classes, and Clarifications 2026-05-08 active-mode clauses.` header. **15 test cases** per [spec.md FR-016](spec.md#fr-016) Schema tests:
    - **(a) Story 1 happy-path** — specific mode with `path=`: `safeParse({ target_mode: "specific", vault: "MyVault", path: "Inbox/Idea.md", content: "x" }).success === true` AND `parsed.overwrite === false` (default applied) AND `parsed.open === undefined` (no default per R6).
    - **(b) Story 2 happy-path** — specific mode with `file=`: `safeParse({ target_mode: "specific", vault: "MyVault", file: "Recipe", content: "x" }).success === true`.
    - **(c) Story 5 happy-path** — active mode WITH `overwrite: true` (note: Clarifications 2026-05-08 Q1 requirement): `safeParse({ target_mode: "active", content: "x", overwrite: true }).success === true`.
    - **(d) Story 6 AC#1** — neither file nor path: `safeParse({ target_mode: "specific", vault: "V", content: "x" }).success === false` AND issues include one with `message` matching `/exactly one of/`.
    - **(e) Story 6 AC#2** — both locators: `safeParse({ target_mode: "specific", vault: "V", file: "F", path: "F.md", content: "x" }).success === false` AND issues include `path: ["file"]` AND `path: ["path"]`.
    - **(f) Story 6 AC#3** — vault missing in specific: `safeParse({ target_mode: "specific", file: "F", content: "x" }).success === false` AND issues include `path: ["vault"]`.
    - **(g) Story 6 AC#4** — forbidden vault/file/path in active mode (parameterised over the three keys): `safeParse({ target_mode: "active", vault: "V", content: "x", overwrite: true })`, `... file: "F"...`, `... path: "P"...` — all `.success === false` AND issues include `path: [<key>]` and message matching `/active mode/`.
    - **(h) Story 6 AC#5** — content missing: `safeParse({ target_mode: "specific", vault: "V", path: "P.md" }).success === false` AND issues include `path: ["content"]`.
    - **(i) Story 6 AC#6** — unknown top-level key: `safeParse({ target_mode: "specific", vault: "V", path: "P.md", content: "x", pancakes: "yes" }).success === false` AND issues include `code: "unrecognized_keys"` with `keys: ["pancakes"]`.
    - **(j) Story 6 AC#7** — invalid discriminator: `safeParse({ target_mode: "unknown", vault: "V", path: "P.md", content: "x" }).success === false` AND issues identify `target_mode`.
    - **(k) Story 6 AC#8 — Clarifications 2026-05-08 Q1**: active mode without overwrite, AND active mode with explicit `overwrite: false`. Both `.success === false` AND issues include `path: ["overwrite"]` with message matching `/active mode/`.
    - **(l) Story 6 AC#9 — Clarifications 2026-05-08 Q3**: active mode with `template`: `safeParse({ target_mode: "active", content: "x", overwrite: true, template: "Daily" }).success === false` AND issues include `path: ["template"]`.
    - **(m) Story 6 AC#10 — Clarifications 2026-05-08 Q3**: active mode with `open` (parameterised over `true` AND `false` — both rejected per R6's distinguish-absent-from-present): `safeParse({ ..., overwrite: true, open: true })` AND `... open: false` — both `.success === false` AND issues include `path: ["open"]`.
    - **(n) Defaults coercion in specific mode**: `safeParse({ target_mode: "specific", vault: "V", path: "P.md", content: "x", overwrite: undefined }).success === true` AND `parsed.overwrite === false`. Symmetric assertion for omitted-`overwrite`.
    - **(o) Story 9 AC#1 — empty content**: `safeParse({ target_mode: "specific", vault: "V", path: "Empty.md", content: "" }).success === true`.

  **Constitution**: Principle II (15 cases co-located); Principle III (single source of truth — schema is the only typed surface for input shape). FR-001 / FR-002 / FR-003 / FR-004 / FR-005 / FR-016 / SC-004 / SC-005.

- [X] T004 [US1] Create [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) and [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts). Per [data-model.md §3-§5](data-model.md), [contracts/write-note-handler.contract.md](contracts/write-note-handler.contract.md), and [research.md R1, R2, R3, R4](research.md). Depends on: T001 (response-parsing wording locked), T003 (`WriteNoteInput` / `WriteNoteOutput` types).

  - **(4a) Author [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts)** with the `// Original — no upstream. write_note handler: thin transformer routing parsed input through invokeCli — argv assembly (file→name rename per R3), flag-form overwrite/open per R2, response parsing per R4.` header (Principle V). Implement per [contracts/write-note-handler.contract.md §invariants](contracts/write-note-handler.contract.md):
    - `executeWriteNote(input: WriteNoteInput, deps: ExecuteDeps): Promise<WriteNoteOutput>`.
    - `ExecuteDeps = { logger: Logger, queue: Queue, spawnFn?: SpawnLike, env?: NodeJS.ProcessEnv }` — mirrors `executeReadNote` exactly.
    - **NO per-call logger events** (per [research.md R1](research.md) — handler is a thin `invokeCli` wrapper; observability via the cli-adapter's existing `dispatch*` events).
    - Specific-mode argv assembly: `parameters.name = input.file` (R3 rename), `parameters.path = input.path`, `parameters.content = input.content`, optionally `parameters.template = input.template`, `flags = []` then conditional `flags.push("overwrite")` if `input.overwrite === true` (R2 flag form), `flags.push("open")` if `(input.open ?? false) === true`.
    - Active-mode argv assembly: `parameters = { content: input.content }`, `flags = ["overwrite"]` (unconditional — schema guarantees `parsed.overwrite === true`), `vault = undefined`. The schema guarantees `parsed.template === undefined` and `parsed.open === undefined` so neither token is ever emitted.
    - Call `invokeCli({ command: "create", vault, parameters, flags, target_mode: input.target_mode }, { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })`. The `vault!` non-null assertion in specific mode is justified by the primitive's `superRefine` invariant (precedent: [src/tools/read_note/handler.ts:30](../../src/tools/read_note/handler.ts#L30)).
    - `parseCreateResponse(stdout)` helper that locks against the T0.1/T0.3-captured wording (provisional `Created: <path>` / `Updated: <path>`); returns `{ created: <bool>, path: <string> }`. On unparseable stdout, throws `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "write_note could not parse CLI response: ...", details: { stdout } })`.
    - **Module size budget per SC-007**: ≤ 70 LOC total file LOC (verified by `wc -l`). If exceeded, factor `parseCreateResponse` into a sibling module.
  - **(4b) Author [src/tools/write_note/handler.test.ts](../../src/tools/write_note/handler.test.ts)** with the `// Original — no upstream. Tests for the write_note handler — argv assembly, response parsing, UpstreamError propagation.` header. **12 test cases** per [spec.md FR-016](spec.md#fr-016) Handler tests:
    - **(a) Story 1 IT** — specific path mode happy path: stub `spawnFn` exits `0` with T0.1-captured stdout; assert returned `{ created: true, path: "Inbox/Idea.md" }` AND argv equals `["vault=MyVault", "create", "path=Inbox/Idea.md", "content=# Idea\n\nBody\n"]` (per the cli-adapter's argv hoisting — vault first, command second, key=value third, flags fourth).
    - **(b) Story 2 IT** — specific file mode happy path: stub returns T0.2-captured stdout; assert `{ created: true, path: "<canonical resolved path from T0.2>" }` AND argv contains `name=Recipe` (NOT `file=Recipe` per R3 rename).
    - **(c) Story 4 AC#1** — overwrite=true returns `created: false` and emits `overwrite` flag in argv: stub returns T0.3-captured overwrite-success wording; assert `{ created: false, path: "Existing.md" }` AND argv ends with `["overwrite"]`.
    - **(d) Story 3 AC#3** — overwrite-default-false does NOT emit `overwrite` flag: stub spawn that records argv; assert argv does NOT contain `"overwrite"` token. Stub returns T0.5-captured CLI overwrite-refused response; assert handler propagates as `UpstreamError({ code: "CLI_REPORTED_ERROR" })` with verbatim message from T0.5.
    - **(e) Story 5 IT** — active mode happy path: stub returns T0.8-captured focused-note wording; assert `{ created: false, path: "<focused path>" }` AND argv equals `["create", "content=rewritten\n", "overwrite"]` (NO locator tokens, NO template/open tokens — vault hoisted to undefined and dropped by `dispatchCli`).
    - **(f) Story 7 AC#1** — `CLI_BINARY_NOT_FOUND`: stub `spawnFn` raises `ENOENT`; assert handler propagates `UpstreamError({ code: "CLI_BINARY_NOT_FOUND" })`.
    - **(g) Story 7 AC#2** — `CLI_NON_ZERO_EXIT`: stub exits `1` with stderr `"permission denied"`; assert handler propagates `UpstreamError({ code: "CLI_NON_ZERO_EXIT", details: { exitCode: 1, stderr: "permission denied\n" } })`.
    - **(h) Story 7 AC#3** — `CLI_REPORTED_ERROR`: stub exits `0` with stdout `"Error: file already exists at Inbox/Existing.md\n"`; assert handler propagates `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { message: "Error: file already exists at Inbox/Existing.md" } })` — verbatim CLI wording preserved (NOT synthesised).
    - **(i) Story 5 AC#3** — `ERR_NO_ACTIVE_FILE`: stub returns the active-mode no-active-file response (matches `read_note`'s existing test fixture); assert handler propagates `UpstreamError({ code: "ERR_NO_ACTIVE_FILE" })` with the recovery-hint message verbatim.
    - **(j) Story 7 AC#4** — non-`UpstreamError` re-throw: stub `spawnFn` throws a plain `Error("unexpected runtime error")`; assert `executeWriteNote(...)` REJECTS WITH the original `Error` (NOT wrapped as `UpstreamError`). Verifies the bug-bypass path matches the `obsidian_exec` / `read_note` precedent.
    - **(k) Story 9 AC#1 boundary** — empty content: stub returns T0-derived success for `Empty.md` with `content: ""`; assert `{ created: true, path: "Empty.md" }` AND argv contains `content=` (empty value).
    - **(l) Story 9 AC#2 boundary** — template + content: stub returns success; assert argv contains both `content=body\n` AND `template=Daily` tokens (no precedence assertion — CLI behaviour deferred to docs per FR-014).

  **Constitution**: Principle I (handler is a thin transformer; no `child_process.spawn` direct invocation per SC-003); Principle II (12 cases co-located); Principle IV (every `UpstreamError` propagated verbatim; non-`UpstreamError` re-thrown). FR-001 / FR-007 / FR-008 / FR-010 / FR-016 / SC-003 / SC-007.

- [X] T005 [US1] Create [src/tools/write_note/index.ts](../../src/tools/write_note/index.ts) and [src/tools/write_note/index.test.ts](../../src/tools/write_note/index.test.ts). Per [contracts/write-note-handler.contract.md](contracts/write-note-handler.contract.md), [contracts/write-note-input.contract.md](contracts/write-note-input.contract.md), and the existing [src/tools/read_note/index.ts](../../src/tools/read_note/index.ts) precedent. Depends on: T003, T004.

  - **(5a) Author [src/tools/write_note/index.ts](../../src/tools/write_note/index.ts)** with the `// Original — no upstream. write_note tool registration via registerTool — responseFormat: "json" wraps the { created, path } envelope for the MCP wire.` header (Principle V). Mirror `read_note/index.ts` structure exactly:
    - Import `registerTool` from `../_register.js`, `executeWriteNote, type ExecuteDeps` from `./handler.js`, `writeNoteInputSchema` from `./schema.js`.
    - Export `WRITE_NOTE_TOOL_NAME = "write_note"`.
    - Export `WRITE_NOTE_DESCRIPTION` per FR-012: `'Create a new note in an Obsidian vault, or overwrite an existing one when overwrite=true. Defaults: overwrite=false, open=false. Active mode requires overwrite=true (rewrites the focused note). Call help({ tool_name: "write_note" }) for full parameter docs.'` — verb-led, mentions `help` AND the tool's own name AND the safety defaults AND the active-mode requirement (Clarifications 2026-05-08 Q1).
    - Export `RegisterDeps = ExecuteDeps`.
    - Export `createWriteNoteTool(deps: RegisterDeps): RegisteredTool` — calls `registerTool({ name, description, schema, deps, handler })` and returns the result. The handler delegates to `executeWriteNote(input, d)` and returns the result directly (the `registerTool` factory's `responseFormat: "json"` default JSON-serialises into the MCP envelope).
  - **(5b) Author [src/tools/write_note/index.test.ts](../../src/tools/write_note/index.test.ts)** with the `// Original — no upstream. Tests for the write_note tool registration — descriptor shape, stripped schema, help mention, docs presence.` header. **5 test cases** per [spec.md FR-016](spec.md#fr-016) Tool-registration tests:
    - **(a) Story 8 AC#1 base** — descriptor name: `createWriteNoteTool({ logger, queue }).descriptor.name === "write_note"`.
    - **(b) Story 8 AC#1 + AC#2** — emitted `inputSchema` has `type: "object"`, `additionalProperties: false`, `properties` has all 8 keys (`target_mode`, `vault`, `file`, `path`, `content`, `template`, `overwrite`, `open`), `required` includes `target_mode` AND `content`, AND zero `description` keys at any depth (walk via recursion). Per [contracts/write-note-input.contract.md emitted-schema](contracts/write-note-input.contract.md).
    - **(c) Story 8 AC#3** — descriptor `description` is non-empty AND contains literal substring `"help"` (case-insensitive) AND contains literal substring `"write_note"`.
    - **(d) End-to-end propagation** — call `createWriteNoteTool(deps).handler({ target_mode: "specific" })` (missing required content); assert returned `ToolCallResult` is an `isError: true` envelope whose JSON-serialised payload has `code: "VALIDATION_ERROR"`. Verifies the `registerTool` factory's `ZodError → asToolError` wrap fires for `write_note` end-to-end (NOT just at the schema layer).
    - **(e) Story 8 AC#4 / FR-014 / FR-016 case (e)** — docs presence + non-stub: resolve [docs/tools/write_note.md](../../docs/tools/write_note.md) via `import.meta.url` per [research.md R8](research.md); assert file exists, does NOT contain the substring `<!-- TODO`, contains all 5 propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`), AND contains all 4 required example shapes (regex search for `target_mode.*specific.*path` AND `target_mode.*specific.*file` AND `target_mode.*specific.*overwrite` AND `target_mode.*active`). The doc itself is authored by T007.

  **Constitution**: Principle I (per-surface module entry point); Principle II (5 registration tests co-located); Principle III (the `inputSchema` is derived from the schema via `registerTool`'s `toMcpInputSchema` + `stripSchemaDescriptions` — no manual descriptor construction). FR-001 / FR-011 / FR-012 / FR-016 / SC-002 / SC-007.

- [X] T006 [US1] Wire `write_note` into the MCP server. Edit [src/server.ts](../../src/server.ts):

  - **(6a)** Add the import at the top of the imports block (alphabetical alongside `createReadNoteTool`): `import { createWriteNoteTool } from "./tools/write_note/index.js";`
  - **(6b)** Add `createWriteNoteTool({ logger, queue })` to the tools array at [src/server.ts:65](../../src/server.ts#L65) — append after `createReadNoteTool({ logger, queue })` (alphabetical / introduction-order — both acceptable per FR-013; alphabetical is cleaner).
  - **(6c)** Verify the registry-consistency test at [src/server.test.ts](../../src/server.test.ts) passes — the `assertToolDocsExist` aggregator now includes `write_note` and asserts [docs/tools/write_note.md](../../docs/tools/write_note.md) exists. (T007 authors that file; if T007 has not landed yet, this test FAILS until T007 lands. Acceptable transient failure within this BI's WIP — both T006 and T007 land in the same merge.)
  - **(6d)** Verify the post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `write_note` via its `it.each` registry walk (per [data-model.md §6](data-model.md#per-tool-invariants-drift-detector-contributions) AND [research.md R7](research.md)). NO test-file modifications. Run `npx vitest run src/tools/_register.test.ts` — assert all `it.each` rows for `write_note` pass.

  Depends on: T005.

  **Constitution**: Principle I (one-line addition; no structural change to server.ts); Principle II (existing drift detector + registry-consistency test cover the new entry without test additions). FR-013 / SC-002 / SC-009 / SC-010.

**Checkpoint**: Phase 3 complete. `write_note` is registered alongside `obsidian_exec`, `help`, `read_note`. `tools/list` returns the post-010 flat descriptor for `write_note`. The 32 co-located tests + the auto-covered drift detector + the registry-consistency test all pass. Stories 1, 2, 3, 4, 5, 6, 7, 9 acceptance criteria satisfied at the implementation layer (Story 8 docs gate is T007).

---

## Phase 4: User Story 8 — Documentation + Cross-References (Priority: P2)

**Goal**: Replace the (potentially absent) docs/tools/write_note.md stub with a non-stub Markdown body. Update sibling docs (index, obsidian_exec) to acknowledge the new tool. Story 8's tests in T005 case (e) ASSERT the doc's existence + content; Phase 4 makes them pass.

**Independent Test**: per [spec.md Story 8 IT](spec.md) — `help({ tool_name: "write_note" })` returns the populated body (no TODO stub, all 5 error codes named, ≥4 example shapes). Verifiable by file inspection (T007 + T008 + T009 outputs) and by the index.test.ts case (e) added in T005.

- [X] T007 [P] [US8] Author [docs/tools/write_note.md](../../docs/tools/write_note.md) (NEW file — the `assertToolDocsExist` aggregator does NOT pre-populate stubs; T006's registry-consistency test will fail until this lands). Per FR-014 + Story 8 AC#4. Different file from src/, fully parallelisable with T003-T006.

  **Document content** (sections required):
  - **Header**: title (`# Write Note (write_note)`), one-paragraph summary mentioning typed surface + safety defaults.
  - **Input schema**: per-mode field policy table (matches [contracts/write-note-input.contract.md per-mode-field-policy](contracts/write-note-input.contract.md)). Document the active-mode requirements (overwrite-required) and forbiddances (template, open) explicitly with Clarifications 2026-05-08 source references.
  - **Output shape**: `{ created: boolean, path: string }` — describe `created: true` (fresh creation) vs `created: false` (overwrite OR active-mode rewrite); `path` is the CLI-canonical vault-relative path which may differ from the input wikilink.
  - **Error roster**: all 5 propagated codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) with one-or-two sentences each describing when each surfaces. NO new codes.
  - **Worked examples (≥4 per Story 8 AC#4 / FR-014)**:
    - (i) Specific-mode `path=` create of a brand-new note.
    - (ii) Specific-mode `file=` (wikilink) create.
    - (iii) Specific-mode overwrite of an existing note (`overwrite: true`).
    - (iv) `target_mode: "active"` rewrite of the focused note (with `overwrite: true` per Clarifications 2026-05-08 Q1).
    - (v) [optional but recommended] `template: "..."` example.
  - **Adversarial-edge-case behaviours captured during T0**:
    - OS argv-length ceiling (≈32 KiB Windows, ≈2 MiB Linux) — note that oversized `content` values fail at spawn time.
    - Verbatim CRLF / BOM / Unicode-normalisation pass-through invariant (mirrors `read_note`).
    - Path-traversal rejection contract (cite the T0.7-verified CLI rejection wording; if T0.7 surfaced a tool-layer reject, mention it).
    - Unknown-vault response signature (cite the T0.4-verified wording).
    - Non-existent template wording (cite T0.6).
    - The active-mode constraint (overwrite required, template/open forbidden) and rationale.
  - **Cross-references**: links to the [target-mode primitive](../../specs/004-target-mode-schema/spec.md), the [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md), the [cli-adapter](../../specs/003-cli-adapter/spec.md), the [help tool](../../specs/005-help-tool/spec.md), and [read_note](../../specs/006-read-note/spec.md) as the sibling tool.

  **Header convention**: NO `// Original — no upstream.` header (Markdown documentation is exempt per [005-help-tool FR-019](../005-help-tool/spec.md)). NO `<!-- TODO -->` markers.

  **Constitution**: Principle V (Markdown exempt from source-header convention per existing precedent); ADR-005 (progressive-disclosure documentation lives in docs/, not in schema). FR-014 / SC-006.

- [X] T008 [P] [US8] Update [docs/tools/index.md](../../docs/tools/index.md) — add a one-line summary for `write_note` per FR-015. Match the established style for existing entries (typically `- [<tool_name>](<tool_name>.md): <one-sentence summary>`). Different file from T007; can run in parallel.

  **Constitution**: Principle V (Markdown exempt). FR-015.

- [X] T009 [P] [US8] Update [docs/tools/obsidian_exec.md](../../docs/tools/obsidian_exec.md) — add a paragraph noting `write_note` as the typed surface for create/overwrite operations and clarifying when `obsidian_exec` is the right fallback (the `newtab` flag, future unwrapped subcommands). Per SC-013. Different file from T007 / T008; can run in parallel.

  **Constitution**: Principle V (Markdown exempt). SC-013.

**Checkpoint**: Phase 4 complete. `help({ tool_name: "write_note" })` returns the populated body. T005 case (e) passes (was failing prior — required T007 to land). `obsidian_exec.md` updated to point agents at the typed surface. The full `write_note` BI surface is now shippable.

---

## Phase 5: Polish & Release

**Purpose**: Release artifacts (CHANGELOG, package.json), end-to-end verification (quickstart S-1..S-13), and PR Constitution Compliance.

- [X] T010 [P] Update [package.json](../../package.json) `description` field to mention `write_note` alongside `read_note`. Current text: `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), and read_note (typed read tool)."`. Update to: `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), and write_note (typed create/overwrite tool)."`. No other package.json changes (engines.node, dependencies, etc., all unchanged).

  **Constitution**: N/A (release-metadata only). Per project release convention.

- [X] T011 Add a [CHANGELOG.md](../../CHANGELOG.md) release entry for `0.2.4` per the project's release convention. Bump `package.json:version` from `0.2.3` to `0.2.4` (PATCH bump per plan — purely additive surface; no breaking changes; the post-010 strict-mode posture extension to `write_note`'s active-mode constraints is documented as a new tool-surface addition, not a behaviour change to existing tools). The CHANGELOG entry should:
  - **Add**: `write_note` typed MCP tool wrapping the Obsidian CLI's `create` subcommand. Per-mode validation, `overwrite` / `open` flags, structured error propagation. Replaces `obsidian_exec` for create/overwrite operations.
  - **Note**: active-mode constraint (overwrite=true required; template/open forbidden) per Clarifications 2026-05-08.
  - **Note**: `obsidian_exec` remains the freeform escape hatch for the `newtab` flag and unwrapped subcommands.
  - **Reference**: link to `specs/011-write-note/spec.md` for the full BI specification.

  Depends on: T007 (the docs that callers will use are in place before the release names them).

  **Constitution**: N/A (release-metadata). Per project release convention.

- [X] T012 Run [quickstart.md](quickstart.md) S-1..S-10 verification (CI-runnable scenarios). Specifically:
  - **S-1**: `npm run test` — assert 0 failures across the new test files; 33 acceptance scenarios pass.
  - **S-2 / S-7**: drift detector + registry-consistency test pass for `write_note`.
  - **S-3**: `wc -l src/tools/write_note/handler.ts` ≤ 70; `grep -nE "child_process\.spawn|spawn\(|Error:" src/tools/write_note/handler.ts` returns no matches.
  - **S-4**: `grep -nE "^(interface|type)\s+WriteNote.*=.*\{" src/tools/write_note/schema.ts` returns no matches (type ALIASES via `z.infer` are permitted).
  - **S-5**: `grep -nE "\.describe\(" src/tools/write_note/schema.ts` returns no matches.
  - **S-6**: docs/tools/write_note.md greps pass (no `<!-- TODO`, ≥5 error codes, ≥4 example shapes).
  - **S-8**: aggregate statements coverage ≥ 89.6% (per [vitest.config.ts:20](../../vitest.config.ts#L20)).
  - **S-9**: `git diff main..HEAD -- src/tools/obsidian_exec/ src/tools/read_note/` shows zero substantive changes (only acceptable diff is the `src/server.ts` registration-list reorder — NOT a content change in either tool).
  - **S-10**: T0.7's path-traversal verification result (already captured in T001).

  Depends on: T001-T011.

  **Constitution**: Principle II (full test suite passes); Principle III (zod single-source-of-truth verified); Principle IV (no new error codes, all failures structured). FR-017 (coverage gate) / SC-001 / SC-003 / SC-004 / SC-005 / SC-006 / SC-008 / SC-009 / SC-010 / SC-012.

- [ ] T013 Manual S-11 (Claude Desktop / MCP Inspector end-to-end — strict-rich client) + S-12 (Cowork end-to-end — strict-naive client) from [quickstart.md](quickstart.md). Capture results in PR description. Both client classes are expected to accept `write_note`'s post-010 `additionalProperties: false` shape; the strict-rich client observes the unknown-key rejection (Story 6 AC#6); the strict-naive client strips unknown keys client-side per the published schema (also CORRECT per the dual-pathway documented in spec Edge Cases). Manual one-time pre-merge step.

  Depends on: T010 (built `dist/` ready for client loading) and T011 (the version/CHANGELOG that the PR description will reference).

  **Constitution**: Principle IV (real-CLI failure paths verified through real clients, not just stubs). SC-002 + SC-006 client-class verification.

- [ ] T014 Fill the PR description's Constitution Compliance checklist (5/5 PASS expected per [plan.md Constitution Check](plan.md#constitution-check)). Also note in the PR description: (a) the FR-019 T0 capture results (which cases were verified during T001 with their wording), (b) any R4 amendment that landed (if T0.3 surfaced an indistinguishable create/overwrite signal), (c) the SC-012 verification result (path-traversal rejected by CLI, OR tool-layer reject added). Include links to the spec / plan / research artifacts. Per Constitution v1.2.0 §Development Workflow #8.

  Depends on: T001-T013.

  **Constitution**: §Development Workflow #8 (PR-level checklist). Principle I, II, III, IV, V verification.

**Checkpoint**: BI ready to merge. All 13 quickstart scenarios pass; PR description complete; coverage gate green; manual end-to-end verifications captured. The PR can be opened for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: skipped — toolchain ready
- **Foundational (Phase 2)**: T001 first, T002 conditional after T001 (T002 may collapse to a no-op based on T0.4 verification). BLOCKS Phase 3 because the handler's response-parsing logic (T004) locks against T0-captured wording.
- **User Story 1 (Phase 3)**: T003 → T004 → T005 → T006 (sequential per file dependencies). T004 depends on T001 for the captured response wording. T006 depends on T007 for docs (registry-consistency test fails until T007 lands — but both T006 and T007 land in the same merge; transient WIP failure acceptable).
- **User Story 8 (Phase 4)**: T007, T008, T009 are file-disjoint; all three can run in parallel ([P]).
- **Polish (Phase 5)**: T010 in parallel with T011, then T012 (depends on all prior), then T013 (depends on T010/T011), then T014 (depends on all).

### User Story Dependencies

- **User Story 1**: depends on Foundational (T001 for response-wording lock); deliverable spans T003 + T004 + T005 + T006. **Note**: this BI's "User Story 1 ship" effectively ALSO delivers Stories 2, 3, 4, 5, 6, 7, 9 because they exercise the same source files. The story-tag discipline maps acceptance criteria to test cases (per FR-016), not to separable implementation slices.
- **User Story 8**: depends on T005's index.test.ts case (e) + T007's docs authoring; deliverable is T007 + T008 + T009. Independent of Stories 1-7+9 in spirit (docs vs. code), but the index.test.ts case (e) couples them in test order.

### Within Each User Story

- Within US1: schema (T003) before handler (T004) before registration (T005) before server-wire (T006). Test cases land WITH their source file (no separate red-green TDD loop per project convention).
- Within US8: T007/T008/T009 are file-disjoint — fully parallelisable.

### Parallel Opportunities

- **T002** can run in parallel with T003-T006 once T001 is complete (T002 touches `cli-adapter`, T003-T005 touch `write_note/`, T006 touches `server.ts` — all file-disjoint).
- **T007 + T008 + T009** all run in parallel with each other.
- **T007** can run in parallel with T003-T006 (file-disjoint).
- **T010** can run in parallel with T011.

### Blocking-task Summary

| Blocker | Blocks | Reason |
|---|---|---|
| T001 | T002 (conditional decision), T004 (response-wording lock), T012 case S-10 | Live-CLI characterisation gates handler logic + SC-012 |
| T003 | T004 (`WriteNoteInput` import), T005 (`writeNoteInputSchema` import) | Type/schema dependency |
| T004 | T005 (`executeWriteNote` import) | Function dependency |
| T005 | T006 (`createWriteNoteTool` import) | Factory dependency |
| T007 | T006 PASSING (registry-consistency test) | Doc must exist for assertToolDocsExist |
| T010 + T011 | T012 (CI verification needs version + CHANGELOG in place) | Release-metadata coupling |
| T012 | T013 (manual verification needs CI green first) | Confidence ordering |
| T013 + T014 | merge | PR completeness |

---

## Parallel Example: User Story 1 + Story 8 in parallel after Foundational

```text
# After T001 + T002 land:

# Track A — write_note source modules (sequential per file dep):
T003 (schema.ts + schema.test.ts)
  └─> T004 (handler.ts + handler.test.ts)
        └─> T005 (index.ts + index.test.ts)
              └─> T006 (server.ts wire-up)

# Track B — docs (parallelisable with track A):
T007 (docs/tools/write_note.md)        [P with T003-T006]
T008 (docs/tools/index.md update)       [P with T003-T006 AND with T007]
T009 (docs/tools/obsidian_exec.md update) [P with T003-T006 AND with T007/T008]
```

A solo implementer typically lands T003-T009 sequentially in commit order: T003 → T004 → T005 → T007 → T006 → T008 → T009 (with T007 BEFORE T006 so the registry-consistency test passes immediately). A two-implementer team can split tracks A and B.

---

## Implementation Strategy

### MVP First (User Story 1 — Stories 1, 2, 3, 4, 5, 6, 7, 9)

1. T001 (foundational live-CLI characterisation; user authorises scratch subdir).
2. T002 (conditional R5 cli-adapter clause).
3. T003 → T004 → T005 → T007 (out-of-order to satisfy T006's docs-presence test) → T006.
4. **STOP and VALIDATE**: run `npm run test`; assert 32 new tests pass; assert drift detector + registry-consistency tests pass.
5. The MVP is now `write_note` registered + schema + handler + index + docs. Stories 1-7 + 9 acceptance criteria all satisfied.

### Incremental Delivery

The 011-write-note BI is fundamentally a single atomic ship — there is no "ship a partial write_note" intermediate state because the schema/handler/index are tightly coupled. The "incremental" framing applies to the FOLLOW-UP BIs that compose on `write_note` (BI candidates: `append_note`, `write_property`, `patch_heading`, `batch_write_notes`).

### Quality Gates (in order)

1. T012 — `npm run test` green; coverage ≥ 89.6%; greps pass.
2. T013 — manual S-11 against Claude Desktop / MCP Inspector; manual S-12 against Cowork.
3. T014 — Constitution Compliance checklist filled.
4. PR opened, reviewed, merged.
5. T011's `0.2.4` version bump triggers an `npm publish` per the project release convention.

---

## Notes

- **[P] tasks** = different files, no dependencies on incomplete tasks in this list. Conservative reading; when in doubt, sequence them.
- **[Story] label** = the primary story this task delivers. The full story-to-test mapping lives in [spec.md FR-016](spec.md#fr-016) so test cases can be read either by source-file (the implementation's organisation) or by user story (the spec's organisation).
- **No separate red-green TDD loop** — every task lands with its co-located tests in the same change; the verify-fails-first sanity check is captured manually once via T013 (deliberate revert on a scratch branch).
- **Commit cadence**: one task per commit. Subject per the project's `feat(011-write-note): <task description>` convention; body cites task ID + sub-task IDs (e.g., `T003 (3a, 3b)`) + FR/SC/R references.
- **CLAUDE.md follow-up**: after this BI merges, the SPECKIT context block in [CLAUDE.md](../../CLAUDE.md) flips to point at the next active feature. Not part of this BI's task list — handled by the next feature's `/speckit-plan`.
- **Avoid**: vague tasks (every task here cites file + sub-tasks); cross-file conflicts (every task names its target files); skipping the SC-012 gate (T001 case T0.7 is non-negotiable per spec.md).
