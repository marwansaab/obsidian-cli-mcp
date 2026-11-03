# Bug Assessment: create_base reports a composed item path instead of the path Obsidian created

- **Slug**: bi-0180
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0180, "Report created path")
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

Condensed from the BI-0180 report:

> `create_base` returns the new item's `name` and `path` so the caller can act on it next — read it, set properties, link to it. For a Base filtered to a folder, the returned `path` repeats the folder and points to a file that does not exist, and `name` is not a name. [...] The help's Output section documents the same wrong composition, so a careful reader cannot detect the bug from the docs. [...] It also bears on the BI-0139 Q4 backstop, which checks the real created path for containment: the reported path and the checked path must be the same.

Evidence given in the report:

1. **Folder-filtered Base** (0.9.0-local, BI-0139 / BI-0109 test group). Base top-level filter `file.inFolder("Fixtures/BI-0109/Items")`, item `BI0109 New Names`. Reported `path: "Fixtures/BI-0109/Items/Fixtures/BI-0109/Items/BI0109 New Names.md"` and `name` equal to the full path. File actually created: `Fixtures/BI-0109/Items/BI0109 New Names.md`.
2. **Base with no folder filter** (2026-11-03, 0.9.0-local, Obsidian 1.14.5, owner-input regression). `Fixtures/BI-0083/target.base`, no `vault` (TestVault in front). Reported `path: "Fixtures/BI-0083/target/Task1.md"`; Obsidian created `Task1.md` at the vault root. The same held for `Task1 1.md`, `ViewNotValidated.md`, `EmptyName.md` and `NoView.md` (TC-00464, TC-00465, TC-00468, TC-00469, TC-00480, all `fail`). `name` was correct in each of these.

Acceptance criteria from the report: the response `path` is the file actually created (for a folder-filtered Base, a Base with no folder rule, and a `name` with a folder part), and `name` is the item's name in its documented form, not a path. Out of scope: choosing where items are placed, vault-boundary checks, creating `.base` files.

No URL was supplied, so the URL Trust Policy did not apply.

## Symptom

`create_base` builds the response `path` as `<baseDir>/<baseName>/<Created:>` and returns the raw `Created:` value as `name`. Obsidian's `Created:` line already carries the item's vault-relative path, so `path` points to a file that does not exist for every Base shape, and `name` becomes a path whenever the item lands outside the vault root. The expected result is `path` equal to the vault-relative path Obsidian created and `name` equal to that file's name.

## Reproduction

1. In a test vault, create `Fixtures/X/Items/` and a Base `Fixtures/X/Filtered.base` whose top-level `filters` is `file.inFolder("Fixtures/X/Items")`.
2. Call `create_base` with `base_path: "Fixtures/X/Filtered.base"`, `name: "New Item"`.
3. Observe `path: "Fixtures/X/Filtered/Fixtures/X/Items/New Item.md"` and `name: "Fixtures/X/Items/New Item.md"`; the file on disk is `Fixtures/X/Items/New Item.md`.
4. Repeat against a Base with no folder filter in a vault whose new-note location is the root (`Fixtures/BI-0083/target.base`, `name: "Task1"`): observe `path: "Fixtures/BI-0083/target/Task1.md"` while the file is `Task1.md`.

The CLI side of this is already recorded in `specs/083-enable-cross-vault-bases/research.md` (P6, P7): `Created: Sandbox/P083-probe/Items/Item2.md` for a folder-filtered Base, `Created: Item1.md` for a Base with no filter and a root new-note location.

## Suspected Code Paths

- `src/tools/create_base/handler.ts:174-181` (`executeCreateBase`) — the defect. It takes `createdFilename` from `CREATED_PATTERN`, then composes `itemDir = <baseDir>/<baseName>` from `input.base_path` and returns `{ path: `${itemDir}/${createdFilename}`, name: createdFilename }`. Both fields are wrong when `Created:` holds a path with folders.
- `src/tools/create_base/handler.ts:175` — the named-vault backstop `checkCreated?.(createdFilename)` already checks the raw `Created:` value, so the reported path and the checked path differ today (the report's BI-0139 Q4 point). After the fix they are the same value.
- `src/tools/create_base/handler.ts:170` — the parse-failure message still says `'Created: <filename>'`; cosmetic, worth aligning.
- `src/tools/create_base/index.ts:24` (`CREATE_BASE_DESCRIPTION`) — the published description says `path` is "the wrapper-constructed vault-relative path" and `name` "the actual filename returned by the CLI". It must describe the real behaviour. This text is fingerprinted (`descriptionFingerprint` in `src/tools/_register-baseline.ts`), so `src/tools/_register-baseline.json` changes deliberately.
- `docs/tools/create_base.md:42-57` — the help Output section (served by the `help` tool from the bundled `docs/tools/` directory) documents the same composition, with an example `220-Planning/Backlog (Base)/New feature request.md`, and the collision section says "in the base's directory".
- Origin of the wrong rule: `specs/054-add-bases-surface/research.md` R-008 ("Only the filename is returned, NOT the vault-relative path"), drawn from probes where every item landed at the vault root, so filename and vault-relative path coincided. Spec 083 research P6 later showed `Created:` carries the vault-relative path and filed this as a follow-up.

## Root Cause Hypothesis

Spec 054 read `Created: <x>.md` as a bare filename because its probes only ever created items at the vault root, and the handler composed a path from the Base's location on that basis. Obsidian actually places the item by the Base's top-level `file.inFolder(...)` filter or else the vault's new-note location (plus any folder part of `name`, P7), and its `Created:` line reports the resulting vault-relative path. The handler therefore prefixes a folder that has nothing to do with placement and reports a path as `name`. Confidence: high — the handler code, both field observations and the spec 083 probes agree.

## Proposed Remediation

**Preferred**: In `executeCreateBase`, take the `Created:` value (trimmed, backslashes normalised to `/` defensively) as the response `path`, and `posix.basename(path)` as `name`. Drop the `baseDir` / `baseName` / `itemDir` composition. The named-vault backstop keeps checking that same value, so the reported path and the checked path are one value. `name` keeps its documented form, the file name with the `.md` extension and any collision suffix (`"Task 1.md"`), which the report's acceptance criteria allow and which keeps the output schema and existing callers' expectations of `name` unchanged. Update `CREATE_BASE_DESCRIPTION` and `docs/tools/create_base.md` (Output example and bullets, and the collision section's "in the base's directory") to say the path is where Obsidian created the item: the Base's `file.inFolder` folder, otherwise the vault's new-note location, joined with any folder part of `name`. Regenerate the registry fingerprint baseline for the description change and say so in the PR.

**Alternatives**:
- Compute the folder before creation with `ITEM_FOLDER_TEMPLATE` (as the named-vault path does) and join it with the name. Rejected: it adds an eval to the no-vault path, duplicates what `Created:` already reports, and can disagree with Obsidian (the template is a mirror that falls back on unrecognised YAML).
- Keep `name` as the raw `Created:` value. Rejected: it is a path for every non-root item, which is the "name is a name" defect.

**Files likely to change**:
- `src/tools/create_base/handler.ts`
- `src/tools/create_base/handler.test.ts`
- `src/tools/create_base/index.ts` (description)
- `src/tools/create_base/index.test.ts`
- `src/tools/_register-baseline.json` (description fingerprint, regenerated)
- `docs/tools/create_base.md`

**Tests to add or update**:
- Handler, happy path: `Created: Fixtures/X/Items/New Item.md` for `base_path: "Fixtures/X/Filtered.base"` yields `{ path: "Fixtures/X/Items/New Item.md", name: "New Item.md" }` (the folder-filter case).
- Handler, boundary: `Created: Task1.md` for `base_path: "Fixtures/BI-0083/target.base"` yields `{ path: "Task1.md", name: "Task1.md" }` (no folder rule, root new-note location).
- Handler, folder part in `name`: `Created: Items/sub/Item.md` yields `path: "Items/sub/Item.md"`, `name: "Item.md"`.
- Handler, collision: `Created: Items/Task 1.md` yields `name: "Task 1.md"`.
- Named vault: the backstop and the response use the same path (`Created: Tasks/New.md` → `path: "Tasks/New.md"`, `name: "New.md"`); update the existing case at `handler.test.ts:226` that currently pins the buggy `Tasks/Tasks/New.md`.
- Update every existing expectation that pins the composed shape: `handler.test.ts:189` (`Tasks/Test.md` → `Test.md`), `index.test.ts:206`, `:216`, `:224`, `:248`.
- Live check per `.memory/test-execution-instructions.md` (in `/speckit-bug-test`): a folder-filtered Base and a no-filter Base in the authorised test vault, then `read` the returned path.

## Risks & Considerations

- **Behaviour change for callers who adapted to the bug**: anyone stripping a prefix from `path` or reading `name` as a path sees different values. The old values pointed at nonexistent files, so following them never worked; call it out in the CHANGELOG as a fix.
- **Published-surface gate**: the description text change moves `descriptionFingerprint` for `create_base`; the baseline update is deliberate and goes in the PR's MCP Tool Surface Standards line. The input and output schemas are unchanged.
- **Windows separators**: all observed `Created:` values use `/`. Normalising `\` to `/` keeps the response vault-relative and forward-slash on any platform without changing what was observed.
- **`Created:` format drift**: if a future Obsidian reports something other than a vault-relative path, the response follows it. The existing `CREATED_PATTERN` parse failure still guards a missing line; this is no weaker than today.
- **Docs**: `.docs-as-code/capabilities/bases.md:283` and `.docs-as-code/decisions/ADR-053-…md:106` record this bug as open; `/speckit-docs-as-code` updates them after review.

## CodeGraph structural check

- **Affected module**: `src/tools/create_base/` only — `executeCreateBase` (`handler.ts`), whose callers are the tool registration in `create_base/index.ts` and its tests; `CREATE_BASE_DESCRIPTION` (`index.ts`), read by `createCreateBaseTool`. `createBaseOutputSchema` (`schema.ts`) is used as-is and does not change shape. `ITEM_FOLDER_TEMPLATE` and `containNamedVaultTarget` are untouched; the backstop closure keeps receiving the same `Created:` value.
- **Blast radius**: the `create_base` tool's response for every call, its handler and index tests, `src/tools/_typed-result-fixtures.ts` (builds `create_base` with `Created: New item.md`, which stays valid since a root item's path and name coincide), the registry fingerprint baseline (description only), and the bundled help doc.
- **Kernel nodes**: the fix touches none of them. `createLogger()` and `createQueue()` stay confined to `server.ts` and reach the handler through `ExecuteDeps`; `UpstreamError` is used, not changed, and no new error code is introduced (the existing `CLI_REPORTED_ERROR` `response-parse` failure is kept); `createServer()` is not touched.

## Open Questions

None blocking. `name` keeps the documented file-name form with `.md`, as the report's acceptance criteria allow ("or the documented form of the item name").

Resolved (Relay): settled 2026-11-03 with no questions to ask. The assessment carries no `[NEEDS CLARIFICATION]` items or open questions. The remediation is a repair within the report's acceptance criteria: the output schema is unchanged, and the description and help text change only to describe the corrected behaviour.
