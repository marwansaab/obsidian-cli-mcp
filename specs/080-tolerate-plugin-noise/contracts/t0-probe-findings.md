# T0 probe findings: Tolerate plugin noise

**Date**: 2026-11-01 | **Vault**: `TestVault-Obsidian-CLI-MCP` | **Binary**: `C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com` (the console shim that bare `obsidian` resolves to)

Each probe was run with `Start-Process … -RedirectStandardOutput / -RedirectStandardError`, so stdout and stderr were captured separately. No file in the vault was created or changed.

## P1: a wrapped value prints raw

Command:

```text
obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=(async()=>'<<ocm-probe>>'+(await ((async()=>JSON.stringify({a:1}))())))()"
```

| | |
|---|---|
| exit code | 0 |
| stdout | `=> <<ocm-probe>>{"a":1}` followed by a line break |
| stderr | empty |

The value prints unquoted on one line. Research D1's line shape holds.

## P2: where `console.log` output lands

Command:

```text
obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=(async()=>{console.log('noise-line');return '<<ocm-probe>>'+JSON.stringify({a:1});})()"
```

| | |
|---|---|
| exit code | 0 |
| stdout | `noise-line`, then `=> <<ocm-probe>>{"a":1}`, each on its own line |
| stderr | empty |

`console.log` output goes to stdout, on its own line before the answer line. It is not interleaved into the answer line.

**Gate (tasks.md T001)**: passed. P1 printed the value unquoted, and P2 kept the noise on a separate line.

## P3: cold start of a wrapped eval

Not run live. P3 needs the test vault closed but registered, and closing a vault window takes GUI interaction that this unattended run cannot do. The test vault was open throughout (P1, P2 and P4 answered on the first attempt).

The cold-start signature the retry keys on is the one recorded against the same `Obsidian.com` shim in `specs/059-retry-cold-start/contracts/t0-probe-findings.md`: `Error: Command "eval" not found. It may require a plugin to be enabled.` on stdout, with exit code 0. The wrapper changes only the `code=` value, not the command name, so the signature is unchanged. Contract D1 and the `open_file` handler test (T025) cover the signature appearing after plugin lines. The live end-to-end step 2 (T041) is the remaining check.

## P4: length of the wrapped focused-file `code=` element

The wrapped `FOCUSED_FILE_TEMPLATE` `code=` element, with a real `ocm-<uuid>` tag, is **204 characters** (the template alone is 129). That is within the 250-character limit asserted by `write_note/handler.test.ts`.

Sent live:

```text
obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=(async()=>'<<ocm-d9e265ed-f670-40ce-92e6-80a236860485>>'+(await ((async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})())))()"
```

| | |
|---|---|
| exit code | 0 |
| stdout | `=> <<ocm-d9e265ed-f670-40ce-92e6-80a236860485>>{"path":"Sandbox/BI-0165/A1-open.md","base":"C:\\Marwan-Saab-ADO\\My-Setup\\My-Setup\\TestVault-Obsidian-CLI-MCP"}` followed by a line break |
| stderr | empty |

## Post-implement verification (T040)

Run after `codegraph sync`, with `codegraph_explore` on `wrapEvalCode`, `findAnswer`, `findNoActiveFileLine`, `findErrorLine`, `parseEvalAnswer`, `stdoutDetails`, `invokeCli`, `isColdStart`, `decodeEvalEnvelope` and `parseFocusedVault`, and `git diff main`.

1. **No new error code, stage or reason.** `src/errors.ts` is unchanged. Every new failure path raises an existing code through `UpstreamError`; the only new `details` key is `stdoutLength`.
2. **No new log event or call site (FR-014).** `git diff main -- src/logger.ts` is empty, and the diff adds no `deps.logger.*` call. `dispatchRetry` is still emitted only from `dispatchWithColdStartRetry`.
3. **DI discipline.** No handler imports `createLogger` or `createQueue`. `src/server.ts`, `src/queue.ts`, `src/tools/_register.ts` and `src/cli-adapter/invoke-bounded-cli.ts` are unchanged against `main`.
4. **Import direction.** `src/cli-adapter/_eval-answer.ts` is imported by production code only from `_dispatch.ts` and `cli-adapter.ts`. Nothing in `src/cli-adapter/**` imports `src/tools/**`. `src/tools/_eval-parse.ts` is imported only from `src/tools/**`: `_active-file.ts` and the find_by_property, read_heading, paths, tag, pattern_search, smart_connections_query, smart_connections_similar, set_property, find_and_replace and query_base handlers.
   - **Deviation (tests only)**: besides `_eval-answer.test.ts`, three test files under `src/tools/` import `wrapEvalCode` to build expected values: `_handler-test-fixtures.test.ts`, `_registration-stub.test.ts` and `_plugin-noise.test.ts`. These are downward imports (tools → cli-adapter), so Principle I holds. The shared stubs (`_handler-test-fixtures.ts`, `_registration-stub.ts`) do not import it; they duplicate the wrapper literal with a comment pointing at `_eval-answer.ts`.
5. **Reachability.** Every new production symbol has a production caller: `wrapEvalCode`, `mintAnswerTag` and `findAnswer` from `invokeCli`; `findAnswer`, `findNoActiveFileLine`, `findErrorLine` and `stdoutLines` from `dispatchOnce` / `isColdStart`; `parseEvalAnswer` and `stdoutDetails` from `_active-file.ts` and the ten handlers above.
6. **`parseEvalStdout`** has no remaining references. set_property's private `parseEvalResponse` and smart_connections_query's R14 last-marker extraction are removed.
7. **Published surface.** `npm run baseline:write` left every fingerprint in `src/tools/_register-baseline.json` unchanged; only the `generatedFromBranch` metadata line moved, and it was restored. No description, schema or `closedVaultNote` text was edited.
8. **No plugin-specific setting (SC-007, T035).** Neither `_eval-answer.ts` nor `_eval-parse.ts` names a plugin, and `git diff main -- src/server.ts` is empty, so no environment variable or setting was added.
9. **Check-only docs (T036).** `docs/tools/outline.md`, `context_search.md`, `search.md` and `properties.md` describe the parse errors of non-eval commands (`outline`, `search`, `properties`), whose `details.stdout` is unchanged. They needed no edit.

## Live end-to-end (T041)

Built server (`npm run build`, then an MCP client over stdio against `dist/index.js`), test vault open, fixtures `Sandbox/080-171316/a.md` (`# A` / `## B` / `See [[b]].`) and `Sandbox/080-171316/b.md`, written directly to the vault folder.

| Step | Call | Result |
|---|---|---|
| 1 | `get_active_file` `{target_mode: "active"}` | success: `{"active":{"path":"Sandbox/BI-0165/A1-open.md","name":"A1-open.md","basename":"A1-open","extension":"md"}}` |
| 1 | `paths` `{folder: "Sandbox/080-171316"}` | success: `{"count":2,"paths":["Sandbox/080-171316/a.md","Sandbox/080-171316/b.md"]}` |
| 1 | `links` on `a.md` | success: `{"count":1,"links":[{"target":"b","line":5,"kind":"wikilink"}]}` |
| 1 | `read_heading` `A::B` on `a.md` | success: `{"content":"\nSee [[b]].\n"}` |
| 2 | `open_file` on `a.md` | success: `{"opened":"Sandbox/080-171316/a.md","vault":"TestVault-Obsidian-CLI-MCP","new_tab":false,"placement":"active_tab_used"}` |
| 2 | `read` `{target_mode: "active"}` (focused-file eval, then read) | success: `{"content":"# A\n\n## B\n\nSee [[b]].\n"}` |
| 3 | delete `Sandbox/080-171316/` | done; no `080-` folder left in `Sandbox/`, nothing in `.trash/`, `Welcome.md` untouched |

Each result matches the seeded content, so the answer-tag wrapper round-trips live with no plugin output present (FR-010).

**Not run live**: step 2's cold start. The test vault stayed open, because closing its window needs GUI interaction this unattended run cannot do (see P3). `open_file` was called against the open vault instead. The cold-start-after-plugin-lines path is covered by `_dispatch.test.ts` D1 and the `open_file` handler test added for US2.

**Pre-existing residue**: `Sandbox/` already held folders and notes from earlier runs (`BI-0008`, `BI-0016`, `BI-0165`, `BI-0168`, `BV`, `TC-0000x`, `TN`, and others). This run did not touch them. The focused note `Sandbox/BI-0165/A1-open.md` is one of them.
