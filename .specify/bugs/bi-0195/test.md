# Bug Verification: Classify similarity failures (unembedded source, stale index entry)

- **Slug**: bi-0195
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Both defects were re-run live in `TestVault-Obsidian-CLI-MCP` (Smart Connections 4.7.2, 903 sources), driving this branch's built `dist/index.js` over stdio. The fix held for both.

- **Defect 1:** a brand-new note and a short note, probed straight after writing, now fail with the typed `SOURCE_NOT_INDEXED` naming the note. The normal-length note returns results about 20 s later; the short note keeps the typed failure.
- **Defect 2:** after a move, the plugin returned an empty-keyed candidate. `smart_connections_similar` left it out and succeeded, where the old template would have failed at `envelope-parse`.
- No regressions: targeted and full suites, typecheck, lint and build all pass.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction, defect 1: new note (TC-00892) | `write_note` `Sandbox/BI-0195-probe/Long.md` (8 paragraphs), then `smart_connections_similar` `path` straight away | pass | +0.5 s: `SOURCE_NOT_INDEXED`, `detail: "Sandbox/BI-0195-probe/Long.md"`. Raw plugin state at that point: entry listed, `find_connections` is a function, `vec` undefined. That is the exact defect-1 state. |
| Reproduction, defect 1: then results (TC-00892 second half) | Polled `smart_connections_similar` every 20 s for 244 s | pass | Long.md and Source.md failed with `SOURCE_NOT_INDEXED` at +0.3 s and returned `count=50` from +20.7 s onward. |
| Reproduction, defect 1: short note (TC-00899) | `write_note` `Short.md` (`Hi.`), same probe and poll | pass | `SOURCE_NOT_INDEXED` naming `Sandbox/BI-0195-probe/Short.md` on every probe from +0.6 s to +244 s, never the raw error. |
| Old-path evidence, defect 1 | `obsidian eval` calling the plugin's own `find_connections({limit:5})` on unembedded `Short.md` | observed | `=> threw: Invalid vector input to nearest()`. This is the throw the pre-fix template surfaced as untyped `CLI_REPORTED_ERROR`. The fix now checks before making that call. |
| Filter does not over-drop | `obsidian eval`: raw `find_connections({limit:100})` on Source.md, counted candidates the vault filter would drop | pass | Before the move: plugin raw 50, self 0, dropped 0. So the tool's `count=50` is the plugin's own count. |
| Reproduction, defect 2: stale entry after a move (TC-00225) | `move` `Twin.md` → `Sandbox/BI-0195-probe/Twin-moved.md`, then `smart_connections_similar` on Source.md (limit 100) and `smart_connections_query` (limit 100) every 8 s for 58 s | pass | `smart_connections_similar` went from `count=50` (Twin.md block included) before the move to `count=49`, `empty=0`, on every call after it, with no error. Raw plugin output after the move: 50 candidates, one with key `""` at index 1, score 0.9058. That is the TC-00225 empty-path entry, now left out. No `Twin.md` old path came back. |
| Defect 2, query side | Same run, `smart_connections_query` | pass (stale state not reproduced live) | Every call succeeded, `empty=0`. The raw `lookup` returned 10 keys and no empty key: the moved note was absent at first, then showed up at `Twin-moved.md` from +17 s. So the query empty-path filter was not exercised live; it is covered in-process (below). |
| First move attempt | `move` to `Sandbox/BI-0195-probe/moved/` | n/a | `FOLDER_NOT_FOUND` (the folder did not exist): documented behaviour, nothing moved. Retried with a full destination path. |
| New / updated tests | `npx vitest run src/tools/smart_connections_similar src/tools/smart_connections_query src/tools/_smart-connections.test.ts` | pass | 11 files, 253 tests. |
| Regression suite | `npm test` (full, with coverage) | pass | 207 files passed, 1 skipped; 5167 tests passed, 6 skipped. Includes the register-baseline fingerprint; `_register-baseline.json` unchanged. |
| Lint / type-check / build | `npm run lint`, `npm run typecheck`, `npm run build` | pass | No output beyond the script banners. |
| Fixture cleanup | Removed `Sandbox/BI-0195-probe/` from the filesystem | pass | Folder gone; `Welcome.md` tripwire present; no `.trash` entries (nothing was deleted through Obsidian). Other `Sandbox/` content predates this run and was not touched. |

## Output Excerpts

Defect 1, straight after writing (tool output, verbatim):

```
+0.5s similar Long.md ERROR {"code":"CLI_REPORTED_ERROR","message":"smart_connections_similar: source note has no embedding yet (Sandbox/BI-0195-probe/Long.md)","details":{"stage":"envelope-error","code":"SOURCE_NOT_INDEXED","detail":"Sandbox/BI-0195-probe/Long.md"}}
+0.6s similar Short.md ERROR {"code":"CLI_REPORTED_ERROR","message":"smart_connections_similar: source note has no embedding yet (Sandbox/BI-0195-probe/Short.md)","details":{"stage":"envelope-error","code":"SOURCE_NOT_INDEXED","detail":"Sandbox/BI-0195-probe/Short.md"}}
```

Raw plugin state and plugin call on the unembedded note (`Obsidian.com eval`):

```
=> [{"n":"Long.md","listed":true,"fc":"function","vec":"undefined"},{"n":"Short.md","listed":true,"fc":"function","vec":"undefined"}, ...]
=> threw: Invalid vector input to nearest()
```

Defect 1, poll (summarised per call; `count` is the tool's result):

```
+20.7s Long.md: OK count=50 empty=0 | Short.md: ERROR ... "code":"SOURCE_NOT_INDEXED" ... | Source.md: OK count=50 empty=0
+244.0s Long.md: OK count=50 empty=0 | Short.md: ERROR ... "code":"SOURCE_NOT_INDEXED" ... | Source.md: OK count=50 empty=0
```

Defect 2, around the move:

```
+0.0s before move: similar Source OK count=50 empty=0 probePaths=["…/Long.md#Lighthouse duties#{1}","…/Twin.md#Keeper notes#{1}"]
+0.4s move {"isError":false,"body":{"moved":true,"fromPath":"Sandbox/BI-0195-probe/Twin.md","toPath":"Sandbox/BI-0195-probe/Twin-moved.md"}}
+0.4s after move: similar Source OK count=49 empty=0 probePaths=["…/Long.md#Lighthouse duties#{1}"]
+58.2s after move: similar Source OK count=49 empty=0 probePaths=["…/Long.md#Lighthouse duties#{1}"]
```

Raw plugin candidates after the move (`Obsidian.com eval`):

```
=> {"raw":50,"bad":[{"i":1,"k":"","s":0.9058227862024839}],"probeKeys":["Sandbox/BI-0195-probe/Long.md#Lighthouse duties#{1}"],"queryRaw":10,"queryEmpty":0,"queryProbe":[…/Source.md#…, …/Long.md#…, …/Twin-moved.md#Keeper notes#{1}]}
```

Gates:

```
Test Files  11 passed (11)      Tests  253 passed (253)       # Smart Connections suites
Test Files  207 passed | 1 skipped (208)      Tests  5167 passed | 6 skipped (5173)   # npm test
```

## Residual Risks

- **Pre-fix failure for defect 2 not re-run on an old build.** The live run used only the fixed build. The live evidence is the raw plugin output: an empty key at index 1, within limit 100. With the pre-fix template, that key becomes `path: ""` and fails `matchEntrySchema` (`endsWith(".md")`), the TC-00225 `envelope-parse` failure; this is inferred from the code path, not observed again. In-process, the new template rows fail against the pre-fix templates (fix.md, Local Verification).
- **Query-side stale entry not reproduced live.** The raw `lookup` result held no empty key in this run, so the empty-path filter in `smart_connections_query` was not exercised against the real plugin. It is covered in-process by `_template.stale-entry.test.ts`. That matches the assessment, which also reproduced it only in-process.
- **Non-empty stale paths not observed.** After the move, neither tool returned the old `Twin.md` path. The plugin dropped the entry's key to `""` rather than keeping the old path. So similar's old-path rule (drop paths that don't resolve) and query's non-empty pass-through were not exercised live. Both are pinned in-process (similar `_template.test.ts` BI-0195 rows; query pass-through row).
- **Plugin returns 50 / 10 candidates, not 100.** In this vault, `find_connections` and `lookup` returned 50 and 10 raw candidates when asked for 100. The tools reported exactly those counts, so this is plugin behaviour and unchanged by the fix. It is out of scope here, but it bears on the help pages' "asks the plugin for 100 candidates" wording when docs-as-code runs.
- **Embedding timing.** The normal-length note was embedded within about 20 s here; the assessment saw 1–2 minutes. Both fit the documented "not indexed yet, then results" behaviour.
- `.memory/test-execution-instructions.md` still says the test vault has no plugins, but it has Smart Connections 4.7.2. Owner's file; not edited.

## Recommendation

Close the bug once the PR is reviewed: verified end-to-end. Both defects were re-run live against the real plugin. The unembedded-source path gives the typed `SOURCE_NOT_INDEXED` and then results once the note is embedded. A real empty-keyed stale entry is now left out by `smart_connections_similar` instead of failing the call. Automated suites, typecheck, lint and build are green. Next: open the PR, then `/code-review`. Then `/speckit-docs-as-code <n>` for the two help pages listed in fix.md Follow-ups; add a note that the plugin may return fewer than 100 raw candidates.
