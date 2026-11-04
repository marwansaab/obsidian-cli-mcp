# Post-implement: Verify Non-ASCII Handling

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Tasks**: [tasks.md](tasks.md) | **Date**: 2026-11-04

## Gates (quickstart §1, §2)

- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass. 202 test files pass (1 skipped), and the statements floor holds. `src/tools/_non-ascii-checks.ts` has 99.5 % statement coverage, from 58 rows in `_non-ascii-checks.test.ts`.
- `git diff --exit-code src/tools/_register-baseline.json` is clean (SC-006).
- `dist/tools/_non-ascii-checks.js` is absent after the build (refactor-decisions item 30).
- Usage errors: no arguments, equal vault names and an unknown flag each exit 2, with the reason and the usage line on stderr and nothing on stdout. Because the script reached its usage check, Node's type stripping loaded both it and the module without a `SyntaxError` (analyze U1).
- `npm run format:check` fails across the repository (1,501 files) before and after this change. The three new files pass `prettier --check`. `tsconfig.build.json` and `package.json` warn only because the Windows checkout has CRLF line endings; their committed blobs are LF, as `tsconfig.json`'s are.

## Live run (quickstart §3–§5, SC-005)

Evidence: [run-2026-11-04.txt](run-2026-11-04.txt). The owner had not staged a note, so the run went without `--staged-note`, which is also the quickstart §5 deliberate-`BLOCKED` run.

- **Before the run**: `Obsidian.com eval "code=app.vault.getName()"` answered `=> TestVault-Obsidian-CLI-MCP`. I recorded a listing of `Sandbox/` in `TestVault-Obsidian-CLI-MCP` (187 entries, with path, size and modification time) and a listing of the root `*.md` files in `My-Setup-Vault`. `_non-ascii-check/` did not exist in `My-Setup-Vault`.
- **Result**: `summary: 7 pass · 0 fail · 1 blocked`, exit status 0.
  - H1, L1, F1, F2, P1 and P2 are `PASS`.
  - S1 is `BLOCKED` (`precondition: no staged note path given`).
  - S2 is `PASS`, so it was not `BLOCKED` with Smart Connections loaded (SC-007).
  - The report ends `cleanup: removed Sandbox/non-ascii-check-20261104-203449-11a0`.
- **After the run**:
  - Every entry under `Sandbox/` is identical to the pre-state. The only change is the modification time of `Sandbox/` itself, because a child folder was created and then removed.
  - `Welcome.md` is untouched, and the test vault has no `.trash/`.
  - The root `*.md` listing of `My-Setup-Vault` is identical, and `_non-ascii-check/` still does not exist there (SC-004).
- **Follow-up items (FR-015)**: none. No scenario failed.
- **Not yet proven live**: S1's `PASS` branch. It needs an owner-staged, indexed note with a non-ASCII path in `My-Setup-Vault`, and the run will need repeating with `--staged-note "<path>"` once one exists.
- **Evidence capture on Windows**: I captured stdout through a Git Bash redirect, which keeps the bytes. The quickstart §4 command uses a Windows PowerShell 5.1 `>` redirect, which re-encodes native output and would garble the very characters the evidence exists to show. Both the quickstart and the docs-as-code `CONTRIBUTING.md` entry should name a byte-preserving capture, such as `cmd /c "npm run check:non-ascii -- … > run.txt"` or a Bash redirect.

## CodeGraph structural verification (T034, CLAUDE.md)

After `codegraph sync`, I ran `codegraph_explore "_non-ascii-checks parseToolResult renderReport retryUntilPass runChecks SCENARIOS check-non-ascii"`, plus greps:

1. **No new error code or class in `src/`, and no `UpstreamError` construction.** Neither the module nor the script imports `UpstreamError` or `src/errors.ts`. The script declares one local `class ContainmentError extends Error {}`. It is the script's own abort signal for contract §W 2 (a refused fixture write → exit 2). It never reaches a tool result or a published surface, and it lives outside `src/`, so Principle IV's error-code streak is unaffected. The script also builds a local `CALL_FAILED` result when the `vaults` call throws, so that `vaultFacts` can read the message. That code is never printed as a code and is not a project error code.
2. **No file imports `createLogger` or `createQueue`.**
3. **Module placement and imports**: `src/tools/_non-ascii-checks.ts` imports `zod` only and has no relative import. Under `src/`, only its test imports it.
4. **Reachability**: `scripts/check-non-ascii.ts` is the module's production caller. It calls `runChecks`, `renderReport`, `parseToolResult`, `SCENARIOS` and the other exports. CI exercises the module through its co-located test.

**Kernel-node claim (plan "no kernel node touched"): held.**

- `createServer()` gained no in-process caller; the script reaches it only by spawning `dist/index.js`.
- `createLogger()` and `createQueue()` are untouched.
- `UpstreamError` gained no construction site.
- No handler, schema, `src/errors.ts` or baseline file changed.

## Deviations from tasks.md (implementation detail, no contract change)

- **`runChecks` is in the module, not the script.** The scenario loop from T018 (precondition → retried call → classify, a caught throw becomes `FAIL`, and P1's result gates P2) is `runChecks(scenarios, inputs, ctx, call, opts)` in the module. This follows D2, "everything that decides an outcome" belongs in the module, so the P1→P2 hand-off and the independent-outcome rule are unit-tested (T-RETRY). The script passes `client.callTool` in.
- **Scenario inputs are `RunInputs`.** `input(…)`, `expected(…)`, `precondition(ctx, inputs)` and `classify(result, inputs)` take `RunInputs {args, fixtures, missingNote}` instead of the fixtures alone, because S1 and S2 need the staged and missing paths.
- **`SOURCE_MATCH` and `OUTSIDE_MATCH` are fields of `Fixtures`.** They are `fixtures.sourceMatch` and `fixtures.outsideMatch`, not module constants, because their `path` depends on the run folder.
- **`retryUntil` is exported.** The generic `retryUntil(attempt, done, opts)` is exported beside `retryUntilPass`, and the readiness wait uses it.
- **`vaultFacts(result, args)` is in the module.** It holds the `vaults` parsing (T014 and T030's listed and root facts), so it can be tested.
- **Two texts the contract left open**:
  - With no fixture seeded (the test vault is not listed), the cleanup line is `cleanup: nothing seeded`.
  - S2's precondition text for an existing file at the missing-note path is `a file exists at <V root>/<path>`.
- **T-FX1 checks only the missing note's leaf segment.** That leaf must carry a non-ASCII character. The `_non-ascii-check/` folder segment is ASCII by data-model E3.
