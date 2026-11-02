# Post-implement: 084 Reconcile Help Documentation

Branch `084-reconcile-help-docs`, implementation on 2026-11-02 (base HEAD `ed3a099`).

## T001 — Starting gate

`npm run typecheck; npm run lint; npm test` passed on the branch before any edit (coverage summary: statements 96.86%, branches 94.53%). No pre-existing failure.

## T003 — Audit records TC-00586 / TC-00587

**Not read.** The `obsidian-cli-mcp` vault tools (`search`, `read`) were not permitted in this session, so the records in My-Setup-Vault could not be opened. As T003 allows, T013 and T015 rest on the repository scan and the probe alone. No item was added to T013 or T015 from the records. A reviewer with vault access can cross-check the two record lists (removed tool names, `argv` call shapes) against the T013 and T015 results below.

## T002 — Example probe inventory

The probe (outside the repository, never committed) read every fenced block in `docs/tools/*.md` that parses as a JSON object and classified it. Before any edit:

| Kind | Count | Rejected |
|---|---|---|
| Call block (`name` + `arguments`) | 156 | 11 |
| Bare-argument block (keys all inputs of the page's tool) | 51 | 10 |
| Template (`<…>` placeholder, not parsed) | 35 | — |
| Not an example | 110 | — |

- **Call blocks** reproduce research F3: 157 call blocks, 11 rejections. One of the 157 (`create_base.md` Example 5, `"content": "<3073+ characters>"`) is now counted as a template, so 156 were parsed; the 11 rejections are exactly F3's list.
- **Bare-argument rejections** (the extended inventory research F3 did not cover):
  - `create_base.md:42`, `:103`, `:124`: **not argument blocks.** They are `{ path, name }` responses (the Output section and the responses of Examples 1 and 2) whose keys happen to be input names too. No change.
  - `find_and_replace.md:236` (Example 8, "Scope conflict (rejected before any read)"), `get_active_file.md:132`, `:137`, `:142` ("Failure examples"), `open_file.md:126`, `:131` ("Failure examples"), `patch_block.md:277` ("Failure: malformed block-id"): failing-labelled examples. Checked under T027.
- **No validated block carries `deprecated_parameters`.**
- **Templates skipped**: the input-shape blocks under "Specific mode" / "Active mode" / "Input contract" / "Input Schema" headings of `append_note`, `backlinks`, `context_search`, `delete`, `files`, `find_by_property`, `links`, `move`, `outline`, `patch_block`, `paths`, `pattern_search`, `prepend`, `properties`, `read`, `read_property`, `rename`, `search`, `set_property`, `smart_connections_query`, `smart_connections_similar`, `tag`, `write_note`, plus `create_base.md:162` (Example 5).

## T013 — Tool-name scan (contract N3)

Scanned `docs/tools/*.md`, `src/tools/*/{index,schema}.ts` and `src/instructions/instructions.ts` for backticked snake_case names, `tool_name: "…"`, `"name": "…"`, `./x.md` links and "`x` tool", against the 35 offered tools.

- After the `rename` fix, no tool-shaped name outside the offered set remains.
- The remaining hits are not tool references: parameter and field names (`target_mode`, `base_path`, `active_note`, `block_id`, `bytes_written`, …), zod issue codes (`too_small`, `unrecognized_keys`), frontmatter property names in `"name": "…"` output entries (`status`, `tags`, `author`, …), and example paths (`./escape.md`, `subdir/../foo.md`).
- The server instructions name only offered tools. No retired name (`move_note`, `list_notes`, `search_vault`, `read_note`, `delete_note`, `list_files`, `write_property`, `rename_note`) appears in any scanned file.
- `rename.md:149` (error-roster row) also named `move_note`; it was corrected with `:128` and `:283` (the task named only those two).
- `npx vitest run src/tools/rename`: 94 passed.

## T015 / T027 — Worked examples and failing examples (contract X1–X5)

Re-run after all edits: call blocks 156 (9 rejected), bare-argument blocks 51 (10 rejected), templates 35, no `deprecated_parameters`.

- The two `write_note.md` migration examples now parse with `obsidianExecSchema`.
- Every remaining call-block rejection is failing-labelled: `context_search` Ex. 6, `search` Ex. 7, `properties` Ex. 5, `pattern_search` Ex. 4, `read_heading` Ex. 4, `vaults` Ex. 3, `views_base` Ex. 7, `rename` (vi), `write_note` (iv) legacy form.
- The bare-argument rejections are the three `create_base` response blocks and the seven failing-labelled examples above.
- No invalid working bare-argument example was found, so T015 needed no edit beyond T014.

A second probe sent every failing-labelled example through the registered tool (validation fails before any spawn) and compared the returned envelope with the page:

| Example | Page says | Returned | Result |
|---|---|---|---|
| `context_search` Ex. 6 | `query is empty or whitespace-only (FR-008)` | same | matches (fixed, T022) |
| `search` Ex. 7 | `query is empty or whitespace-only (FR-010)` | same | matches (fixed, T023) |
| `properties` Ex. 5 + unknown key | `Too small: expected string to have >=1 characters`; `Unrecognized key: "file"` | same | matches (fixed, T024) |
| `views_base` Ex. 7 | generic envelope, issue `INVALID_BASE_PATH/wrong-extension: base_path must end with .base` | same | matches (fixed, T025) |
| `rename` (vi) | message naming `move` | `… use move to relocate the file to a different folder` | matches (fixed, T011/T012) |
| `pattern_search` Ex. 4, `read_heading` Ex. 4, `vaults` Ex. 3, `write_note` (iv) | as before | same | matches, unchanged |
| `find_and_replace` Ex. 8 | `SCOPE_CONFLICT` / `note+folder` | same | matches, unchanged |
| `get_active_file`, `open_file` failure examples | `VALIDATION_ERROR` plus the rule broken (paraphrased, no quoted message) | same rule in the issue message | matches, unchanged |
| `patch_block` "Failure: malformed block-id" | `details.code: "INVALID_BLOCK_ID"`, `details.reason`, `details.offending_index: 5` | generic envelope; the issue message `block_id must match the alphanumeric + hyphen alphabet ([A-Za-z0-9-]+)` only | **drift, fixed** |

**`patch_block.md` (addition beyond plan.md's file list).** `patch_block` has no `mapValidationError`, so its `INVALID_BLOCK_ID` params are dropped exactly as research F5 found for `views_base`. Following D6, the failing example (`:287`) now shows the returned envelope, and the same claim on the page (`:139` leading-caret rule, `:172` error-table row) was corrected so the page does not contradict itself. The leading-caret message was taken from the probe. `PATCH_BLOCK_DESCRIPTION` still lists `INVALID_BLOCK_ID` among its typed `details.code` values; it is published (fingerprinted) and outside FR-013, so it is left and recorded as a follow-up.

**`create_base.md:37`.** The deprecated-name note said an `INVALID_BASE_PATH` issue carries `params.field: "base_path"`, a field the returned error never had. It now says the error carries `details.field: "base_path"` and its issue `path: ["base_path"]`, keeping the statement that the deprecated `path` reports `base_path` (the probe confirms this for `{ path: "a.md", name: "x" }`).

## T026 — Vault names (contract X6, X7)

- **Fixed check**: `git grep -n "The Setup" -- docs/tools "src/tools/*/index.ts" "src/tools/*/schema.ts"` prints nothing.
- **Allowed names**: every vault name in `docs/tools` examples is a generic placeholder (`MyVault`, `Demo`, `Work`, `Knowledge`, `Research`, `Notes`, `NoSuchVault`, `Archive`, `Other`, `Foo`, `V`, `B`, `ResearchVault`, `WorkNotes`, `Architecture Notes`, `<vault name>`, `<v>`, …) or `TestVault-Obsidian-CLI-MCP` (`tag.md:194`).
- **Agreement**: per heading section, request, response and prose name the same vault. The two sections that name two vaults (`get_active_file.md` and `open_file.md` "Failure examples") hold several separate examples, each consistent on its own.
- **Changes**: none found.

## T029 — Gates

- `npm run typecheck`, `npm run lint`, `npm test`: pass (172 files passed, 1 skipped; 4182 tests passed, 6 skipped).
- FR-018 fingerprint (`src/tools/_register.test.ts`): passes without `npm run baseline:write`; `src/tools/_register-baseline.json` is unmodified.
- `npm run format:check`: fails on 1256 files, a pre-existing state. The same files fail on `main` (checked for `src/tools/create_base/index.ts` and `src/tools/rename/schema.ts` at `main`), and CI does not run Prettier. Not changed in this feature.

## T030 — Changed-file set

`git diff main` touches none of `src/server.ts`, `src/errors.ts`, `src/cli-adapter/`, `src/tools/_register.ts`, `src/tools/help/{handler,index,schema}.ts`, `src/tools/context_search/{handler,index,schema}.ts`, `src/tools/views_base/`, `src/tools/query_base/`, `src/tools/_base-path.ts`, `src/tools/_register-baseline.json`.

The set matches plan.md → Source Code, with three recorded additions: `docs/tools/patch_block.md` (T027 finding above), `rename.md:149` (T013) and `create_base.md:37` (T018). `.specify/feature.json`, `CLAUDE.md` and `relay-digest.md` were already modified before implementation (plan-phase hook and Relay).

## T031 — Structural verification

`codegraph sync`, then `codegraph_explore "createCreateBaseTool mapZodIssuesToToolError renameInputSchema helpDocsDrift"`:

1. No new error code or class. `src/errors.ts` is unchanged; the mapper emits only `VALIDATION_ERROR` with the existing `details.code` values `INVALID_BASE_PATH`, `INVALID_NAME`, `CONTENT_TOO_LARGE` and their existing `reason` values.
2. No handler imports `createLogger`, `createQueue` or `createVaultRegistry`; `src/server.ts` is unchanged.
3. `create_base/index.ts` gained only `type { z }` from `zod` and `type ToolErrorPayload` from `../_shared.js`. No tool → tool edge.
4. `mapZodIssuesToToolError` (`create_base/index.ts:38`) has one caller, `createCreateBaseTool` → `registerTool({ mapValidationError })`, and is tested through `create_base/index.test.ts`. `helpDocsDrift` exists only in `src/tools/help/docs-sync.test.ts`.
5. Kernel-node no-touch claim holds: `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are not edited and gain no production caller.

## T032 — Live checks (quickstart §3)

`npm run build`, then the built server (`dist/index.js`) was driven over stdio by a fresh MCP client, so it served the edited `docs/tools/`. Obsidian answered `=> TestVault-Obsidian-CLI-MCP` to `app.vault.getName()` before the run.

| ID | Outcome |
|---|---|
| L1 | `help` index lists 35 entries, equal to the 35 names from `tools/list`; no `list_notes` / `search_vault`. **Pass.** |
| L2 | `help { tool_name: "search_vault" }` → `isError`, `HELP_TOOL_NOT_FOUND`, `availableTools` equal to the 35 offered names. **Pass.** |
| L3 | `{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"argv":["obsidian","vault=TestVault-Obsidian-CLI-MCP","folder","path=DoesNotExist-084"],"command":"folder","stdout":"Error: Folder \"DoesNotExist-084\" not found.\n","stderr":"","exitCode":0,"message":"Error: Folder \"DoesNotExist-084\" not found."}}`. Field for field the shape of `context_search.md` Example 4; `argv` carries the `vault=` token because a vault was named (data-model E6). **Pass.** |
| L4 | `VALIDATION_ERROR`, message `INVALID_BASE_PATH/wrong-extension: base_path must end with .base`, `details.code: "INVALID_BASE_PATH"`, `details.reason: "wrong-extension"`, `details.field: "base_path"`, `details.issues` kept. **Pass.** |
| L5 | `VALIDATION_ERROR`, issue message `name must not contain folder separators; use move to relocate the file to a different folder`. **Pass.** |

The vault's file tree (excluding `.obsidian/`) was identical before and after the run: nothing was created or renamed. No residue to clean.

## T033 — Follow-ups (out of scope)

1. **`query_base` / `views_base` `INVALID_BASE_PATH` details** (research F5, F8). `query_base.md:70` tells agents to "Inspect `details.reason`" for `INVALID_BASE_PATH`, and neither tool registers a `mapValidationError`, so the generic envelope keeps only the message prefix. Candidate fix: lift this feature's `create_base` mapper into `_base-path.ts` and adopt it in all three Bases tools.
2. **`UPSTREAM_TIMEOUT` vs `CLI_TIMEOUT`** (research F8). `UPSTREAM_TIMEOUT` appears in the error rosters of `bases.md`, `create_base.md`, `query_base.md` and `views_base.md`, but no source file raises it; the dispatch timeout code is `CLI_TIMEOUT`.
3. **`patch_block` `INVALID_BLOCK_ID` details** (found by T027). The schema attaches `params: { code: "INVALID_BLOCK_ID", reason, offending_index? }`, and `PATCH_BLOCK_DESCRIPTION` lists `INVALID_BLOCK_ID` as a typed `details.code`, but `patch_block` has no `mapValidationError`, so the returned error is the generic envelope. The help page now documents what is returned; the description and the error shape are for the same fix as item 1.
4. **`bases` index entry** (noticed, not checked). `docs/tools/index.md` says `bases`' optional `vault` "is accepted but currently ignored by the CLI", while spec 083 made `bases` act on the named vault. Outside this feature's listed items; for the next BI-0122 audit run.
5. **TC-00586 / TC-00587 cross-check** (T003). Not done, because the vault tools were not permitted; no item from them is judged out of scope.
