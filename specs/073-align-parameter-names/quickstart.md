# Quickstart: Validate Align Parameter Names

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/parameter-names-contract.md](contracts/parameter-names-contract.md)

## 1. Automated gate (required)

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

**Expected**: all green on Linux and Windows CI.

The suite covers each outcome O1 to O7 of the contract for all three tools, through the co-located `schema.test.ts`, `index.test.ts` and `handler.test.ts` (research D10), plus `_deprecated-params.test.ts`, `_register.test.ts` and the `_surface.test.ts` typed-result round trip.

## 2. Baseline check (required)

```bash
npm run baseline:write
git diff --stat src/tools/_register-baseline.json
git diff src/tools/_register-baseline.json
```

**Expected**: only the `find_by_property`, `find_and_replace` and `create_base` entries change. In each, only `descriptionFingerprint`, `schemaFingerprint` and `outputSchemaFingerprint` move (contract §5).

## 3. Per-story checks

### User Story 1 — same name across a family

From the published schemas (`tools/list` or the `help` tool):

- `find_by_property`, `read_property` and `set_property` all list `name`.
- `search`, `context_search`, `pattern_search`, `find_by_property` and `find_and_replace` all list `case_sensitive` and `folder`.
- `views_base`, `query_base` and `create_base` list `base_path`; `query_base` and `create_base` list `view_name`.

### User Story 2 — old names keep working

Through the in-process tests (no vault needed):

- `find_by_property` `{ property: "id", value: "x" }` → the same `paths` as `{ name: "id", value: "x" }`, plus `deprecated_parameters: [{ parameter: "property", replacement: "name" }]`.
- `find_and_replace` `{ pattern, replacement, case_insensitive: true, subfolder: "Notes" }` → the same preview as `{ …, case_sensitive: false, folder: "Notes" }`, with two notice entries, the first carrying the polarity note.
- `create_base` `{ path: "Tasks.base", name: "Item", view: "All" }` → the same `base:create` arguments as `{ base_path, name, view_name }`, plus two notice entries.
- Any old-plus-new pair → `VALIDATION_ERROR` naming both, with no spawn and no filesystem read (assert on the spawn and filesystem fakes).

### User Story 3 — convention record

Open `.docs-as-code/decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md` and check that it lists:

- every family and shared concept of data-model "Convention record";
- all 7 renames;
- all 6 FR-017 exceptions, each with a reason.

## 4. Optional live check

This check is not required: the CLI arguments are unchanged (research F9). Before running it, read `.memory/test-execution-instructions.md` and use only the authorised test vault and its scratch subdirectory. After `npm run build`, through the local server:

1. `find_by_property` with `property` on a property that exists in the test vault: the same paths as with `name`, plus the notice.
2. `find_and_replace` preview (no `commit`) with `subfolder` set to the scratch subdirectory and `case_insensitive: true`: the same preview as `folder` + `case_sensitive: false`, plus the notice.
3. `create_base` is a write: run it only inside the scratch subdirectory, then clean up as the instructions require.
