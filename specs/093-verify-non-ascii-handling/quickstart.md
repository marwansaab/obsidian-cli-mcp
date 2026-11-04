# Quickstart: Verify Non-ASCII Handling

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/non-ascii-check-contract.md](contracts/non-ascii-check-contract.md)

Read `.memory/test-execution-instructions.md` before §3 and §4. They touch the real `TestVault-Obsidian-CLI-MCP` (writes under `Sandbox/` only) and `My-Setup-Vault` (read-only).

## §1 — In-process gate (CI-equivalent, no Obsidian)

```powershell
npm run lint; if ($?) { npm run typecheck }; if ($?) { npm test }; if ($?) { npm run build }
```

Expected:

- every gate passes;
- the `_non-ascii-checks.test.ts` rows T-FX1 to T-ARGS are green (contract §T);
- the statements coverage floor holds;
- `src/tools/_register-baseline.json` is unchanged (`git diff --exit-code src/tools/_register-baseline.json`);
- `dist/tools/_non-ascii-checks.js` does not exist after the build (check with `ls dist/tools`, refactor-decisions item 30).

## §2 — Usage errors (no Obsidian needed)

```powershell
npm run check:non-ascii                                            # exit 2, usage line
npm run check:non-ascii -- --test-vault A --semantic-vault A       # exit 2, "vault names must differ"
```

Both print a usage line on stderr, nothing on stdout, and write nothing.

## §3 — Preconditions for the live run

1. Obsidian is running. `Obsidian.com eval "code=app.vault.getName()"` answers. Focus is not required, because every call names its vault.
2. `TestVault-Obsidian-CLI-MCP` has a `Sandbox/` folder. Record `Get-ChildItem -Recurse` of `Sandbox/` as the pre-state.
3. `My-Setup-Vault` is open, with Smart Connections loaded and indexed.
4. For S1 only: the owner has staged a note with a non-ASCII path in `My-Setup-Vault`, and Smart Connections has indexed it. Without it, run anyway; S1 must come back `BLOCKED`.

## §4 — Live run (SC-005 evidence)

```powershell
npm run build
npm run check:non-ascii -- --test-vault TestVault-Obsidian-CLI-MCP --semantic-vault My-Setup-Vault --staged-note "<owner's staged path>" > specs/093-verify-non-ascii-handling/run-<date>.txt
```

Expected:

- **Report**: 8 blocks in the order H1, L1, F1, F2, P1, P2, S1, S2, each `PASS`, `FAIL` or `BLOCKED`. A `FAIL` block carries `input`, `expected` and `actual`; a `BLOCKED` block names its precondition.
- **S2**: `PASS` or `FAIL`, never `BLOCKED`, when Smart Connections is loaded (SC-007).
- **Cleanup**: `cleanup: removed Sandbox/non-ascii-check-…`.
- **Test vault after the run**: `Sandbox/` equals the pre-state (SC-004).
- **Semantic vault after the run**: no note changed (SC-004). Before the run, list name, size and last-write time of every `*.md` file in the staged note's folder. After the run, the same listing must be identical, and `_non-ascii-check/` must not exist. Smart Connections' own data files (for example under `.smart-env/`) and Obsidian's `.obsidian/` are excluded, because the plugin and the app rewrite them on their own whenever the vault is open.
- **Exit status**: 0 if no `FAIL`, else 1.

Record the run per spec SC-005:

- keep the output file with the BI's records;
- paste each block into its BI-0087 test-case page;
- open one follow-up item per `FAIL`.

The checks verify. They do not fix (FR-015).

## §5 — The blocked branch on purpose

Run §4 again without `--staged-note`. S1 must come back `BLOCKED` with `precondition: no staged note path given`, and every other block must be unchanged.

## §6 — Red check (the classifiers catch a real mismatch)

This is covered in-process by T-H's NFD row and T-F2's empty-success row. No live mutation of the tools is needed or allowed.

## §7 — Structural check (post-implement)

- `codegraph sync`, then `codegraph_explore "_non-ascii-checks"`. The module has no importer under `src/` apart from its test (the script imports it from outside `src/`), and no relative imports.
- No kernel node gains a caller. No handler, schema or `src/errors.ts` change. No new error code.
