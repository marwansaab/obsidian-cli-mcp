---
description: "Task list for 073 — Align Parameter Names"
---

# Tasks: Align Parameter Names

**Input**: Design documents from `specs/073-align-parameter-names/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/parameter-names-contract.md](contracts/parameter-names-contract.md), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution Principle II requires co-located happy-path and failure-or-boundary tests for every modified tool, in the same change (plan, Constitution Check row II; research D10).

**Organization**: Tasks are grouped by user story. The three tools in scope are `find_by_property`, `find_and_replace` and `create_base`. Load the `karpathy-guidelines` skill before the first code task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1–US3)

## Rename tables (the single source every task below refers to)

| Tool | Old | New | Inverted | Default after transform |
|---|---|---|---|---|
| `find_by_property` | `property` | `name` | no | — (required concept) |
| `find_by_property` | `arrayMatch` | `array_match` | no | `true` |
| `find_by_property` | `caseSensitive` | `case_sensitive` | no | `true` |
| `find_and_replace` | `case_insensitive` | `case_sensitive` | **yes** | `true` |
| `find_and_replace` | `subfolder` | `folder` | no | absent (whole vault) |
| `create_base` | `path` | `base_path` | no | — (required concept) |
| `create_base` | `view` | `view_name` | no | absent |

The published key descriptions are in contract §1. Outcomes O1 to O7 are in contract §2.

---

## Phase 1: Setup

**Purpose**: Record the starting state.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` from the repository root and confirm all are green before any edit. Note any pre-existing failure in `specs/073-align-parameter-names/research.md` under a new "Implement log" heading, so later failures are attributable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared alias mechanics every tool uses (research D2).

**⚠️ CRITICAL**: No user-story task starts until T002 and T003 are done.

- [X] T002 Create `src/tools/_deprecated-params.ts`. It starts with the header line `// Original — no upstream. Shared deprecated-parameter-name mechanics for the family-name alignment (spec 073, research D1–D4, ADR-NNN): alias field builder, old+new conflict issue, notice collection and the deprecated_parameters result field.` and imports only `zod`. Export:
  - `interface ParameterRename { old: string; replacement: string; inverted?: boolean }`.
  - `deprecatedParameterSchema = z.strictObject({ parameter: z.string().min(1), replacement: z.string().min(1), note: z.string().min(1).optional() })` and `type DeprecatedParameter = z.infer<…>`.
  - `deprecatedParametersField`: `z.array(deprecatedParameterSchema).min(1).optional()`, described `"Present only when the call used a deprecated parameter name: each old name, its replacement and any note. Old names are accepted until the next major release."`.
  - `deprecatedAlias<T extends z.ZodType>(field: T, rename: ParameterRename)`: returns `field.optional()` with the description `Deprecated: use <replacement> (accepted until the next major release).`, or, when `inverted`, `Deprecated: use <replacement> with the opposite value (<old>: true equals <replacement>: false); accepted until the next major release.`, plus `.meta({ deprecated: true })`.
  - `appendAliasConflictIssue(ctx: z.RefinementCtx, input: Record<string, unknown>, rename: ParameterRename)`: when both `input[old]` and `input[replacement]` are `!== undefined`, add one custom issue with `path: [old]` and the message ``"`<old>` is deprecated and replaced by `<replacement>`; supply only `<replacement>`"``.
  - `collectDeprecatedParameters(input: Record<string, unknown>, renames: readonly ParameterRename[]): DeprecatedParameter[] | undefined`: one entry per rename whose `old` key is `!== undefined`, in table order. `note` is `"<old>: true equals <replacement>: false (opposite polarity)."` only when `inverted`. Returns `undefined` when there are none.
  - `withDeprecatedParameters<R extends object>(result: R, notices: DeprecatedParameter[] | undefined)`: returns `result` unchanged when `notices` is `undefined` or empty, otherwise `{ ...result, deprecated_parameters: notices }`.
- [X] T003 [P] Create `src/tools/_deprecated-params.test.ts` (header `// Original — no upstream.`) covering every export:
  - `deprecatedAlias` published JSON Schema (`["~standard"].jsonSchema.input({ target: "draft-2020-12" })`): the key carries `deprecated: true` and the exact description, in both the plain and the inverted form.
  - The conflict issue is raised when both keys are present (including equal values), and not when only one is.
  - `collectDeprecatedParameters`: order, the polarity note, `undefined` when none.
  - `withDeprecatedParameters`: identity on `undefined` and on `[]`, and the added field otherwise.
  - `deprecatedParametersField` rejects `[]` and accepts `undefined`.

**Checkpoint**: shared module green; tools can adopt it.

---

## Phase 3: User Story 1 — Same concept, same name across a family (Priority: P1) 🎯 MVP

**Goal**: The three tools accept the new names, with today's meaning and defaults (FR-001 to FR-009). The schema change also folds the old names in (research D1), because one transform carries both. User Story 2 then adds the visible notice and its tests.

**Independent Test**: Each tool, called with only new names, returns today's result. The published schemas of the property tools, the search and replace tools, and the Bases tools share the chosen names (quickstart §3, User Story 1).

### `find_by_property`

- [X] T004 [US1] Rewrite `findByPropertyInputSchema` in `src/tools/find_by_property/schema.ts`:
  - Define `FIND_BY_PROPERTY_RENAMES: readonly ParameterRename[]` (rows 1–3 of the rename table), exported for the tests.
  - Keys, in order: `vault`, `name` (`z.string().min(1).optional()`, contract description), `property` (`deprecatedAlias(z.string().min(1), …)`), `value` (unchanged, required), `folder` (unchanged), `array_match` (`z.boolean().optional()`, no `.default`, description as contract), `arrayMatch` (alias), `case_sensitive` (`z.boolean().optional()`, no `.default`, contract description), `caseSensitive` (alias).
  - In `superRefine`, in this order:
    1. call `appendAliasConflictIssue` for each rename;
    2. if both `name` and `property` are `undefined`, add a custom issue at `["name"]` with message `"name is required"`;
    3. compute `arrayMatch = v.array_match ?? v.arrayMatch ?? true` and keep the existing array check against it, with the message reworded to say `array_match` (`"value cannot be an array when array_match is true (default); pass a scalar for contains semantics, or set array_match: false for exact-equality."`).
  - Append `.transform((v) => ({ vault: v.vault, name: (v.name ?? v.property)!, value: v.value, folder: v.folder, array_match: v.array_match ?? v.arrayMatch ?? true, case_sensitive: v.case_sensitive ?? v.caseSensitive ?? true, deprecated_parameters: collectDeprecatedParameters(v, FIND_BY_PROPERTY_RENAMES) }))`. Omit keys whose value is `undefined` where the existing handler checks presence (`vault`, `folder`).
  - Update the header intent line to name the new keys, the aliases and spec 073.
- [X] T005 [US1] In `src/tools/find_by_property/handler.ts`, read `input.name`, `input.array_match` and `input.case_sensitive`. Keep the `composeEvalCode` payload keys `property`, `arrayMatch` and `caseSensitive` unchanged, because they are internal to the frozen `_template.ts` (research F1, F9). Do not touch `_template.ts`. Append "spec 073: reads the aligned names; payload keys unchanged" to the header.
- [X] T006 [P] [US1] Update `src/tools/find_by_property/schema.test.ts`:
  - Move every existing case to the new names.
  - Add a case that the defaults resolve to `array_match: true` and `case_sensitive: true`.
  - Add `{ value: "x" }` → an issue at `["name"]` with message `"name is required"`.
  - Add an array `value` with the default `array_match` → the reworded message.
  - Add that a folder traversal is still rejected.
- [X] T007 [P] [US1] Update `src/tools/find_by_property/handler.test.ts`. Move the inputs to the new names, and add one case that decodes the base64 `eval` payload from the recorded spawn argv. Assert that it holds the keys `property`, `arrayMatch` and `caseSensitive` with the input's values (byte-identical CLI call, research F9).

### `find_and_replace`

- [X] T008 [US1] Rewrite `findAndReplaceInputSchema` in `src/tools/find_and_replace/schema.ts`:
  - Define and export `FIND_AND_REPLACE_RENAMES` (rows 4–5; `case_insensitive` has `inverted: true`).
  - Replace `case_insensitive` with `case_sensitive` (`z.boolean().optional()`, no `.default`, contract description) followed by its alias `case_insensitive` (`deprecatedAlias(z.boolean(), …)`).
  - Replace `subfolder` with `folder` (`z.string().optional()`, contract description) followed by its alias `subfolder` (`deprecatedAlias(z.string(), …)`).
  - Reword the `file`, `path` and `active_note` descriptions and `SCOPE_CONFLICT_MESSAGES` so that `subfolder` reads `folder`. The reason keys stay unchanged.
  - In `superRefine`:
    1. call `appendAliasConflictIssue` for both renames first;
    2. compute `caseSensitive = v.case_sensitive ?? (v.case_insensitive === undefined ? true : !v.case_insensitive)` and `folder = v.folder ?? v.subfolder`;
    3. use `caseSensitive ? "" : "i"` for the regex syntax check;
    4. run the path-safety check on `folder`, with the issue at `path: ["folder"]` (params unchanged: `subCode: "INVALID_SUBFOLDER"`, `subReason: "path-traversal"`);
    5. compute `hasSubfolder` from `folder`.
  - Append a `.transform()` that returns every existing key except the two old ones, plus `case_sensitive: caseSensitive` (recomputed), `folder` (only when defined) and `deprecated_parameters: collectDeprecatedParameters(v, FIND_AND_REPLACE_RENAMES)`.
  - Update the header intent line.
- [X] T009 [US1] In `src/tools/find_and_replace/handler.ts`:
  - change the `compileFindRegex` call to `compileFindRegex(input.pattern, input.mode, !input.case_sensitive)`; `replace.ts` is unchanged;
  - change `effectiveSubfolder` to read `input.folder`, with its doc comment saying `folder`;
  - in `resolveScope`, change the not-found message to `` `find_and_replace: folder "${subfolder}" does not exist in vault` ``, keeping the `details` (`code: "INVALID_SUBFOLDER"`, `reason: "not-found"`, `subfolder`, `vault`) byte-identical (research D6);
  - update the stage comments that say "subfolder" only where they name the parameter.
- [X] T010 [US1] In `src/tools/find_and_replace/index.ts` `mapZodIssuesToToolError`, change `path0 === "subfolder"` to `path0 === "folder"` and the message to `"folder is not structurally safe"`. The `details.code` and `reason` stay unchanged. The description is rewritten in T021.
- [X] T011 [P] [US1] Move the `find_and_replace` test inputs to `case_sensitive` and `folder` (a `case_insensitive: true` input becomes `case_sensitive: false`, and an omitted one stays omitted) in:
  - `src/tools/find_and_replace/schema.test.ts`
  - `src/tools/find_and_replace/handler.test.ts`
  - `src/tools/find_and_replace/scope.test.ts`
  - `src/tools/find_and_replace/confirm.test.ts`
  - `src/tools/find_and_replace/__t0-driver.test.ts`
  - `src/tools/find_and_replace/index.test.ts`

  Update assertions on the reworded messages: the `SCOPE_CONFLICT` messages, `"folder is not structurally safe"`, the not-found message, and the issue path `["folder"]`. Add a schema case that the default resolves to `case_sensitive: true`. Assert that `INVALID_SUBFOLDER` details are unchanged.

### `create_base`

- [X] T012 [US1] Rewrite `createBaseInputSchema` in `src/tools/create_base/schema.ts`:
  - Define and export `CREATE_BASE_RENAMES` (rows 6–7).
  - Keys: `base_path: requiredString("base_path").optional().describe(…)`, so a wrong type still says `"base_path must be a string"`; `path` (`deprecatedAlias(requiredString("base_path"), …)`); `name` (unchanged); `content` (unchanged); `view_name` (`z.string().min(1).optional()`, contract description); `view` (alias); `vault` (unchanged).
  - In `superRefine`:
    1. call the conflict issues first;
    2. resolve `basePath = v.base_path ?? v.path`; when it is `undefined`, add a custom issue at `["base_path"]` with `"base_path is required"`; otherwise call `appendBasePathIssues(ctx, basePath, "base_path")`;
    3. keep the `name` and `content` checks unchanged.
  - Append a `.transform()` returning `base_path`, `name`, `content`, `view_name` (from `view_name ?? view`), `vault` and `deprecated_parameters`, leaving out the keys that are `undefined`.
  - Update the header (currently `// Original — no upstream.` only; append " create_base input/output schemas; spec 073 aligned names base_path / view_name with deprecated aliases path / view.").
- [X] T013 [US1] In `src/tools/create_base/handler.ts`, read `input.base_path` and `input.view_name`. The CLI parameter keys stay `path` and `view`, and the `BASE_NOT_FOUND` details keep the key `path` (contract §4). Update the `CREATE_BASE_SUPPORTED` doc comment that says "(`path`)" to "(`base_path`)".
- [X] T014 [P] [US1] Update `src/tools/create_base/schema.test.ts` and `src/tools/create_base/handler.test.ts`:
  - **Schema**: new names; `"base_path is required"` / `"base_path must be a string"`; INVALID_BASE_PATH issues carry `path: ["base_path"]` and `params.field: "base_path"`.
  - **Handler**: the recorded argv still contains `path=<…>.base` and `view=<…>` (byte-identical CLI call).
- [X] T015 [P] [US1] Update the comments that name create_base's field `path` in `src/tools/_base-path.ts` (header and the `field` doc), `src/tools/_base-path.test.ts` (line 3) and `src/tools/_required-string.ts` (header) to say `base_path`. No code change.

### Cross-tool

- [X] T016 [US1] In `src/tools/_register.test.ts`:
  - set the expected entries to these full key sets:
    - `find_by_property`: `properties_equals_set` = `["vault", "name", "property", "value", "folder", "array_match", "arrayMatch", "case_sensitive", "caseSensitive"]`, `required_equals` = `["value"]`;
    - `find_and_replace`: `properties_equals_set` = `["active_note", "case_insensitive", "case_sensitive", "commit", "file", "folder", "include_code_blocks", "include_html_comments", "mode", "path", "pattern", "replacement", "subfolder", "vault"]`, `required_equals` = `["pattern", "replacement"]` (unchanged);
    - `create_base`: `properties_equals_set` = `["base_path", "path", "name", "content", "view_name", "view", "vault"]`, `required_equals` = `["name"]`;
  - add one "family names" test over the published descriptors:
    - `read_property`, `set_property` and `find_by_property` all list `name`;
    - `search`, `context_search`, `pattern_search`, `find_by_property` and `find_and_replace` all list `case_sensitive` and `folder`;
    - `views_base`, `query_base` and `create_base` list `base_path`;
    - `query_base` and `create_base` list `view_name` (SC-001).
- [X] T017 [US1] In `src/tools/_register.test.ts`, add one "FR-008 shared wording" test over the published descriptors. For each concept, assert that the renamed key's description starts with the shared opening from contract §1 ("FR-008 shared wording"), and that the sibling it was copied from still carries that wording:
  - `find_by_property.name` starts with `Frontmatter property name to match, matched exactly (e.g. "status").`, and `read_property.name` contains `matched exactly (e.g. "status").`;
  - `find_by_property.case_sensitive` and `find_and_replace.case_sensitive` start with `Match case exactly when true.`, as do the `search`, `context_search` and `pattern_search` `case_sensitive` descriptions;
  - `find_and_replace.folder` starts with the exact `context_search.folder` description;
  - `create_base.base_path` starts with `BASE_PATH_DESCRIPTION` (import it from `src/tools/_base-path.ts`), which equals `query_base.base_path`'s description;
  - `create_base.view_name` and `query_base.view_name` both start with `Exact, case-sensitive name of the view to`.

  This is the FR-008 check that the analysis found missing (C1). It needs the descriptions from T004, T008 and T012.
- [X] T018 [US1] In `src/tools/_typed-result-fixtures.ts`, change the `create_base` fixture args to `{ base_path: "Tasks.base", name: "New item" }` and the `find_by_property` args to `{ vault: "Demo", name: "id", value: "BI-030" }`. These are consumed by the `_surface.test.ts` typed-result round trip.

**Checkpoint**: `npm run typecheck` and `npm test` are green except the baseline test (fingerprints move; T025 regenerates them). Every new-name call returns today's result.

---

## Phase 4: User Story 2 — Old names keep working for a transition period (Priority: P2)

**Goal**: The old names give the same result plus a `deprecated_parameters` notice. Old plus new is rejected, and the old keys stay published and marked deprecated (FR-010 to FR-013, clarify Q1). The post-transition rejection (FR-014, scenarios 4 and 5) belongs to the follow-up feature in the next major release; nothing here implements it.

**Independent Test**: For each tool, old-name calls match the new-name results and carry the notice in both the text and `structuredContent`. Conflicts are rejected before any spawn or read (quickstart §3, User Story 2).

- [X] T019 [US2] Declare the result field (research D4, contract §3): add `deprecated_parameters: deprecatedParametersField` to `findByPropertyOutputSchema` (`src/tools/find_by_property/schema.ts`), to both `previewBranchSchema` and `commitBranchSchema` (`src/tools/find_and_replace/schema.ts`), and to `createBaseOutputSchema` (`src/tools/create_base/schema.ts`). Leave the existing internal `.parse`/`.safeParse` uses in the handlers as they are (the field is absent there, research F5).
- [X] T020 [US2] Attach the notice in each registration wrapper:
  - `src/tools/find_by_property/index.ts`: `handler: async (input, d) => withDeprecatedParameters(await executeFindByProperty(input, d), input.deprecated_parameters)`.
  - `src/tools/find_and_replace/index.ts`: replace `handler: executeFindAndReplace` with `async (input, d, call) => withDeprecatedParameters(await executeFindAndReplace(input, d, call), input.deprecated_parameters)`.
  - `src/tools/create_base/index.ts`: `async (input, d) => withDeprecatedParameters(await executeCreateBase(input, d), input.deprecated_parameters)`.

  `registerTool` is not edited.
- [X] T021 [US2] Rewrite the three tool descriptions (`FIND_BY_PROPERTY_DESCRIPTION`, `FIND_AND_REPLACE_DESCRIPTION`, `CREATE_BASE_DESCRIPTION`) in their `index.ts` files to the new names everywhere (FR-018).
  - `find_by_property`: remove the "**NOTE — the property-name parameter is `property:`…**" paragraph, and change the inputs line to `{ vault?, name, value, folder?, array_match?, case_sensitive? }`.
  - `create_base`: change the response sentence to note that `path` in the *response* is the created item's path.
  - All three: end with one sentence: ``Deprecated names (accepted until the next major release; a call that uses one gets `deprecated_parameters` in its result): `<old>` → `<new>`, ….`` For `find_and_replace`, add "(opposite value)" after `case_insensitive` → `case_sensitive`.
  - Keep every other sentence unchanged.
- [X] T022 [P] [US2] Add old-name schema cases to `src/tools/find_by_property/schema.test.ts`, `src/tools/find_and_replace/schema.test.ts` and `src/tools/create_base/schema.test.ts`, per contract §2:
  - **O2**: each old name parses to the same normalised object as its new-name twin, plus the expected `deprecated_parameters`.
  - **O3**: `case_insensitive` `true` / `false` → `case_sensitive` `false` / `true`, with the note.
  - **O4**: each old+new pair, including equal values, gives one issue at `[old]` whose message names both.
  - **O6**: an old name with an invalid value gives an issue at the new path with the new name (for example `subfolder: "../x"` → `["folder"]`; `path: "x.md"` → INVALID_BASE_PATH `wrong-extension`, `field: "base_path"`).
  - **Published JSON Schema**: old keys have `deprecated: true` and the contract description; `required` matches contract §1; and `array_match`, `case_sensitive` (both tools) carry no `default`.
- [X] T023 [P] [US2] Add registration-level cases to `src/tools/find_by_property/index.test.ts`, `src/tools/find_and_replace/index.test.ts` and `src/tools/create_base/index.test.ts`. Call the registered `handler` with stubbed deps and assert:
  - **O1**: a new-name call's `structuredContent` has no `deprecated_parameters`.
  - **O2**: an old-name call returns `structuredContent.deprecated_parameters` as expected, and `JSON.parse(content[0].text)` equals `structuredContent`.
  - **O4**: a conflict returns `isError: true` / `VALIDATION_ERROR`, and the spawn (or, for `find_and_replace`, the in-memory filesystem) recorded zero calls.
  - **O7**: `find_and_replace` `subfolder` + `path` returns `SCOPE_CONFLICT` / `note+folder`.
  - **Descriptions**: the new description text, including the deprecated-names sentence, and the absence of the old `property:` NOTE paragraph.
- [X] T024 [US2] Add three old-name fixtures to `src/tools/_typed-result-fixtures.ts`, so that the `_surface.test.ts` round trip checks the notice against the published output schema through a real client:
  - `create_base` with `{ path: "Tasks.base", name: "New item", view: "All" }`;
  - `find_by_property` with `{ vault: "Demo", property: "id", value: "BI-030" }`;
  - `find_and_replace` with `{ vault: "V", pattern: "alpha", replacement: "gamma", case_insensitive: true, subfolder: "Notes" }`.

  Depends on T019.
- [X] T025 [US2] Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Confirm that only `find_by_property`, `find_and_replace` and `create_base` changed, and in each only `descriptionFingerprint`, `schemaFingerprint` and `outputSchemaFingerprint` (contract §5). If any other entry moved, stop and find the cause before continuing.

**Checkpoint**: full `npm test` green; old-name calls work with the notice.

---

## Phase 5: User Story 3 — A written naming convention (Priority: P3)

**Goal**: ADR-NNN records the families, shared concepts, chosen names, renames and exceptions (FR-016, FR-017; clarify Q2).

**Independent Test**: The mirror page lists everything in data-model "Convention record": 7 renames and 6 exceptions with reasons (quickstart §3, User Story 3).

- [X] T026 [US3] Write the verbatim repository mirror `.docs-as-code/decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md`. Keep the literal placeholder `ADR-NNN` in the file name and title: the number is not allocated, and the vault and repository numbering have drifted.
  - **Layout**: follow `.docs-as-code/decisions/ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md` (title, Status/Date/Source/Related bullets, Context, Decision, Consequences).
  - **Status**: `Accepted — number not yet allocated; the canonical vault copy (200-Decisions/) is pending sync, after which this mirror is kept byte-equal to it`.
  - **Source**: spec `specs/073-align-parameter-names/`, BI-0109, clarify Q2.
  - **Related**: ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand), the tool-name sibling convention. Cite it by ID and title, with no link to the gitignored file.
  - **Contents**:
    - the families → shared concepts → chosen names table;
    - the 7-row rename table, with status "accepted with notice until the next major release";
    - the 6 FR-017 exceptions with reasons;
    - the FR-008 shared-wording rule;
    - the transition and its end state (removal follow-up at the next major release);
    - the rule for new tools.
  - **No Constitution Compliance row.**
  - **Do not write**: `.decisions/`, the Decision Log or the vault. The owner allocates the number and writes the canonical vault copy at sync (FR-016; ADR-010 Implementation).
- [X] T027 [US3] Record the pending sync in `specs/073-align-parameter-names/research.md`, under a new "Pending vault sync" heading. List every place that carries the `ADR-NNN` placeholder, so that the owner can replace it in one pass after allocating the number:
  - the mirror's file name and title (T026);
  - the header line of `src/tools/_deprecated-params.ts` (T002);
  - any `CHANGELOG.md` or `docs/tools/*.md` text that cites it (T028–T032).

  Also record the sync steps: allocate the number in the vault's `200-Decisions/`, write the vault copy, then rename the mirror so that the two are byte-equal.

**Checkpoint**: a maintainer can check any parameter against the ADR.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 [P] Update `docs/tools/find_by_property.md` to the new names: the parameter table, examples and the property-name divergence note, which is removed. Add a "Deprecated names" table (old → new, accepted until the next major release, the `deprecated_parameters` result field).
- [X] T029 [P] Update `docs/tools/find_and_replace.md` the same way, including the `case_insensitive` → `case_sensitive` polarity row, and `folder` in the scope section and the recovery hints ("narrow the scope with `folder`").
- [X] T030 [P] Update `docs/tools/create_base.md` (`base_path`, `view_name`, the deprecated table, and a note that the response's `path` is the created item) and the `create_base` line in `docs/tools/index.md` (`view` → `view_name`).
- [X] T031 [P] In `README.md` line 180, change "A commit limited to a `subfolder` still asks." to "A commit limited to a `folder` still asks."
- [X] T032 [P] Add to `CHANGELOG.md` `[Unreleased]` a "Spec 073-align-parameter-names (BI-0109)." line, then:
  - a `Changed` entry listing the seven renames by tool;
  - a `Deprecated` entry: old names accepted with a `deprecated_parameters` notice until the next major release, and old+new in one call rejected.
- [X] T033 Run `npm run typecheck`, `npm run lint`, `npm run build` and `npm test`, and work through quickstart §1–§3. Record the results in `specs/073-align-parameter-names/research.md` under "Implement log".
- [X] T034 Post-implement structural verification: run `codegraph sync`, then `codegraph_explore` on `_deprecated-params.ts` exports, `executeFindByProperty`, `executeFindAndReplace` and `executeCreateBase`. Check the five points in plan "Post-implement structural verification" and record the outcome in `research.md` "Implement log".
- [X] T035 Optional: the live check in quickstart §4. Read `.memory/test-execution-instructions.md` first and follow it, including cleanup. Record the outcome or "skipped" in `research.md` "Implement log".

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → Phase 3 → Phase 4**: strictly in order. US2 extends the same `schema.ts` and `index.ts` files that US1 rewrites, and its tests need the US1 transform.
- **Phase 5 (US3)**: T026 depends only on the decisions (research D8, data-model), so it can run in parallel with Phase 3 or 4. T027 runs after T002, T026 and T028–T032, because it lists every place that carries the `ADR-NNN` placeholder.
- **Phase 6**: T028–T032 can start after T021 (the final description wording). T033 runs after everything except T035, including T027. T034 runs after T033.

**Within Phase 3**:

- T004 → T005 → (T006 ∥ T007);
- T008 → T009 → T010 → T011;
- T012 → T013 → T014;
- the three tool blocks are independent of each other (different files) and can run in parallel;
- T015 is parallel with all of them;
- T016, T017 and T018 come after the three tool blocks.

**Within Phase 4**: T019 → T020 → T021 → (T022 ∥ T023) → T024 → T025.

## Parallel Example: User Story 1

```text
# After T002–T003, the three tool blocks in parallel:
Block A: T004 → T005 → T006 ∥ T007   (find_by_property)
Block B: T008 → T009 → T010 → T011   (find_and_replace)
Block C: T012 → T013 → T014          (create_base)
Alongside: T015 (comments)
Then: T016, T017, T018
```

## Parallel Example: User Story 2

```text
After T021: T022 (three schema.test.ts files) ∥ T023 (three index.test.ts files)
```

## Implementation Strategy

- **MVP**: Phases 1–3 (US1). Sibling calls work with the new names, and the old names already fold through the transform, so nothing breaks. The notice, its tests and the baseline follow in US2. Ship US1 and US2 together, because the baseline gate (T025) needs the final output schemas.
- **Increment 2**: Phase 4 (US2) completes the transition contract.
- **Increment 3**: Phase 5 (US3) writes the convention record, then the Phase 6 docs.

## Notes

- **CodeGraph pair check (`/speckit-tasks` rule)** at HEAD `37ec913`. The task pairs crossing modules were queried:
  - **`appendBasePathIssues` ↔ `createBaseInputSchema` / `queryBaseInputSchema`**: the helper is shared with `query_base` and `views_base`. Only `create_base`'s call site changes (T012), and the helper itself is untouched, so no dependency note is needed for those tools.
  - **`TYPED_RESULT_FIXTURES` ↔ `createFindByPropertyTool` / `createCreateBaseTool` / `findReplaceTool`**: the fixtures are consumed by `_surface.test.ts`'s typed-result round trip, which validates results against the *published* output schema. Hence T024 depends on T019, and T018 must land with T004/T012 to keep the round trip green.
  - **`executeFindAndReplace` → `resolveScope` / `multiNoteCommitQuestion` → `effectiveSubfolder`**: both readers are covered by T009's single change to `effectiveSubfolder`.
  - **`_deprecated-params.ts` ↔ the three tools**: a new leaf module with no existing path; downward imports only.
- **Machine-readable surface**: error codes, `details` keys, existing result fields and CLI arguments must stay byte-identical (contract §4). The only deliberate machine-readable move is `params.field` on `create_base` (`path` → `base_path`).
- **Out of scope here**: the removal follow-up (FR-014), stderr logging of old-name use, and the `.docs-as-code/` page updates other than the ADR-NNN mirror. The last of these is `/speckit-docs-as-code` after review.
