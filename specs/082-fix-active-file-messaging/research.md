# Research: Fix active-file messaging

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-01

There are no `NEEDS CLARIFICATION` items. The findings below come from reading the code at HEAD `01e8db4` and from `codegraph_explore`.

## Findings

### F1: where the "folder-scoped" message comes from

`get_active_file`'s input schema is `applyTargetModeRefinementForFolderScoped(folderScopedTargetModeBaseSchema)` (`src/tools/get_active_file/schema.ts:19`). That refinement (`src/target-mode/target-mode.ts:102`) adds one issue per supplied locator, with the fixed texts `"file is not allowed for folder-scoped tools"` and `"path is not allowed for folder-scoped tools"`. It runs the same way in both targeting modes. The vault rules come after it in the same function, and they are not tool-specific.

### F2: how the message reaches the agent

`registerTool` (`src/tools/_register.ts:179`) has no `mapValidationError` hook for `get_active_file`, so a failed input parse becomes the generic envelope `{ code: "VALIDATION_ERROR", details: { issues: [{ path, message, code }] } }`. The issue's `message` is what the agent reads. No other layer rewrites it.

### F3: who else uses the refinement

`codegraph_explore` lists three production callers: `files/schema.ts`, `paths/schema.ts` and `get_active_file/schema.ts`, plus `target-mode.test.ts`.

- **`files`** reaches the two messages. Its tests (`files/schema.test.ts` cases 7–8) check only that an issue lands on `file` / `path`, not the text.
- **`paths`** cannot reach them. Its base object drops `file` and `path` with `.omit(...)`, so a supplied locator fails the strict object as `unrecognized_keys` before the refinement runs (pinned by `paths/schema.test.ts:78`, `:91`).
- **No test anywhere pins the folder-scoped text** (a grep for `folder-scoped tools` finds it only in `target-mode.ts`). FR-005 therefore needs a new pin, or "unchanged" would go unproven.

### F4: where the wrong formula is stated

- **Published**:
  - the tool description `GET_ACTIVE_FILE_DESCRIPTION` (`src/tools/get_active_file/index.ts:23`): "`name === basename + extension`";
  - the help reference (`docs/tools/get_active_file.md:29`): the same.

  `help` serves the help reference verbatim (`DOCS_DIR` in `src/tools/help/handler.ts`). The `extension` entries on both surfaces (`index.ts:25`, `docs:31`) already say "(then `name === basename`)" for the no-extension case, which is correct.
- **Internal comments**: `get_active_file/schema.ts:23` ("`name` = `basename` + `extension`") and `get_active_file/_template.ts:4` ("name = basename + extension").
- **Tests**: `handler.test.ts:108` already asserts the correct relationship (`basename + (extension ? "." : "") + extension`). The returned values are right, so only the statements are wrong.

### F5: what moves in the published surface

- `GET_ACTIVE_FILE_DESCRIPTION` is fingerprinted in `src/tools/_register-baseline.json`, so `get_active_file`'s `descriptionFingerprint` must move.
- `superRefine` is invisible to JSON Schema, so editing a refinement is fingerprint-neutral (the Bases `.base` path checks moved into `appendBasePathIssues` without `_register-baseline.json` moving). Every `schemaFingerprint` stays put, including `files`', `paths`' and `get_active_file`'s.
- The parameter descriptions (`NO_LOCATOR`, "Not accepted by this tool (it has no note locator); omit.") are already accurate and do not change.

### F6: related ADRs

- **ADR-003** (Enforce Target Mode in Typed Tools): its rules are unchanged. `get_active_file` still forbids `file` / `path` in both modes, requires `vault` in `specific` mode and forbids it in `active` mode.
- **ADR-038** (Tags Tool-Local Target-Mode Scope Matrix): it declined to add a third refinement *flavour* (a different rule set) to `target-mode.ts` for a single consumer. This change adds no flavour and changes no rule; only the wording of an issue the existing flavour raises becomes a parameter. So it does not conflict with ADR-038's decision. Research D1 records why it is still the smaller change.
- **ADR-040** (Published Parameter Descriptions and Server Instructions): only the tool description text changes. Parameter descriptions and server instructions are unchanged.

## Decisions

### D1: make the locator-issue message a parameter of the shared refinement, defaulting to today's text

`applyTargetModeRefinementForFolderScoped` gains an optional second parameter, `locatorMessage: (key: "file" | "path") => string`. Its default is a private function that returns today's exact strings. The two `ctx.addIssue` calls use `locatorMessage("file")` and `locatorMessage("path")` in place of the literals. Nothing else in the function changes: issue order, paths, codes and the vault rules all stay as they are.

`get_active_file/schema.ts` passes its own message function. `files` and `paths` pass nothing, so their bytes are unchanged by construction (FR-005).

- **Rationale**:
  - It is the smallest change that scopes the fix to `get_active_file` without duplicating rule logic.
  - It is one optional parameter, and the tool-specific text lives in the tool's own schema file.
  - Imports keep running tool → `target-mode` (Principle I).
- **Alternatives considered**:
  - **A tool-local `superRefine` in `get_active_file/schema.ts`** (ADR-038's pattern). Rejected: it would hand-write the two vault-mode issues a third time (both refinements in `target-mode.ts` already carry their own copies), so the vault rules could drift from `files` for no gain. ADR-038 chose a tool-local refinement because its *rule set* differed; here the rules are identical.
  - **Rewording the shared message globally** (for example "file is not allowed for this tool"). Rejected: the spec forbids it (FR-005, Out of scope), and the generic text would describe `files` less precisely.
  - **A third exported refinement** (`applyTargetModeRefinementForActiveFile`). Rejected: it would duplicate the function body, or wrap the same parameter under another name. ADR-038's "no new flavour for one consumer" argues against it too.
  - **Remapping the message in `registerTool` through `mapValidationError`**. Rejected: it would rewrite issue text by matching strings after the fact, which is fragile. `get_active_file` has no hook today, and adding one would bring the whole envelope under the tool's control for a one-string change.

### D2: the exact new message

```
file is not allowed: the active file is the implicit target, so no note may be named
path is not allowed: the active file is the implicit target, so no note may be named
```

- **Rationale**:
  - It keeps the `<key> is not allowed` opening the cohort uses ("vault is not allowed in active mode"), so agents that pattern-match on it still match.
  - It reuses the help reference's own phrase "the active file is the implicit target" (`docs/tools/get_active_file.md:18`, `:145`), so message and doc agree.
  - It meets FR-001 to FR-003: it names the implicit target, says no note may be named, and does not say "folder-scoped".
- **Alternatives considered**:
  - "file is not allowed for get_active_file". Rejected: it doesn't tell the agent *why*, or what to do instead.
  - A message naming both fields ("no file or path may be given"). Rejected: each issue already sits on its own field, and per-field text matches the cohort.

### D3: the corrected formula wording

The wording is the same on both surfaces:

> `name` — file name including extension: `basename + "." + extension`, or just `basename` when `extension` is `""` (`note.md` → `note` + `.` + `md`).

The help reference's table row says the same in its own cell style. The `extension` entries already state the no-extension case and stay as they are.

- **Rationale**: an agent can apply it literally, it covers both cases (FR-007, FR-008), and it reproduces all three worked examples (FR-010). The inline `note.md` example is the cheapest proof against misreading.
- **Alternative considered**: `name === basename + (extension ? "." + extension : "")`. Rejected: JavaScript ternary syntax is harder to read in prose, and the description is read by agents of any language.

### D4: align the two internal comments

`get_active_file/schema.ts:23` and `get_active_file/_template.ts:4` repeat the dot-less formula. Both are corrected in the same change.

`schema.ts` is already being edited. `_template.ts` changes in its comment only, and the frozen `ACTIVE_FILE_TEMPLATE` string, which `_template.test.ts` pins byte for byte, is untouched.

- **Rationale**: these comments are the next thing a maintainer reads after the description. Leaving the wrong formula in them invites the doc error back.
- **Alternative considered**: leaving them. Rejected as cheap drift.

Test titles that mention "name = basename + extension" (`_template.test.ts:3`, `:24`) are left alone. They are labels, not statements of the contract, and editing them is churn outside the fix.

### D5: tests

The tests land in the same change, under Principle II.

- **`get_active_file/schema.test.ts`**:
  - the existing four locator cases (file and path, each in both modes) also assert the exact new message and `not.toContain("folder-scoped")`;
  - a both-locators case per mode asserts that each field is flagged with the new message;
  - the existing `vault` message assertions stay and pin FR-006.
- **`get_active_file/index.test.ts`**:
  - the registered-boundary locator test also asserts the new message in `details.issues[0].message` (the wire form, F2);
  - a description test asserts the corrected formula is present and the dot-less one absent;
  - the docs test asserts the same over `docs/tools/get_active_file.md` (FR-009).
- **`target-mode/target-mode.test.ts`**: the folder-scoped variant asserts the default message text exactly, for `file` and `path`, and that a supplied `locatorMessage` replaces it while the issue paths and the vault issues stay the same.
- **`files/schema.test.ts`**: cases 7–8 also assert today's exact text. This is the per-tool pin for FR-005 / SC-003.
- **`paths`**: no edit. Its existing `unrecognized_keys` assertions already show it never reaches the message (F3).

### D6: no T0 live probe

The change is confined to input validation, which runs before any `obsidian` CLI call, and to static text. In-process unit tests cover it, which sit outside the test-execution gate (CLAUDE.md, Test Execution). An optional live check through a rebuilt server never touches a vault, because validation fails before the spawn (quickstart §3).
