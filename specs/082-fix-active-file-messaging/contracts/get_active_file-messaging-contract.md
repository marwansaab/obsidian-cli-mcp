# Contract: get_active_file messaging

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

## §1 Rejection messages

`get_active_file` input → `VALIDATION_ERROR`, `details.issues[]`:

| # | Input | Expected issues (`path` → `message`) |
|---|-------|--------------------------------------|
| A1 | `{ target_mode: "active", file: "Note" }` | `file` → `file is not allowed: the active file is the implicit target, so no note may be named` |
| A2 | `{ target_mode: "active", path: "x.md" }` | `path` → `path is not allowed: the active file is the implicit target, so no note may be named` |
| A3 | `{ target_mode: "active", file: "Note", path: "x.md" }` | both of the above |
| A4 | `{ target_mode: "specific", vault: "V", file: "Note" }` | as A1 |
| A5 | `{ target_mode: "specific", vault: "V", path: "x.md" }` | as A2 |
| A6 | `{ target_mode: "specific", vault: "V", file: "Note", path: "x.md" }` | as A3 |
| A7 | `{ target_mode: "specific", file: "Note" }` | as A1, plus `vault` → `vault is required in specific mode` (unchanged) |
| A8 | `{ target_mode: "active", vault: "V", path: "x.md" }` | as A2, plus `vault` → `vault is not allowed in active mode` (unchanged) |
| A9 | `{ target_mode: "active", file: undefined }` | parses (no issue; unchanged) |

For every row A1–A8, no issue message contains `folder-scoped`. Row A2's message must also be visible on the wire, in the registered tool's `isError` payload at `details.issues[0].message`.

**Unchanged neighbours**:

| # | Tool / input | Expected |
|---|--------------|----------|
| U1 | `files`, `{ target_mode: "specific", vault: "V", file: "Note" }` | `file` → `file is not allowed for folder-scoped tools` |
| U2 | `files`, `{ target_mode: "specific", vault: "V", path: "x.md" }` | `path` → `path is not allowed for folder-scoped tools` |
| U3 | `paths`, any locator | `unrecognized_keys` (existing tests; never reaches the message) |
| U4 | shared refinement, no `locatorMessage` supplied | the folder-scoped texts of U1 and U2 |
| U5 | shared refinement, `locatorMessage` supplied | that function's text on `file` / `path`; vault issues unchanged |

## §2 File-name formula

| # | Surface | Must contain | Must not contain |
|---|---------|--------------|------------------|
| F1 | `GET_ACTIVE_FILE_DESCRIPTION` | `basename + "." + extension`, and the no-extension case (`name === basename` when `extension` is `""`) | any match of ``/basename`?\s*\+\s*`?extension/`` |
| F2 | `docs/tools/get_active_file.md` | the same two-case relationship in the `name` row | any match of ``/basename`?\s*\+\s*`?extension/`` |
| F3 | `docs/tools/get_active_file.md` worked examples | every `name`/`basename`/`extension` triplet satisfies the relationship | — |

## §3 Published surface

| Item | Change |
|------|--------|
| `get_active_file` `descriptionFingerprint` | moves (deliberate; regenerated with `npm run baseline:write`) |
| every other fingerprint of every tool | unchanged |
| input / output schemas, parameter descriptions, title, annotations | unchanged |
| returned values | unchanged |
