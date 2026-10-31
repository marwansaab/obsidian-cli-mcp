# Research: Align Parameter Names

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-31

Findings (F) are facts read from the code at HEAD `37ec913`, or from probes run at plan time. Decisions (D) are the choices this plan makes, each with its rationale and the alternatives rejected.

## Findings

### F1 — The renamed parameters live in three tool modules

| Tool | Old key (schema) | Where the handler reads it |
|---|---|---|
| `find_by_property` | `property`, `arrayMatch`, `caseSensitive` (`src/tools/find_by_property/schema.ts:18,36,41`) | `executeFindByProperty` passes them into the `eval` payload as `property`, `arrayMatch` and `caseSensitive` (`handler.ts:22-28`). The payload keys are internal to the frozen `_template.ts` and are not published. |
| `find_and_replace` | `case_insensitive`, `subfolder` (`schema.ts:51-55`) | `scanNotes` → `compileFindRegex(input.pattern, input.mode, input.case_insensitive)` (`handler.ts:290`). `effectiveSubfolder` (`handler.ts:514`) feeds `resolveScope` and `multiNoteCommitQuestion`. The schema's `superRefine` uses both keys: the regex flag check, the `subfolder` path-safety check and the scope-conflict matrix. |
| `create_base` | `path`, `view` (`schema.ts:12,20`) | `executeCreateBase` forwards them to `base:create` as the CLI parameters `path` and `view` (`handler.ts:33-38`). It also uses `input.path` for the created item's directory (`handler.ts:92-93`) and for `BASE_NOT_FOUND` details. |

No other production module reads these keys. The only other references are pinned test data: `_register.test.ts:581,607,616` (published property sets), `_typed-result-fixtures.ts:142,169` (fixture args), and the docs listed in F7.

### F2 — Every tool parses its input with its own zod schema inside `registerTool`

`registerTool` (`src/tools/_register.ts:188-238`) runs `spec.schema.parse(args)` and hands the *output* of that parse to the handler. It then checks the handler's result with `spec.outputSchema?.parse(result)` and sends the same object as text JSON and as `structuredContent` (lines 234-237). The published input JSON Schema is the zod schema's own input-side emission (`toSdkInputSchema`, line 107). So an object-level `.transform()` on an input schema:

- publishes the pre-transform shape, which keeps both old and new keys visible to clients (FR-013);
- hands the handler the post-transform shape, which holds only the new names (types via `z.infer`, Principle III).

**Probe (plan time, zod 4.4.3)**: for `z.strictObject({...}).superRefine(...).transform(...)`, `~standard.jsonSchema.input({ target: "draft-2020-12" })` emits `type: "object"` with every declared key and `additionalProperties: false`. `parse` returns the transformed object, and a `superRefine` issue blocks the transform. `tag/schema.ts:12-13` already uses field-level transforms on a published input schema.

### F3 — Defaults hide whether a key was sent

`find_by_property.arrayMatch` and `caseSensitive`, and `find_and_replace.case_insensitive`, use `.optional().default(…)`. After parsing, a defaulted key is always present, so a refinement cannot tell "sent `case_sensitive`" from "defaulted `case_sensitive`". Detecting old-plus-new conflicts (FR-012) therefore needs the new keys to be plain `.optional()`, with the default applied after the conflict check.

### F4 — `deprecated: true` is publishable

**Probe**: `z.string().optional().describe("…").meta({ deprecated: true })` emits `"deprecated": true` next to the description in the published JSON Schema (draft 2020-12, `deprecated` is a standard meta-data keyword). Clients that understand it can flag the key. Clients that don't still see the "Deprecated:" description.

### F5 — Output schemas are strict and reused inside handlers

- `findByPropertyOutputSchema` is a `strictObject` and also validates the `eval` response (`handler.ts:57`).
- `createBaseOutputSchema` is a `strictObject` and is `.parse`d inside `executeCreateBase` (`handler.ts:97`).
- `findAndReplaceOutputSchema` is a discriminated union of two strict branches with a `superRefine` (`schema.ts:207-226`).

An optional result field added to each of these is harmless to the internal uses (the field is absent there), and it must be declared or `registerTool`'s output check reports `INTERNAL_ERROR`.

### F6 — Validation-error mapping

- `find_and_replace` has its own `mapValidationError` (`index.ts:47-151`). It keys on `issue.path[0]` (`"subfolder"` → `INVALID_SUBFOLDER`/`path-traversal`, message `"subfolder is not structurally safe"`) and on `params.subCode === "SCOPE_CONFLICT"`. An issue it does not recognise falls through to the generic `VALIDATION_ERROR` with the `issues` list.
- `create_base` and `find_by_property` use the generic `toValidationError` (`_register.ts:179-186`).
- `create_base` builds its `.base` path issues through `appendBasePathIssues(ctx, value, field)` (`_base-path.ts:29`), which threads `field` into the issue `path`, the message and `params.field`.
- `requiredString(field)` (`_required-string.ts:14`) gives the `"<field> is required"` / `"<field> must be a string"` messages that per-tool tests pin.

### F7 — Documentation surface

- **Descriptions**: the three tool descriptions name the old keys (`find_by_property/index.ts:12-20` even carries a "NOTE — the property-name parameter is `property:`" paragraph; `find_and_replace/index.ts:15,21,24,29,36`; `create_base/index.ts:13`).
- **Reference pages**: `docs/tools/find_by_property.md`, `docs/tools/find_and_replace.md`, `docs/tools/create_base.md`, and the `create_base` line in `docs/tools/index.md` (mentions `view`).
- **Elsewhere**: `README.md:180` mentions a commit "limited to a `subfolder`". `.docs-as-code/architecture.md` and `.docs-as-code/capabilities/mutate.md` mention the old names; they are updated by `/speckit-docs-as-code` after review.
- **Server instructions** (`src/instructions/instructions.ts`) name the tools but none of the renamed keys, so they are unchanged.

### F8 — Fingerprint baseline

`src/tools/_register-baseline.json` stores five fingerprints per tool, regenerated by `npm run baseline:write` (`scripts/write-register-baseline.ts`). Renaming keys moves `schemaFingerprint`; the new result field moves `outputSchemaFingerprint`; reworded descriptions move `descriptionFingerprint`. Titles and annotations do not change.

### F9 — No CLI interaction changes

Each tool's `invokeCli` call is byte-identical before and after:

- the `eval` payload keys of `find_by_property`;
- the `base:create` parameters `path` and `view` of `create_base`;
- `find_and_replace`'s filesystem walk.

There is no new upstream behaviour to characterise, so no T0 live-CLI gate is required. Live validation is an optional quickstart scenario.

### F10 — ADR numbering

`.decisions/` (gitignored) holds up to ADR-040, plus the Decision Log. `.docs-as-code/decisions/` holds the tracked mirrors ADR-039 to ADR-045. The vault and repository numbering have drifted, so this feature does not allocate a number. The ADR's canonical authoring location is the vault (`200-Decisions/`); the repository holds a verbatim tracked mirror, kept byte-equal after each sync (ADR-010 Implementation; owner's Q2 ruling on BI-0109). This feature writes only the mirror, under the placeholder `ADR-NNN`; the number is allocated at sync.

## Decisions

### D1 — Old names are alias keys in the same zod schema, folded by a transform

Each affected input schema declares both names: the new key, and the old key marked deprecated. Its `superRefine` rejects old-plus-new pairs and validates the *resolved* value under the new name. A final `.transform()` returns an object that holds only the new names, with defaults applied. When old names were used, it also holds a `deprecated_parameters` list of them; otherwise the key is absent.

Handlers read the new names only, so their bodies change only in which key they read.

- **Rationale**: the zod schema stays the single source of truth for the published shape (both names), the runtime parse (conflicts, validation), and the handler's type (new names only) — Principle III. No change to `registerTool`, which is among the most-depended-on symbols (F2).
- **Rejected — a generic alias table in `registerTool`** that rewrites `args` before parsing. The published schema would still have to declare the old keys separately, so the shape would live in two places. It also widens the change to every tool's registration path for three tools' benefit.
- **Rejected — `z.preprocess`**: its input side is a transform, which zod cannot render as input JSON Schema, so the old keys would not be published.

### D2 — One small shared leaf module for the alias mechanics

`src/tools/_deprecated-params.ts` (new, `Original — no upstream`). It is a leaf util beside `_base-path.ts` and `_required-string.ts`, and imports only `zod`. It exports:

- `deprecatedAlias(field, rename)` — wraps a zod field as optional and adds the `Deprecated: use \`<replacement>\` …` description and `.meta({ deprecated: true })`;
- `appendAliasConflictIssue(ctx, input, rename)` — adds one custom issue when both keys are present;
- `collectDeprecatedParameters(input, renames)` — builds the notice entries for the old names used;
- `deprecatedParameterSchema` / `deprecatedParametersField` — the result-field schema of D4;
- `withDeprecatedParameters(result, notices)` — returns `result` unchanged when `notices` is `undefined` or empty, otherwise `{ ...result, deprecated_parameters: notices }`.

- **Rationale**: three tools need the same four behaviours. One copy keeps the message wording and the result field identical across them (FR-011's "same name on all three").
- **Rejected — per-tool copies**: they would drift, and FR-011 requires identical wording.

### D3 — New keys carry no zod default; defaults move into the transform

`find_by_property.array_match` and `case_sensitive`, and `find_and_replace.case_sensitive`, become plain `.optional()`. The transform applies today's defaults (`true`, `true`, and `true` respectively), so behaviour is unchanged (FR-009, which means runtime defaults; spec Assumptions). Their descriptions keep stating the default. The published JSON Schema loses the `"default"` keyword for these three keys during the transition.

- **Rationale**: conflict detection needs presence (F3). Publishing a default for a key that has a deprecated alias also invites clients that auto-fill defaults to send both names and be rejected.
- **Rejected — keep `.default()` and let the new key silently win**: this breaks FR-012 (old plus new must be rejected) and hides the conflict from the caller.

### D4 — The deprecation notice field

Each of the three output schemas gains `deprecated_parameters` (optional, at least one entry). Every entry is `{ parameter, replacement, note? }`:

- `parameter` is the old name used;
- `replacement` is the new name;
- `note` appears only for `case_insensitive`, and says that `case_insensitive: true` equals `case_sensitive: false`.

On `find_and_replace` the field is declared on both union branches. Entries follow the order of the tool's rename table. The field is attached in each tool's `index.ts` handler wrapper by `withDeprecatedParameters`, after the handler returns, so handlers stay unaware of it and `registerTool` checks it like any other field.

- **Rationale**: this is clarify Q1, option A — in the result object, identical in text and `structuredContent`, absent when only new names are used. Snake case follows the server's parameter and result style.

### D5 — Required keys during the transition

`find_by_property.name` and `create_base.base_path` are required concepts that can now arrive under either name. Both keys are optional in the published schema, and `required` loses `property` and `path`. When neither name is given, `superRefine` adds `"name is required"` / `"base_path is required"` at the new key's path (the `requiredString` wording, F6), so the error names the new parameter.

- **Rationale**: a call carrying only the old name must validate during the transition (FR-010). The published descriptions still say which key is required. The removal follow-up restores `required`.
- **Rejected — keep the new key `required`**: every old-name call would fail, which contradicts FR-010.

### D6 — Errors name the new parameter; machine-readable codes stay

Every validation issue for a renamed concept uses the new name in its issue `path`, its message and, where present, `params.field`, whichever key the caller used. Specifically:

- **`find_and_replace` path safety**: the folder path-safety issue moves to `path: ["folder"]`. The mapper keys on `"folder"` and says `"folder is not structurally safe"`. `details.code: "INVALID_SUBFOLDER"` and `reason: "path-traversal"` are unchanged.
- **`find_and_replace` scope conflicts**: the `SCOPE_CONFLICT` messages say `folder` instead of `subfolder`; the reasons (`note+folder`, `active+folder`) are unchanged.
- **`find_and_replace` missing folder**: the not-found message says `folder "<x>" does not exist in vault`. The `details` keep `code: "INVALID_SUBFOLDER"`, `reason: "not-found"` and the `subfolder` key, so the machine-readable shape is byte-stable.
- **`create_base`**: `appendBasePathIssues(ctx, resolved, "base_path")`, so INVALID_BASE_PATH issues carry `field: "base_path"` and the new name in their message. `BASE_NOT_FOUND` details keep their `path` key.
- **`find_by_property`**: the array-value refinement message says `array_match`.

- **Rationale**: these are the spec's Edge Cases "Old name with an invalid value" and "Error sub-codes that mention an old name", and FR-009 (codes unchanged). `params.field` on `create_base` moves from `path` to `base_path` because it names the parameter, which is what the spec asks of error text.

### D7 — Old-plus-new conflict wording

One issue per conflicting pair, at `path: [<old>]`, with the message ``"`<old>` is deprecated and replaced by `<new>`; supply only `<new>`"``. It surfaces through each tool's existing channel as `VALIDATION_ERROR` with the `issues` list. No new `details.code`.

- **Rationale**: the message names both names (FR-012). Zero new codes or sub-codes (Principle IV, ADR-015 additive-only rule not exercised).

### D8 — The convention record is ADR-NNN

ADR-NNN, "Shared Parameter Names Within a Tool Family", is a sibling of ADR-010. This feature writes the tracked repository mirror `.docs-as-code/decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md`, with a Status line noting that the number is not yet allocated and that the vault copy (canonical, `200-Decisions/`) is pending sync. Nothing is written to `.decisions/` or to the vault in this feature. At sync, the owner allocates the number, writes the vault copy and renames the mirror, so that the two are byte-equal. Contents:

- the families and their shared concepts, with the chosen names;
- the rename table (old → new, status "accepted with notice until the next major release");
- the FR-017 exceptions with reasons;
- the rule for new tools: reuse the family's name for a shared concept, use snake case, and add a deprecated alias with a notice for any future rename.

No constitution change, and no Constitution Compliance row (clarify Q2).

### D9 — Descriptions and docs

- **Descriptions**: each of the three tool descriptions is rewritten to the new names, with one sentence naming the old names and the transition. The `find_by_property` "NOTE — `property:` not `name:`" paragraph is replaced by that sentence.
- **Parameter descriptions** (FR-008): each new key opens with its siblings' wording of the shared concept, verbatim, then adds only its own default or a visible input rule. The concept table is in contract §1, "FR-008 shared wording". `folder` copies `context_search`/`pattern_search` verbatim and adds `find_and_replace`'s combination rule. `case_sensitive` opens "Match case exactly when true." and adds the tool's default. `name` follows `read_property`'s sentence with the verb "match". `base_path` reuses `BASE_PATH_DESCRIPTION`. `view_name` follows `query_base`'s sentence without its length range, because `create_base` sets no maximum (FR-009). Old keys read `Deprecated: use \`<new>\` (accepted until the next major release).` plus any polarity note.
- **Reference pages**: `docs/tools/{find_by_property,find_and_replace,create_base}.md` move to the new names, with a "Deprecated names" table.
- **Other docs**: `docs/tools/index.md` (the `create_base` line) and `README.md:180` move to the new names.
- **Changelog**: `CHANGELOG.md [Unreleased]` gets `Changed` and `Deprecated` entries.
- **`.docs-as-code/`**: updated by `/speckit-docs-as-code` after review.

### D10 — Tests (Principle II)

Per tool, co-located:

- **`schema.test.ts`**:
  - new names parse;
  - each old name parses to the same normalised input, with the matching `deprecated_parameters` entry;
  - `case_insensitive` inversion for `true`, `false` and omitted;
  - old plus new is rejected with the conflict message, including when both values agree;
  - neither name for a required concept fails with `"<new> is required"`;
  - an old name with an invalid value produces an issue naming the new parameter;
  - published JSON Schema: both keys present, the old key has `deprecated: true`, `required` as in D5, no `default` on the three keys of D3.
- **`index.test.ts`**:
  - a call through `registerTool` with old names returns `deprecated_parameters` in both text and `structuredContent`;
  - a new-name call has no field;
  - the description assertions use the new wording.
- **`handler.test.ts`**:
  - existing cases move to the new names;
  - the CLI arguments `find_by_property` and `create_base` send are byte-identical (F9).
- **Cross-tool**:
  - `_register.test.ts` property sets and `required` lists are updated;
  - `_typed-result-fixtures.ts` moves to the new names and gains one old-name fixture each for `find_by_property`, `find_and_replace` and `create_base`, so the `_surface.test.ts` typed-result round trip checks the notice against the published output schema;
  - baseline regenerated; the reviewer checks that only these three tools' fingerprints moved.
- **Shared module**: `src/tools/_deprecated-params.test.ts` covers the shared helpers.

### D11 — Out of this feature

- Removal of the old names, the post-transition rejection (FR-014, User Story 2 scenarios 4 and 5, SC-003) and restoring `required`: the follow-up feature in the next major release.
- Logging old-name use to stderr: not requested, so not added.
- `.docs-as-code/` page updates: `/speckit-docs-as-code`.

## Implement log

Run on 2026-10-31 from HEAD `21a4eea`, on Windows.

### T001 — Starting state

`npm run typecheck`, `npm run lint` and `npm test` were green before any edit: 158 test files passed (1 skipped), 3391 tests passed (6 skipped). No pre-existing failure.

### T033 — Automated gate and quickstart §1–§3

- `npm run typecheck`, `npm run lint` and `npm run build`: clean.
- `npm test`: 159 test files passed (1 skipped, the live `__t0-driver.test.ts`), 3452 tests passed (6 skipped). Coverage 97.06 % statements, 94.71 % branches, 92.33 % functions, 97.94 % lines.
- Quickstart §2 (baseline): `npm run baseline:write` moved only `find_by_property`, `find_and_replace` and `create_base`, each in `descriptionFingerprint`, `schemaFingerprint` and `outputSchemaFingerprint`, plus the `generatedFromBranch` stamp. No `title` or `annotations` fingerprint and no other tool moved (contract §5).
- Quickstart §3: User Story 1 is asserted by the "family names" test in `_register.test.ts`; User Story 2 by the `index.test.ts` cases O1, O2, O4 and O7 of each tool (spawn and filesystem fakes record zero calls on a conflict); User Story 3 checked by reading the ADR-NNN mirror (5 families, the shared concepts of data-model "Convention record", 7 renames, 6 exceptions with reasons).

**Deviations from the task text, for review:**

- **T017, sibling wording.** `pattern_search.case_sensitive` reads `Match case exactly when true; false adds the regex i flag. Default true.`, so it does not start with `Match case exactly when true.` (with a period). The test asserts the contract §1 sibling opening `Match case exactly when true` for the three search tools, and the full `Match case exactly when true.` for the two renamed keys.
- **R2 scope.** As designed in T004, T008 and T012, each deprecated key carries its base type (and `min(1)` where the new key has it), so a type or empty-string error on the old key itself (for example `property: ""`, `arrayMatch: "x"`, `view: ""`) is reported at the old key's path with zod's built-in message. `path: 42` reports at `["path"]` with the message `base_path must be a string`. Every custom rule runs on the resolved value and names the new parameter: the `find_and_replace` folder path-safety and scope checks, `create_base`'s `INVALID_BASE_PATH` issues and `base_path is required`, `find_by_property`'s `name is required` and array check.
- **`create_base` required `name`.** `name` stays in the published `required`. When `name` is missing, zod stops before the object-level refinement, so a call missing both `name` and `base_path` reports only `name is required` (before this change it reported both).

### T034 — Post-implement structural verification

`codegraph sync`, then `codegraph_explore` on the `_deprecated-params.ts` exports, `executeFindByProperty`, `executeFindAndReplace` and `executeCreateBase`:

1. No new error class or code. `src/errors.ts` is unchanged; conflicts and missing names are zod issues on the existing `VALIDATION_ERROR` channel. One `UpstreamError` message (the `find_and_replace` folder not-found) is reworded; its code and `details` are byte-identical (handler test).
2. No handler imports `createLogger` or `createQueue`; `src/server.ts` is unchanged.
3. `_deprecated-params.ts` imports only `zod`. Its importers are exactly the three tools' `schema.ts` and `index.ts`; no upward or cyclic import, no tool→tool edge.
4. Every export of `_deprecated-params.ts` has a production caller in the three tools (`deprecatedParameterSchema` is used by `deprecatedParametersField` in the same module).
5. Only the three tools' description, schema and output fingerprints moved in the baseline.

Also unchanged, as the plan requires: `src/tools/_register.ts`, `src/cli-adapter/**`, `find_by_property/_template.ts` and `find_and_replace/replace.ts`.

### T035 — Optional live check

Skipped. The CLI arguments are byte-identical (F9), asserted by the handler tests (`find_by_property` eval payload keys, `create_base` `path=` / `view=` argv), so no T0 gate applies, and this run was unattended.

## Pending vault sync

ADR-NNN, "Shared parameter names within a tool family", has no number yet. These places carry the literal placeholder `ADR-NNN` and must be updated in one pass once the number is allocated:

- `.docs-as-code/decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md`: the file name and the title line;
- `src/tools/_deprecated-params.ts`: the header line;
- `CHANGELOG.md`, `[Unreleased]` → `Changed`: "The convention is recorded in ADR-NNN".

No `docs/tools/*.md` page cites it.

Sync steps:

1. Allocate the next ADR number in the vault's `200-Decisions/`.
2. Write the vault copy (canonical) from the repository mirror.
3. Rename the mirror to `ADR-<n>-shared-parameter-names-within-a-tool-family.md`, update its title and Status line, and replace the placeholder in the places above, so that the mirror and the vault copy are byte-equal.
