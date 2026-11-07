# Bug Assessment: pattern_search treats a note given as `folder` as an empty folder

- **Slug**: bi-0204
- **Created**: 2026-11-07
- **Source**: pasted text (BI-0204 backlog item; reproduction recorded in vault test case TC-00906 "Pattern Search Folder Naming A Note Is Rejected"). No URL was supplied, so the URL Trust Policy did not apply.
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> **Impact.** Passing a note path to "search just this note" is a natural agent move, and the answer is a false negative: the agent concludes the pattern is absent. The Tool Notes rule that a negative result must state its scope exists because of this class of silent miss.
>
> **Status and evidence.** Queued 2026-11-07, awaiting owner triage. Filed from the imported-tool-notes sweep, reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` (TC-00906). Reported by the Wrightyard, Slipwright and Funwright-Studio-Vault notes.
>
> **Defect.** `pattern_search` with `folder` set to a note's path (`Repro1106/single.md`) returns `{"count":0,"matches":[]}` though the note matches. A missing folder in the same parameter already gives `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND`; `context_search` rejects a note path (`… is a file, not a folder.`) and `paths` does too.

The report also carries an expected-behaviour draft (feature "Reject note folders"), whose acceptance criteria this assessment adopts as the fix's success criteria:

1. A note contains "zebrafish". Searching for "zebrafish" with the note's path as `folder` fails with an error that says the path is a file, not a folder, and names it.
2. Searching with the note's containing folder as `folder` returns the match, as today.
3. Searching with a folder that does not exist returns the existing "folder not found" error unchanged.
4. Given the same note path, `pattern_search` and the equivalent `context_search` both fail in the same recognisable way.

Out of scope (from the report): adding a single-note scope to `pattern_search`; changing how the whole-vault scope (`/`) is accepted or rejected across tools; changes to `context_search`, `search` or the listing tools.

## Symptom

`pattern_search` with `folder` naming an existing note returns the empty success envelope `{ count: 0, matches: [] }`, even when that note contains matches. Expected: the call fails with `CLI_REPORTED_ERROR`, saying that the path is a file and not a folder and naming the path, as `paths` and `context_search` already do.

## Reproduction

1. In a vault, have a note `Repro1106/single.md` whose body contains `zebrafish`.
2. Call `pattern_search` with `{ "pattern": "zebrafish", "folder": "Repro1106/single.md", "vault": "<vault>" }`.
3. Observe `{ "count": 0, "matches": [] }` (TC-00906, on 0.9.0).
4. Call it again with `"folder": "Repro1106"`. The match is returned.

Read-only live probes against the authorised test vault (`TestVault-Obsidian-CLI-MCP`, on its seeded root note `Welcome.md`, no fixtures written) on 2026-11-07, driving `obsidian` (the `Obsidian.com` shim) directly:

| Probe | Raw output |
|---|---|
| `eval` of `app.vault.adapter.stat("Welcome.md")`, the call `pattern_search`'s template makes | `=> {"type":"file","ctime":…,"mtime":…,"size":239}` (non-null, so the template's missing-folder check passes) |
| `search:context query=Welcome path=Welcome.md format=json` | `No matches found.` (exit 0), the zero-match sentinel |
| `folder path=Welcome.md`, the existence probe `context_search` runs after the sentinel | `Error: "Welcome.md" is a file, not a folder.` (exit 0) |

So `context_search` rejects a note path only through its follow-up `folder` probe, whose `Error:` line the dispatch classifier turns into `CLI_REPORTED_ERROR` with the CLI's line as `details.message` (`src/cli-adapter/_dispatch.ts:675-688`). `pattern_search` has no such check.

## Suspected Code Paths

- `src/tools/pattern_search/_template.ts:8` is the defect. The folder check is `const s=await app.vault.adapter.stat(a.folder);if(s===null)return …FOLDER_NOT_FOUND…`. It tells only "missing" from "exists": a file's `stat` is non-null (`{type:"file"}`), so a note path passes as if it were a folder.
- `src/tools/pattern_search/_template.ts:9`: the file filter `f.path.startsWith(a.folder+"/")` then keeps nothing, because no note's path starts with `Repro1106/single.md/`. The scan runs over zero notes and the template returns `{ok:true,count:0,matches:[]}`.
- `src/tools/pattern_search/schema.ts:77-82`: the eval envelope's failure branch allows only `code: z.literal("FOLDER_NOT_FOUND")`, so a `NOT_A_FOLDER` answer from the template would fail envelope parse today.
- `src/tools/pattern_search/handler.ts:78-89` (Stage 7): it maps every `ok:false` envelope to `details.code: "FOLDER_NOT_FOUND"` with the fixed message `pattern_search: folder not found in vault`.
- Precedent, unchanged by this fix: `src/tools/paths/_template.ts:13-15` makes the same `stat` call and adds `if(s.type!=='folder')return …NOT_A_FOLDER…`. Its handler (`src/tools/paths/handler.ts:39-51`) raises `CLI_REPORTED_ERROR` with `details: { stage, code: "NOT_A_FOLDER", folder }`. `move` reuses the same `NOT_A_FOLDER` / `folder` pair (BI-0177, ADR-071, `src/tools/move/handler.ts:101-108`).

## Root Cause Hypothesis

`pattern_search`'s frozen template checks the scope folder for existence only, never for type. A path that names a file exists, so it passes the check, and the subtree filter, which expects a folder prefix, then selects no notes. The empty scan is reported as a successful zero-match result. Confidence: **high**. The template's two lines are the whole folder path, and the live `stat` probe shows a note's `stat` is non-null with `type: "file"`.

## Proposed Remediation

**Preferred**: add the type check that `paths` already makes, and reuse its `NOT_A_FOLDER` sub-discriminator.

- `_template.ts`: after the `s===null` check, add `if(s.type!=="folder")return JSON.stringify({ok:false,code:"NOT_A_FOLDER",folder:a.folder});`. The missing-folder branch, the scan and the success envelope stay byte-identical. Update the header comment (the envelope's failure branch now carries `FOLDER_NOT_FOUND` or `NOT_A_FOLDER`, BI-0204).
- `schema.ts`: widen the envelope's failure branch to `code: z.enum(["FOLDER_NOT_FOUND", "NOT_A_FOLDER"])`, as `paths`' envelope does (`src/tools/paths/schema.ts:50`). The input and output schemas are unchanged.
- `handler.ts` Stage 7: keep the `FOLDER_NOT_FOUND` error byte-identical (code, `details`, message), so acceptance criterion 3 holds. For `NOT_A_FOLDER`, raise `CLI_REPORTED_ERROR` with `cause: null`, `details: { code: "NOT_A_FOLDER", folder, stage: "handler-stage-3" }` (the same shape as the `FOLDER_NOT_FOUND` branch), and a message that carries the CLI's own phrase and the recovery, for example: `pattern_search: "Repro1106/single.md" is a file, not a folder. Pass the folder that contains it, or omit folder to search the whole vault.` The phrase `"<path>" is a file, not a folder` is the text `context_search` surfaces from the CLI, which meets acceptance criterion 4 without touching `context_search`. The `details.code` matches `paths` and `move`.
- Update the handler's header comment, which lists the error stages and claims "zero new details.code values". `NOT_A_FOLDER` is an existing project-wide `details.code` value (paths, move), new to this tool only.

No new top-level error code, no new `details.code` value in the project, and no change to the tool's description, input schema or output schema, so the registry fingerprint baseline (`_register-baseline.json`) does not move.

**Alternatives**:
- Run the CLI's `folder path=<folder>` probe from the handler before or after the eval, as `context_search` does. It reuses the CLI's wording exactly, but adds a second spawn on every folder-scoped call and duplicates the existence check the template already makes. Not recommended.
- Accept a note path as a single-note scope (filter `f.path===a.folder`). That is the "single-note scope" feature the report puts out of scope.

**Files likely to change**:
- `src/tools/pattern_search/_template.ts`
- `src/tools/pattern_search/schema.ts`
- `src/tools/pattern_search/handler.ts`
- `src/tools/pattern_search/_template.test.ts`
- `src/tools/pattern_search/handler.test.ts`
- `src/tools/pattern_search/schema.test.ts`
- `docs/tools/pattern_search.md`: the `folder` bullet (a note path is rejected), the zero-matches bullet, and an Errors row for `NOT_A_FOLDER` next to `FOLDER_NOT_FOUND`. The `help` tool serves this page at runtime, so it moves with the fix; `/speckit-docs-as-code` handles `.docs-as-code/` afterwards.

**Tests to add or update**:
- `_template.test.ts`: a case whose stub `stat` returns `{ type: "file" }` for the folder gives the `{ ok:false, code:"NOT_A_FOLDER", folder }` envelope and reads no note. The existing cases stub `stat` as `{ type: "folder" }` and stay unchanged; the `stat === null` case still gives `FOLDER_NOT_FOUND`.
- `handler.test.ts`: a `NOT_A_FOLDER` envelope raises `CLI_REPORTED_ERROR` with `details: { code: "NOT_A_FOLDER", folder: "Repro1106/single.md", stage: "handler-stage-3" }`, `cause: null`, and a message containing `"Repro1106/single.md" is a file, not a folder`. Case (21) (`FOLDER_NOT_FOUND`) and case C4 (32) (existing folder, no matches) stay unchanged, and lock criteria 3 and 2.
- `schema.test.ts`: the envelope accepts `ok:false, code:"NOT_A_FOLDER"`. The existing test at line 221 (`code: "OTHER"` is rejected) still passes unchanged.
- No other existing assertion should change (`.memory/refactor-decisions.md` item 5). If one fails, stop and raise it.
- Live-CLI confirmation of TC-00906 during `/speckit-bug-test`, following `.memory/test-execution-instructions.md` (authorised test vault, fixtures under `Sandbox/` only): note path rejected, containing folder returns the match, missing folder unchanged, and `context_search` with the same note path for criterion 4.

## Risks & Considerations

- **Behaviour change for callers that pass a note path today.** They now get an error instead of an empty result. That empty result was always wrong (it hides matches in the named note), so the change is the fix itself and no caller can depend on it correctly.
- **Folder names that end in `.md`.** A real folder named `Notes.md` has `stat().type === "folder"` and keeps working. The check reads the type from the disk, not the name.
- **Whole-vault scope.** `folder: "/"` still normalises to no folder before the template, so the new check never sees it (out of scope, unchanged).
- **Other non-folder entries.** Any `stat` type other than `folder` (a canvas, a base, an attachment) is rejected the same way, which matches `paths`.
- **Case-insensitive file systems.** `stat` follows the host's file system for case, as the `FOLDER_NOT_FOUND` check already does. No new exposure.
- **Security**: none new. The folder still reaches the template only through the base64 payload (R12), and no new user value enters eval source.
- **Published surface**: unchanged. The description and parameter descriptions do not change, so the fingerprint baseline does not move.

## CodeGraph structural check

- **Affected module**: `src/tools/pattern_search/` only. `JS_TEMPLATE` is used only by `executePatternSearch` and its own tests. `executePatternSearch` is reached only through `createPatternSearchTool` (`index.ts`), which `server.ts` and `_typed-result-fixtures.ts` construct. `patternSearchEvalEnvelopeSchema` is used only by the handler and `schema.test.ts`.
- **Blast radius**: the single `invokeEval` call of `pattern_search`, plus the three co-located test files. `paths`, `move` and `context_search` are read as precedent only and do not change. `stripBoundarySlashes` (imported from `search/handler.ts`) is unchanged. The `_non-ascii-checks.ts` F2 scenario that expects `FOLDER_NOT_FOUND` targets `paths`, not `pattern_search`, and is unaffected.
- **Kernel nodes**: the fix touches **none** of them (`createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`). The handler keeps receiving `logger` / `queue` through `ExecuteDeps`, and `UpstreamError` is only instantiated, as every handler does; its definition and the code set in `src/errors.ts` are unchanged. No new top-level error code: `NOT_A_FOLDER` is an existing `details.code` sub-discriminator (paths, move).

## Open Questions

**Resolved (Relay):** no questions were raised. The verdict is valid, and the remediation is a repair within the report's expected behaviour: it adds no new tool, parameter or error code, and it changes no published schema. No product, scope or design decision is needed, so nothing was put to the owner.

None. The report's acceptance criteria and the `paths` / `move` precedent (ADR-071 reuses `NOT_A_FOLDER` for "a path that names a file where a folder is needed") settle the error shape. The message carries the CLI's `is a file, not a folder` phrase for consistency with `context_search`, which the report names as the sibling to match.
