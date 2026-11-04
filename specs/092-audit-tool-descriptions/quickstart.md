# Quickstart: Audit Tool Descriptions

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/description-audit-contract.md](contracts/description-audit-contract.md)

Every scenario here runs in-process. The descriptions change but behaviour does not, so no step invokes the Obsidian CLI, and the vault rules in `.memory/test-execution-instructions.md` do not apply. Run commands in PowerShell from the repository root.

## §0 Approval gate (satisfied 2026-11-04)

Both plan questions were ruled Option A and recorded on BI-0027, in the plan's Owner rulings section and in `.memory/refactor-decisions.md` item 5:

- the test-edit list in contract §X, with its stop rule;
- the closed-vault note under ADR-045 (Amendment 2026-11-04).

Implement edits only the §X rows. Any other failing existing assertion stops the work.

## §1 Baseline-script regression (before any description changes)

```powershell
npm run baseline:write
git diff --stat src/tools/_register-baseline.json
```

Expected after `scripts/_vitest-dump.ts` is extracted (contract A2): no change apart from `generatedAt` and `generatedFromBranch`.

## §2 Standing checks, with red checks

```powershell
npx vitest run src/tools/_description-audit.test.ts src/tools/_description-quality.test.ts
```

Expected: every row in contract §T passes.

Red checks, each applied by hand, run, then reverted:

1. Append 400 characters to `DELETE_DESCRIPTION`. Q1 fails and names `delete (…)`.
2. Add `BI-0001` to any parameter `.describe()`. Q3 fails and names the field path.
3. Change one word of the `read` entry in `docs/tools/index.md`. Q5 fails and names `read`.

## §3 Full gate

```powershell
npm run typecheck
npm run lint
npm test
```

Expected:

- The whole suite passes.
- The only edited existing tests are those in contract §X.
- `_register.test.ts`'s baseline gate passes after `npm run baseline:write`. The regenerated `_register-baseline.json` changes only `descriptionFingerprint` and `schemaFingerprint` values; no title, annotations or output-schema fingerprint moves. Check with `git diff src/tools/_register-baseline.json`.

## §4 Audit report

```powershell
npm run audit:descriptions > $env:TEMP\092-audit.md
```

Expected in `092-audit.md`:

- **Title** names version `0.9.0`, the short SHA, the branch and today's date.
- **Summary:**
  - 35 tools, and the tool-count guard PASS (35 tools = 35 help pages). The guard keeps PASS even when the shell sets `OBSIDIAN_MCP_READ_ONLY` or `OBSIDIAN_MCP_DISABLE`, because the collector ignores the access settings (data-model E1);
  - budgets 400 / 12,000;
  - measured total ≤ 12,000 with PASS;
  - help pointer PASS twice;
  - needs-review count 0 (SC-007).
- **Matrix:** exactly 35 rows with 9 verdict cells each. Every cell is PASS or N/A, except a FAIL or PARTIAL that another open item will fix, whose gap names that item.
  - Family is N/A for `help`, `vaults` and `obsidian_exec`.
  - Shared fields is N/A for every tool that has none of the roster fields.
- **Notes** has an entry for every PASS or N/A cell whose record carries a note, at least `set_property`'s `detail` note on the possibly stale client caveat (spec edge case).
- **Routing walk-through** lists all 15 routing lines, every one PASS (SC-008).

**Needs-review check:** edit one description, run the command again, and check that row's six judgement cells read `NEEDS REVIEW (was …)`. Check also that `npm test` still passes, apart from Q1 to Q5 if the edit broke one of them (Clarification Q4). Then revert.

## §5 Help-index spot check

```powershell
node -e "const t=require('fs').readFileSync('docs/tools/index.md','utf8');console.log(t.split('\n').filter(l=>l.startsWith('- **')).length)"
```

Expected: 35. Every entry's text is one sentence, and no entry contains `BI-`, `FR-`, `ADR-`, `spec ` or `Q1`.

## §6 Structural check (post-implement, per CLAUDE.md)

`codegraph sync`, then `codegraph_explore "collectPublishedSurface renderAuditReport findInternalIds firstSentence buildInstructions HELP_DESCRIPTION"`.

Verify:

1. No error class or code was added (`src/errors.ts` unchanged).
2. No production handler imports `createLogger` / `createQueue`.
3. `_description-audit.ts` is imported only by its two tests and the audit dumper, and it is listed in `tsconfig.build.json`'s exclude.
4. `closedVaultNote` is gone from `src/`, with no orphan imports (plan question 2, ruled A).
