# Data Model: Verify Non-ASCII Handling

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

Everything here lives in `src/tools/_non-ascii-checks.ts` (research D2) and has no persistence. The script builds a run and prints it. Nothing is stored.

## E1 — Run arguments

| Field | Source | Rule |
|---|---|---|
| `testVault` | `--test-vault` (required) | The display name of the vault the fixtures go in. It must differ from `semanticVault` (D8, a usage error). When the `vaults` tool does not list it, or the `vaults` call fails, no fixture is written and every test-vault scenario is `BLOCKED` (E6 `testVaultListed`); this is not a usage error. |
| `semanticVault` | `--semantic-vault` (required) | The display name of the read-only Smart Connections vault. It only has to be listed for S1 and S2; when it is not listed, both are `BLOCKED`, which is not a usage error. |
| `stagedNote` | `--staged-note` (optional) | The vault-relative path of the owner-staged note in `semanticVault`. When it is absent, or contains no character above U+007F, S1 is `BLOCKED` (D5). |

The arguments are parsed with `node:util` `parseArgs` in the script. Missing required flags, unknown flags, or equal vault names give exit status `2` with a usage line.

## E2 — Fixture set (test vault only)

All paths are vault-relative, with forward slashes. All strings are NFC source literals (D9). `<run>` is `Sandbox/non-ascii-check-<YYYYMMDD-HHMMSS>-<4 hex>`.

| Key | Path | Content (lines, `\n`-joined, trailing `\n`) |
|---|---|---|
| `folder` | `<run>/日本語フォルダ` | (a folder) |
| `source` | `<run>/日本語フォルダ/Café 日記.md` | 1 `# BI-001 — Überblick 🚀` · 2 `` · 3 `Order café42 arrived.` · 4 `` · 5 `## Café — naïve 日本` · 6 `` · 7 `See [[Résumé 東京]].` · 8 `` · 9 `### Ünïcödé 🎉 test` |
| `target` | `<run>/Résumé 東京.md` | 1 `Target note.` |
| `outside` | `<run>/outside.md` | 1 `Price café77 noted.` |
| `missingFolder` | `<run>/存在しないフォルダ` | (never created) |

Expected values derived from the table:

- **headings**: `[{level:1,text:"BI-001 — Überblick 🚀"}, {level:2,text:"Café — naïve 日本"}, {level:3,text:"Ünïcödé 🎉 test"}]`. 🚀 (U+1F680) and 🎉 (U+1F389) are outside the BMP (spec Edge Cases); — is U+2014.
- **link target**: `"Résumé 東京"`.
- **folder listing**: exactly `[source]`.
- **pattern**: `café\d+`. Source match `{path: source, line: 3, match: "café42", text: "Order café42 arrived."}`; outside match `{path: outside, line: 1, match: "café77", text: "Price café77 noted."}`.

## E3 — Semantic-vault inputs (read-only)

| Key | Value | Rule |
|---|---|---|
| `stagedNote` | E1 `stagedNote` | Read with `fs.stat` and `smart_connections_similar` only (FR-017). |
| `missingNote` | `_non-ascii-check/存在しない ノート café — <8 hex>.md` | Never created. `fs.stat` must show it absent before the call; otherwise S2 is `BLOCKED`. |

## E4 — Scenario

One entry per spec acceptance scenario that a call can prove (8 checks for 9 scenarios: Story 5 scenario 3 is S1's `BLOCKED` branch).

| Field | Meaning |
|---|---|
| `id` | `H1`, `L1`, `F1`, `F2`, `P1`, `P2`, `S1`, `S2` |
| `capability` | `headings`, `links`, `folder listing`, `pattern search`, `similar notes` |
| `tool` | The published tool called |
| `input(inputs)` | The exact `callTool` arguments |
| `expected` | The expectation in words and values, printed on `FAIL` |
| `precondition(context, inputs, earlier)` | Pure: the first unmet precondition (E6), or none; `earlier` holds each scenario's last parsed result so far |
| `classify(result, inputs)` | Pure: a success or error payload (E5) → `PASS`, `FAIL` or `BLOCKED` |
| `retry` | `true` for the test-vault scenarios (D4), `false` for S1 and S2. It also marks which vault a scenario uses |

The full table, with inputs and classification rules, is in [contracts/non-ascii-check-contract.md](contracts/non-ascii-check-contract.md) §S.

## E5 — Tool result (as received)

The MCP `callTool` result, parsed by a zod schema in the module:

- success: `{isError?: false, structuredContent?: object, content: [{type:"text", text}]}`. The payload is `structuredContent` when present, otherwise `JSON.parse(content[0].text)`.
- failure: `{isError: true, content: [{type:"text", text}]}`, where `text` is the JSON `{code, message, details}` of the `UpstreamError` (`asToolError`).
- A result that matches neither shape is classified `FAIL` with reason `unexpected result shape`, never `BLOCKED`.

## E6 — Check context

Facts the script proves before a call, independently of the route under test (D4, D5):

| Field | Proved by |
|---|---|
| `testRoot` | The test vault's folder, present when the `vaults` tool succeeded and listed `testVault` (a failing `vaults` call, recorded as `vaultsError`, counts as not listed) |
| `fixturesVisible` | The `read` tool returned the outside note's exact content (an all-ASCII path, written in the same seeding pass) before the deadline |
| outside seen by P1 | P1's last result contained the outside match. Not a context field: P2's precondition reads P1's last result from `earlier` (E4) |
| `stagedNoteGiven`, `stagedNoteNonAscii` | E1 |
| `semanticRoot` | The semantic vault's folder, present when the `vaults` tool succeeded and listed `semanticVault` (a failing `vaults` call counts as not listed) |
| `stagedNoteOnDisk`, `missingNoteAbsent` | `fs.stat` against the semantic vault's folder |

## E7 — Outcome

`{id, capability, tool, input}` plus one of `{status: "PASS"}`, `{status: "FAIL", expected, actual}` or `{status: "BLOCKED", precondition}`. The type is a union on `status`, so each status carries exactly its own fields.

- `FAIL` always carries `input`, `expected` and `actual` (FR-011).
- `BLOCKED` always carries `precondition`, naming the one that is missing (FR-012, FR-018).
- `PASS` carries `input`.

State per scenario: `pending → PASS | FAIL | BLOCKED`. A retried scenario stays `pending` until it passes or reaches its deadline. An unmet precondition skips straight to `BLOCKED` without a call. An exception thrown by a call (for example, the transport closed) is caught for that scenario alone and becomes `FAIL` with the error text as `actual`, so the other scenarios still run (FR-010).

## E8 — Report

Rendered by the module from the outcomes plus a header (`date`, `package version`, `git sha`, `server version` from `serverInfo`, the three arguments) and a cleanup result (`removed <run>` or `RESIDUE <path>`). The layout is in contract §R. Invariants:

- one block per scenario, in table order;
- the summary counts sum to 8;
- the exit status follows D7.
