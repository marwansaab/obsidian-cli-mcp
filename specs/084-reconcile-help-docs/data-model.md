# Data Model: Reconcile Help Documentation

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

This feature adds no persisted data. The entities below are the published-guidance objects the spec reconciles, and the two error shapes it pins.

## E1 — Offered tool set

- **What**: the names in the server's published `tools/list` with no owner access settings applied (35 at HEAD).
- **Source of truth**: `createServer()`'s tool list (`src/server.ts`), observed through `tools/list`.
- **Rule V1**: every other entity's tool names are checked against E1.

## E2 — Help page set

- **What**: the files `docs/tools/<name>.md`, excluding `index.md`. Served verbatim by `help({ tool_name })`.
- **Rule V2**: page names = E1 exactly. Missing pages already fail boot (`assertToolDocsExist`). Orphan pages fail the new docs-sync test (D2).
- **State change**: `list_notes.md`, `search_vault.md` are deleted (D1).

## E3 — Help index entries

- **What**: each line of `docs/tools/index.md` matching `- **<name>** — …`.
- **Rule V3**: entry names = E1 exactly, each once (D2).

## E4 — Worked example

- **What**: a fenced JSON block `{ "name": <tool>, "arguments": {…} }` in a help page, optionally followed by its result or error.
- **Kinds**: *working* (no failing label) or *failing* (headed or introduced as a rejection, for example "Validation rejection", "Invalid …", "is **rejected**").
- **Rule V4**: a working example's `arguments` parse with its tool's input schema (FR-006). A failing example's shown error equals what the server returns for it, including quoted messages (FR-007, FR-010).
- **Rule V5**: every tool named by `"name"` is in E1 (FR-004).

## E5 — `create_base` validation error (changed, D3)

Returned for an input-parse failure whose first ADR-015 issue has `params.code` in the set below:

| Field | Value |
|---|---|
| `code` | `"VALIDATION_ERROR"` |
| `message` | the issue's own message, e.g. `"INVALID_NAME/empty: name is empty"` |
| `details.code` | `"INVALID_BASE_PATH"` \| `"INVALID_NAME"` \| `"CONTENT_TOO_LARGE"` |
| `details.reason` | present only when the issue has one: `INVALID_BASE_PATH` → `empty` \| `too-long` \| `path-traversal` \| `wrong-extension`; `INVALID_NAME` → `empty` \| `too-long`; absent for `CONTENT_TOO_LARGE` |
| `details.field` | `"base_path"` \| `"name"` \| `"content"` (`"base_path"` also when the deprecated `path` alias was sent) |
| `details.issues` | the generic list, unchanged: `[{ path, message, code }]` for every issue |

- **Rule V6**: no new top-level code and no new `reason` value (Principle IV, ADR-015).
- **Rule V7**: any other validation failure returns the generic envelope byte-for-byte (`message: "create_base input failed schema validation"`, `details: { issues }`).

## E6 — `context_search` missing-folder error (unchanged, documented, D7)

| Field | Value |
|---|---|
| `code` | `"CLI_REPORTED_ERROR"` |
| `message` | `"CLI bridge upstream error: CLI_REPORTED_ERROR"` |
| `details.argv` | `[<binary>, ("vault=<vault>")?, "folder", "path=<folder>"]` |
| `details.command` | `"folder"` |
| `details.stdout` | the CLI's stdout, e.g. `"Error: Folder \"DoesNotExist\" not found.\n"` |
| `details.stderr` | `""` |
| `details.exitCode` | `0` |
| `details.message` | the first stdout line, trimmed: `Error: Folder "<folder>" not found.` |
