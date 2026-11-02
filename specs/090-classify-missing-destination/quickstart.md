# Quickstart: validate the missing-destination classification

**Contract**: [contracts/missing-destination-contract.md](contracts/missing-destination-contract.md) | **Data model**: [data-model.md](data-model.md)

## 0. Before touching tests

The existing-test edits X1–X6 (contract §X) were approved by the owner (option A, 2026-11-02; refactor-decisions item 5). The approval covers those field additions only. If any other existing test fails, stop and raise it.

## 1. Automated gate

From the repository root, in PowerShell (vitest does not run under the Bash tool):

```powershell
npm run typecheck
npm run lint
npx vitest run src/tools/move src/tools/_register.test.ts src/tools/_surface.test.ts src/tools/_plugin-noise.test.ts src/tools/_typed-result-fixtures
npm test
```

Expected:

- Everything passes, and the coverage floor holds.
- In `move/handler.missing-destination.test.ts`, rows M1–M20 pass, and R1 passes in `move/index.test.ts`.
- Every existing suite passes. Edits X1–X6 only add a field, and no other existing test changes.

**Red check**: write the new suite and R1 before changing the handler, and run them against the unchanged handler. Expected results:

- M1–M8 and R1 fail: today the raw ENOENT error comes back with no `details.code`, and with the root in it.
- M9–M12 fail: the root is not rewritten. M18 fails: the raw error comes back instead of the withheld one. M19 fails: the raw ENOENT comes back untyped. M20 fails: the parse-stage stdout keeps the root.
- M14 fails: its contrast half expects M1's `FOLDER_NOT_FOUND`.
- M13 and M15–M17 pass. They are regression rows.

The `vaultRegistry` dependency (D6) is wired first, with no behaviour change (tasks T002–T008), so the suite compiles in the red run.

## 2. Surface gate

```powershell
npx vitest run src/tools/_register-baseline.test.ts   # expected: fails on move.description only (contract P1)
npm run baseline:write
git diff -- src/tools/_register-baseline.json         # expected: only the move description string changes (P2)
npx vitest run src/tools/_register-baseline.test.ts   # expected: passes
git diff --exit-code main -- src/errors.ts src/tools/move/schema.ts   # expected: no output (P3, P4)
```

## 3. Required live check (contract §L)

Read `.memory/test-execution-instructions.md` first.

1. `npm run build`.
2. Record the entry count of `Sandbox/`. It was 13 at plan time.
3. Seed `Sandbox/090-live/Note.md` and a note with a name unique in the vault, for example `Sandbox/090-live/Live090Unique.md`.
4. Through the built server (`node dist/index.js` over stdio, or the rebuilt `obsidian-cli-mcp-local` connection), run L1–L6 with `vault: "TestVault-Obsidian-CLI-MCP"`, then check L7 across every failure payload.
5. After L1–L3 and L5, confirm with `Get-ChildItem -Recurse "…\Sandbox\090-live"` that:
   - no folder was created;
   - `Note.md` is still in place with its seeded content.
6. Remove `Sandbox/090-live/` (including the `Missing/` folder that L4 creates) and any `.trash/` entries from this run. Confirm that the `Sandbox/` entry count matches step 2 and that `Welcome.md` is untouched.
7. Record the cases attempted, passed and failed in `post-implement.md`, with verbatim payloads.

macOS and Linux cannot be checked live on this host. Their ENOENT form is covered by M7 (research F5).
