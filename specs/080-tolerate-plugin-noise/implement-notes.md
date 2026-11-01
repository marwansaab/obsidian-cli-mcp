# Implement notes: Tolerate plugin noise (for the PR description)

## Baseline (T001)

On the branch before any change: `npm run typecheck` and `npm run lint` clean; `npx vitest run` 166 files passed, 1 skipped; 3611 tests passed, 6 skipped. No test was already failing.

`npm run format:check` already reports 1,203 files on the baseline (for example `tsconfig.json`, `vitest.config.ts`), so it is not a usable gate for this change. The repository has not been formatted with Prettier; this PR does not reformat it.

## T0 gate (T002, research D10)

Probe: `obsidian vault=TestVault-Obsidian-CLI-MCP eval code=(async()=>{return "obsidian-cli-mcp:t0-probe:"+(await (<template>))})()`, spawned the way `dispatchOnce` spawns (`shell: false`, bare `obsidian`, which resolves to `Obsidian.com`). All read-only; no fixture created.

| Template | Exit | stdout |
|---|---|---|
| `FOCUSED_FILE_TEMPLATE` | 0 | `=> obsidian-cli-mcp:t0-probe:{"path":"Sandbox/BI-0165/A1-open.md","base":"C:\\Marwan-Saab-ADO\\My-Setup\\My-Setup\\TestVault-Obsidian-CLI-MCP"}` |
| `FOCUSED_VAULT_TEMPLATE` | 0 | `=> obsidian-cli-mcp:t0-probe:{"path":"Sandbox/BI-0165/A1-open.md","base":"C:\\Marwan-Saab-ADO\\My-Setup\\My-Setup\\TestVault-Obsidian-CLI-MCP"}` |
| `links` (active, composed) | 0 | `=> obsidian-cli-mcp:t0-probe:{"ok":true,"count":0,"links":[]}` |
| untagged `FOCUSED_VAULT_TEMPLATE` (reference) | 0 | `=> {"path":"Sandbox/BI-0165/A1-open.md","base":"…"}` |

Observed form: **raw** (`=> <tag><value>`). The quoted form is still handled (contract §1 A9). stderr was empty throughout. The gate passed.

## T043: no plugin-specific logic

`src/cli-adapter/eval-output.ts` and the eval branch of `dispatchOnce` match only on the `=> ` marker, the call's own tag, and lines starting `Error:` (plus `error: no active file`, case-insensitive, and the existing cold-start signature). No plugin name or plugin output text appears in production code; `Found and returned …` appears only in tests and comments.

## T048: CodeGraph post-implement check

`codegraph sync` could not take the lock (the MCP watcher holds it and keeps the index in step), so the check ran through the MCP `codegraph_explore` tool.

1. No new error class or code: `src/errors.ts` is unchanged.
2. No handler imports `createLogger` / `createQueue`; `src/server.ts` is unchanged.
3. `eval-output.ts` is imported by `_dispatch.ts` and `cli-adapter.ts` among production files; the only other importers are tests and the test fixture file `src/tools/_handler-test-fixtures.ts`. No upward import.
4. Nothing orphaned: `evalAnswerTag`, `wrapEvalCode`, `findTaggedEvalAnswer` (cli-adapter, dispatch), `hasEvalAnswerLine`, `findReportedErrorLine` (dispatch), `COLD_START_LINE_PATTERN` (`isColdStart`), `parseEvalAnswer` and `evalParseFailureStdout` (the handlers and `_active-file.ts`) all have production callers. `parseEvalStdout`, `set_property`'s `parseEvalResponse` and the inline `"=> "` strips are gone.

## T050: live check (quickstart §4)

Run from a temporary build of this branch against `TestVault-Obsidian-CLI-MCP` only, in specific mode (active mode would target whichever vault Obsidian has focused). Scratch note `Sandbox/080-live/noise.md`, removed afterwards; `Welcome.md` intact; no `.trash` residue.

| Call | Result |
|---|---|
| `get_active_file` (specific) | `{"active":{"path":"Sandbox/BI-0165/A1-open.md","name":"A1-open.md","basename":"A1-open","extension":"md"}}` |
| `links` (specific, scratch note) | `{"count":1,"links":[{"target":"Welcome","line":5,"kind":"wikilink"}]}` |
| `read_heading` `Top::Section` | `{"content":"\nBody with a [[Welcome]] link.\n"}` |
| `smart_connections_query` | `CLI_REPORTED_ERROR` `SMART_CONNECTIONS_NOT_INSTALLED` (`plugin not loaded in vault: TestVault-Obsidian-CLI-MCP`) |

Step 1 of quickstart §4 (plugin lines in the raw output) cannot run in the authorised vault: it has no plugins by design. The typed path, tag included, works end to end; the plugin-noise cases are covered by the tests. A first seed of the scratch note was written with a UTF-8 BOM, which hid its first heading from `read_heading` (`HEADING_NOT_FOUND`); rewritten without a BOM it passed. That is pre-existing behaviour, outside this change.

## Test-side notes

- Handler and tool tests inject the nonce through `EVAL_NONCE_SEAM`, a `{ evalNonce }` object typed `Pick<InvokeCliDeps, "evalNonce">` and spread into deps: like `resolveBinary` and `launchFn`, it is an `InvokeCliDeps` test seam that reaches `invokeEval` because handlers pass their deps whole.
- Tests that pinned the old tolerant parse now pin contract §1 A14: bare JSON with no answer line is a `json-parse` failure (`paths`, `tag`, `find_by_property`, `smart_connections_query`'s old R14 fallback).
- `get_active_file` has no `ok:false` envelope, so its US1 error case is a wrong-shape answer (`envelope-parse`). `find_by_property` has none either, so its US1 envelope-error case is skipped.

## Gate (T046, T049)

`npm run typecheck` and `npm run lint` clean; `npx vitest run` 167 files passed, 1 skipped; 3790 tests passed, 6 skipped. `src/cli-adapter/architecture.test.ts` alone: 14 passed. `git diff --stat main -- src/tools/_register-baseline.json` is empty (T047), and no `index.ts`, `schema.ts`, `_template.ts`, `src/errors.ts`, `src/server.ts` or `invoke-bounded-cli.ts` is in the diff.

## Constitution Compliance (T051)

| Gate | Verdict | Note |
|---|---|---|
| I. Modular Code Organization | Y | `eval-output.ts` sits in `src/cli-adapter/`; tools read `evalAnswer` and import nothing new from cli-adapter. |
| II. Public Surface Test Coverage | Y | Every modified tool has before / after / look-alike / no-answer cases, plus long-output `stdoutTail` at bounded sites. |
| III. Boundary Input Validation with Zod | Y | Schemas untouched. |
| IV. Explicit Upstream Error Propagation | Y | No new code, stage or reason; conflicting tagged lines fail loudly; retry stays single. |
| V. Attribution & Layered Composition | Y | New files carry `// Original — no upstream.`; stale headers corrected. |
| ADR-010 / ADR-013 / ADR-014 | N/A | No tool added or renamed; templates byte-identical. |
| ADR-015 | Y | No `details.reason` or `details.code` added. |
| ADR-029 | Y | Per the amendment of 2026-11-01: eval-only, single retry. |
| MCP Tool Surface Standards | Y | Baseline unchanged. |
| Security Defaults | N/A | `obsidian_exec` code unwrapped; the tag is server-generated and `JSON.stringify`-quoted. |

Authority: the ADR-029 amendment of 2026-11-01 and the owner's analyze-time ruling that look-alike answer lines must never win (research D1). Research D3: an `obsidian_exec` `eval` whose output has plugin lines, then an `Error:` line, and no `=> ` answer line now returns `CLI_REPORTED_ERROR` (or `ERR_NO_ACTIVE_FILE`, or the single cold-start retry) instead of a verbatim success.
