# Research: Reconcile Help Documentation

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-02 | **HEAD**: `52fd0eb`

All findings below come from reading the code at HEAD (CodeGraph and direct reads) and from one in-process probe. No live CLI call was made at plan time. The BI-0122 audit records (TC-00586, TC-00587) live in My-Setup-Vault; reading them through the vault tools was not permitted in this session, so the inventory below was rebuilt from the repository. Implementation cross-checks it against those records (task note in [plan.md](plan.md)).

## Findings

### F1 — The help index and the help directory list two tools the server does not offer

- `createServer()` (`src/server.ts:110-145`) registers 35 tools. `docs/tools/` holds 37 tool pages plus `index.md`; the two extras are `list_notes.md` and `search_vault.md`, both `<!-- TODO(BI-XXX) -->` placeholders. `docs/tools/index.md` lists both with "_(documentation pending — owned by a future BI)_".
- `executeHelp` (`src/tools/help/handler.ts:35-79`) serves any `<name>.md` in the directory, so `help({tool_name:"list_notes"})` returns the placeholder. Its `notFound` (`:81-98`) builds `availableTools` from the directory listing, so the "no such tool" error also names both phantoms.
- `docs/tools/help.md:67` shows a `HELP_TOOL_NOT_FOUND` example whose `availableTools` lists only eight names, two of them the phantoms.
- `src/tools/help/handler.test.ts:145-151` pins the placeholder behaviour ("returns content for orphaned doc files … remaining orphan stubs at this BI are list_notes / search_vault").
- `assertToolDocsExist` (`src/tools/_register.ts:277-292`) runs at boot over the full tool list, before `selectOfferedTools` filters by owner access settings (`server.ts:151-154`). It checks one direction only: every registered tool has a page. Nothing checks the reverse, which is how the phantoms survived.
- `package.json` `files` ships `docs/tools/**/*.md`, so deleting the two pages removes them from the published package.

### F2 — One stale tool name in published guidance: `move_note`

- `src/tools/rename/schema.ts:13`: the folder-separator `.regex(/^[^/\\]+$/, …)` message is "name must not contain folder separators; use move_note to relocate the file to a different folder". The tool is `move` (`MOVE_TOOL_NAME`, `src/tools/move/index.ts:8`).
- `docs/tools/rename.md:128` and `:283` describe that hint as naming `move_note`.
- Tests pin the old word: `rename/index.test.ts:140-141`, `rename/schema.test.ts:147-176` (two cases, `toMatch(/move_note/)`).
- The `.regex` publishes its `pattern` in JSON Schema but not its message, so changing only the message does not move the `_register-baseline.json` fingerprint (contract §6 gate confirms this).
- A repository-wide scan for tool-shaped names (`` `snake_case` ``, `tool_name: "…"`, `"name": "…"` call shapes, `./x.md` links, "`x` tool") against the 35 registered names found no other stale tool name in any `docs/tools/*.md` page or any `src/tools/*/index.ts` / `schema.ts` text. The other non-tool hits are parameter names (`active_note`), a Smart Connections method (`find_connections`) and property values (`tags`), none of them tool references.

### F3 — Example calls: one invalid working example, ten labelled failing examples

An in-process probe ran every fenced JSON block of the form `{ "name": <tool>, "arguments": {…} }` in `docs/tools/*.md` through that tool's exported Zod input schema (157 blocks, 146 pass). The 11 rejections:

| Page:line | Heading | Labelled failing? | Verdict |
|---|---|---|---|
| `write_note.md:111` | Migration from the legacy `write_note` | No: presented as the call to migrate to | **Invalid working example** |
| `write_note.md:240` | (iv) Migration … (now via `obsidian_exec`) | No: "Rewrite as:" | **Invalid working example** (same call) |
| `write_note.md:225` | (iv) Migration … | Yes ("The legacy form below is **rejected**") | Correct failing example |
| `context_search.md:238` | Example 6 — Validation rejection | Yes | Message drift (F4) |
| `search.md:197` | Example 7 — Validation rejection | Yes | Message drift (F4) |
| `properties.md:168` | Example 5 — Validation rejection | Yes | Message drift (F4) |
| `pattern_search.md:174` | Example 4 — Invalid pattern | Yes | Message matches |
| `read_heading.md:193` | Example 4 — Validation rejection | Yes | Message paraphrase matches |
| `vaults.md:88` | Example 3 — An input key is rejected | Yes | No message quoted; matches |
| `views_base.md:146` | Example 7 — Invalid locator | Yes | Detail drift (F5) |
| `rename.md:271` | (vi) Failure recovery — folder separator | Yes | Hint names `move_note` (F2) |

Coverage limit (analysis C1): the plan-time probe parsed only call blocks. 72 further fenced blocks hold argument-like keys without a `name` / `arguments` wrapper, for example `smart_connections_query.md:79`, `rename.md:33`, `set_property.md:43`. Some are bare example arguments, others input-shape templates with `<…>` placeholders. Tasks T002 / T015 extend the probe to them at implementation, so FR-006, FR-007 and FR-010 are checked over both formats.

The invalid working example sends `obsidian_exec` an `argv` array. `obsidianExecSchema` (`src/tools/obsidian_exec/schema.ts`) takes `command` (no `=`), `parameters`, `vault`, `flags`, `copy`, `timeoutMs`; `argv` is an unrecognised key and `command` is missing. The valid equivalent is `{ "command": "create", "vault": "MyVault", "parameters": { "path": "Daily/2026-05-10.md", "template": "Daily" } }`. `create` is not in the `COMMAND_BLOCKED` set.

### F4 — Quoted validation messages that no longer match

- `context_search.md` Example 6 quotes `"query is empty or whitespace-only"`; the schema returns `"query is empty or whitespace-only (FR-008)"`.
- `search.md` Example 7 quotes the same text; the schema returns `"… (FR-010)"`.
- `properties.md:180` quotes the zod 3 message `"String must contain at least 1 character(s)"`; zod 4 returns `"Too small: expected string to have >=1 characters"`. `properties.md:184` quotes zod 3's `Unrecognized key(s) in object: 'file'`; zod 4 returns `Unrecognized key: "file"`.
- No other `docs/tools` page quotes a zod 3 message (scan for the zod 3 phrasings).

### F5 — `views_base` Example 7 documents `params.*` fields the error does not carry

`views_base.md:150` (and the same claim at `:5` and `:57`) says the wrong-extension rejection returns `params.code: "INVALID_BASE_PATH"`, `params.reason: "wrong-extension"`. `views_base` registers no `mapValidationError`, so `registerTool`'s generic envelope (`_register.ts:179-186`) keeps only `path`, `message` and `code: "custom"` per issue. The returned error carries the sub-reason only as the message prefix `INVALID_BASE_PATH/wrong-extension: base_path must end with .base`. Example 7 is a labelled failing example, so FR-007 covers it.

### F6 — `create_base` drops the ADR-015 discriminators it documents

- `createBaseFoldedSchema.superRefine` (`src/tools/create_base/schema.ts:48-93`) and `appendBasePathIssues` (`src/tools/_base-path.ts:30-61`) attach `params: { code, reason?, field, value_length? | value | limit }` to each custom issue.
- `createCreateBaseTool` (`src/tools/create_base/index.ts:31-42`) passes no `mapValidationError`, so the generic envelope drops `params`. `docs/tools/create_base.md` (error roster rows, Example 5) and the description (`index.ts:14`, `:20`) say `details.code` / sub-reasons.
- `create_base/index.test.ts:130-143` asserts the generic `details.issues[]` entry for an empty `base_path` (`path[0] === "base_path"`, message includes `INVALID_BASE_PATH`).
- `CONTENT_TOO_LARGE` has no sub-reason in `create_base` (`params` carries `field`, `value_length`, `limit`).

### F7 — `context_search`'s missing-folder error as returned

- `executeContextSearch` (`src/tools/context_search/handler.ts:83-99`) runs `invokeCli({ command: "folder", parameters: { path } })` and lets its rejection through.
- `dispatchCli`'s priority (c) (`src/cli-adapter/_dispatch.ts:628-640`) builds `new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { argv, command, stdout, stderr, exitCode: 0, message } })` with no top-level `message`, so `UpstreamError` (`src/errors.ts:16`) sets `"CLI bridge upstream error: CLI_REPORTED_ERROR"`. For a non-eval command `details.message` is the first stdout line, trimmed (`inspectedLines`, `_dispatch.ts:174-177`). `argv` is `[<binary>, ("vault=<v>")?, "folder", "path=<folder>"]` (`assembleArgv`, `:246-254`).
- `registerTool` serialises it as `{ code, message, details }` (`_register.ts:224-229`).
- `context_search.md` Example 4 shows the folder line as the top-level `message` and omits `argv`; its "Distinguishing outcomes" table and error table already branch on `details.message`, which is correct.

### F8 — Same defect class outside this feature's listed items (recorded, not fixed)

- `query_base.md:70` tells agents to "Inspect `details.reason`" for `INVALID_BASE_PATH`; `query_base` has no `mapValidationError` either, so `details.reason` is absent (same class as F6).
- `UPSTREAM_TIMEOUT` appears in the error rosters of `bases.md`, `create_base.md`, `query_base.md` and `views_base.md`; no source file raises it. The dispatch timeout code is `CLI_TIMEOUT`.

These are outside the spec's listed items (Out of scope: "Re-auditing the whole surface for drift not listed here"). They are recorded as follow-ups for the recurring BI-0122 audit.

## Decisions

### D1 — Withdraw the two placeholder pages and their index entries

- **Decision**: delete `docs/tools/list_notes.md` and `docs/tools/search_vault.md`, and remove their two lines from `docs/tools/index.md`. `executeHelp` is unchanged: with the files gone it returns `HELP_TOOL_NOT_FOUND`, and `notFound`'s `availableTools` (derived from the directory) names exactly the 35 offered tools. Update `docs/tools/help.md`'s `HELP_TOOL_NOT_FOUND` example to the 35-name list.
- **Rationale**: FR-002 and FR-003 without any handler change (FR-013). The directory is already the help tool's source of truth (FR-008 of the original help spec).
- **Alternatives considered**: a handler-side allow list built from the registry. Rejected: it changes the help tool's behaviour and couples the help handler to the registry (upward dependency, Principle I).

### D2 — The drift guard is a test, not a boot check

- **Decision**: add `src/tools/help/docs-sync.test.ts`. It builds the server with `quietServer()` (`_mcp-client-fixtures.ts`), lists the published tools over an in-memory client, and compares that set with (a) the `docs/tools/*.md` file names other than `index.md` and (b) the `- **<name>** —` entries of `docs/tools/index.md`. A small pure helper inside the test file, `helpDocsDrift(toolNames, pageNames, indexText)`, returns `{ orphanPages, missingPages, extraIndexEntries, missingIndexEntries }`. Its self-tests feed it a matching fixture (all four lists empty: the happy path) and drifted fixtures (an orphan page, a phantom index entry, a missing index entry: the failure path). Then the real check asserts all four lists are empty.
- **Rationale**: FR-012 and the Q3 clarification (the reverse of `assertToolDocsExist`, with a passing and a failing test). A test fails CI without changing server boot. It also avoids breaking the many `createServer` tests that point `docsDir` at partial fixture directories (`server.test.ts:230-…`). The structural-guardrail-with-self-tests shape follows `src/cli-adapter/architecture.test.ts` (refactor-decisions item 12). Keeping the helper inside the test file means no production symbol exists only for tests, which would trip post-implement check 4, and nothing new ships in `dist/` (refactor-decisions item 30).
- **Alternatives considered**: (1) extend `assertToolDocsExist` to fail boot on an orphan page or an index mismatch. Rejected: it is a boot-behaviour change outside FR-013, it needs `index.md` in every fixture docs directory, and a stray page is a packaging defect CI should catch, not a reason to refuse a user's server start. (2) Read tool names from `_register-baseline.json`. Rejected: that file is the fingerprint of the published surface, and the live `tools/list` is the authority (refactor-decisions item 26(a)).

### D3 — `create_base` gains a `mapValidationError` hook (Q1 = B)

- **Decision**: add a local `mapZodIssuesToToolError(issues)` to `src/tools/create_base/index.ts` and pass it as `mapValidationError`. It returns, for the first issue whose `params.code` is `INVALID_BASE_PATH`, `INVALID_NAME` or `CONTENT_TOO_LARGE`:

  ```text
  { code: "VALIDATION_ERROR",
    message: <that issue's message>,
    details: { code: params.code, reason?: params.reason, field: params.field, issues: <generic issue list> } }
  ```

  Otherwise it returns the generic envelope byte-for-byte (same message `create_base input failed schema validation`, same `issues` shape). `reason` is present only when the issue has one (`CONTENT_TOO_LARGE` has none). Issue order follows the superRefine (`base_path`, then `name`, then `content`), so "first" is deterministic.
- **Rationale**: Q1 = B and FR-008. `find_and_replace`'s mapper is the precedent for keeping `issues` next to `details.code` / `details.reason` (`find_and_replace/index.ts:50-154`). Keeping it is additive: no field an agent can read today disappears, and the existing `index.test.ts:130-143` assertion stays valid unchanged. The message reuses the schema's own issue message (as `prepend` does for its bytes limit), so no new wording is introduced. No new error code (Principle IV). `mapValidationError` only sees input-parse issues (refactor-decisions item 6).
- **Alternatives considered**: (1) drop `issues`, as `prepend` does. Rejected: it removes a field agents can read today, breaks an existing assertion (test edit, refactor-decisions item 5), and the clarification did not ask for removal. (2) A shared mapper in `_base-path.ts` also adopted by `views_base` and `query_base`. Rejected for this feature: those two tools are F5 (docs-only under FR-007) and F8 (out of scope). The local mapper is the minimum that FR-008 needs. A shared helper is the obvious extraction if the F8 follow-up adopts the same fix.
- **Published surface**: `CREATE_BASE_DESCRIPTION` already names the codes and sub-reasons without claiming another field. Under FR-008 as clarified (analysis I1 = A, ADR-040), only the help page must name the `details.*` fields, so the description is unchanged and the FR-018 baseline does not move. The help page's error roster and Example 5 are rewritten to state `details.code`, `details.reason`, `details.field` (and that `details.issues` keeps the full list).

### D4 — `rename`'s recovery hint names `move`

- **Decision**: change the `.regex` message (not its pattern) in `src/tools/rename/schema.ts:13` to "name must not contain folder separators; use move to relocate the file to a different folder". Update `rename.md:128` and `:283`. Change the three test assertions from `move_note` to `move` (as a word-bounded match, so `move_note` cannot satisfy it).
- **Rationale**: FR-004 and FR-005. The message is the published recovery hint, and its help page must agree with it. Fingerprint-neutral, since only the message changes and the published `pattern` stays the same.

### D5 — `write_note.md`'s migration example becomes a valid `obsidian_exec` call

- **Decision**: replace both `argv` examples (`:111`, `:240`) with `{ "name": "obsidian_exec", "arguments": { "command": "create", "vault": "MyVault", "parameters": { "path": "Daily/2026-05-10.md", "template": "Daily" } } }`. Keep the labelled legacy failing example at `:225`.
- **Rationale**: FR-006. The probe in F3 is re-run on the edited page to confirm it passes.

### D6 — Message and detail corrections in failing examples (docs only)

- `context_search.md` Example 6 and `search.md` Example 7: quote the messages with their `(FR-008)` / `(FR-010)` suffix as returned.
- `properties.md` Example 5 and the unknown-key sentence: quote the zod 4 messages.
- `views_base.md` Example 7: show the error as returned (`details.issues[0]` with `path: ["base_path"]`, message `INVALID_BASE_PATH/wrong-extension: base_path must end with .base`, `code: "custom"`). Also correct the same claim at `:5` and `:57`, since leaving the error table contradicting the corrected example on one page would recreate the drift.
- **Rationale**: FR-007 and FR-010. Changing the messages instead (for example dropping the `(FR-0xx)` suffixes) would be a behaviour change outside FR-013.

### D7 — `context_search.md` Example 4 shows the error as returned (Q2 = A)

- **Decision**: rewrite the envelope to `{ "code": "CLI_REPORTED_ERROR", "message": "CLI bridge upstream error: CLI_REPORTED_ERROR", "details": { "argv": ["<obsidian binary>", "folder", "path=DoesNotExist"], "command": "folder", "stdout": "Error: Folder \"DoesNotExist\" not found.\n", "stderr": "", "exitCode": 0, "message": "Error: Folder \"DoesNotExist\" not found." } }`. Step 5 of its sequence keeps "propagates verbatim". The page's prose says branch on `details.command === "folder"` plus `details.message`, never on the top-level message. No code changes. `src/cli-adapter/**` stays frozen.
- **Tests (analysis C2 = A)**: H7 in `context_search/handler.test.ts` gains assertions on `details.command` and `details.message`. A new `context_search/index.test.ts` case drives the registered tool and asserts the top-level `message`, so the fields the page tells agents to branch on are pinned. Test files only.
- **Rationale**: FR-009 and Q2. It matches F7.

### D8 — Vault names in examples (US5, FR-011)

- **Decision**: at implementation, read TC-00586 / TC-00587 (owner-authorised vault read) and fix each listed vault-name item. If the records cannot be read, check every example whose response or prose names a vault against its request and against current behaviour (for example, an example whose response reports a different vault than its request names). Placeholder names (`MyVault`, `Demo`, `Work`, `<vault name>`) are acceptable as they are.
- **Rationale**: the repository alone does not identify which vault names the audit flagged. The requirement fixes the outcome, and the spec's Assumptions already defer the list to the audit records.

### D9 — CHANGELOG and docs-as-code

- **Decision**: `CHANGELOG.md` `[Unreleased]` gets the spec line plus entries. Changed: `create_base` validation errors carry `details.code` / `details.reason` / `details.field`; `rename`'s hint names `move`. Removed: the `list_notes` / `search_vault` placeholder pages. Fixed: the help-page examples. `.docs-as-code/capabilities/escape-hatch-and-meta.md:152` (mentions the stubs) is updated by `/speckit-docs-as-code` after review, per the PR lifecycle.

## Follow-ups (out of scope)

1. `query_base` documents `details.reason` for `INVALID_BASE_PATH`, which its generic envelope does not carry (F8). The D3 mapper, extracted to `_base-path.ts`, is the candidate fix for `query_base` and `views_base` together.
2. `UPSTREAM_TIMEOUT` is documented by four Bases pages but never raised; the code is `CLI_TIMEOUT` (F8).
3. Both belong to the next run of the BI-0122 audit pattern.
