# Bug Fix: Disabled Obsidian command line is passed back as a normal result

- **Slug**: bi-0132
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`dispatchOnce` now has one more exit-0 rule. When the whole trimmed stdout is Obsidian's disabled-command-line notice, the call fails with `CLI_REPORTED_ERROR` and `details.reason: "cli-disabled"`, keeps the original notice in `details.stdout`, and carries a message that tells the user to turn the setting on. Both facades, every typed tool, `invokeEval` and the vault-registry probe pick the rule up from dispatch. The closed-vault guidance no longer names a disabled command line as a cause of the `Error: Command "<cmd>" not found.` failure, and the new failure is documented.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/cli-adapter/_dispatch.ts` | modified | Exports `CLI_DISABLED_ANSWER` next to `UNKNOWN_VAULT_ANSWER`. Adds the cli-disabled rule after priority (a) and before the eval-answer check and priorities (b) and (c). `details` is `exitZeroDetails(…, CLI_DISABLED_ANSWER)` plus `reason: "cli-disabled"`. The header comment gains one sentence. |
| `src/cli-adapter/_dispatch.test.ts` | added tests | New `describe` block "command line interface disabled (BI-0132)" (8 cases). |
| `src/cli-adapter/invoke-bounded-cli.test.ts` | added tests | `obsidian_exec` path with and without `vault` (2 cases). |
| `src/cli-adapter/cli-adapter.test.ts` | added tests | `invokeCli`, `invokeEval`, and the unknown-vault rule unaffected (3 cases). |
| `src/tools/read/handler.test.ts` | added test | The notice fails `read`: no content returned, no disk read. |
| `src/tools/vaults/handler.test.ts` | added test | A probe that rejects with the cli-disabled error: `vaults` and `resolveVaultPath` reject with that same error object, then recover in the same registry instance. Header comment extended. |
| `src/tools/_shared.ts` | modified | `closedVaultNote` drops "— for example, its command-line integration is disabled —". |
| `src/tools/_register-baseline.json` | regenerated | `npm run baseline:write`. This deliberately moves the FR-018 description fingerprints of exactly the nine `closedVaultNote` tools (bases, create_base, paths, pattern_search, query_base, smart_connections_query, smart_connections_similar, tag, views_base), plus `generatedFromBranch`. |
| `docs/tools/{bases,create_base,paths,pattern_search,query_base,smart_connections_query,smart_connections_similar,tag}.md` | modified | Removed the "command-line integration is disabled" example from the closed-vault text and the vault-unavailable rows, and the "(or enable its CLI integration)" remedy. |
| `docs/tools/obsidian_exec.md` | modified | New error-table row for `CLI_REPORTED_ERROR` (`details.reason: "cli-disabled"`). |
| `docs/tools/vaults.md` | modified | New error-roster row for the cli-disabled failure ("an error is returned rather than an empty list"). |
| `README.md` | modified | Errors section: a canonical paragraph on the cli-disabled failure (code, reason, notice in `details.stdout`, no retry, user turns the setting on, no restart needed). |

## Diff Highlights (optional)

```ts
// src/cli-adapter/_dispatch.ts, dispatchOnce, after priority (a)
if (stdout.trim() === CLI_DISABLED_ANSWER) {
  reject(
    new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        ...exitZeroDetails({ argv, stdout, stderr }, input.command, CLI_DISABLED_ANSWER),
        reason: "cli-disabled",
      },
      message:
        "Obsidian's command line interface is turned off. Ask the user to turn on Settings > General > Advanced > Command line interface in Obsidian, then call again.",
    }),
  );
  return;
}
```

## Tests Added or Updated

- `_dispatch.test.ts` › "the fixture is the pinned upstream notice": pins the verbatim TC-00495 string (`CLI_DISABLED_STDOUT`) to `CLI_DISABLED_ANSWER` and shows it does not match `COLD_START_PATTERN`.
- `_dispatch.test.ts` › "the notice with a trailing newline / without a trailing newline / with CRLF → …": exact `code`, `message` and full `details` (`argv`, `command`, raw `stdout`, `stderr`, `exitCode`, `message`, `reason`). Each case spawns once (no cold-start retry) and launches nothing.
- `_dispatch.test.ts` › "applies to eval as well".
- `_dispatch.test.ts` › "output that merely contains the words still succeeds" for three inputs: the notice followed by more output, a line quoting the notice, and text before the notice.
- `invoke-bounded-cli.test.ts` › "obsidian_exec with a vault / without a vault gets the cli-disabled failure …": one spawn, no launch, original notice in `details.stdout`.
- `cli-adapter.test.ts` › `invokeCli` and `invokeEval` reject with the cli-disabled failure (no json-parse of the notice), and "the unknown-vault rule is unaffected".
- `read/handler.test.ts` › "BI-0132 the command-line-disabled notice fails the read …".
- `vaults/handler.test.ts` › "BI-0132: … vaults and a named-vault lookup fail with cli-disabled, then recover in the same session": the probe rejects twice with a cli-disabled `UpstreamError`, both calls reject with that same object (`toBe`), and the third call lists the vault.
- No existing assertion was changed. No existing test pinned the reworded `closedVaultNote` sentence, so only the FR-018 baseline moved.

## Local Verification

- Commands run:
  - `npx vitest run` → 196 files passed, 1 skipped; 4854 tests passed, 6 skipped. Before the baseline regeneration, the only failure was the expected FR-018 "live registry fingerprints match the checked-in baseline".
  - `npm run baseline:write` → wrote 35 entries. The diff is the nine description fingerprints named above plus `generatedFromBranch`.
  - `npx tsc --noEmit` → clean.
  - `npm run lint` → clean (one `import-x/order` error in the new vaults test fixed before this run).
  - `codegraph sync`, then `codegraph_explore` on `CLI_DISABLED_ANSWER`, `dispatchOnce` and `closedVaultNote` (see below).
- Manual checks: none. Per the assessment's live-confirmation ruling, the owner-run live check (setting OFF, then `obsidian_exec`, `read`, `vaults` and one named-vault writer, then ON and recovery) happens in `/speckit-bug-test`. No live CLI call was made during the fix.

## CodeGraph structural verification

1. **No new top-level error codes.** The new failure uses the existing `CLI_REPORTED_ERROR`. No error class was added outside `src/errors.ts`. The rule adds one `UpstreamError` construction site inside `dispatchOnce`, beside priorities (b) and (c). Principle IV streak preserved.
2. **No handler imports the boot-time DI factories.** No production handler changed. `server.ts` is untouched, and the registry probe inherits the rule through `invokeCli`.
3. **Module placement and import direction.** `CLI_DISABLED_ANSWER` lives in `src/cli-adapter/_dispatch.ts`, the module that owns the CLI's answer signatures (`UNKNOWN_VAULT_ANSWER`, `COLD_START_PATTERN`, `APP_NOT_RUNNING_PATTERN`). The tests that import it (`src/tools/read`, `src/tools/vaults`) import downward into `cli-adapter`, as `read/handler.test.ts` already did for `__resetInFlightRegistryForTests`. No upward or cyclic edge.
4. **Reachability.** `CLI_DISABLED_ANSWER` has a production caller (`dispatchOnce`, reached through `dispatchCli` from both facades). `closedVaultNote` keeps its nine tool-description callers.

**Kernel-node claim held.** As `assessment.md` stated, `createLogger()`, `createQueue()`, `createServer()` and the `UpstreamError` class are unmodified. No deviation.

## Deviations from Assessment

- The assessment listed `src/vault-registry/registry.test.ts` **and/or** `src/tools/vaults/handler.test.ts` for the registry case. Only `vaults/handler.test.ts` got the test, at the tool surface; `registry.test.ts` already covers the generic "probe failure propagates, the next call retries" behaviour (its tests 5–7). The test's probe is a stub that rejects with the cli-disabled error, as the assessment describes. The first version wired the probe through the real `invokeCli` by hand-copying `server.ts`'s `invokeProbe`; the PR #137 code-quality review found that this checked a copy of the wiring rather than the wiring itself, and that the classification is already pinned in `cli-adapter.test.ts`, so the review fix replaced it with the stub.
- `_shared.test.ts` and the nine `index.test.ts` files needed no change, because none pins the removed sentence.
- `.docs-as-code/architecture.md:811`, `.docs-as-code/decisions/ADR-045-…md:46` and `CHANGELOG.md:56` still use the "command-line integration is disabled" example. They were not in the assessment's file list and belong to the `/speckit-docs-as-code` pass (see Follow-ups).

## Follow-ups

- `/speckit-bug-test slug=bi-0132`: run the owner toggle session. If the captured notice differs from `CLI_DISABLED_ANSWER`, correct the constant (and `CLI_DISABLED_STDOUT` in `_dispatch.test.ts`) before the PR.
- `/speckit-docs-as-code`: correct `.docs-as-code/architecture.md` (around line 811) and the ADR-045 page (around line 46), which still name a disabled command-line integration as a closed-vault cause, and document the `cli-disabled` reason alongside `obsidian-not-running`. `CHANGELOG.md` line 56 is a historical entry; add a new entry for this fix rather than editing it.
- BI-0174 item 3 should follow this outcome: the closed-vault example is now removed, so it must not be reworded a second way.
- The PR's MCP Tool Surface Standards line should flag the deliberate FR-018 baseline regeneration (nine description fingerprints).
