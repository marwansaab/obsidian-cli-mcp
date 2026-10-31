# Research: Align Closed-Vault Reporting

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-31

All unknowns are resolved. Clarify settled the main decision (Q1): no new failure code, sub-reason or classifier; the existing post-retry `CLI_REPORTED_ERROR` is documented as the vault-unavailable failure. This file records the code-reading findings (F1–F5) that the decisions (D1–D7) rest on.

## Findings (plan-time code reading, HEAD `e0e49d6`)

### F1 — Six handlers carry one copy-pasted stage each

`paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query` and `smart_connections_similar` each run the same block after their `invokeCli` call. If a `vault` was given and stdout is empty (for `query_base`, stdout and stderr both empty), they call `detectIfClosed`, which spawns `obsidian vaults verbose` and looks the name up. When the name is listed, they throw `CLI_REPORTED_ERROR` with `details: { code: "VAULT_NOT_FOUND", reason: "not-open", stage?: "handler-stage-0", vault }`. When it is not listed, they fall through.

- `paths` and `smart_connections_similar` guard on `target_mode === "specific"` as well.
- `query_base`'s block is already commented "dead-code candidate pending T0 probe (R10 #2)".
- The message wording differs: four say "retry after a brief delay"; `pattern_search` and `query_base` say "registered but not open".

### F2 — The trigger never happens through the shim the server drives

`src/cli-adapter/_dispatch.ts` (`COLD_START_PATTERN` doc comment) and the spec 059 T0 findings (`specs/059-retry-cold-start/contracts/t0-probe-findings.md`) record that a command against a closed registered vault answers, on exit 0, `Error: Command "<cmd>" not found.` plus a suffix. The empty-stdout-on-exit-0 answer that the six stages wait for came from driving the GUI `.exe`, whose detached stdio drops output. The server drives the `Obsidian.com` shim. So:

1. The dispatch layer classifies the "command not found" stdout as `CLI_REPORTED_ERROR` (priority (c)).
2. `isColdStart` matches it, and `dispatchWithColdStartRetry` runs exactly one more attempt.
3. If the second attempt succeeds, the handler gets normal stdout and never reaches its empty-stdout stage. If it fails the same way, the error is thrown from `invokeCli`, so the handler's stage is skipped as well.

Either way the six stages are unreachable for a closed vault. An implement-time T0 probe (gate G1) confirms this before the stages are removed.

### F3 — What an empty answer becomes once the stages are gone

With the stage removed, empty stdout goes straight to each handler's existing parse step:

| Tool | Path taken by empty stdout | Result |
|---|---|---|
| `paths` | `JSON.parse("")` throws | `CLI_REPORTED_ERROR`, `details.stage: "json-parse"` |
| `tag` | `JSON.parse("")` throws | `CLI_REPORTED_ERROR`, `details.stage: "json-parse"` |
| `pattern_search` | `JSON.parse("")` throws | `CLI_REPORTED_ERROR`, `details.stage: "json-parse"` |
| `smart_connections_similar` | `JSON.parse("")` throws | `CLI_REPORTED_ERROR`, `details.stage: "json-parse"` |
| `smart_connections_query` | LAST-`=> ` extraction leaves `""`; `JSON.parse` throws | `CLI_REPORTED_ERROR`, `details.stage: "json-parse"` |
| `query_base` | stderr empty, so `JSON.parse("")` throws on the non-`BASE_MALFORMED` branch | `CLI_REPORTED_ERROR`, `details.stage: "json-parse"` |

None returns an empty success, so FR-007 holds without new code. This is the same outcome the handlers already give today when the vault is *not* listed (the fall-through path). A real empty result (an empty folder, a tag with no notes, zero matches) arrives as a JSON envelope with `count: 0`, never as empty stdout, so the two stay distinct.

### F4 — The post-retry failure reaches the caller unchanged in all six tools

- **Five eval-based tools.** They do not catch around `invokeCli`, so the `CLI_REPORTED_ERROR` from the second attempt propagates as-is.
- **`query_base`.** It catches `CLI_REPORTED_ERROR` around `invokeCli` and runs `classifyAndThrow` over stdout and stderr. None of its patterns matches the cold-start text:
  - `VIEW_NOT_FOUND` needs the word `view` (`\bview\b`; a `Did you mean: base:views` suffix does not match because `views` is not `view` followed by a word boundary);
  - the `BASE_MALFORMED` patterns need YAML or schema words.

  `classifyAndThrow` therefore returns and the original error is rethrown unchanged. One handler test pins this so a future classifier entry cannot silently capture the vault-unavailable failure.
- **Unknown vault, unchanged.**
  - For the five eval tools it is the `invokeCli` facade's `Vault not found.` re-classification (`CLI_REPORTED_ERROR`, `details.message: "Vault not found."`).
  - For `query_base` it is `resolveVaultRoot` → `remapVaultNotFound` (`VAULT_NOT_FOUND` / `unknown`), which runs before any spawn.

  None of this code is touched.

### F5 — The detection module has no other consumer

CodeGraph and a repository grep show that `src/tools/_eval-vault-closed-detection/{detector,registry-parser,index}.ts` are imported only by the six handlers and their tests. The vault registry (`src/vault-registry/registry.ts`) keeps its own parser (`parseVaultsVerboseOutput`) and is unaffected.

## Decisions

### D1 — Delete the six stages; no replacement code

- **Decision**: Remove the closed-vault block and the `detectIfClosed` import from each of the six handlers. Add nothing in their place.
- **Rationale**: F2 shows the stages cannot fire, and F3 shows the fall-through already gives a structured failure. Clarify Q1 rules out any new classifier.
- **Alternatives rejected**:
  - Keep the stages "just in case": this is the dead handling the spec retires (FR-005).
  - Replace them with a cold-start mapping in each handler: ruled out by Q1.

### D2 — Delete the `_eval-vault-closed-detection` module and its tests

- **Decision**: Remove the whole folder: `detector.ts`, `registry-parser.ts`, `index.ts`, `detector.test.ts`, `registry-parser.test.ts`.
- **Rationale**: FR-006, and F5 (no other consumer). Leaving it would orphan production code, which post-implement check 4 forbids.
- **Alternatives rejected**: Keep `parseVaultRegistry` for reuse. Nothing uses it, and the registry has its own parser.

### D3 — Vault-unavailable = the existing post-retry `CLI_REPORTED_ERROR`, documented

- **Decision**: For the six tools, the documented vault-unavailable failure is `CLI_REPORTED_ERROR` whose `details.stdout` begins `Error: Command "<cmd>" not found.`, where `<cmd>` is `eval`, or `base:query` for `query_base`. The documentation tells agents:
  - **Meaning**: the named vault could not be brought up after the server's automatic retry, for example because its command-line integration is disabled.
  - **Action**: open the vault in Obsidian, or enable its CLI integration, then call again. Do not loop on retries; the server already retried once.
  - **How to recognise it**: by the stdout signature alone. It is a failure, never an empty result (an empty result is a success with `count: 0`). The documentation does not cross-reference the unknown-vault entry: the published unknown-vault wording is outside this feature (spec Out of Scope; follow-up on BI-0076).
- **Rationale**: Clarify Q1 and BI-0076 (the envelope is correct, only undescribed). ADR-029 governs the retry and stays untouched.
- **Alternatives rejected**: A `details.reason` such as `vault-unavailable` (ADR-015 additive sub-reason), rejected by Q1. A dispatch-layer relabel, rejected by Q1 and out of scope.

### D4 — Short descriptions: remove `not-open` and add one vault-unavailable sentence per tool

- **Decision**: In each of the six `index.ts` descriptions:
  - remove every `not-open` / "registered but not open" mention and the `VAULT_NOT_FOUND(not-open)` precedence step;
  - add one sentence with the same meaning in every tool: a closed vault is opened automatically; if it cannot be brought up, the call returns `CLI_REPORTED_ERROR` with stdout `Error: Command "…" not found.` (vault unavailable).

  The exact text is in [contracts/closed-vault-contract.md](contracts/closed-vault-contract.md). Where a description lists `VAULT_NOT_FOUND` only because of `not-open`, that entry goes too:
  - `pattern_search`: `VAULT_NOT_FOUND` stood only for `not-open` there, so it is dropped and no unknown-vault text is added;
  - `tag`: "sub-reasons `unknown` / `not-open`" becomes "sub-reason `unknown`", with the unknown-vault wording otherwise unchanged.

  The smart-connections precedence chains drop the `VAULT_NOT_FOUND(not-open)` step.
- **Rationale**: FR-008 and SC-007. The descriptions are the surface agents see first.
- **Consequence**: six description fingerprints move in `src/tools/_register-baseline.json`. They are regenerated with `npm run baseline:write`, and the reviewer checks that only these six `descriptionFingerprint` values moved. Schemas, titles and annotations are unchanged.

### D5 — Reference pages

- **Decision**:
  - **Six affected pages** (`docs/tools/{paths,tag,pattern_search,query_base,smart_connections_query,smart_connections_similar}.md`):
    - remove the `not-open` rows, examples, precedence steps and the "detection caveat" prose;
    - add a "Closed vault" note (automatic recovery) and a vault-unavailable error row (D3), each standing on its own;
    - leave the unknown-vault rows byte-for-byte unchanged, with no reference to them from the new row or note.
  - **Two other pages** (`docs/tools/find_and_replace.md`, `docs/tools/patch_block.md`): remove only the unreachable `not-open` row or sub-reason (FR-009). Per Q1 they get no vault-unavailable row; their behaviour is outside the six.
  - **Untouched**: `views_base`'s `BASE_NOT_FOUND` / `not-open` (FR-010).
- **Rationale**: FR-008, FR-009, FR-010 and SC-004. The wording matches README §"failure table" (line 220) and `docs/tools/open_file.md`.

### D6 — Tests

- **Decision**: Per tool, in `handler.test.ts`:
  - **Delete**: the `not-open` case, the "precedence: unknown wins over not-open" and "not-open wins over NOT_INSTALLED" cases, the BI-027 ripple byte-equality case, and `query_base`'s "input.vault=undefined does NOT trigger closed-vault detection" case. Each pins the retired path.
  - **Add (a) closed vault recovers**: spawn mock answers attempt 1 with the cold-start stdout and attempt 2 with a valid envelope. Expect the normal result, exactly two spawns, both with `vault=<name>` and the same subcommand, and no `vaults` spawn.
  - **Add (b) vault unavailable**: both attempts answer the cold-start stdout. Expect `CLI_REPORTED_ERROR` with `details.stdout` matching `COLD_START_PATTERN`, no `details.code`, no `details.reason`, exactly two spawns, and no `vaults` spawn.
  - **Add (c) empty answer**: empty stdout with `vault` set → `CLI_REPORTED_ERROR` with `details.stage: "json-parse"`, one spawn, no `vaults` spawn (FR-007).
  - **Keep**: the unknown-vault cases unchanged (FR-004 / SC-003).
- In `index.test.ts`: replace the `not-open` assertions with assertions that the description contains the vault-unavailable sentence and no `not-open`. The smart-connections `docs` assertions that require `not-open` in the page body change to require the vault-unavailable row.
- **Rationale**: FR-011, Principle II. Reusing `COLD_START_PATTERN` from `_dispatch.ts` (already exported "as the single source of truth shared with the co-located tests") keeps the fixture honest.
- **Note**: (a) and (b) run through the real `dispatchCli` retry with a mock spawn. That is the existing handler-test seam (`spawnFn`), so no new seam is needed. Auto-launch plays no part: cold start is exit 0, so the app-down path never triggers.

### D7 — Changelog and attribution headers

- **Decision**:
  - Add `## [Unreleased]` to `CHANGELOG.md` with **Changed** (the six tools document the vault-unavailable failure) and **Removed** (the `not-open` sub-state from the six tools and from the `find_and_replace` / `patch_block` pages, plus the closed-vault detection module) (FR-012).
  - Update the `Original — no upstream.` intent line of each of the six handlers to drop the stage-0 / shared-module wording (Principle V).
- **Rationale**: FR-012 and Principle V. The headers describe what each file does.

## T0 probe (implement time)

See [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). G1 confirms F2 against the authorised test vault before any deletion. G2 confirms the vault-unavailable shape end to end if the environment allows a vault with the CLI integration off. Otherwise G2 is covered by the mocked handler tests and recorded as not run live.

## Implement log

- **T001 (2026-10-31, HEAD `7b92619`)**: `npm run typecheck`, `npm run lint` and `npm test` (with coverage thresholds) all green before any edit. No pre-existing failure.
- **T030–T035 (test-first check)**: in each of the six handlers, the new empty-answer test failed before the handler edit, as intended. The old stage made a second (`vaults`) spawn, which overflowed the one-response queue. The Recovers and Unavailable tests passed both before and after the edit, because they describe behaviour the ADR-029 retry already provides.
- **Deviation: `find_and_replace` short description.** The Story 3 grep (`docs/tools/*.md`, `src/tools/**/index.ts`) also hit `src/tools/find_and_replace/index.ts`, whose description listed `` `VAULT_NOT_FOUND`/`unknown`|`not-open` ``. The plan covered only that tool's reference page (FR-009). SC-004 says zero short descriptions may advertise the sub-state, and the handler emits only `unknown`, so the description now reads `` `VAULT_NOT_FOUND`/`unknown` ``. `find_and_replace/index.test.ts` gained an assertion for it. As a result, **seven** `descriptionFingerprint` values moved in the baseline, not the six in contract §5: the six tools plus `find_and_replace`. Nothing else in the baseline changed apart from `generatedFromBranch`. The stale header comment in `find_and_replace/handler.test.ts` (line 5, "vault not-found + not-open") names no existing test and was left alone (outside scope).
- **T044 (quickstart gate)**: `npm run typecheck`, `npm run lint` and `npm test` (158 files passed, 1 skipped; 3389 tests passed, 6 skipped; coverage thresholds met) are green. The Story 3 grep hits only `views_base` (`index.ts` and `docs/tools/views_base.md`, its `BASE_NOT_FOUND` / `not-open`). The Story 4 grep (`detectIfClosed|_eval-vault-closed-detection|handler-stage-0` in `src`) finds nothing, and `src/tools/_eval-vault-closed-detection/` no longer exists.
- **T045 (post-implement structural verification, after `codegraph sync`)**:
  1. No new error class or code. `src/errors.ts` is unchanged, and each remaining failure in the six handlers is an existing `UpstreamError` shape.
  2. No handler imports `createLogger` / `createQueue`. `src/server.ts`, `src/tools/_register.ts` and `src/cli-adapter/**` are unchanged.
  3. The six handlers import only `cli-adapter`, `errors`, `_shared`, `logger` / `queue` types, plus `search/handler` (`pattern_search`), `_active-file` and the vault-registry type (`query_base`), and the file-type type (`query_base`, `smart_connections_similar`), as before. `detectIfClosed` and `parseVaultRegistry` are no longer in the index.
  4. No production symbol was added, so nothing is orphaned. Each `execute*` handler is still called from its own `index.ts`.
  5. Baseline: seven `descriptionFingerprint` values moved (see the deviation above). No `inputSchema`, `outputSchema`, title or annotation changed.

## T0 evidence

**Date**: 2026-10-31. **Host**: Windows 11, Obsidian 1.14.5. **Binary**: the `Obsidian.com` shim on `PATH` (the binary the server resolves). **Vault**: the authorised test vault. Two of the owner's vaults stayed open throughout, so the app stayed up. The test vault was open at the start; it was closed for each probe by running `setTimeout(() => window.close(), 300)` through `eval` against it, and confirmed closed by listing the Obsidian window titles. It was reopened at the end, so its open/closed state is restored. No note was written, moved or deleted.

### G1 — PASS

**Step 2** (raw shim, test vault closed): `obsidian vault=<test vault> eval code="1+1"`

- exit code: `0`
- stdout (72 bytes): `Error: Command "eval" not found. It may require a plugin to be enabled.` followed by a newline
- stderr: empty (0 bytes)

The answer is the ADR-029 cold-start signature, not empty stdout.

**Step 3** (built server, `npm run build`, driven through a v2 `StdioClientTransport` client; the test vault was closed again before each call):

| Tool | Arguments (vault-relative) | Result | `dispatch.retry` |
|---|---|---|---|
| `paths` | `folder: "Fixtures/BI-0048"` | normal: `{"count":4,"paths":["Fixtures/BI-0048/Items.base","Fixtures/BI-0048/alpha.md","Fixtures/BI-0048/beta.md","Fixtures/BI-0048/gamma.md"]}` | yes (`command: "eval"`) |
| `tag` | `tag: "probe072"` | normal: `{"count":0,"paths":[]}` | yes (`eval`) |
| `pattern_search` | `pattern: "alpha"`, `folder: "Fixtures/BI-0048"` | normal: `{"count":0,"matches":[]}` | yes (`eval`) |
| `query_base` | `base_path: "Fixtures/BI-0048/Items.base"`, `view_name: "AllItems"` | normal: three rows (`alpha`, `beta`, `gamma`), `truncated: false` | no (see below) |
| `smart_connections_query` | `query: "alpha"` | `CLI_REPORTED_ERROR` / `SMART_CONNECTIONS_NOT_INSTALLED` (`stage: "envelope-error"`, "plugin not loaded in vault: …") | yes (`eval`) |
| `smart_connections_similar` | `path: "Fixtures/BI-0048/alpha.md"` | `CLI_REPORTED_ERROR` / `SMART_CONNECTIONS_NOT_INSTALLED` (`stage: "envelope-error"`) | yes (`eval`) |

Each call returned in about 0.4 s of server time after the one retry. The test vault has no plugins by design, so `SMART_CONNECTIONS_NOT_INSTALLED` is the smart-connections tools' normal result for it. It comes from the plugin-lifecycle stage, which runs only after the vault has answered `eval`, so the vault was brought up. No call returned `not-open`, and no call reached a `vaults verbose` spawn.

**`query_base` note**: a follow-up raw probe of `obsidian vault=<test vault> base:query path=Fixtures/BI-0048/Items.base view=AllItems format=json` against the closed vault returned the three rows as JSON on exit 0 with empty stderr, on the first attempt. On this Obsidian version `base:query` is served without the cold-start answer, so no retry is needed. That is still not the empty-stdout signal the retired stage waited for. The vault-unavailable path for `query_base` (a `Command "base:query" not found.` answer that persists past the retry) is covered by the mocked handler tests.

An earlier pass of step 3 is discarded: its `query_base` call omitted `view_name` and failed input validation before any spawn, which left the vault closed, so the following `smart_connections_query` call ran against a vault the close step had already reopened. The rerun above closed the vault before every call.

### G2 — not run live

The environment offers no way to turn off the CLI integration for the test vault alone without touching the owner's vaults or the app settings. Covered by the handler tests (D6(b)), per the probe plan.
