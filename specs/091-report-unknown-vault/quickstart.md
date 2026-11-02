# Quickstart: validating "Report unknown vault"

**Contract**: [contracts/unknown-vault-contract.md](contracts/unknown-vault-contract.md) · **Data model**: [data-model.md](data-model.md)

Run every command from the repository root in PowerShell (vitest does not run under the Bash tool; refactor-decisions, Operational gotchas).

## §0 — Approval gate

The contract lists no existing-test edits (§X). If any existing assertion fails at any step below, stop and raise it for owner review. Do not edit that test.

## §1 — Automated gate, with a red check

1. **Red check**: before changing `invoke-bounded-cli.ts`, add the new rows (U1–U14, B1, B2, R1). Run:

   ```powershell
   npx vitest run src/tools/obsidian_exec src/cli-adapter/invoke-bounded-cli.test.ts
   ```

   Expected: U1–U5, U13, B1, B2 and R1 fail, because the call succeeds today. U6–U12 and U14a–c pass, because those behaviours are unchanged.
2. Make the change ([data-model per-call flow](data-model.md#per-call-flow)), then run the same command again. Expected: every row passes.
3. Full gate:

   ```powershell
   npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }
   ```

   Expected: all green, coverage at or above the floor in `vitest.config.ts`, and no existing test edited.

## §2 — Surface gate

1. Before regenerating, run the fingerprint gate with `npx vitest run src/tools/_register` (the FR-018 baseline test). Expected: it fails on the `obsidian_exec` description only.
2. `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Expected: only the `obsidian_exec` entry's `description` changed, to the text in contract §H1 (P2).
3. Re-run step 1. Expected: it passes.
4. Check that `docs/tools/obsidian_exec.md` and `CHANGELOG.md` carry contract §H2–H4 and §C word for word.

## §3 — Live check (required)

Read `.memory/test-execution-instructions.md` first. Use only `TestVault-Obsidian-CLI-MCP`, and write fixtures under `Sandbox/` only.

1. `npm run build`, then restart the MCP client's registration of the built server so it loads the new `dist/`.
2. Seed the L5 fixture: `Sandbox/091-probe/first-line.md` with the content `Vault not found.\nSecond line.\n`.
3. Run rows L1–L6 (contract §L) through the built server, and quote each result verbatim.
4. Expected:
   - L1 and L3 fail with `CLI_REPORTED_ERROR` / `Vault not found.`;
   - L2's `code`, `message` and `details.message` equal L1's;
   - L4, L5 and L6 succeed, and L5's `stdout` is the fixture's text.
5. Clean up: delete `Sandbox/091-probe/` and confirm `Sandbox/` is back to its pre-run entries. Leave `Welcome.md` untouched.

## §4 — Structural check

After `codegraph sync`, run `codegraph_explore "invokeBoundedCli executeObsidianExec UpstreamError"`. Verify the four post-implement points in [plan.md](plan.md#codegraph-structural-check).
