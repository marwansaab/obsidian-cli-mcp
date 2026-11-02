# Contract: Help Reconciliation

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

Each row is a testable promise. "Test" names where it is pinned; "verify" means a one-time check during implementation (Q3 = A).

## §1 Help index and pages (FR-001–FR-003, FR-012)

| ID | Given | When | Then | Pinned by |
|---|---|---|---|---|
| H1 | default server | `tools/list` vs `docs/tools/*.md` (minus `index.md`) | the two name sets are equal | test: `help/docs-sync.test.ts` |
| H2 | default server | `tools/list` vs `- **<name>** —` entries of `index.md` | equal sets, each entry once | test: `help/docs-sync.test.ts` |
| H3 | `helpDocsDrift` fixture with a page for a tool not offered | run | `orphanPages` names it | test: self-test (failure path) |
| H4 | fixture with an index entry for a tool not offered, and an offered tool missing from the index | run | `extraIndexEntries` / `missingIndexEntries` name them | test: self-test (failure path) |
| H5 | fixture where pages, index and tools agree | run | all four lists empty | test: self-test (happy path) |
| H6 | `help({ tool_name: "list_notes" })` and `"search_vault"` | call | `HELP_TOOL_NOT_FOUND`; `details.availableTools` equals the 35 offered names | test: `help/handler.test.ts` (replaces the orphan-page case) |
| H7 | `help.md`'s `HELP_TOOL_NOT_FOUND` example | read | its `availableTools` list equals the 35 offered names | verify |

## §2 Tool names in guidance (FR-004, FR-005)

| ID | Given | When | Then | Pinned by |
|---|---|---|---|---|
| N1 | `rename` with `name: "Sub/Note"` or `"Sub\\Note"` | validate | issue message is `name must not contain folder separators; use move to relocate the file to a different folder` | test: `rename/schema.test.ts`, `rename/index.test.ts` (word-bounded `move`, no `move_note`) |
| N2 | `rename.md` | read | the hint is described as naming `move` | verify |
| N3 | every description, parameter description, help page and recovery hint, plus the server instructions (`src/instructions/instructions.ts`) | scan | every tool-shaped name is an offered tool | verify (research F2 scan, re-run, tasks T013) |

## §3 Worked examples (FR-006, FR-007, FR-010)

| ID | Given | When | Then | Pinned by |
|---|---|---|---|---|
| X1 | `write_note.md` migration examples | parse `arguments` with `obsidianExecSchema` | pass | verify (research F3 probe, re-run) |
| X2 | every working example in `docs/tools`: call blocks and bare-argument blocks (attributed to the page's own tool); `<…>` templates are listed but not parsed | parse with its tool's input schema | 100% pass | verify (probe, tasks T002 / T015) |
| X3 | `context_search.md` Ex. 6, `search.md` Ex. 7 | compare quoted message | equals the returned message, `(FR-008)` / `(FR-010)` suffix included | verify |
| X4 | `properties.md` Ex. 5 + unknown-key sentence | compare | zod 4 wording | verify |
| X5 | `views_base.md` Ex. 7 (+ `:5`, `:57`) | compare | describes `details.issues[]` with the `INVALID_BASE_PATH/wrong-extension:` message prefix; no `params.*` claim | verify |
| X6 | every example naming a vault | compare | consistent with its request and current behaviour (D8) | verify (TC-00586 / TC-00587) |

## §4 `create_base` validation errors (FR-008, Q1 = B)

All rows: `tool.handler(args)` from `createCreateBaseTool`, no spawn (`makeQueuedSpawn([])`, `getCount() === 0`).

| ID | Args | `message` | `details.code` | `details.reason` | `details.field` |
|---|---|---|---|---|---|
| C1 | `{ base_path: "", name: "x" }` | `INVALID_BASE_PATH/empty: base_path is empty` | `INVALID_BASE_PATH` | `empty` | `base_path` |
| C2 | `{ base_path: "a/b.md", name: "x" }` | `INVALID_BASE_PATH/wrong-extension: base_path must end with .base` | `INVALID_BASE_PATH` | `wrong-extension` | `base_path` |
| C3 | `{ base_path: "../x.base", name: "x" }` | `INVALID_BASE_PATH/path-traversal: …` | `INVALID_BASE_PATH` | `path-traversal` | `base_path` |
| C4 | `{ base_path: "<1001 chars>.base", name: "x" }` | `INVALID_BASE_PATH/too-long: …` | `INVALID_BASE_PATH` | `too-long` | `base_path` |
| C5 | `{ base_path: "T.base", name: "" }` | `INVALID_NAME/empty: name is empty` | `INVALID_NAME` | `empty` | `name` |
| C6 | `{ base_path: "T.base", name: "<1001 chars>" }` | `INVALID_NAME/too-long: …` | `INVALID_NAME` | `too-long` | `name` |
| C7 | `{ base_path: "T.base", name: "x", content: "<3073 chars>" }` | `CONTENT_TOO_LARGE: content exceeds 3072 UTF-16 code units` | `CONTENT_TOO_LARGE` | absent | `content` |
| C8 | `{ path: "a.md", name: "x" }` (deprecated alias) | wrong-extension message | `INVALID_BASE_PATH` | `wrong-extension` | `base_path` |
| C9 | `{ base_path: "T.base" }` (missing `name`) | `create_base input failed schema validation` | absent | absent | absent (generic envelope, unchanged) |
| C10 | `{ base_path: "T.base", name: "x" }` with a stubbed `Created:` reply | — | success, unchanged result | — | — |

Every C1–C8 result also carries `details.issues` with the generic per-issue entries (the existing `index.test.ts:130-143` assertion keeps passing unchanged).

## §5 `context_search` missing-folder error (FR-009, Q2 = A; tests per analysis C2 = A)

| ID | Given | Then | Pinned by |
|---|---|---|---|
| S1 | `context_search.md` Example 4 | shows E6 exactly: generic top-level message, `details.command: "folder"`, `details.message`, `argv`, `stdout`, `stderr`, `exitCode` | verify (doc review) + live quickstart L3 |
| S1a | `executeContextSearch({ query: "x", folder: "DoesNotExist" })` with stubbed stdout `No matches found.` then `Error: Folder "DoesNotExist" not found.` | rejects | `CLI_REPORTED_ERROR`, `details.command === "folder"`, `details.message === 'Error: Folder "DoesNotExist" not found.'` | test: `context_search/handler.test.ts` H7 (assertions added) |
| S1b | the registered `context_search` tool, same stubs | `tool.handler(args)` | `isError`; payload `code === "CLI_REPORTED_ERROR"`, `message === "CLI bridge upstream error: CLI_REPORTED_ERROR"`, `details.command === "folder"`, `details.message` as S1a | test: `context_search/index.test.ts` (new case) |
| S2 | `src/cli-adapter/**`, `src/tools/context_search/{handler,index,schema}.ts` | unchanged | `git diff` empty for those paths |

## §6 Published surface

| Item | Change |
|---|---|
| Tool titles, annotations, descriptions, input/output schemas | none: `_register-baseline.json` must pass WITHOUT `npm run baseline:write` |
| Tool set | unchanged (35) |
| `docs/tools/` | 2 files deleted; pages edited: `index.md`, `help.md`, `rename.md`, `write_note.md`, `create_base.md`, `context_search.md`, `search.md`, `properties.md`, `views_base.md` (+ any D8 items) |
