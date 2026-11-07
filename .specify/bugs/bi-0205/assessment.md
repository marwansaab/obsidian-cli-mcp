# Bug Assessment: `files` answers a missing folder as an empty folder

- **Slug**: bi-0205
- **Created**: 2026-11-07
- **Source**: pasted text (BI-0205 backlog item; reproduction recorded in vault test case TC-00907 "Files Missing Folder Returns Folder Not Found"). No URL was supplied, so the URL Trust Policy did not apply.
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> **Impact.** A misspelt or moved folder looks empty, so an agent concludes "no notes there" (and may create duplicates or report a false "clean" state). `files` is the cheapest folder listing, so it is the one agents reach for first.
>
> **Status and evidence.** Queued 2026-11-07, awaiting owner triage. Filed from the imported-tool-notes sweep, reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` (TC-00907). Reported by the Slipwright, Funwright-Studio-Vault, YouTube Channels and Game-Server-Vault notes.
>
> **Defect.** `files` with a `folder` that does not exist returns `{"count":0,"paths":[]}`, the same answer as an empty folder. Sibling `paths` returns `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND` + `details.folder`.

The report also carries an expected-behaviour draft (feature "Flag absent folders"), whose acceptance criteria this assessment adopts as the fix's success criteria:

1. Given a folder name that does not exist in the vault, listing its files fails with a "folder not found" error naming the folder, matching the recursive listing's (`paths`) error.
2. Given an existing empty folder, the answer is an empty list with a count of zero.
3. Given the vault root (no `folder`), the answer is unchanged from today.

Out of scope (from the report): changes to the recursive listing request (`paths`); creating missing folders; distinguishing a `folder` that names a file rather than a folder ("can be added later").

## Symptom

`files` with a `folder` that does not exist returns the success envelope `{ count: 0, paths: [] }`, byte-identical to the answer for an existing empty folder. Expected: the call fails with `CLI_REPORTED_ERROR`, `details.code: "FOLDER_NOT_FOUND"` and `details.folder` naming the folder, as `paths` already does.

## Reproduction

1. Call `files` with `{ "target_mode": "specific", "vault": "<vault>", "folder": "<a folder that does not exist>" }`.
2. Observe `{ "count": 0, "paths": [] }` (TC-00907, on 0.9.0).
3. Call `paths` with the same `folder`. Observe `CLI_REPORTED_ERROR` with `details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder }`.

Read-only live probes against the authorised test vault (`TestVault-Obsidian-CLI-MCP`, no fixtures written) on 2026-11-07, driving `obsidian` (the `Obsidian.com` shim) directly with `vault=` explicit:

| Probe | Raw output |
|---|---|
| `files folder=NoSuchFolder0205` | empty stdout, exit 0 |
| `files folder=..` | empty stdout, exit 0 |
| `files folder=../TestVault-Obsidian-CLI-MCP/Sandbox` | empty stdout, exit 0 (the CLI confines traversal, as `docs/tools/files.md` says) |
| `eval` `app.vault.adapter.stat('NoSuchFolder0205')` | `=> null` |
| `eval` `app.vault.adapter.stat('Sandbox')` | `=> {"type":"folder",…}` |
| `eval` `app.vault.adapter.stat('Welcome.md')` | `=> {"type":"file",…}` |
| `eval` `app.vault.adapter.stat('..')` | `=> {"type":"folder",…}`: **`stat` escapes the vault**, answering for the vault's parent directory |
| `eval` `app.vault.adapter.stat('../TestVault-Obsidian-CLI-MCP')` | `=> {"type":"folder",…}` (the vault folder itself, reached from outside) |
| `eval` `app.vault.adapter.stat('/Sandbox')` and `stat('Sandbox/../Sandbox')` | `=> {"type":"folder",…}` (a leading `/` and an inner `..` are both resolved) |

Follow-up read-only probes the same day, after the owner's Q1 ruling (in the eval, JS string values as shown):

| Probe | Raw output |
|---|---|
| `stat('/Windows')`, `stat('/NoSuch0205')` | `null` (a leading `/` resolves inside the vault) |
| `stat('C:/Windows')`, `stat('C:\Windows')`, `stat('C:Windows')` | `null` (a drive path resolves inside the vault) |
| `stat('\\localhost\C$\Windows')`, `stat('//localhost/C$/Windows')` | `null` (a UNC path resolves inside the vault) |
| `stat('\Sandbox')` | `"folder"` (the vault's own `Sandbox`); `stat('\Windows')` gives `null` |
| `files folder=C:/Windows`, `files folder=/Sandbox` | empty stdout, exit 0 |
| `files folder=Sandb` | empty stdout: the CLI does not prefix-match |
| `files folder=Sandbox/BI-0008/tc-00425-path.md` | empty stdout (a file path lists nothing) |
| `files folder=sandbox/BI-0008` | empty stdout, while `folder=Sandbox/BI-0008` lists its notes: the CLI matches `folder` case-sensitively, `stat` does not (Windows) |

So the CLI gives no signal at all for a missing folder (empty stdout, exit 0, the same as an empty folder), and the existence check must come from somewhere else. `adapter.stat` gives that signal. A `..` segment takes it outside the vault; the absolute forms (`/x`, `C:\x`, `C:/x`, `\\host\x`, `\x`) do not, they all resolve inside the vault.

## Suspected Code Paths

- `src/tools/files/handler.ts:43-72` (`executeListFiles`) is the defect. It makes one `invokeCli` call to the CLI's native `files` subcommand, filters and sorts the stdout, and returns `{ count, paths }`. Nothing checks that `folder` exists, so an empty CLI answer is always reported as an empty folder.
- `src/tools/files/handler.test.ts:140-148`, test (9), `empty stdout → { count: 0, paths: [] } — FR-010 conflated empty shape`, pins the defect: a stub with empty stdout and `folder: "Missing"` expects the empty envelope.
- `docs/tools/files.md:106-108` ("Missing folder / empty folder / folder-names-a-file all conflated") and `:110-112` ("Path-traversal CLI-confined … surfaces the conflated empty-folder shape") document the conflation as the contract. `help` serves this page at runtime.
- Origin: `specs/019-list-files/spec.md` FR-010 and its 2026-05-12 clarification made the conflation a deliberate design choice ("missing folder = empty folder = folder-input-names-a-file is one conflated shape"), partly to avoid a new error code. This BI reverses that choice for the missing-folder case only. No ADR records it (`.decisions/` has no entry for the `files` conflation), so the reversal supersedes a spec decision, not an ADR. The reversal needs no new error code: `FOLDER_NOT_FOUND` is an existing `details.code` value under `CLI_REPORTED_ERROR`.
- Precedent, unchanged by this fix: `src/tools/paths/_template.ts:10-16` stats the folder through `app.vault.adapter.stat` (a throwing `stat` counts as missing) and returns `{ ok:false, code:"FOLDER_NOT_FOUND", folder }`. `src/tools/paths/handler.ts:41-52` raises `CLI_REPORTED_ERROR` with `cause: null`, `details: { stage: "envelope-error", code, folder }` and the message `paths: <code> for folder "<folder>"`.

## Root Cause Hypothesis

`files` wraps the CLI's `files` subcommand, which answers a missing folder with empty stdout and exit 0, exactly as it answers an empty folder. The handler adds no existence check, by the spec 019 FR-010 design, so the two cases cannot be told apart. Confidence: **high**. The handler is a single CLI call with no other branch, and the live probe shows the CLI's raw answer for a missing folder is empty.

## Proposed Remediation

**Preferred**: confirm the folder exists only when the CLI listed nothing, with one `adapter.stat` eval in the same vault, and report a missing folder with `paths`' error shape.

- **When the check runs**: when `input.folder` is set and the CLI's stdout holds no entries (`parseStdout` gives an empty list), before the wrapper's filters, in both `total` modes. Any entry the CLI prints lies under that exact folder (the probes show it does not prefix-match), so it proves the folder exists; a folder whose entries the wrapper then filters away (`folder: ".obsidian"`) still answers `{ count: 0, paths: [] }` with no extra spawn. The common call stays a single spawn. With no `folder` (the vault root) nothing changes (criterion 3).
- **The check**: a new frozen template `src/tools/files/_template.ts` run through `invokeEval` in the vault the listing used (`input.vault` in specific mode, `undefined` in active mode, as `paths` does), with the folder passed in the base64 payload through `composeEvalCode`. It strips one trailing `/` (as `paths` does), stats the folder, treats a throwing `stat` as missing (the `paths` behaviour), and returns `{ ok:true }` when the path exists or `{ ok:false, code:"FOLDER_NOT_FOUND", folder }` when `stat` gives `null`. The handler decodes it with `decodeEvalEnvelope` and a `filesFolderEnvelopeSchema` in `schema.ts` (failure branch `code: z.literal("FOLDER_NOT_FOUND")`).
- **The stat rule as a shared fragment**: `.memory/refactor-decisions.md` item 53 forbids a third inline copy of the eval stat check (it is already written in `paths/_template.ts` and `pattern_search/_template.ts`, and item 71 defers sharing those two). The stat-and-classify expression goes in a leaf module (for example `src/tools/_folder-stat.ts`, exporting a JS-source fragment that yields `"missing" | "file" | "folder"`, with a throwing `stat` as `"missing"`), interpolated into the files template. Only `files` uses it in this BI. Moving `paths` and `pattern_search` onto it stays the BI-0204 follow-up, because the report puts `paths` out of scope.
- **A path that names a file** keeps today's empty answer: the template answers `ok:true` for any existing path (out of scope, "can be added later"; the fragment already tells `"file"` apart, so adding `NOT_A_FOLDER` later is a one-line change).
- **Traversal guard (owner ruling Q1 = A)**: the probes show `adapter.stat` is not confined to the vault (`stat('..')` answers for the vault's parent directory). Unguarded, the check would be an existence oracle for paths outside the vault. So when the check would run, a `folder` with a `..` segment (split on `/` and `\`) fails as `FOLDER_NOT_FOUND` with the same error and **no `stat` check run** (no eval spawn). The `files` CLI call itself still runs first, unchanged, so a traversal path the CLI does list (none seen) keeps its listing. Absolute forms (`/x`, `C:\x`, `C:/x`, `\\host\x`, `\x`) are NOT guarded: the ruling covers them only if `stat` reaches outside the vault with them, and the follow-up probes show it resolves every one of them inside the vault, so they take the normal check.
- **The error** (criterion 1): `CLI_REPORTED_ERROR`, `cause: null`, `details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder }` and the message `files: FOLDER_NOT_FOUND for folder "<folder>"`, the same shape as `paths` with the tool name swapped. One throw, no per-code chain (item 71).
- Update the handler's header comment (it claims "single-spawn") and the schema header.

No new top-level error code, no new `details.code` value in the project, and no change to the tool's description, input schema or output schema, so the registry fingerprint baseline (`_register-baseline.json`) does not move.

**Alternatives**:
- Probe with the CLI's `folder path=<folder>` subcommand, as `context_search` does after an empty search. It reuses the CLI's own wording, but the dispatch classifier turns its `Error:` line into a `CLI_REPORTED_ERROR` with only `details.message`, not `details.code: "FOLDER_NOT_FOUND"` + `details.folder`, so matching `paths` would mean parsing the CLI's prose. It also rejects a file path (`… is a file, not a folder.`), which the report puts out of scope. Not recommended.
- Node `fs.stat` through the vault registry's root path. It is confined by `realpath` containment, but it adds a `vaultRegistry` dependency to `files` (an `ExecuteDeps` change that lands on every `files` test and both cross-tool fixture modules, item 5's lesson), and item 61 settles folder-type questions on `adapter.stat`. Not recommended.
- Replace the native `files` call with a single eval that lists and checks in one go, like `paths`. It saves the second spawn on empty answers but rewrites the whole tool and its filter pipeline. Out of proportion for this bug.

**Files likely to change**:
- `src/tools/files/handler.ts`
- `src/tools/files/schema.ts` (the folder-check envelope schema)
- `src/tools/files/_template.ts` (new)
- `src/tools/_folder-stat.ts` (new leaf fragment) and `src/tools/_folder-stat.test.ts`
- `src/tools/files/handler.test.ts`, `src/tools/files/_template.test.ts` (new), `src/tools/files/schema.test.ts`
- `docs/tools/files.md`: rewrite "Missing folder / empty folder / folder-names-a-file all conflated" (missing now fails; empty and file-path stay empty), "Path-traversal CLI-confined", "Single-call", and add a `FOLDER_NOT_FOUND` row under `CLI_REPORTED_ERROR` in Errors. `/speckit-docs-as-code` handles `.docs-as-code/` afterwards.

**Tests to add or update**:
- `_folder-stat.test.ts`: run the fragment under `node:vm` against a stub `adapter.stat` for `null`, `{type:"folder"}`, `{type:"file"}` and a throwing `stat`.
- `_template.test.ts`: the composed template gives `{ ok:true }` for a folder and for a file, and `{ ok:false, code:"FOLDER_NOT_FOUND", folder }` for `null`, with one trailing `/` stripped from `folder`.
- `handler.test.ts` new cases: empty listing + missing folder raises the exact `paths`-shaped error; empty listing + existing folder returns `{ count: 0, paths: [] }` (criterion 2), in both `total` modes; vault root with empty stdout makes no eval spawn (criterion 3); a non-empty listing, including one the filters empty, makes no eval spawn; active mode sends the eval with no `vault=`; `Sandbox/../Sandbox` raises `FOLDER_NOT_FOUND` with no eval spawn; a drive-absolute folder (`C:/x`) takes the normal check; a failed check (malformed eval answer) surfaces `decodeEvalEnvelope`'s `CLI_REPORTED_ERROR`.
- Existing test (27) (`folder: "../../etc"`) changes from the empty answer to the `FOLDER_NOT_FOUND` error, per the owner's Q1 ruling; its argv assertion stays.
- Existing tests (2), (4), (9) and (26) would also fail, because their one queued response is an empty stdout for a named folder, so the check's eval is a second spawn that `makeQueuedSpawn` refuses (`unexpected spawn invocation #2`). Approved edits (owner ruling Q2 = A, 2026-11-07), and nothing else:
  - (2), (4), (26): only the stub `stdout` changes, from `""` to one file directly in the folder (`"Inbox/a.md\n"`, `"Daily/a.md\n"`, `"Inbox/a.md\n"`). Every assertion and title stays, including (2)'s one-spawn length check.
  - (9): rewritten as the missing-folder case with a new title. It queues a second response (the check's eval answering `FOLDER_NOT_FOUND`) and expects `CLI_REPORTED_ERROR` / `details.code: "FOLDER_NOT_FOUND"` + `details.folder`.
  - A new test: an existing empty folder lists as `{ count: 0, paths: [] }`.
  - With (27) from Q1, these are the only existing tests that may change. If any other existing test fails, stop and raise it; do not edit it.
- Test (16) (`.obsidian`) is NOT affected, because its CLI stdout is non-empty and the check keys on the raw stdout.
- `_plugin-noise.test.ts`: unchanged. Its cohort is auto-detected from the typed-result fixtures, whose `files` stub is a non-empty listing, so `files` never runs its eval there and the inventory literal stays as it is. The check goes through `invokeEval` + `decodeEvalEnvelope`, which read the tagged answer like every eval-composed tool.
- Live-CLI confirmation of TC-00907 during `/speckit-bug-test`, following `.memory/test-execution-instructions.md`: missing folder fails with `FOLDER_NOT_FOUND`; an empty folder under `Sandbox/` lists as empty; the vault root is unchanged; `paths` with the same missing folder gives the matching error.

## Risks & Considerations

- **Behaviour change for callers that list a missing folder.** They now get an error instead of an empty answer. That empty answer was the defect, so no caller can depend on it correctly. It reverses spec 019 FR-010 for the missing case; the owner's BI is the authority for that.
- **A second spawn on empty answers.** Only an empty listing of a named folder pays it. The vault root and every non-empty listing stay single-spawn.
- **Active mode.** The listing and the check run as two calls in the focused vault; a focus change between them could check the wrong vault. This is the documented active-mode TOCTOU caveat, not a new class.
- **Traversal and absolute paths.** `adapter.stat` resolves `..` outside the vault (probe), so a `..` segment fails without the check (ruling Q1 = A). The absolute forms resolve inside the vault (probes), so they take the normal check: `C:/Windows` fails as `FOLDER_NOT_FOUND`, and `/Sandbox` or `\Sandbox` (which `stat` reads as the vault's `Sandbox`) still answers empty when the CLI lists nothing for it, as today.
- **Case differences.** The CLI matches `folder` case-sensitively and `stat` follows the host file system (case-insensitive on Windows and default macOS). So `folder: "sandbox/BI-0008"` against `Sandbox/BI-0008` lists nothing and the check finds the folder: the answer stays `{ count: 0, paths: [] }`, as today, not `FOLDER_NOT_FOUND`. A case-only misspelling is therefore still not flagged on those hosts. Flagging it would need a case-exact comparison against the folder's real name, which is beyond the report's criteria; it goes in `docs/tools/files.md` next to the existing case-sensitivity note.
- **Pre-existing, outside this BI**: `paths` makes the same unguarded `stat` and then walks `adapter.list(start)`, so `paths` with `folder: ".."` may list the vault's parent directory. Not changed here (the owner ruled `paths` out of scope); filed as BI-0208.
- **Security**: the folder reaches the template only through the base64 payload, never as eval source.
- **Published surface**: unchanged; the fingerprint baseline does not move.

## CodeGraph structural check

- **Affected module**: `src/tools/files/` plus one new leaf module under `src/tools/`. `executeListFiles` is reached only through `createFilesTool` (`files/index.ts`), which `server.ts` and `_typed-result-fixtures.ts` construct, and from its own tests. The typed-result fixture stubs a non-empty listing, so it makes no eval call and is unaffected.
- **Blast radius**: the `files` handler, its co-located tests, the new template and fragment with their tests, and `docs/tools/files.md`. The noise-matrix test and the typed-result fixture are untouched, because their `files` stub lists files and never reaches the check. `invokeEval` and `decodeEvalEnvelope` are consumed, not changed; they are already shared by most eval-composed tools. `paths`, `pattern_search` and `context_search` are read as precedent only.
- **Kernel nodes**: the fix touches **none** of them (`createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`). The handler keeps receiving `logger` / `queue` through `ExecuteDeps` (unchanged), and `UpstreamError` is only instantiated; its definition and the code set in `src/errors.ts` are unchanged. `FOLDER_NOT_FOUND` is an existing `details.code` sub-discriminator (`paths`, `move`, `pattern_search`).

## Open Questions

- **Q1. How should `files` treat a `folder` that climbs out of the vault (`..`)?** **Resolved (Relay):** owner ruling option A (2026-11-07, recorded in BI-0205's Status):** any `folder` with a `..` segment fails as `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND` + `details.folder`, with no `stat` check run. Absolute forms (`/x`, `C:\x`, `\\host\x`) are treated the same way only if `stat` reaches outside the vault with them; the follow-up probes show it does not, so they take the normal check. Existing test (27) changes from the empty answer to that error. `paths` is not changed; its suspected `..` traversal is BI-0208. TC-00154's Expected is rewritten when the fix ships.
- **Q2. Edits to existing tests (2), (4), (9) and (26).** **Resolved (Relay):** owner ruling option A (2026-11-07, recorded in BI-0205's Status):** (2), (4) and (26) change only their stub `stdout`, from `""` to one file directly in the folder, keeping every assertion and title; (9) is rewritten as the missing-folder case (a second queued response, the check's eval answering `FOLDER_NOT_FOUND`, expecting `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND` + `details.folder`, new title); a new test pins an existing empty folder as `{ count: 0, paths: [] }`. With (27), these are the only existing tests that may change; every other existing test stays untouched. See Tests to add or update.
