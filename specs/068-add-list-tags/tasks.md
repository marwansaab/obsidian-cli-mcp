---
description: "Task list for 068-add-list-tags (the `tags` typed tool)"
---

# Tasks: Add List Tags (`tags`)

**Input**: Design documents from `specs/068-add-list-tags/`: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).

**Tests**: REQUIRED. Spec FR-020 / FR-021 and Constitution Principle II apply. Each test title is prefixed with the criterion it locks (`AC n —`, `FR-0nn —`, `R3 —`). The full AC → test map is [contracts/tags-handler.contract.md](./contracts/tags-handler.contract.md) H6.

**Organization**: tasks are grouped by the spec's user stories:

| Story | Priority | Scope |
|---|---|---|
| US1 | P1 | vault-wide index |
| US2 | P1 | single note |
| US3 | P1 | ordering and counts |
| US4 | P1 | validation |
| US5 | P2 | help docs |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different file, no dependency on an incomplete task).
- **[Story]**: the user story the task serves.

## Conventions for every new file

- The first line is `// Original — no upstream. <one-line intent>.` (Principle V).
- Handler tests use `makeQueuedSpawn` / `silentLogger` / `captureRejection` from `src/tools/_handler-test-fixtures.ts`, plus `createQueue()` from `src/queue.ts`.
- Registration tests follow `src/tools/properties/index.test.ts`, including `__resetInFlightRegistryForTests` in `beforeEach` / `afterEach`.
- No real `obsidian` binary runs in CI. Only T001 and T024 run live, and both must follow `.memory/test-execution-instructions.md`.

---

## Phase 1: Setup (live re-check)

**Purpose**: confirm that the plan-stage F-series findings still hold before any code is written.

- [X] T001 Read `.memory/test-execution-instructions.md`, then re-run quickstart live probes L-1..L-9 (`specs/068-add-list-tags/quickstart.md`) as raw `obsidian vault=TestVault-Obsidian-CLI-MCP tags …` calls through `Obsidian.com`.
  - Seed fixtures under `Sandbox/068-t0/` as listed in the quickstart.
  - Compare each raw reply with research F2–F12. Pay particular attention to the JSON shape, string counts, the `No tags found.` sentinel, case-merge behaviour, hierarchical behaviour, and the three error replies.
  - Append a `## T0 live re-check (implement)` section to `specs/068-add-list-tags/research.md` recording matches or drift, including the L-9 outcome (specific-mode `activeOnly` against an unfocused vault, if a second vault can be opened).
  - Clean up `Sandbox/068-t0/`.
  - **STOP and amend spec/research if any finding drifted.**

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the schema and the boot-time doc file. Every story depends on the schema. `assertToolDocsExist` (called from `createServer()` in `src/server.ts`) throws at boot if `docs/tools/tags.md` is missing once the tool is registered.

- [X] T002 Create `src/tools/tags/schema.ts` per data-model §1–4 and research R4 / ADR-038.
  - `tagsInputSchema` = `targetModeBaseSchema.extend({ file: z.string().min(1).optional(), path: z.string().min(1).refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE).optional(), activeOnly: z.boolean().optional(), sortByCount: z.boolean().optional(), includeCounts: z.boolean().optional() })`.
  - Add a tool-local `.superRefine`. Do NOT use `applyTargetModeRefinement` or `applyTargetModeRefinementForFolderScoped`. The refinement enforces:
    - specific mode requires `vault` (issue path `["vault"]`, message `vault is required in specific mode`);
    - active mode forbids a non-undefined `vault` (`["vault"]`, `vault is not allowed in active mode`);
    - at most one of `file !== undefined` / `path !== undefined` / `activeOnly === true`, with one issue per offending key and message ``at most one of `file`, `path`, `activeOnly` may be set``.
  - Also export `tagEntrySchema`, `tagsOutputSchema`, `tagsUpstreamArraySchema` (`z.array(z.object({ tag: z.string(), count: z.string().optional() }).loose())`), and the `TagsInput` / `TagsOutput` / `TagEntry` types via `z.infer`.
  - Imports: `zod`, `../../target-mode/target-mode.js`, `../../path-safety/schema.js`.
- [X] T003 [P] Create the skeleton `docs/tools/tags.md`: the title `# \`tags\`` plus empty `## Overview`, `## Input contract`, `## Output shape`, `## Errors` and `## Examples` headings. This only satisfies `assertToolDocsExist`; T021 replaces it with the full document.

**Checkpoint**: `npm run typecheck` passes with the schema in place.

---

## Phase 3: User Story 1 — Vault-wide tag index with counts (Priority: P1) 🎯 MVP

**Goal**: `{ target_mode, vault }` returns `{ total, tags: [{ name, count }] }` for the whole vault through one native CLI call. The tool is registered and reachable over MCP.

**Independent Test**: offline quickstart Q-1, Q-7, Q-10 pass with the stubbed spawn, and `help({})` lists `tags`.

### Tests for User Story 1 (write first; they must fail until T005)

- [X] T004 [US1] Create `src/tools/tags/handler.test.ts` with the US1 cases. Test titles carry the AC / FR ids. Use the research F2 / F3 / F11 stdout shapes verbatim.
  - **AC 1 —** vault-wide JSON (`[{"tag":"#shared","count":"6"},…]`) → integer counts, names stripped of exactly one `#`, `total === tags.length`.
  - **H2 / R2 —** recorded argv contains `vault=<v>`, `tags`, `format=json` and `counts`, and does NOT contain `file=`, `path=`, `active`, `sort` or `total`. Exactly ONE spawn per request.
  - **US1 scenario 6 —** `{ target_mode: "active" }` (vault-wide in the focused vault) → recorded argv contains `tags`, `format=json` and `counts`, and contains NO `vault=`, `file=`, `path=` or `active`. The output is parsed exactly as in AC 1.
  - **AC 7 —** stdout `No tags found.` → `{ total: 0, tags: [] }`.
  - **AC 8 —** a stub reply equal to the live vault-wide reply for the F-series fixture (where `#fencedonly` exists only in a fence) has no `fencedonly` / `inlinecode` entry. The test comment names T001 / T024 as the live lock.
  - **AC 16 —** `todo`, `excalidraw`, `daily-note` are returned verbatim.
  - **FR-015 —** stdout `Vault not found.` → rejects with `UpstreamError` `CLI_REPORTED_ERROR` and `details.message === "Vault not found."`, never an empty list.
  - **FR-018 —** stdout over the cap → `CLI_OUTPUT_TOO_LARGE` (follow the existing cap test pattern in `src/tools/outline/handler.test.ts` or `properties/handler.test.ts`).
  - Parse failures → `CLI_REPORTED_ERROR` with `details.stage`:
    - non-JSON → `json-parse`;
    - `{"x":1}` → `shape-parse`;
    - `[{"tag":"#a","count":"x"}]` and `[{"tag":"#a"}]` → `count-parse`.
  - **FR-007 —** a frontmatter-origin `#hashfm` → `hashfm` (one `#` stripped, never two).
  - Non-ASCII `#café` / `#日本語` are passed through unchanged.

### Implementation for User Story 1

- [X] T005 [US1] Create `src/tools/tags/handler.ts` per data-model §5 and contracts H1–H4.
  - Export `ExecuteDeps` (`{ logger, queue, spawnFn?, env? }`), `NO_TAGS_SENTINEL = "No tags found."` and `executeTags(input: TagsInput, deps: ExecuteDeps): Promise<TagsOutput>`.
  - The function makes ONE `invokeCli({ command: "tags", target_mode: "specific", vault: input.vault, parameters: { format: "json" }, flags: ["counts"] }, deps)`. Add an inline comment citing ADR-038 and research R3: why `target_mode` is always `"specific"`.
  - Pipeline: trim → sentinel → `JSON.parse` (stage `json-parse`) → `tagsUpstreamArraySchema.safeParse` (stage `shape-parse`) → map (strip one `#`, strict `/^\d+$/` plus `Number.isSafeInteger` count parse, stage `count-parse` with `tag` / `count` in details) → `{ total, tags }`.
  - Every failure is an `UpstreamError` with `code` / `cause` / `details`.
  - Ordering, scope and `includeCounts` are added by US2 / US3.
- [X] T006 [US1] Create `src/tools/tags/index.ts`.
  - Export `TAGS_TOOL_NAME = "tags"`, `TAGS_DESCRIPTION`, `type RegisterDeps = ExecuteDeps`, and `createTagsTool(deps)` via `registerTool({ name, description, schema: tagsInputSchema, deps, handler: async (input, d) => executeTags(input, d) })`.
  - The description must:
    - state the output shape;
    - disambiguate `tags` (inventory) from `tag` (notes carrying one tag);
    - summarise the scope matrix (ADR-038);
    - say that counts are raw occurrences;
    - give the ordering rule;
    - list the error roster (contracts/tags-input.contract.md);
    - point to `help({ tool_name: "tags" })`.
  - Model it on `src/tools/properties/index.ts`.
- [X] T007 [US1] Register the tool in `src/server.ts`: add `import { createTagsTool } from "./tools/tags/index.js";` after the `createTagTool` import, and `createTagsTool({ logger, queue }),` immediately after `createTagTool({ logger, queue }),` in the tools array. Depends on T003 (doc presence at boot) and T006.
- [X] T008 [P] [US1] Add one catalogue line after the `tag` entry in `docs/tools/index.md`: `- **tags** — Return the vault's tag index, or one note's tag set, …`. Name the shape `{ total, tags: [{ name, count? }] }`, the scopes, the ordering, and the contrast with `tag`.
- [X] T009 [US1] Create `src/tools/tags/index.test.ts` with the US1 registration cases:
  - descriptor `name === "tags"`, and the description mentions `tag`;
  - the stripped JSON Schema has zero `description` keys (`countDescriptionKeys`, ADR-005);
  - **a VALID input (`{ target_mode: "specific", vault: "V" }`) with `makeQueuedSpawn([{ stdout: "No tags found.\n", exitCode: 0 }])` drives the closure to a success envelope `{ total: 0, tags: [] }`.**
- [X] T010 [US1] Run `npm run baseline:write` to roll `src/tools/_register-baseline.json` forward. Then run `npx vitest run src/tools/tags src/tools/_register.test.ts src/tools/_register-baseline.test.ts src/server.test.ts` and confirm it is green.

**Checkpoint**: MVP. A vault-wide listing works end to end over MCP.

---

## Phase 4: User Story 2 — Tags of a single note (Priority: P1)

**Goal**: the `file` / `path` / `activeOnly` scopes in both target modes, with a structured no-focused-note error.

**Independent Test**: quickstart Q-2, Q-3, Q-4, Q-9 and FR-016 pass offline.

### Tests for User Story 2

- [X] T011 [US2] Extend `src/tools/tags/handler.test.ts` with:
  - **AC 2 —** `file: "Alpha"` → argv contains `file=Alpha`; output from a note-scoped stub.
  - **AC 3 —** `path: "Sandbox/x/Alpha.md"` → argv `path=…`; output identical to AC 2 for the same stdout.
  - **AC 4 —** `{ target_mode: "active", activeOnly: true }` → argv contains the `active` flag and NO `vault=`.
  - **R3 / ADR-038 —** `{ target_mode: "active", file: "Alpha" }` → argv still contains `file=Alpha` (no silent locator strip) and no `vault=`.
  - Specific mode with `activeOnly: true` → argv contains both `vault=V` and `active`.
  - **AC 13 —** stdout `Error: No active file. Use file=<name> or path=<path> to specify a file.` → `UpstreamError` with code `ERR_NO_ACTIVE_FILE`. Its message mentions `file` and `path`, its `cause` is the original dispatch error, and `details.tool === "tags"` with the original details preserved.
  - **FR-016 —** stdout `Error: File "Missing" not found.` → `CLI_REPORTED_ERROR` (not an empty list).
  - A note-scoped `No tags found.` → `{ total: 0, tags: [] }` (spec US2 scenario 5).

### Implementation for User Story 2

- [X] T012 [US2] Update `executeTags` in `src/tools/tags/handler.ts`:
  - add `file` / `path` to `parameters` when defined;
  - append the `"active"` flag when `input.activeOnly === true`;
  - wrap the `invokeCli` call so that an `UpstreamError` with `code === "ERR_NO_ACTIVE_FILE"` is rethrown as a new `UpstreamError({ code: "ERR_NO_ACTIVE_FILE", cause: err, details: { ...err.details, tool: "tags" }, message: "No active file in Obsidian. Focus a note in the editor, or call tags with `file` or `path` instead of `activeOnly: true`." })`;
  - let every other error propagate unchanged (research R9, contracts H5).

**Checkpoint**: US1 and US2 tests are green.

---

## Phase 5: User Story 3 — Ordering and counts on or off (Priority: P1)

**Goal**: a deterministic wrapper-side order (Clarifications Q3) and names-only output.

**Independent Test**: quickstart Q-5 and Q-6 pass offline.

### Tests for User Story 3

- [X] T013 [US3] Extend `src/tools/tags/handler.test.ts` with:
  - **AC 5 (default) —** a note-scoped stub listing `#Banana`, `#aardvark`, `#Aardvark` in upstream order → `Aardvark, aardvark, Banana`. The upstream order is ignored: shuffle the stub.
  - **AC 5 (count) —** `sortByCount: true` with counts 6, 2, 2, 1 → count descending, with the tied pair ordered by the comparator (not upstream's order).
  - Non-ASCII is not folded: `É…` vs `e…` order follows UTF-8 bytes.
  - **AC 6 —** `includeCounts: false` → `Object.hasOwn(entry, "count") === false` for every entry, `total` unchanged, and argv STILL contains `counts` (R2).
  - `includeCounts: false` + `sortByCount: true` → still in count order (spec US3 scenario 4).
  - A direct unit test of the exported `compareTagNames`: it returns 0 only for identical strings, and is antisymmetric on sample pairs.

### Implementation for User Story 3

- [X] T014 [US3] Add to `src/tools/tags/handler.ts`:
  - an exported `compareTagNames(a, b)` per data-model §6: ASCII-only `A`–`Z` lower-fold primary key compared by UTF-8 bytes, with a byte-order tie-break on the original name. Use `Buffer.compare(Buffer.from(x, "utf8"), Buffer.from(y, "utf8"))`. Do NOT import `compareUtf8Bytes` from `src/tools/files/handler.ts` (research R7, Principle I);
  - the default sort, and with `sortByCount` a count-descending sort then `compareTagNames`;
  - `includeCounts` (default `true`) projection to `{ name }`.

**Checkpoint**: US1–US3 handler tests are green.

---

## Phase 6: User Story 4 — Malformed requests rejected before touching the vault (Priority: P1)

**Goal**: the boundary validation matrix (ADR-038 + FR-011 / FR-012), with zero CLI calls on failure.

**Independent Test**: quickstart Q-8 passes, and the spawn recorder sees 0 calls.

### Tests for User Story 4

- [X] T015 [P] [US4] Create `src/tools/tags/schema.test.ts`.
  - **Valid:**
    - specific + vault;
    - active with no vault;
    - each single scope in both modes;
    - `{ file, activeOnly: false }`;
    - all booleans explicit.
  - **AC 9 —** every pair and the triple of `file` / `path` / `activeOnly: true` fail, with an issue on each offending key.
  - **AC 10 —** specific without `vault` → issue path `["vault"]`.
  - **AC 12 —** active + `vault` → issue path `["vault"]`; active + `vault: undefined` passes.
  - **AC 11 —** an unknown top-level key fails.
  - **FR-012 —** each of these `path` values fails with `STRUCTURALLY_UNSAFE_PATH_MESSAGE`: `../x.md`, `a/../b.md`, `/x.md`, `\\x.md`, `C:/x.md`, `x\u0000.md`.
  - Empty `file` / `path` fail.
  - Wrong types fail (e.g. `activeOnly: "yes"`, `sortByCount: 1`).
  - `target_mode` missing or invalid fails.
- [X] T016 [US4] Extend `src/tools/tags/index.test.ts` through the registered tool's `handler` with a `makeQueuedSpawn` recorder:
  - **AC 11 (server-side pathway) —** `{ target_mode: "specific", vault: "V", bogus: 1 }` → `isError` envelope with `VALIDATION_ERROR` and 0 recorded spawns. The test title and a comment state the client-class distinction: clients that pre-validate against `additionalProperties: false` reject client-side and never reach the server (contracts client-class note).
  - **AC 9 —** `{ …, file: "A", path: "A.md" }` → `VALIDATION_ERROR`, 0 spawns.
  - **FR-012 —** `path: "../x.md"` → `VALIDATION_ERROR`, 0 spawns.
  - **AC 10 —** `{ target_mode: "specific" }` (no vault) → `VALIDATION_ERROR`, 0 spawns.
  - **AC 12 —** `{ target_mode: "active", vault: "V" }` → `VALIDATION_ERROR`, 0 spawns.
  - Together these cover every class in the SC-003 validation roster through the server-side pathway: scope pairs, missing vault, vault in active mode, unknown key, traversal path.

### Implementation for User Story 4

- [X] T017 [US4] Fix any gap in `src/tools/tags/schema.ts` that T015 / T016 reveal. The rules are owned by T002, so this task is normally a no-op confirmation. Record "no change needed" in the commit body if so.

**Checkpoint**: all P1 stories are green. The tool is shippable apart from documentation.

---

## Phase 7: User Story 5 — Self-serve documentation (Priority: P2)

**Goal**: a full help document served by `help({ tool_name: "tags" })` (AC 14, FR-019).

**Independent Test**: quickstart Q-12 passes, and `index.test.ts` asserts the document's completeness.

### Tests for User Story 5

- [X] T018 [US5] Extend `src/tools/tags/index.test.ts`. **AC 14 —** `docs/tools/tags.md` exists and contains:
  - the headings `## Input contract`, `## Output shape` and `## Errors` (the exact headings of the T003 skeleton, which T019 keeps);
  - a scope-semantics section;
  - at least four example headings, covering vault-wide, file-scoped, `sortByCount` and `activeOnly`;
  - the codes `VALIDATION_ERROR`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR` and `CLI_OUTPUT_TOO_LARGE`.

  Also assert that `docs/tools/index.md` contains `**tags**`. Follow the doc-completeness pattern in `src/tools/properties/index.test.ts`.

### Implementation for User Story 5

- [X] T019 [US5] Replace the skeleton `docs/tools/tags.md` with the full document. Model the structure on `docs/tools/tag.md` / `docs/tools/properties.md` and its content on `contracts/tags-input.contract.md`. It must cover:
  - **Overview**: inventory vs `tag`; native `tags` subcommand; one CLI call.
  - **Input contract**: a field table and the ADR-038 scope matrix, with active-mode `file` / `path` and specific-mode `activeOnly` semantics.
  - **Output shape**: bare names, integer counts, `includeCounts: false` omitting the key, `total`.
  - **Ordering rule**: Q3, with the `Aardvark, aardvark, Banana` example.
  - **Scope semantics inherited from upstream**: the table from contracts:
    - vault-wide case merge with first-encountered casing;
    - vault-wide implied ancestors with rolled-up counts vs per-note written-only;
    - code-block exclusion;
    - frontmatter plus inline tags;
    - non-ASCII;
    - counts are raw occurrences, unlike `tag`'s note count.
  - **Staleness window** (R10).
  - **Practical size ceiling**: use the R11 estimate until T024 replaces it, and note that `includeCounts: false` does not raise it.
  - **Error roster**, with recovery hints.
  - **Client-class note** for unknown keys.
  - **Out-of-scope table.**
  - **At least four worked examples**: vault-wide; file-scoped; `sortByCount` + names-only; `activeOnly`. Add an optional fifth for `path`.

**Checkpoint**: all stories are complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T020 [P] Check the attribution headers: every new file under `src/tools/tags/` starts with `// Original — no upstream.` (Principle V). Grep for it and fix any miss.
- [X] T021 Run the gate commands from quickstart: `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run` (the full suite plus the statements floor in `vitest.config.ts`). Then run `npx vitest run src/tools/tags` a second time unchanged (SC-002 / AC 15). Fix failures at the source; never weaken a test.
- [X] T022 Bump `package.json` `version` from 0.8.11 to 0.8.12 (a PATCH for an additive typed tool, per precedent). Add the release entry following the project's current release-note convention, and check `CHANGELOG.md` / README release notes for which one is live. The entry names `tags`, ADR-038, and zero new error codes.
  - `CHANGELOG.md`'s latest entry is 0.6.5, so before writing, run `git log --oneline --grep "chore(release)"` and look at how the most recent 0.8.x release recorded its notes. Follow that location.
  - If no live convention can be identified, add the 0.8.12 entry to `CHANGELOG.md` in Keep a Changelog form, and state the choice in the commit body.
- [X] T023 Post-implement structural verification (CLAUDE.md):
  - Run `graphify update .` (AST), then `/graphify --update` (semantic, run once).
  - Verify:
    1. no new error-class nodes outside the `src/errors.ts` community;
    2. no production import of `createLogger` / `createQueue` outside `server.ts`;
    3. `executeTags` lands in the runtime-spine handler community next to `executeProperties`;
    4. `src/tools/tags/{schema,handler,index}.ts` are connected (edges to `invokeCli`, `UpstreamError`, `targetModeBaseSchema`, `isStructurallySafePath`, `registerTool`).
  - Confirm the plan's frozen-surface claim holds: `git diff --stat main` shows no edits under `src/cli-adapter/`, `src/target-mode/`, `src/errors.ts`, `src/tools/_register*.ts` (except the baseline JSON) or other tool directories.
  - Record the results in `specs/068-add-list-tags/post-implement.md`.
- [X] T024 Run live validation quickstart L-1..L-10 against the built server (`node dist/index.js`, MCP client) on `TestVault-Obsidian-CLI-MCP`, following `.memory/test-execution-instructions.md`.
  - Generate the L-10 bulk fixture (2,000 unique tags; SC-006 needs at least 1,000) and confirm the vault-wide call succeeds.
  - Measure the average raw upstream response bytes per unique tag (total reply bytes ÷ entry count). Replace the estimate in `docs/tools/tags.md` with the derived ceiling (10 MiB cap ÷ measured bytes per tag), and label it as derived from the measurement (SC-006).
  - Record the L-9 outcome in the doc. If L-9 cannot be reproduced (for example, only one vault is open), the doc says the specific-mode `activeOnly` routing was not verified live, rather than asserting it (spec FR-003, Edge Cases / Targeting).
  - Clean up `Sandbox/068-t0/` and confirm `Sandbox/` is empty and `Welcome.md` is present.
  - Append the results to `specs/068-add-list-tags/post-implement.md`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** blocks everything: findings drift would change the design.
- **Foundational (T002, T003)** depends on T001 and blocks all stories. T003 must exist before T007 registers the tool, because `assertToolDocsExist` runs at boot.
- **US1 (T004–T010)** depends on Foundational. Its order is T004 → T005 → T006 → T007 → T009 → T010, with T008 in parallel.
- **US2 (T011–T012)** and **US3 (T013–T014)** each depend on T005, because they extend `handler.ts`. Both edit `handler.ts` and `handler.test.ts`, so run them **sequentially** (US2, then US3), not in parallel.
- **US4 (T015–T017)** depends on T002, and on T006 for T016. T015 can run in parallel with US2 / US3 because it is a different file.
- **US5 (T018–T019)** depends on T003, T006 and T008. It can run in parallel with US2–US4 because it is a different file, except T018, which edits `index.test.ts` and must follow T016.
- **Polish (T020–T024)** runs after all stories. T023 and T024 run after T021 is green.

### Structural dependency notes (graph-verified, `graphify path`, 2026-10-25)

- `createServer() → createXTool() → registerTool()` is a 2-hop boot-spine path. That makes T007 (the `server.ts` edit) structurally downstream of T006 (`index.ts`), and boot also requires T003, through the separate `assertToolDocsExist` call in `createServer()`. This is already reflected above.
- `invokeCli() → UpstreamError` is a 1-hop path. Handler tests that assert dispatch-classified codes (FR-015 / FR-016 / AC 13 / FR-018) rely on the frozen classifier inside `invokeCli` / `dispatchCli`. No task edits those, so the tests depend only on T005 / T012.
- `targetModeBaseSchema` and `isStructurallySafePath` have no directed path between them. They are joined only through consuming schemas (for example `append_note/schema.ts`), so T002 is the first file to import both together. No hidden ordering applies.
- `createServer() → invokeCli()` is a direct edge (the server's own boot-time CLI call). It is unrelated to this feature and not touched.

### Parallel opportunities

- T003 ∥ T002 (different files).
- T008 ∥ T004–T007.
- T015 ∥ US2 / US3 work.
- T019 (the doc body) ∥ US2–US4 code work.
- T020 ∥ T022.

## Parallel Example: after Foundational

```text
Agent A: T004 → T005 → T006 → T007 → T009 → T010   (US1 handler + registration)
Agent B: T008 (catalogue line), then T015 (schema tests)
Agent C: T019 (full help doc body; T018 test added after T016)
```

## Implementation Strategy

### MVP first

1. T001 live re-check, then T002 / T003.
2. US1 (T004–T010): vault-wide listing, registered, baseline rolled.
3. **Validate**: Q-1 / Q-7 / Q-10 offline, then a quick L-1 live check. This is a demonstrable increment.

### Incremental delivery

US2 (scopes), then US3 (ordering and counts), then US4 (validation tests), then US5 (docs), then Polish. Every phase ends green under `npx vitest run src/tools/tags`.

## Notes

- **Graph rule for `/speckit-tasks`**: the task list crosses two or more source modules (`src/tools/tags/*`, `src/server.ts`, `docs/tools/*`), so `graphify path` queries ran for each symbol pair touched by a task pair (see the structural dependency notes). No unreflected transitive dependency was found.
- **AC coverage**:
  - AC 1, 7, 8, 16 and US1 scenario 6: T004.
  - AC 2, 3, 4, 13: T011.
  - AC 5, 6: T013.
  - AC 9–12: T015 / T016.
  - AC 14: T018.
  - AC 15: T021.
  - FR-012: T015 / T016; FR-015 / 018: T004; FR-016: T011; R3: T011.
- Commit after each phase checkpoint. `/speckit-git-commit` drafts the conventional message.
- The PR lifecycle continues after T024: `/speckit-git-commit` → open PR → `/code-review` → `/speckit-docs-as-code <n>` (updates `.docs-as-code/capabilities/list-and-inventory.md` and the README inventory) → merge.
