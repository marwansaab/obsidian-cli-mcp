# Quickstart: validating Match literal phrases

**Spec**: [spec.md](spec.md) | **Contract**: [contracts/literal-phrase-contract.md](contracts/literal-phrase-contract.md)

Run everything from the repository root in PowerShell. Vitest does not run under the Bash tool's sandbox; see `.memory/refactor-decisions.md`, Operational gotchas.

## §1. Automated gate (required)

```powershell
npx vitest run src/tools/search src/tools/context_search
npm test
npm run typecheck
npm run lint
```

Expected:

- the new suites pass: `literal-phrase.test.ts` (L1–L8), `search/handler.literal-phrase.test.ts` (S1–S9) and `context_search/handler.literal-phrase.test.ts` (C1–C9);
- both existing `handler.test.ts` files pass, with only the two contract-listed `query=` lines edited;
- `npm test` meets the coverage floor and passes the FR-018 baseline gate.

**Red check** (proves the new tests bite):

1. In both handlers, temporarily set `parameters.query = input.query`. S1 to S3, S8, S9, C1 to C3, C8 and C9 must fail.
2. Restore it, then temporarily skip the `oneMatchPerLine` call. S4 to S7 and C4, C5 and C7 must fail.
3. Restore it.

## §2. Published-surface gate (required)

```powershell
git diff --stat main -- src/tools/_register-baseline.json src/tools/search/schema.ts src/tools/context_search/schema.ts src/tools/search/index.ts src/tools/context_search/index.ts src/errors.ts
```

Expected: no output (contract P1 and P2). Do not run `npm run baseline:write`. If the baseline gate fails, something published changed, and that is a defect against FR-011.

## §3. Live check (required)

This check must pass, with results recorded in `post-implement.md`, before the work is marked complete (research D6, amended by owner ruling 2026-11-02, BI-0169). §1 proves the query sent to the CLI; §3 proves that only exact-phrase notes and lines match (SC-001, SC-003, SC-006).

Read `.memory/test-execution-instructions.md` first. Use only `TestVault-Obsidian-CLI-MCP`, put the fixtures under `Sandbox/087-live-<timestamp>/`, and remove them afterwards.

1. Build: `npm run build`.
2. Create the fixtures from the contract's live column through Obsidian, so that its index sees them. Run one `obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=…app.vault.create(…)…"` per note (research, live probe method). Then confirm that `obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Sandbox/087-live-<timestamp>` lists every note.
3. Through the built server (an MCP client against `node dist/index.js`, or the `obsidian-cli-mcp-local` tools if they point at this build), call:
   - `search` with each live-column query and `folder: "Sandbox/087-live-<timestamp>"`;
   - `context_search` with the same arguments.
4. Compare with the live column. Each line must appear once, and only exact-phrase notes and lines may appear.
5. Remove the fixture folder and confirm that `Welcome.md` is still present.

Report the cases attempted, passed and failed, with verbatim output for any failure, as the instructions require.
