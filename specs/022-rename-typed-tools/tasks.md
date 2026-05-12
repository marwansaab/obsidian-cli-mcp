---

description: "Task list for 022-rename-typed-tools"
---

# Tasks: Rename Typed Tools to Match Upstream CLI Subcommand Names

**Input**: Design documents from `specs/022-rename-typed-tools/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Tests are explicitly part of this feature's deliverable — FR-018 (US5) IS a test artifact, and US4 requires new help-routing tests. Existing handler tests migrate with their renamed source directories and are NOT enumerated as separate test tasks.

**Organization**: Tasks are grouped by user story. Foundational rename mechanics (the five `git mv` operations + factory rename + server.ts wiring) are grouped under Phase 2 because every user story depends on them. Per-story tasks add the user-facing test assertions, the doc/CHANGELOG updates, and the durable registry-stability test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks
- **[Story]**: Maps to user stories from spec.md (US1 / US2 / US3 / US4 / US5)
- File paths are absolute under repo root unless prefixed with `./`

## Path Conventions

- Single TypeScript project; source under `src/`; co-located `*.test.ts` per Constitution Principle II.
- Per-tool dirs: `src/tools/<tool_name>/{schema, handler, index}.ts` + co-located tests.
- Docs: `docs/tools/<tool_name>.md` plus the aggregator `docs/tools/index.md`.
- The 5 renamed dirs are listed in [data-model.md §1](data-model.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pre-rename witnesses and verifying preconditions before mutations begin.

- [X] T001 Capture pre-rename `tools/list` witness by running `npm test` on the current branch tip (HEAD before T002..T006); record the resulting per-tool descriptor shape into a scratch file at `.scratch/pre-rename-tools.json` (NOT checked in, NOT in git). Purpose: gives /speckit-implement a "before" snapshot to compare against in the implementation commit messages. **Before writing the witness file, verify `.gitignore` contains a `.scratch/` line** (per /speckit-analyze U5 remediation 2026-05-12 — earlier task body assumed the exclusion existed). If absent, add `.scratch/` as a new line to `.gitignore` and commit that single-line addition as `chore(022-rename-typed-tools): gitignore .scratch/ for witness captures`. Then proceed with the witness capture.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The five source-directory renames + factory function renames + server.ts wiring + invariants-map sweep. Every user story depends on these completing. The build / test suite is broken in the middle of this phase between the `git mv` tasks and the wiring fixes — that is expected and resolved at T009.

**⚠️ CRITICAL**: User-story tasks (Phase 3+) MUST NOT begin until T009 confirms the test suite is green again.

- [X] T002 [P] Rename `src/tools/read_note/` → `src/tools/read/` via `git mv`. In the moved `index.ts`: rename `READ_NOTE_TOOL_NAME` → `READ_TOOL_NAME` and change its value from `"read_note"` to `"read"`; rename `READ_NOTE_DESCRIPTION` → `READ_DESCRIPTION` and update its body to reference `help({ tool_name: "read" })` instead of `help({ tool_name: "read_note" })`; rename factory function `createReadNoteTool` → `createReadTool`. Update the file's `// Original — no upstream.` header comment to mention `read` instead of `read_note`. In `schema.ts` rename the exported `readNoteInputSchema` → `readInputSchema`. In `handler.ts` keep the `executeReadNote` function name unchanged (FR-021's explicit enumeration covers factory functions only; handler-internal names are out of scope). In the three co-located test files (`schema.test.ts`, `handler.test.ts`, `index.test.ts`): update `describe(...)` block titles to use `read` instead of `read_note`; update import statements to use the new schema export name; update any factory invocation to use `createReadTool`.

- [X] T003 [P] Rename `src/tools/delete_note/` → `src/tools/delete/` via `git mv`. Apply the same pattern as T002: `DELETE_NOTE_TOOL_NAME` → `DELETE_TOOL_NAME` (value `"delete_note"` → `"delete"`); `DELETE_NOTE_DESCRIPTION` → `DELETE_DESCRIPTION` with body self-reference updated; factory `createDeleteNoteTool` → `createDeleteTool`; schema export `deleteNoteInputSchema` → `deleteInputSchema`; handler-internal names unchanged; three test files updated for `describe(...)` titles, imports, factory invocations.

- [X] T004 [P] Rename `src/tools/list_files/` → `src/tools/files/` via `git mv`. Apply the same pattern: `LIST_FILES_TOOL_NAME` → `FILES_TOOL_NAME` (value `"list_files"` → `"files"`); `LIST_FILES_DESCRIPTION` → `FILES_DESCRIPTION`; factory `createListFilesTool` → `createFilesTool`; schema export `listFilesInputSchema` → `filesInputSchema`; handler-internal names unchanged; three test files updated.

- [X] T005 [P] Rename `src/tools/write_property/` → `src/tools/set_property/` via `git mv`. Apply the same pattern: `WRITE_PROPERTY_TOOL_NAME` → `SET_PROPERTY_TOOL_NAME` (value `"write_property"` → `"set_property"`); `WRITE_PROPERTY_DESCRIPTION` → `SET_PROPERTY_DESCRIPTION`; factory `createWritePropertyTool` → `createSetPropertyTool`; schema export `writePropertyInputSchema` → `setPropertyInputSchema`; handler-internal names unchanged; three test files updated.

- [X] T006 [P] Rename `src/tools/rename_note/` → `src/tools/rename/` via `git mv`. Apply the same pattern: `RENAME_NOTE_TOOL_NAME` → `RENAME_TOOL_NAME` (value `"rename_note"` → `"rename"`); `RENAME_NOTE_DESCRIPTION` → `RENAME_DESCRIPTION`; factory `createRenameNoteTool` → `createRenameTool`; schema export `renameNoteInputSchema` → `renameInputSchema`; handler-internal names unchanged; three test files updated.

- [X] T007 Update `src/server.ts` import block and tools-array to use the five new factory names; re-sort both blocks alphabetical-by-factory-name per [data-model.md §2 + §3](data-model.md). Imports become: `createDeleteTool, createFilesTool, createFindByPropertyTool, createHelpTool, createObsidianExecTool, createReadHeadingTool, createReadPropertyTool, createReadTool, createRenameTool, createSetPropertyTool, createWriteNoteTool`. Tools-array mirrors that order. Path fragments in each `from "./tools/<name>/index.js"` import string update to the renamed dirs.

- [X] T008 Update `src/tools/_register.test.ts` invariants-map (lines ~253-326) — rename five keys: `read_note → read`, `delete_note → delete`, `list_files → files`, `write_property → set_property`, `rename_note → rename`. Keep the source order of the entries unchanged (avoids a misleading diff); only the key names change. Body of each entry (type / properties_equals_set / required_equals / additionalProperties) is byte-identical pre vs post. The derived `liveRegistryToolNames` array picks up the renamed keys automatically.

- [X] T009 Quality-gate checkpoint: run `npm run typecheck` and `npm test` — both MUST pass. The five renamed tools' input-schema invariants assertions exercised by `it.each(liveRegistryToolNames)` now drive against the new keys; the SDK round-trip drift detector confirms wire-side conformance. The existing handler tests under each renamed dir continue to pass with byte-identical assertions. Any test failure here MUST be diagnosed before Phase 3+ tasks begin.

**Checkpoint**: At end of T009, registry has the new names; existing test suite is green; baseline JSON file (T026) and migration documentation (T014..T022) have NOT yet landed. User-story tasks (Phase 3+) can now begin.

---

## Phase 3: User Story 1 — `tools/list` registry shape (Priority: P1) 🎯 MVP

**Goal**: Verify `tools/list` exposes the five new names (`read`, `delete`, `files`, `set_property`, `rename`) and contains none of the five retired names (`read_note`, `delete_note`, `list_files`, `write_property`, `rename_note`). Acceptance is the wrapper's public-surface promise to MCP clients.

**Independent Test**: Run `npm test -- _register.test.ts`. The existing `it.each(liveRegistryToolNames)` block exercises each new name; the new explicit absence assertion (added in T010) covers retired-name absence. All assertions pass against the registry produced by Phase 2.

### Implementation for User Story 1

- [X] T010 [US1] Add an explicit "no retired names" assertion to `src/tools/_register.test.ts` — a new `it("does NOT publish any retired tool name", ...)` block inside the existing `describe("registry: published inputSchema invariants (post-010)", ...)` section. Implementation: call `listToolsViaRegistry()`, extract `tools.map((t) => t.name)`, intersect with the literal array `["read_note", "delete_note", "list_files", "write_property", "rename_note"]`, expect the intersection to be empty. The failure message names which retired tools crept back in. Distinct from the eventual baseline-test Assertion 3 (T027) — this assertion lives in the existing drift-detector section because conceptually it is registry-shape, not baseline-snapshot.

**Checkpoint**: After T010, User Story 1 (P1 — surface change visible) is independently verifiable via `npm test`. Phase 4 work (US2 / behaviour preservation) can begin.

---

## Phase 4: User Story 2 — Behaviour preservation (Priority: P1)

**Goal**: Confirm that every renamed tool accepts the same inputs, returns the same output shape, and surfaces the same error codes as its pre-rename counterpart. Inheritance from Phase 2: the renamed tools' handler logic is byte-identical to pre-rename (only the factory-function exported name changed); their co-located handler / schema / index tests migrated with their dirs and their assertions are unchanged. This phase verifies no regressions slipped in.

**Independent Test**: Run `npm test -- src/tools/read/ src/tools/delete/ src/tools/files/ src/tools/set_property/ src/tools/rename/` and confirm every test passes. The handler-level pre-rename behaviour is preserved.

### Implementation for User Story 2

- [X] T011 [P] [US2] Sanity-audit pass on `src/tools/read/{schema,handler,index}.test.ts`: confirm `describe(...)` block titles use `read` (updated in T002), confirm test assertions are otherwise byte-identical to the pre-rename `src/tools/read_note/` versions (use `git log --follow -p src/tools/read/handler.test.ts` to verify the diff shows only `describe(...)` title changes and factory-name updates). Run the file's tests in isolation: `npm test -- src/tools/read/`.

- [X] T012 [P] [US2] Same audit on `src/tools/delete/{schema,handler,index}.test.ts`. Verify byte-equivalence-modulo-rename via `git log --follow -p src/tools/delete/`. Run `npm test -- src/tools/delete/`.

- [X] T013 [P] [US2] Same audit on `src/tools/files/{schema,handler,index}.test.ts`. Run `npm test -- src/tools/files/`.

- [X] T014 [P] [US2] Same audit on `src/tools/set_property/{schema,handler,index}.test.ts`. Run `npm test -- src/tools/set_property/`.

- [X] T015 [P] [US2] Same audit on `src/tools/rename/{schema,handler,index}.test.ts`. Run `npm test -- src/tools/rename/`.

**Checkpoint**: After T011..T015, the five renamed tools' migrated tests are confirmed to preserve pre-rename behaviour. US2 is independently verified.

---

## Phase 5: User Story 3 — Caller migration documentation (Priority: P2)

**Goal**: Ship the migration aids that MCP-client authors need to update their stored configurations — the doc-file renames, the docs/tools/index.md aggregator update, the README sweep, the CHANGELOG migration block, and the package.json version bump. After this phase, a caller reading the release artifacts can complete the migration in one pass.

**Independent Test**:
- `git grep -E '(read_note|delete_note|list_files|write_property|rename_note)' -- README.md docs/tools/index.md` returns zero matches.
- `ls docs/tools/{read,delete,files,set_property,rename}.md` succeeds; the five retired-name files do not exist.
- `CHANGELOG.md` top section is `## [0.5.0] - 2026-05-12` with the migration block listing all 5 mappings together.
- `node -p "require('./package.json').version"` returns `"0.5.0"`.

### Implementation for User Story 3

- [X] T016 [P] [US3] Rename `docs/tools/read_note.md` → `docs/tools/read.md` via `git mv`. In the moved file: update H1 title from `# read_note` (or equivalent) to `# read`; update any in-body self-reference (e.g. `help({ tool_name: "read_note" })` → `help({ tool_name: "read" })`) to the new name. Do NOT broaden filetype-scope language ("Markdown note", "note") — that is BI-060's concern per the spec's Out of Scope.

- [X] T017 [P] [US3] Rename `docs/tools/delete_note.md` → `docs/tools/delete.md` via `git mv` with the same body edits as T016.

- [X] T018 [P] [US3] Rename `docs/tools/list_files.md` → `docs/tools/files.md` via `git mv` with the same body edits.

- [X] T019 [P] [US3] Rename `docs/tools/write_property.md` → `docs/tools/set_property.md` via `git mv` with the same body edits.

- [X] T020 [P] [US3] Rename `docs/tools/rename_note.md` → `docs/tools/rename.md` via `git mv` with the same body edits.

- [X] T021 [US3] Update `docs/tools/index.md` aggregator: replace each retired-name entry row with its renamed counterpart; re-sort the entry table alphabetical-by-name if the file uses sorted ordering. Verify no retired-name references remain via `grep -E '(read_note|delete_note|list_files|write_property|rename_note)' docs/tools/index.md`. (Depends on T016..T020 having moved the files.)

- [X] T022 [US3] Update `README.md` tool-list section and any in-body cross-references: replace each retired-name occurrence with the new name. Verify no retired-name references remain via `grep -E '(read_note|delete_note|list_files|write_property|rename_note)' README.md`. Filetype-scope language preserved (BI-060's concern).

- [X] T023 [US3] Add a new `## [0.5.0] - 2026-05-12` section to the top of `CHANGELOG.md` per [contracts/changelog-migration-block.contract.md](contracts/changelog-migration-block.contract.md). The section MUST contain (in order): (1) a bolded MINOR-breaking headline paragraph naming the five renames in one sentence; (2) a `### Changed (BREAKING)` subsection with a single contiguous migration block listing all 5 old → new mappings in table form, the two-clause naming convention, caller migration instructions, the no-aliases stance, the `help` routing rule, and the BI-060 forward reference; (3) an `### Internal` subsection describing `src/tools/_register-baseline.json` + the FR-018 durable test; (4) a `### References` subsection linking spec / plan / research / data-model / quickstart / both contracts. No edits to the existing `## [0.4.4]` and prior sections.

- [X] T024 [US3] Bump `package.json` `version` field from `"0.4.4"` to `"0.5.0"`. No other fields touched. The MCP server's `server-info` handshake exposes this version at runtime via `createRequire(import.meta.url)("../package.json").version` in `src/server.ts`.

**Checkpoint**: After T024, callers have everything they need to migrate. US3 is independently verifiable via the four checks in the "Independent Test" criterion.

---

## Phase 6: User Story 4 — `help` routing (Priority: P2)

**Goal**: Verify the `help` tool returns the doc body for each new name and returns a tool-not-found error for each retired name. The help tool's lookup machinery is unchanged by this BI; what changes is the set of files it can resolve. After T016..T020 land, `docs/tools/<new>.md` exists for each new name; after T002..T008 land, the registered names match the new dir names; so the help routing flips naturally. This phase adds explicit per-name test assertions to lock that behaviour.

**Independent Test**: Run `npm test -- src/tools/help/handler.test.ts` and confirm both the new-name success cases and the retired-name tool-not-found cases pass.

### Implementation for User Story 4

- [X] T025 [US4] Add five new test cases to `src/tools/help/handler.test.ts` — one per new name (`read`, `delete`, `files`, `set_property`, `rename`) — asserting `help({ tool_name: <new_name> })` returns a non-error response whose `content[0].text` is the body of `docs/tools/<new_name>.md`. Implementation pattern: `it.each([...new names...])("returns body for %s", async (name) => { ... })` inside the existing describe block; reuse the existing fixture helper that exercises the doc-file lookup. **Additionally, add a single `it("catalogue listing reflects the renamed registry", ...)` case** that invokes `help()` with no arguments (or with whatever shape the existing `help` tool's no-args path uses) and asserts the returned catalogue contains all 5 new names (`read`, `delete`, `files`, `set_property`, `rename`) AND contains zero retired names (`read_note`, `delete_note`, `list_files`, `write_property`, `rename_note`). This explicit assertion closes FR-015 (`help` catalogue listing) per /speckit-analyze C1 remediation 2026-05-12 — previously the listing was implicitly verified by T032's typecheck alone. Depends on T016..T020 (doc files exist under new names) and T007 (server.ts registers the new names).

- [X] T026 [US4] Add five new test cases to `src/tools/help/handler.test.ts` — one per retired name (`read_note`, `delete_note`, `list_files`, `write_property`, `rename_note`) — asserting `help({ tool_name: <retired_name> })` returns a structured tool-not-found error matching the shape returned for any other unknown name (e.g. the orphan `append_note` stub already exercised by the existing test). Implementation pattern: `it.each([...retired names...])("rejects %s with tool-not-found", async (name) => { ... })`. The retired names MUST NOT alias to the renamed tools.

**Checkpoint**: After T026, US4 is independently verified.

---

## Phase 7: User Story 5 — Durable registry-stability test (Priority: P3)

**Goal**: Install the FR-018 permanent registry-stability gate. The test snapshots the live registry's `(name, descriptionFingerprint, schemaFingerprint)` triples against a checked-in JSON baseline at `src/tools/_register-baseline.json`. Future BIs that intentionally change the registry roll the baseline forward in the same commit. Accidental changes (typo renames, schema drift, description mutations) are caught at test time.

**Independent Test**: Run `npm test -- _register.test.ts` and confirm the new `describe("registry: stability baseline (FR-018)", ...)` block's three assertions all pass against the checked-in baseline. The tamper-test (T030) is a one-shot manual validation, not a permanent test.

### Implementation for User Story 5

- [X] T027 [US5] Implement fingerprint helper utilities in a new shared module `src/tools/_register-baseline.ts` (the module is consumed BOTH by `_register.test.ts` for FR-018 assertions AND by `scripts/write-register-baseline.ts` for baseline regeneration per T028 — sharing the canonicalisation logic across the two consumers prevents drift between the writer and the verifier). Module exports:
  - `function sha256(input: string): string` — wraps `node:crypto`'s `createHash("sha256").update(input, "utf8").digest("hex")`.
  - `function canonicalJSON(value: unknown): string` — per [contracts/registry-baseline.contract.md §3](contracts/registry-baseline.contract.md): object keys sorted lexicographically at every depth, no whitespace, arrays positional, RFC-8259 string escaping, no trailing newline. Recursively defined.
  - `async function fingerprintLiveRegistry(deps?: { createServer?: typeof import("../server.js").createServer }): Promise<Array<{name: string; descriptionFingerprint: string; schemaFingerprint: string}>>` — invokes `createServer({ registerSignalHandlers: false })`, extracts the `tools/list` handler via the same `_requestHandlers` reflection trick `_register.test.ts` already uses, computes both fingerprints per tool, sorts by `name`, returns the array. The optional `deps.createServer` injection point keeps the helper unit-testable without spinning up a real server.
  - Header: `// Original — no upstream. Fingerprint helpers for the FR-018 registry-stability baseline (BI-022).` (Constitution Principle V — Module without a header is a violation regardless of whether it is original.)
  - **Co-located test file** `src/tools/_register-baseline.test.ts` (NEW per Constitution Principle II — the new module is a "public" surface inside `src/tools/`, requires happy-path + boundary tests in the same change). Cases: `canonicalJSON` produces deterministic output for an object with shuffled keys (happy); `canonicalJSON` of an array preserves order (boundary); `sha256` is hex-64 (happy); `fingerprintLiveRegistry` returns 11 entries sorted by name (happy); two fingerprints differ when input differs by one character (boundary).

- [X] T028 [US5] Generate post-rename baseline values via a repeatable `npm run baseline:write` mechanism (locked at /speckit-analyze U6 remediation 2026-05-12 — earlier task body left the mechanism undecided). Implementation:
  - Add a new script `scripts/write-register-baseline.ts` that imports `createServer` + `fingerprintLiveRegistry`-equivalent logic (the helper lives in `_register.test.ts` per T027; for the script, extract the canonicalisation + fingerprint helpers into a small `src/tools/_register-baseline.ts` module that BOTH the script AND the test import — this avoids logic duplication). The module exports `sha256(input)`, `canonicalJSON(value)`, and `async fingerprintLiveRegistry(): Promise<BaselineEntry[]>`.
  - The script's body: `await fingerprintLiveRegistry()` → wrap in `{ schemaVersion: 1, generatedFromBranch: <git rev-parse --abbrev-ref HEAD>, generatedAt: <YYYY-MM-DD>, tools: [...] }` → `writeFileSync(...register-baseline.json..., JSON.stringify(payload, null, 2) + "\n", { encoding: "utf8" })`. Write with LF line endings explicitly (not CRLF — even on Windows hosts).
  - Add the wiring in `package.json`'s `scripts` block: `"baseline:write": "tsx scripts/write-register-baseline.ts"`. If `tsx` is not already a devDependency, use `node --experimental-strip-types` (Node 22.6+) instead — `engines.node` is `>=22.11` per the constitution so the strip-types path is available without new deps.
  - Run `npm run baseline:write` once after T002..T026 stabilise; commit the resulting `src/tools/_register-baseline.json` AND the wiring (`scripts/write-register-baseline.ts` + `package.json` script entry + `src/tools/_register-baseline.ts` helper module) in the same commit.
  - The shared helper module satisfies the FR-018 contract's "baseline-roll-forward protocol" (future BIs run `npm run baseline:write` after their registry change; the same script that produced this BI's baseline produces theirs).

- [X] T029 [US5] Add the `describe("registry: stability baseline (FR-018)", ...)` block to `src/tools/_register.test.ts` with the three assertions specified in [contracts/registry-baseline.contract.md §4](contracts/registry-baseline.contract.md):
  - Assertion 1 — `it("live registry fingerprints match the checked-in baseline", ...)`: load baseline JSON, call `fingerprintLiveRegistry()`, `expect(live).toEqual(baseline.tools)`.
  - Assertion 2 — `it("baseline file conforms to the documented schema", ...)`: verify `schemaVersion === 1`, `tools` is an array, every entry has `name: string` plus two 64-char hex fingerprints, and the array is sorted by `name`.
  - Assertion 3 — `it("baseline does NOT include any retired tool name", ...)`: assert the intersection with `["read_note", "delete_note", "list_files", "write_property", "rename_note"]` is empty.
  Add a baseline-reader helper `function readBaseline(): RegisterBaseline` that does `JSON.parse(readFileSync(resolve(__dirname, "_register-baseline.json"), "utf8"))` — the path resolves against the source-tree location, not `dist/`.

- [X] T030 [US5] One-shot tamper-test validation (NOT checked in). Manually mutate one byte of `src/tools/_register-baseline.json` (e.g. flip a hex digit in one tool's `schemaFingerprint`); run `npm test`; confirm Assertion 1 fails with a vitest deep-equality diff that names the mutated tool and shows the fingerprint mismatch. Revert the byte; tests pass again. Document the tamper-test outcome in the commit message that introduces T029 — record the failure message shape as evidence the FR-018 gate actually detects deviations.

**Checkpoint**: After T030, US5 is verified. The FR-018 gate is durable and protects the registry shape going forward.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verifications, full quality-gate run, sanity audits.

- [X] T031 Verify CLAUDE.md's active-narrative top block (rewritten at /speckit-plan time in commit d769fa8) accurately describes the SHIPPED state, not the planned state. Re-read the active block and confirm: the punch-list shows the 5 renames; the touch-surface block matches what landed (e.g., file paths, line counts of net change); the FR-018 architectural-addition block is consistent with the shipped baseline JSON shape; the "see also" links resolve to existing files in `specs/022-rename-typed-tools/`. Update any drifted phrasing.

- [X] T032 Full quality-gate run at branch tip:
  - `npm run lint` MUST pass with zero warnings (Constitution gate #1).
  - `npm run typecheck` MUST pass (gate #2).
  - `npm run build` MUST succeed (gate #3).
  - `npm test` MUST pass with the coverage threshold met (gate #4 + #5).
  - **Verify `src/errors.ts` byte-identical pre vs post rename** (per /speckit-analyze C3 remediation 2026-05-12 — automated check for FR-008 / SC-009 "no new error codes"). Run `git diff main -- src/errors.ts` and confirm the output is empty. If non-empty, inspect the diff — accidental error-code additions during the rename sweep would surface here even if `tsc` and tests pass. The check is cheap; the failure mode (a code review missed a new code) is what this guards against.
  Fix any failure here before submitting the PR. The most likely failure mode is a stale import in some untouched file referencing an old factory or schema name — `tsc` will catch this in T032; resolve and re-run.

- [X] T033 [P] Grep-verify no retired-name references in the in-scope files: `git grep -E '(read_note|delete_note|list_files|write_property|rename_note)' -- README.md docs/tools/ CLAUDE.md` returns zero matches (CLAUDE.md's active block uses new names by construction; predecessor narrative blocks reference retired names BUT only in the 021-rename-note predecessor block summary, which is historical — those references SHOULD remain). If unexpected matches surface in README or docs/tools/, investigate and fix.

- [X] T034 [P] Verify filesystem state: `ls docs/tools/{read,delete,files,set_property,rename}.md` succeeds for all 5; `ls docs/tools/{read_note,delete_note,list_files,write_property,rename_note}.md` fails for all 5. Plus `ls src/tools/{read,delete,files,set_property,rename}/` and reciprocal absence of the retired dir names.

- [X] T035 Run [quickstart.md](quickstart.md) Q-1..Q-12 verification matrix end-to-end. Q-8 (version-bump check), Q-9 (CHANGELOG block presence), Q-10 (grep cleanup), Q-11 (filesystem) are manual steps — execute each in order and confirm green. Q-1..Q-7, Q-12 are automated and already covered by `npm test`; re-confirm.

- [X] T036 PR-readiness: ensure the Constitution Compliance checklist in the PR description has all five principles marked `Y`. Principle I (modular per-surface), Principle II (co-located tests migrate; FR-018 net-add), Principle III (zod schemas byte-identical), Principle IV (zero new error codes), Principle V (Original-no-upstream headers survive). No Complexity Tracking entries needed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001)**: No dependencies; runs first.
- **Foundational (Phase 2, T002..T009)**: Depends on Setup completing. T002..T006 parallel-safe in file scope but test suite is broken between them and T007/T008. T009 is the green-checkpoint after T008.
- **User Stories (Phases 3..7, T010..T030)**: All depend on T009. Within Phases:
  - Phase 3 (US1, T010): can begin immediately after T009.
  - Phase 4 (US2, T011..T015): can begin after T009 in parallel with Phase 3.
  - Phase 5 (US3, T016..T024): doc-file renames (T016..T020) depend on T009; T021 depends on T016..T020; T022/T023/T024 independent of T016..T021.
  - Phase 6 (US4, T025..T026): T025 depends on T016..T020 (doc files exist under new names) AND T009; T026 depends on T009.
  - Phase 7 (US5, T027..T030): T027 depends on T009; T028 depends on T027 + all prior phases (baseline values reflect final registry state); T029 depends on T027 + T028; T030 depends on T029.
- **Polish (Phase 8, T031..T036)**: Depends on all user-story phases.

### User Story Dependencies

The five user stories share the foundational rename work but their VERIFICATION work is independent:

- **US1 (P1 — registry shape)**: T010 verifies. Can ship as soon as T009 + T010 land.
- **US2 (P1 — behaviour preservation)**: T011..T015 verify (audit of migrated tests). Independent of US1's verification work.
- **US3 (P2 — caller migration)**: T016..T024 implement and verify. Doc-file renames (T016..T020) parallel-safe across the 5 different doc files. T021..T024 each touch different files.
- **US4 (P2 — help routing)**: T025..T026 verify. Depend on US3's T016..T020 (the doc files exist under new names).
- **US5 (P3 — durable test)**: T027..T030 implement + verify. Depend on every prior phase because the baseline reflects the final shipped registry state.

### Within Each User Story

- US1: single task (T010); no internal ordering.
- US2: T011..T015 [P] across the 5 renamed tools — fully parallel.
- US3: T016..T020 [P]; then T021 (depends on T016..T020); T022/T023/T024 independent of each other and of T016..T021 (different files).
- US4: T025 depends on US3's doc renames; T026 independent.
- US5: T027 → T028 → T029 → T030 sequential.

### Parallel Opportunities

- T002..T006 (foundational renames) [P] — five `git mv` operations across distinct dirs.
- T011..T015 (US2 audit) [P] — five independent test-file audits.
- T016..T020 (US3 doc renames) [P] — five `git mv` operations across distinct doc files.
- T033, T034 (Polish grep + filesystem checks) [P] — different verifications.

---

## Parallel Example: User Story 2 audit

```bash
# After T009 green, fan out the US2 audits across the 5 renamed tools:
Task: T011 audit src/tools/read/ tests
Task: T012 audit src/tools/delete/ tests
Task: T013 audit src/tools/files/ tests
Task: T014 audit src/tools/set_property/ tests
Task: T015 audit src/tools/rename/ tests
```

## Parallel Example: User Story 3 doc renames

```bash
# After T009 green, fan out the doc-file renames:
Task: T016 git mv docs/tools/read_note.md → read.md + body edits
Task: T017 git mv docs/tools/delete_note.md → delete.md + body edits
Task: T018 git mv docs/tools/list_files.md → files.md + body edits
Task: T019 git mv docs/tools/write_property.md → set_property.md + body edits
Task: T020 git mv docs/tools/rename_note.md → rename.md + body edits

# Then T021 (depends on T016..T020 completing)
Task: T021 update docs/tools/index.md aggregator
```

---

## Implementation Strategy

### Sequential single-developer flow (recommended)

This BI is a mechanical rename sweep best done sequentially by a single developer in a single branch. The parallelism opportunities exist (per the [P] markers) but the per-task work is small enough that fan-out coordination overhead exceeds the wall-clock savings.

Recommended order:

1. T001 (scratch witness; optional).
2. T002, T003, T004, T005, T006 — one after the next; commit each as `feat(022-rename-typed-tools): rename <old>/ → <new>/` for git-blame friendliness.
3. T007, T008 — single commit `feat(022-rename-typed-tools): wire renamed factories into server + invariants drift detector`.
4. T009 quality-gate checkpoint.
5. T010 (US1) — quick win.
6. T011..T015 (US2 audits) — confirm green per migrated tool.
7. T016..T020 (US3 doc renames) — commit each as `docs(022-rename-typed-tools): rename <old>.md → <new>.md`.
8. T021 + T022 (index.md + README updates) — single commit `docs(022-rename-typed-tools): update README + docs aggregator with new tool names`.
9. T023 + T024 (CHANGELOG + version) — single commit `release(022-rename-typed-tools): 0.5.0 with migration block`.
10. T025 + T026 (US4 help routing tests) — single commit `feat(022-rename-typed-tools): help routing test cases for new + retired names`.
11. T027 + T028 + T029 (US5 FR-018 baseline + test) — single commit `feat(022-rename-typed-tools): durable registry-stability baseline + test (FR-018)`.
12. T030 tamper-test (note in T029's commit body; not a separate commit).
13. T031..T036 polish + final gate.

### MVP scope

The MVP for this BI is **all of Phase 2 + Phase 3 + Phase 4** (T001..T015). At that point:

- `tools/list` exposes the five new names and none of the retired.
- Renamed tools' behaviour is byte-identical to pre-rename.

That state alone delivers the headline value of the BI (the rename itself). US3 (docs + changelog + version), US4 (help routing tests), and US5 (durable FR-018 test) are migration aids and longevity machinery — important but not blocking the surface change.

In practice, no commit ships only the MVP — the rename release ships everything as one cohesive PR. The MVP framing is for partial-progress validation: at end of Phase 4 the developer can confirm the core BI works before continuing into the documentation / longevity phases.

---

## Notes

- This BI ships **NO new error codes** (FR-008). The set of `UpstreamError` codes each renamed tool can produce equals the set its pre-rename counterpart produced. Reviewers MUST flag any task that introduces a new code.
- This BI changes **NO schema field names** (FR-016). The `target_mode`, `vault`, `file`, `path`, `name`, `value`, `type`, `folder`, `ext`, `total`, `heading` field names survive verbatim. Reviewers MUST flag any task that renames a schema field.
- Handler-internal function names (`executeReadNote`, `executeDeleteNote`, etc.) are NOT renamed. FR-021 enumerates factory-function names only; handler-internal names are out of scope. Some path/identifier drift between `src/tools/read/handler.ts` and `executeReadNote` is accepted (the implementation rationale for keeping these stable: handler logic is an internal contract not tied to the public tool name, and renaming `executeReadNote` → `executeRead` would conflict with `executeReadHeading` / `executeReadProperty` naming when they sit alongside).
- Commit boundaries: prefer per-tool commits for T002..T006 and T016..T020 so git-blame on each renamed dir / doc points cleanly at the rename event. Other tasks consolidate by logical concern.
- The `CLAUDE.md` active-narrative top block was rewritten at /speckit-plan time (commit d769fa8). T031 verifies it matches the shipped state.
