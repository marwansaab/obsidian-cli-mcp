# Tasks: File Scope

**Input**: Design documents from `specs/066-file-scope/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)
**Governing decision**: [ADR-032](../../.decisions/ADR-032%20-%20Find%20And%20Replace%20File%20Scope%20via%20Sibling%20Locators.md)

**Tests**: REQUIRED. Constitution Principle II (Public Surface Test Coverage) is non-negotiable — a modified MCP tool ships happy-path + failure/boundary tests in the same change. Tests are co-located `*.test.ts` (unit-only per project convention; no separate TC files).

**This is a MODIFY-existing-tool feature** — `find_and_replace` already exists and is registered. No project init, no new tool, no `server.ts` registration change. All work is confined to `src/tools/find_and_replace/**` + the reused (not edited) `src/tools/_active-file.ts` + `docs/tools/find_and_replace.md` + the regenerated `_register-baseline.json` `find_and_replace` fingerprints.

> **Post-analyze remediation (2026-06-30)**: this task list was restructured after `/speckit-analyze` to (a) move the per-fork handler resolution into its owning story so each story is a real implementation increment (was: all forks bundled in Foundational) — U1; and (b) add the `PATH_ESCAPES_VAULT` named-path test (C1), the non-target-unchanged assertion under the open-note scope (G1), and the named-target + explicit-vault resolution test (G2). The `file+path` conflict (N1) is now in spec FR-002/FR-016 and remains in T015.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (user-story phases only)

---

## Phase 1: Setup & T0 Probes

**Purpose**: Pin the two resolution channels the design assumes before touching code. Both drive the production-resolved `Obsidian.com` shim (NOT the GUI `Obsidian.exe`) against the authorised TestVault scratch subdir, per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).

- [x] T001 [P] Run T0 probe P1 (focused bare-name `obsidian file file=<name>` resolution, shortest-unique-name) and record exit/stdout/stderr evidence in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) under a new "## P1 evidence" section.
- [x] T002 [P] Run T0 probe P2 (`obsidian eval` `FOCUSED_FILE_TEMPLATE` shape for a `.md` note open / a non-`.md` file active / nothing open) and record the `{path, base}` evidence in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) under a new "## P2 evidence" section; note whether a non-`.md` active view returns its path or `null` (decides whether the ineligible-active case surfaces `INVALID_NOTE`/`not-eligible` or `ERR_NO_ACTIVE_FILE`).

**Checkpoint**: resolution channels confirmed; the focused bare-name form (T001) and the active-file eligibility/no-file signals (T002) are pinned for the handler tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema + handler plumbing + surface substrate that ALL three stories build on. The per-fork resolution bodies are deliberately deferred to their stories (US1: path/file; US2: active); the scope-conflict `superRefine` is deferred to US3.

**⚠️ CRITICAL**: no user-story work begins until this phase completes.

- [x] T003 Add the three optional locator fields to `findAndReplaceInputSchema` in [src/tools/find_and_replace/schema.ts](../../src/tools/find_and_replace/schema.ts): `file` (`z.string().min(1)` + `isStructurallySafePath` + reject any value containing `[[` or `]]` using the cohort's `WIKILINK_BRACKET_REJECTION_MESSAGE`), `path` (`z.string().min(1)` + `isStructurallySafePath`), `active_note` (`z.boolean().optional().default(false)`); update the `// Original — no upstream.` header intent to mention the single-note scope. (Do NOT import `src/target-mode/target-mode.ts` — ADR-032 non-edge.)
- [x] T004 Add the scope-resolution plumbing to [src/tools/find_and_replace/handler.ts](../../src/tools/find_and_replace/handler.ts): the `ResolvedScope { vaultRoot, eligible, singleNote }` type; the `resolveSingleNoteScope` dispatch shell (route `executeFindAndReplace` to it when any of `file`/`path`/`active_note` is set, with per-fork branches stubbed for US1/US2 to fill); the shared `assertEligible` (`.md` + no dot-dir → else `INVALID_NOTE`/`not-eligible`) and `assertExists` (`realpath` ENOENT → `INVALID_NOTE`/`not-found` + `details.note`) helpers; and the `singleNote` commit re-scan reuse (reuse the resolved one-element `eligible`, no re-walk — research D8). The vault-wide / `subfolder` branch and Stages 4–7 (scan/bound/drift/atomic-write) are unchanged.
- [x] T005 Extend `mapZodIssuesToToolError` in [src/tools/find_and_replace/index.ts](../../src/tools/find_and_replace/index.ts) for the new field-level cases: `file` `[[…]]` reject → `VALIDATION_ERROR` via the standard channel (no sub-code, parity with `append_note`); structurally-unsafe `file`/`path` → `VALIDATION_ERROR` + `details.code:"INVALID_NOTE"` + `details.reason:"path-traversal"`. (SCOPE_CONFLICT mapping is added in T016.) (depends T003)
- [x] T006 Rewrite `FIND_AND_REPLACE_DESCRIPTION` in [src/tools/find_and_replace/index.ts](../../src/tools/find_and_replace/index.ts): remove the "WARNING — vault-wide scope, no single-file mode" / "There is NO single-file scoping option" text; document the single-note scope (`path` / `file` / `active_note`), the mutual-exclusivity rules, and the `INVALID_NOTE` / `SCOPE_CONFLICT` / `ERR_NO_ACTIVE_FILE` states. (same file as T005 → sequential)
- [x] T007 [P] Rewrite [docs/tools/find_and_replace.md](../../docs/tools/find_and_replace.md) to document the single-note scope (named `path`/`file` + `active_note`), the full error roster, and worked examples (named preview/commit, open-note, each error envelope). (different file — parallel with code tasks)
- [x] T008 Regenerate the `find_and_replace` entry in [src/tools/_register-baseline.json](../../src/tools/_register-baseline.json) (both `descriptionFingerprint` and `schemaFingerprint` move) and confirm NO other tool's fingerprints change. (depends T003, T006)

**Checkpoint**: schema carries the new fields; the handler has the dispatch shell + eligibility/existence helpers + commit re-scan reuse; the surface text + baseline reflect the scope. User stories can begin — each fills its fork.

---

## Phase 3: User Story 1 — Confine to a single named note (Priority: P1) 🎯 MVP

**Goal**: A caller names exactly one note (by vault-relative `path` or bare `file` name) and the operation touches only that note; the bracketed-link form is rejected; the affected-notes set is ≤ 1.

**Independent Test**: in a vault where a shared pattern spans several notes, scope to one named note (by `path`, then by `file`) for preview + commit; verify only that note is referenced/changed and every other note is byte/mtime-unchanged; verify `[[Note]]` is rejected and a zero-match named scope returns an empty success.

- [x] T009 [US1] Implement the named forks inside `resolveSingleNoteScope` in [src/tools/find_and_replace/handler.ts](../../src/tools/find_and_replace/handler.ts): `path` → existing vault-root resolve (`resolveVaultRootOrRemap` when `vault` named, else the existing focused-vault eval) + the given vault-relative path; `file` → same vault-root resolve + `resolveFileByTsv` (pass `input.vault` when named, else `resolveVaultDisplayName(deps.vaultRegistry, base)` per research D6). Each fork runs `assertCanonicalPath` (→ `PATH_ESCAPES_VAULT` on escape) then `assertEligible` + `assertExists`, emitting `eligible=[relPath]`. (depends T004)
- [x] T010 [P] [US1] Add validation tests to [src/tools/find_and_replace/schema.test.ts](../../src/tools/find_and_replace/schema.test.ts): `file`/`path` accepted (happy); `[[…]]` in `file` rejected; structurally-unsafe `file`/`path` rejected; an unscoped input (no new fields) still parses unchanged. (depends T003)
- [x] T011 [US1] Add named-scope handler tests to [src/tools/find_and_replace/handler.test.ts](../../src/tools/find_and_replace/handler.test.ts): named-`path` preview + commit (only the one note in `affected_notes`/`changed_notes`; **all other notes byte + mtime unchanged — SC-001**); named-`file` resolution via mocked `resolveFileByTsv`; **named-`path` + explicit `vault` resolves within the named vault — G2/FR-015 allow-case**; zero-match named scope → `{ affected_notes: [], total_occurrences: 0 }` success; affected-notes ≤ 1; ineligible named target (non-`.md` / dot-dir) → `INVALID_NOTE`/`not-eligible`; missing named note → `INVALID_NOTE`/`not-found`; **named-`path` whose canonical path escapes the vault (in-vault symlink) → `PATH_ESCAPES_VAULT` + `pathEscapeAttempt` event — C1/FR-013 Layer-2**. (depends T009)
- [x] T012 [P] [US1] Add index tests to [src/tools/find_and_replace/index.test.ts](../../src/tools/find_and_replace/index.test.ts): description advertises the `path`/`file` single-note scope; `mapZodIssuesToToolError` maps the `[[…]]` reject (standard channel) and the structural-unsafe `file`/`path` → `INVALID_NOTE`/`path-traversal`. (depends T005, T006)

**Checkpoint**: US1 is the MVP — a surgical single named-note edit works, the bracketed form is rejected, the canonical-escape boundary holds, and the blast radius is structurally one note. STOP and validate independently.

---

## Phase 4: User Story 2 — Confine to the currently-open note (Priority: P2)

**Goal**: A caller targets the open note via `active_note: true` (no path); the operation touches only the open note and reports its location; no note open → `ERR_NO_ACTIVE_FILE`.

**Independent Test**: open a known note, run `active_note: true` preview/commit, verify only that note is touched and its location is reported; close all notes and verify the no-active-note error with nothing read or changed.

- [x] T013 [US2] Implement the `active_note` fork inside `resolveSingleNoteScope` in [src/tools/find_and_replace/handler.ts](../../src/tools/find_and_replace/handler.ts): `resolveActiveFocusedFile(deps, "find_and_replace")` → `{ vaultRoot, relPath }` (throws `ERR_NO_ACTIVE_FILE` when none open); then `assertCanonicalPath` + `assertEligible` (+ `assertExists` defensively), emitting `eligible=[relPath]`. (depends T004; same file as T009 → sequential)
- [x] T014 [US2] Add open-note handler tests to [src/tools/find_and_replace/handler.test.ts](../../src/tools/find_and_replace/handler.test.ts): `active_note` preview + commit via mocked `resolveActiveFocusedFile` (the single entry's `path`/`changed_notes[0]` is the resolved open note; **only that note changes — all other notes byte + mtime unchanged, SC-001/G1**); no note open → `ERR_NO_ACTIVE_FILE` (nothing read or changed); ineligible active file (non-`.md`) handled per the T0 P2 outcome recorded in T002 (`INVALID_NOTE`/`not-eligible` OR `ERR_NO_ACTIVE_FILE`). (depends T013; same file as T011 → sequential)

**Checkpoint**: US1 AND US2 both work — named and open-note single-note scopes are independently functional.

---

## Phase 5: User Story 3 — Reject conflicting / unresolvable scopes (Priority: P3)

**Goal**: Conflicting scopes and a missing named note are rejected with typed errors before any note is read.

**Independent Test**: supply two scopes (both named forms; single-note + folder; open-note + named/folder/vault) and verify the right `SCOPE_CONFLICT` reason with nothing read; name a non-existent note and verify `INVALID_NOTE`/`not-found` with nothing changed.

- [x] T015 [US3] Add the scope mutual-exclusivity `superRefine` to [src/tools/find_and_replace/schema.ts](../../src/tools/find_and_replace/schema.ts): emit `custom` issues with `params: { subCode: "SCOPE_CONFLICT", subReason }` for `file+path`, `note+folder`, `active+note`, `active+folder`, `active+vault` per the [contracts/input.md](contracts/input.md) matrix (`vault` permitted with a named target; unscoped allowed). (same file as T003 → sequential)
- [x] T016 [US3] Extend `mapZodIssuesToToolError` in [src/tools/find_and_replace/index.ts](../../src/tools/find_and_replace/index.ts) to map any `custom` issue with `params.subCode === "SCOPE_CONFLICT"` → `VALIDATION_ERROR` + `details.code:"SCOPE_CONFLICT"` + `details.reason:<subReason>`. (depends T015; same file as T005/T006 → sequential)
- [x] T017 [US3] Add conflict + missing-note tests to [src/tools/find_and_replace/schema.test.ts](../../src/tools/find_and_replace/schema.test.ts) and [src/tools/find_and_replace/handler.test.ts](../../src/tools/find_and_replace/handler.test.ts): all five `SCOPE_CONFLICT` reasons (incl. `file+path`) reject at the schema boundary with the correct `(code, details.code, details.reason)`; missing named note → `INVALID_NOTE`/`not-found` naming the note (US3-AC4); assert nothing is read/changed on any conflict or missing-note rejection. (depends T015, T016; same files as T010/T011/T014 → sequential)
- [x] T018 [P] [US3] Add SCOPE_CONFLICT mapping coverage to [src/tools/find_and_replace/index.test.ts](../../src/tools/find_and_replace/index.test.ts). (depends T016; different file from T017)

**Checkpoint**: all three stories independently functional; the guard rails reject ambiguous/impossible requests before any read.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T019 [US3] Add backward-compatibility + guard regression tests to [src/tools/find_and_replace/handler.test.ts](../../src/tools/find_and_replace/handler.test.ts): unscoped vault-wide and `subfolder` paths produce byte-identical behaviour to pre-feature (FR-014 / SC-005); the safe-upper-bound (`OCCURRENCE_COUNT_EXCEEDED`) and drift (`OCCURRENCE_COUNT_DRIFT`) guards still fire under a single-note scope (FR-011). (depends T009, T013; same file as T011/T014/T017 → sequential)
- [x] T020 Run quality gates: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, and the Windows-safe coverage run (`mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism`); confirm the FR-018 registry-stability baseline test passes green with the regenerated `find_and_replace` fingerprints (T008).
- [x] T021 Validate [quickstart.md](quickstart.md) scenarios 1–18 against the authorised TestVault (drive `Obsidian.com` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md)); record any deviation.
- [x] T022 Post-implement structural verification: run `/graphify --update`, then confirm — (1) no new top-level error-class node outside `src/errors.ts` (new states are `details.*` sub-discriminators only); (2) `find_and_replace/schema.ts` still does NOT import `src/target-mode/target-mode.ts` (ADR-032 non-edge holds) and `handler.ts` imports no kernel DI factory (`createLogger`/`createQueue`/`createServer`) nor any sibling tool module; (3) the new symbols (`resolveSingleNoteScope` + helpers) land in the `find_and_replace` community; (4) only the `find_and_replace` baseline fingerprints moved. Record findings in the post-implement artifact.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T002)**: no dependencies; the two probes are parallel and pin the resolution channels the handler tests assert against.
- **Foundational (T003–T008)**: depends on Setup (the probe outcomes inform the forks). BLOCKS all user stories. Internal order: T003 → {T004, T005} ; T005 → T006 ; {T003, T006} → T008 ; T007 parallel throughout.
- **US1 (T009–T012)**: depends on Foundational. Fills the `path`/`file` forks (T009) + tests. The MVP.
- **US2 (T013–T014)**: depends on Foundational. Fills the `active_note` fork (T013) + tests. T013 shares `handler.ts` with T009 → sequence them.
- **US3 (T015–T018)**: depends on Foundational. Adds the conflict `superRefine` (additive rejection — US1/US2 happy paths unaffected by its absence).
- **Polish (T019–T022)**: depends on all stories complete.

### Story dependencies

- **US1 (P1)**: after Foundational. No dependency on US2/US3. Independently implementable (its forks land in T009) and testable.
- **US2 (P2)**: after Foundational. Independently implementable (its fork lands in T013) and testable. Shares `handler.ts`/`handler.test.ts` with US1 → coordinate or serialize the file edits.
- **US3 (P3)**: after Foundational. The conflict `superRefine` is additive rejection, so US3 can land last without breaking earlier stories.

### Parallelism reality (single-module modify)

Most tasks edit the same three files (`schema.ts`, `handler.ts`, `index.ts`) and three test files, so cross-task parallelism is limited — tasks on the same file are sequential. Genuine `[P]` opportunities: the two T0 probes (T001/T002); the docs rewrite (T007); the per-file test tasks relative to each other (`schema.test.ts` T010 / `index.test.ts` T012/T018). The handler fork tasks (T009 US1, T013 US2) share `handler.ts`, and the handler tests (T011/T014/T017/T019) share `handler.test.ts` → serialize those across stories.

## Parallel Example: Phase 1 + early Foundational

```text
# T0 probes together (different probe targets):
Task T001: focused bare-name obsidian-file resolution probe → contracts/t0-probe-plan.md
Task T002: focused-file eval shape probe → contracts/t0-probe-plan.md

# Docs alongside code once the schema shape is fixed (T003 done):
Task T007: rewrite docs/tools/find_and_replace.md   # different file from schema/handler/index
```

## Implementation Strategy

### MVP (US1 only)

1. Setup (T001–T002) → 2. Foundational (T003–T008) → 3. US1 (T009–T012) → STOP & validate the named single-note scope independently. This is the safety-critical core (FR-001) — shippable on its own.

### Incremental delivery

US1 (named scope, MVP) → US2 (open-note) → US3 (guard rails) → Polish. Each story now fills its own fork, so each is a genuine implementation increment that adds value without breaking the previous; the `superRefine` (US3) is additive rejection, so it lands last safely.

## Notes

- **Graphify cross-module check (per CLAUDE.md `/speckit-tasks` rule)**: the task list modifies ONE source module (`find_and_replace`) and reuses the already-imported shared helper `src/tools/_active-file.ts`. The structural path `find_and_replace/handler.ts → _active-file.ts` already exists (graph-confirmed at plan time — `_active-file.ts` has 11 production-handler consumers including this one; re-verified at HEAD during `/speckit-analyze`); T009/T013's added calls (`resolveActiveFocusedFile` / `resolveFileByTsv` / `resolveVaultDisplayName`) are new function-call uses within that existing edge, not a new module dependency. The one structural invariant a task must preserve is the **non-edge** `find_and_replace/schema.ts ↛ src/target-mode/target-mode.ts` (ADR-032), verified in T022.
- Tests are co-located unit tests (`*.test.ts`); no separate TC files (project convention).
- `_active-file.ts` is consumed as-is — do NOT edit it; if a focused bare-name resolution detail (D6) forces a shared-helper change, raise it before editing (it has 11 consumers).
- Commit after each task or logical group; the published-surface move (description + schema → baseline fingerprints) is expected and gated by the FR-018 test (T008 + T020).
- Verify each story's tests fail before the corresponding implementation where practical (each story now lands its fork before its tests, so red→green holds within the story).
