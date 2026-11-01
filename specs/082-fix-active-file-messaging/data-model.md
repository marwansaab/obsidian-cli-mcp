# Data Model: Fix active-file messaging

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

No data shape changes. This file records the two pieces of text the feature corrects and the invariants that tests pin.

## E1: locator-rejection issue

An entry of `details.issues[]` in the `VALIDATION_ERROR` envelope that `registerTool` emits when an input parse fails (research F2).

| Field | Value for `get_active_file` | Value for `files` (unchanged) |
|-------|-----------------------------|-------------------------------|
| `path` | `["file"]` or `["path"]` | `["file"]` or `["path"]` |
| `code` | `"custom"` | `"custom"` |
| `message` | `<key> is not allowed: the active file is the implicit target, so no note may be named` | `<key> is not allowed for folder-scoped tools` |

`<key>` is the literal field name, `file` or `path`. For `paths` no such issue is produced: a supplied locator is an `unrecognized_keys` issue from the strict object (research F3).

**Invariants**:

- **V1**: `get_active_file` raises one locator issue per supplied locator, in either mode, on that locator's own path. Both locators supplied gives two issues. This is unchanged.
- **V2**: no `get_active_file` issue message contains `folder-scoped`.
- **V3**: an explicitly `undefined` locator is treated as not supplied and raises no issue. This is unchanged.
- **V4**: the `vault` issues (`vault is required in specific mode`, `vault is not allowed in active mode`) and the `unrecognized_keys` issue are byte-identical to before.
- **V5**: `files`' locator messages are byte-identical to before.

## E2: returned file identity, and its documented relationship

The output shape `{ active: { path, name, basename, extension } | null }` is unchanged. Only the stated relationship between the fields changes.

| Case | `extension` | Relationship |
|------|-------------|--------------|
| Has an extension | non-empty, no leading dot | `name` = `basename` + `"."` + `extension` |
| No extension | `""` | `name` = `basename` |

Worked examples (help reference, Examples 1–2):

| `name` | `basename` | `extension` | Check |
|--------|------------|-------------|-------|
| `note.md` | `note` | `md` | `note` + `.` + `md` = `note.md` |
| `note.draft.md` | `note.draft` | `md` | `note.draft` + `.` + `md` = `note.draft.md` |
| `README` | `README` | `""` | `README` |

**Invariants**:

- **V6**: the tool description and the help reference both state the two-case relationship above.
- **V7**: neither one states `name === basename + extension`, or any other form that joins `basename` and `extension` without the dot.
