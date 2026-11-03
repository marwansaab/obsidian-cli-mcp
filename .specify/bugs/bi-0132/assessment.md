# Bug Assessment: Disabled Obsidian command line is passed back as a normal result

- **Slug**: bi-0132
- **Created**: 2026-11-04
- **Source**: pasted text (backlog item BI-0132, "Report disabled CLI"; no URL supplied, so the URL trust policy did not apply)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

Condensed from the pasted BI-0132 text:

> When Obsidian's **Command line interface** setting (Settings → General → Advanced) is OFF, every CLI invocation returns `exitCode: 0` with stdout `Command line interface is not enabled. Please turn it on in Settings > General > Advanced.` and **no `Error:` prefix** — so the cli-adapter classifier does not recognise it and the wrapper returns it as a **success envelope**, not an `UpstreamError`.

> Empirically confirmed 2026-05-30: `obsidian_exec files total vault=TestVault-Obsidian-CLI-MCP` with the CLI toggle OFF returned `exitCode: 0` + the not-enabled stdout, no error wrapper. The cold-start retry correctly did NOT fire.

The report's 2026-11-03 re-validation (read-only, against 0.9.0) adds that the defect is wider than `obsidian_exec`: plain typed tools such as `read` return the notice as content, eval-backed typed tools fail with an opaque `CLI_REPORTED_ERROR` at `stage: "json-parse"`, the `vaults` tool would report `{count: 0, vaults: []}`, and named-vault writers would fail with `VALIDATION_ERROR` "Vault … is not registered with Obsidian." The report also notes that the closed-vault guidance in nine tool descriptions and help pages names "its command-line integration is disabled" as an example cause of a failure whose `details.stdout` starts `Error: Command "<cmd>" not found.`, which TC-00495's probe contradicts. BI-0174 item 3 overlaps that correction and should follow this BI's outcome.

The pasted text closes with a `/speckit-specify` prompt ("Report disabled CLI") whose acceptance criteria this assessment treats as the expected behaviour: every operation fails with one distinguishable "command line disabled" failure that tells the user to turn the setting on, the raw passthrough carries Obsidian's original notice in the failure, output that merely contains the words still succeeds, no retries fire, the guidance matches the failure, and turning the setting back on restores normal behaviour in the same session. Out of scope: changing any Obsidian setting, probing the setting before calls, changing how other unopenable vaults are reported, and unrelated help corrections.

## Symptom

With Obsidian's command line switched off, the CLI answers every command with exit code 0 and a one-line notice on stdout. The server classifies exit-0 output only by an `Error:` prefix (plus the facade-level `Vault not found.` rules), so the notice passes as a successful result: raw commands look as if they worked, `read` returns the notice as the note's text, the vault registry parses it as an empty vault list, and eval-backed tools fail with a parse error that hides the cause. Expected: every surface fails with one structured `CLI_REPORTED_ERROR` that names the disabled command line and tells the user to turn it on.

## Reproduction

1. In Obsidian, turn OFF Settings → General → Advanced → **Command line interface** (owner action; see `.memory/test-execution-instructions.md` for the authorised test vault).
2. Call `obsidian_exec({ command: "files", flags: ["total"], vault: "TestVault-Obsidian-CLI-MCP" })`. Observed 2026-05-30: success envelope, `exitCode: 0`, stdout is the notice.
3. Call `read` on any TestVault note. Expected from source (not observed live): success, `content` is the notice.
4. Call `vaults`. Expected from source (not observed live): `{ count: 0, vaults: [] }`.
5. Call `write_note` with `vault: "TestVault-Obsidian-CLI-MCP"` on a fresh server. Expected from source (not observed live): `VALIDATION_ERROR` "Vault "TestVault-Obsidian-CLI-MCP" is not registered with Obsidian." with empty `knownVaults`.
6. Turn the setting back ON.

Resolved (Relay): option A. The fix starts on the source-inferred symptoms for steps 3–5. BI-0132 already marks them "Inferred from the 0.9.0 source, not observed", still requires the fix to "cover every surface, not just `obsidian_exec`", and covers read, vault listing and vault naming in its acceptance criteria. Live validation is the owner step queued in the BI ("Queued — validation needs owner"), not a precondition for the fix. `/speckit-bug-test` runs steps 1–6 live, with the owner toggling the setting, and records the before and after results (see the live-confirmation answer under Open Questions). The verbatim notice is the one the BI records from the 2026-05-30 probe (TC-00495).

## Suspected Code Paths

Every CLI call goes through `dispatchCli` (the architecture test confines it to the two facades), so the gap is one missing classification rule with many symptoms.

- `src/cli-adapter/_dispatch.ts:dispatchOnce()` (exit-0 classification, lines 612–663) — the eval-answer check, priority (b) `error: no active file` and priority (c) `Error:` are the only exit-0 failure rules; anything else resolves at priority (d) as success. The notice has no `Error:` prefix, so it resolves as success. This is the root cause.
- `src/cli-adapter/_dispatch.ts:31` `UNKNOWN_VAULT_ANSWER` and `:133` `COLD_START_PATTERN` — the module that owns the CLI's answer signatures. The notice matches neither, so `isColdStart` stays false and no retry fires (correct, and must remain so).
- `src/cli-adapter/cli-adapter.ts:runTyped()` (lines 132–163) — the typed facade's only post-dispatch rule is the `Vault not found.` start-of-output check, so every typed tool (`invokeCli`, `invokeEval`) receives the notice as stdout.
- `src/cli-adapter/invoke-bounded-cli.ts:invokeBoundedCli()` (lines 73–92) — the raw facade's only post-dispatch rule is the exact `Vault not found.` match on named-vault calls, so `obsidian_exec` returns the notice as success.
- `src/server.ts:100–108` (`createVaultRegistry`'s `invokeProbe`) → `src/vault-registry/registry.ts:parseVaultsVerboseOutput()` (lines 52–66) — skips every line without a tab, so the notice parses to zero entries. `list()` then returns `[]` (`src/tools/vaults/handler.ts:executeVaults`), and `resolveVaultPath()` throws `VALIDATION_ERROR` "is not registered" with empty `knownVaults` (lines 94–101). `src/tools/_active-file.ts:remapVaultNotFound()` then turns that into `CLI_REPORTED_ERROR` `details.code: "VAULT_NOT_FOUND", reason: "unknown"` for find_and_replace and query_base, which is also the wrong cause.
- `src/tools/read/handler.ts:executeReadNote()` (lines 42–59) — returns `exactContent(stdout, disk)`, so the notice comes back as the note's content.
- `src/tools/_active-file.ts:decodeEvalEnvelope()` (lines 67–94) and similar eval decoders — fail with `stage: "json-parse"` on the notice, which hides the cause.
- `src/tools/_shared.ts:closedVaultNote()` (lines 41–43) — the published closed-vault paragraph, used by the descriptions of `bases`, `create_base`, `paths`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`, `tag` and `views_base`, names "its command-line integration is disabled" as a cause of the `Error: Command "<cmd>" not found.` failure. The same claim is in `docs/tools/{bases,create_base,paths,pattern_search,query_base,smart_connections_query,smart_connections_similar,tag}.md`.

Handlers that catch `CLI_REPORTED_ERROR` and reshape it were checked for misclassifying the notice once dispatch rejects it: `create_base` (`/Base file not found/i`), `query_base` `classifyAndThrow` (view/YAML/schema patterns), `views_base` `recogniseFailure` (YAML / not-a-base), `move` `isMissingDestinationFolder` (ENOENT rename) and `_active-file.ts` `FILE_NOT_FOUND_LINE`. None matches the notice, so each rethrows the dispatch error unchanged.

## Root Cause Hypothesis

`dispatchOnce` treats exit-0 output as a failure only when a line starts `Error:` (or the no-active-file phrase). Obsidian's disabled-CLI notice is exit 0 with an unprefixed sentence, so it reaches priority (d) and resolves as success. Each layer above then interprets it as its own normal output: raw text, note content, vault list or eval answer. The `Vault not found.` answer had the same shape and was fixed per facade (BI 011 R5, spec 091). This notice was never given a rule. Confidence: **high** for the mechanism (read directly from the source, and consistent with the 2026-05-30 live observation on `obsidian_exec`). **Medium** for the exact notice wording, which was observed once and is not pinned in this repository.

## CodeGraph structural check

Queried with `codegraph_explore` on `invokeCli`, `invokeBoundedCli`, `runTyped`, `dispatchCli` / `UNKNOWN_VAULT_ANSWER` / `exitZeroDetails`, `createVaultRegistry` / `VaultLister` / `executeVaults`, `executeReadNote` / `remapVaultNotFound`, and `UpstreamError`. `server.ts` was read for the kernel factories and the registry probe.

- **Affected modules**: `src/cli-adapter/` (`_dispatch.ts` gains the rule; the two facades are unchanged), `src/tools/_shared.ts` (the closed-vault description text), `docs/tools/*.md` and the published-surface baseline. `src/vault-registry/registry.ts` and the tool handlers should need no change, because the dispatch rejection reaches them as a thrown `UpstreamError` before they parse anything.
- **Blast radius**: `dispatchCli` is called only by `invokeCli` / `invokeEval` (`cli-adapter.ts`) and `invokeBoundedCli` (`invoke-bounded-cli.ts`), but `invokeCli` sits under every typed tool handler and the vault-registry probe in `server.ts`, and `invokeBoundedCli` under `obsidian_exec`. A new exit-0 rule therefore applies to every CLI call. That reach is intended, so the match must be narrow enough that no real command output trips it (see Risks). Co-located tests at risk: `_dispatch.test.ts`, `invoke-bounded-cli.test.ts`, `cli-adapter.test.ts`, `_plugin-noise.test.ts`. The `closedVaultNote` change reaches the nine tools' `index.test.ts` files, `_shared.test.ts`, and the FR-018 fingerprint baseline (`_register-baseline.json`).
- **Kernel nodes**: the fix does **not** modify `createLogger()`, `createQueue()`, `createServer()` or the `UpstreamError` class. It adds one new `UpstreamError` construction site inside `dispatchOnce`, alongside the existing priority (b) and (c) sites, using the existing `CLI_REPORTED_ERROR` code. No new top-level error code (Principle IV streak preserved). `server.ts` is untouched; the registry probe inherits the rule through `invokeCli`.

## Proposed Remediation

**Preferred**: add one exit-0 classification rule to `dispatchOnce` in `src/cli-adapter/_dispatch.ts`, so both facades, every typed tool, `invokeEval` and the vault-registry probe inherit it from the single primitive they already share.

- Export the verbatim notice from `_dispatch.ts` next to `UNKNOWN_VAULT_ANSWER`, for example `CLI_DISABLED_ANSWER = "Command line interface is not enabled. Please turn it on in Settings > General > Advanced."`, with a doc comment citing the 2026-05-30 probe.
- In `dispatchOnce`, after priority (a) and before the eval-answer check and priority (b), reject when `stdout.trim() === CLI_DISABLED_ANSWER` (the whole output, trimmed, is the notice). Reject with `code: "CLI_REPORTED_ERROR"`, `details: { ...exitZeroDetails({ argv, stdout, stderr }, input.command, <notice>), reason: "cli-disabled" }`, and an actionable `message` such as "Obsidian's command line interface is turned off. Ask the user to turn on Settings > General > Advanced > Command line interface in Obsidian, then call again." `details.stdout` carries Obsidian's original notice, as the raw-passthrough acceptance criterion asks. The `reason` follows ADR-015, and the dispatch-level precedent is `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"`.
- The whole-output match keeps "output that merely contains the words" a success (the BI-0173 / spec 091 false-positive lesson). Because the notice matches neither `COLD_START_PATTERN` nor `isAppNotRunning`, it is single-shot by construction: no cold-start retry, no auto-launch.
- The registry needs no code change. `invokeProbe` rejects, `probe()` resets `inFlightProbe` in its `finally` and leaves the cache unset, so `list()` and `resolveVaultPath()` propagate the cli-disabled error instead of `[]` or `VALIDATION_ERROR`. `remapVaultNotFound` remaps only `VALIDATION_ERROR`, so it rethrows the error unchanged. Recovery after the user turns the setting back on needs no restart, because nothing caches the failure.
- Correct the guidance. In `closedVaultNote` (`src/tools/_shared.ts`) and the matching closed-vault sentence in the eight `docs/tools/*.md` pages, drop "for example, its command-line integration is disabled" as a cause of the `Error: Command "<cmd>" not found.` failure. Then document the cli-disabled failure (`CLI_REPORTED_ERROR`, `details.reason: "cli-disabled"`, original notice in `details.stdout`, remedy: the user turns the setting on) in one canonical place plus pointers: the README errors section that already describes `obsidian-not-running`, and the error tables of `obsidian_exec.md` and `vaults.md`, the two pages whose symptoms were success or an empty list. Regenerate the fingerprint baseline deliberately (`npm run baseline:write`) for the description change. Per CLAUDE.md, BI-0174 item 3 should then follow this outcome.

**Alternatives**:
- *Facade-level rules* (one in `runTyped`, one in `invokeBoundedCli`, as spec 091 did for `Vault not found.`). Rejected: spec 091 kept that answer out of dispatch because the two facades needed different rules, and the typed facade's `details` bytes had to stay stable. Neither applies here: one rule fits every surface, and there are no existing bytes to preserve. Two copies would also duplicate the rule that `refactor-decisions.md` item 50 says to share ("share the literal, never the rule").
- *Prefix match* (`stdout.trimStart().startsWith("Command line interface is not enabled.")`). This tolerates a future change to the notice's second sentence, but it would misclassify a note whose content begins with that sentence. Rejected (see Open Questions, match rule).
- *Pre-flight probe of the setting.* Out of scope per the BI.

**Files likely to change**:
- `src/cli-adapter/_dispatch.ts`
- `src/cli-adapter/_dispatch.test.ts`
- `src/cli-adapter/invoke-bounded-cli.test.ts`
- `src/cli-adapter/cli-adapter.test.ts`
- `src/vault-registry/registry.test.ts` and/or `src/tools/vaults/handler.test.ts`
- `src/tools/_shared.ts` (+ `_shared.test.ts`, and any of the nine `index.test.ts` files that pin the closed-vault sentence)
- `src/tools/_register-baseline.json` (regenerated)
- `docs/tools/{bases,create_base,paths,pattern_search,query_base,smart_connections_query,smart_connections_similar,tag,obsidian_exec,vaults}.md`, `README.md`

**Tests to add or update**:
- `_dispatch.test.ts`: the exact notice (with and without a trailing newline, with CRLF) on exit 0 rejects as `CLI_REPORTED_ERROR` with `details.reason: "cli-disabled"`, `details.stdout` equal to the raw notice, and the actionable message. One spawn only (no cold-start retry, no launch). The rule applies to `eval` as well. Output that contains the notice plus other text, or a line that merely mentions it, still resolves as success. The fixture pins the verbatim upstream string as a single source of truth, like `COLD_START_STDOUT`.
- `invoke-bounded-cli.test.ts`: `obsidian_exec` with and without `vault` gets the failure, not a success envelope.
- `cli-adapter.test.ts`: `invokeCli` and `invokeEval` reject with the same error, and the `Vault not found.` rule is unaffected.
- Registry / `vaults`: a probe that rejects with the cli-disabled error makes `list()` and `resolveVaultPath()` reject with it (not `[]`, not `VALIDATION_ERROR`), and a later successful probe recovers in the same registry instance.
- One typed-tool handler test (for example `read`) showing the failure reaches the tool unchanged, with no content returned.
- Updated assertions for the reworded `closedVaultNote`; the FR-018 baseline is regenerated as a deliberate change.

## Risks & Considerations

- **Notice wording is a single observation.** The exact string comes from one 2026-05-30 probe, recorded in the vault and not in this repo. An Obsidian update or a localised build could change it, and the rule would then silently revert to today's behaviour. That is not worse than today, but it is invisible. The owner-run live check in `/speckit-bug-test` captures the notice and corrects the constant before the PR if it differs (see Open Questions, live confirmation).
- **False positive bound.** With the whole-output match, only output that *is* the notice is misclassified, for example a note whose entire text is that sentence. This is accepted in the same way as the `COLD_START_PATTERN` bounded false positive.
- **Published-surface change.** Rewording `closedVaultNote` moves nine tools' description fingerprints. That is a deliberate FR-018 baseline regeneration, flagged on the PR's MCP Tool Surface Standards line.
- **ADR alignment.** A dispatch-level rule is consistent with ADR-007 (dispatch owns classification) and ADR-015 (`details.reason`). It does not conflict with spec 091 research D1, which concerned the `Vault not found.` answer only. ADR-029's retry predicate is unchanged.
- **Docs overlap with BI-0174 item 3.** The two must not both rewrite the closed-vault example differently.
- No security, migration or performance impact: one string comparison per exit-0 call.

## Open Questions

- **Match rule.** Resolved (Relay): option A, an exact whole-output match: `stdout.trim() === "Command line interface is not enabled. Please turn it on in Settings > General > Advanced."`. The prefix form and the single-line first-sentence form were rejected. BI-0132's plan-stage notes say "Match the exact upstream notice only, so real output that merely contains the words is not misclassified (the BI-0173 false-positive lesson). Add a regression test pinning the exact upstream string.", and the BI's Status section records that string verbatim. The raw facade's `Vault not found.` rule already uses this form (`invoke-bounded-cli.ts:83`).
- **Discriminator shape.** Resolved (Relay): option A, a flat `details.reason: "cli-disabled"` on the dispatch-level `CLI_REPORTED_ERROR`. `details.code: "CLI_DISABLED"` and the combination of both were rejected. The BI allows either form and requires zero new top-level codes. The precedent for a condition detected at dispatch is `CLI_NON_ZERO_EXIT` with `details.reason: "obsidian-not-running"` (`_dispatch.ts:601`; Obsidian CLI MCP - Architecture, app-down recovery), a sub-discriminator per ADR-015. Under ADR-015 the literal is kebab-case and is listed in the per-tool docs, which the guidance changes in the remediation cover.
- **Live confirmation.** Resolved (Relay): option A, a live check in `/speckit-bug-test` only, in one owner toggle session. A T0 capture during the fix and skipping the live check were both rejected. The fix pins the verbatim notice recorded in BI-0132. At test time the owner turns the setting OFF. The run then calls `obsidian_exec`, `read`, `vaults` and one named-vault writer against TestVault-Obsidian-CLI-MCP, and checks that each returns `CLI_REPORTED_ERROR` with `details.reason: "cli-disabled"` and the verbatim notice in `details.stdout`. The owner then turns the setting back ON, and the run checks that the same calls succeed in the same session (Story: recovery). If the captured notice differs from the pinned string, the constant is corrected before the PR.
