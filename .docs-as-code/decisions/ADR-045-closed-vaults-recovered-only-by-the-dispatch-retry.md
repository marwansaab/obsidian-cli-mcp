# ADR-045 — Closed vaults are recovered only by the dispatch retry, and "vault unavailable" is documented, not coded

- **Status:** Accepted
- **Date:** 2026-10-31
- **Source:** PR #100 (BI-0076, `specs/072-align-closed-vault-reporting/`,
  clarify Q1, research F2 to F4 and D1 to D3, T0 gate G1), commits
  `e637b24` and `373aab8`
- **Related:** ADR-029 (Retry Once on Cold-Start Vault-Launch Failure), which
  this decision makes the single closed-vault mechanism; ADR-015
  (Sub-Discriminators via details.reason for Multi-State Error Codes), whose
  canonical example, `VAULT_NOT_FOUND` / `not-open`, is no longer emitted by
  any tool; ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern),
  whose precedence chain listed `VAULT_NOT_FOUND(not-open)` as its second
  step; ADR-031 (Cross-Vault Open via Vault-Targeted Focus), the precedent
  that first retired `not-open` from emission, for `open_file`

## Context

Six read tools — `paths`, `tag`, `pattern_search`, `query_base`,
`smart_connections_query` and `smart_connections_similar` — each ran a stage
after their `invokeCli` call. When a `vault` was named and stdout came back
empty, the stage spawned `obsidian vaults verbose` through the shared
`src/tools/_eval-vault-closed-detection/` module, and if the name was listed it
threw `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`,
`details.reason: "not-open"` and a message telling the caller to retry after a
brief delay. The stage was written for `smart_connections_similar` (BI-026,
PR #28), lifted into the shared module for `smart_connections_query` (BI-027,
PR #29), and reused by the other four.

The empty-stdout signal the stage waited for came from driving Obsidian's GUI
executable, whose detached stdio drops output. The server drives the
`Obsidian.com` shim. Through the shim a closed registered vault answers
`Error: Command "<cmd>" not found.` on exit 0, which dispatch classifies as
`CLI_REPORTED_ERROR` and the ADR-029 cold-start retry (PR #64) already handles
with exactly one authoritative re-spawn (research F2). Either the retry
succeeds and the handler sees normal stdout, or it fails the same way and the
error leaves `invokeCli` before the handler's stage. The stage could not fire
for a closed vault. T0 gate G1 in PR #100 confirmed it live on Obsidian 1.14.5:
each of the six tools, called with the vault closed, returned its normal
result, and the five `eval` tools logged one `dispatch.retry` each.

The six tools' descriptions and reference pages nevertheless documented
`not-open`, and the `smart_connections_*` precedence chains listed it as a
step. Agents were told about a failure they could never see, and nothing
described the one they could: the post-retry error when a vault cannot be
brought up at all, for example because its command-line integration is
disabled.

## Decision

1. **The dispatch layer's cold-start retry is the only closed-vault
   handling.** The six per-tool stages and the `_eval-vault-closed-detection`
   module are deleted, with nothing added in their place (research D1, D2). A
   tool does not inspect stdout for a closed-vault signature of its own.
2. **"Vault unavailable" is the existing error, described.** When the
   authoritative second attempt still answers `Error: Command "<cmd>" not
   found.`, the caller gets that `CLI_REPORTED_ERROR` unchanged, with the
   text in `details.stdout` and no `details.code` or `details.reason`
   (research D3). The six descriptions say so through one shared sentence,
   `closedVaultNote(command)` in `src/tools/_shared.ts`, and the six
   reference pages carry a vault-unavailable row. Recognising it is by the
   stdout signature, which is `COLD_START_PATTERN` in
   `src/cli-adapter/_dispatch.ts`.
3. **An empty answer is still a failure.** With the stage gone, empty stdout
   reaches each handler's existing parse step and fails as
   `CLI_REPORTED_ERROR` with `details.stage: "json-parse"` (research F3). A
   genuine empty result is a success envelope with `count: 0`, so the two
   stay apart.
4. **`not-open` is withdrawn from these tools' documentation**, and from the
   `find_and_replace` and `patch_block` reference pages that also listed it.
   `views_base` keeps its own `BASE_NOT_FOUND` / `not-open` ("no Base is
   focused"), which is a different condition under a different code.

## Alternatives rejected

- **A new sub-reason for the post-retry failure**, such as
  `details.reason: "vault-unavailable"` under an existing code, which ADR-015
  would allow as an additive value. Rejected in clarify Q1: BI-0076 records
  the post-retry envelope as correct and only undescribed, and the sub-reason
  belonged to the BI's other resolution, not the "Retire" one this PR took.
- **Relabelling the cold-start failure in dispatch.** Same ruling, and it
  would change ADR-029's behaviour for every command, `obsidian_exec`
  included, which spec 072 keeps out of scope.
- **A cold-start mapping inside each handler** to replace the stage. Ruled out
  by Q1; it would re-create six copies of a classifier the dispatch layer
  already owns.
- **Keeping the stages "just in case".** That is the dead handling the spec
  retires (FR-005). It also cost a `vaults verbose` spawn on every empty
  answer.
- **Repurposing `not-open` to mean "vault unavailable".** ADR-031 already
  ruled this out for `open_file`: ADR-015's `details.reason` set is additive,
  and a value is retired from emission, not given a new meaning.

## Consequences

- A tool that needs a vault brought up gets it from `invokeCli` with no code
  of its own. A new tool should not add a closed-vault stage; one that does
  is waiting for a signal the shim does not send.
- An agent sees two vault failures, not three: unknown vault (whose wording
  differs between the `eval` tools and `query_base`, a follow-up recorded on
  BI-0076 and left unchanged here) and vault unavailable.
- Vault unavailable has no `details.code`. A client that switches on
  `details.code` cannot tell it apart from other uncoded
  `CLI_REPORTED_ERROR`s and must match `details.stdout`. That is the price
  of adding no code (Q1).
- `query_base` catches `CLI_REPORTED_ERROR` around `invokeCli` and runs its
  own `classifyAndThrow`. None of its patterns matches the cold-start text
  (research F4), and a handler test pins that, so a future classifier entry
  cannot silently capture the vault-unavailable failure.
- ADR-014's precedence chain and ADR-015's worked example still show
  `not-open`. Neither decision is superseded: the plugin lifecycle order and
  the sub-discriminator pattern stand, and only the example state is no longer
  emitted.
- `smart_connections_similar`'s description keeps a "Vault states" sentence
  naming a sub-discriminator that now has one value. The owner chose to leave
  it (PR #100 review, option A) and fold it into the unknown-vault wording
  follow-up.
