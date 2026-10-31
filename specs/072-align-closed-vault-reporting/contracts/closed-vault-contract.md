# Contract: Closed-Vault Behaviour of the Six Affected Tools

**Feature**: [../spec.md](../spec.md) | **Decisions**: [../research.md](../research.md) D3–D5

Tools in scope: `paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`.

## 1. Outcomes when the call names a vault

| Vault state | Outcome | Shape (unchanged by this feature unless noted) |
|---|---|---|
| Registered and open | Normal result | The tool's output schema |
| Registered and closed, and the retry brings it up | Normal result; the first call takes longer | The tool's output schema |
| Registered, and it cannot be brought up (**vault unavailable**) | Failure | `CLI_REPORTED_ERROR`. `details.stdout` begins `Error: Command "<cmd>" not found.` (`<cmd>` = `eval`; `base:query` for `query_base`). No `details.code`, no `details.reason`. |
| Not registered (**unknown vault**) | Failure | `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` for the five eval tools; `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"` for `query_base` when the registry lookup misses. `query_base` also returns the facade form (`details.message: "Vault not found."`) when the CLI itself reports it (existing handler test "unknown vault via cli-adapter `Vault not found.` reclassifier"). |
| Any state, and the query matches nothing (**empty result**) | Success | Output with `count: 0` (and empty `paths` / `matches` / `rows` as the tool defines) |
| Empty, unexplained answer (anomaly) | Failure | `CLI_REPORTED_ERROR` with `details.stage: "json-parse"` |

The unknown-vault row records today's behaviour for reference only. This feature does not touch the published unknown-vault wording; see the spec's Out of Scope and the follow-up on BI-0076.

**Retired from emission**: `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"` and `details.reason: "not-open"`. ADR-015 is additive-only for *defining* sub-reasons. Here the value is withdrawn from these tools' documentation because it was never emitted. `open_file` retired the same value the same way in an earlier change.

**Not changed**: the dispatch layer, `COLD_START_PATTERN`, the single retry (ADR-029), auto-launch (BI-060) and its failures, `obsidian_exec`, the unknown-vault paths, and `views_base`'s `BASE_NOT_FOUND` / `not-open`.

## 2. Short-description sentence (all six `index.ts`)

The same meaning appears in every tool. The tool name and `<cmd>` are filled in per tool:

> Closed vault: a registered vault that is not open is opened automatically and the call returns its normal result (the first call takes longer). If it cannot be brought up — for example, its command-line integration is disabled — the call fails with `CLI_REPORTED_ERROR` whose `details.stdout` starts `Error: Command "<cmd>" not found.` (vault unavailable): open the vault in Obsidian, then call again. This is a failure, never an empty result.

Removals in the same descriptions:

- `smart_connections_query`: the "Closed-but-registered vaults: … `not-open` … Retry after a brief delay." sentence, and the `VAULT_NOT_FOUND(not-open) →` precedence step.
- `smart_connections_similar`: in the "Vault states: …" sentence, keep its unknown-vault part unchanged and drop only the `"not-open"` alternative, the "In practice closing a vault … treat both as 'vault unavailable' …" clause and the retry advice. The sentence above is added separately. Also remove the `VAULT_NOT_FOUND(not-open) →` precedence step.
- `tag`: "(`VAULT_NOT_FOUND` with sub-reasons `unknown` / `not-open`)" becomes "(`VAULT_NOT_FOUND` with sub-reason `unknown`)". Only `not-open` is dropped; the unknown-vault wording is otherwise unchanged.
- `query_base`: "`VAULT_NOT_FOUND` with sub-reasons `unknown`/`not-open`" becomes "`VAULT_NOT_FOUND` with sub-reason `unknown`".
- `pattern_search`: drop `VAULT_NOT_FOUND` from the sub-discriminator list, because in this tool it only ever stood for `not-open`. Add no unknown-vault text.
- `paths`: nothing to remove; the sentence is added.

The implementer may adjust wording to fit each description's style. `index.test.ts` asserts:

- the substrings `Closed vault`, `opened automatically`, `Command "`, `vault unavailable` and `never an empty result`;
- the absence of `not-open` and `registered but not open`;
- that the closed-vault sentence contains neither `Vault not found` nor `VAULT_NOT_FOUND`, so it stands on its own.

## 3. Reference-page entries (`docs/tools/<tool>.md`, the six pages)

Error-table row (adapt to the page's column layout):

| Code | When | What to do |
|---|---|---|
| `CLI_REPORTED_ERROR` (`details.stdout` starts `Error: Command "<cmd>" not found.`) | **Vault unavailable.** The named vault is registered but could not be brought up after the server's automatic retry, for example because its command-line integration is disabled. | Open the vault in Obsidian (or enable its CLI integration), then call again. Do not retry in a loop; the server has already retried once. |

Plus a "Closed vault" note near the `vault` parameter. It says that a closed registered vault is opened automatically and the call returns its normal result, and that a vault that cannot be brought up is a failure, not an empty result. Neither the row nor the note mentions the unknown-vault row, which stays byte-for-byte unchanged. Remove the `not-open` rows, the JSON example (`smart_connections_query`), the precedence steps, the "detection caveat" paragraph and the retry-after-a-delay advice.

## 4. Other pages (FR-009)

- `docs/tools/find_and_replace.md`: delete the `CLI_REPORTED_ERROR | VAULT_NOT_FOUND | not-open` row (the page's only closed-vault mention).
- `docs/tools/patch_block.md`: `unknown` / `not-open` becomes `unknown`, and the "What triggered it" text becomes "Vault is not registered."

## 5. Fingerprint baseline expectation

`npm run baseline:write` moves exactly six `descriptionFingerprint` values: `paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query` and `smart_connections_similar`. No `inputSchema`, `outputSchema`, title, annotation or tool-count change.
