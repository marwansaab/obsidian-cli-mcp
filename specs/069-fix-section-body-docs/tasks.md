---

description: "Task list for 069-fix-section-body-docs"
---

# Tasks: Fix Section-Body Documentation

**Input**: Design documents from `/specs/069-fix-section-body-docs/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: No automated test tasks. The 2026-10-31 clarification (Option A) and FR-011 make this change documentation-only; verification is the one-time live probe (FR-010) in Phase 2 plus the page checks in [contracts/doc-correction-contract.md](contracts/doc-correction-contract.md).

**Organization**: Tasks are grouped by user story. All three stories edit the same file, `docs/tools/read_heading.md`, so story phases run in sequence, not in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

Vault paths below are relative to the authorised test vault `TestVault-Obsidian-CLI-MCP` (location in `.memory/test-execution-instructions.md`). `<ts>` is one timestamp chosen in T003 and reused throughout.

---

## Phase 1: Setup

**Purpose**: Confirm the probe environment and a server build that serves the current `read_heading`.

- [X] T001 Read `.memory/test-execution-instructions.md` and confirm the probe rules: `TestVault-Obsidian-CLI-MCP` only, fixtures under `Sandbox/` only, never touch `Welcome.md` or the vault root, drive `Obsidian.com` (bare `obsidian`) and never `Obsidian.exe`, and clean up afterwards.
- [X] T002 Run `npm run build` at the repo root and record the branch and commit (`git rev-parse --short HEAD`) for `specs/069-fix-section-body-docs/contracts/t0-probe-findings.md`. Run `obsidian --version` (expect `Obsidian CLI`) and record its output. Confirm Obsidian is running with `TestVault-Obsidian-CLI-MCP` open, and that a client can call the built server's `read_heading` (the `obsidian-cli-mcp-local` MCP server, which runs this repo's `dist/index.js`, or an MCP stdio client against `node dist/index.js`). This branch changes no `src/**`, so a server started from the branch-point build serves the same runtime.

---

## Phase 2: Foundational — Live probe (blocks all user stories)

**Purpose**: Observe the real bodies the corrected help will describe (FR-010, SC-004, SC-005), following [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). The probe wins: any mismatch stops the work before any doc edit.

- [X] T003 List the vault's `Sandbox/` folder and keep the listing as the pre-run state. Pick `<ts>` (for example `20261031-1200`) and create `Sandbox/069-probe-<ts>/`.
- [X] T004 [P] Write fixture F1 `Sandbox/069-probe-<ts>/lf-layouts.md` straight to disk with LF endings and exact bytes `# Top\n## Blank\n\nBody text.\n## Direct\nBody text.\n## Empty\n## OnlyBlank\n\n## End\n` (no write tool, no BOM). In the same step, write the two last-line fixtures for probe P8, also LF: F5 `Sandbox/069-probe-<ts>/last-line-eol.md` with exact bytes `# Top\n## Last\n`, and F6 `Sandbox/069-probe-<ts>/last-line-noeol.md` with exact bytes `# Top\n## Last` (no trailing line ending). Read F6 back as bytes and confirm its last byte is `74` (`t`).
- [X] T005 [P] Write fixture F2 `Sandbox/069-probe-<ts>/crlf-layouts.md` straight to disk with CRLF endings and exact bytes `# Top\r\n## Blank\r\n\r\nBody text.\r\n## OnlyBlank\r\n\r\n## End\r\n` (no BOM). Read the file back as bytes and confirm every line ends in `0D 0A`.
- [X] T006 [P] Write fixture F3 `Sandbox/069-probe-<ts>/best-practices.md` straight to disk with LF endings and exact bytes `# Best Practices\n## Naming\nUse kebab-case.\n### Casing\nUse lowercase letters and dashes.\n`.
- [X] T007 [P] Write fixture F4 `Sandbox/069-probe-<ts>/active-example.md` straight to disk with LF endings and exact bytes `# Top\n## Section A\nHello.\n`.
- [X] T008 Wait until Obsidian has indexed F1–F6: call `outline` (`target_mode: "specific"`, `vault: "TestVault-Obsidian-CLI-MCP"`, `path` set to each fixture) and retry until each lists its headings.
- [X] T009 Run probe reads P1–P8 (eleven reads; P5, P6 and P8 are two each, including P8 `Top::Last` on F5 and F6) through the built server's `read_heading`, with `target_mode: "specific"`, `vault: "TestVault-Obsidian-CLI-MCP"`, and `path: "Sandbox/069-probe-<ts>/<fixture>.md"`, using the `heading` values in the probe table of `contracts/t0-probe-plan.md`. Capture each returned `content` JSON-escaped exactly (`\r` and `\n` visible).
- [X] T010 Write `specs/069-fix-section-body-docs/contracts/t0-probe-findings.md` using the evidence record in `data-model.md`: capture date, branch and commit (T002), `obsidian --version` output, the fixture byte layouts, and one row per read with probe ID, fixture, heading, expected `content`, observed `content`, and verdict. **Gate**: if any P1–P7 verdict is `mismatch`, stop. Record the observed output verbatim, do no further tasks, and report to the owner. P8 does not gate: if either P8 read is not `""`, mark E4's last-line clause for rewording to the observed bodies (P8 rule in `contracts/t0-probe-plan.md`) and note this in the findings.
- [X] T011 Delete `Sandbox/069-probe-<ts>/` and its six fixtures, then list `Sandbox/` again and confirm it matches the T003 listing and that `Welcome.md` is untouched. Record the cleanup result in `specs/069-fix-section-body-docs/contracts/t0-probe-findings.md`. If anything unexpected is present, stop and report rather than deleting unfamiliar files.

**Checkpoint**: P1–P7 match, and the P8 result fixes E4's last-line wording. The corrected wording in the contract is confirmed true.

---

## Phase 3: User Story 1 — Start of body described accurately (Priority: P1) 🎯 MVP

**Goal**: The help states exactly where the body starts: after the heading line, with its own line ending removed, and with a leading line break only when a blank line follows the heading. The empty case is still documented (FR-001 to FR-003, FR-005, FR-006).

**Independent Test**: Read `docs/tools/read_heading.md` and predict the first characters of the body for probes P1, P3, P4 and P5. Each prediction equals the observed body in `t0-probe-findings.md`.

- [X] T012 [US1] In `docs/tools/read_heading.md`, replace the "**Leading-newline caveat:**" paragraph in the Overview (edit E1 in `contracts/doc-correction-contract.md`) with the "**Where the body starts:**" paragraph.
- [X] T013 [US1] In `docs/tools/read_heading.md`, change the Output JSON block from `{ "content": "\nUse kebab-case.\n" }` to `{ "content": "Use kebab-case.\n" }` (E2). Replace the `content` row's description in the Output table with the E3 text.
- [X] T014 [US1] In `docs/tools/read_heading.md`, replace the empty-body paragraph under the Output table with the E4 text. It keeps the `{ "content": "" }` no-error statement and adds the heading-followed-only-by-a-blank-line case. Keep the "or the heading is the note's last line" clause only if both P8 reads returned `""`. Otherwise reword it to state the observed P8 bodies exactly.
- [X] T015 [US1] In `docs/tools/read_heading.md`, insert the "### Start of body" behavioural note with its five-row layout table (E5) directly before "### CRLF / LF line endings". Copy each row's `content` value from the observed bodies of P1–P5 in `contracts/t0-probe-findings.md`.

**Checkpoint**: US1's independent test passes. The page no longer tells agents to trim a leading character.

---

## Phase 4: User Story 2 — Line endings described accurately (Priority: P2)

**Goal**: The help states that line endings, including a leading blank line, come back exactly as stored, and describes the CRLF leading `\r\n` case (FR-004).

**Independent Test**: Read the page's "CRLF / LF line endings" note and the "Start of body" table. They predict `"\r\nBody text.\r\n"` for P2 and `"\nBody text.\n"` for P1, and both match `t0-probe-findings.md`.

- [X] T016 [US2] In `docs/tools/read_heading.md`, replace the "### CRLF / LF line endings" paragraph with the E6 text: a leading blank line keeps its stored line ending (`\r\n` in CRLF notes), and only the heading line's own ending, in either style, is removed.

**Checkpoint**: US1 and US2 both pass their independent tests.

---

## Phase 5: User Story 3 — No false caveat remains (Priority: P3)

**Goal**: No statement on the page claims the body always begins with a newline, and every worked example's body matches its stated note layout (FR-006, FR-007, SC-001, SC-002).

**Independent Test**: Run page checks 1–3 from `contracts/doc-correction-contract.md`. All pass.

- [X] T017 [US3] In `docs/tools/read_heading.md`, rewrite the result sentences of Examples 1, 2 and 3 per E7. Each states its note layout (text directly under the heading) and shows the body without a leading `\n`: `"Use kebab-case.\n"`, `"Use lowercase letters and dashes.\n"`, `"Hello.\n"`. Keep Example 3's `ERR_NO_ACTIVE_FILE` sentence and leave Examples 4 and 5 unchanged.
- [X] T018 [US3] Run page check 1 on `docs/tools/read_heading.md`: `Select-String -Path docs/tools/read_heading.md -Pattern 'always begins','Leading-newline','leading `\\n` byte','rim client-side'` must print nothing.
- [X] T019 [US3] Run page checks 2 and 3 on `docs/tools/read_heading.md`. List every shown `content` value. Only the E4 and E5 rows describing a blank line under the heading may begin with `\n` or `\r\n`. Each body in the Output block, the empty-body paragraph, the Start of body table, and Examples 1–3 must equal its probe's observed body in `contracts/t0-probe-findings.md` (P1–P8). No body claim on the page may lack a backing probe read.

**Checkpoint**: All three stories pass. The page reads true end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 Run page check 4: `git diff --stat main...HEAD` plus `git status --short` list only `docs/tools/read_heading.md`, files under `specs/069-fix-section-body-docs/`, `CLAUDE.md` (active-plan pointer) and `.specify/feature.json` (FR-011). Nothing under `src/**` and no `*.test.ts`. FR-009 check: confirm `git diff main...HEAD -- src/tools/read_heading/` is empty, so `READ_HEADING_DESCRIPTION` and `readHeadingOutputSchema` are unchanged and cannot contradict the corrected help.
- [X] T021 Call the `help` tool for `read_heading` (`help` reads `docs/tools/` at runtime via `DOCS_DIR` in `src/tools/help/handler.ts`) and confirm the returned text contains the new "Where the body starts" paragraph and the "Start of body" table.
- [X] T022 [P] Run `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` at the repo root, and confirm all pass with no changes to tests or the coverage threshold in `vitest.config.ts`.
- [X] T023 Post-implement structural check per `CLAUDE.md`, docs-only carve-out. Run `graphify update .` (AST-only). Checks 1–3 are trivially satisfied because no `src/**` changed. For check 4, confirm the new spec artifacts in `specs/069-fix-section-body-docs/contracts/` are not orphaned, and record the result, noting the trivial satisfaction of checks 1–3, at the end of `specs/069-fix-section-body-docs/contracts/t0-probe-findings.md`.
- [X] T024 Walk `specs/069-fix-section-body-docs/quickstart.md` sections 3–5 end to end and confirm each expected outcome. Mark SC-001 to SC-005 as met in the findings summary of `specs/069-fix-section-body-docs/contracts/t0-probe-findings.md`.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Probe (T003–T011)** → **US1 (T012–T015)** → **US2 (T016)** → **US3 (T017–T019)** → **Polish (T020–T024)**.
- The probe blocks every story: the T010 gate must pass before any edit to `docs/tools/read_heading.md`.
- The stories are independently testable but not parallel, because all edit `docs/tools/read_heading.md`. US2 and US3 add to the US1 page and do not depend on its wording beyond the shared file.
- T011 (cleanup) must follow T009 and T010, and must finish before Phase 3, so no fixture stays in the vault.
- T023 follows T020, so the graph update sees the final diff.

## Parallel Opportunities

- T004–T007: six independent fixture files (T004 writes three), which can be written together after T003.
- T022 can run alongside T021 (different tools, no shared state).
- Nothing else runs in parallel: every edit task targets the same file.

```text
# After T003, write all six fixtures at once:
T004 lf-layouts.md + last-line-eol.md + last-line-noeol.md   T005 crlf-layouts.md   T006 best-practices.md   T007 active-example.md
```

## Implementation Strategy

**MVP**: Setup, the probe, and US1 (T001–T015). This removes the harmful trimming advice and states the correct start-of-body rule, which is the whole defect.

**Incremental**: Add US2 (T016) for the CRLF wording, then US3 (T017–T019) to correct the examples and prove no stale claim remains, then Polish. Each checkpoint leaves the page true for what it covers.

## Notes

- **Graph path rule for `/speckit-tasks`**: N/A. This is a docs-only change; no task touches two source modules (`CLAUDE.md` carve-out).
- No `[P]` on edit tasks: they all change `docs/tools/read_heading.md`.
- No commits are listed here. Committing follows the PR lifecycle in `CLAUDE.md` (`/speckit-git-commit` after implement).
- The `.docs-as-code/` review of `capabilities/read.md` belongs to the PR's `/speckit-docs-as-code <n>` pass, not this task list.
