# Quickstart — list_files

Verification scenarios S-1..S-22 mapped 1:1 to SC-001..SC-022 from [spec.md](./spec.md). Each scenario states the input, the expected response shape, the realising regression test, and (where applicable) the live-CLI characterisation case from FR-023.

The S-1..S-19 scenarios run inside the unit-test suite via `vitest run` (mocked `spawnFn`); S-20..S-22 are manual end-to-end runs against MCP Inspector / Claude Desktop with TestVault opened (because they verify properties of the live CLI that synthetic stubs cannot exercise).

## S-1 — Specific-mode listing returns structured array (SC-001)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Inbox" }
```

**Mocked stdout**: `Inbox/a.md\nInbox/b.md\nInbox/c.md\n`

**Expected response**:
```json
{ "count": 3, "paths": ["Inbox/a.md", "Inbox/b.md", "Inbox/c.md"] }
```

**Asserts**: `count === paths.length`; every path is a non-empty string; sort is lexical.

**Realising test**: `handler.test.ts` — Test #6 (per data-model.md inventory).

## S-2 — Vault-root listing (SC-002)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo" }
```

**Mocked stdout**: `README.md\nIndex.md\nInbox/Sub/x.md\n`

**Expected response**:
```json
{ "count": 2, "paths": ["Index.md", "README.md"] }
```

The recursive path `Inbox/Sub/x.md` is filtered (3-component path; threshold = 1 + 0 = 1).

**Realising test**: `handler.test.ts` — Test #12 + #20 (non-recursive + root threshold).

## S-3 — Ext filter (SC-003)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Mixed", "ext": "md" }
```

**Mocked stdout**: `Mixed/note.md\n` (CLI applies ext filter natively; mock simulates the filtered subset)

**Expected response**:
```json
{ "count": 1, "paths": ["Mixed/note.md"] }
```

**Asserts**: argv includes `ext=md`; result excludes non-.md files.

**Realising test**: `handler.test.ts` — Test #1 (argv shape) + a complementary test that asserts the response.

## S-4 — Missing folder returns empty (SC-004)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Missing" }
```

**Mocked stdout**: `""` (empty — CLI returns nothing for missing folders per F5)

**Expected response**:
```json
{ "count": 0, "paths": [] }
```

**Realising test**: `handler.test.ts` — Test #9.

## S-5 — `total: true` returns count without paths (SC-005)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Inbox", "total": true }
```

**Mocked stdout**: `Inbox/a.md\nInbox/b.md\nInbox/c.md\nInbox/d.md\nInbox/e.md\n`

**Expected response**:
```json
{ "count": 5, "paths": [] }
```

**Asserts**: argv does NOT include the bare `total` token (R7 — wrapper does not delegate); paths is the empty array; count matches what `total: false` would return on the same stub.

**Realising test**: `handler.test.ts` — Test #17 + #18 (total true + matching total false).

## S-6 — Ordering stability (SC-006)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Inbox" }
```

**Mocked stdout (call 1)**: `Inbox/c.md\nInbox/a.md\nInbox/b.md\n` (CLI emits unsorted per F20)

**Mocked stdout (call 2)**: `Inbox/c.md\nInbox/a.md\nInbox/b.md\n` (same)

**Expected response (both calls)**:
```json
{ "count": 3, "paths": ["Inbox/a.md", "Inbox/b.md", "Inbox/c.md"] }
```

**Asserts**: byte-identical responses; lexical UTF-8 byte-compare order; differs from the CLI's emit order.

**Realising test**: `handler.test.ts` — Test #7. Companion test #8 covers non-BMP characters (UTF-8 vs UTF-16 divergence).

## S-7 — Validation rejects malformed inputs (SC-007)

Each US4 scenario (1–8) is its own test case. Every test asserts:
1. The promise rejects with `UpstreamError` whose `code` is `VALIDATION_ERROR`.
2. `spawnFn.mock.calls.length === 0`.

**Realising tests**: `schema.test.ts` Tests #5–#18 (per data-model.md inventory).

## S-8 — Trailing slash equivalence (SC-008)

**Input A**: `{ target_mode: "specific", vault: "Demo", folder: "Inbox" }`

**Input B**: `{ target_mode: "specific", vault: "Demo", folder: "Inbox/" }`

Both produce the same argv passthrough and (against an identical mocked stub for both) the same response shape per FR-013 / F4.

**Realising test**: `handler.test.ts` — Test #26.

## S-9 — Unknown vault produces structured error (SC-009)

**Input**:
```json
{ "target_mode": "specific", "vault": "DoesNotExist", "folder": "Inbox" }
```

**Mocked stdout**: `Vault not found.` (cli-adapter's 011-R5 inspection reclassifies)

**Expected**: `UpstreamError(CLI_REPORTED_ERROR)` — promise rejects, no `{ count: 0, paths: [] }` returned.

**Realising test**: `handler.test.ts` — Test #21.

## S-10 — Active-mode no focused vault (SC-010)

**Input**:
```json
{ "target_mode": "active" }
```

**Mocked stdout / exit**: CLI returns the "no active file" / "no focused vault" shape (exact shape verified at T0 of /speckit-implement).

**Expected**: `UpstreamError(ERR_NO_ACTIVE_FILE)` or `UpstreamError(CLI_REPORTED_ERROR)` depending on CLI's actual output shape (T0 verifies).

**Realising test**: `handler.test.ts` — Test #25.

## S-11 — Path-traversal contained at CLI (SC-011)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "../../etc" }
```

**Mocked stdout**: `""` (CLI confines per F15)

**Expected response**:
```json
{ "count": 0, "paths": [] }
```

**Realising test**: `handler.test.ts` — Test #27.

**Live verification** (T0 manual): SC-011 also requires confirming the CLI's confinement is observable for `../OtherVault/secret.md` and absolute paths. Bundled into FR-023 plan-stage characterisation.

## S-12 — Output-cap exceeded (SC-012 — Plan-amendment-1 applied)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Huge" }
```

**Mocked stdout**: Mid-stream output-cap kill simulated by the spawn-stub.

**Expected**: `UpstreamError(CLI_NON_ZERO_EXIT)` with cap-exceeded `details`.

**Asserts**: BOTH `total: false` AND `total: true` against the same fixture surface the cap-exceeded error (per Plan-amendment-1 — `total: true` is NOT a cap-evasion path).

**Realising test**: `handler.test.ts` — Test #28.

**Live verification deferred to T0**: requires authoring a synthetic ~200K-file fixture under Sandbox/. Bundled into T022 of /speckit-tasks.

## S-13 — Zero changes to existing typed-tool surfaces (SC-013)

**Realising test**: existing test files for `read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property` / `read_heading` / `write_property` / `obsidian_exec` / `help` produce byte-identical descriptor outputs after `list_files` is added.

The `_register.test.ts` parameterised registry walk auto-asserts the new tool registers without affecting existing tools' descriptors.

## S-14 — Documentation completeness (SC-014)

**Realising verification**: 
1. `docs/tools/list_files.md` exists (server-boot aggregator + registration test #4).
2. The doc contains: input contract (target_mode, vault, folder, ext, total), output shape for both `total` branches, the ordering convention (lex UTF-8 byte-compare), the non-recursive contract, the failure-mode roster, AND ≥4 worked examples covering ≥4 distinct scenarios (specific root, specific folder + ext, active mode, count-only).
3. The doc surfaces Plan-amendment-1 (`total: true` is not a cap-evasion path) under Known Limitations.

**Realising verification mechanism**: doc-contents review at /speckit-implement T-task time; the registration test asserts presence; content quality is a /speckit-tasks reviewer responsibility.

## S-15 — Test count floor (SC-015)

**Realising verification**: aggregate counts: 18 schema + 28 handler + 5 registration = **51 tests**. Floor is 30. Comfortably exceeded. Verified at /speckit-tasks-time test-count enumeration and at /speckit-implement T-task completion.

## S-16 — Zero new error codes (SC-016)

**Realising verification**: `errors.ts` is FROZEN by the spec (FR-024 + Plan-amendment scope). Grep `errors.ts` after implementation shows no new `code:` strings beyond the existing set.

## S-17 — Live-CLI characterisation status (SC-017)

**Realising verification**: research.md's FR-023 coverage table is the source of record. 18 of 21 cases verified live during plan; 3 deferred to T0 of /speckit-implement (emoji/non-ASCII fixtures, active-mode-no-focused-vault probe, synthetic-large-folder cap probe). Each deferred case has a corresponding T0 task in /speckit-tasks output.

## S-18 — Token saving observability (SC-018)

**Realising verification**: manual end-to-end against MCP Inspector. Call `list_files` once with `total: false` and once with `total: true` against the same folder. Observe the MCP response payloads — the `total: true` payload is materially smaller (only the count survives). Confirms wrapper→MCP-client token saving.

**Note**: this is a "manual" verification because the unit test suite mocks `invokeCli` — there's no real MCP-client transport to observe payloads. The mock-stub-level proxy is the response-shape assertion in Test #17 vs Test #18.

## S-19 — Argv passing structural safety (SC-019)

**Realising verification**: the cli-adapter assembles argv as discrete tokens; `spawn` is invoked with an argv array, NOT a shell command string. Verified by:
1. Test #1–5 in `handler.test.ts` — argv asserted as `string[]`.
2. The cli-adapter's existing test suite (008-refactor surface) — covers the argv-not-shell invariant comprehensively.

## S-20 — Sub-folder filter observability (SC-020)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Mixed" }
```

**Mocked stdout** (synthetic — F19 says live CLI never emits these; this is the defence-in-depth case):
```
Mixed/note.md
Mixed/image.png
Mixed/Sub/
Mixed/Sub
```

**Expected response**:
```json
{ "count": 2, "paths": ["Mixed/image.png", "Mixed/note.md"] }
```

The two sub-folder entries (with and without trailing slash) are filtered. The two file entries are kept and sorted.

**Realising test**: `handler.test.ts` — Test #13.

## S-21 — Folder-names-a-file conflation (SC-021)

**Input**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "notes/x.md" }
```

**Mocked stdout**: `""` (CLI returns empty per F6)

**Expected response**:
```json
{ "count": 0, "paths": [] }
```

Indistinguishable from missing folder (S-4) and empty folder. The wrapper does NOT surface a "not a folder" error.

**Realising test**: `handler.test.ts` — Test #9 (same shape covers all three FR-010 cases via the empty-stdout branch).

## S-22 — Dotfile filter + `folder: ".obsidian"` consequence (SC-022)

**Input A**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": "Inbox" }
```

**Mocked stdout A**:
```
Inbox/a.md
Inbox/.gitkeep
Inbox/b.md
```

**Expected response A**:
```json
{ "count": 2, "paths": ["Inbox/a.md", "Inbox/b.md"] }
```

**Input B**:
```json
{ "target_mode": "specific", "vault": "Demo", "folder": ".obsidian" }
```

**Mocked stdout B** (synthetic — F18 says CLI returns empty for `.obsidian`; this is the defence-in-depth case):
```
.obsidian/app.json
.obsidian/workspace.json
```

**Expected response B**:
```json
{ "count": 0, "paths": [] }
```

Every result path's first segment is `.obsidian` (starts with `.`), so the dotfile filter eats every result. Indistinguishable from the FR-010 conflation cases.

**Realising tests**: `handler.test.ts` — Tests #14 + #15 + #16 (dotfile in filename, dot-prefixed sub-component, `folder: ".obsidian"` consequence).

## Manual verification scenarios — live CLI

These three scenarios verify behaviour the unit-test suite cannot exercise (the unit suite mocks `spawnFn`). They run during T0 of /speckit-implement against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).

### M-1 — Emoji / non-ASCII / whitespace-in-name fixture pass

1. Seed `Sandbox/list-files-T0/` with files containing: an emoji (e.g. `🌳-tree.md`), a non-ASCII character (`日本語.md`), leading whitespace in the basename (` leading.md`), trailing whitespace (`trailing .md`).
2. Run the wrapper against `folder=Sandbox/list-files-T0`.
3. Confirm: every fixture name appears in `paths` exactly as on disk; the sort is UTF-8 byte-compare (verify against a manually computed byte-order); the count matches the fixture count.
4. Clean up: remove `Sandbox/list-files-T0/`.

### M-2 — Active-mode no focused vault

1. Close all Obsidian windows so no vault is focused.
2. Call the wrapper with `{ target_mode: "active" }`.
3. Capture the CLI's stdout / exit and confirm the wrapper maps it to a structured `UpstreamError`.
4. Re-open the test vault and confirm subsequent calls succeed.

### M-3 — Output-cap pathological fixture

1. Generate `Sandbox/list-files-cap/` containing ~200,000 files (synthetic — e.g. `Sandbox/list-files-cap/f000000.md` through `f199999.md`). A small script that writes empty `.md` files is sufficient.
2. Call the wrapper with `folder=Sandbox/list-files-cap`. Confirm the CLI's stdout exceeds the 10 MiB cap AND the wrapper surfaces `UpstreamError(CLI_NON_ZERO_EXIT)` with cap-exceeded `details`.
3. Call the wrapper with `folder=Sandbox/list-files-cap`, `total=true`. Per Plan-amendment-1, the SAME error surfaces (the wrapper does not delegate to CLI's `total` flag).
4. Clean up: remove `Sandbox/list-files-cap/` (200K-file delete may take a minute).
5. The published docs reference `obsidian_exec files folder=Sandbox/list-files-cap total` as a recursive-count fallback (the CLI's native `total` flag is cap-friendly but returns recursive counts).
