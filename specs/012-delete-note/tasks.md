---
description: "Task list for 012-delete-note — Add Delete Note Typed MCP Tool"
---

# Tasks: Add Delete Note Typed MCP Tool

**Input**: Design documents from [`/specs/012-delete-note/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test cases in the same task. The verify-fails-first sanity check is captured exactly once, manually, by T013 (the SC-009 deliberate-revert check on the implementer's machine — equivalent to 011's T013).

**Organization**: Tasks are grouped by user story per the project convention. The `delete_note` module is fundamentally a single atomic ship — Stories 1–6 + 8 share the same three source files (`schema.ts`, `handler.ts`, `index.ts`); Story 7 is the registration descriptor + documentation layer. The `[US1]` tag marks the primary-story attribution for each implementation task; the test inventory in [spec.md FR-016](spec.md) maps each test case to its source User Story (so you can read tests stories-first AND implementation files-first). Phase 2 Foundational is the live-CLI characterisation (T001) that gates SC-012 + SC-013 + SC-011 and the cli-adapter R5 inheritance verification (T002).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task primarily delivers (US1 / US7 — the `delete_note` BI's two practical primary-stories per the file-vs-story mapping in plan.md). Setup / Foundational / Polish phases have no story label.
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention (matches sibling `read_note` / `write_note`). All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II. The new feature module is at [src/tools/delete_note/](../../src/tools/delete_note/) (does NOT exist yet — created by T003–T005).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–011). This feature introduces NO new runtime dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Live-CLI characterisation that locks the handler's response-parsing logic against verified wording, and verification that the existing 011-R5 cli-adapter unknown-vault response-inspection clause works for the `delete` subcommand without modification.

**⚠️ CRITICAL — SC-012 GATE**: T001 case (vii) verifies the live CLI rejects path-traversal-shaped paths (`../../etc/passwd.md`) for the `delete` subcommand. If the CLI does NOT reject — and the on-disk filesystem outside the vault root is touched — silent vault-escape on a destructive operation is a critical security defect. This BI is amended pre-ship to add a tool-layer reject (one schema test case + one schema-`superRefine` clause); the merge gate does not clear without verification. Per [research.md FR-019](research.md#findings-deferred-to-t0-destructive-cases-require-user-authorised-scratch-vault-subdirectory) + [spec.md SC-012](spec.md).

**⚠️ CRITICAL — SC-013 GATE**: T001 case (viii) probes Windows trash-volume-full behaviour (or, if not feasible to simulate, captures the documented platform behaviour and the typed surface's response). If the CLI silently falls back from to-trash to permanent without `permanent: true` — i.e., the `toTrash: true` audit signal would lie about an irreversible deletion — this BI is amended pre-ship to detect the fall-back and surface it as a structured error. Per [research.md FR-019](research.md) + [spec.md SC-013](spec.md).

- [X] T001 Live-CLI characterisation (T0 protocol per [research.md](research.md#findings-deferred-to-t0-destructive-cases-require-user-authorised-scratch-vault-subdirectory)). Run live probes against a USER-AUTHORISED scratch subdirectory in the active vault (e.g., `_speckit-012-delete-note-research/`); capture stdout / stderr / exit code; append results to [research.md](research.md) under a new `## T0 Live-CLI Capture (yyyy-mm-dd)` section. Update R4 / handler logic / schema clauses if any T0 result differs from the provisional decisions. Cleanup the scratch subdir via `obsidian delete path=_speckit-012-delete-note-research/...` (using the to-trash default, recoverable) after capture. Cases:

  > **Sub-task numbering note**: the T0.X numbers below mirror the FR-019 case letters (i)–(ix). **T0.5 and T0.9 are intentionally absent** — case (v) (unknown vault) and case (ix) (subcommand discovery + argv shape) were already verified during plan stage (see [research.md Live CLI Findings](research.md#live-cli-findings)) and require no T0 work. T0.1, T0.2, T0.3, T0.4, T0.6, T0.7, T0.8 cover the seven destructive cases that need a scratch subdirectory.

    - **(T0.1) Specific-mode to-trash delete at existing path**: Pre-step — use `write_note` (already shipped) to create `_speckit-012-delete-note-research/case1.md` with content `hello`. Then: `obsidian vault="<vault>" delete path="_speckit-012-delete-note-research/case1.md"`. Capture stdout (provisional R4: `Trashed: <path>` or `Deleted: <path>`) and exit code. Verify the file is in the OS trash (recoverable). Lock the parser's expected substring in [src/tools/delete_note/handler.ts](../../src/tools/delete_note/handler.ts) `RESPONSE_RE` regex.
    - **(T0.2) Specific-mode to-trash delete via wikilink**: Pre-step — use `write_note` to create `_speckit-012-delete-note-research/case2.md` (or whichever folder Obsidian's "default note location" resolves to) and ensure it has the wikilink-resolvable name `ScratchNote-T0-2`. Then: `obsidian vault="<vault>" delete file="ScratchNote-T0-2"`. Capture stdout (expected `Trashed: <CLI-resolved canonical path>`) and the canonical-path resolution rule (which folder does the wikilink land in?). **TRIGGER**: if the CLI does NOT echo the canonical path (e.g., returns only `OK`), R4 amends pre-merge to either accept input-locator-as-output-path (with a fallback rule documented in `docs/tools/delete_note.md`) or request a CLI enhancement.
    - **(T0.3) Specific-mode permanent delete**: Pre-step — re-create `_speckit-012-delete-note-research/case1.md` (after T0.1 trashed it) with `write_note`. Then: `obsidian vault="<vault>" delete path="_speckit-012-delete-note-research/case1.md" permanent`. Capture stdout (expected `Deleted: <path>` — distinguished from T0.1's wording IF the CLI distinguishes; per R4, `toTrash` is structural so distinguishing is NOT required). Verify the file is GONE from BOTH vault AND OS trash. **TRIGGER**: if the CLI distinguishes to-trash vs permanent in stdout, the `RESPONSE_RE` regex captures both alternatives (`/^(Trashed|Deleted): (.+?)\s*$/m`). If indistinguishable, the regex collapses to a single alternative (`/^Deleted: (.+?)\s*$/m`).
    - **(T0.4) Delete against a non-existent path**: `obsidian vault="<vault>" delete path="_speckit-012-delete-note-research/Missing.md"`. Capture stdout (expected `Error: file not found at ...` or similar) and exit code. The handler's `CLI_REPORTED_ERROR.message` propagation is locked against this wording per Story 6 AC#3.
    - **(T0.6) Active-mode delete of focused note**: with a focused scratch note open in Obsidian (created via `write_note` for cleanup safety), run `obsidian delete` (no vault/file/path). Capture stdout (expected: focused-note's path with `Trashed: <path>` prefix). Verify the focused note is moved to OS trash. **TRIGGER**: if active-mode response shape differs from specific-mode (e.g., the CLI requires an explicit locator and refuses with `Error: no active file` even when one is focused), the handler / schema gain an active-mode-specific branch.
    - **(T0.7) Path-traversal — SC-012 GATE**: Pre-step — place a sentinel file at `<vault-root>/_speckit-012-sentinel.md` (or wherever the test can verify it survives). Then: `obsidian vault="<vault>" delete path="_speckit-012-delete-note-research/../_speckit-012-sentinel.md"`. **MUST be rejected by the CLI** (either non-zero exit with stderr explaining, or exit 0 with `Error:` on stdout naming the path-traversal as the cause). Verify `_speckit-012-sentinel.md` STILL EXISTS after the call. **TRIGGER**: if the CLI accepts the input and deletes outside the scratch subdir (e.g., the sentinel file is gone), T003 grows a schema-layer `superRefine` clause that rejects `path` values containing `../` or `..\\` segments (plus a co-located schema test case); merge gate does not clear without this. **Silent vault-escape on a destructive operation is unacceptable.**
    - **(T0.8) Trash-volume-full — SC-013 GATE**: Best-effort. On Windows: temporarily set the recycle bin's max size to 0 for the test volume (Recycle Bin Properties → "Custom size: 0 MB"). Pre-step — use `write_note` to create `_speckit-012-delete-note-research/large.md` with ~1 KiB of content (or larger if the test volume's bin can be configured to reject smaller files). Then: `obsidian vault="<vault>" delete path="_speckit-012-delete-note-research/large.md"` (no `permanent`). Capture stdout / stderr / exit code. Expect EITHER (a) a structured error (non-zero exit, OR exit 0 with `Error:` prefix), OR (b) success exit 0 with the file silently permanently deleted. **TRIGGER**: if (b) — silent fall-back — T004 grows a post-success on-disk verification step (or the cli-adapter grows a stdout-pattern detector for the fall-back signal); the handler returns `toTrash: true` only when the file is actually verifiable-in-trash. If the platform doesn't allow simulating this case, document the known limitation prominently in `docs/tools/delete_note.md` (T007) and skip T004's on-disk verification — the user-facing trade-off is documented. After capture, restore the recycle bin to its normal size.

    Cases (v) (unknown vault) and (ix) (subcommand discovery + argv shape) are ALREADY VERIFIED during plan stage — see [research.md Live CLI Findings](research.md#live-cli-findings); no T0 work needed for those two.

  **Cleanup**: after capture, ensure `_speckit-012-delete-note-research/` is empty:
    - `obsidian delete path=<wikilink-resolved canonical path from T0.2>` (to-trash; recoverable if needed)
    - For T0.7: confirm `_speckit-012-sentinel.md` still exists; restore from trash if T0.7 surprised you and deleted it.
    - For T0.8: restore Windows recycle bin settings; recover `large.md` from the bin if it ended up in trash, or restore from `write_note`-created backup if it ended up permanently deleted.
    - Remove `_speckit-012-delete-note-research/` and `_speckit-012-sentinel.md` (with `obsidian delete path=...` for the user-recoverable to-trash default).

  **Constitution**: Principle IV (the captured wording becomes the source-of-truth for handler error classification — preserves chain-of-custody from CLI to MCP client). FR-019 / SC-011 / SC-012 / SC-013.

- [X] T002 [P after T001] **VERIFICATION + ADDITIVE TEST** — confirm the existing 011-R5 cli-adapter unknown-vault response-inspection clause at [src/cli-adapter/cli-adapter.ts:55-89](../../src/cli-adapter/cli-adapter.ts#L55-L89) works for the `delete` subcommand without source-code modification, and add one cross-subcommand test case to lock the inheritance. Two sub-tasks:

  - **(2a) Live verification** (already completed during plan stage — see [research.md Finding 2](research.md#finding-2-unknown-vault-response-identical-to-create)): `obsidian vault=NoSuchVault delete path=nonexistent.md` returns `Vault not found.` on stdout, exit 0 — byte-identical to the create subcommand. The existing `UNKNOWN_VAULT_PREFIX = "Vault not found."` constant and re-classifier handle delete identically. **No source-code changes to `src/cli-adapter/cli-adapter.ts` needed.**
  - **(2b) Adapter-test inheritance lock**: add a new test case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) that exercises the unknown-vault re-classification for `command: "delete"`. **Preferred shape** (if the existing 011-R5 / T002 unknown-vault test is structured as a parameterised suite or is easy to extend with a `it.each`-style fixture row): add `command: "delete"` alongside the existing `command: "create"` row — typically a 1–5 line additive change. **Fallback shape** (if the existing test is a single `it("...")` block hard-coded to `command: "create"`): add a sibling `it("re-classifies unknown vault for delete subcommand", ...)` block that constructs the same stub-spawn fixture with `command: "delete"` and asserts the same `UpstreamError({ code: "CLI_REPORTED_ERROR" })` shape. Either way, the existing test continues to pass for `create` (no regression). Header comment at [src/cli-adapter/cli-adapter.ts:1](../../src/cli-adapter/cli-adapter.ts#L1) already cites BI 011-write-note R5 / T002; no header update needed.

  Depends on: T001 (only loosely — T001's case (v) is already verified during plan stage; T002 is non-blocking confirmation).

  **Constitution**: Principle I (clause lives in the `cli-adapter` primitive, NOT in `delete_note` — benefits all typed tools; this BI does NOT amend the primitive); Principle II (additive parameterised test case for the new subcommand). Edge Cases (unknown vault display name) / R5 inheritance.

**Checkpoint**: Foundational deliverables complete — handler response-parsing logic is grounded in T0-verified live-CLI wording. SC-012 (path-traversal) and SC-013 (trash-volume-full) gates are verified or amended-pre-ship. Phase 3 implementation can now lock against the captured wording.

---

## Phase 3: User Story 1 — Specific-mode delete + the typed-tool surface (Priority: P1) 🎯 MVP

**Goal**: Ship the `delete_note` module — schema, handler, registration — that delivers the core typed-tool surface. Implementation simultaneously satisfies Stories 1, 2, 3, 4, 5, 6, 8 acceptance criteria because they all exercise the same three source files. (Story 7 — documentation + registration descriptor — is its own phase to keep doc-authoring and code-authoring loosely coupled; Story 8 — audit invariant — is encoded as test case (l) inside T004's handler tests, not a separate task.)

**Independent Test**: per [spec.md Story 1 IT](spec.md) — with a stub `spawnFn` injected via `deps`, `executeDeleteNote({ target_mode: "specific", vault: "MyVault", path: "Inbox/Old.md" }, deps)` against a stub child that exits `0` with the verified-from-T0.1 stdout returns `{ deleted: true, path: "Inbox/Old.md", toTrash: true }` AND the stub spawn was invoked with argv `["vault=MyVault", "delete", "path=Inbox/Old.md"]` (vault hoisted first per the adapter's argv-assembly contract; NO `permanent` token because default-false-omit rule). Verifiable via `npx vitest run src/tools/delete_note/handler.test.ts`.

### Implementation for User Story 1

- [X] T003 [US1] Create [src/tools/delete_note/schema.ts](../../src/tools/delete_note/schema.ts) and [src/tools/delete_note/schema.test.ts](../../src/tools/delete_note/schema.test.ts). Per [data-model.md §Input Schema](data-model.md#input-schema-deletenoteinputschema), [contracts/delete-note-input.contract.md](contracts/delete-note-input.contract.md), and [research.md R6](research.md#r6--no-active-mode-superrefine-clauses-departure-from-011-write-note-r6). Depends on: nothing in this list (truly first source-code task).

  - **(3a) Author [src/tools/delete_note/schema.ts](../../src/tools/delete_note/schema.ts)** with the `// Original — no upstream. delete_note input/output schemas — flat target-mode primitive extension; permanent default false; deleted z.literal(true) success-only output shape.` header (Principle V). Define:
    - `deleteNoteInputSchema = applyTargetModeRefinement(targetModeBaseSchema.extend({ permanent: z.boolean().optional().default(false) }))` — exactly per [data-model.md §Input Schema](data-model.md#input-schema-deletenoteinputschema). **NO `.superRefine(...)` chain** (R6 — `permanent` has well-defined semantics in both modes; departure from `write_note`'s three active-mode clauses).
    - `deleteNoteOutputSchema = z.object({ deleted: z.literal(true), path: z.string(), toTrash: z.boolean() }).strict()` — per FR-005. The `z.literal(true)` is the success-only return shape (failures throw `UpstreamError`, never produce `deleted: false`); mirrors `read_note`'s no-discriminator response per R4.
    - `DeleteNoteInput = z.infer<typeof deleteNoteInputSchema>` and `DeleteNoteOutput = z.infer<typeof deleteNoteOutputSchema>` — type aliases ONLY (Principle III; no hand-rolled interfaces).
    - **No `.describe()` calls** (per FR-004, SC-005).
  - **(3b) Author [src/tools/delete_note/schema.test.ts](../../src/tools/delete_note/schema.test.ts)** with the `// Original — no upstream. Tests for the delete_note input schema — happy paths across both modes + permanent variations + 7 Story 5 validation classes.` header. **13 test cases** per [spec.md FR-016](spec.md) Schema tests:
    - **(a) Story 1 happy-path** — specific mode with `path=`: `safeParse({ target_mode: "specific", vault: "MyVault", path: "Inbox/Old.md" }).success === true` AND `parsed.permanent === false` (default applied).
    - **(b) Story 2 happy-path** — specific mode with `file=`: `safeParse({ target_mode: "specific", vault: "MyVault", file: "QuickNote" }).success === true`.
    - **(c) Story 3 happy-path** — specific mode with `permanent: true`: `safeParse({ target_mode: "specific", vault: "V", path: "Old.md", permanent: true }).success === true` AND `parsed.permanent === true`.
    - **(d) Story 4 happy-path** — active mode (no permanent): `safeParse({ target_mode: "active" }).success === true` AND `parsed.permanent === false` AND `parsed.vault === undefined` AND `parsed.file === undefined` AND `parsed.path === undefined`.
    - **(e) Story 4 AC#2 happy-path** — active mode WITH `permanent: true`: `safeParse({ target_mode: "active", permanent: true }).success === true` AND `parsed.permanent === true`. Confirms R6's "permanent permitted in both modes" decision.
    - **(f) Story 5 AC#1** — neither file nor path: `safeParse({ target_mode: "specific", vault: "V" }).success === false` AND issues include one with `message` matching `/exactly one of/`.
    - **(g) Story 5 AC#2** — both locators: `safeParse({ target_mode: "specific", vault: "V", file: "F", path: "F.md" }).success === false` AND issues include `path: ["file"]` AND `path: ["path"]`.
    - **(h) Story 5 AC#3** — vault missing in specific: `safeParse({ target_mode: "specific", file: "F" }).success === false` AND issues include `path: ["vault"]`.
    - **(i) Story 5 AC#4** — forbidden vault/file/path in active mode (parameterised over the three keys): `safeParse({ target_mode: "active", vault: "V" })`, `... file: "F"`, `... path: "P"` — all `.success === false` AND issues include `path: [<key>]` and message matching `/active mode/`.
    - **(j) Story 5 AC#5** — unknown top-level key: `safeParse({ target_mode: "specific", vault: "V", path: "P.md", pancakes: "yes" }).success === false` AND issues include `code: "unrecognized_keys"` with `keys: ["pancakes"]`.
    - **(k) Story 5 AC#6** — invalid discriminator: `safeParse({ target_mode: "unknown", vault: "V", path: "P.md" }).success === false` AND issues identify `target_mode`.
    - **(l) Story 5 AC#7** — `permanent` non-boolean: `safeParse({ target_mode: "specific", vault: "V", path: "P.md", permanent: "true" }).success === false` AND issues include `path: ["permanent"]` with `code: "invalid_type"`.
    - **(m) Defaults coercion in both modes**: `safeParse({ target_mode: "specific", vault: "V", path: "P.md", permanent: undefined }).success === true` AND `parsed.permanent === false`. Symmetric assertion for omitted-`permanent` AND for active mode.

  **Constitution**: Principle II (13 cases co-located); Principle III (single source of truth — schema is the only typed surface for input shape, `z.literal(true)` is the only typed surface for the success-return shape). FR-001 / FR-002 / FR-003 / FR-004 / FR-005 / FR-016 / SC-004 / SC-005.

- [X] T004 [US1] Create [src/tools/delete_note/handler.ts](../../src/tools/delete_note/handler.ts) and [src/tools/delete_note/handler.test.ts](../../src/tools/delete_note/handler.test.ts). Per [data-model.md §CLI Invocation Shape](data-model.md#cli-invocation-shape) + [§Response Parsing](data-model.md#response-parsing), [contracts/delete-note-handler.contract.md](contracts/delete-note-handler.contract.md), and [research.md R1, R2, R3, R4](research.md). Depends on: T001 (response-parsing wording locked at T0.1, T0.3, T0.4, T0.6), T003 (`DeleteNoteInput` / `DeleteNoteOutput` types).

  - **(4a) Author [src/tools/delete_note/handler.ts](../../src/tools/delete_note/handler.ts)** with the `// Original — no upstream. delete_note handler: thin transformer routing parsed input through invokeCli — argv assembly (NO file→name rename per R3), flag-form permanent per R2, structural toTrash derivation per R4 (toTrash = !parsed.permanent), response parsing locked against T0-captured wording.` header (Principle V). Implement per [contracts/delete-note-handler.contract.md §invariants](contracts/delete-note-handler.contract.md):
    - `executeDeleteNote(input: DeleteNoteInput, deps: ExecuteDeps): Promise<DeleteNoteOutput>`.
    - `ExecuteDeps = { logger: Logger, queue: Queue, spawnFn?: SpawnLike, env?: NodeJS.ProcessEnv }` — mirrors `executeWriteNote` exactly.
    - **NO per-call logger events** (per [research.md R1](research.md#r1--logger-surface-fr-009-reconciliation-supersedes-spec-fr-009-wording) — handler is a thin `invokeCli` wrapper; observability via the cli-adapter's existing `dispatch*` events).
    - Specific-mode argv assembly: `parameters` includes `file: input.file` OR `path: input.path` (NO rename per R3 — `delete` argv keys match schema fields directly), `flags: input.permanent === true ? ["permanent"] : []` (R2 flag form + default-false-omit rule).
    - Active-mode argv assembly: `parameters: {}` (empty), `flags: input.permanent === true ? ["permanent"] : []`, `vault: undefined`. Schema guarantees `parsed.vault === undefined`, `parsed.file === undefined`, `parsed.path === undefined` so the locator parameters are never included.
    - Call `invokeCli({ command: "delete", vault, parameters, flags, target_mode: input.target_mode }, { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue })`. The `vault!` non-null assertion in specific mode is justified by the primitive's `superRefine` invariant.
    - `parseDeleteResponse(stdout)` helper that locks against the T0.1/T0.3-captured wording (provisional regex `/^(Trashed|Deleted): (.+?)\s*$/m`); returns `{ path: <captured group 2> }`. On unparseable stdout, throws `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "delete_note could not parse CLI response: ...", details: { stdout } })`. **SC-011 citation requirement**: the line above the `RESPONSE_RE` constant declaration MUST carry an inline comment citing the research.md T0 captures it locks against — e.g., `// Locked at T0.1 (to-trash) + T0.3 (permanent) — see research.md ## T0 Live-CLI Capture`. Future CLI version drift surfaces as test failures rather than silent regressions; a reviewer chasing a parse failure can trace the regex back to the verified ground truth without reading tasks.md.
    - **Structural toTrash derivation** (the load-bearing invariant per SC-014): after a successful `parseDeleteResponse`, return `{ deleted: true, path: parsed.path, toTrash: !input.permanent }`. The `toTrash` field is computed from input, NOT from the CLI response. The typed surface owns the safety-default contract.
    - **(Conditional, post-T0.8 amendment if SC-013 fails)**: if T0.8 surfaced a silent fall-back from to-trash to permanent, add a post-success on-disk verification step — e.g., for non-permanent calls, verify the file's absence from the vault path AND presence in the OS trash path. If the file was permanently deleted despite `permanent: false`, throw `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "delete fell back to permanent — recycle bin unavailable", details: { stdout, expectedToTrash: true, actualOnDisk: "missing" } })`. Default behaviour (without the amendment): trust the CLI's reported success.
    - **Module size budget per SC-007**: ≤ 50 LOC total file LOC (verified by `wc -l`). If exceeded, factor `parseDeleteResponse` into a sibling module.
  - **(4b) Author [src/tools/delete_note/handler.test.ts](../../src/tools/delete_note/handler.test.ts)** with the `// Original — no upstream. Tests for the delete_note handler — argv assembly (no rename), response parsing, structural toTrash, audit invariant, UpstreamError propagation.` header. **12 test cases** per [spec.md FR-016](spec.md) Handler tests:
    - **(a) Story 1 IT** — specific path mode to-trash happy path: stub `spawnFn` exits `0` with T0.1-captured stdout (e.g., `\nTrashed: Inbox/Old.md\n`); assert returned `{ deleted: true, path: "Inbox/Old.md", toTrash: true }` AND argv equals `["vault=MyVault", "delete", "path=Inbox/Old.md"]` (per the cli-adapter's argv hoisting — vault first, command second, key=value third, NO flags). Argv MUST NOT contain any `permanent`-shaped token.
    - **(b) Story 2 IT** — specific file mode to-trash happy path: stub returns T0.2-captured stdout; assert `{ deleted: true, path: "<canonical resolved path from T0.2>", toTrash: true }` AND argv contains `file=QuickNote` (NOT `name=QuickNote` per R3 no-rename — departure from `write_note`'s PSR-5).
    - **(c) Story 3 IT** — specific permanent: stub returns T0.3-captured permanent-success wording; assert `{ deleted: true, path: "Old.md", toTrash: false }` AND argv ends with `["permanent"]`.
    - **(d) Story 1 AC#2 + Story 3 AC#2** — permanent-default-false does NOT emit `permanent` token: parameterised over (omitted, explicit false); stub spawn that records argv; assert argv does NOT contain `"permanent"` token in either case.
    - **(e) Story 4 AC#1** — active mode happy path to-trash: stub returns T0.6-captured focused-note wording; assert `{ deleted: true, path: "<focused path>", toTrash: true }` AND argv equals `["delete"]` (NO locator tokens, NO permanent token — vault hoisted to undefined and dropped by `dispatchCli`).
    - **(f) Story 4 AC#2** — active mode + permanent: stub returns T0.6-derived wording; assert `{ deleted: true, path: "<focused path>", toTrash: false }` AND argv equals `["delete", "permanent"]`.
    - **(g) Story 6 AC#1** — `CLI_BINARY_NOT_FOUND`: stub `spawnFn` raises `ENOENT`; assert handler propagates `UpstreamError({ code: "CLI_BINARY_NOT_FOUND" })`.
    - **(h) Story 6 AC#2** — `CLI_NON_ZERO_EXIT`: stub exits `1` with stderr `"permission denied"`; assert handler propagates `UpstreamError({ code: "CLI_NON_ZERO_EXIT", details: { exitCode: 1, stderr: "permission denied\n" } })`.
    - **(i) Story 6 AC#3** — `CLI_REPORTED_ERROR` (file not found): stub exits `0` with stdout T0.4-captured wording (e.g., `"Error: file not found at Inbox/Missing.md\n"`); assert handler propagates `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { message: "Error: file not found at Inbox/Missing.md" } })` — verbatim CLI wording preserved (NOT synthesised).
    - **(j) Story 4 AC#4** — `ERR_NO_ACTIVE_FILE`: stub returns the active-mode no-active-file response (matches `read_note` / `write_note`'s existing test fixture); assert handler propagates `UpstreamError({ code: "ERR_NO_ACTIVE_FILE" })` with the recovery-hint message verbatim.
    - **(k) Story 6 AC#4** — non-`UpstreamError` re-throw: stub `spawnFn` throws a plain `Error("unexpected runtime error")`; assert `executeDeleteNote(...)` REJECTS WITH the original `Error` (NOT wrapped as `UpstreamError`). Verifies the bug-bypass path matches the `obsidian_exec` / `read_note` / `write_note` precedent.
    - **(l) Story 8 / SC-014 AUDIT INVARIANT** — parameterised over six combinations: specific + omitted, specific + false, specific + true, active + omitted, active + false, active + true. For each, stub returns the appropriate to-trash or permanent-success wording (T0.1 or T0.3 derived); assert `result.toTrash === !inputPermanent` for every combination. The single test that nails down the audit-trail invariant operators rely on when filtering logs. Test name pattern: `audit invariant: ${desc} → toTrash: ${expected}`.

  **Constitution**: Principle I (handler is a thin transformer; no `child_process.spawn` direct invocation per SC-003); Principle II (12 cases co-located, including the SC-014 audit invariant); Principle IV (every `UpstreamError` propagated verbatim; non-`UpstreamError` re-thrown). FR-001 / FR-007 / FR-008 / FR-010 / FR-016 / SC-003 / SC-007 / SC-014.

- [X] T005 [US1] Create [src/tools/delete_note/index.ts](../../src/tools/delete_note/index.ts) and [src/tools/delete_note/index.test.ts](../../src/tools/delete_note/index.test.ts). Per [contracts/delete-note-handler.contract.md](contracts/delete-note-handler.contract.md), [contracts/delete-note-input.contract.md](contracts/delete-note-input.contract.md), and the existing [src/tools/write_note/index.ts](../../src/tools/write_note/index.ts) precedent. Depends on: T003, T004.

  - **(5a) Author [src/tools/delete_note/index.ts](../../src/tools/delete_note/index.ts)** with the `// Original — no upstream. delete_note tool registration via registerTool — responseFormat: "json" wraps the { deleted, path, toTrash } envelope for the MCP wire.` header (Principle V). Mirror `write_note/index.ts` structure exactly:
    - Import `registerTool` from `../_register.js`, `executeDeleteNote, type ExecuteDeps` from `./handler.js`, `deleteNoteInputSchema` from `./schema.js`.
    - Export `DELETE_NOTE_TOOL_NAME = "delete_note"`.
    - Export `DELETE_NOTE_DESCRIPTION` per FR-012: `'Delete a note from an Obsidian vault. Default sends the file to the OS trash (recoverable); permanent: true bypasses trash and is irreversible. Call help({ tool_name: "delete_note" }) for full parameter docs and the error-code roster.'` — verb-led, mentions `help` AND the tool's own name AND the safety-default disclosure with the irreversibility warning.
    - Export `RegisterDeps = ExecuteDeps`.
    - Export `createDeleteNoteTool(deps: RegisterDeps): RegisteredTool` — calls `registerTool({ name, description, schema, deps, handler })` and returns the result. The handler delegates to `executeDeleteNote(input, d)` and returns the result directly (the `registerTool` factory's `responseFormat: "json"` default JSON-serialises into the MCP envelope).
  - **(5b) Author [src/tools/delete_note/index.test.ts](../../src/tools/delete_note/index.test.ts)** with the `// Original — no upstream. Tests for the delete_note tool registration — descriptor shape, stripped schema, help mention + irreversibility warning, docs presence.` header. **5 test cases** per [spec.md FR-016](spec.md) Tool-registration tests:
    - **(a) Story 7 AC#1 base** — descriptor name: `createDeleteNoteTool({ logger, queue }).descriptor.name === "delete_note"`.
    - **(b) Story 7 AC#1 + AC#2** — emitted `inputSchema` has `type: "object"`, `additionalProperties: false`, `properties` has all 5 keys (`target_mode`, `vault`, `file`, `path`, `permanent`), `required` includes `target_mode`, AND zero `description` keys at any depth (walk via recursion). Per [contracts/delete-note-input.contract.md emitted-schema](contracts/delete-note-input.contract.md#emitted-json-schema-the-wire-shape-mcp-clients-see).
    - **(c) Story 7 AC#3** — descriptor `description` is non-empty AND contains literal substring `"help"` (case-insensitive) AND contains literal substring `"delete_note"` AND contains a phrase surfacing the safety-default disclosure (regex match for `/trash|recoverable|irreversible|permanent/i`).
    - **(d) End-to-end propagation** — call `createDeleteNoteTool(deps).handler({ target_mode: "specific" })` (missing required vault + locator); assert returned `ToolCallResult` is an `isError: true` envelope whose JSON-serialised payload has `code: "VALIDATION_ERROR"`. Verifies the `registerTool` factory's `ZodError → asToolError` wrap fires for `delete_note` end-to-end (NOT just at the schema layer).
    - **(e) Story 7 AC#4 / FR-014 / FR-016 case (e)** — docs presence + non-stub: resolve [docs/tools/delete_note.md](../../docs/tools/delete_note.md) via `import.meta.url` per [research.md R8](research.md#r8--co-located-test-path-resolution-for-the-docs-existence-assertion-fr-016-case-e); assert file exists, does NOT contain the substring `<!-- TODO`, contains all 5 propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`), contains all 4 required example shapes (regex search for `target_mode.*specific.*path` AND `target_mode.*specific.*file` AND `target_mode.*specific.*permanent` AND `non-existent`), AND contains the `permanent: true` irreversibility warning (regex match for `/irreversibl|cannot be undone|unrecoverable/i`). The doc itself is authored by T007.

  **Constitution**: Principle I (per-surface module entry point); Principle II (5 registration tests co-located); Principle III (the `inputSchema` is derived from the schema via `registerTool`'s `toMcpInputSchema` + `stripSchemaDescriptions` — no manual descriptor construction). FR-001 / FR-011 / FR-012 / FR-016 / SC-002 / SC-007.

- [X] T006 [US1] Wire `delete_note` into the MCP server. Edit [src/server.ts](../../src/server.ts):

  - **(6a)** Add the import at the top of the imports block (alphabetical alongside `createReadNoteTool` / `createWriteNoteTool`): `import { createDeleteNoteTool } from "./tools/delete_note/index.js";` — placed FIRST in the alphabetical sequence (`delete` < `help` < `obsidian_exec` < `read_note` < `write_note`).
  - **(6b)** Add `createDeleteNoteTool({ logger, queue })` to the tools array at [src/server.ts:64](../../src/server.ts#L64) — the alphabetical position is FIRST in the array (before `createHelpTool()`). Or, alternatively, use registration-of-introduction order (append at end after `createWriteNoteTool({ logger, queue })`). Both acceptable per FR-013; alphabetical is the cleaner convention.
  - **(6c)** Verify the registry-consistency test at [src/server.test.ts](../../src/server.test.ts) passes — the `assertToolDocsExist` aggregator now includes `delete_note` and asserts [docs/tools/delete_note.md](../../docs/tools/delete_note.md) exists. (T007 authors that file; if T007 has not landed yet, this test FAILS until T007 lands. Acceptable transient failure within this BI's WIP — both T006 and T007 land in the same merge.)
  - **(6d)** Verify the post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `delete_note` via its `it.each` registry walk (per [data-model.md §JSON Schema Emit Shape](data-model.md#json-schema-emit-shape-post-010-flat) AND [research.md R7](research.md)). NO test-file modifications. Run `npx vitest run src/tools/_register.test.ts` — assert all `it.each` rows for `delete_note` pass.

  Depends on: T005.

  **Constitution**: Principle I (one-line addition; no structural change to server.ts); Principle II (existing drift detector + registry-consistency test cover the new entry without test additions). FR-013 / SC-002 / SC-009 / SC-010.

**Checkpoint**: Phase 3 complete. `delete_note` is registered alongside `obsidian_exec`, `help`, `read_note`, `write_note`. `tools/list` returns the post-010 flat descriptor for `delete_note`. The 30 co-located tests + the auto-covered drift detector + the registry-consistency test all pass. Stories 1, 2, 3, 4, 5, 6, 8 acceptance criteria satisfied at the implementation layer (Story 7 docs gate is T007).

---

## Phase 4: User Story 7 — Documentation + Cross-References (Priority: P2)

**Goal**: Replace the (potentially absent) docs/tools/delete_note.md stub with a non-stub Markdown body. Update sibling docs (index, obsidian_exec) to acknowledge the new tool. Story 7's tests in T005 case (e) ASSERT the doc's existence + content + irreversibility warning; Phase 4 makes them pass.

**Independent Test**: per [spec.md Story 7 IT](spec.md) — `help({ tool_name: "delete_note" })` returns the populated body (no TODO stub, all 5 error codes named, ≥4 example shapes, irreversibility warning present). Verifiable by file inspection (T007 + T008 + T009 outputs) and by the index.test.ts case (e) added in T005.

- [X] T007 [P] [US7] Author [docs/tools/delete_note.md](../../docs/tools/delete_note.md) (NEW file — the `assertToolDocsExist` aggregator does NOT pre-populate stubs; T006's registry-consistency test will fail until this lands). Per FR-014 + Story 7 AC#4. Different file from src/, fully parallelisable with T003-T006.

  **Document content** (sections required):
  - **Header**: title (`# Delete Note (delete_note)`), one-paragraph summary mentioning typed surface + safety defaults + the irreversibility warning for `permanent: true` prominently.
  - **Input schema**: per-mode field policy table (matches [contracts/delete-note-input.contract.md per-mode-field-policy](contracts/delete-note-input.contract.md#per-mode-field-policy-runtime-post-superrefine)). Document `permanent` is permitted in BOTH modes (departure from `write_note`'s active-mode rules — explicit so readers don't assume the same constraint applies here).
  - **Output shape**: `{ deleted: true, path: string, toTrash: boolean }` — describe `deleted` is always literal `true` on success (failures throw `UpstreamError`); `path` is the CLI-canonical vault-relative path AT THE MOMENT OF DELETION; `toTrash: true` means recoverable from OS trash, `toTrash: false` means permanently deleted.
  - **Error roster**: all 5 propagated codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`) with one-or-two sentences each describing when each surfaces. **MUST include a clear note that `permanent: true` is unrecoverable** (per the user input's [P2] AC #11). NO new codes.
  - **Worked examples (≥4 per Story 7 AC#4 / FR-014)**:
    - (i) Specific-mode `path=` to-trash delete of a known note.
    - (ii) Specific-mode `file=` (wikilink) to-trash delete.
    - (iii) Specific-mode `path=` permanent delete (with prominent "this cannot be undone" warning callout).
    - (iv) Failure recovery from a non-existent file (showing the `CLI_REPORTED_ERROR` shape and the recommended caller response — verify the path, retry with the right locator, or accept that the file is already gone).
    - (v) [optional but recommended] Active-mode delete of focused note example.
  - **Adversarial-edge-case behaviours captured during T0**:
    - Path-traversal rejection contract (cite the T0.7-verified CLI rejection wording; if T0.7 surfaced a tool-layer reject, mention it).
    - Unknown-vault response signature (cite the plan-stage-verified `Vault not found.` wording).
    - File-not-found wording (cite T0.4).
    - **Trash-volume-full behaviour on Windows** (cite T0.8 result — either CLI surfaces structured error OR silent fall-back was detected and amended). Document the platform-specific limitation prominently.
    - File-locked-by-external-editor behaviour on each platform (EBUSY on Windows surfaces as `CLI_NON_ZERO_EXIT`; POSIX typically allows the delete and the editor may show a stale buffer).
    - OS-reserved-name behaviour on Windows (CON / PRN / AUX — the CLI is the trust boundary; `delete_note` forwards verbatim).
    - Active-mode TOCTOU caveat: the focused note may change between parse and execution; agents needing certainty about which file is deleted MUST use specific mode with an explicit locator. **For an irreversible operation, this is the load-bearing caveat.**
  - **Audit-trail guidance**: explain how operators filter logs by `toTrash === false` to surface every irreversible deletion. The typed `permanent` flag IS the audit point per the user input's SECURITY adversarial bullet.
  - **Cross-references**: links to the [target-mode primitive](../../specs/004-target-mode-schema/spec.md), the [post-010 flat encoding](../../specs/010-flatten-target-mode/spec.md), the [cli-adapter](../../specs/003-cli-adapter/spec.md), the [help tool](../../specs/005-help-tool/spec.md), and [read_note](../../specs/006-read-note/spec.md) / [write_note](../../specs/011-write-note/spec.md) as the sibling tools.

  **Header convention**: NO `// Original — no upstream.` header (Markdown documentation is exempt per [005-help-tool FR-019](../005-help-tool/spec.md)). NO `<!-- TODO -->` markers.

  **Constitution**: Principle V (Markdown exempt from source-header convention per existing precedent); ADR-005 (progressive-disclosure documentation lives in docs/, not in schema). FR-014 / SC-006.

- [X] T008 [P] [US7] Update [docs/tools/index.md](../../docs/tools/index.md) — add a one-line summary for `delete_note` per FR-015. Match the established style for existing entries (typically `- [<tool_name>](<tool_name>.md): <one-sentence summary>`). The summary MUST surface the safety-default phrasing (e.g., `- [delete_note](delete_note.md): Delete a vault note (to OS trash by default; permanent: true is irreversible).`). Different file from T007; can run in parallel.

  **Constitution**: Principle V (Markdown exempt). FR-015.

- [X] T009 [P] [US7] Update [docs/tools/obsidian_exec.md](../../docs/tools/obsidian_exec.md) — add a paragraph noting `delete_note` as the typed surface for delete operations and clarifying when `obsidian_exec` is the right fallback (the create subcommand's `newtab` flag, future unwrapped subcommands; NOT the delete subcommand which is now fully covered by `delete_note`). Per SC-015. Different file from T007 / T008; can run in parallel.

  **Constitution**: Principle V (Markdown exempt). SC-015.

**Checkpoint**: Phase 4 complete. `help({ tool_name: "delete_note" })` returns the populated body. T005 case (e) passes (was failing prior — required T007 to land). `obsidian_exec.md` updated to point agents at the typed surface for delete operations. The full `delete_note` BI surface is now shippable.

---

## Phase 5: Polish & Release

**Purpose**: Release artifacts (CHANGELOG, package.json), end-to-end verification (quickstart S-1..S-15), and PR Constitution Compliance.

- [X] T010 [P] Update [package.json](../../package.json) `description` field to mention `delete_note` alongside `read_note` / `write_note`. Current text (post-011): `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), and write_note (typed create/overwrite tool)."`. Update to: `"... ships obsidian_exec (generic CLI bridge), help (progressive-disclosure docs), read_note (typed read tool), write_note (typed create/overwrite tool), and delete_note (typed delete tool with safety defaults)."`. No other package.json changes (engines.node, dependencies, etc., all unchanged).

  **Constitution**: N/A (release-metadata only). Per project release convention.

- [X] T011 Add a [CHANGELOG.md](../../CHANGELOG.md) release entry for `0.2.5` per the project's release convention. Bump `package.json:version` from `0.2.4` to `0.2.5` (PATCH bump per plan — purely additive surface; no breaking changes; the new typed surface for delete operations is a new tool-surface addition, not a behaviour change to existing tools). The CHANGELOG entry should:
  - **Add**: `delete_note` typed MCP tool wrapping the Obsidian CLI's `delete` subcommand. Per-mode validation, safety-defaulted to OS trash (recoverable); explicit `permanent: true` opt-in for irreversible deletion. Output includes `toTrash: boolean` audit-trail signal (operators filter logs by `toTrash === false` to surface every irreversible deletion). Replaces `obsidian_exec` for delete operations.
  - **Note**: `permanent: true` is unrecoverable — explicit irreversibility warning highlighted in the tool's top-level description AND in `docs/tools/delete_note.md`.
  - **Note**: `obsidian_exec` remains the freeform escape hatch for the create subcommand's `newtab` flag and unwrapped subcommands (the `delete` subcommand is now fully covered by `delete_note`).
  - **Reference**: link to `specs/012-delete-note/spec.md` for the full BI specification.

  Depends on: T007 (the docs that callers will use are in place before the release names them).

  **Constitution**: N/A (release-metadata). Per project release convention.

- [X] T012 Run [quickstart.md](quickstart.md) S-1..S-10 + S-14 verification (CI-runnable scenarios). Specifically:
  - **S-1**: `npm run test` — assert 0 failures across the new test files; 28 acceptance scenarios pass.
  - **S-2 / S-7**: drift detector + registry-consistency test pass for `delete_note`.
  - **S-3**: `wc -l src/tools/delete_note/handler.ts` ≤ 50; `grep -nE "child_process\.spawn|spawn\(|Error:" src/tools/delete_note/handler.ts` returns no matches.
  - **S-4**: `grep -nE "^(interface|type)\s+DeleteNote.*=.*\{" src/tools/delete_note/schema.ts` returns no matches (type ALIASES via `z.infer` are permitted).
  - **S-5**: `grep -nE "\.describe\(" src/tools/delete_note/schema.ts` returns no matches.
  - **S-6**: docs/tools/delete_note.md greps pass (no `<!-- TODO`, ≥5 error codes, ≥4 example shapes, ≥1 irreversibility warning).
  - **S-8**: aggregate statements coverage ≥ 89.6% (per [vitest.config.ts:20](../../vitest.config.ts#L20)).
  - **S-9**: `git diff main..HEAD -- src/tools/obsidian_exec/ src/tools/read_note/ src/tools/write_note/` shows zero substantive changes (only acceptable diff is the `src/server.ts` registration-list reorder — NOT a content change in any tool).
  - **S-10**: T0.7's path-traversal verification result (already captured in T001).
  - **S-14**: `npx vitest run -t "audit invariant" src/tools/delete_note/handler.test.ts` — assert all 6 audit-invariant cases pass (specific + permanent omitted/false/true; active + permanent omitted/false/true). Per SC-014.

  Depends on: T001-T011.

  **Constitution**: Principle II (full test suite passes); Principle III (zod single-source-of-truth verified); Principle IV (no new error codes, all failures structured). FR-017 (coverage gate) / SC-001 / SC-003 / SC-004 / SC-005 / SC-006 / SC-008 / SC-009 / SC-010 / SC-012 / SC-014.

- [ ] T013 Manual S-11 (Claude Desktop / MCP Inspector end-to-end — strict-rich client) + S-12 (Cowork end-to-end — strict-naive client) from [quickstart.md](quickstart.md). Capture results in PR description. Both client classes are expected to accept `delete_note`'s post-010 `additionalProperties: false` shape; the strict-rich client observes the unknown-key rejection (Story 5 AC#5); the strict-naive client strips unknown keys client-side per the published schema (also CORRECT per the dual-pathway documented in spec Edge Cases). **S-11 step 12 is the SC-013 trash-volume-full probe** — captured in this manual run if the platform supports it; otherwise the platform-specific limitation is documented. Manual one-time pre-merge step.

  Depends on: T010 (built `dist/` ready for client loading) and T011 (the version/CHANGELOG that the PR description will reference).

  **Constitution**: Principle IV (real-CLI failure paths verified through real clients, not just stubs). SC-002 + SC-006 + SC-013 client-class verification.

- [ ] T014 Fill the PR description's Constitution Compliance checklist (5/5 PASS expected per [plan.md Constitution Check](plan.md#constitution-check)). Also note in the PR description: (a) the FR-019 T0 capture results (which cases were verified during T001 with their wording), (b) any R4 amendment that landed (if T0.3 surfaced an indistinguishable to-trash/permanent signal — acceptable per R4 since `toTrash` is structural), (c) the SC-012 verification result (path-traversal rejected by CLI, OR tool-layer reject added), (d) the SC-013 verification result (trash-volume-full surfaces structured error, OR fall-back detector amendment landed, OR platform-specific limitation documented). Include links to the spec / plan / research artifacts. Per Constitution v1.2.0 §Development Workflow #8.

  Depends on: T001-T013.

  **Constitution**: §Development Workflow #8 (PR-level checklist). Principle I, II, III, IV, V verification.

**Checkpoint**: BI ready to merge. All 15 quickstart scenarios pass; PR description complete; coverage gate green; manual end-to-end verifications captured. The PR can be opened for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: skipped — toolchain ready
- **Foundational (Phase 2)**: T001 first, T002 [P after T001] (T002 is verification-only — confirms the existing 011-R5 cli-adapter clause works for delete; not blocking on T001's substance, only on T001's existence as a dependency-marker). BLOCKS Phase 3 because the handler's response-parsing logic (T004) locks against T0-captured wording.
- **User Story 1 (Phase 3)**: T003 → T004 → T005 → T006 (sequential per file dependencies). T004 depends on T001 for the captured response wording. T006 depends on T007 for docs (registry-consistency test fails until T007 lands — but both T006 and T007 land in the same merge; transient WIP failure acceptable).
- **User Story 7 (Phase 4)**: T007, T008, T009 are file-disjoint; all three can run in parallel ([P]).
- **Polish (Phase 5)**: T010 in parallel with T011, then T012 (depends on all prior), then T013 (depends on T010/T011), then T014 (depends on all).

### User Story Dependencies

- **User Story 1**: depends on Foundational (T001 for response-wording lock); deliverable spans T003 + T004 + T005 + T006. **Note**: this BI's "User Story 1 ship" effectively ALSO delivers Stories 2, 3, 4, 5, 6, 8 because they exercise the same source files. The story-tag discipline maps acceptance criteria to test cases (per FR-016), not to separable implementation slices. Story 8's audit invariant lives as test case (l) inside T004's handler tests.
- **User Story 7**: depends on T005's index.test.ts case (e) + T007's docs authoring; deliverable is T007 + T008 + T009. Independent of Stories 1-6+8 in spirit (docs vs. code), but the index.test.ts case (e) couples them in test order.

### Within Each User Story

- Within US1: schema (T003) before handler (T004) before registration (T005) before server-wire (T006). Test cases land WITH their source file (no separate red-green TDD loop per project convention).
- Within US7: T007/T008/T009 are file-disjoint — fully parallelisable.

### Parallel Opportunities

- **T002** can run in parallel with T003-T006 once T001 is complete (T002 touches `cli-adapter`, T003-T005 touch `delete_note/`, T006 touches `server.ts` — all file-disjoint).
- **T007 + T008 + T009** all run in parallel with each other.
- **T007** can run in parallel with T003-T006 (file-disjoint).
- **T010** can run in parallel with T011.

### Blocking-task Summary

| Blocker | Blocks | Reason |
|---|---|---|
| T001 | T004 (response-wording lock), T012 case S-10/S-14, possibly T002 | Live-CLI characterisation gates handler logic + SC-012 + SC-013 |
| T003 | T004 (`DeleteNoteInput` import), T005 (`deleteNoteInputSchema` import) | Type/schema dependency |
| T004 | T005 (`executeDeleteNote` import) | Function dependency |
| T005 | T006 (`createDeleteNoteTool` import) | Factory dependency |
| T007 | T006 PASSING (registry-consistency test) | Doc must exist for assertToolDocsExist |
| T010 + T011 | T012 (CI verification needs version + CHANGELOG in place) | Release-metadata coupling |
| T012 | T013 (manual verification needs CI green first) | Confidence ordering |
| T013 + T014 | merge | PR completeness |

---

## Parallel Example: User Story 1 + Story 7 in parallel after Foundational

```text
# After T001 + T002 land:

# Track A — delete_note source modules (sequential per file dep):
T003 (schema.ts + schema.test.ts)
  └─> T004 (handler.ts + handler.test.ts)
        └─> T005 (index.ts + index.test.ts)
              └─> T006 (server.ts wire-up)

# Track B — docs (parallelisable with track A):
T007 (docs/tools/delete_note.md)        [P with T003-T006]
T008 (docs/tools/index.md update)        [P with T003-T006 AND with T007]
T009 (docs/tools/obsidian_exec.md update) [P with T003-T006 AND with T007/T008]
```

A solo implementer typically lands T003-T009 sequentially in commit order: T003 → T004 → T005 → T007 → T006 → T008 → T009 (with T007 BEFORE T006 so the registry-consistency test passes immediately). A two-implementer team can split tracks A and B.

---

## Implementation Strategy

### MVP First (User Story 1 — Stories 1, 2, 3, 4, 5, 6, 8)

1. T001 (foundational live-CLI characterisation; user authorises scratch subdir). **Two ship gates**: SC-012 path-traversal (T0.7) + SC-013 trash-volume-full (T0.8).
2. T002 (verification-only — confirms 011-R5 cli-adapter clause works for delete; additive parameterised test).
3. T003 → T004 → T005 → T007 (out-of-order to satisfy T006's docs-presence test) → T006.
4. **STOP and VALIDATE**: run `npm run test`; assert 30 new tests pass; assert drift detector + registry-consistency tests pass; assert audit invariant test (S-14) passes for all 6 combinations.
5. The MVP is now `delete_note` registered + schema + handler + index + docs. Stories 1-6 + 8 acceptance criteria all satisfied.

### Incremental Delivery

The 012-delete-note BI is fundamentally a single atomic ship — there is no "ship a partial delete_note" intermediate state because the schema/handler/index are tightly coupled. The "incremental" framing applies to the FOLLOW-UP BIs that compose on `delete_note` (BI candidates: `restore_from_trash`, `batch_delete_notes`, `delete_folder` if Obsidian's CLI ships a folder-delete subcommand).

### Quality Gates (in order)

1. T012 — `npm run test` green; coverage ≥ 89.6%; greps pass; S-14 audit invariant test passes for all 6 combinations.
2. T013 — manual S-11 against Claude Desktop / MCP Inspector (including the SC-013 trash-volume-full probe in step 12); manual S-12 against Cowork.
3. T014 — Constitution Compliance checklist filled; SC-012 + SC-013 verification results captured.
4. PR opened, reviewed, merged.
5. T011's `0.2.5` version bump triggers an `npm publish` per the project release convention.

---

## Notes

- **[P] tasks** = different files, no dependencies on incomplete tasks in this list. Conservative reading; when in doubt, sequence them.
- **[Story] label** = the primary story this task delivers. The full story-to-test mapping lives in [spec.md FR-016](spec.md) so test cases can be read either by source-file (the implementation's organisation) or by user story (the spec's organisation).
- **No separate red-green TDD loop** — every task lands with its co-located tests in the same change; the verify-fails-first sanity check is captured manually once via T013 (deliberate revert on a scratch branch).
- **Commit cadence**: one task per commit. Subject per the project's `feat(012-delete-note): <task description>` convention; body cites task ID + sub-task IDs (e.g., `T003 (3a, 3b)`) + FR/SC/R references.
- **CLAUDE.md follow-up**: after this BI merges, the SPECKIT context block in [CLAUDE.md](../../CLAUDE.md) flips to point at the next active feature. Not part of this BI's task list — handled by the next feature's `/speckit-plan`.
- **Avoid**: vague tasks (every task here cites file + sub-tasks); cross-file conflicts (every task names its target files); skipping the SC-012 / SC-013 gates (T001 cases T0.7 + T0.8 are non-negotiable per spec.md).
