# Quickstart: Report Missing Notes on Add-to-Top

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/prepend-not-found-contract.md](contracts/prepend-not-found-contract.md)

## §1 Automated gate

```powershell
npm run typecheck
npm run lint
npm test
```

Expected: all green on Windows and Linux CI.

- `src/tools/prepend/handler.not-found.test.ts` (new) covers, against mocked `invokeCli` and prepend's `fakeFs`:
  - the pre-call check (contract E1, E2, E3, E11): `stat` throws `ENOENT` → `CLI_REPORTED_ERROR` / `NOTE_NOT_FOUND`, `details` exactly `{ code, path, vault }`, the message, `cause` is the fs error, no spawn issued, no write;
  - Obsidian's confirmed wording (E4, E5): `stat` succeeds, stdout `Error: File "<path>" not found.\n` with exit 0 → the same failure, `cause` is the dispatch error, in default and inline mode;
  - parity (E6): the same missing input through `executeAppendNote` and `executePrepend` yields equal `code`, `details` and `message`;
  - the guards (E7 and spec FR-007): `Error: Folder "x" not found.`, `Vault not found.` and a cold-start `Error: Command "prepend" not found.` are not classified as `NOTE_NOT_FOUND`.
- `handler.test.ts` "pre-stat ENOENT → preCallSize defaults to 0, call proceeds and succeeds (FR-016)" is rewritten to expect the missing-note failure with no spawn (research F5); it is the one existing test whose expectation changes.
- Every other test in `handler.test.ts`, and the existing `handler.empty-body.test.ts`, `handler.bi047.test.ts`, `handler.file-type.test.ts` and `_surface.test.ts` pass unchanged (spec SC-004; contract E8–E10).

## §2 Baseline check

```powershell
npm run baseline:write
git diff --exit-code src/tools/_register-baseline.json
```

Expected: no diff (contract §5).

## §3 Live end-to-end check

Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first: `TestVault-Obsidian-CLI-MCP` only, fixtures under `Sandbox/077-<run>/`, never touch `Welcome.md`, and clean up afterwards.

**Open `TestVault-Obsidian-CLI-MCP` in Obsidian before starting.** During the plan-time probe the CLI ran commands against the vault open in Obsidian even when `vault=` named another one (research F2, probe-environment note). Before seeding, confirm the open vault with `obsidian eval code="app.vault.getName()"` (eval runs against the open vault, which is exactly what needs confirming); stop if it does not print `TestVault-Obsidian-CLI-MCP`.

Build with `npm run build`, then drive the built server through an MCP client against that vault:

1. `prepend` `"x"` to `Sandbox/077-<run>/missing.md` (default mode). Expect `CLI_REPORTED_ERROR`, `details: { code: "NOTE_NOT_FOUND", path: "Sandbox/077-<run>/missing.md", vault: "TestVault-Obsidian-CLI-MCP" }`, message `Note "Sandbox/077-<run>/missing.md" not found in vault.` (contract E1).
2. Repeat step 1 with `inline: true` (E2).
3. `append_note` `"x"` to the same path. Expect the same code, `details` and message as step 1 (E6, spec SC-002).
4. Seed `Sandbox/077-<run>/Case.md` (`"abc"`) through `obsidian create` and wait until `obsidian eval` sees it. `prepend` `"y"` to `Sandbox/077-<run>/case.md`. Expect `NOTE_NOT_FOUND` with `path: "Sandbox/077-<run>/case.md"` (E4), and `Case.md` still `"abc"`. On Windows or default macOS the pre-call check finds the file, so this failure comes from Obsidian's report: quote its `cause.details.stdout` (spec FR-009 confirmation in the test vault).
5. List `Sandbox/077-<run>/`: only `Case.md` exists (spec SC-003). Delete it and the run folder.

Report each step's result, quoting the failures verbatim.
