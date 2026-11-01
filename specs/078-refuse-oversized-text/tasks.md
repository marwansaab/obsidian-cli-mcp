---

description: "Task list for 078-refuse-oversized-text"
---

# Tasks: Refuse Oversized Text on Add-to-Top

**Input**: Design documents from `specs/078-refuse-oversized-text/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/prepend-size-limit-contract.md](contracts/prepend-size-limit-contract.md), [quickstart.md](quickstart.md)

**Tests**: required. Constitution Principle II (NON-NEGOTIABLE) requires happy-path and failure-or-boundary tests, co-located as `*.test.ts`, in the same change that modifies a tool. Spec FR-012 lists the required cases.

**Organization**: tasks are grouped by user story. The production change sits in `src/tools/prepend/schema.ts` (the limit) and `src/tools/prepend/index.ts` (the error mapping and the tool description). US1 carries the refusal. US2 and US3 add tests against it. US4 publishes the limit in the descriptions and docs.

Load the `karpathy-guidelines` skill before writing any code or test (user's global CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to (US1 to US4)

---

## Phase 1: Setup

**Purpose**: confirm a green starting point.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on branch `078-refuse-oversized-text` before any edit, and record any pre-existing failure so it is not later blamed on this change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the published constant every story reads (data-model R4).

- [X] T002 In `src/tools/prepend/schema.ts`, directly below `MAX_CONTENT_LENGTH`, add `export const MAX_CONTENT_BYTES = 3072;` with a comment stating: spec 078, the size limit in UTF-8 bytes (`Buffer.byteLength(content, "utf8")`), which is what spawn hands to Obsidian; the CLI fault depends on bytes, not characters (research F2); 3,072 keeps the ~1 KB headroom the character limit was chosen for (spec Clarifications); it is a separate constant from `MAX_CONTENT_LENGTH` on purpose (research D1). Do not change `MAX_CONTENT_LENGTH` or its comment.

**Checkpoint**: `npm run typecheck` passes; nothing reads the constant yet.

---

## Phase 3: User Story 1 — Oversized multi-byte text is refused up front (Priority: P1) 🎯 MVP

**Goal**: text within the character limit but over 3,072 UTF-8 bytes is refused during input validation with `VALIDATION_ERROR` / `details: { code: "CONTENT_TOO_LARGE", reason: "bytes", contentBytes, maxBytes }`, before target resolution, filesystem access or any Obsidian call, in specific and active mode, with and without `inline` (spec FR-001–FR-004; contract B1–B4, B11–B13).

**Independent Test**: through `createPrependTool(...).handler`, 1,500 × `中` returns the size-limit error exactly, and neither the vault registry, the fake fs nor the spawn function is touched.

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [X] T003 [P] [US1] Create `src/tools/prepend/index.byte-cap.test.ts` with header `// Original — no upstream. Spec 078 — prepend's size limit: content over MAX_CONTENT_BYTES UTF-8 bytes is refused during input validation as VALIDATION_ERROR / CONTENT_TOO_LARGE with details.reason "bytes", before anything reaches the vault or Obsidian; contract B1–B16.` Imports: `vitest` (`describe`, `expect`, `test`, `vi`); `createPrependTool` from `./index.js`; `MAX_CONTENT_BYTES`, `MAX_CONTENT_LENGTH` from `./schema.js`; `fakeFs` from `./_handler-fixtures.js`; `UpstreamError` from `../../errors.js`; `createQueue` from `../../queue.js`; `silentLogger` from `../_handler-test-fixtures.js`. Add a local `build()` returning `{ tool, resolveVaultPath, spawnFn, fs }`, where:
  - `resolveVaultPath = vi.fn(async () => { throw new UpstreamError({ code: "MARKER_PASSED_SCHEMA", cause: null, details: {} }); })`;
  - `spawnFn = vi.fn(() => { throw new Error("spawn must not be called"); })`;
  - `fs = fakeFs()`;
  - `tool = createPrependTool({ logger: silentLogger(), queue: createQueue(), vaultRegistry: { resolveVaultPath, resolveVaultDisplayName: () => null }, fs, spawnFn })`.

  Cast `spawnFn` if the `SpawnLike` type requires it. Add a helper `payloadOf(result)` that asserts `isError === true` and returns `JSON.parse(result.content[0]!.text)`. Add a helper `expectUntouched(b)` asserting `resolveVaultPath` and `spawnFn` were not called, and `fs.statCalls`, `fs.readCalls` and `fs.writes` are empty. In `describe("size limit refuses (spec 078 FR-001–FR-004)")`, add one test each for:
  - **B1**: `content: "中".repeat(1500)`, specific mode, vault `"TestVault"`, path `"n.md"`;
  - **B2**: B1 with `inline: true`;
  - **B3**: `target_mode: "active"` with `content` only;
  - **B4**: B1 with path `"Sandbox/missing.md"`;
  - **B11**: `"a".repeat(3071) + "é"`;
  - **B12**: `"😀".repeat(769)`;
  - **B13**: `"\uD800" + "a".repeat(3070)`;
  - **B16**: `"中".repeat(1023) + "\r\n" + "ab"` (CRLF counted as 2 bytes).

  Each test asserts that `payload` **toEqual** `{ code: "VALIDATION_ERROR", message: \`content exceeds maximum size of ${MAX_CONTENT_BYTES} UTF-8 bytes (got N)\`, details: { code: "CONTENT_TOO_LARGE", reason: "bytes", contentBytes: N, maxBytes: MAX_CONTENT_BYTES } }`, with N = 4500, 4500, 4500, 4500, 3073, 3076, 3073 and 3073 respectively, and calls `expectUntouched`. Also add one test asserting that B1 returns in under 1,000 ms of wall clock (spec SC-003).
- [X] T004 [P] [US1] In `src/tools/prepend/schema.test.ts`, inside `describe("prependInputSchema — CONTENT_TOO_LARGE (FR-018, NEW in BI-045)")`:
  - rewrite the test "multi-byte content exactly at cap (MAX_CONTENT_LENGTH UTF-16 code units of emojis) → ACCEPTED" (research F4). Rename it "multi-byte content at the character limit but over MAX_CONTENT_BYTES → REJECTED by the size limit (spec 078)". Keep `"🚀".repeat(MAX_CONTENT_LENGTH / 2)` (3,072 code units, 6,144 bytes). Expect `success === false`, exactly one issue on `content`, with `code === "custom"` and `(issue as { params?: { subReason?: string } }).params?.subReason === "bytes"`, and no `too_big` issue. Import `MAX_CONTENT_BYTES`.
  - add a new `describe("prependInputSchema — size limit (spec 078)")` with: `"中".repeat(1025)` (3,075 bytes) rejected with the single `custom` / `subReason: "bytes"` issue; `"a".repeat(3071) + "é"` rejected the same way; `"\uD800" + "a".repeat(3070)` rejected the same way; `"中".repeat(1023) + "\r\n" + "ab"` (3,073 bytes, CRLF counted as 2) rejected the same way.

### Implementation for User Story 1

- [X] T005 [US1] In `src/tools/prepend/schema.ts`, chain onto `content` after `.max(MAX_CONTENT_LENGTH)` and before `.describe(...)`: `.refine((value) => Buffer.byteLength(value, "utf8") <= MAX_CONTENT_BYTES, { message: \`content exceeds maximum size of ${MAX_CONTENT_BYTES} UTF-8 bytes\`, params: { subReason: "bytes" } })`. Above it, extend the FR-013 / FR-018 comment with one line: spec 078 — content over `MAX_CONTENT_BYTES` UTF-8 bytes raises a `custom` issue with `params.subReason: "bytes"`, mapped to `CONTENT_TOO_LARGE` / `reason: "bytes"` in `index.ts` (ADR-015). Do not change `.min`, `.max` or the description yet (T013). Depends on T002.
- [X] T006 [US1] In `src/tools/prepend/index.ts`, import `MAX_CONTENT_BYTES` from `./schema.js` and restructure `mapZodIssuesToToolError` (research D2, data-model R2):
  1. Compute `const content = typeof rawArgs === "object" && rawArgs !== null ? (rawArgs as { content?: unknown }).content : undefined;` once.
  2. Keep the existing `too_big` loop with its returned payload **unchanged byte for byte**. Use `content` for `contentLength` (same value as today).
  3. After that loop, add a second loop. For an issue with `issue.code === "custom" && issue.path[0] === "content" && (issue as { params?: { subReason?: string } }).params?.subReason === "bytes"`, set `contentBytes = typeof content === "string" ? Buffer.byteLength(content, "utf8") : 0` and return `{ code: "VALIDATION_ERROR", message: \`content exceeds maximum size of ${MAX_CONTENT_BYTES} UTF-8 bytes (got ${contentBytes})\`, details: { code: "CONTENT_TOO_LARGE", reason: "bytes", contentBytes, maxBytes: MAX_CONTENT_BYTES } }`.
  4. Leave the generic fallback unchanged.

  Update the comment above the loops: the character limit is checked across all issues first, so when both limits are broken the character-limit error wins whatever order Zod lists the issues in (spec 078 FR-005). Depends on T005.
- [X] T007 [US1] Run `npx vitest run src/tools/prepend` and confirm T003 and T004 now pass and every other prepend test still passes.

**Checkpoint**: the crash path is closed. Oversized multi-byte text never reaches Obsidian.

---

## Phase 4: User Story 2 — Text within the safe size is unaffected (Priority: P1)

**Goal**: text within both limits, in any script, passes validation and reaches the handler exactly as today (spec FR-006; contract B7–B10, B14, B15).

**Independent Test**: each in-limit payload gets past validation (the registry stub's `MARKER_PASSED_SCHEMA` comes back), and the existing prepend suites pass unchanged.

- [X] T008 [P] [US2] In `src/tools/prepend/index.byte-cap.test.ts`, add `describe("within both limits reaches the handler (spec 078 FR-006)")`. Include **B7** `"a".repeat(3072)`, **B8** `"中".repeat(1024)`, **B9** `"é".repeat(1536)`, **B10** `"😀".repeat(768)` , **B14** `"a".repeat(3000) + "中".repeat(24)` and **B15** `"a".repeat(3070) + "\r\n"` (CRLF boundary, 3,072 bytes), each in specific mode with vault `"TestVault"` and path `"n.md"`. For each, expect `payload.code === "MARKER_PASSED_SCHEMA"` and `resolveVaultPath` called once. Use `test.each`. Depends on T006.
- [X] T009 [P] [US2] In `src/tools/prepend/schema.test.ts`, inside the T004 `describe("prependInputSchema — size limit (spec 078)")`, add accepted cases: `"中".repeat(1024)`, `"é".repeat(1536)`, `"😀".repeat(768)`, `"a".repeat(3000) + "中".repeat(24)` and `"a".repeat(3070) + "\r\n"` (CRLF boundary) all parse with `success === true`. Depends on T005.
- [X] T010 [US2] Run `npx vitest run src/tools/prepend` and confirm `handler.test.ts`, `handler.bi047.test.ts`, `handler.empty-body.test.ts`, `handler.not-found.test.ts` and `handler.file-type.test.ts` pass with no edit (spec SC-004). Depends on T008, T009.

**Checkpoint**: no regression for in-limit text.

---

## Phase 5: User Story 3 — The two limits work together (Priority: P2)

**Goal**: over the character limit → the existing error, unchanged, even when the byte limit is also broken. Within the character limit but over bytes → the size-limit error. Both errors share `details.code` and differ by `details.reason` (spec FR-003, FR-005; contract B5, B6, §2).

**Independent Test**: B5 and B6 return the character-limit payload exactly as today (no `reason`). B1 returns the size-limit payload.

- [X] T011 [P] [US3] In `src/tools/prepend/index.byte-cap.test.ts`, add `describe("the two limits together (spec 078 FR-005)")`:
  - **B5** `"a".repeat(3073)`: payload **toEqual** `{ code: "VALIDATION_ERROR", message: \`content exceeds maximum length of ${MAX_CONTENT_LENGTH} UTF-16 code units (got 3073)\`, details: { code: "CONTENT_TOO_LARGE", contentLength: 3073, maxLength: MAX_CONTENT_LENGTH } }`, with no `reason` key;
  - **B6** `"🚀".repeat(1537)` (3,074 code units, 6,148 bytes, both limits broken): the same shape with `contentLength: 3074`;
  - one test that B1's and B5's payloads share `details.code` and that only B1's has `details.reason === "bytes"`.

  `expectUntouched` holds for all. Depends on T006.
- [X] T012 [P] [US3] In `src/tools/prepend/schema.test.ts`, inside the size-limit describe, add: `"🚀".repeat(1537)` yields both a `too_big` issue and a `custom` / `subReason: "bytes"` issue on `content` (research F3). This test records why the mapper must not rely on issue order. Depends on T005.

**Checkpoint**: precedence pinned.

---

## Phase 6: User Story 4 — Documentation explains the size limit (Priority: P3)

**Goal**: agents see the size limit before calling: in the `content` parameter description, the tool description and the reference docs, with the closed `reason` set (spec FR-008–FR-010; contract §2, §5).

**Independent Test**: the published `content` description and `PREPEND_DESCRIPTION` contain `MAX_CONTENT_BYTES` and "bytes"; `docs/tools/prepend.md` lists the `reason` set and explains non-Latin weighting; the baseline moves only for prepend.

- [X] T013 [US4] In `src/tools/prepend/schema.ts`, change the `content` `.describe(...)` to `` `Text to add at the top of the note (after any frontmatter), written byte-for-byte; 1 to ${MAX_CONTENT_LENGTH} characters and at most ${MAX_CONTENT_BYTES} bytes as UTF-8 (most non-Latin characters take 2 to 4 bytes).` `` (research D3). Depends on T005.
- [X] T014 [US4] In `src/tools/prepend/index.ts`, edit `PREPEND_DESCRIPTION` (research D3):
  - in the `write_note` paragraph, replace `use it for content > ${MAX_CONTENT_LENGTH} chars` with `use it for content over ${MAX_CONTENT_LENGTH} characters or ${MAX_CONTENT_BYTES} UTF-8 bytes`;
  - replace the Content paragraph with: `` Content: preserved byte-for-byte, non-empty, at most ${MAX_CONTENT_LENGTH} characters and ${MAX_CONTENT_BYTES} bytes as UTF-8; most non-Latin characters take 2 to 4 bytes, so ${MAX_CONTENT_BYTES / 3} CJK characters already reach the size limit. Over either limit fails fast with \`VALIDATION_ERROR\` / \`CONTENT_TOO_LARGE\` (\`details.reason: "bytes"\` for the size limit) before Obsidian is called. The limits are bounded by an upstream Obsidian CLI defect that hangs the host process around 4 KB on Windows; chunking does not help. ``

  The CJK example count is derived from `MAX_CONTENT_BYTES`, never hard-coded (analyze A1; FR-008). Update the comment above `PREPEND_DESCRIPTION` to say both constants are interpolated. Depends on T006.
- [X] T015 [P] [US4] In `src/tools/prepend/index.test.ts`, import `MAX_CONTENT_BYTES` and add:
  - "description names the size limit (spec 078 FR-009)": `tool.descriptor.description` contains `` `${MAX_CONTENT_BYTES} UTF-8 bytes` `` and `details.reason: "bytes"`;
  - "inputSchema.properties.content.description states both limits": it contains `String(MAX_CONTENT_LENGTH)`, `` `${MAX_CONTENT_BYTES} bytes as UTF-8` ``, and `maxLength` is still `MAX_CONTENT_LENGTH`.

  Depends on T013, T014.
- [X] T016 [P] [US4] In `docs/tools/prepend.md` (research D5, contract §1–§2):
  - routing table: "Prepend more than 3072 characters" → "Prepend more than 3072 characters or 3072 UTF-8 bytes";
  - Fields table `content` row: type cell `string, ≥ 1 char, ≤ 3072 UTF-16 code units and ≤ 3072 UTF-8 bytes`; notes cell adds "Non-Latin text counts more heavily towards the byte limit; see *Size ceiling*.";
  - Error states: keep the existing `CONTENT_TOO_LARGE` row's text and prefix its "What triggered it" with "(no `details.reason`)". Add directly below it a row: `VALIDATION_ERROR` | `details.code: CONTENT_TOO_LARGE`, `details.reason: "bytes"` | Content within 3072 characters but over 3072 UTF-8 bytes (typically non-Latin text: Chinese, Japanese, Korean, emoji). `details` carries `contentBytes` and `maxBytes`; the message is `content exceeds maximum size of 3072 UTF-8 bytes (got N)`. Raised before Obsidian is called; nothing is changed. | Use [`write_note`](./write_note.md) for larger payloads. See *Size ceiling*.;
  - directly under the Error states table, add a short "**`CONTENT_TOO_LARGE` sub-states (ADR-015)**" list giving the closed set: no `reason` = character limit (`contentLength`, `maxLength`); `reason: "bytes"` = size limit (`contentBytes`, `maxBytes`). When both are exceeded, the character-limit error is returned;
  - *Size ceiling*: retitle the opening bold sentence to cover both limits ("Two caps of 3072: UTF-16 code units and UTF-8 bytes."). Keep the existing defect paragraphs. Add a paragraph explaining that the defect depends on bytes, and that each character takes 1 byte (ASCII), 2 bytes (accented Latin, Greek, Cyrillic, Arabic, Hebrew), 3 bytes (Chinese, Japanese, Korean and most other scripts) or 4 bytes (emoji), so 1,024 CJK characters or 768 emoji reach the byte cap. Mention that the byte cap keeps the same ~1 KB headroom the character cap was chosen for (spec 078). Update the enforcement sentence to say both caps are enforced at the schema layer and surface as `(VALIDATION_ERROR, CONTENT_TOO_LARGE)`, with `reason: "bytes"` for the byte cap, before any spawn;
  - Out of scope: "Content larger than 3072 UTF-16 code units or 3072 UTF-8 bytes → use `write_note`".
- [X] T017 [P] [US4] In `docs/tools/index.md` line 26 (prepend), change "Content cap 3072 UTF-16 code units (lowered from 24576 in BI-047 …; use `write_note` for longer content)" to "Content cap 3072 UTF-16 code units and 3072 UTF-8 bytes (lowered from 24576 in BI-047 after larger writes left the Obsidian GUI degraded; the byte cap from spec 078 keeps non-Latin text under the same limit; use `write_note` for longer content)". Leave the rest of the line as it is.
- [X] T018 [US4] Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Expect only prepend's `descriptionFingerprint` and `schemaFingerprint` to change (contract §5; quickstart §2). If any other entry moves, stop and investigate. Keep the regenerated file for the commit. Depends on T013, T014.

**Checkpoint**: the limit is visible before calling; the fingerprint gate is reviewed and green.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T019 [P] Update the header intent lines (Principle V; plan Constitution Check V):
  - `src/tools/prepend/schema.ts` line 1: correct the stale "content max-length 24576 UTF-16 code units" to 3072, and add "; spec 078: content also capped at MAX_CONTENT_BYTES (3072) UTF-8 bytes via a refine whose custom issue carries params.subReason "bytes"";
  - `src/tools/prepend/index.ts` line 1: add that the hook also maps the byte-cap issue to `CONTENT_TOO_LARGE` with `details.reason: "bytes"` + `contentBytes` + `maxBytes`, and that the character-limit error takes precedence (spec 078).

  Keep the rest of each header unchanged.
- [X] T020 [P] In `CHANGELOG.md` `[Unreleased]`:
  - add a `Spec 078-refuse-oversized-text.` line after `Spec 077-fix-prepend-not-found.`;
  - under `### Changed`, add the entry "**`prepend` refuses content over 3072 UTF-8 bytes** (spec 078). Content within the 3072-character limit but over 3072 bytes, typically non-Latin text (1,024 CJK characters or 768 emoji reach it), is refused before Obsidian is called with `VALIDATION_ERROR`, `details.code: CONTENT_TOO_LARGE`, `details.reason: "bytes"`, `contentBytes` and `maxBytes`, instead of reaching the Obsidian CLI defect that crashes Obsidian. The character-limit error is unchanged and still has no `reason`. Some non-Latin calls between 3072 bytes and about 4 KB that succeeded before are now refused; use `write_note` for them.".

  Follow the file's existing heading layout.
- [X] T021 Run `npm run typecheck`, `npm run lint`, `npm run format:check` (format only the files this BI touched if needed) and `npm test` (coverage threshold included). Depends on T001–T020.
- [X] T022 Post-implement structural verification per CLAUDE.md (plan "CodeGraph structural check"). Run `codegraph sync`, then `codegraph_explore "MAX_CONTENT_BYTES mapZodIssuesToToolError prependInputSchema createPrependTool"`, and confirm:
  1. `src/errors.ts` is unchanged, with no new error class, top-level code or `details.code`;
  2. no handler imports `createLogger` / `createQueue`, and `server.ts` is unchanged;
  3. `MAX_CONTENT_BYTES` is imported only by `prepend/index.ts` and prepend tests, with no tool→tool production import;
  4. the byte branch is reachable from `createPrependTool` → `createServer`, and `src/tools/prepend/handler.ts` is unchanged.

  Record the result for the PR description's Constitution Compliance section (ADR-015: Y). Depends on T021.
  - **Result (2026-11-01)**: all four hold after `codegraph sync`. `git diff` is empty for `src/errors.ts`, `src/server.ts`, `src/tools/_register.ts` and `src/tools/prepend/handler.ts`. `MAX_CONTENT_BYTES` (`prepend/schema.ts`) is referenced only by `prepend/schema.ts`, `prepend/index.ts` and the prepend tests. `createPrependTool` (which registers the byte branch of `mapZodIssuesToToolError`) is called by `src/server.ts` and `_typed-result-fixtures.ts`. Baseline: only prepend's `descriptionFingerprint` and `schemaFingerprint` moved. Full gate: typecheck and lint clean, 3599 tests passed (6 skipped), statements 96.91%.
- [X] T023 Live check per [quickstart.md](quickstart.md) §3, after reading `.memory/test-execution-instructions.md`. First confirm `TestVault-Obsidian-CLI-MCP` is the vault open in Obsidian (`obsidian eval code="app.vault.getName()"`); if it is not, stop and report instead of running any write. Run steps 1–7 against `Sandbox/078-<run>/` (step 5 is the mixed-script case). Quote every failure verbatim. Record whether any crash dialog appeared (spec FR-013, SC-001, SC-006). Clean up the run folder. Do **not** send oversized content to Obsidian directly through `Obsidian.com`: it would trigger the very crash this BI prevents. Depends on T021.
  - **Result (2026-11-01, run `20261101134536`)**: open vault confirmed (`=> TestVault-Obsidian-CLI-MCP`). Through the built server over stdio:
    - step 1: seeded `"abc\n"` (4 bytes) with `write_note`;
    - step 2 (B1): 1,500 × `中` returned `isError: true` in 1 ms with `{"code":"VALIDATION_ERROR","message":"content exceeds maximum size of 3072 UTF-8 bytes (got 4500)","details":{"code":"CONTENT_TOO_LARGE","reason":"bytes","contentBytes":4500,"maxBytes":3072}}`. The note bytes were unchanged, and a following `read` through Obsidian returned `"abc\n"` in 78 ms;
    - step 3 (B8): 1,024 × `中` succeeded with `bytes_written: 3073`, and the note was exactly the 1,024 characters + `"\n"` + `"abc\n"`;
    - step 4 (B7): 3,072 × `a` succeeded with `bytes_written: 3073`;
    - step 5 (B14, mixed script): succeeded with `bytes_written: 3073`;
    - step 6 (B5): 3,073 × `a` returned the unchanged character-limit error (`content exceeds maximum length of 3072 UTF-16 code units (got 3073)`, `details: { code: "CONTENT_TOO_LARGE", contentLength: 3073, maxLength: 3072 }`), and the note was unchanged;
    - the final note matched the expected layering (9,223 bytes).

    After the run, `obsidian eval` still answered `=> TestVault-Obsidian-CLI-MCP`. The probe ran unattended, so the absence of a crash dialog was not seen on screen. It is inferred from the refused call never spawning Obsidian (unit tests B1–B4 assert no spawn) and from Obsidian answering every later request. An earlier attempt (run `20261101134522`) stopped after its seed step on a probe-script path bug. Both run folders were deleted; `Sandbox/` matches its pre-run listing and `Welcome.md` is intact.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: T002 after T001.
- **US1 (Phase 3)**: T003 and T004 (different files) in parallel after T002. Then T005 → T006 → T007 in order (T006 imports what T005's file exports).
- **US2 (Phase 4)**: T008 after T006 and T009 after T005; they touch different files, so they can run in parallel. T010 after both.
- **US3 (Phase 5)**: T011 after T006 and T012 after T005, in parallel. They add to the same test files as T008/T009, so do not edit one file from two tasks at once.
- **US4 (Phase 6)**: T013 after T005 (same file). T014 after T006 (same file). T015 after T013–T014. T016 and T017 any time, in parallel. T018 after T013–T014.
- **Polish (Phase 7)**: T019 after T013–T014 (same files). T020 any time. T021 after all others. T022 and T023 after T021.

### User Story Dependencies

- **US1 (P1)**: carries the refusal. Depends only on T002.
- **US2 (P1)**, **US3 (P2)**: test-only; depend on US1's implementation, independent of each other.
- **US4 (P3)**: description and docs; depends on US1's constant and mapper only for interpolation and accuracy.

### Parallel Opportunities

- T003 (`index.byte-cap.test.ts`) ‖ T004 (`schema.test.ts`).
- T008 ‖ T009; T011 ‖ T012 (each pair spans the two test files).
- T016 (`docs/tools/prepend.md`) ‖ T017 (`docs/tools/index.md`) ‖ T020 (`CHANGELOG.md`) ‖ any test task.

---

## Parallel Example: User Story 1

```text
Task: "T003 Create src/tools/prepend/index.byte-cap.test.ts (B1–B4, B11–B13 through the registered handler)"
Task: "T004 Rewrite the emoji-at-cap test and add size-limit rejections in src/tools/prepend/schema.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001, T002.
2. T003–T004 (tests fail).
3. T005–T006 (tests pass), T007.
4. **Stop and validate**: 1,500 CJK characters are refused with `CONTENT_TOO_LARGE` / `reason: "bytes"`, and nothing reaches Obsidian.

### Incremental Delivery

US1 closes the crash path. US2 and US3 pin the boundaries and the precedence. US4 publishes the limit, so agents avoid the refusal instead of only recovering from it. Polish verifies the gate, the structure and the live behaviour. All of it ships in one PR.

---

## Notes

- **CodeGraph task-pair check (CLAUDE.md `/speckit-tasks` rule)**: the production tasks touch two files of one tool module. The one cross-file pair, `prependInputSchema` / `MAX_CONTENT_BYTES` (T005, T013 in `schema.ts`) and `mapZodIssuesToToolError` / `PREPEND_DESCRIPTION` (T006, T014 in `index.ts`), was checked with `codegraph_explore "prependInputSchema mapZodIssuesToToolError registerTool toValidationError"`. The path is `registerTool` → its `handler` → `toValidationError` → the `mapValidationError` hook (`mapZodIssuesToToolError`) on a `ZodError` from `prependInputSchema.parse`, and `index.ts` imports `schema.ts`. The task graph already orders T005 before T006 and T013 before T014/T015. No further dependency note is needed.
- No edit to `src/tools/prepend/handler.ts`, `src/tools/prepend/_handler-fixtures.ts`, `src/tools/_register.ts`, `src/tools/_shared.ts`, `src/errors.ts`, `src/cli-adapter/**`, `src/server.ts`, `src/tools/create_base/**` or any other tool module (plan Constraints).
- `.docs-as-code/` is updated later by `/speckit-docs-as-code <n>`, not in these tasks.
- **Analyze remediation (2026-11-01, owner-approved)**: U1 (research F2 now cites BI-0123 History as the direct multi-byte evidence and BI-0120 for the character cap), I1 (research D4 range), I2 (plan Testing line), A1 (T014's CJK example derived from `MAX_CONTENT_BYTES`), C2 (quickstart §3 step 5, mixed script) and the CRLF half of C1 (contract B15/B16; T003, T004, T008, T009) are applied. The `.canvas` half of C1 is deliberately not added: non-`.md` file types are BI-0060's scope, and the size check runs before file-type resolution in every case, so the spec's "non-note file" edge case holds structurally.
- Commit after each phase or logical group.
