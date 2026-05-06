---
description: "Task list for 009-fix-inputschema-publication — Fix Empty Published `inputSchema` for `targetModeSchema` Consumers"
---

# Tasks: Fix Empty Published `inputSchema` for `targetModeSchema` Consumers

**Input**: Design documents from [`/specs/009-fix-inputschema-publication/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test cases in the same task. Verify-fails-first is captured exactly once, manually, by T008 (the SC-010 one-time revert check on the implementer's machine).

**Organization**: Tasks are grouped by user story to enable independent verification. The widening in [src/tools/_shared.ts](../../src/tools/_shared.ts) is the foundational prerequisite for ALL three user stories (US1: `read_note` callable; US2: Pattern (a)/(b) inheritance; US3: drift detector), so it lands in Phase 2 and unblocks every story-phase test in parallel. The new test file [src/tools/_register.test.ts](../../src/tools/_register.test.ts) is shared across the three story phases — each story adds a test group to the same file (Group 1 / 2 / 3 per the drift-detector contract).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task belongs to (US1 / US2 / US3) — Setup / Foundational / Polish phases have no story label
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I and the existing repo convention. All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod / `zod-to-json-schema` / MCP SDK tooling is already configured (predecessor features 001–008). This feature introduces no new dependencies (research R11 — keep current `zod-to-json-schema` pin). Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: All three user stories depend on the wrap-branch widening in `_shared.ts`. Until T001 lands, every story-phase test is moot (the published descriptor would still be hollow under strict-naive clients).

- [ ] T001 Widen the wrap branch in [src/tools/_shared.ts](../../src/tools/_shared.ts) per [contracts/envelope-helper.contract.md](contracts/envelope-helper.contract.md) kinds A–E and [data-model.md](data-model.md) §3 / §4. Add private `unionTopLevelProperties(branches)` and `intersectionTopLevelRequired(branches)` subroutines. Modify the wrap branch to (a) compute top-level `properties` (union of branch property names with `{}` leaf widening; `target_mode` discriminator widened to `{ type: "string" }`), (b) compute top-level `required` (intersection of branch `required` arrays for `anyOf`/`oneOf` inputs; UNION with extras-arm `required` for Pattern (a) `allOf` inputs), (c) walk both arms of `allOf` for Pattern (a) — extract per-arm `properties` and `required` and the inner `anyOf`'s branches into `oneOf`. PRESERVE existing behaviour: `type: "object"`, `additionalProperties: true`, `oneOf` with inner-`type` stripped, `$schema` preservation. Land 4 new co-located cases in [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts) per [research.md](research.md) R12: simple union, ZodEffects union (`targetModeSchema`), Pattern (a) intersection, no-op branch byte-stable regression guard. Constitution: Principle I (no new module), Principle II (tests in same change), Principle III (zod is the single source of truth — widening is downstream of one `zodToJsonSchema` call per FR-013), Principle V (header preserved).

**Checkpoint**: Foundation ready — every user story's tests can now observe a correctly-widened published descriptor. Proceed to Phase 3.

---

## Phase 3: User Story 1 — `read_note` works end-to-end through a spec-conformant MCP client (Priority: P1) 🎯 MVP

**Goal**: Restore `read_note` callability from strict-naive MCP clients (Cowork) by ensuring the published `inputSchema` exposes the four target-mode property names (`target_mode`, `vault`, `file`, `path`) at top level. Verified end-to-end against a real Obsidian vault before release.

**Independent Test**: Per spec US1 — drive Cowork (the empirically-affected strict-naive client) through `tools/list` → `read_note({ target_mode: "specific", vault, path })` → `read_note({ target_mode: "active" })` against a real vault. Both invocations return `{ content: <note-body> }`. Argument-stripping in Cowork is NOT disabled. Recorded in `0.2.1` release notes.

### Implementation for User Story 1

- [ ] T002 [US1] Create [src/tools/_register.test.ts](../../src/tools/_register.test.ts) (NEW co-located test file for `_register.ts` — Principle II) with the parameterised drift-detector scaffold per [contracts/drift-detector.contract.md](contracts/drift-detector.contract.md) — `invariants` case-table from [data-model.md](data-model.md) §5 with the `read_note` entry only at this stage; `assertInvariant(name, schema)` helper; Group 1 (unit-layer registry walk). Wire to `createServer({ registerSignalHandlers: false })` and read each tool's `descriptor.inputSchema` from the live registry. Add a vitest `it.each` parameterised case proving `read_note` satisfies its invariant (`type: "object"`, `properties_includes: ["target_mode", "vault", "file", "path"]`, `required_includes: ["target_mode"]`, `additionalProperties: true`). Add the `// Original — no upstream.` header (Principle V). FR-006 / SC-003. Depends on T001.

- [ ] T003 [US1] (manual, post-PR-merge — gate for `0.2.1` release) Execute quickstart.md S-11. Build the package (`npm run build && npm pack`), install the resulting `marwansaab-obsidian-cli-mcp-0.2.1.tgz` as the local MCP server target in Cowork's client config, and drive: `tools/list` → inspect `read_note`'s `inputSchema` (Cowork's view MUST show `properties` containing at minimum `target_mode`) → invoke `read_note({ target_mode: "specific", vault: "<v>", path: "<p>" })` against a real vault → invoke `read_note({ target_mode: "active" })` with the user's currently-focused note. Both calls MUST return `{ content: <note-body> }`. Argument-stripping in Cowork stays enabled. Paste Cowork's wire-side `inputSchema` snippet AND a one-line confirmation that both invocations succeeded into the `0.2.1` release notes. SC-001 / SC-002 / FR-002.

**Checkpoint**: US1 deliverable shipped. `read_note` is callable from the empirically-affected strict-naive client. The drift-detector skeleton is in place to receive US2's and US3's test groups.

---

## Phase 4: User Story 2 — Future typed tools that consume `targetModeSchema` inherit the fix automatically (Priority: P1)

**Goal**: Verify that future Pattern (a) consumers (`targetModeSchema.and(z.object({...}))` — planned `write_note` / `append_note`) AND Pattern (b) consumers (fresh discriminated union with union-level `superRefine`) publish a well-formed `inputSchema` automatically — no per-tool plumbing, no companion JSON Schema export, no opt-in flag.

**Independent Test**: Per spec US2 — register synthetic Pattern (a) and Pattern (b) tools through `registerTool` and assert via the registry / drift-detector test surface that the published descriptor exposes every property name the runtime accepts (including `note_text` for both patterns) and the cross-branch `required` keys.

### Implementation for User Story 2

- [ ] T004 [US2] Add Group 3 (synthetic Pattern (a) and Pattern (b) fixtures) to [src/tools/_register.test.ts](../../src/tools/_register.test.ts) per [contracts/drift-detector.contract.md](contracts/drift-detector.contract.md) Group 3. Each case calls `registerTool({...})` directly with a synthetic schema (does NOT register with the live server) and asserts on the resulting `tool.descriptor.inputSchema` — Pattern (a) is `targetModeSchema.and(z.object({ note_text: z.string() }))`; Pattern (b) is `z.discriminatedUnion("target_mode", [<writeNoteSpecific>, <writeNoteActive>]).superRefine(() => {})` where both branches carry `note_text`. Assertions: `properties_includes: ["target_mode", "vault", "file", "path", "note_text"]`, `required_includes: ["target_mode", "note_text"]`. FR-003 / SC-009. Depends on T001 + T002.

**Checkpoint**: US2 deliverable shipped. Future `write_note` / `append_note` (or any other Pattern (a)/(b) consumer) inherit the published-descriptor fix mechanically. The roadmap unblock is verified by the synthetic fixtures.

---

## Phase 5: User Story 3 — A drift detector fires on any future regression of the publication pipeline (Priority: P2)

**Goal**: Land the durable forcing function — a parameterised drift detector that observes the actual published `inputSchema` for every registered tool and asserts per-tool invariants. Future regressions to `_shared.ts` (publication pipeline) or `target-mode.ts` (primitive shape) AND future regressions to `obsidian_exec/schema.ts` are caught at merge time before reaching a release tag.

**Independent Test**: Per spec US3 — the test fails when run against today's `0.2.0` source (validated by the SC-010 manual revert check at T008); the test passes after the fix lands; `obsidian_exec`'s invariant fires if anyone widens `additionalProperties` to `true`.

### Implementation for User Story 3

- [ ] T005 [US3] Extend the `invariants` case-table in [src/tools/_register.test.ts](../../src/tools/_register.test.ts) with the `obsidian_exec` entry per [data-model.md](data-model.md) §5: `properties_equals_set: ["command", "vault", "parameters", "flags", "copy", "timeoutMs"]`, `required_equals: ["command"]`, `additionalProperties: false`. Group 1's `it.each` automatically picks it up. STRICT regression guard — a future change that widens `additionalProperties` to `true` for the flat-`z.object` case fails this assertion. FR-005 / FR-007 / SC-004. Depends on T001 + T002.

- [ ] T006 [US3] Extend the `invariants` case-table with the `help` entry: `type: "object"`, `properties_includes: ["tool_name"]` (no `required` invariant — `help`'s runtime schema permits zero-arg or with-arg invocation per the tool's spec). Add the "every registered tool has an invariant entry" precondition assertion (the test that fails when a future tool is registered with NO invariant entry — forces every future typed-tool author to declare its published-shape contract here). Depends on T001 + T002.

- [ ] T007 [US3] Add Group 2 (integration layer — full SDK round-trip) to [src/tools/_register.test.ts](../../src/tools/_register.test.ts) per [contracts/drift-detector.contract.md](contracts/drift-detector.contract.md) Group 2. Wire `InMemoryTransport.createLinkedPair()` + `createServer({ registerSignalHandlers: false })` + `Client.listTools()` in `beforeAll`; tear down the client in `afterAll`. Run the same parameterised `it.each` as Group 1 over the wire-returned descriptors. Catches future MCP SDK transformations of the published shape. FR-008. Depends on T001 + T002 + T005 + T006.

- [ ] T008 [US3] (one-time, on the implementer's machine — NOT in CI per SC-010) Execute quickstart.md S-13 — the revert check. Confirm `npx vitest run src/tools/_register.test.ts -t "tool read_note"` PASSES on the fixed source. Stash (or comment out) the new widening logic in `src/tools/_shared.ts`. Re-run the test; confirm it FAILS with a message naming the missing target-mode property (e.g. `AssertionError: Tool 'read_note' inputSchema.properties keys → Expected [] to contain ["target_mode", "vault", "file", "path"]`). Restore the widening; confirm the test passes again. Add a one-line confirmation to the PR description: `S-13 verified manually — detector fails when widening is reverted`. SC-010. Depends on T001 + T002.

**Checkpoint**: US3 deliverable shipped. The drift detector is the durable forcing function that closes feature 007's deferred T004 detector and feature 008's missing wire-level assertion in one move. All future typed tools — registered or hypothetical — are observed by this detector at merge time.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Release-blocking hygiene before tagging `0.2.1`.

- [ ] T009 [P] Bump version `0.2.0 → 0.2.1` in [package.json](../../package.json) (single-line change). FR-011 / R10. The CHANGELOG entry lands in T010 alongside.

- [ ] T010 [P] Add `## [0.2.1] — 2026-05-07` entry to [CHANGELOG.md](../../CHANGELOG.md) ABOVE the existing `0.2.0` entry per FR-012 / R10. Body: name the user-visible symptom (`read_note` argument stripping under spec-conformant MCP clients like Cowork), credit feature 007's deferred fix as the proximate cause, name the fix (top-level `properties` widening in `toMcpInputSchema` wrap branch), and note that future `write_note` / `append_note` (and any other Pattern (a) / Pattern (b) consumer of the target-mode primitive) inherit the protection by the same mechanism. Reference research R1 for the empirical correction to the working-hypothesis (predicate gap → coverage gap).

- [ ] T011 Run the full quality-gate sweep: `npm run lint && npm run typecheck && npm run build && npx vitest run --coverage`. All five Constitution gates (lint clean, typecheck clean, build clean, test suite pass, aggregate statements coverage threshold met) MUST pass. The 31 cases in [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) MUST pass without modification (FR-004 / SC-005). The 7 existing cases in [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts) MUST pass after T001's 4-case extension (SC-005). The new cases in [src/tools/_register.test.ts](../../src/tools/_register.test.ts) MUST pass. Coverage MUST not regress. Depends on T001..T007 + T009 + T010.

- [ ] T012 (manual, gate for `0.2.1` release) Execute quickstart.md S-12 alongside T003's already-recorded S-11 — drive Claude Desktop (strict-rich, MCP SDK-shape) through the same two `read_note` invocations. Both MUST succeed (negative-regression check — the widening MUST NOT break strict-rich clients that already worked under `0.2.0`'s pure-`oneOf` envelope). Append the result to the same `0.2.1` release-notes section as T003. SC-002. Depends on T011 + the published `0.2.1` tarball from T009/T010.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: empty.
- **Foundational (Phase 2)**: T001 has no upstream task dependencies; depends only on the design artifacts already shipped (research / data-model / contracts). T001 BLOCKS all three user-story phases.
- **User Stories (Phase 3+)**: every story task depends on T001. Within a story, T002 (Phase 3) is the foundation for the test file `_register.test.ts`; T004 (Phase 4), T005 / T006 / T007 (Phase 5) all extend the same file — they CANNOT run in parallel with each other against an empty `_register.test.ts`, but the parallelization opportunities are different (see below).
- **Polish (Phase 6)**: T009 + T010 can run in parallel (different files). T011 depends on the full code being in place. T012 depends on T011.

### User Story Dependencies

- **US1 (T002, T003)**: depends on T001 only. T003 is manual and runs after merge.
- **US2 (T004)**: depends on T001 + T002 (`_register.test.ts` must exist with the scaffold).
- **US3 (T005, T006, T007, T008)**: depends on T001 + T002. T007 depends on T005 + T006 (the integration layer reuses the invariants table extended by US3's per-tool cases).

### Within Each User Story

- Tests are co-located in the same change as the source change (Principle II — NON-NEGOTIABLE). No separate red-green TDD loop.
- T001 lands the implementation + its 4 unit cases together.
- T002 lands the `_register.test.ts` scaffold + read_note unit assertion together.
- T004 / T005 / T006 / T007 each ADD a test group to the existing `_register.test.ts` (no new source under test for these — they observe the descriptor produced by T001's widening).

### Parallel Opportunities

- T001 cannot be parallelized — it's the only Phase 2 task and the prerequisite for everything.
- WITHIN Phase 3-5 (after T002 lands the scaffold): T004 (US2), T005 (US3 obsidian_exec), T006 (US3 help) could in principle be authored in parallel because they touch DIFFERENT entries in the `invariants` case-table. In practice, they all edit the same `_register.test.ts` file and serialize on review/merge. Only mark with [P] if the team is genuinely splitting work; here they are listed sequentially for clarity.
- T009 [P] (package.json bump) and T010 [P] (CHANGELOG entry) are genuinely parallelizable — different files, no cross-dependency.

---

## Parallel Example: Phase 6 Polish

```bash
# Polish tasks that touch different files can run in parallel:
Task: "Bump version 0.2.0 → 0.2.1 in package.json (T009)"
Task: "Add 0.2.1 entry to CHANGELOG.md (T010)"

# Then sequentially:
Task: "Run quality-gate sweep (T011)"
Task: "Manual S-12 verification (T012)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

The MVP — restoring `read_note` callability from Cowork — is everything through US1 (T001 → T002 → T003). After T003's manual verification confirms the user-visible bug is fixed, the rest of the work (US2 inheritance verification, US3 drift detector, polish) is durable infrastructure that ships in the same PR but is logically separable.

Suggested workflow:

1. T001 (Foundational widening + unit cases).
2. T002 (US1 — drift-detector skeleton + read_note assertion).
3. **STOP and VALIDATE locally**: run `npx vitest run src/tools/_register.test.ts -t "tool read_note"` — should PASS. Run `npx vitest run src/tools/_shared.test.ts` — should PASS (existing 7 + new 4). Run T011's full suite locally — should PASS.
4. Tag local checkpoint. From here every subsequent task is additive.
5. T004 / T005 / T006 / T007 (US2 + US3 test groups) — extend `_register.test.ts`.
6. T008 (one-time SC-010 revert check on implementer's machine).
7. T009 / T010 (version + CHANGELOG, parallel).
8. T011 (quality-gate sweep).
9. PR + merge.
10. Build + publish `0.2.1` tarball.
11. T003 (manual S-11 verification against Cowork) + T012 (manual S-12 verification against Claude Desktop). Record both in the `0.2.1` release notes.

### Incremental Delivery

This feature is structured for ONE PR (small surface, single concern). Splitting into multiple PRs would fracture Principle II (co-located tests in the same change as the source). Land all of T001..T012 in one merge; the per-story breakdown above exists for review-time traceability and for the spec-kit framework's by-story organization, NOT as a PR-boundary suggestion.

### Parallel Team Strategy

Not applicable for this scope — single-implementer feature.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to specific user story for traceability — Setup / Foundational / Polish phases have no label.
- Each user story is independently VERIFIABLE (each has its own assertion in `_register.test.ts`) but not independently DEPLOYABLE — all three plus polish ship together in `0.2.1`.
- Verify-fails-first is captured exactly once at T008 (the SC-010 manual revert check), not for every implementation task.
- Commit cadence: one commit per logical task or grouped task set (e.g. T001 alone; T002+T004+T005+T006+T007 as a "drift-detector" commit; T009+T010 as a "release prep" commit; T003 + T012 update the release notes file in a final commit).
- The 008-refactor surface (FR-016) is frozen — no `dispatchCli`, `invokeCli`, `invokeBoundedCli`, in-flight registry, or four-priority classification edits in this feature.
- `target-mode/` is UNTOUCHED (FR-004 / Principle I) — the 31 cases pass without modification.
- `stripSchemaDescriptions` (`src/help/strip-schema.ts`) is UNTOUCHED — its contract is correct as-is per spec scope; T001's widening happens BEFORE description-stripping in `registerTool`'s pipeline.
- The user's "Done definition" line `Per-MCP tool notes in The Setup vault updated to reference the fix once shipped (out-of-band, in The Setup project session)` is OUT OF SCOPE here — tracked separately in the user's project session.
